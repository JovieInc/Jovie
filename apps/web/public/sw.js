// Service worker with offline fallback for PWA install criteria + offline resilience.
// Network-first for GET navigations (serves offline.html as fallback), pass-through for all other requests.

const OFFLINE_PAGE = '/offline.html';
const CACHE_NAME = 'jovie-offline-v1';
const NAV_TIMEOUT_MS = 8000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.add(OFFLINE_PAGE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Only intercept GET navigations — POST/PUT/DELETE should fail normally
  if (event.request.mode === 'navigate' && event.request.method === 'GET') {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);

    event.respondWith(
      fetch(event.request, { signal: controller.signal })
        .then(response => {
          clearTimeout(timeoutId);
          return response;
        })
        .catch(() => {
          clearTimeout(timeoutId);
          return caches.match(OFFLINE_PAGE).then(
            cached =>
              cached ||
              new Response('You are offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain' },
              })
          );
        })
    );
    return;
  }
  // Pass-through for all other requests (no aggressive caching)
  event.respondWith(fetch(event.request));
});
