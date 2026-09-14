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
  // Delta never picked g3 or g4, so there is no way left to earn a point and
  // no way to close a 2-point gap. Trailing + nothing to gain = eliminated.
  assert.equal(delta.status, 'eliminated');
  assert.match(delta.reason, /Alpha One/);

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
  // Every entrant here picked the SAME two teams in the remaining games, so no
  // gap can move: trailing by even 1 with identical picks is already over.
  assert.equal(statusOf('chaser'), 'eliminated');
  assert.equal(statusOf('tier'), 'eliminated');
  assert.equal(statusOf('done'), 'eliminated');        // 9 + 2 = 11 < 12, cannot catch him
  assert.equal(statusOf('buried'), 'eliminated');
});

/* ── Shared picks are what actually decides elimination ── */

const slate16 = Array.from({ length: 16 }, (_, i) => ({ id: `w${i + 1}`, away: 'AWY', home: 'HOM', kickoff: `2026-09-${10 + (i % 5)}T00:00:00Z` }));

/** 14 of 16 final (HOM won them all); caller sets each entrant's last two picks. */
function boardWithTwoLeft(entrants) {
  const results = Object.fromEntries(slate16.slice(0, 14).map((g) => [g.id, { winner: 'HOM', verifiedAt: '2026-09-14T00:00:00Z' }]));
  const sheets = entrants.map(({ id, correct, last2, tiebreaker = 45 }) => ({
    id: `s-${id}`, playerId: id, name: id, week: 1, tiebreaker,
    picks: {
      ...Object.fromEntries(slate16.slice(0, 14).map((g, i) => [g.id, i < correct ? 'HOM' : 'AWY'])),
      'w15': last2[0], 'w16': last2[1],
    },
  }));
  const { paths } = buildWinningPaths({ sheets, results }, { week: 1, games: slate16 });
  return Object.fromEntries(paths.map((p) => [p.playerId, p]));
}

test('trailing by 1 with identical remaining picks is already over', () => {
  // This is Anthony's real Week 1 board: Trent up 1, and the chasers had the
  // same two teams left, so the gap was frozen and he had already clinched.
  const by = boardWithTwoLeft([
    { id: 'trent', correct: 12, last2: ['HOM', 'HOM'] },
    { id: 'biglite', correct: 11, last2: ['HOM', 'HOM'] },
    { id: 'mann', correct: 10, last2: ['HOM', 'HOM'] },
  ]);
  assert.equal(by.trent.status, 'clinched');
  assert.equal(by.biglite.status, 'eliminated');
  assert.equal(by.mann.status, 'eliminated');
  assert.match(by.biglite.reason, /same picks/);
  assert.deepEqual(
    { name: by.biglite.blockedBy.name, lead: by.biglite.blockedBy.lead, swingGames: by.biglite.blockedBy.swingGames },
    { name: 'trent', lead: 1, swingGames: 0 },
  );
});

test('the same 1-point gap stays alive when the remaining picks differ', () => {
  const by = boardWithTwoLeft([
    { id: 'trent', correct: 12, last2: ['HOM', 'HOM'] },
    { id: 'biglite', correct: 11, last2: ['AWY', 'AWY'] }, // both games can swing
  ]);
  assert.equal(by.biglite.status, 'alive');
  assert.equal(by.trent.status, 'alive'); // no longer safe — biglite can pass him
});

test('a gap bigger than the number of differing games is still out', () => {
  const by = boardWithTwoLeft([
    { id: 'trent', correct: 12, last2: ['HOM', 'HOM'] },
    { id: 'chaser', correct: 10, last2: ['AWY', 'HOM'] }, // down 2, only 1 can swing
  ]);
  assert.equal(by.chaser.status, 'eliminated');
  assert.match(by.chaser.reason, /only 1 game/);
});

test('when the best you can do is draw level, it says the tiebreaker decides', () => {
  const by = boardWithTwoLeft([
    { id: 'trent', correct: 12, last2: ['HOM', 'HOM'] },
    { id: 'chaser', correct: 11, last2: ['AWY', 'HOM'] }, // down 1, exactly 1 swing game
  ]);
  assert.equal(by.chaser.status, 'on_tiebreaker');
  assert.match(by.chaser.reason, /tiebreaker/);
});

test('every path carries a human reason and still leaks no picks', () => {
  const by = boardWithTwoLeft([
    { id: 'trent', correct: 12, last2: ['HOM', 'HOM'] },
    { id: 'biglite', correct: 11, last2: ['HOM', 'AWY'] },
  ]);
  for (const path of Object.values(by)) {
    assert.ok(path.reason && path.reason.length > 10, `missing reason: ${JSON.stringify(path)}`);
    assert.equal(Object.hasOwn(path, 'picks'), false);
  }
});
