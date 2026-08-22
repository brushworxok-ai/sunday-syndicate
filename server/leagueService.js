import { randomUUID } from 'node:crypto';
import { GAMES } from '../src/data.js';
import { buildLeaderboard, TONE_LEVELS } from '../src/demoLeague.js';
import { generateGeminiText } from './geminiService.js';

export class WorkflowError extends Error {
  constructor(message, status = 400, code = 'workflow_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const toneForPrompt = (level) => level === 'maximum' || level === 'competitive' ? 'bold' : 'playful';

export function calculateLeagueFacts(league) {
  const leaderboard = buildLeaderboard(league.players, league.sheets, league.results);
  const verifiedResults = GAMES.filter((game) => league.results[game.id]?.winner && league.results[game.id]?.verifiedAt);
  const finalized = verifiedResults.length === GAMES.length;
  const winner = leaderboard[0] ?? null;
  const runnerUp = leaderboard[1] ?? null;
  const biggestRise = [...leaderboard].sort((a, b) => b.rankChange - a.rankChange)[0] ?? null;
  const biggestFall = [...leaderboard].sort((a, b) => a.rankChange - b.rankChange)[0] ?? null;
  const settledBets = league.sideBets.filter((bet) => bet.settlementStatus === 'settled');
  return { week: league.week, finalized, verifiedGameCount: verifiedResults.length, leaderboard, winner, runnerUp, biggestRise, biggestFall, settledBets };
}

function factualRecap(facts, players) {
  const nameFor = (id) => players.find((player) => player.id === id)?.name ?? 'A player';
  const rankings = facts.leaderboard.map((entry) => `${entry.name} ${entry.score}–${GAMES.length - entry.score}`).join(', ');
  const rise = facts.biggestRise?.rankChange > 0 ? `${facts.biggestRise.name} made the biggest climb at +${facts.biggestRise.rankChange}.` : 'No player gained multiple positions this week.';
  const betCopy = facts.settledBets.length ? facts.settledBets.map((bet) => `${nameFor(bet.winnerId)} won ${bet.stake.label}`).join('; ') : 'No side bets settled this week.';
  return `${facts.winner.name} wins Week ${facts.week} at ${facts.winner.score}–${GAMES.length - facts.winner.score}${facts.runnerUp ? `, ${facts.winner.score - facts.runnerUp.score} point${facts.winner.score - facts.runnerUp.score === 1 ? '' : 's'} ahead of ${facts.runnerUp.name}` : ''}. Rankings: ${rankings}. ${rise}\n\nSide bets: ${betCopy}.`;
}

function selectRoastTarget(facts, players, leagueSettings = {}) {
  if (!leagueSettings?.trashTalkEnabled) return null;
  return [...facts.leaderboard].reverse().map((entry) => ({ entry, player: players.find((candidate) => candidate.id === entry.playerId) }))
    .find(({ player }) => player && player.trashTalk.level !== 'none') ?? null;
}

export async function generateWeeklyRecap({ store, leagueId, aiClient = null, model = 'gemini-3.6-flash', actor = 'commissioner' }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'league_not_found');
  const facts = calculateLeagueFacts(league);
  if (!facts.finalized) throw new WorkflowError(`Results are incomplete: ${facts.verifiedGameCount}/${GAMES.length} verified.`, 409, 'results_incomplete');
  if (!facts.winner) throw new WorkflowError('No scored entries are available.', 409, 'no_entries');

  const selected = selectRoastTarget(facts, league.players, league.settings);
  let colorLine = '';
  let generationSource = 'deterministic_fallback';
  if (selected && aiClient) {
    const playerEntries = facts.leaderboard.map((entry) => {
      const player = league.players.find((candidate) => candidate.id === entry.playerId);
      return { id: entry.playerId, name: entry.name, score: entry.score, pickCount: GAMES.length, roastLevel: player?.trashTalk.level ?? 'none', roastEligible: player?.trashTalk.level !== 'none' };
    });
    const generated = await generateGeminiText({
      client: aiClient,
      model,
      action: 'trashTalk',
      payload: {
        author: 'Commissioner',
        tone: toneForPrompt(selected.player.trashTalk.level),
        entries: playerEntries.filter((entry) => entry.id === selected.player.id),
        players: league.players.map((player) => ({ id: player.id, name: player.name, roastLevel: player.trashTalk.level })),
        seed: `Write one game-only line about a ${selected.entry.score}–${GAMES.length - selected.entry.score} weekly pick result.`,
      },
    });
    colorLine = generated.text;
    generationSource = 'gemini';
  } else if (selected) {
    colorLine = `${selected.entry.name}'s picks were so cold this week they may qualify as weather data.`;
  }

  const generatedAt = new Date().toISOString();
  const recap = {
    id: `recap-${randomUUID()}`,
    week: league.week,
    generationSource,
    generationStatus: 'generated',
    generatedAt,
    factsSnapshot: {
      resultsFinalizedAt: Object.values(league.results).map((result) => result.verifiedAt).sort().at(-1),
      verifiedGameCount: facts.verifiedGameCount,
      winnerId: facts.winner.playerId,
      winnerScore: facts.winner.score,
      rankings: facts.leaderboard.map(({ playerId, rank, score }) => ({ playerId, rank, score })),
      biggestRisePlayerId: facts.biggestRise?.playerId,
      settledSideBetIds: facts.settledBets.map((bet) => bet.id),
    },
    moderationStatus: 'passed',
    moderation: { allowed: colorLine && selected ? [{ id: randomUUID(), targetPlayerId: selected.player.id, tone: selected.player.trashTalk.level, text: colorLine, decision: 'allowed' }] : [], blocked: [] },
    adminApproval: { status: 'pending' },
    draftText: `${factualRecap(facts, league.players)}${colorLine ? ` ${colorLine}` : ''}\n\nCommissioner's note: All ${GAMES.length} game results are verified.`,
  };
  recap.finalText = recap.draftText;
  await store.saveRecap(leagueId, recap);
  await store.writeAudit(leagueId, 'recap.generated', `Week ${league.week} grounded recap generated via ${generationSource}`, actor, { recapId: recap.id, generationSource });
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
  const createdAt = new Date().toISOString();
  const bet = {
    id: `bet-${randomUUID()}`,
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
  const facts = calculateLeagueFacts(league);
  if (!facts.finalized) throw new WorkflowError('Verified results are incomplete.', 409, 'results_incomplete');
  const creator = facts.leaderboard.find((entry) => entry.playerId === bet.creatorId);
  const opponent = facts.leaderboard.find((entry) => entry.playerId === bet.opponentId);
  if (!creator || !opponent) throw new WorkflowError('Participant scores are unavailable.', 409, 'scores_unavailable');
  const settlementStatus = creator.score === opponent.score ? 'push' : 'settled';
  const updated = { ...bet, settlementStatus, settledAt: new Date().toISOString(), verifiedFrom: `week-${league.week}-standings`, creatorScore: creator.score, opponentScore: opponent.score, ...(settlementStatus === 'settled' ? { winnerId: creator.score > opponent.score ? creator.playerId : opponent.playerId } : {}) };
  await store.saveSideBet(bet.leagueId, updated);
  await store.writeAudit(bet.leagueId, 'side_bet.settled', `Side bet settled from verified Week ${league.week} standings`, actor, { betId, winnerId: updated.winnerId, settlementStatus });
  return updated;
}
