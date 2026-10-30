/* DelegateDesk service worker: makes the app installable and keeps its screens loading on a weak connection.
   Live data (/api) is never cached, so nothing shown is ever out of date. */
const VERSION = 'dd-v1';
const SHELL = ['/', '/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;          // live data: always the network
  if (req.mode === 'navigate') {
    // Pages: the network first (always the latest app); offline, the cached app shell, then the offline page.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); return res; })
      .catch(() => caches.match('/').then((r) => r || caches.match('/offline.html'))));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    // Built files have a hash in their name, so a cached copy is always the right one.
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })));
    return;
  }
  // Icons, manifest and other small files: answer from the cache, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
