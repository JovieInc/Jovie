// Minimal service worker to satisfy PWA install criteria.
// Chrome no longer requires a fetch handler for beforeinstallprompt (since ~M120),
// so we only need install + activate. Removing the no-op fetch handler eliminates
// the "Fetch event handler is recognized as no-op" console warning and avoids
// navigation overhead.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
