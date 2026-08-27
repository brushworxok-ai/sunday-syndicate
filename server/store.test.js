import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { verifyPin } from './auth.js';

test('SQLite store seeds and assembles the complete demo league', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const league = store.getLeague('league-sunday-syndicate-demo');
  assert.equal(league.players.length, 4);
  assert.equal(league.sheets.length, 4);
  assert.equal(Object.keys(league.results).length, 14);
  assert.equal(league.sideBets.length, 2);
  assert.equal(league.latestBroadcast.deliveries.length, 4);
  store.close();
});

test('score sync claim coalesces simultaneous phones and reopens after the cache window', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const first = store.claimScoreSync(leagueId, { season: 2026, week: 1, provider: 'api_sports', staleBefore: '2026-09-10T11:50:00.000Z', claimedAt: '2026-09-10T12:00:00.000Z' });
  const simultaneous = store.claimScoreSync(leagueId, { season: 2026, week: 1, provider: 'api_sports', staleBefore: '2026-09-10T11:50:01.000Z', claimedAt: '2026-09-10T12:00:01.000Z' });
  assert.equal(first.claimed, true);
  assert.equal(simultaneous.claimed, false);

  store.saveScoreSnapshots(leagueId, { season: 2026, week: 1, provider: 'api_sports', snapshots: [], news: [{ id: 'news-1', headline: 'Verified provider headline', source: 'ESPN' }], syncedAt: '2026-09-10T12:00:02.000Z' });
  assert.equal(store.getLeague(leagueId).settings.nflNews.articles[0].headline, 'Verified provider headline');
  const cached = store.claimScoreSync(leagueId, { season: 2026, week: 1, provider: 'api_sports', staleBefore: '2026-09-10T11:55:00.000Z', claimedAt: '2026-09-10T12:05:00.000Z' });
  const expired = store.claimScoreSync(leagueId, { season: 2026, week: 1, provider: 'api_sports', staleBefore: '2026-09-10T12:01:00.000Z', claimedAt: '2026-09-10T12:11:00.000Z' });
  assert.equal(cached.claimed, false);
  assert.equal(expired.claimed, true);
  store.close();
});

test('preference update creates immutable consent and audit records', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  store.updatePlayerPreferences('player-marcus', { smsConsent: 'opted_out', trashTalkLevel: 'none' }, 'player');
  const league = store.getLeague('league-sunday-syndicate-demo');
  const player = league.players.find((item) => item.id === 'player-marcus');
  assert.equal(player.messaging.smsConsent, 'opted_out');
  assert.equal(player.trashTalk.level, 'none');
  assert.equal(league.consentRecords.filter((record) => record.playerId === 'player-marcus').length, 4);
  assert.equal(league.auditLog[0].event, 'player.preferences_updated');
  store.close();
});

test('entry credits fund once, debit atomically, and reject duplicate weekly sheets', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const player = store.getPlayer('player-marcus');
  assert.equal(player.account.balanceCents, 8000);
  const sheet = { id: 'sheet-2026-w1-marcus', playerId: player.id, name: player.name, picks: {}, tiebreaker: 48, paid: true, season: 2026, week: 1, submittedAt: '2026-09-08T12:00:00.000Z' };
  const charged = store.createPaidSheet(player.leagueId, sheet, 2000);
  assert.equal(charged.account.balanceCents, 6000);
  assert.throws(() => store.createPaidSheet(player.leagueId, { ...sheet, id: 'duplicate' }, 2000), /already locked/);

  const funding = { id: 'funding-demo-1', leagueId: player.leagueId, playerId: player.id, amountCents: 2000, currency: 'usd', provider: 'demo', providerRef: 'demo-ref-1', status: 'pending', checkoutUrl: null, createdAt: '2026-08-13T12:00:00.000Z' };
  store.saveFundingSession(funding);
  assert.equal(store.completeFunding(funding.providerRef, { eventId: 'event-1', amountCents: 2000 }).account.balanceCents, 8000);
  assert.equal(store.completeFunding(funding.providerRef, { eventId: 'event-1', amountCents: 2000 }).account.balanceCents, 8000);
  store.close();
});

