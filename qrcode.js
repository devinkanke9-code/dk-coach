// DK Coach — QR-Code lesen (26.11.2026, Stufe 2 „Scannen“, Devin: „QR auch einbauen“). Eigener Leser, keine fremde Bibliothek, kein Netz, kein Speicher, kein DOM.
// Liest QR-Codes Version 1–10 (bis etwa 270 Zeichen) aus einem Graustufenbild: drei Ecken-Quadrate suchen, Schräglage ausgleichen (Ausrichtungsmuster ab Version 2),
// Formatbits prüfen, Fehler mit Reed-Solomon korrigieren, Inhalt lesen. Danach holt produktnummer() die GTIN aus GS1-QR-Codes (GS1 Digital Link „…/01/<GTIN>“ oder GS1-Elementstring).
// Andere QR-Codes (Werbe-Links) gibt es als Text zurück; essen.js öffnet sie nie. Test: pruefe-qrcode.js (eigener Erzeuger nach der Norm, an Beispielen aus der Norm geprüft).

/* ---------- Galois-Feld GF(256), Polynom 0x11D (wie in der QR-Norm) ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const div = (a, b) => (a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0);
const potenz = (e) => EXP[((e % 255) + 255) % 255];
function auswerten(p, x) { let y = 0; for (let i = p.length - 1; i >= 0; i--) y = mul(y, x) ^ p[i]; return y; }   // p[i] = Koeffizient von x^i

// Reed-Solomon: korrigiert einen Block (Daten + Prüfbytes) an Ort und Stelle. false = zu viele Fehler.
export function rsKorrigieren(block, ecAnzahl) {
  const n = block.length, S = [];
  let fehler = false;
  for (let j = 0; j < ecAnzahl; j++) { let s = 0; for (let k = 0; k < n; k++) s = mul(s, potenz(j)) ^ block[k]; S.push(s); if (s) fehler = true; }
  if (!fehler) return true;
  // Berlekamp-Massey: Fehlerort-Polynom (kleinste Potenz zuerst)
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let r = 0; r < ecAnzahl; r++) {
    let d = S[r];
    for (let i = 1; i <= L; i++) d ^= mul(C[i] || 0, S[r - i]);
    if (d === 0) { m++; continue; }
    const f = div(d, b), T = C.slice(), neu = C.slice();
    for (let i = 0; i < B.length; i++) { while (neu.length <= i + m) neu.push(0); neu[i + m] ^= mul(f, B[i]); }
    if (2 * L <= r) { L = r + 1 - L; B = T; b = d; m = 1; } else m++;
    C = neu;
  }
  // Chien-Suche: Fehler an Potenz p, wenn C(α^-p) = 0
  const orte = [];
  for (let p = 0; p < n; p++) if (auswerten(C, potenz(-p)) === 0) orte.push(p);
  if (orte.length !== L || L * 2 > ecAnzahl) return false;
  // Forney (erste Nullstelle α^0): e = X · Ω(X^-1) / C'(X^-1)
  const omega = new Array(ecAnzahl).fill(0);
  for (let i = 0; i < ecAnzahl; i++) for (let j = 0; j < C.length && i + j < ecAnzahl; j++) omega[i + j] ^= mul(S[i], C[j]);
  const abl = []; for (let i = 1; i < C.length; i++) abl.push(i % 2 === 1 ? C[i] : 0);   // formale Ableitung in GF(2^8)
  for (const p of orte) {
    const X = potenz(p), Xi = potenz(-p), nenner = auswerten(abl, Xi);
    if (!nenner) return false;
    block[n - 1 - p] ^= mul(X, div(auswerten(omega, Xi), nenner));
  }
  for (let j = 0; j < ecAnzahl; j++) { let s = 0; for (let k = 0; k < n; k++) s = mul(s, potenz(j)) ^ block[k]; if (s) return false; }
  return true;
}

/* ---------- Tabellen der Norm (Version 1–10) ---------- */
// Je Version und Stufe L, M, Q, H: [Prüfbytes je Block, [Anzahl Blöcke, Datenbytes je Block], …]
const BLOECKE = [null,
  { L: [7, [1, 19]], M: [10, [1, 16]], Q: [13, [1, 13]], H: [17, [1, 9]] },
  { L: [10, [1, 34]], M: [16, [1, 28]], Q: [22, [1, 22]], H: [28, [1, 16]] },
  { L: [15, [1, 55]], M: [26, [1, 44]], Q: [18, [2, 17]], H: [22, [2, 13]] },
  { L: [20, [1, 80]], M: [18, [2, 32]], Q: [26, [2, 24]], H: [16, [4, 9]] },
  { L: [26, [1, 108]], M: [24, [2, 43]], Q: [18, [2, 15], [2, 16]], H: [22, [2, 11], [2, 12]] },
  { L: [18, [2, 68]], M: [16, [4, 27]], Q: [24, [4, 19]], H: [28, [4, 15]] },
  { L: [20, [2, 78]], M: [18, [4, 31]], Q: [18, [2, 14], [4, 15]], H: [26, [4, 13], [1, 14]] },
  { L: [24, [2, 97]], M: [22, [2, 38], [2, 39]], Q: [22, [4, 18], [2, 19]], H: [26, [4, 14], [2, 15]] },
  { L: [30, [2, 116]], M: [22, [3, 36], [2, 37]], Q: [20, [4, 16], [4, 17]], H: [24, [4, 12], [4, 13]] },
  { L: [18, [2, 68], [2, 69]], M: [26, [4, 43], [1, 44]], Q: [24, [6, 19], [2, 20]], H: [28, [6, 15], [2, 16]] }];
