import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetiredCarryoverPromotion as retired } from './carryoverDisplay.js';
test('retire only the historical 2026 Week 2 $220 promotion', () => {
  assert.equal(retired(2026, { amount: 220, sourceWeeks: [2] }), true);
  assert.equal(retired(2026, { amount: 220, sourceWeek: 2 }), true);
  for (const [season, pot] of [[2025,{amount:220,sourceWeek:2}],[2026,{amount:221,sourceWeek:2}],[2026,{amount:220,sourceWeeks:[2,3]}],[2026,{amount:220}],[2026,null]]) assert.equal(retired(season,pot),false);
});
