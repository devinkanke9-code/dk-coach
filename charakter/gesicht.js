// DK Coach — Gesicht aus dem Foto (Devin, 2.11.: „das Gesicht … wirklich genau … 1:1, wie es auf dem Bild aussieht“).
// MediaPipe Face Landmarker findet 478 Punkte im Foto (läuft nur auf dem Gerät, das Foto bleibt dort). Aus genau diesen Punkten entsteht eine
// Maske mit dem Foto als Textur, sie sitzt fest am Kopfknochen wie der Hut. Der Kopf der Figur rückt mit (Kieferlinie, Nase, Stirn), damit nichts
// durch die Maske kommt und ihr Rand in die Haut übergeht. GESICHT_REF: dieselben Punkte am Gesicht der Figur (Ruhelage, Meter), eingemessen in gesicht-werkstatt.html
import * as THREE from 'three';
import { GESICHT_REF } from './gesicht-ref.js';

const u = (p) => new URL(p, document.baseURI).href;
let werkzeug = null, laden = null, DREIECKE = null, modell = null;
export const ANZAHL = 468;   // die Iris-Punkte (468–477) zählen nicht zum Netz

export function ladeGesicht() {
  if (laden) return laden;
  laden = (async () => {
    const vision = await import(u('ki/vision_bundle.js'));
    if (!modell) {
      const antwort = await fetch(u('ki/gesicht.txt'));
      if (!antwort.ok) throw new Error('gesicht.txt: ' + antwort.status);
      const b64 = atob((await antwort.text()).trim()), b = new Uint8Array(b64.length);
      for (let i = 0; i < b64.length; i++) b[i] = b64.charCodeAt(i);
      modell = b;
    }
    const fileset = { wasmLoaderPath: u('ki/vision_wasm_internal.js'), wasmBinaryPath: u('ki/vision_wasm_internal.wasm') };
    werkzeug = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modell, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1,
      minFaceDetectionConfidence: 0.3, minFacePresenceConfidence: 0.3, minTrackingConfidence: 0.3
    });
    // Das Netz: je drei aufeinanderfolgende Verbindungen sind ein Dreieck
    const v = vision.FaceLandmarker.FACE_LANDMARKS_TESSELATION; DREIECKE = [];
    for (let i = 0; i + 2 < v.length; i += 3) DREIECKE.push([v[i].start, v[i].end, v[i + 1].end]);
    return werkzeug;
  })().catch((err) => { laden = null; throw err; });
  return laden;
}

// Quadratischer Ausschnitt ums Gesicht in voller Foto-Auflösung (box: x, y = Mitte, g = Kante, in Pixeln der Quelle). Im Ganzkörperfoto ist das Gesicht
// sonst zu klein für die Erkennung. Liefert den Ausschnitt und die Punkte (x, y, z je 0…1 der Kante, z wie x, kleiner = näher an der Kamera)
export async function findeGesicht(quelle, box, kante = 768) {
  const fl = await ladeGesicht();
  const c = document.createElement('canvas'); c.width = c.height = kante;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(quelle, box.x - box.g / 2, box.y - box.g / 2, box.g, box.g, 0, 0, kante, kante);
  const erg = fl.detect(c);
  if (!erg.faceLandmarks || !erg.faceLandmarks.length) return null;
  return { c, punkte: erg.faceLandmarks[0], kante, box };
}
// Genauer: dasselbe Gesicht aus mehreren leicht verschobenen und anders großen Ausschnitten messen und mitteln. Gibt ruhigere Punkte als ein einzelner Blick
export async function findeGenau(quelle, box, kante = 768) {
  const fund = await findeGesicht(quelle, box, kante);
  if (!fund) return null;
  const summe = fund.punkte.map((p) => ({ x: p.x, y: p.y, z: p.z })); let n = 1;
  for (const [fg, ox, oy] of [[0.9, 0, 0], [1.12, 0, 0], [1, 0.03, 0], [1, -0.03, 0], [1, 0, 0.03], [1, 0, -0.03]]) {
    const b = { x: box.x + ox * box.g, y: box.y + oy * box.g, g: box.g * fg }, f = await findeGesicht(quelle, b, 512);
    if (!f) continue;
    f.punkte.forEach((p, i) => {
      // zurück in den ersten Ausschnitt
      const X = (b.x - b.g / 2 + p.x * b.g - (box.x - box.g / 2)) / box.g, Y = (b.y - b.g / 2 + p.y * b.g - (box.y - box.g / 2)) / box.g;
      summe[i].x += X; summe[i].y += Y; summe[i].z += p.z * fg;
    });
    n++;
  }
  fund.punkte = summe.map((p) => ({ x: p.x / n, y: p.y / n, z: p.z / n }));
  fund.anzahl = n;
  return fund;
}

