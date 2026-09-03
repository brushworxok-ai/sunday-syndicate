function scoreSheet(sheet, results = {}) {
  return Object.entries(sheet.picks ?? {}).reduce(
    (total, [gameId, pick]) => total + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );
}

const clone = (value) => (value == null ? value : structuredClone(value));

function safeSettings(settings = {}, { isAdmin, viewerPlayerId, isMember }) {
  const {
    pushSubscriptions: _pushSubscriptions,
    propPicks = {},
    propResults = {},
    autoPilotLog: _autoPilotLog,
    ...safe
  } = clone(settings);

  if (isAdmin) return clone(settings);
  if (!isMember) {
    if (safe.cashAppPool) safe.cashAppPool = { enabled: false };
    if (safe.seasonPool) {
      const { paidPlayerIds: _paidPlayerIds, ...publicSeasonPool } = safe.seasonPool;
      safe.seasonPool = publicSeasonPool;
    }
  }
  if (viewerPlayerId) {
    safe.propPicks = Object.fromEntries(Object.entries(propPicks).map(([week, entries]) => [
      week,
      entries?.[viewerPlayerId] ? { [viewerPlayerId]: entries[viewerPlayerId] } : {},
    ]));
    safe.propResults = propResults;
  }
  return safe;
}

function safePlayer(player, { isAdmin, viewerPlayerId, isMember }) {
  const isSelf = player.id === viewerPlayerId;
  const base = {
    id: player.id,
    name: player.name,
    previousRank: player.previousRank ?? null,
    avatar: player.avatar ?? null,
    trashTalk: player.trashTalk?.jackPolicy?.favoriteTeam
      ? { jackPolicy: { favoriteTeam: player.trashTalk.jackPolicy.favoriteTeam } }
      : {},
  };
  if (isMember) base.payment = player.payment ? clone(player.payment) : null;
  if (isAdmin || isSelf) {
    return {
      ...base,
      phone: player.phone ?? null,
      phoneVerifiedAt: player.phoneVerifiedAt ?? null,
      messaging: clone(player.messaging ?? {}),
      trashTalk: clone(player.trashTalk ?? { level: 'none' }),
      payment: player.payment ? clone(player.payment) : null,
    };
  }
  return base;
}

function safeSheet(sheet, league, { isAdmin, viewerPlayerId, isMember, canRevealWeek }) {
  const reveal = isAdmin || sheet.playerId === viewerPlayerId || canRevealWeek(sheet.week);
  const { paymentClaim: _paymentClaim, handle: _handle, paid, paidVia, picks, tiebreaker, ...base } = clone(sheet);
  return {
    ...base,
    ...(reveal ? { picks: picks ?? {}, tiebreaker: tiebreaker ?? null } : {}),
    pickCount: Object.keys(picks ?? {}).length,
    score: scoreSheet({ picks }, league.results),
    ...(isMember ? { paid: Boolean(paid), ...(paidVia ? { paidVia } : {}) } : {}),
    ...(isAdmin || sheet.playerId === viewerPlayerId ? { paymentClaim: sheet.paymentClaim ?? null, handle: sheet.handle ?? '' } : {}),
  };
}

function safeCfbPool(pool, { isAdmin, viewerPlayerId, isMember }) {
  const revealAll = isAdmin || pool.status !== 'open';
  const visibleEntries = Object.entries(pool.entries ?? {}).filter(([playerId]) => revealAll || playerId === viewerPlayerId);
  const entries = Object.fromEntries(visibleEntries.map(([playerId, entry]) => {
    const reveal = revealAll || playerId === viewerPlayerId;
    const { paymentClaim: _paymentClaim, paid, paidVia, picks, tiebreaker, ...base } = clone(entry);
    return [playerId, {
      ...base,
      ...(reveal ? { picks: picks ?? {}, tiebreaker: tiebreaker ?? null } : { picks: {}, tiebreaker: null }),
      pickCount: Object.keys(picks ?? {}).length,
      ...(isMember ? { paid: Boolean(paid), ...(paidVia ? { paidVia } : {}) } : {}),
      ...(isAdmin || playerId === viewerPlayerId ? { paymentClaim: entry.paymentClaim ?? null } : {}),
    }];
  }));
  return { ...clone(pool), entries };
}

/** Produce the only league representation that may cross the HTTP boundary. */
export function buildLeagueView(league, {
  isAdmin = false,
  viewerPlayerId = null,
  canRevealWeek = () => false,
} = {}) {
  const isMember = isAdmin || Boolean(viewerPlayerId);
  const sideBets = isAdmin
    ? clone(league.sideBets ?? [])
    : isMember
      ? clone((league.sideBets ?? []).filter((bet) => bet.visibility !== 'participants_only' || bet.creatorId === viewerPlayerId || bet.opponentId === viewerPlayerId))
      : [];

  return {
    id: league.id,
    name: league.name,
    week: league.week,
    settings: safeSettings(league.settings, { isAdmin, viewerPlayerId, isMember }),
    players: (league.players ?? []).map((player) => safePlayer(player, { isAdmin, viewerPlayerId, isMember })),
    sheets: (league.sheets ?? []).map((sheet) => safeSheet(sheet, league, { isAdmin, viewerPlayerId, isMember, canRevealWeek })),
    results: clone(league.results ?? {}),
    recaps: isMember ? clone(league.recaps ?? []) : [],
    latestRecap: isMember ? clone(league.latestRecap ?? null) : null,
    sideBets,
    broadcasts: isAdmin ? clone(league.broadcasts ?? []) : [],
    latestBroadcast: isAdmin ? clone(league.latestBroadcast ?? null) : null,
    chat: isMember ? clone(league.chat ?? []) : [],
    auditLog: isAdmin ? clone(league.auditLog ?? []) : [],
    consentRecords: isAdmin ? clone(league.consentRecords ?? []) : clone((league.consentRecords ?? []).filter((record) => record.playerId === viewerPlayerId)),
    survivorPicks: clone((league.survivorPicks ?? []).filter((pick) => isAdmin || pick.playerId === viewerPlayerId || canRevealWeek(pick.week))),
    payouts: isMember ? clone(league.payouts ?? []) : [],
    cfbPools: (league.cfbPools ?? []).map((pool) => safeCfbPool(pool, { isAdmin, viewerPlayerId, isMember })),
    creditLedger: isAdmin ? clone(league.creditLedger ?? []) : clone((league.creditLedger ?? []).filter((entry) => entry.playerId === viewerPlayerId)),
  };
}

export function buildPublicLeagueView(league) {
  return buildLeagueView(league);
}
