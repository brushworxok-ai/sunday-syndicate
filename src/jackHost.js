export const JACK_ROAST_LEVELS = ['clean', 'pg13', 'explicit', 'target'];

export const JACK_ROAST_LABELS = {
  clean: 'Clean',
  pg13: 'PG-13',
  explicit: 'Explicit Adult',
  target: "Commissioner's Target",
};

export const JACK_AVATAR_STATES = ['idle', 'listening', 'thinking', 'talking', 'roast', 'winner', 'shock', 'live', 'error'];

export const DEFAULT_JACK_SETTINGS = Object.freeze({
  enabled: true,
  privateAdultSpace: true,
  ageGateRequired: true,
  globalRoastCap: 'target',
  profanityLevel: 'adult',
  winnerCelebrations: true,
  adminApprovalRequired: true,
  voice: {
    enabled: true,
    autoplay: false,
    volume: 0.82,
    speed: 0.94,
    pitch: 0.78,
    captions: true,
    reducedAudio: false,
    textOnly: false,
    language: 'en-US',
    profile: 'deep-warm-original',
  },
  animation: { enabled: true, reducedMotion: false },
});

/* Roast level a player resolves to from their trash-talk dropdown. The league
   runs Explicit by default (private adult friend group), so the default
   "competitive" maps to explicit; players can still dial down to light/PG-13
   or opt out entirely ("none"). */
const legacyLevel = { none: 'clean', light: 'pg13', competitive: 'explicit', maximum: 'target' };
const mildProfanity = /\b(damn|hell|crap)\b/i;
const strongProfanity = /\b(shit|bullshit|fuck|fucking|ass|asshole|nigga|niggas)\b/i;
const prohibitedPersonalTopics = /\b(slur|racial|religion|sexual|sex life|kill|die|threat|wife|husband|mother|father|family|diagnos|health|disab|appearance|weight|salary|job|house|car|bank|debt|money problem|private life)\b/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function validLevel(value, fallback = 'clean') {
  return JACK_ROAST_LEVELS.includes(value) ? value : fallback;
}

function lowerLevel(...levels) {
  return levels.map((level) => JACK_ROAST_LEVELS.indexOf(validLevel(level)))
    .reduce((lowest, value) => Math.min(lowest, value), JACK_ROAST_LEVELS.length - 1);
}

export function normalizeJackSettings(settings = {}) {
  const jack = settings.jack ?? settings;
  return {
    ...clone(DEFAULT_JACK_SETTINGS),
    ...clone(jack),
    globalRoastCap: validLevel(jack.globalRoastCap, DEFAULT_JACK_SETTINGS.globalRoastCap),
    profanityLevel: ['off', 'mild', 'adult'].includes(jack.profanityLevel) ? jack.profanityLevel : DEFAULT_JACK_SETTINGS.profanityLevel,
    voice: normalizeJackVoiceSettings(jack.voice),
    animation: { ...DEFAULT_JACK_SETTINGS.animation, ...(jack.animation ?? {}) },
  };
}

export function normalizePlayerJackPolicy(player = {}) {
  const stored = player.jackPolicy ?? player.trashTalk?.jackPolicy ?? {};
  const legacy = legacyLevel[player.trashTalk?.level] ?? 'clean';
  const legacyOptOut = player.trashTalk?.level === 'none';
  return {
    playerConsentLevel: validLevel(stored.playerConsentLevel, legacy),
    adminAssignedLevel: validLevel(stored.adminAssignedLevel, legacy),
    roastEnabled: stored.roastEnabled ?? !legacyOptOut,
    // Private adult friend group: adult language + age gate default ON so the
    // league runs Explicit out of the box. A player who opts down still lands
    // below explicit via their consent level.
    adultLanguageConsent: stored.adultLanguageConsent ?? true,
    adultAgeGate: stored.adultAgeGate ?? true,
    favoriteTeam: stored.favoriteTeam ?? player.favoriteTeam ?? null,
    updatedAt: stored.updatedAt ?? player.trashTalk?.updatedAt ?? null,
    updatedBy: stored.updatedBy ?? 'player',
  };
}

