import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
// Twilio is optional — lazy-loaded only when webhook routes are hit
let _twilioModule;
async function getTwilioModule() {
  if (_twilioModule === undefined) {
    try { _twilioModule = (await import('twilio')).default; } catch { _twilioModule = null; }
  }
  return _twilioModule;
}
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { SCHEDULE, getGames, getCurrentWeek, getWeekDeadline, isWeekLocked, SEASON, WEEK } from '../src/data.js';
import { createLeagueStore } from './storeFactory.js';
import { ModerationError } from './moderation.js';
import { buildLeaderboard, scoreSheet } from '../src/demoLeague.js';
import {
  buildPlayerSeasonMemory,
  buildWeeklyWinnerRecognition,
  resolveJackRoastPolicy,
  normalizePlayerJackPolicy,
  normalizeJackSettings,
  previewJackRoast,
} from '../src/jackHost.js';
import { createAdminAuth, createPlayerAuth, hashPin } from './auth.js';
import {
  WorkflowError,
  approveRecap,
  createSideBet,
  generateWeeklyRecap,
  respondToSideBet,
  settleSideBetFromLeague,
} from './leagueService.js';
import { applyDeliveryStatus, createSmsProvider, sendApprovedRecap, sendJackBroadcast } from './messagingService.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const port = Number(process.env.PORT) || 8787;
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const databasePath = process.env.DATABASE_PATH || path.join(projectRoot, 'work', 'sunday-syndicate.sqlite');
const store = await createLeagueStore({ databaseUrl: process.env.DATABASE_URL, databasePath });
await store.seedDemo();

const isProduction = process.env.NODE_ENV === 'production';
const secureCookies = process.env.VERCEL === '1' || (isProduction && String(process.env.APP_BASE_URL).startsWith('https://'));
const auth = createAdminAuth({
  password: process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123'),
  secret: process.env.SESSION_SECRET || 'development-only-session-secret-change-me',
  secure: secureCookies,
});
const playerAuth = createPlayerAuth({ store, secret: `${process.env.SESSION_SECRET || 'development-only-session-secret-change-me'}:player`, secure: secureCookies });

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
const leagueId = 'league-sunday-syndicate-demo';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    database: store.kind,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here'),
    model,
    smsProvider: ['twilio', 'textbelt'].includes(process.env.SMS_PROVIDER) ? process.env.SMS_PROVIDER : 'demo',
    twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_MESSAGING_SERVICE_SID),
    smsConfigured: process.env.SMS_PROVIDER === 'textbelt'
      ? Boolean(process.env.TEXTBELT_API_KEY)
      : process.env.SMS_PROVIDER === 'twilio'
        ? Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_MESSAGING_SERVICE_SID)
        : true,
    adminConfigured: Boolean(process.env.ADMIN_PASSWORD || !isProduction),
  });
});

app.post('/api/auth/admin', (request, response) => auth.login(request, response));
app.delete('/api/auth/admin', (request, response) => auth.logout(request, response));
app.get('/api/auth/status', (request, response) => auth.status(request, response));
app.post('/api/auth/player', asyncRoute((request, response) => playerAuth.login(request, response)));
app.delete('/api/auth/player', (request, response) => playerAuth.logout(request, response));
app.get('/api/auth/player/status', asyncRoute((request, response) => playerAuth.status(request, response)));

app.get('/api/leagues/:leagueId', asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  return response.json(league);
}));

app.post('/api/leagues/:leagueId/reset-demo', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (request.params.leagueId !== leagueId) return response.status(404).json({ error: 'Demo league not found.' });
  await store.seedDemo({ force: true });
  return response.json(await store.getLeague(leagueId));
}));

app.patch('/api/players/:playerId/preferences', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  if (request.player.id !== request.params.playerId) return response.status(403).json({ error: 'Players may update only their own preferences.' });
  const allowedSms = ['opted_in', 'opted_out'];
  const allowedChannels = ['sms_and_in_app', 'sms', 'in_app'];
  const allowedTones = ['none', 'light', 'competitive', 'maximum'];
  const input = request.body ?? {};
  if (input.smsConsent && !allowedSms.includes(input.smsConsent)) return response.status(422).json({ error: 'Invalid SMS consent state.' });
  if (input.resultsChannel && !allowedChannels.includes(input.resultsChannel)) return response.status(422).json({ error: 'Invalid results channel.' });
  if (input.trashTalkLevel && !allowedTones.includes(input.trashTalkLevel)) return response.status(422).json({ error: 'Invalid trash-talk level.' });
  const player = await store.updatePlayerPreferences(request.params.playerId, input, 'player');
  if (!player) return response.status(404).json({ error: 'Player not found.' });
  return response.json(player);
}));

/* ── Player registration: name + phone + PIN ── */
app.post('/api/leagues/:leagueId/players/register', asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const name = String(request.body?.name ?? '').trim().slice(0, 50);
  const pin = String(request.body?.pin ?? '').replace(/\D/g, '');
  let digits = String(request.body?.phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);

  if (name.length < 2) return response.status(422).json({ error: 'Enter your name (at least 2 characters).' });
  if (digits.length !== 10) return response.status(422).json({ error: 'Enter a valid 10-digit US phone number for text updates.' });
  if (pin.length !== 4) return response.status(422).json({ error: 'Create a 4-digit PIN.' });
  if ((league.players ?? []).length >= 100) return response.status(422).json({ error: 'This league is full.' });

  const phoneE164 = `+1${digits}`;
  const existing = await store.findPlayerByPhoneE164(phoneE164);
  if (existing) return response.status(409).json({ error: 'That phone number is already registered. Use Sign In instead.' });
  if ((league.players ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return response.status(409).json({ error: 'That name is taken in this league. Add a last initial or nickname.' });
  }

  const at = new Date().toISOString();
  const player = {
    id: `player-${randomUUID()}`,
    name,
    phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    phoneE164,
    // Private friends league: the player entered their own number and consented
    // at signup. STOP via SMS always opts them back out. A production public
    // launch should replace this with OTP verification (Twilio Verify).
    phoneVerifiedAt: at,
    messaging: { smsConsent: 'opted_in', consentedAt: at, resultsChannel: 'sms_and_in_app' },
    trashTalk: { level: 'competitive', updatedAt: at }, // maps to the league's explicit default
  };
  await store.createPlayer(request.params.leagueId, player, hashPin(pin));
  return response.status(201).json({ playerId: player.id, name: player.name });
}));

