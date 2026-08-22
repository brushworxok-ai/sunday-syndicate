import { randomUUID } from 'node:crypto';
import twilio from 'twilio';
import { WorkflowError } from './leagueService.js';

export class DemoSmsProvider {
  constructor({ failedPlayerId = 'player-jordan' } = {}) { this.failedPlayerId = failedPlayerId; this.name = 'Twilio demo adapter'; }
  async send({ player }) {
    if (player.id === this.failedPlayerId) {
      const error = new Error('Unreachable destination handset');
      error.code = '30003';
      throw error;
    }
    return { status: 'delivered', id: `SM_DEMO_${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}` };
  }
}

export class TwilioSmsProvider {
  constructor(config) {
    this.name = 'Twilio Programmable Messaging';
    this.messagingServiceSid = config.messagingServiceSid;
    this.statusCallback = config.statusCallback;
    this.client = twilio(config.apiKey, config.apiSecret, { accountSid: config.accountSid });
  }
  async send({ player, text }) {
    if (!player.phoneE164) {
      const error = new Error('No production E.164 phone number is stored for this player.');
      error.code = 'missing_destination';
      throw error;
    }
    const message = await this.client.messages.create({ to: player.phoneE164, messagingServiceSid: this.messagingServiceSid, body: text, statusCallback: this.statusCallback });
    return { status: message.status ?? 'queued', id: message.sid };
  }
}

/**
 * TextBelt (https://textbelt.com) — the no-account-hassle SMS option.
 * Buy a key with credits, set SMS_PROVIDER=textbelt and TEXTBELT_API_KEY.
 * TextBelt handles carrier opt-outs (STOP) on their side; the in-app
 * consent settings still gate every send before the provider is called.
 */
export class TextBeltSmsProvider {
  constructor({ apiKey }) {
    this.name = 'TextBelt SMS';
    this.apiKey = apiKey;
  }
  async send({ player, text }) {
    if (!player.phoneE164) {
      const error = new Error('No production E.164 phone number is stored for this player.');
      error.code = 'missing_destination';
      throw error;
    }
    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: player.phoneE164, message: text, key: this.apiKey }),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) {
      const error = new Error(data.error || `TextBelt request failed (${response.status}).`);
      error.code = data.error?.includes('quota') || data.quotaRemaining === 0 ? 'out_of_credits' : 'textbelt_error';
      throw error;
    }
    return { status: 'queued', id: `TB_${data.textId ?? 'unknown'}`, quotaRemaining: data.quotaRemaining };
  }
}

export function createSmsProvider(env = process.env) {
  if (env.SMS_PROVIDER === 'textbelt') {
    if (!env.TEXTBELT_API_KEY) throw new Error('TextBelt provider is missing: TEXTBELT_API_KEY');
    return new TextBeltSmsProvider({ apiKey: env.TEXTBELT_API_KEY });
  }
  if (env.SMS_PROVIDER !== 'twilio') return new DemoSmsProvider({ failedPlayerId: env.DEMO_SMS_FAILURE_PLAYER_ID || 'player-jordan' });
  const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_MESSAGING_SERVICE_SID'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Twilio provider is missing: ${missing.join(', ')}`);
  return new TwilioSmsProvider({ accountSid: env.TWILIO_ACCOUNT_SID, apiKey: env.TWILIO_API_KEY, apiSecret: env.TWILIO_API_SECRET, messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, statusCallback: env.TWILIO_STATUS_CALLBACK_URL });
}

