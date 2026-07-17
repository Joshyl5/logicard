const CACHE_NAME = 'logicard-static-v2';
const CACHE_WHITELIST = [
  '/manifest.json',
  '/styles.css',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_WHITELIST))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls or page navigations — auth state and offer data must always be live.
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate') return;

  // Network-first: always try to get the latest deploy's version of these
  // files, only falling back to the cached copy if the network fails (e.g.
  // offline). Cache-first previously meant a deploy could change styles.css
  // and returning visitors would never see it until CACHE_NAME was bumped.
  if (CACHE_WHITELIST.includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
