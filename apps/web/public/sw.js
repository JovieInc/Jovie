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
    // Return without respondWith so an aborted fetch stays a browser fetch.
    // respondWith(fetch) turns that rejection into a ServiceWorker error.
    if (isAuthNavigationPath(requestUrl.pathname)) {
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
  // Chunks, RSC payloads, and images are not navigations. Leaving them
  // unintercepted lets the browser abort them without a console error.
  // Firefox reports respondWith(fetch(event.request)) on an aborted request
  // as "A ServiceWorker intercepted the request and encountered an unexpected
  // error", which fails the dashboard health sweeps and can drop the cookie
  // banner's dynamic import.
});