const AUSRICHTUNG = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const STUFE_BITS = { L: 1, M: 0, Q: 3, H: 2 };
const MASKEN = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0];
export const maske = (m, zeile, spalte) => MASKEN[m](zeile, spalte);
// Formatbits: 5 Datenbits (Stufe, Maske) + 10 BCH-Bits, mit 0x5412 verknüpft; Versionsbits (ab 7): 6 + 12 BCH-Bits
export function formatBits(stufe, m) {
  const daten = (STUFE_BITS[stufe] << 3) | m;
  let rest = daten; for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return ((daten << 10) | rest) ^ 0x5412;
}
export function versionBits(v) {
  let rest = v; for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  return (v << 12) | rest;
}
const ALLE_FORMATE = [];
for (const s of ['L', 'M', 'Q', 'H']) for (let m = 0; m < 8; m++) ALLE_FORMATE.push({ s, m, bits: formatBits(s, m) });
const bitsAnders = (a, b) => { let x = a ^ b, n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };

// Welche Felder gehören zu festen Mustern (Ecken, Takt, Ausrichtung, Format, Version)?
export function festeFelder(v) {
  const g = 4 * v + 17, f = [];
  for (let r = 0; r < g; r++) f.push(new Uint8Array(g));
  const setze = (r, c) => { if (r >= 0 && r < g && c >= 0 && c < g) f[r][c] = 1; };
  // Ecken mit Trennlinie und Formatfeldern: oben links 9×9, oben rechts 9 Zeilen × 8 Spalten, unten links 8 Zeilen × 9 Spalten (mit dem immer dunklen Feld)
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) setze(r, c);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) setze(r, g - 1 - c);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 9; c++) setze(g - 1 - r, c);
  for (let i = 0; i < g; i++) { setze(6, i); setze(i, 6); }   // Taktlinien
  const a = AUSRICHTUNG[v];
  for (const ar of a) for (const ac of a) {
    if ((ar === 6 && ac === 6) || (ar === 6 && ac === a[a.length - 1]) || (ar === a[a.length - 1] && ac === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setze(ar + dr, ac + dc);
  }
  if (v >= 7) for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) { setze(i, g - 11 + k); setze(g - 11 + k, i); }
  return f;
}
// Reihenfolge der Datenfelder: von unten rechts in Doppelspalten, abwechselnd hoch und runter, Spalte 6 ausgelassen
export function datenReihenfolge(v) {
  const g = 4 * v + 17, fest = festeFelder(v), aus = [];
  for (let rechts = g - 1; rechts >= 1; rechts -= 2) {
    if (rechts === 6) rechts = 5;
    for (let k = 0; k < g; k++) for (let j = 0; j < 2; j++) {
      const c = rechts - j, hoch = ((rechts + 1) & 2) === 0, r = hoch ? g - 1 - k : k;
      if (!fest[r][c]) aus.push([r, c]);
    }
  }
  return aus;
}
export function blockPlan(v, stufe) {
  const [ec, ...gruppen] = BLOECKE[v][stufe], bl = [];
  for (const [anzahl, daten] of gruppen) for (let i = 0; i < anzahl; i++) bl.push({ daten, ec });
  return bl;
}

