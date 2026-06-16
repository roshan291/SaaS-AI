// packages/integrations/src/x/x-provider.ts
//
// X (Twitter) v2 API. Uses OAuth 2.0 Authorization Code with PKCE — X
// rejects the classic client-secret-only flow for user contexts.
//
// PKCE flow:
//   1. Client generates code_verifier (random) + code_challenge (S256 hash)
//   2. Sends user to /authorize with code_challenge
//   3. On callback, sends `code` + the original code_verifier to /token
//
// We round-trip code_verifier inside the signed `state` JWT (see
// integrations service) so the API process stays stateless.
//
// Docs:
//   https://docs.x.com/resources/fundamentals/authentication/oauth-2-0/authorization-code
//   https://docs.x.com/x-api/posts/creation-of-a-post
//
// NOTE: Media upload uses the v1.1 media/upload endpoint (v2 still has no
// stable media endpoint as of 2026). For the POC we publish text + a link to
// the image URL when present; full media upload is a follow-up.

import { createHash, randomBytes } from "node:crypto";
import {
  fetchJson,
  type AuthorizeUrlResult,
  type PlatformProvider,
  type ProviderAccountContext,
  type PublishablePost,
  type PublishResult,
  type TokenExchangeResult
} from "../base-provider";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWEET_URL = "https://api.x.com/2/tweets";
const ME_URL = "https://api.x.com/2/users/me";

const SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access"
].join(" ");

function base64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class XProvider implements PlatformProvider {
  readonly slug = "x" as const;
  readonly displayName = "X (Twitter)";

  isConfigured(): boolean {
    return Boolean(
      process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET
    );
  }

  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult {
    if (!this.isConfigured()) {
      throw new Error("X (Twitter) OAuth is not configured");
    }

    // PKCE: generate a fresh verifier per authorize call. Persist it via
    // the `extra` field so the integrations-service embeds it inside the
    // signed state JWT for the callback to consume.
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());

    const url = new URL(AUTH_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", process.env.X_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");

    return {
      url: url.toString(),
      extra: { code_verifier: verifier }
    };
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    extra?: Record<string, string>
  ): Promise<TokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new Error("X (Twitter) OAuth is not configured");
    }
    const verifier = extra?.code_verifier;
    if (!verifier) {
      throw new Error("X OAuth callback missing code_verifier in state");
    }

    // Confidential client → Basic auth header with client_id:client_secret.
    // Public clients use the body fields instead, but we have a secret so we
    // use Basic per X's recommendation for server-side apps.
    const basic = Buffer.from(
      `${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: process.env.X_CLIENT_ID!
    });

    const token = await fetchJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body,
      errorPrefix: "X token exchange"
    });

    // Fetch the authenticated user so we can label the account in the UI.
    const me = await fetchJson<{
      data: { id: string; name: string; username: string };
    }>(ME_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      errorPrefix: "X /users/me"
    });

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      externalAccountId: me.data.id,
      externalUsername: me.data.username,
      scopes: token.scope?.split(" ") ?? SCOPES.split(" "),
      metadata: { displayName: me.data.name }
    };
  }

  async publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult> {
    // X caps tweet text at 280 chars (free tier). We collapse content +
    // hashtags + an optional image URL and trim if needed.
    const parts = [post.content];
    if (post.hashtags?.length) parts.push(post.hashtags.join(" "));
    if (post.imageUrl) parts.push(post.imageUrl);
    let text = parts.filter(Boolean).join("\n\n");
    if (text.length > 280) {
      text = `${text.slice(0, 277)}...`;
    }

    const result = await fetchJson<{
      data: { id: string; text: string };
    }>(TWEET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text }),
      errorPrefix: "X create tweet"
    });

    const username = account.externalUsername ?? "i";
    return {
      externalId: result.data.id,
      externalUrl: `https://x.com/${username}/status/${result.data.id}`,
      publishedAt: new Date(),
      raw: result
    };
  }
}
