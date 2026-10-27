import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
// Exercise the actual callback with a mocked transport: never contact the league API.
function harness(request, initial = null) {
  const state = { league: initial, sheets: initial?.sheets ?? [], results: initial?.results ?? {}, error: '' };
  const callback = source.match(/const loadLeague = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/)[1];
  const load = new Function('apiRequest', 'leagueRequestRef', 'LEAGUE_ID', 'setServerLeague', 'setSheets', 'setResults', 'setChatMsgs', 'setAiResult', 'setRecapEdit', 'setServerError', `return async () => {${callback}}`)(request, { current: 0 }, 'mock', value => state.league = value, value => state.sheets = value, value => state.results = value, () => {}, () => {}, () => {}, value => state.error = value);
  return { state, load };
}

test('initial league display has no sample picks or completed results', () => {
  assert.match(source, /\[sheets, setSheets\] = useState\(\[\]\)/);
  assert.match(source, /\[results, setResults\] = useState\(\{\}\)/);
});
test('successful load displays the returned league snapshot', async () => {
  const league = { sheets: [{ id: 'real-entry' }], results: { game: { winner: 'DAL' } }, chat: [] };
  const { state, load } = harness(async () => league);
  await load();
  assert.equal(state.league, league);
  assert.equal(state.sheets, league.sheets);
  assert.equal(state.results, league.results);
});
for (const message of ['Server unavailable', 'Failed to fetch']) {
  test(`initial failure (${message}) does not fabricate standings`, async () => {
    const { state, load } = harness(async () => { throw new Error(message); });
    await load();
    assert.equal(state.league, null);
    assert.deepEqual(state.sheets, []);
    assert.deepEqual(state.results, {});
    assert.equal(state.error, message);
  });
}
test('refresh failure preserves previously loaded real picks and results', async () => {
  const league = { sheets: [{ id: 'saved' }], results: { saved: { winner: 'PHI' } } };
  const { state, load } = harness(async () => { throw new Error('Offline'); }, league);
  await load();
  assert.equal(state.league, league);
  assert.equal(state.sheets, league.sheets);
  assert.equal(state.results, league.results);
  assert.equal(state.error, 'Offline');
});
