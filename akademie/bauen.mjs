// DK Akademie bauen (Node 20+). Eine Quelle, zwei Fassungen:
//   1. Web-App in diesem Ordner (lernen.html): Lektionen verschlüsselt in inhalt.dkx, Offline-Speicher sw.js
//   2. claude.ai-Fassung (mit KI, Upload, Speichern im Konto): eine Seite mit allem inline, Ausgabe nach --artifact <datei>
// Aufruf:  DK_AKADEMIE_CODE=XXXX-XXXX-XXXX-XXXX node bauen.mjs --ak <ak.js> [--artifact <seite.html>]
//   ak.js = "var AK = {plan, lektionen}" (aus der claude.ai-Fassung oder entschlüsselt aus inhalt.dkx mit --auspacken).
//   Der Code steht nur im privaten Plan-Dokument „DK – Alle Pläne“, nie im Repo.
//   node bauen.mjs --auspacken <ziel-ak.js>   entschlüsselt inhalt.dkx wieder (zum Bearbeiten der Lektionen).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const sauber = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const code = sauber(process.env.DK_AKADEMIE_CODE);
if (code.length < 12) { console.error('DK_AKADEMIE_CODE fehlt oder ist zu kurz.'); process.exit(1); }
const RUNDEN = 300000;

async function schluessel(salz) {
  const basis = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt: salz, iterations: RUNDEN, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const leseAK = (pfad) => new Function(readFileSync(pfad, 'utf8') + ';return AK;')();

if (arg('--auspacken')) {
  const b = readFileSync(join(HIER, 'inhalt.dkx'));
  const runden = b.readUInt32BE(4), salz = b.subarray(8, 24), iv = b.subarray(24, 36), daten = b.subarray(36);
  if (runden !== RUNDEN) throw new Error('andere Rundenzahl: ' + runden);
  const klar = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, await schluessel(salz), daten);
  writeFileSync(arg('--auspacken'), 'var AK = ' + new TextDecoder().decode(klar) + ';\n');
  console.log('entschlüsselt nach', arg('--auspacken'));
  process.exit(0);
}

const akPfad = arg('--ak');
if (!akPfad) { console.error('--ak <ak.js> fehlt'); process.exit(1); }
const AK = leseAK(akPfad);
if (!AK || !AK.plan || !AK.lektionen) throw new Error('ak.js enthält kein AK mit plan und lektionen');
const akJson = JSON.stringify(AK);

// 1. inhalt.dkx
const salz = webcrypto.getRandomValues(new Uint8Array(16)), iv = webcrypto.getRandomValues(new Uint8Array(12));
const geheim = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, await schluessel(salz), new TextEncoder().encode(akJson)));
const kopf = Buffer.alloc(8); kopf.write('DKX1', 0, 'ascii'); kopf.writeUInt32BE(RUNDEN, 4);
writeFileSync(join(HIER, 'inhalt.dkx'), Buffer.concat([kopf, Buffer.from(salz), Buffer.from(iv), Buffer.from(geheim)]));

// 2. sw.js mit Dateiliste und Fassung (Hash über alles außer sw.js und Werkzeug)
const AUSSER = new Set(['sw.js', 'bauen.mjs', 'index.html']);
const alle = [];
(function lauf(d) { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) lauf(p); else { const r = relative(HIER, p).split('\\').join('/'); if (!AUSSER.has(r)) alle.push(r); } } })(HIER);
const hash = createHash('sha256'); for (const r of alle) { if (r === 'inhalt.dkx') hash.update(akJson); else hash.update(r).update(readFileSync(join(HIER, r))); }
const VERSION = hash.digest('hex').slice(0, 10);
writeFileSync(join(HIER, 'sw.js'), `// DK Akademie — Offline-Speicher. VERSION und DATEIEN setzt bauen.mjs.
// Nur für akademie/ (eigener Bereich, die Kunden-App hat ihren eigenen Service Worker eine Ebene höher).
const VERSION = '${VERSION}';
const DATEIEN = ['./lernen.html', ${alle.filter((r) => r !== 'lernen.html').map((r) => `'${r}'`).join(', ')}];
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
`);
console.log('Web-App gebaut: Fassung', VERSION, '·', alle.length + 1, 'Dateien');

// 3. claude.ai-Fassung: Seite mit allem inline (3d/ wird als eigene Dateien mitveröffentlicht)
const ziel = arg('--artifact');
if (ziel) {
  const lies = (r) => readFileSync(join(HIER, r), 'utf8');
  const html = lernenZuArtifact(lies('lernen.html'));
  function lernenZuArtifact(seite) {
    const koerper = seite.slice(seite.indexOf('<body>') + 6, seite.indexOf('</body>'))
      .replace(/<script src="([^"]+)"><\/script>\n?/g, (m, src) => src === 'schloss.js' ? '' : src === 'uebungen.js'
        ? '<script>\nvar AK = ' + akJson.replace(/<\//g, '<\\/') + ';\n' + lies(src) + '\n</script>\n' : '<script>\n' + lies(src) + '\n</script>\n')
      .replace('<p class="leise">Akademie lädt …</p>', '');
    return '<title>DK Akademie</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700;125,800&family=IBM+Plex+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">\n'
      + '<script type="importmap">{ "imports": { "three": "./3d/vendor/three.module.min.js" } }</script>\n'
      + '<style>\n' + lies('akademie.css') + '\n</style>\n' + koerper.trim() + '\n';
  }
  writeFileSync(ziel, html);
  console.log('claude.ai-Fassung:', ziel, Math.round(html.length / 1024) + ' KB');
}
