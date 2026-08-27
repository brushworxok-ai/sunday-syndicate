import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { joinSeasonPool, settleSeasonPool } from './seasonPoolService.js';

test('a $25 season-pool claim persists separately from weekly entry credits', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const playerId = 'player-marcus';
  const startingBalance = store.getAccount(playerId).balanceCents;
  const joined = await joinSeasonPool({ store, leagueId, playerId, season: 2026, now: new Date('2026-08-18T12:00:00.000Z') });
  assert.equal(joined.claim.amountCents, 2500);
  assert.equal(joined.claim.status, 'pending');
  assert.equal(store.getAccount(playerId).balanceCents, startingBalance);
  assert.equal(store.getLeague(leagueId).settings.seasonPools[0].entries[0].status, 'pending');

  store.resolveSeasonPoolClaim(leagueId, joined.claim.id, { decision: 'confirm', actor: 'commissioner' });
  const league = store.getLeague(leagueId);
  assert.equal(league.settings.seasonPools[0].entries[0].status, 'confirmed');
  assert.equal(store.getAccount(playerId).balanceCents, startingBalance);
  await assert.rejects(() => joinSeasonPool({ store, leagueId, playerId, season: 2026, now: new Date('2026-08-19T12:00:00.000Z') }), /already pending or confirmed/);
  store.close();
});

test('season reward settles only after Week 18 and splits equal leaders exactly', async () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const league = {
    id: 'league', season: 2026, players,
    settings: { seasonPools: [{ season: 2026, entryFeeCents: 2500, entries: [{ id: 'entry-a', playerId: 'a', status: 'confirmed' }, { id: 'entry-b', playerId: 'b', status: 'confirmed' }], settlement: null }] },
    weeklySettlements: [
      { id: 'w1', season: 2026, week: 1, status: 'paid', winners: [{ playerId: 'a', payoutCents: 2000 }] },
      { id: 'w2', season: 2026, week: 2, status: 'paid', winners: [{ playerId: 'b', payoutCents: 2000 }] },
      { id: 'w18', season: 2026, week: 18, status: 'rollover', winners: [] },
    ],
  };
  let saved;
  const store = { getLeague: async () => structuredClone(league), saveSeasonPoolSettlement: async (_leagueId, settlement) => { saved = settlement; return settlement; } };
  const settlement = await settleSeasonPool({ store, leagueId: league.id, season: 2026, actor: 'commissioner' });
  assert.equal(settlement.potCents, 5000);
  assert.equal(settlement.resolution, 'equal_leaders_split');
  assert.deepEqual(settlement.winners.map((winner) => winner.payoutCents), [2500, 2500]);
  assert.equal(saved.status, 'owed');

  const unfinished = { ...league, weeklySettlements: league.weeklySettlements.filter((item) => item.week !== 18) };
  await assert.rejects(() => settleSeasonPool({ store: { ...store, getLeague: async () => unfinished }, leagueId: league.id, season: 2026 }), /only after Week 18/);
});
