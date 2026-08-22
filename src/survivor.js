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
        if (result.winner === pick.team) {
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
