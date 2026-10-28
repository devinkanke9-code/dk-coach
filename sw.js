// DK Coach — Offline-Speicher. VERSION und DATEIEN setzt build.js.
const VERSION = 'b274fc84c6';
const DATEIEN = ['./', 'index.html', 'app.js', 'daten.js', 'coach.js', 'buehne.js', 'buehne.css', 'stil.css',
  'schriften/schriften.css', 'schriften/archivo.woff2', 'schriften/plex-sans.woff2', 'schriften/plex-mono-500.woff2', 'figur.js', 'figur-modell.js', 'bewegungen.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/three.module.min.js', 'vendor/OrbitControls.js',
  'koerper.bin', 'koerper-haut.jpg', 'koerper-haut-n.jpg', 'koerper-haar.jpg', 'koerper-augen.jpg'];
const NAME = 'dk-coach-' + VERSION;

self.addEventListener('install', (e) => {
  // Alles oder nichts: erst wenn jede Datei da ist, gilt die neue Fassung.
  // cache: 'reload' = am Browser-Zwischenspeicher vorbei (GitHub Pages hält Dateien 10 Minuten), sonst landet eine alte app.js in der neuen Fassung
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((namen) => Promise.all(namen.filter((n) => n.startsWith('dk-coach-') && n !== NAME).map((n) => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (VERSION === 'dev') return;   // am PC (ungebaut) immer frisch vom Server
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // Seitenaufruf der App: immer die gespeicherte App (der Plan steckt im #-Teil, der geht nie ans Netz)
  if (req.mode === 'navigate' && /(\/|index\.html)$/.test(url.pathname)) {
    e.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((antwort) => {
    if (antwort.ok) { const kopie = antwort.clone(); caches.open(NAME).then((c) => c.put(req, kopie)); }
    return antwort;
  })));
});
