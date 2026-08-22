import { randomUUID } from 'node:crypto';
import { ENTRY_FEE, getGamesForWeek } from '../src/data.js';
import { buildLeaderboard, TONE_LEVELS } from '../src/demoLeague.js';
import { buildWeeklyWinnerRecognition, moderateJackMessage, previewJackRoast, resolveJackRoastPolicy } from '../src/jackHost.js';
import { generateGeminiText } from './geminiService.js';

export class WorkflowError extends Error {
  constructor(message, status = 400, code = 'workflow_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const toneForPrompt = (level) => ['target', 'explicit', 'maximum', 'competitive'].includes(level) ? 'bold' : 'playful';

export function calculateLeagueFacts(league, { season = league.season ?? 2025, week = league.week } = {}) {
  const games = getGamesForWeek(season, week);
  const gameIds = new Set(games.map((game) => game.id));
  const sheets = league.sheets.filter((sheet) => sheet.paid && Number(sheet.season ?? league.season ?? 2025) === Number(season) && Number(sheet.week) === Number(week));
  const results = Object.fromEntries(Object.entries(league.results).filter(([gameId]) => gameIds.has(gameId)));
  const leaderboard = buildLeaderboard(league.players, sheets, results);
  const verifiedResults = games.filter((game) => results[game.id]?.winner && results[game.id]?.verifiedAt);
  const finalized = games.length > 0 && verifiedResults.length === games.length;
  const winner = leaderboard[0] ?? null;
  const runnerUp = leaderboard[1] ?? null;
  const biggestRise = [...leaderboard].sort((a, b) => b.rankChange - a.rankChange)[0] ?? null;
  const biggestFall = [...leaderboard].sort((a, b) => a.rankChange - b.rankChange)[0] ?? null;
  const settledBets = league.sideBets.filter((bet) => bet.settlementStatus === 'settled' && Number(bet.season ?? league.season ?? 2025) === Number(season) && Number(bet.week ?? league.week) === Number(week));
  return { season: Number(season), week: Number(week), totalGames: games.length, games, results, finalized, verifiedGameCount: verifiedResults.length, leaderboard, winner, runnerUp, biggestRise, biggestFall, settledBets };
}

export async function settleWeeklyPayout({ store, leagueId, season, week, actor = 'commissioner', entryFeeCents = ENTRY_FEE * 100 }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'league_not_found');
  const targetSeason = Number(season ?? league.season ?? 2025);
  const targetWeek = Number(week ?? league.week);
  const existing = await store.getWeeklySettlement(leagueId, targetSeason, targetWeek);
  if (existing) return existing;

  const facts = calculateLeagueFacts(league, { season: targetSeason, week: targetWeek });
  if (!facts.totalGames) throw new WorkflowError('No games are configured for that season and week.', 404, 'week_not_found');
  if (!facts.finalized) throw new WorkflowError(`Results are incomplete: ${facts.verifiedGameCount}/${facts.totalGames} verified.`, 409, 'results_incomplete');
  if (!facts.leaderboard.length) throw new WorkflowError('No paid sheets are available to settle.', 409, 'no_paid_entries');

  const topScore = facts.leaderboard[0].score;
  const contenders = facts.leaderboard.filter((entry) => entry.score === topScore);
  const tiebreakerGame = facts.games.find((game) => game.isTiebreaker) ?? facts.games.at(-1);
  const tiebreakerResult = facts.results[tiebreakerGame?.id];
  const actualTiebreaker = Number(tiebreakerResult?.awayScore) + Number(tiebreakerResult?.homeScore);
  let winners = contenders;
  let resolution = 'highest_score';

  if (contenders.length > 1) {
    const nonBust = Number.isFinite(actualTiebreaker)
      ? contenders.map((entry) => ({ entry, distance: actualTiebreaker - Number(entry.tiebreaker) })).filter((item) => Number.isFinite(item.distance) && item.distance >= 0)
      : [];
    if (!nonBust.length) winners = [];
    else {
      const closest = Math.min(...nonBust.map((item) => item.distance));
      winners = nonBust.filter((item) => item.distance === closest).map((item) => item.entry);
    }
    resolution = winners.length ? 'closest_without_going_over' : 'all_tiebreakers_busted';
  }

  const basePotCents = facts.leaderboard.length * Number(entryFeeCents);
  const perfectSheet = winners.length > 0 && winners.every((entry) => entry.score === facts.totalGames);
  const multiplier = perfectSheet ? 2 : 1;
  const payoutCents = winners.length ? basePotCents * multiplier : 0;
  const baseShare = winners.length ? Math.floor(payoutCents / winners.length) : 0;
  const remainder = winners.length ? payoutCents - baseShare * winners.length : 0;
  const settledAt = new Date().toISOString();
  const settlement = {
    id: `settlement-${targetSeason}-${targetWeek}-${randomUUID()}`,
    season: targetSeason,
    week: targetWeek,
    status: winners.length ? 'owed' : 'rollover',
    paidEntryCount: facts.leaderboard.length,
    basePotCents,
    multiplier,
    payoutCents,
    perfectSheet,
    winnerScore: topScore,
    totalGames: facts.totalGames,
    tiebreakerActual: Number.isFinite(actualTiebreaker) ? actualTiebreaker : null,
    resolution,
    winners: winners.map((entry, index) => ({
      playerId: entry.playerId,
      name: entry.name,
      score: entry.score,
      tiebreaker: entry.tiebreaker,
      payoutCents: baseShare + (index < remainder ? 1 : 0),
    })),
    settledAt,
    settledBy: actor,
  };
  await store.saveWeeklySettlement(leagueId, settlement);
  await store.writeAudit(leagueId, 'weekly_payout.settled', winners.length
    ? `${winners.map((entry) => entry.name).join(' & ')} won ${targetSeason} Week ${targetWeek}${perfectSheet ? ' with a perfect sheet and 2x payout' : ''}`
    : `${targetSeason} Week ${targetWeek} rolled over after all tied players busted the tiebreaker`, actor, {
    settlementId: settlement.id, season: targetSeason, week: targetWeek, payoutCents, multiplier, winnerIds: winners.map((entry) => entry.playerId),
  });
  return settlement;
}

function factualRecap(facts, players) {
  const nameFor = (id) => players.find((player) => player.id === id)?.name ?? 'A player';
  const rankings = facts.leaderboard.map((entry) => `${entry.name} ${entry.score}–${facts.totalGames - entry.score}`).join(', ');
  const rise = facts.biggestRise?.rankChange > 0 ? `${facts.biggestRise.name} made the biggest climb at +${facts.biggestRise.rankChange}.` : 'No player gained multiple positions this week.';
  const betCopy = facts.settledBets.length ? facts.settledBets.map((bet) => `${nameFor(bet.winnerId)} won ${bet.stake.label}`).join('; ') : 'No side bets settled this week.';
  return `${facts.winner.name} wins Week ${facts.week} at ${facts.winner.score}–${facts.totalGames - facts.winner.score}${facts.runnerUp ? `, ${facts.winner.score - facts.runnerUp.score} point${facts.winner.score - facts.runnerUp.score === 1 ? '' : 's'} ahead of ${facts.runnerUp.name}` : ''}. Rankings: ${rankings}. ${rise}\n\nSide bets: ${betCopy}.`;
}

function selectRoastTarget(facts, players, leagueSettings) {
  if (!leagueSettings.trashTalkEnabled) return null;
  return [...facts.leaderboard].reverse().map((entry) => ({ entry, player: players.find((candidate) => candidate.id === entry.playerId) }))
    .map((candidate) => ({ ...candidate, policy: resolveJackRoastPolicy({ player: candidate.player, leagueSettings, isWinner: candidate.entry.score === facts.leaderboard[0]?.score }) }))
    .find(({ player, policy }) => player && policy.roastAllowed) ?? null;
}

export async function generateWeeklyRecap({ store, leagueId, season, week, aiClient = null, model = 'gemini-3.6-flash', actor = 'commissioner' }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'league_not_found');
  const facts = calculateLeagueFacts(league, { season: Number(season ?? league.season ?? 2025), week: Number(week ?? league.week) });
  if (!facts.totalGames) throw new WorkflowError('No games are configured for that season and week.', 404, 'week_not_found');
  if (!facts.finalized) throw new WorkflowError(`Results are incomplete: ${facts.verifiedGameCount}/${facts.totalGames} verified.`, 409, 'results_incomplete');
  if (!facts.winner) throw new WorkflowError('No scored entries are available.', 409, 'no_entries');

