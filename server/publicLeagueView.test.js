import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeagueView, buildPublicLeagueView } from './publicLeagueView.js';

test('public league view hides selections but preserves safe score metadata', () => {
  const view = buildPublicLeagueView({ results: { g1: { winner: 'KC' } }, sheets: [{ id: 's1', name: 'Marcus', picks: { g1: 'KC', g2: 'BUF' } }] });
  assert.equal(Object.hasOwn(view.sheets[0], 'picks'), false);
  assert.equal(view.sheets[0].pickCount, 2);
  assert.equal(view.sheets[0].score, 1);
});

test('league views expose private fields only to the appropriate identity', () => {
  const league = {
    id: 'league-1',
    settings: {
      entryFee: 20,
      pushSubscriptions: [{ playerId: 'p1', endpoint: 'secret' }],
      cashAppPool: { enabled: true, url: 'https://cash.app/$league' },
      seasonPool: { entryFee: 25, paidPlayerIds: ['p1'] },
    },
    players: [
      { id: 'p1', name: 'One', phone: '+14055550101', messaging: { smsConsent: 'opted_in' }, payment: { cashApp: 'one' }, trashTalk: { level: 'light', jackPolicy: { favoriteTeam: 'KC' } } },
      { id: 'p2', name: 'Two', phone: '+14055550102', messaging: { smsConsent: 'opted_in' }, payment: { venmo: 'two' }, trashTalk: { level: 'none' } },
    ],
    sheets: [
      { id: 's1', playerId: 'p1', name: 'One', week: 1, picks: { g1: 'KC' }, tiebreaker: 48, handle: '$one', paymentClaim: { id: 'claim' } },
      { id: 's2', playerId: 'p2', name: 'Two', week: 1, picks: { g1: 'BUF' }, tiebreaker: 45 },
    ],
    results: { g1: { winner: 'KC' } },
    chat: [{ id: 'm1', msg: 'members only' }],
    recaps: [{ id: 'r1', text: 'members only' }],
    payouts: [{ id: 'pay1', amount: 40 }],
    auditLog: [{ id: 'a1', event: 'private' }],
    consentRecords: [{ id: 'c1', playerId: 'p1' }, { id: 'c2', playerId: 'p2' }],
    cfbPools: [{ id: 'pool', status: 'open', entries: { p1: { picks: { c1: 'KC' } }, p2: { picks: { c1: 'BUF' } } } }],
  };

  const publicView = buildLeagueView(league);
  assert.equal(publicView.players[0].phone, undefined);
  assert.equal(publicView.players[0].payment, undefined);
  assert.deepEqual(publicView.chat, []);
  assert.deepEqual(publicView.recaps, []);
  assert.deepEqual(publicView.payouts, []);
  assert.equal(publicView.settings.cashAppPool.url, undefined);
  assert.equal(publicView.settings.seasonPool.paidPlayerIds, undefined);
  assert.equal(publicView.settings.pushSubscriptions, undefined);
  assert.equal(publicView.sheets[0].paid, undefined);

  const memberView = buildLeagueView(league, { viewerPlayerId: 'p1' });
  assert.equal(memberView.players[0].phone, '+14055550101');
  assert.equal(memberView.players[1].phone, undefined);
  assert.equal(memberView.players[1].payment.venmo, 'two');
  assert.deepEqual(memberView.sheets[0].picks, { g1: 'KC' });
  assert.equal(Object.hasOwn(memberView.sheets[1], 'picks'), false);
  assert.deepEqual(Object.keys(memberView.cfbPools[0].entries), ['p1']);
  assert.deepEqual(memberView.consentRecords.map((record) => record.id), ['c1']);

  const adminView = buildLeagueView(league, { isAdmin: true });
  assert.equal(adminView.players[1].phone, '+14055550102');
  assert.equal(adminView.auditLog.length, 1);
  assert.equal(adminView.cfbPools[0].entries.p2.picks.c1, 'BUF');
});
