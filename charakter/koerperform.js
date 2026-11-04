// DK Coach — Körper aus dem Foto (Devin, 2.11.: „die Proportion von der Muskelmasse komplett nicht bestanden“). Die Figur ist als Bodybuilder modelliert: Breiten allein machen daraus
// nur einen kleinen Bodybuilder. Glätten nimmt das Relief aus Netz, Normalen und Hautfarbe (Taubin-Filter: kleine Formen unter rund 10 cm verschwinden, der Umfang bleibt).
// glatt = 0 ist die Figur wie modelliert, 1 ein Körper ohne sichtbare Muskelzeichnung.
// Körperfett (Devin, 3.11.: „ohne T-Shirt … nur mit Bauchmuskeln … bestimmte Körperfettanteile“): Je Punkt steht fest, ab wie viel Prozent seine Zeichnung verschwindet (am unteren Bauch zuerst, an Armen und Waden zuletzt), und zwei Fettschichten legen sich darüber:
// eine frühe (Hüfte, unterer Bauch, wenig überall), eine späte (Bauch vorn, Brust, Hals). Das rechnet der Shader aus vier Zahlen (uForm), darum läuft ein Regler flüssig, und position bleibt die Ruhelage: Kleidungsmasken hängen daran
import * as THREE from 'three';