// Wo im Foto der Kopf liegt, aus den Körperpunkten (e: Erkennung auf dem verkleinerten Bild, f: Foto-Pixel je Pixel dort)
export function kopfBox(e, f) {
  const k = e.pkt, sx = (k.sl.x + k.sr.x) / 2, sy = (k.sl.y + k.sr.y) / 2, d = Math.max(Math.hypot(sx - k.nase.x, sy - k.nase.y), 0.6 * Math.abs(k.sl.x - k.sr.x), 0.04 * e.h);
  return { x: k.nase.x * f, y: (k.nase.y - 0.18 * d) * f, g: 2.3 * d * f };
}

// Gesichtsfoto: erst im ganzen Bild suchen, dann eng ums Gesicht in voller Auflösung
export async function findeImSelfie(quelle) {
  const W = quelle.naturalWidth || quelle.width, H = quelle.naturalHeight || quelle.height, f1 = await findeGesicht(quelle, { x: W / 2, y: H / 2, g: Math.max(W, H) }, 640);
  if (!f1) return null;
  let lo = 1, hi = 0, ob = 1, un = 0;
  for (let i = 0; i < ANZAHL; i++) { const p = f1.punkte[i]; lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); ob = Math.min(ob, p.y); un = Math.max(un, p.y); }
  const g0 = f1.box.g, x0 = f1.box.x - g0 / 2, y0 = f1.box.y - g0 / 2, fw = (hi - lo) * g0, fh = (un - ob) * g0;
  return (await findeGenau(quelle, { x: x0 + (lo + hi) / 2 * g0, y: y0 + (ob + un) / 2 * g0 - fh * 0.12, g: Math.max(fw, fh) * 2 }, 1024)) || f1;
}
export function schliesseGesicht() { if (werkzeug) { try { werkzeug.close(); } catch (err) { /* schon zu */ } } werkzeug = null; laden = null; }
// Taugt das Foto fürs Gesicht? Stark gedreht oder winzig gibt es kein gutes Ergebnis, dann bleibt das Gesicht der Figur
export function taugt(fund, passung) {
  const p = fund.punkte; let lo = 1, hi = 0; for (const i of [234, 454, 127, 356, 93, 323]) { lo = Math.min(lo, p[i].x); hi = Math.max(hi, p[i].x); }
  const breitePx = (hi - lo) * fund.box.g, gier = Math.abs(passung.gier) * 180 / Math.PI, nick = Math.abs(passung.nick) * 180 / Math.PI;
  if (gier > 30 || nick > 24) return { ok: false, grund: 'Für dein Gesicht brauche ich ein Foto, auf dem du gerade in die Kamera schaust. Hier ist dein Kopf zu stark gedreht.', breitePx };
  if (breitePx < 40) return { ok: false, grund: 'Dein Gesicht ist auf dem Foto zu klein. Geh etwas näher ran oder nimm ein schärferes Foto.', breitePx };
  return { ok: true, leicht: gier > 18, breitePx };
}

/* ---------- Einpassen auf den Kopf ---------- */
// Größe, Drehung und Lage (Horn): A → B, beides n×3
function einpassung(A, B, n) {
  const ma = [0, 0, 0], mb = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { ma[c] += A[i * 3 + c] / n; mb[c] += B[i * 3 + c] / n; }
  const S = [0, 0, 0, 0, 0, 0, 0, 0, 0]; let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) {
    const a = [A[i * 3] - ma[0], A[i * 3 + 1] - ma[1], A[i * 3 + 2] - ma[2]], b = [B[i * 3] - mb[0], B[i * 3 + 1] - mb[1], B[i * 3 + 2] - mb[2]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r * 3 + c] += a[r] * b[c];
    sa += a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; sb += b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
  }
  const [xx, xy, xz, yx, yy, yz, zx, zy, zz] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  const spur = Math.abs(xx) + Math.abs(xy) + Math.abs(xz) + Math.abs(yx) + Math.abs(yy) + Math.abs(yz) + Math.abs(zx) + Math.abs(zy) + Math.abs(zz) + 1e-9;
  let q = [1, 0, 0, 0];
  for (let it = 0; it < 80; it++) {
    const w = [0, 1, 2, 3].map((r) => N[r][0] * q[0] + N[r][1] * q[1] + N[r][2] * q[2] + N[r][3] * q[3] + 3 * spur * q[r]), l = Math.hypot(...w);
    q = w.map((v) => v / l);
  }
  const R = new THREE.Quaternion(q[1], q[2], q[3], q[0]);
  const v = new THREE.Vector3(); let oben = 0;
  for (let i = 0; i < n; i++) { v.set(A[i * 3] - ma[0], A[i * 3 + 1] - ma[1], A[i * 3 + 2] - ma[2]).applyQuaternion(R); oben += v.x * (B[i * 3] - mb[0]) + v.y * (B[i * 3 + 1] - mb[1]) + v.z * (B[i * 3 + 2] - mb[2]); }
  return { R, s: oben / sa, ma, mb };
}
// Punkte im Foto → Punkte am Kopf der Figur (Ruhelage). gier/nick/roll: so ist der Kopf im Foto gedreht (Bogenmaß)
export function einpassen(fund) {
  const n = ANZAHL, A = new Float64Array(n * 3), B = GESICHT_REF;
  for (let i = 0; i < n; i++) { const p = fund.punkte[i]; A[i * 3] = p.x; A[i * 3 + 1] = -p.y; A[i * 3 + 2] = -p.z; }
  const { R, s, ma, mb } = einpassung(A, B, n), M = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(A[i * 3] - ma[0], A[i * 3 + 1] - ma[1], A[i * 3 + 2] - ma[2]).applyQuaternion(R).multiplyScalar(s);
    M[i * 3] = v.x + mb[0]; M[i * 3 + 1] = v.y + mb[1]; M[i * 3 + 2] = v.z + mb[2];
  }
  const e = new THREE.Euler().setFromQuaternion(R.clone().invert(), 'YXZ');
  return { M, s, R, ma, mb, gier: e.y, nick: e.x, roll: e.z };
}

