export const SEASON_WEEK_COUNT = 18;

const COUNTED_SETTLEMENT_STATUSES = new Set(['owed', 'paid', 'rollover']);

export function buildSeasonRace(league, { season = league?.season, totalWeeks = SEASON_WEEK_COUNT } = {}) {
  const targetSeason = Number(season);
  const playerMap = new Map((league?.players ?? []).map((player) => [player.id, {
    playerId: player.id,
    name: player.name,
    favoriteTeam: player.favoriteTeam ?? null,
    weeklyWins: 0,
    outrightWins: 0,
    sharedWins: 0,
    perfectSheets: 0,
    payoutCents: 0,
    weeksWon: [],
  }]));

  const settlementByWeek = new Map();
  for (const settlement of league?.weeklySettlements ?? []) {
    const week = Number(settlement.week);
    if (Number(settlement.season) !== targetSeason || week < 1 || week > totalWeeks || !COUNTED_SETTLEMENT_STATUSES.has(settlement.status)) continue;
    if (!settlementByWeek.has(week)) settlementByWeek.set(week, settlement);
  }

  const settlements = [...settlementByWeek.values()].sort((a, b) => Number(a.week) - Number(b.week));
  let perfectSheetCount = 0;
  let awardedWinCount = 0;
  for (const settlement of settlements) {
    const winners = [...new Map((settlement.winners ?? []).map((winner) => [winner.playerId, winner])).values()];
    if (settlement.perfectSheet && winners.length) perfectSheetCount += winners.length;
    for (const winner of winners) {
      if (!playerMap.has(winner.playerId)) {
        playerMap.set(winner.playerId, {
          playerId: winner.playerId,
          name: winner.name ?? 'Former player',
          favoriteTeam: null,
          weeklyWins: 0,
          outrightWins: 0,
          sharedWins: 0,
          perfectSheets: 0,
          payoutCents: 0,
          weeksWon: [],
        });
      }
      const record = playerMap.get(winner.playerId);
      record.weeklyWins += 1;
      record.outrightWins += winners.length === 1 ? 1 : 0;
      record.sharedWins += winners.length > 1 ? 1 : 0;
      record.perfectSheets += settlement.perfectSheet ? 1 : 0;
      record.payoutCents += Number(winner.payoutCents ?? 0);
      record.weeksWon.push(Number(settlement.week));
      awardedWinCount += 1;
    }
  }

  const records = [...playerMap.values()].sort((a, b) => b.weeklyWins - a.weeklyWins
    || b.perfectSheets - a.perfectSheets
    || b.payoutCents - a.payoutCents
    || a.name.localeCompare(b.name));
  const topWins = records[0]?.weeklyWins ?? 0;
  let previousWins = null;
  let currentRank = 0;
  records.forEach((record, index) => {
    if (!record.weeklyWins) record.rank = null;
    else {
      if (record.weeklyWins !== previousWins) currentRank = index + 1;
      record.rank = currentRank;
    }
    record.gamesBack = topWins - record.weeklyWins;
    previousWins = record.weeklyWins;
  });

  const leaders = topWins > 0 ? records.filter((record) => record.weeklyWins === topWins) : [];
  const latestSettledWeek = settlements.reduce((latest, settlement) => Math.max(latest, Number(settlement.week)), 0);
  const complete = settlementByWeek.has(totalWeeks);
  const champions = complete ? leaders.map((record) => ({ ...record })) : [];

  return {
    season: targetSeason,
    totalWeeks,
    weeksSettled: settlements.length,
    latestSettledWeek,
    remainingWeeks: Math.max(0, totalWeeks - latestSettledWeek),
    complete,
    status: complete ? champions.length ? 'official' : 'complete_no_winner' : 'live',
    records,
    leaders: leaders.map((record) => ({ ...record })),
    champions,
    topWins,
    perfectSheetCount,
    awardedWinCount,
  };
}