  const selected = selectRoastTarget(facts, league.players, league.settings);
  const weeklyWinner = buildWeeklyWinnerRecognition({ leaderboard: facts.leaderboard, verified: facts.finalized, celebrationsEnabled: league.settings.jack?.winnerCelebrations !== false });
  let colorLine = '';
  let generationSource = 'deterministic_fallback';
  if (selected && aiClient) {
    const playerEntries = facts.leaderboard.map((entry) => {
      const player = league.players.find((candidate) => candidate.id === entry.playerId);
      const policy = resolveJackRoastPolicy({ player, leagueSettings: league.settings, isWinner: weeklyWinner.protectedPlayerIds.includes(entry.playerId) });
      return { id: entry.playerId, name: entry.name, score: entry.score, pickCount: facts.totalGames, roastLevel: policy.effectiveLevel, roastEligible: policy.roastAllowed };
    });
    const generated = await generateGeminiText({
      client: aiClient,
      model,
      action: 'trashTalk',
      payload: {
        author: 'Commissioner',
        tone: toneForPrompt(selected.policy.effectiveLevel),
        entries: playerEntries.filter((entry) => entry.id === selected.player.id),
        players: league.players.map((player) => { const policy = resolveJackRoastPolicy({ player, leagueSettings: league.settings, isWinner: weeklyWinner.protectedPlayerIds.includes(player.id) }); return { id: player.id, name: player.name, roastLevel: policy.effectiveLevel, roastEligible: policy.roastAllowed }; }),
        seed: `Write one game-only line about a ${selected.entry.score}–${facts.totalGames - selected.entry.score} weekly pick result.`,
      },
    });
    colorLine = generated.text;
    generationSource = 'gemini';
  } else if (selected) {
    colorLine = previewJackRoast({ player: selected.player, leagueSettings: league.settings, fact: { correct: selected.entry.score, incorrect: facts.totalGames - selected.entry.score } }).text;
  }

