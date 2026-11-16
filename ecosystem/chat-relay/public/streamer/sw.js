// streamer dashboard PWA service worker — installability shim.
// Network-first passthrough; no caching (dashboard is online-only by design).

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Chrome's PWA install criteria require a fetch handler that actually
// responds to the request. A pure passthrough satisfies that without
// adding any caching behavior.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => Response.error()));
});
