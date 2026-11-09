// DK Coach — Charakter aus der Analyse (Devin, 2.11.: „nicht nur ein Bild draufgeklatscht … wie ein Charakter in einem Videospiel … den man selber bauen kann“).
// Es wird nichts aus dem Foto aufgeklebt. Aus den Gesichtspunkten entsteht die Form: Kopf, Kiefer, Nase, Augen und Brauen der Figur rücken dorthin, wo sie beim Menschen im Foto liegen.
// Die Farben bleiben gemalt: Die Hautkarte der Figur behält ihre Zeichnung, aus dem Foto kommt nur die grobe Farbverteilung (Hautton, Wangen, Lippen, Bartschatten; Raster rund 6 mm), dazu Augen-, Brauen- und Haarfarbe.
// Form und Farbe sind eigene Attribute und werden im Shader dazugerechnet: position bleibt, darum laufen Lidschlag und Mimik weiter
import * as THREE from 'three';
import { GESICHT_REF, FORM_PUNKTE } from './gesicht-ref.js';
import { ANZAHL, duennplatte, netz, randMaske, farbAbgleich, haarFarbe, muetzenRand } from './gesicht.js';

const UNI = { uCharakter: { value: 0 }, uIris: { value: new THREE.Color(0.1, 0.06, 0.03) }, uIrisAn: { value: 0 } };
const glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };

export function patche(mat, name) {
  const alt = mat.onBeforeCompile, vorher = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = (s, r) => {
    if (alt) alt.call(mat, s, r);
    Object.assign(s.uniforms, UNI);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 kopfForm;\nattribute vec3 kopfNormD;\nattribute vec3 kopfFarbe;\nuniform float uCharakter;\nvarying vec3 vKopfFarbe;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(objectNormal + kopfNormD * uCharakter);\nvKopfFarbe = mix(vec3(1.0), kopfFarbe, uCharakter);')
      .replace('#include <skinning_vertex>', 'transformed += kopfForm * uCharakter;\n#include <skinning_vertex>');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uIris;\nuniform float uIrisAn;\nvarying vec3 vKopfFarbe;')
      .replace('#include <roughnessmap_fragment>', `diffuseColor.rgb *= vKopfFarbe;
#ifdef DK_AUGE
{
  float dkIr = (1.0 - smoothstep(0.0062, 0.0074, length(vec2(abs(vRuhe.x) - 0.034, vRuhe.y - 1.699)))) * uIrisAn;
  float dkH = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, uIris * (0.55 + 2.6 * dkH), dkIr * 0.85);
}
#endif
#include <roughnessmap_fragment>`);
  };
  mat.customProgramCacheKey = () => vorher + '|charakter-' + name;
  mat.needsUpdate = true;
}
const netzName = (figur, m) => { const i = figur.meshes.indexOf(m), k = figur.k.meshes[i]; return k ? k.name : ''; };
export function vorbereiten(figur) {
  if (figur.kopfNetze) return;
  figur.kopfNetze = {};
  for (const m of figur.meshes) {
    const n = netzName(figur, m);
    if (n !== 'SuperHero_Male' && n !== 'Eyebrows' && n !== 'Hair_Buzzed' && n !== 'Eyes') continue;
    const g = m.geometry, c = g.attributes.position.count;
    g.setAttribute('kopfForm', new THREE.BufferAttribute(new Float32Array(c * 3), 3));
    g.setAttribute('kopfNormD', new THREE.BufferAttribute(new Float32Array(c * 3), 3));
    g.setAttribute('kopfFarbe', new THREE.BufferAttribute(new Float32Array(c * 3).fill(1), 3));
    patche(m.material, n);
    figur.kopfNetze[n] = m;
  }
}
export function setzeStaerke(wert) { UNI.uCharakter.value = wert; if (irisGemessen) UNI.uIrisAn.value = wert; }
let irisGemessen = false;
export const staerke = () => UNI.uCharakter.value;
export function loesche(figur) {
  setzeStaerke(0); UNI.uIrisAn.value = 0; irisGemessen = false;
  for (const m of Object.values(figur.kopfNetze || {})) {
    const a = m.geometry.attributes;
    a.kopfForm.array.fill(0); a.kopfNormD.array.fill(0); a.kopfFarbe.array.fill(1);
    a.kopfForm.needsUpdate = a.kopfNormD.needsUpdate = a.kopfFarbe.needsUpdate = true;
  }
  figur.charakterKopf = null; figur.hutHoch = 0;
}

