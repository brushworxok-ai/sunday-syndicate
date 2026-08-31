import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { DEMO_LEAGUE } from '../src/demoLeague.js';
import { verifyPin } from './auth.js';

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