/* ---------- Netz ---------- */
// Randschleifen des Netzes: die längste ist der Gesichtsumriss, die anderen sind Augen und Mund (dort hat das Netz Löcher)
function randSchleifen(tri) {
  const kanten = new Map();
  for (const [a, b, c] of tri) for (const [p, q] of [[a, b], [b, c], [c, a]]) { const s = Math.min(p, q) * 1000 + Math.max(p, q); kanten.set(s, (kanten.get(s) || 0) + 1); }
  const nb = new Map(), add = (p, q) => { if (!nb.has(p)) nb.set(p, []); nb.get(p).push(q); };
  for (const [s, z] of kanten) if (z === 1) { const p = Math.floor(s / 1000), q = s % 1000; add(p, q); add(q, p); }
  const frei = new Set(nb.keys()), schleifen = [];
  while (frei.size) {
    const start = frei.values().next().value, l = [start]; frei.delete(start);
    let hier = start;
    for (;;) { const w = nb.get(hier).find((x) => frei.has(x)); if (w === undefined) break; l.push(w); frei.delete(w); hier = w; }
    schleifen.push(l);
  }
  return schleifen.sort((a, b) => b.length - a.length);
}
export function netz() {
  const tri = DREIECKE.map((d) => d.slice()), s = randSchleifen(tri), loecher = [];
  for (const l of s.slice(1)) for (let i = 1; i + 1 < l.length; i++) loecher.push([l[0], l[i], l[i + 1]]);   // Augen und Mund schließen: das Foto zeigt sie ja
  return { tri, loecher, umriss: s[0], schleifen: s };
}
// Dreiecke zeigen nach außen (vom Kopf weg)
function ausrichten(tri, M) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3(0, 1.66, -0.02), q = new THREE.Vector3();
  for (const t of tri) {
    a.fromArray(M, t[0] * 3); b.fromArray(M, t[1] * 3); c.fromArray(M, t[2] * 3);
    n.copy(b).sub(a).cross(q.copy(c).sub(a));
    if (n.dot(q.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(m)) < 0) { const h = t[1]; t[1] = t[2]; t[2] = h; }
  }
  return tri;
}
function normalen(tri, M, n) {
  const N = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3(), q = new THREE.Vector3();
  for (const t of tri) {
    a.fromArray(M, t[0] * 3); b.fromArray(M, t[1] * 3); c.fromArray(M, t[2] * 3);
    f.copy(b).sub(a).cross(q.copy(c).sub(a));
    for (const i of t) { N[i * 3] += f.x; N[i * 3 + 1] += f.y; N[i * 3 + 2] += f.z; }
  }
  for (let i = 0; i < n; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  return N;
}

/* ---------- Durchsichtiger Rand ---------- */
export function randMaske(fund, umriss, muetze, seite = 256) {
  const c = document.createElement('canvas'); c.width = c.height = seite;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, seite, seite); x.fillStyle = '#fff'; x.beginPath();
  umriss.forEach((i, k) => { const p = fund.punkte[i]; if (k) x.lineTo(p.x * seite, p.y * seite); else x.moveTo(p.x * seite, p.y * seite); });
  x.closePath(); x.fill();
  // Breite des Übergangs: ein Zehntel der Gesichtsbreite. Am Umriss selbst ist die Maske schon ganz durchsichtig
  let lo = 1, hi = 0; for (const i of umriss) { lo = Math.min(lo, fund.punkte[i].x); hi = Math.max(hi, fund.punkte[i].x); }
  const R = Math.max(2, Math.round((hi - lo) * seite * 0.1)), bild = x.getImageData(0, 0, seite, seite), d = bild.data, a = new Float32Array(seite * seite), b = new Float32Array(seite * seite);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
  // Mütze im Foto: alles, was oberhalb der Brauen nach Mütze aussieht, fällt weg (die 3D-Mütze liegt dort)
  if (muetze) {
    const z = document.createElement('canvas'); z.width = z.height = seite; const zx = z.getContext('2d', { willReadFrequently: true }); zx.drawImage(fund.c, 0, 0, seite, seite);
    const f = zx.getImageData(0, 0, seite, seite).data, p9 = fund.punkte[9], rx = muetze.richt.x, ry = muetze.richt.y;
    for (let y = 0; y < seite; y++) for (let x = 0; x < seite; x++) {
      const i = y * seite + x; if (!a[i]) continue;
      if ((x / seite - p9.x) * rx + (y / seite - p9.y) * ry <= 0) continue;
      const c = [f[i * 4], f[i * 4 + 1], f[i * 4 + 2]];
      if (farbAbstand(c, muetze.farbe) < farbAbstand(c, muetze.stirn)) a[i] = 0;
    }
  }
  const verwische = (von, nach, dx, dy) => {
    for (let z = 0; z < seite; z++) {
      let sum = 0;
      for (let k = -R; k <= R; k++) { const q = Math.max(0, Math.min(seite - 1, k)); sum += dx ? von[z * seite + q] : von[q * seite + z]; }
      for (let k = 0; k < seite; k++) {
        const i = dx ? z * seite + k : k * seite + z; nach[i] = sum / (2 * R + 1);
        const rein = Math.min(seite - 1, k + R + 1), raus = Math.max(0, k - R);
        sum += (dx ? von[z * seite + rein] : von[rein * seite + z]) - (dx ? von[z * seite + raus] : von[raus * seite + z]);
      }
    }
  };
  verwische(a, b, 1, 0); verwische(b, a, 0, 1); verwische(a, b, 1, 0); verwische(b, a, 0, 1);
  for (let i = 0; i < a.length; i++) { const v = Math.max(0, Math.min(1, (a[i] - 0.5) * 2)), w = Math.round(255 * v * v * (3 - 2 * v)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = w; d[i * 4 + 3] = 255; }
  x.putImageData(bild, 0, 0);
  return c;
}

/* ---------- Farbe ---------- */
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
// Mittlere Hautfarbe (linear) am Rand der Maske und auf den Wangen; Augen, Brauen und Mund liegen weiter innen
const WANGE = [50, 280, 205, 425, 187, 411, 123, 352, 116, 345, 117, 346, 118, 347, 101, 330, 36, 266];
export function hautFarbe(fund) {
  const x = fund.c.getContext('2d', { willReadFrequently: true }), r = Math.max(2, Math.round(fund.kante * 0.006)), werte = [[], [], []];
  for (const i of WANGE) {
    const p = fund.punkte[i], px = Math.round(p.x * fund.kante), py = Math.round(p.y * fund.kante);
    if (px < r || py < r || px >= fund.kante - r || py >= fund.kante - r) continue;
    const d = x.getImageData(px - r, py - r, 2 * r, 2 * r).data;
    for (let k = 0; k < d.length; k += 4) for (let c = 0; c < 3; c++) werte[c].push(linear(d[k + c]));
  }
  if (!werte[0].length) return null;
  return werte.map((w) => { w.sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; });
}

// Farbton im Foto: Studiolicht färbt die Haut (bis tief ins Rot). Das Verhältnis der Kanäle bleibt in dem, was Haut hergibt, die Helligkeit bleibt. Daraus: C für die Maske, T für die ganze Haut
export const HAUT_BASIS = [0.6724, 0.305 * 0.89, 0.15 * 0.82];   // Wange der Figur (Textur mal Materialfarbe), linear
// Unterarm im Foto (frei und hautfarben): Unter der Mütze liegt das Gesicht oft im Schatten, der Arm zeigt den echten Hautton
export function armFarbe(bild, e) {
  const x = bild.getContext('2d', { willReadFrequently: true }), k = bild.width / e.w, r = Math.max(2, Math.round(0.006 * bild.height)), werte = [];
  for (const [a, b] of [[e.pkt.el, e.pkt.hl], [e.pkt.er, e.pkt.hr]]) {
    if (a.sichtbar < 0.5 || b.sichtbar < 0.5) continue;
    const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    if (e.d[Math.round(py) * e.w + Math.round(px)] !== 1) continue;
    const w = fleck(x, 1, px * k, py * k, r, true);
    if (w) { const l = w.map(linear); if (l[0] > l[1] * 1.1 && l[2] < l[1] * 0.95) werte.push(l); }
  }
  if (!werte.length) return null;
  return werte.sort((p, q) => q[1] - p[1])[0];
}
// Materialfarbe der Haut für einen Wunschton (linear)
export const hautAusZiel = (z) => z.map((v, i) => v / HAUT_BASIS[i] * [1, 0.89, 0.82][i]);
export function farbAbgleich(fund, arm) {
  const F = hautFarbe(fund);
  if (!F) return null;
  const grenze = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), hell = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Q = arm ? [0, 1, 2].map((i) => (F[i] + arm[i]) / 2) : F, LF = hell(F);
  // Dunkle Bilder sagen wenig über die Haut (Licht im Studio, Schatten der Mütze): unter 0,2 wird der Abstand kleiner gerechnet. Im Editor lässt sich der Ton jederzeit stellen
  const lRoh = arm ? 0.3 * LF + 0.7 * Math.max(LF, hell(arm)) : LF, rg = grenze(Q[0] / Q[1], 1.35, 2.2), bg = grenze(Q[2] / Q[1], 0.35, 0.8), L = lRoh < 0.2 ? 0.2 - (0.2 - lRoh) * 0.6 : lRoh;
  const g = L / (0.2126 * rg + 0.7152 + 0.0722 * bg), ziel = [rg * g, g, bg * g];
  // Die Maske darf ihr Bild nur sanft umfärben, sonst werden die Augen grün: je Kanal höchstens ein gutes Drittel gegen die Helligkeit
  const roh = ziel.map((v, i) => v / F[i]), mittel = hell(ziel) / hell(F), C = roh.map((v) => mittel * grenze(v / mittel, 0.72, 1.38));
  return { F, ziel, C, T: ziel.map((v, i) => v / HAUT_BASIS[i] * [1, 0.89, 0.82][i]) };
}