/* ---------- Form ---------- */
// Die Einstellregler (Werte -1…1), gerechnet auf den Punkten in der Ruhelage: jeder wirkt in seinem weichen Bereich, die Dünnplatte nimmt das Netz mit
function mitReglern(M, regler) {
  const R = regler || {}, v = (n) => R[n] || 0, b = v('breite'), ki = v('kiefer'), c = v('kinn'), wa = v('wangen'), st = v('stirn'), ab = v('augenAbstand'), ag = v('augenGroesse'), br = v('brauen'), n = v('nase'), nb = v('naseBreite'), mw = v('mundBreite'), li = v('lippen'), Q = Float32Array.from(M);
  for (let i = 0; i < ANZAHL; i++) {
    const x = M[i * 3], y = M[i * 3 + 1], z = M[i * 3 + 2], ax = Math.abs(x), sg = x >= 0 ? 1 : -1;
    const unten = glatt((1.705 - y) / 0.05);
    let nx = x * (1 + 0.12 * b * unten), ny = y, nz = z;
    nx += x * 0.2 * ki * glatt((1.645 - y) / 0.04) * glatt((ax - 0.015) / 0.03);
    if (y < 1.625) ny -= 0.016 * c * (1.625 - y) / 0.04;
    const gw = Math.exp(-(((ax - 0.052) / 0.024) ** 2) - (((y - 1.655) / 0.024) ** 2)) * glatt((z - 0.02) / 0.03);
    nz += 0.007 * wa * gw; nx += sg * 0.005 * wa * gw;
    if (y > 1.725) ny += (y - 1.725) * 0.4 * st;
    const ga = Math.exp(-(((ax - 0.034) / 0.02) ** 2) - (((y - 1.699) / 0.014) ** 2));
    nx += sg * (0.005 * ab * ga + (ax - 0.034) * 0.22 * ag * ga); ny += (y - 1.699) * 0.22 * ag * ga;
    ny += 0.005 * br * Math.exp(-(((ax - 0.036) / 0.026) ** 2) - (((y - 1.726) / 0.01) ** 2));
    const g = Math.exp(-((x / 0.022) ** 2) - (((y - 1.652) / 0.03) ** 2)) * glatt((z - 0.06) / 0.03);
    nz += 0.012 * n * g; nx += x * 0.3 * n * g + x * 0.3 * nb * Math.exp(-((x / 0.024) ** 2) - (((y - 1.647) / 0.012) ** 2));
    const gm = Math.exp(-((x / 0.034) ** 2) - (((y - 1.6235) / 0.012) ** 2)), gl = Math.exp(-((x / 0.028) ** 2) - (((y - 1.6235) / 0.011) ** 2));
    nx += x * 0.24 * mw * gm; ny += (y - 1.6235) * 0.45 * li * gl; nz += 0.004 * li * gl;
    Q[i * 3] = nx; Q[i * 3 + 1] = ny; Q[i * 3 + 2] = nz;
  }
  return Q;
}
function formRechnen(figur, Z) {
  const k = figur.k, kopf = k.index.Head, netze = figur.kopfNetze, haut = netze.SuperHero_Male, roh = (m) => (k.form && m === haut ? k.form.ur : m.geometry.attributes.position.array);
  const P0 = roh(haut), n = P0.length / 3;
  // Stützpunkte: Gesicht plus Haltestellen an Hinterkopf, Scheitel und Hals. Sie ändern sich nie, nur die Ziele
  if (!figur.formStuetzen) {
    const gi = haut.geometry.attributes.skinIndex.array, gw = haut.geometry.attributes.skinWeight.array, ws = new Float32Array(n), halt = [], gitter = new Set();
    for (let i = 0; i < n; i++) {
      let w = 0; for (let j = 0; j < 4; j++) if (gi[i * 4 + j] === kopf) w += gw[i * 4 + j] / 255;
      ws[i] = w; if (w <= 0) continue;
      const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2];
      if (z >= 0.012 && y >= 1.565 && y <= 1.77) continue;
      const s = Math.round(x / 0.03) + ',' + Math.round(y / 0.03) + ',' + Math.round(z / 0.03);
      if (!gitter.has(s)) { gitter.add(s); halt.push(x, y, z); }
    }
    const pk = FORM_PUNKTE, N = pk.length + halt.length / 3, C = new Float64Array(N * 3);
    pk.forEach((i, q) => { for (let d = 0; d < 3; d++) C[q * 3 + d] = GESICHT_REF[i * 3 + d]; });
    for (let i = 0; i < halt.length; i++) C[pk.length * 3 + i] = halt[i];
    figur.formStuetzen = { ws, N, C, merk: {} };
  }
  const { ws, N, C, merk } = figur.formStuetzen, pk = FORM_PUNKTE, W = Float64Array.from(C);
  pk.forEach((i, q) => { for (let d = 0; d < 3; d++) W[q * 3 + d] = Z[i * 3 + d]; });
  const f = duennplatte(C, W, N, 0.004, merk), aus = [0, 0, 0];
  // Haut (mit Gewicht am Kopf), Brauen und Haare folgen, die Augäpfel gehen als Ganzes mit
  const setze = (m, gew) => {
    const P = roh(m), A = m.geometry.attributes.kopfForm, F = A.array, c = P.length / 3;
    for (let i = 0; i < c; i++) {
      const w = gew ? gew[i] : 1;
      if (w <= 0) { F[i * 3] = F[i * 3 + 1] = F[i * 3 + 2] = 0; continue; }
      f(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], aus);
      F[i * 3] = (aus[0] - P[i * 3]) * w; F[i * 3 + 1] = (aus[1] - P[i * 3 + 1]) * w; F[i * 3 + 2] = (aus[2] - P[i * 3 + 2]) * w;
    }
    A.needsUpdate = true;
  };
  setze(haut, ws); setze(netze.Eyebrows); setze(netze.Hair_Buzzed);
  const aug = netze.Eyes, Pa = aug.geometry.attributes.position.array, Fa = aug.geometry.attributes.kopfForm.array;
  const breite = (a, b, X) => Math.hypot(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]);
  for (const [sg, a, b] of [[-1, 33, 133], [1, 362, 263]]) {
    const cx = sg * 0.034, cy = 1.699, cz = 0.066, s = Math.max(0.85, Math.min(1.2, breite(a, b, Z) / breite(a, b, GESICHT_REF)));
    f(cx, cy, cz, aus);
    for (let i = 0; i < Pa.length / 3; i++) if (Pa[i * 3] * sg > 0) {
      Fa[i * 3] = aus[0] + (Pa[i * 3] - cx) * s - Pa[i * 3]; Fa[i * 3 + 1] = aus[1] + (Pa[i * 3 + 1] - cy) * s - Pa[i * 3 + 1]; Fa[i * 3 + 2] = aus[2] + (Pa[i * 3 + 2] - cz) * s - Pa[i * 3 + 2];
    }
  }
  aug.geometry.attributes.kopfForm.needsUpdate = true;
  // Normalen der Haut neu: verschweißte Punkte, nur wo sich etwas bewegt
  const g = haut.geometry, I = g.index.array, Fo = g.attributes.kopfForm.array, No = g.attributes.normal.array, q = g.attributes.normal.normalized ? 1 / 127 : 1, D = g.attributes.kopfNormD.array;
  if (!haut.userData.ortId) { const ort = new Map(), id = new Int32Array(n); let z = 0; for (let i = 0; i < n; i++) { const s = Math.round(P0[i * 3] * 1e5) + ',' + Math.round(P0[i * 3 + 1] * 1e5) + ',' + Math.round(P0[i * 3 + 2] * 1e5); let v = ort.get(s); if (v === undefined) ort.set(s, (v = z++)); id[i] = v; } haut.userData.ortId = id; haut.userData.ortN = z; }
  const id = haut.userData.ortId, NN = new Float64Array(haut.userData.ortN * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e = new THREE.Vector3(), r = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
    if (ws[i0] <= 0 && ws[i1] <= 0 && ws[i2] <= 0) continue;
    a.set(P0[i0 * 3] + Fo[i0 * 3], P0[i0 * 3 + 1] + Fo[i0 * 3 + 1], P0[i0 * 3 + 2] + Fo[i0 * 3 + 2]); b.set(P0[i1 * 3] + Fo[i1 * 3], P0[i1 * 3 + 1] + Fo[i1 * 3 + 1], P0[i1 * 3 + 2] + Fo[i1 * 3 + 2]); c.set(P0[i2 * 3] + Fo[i2 * 3], P0[i2 * 3 + 1] + Fo[i2 * 3 + 1], P0[i2 * 3 + 2] + Fo[i2 * 3 + 2]);
    e.copy(b).sub(a).cross(r.copy(c).sub(a));
    for (const v of [id[i0], id[i1], id[i2]]) { NN[v * 3] += e.x; NN[v * 3 + 1] += e.y; NN[v * 3 + 2] += e.z; }
  }
  for (let i = 0; i < n; i++) {
    if (ws[i] <= 0) { D[i * 3] = D[i * 3 + 1] = D[i * 3 + 2] = 0; continue; }
    const v = id[i] * 3, l = Math.hypot(NN[v], NN[v + 1], NN[v + 2]) || 1, w = Math.min(1, ws[i] * 1.5);
    for (let d = 0; d < 3; d++) D[i * 3 + d] = (NN[v + d] / l - No[i * 3 + d] * q) * w;
  }
  g.attributes.kopfNormD.needsUpdate = true;
}

