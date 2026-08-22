import test from 'node:test';
import assert from 'node:assert/strict';
import { publishJackLiveUpdate } from './jackLiveService.js';

const games = [
  { id: 'one', away: 'A', home: 'B', kickoff: '2026-09-10T00:00:00Z' },
  { id: 'two', away: 'C', home: 'D', kickoff: '2026-09-13T00:00:00Z' },
];

function fakeStore() {
  const state = {
    id: 'league', season: 2026, week: 1,
    settings: { jack: { liveDesk: { enabled: true, automaticPosts: true, repeatAfterHours: 20 } }, jackLiveUpdates: [] },
    sheets: [
      { id: 'a', playerId: 'a', name: 'Alex', season: 2026, week: 1, picks: { one: 'A', two: 'C' } },
      { id: 'b', playerId: 'b', name: 'Blair', season: 2026, week: 1, picks: { one: 'B', two: 'D' } },
    ],
    results: {}, chat: [], auditLog: [],
  };
  return {
    state,
    async getLeague() { return structuredClone(state); },
    async saveJackLiveUpdate(_leagueId, update) {
      state.settings.jackLiveUpdates.unshift(structuredClone(update));
      state.chat.push({ id: `chat-${update.id}`, name: 'Jack · Path Desk', msg: update.publicText, time: update.createdAt });
      return { update, created: true };
    },
  };
}

test('Jack posts once, deduplicates unchanged standings, and posts again after a verified change', async () => {
  const store = fakeStore();
  const first = await publishJackLiveUpdate({ store, leagueId: 'league', season: 2026, week: 1, games, force: true, now: new Date('2026-09-09T16:00:00Z') });
  assert.equal(first.publication.status, 'posted');
  assert.equal(store.state.chat.length, 1);
  const duplicate = await publishJackLiveUpdate({ store, leagueId: 'league', season: 2026, week: 1, games, now: new Date('2026-09-09T17:00:00Z') });
  assert.equal(duplicate.publication.status, 'deduplicated');
  assert.equal(store.state.chat.length, 1);
  store.state.results.one = { winner: 'A', status: 'final', verifiedAt: '2026-09-10T03:00:00Z' };
  const changed = await publishJackLiveUpdate({ store, leagueId: 'league', season: 2026, week: 1, games, feedState: 'live', now: new Date('2026-09-10T03:01:00Z') });
  assert.equal(changed.publication.status, 'posted');
  assert.equal(store.state.chat.length, 2);
  assert.match(store.state.chat[1].msg, /Alex:/);
  assert.match(store.state.chat[1].msg, /Blair:/);
  assert.match(store.state.chat[1].msg, /Hidden picks stay hidden/);
});
