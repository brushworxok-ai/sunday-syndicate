import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDepositAmount, pendingDeposits, DEPOSIT_PRESETS } from './deposits.js';

test('presets are all valid deposit amounts', () => {
  for (const amount of DEPOSIT_PRESETS) assert.equal(validateDepositAmount(amount).ok, true);
});

test('rejects fractional, tiny, huge, and junk amounts', () => {
  assert.equal(validateDepositAmount(12.5).ok, false);
  assert.equal(validateDepositAmount(1).ok, false);
  assert.equal(validateDepositAmount(5000).ok, false);
  assert.equal(validateDepositAmount('abc').ok, false);
  assert.equal(validateDepositAmount('40').value, 40);
});

test('pendingDeposits filters by status and player', () => {
  const list = [
    { id: 'a', playerId: 'p1', status: 'pending' },
    { id: 'b', playerId: 'p1', status: 'confirmed' },
    { id: 'c', playerId: 'p2', status: 'pending' },
  ];
  assert.deepEqual(pendingDeposits(list).map((d) => d.id), ['a', 'c']);
  assert.deepEqual(pendingDeposits(list, 'p1').map((d) => d.id), ['a']);
});
