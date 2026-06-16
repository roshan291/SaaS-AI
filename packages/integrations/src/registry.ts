// packages/integrations/src/registry.ts
//
// Slug → provider singleton lookup. Keeps the rest of the codebase from
// importing concrete provider classes by name — the API service and the
// publish worker both ask the registry, so adding a new platform is a
// one-line registration here.

import { FacebookProvider } from "./facebook/facebook-provider";
import { InstagramProvider } from "./instagram/instagram-provider";
import { PinterestProvider } from "./pinterest/pinterest-provider";
import { XProvider } from "./x/x-provider";
import { YouTubeProvider } from "./youtube/youtube-provider";
import type { PlatformProvider, PlatformSlug } from "./base-provider";

const providers: Record<PlatformSlug, PlatformProvider> = {
  instagram: new InstagramProvider(),
  facebook: new FacebookProvider(),
  x: new XProvider(),
  pinterest: new PinterestProvider(),
  youtube: new YouTubeProvider()
};

export const PROVIDER_SLUGS = Object.keys(providers) as PlatformSlug[];

export function getProvider(slug: PlatformSlug): PlatformProvider {
  const p = providers[slug];
  if (!p) throw new Error(`Unknown platform provider: ${slug}`);
  return p;
}

// Used by the GET /integrations route so the UI knows which "Connect"
// buttons to enable based on which OAuth apps the operator has configured.
export function listProviders(): Array<{
  slug: PlatformSlug;
  displayName: string;
  isConfigured: boolean;
}> {
  return PROVIDER_SLUGS.map((slug) => {
    const p = providers[slug];
    return {
      slug,
      displayName: p.displayName,
      isConfigured: p.isConfigured()
    };
  });
}
