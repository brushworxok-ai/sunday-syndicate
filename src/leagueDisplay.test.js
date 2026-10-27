import { createLeagueLoader } from './leagueRefresh.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const homeGate = source.match(/\{(view === 'home' && serverLeague) && \(/)?.[1];
const homeVisible = new Function('view', 'serverLeague', `return Boolean(${homeGate})`);
// Exercise the shared loader with a mocked transport: never contact the league API.
function harness(request, initial = null) {
  const state = { league: initial, sheets: initial?.sheets ?? [], results: initial?.results ?? {}, error: '' };
  const loader = createLeagueLoader({ request,
    onSnapshot: (league) => { state.league = league; state.sheets = league.sheets; state.results = league.results; },
    onStatus: (status) => { state.error = status.error; },
  });
  const load = () => loader.load();
  return { state, load };
}

test('initial league display has no sample picks or completed results', () => {
  assert.match(source, /\[sheets, setSheets\] = useState\(\[\]\)/);
  assert.match(source, /\[results, setResults\] = useState\(\{\}\)/);
  assert.equal(homeVisible('home', null), false);
  assert.match(source, /Loading league information/);
  assert.match(source, /League information unavailable/);
});
test('successful load displays the returned league snapshot', async () => {
  const league = { id: 'mock', players: [], sheets: [{ id: 'real-entry' }], results: { game: { winner: 'DAL' } }, chat: [] };
  const { state, load } = harness(async () => league);
  await load();
  assert.equal(state.league, league);
  assert.equal(state.sheets, league.sheets);
  assert.equal(state.results, league.results);
  assert.equal(homeVisible('home', state.league), true);
});
for (const message of ['Server unavailable', 'Failed to fetch']) {
  test(`initial failure (${message}) does not fabricate standings`, async () => {
    const { state, load } = harness(async () => { throw new Error(message); });
    await load();
    assert.equal(state.league, null);
    assert.deepEqual(state.sheets, []);
    assert.deepEqual(state.results, {});
    assert.equal(state.error, message);
    assert.equal(homeVisible('home', state.league), false);
  });
}
test('refresh failure preserves previously loaded real picks and results', async () => {
  const league = { id: 'mock', players: [], sheets: [{ id: 'saved' }], results: { saved: { winner: 'PHI' } } };
  const { state, load } = harness(async () => { throw new Error('Offline'); }, league);
  await load();
  assert.equal(state.league, league);
  assert.equal(state.sheets, league.sheets);
  assert.equal(state.results, league.results);
  assert.equal(state.error, 'Offline');
  assert.equal(homeVisible('home', state.league), true);
});

test('a successful empty snapshot displays legitimate zeros on Home', async () => {
  const league = { id: 'mock', players: [], sheets: [], results: {}, chat: [] };
  const { state, load } = harness(async () => league);
  await load();
  assert.equal(homeVisible('home', state.league), true);
  assert.equal(state.sheets.length, 0);
  assert.deepEqual(state.results, {});
});
