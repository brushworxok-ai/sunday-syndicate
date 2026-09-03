import { createPublicKey, verify } from 'node:crypto';

export function verifyTelnyxWebhook({ publicKey, timestamp, signature, rawBody, now = Date.now() }) {
  if (!publicKey || !/^\d+$/.test(String(timestamp ?? '')) || !signature || !Buffer.isBuffer(rawBody)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > 5 * 60_000) return false;
  try {
    const keyBytes = Buffer.from(publicKey.trim(), 'base64');
    if (keyBytes.length !== 32) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), keyBytes]), format: 'der', type: 'spki' });
    return verify(null, Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]), key, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

export function telnyxDeliveryEvent(event) {
  const payload = event?.payload;
  if (!payload?.id) return null;
  let status;
  if (event.event_type === 'message.finalized') {
    const statuses = (payload.to ?? []).map((recipient) => recipient.status);
    if (statuses.some((value) => ['delivery_failed', 'sending_failed', 'failed'].includes(value)) || payload.errors?.length) status = 'failed';
    else if (statuses.length && statuses.every((value) => value === 'delivered')) status = 'delivered';
    else if (statuses.includes('delivery_unconfirmed')) status = 'delivery_unconfirmed';
  } else {
    status = { 'message.sent': 'sent', 'message.delivered': 'delivered', 'message.failed': 'failed' }[event.event_type];
  }
  return status ? { providerMessageId: payload.id, status, errorCode: payload.errors?.[0]?.code ?? null, actor: 'telnyx_webhook' } : null;
}
