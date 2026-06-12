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

    return JSON.parse(cleaned);

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