test('manual payment stays pending until commissioner confirmation and updates finance safely', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const player = store.getPlayer('player-jordan');
  const startingBalance = player.account.balanceCents;
  const claim = { id: 'manual-payment-jordan-week-1', playerId: player.id, amountCents: 2000, season: 2026, week: 1, createdAt: '2026-09-01T12:00:00.000Z' };
  const pending = store.createManualPaymentClaim(player.leagueId, claim);
  assert.equal(pending.account.balanceCents, startingBalance);
  assert.equal(pending.account.pendingPaymentCents, 2000);
  assert.throws(() => store.createManualPaymentClaim(player.leagueId, { ...claim, id: 'duplicate-payment' }), /already pending or confirmed/);

  const financeBefore = store.getCommissionerFinance(player.leagueId, { season: 2026, week: 1 });
  assert.equal(financeBefore.pendingClaims.length, 1);
  assert.equal(financeBefore.players.find((item) => item.playerId === player.id).weeklyPayment.status, 'pending');

  const confirmed = store.resolveManualPaymentClaim(player.leagueId, claim.id, { decision: 'confirm', actor: 'commissioner' });
  assert.equal(confirmed.account.balanceCents, startingBalance + 2000);
  assert.equal(confirmed.account.pendingPaymentCents, 0);
  assert.equal(store.getCommissionerFinance(player.leagueId, { season: 2026, week: 1 }).pendingClaims.length, 0);
  assert.throws(() => store.resolveManualPaymentClaim(player.leagueId, claim.id, { decision: 'confirm' }), /already been resolved/);
  store.close();
});

test('commissioner can activate, rotate, and create private player access', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const original = store.getPlayerCredential('player-marcus');
  assert.equal(original.status, 'demo');
  assert.equal(verifyPin('0142', original.pinHash), true);

  const activated = store.updatePlayerAccess(leagueId, 'player-marcus', { name: 'Marcus Ready', pin: '482615' });
  const rotated = store.getPlayerCredential('player-marcus');
  assert.equal(activated.credentialStatus, 'active');
  assert.equal(store.getPlayer('player-marcus').name, 'Marcus Ready');
  assert.equal(rotated.status, 'active');
  assert.equal(verifyPin('0142', rotated.pinHash), false);
  assert.equal(verifyPin('482615', rotated.pinHash), true);

  const added = store.createPlayer(leagueId, { name: 'New Player', pin: '918273' });
  const addedCredential = store.getPlayerCredential(added.playerId);
  const league = store.getLeague(leagueId);
  const addedPlayer = league.players.find((player) => player.id === added.playerId);
  assert.equal(league.players.length, 5);
  assert.equal(addedCredential.status, 'active');
  assert.equal(verifyPin('918273', addedCredential.pinHash), true);
  assert.equal(addedPlayer.messaging.pushConsent, 'opted_out');
  assert.equal(addedPlayer.trashTalk.level, 'none');
  assert.equal(league.consentRecords.filter((record) => record.playerId === added.playerId).length, 2);
  store.close();
});

test('commissioner Jack controls persist separately from player-owned consent', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';

  store.updateJackSettings(leagueId, {
    globalRoastCap: 'explicit',
    profanityLevel: 'adult',
    voice: { speed: 0.86, captions: true, textOnly: false },
    animation: { reducedMotion: true },
  }, 'commissioner');
  store.updatePlayerJackPolicy(leagueId, 'player-marcus', {
    adminAssignedLevel: 'target',
    roastEnabled: true,
    favoriteTeam: 'DAL',
  }, 'commissioner');
  store.updatePlayerPreferences('player-marcus', {
    jackPlayerConsentLevel: 'pg13',
    adultLanguageConsent: false,
    adultAgeGate: false,
  }, 'player');

  const league = store.getLeague(leagueId);
  const marcus = league.players.find((player) => player.id === 'player-marcus');
  assert.equal(league.settings.jack.globalRoastCap, 'explicit');
  assert.equal(league.settings.jack.voice.speed, 0.86);
  assert.equal(league.settings.jack.animation.reducedMotion, true);
  assert.equal(marcus.jackPolicy.adminAssignedLevel, 'target');
  assert.equal(marcus.jackPolicy.playerConsentLevel, 'pg13');
  assert.equal(marcus.jackPolicy.adultLanguageConsent, false);
  assert.equal(league.auditLog.some((entry) => entry.event === 'jack.settings_updated'), true);
  assert.equal(league.auditLog.some((entry) => entry.event === 'jack.player_policy_updated'), true);
  assert.equal(league.consentRecords.some((record) => record.channel === 'jack_player_consent' && record.status === 'pg13'), true);
  store.close();
});
