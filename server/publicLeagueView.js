import { isWeekLocked } from '../src/data.js';

function scoreSheet(sheet, results = {}) {
  return Object.entries(sheet.picks ?? {}).reduce(
    (total, [gameId, pick]) => total + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );
}

export function withoutPushCredentials(league) {
  const { pushSubscriptions: _privatePushCredentials, ...publicSettings } = league.settings ?? {};
  return { ...league, settings: publicSettings };
}

export function buildPublicLeagueView(league) {
  return {
    ...withoutPushCredentials(league),
    sheets: (league.sheets ?? []).map(({ picks, ...sheet }) => ({
      ...sheet,
      pickCount: Object.keys(picks ?? {}).length,
      score: scoreSheet({ picks }, league.results),
    })),
  };
}

/** Viewer-aware HTTP projection. Internal services always use the full store. */
export function buildLeagueView(league, { playerId = null, isAdmin = false, locked = isWeekLocked, now = Date.now() } = {}) {
  const view = withoutPushCredentials(league);
  if (isAdmin) return view;
  const owns = (item) => Boolean(playerId) && item.playerId === playerId;
  const entryView = (entry, revealed) => {
    const { handle, paymentClaim, ...safe } = entry;
    return {
      ...safe,
      ...(owns(entry) ? { handle, paymentClaim } : {}),
      pickCount: Object.keys(entry.picks ?? {}).length,
      ...(!revealed && !owns(entry) ? { picks: {}, tiebreaker: null, picksHidden: true } : {}),
    };
  };
  const { autoPilotLog, autoPilotReminders, ...settings } = view.settings;
  if (settings.propPicks) settings.propPicks = Object.fromEntries(Object.entries(settings.propPicks).map(([week, entries]) => [week,
    Object.fromEntries(Object.entries(entries).map(([id, picks]) => [id, locked(Number(week)) || id === playerId ? picks : { savedAt: picks.savedAt }]))]));
  const recaps = (league.recaps ?? []).filter((recap) => recap.adminApproval?.status === 'approved');
  return {
    ...view,
    settings,
    players: (league.players ?? []).map((player) => {
      if (player.id === playerId) return player;
      const { phone, phoneE164, messaging, phoneVerifiedAt, payment, ...profile } = player;
      return profile;
    }),
    sheets: (league.sheets ?? []).map((sheet) => entryView(sheet, locked(sheet.week))),
    cfbPools: (league.cfbPools ?? []).map((pool) => {
      const revealed = pool.status !== 'open' || (pool.games ?? []).some((game) => Number.isFinite(Date.parse(game.date)) && Date.parse(game.date) <= now);
      return { ...pool, entries: Object.fromEntries(Object.entries(pool.entries ?? {}).map(([id, entry]) => [id, entryView(entry, revealed)])) };
    }),
    survivorPicks: (league.survivorPicks ?? []).map((pick) => locked(pick.week) || owns(pick) ? pick : { playerId: pick.playerId, week: pick.week, pickedAt: pick.pickedAt, team: null }),
    creditLedger: (league.creditLedger ?? []).filter(owns),
    sideBets: (league.sideBets ?? []).filter((bet) => playerId && [bet.creatorId, bet.opponentId].includes(playerId)),
    auditLog: [], consentRecords: [], broadcasts: [], latestBroadcast: null,
    recaps, latestRecap: recaps[0] ?? null,
  };
}