/* ---------- Mütze ---------- */
const farbAbstand = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function fleck(x, kante, px, py, r, pixel) {
  px = Math.round(px * kante); py = Math.round(py * kante); r = Math.round(r);
  if (!pixel && (px < r || py < r || px >= kante - r || py >= kante - r)) return null;
  if (r < 1) return null;
  const d = x.getImageData(px - r, py - r, 2 * r, 2 * r).data, w = [[], [], []];
  for (let k = 0; k < d.length; k += 4) for (let c = 0; c < 3; c++) w[c].push(d[k + c]);
  return w.map((l) => { l.sort((p, q) => p - q); return l[Math.floor(l.length / 2)]; });
}
// Vom Punkt zwischen den Brauen die Stirn hinauf, bis die Farbe zur Mütze kippt. t = 1 wäre der obere Rand des Gesichtsnetzes
export function muetzenRand(fund) {
  const x = fund.c.getContext('2d', { willReadFrequently: true }), K = fund.kante, a = fund.punkte[9], b = fund.punkte[10], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
  const stirn = fleck(x, K, a.x + dx * 0.3, a.y + dy * 0.3, Math.max(2, K * 0.008)), farbe = fleck(x, K, a.x + dx * 1.7, a.y + dy * 1.7, Math.max(3, K * 0.015));
  if (!stirn || !farbe) return null;
  let t = 1.7;
  for (let q = 0.3; q < 1.7; q += 0.02) {
    const c = fleck(x, K, a.x + dx * q, a.y + dy * q, 2);
    if (c && farbAbstand(c, farbe) < farbAbstand(c, stirn)) { t = q; break; }
  }
  return { t, farbe, stirn, richt: { x: dx / l, y: dy / l } };
}
// Haarfarbe (linear) über der Stirn, wenn keine Mütze da ist
export function haarFarbe(fund) {
  const x = fund.c.getContext('2d', { willReadFrequently: true }), K = fund.kante, a = fund.punkte[9], b = fund.punkte[10], dx = b.x - a.x, dy = b.y - a.y;
  const stirn = fleck(x, K, a.x + dx * 0.6, a.y + dy * 0.6, Math.max(2, K * 0.008));
  if (!stirn) return null;
  for (let t = 0.9; t < 2; t += 0.05) { const c = fleck(x, K, a.x + dx * t, a.y + dy * t, Math.max(2, K * 0.008)); if (c && farbAbstand(c, stirn) > 70) { const n = fleck(x, K, a.x + dx * (t + 0.12), a.y + dy * (t + 0.12), Math.max(2, K * 0.008)); return (n || c).map(linear); } }
  return null;
}

