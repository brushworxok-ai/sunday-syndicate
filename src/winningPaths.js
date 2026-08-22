/**
 * winningPaths.js — live "who can still win" math for the weekly pick'em pot.
 *
 * For every entry we ask two exact questions against the remaining
 * (unverified) games:
 *
 *   BEST CASE  — every remaining game goes the entry's way. In that single
 *   scenario, entry A's margin over entry B is:
 *       score_A − score_B + (# remaining games where their picks differ)
 *   If that margin is negative for any opponent, A is mathematically OUT.
 *   If A's minimum margin is exactly 0, A can only tie — tiebreaker decides.
 *
 *   WORST CASE — every remaining game goes against the entry. A's margin
 *   over B becomes score_A − score_B − diff. If that stays positive against
 *   every opponent, A has CLINCHED the week outright.
 */

import { getGames, getCurrentWeek } from './data.js';
import { buildLeaderboard } from './demoLeague.js';

/** Games that count as decided: a verified winner is on the board. */
function decidedGameIds(weekGames, results) {
  return new Set(weekGames.filter((g) => results[g.id]?.winner).map((g) => g.id));
}

/** # of remaining games where two sheets picked different teams. */
function pickDifference(picksA, picksB, remainingGames) {
  let diff = 0;
  for (const game of remainingGames) {
    const a = picksA?.[game.id];
    const b = picksB?.[game.id];
    if (a && b && a !== b) diff += 1;
    else if (Boolean(a) !== Boolean(b)) diff += 1; // one sheet missing a pick still separates them
  }
  return diff;
}

/**
 * Should Jack be posting live updates? Yes while the week has entries and
 * games are mid-flight (some decided, not all decided).
 */
export function isJackPostingWindow({ games = [], snapshot = {}, now = new Date() } = {}) {
  void now;
  if (!games.length) return false;
  if (snapshot.allFinal) return false;
  return (snapshot.verifiedCount ?? 0) > 0 || games.some((g) => g.winner || g.awayScore != null);
}

/**
 * Snapshot of the week: exact clinch/alive/tiebreaker/eliminated status for
 * every entry, plus a dedup stateKey.
 */
export function buildWinningPaths(league, { season, week, games } = {}) {
  const weekNumber = week ?? league?.week ?? getCurrentWeek();
  const weekGames = games ?? getGames(weekNumber);
  const results = league?.results ?? {};

  const sheets = (league?.sheets ?? []).filter((s) => s.week === weekNumber);
  const leaderboard = buildLeaderboard(league?.players ?? [], sheets, results);

  const decided = decidedGameIds(weekGames, results);
  const remainingGames = weekGames.filter((g) => !decided.has(g.id));
  const allFinal = remainingGames.length === 0 && weekGames.length > 0;

  const entries = leaderboard.map((entry) => {
    const sheet = sheets.find((s) => s.id === entry.id || (entry.playerId && s.playerId === entry.playerId) || s.name === entry.name);
    return { ...entry, picks: entry.picks ?? sheet?.picks ?? {} };
  });

  const paths = entries.map((A) => {
    let bestMarginMin = Infinity;   // A's best-case margin vs its toughest rival
    let worstMarginMin = Infinity;  // A's worst-case margin vs its toughest rival
    for (const B of entries) {
      if (B === A) continue;
      const diff = pickDifference(A.picks, B.picks, remainingGames);
      bestMarginMin = Math.min(bestMarginMin, A.score - B.score + diff);
      worstMarginMin = Math.min(worstMarginMin, A.score - B.score - diff);
    }
    if (entries.length === 1) { bestMarginMin = 1; worstMarginMin = 1; }

    let status;
    if (allFinal) status = bestMarginMin > 0 ? 'won' : bestMarginMin === 0 ? 'on_tiebreaker' : 'eliminated';
    else if (worstMarginMin > 0) status = 'clinched';
    else if (bestMarginMin > 0) status = 'alive';
    else if (bestMarginMin === 0) status = 'on_tiebreaker';
    else status = 'eliminated';

    return {
      playerId: A.playerId ?? null,
      entryId: A.id ?? null,
      name: A.name,
      score: A.score,
      rank: A.rank,
      tiebreaker: A.tiebreaker,
      maxPossible: A.score + remainingGames.filter((g) => A.picks?.[g.id]).length,
      gamesRemaining: remainingGames.length,
      status,
      bestCaseMargin: Number.isFinite(bestMarginMin) ? bestMarginMin : null,
      worstCaseMargin: Number.isFinite(worstMarginMin) ? worstMarginMin : null,
    };
  });

  const stateKey = `w${weekNumber}-v${decided.size}-${paths.map((p) => `${p.playerId ?? p.name}:${p.score}:${p.status}`).join(',')}`;

  return {
    season: season ?? league?.settings?.season ?? null,
    week: weekNumber,
    paths,
    stateKey,
    allFinal,
    verifiedCount: decided.size,
    totalGames: weekGames.length,
    leader: paths[0] ?? null,
    aliveCount: paths.filter((p) => p.status === 'alive' || p.status === 'clinched' || p.status === 'on_tiebreaker').length,
  };
}

/** Structured live-desk update built from a snapshot. */
export function buildJackUpdate(snapshot, { createdAt, trigger = 'score_change', feedState = 'scheduled' } = {}) {
  const clinched = snapshot.paths.filter((p) => p.status === 'clinched' || p.status === 'won');
  const out = snapshot.paths.filter((p) => p.status === 'eliminated');
  const headline = snapshot.allFinal
    ? `Final: ${snapshot.leader?.name ?? 'nobody'} takes the week at ${snapshot.leader?.score ?? 0} correct.`
    : clinched.length
      ? `${clinched.map((p) => p.name).join(' & ')} ${clinched.length > 1 ? 'have' : 'has'} CLINCHED with ${snapshot.totalGames - snapshot.verifiedCount} games left. Everyone else is playing for pride.`
      : `${snapshot.verifiedCount}/${snapshot.totalGames} final — ${snapshot.aliveCount} still alive${out.length ? `, ${out.map((p) => p.name).join(' & ')} mathematically cooked` : ''}.`;
  return {
    id: `jack-update-${(createdAt ?? new Date().toISOString()).replace(/\D/g, '').slice(0, 14)}-${snapshot.stateKey.length}`,
    season: snapshot.season,
    week: snapshot.week,
    stateKey: snapshot.stateKey,
    headline,
    leader: snapshot.leader,
    standings: snapshot.paths,
    allFinal: snapshot.allFinal,
    verifiedCount: snapshot.verifiedCount,
    totalGames: snapshot.totalGames,
    trigger,
    feedState,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}
