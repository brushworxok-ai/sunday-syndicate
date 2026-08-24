/**
 * Survivor pool logic — pick one team per week, never reuse.
 * One loss and you're eliminated.
 */

import { TEAMS, getGames } from './data.js';

/**
 * Find the game a team plays in for a given week's games.
 */
export function findTeamGame(games, team) {
  return games.find((g) => g.away === team || g.home === team) ?? null;
}

/**
 * Derive the full survivor pool state from raw picks, players, and results.
 * This is a pure function — no mutations, no storage.
 */
/**
 * Validate a survivor pick before saving.
 * Returns { ok: true } or { ok: false, error: 'reason' }.
 */
export function validateSurvivorPick({ playerId, week, team, survivorPicks = [], results = {}, players = [], isWeekLocked }) {
  if (!team || !TEAMS[team]) return { ok: false, error: `${team || '(empty)'} is not a valid NFL team.` };
  if (typeof isWeekLocked === 'function' && isWeekLocked(week)) return { ok: false, error: `Week ${week} is locked — picks are due before the first kickoff.` };

  // Check the team actually plays this week
  const weekGames = getGames(week);
  const game = findTeamGame(weekGames, team);
  if (!game) return { ok: false, error: `${TEAMS[team] || team} doesn't play in Week ${week}. Pick a team that's on the schedule.` };

  // Check player is still alive
  const pool = deriveSurvivorPool({ survivorPicks, players, results });
  const entry = pool.entries.find((e) => e.playerId === playerId);
  if (entry && !entry.alive) return { ok: false, error: `You were eliminated in Week ${entry.eliminatedWeek}. Better luck next season.` };

  // Check team hasn't been used already by this player
  const playerPicks = survivorPicks.filter((p) => p.playerId === playerId);
  const alreadyUsed = playerPicks.find((p) => p.team === team && p.week !== week);
  if (alreadyUsed) return { ok: false, error: `You already used ${TEAMS[team] || team} in Week ${alreadyUsed.week}. Each team can only be picked once all season.` };

  return { ok: true };
}

export function deriveSurvivorPool({ survivorPicks = [], players = [], results = {} }) {
  // Group picks by player
  const byPlayer = new Map();
  for (const pick of survivorPicks) {
    const key = pick.playerId;
    if (!byPlayer.has(key)) byPlayer.set(key, []);
    byPlayer.get(key).push(pick);
  }

  const entries = [];
  for (const [playerId, picks] of byPlayer) {
    const player = players.find((p) => p.id === playerId);
    const sortedPicks = [...picks].sort((a, b) => a.week - b.week);
    const usedTeams = sortedPicks.map((p) => p.team);

    let alive = true;
    let eliminatedWeek = null;
    let wins = 0;

    const annotatedPicks = sortedPicks.map((pick) => {
      const weekGames = getGames(pick.week) ?? [];
      const game = findTeamGame(weekGames, pick.team);
      const result = game ? results[game.id] : null;

      let outcome = 'pending';
      if (result?.winner) {
        if (result.winner === 'TIE') {
          // A tie is not a loss — the player survives the week (no win credit).
          outcome = 'tie';
        } else if (result.winner === pick.team) {
          outcome = 'win';
          wins += 1;
        } else {
          outcome = 'loss';
          if (alive) {
            alive = false;
            eliminatedWeek = pick.week;
          }
        }
      }

      return {
        week: pick.week,
        team: pick.team,
        teamFull: TEAMS[pick.team] ?? pick.team,
        outcome,
      };
    });

    entries.push({
      playerId,
      name: player?.name ?? playerId,
      picks: annotatedPicks,
      usedTeams,
      alive,
      eliminatedWeek,
      wins,
    });
  }

  // Sort: alive first, then by wins descending
  entries.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.wins - a.wins;
  });

  const aliveCount = entries.filter((e) => e.alive).length;
  const champion = aliveCount === 1 && entries.length > 1 ? entries.find((e) => e.alive) : null;

  return {
    entries,
    aliveCount,
    totalCount: entries.length,
    champion,
  };
}
