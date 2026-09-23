const VERSION = 'gheymat-v1';
const SHELL = ['./', './index.html', './css/style.css', './js/app.js', './js/money.js', './js/scan.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const same = new URL(req.url).origin === self.location.origin;
  e.respondWith(
    same
      ? fetch(req).then((res) => { const c = res.clone(); caches.open(VERSION).then((x) => x.put(req, c)); return res; })
          .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
      : caches.match(req).then((c) => c || fetch(req))
  );
});
