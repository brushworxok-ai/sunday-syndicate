// CFB Pick-Em pool — shared grading + validation used by both server and frontend.
// Pools grade picks against the spread (ATS) using the spread snapshotted at pool creation.

/**
 * Grade a single game ATS.
 * homeSpread is the home team's line (negative = home favored, e.g. -6.5).
 * Returns 'home' | 'away' | 'push' | null (not final yet).
 */
export function gradeGameAts(game, score) {
  if (!score || !score.final) return null;
  const homeSpread = Number(game.homeSpread);
  if (!Number.isFinite(homeSpread)) {
    // No spread available — grade straight up.
    if (score.homeScore === score.awayScore) return 'push';
    return score.homeScore > score.awayScore ? 'home' : 'away';
  }
  const adjusted = (score.homeScore - score.awayScore) + homeSpread;
  if (adjusted > 0) return 'home';
  if (adjusted < 0) return 'away';
  return 'push';
}

/** Validate a picks submission against a pool. Returns { ok } or { ok:false, error }. */
export function validateCfbPicks({ pool, picks, tiebreaker, now = new Date() }) {
  if (!pool) return { ok: false, error: 'Pool not found.' };
  if (pool.status !== 'open') return { ok: false, error: 'This pool is locked — picks can no longer be changed.' };
  // Auto-lock at the first kickoff even if the commissioner forgot to lock —
  // nobody gets to pick after games have started.
  const firstKick = (pool.games ?? []).map((g) => new Date(g.date)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b)[0];
  if (firstKick && now >= firstKick) return { ok: false, error: 'This pool locked at the first kickoff — picks can no longer be changed.' };
  if (!picks || typeof picks !== 'object' || Array.isArray(picks)) return { ok: false, error: 'Picks are required.' };
  const gameIds = new Set((pool.games ?? []).map((g) => g.id));
  const entries = Object.entries(picks);
  if (!entries.length) return { ok: false, error: 'Pick at least one game before submitting.' };
  for (const [gameId, side] of entries) {
    if (!gameIds.has(gameId)) return { ok: false, error: 'One of your picks is for a game not in this pool.' };
    if (side !== 'home' && side !== 'away') return { ok: false, error: 'Picks must choose the home or away side.' };
  }
  if (entries.length !== gameIds.size) return { ok: false, error: `Pick every game — ${gameIds.size - entries.length} still open.` };
  const tb = Number(tiebreaker);
  if (tiebreaker == null || String(tiebreaker).trim() === '' || typeof tiebreaker === 'boolean' || !Number.isFinite(tb) || tb < 0 || tb > 200 || !Number.isInteger(tb)) {
    return { ok: false, error: 'Tiebreaker must be a whole number between 0 and 200 (total points in the tiebreaker game).' };
  }
  return { ok: true };
}

/** The last-kickoff game in the pool is the tiebreaker game. */
export function getTiebreakerGame(pool) {
  const games = [...(pool?.games ?? [])];
  games.sort((a, b) => new Date(a.date) - new Date(b.date));
  return games.at(-1) ?? null;
}

/**
 * Compute the pool leaderboard.
 * Returns { rows, gamesFinal, gamesTotal, tiebreakerGame, tiebreakerTotal, complete, winners }.
 * Rank: wins desc → pushes desc → tiebreaker distance asc → earliest submit.
 */
export function gradeCfbPool(pool) {
  const games = pool?.games ?? [];
  const scores = pool?.scores ?? {};
  const covers = Object.fromEntries(games.map((g) => [g.id, gradeGameAts(g, scores[g.id])]));
  const gamesFinal = games.filter((g) => covers[g.id] !== null).length;
  const tiebreakerGame = getTiebreakerGame(pool);
  const tbScore = tiebreakerGame ? scores[tiebreakerGame.id] : null;
  const tiebreakerTotal = tbScore?.final ? tbScore.homeScore + tbScore.awayScore : null;

  const rows = Object.values(pool?.entries ?? {}).map((entry) => {
    let wins = 0; let losses = 0; let pushes = 0;
    for (const game of games) {
      const cover = covers[game.id];
      if (cover === null) continue;
      const pick = entry.picks?.[game.id];
      if (!pick) { losses += 1; continue; }
      if (cover === 'push') pushes += 1;
      else if (pick === cover) wins += 1;
      else losses += 1;
    }
    const tbDiff = tiebreakerTotal != null && Number.isFinite(Number(entry.tiebreaker))
      ? Math.abs(Number(entry.tiebreaker) - tiebreakerTotal)
      : null;
    return { ...entry, wins, losses, pushes, tbDiff };
  });

  rows.sort((a, b) =>
    b.wins - a.wins
    || b.pushes - a.pushes
    || (a.tbDiff ?? 999) - (b.tbDiff ?? 999)
    || String(a.submittedAt ?? '').localeCompare(String(b.submittedAt ?? '')));

  const complete = games.length > 0 && gamesFinal === games.length;
  const winners = complete && rows.length
    ? rows.filter((row) => row.wins === rows[0].wins && row.pushes === rows[0].pushes && (row.tbDiff ?? 999) === (rows[0].tbDiff ?? 999))
    : [];

  return { rows, covers, gamesFinal, gamesTotal: games.length, tiebreakerGame, tiebreakerTotal, complete, winners };
}
