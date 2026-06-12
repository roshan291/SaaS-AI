export const hashtagPrompt = (
  topic: string
) => `
You are a social media hashtag expert.

Generate ONLY valid JSON.

Topic:
${topic}

Requirements:
- Generate exactly 20 hashtags
- Include trending hashtags
- Include niche hashtags
- Include broad hashtags
- Return JSON only

Response Format:

{
  "hashtags": [
    "#Example1",
    "#Example2"
  ]
}
`;