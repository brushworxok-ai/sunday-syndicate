import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTiebreaker, tiebreakerRank, tiebreakerBusted, TIEBREAKER_STEP } from './tiebreaker.js';

test('tiebreaker accepts whole and half points, rejects anything finer', () => {
  assert.equal(TIEBREAKER_STEP, 0.5);
  for (const good of [0, 47, 47.5, '47.5', 250]) assert.equal(validateTiebreaker(good).ok, true, `${good} should be allowed`);
  for (const bad of [47.3, 47.25, -1, 251, '', null, undefined, true, 'abc', NaN]) {
    assert.equal(validateTiebreaker(bad).ok, false, `${String(bad)} should be rejected`);
  }
  assert.equal(validateTiebreaker('47.5').value, 47.5);
  assert.equal(validateTiebreaker(201, { max: 200 }).ok, false); // CFB pools cap at 200
});

test('half-point guesses rank and bust correctly against a whole-number total', () => {
  const actual = 48;
  // 47.5 is under by half a point — better than 47, worse than an exact 48.
  assert.ok(tiebreakerRank(47.5, actual) < tiebreakerRank(47, actual));
  assert.ok(tiebreakerRank(48, actual) < tiebreakerRank(47.5, actual));
  assert.equal(tiebreakerBusted(47.5, actual), false);
  // Half a point over still busts, and busted guesses rank behind every under.
  assert.equal(tiebreakerBusted(48.5, actual), true);
  assert.ok(tiebreakerRank(48.5, actual) > tiebreakerRank(0, actual));
  // Among busts, the closest-over still wins.
  assert.ok(tiebreakerRank(48.5, actual) < tiebreakerRank(49, actual));
});