app.post('/api/leagues/:leagueId/entries', asyncRoute(async (request, response) => {
  const input = request.body ?? {};
  const name = String(input.name ?? '').trim().slice(0, 50);
  const picks = input.picks ?? {};
  if (!name) return response.status(422).json({ error: 'Name is required.' });
  if (!input.paid) return response.status(422).json({ error: 'Payment confirmation is required.' });
  if (!Number.isFinite(Number(input.tiebreaker)) || Number(input.tiebreaker) < 0) return response.status(422).json({ error: 'A valid tiebreaker is required.' });
  const submittedWeek = Number(input.week) || getCurrentWeek();
  const weekGames = getGames(submittedWeek);
  if (!weekGames.length) return response.status(422).json({ error: `No games found for Week ${submittedWeek}.` });
  if (isWeekLocked(submittedWeek)) {
    const deadline = getWeekDeadline(submittedWeek);
    return response.status(422).json({ error: `Week ${submittedWeek} is locked. Sheets were due before the first kickoff${deadline ? ` (${deadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET)` : ''}. See you next week.` });
  }
  const everyPickValid = weekGames.every((game) => picks[game.id] === game.away || picks[game.id] === game.home);
  if (!everyPickValid || Object.keys(picks).length !== weekGames.length) return response.status(422).json({ error: `Exactly ${weekGames.length} valid picks are required for Week ${submittedWeek}.` });
  const sheet = { id: `sheet-${randomUUID()}`, playerId: input.playerId ?? null, name, handle: String(input.handle ?? '').trim().slice(0, 50), picks, tiebreaker: Number(input.tiebreaker), paid: true, week: submittedWeek, submittedAt: new Date().toISOString() };
  await store.createSheet(request.params.leagueId, sheet);
  return response.status(201).json(sheet);
}));

app.put('/api/leagues/:leagueId/results/:gameId', auth.requireAdmin, asyncRoute(async (request, response) => {
  const game = SCHEDULE.flatMap((w) => w.games).find((candidate) => candidate.id === request.params.gameId);
  if (!game) return response.status(404).json({ error: 'Game not found.' });
  const awayScore = Number(request.body?.awayScore);
  const homeScore = Number(request.body?.homeScore);
  if (!Number.isInteger(awayScore) || !Number.isInteger(homeScore) || awayScore < 0 || homeScore < 0 || awayScore === homeScore) return response.status(422).json({ error: 'Enter two different non-negative final scores.' });
  const result = { awayScore, homeScore, winner: awayScore > homeScore ? game.away : game.home };
  return response.json(await store.upsertResult(request.params.leagueId, game.id, result, request.actor));
}));

app.post('/api/leagues/:leagueId/recaps/generate', auth.requireAdmin, asyncRoute(async (request, response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here');
  const aiClient = geminiConfigured ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
  const recap = await generateWeeklyRecap({ store, leagueId: request.params.leagueId, aiClient, model, actor: request.actor });
  return response.status(201).json(recap);
}));

app.post('/api/recaps/:recapId/approve', auth.requireAdmin, asyncRoute(async (request, response) => {
  const recap = await approveRecap({ store, recapId: request.params.recapId, text: request.body?.text, actor: request.actor });
  return response.json(recap);
}));

app.post('/api/leagues/:leagueId/broadcasts', auth.requireAdmin, asyncRoute(async (request, response) => {
  const provider = createSmsProvider(process.env);
  const broadcast = await sendApprovedRecap({ store, leagueId: request.params.leagueId, recapId: request.body?.recapId, provider, actor: request.actor });
  return response.status(201).json(broadcast);
}));

app.post('/api/leagues/:leagueId/side-bets', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const bet = await createSideBet({ store, leagueId: request.params.leagueId, input: { ...(request.body ?? {}), creatorId: request.player.id }, actor: request.player.id });
  return response.status(201).json(bet);
}));

app.post('/api/side-bets/:betId/respond', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const bet = await respondToSideBet({ store, betId: request.params.betId, playerId: request.player.id, decision: request.body?.decision, counterTerms: request.body?.counterTerms });
  return response.json(bet);
}));

app.post('/api/side-bets/:betId/settle', auth.requireAdmin, asyncRoute(async (request, response) => {
  const bet = await settleSideBetFromLeague({ store, betId: request.params.betId, actor: request.actor });
  return response.json(bet);
}));

app.post('/api/leagues/:leagueId/chat', asyncRoute(async (request, response) => {
  const name = String(request.body?.name ?? '').trim().slice(0, 40);
  const msg = String(request.body?.msg ?? '').trim().slice(0, 400);
  if (!name || !msg) return response.status(422).json({ error: 'Name and message are required.' });
  const message = { id: `chat-${randomUUID()}`, playerId: request.body?.playerId ?? null, name, msg, time: new Date().toISOString() };
  await store.addChatMessage(request.params.leagueId, message);
  return response.status(201).json(message);
}));

