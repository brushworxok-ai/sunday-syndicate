import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeagueLoader, bindLeagueResume, bindLeaguePulse, readCachedSnapshot, writeCachedSnapshot, clearCachedSnapshot } from './leagueRefresh.js';

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

test('background refresh joins a slow initial read without aborting it', async () => {
  const pending = deferred(); let calls = 0; let signal;
  const h = harness(options => { calls++; signal = options.signal; return pending.promise; }, { timeoutMs: 1000 });
  const first = h.load(); await Promise.resolve();
  const background = h.load({ reuseInFlight: true });
  assert.equal(background, first); assert.equal(calls, 1); assert.equal(signal.aborted, false);
  pending.resolve(snapshot('initial')); await background;
  assert.equal(h.state.snapshot.id, 'initial');
});
test('repeated background events do not extend the pending timeout', async () => {
  let calls = 0;
  const h = harness(() => { calls++; return new Promise(() => {}); });
  const first = h.load();
  const timer = setInterval(() => { assert.equal(h.load({ reuseInFlight: true }), first); }, 2);
  try { assert.equal(await first, null); } finally { clearInterval(timer); }
  assert.equal(calls, 1); assert.match(h.state.status.error, /timed out/);
});
test('explicit read supersedes pending background work and background retry recovers', async () => {
  const old = deferred(); let calls = 0;
  const h = harness(() => { calls++; return calls === 1 ? old.promise : snapshot('new'); });
  const first = h.load({ reuseInFlight: true }); await Promise.resolve();
  const next = h.load(); assert.notEqual(next, first); await next; await first;
  old.resolve(snapshot('old')); await Promise.resolve();
  assert.equal(h.state.snapshot.id, 'new');
  await h.load({ reuseInFlight: true }); assert.equal(calls, 3);
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map };
}

test('retired snapshot cache never returns or stores commissioner, player, or anonymous data', () => {
  for (const viewerId of [null, 'p1']) {
    const storage = memoryStorage();
    const league = { ...snapshot('real'), viewerId, players: [{ id: 'p2', phone: 'dummy-private-phone' }], auditLog: [{ id: 'dummy-private-audit' }] };
    storage.setItem('league-snapshot:real', JSON.stringify({ league, savedAt: 1000 }));
    assert.equal(readCachedSnapshot(storage, 'real', { viewerId, now: () => 2000 }), null);
    assert.equal(storage.getItem('league-snapshot:real'), null, 'legacy data is purged');
    assert.equal(writeCachedSnapshot(storage, 'real', league), false);
    assert.equal(storage.getItem('league-snapshot:real'), null, 'sensitive responses are not persisted');
  }
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.equal(readCachedSnapshot(broken, 'real'), null);
  assert.equal(writeCachedSnapshot(broken, 'real', snapshot('real')), false);
  assert.equal(readCachedSnapshot(undefined, 'real'), null);
});

test('hydrate paints a cached snapshot once, dated when it was saved, and yields to the first server read', async () => {
  const seen = [];
  const statuses = [];
  const gate = deferred();
  const loader = createLeagueLoader({ request: () => gate.promise, onSnapshot: (v, meta) => seen.push([v.id, meta.source]), onStatus: (st) => statuses.push({ ...st }), timeoutMs: 5000, now: () => 9000 });
  const pending = loader.load();
  assert.equal(loader.hydrate(snapshot('cached'), 5000), true);
  assert.deepEqual(seen, [['cached', 'cache']]);
  assert.equal(statuses.at(-1).lastSuccessAt, 5000, 'the pill shows the cache age, not now');
  assert.equal(statuses.at(-1).loading, true, 'hydrating does not hide that a real read is in flight');
  gate.resolve(snapshot('server'));
  await pending;
  assert.deepEqual(seen, [['cached', 'cache'], ['server', 'server']]);
  assert.equal(statuses.at(-1).lastSuccessAt, 9000);
  assert.equal(loader.hydrate(snapshot('late-cache'), 1), false, 'a cache never overwrites a real snapshot');
  assert.equal(seen.length, 2);
  assert.equal(loader.hydrate({ junk: true }, 1), false);
});
