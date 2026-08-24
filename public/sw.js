// Connect PWA Service Worker
const CACHE_NAME = 'connect-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NEVER intercept API calls, auth routes, socket.io, or dynamic server action POSTs
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/_next/data') ||
    url.pathname.startsWith('/socket.io') ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Cache-first for static immutable assets, wallpapers, icons, and next.js chunks
  const isStaticAsset =
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/Themes') ||
    /\.(jpg|jpeg|png|webp|svg|ico|avif|woff|woff2|ttf|mp3|mp4|webm)$/i.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