app.post('/api/webhooks/twilio/status', asyncRoute(async (request, response) => {
  const twilio = await getTwilioModule();
  const signature = request.get('X-Twilio-Signature');
  const webhookUrl = `${process.env.APP_BASE_URL ?? ''}${request.originalUrl}`;
  if (!twilio || !process.env.TWILIO_AUTH_TOKEN || !signature || !twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, webhookUrl, request.body)) return response.status(403).send('Invalid signature');
  await applyDeliveryStatus({ store, providerMessageId: request.body.MessageSid, status: request.body.MessageStatus, errorCode: request.body.ErrorCode || null });
  return response.status(204).end();
}));

app.post('/api/webhooks/twilio/inbound', asyncRoute(async (request, response) => {
  const twilio = await getTwilioModule();
  const signature = request.get('X-Twilio-Signature');
  const webhookUrl = `${process.env.APP_BASE_URL ?? ''}${request.originalUrl}`;
  if (!twilio || !process.env.TWILIO_AUTH_TOKEN || !signature || !twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, webhookUrl, request.body)) return response.status(403).send('Invalid signature');
  const player = await store.findPlayerByPhoneE164(request.body.From);
  const optOutType = request.body.OptOutType;
  if (player && (optOutType === 'STOP' || optOutType === 'START')) await store.updatePlayerPreferences(player.id, { smsConsent: optOutType === 'STOP' ? 'opted_out' : 'opted_in' }, 'twilio_webhook');
  response.type('text/xml');
  return response.send('<Response></Response>');
}));

/* ── Jack Assistant ── */

function computeWeeklyRecord(player, league, weekNumber) {
  const weekSheets = (league.sheets ?? []).filter((s) => s.week === weekNumber && s.playerId === player.id);
  if (!weekSheets.length) return null;
  const sheet = weekSheets[0];
  const weekGames = getGames(weekNumber);
  const correct = Object.entries(sheet.picks ?? {}).reduce((n, [gid, pick]) => n + ((league.results ?? {})[gid]?.winner === pick ? 1 : 0), 0);
  const total = weekGames.length;
  const leaderboard = buildLeaderboard(league.players, (league.sheets ?? []).filter((s) => s.week === weekNumber), league.results);
  const entry = leaderboard.find((e) => e.playerId === player.id);
  const isWinner = leaderboard.length > 0 && leaderboard[0].playerId === player.id;
  return { week: weekNumber, correct, incorrect: total - correct, weeklyWinner: isWinner, seasonRank: entry?.rank ?? null };
}

function buildSeasonMemories(league, currentWeek) {
  const memories = [];
  for (const player of (league.players ?? [])) {
    const weeklyRecords = [];
    for (let w = 1; w <= currentWeek; w++) {
      const record = computeWeeklyRecord(player, league, w);
      if (record) weeklyRecords.push(record);
    }
    if (!weeklyRecords.length) continue;
    const memory = buildPlayerSeasonMemory({ player, weeklyRecords });
    const policy = resolveJackRoastPolicy({ player, leagueSettings: league.settings });
    memories.push({
      playerId: player.id,
      name: player.name,
      ...memory,
      roastLevel: policy.effectiveLevel === 'off' ? 'clean' : policy.effectiveLevel,
    });
  }
  return memories;
}

/**
 * The reigning champion: the winner of the most recent FULLY VERIFIED week.
 * They stay celebrated (and roast-immune) all week until the next week's
 * results are verified and a new winner takes the crown.
 */
function computeWinnerRecognition(league, currentWeek) {
  const jackSettings = normalizeJackSettings(league.settings);
  for (let w = currentWeek; w >= 1; w -= 1) {
    const weekSheets = (league.sheets ?? []).filter((s) => s.week === w);
    if (!weekSheets.length) continue;
    const weekGames = getGames(w);
    const verifiedCount = weekGames.filter((g) => (league.results ?? {})[g.id]?.winner && (league.results ?? {})[g.id]?.verifiedAt).length;
    const verified = verifiedCount === weekGames.length && weekGames.length > 0;
    if (!verified) continue;
    const leaderboard = buildLeaderboard(league.players, weekSheets, league.results);
    const recognition = buildWeeklyWinnerRecognition({
      leaderboard: leaderboard.map((e) => ({ playerId: e.playerId, name: e.name, score: e.score, tiebreaker: e.tiebreaker })),
      verified,
      celebrationsEnabled: jackSettings.winnerCelebrations,
    });
    if (recognition.status === 'winner' || recognition.status === 'co_winners') {
      return { ...recognition, week: w, reigning: w < currentWeek };
    }
  }
  const currentSheets = (league.sheets ?? []).filter((s) => s.week === currentWeek);
  if (!currentSheets.length) return null;
  return { status: 'pending', winners: [], protectedPlayerIds: [], week: currentWeek, reigning: false, message: 'Winner pending. Jack will wait for verified final results.' };
}

