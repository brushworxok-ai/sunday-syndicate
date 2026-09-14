import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt } from './prompts.js';

test('buildPrompt rejects unknown actions', () => {
  assert.throws(() => buildPrompt('anything', {}), /Unsupported/);
});

test('recap prompt removes angle brackets and limits supplied entries', () => {
  const entries = Array.from({ length: 250 }, (_, index) => ({ name: `<Player ${index}>`, score: index }));
  const { prompt } = buildPrompt('recap', { entries });
  assert.equal(prompt.includes('<'), false);
  assert.equal(JSON.parse(prompt.split('\n')[1]).entries.length, 200);
});

test('trash talk falls back to an allowed tone', () => {
  const { prompt } = buildPrompt('trashTalk', { tone: 'vicious' });
  assert.equal(JSON.parse(prompt.split('\n')[1]).tone, 'playful');
});

test('assistant prompt bounds history and strips private or injected markup', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `<turn ${index}>` }));
  const { systemInstruction, prompt } = buildPrompt('assistant', {
    question: '<Who is leading?>',
    history,
    context: { name: '<Sunday Syndicate>', currentPlayer: { name: '<Marcus>', balanceCents: 8000, entryCreditCount: 4 } },
  });
  const data = JSON.parse(prompt.split('\n')[1]);
  assert.equal(prompt.includes('<'), false);
  assert.equal(data.recentConversation.length, 8);
  assert.match(systemInstruction, /never suggest disguising a payment/i);
  assert.equal(data.currentPlayer.balanceCents, 8000);
});

test('assistant prompt includes bounded verified season-race facts', () => {
  const { prompt } = buildPrompt('assistant', {
    question: 'Who has the most wins this season?',
    context: {
      seasonRace: {
        status: 'official',
        weeksSettled: 18,
        topWins: 5,
        leaders: [{ playerId: '<player-a>', name: '<Avery>', weeklyWins: 5, perfectSheets: 1 }],
        champions: [{ playerId: '<player-a>', name: '<Avery>', weeklyWins: 5 }],
      },
    },
  });
  const race = JSON.parse(prompt.split('\n')[1]).league.seasonRace;
  assert.equal(prompt.includes('<'), false);
  assert.equal(race.status, 'official');
  assert.equal(race.champions[0].name, 'Avery');
  assert.equal(race.topWins, 5);
});

test('assistant prompt admits only bounded sourced NFL news', () => {
  const articles = Array.from({ length: 20 }, (_, index) => ({ id: `news-${index}`, headline: `<Headline ${index}>`, description: '<reported update>', publishedAt: '2026-08-19T18:00:00Z', updatedAt: '2026-08-19T18:00:00Z', url: 'https://www.espn.com/nfl/story/test', teams: ['SEA'], isInjury: index === 0, source: 'ESPN' }));
  const { systemInstruction, prompt } = buildPrompt('assistant', { question: 'Any injuries?', context: { nflNews: { provider: 'espn', syncedAt: '2026-08-19T18:05:00Z', scope: 'headline watch', articles } } });
  const news = JSON.parse(prompt.split('\n')[1]).league.nflNews;
  assert.equal(news.articles.length, 12);
  assert.equal(prompt.includes('<'), false);
  assert.equal(news.articles[0].isInjury, true);
  assert.match(systemInstruction, /not a complete official injury report/i);
});

test('assistant prompt preserves matchups and bounded season facts', () => {
  const { prompt } = buildPrompt('assistant', {
    question: 'How am I doing?',
    context: {
      games: [{ id: 'w1-g1', away: 'DAL', home: 'PHI', winner: 'PHI', awayScore: 17, homeScore: 24 }],
      playerMemories: [{ name: 'Marcus', totalPicks: 16, correct: 11, winPercentage: 68.8, seasonRank: 2, currentStreak: { type: 'win', length: 3 }, bestWeek: { week: 1, correct: 11 } }],
      weeklyWinner: { status: 'winner', week: 1, winners: [{ name: 'Avery', score: 12 }] },
      currentPlayer: { name: 'Marcus', favoriteTeam: 'DAL', balanceCents: 4000, entryCreditCount: 2 },
    },
  });
  const data = JSON.parse(prompt.split('\n')[1]);
  assert.equal(data.league.games[0].matchup, 'DAL at PHI');
  assert.equal(data.league.seasonStats[0].correct, 11);
  assert.equal(data.league.weeklyWinner.winners[0].name, 'Avery');
  assert.equal(data.currentPlayer.favoriteTeam, 'DAL');
});

test('weekly roast hands Jack the real reason, not just the score', () => {
  const { prompt, systemInstruction } = buildPrompt('weeklyRoast', {
    playerName: 'Big Lite', roastLevel: 'target', weekScore: 11, weekTotal: 16, weekRank: 2,
    leaderName: 'Trent Walton',
    elimination: { status: 'eliminated', blockedBy: { name: 'Trent Walton', lead: 1, swingGames: 0 } },
    costlyMisses: [{ matchup: 'NE at SEA', took: 'NE', won: 'SEA' }],
  });
  // The funniest fact about this loss is that he copied the man ahead of him.
  assert.match(prompt, /SAME picks in every game that was left/);
  assert.match(prompt, /Trent Walton finished 1 ahead/);
  assert.match(prompt, /NE at SEA \(they took NE, SEA won\)/);
  assert.match(systemInstruction, /Never invent a game that is not listed/);
});

test('weekly roast explains a partial-swing loss with the real count', () => {
  const { prompt } = buildPrompt('weeklyRoast', {
    playerName: 'Alonzo Prince', roastLevel: 'explicit', weekScore: 9, weekTotal: 16, weekRank: 7,
    elimination: { status: 'eliminated', blockedBy: { name: 'Trent Walton', lead: 3, swingGames: 1 } },
  });
  assert.match(prompt, /only 1 remaining game had different picks/);
});

test('the weekly winner still gets no roast material', () => {
  const { prompt, systemInstruction } = buildPrompt('weeklyRoast', {
    playerName: 'Trent Walton', roastLevel: 'target', isWinner: true, weekScore: 12, weekTotal: 16, weekRank: 1,
    elimination: { status: 'clinched', reason: 'Locked it up' },
    costlyMisses: [{ matchup: 'NE at SEA', took: 'NE', won: 'SEA' }],
  });
  assert.doesNotMatch(prompt, /Why they lost/);
  assert.doesNotMatch(prompt, /Games .* hit and they missed/);
  assert.match(systemInstruction, /Never roast a weekly winner/);
});