/* ---------- Kopf verformen ---------- */
// Dünnplatten-Abbildung: Stützpunkte c → Ziele z. Dreidimensional mit φ(r) = r. Löst einmal (n+4)², danach ist jeder Punkt eine Summe
export function duennplatte(c, z, n, glatt, merk) {
  const G = n + 4, Y = [new Float64Array(G), new Float64Array(G), new Float64Array(G)];
  let A = merk && merk.A, reihe = merk && merk.reihe;
  for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) Y[d][i] = z[i * 3 + d];
  if (!A) {
    A = new Float64Array(G * G);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) { const r = Math.hypot(c[i * 3] - c[j * 3], c[i * 3 + 1] - c[j * 3 + 1], c[i * 3 + 2] - c[j * 3 + 2]); A[i * G + j] = r; A[j * G + i] = r; }
      A[i * G + i] = -glatt;   // Vorzeichen: φ(r) = r ist bedingt negativ definit, nur so glättet es (mit + wird die Matrix bei eng liegenden Punkten fast singulär)
      A[i * G + n] = 1; A[n * G + i] = 1;
      for (let d = 0; d < 3; d++) { A[i * G + n + 1 + d] = c[i * 3 + d]; A[(n + 1 + d) * G + i] = c[i * 3 + d]; }
    }
    // Gauß mit Spaltensuche; die Faktoren bleiben links in der Matrix stehen
    reihe = new Int32Array(G); for (let i = 0; i < G; i++) reihe[i] = i;
    for (let k = 0; k < G; k++) {
      let best = k, m = Math.abs(A[reihe[k] * G + k]);
      for (let i = k + 1; i < G; i++) { const v = Math.abs(A[reihe[i] * G + k]); if (v > m) { m = v; best = i; } }
      const t = reihe[k]; reihe[k] = reihe[best]; reihe[best] = t;
      const rk = reihe[k] * G, pv = A[rk + k] || 1e-12;
      for (let i = k + 1; i < G; i++) {
        const ri = reihe[i] * G, f = A[ri + k] / pv;
        A[ri + k] = f;
        if (f === 0) continue;
        for (let j = k + 1; j < G; j++) A[ri + j] -= f * A[rk + j];
      }
    }
    if (merk) { merk.A = A; merk.reihe = reihe; }
  }
  for (let k = 0; k < G; k++) for (let i = k + 1; i < G; i++) {
    const f = A[reihe[i] * G + k];
    if (f !== 0) for (const y of Y) y[reihe[i]] -= f * y[reihe[k]];
  }
  const W = [new Float64Array(G), new Float64Array(G), new Float64Array(G)];
  for (let d = 0; d < 3; d++) for (let k = G - 1; k >= 0; k--) {
    const rk = reihe[k] * G; let s = Y[d][reihe[k]];
    for (let j = k + 1; j < G; j++) s -= A[rk + j] * W[d][j];
    W[d][k] = s / (A[rk + k] || 1e-12);
  }
  return (x, y, zz, aus) => {
    let a = 0, b = 0, e = 0;
    for (let i = 0; i < n; i++) { const p = x - c[i * 3], q = y - c[i * 3 + 1], u = zz - c[i * 3 + 2], r = Math.sqrt(p * p + q * q + u * u); a += W[0][i] * r; b += W[1][i] * r; e += W[2][i] * r; }
    aus[0] = a + W[0][n] + W[0][n + 1] * x + W[0][n + 2] * y + W[0][n + 3] * zz;
    aus[1] = b + W[1][n] + W[1][n + 1] * x + W[1][n + 2] * y + W[1][n + 3] * zz;
    aus[2] = e + W[2][n] + W[2][n + 1] * x + W[2][n + 2] * y + W[2][n + 3] * zz;
  };
}