/* ---------- Bitmatrix lesen (matrix[r][c] = 1 für dunkel) ---------- */
function formatLesen(mx) {
  const g = mx.length, a = [], b = [];
  // erste Kopie (oben links) und zweite Kopie (oben rechts + unten links), Bit i wie beim Schreiben
  for (let i = 0; i <= 5; i++) a[i] = mx[i][8];
  a[6] = mx[7][8]; a[7] = mx[8][8]; a[8] = mx[8][7];
  for (let i = 9; i < 15; i++) a[i] = mx[8][14 - i];
  for (let i = 0; i < 8; i++) b[i] = mx[8][g - 1 - i];
  for (let i = 8; i < 15; i++) b[i] = mx[g - 15 + i][8];
  let best = null;
  for (const kopie of [a, b]) {
    let x = 0; for (let i = 0; i < 15; i++) x |= (kopie[i] ? 1 : 0) << i;
    for (const f of ALLE_FORMATE) { const d = bitsAnders(x, f.bits); if (!best || d < best.d) best = { d, s: f.s, m: f.m }; }
  }
  return best && best.d <= 3 ? best : null;
}
function versionLesen(mx) {
  const g = mx.length;
  let best = null;
  for (const kopie of [0, 1]) {
    let x = 0;
    for (let i = 0; i < 18; i++) { const r = Math.floor(i / 3), c = g - 11 + (i % 3); x |= (kopie ? mx[c][r] : mx[r][c]) << i; }
    for (let v = 7; v <= 10; v++) { const d = bitsAnders(x, versionBits(v)); if (!best || d < best.d) best = { d, v }; }
  }
  return best && best.d <= 3 ? best.v : null;
}
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
function utf8(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let cp, n;
    if (b < 0x80) { cp = b; n = 1; } else if (b >= 0xc0 && b < 0xe0) { cp = b & 0x1f; n = 2; } else if (b >= 0xe0 && b < 0xf0) { cp = b & 0x0f; n = 3; } else if (b >= 0xf0 && b < 0xf8) { cp = b & 0x07; n = 4; } else { cp = b; n = 1; }
    for (let k = 1; k < n; k++) cp = (cp << 6) | ((bytes[i + k] || 0) & 0x3f);
    s += cp > 0xffff ? String.fromCharCode(0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)) : String.fromCharCode(n > 1 && cp < 0x80 ? 0xfffd : cp);
    i += n;
  }
  return s;
}
// Inhalt aus den Datenbytes: Ziffern, Alphanumerisch, Bytes; ECI wird überlesen, FNC1 merkt sich GS1
function inhaltLesen(bytes, v) {
  let pos = 0;
  const lies = (n) => { let x = 0; for (let i = 0; i < n; i++) { const byte = bytes[pos >> 3]; if (byte === undefined) return -1; x = (x << 1) | ((byte >> (7 - (pos & 7))) & 1); pos++; } return x; };
  let text = '', gs1 = false;
  const gross = v >= 10;
  while (pos + 4 <= bytes.length * 8) {
    const modus = lies(4);
    if (modus <= 0) break;
    if (modus === 1) {
      let n = lies(gross ? 12 : 10); if (n < 0) return null;
      while (n >= 3) { const x = lies(10); if (x < 0 || x > 999) return null; text += String(x).padStart(3, '0'); n -= 3; }
      if (n === 2) { const x = lies(7); if (x < 0 || x > 99) return null; text += String(x).padStart(2, '0'); } else if (n === 1) { const x = lies(4); if (x < 0 || x > 9) return null; text += x; }
    } else if (modus === 2) {
      let n = lies(gross ? 11 : 9); if (n < 0) return null;
      while (n >= 2) { const x = lies(11); if (x < 0 || x >= 45 * 45) return null; text += ALNUM[Math.floor(x / 45)] + ALNUM[x % 45]; n -= 2; }
      if (n === 1) { const x = lies(6); if (x < 0 || x >= 45) return null; text += ALNUM[x]; }
    } else if (modus === 4) {
      const n = lies(gross ? 16 : 8); if (n < 0) return null;
      const b = []; for (let i = 0; i < n; i++) { const x = lies(8); if (x < 0) return null; b.push(x); }
      text += utf8(b);
    } else if (modus === 7) {   // ECI: Zeichensatz-Angabe überlesen (1–3 Bytes)
      const e = lies(8); if (e < 0) return null; if ((e & 0x80) && !(e & 0x40)) lies(8); else if ((e & 0xc0) === 0xc0) lies(16);
    } else if (modus === 5) gs1 = true;   // FNC1 an erster Stelle: GS1-Elementstring
    else if (modus === 9) lies(8);   // FNC1 an zweiter Stelle
    else if (modus === 3) lies(16);   // mehrteiliger Code: Kopf überlesen
    else return null;   // Kanji und Unbekanntes: nicht lesbar
  }
  return { text, gs1 };
}
export function matrixLesen(mx) {
  const g = mx.length, v0 = (g - 17) / 4;
  if (!Number.isInteger(v0) || v0 < 1 || v0 > 10) return null;
  const v = v0 >= 7 ? versionLesen(mx) : v0;
  if (!v || v !== v0) return null;
  const fmt = formatLesen(mx);
  if (!fmt) return null;
  const ordnung = datenReihenfolge(v), plan = blockPlan(v, fmt.s);
  const gesamt = plan.reduce((a, b) => a + b.daten + b.ec, 0), roh = new Uint8Array(gesamt);
  for (let i = 0; i < gesamt * 8; i++) { const [r, c] = ordnung[i]; const bit = (mx[r][c] ? 1 : 0) ^ (maske(fmt.m, r, c) ? 1 : 0); roh[i >> 3] |= bit << (7 - (i & 7)); }
  // verschachtelte Blöcke trennen: erst alle Datenbytes reihum, dann alle Prüfbytes reihum
  const bloecke = plan.map((b) => ({ b, bytes: [] }));
  let k = 0;
  const maxDaten = Math.max(...plan.map((b) => b.daten));
  for (let i = 0; i < maxDaten; i++) for (const x of bloecke) if (i < x.b.daten) x.bytes.push(roh[k++]);
  for (let i = 0; i < plan[0].ec; i++) for (const x of bloecke) x.bytes.push(roh[k++]);
  const daten = [];
  for (const x of bloecke) { const blk = Uint8Array.from(x.bytes); if (!rsKorrigieren(blk, x.b.ec)) return null; for (let i = 0; i < x.b.daten; i++) daten.push(blk[i]); }
  const inhalt = inhaltLesen(daten, v);
  return inhalt ? Object.assign({ version: v, stufe: fmt.s }, inhalt) : null;
}

