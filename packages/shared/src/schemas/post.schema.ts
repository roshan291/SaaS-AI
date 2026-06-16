// packages/shared/src/schemas/post.schema.ts

import { z } from "zod";

// Allow-list of social destinations the composer can target. Kept in sync
// with apps/web's <PlatformIcon> map. Extending here is a single-line
// change; the DB stores `platforms` as a free-form string[] so old posts
// with deprecated values still load.
export const PLATFORM_SLUGS = [
  "instagram",
  "x",
  "linkedin",
  "tiktok",
  "facebook",
  "youtube",
  // Added with the integrations layer — Pinterest joins the supported set
  // alongside the existing slugs. Slugs not yet implemented by a provider
  // (linkedin, tiktok) still validate so legacy data round-trips cleanly.
  "pinterest"
] as const;
export type PlatformSlug = (typeof PLATFORM_SLUGS)[number];

// Provenance of the post — whether it was assembled in the AI Studio's
// generator flow or typed/uploaded by the user via the manual composer.
// Kept here (not in the Post model file) so both Mongoose and Zod use the
// same single-source enum.
export const POST_SOURCES = ["ai", "manual"] as const;
export type PostSource = (typeof POST_SOURCES)[number];

// Body shape for POST /api/v1/posts. `workspaceId` is intentionally absent —
// it is derived from the caller's JWT to prevent tenant-spoofing.
export const CreatePostSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1).max(20_000),
  status: z
    .enum(["draft", "scheduled", "published"])
    .default("draft"),

  // Optional media + targeting metadata for the manual composer.
  // `imageUrl` must be an absolute URL (Cloudinary delivery URL in
  // practice) so the FE never has to special-case relative paths.
  imageUrl: z.string().url().max(2_000).optional().nullable(),
  imageStorageKey: z.string().max(500).optional().nullable(),

  // Optional video attachment. Same shape as the image fields — Cloudinary
  // direct upload returns a delivery URL + public_id. Required by the
  // YouTube publisher; ignored by image-only providers.
  videoUrl: z.string().url().max(2_000).optional().nullable(),
  videoStorageKey: z.string().max(500).optional().nullable(),

  // Cap hashtag count and per-tag length to keep payloads predictable.
  hashtags: z
    .array(z.string().min(1).max(80))
    .max(30)
    .optional(),

  platforms: z
    .array(z.enum(PLATFORM_SLUGS))
    .max(PLATFORM_SLUGS.length)
    .optional(),

  // Optional provenance tag. The FE explicitly sends "manual" for posts
  // created through the Studio's Manual mode (or the /posts/new
  // composer); AI-generated posts pass "ai". Defaults to "manual" on the
  // server when omitted to preserve backwards-compat with legacy callers.
  source: z.enum(POST_SOURCES).default("manual")
});

export type CreatePostDto = z.infer<typeof CreatePostSchema>;

export const UpdatePostSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(1).max(20_000).optional(),
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  imageUrl: z.string().url().max(2_000).optional().nullable(),
  imageStorageKey: z.string().max(500).optional().nullable(),
  videoUrl: z.string().url().max(2_000).optional().nullable(),
  videoStorageKey: z.string().max(500).optional().nullable(),
  hashtags: z
    .array(z.string().min(1).max(80))
    .max(30)
    .optional(),
  platforms: z
    .array(z.enum(PLATFORM_SLUGS))
    .max(PLATFORM_SLUGS.length)
    .optional(),
  source: z.enum(POST_SOURCES).optional()
});

export type UpdatePostDto = z.infer<typeof UpdatePostSchema>;