// Partner je Punkt: der Punkt am Gesicht der Figur, der ihm gespiegelt am nächsten liegt
let _partner = null;
function gesichtsPartner() {
  if (_partner) return _partner;
  _partner = new Int32Array(ANZAHL);
  for (let i = 0; i < ANZAHL; i++) { let b = 1e9, w = i; const x = -GESICHT_REF[i * 3], y = GESICHT_REF[i * 3 + 1], z = GESICHT_REF[i * 3 + 2]; for (let j = 0; j < ANZAHL; j++) { const d = Math.hypot(GESICHT_REF[j * 3] - x, GESICHT_REF[j * 3 + 1] - y, GESICHT_REF[j * 3 + 2] - z); if (d < b) { b = d; w = j; } } _partner[i] = w; }
  return _partner;
}
// Welche Seite (x in Ruhelage) vom Fotografen wegzeigt: dort stehen die Punkte im Foto enger, als sie am Kopf liegen
function fernSeite(fund, M) {
  let l = 0, r = 0;
  const seite = (a, b) => Math.hypot(fund.punkte[a].x - fund.punkte[b].x, fund.punkte[a].y - fund.punkte[b].y);
  l = seite(1, 454); r = seite(1, 234);   // Nasenspitze bis Umriss, links und rechts vom Betrachter aus
  return M[454 * 3] > 0 ? (l < r ? 1 : -1) : (l < r ? -1 : 1);
}

