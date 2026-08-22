import test from 'node:test';
import assert from 'node:assert/strict';
import { createScoreProvider, normalizeWeekScores, scoreFeedSummary } from './scoreService.js';

test('score provider stays in explicit fallback mode without a key', async () => {
  const provider = createScoreProvider({ SCORES_PROVIDER: 'demo' });
  assert.equal(provider.configured, false);
  assert.deepEqual(await provider.getWeekScores({ season: 2026, week: 1 }), []);
});

test('SportsDataIO score payloads normalize to schedule IDs and verified finals', () => {
  const [snapshot] = normalizeWeekScores({
    season: 2026,
    week: 1,
    syncedAt: '2026-09-10T03:30:00.000Z',
    providerScores: [{ GameKey: '202610110', AwayTeam: 'NE', HomeTeam: 'SEA', AwayScore: 20, HomeScore: 27, Status: 'Final', Quarter: 'F', IsOver: true }],
  });
  assert.equal(snapshot.gameId, 'w1-1');
  assert.equal(snapshot.status, 'final');
  assert.equal(snapshot.winner, 'SEA');
  assert.equal(snapshot.verifiedBy, 'sportsdataio');
});

test('scheduled games with null provider scores do not appear as zero to zero', () => {
  const [snapshot] = normalizeWeekScores({
    season: 2026,
    week: 1,
    providerScores: [{ AwayTeam: 'NE', HomeTeam: 'SEA', AwayScore: null, HomeScore: null, Status: 'Scheduled' }],
  });
  assert.equal(snapshot.status, 'scheduled');
  assert.equal(snapshot.awayScore, null);
  assert.equal(snapshot.homeScore, null);
});

test('SportsDataIO normalizes an active game and keeps the key in a request header', async () => {
  let request;
  const provider = createScoreProvider(
    { SCORES_PROVIDER: 'sportsdataio', SPORTSDATAIO_API_KEY: 'server-secret' },
    { fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, async json() { return [{ GameKey: '202610110', AwayTeam: 'NE', HomeTeam: 'SEA', AwayScore: 17, HomeScore: 20, Status: 'InProgress', IsInProgress: true, Quarter: '3', TimeRemaining: '07:14' }]; } };
    } },
  );
  const [snapshot] = normalizeWeekScores({ season: 2026, week: 1, providerScores: await provider.getWeekScores({ season: 2026, week: 1 }) });
  assert.match(request.url, /ScoresByWeek\/2026\/1$/);
  assert.equal(request.url.includes('server-secret'), false);
  assert.equal(request.options.headers['Ocp-Apim-Subscription-Key'], 'server-secret');
  assert.equal(snapshot.status, 'in_progress');
  assert.equal(snapshot.quarter, '3');
  assert.equal(snapshot.clock, '07:14');
});

test('API-Sports uses a server header and normalizes a live NFL game', async () => {
  let request;
  const provider = createScoreProvider(
    { SCORES_PROVIDER: 'api_sports', API_SPORTS_KEY: 'free-server-secret' },
    { fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            errors: [],
            response: [{
              game: { id: 17377, week: 'Week 1', status: { short: 'Q3', long: 'Third Quarter', timer: '07:14' } },
              teams: { away: { name: 'New England Patriots' }, home: { name: 'Seattle Seahawks' } },
              scores: { away: { total: 17 }, home: { total: 20 } },
            }],
          };
        },
      };
    } },
  );
  const [snapshot] = normalizeWeekScores({
    season: 2026,
    week: 1,
    provider: provider.kind,
    providerScores: await provider.getWeekScores({ season: 2026, week: 1 }),
  });
  assert.match(request.url, /games\?league=1&season=2026$/);
  assert.equal(request.url.includes('free-server-secret'), false);
  assert.equal(request.options.headers['x-apisports-key'], 'free-server-secret');
  assert.equal(snapshot.gameId, 'w1-1');
  assert.equal(snapshot.status, 'in_progress');
  assert.equal(snapshot.quarter, 'Q3');
  assert.equal(snapshot.clock, '07:14');
});

test('API-Sports verifies final winners and ignores other weeks', () => {
  const snapshots = normalizeWeekScores({
    season: 2026,
    week: 1,
    provider: 'api_sports',
    syncedAt: '2026-09-10T03:30:00.000Z',
    providerScores: [
      { game: { id: 17377, week: 'Week 1', status: { short: 'FT' } }, teams: { away: { name: 'New England Patriots' }, home: { name: 'Seattle Seahawks' } }, scores: { away: { total: 20 }, home: { total: 27 } } },
      { game: { id: 17378, week: 'Week 2', status: { short: 'FT' } }, teams: { away: { name: 'New England Patriots' }, home: { name: 'Seattle Seahawks' } }, scores: { away: { total: 40 }, home: { total: 3 } } },
    ],
  });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].winner, 'SEA');
  assert.equal(snapshots[0].verifiedBy, 'api_sports');
});

