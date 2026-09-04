import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { PostgresLeagueStore } from './postgresStore.js';
import { DEMO_LEAGUE } from '../src/demoLeague.js';
import { createPlayerAuth, hashPin, verifyPin } from './auth.js';

test('SQLite store seeds and assembles the complete demo league', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const league = store.getLeague('league-sunday-syndicate-demo');
  assert.equal(league.players.length, 4);
  assert.equal(league.sheets.length, 4);
  assert.equal(Object.keys(league.results).length, Object.keys(DEMO_LEAGUE.results).length);
  assert.equal(league.sideBets.length, 2);
  assert.equal(league.latestBroadcast.deliveries.length, 4);
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

test('Real SQLite credentials carry a revision so PIN resets revoke sessions', async (t) => {
  const store = new LeagueStore(':memory:'); t.after(() => store.close()); store.seedDemo();
  assert.equal(store.getPlayerCredential('player-marcus').status, 'demo');
  store.setPlayerPin('player-marcus', hashPin('483920'));
  const credential = store.getPlayerCredential('player-marcus');
  assert.equal(credential.status, 'active'); assert.ok(credential.updatedAt);
  const auth = createPlayerAuth({ store, secret: 'test', allowDemoCredentials: false });
  let cookie;
  await auth.login({ body: { playerId: 'player-marcus', pin: '483920' } }, { setHeader: (_, value) => { cookie = value.split(';')[0]; }, json: (body) => assert.equal(body.authenticated, true) });
  assert.ok(await auth.playerFromRequest({ headers: { cookie } }));
  store.setPlayerPin('player-marcus', hashPin('748302'));
  assert.equal(await auth.playerFromRequest({ headers: { cookie } }), null);
});

test('Updating picks preserves sheet identity, paid status and payment claim', (t) => {
  const store = new LeagueStore(':memory:'); t.after(() => store.close()); store.seedDemo();
  const league = store.getLeague(DEMO_LEAGUE.id); const original = league.sheets[0];
  store.updateSheetFields(league.id, original.id, { paymentClaim: { claimedAt: 'today' } });
  const saved = store.createSheet(league.id, { ...original, id: 'replacement-id', paid: false, picks: { g1: 'KC' }, paymentClaim: null });
  assert.equal(saved.id, original.id); assert.equal(saved.paid, true);
  assert.equal(saved.paymentClaim.claimedAt, 'today');
  assert.equal(store.getLeague(league.id).sheets.filter((sheet) => sheet.playerId === original.playerId).length, 1);
});

test('Postgres resubmission preserves the existing payment record inside its atomic mutation', async () => {
  const draft = { sheets: [{ id: 'original', playerId: 'p1', week: 1, paid: true, paidVia: 'credit', paymentClaim: { claimedAt: 'yesterday' } }], auditLog: [] };
  const store = { mutateLeague: async (_id, mutate) => mutate(draft) };
  const saved = await PostgresLeagueStore.prototype.createSheet.call(store, 'league', { id: 'new', playerId: 'p1', week: 1, paid: false, picks: { g1: 'KC' } });
  assert.equal(saved.id, 'original'); assert.equal(saved.paid, true);
  assert.equal(saved.paidVia, 'credit'); assert.equal(saved.paymentClaim.claimedAt, 'yesterday');
  assert.equal(draft.sheets.length, 1);
});




