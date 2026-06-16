// packages/integrations/src/instagram/instagram-provider.ts
//
// Instagram Graph API (Business / Creator accounts only — Personal accounts
// cannot publish via API).
//
// Publishing is a two-step "container then publish" dance:
//   1. POST /{ig-user-id}/media  { image_url, caption } → returns container id
//   2. POST /{ig-user-id}/media_publish { creation_id } → returns media id
//
// Requirements baked into the env at OAuth time:
//   * The connected Facebook user must own (or admin) a Page
//   * The Page must be linked to an Instagram Business account
//   * Scopes: instagram_basic, instagram_content_publish, pages_show_list,
//     pages_read_engagement, business_management
//
// Docs:
//   https://developers.facebook.com/docs/instagram-api/guides/content-publishing
//   https://developers.facebook.com/docs/facebook-login/guides/access-tokens

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
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management"
].join(",");

export class InstagramProvider implements PlatformProvider {
  readonly slug = "instagram" as const;
  readonly displayName = "Instagram";

  isConfigured(): boolean {
    return Boolean(
      process.env.META_APP_ID && process.env.META_APP_SECRET
    );
  }

  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult {
    if (!this.isConfigured()) {
      throw new Error("Instagram (Meta) OAuth is not configured");
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
      throw new Error("Instagram (Meta) OAuth is not configured");
    }

    // Step 1: short-lived user token
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const shortToken = await fetchJson<{
      access_token: string;
      expires_in?: number;
    }>(tokenUrl.toString(), { errorPrefix: "Instagram token exchange" });

    // Step 2: upgrade to long-lived (~60d) user token
    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", process.env.META_APP_ID!);
    longUrl.searchParams.set("client_secret", process.env.META_APP_SECRET!);
    longUrl.searchParams.set("fb_exchange_token", shortToken.access_token);

    const longToken = await fetchJson<{
      access_token: string;
      expires_in?: number;
    }>(longUrl.toString(), {
      errorPrefix: "Instagram long-lived token upgrade"
    });

    // Step 3: find the first Page the user manages that has an IG account
    const pagesUrl = new URL(`${GRAPH_BASE}/me/accounts`);
    pagesUrl.searchParams.set("access_token", longToken.access_token);
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account"
    );
    const pages = await fetchJson<{
      data: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    }>(pagesUrl.toString(), { errorPrefix: "Instagram /me/accounts" });

    const igPage = pages.data.find((p) => p.instagram_business_account?.id);
    if (!igPage) {
      throw new Error(
        "No Instagram Business account linked to any Facebook Page on this Meta user. Connect a Page → IG Business account first."
      );
    }

    const expiresAt = longToken.expires_in
      ? new Date(Date.now() + longToken.expires_in * 1000)
      : null;

    return {
      // We persist the *Page* access token (long-lived, never expires when
      // derived from a long-lived user token). publish() needs the page
      // token to act on behalf of the linked IG account.
      accessToken: igPage.access_token,
      refreshToken: null,
      expiresAt,
      externalAccountId: igPage.instagram_business_account!.id,
      externalUsername: igPage.name,
      scopes: SCOPES.split(","),
      metadata: {
        pageId: igPage.id,
        pageName: igPage.name
      }
    };
  }

  async publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult> {
    if (!post.imageUrl) {
      throw new Error(
        "Instagram requires an image — text-only posts are not supported by the Graph API"
      );
    }

    const caption = [post.content, (post.hashtags ?? []).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    // Step 1: media container
    const containerUrl = new URL(
      `${GRAPH_BASE}/${account.externalAccountId}/media`
    );
    containerUrl.searchParams.set("image_url", post.imageUrl);
    containerUrl.searchParams.set("caption", caption);
    containerUrl.searchParams.set("access_token", account.accessToken);

    const container = await fetchJson<{ id: string }>(containerUrl.toString(), {
      method: "POST",
      errorPrefix: "Instagram media container"
    });

    // Step 2: publish container
    const publishUrl = new URL(
      `${GRAPH_BASE}/${account.externalAccountId}/media_publish`
    );
    publishUrl.searchParams.set("creation_id", container.id);
    publishUrl.searchParams.set("access_token", account.accessToken);

    const published = await fetchJson<{ id: string }>(publishUrl.toString(), {
      method: "POST",
      errorPrefix: "Instagram media_publish"
    });

    return {
      externalId: published.id,
      externalUrl: `https://www.instagram.com/p/${published.id}/`,
      publishedAt: new Date(),
      raw: { containerId: container.id, mediaId: published.id }
    };
  }
}
