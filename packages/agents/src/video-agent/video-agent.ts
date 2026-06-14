// Video script agent.
// -----------------------------------------------------------------------------
// Two methods:
//   - `generateVideoScript(input)` — text only. Returns a validated
//     `VideoScript`. Useful for previewing the script before paying for
//     video generation.
//   - `generateVideo(input)` — full end-to-end: script → Veo prompt → Veo
//     long-running op → Cloudinary upload → `VideoJobResult`. This is the
//     method the worker calls.
//
// If Gemini returns malformed JSON or fields that violate the schema, the
// agent throws an `Error` with the Zod field-level message — much more
// debuggable than the old "Invalid response format" string.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
    VideoScriptSchema,
    type VideoScript,
    type VideoJobResult
} from "@saas/shared";
import { getStorage } from "@saas/storage";

import { GeminiProvider } from "../providers/gemini-provider";
import { VeoProvider } from "../providers/veo-provider";
import { videoPrompt } from "../prompts/video.prompt";
import { buildVeoPrompt } from "../prompts/veo.prompt";

export interface VideoAgentInput {
    topic: string;
    targetDuration?: number;
    voiceStyle?: "professional" | "casual" | "energetic" | "calm";
    language?: string;
    aspectRatio?: "9:16" | "16:9" | "1:1";
}

export class VideoAgent {
    private textProvider = new GeminiProvider();
    private veoProvider = new VeoProvider();

    async generateVideoScript(
        input: VideoAgentInput | string
    ): Promise<VideoScript> {
        // Back-compat: the old worker still calls with a bare topic string.
        const opts: Required<Omit<VideoAgentInput, "aspectRatio">> = {
            topic: typeof input === "string" ? input : input.topic,
            targetDuration:
                typeof input === "string"
                    ? 30
                    : (input.targetDuration ?? 30),
            voiceStyle:
                typeof input === "string"
                    ? "professional"
                    : (input.voiceStyle ?? "professional"),
            language:
                typeof input === "string" ? "en" : (input.language ?? "en")
        };

        const prompt = videoPrompt(opts);
        const raw = await this.textProvider.generate(prompt);

        // Strip the markdown code-fences Gemini sometimes adds, then parse.
        const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

        let json: unknown;
        try {
            json = JSON.parse(cleaned);
        } catch {
            throw new Error(
                `VideoAgent: response is not valid JSON. First 200 chars: ${cleaned.slice(0, 200)}`
            );
        }

        // Validate against the shared Zod schema. Throw a readable error if
        // the LLM omitted/mistyped any field.
        const parsed = VideoScriptSchema.safeParse(json);
        if (!parsed.success) {
            throw new Error(
                `VideoAgent: script failed validation: ${formatZodError(parsed.error)}`
            );
        }

        // Cross-field sanity: scene durations must sum to total duration.
        // The schema can't express this, so we check explicitly.
        const sum = parsed.data.scenes.reduce(
            (acc, s) => acc + s.durationSec,
            0
        );
        if (sum !== parsed.data.duration) {
            throw new Error(
                `VideoAgent: scene durations sum to ${sum}s but total duration is ${parsed.data.duration}s`
            );
        }

        return parsed.data;
    }

    // -------------------------------------------------------------------
    // Full end-to-end video generation.
    //
    // Pipeline:
    //   1. Generate + validate script (text model).
    //   2. Build a single rich Veo prompt deterministically (no LLM call).
    //   3. Call Veo (long-running op) → MP4 bytes with native audio.
    //   4. Upload MP4 to Cloudinary → public URL.
    //   5. Return everything the API needs to display the result.
    //
    // Note on duration: Veo 3 fast currently caps at 8 seconds per clip.
    // The script's `duration` field can be longer — we use it for storyline
    // pacing but the rendered clip is still 8s. For longer videos, Path B
    // (multi-scene fan-out) will be added later.
    // -------------------------------------------------------------------
    async generateVideo(
        input: VideoAgentInput | string
    ): Promise<VideoJobResult> {
        const opts: Required<VideoAgentInput> = {
            topic: typeof input === "string" ? input : input.topic,
            targetDuration:
                typeof input === "string"
                    ? 30
                    : (input.targetDuration ?? 30),
            voiceStyle:
                typeof input === "string"
                    ? "professional"
                    : (input.voiceStyle ?? "professional"),
            language:
                typeof input === "string" ? "en" : (input.language ?? "en"),
            aspectRatio:
                typeof input === "string"
                    ? "9:16"
                    : (input.aspectRatio ?? "9:16")
        };

        // ---- Step 1: script ---------------------------------------------
        const script = await this.generateVideoScript(opts);

        // ---- Step 2: build Veo prompt -----------------------------------
        const veoPrompt = buildVeoPrompt({
            script,
            voiceStyle: opts.voiceStyle,
            aspectRatio: opts.aspectRatio
        });

        // ---- Step 3: call Veo -------------------------------------------
        // durationSeconds intentionally omitted — let Veo use its default
        // (8s on Veo 3 fast). Passing an unsupported value 400s the request.
        const veo = await this.veoProvider.generate({
            prompt: veoPrompt,
            aspectRatio: opts.aspectRatio,
            personGeneration: "allow_all"
        });

        // ---- Step 4: upload to Cloudinary -------------------------------
        const ext = extensionFor(veo.mimeType);
        const key = `videos/${new Date()
            .toISOString()
            .slice(0, 10)}/${randomUUID()}.${ext}`;

        const { url, key: storageKey } = await getStorage().put(
            key,
            veo.bytes,
            veo.mimeType
        );

        // ---- Step 5: assemble result ------------------------------------
        // Veo 3 fast currently renders 8s clips regardless of the script
        // duration. We surface the actual render length, not the storyline
        // target.
        return {
            script,
            videoUrl: url,
            storageKey,
            mimeType: veo.mimeType,
            model: veo.model,
            veoPrompt,
            durationSec: 8,
            aspectRatio: opts.aspectRatio,
            sizeBytes: veo.sizeBytes
        };
    }
}

function formatZodError(err: z.ZodError): string {
    return err.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
}

// MP4 is the only output Veo currently emits; the switch is here so that
// when Veo adds WebM/HEVC support, we don't need to chase callers.
function extensionFor(mimeType: string): string {
    switch (mimeType) {
        case "video/mp4":
            return "mp4";
        case "video/webm":
            return "webm";
        case "video/quicktime":
            return "mov";
        default:
            return "mp4";
    }
}