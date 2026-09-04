import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminAuth, createPlayerAuth, hashPin, verifyPin, normalizeCredential } from './auth.js';

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(body) { this.body = body; return this; },
  };
}

test('player PINs are salted and verified without storing plaintext', () => {
  const first = hashPin('0142');
  const second = hashPin('0142');
  assert.notEqual(first, second);
  assert.equal(first.includes('0142'), false);
  assert.equal(verifyPin('0142', first), true);
  assert.equal(verifyPin('9999', first), false);
});

test('production blocks seeded demo PINs and requires commissioner-issued access', async () => {
  const credential = { playerId: 'player-1', pinHash: hashPin('0142'), status: 'demo', updatedAt: '2026-08-18T10:00:00.000Z' };
  const store = {
    getPlayerCredential: async () => credential,
    getPlayer: async () => ({ id: 'player-1', leagueId: 'league-1', name: 'Marcus', account: { balanceCents: 0 } }),
  };
  const auth = createPlayerAuth({ store, secret: 'test-secret', allowDemoCredentials: false });
  const response = responseMock();
  await auth.login({ body: { playerId: 'player-1', pin: '0142' } }, response);
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'player_pin_setup_required');
  assert.equal(response.headers['Set-Cookie'], undefined);
});

test('rotating a private PIN immediately invalidates older player sessions', async () => {
  let credential = { playerId: 'player-1', pinHash: hashPin('482615'), status: 'active', updatedAt: '2026-08-18T10:00:00.000Z' };
  const player = { id: 'player-1', leagueId: 'league-1', name: 'Marcus', account: { balanceCents: 8000 } };
  const store = { getPlayerCredential: async () => credential, getPlayer: async () => player };
  const auth = createPlayerAuth({ store, secret: 'test-secret', allowDemoCredentials: false });
  const loginResponse = responseMock();
  await auth.login({ body: { playerId: player.id, pin: '482615' } }, loginResponse);
  assert.equal(loginResponse.statusCode, 200);
  const cookie = loginResponse.headers['Set-Cookie'].split(';')[0];

  const validResponse = responseMock();
  await auth.status({ headers: { cookie } }, validResponse);
  assert.equal(validResponse.body.authenticated, true);

  credential = { ...credential, pinHash: hashPin('918273'), updatedAt: '2026-08-18T11:00:00.000Z' };
  const staleResponse = responseMock();
  await auth.status({ headers: { cookie } }, staleResponse);
  assert.equal(staleResponse.body.authenticated, false);
  assert.match(staleResponse.headers['Set-Cookie'], /Max-Age=0/);
});

test('Malformed cookies are ignored without breaking commissioner authentication', () => {
  const auth = createAdminAuth({ password: 'secret', secret: 'test-secret' });
  const login = responseMock();
  auth.login({ body: { password: 'secret' } }, login);
  const cookie = login.headers['Set-Cookie'].split(';')[0];
  assert.equal(auth.isAuthenticated({ headers: { cookie: `junk=%; ${cookie}` } }), true);
  assert.equal(auth.isAuthenticated({ headers: { cookie: 'syndicate_admin=%zz' } }), false);
});

test('Legacy demo credentials are rejected without blocking existing real accounts', () => {
  assert.equal(normalizeCredential({ updatedAt: '2025-11-18T18:00:00.000Z' }).status, 'demo');
  assert.equal(normalizeCredential({ updatedAt: '2026-09-01T10:00:00.000Z' }).status, 'active');
});

test('Signed-in players cannot act in a different league', async () => {
  const player = { id: 'p1', leagueId: 'league-a' };
  const credential = { pinHash: hashPin('123456'), status: 'active', updatedAt: 'today' };
  const auth = createPlayerAuth({ store: { getPlayer: async () => player, getPlayerCredential: async () => credential }, secret: 'test' });
  const login = responseMock(); await auth.login({ body: { playerId: 'p1', pin: '123456' } }, login);
  const response = responseMock();
  await auth.requirePlayer({ headers: { cookie: login.headers['Set-Cookie'].split(';')[0] }, params: { leagueId: 'league-b' } }, response, () => assert.fail('Must not reach handler'));
  assert.equal(response.statusCode, 403);
});
