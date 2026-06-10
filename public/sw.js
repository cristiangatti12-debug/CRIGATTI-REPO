const CACHE_NAME = "vela-v7";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => {
        self.registration.unregister();
        return self.clients.claim();
      })
  );
});
