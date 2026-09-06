import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { changeDeposit } from './deposits.js';
import { LeagueStore } from './store.js';

test('Pending deposits cannot be spent and retries cannot credit twice', () => {
  const state = { creditLedger: [] };
  const input = { playerId: 'p1', amount: 20, requestId: randomUUID() };
  const d = changeDeposit(state, 'request', input);
  assert.equal(state.creditLedger.length, 0);
  assert.equal(changeDeposit(state, 'request', { ...input, requestId: randomUUID() }).id, d.id);
  changeDeposit(state, 'confirm', { id: d.id });
  changeDeposit(state, 'confirm', { id: d.id });
  assert.equal(state.creditLedger.length, 1);
  assert.equal(state.creditLedger[0].amount, 20);
  assert.equal(changeDeposit(state, 'request', input).id, d.id);
  assert.equal(state.deposits.length, 1);
});

test('Invalid amounts fail and declined deposits never add credit', () => {
  for (const amount of [0, -10, 1001, 1.001, 'abc', Infinity]) assert.throws(() => changeDeposit({}, 'request', { playerId: 'p', amount, requestId: randomUUID() }));
  const state = {};
  const d = changeDeposit(state, 'request', { playerId: 'p', amount: 10.25, requestId: randomUUID() });
  changeDeposit(state, 'reject', { id: d.id });
  changeDeposit(state, 'confirm', { id: d.id });
  assert.equal(d.status, 'rejected');
  assert.equal(state.creditLedger, undefined);
});

test('SQLite persists confirmed deposit and credit atomically, with repeat confirmation safe', () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const playerId = store.getLeague(leagueId).players[0].id;
  const before = store.getCreditBalance(leagueId, playerId);
  const d = store.updateDeposit(leagueId, 'request', { playerId, amount: 50, requestId: randomUUID() });
  assert.equal(store.getCreditBalance(leagueId, playerId), before);
  store.updateDeposit(leagueId, 'confirm', { id: d.id });
  store.updateDeposit(leagueId, 'confirm', { id: d.id });
  assert.equal(store.getCreditBalance(leagueId, playerId), before + 50);
  assert.equal(store.getDeposits(leagueId)[0].status, 'confirmed');
  store.close();
});
