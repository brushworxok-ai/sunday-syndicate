import { GAMES, SEASON as DEMO_SEASON, WEEK } from './data.js';

export const TONE_LEVELS = ['none', 'light', 'competitive', 'maximum'];

export const DEMO_PLAYERS = [
  {
    id: 'player-marcus',
    name: 'Marcus Reed',
    favoriteTeam: 'DAL',
    previousRank: 3,
    phone: '••• ••• 0142',
    phoneVerifiedAt: '2025-11-18T18:04:00.000Z',
    messaging: { smsConsent: 'opted_in', consentedAt: '2025-11-18T18:05:00.000Z', pushConsent: 'opted_out', resultsChannel: 'sms_and_in_app' },
    trashTalk: { level: 'light', updatedAt: '2025-11-18T18:06:00.000Z' },
    jackPolicy: { roastEnabled: true, playerConsentLevel: 'pg13', adminAssignedLevel: 'pg13', adultLanguageConsent: false, adultAgeGate: true, favoriteTeam: 'DAL', updatedAt: '2025-11-18T18:06:00.000Z', updatedBy: 'player' },
    seasonHistory: [{ season: 2025, correct: 162, incorrect: 110, rank: 2, titles: 0, verifiedAt: '2026-01-10T18:00:00.000Z' }],
  },
  {
    id: 'player-jordan',
    name: 'Jordan Lee',
    favoriteTeam: 'KC',
    previousRank: 1,
    phone: '••• ••• 0188',
    phoneVerifiedAt: '2025-11-18T18:12:00.000Z',
    messaging: { smsConsent: 'opted_in', consentedAt: '2025-11-18T18:13:00.000Z', pushConsent: 'opted_out', resultsChannel: 'sms_and_in_app' },
    trashTalk: { level: 'competitive', updatedAt: '2025-11-18T18:14:00.000Z' },
    jackPolicy: { roastEnabled: true, playerConsentLevel: 'explicit', adminAssignedLevel: 'explicit', adultLanguageConsent: true, adultAgeGate: true, favoriteTeam: 'KC', updatedAt: '2025-11-18T18:14:00.000Z', updatedBy: 'player' },
    seasonHistory: [{ season: 2025, correct: 158, incorrect: 114, rank: 3, titles: 0, verifiedAt: '2026-01-10T18:00:00.000Z' }],
  },
  {
    id: 'player-taylor',
    name: 'Taylor Brooks',
    favoriteTeam: 'PHI',
    previousRank: 2,
    phone: '••• ••• 0165',
    phoneVerifiedAt: '2025-11-18T18:20:00.000Z',
    messaging: { smsConsent: 'opted_in', consentedAt: '2025-11-18T18:21:00.000Z', pushConsent: 'opted_out', resultsChannel: 'sms_and_in_app' },
    trashTalk: { level: 'maximum', updatedAt: '2025-11-18T18:22:00.000Z' },
    jackPolicy: { roastEnabled: true, playerConsentLevel: 'target', adminAssignedLevel: 'target', adultLanguageConsent: true, adultAgeGate: true, favoriteTeam: 'PHI', updatedAt: '2025-11-18T18:22:00.000Z', updatedBy: 'player' },
    seasonHistory: [{ season: 2025, correct: 135, incorrect: 137, rank: 4, titles: 0, verifiedAt: '2026-01-10T18:00:00.000Z' }],
  },
  {
    id: 'player-chris',
    name: 'Chris Morgan',
    favoriteTeam: 'BUF',
    previousRank: 4,
    phone: '••• ••• 0199',
    phoneVerifiedAt: '2025-11-18T18:31:00.000Z',
    messaging: { smsConsent: 'opted_out', consentedAt: '2025-11-18T18:32:00.000Z', optedOutAt: '2025-11-20T15:10:00.000Z', pushConsent: 'opted_out', resultsChannel: 'in_app' },
    trashTalk: { level: 'none', updatedAt: '2025-11-20T15:11:00.000Z' },
    jackPolicy: { roastEnabled: false, playerConsentLevel: 'clean', adminAssignedLevel: 'clean', adultLanguageConsent: false, adultAgeGate: true, favoriteTeam: 'BUF', updatedAt: '2025-11-20T15:11:00.000Z', updatedBy: 'player' },
    seasonHistory: [{ season: 2025, correct: 142, incorrect: 130, rank: 5, titles: 0, verifiedAt: '2026-01-10T18:00:00.000Z' }],
  },
];

