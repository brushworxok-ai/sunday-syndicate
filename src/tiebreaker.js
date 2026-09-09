// Weekly tiebreaker — "closest to the tiebreaker game's total WITHOUT going
// over; going over busts." The tiebreaker game is the last kickoff of the week
// (usually Monday night). Shared by frontend and server so every surface
// resolves ties identically.
import { getGames } from './data.js';

/** The week's tiebreaker game = last kickoff on the schedule. */
export function getWeekTiebreakerGame(games) {
  if (!games?.length) return null;
  const key = (game) => `${game.date}T${game.kickoff?.includes('T') ? game.kickoff.split('T')[1] : '13:00:00'}`;
  return [...games].sort((a, b) => key(a).localeCompare(key(b))).at(-1);
}

/**
 * Actual total points of the week's tiebreaker game, or null until both
 * final scores are recorded (winner-only results can't judge a tiebreaker).
 */
export function getTiebreakerActual(games, results) {
  const game = getWeekTiebreakerGame(games);
  if (!game) return { game: null, total: null };
  const result = results?.[game.id];
  const scored = result?.winner != null
    && Number.isFinite(Number(result.awayScore))
    && Number.isFinite(Number(result.homeScore));
  return { game, total: scored ? Number(result.awayScore) + Number(result.homeScore) : null };
}

/**
 * Sort key for closest-without-going-over. Lower = better.
 * - Not over: distance below the actual total (0 = nailed it).
 * - Over ("busted"): ranks after EVERY not-over guess, closest-over first
 *   (so if everyone busts, the least-over guess still wins the tiebreak).
 * - Actual unknown (tiebreaker game not final): everyone ranks equal — a tie
 *   stays a tie until the tiebreaker game's score is in.
 */
export function tiebreakerRank(guess, actualTotal) {
  if (actualTotal == null) return 0;
  const value = Number(guess);
  if (!Number.isFinite(value)) return 1_000_000;
  return value <= actualTotal ? actualTotal - value : 100_000 + (value - actualTotal);
}

/** True once the actual total is known and this guess went over it. */
export function tiebreakerBusted(guess, actualTotal) {
  return actualTotal != null && Number.isFinite(Number(guess)) && Number(guess) > actualTotal;
}

/** Convenience: actual tiebreaker total for a week number. */
export function getWeekTiebreakerActual(weekNumber, results) {
  return getTiebreakerActual(getGames(weekNumber), results);
}

/* Guesses are allowed in half points (47 or 47.5) — the .5 is a hedge under
   closest-without-going-over, and it keeps two players off the exact same
   number. The ranking math above is plain arithmetic, so halves just work. */
export const TIEBREAKER_STEP = 0.5;

export function validateTiebreaker(value, { max = 250 } = {}) {
  const error = `Tiebreaker must be between 0 and ${max}, in whole or half points (like 47 or 47.5).`;
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return { ok: false, error };
  const total = Number(value);
  if (!Number.isFinite(total) || total < 0 || total > max) return { ok: false, error };
  if (Math.round(total * 2) !== total * 2) return { ok: false, error };
  return { ok: true, value: total };
}
