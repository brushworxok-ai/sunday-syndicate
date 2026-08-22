/**
 * Winning-paths analysis — calculates clinch / alive / eliminated status
 * for each entry based on remaining games in the current week.
 */

export function buildWinningPaths(league, weekContext) {
  const { players = [], sheets = [], results = {} } = league;
  const { week, games = [] } = weekContext;

  const totalGames = games.length;
  const decided = games.filter((g) => results[g.id]?.winner);
  const remaining = games.filter((g) => !results[g.id]?.winner);
  const completedCount = decided.length;

  const scored = sheets.map((sheet) => {
    let correct = 0;
    for (const game of decided) {
      const pick = sheet.picks?.[game.id];
      const result = results[game.id];
      if (pick && result && pick === result.winner) correct += 1;
    }
    return {
      entryId: sheet.id,
      playerId: sheet.playerId,
      name: sheet.name,
      score: correct,
      tiebreaker: sheet.tiebreaker ?? 0,
      maxPossible: correct + remaining.length,
    };
  });

  if (!scored.length) return { week, paths: [], completedCount, totalGames };

  const bestCurrentScore = Math.max(...scored.map((s) => s.score));
  const bestPossible = Math.max(...scored.map((s) => s.maxPossible));

  const paths = scored.map((entry) => {
    const { score, maxPossible, tiebreaker } = entry;

    // Clinched: even if everyone else gets remaining games right,
    // this entry's current score is still the highest possible
    const clinched = remaining.length === 0
      ? score === bestCurrentScore
      : score > bestPossible - score; // simplified heuristic

    // Eliminated: even getting every remaining game right can't catch the leader
    const eliminated = maxPossible < bestCurrentScore;

    // Alive: not yet eliminated and not yet clinched
    const alive = !eliminated && !clinched;

    let status = 'alive';
    if (clinched) status = 'clinched';
    else if (eliminated) status = 'eliminated';

    return {
      entryId: entry.entryId,
      playerId: entry.playerId,
      name: entry.name,
      score,
      tiebreaker,
      maxPossible,
      status,
      clinched,
      eliminated,
      alive,
      remainingGames: remaining.length,
    };
  });

  return { week, paths, completedCount, totalGames };
}

export function buildJackUpdate() { return null; }
export function isJackPostingWindow() { return false; }
