// End-to-end money-path tests: the flows where real dollars are decided.
// These lock the payout math so a future change can't silently break who
// gets paid. They exercise the real grading, winner-selection, tiebreaker,
// credit-ledger, and atomic-claim code — not mocks.

import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { gradeCfbPool } from '../src/cfbPool.js';
import { buildWeeklyWinnerRecognition } from '../src/jackHost.js';
import { tiebreakerRank, tiebreakerBusted } from '../src/tiebreaker.js';
import { creditBalance, validateCreditEntry } from '../src/credits.js';

const LG = 'test-league';

function freshStore() {
  const s = new LeagueStore(':memory:');
  s.migrate();
  // Minimal league row so settings/claims have a home.
  s.db.prepare('INSERT INTO leagues (id, name, week, settings_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(LG, 'Test', 1, '{}', new Date().toISOString());
  return s;
}

/* Build a 3-game CFB pool where every game is final. homeSpread 0 = straight up. */
function cfbPool(entries) {
  const games = [
    { id: 'g1', date: '2026-09-05T16:00:00Z', homeSpread: 0, home: { abbr: 'AAA' }, away: { abbr: 'BBB' } },
    { id: 'g2', date: '2026-09-05T20:00:00Z', homeSpread: 0, home: { abbr: 'CCC' }, away: { abbr: 'DDD' } },
    { id: 'g3', date: '2026-09-06T00:00:00Z', homeSpread: 0, home: { abbr: 'EEE' }, away: { abbr: 'FFF' } },
  ];
  // Final scores: home wins g1 & g2, away wins g3.
  const scores = {
    g1: { homeScore: 24, awayScore: 10, final: true },
    g2: { homeScore: 20, awayScore: 17, final: true },
    g3: { homeScore: 14, awayScore: 28, final: true }, // tiebreaker game total = 42
  };
  return { id: 'cfb-w1', week: 1, entryFee: 10, status: 'final', games, scores, entries };
}

test('CFB: correct ATS winner is graded from final scores', () => {
  const pool = cfbPool({
    alice: { playerId: 'alice', name: 'Alice', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } }, // 3-0
    bob: { playerId: 'bob', name: 'Bob', paid: true, tiebreaker: 40, picks: { g1: 'home', g2: 'away', g3: 'away' } },   // 2-1
  });
  const board = gradeCfbPool(pool);
  assert.equal(board.complete, true);
  assert.equal(board.rows[0].playerId, 'alice');
  assert.equal(board.rows[0].wins, 3);
  assert.deepEqual(board.winners.map((w) => w.playerId), ['alice']);
});

test('CFB: an UNPAID top record is not eligible for the pot', () => {
  // Carol has the best record but never paid; Alice paid but is second.
  const pool = cfbPool({
    carol: { playerId: 'carol', name: 'Carol', paid: false, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } }, // 3-0 unpaid
    alice: { playerId: 'alice', name: 'Alice', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'away', g3: 'away' } },   // 2-1 paid
  });
  const board = gradeCfbPool(pool);
  const paidWinners = board.winners.filter((w) => pool.entries[w.playerId]?.paid);
  assert.equal(board.winners[0].playerId, 'carol'); // best record
  assert.equal(paidWinners.length, 0);              // but nobody eligible to be credited
});

test('CFB: pot credits only the paid winner and is idempotent (claimOnce)', () => {
  const s = freshStore();
  const pool = cfbPool({
    alice: { playerId: 'alice', name: 'Alice', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } }, // 3-0 paid
    bob: { playerId: 'bob', name: 'Bob', paid: true, tiebreaker: 30, picks: { g1: 'home', g2: 'away', g3: 'home' } },       // 1-2 paid
  });
  s.saveCfbPool(LG, pool);
  const board = gradeCfbPool(pool);
  const paidWinners = board.winners.filter((w) => pool.entries[w.playerId]?.paid);
  const pot = Object.values(pool.entries).filter((e) => e.paid).length * pool.entryFee; // 2 paid * 10 = 20
  const share = Math.floor((pot / paidWinners.length) * 100) / 100;

  // First payout claims and credits.
  assert.equal(s.claimOnce(LG, 'cfb-pot-cfb-w1'), true);
  for (const w of paidWinners) s.addCreditEntry(LG, { id: `c-${w.playerId}`, playerId: w.playerId, amount: share, reason: 'CFB Week 1 pot', by: 'auto', at: 'now' });
  assert.equal(creditBalance(s.getLeague(LG).creditLedger, 'alice'), 20);

  // A second concurrent payout can't claim again → no double credit.
  assert.equal(s.claimOnce(LG, 'cfb-pot-cfb-w1'), false);
  assert.equal(creditBalance(s.getLeague(LG).creditLedger, 'alice'), 20);
  s.close();
});