// Kopfpunkte der Figur (einmal je Körper): Haut mit Gewicht am Kopfknochen, Haare und Brauen ganz. Merkt sich die Ruhelage
function kopfPunkte(k) {
  if (k.kopfPunkte) return k.kopfPunkte;
  const kopf = k.index.Head, liste = [];
  for (const m of k.meshes) {
    if (m.mat !== 'haut' && m.mat !== 'haar') continue;
    const P = k.form && k.form.m === m ? k.form.ur : m.pos.array, gi = m.gel, gw = m.gew, nr = [], w = [];   // ohne Glätten: das rechnet setzeStaerke dazu
    for (let i = 0; i < m.pos.count; i++) {
      let g = 0; for (let j = 0; j < 4; j++) if (gi.getComponent(i, j) === kopf) g += gw.getComponent(i, j);
      if (m.mat === 'haar') g = 1;
      if (g > 0) { nr.push(i); w.push(g); }
    }
    const ur = new Float32Array(nr.length * 3); nr.forEach((i, q) => { ur[q * 3] = P[i * 3]; ur[q * 3 + 1] = P[i * 3 + 1]; ur[q * 3 + 2] = P[i * 3 + 2]; });
    liste.push({ m, nr: new Int32Array(nr), w: new Float32Array(w), ur });
  }
  return (k.kopfPunkte = liste);
}
// Stützpunkte, die festbleiben: Hinterkopf, Scheitel, Hals (aus den Punkten der Haut), damit nur das Gesicht rückt
function halteStellen(k) {
  const t = kopfPunkte(k).find((x) => x.m.mat === 'haut'), aus = [];
  const gitter = new Set();
  for (let q = 0; q < t.nr.length; q++) {
    const x = t.ur[q * 3], y = t.ur[q * 3 + 1], z = t.ur[q * 3 + 2];
    const hinten = z < 0.012, hals = y < 1.565, oben = y > 1.77;
    if (!hinten && !hals && !oben) continue;
    const s = Math.round(x / 0.03) + ',' + Math.round(y / 0.03) + ',' + Math.round(z / 0.03);
    if (gitter.has(s)) continue;
    gitter.add(s); aus.push(x, y, z);
  }
  return aus;
}

