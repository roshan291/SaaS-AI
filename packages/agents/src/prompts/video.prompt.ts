// Prompt used by `VideoAgent` to ask Gemini for a fully-structured short-form
// video script. The shape returned here must satisfy `VideoScriptSchema` in
// `@saas/shared`. Field names and constraints are kept in lock-step with
// that Zod schema — if you change one, change the other.
//
// Why such a strict prompt?
//   - Gemini occasionally adds a markdown code-fence (```json) or a leading
//     "Sure! Here you go:" sentence. The agent strips fences, but anything
//     non-JSON outside fences fails parsing.
//   - Per-scene `voiceoverChunk` values must concatenate to the top-level
//     `voiceover`. The renderer slices audio by chunk boundaries; mismatches
//     break sync.
//   - Total scene `durationSec` must sum to `duration`. The renderer trusts
//     these numbers.
export interface VideoPromptOptions {
    topic: string;
    targetDuration: number;
    voiceStyle: "professional" | "casual" | "energetic" | "calm";
    language: string;
}

export const videoPrompt = ({
    topic,
    targetDuration,
    voiceStyle,
    language
}: VideoPromptOptions) => {
    const sceneCount = Math.max(2, Math.min(8, Math.round(targetDuration / 6)));

    return `You are an expert short-form video scriptwriter for Reels, TikTok, and YouTube Shorts.

Write a viral ${targetDuration}-second script about the topic below.

TOPIC:
${topic}

REQUIREMENTS:
- Language: ${language}
- Voice style: ${voiceStyle}
- Total duration: exactly ${targetDuration} seconds
- Exactly ${sceneCount} scenes
- Each scene 3-10 seconds
- Strong hook in the first 3 seconds (scroll-stopper)
- Clear, actionable call-to-action in the final scene
- Sum of all scene durations MUST equal ${targetDuration}
- Concatenating every "voiceoverChunk" (in order) MUST equal the top-level "voiceover" exactly
- "visual" describes what the viewer SEES (subject, action, setting). No camera/lighting/composition jargon — that comes later.

OUTPUT FORMAT:
Return ONLY a single JSON object. No markdown, no code fences, no commentary.
Match this exact shape:

{
  "title": "string, max 120 chars",
  "hook": "string, the opening line (max 200 chars)",
  "cta": "string, the closing call-to-action (max 120 chars)",
  "duration": ${targetDuration},
  "voiceover": "string, the full narration as one paragraph",
  "scenes": [
    {
      "index": 1,
      "durationSec": 5,
      "visual": "what the viewer sees in this scene",
      "voiceoverChunk": "what is narrated during this scene"
    }
  ]
}
`;
};