  const roastFactId = selected ? `${facts.season}-week-${facts.week}-${selected.player.id}-score` : null;
  const moderationDecision = selected && colorLine ? moderateJackMessage({ text: colorLine, targetPlayer: selected.player, leagueSettings: league.settings, requestedLevel: selected.policy.effectiveLevel, isWinner: weeklyWinner.protectedPlayerIds.includes(selected.player.id), groundedFactIds: [roastFactId], availableFactIds: [roastFactId] }) : null;
  if (moderationDecision?.decision === 'blocked') colorLine = '';

  const generatedAt = new Date().toISOString();
  const recap = {
    id: `recap-${randomUUID()}`,
    season: facts.season,
    week: facts.week,
    generationSource,
    generationStatus: 'generated',
    generatedAt,
    factsSnapshot: {
      resultsFinalizedAt: Object.values(facts.results).map((result) => result.verifiedAt).filter(Boolean).sort().at(-1),
      verifiedGameCount: facts.verifiedGameCount,
      winnerId: facts.winner.playerId,
      winnerScore: facts.winner.score,
      rankings: facts.leaderboard.map(({ playerId, rank, score }) => ({ playerId, rank, score })),
      biggestRisePlayerId: facts.biggestRise?.playerId,
      settledSideBetIds: facts.settledBets.map((bet) => bet.id),
      winnerRecognition: weeklyWinner,
    },
    moderationStatus: moderationDecision?.decision === 'blocked' ? 'passed_with_edits' : 'passed',
    moderation: {
      allowed: colorLine && selected ? [{ id: randomUUID(), targetPlayerId: selected.player.id, tone: selected.policy.effectiveLevel, text: colorLine, decision: 'allowed', groundedFactIds: [roastFactId] }] : [],
      blocked: moderationDecision?.decision === 'blocked' ? [{ id: randomUUID(), targetPlayerId: selected.player.id, tone: selected.policy.effectiveLevel, text: moderationDecision.text, decision: 'blocked', reason: moderationDecision.reason }] : [],
    },
    adminApproval: { status: 'pending' },
    draftText: `${weeklyWinner.message}\n\n${factualRecap(facts, league.players)}${colorLine ? ` ${colorLine}` : ''}\n\nCommissioner’s note: All ${facts.totalGames} game results are verified. Winner protection and strictest-limit moderation are active.`,
  };
  recap.finalText = recap.draftText;
  await store.saveRecap(leagueId, recap);
  await store.writeAudit(leagueId, 'recap.generated', `${facts.season} Week ${facts.week} grounded recap generated via ${generationSource}`, actor, { recapId: recap.id, generationSource, season: facts.season, week: facts.week });
  return recap;
}

