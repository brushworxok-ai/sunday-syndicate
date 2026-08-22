import { getGamesForWeek } from './data.js';
import { buildSeasonRace } from './seasonRace.js';

export const SEASON_POOL_ENTRY_CENTS = 2500;

export function findSeasonPool(league, season) {
  return (league?.settings?.seasonPools ?? []).find((pool) => Number(pool.season) === Number(season)) ?? null;
}

export function buildSeasonPoolView(league, { season = league?.season, now = new Date() } = {}) {
  const targetSeason = Number(season);
  const pool = findSeasonPool(league, targetSeason) ?? { season: targetSeason, entryFeeCents: SEASON_POOL_ENTRY_CENTS, currency: 'usd', entries: [], settlement: null };
  const players = league?.players ?? [];
  const entries = (pool.entries ?? []).map((entry) => ({
    ...entry,
    playerName: players.find((player) => player.id === entry.playerId)?.name ?? 'Former player',
    favoriteTeam: players.find((player) => player.id === entry.playerId)?.favoriteTeam ?? null,
  }));
  const confirmedEntries = entries.filter((entry) => entry.status === 'confirmed');
  const firstKickoff = getGamesForWeek(targetSeason, 1)
    .map((game) => new Date(game.kickoffAt))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => left - right)[0] ?? null;
  const race = buildSeasonRace(league, { season: targetSeason });
  const deadlinePassed = firstKickoff ? now.getTime() >= firstKickoff.getTime() : false;
  const eligibleIds = new Set(confirmedEntries.map((entry) => entry.playerId));
  const eligibleRecords = race.records.filter((record) => eligibleIds.has(record.playerId));
  const eligibleTopWins = eligibleRecords.length ? Math.max(...eligibleRecords.map((record) => record.weeklyWins)) : 0;
  const eligibleLeaders = eligibleRecords.filter((record) => record.weeklyWins === eligibleTopWins && eligibleTopWins > 0);
  const settlement = pool.settlement ?? null;
  const status = settlement?.status === 'paid' ? 'paid'
    : settlement ? 'owed'
      : race.status === 'official' ? 'ready_to_settle'
        : deadlinePassed ? 'locked' : 'open';

  return {
    season: targetSeason,
    entryFeeCents: Number(pool.entryFeeCents ?? SEASON_POOL_ENTRY_CENTS),
    currency: 'usd',
    status,
    deadlineAt: firstKickoff?.toISOString() ?? null,
    canJoin: status === 'open',
    entries,
    confirmedEntries,
    pendingEntries: entries.filter((entry) => entry.status === 'pending'),
    confirmedCount: confirmedEntries.length,
    potCents: confirmedEntries.length * Number(pool.entryFeeCents ?? SEASON_POOL_ENTRY_CENTS),
    raceStatus: race.status,
    weeksSettled: race.weeksSettled,
    eligibleLeaders,
    settlement,
    rule: 'Among confirmed entrants, the most commissioner-settled weekly wins after Week 18 wins. Equal leaders split the pot.',
  };
}
