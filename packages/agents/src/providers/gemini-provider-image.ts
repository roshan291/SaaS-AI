// Deprecated shim. The previous implementation pointed at an image-generation
// model that returned raw binary bytes; the calling agent then tried to
// JSON.parse those bytes, which always failed. The image agent now uses the
// regular text-based GeminiProvider to produce a refined prompt; this file is
// kept only to avoid breaking any historic imports.
//
// TODO: remove once we confirm no external code imports `GeminiProviderImage`.
export { GeminiProvider as GeminiProviderImage } from "./gemini-provider";
