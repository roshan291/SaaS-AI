// Image agent.
// -----------------------------------------------------------------------------
// End-to-end image generation pipeline:
//
//   1. Refine the user's topic into a high-quality image prompt via a text
//      model (lets users submit vague topics like "coffee shop opening"
//      and get a fully-specified prompt).
//   2. Send that prompt to the image model and receive PNG/JPEG bytes.
//   3. Persist bytes via the storage provider; receive a public URL.
//   4. Return `{ prompt, imageUrl, mimeType, storageKey }` as the job
//      `result`. The API surfaces this back to clients verbatim.
//
// Failures from any step propagate up to the worker, which marks the DB
// job as failed with the error message.
import { randomUUID } from "node:crypto";
import { getStorage } from "@saas/storage";

import { GeminiProvider } from "../providers/gemini-provider";
import { GeminiImageGenProvider } from "../providers/gemini-image-gen-provider";
import { imagePrompt } from "../prompts/image.prompt";

export interface ImageJobResult {
    prompt: string;
    imageUrl: string;
    mimeType: string;
    storageKey: string;
}

export class ImageAgent {
    private textProvider = new GeminiProvider();
    private imageProvider = new GeminiImageGenProvider();
   
    async generateImagePrompt(topic: string): Promise<ImageJobResult> {
        // ---- Step 1: refine the topic into a detailed prompt ------------
        const promptText = await this.refinePrompt(topic);

        // ---- Step 2: ask the image model for bytes ----------------------
        const { bytes, mimeType } =
            await this.imageProvider.generateImage(promptText);

        // ---- Step 3: persist to storage --------------------------------
        const ext = extensionFor(mimeType);
        const key = `images/${new Date()
            .toISOString()
            .slice(0, 10)}/${randomUUID()}.${ext}`;

        const { url, key: storageKey } = await getStorage().put(
            key,
            bytes,
            mimeType
        );

        return {
            prompt: promptText,
            imageUrl: url,
            mimeType,
            storageKey
        };
    }

    private async refinePrompt(topic: string): Promise<string> {
        // Ask Gemini for native JSON output. Combined with the lenient
        // extractor below this gives us two layers of defense against the
        // text model returning ill-formed output.
        const raw = await this.textProvider.generate(imagePrompt(topic), {
            json: true
        });

        const refined = extractRefinedPrompt(raw);

        // Fall back to the original topic so the image provider is always
        // reached. The text refinement is a *nice to have*, not a hard gate
        // — a flaky text model should never block image generation.
        // debugger;
        const finalPrompt =
            refined && refined.trim().length > 0 ? refined.trim() : topic;

        return finalPrompt;
    }
}

// Best-effort extraction of the `prompt` field from a chatty text-model
// reply. Order of attempts:
//   1. Strip ```json fences and parse the whole reply as JSON.
//   2. Find the first {...} substring and parse that.
//   3. Give up and return the raw reply (the image model can still use a
//      free-form prompt — better than refusing to call it at all).
function extractRefinedPrompt(raw: string): string | undefined {
    if (!raw) return undefined;

    const stripped = raw
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

    // Attempt 1 — strict parse
    const direct = tryParsePrompt(stripped);
    if (direct) return direct;

    // Attempt 2 — find embedded { ... } block
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
        const embedded = tryParsePrompt(match[0]);
        if (embedded) return embedded;
    }
    // debugger;
    // Attempt 3 — model returned free-form text; use as-is.
    return stripped;
}

function tryParsePrompt(s: string): string | undefined {
    try {
        const parsed: unknown = JSON.parse(s);
        if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as { prompt?: unknown }).prompt === "string"
        ) {
            const value = (parsed as { prompt: string }).prompt.trim();
            return value.length > 0 ? value : undefined;
        }
    } catch {
        // not valid JSON
    }
    return undefined;
}

// Map MIME type to a sensible file extension. Defaults to `png` because the
// Gemini image model emits PNG by default.
function extensionFor(mimeType: string): string {
  // debugger;
    switch (mimeType) {
        case "image/png":
            return "png";
        case "image/jpeg":
        case "image/jpg":
            return "jpg";
        case "image/webp":
            return "webp";
        case "image/gif":
            return "gif";
        default:
            return "png";
    }
}
