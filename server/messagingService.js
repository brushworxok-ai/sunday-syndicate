import { randomUUID } from 'node:crypto';
import { WorkflowError } from './leagueService.js';

// Twilio is optional — loaded lazily only when TwilioSmsProvider is created
let _twilio;
async function getTwilio() {
  if (!_twilio) _twilio = (await import('twilio')).default;
  return _twilio;
}

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
    this._config = config;
    this.client = null;
  }
  async _ensureClient() {
    if (!this.client) {
      const tw = await getTwilio();
      this.client = tw(this._config.apiKey, this._config.apiSecret, { accountSid: this._config.accountSid });
    }
    return this.client;
  }
  async send({ player, text }) {
    if (!player.phoneE164) {
      const error = new Error('No production E.164 phone number is stored for this player.');
      error.code = 'missing_destination';
      throw error;
    }
    const client = await this._ensureClient();
    const message = await client.messages.create({ to: player.phoneE164, messagingServiceSid: this.messagingServiceSid, body: text, statusCallback: this.statusCallback });
    return { status: message.status ?? 'queued', id: message.sid };
  }
}

export class TelnyxSmsProvider {
  constructor({ apiKey, fromNumber }) {
    this.name = 'Telnyx Messaging';
    this.apiKey = apiKey;
    // Telnyx wants E.164. Forgive "4055551234" / "(405) 555-1234" in the env.
    this.fromNumber = normalizeE164(fromNumber);
  }
  async send({ player, text }) {
    if (!player.phoneE164) {
      const error = new Error('No production E.164 phone number is stored for this player.');
      error.code = 'missing_destination';
      throw error;
    }
    const response = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ from: this.fromNumber, to: player.phoneE164, text }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const first = result?.errors?.[0];
      const error = new Error(first ? `Telnyx ${first.code ?? response.status}: ${first.title ?? ''}${first.detail ? ` — ${first.detail}` : ''}`.trim() : `Telnyx send failed (HTTP ${response.status})`);
      error.code = first?.code ?? String(response.status);
      error.provider = 'telnyx';
      throw error;
    }
    return { status: result.data?.to?.[0]?.status ?? 'queued', id: result.data?.id ?? randomUUID() };
  }

  /* Look up what happened to a message after Telnyx accepted it. */
  async messageStatus(id) {
    const res = await fetch(`https://api.telnyx.com/v2/messages/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${this.apiKey}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { id, error: json?.errors?.[0]?.detail ?? `HTTP ${res.status}` };
    const d = json.data ?? {};
    return { id, to: d.to?.map((t) => ({ number: t.phone_number, status: t.status, carrier: t.carrier, lineType: t.line_type })) ?? [], errors: d.errors ?? [], sentAt: d.sent_at, completedAt: d.completed_at, direction: d.direction, type: d.type };
  }

  /* Commissioner diagnostic: is the API key valid, and is the FROM number
     actually on this account with messaging enabled? */
  async diagnose() {
    const headers = { Authorization: `Bearer ${this.apiKey}` };
    const out = { provider: 'telnyx', fromNumber: this.fromNumber };
    const numRes = await fetch(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(this.fromNumber)}`, { headers });
    const numJson = await numRes.json().catch(() => ({}));
    out.apiKeyValid = numRes.status !== 401 && numRes.status !== 403;
    const num = numJson?.data?.[0];
    out.numberOnAccount = Boolean(num);
    if (num) {
      out.numberStatus = num.status;
      out.messagingProfileId = num.messaging_profile_id ?? null;
      out.messagingEnabled = Boolean(num.messaging_profile_id);
      const msgRes = await fetch(`https://api.telnyx.com/v2/messaging_phone_numbers/${encodeURIComponent(this.fromNumber)}`, { headers });
      const msgJson = await msgRes.json().catch(() => ({}));
      out.messagingNumber = msgJson?.data ? { type: msgJson.data.type, features: msgJson.data.features?.sms ?? null, health: msgJson.data.health ?? null } : (msgJson?.errors?.[0]?.detail ?? 'not a messaging number');
    } else if (!out.apiKeyValid) {
      out.error = numJson?.errors?.[0]?.detail ?? 'API key rejected';
    }
    return out;
  }
}