export async function approveRecap({ store, recapId, text, actor = 'commissioner' }) {
  const recap = await store.getRecap(recapId);
  if (!recap) throw new WorkflowError('Recap not found.', 404, 'recap_not_found');
  if (recap.moderationStatus !== 'passed' && recap.moderationStatus !== 'passed_with_edits') throw new WorkflowError('Recap has not passed moderation.', 409, 'moderation_required');
  const approvedAt = new Date().toISOString();
  const approved = { ...recap, finalText: String(text ?? recap.draftText).trim().slice(0, 3200), adminApproval: { status: 'approved', approvedBy: actor, approvedAt } };
  await store.saveRecap(recap.leagueId, approved);
  await store.writeAudit(recap.leagueId, 'recap.approved', `Week ${recap.week} recap approved`, actor, { recapId });
  return approved;
}

export async function createSideBet({ store, leagueId, input, actor }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'league_not_found');
  if (input.creatorId === input.opponentId) throw new WorkflowError('Choose another player as the opponent.');
  if (!league.players.some((player) => player.id === input.creatorId) || !league.players.some((player) => player.id === input.opponentId)) throw new WorkflowError('Both participants must belong to this league.');
  if (!['virtual_tokens', 'bragging_rights', 'points'].includes(input.stakeType)) throw new WorkflowError('Only non-cash stakes are supported.', 422, 'cash_stake_blocked');
  if (!String(input.event ?? '').trim() || !String(input.terms ?? '').trim()) throw new WorkflowError('Event and terms are required.');
  const season = Number(input.season ?? league.season ?? 2025);
  const week = Number(input.week ?? league.week);
  if (!getGamesForWeek(season, week).length) throw new WorkflowError('Choose a valid season and week.', 422, 'invalid_week');
  const createdAt = new Date().toISOString();
  const bet = {
    id: `bet-${randomUUID()}`,
    season,
    week,
    creatorId: input.creatorId,
    opponentId: input.opponentId,
    event: String(input.event).trim().slice(0, 180),
    terms: String(input.terms).trim().slice(0, 300),
    settlementRule: input.settlementRule === 'compare_weekly_score' ? 'compare_weekly_score' : 'manual_review',
    stake: { type: input.stakeType, amount: Math.max(1, Math.min(Number(input.stakeAmount) || 1, 10000)), label: String(input.stakeLabel ?? input.stakeType).trim().slice(0, 100) },
    visibility: 'participants_only',
    optionalMessage: String(input.optionalMessage ?? '').trim().slice(0, 240),
    createdAt,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    proposalStatus: 'pending',
    settlementStatus: 'waiting_for_acceptance',
  };
  await store.saveSideBet(leagueId, bet);
  await store.writeAudit(leagueId, 'side_bet.created', `Side bet proposed between two league players`, actor, { betId: bet.id, creatorId: bet.creatorId, opponentId: bet.opponentId });
  return bet;
}

