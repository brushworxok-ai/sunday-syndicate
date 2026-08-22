const cleanText = (value, max = 200) => String(value ?? '').replace(/[<>]/g, '').trim().slice(0, max);

const cleanNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const cleanGames = (games = []) => games.slice(0, 24).map((game) => ({
  id: cleanText(game.id, 12),
  matchup: `${cleanText(game.away, 8)} at ${cleanText(game.home, 8)}`,
  winner: cleanText(game.winner, 8) || null,
  awayScore: cleanNumber(game.awayScore),
  homeScore: cleanNumber(game.homeScore),
}));

const cleanEntries = (entries = []) => entries.slice(0, 200).map((entry) => ({
  id: cleanText(entry.id, 50),
  name: cleanText(entry.name, 40) || 'Anonymous',
  score: cleanNumber(entry.score) ?? 0,
  tiebreaker: cleanNumber(entry.tiebreaker),
  pickCount: cleanNumber(entry.pickCount) ?? 0,
  roastLevel: ['none', 'light', 'competitive', 'maximum'].includes(entry.roastLevel) ? entry.roastLevel : 'none',
  roastEligible: entry.roastEligible === true && entry.roastLevel !== 'none',
}));

const cleanPlayers = (players = []) => players.slice(0, 200).map((player) => ({
  id: cleanText(player.id, 50),
  name: cleanText(player.name, 40) || 'Anonymous',
  roastLevel: ['none', 'light', 'competitive', 'maximum'].includes(player.roastLevel) ? player.roastLevel : 'none',
}));

const cleanPicks = (picks = []) => picks.slice(0, 24).map((pick) => ({
  matchup: `${cleanText(pick.away, 8)} at ${cleanText(pick.home, 8)}`,
  selection: cleanText(pick.selection, 8) || 'unpicked',
  time: cleanText(pick.time, 30),
}));

const cleanHistory = (history = []) => history.slice(-8).map((message) => ({
  role: message.role === 'assistant' ? 'assistant' : 'user',
  text: cleanText(message.text, 500),
})).filter((message) => message.text);

