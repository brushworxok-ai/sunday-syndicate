import { randomUUID } from 'node:crypto';
import webPush from 'web-push';
import { WorkflowError } from './leagueService.js';
import { buildLeagueViewUrl } from '../src/resultsShare.js';

export function pushConfiguration(env = process.env) {
  const publicKey = String(env.VAPID_PUBLIC_KEY ?? '').trim();
  const privateKey = String(env.VAPID_PRIVATE_KEY ?? '').trim();
  const subject = String(env.VAPID_SUBJECT ?? 'https://sunday-syndicate.vercel.app').trim();
  return { configured: Boolean(publicKey && privateKey && subject), publicKey, privateKey, subject };
}

export function createWebPushProvider(env = process.env) {
  const config = pushConfiguration(env);
  if (!config.configured) return null;
  return {
    name: 'Web Push',
    async send(subscription, payload) {
      return webPush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 60 * 60 * 24 * 3,
        urgency: 'normal',
        topic: 'weekly-recap',
        vapidDetails: { subject: config.subject, publicKey: config.publicKey, privateKey: config.privateKey },
      });
    },
  };
}

export async function sendApprovedPushRecap({ store, leagueId, recapId, provider, actor = 'commissioner', appBaseUrl = '' }) {
  const league = await store.getLeague(leagueId);
  const recap = await store.getRecap(recapId);
  if (!league || !recap || recap.leagueId !== leagueId) throw new WorkflowError('League or recap not found.', 404, 'not_found');
  if (recap.adminApproval?.status !== 'approved') throw new WorkflowError('Recap must be approved before sending.', 409, 'approval_required');

  const resultsUrl = appBaseUrl ? buildLeagueViewUrl(appBaseUrl, { view: 'results', season: recap.season ?? league.season, week: recap.week }) : '';
  const messageText = `${recap.finalText}${resultsUrl ? `\n\nOpen results: ${resultsUrl}` : ''}`;
  const notification = {
    title: `${league.name} · Week ${recap.week} recap`,
    body: recap.finalText.slice(0, 220),
    url: resultsUrl || '/',
    tag: `${leagueId}-${recap.season ?? league.season}-${recap.week}`,
  };
  const deliveries = [];

  for (const summary of league.players) {
    const player = await store.getPlayer(summary.id);
    if (player.messaging?.pushConsent !== 'opted_in') {
      deliveries.push({ playerId: player.id, channel: 'web_push', status: 'suppressed', providerAttempted: false, reason: 'push_consent_not_active', fallback: { channel: 'in_app', status: 'available' } });
      continue;
    }
    const subscriptions = await store.getPushSubscriptions(player.id);
    if (!provider || !subscriptions.length) {
      deliveries.push({ playerId: player.id, channel: 'web_push', status: 'failed', providerAttempted: false, reason: provider ? 'no_active_subscription' : 'push_provider_not_configured', fallback: { channel: 'in_app', status: 'delivered', deliveredAt: new Date().toISOString() } });
      continue;
    }

    let successCount = 0;
    let failureCount = 0;
    let lastError = null;
    for (const saved of subscriptions) {
      try {
        await provider.send(saved.subscription, notification);
        successCount += 1;
      } catch (error) {
        lastError = error;
        failureCount += 1;
        if (error?.statusCode === 404 || error?.statusCode === 410) await store.removePushSubscription(player.id, saved.subscription.endpoint, 'push_provider');
      }
    }
    if (successCount) {
      deliveries.push({ playerId: player.id, channel: 'web_push', status: failureCount ? 'delivered_with_device_failures' : 'delivered', providerAttempted: true, provider: provider.name, providerMessageId: `PUSH_${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`, attemptedAt: new Date().toISOString(), deviceSuccessCount: successCount, deviceFailureCount: failureCount });
    } else {
      deliveries.push({ playerId: player.id, channel: 'web_push', status: 'failed', providerAttempted: true, provider: provider.name, errorCode: String(lastError?.statusCode ?? 'push_provider_error'), error: lastError?.message ?? 'No registered device accepted the notification.', attemptedAt: new Date().toISOString(), fallback: { channel: 'in_app', status: 'delivered', deliveredAt: new Date().toISOString() } });
    }
  }

  const hasFailures = deliveries.some((delivery) => delivery.status === 'failed');
  const broadcast = {
    id: `broadcast-${randomUUID()}`,
    recapId,
    architecture: 'individual_web_push_plus_in_app',
    status: hasFailures ? 'completed_with_fallbacks' : 'completed',
    approvedAt: recap.adminApproval.approvedAt,
    sentAt: new Date().toISOString(),
    provider: provider?.name ?? 'In-app fallback',
    resultsUrl: resultsUrl || null,
    messageText,
    deliveries,
  };
  await store.saveBroadcast(leagueId, broadcast);
  const deliveredCount = deliveries.filter((item) => item.status.startsWith('delivered')).length;
  const suppressedCount = deliveries.filter((item) => item.status === 'suppressed').length;
  const failedCount = deliveries.filter((item) => item.status === 'failed').length;
  await store.writeAudit(leagueId, 'broadcast.completed', `Web Push recap completed with ${deliveredCount} delivered, ${suppressedCount} suppressed, and ${failedCount} in-app fallbacks`, actor, { broadcastId: broadcast.id });
  return broadcast;
}
