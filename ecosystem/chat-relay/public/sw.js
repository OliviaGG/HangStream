// Minimal service worker for PWA install criteria (scope: /).
// No caching — network passthrough only. Per-game caching lives in each
// game's own service worker.
self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
