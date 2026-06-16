// packages/integrations/src/base-provider.ts
//
// Common contract every social-platform provider implements. The publish
// worker and the OAuth controller program against this interface so adding
// a new platform is just "drop a new file under src/<slug>/, register it".

// Platform slugs are kept in lockstep with shared/PLATFORM_SLUGS.
// (We duplicate the literal union here so this package has zero deps on
// @saas/shared and stays portable.)
export type PlatformSlug =
  | "instagram"
  | "facebook"
  | "x"
  | "pinterest"
  | "youtube";

// Subset of the Post document that providers actually need. Pulled out so
// providers don't import the Mongoose model (keeps this package DB-free).
export interface PublishablePost {
  id: string;
  workspaceId: string;
  title?: string | null;
  content: string;
  imageUrl?: string | null;
  // Optional uploaded video asset (Cloudinary secure_url). Required for
  // YouTube, ignored by image-only platforms (IG feed, FB photo, Pinterest
  // pin). When both image and video are present the provider picks the
  // appropriate one for its medium.
  videoUrl?: string | null;
  hashtags?: string[];
}

// Decrypted account context handed to publish() / refresh(). The repository
// is responsible for decryption before invoking the provider.
export interface ProviderAccountContext {
  externalAccountId: string;
  externalUsername?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  // Some platforms (Facebook page-scoped tokens, Pinterest board IDs) need
  // extra per-account metadata that doesn't fit the standard OAuth shape.
  metadata?: Record<string, unknown>;
}

// Result returned by exchangeCode() — fed straight into the repository
// after re-encryption. expiresAt is optional because some platforms (X user
// access tokens, classic FB page tokens) are long-lived.
export interface TokenExchangeResult {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  externalAccountId: string;
  externalUsername?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}

// Result of a successful publish — written to Post.publishResults[$platform]
// so the UI can deep-link to the live post on the destination network.
export interface PublishResult {
  externalId: string;
  externalUrl?: string | null;
  publishedAt: Date;
  raw?: unknown;
}

// Optional opaque payload returned by getAuthorizeUrl(). Providers that need
// PKCE (X/Twitter) stash the code_verifier here so the OAuth callback can
// retrieve it via signed state.
export interface AuthorizeUrlResult {
  url: string;
  // Will be embedded in the signed `state` parameter and returned to the
  // callback verbatim. Used by X for PKCE; empty for everyone else.
  extra?: Record<string, string>;
}

export interface PlatformProvider {
  readonly slug: PlatformSlug;
  readonly displayName: string;

  // True if the env vars for this platform are configured. Surfaced in the
  // UI so we can grey out "Connect" buttons that would fail anyway.
  isConfigured(): boolean;

  // Build the provider's OAuth 2 authorize URL. `state` is a signed JWT we
  // round-trip for CSRF + workspace binding; the provider just appends it.
  // Throws if isConfigured() is false.
  getAuthorizeUrl(state: string, redirectUri: string): AuthorizeUrlResult;

  // Exchange the `code` from the callback for tokens + account metadata.
  // Implementations should throw a descriptive Error on non-2xx so the
  // API route can surface a useful message to the user.
  exchangeCode(
    code: string,
    redirectUri: string,
    extra?: Record<string, string>
  ): Promise<TokenExchangeResult>;

  // Publish a single post on behalf of the connected account. The worker
  // handles per-platform fan-out (one job per platform), so providers
  // implement the single-target case only.
  publish(
    account: ProviderAccountContext,
    post: PublishablePost
  ): Promise<PublishResult>;
}

// Tiny helper used by providers that need to call REST endpoints. Centralises
// the "non-2xx → Error with body" pattern so each provider isn't 20 lines of
// try/catch boilerplate.
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { errorPrefix?: string } = {}
): Promise<T> {
  const { errorPrefix = "Upstream call failed", ...rest } = init;
  const res = await fetch(url, rest);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Leave as raw text; some endpoints return form-encoded errors.
  }
  if (!res.ok) {
    throw new Error(
      `${errorPrefix} (HTTP ${res.status}): ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }
  return body as T;
}
