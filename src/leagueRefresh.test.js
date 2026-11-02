import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeagueLoader, bindLeagueResume, bindLeaguePulse } from './leagueRefresh.js';

const snapshot = (id) => ({ id, players: [], sheets: [], results: {}, chat: [] });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(request, extra = {}) {
  const state = { snapshot: null, status: null };
  const loader = createLeagueLoader({ request, onSnapshot: value => { state.snapshot = value; }, onStatus: value => { state.status = value; }, timeoutMs: 20, ...extra });
  return { state, ...loader };
}

test('hung initial read times out, aborts and permits manual retry recovery', async () => {
  let options;
  let fail = true;
  const loader = harness(value => { options = value; return fail ? new Promise(() => {}) : snapshot('recovered'); });
  assert.equal(await loader.load(), null);
  assert.equal(options.signal.aborted, true);
  assert.equal(options.cache, 'no-cache');
  assert.equal(loader.state.snapshot, null);
  assert.match(loader.state.status.error, /timed out/);
  assert.equal(loader.state.status.loading, false);
  fail = false;
  await loader.load();
  assert.equal(loader.state.snapshot.id, 'recovered');
  assert.equal(loader.state.status.error, '');
});
test('network failure and invalid responses do not create demo data or replace a usable snapshot', async () => {
  let value = snapshot('real');
  const loader = harness(() => { if (value instanceof Error) throw value; return value; }, { now: () => 1234 });
  await loader.load();
  for (value of [new Error('Offline'), {}, { sheets: [], results: {}, chat: 'bad' }]) {
    await loader.load();
    assert.equal(loader.state.snapshot.id, 'real');
    assert.equal(loader.state.status.lastSuccessAt, 1234);
    assert.ok(loader.state.status.error);
  }
});
test('late older successes and failures cannot overwrite the latest retry', async () => {
  for (const late of ['success', 'failure']) {
    const old = deferred();
    let count = 0;
    const loader = harness(() => ++count === 1 ? old.promise : snapshot('new'));
    const first = loader.load();
    await Promise.resolve();
    await loader.load();
    if (late === 'success') old.resolve(snapshot('old')); else old.reject(new Error('old failure'));
    await first;
    assert.equal(loader.state.snapshot.id, 'new');
    assert.equal(loader.state.status.error, '');
  }
});
test('unmount cancels a pending read without applying its eventual result', async () => {
  const pending = deferred();
  const loader = harness(() => pending.promise);
  const load = loader.load();
  loader.dispose();
  pending.resolve(snapshot('late'));
  await load;
  assert.equal(loader.state.snapshot, null);
});
test('returning to the app refreshes once, reconnect refreshes, hidden tabs wait and cleanup removes listeners', () => {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.hidden = false;
  let at = 0, count = 0;
  const cleanup = bindLeagueResume({ load: () => { count++; }, windowTarget: win, documentTarget: doc, now: () => at });
  win.dispatchEvent(new Event('focus'));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(count, 1);
  at = 2000;
  doc.hidden = true;
  win.dispatchEvent(new Event('online'));
  assert.equal(count, 1);
  doc.hidden = false;
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(count, 2);
  win.dispatchEvent(new Event('online'));
  assert.equal(count, 3);
  cleanup();
  at += 2000;
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('online'));
  assert.equal(count, 3);
});

function pulseHarness({ versions, known, fallbackMs = 300_000 }) {
  let tick = null;
  let clock = 0;
  const calls = { pulse: 0, load: 0, cleared: false };
  let current = known;
  const unbind = bindLeaguePulse({
    fetchPulse: async () => { calls.pulse += 1; const v = versions.shift(); if (v instanceof Error) throw v; return { version: v }; },
    load: async () => { calls.load += 1; current = known = versions.at(-1) ?? current; },
    getVersion: () => current,
    intervalMs: 1000,
    fallbackMs,
    documentTarget: { hidden: false },
    now: () => clock,
    setIntervalFn: (fn) => { tick = fn; return 1; },
    clearIntervalFn: () => { calls.cleared = true; },
  });
  return { calls, unbind, tick: async (advance = 1000) => { clock += advance; await tick(); }, setVersion: (v) => { current = v; }, doc: null };
}

test('pulse only reloads the league when the version moves', async () => {
  const h = pulseHarness({ versions: [5, 5, 6, 6], known: 5 });
  await h.tick(); await h.tick();
  assert.equal(h.calls.pulse, 2);
  assert.equal(h.calls.load, 0, 'unchanged version must not fetch the league');
  h.setVersion(5);
  await h.tick();
  assert.equal(h.calls.load, 1, 'a new version fetches the league once');
  h.setVersion(6);
  await h.tick();
  assert.equal(h.calls.load, 1, 'and not again once the client caught up');
  h.unbind();
  assert.equal(h.calls.cleared, true);
});

test('pulse falls back to a full reload when the snapshot gets old, and survives a failed heartbeat', async () => {
  const h = pulseHarness({ versions: [new Error('offline'), 1, 1, 1], known: 1, fallbackMs: 2500 });
  await h.tick();
  assert.equal(h.calls.load, 0, 'a failed heartbeat is not a reload');
  await h.tick(); await h.tick();
  assert.equal(h.calls.load, 1, 'the fallback reload fires once the snapshot is older than fallbackMs');
  await h.tick();
  assert.equal(h.calls.load, 1);
});

test('pulse stays quiet while the tab is hidden', async () => {
  let tick;
  let pulses = 0;
  const doc = { hidden: true };
  bindLeaguePulse({ fetchPulse: async () => { pulses += 1; return { version: 1 }; }, load: async () => {}, getVersion: () => 0, documentTarget: doc, setIntervalFn: (fn) => { tick = fn; return 1; }, clearIntervalFn: () => {} });
  await tick();
  assert.equal(pulses, 0);
  doc.hidden = false;
  await tick();
  assert.equal(pulses, 1);
});
