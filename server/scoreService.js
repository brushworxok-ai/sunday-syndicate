import { getGamesForWeek, TEAMS } from '../src/data.js';

const normalizeTeam = (team) => ({ JAC: 'JAX', LA: 'LAR', WSH: 'WAS' }[team] ?? team);
const isFinalStatus = (score) => Boolean(score.IsOver) || ['Final', 'F', 'F/OT'].includes(score.Status) || ['F', 'F/OT'].includes(score.Quarter);
const isLiveStatus = (score) => !isFinalStatus(score) && (Boolean(score.IsInProgress) || Boolean(score.HasStarted) || ['InProgress', 'In Progress', 'Live'].includes(score.Status));
const numericScore = (value) => value === null || value === undefined || value === '' ? null : Number(value);
const normalizeName = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const TEAM_CODE_BY_NAME = new Map(Object.entries(TEAMS).map(([code, name]) => [normalizeName(name), code]));
const apiSportsTeamCode = (team = {}) => {
  const suppliedCode = normalizeTeam(String(team.code ?? '').toUpperCase());
  if (TEAMS[suppliedCode]) return suppliedCode;
  return TEAM_CODE_BY_NAME.get(normalizeName(team.name)) ?? null;
};
const API_SPORTS_FINAL = new Set(['FT', 'AOT']);
const API_SPORTS_LIVE = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'HT', 'OT', 'BT']);
const INJURY_NEWS_PATTERN = /\b(injur(?:y|ed|ies)|acl|mcl|concussion|hamstring|ankle|knee|shoulder|reserve|questionable|doubtful|out for (?:the )?season|will not return)\b/i;

export function normalizeEspnNews(articles = [], syncedAt = new Date().toISOString()) {
  const seen = new Set();
  return articles.flatMap((article) => {
    const headline = String(article?.headline ?? article?.title ?? '').trim().slice(0, 180);
    const url = String(article?.links?.web?.href ?? article?.link ?? '').trim();
    if (!headline || seen.has(headline.toLowerCase()) || !/^https:\/\/(?:www\.)?espn\.com\//i.test(url)) return [];
    seen.add(headline.toLowerCase());
    const categories = (article.categories ?? []).map((category) => String(category?.description ?? category?.type ?? category ?? '').trim()).filter(Boolean).slice(0, 12);
    const teams = [...new Set(categories.map((category) => TEAM_CODE_BY_NAME.get(normalizeName(category))).filter(Boolean))];
    const description = String(article?.description ?? article?.story ?? '').replace(/\s+/g, ' ').trim().slice(0, 320);
    return [{
      id: String(article.id ?? article.dataSourceIdentifier ?? `${headline}-${article.published ?? syncedAt}`).slice(0, 120),
      headline,
      description,
      publishedAt: String(article.published ?? article.lastModified ?? syncedAt),
      updatedAt: String(article.lastModified ?? article.published ?? syncedAt),
      url,
      teams,
      isInjury: INJURY_NEWS_PATTERN.test(`${headline} ${description}`),
      source: 'ESPN',
    }];
  }).sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt))).slice(0, 12);
}

function providerPolicy(kind) {
  if (kind === 'api_sports') return { liveRefreshSeconds: 600, scheduledRefreshSeconds: 1800, finalRefreshSeconds: 1800, delayedRefreshSeconds: 600 };
  if (kind === 'espn') return { liveRefreshSeconds: 120, scheduledRefreshSeconds: 900, finalRefreshSeconds: 1800, delayedRefreshSeconds: 300 };
  return { liveRefreshSeconds: 30, scheduledRefreshSeconds: 60, finalRefreshSeconds: 300, delayedRefreshSeconds: 120 };
}