/* ---------- Farbe ---------- */
// Grobe Farbverteilung aus dem Foto gegen die eigene Karte der Figur: Zeichnung der Karte bleibt, Ton kommt aus dem Foto. Um die Augen bleibt es wie gemalt (sonst wandern dunkle Schatten aufs Lid)
function hautKarte(figur) {
  if (figur.hautKarte) return figur.hautKarte;
  const im = figur.k.tex.haut.image, S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, S, S);
  return (figur.hautKarte = { S, d: x.getImageData(0, 0, S, S).data });
}
const zeigeLinear = (K, S, u, v, aus) => {
  const fx = Math.max(0, Math.min(S - 1.001, u * S - 0.5)), fy = Math.max(0, Math.min(S - 1.001, v * S - 0.5)), x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  for (let c = 0; c < 3; c++) { const a = K[(y0 * S + x0) * 4 + c], b = K[(y0 * S + x0 + 1) * 4 + c], d = K[((y0 + 1) * S + x0) * 4 + c], e = K[((y0 + 1) * S + x0 + 1) * 4 + c]; aus[c] = linear((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty); }
};
function farbeRechnen(figur, fund, passung, abgleich, muetze) {
  const haut = figur.kopfNetze.SuperHero_Male, g = haut.geometry, P = figur.k.form ? figur.k.form.ur : g.attributes.position.array, Fo = g.attributes.kopfForm.array, U = g.attributes.uv.array, N = g.attributes.normal.array, q = g.attributes.normal.normalized ? 1 / 127 : 1, FA = g.attributes.kopfFarbe.array, gi = g.attributes.skinIndex.array, gw = g.attributes.skinWeight.array, n = P.length / 3, kopf = figur.k.index.Head;
  const karte = hautKarte(figur), S = 64, z = document.createElement('canvas'); z.width = z.height = S; const zx = z.getContext('2d', { willReadFrequently: true }); zx.imageSmoothingQuality = 'high'; zx.drawImage(fund.c, 0, 0, S, S); const foto = zx.getImageData(0, 0, S, S).data;
  const { umriss, schleifen } = netz(), rc = randMaske(fund, umriss, muetze), rs = rc.width, rd = rc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, rs, rs).data;
  const pkt = fund.punkte, mitteAuge = (l) => { let x = 0, y = 0; for (const i of l) { x += pkt[i].x; y += pkt[i].y; } return [x / l.length, y / l.length]; }, ae = [mitteAuge(schleifen[2]), mitteAuge(schleifen[3])], ab = Math.hypot(pkt[33].x - pkt[133].x, pkt[33].y - pkt[133].y);
  const R = passung.R.clone().invert(), blick = new THREE.Vector3(0, 0, 1).applyQuaternion(passung.R), p = new THREE.Vector3(), nn = new THREE.Vector3(), a = [0, 0, 0], b = [0, 0, 0], C = abgleich.C, T = abgleich.T, stapel = [[], [], []], liste = [];
  for (let i = 0; i < n; i++) {
    let k = 0; for (let j = 0; j < 4; j++) if (gi[i * 4 + j] === kopf) k += gw[i * 4 + j] / 255;
    FA[i * 3] = FA[i * 3 + 1] = FA[i * 3 + 2] = 1;
    if (k < 0.5) continue;
    p.set(P[i * 3] + Fo[i * 3] - passung.mb[0], P[i * 3 + 1] + Fo[i * 3 + 1] - passung.mb[1], P[i * 3 + 2] + Fo[i * 3 + 2] - passung.mb[2]).applyQuaternion(R).multiplyScalar(1 / passung.s);
    const x = p.x + passung.ma[0], y = -(p.y + passung.ma[1]);
    if (x <= 0 || y <= 0 || x >= 1 || y >= 1) continue;
    nn.set(N[i * 3] * q, N[i * 3 + 1] * q, N[i * 3 + 2] * q);
    const auge = Math.min(Math.hypot(x - ae[0][0], y - ae[0][1]), Math.hypot(x - ae[1][0], y - ae[1][1])) / ab;
    let w = rd[(Math.floor(y * rs) * rs + Math.floor(x * rs)) * 4] / 255;
    w *= glatt((nn.dot(blick) - 0.25) / 0.3) * glatt((auge - 0.62) / 0.4);
    if (w <= 0.01) continue;
    zeigeLinear(foto, S, x, y, a); zeigeLinear(karte.d, karte.S, U[i * 2], U[i * 2 + 1], b);
    const v = [0, 1, 2].map((c) => a[c] * C[c] / (Math.max(0.01, b[c]) * T[c]));
    liste.push([i, w, v]);
    if (w > 0.6) for (let c = 0; c < 3; c++) stapel[c].push(v[c]);
  }
  const mitte = stapel.map((l) => { if (!l.length) return 1; l.sort((x, y) => x - y); return Math.max(0.5, Math.min(2, l[Math.floor(l.length / 2)])); });
  for (let c = 0; c < 3; c++) T[c] *= mitte[c];
  for (const [i, w, v] of liste) for (let c = 0; c < 3; c++) { const q = Math.max(0.6, Math.min(1.6, v[c] / mitte[c])); FA[i * 3 + c] = 1 + (q - 1) * w * 0.85; }
  g.attributes.kopfFarbe.needsUpdate = true;
}
// Augenfarbe: Ring um die Pupille (Iris-Punkte 468–477), Brauen: ihr dunklerer Teil
function fleckMedian(x, K, px, py, r, anteil = 0.5) {
  px = Math.round(px * K); py = Math.round(py * K); r = Math.max(1, Math.round(r));
  if (px < r || py < r || px >= K - r || py >= K - r) return null;
  const d = x.getImageData(px - r, py - r, 2 * r, 2 * r).data, w = [[], [], []];
  for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) w[c].push(d[i + c]);
  return w.map((l) => { l.sort((p, q) => p - q); return linear(l[Math.floor(l.length * anteil)]); });
}
export function messeAugenBrauen(fund) {
  const x = fund.c.getContext('2d', { willReadFrequently: true }), K = fund.kante, p = fund.punkte, iris = [], brauen = [], mittel = (L) => { const a = [0, 0, 0]; for (const c of L) for (let i = 0; i < 3; i++) a[i] += c[i] / L.length; return a; };
  if (p.length > 473) for (const [m, ring] of [[468, [469, 470, 471, 472]], [473, [474, 475, 476, 477]]]) {
    const rad = ring.reduce((s, i) => s + Math.hypot(p[i].x - p[m].x, p[i].y - p[m].y), 0) / 4;
    for (const i of ring) { const c = fleckMedian(x, K, p[m].x + (p[i].x - p[m].x) * 0.62, p[m].y + (p[i].y - p[m].y) * 0.62, Math.max(1, rad * K * 0.18)); if (c) iris.push(c); }
  }
  for (const i of [105, 66, 334, 296, 52, 282, 65, 295]) { const c = fleckMedian(x, K, p[i].x, p[i].y, Math.max(1, K * 0.004), 0.35); if (c) brauen.push(c); }
  return { iris: iris.length ? mittel(iris) : null, brauen: brauen.length ? mittel(brauen) : null };
}

