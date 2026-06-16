// packages/integrations/src/youtube/youtube-provider.ts
//
// YouTube Data API v3 (Google OAuth 2.0).
//
// YouTube only natively publishes *videos*. For a text/image post we map to
// a "Community Post" — but that endpoint is gated and only available to
// channels with >500 subs. So we implement the **video upload** path
// (the most common YouTube use-case) and surface a clear error when the
// source Post has no video attached.
//
// Upload flow (resumable, single-shot):
//   1. POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
//      with metadata in the body → server returns the upload session URL in
//      the `Location` response header.
//   2. Fetch the source video bytes from Cloudinary (the URL we stored on
//      Post.videoUrl) into memory.
//   3. PUT those bytes to the session URL → returns the created video
//      resource with the public YouTube id.
//
// We load the full video into memory (Buffer) rather than streaming chunks
// because (a) Cloudinary already caps us at 100 MB which a worker can
// comfortably hold, and (b) chunked resumable uploads add a lot of
// bookkeeping for marginal benefit at this scale. If/when we lift the
// upload cap we can switch step 3 to chunked PUTs against the same URL.
//
// Docs:
//   https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps
//   https://developers.google.com/youtube/v3/docs/videos/insert
//   https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
//
// SCOPES: youtube.upload covers video uploads; youtube.readonly lets us
// fetch the channel info for the UI label.

import {
  fetchJson,
  type AuthorizeUrlResult,
  type PlatformProvider,
  type ProviderAccountContext,
  type PublishablePost,
  type PublishResult,
  type TokenExchangeResult
} from "../base-provider";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly"
].join(" ");

// YouTube hard limits — enforced client-side so we fail fast with a clear
// error message instead of letting the API return an opaque 400.
const MAX_TITLE_LEN = 100;
const MAX_DESCRIPTION_LEN = 5000;
// "People & Blogs" — safe default that exists in every region. Users can
// re-categorise on youtube.com after publish.
const DEFAULT_CATEGORY_ID = "22";

export class YouTubeProvider implements PlatformProvider {
  readonly slug = "youtube" as const;
  readonly displayName = "YouTube";

