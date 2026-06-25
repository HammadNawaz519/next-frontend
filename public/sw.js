const CACHE_VERSION = 'connect-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// Core assets to pre-cache on install (app shell)
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/Avatar.avif',
  '/connect-logo.png',
];

// ── Install: pre-cache the app shell ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', (event) => {
  const allowed = [STATIC_CACHE, DYNAMIC_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !allowed.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Helpers ──
function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|svg|png|jpg|jpeg|gif|avif|webp|ico)(\?.*)?$/.test(url.pathname);
}
function isImage(url) {
  return /\.(png|jpg|jpeg|gif|avif|webp|svg|ico)(\?.*)?$/.test(url.pathname) ||
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('githubusercontent.com');
}
function isNavigation(request) {
  return request.mode === 'navigate';
}
function isAPICall(url) {
  return url.pathname.startsWith('/api/') ||
    url.hostname.includes('railway.app') ||
    url.hostname.includes('socket.io');
}

// ── Fetch: smart caching strategy ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET and browser extensions
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension')) return;

  // 1. API / WebSocket calls: always network-only
  if (isAPICall(url)) return;

  // 2. Images: cache-first (long-lived, rarely change)
  if (isImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached || new Response('', { status: 404 }));
        })
      )
    );
    return;
  }

  // 3. Static JS/CSS assets (Next.js chunks): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // 4. Page navigations: network-first, fallback to cache, then offline page
  if (isNavigation(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            // Offline fallback: return cached home page
            return caches.match('/');
          })
        )
    );
    return;
  }

  // 5. Everything else: network-first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── Push Notifications (background) ──
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch { data = { title: 'Connect', body: event.data.text() }; }
  }

  const type = data.type || 'message';
  const options = {
    body: data.body || 'You have a new notification.',
    icon: '/connect-logo.png',
    badge: '/icon-192.png',
    vibrate: type === 'call'
      ? [200, 100, 200, 100, 200, 100, 200, 100, 400]
      : [100, 50, 100],
    tag: type === 'call' ? 'incoming-call' : `msg-${data.partnerId || 'general'}`,
    renotify: true,
    requireInteraction: type === 'call',
    data: { url: '/dashboard', partnerId: data.partnerId, callType: data.callType, ...data },
    actions: type === 'call'
      ? [{ action: 'answer', title: '📞 Answer' }, { action: 'decline', title: '❌ Decline' }]
      : [{ action: 'view', title: 'View' }]
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Connect', options));
});

// ── Notification Click — deep-linking ──
self.addEventListener('notificationclick', (event) => {
  const { action, data = {} } = event;
  event.notification.close();

  if (action === 'decline') {
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'DECLINE_CALL', callerEmail: data.callerEmail }));
    });
    return;
  }

  let targetUrl = `${self.location.origin}/dashboard`;
  if (action === 'answer' && data.partnerId) {
    targetUrl = `${self.location.origin}/dashboard?action=answer&userId=${data.partnerId}&type=${data.callType || 'audio'}`;
  } else if (data.partnerId) {
    targetUrl = `${self.location.origin}/dashboard?userId=${data.partnerId}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