export class ScoreSyncError extends Error {
  constructor(message, status = 502, code = 'score_sync_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createScoreProvider(env = process.env, { fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  if (env.SCORES_PROVIDER === 'sportsdataio' && env.SPORTSDATAIO_API_KEY) return {
    kind: 'sportsdataio',
    configured: true,
    ...providerPolicy('sportsdataio'),
    async getWeekScores({ season, week }) {
      const url = `https://api.sportsdata.io/v3/nfl/scores/json/ScoresByWeek/${encodeURIComponent(season)}/${encodeURIComponent(week)}`;
      const response = await fetchImpl(url, { headers: { 'Ocp-Apim-Subscription-Key': env.SPORTSDATAIO_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if ([401, 403].includes(response.status)) throw new ScoreSyncError('Live-score access was rejected. Check the server key and NFL Scores subscription.', 502, 'score_provider_auth_failed');
      if (response.status === 429) throw new ScoreSyncError('Live-score refresh limit reached. The last saved scores remain available.', 503, 'score_provider_rate_limited');
      if (!response.ok) throw new ScoreSyncError(`Live-score provider is temporarily unavailable (${response.status}).`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new ScoreSyncError('Live-score provider returned an invalid payload.');
      return payload;
    },
  };
  if (env.SCORES_PROVIDER === 'api_sports' && env.API_SPORTS_KEY) return {
    kind: 'api_sports',
    configured: true,
    ...providerPolicy('api_sports'),
    async getWeekScores({ season }) {
      const url = `https://v1.american-football.api-sports.io/games?league=1&season=${encodeURIComponent(season)}`;
      const response = await fetchImpl(url, { headers: { 'x-apisports-key': env.API_SPORTS_KEY }, signal: AbortSignal.timeout(timeoutMs) });
      if ([401, 403].includes(response.status)) throw new ScoreSyncError('API-Sports rejected the live-score key. Copy a current key from Account → My Access.', 502, 'score_provider_auth_failed');
      if (response.status === 429) throw new ScoreSyncError('The free live-score quota is resting. Saved scores remain visible until the quota resets.', 503, 'score_provider_rate_limited');
      if (!response.ok) throw new ScoreSyncError(`API-Sports is temporarily unavailable (${response.status}).`);
      const payload = await response.json();
      const errors = payload?.errors;
      if (errors && (Array.isArray(errors) ? errors.length : Object.keys(errors).length)) throw new ScoreSyncError('API-Sports returned an account or request error. Check the free-plan dashboard.', 502, 'score_provider_response_error');
      if (!Array.isArray(payload?.response)) throw new ScoreSyncError('API-Sports returned an invalid score payload.');
      return payload.response;
    },
  };
  if (env.SCORES_PROVIDER === 'espn') return {
    kind: 'espn',
    configured: true,
    ...providerPolicy('espn'),
    async getWeekScores({ season, week }) {
      const url = `https://cdn.espn.com/core/nfl/scoreboard?xhr=1&dates=${encodeURIComponent(season)}&seasontype=2&week=${encodeURIComponent(week)}&limit=100`;
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'User-Agent': '405-Badguys-Parlay/1.0' }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.status === 429) throw new ScoreSyncError('The public scoreboard is temporarily limiting refreshes. Saved scores remain visible.', 503, 'score_provider_rate_limited');
      if (!response.ok) throw new ScoreSyncError(`The public scoreboard is temporarily unavailable (${response.status}).`);
      const payload = await response.json();
      const events = payload?.content?.sbData?.events;
      if (!Array.isArray(events)) throw new ScoreSyncError('The public scoreboard returned an unexpected response. Saved scores remain visible.');
      events.news = normalizeEspnNews(payload?.news?.articles ?? []);
      return events;
    },
  };
  return { kind: 'demo', configured: false, ...providerPolicy('demo'), async getWeekScores() { return []; } };
}

export function normalizeWeekScores({ season, week, providerScores, provider = 'sportsdataio', syncedAt = new Date().toISOString() }) {
  const games = getGamesForWeek(season, week);
  if (provider === 'espn') return providerScores.flatMap((event) => {
    const competition = event.competitions?.[0];
    const competitors = competition?.competitors ?? [];
    const awayTeam = competitors.find((team) => team.homeAway === 'away');
    const homeTeam = competitors.find((team) => team.homeAway === 'home');
    const away = normalizeTeam(String(awayTeam?.team?.abbreviation ?? '').toUpperCase());
    const home = normalizeTeam(String(homeTeam?.team?.abbreviation ?? '').toUpperCase());
    const game = games.find((candidate) => candidate.away === away && candidate.home === home);
    if (!game) return [];
    const state = String(event.status?.type?.state ?? '').toLowerCase();
    const final = Boolean(event.status?.type?.completed) || state === 'post';
    const live = !final && state === 'in';
    const awayScore = live || final ? numericScore(awayTeam?.score) : null;
    const homeScore = live || final ? numericScore(homeTeam?.score) : null;
    const hasScores = Number.isFinite(awayScore) && Number.isFinite(homeScore);
    const period = Number(event.status?.period ?? 0);
    return [{
      gameId: game.id,
      season: Number(season),
      week: Number(week),
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      status: final && hasScores ? 'final' : live ? 'in_progress' : 'scheduled',
      quarter: live ? (period > 4 ? 'OT' : period > 0 ? `Q${period}` : event.status?.type?.shortDetail ?? null) : null,
      clock: live ? event.status?.displayClock ?? null : null,
      source: 'espn',
      providerGameId: String(event.id ?? ''),
      syncedAt,
      ...(final && hasScores ? {
        winner: awayScore === homeScore ? null : awayScore > homeScore ? away : home,
        verifiedAt: syncedAt,
        verifiedBy: 'espn',
      } : {}),
    }];
  });
  if (provider === 'api_sports') return providerScores.flatMap((score) => {
    const apiWeek = Number(String(score.game?.week ?? '').match(/\d+/)?.[0]);
    if (apiWeek && apiWeek !== Number(week)) return [];
    const away = apiSportsTeamCode(score.teams?.away);
    const home = apiSportsTeamCode(score.teams?.home);
    const game = games.find((candidate) => candidate.away === away && candidate.home === home);
    if (!game) return [];
    const awayScore = numericScore(score.scores?.away?.total);
    const homeScore = numericScore(score.scores?.home?.total);
    const statusCode = String(score.game?.status?.short ?? '').toUpperCase();
    const hasScores = Number.isFinite(awayScore) && Number.isFinite(homeScore);
    const final = API_SPORTS_FINAL.has(statusCode) && hasScores;
    const status = final ? 'final' : API_SPORTS_LIVE.has(statusCode) ? 'in_progress' : 'scheduled';
    return [{
      gameId: game.id,
      season: Number(season),
      week: Number(week),
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      status,
      quarter: status === 'in_progress' ? statusCode : null,
      clock: score.game?.status?.timer == null ? null : String(score.game.status.timer),
      source: 'api_sports',
      providerGameId: String(score.game?.id ?? ''),
      syncedAt,
      ...(final ? {
        winner: awayScore === homeScore ? null : awayScore > homeScore ? away : home,
        verifiedAt: syncedAt,
        verifiedBy: 'api_sports',
      } : {}),
    }];
  });
  return providerScores.flatMap((score) => {
    const away = normalizeTeam(score.AwayTeam);
    const home = normalizeTeam(score.HomeTeam);
    const game = games.find((candidate) => candidate.away === away && candidate.home === home);
    if (!game) return [];
    const awayScore = numericScore(score.AwayScore);
    const homeScore = numericScore(score.HomeScore);
    const hasScores = Number.isFinite(awayScore) && Number.isFinite(homeScore);
    const final = isFinalStatus(score) && hasScores;
    const status = final ? 'final' : isLiveStatus(score) ? 'in_progress' : 'scheduled';
    return [{
      gameId: game.id,
      season: Number(season),
      week: Number(week),
      awayScore: Number.isFinite(awayScore) ? awayScore : null,
      homeScore: Number.isFinite(homeScore) ? homeScore : null,
      status,
      quarter: score.QuarterDescription || score.Quarter || null,
      clock: score.TimeRemaining || null,
      source: 'sportsdataio',
      providerGameId: String(score.GameKey ?? score.GlobalGameID ?? ''),
      syncedAt,
      ...(final ? {
        winner: awayScore === homeScore ? null : awayScore > homeScore ? away : home,
        verifiedAt: syncedAt,
        verifiedBy: 'sportsdataio',
      } : {}),
    }];
  });
}

export function scoreFeedSummary({ configured, sync, games, provider = {} }) {
  const defaults = providerPolicy(provider.kind);
  const policy = {
    liveRefreshSeconds: Number(provider.liveRefreshSeconds ?? defaults.liveRefreshSeconds),
    scheduledRefreshSeconds: Number(provider.scheduledRefreshSeconds ?? defaults.scheduledRefreshSeconds),
    finalRefreshSeconds: Number(provider.finalRefreshSeconds ?? defaults.finalRefreshSeconds),
    delayedRefreshSeconds: Number(provider.delayedRefreshSeconds ?? defaults.delayedRefreshSeconds),
  };
  if (!configured) return { feedState: 'fallback', refreshAfterSeconds: 300 };
  if (sync?.status === 'error') return { feedState: 'delayed', refreshAfterSeconds: policy.delayedRefreshSeconds };
  if (games.some((game) => game.status === 'in_progress')) return { feedState: 'live', refreshAfterSeconds: policy.liveRefreshSeconds };
  if (games.length && games.every((game) => game.status === 'final' || game.winner)) return { feedState: 'final', refreshAfterSeconds: policy.finalRefreshSeconds };
  if (sync?.status === 'success') return { feedState: 'scheduled', refreshAfterSeconds: policy.scheduledRefreshSeconds };
  return { feedState: 'waiting', refreshAfterSeconds: policy.scheduledRefreshSeconds };
}
