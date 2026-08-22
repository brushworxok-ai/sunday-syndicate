/**
 * survivor.js — Survivor side pool.
 *
 * Rules: pick ONE team to win each week. You can never reuse a team all
 * season. If your team loses (verified result), you're eliminated. Last
 * player standing wins the survivor pot.
 *
 * Elimination is DERIVED from verified results, never stored — so a score
 * correction automatically un-eliminates or eliminates the right people.
 */

import { getGames, TEAMS } from './data.js';

/** Find the game a team plays in a given week (null on bye). */
export function findTeamGame(weekNum, team) {
  return getGames(weekNum).find((g) => g.away === team || g.home === team) ?? null;
}

/**
 * Derive the full survivor pool state.
 * survivorPicks: [{ playerId, week, team, pickedAt }]
 * results: { [gameId]: { winner, verifiedAt } }
 */
export function deriveSurvivorPool({ survivorPicks = [], players = [], results = {} } = {}) {
  const byPlayer = new Map();
  for (const pick of survivorPicks) {
    if (!byPlayer.has(pick.playerId)) byPlayer.set(pick.playerId, []);
    byPlayer.get(pick.playerId).push(pick);
  }

  const entries = [];
  for (const [playerId, picks] of byPlayer) {
    const player = players.find((p) => p.id === playerId);
    const ordered = [...picks].sort((a, b) => a.week - b.week);
    let eliminatedWeek = null;
    let wins = 0;
    const history = ordered.map((pick) => {
      const game = findTeamGame(pick.week, pick.team);
      const result = game ? results[game.id] : null;
      let outcome = 'pending';
      if (!game) outcome = 'invalid';
      else if (result?.winner) outcome = result.winner === pick.team ? 'won' : 'lost';
      if (outcome === 'won') wins += 1;
      if (outcome === 'lost' && eliminatedWeek == null) eliminatedWeek = pick.week;
      return { week: pick.week, team: pick.team, teamFull: TEAMS[pick.team] ?? pick.team, outcome, gameId: game?.id ?? null, pickedAt: pick.pickedAt };
    });
    entries.push({
      playerId,
      name: player?.name ?? 'Unknown player',
      picks: history,
      usedTeams: ordered.map((p) => p.team),
      wins,
      eliminatedWeek,
      alive: eliminatedWeek == null,
    });
  }

  entries.sort((a, b) => (a.alive === b.alive ? b.wins - a.wins || a.name.localeCompare(b.name) : a.alive ? -1 : 1));
  const alive = entries.filter((e) => e.alive);
  return {
    entries,
    aliveCount: alive.length,
    totalCount: entries.length,
    champion: entries.length > 1 && alive.length === 1 ? alive[0] : null,
  };
}

/**
 * Validate a proposed survivor pick. Returns { ok } or { ok: false, error }.
 */
export function validateSurvivorPick({ playerId, week, team, survivorPicks = [], results = {}, players = [], now = new Date(), isWeekLocked }) {
  if (!team || !TEAMS[team]) return { ok: false, error: 'Pick a valid NFL team.' };
  const game = findTeamGame(week, team);
  if (!game) return { ok: false, error: `${TEAMS[team]} ${getGames(week).length ? 'is on bye' : 'does not play'} in Week ${week}.` };
  if (typeof isWeekLocked === 'function' && isWeekLocked(week, now)) return { ok: false, error: `Week ${week} is locked — survivor picks were due before the first kickoff.` };

  const pool = deriveSurvivorPool({ survivorPicks, players, results });
  const entry = pool.entries.find((e) => e.playerId === playerId);
  if (entry && !entry.alive) return { ok: false, error: `You were eliminated in Week ${entry.eliminatedWeek}. The graveyard has no picks.` };
  const priorUse = entry?.picks.find((p) => p.team === team && p.week !== week);
  if (priorUse) return { ok: false, error: `You already burned ${TEAMS[team]} in Week ${priorUse.week}. One ride per team.` };
  return { ok: true, game };
}
