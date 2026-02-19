// Minimal service worker to satisfy PWA install criteria.
// Chrome requires a registered service worker with a fetch handler
// before it will fire the beforeinstallprompt event.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Network-first pass-through. The SW exists solely to enable PWA installability.
  return;
});
