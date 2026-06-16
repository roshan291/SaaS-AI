// import {
//   OpenAIProvider
// } from "../providers/openai-provider";
import {
  GeminiProvider
} from "../providers/gemini-provider";

import {
  hashtagPrompt
} from "../prompts/hashtag.prompt";

export class HashtagAgent {

  private provider =
    new GeminiProvider();

  async generateHashtags(
    topic: string
  ) {

    const prompt =
      hashtagPrompt(topic);

    const response =
      await this.provider.generate(
        prompt
      );

    try {

      const cleaned =
        response
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

      const parsed: unknown = JSON.parse(cleaned);

      // The prompt asks Gemini for { "hashtags": [...] } but the FE
      // contract is a bare string[] (HashtagsJobResult). Unwrap the
      // envelope here so downstream consumers (worker -> job.result -> UI)
      // get the array shape they already expect. If Gemini returns just
      // a bare array we accept that too.
      const arr: unknown = Array.isArray(parsed)
        ? parsed
        : (parsed as { hashtags?: unknown })?.hashtags;

      if (!Array.isArray(arr)) {
        throw new Error("missing hashtags array");
      }

      return arr
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0);

    } catch {

      throw new Error(
        "Invalid hashtag response format"
      );
    }
  }
}