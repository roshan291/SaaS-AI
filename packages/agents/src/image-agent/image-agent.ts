// import {
//   OpenAIProvider
// } from "../providers/openai-provider";
import {
  GeminiProviderImage
} from "../providers/gemini-provider-image";
import {
  imagePrompt
} from "../prompts/image.prompt";

export class ImageAgent {

  private provider =
    new GeminiProviderImage();

  async generateImagePrompt(
    topic: string
  ) {

    const prompt =
      imagePrompt(topic);

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
        "Invalid image prompt format"
      );
    }
  }
}