/* ---------- Im Bild suchen ---------- */
// Hell/dunkel: Mittel der Umgebung (Summenbild), mit kleinem Abstand, damit gleichmäßige Flächen nicht rauschen
function binaer(grau, w, h) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let zeile = 0; for (let x = 0; x < w; x++) { zeile += grau[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + zeile; } }
  let lo = 255, hi = 0;
  for (let i = 0; i < grau.length; i += 7) { if (grau[i] < lo) lo = grau[i]; if (grau[i] > hi) hi = grau[i]; }
  const r = Math.max(6, Math.round(Math.min(w, h) / 24)), abstand = Math.max(3, (hi - lo) * 0.04), bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
      bin[y * w + x] = grau[y * w + x] < s / ((x1 - x0) * (y1 - y0)) - abstand ? 1 : 0;
    }
  }
  return bin;
}
const verhaeltnisOk = (z) => {
  const t = z[0] + z[1] + z[2] + z[3] + z[4];
  if (t < 7) return false;
  const m = t / 7, v = m / 2;
  return Math.abs(m - z[0]) < v && Math.abs(m - z[1]) < v && Math.abs(3 * m - z[2]) < 3 * v && Math.abs(m - z[3]) < v && Math.abs(m - z[4]) < v;
};
// Senkrecht (dx=0, dy=1) oder waagerecht durch einen Punkt: die fünf Läufe dunkel-hell-dunkel-hell-dunkel um die Mitte
function quer(bin, w, h, cx, cy, dx, dy, maxLauf) {
  const at = (k) => { const x = Math.round(cx + dx * k), y = Math.round(cy + dy * k); return x >= 0 && y >= 0 && x < w && y < h ? bin[y * w + x] : -1; };
  if (at(0) !== 1) return null;
  const z = [0, 0, 0, 0, 0];
  let k = 0;
  while (at(k) === 1 && z[2] <= maxLauf) { z[2]++; k--; }
  while (at(k) === 0 && z[1] <= maxLauf) { z[1]++; k--; }
  while (at(k) === 1 && z[0] <= maxLauf) { z[0]++; k--; }
  k = 1;
  while (at(k) === 1 && z[2] <= maxLauf) { z[2]++; k++; }
  while (at(k) === 0 && z[3] <= maxLauf) { z[3]++; k++; }
  const ende3 = k;
  while (at(k) === 1 && z[4] <= maxLauf) { z[4]++; k++; }
  if (!z[0] || !z[1] || !z[3] || !z[4] || !verhaeltnisOk(z)) return null;
  return { mitte: ende3 - z[3] - z[2] / 2, summe: z[0] + z[1] + z[2] + z[3] + z[4] };
}
// Zeilenweise nach 1:1:3:1:1 (dunkel-hell-dunkel-hell-dunkel) suchen, dann senkrecht und noch einmal waagerecht gegenprüfen
function eckenSuchen(bin, w, h) {
  const kand = [];
  const pruefe = (z, ende, y) => {
    if (!verhaeltnisOk(z)) return;
    const t = z[0] + z[1] + z[2] + z[3] + z[4], cx0 = ende - z[4] - z[3] - z[2] / 2;
    const s = quer(bin, w, h, cx0, y, 0, 1, t);
    if (!s || s.summe > t * 2 || s.summe < t / 2) return;
    const cy = y + s.mitte, wq = quer(bin, w, h, cx0, cy, 1, 0, t);
    if (!wq) return;
    const cx = cx0 + wq.mitte, mod = (t + s.summe + wq.summe) / 21;
    const alt = kand.find((k) => Math.abs(k.x - cx) <= mod * 2 && Math.abs(k.y - cy) <= mod * 2 && Math.abs(k.m - mod) <= mod * 0.6);
    if (alt) { alt.x = (alt.x * alt.n + cx) / (alt.n + 1); alt.y = (alt.y * alt.n + cy) / (alt.n + 1); alt.m = (alt.m * alt.n + mod) / (alt.n + 1); alt.n++; }
    else kand.push({ x: cx, y: cy, m: mod, n: 1 });
  };
  for (let y = 0; y < h; y += 2) {
    const z = [0, 0, 0, 0, 0];
    let zustand = 0;
    for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) {   // dunkel
        if (zustand % 2 === 1) zustand++;
        z[zustand]++;
      } else if (zustand % 2 === 0) {   // hell nach dunkel
        if (zustand === 4) {
          pruefe(z, x, y);
          z[0] = z[2]; z[1] = z[3]; z[2] = z[4]; z[3] = 1; z[4] = 0; zustand = 3;
        } else if (z[zustand] > 0) { zustand++; z[zustand]++; }
      } else z[zustand]++;
    }
    if (zustand === 4) pruefe(z, w, y);
  }
  return kand.filter((k) => k.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8);
}
// Drei Ecken, die ein rechtwinkliges, gleichschenkliges Dreieck bilden: oben links ist der Punkt am rechten Winkel
function dreiecke(kand) {
  const aus = [];
  for (let i = 0; i < kand.length; i++) for (let j = i + 1; j < kand.length; j++) for (let k = j + 1; k < kand.length; k++) {
    const p = [kand[i], kand[j], kand[k]];
    const ms = p.map((q) => q.m), mMax = Math.max(...ms), mMin = Math.min(...ms);
    if (mMax > mMin * 1.6) continue;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const seiten = [[d(p[1], p[2]), 0], [d(p[0], p[2]), 1], [d(p[0], p[1]), 2]].sort((a, b) => b[0] - a[0]);
    const tl = p[seiten[0][1]], andere = p.filter((q) => q !== tl);
    const a1 = d(tl, andere[0]), a2 = d(tl, andere[1]);
    if (Math.abs(a1 - a2) > Math.max(a1, a2) * 0.25) continue;
    const hyp = seiten[0][0], soll = Math.hypot(a1, a2);
    if (Math.abs(hyp - soll) > soll * 0.15) continue;
    let [tr, bl] = andere;
    if ((tr.x - tl.x) * (bl.y - tl.y) - (tr.y - tl.y) * (bl.x - tl.x) < 0) [tr, bl] = [bl, tr];   // rechts oben vs. links unten
    aus.push({ tl, tr, bl, guete: Math.abs(a1 - a2) / Math.max(a1, a2) + Math.abs(hyp - soll) / soll });
  }
  return aus.sort((a, b) => a.guete - b.guete).slice(0, 3);
}
// Projektive Abbildung aus 4 Punktpaaren (Modul → Bild)
function abbildung(von, nach) {
  const A = [], bvec = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = von[i], [u, v] = nach[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bvec.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bvec.push(v);
  }
  for (let c = 0; c < 8; c++) {   // Gauß mit Pivotsuche
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]]; [bvec[c], bvec[p]] = [bvec[p], bvec[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; bvec[r] -= f * bvec[c]; }
  }
  const hh = bvec.map((x, i) => x / A[i][i]);
  return (x, y) => { const n = hh[6] * x + hh[7] * y + 1; return [(hh[0] * x + hh[1] * y + hh[2]) / n, (hh[3] * x + hh[4] * y + hh[5]) / n]; };
}
function abtasten(bin, w, h, f, g) {
  const mx = [];
  for (let r = 0; r < g; r++) {
    const zeile = new Uint8Array(g);
    for (let c = 0; c < g; c++) {
      let dunkel = 0;
      for (const [ox, oy] of [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]]) {
        const [x, y] = f(c + ox, r + oy), xi = Math.round(x), yi = Math.round(y);
        if (xi >= 0 && yi >= 0 && xi < w && yi < h && bin[yi * w + xi]) dunkel++;
      }
      zeile[c] = dunkel >= 3 ? 1 : 0;
    }
    mx.push(zeile);
  }
  return mx;
}
// Ausrichtungsmuster unten rechts suchen (ab Version 2): dunkle Mitte, heller Ring, dunkler Ring
function ausrichtungFinden(bin, w, h, f, g) {
  const soll = g - 6.5;
  let best = null;
  for (let dr = -3; dr <= 3; dr += 0.5) for (let dc = -3; dc <= 3; dc += 0.5) {
    let treffer = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ring = Math.max(Math.abs(a), Math.abs(b)), sollDunkel = ring !== 1 ? 1 : 0;
      const [x, y] = f(soll + dc + b, soll + dr + a), xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && bin[yi * w + xi] === sollDunkel) treffer++;
    }
    if (!best || treffer > best.t) best = { t: treffer, c: soll + dc, r: soll + dr };
  }
  return best && best.t >= 22 ? f(best.c, best.r) : null;
}
function versuchDreieck(bin, w, h, d) {
  const { tl, tr, bl } = d, m = (tl.m + tr.m + bl.m) / 3;
  const gSchaetz = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2 / m + 7;
  const v0 = Math.round((gSchaetz - 17) / 4);
  for (const v of [v0, v0 - 1, v0 + 1]) {
    if (v < 1 || v > 10) continue;
    const g = 4 * v + 17, br = [tr.x + bl.x - tl.x, tr.y + bl.y - tl.y];
    const affin = abbildung([[3.5, 3.5], [g - 3.5, 3.5], [3.5, g - 3.5], [g - 3.5, g - 3.5]], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], br]);
    if (!affin) continue;
    const versuche = [affin];
    if (v >= 2) {
      const ar = ausrichtungFinden(bin, w, h, affin, g);
      if (ar) { const p = abbildung([[3.5, 3.5], [g - 3.5, 3.5], [3.5, g - 3.5], [g - 6.5, g - 6.5]], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], ar]); if (p) versuche.unshift(p); }
    }
    for (const f of versuche) { const r = matrixLesen(abtasten(bin, w, h, f, g)); if (r) return r; }
  }
  return null;
}
// Graustufenbild (Werte 0–255, Länge w·h) → { text, gs1, version, stufe } oder null
export function leseGrau(grau, w, h) {
  const bin = binaer(grau, w, h), kand = eckenSuchen(bin, w, h);
  if (kand.length < 3) return null;
  for (const d of dreiecke(kand)) { const r = versuchDreieck(bin, w, h, d); if (r) return r; }
  return null;
}
export function leseRGBA(rgba, w, h) {
  const grau = new Float32Array(w * h);
  for (let i = 0, o = 0; i < grau.length; i++, o += 4) grau[i] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  return leseGrau(grau, w, h);
}

