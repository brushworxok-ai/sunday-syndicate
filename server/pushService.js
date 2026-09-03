export function subscriptionsFor(value) {
  return (Array.isArray(value) ? value : value?.endpoint ? [value] : []).filter((sub) => sub?.endpoint);
}

export function validatePushSubscription(input) {
  const endpoint = String(input?.endpoint ?? '');
  let url;
  try { url = new URL(endpoint); } catch { throw new Error('Invalid push endpoint.'); }
  const knownHost = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || !knownHost || url.username || url.password || (url.port && url.port !== '443') || endpoint.length > 4096) throw new Error('Unsupported push service endpoint.');
  const keys = input?.keys;
  if (!keys || !/^[\w-]+={0,2}$/.test(keys.p256dh ?? '') || !/^[\w-]+={0,2}$/.test(keys.auth ?? '') || Buffer.from(keys.p256dh, 'base64url').length !== 65 || Buffer.from(keys.auth, 'base64url').length !== 16) throw new Error('Invalid push encryption keys.');
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, expirationTime: Number.isFinite(input.expirationTime) ? input.expirationTime : null };
}

export function savePlayerSubscription(settings, playerId, subscription) {
  settings.pushSubscriptions ??= {};
  // One browser endpoint belongs to one signed-in account, never two.
  for (const [id, value] of Object.entries(settings.pushSubscriptions)) {
    const remaining = subscriptionsFor(value).filter((sub) => sub.endpoint !== subscription.endpoint);
    if (remaining.length) settings.pushSubscriptions[id] = remaining;
    else delete settings.pushSubscriptions[id];
  }
  settings.pushSubscriptions[playerId] = [...subscriptionsFor(settings.pushSubscriptions[playerId]), { ...subscription, subscribedAt: new Date().toISOString() }].slice(-5);
}

export function removePlayerSubscription(settings, playerId, endpoint) {
  const remaining = subscriptionsFor(settings.pushSubscriptions?.[playerId]).filter((sub) => sub.endpoint !== endpoint);
  if (!settings.pushSubscriptions) return;
  if (remaining.length) settings.pushSubscriptions[playerId] = remaining;
  else delete settings.pushSubscriptions[playerId];
}

export async function deliverPush({ store, leagueId, webpush, playerIds, payload, endpoint }) {
  if (!webpush) return { configured: false, sent: 0, failed: 0, expired: 0, total: 0 };
  const league = await store.getLeague(leagueId);
  if (!league) throw new Error('League not found.');
  const allowedIds = new Set(playerIds ?? (league.players ?? []).map((player) => player.id));
  const roster = new Set((league.players ?? []).map((player) => player.id));
  const targets = Object.entries(league.settings?.pushSubscriptions ?? {}).flatMap(([playerId, value]) =>
    allowedIds.has(playerId) && roster.has(playerId) ? subscriptionsFor(value).filter((sub) => !endpoint || endpoint === sub.endpoint).map((subscription) => ({ playerId, subscription })) : []);
  const results = [];
  for (let start = 0; start < targets.length; start += 5) {
    results.push(...await Promise.all(targets.slice(start, start + 5).map(async ({ playerId, subscription }) => {
      try {
        validatePushSubscription(subscription);
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, timeout: 8000 });
        return { playerId, endpoint: subscription.endpoint, status: 'sent' };
      } catch (error) {
        return { playerId, endpoint: subscription.endpoint, status: [404, 410].includes(error.statusCode) ? 'expired' : 'failed' };
      }
    })));
  }
  const expired = results.filter((result) => result.status === 'expired');
  if (expired.length) await store.mergeLeagueSettings(leagueId, (settings) => {
    for (const item of expired) removePlayerSubscription(settings, item.playerId, item.endpoint);
  });
  return { configured: true, sent: results.filter((result) => result.status === 'sent').length, failed: results.filter((result) => result.status === 'failed').length, expired: expired.length, total: targets.length };
}
