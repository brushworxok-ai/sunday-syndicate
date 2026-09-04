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
import { normalizePayment, preferredHandle } from '../src/payment.js';

/* Profile pictures: a short emoji or a small data-URL image (the client
   downsizes to 256px JPEG, ~30 KB). Never silently truncate a data URL —
   that produces a broken image. */
const AVATAR_MAX_CHARS = 160_000;
function validateAvatar(value) {
  if (typeof value !== 'string') return { error: 'Invalid profile picture.' };
  const text = value.trim();
  if (!text) return { avatar: null };
  if (text.startsWith('data:image/')) {
    if (text.length > AVATAR_MAX_CHARS) return { error: 'That photo is too large. Try a smaller image.' };
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(text)) return { error: 'Unsupported image format.' };
    return { avatar: text };
  }
  if (text.length <= 8 && !/[<>"'&]/.test(text)) return { avatar: text };
  return { error: 'Invalid profile picture.' };
}
import { SCHEDULE, getGames, getCurrentWeek, getWeekDeadline, isWeekLocked, DEADLINE_HOURS_BEFORE_KICKOFF, SEASON, WEEK, TEAMS, ENTRY_FEE } from '../src/data.js';
import { createLeagueStore } from './storeFactory.js';
import { buildLeagueView } from './publicLeagueView.js';
import { ModerationError } from './moderation.js';
import { DEMO_LEAGUE, buildLeaderboard, scoreSheet } from '../src/demoLeague.js';
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
  calculateLeagueFacts,
  createSideBet,
  generateWeeklyRecap,
  respondToSideBet,
  settleSideBetFromLeague,
} from './leagueService.js';
import { applyDeliveryStatus, createSmsProvider, sendTextBeltRaw, sendApprovedRecap, sendJackBroadcast } from './messagingService.js';
import { verifyTelnyxWebhook, telnyxDeliveryEvent } from './telnyxWebhook.js';
import { sendCommissionerSmsTest } from './smsTest.js';
import { hasCurrentSmsConsent, SMS_CONSENT_VERSION } from '../src/smsCompliance.js';
import { parseNflInjuries } from './nflInjuries.js';
import { validatePushSubscription, savePlayerSubscription, removePlayerSubscription, deliverPush, subscriptionsFor } from './pushService.js';
import { randomInt } from 'node:crypto';
import { DEFAULT_JACK_MODEL, formatNflNews, jackGenerationTuning, questionNeedsNflNews } from './jackAssistant.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const port = Number(process.env.PORT) || 8787;
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const jackModel = process.env.JACK_GEMINI_MODEL || DEFAULT_JACK_MODEL;
const databasePath = process.env.DATABASE_PATH || path.join(projectRoot, 'work', 'sunday-syndicate.sqlite');
const store = await createLeagueStore({ databaseUrl: process.env.DATABASE_URL, databasePath });
const { makeGeminiKeyResolver, invalidateGeminiKeyCache } = await import('./geminiKey.js');
const getGeminiKey = makeGeminiKeyResolver(store);
await store.seedDemo();

const isProduction = process.env.NODE_ENV === 'production';
const isDeployed = isProduction || process.env.VERCEL === '1' || Boolean(process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT);
// Fail fast in any deployed environment: never run with development secrets in production.
if (isDeployed && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production — refusing to start with the development fallback secret.');
}
if (isDeployed && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD must be set in production — refusing to start without a commissioner password.');
}
const sessionSecret = process.env.SESSION_SECRET || 'development-only-session-secret-change-me';
const secureCookies = process.env.VERCEL === '1' || (isProduction && String(process.env.APP_BASE_URL).startsWith('https://'));
const auth = createAdminAuth({
  password: process.env.ADMIN_PASSWORD || (isProduction ? '' : 'admin123'),
  secret: sessionSecret,
  secure: secureCookies,
});
const playerAuth = createPlayerAuth({ store, secret: `${sessionSecret}:player`, secure: secureCookies, allowDemoCredentials: !isDeployed });

const asyncRoute = (handler) => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
const leagueId = 'league-sunday-syndicate-demo';

/** Save a notification for the in-app notification history. */
async function saveNotification(lid, { playerId = 'all', kind, title, body = '', metadata = {} }) {
  const notification = { id: `notif-${randomUUID()}`, playerId, kind, title, body, metadata, at: new Date().toISOString() };
  try {
    await store.saveNotification(lid, notification);
  } catch (error) { console.error('saveNotification failed (non-fatal):', error.message); return null; }
  try {
    if (webpush && ['results', 'payout', 'payment_confirmed', 'jack_sms'].includes(kind)) {
      const report = await deliverPush({ store, leagueId: lid, webpush, playerIds: playerId === 'all' ? undefined : [playerId], payload: { title, body, url: `/?view=${kind === 'results' ? 'results' : 'notifs'}`, tag: `${kind}-${metadata.week ?? playerId}` } });
      if (report.failed || report.expired) await store.writeAudit(lid, 'push.delivery_partial', 'Some notification subscriptions could not be reached.', 'system', { notificationId: notification.id, ...report });
    }
  } catch (error) { console.error('Notification push failed (in-app copy preserved):', error.message); }
  return notification;
}

async function notifyFinalResults(lid, week) {
  const league = await store.getLeague(lid);
  const games = getGames(week);
  if (!games.length || !games.every((game) => league?.results?.[game.id]?.verifiedAt) || !league.sheets?.some((sheet) => sheet.week === week)) return;
  if (!await store.claimOnce(lid, `results-notification-${week}`)) return;
  const saved = await saveNotification(lid, { kind: 'results', title: `Week ${week} results are final`, body: 'Jack’s board is ready. Open the app to see the final standings.', metadata: { week } });
  if (!saved) await store.releaseClaim(lid, `results-notification-${week}`);
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], // React inline styles + Google Fonts
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://a.espncdn.com'], // team logos + uploaded avatars
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", 'blob:'], // Jack TTS audio playback
      workerSrc: ["'self'"], // PWA service workers
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '256kb', verify(request, _response, bytes) { request.rawBody = Buffer.from(bytes); } }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

/* Commissioner-only: live check of the SMS sending number (Telnyx). */
app.get('/api/sms/diagnose', auth.requireAdmin, asyncRoute(async (_request, response) => {
  try {
    const provider = createSmsProvider(process.env);
    if (typeof provider.diagnose !== 'function') return response.json({ provider: provider.name, note: 'No diagnostics for this provider.' });
    const report = await provider.diagnose();
    return response.json({ ...report, webhookVerificationConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY), testDestinationConfigured: Boolean(process.env.ADMIN_PHONE_E164), note: 'Read-only check. POST /api/sms/test with confirm:true sends one test to ADMIN_PHONE_E164.' });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}));

app.post('/api/sms/test', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (request.body?.confirm !== true) return response.status(422).json({ error: 'Confirm the test send with confirm:true.' });
  if (!process.env.ADMIN_PHONE_E164) return response.status(503).json({ error: 'Configure ADMIN_PHONE_E164 as the authorized test destination first.' });
  if (!['telnyx', 'twilio', 'textbelt'].includes(process.env.SMS_PROVIDER)) return response.status(503).json({ error: 'A real SMS provider is required for a delivery test.' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.body?.requestId ?? '')) return response.status(422).json({ error: 'A unique requestId is required for this test.' });
  if (!checkPlayerRate(ASSISTANT_RATE, 'admin-sms-test', 2, 60_000)) return response.status(429).json({ error: 'Wait a minute before another test text.' });
  const provider = createSmsProvider(process.env);
  const result = await sendCommissionerSmsTest({ store, leagueId, provider, destination: process.env.ADMIN_PHONE_E164, requestId: request.body.requestId });
  return response.json(result);
}));

/* Commissioner-only: what happened to the last verification text for a phone,
   or to any Telnyx message id. Shows carrier-side delivery status + errors. */
app.get('/api/sms/trace', auth.requireAdmin, asyncRoute(async (request, response) => {
  const provider = createSmsProvider(process.env);
  if (typeof provider.messageStatus !== 'function') return response.json({ note: 'No tracing for this provider.' });
  let id = String(request.query.id ?? '').trim();
  let otp = null;
  if (!id && request.query.phone) {
    let digits = String(request.query.phone).replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
    otp = await otpGet(`+1${digits}`);
    id = otp?.providerMessageId ?? '';
    if (!id) return response.json({ phone: `+1${digits}`, otpRecord: otp ? { sentAt: new Date(otp.sentAt).toISOString(), expired: otp.expiresAt < Date.now() } : null, note: 'No provider message id stored for this phone (sent before tracing existed, or expired).' });
  }
  if (!id) return response.status(422).json({ error: 'Pass ?phone= or ?id=.' });
  const status = await provider.messageStatus(id);
  return response.json({ otpRecord: otp ? { sentAt: new Date(otp.sentAt).toISOString(), expired: otp.expiresAt < Date.now(), attempts: otp.attempts } : undefined, ...status });
}));

app.get('/api/health', asyncRoute(async (_request, response) => {
  const geminiKey = await getGeminiKey().catch(() => ({ value: null, source: 'none' }));
  response.json({
    ok: true,
    database: store.kind,
    geminiConfigured: Boolean(geminiKey.value),
    geminiKeySource: geminiKey.source,
    model,
    jackModel,
    smsProvider: ['telnyx', 'twilio', 'textbelt'].includes(process.env.SMS_PROVIDER) ? process.env.SMS_PROVIDER : 'demo',
    telnyxConfigured: Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER),
    twilioConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_MESSAGING_SERVICE_SID),
    smsConfigured: process.env.SMS_PROVIDER === 'telnyx'
      ? Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER)
      : process.env.SMS_PROVIDER === 'textbelt'
        ? Boolean(process.env.TEXTBELT_API_KEY)
        : process.env.SMS_PROVIDER === 'twilio'
          ? Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_MESSAGING_SERVICE_SID)
          : true,
    adminConfigured: Boolean(process.env.ADMIN_PASSWORD || !isProduction),
    ttsProvider: String(process.env.JACK_TTS_PROVIDER ?? 'browser').toLowerCase(),
    ttsConfigured: String(process.env.JACK_TTS_PROVIDER ?? '').toLowerCase() === 'elevenlabs'
      ? Boolean(process.env.JACK_TTS_API_KEY && process.env.JACK_TTS_VOICE_ID)
      : false,
    pushConfigured: Boolean(webpush),
    smsWebhookVerificationConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY),
  });
}));

/* ── Admin config overrides — lets the commissioner fix a stale hosting env var
   (e.g. GEMINI_API_KEY on Vercel) from inside the app. The value is validated
   with a live Gemini call before saving and is never echoed back. ── */
app.patch('/api/admin/config', auth.requireAdmin, asyncRoute(async (request, response) => {
  const key = String(request.body?.key ?? '');
  const value = typeof request.body?.value === 'string' ? request.body.value.trim() : '';
  const ALLOWED = new Set(['GEMINI_API_KEY']);
  if (!ALLOWED.has(key)) return response.status(422).json({ error: 'That config key cannot be set here.' });
  if (key === 'GEMINI_API_KEY') {
    if (!value) {
      await store.setConfig(key, '');
      invalidateGeminiKeyCache();
      return response.json({ ok: true, key, cleared: true });
    }
    try {
      const probe = new GoogleGenAI({ apiKey: value });
      const result = await probe.models.generateContent({ model, contents: 'Reply with the word ok.', config: { maxOutputTokens: 512 } });
      if (!result?.text) throw new Error('empty response');
    } catch (error) {
      return response.status(422).json({ error: `That key did not work against Gemini (${String(error.message ?? error).slice(0, 120)}). Nothing saved.` });
    }
  }
  await store.setConfig(key, value);
  invalidateGeminiKeyCache();
  try { await store.writeAudit('league-sunday-syndicate-demo', 'admin.config_updated', `${key} updated via admin config (validated live)`, 'admin', { key }); } catch { /* audit is best-effort */ }
  return response.json({ ok: true, key, validated: true });
}));

/* ── OTP verification (TextBelt) ── */
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_MS = 60 * 1000; // 1 minute between sends
/* OTP + phone-verification state is persisted in the shared config store, not
   in memory: on serverless (Vercel) the /otp/send and /otp/verify calls often
   land on different isolates, so an in-memory Map made verification always fail
   ("No code found"). The store is shared across isolates. Keys are per-phone. */
