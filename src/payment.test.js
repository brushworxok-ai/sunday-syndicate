import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayment, preferredHandle, hasPaymentHandle } from './payment.js';

test('normalizes $cashtag, @venmo and pasted URLs', () => {
  const { payment } = normalizePayment({ cashApp: '$Tique', venmo: 'https://venmo.com/u/tique-405', paypal: 'paypal.me/tique' });
  assert.equal(payment.cashApp, 'Tique');
  assert.equal(payment.venmo, 'tique-405');
  assert.equal(payment.paypal, 'tique');
  assert.equal(payment.preferred, 'cashapp');
});

test('preferred must be a filled handle, else falls back to first set', () => {
  const { payment } = normalizePayment({ venmo: '@bob', preferred: 'cashapp' });
  assert.equal(payment.preferred, 'venmo');
  assert.equal(normalizePayment({}).payment.preferred, null);
});

test('rejects junk handles', () => {
  assert.ok(normalizePayment({ cashApp: '$<script>' }).error);
  assert.ok(normalizePayment({ venmo: 'has space' }).error);
});

test('preferredHandle builds display + link', () => {
  const player = { name: 'A', payment: { cashApp: 'Tique', venmo: 'tique', preferred: 'venmo' } };
  const pay = preferredHandle(player);
  assert.equal(pay.display, '@tique');
  assert.equal(pay.url, 'https://venmo.com/u/tique');
  assert.equal(hasPaymentHandle({ payment: null }), false);
});
