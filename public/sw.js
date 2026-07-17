const CACHE_NAME = 'logicard-static-v1';
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

  if (CACHE_WHITELIST.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