export const PROMPTS = {
  recap(payload = {}) {
    const context = {
      week: cleanNumber(payload.week) ?? 12,
      pot: cleanNumber(payload.pot) ?? 0,
      rollover: cleanNumber(payload.rollover) ?? 0,
      entries: cleanEntries(payload.entries),
      trashTalkConsent: cleanPlayers(payload.players),
      games: cleanGames(payload.games),
    };

    return {
      systemInstruction: [
        'You are the 405 BADGUYS PARLAY commissioner\'s concise sportswriter.',
        'Write a lively weekly league snapshot using only the supplied JSON.',
        'Never invent game facts, injuries, odds, standings, player names, or results.',
        'If results are incomplete, call it a live snapshot rather than a recap.',
        'Use 2 short paragraphs and finish with one punchy sentence labeled “Commissioner\'s note:”.',
        'Name-based jokes are optional and may target only a player whose trashTalkConsent roastLevel is not “none”; stay within that exact tone level.',
        'Players at “none” may appear in factual rankings but must never be the subject of a joke or teasing language.',
        'Keep it friendly, specific, and under 150 words.',
      ].join(' '),
      prompt: `League data:\n${JSON.stringify(context)}`,
    };
  },

  picks(payload = {}) {
    const context = {
      week: cleanNumber(payload.week) ?? 12,
      picked: cleanPicks(payload.picks),
      totalGames: cleanNumber(payload.totalGames) ?? 0,
      tiebreaker: cleanNumber(payload.tiebreaker),
    };

    return {
      systemInstruction: [
        'You are a cautious pick-sheet assistant for a casual confidence-free NFL pool.',
        'Analyze only completeness, pick distribution, scheduling, and tiebreaker mechanics from the supplied JSON.',
        'Do not claim current sports knowledge, winning probabilities, injury news, betting odds, or guaranteed outcomes.',
        'Do not encourage gambling. This is a social pool helper.',
        'Return three compact sections with these exact labels: “Sheet check”, “Pattern”, and “Before you lock”.',
        'Keep the full answer under 130 words.',
      ].join(' '),
      prompt: `Current pick sheet:\n${JSON.stringify(context)}`,
    };
  },

  trashTalk(payload = {}) {
    const context = {
      author: cleanText(payload.author, 40) || 'A league member',
      tone: ['playful', 'bold', 'deadpan'].includes(payload.tone) ? payload.tone : 'playful',
      allowedTargets: cleanEntries(payload.entries).filter((entry) => entry.roastEligible).slice(0, 10),
      excludedTargets: cleanPlayers(payload.players).filter((player) => player.roastLevel === 'none'),
      seed: cleanText(payload.seed, 160),
    };

    return {
      systemInstruction: [
        'Draft one short message for friendly fantasy-football-style league banter.',
        'It may be competitive but must not include slurs, threats, sexual content, harassment, or attacks on protected traits.',
        'Use only supplied allowedTargets. Do not invent facts.',
        'Never name or allude to anyone in excludedTargets.',
        'Return only the message, with no quotation marks or preamble.',
        'Maximum 28 words.',
      ].join(' '),
      prompt: `Banter request:\n${JSON.stringify(context)}`,
    };
  },

  weeklyRoast(payload = {}) {
    const name = cleanText(payload.playerName, 40) || 'Player';
    const roastLevel = ['clean', 'pg13', 'explicit', 'target'].includes(payload.roastLevel) ? payload.roastLevel : 'clean';
    const isWinner = payload.isWinner === true;
    const score = `${cleanNumber(payload.weekScore) ?? 0}/${cleanNumber(payload.weekTotal) ?? 0}`;
    const rank = cleanNumber(payload.weekRank) ?? 0;
    const memory = payload.seasonMemory ?? {};
    const adultTier = ['explicit', 'target'].includes(roastLevel);

    const voiceBase = [
      'You are Jack, the AI commissioner of a private NFL pick-em league.',
      'Your voice is barbershop-meets-sports-desk: confident, funny, urban, with natural slang like bruh, dawg, that boy cooked, no cap.',
    ];

    const voiceAdult = adultTier ? [
      'This player has opted into adult language in a private, age-gated space.',
      'You can use profanity naturally: "shit", "damn", "hell", "ass" flow freely.',
      roastLevel === 'target' ? 'At this level you can say "nigga" as a term of camaraderie, like friends in the barbershop. Never as a slur or with hostility.' : '',
    ].filter(Boolean) : [
      'Keep language clean. No profanity. Be funny without cursing.',
    ];

    const rules = [
      isWinner
        ? `${name} WON the week. Celebrate them hard. Gas them up. No roast — only love for the champ.`
        : `Write a short, pointed roast of ${name} who went ${score} this week (rank #${rank}).`,
      'Use only the supplied facts. Never invent stats, injuries, or game results.',
      'Never cross into slurs, threats, sexual content, or attacks on race, religion, sexuality, disability, family, health, appearance, or finances.',
      'Return only the roast text with no quotation marks or preamble.',
      'Maximum 40 words.',
    ];

    const memoryContext = memory.winPercentage != null
      ? `Season stats: ${memory.winPercentage}% win rate, ${memory.correct ?? 0}/${memory.totalPicks ?? 0} all-time. Current streak: ${memory.currentStreak?.type ?? 'none'} x${memory.currentStreak?.length ?? 0}. Best week: ${memory.bestWeek?.correct ?? '?'} correct (Wk ${memory.bestWeek?.week ?? '?'}).`
      : 'No prior season stats available.';

    return {
      systemInstruction: [...voiceBase, ...voiceAdult, ...rules].join(' '),
      prompt: `Player: ${name}\nWeek score: ${score}\nRank: #${rank}\nWinner: ${isWinner}\n${memoryContext}`,
    };
  },

  assistant(payload = {}) {
    const supplied = payload.context ?? {};
    const context = {
      question: cleanText(payload.question, 500),
      recentConversation: cleanHistory(payload.history),
      league: {
        name: cleanText(supplied.name, 80) || '405 BADGUYS PARLAY',
        season: cleanNumber(supplied.season),
        week: cleanNumber(supplied.week),
        weekLabel: cleanText(supplied.weekLabel, 60),
        entryFee: cleanNumber(supplied.entryFee),
        pot: cleanNumber(supplied.pot),
        rollover: cleanNumber(supplied.rollover),
        verifiedGameCount: cleanNumber(supplied.verifiedGameCount) ?? 0,
        totalGames: cleanNumber(supplied.totalGames) ?? 0,
        weekLocked: supplied.weekLocked === true,
        standings: cleanEntries(supplied.standings).slice(0, 20),
        games: cleanGames(supplied.games),
        seasonRace: supplied.seasonRace ? {
          status: ['live', 'official', 'complete_no_winner'].includes(supplied.seasonRace.status) ? supplied.seasonRace.status : 'live',
          weeksSettled: cleanNumber(supplied.seasonRace.weeksSettled) ?? 0,
          topWins: cleanNumber(supplied.seasonRace.topWins) ?? 0,
          leaders: Array.isArray(supplied.seasonRace.leaders) ? supplied.seasonRace.leaders.slice(0, 20).map((entry) => ({
            playerId: cleanText(entry.playerId, 80),
            name: cleanText(entry.name, 40),
            weeklyWins: cleanNumber(entry.weeklyWins) ?? 0,
            perfectSheets: cleanNumber(entry.perfectSheets) ?? 0,
          })) : [],
          champions: Array.isArray(supplied.seasonRace.champions) ? supplied.seasonRace.champions.slice(0, 20).map((entry) => ({
            playerId: cleanText(entry.playerId, 80),
            name: cleanText(entry.name, 40),
            weeklyWins: cleanNumber(entry.weeklyWins) ?? 0,
          })) : [],
        } : null,
        rivalries: supplied.rivalries ? {
          playersWithTeams: cleanNumber(supplied.rivalries.playersWithTeams) ?? 0,
          current: Array.isArray(supplied.rivalries.current) ? supplied.rivalries.current.slice(0, 20).map((item) => ({
            id: cleanText(item.id, 140),
            status: ['scheduled', 'in_progress', 'final'].includes(item.status) ? item.status : 'scheduled',
            matchup: `${cleanText(item.awayTeam, 8)} vs ${cleanText(item.homeTeam, 8)}`,
            awayPlayer: { id: cleanText(item.awayPlayer?.id, 60), name: cleanText(item.awayPlayer?.name, 40), roastLevel: cleanText(item.awayPlayer?.roastLevel, 16) },
            homePlayer: { id: cleanText(item.homePlayer?.id, 60), name: cleanText(item.homePlayer?.name, 40), roastLevel: cleanText(item.homePlayer?.roastLevel, 16) },
            awayScore: cleanNumber(item.awayScore),
            homeScore: cleanNumber(item.homeScore),
            winnerTeam: cleanText(item.winnerTeam, 8) || null,
            canRoastLoser: item.canRoastLoser === true,
            targetRoastLevel: ['none', 'light', 'competitive', 'maximum'].includes(item.targetRoastLevel) ? item.targetRoastLevel : 'none',
            approvedCopy: cleanText(item.braggingCopy, 220),
          })) : [],
          records: Array.isArray(supplied.rivalries.records) ? supplied.rivalries.records.slice(0, 50).map((record) => ({ playerId: cleanText(record.playerId, 60), name: cleanText(record.name, 40), favoriteTeam: cleanText(record.favoriteTeam, 8), wins: cleanNumber(record.wins) ?? 0, losses: cleanNumber(record.losses) ?? 0 })) : [],
        } : null,
        seasonPool: supplied.seasonPool ? {
          status: cleanText(supplied.seasonPool.status, 24),
          canJoin: supplied.seasonPool.canJoin === true,
          entryFeeCents: cleanNumber(supplied.seasonPool.entryFeeCents) ?? 2500,
          potCents: cleanNumber(supplied.seasonPool.potCents) ?? 0,
          confirmedCount: cleanNumber(supplied.seasonPool.confirmedCount) ?? 0,
          deadlineAt: cleanText(supplied.seasonPool.deadlineAt, 40) || null,
          entries: Array.isArray(supplied.seasonPool.entries) ? supplied.seasonPool.entries.slice(0, 200).map((entry) => ({ playerId: cleanText(entry.playerId, 60), status: cleanText(entry.status, 16) })) : [],
          rule: cleanText(supplied.seasonPool.rule, 220),
          settlement: supplied.seasonPool.settlement ? {
            status: cleanText(supplied.seasonPool.settlement.status, 16),
            potCents: cleanNumber(supplied.seasonPool.settlement.potCents) ?? 0,
            winners: Array.isArray(supplied.seasonPool.settlement.winners) ? supplied.seasonPool.settlement.winners.slice(0, 20).map((winner) => ({ playerId: cleanText(winner.playerId, 60), name: cleanText(winner.name, 40), weeklyWins: cleanNumber(winner.weeklyWins) ?? 0, payoutCents: cleanNumber(winner.payoutCents) ?? 0 })) : [],
          } : null,
        } : null,
        nflNews: supplied.nflNews ? {
          provider: cleanText(supplied.nflNews.provider, 24),
          syncedAt: cleanText(supplied.nflNews.syncedAt, 40) || null,
          scope: cleanText(supplied.nflNews.scope, 120),
          articles: Array.isArray(supplied.nflNews.articles) ? supplied.nflNews.articles.slice(0, 12).map((article) => ({
            id: cleanText(article.id, 120),
            headline: cleanText(article.headline, 180),
            description: cleanText(article.description, 320),
            publishedAt: cleanText(article.publishedAt, 40),
            updatedAt: cleanText(article.updatedAt, 40),
            url: cleanText(article.url, 300),
            teams: Array.isArray(article.teams) ? article.teams.slice(0, 4).map((team) => cleanText(team, 8)) : [],
            isInjury: article.isInjury === true,
            source: cleanText(article.source, 30),
          })) : [],
        } : null,
        rules: Array.isArray(supplied.rules) ? supplied.rules.slice(0, 12).map((rule) => cleanText(rule, 180)) : [],
        availableFeatures: Array.isArray(supplied.availableFeatures) ? supplied.availableFeatures.slice(0, 16).map((feature) => cleanText(feature, 80)) : [],
      },
      currentPlayer: supplied.currentPlayer ? {
        id: cleanText(supplied.currentPlayer.id, 60),
        name: cleanText(supplied.currentPlayer.name, 40),
        favoriteTeam: cleanText(supplied.currentPlayer.favoriteTeam, 8) || null,
        balanceCents: cleanNumber(supplied.currentPlayer.balanceCents) ?? 0,
        entryCreditCount: cleanNumber(supplied.currentPlayer.entryCreditCount) ?? 0,
        weeklyPaymentStatus: cleanText(supplied.currentPlayer.weeklyPaymentStatus, 24) || 'not_claimed',
        lifetimeWinningsCents: cleanNumber(supplied.currentPlayer.lifetimeWinningsCents) ?? 0,
        pendingWinningsCents: cleanNumber(supplied.currentPlayer.pendingWinningsCents) ?? 0,
        winCount: cleanNumber(supplied.currentPlayer.winCount) ?? 0,
      } : null,
    };

    return {
      systemInstruction: [
        'You are 405 Assistant, a concise and upbeat in-app guide for a private NFL pick-em league.',
        'Answer only from the supplied league JSON and general app instructions included in it.',
        'Never invent scores, standings, injuries, odds, probabilities, legal conclusions, payment approvals, or hidden picks.',
        'NFL news or injury answers may use only supplied nflNews articles. Name ESPN as the source, mention the published time, and explain that headline watch is not a complete official injury report. If no relevant fresh article is supplied, say so.',
        'Do not provide gambling strategy or tell anyone which team to choose.',
        'If asked about funding, explain the supplied commissioner-confirmed payment workflow and current status. Never claim a pending payment is confirmed or reveal another player’s balance. Never suggest disguising a payment.',
        'Favorite-team rivalry facts must come only from the supplied rivalry records. Never invent a matchup result. Any teasing about a losing fan must be limited by that losing player’s targetRoastLevel; if canRoastLoser is false, use only the supplied respectful approvedCopy.',
        'The season pool is an external commissioner-confirmed contribution record, separate from weekly credits. Never claim the app charged, held, transferred, or legally approved money.',
        'Do not reveal phone numbers, private messages, PINs, payment handles, or another player\'s account balance.',
        'If the answer is not in the supplied facts, say what the commissioner needs to verify.',
        'Use plain language, short paragraphs, and no more than 140 words.',
      ].join(' '),
      prompt: `League assistant request:\n${JSON.stringify(context)}`,
    };
  },
};

export function buildPrompt(action, payload) {
  const builder = PROMPTS[action];
  if (!builder) throw new Error('Unsupported AI action');
  return builder(payload);
}
