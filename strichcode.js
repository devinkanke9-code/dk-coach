// DK Coach — Strichcode lesen (26.11.2026, Stufe 2a von „Essen“, Devin: „Barcode-Scan bauen“).
// Liest EAN-13, UPC-A (als EAN-13 mit führender 0) und EAN-8 aus Helligkeitswerten eines Kamerabilds. Keine fremde Bibliothek, kein Netz, kein Speicher, kein DOM:
// Die Seite (essen.js) gibt Bildzeilen hinein und bekommt Ziffern zurück. Safari am iPhone hat keinen eingebauten BarcodeDetector, darum dieser Leser.
// Sicher gegen Falschlesen: Schutzzonen und Begrenzungszeichen müssen passen, jede Ziffer muss klar zu einem Muster passen, die Prüfziffer muss stimmen,
// und essen.js nimmt einen Code erst, wenn er zweimal gelesen wurde. Test: pruefe-strichcode.js (künstliche Strichcodes mit Unschärfe und Rauschen, Zufallszeilen).

// Breiten der vier Striche je Ziffer in Modulen (L-Code: Lücke, Strich, Lücke, Strich; R-Code dieselben Breiten mit Strich zuerst; G-Code rückwärts)
const L = [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]];
const G = L.map((p) => p.slice().reverse());
const PARITAET = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLG', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const FEHLER_MAX = 1.5;   // Summe der Abweichungen in Modulen, bis zu der eine Ziffer noch zählt
const ABSTAND_MIN = 0.3;   // so viel besser als das zweitbeste Muster muss das beste sein

