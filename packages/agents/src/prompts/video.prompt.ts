export const videoPrompt = (
  topic: string
) => `
You are an expert short-form video creator.

Create a professional social media video script.

Topic:
${topic}

Requirements:
- 30 second video
- 5 scenes
- Engaging hook
- Educational
- Viral social media style

Return JSON only.

Format:

{
  "title": "",
  "duration": 30,
  "scenes": [
    {
      "scene": 1,
      "visual": "",
      "voiceover": ""
    }
  ]
}
`;