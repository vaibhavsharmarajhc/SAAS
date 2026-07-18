const CACHE_NAME = 'trackmychambers-cache-v3';
const ASSETS = [
  '/dashboard',
  '/css/styles.css?v=1.0.2',
  '/js/app.js',
  '/js/tasks.js',
  '/js/dashboard.js',
  '/js/clients.js',
  '/js/cases.js',
  '/js/diary.js',
  '/js/accounts.js',
  '/js/share.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Force waiting worker to take over
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn("Service worker asset pre-caching failed (expected for runtime auth paths):", err);
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
            console.log("Removing old cache:", key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // Take control of open tabs immediately
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      });
    })
  );
});