const FREI = ['Root', 'Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'Neck', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];

const glatt = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const G1 = (v, m, b) => Math.exp(-(((v - m) / b) ** 2));
const tabelle = (T, y) => { if (y <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (y <= T[i][0]) { const u = (y - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * u * u * (3 - 2 * u); } return T[T.length - 1][1]; };
// Ab wie viel Prozent Körperfett verschwindet die Zeichnung an dieser Stelle (Hälfte weg, ± 7 Punkte)? Beim Mann zuerst am unteren Bauch und an den Flanken, zuletzt an Unterarmen und Waden
const T_VORN = [[1.08, 11.5], [1.16, 13.5], [1.26, 15.5], [1.34, 17.5], [1.44, 21], [1.56, 25]], T_HINTEN = [[1.1, 12.5], [1.22, 14.5], [1.32, 18], [1.44, 21], [1.56, 25]];
function schwelleVon(x, y, z) {
  const ax = Math.abs(x), arm = glatt(0.215, 0.29, ax) * glatt(1.25, 1.33, y), bein = 1 - glatt(0.86, 0.96, y), vorn = glatt(-0.05, 0.05, z);
  let t = tabelle(T_HINTEN, y) + (tabelle(T_VORN, y) - tabelle(T_HINTEN, y)) * vorn;
  t -= 2.5 * glatt(0.09, 0.14, ax) * (1 - glatt(1.22, 1.34, y));
  const tArm = 24 + 6 * glatt(0.42, 0.56, ax), tBein = 19 + 11 * (1 - glatt(0.46, 0.66, y));
  t += (tArm - t) * arm; t += (tBein - t) * bein;
  return t;
}
// Oberkante der Hose in der Ruhelage (wie dkBundOben in kleidung.js): vorn unter dem Nabel, an den Seiten über dem Hüftknochen, hinten etwas höher
const bundOben = (ax, z) => { const v = glatt(-0.07, 0.05, z); return 1.088 + (1.04 + 0.62 * ax * ax - 1.088) * v; };
// Dicke der beiden Fettschichten in Metern. s: Anteil, um den die Masse nach unten hängt. Rumpf als Winkel um die Körperachse (0° vorn, 90° Seite, 180° hinten).
// Bei 40 % Körperfett (108 kg) soll vorn am Bauch rund 8 cm dazukommen, an der Seite 5, hinten 3, an der Brust 3, am Oberarm 1,7, am Oberschenkel 2,6: Fett liegt überall, am meisten am Bauch
function fettFeld(x, y, z, aus) {
  const ax = Math.abs(x);
  let f1 = 0, f2 = 0, s2 = 0;
  const rumpf = (1 - glatt(0.205, 0.27, ax)) * glatt(0.86, 0.95, y) * (1 - glatt(1.48, 1.56, y));
  if (rumpf > 0) {
    const th = Math.atan2(ax / 0.15, (z + 0.005) / 0.11) * 180 / Math.PI, top = bundOben(ax, z), m = glatt(top - 0.05, top + 0.06, y), m2 = glatt(top - 0.11, top + 0.05, y), mS = glatt(top - 0.07, top + 0.07, y);
    const hg = (m, o, u) => G1(y, m, y > m ? o : u), yB = hg(1.115, 0.2, 0.1), yS = hg(1.11, 0.2, 0.09), yH = hg(1.17, 0.11, 0.1);
    const bauch1 = 0.026 * G1(th, 0, 68) * yB, griff1 = 0.027 * G1(th, 98, 44) * yS, kreuz1 = 0.021 * G1(th, 165, 44) * yH;
    const bauch2 = 0.036 * G1(th, 0, 66) * yB, griff2 = 0.012 * G1(th, 95, 50) * yS, kreuz2 = 0.016 * G1(th, 165, 50) * yH;
    const brustQ = G1(ax, 0.1, 0.085) * glatt(-0.03, 0.06, z), brust1 = 0.012 * brustQ * hg(1.385, 0.08, 0.045), brust2 = 0.02 * brustQ * hg(1.37, 0.09, 0.052);
    const seite = G1(th, 100, 34), oben = G1(th, 180, 70) * G1(y, 1.39, 0.11);
    const rund = G1(y, 1.2, 0.26);   // dünne Schicht über den ganzen Rumpf, damit nichts absetzt
    const huefte = G1(y, 0.995, 0.085);
    f1 += rumpf * (bauch1 * m + griff1 * mS + kreuz1 * mS + brust1 + 0.007 * seite * G1(y, 1.3, 0.07) + 0.006 * oben + 0.004 * rund + 0.009 * huefte);
    f2 += rumpf * (bauch2 * m2 + griff2 * mS + kreuz2 * mS + brust2 + 0.008 * seite * G1(y, 1.31, 0.08) + 0.009 * oben + 0.006 * rund + 0.016 * huefte);
    s2 = rumpf * (bauch2 * m2 * 0.2 + brust2 * 0.28);
  }
  // Gesäß, Oberschenkel, Wade
  if (y < 1.08) {
    const g = G1(ax, 0.09, 0.09) * G1(y, 0.97, 0.08) * glatt(-0.03, -0.07, z);
    f1 += 0.011 * g; f2 += 0.014 * g;
    const innen = 0.5 + 0.5 * glatt(0.02, 0.08, ax), aussen = 1 - 0.35 * glatt(0.13, 0.19, ax), ob = G1(y, 0.79, 0.17) * innen * aussen, wa = G1(y, 0.38, 0.12);
    if (ax < 0.26) { f1 += 0.009 * ob + 0.003 * wa; f2 += 0.011 * ob + 0.008 * wa + 0.003 * G1(y, 0.2, 0.08); }
  }
  // Arme (Ruhelage waagrecht, Achse etwa y 1,44, z −0,08): hinten und unten mehr
  if (ax > 0.2 && y > 1.28) {
    const u = glatt(0.215, 0.29, ax), unten = 0.72 + 0.28 * glatt(1.46, 1.38, y) + 0.2 * glatt(-0.06, -0.12, z), ob = G1(ax, 0.345, 0.115), un = G1(ax, 0.56, 0.1), sch = G1(ax, 0.265, 0.045);
    f1 += u * (0.006 * ob * unten + 0.003 * un) + 0.0025 * sch; f2 += u * (0.007 * ob * unten + 0.0055 * un) + 0.004 * sch;
  }
  // Hals, unter dem Kinn, Kiefer und Wangen: nur wenig, sonst wird es ein Kragen
  if (y > 1.46 && y < 1.68 && ax < 0.13) {
    const h = G1(y, 1.54, 0.05) * (1 - glatt(0.085, 0.13, ax)), ki = G1(y, 1.602, 0.022) * G1(z, 0.05, 0.045) * G1(ax, 0, 0.055), wa = G1(y, 1.633, 0.024) * G1(ax, 0.058, 0.03) * glatt(0.01, 0.05, z);
    f1 += 0.004 * h + 0.002 * ki; f2 += 0.007 * h + 0.0055 * ki + 0.0035 * wa;
  }
  aus[0] = f1; aus[1] = f2; aus[2] = s2;
}
// Rumpf ganz glatt: Das Netz ist seit der Verfeinerung so dicht, dass der Taubin-Filter die großen Formen des Bodybuilders stehen lässt (Rippenbogen, Wulst unten am Bauch, Rand des breiten Rückenmuskels). Bei hohem Körperfett sah man sie als harte Kanten. Darum zusätzlich: Abstand zur Körperachse je Höhe und Richtung in einem Raster mitteln, verwischen und die Punkte dorthin schieben
function rumpfGlatt(Q, nw) {
  const DY = 0.015, Y0 = 0.9, NY = Math.ceil((1.52 - Y0) / DY) + 1, NW = 48, S = Array.from({ length: NY }, () => new Float64Array(NW)), C = Array.from({ length: NY }, () => new Float64Array(NW)), wi = (x, z) => ((Math.atan2(x, z + 0.005) + Math.PI) / (2 * Math.PI) * NW) % NW;
  for (let v = 0; v < nw; v++) {
    const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2];
    if (Math.abs(x) > 0.21 || y < Y0 || y > 1.52) continue;
    const yi = Math.round((y - Y0) / DY), w = Math.floor(wi(x, z));
    S[yi][w] += Math.hypot(x, z + 0.005); C[yi][w]++;
  }
  let R = S.map((Z, y) => Z.map((s, w) => (C[y][w] ? s / C[y][w] : 0)));
  for (let p = 0; p < 6; p++) for (let y = 0; y < NY; y++) for (let w = 0; w < NW; w++) if (!R[y][w]) { let s = 0, c = 0; for (const [a, b] of [[y, w + 1], [y, w - 1], [y + 1, w], [y - 1, w]]) { if (a < 0 || a >= NY) continue; const q = R[a][(b + NW) % NW]; if (q) { s += q; c++; } } if (c) R[y][w] = s / c; }
  const stufe = (A, wy, ww) => { const B = A.map((Z) => Float64Array.from(Z)); for (let y = 0; y < NY; y++) for (let w = 0; w < NW; w++) { B[y][w] = wy ? (A[Math.max(0, y - 1)][w] + 2 * A[y][w] + A[Math.min(NY - 1, y + 1)][w]) / 4 : (A[y][(w + NW - 1) % NW] + 2 * A[y][w] + A[y][(w + 1) % NW]) / 4; } return B; };
  for (let p = 0; p < 14; p++) R = stufe(R, true);
  for (let p = 0; p < 10; p++) R = stufe(R, false);
  for (let v = 0; v < nw; v++) {
    const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2], ax = Math.abs(x);
    if (ax > 0.215 || y < 0.94 || y > 1.5) continue;
    const m = (1 - glatt(0.165, 0.215, ax)) * glatt(0.94, 1.0, y) * (1 - glatt(1.4, 1.5, y));
    if (m <= 0) continue;
    const r = Math.hypot(x, z + 0.005), fy = Math.min(NY - 1.001, (y - Y0) / DY), iy = Math.floor(fy), ty = fy - iy, fw = (wi(x, z) - 0.5 + NW) % NW, iw = Math.floor(fw), tw = fw - iw, iw2 = (iw + 1) % NW;
    const h = (R[iy][iw] * (1 - tw) + R[iy][iw2] * tw) * (1 - ty) + (R[iy + 1][iw] * (1 - tw) + R[iy + 1][iw2] * tw) * ty;
    const q = (r + (h - r) * m) / Math.max(1e-4, r);
    Q[v * 3] = x * q; Q[v * 3 + 2] = (z + 0.005) * q - 0.005;
  }
}
// Dasselbe für Arme (waagrecht in der Ruhelage) und Unterschenkel: Wer viel Fett oder wenig Muskeln hat, hat keine Muskelbäuche. Achse: Punkt (u, v) je Länge l; m(l): wie stark hier
function gliedGlatt(Q, nw, wahl, achse, L0, L1, m) {
  const DL = 0.012, NL = Math.ceil((L1 - L0) / DL) + 1, NW = 24, S = Array.from({ length: NL }, () => new Float64Array(NW)), C = Array.from({ length: NL }, () => new Float64Array(NW)), q = [0, 0, 0], wi = (a, b) => ((Math.atan2(a, b) + Math.PI) / (2 * Math.PI) * NW) % NW;
  for (let v = 0; v < nw; v++) {
    if (!wahl(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2], q)) continue;
    const [l, a, b] = q; if (l < L0 || l > L1) continue;
    const il = Math.round((l - L0) / DL), w = Math.floor(wi(a, b)); S[il][w] += Math.hypot(a, b); C[il][w]++;
  }
  let R = S.map((Z, y) => Z.map((s, w) => (C[y][w] ? s / C[y][w] : 0)));
  for (let p = 0; p < 6; p++) for (let y = 0; y < NL; y++) for (let w = 0; w < NW; w++) if (!R[y][w]) { let s = 0, c = 0; for (const [a, b] of [[y, w + 1], [y, w - 1], [y + 1, w], [y - 1, w]]) { if (a < 0 || a >= NL) continue; const r = R[a][(b + NW) % NW]; if (r) { s += r; c++; } } if (c) R[y][w] = s / c; }
  const stufe = (Z, inL) => { const B = Z.map((x) => Float64Array.from(x)); for (let y = 0; y < NL; y++) for (let w = 0; w < NW; w++) B[y][w] = inL ? (Z[Math.max(0, y - 1)][w] + 2 * Z[y][w] + Z[Math.min(NL - 1, y + 1)][w]) / 4 : (Z[y][(w + NW - 1) % NW] + 2 * Z[y][w] + Z[y][(w + 1) % NW]) / 4; return B; };
  for (let p = 0; p < 18; p++) R = stufe(R, true);
  for (let p = 0; p < 5; p++) R = stufe(R, false);
  for (let v = 0; v < nw; v++) {
    if (!wahl(Q[v * 3], Q[v * 3 + 1], Q[v * 3 + 2], q)) continue;
    const [l, a, b] = q; if (l < L0 || l > L1) continue;
    const st = m(l); if (st <= 0) continue;
    const r = Math.hypot(a, b) || 1e-4, fl = Math.min(NL - 1.001, (l - L0) / DL), il = Math.floor(fl), tl = fl - il, fw = (wi(a, b) - 0.5 + NW) % NW, iw = Math.floor(fw), tw = fw - iw, iw2 = (iw + 1) % NW;
    const h = (R[il][iw] * (1 - tw) + R[il][iw2] * tw) * (1 - tl) + (R[il + 1][iw] * (1 - tw) + R[il + 1][iw2] * tw) * tl, k = (r + (h - r) * st) / r;
    achse(Q, v, a * k, b * k);
  }
}
// Mulden im Rumpf (Taille, Kreuz, unter Brust und Schulterblatt, seitlich neben dem Bauch): Abstand zu einer Hülle, die von den weitesten Stellen aus schräg abfällt. Fett füllt sie zuerst, sonst bleibt die Form des Bodybuilders unter dem Fett sichtbar
function mulden(Q, nw) {
  const DY = 0.015, Y0 = 0.96, NY = Math.ceil((1.52 - Y0) / DY) + 1, NW = 36, R = Array.from({ length: NY }, () => new Float64Array(NW)), wi = (x, z) => ((Math.atan2(x, z + 0.005) + Math.PI) / (2 * Math.PI) * NW) % NW, E = new Float64Array(nw), K = 0.22 * DY;
  for (let v = 0; v < nw; v++) {
    const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2];
    if (Math.abs(x) > 0.215 || y < Y0 || y > 1.52) continue;
    const yi = Math.round((y - Y0) / DY), w = Math.floor(wi(x, z)), r = Math.hypot(x, z + 0.005);
    if (r > R[yi][w]) R[yi][w] = r;
  }
  for (const Z of R) for (let w = 0; w < NW; w++) if (!Z[w]) Z[w] = Math.max(Z[(w + 1) % NW], Z[(w + NW - 1) % NW]);
  const H = R.map((Z) => Float64Array.from(Z));
  for (let y = 1; y < NY; y++) for (let w = 0; w < NW; w++) H[y][w] = Math.max(H[y][w], H[y - 1][w] - K);
  for (let y = NY - 2; y >= 0; y--) for (let w = 0; w < NW; w++) H[y][w] = Math.max(H[y][w], H[y + 1][w] - K);
  for (let p = 0; p < 2; p++) { const A = H.map((Z) => Float64Array.from(Z)); for (let y = 0; y < NY; y++) for (let w = 0; w < NW; w++) { const um = (q) => A[q][(w + NW - 1) % NW] + 2 * A[q][w] + A[q][(w + 1) % NW]; H[y][w] = (um(Math.max(0, y - 1)) + 2 * um(y) + um(Math.min(NY - 1, y + 1))) / 16; } }
  for (let v = 0; v < nw; v++) {
    const x = Q[v * 3], y = Q[v * 3 + 1], z = Q[v * 3 + 2];
    if (Math.abs(x) > 0.25 || y < Y0 || y > 1.5) continue;
    const fy = Math.min(NY - 1.001, (y - Y0) / DY), iy = Math.floor(fy), ty = fy - iy, fw = (wi(x, z) - 0.5 + NW) % NW, iw = Math.floor(fw), tw = fw - iw, iw2 = (iw + 1) % NW;
    const h = (H[iy][iw] * (1 - tw) + H[iy][iw2] * tw) * (1 - ty) + (H[iy + 1][iw] * (1 - tw) + H[iy + 1][iw2] * tw) * ty;
    E[v] = Math.max(0, h - Math.hypot(x, z + 0.005)) * (1 - glatt(0.2, 0.25, Math.abs(x))) * glatt(1.0, 1.06, y) * (1 - glatt(1.42, 1.5, y));
  }
  return E;
}
function rechne(k) {
  const m = k.meshes.find((x) => x.mat === 'haut'), n0 = m.pos.count, ix = m.idx.array, T = ix.length / 3, P = new Float32Array(m.pos.array);
  const kp = k.kopfPunkte && k.kopfPunkte.find((t) => t.m === m);
  if (kp) for (let q = 0; q < kp.nr.length; q++) for (let d = 0; d < 3; d++) P[kp.nr[q] * 3 + d] = kp.ur[q * 3 + d];
  const id = new Int32Array(n0), lage = new Map(); let nw = 0;
  for (let i = 0; i < n0; i++) {
    const s = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5);
    let w = lage.get(s); if (w === undefined) lage.set(s, (w = nw++)); id[i] = w;
  }
  const W = new Float64Array(nw * 3), frei = new Float64Array(nw).fill(1), erlaubt = new Set(FREI.map((b) => k.index[b]));
  for (let i = 0; i < n0; i++) {
    for (let c = 0; c < 3; c++) W[id[i] * 3 + c] = P[i * 3 + c];
    let g = 0; for (let j = 0; j < 4; j++) if (erlaubt.has(m.gel.getComponent(i, j))) g += m.gew.getComponent(i, j);
    frei[id[i]] = Math.min(frei[id[i]], g);
  }
  // Nachbarn (kompakt)
  const paare = new Set(); for (let t = 0; t < T; t++) for (let e = 0; e < 3; e++) { const a = id[ix[t * 3 + e]], b = id[ix[t * 3 + (e + 1) % 3]]; if (a !== b) paare.add(a < b ? a * nw + b : b * nw + a); }
  const grad = new Int32Array(nw + 1); for (const s of paare) { grad[Math.floor(s / nw) + 1]++; grad[s % nw + 1]++; }
  for (let i = 0; i < nw; i++) grad[i + 1] += grad[i];
  const nb = new Int32Array(grad[nw]), f = grad.slice(); for (const s of paare) { const a = Math.floor(s / nw), b = s % nw; nb[f[a]++] = b; nb[f[b]++] = a; }
  const schritt = (Q, l) => {
    const R = new Float64Array(nw * 3);
    for (let v = 0; v < nw; v++) {
      const a = grad[v], e = grad[v + 1], z = e - a || 1; let x = 0, y = 0, zz = 0;
      for (let q = a; q < e; q++) { const u = nb[q] * 3; x += Q[u]; y += Q[u + 1]; zz += Q[u + 2]; }
      const w = l * frei[v];
      R[v * 3] = Q[v * 3] + w * (x / z - Q[v * 3]); R[v * 3 + 1] = Q[v * 3 + 1] + w * (y / z - Q[v * 3 + 1]); R[v * 3 + 2] = Q[v * 3 + 2] + w * (zz / z - Q[v * 3 + 2]);
    }
    return R;
  };
  let Q = W;
  for (let it = 0; it < 70; it++) { Q = schritt(Q, 0.5); Q = schritt(Q, -0.53); }
  rumpfGlatt(Q, nw);
  // Arme: Länge ist |x|, Achse bei y 1,44, z −0,08. Unterschenkel: Länge ist y, Achse je Bein bei |x| 0,118, z −0,045
  for (const sg of [1, -1]) {
    gliedGlatt(Q, nw, (x, y, z, q) => { if (x * sg < 0.2 || y < 1.28 || y > 1.62) return false; q[0] = x * sg; q[1] = y - 1.44; q[2] = z + 0.08; return true; }, (P2, v, a, b) => { P2[v * 3 + 1] = 1.44 + a; P2[v * 3 + 2] = b - 0.08; }, 0.2, 0.74, (l) => glatt(0.27, 0.34, l) * (1 - glatt(0.66, 0.72, l)));
    gliedGlatt(Q, nw, (x, y, z, q) => { if (x * sg < 0.02 || x * sg > 0.26 || y > 0.72 || y < 0.2) return false; q[0] = y; q[1] = x * sg - 0.118; q[2] = z + 0.045; return true; }, (P2, v, a, b) => { P2[v * 3] = sg * (0.118 + a); P2[v * 3 + 2] = b - 0.045; }, 0.2, 0.72, (l) => glatt(0.24, 0.3, l) * (1 - glatt(0.62, 0.7, l)));
  }
  // Versatz und neue Normalen je Punkt
  const NW = new Float64Array(nw * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3(), g = new THREE.Vector3();
  for (let t = 0; t < T; t++) {
    const i0 = id[ix[t * 3]], i1 = id[ix[t * 3 + 1]], i2 = id[ix[t * 3 + 2]];
    a.fromArray(Q, i0 * 3); b.fromArray(Q, i1 * 3); c.fromArray(Q, i2 * 3);
    g.copy(b).sub(a).cross(q.copy(c).sub(a));
    for (const v of [i0, i1, i2]) { NW[v * 3] += g.x; NW[v * 3 + 1] += g.y; NW[v * 3 + 2] += g.z; }
  }
  const d = new Float32Array(n0 * 3), ng = new Float32Array(n0 * 3);
  for (let i = 0; i < n0; i++) {
    const v = id[i] * 3, l = Math.hypot(NW[v], NW[v + 1], NW[v + 2]) || 1;
    for (let z = 0; z < 3; z++) { d[i * 3 + z] = Q[v + z] - W[v + z]; ng[i * 3 + z] = NW[v + z] / l; }
    // Schritt: Die Hose liegt vorn flach, sie zeichnet die Form des Modells nicht nach
    const x = Q[v], y = Q[v + 1], zz = Q[v + 2], ax = Math.abs(x);
    if (ax < 0.13 && y > 0.8 && y < 1.03 && zz > 0) { const ziel = 0.05 + (y - 0.9) * 0.36, w = (1 - glatt(0.065, 0.13, ax)) * glatt(0.8, 0.85, y) * (1 - glatt(0.99, 1.03, y)); if (zz > ziel) d[i * 3 + 2] -= (zz - ziel) * w; }
  }
  const form = { m, ur: new Float32Array(P), nUr: m.nor.array.slice(), nq: m.nor.normalized ? 127 : 1, d, ng, frei: new Float32Array(n0), stoff: [] };
  for (let i = 0; i < n0; i++) form.frei[i] = frei[id[i]];
  // Fettschichten je verschweißtem Punkt, entlang der geglätteten Normale; die Normalen der Schicht aus den Flächen
  const FD = [new Float64Array(nw * 3), new Float64Array(nw * 3)], faus = [0, 0, 0], FUELL = mulden(Q, nw);
  for (let v = 0; v < nw; v++) {
    fettFeld(W[v * 3], W[v * 3 + 1], W[v * 3 + 2], faus);
    faus[0] += 0.45 * FUELL[v]; faus[1] += 0.45 * FUELL[v];
    if (!faus[0] && !faus[1]) continue;
    const l = Math.hypot(NW[v * 3], NW[v * 3 + 1], NW[v * 3 + 2]) || 1, qx = Q[v * 3], qy = Q[v * 3 + 1], qz = Q[v * 3 + 2] + 0.005, ra = Math.hypot(qx, qz) || 1;
    // Am Rumpf waagrecht nach außen statt entlang der Normale: In einer Mulde laufen Normalen aufeinander zu, die Haut klappte dort über sich selbst
    const wr = (1 - glatt(0.19, 0.26, Math.abs(qx))) * glatt(0.88, 0.96, qy) * (1 - glatt(1.44, 1.54, qy)), rx = NW[v * 3] / l * (1 - wr) + qx / ra * wr, ry = NW[v * 3 + 1] / l * (1 - wr), rz = NW[v * 3 + 2] / l * (1 - wr) + qz / ra * wr;
    FD[0][v * 3] = rx * faus[0]; FD[0][v * 3 + 1] = ry * faus[0]; FD[0][v * 3 + 2] = rz * faus[0]; FD[1][v * 3] = rx * faus[1]; FD[1][v * 3 + 1] = ry * faus[1]; FD[1][v * 3 + 2] = rz * faus[1];
    FD[1][v * 3 + 1] -= faus[2];
  }
  const normalenMit = (D) => {
    const A = new Float64Array(nw * 3);
    for (let t = 0; t < T; t++) {
      const i0 = id[ix[t * 3]], i1 = id[ix[t * 3 + 1]], i2 = id[ix[t * 3 + 2]];
      a.set(Q[i0 * 3] + D[i0 * 3], Q[i0 * 3 + 1] + D[i0 * 3 + 1], Q[i0 * 3 + 2] + D[i0 * 3 + 2]); b.set(Q[i1 * 3] + D[i1 * 3], Q[i1 * 3 + 1] + D[i1 * 3 + 1], Q[i1 * 3 + 2] + D[i1 * 3 + 2]); c.set(Q[i2 * 3] + D[i2 * 3], Q[i2 * 3 + 1] + D[i2 * 3 + 1], Q[i2 * 3 + 2] + D[i2 * 3 + 2]);
      g.copy(b).sub(a).cross(q.copy(c).sub(a));
      for (const v of [i0, i1, i2]) { A[v * 3] += g.x; A[v * 3 + 1] += g.y; A[v * 3 + 2] += g.z; }
    }
    return A;
  };
  const NF = FD.map(normalenMit);
  form.d1 = new Float32Array(n0 * 3); form.d2 = new Float32Array(n0 * 3); form.n1 = new Float32Array(n0 * 3); form.n2 = new Float32Array(n0 * 3); form.schwelle = new Float32Array(n0 * 3);
  for (let i = 0; i < n0; i++) {
    const v = id[i] * 3, l = Math.hypot(NW[v], NW[v + 1], NW[v + 2]) || 1, l1 = Math.hypot(NF[0][v], NF[0][v + 1], NF[0][v + 2]) || 1, l2 = Math.hypot(NF[1][v], NF[1][v + 1], NF[1][v + 2]) || 1;
    for (let z = 0; z < 3; z++) { form.d1[i * 3 + z] = FD[0][v + z]; form.d2[i * 3 + z] = FD[1][v + z]; form.n1[i * 3 + z] = NF[0][v + z] / l1 - NW[v + z] / l; form.n2[i * 3 + z] = NF[1][v + z] / l2 - NW[v + z] / l; }
    const x = W[v], y = W[v + 1], z = W[v + 2];
    form.schwelle[i * 3] = schwelleVon(x, y, z); form.schwelle[i * 3 + 1] = frei[id[i]];
    form.schwelle[i * 3 + 2] = Math.abs(x) < 0.26 && y < 1.14 && y > 0.88 ? 1 - glatt(1.05, 1.125, y) : 0;   // Bund des Modells: im Netz immer glatt
  }
  // Kleidung: Punkt auf der Haut (ruhe) über den Ort
  const ort = new Map(); for (let i = 0; i < n0; i++) ort.set(Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4), i);
  for (const h of k.kleidung || []) {
    const R = h.ruhe.array, n = h.pos.count, dd = new Float32Array(n * 3), d1 = new Float32Array(n * 3), d2 = new Float32Array(n * 3), sw = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const j = ort.get(Math.round(R[i * 3] * 1e4) + ',' + Math.round(R[i * 3 + 1] * 1e4) + ',' + Math.round(R[i * 3 + 2] * 1e4));
      if (j !== undefined) for (let z = 0; z < 3; z++) { dd[i * 3 + z] = d[j * 3 + z]; d1[i * 3 + z] = form.d1[j * 3 + z]; d2[i * 3 + z] = form.d2[j * 3 + z]; sw[i * 3 + z] = form.schwelle[j * 3 + z]; }
    }
    form.stoff.push({ h, d: dd, d1, d2, schwelle: sw, pos: new Float32Array(h.pos.array), eng: new Float32Array(h.eng.array) });
  }
  return form;
}