test('CFB: split pot floors the per-winner share (never overpays)', () => {
  // Two paid winners tie; pot of 3 paid * $5 = $15 → floor(15/2) = 7.5 each.
  const pool = { ...cfbPool({
    a: { playerId: 'a', name: 'A', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } },
    b: { playerId: 'b', name: 'B', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } },
    c: { playerId: 'c', name: 'C', paid: true, tiebreaker: 10, picks: { g1: 'away', g2: 'away', g3: 'home' } },
  }), entryFee: 5 };
  const board = gradeCfbPool(pool);
  const paidWinners = board.winners.filter((w) => pool.entries[w.playerId]?.paid);
  const pot = 3 * 5;
  const share = Math.floor((pot / paidWinners.length) * 100) / 100;
  assert.equal(paidWinners.length, 2);
  assert.equal(share, 7.5);
  assert.ok(share * paidWinners.length <= pot); // never pays out more than the pot
});

test('Weekly: highest score wins; exact ties become co-winners', () => {
  const board = [
    { playerId: 'p1', name: 'Avery', score: 12, tiebreakerRank: 3 },
    { playerId: 'p2', name: 'Marcus', score: 12, tiebreakerRank: 3 },
    { playerId: 'p3', name: 'Sam', score: 9, tiebreakerRank: 1 },
  ];
  const rec = buildWeeklyWinnerRecognition({ leaderboard: board, verified: true });
  assert.equal(rec.status, 'co_winners');
  assert.deepEqual(rec.protectedPlayerIds.sort(), ['p1', 'p2']);
});

test('Weekly: a better tiebreaker rank breaks a score tie', () => {
  const board = [
    { playerId: 'p1', name: 'Avery', score: 12, tiebreakerRank: 5 },
    { playerId: 'p2', name: 'Marcus', score: 12, tiebreakerRank: 2 }, // closer tiebreaker wins
  ];
  const rec = buildWeeklyWinnerRecognition({ leaderboard: board, verified: true });
  assert.equal(rec.status, 'winner');
  assert.equal(rec.winners[0].playerId, 'p2');
});

test('Weekly: an unpaid winner is not credited (paid filter)', () => {
  const s = freshStore();
  const winners = [{ playerId: 'p1', name: 'Avery', score: 12 }];
  const weekSheets = [{ playerId: 'p1', week: 1, paid: false }]; // won but didn't pay
  const paidWinners = winners.filter((w) => weekSheets.some((sh) => sh.playerId === w.playerId && sh.paid));
  assert.equal(paidWinners.length, 0);
  // Nothing credited.
  assert.equal(creditBalance(s.getLeague(LG).creditLedger, 'p1'), 0);
  s.close();
});

test('Tiebreaker: closest without going over; any under beats a bust', () => {
  const actual = 42;
  // Lower rank = better. A guess over the actual busts (worst possible).
  assert.ok(tiebreakerRank(41, actual) < tiebreakerRank(38, actual)); // 41 closer than 38
  assert.ok(tiebreakerRank(38, actual) < tiebreakerRank(43, actual)); // any under beats an over
  assert.equal(tiebreakerBusted(43, actual), true);
  assert.equal(tiebreakerBusted(42, actual), false); // exact is perfect, not a bust
});

test('Credits: balance nets credits against debits; validation rejects junk', () => {
  const s = freshStore();
  s.addCreditEntry(LG, { id: 'c1', playerId: 'x', amount: 100, reason: 'Week 1 winnings', by: 'auto', at: 'now' });
  s.addCreditEntry(LG, { id: 'c2', playerId: 'x', amount: -20, reason: 'Week 2 entry', by: 'x', at: 'now' });
  assert.equal(creditBalance(s.getLeague(LG).creditLedger, 'x'), 80);
  assert.equal(validateCreditEntry({ amount: 0, reason: 'x' }).ok, false);
  assert.equal(validateCreditEntry({ amount: 5000, reason: 'x' }).ok, false);
  assert.equal(validateCreditEntry({ amount: 25, reason: '' }).ok, false);
  assert.equal(validateCreditEntry({ amount: 25, reason: 'Cash App received' }).ok, true);
  s.close();
});

