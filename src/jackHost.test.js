import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerSeasonMemory,
  buildWeeklyWinnerRecognition,
  moderateJackMessage,
  nextJackAvatarState,
  normalizeJackVoiceSettings,
  previewJackRoast,
  resolveJackRoastPolicy,
} from './jackHost.js';

const adultPlayer = {
  id: 'player-taylor', name: 'Taylor Brooks',
  jackPolicy: { roastEnabled: true, playerConsentLevel: 'target', adminAssignedLevel: 'target', adultLanguageConsent: true, adultAgeGate: true },
};
const adultLeague = { jack: { enabled: true, privateAdultSpace: true, ageGateRequired: true, globalRoastCap: 'target', profanityLevel: 'adult' } };

test('strictest roast limit wins even when the admin selects a higher level', () => {
  const player = { ...adultPlayer, jackPolicy: { ...adultPlayer.jackPolicy, playerConsentLevel: 'pg13', adminAssignedLevel: 'target' } };
  const policy = resolveJackRoastPolicy({ player, leagueSettings: adultLeague });
  assert.equal(policy.effectiveLevel, 'pg13');
  assert.equal(policy.profanityAllowed, 'mild');
});

test('adult language requires private space, age gate, consent, admin level, and global permission', () => {
  assert.equal(resolveJackRoastPolicy({ player: adultPlayer, leagueSettings: adultLeague }).profanityAllowed, 'adult');
  const noAgeGate = { ...adultPlayer, jackPolicy: { ...adultPlayer.jackPolicy, adultAgeGate: false } };
  const policy = resolveJackRoastPolicy({ player: noAgeGate, leagueSettings: adultLeague });
  assert.equal(policy.effectiveLevel, 'pg13');
  assert.equal(policy.profanityAllowed, 'mild');
});

test('weekly winners are protected from roasting', () => {
  const policy = resolveJackRoastPolicy({ player: adultPlayer, leagueSettings: adultLeague, isWinner: true });
  assert.equal(policy.roastAllowed, false);
  assert.equal(previewJackRoast({ player: adultPlayer, leagueSettings: adultLeague, isWinner: true, fact: { correct: 12, incorrect: 2 } }).state, 'winner');
});

test('moderation blocks private topics, unsupported facts, and excessive language', () => {
  const facts = ['week-1-score'];
  assert.equal(moderateJackMessage({ text: 'That sheet was bullshit with cleats.', targetPlayer: adultPlayer, leagueSettings: adultLeague, requestedLevel: 'target', groundedFactIds: facts, availableFactIds: facts }).decision, 'allowed');
  assert.equal(moderateJackMessage({ text: 'Go talk about your family.', targetPlayer: adultPlayer, leagueSettings: adultLeague, requestedLevel: 'target', groundedFactIds: facts, availableFactIds: facts }).reason, 'personal_or_protected_topic');
  assert.equal(moderateJackMessage({ text: 'That pick was rough.', targetPlayer: adultPlayer, leagueSettings: adultLeague, requestedLevel: 'clean', groundedFactIds: ['made-up'], availableFactIds: facts }).reason, 'unsupported_or_missing_fact');
});

test('season memory derives streaks, best and worst weeks, and prior titles from verified records', () => {
  const memory = buildPlayerSeasonMemory({
    player: { id: 'p1', favoriteTeam: 'KC' },
    weeklyRecords: [
      { week: 1, correct: 10, incorrect: 4, weeklyWinner: true, seasonRank: 2, upsetPicksWon: 1, verifiedAt: '2026-09-10T10:00:00.000Z' },
      { week: 2, correct: 12, incorrect: 2, weeklyWinner: true, seasonRank: 1, upsetPicksWon: 2, verifiedAt: '2026-09-17T10:00:00.000Z' },
      { week: 3, correct: 6, incorrect: 8, weeklyWinner: false, seasonRank: 2, missedObviousCalls: 2, verifiedAt: '2026-09-24T10:00:00.000Z' },
    ],
    priorSeasons: [{ season: 2025, correct: 168, incorrect: 104, titles: 1, verifiedAt: '2026-01-10T10:00:00.000Z' }],
  });
  assert.equal(memory.totalPicks, 42);
  assert.equal(memory.longestWinningStreak, 2);
  assert.deepEqual(memory.bestWeek, { week: 2, correct: 12 });
  assert.deepEqual(memory.worstWeek, { week: 3, correct: 6 });
  assert.equal(memory.leagueTitles, 1);
  assert.equal(memory.groundedAt, '2026-09-24T10:00:00.000Z');
});

test('winner recognition waits for verification and preserves co-winners without a tiebreaker', () => {
  const board = [{ playerId: 'p1', name: 'Avery', score: 12 }, { playerId: 'p2', name: 'Marcus', score: 12 }];
  assert.equal(buildWeeklyWinnerRecognition({ leaderboard: board, verified: false }).status, 'pending');
  const tied = buildWeeklyWinnerRecognition({ leaderboard: board, verified: true });
  assert.equal(tied.status, 'co_winners');
  assert.deepEqual(tied.protectedPlayerIds, ['p1', 'p2']);
  const resolved = buildWeeklyWinnerRecognition({ leaderboard: board, verified: true, tiebreaker: { winnerId: 'p2' } });
  assert.equal(resolved.winners[0].name, 'Marcus');
});

test('voice and animation accessibility settings fail into safe static or text-only modes', () => {
  const voice = normalizeJackVoiceSettings({ enabled: true, autoplay: true, textOnly: true, volume: 4, speed: 0.2 });
  assert.equal(voice.enabled, false);
  assert.equal(voice.autoplay, false);
  assert.equal(voice.volume, 1);
  assert.equal(voice.speed, 0.7);
  assert.deepEqual(nextJackAvatarState('roast', { animationEnabled: true, reducedMotion: true }), { state: 'roast', motion: 'static' });
  assert.deepEqual(nextJackAvatarState('made-up', { animationEnabled: true }), { state: 'idle', motion: 'animated' });
});
