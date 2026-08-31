import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_LEAGUE,
  DEMO_PLAYERS,
  DEMO_SIDE_BET_PROPOSALS,
  buildBroadcastDeliveries,
  buildLeaderboard,
  moderateRoastCandidates,
  settleSideBet,
} from './demoLeague.js';

test('demo acceptance scenario contains four players and a grounded weekly recap', () => {
  assert.equal(DEMO_LEAGUE.players.length >= 4, true);
  assert.equal(DEMO_LEAGUE.recap.factsSnapshot.verifiedGameCount, Object.values(DEMO_LEAGUE.results).filter((r) => r.winner).length);
  assert.equal(DEMO_LEAGUE.recap.factsSnapshot.winnerId, 'player-marcus');
  assert.match(DEMO_LEAGUE.recap.finalText, /Marcus Reed wins Week 1 at 14–2/);
});

test('trash-talk moderation enforces opt-out, maximum mode, and private-topic policy', () => {
  const candidates = [
    { targetPlayerId: 'player-taylor', tone: 'maximum', text: 'Taylor’s picks were so cold they qualify as weather data.' },
    { targetPlayerId: 'player-chris', tone: 'light', text: 'Chris had a rough week.' },
    { targetPlayerId: 'player-taylor', tone: 'light', text: 'Taylor should sell the car.' },
  ];
  const result = moderateRoastCandidates(candidates, DEMO_PLAYERS, { trashTalkEnabled: true, maximumTone: 'maximum' });
  assert.equal(result.allowed.length, 1);
  assert.equal(result.allowed[0].targetPlayerId, 'player-taylor');
  assert.deepEqual(result.blocked.map((item) => item.reason), ['player_opted_out', 'private_or_sensitive_topic']);
});

test('broadcast suppresses non-consenting player before provider and falls back after failed SMS', () => {
  const deliveries = buildBroadcastDeliveries(DEMO_PLAYERS, ['player-jordan']);
  const optedOut = deliveries.find((item) => item.playerId === 'player-chris');
  const failed = deliveries.find((item) => item.playerId === 'player-jordan');
  assert.equal(optedOut.status, 'suppressed');
  assert.equal(optedOut.providerAttempted, false);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.providerAttempted, true);
  assert.deepEqual(failed.fallback.status, 'delivered');
});

test('accepted side bet locks and settles from verified scores while declined bet does not settle', () => {
  const leaderboard = buildLeaderboard();
  const accepted = settleSideBet(DEMO_SIDE_BET_PROPOSALS[0], leaderboard, '2025-11-24T05:40:00.000Z');
  const declined = settleSideBet(DEMO_SIDE_BET_PROPOSALS[1], leaderboard, '2025-11-24T05:40:00.000Z');
  assert.equal(accepted.termsLockedAt, accepted.acceptedAt);
  assert.equal(accepted.settlementStatus, 'settled');
  assert.equal(accepted.winnerId, 'player-marcus');
  assert.equal(accepted.creatorScore, 14);
  assert.equal(accepted.opponentScore, 13);
  assert.equal(declined.settlementStatus, 'not_applicable');
  assert.equal(declined.winnerId, undefined);
});

test('recap cannot publish before moderation and explicit admin approval', () => {
  assert.equal(DEMO_LEAGUE.recap.generationStatus, 'generated');
  assert.equal(DEMO_LEAGUE.recap.moderationStatus, 'passed_with_edits');
  assert.equal(DEMO_LEAGUE.recap.adminApproval.status, 'approved');
  assert.equal(DEMO_LEAGUE.broadcast.approvedAt, DEMO_LEAGUE.recap.adminApproval.approvedAt);
});