const otpCodeKey = (phone) => `otp:${phone}`;
const otpVerifiedKey = (phone) => `otpv:${phone}`;
async function otpGet(phone) {
  const raw = await store.getConfig(otpCodeKey(phone));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
async function otpPut(phone, entry) { await store.setConfig(otpCodeKey(phone), JSON.stringify(entry)); }
async function otpClear(phone) { await store.setConfig(otpCodeKey(phone), ''); }
async function markPhoneVerified(phone) { await store.setConfig(otpVerifiedKey(phone), String(Date.now())); }
/* Consume a verification record: true only if verified within the last 30 min. */
async function consumePhoneVerified(phone) {
  const raw = await store.getConfig(otpVerifiedKey(phone));
  if (!raw) return false;
  await store.setConfig(otpVerifiedKey(phone), ''); // one-time use
  const ts = Number(raw);
  return Number.isFinite(ts) && Date.now() - ts < 30 * 60 * 1000;
}

/* ── Per-player rate limiters for AI/TTS endpoints ── */
const ASSISTANT_RATE = new Map(); // key: playerId, value: { count, windowStart }
const TTS_RATE = new Map(); // key: playerId, value: { count, windowStart }
function checkPlayerRate(map, playerId, maxRequests, windowMs) {
  const now = Date.now();
  const entry = map.get(playerId);
  if (!entry || now - entry.windowStart > windowMs) {
    map.set(playerId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count += 1;
  return true;
}

// Clean expired rate-limit windows every 2 minutes (OTP records live in the
// shared store now and are expiry-checked on read, so no sweep is needed here)
setInterval(() => {
  const now = Date.now();
  // Clean expired rate-limit windows
  for (const [key, entry] of ASSISTANT_RATE) {
    if (now - entry.windowStart > 3600_000) ASSISTANT_RATE.delete(key);
  }
  for (const [key, entry] of TTS_RATE) {
    if (now - entry.windowStart > 60_000) TTS_RATE.delete(key);
  }
}, 120_000);

app.post('/api/otp/send', asyncRoute(async (request, response) => {
  let digits = String(request.body?.phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return response.status(422).json({ error: 'Enter a valid 10-digit US phone number.' });
  const phoneE164 = `+1${digits}`;

  // Rate limit: 1 send per phone per minute
  const existing = await otpGet(phoneE164);
  if (existing?.sentAt && Date.now() - existing.sentAt < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000);
    return response.status(429).json({ error: `Wait ${waitSec}s before requesting another code.` });
  }

  // Generate 6-digit code
  const code = String(randomInt(100000, 999999));
  await otpPut(phoneE164, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, sentAt: Date.now() });

  // Send through whichever real provider is configured (Telnyx / Twilio /
  // TextBelt) — the same path Jack's texts use. No provider = demo: log it.
  const liveSms = ['telnyx', 'twilio', 'textbelt'].includes(process.env.SMS_PROVIDER);
  if (liveSms) {
    try {
      const provider = createSmsProvider(process.env);
      const sent = await provider.send({ player: { id: `otp-${digits}`, phoneE164 }, text: `405 BadGuys Parlay: Your verification code is ${code}. Expires in 5 min.` });
      await otpPut(phoneE164, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, sentAt: Date.now(), providerMessageId: sent?.id ?? null });
      // Carriers reject asynchronously (e.g. 40010 "not 10DLC registered").
      // Give it a moment and surface that instead of a false "we sent it".
      if (sent?.id && typeof provider.messageStatus === 'function') {
        await new Promise((r) => setTimeout(r, 2500));
        const status = await provider.messageStatus(sent.id).catch(() => null);
        const failed = status?.to?.some((t) => t.status === 'delivery_failed' || t.status === 'sending_failed');
        if (failed) {
          const reason = status.errors?.[0];
          const carrier = status.to?.[0]?.carrier ? ` (${status.to[0].carrier})` : '';
          await otpClear(phoneE164);
          return response.status(502).json({ error: `Your carrier${carrier} rejected the text${reason?.title ? `: ${reason.title}` : ''}. Join without a code — the commissioner can verify you later.`, detail: reason?.detail ?? null, code: reason?.code ?? null });
        }
      }
    } catch (error) {
      console.error('OTP send error:', error.message);
      await otpClear(phoneE164);
      // Tell the person WHY (the provider's own reason) — a silent "try again"
      // hid a mis-configured sending number for days.
      return response.status(502).json({ error: `Couldn't send the text: ${error.message}. You can still join without a code.`, detail: error.message, code: error.code ?? null });
    }
  } else {
    // Demo mode — log the code for testing
    console.log(`[DEMO OTP] ${phoneE164}: ${code}`);
  }

  return response.json({ sent: true, expiresIn: OTP_TTL_MS / 1000 });
}));

app.post('/api/otp/verify', asyncRoute(async (request, response) => {
  let digits = String(request.body?.phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return response.status(422).json({ error: 'Invalid phone number.' });
  const phoneE164 = `+1${digits}`;
  const code = String(request.body?.code ?? '').replace(/\D/g, '');

  const entry = await otpGet(phoneE164);
  if (!entry) return response.status(410).json({ error: 'No code found for this number. Request a new one.' });
  if (Date.now() > entry.expiresAt) {
    await otpClear(phoneE164);
    return response.status(410).json({ error: 'Code expired. Request a new one.' });
  }
  entry.attempts = (entry.attempts ?? 0) + 1;
  if (entry.attempts > OTP_MAX_ATTEMPTS) {
    await otpClear(phoneE164);
    return response.status(429).json({ error: 'Too many attempts. Request a new code.' });
  }
  if (entry.code !== code) {
    await otpPut(phoneE164, entry); // persist the incremented attempt count
    return response.status(401).json({ error: `Wrong code. ${OTP_MAX_ATTEMPTS - entry.attempts} attempts left.` });
  }
  // Success — mark phone as verified server-side (used during registration)
  await otpClear(phoneE164);
  await markPhoneVerified(phoneE164);
  return response.json({ verified: true, phoneE164 });
}));

/* Player self-service PIN reset — proves the phone via the same OTP flow used
   at signup, then sets a new PIN. Consumes the one-time verification record. */
app.post('/api/players/reset-pin', asyncRoute(async (request, response) => {
  let digits = String(request.body?.phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return response.status(422).json({ error: 'Invalid phone number.' });
  const pin = String(request.body?.pin ?? '').replace(/\D/g, '');
  if (pin.length !== 4) return response.status(422).json({ error: 'Your new PIN must be 4 digits.' });
  const phoneE164 = `+1${digits}`;
  const verified = await consumePhoneVerified(phoneE164);
  if (!verified) return response.status(401).json({ error: 'Verify your phone with a code first, then set a new PIN.' });
  const player = await store.findPlayerByPhoneE164(phoneE164);
  if (!player) return response.status(404).json({ error: 'No player is registered with that number.' });
  await store.setPlayerPin(player.id, hashPin(pin));
  return response.json({ ok: true, playerId: player.id, name: player.name });
}));

/* Commissioner PIN reset — for when a player changes numbers or can't get a code. */
app.post('/api/leagues/:leagueId/players/:playerId/reset-pin', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const player = (league.players ?? []).find((p) => p.id === request.params.playerId);
  if (!player) return response.status(404).json({ error: 'Player not found.' });
  const pin = String(request.body?.pin ?? '').replace(/\D/g, '');
  if (pin.length !== 4) return response.status(422).json({ error: 'PIN must be 4 digits.' });
  await store.setPlayerPin(player.id, hashPin(pin));
  return response.json({ ok: true, playerId: player.id, name: player.name });
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Wait 15 minutes before trying again.' } });
app.post('/api/auth/admin', loginLimiter, (request, response) => auth.login(request, response));
app.delete('/api/auth/admin', (request, response) => auth.logout(request, response));
app.get('/api/auth/status', (request, response) => auth.status(request, response));
app.post('/api/auth/player', loginLimiter, asyncRoute((request, response) => playerAuth.login(request, response)));
app.delete('/api/auth/player', (request, response) => playerAuth.logout(request, response));
app.get('/api/auth/player/status', asyncRoute((request, response) => playerAuth.status(request, response)));

/* ── Season auto-start: purge demo players once the real season opens ──
   Week 1's pick window opens 2 days before the first kickoff. From that
   moment, any league still carrying the demo crew is cleaned automatically
   the next time anyone loads it. Real registered players are untouched. */
const DEMO_PLAYER_IDS = new Set(DEMO_LEAGUE.players.map((player) => player.id));
const SEASON_OPENS_AT = (() => {
  const firstKickoff = new Date(`${SCHEDULE[0].games[0].date}T00:00:00-04:00`);
  firstKickoff.setDate(firstKickoff.getDate() - 2);
  return firstKickoff;
})();

async function autoStartSeasonIfDue(league) {
  if (!league) return league;
  if (Date.now() < SEASON_OPENS_AT.getTime()) return league;
  const hasDemoPlayers = (league.players ?? []).some((player) => DEMO_PLAYER_IDS.has(player.id));
  if (!hasDemoPlayers) return league;
  try {
    await store.startSeason(league.id, { week: getCurrentWeek(), actor: 'season_auto_start' });
    return await store.getLeague(league.id);
  } catch (error) {
    console.error('Season auto-start failed:', error.message);
    return league;
  }
}

app.get('/api/leagues/:leagueId', asyncRoute(async (request, response) => {
  const league = await autoStartSeasonIfDue(await store.getLeague(request.params.leagueId));
  if (!league) return response.status(404).json({ error: 'League not found.' });
  await maybeRunAutoPilot(); // serverless-safe: awaited so Vercel doesn't freeze it mid-run (throttled to once per 10 min)
  const player = await playerAuth.playerFromRequest(request);
  response.set('Cache-Control', 'private, no-store');
  return response.json(buildLeagueView(league, { playerId: player?.leagueId === league.id ? player.id : null, isAdmin: auth.isAuthenticated(request) }));
}));

/* ── Manual season start: commissioner clears the demo crew on demand ── */
app.post('/api/leagues/:leagueId/season/start', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week) || getCurrentWeek();
  const outcome = await store.startSeason(request.params.leagueId, { week, actor: request.actor });
  return response.json({ ...outcome, message: outcome.removed.length ? `Removed ${outcome.removed.length} demo players: ${outcome.removed.join(', ')}. League set to Week ${week}.` : `League was already clean. Set to Week ${week}.` });
}));

app.post('/api/leagues/:leagueId/reset-demo', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (request.params.leagueId !== leagueId) return response.status(404).json({ error: 'Demo league not found.' });
  const existing = await store.getLeague(leagueId);
  const realPlayers = (existing?.players ?? []).filter((player) => !DEMO_PLAYER_IDS.has(player.id));
  if (realPlayers.length && !request.body?.confirmWipe) {
    return response.status(409).json({
      error: `This league has ${realPlayers.length} real registered player${realPlayers.length === 1 ? '' : 's'}. Resetting the demo would permanently erase them and all their picks. Send { "confirmWipe": true } only if you really mean it.`,
      code: 'real_players_present',
    });
  }
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
  if (input.favoriteTeam !== undefined && input.favoriteTeam !== '' && input.favoriteTeam !== null && !TEAMS[input.favoriteTeam]) return response.status(422).json({ error: 'Invalid favorite team.' });
  if (input.avatar !== undefined && input.avatar !== null) {
    const check = validateAvatar(input.avatar);
    if (check.error) return response.status(422).json({ error: check.error });
    input.avatar = check.avatar;
  }
  if (input.payment !== undefined) {
    if (input.payment === null) input.payment = null;
    else {
      const { payment, error } = normalizePayment(input.payment);
      if (error) return response.status(422).json({ error });
      input.payment = payment.preferred ? payment : null;
    }
  }
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
  const smsOptIn = request.body?.smsOptIn === true;
  if ((league.players ?? []).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return response.status(409).json({ error: 'That name is taken in this league. Add a last initial or nickname.' });
  }

  // OTP must have been verified for this phone before registration completes
  // (server-side check; consumes the one-time verification record)
  const otpVerified = await consumePhoneVerified(phoneE164);
  const at = new Date().toISOString();
  const player = {
    id: `player-${randomUUID()}`,
    name,
    phone: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`,
    phoneE164,
    phoneVerifiedAt: otpVerified ? at : null,
    messaging: {
      smsConsent: smsOptIn ? 'opted_in' : 'opted_out',
      consentedAt: smsOptIn ? at : null,
      consentVersion: smsOptIn ? SMS_CONSENT_VERSION : null,
      consentSource: smsOptIn ? `registration_checkbox_v${SMS_CONSENT_VERSION}` : 'registration_declined',
      resultsChannel: smsOptIn ? 'sms_and_in_app' : 'in_app',
    },
    trashTalk: {
      level: 'competitive', // maps to the league's explicit default
      updatedAt: at,
      ...(TEAMS[request.body?.favoriteTeam] ? { jackPolicy: { favoriteTeam: request.body.favoriteTeam, updatedAt: at, updatedBy: 'player' } } : {}),
    },
    avatar: null,
    payment: null,
  };
  if (request.body?.avatar) {
    const check = validateAvatar(request.body.avatar);
    if (check.error) return response.status(422).json({ error: check.error });
    player.avatar = check.avatar;
  }
  if (request.body?.payment && typeof request.body.payment === 'object') {
    const { payment, error } = normalizePayment(request.body.payment);
    if (error) return response.status(422).json({ error });
    if (payment.preferred) player.payment = payment;
  }
  await store.createPlayer(request.params.leagueId, player, hashPin(pin));

  // Jack welcomes the new player with a chat message and notification
  const entryFee = league.settings?.entryFee ?? 20;
  const welcomeMsg = `Welcome to the league, ${name}! 👑 Here's how it works: pick a winner for every NFL game each week (straight up, no spread). $${entryFee} per week — pay through Cash App or your credit balance. Highest score wins the pot. Tiebreaker = total points in the last game of the week, closest without going over. Sheets lock ${DEADLINE_HOURS_BEFORE_KICKOFF}h before the first kickoff. Heads up: roast mode is ON by default around here 🔥 — if you can't take the smoke, you can dial it down or turn it off anytime in Player Settings. Hit me up anytime — I'm Jack, your AI commissioner. Tap the 🔊 button on any of my messages to hear me out loud. Let's get it! 🏈`;
  try {
    await store.addChatMessage(request.params.leagueId, {
      id: `chat-welcome-${player.id}`, playerId: null, name: 'Jack 🤖',
      msg: welcomeMsg, time: new Date().toISOString(),
    });
    await saveNotification(request.params.leagueId, {
      playerId: player.id, kind: 'welcome',
      title: `Welcome to ${league.name}!`,
      body: `You're in! Pick winners for every game, $${entryFee}/week. Ask Jack if you have questions.`,
      metadata: { playerName: name },
    });
  } catch (err) { console.error('Welcome message failed (non-fatal):', err.message); }

  return response.status(201).json({ playerId: player.id, name: player.name });
}));