// Maske und Kopfform aufs Modell legen. stark: 0…1 wandert der Kopf (Übergang), die Maske blendet mit ein
export function legeAuf(figur, fund, passung, o = {}) {
  entferne(figur);
  const k = figur.k, n = ANZAHL, { tri, loecher, umriss } = netz(), M = passung.M;
  const alle = ausrichten(tri.concat(loecher), M), N = normalen(alle, M, n);
  // Stützpunkte: jeder Gesichtspunkt plus Haltestellen; der Kopf bleibt innen knapp hinter der Maske, am Umriss liegt er auf
  const halt = halteStellen(k), H = halt.length / 3, C = new Float64Array((n + H) * 3), Z = new Float64Array((n + H) * 3), ring = new Int32Array(n).fill(9), nachbarn = Array.from({ length: n }, () => []);
  for (const [a, b, c] of tri) { nachbarn[a].push(b, c); nachbarn[b].push(a, c); nachbarn[c].push(a, b); }
  for (const i of umriss) ring[i] = 0;
  for (let h = 0; h < 4; h++) for (let i = 0; i < n; i++) if (ring[i] === h) for (const j of nachbarn[i]) if (ring[j] > h + 1) ring[j] = h + 1;
  for (let i = 0; i < n; i++) {
    const zurueck = [0.0005, 0.002, 0.004, 0.008, 0.01][Math.min(4, ring[i])];   // innen weit hinter die Maske, am Umriss liegt der Kopf auf

    for (let d = 0; d < 3; d++) { C[i * 3 + d] = GESICHT_REF[i * 3 + d]; Z[i * 3 + d] = M[i * 3 + d] - N[i * 3 + d] * zurueck; }
  }
  for (let i = 0; i < H * 3; i++) { C[n * 3 + i] = halt[i]; Z[n * 3 + i] = halt[i]; }
  const f = duennplatte(C, Z, n + H, 0.0005);
  const aus = [0, 0, 0];
  const teile = kopfPunkte(k).map((t) => {
    const Ziel = new Float32Array(t.ur.length);
    for (let q = 0; q < t.nr.length; q++) {
      const x = t.ur[q * 3], y = t.ur[q * 3 + 1], z = t.ur[q * 3 + 2];
      f(x, y, z, aus);
      Ziel[q * 3] = x + (aus[0] - x) * t.w[q]; Ziel[q * 3 + 1] = y + (aus[1] - y) * t.w[q]; Ziel[q * 3 + 2] = z + (aus[2] - z) * t.w[q];
    }
    return { t, Ziel };
  });
  // Maske. Ist der Kopf im Foto gedreht, fehlt die abgewandte Wange: Diese Hälfte bekommt die Stelle der zugewandten (Partnerpunkt gespiegelt an der Gesichtsmitte)
  const geo = new THREE.BufferGeometry(), uv = new Float32Array(n * 2), partner = gesichtsPartner();
  const ferne = Math.abs(passung.gier) > 18 * Math.PI / 180 ? fernSeite(fund, M) : 0;
  for (let i = 0; i < n; i++) { const q = ferne && M[i * 3] * ferne > 0.004 ? partner[i] : i; uv[i * 2] = fund.punkte[q].x; uv[i * 2 + 1] = 1 - fund.punkte[q].y; }
  geo.setAttribute('position', new THREE.BufferAttribute(M.slice(), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(alle.flat());
  const tex = new THREE.CanvasTexture(fund.c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const hutAn = o.hut !== false, rm = hutAn ? muetzenRand(fund) : null;
  const rand = new THREE.CanvasTexture(randMaske(fund, umriss, rm));
  // Das Foto hat sein Licht schon: gut die Hälfte leuchtet selbst, keine Filmkurve, kein Schatten vom Hut. So bleiben die Farben wie im Bild
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaMap: rand, transparent: true, opacity: 1, roughness: 0.7, metalness: 0, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.42, toneMapped: false });
  const maske = new THREE.Mesh(geo, mat);
  maske.matrixAutoUpdate = false; maske.frustumCulled = false; maske.receiveShadow = false; maske.renderOrder = 2;
  figur.gruppe.add(maske);
  figur.gesichtMaske = maske;
  const aus3 = figur.meshes.filter((m) => m.material.defines && (m.material.defines.DK_AUGE || (hutAn && m.material.defines.DK_HAAR)));
  for (const m of aus3) m.visible = false;
  figur.hut.visible = hutAn;
  // Mütze sitzt, wo sie im Foto sitzt (Rand vorn der 3D-Mütze in Ruhe: y 1,7133)
  figur.hutHoch = 0;
  if (rm) { const y = M[9 * 3 + 1] + rm.t * (M[10 * 3 + 1] - M[9 * 3 + 1]); figur.hutHoch = Math.max(-0.005, Math.min(0.035, y - 1.7133)); }
  // Hautfarbe: die ganze Haut nimmt den Ton des Gesichts an, damit Hals und Maske zusammenpassen
  const farbe = o.farbe || farbAbgleich(fund, o.arm);
  mat.color.setRGB(0.5, 0.5, 0.5);
  if (farbe) { mat.color.setRGB(farbe.C[0] * 0.5, farbe.C[1] * 0.5, farbe.C[2] * 0.5); mat.emissive.setRGB(farbe.C[0], farbe.C[1], farbe.C[2]); if (!figur.hautFarbeUr) figur.hautFarbeUr = figur.koerperMesh.material.color.clone(); figur.koerperMesh.material.color.setRGB(farbe.T[0], farbe.T[1], farbe.T[2]); }
  if (!hutAn) { const h = haarFarbe(fund); if (h) for (const m of figur.meshes) if (m.material.defines && m.material.defines.DK_HAAR) { if (!m.userData.farbeUr) m.userData.farbeUr = m.material.color.clone(); m.material.color.setRGB(Math.min(1.1, h[0] / 0.3), Math.min(1.1, h[1] / 0.3), Math.min(1.1, h[2] / 0.3)); } }
  figur.gesichtTeile = teile; figur.gesichtAugen = aus3; figur.gesichtFarbe = farbe; figur.gesichtRand = rm;
  // Maske folgt dem Kopf wie der Hut
  if (!figur.stelleOhneMaske) {
    figur.stelleOhneMaske = figur.stelle;
    figur.stelle = function (g) {
      const b = this.stelleOhneMaske(g);
      if (this.gesichtMaske) { this.gesichtMaske.matrix.copy(this.A[this.k.index.Head]); this.gesichtMaske.matrixWorldNeedsUpdate = true; if (this.hutHoch && !this.hutFest) { this.hut.matrix.multiply(_hoch.makeTranslation(0, this.hutHoch, 0)); } }
      return b;
    };
  }
  figur.kopfNeu = () => setzeStaerke(figur, figur.kopfWert == null ? 1 : figur.kopfWert);
  setzeStaerke(figur, 1);
  return { maske, teile };
}
const _hoch = new THREE.Matrix4();
export function setzeStaerke(figur, s) {
  figur.kopfWert = s;
  if (figur.gesichtMaske) figur.gesichtMaske.material.opacity = s;
  for (const { t, Ziel } of figur.gesichtTeile || []) {
    const P = t.m.pos.array, form = figur.k.form && figur.k.form.m === t.m ? figur.k.form : null, G = figur.glattWert || 0;
    for (let q = 0; q < t.nr.length; q++) { const i = t.nr[q] * 3; for (let d = 0; d < 3; d++) P[i + d] = t.ur[q * 3 + d] + (Ziel[q * 3 + d] - t.ur[q * 3 + d]) * s + (form ? form.d[i + d] * G : 0); }
    t.m.pos.needsUpdate = true;
  }
}
export function entferne(figur) {
  if (figur.gesichtMaske) {
    setzeStaerke(figur, 0);
    figur.gruppe.remove(figur.gesichtMaske);
    figur.gesichtMaske.geometry.dispose(); figur.gesichtMaske.material.map.dispose(); figur.gesichtMaske.material.alphaMap.dispose(); figur.gesichtMaske.material.dispose();
    figur.gesichtMaske = null; figur.gesichtTeile = null; figur.kopfNeu = null;
    for (const m of figur.gesichtAugen || []) m.visible = true;
    figur.hutHoch = 0;
    if (figur.hautFarbeUr) figur.koerperMesh.material.color.copy(figur.hautFarbeUr);
    for (const m of figur.meshes) if (m.userData.farbeUr) m.material.color.copy(m.userData.farbeUr);
  }
}
