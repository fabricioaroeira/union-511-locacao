const VERSION = 'v' + Date.now();
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Estratégia network-first sem cache
self.addEventListener('fetch', e => {
  // deixa o browser decidir, sem interceptar
});
