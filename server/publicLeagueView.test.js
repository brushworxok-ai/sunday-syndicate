import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicLeagueView, buildLeagueView, withoutPushCredentials } from './publicLeagueView.js';

test('public league view hides selections but preserves safe score metadata', () => {
  const view = buildPublicLeagueView({ results: { g1: { winner: 'KC' } }, sheets: [{ id: 's1', name: 'Marcus', picks: { g1: 'KC', g2: 'BUF' } }] });
  assert.equal(Object.hasOwn(view.sheets[0], 'picks'), false);
  assert.equal(view.sheets[0].pickCount, 2);
  assert.equal(view.sheets[0].score, 1);
});

test('League HTTP view hides unlocked rivals, private balances, draft recaps and delivery logs', () => {
  const league = { settings: { pushSubscriptions: { secret: true }, autoPilotLog: ['private'], propPicks: { 1: { p2: { passing: 'secret', savedAt: 'today' } } } },
    players: [{ id: 'p2', phone: 'private', messaging: { private: true }, payment: { cashApp: 'private' } }],
    sheets: [{ id: 'mine', playerId: 'p1', week: 1, picks: { g1: 'KC' }, tiebreaker: 42 }, { id: 'other', playerId: 'p2', week: 1, picks: { g1: 'BUF' }, tiebreaker: 36, paymentClaim: { private: true } }],
    creditLedger: [{ playerId: 'p1', amount: 10 }, { playerId: 'p2', amount: 20 }], recaps: [{ adminApproval: { status: 'draft' } }], broadcasts: [{ phone: 'private' }], auditLog: ['private'], sideBets: [{ creatorId: 'p2', opponentId: 'p3' }] };
  const view = buildLeagueView(league, { playerId: 'p1', locked: () => false });
  assert.deepEqual(view.sheets[0].picks, { g1: 'KC' });
  assert.deepEqual(view.sheets[1].picks, {});
  assert.equal(view.sheets[1].pickCount, 1);
  assert.equal(view.sheets[1].tiebreaker, null);
  assert.equal(view.sheets[1].paymentClaim, undefined);
  assert.equal(view.players[0].phone, undefined);
  assert.deepEqual(view.creditLedger, [{ playerId: 'p1', amount: 10 }]);
  assert.deepEqual(view.sideBets, []);
  assert.equal(view.settings.propPicks[1].p2.passing, undefined);
  assert.equal(JSON.stringify(view).includes('private'), false);
  assert.deepEqual(buildLeagueView(league, { locked: () => true }).sheets[1].picks, { g1: 'BUF' });
  const admin = buildLeagueView(league, { isAdmin: true });
  assert.equal(admin.settings.pushSubscriptions, undefined);
  assert.deepEqual(admin.sheets[1].picks, { g1: 'BUF' });
  assert.deepEqual(league.sheets[1].picks, { g1: 'BUF' });
});

test('League responses never expose push endpoints or encryption keys', () => {
  const league = { settings: { entryFee: 20, pushSubscriptions: { player: { endpoint: 'private', keys: { auth: 'secret' } } } } };
  assert.deepEqual(withoutPushCredentials(league).settings, { entryFee: 20 });
  assert.ok(league.settings.pushSubscriptions);
});
