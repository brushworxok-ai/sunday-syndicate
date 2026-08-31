import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE, TEAM_COLORS, TEAMS, getGamesForWeek, getTeamColors, getTeamLogoUrl, hasGameStarted } from './data.js';
import { getWeekTiebreakerGame } from './tiebreaker.js';

test('2026 schedule is structurally complete and timezone-safe', () => {
  const games = SCHEDULE.flatMap((week) => week.games);
  assert.equal(SCHEDULE.length, 18);
  assert.equal(games.length, 272);
  assert.equal(new Set(games.map((game) => game.id)).size, 272);
  const appearances = Object.fromEntries(Object.keys(TEAMS).map((team) => [team, 0]));
  for (const week of SCHEDULE) {
    const presentedGames = getGamesForWeek(2026, week.week);
    // The tiebreaker game is derived dynamically as the week's last kickoff.
    assert.ok(getWeekTiebreakerGame(presentedGames), `week ${week.week} has a tiebreaker game`);
    const playing = week.games.flatMap((game) => [game.away, game.home]);
    assert.equal(new Set(playing).size, playing.length);
    assert.equal(playing.length + week.byeTeams.length, 32);
    for (const team of playing) appearances[team] += 1;
    for (const game of week.games) {
      if (game.time.includes('TBA')) assert.equal(hasGameStarted(game, new Date('2100-01-01T00:00:00Z')), false); // TBA games never lock via kickoff
      else assert.match(game.kickoff, /T\d{2}:\d{2}:00$/); // naive ET wall-clock; offset applied at comparison time
    }
  }
  assert.deepEqual(new Set(Object.values(appearances)), new Set([17]));
});

test('kickoff lock compares absolute instants', () => {
  const game = getGamesForWeek(2026, 1)[0];
  assert.equal(hasGameStarted(game, new Date('2026-09-09T23:59:59Z')), false);
  assert.equal(hasGameStarted(game, new Date('2026-09-10T00:20:00Z')), true);
});

test('all teams have logo URLs, color identity, and safe fallbacks', () => {
  assert.deepEqual(Object.keys(TEAM_COLORS).sort(), Object.keys(TEAMS).sort());
  for (const team of Object.keys(TEAMS)) {
    assert.equal(getTeamLogoUrl(team), `https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png`);
    assert.equal(getTeamColors(team).length, 2);
  }
  assert.deepEqual(getTeamColors('UNKNOWN'), ['#0c2c1c', '#c8f75a']);
});
