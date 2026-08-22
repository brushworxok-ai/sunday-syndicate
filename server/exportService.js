function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildLeagueBackup(league, { generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    purpose: '405 BADGUYS PARLAY commissioner backup',
    warning: 'Private commissioner export. Contains player records, selections, financial ledger summaries, and audit history.',
    league,
  };
}

export function buildWeeklyOperationsCsv({ finance, league, season, week }) {
  const sheetByPlayer = new Map((league.sheets ?? []).filter((sheet) => Number(sheet.season ?? league.season) === Number(season) && Number(sheet.week) === Number(week)).map((sheet) => [sheet.playerId, sheet]));
  const headers = ['season', 'week', 'player', 'favorite_team', 'payment_status', 'entry_balance_usd', 'entry_credits', 'sheet_submitted', 'pick_count', 'score', 'weekly_wins', 'perfect_sheets', 'lifetime_winnings_usd', 'pending_payout_usd'];
  const rows = (finance.players ?? []).map((player) => {
    const leaguePlayer = (league.players ?? []).find((candidate) => candidate.id === player.playerId);
    const sheet = sheetByPlayer.get(player.playerId);
    const score = Object.entries(sheet?.picks ?? {}).reduce((total, [gameId, pick]) => total + (league.results?.[gameId]?.winner === pick ? 1 : 0), 0);
    return [season, week, player.name, leaguePlayer?.favoriteTeam ?? '', player.weeklyPayment?.status ?? (sheet?.paid ? 'balance_used' : 'not_received'), (player.balanceCents / 100).toFixed(2), player.entryCreditCount, Boolean(sheet), Object.keys(sheet?.picks ?? {}).length, score, player.winCount, player.perfectSheetCount, (player.lifetimeWinningsCents / 100).toFixed(2), (player.pendingWinningsCents / 100).toFixed(2)];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
