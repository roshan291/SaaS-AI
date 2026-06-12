// import {
//   OpenAIProvider
// } from "../providers/openai-provider";
import {
  GeminiProvider
} from "../providers/gemini-provider";
import {
  videoPrompt
} from "../prompts/video.prompt";

export class VideoAgent {

  private provider =
    new GeminiProvider();

  async generateVideoScript(
    topic: string
  ) {

    const prompt =
      videoPrompt(topic);

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
        "Invalid video response format"
      );
    }
  }
}