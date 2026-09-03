/* 405 Bad Guys Parlays — Service Worker (push notifications + offline shell) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: '405 Bad Guys Parlays', body: 'You have a new update.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch { /* fallback to defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/jack-money-icon-192.png',
      badge: '/jack-money-icon-192.png',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      tag: data.tag || 'general',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data?.url || '/', self.location.origin); } catch { target = new URL('/', self.location.origin); }
  const url = target.origin === self.location.origin ? target.href : new URL('/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) return existing.navigate(url).then((client) => (client || existing).focus());
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener('push', (event) => {
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    for (const client of windows) client.postMessage({ type: 'league-notification' });
  }));