app.post('/api/leagues/:leagueId/entries', asyncRoute(async (request, response) => {
  const input = request.body ?? {};
  const sessionPlayer = await playerAuth.playerFromRequest(request);
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  if (sessionPlayer && sessionPlayer.leagueId !== league.id) return response.status(403).json({ error: 'This player does not belong to that league.' });
  const name = String(sessionPlayer?.name ?? input.name ?? '').trim().slice(0, 50);
  const picks = input.picks ?? {};
  if (!name) return response.status(422).json({ error: 'Name is required.' });
  // SECURITY: a sheet's playerId comes ONLY from the session cookie — never
  // from the request body, or anyone could submit (or replace) sheets as
  // another player. Signed-in resubmission before lock replaces the player's
  // own sheet (store keeps paid status); anonymous sheets carry no playerId.
  const playerId = sessionPlayer?.id ?? null;
  if (!playerId) {
    // Anonymous sheets can't borrow a registered player's name.
    const league = await store.getLeague(request.params.leagueId);
    if ((league?.players ?? []).some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      return response.status(422).json({ error: `"${name}" is a registered player — sign in to submit under that name.` });
    }
  }
  // Signed-in players may submit unpaid and settle from credit or Cash App after;
  // anonymous sheets still need the payment confirmation checkbox.
  if (!input.paid && !playerId) return response.status(422).json({ error: 'Payment confirmation is required.' });
  if (input.tiebreaker == null || String(input.tiebreaker).trim() === '' || typeof input.tiebreaker === 'boolean' || !Number.isInteger(Number(input.tiebreaker)) || Number(input.tiebreaker) < 0 || Number(input.tiebreaker) > 250) return response.status(422).json({ error: 'Tiebreaker must be a whole number between 0 and 250 (total points in the tiebreaker game).' });
  const submittedWeek = Number(input.week) || getCurrentWeek();
  const weekGames = getGames(submittedWeek);
  if (!weekGames.length) return response.status(422).json({ error: `No games found for Week ${submittedWeek}.` });
  // Picks can only be filed for the CURRENT week — stops a browsed-ahead week
  // selector from quietly filing a Week 5 sheet while everyone else is on Week 1.
  if (submittedWeek !== getCurrentWeek()) {
    return response.status(422).json({ error: `Picks are only open for Week ${getCurrentWeek()} right now. Switch back to the current week to lock in.` });
  }
  if (isWeekLocked(submittedWeek)) {
    const deadline = getWeekDeadline(submittedWeek);
    return response.status(422).json({ error: `Week ${submittedWeek} is locked. Sheets were due ${DEADLINE_HOURS_BEFORE_KICKOFF} hours before the first kickoff${deadline ? ` (${deadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET)` : ''}. See you next week.` });
  }
  const everyPickValid = weekGames.every((game) => picks[game.id] === game.away || picks[game.id] === game.home);
  if (!everyPickValid || Object.keys(picks).length !== weekGames.length) return response.status(422).json({ error: `Exactly ${weekGames.length} valid picks are required for Week ${submittedWeek}.` });
  // A checkbox is a payment CLAIM, never proof that money was received.
  const sheet = { id: `sheet-${randomUUID()}`, playerId, name, handle: String(input.handle ?? '').trim().slice(0, 50), picks, tiebreaker: Number(input.tiebreaker), paid: false, week: submittedWeek, submittedAt: new Date().toISOString() };
  await store.createSheet(request.params.leagueId, sheet);
  if (input.paid === true && !sheet.paid) {
    sheet.paymentClaim = { claimedAt: sheet.submittedAt, method: 'external', amount: Number(league.settings?.entryFee) || ENTRY_FEE };
    await store.updateSheetFields(league.id, sheet.id, { paymentClaim: sheet.paymentClaim });
  }
  return response.status(201).json(sheet);
}));

/* ── Jack's rivalry desk: when one player's favorite team beats another's,
   Jack drops a receipt in the league chat. Grounded in real final scores only.
   Teasing is capped by the losing fan's own trash-talk consent level. ── */
const favoriteTeamOf = (player) => player?.trashTalk?.jackPolicy?.favoriteTeam ?? null;

async function maybePostRivalryChat(leagueId, gameId, result) {
  try {
    if (!result?.winner) return;
    const game = SCHEDULE.flatMap((w) => w.games).find((candidate) => candidate.id === gameId);
    if (!game) return;
    const league = await store.getLeague(leagueId);
    if (!league) return;
    if ((league.chat ?? []).some((message) => message.id === `chat-rivalry-${gameId}`)) return; // already posted
    const loserTeam = result.winner === game.away ? game.home : game.away;
    const winnerFans = (league.players ?? []).filter((player) => favoriteTeamOf(player) === result.winner);
    const loserFans = (league.players ?? []).filter((player) => favoriteTeamOf(player) === loserTeam);
    if (!winnerFans.length || !loserFans.length) return;

    const finalScore = result.winner === game.away
      ? `${result.awayScore}–${result.homeScore}`
      : `${result.homeScore}–${result.awayScore}`;
    const margin = Math.abs(Number(result.awayScore) - Number(result.homeScore));
    const winnerNames = winnerFans.map((player) => player.name.split(' ')[0]).join(' & ');

    const gasUp = margin >= 17
      ? `${winnerNames}, your squad COOKED. That wasn't a game, that was a business decision.`
      : margin >= 8
        ? `${winnerNames}, your boys handled that. Comfortable. Never worried.`
        : `${winnerNames}, your team survived a dogfight. A win is a win — collect your bragging rights.`;

    // Tease the losing fan only as hard as their own consent level allows
    const teases = loserFans.map((player) => {
      const level = player.trashTalk?.level ?? 'none';
      const first = player.name.split(' ')[0];
      if (level === 'none') return null; // opted out — never named
      if (level === 'light') return `Tough one for the ${loserTeam} faithful. Heads up, ${first} — next week's a new week.`;
      if (margin >= 17) return `${first}... bruh. ${loserTeam} got ran off the field and you watched every minute of it. That's dedication. Misplaced, but dedication.`;
      return `${first}, your ${loserTeam} squad came up short AGAIN and the whole league saw it. I'm keeping receipts, dawg.`;
    }).filter(Boolean);

    const msg = [`🏈 RIVALRY DESK: ${result.winner} beat ${loserTeam} ${finalScore}.`, gasUp, ...teases].join(' ').slice(0, 400);
    await store.addChatMessage(leagueId, { id: `chat-rivalry-${gameId}`, playerId: null, name: 'Jack', msg, time: new Date().toISOString() });
  } catch (error) {
    console.error('Rivalry chat failed:', error.message);
  }
}

app.put('/api/leagues/:leagueId/results/:gameId', auth.requireAdmin, asyncRoute(async (request, response) => {
  const game = SCHEDULE.flatMap((w) => w.games).find((candidate) => candidate.id === request.params.gameId);
  if (!game) return response.status(404).json({ error: 'Game not found.' });
  const awayScore = Number(request.body?.awayScore);
  const homeScore = Number(request.body?.homeScore);
  const missingScore = [request.body?.awayScore, request.body?.homeScore].some((score) => score == null || String(score).trim() === '' || typeof score === 'boolean');
  if (missingScore || !Number.isInteger(awayScore) || !Number.isInteger(homeScore) || awayScore < 0 || homeScore < 0) return response.status(422).json({ error: 'Enter non-negative whole-number final scores.' });
  // NFL games can end tied — a tie counts as no point for anyone.
  const result = { awayScore, homeScore, winner: awayScore === homeScore ? 'TIE' : (awayScore > homeScore ? game.away : game.home) };
  const saved = await store.upsertResult(request.params.leagueId, game.id, result, request.actor);
  await maybePostRivalryChat(request.params.leagueId, game.id, result);
  const resultWeek = SCHEDULE.find((week) => week.games.some((candidate) => candidate.id === game.id))?.week;
  if (resultWeek) await notifyFinalResults(request.params.leagueId, resultWeek);
  return response.json(saved);
}));

app.post('/api/leagues/:leagueId/recaps/generate', auth.requireAdmin, asyncRoute(async (request, response) => {
  const geminiKey = await getGeminiKey();
  const aiClient = geminiKey.value ? new GoogleGenAI({ apiKey: geminiKey.value }) : null;
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

app.post('/api/leagues/:leagueId/chat', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const name = String(request.player.name ?? '').trim().slice(0, 40);
  const msg = String(request.body?.msg ?? '').trim().slice(0, 400);
  if (!name || !msg) return response.status(422).json({ error: 'Message is required.' });
  const message = { id: `chat-${randomUUID()}`, playerId: request.player.id, name, msg, time: new Date().toISOString() };
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

  // TEXT JACK: registered, opted-in players can text a question and Jack texts back.
  // Grounded in the same league data as the in-app assistant; SMS answers stay short and PG-13.
  const inboundText = String(request.body?.Body ?? '').trim();
  const isKeyword = /^(stop|start|unstop|help|yes|no|cancel|quit|unsubscribe)$/i.test(inboundText);
  if (player && inboundText && !isKeyword && !optOutType && player.messaging?.smsConsent === 'opted_in') {
    try {
      const answer = await askJackAssistant({
        leagueId,
        question: `${inboundText}\n\n(Answering over SMS: keep it under 300 characters, plain text, no markdown, PG-13.)`,
        playerId: player.id,
      });
      if (answer?.text) {
        const smsText = answer.text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 320);
        const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return response.send(`<Response><Message>${escapeXml(smsText)}</Message></Response>`);
      }
    } catch (error) {
      console.error('Text-Jack reply failed:', error.message);
    }
  }
  return response.send('<Response></Response>');
}));

/* ── Telnyx Inbound SMS Webhook ── */
const requireTelnyxSignature = (request, response, next) => {
  if (!process.env.TELNYX_PUBLIC_KEY) return response.status(503).json({ error: 'Telnyx webhook verification is not configured.' });
  if (!verifyTelnyxWebhook({ publicKey: process.env.TELNYX_PUBLIC_KEY, timestamp: request.get('telnyx-timestamp'), signature: request.get('telnyx-signature-ed25519'), rawBody: request.rawBody })) return response.status(403).json({ error: 'Invalid Telnyx signature.' });
  return next();
};
app.post('/api/sms/inbound', requireTelnyxSignature, asyncRoute(async (request, response) => {
  // Telnyx sends JSON with data.event_type and data.payload
  const evt = request.body?.data;
  const deliveryEvent = telnyxDeliveryEvent(evt);
  if (deliveryEvent) {
    await applyDeliveryStatus({ store, ...deliveryEvent });
    return response.json({ ok: true });
  }
  if (!evt || evt.event_type !== 'message.received') return response.status(200).json({ ok: true });

  const from = evt.payload?.from?.phone_number;
  const inboundText = String(evt.payload?.text ?? '').trim();
  if (!from || !inboundText) return response.status(200).json({ ok: true });

  const player = await store.findPlayerByPhoneE164(from);
  const isKeyword = /^(stop|start|unstop|help|yes|no|cancel|quit|unsubscribe)$/i.test(inboundText);

  // Handle opt-out/opt-in keywords
  if (player && /^(stop|cancel|quit|unsubscribe)$/i.test(inboundText)) {
    await store.updatePlayerPreferences(player.id, { smsConsent: 'opted_out' }, 'telnyx_webhook');
    return response.status(200).json({ ok: true });
  }
  if (player && /^(start|unstop|yes)$/i.test(inboundText)) {
    await store.updatePlayerPreferences(player.id, { smsConsent: 'opted_in' }, 'telnyx_webhook');
    return response.status(200).json({ ok: true });
  }

  // TEXT JACK: registered, opted-in players must text "Hey Jack" (or similar) to trigger a Jack AI reply
  if (player && inboundText && !isKeyword && player.messaging?.smsConsent === 'opted_in') {
    const jackTriggerMatch = inboundText.match(/^(hey\s+jack|yo\s+jack|ask\s+jack)\b[,!?\s]*/i);

    if (jackTriggerMatch) {
      // Strip the trigger phrase and pass the actual question to Jack
      const question = inboundText.slice(jackTriggerMatch[0].length).trim();
      if (!question) {
        // "Hey Jack" with no question — stay silent to avoid SMS costs
      } else {
        if (!evt.id) return response.status(422).json({ error: 'Missing webhook event ID.' });
        if (!await store.claimOnce(player.leagueId, `sms-reply-${evt.id}`)) return response.json({ ok: true, duplicate: true });
        try {
          const answer = await askJackAssistant({
            leagueId: player.leagueId,
            question: `${question}\n\n(Answering over SMS: keep it under 300 characters, plain text, no markdown, PG-13.)`,
            playerId: player.id,
          });
          if (answer?.text && process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER) {
            const smsText = answer.text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 320);
            const broadcast = await sendJackBroadcast({ store, leagueId: player.leagueId, provider: createSmsProvider({ ...process.env, SMS_PROVIDER: 'telnyx' }), messages: [{ playerId: player.id, text: smsText }], actor: 'jack', kind: 'jack_reply' });
            const delivery = broadcast.deliveries[0];
            const submitted = ['queued', 'sending', 'sent', 'delivered'].includes(delivery?.status);
            await saveNotification(player.leagueId, { playerId: player.id, kind: 'jack_sms', title: submitted ? 'Jack replied — SMS submitted' : 'Jack replied — SMS was not submitted', body: smsText, metadata: { question, smsStatus: delivery?.status, providerMessageId: delivery?.providerMessageId } });
          }
        } catch (error) {
          console.error('Text-Jack reply failed:', error.message);
        }
      }
    }
    // No trigger match → silent ignore (no hint reply to avoid per-SMS costs)
  }
  return response.status(200).json({ ok: true });
}));

/* ── Telnyx Delivery Status Webhook ── */
app.post('/api/webhooks/telnyx/status', requireTelnyxSignature, asyncRoute(async (request, response) => {
  const deliveryEvent = telnyxDeliveryEvent(request.body?.data);
  if (deliveryEvent) await applyDeliveryStatus({ store, ...deliveryEvent });
  return response.status(200).json({ ok: true });
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
      leaderboard: leaderboard.map((e) => ({ playerId: e.playerId, name: e.name, score: e.score, tiebreaker: e.tiebreaker, tiebreakerRank: e.tiebreakerRank })),
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

async function askJackAssistant({ leagueId: targetLeagueId, question: rawQuestion, playerId = null, history: rawHistory = [] }) {
  const question = String(rawQuestion ?? '').trim().slice(0, 500);
  if (!question) return { error: 'A question is required.', status: 422 };

  const league = await store.getLeague(targetLeagueId);
  if (!league) return { error: 'League not found.', status: 404 };

  const geminiKeyValue = (await getGeminiKey()).value;
  const geminiConfigured = Boolean(geminiKeyValue);
  const currentWeek = getCurrentWeek();
  const weekGames = getGames(currentWeek);
  const weekLabel = SCHEDULE.find((w) => w.week === currentWeek)?.label ?? `Week ${currentWeek}`;
  const entryFee = Number(league.settings?.entryFee) || ENTRY_FEE;
  const currentWeekSheets = (league.sheets ?? []).filter((sheet) => sheet.week === currentWeek);
  const verifiedGameCount = weekGames.filter((game) => (league.results ?? {})[game.id]?.winner && (league.results ?? {})[game.id]?.verifiedAt).length;

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
  const currentPlayerId = playerId ?? null;
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
    name: league.name || '405 BadGuys Parlay',
    season: SEASON,
    week: currentWeek,
    weekLabel,
    totalGames: weekGames.length,
    entryFee,
    pot: currentWeekSheets.filter((sheet) => sheet.paid).length * entryFee,
    rollover: Number(league.settings?.rollover) || 0,
    verifiedGameCount,
    weekLocked: isWeekLocked(currentWeek),
    standings,
    games: weekGames.map((g) => {
      const r = (league.results ?? {})[g.id];
      return { id: g.id, away: g.away, home: g.home, winner: r?.winner ?? null, awayScore: r?.awayScore ?? null, homeScore: r?.homeScore ?? null };
    }),
    rules: [
      `WEEKLY ENTRY FEE: $${league.settings?.entryFee ?? 20} per weekly sheet.`,
      `Pick one winner for every game (straight up, no spread).`,
      `One point per correct pick. Highest total wins the weekly pot. A game that ends in a TIE counts as no point for anyone.`,
      `Tiebreaker: guess the total points of the week's LAST game (usually Monday night). Closest without going over wins ties. Going over busts — any under-guess beats any bust. If everyone tied goes over, the least-over guess wins. Identical guesses split the pot.`,
      `DEADLINE: sheets lock ${DEADLINE_HOURS_BEFORE_KICKOFF} hours before the first kickoff of each week${(() => { const d = getWeekDeadline(currentWeek); return d ? ` — ${weekLabel} locks ${d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET` : ''; })()}. Late sheets are rejected — remind players who haven't submitted.`,
      `SEASON POOL: $${league.settings?.seasonPool?.entryFee ?? 25} per player, ONE-TIME for the whole season. Standings are the best COMBINED record across ALL weekly sheets — total correct picks added up over the entire season — NOT the best single week. Pays THREE places: ${(league.settings?.seasonPool?.payoutSplit ?? [60, 30, 10]).map((pct, i) => `${['1st', '2nd', '3rd'][i]} gets ${pct}%`).join(', ')} of the pot. Paid out after Week 18.`,
      `SURVIVOR POOL: pick one team to win each week, never reuse a team all season. A loss eliminates you; a TIE counts as surviving. Last one standing wins.`,
      `CFB PICK-EM POOLS: separate college football pools where players pick every game AGAINST THE SPREAD. Best ATS record wins that pool's pot; tiebreaker is closest to the total points of the last game.`,
      `PAYMENTS: players pay through the league's Cash App Pool link or with one tap from their credit balance. Winnings can be credited straight to a player's balance and rolled into future entries. The app only tracks money between friends — Cash App moves it.`,
    ],
    seasonPool: (() => {
      const pool = league.settings?.seasonPool ?? { entryFee: 25, paidPlayerIds: [] };
      const confirmed = new Set(pool.paidPlayerIds ?? []);
      const poolFee = Number(pool.entryFee) || 25;
      return {
        status: 'live',
        canJoin: true,
        entryFeeCents: Math.round(poolFee * 100),
        potCents: confirmed.size * Math.round(poolFee * 100),
        confirmedCount: confirmed.size,
        deadlineAt: getWeekDeadline(1)?.toISOString() ?? null,
        entries: (league.players ?? []).map((player) => ({ playerId: player.id, status: confirmed.has(player.id) ? 'confirmed' : 'not_joined' })),
        rule: `One-time $${poolFee} season entry. Best combined record across all weekly sheets; top three split ${(pool.payoutSplit ?? [60, 30, 10]).join('/')} after Week 18.`,
      };
    })(),
    submissionDeadline: getWeekDeadline(currentWeek)?.toISOString() ?? null,
    submissionLocked: isWeekLocked(currentWeek),
    availableFeatures: ['Weekly picks', 'League standings', 'Chat', 'AI recap', 'Pick sheet review', 'Trash-talk assist', 'Side bets', 'Survivor pool', 'CFB Pick-Em pools (against the spread)', 'Cash App Pool payments', 'Player credit balances'],
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
    // Season ledger memory: past weekly pots paid out
    payoutHistory: (league.payouts ?? []).slice(0, 30).map((p) => ({ week: p.week, pool: p.pool ?? 'weekly', amount: p.amount, winners: p.winnerNames ?? [], paidAt: p.paidAt })),
    // CFB pick-em pools (against the spread) — full season memory
    cfbPools: await (async () => {
      try {
        const { gradeCfbPool } = await import('../src/cfbPool.js');
        return (league.cfbPools ?? []).map((pool) => {
          const board = gradeCfbPool(pool);
          return {
            week: pool.week,
            status: pool.status,
            entryFee: pool.entryFee,
            games: (pool.games ?? []).length,
            entries: Object.keys(pool.entries ?? {}).length,
            pot: Object.values(pool.entries ?? {}).filter((e) => e.paid).length * (pool.entryFee || 0),
            potCredited: Boolean(pool.potCredited),
            standings: board.rows.slice(0, 10).map((row) => ({ name: row.name, record: `${row.wins}-${row.losses}${row.pushes ? `-${row.pushes}` : ''} ATS`, paid: row.paid })),
            winners: board.complete ? board.winners.map((w) => w.name) : [],
          };
        });
      } catch { return []; }
    })(),
    // Player credit balances (money the league tracks between friends)
    playerCredits: await (async () => {
      try {
        const { creditBalance } = await import('../src/credits.js');
        return (league.players ?? []).map((p) => ({ name: p.name, balance: creditBalance(league.creditLedger ?? [], p.id) })).filter((p) => p.balance > 0);
      } catch { return []; }
    })(),
  };
  if (currentPlayerContext) {
    try {
      const { creditBalance } = await import('../src/credits.js');
      const balance = creditBalance(league.creditLedger ?? [], currentPlayerContext.id);
      const sheet = currentWeekSheets.find((candidate) => candidate.playerId === currentPlayerContext.id);
      currentPlayerContext.balanceCents = Math.round(balance * 100);
      currentPlayerContext.entryCreditCount = Math.max(0, Math.floor(balance / entryFee));
      currentPlayerContext.weeklyPaymentStatus = sheet?.paid ? 'confirmed' : sheet?.paymentClaim ? 'claimed' : 'not_claimed';
      currentPlayerContext.winCount = playerMemories.find((memory) => memory.playerId === currentPlayerContext.id)?.weeklyRecord?.filter((week) => week.weeklyWinner).length ?? 0;
    } catch { /* credit context is optional */ }
  }

  // Most league questions need no external data. Only news/injury questions
  // touch ESPN, and even then a cold request gets 600ms before cached data wins.
  if (questionNeedsNflNews(question)) {
    try {
      const news = await Promise.race([
        fetchNflNews(),
        new Promise((resolve) => setTimeout(() => resolve(newsCache.data ?? { fetchedAt: null, items: [] }), 600)),
      ]);
      context.nflNews = formatNflNews(news);
    } catch { context.nflNews = formatNflNews(newsCache.data); }
  }

  const history = Array.isArray(rawHistory) ? rawHistory.slice(-6).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    text: String(m.text ?? '').slice(0, 500),
  })).filter((m) => m.text) : [];

  if (!geminiConfigured) {
    const fallback = buildLocalAssistantFallback(question, context);
    return { text: fallback, source: 'local_fallback' };
  }

  try {
    const { buildPrompt } = await import('./prompts.js');
    const { systemInstruction, prompt } = buildPrompt('assistant', { question, history, context });
    const client = new GoogleGenAI({ apiKey: geminiKeyValue });
    const result = await client.models.generateContent({
      model: jackModel,
      contents: prompt,
      // Low thinking plus a compact answer ceiling keeps interactive chat fast.
      config: { systemInstruction, temperature: 0.5, maxOutputTokens: 256, ...jackGenerationTuning(jackModel) },
    });
    const text = result?.text?.trim();
    if (!text) throw new Error('Empty response from model.');
    return { text, source: 'gemini', model: jackModel };
  } catch (error) {
    console.error('Assistant error:', error.message);
    const fallback = buildLocalAssistantFallback(question, context);
    return { text: fallback, source: 'local_fallback' };
  }
}