/* ---------- Prüfziffer (GTIN) ---------- */
export function pruefziffer(ohne) {   // ohne = Ziffern ohne die letzte
  let s = 0;
  for (let i = 0; i < ohne.length; i++) s += +ohne[ohne.length - 1 - i] * (i % 2 === 0 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}
export function gtinOk(code) {
  return typeof code === 'string' && /^(\d{8}|\d{12}|\d{13})$/.test(code) && pruefziffer(code.slice(0, -1)) === +code[code.length - 1];
}

/* ---------- Muster zum Testen: EAN-13 und EAN-8 als Folge von Modulen (1 = Strich) ---------- */
const bits = (breiten, strichZuerst) => { const b = []; breiten.forEach((w, i) => { for (let k = 0; k < w; k++) b.push((i % 2 === 0) === strichZuerst ? 1 : 0); }); return b; };
export function muster(code) {
  if (!gtinOk(code) || code.length === 12) return null;
  const d = code.split('').map(Number), b = [1, 0, 1];
  if (code.length === 13) {
    const par = PARITAET[d[0]];
    for (let i = 1; i <= 6; i++) b.push(...bits(par[i - 1] === 'L' ? L[d[i]] : G[d[i]], false));
    b.push(0, 1, 0, 1, 0);
    for (let i = 7; i <= 12; i++) b.push(...bits(L[d[i]], true));
  } else {
    for (let i = 0; i < 4; i++) b.push(...bits(L[d[i]], false));
    b.push(0, 1, 0, 1, 0);
    for (let i = 4; i < 8; i++) b.push(...bits(L[d[i]], true));
  }
  b.push(1, 0, 1);
  return b;
}

/* ---------- Eine Zeile: hell/dunkel trennen, dann Strichbreiten ---------- */
function laeufe(zeile) {
  const n = zeile.length;
  if (n < 60) return null;
  // leicht glätten
  const g = new Float32Array(n);
  for (let x = 0; x < n; x++) g[x] = (zeile[Math.max(0, x - 1)] + 2 * zeile[x] + zeile[Math.min(n - 1, x + 1)]) / 4;
  // Hell und dunkel aus den Rändern der Verteilung (5 % und 95 %), damit einzelne Ausreißer nichts verschieben
  const sortiert = Array.from(g).sort((a, b) => a - b), dunkel = sortiert[Math.floor(n * 0.05)], hell = sortiert[Math.floor(n * 0.95)], spanne = hell - dunkel;
  if (spanne < 24) return null;   // zu wenig Kontrast: kein Strichcode
  // Schwelle: Mitte zwischen dem hellsten und dunkelsten Wert der Umgebung (so stören Licht von der Seite und viele helle Flächen nicht).
  // Ist die Umgebung fast einfarbig (Schutzzone, Rand), gilt die Mitte der ganzen Zeile, damit Rauschen dort nicht flackert.
  // (Erst war es das Mittel der Umgebung: Bei Licht von der Seite zog die helle Schutzzone die Schwelle hoch, Übergangspixel wurden dunkel und Striche zu breit.)
  const r = Math.max(6, Math.round(n / 16)), mitteAlle = (dunkel + hell) / 2;
  const w = [];
  let dunkelNow = null, lauf = 0, erstesDunkel = false;
  for (let x = 0; x < n; x++) {
    let lo = 255, hi = 0;
    for (let k = Math.max(0, x - r), e = Math.min(n - 1, x + r); k <= e; k++) { const v = g[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const schwelle = hi - lo >= spanne * 0.5 ? (lo + hi) / 2 : mitteAlle;
    const d = g[x] < schwelle;
    if (dunkelNow === null) { dunkelNow = d; erstesDunkel = d; lauf = 1; } else if (d === dunkelNow) lauf++; else { w.push(lauf); dunkelNow = d; lauf = 1; }
  }
  w.push(lauf);
  return { w, erstesDunkel };
}

// Ziffer aus 4 Breiten: bestes Muster aus den erlaubten Tabellen, mit klarem Abstand zum zweitbesten
function ziffer(ws, tabellen) {
  const s = ws[0] + ws[1] + ws[2] + ws[3], n = ws.map((x) => x * 7 / s);
  let best = null, zweit = Infinity;
  for (const [art, tab] of tabellen) for (let d = 0; d < 10; d++) {
    const p = tab[d], f = Math.abs(n[0] - p[0]) + Math.abs(n[1] - p[1]) + Math.abs(n[2] - p[2]) + Math.abs(n[3] - p[3]);
    if (!best || f < best.f) { if (best) zweit = Math.min(zweit, best.f); best = { d, art, f }; } else if (f < zweit) zweit = f;
  }
  return best && best.f <= FEHLER_MAX && zweit - best.f >= ABSTAND_MIN ? best : null;
}
const nah = (wert, soll, modul, spiel) => wert >= soll * modul * (1 - spiel) && wert <= soll * modul * (1 + spiel);

function versuche(w, i, art) {
  const laenge = art === 13 ? 59 : 43, module = art === 13 ? 95 : 67, halb = art === 13 ? 6 : 4;
  if (i + laenge > w.length) return null;
  let T = 0;
  for (let k = 0; k < laenge; k++) T += w[i + k];
  const m = T / module;
  if (m < 0.9) return null;   // weniger als knapp 1 Pixel je Modul: nicht lesbar
  if (i > 0 && w[i - 1] < 5 * m) return null;   // Schutzzone links (hell)
  if (i + laenge < w.length && w[i + laenge] < 4 * m) return null;   // Schutzzone rechts, wenn sichtbar
  if (!nah(w[i] + w[i + 1] + w[i + 2], 3, m, 0.45)) return null;   // Anfang 1:1:1
  const mitte = i + 3 + 4 * halb;
  if (!nah(w[mitte] + w[mitte + 1] + w[mitte + 2] + w[mitte + 3] + w[mitte + 4], 5, m, 0.45)) return null;   // Mitte 1:1:1:1:1
  if (!nah(w[i + laenge - 3] + w[i + laenge - 2] + w[i + laenge - 1], 3, m, 0.45)) return null;   // Ende 1:1:1
  const links = [], rechts = [];
  for (let k = 0; k < halb; k++) {
    const a = i + 3 + 4 * k, ws = [w[a], w[a + 1], w[a + 2], w[a + 3]];
    if (!nah(ws[0] + ws[1] + ws[2] + ws[3], 7, m, 0.4)) return null;
    const z = ziffer(ws, art === 13 ? [['L', L], ['G', G]] : [['L', L]]);
    if (!z) return null;
    links.push(z);
  }
  for (let k = 0; k < halb; k++) {
    const a = mitte + 5 + 4 * k, ws = [w[a], w[a + 1], w[a + 2], w[a + 3]];
    if (!nah(ws[0] + ws[1] + ws[2] + ws[3], 7, m, 0.4)) return null;
    const z = ziffer(ws, [['R', L]]);
    if (!z) return null;
    rechts.push(z);
  }
  let code;
  if (art === 13) {
    const erste = PARITAET.indexOf(links.map((z) => z.art).join(''));
    if (erste < 0) return null;
    code = erste + links.map((z) => z.d).join('') + rechts.map((z) => z.d).join('');
  } else code = links.map((z) => z.d).join('') + rechts.map((z) => z.d).join('');
  return gtinOk(code) ? code : null;
}

function leseLaeufe(l) {
  if (!l) return null;
  const { w, erstesDunkel } = l;
  for (let i = erstesDunkel ? 0 : 1; i < w.length; i += 2) {   // i zeigt immer auf einen dunklen Strich
    const c = versuche(w, i, 13) || versuche(w, i, 8);
    if (c) return c;
  }
  return null;
}
// Eine Zeile in beide Richtungen (Strichcode kann auf dem Kopf stehen)
function einmal(zeile) {
  const vor = leseLaeufe(laeufe(zeile));
  if (vor) return vor;
  return leseLaeufe(laeufe(Array.from(zeile).reverse()));
}
// Klappt es nicht, noch einmal doppelt so fein (zwischen zwei Pixeln gemittelt): Dünne Striche von 1–2 Pixeln werden dann sauberer getrennt
export function leseZeile(zeile) {
  const c = einmal(zeile);
  if (c || zeile.length > 1600) return c;
  const fein = new Float32Array(zeile.length * 2 - 1);
  for (let x = 0; x < zeile.length; x++) { fein[2 * x] = zeile[x]; if (x + 1 < zeile.length) fein[2 * x + 1] = (zeile[x] + zeile[x + 1]) / 2; }
  return einmal(fein);
}

// Ein Bildausschnitt (RGBA wie aus getImageData): mehrere waagerechte Zeilen, Ergebnis { code: Anzahl }
export function leseBild(rgba, breite, hoehe, zeilen) {
  const treffer = {}, anzahl = Math.max(1, zeilen || 9), zeile = new Float32Array(breite);
  for (let r = 0; r < anzahl; r++) {
    const y = Math.min(hoehe - 1, Math.round((r + 0.5) * hoehe / anzahl));
    for (let x = 0; x < breite; x++) { const o = (y * breite + x) * 4; zeile[x] = 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]; }
    const c = leseZeile(zeile);
    if (c) treffer[c] = (treffer[c] || 0) + 1;
  }
  return treffer;
}
