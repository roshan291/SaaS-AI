// packages/integrations/src/pinterest/pinterest-provider.ts
//
// Pinterest API v5 (OAuth 2.0). Pins must belong to a board, so we connect
// the user, list their boards, pick the first as the default destination,
// and store its id in metadata for later publishes.
//
// Pinterest *requires* an image for every Pin — no text-only pins exist.
//
// Docs:
//   https://developers.pinterest.com/docs/api/v5/
//   POST /v5/pins  { board_id, title, description, media_source }

import {
  fetchJson,
  type AuthorizeUrlResult,
  type PlatformProvider,
  type ProviderAccountContext,
  type PublishablePost,
  type PublishResult,
  type TokenExchangeResult
} from "../base-provider";

const AUTH_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const API_BASE = "https://api.pinterest.com/v5";

const SCOPES = [
  "boards:read",
  "pins:read",
  "pins:write",
  "user_accounts:read"
].join(",");

export class PinterestProvider implements PlatformProvider {
  readonly slug = "pinterest" as const;
  readonly displayName = "Pinterest";

  isConfigured(): boolean {
    return Boolean(
      process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET
    );
  }

  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult {
    if (!this.isConfigured()) {
      throw new Error("Pinterest OAuth is not configured");
    }
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", process.env.PINTEREST_APP_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<TokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new Error("Pinterest OAuth is not configured");
    }

    const basic = Buffer.from(
      `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
    ).toString("base64");

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
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
      errorPrefix: "Pinterest token exchange"
    });

    // Identify user account (for UI label).
    const me = await fetchJson<{
      username: string;
      account_type: string;
    }>(`${API_BASE}/user_account`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      errorPrefix: "Pinterest /user_account"
    });

    // First board → default publish destination. Users can later select a
    // different board from the UI; we only store one default for the POC.
    const boards = await fetchJson<{
      items: Array<{ id: string; name: string }>;
    }>(`${API_BASE}/boards?page_size=25`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      errorPrefix: "Pinterest /boards"
    });
    const defaultBoard = boards.items[0];
    if (!defaultBoard) {
      throw new Error(
        "Pinterest account has no boards. Create at least one board, then reconnect."
      );
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      externalAccountId: me.username,
      externalUsername: me.username,
      scopes: token.scope?.split(",") ?? SCOPES.split(","),
      metadata: {
        defaultBoardId: defaultBoard.id,
        defaultBoardName: defaultBoard.name,
        accountType: me.account_type
      }
    };
  }

  async publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult> {
    if (!post.imageUrl) {
      throw new Error("Pinterest requires an image for every Pin");
    }
    const boardId = account.metadata?.defaultBoardId as string | undefined;
    if (!boardId) {
      throw new Error(
        "No default Pinterest board on this account — reconnect to refresh boards"
      );
    }

    const title = post.title?.slice(0, 100) ?? "Untitled";
    const description = [post.content, (post.hashtags ?? []).join(" ")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 800);

    const result = await fetchJson<{
      id: string;
      url?: string;
    }>(`${API_BASE}/pins`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        board_id: boardId,
        title,
        description,
        media_source: {
          source_type: "image_url",
          url: post.imageUrl
        }
      }),
      errorPrefix: "Pinterest create pin"
    });

    return {
      externalId: result.id,
      externalUrl: result.url ?? `https://www.pinterest.com/pin/${result.id}/`,
      publishedAt: new Date(),
      raw: result
    };
  }
}
