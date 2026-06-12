import {
  GoogleGenAI
} from "@google/genai";

import {
  AIProvider
} from "./ai-provider";

export class GeminiProvider
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
          "gemini-2.5-flash",

        contents:
          prompt
      });

    return (
      response.text || ""
    );
  }
}