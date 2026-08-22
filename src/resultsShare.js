/**
 * Utility for building shareable league view URLs.
 */

const BASE_URL = process.env.APP_BASE_URL || 'https://sunday-syndicate.vercel.app';

export function buildLeagueViewUrl(leagueId, { week, view = 'leaderboard' } = {}) {
  const url = new URL(`/${view}`, BASE_URL);
  if (leagueId) url.searchParams.set('league', leagueId);
  if (week) url.searchParams.set('week', String(week));
  return url.toString();
}