app.post('/api/leagues/:leagueId/assistant', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  if (!checkPlayerRate(ASSISTANT_RATE, request.player.id, 20, 3600_000)) {
    return response.status(429).json({ error: 'Easy, champ — 20 questions per hour. Try again in a bit.' });
  }
  const result = await askJackAssistant({ leagueId: request.params.leagueId, question: request.body?.question, playerId: request.player.id, history: request.body?.history });
  if (result.error) return response.status(result.status ?? 422).json({ error: result.error });
  return response.json(result);
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
  return "What's good — I'm Jack, your league's AI commissioner. I got standings, rules, schedules, season stats, all of it. The Gemini API ain't hooked up yet so I'm running on local smarts. Drop GEMINI_API_KEY in the env and watch me really go to work.";
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
  // The commissioner only owns the assigned level + on/off switch. Consent
  // and adult flags belong to the player (derived from their Roast setting),
  // so they are never snapshotted here.
  const stored = player.trashTalk?.jackPolicy ?? {};
  const updated = {
    favoriteTeam: stored.favoriteTeam ?? null,
    adminAssignedLevel: input.adminAssignedLevel ?? stored.adminAssignedLevel ?? 'target',
    roastEnabled: typeof input.roastEnabled === 'boolean' ? input.roastEnabled : (stored.roastEnabled ?? true),
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  };
  const trashTalk = { ...(player.trashTalk ?? {}), jackPolicy: updated };
  await store.updatePlayerPreferences(request.params.playerId, { trashTalk }, 'admin');
  const resolved = resolveJackRoastPolicy({ player: { ...player, trashTalk }, leagueSettings: league.settings });
  return response.json({ jackPolicy: normalizePlayerJackPolicy({ ...player, trashTalk }), resolved });
}));

/* ── Jack Weekly Roast Generation ── */
app.post('/api/leagues/:leagueId/jack/weekly-roast', auth.requireAdmin, asyncRoute(async (request, response) => {
  const geminiConfigured = Boolean((await getGeminiKey()).value);
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
  const client = new GoogleGenAI({ apiKey: (await getGeminiKey()).value });

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
        config: { systemInstruction, temperature: 0.7, maxOutputTokens: 768 },
      });
      roasts.push({ playerId: entry.playerId, name: entry.name, text: result?.text?.trim() ?? '', isWinner, roastLevel: policy?.effectiveLevel ?? 'clean' });
    } catch (err) {
      roasts.push({ playerId: entry.playerId, name: entry.name, text: '', isWinner, roastLevel: policy?.effectiveLevel ?? 'clean', error: err.message });
    }
  }

  return response.json({ week: currentWeek, roasts, winner: winnerRecognition });
}));

/* ── Jack Weekly Recap Show (slideshow data) ── */
app.get('/api/leagues/:leagueId/recap-show', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  // Gated + rate-limited: when Gemini is configured this fans out one generation
  // per player, so it must not be anonymously spammable.
  if (!checkPlayerRate(ASSISTANT_RATE, `recap-${request.player.id}`, 6, 3600_000)) {
    return response.status(429).json({ error: 'The recap show was just generated — give it a few minutes.' });
  }
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });

  const currentWeek = getCurrentWeek();
  const weekGames = getGames(currentWeek);
  const facts = calculateLeagueFacts(league);

  // Build per-player roasts if Gemini is configured
  const geminiConfigured = Boolean((await getGeminiKey()).value);
  const playerMemories = buildSeasonMemories(league, currentWeek);
  const winnerRecognition = computeWinnerRecognition(league, currentWeek);
  const winnerIds = new Set(winnerRecognition?.protectedPlayerIds ?? []);

  const slides = [];

  // Slide 1: Title
  slides.push({
    type: 'title',
    week: league.week,
    season: league.season ?? 2026,
    playerCount: league.players.length,
    gameCount: weekGames.length,
    verifiedCount: facts.verifiedGameCount,
  });

  // Slide 2: Weekly winner
  if (facts.winner) {
    slides.push({
      type: 'winner',
      name: facts.winner.name,
      playerId: facts.winner.playerId,
      score: facts.winner.score,
      total: weekGames.length,
      margin: facts.runnerUp ? facts.winner.score - facts.runnerUp.score : 0,
      runnerUp: facts.runnerUp ? { name: facts.runnerUp.name, score: facts.runnerUp.score } : null,
    });
  }

  // Slide 3: Full standings
  slides.push({
    type: 'standings',
    entries: facts.leaderboard.map((entry) => ({
      playerId: entry.playerId,
      name: entry.name,
      score: entry.score,
      rank: entry.rank,
      rankChange: entry.rankChange,
    })),
  });

  // Slide 4: Movers — biggest rise & fall
  if (facts.biggestRise || facts.biggestFall) {
    slides.push({
      type: 'movers',
      rise: facts.biggestRise ? { name: facts.biggestRise.name, change: facts.biggestRise.rankChange, score: facts.biggestRise.score } : null,
      fall: facts.biggestFall ? { name: facts.biggestFall.name, change: facts.biggestFall.rankChange, score: facts.biggestFall.score } : null,
    });
  }

  // Slide 5: Side bets settled
  if (facts.settledBets.length > 0) {
    slides.push({
      type: 'sideBets',
      bets: facts.settledBets.map((bet) => ({
        winnerId: bet.winnerId,
        winnerName: league.players.find((p) => p.id === bet.winnerId)?.name ?? 'Unknown',
        stake: bet.stake?.label ?? bet.stake?.type ?? 'bragging rights',
        creatorName: league.players.find((p) => p.id === bet.creatorId)?.name ?? 'Player 1',
        opponentName: league.players.find((p) => p.id === bet.opponentId)?.name ?? 'Player 2',
      })),
    });
  }

  // Slide 6: Per-player roast cards
  const roastSlides = [];
  if (geminiConfigured) {
    const leaderboard = buildLeaderboard(league.players, (league.sheets ?? []).filter((s) => s.week === currentWeek), league.results);
    const { buildPrompt } = await import('./prompts.js');
    const client = new GoogleGenAI({ apiKey: (await getGeminiKey()).value });

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
          config: { systemInstruction, temperature: 0.7, maxOutputTokens: 768 },
        });
        roastSlides.push({ playerId: entry.playerId, name: entry.name, text: result?.text?.trim() ?? '', isWinner, rank: entry.rank, score: entry.score });
      } catch {
        roastSlides.push({ playerId: entry.playerId, name: entry.name, text: '', isWinner, rank: entry.rank, score: entry.score });
      }
    }
  }

  if (roastSlides.length) {
    slides.push({ type: 'roasts', players: roastSlides });
  }

  // Generate narration lines via Gemini
  let narration = [];
  if (geminiConfigured && facts.winner) {
    try {
      const { buildPrompt } = await import('./prompts.js');
      const client = new GoogleGenAI({ apiKey: (await getGeminiKey()).value });
      const { systemInstruction, prompt } = buildPrompt('recapShow', {
        week: league.week,
        winnerName: facts.winner.name,
        winnerScore: facts.winner.score,
        totalGames: weekGames.length,
        runnerUpName: facts.runnerUp?.name,
        runnerUpScore: facts.runnerUp?.score,
        biggestRiseName: facts.biggestRise?.name,
        biggestRiseChange: facts.biggestRise?.rankChange,
        biggestFallName: facts.biggestFall?.name,
        biggestFallChange: facts.biggestFall?.rankChange,
        settledBetCount: facts.settledBets.length,
        playerCount: league.players.length,
      });
      const result = await client.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction, temperature: 0.8, maxOutputTokens: 1024 },
      });
      narration = (result?.text?.trim() ?? '').split('\n').filter(Boolean).slice(0, 5);
    } catch {
      narration = [];
    }
  }

  // Slide 7: Closing
  slides.push({ type: 'closing', week: league.week });

  return response.json({ week: currentWeek, slides, narration, finalized: facts.finalized });
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

/* ── NFL Injuries (ESPN injuries feed, 10-min cache) ── */
let injuryCache = { at: 0, data: null };

async function fetchNflInjuries() {
  if (injuryCache.data && Date.now() - injuryCache.at < 600_000) return injuryCache.data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const upstream = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries', { signal: controller.signal, headers: { accept: 'application/json' } });
    clearTimeout(timer);
    if (!upstream.ok) throw new Error(`ESPN injuries responded ${upstream.status}`);
    const payload = await upstream.json();
    const teams = parseNflInjuries(payload);
    const data = { fetchedAt: new Date().toISOString(), teams };
    injuryCache = { at: Date.now(), data };
    return data;
  } catch (error) {
    console.error('NFL injuries unavailable:', error.message);
    if (injuryCache.data) return injuryCache.data;
    return { fetchedAt: new Date().toISOString(), teams: [], error: 'injuries_unavailable' };
  }
}

app.get('/api/nfl-injuries', asyncRoute(async (_request, response) => response.json(await fetchNflInjuries())));

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
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'curl/8.5.0' } });
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
  const finals = data.scores.filter((s) => s.state === 'post' && s.completed);
  let autoVerified = 0;
  if (finals.length) {
    const league = await store.getLeague(request.params.leagueId);
    if (league) {
      for (const score of finals) {
        const existing = (league.results ?? {})[score.gameId];
        if (existing?.winner && existing?.verifiedAt) continue;
        const winner = score.awayScore === score.homeScore ? 'TIE' : (score.awayScore > score.homeScore ? score.away : score.home);
        await store.upsertResult(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner }, 'live_feed_auto');
        await maybePostRivalryChat(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner });
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

  const finals = feed.scores.filter((s) => s.state === 'post' && s.completed);
  const applied = [];
  const skipped = [];
  for (const score of finals) {
    const existing = (league.results ?? {})[score.gameId];
    if (existing?.winner && existing?.verifiedAt && !request.body?.force) { skipped.push(score.gameId); continue; }
    const winner = score.awayScore === score.homeScore ? 'TIE' : (score.awayScore > score.homeScore ? score.away : score.home);
    await store.upsertResult(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner }, `${request.actor} (live feed)`);
    await maybePostRivalryChat(request.params.leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner });
    applied.push({ gameId: score.gameId, matchup: `${score.away} at ${score.home}`, final: `${score.awayScore}–${score.homeScore}`, winner });
  }
  await notifyFinalResults(request.params.leagueId, week);
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
    text: `🏈 405 BadGuys: Ayo, it's Jack. Week ${week} sheets lock at ${when}${hoursLeft ? ` (~${hoursLeft}h)` : ''}. Yours is blank, dawg. You trippin if you think I won't clown you for a no-show. Get your picks in.`,
  }));
  const provider = createSmsProvider(process.env);
  const broadcast = await sendJackBroadcast({ store, leagueId: request.params.leagueId, provider, messages, actor: request.actor, kind: 'pick_reminder' });
  for (const p of missing) {
    await saveNotification(request.params.leagueId, { playerId: p.id, kind: 'pick_reminder', title: `Week ${week} pick reminder`, body: `Your Week ${week} picks are due${hoursLeft ? ` in ~${hoursLeft}h` : ' soon'}. Don't miss the deadline!`, metadata: { week } });
  }
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
    const text = [`🏈 405 BadGuys Week ${currentWeek} from Jack:`, resultsLine, champLine, roast].filter(Boolean).join(' ');
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

/* ── Group Text (MMS group thread) — commissioner sends one message to everyone ── */
app.post('/api/leagues/:leagueId/group-text', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const text = String(request.body?.text ?? '').trim();
  if (!text || text.length > 600) return response.status(422).json({ error: 'Message is required (max 600 chars).' });
  const mode = request.body?.mode ?? 'individual'; // 'group_mms' or 'individual'

  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_FROM_NUMBER) {
    return response.status(503).json({ error: 'SMS is not configured. Add TELNYX_API_KEY and TELNYX_FROM_NUMBER.' });
  }

  // Get all opted-in players with verified phones
  const eligible = [];
  for (const summary of league.players ?? []) {
    const player = await store.getPlayer(summary.id);
    if (hasCurrentSmsConsent(player) && player.phoneE164) {
      eligible.push({ id: player.id, name: player.name, phone: player.phoneE164 });
    }
  }
  if (!eligible.length) return response.status(422).json({ error: 'No players with verified phones and SMS consent.' });
  if (!['individual', 'group_mms'].includes(mode)) return response.status(422).json({ error: 'Choose individual texts or group MMS.' });
  if (mode === 'group_mms' && (eligible.length < 2 || eligible.length > 8)) return response.status(422).json({ error: 'Group MMS requires 2–8 eligible players. Choose Individual for this group.' });

  const results = [];
  const provider = createSmsProvider({ ...process.env, SMS_PROVIDER: 'telnyx' });

  if (mode === 'group_mms') {
    // Telnyx MMS group: send one message to all recipients in a shared thread
    try {
      const sent = await provider.sendGroup({ players: eligible.map((player) => ({ phoneE164: player.phone })), text });
      results.push({ mode: 'group_mms', status: sent.status, recipients: eligible.length, messageId: sent.id });
    } catch (error) {
      results.push({ mode: 'group_mms', status: 'failed', error: error.message });
    }
  } else {
    // Individual SMS broadcast (works for any group size)
    for (const player of eligible) {
      try {
        const sent = await provider.send({ player: { phoneE164: player.phone }, text });
        results.push({ playerId: player.id, name: player.name, status: sent.status, messageId: sent.id });
      } catch (error) {
        results.push({ playerId: player.id, name: player.name, status: 'failed', error: error.message });
      }
    }
  }

  const sent = results.filter((r) => ['sent', 'queued', 'sending', 'delivered'].includes(r.status)).reduce((sum, result) => sum + (result.recipients ?? 1), 0);
  const failed = mode === 'group_mms' && !sent ? eligible.length : results.filter((r) => r.status === 'failed').length;
  await store.saveBroadcast(request.params.leagueId, { id: `broadcast-${randomUUID()}`, kind: 'group_text', provider: provider.name, sentAt: new Date().toISOString(), status: failed ? 'completed_with_failures' : 'submitted', deliveries: results.map((result) => ({ playerId: result.playerId ?? null, recipientCount: result.recipients ?? 1, channel: 'sms', status: result.status, providerMessageId: result.messageId, error: result.error })) });
  await store.writeAudit(request.params.leagueId, 'group_text.sent', `Commissioner sent ${mode} to ${eligible.length} players: ${sent} sent, ${failed} failed`, request.actor, { mode, text: text.slice(0, 100) });
  await saveNotification(request.params.leagueId, { kind: 'group_text', title: `Commissioner group text`, body: text.slice(0, 200), metadata: { mode, recipientCount: eligible.length } });

  // Also post to in-app chat
  await store.addChatMessage(request.params.leagueId, {
    id: `chat-${randomUUID()}`, playerId: null, name: 'Commissioner 📢',
    msg: text.slice(0, 400), time: new Date().toISOString(),
  });

  return response.json({ mode, eligible: eligible.length, sent, failed, results });
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

