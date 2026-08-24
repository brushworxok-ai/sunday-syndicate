import { buildPrompt } from './prompts.js';
import { assertGeneratedTextSafe } from './moderation.js';

export async function generateGeminiText({ client, model, action, payload }) {
  const { systemInstruction, prompt } = buildPrompt(action, payload);
  const result = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      maxOutputTokens: 1024,
    },
  });

  const text = result.text?.trim();
  if (!text) throw new Error('Gemini returned an empty response');
  const moderation = assertGeneratedTextSafe(action, text, payload);
  return { text: moderation.text, model, moderation: moderation.status };
}
