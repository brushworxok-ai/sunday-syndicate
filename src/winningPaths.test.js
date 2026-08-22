import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJackUpdate, buildWinningPaths, isJackPostingWindow } from './winningPaths.js';

const games = [
  { id: 'g1', away: 'A', home: 'B', kickoff: '2026-09-10T00:00:00Z' },
  { id: 'g2', away: 'C', home: 'D', kickoff: '2026-09-11T00:00:00Z' },
  { id: 'g3', away: 'E', home: 'F', kickoff: '2026-09-12T00:00:00Z' },
  { id: 'g4', away: 'G', home: 'H', kickoff: '2026-09-13T00:00:00Z' },
];

const league = {
  season: 2026,
  week: 1,
  players: [
    { id: 'alpha', name: 'Alpha One', trashTalk: { level: 'none' } },
    { id: 'bravo', name: 'Bravo Two', trashTalk: { level: 'maximum' } },
  ],
  sheets: [
    { id: 's1', playerId: 'alpha', name: 'Alpha One', season: 2026, week: 1, picks: { g1: 'A', g2: 'D', g3: 'E', g4: 'G' } },
    { id: 's2', playerId: 'bravo', name: 'Bravo Two', season: 2026, week: 1, picks: { g1: 'B', g2: 'D', g3: 'F', g4: 'H' } },
    { id: 's3', playerId: 'charlie', name: 'Charlie Three', season: 2026, week: 1, picks: { g1: 'B', g2: 'C', g3: 'E', g4: 'G' } },
    { id: 's4', playerId: 'delta', name: 'Delta Four', season: 2026, week: 1, picks: { g1: 'B', g2: 'C' } },
  ],
  results: {
    g1: { winner: 'A', status: 'final', verifiedAt: '2026-09-10T03:00:00Z' },
    g2: { winner: 'D', status: 'final', verifiedAt: '2026-09-11T03:00:00Z' },
    g3: { status: 'in_progress', awayScore: 7, homeScore: 3 },
  },
};

test('winning paths cover every player without revealing hidden selections', () => {
  const snapshot = buildWinningPaths(league, { season: 2026, week: 1, games });
  assert.equal(snapshot.paths.length, 4);
  assert.equal(snapshot.completedGames, 2);
  assert.equal(snapshot.liveGames, 1);
  assert.equal(snapshot.paths.find((path) => path.playerId === 'alpha').status, 'leading');
  assert.equal(snapshot.paths.find((path) => path.playerId === 'bravo').status, 'alive');
  assert.equal(snapshot.paths.find((path) => path.playerId === 'charlie').status, 'tiebreaker_path');
  assert.equal(snapshot.paths.find((path) => path.playerId === 'delta').status, 'eliminated');
  for (const path of snapshot.paths) {
    assert.equal(Object.hasOwn(path, 'picks'), false);
    assert.equal(Object.hasOwn(path, 'remainingPicks'), false);
  }
  const update = buildJackUpdate(snapshot, { createdAt: '2026-09-12T02:00:00Z', feedState: 'live' });
  assert.match(update.publicText, /Alpha:/);
  assert.match(update.publicText, /Bravo:/);
  assert.match(update.publicText, /Charlie:/);
  assert.match(update.publicText, /Delta:/);
  assert.match(update.publicText, /Hidden picks stay hidden/);
  assert.doesNotMatch(update.publicText, /g1|g2|g3|g4|maximum|roast/i);
});

test('fallback copy is explicit and a final state does not claim an unsettled winner', () => {
  const finalLeague = { ...league, results: Object.fromEntries(games.map((game, index) => [game.id, { winner: index % 2 ? game.home : game.away, status: 'final', verifiedAt: '2026-09-14T03:00:00Z' }])) };
  const snapshot = buildWinningPaths(finalLeague, { season: 2026, week: 1, games });
  const update = buildJackUpdate(snapshot, { feedState: 'delayed', createdAt: '2026-09-14T03:01:00Z' });
  assert.equal(snapshot.allFinal, true);
  assert.match(update.publicText, /top final score/);
  assert.match(update.publicText, /Saved verified scores/);
  assert.doesNotMatch(update.publicText, /official winner/i);
});

test('the automatic desk opens four days before kickoff and stays available during live scoring', () => {
  const pregame = buildWinningPaths({ ...league, results: {} }, { season: 2026, week: 1, games });
  assert.equal(isJackPostingWindow({ games, snapshot: pregame, now: new Date('2026-09-06T00:01:00Z') }), true);
  assert.equal(isJackPostingWindow({ games, snapshot: pregame, now: new Date('2026-08-20T00:00:00Z') }), false);
  const live = buildWinningPaths(league, { season: 2026, week: 1, games });
  assert.equal(isJackPostingWindow({ games, snapshot: live, now: new Date('2027-01-01T00:00:00Z') }), true);
});
