// import {
//   OpenAIProvider
// } from "../providers/openai-provider";
import {
  GeminiProvider
} from "../providers/gemini-provider";

import {
  contentPrompt
} from "../prompts/content.prompt";

export class ContentAgent {

  private provider =
    new GeminiProvider();

  async generatePost(
  topic: string
) {

  const prompt =
    contentPrompt(topic);

  const response =
    await this.provider.generate(
      prompt
    );

  console.log(
    "GEMINI RESPONSE:"
  );

  console.log(response);

  try {

    const cleaned =
      response
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    const parsed: unknown = JSON.parse(cleaned);

    // The prompt asks Gemini for { caption, cta, hashtags } but the FE
    // contract is a plain string (ContentJobResult). Flatten the
    // envelope into a single body: caption first, CTA appended on a new
    // line if present. Hashtags are dropped here because the hashtag
    // agent emits its own dedicated result and the UI renders that
    // separately. Bare strings are passed through unchanged so we stay
    // tolerant of model drift.
    if (typeof parsed === "string") {
      return parsed.trim();
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as { caption?: unknown; cta?: unknown };
      const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
      const cta = typeof obj.cta === "string" ? obj.cta.trim() : "";
      const combined = [caption, cta].filter(Boolean).join("\n\n");
      if (combined.length > 0) return combined;
    }

    throw new Error("missing caption");

  } catch (error) {

    console.error(
      "PARSE ERROR:"
    );

    console.error(response);

    throw new Error(
      "Invalid AI response format"
    );
  }
}
}