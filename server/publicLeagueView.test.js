import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicLeagueView } from './publicLeagueView.js';

test('public league view hides selections but preserves safe score metadata', () => {
  const view = buildPublicLeagueView({ results: { g1: { winner: 'KC' } }, sheets: [{ id: 's1', name: 'Marcus', picks: { g1: 'KC', g2: 'BUF' } }] });
  assert.equal(Object.hasOwn(view.sheets[0], 'picks'), false);
  assert.equal(view.sheets[0].pickCount, 2);
  assert.equal(view.sheets[0].score, 1);
});
