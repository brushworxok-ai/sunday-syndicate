import { buildJackUpdate, buildWinningPaths, isJackPostingWindow } from '../src/winningPaths.js';

const defaultLiveDeskSettings = {
  enabled: true,
  automaticPosts: true,
  repeatAfterHours: 20,
  privacyMode: 'score_gaps_only',
};

function settingsFor(league) {
  return { ...defaultLiveDeskSettings, ...(league?.settings?.jack?.liveDesk ?? {}) };
}

function savedUpdates(league, season, week) {
  return (league?.settings?.jackLiveUpdates ?? [])
    .filter((update) => Number(update.season) === Number(season) && Number(update.week) === Number(week))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
}

export async function getJackLiveDesk({ store, leagueId, season, week, games, feedState = 'scheduled' }) {
  const league = await store.getLeague(leagueId);
  if (!league) { const error = new Error('League not found.'); error.status = 404; throw error; }
  const snapshot = buildWinningPaths(league, { season, week, games });
  const updates = savedUpdates(league, season, week).slice(0, 12);
  return {
    enabled: settingsFor(league).enabled,
    automaticPosts: settingsFor(league).automaticPosts,
    feedState,
    current: snapshot,
    latestUpdate: updates[0] ?? null,
    updates,
  };
}

export async function publishJackLiveUpdate({
  store,
  leagueId,
  season,
  week,
  games,
  feedState = 'scheduled',
  trigger = 'score_change',
  force = false,
  now = new Date(),
} = {}) {
  const league = await store.getLeague(leagueId);
  if (!league) { const error = new Error('League not found.'); error.status = 404; throw error; }
  const config = settingsFor(league);
  const snapshot = buildWinningPaths(league, { season, week, games });
  const updates = savedUpdates(league, season, week);
  const desk = { enabled: config.enabled, automaticPosts: config.automaticPosts, feedState, current: snapshot, latestUpdate: updates[0] ?? null, updates: updates.slice(0, 12) };

  if (!snapshot.paths.length) return { ...desk, publication: { status: 'skipped', reason: 'no_entries' } };
  if (!force && (!config.enabled || !config.automaticPosts)) return { ...desk, publication: { status: 'skipped', reason: 'disabled' } };
  if (!force && !isJackPostingWindow({ games, snapshot, now })) return { ...desk, publication: { status: 'skipped', reason: 'outside_week_window' } };

  const latest = updates[0];
  const repeatAfterMs = Number(config.repeatAfterHours || defaultLiveDeskSettings.repeatAfterHours) * 60 * 60 * 1000;
  const elapsed = latest ? new Date(now).getTime() - new Date(latest.createdAt).getTime() : Infinity;
  const sameState = latest?.stateKey === snapshot.stateKey;
  if (!force && sameState && (snapshot.allFinal || elapsed < repeatAfterMs)) {
    return { ...desk, publication: { status: 'deduplicated', reason: snapshot.allFinal ? 'final_already_posted' : 'no_material_change' } };
  }

  const update = buildJackUpdate(snapshot, { createdAt: new Date(now).toISOString(), trigger, feedState });
  const saved = await store.saveJackLiveUpdate(leagueId, update, { allowRepeat: force, repeatAfterHours: config.repeatAfterHours });
  const refreshed = await store.getLeague(leagueId);
  const refreshedUpdates = savedUpdates(refreshed, season, week).slice(0, 12);
  return {
    enabled: config.enabled,
    automaticPosts: config.automaticPosts,
    feedState,
    current: snapshot,
    latestUpdate: refreshedUpdates[0] ?? update,
    updates: refreshedUpdates,
    publication: { status: saved?.created === false ? 'deduplicated' : 'posted', updateId: (saved?.update ?? update).id },
  };
}