// Relief aus der Hautfarbe: statt der Textur ihre verwischte Stufe
const MAP_GLATT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D(map, vMapUv);
  float dkGL = vGlatt;
  if (dkGL > 0.001) sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mix(textureLod(map, vMapUv, 4.5).rgb, vec3(0.67, 0.383, 0.21), 0.8), dkGL * 0.94);
  diffuseColor *= sampledDiffuseColor;
#endif
`;
const FORM_PARS = `
attribute vec3 formD;
attribute vec3 formS;
attribute vec3 fettD1;
attribute vec3 fettD2;
uniform vec4 uForm;
`;
// Je Punkt: wie glatt (Zeichnung weg) ist es hier bei diesem Körperfett und dieser Muskelmasse?
const FORM_G = `
float dkFormG = (1.0 - uForm.y * (1.0 - smoothstep(formS.x - 7.0, formS.x + 7.0, uForm.x))) * formS.y;
float dkFormNetz = max(dkFormG, formS.z);
`;
function ersetze(t, a, b) { if (!t.includes(a)) throw new Error('Form: Stelle fehlt: ' + a.slice(0, 50)); return t.replace(a, () => b); }
function patche(mat, name, f) {
  const alt = mat.onBeforeCompile, vorher = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = (s, r) => { if (alt) alt.call(mat, s, r); f(s); };
  mat.customProgramCacheKey = () => vorher + '|form-' + name;
  mat.needsUpdate = true;
}
export function vorbereiten(figur) {
  if (figur.uForm) return;
  const k = figur.k;
  if (!k.form) k.form = rechne(k);
  const f = k.form, uForm = (figur.uForm = { value: new THREE.Vector4(10, 1, 0, 0) }), attr = (g, n, a) => g.setAttribute(n, new THREE.BufferAttribute(a, 3));
  // Die Haut hat schon 12 Attribute, mehr als 16 kann WebGL nicht: Ihre Werte liegen darum als Tabelle in einer Textur, je Punkt sechs Einträge, gelesen über die Punktnummer
  const N = f.m.pos.count, BT = 1024, HT = Math.ceil(N * 6 / BT), T = new Float32Array(BT * HT * 4);
  for (let i = 0; i < N; i++) {
    const o = i * 24;
    for (let c = 0; c < 3; c++) { const j = i * 3 + c; T[o + c] = f.d1[j]; T[o + 4 + c] = f.d2[j]; T[o + 8 + c] = f.n1[j]; T[o + 12 + c] = f.n2[j]; T[o + 16 + c] = f.d[j]; T[o + 20 + c] = f.ng[j]; T[o + 3 + c * 4] = f.schwelle[j]; }
  }
  const tab = new THREE.DataTexture(T, BT, HT, THREE.RGBAFormat, THREE.FloatType); tab.minFilter = tab.magFilter = THREE.NearestFilter; tab.generateMipmaps = false; tab.needsUpdate = true;
  patche(figur.koerperMesh.material, 'haut', (s) => {
    s.uniforms.uForm = uForm; s.uniforms.uFormTab = { value: tab };
    s.vertexShader = ersetze(s.vertexShader, '#include <common>', '#include <common>\nuniform vec4 uForm;\nuniform highp sampler2D uFormTab;\nvarying float vGlatt;\nvec4 dkFormT(int k) { int i = gl_VertexID * 6 + k; return texelFetch(uFormTab, ivec2(i % ' + BT + ', i / ' + BT + '), 0); }');
    s.vertexShader = ersetze(s.vertexShader, '#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec4 dkT0 = dkFormT(0), dkT1 = dkFormT(1), dkT2 = dkFormT(2), dkT3 = dkFormT(3), dkT4 = dkFormT(4), dkT5 = dkFormT(5);\nfloat dkFormG = (1.0 - uForm.y * (1.0 - smoothstep(dkT0.w - 7.0, dkT0.w + 7.0, uForm.x))) * dkT1.w;\nfloat dkFormNetz = max(dkFormG, dkT2.w);\nvGlatt = dkFormG;\nobjectNormal = normalize(objectNormal + (dkT5.xyz - objectNormal) * dkFormNetz + dkT2.xyz * uForm.z + dkT3.xyz * uForm.w);');
    s.vertexShader = ersetze(s.vertexShader, '#include <skinning_vertex>', 'transformed += dkT4.xyz * dkFormNetz + dkT0.xyz * uForm.z + dkT1.xyz * uForm.w;\nvRuhe = position + dkT4.xyz * dkFormNetz;\n#include <skinning_vertex>');
    s.fragmentShader = ersetze(s.fragmentShader, '#include <common>', '#include <common>\nvarying float vGlatt;');
    s.fragmentShader = ersetze(s.fragmentShader, '#include <map_fragment>', MAP_GLATT);
    // Schatten nur am Kopf: Die Schattenkarte kennt die Fettschichten nicht, am Rumpf lagen Schatten darum falsch. Der Hut beschattet das Gesicht weiter
    s.fragmentShader = ersetze(s.fragmentShader, '#include <lights_fragment_begin>', 'float dkSchattenW = smoothstep(1.46, 1.56, vRuhe.y);\n' + THREE.ShaderChunk.lights_fragment_begin.replace(/\? getShadow\(([^;]*)\) : 1\.0;/g, '? mix(1.0, getShadow($1), dkSchattenW) : 1.0;'));
    s.fragmentShader = ersetze(s.fragmentShader, 'mapN.xy *= normalScale * (1.0 + 1.1 * vSpiel);', 'mapN.xy *= normalScale * (1.0 + 1.1 * vSpiel) * (1.0 - 0.93 * vGlatt);');
  });
  // Hüllen gehen mit: gleiche Werte wie der Punkt auf der Haut darunter, auch für die enge Lage
  for (const st of f.stoff) {
    const mesh = figur.meshes.find((m) => m.geometry.attributes.ruhe === st.h.ruhe);
    if (!mesh) continue;
    const g = mesh.geometry;
    attr(g, 'formD', st.d); attr(g, 'formS', st.schwelle); attr(g, 'fettD1', st.d1); attr(g, 'fettD2', st.d2);
    patche(mesh.material, 'stoff', (s) => {
      s.uniforms.uForm = uForm;
      s.vertexShader = ersetze(s.vertexShader, '#include <common>', '#include <common>\n' + FORM_PARS);
      s.vertexShader = ersetze(s.vertexShader, '#include <skinning_vertex>', FORM_G + '{ vec3 dkFormV = formD * dkFormNetz + fettD1 * uForm.z + fettD2 * uForm.w; transformed += dkFormV; dkEng += dkFormV; }\n#include <skinning_vertex>');
    });
  }
}
// bf: Körperfett in Prozent (nur für die Zeichnung), rel: Muskelzeichnung 0 bis 1, a1, a2: Fettschichten. L: wie locker das Oberteil fällt (1 wie modelliert, 0 liegt an)
export function setzeForm(figur, w, L) {
  vorbereiten(figur);
  figur.uForm.value.set(w.bf, w.rel, w.a1, w.a2);
  if (L == null || figur.lockerWert === L) return;
  figur.lockerWert = L;
  for (const s of figur.k.form.stoff) {
    if (s.h.mat !== 'top') continue;
    const a = s.h.pos.array;
    for (let i = 0; i < a.length; i++) a[i] = s.eng[i] + (s.pos[i] - s.eng[i]) * L;
    s.h.pos.needsUpdate = true;
  }
}

/* ---------- Abgleich mit dem Foto ---------- */
// Die Figur steht wie im Foto, wird unsichtbar aufgenommen und läuft durch dieselbe Erkennung und Messung. Der Unterschied zum Foto stellt die Maße nach (zwei, drei Runden).
// So heben sich Haltung, Drehung, anliegende Arme und die Eigenheiten der Erkennung auf
const AUFN = { W: 540, H: 960 };
let _rt = null, _buf = null, _lut = null, _kam = null;
export const aufnahmeKamera = () => ({ kam: _kam, W: AUFN.W, H: AUFN.H });
export function aufnahme(ansicht, pose, gelenke) {
  const r = ansicht.renderer, W = AUFN.W, H = AUFN.H;
  if (!_rt) {
    _rt = new THREE.WebGLRenderTarget(W, H, { samples: 2 }); _buf = new Uint8Array(W * H * 4);
    _lut = new Uint8Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; _lut[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }
    _kam = new THREE.PerspectiveCamera(46, W / H, 0.05, 20); _kam.position.set(0, 1.0, 3.0); _kam.lookAt(0, 0.92, 0);
  }
  const g = gelenke(pose); ansicht.figur.stelle(g);
  const alt = new THREE.Color(), altA = r.getClearAlpha(); r.getClearColor(alt);
  r.setRenderTarget(_rt); r.setClearColor(0x484b4f, 1); r.clear(); r.render(ansicht.szene, _kam); r.readRenderTargetPixels(_rt, 0, 0, W, H, _buf); r.setRenderTarget(null); r.setClearColor(alt, altA);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), bild = x.createImageData(W, H), d = bild.data;
  for (let y = 0; y < H; y++) { const q = (H - 1 - y) * W * 4, z = y * W * 4; for (let i = 0; i < W * 4; i += 4) { d[z + i] = _lut[_buf[q + i]]; d[z + i + 1] = _lut[_buf[q + i + 1]]; d[z + i + 2] = _lut[_buf[q + i + 2]]; d[z + i + 3] = 255; } }
  x.putImageData(bild, 0, 0);
  return c;
}
// roh: Maße aus dem Foto. Liefert die Verhältnisse r und zum Prüfen die letzte Messung der Figur
export async function passeAn(o) {
  const { ansicht, r, fm, gelenke, basis, BAU, MASS } = o, figur = ansicht.figur, runden = o.runden || 3, verlauf = [], b = r.breit, l = r.lang;
  let roh = o.roh, haltung = o.haltung;
  const med = (q) => { q.sort((x, y) => x - y); return q[Math.floor(q.length / 2)]; };
  // Verhältnis Foto zu Figur in den Zeilen a…b, die in beiden Bildern frei von Armen sind
  const zone = (f, a, e) => { const q = [], k = f.lRumpf / roh.lRumpf; roh.prof.forEach((p, i) => { const g = f.prof[i]; if (g && p.t >= a && p.t <= e && p.frei && g.frei && p.b > 0 && g.b > 0) q.push(p.b / g.b * k); }); return q.length >= 2 ? med(q) : null; };
  const nach = (ob, k, q, lo = 0.6, hi = 1.5) => { if (q == null || !(q > 0)) return false; ob[k] = Math.max(lo, Math.min(hi, ob[k] * Math.max(0.8, Math.min(1.25, Math.pow(q, 0.85))))); return true; };
  let letzte = null, skala = 1;
  const q2 = (a, e) => (a > 0 && e > 0 ? a / e * skala : null);
  for (let n = 0; n < runden; n++) {
    // Mit Foto von hinten: abwechselnd von hinten und von vorn messen, die letzte Runde von vorn
    const hinten = o.zweit && n % 2 === 1 && n < runden - 1; roh = hinten ? o.zweit.roh : o.roh; haltung = hinten ? o.zweit.haltung : o.haltung;
    if (o.fortschritt) await o.fortschritt(n, runden);
    fm.anwenden(r, basis, BAU, MASS, figur, 1);
    const c = aufnahme(ansicht, haltung(), gelenke), e = await fm.erkenne(c);
    if (!e) break;
    const f = fm.messeRoh(e, roh.groesse);
    letzte = { f, e, c }; verlauf.push(f);
    if (n === runden - 1) break;
    skala = f.lRumpf / roh.lRumpf;
    nach(b, 'schulter', q2(roh.schulter, f.schulter), 0.68, 1.3); b.aussen = b.schulter;
    const qT = zone(f, 0.5, 0.8), qH = zone(f, 0.84, 1.03), qB = zone(f, 0.22, 0.48);
    const hatH = nach(b, 'huefte', qH, 0.78, 1.15), hatT = nach(b, 'taille', qT, 0.72, o.tailleMax || 1.2);
    if (!hatT && hatH) b.taille = Math.max(b.taille, Math.min(1.1, b.huefte * 0.95));   // Taille verdeckt: nicht schmaler als die Hüfte vermuten lässt
    const k = f.lRumpf / roh.lRumpf, alle = []; roh.prof.forEach((p, i) => { const g = f.prof[i]; if (g && p.t >= 0.2 && p.t <= 0.44 && p.b > 0 && g.b > 0) alle.push(p.b / g.b * k); });
    if (!nach(b, 'brust', qB != null ? qB : alle.length >= 3 ? med(alle) : null, 0.7, 1.3)) b.brust = (b.schulter + b.taille) / 2;
    const tief = (w) => 1 + (w - 1) * (w > 1 ? 0.5 : 0.85);   // breiter kann auch lockere Kleidung sein: nach vorn weniger
    r.tiefe.brust = tief(b.brust); r.tiefe.taille = tief(b.taille); r.tiefe.huefte = tief(b.huefte); b.hueftG = Math.max(0.85, Math.min(1.2, b.huefte));
    const qO = q2(roh.oberarm, f.oberarm), qU = q2(roh.unterarm, f.unterarm);
    nach(b, 'arm', qO && qU ? Math.sqrt(qO * qU) : qO || qU, 0.68, 1.3);
    const qS = q2(roh.oberschenkel, f.oberschenkel), qW = q2(roh.wade, f.wade);
    nach(b, 'bein', qS && qW ? Math.sqrt(qS * qW) : qS || qW, 0.7, 1.3);
    if (b.hals == null) b.hals = 1;
    nach(b, 'hals', q2(roh.hals, f.hals), 0.72, 1.2);
    // Längen: nur vorsichtig (Kamerahöhe und Haltung verkürzen im Foto), Gesamthöhe bleibt
    for (const [k, a, e2] of [['oberschenkel', roh.lOberschenkel, f.lOberschenkel], ['unterschenkel', roh.lUnterschenkel, f.lUnterschenkel]]) nach(l, k, q2(a, e2), 0.95, 1.05);
    if (!roh.abgeschnitten) nach(l, 'rumpf', roh.lRumpf / f.lRumpf, 0.95, 1.05);
    if (roh.ohren > 0 && f.ohren > 0) { const k0 = Math.sqrt(r.hoehe); r.kopf = Math.max(k0 * 0.96, Math.min(k0 * 1.08, (r.kopf || 1) * Math.pow(q2(roh.ohren, f.ohren), 0.5))); }
    const hoch = (l.rumpf * 0.5 + l.oberschenkel * 0.45 + l.unterschenkel * 0.44) / 1.39; l.rumpf /= hoch; l.oberschenkel /= hoch; l.unterschenkel /= hoch;
    for (const [k, a, e2] of [['oberarm', roh.lOberarm, f.lOberarm], ['unterarm', roh.lUnterarm, f.lUnterarm]]) nach(l, k, q2(a, e2), 0.95, 1.05);
  }
  // Devin, 2.11. nach dem ersten echten Foto: Schultern zu schmal (Arme, Beine und Rumpf passten). Die Glättung nimmt der Schulter die Rundung, die der Umriss allein nicht zurückholt
  b.schulter = Math.min(1.3, b.schulter * 1.07); b.aussen = b.schulter;
  return { r, letzte, verlauf };
}

/* ---------- Kleidung ---------- */
// Farbe von Shirt, Hose und Socken aus dem Foto (Median je Fleck, linear). Ist der Fleck hautfarben (kein Shirt, kurze Hose), bleibt die Figur, wie sie ist
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export function kleidungAusFoto(figur, bild, e, haut) {
  const x = bild.getContext('2d', { willReadFrequently: true }), k = e.pkt, sk = bild.width / e.w, r = Math.max(2, Math.round(0.008 * bild.height));
  const fleck = (px, py) => {
    px = Math.round(px * sk); py = Math.round(py * sk);
    if (px < r || py < r || px >= bild.width - r || py >= bild.height - r) return null;
    if (e.d[Math.round(py / sk) * e.w + Math.round(px / sk)] !== 1) return null;
    const d = x.getImageData(px - r, py - r, 2 * r, 2 * r).data, w = [[], [], []];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) w[c].push(d[i + c]);
    return w.map((l) => { l.sort((a, b) => a - b); return linear(l[Math.floor(l.length * 0.7)]); });   // eher die beleuchtete Seite des Stoffs
  };
  const m = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), sm = m(k.sl, k.sr, 0.5), qm = m(k.ql, k.qr, 0.5);
  const istHaut = (c) => { if (!haut) return false; const rg = c[0] / Math.max(0.003, c[1]), bg = c[2] / Math.max(0.003, c[1]); return rg > 1.3 && bg < 0.85; };
  const setze = (u, c) => {
    if (!c) return;
    if (!u.ur) u.ur = u.value.clone();
    const hi = Math.max(...c), lo = Math.min(...c), hell = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    if (hi > 0 && (hi - lo) / hi < 0.62) u.value.setRGB(hell, hell, hell * 1.02); else u.value.setRGB(c[0], c[1], c[2]);
  };
  // Shirt: drei Stellen die Körpermitte hinunter, die hellste zählt (eine Hand oder der Schatten unter der Brust verdecken sonst den Stoff)
  const shirt = [0.3, 0.45, 0.6].map((t) => fleck(...Object.values(m(sm, qm, t)))).filter(Boolean).sort((p, q) => q[1] - p[1])[0];
  if (shirt && !istHaut(shirt)) setze(figur.u.uOberteil, shirt);
  const hl = fleck(...Object.values(m(k.ql, k.kl, 0.3))), hr = fleck(...Object.values(m(k.qr, k.kr, 0.3))), hose = hl && hr ? hl.map((v, i) => (v + hr[i]) / 2) : hl || hr;
  if (hose && !istHaut(hose)) setze(figur.u.uHose, hose);
  const sl = fleck(...Object.values(m(k.kl, k.al, 0.82))), sr = fleck(...Object.values(m(k.kr, k.ar, 0.82))), socke = sl && sr ? (sl[1] > sr[1] ? sl : sr) : sl || sr;
  if (socke && !istHaut(socke)) setze(figur.u.uSocke, socke);
  return { shirt, hose, socke };
}
// Was getragen wird: Oberarm, Unterarm und Schienbein gegen Hautton und Stoff. haut: Hautton aus dem Gesicht, stoff: { shirt, hose } aus kleidungAusFoto. null heißt: im Foto nicht zu sehen
export function kleidungsArt(bild, e, o = {}) {
  const x = bild.getContext('2d', { willReadFrequently: true }), k = e.pkt, sk = bild.width / e.w, r = Math.max(2, Math.round(0.006 * bild.height));
  const fleck = (a, b, t) => {
    if ((a.sichtbar != null && a.sichtbar < 0.5) || (b.sichtbar != null && b.sichtbar < 0.5)) return null;
    const qx = a.x + (b.x - a.x) * t, qy = a.y + (b.y - a.y) * t, px = Math.round(qx * sk), py = Math.round(qy * sk);
    if (px < r || py < r || px >= bild.width - r || py >= bild.height - r) return null;
    if (e.d[Math.round(qy) * e.w + Math.round(qx)] !== 1) return null;
    const d = x.getImageData(px - r, py - r, 2 * r, 2 * r).data, w = [[], [], []];
    for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) w[c].push(d[i + c]);
    return w.map((l) => { l.sort((p, q) => p - q); return linear(l[Math.floor(l.length * 0.5)]); });
  };
  const gamma = (c) => c.map((v) => Math.pow(Math.max(0, v), 1 / 2.2)), ab = (p, q) => { const a = gamma(p), b = gamma(q); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  // Sieht es nach Haut aus (Farbton), und liegt es näher am Hautton (auf dieselbe Helligkeit gebracht, das Licht ist überall anders) als am Stoff? Ist der „Stoff“ selbst hautfarben (kurze Hose, Fleck auf dem Bein), zählt nur der Farbton
  const hell = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], hautton = (c) => c[0] / Math.max(0.003, c[1]) >= 1.15 && c[2] / Math.max(0.003, c[1]) <= 0.95;
  const istHaut = (c, stoff) => { if (!hautton(c)) return false; if (!stoff || hautton(stoff)) return true; const q = o.haut || [0.45, 0.27, 0.18], f = hell(c) / Math.max(0.003, hell(q)); return ab(c, q.map((v) => v * f)) <= ab(c, stoff); };
  const stimme = (paare, t, stoff) => { const l = paare.map(([a, b]) => fleck(a, b, t)).filter(Boolean); if (!l.length) return null; return l.some((c) => istHaut(c, stoff)) ? 'haut' : 'stoff'; };
  const shirt = o.stoff && o.stoff.shirt, hose = o.stoff && o.stoff.hose;
  const oberarm = stimme([[k.sl, k.el], [k.sr, k.er]], 0.35, shirt), unterarm = stimme([[k.el, k.hl], [k.er, k.hr]], 0.5, shirt), schienbein = stimme([[k.kl, k.al], [k.kr, k.ar]], 0.45, hose);
  return { oben: oberarm === 'haut' ? 'tank' : oberarm === 'stoff' ? (unterarm === 'stoff' ? 'langarm' : 'tshirt') : null, unten: schienbein === 'stoff' ? 'lang' : schienbein === 'haut' ? 'kurz' : null, oberarm, unterarm, schienbein };
}
// Zweites Foto von der Seite: nur noch die Tiefen
export async function passeTiefe(o) {
  const { ansicht, roh, r, fm, gelenke, haltung, basis, BAU, MASS } = o;
  for (let n = 0; n < 2; n++) {
    fm.anwenden(r, basis, BAU, MASS, ansicht.figur, 1);
    const e = await fm.erkenne(aufnahme(ansicht, haltung(), gelenke));
    if (!e) return r;
    const f = fm.messeRoh(e, roh.groesse), k = f.lRumpf / roh.lRumpf;
    const zone = (a, z) => { const q = []; roh.prof.forEach((p, i) => { const g = f.prof[i]; if (g && p.t >= a && p.t <= z && p.frei && g.frei && p.b > 0 && g.b > 0) q.push(p.b / g.b * k); }); q.sort((x, y) => x - y); return q.length >= 2 ? q[Math.floor(q.length / 2)] : null; };
    for (const [w, a, z] of [['brust', 0.22, 0.48], ['taille', 0.5, 0.85], ['huefte', 1.02, 1.13]]) { const q = zone(a, z); if (q) r.tiefe[w] = Math.max(0.7, Math.min(1.4, r.tiefe[w] * Math.pow(q, 0.85))); }
  }
  return r;
}
export function kleidungZurueck(figur) { for (const n of ['uOberteil', 'uHose', 'uSocke']) { const u = figur.u[n]; if (u.ur) u.value.copy(u.ur); } }

/* ---------- Form aus Größe, Gewicht und Körperfett ---------- */
// Devin, 2.11.: „realistisch … nicht zu brutal … Starterfigur ganz dünn … 50 Kilo“. x: fettfreie Masse je Körpergröße (FFMI 14 = sehr dünn, 25 = natürliche Grenze und die modellierte Figur),
// y: Fett über 10 %. Die Faktoren sind die Breiten gegenüber der modellierten Figur (Erfahrungswerte aus Umfangstabellen), das genaue Gewicht stellt danach aufGewicht ein
export const ffmi = (groesse, gewicht, fett) => gewicht * (1 - fett / 100) / ((groesse / 100) ** 2);
export function fettSchaetzung(groesse, gewicht, frau) { const bmi = gewicht / ((groesse / 100) ** 2); return Math.max(frau ? 14 : 7, Math.min(45, 1.2 * bmi + 0.23 * 25 - (frau ? 0 : 10.8) - 5.4)); }
export function modell(groesse, gewicht, fett) {
  const x = Math.max(-0.2, Math.min(1.1, (ffmi(groesse, gewicht, fett) - 14) / 11)), y = 0.2 * Math.max(-0.05, (fett - 10) / 100), h = groesse / 180;   // Fett kommt jetzt fast nur noch über die Schichten
  const br = { arm: 0.62 + 0.38 * x + 0.6 * y, bein: 0.68 + 0.32 * x + 0.7 * y, brust: 0.78 + 0.22 * x + 0.5 * y, taille: 0.84 + 0.16 * x + 1.5 * y, huefte: 0.8 + 0.2 * x + 0.9 * y, schulter: 0.9 + 0.1 * x + 0.1 * y, hals: 0.78 + 0.22 * x + 0.4 * y };
  return { hoehe: h, kopf: Math.sqrt(h), breit: { schulter: br.schulter, aussen: br.schulter, taille: br.taille, huefte: br.huefte, hueftG: 0.9 + 0.1 * x, arm: br.arm, bein: br.bein, brust: br.brust, hals: br.hals }, tiefe: { brust: br.brust, taille: 0.82 + 0.18 * x + 2 * y, huefte: br.huefte }, lang: { rumpf: 1, oberarm: 1, unterarm: 1, oberschenkel: 1, unterschenkel: 1 } };
}
// Volumen der Haut in der aktuellen Knochenlage, in Litern (Dreiecke gegen den Ursprung; Augen und Mund sind winzige Löcher)
export function volumen(figur) {
  const g = figur.koerperMesh.geometry, P = g.attributes.position.array, I = g.index.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, n = P.length / 3, A = figur.A.map((m) => m.elements), Q = new Float32Array(n * 3), f = figur.k.form, u = figur.uForm.value;
  const stufe = (v, a, b) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < n; i++) {
    const s0 = f.schwelle[i * 3], gg = Math.max((1 - u.y * (1 - stufe(u.x, s0 - 7, s0 + 7))) * f.schwelle[i * 3 + 1], f.schwelle[i * 3 + 2]);
    const x = P[i * 3] + f.d[i * 3] * gg + f.d1[i * 3] * u.z + f.d2[i * 3] * u.w, y = P[i * 3 + 1] + f.d[i * 3 + 1] * gg + f.d1[i * 3 + 1] * u.z + f.d2[i * 3 + 1] * u.w, z = P[i * 3 + 2] + f.d[i * 3 + 2] * gg + f.d1[i * 3 + 2] * u.z + f.d2[i * 3 + 2] * u.w; let a = 0, b = 0, c = 0;
    for (let j = 0; j < 4; j++) { const w = sw[i * 4 + j] / 255; if (!w) continue; const e = A[si[i * 4 + j]]; a += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); b += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); c += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); }
    Q[i * 3] = a; Q[i * 3 + 1] = b; Q[i * 3 + 2] = c;
  }
  let v = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    v += Q[a] * (Q[b + 1] * Q[c + 2] - Q[b + 2] * Q[c + 1]) - Q[a + 1] * (Q[b] * Q[c + 2] - Q[b + 2] * Q[c]) + Q[a + 2] * (Q[b] * Q[c + 1] - Q[b + 1] * Q[c]);
  }
  return Math.abs(v) / 6 * 1000;
}
// Dichte des Körpers aus dem Körperfett (Siri)
const dichte = (fett) => 495 / (fett + 450);
// Wie viel von beiden Schichten bei diesem Gewicht und Körperfett? Über die schlanke Form (10 % Fett) hinaus geht alles Fett in die Schichten: erst die frühe, was darüber liegt, in die späte. Die Liter je Schicht misst aufGewicht an der Figur
export function fettSchichten(figur, gewicht, fett) {
  const ffm = gewicht * (1 - fett / 100), mager = Math.min(gewicht, ffm / 0.9), liter = (gewicht - mager) / 0.92, e = figur.fettEich || { v1: 14, v2: 26 };
  const a1 = Math.min(1.1, liter / e.v1), a2 = Math.min(3.2, Math.max(0, (liter - a1 * e.v1) / e.v2));
  return { a1, a2 };
}
// Stellt die Form so ein, dass die Figur wiegt, was eingetragen ist: zuerst die schlanke Form auf ihr Gewicht, dann die Schichten dazu. nurTiefe: Breiten stehen schon (aus dem Foto), nur die Tiefe von Rumpf und Bauch folgt dem Gewicht
export function aufGewicht(o) {
  const { ansicht, r, gewicht, fett, fm, gelenke, haltung, basis, BAU, MASS, nurTiefe } = o, figur = ansicht.figur, u = figur.uForm.value, alt = u.clone(), ffm = gewicht * (1 - fett / 100), mager = Math.min(gewicht, ffm / 0.9);
  const stell = () => { fm.anwenden(r, basis, BAU, MASS, figur, 1); figur.stelle(gelenke(haltung())); };
  let kg = 0;
  u.z = 0; u.w = 0;
  if (!nurTiefe) for (let n = 0; n < 3; n++) {
    stell(); kg = volumen(figur) * dichte(10);
    const w = Math.sqrt(Math.max(0.75, Math.min(1.33, mager / kg)));
    for (const k of ['arm', 'bein', 'brust', 'taille', 'huefte', 'hals']) r.breit[k] *= w;
    for (const k of ['brust', 'taille', 'huefte']) r.tiefe[k] *= w;
  }
  stell();
  const v0 = volumen(figur); u.z = 1; const v1 = volumen(figur) - v0; u.z = 0; u.w = 1; const v2 = volumen(figur) - v0;
  figur.fettEich = { v1: Math.max(1, v1), v2: Math.max(1, v2) };
  const sch = fettSchichten(figur, gewicht, fett); u.z = sch.a1; u.w = sch.a2;
  // Der Rest (die Schichten sind nicht ganz linear, und mit Foto steht die Breite fest) geht in die Form
  for (let n = 0; n < 2; n++) {
    stell(); kg = volumen(figur) * dichte(fett);
    const q = Math.max(0.75, Math.min(1.33, gewicht / kg));
    if (nurTiefe) { for (const k of ['brust', 'taille', 'huefte']) r.tiefe[k] = Math.max(0.7, Math.min(1.5, r.tiefe[k] * q)); }
    else { const w = Math.sqrt(q); for (const k of ['arm', 'bein', 'brust', 'taille', 'huefte', 'hals']) r.breit[k] *= w; for (const k of ['brust', 'taille', 'huefte']) r.tiefe[k] *= w; }
  }
  stell(); kg = volumen(figur) * dichte(fett);
  u.copy(alt);
  return kg;
}