// Haare und Brauen: Licht im Studio färbt sie gern rot; Kanäle wie bei echtem Haar begrenzen
function natuerlich(c) { const g = Math.max(0.002, c[1]), rg = Math.max(1, Math.min(2.2, c[0] / g)), bg = Math.max(0.3, Math.min(1, c[2] / g)), h = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], n = h / (0.2126 * rg + 0.7152 + 0.0722 * bg); return [rg * n, n, bg * n]; }
const haarWert = (c) => c.map((v) => v / 0.3), brauenWert = (c) => c.map((v) => v / 0.2);

/* ---------- Alles zusammen ---------- */
// fund, passung aus gesicht.js; o: { hut, arm }. Merkt sich den Zustand für die Regler
export function bauen(figur, fund, passung, o = {}) {
  vorbereiten(figur);
  const abgleich = farbAbgleich(fund, o.arm) || { C: [1, 1, 1], T: [1, 0.949, 0.918], ziel: null }, muetze = o.hut ? muetzenRand(fund) : null;
  formRechnen(figur, mitReglern(passung.M, o.regler));
  farbeRechnen(figur, fund, passung, abgleich, muetze);
  // Mund zu, Mütze und Haare
  const netze = figur.kopfNetze, gem = messeAugenBrauen(fund);
  if (!figur.farbenUr) figur.farbenUr = { haut: figur.koerperMesh.material.color.clone(), haar: netze.Hair_Buzzed.material.color.clone(), brauen: netze.Eyebrows.material.color.clone() };
  figur.koerperMesh.material.color.setRGB(abgleich.T[0], abgleich.T[1], abgleich.T[2]);
  if (gem.iris) { const v = Math.max(0.035, 0.2126 * gem.iris[0] + 0.7152 * gem.iris[1] + 0.0722 * gem.iris[2]), n = natuerlich(gem.iris), f = v / Math.max(0.002, 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]); UNI.uIris.value.setRGB(n[0] * f, n[1] * f, n[2] * f); irisGemessen = true; }
  if (gem.brauen) netze.Eyebrows.material.color.setRGB(...brauenWert(natuerlich(gem.brauen)));
  figur.hut.visible = !!o.hut; netze.Hair_Buzzed.visible = !o.hut; if (figur.haarAnzeige) figur.haarAnzeige();
  const h = !o.hut ? haarFarbe(fund) : null;
  if (h) netze.Hair_Buzzed.material.color.setRGB(...haarWert(natuerlich(h)));
  figur.hutHoch = 0;
  if (muetze) { const M = passung.M, y = M[9 * 3 + 1] + muetze.t * (M[10 * 3 + 1] - M[9 * 3 + 1]); figur.hutHoch = Math.max(-0.005, Math.min(0.035, y - 1.7133)); }
  huetchenMit(figur);
  figur.charakterKopf = { passung, regler: o.regler || {}, abgleich, gem };
  return figur.charakterKopf;
}
const _hoch = new THREE.Matrix4();
// Mütze wandert mit (wie der Rand im Foto)
function huetchenMit(figur) {
  if (figur.stelleOhneCharakter) return;
  figur.stelleOhneCharakter = figur.stelle;
  figur.stelle = function (g) { const b = this.stelleOhneCharakter(g); if (this.hutHoch && !this.hutFest && UNI.uCharakter.value > 0) this.hut.matrix.multiply(_hoch.makeTranslation(0, this.hutHoch * UNI.uCharakter.value, 0)); return b; };
}
// Ohne Foto: die Figur selbst ist der Ausgangspunkt, die Regler formen von dort
function ohneFoto(figur) { huetchenMit(figur); figur.hutHoch = 0; return (figur.charakterKopf = { passung: { M: GESICHT_REF }, regler: {}, ohneFoto: true }); }
// Regler im Editor: nur die Form neu, geht auch ganz ohne Foto
export function regler(figur, werte) {
  vorbereiten(figur);
  const z = figur.charakterKopf || ohneFoto(figur);
  z.regler = werte; formRechnen(figur, mitReglern(z.passung.M, werte));
}
export function irisFarbe(hex) { UNI.uIris.value.set(hex); }
export const irisWert = () => '#' + UNI.uIris.value.getHexString();

