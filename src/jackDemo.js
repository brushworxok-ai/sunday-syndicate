export const JACK_INVITE_CODE = '405JACK';

export const JACK_DEMO_GAME = {
  id: 'jack-demo-buf-kc',
  away: 'BUF',
  awayFull: 'Buffalo Bills',
  home: 'KC',
  homeFull: 'Kansas City Chiefs',
  venue: 'Arrowhead Stadium',
  source: 'Deterministic product-test fixture',
  confidence: 'Verified fixture',
  disclaimer: 'Simulated score — not a real NFL feed',
  before: { awayScore: 20, homeScore: 17, quarter: '4th', clock: '6:08', status: 'live', updatedAt: '8:31 PM CT' },
  after: { awayScore: 20, homeScore: 24, quarter: '4th', clock: '2:14', status: 'live', updatedAt: '8:36 PM CT' },
};

export const JACK_DEMO_INJURY = {
  id: 'injury-kc-qb1',
  team: 'KC',
  playerLabel: 'Kansas City QB1',
  injury: 'Shoulder',
  source: 'Deterministic product-test fixture',
  disclaimer: 'Simulated injury state — not current medical or NFL information',
  before: { status: 'Questionable', participation: 'Limited', updatedAt: '8:31 PM CT', confidence: 'Fixture pending update' },
  after: { status: 'Out', participation: 'Will not return', updatedAt: '8:38 PM CT', confidence: 'Verified fixture update' },
};

export const ROAST_MODE_LABELS = {
  none: 'No Roast Mode',
  light: 'Light Roast Mode',
  competitive: 'Competitive Mode',
  maximum: 'Full Smart-Ass Mode',
};

export const JACK_DEMO_PLAYERS = [
  {
    id: 'player-chris', name: 'Chris Morgan', initials: 'CM', favoriteTeam: 'BUF', favoriteTeamName: 'Buffalo Bills', secondaryTeam: null,
    humor: 'none', baseCorrect: 6, livePick: 'BUF', tiebreaker: 41,
    history: { seasonsPlayed: 3, priorSeason: 2025, correct: 142, incorrect: 130, totalPicks: 272, winPercentage: 52.2, priorRank: 4, weeklyHigh: 12, weeklyLow: 5, titles: 0, bestStreak: 4, rivalry: '4–7 vs Avery', pickSense: 58 },
  },
  {
    id: 'player-marcus', name: 'Marcus Reed', initials: 'MR', favoriteTeam: 'DAL', favoriteTeamName: 'Dallas Cowboys', secondaryTeam: 'OKST',
    humor: 'light', baseCorrect: 8, livePick: 'BUF', tiebreaker: 47,
    history: { seasonsPlayed: 4, priorSeason: 2025, correct: 162, incorrect: 110, totalPicks: 272, winPercentage: 59.6, priorRank: 2, weeklyHigh: 14, weeklyLow: 7, titles: 0, bestStreak: 6, rivalry: '8–9 vs Avery', pickSense: 72 },
  },
  {
    id: 'player-avery', name: 'Avery Johnson', initials: 'AJ', favoriteTeam: 'KC', favoriteTeamName: 'Kansas City Chiefs', secondaryTeam: null,
    humor: 'competitive', baseCorrect: 8, livePick: 'KC', tiebreaker: 45, isNew: false,
    history: { seasonsPlayed: 3, priorSeason: 2025, correct: 168, incorrect: 104, totalPicks: 272, winPercentage: 61.8, priorRank: 1, weeklyHigh: 15, weeklyLow: 8, titles: 1, bestStreak: 7, rivalry: '9–8 vs Marcus', pickSense: 79 },
  },
  {
    id: 'player-taylor', name: 'Taylor Brooks', initials: 'TB', favoriteTeam: 'PHI', favoriteTeamName: 'Philadelphia Eagles', secondaryTeam: null,
    humor: 'maximum', baseCorrect: 6, livePick: 'KC', tiebreaker: 44,
    history: { seasonsPlayed: 2, priorSeason: 2025, correct: 135, incorrect: 137, totalPicks: 272, winPercentage: 49.6, priorRank: 3, weeklyHigh: 13, weeklyLow: 4, titles: 0, bestStreak: 3, rivalry: '6–5 vs Chris', pickSense: 49 },
  },
];