/* ── Prop picks: saved per player per week; commissioner settles winners ── */
const PROP_CATEGORY_IDS = ['passing', 'rushing', 'firstTd', 'turnovers'];

app.post('/api/leagues/:leagueId/props', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week) || getCurrentWeek();
  if (isWeekLocked(week)) {
    return response.status(422).json({ error: `Week ${week} is locked. Prop picks were due ${DEADLINE_HOURS_BEFORE_KICKOFF} hours before the first kickoff.` });
  }
  const input = request.body?.picks ?? {};
  const picks = {};
  for (const id of PROP_CATEGORY_IDS) {
    if (input[id] == null) continue;
    const value = String(input[id]).trim().slice(0, 60);
    if (!value) continue;
    if (id === 'turnovers' && value !== 'over' && value !== 'under') {
      return response.status(422).json({ error: 'Turnovers pick must be "over" or "under".' });
    }
    picks[id] = value;
  }
  if (!Object.keys(picks).length) return response.status(422).json({ error: 'At least one prop pick is required.' });
  // Atomic merge so two players saving props for the same week don't clobber
  // each other's entries in the shared settings blob.
  await store.mergeLeagueSettings(request.params.leagueId, (s) => {
    s.propPicks = s.propPicks ?? {};
    s.propPicks[week] = { ...(s.propPicks[week] ?? {}), [request.player.id]: { ...picks, savedAt: new Date().toISOString() } };
  });
  return response.status(201).json({ week, playerId: request.player.id, picks });
}));

app.post('/api/leagues/:leagueId/props/settle', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week);
  if (!Number.isInteger(week) || week < 1 || week > 18) return response.status(422).json({ error: 'A valid week (1-18) is required.' });
  const validIds = new Set((league.players ?? []).map((p) => p.id));
  const input = request.body?.winners ?? {};
  const winners = {};
  for (const id of PROP_CATEGORY_IDS) {
    if (!Array.isArray(input[id])) continue;
    winners[id] = [...new Set(input[id].filter((pid) => validIds.has(pid)))];
  }
  await store.mergeLeagueSettings(request.params.leagueId, (s) => {
    s.propResults = s.propResults ?? {};
    s.propResults[week] = { winners, settledAt: new Date().toISOString(), settledBy: request.actor ?? 'admin' };
  });
  return response.json({ week, winners });
}));

/* ── Auto-settle props from ESPN final stats.
   Passing/rushing = week-wide leaders from scoreboard game leaders.
   First TD + turnovers O/U 4.5 = the week's kickoff (earliest) game. ── */
const normalizeName = (value) => String(value ?? '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const namesMatch = (pick, actual) => {
  const a = normalizeName(pick);
  const b = normalizeName(actual);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aParts = a.split(' ');
  const bParts = b.split(' ');
  // Last name matches and first initials agree ("P Mahomes" / "Pat Mahomes")
  return aParts[aParts.length - 1] === bParts[bParts.length - 1] && aParts[0][0] === bParts[0][0];
};

async function fetchEspnJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'curl/8.5.0' } });
    if (!upstream.ok) throw new Error(`ESPN responded ${upstream.status}`);
    return await upstream.json();
  } finally { clearTimeout(timer); }
}

async function autoSettlePropsForWeek({ leagueId, week, force = false, actor = 'auto-pilot' }) {
  const league = await store.getLeague(leagueId);
  if (!league) return { error: 'League not found.', status: 404 };
  const weekPicks = league.settings?.propPicks?.[week] ?? {};
  if (!Object.keys(weekPicks).length) return { error: `No prop picks were submitted for Week ${week}.`, status: 422 };

  const scoreboard = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&dates=${SEASON}`);
  const events = scoreboard?.events ?? [];
  if (!events.length) return { error: `ESPN has no games for Week ${week} yet.`, status: 422 };
  const unfinished = events.filter((event) => !event?.status?.type?.completed);
  if (unfinished.length && !force) {
    return { error: `${unfinished.length} game(s) are not final yet. Wait for the week to wrap, or send force:true to settle with the games that have finished.`, status: 422 };
  }

  // Week-wide passing & rushing leaders from each game's leader block
  const facts = { passing: null, rushing: null, firstTd: null, turnovers: null, turnoverCount: null };
  let bestPass = -1; let bestRush = -1;
  for (const event of events) {
    for (const leaderBlock of event?.competitions?.[0]?.leaders ?? []) {
      const top = leaderBlock?.leaders?.[0];
      if (!top?.athlete?.displayName) continue;
      const value = Number(top.value ?? 0);
      if (leaderBlock.name === 'passingYards' && value > bestPass) { bestPass = value; facts.passing = { player: top.athlete.displayName, yards: value }; }
      if (leaderBlock.name === 'rushingYards' && value > bestRush) { bestRush = value; facts.rushing = { player: top.athlete.displayName, yards: value }; }
    }
  }

  // Kickoff game (earliest completed): first TD scorer + total turnovers O/U 4.5
  const kickoff = [...events].filter((event) => event?.status?.type?.completed).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  if (kickoff) {
    try {
      const summary = await fetchEspnJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${kickoff.id}`);
      const firstTdPlay = (summary?.scoringPlays ?? []).find((play) => /touchdown/i.test(play?.type?.text ?? ''));
      if (firstTdPlay?.text) {
        const match = firstTdPlay.text.match(/^([A-Za-z.'\- ]+?)\s+\d+\s+Yd/);
        if (match) facts.firstTd = { player: match[1].trim(), play: firstTdPlay.text.slice(0, 120) };
      }
      let turnoverTotal = 0; let sawStat = false;
      for (const team of summary?.boxscore?.teams ?? []) {
        const stat = (team.statistics ?? []).find((s) => s.name === 'turnovers');
        if (stat) { sawStat = true; turnoverTotal += Number(stat.displayValue ?? 0); }
      }
      if (sawStat) { facts.turnoverCount = turnoverTotal; facts.turnovers = turnoverTotal > 4.5 ? 'over' : 'under'; }
    } catch (error) {
      console.error('Prop auto-settle summary fetch failed:', error.message);
    }
  }

  // Match every player's saved picks against the facts
  const winners = { passing: [], rushing: [], firstTd: [], turnovers: [] };
  for (const [playerId, picks] of Object.entries(weekPicks)) {
    if (facts.passing && picks.passing && namesMatch(picks.passing, facts.passing.player)) winners.passing.push(playerId);
    if (facts.rushing && picks.rushing && namesMatch(picks.rushing, facts.rushing.player)) winners.rushing.push(playerId);
    if (facts.firstTd && picks.firstTd && namesMatch(picks.firstTd, facts.firstTd.player)) winners.firstTd.push(playerId);
    if (facts.turnovers && picks.turnovers === facts.turnovers) winners.turnovers.push(playerId);
  }

  await store.mergeLeagueSettings(leagueId, (s) => {
    s.propResults = s.propResults ?? {};
    s.propResults[week] = { winners, facts, settledAt: new Date().toISOString(), settledBy: actor, auto: true };
  });
  return { week, winners, facts };
}

app.post('/api/leagues/:leagueId/props/auto-settle', auth.requireAdmin, asyncRoute(async (request, response) => {
  const week = Number(request.body?.week);
  if (!Number.isInteger(week) || week < 1 || week > 18) return response.status(422).json({ error: 'A valid week (1-18) is required.' });
  const result = await autoSettlePropsForWeek({ leagueId: request.params.leagueId, week, force: Boolean(request.body?.force), actor: request.actor ?? 'admin' });
  if (result.error) return response.status(result.status ?? 422).json({ error: result.error });
  return response.json(result);
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
  // Three-place payout split (percentages, descending, must total 100).
  let payoutSplit = current.payoutSplit ?? [60, 30, 10];
  if (Array.isArray(request.body?.payoutSplit)) {
    const split = request.body.payoutSplit.map(Number);
    if (split.length !== 3 || split.some((pct) => !Number.isFinite(pct) || pct < 0 || pct > 100)) {
      return response.status(422).json({ error: 'Payout split must be three percentages (1st, 2nd, 3rd).' });
    }
    if (Math.round(split[0] + split[1] + split[2]) !== 100) return response.status(422).json({ error: 'Payout split must add up to 100%.' });
    if (split[0] < split[1] || split[1] < split[2]) return response.status(422).json({ error: 'Payout split must be descending — 1st ≥ 2nd ≥ 3rd.' });
    payoutSplit = split;
  }
  const seasonPool = { entryFee, paidPlayerIds, payoutSplit, updatedAt: new Date().toISOString() };
  await store.updateLeagueSettings(request.params.leagueId, { ...(league.settings ?? {}), seasonPool });
  return response.json({ seasonPool });
}));

/* ── CashApp Pool Link (Commissioner sets a sharable Cash App Pools URL) ── */
app.patch('/api/leagues/:leagueId/cashapp-pool', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const url = typeof request.body?.url === 'string' ? request.body.url.trim() : '';
  const label = typeof request.body?.label === 'string' ? request.body.label.trim().slice(0, 80) : '';
  // Allow clearing by sending empty url
  const cashAppPool = url ? { url, label: label || 'Pay Entry Fee', updatedAt: new Date().toISOString() } : null;
  await store.updateLeagueSettings(request.params.leagueId, { ...(league.settings ?? {}), cashAppPool });
  return response.json({ cashAppPool });
}));

/* Toggle weekly College Pick-Em autopilot (open/lock/finalize hands-free) */
app.patch('/api/leagues/:leagueId/cfb-auto', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const settings = league.settings ?? {};
  const next = { ...settings };
  if (typeof request.body?.enabled === 'boolean') next.cfbAuto = request.body.enabled;
  if (request.body?.entryFee != null) {
    const fee = Number(request.body.entryFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000) return response.status(422).json({ error: 'Entry fee must be between $0 and $1000.' });
    next.cfbAutoFee = fee;
  }
  if (request.body?.max != null) {
    const max = Number(request.body.max);
    if (!Number.isInteger(max) || max < 3 || max > 20) return response.status(422).json({ error: 'Slate size must be between 3 and 20.' });
    next.cfbAutoMax = max;
  }
  await store.updateLeagueSettings(request.params.leagueId, next);
  return response.json({ cfbAuto: next.cfbAuto !== false, cfbAutoFee: next.cfbAutoFee ?? 10, cfbAutoMax: next.cfbAutoMax ?? 12 });
}));

/* ── CFB Data — proxies ESPN free API for college football rankings, games & spreads ── */
const cfbCache = { rankings: null, rankingsAt: 0, scoreboard: {}, scoreboardAt: {} };
const CFB_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/cfb/rankings', asyncRoute(async (_request, response) => {
  const now = Date.now();
  if (cfbCache.rankings && now - cfbCache.rankingsAt < CFB_CACHE_TTL) {
    return response.json(cfbCache.rankings);
  }
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings');
    const data = await res.json();
    const ap = data.rankings?.find((r) => r.name === 'AP Top 25' || r.name?.includes('AP'));
    const teams = (ap?.ranks ?? []).map((r) => ({
      rank: r.current,
      prevRank: r.previous,
      team: r.team?.nickname || r.team?.displayName || '?',
      abbr: r.team?.abbreviation || '?',
      logo: r.team?.logos?.[0]?.href || '',
      record: r.recordSummary || '',
      points: r.points,
    }));
    const result = { name: ap?.name || 'AP Top 25', season: ap?.season?.year || 2026, teams };
    cfbCache.rankings = result;
    cfbCache.rankingsAt = now;
    return response.json(result);
  } catch (error) {
    console.error('CFB rankings fetch error:', error.message);
    return response.status(502).json({ error: 'Failed to fetch CFB rankings.' });
  }
}));

