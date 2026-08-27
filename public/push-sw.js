self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('405-badguys-shell-v1').then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/jack.jpg', '/notification-icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('405-badguys-shell-') && key !== '405-badguys-shell-v1').map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open('405-badguys-shell-v1').then((cache) => cache.put('/', copy));
      return response;
    }).catch(() => caches.match('/')));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open('405-badguys-shell-v1').then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? 'Your weekly league recap is ready.' }; }
  const title = payload.title || '405 BADGUYS PARLAY';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'Your weekly league recap is ready.',
    icon: '/notification-icon.svg',
    badge: '/notification-icon.svg',
    tag: payload.tag || 'weekly-recap',
    renotify: true,
    data: { url: payload.url || '/?view=results' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/?view=results', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});
