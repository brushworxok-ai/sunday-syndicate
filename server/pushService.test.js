import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverPush, savePlayerSubscription, removePlayerSubscription, subscriptionsFor, validatePushSubscription } from './pushService.js';

const sub = (suffix = 'one') => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`, keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 8).toString('base64url') } });
test('Push validates the endpoint and encryption keys before saving', () => {
  assert.equal(validatePushSubscription(sub()).endpoint, sub().endpoint);
  assert.throws(() => validatePushSubscription({ ...sub(), endpoint: 'https://localhost/internal' }), /Unsupported/);
  assert.throws(() => validatePushSubscription({ ...sub(), endpoint: 'https://fcm.googleapis.com.attacker.test/path' }), /Unsupported/);
  assert.throws(() => validatePushSubscription({ ...sub(), keys: {} }), /encryption keys/);
});

test('Push keeps multiple devices and transfers a shared device to one account only', () => {
  const settings = { pushSubscriptions: { old: sub() } };
  savePlayerSubscription(settings, 'new', sub());
  savePlayerSubscription(settings, 'new', sub('phone'));
  assert.equal(settings.pushSubscriptions.old, undefined);
  assert.equal(subscriptionsFor(settings.pushSubscriptions.new).length, 2);
  savePlayerSubscription(settings, 'new', sub());
  assert.equal(subscriptionsFor(settings.pushSubscriptions.new).length, 2);
  removePlayerSubscription(settings, 'new', sub().endpoint);
  assert.equal(subscriptionsFor(settings.pushSubscriptions.new)[0].endpoint, sub('phone').endpoint);
});

test('Push sends to all selected devices and removes only expired endpoints', async () => {
  const settings = { pushSubscriptions: { p1: [sub(), sub('expired')], p2: sub('other') } };
  const calls = [];
  const store = { getLeague: async () => ({ players: [{ id: 'p1' }, { id: 'p2' }], settings }), mergeLeagueSettings: async (_id, update) => update(settings) };
  const webpush = { sendNotification: async (target) => { calls.push(target.endpoint); if (target.endpoint.endsWith('expired')) throw { statusCode: 410 }; } };
  const report = await deliverPush({ store, leagueId: 'league', webpush, playerIds: ['p1'], payload: { title: 'Test' } });
  assert.deepEqual(report, { configured: true, sent: 1, failed: 0, expired: 1, total: 2 });
  assert.equal(calls.length, 2);
  assert.equal(subscriptionsFor(settings.pushSubscriptions.p1).length, 1);
  assert.ok(settings.pushSubscriptions.p2);
});

test('A targeted push test cannot send to another player’s device', async () => {
  const store = { getLeague: async () => ({ players: [{ id: 'p1' }, { id: 'p2' }], settings: { pushSubscriptions: { p2: sub() } } }) };
  const report = await deliverPush({ store, leagueId: 'league', webpush: { sendNotification: () => assert.fail('must not send') }, playerIds: ['p1'], endpoint: sub().endpoint, payload: {} });
  assert.equal(report.total, 0);
});