export const JACK_TEST_LEAGUE = {
  id: 'league-jack-intelligence-lab',
  name: '405 BADGUYS · JACK INTELLIGENCE LAB',
  season: 2026,
  week: 1,
  players: JACK_DEMO_PLAYERS,
  priorSeason: 2025,
  dataPolicy: {
    mode: 'deterministic_test_fixture',
    winnerFinalization: 'commissioner_verification_required',
    audioStorage: 'disabled',
    commentaryApproval: 'commissioner_required',
  },
};

export function validateInvite(code) {
  const normalized = String(code ?? '').trim().toUpperCase();
  if (!normalized) return { valid: false, reason: 'Invite code is required.' };
  if (normalized !== JACK_INVITE_CODE) return { valid: false, reason: 'This invite is invalid or has expired.' };
  return { valid: true, leagueName: '405 BADGUYS PARLAY', commissioner: 'League commissioner' };
}

export function createDemoAccount(input = {}) {
  const invite = validateInvite(input.inviteCode);
  const displayName = String(input.displayName ?? '').trim().replace(/\s+/g, ' ');
  const email = String(input.email ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  const humor = String(input.humor ?? 'light');
  if (!invite.valid) return { ok: false, error: invite.reason };
  if (displayName.length < 2 || displayName.length > 40) return { ok: false, error: 'Enter a display name between 2 and 40 characters.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (email === 'marcus@example.com') return { ok: false, error: 'That demo account already belongs to this league.' };
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters for the demo password.' };
  if (!input.acceptRules) return { ok: false, error: 'Accept the league rules to continue.' };
  if (!Object.hasOwn(ROAST_MODE_LABELS, humor)) return { ok: false, error: 'Choose a valid Jack humor preference.' };
  return {
    ok: true,
    account: {
      id: 'demo-new-player', displayName, email, humor, favoriteTeam: input.favoriteTeam || 'KC', leagueName: invite.leagueName,
      verification: 'demo_verified', createdAt: '2026-08-18T21:00:00.000Z',
    },
  };
}

export function jackOnboardingMessage(account) {
  return `Welcome to the 405, ${account.displayName}. I’m Jack—your league host. Your favorite team is ${account.favoriteTeam}, your setting is ${ROAST_MODE_LABELS[account.humor]}, and your next move is simple: review the facts, make every pick, and lock the sheet before kickoff.`;
}

export function buildJackDemoStandings(phase = 'before') {
  const score = JACK_DEMO_GAME[phase] ?? JACK_DEMO_GAME.before;
  const currentWinner = score.awayScore > score.homeScore ? JACK_DEMO_GAME.away : JACK_DEMO_GAME.home;
  const standings = JACK_DEMO_PLAYERS.map((player) => ({
    ...player,
    projectedScore: player.baseCorrect + (player.livePick === currentWinner ? 1 : 0),
  })).sort((left, right) => right.projectedScore - left.projectedScore || left.tiebreaker - right.tiebreaker)
    .map((player, index) => ({ ...player, rank: index + 1 }));

  if (phase === 'before') return standings.map((player) => ({ ...player, movement: 0 }));
  const priorRanks = Object.fromEntries(buildJackDemoStandings('before').map((player) => [player.id, player.rank]));
  return standings.map((player) => ({ ...player, movement: priorRanks[player.id] - player.rank }));
}

export function getPlayerHistory(playerId) {
  return JACK_DEMO_PLAYERS.find((player) => player.id === playerId)?.history ?? null;
}

export function buildJackPlayerComment(playerId, phase = 'after') {
  const player = JACK_DEMO_PLAYERS.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const standing = buildJackDemoStandings(phase).find((candidate) => candidate.id === playerId);
  const fact = `${player.name} is projected #${standing.rank} with ${standing.projectedScore} correct; 2025 record ${player.history.correct}–${player.history.incorrect} (${player.history.winPercentage}%).`;
  const comments = {
    none: `${fact} No joke generated.`,
    light: `${fact} A rough bounce, but the week is still very much alive.`,
    competitive: `${fact} Avery called Kansas City and is currently accepting apologies in alphabetical order.`,
    maximum: `${fact} Taylor’s Kansas City pick finally showed up; the rest of the sheet is still circling the parking lot.`,
  };
  return {
    playerId,
    playerName: player.name,
    mode: player.humor,
    modeLabel: ROAST_MODE_LABELS[player.humor],
    targetedJoke: player.humor !== 'none',
    fact,
    text: comments[player.humor],
  };
}

export function generateJackDemoRecap(phase = 'after') {
  const standings = buildJackDemoStandings(phase);
  const leader = standings[0];
  const commentary = JACK_DEMO_PLAYERS.map((player) => buildJackPlayerComment(player.id, phase));
  return {
    title: 'Jack’s Take · History-aware live edition',
    body: `Kansas City’s fourth-quarter touchdown flipped the simulated live board. ${leader.name} moved into first at ${leader.projectedScore} projected correct. In 2025, Avery finished first at 168–104 while Marcus finished second at 162–110. The game is still live, so these standings are a projection—not a final result.`,
    commentary,
    jokes: commentary.filter((item) => item.targetedJoke).map((item) => ({ targetPlayerId: item.playerId, tone: item.mode, text: item.text })),
    jokeTargets: commentary.filter((item) => item.targetedJoke).map((item) => item.playerId),
    protectedPlayerIds: commentary.filter((item) => !item.targetedJoke).map((item) => item.playerId),
    source: 'deterministic_test_fixture',
    scoreState: phase,
    requiresAdminApproval: true,
  };
}

export function buildJackVoiceAnswer({ playerId = 'player-avery', scorePhase = 'after', injuryPhase = 'after' } = {}) {
  const player = JACK_DEMO_PLAYERS.find((candidate) => candidate.id === playerId) ?? JACK_DEMO_PLAYERS[2];
  const history = player.history;
  const injury = JACK_DEMO_INJURY[injuryPhase] ?? JACK_DEMO_INJURY.before;
  const score = JACK_DEMO_GAME[scorePhase] ?? JACK_DEMO_GAME.before;
  const safeComment = buildJackPlayerComment(player.id, scorePhase);
  return {
    transcript: 'Jack, what injuries matter tonight, and how did I do last year?',
    text: `Test-fixture update: ${JACK_DEMO_INJURY.playerLabel} changed to ${injury.status} with a ${JACK_DEMO_INJURY.injury.toLowerCase()} designation at ${injury.updatedAt}. That matters to ${player.name} because ${player.favoriteTeam} is the favorite team on file and the live pick is ${player.livePick}. In ${history.priorSeason}, ${player.name} went ${history.correct}–${history.incorrect} (${history.winPercentage}%), finished #${history.priorRank}, and recorded ${history.titles} title. The simulated score is ${JACK_DEMO_GAME.home} ${score.homeScore}, ${JACK_DEMO_GAME.away} ${score.awayScore}, ${score.quarter} ${score.clock}. ${safeComment.mode === 'none' ? 'No roast was added.' : safeComment.text.split('. ').at(-1)}`,
    playerId: player.id,
    method: 'voice_transcript',
    source: 'deterministic_test_fixture',
    injuryStatus: injury.status,
    historySeason: history.priorSeason,
    audioStored: false,
  };
}

export function unavailableLiveDataState() {
  return {
    status: 'unavailable',
    label: 'Sports intelligence temporarily unavailable',
    detail: 'Showing the last successful score and injury snapshots. Jack will not invent updates, answer with stale facts as current, or finalize a winner until the commissioner verifies the data.',
    lastSuccessfulScoreUpdate: JACK_DEMO_GAME.after.updatedAt,
    lastSuccessfulInjuryUpdate: JACK_DEMO_INJURY.after.updatedAt,
    nextAction: 'Retry provider or use commissioner verification',
  };
}
