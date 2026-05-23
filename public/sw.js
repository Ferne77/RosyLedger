const CACHE = 'rosyledger-shell-v6';
const SHELL_ASSETS = ['/', '/js/app.js'];

function isStaticAsset(pathname) {
  return pathname === '/' || pathname.startsWith('/js/') || pathname === '/manifest.json';
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;

  /* CSS always from network — avoids stale styles after updates */
  if (url.pathname.startsWith('/css/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(url.pathname, copy));
        }
        return response;
      })
      .catch(() => caches.match(url.pathname))
  );
});
