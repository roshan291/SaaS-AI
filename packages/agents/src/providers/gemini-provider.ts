import {
  GoogleGenAI
} from "@google/genai";

import {
  AIProvider
} from "./ai-provider";

export interface GenerateOptions {
  /**
   * When true, ask Gemini to return application/json directly. Callers that
   * parse the response as JSON should set this to avoid Gemini wrapping the
   * payload in prose / code fences.
   */
  json?: boolean;
}

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
    prompt: string,
    options: GenerateOptions = {}
  ): Promise<string> {

    const response =
      await this.ai.models.generateContent({
        model:
          "gemini-2.5-flash",

        contents:
          prompt,

        // Force structured JSON output when the caller asks for it.
        // This eliminates the "model added prose around the JSON" failure
        // mode that breaks downstream JSON.parse() calls.
        ...(options.json
          ? { config: { responseMimeType: "application/json" } }
          : {})
      });
    console.log("Gemini response: for Roshan", response);
    //  debugger;
    return (
      response.text || ""
    );
  }
}