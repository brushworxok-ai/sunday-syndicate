import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('Communication routes authenticate callers and fail safely without real providers', { timeout: 60_000 }, async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'jack-comms-test-'));
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', VERCEL: '', REPL_ID: '', REPLIT_DEPLOYMENT: '', DATABASE_URL: '', DATABASE_PATH: path.join(directory, 'test.sqlite'),
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
});
