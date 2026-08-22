import { getGamesForWeek } from './data.js';

const ROAST_COPY = {
  light: ({ winner, loser }) => `${winner.name} gets the bragging-rights badge. ${loser.name}, the rematch request line is open.`,
  competitive: ({ winner, loser, winnerTeam, loserTeam }) => `${winner.name}’s ${winnerTeam} handled ${loser.name}’s ${loserTeam}. The scoreboard receipt stays posted.`,
  maximum: ({ winner, loser, winnerTeam, loserTeam }) => `${winner.name} owns the rivalry receipt: ${winnerTeam} over ${loserTeam}. ${loser.name}, Jack saved you a seat in the film room.`,
};

function matchupPairs(game, players) {
  const awayFans = players.filter((player) => player.favoriteTeam === game.away);
  const homeFans = players.filter((player) => player.favoriteTeam === game.home);
  return awayFans.flatMap((awayPlayer) => homeFans.map((homePlayer) => ({ awayPlayer, homePlayer })));
}

function rivalryResult({ game, result, awayPlayer, homePlayer, week }) {
  const final = Boolean(result?.winner) && (result.status === 'final' || result.verifiedAt || result.verifiedBy);
  const winner = final ? result.winner === game.away ? awayPlayer : homePlayer : null;
  const loser = final ? result.winner === game.away ? homePlayer : awayPlayer : null;
  const winnerTeam = result?.winner ?? null;
  const loserTeam = winnerTeam ? winnerTeam === game.away ? game.home : game.away : null;
  const targetLevel = loser?.trashTalk?.level ?? 'none';
  const canRoastLoser = final && targetLevel !== 'none';
  const braggingCopy = !final
    ? `${awayPlayer.name}’s ${game.away} vs ${homePlayer.name}’s ${game.home}`
    : canRoastLoser
      ? (ROAST_COPY[targetLevel] ?? ROAST_COPY.light)({ winner, loser, winnerTeam, loserTeam })
      : `${winner.name} earned the team-win badge. ${loser.name} chose No Roast Mode, so the result stays respectful.`;
  return {
    id: `rivalry-${week}-${game.id}-${awayPlayer.id}-${homePlayer.id}`,
    week,
    gameId: game.id,
    time: game.time,
    awayTeam: game.away,
    homeTeam: game.home,
    awayPlayer: { id: awayPlayer.id, name: awayPlayer.name, roastLevel: awayPlayer.trashTalk?.level ?? 'none' },
    homePlayer: { id: homePlayer.id, name: homePlayer.name, roastLevel: homePlayer.trashTalk?.level ?? 'none' },
    status: final ? 'final' : result?.status === 'in_progress' ? 'in_progress' : 'scheduled',
    awayScore: result?.awayScore ?? null,
    homeScore: result?.homeScore ?? null,
    winnerPlayerId: winner?.id ?? null,
    loserPlayerId: loser?.id ?? null,
    winnerTeam,
    loserTeam,
    canRoastLoser,
    targetRoastLevel: targetLevel,
    braggingCopy,
  };
}

export function buildFavoriteTeamRivalries(league, { season = league?.season, week = league?.week } = {}) {
  const players = (league?.players ?? []).filter((player) => player.favoriteTeam);
  const results = league?.results ?? {};
  const currentWeek = Number(week);
  const current = [];
  const history = [];

  for (let weekNumber = 1; weekNumber <= 18; weekNumber += 1) {
    for (const game of getGamesForWeek(Number(season), weekNumber)) {
      for (const pair of matchupPairs(game, players)) {
        const rivalry = rivalryResult({ game, result: results[game.id], ...pair, week: weekNumber });
        if (weekNumber === currentWeek) current.push(rivalry);
        if (rivalry.status === 'final') history.push(rivalry);
      }
    }
  }

  const records = players.map((player) => {
    const completed = history.filter((item) => item.awayPlayer.id === player.id || item.homePlayer.id === player.id);
    const wins = completed.filter((item) => item.winnerPlayerId === player.id).length;
    return { playerId: player.id, name: player.name, favoriteTeam: player.favoriteTeam, wins, losses: completed.length - wins, matchups: completed.length };
  }).sort((left, right) => right.wins - left.wins || left.name.localeCompare(right.name));

  return {
    season: Number(season),
    week: currentWeek,
    current,
    history: history.sort((left, right) => right.week - left.week),
    records,
    playersWithTeams: players.length,
  };
}