  isConfigured(): boolean {
    return Boolean(
      process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET
    );
  }

  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult {
    if (!this.isConfigured()) {
      throw new Error("YouTube (Google) OAuth is not configured");
    }
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", process.env.YOUTUBE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<TokenExchangeResult> {
    if (!this.isConfigured()) {
      throw new Error("YouTube (Google) OAuth is not configured");
    }

    const body = new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    });

    const token = await fetchJson<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    }>(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      errorPrefix: "YouTube token exchange"
    });

    // mine=true returns the YT channel owned by the authenticated user.
    const channels = await fetchJson<{
      items?: Array<{
        id: string;
        snippet: { title: string; customUrl?: string };
      }>;
    }>(`${API_BASE}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      errorPrefix: "YouTube /channels"
    });

    const channel = channels.items?.[0];
    if (!channel) {
      throw new Error(
        "No YouTube channel found on this Google account. Create a channel first."
      );
    }

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      externalAccountId: channel.id,
      externalUsername: channel.snippet.customUrl ?? channel.snippet.title,
      scopes: token.scope?.split(" ") ?? SCOPES.split(" "),
      metadata: { channelTitle: channel.snippet.title }
    };
  }

  // Exchange the long-lived refresh_token for a fresh 1-hour access_token.
  // Google access tokens expire after ~60 minutes; the refresh_token we
  // captured at OAuth time (access_type=offline + prompt=consent) keeps
  // working until the user revokes consent. Calling this every publish
  // adds one cheap HTTP round-trip but eliminates "401 Invalid Credentials"
  // failures from stale tokens with zero schema/worker changes.
  private async refreshAccessToken(refreshToken: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("YouTube (Google) OAuth is not configured");
    }
    const body = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    });
    const token = await fetchJson<{
      access_token: string;
      expires_in?: number;
    }>(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      errorPrefix: "YouTube token refresh"
    });
    return token.access_token;
  }

  async publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult> {
    if (!post.videoUrl) {
      throw new Error(
        "YouTube publishing requires a video attachment — attach a video to this post and try again."
      );
    }

    // Always refresh before publishing. The access token in the DB is
    // almost certainly stale (1h lifetime) and the refresh call is free.
    if (!account.refreshToken) {
      throw new Error(
        "YouTube account has no refresh token — disconnect and reconnect YouTube to re-grant offline access."
      );
    }
    const freshAccessToken = await this.refreshAccessToken(account.refreshToken);

    // ── Build the snippet/status metadata ────────────────────────────────
    // YouTube uses `snippet.title` (max 100) and `snippet.description`
    // (max 5000). We pull the title from the post and fall back to a
    // truncated content excerpt; the description is content + hashtags
    // appended on a new line so hashtags also work as in-description tags.
    const title = (post.title?.trim() || post.content.split("\n")[0] || "Untitled video")
      .slice(0, MAX_TITLE_LEN);

    const hashtagLine =
      post.hashtags && post.hashtags.length > 0
        ? "\n\n" + post.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
        : "";
    const description = (post.content + hashtagLine).slice(0, MAX_DESCRIPTION_LEN);

    // YouTube `tags` are a separate searchable field (max 500 chars total).
    // Strip leading '#' because tags are stored without it.
    const tags = (post.hashtags ?? [])
      .map((h) => h.replace(/^#/, "").trim())
      .filter(Boolean)
      .slice(0, 20);

    const metadata = {
      snippet: {
        title,
        description,
        tags,
        categoryId: DEFAULT_CATEGORY_ID
      },
      status: {
        // "public" so the user immediately sees the upload live on their
        // channel. They can flip to private/unlisted from YouTube Studio.
        privacyStatus: "public",
        // Required since 2020 — we surface this as "not for kids" by
        // default since this is a B2B marketing tool. Users can change
        // per-video on youtube.com.
        selfDeclaredMadeForKids: false
      }
    };

    // ── Step 1: download the source video into memory ───────────────────
    // Doing this first means if the asset is missing/expired/the wrong
    // type we fail before opening an upload session on YouTube (which
    // would otherwise leave a dangling resumable session for ~1 week).
    const videoRes = await fetch(post.videoUrl);
    if (!videoRes.ok) {
      throw new Error(
        `Failed to fetch source video (HTTP ${videoRes.status}): ${post.videoUrl}`
      );
    }

    // Validate the response actually IS a video. If the user pasted a page
    // URL (a YouTube/TikTok share link, a Cloudinary URL with a stripped
    // file extension, etc.) the server will return text/html and YouTube
    // will reject the upload with a confusing "media type … not supported"
    // error. Catch it here with a message that explains the actual problem.
    const rawMime = videoRes.headers.get("content-type") ?? "";
    const videoMime = rawMime.split(";")[0].trim().toLowerCase() || "video/mp4";
    if (!videoMime.startsWith("video/")) {
      throw new Error(
        `Source URL is not a video file (server returned "${videoMime}"). ` +
          `Use a direct link to a raw video file (e.g. ending in .mp4). ` +
          `Page URLs like youtube.com/watch?v=… or tiktok.com/@user/video/… ` +
          `won't work — those are HTML pages, not video files. URL: ${post.videoUrl}`
      );
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    if (videoBuffer.length === 0) {
      throw new Error(
        `Source video is empty (0 bytes). URL: ${post.videoUrl}`
      );
    }

    // ── Step 2: initiate the resumable upload session ────────────────────
    // The X-Upload-Content-* headers tell YouTube what we'll be PUTting
    // next so it can validate Content-Length up-front.
    const initRes = await fetch(
      `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${freshAccessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": videoMime,
          "X-Upload-Content-Length": String(videoBuffer.length)
        },
        body: JSON.stringify(metadata)
      }
    );
    if (!initRes.ok) {
      const errText = await initRes.text();
      throw new Error(
        `YouTube resumable init failed (HTTP ${initRes.status}): ${errText}`
      );
    }
    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      throw new Error(
        "YouTube resumable init returned no Location header — cannot continue upload"
      );
    }

    // ── Step 3: PUT the bytes to the session URL ─────────────────────────
    // Single-shot upload (no chunking). On success YouTube returns the
    // full video resource so we can extract the public id + URL.
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": videoMime,
        "Content-Length": String(videoBuffer.length)
      },
      body: videoBuffer
    });
    const uploadBodyText = await uploadRes.text();
    if (!uploadRes.ok) {
      throw new Error(
        `YouTube video upload failed (HTTP ${uploadRes.status}): ${uploadBodyText}`
      );
    }

    let video: {
      id: string;
      snippet?: { publishedAt?: string };
    };
    try {
      video = JSON.parse(uploadBodyText);
    } catch {
      throw new Error(
        `YouTube returned a non-JSON upload response: ${uploadBodyText.slice(0, 200)}`
      );
    }

    if (!video.id) {
      throw new Error(
        `YouTube upload succeeded but no video id returned: ${uploadBodyText.slice(0, 200)}`
      );
    }

    return {
      externalId: video.id,
      externalUrl: `https://www.youtube.com/watch?v=${video.id}`,
      publishedAt: video.snippet?.publishedAt
        ? new Date(video.snippet.publishedAt)
        : new Date(),
      raw: video
    };
  }
}