app.post('/api/leagues/:leagueId/assistant', asyncRoute(async (request, response) => {
  const question = String(request.body?.question ?? '').trim().slice(0, 500);
  if (!question) return response.status(422).json({ error: 'A question is required.' });

  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here');
  const currentWeek = getCurrentWeek();
  const weekGames = getGames(currentWeek);
  const weekLabel = SCHEDULE.find((w) => w.week === currentWeek)?.label ?? `Week ${currentWeek}`;

  // Build season memories and winner recognition
  const playerMemories = buildSeasonMemories(league, currentWeek);
  const winnerRecognition = computeWinnerRecognition(league, currentWeek);
  const winnerIds = new Set(winnerRecognition?.protectedPlayerIds ?? []);

  // Build scored standings with roast levels
  const leaderboard = buildLeaderboard(league.players, (league.sheets ?? []).filter((s) => s.week === currentWeek), league.results);
  const standings = leaderboard.slice(0, 20).map((entry) => {
    const player = (league.players ?? []).find((p) => p.id === entry.playerId);
    const policy = player ? resolveJackRoastPolicy({ player, leagueSettings: league.settings, isWinner: winnerIds.has(entry.playerId) }) : null;
    return {
      id: entry.playerId || entry.id,
      name: entry.name,
      score: entry.score,
      tiebreaker: entry.tiebreaker,
      pickCount: Object.keys(entry.picks ?? {}).length,
      roastLevel: policy ? (policy.effectiveLevel === 'off' ? 'clean' : policy.effectiveLevel) : 'clean',
      roastEligible: policy ? policy.roastAllowed : false,
    };
  });

  // Find current player if authenticated
  const currentPlayerId = request.body?.playerId ?? null;
  const currentPlayer = currentPlayerId ? (league.players ?? []).find((p) => p.id === currentPlayerId) : null;
  let currentPlayerContext = null;
  if (currentPlayer) {
    const policy = resolveJackRoastPolicy({ player: currentPlayer, leagueSettings: league.settings, isWinner: winnerIds.has(currentPlayer.id) });
    const memory = playerMemories.find((m) => m.playerId === currentPlayer.id);
    currentPlayerContext = {
      id: currentPlayer.id,
      name: currentPlayer.name,
      favoriteTeam: normalizePlayerJackPolicy(currentPlayer).favoriteTeam,
      roastLevel: policy.effectiveLevel === 'off' ? 'clean' : policy.effectiveLevel,
      seasonMemory: memory ?? null,
    };
  }

  const context = {
    name: league.name || 'BETIT League',
    season: SEASON,
    week: currentWeek,
    weekLabel,
    totalGames: weekGames.length,
    standings,
    games: weekGames.map((g) => {
      const r = (league.results ?? {})[g.id];
      return { id: g.id, matchup: `${g.away} at ${g.home}`, winner: r?.winner ?? null, awayScore: r?.awayScore ?? null, homeScore: r?.homeScore ?? null };
    }),
    rules: [
      `Entry fee: $${league.settings?.entryFee ?? 25} per sheet.`,
      `Pick one winner for every game (straight up, no spread).`,
      `One point per correct pick. Highest total wins the weekly pot.`,
      `Tiebreaker: closest total without going over. Going over busts.`,
      `DEADLINE: sheets lock at the first kickoff of each week${(() => { const d = getWeekDeadline(currentWeek); return d ? ` — ${weekLabel} locks ${d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : ''; })()}. Late sheets are rejected — remind players who haven't submitted.`,
      `SEASON POOL: $${league.settings?.seasonPool?.entryFee ?? 25} per player, one-time. The player with the best record for the season wins the whole season pot after Week 18.`,
      `SURVIVOR POOL: pick one team to win each week, never reuse a team all season. A loss eliminates you. Last one standing wins.`,
    ],
    seasonPool: (() => {
      const pool = league.settings?.seasonPool ?? { entryFee: 25, paidPlayerIds: [] };
      return { entryFee: pool.entryFee, paidCount: (pool.paidPlayerIds ?? []).length, pot: (pool.paidPlayerIds ?? []).length * pool.entryFee };
    })(),
    submissionDeadline: getWeekDeadline(currentWeek)?.toISOString() ?? null,
    submissionLocked: isWeekLocked(currentWeek),
    availableFeatures: ['Weekly picks', 'League standings', 'Chat', 'AI recap', 'Pick sheet review', 'Trash-talk assist', 'Side bets'],
    currentPlayer: currentPlayerContext,
    playerMemories: playerMemories.map((m) => ({
      name: m.name,
      totalPicks: m.totalPicks,
      correct: m.correct,
      incorrect: m.incorrect,
      winPercentage: m.winPercentage,
      seasonRank: m.seasonRank,
      currentStreak: m.currentStreak,
      longestWinningStreak: m.longestWinningStreak,
      longestLosingStreak: m.longestLosingStreak,
      bestWeek: m.bestWeek,
      worstWeek: m.worstWeek,
      upsetPicksWon: m.upsetPicksWon,
      roastLevel: m.roastLevel,
      isWinner: winnerIds.has(m.playerId),
    })),
    weeklyWinner: winnerRecognition,
  };

  // Ground Jack in the latest NFL wire (injuries, statuses, team news).
  try {
    const news = await fetchNflNews();
    context.nflNews = (news.items ?? []).slice(0, 6).map((item) => ({ headline: item.headline, description: item.description, published: item.published }));
  } catch { context.nflNews = []; }

  const history = Array.isArray(request.body?.history) ? request.body.history.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: String(m.text ?? '').slice(0, 500),
  })).filter((m) => m.text) : [];

  if (!geminiConfigured) {
    const fallback = buildLocalAssistantFallback(question, context);
    return response.json({ text: fallback, source: 'local_fallback' });
  }

  try {
    const { buildPrompt } = await import('./prompts.js');
    const { systemInstruction, prompt } = buildPrompt('assistant', { question, history, context });
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await client.models.generateContent({
      model,
      contents: prompt,
      config: { systemInstruction, temperature: 0.5, maxOutputTokens: 400 },
    });
    const text = result?.text?.trim();
    if (!text) throw new Error('Empty response from model.');
    return response.json({ text, source: 'gemini' });
  } catch (error) {
    console.error('Assistant error:', error.message);
    const fallback = buildLocalAssistantFallback(question, context);
    return response.json({ text: fallback, source: 'local_fallback' });
  }
}));

