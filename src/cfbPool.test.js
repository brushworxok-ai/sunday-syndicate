import test from 'node:test';
import assert from 'node:assert/strict';
import { getCfbDeadline, isCfbPoolLocked, formatCfbDeadline, formatCfbKickoff, validateCfbPicks } from './cfbPool.js';
import { buildLeagueView } from '../server/publicLeagueView.js';

const pool = {
  id: 'college-test', status: 'open',
  games: [{ id: 'late', date: '2026-10-17T19:30:00Z' }, { id: 'first', date: '2026-10-17T12:00:00-04:00' }],
  entries: { player: { playerId: 'player', picks: { late: 'away', first: 'home' }, tiebreaker: 42, paid: true, submittedAt: '2026-10-16T12:00:00Z' } },
};
const cutoff = Date.parse('2026-10-17T15:00:00Z');

test('college deadline uses the earliest valid kickoff, irrespective of ordering or UTC offset', () => {
  assert.equal(getCfbDeadline(pool).toISOString(), '2026-10-17T15:00:00.000Z');
  assert.equal(getCfbDeadline({ games: [...pool.games, { date: 'invalid' }, { date: null }, {}] }).getTime(), cutoff);
  assert.equal(getCfbDeadline({ games: [{ date: 'invalid' }, { date: null }, { date: '' }, {}] }), null);
  assert.equal(getCfbDeadline(null), null);
});

for (const [label, offset, allowed] of [['before', -1, true], ['at', 0, false], ['after', 1, false]]) {
  test(`college submissions and updates ${label} cutoff; stored picks remain unchanged`, () => {
    const original = structuredClone(pool);
    const now = new Date(cutoff + offset);
    const verdict = validateCfbPicks({ pool, picks: { late: 'home', first: 'away' }, tiebreaker: 48, now });
    assert.equal(verdict.ok, allowed);
    assert.equal(isCfbPoolLocked(pool, now), !allowed);
    if (!allowed) assert.match(verdict.error, /1 hour before/);
    assert.deepEqual(pool, original);
  });
  test(`rival picks ${label} cutoff follow the same lock even before autopilot saves status`, () => {
    const view = buildLeagueView({ cfbPools: [pool] }, { now: cutoff + offset });
    assert.deepEqual(view.cfbPools[0].entries.player.picks, allowed ? {} : pool.entries.player.picks);
  });
}

test('manual lock/final cannot be bypassed before the deadline', () => {
  for (const status of ['locked', 'final']) {
    assert.equal(validateCfbPicks({ pool: { ...pool, status }, picks: pool.entries.player.picks, tiebreaker: 42, now: new Date(cutoff - 1) }).ok, false);
  }
});

test('deadline and kickoff use matching explicit Central labels in summer and winter', () => {
  const zone = 'America/Chicago';
  assert.match(formatCfbDeadline(new Date(cutoff), zone), /10:00 AM CDT/);
  assert.match(formatCfbDeadline(new Date(cutoff), zone), /Oct 17, 2026/);
  assert.match(formatCfbKickoff(new Date(cutoff + 3_600_000), zone), /11:00 AM CDT/);
  assert.match(formatCfbDeadline(new Date('2026-12-05T16:00:00Z'), zone), /10:00 AM CST/);
  assert.match(formatCfbKickoff(new Date('2026-12-05T17:00:00Z'), zone), /11:00 AM CST/);
  assert.equal(formatCfbDeadline(null), 'Awaiting a valid kickoff time');
});

test('both labels default to the runtime timezone instead of fixed Eastern time', () => {
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.equal(formatCfbDeadline(new Date(cutoff)), formatCfbDeadline(new Date(cutoff), localZone));
  assert.equal(formatCfbKickoff(new Date(cutoff)), formatCfbKickoff(new Date(cutoff), localZone));
});

test('DST transition subtracts an absolute hour even when the clock hour repeats', () => {
  const kickoff = new Date('2026-11-01T07:30:00Z');
  const deadline = getCfbDeadline({ games: [{ date: kickoff.toISOString() }] });
  assert.equal(kickoff - deadline, 3_600_000);
  assert.match(formatCfbDeadline(deadline, 'America/Chicago'), /1:30 AM CDT/);
  assert.match(formatCfbKickoff(kickoff, 'America/Chicago'), /1:30 AM CST/);
});

test('subtracting one hour handles a date boundary', () => {
  assert.equal(getCfbDeadline({ games: [{ date: '2026-10-18T00:30:00Z' }] }).toISOString(), '2026-10-17T23:30:00.000Z');
});
