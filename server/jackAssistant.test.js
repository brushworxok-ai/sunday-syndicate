import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_JACK_MODEL, formatNflNews, jackGenerationTuning, questionNeedsNflNews } from './jackAssistant.js';

test('Jack uses a stable low-latency model by default', () => {
  assert.equal(DEFAULT_JACK_MODEL, 'gemini-3.5-flash-lite');
  assert.deepEqual(jackGenerationTuning(DEFAULT_JACK_MODEL), { thinkingConfig: { thinkingLevel: 'low' } });
  assert.deepEqual(jackGenerationTuning('gemini-2.5-flash-lite'), { thinkingConfig: { thinkingBudget: 0 } });
});

test('ordinary league questions do not wait for NFL headline data', () => {
  assert.equal(questionNeedsNflNews('Who is leading the standings?'), false);
  assert.equal(questionNeedsNflNews('What time do picks lock?'), false);
  assert.equal(questionNeedsNflNews('Any injury news today?'), true);
});

test('ESPN data is converted to the bounded prompt schema', () => {
  const news = formatNflNews({
    fetchedAt: '2026-09-04T18:00:00.000Z',
    items: [{ headline: 'Player listed as questionable with injury', description: 'Friday update', published: '2026-09-04T17:00:00.000Z', url: 'https://www.espn.com/test' }],
  });
  assert.equal(news.provider, 'espn');
  assert.equal(news.articles.length, 1);
  assert.equal(news.articles[0].source, 'ESPN');
  assert.equal(news.articles[0].isInjury, true);
  assert.equal(news.articles[0].publishedAt, '2026-09-04T17:00:00.000Z');
});
