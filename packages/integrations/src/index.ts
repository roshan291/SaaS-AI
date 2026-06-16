// packages/integrations/src/index.ts
//
// Public surface — every other workspace package imports from here, never
// from a deep path inside src/. Keeps refactors inside the package free of
// blast-radius across the monorepo.

export {
  type PlatformProvider,
  type PlatformSlug,
  type ProviderAccountContext,
  type PublishablePost,
  type PublishResult,
  type TokenExchangeResult,
  type AuthorizeUrlResult
} from "./base-provider";

export { getProvider, listProviders, PROVIDER_SLUGS } from "./registry";
export { encryptSecret, decryptSecret } from "./crypto";
