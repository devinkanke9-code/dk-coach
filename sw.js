// DK Coach — Offline-Speicher. VERSION und DATEIEN setzt build.js.
const VERSION = 'r2811d';
// Offline-Kern (24.11.2026, Kundenperspektive „schlechter Empfang im Gym“): Plan, Training, Eintragen und alle statisch geladenen Module.
// Kommt ohne den Kern keine neue Fassung zustande, bleibt die alte. 3D-Figur, Gym und Bilder sind optional: Sie kommen mit, wenn es klappt,
// fehlt eins (Funkloch, Speicher knapp), gilt die neue Fassung trotzdem und das Training läuft ohne Figur (statische Vorschau).
const KERN = ['./', 'index.html', 'app.js', 'daten.js', 'kompakt.js', 'coach.js', 'buehne.js', 'buehne.css', 'antippen.js', 'status.js', 'figurwahl.js', 'essen.js', 'essen-daten.js', 'essen.css', 'gesund.js', 'gesund-daten.js', 'gesund.css', 'strichcode.js', 'qrcode.js', 'ki-foto.js', 'gefuehl.js',
  'spiel.js', 'bestleistung.js', 'statistik.js', 'statistik-grafik.js', 'rang.js', 'medaille.js', 'pr-raum.js', 'stil.css', 'sport.css', 'sport.js',
  'schriften/schriften.css', 'schriften/figtree.woff2', 'schriften/archivo.woff2', 'schriften/plex-sans.woff2', 'schriften/plex-mono-500.woff2', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const OPTIONAL = ['skin-standard.jpg', 'skin-athlet.jpg', 'skin-kraftpaket.jpg', 'skin-laeufer.jpg', 'skin-gold.jpg', 'hintergrund-hoch.jpg', 'hintergrund-breit.jpg', 'hintergrund-hoch-hell.jpg', 'hintergrund-breit-hell.jpg',
  'raum.js', 'relief-athlet.png', 'figur.js', 'figur-modell.js', 'einleitung.js', 'bewegungen.js', 'vendor/three.module.min.js', 'vendor/OrbitControls.js',
  'koerper.bin', 'koerper-haut.jpg', 'koerper-haut-n.jpg', 'koerper-haar.jpg', 'koerper-augen.jpg'];
const DATEIEN = KERN.concat(OPTIONAL);   // alle zusammen: so viele Dateien wie vorher
const NAME = 'dk-coach-' + VERSION;
// Foto vom Essen (26.11.2026): Bild-Modell und Laufzeit (ki/, ca. 35 MB) in einem eigenen Speicher. Der überlebt App-Updates, sonst müsste jeder Kunde nach jedem Update
// alles neu laden. Der Name ändert sich nur mit einem neuen Modell; dann wird der alte Speicher gelöscht. Die Dateien sind nach Prüfsumme festgelegt (build.js).
const KI = 'dk-ki-aiy-food-v1';

self.addEventListener('install', (e) => {
  // Alles oder nichts: erst wenn jede Datei da ist, gilt die neue Fassung.
  // cache: 'reload' = am Browser-Zwischenspeicher vorbei (GitHub Pages hält Dateien 10 Minuten), sonst landet eine alte app.js in der neuen Fassung
  // 16.11.2026: Eine neue Fassung wartet, bis die App „Jetzt aktualisieren“ sagt (oder gerade geöffnet wurde). So bricht nie ein laufendes Training ab.
  // Erste Installation oder eine ältere App-Fassung ohne diesen Knopf (kein Merker dk-flags): sofort übernehmen wie bisher, sonst bliebe sie hängen.
  // 24.11.2026: Kern alles oder nichts, optionale Dateien einzeln (ein Fehler dort hält die neue Fassung nicht auf)
  const holen = (u) => new Request(u, { cache: 'reload' });
  e.waitUntil(caches.open(NAME).then((c) => c.addAll(KERN.map(holen)).then(() => Promise.all(OPTIONAL.map((u) => c.add(holen(u)).catch(() => {})))))
    .then(() => (self.registration.active ? caches.has('dk-flags') : false)).then((kannWarten) => { if (!kannWarten) return self.skipWaiting(); }));
});
self.addEventListener('message', (e) => { if (e.data === 'jetzt') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  // Alles außer der aktuellen Fassung löschen, auch fremd benannte Speicher: So überlebt nichts Untergeschobenes ein Update.
  // Ausnahme (13.11.2026): Die DK Akademie (akademie/, gleiche Adresse) hat ihren eigenen Speicher dk-akademie-…, den räumt nur sie selbst auf.
  e.waitUntil(caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== NAME && n !== 'dk-flags' && n !== KI && !n.startsWith('dk-akademie-')).map((n) => caches.delete(n)))).then(() => self.clients.claim())
    // Steht noch ein Code-Link (#z=…) in der Adresse, hat ihn eine ältere App-Fassung (vor dem 29.10.2026) nicht gekannt: einmal neu laden.
    // ?neu=… macht die Adresse anders, sonst springt der Browser nur zum #-Teil statt neu zu laden.
    .then(() => self.clients.matchAll({ type: 'window' })).then((fenster) => fenster.forEach((c) => {
      if (!c.navigate) return;
      const u = new URL(c.url);
      // Eigene Seiten: Analyse (eine Fassung vor dem 01.11.2026 hat dort die App gezeigt), Impressum und Datenschutz (seit 06.11.2026). Einmal echt laden.
      if (/\/(analyse|impressum|datenschutz|widerruf|kuendigen)\//.test(u.pathname)) { c.navigate(u.href).catch(() => {}); return; }
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
  if (/\/(analyse|impressum|datenschutz|widerruf|kuendigen)\//.test(url.pathname)) return;   // eigene Seiten (Analyse seit 31.10.2026, Impressum und Datenschutz seit 06.11.2026, Widerruf und Kündigen seit 20.11.2026): nie die App ausliefern
  if (url.searchParams.has('umzug')) return;
  if (url.pathname.indexOf('/ki/') >= 0) {   // Foto vom Essen: eigener Speicher (siehe KI oben)
    e.respondWith(caches.open(KI).then((c) => c.match(req).then((r) => r || fetch(req).then((antwort) => { if (antwort.ok) c.put(req, antwort.clone()); return antwort; }))));
    return;
  }   // Umzug-Probe (06.11.2026, app.js): immer beim Server fragen, nie aus dem Speicher, eine Umleitung bleibt sichtbar
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
