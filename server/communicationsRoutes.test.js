import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { LeagueStore } from './store.js';
import { hashPin } from './auth.js';
import { getCurrentWeek, getGames, isWeekLocked } from '../src/data.js';

test('Communication routes authenticate callers and fail safely without real providers', { timeout: 60_000 }, async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jack-comms-test-'));
  const fixture = new LeagueStore(path.join(directory, 'test.sqlite'));
  fixture.seedDemo();
  const leaguePath = '/api/leagues/league-sunday-syndicate-demo';
  fixture.createPlayer('league-sunday-syndicate-demo', { id: 'player-route-test', name: 'Route Test', phone: 'test-only', phoneE164: null, messaging: { smsConsent: 'opted_out' }, trashTalk: { level: 'none' } }, hashPin('487296'));
  fixture.close();
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', VERCEL: '', REPL_ID: 'deployment-guard-fixture', REPLIT_DEPLOYMENT: '', CRON_SECRET: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', DATABASE_URL: '', DATABASE_PATH: path.join(directory, 'test.sqlite'),
      ADMIN_PASSWORD: 'test-commissioner-password', SESSION_SECRET: 'test-only-secret', ADMIN_PHONE_E164: '', SMS_PROVIDER: 'demo', TELNYX_API_KEY: '', TELNYX_PUBLIC_KEY: '',
      VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', JACK_TTS_PROVIDER: 'browser', JACK_TTS_API_KEY: '', JACK_TTS_VOICE_ID: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
    rmSync(directory, { recursive: true, force: true }); // only this test's mkdtemp directory
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local test API did not start in time.')), 30_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Local test API exited (${code}).`)); });
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('League API listening')) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const request = (route, options = {}) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(5000) });
  const health = await (await request('/api/health')).json();
  assert.equal(health.ttsConfigured, false);
  assert.equal(health.pushConfigured, false);
  assert.equal((await request('/api/push/vapid-public')).status, 503);
  assert.equal((await request('/api/tts', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/push/test', { method: 'POST' })).status, 401);
  assert.equal((await request('/api/sms/diagnose')).status, 401);
  assert.equal((await request('/api/sms/inbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
  const login = await request('/api/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-commissioner-password' }) });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
  const voice = await (await request('/api/tts/diagnose', { headers })).json();
  assert.equal(voice.provider, 'browser');
  assert.equal(voice.configured, false);
  assert.equal((await request('/api/sms/test', { method: 'POST', headers, body: '{}' })).status, 422);
  assert.equal((await request('/api/sms/test', { method: 'POST', headers, body: '{"confirm":true}' })).status, 503);
  assert.equal((await request('/api/cron/auto-pilot', { headers: { 'x-vercel-cron': '1' } })).status, 401);
  const post = (route, body, extraHeaders = {}) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) });
  assert.equal((await post('/api/auth/player', { playerId: 'player-marcus', pin: '0142' })).status, 403);
  const playerLogin = await post('/api/auth/player', { playerId: 'player-route-test', pin: '487296' });
  assert.equal(playerLogin.status, 200);
  const playerHeaders = { Cookie: playerLogin.headers.get('set-cookie').split(';')[0] };
  assert.equal((await post('/api/leagues/another-league/chat', { msg: 'Should fail' }, playerHeaders)).status, 403);
  assert.equal((await post(`${leaguePath}/chat`, { msg: 'Synthetic route check' }, playerHeaders)).status, 201);
  assert.equal((await request(`${leaguePath}/payment-history`, { headers: playerHeaders })).status, 200);
  assert.equal((await request(`${leaguePath}/notifications`, { headers: playerHeaders })).status, 200);
  assert.equal((await request(`${leaguePath}/notifications/all`, { headers: playerHeaders })).status, 401);
  const week = getCurrentWeek();
  assert.equal((await request(`${leaguePath}/results/${getGames(week)[0].id}`, { method: 'PUT', headers, body: '{"awayScore":"","homeScore":0}' })).status, 422);
  const entry = { name: 'Forged name', playerId: 'player-chris', week, tiebreaker: 40, paid: true, picks: Object.fromEntries(getGames(week).map((game) => [game.id, game.home])) };
  assert.equal((await post(`${leaguePath}/entries`, { ...entry, tiebreaker: '' }, playerHeaders)).status, 422);
  assert.equal((await post(`${leaguePath}/entries`, { ...entry, week: week + 1 }, playerHeaders)).status, 422);
  if (!isWeekLocked(week)) {
    const savedResponse = await post(`${leaguePath}/entries`, entry, playerHeaders);
    assert.equal(savedResponse.status, 201);
    const saved = await savedResponse.json();
    assert.equal(saved.paid, false); assert.ok(saved.paymentClaim);
    assert.equal(saved.playerId, 'player-route-test'); assert.equal(saved.name, 'Route Test');
    const publicResponse = await request(leaguePath);
    assert.match(publicResponse.headers.get('cache-control'), /no-store/);
    const hidden = (await publicResponse.json()).sheets.find((sheet) => sheet.id === saved.id);
    assert.deepEqual(hidden.picks, {}); assert.equal(hidden.picksHidden, true);
    const own = (await (await request(leaguePath, { headers: playerHeaders })).json()).sheets.find((sheet) => sheet.id === saved.id);
    assert.deepEqual(own.picks, entry.picks);
    assert.equal((await request(`${leaguePath}/sheets/${saved.id}/paid`, { method: 'PATCH', headers, body: '{"paid":true}' })).status, 200);
    const updated = await (await post(`${leaguePath}/entries`, { ...entry, paid: false }, playerHeaders)).json();
    assert.equal(updated.id, saved.id); assert.equal(updated.paid, true);
    const notifications = await (await request(`${leaguePath}/notifications`, { headers: playerHeaders })).json();
    assert.ok(notifications.notifications.some((notification) => notification.kind === 'payment_confirmed'));
  }
});