test('ESPN public scoreboard maps current-season games without exposing a key', async () => {
  let request;
  const provider = createScoreProvider(
    { SCORES_PROVIDER: 'espn' },
    { fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { news: { articles: [{ id: 'news-1', headline: 'Seahawks receiver questionable with ankle injury', description: 'Seattle listed the receiver as questionable.', published: '2026-09-09T18:00:00Z', lastModified: '2026-09-09T18:05:00Z', links: { web: { href: 'https://www.espn.com/nfl/story/_/id/12345/seahawks-injury' } }, categories: [{ description: 'Seattle Seahawks' }, { description: 'NFL' }] }] }, content: { sbData: { events: [{
            id: '401872656',
            status: { period: 3, displayClock: '07:14', type: { state: 'in', completed: false, shortDetail: 'Q3 - 07:14' } },
            competitions: [{ competitors: [
              { homeAway: 'home', score: '20', team: { abbreviation: 'SEA', displayName: 'Seattle Seahawks' } },
              { homeAway: 'away', score: '17', team: { abbreviation: 'NE', displayName: 'New England Patriots' } },
            ] }],
          }] } } };
        },
      };
    } },
  );
  const providerScores = await provider.getWeekScores({ season: 2026, week: 1 });
  const [snapshot] = normalizeWeekScores({ season: 2026, week: 1, provider: provider.kind, providerScores });
  assert.match(request.url, /cdn\.espn\.com\/core\/nfl\/scoreboard/);
  assert.equal(request.url.toLowerCase().includes('key='), false);
  assert.equal(snapshot.gameId, 'w1-1');
  assert.equal(snapshot.status, 'in_progress');
  assert.equal(snapshot.quarter, 'Q3');
  assert.equal(snapshot.clock, '07:14');
  assert.equal(snapshot.awayScore, 17);
  assert.equal(snapshot.homeScore, 20);
  assert.equal(providerScores.news.length, 1);
  assert.equal(providerScores.news[0].isInjury, true);
  assert.deepEqual(providerScores.news[0].teams, ['SEA']);
  assert.equal(providerScores.news[0].source, 'ESPN');
});

test('ESPN scheduled games do not display fake zero scores', () => {
  const [snapshot] = normalizeWeekScores({
    season: 2026,
    week: 1,
    provider: 'espn',
    providerScores: [{ id: '401872656', status: { period: 0, displayClock: '0:00', type: { state: 'pre', completed: false } }, competitions: [{ competitors: [{ homeAway: 'home', score: '0', team: { abbreviation: 'SEA' } }, { homeAway: 'away', score: '0', team: { abbreviation: 'NE' } }] }] }],
  });
  assert.equal(snapshot.status, 'scheduled');
  assert.equal(snapshot.awayScore, null);
  assert.equal(snapshot.homeScore, null);
});

test('score feed refreshes faster during games and slows safely during fallbacks', () => {
  assert.deepEqual(scoreFeedSummary({ configured: true, sync: { status: 'success' }, games: [{ status: 'in_progress' }] }), { feedState: 'live', refreshAfterSeconds: 30 });
  assert.deepEqual(scoreFeedSummary({ configured: true, sync: { status: 'error' }, games: [{ status: 'in_progress' }] }), { feedState: 'delayed', refreshAfterSeconds: 120 });
  assert.deepEqual(scoreFeedSummary({ configured: false, sync: null, games: [] }), { feedState: 'fallback', refreshAfterSeconds: 300 });
});

test('API-Sports free-plan polling stays within the shared quota policy', () => {
  const provider = createScoreProvider({ SCORES_PROVIDER: 'api_sports', API_SPORTS_KEY: 'free-server-secret' });
  assert.deepEqual(
    scoreFeedSummary({ configured: true, sync: { status: 'success' }, games: [{ status: 'in_progress' }], provider }),
    { feedState: 'live', refreshAfterSeconds: 600 },
  );
  assert.deepEqual(
    scoreFeedSummary({ configured: true, sync: { status: 'success' }, games: [{ status: 'scheduled' }], provider }),
    { feedState: 'scheduled', refreshAfterSeconds: 1800 },
  );
});

test('ESPN polling uses a bandwidth-conscious shared cache', () => {
  const provider = createScoreProvider({ SCORES_PROVIDER: 'espn' });
  assert.deepEqual(scoreFeedSummary({ configured: true, sync: { status: 'success' }, games: [{ status: 'in_progress' }], provider }), { feedState: 'live', refreshAfterSeconds: 120 });
  assert.deepEqual(scoreFeedSummary({ configured: true, sync: { status: 'success' }, games: [{ status: 'scheduled' }], provider }), { feedState: 'scheduled', refreshAfterSeconds: 900 });
});

test('SportsDataIO authentication failures use a safe actionable message', async () => {
  const provider = createScoreProvider(
    { SCORES_PROVIDER: 'sportsdataio', SPORTSDATAIO_API_KEY: 'server-secret' },
    { fetchImpl: async () => ({ ok: false, status: 403 }) },
  );
  await assert.rejects(
    provider.getWeekScores({ season: 2026, week: 1 }),
    (error) => error.code === 'score_provider_auth_failed' && !error.message.includes('server-secret'),
  );
});