export async function respondToSideBet({ store, betId, playerId, decision, counterTerms }) {
  const bet = await store.getSideBet(betId);
  if (!bet) throw new WorkflowError('Side bet not found.', 404, 'bet_not_found');
  if (bet.opponentId !== playerId) throw new WorkflowError('Only the invited opponent can respond.', 403, 'wrong_participant');
  if (bet.proposalStatus !== 'pending') throw new WorkflowError('This proposal is no longer open.', 409, 'proposal_closed');
  const at = new Date().toISOString();
  let updated;
  if (decision === 'accept') updated = { ...bet, proposalStatus: 'accepted', acceptedAt: at, termsLockedAt: at, settlementStatus: 'waiting_for_verified_results' };
  else if (decision === 'decline') updated = { ...bet, proposalStatus: 'declined', declinedAt: at, settlementStatus: 'not_applicable' };
  else if (decision === 'counter') updated = { ...bet, proposalStatus: 'countered', counteredAt: at, counterTerms: String(counterTerms ?? '').trim().slice(0, 300), settlementStatus: 'waiting_for_acceptance' };
  else throw new WorkflowError('Decision must be accept, decline, or counter.');
  await store.saveSideBet(bet.leagueId, updated);
  await store.writeAudit(bet.leagueId, `side_bet.${decision}ed`, `Side bet ${decision} response recorded`, playerId, { betId });
  return updated;
}

export async function settleSideBetFromLeague({ store, betId, actor = 'commissioner' }) {
  const bet = await store.getSideBet(betId);
  if (!bet) throw new WorkflowError('Side bet not found.', 404, 'bet_not_found');
  if (bet.proposalStatus !== 'accepted') throw new WorkflowError('Only accepted side bets can settle.', 409, 'bet_not_accepted');
  if (bet.settlementRule !== 'compare_weekly_score') {
    const manual = { ...bet, settlementStatus: 'manual_review' };
    await store.saveSideBet(bet.leagueId, manual);
    return manual;
  }
  const league = await store.getLeague(bet.leagueId);
  const facts = calculateLeagueFacts(league, { season: Number(bet.season ?? league.season ?? 2025), week: Number(bet.week ?? league.week) });
  if (!facts.finalized) throw new WorkflowError('Verified results are incomplete.', 409, 'results_incomplete');
  const creator = facts.leaderboard.find((entry) => entry.playerId === bet.creatorId);
  const opponent = facts.leaderboard.find((entry) => entry.playerId === bet.opponentId);
  if (!creator || !opponent) throw new WorkflowError('Participant scores are unavailable.', 409, 'scores_unavailable');
  const settlementStatus = creator.score === opponent.score ? 'push' : 'settled';
  const updated = { ...bet, settlementStatus, settledAt: new Date().toISOString(), verifiedFrom: `${facts.season}-week-${facts.week}-standings`, creatorScore: creator.score, opponentScore: opponent.score, ...(settlementStatus === 'settled' ? { winnerId: creator.score > opponent.score ? creator.playerId : opponent.playerId } : {}) };
  await store.saveSideBet(bet.leagueId, updated);
  await store.writeAudit(bet.leagueId, 'side_bet.settled', `Side bet settled from verified ${facts.season} Week ${facts.week} standings`, actor, { betId, winnerId: updated.winnerId, settlementStatus, season: facts.season, week: facts.week });
  return updated;
}
