import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCurrentSmsConsent, SMS_CONSENT_VERSION } from './smsCompliance.js';

test('SMS delivery requires a verified phone and current explicit consent', () => {
  const player = { phoneVerifiedAt: '2026-09-04', messaging: { smsConsent: 'opted_in', consentVersion: SMS_CONSENT_VERSION } };
  assert.equal(hasCurrentSmsConsent(player), true);
  assert.equal(hasCurrentSmsConsent({ ...player, phoneVerifiedAt: null }), false);
  assert.equal(hasCurrentSmsConsent({ ...player, messaging: { smsConsent: 'opted_in' } }), false);
  assert.equal(hasCurrentSmsConsent({ ...player, messaging: { ...player.messaging, smsConsent: 'opted_out' } }), false);
});
