import { z } from "zod";

// ---------------------------------------------------------------------------
// REQUEST schemas — what the client POSTs to `/api/v1/videos/generate`.
// ---------------------------------------------------------------------------

// `targetDuration` caps total video length. Values aligned with the major
// short-form platforms (Reels/Shorts/TikTok). Anything longer than 90s is
// rarely watched to completion and burns API quota for no reason.
export const VideoAspectRatioSchema = z.enum(["9:16", "1:1", "16:9"]);
export const VideoVoiceStyleSchema = z.enum([
  "professional",
  "casual",
  "energetic",
  "calm"
]);

export const GenerateVideoSchema = z.object({
  topic: z.string().min(3).max(500),
  targetDuration: z
    .union([z.literal(15), z.literal(30), z.literal(60), z.literal(90)])
    .default(30),
  aspectRatio: VideoAspectRatioSchema.default("9:16"),
  voiceStyle: VideoVoiceStyleSchema.default("professional"),
  language: z
    .string()
    .min(2)
    .max(8)
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .default("en")
});

export type GenerateVideoDto = z.infer<typeof GenerateVideoSchema>;

// ---------------------------------------------------------------------------
// SCRIPT schemas — the structured JSON the VideoScriptAgent must produce.
// This is the *contract* with the LLM. If Gemini returns anything that
// doesn't satisfy this schema, the agent throws with a field-level error
// (much more debuggable than a generic "Invalid response format").
// ---------------------------------------------------------------------------

// A scene inside the script. `voiceoverChunk` is the narration spoken while
// this scene is on screen — its concatenation across all scenes must equal
// the top-level `voiceover` field. The renderer slices the voiceover audio
// by these chunk boundaries to keep visuals and narration synced.
export const VideoScriptSceneSchema = z.object({
  index: z.number().int().min(1).max(20),
  durationSec: z.number().int().min(2).max(15),
  visual: z.string().min(10).max(500),
  voiceoverChunk: z.string().min(5).max(400)
});

export const VideoScriptSchema = z.object({
  title: z.string().min(3).max(120),
  hook: z.string().min(5).max(200),
  cta: z.string().min(3).max(120),
  duration: z.number().int().min(10).max(120),
  voiceover: z.string().min(20).max(2000),
  scenes: z.array(VideoScriptSceneSchema).min(2).max(10)
});

export type VideoScriptScene = z.infer<typeof VideoScriptSceneSchema>;
export type VideoScript = z.infer<typeof VideoScriptSchema>;

// ---------------------------------------------------------------------------
// STORYBOARD schemas — cinematographic enrichment of each script scene.
// Produced by `StoryboardAgent` from a `VideoScript`. The `visualPrompt`
// here is what we pass to the image model (Gemini Nano Banana / Imagen).
// ---------------------------------------------------------------------------

export const TransitionSchema = z.enum([
  "fade",
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "cut"
]);

export const StoryboardSceneSchema = z.object({
  index: z.number().int().min(1).max(20),
  durationSec: z.number().int().min(2).max(15),
  // What gets sent verbatim to the image model. Should be self-contained
  // (the model has no other context).
  visualPrompt: z.string().min(20).max(800),
  cameraAngle: z.string().min(3).max(60),
  lighting: z.string().min(3).max(80),
  composition: z.string().min(3).max(120),
  // What the renderer narrates during this scene.
  voiceoverChunk: z.string().min(5).max(400),
  // How we cut from this scene to the next. The final scene's value is
  // ignored.
  transitionOut: TransitionSchema
});

export const StoryboardSchema = z.object({
  scenes: z.array(StoryboardSceneSchema).min(2).max(10)
});

export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

// ---------------------------------------------------------------------------
// JOB RESULT schema — what the worker writes back to Mongo and what the
// `GET /api/v1/videos/:id` endpoint returns under `data.result`.
//
// Path A (current): direct text → Veo 3 fast. One model call produces an
// 8s clip with native audio (voiceover + SFX + music). `storyboard` is
// optional because we don't run StoryboardAgent in this path — it's kept
// in the schema so Path B (multi-scene compositing) can populate it later.
// ---------------------------------------------------------------------------

export const VeoAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const VideoJobResultSchema = z.object({
  script: VideoScriptSchema,
  storyboard: StoryboardSchema.optional(),
  // The final rendered MP4 hosted on Cloudinary.
  videoUrl: z.string().url(),
  // Cloudinary object key — useful for deletion / regeneration without a
  // second lookup against the result URL.
  storageKey: z.string().min(1),
  mimeType: z.string().min(3).default("video/mp4"),
  // Veo model that produced the clip (lets us A/B different tiers).
  model: z.string().min(3),
  // Exact prompt sent to Veo. Saved for debugging + regenerate-with-edits.
  veoPrompt: z.string().min(20),
  durationSec: z.number().int().min(1).max(60),
  aspectRatio: VeoAspectRatioSchema,
  sizeBytes: z.number().int().min(1).optional()
});

export type VideoJobResult = z.infer<typeof VideoJobResultSchema>;