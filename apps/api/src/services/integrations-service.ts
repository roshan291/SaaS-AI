// apps/api/src/services/integrations-service.ts
//
// Orchestrates the OAuth + connect/disconnect lifecycle for social
// platforms. The actual HTTP calls to providers live in the
// @saas/integrations package; this service handles persistence, token
// encryption, signed-state minting, and per-platform fan-out for publish.

import jwt from "jsonwebtoken";

import {
  SocialAccountRepository,
  PostRepository,
  JobRepository
} from "@saas/db";

import {
  getProvider,
  listProviders,
  encryptSecret,
  type PlatformSlug
} from "@saas/integrations";

import { publishQueue, type PublishJobPayload } from "@saas/queue";

import { Errors } from "../lib/respond";

// Signed state token round-trips through the provider OAuth flow. Carries
// the workspaceId so the public /callback endpoint (which has no Bearer
// token, only the provider's redirect) can resolve the tenant.
// 5 minutes is enough for a human to click "Authorize" and bounce back.
const STATE_TTL_SEC = 300;

interface OAuthState {
  workspaceId: string;
  userId: string;
  platform: PlatformSlug;
  redirectUri: string;
  // PKCE verifier for X; absent for other providers. Embedded here so the
  // server stays stateless and we don't have to lean on Redis for a 5-min
  // session value.
  extra?: Record<string, string>;
}

export class IntegrationsService {
  private get secret(): string {
    const s = process.env.JWT_SECRET;
    if (!s) throw new Error("JWT_SECRET is required to sign OAuth state");
    return s;
  }

  // GET /integrations/providers \u2014 surfaces "which platforms can the user
  // even click Connect on" so the UI can grey out unconfigured ones.
  listAvailable() {
    return listProviders();
  }

  // GET /integrations \u2014 list connected accounts (sans ciphertext).
  async listConnected(workspaceId: string) {
    const rows = await SocialAccountRepository.listByWorkspace(workspaceId);
    return rows.map((row) => {
      const r = row as unknown as {
        _id: unknown;
        platform: string;
        externalAccountId: string;
        externalUsername?: string | null;
        expiresAt?: Date | null;
        scopes?: string[];
        metadata?: Record<string, unknown>;
        connectedByUserId?: string | null;
        createdAt: Date;
        updatedAt: Date;
      };
      return {
        _id: String(r._id),
        platform: r.platform,
        externalAccountId: r.externalAccountId,
        externalUsername: r.externalUsername ?? null,
        expiresAt: r.expiresAt ?? null,
        scopes: r.scopes ?? [],
        metadata: r.metadata ?? {},
        connectedByUserId: r.connectedByUserId ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt
      };
    });
  }

  // GET /integrations/:platform/oauth-url
  // Returns the authorize URL the FE should redirect the user's browser to.
  startOAuth(args: {
    workspaceId: string;
    userId: string;
    platform: PlatformSlug;
  }) {
    const provider = getProvider(args.platform);
    if (!provider.isConfigured()) {
      throw Errors.validation(
        `${provider.displayName} OAuth is not configured on the server`
      );
    }

    const redirectUri = this.callbackUrlFor(args.platform);
    // Generate the authorize URL first so the provider can hand us PKCE
    // extras (X). We then sign those extras into state so the callback
    // can reconstruct them without server-side state.
    const draft = provider.getAuthorizeUrl("PENDING", redirectUri);

    const state = jwt.sign(
      {
        workspaceId: args.workspaceId,
        userId: args.userId,
        platform: args.platform,
        redirectUri,
        extra: draft.extra ?? {}
      } satisfies OAuthState,
      this.secret,
      { expiresIn: STATE_TTL_SEC }
    );

    // Replace the placeholder state with the real signed token.
    const finalUrl = draft.url.replace("state=PENDING", `state=${state}`);
    return { url: finalUrl };
  }

