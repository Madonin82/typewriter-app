const CACHE_NAME = 'typewriter-studio-v5';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './text-worker.js',
  './jszip.min.js',
  './jspdf.umd.min.js',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png',
  './favicon-32x32.png'
];

// Listen for SKIP_WAITING message from client to instantly activate new service worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Fetch each asset bypassing HTTP browser cache to avoid caching stale bundles
      const cachePromises = PRECACHE_ASSETS.map(async (url) => {
        try {
          const res = await fetch(url, { cache: 'reload' });
          if (res.ok) {
            await cache.put(url, res);
          }
        } catch (e) {
          console.warn('[SW] Precache failed for:', url, e);
        }
      });
      return Promise.all(cachePromises);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key !== 'typewriter-fonts-v1')
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or Google API / Firebase external requests from strict caching
  if (event.request.method !== 'GET') return;
  if (
    url.origin.includes('googleapis.com') ||
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('firebaseinstallations.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com')
  ) {
    return;
  }

  // 1. Google Fonts caching (Cache-First)
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open('typewriter-fonts-v1').then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return cachedResponse || new Response('Offline font fallback', { status: 503 });
        }
      })
    );
    return;
  }

  // 2. Navigation requests: Network-First with offline cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (
            (await cache.match(event.request)) ||
            (await cache.match('./index.html')) ||
            (await cache.match('./'))
          );
        })
    );
    return;
  }

  // 3. Application Scripts & Stylesheets (app.js, style.css): Network-First to avoid stale patches
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw new Error('Offline and not cached');
        })
    );
    return;
  }

  // 4. Other static assets (images, icons, manifest): Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);

      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