// Build demo results dynamically from the actual GAMES array so IDs always match.
// Each game gets a plausible final score with the home team winning by default;
// a few upsets are sprinkled in by making the away team win instead.
const DEMO_SCORE_PAIRS = [
  [21, 27], [24, 17], [20, 13], [28, 24], [17, 20], [31, 23], [27, 16], [23, 20],
  [17, 30], [21, 34], [20, 24], [26, 14], [16, 19], [24, 17], [14, 28], [10, 24],
];
const DEMO_AWAY_WINS = new Set([1, 3, 5, 6, 7, 11, 13]); // indices where away wins
export const DEMO_RESULTS = Object.fromEntries(GAMES.map((game, i) => {
  const [awayScore, homeScore] = DEMO_SCORE_PAIRS[i % DEMO_SCORE_PAIRS.length];
  const winner = DEMO_AWAY_WINS.has(i) ? game.away : game.home;
  return [game.id, { awayScore, homeScore, winner }];
}));

const wrongTeam = (game, winner) => (winner === game.away ? game.home : game.away);

// missedIndices are 0-based indices into GAMES — the pick for that game will be wrong
function picksWithMisses(missedIndices) {
  return Object.fromEntries(GAMES.map((game, i) => {
    const result = DEMO_RESULTS[game.id];
    const winner = result ? result.winner : game.home;
    return [game.id, missedIndices.includes(i) ? wrongTeam(game, winner) : winner];
  }));
}

export const DEMO_SHEETS = [
  { id: 'sheet-marcus', playerId: 'player-marcus', name: 'Marcus Reed', picks: picksWithMisses([2, 10]), tiebreaker: 52, paid: true, season: DEMO_SEASON, week: WEEK, submittedAt: '2025-11-20T19:02:00.000Z' },
  { id: 'sheet-jordan', playerId: 'player-jordan', name: 'Jordan Lee', picks: picksWithMisses([0, 3, 11]), tiebreaker: 54, paid: true, season: DEMO_SEASON, week: WEEK, submittedAt: '2025-11-20T19:08:00.000Z' },
  { id: 'sheet-taylor', playerId: 'player-taylor', name: 'Taylor Brooks', picks: picksWithMisses([1, 2, 4, 6, 9, 12]), tiebreaker: 48, paid: true, season: DEMO_SEASON, week: WEEK, submittedAt: '2025-11-20T19:14:00.000Z' },
  { id: 'sheet-chris', playerId: 'player-chris', name: 'Chris Morgan', picks: picksWithMisses([0, 1, 3, 5, 7, 10, 13]), tiebreaker: 46, paid: true, season: DEMO_SEASON, week: WEEK, submittedAt: '2025-11-20T19:19:00.000Z' },
];

export function scoreSheet(sheet, results = DEMO_RESULTS) {
  return Object.entries(sheet.picks).reduce(
    (score, [gameId, pick]) => score + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );
}

export function buildLeaderboard(players = DEMO_PLAYERS, sheets = DEMO_SHEETS, results = DEMO_RESULTS) {
  return sheets.map((sheet) => {
    const player = players.find((candidate) => candidate.id === sheet.playerId);
    return { ...sheet, score: scoreSheet(sheet, results), previousRank: player?.previousRank ?? null };
  }).sort((a, b) => b.score - a.score || a.tiebreaker - b.tiebreaker)
    .map((entry, index) => ({ ...entry, rank: index + 1, rankChange: entry.previousRank ? entry.previousRank - (index + 1) : 0 }));
}

