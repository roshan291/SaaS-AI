export const contentPrompt = (
  topic: string
) => `
You are a social media content creator.

IMPORTANT:
Return ONLY valid JSON.
Do not use markdown.
Do not use code blocks.
Do not add explanations.

{
  "caption": "",
  "cta": "",
  "hashtags": []
}

Topic:
${topic}
`;
