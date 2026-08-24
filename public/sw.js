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
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.navigate(url); return existing.focus(); }
      return self.clients.openWindow(url);
    })
  );
});
