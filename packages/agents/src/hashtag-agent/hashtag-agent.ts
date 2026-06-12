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

      return JSON.parse(
        cleaned
      );

    } catch {

      throw new Error(
        "Invalid hashtag response format"
      );
    }
  }
}