import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { approveRecap, createSideBet, generateWeeklyRecap, respondToSideBet, settleSideBetFromLeague, settleWeeklyPayout } from './leagueService.js';
import { DemoSmsProvider, sendApprovedRecap } from './messagingService.js';
import { getGamesForWeek } from '../src/data.js';

test('weekly workflow grounds, approves, broadcasts, suppresses, and falls back', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const recap = await generateWeeklyRecap({ store, leagueId, actor: 'commissioner' });
  assert.equal(recap.generationSource, 'deterministic_fallback');
  assert.equal(recap.factsSnapshot.verifiedGameCount, 14);
  assert.equal(recap.factsSnapshot.winnerId, 'player-marcus');
  assert.deepEqual(recap.factsSnapshot.winnerRecognition.protectedPlayerIds, ['player-marcus']);
  assert.equal(recap.moderation.allowed.some((item) => item.targetPlayerId === 'player-marcus'), false);
  assert.equal(recap.adminApproval.status, 'pending');

  const approved = await approveRecap({ store, recapId: recap.id, text: recap.draftText, actor: 'commissioner' });
  assert.equal(approved.adminApproval.status, 'approved');
  const provider = new DemoSmsProvider();
  const broadcast = await sendApprovedRecap({ store, leagueId, recapId: recap.id, provider, actor: 'commissioner', appBaseUrl: 'https://league.example/app' });
  assert.equal(broadcast.status, 'completed_with_failures');
  assert.equal(broadcast.deliveries.find((item) => item.playerId === 'player-chris').providerAttempted, false);
  const failed = broadcast.deliveries.find((item) => item.playerId === 'player-jordan');
  assert.equal(failed.attemptCount, 2);
  assert.equal(failed.fallback.status, 'delivered');
  assert.equal(broadcast.resultsUrl, 'https://league.example/app?view=results&season=2025&week=12');
  assert.match(provider.sent.find((item) => item.playerId === 'player-marcus').text, /View results and join the league chat: https:\/\/league\.example\/app\?view=results&season=2025&week=12/);
  store.close();
});

test('new non-cash side bet can be accepted, locked, and settled from verified standings', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const bet = await createSideBet({
    store,
    leagueId: 'league-sunday-syndicate-demo',
    actor: 'player-marcus',
    input: { creatorId: 'player-marcus', opponentId: 'player-taylor', event: 'Week 12 score', terms: 'Higher score wins', settlementRule: 'compare_weekly_score', stakeType: 'virtual_tokens', stakeAmount: 10, stakeLabel: '10 tokens' },
  });
  assert.equal(bet.proposalStatus, 'pending');
  const accepted = await respondToSideBet({ store, betId: bet.id, playerId: 'player-taylor', decision: 'accept' });
  assert.equal(accepted.termsLockedAt, accepted.acceptedAt);
  const settled = await settleSideBetFromLeague({ store, betId: bet.id });
  assert.equal(settled.settlementStatus, 'settled');
  assert.equal(settled.winnerId, 'player-marcus');
  store.close();
});

test('cash stakes and unapproved broadcasts fail closed', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  await assert.rejects(createSideBet({ store, leagueId: 'league-sunday-syndicate-demo', actor: 'player', input: { creatorId: 'player-marcus', opponentId: 'player-taylor', event: 'Game', terms: 'Winner takes cash', stakeType: 'cash' } }), /Only non-cash/);
  const recap = await generateWeeklyRecap({ store, leagueId: 'league-sunday-syndicate-demo' });
  await assert.rejects(sendApprovedRecap({ store, leagueId: 'league-sunday-syndicate-demo', recapId: recap.id, provider: new DemoSmsProvider() }), /approved before sending/);
  store.close();
});

test('verified perfect sheet creates an idempotent double payout and permanent win history', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const player = store.getPlayer('player-marcus');
  const games = getGamesForWeek(2026, 1);
  const picks = Object.fromEntries(games.map((game) => [game.id, game.away]));
  store.createPaidSheet(leagueId, { id: 'perfect-sheet-2026-week-1', playerId: player.id, name: player.name, picks, tiebreaker: 42, paid: true, season: 2026, week: 1, submittedAt: '2026-09-01T12:00:00.000Z' }, 2000);
  for (const game of games) store.upsertResult(leagueId, game.id, { awayScore: 24, homeScore: 17, winner: game.away }, 'commissioner');

  const settlement = await settleWeeklyPayout({ store, leagueId, season: 2026, week: 1, actor: 'commissioner' });
  assert.equal(settlement.perfectSheet, true);
  assert.equal(settlement.multiplier, 2);
  assert.equal(settlement.basePotCents, 2000);
  assert.equal(settlement.payoutCents, 4000);
  assert.equal(settlement.winners[0].playerId, player.id);
  assert.equal((await settleWeeklyPayout({ store, leagueId, season: 2026, week: 1 })).id, settlement.id);

  const owedAccount = store.getAccount(player.id);
  assert.equal(owedAccount.wins.find((win) => win.week === 1).status, 'owed');
  assert.equal(owedAccount.pendingWinningsCents, 4000);
  store.markWeeklyPayoutPaid(leagueId, settlement.id, 'commissioner');
  const paidAccount = store.getAccount(player.id);
  assert.equal(paidAccount.wins.find((win) => win.week === 1).status, 'paid');
  assert.equal(paidAccount.pendingWinningsCents, 0);
  assert.equal(paidAccount.paidWinningsCents, 12000);
  store.close();
});
