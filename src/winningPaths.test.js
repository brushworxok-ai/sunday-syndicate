import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWinningPaths } from './winningPaths.js';

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
  assert.equal(snapshot.completedCount, 2);
  assert.equal(snapshot.totalGames, 4);

  // Alpha leads 2-0; nobody is clinched or eliminated with two games left.
  const alpha = snapshot.paths.find((path) => path.playerId === 'alpha');
  assert.equal(alpha.score, 2);
  assert.equal(alpha.status, 'alive');
  const delta = snapshot.paths.find((path) => path.playerId === 'delta');
  assert.equal(delta.score, 0);
  assert.equal(delta.status, 'alive'); // 0 + 2 remaining can still tie the leader's 2

  // The snapshot must never leak actual pick selections.
  for (const path of snapshot.paths) {
    assert.equal(Object.hasOwn(path, 'picks'), false);
    assert.equal(Object.hasOwn(path, 'remainingPicks'), false);
  }
});

test('all-final week clinches the top score and eliminates trailing entries', () => {
  const finalLeague = {
    ...league,
    results: {
      g1: { winner: 'A', status: 'final' },
      g2: { winner: 'D', status: 'final' },
      g3: { winner: 'E', status: 'final' },
      g4: { winner: 'G', status: 'final' },
    },
  };
  const snapshot = buildWinningPaths(finalLeague, { season: 2026, week: 1, games });
  const alpha = snapshot.paths.find((path) => path.playerId === 'alpha'); // 4-0
  const delta = snapshot.paths.find((path) => path.playerId === 'delta'); // 0-2, no picks in g3/g4
  assert.equal(alpha.status, 'clinched');
  assert.equal(alpha.score, 4);
  assert.equal(delta.status, 'eliminated');
  assert.equal(snapshot.completedCount, 4);
});

test('elimination math respects maximum possible score mid-week', () => {
  const midLeague = {
    ...league,
    sheets: [
      { id: 's1', playerId: 'alpha', name: 'Alpha One', season: 2026, week: 1, picks: { g1: 'A', g2: 'D', g3: 'E', g4: 'G' } },
      // Delta only entered two games and lost both — max possible 2 < leader's current 2 is false (equal), so alive;
      // but with three results in, 0 + 1 remaining < 3 leader = eliminated.
      { id: 's4', playerId: 'delta', name: 'Delta Four', season: 2026, week: 1, picks: { g1: 'B', g2: 'C', g3: 'F' } },
    ],
    results: {
      g1: { winner: 'A', status: 'final' },
      g2: { winner: 'D', status: 'final' },
      g3: { winner: 'E', status: 'final' },
    },
  };
  const snapshot = buildWinningPaths(midLeague, { season: 2026, week: 1, games });
  const delta = snapshot.paths.find((path) => path.playerId === 'delta');
  assert.equal(delta.status, 'eliminated'); // 0 correct + 1 remaining < leader's 3
});

/* The real Week 1 board, two games left: the leader sat on 12, three players on
   11 could pass him, one on 10 could only tie him (tiebreaker), and everyone at
   9 or below was mathematically done. Anthony questioned the ALIVE badges on
   exactly this board, so pin the boundary. */
test('with 2 games left, only players who can reach the leader stay alive', () => {
  const slate = Array.from({ length: 16 }, (_, i) => ({ id: `w${i + 1}`, away: 'AWY', home: 'HOM', kickoff: `2026-09-${10 + (i % 5)}T00:00:00Z` }));
  const finals = slate.slice(0, 14);
  const results = Object.fromEntries(finals.map((g) => [g.id, { winner: 'HOM', verifiedAt: '2026-09-14T00:00:00Z' }]));

  // Give each player exactly N correct picks out of the 14 decided games.
  const entrant = (id, correct, tiebreaker) => ({
    id: `s-${id}`, playerId: id, name: id, week: 1, tiebreaker,
    picks: Object.fromEntries(slate.map((g, i) => [g.id, i < correct ? 'HOM' : 'AWY'])),
  });
  const sheets = [
    entrant('leader', 12, 45), entrant('chaser', 11, 44),
    entrant('tier', 10, 43), entrant('done', 9, 42), entrant('buried', 6, 41),
  ];

  const { paths } = buildWinningPaths(
    { players: sheets.map((s) => ({ id: s.playerId, name: s.name })), sheets, results },
    { week: 1, games: slate },
  );
  const statusOf = (id) => paths.find((p) => p.playerId === id)?.status;

  assert.notEqual(statusOf('leader'), 'eliminated');
  assert.notEqual(statusOf('chaser'), 'eliminated');   // 11 + 2 = 13 > 12, can win outright
  assert.notEqual(statusOf('tier'), 'eliminated');     // 10 + 2 = 12, can tie -> tiebreaker
  assert.equal(statusOf('done'), 'eliminated');        // 9 + 2 = 11 < 12, cannot catch him
  assert.equal(statusOf('buried'), 'eliminated');
});
