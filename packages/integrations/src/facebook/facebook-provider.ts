// packages/integrations/src/facebook/facebook-provider.ts
//
// Facebook Page publishing (Meta Graph API). "Meta" in the user's request
// maps cleanly to: connect a Meta user → discover their Pages → post to the
// first/selected Page on their behalf using the Page Access Token.
//
// We deliberately reuse the same OAuth dialog as Instagram, with different
// scopes, because both flow through the Facebook Login product. A single
// Meta connection therefore could power both providers, but we keep
// SocialAccount rows per-platform so the UI stays simple ("Facebook —
// connected" / "Instagram — connected" are separate toggles).
//
// Docs:
//   https://developers.facebook.com/docs/pages/publishing
//   POST /{page-id}/feed         — text/link posts
//   POST /{page-id}/photos       — image posts

import {
  fetchJson,
  type AuthorizeUrlResult,
  type PlatformProvider,
  type ProviderAccountContext,
  type PublishablePost,
  type PublishResult,
  type TokenExchangeResult
} from "../base-provider";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v21.0";
const FB_OAUTH_BASE = "https://www.facebook.com";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management"
].join(",");

export class FacebookProvider implements PlatformProvider {
  readonly slug = "facebook" as const;
  readonly displayName = "Facebook";

  isConfigured(): boolean {
    return Boolean(
      process.env.META_APP_ID && process.env.META_APP_SECRET
    );
  }

  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult {
    if (!this.isConfigured()) {
      throw new Error("Facebook (Meta) OAuth is not configured");
    }
    const url = new URL(`${FB_OAUTH_BASE}/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", process.env.META_APP_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    return { url: url.toString() };
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<TokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new Error("Facebook (Meta) OAuth is not configured");
    }

    // Same short→long token upgrade as Instagram.
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const shortToken = await fetchJson<{ access_token: string }>(
      tokenUrl.toString(),
      { errorPrefix: "Facebook token exchange" }
    );

    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    longUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);

    const longToken = await fetchJson<{
      access_token: string;
      expires_in?: number;
    }>(longUrl.toString(), { errorPrefix: "Facebook long-lived token" });

    // Pick the first Page the user manages. Production should let the user
    // choose if they admin multiple Pages.
    const pagesUrl = new URL(`${GRAPH_BASE}/me/accounts`);
    pagesUrl.searchParams.set("access_token", longToken.access_token);
    pagesUrl.searchParams.set("fields", "id,name,access_token,category");
    const pages = await fetchJson<{
      data: Array<{
        id: string;
        name: string;
        access_token: string;
      }>;
    }>(pagesUrl.toString(), { errorPrefix: "Facebook /me/accounts" });

    const page = pages.data[0];
    if (!page) {
      throw new Error(
        "No Facebook Pages found for this Meta user. Create or get added to a Page in business.facebook.com first."
      );
    }

    return {
      accessToken: page.access_token,
      refreshToken: null,
      // Page tokens derived from long-lived user tokens are effectively
      // non-expiring; leave expiresAt null so the UI never red-flags them.
      expiresAt: null,
      externalAccountId: page.id,
      externalUsername: page.name,
      scopes: SCOPES.split(","),
      metadata: { pageId: page.id, pageName: page.name }
    };
  }

  async publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult> {
    const message = [post.content, (post.hashtags ?? []).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    // Photos endpoint when an image is attached, /feed otherwise. Both
    // accept the same `message` field for the caption.
    const endpoint = post.imageUrl
      ? `${GRAPH_BASE}/${account.externalAccountId}/photos`
      : `${GRAPH_BASE}/${account.externalAccountId}/feed`;

    const body = new URLSearchParams({
      message,
      access_token: account.accessToken
    });
    if (post.imageUrl) body.set("url", post.imageUrl);

    const result = await fetchJson<{
      id: string;
      post_id?: string;
    }>(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      errorPrefix: "Facebook publish"
    });

    // For photo uploads, `post_id` is the wall-post id (preferred for the
    // public URL); fall back to `id` for text-only /feed posts.
    const externalId = result.post_id ?? result.id;
    return {
      externalId,
      externalUrl: `https://www.facebook.com/${externalId}`,
      publishedAt: new Date(),
      raw: result
    };
  }
}