function buildLocalAssistantFallback(question, context) {
  const q = question.toLowerCase();
  if (q.includes('standing') || q.includes('winning') || q.includes('leader')) {
    if (!context.standings?.length) return `Ain't nobody locked in sheets for ${context.weekLabel} yet, bruh. Once players submit, the Board tab will light up.`;
    const top = context.standings.slice(0, 5).map((s, i) => `${i + 1}. ${s.name} — ${s.score} correct (TB ${s.tiebreaker})`).join('\n');
    const winnerLine = context.weeklyWinner?.status === 'winner' ? `\n\nChamp of the week: ${context.weeklyWinner.winners[0]?.name}. That boy cooked. Respect the work.` : '';
    return `Here's the standings for ${context.weekLabel}:\n${top}${winnerLine}\n\nHit the Board tab for live updates.`;
  }
  if (q.includes('rule') || q.includes('how') || q.includes('work')) {
    return `Aight, here's how we run it: ${context.rules.join(' ')}`;
  }
  if (q.includes('game') || q.includes('schedule') || q.includes('matchup')) {
    const completed = context.games.filter((g) => g.winner).length;
    return `${context.weekLabel} got ${context.totalGames} games on the board. ${completed} already in the books. Hit the Picks tab and get your sheet right.`;
  }
  if (q.includes('streak') || q.includes('record') || q.includes('season') || q.includes('stat')) {
    const memories = context.playerMemories ?? [];
    if (!memories.length) return `No season stats yet, dawg. Once we get a few weeks in, I'll have the full scouting report on everybody.`;
    const top = memories.slice(0, 5).map((m) => `${m.name}: ${m.winPercentage}% (${m.correct}/${m.totalPicks}), streak ${m.currentStreak?.type} ${m.currentStreak?.length}`).join('\n');
    return `Season stats so far:\n${top}`;
  }
  return `What's good — I"m Jack, your league's AI commissioner. I got standings, rules, schedules, season stats, all of it. The Gemini API ain"t hooked up yet so I'm running on local smarts. Drop GEMINI_API_KEY in the env and watch me really go to work.`;
}

/* ── Jack Settings (Admin) ── */
app.patch('/api/leagues/:leagueId/jack-settings', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const input = request.body ?? {};
  const current = league.settings ?? {};
  const jackUpdate = { ...(current.jack ?? {}), ...input };
  // Validate roast cap
  if (input.globalRoastCap && !['clean', 'pg13', 'explicit', 'target'].includes(input.globalRoastCap)) {
    return response.status(422).json({ error: 'Invalid globalRoastCap. Must be clean, pg13, explicit, or target.' });
  }
  const normalized = normalizeJackSettings(jackUpdate);
  const updatedSettings = { ...current, jack: normalized };
  await store.updateLeagueSettings(request.params.leagueId, updatedSettings);
  return response.json({ jack: normalized });
}));

app.patch('/api/leagues/:leagueId/players/:playerId/jack-policy', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const player = (league.players ?? []).find((p) => p.id === request.params.playerId);
  if (!player) return response.status(404).json({ error: 'Player not found.' });
  const input = request.body ?? {};
  if (input.adminAssignedLevel && !['clean', 'pg13', 'explicit', 'target'].includes(input.adminAssignedLevel)) {
    return response.status(422).json({ error: 'Invalid adminAssignedLevel.' });
  }
  const currentPolicy = normalizePlayerJackPolicy(player);
  const updated = {
    ...currentPolicy,
    ...(input.adminAssignedLevel ? { adminAssignedLevel: input.adminAssignedLevel } : {}),
    ...(typeof input.roastEnabled === 'boolean' ? { roastEnabled: input.roastEnabled } : {}),
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  };
  const trashTalk = { ...(player.trashTalk ?? {}), jackPolicy: updated };
  await store.updatePlayerPreferences(request.params.playerId, { trashTalk }, 'admin');
  const resolved = resolveJackRoastPolicy({ player: { ...player, trashTalk }, leagueSettings: league.settings });
  return response.json({ jackPolicy: updated, resolved });
}));

/* ── Jack Weekly Roast Generation ── */
app.post('/api/leagues/:leagueId/jack/weekly-roast', auth.requireAdmin, asyncRoute(async (request, response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here');
  if (!geminiConfigured) return response.status(503).json({ error: 'Gemini API key is not configured.' });

  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const currentWeek = getCurrentWeek();
  const weekGames = getGames(currentWeek);
  const playerMemories = buildSeasonMemories(league, currentWeek);
  const winnerRecognition = computeWinnerRecognition(league, currentWeek);
  const winnerIds = new Set(winnerRecognition?.protectedPlayerIds ?? []);

  const leaderboard = buildLeaderboard(league.players, (league.sheets ?? []).filter((s) => s.week === currentWeek), league.results);
  const { buildPrompt } = await import('./prompts.js');
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const roasts = [];
  for (const entry of leaderboard) {
    const player = (league.players ?? []).find((p) => p.id === entry.playerId);
    const policy = player ? resolveJackRoastPolicy({ player, leagueSettings: league.settings, isWinner: winnerIds.has(entry.playerId) }) : null;
    const memory = playerMemories.find((m) => m.playerId === entry.playerId);
    const isWinner = winnerIds.has(entry.playerId);

    const { systemInstruction, prompt } = buildPrompt('weeklyRoast', {
      playerName: entry.name,
      roastLevel: policy ? (policy.effectiveLevel === 'off' ? 'clean' : policy.effectiveLevel) : 'clean',
      isWinner,
      seasonMemory: memory ?? null,
      weekScore: entry.score,
      weekTotal: weekGames.length,
      weekRank: entry.rank,
    });

    try {
      const result = await client.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction, temperature: 0.7, maxOutputTokens: 200 },
      });
      roasts.push({ playerId: entry.playerId, name: entry.name, text: result?.text?.trim() ?? '', isWinner, roastLevel: policy?.effectiveLevel ?? 'clean' });
    } catch (err) {
      roasts.push({ playerId: entry.playerId, name: entry.name, text: '', isWinner, roastLevel: policy?.effectiveLevel ?? 'clean', error: err.message });
    }
  }

  return response.json({ week: currentWeek, roasts, winner: winnerRecognition });
}));