async function fetchCfbWeek(week, { force = false } = {}) {
  const now = Date.now();
  const cacheKey = `w${week}`;
  if (!force && cfbCache.scoreboard[cacheKey] && now - (cfbCache.scoreboardAt[cacheKey] || 0) < CFB_CACHE_TTL) {
    return cfbCache.scoreboard[cacheKey];
  }
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?week=${week}&groups=80&limit=60`);
  const data = await res.json();
  const games = (data.events ?? []).map((ev) => {
    const comp = ev.competitions?.[0];
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const odds = comp?.odds?.[0];
    const isFinal = (comp?.status?.type?.name || '').includes('FINAL');
    return {
      id: ev.id,
      name: ev.shortName || ev.name,
      date: comp?.date || ev.date,
      status: comp?.status?.type?.name || 'scheduled',
      statusDetail: comp?.status?.type?.shortDetail || '',
      final: isFinal,
      away: {
        abbr: away?.team?.abbreviation || '?',
        name: away?.team?.displayName || '?',
        logo: away?.team?.logo || '',
        rank: away?.curatedRank?.current && away.curatedRank.current <= 25 ? away.curatedRank.current : null,
        score: away?.score != null ? Number(away.score) : null,
      },
      home: {
        abbr: home?.team?.abbreviation || '?',
        name: home?.team?.displayName || '?',
        logo: home?.team?.logo || '',
        rank: home?.curatedRank?.current && home.curatedRank.current <= 25 ? home.curatedRank.current : null,
        score: home?.score != null ? Number(home.score) : null,
      },
      spread: odds?.details || null,
      homeSpread: Number.isFinite(Number(odds?.spread)) ? Number(odds.spread) : null,
      overUnder: odds?.overUnder || null,
      isRanked: Boolean(
        (away?.curatedRank?.current && away.curatedRank.current <= 25) ||
        (home?.curatedRank?.current && home.curatedRank.current <= 25)
      ),
    };
  });
  // Sort: ranked matchups first, then by date
  games.sort((a, b) => {
    if (a.isRanked && !b.isRanked) return -1;
    if (!a.isRanked && b.isRanked) return 1;
    return new Date(a.date) - new Date(b.date);
  });
  const result = { week, season: data.season?.year || 2026, totalGames: games.length, games };
  cfbCache.scoreboard[cacheKey] = result;
  cfbCache.scoreboardAt[cacheKey] = now;
  return result;
}

app.get('/api/cfb/scoreboard', asyncRoute(async (request, response) => {
  const week = Number(request.query.week) || 1;
  try {
    return response.json(await fetchCfbWeek(week));
  } catch (error) {
    console.error('CFB scoreboard fetch error:', error.message);
    return response.status(502).json({ error: 'Failed to fetch CFB scoreboard.' });
  }
}));

/* ── CFB automation helpers (shared by manual endpoints, the one-tap
   auto-builder, and the weekly auto-pilot cron) ── */

async function fetchCurrentCfbWeek() {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=1');
    const data = await res.json();
    const wk = Number(data?.week?.number);
    return Number.isInteger(wk) && wk >= 1 && wk <= 16 ? wk : 1;
  } catch { return 1; }
}

function cfbBestRank(game) {
  const ranks = [game.away?.rank, game.home?.rank].filter((r) => r != null);
  return ranks.length ? Math.min(...ranks) : 99;
}

/* Auto-pick a slate: every upcoming Top-25 matchup first (best rank first),
   topped up with the next scheduled games that have a posted line. */
function selectAutoCfbGameIds(scoreboard, max = 12) {
  const upcoming = (scoreboard.games ?? []).filter((g) =>
    g.away?.abbr && g.home?.abbr && !g.final &&
    String(g.status || '').toUpperCase().includes('SCHEDULED'));
  const ranked = upcoming.filter((g) => g.isRanked).sort((a, b) => cfbBestRank(a) - cfbBestRank(b));
  const chosen = ranked.slice(0, max);
  if (chosen.length < max) {
    const chosenIds = new Set(chosen.map((g) => g.id));
    const fillers = upcoming
      .filter((g) => !chosenIds.has(g.id) && g.homeSpread != null)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    for (const g of fillers) { if (chosen.length >= max) break; chosen.push(g); }
  }
  return chosen.map((g) => g.id);
}

function assembleCfbPool({ existing, week, season, entryFee, gameIds, byId }) {
  const games = gameIds.map((id) => {
    const g = byId.get(id);
    return {
      id: g.id, name: g.name, date: g.date,
      away: { abbr: g.away.abbr, name: g.away.name, logo: g.away.logo, rank: g.away.rank },
      home: { abbr: g.home.abbr, name: g.home.name, logo: g.home.logo, rank: g.home.rank },
      homeSpread: g.homeSpread,
      spreadLabel: g.spread ?? (g.homeSpread != null ? `${g.home.abbr} ${g.homeSpread > 0 ? '+' : ''}${g.homeSpread}` : 'Pick-em'),
      overUnder: g.overUnder,
    };
  }).sort((a, b) => new Date(a.date) - new Date(b.date));
  return {
    id: `cfb-w${week}`, week, season, entryFee,
    status: 'open', games,
    entries: existing?.entries ?? {}, scores: existing?.scores ?? {},
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/* Pull latest scores from ESPN into a pool; flip to final when all games done. */
async function syncCfbPoolScores(leagueId, pool) {
  const scoreboard = await fetchCfbWeek(pool.week, { force: true });
  const byId = new Map(scoreboard.games.map((g) => [g.id, g]));
  pool.scores = pool.scores ?? {};
  let updated = 0;
  for (const game of pool.games ?? []) {
    const live = byId.get(game.id);
    if (!live || live.home.score == null || live.away.score == null) continue;
    pool.scores[game.id] = { homeScore: live.home.score, awayScore: live.away.score, final: live.final, statusDetail: live.statusDetail };
    updated += 1;
  }
  const allFinal = (pool.games ?? []).length > 0 && pool.games.every((g) => pool.scores[g.id]?.final);
  if (allFinal) pool.status = 'final';
  else if (pool.status === 'final') pool.status = 'locked';
  pool.updatedAt = new Date().toISOString();
  await store.saveCfbPool(leagueId, pool);
  return { updated, allFinal };
}

/* Credit a finalized pool's pot to the winner(s). Idempotent. */
async function creditCfbPoolWinners(leagueId, pool, actor = 'admin') {
  if (pool.status !== 'final') return { ok: false, error: 'Sync scores until every game is final before paying out.' };
  if (pool.potCredited) return { ok: false, error: 'This pot was already credited to the winners.' };
  const { gradeCfbPool } = await import('../src/cfbPool.js');
  const board = gradeCfbPool(pool);
  if (!board.complete || !board.winners.length) return { ok: false, error: 'No winners to credit yet.' };
  // Only players who PAID the entry are eligible for the pot — an unpaid best
  // record wins bragging rights but can't be credited money they never put in.
  const paidWinners = board.winners.filter((w) => pool.entries?.[w.playerId]?.paid);
  if (!paidWinners.length) return { ok: false, error: 'The top record(s) haven’t paid — no one is eligible for the pot yet.' };
  const pot = Object.values(pool.entries ?? {}).filter((e) => e.paid).length * (Number(pool.entryFee) || 0);
  if (pot <= 0) return { ok: false, error: 'The pot is $0 — mark entries paid first.' };
  const share = Math.floor((pot / paidWinners.length) * 100) / 100;
  const at = new Date().toISOString();
  const reason = `CFB Week ${pool.week} pot — winner${paidWinners.length > 1 ? ' (split)' : ''}`;
  // Atomic claim: only the first caller across all isolates credits this pot.
  const claimed = await store.claimOnce(leagueId, `cfb-pot-${pool.id}`);
  if (!claimed) return { ok: false, error: 'This pot was already credited to the winners.' };
  try {
    const league = await store.getLeague(leagueId);
    const alreadyCredited = new Set((league?.creditLedger ?? []).filter((e) => e.reason === reason && e.amount === share).map((e) => e.playerId));
    for (const winner of paidWinners) {
      if (alreadyCredited.has(winner.playerId)) continue;
      await store.addCreditEntry(leagueId, { id: randomUUID(), playerId: winner.playerId, amount: share, reason, by: actor, at });
    }
    pool.potCredited = true;
    pool.updatedAt = at;
    await store.saveCfbPool(leagueId, pool);
  } catch (error) {
    // Payout failed mid-write — release the claim so a later run can retry.
    await store.releaseClaim(leagueId, `cfb-pot-${pool.id}`).catch(() => {});
    throw error;
  }
  return { ok: true, pot, share, winners: paidWinners.map((w) => w.name) };
}

/* ── CFB Pick-Em Pool — commissioner builds a weekly ATS slate, players pick every game ── */
app.post('/api/leagues/:leagueId/cfb-pool', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number(request.body?.week);
  if (!Number.isInteger(week) || week < 1 || week > 16) return response.status(422).json({ error: 'A valid CFB week (1–16) is required.' });
  const entryFee = Number(request.body?.entryFee ?? 10);
  if (!Number.isFinite(entryFee) || entryFee < 0 || entryFee > 1000) return response.status(422).json({ error: 'Entry fee must be between $0 and $1000.' });
  const gameIds = Array.isArray(request.body?.gameIds) ? [...new Set(request.body.gameIds.map(String))] : [];
  if (gameIds.length < 3 || gameIds.length > 20) return response.status(422).json({ error: 'Pick between 3 and 20 games for the slate.' });

  let scoreboard;
  try { scoreboard = await fetchCfbWeek(week); }
  catch { return response.status(502).json({ error: 'Could not fetch this week’s games from ESPN. Try again in a minute.' }); }
  const byId = new Map(scoreboard.games.map((g) => [g.id, g]));
  const missing = gameIds.filter((id) => !byId.has(id));
  if (missing.length) return response.status(422).json({ error: 'Some selected games were not found for that week. Reload games and try again.' });

  const poolId = `cfb-w${week}`;
  const existing = (league.cfbPools ?? []).find((p) => p.id === poolId);
  if (existing && Object.keys(existing.entries ?? {}).length > 0) {
    return response.status(409).json({ error: 'That week already has a pool with picks submitted. Lock or finalize it instead of rebuilding.' });
  }
  const pool = assembleCfbPool({ existing, week, season: scoreboard.season, entryFee, gameIds, byId });
  await store.saveCfbPool(request.params.leagueId, pool);
  return response.status(201).json(pool);
}));

/* One-tap auto-builder: fill the slate straight from the AP Top 25 (+ next
   games with a line), no hand-picking. Same guardrails as the manual builder. */
app.post('/api/leagues/:leagueId/cfb-pool/auto', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const week = Number.isInteger(Number(request.body?.week)) ? Number(request.body.week) : await fetchCurrentCfbWeek();
  if (!Number.isInteger(week) || week < 1 || week > 16) return response.status(422).json({ error: 'A valid CFB week (1–16) is required.' });
  const entryFee = Number(request.body?.entryFee ?? 10);
  if (!Number.isFinite(entryFee) || entryFee < 0 || entryFee > 1000) return response.status(422).json({ error: 'Entry fee must be between $0 and $1000.' });
  const max = Math.min(20, Math.max(3, Number(request.body?.max) || 12));

  let scoreboard;
  try { scoreboard = await fetchCfbWeek(week, { force: true }); }
  catch { return response.status(502).json({ error: 'Could not fetch this week’s games from ESPN. Try again in a minute.' }); }

  const existing = (league.cfbPools ?? []).find((p) => p.id === `cfb-w${week}`);
  if (existing && Object.keys(existing.entries ?? {}).length > 0) {
    return response.status(409).json({ error: 'That week already has a pool with picks submitted. Lock or finalize it instead of rebuilding.' });
  }
  const gameIds = selectAutoCfbGameIds(scoreboard, max);
  if (gameIds.length < 3) return response.status(422).json({ error: `Not enough upcoming Week ${week} games with posted lines yet. Try again once ESPN has more spreads up.` });

  const byId = new Map(scoreboard.games.map((g) => [g.id, g]));
  const pool = assembleCfbPool({ existing, week, season: scoreboard.season, entryFee, gameIds, byId });
  await store.saveCfbPool(request.params.leagueId, pool);
  return response.status(201).json(pool);
}));

app.patch('/api/leagues/:leagueId/cfb-pool/:poolId', auth.requireAdmin, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  const status = request.body?.status;
  if (status && !['open', 'locked', 'final'].includes(status)) return response.status(422).json({ error: 'Status must be open, locked, or final.' });
  if (status) pool.status = status;
  if (request.body?.entryFee != null) {
    const entryFee = Number(request.body.entryFee);
    if (!Number.isFinite(entryFee) || entryFee < 0 || entryFee > 1000) return response.status(422).json({ error: 'Entry fee must be between $0 and $1000.' });
    pool.entryFee = entryFee;
  }
  pool.updatedAt = new Date().toISOString();
  await store.saveCfbPool(request.params.leagueId, pool);
  return response.json(pool);
}));

app.post('/api/leagues/:leagueId/cfb-pool/:poolId/picks', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  const picks = request.body?.picks;
  const tiebreaker = request.body?.tiebreaker;
  const { validateCfbPicks } = await import('../src/cfbPool.js');
  const verdict = validateCfbPicks({ pool, picks, tiebreaker });
  if (!verdict.ok) return response.status(422).json({ error: verdict.error });
  const entry = {
    playerId: request.player.id,
    name: request.player.name,
    picks: Object.fromEntries((pool.games ?? []).map((g) => [g.id, picks[g.id]])),
    tiebreaker: Number(tiebreaker),
    paid: pool.entries?.[request.player.id]?.paid ?? false,
    submittedAt: pool.entries?.[request.player.id]?.submittedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const saved = await store.saveCfbPoolEntry(request.params.leagueId, request.params.poolId, entry);
  if (!saved) return response.status(404).json({ error: 'Pool not found.' });
  return response.status(201).json({ entry, poolId: pool.id });
}));

app.patch('/api/leagues/:leagueId/cfb-pool/:poolId/paid', auth.requireAdmin, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  const playerId = String(request.body?.playerId ?? '');
  const entry = pool.entries?.[playerId];
  if (!entry) return response.status(404).json({ error: 'No entry for that player.' });
  entry.paid = Boolean(request.body?.paid);
  const saved = await store.saveCfbPoolEntry(request.params.leagueId, request.params.poolId, entry);
  return response.json({ entry, poolId: saved.id });
}));

app.post('/api/leagues/:leagueId/cfb-pool/:poolId/sync-scores', auth.requireAdmin, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  let result;
  try { result = await syncCfbPoolScores(request.params.leagueId, pool); }
  catch { return response.status(502).json({ error: 'Could not fetch scores from ESPN. Try again in a minute.' }); }
  return response.json({ pool, updated: result.updated, allFinal: result.allFinal });
}));

/* ── Player credits — the app tracks money between friends; it never moves real money ── */
app.post('/api/leagues/:leagueId/credits', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const playerId = String(request.body?.playerId ?? '');
  if (!(league.players ?? []).some((p) => p.id === playerId)) return response.status(404).json({ error: 'Player not found.' });
  const { validateCreditEntry, creditBalance } = await import('../src/credits.js');
  const verdict = validateCreditEntry({ amount: request.body?.amount, reason: request.body?.reason });
  if (!verdict.ok) return response.status(422).json({ error: verdict.error });
  const balance = creditBalance(league.creditLedger ?? [], playerId);
  if (balance + verdict.value < 0) return response.status(422).json({ error: `That would put the balance below $0 (current: $${balance}).` });
  const entry = { id: randomUUID(), playerId, amount: verdict.value, reason: String(request.body.reason).trim().slice(0, 120), by: 'admin', at: new Date().toISOString() };
  await store.addCreditEntry(request.params.leagueId, entry);
  return response.status(201).json({ entry, balance: Math.round((balance + verdict.value) * 100) / 100 });
}));

app.post('/api/leagues/:leagueId/cfb-pool/:poolId/pay-with-credit', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const result = await store.payCfbEntryWithCredit(request.params.leagueId, request.params.poolId, request.player.id, request.player.name);
  if (!result) return response.status(404).json({ error: 'Pool not found.' });
  if (!result.ok) return response.status(422).json({ error: result.error });
  return response.json(result);
}));

app.post('/api/leagues/:leagueId/sheets/:sheetId/pay-with-credit', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const fee = Number(league.settings?.entryFee) || 20;
  const result = await store.paySheetWithCredit(request.params.leagueId, request.params.sheetId, request.player.id, request.player.name, fee);
  if (!result) return response.status(404).json({ error: 'Sheet not found.' });
  if (!result.ok) return response.status(422).json({ error: result.error });
  return response.json(result);
}));

app.post('/api/leagues/:leagueId/cfb-pool/:poolId/credit-winners', auth.requireAdmin, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  const result = await creditCfbPoolWinners(request.params.leagueId, pool, 'admin');
  if (!result.ok) return response.status(pool.potCredited ? 409 : 422).json({ error: result.error });
  return response.json({ pot: result.pot, share: result.share, winners: result.winners });
}));

/* ── Payment claims — player says "I sent it", commissioner confirms in one tap ── */
app.post('/api/leagues/:leagueId/sheets/:sheetId/claim-payment', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const sheet = (league.sheets ?? []).find((s) => s.id === request.params.sheetId);
  if (!sheet) return response.status(404).json({ error: 'Sheet not found.' });
  if (sheet.playerId !== request.player.id) return response.status(403).json({ error: 'You can only claim payment for your own sheet.' });
  if (sheet.paid) return response.status(422).json({ error: 'This sheet is already marked paid.' });
  const paymentClaim = { claimedAt: new Date().toISOString(), method: preferredHandle(request.player)?.key ?? 'cashapp', amount: Number(league.settings?.entryFee) || 20 };
  const updated = await store.updateSheetFields(request.params.leagueId, request.params.sheetId, { paymentClaim });
  await store.writeAudit(request.params.leagueId, 'payment.claimed', `${request.player.name} says they sent $${paymentClaim.amount} for Week ${sheet.week}`, request.player.id, { sheetId: sheet.id });
  await saveNotification(request.params.leagueId, { playerId: request.player.id, kind: 'payment_claimed', title: `Payment claimed — Week ${sheet.week}`, body: `You claimed $${paymentClaim.amount} sent for Week ${sheet.week}. Waiting for commissioner to confirm.`, metadata: { week: sheet.week, amount: paymentClaim.amount } });
  return response.json(updated);
}));

app.post('/api/leagues/:leagueId/cfb-pool/:poolId/claim-payment', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const pool = await store.getCfbPool(request.params.leagueId, request.params.poolId);
  if (!pool) return response.status(404).json({ error: 'Pool not found.' });
  const entry = pool.entries?.[request.player.id];
  if (!entry) return response.status(422).json({ error: 'Submit your picks first, then claim your payment.' });
  if (entry.paid) return response.status(422).json({ error: 'This entry is already marked paid.' });
  entry.paymentClaim = { claimedAt: new Date().toISOString(), method: preferredHandle(request.player)?.key ?? 'cashapp', amount: Number(pool.entryFee) || 0 };
  await store.saveCfbPoolEntry(request.params.leagueId, request.params.poolId, entry);
  await store.writeAudit(request.params.leagueId, 'payment.claimed', `${request.player.name} says they sent $${entry.paymentClaim.amount} for CFB Week ${pool.week}`, request.player.id, { poolId: pool.id });
  return response.json({ entry });
}));

app.delete('/api/leagues/:leagueId/sheets/:sheetId', auth.requireAdmin, asyncRoute(async (request, response) => {
  const removed = await store.deleteSheet(request.params.leagueId, request.params.sheetId, request.actor ?? 'commissioner');
  if (!removed) return response.status(404).json({ error: 'Sheet not found.' });
  return response.json({ removed });
}));

app.patch('/api/leagues/:leagueId/sheets/:sheetId/paid', auth.requireAdmin, asyncRoute(async (request, response) => {
  const updated = await store.updateSheetFields(request.params.leagueId, request.params.sheetId, { paid: Boolean(request.body?.paid) });
  if (!updated) return response.status(404).json({ error: 'Sheet not found.' });
  await store.writeAudit(request.params.leagueId, 'sheet.paid_updated', `${updated.name}'s Week ${updated.week} sheet marked ${updated.paid ? 'PAID' : 'unpaid'}`, 'admin', { sheetId: updated.id });
  if (updated.paid) {
    await saveNotification(request.params.leagueId, { playerId: updated.playerId, kind: 'payment_confirmed', title: `Payment confirmed — Week ${updated.week}`, body: `Commissioner confirmed your Week ${updated.week} entry fee is paid.`, metadata: { week: updated.week } });
  }
  return response.json(updated);
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
    winnerPlayerIds: Array.isArray(request.body?.winnerPlayerIds) ? request.body.winnerPlayerIds.map((id) => String(id).slice(0, 80)).slice(0, 10) : [],
    method: String(request.body?.method ?? 'cash').slice(0, 30),
    note: String(request.body?.note ?? '').slice(0, 200),
    paidAt: new Date().toISOString(),
    paidBy: request.actor,
  };
  await store.savePayout(request.params.leagueId, payout);
  await saveNotification(request.params.leagueId, { kind: 'payout', title: `Week ${payout.week} payout — $${payout.amount}`, body: `${payout.winnerNames?.join(' & ') || 'Winner'} received $${payout.amount} for Week ${payout.week}.`, metadata: { week: payout.week, amount: payout.amount, payoutId: payout.id } });
  return response.status(201).json(payout);
}));

