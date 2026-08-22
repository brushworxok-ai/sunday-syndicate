/**
 * Utility for building shareable league view URLs.
 */

const DEFAULT_BASE_URL = 'https://sunday-syndicate.vercel.app';

export function buildLeagueViewUrl(baseUrl, { week, view = 'leaderboard', season } = {}) {
  const base = baseUrl || process.env.APP_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(`/${view}`, base);
  if (week) url.searchParams.set('week', String(week));
  if (season) url.searchParams.set('season', String(season));
  return url.toString();
}
