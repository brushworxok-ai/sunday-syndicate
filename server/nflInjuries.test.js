import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNflInjuries } from './nflInjuries.js';

test('ESPN season metadata does not shadow the injury array; athlete supplies team', () => {
  const teams = parseNflInjuries({ season: { year: 2026 }, injuries: [{ id: '22', displayName: 'Arizona Cardinals', injuries: [{ athlete: { displayName: 'Test Player', team: { abbreviation: 'ARI' }, position: { abbreviation: 'RB' } }, status: 'Questionable', type: { description: 'ankle' } }] }] });
  assert.equal(teams[0].team, 'ARI');
  assert.equal(teams[0].injuries[0].status, 'Questionable');
  assert.equal(teams[0].injuries[0].type, 'ankle');
});

test('Malformed or empty injury responses fail to a safe empty list', () => {
  for (const input of [null, {}, { season: {}, injuries: {} }, { injuries: [null, { injuries: 'bad' }] }]) assert.deepEqual(parseNflInjuries(input), []);
});