/* ── Payment history — detailed per-player payment tracking ── */
app.get('/api/leagues/:leagueId/payment-history', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const playerId = request.player.id;
  const entryFee = Number(league.settings?.entryFee) || 20;

  // Gather all payment events for this player
  const mySheets = (league.sheets ?? []).filter((s) => s.playerId === playerId);
  const myPayouts = (league.payouts ?? []).filter((p) => {
    // Match by playerId first (reliable), fall back to exact name match
    if ((p.winnerPlayerIds ?? []).includes(playerId)) return true;
    const player = (league.players ?? []).find((pl) => pl.id === playerId);
    return player && (p.winnerNames ?? []).some((n) => n.toLowerCase() === player.name.toLowerCase());
  });
  const myCredits = (league.creditLedger ?? []).filter((c) => c.playerId === playerId);

  const history = [];

  // Sheet submissions (entry fees)
  for (const sheet of mySheets) {
    history.push({
      id: `entry-${sheet.id}`,
      type: 'entry_fee',
      week: sheet.week,
      amount: -entryFee,
      method: sheet.paidVia ?? null,
      status: sheet.paid ? 'confirmed' : sheet.paymentClaim ? 'claimed' : 'unpaid',
      claimedAt: sheet.paymentClaim?.claimedAt ?? null,
      submittedAt: sheet.submittedAt,
      at: sheet.submittedAt,
    });
  }

  // Payouts received
  for (const payout of myPayouts) {
    history.push({
      id: `payout-${payout.id}`,
      type: 'payout',
      week: payout.week,
      pool: payout.pool,
      amount: payout.amount,
      status: 'paid',
      method: payout.method,
      at: payout.paidAt,
    });
  }

  // Credit transactions — but NOT the mirror entries of an entry fee paid from
  // credit or a pot paid into credit; those are already shown as the entry_fee /
  // payout rows above, and listing both reads as a double charge / double win.
  for (const credit of myCredits) {
    const reason = String(credit.reason ?? '');
    if (credit.amount < 0 && /entry/i.test(reason)) continue;
    if (credit.amount > 0 && /winnings|pot\b/i.test(reason)) continue;
    history.push({
      id: `credit-${credit.id}`,
      type: 'credit',
      amount: credit.amount,
      reason: credit.reason,
      status: 'completed',
      at: credit.at,
    });
  }

  // Sort newest first
  history.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));

  const totalPaid = mySheets.filter((s) => s.paid).length * entryFee;
  const totalWon = myPayouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const creditBalance = myCredits.reduce((sum, c) => sum + c.amount, 0);

  return response.json({
    playerId,
    entryFee,
    summary: {
      totalWeeksPaid: mySheets.filter((s) => s.paid).length,
      totalWeeksUnpaid: mySheets.filter((s) => !s.paid).length,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalWon: Math.round(totalWon * 100) / 100,
      creditBalance: Math.round(creditBalance * 100) / 100,
      // Net = what you won minus what you paid in. Credit balance is shown
      // separately (it's where winnings land) — folding it in here would
      // double-count the winnings that are already in totalWon.
      netPosition: Math.round((totalWon - totalPaid) * 100) / 100,
    },
    history,
  });
}));

/* ── Commissioner payment overview — all players, all weeks ── */
app.get('/api/leagues/:leagueId/payment-overview', auth.requireAdmin, asyncRoute(async (request, response) => {
  const league = await store.getLeague(request.params.leagueId);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  const entryFee = Number(league.settings?.entryFee) || 20;
  const players = league.players ?? [];
  const sheets = league.sheets ?? [];
  const payouts = league.payouts ?? [];

  const playerSummaries = players.map((p) => {
    const playerSheets = sheets.filter((s) => s.playerId === p.id);
    const paidWeeks = playerSheets.filter((s) => s.paid);
    const unpaidSheets = playerSheets.filter((s) => !s.paid);
    const claimedSheets = unpaidSheets.filter((s) => s.paymentClaim);
    return {
      playerId: p.id,
      name: p.name,
      totalSheets: playerSheets.length,
      paidCount: paidWeeks.length,
      unpaidCount: unpaidSheets.length,
      claimedCount: claimedSheets.length,
      totalOwed: Math.round(unpaidSheets.length * entryFee * 100) / 100,
      status: unpaidSheets.length === 0 ? 'current' : claimedSheets.length > 0 ? 'has_claims' : 'behind',
      unpaidWeeks: unpaidSheets.map((s) => ({ week: s.week, sheetId: s.id, claimed: Boolean(s.paymentClaim), claimedAt: s.paymentClaim?.claimedAt })),
    };
  });

  const totalCollected = sheets.filter((s) => s.paid).length * entryFee;
  const totalOutstanding = sheets.filter((s) => !s.paid).length * entryFee;
  const totalPaidOut = payouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return response.json({
    entryFee,
    summary: { totalCollected, totalOutstanding, totalPaidOut, potBalance: Math.round((totalCollected - totalPaidOut) * 100) / 100 },
    players: playerSummaries.sort((a, b) => b.unpaidCount - a.unpaidCount),
    recentPayouts: payouts.slice(-20).reverse(),
  });
}));

/* ── Notification history ── */
app.get('/api/leagues/:leagueId/notifications', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  if (request.player.leagueId !== request.params.leagueId) return response.status(403).json({ error: 'This player does not belong to that league.' });
  const limit = Math.min(Number(request.query.limit) || 50, 100);
  const kinds = request.query.kinds ? String(request.query.kinds).split(',') : null;
  const notifications = await store.getNotifications(request.params.leagueId, { playerId: request.player.id, limit, kinds });
  return response.json({ notifications });
}));

app.get('/api/leagues/:leagueId/notifications/all', auth.requireAdmin, asyncRoute(async (request, response) => {
  const limit = Math.min(Number(request.query.limit) || 100, 200);
  const notifications = await store.getNotifications(request.params.leagueId, { limit });
  return response.json({ notifications });
}));

/* ── Jack voice (server-side TTS; API key never reaches the browser) ── */
app.get('/api/tts/diagnose', auth.requireAdmin, asyncRoute(async (_request, response) => {
  const { createJackTtsProvider } = await import('./ttsService.js');
  const provider = createJackTtsProvider(process.env);
  if (typeof provider.diagnose !== 'function') return response.json({ provider: provider.kind, configured: provider.configured });
  return response.json(await provider.diagnose());
}));

app.post('/api/tts/diagnose', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (!checkPlayerRate(TTS_RATE, 'admin-voice-test', 3, 60_000)) return response.status(429).json({ error: 'Wait a minute before testing the studio voice again.' });
  const { createJackTtsProvider } = await import('./ttsService.js');
  const provider = createJackTtsProvider(process.env);
  return response.json(provider.diagnose ? await provider.diagnose({ testAudio: true }) : { provider: provider.kind, configured: false });
}));

app.post('/api/tts', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  if (!checkPlayerRate(TTS_RATE, request.player.id, 10, 60_000)) {
    return response.status(429).json({ error: 'Voice limit reached — 10 per minute. The browser voice will fill in.', fallback: 'browser' });
  }
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

app.post('/api/gemini', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const geminiKey = await getGeminiKey();
  if (!geminiKey.value) return response.status(503).json({ error: 'Gemini is not configured. Add GEMINI_API_KEY to .env and restart the server.' });
  const { generateGeminiText } = await import('./geminiService.js');
  const generated = await generateGeminiText({ client: new GoogleGenAI({ apiKey: geminiKey.value }), model, action: request.body?.action, payload: request.body?.payload });
  return response.json(generated);
}));

/* ── Push notifications (Web Push) ── */
const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@405badguys.com';
let webpush = null;
if (vapidPublic && vapidPrivate) {
  try {
    const wp = (await import('web-push')).default;
    wp.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    webpush = wp;
    console.log('Web Push configured with VAPID keys.');
  } catch { console.log('web-push not available — push disabled.'); }
}

app.get('/api/push/vapid-public', (_request, response) => {
  if (!webpush) return response.status(503).json({ error: 'Push notifications not configured.' });
  response.json({ vapidPublicKey: vapidPublic });
});

const subscribePush = asyncRoute(async (request, response) => {
  if (!webpush) return response.status(503).json({ error: 'Push not configured.' });
  const lid = request.params.leagueId ?? request.player.leagueId;
  if (lid !== request.player.leagueId) return response.status(403).json({ error: 'This player does not belong to that league.' });
  if (request.body?.playerId && request.body.playerId !== request.player.id) return response.status(409).json({ error: 'The signed-in player changed. Enable push again.' });
  let sub;
  try { sub = validatePushSubscription(request.body?.subscription); }
  catch (error) { return response.status(422).json({ error: error.message }); }
  const league = await store.getLeague(lid);
  if (!league) return response.status(404).json({ error: 'League not found.' });
  await store.mergeLeagueSettings(lid, (settings) => savePlayerSubscription(settings, request.player.id, sub));
  response.json({ ok: true });
});
app.post('/api/leagues/:leagueId/push/subscribe', playerAuth.requirePlayer, subscribePush);
app.post('/api/push/subscribe', playerAuth.requirePlayer, subscribePush);
app.delete('/api/push/subscribe', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  const endpoint = String(request.body?.endpoint ?? '');
  if (!endpoint) return response.status(422).json({ error: 'Device endpoint is required.' });
  await store.mergeLeagueSettings(request.player.leagueId, (settings) => removePlayerSubscription(settings, request.player.id, endpoint));
  response.json({ ok: true });
}));

app.post('/api/push/test', playerAuth.requirePlayer, asyncRoute(async (request, response) => {
  if (!webpush) return response.status(503).json({ error: 'Push not configured.' });
  if (!checkPlayerRate(ASSISTANT_RATE, `push-test-${request.player.id}`, 3, 60_000)) return response.status(429).json({ error: 'Wait a minute before another test notification.' });
  const endpoint = String(request.body?.endpoint ?? '');
  if (!endpoint) return response.status(422).json({ error: 'Select this device by including its endpoint.' });
  const report = await deliverPush({ store, leagueId: request.player.leagueId, webpush, playerIds: [request.player.id], endpoint, payload: { title: 'Jack notification test', body: 'This device is subscribed to your league alerts.', url: '/?view=notifs', tag: 'jack-push-test' } });
  return response.status(report.sent ? 200 : report.total ? 502 : 404).json({ ...report, ...(report.sent ? {} : { error: 'The test could not reach this subscription. Disable and enable push, then retry.' }) });
}));

app.get('/api/push/diagnose', auth.requireAdmin, asyncRoute(async (_request, response) => {
  const league = await store.getLeague(leagueId);
  const entries = Object.values(league?.settings?.pushSubscriptions ?? {});
  return response.json({ configured: Boolean(webpush), subscribedPlayers: entries.filter((value) => subscriptionsFor(value).length).length, subscribedDevices: entries.reduce((total, value) => total + subscriptionsFor(value).length, 0) });
}));

// Admin: send push to all subscribed players
app.post('/api/push/broadcast', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (!webpush) return response.status(503).json({ error: 'Push not configured.' });
  const { title, body, url, tag } = request.body ?? {};
  if (!body) return response.status(400).json({ error: 'Message body required.' });
  const report = await deliverPush({ store, leagueId, webpush, payload: { title: String(title || '405 Bad Guys Parlays').slice(0, 100), body: String(body).slice(0, 500), url: url || '/?view=notifs', tag: tag || 'broadcast' } });
  await saveNotification(leagueId, { kind: 'announcement', title: String(title || 'Commissioner announcement').slice(0, 100), body: String(body).slice(0, 500) });
  response.json(report);
}));

// Send deadline reminder push to players without sheets
app.post('/api/push/deadline-reminder', auth.requireAdmin, asyncRoute(async (request, response) => {
  if (!webpush) return response.status(503).json({ error: 'Push not configured.' });
  const week = Number(request.body?.week) || getCurrentWeek();
  if (isWeekLocked(week)) return response.status(422).json({ error: `Week ${week} is already locked.` });
  const league = await store.getLeague(leagueId);
  const submitted = new Set((league?.sheets ?? []).filter((s) => s.week === week).map((s) => s.playerId));
  const missing = (league?.players ?? []).filter((p) => p.id && !submitted.has(p.id));
  const deadline = getWeekDeadline(week);
  const deadlineStr = deadline ? deadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET' : 'soon';
  const report = await deliverPush({ store, leagueId, webpush, playerIds: missing.map((player) => player.id), payload: { title: 'Picks due ' + deadlineStr, body: `Your Week ${week} sheet isn't in yet. Open the app to submit your picks.`, url: '/?view=picks', tag: `deadline-w${week}` } });
  response.json({ ...report, missing: missing.length, week });
}));

/* ── COMMISSIONER AUTO-PILOT ─────────────────────────────────────────
   Runs the commissioner's routine chores automatically:
   1. Verify final scores from ESPN (results + rivalry chat)
   2. Auto-settle prop picks once the week's games are all final
   3. Push + SMS reminders to players missing sheets (24h and 3h before deadline)
   Triggered by: Vercel cron (/api/cron/auto-pilot) AND opportunistically
   (throttled) whenever anyone loads the league. Every action is logged to
   settings.autoPilotLog so the commissioner can see what ran. ── */
let autoPilotLastRun = 0;
let autoPilotRunning = false;

async function appendAutoPilotLog(league, entries) {
  if (!entries.length) return;
  const stamped = entries.map((message) => ({ at: new Date().toISOString(), message }));
  // Atomic merge so appending the log doesn't clobber settings (prop picks,
  // subscriptions) written by players while auto-pilot was running.
  await store.mergeLeagueSettings(leagueId, (s) => { s.autoPilotLog = [...stamped, ...(s.autoPilotLog ?? [])].slice(0, 30); });
}