/* ── NFL Wire: injuries, player statuses, team news (ESPN, 5-min cache) ── */
let newsCache = { at: 0, data: null };

async function fetchNflNews() {
  if (newsCache.data && Date.now() - newsCache.at < 300_000) return newsCache.data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const upstream = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=14', { signal: controller.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!upstream.ok) throw new Error(`ESPN news responded ${upstream.status}`);
    const payload = await upstream.json();
    const items = (payload?.articles ?? []).slice(0, 14).map((article) => ({
      headline: String(article.headline ?? '').slice(0, 160),
      description: String(article.description ?? '').slice(0, 240),
      type: String(article.type ?? 'news').slice(0, 30),
      published: article.published ?? null,
      url: article.links?.web?.href ?? null,
    })).filter((item) => item.headline);
    const data = { fetchedAt: new Date().toISOString(), items };
    newsCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error('NFL news unavailable:', error.message);
    if (newsCache.data) return newsCache.data;
    return { fetchedAt: new Date().toISOString(), items: [], error: 'news_unavailable' };
  }
}

app.get('/api/nfl-news', asyncRoute(async (_request, response) => response.json(await fetchNflNews())));

/* ── Live Scores (ESPN scoreboard, 30s cache) ── */
const liveScoreCache = new Map();
const ESPN_ABBR_FIXES = { WSH: 'WAS' };

async function fetchLiveScores(week) {
  const cached = liveScoreCache.get(week);
  if (cached && Date.now() - cached.at < 30_000) return cached.data;

  const weekGames = getGames(week);
  const empty = { week, fetchedAt: new Date().toISOString(), anyLive: false, scores: [] };
  if (!weekGames.length) return empty;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${SEASON}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!upstream.ok) throw new Error(`ESPN responded ${upstream.status}`);
    const payload = await upstream.json();

    const byMatchup = new Map(weekGames.map((g) => [`${g.away}@${g.home}`, g.id]));
    const scores = [];
    for (const event of payload?.events ?? []) {
      const competition = event?.competitions?.[0];
      if (!competition) continue;
      const competitors = competition.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === 'home');
      const away = competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;
      const homeAbbr = ESPN_ABBR_FIXES[home.team?.abbreviation] ?? home.team?.abbreviation;
      const awayAbbr = ESPN_ABBR_FIXES[away.team?.abbreviation] ?? away.team?.abbreviation;
      const gameId = byMatchup.get(`${awayAbbr}@${homeAbbr}`);
      if (!gameId) continue;
      const statusType = event.status?.type ?? {};
      scores.push({
        gameId,
        away: awayAbbr,
        home: homeAbbr,
        awayScore: Number(away.score ?? 0),
        homeScore: Number(home.score ?? 0),
        state: statusType.state ?? 'pre', // pre | in | post
        detail: statusType.shortDetail ?? '',
        clock: competition.status?.displayClock ?? event.status?.displayClock ?? '',
        period: competition.status?.period ?? event.status?.period ?? 0,
        completed: Boolean(statusType.completed),
      });
    }
    const data = { week, fetchedAt: new Date().toISOString(), anyLive: scores.some((s) => s.state === 'in'), scores };
    liveScoreCache.set(week, { at: Date.now(), data });
    return data;
  } catch (error) {
    console.error('Live scores unavailable:', error.message);
    if (cached) return cached.data;
    return { ...empty, error: 'live_scores_unavailable' };
  }
}

app.get('/api/leagues/:leagueId/live-scores', asyncRoute(async (request, response) => {
  const week = Number(request.query.week) || getCurrentWeek();
  const data = await fetchLiveScores(week);

  // AUTO-SCORING: the app keeps score on its own. Any game the feed reports
  // as final is verified automatically the next time anyone loads scores.
  // The commissioner's manual entry still works and always wins (it re-verifies).
  const finals = data.scores.filter((s) => s.state === 'post' && s.completed && s.awayScore !== s.homeScore);
  let autoVerified = 0;
  if (finals.length) {
    const league = await store.getLeague(request.params.leagueId);
    if (league) {
      for (const score of finals) {
        const existing = (league.results ?? {})[score.gameId];
        if (existing?.winner && existing?.verifiedAt) continue;
        const winner = score.awayScore > score.homeScore ? score.away : score.home;
        await store.upsertResult(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner }, 'live_feed_auto');
        autoVerified += 1;
      }
    }
  }
  return response.json({ ...data, autoVerified });
}));

/* ── Auto score verification: pull finals from the live feed ── */
app.post('/api/leagues/:leagueId/results/sync', auth.requireAdmin, asyncRoute(async (request, response) => {
  const week = Number(request.body?.week) || getCurrentWeek();
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const feed = await fetchLiveScores(week);
  if (feed.error) return response.status(502).json({ error: 'The live score feed is unreachable right now. Enter finals manually or try again shortly.' });

  const finals = feed.scores.filter((s) => s.state === 'post' && s.completed && s.awayScore !== s.homeScore);
  const applied = [];
  const skipped = [];
  for (const score of finals) {
    const existing = (league.results ?? {})[score.gameId];
    if (existing?.winner && existing?.verifiedAt && !request.body?.force) { skipped.push(score.gameId); continue; }
    const winner = score.awayScore > score.homeScore ? score.away : score.home;
    await store.upsertResult(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner }, `${request.actor} (live feed)`);
    applied.push({ gameId: score.gameId, matchup: `${score.away} at ${score.home}`, final: `${score.awayScore}–${score.homeScore}`, winner });
  }
  return response.json({ week, applied, appliedCount: applied.length, alreadyVerified: skipped.length, liveInProgress: feed.scores.filter((s) => s.state === 'in').length });
}));

