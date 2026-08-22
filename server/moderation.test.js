import test from 'node:test';
import assert from 'node:assert/strict';
import { assertGeneratedTextSafe, ModerationError } from './moderation.js';

const payload = {
  players: [{ id: 'chris', name: 'Chris Morgan', roastLevel: 'none' }],
  entries: [{ id: 'taylor', name: 'Taylor Brooks', roastLevel: 'maximum', roastEligible: true }],
};

test('runtime moderation permits game-only humor about an eligible player', () => {
  const result = assertGeneratedTextSafe('trashTalk', 'Taylor’s picks were colder than the scoreboard.', payload);
  assert.equal(result.status, 'passed');
});

test('runtime moderation blocks an opted-out player name', () => {
  assert.throws(() => assertGeneratedTextSafe('trashTalk', 'Chris Morgan had a rough one.', payload), (error) => error instanceof ModerationError && error.code === 'player_opted_out');
});

test('runtime moderation blocks private-life content', () => {
  assert.throws(() => assertGeneratedTextSafe('trashTalk', 'Taylor should sell the car.', payload), (error) => error instanceof ModerationError && error.code === 'sensitive_topic');
});