/* Weekly College Pick-Em on autopilot: open each week's pool from the Top 25,
   lock at kickoff, then finalize and pay the pot — all hands-free. Gated by
   settings.cfbAuto (on unless the commissioner turns it off). */
async function autoManageCfb({ leagueId: lid, actions }) {
  const league = await store.getLeague(lid);
  const settings = league?.settings ?? {};
  if (settings.cfbAuto === false) return;
  const week = await fetchCurrentCfbWeek();
  let scoreboard;
  try { scoreboard = await fetchCfbWeek(week, { force: false }); } catch { return; }
  const poolId = `cfb-w${week}`;
  let pool = (league.cfbPools ?? []).find((p) => p.id === poolId);

  // 1. Auto-open the current week's pool from the Top 25 if none exists yet
  if (!pool) {
    const gameIds = selectAutoCfbGameIds(scoreboard, settings.cfbAutoMax || 12);
    if (gameIds.length >= 3) {
      const byId = new Map(scoreboard.games.map((g) => [g.id, g]));
      pool = assembleCfbPool({ existing: null, week, season: scoreboard.season, entryFee: settings.cfbAutoFee ?? 10, gameIds, byId });
      await store.saveCfbPool(lid, pool);
      try {
        await store.addChatMessage(lid, { id: `chat-cfb-open-w${week}`, playerId: null, name: 'Jack 🤖', msg: `🏟️ College Pick-Em is LIVE for Week ${week} — ${gameIds.length} games on the board, $${pool.entryFee} to get in. Pick every game against the spread before kickoff. 🎓`, time: new Date().toISOString() });
      } catch { /* chat is non-critical */ }
      actions.push(`Auto-opened CFB Week ${week} pool from the Top 25 (${gameIds.length} games).`);
    }
    await sweepPriorCfbPools({ lid, currentWeek: week, actions });
    return; // freshly opened — let players pick; still sweep older weeks above
  }

  // 2. Auto-lock once the first game kicks off
  if (pool.status === 'open') {
    const firstKick = pool.games.reduce((min, g) => Math.min(min, new Date(g.date).getTime()), Infinity);
    if (Number.isFinite(firstKick) && Date.now() >= firstKick) {
      pool.status = 'locked';
      pool.updatedAt = new Date().toISOString();
      await store.saveCfbPool(lid, pool);
      actions.push(`Locked CFB Week ${week} pool at kickoff.`);
    }
  }

  // 3. Auto-finalize + pay the pot when every game is final
  if (pool.status === 'locked' || pool.status === 'final') {
    try {
      const { allFinal } = await syncCfbPoolScores(lid, pool);
      if (allFinal && !pool.potCredited) {
        const credit = await creditCfbPoolWinners(lid, pool, 'auto-pilot');
        if (credit.ok) {
          const names = credit.winners.join(' & ');
          try {
            await store.addChatMessage(lid, { id: `chat-cfb-final-w${week}`, playerId: null, name: 'Jack 🤖', msg: `🎓🏁 CFB Week ${week} is official: ${names} take${credit.winners.length > 1 ? '' : 's'} the $${credit.pot} college pot${credit.winners.length > 1 ? ` ($${credit.share} each)` : ''}. Dropped straight into the balance. 💰`, time: new Date().toISOString() });
          } catch { /* chat is non-critical */ }
          actions.push(`Finalized CFB Week ${week} and credited $${credit.pot} to ${names}.`);
        }
      }
    } catch (error) { console.error('Auto-pilot CFB finalize failed:', error.message); }
  }

  await sweepPriorCfbPools({ lid, currentWeek: week, actions });
}

/* Finalize any earlier CFB weeks that are still locked/unpaid — covers the case
   where ESPN's week number rolled over before a prior week's late games ended. */
async function sweepPriorCfbPools({ lid, currentWeek, actions }) {
  try {
    const fresh = await store.getLeague(lid);
    for (const p of (fresh?.cfbPools ?? [])) {
      if (p.week === currentWeek || p.potCredited) continue;
      if (p.status !== 'locked' && p.status !== 'final') continue;
      try {
        const { allFinal } = await syncCfbPoolScores(lid, p);
        if (allFinal && !p.potCredited) {
          const credit = await creditCfbPoolWinners(lid, p, 'auto-pilot');
          if (credit.ok) {
            const names = credit.winners.join(' & ');
            try { await store.addChatMessage(lid, { id: `chat-cfb-final-w${p.week}`, playerId: null, name: 'Jack 🤖', msg: `🎓🏁 CFB Week ${p.week} is official: ${names} take${credit.winners.length > 1 ? '' : 's'} the $${credit.pot} college pot${credit.winners.length > 1 ? ` ($${credit.share} each)` : ''}. 💰`, time: new Date().toISOString() }); } catch { /* chat non-critical */ }
            actions.push(`Finalized CFB Week ${p.week} and credited $${credit.pot} to ${names}.`);
          }
        }
      } catch (error) { console.error(`Auto-pilot CFB sweep (week ${p.week}) failed:`, error.message); }
    }
  } catch (error) { console.error('Auto-pilot CFB sweep failed:', error.message); }
}

async function runAutoPilot({ source = 'traffic' } = {}) {
  if (autoPilotRunning) return { skipped: 'already running' };
  autoPilotRunning = true;
  const actions = [];
  try {
    const week = getCurrentWeek();
    const league = await store.getLeague(leagueId);
    if (!league) return { skipped: 'no league' };
    const settings = league.settings ?? {};

    // 1. Verify finals from ESPN
    try {
      const feed = await fetchLiveScores(week);
      const finals = (feed.scores ?? []).filter((s) => s.state === 'post' && s.completed);
      let verified = 0;
      for (const score of finals) {
        const existing = (league.results ?? {})[score.gameId];
        if (existing?.winner && existing?.verifiedAt) continue;
        const winner = score.awayScore === score.homeScore ? 'TIE' : (score.awayScore > score.homeScore ? score.away : score.home);
        await store.upsertResult(leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner }, 'auto-pilot');
        await maybePostRivalryChat(leagueId, score.gameId, { awayScore: score.awayScore, homeScore: score.homeScore, winner });
        verified += 1;
      }
      if (verified) actions.push(`Verified ${verified} final score(s) for Week ${week} from ESPN.`);
      await notifyFinalResults(leagueId, week);
    } catch (error) { console.error('Auto-pilot score sync failed:', error.message); }

    // 2. Auto-settle props when the whole week is final and picks exist
    try {
      const weekGames = getGames(week);
      const finalsCount = Object.entries(league.results ?? {}).filter(([gameId, r]) => r?.winner && weekGames.some((g) => g.id === gameId)).length;
      const hasPicks = Object.keys(settings.propPicks?.[week] ?? {}).length > 0;
      const alreadySettled = Boolean(settings.propResults?.[week]);
      if (hasPicks && !alreadySettled && weekGames.length && finalsCount === weekGames.length) {
        const result = await autoSettlePropsForWeek({ leagueId, week, actor: 'auto-pilot' });
        if (!result.error) actions.push(`Auto-settled Week ${week} props from ESPN (passing: ${result.facts?.passing?.player ?? '—'}, rushing: ${result.facts?.rushing?.player ?? '—'}).`);
      }
    } catch (error) { console.error('Auto-pilot prop settle failed:', error.message); }

    // 2.5 Auto weekly winner payout: when every game is verified final, the pot
    // goes to the winner's credit balance and Jack announces it in chat.
    try {
      const freshLeague = await store.getLeague(leagueId);
      const weekGames = getGames(week);
      const allVerified = weekGames.length > 0 && weekGames.every((g) => {
        const r = (freshLeague.results ?? {})[g.id];
        return r?.winner && r?.verifiedAt;
      });
      const weekSheets = (freshLeague.sheets ?? []).filter((s) => s.week === week);
      const alreadyPaid = (freshLeague.payouts ?? []).some((p) => p.week === week && p.pool === 'weekly');
      if (allVerified && weekSheets.length && !alreadyPaid) {
        const recognition = computeWinnerRecognition(freshLeague, week);
        // Atomic claim (only once a real winner is confirmed) so two concurrent
        // isolates can't both pay the weekly pot.
        const claimedWeekly = (recognition?.status === 'winner' || recognition?.status === 'co_winners') && recognition.week === week && recognition.winners?.length
          ? await store.claimOnce(leagueId, `weekly-pot-${week}`)
          : false;
        if (claimedWeekly) {
          try {
            const pot = weekSheets.filter((s) => s.paid).length * ENTRY_FEE;
            // Only PAID winners are eligible for the pot; an unpaid best record
            // takes bragging rights but isn't credited money they didn't put in.
            const winners = recognition.winners.filter((w) => weekSheets.some((s) => s.playerId === w.playerId && s.paid));
            if (pot <= 0 || !winners.length) {
              // Nothing payable — release the claim so it doesn't block a later run.
              await store.releaseClaim(leagueId, `weekly-pot-${week}`).catch(() => {});
            } else {
              const share = Math.floor((pot / winners.length) * 100) / 100;
              const { validateCreditEntry } = await import('../src/credits.js');
              let credited = 0;
              for (const winner of winners) {
                if (!winner.playerId || share <= 0) continue;
                const verdict = validateCreditEntry({ amount: share, reason: `Week ${week} winnings` });
                if (!verdict.ok) continue;
                await store.addCreditEntry(leagueId, { id: randomUUID(), playerId: winner.playerId, amount: verdict.value, reason: `Week ${week} winnings — auto payout`, by: 'auto-pilot', at: new Date().toISOString() });
                credited += 1;
              }
              await store.savePayout(leagueId, {
                id: `payout-${randomUUID()}`, week, pool: 'weekly', amount: pot,
                winnerNames: winners.map((w) => String(w.name ?? '').slice(0, 50)),
                method: credited ? 'credit' : 'pending', note: 'Auto-pilot weekly payout', paidAt: new Date().toISOString(), paidBy: 'auto-pilot',
              });
              const names = winners.map((w) => w.name.split(' ')[0]).join(' & ');
              await store.addChatMessage(leagueId, {
                id: `chat-payout-w${week}`, playerId: null, name: 'Jack',
                msg: `🏆 WEEK ${week} IS OFFICIAL: ${names} take${winners.length > 1 ? '' : 's'} the $${pot} pot${winners.length > 1 ? ` ($${share} each)` : ''}. Winnings dropped straight into ${winners.length > 1 ? 'their' : 'the'} credit balance. Everybody else — Jack's got jokes waiting.`,
                time: new Date().toISOString(),
              });
              for (const winner of winners) {
                if (winner.playerId) await saveNotification(leagueId, { playerId: winner.playerId, kind: 'payout', title: `You won Week ${week}!`, body: `$${share} credited to your balance. Nice work!`, metadata: { week, amount: share } });
              }
              await saveNotification(leagueId, { kind: 'payout', title: `Week ${week} payout — $${pot}`, body: `${names} won the Week ${week} pot.`, metadata: { week, amount: pot } });
              actions.push(`Paid Week ${week} pot ($${pot}) to ${names} via credit balance and announced it in chat.`);
            }
          } catch (error) {
            await store.releaseClaim(leagueId, `weekly-pot-${week}`).catch(() => {});
            throw error;
          }
        }
      }
    } catch (error) { console.error('Auto-pilot winner payout failed:', error.message); }

    // 3. Deadline reminders (24h and 3h windows, each sent once per week)
    try {
      const deadline = getWeekDeadline(week);
      if (deadline && !isWeekLocked(week)) {
        const hoursLeft = (deadline.getTime() - Date.now()) / 3_600_000;
        const sentFlags = settings.autoPilotReminders ?? {};
        const windowKey = hoursLeft <= 3 ? `${week}-3h` : hoursLeft <= 24 ? `${week}-24h` : null;
        // Atomic claim so two concurrent isolates can't both fire this window's
        // reminder batch (which would double-text everyone).
        if (windowKey && !sentFlags[windowKey] && await store.claimOnce(leagueId, `reminder-${windowKey}`)) {
          const submitted = new Set((league.sheets ?? []).filter((s) => s.week === week && s.playerId).map((s) => s.playerId));
          const missing = (league.players ?? []).filter((p) => !submitted.has(p.id));
          if (missing.length) {
            const when = deadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
            // Push
            const pushReport = await deliverPush({ store, leagueId, webpush, playerIds: missing.map((player) => player.id), payload: { title: `Picks lock ${when}`, body: `Your Week ${week} sheet isn't in. ~${Math.max(1, Math.round(hoursLeft))}h left.`, url: '/?view=picks', tag: `deadline-w${week}` } });
            const pushed = pushReport.sent;
            for (const player of missing) await saveNotification(leagueId, { playerId: player.id, kind: 'pick_reminder', title: `Week ${week} picks due soon`, body: `Your picks lock ${when}. Open Picks to submit your sheet.`, metadata: { week } });
            // SMS through Jack
            let texted = 0;
            try {
              const provider = createSmsProvider(process.env);
              const messages = missing.map((p) => ({ playerId: p.id, text: `🏈 405 BadGuys: Ayo, it's Jack. Week ${week} sheets lock at ${when} (~${Math.max(1, Math.round(hoursLeft))}h). Yours is blank, dawg. Get your picks in.` }));
              const broadcast = await sendJackBroadcast({ store, leagueId, provider, messages, actor: 'auto-pilot', kind: 'pick_reminder' });
              texted = (broadcast?.deliveries ?? []).filter((d) => d.status === 'delivered' || d.status === 'queued').length;
            } catch (error) { console.error('Auto-pilot SMS reminder failed:', error.message); }
            await store.mergeLeagueSettings(leagueId, (s) => { s.autoPilotReminders = { ...(s.autoPilotReminders ?? {}), [windowKey]: new Date().toISOString() }; });
            actions.push(`Reminded ${missing.length} player(s) missing Week ${week} sheets (${pushed} push, ${texted} text) — ${windowKey.endsWith('3h') ? '3-hour' : '24-hour'} warning.`);
          }
        }
      }
    } catch (error) { console.error('Auto-pilot reminders failed:', error.message); }

    // 4. College Pick-Em: open / lock / finalize the weekly pool hands-free
    try { await autoManageCfb({ leagueId, actions }); }
    catch (error) { console.error('Auto-pilot CFB manage failed:', error.message); }

    if (actions.length) await appendAutoPilotLog(league, actions.map((a) => `[${source}] ${a}`));
    return { week, actions };
  } finally {
    autoPilotRunning = false;
    autoPilotLastRun = Date.now();
  }
}

async function maybeRunAutoPilot() {
  if (process.env.NODE_ENV === 'test') return;
  if (Date.now() - autoPilotLastRun < 10 * 60_000) return; // at most every 10 minutes
  autoPilotLastRun = Date.now(); // claim the slot immediately so bursts don't double-run
  try { await runAutoPilot({ source: 'traffic' }); }
  catch (error) { console.error('Auto-pilot failed:', error.message); }
}

/* Cron entrypoints (Vercel sends Authorization: Bearer CRON_SECRET when set) */
const cronAuthorized = (request) => {
  const secret = process.env.CRON_SECRET;
  if (secret) return request.get('authorization') === `Bearer ${secret}`;
  return !isDeployed; // A caller-supplied x-vercel-cron header is not authentication.
};

app.post(['/api/cron/auto-pilot', '/api/cron/jack-live-desk'], asyncRoute(async (request, response) => {
  if (!cronAuthorized(request)) return response.status(401).json({ error: 'Unauthorized.' });
  const result = await runAutoPilot({ source: 'cron' });
  return response.json(result);
}));
// Vercel cron sends GET — support both
app.get(['/api/cron/auto-pilot', '/api/cron/jack-live-desk'], asyncRoute(async (request, response) => {
  if (!cronAuthorized(request)) return response.status(401).json({ error: 'Unauthorized.' });
  const result = await runAutoPilot({ source: 'cron' });
  return response.json(result);
}));

/* Admin: run auto-pilot on demand + view its log */
app.post('/api/leagues/:leagueId/auto-pilot/run', auth.requireAdmin, asyncRoute(async (_request, response) => {
  const result = await runAutoPilot({ source: 'manual' });
  return response.json(result);
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
