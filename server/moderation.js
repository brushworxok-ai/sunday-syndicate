const prohibitedContent = /\b(slur|kill\s+you|death\s+threat|threaten|diagnos(?:is|ed|tic)|sexual\s+assault|molest|rape)\b/i;

// Private-life topics that roast content must never touch — family, finances,
// health, appearance. Mirrors the league policy: commentary stays game-related.
const privateLifeContent = /\b(divorce|wife|husband|girlfriend|boyfriend|marriage|custody|sell\s+the\s+(?:car|house)|mortgage|foreclos\w*|evict\w*|paycheck|bankrupt\w*|debt|broke\b|hospital|medication|therapy|rehab|cancer|surgery|overweight|bald|ugly)\b/i;

export class ModerationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ModerationError';
    this.code = code;
  }
}

function namesForOptedOutPlayers(payload = {}) {
  const playerPreferences = Array.isArray(payload.players) ? payload.players : [];
  return playerPreferences
    .filter((player) => player.roastLevel === 'clean' || player.roastLevel === 'none' || player.roastLevel === 'off')
    .map((player) => String(player.name ?? '').trim())
    .filter(Boolean);
}

export function assertGeneratedTextSafe(action, text, payload = {}) {
  if (prohibitedContent.test(text)) {
    throw new ModerationError('Generated copy was blocked by the sensitive-topic policy.', 'sensitive_topic');
  }

  if (action === 'trashTalk' || action === 'weeklyRoast') {
    if (privateLifeContent.test(text)) {
      throw new ModerationError('Generated copy was blocked by the sensitive-topic policy.', 'sensitive_topic');
    }

    const optedOutName = namesForOptedOutPlayers(payload).find((name) => text.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
    if (optedOutName) {
      throw new ModerationError('Generated trash talk named a player who opted out.', 'player_opted_out');
    }

    const allowed = (payload.entries ?? []).some((entry) => entry.roastEligible === true && entry.roastLevel !== 'clean' && entry.roastLevel !== 'none');
    if (!allowed) throw new ModerationError('No players are currently eligible for name-based trash talk.', 'no_eligible_target');
  }

  return { status: 'passed', text };
}
