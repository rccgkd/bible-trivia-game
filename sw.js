// ============================================================
// sw.js: service worker (offline support)
//
// After the first visit, the game itself keeps working with no
// connection: pages are served from the network when possible and
// from the saved copy otherwise. Audience voting still needs the
// internet. scripts/build.mjs fills in the two placeholders below
// on every deployment, so visitors always receive fresh files.
// ============================================================

const CACHE = 'kq-/*BUILD_ID*/dev';
const PRECACHE = [/*PRECACHE*/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kq-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only our own files. Firebase and everything else go straight to the network.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network first, falling back to the saved copy: fresh when online, working when not.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : Response.error()))),
  );
});
