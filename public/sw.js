/* 405 Bad Guys Parlays — single PWA worker for offline shell and push. */
const CACHE_NAME = '405-badguys-shell-v2';
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/jack.jpg',
  '/notification-icon.svg',
  '/jack-money-icon-192.png',
  '/jack-money-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('405-badguys-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
    self.clients.claim(),
  ]));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)));
      }
      return response;
    }).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok && ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      }
      return response;
    });
    return cached || network;
  }));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? 'Your weekly league update is ready.' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || '405 BADGUYS PARLAY', {
    body: payload.body || 'Your weekly league update is ready.',
    icon: '/jack-money-icon-192.png',
    badge: '/notification-icon.svg',
    tag: payload.tag || 'league-update',
    renotify: true,
    data: { url: payload.url || '/?view=results' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requested = new URL(event.notification.data?.url || '/?view=results', self.location.origin);
  const targetUrl = requested.origin === self.location.origin
    ? requested.href
    : new URL('/?view=results', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