export const DEMO_SIDE_BET_PROPOSALS = [
  {
    id: 'bet-week-score',
    creatorId: 'player-marcus',
    opponentId: 'player-jordan',
    event: `Week ${WEEK} final pick score`,
    terms: 'Higher verified weekly score wins',
    settlementRule: 'compare_weekly_score',
    stake: { type: 'virtual_tokens', amount: 25, label: '25 Badguy tokens' },
    visibility: 'participants_only',
    createdAt: '2025-11-20T16:00:00.000Z',
    expiresAt: '2025-11-20T20:00:00.000Z',
    acceptedAt: '2025-11-20T16:08:00.000Z',
    proposalStatus: 'accepted',
    termsLockedAt: '2025-11-20T16:08:00.000Z',
  },
  {
    id: 'bet-featured-total',
    creatorId: 'player-taylor',
    opponentId: 'player-chris',
    event: 'Featured game total over 50 points',
    terms: 'Taylor takes over 50; Chris takes 50 or under',
    settlementRule: 'featured_game_total',
    stake: { type: 'bragging_rights', amount: 1, label: 'Choose next week’s group-chat title' },
    visibility: 'participants_only',
    createdAt: '2025-11-20T17:00:00.000Z',
    expiresAt: '2025-11-20T20:00:00.000Z',
    declinedAt: '2025-11-20T17:12:00.000Z',
    proposalStatus: 'declined',
    declineReason: 'Not interested this week',
  },
];

export function settleSideBet(proposal, leaderboard, resultsFinalizedAt) {
  if (proposal.proposalStatus !== 'accepted') return { ...proposal, settlementStatus: 'not_applicable' };
  if (!resultsFinalizedAt) return { ...proposal, settlementStatus: 'waiting_for_verified_results' };
  if (proposal.settlementRule !== 'compare_weekly_score') return { ...proposal, settlementStatus: 'manual_review' };

  const creator = leaderboard.find((entry) => entry.playerId === proposal.creatorId);
  const opponent = leaderboard.find((entry) => entry.playerId === proposal.opponentId);
  if (!creator || !opponent || creator.score === opponent.score) return { ...proposal, settlementStatus: 'push' };

  return {
    ...proposal,
    settlementStatus: 'settled',
    settledAt: '2025-11-24T05:42:00.000Z',
    verifiedFrom: `week-${WEEK}-standings`,
    creatorScore: creator.score,
    opponentScore: opponent.score,
    winnerId: creator.score > opponent.score ? creator.playerId : opponent.playerId,
  };
}

const restrictedTopic = /\b(family|wife|husband|mother|father|health|diagnos|appearance|weight|salary|job|house|car|bank|money problems?)\b/i;

export function moderateRoastCandidates(candidates, players = DEMO_PLAYERS, leagueSettings = { trashTalkEnabled: true, maximumTone: 'maximum' }) {
  return candidates.reduce((outcome, candidate) => {
    const player = players.find((item) => item.id === candidate.targetPlayerId);
    let reason = '';
    if (!leagueSettings.trashTalkEnabled) reason = 'league_trash_talk_disabled';
    else if (!player || player.trashTalk.level === 'none') reason = 'player_opted_out';
    else if (TONE_LEVELS.indexOf(candidate.tone) > TONE_LEVELS.indexOf(player.trashTalk.level)) reason = 'tone_exceeds_player_consent';
    else if (TONE_LEVELS.indexOf(candidate.tone) > TONE_LEVELS.indexOf(leagueSettings.maximumTone)) reason = 'tone_exceeds_league_limit';
    else if (restrictedTopic.test(candidate.text)) reason = 'private_or_sensitive_topic';

    if (reason) outcome.blocked.push({ ...candidate, decision: 'blocked', reason });
    else outcome.allowed.push({ ...candidate, decision: 'allowed' });
    return outcome;
  }, { allowed: [], blocked: [] });
}

