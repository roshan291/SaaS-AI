// Real image-bytes generator backed by Google Gemini's image model.
//
// Why this exists: the previous `gemini-provider-image.ts` referenced an
// invalid model name (`gemini-3.1-flash-image`) and returned base64 that
// callers then tried to `JSON.parse`. This file replaces that bug with a
// working, typed integration:
//
//   prompt (string)  -->  PNG bytes (Buffer)  +  mime type
//
// The image agent owns the prompt-refinement step (a text model call). This
// provider is intentionally dumb: hand it a final prompt, get bytes back.
//
// Configuration:
//   GEMINI_API_KEY            required
//   GEMINI_IMAGE_MODEL        defaults to "gemini-2.5-flash-image-preview"
import { GoogleGenAI } from "@google/genai";

export interface GeneratedImage {
    bytes: Buffer;
    mimeType: string;
}

export class GeminiImageGenProvider {
    private ai: GoogleGenAI;
    private readonly model: string;

    constructor() {
        this.ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });
        this.model =
            process.env.GEMINI_IMAGE_MODEL ??
            "gemini-2.5-flash-image-preview";
    }

    async generateImage(prompt: string): Promise<GeneratedImage> {
        const response = await this.ai.models.generateContent({
            model: this.model,
            contents: prompt
        });

        // The image model returns one or more `parts`; the actual image lives
        // on the part whose `inlineData.mimeType` starts with `image/`.
        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const imagePart = parts.find((p) => {
            const mime = p.inlineData?.mimeType;
            return typeof mime === "string" && mime.startsWith("image/");
        });

        const inline = imagePart?.inlineData;
        if (!inline?.data || !inline.mimeType) {
            // Surface the model's own text reply (often a refusal or a
            // content-filter explanation) so the failed job's `error` field
            // is debuggable.
            const textPart = parts.find((p) => p.text);
            const reason = textPart?.text ?? "no image part returned";
            throw new Error(
                `Image model did not return an image: ${reason}`
            );
        }

        return {
            bytes: Buffer.from(inline.data, "base64"),
            mimeType: inline.mimeType
        };
    }
}
