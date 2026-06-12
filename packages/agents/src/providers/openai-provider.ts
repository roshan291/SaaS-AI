import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

export class OpenAIProvider {

  private client: OpenAI;

  constructor() {

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generate(
    prompt: string
  ) {

    const response =
      await this.client.chat.completions.create({
        model: "gpt-4o-mini",

        response_format: {
          type: "json_object"
        },

        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

    return (
      response.choices[0].message.content || ""
    );
  }
}