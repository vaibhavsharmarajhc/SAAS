const CACHE_NAME = 'trackmychambers-cache-v72';
const ASSETS = [
  '/dashboard',
  '/app.html',
  '/css/styles.css?v=1.0.72',
  '/js/app.js?v=1.0.72',
  '/js/vendor/lucide.min.js',
  '/js/vendor/chart.min.js',
  '/js/workers/ledger.worker.js',
  '/js/tasks.js',
  '/js/history.js',
  '/js/dashboard.js',
  '/js/clients.js',
  '/js/cases.js',
  '/js/diary.js',
  '/js/accounts.js',
  '/js/share.js',
  '/js/admin.js',
  '/js/portal.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Service worker asset pre-caching failed:", err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("Purging old cache version:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request);
      })
  );
});
