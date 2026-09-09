import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE, TEAM_COLORS, TEAMS, getGamesForWeek, getTeamColors, getTeamLogoUrl, hasGameStarted, DEADLINE_HOURS_BEFORE_KICKOFF, DEADLINE_LABEL, getWeekDeadline, getGames, isWeekLocked } from './data.js';
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

test('the weekly deadline is one hour before the first kickoff of that week', () => {
  assert.equal(DEADLINE_HOURS_BEFORE_KICKOFF, 1);
  assert.equal(DEADLINE_LABEL, '1 hour'); // never "1 hours"

  /* Kickoff strings are ET wall-clock with no offset, so compare wall clock to
     wall clock: deadline + 1h, rendered in ET, must equal the first kickoff. */
  const inEasternWallClock = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
  };

  for (const week of [1, 5, 12]) {
    const firm = getGames(week).filter((game) => !game.time.includes('TBA'));
    if (!firm.length) continue;
    const firstKickoff = firm.map((game) => game.kickoff).sort()[0].slice(0, 16);
    const deadline = getWeekDeadline(week);
    assert.equal(inEasternWallClock(new Date(deadline.getTime() + 3_600_000)), firstKickoff,
      `week ${week} should lock exactly 1h before ${firstKickoff}`);
    assert.equal(isWeekLocked(week, new Date(deadline.getTime() + 60_000)), true);
    assert.equal(isWeekLocked(week, new Date(deadline.getTime() - 60_000)), false);
  }
});

test('Week 1 locks at 7:20 PM ET, one hour before NE at SEA', () => {
  const shown = getWeekDeadline(1).toLocaleString('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
  });
  assert.equal(shown, 'Wed 7:20 PM');
});
