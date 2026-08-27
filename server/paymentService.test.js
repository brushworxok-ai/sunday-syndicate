import test from 'node:test';
import assert from 'node:assert/strict';
import { completedCheckoutFunding, createPaymentProvider } from './paymentService.js';

test('demo funding provider allows only approved entry-credit bundles', async () => {
  const provider = createPaymentProvider({ PAYMENTS_PROVIDER: 'demo' });
  const session = await provider.createCheckout({ leagueId: 'league', playerId: 'player', amountCents: 6000 });
  assert.equal(provider.kind, 'demo');
  assert.equal(session.amountCents, 6000);
  assert.equal(session.status, 'pending');
  await assert.rejects(provider.createCheckout({ leagueId: 'league', playerId: 'player', amountCents: 2500 }), /approved funding amount/);
});

test('Stripe completion parser ignores unpaid and unrelated events', () => {
  assert.equal(completedCheckoutFunding({ type: 'payment_intent.created' }), null);
  assert.equal(completedCheckoutFunding({ type: 'checkout.session.completed', data: { object: { payment_status: 'unpaid' } } }), null);
  assert.deepEqual(completedCheckoutFunding({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 6000, metadata: { leagueId: 'league', playerId: 'player' } } } }), {
    providerRef: 'cs_1', eventId: 'evt_1', amountCents: 6000, leagueId: 'league', playerId: 'player',
  });
});
