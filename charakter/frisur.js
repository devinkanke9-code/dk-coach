// DK Coach — Frisur des Charakters: Glatze bis volles Haar. Haar sind viele Schalen über der Kappe der Figur (wie Fell in Spielen): je höher die Schale, desto weniger und dünnere Strähnen stehen.
// Kurz steht es ab, lang legt es sich vom Wirbel weg nach unten. Die Schalen nutzen die Punkte der Kappe mit, dadurch folgen sie von selbst dem Kopfknochen und der Kopfform aus dem Foto
import * as THREE from 'three';
import { patche } from './charakter.js';

const SCHALEN = 20, UNI = { uHaarLang: { value: 0 }, uHaarSeite: { value: 0.6 }, uHaarZahl: { value: SCHALEN } };
const glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

const VERTEX_PARS = `
attribute float schale;
attribute vec3 haarN;
attribute vec3 haarK;
attribute vec2 haarW;
uniform float uHaarLang;
uniform float uHaarSeite;
uniform float uHaarZahl;
varying float vSchale;
`;
const VERSATZ = `
vSchale = (schale + 1.0) / uHaarZahl;
{
  float dkL = uHaarLang * haarW.x * mix(uHaarSeite, 1.0, haarW.y);
  float dkLegt = smoothstep(0.012, 0.055, uHaarLang);
  transformed += haarN * dkL * vSchale * mix(1.0, mix(0.24, 0.42, haarW.y), dkLegt) + haarK * dkL * vSchale * vSchale * mix(0.15, 1.0, dkLegt);
}
`;
const FRAGMENT_PARS = `
varying float vSchale;
`;
// Zelle je Strähne: Richtung vom Kopfmittelpunkt, achtflächig aufgefaltet (kein Pol am Scheitel). Sind die Zellen kleiner als ein Bildpunkt, bleibt eine dichte Fläche statt Flimmern
const STRAEHNEN = `
{
  vec3 dkD = normalize(vRuhe - vec3(0.0, 1.66, -0.015));
  dkD /= abs(dkD.x) + abs(dkD.y) + abs(dkD.z);
  vec2 dkQ = dkD.y >= 0.0 ? dkD.xz : (1.0 - abs(dkD.zx)) * vec2(dkD.x >= 0.0 ? 1.0 : -1.0, dkD.z >= 0.0 ? 1.0 : -1.0);
  vec2 dkZ = dkQ * 92.0 + vec2(sin(dkQ.y * 31.0), sin(dkQ.x * 29.0)) * 0.7;
  vec2 dkId = floor(dkZ), dkF = fract(dkZ) - 0.5;
  float dkR = fract(sin(dot(dkId, vec2(127.1, 311.7))) * 43758.5453), dkR2 = fract(sin(dot(dkId, vec2(269.5, 183.3))) * 43758.5453);
  float dkFern = smoothstep(0.55, 1.5, fwidth(dkZ.x) + fwidth(dkZ.y));
  float dkHoch = mix(0.5 + 0.5 * dkR, 0.9, dkFern), dkS = vSchale / dkHoch;
  if (dkS > 1.0) discard;
  float dkDick = mix(0.68 * (1.0 - dkS * dkS * dkS * 0.82), 1.0, dkFern);
  dkF += (vec2(dkR2, dkR) - 0.5) * 0.28 * (1.0 - dkFern);
  if (dot(dkF, dkF) > dkDick * dkDick * 0.25) discard;
  diffuseColor.rgb *= 0.3 * mix(0.42, 1.14, vSchale) * mix(0.8 + 0.42 * dkR2, 1.0, dkFern);
}
`;