export function resolveJackRoastPolicy({ player, leagueSettings, isWinner = false } = {}) {
  const league = normalizeJackSettings(leagueSettings);
  const policy = normalizePlayerJackPolicy(player);
  const strictestIndex = lowerLevel(policy.playerConsentLevel, policy.adminAssignedLevel, league.globalRoastCap, 'target');
  let effectiveLevel = JACK_ROAST_LEVELS[strictestIndex];
  const adultSpaceReady = league.privateAdultSpace && (!league.ageGateRequired || policy.adultAgeGate) && policy.adultLanguageConsent;
  if (!adultSpaceReady && ['explicit', 'target'].includes(effectiveLevel)) effectiveLevel = 'pg13';
  const enabled = Boolean(league.enabled && policy.roastEnabled);
  const roastAllowed = enabled && !isWinner;
  const profanityAllowed = roastAllowed && league.profanityLevel !== 'off'
    ? league.profanityLevel === 'adult' && adultSpaceReady && ['explicit', 'target'].includes(effectiveLevel) ? 'adult' : 'mild'
    : 'off';
  return {
    enabled,
    roastAllowed,
    winnerProtected: Boolean(isWinner),
    effectiveLevel: enabled ? effectiveLevel : 'off',
    effectiveLabel: enabled ? JACK_ROAST_LABELS[effectiveLevel] : 'Roasting disabled',
    profanityAllowed,
    strictestLimit: 'platform → admin → player consent',
    adultSpaceReady,
    playerPolicy: policy,
    leaguePolicy: league,
  };
}

export function moderateJackMessage({ text, targetPlayer, leagueSettings, requestedLevel = 'clean', isWinner = false, groundedFactIds = [], availableFactIds = [] } = {}) {
  const message = String(text ?? '').trim();
  const policy = resolveJackRoastPolicy({ player: targetPlayer, leagueSettings, isWinner });
  let reason = '';
  if (!message) reason = 'empty_message';
  else if (!policy.roastAllowed) reason = policy.winnerProtected ? 'winner_protected' : 'roasting_disabled';
  else if (prohibitedPersonalTopics.test(message)) reason = 'personal_or_protected_topic';
  else if (JACK_ROAST_LEVELS.indexOf(validLevel(requestedLevel)) > JACK_ROAST_LEVELS.indexOf(policy.effectiveLevel)) reason = 'requested_level_exceeds_strictest_limit';
  else if (strongProfanity.test(message) && policy.profanityAllowed !== 'adult') reason = 'adult_language_not_allowed';
  else if (mildProfanity.test(message) && policy.profanityAllowed === 'off') reason = 'profanity_disabled';
  else if (!groundedFactIds.length || groundedFactIds.some((id) => !availableFactIds.includes(id))) reason = 'unsupported_or_missing_fact';
  return {
    decision: reason ? 'blocked' : 'allowed',
    reason: reason || null,
    text: message,
    targetPlayerId: targetPlayer?.id ?? null,
    requestedLevel: validLevel(requestedLevel),
    policy,
    groundedFactIds: [...groundedFactIds],
  };
}

export function previewJackRoast({ player, leagueSettings, isWinner = false, fact = {} } = {}) {
  const policy = resolveJackRoastPolicy({ player, leagueSettings, isWinner });
  const name = player?.name ?? 'Player';
  const score = `${Number(fact.correct ?? 0)}–${Number(fact.incorrect ?? 0)}`;
  if (policy.winnerProtected) return { state: 'winner', text: `${name} owns the week at ${score}. That's the champ right there. Jack only got love for the winner.` };
  if (!policy.roastAllowed) return { state: 'protected', text: `${name}: ${score}. Facts only, no roast. Respect the boundary.` };
  const lines = {
    clean: `${name} finished ${score}. That upset pick had all the confidence in the world and zero evidence to back it up.`,
    pg13: `${name} finished ${score}. Bruh, that pick sheet looked like it was filled out during a fire drill. Do better.`,
    explicit: `${name} finished ${score}. Dawg, that sheet was a damn mess. The scoreboard brought receipts and you got cooked.`,
    target: `${name} finished ${score}. Nigga please. That sheet was straight garbage with cleats on. Every warning sign was wide open by ten yards.`,
  };
  return { state: 'roast', text: lines[policy.effectiveLevel], level: policy.effectiveLevel, profanityAllowed: policy.profanityAllowed };
}

