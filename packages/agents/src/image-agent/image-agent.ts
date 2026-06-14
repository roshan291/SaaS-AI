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
        const response = await this.textProvider.generate(imagePrompt(topic));

        let parsed: unknown;
        try {
            const cleaned = response
                .replace(/```json/g, "")
                .replace(/```/g, "")
                .trim();
            parsed = JSON.parse(cleaned);
        } catch {
            throw new Error("Invalid image prompt format");
        }

        if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof (parsed as { prompt?: unknown }).prompt !== "string" ||
            (parsed as { prompt: string }).prompt.trim().length === 0
        ) {
            throw new Error("Image prompt response missing 'prompt' field");
        }

        return (parsed as { prompt: string }).prompt.trim();
    }
}

// Map MIME type to a sensible file extension. Defaults to `png` because the
// Gemini image model emits PNG by default.
function extensionFor(mimeType: string): string {
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
