import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeagueLoader, bindLeagueResume } from './leagueRefresh.js';

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
  assert.equal(options.cache, 'no-store');
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
