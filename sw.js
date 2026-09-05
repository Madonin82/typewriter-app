const CACHE_NAME = 'typewriter-studio-v3';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './jszip.min.js',
  './jspdf.umd.min.js',
  './manifest.json',
  './icon.svg',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png',
  './favicon-32x32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests or Google API / Firebase external requests from strict caching
  if (event.request.method !== 'GET') return;
  if (url.origin.includes('googleapis.com') || url.origin.includes('firestore.googleapis.com') || url.origin.includes('firebaseinstallations.googleapis.com') || url.origin.includes('identitytoolkit.googleapis.com')) {
    return;
  }

  // Google Fonts caching
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

  // Stale-While-Revalidate for app shell & local assets
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        // Return cached or offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return cache.match('./index.html') || cache.match('/');
        }
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
