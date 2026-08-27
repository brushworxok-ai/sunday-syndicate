import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeasonRace } from './seasonRace.js';

const players = [
  { id: 'a', name: 'Avery', favoriteTeam: 'DAL' },
  { id: 'b', name: 'Blake', favoriteTeam: 'KC' },
  { id: 'c', name: 'Chris', favoriteTeam: 'BUF' },
];

const win = (week, winners, options = {}) => ({
  id: `settlement-${week}`,
  season: 2026,
  week,
  status: options.status ?? 'paid',
  perfectSheet: Boolean(options.perfectSheet),
  winners: winners.map((playerId) => ({ playerId, name: players.find((player) => player.id === playerId)?.name, payoutCents: 2000 })),
});

test('season race counts settled weekly wins, shared wins, perfect sheets, and payouts', () => {
  const race = buildSeasonRace({ players, weeklySettlements: [win(1, ['a']), win(2, ['a', 'b']), win(3, ['b'], { perfectSheet: true }), win(4, [], { status: 'rollover' })] }, { season: 2026 });
  assert.equal(race.weeksSettled, 4);
  assert.equal(race.topWins, 2);
  assert.deepEqual(race.leaders.map((entry) => entry.playerId), ['b', 'a']);
  assert.equal(race.records.find((entry) => entry.playerId === 'a').outrightWins, 1);
  assert.equal(race.records.find((entry) => entry.playerId === 'a').sharedWins, 1);
  assert.equal(race.records.find((entry) => entry.playerId === 'b').perfectSheets, 1);
  assert.equal(race.awardedWinCount, 4);
});

test('season title remains live until Week 18 is settled', () => {
  const race = buildSeasonRace({ players, weeklySettlements: [win(1, ['a']), win(17, ['b'])] }, { season: 2026 });
  assert.equal(race.status, 'live');
  assert.equal(race.complete, false);
  assert.deepEqual(race.champions, []);
});

test('Week 18 locks the most-weekly-wins player as season champion', () => {
  const race = buildSeasonRace({ players, weeklySettlements: [win(1, ['a']), win(2, ['a']), win(18, ['b'])] }, { season: 2026 });
  assert.equal(race.status, 'official');
  assert.deepEqual(race.champions.map((entry) => entry.playerId), ['a']);
  assert.equal(race.champions[0].weeklyWins, 2);
});

test('equal season win totals produce co-champions without a hidden tiebreaker', () => {
  const race = buildSeasonRace({ players, weeklySettlements: [win(1, ['a']), win(2, ['b']), win(18, ['c'])] }, { season: 2026 });
  assert.deepEqual(race.champions.map((entry) => entry.playerId), ['a', 'b', 'c']);
  assert.ok(race.champions.every((entry) => entry.rank === 1));
});

