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

/* The refresh engine: a tiny pulse that moves only when the league changes,
   a league read that carries the same version, and 304s for unchanged reads. */
test('league pulse moves on writes and league reads stay conditional', { timeout: 60_000 }, async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'league-pulse-test-'));
  const fixture = new LeagueStore(path.join(directory, 'test.sqlite'));
  fixture.seedDemo();
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
    rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local test API did not start in time.')), 30_000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Local test API exited (${code}).`)); });
    child.stdout.on('data', (chunk) => { if (String(chunk).includes('League API listening')) { clearTimeout(timer); resolve(); } });
  });
  const base = `http://127.0.0.1:${port}`;
  const league = '/api/leagues/league-sunday-syndicate-demo';
  const request = (route, options = {}) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(5000) });

  // First read runs the maintenance pass; everything after is steady state.
  await request(league);
  const pulse = await (await request(`${league}/pulse`)).json();
  assert.equal(typeof pulse.version, 'number');
  assert.equal(pulse.week, 8);
  assert.equal((await request('/api/leagues/nope/pulse')).status, 404);

  const first = await request(league);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'league read carries an ETag');
  const body = await first.json();
  assert.equal(body.version, pulse.version, 'league snapshot carries the same version as the pulse');

  const unchanged = await request(league, { headers: { 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304, 'unchanged league answers 304 with no body');
  const again = await (await request(`${league}/pulse`)).json();
  assert.equal(again.version, pulse.version, 'reads do not move the version');

  // The live feed may legitimately write finals (the real schedule is in the
  // past), so only insist that the version it reports is the current one.
  const live = await (await request(`${league}/live-scores?week=8`)).json();
  assert.equal(typeof live.version, 'number', 'live scores carry the version too');
  assert.equal(live.version, (await (await request(`${league}/pulse`)).json()).version);
  const settled = await (await request(`${league}/live-scores?week=8`)).json();
  assert.equal(settled.changed, false, 'a second poll with nothing new does no work');
  assert.equal(settled.version, live.version);

  const login = await request('/api/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-commissioner-password' }) });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
  const write = await request(`${league}/results/w8-1`, { method: 'PUT', headers, body: JSON.stringify({ awayScore: 3, homeScore: 30 }) });
  assert.equal(write.status, 200);

  const moved = await (await request(`${league}/pulse`)).json();
  assert.notEqual(moved.version, settled.version, 'a write moves the pulse');
  const current = await request(league);
  const currentTag = current.headers.get('etag');
  const fresh = await request(league, { headers: { 'If-None-Match': etag } });
  assert.equal(fresh.status, 200, 'the old ETag no longer matches after a write');
  assert.equal((await fresh.json()).version, moved.version);
  assert.notEqual(currentTag, etag);
});
