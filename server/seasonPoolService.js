import { randomUUID } from 'node:crypto';
import { buildSeasonPoolView, SEASON_POOL_ENTRY_CENTS } from '../src/seasonPool.js';

export class SeasonPoolError extends Error {
  constructor(message, status = 400, code = 'season_pool_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function joinSeasonPool({ store, leagueId, playerId, season, now = new Date() }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new SeasonPoolError('League not found.', 404, 'league_not_found');
  if (!league.players.some((player) => player.id === playerId)) throw new SeasonPoolError('Player not found in this league.', 404, 'player_not_found');
  const view = buildSeasonPoolView(league, { season, now });
  if (!view.canJoin) throw new SeasonPoolError('The season pool closed at the first Week 1 kickoff.', 409, 'season_pool_locked');
  return store.createSeasonPoolClaim(leagueId, {
    id: `season-pool-${Number(season)}-${randomUUID()}`,
    season: Number(season),
    playerId,
    amountCents: SEASON_POOL_ENTRY_CENTS,
    status: 'pending',
    claimedAt: now.toISOString(),
  });
}

export async function resolveSeasonPoolClaim({ store, leagueId, claimId, decision, actor = 'commissioner' }) {
  if (!['confirm', 'reject'].includes(decision)) throw new SeasonPoolError('Decision must be confirm or reject.', 422, 'invalid_decision');
  return store.resolveSeasonPoolClaim(leagueId, claimId, { decision, actor });
}

export async function settleSeasonPool({ store, leagueId, season, actor = 'commissioner' }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new SeasonPoolError('League not found.', 404, 'league_not_found');
  const view = buildSeasonPoolView(league, { season });
  if (view.settlement) return view.settlement;
  if (view.raceStatus !== 'official') throw new SeasonPoolError('The season pool can settle only after Week 18 is officially settled.', 409, 'season_not_final');
  if (!view.confirmedCount) throw new SeasonPoolError('No confirmed season-pool contributions are available.', 409, 'no_pool_entries');
  if (!view.eligibleLeaders.length) throw new SeasonPoolError('No confirmed entrant earned a settled weekly win.', 409, 'no_eligible_winner');
  const potCents = view.potCents;
  const baseShare = Math.floor(potCents / view.eligibleLeaders.length);
  const remainder = potCents - baseShare * view.eligibleLeaders.length;
  const settledAt = new Date().toISOString();
  const settlement = {
    id: `season-pool-settlement-${Number(season)}-${randomUUID()}`,
    season: Number(season),
    status: 'owed',
    potCents,
    contributionCount: view.confirmedCount,
    winningWeeklyWins: view.eligibleLeaders[0].weeklyWins,
    resolution: view.eligibleLeaders.length === 1 ? 'most_weekly_wins' : 'equal_leaders_split',
    winners: view.eligibleLeaders.map((winner, index) => ({
      playerId: winner.playerId,
      name: winner.name,
      weeklyWins: winner.weeklyWins,
      payoutCents: baseShare + (index < remainder ? 1 : 0),
    })),
    settledAt,
    settledBy: actor,
  };
  return store.saveSeasonPoolSettlement(leagueId, settlement, actor);
}

export async function markSeasonPoolPaid({ store, leagueId, season, actor = 'commissioner' }) {
  return store.markSeasonPoolPayoutPaid(leagueId, Number(season), actor);
}
