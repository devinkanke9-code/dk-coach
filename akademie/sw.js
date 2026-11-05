// DK Akademie — Offline-Speicher. VERSION und DATEIEN setzt bauen.mjs.
// Nur für akademie/ (eigener Bereich, die Kunden-App hat ihren eigenen Service Worker eine Ebene höher).
const VERSION = 'ba655dd0d4';
const DATEIEN = ['./lernen.html', '3d/bewegungen.js', '3d/buehne.js', '3d/coach.js', '3d/einleitung.js', '3d/figur-modell.js', '3d/figur.js', '3d/koerper-augen.jpg', '3d/koerper-haar.jpg', '3d/koerper-haut-n.jpg', '3d/koerper-haut.jpg', '3d/koerper.txt', '3d/vendor/OrbitControls.js', '3d/vendor/three.module.min.js', 'akademie.css', 'akademie.js', 'antippen.js', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon.svg', 'inhalt.dkx', 'manifest.webmanifest', 'schloss.js', 'schriften/archivo.woff2', 'schriften/plex-mono-500.woff2', 'schriften/plex-sans.woff2', 'schriften/schriften.css', 'uebungen.js'];
const NAME = 'dk-akademie-' + VERSION;

const fuellen = () => caches.open(NAME).then((c) => Promise.all(DATEIEN.map((u) => c.match(u).then((da) => da || c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // nur eigene alte Fassungen löschen
  e.waitUntil(caches.keys().then((n) => Promise.all(n.filter((x) => x.startsWith('dk-akademie-') && x !== NAME).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Seite der Akademie, immer aus dem Speicher (der Code steckt im #-Teil und geht nie ans Netz). Fehlt etwas (z. B. weil eine
    // andere App auf dieser Adresse ihren Speicher geleert hat), im Hintergrund nachladen.
    e.waitUntil(fuellen());
    e.respondWith(caches.open(NAME).then((c) => c.match('./lernen.html')).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.open(NAME).then((c) => c.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((a) => { if (a.ok) c.put(req, a.clone()); return a; }))));
});