/* ---------- Editor und Speichern ---------- */
export const netzVon = (figur, name) => figur.kopfNetze[name];
export function setzeMuetze(figur, an) { figur.hut.visible = an; figur.kopfNetze.Hair_Buzzed.visible = !an; if (figur.haarAnzeige) figur.haarAnzeige(); }
export function setzeIris(hex) { UNI.uIris.value.set(hex); UNI.uIrisAn.value = 1; irisGemessen = true; }
export const irisHex = () => '#' + UNI.uIris.value.getHexString();
// Der Charakter ohne Foto: Punkte der Form, Farben je Kopfpunkt als Bytes. Das ist alles, was zum Anzeigen nötig ist
const zuB64 = (b) => { let t = ''; for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(t); };
const ausB64 = (t) => { const s2 = atob(t), b = new Uint8Array(s2.length); for (let i = 0; i < s2.length; i++) b[i] = s2.charCodeAt(i); return b; };
function kopfIndizes(figur) {
  const g = figur.kopfNetze.SuperHero_Male.geometry, gi = g.attributes.skinIndex.array, gw = g.attributes.skinWeight.array, kopf = figur.k.index.Head, c = g.attributes.position.count, aus = [];
  for (let i = 0; i < c; i++) { let k = 0; for (let j = 0; j < 4; j++) if (gi[i * 4 + j] === kopf) k += gw[i * 4 + j] / 255; if (k >= 0.5) aus.push(i); }
  return aus;
}
export function sichern(figur) {
  const z = figur.charakterKopf; if (!z) return null;
  if (z.ohneFoto) return { ohneFoto: true, regler: z.regler || {} };
  const FA = figur.kopfNetze.SuperHero_Male.geometry.attributes.kopfFarbe.array, ix = kopfIndizes(figur), b = new Uint8Array(ix.length * 3);
  ix.forEach((i, q) => { for (let c = 0; c < 3; c++) b[q * 3 + c] = Math.max(0, Math.min(255, Math.round(FA[i * 3 + c] * 100))); });
  return { M: Array.from(z.passung.M, (v) => +v.toFixed(4)), farbe: zuB64(b), regler: z.regler || {}, hutHoch: figur.hutHoch || 0, iris: irisGemessen };
}
export function wiederherstellen(figur, d) {
  vorbereiten(figur);
  if (d.ohneFoto) { regler(figur, d.regler); setzeStaerke(1); return; }
  const passung = { M: d.form ? formAusKurz(d.form) : Float32Array.from(d.M) };
  formRechnen(figur, mitReglern(passung.M, d.regler));
  const g = figur.kopfNetze.SuperHero_Male.geometry, FA = g.attributes.kopfFarbe.array, ix = kopfIndizes(figur);
  if (d.raster) farbeAusKurz(figur, d.raster, ix);
  else { const b = ausB64(d.farbe); ix.forEach((i, q) => { for (let c = 0; c < 3; c++) FA[i * 3 + c] = b[q * 3 + c] / 100; }); }
  g.attributes.kopfFarbe.needsUpdate = true;
  figur.hutHoch = d.hutHoch || 0; irisGemessen = !!d.iris;
  huetchenMit(figur);
  figur.charakterKopf = { passung, regler: d.regler || {} };
  setzeStaerke(1);
}