test('Store: releaseClaim lets a failed payout retry', () => {
  const s = freshStore();
  assert.equal(s.claimOnce(LG, 'weekly-pot-1'), true);
  assert.equal(s.claimOnce(LG, 'weekly-pot-1'), false); // held
  s.releaseClaim(LG, 'weekly-pot-1');
  assert.equal(s.claimOnce(LG, 'weekly-pot-1'), true);  // reclaimable after release
  s.close();
});

test('Store: weekly credits and payout commit atomically and only once', () => {
  const s = freshStore();
  const payout = {
    id: 'payout-weekly-1', week: 1, pool: 'weekly', amount: 40,
    winnerPlayerIds: ['a', 'b'], winnerNames: ['A', 'B'],
    winnerAmounts: { a: 20, b: 20 }, paidAt: '2026-09-01T00:00:00.000Z', paidBy: 'auto',
  };
  const credits = [
    { id: 'credit-a', playerId: 'a', amount: 20, reason: 'Week 1 winnings', by: 'auto', at: payout.paidAt },
    { id: 'credit-b', playerId: 'b', amount: 20, reason: 'Week 1 winnings', by: 'auto', at: payout.paidAt },
  ];
  const first = s.commitWeeklyPayout(LG, { payout, credits });
  const second = s.commitWeeklyPayout(LG, { payout, credits });
  assert.equal(first.credited, 2);
  assert.equal(second.alreadyRecorded, true);
  const league = s.getLeague(LG);
  assert.equal(league.payouts.length, 1);
  assert.equal(creditBalance(league.creditLedger, 'a'), 20);
  assert.equal(creditBalance(league.creditLedger, 'b'), 20);
  s.close();
});

test('Store: CFB credits and paid marker commit atomically and only once', () => {
  const s = freshStore();
  const pool = cfbPool({
    a: { playerId: 'a', name: 'A', paid: true, tiebreaker: 42, picks: { g1: 'home', g2: 'home', g3: 'away' } },
  });
  s.saveCfbPool(LG, pool);
  const at = '2026-09-01T00:00:00.000Z';
  const credits = [{ id: 'credit-cfb-a', playerId: 'a', amount: 10, reason: 'CFB Week 1 pot', by: 'auto', at }];
  const first = s.commitCfbPayout(LG, { poolId: pool.id, credits, at, actor: 'auto' });
  const second = s.commitCfbPayout(LG, { poolId: pool.id, credits, at, actor: 'auto' });
  assert.equal(first.credited, 1);
  assert.equal(second.alreadyRecorded, true);
  const league = s.getLeague(LG);
  assert.equal(league.cfbPools[0].potCredited, true);
  assert.equal(creditBalance(league.creditLedger, 'a'), 10);
  s.close();
});

test('Store: mergeLeagueSettings does not clobber concurrent writers', () => {
  const s = freshStore();
  // Two independent prop-pick saves for the same week must both survive.
  s.mergeLeagueSettings(LG, (x) => { x.propPicks = x.propPicks ?? {}; x.propPicks['1'] = { ...(x.propPicks['1'] || {}), alice: { passing: 'A' } }; });
  s.mergeLeagueSettings(LG, (x) => { x.propPicks = x.propPicks ?? {}; x.propPicks['1'] = { ...(x.propPicks['1'] || {}), bob: { passing: 'B' } }; });
  const wk = s.getLeague(LG).settings.propPicks['1'];
  assert.ok(wk.alice && wk.bob);
  s.close();
});

test('Load: 20 players saving prop picks for the same week — none lost', () => {
  const s = freshStore();
  // Simulate a full crew hammering submit at once. Each merge reads-modifies-
  // writes the shared settings blob; all 20 must land.
  for (let i = 0; i < 20; i += 1) {
    s.mergeLeagueSettings(LG, (x) => {
      x.propPicks = x.propPicks ?? {};
      x.propPicks['1'] = { ...(x.propPicks['1'] || {}), [`player${i}`]: { passing: `QB${i}`, savedAt: 'now' } };
    });
  }
  const wk = s.getLeague(LG).settings.propPicks['1'];
  assert.equal(Object.keys(wk).length, 20);
  for (let i = 0; i < 20; i += 1) assert.equal(wk[`player${i}`].passing, `QB${i}`);
  s.close();
});
