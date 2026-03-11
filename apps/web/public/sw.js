// Minimal service worker to satisfy PWA install criteria.
// Keep a basic pass-through fetch handler for maximum desktop Chrome installability
// compatibility across versions/platforms.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
