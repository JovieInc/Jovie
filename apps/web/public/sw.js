// Service worker with offline fallback for PWA install criteria + offline resilience.
// Network-first for GET navigations (serves offline.html as fallback), pass-through for all other requests.
// Keep AUTH_NAVIGATION_PATH_PREFIXES in sync with
// apps/web/lib/service-worker/auth-navigation-paths.ts

const OFFLINE_PAGE = '/offline.html';
const CACHE_NAME = 'jovie-offline-v3';
const NAV_TIMEOUT_MS = 8000;
const AUTH_NAVIGATION_PATH_PREFIXES = [
  '/sso-callback',
  '/signin/sso-callback',
  '/signup/sso-callback',
  '/sign-in/sso-callback',
  '/sign-up/sso-callback',
  '/signin',
  '/signup',
  '/sign-in',
  '/sign-up',
  '/auth',
  '/auth-return',
  '/desktop-auth',
  '/mobile-auth-return',
  '/__clerk',
  '/clerk',
];

function isAuthNavigationPath(pathname) {
  return AUTH_NAVIGATION_PATH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

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
    const requestUrl = new URL(event.request.url);

    // Auth/OAuth callbacks must reach the network. Serving offline.html here
    // breaks desktop login when a stale service worker controls Electron.
    if (isAuthNavigationPath(requestUrl.pathname)) {
      event.respondWith(fetch(event.request));
      return;
    }

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