/* ---------- Produktnummer aus dem Inhalt ---------- */
const pruef = (z) => { let s = 0; for (let i = 0; i < z.length - 1; i++) s += +z[z.length - 2 - i] * (i % 2 === 0 ? 3 : 1); return (10 - (s % 10)) % 10 === +z[z.length - 1]; };
function kurz(gtin) {   // GTIN-14 mit führenden Nullen → 13 oder 8 Stellen, wie sie in Lebensmittel-Datenbanken stehen
  let z = gtin;
  if (z.length === 14 && z[0] === '0') z = z.slice(1);
  if (z.length === 13 && z.slice(0, 5) === '00000') z = z.slice(5);   // GTIN-8 in 13 Stellen
  return z;
}
// GS1 Digital Link (…/01/<GTIN>…), GS1-Elementstring (01<GTIN-14>, auch „(01)…“) oder nur Ziffern. Sonst null.
export function produktnummer(inhalt) {
  if (!inhalt || typeof inhalt.text !== 'string') return null;
  const t = inhalt.text.trim();
  let z = null;
  const link = /^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?\/01\/(\d{8}|\d{12,14})(?=$|[/?#])/i.exec(t);
  if (link) z = link[1];
  else if (inhalt.gs1 && /^01\d{14}/.test(t)) z = t.slice(2, 16);
  else if (/^\(01\)\d{14}/.test(t)) z = t.slice(4, 18);
  else if (/^(\d{8}|\d{12,14})$/.test(t)) z = t;
  if (!z || !pruef(z)) return null;
  return kurz(z);
}
