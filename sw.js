// DK Coach — Offline-Speicher. VERSION und DATEIEN setzt build.js.
const VERSION = '0493863625';
const DATEIEN = ['./', 'index.html', 'app.js', 'daten.js', 'kompakt.js', 'coach.js', 'buehne.js', 'buehne.css', 'antippen.js', 'gefuehl.js', 'raum.js', 'spiel.js', 'bestleistung.js', 'rang.js', 'medaille.js', 'pr-raum.js', 'relief-athlet.png', 'stil.css',
  'schriften/schriften.css', 'schriften/figtree.woff2', 'schriften/archivo.woff2', 'schriften/plex-sans.woff2', 'schriften/plex-mono-500.woff2', 'figur.js', 'figur-modell.js', 'einleitung.js', 'bewegungen.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'vendor/three.module.min.js', 'vendor/OrbitControls.js',
  'koerper.bin', 'koerper-haut.jpg', 'koerper-haut-n.jpg', 'koerper-haar.jpg', 'koerper-augen.jpg'];
const NAME = 'dk-coach-' + VERSION;

self.addEventListener('install', (e) => {
  // Alles oder nichts: erst wenn jede Datei da ist, gilt die neue Fassung.
  // cache: 'reload' = am Browser-Zwischenspeicher vorbei (GitHub Pages hält Dateien 10 Minuten), sonst landet eine alte app.js in der neuen Fassung
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(DATEIEN.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // Alles außer der aktuellen Fassung löschen, auch fremd benannte Speicher: So überlebt nichts Untergeschobenes ein Update
  e.waitUntil(caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== NAME).map((n) => caches.delete(n)))).then(() => self.clients.claim())
    // Steht noch ein Code-Link (#z=…) in der Adresse, hat ihn eine ältere App-Fassung (vor dem 29.10.2026) nicht gekannt: einmal neu laden.
    // ?neu=… macht die Adresse anders, sonst springt der Browser nur zum #-Teil statt neu zu laden.
    .then(() => self.clients.matchAll({ type: 'window' })).then((fenster) => fenster.forEach((c) => {
      if (!c.navigate) return;
      const u = new URL(c.url);
      // Eigene Seiten: Analyse (eine Fassung vor dem 01.11.2026 hat dort die App gezeigt), Impressum und Datenschutz (seit 06.11.2026). Einmal echt laden.
      if (/\/(analyse|impressum|datenschutz)\//.test(u.pathname)) { c.navigate(u.href).catch(() => {}); return; }
      if (!/[#&]z=/.test(c.url)) return;
      u.searchParams.set('neu', VERSION); c.navigate(u.href).catch(() => {});
    })));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (VERSION === 'dev') return;   // am PC (ungebaut) immer frisch vom Server
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/\.mp4$/.test(url.pathname)) return;   // Wellen-Video: immer direkt vom Server, Safari holt es stückweise
  if (/\/(analyse|impressum|datenschutz)\//.test(url.pathname)) return;   // eigene Seiten (Analyse seit 31.10.2026, Impressum und Datenschutz seit 06.11.2026): nie die App ausliefern
  if (url.searchParams.has('umzug')) return;   // Umzug-Probe (06.11.2026, app.js): immer beim Server fragen, nie aus dem Speicher, eine Umleitung bleibt sichtbar
  // Seitenaufruf der App: immer die gespeicherte App (der Plan steckt im #-Teil, der geht nie ans Netz)
  if (req.mode === 'navigate' && /(\/|index\.html)$/.test(url.pathname)) {
    e.respondWith(caches.open(NAME).then((c) => c.match('index.html')).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.open(NAME).then((c) => c.match(req, { ignoreSearch: true })).then((r) => r || fetch(req).then((antwort) => {
    if (antwort.ok) { const kopie = antwort.clone(); caches.open(NAME).then((c) => c.put(req, kopie)); }
    return antwort;
  })));
});
