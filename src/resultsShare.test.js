import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeagueViewUrl, buildWeeklyResultsShare } from './resultsShare.js';

test('weekly results share includes standings, deep links, and perfect-sheet payout', () => {
  const resultsUrl = buildLeagueViewUrl('https://league.example/app?old=1#top', { view: 'results', season: 2026, week: 4 });
  const text = buildWeeklyResultsShare({
    leagueName: 'Sunday Syndicate', season: 2026, week: 4, weekLabel: 'Week 4', completedGames: 16, totalGames: 16,
    leaderboard: [{ name: 'Marcus', score: 16 }, { name: 'Jordan', score: 13 }],
    settlement: { status: 'owed', winnerScore: 16, totalGames: 16, payoutCents: 16000, perfectSheet: true, winners: [{ name: 'Marcus' }] },
    resultsUrl, chatUrl: 'https://league.example/app?view=chat&season=2026&week=4',
  });
  assert.equal(resultsUrl, 'https://league.example/app?view=results&season=2026&week=4');
  assert.match(text, /PERFECT SHEET · 2× PAYOUT/);
  assert.match(text, /\$160\.00/);
  assert.match(text, /Standings: 1\. Marcus 16 · 2\. Jordan 13/);
  assert.match(text, /Group chat:/);
});
