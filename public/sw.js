const CACHE_NAME = 'connect-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful page navigations
        if (response && response.status === 200 && event.request.mode === 'navigate') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── PWA Notification Handlers — Call & Message Notifications ──

// Push event listener (For background push server alerts)
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'New Notification', body: event.data.text() };
    }
  }

  const title = data.title || 'New Notification';
  const type = data.type || 'message';

  const options = {
    body: data.body || 'You have a new message.',
    icon: '/connect-logo.png',
    badge: '/icon-192.png',
    vibrate: type === 'call' 
      ? [200, 100, 200, 100, 200, 100, 200, 100, 400] 
      : [100, 50, 100],
    tag: type === 'call' ? 'incoming-call' : `msg-${data.partnerId || 'general'}`,
    renotify: true,
    requireInteraction: type === 'call',
    data: {
      url: '/dashboard',
      partnerId: data.partnerId,
      callType: data.callType,
      ...data
    },
    actions: type === 'call'
      ? [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' }
        ]
      : [
          { action: 'view', title: 'View' }
        ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click — handles deep-linking & action buttons
self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  if (action === 'decline') {
    // Decline call: notify all active tabs to stop ringing/reject
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'DECLINE_CALL', callerEmail: data.callerEmail });
      });
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
      // If there's an open window, focus it and redirect
      for (const client of clientList) {
        if (client.url.includes('/dashboard') && 'focus' in client) {
          client.postMessage({ type: 'NAVIGATE', url: targetUrl });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