export function buildBroadcastDeliveries(players = DEMO_PLAYERS, failedPlayerIds = ['player-jordan']) {
  return players.map((player) => {
    if (!player.phoneVerifiedAt) {
      return { playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'phone_not_verified' };
    }
    if (player.messaging.smsConsent !== 'opted_in') {
      return { playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'sms_consent_not_active', fallback: { channel: 'in_app', status: 'available' } };
    }
    if (failedPlayerIds.includes(player.id)) {
      return {
        playerId: player.id,
        channel: 'sms',
        status: 'failed',
        providerAttempted: true,
        provider: 'Twilio demo adapter',
        errorCode: '30003',
        error: 'Unreachable destination handset',
        attemptedAt: '2025-11-24T05:47:00.000Z',
        retryStatus: 'paused_after_one_retry',
        fallback: { channel: 'in_app', status: 'delivered', deliveredAt: '2025-11-24T05:49:00.000Z' },
      };
    }
    return {
      playerId: player.id,
      channel: 'sms',
      status: 'delivered',
      providerAttempted: true,
      provider: 'Twilio demo adapter',
      providerMessageId: `SM_DEMO_${player.id.replace('player-', '').toUpperCase()}`,
      deliveredAt: '2025-11-24T05:48:00.000Z',
    };
  });
}