/* ---------- Kurzform für den Kundenlink ---------- */
// Der Link soll kurz bleiben, darum ein Zeichen je Wert, und zwar nur der Schritt zum Nachbarn: Das packt sich gut. Mitgerechnet wird, was beim Entpacken herauskommt, so laufen die Rundungen nicht weg.
// Form: Abstand der tragenden Punkte zur Figur, von oben nach unten. Farbe: grobes Raster in der Vorderansicht (1 cm), zu den Seiten läuft sie aus wie beim Messen. Haut, Augen und Haare stehen sowieso als Farbe dabei
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_', FORM_SCHRITT = 0.0005, FARBE_SCHRITT = 0.02, RASTER = { x0: -0.1, y0: 1.54, d: 0.01, sp: 21, ze: 29 };
function zuZeichen(werte, schritt) { let alt = 0, t = ''; for (const v of werte) { const q = Math.max(-32, Math.min(31, Math.round((v - alt) / schritt))); alt += q * schritt; t += ABC[q + 32]; } return t; }
function ausZeichen(t, schritt) { const a = new Float32Array(t.length); let alt = 0; for (let i = 0; i < t.length; i++) { alt += (ABC.indexOf(t[i]) - 32) * schritt; a[i] = alt; } return a; }
const KURZ_PUNKTE = [...new Set([...FORM_PUNKTE, 33, 133, 362, 263])].sort((a, b) => Math.round(GESICHT_REF[b * 3 + 1] / 0.008) - Math.round(GESICHT_REF[a * 3 + 1] / 0.008) || GESICHT_REF[a * 3] - GESICHT_REF[b * 3]);
function formZuKurz(M) { let t = ''; for (let d = 0; d < 3; d++) t += zuZeichen(KURZ_PUNKTE.map((i) => M[i * 3 + d] - GESICHT_REF[i * 3 + d]), FORM_SCHRITT); return t; }
function formAusKurz(t) { const M = Float32Array.from(GESICHT_REF), n = KURZ_PUNKTE.length; for (let d = 0; d < 3; d++) { const a = ausZeichen(t.slice(d * n, (d + 1) * n), FORM_SCHRITT); KURZ_PUNKTE.forEach((i, q) => { M[i * 3 + d] += a[q]; }); } return M; }
// Schlangenlinie durchs Raster, damit auch am Zeilenende der Nachbar nah ist
const rasterStelle = (q) => { const z = Math.floor(q / RASTER.sp), s = q - z * RASTER.sp; return z * RASTER.sp + (z % 2 ? RASTER.sp - 1 - s : s); };
const kopfLage = (figur) => { const g = figur.kopfNetze.SuperHero_Male.geometry; return { P: figur.k.form ? figur.k.form.ur : g.attributes.position.array, N: g.attributes.normal.array, q: g.attributes.normal.normalized ? 1 / 127 : 1 }; };
function farbeZuKurz(figur, ix) {
  const { P, N, q } = kopfLage(figur), FA = figur.kopfNetze.SuperHero_Male.geometry.attributes.kopfFarbe.array, { x0, y0, d, sp, ze } = RASTER, S = new Float32Array(sp * ze * 3), W = new Float32Array(sp * ze);
  for (const i of ix) {
    const w = glatt((N[i * 3 + 2] * q - 0.5) / 0.25); if (w <= 0) continue;
    const gx = (P[i * 3] - x0) / d, gy = (P[i * 3 + 1] - y0) / d, x = Math.floor(gx), y = Math.floor(gy), tx = gx - x, ty = gy - y;
    if (x < 0 || y < 0 || x >= sp - 1 || y >= ze - 1) continue;
    for (const [a, b, g] of [[x, y, (1 - tx) * (1 - ty)], [x + 1, y, tx * (1 - ty)], [x, y + 1, (1 - tx) * ty], [x + 1, y + 1, tx * ty]]) { const o = b * sp + a; W[o] += w * g; for (let c = 0; c < 3; c++) S[o * 3 + c] += w * g * (FA[i * 3 + c] - 1); }
  }
  for (let o = 0; o < sp * ze; o++) if (W[o] > 0) for (let c = 0; c < 3; c++) S[o * 3 + c] /= W[o];
  // Stellen ohne Punkt nehmen den Wert der Nachbarn, sonst liefe die Farbe zum Rand hin falsch aus
  for (let r = 0; r < 3; r++) { const W2 = W.slice(), S2 = S.slice(); for (let y = 0; y < ze; y++) for (let x = 0; x < sp; x++) { const o = y * sp + x; if (W[o] > 0) continue; let z = 0; const a = [0, 0, 0]; for (const [e, f] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const u = x + e, v = y + f; if (u < 0 || v < 0 || u >= sp || v >= ze) continue; const p = v * sp + u; if (W[p] > 0) { z++; for (let c = 0; c < 3; c++) a[c] += S[p * 3 + c]; } } if (z) { W2[o] = 1; for (let c = 0; c < 3; c++) S2[o * 3 + c] = a[c] / z; } } W.set(W2); S.set(S2); }
  let t = ''; for (let c = 0; c < 3; c++) { const l = new Array(sp * ze); for (let q2 = 0; q2 < sp * ze; q2++) l[q2] = S[rasterStelle(q2) * 3 + c]; t += zuZeichen(l, FARBE_SCHRITT); }
  return t;
}
function farbeAusKurz(figur, t, ix) {
  const { P, N, q } = kopfLage(figur), FA = figur.kopfNetze.SuperHero_Male.geometry.attributes.kopfFarbe.array, { x0, y0, d, sp, ze } = RASTER, S = new Float32Array(sp * ze * 3);
  for (let c = 0; c < 3; c++) { const a = ausZeichen(t.slice(c * sp * ze, (c + 1) * sp * ze), FARBE_SCHRITT); for (let q2 = 0; q2 < sp * ze; q2++) S[rasterStelle(q2) * 3 + c] = a[q2]; }
  for (const i of ix) {
    const w = glatt((N[i * 3 + 2] * q - 0.25) / 0.3), gx = (P[i * 3] - x0) / d, gy = (P[i * 3 + 1] - y0) / d, x = Math.floor(gx), y = Math.floor(gy), tx = gx - x, ty = gy - y;
    for (let c = 0; c < 3; c++) {
      if (w <= 0 || x < 0 || y < 0 || x >= sp - 1 || y >= ze - 1) { FA[i * 3 + c] = 1; continue; }
      const o = y * sp + x, v = (S[o * 3 + c] * (1 - tx) + S[(o + 1) * 3 + c] * tx) * (1 - ty) + (S[(o + sp) * 3 + c] * (1 - tx) + S[(o + sp + 1) * 3 + c] * tx) * ty;
      FA[i * 3 + c] = 1 + v * w;
    }
  }
}
// Was in den Kundenlink kommt. Die Regler stehen bei den übrigen Werten
export function sichernKurz(figur) {
  const z = figur.charakterKopf; if (!z) return null;
  if (z.ohneFoto) return { ohneFoto: true };
  return { form: formZuKurz(z.passung.M), raster: farbeZuKurz(figur, kopfIndizes(figur)), hutHoch: Math.round((figur.hutHoch || 0) * 1e4) / 1e4, iris: irisGemessen ? 1 : 0 };
}
