import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { TelnyxSmsProvider, applyDeliveryStatus, sendJackBroadcast } from './messagingService.js';
import { telnyxDeliveryEvent, verifyTelnyxWebhook } from './telnyxWebhook.js';

test('Telnyx finalized events distinguish confirmed, failed and unconfirmed delivery', () => {
  const event = (status) => ({ event_type: 'message.finalized', payload: { id: 'message-1', to: [{ status }] } });
  assert.equal(telnyxDeliveryEvent(event('delivered')).status, 'delivered');
  assert.equal(telnyxDeliveryEvent(event('delivery_failed')).status, 'failed');
  assert.equal(telnyxDeliveryEvent(event('delivery_unconfirmed')).status, 'delivery_unconfirmed');
  assert.equal(telnyxDeliveryEvent(event('unknown')), null);
});

test('Telnyx webhooks require an authentic signature over the exact timely body', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawBody = Buffer.from('{"data":{"event_type":"message.finalized"}}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
  const signature = sign(null, Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]), privateKey).toString('base64');
  const request = { publicKey: key, timestamp, signature, rawBody };
  assert.equal(verifyTelnyxWebhook(request), true);
  assert.equal(verifyTelnyxWebhook({ ...request, rawBody: Buffer.from('{}') }), false);
  assert.equal(verifyTelnyxWebhook({ ...request, now: Number(timestamp) * 1000 + 301_000 }), false);
  assert.equal(verifyTelnyxWebhook({ ...request, publicKey: '' }), false);
});

test('Telnyx accepted messages remain queued, with a real tracking ID and timeout', async () => {
  let call;
  const provider = new TelnyxSmsProvider({ apiKey: 'not-real', fromNumber: '(405) 555-1234', fetchImpl: async (url, options) => {
    call = { url, options };
    return Response.json({ data: { id: 'message-1', to: [{ status: 'queued' }] } });
  } });
  const result = await provider.send({ player: { phoneE164: '+15555551234' }, text: 'Test' });
  assert.deepEqual(result, { status: 'queued', id: 'message-1' });
  assert.equal(JSON.parse(call.options.body).from, '+14055551234');
  assert.ok(call.options.signal);
});

test('Telnyx rejects successful HTTP responses that contain carrier failures', async () => {
  const provider = new TelnyxSmsProvider({ apiKey: 'not-real', fromNumber: '+14055551234', fetchImpl: async () => Response.json({ errors: [{ code: '40010', title: 'Not registered' }] }) });
  await assert.rejects(provider.send({ player: { phoneE164: '+15555551234' }, text: 'Test' }), /40010/);
});

test('Late sent callbacks do not overwrite an already delivered message', async () => {
  const delivery = { status: 'delivered' };
  const store = { findBroadcastByProviderMessageId: async () => ({ broadcast: { deliveries: [delivery] }, deliveryIndex: 0 }), saveBroadcast: () => assert.fail('must not regress') };
  assert.equal(await applyDeliveryStatus({ store, providerMessageId: 'message-1', status: 'sent' }), delivery);
});

test('Uncertain SMS timeouts are not automatically retried and double-sent', async () => {
  let attempts = 0;
  const store = { getLeague: async () => ({}), getPlayer: async () => ({ id: 'p1', phoneVerifiedAt: '2026-09-03', messaging: { smsConsent: 'opted_in' } }), saveBroadcast: async () => {}, writeAudit: async () => {} };
  const provider = { name: 'test', send: async () => { attempts++; throw new DOMException('Timed out', 'TimeoutError'); } };
  const broadcast = await sendJackBroadcast({ store, leagueId: 'league', provider, messages: [{ playerId: 'p1', text: 'test' }] });
  assert.equal(attempts, 1);
  assert.equal(broadcast.deliveries[0].attemptCount, 1);
});

test('Group MMS uses the dedicated endpoint and plain E.164 recipient array', async () => {
  let call;
  const provider = new TelnyxSmsProvider({ apiKey: 'not-real', fromNumber: '4055551234', fetchImpl: async (url, options) => {
    call = { url, body: JSON.parse(options.body) };
    return Response.json({ data: { id: 'group-message' } });
  } });
  const players = [{ phoneE164: '+15555551234' }, { phoneE164: '+15555551235' }];
  assert.equal((await provider.sendGroup({ players, text: 'Test' })).status, 'queued');
  assert.equal(call.url, 'https://api.telnyx.com/v2/messages/group_mms');
  assert.deepEqual(call.body.to, players.map((player) => player.phoneE164));
  await assert.rejects(provider.sendGroup({ players: Array(9).fill(players[0]), text: 'No send' }), /2–8/);
});
