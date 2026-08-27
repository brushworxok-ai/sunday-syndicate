import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMISSIONER_PAYMENT_METHODS, buildPaymentMemo, commissionerPaymentHref } from './commissionerPayments.js';

test('commissioner payment methods use the approved destinations', () => {
  const byId = Object.fromEntries(COMMISSIONER_PAYMENT_METHODS.map((method) => [method.id, method]));
  assert.equal(commissionerPaymentHref(byId.cashapp, 20), 'https://cash.app/$Tique');
  assert.equal(commissionerPaymentHref(byId.paypal, 20), 'https://www.paypal.com/paypalme/Eubanks1212/20USD');
  assert.equal(commissionerPaymentHref(byId.applecash, 20), 'sms:+14055038055');
});

test('payment memo identifies league, week, player, and purpose', () => {
  assert.equal(buildPaymentMemo({ season: 2026, week: 4, playerName: '  Marcus   Johnson  ' }), '405 BADGUYS · 2026 W4 · Marcus Johnson · weekly entry');
  assert.equal(buildPaymentMemo({ season: 2026, week: 1, playerName: 'Taylor', purpose: 'season pool' }), '405 BADGUYS · 2026 W1 · Taylor · season pool');
});
