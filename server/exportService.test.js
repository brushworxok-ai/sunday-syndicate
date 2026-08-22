import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeagueBackup, buildWeeklyOperationsCsv } from './exportService.js';

test('backup preserves commissioner-only selections and identifies itself as private', () => {
  const league = { id: 'league-1', sheets: [{ picks: { g1: 'KC' } }] };
  const backup = buildLeagueBackup(league, { generatedAt: '2026-08-19T00:00:00.000Z' });
  assert.equal(backup.schemaVersion, 1);
  assert.equal(backup.league.sheets[0].picks.g1, 'KC');
  assert.match(backup.warning, /Private commissioner export/);
});

test('weekly CSV escapes player names and includes financial operations fields', () => {
  const csv = buildWeeklyOperationsCsv({
    season: 2026,
    week: 1,
    league: { season: 2026, players: [{ id: 'p1', favoriteTeam: 'DAL' }], sheets: [{ playerId: 'p1', season: 2026, week: 1, paid: true, picks: { g1: 'DAL' } }], results: { g1: { winner: 'DAL' } } },
    finance: { players: [{ playerId: 'p1', name: 'Eubanks, Anthony', balanceCents: 2000, entryCreditCount: 1, winCount: 2, perfectSheetCount: 0, lifetimeWinningsCents: 5000, pendingWinningsCents: 1000 }] },
  });
  assert.match(csv, /"Eubanks, Anthony"/);
  assert.match(csv, /DAL/);
  assert.match(csv, /20\.00/);
});
