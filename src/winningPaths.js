/**
 * Winning-paths analysis — clinch / alive / eliminated for each entry.
 *
 * The naive version ("could they still go perfect?") is wrong for a pick'em
 * pool, because a game both players picked the same way CANNOT change the gap
 * between them: either both get the point or neither does. Trailing by 1 with
 * two games left means nothing if you and the leader picked both games
 * identically — you are done, and the board should say so.
 *
 * So everything here is head-to-head. For a pair (me, rival), the only games
 * that can move our gap are the remaining ones where I have a pick and the
 * rival picked the other side (or has no pick at all). Call that count D.
 *   - I can still catch that rival  <=>  rival.score - my.score <= D
 *   - I beat that rival no matter what <=>  my.score - rival.score > D
 * Eliminated = some rival I can't catch. Clinched = I beat every rival in
 * every remaining scenario.
 */

/** Remaining games where `me` can gain a point that `rival` does not. */
function swingGames(remaining, me, rival) {
  return remaining.filter((game) => {
    const mine = me.picks?.[game.id];
    if (!mine) return false;                    // no pick, no points to gain
    return rival.picks?.[game.id] !== mine;     // same pick = gap is frozen
  }).length;
}

export function buildWinningPaths(league, weekContext) {
  const { sheets = [], results = {} } = league;
  const { week, games = [] } = weekContext;

  const totalGames = games.length;
  const decided = games.filter((game) => results[game.id]?.winner);
  const remaining = games.filter((game) => !results[game.id]?.winner);
  const completedCount = decided.length;

  const scored = sheets.map((sheet) => ({
    entryId: sheet.id,
    playerId: sheet.playerId,
    name: sheet.name,
    picks: sheet.picks ?? {},
    score: decided.reduce((total, game) => total + (sheet.picks?.[game.id] === results[game.id].winner ? 1 : 0), 0),
    tiebreaker: sheet.tiebreaker ?? 0,
  }));

  if (!scored.length) return { week, paths: [], completedCount, totalGames };

  const bestCurrentScore = Math.max(...scored.map((entry) => entry.score));

  const paths = scored.map((entry) => {
    const rivals = scored.filter((other) => other.entryId !== entry.entryId);

    /* Against each rival: how far behind am I, and how many of the remaining
       games can actually move that gap? */
    const matchups = rivals.map((rival) => {
      const swing = swingGames(remaining, entry, rival);
      const deficit = rival.score - entry.score;
      return { rival, swing, deficit, canCatch: deficit <= swing, safeFrom: -deficit > swing };
    });

    const blockers = matchups.filter((m) => !m.canCatch)
      .sort((a, b) => (b.deficit - b.swing) - (a.deficit - a.swing));
    const eliminated = blockers.length > 0;
    const clinched = remaining.length === 0
      ? entry.score === bestCurrentScore && scored.filter((s) => s.score === bestCurrentScore).length === 1
      : matchups.every((m) => m.safeFrom);

    /* Can I only draw level with my toughest live rival? Then the tiebreaker
       decides it, and players should know that's all they're playing for. */
    const tightest = matchups.filter((m) => m.canCatch)
      .sort((a, b) => (b.deficit - b.swing) - (a.deficit - a.swing))[0];
    const onTiebreaker = !eliminated && !clinched && Boolean(tightest) && tightest.deficit === tightest.swing && tightest.deficit > 0;

    let status = 'alive';
    if (clinched) status = 'clinched';
    else if (eliminated) status = 'eliminated';
    else if (onTiebreaker) status = 'on_tiebreaker';

    return {
      entryId: entry.entryId,
      playerId: entry.playerId,
      name: entry.name,
      score: entry.score,
      tiebreaker: entry.tiebreaker,
      maxPossible: entry.score + swingGames(remaining, entry, { picks: {} }),
      status,
      clinched,
      eliminated,
      alive: !eliminated && !clinched,
      remainingGames: remaining.length,
      reason: explain({ entry, blockers, tightest, clinched, eliminated, onTiebreaker, remaining, matchups }),
      blockedBy: blockers[0] ? { name: blockers[0].rival.name, lead: blockers[0].deficit, swingGames: blockers[0].swing } : null,
    };
  });

  return { week, paths, completedCount, totalGames };
}

/** Plain-English "why" — this is what a player reads on the board. */
function explain({ entry, blockers, tightest, clinched, eliminated, onTiebreaker, remaining, matchups }) {
  const games = (n) => `${n} game${n === 1 ? '' : 's'}`;

  if (!remaining.length) {
    return eliminated ? `Week's over — ${blockers[0].rival.name} finished ahead.` : 'Week complete.';
  }

  if (clinched) {
    const closest = [...matchups].sort((a, b) => (b.deficit - b.swing) - (a.deficit - a.swing))[0];
    return closest
      ? `Locked it up — ${closest.rival.name} can't catch up with ${games(remaining.length)} left.`
      : 'Locked it up.';
  }

  if (eliminated) {
    const { rival, deficit, swing } = blockers[0];
    if (swing === 0) {
      return `${rival.name} is up ${deficit} and you made the same picks in ${remaining.length === 1 ? 'the last game' : `all ${games(remaining.length)} left`} — the gap can't move.`;
    }
    return `${rival.name} is up ${deficit} and only ${games(swing)} left ${swing === 1 ? 'has' : 'have'} different picks, so you can close ${swing} at most.`;
  }

  if (onTiebreaker) {
    return `Best case you tie ${tightest.rival.name} — the tiebreaker decides it.`;
  }

  const chase = [...matchups].sort((a, b) => (b.deficit - b.swing) - (a.deficit - a.swing))[0];
  if (chase && chase.deficit > 0) {
    return `Down ${chase.deficit} to ${chase.rival.name}, with ${games(chase.swing)} left where your picks differ.`;
  }
  return `In front — ${games(remaining.length)} left to hold on.`;
}
