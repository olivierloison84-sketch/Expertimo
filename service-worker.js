self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('fetch', (event) => {
  // Vidéos (gros fichiers, requêtes Range) : le navigateur les gère seul, jamais interceptées ni mises en cache.
  if (event.request.destination === 'video' || event.request.headers.has('range') || /\.mp4(\?|$)/i.test(event.request.url)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