export async function sendApprovedRecap({ store, leagueId, recapId, provider, actor = 'commissioner' }) {
  const league = await store.getLeague(leagueId);
  const recap = await store.getRecap(recapId);
  if (!league || !recap || recap.leagueId !== leagueId) throw new WorkflowError('League or recap not found.', 404, 'not_found');
  if (recap.adminApproval?.status !== 'approved') throw new WorkflowError('Recap must be approved before sending.', 409, 'approval_required');
  const deliveries = [];
  for (const summary of league.players) {
    const player = await store.getPlayer(summary.id);
    if (!player.phoneVerifiedAt) {
      deliveries.push({ playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'phone_not_verified', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    if (player.messaging.smsConsent !== 'opted_in') {
      deliveries.push({ playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'sms_consent_not_active', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    let delivered = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await provider.send({ player, text: recap.finalText });
        delivered = { playerId: player.id, channel: 'sms', status: result.status, providerAttempted: true, provider: provider.name, providerMessageId: result.id, attemptCount: attempt, attemptedAt: new Date().toISOString() };
        break;
      } catch (error) { lastError = error; }
    }
    if (delivered) deliveries.push(delivered);
    else deliveries.push({ playerId: player.id, channel: 'sms', status: 'failed', providerAttempted: true, provider: provider.name, errorCode: String(lastError?.code ?? 'provider_error'), error: lastError?.message ?? 'Provider failed', attemptCount: 2, attemptedAt: new Date().toISOString(), retryStatus: 'paused_after_one_retry', fallback: { channel: 'in_app', status: 'delivered', deliveredAt: new Date().toISOString() } });
  }
  const hasFailures = deliveries.some((delivery) => delivery.status === 'failed');
  const broadcast = { id: `broadcast-${randomUUID()}`, recapId, architecture: 'individual_broadcast_sms_plus_in_app', status: hasFailures ? 'completed_with_failures' : 'completed', approvedAt: recap.adminApproval.approvedAt, sentAt: new Date().toISOString(), provider: provider.name, deliveries };
  await store.saveBroadcast(leagueId, broadcast);
  await store.writeAudit(leagueId, 'broadcast.completed', `Broadcast completed with ${deliveries.filter((item) => item.status === 'delivered' || item.status === 'queued').length} sent, ${deliveries.filter((item) => item.status === 'suppressed').length} suppressed, and ${deliveries.filter((item) => item.status === 'failed').length} failed`, actor, { broadcastId: broadcast.id });
  return broadcast;
}

/**
 * Send per-player Jack texts (results + roasts) as an individual broadcast.
 * Same consent + verification gates as recap broadcasts: unverified phones and
 * opted-out players are suppressed before the provider is ever called.
 * Note: carriers do not support true group-MMS threads from an app number, so
 * this is one private SMS per player; the in-app chat stays the group surface.
 */
export async function sendJackBroadcast({ store, leagueId, provider, messages = [], actor = 'commissioner', kind = 'jack_weekly_text' }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'not_found');
  const textFor = new Map(messages.map((message) => [message.playerId, message.text]));
  const deliveries = [];
  for (const summary of league.players) {
    const text = textFor.get(summary.id);
    if (!text) continue;
    const player = await store.getPlayer(summary.id);
    if (!player.phoneVerifiedAt) {
      deliveries.push({ playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'phone_not_verified', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    if (player.messaging.smsConsent !== 'opted_in') {
      deliveries.push({ playerId: player.id, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: 'sms_consent_not_active', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    let delivered = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await provider.send({ player, text });
        delivered = { playerId: player.id, channel: 'sms', status: result.status, providerAttempted: true, provider: provider.name, providerMessageId: result.id, attemptCount: attempt, attemptedAt: new Date().toISOString() };
        break;
      } catch (error) { lastError = error; }
    }
    if (delivered) deliveries.push(delivered);
    else deliveries.push({ playerId: player.id, channel: 'sms', status: 'failed', providerAttempted: true, provider: provider.name, errorCode: String(lastError?.code ?? 'provider_error'), error: lastError?.message ?? 'Provider failed', attemptCount: 2, attemptedAt: new Date().toISOString(), retryStatus: 'paused_after_one_retry', fallback: { channel: 'in_app', status: 'delivered', deliveredAt: new Date().toISOString() } });
  }
  const hasFailures = deliveries.some((delivery) => delivery.status === 'failed');
  const broadcast = { id: `broadcast-${randomUUID()}`, kind, architecture: 'individual_broadcast_sms_plus_in_app', status: hasFailures ? 'completed_with_failures' : 'completed', sentAt: new Date().toISOString(), provider: provider.name, deliveries };
  await store.saveBroadcast(leagueId, broadcast);
  await store.writeAudit(leagueId, 'jack.broadcast_completed', `Jack texted ${deliveries.filter((item) => item.status === 'delivered' || item.status === 'queued').length} players (${deliveries.filter((item) => item.status === 'suppressed').length} suppressed, ${deliveries.filter((item) => item.status === 'failed').length} failed)`, actor, { broadcastId: broadcast.id, kind });
  return broadcast;
}

export async function applyDeliveryStatus({ store, providerMessageId, status, errorCode = null }) {
  const found = await store.findBroadcastByProviderMessageId(providerMessageId);
  if (!found) return null;
  const delivery = found.broadcast.deliveries[found.deliveryIndex];
  found.broadcast.deliveries[found.deliveryIndex] = { ...delivery, status, ...(errorCode ? { errorCode } : {}), statusUpdatedAt: new Date().toISOString() };
  found.broadcast.status = found.broadcast.deliveries.some((item) => item.status === 'failed') ? 'completed_with_failures' : found.broadcast.status;
  await store.saveBroadcast(found.leagueId, found.broadcast);
  await store.writeAudit(found.leagueId, 'delivery.status_updated', `Provider delivery ${providerMessageId} changed to ${status}`, 'twilio_webhook', { providerMessageId, status, errorCode });
  return found.broadcast.deliveries[found.deliveryIndex];
}
