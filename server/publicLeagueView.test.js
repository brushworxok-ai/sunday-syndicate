import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicLeagueView, withoutPushCredentials } from './publicLeagueView.js';

test('public league view hides selections but preserves safe score metadata', () => {
  const view = buildPublicLeagueView({ results: { g1: { winner: 'KC' } }, sheets: [{ id: 's1', name: 'Marcus', picks: { g1: 'KC', g2: 'BUF' } }] });
  assert.equal(Object.hasOwn(view.sheets[0], 'picks'), false);
  assert.equal(view.sheets[0].pickCount, 2);
  assert.equal(view.sheets[0].score, 1);
});

test('League responses never expose push endpoints or encryption keys', () => {
  const league = { settings: { entryFee: 20, pushSubscriptions: { player: { endpoint: 'private', keys: { auth: 'secret' } } } } };
  assert.deepEqual(withoutPushCredentials(league).settings, { entryFee: 20 });
  assert.ok(league.settings.pushSubscriptions);
});