export function normalizeE164(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

export class TextBeltSmsProvider {
  constructor({ apiKey }) {
    this.name = 'TextBelt';
    this.apiKey = apiKey;
  }
  async send({ player, text }) {
    if (!player.phoneE164) {
      const error = new Error('No E.164 phone number is stored for this player.');
      error.code = 'missing_destination';
      throw error;
    }
    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: player.phoneE164, message: text, key: this.apiKey }),
    });
    const result = await response.json();
    if (!result.success) {
      const error = new Error(result.error || 'TextBelt delivery failed');
      error.code = result.error?.includes('quota') ? 'quota_exceeded' : 'delivery_failed';
      throw error;
    }
    return { status: 'delivered', id: String(result.textId ?? randomUUID()) };
  }
}

/** Send a raw SMS to an E.164 number (not a player object) via TextBelt. */
export async function sendTextBeltRaw({ phone, text, apiKey }) {
  const response = await fetch('https://textbelt.com/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message: text, key: apiKey }),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || 'TextBelt delivery failed');
  return { textId: result.textId };
}

export function createSmsProvider(env = process.env) {
  if (env.SMS_PROVIDER === 'textbelt') {
    if (!env.TEXTBELT_API_KEY) throw new Error('TextBelt provider is missing TEXTBELT_API_KEY');
    return new TextBeltSmsProvider({ apiKey: env.TEXTBELT_API_KEY });
  }
  if (env.SMS_PROVIDER === 'telnyx') {
    if (!env.TELNYX_API_KEY) throw new Error('Telnyx provider is missing TELNYX_API_KEY');
    if (!env.TELNYX_FROM_NUMBER) throw new Error('Telnyx provider is missing TELNYX_FROM_NUMBER');
    return new TelnyxSmsProvider({ apiKey: env.TELNYX_API_KEY, fromNumber: env.TELNYX_FROM_NUMBER });
  }
  if (env.SMS_PROVIDER === 'twilio') {
    const required = ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_MESSAGING_SERVICE_SID'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Twilio provider is missing: ${missing.join(', ')}`);
    return new TwilioSmsProvider({ accountSid: env.TWILIO_ACCOUNT_SID, apiKey: env.TWILIO_API_KEY, apiSecret: env.TWILIO_API_SECRET, messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID, statusCallback: env.TWILIO_STATUS_CALLBACK_URL });
  }
  return new DemoSmsProvider({ failedPlayerId: env.DEMO_SMS_FAILURE_PLAYER_ID || 'player-jordan' });
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

export async function sendJackBroadcast({ store, leagueId, provider, messages, actor = 'jack', kind = 'jack_broadcast' }) {
  const league = await store.getLeague(leagueId);
  if (!league) throw new WorkflowError('League not found.', 404, 'not_found');
  const deliveries = [];
  for (const msg of messages) {
    const player = await store.getPlayer(msg.playerId);
    if (!player?.phoneVerifiedAt || player.messaging?.smsConsent !== 'opted_in') {
      deliveries.push({ playerId: msg.playerId, channel: 'sms', status: 'suppressed', providerAttempted: false, reason: !player?.phoneVerifiedAt ? 'phone_not_verified' : 'sms_consent_not_active', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    let delivered = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const result = await provider.send({ player, text: msg.text });
        delivered = { playerId: msg.playerId, channel: 'sms', status: result.status, providerAttempted: true, provider: provider.name, providerMessageId: result.id, attemptCount: attempt, attemptedAt: new Date().toISOString() };
        break;
      } catch (error) { lastError = error; }
    }
    if (delivered) deliveries.push(delivered);
    else deliveries.push({ playerId: msg.playerId, channel: 'sms', status: 'failed', providerAttempted: true, provider: provider.name, errorCode: String(lastError?.code ?? 'provider_error'), error: lastError?.message ?? 'Provider failed', attemptCount: 2, attemptedAt: new Date().toISOString() });
  }
  const hasFailures = deliveries.some((d) => d.status === 'failed');
  const broadcast = { id: `broadcast-${randomUUID()}`, kind, architecture: 'individual_jack_sms', status: hasFailures ? 'completed_with_failures' : 'completed', sentAt: new Date().toISOString(), provider: provider.name, deliveries };
  await store.saveBroadcast(leagueId, broadcast);
  await store.writeAudit(leagueId, `broadcast.${kind}`, `Jack broadcast (${kind}) completed: ${deliveries.filter((d) => d.status !== 'suppressed' && d.status !== 'failed').length} sent, ${deliveries.filter((d) => d.status === 'suppressed').length} suppressed, ${deliveries.filter((d) => d.status === 'failed').length} failed`, actor, { broadcastId: broadcast.id });
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