/* ── Pick reminders: text players who haven't submitted a sheet ── */
app.post('/api/leagues/:leagueId/reminders/picks', auth.requireAdmin, asyncRoute(async (request, response) => {
  const week = Number(request.body?.week) || getCurrentWeek();
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  if (isWeekLocked(week)) return response.status(422).json({ error: `Week ${week} is already locked — reminders would only rub it in.` });

  const submitted = new Set((league.sheets ?? []).filter((s) => s.week === week && s.playerId).map((s) => s.playerId));
  const missing = (league.players ?? []).filter((p) => !submitted.has(p.id));
  if (!missing.length) return response.json({ week, sent: 0, message: 'Every player already has a sheet in. The league is disturbingly responsible.' });

  const deadline = getWeekDeadline(week);
  const hoursLeft = deadline ? Math.max(1, Math.round((deadline.getTime() - Date.now()) / 3_600_000)) : null;
  const when = deadline ? deadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'first kickoff';
  const messages = missing.map((p) => ({
    playerId: p.id,
    text: `🏈 BETIT: Ayo, it's Jack. Week ${week} sheets lock at ${when}${hoursLeft ? ` (~${hoursLeft}h)` : ''}. Yours is blank, dawg. You trippin if you think I won't clown you for a no-show. Get your picks in.`,
  }));
  const provider = createSmsProvider(process.env);
  const broadcast = await sendJackBroadcast({ store, leagueId: request.params.leagueId, provider, messages, actor: request.actor, kind: 'pick_reminder' });
  return response.status(201).json({ week, missing: missing.map((p) => p.name), broadcast });
}));

/* ── Jack SMS Broadcast: results + roasts to every opted-in player ── */
app.post('/api/leagues/:leagueId/jack/broadcast', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const currentWeek = getCurrentWeek();
  const weekGames = getGames(currentWeek);
  const winnerRecognition = computeWinnerRecognition(league, currentWeek);
  const winnerIds = new Set(winnerRecognition?.protectedPlayerIds ?? []);
  const playerMemories = buildSeasonMemories(league, currentWeek);
  const leaderboard = buildLeaderboard(league.players, (league.sheets ?? []).filter((s) => s.week === currentWeek), league.results);

  const finals = weekGames
    .map((g) => ({ g, r: (league.results ?? {})[g.id] }))
    .filter(({ r }) => r?.winner)
    .map(({ g, r }) => `${g.away} ${r.awayScore}–${r.homeScore} ${g.home}`);
  const resultsLine = finals.length ? `Finals: ${finals.slice(0, 6).join(' | ')}${finals.length > 6 ? ` +${finals.length - 6} more` : ''}.` : 'No finals posted yet.';
  const champLine = winnerRecognition?.winners?.length
    ? `👑 ${winnerRecognition.winners.map((w) => w.name).join(' & ')} run${winnerRecognition.winners.length > 1 ? '' : 's'} the league this week. All hail.`
    : '';

  // SMS is a carrier channel, not the private age-gated in-app space, so
  // texted roasts are capped at PG-13 no matter the player's in-app level.
  const smsRoastLine = (entry, memory, isWinner) => {
    if (isWinner) return `${entry.name.split(' ')[0]}, that's you on top. Jack got nothing but love for the champ this week.`;
    const score = `${entry.score}/${weekGames.length}`;
    const streak = memory?.currentStreak?.type === 'loss' && memory.currentStreak.length > 1 ? ` That's ${memory.currentStreak.length} rough weeks in a row, bruh.` : '';
    return `Jack's verdict: ${score}. That sheet had confidence and not much else, dawg.${streak} Full roast waiting in the app.`;
  };

  const messages = [];
  for (const entry of leaderboard) {
    const player = (league.players ?? []).find((p) => p.id === entry.playerId);
    if (!player) continue;
    const policy = resolveJackRoastPolicy({ player, leagueSettings: league.settings, isWinner: winnerIds.has(entry.playerId) });
    const memory = playerMemories.find((m) => m.playerId === entry.playerId);
    const isWinner = winnerIds.has(entry.playerId);
    const roast = policy.roastAllowed || isWinner ? smsRoastLine(entry, memory, isWinner) : `Week ${currentWeek} score: ${entry.score}/${weekGames.length}.`;
    const text = [`🏈 BETIT Week ${currentWeek} from Jack:`, resultsLine, champLine, roast].filter(Boolean).join(' ');
    messages.push({ playerId: entry.playerId, text: text.slice(0, 480) });
  }

  if (!messages.length) return response.status(422).json({ error: 'No entries this week — nothing to broadcast.' });

  const provider = createSmsProvider(process.env);
  const broadcast = await sendJackBroadcast({ store, leagueId: request.params.leagueId, provider, messages, actor: request.actor, kind: 'jack_weekly_text' });

  // Jack also holds court in the GROUP CHAT — the in-app league chat is the
  // private, consent-aware space, so roasts land here at each player's FULL
  // assigned level (SMS stays capped at PG-13).
  const chatLines = [[`🎙️ WEEK ${currentWeek} FINAL WORD FROM JACK`, resultsLine, champLine].filter(Boolean).join(' ')];
  for (const entry of leaderboard.slice(0, 10)) {
    const player = (league.players ?? []).find((p) => p.id === entry.playerId);
    if (!player) continue;
    const isWinner = winnerIds.has(entry.playerId);
    const roast = previewJackRoast({ player, leagueSettings: league.settings, isWinner, fact: { correct: entry.score, incorrect: weekGames.length - entry.score } });
    if (roast.state === 'protected' && !isWinner) continue; // opted-out players get no chat callout
    chatLines.push(roast.text);
  }
  const chatPosts = [];
  for (const line of chatLines) {
    const message = { id: `chat-${randomUUID()}`, playerId: null, name: 'Jack 🎙️', msg: String(line).slice(0, 400), time: new Date().toISOString() };
    await store.addChatMessage(request.params.leagueId, message);
    chatPosts.push(message.id);
  }

  return response.status(201).json({ ...broadcast, chatPosts: chatPosts.length });
}));