export function buildPlayerSeasonMemory({ player, weeklyRecords = [], priorSeasons = [], rivalries = [] } = {}) {
  const ordered = [...weeklyRecords].sort((a, b) => Number(a.week) - Number(b.week));
  const totalPicks = ordered.reduce((total, week) => total + Number(week.correct ?? 0) + Number(week.incorrect ?? 0), 0);
  const correct = ordered.reduce((total, week) => total + Number(week.correct ?? 0), 0);
  const winPercentage = totalPicks ? Number(((correct / totalPicks) * 100).toFixed(1)) : 0;
  let currentType = null; let currentLength = 0; let longestWin = 0; let longestLoss = 0;
  for (const week of ordered) {
    const type = week.weeklyWinner ? 'win' : 'loss';
    if (type === currentType) currentLength += 1; else { currentType = type; currentLength = 1; }
    if (type === 'win') longestWin = Math.max(longestWin, currentLength);
    else longestLoss = Math.max(longestLoss, currentLength);
  }
  const bestWeek = ordered.length ? [...ordered].sort((a, b) => Number(b.correct) - Number(a.correct))[0] : null;
  const worstWeek = ordered.length ? [...ordered].sort((a, b) => Number(a.correct) - Number(b.correct))[0] : null;
  return {
    playerId: player?.id ?? null,
    favoriteTeam: player?.favoriteTeam ?? normalizePlayerJackPolicy(player).favoriteTeam,
    totalPicks,
    correct,
    incorrect: totalPicks - correct,
    winPercentage,
    weeklyRecord: ordered.map((week) => ({ ...clone(week) })),
    seasonRank: ordered.at(-1)?.seasonRank ?? null,
    currentStreak: ordered.length ? { type: currentType, length: currentLength } : { type: 'none', length: 0 },
    longestWinningStreak: longestWin,
    longestLosingStreak: longestLoss,
    bestWeek: bestWeek ? { week: bestWeek.week, correct: bestWeek.correct } : null,
    worstWeek: worstWeek ? { week: worstWeek.week, correct: worstWeek.correct } : null,
    upsetPicksWon: ordered.reduce((total, week) => total + Number(week.upsetPicksWon ?? 0), 0),
    missedObviousCalls: ordered.reduce((total, week) => total + Number(week.missedObviousCalls ?? 0), 0),
    favoriteTeamResults: ordered.map((week) => week.favoriteTeamResult).filter(Boolean),
    rivalries: clone(rivalries),
    priorSeasons: clone(priorSeasons),
    leagueTitles: priorSeasons.reduce((total, season) => total + Number(season.titles ?? 0), 0),
    groundedAt: ordered.at(-1)?.verifiedAt ?? priorSeasons.at(-1)?.verifiedAt ?? null,
  };
}

export function buildWeeklyWinnerRecognition({ leaderboard = [], verified = false, tiebreaker = null, celebrationsEnabled = true } = {}) {
  if (!verified) return { status: 'pending', winners: [], message: 'Winner pending. Jack will wait for verified final results.' };
  if (!leaderboard.length) return { status: 'unavailable', winners: [], message: 'No verified player entries are available.' };
  const topScore = Math.max(...leaderboard.map((entry) => Number(entry.score)));
  let tied = leaderboard.filter((entry) => Number(entry.score) === topScore);
  // Closest-without-going-over: when entries carry a computed tiebreakerRank
  // (lower = better), the tie narrows to the best rank before co-winners.
  if (tied.length > 1 && tied.every((entry) => Number.isFinite(Number(entry.tiebreakerRank)))) {
    const bestRank = Math.min(...tied.map((entry) => Number(entry.tiebreakerRank)));
    tied = tied.filter((entry) => Number(entry.tiebreakerRank) === bestRank);
  }
  let winners = tied;
  let resolution = tied.length > 1 ? 'co_winners' : 'highest_score';
  if (tied.length > 1 && tiebreaker?.winnerId) {
    winners = tied.filter((entry) => entry.playerId === tiebreaker.winnerId);
    resolution = winners.length ? 'verified_tiebreaker' : 'co_winners';
    if (!winners.length) winners = tied;
  }
  const names = winners.map((winner) => winner.name).join(' & ');
  return {
    status: winners.length > 1 ? 'co_winners' : 'winner',
    winners: clone(winners),
    protectedPlayerIds: winners.map((winner) => winner.playerId),
    resolution,
    celebrationEnabled: Boolean(celebrationsEnabled),
    message: `${names} ${winners.length > 1 ? 'share' : 'owns'} the week at ${topScore} correct. Respect the work; the winner roast is off.`,
  };
}

export function normalizeJackVoiceSettings(settings = {}) {
  const merged = { ...DEFAULT_JACK_SETTINGS.voice, ...(settings ?? {}) };
  merged.volume = Math.min(1, Math.max(0, Number(merged.volume)));
  merged.speed = Math.min(1.3, Math.max(0.7, Number(merged.speed)));
  merged.pitch = Math.min(1.1, Math.max(0.6, Number(merged.pitch)));
  if (merged.textOnly) { merged.enabled = false; merged.autoplay = false; }
  if (merged.reducedAudio) merged.autoplay = false;
  return merged;
}

export function nextJackAvatarState(requested, { animationEnabled = true, reducedMotion = false } = {}) {
  if (!animationEnabled || reducedMotion) return { state: JACK_AVATAR_STATES.includes(requested) ? requested : 'idle', motion: 'static' };
  return { state: JACK_AVATAR_STATES.includes(requested) ? requested : 'idle', motion: 'animated' };
}
