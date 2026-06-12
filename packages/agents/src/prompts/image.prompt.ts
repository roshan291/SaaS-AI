export const imagePrompt = (
  topic: string
) => `
You are an expert AI image prompt engineer.

Create a highly detailed social media image prompt.

Topic:
${topic}

Requirements:
- Professional marketing style
- High quality
- Photorealistic
- Social media optimized
- Include lighting
- Include camera details
- Include background details

Return JSON only.

Format:

{
  "prompt": ""
}
`;