  // GET /integrations/:platform/callback?code=&state=
  // Public-but-stateful: the provider redirects the user's browser here.
  // We verify state (CSRF + workspace binding), exchange code, encrypt
  // tokens, upsert the row, then redirect the browser to the FE settings
  // page with a query-string status flag.
  async handleCallback(args: {
    platform: PlatformSlug;
    code: string;
    state: string;
  }) {
    let decoded: OAuthState;
    try {
      decoded = jwt.verify(args.state, this.secret) as OAuthState;
    } catch {
      throw Errors.validation("OAuth state is invalid or expired");
    }

    if (decoded.platform !== args.platform) {
      throw Errors.validation("OAuth state platform mismatch");
    }

    const provider = getProvider(args.platform);
    const tokens = await provider.exchangeCode(
      args.code,
      decoded.redirectUri,
      decoded.extra
    );

    await SocialAccountRepository.upsertForPlatform(
      decoded.workspaceId,
      args.platform,
      {
        externalAccountId: tokens.externalAccountId,
        externalUsername: tokens.externalUsername ?? null,
        accessTokenCipher: encryptSecret(tokens.accessToken),
        refreshTokenCipher: tokens.refreshToken
          ? encryptSecret(tokens.refreshToken)
          : null,
        expiresAt: tokens.expiresAt ?? null,
        scopes: tokens.scopes ?? [],
        metadata: tokens.metadata ?? {},
        connectedByUserId: decoded.userId
      }
    );

    return {
      workspaceId: decoded.workspaceId,
      platform: args.platform,
      externalUsername: tokens.externalUsername
    };
  }

  async disconnect(workspaceId: string, platform: PlatformSlug) {
    const row = await SocialAccountRepository.disconnect(workspaceId, platform);
    if (!row) throw Errors.notFound("Social account");
    return { platform };
  }

  // Called by PostService.publishPost \u2014 enqueues one BullMQ job per
  // platform the post is targeting, records a DB Job row for each, and
  // seeds the per-platform publishResults map so the UI shows "queued"
  // immediately without a follow-up fetch.
  async fanOutPublish(args: {
    workspaceId: string;
    postId: string;
    platforms: string[];
  }): Promise<Record<string, { jobId: string | null; status: string; error?: string }>> {
    const fanOut: Record<
      string,
      { jobId: string | null; status: string; error?: string }
    > = {};

    for (const slug of args.platforms) {
      const platform = slug as PlatformSlug;

      // Skip platforms with no connected account \u2014 still record the
      // skip so the user sees "not connected" instead of silence.
      const account = await SocialAccountRepository.findByPlatform(
        args.workspaceId,
        platform
      );
      if (!account) {
        fanOut[platform] = {
          jobId: null,
          status: "skipped",
          error: "no_account_connected"
        };
        continue;
      }

      const dbJob = await JobRepository.create({
        workspaceId: args.workspaceId,
        type: `publish-${platform}`,
        status: "queued",
        payload: { postId: args.postId, platform }
      });

      const queueJob = await publishQueue.add(
        `publish-${platform}`,
        {
          dbJobId: String(dbJob._id),
          postId: args.postId,
          workspaceId: args.workspaceId,
          platform
        } satisfies PublishJobPayload
      );

      await JobRepository.update(String(dbJob._id), {
        queueJobId: queueJob.id
      });

      fanOut[platform] = {
        jobId: String(dbJob._id),
        status: "queued"
      };
    }

    // Seed publishResults map so a GET /posts/:id immediately after publish
    // reflects "queued / skipped" for each platform.
    const resultsPatch: Record<string, unknown> = {};
    for (const [platform, info] of Object.entries(fanOut)) {
      resultsPatch[`publishResults.${platform}`] = {
        status: info.status,
        queuedAt: new Date(),
        ...(info.error ? { error: info.error } : {})
      };
    }
    if (Object.keys(resultsPatch).length > 0) {
      await PostRepository.updateByWorkspace(
        args.postId,
        args.workspaceId,
        resultsPatch as Record<string, never>
      );
    }

    return fanOut;
  }

  // Where each provider should redirect after auth. The full URL is built
  // from APP_PUBLIC_API_URL so OAuth apps registered in dev (localhost) and
  // prod (https://yourdomain.com) work without code changes.
  private callbackUrlFor(platform: PlatformSlug): string {
    const base =
      process.env.APP_PUBLIC_API_URL ??
      `http://localhost:${process.env.PORT ?? 4000}`;
    return `${base.replace(/\/$/, "")}/api/v1/integrations/${platform}/callback`;
  }
}

export const integrationsService = new IntegrationsService();
