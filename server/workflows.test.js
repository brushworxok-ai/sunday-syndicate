import test from 'node:test';
import assert from 'node:assert/strict';
import { LeagueStore } from './store.js';
import { approveRecap, createSideBet, generateWeeklyRecap, respondToSideBet, settleSideBetFromLeague } from './leagueService.js';
import { DemoSmsProvider, sendApprovedRecap } from './messagingService.js';

test('weekly workflow grounds, approves, broadcasts, suppresses, and falls back', async () => {
  const store = new LeagueStore(':memory:');
  store.seedDemo();
  const leagueId = 'league-sunday-syndicate-demo';
  const recap = await generateWeeklyRecap({ store, leagueId, actor: 'commissioner' });
  assert.equal(recap.generationSource, 'deterministic_fallback');
  assert.ok(recap.factsSnapshot.verifiedGameCount >= 14);
  assert.equal(recap.factsSnapshot.winnerId, 'player-marcus');
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
  assert.equal(broadcast.deliveries.find((item) => item.playerId === 'player-marcus').status, 'delivered');
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

