// packages/db/src/models/Post.ts

import { Schema, model } from "mongoose";

const PostSchema = new Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      index: true
    },

    title: String,

    content: String,

    status: {
      type: String,
      enum: ["draft", "scheduled", "published"],
      default: "draft"
    },

    // Optional rich-media + targeting metadata. Added so the manual
    // composer (apps/web /posts/new) can attach a single image, a list of
    // hashtags, and the set of social-media destinations the post will be
    // pushed to. All optional so the existing minimal {title, content,
    // status} flow keeps working unchanged.
    imageUrl: { type: String, default: null },

    // Cloudinary key for the uploaded image — kept so we can later delete /
    // re-derive URLs without re-parsing the public URL.
    imageStorageKey: { type: String, default: null },

    // Optional video attachment. Same Cloudinary direct-upload pattern as
    // the image fields. Required by the YouTube publisher; image-only
    // providers (Instagram feed, Pinterest pins, FB photo posts) ignore it.
    videoUrl: { type: String, default: null },
    videoStorageKey: { type: String, default: null },

    hashtags: { type: [String], default: [] },

    // Slugs like "instagram", "x", "linkedin", "tiktok", "facebook",
    // "youtube". Stored as a flat string[] so adding a new destination is a
    // pure data change; no enum migration needed.
    platforms: { type: [String], default: [] },

    // Provenance flag. "ai" — caption/image came from the AI Studio's
    // generation agents. "manual" — user typed the caption and uploaded
    // their own image (or no image). Defaults to "manual" so legacy
    // documents created before this field existed read as user-authored,
    // which matches their actual origin (the /posts/new composer).
    source: {
      type: String,
      enum: ["ai", "manual"],
      default: "manual"
    },

    // Optional ISO timestamp for scheduled posts. When `status=="scheduled"`
    // a future scheduler/cron will pick up rows where scheduledAt <= now()
    // and enqueue publish jobs. For the POC we only allow immediate publish;
    // the field exists so the UI can record intent without a migration.
    scheduledAt: { type: Date, default: null },

    // Per-platform fan-out result map keyed by platform slug. Written by
    // the publish worker as each platform job completes so the UI can show
    // "Posted to Instagram ✓ / Pinterest ✓ / X failed: rate limited".
    //
    // Shape: Record<platformSlug, {
    //   status: "queued" | "publishing" | "success" | "failed" | "skipped",
    //   externalId?: string,
    //   externalUrl?: string,
    //   error?: string,
    //   queuedAt?: Date,
    //   publishedAt?: Date
    // }>
    publishResults: { type: Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true
  }
);

// Drafts list view + status filters within a workspace.
PostSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

PostSchema.set("toJSON", { versionKey: false });
PostSchema.set("toObject", { versionKey: false });

export const PostModel = model("Post", PostSchema);