/* ── Survivor pool ── */
app.post('/api/leagues/:leagueId/survivor/pick', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week) || getCurrentWeek();
  const team = String(request.body?.team ?? '').toUpperCase().slice(0, 3);

  const { validateSurvivorPick } = await import('../src/survivor.js');
  const verdict = validateSurvivorPick({
    playerId: request.player.id,
    week,
    team,
    survivorPicks: league.survivorPicks ?? [],
    results: league.results ?? {},
    players: league.players ?? [],
    isWeekLocked,
  });
  if (!verdict.ok) return response.status(422).json({ error: verdict.error });

  const pick = { playerId: request.player.id, week, team, pickedAt: new Date().toISOString() };
  await store.saveSurvivorPick(request.params.leagueId, pick);
  return response.status(201).json(pick);
}));

/* ── Season pool: $25 per player, best season record takes it all ── */
app.patch('/api/leagues/:leagueId/season-pool', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const current = league.settings?.seasonPool ?? { entryFee: 25, paidPlayerIds: [] };
  const entryFee = request.body?.entryFee != null ? Number(request.body.entryFee) : current.entryFee;
  if (!Number.isFinite(entryFee) || entryFee < 0 || entryFee > 1000) return response.status(422).json({ error: 'Season entry fee must be between $0 and $1000.' });
  const validIds = new Set((league.players ?? []).map((p) => p.id));
  const paidPlayerIds = Array.isArray(request.body?.paidPlayerIds)
    ? [...new Set(request.body.paidPlayerIds.filter((id) => validIds.has(id)))]
    : current.paidPlayerIds ?? [];
  const seasonPool = { entryFee, paidPlayerIds, updatedAt: new Date().toISOString() };
  await store.updateLeagueSettings(request.params.leagueId, { ...(league.settings ?? {}), seasonPool });
  return response.json({ seasonPool });
}));

/* ── Payout tracking ── */
app.post('/api/leagues/:leagueId/payouts', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week);
  const amount = Number(request.body?.amount);
  if (!Number.isInteger(week) || week < 1 || week > 18) return response.status(422).json({ error: 'A valid week (1–18) is required.' });
  if (!Number.isFinite(amount) || amount <= 0) return response.status(422).json({ error: 'A positive payout amount is required.' });
  if ((league.payouts ?? []).some((p) => p.week === week && p.pool === (request.body?.pool ?? 'weekly'))) {
    return response.status(409).json({ error: `Week ${week} is already marked paid.` });
  }
  const payout = {
    id: `payout-${randomUUID()}`,
    week,
    pool: ['weekly', 'survivor', 'season'].includes(request.body?.pool) ? request.body.pool : 'weekly',
    amount,
    winnerNames: Array.isArray(request.body?.winnerNames) ? request.body.winnerNames.map((n) => String(n).slice(0, 50)).slice(0, 10) : [],
    method: String(request.body?.method ?? 'cash').slice(0, 30),
    note: String(request.body?.note ?? '').slice(0, 200),
    paidAt: new Date().toISOString(),
    paidBy: request.actor,
  };
  await store.savePayout(request.params.leagueId, payout);
  return response.status(201).json(payout);
}));

/* ── Jack voice (server-side TTS; API key never reaches the browser) ── */
app.post('/api/tts', asyncRoute(async (request, response) => {
  const { createJackTtsProvider } = await import('./ttsService.js');
  const provider = createJackTtsProvider(process.env);
  if (!provider.configured) return response.status(503).json({ error: 'Server voice is not configured. The browser voice fallback will be used.', fallback: 'browser' });
  try {
    const { contentType, bytes } = await provider.synthesize({ text: request.body?.text, speed: request.body?.speed });
    response.set('Content-Type', contentType);
    response.set('Cache-Control', 'no-store');
    return response.send(bytes);
  } catch (error) {
    console.error('TTS error:', error.message);
    return response.status(502).json({ error: 'Voice synthesis failed. Falling back to browser voice.', fallback: 'browser' });
  }
}));

app.post('/api/gemini', asyncRoute(async (request, response) => {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_api_key_here') return response.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to .env and restart the server.' });
  const { generateGeminiText } = await import('./geminiService.js');
  const generated = await generateGeminiText({ client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), model, action: request.body?.action, payload: request.body?.payload });
  return response.json(generated);
}));

if (isProduction && !process.env.VERCEL) {
  app.use(express.static(path.join(projectRoot, 'dist')));
  app.use((_request, response) => response.sendFile(path.join(projectRoot, 'dist', 'index.html')));
}

app.use((error, _request, response, _next) => {
  const known = error instanceof WorkflowError || error instanceof ModerationError;
  console.error('Request failed:', error.message);
  response.status(known ? (error.status ?? 422) : 500).json({ error: known ? error.message : 'The server could not complete that request.', ...(error.code ? { code: error.code } : {}) });
});

export default app;

if (!process.env.VERCEL) {
  const server = app.listen(port, () => console.log(`League API listening on http://localhost:${port} (${path.basename(databasePath)})`));
  const shutdown = () => server.close(() => Promise.resolve(store.close()).finally(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