export function createDemoLeague() {
  const resultsFinalizedAt = '2025-11-24T05:40:00.000Z';
  const leaderboard = buildLeaderboard();
  const sideBets = DEMO_SIDE_BET_PROPOSALS.map((proposal) => settleSideBet(proposal, leaderboard, resultsFinalizedAt));
  const roastCandidates = [
    { id: 'roast-safe', targetPlayerId: 'player-taylor', tone: 'maximum', text: 'Taylor’s picks were so cold this week they may qualify as weather data.' },
    { id: 'roast-no-consent', targetPlayerId: 'player-chris', tone: 'light', text: 'Chris finished last, but at least the effort was consistent.' },
    { id: 'roast-private-topic', targetPlayerId: 'player-taylor', tone: 'competitive', text: 'Taylor should sell the car after a performance like that.' },
  ];
  const moderation = moderateRoastCandidates(roastCandidates);
  const winner = leaderboard[0];
  const biggestRise = [...leaderboard].sort((a, b) => b.rankChange - a.rankChange)[0];
  const settledBet = sideBets.find((bet) => bet.settlementStatus === 'settled');
  const totalGames = GAMES.length;
  const finalText = [
    `${winner.name} wins Week ${WEEK} at ${winner.score}–${totalGames - winner.score}${leaderboard[1] ? `, one point ahead of ${leaderboard[1].name}` : ‘’}. ${leaderboard.slice(2).map((e) => `${e.name} finishes ${e.score}–${totalGames - e.score}`).join(‘, while ‘)}${leaderboard.length > 2 ? ‘.’ : ‘’} ${biggestRise.name} makes the biggest climb${biggestRise.rankChange > 0 ? `, moving up ${biggestRise.rankChange} spot${biggestRise.rankChange > 1 ? ‘s’ : ‘’}` : ‘’}.`,
    settledBet ? `Side bet settled: ${settledBet.winnerId === settledBet.creatorId ? DEMO_PLAYERS.find((p) => p.id === settledBet.creatorId)?.name : DEMO_PLAYERS.find((p) => p.id === settledBet.opponentId)?.name} won ${settledBet.stake.label}. ${moderation.allowed[0]?.text ?? ‘’}` : (moderation.allowed[0]?.text ?? ‘’),
    `Commissioner’s note: All ${totalGames} game results are verified; next week’s picks lock Thursday at 7:15 PM CT.`,
  ].join(‘\n\n’);
  const recap = {
    id: 'recap-week-12',
    week: WEEK,
    generationSource: 'gemini_demo_fixture',
    generationStatus: 'generated',
    generatedAt: '2025-11-24T05:43:00.000Z',
    factsSnapshot: {
      resultsFinalizedAt,
      verifiedGameCount: GAMES.length,
      winnerId: winner.playerId,
      winnerScore: winner.score,
      rankings: leaderboard.map(({ playerId, rank, score }) => ({ playerId, rank, score })),
      biggestRisePlayerId: biggestRise.playerId,
      settledSideBetId: settledBet?.id ?? null,
    },
    moderationStatus: moderation.blocked.length ? 'passed_with_edits' : 'passed',
    moderation,
    adminApproval: { status: 'approved', approvedBy: 'Commissioner Demo', approvedAt: '2025-11-24T05:45:00.000Z' },
    finalText,
  };
  const deliveries = buildBroadcastDeliveries();
  const broadcast = {
    id: 'broadcast-week-12',
    recapId: recap.id,
    architecture: 'individual_broadcast_sms_plus_in_app',
    status: 'completed_with_failures',
    approvedAt: recap.adminApproval.approvedAt,
    sentAt: '2025-11-24T05:46:00.000Z',
    deliveries,
  };
  const auditLog = [
    { at: resultsFinalizedAt, event: 'results.finalized', detail: `${totalGames} verified game results locked` },
    { at: recap.generatedAt, event: 'recap.generated', detail: 'Grounded fact snapshot sent to Gemini recap pipeline' },
    { at: '2025-11-24T05:44:00.000Z', event: 'moderation.completed', detail: '1 roast allowed; 2 candidates blocked' },
    { at: recap.adminApproval.approvedAt, event: 'recap.approved', detail: 'Commissioner approved edited message' },
    { at: broadcast.sentAt, event: 'broadcast.started', detail: '3 consented SMS recipients; 1 suppressed before provider call' },
    { at: '2025-11-24T05:49:00.000Z', event: 'delivery.fallback', detail: 'Jordan SMS failed; in-app fallback delivered' },
    { at: settledBet?.settledAt ?? broadcast.sentAt, event: 'side_bet.settled', detail: '25 virtual tokens awarded to Marcus from verified standings' },
  ];

  return {
    id: 'league-sunday-syndicate-demo',
    name: '405 BADGUYS PARLAY',
    season: DEMO_SEASON,
    week: WEEK,
    settings: {
      trashTalkEnabled: true, maximumTone: 'maximum', autoSend: false, approvalRequired: true, smsMode: 'individual_broadcast',
      jack: {
        enabled: true, privateAdultSpace: true, ageGateRequired: true, globalRoastCap: 'target', profanityLevel: 'mild', winnerCelebrations: true, adminApprovalRequired: true,
        voice: { enabled: true, autoplay: false, volume: 0.82, speed: 0.94, pitch: 0.78, captions: true, reducedAudio: false, textOnly: false, language: 'en-US', profile: 'deep-warm-original' },
        animation: { enabled: true, reducedMotion: false },
      },
    },
    players: DEMO_PLAYERS,
    sheets: DEMO_SHEETS,
    results: DEMO_RESULTS,
    leaderboard,
    recap,
    sideBets,
    broadcast,
    auditLog,
  };
}

export const DEMO_LEAGUE = createDemoLeague();

export const DEMO_CHAT = [
  { id: 'chat-demo-1', name: 'Marcus Reed', msg: 'The climb from third to first hits different. Receipts are open.', time: '2025-11-24T05:52:00.000Z' },
  { id: 'chat-demo-2', name: 'Taylor Brooks', msg: 'Maximum roast mode stays on. I’ll be back next week. 🔥', time: '2025-11-24T05:54:00.000Z' },
];
