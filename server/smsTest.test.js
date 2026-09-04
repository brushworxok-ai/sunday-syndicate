import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCommissionerSmsTest } from './smsTest.js';
import { LeagueStore } from './store.js';

test('A double-click or retry sends only one commissioner test SMS', async (t) => {
  const store = new LeagueStore(':memory:'); t.after(() => store.close());
  let calls = 0;
  const args = { store, leagueId: 'test', destination: '+15555550123', requestId: 'test-1', provider: { async send({ player }) { calls++; assert.equal(player.phoneE164, '+15555550123'); return { id: 'provider-123', status: 'queued' }; } } };
  const [first, second] = await Promise.all([sendCommissionerSmsTest(args), sendCommissionerSmsTest(args)]);
  assert.equal(calls, 1);
  assert.equal(first.status, 'queued');
  assert.equal((await sendCommissionerSmsTest(args)).id, 'provider-123');
  assert.ok(['queued', 'unknown'].includes(second.status));
  assert.equal(calls, 1);
});

test('An uncertain SMS failure is retained and never resent automatically', async (t) => {
  const store = new LeagueStore(':memory:'); t.after(() => store.close());
  let calls = 0;
  const args = { store, leagueId: 'test', destination: '+15555550123', requestId: 'test-2', provider: { async send() { calls++; throw new Error('Timeout'); } } };
  assert.equal((await sendCommissionerSmsTest(args)).status, 'unknown');
  assert.equal((await sendCommissionerSmsTest(args)).accepted, false);
  assert.equal(calls, 1);
});
