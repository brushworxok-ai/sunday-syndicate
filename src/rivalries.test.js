import test from 'node:test';
import assert from 'node:assert/strict';
import { getGamesForWeek } from './data.js';
import { buildFavoriteTeamRivalries } from './rivalries.js';

const game = getGamesForWeek(2026, 1)[0];

function leagueWithLoserLevel(level) {
  return {
    season: 2026,
    week: 1,
    players: [
      { id: 'away-fan', name: 'Away Fan', favoriteTeam: game.away, trashTalk: { level: 'competitive' } },
      { id: 'home-fan', name: 'Home Fan', favoriteTeam: game.home, trashTalk: { level } },
      { id: 'other-fan', name: 'Other Fan', favoriteTeam: 'DAL', trashTalk: { level: 'light' } },
    ],
    results: { [game.id]: { awayScore: 27, homeScore: 17, winner: game.away, status: 'final', verifiedAt: '2026-09-10T04:00:00.000Z' } },
  };
}

test('favorite teams automatically create a verified player rivalry and season record', () => {
  const board = buildFavoriteTeamRivalries(leagueWithLoserLevel('competitive'), { season: 2026, week: 1 });
  assert.equal(board.current.length, 1);
  assert.equal(board.current[0].winnerPlayerId, 'away-fan');
  assert.equal(board.current[0].status, 'final');
  assert.equal(board.records.find((record) => record.playerId === 'away-fan').wins, 1);
  assert.equal(board.records.find((record) => record.playerId === 'home-fan').losses, 1);
});

test('favorite-team bragging honors the losing player’s saved roast ceiling', () => {
  const protectedBoard = buildFavoriteTeamRivalries(leagueWithLoserLevel('none'), { season: 2026, week: 1 });
  assert.equal(protectedBoard.current[0].canRoastLoser, false);
  assert.match(protectedBoard.current[0].braggingCopy, /No Roast Mode/);

  const maximumBoard = buildFavoriteTeamRivalries(leagueWithLoserLevel('maximum'), { season: 2026, week: 1 });
  assert.equal(maximumBoard.current[0].canRoastLoser, true);
  assert.equal(maximumBoard.current[0].targetRoastLevel, 'maximum');
  assert.match(maximumBoard.current[0].braggingCopy, /film room/);
});
