import {
  GoogleGenAI
} from "@google/genai";

import {
  AIProvider
} from "./ai-provider";

export class GeminiProviderImage
  implements AIProvider {

  private ai: GoogleGenAI;

  constructor() {

    this.ai =
      new GoogleGenAI({
        apiKey:
          process.env.GEMINI_API_KEY
      });
  }

  async generate(
    prompt: string
  ): Promise<string> {

    const response =
      await this.ai.models.generateContent({
        model:
          "gemini-3.1-flash-image",

        contents:
          prompt
      });

      const imageData =
  response.candidates?.[0]
    ?.content?.parts?.find(
      p => p.inlineData
    )?.inlineData?.data;
    return (
      imageData || ""
    );
  }
}