const money = (cents) => `$${(Number(cents ?? 0) / 100).toFixed(2)}`;

export function buildLeagueViewUrl(baseUrl, { view, season, week }) {
  const url = new URL(baseUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('view', view);
  url.searchParams.set('season', String(season));
  url.searchParams.set('week', String(week));
  return url.toString();
}

export function buildWeeklyResultsShare({ leagueName, season, week, weekLabel, completedGames, totalGames, leaderboard = [], settlement = null, resultsUrl = '', chatUrl = '' }) {
  const lines = [`🏈 ${leagueName} · ${season} ${weekLabel ?? `Week ${week}`}`];
  if (completedGames < totalGames) lines.push(`${completedGames}/${totalGames} games final · standings are still live`);
  else if (settlement?.status === 'rollover') lines.push('Final: the weekly pot rolls over after every tied tiebreaker busted.');
  else if (settlement?.winners?.length) {
    const names = settlement.winners.map((winner) => winner.name).join(' & ');
    lines.push(`${names} ${settlement.winners.length === 1 ? 'wins' : 'win'} with ${settlement.winnerScore}/${settlement.totalGames} correct.`);
    lines.push(`${settlement.perfectSheet ? 'PERFECT SHEET · 2× PAYOUT' : 'Weekly payout'}: ${money(settlement.payoutCents)}`);
  } else if (leaderboard[0]) lines.push(`${leaderboard[0].name} ${completedGames === totalGames ? 'finishes first' : 'leads'} with ${leaderboard[0].score}/${totalGames} correct.`);

  if (leaderboard.length) lines.push(`Standings: ${leaderboard.slice(0, 6).map((entry, index) => `${index + 1}. ${entry.name} ${entry.score}`).join(' · ')}`);
  if (resultsUrl) lines.push(`Results: ${resultsUrl}`);
  if (chatUrl) lines.push(`Group chat: ${chatUrl}`);
  return lines.join('\n');
}
