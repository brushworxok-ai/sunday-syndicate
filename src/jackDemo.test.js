import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JACK_DEMO_INJURY,
  JACK_DEMO_PLAYERS,
  JACK_INVITE_CODE,
  ROAST_MODE_LABELS,
  buildJackDemoStandings,
  buildJackPlayerComment,
  buildJackVoiceAnswer,
  createDemoAccount,
  generateJackDemoRecap,
  getPlayerHistory,
  jackOnboardingMessage,
  unavailableLiveDataState,
  validateInvite,
} from './jackDemo.js';

test('Jack demo accepts only the guided invite code', () => {
  assert.equal(validateInvite(JACK_INVITE_CODE).valid, true);
  assert.equal(validateInvite('expired').valid, false);
});

test('Jack demo creates an account only after validation and consent', () => {
  const result = createDemoAccount({ inviteCode: JACK_INVITE_CODE, displayName: 'Avery Johnson', email: 'avery@example.com', password: 'DemoPass26!', humor: 'competitive', acceptRules: true });
  assert.equal(result.ok, true);
  assert.equal(result.account.verification, 'demo_verified');
  assert.equal(createDemoAccount({ inviteCode: JACK_INVITE_CODE, displayName: 'Avery', email: 'bad-email', password: 'DemoPass26!', humor: 'light', acceptRules: true }).ok, false);
  assert.equal(createDemoAccount({ inviteCode: JACK_INVITE_CODE, displayName: 'Avery', email: 'avery@example.com', password: 'DemoPass26!', humor: 'light', acceptRules: false }).ok, false);
});

test('Jack demo personalizes onboarding with favorite-team and tone memory', () => {
  const message = jackOnboardingMessage({ displayName: 'Avery', humor: 'competitive', favoriteTeam: 'KC' });
  assert.match(message, /Welcome to the 405, Avery/);
  assert.match(message, /favorite team is KC/);
  assert.match(message, /Competitive Mode/);
});

test('Jack test league has four distinct favorite teams and every roast mode', () => {
  assert.equal(JACK_DEMO_PLAYERS.length, 4);
  assert.equal(new Set(JACK_DEMO_PLAYERS.map((player) => player.favoriteTeam)).size, 4);
  assert.deepEqual(new Set(JACK_DEMO_PLAYERS.map((player) => player.humor)), new Set(Object.keys(ROAST_MODE_LABELS)));
});

test('Jack demo moves Avery into first after the simulated score update', () => {
  const before = buildJackDemoStandings('before');
  const after = buildJackDemoStandings('after');
  assert.equal(before[0].name, 'Marcus Reed');
  assert.equal(after[0].name, 'Avery Johnson');
  assert.equal(after.find((player) => player.name === 'Avery Johnson').movement > 0, true);
});

test('Jack demo respects joke consent in the recap', () => {
  const recap = generateJackDemoRecap('after');
  assert.equal(recap.jokeTargets.includes('player-avery'), true);
  assert.equal(recap.protectedPlayerIds.includes('player-chris'), true);
  assert.equal(recap.jokes.some((joke) => joke.targetPlayerId === 'player-chris'), false);
  assert.match(recap.body, /projection.not a final result/i);
  assert.equal(recap.requiresAdminApproval, true);
});

test('Jack delivers the exact humor level each player selected', () => {
  const noRoast = buildJackPlayerComment('player-chris', 'after');
  const light = buildJackPlayerComment('player-marcus', 'after');
  const competitive = buildJackPlayerComment('player-avery', 'after');
  const maximum = buildJackPlayerComment('player-taylor', 'after');
  assert.equal(noRoast.targetedJoke, false);
  assert.match(noRoast.text, /No joke generated/);
  assert.match(light.text, /rough bounce/);
  assert.match(competitive.text, /accepting apologies/);
  assert.match(maximum.text, /circling the parking lot/);
});

test('Jack remembers verified prior-season fixture history', () => {
  const history = getPlayerHistory('player-avery');
  assert.equal(history.priorSeason, 2025);
  assert.equal(history.totalPicks, history.correct + history.incorrect);
  assert.equal(history.priorRank, 1);
  assert.equal(history.titles, 1);
  assert.equal(history.pickSense, 79);
});

test('Jack voice answer grounds injury, score, favorite team, and history', () => {
  const answer = buildJackVoiceAnswer({ playerId: 'player-avery', scorePhase: 'after', injuryPhase: 'after' });
  assert.match(answer.text, /changed to Out/);
  assert.match(answer.text, /favorite team on file/);
  assert.match(answer.text, /2025/);
  assert.match(answer.text, /168–104 \(61\.8%\)/);
  assert.match(answer.text, /KC 24, BUF 20/);
  assert.equal(answer.injuryStatus, JACK_DEMO_INJURY.after.status);
  assert.equal(answer.audioStored, false);
});

test('Jack demo provides a safe unavailable-live-data fallback', () => {
  const fallback = unavailableLiveDataState();
  assert.equal(fallback.status, 'unavailable');
  assert.match(fallback.detail, /will not invent updates/i);
  assert.match(fallback.detail, /finalize a winner/i);
  assert.ok(fallback.lastSuccessfulScoreUpdate);
  assert.ok(fallback.lastSuccessfulInjuryUpdate);
});