function kappenWerte(g) {
  const P = g.attributes.position, I = g.index.array, n = P.count, nb = Array.from({ length: n }, () => new Set()), kanten = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + (e + 1) % 3], s = a < b ? a * n + b : b * n + a;
    nb[a].add(b); nb[b].add(a); kanten.set(s, (kanten.get(s) || 0) + 1);
  }
  // Abstand zum Rand der Kappe (m): dort läuft das Haar auf null aus
  const ab = new Float32Array(n).fill(9), p = (i) => new THREE.Vector3().fromBufferAttribute(P, i);
  for (const [s, z] of kanten) if (z === 1) { ab[Math.floor(s / n)] = 0; ab[s % n] = 0; }
  for (let r = 0; r < 14; r++) for (let v = 0; v < n; v++) for (const u of nb[v]) { const d = ab[u] + p(u).distanceTo(p(v)); if (d < ab[v]) ab[v] = d; }
  // Glatte Normalen aus den Dreiecken, zeigen vom Kopf weg
  const N = new Float32Array(n * 3), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let t = 0; t < I.length; t += 3) {
    const a = p(I[t]); e1.copy(p(I[t + 1])).sub(a); e2.copy(p(I[t + 2])).sub(a); e1.cross(e2);
    for (let k = 0; k < 3; k++) { N[I[t + k] * 3] += e1.x; N[I[t + k] * 3 + 1] += e1.y; N[I[t + k] * 3 + 2] += e1.z; }
  }
  const K = new Float32Array(n * 3), W = new Float32Array(n * 2), mitte = new THREE.Vector3(0, 1.67, -0.015), wirbel = new THREE.Vector3(0, 1.8, -0.05), nn = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const v = p(i); nn.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).normalize();
    if (nn.dot(q.copy(v).sub(mitte)) < 0) nn.negate();
    N[i * 3] = nn.x; N[i * 3 + 1] = nn.y; N[i * 3 + 2] = nn.z;
    // Strich: vom Wirbel weg, an der Oberfläche entlang und etwas nach unten
    q.copy(v).sub(wirbel); q.addScaledVector(nn, -q.dot(nn)); if (q.lengthSq() < 1e-6) q.set(0, 0, 1); q.normalize().multiplyScalar(0.7); q.y -= 0.6; q.addScaledVector(nn, -0.5 * q.dot(nn)); q.normalize();
    K[i * 3] = q.x; K[i * 3 + 1] = q.y; K[i * 3 + 2] = q.z;
    W[i * 2] = glatt(ab[i] / 0.03); W[i * 2 + 1] = glatt((v.y - 1.71) / 0.06);
  }
  return { N, K, W };
}

export function vorbereiten(figur) {
  if (figur.schalen) return;
  const kappe = figur.kopfNetze.Hair_Buzzed, q = kappe.geometry, g = new THREE.InstancedBufferGeometry(), { N, K, W } = kappenWerte(q);
  for (const name of Object.keys(q.attributes)) g.setAttribute(name, q.attributes[name]);
  g.setIndex(q.index);
  g.setAttribute('haarN', new THREE.BufferAttribute(N, 3)); g.setAttribute('haarK', new THREE.BufferAttribute(K, 3)); g.setAttribute('haarW', new THREE.BufferAttribute(W, 2));
  g.setAttribute('schale', new THREE.InstancedBufferAttribute(Float32Array.from({ length: SCHALEN }, (_, i) => i), 1));
  g.instanceCount = SCHALEN;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, side: THREE.DoubleSide });
  mat.defines = Object.assign({}, mat.defines, { DK_HAAR: 1 });
  mat.color = kappe.material.color;   // dieselbe Farbe wie die Kappe: Editor und Foto stellen nur dort ein
  mat.onBeforeCompile = (s) => figur.shader(s);
  patche(mat, 'schale');
  const alt = mat.onBeforeCompile, schluessel = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = (s, r) => {
    alt.call(mat, s, r);
    Object.assign(s.uniforms, UNI);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + VERTEX_PARS).replace('#include <skinning_vertex>', VERSATZ + '#include <skinning_vertex>');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAGMENT_PARS).replace('#include <map_fragment>', STRAEHNEN);
  };
  mat.customProgramCacheKey = () => schluessel + '|schalen';
  const m = new THREE.SkinnedMesh(g, mat);
  m.bindMode = 'detached'; m.bind(figur.skelett, new THREE.Matrix4());
  m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.visible = false;
  figur.gruppe.add(m);
  figur.schalen = m;
  figur.haarAnzeige = () => {
    const cm = figur.haarCm == null ? 0.6 : figur.haarCm, hut = figur.hut.visible;
    kappe.visible = !hut && cm > 0;
    m.visible = !hut && cm >= 0.3 && !figur.haarAus;
  };
  figur.haarAnzeige();
}
// cm: 0 = Glatze, unter 0,3 nur die Kappe, darüber Strähnen. Lang wird es auch an den Seiten länger
export function setzeLaenge(figur, cm) {
  vorbereiten(figur);
  figur.haarCm = cm;
  const zahl = Math.max(8, Math.min(SCHALEN, Math.round(6 + cm * 4)));
  UNI.uHaarLang.value = cm / 100; UNI.uHaarSeite.value = 0.42 + 0.48 * glatt(cm / 6); UNI.uHaarZahl.value = zahl;
  figur.schalen.geometry.instanceCount = zahl;
  figur.haarAnzeige();
}
// Während der Analyse aus: die Messung soll den Kopf sehen, nicht die Haare
export function zeitweiseAus(figur, aus) { if (!figur.schalen) return; figur.haarAus = aus; figur.haarAnzeige(); }
