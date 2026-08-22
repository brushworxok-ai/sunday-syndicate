function scoreSheet(sheet, results = {}) {
  return Object.entries(sheet.picks ?? {}).reduce(
    (total, [gameId, pick]) => total + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );
}

export function buildPublicLeagueView(league) {
  return {
    ...league,
    sheets: (league.sheets ?? []).map(({ picks, ...sheet }) => ({
      ...sheet,
      pickCount: Object.keys(picks ?? {}).length,
      score: scoreSheet({ picks }, league.results),
    })),
  };
}
