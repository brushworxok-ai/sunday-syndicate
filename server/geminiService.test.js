import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGeminiText } from './geminiService.js';
import { ModerationError } from './moderation.js';

test('Gemini recap pipeline sends grounded facts and returns moderated copy', async () => {
  let request;
  const client = { models: { generateContent: async (value) => {
    request = value;
    return { text: 'Marcus wins Week 12 at 12–2. Commissioner’s note: Results are verified.' };
  } } };
  const output = await generateGeminiText({
    client,
    model: 'gemini-test-model',
    action: 'recap',
    payload: {
      week: 12,
      entries: [{ id: 'marcus', name: 'Marcus', score: 12, pickCount: 14, roastLevel: 'light', roastEligible: true }],
      games: [{ id: '1', away: 'KC', home: 'BUF', winner: 'BUF', awayScore: 21, homeScore: 27 }],
      players: [{ id: 'marcus', name: 'Marcus', roastLevel: 'light' }],
    },
  });
  assert.equal(request.model, 'gemini-test-model');
  assert.match(request.contents, /"winner":"BUF"/);
  assert.match(request.contents, /"score":12/);
  assert.equal(output.moderation, 'passed');
  assert.match(output.text, /Marcus wins/);
});

test('Gemini pipeline rejects unsafe model output before returning it to the app', async () => {
  const client = { models: { generateContent: async () => ({ text: 'Chris Morgan had a rough week.' }) } };
  await assert.rejects(
    generateGeminiText({
      client,
      model: 'gemini-test-model',
      action: 'trashTalk',
      payload: {
        entries: [{ id: 'taylor', name: 'Taylor', roastLevel: 'maximum', roastEligible: true }],
        players: [{ id: 'chris', name: 'Chris Morgan', roastLevel: 'none' }],
      },
    }),
    (error) => error instanceof ModerationError && error.code === 'player_opted_out',
  );
});
