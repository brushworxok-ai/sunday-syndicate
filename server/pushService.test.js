import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { sendApprovedPushRecap } from './pushService.js';

const subscription = (suffix) => ({
  endpoint: `https://push.example.test/${suffix}`,
  keys: { p256dh: `public-${suffix}`, auth: `auth-${suffix}` },
});

test('Web Push recap honors opt-in, records delivery, and suppresses other players', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  store.savePushSubscription('player-marcus', subscription('marcus'), 'test browser');
  const sent = [];
  const provider = { name: 'Web Push test provider', send: async (target, payload) => { sent.push({ target, payload }); return { statusCode: 201 }; } };

  const broadcast = await sendApprovedPushRecap({
    store,
    leagueId: 'league-sunday-syndicate-demo',
    recapId: 'recap-week-12',
    provider,
    appBaseUrl: 'https://league.example/app',
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].target.endpoint, subscription('marcus').endpoint);
  assert.match(sent[0].payload.url, /view=results&season=2025&week=12/);
  assert.equal(broadcast.architecture, 'individual_web_push_plus_in_app');
  assert.equal(broadcast.deliveries.find((item) => item.playerId === 'player-marcus').status, 'delivered');
  assert.equal(broadcast.deliveries.find((item) => item.playerId === 'player-chris').reason, 'push_consent_not_active');
  store.close();
});

test('expired Web Push subscription is removed and falls back in-app', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  store.savePushSubscription('player-jordan', subscription('jordan'), 'test browser');
  const provider = { name: 'Web Push test provider', send: async () => { const error = new Error('Subscription expired'); error.statusCode = 410; throw error; } };

  const broadcast = await sendApprovedPushRecap({ store, leagueId: 'league-sunday-syndicate-demo', recapId: 'recap-week-12', provider });
  const delivery = broadcast.deliveries.find((item) => item.playerId === 'player-jordan');
  assert.equal(delivery.status, 'failed');
  assert.equal(delivery.fallback.status, 'delivered');
  assert.equal(store.getPushSubscriptions('player-jordan').length, 0);
  assert.equal(store.getPlayer('player-jordan').messaging.pushConsent, 'opted_out');
  store.close();
});
