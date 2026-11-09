// DK Coach — echtere 3D-Figur: ein durchgehender Körper mit Haut, Gesicht und Haaren (Quaternius-Sportler, CC0)
// statt einzelner Formen. Die Bewegung kommt weiter aus gelenke() in figur.js; hier wird jeder Knochen so gelegt,
// dass er genau zwischen den Gelenkpunkten liegt (gedreht und auf die Länge gestreckt).
// Gleiche Schnittstelle wie class Figur: gruppe, teile, markiere, hebeHervor, matHinweis, glut, stelle(g).
// koerper.bin und koerper-*.jpg baut kunden-app/modelle/umwandeln.js. Die Punkte liegen dort in der Ruhelage
// (T-Pose, Blick nach +Z, linke Seite +X, Meter), darum ist jede Knochen-Matrix direkt die Abbildung Ruhelage → jetzt.
import * as THREE from 'three';
import { FARBEN, LEUCHTET_MIT, MASS, GRIFF_R, UNTERARM_MAX, wirbelRahmen, wirbelBogen } from './figur.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

/* ---------- Laden ---------- */
let laden = null, geladen = null;
export const koerper = () => geladen;
// url = koerper.bin, oder koerper.txt (derselbe Inhalt als Base64: claude.ai liefert keine .bin-Dateien aus, darum nimmt die Trainer-Seite die .txt)
export function ladeKoerper(url = 'koerper.bin') {
  const ausBase64 = (t) => { const s = atob(t.trim()), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b.buffer; };
  if (!laden) laden = fetch(url).then((r) => { if (!r.ok) throw new Error(url + ': ' + r.status); return /\.txt$/.test(url) ? r.text().then(ausBase64) : r.arrayBuffer(); })
    .then(async (b) => { const k = liesKoerper(b); await ladeTexturen(k, new URL(url, location.href)); return (geladen = k); });
  return laden;
}
export function liesKoerper(buf) {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'DKK2') throw new Error('koerper.bin: falsches Format');
  const n = dv.getUint32(4, true);
  const kopf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, n)));
  const basis = 8 + n, { min, max } = kopf;
  const ent = (q, lo, hi, k) => lo[k] + (q / 65535) * (hi[k] - lo[k]);
  const meshes = kopf.meshes.map((m) => {
    const q = new Uint16Array(buf, basis + m.pos, m.punkte * 3), pos = new Float32Array(m.punkte * 3);
    for (let k = 0; k < pos.length; k++) pos[k] = ent(q[k], min, max, k % 3);
    const qu = new Uint16Array(buf, basis + m.uv, m.punkte * 2), uv = new Float32Array(m.punkte * 2);
    for (let k = 0; k < uv.length; k++) uv[k] = ent(qu[k], m.uvMin, m.uvMax, k % 2);
    return {
      name: m.name, mat: m.mat,
      pos: new THREE.BufferAttribute(pos, 3), uv: new THREE.BufferAttribute(uv, 2),
      nor: new THREE.BufferAttribute(new Int8Array(buf, basis + m.nor, m.punkte * 3), 3, true),
      gel: new THREE.BufferAttribute(new Uint8Array(buf, basis + m.gel, m.punkte * 4), 4),
      gew: new THREE.BufferAttribute(new Uint8Array(buf, basis + m.gew, m.punkte * 4), 4, true),
      kleid: new THREE.BufferAttribute(new Uint8Array(buf, basis + m.kleid, m.punkte * 2), 2, true),
      idx: new THREE.BufferAttribute(new Uint16Array(buf, basis + m.idx, m.dreiecke * 3), 1),
      teil: new Uint8Array(buf, basis + m.teil, m.punkte)
    };
  });
  const index = {}; kopf.knochen.forEach((k, i) => { index[k.n] = i; });
  return { knochen: kopf.knochen.map((k) => ({ name: k.n, eltern: k.e, p: V(...k.p) })), index, teile: kopf.teile, texturen: kopf.texturen, meshes };
}
// Texturen wie glTF: nicht gespiegelt (flipY aus), Farbe in sRGB, Normalen linear
async function ladeTexturen(k, basis) {
  const lader = new THREE.TextureLoader();
  k.tex = {};
  await Promise.all(k.texturen.map(async (datei) => {
    const t = await lader.loadAsync(new URL(datei, basis).href);
    t.flipY = false; t.anisotropy = 4;
    if (!datei.endsWith('-n.jpg')) t.colorSpace = THREE.SRGBColorSpace;
    k.tex[datei.replace(/^koerper-|\.jpg$/g, '')] = t;
  }));
}

/* ---------- Abbildung eines Knochens ---------- */
// M = T(p1) · B1 · S · B0ᵀ · T(−P0): Ruhe-Ursprung P0 → p1, Ruhe-Basis B0 → B1, S streckt in den Achsen von B0
const _B0 = new THREE.Matrix4(), _B1 = new THREE.Matrix4(), _S = new THREE.Matrix4(), _T = new THREE.Matrix4();
function basis(m, x, y) { const z = x.clone().cross(y); return m.makeBasis(x, y, z); }
function abbilden(out, P0, x0, y0, p1, x1, y1, sx = 1, sy = 1, sz = 1) {
  basis(_B0, x0, y0).transpose(); basis(_B1, x1, y1);
  out.makeTranslation(p1.x, p1.y, p1.z).multiply(_B1).multiply(_S.makeScale(sx, sy, sz)).multiply(_B0).multiply(_T.makeTranslation(-P0.x, -P0.y, -P0.z));
  return out;
}
// Drehung um einen Punkt (in Ruhe-Koordinaten): für Finger- und Zehenkrümmung
function umPunkt(P, achse, winkel) {
  return new THREE.Matrix4().makeTranslation(P.x, P.y, P.z).multiply(_T.makeRotationAxis(achse, winkel)).multiply(new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z));
}
// Anteil von v senkrecht zu d (normiert); ersatz, wenn v fast parallel zu d liegt
function senkrecht(v, d, ersatz) {
  const s = v.clone().sub(d.clone().multiplyScalar(v.dot(d)));
  if (s.lengthSq() > 1e-10) return s.normalize();
  return ersatz ? senkrecht(ersatz, d, null) : (Math.abs(d.y) < 0.9 ? senkrecht(V(0, 1, 0), d, null) : senkrecht(V(0, 0, 1), d, null));
}
const richt = (A, B) => B.clone().sub(A).normalize();

/* ---------- Körperform (Verhältnis zur Ruhelage des Modells) ---------- */
// Körperbau wie Devin im Video (1.11.: „1:1 … Muskelaufbau, Körpergröße, Breite“; davor 29.10. „größere Brust, breiter“): breite/tiefe je
// Rumpfknochen gegenüber dem Sportler-Modell – weniger V als dessen Heldenform, Taille und Hüfte kräftiger, Brust etwas tiefer;
// kopf = Kopfgröße (jüngere Proportionen). Die Schulterknochen bekommen ihre Breite aus MASS.schulterBreite, damit die Arme
// genau an den Gelenkpunkten ansetzen. arm/bein = Dicke. brust = wie stark sich die Brust beim Drücken zusammenzieht und beim Absenken dehnt.
// hals = so viel sitzt der Kopf tiefer als im Modell (m): Devin, 1.11. abends „Körper kürzer … 1,80 Meter“ (vorher 1,825 m Sohle bis
// Scheitel; die Gelenke bleiben, sonst passten die Übungen nicht mehr). Danach Look wie eine Spielfigur (Devin: „wie Fortnite-Skins …
// sportlich athletischer Körper“, gewählt Muster B, eigener Look): athletisches V – Schultern, obere Brust und Lat breiter, Taille
// schmaler, Arme und Beine kräftiger
// Exportiert, damit die Werkstatt ihn einstellen kann
export const BAU = {
  breite: { Root: 0.98, Hips: 1.0, Spine: 1.0, Spine1: 1.1, Spine2: 1.14, Neck: 1.06 },
  tiefe: { Root: 1.0, Hips: 1.0, Spine: 1.02, Spine1: 1.08, Spine2: 1.12, LeftShoulder: 1.08, RightShoulder: 1.08, Neck: 1.04 },
  arm: 1.12, bein: 1.1, brust: 2, kopf: 1.03, hals: 0.018
};
// Schulter der Haut (nur Optik, 9.11.2026; Devin: „Bei Squats sieht es aus, als ob die Schultern verrenkt sind … ein bisschen breiter lassen … generell bei jeder Übung“). Zeigt der Arm nach vorn oder hinten, trägt er seitlich
// nicht mehr auf, und die Schulter wirkt schmal (Silhouette von hinten auf Schulterhöhe bis 14 % unter dem Stand, gemessen mit messe-schultern.mjs). Darum sitzt der Armknochen der HAUT etwas weiter außen im Rumpfrahmen und zeigt
// weiter zum echten Ellbogen: der Deltamuskel ist breiter, der Arm läuft zum Ellbogen hin in die alte Linie zurück. Gelenke, Hände, Griffe und Geräte bleiben, wo die Vorlage sie hinlegt (Fingerabdrücke: 0 von 318 Übungen anders).
// breit = immer, in m (bei anderer MASS.schulterBreite im gleichen Verhältnis); vorn = zusätzlich, wenn der Oberarm nach vorn oder hinten zeigt (Goblet, Frontkniebeuge, Rudern, Seitlage); dazu der Ausgleich, wenn das
// Schlüsselbein den Arm hebt (das Gelenk rückt dabei nach innen; innen = 1 gleicht das ganz aus, 0 gar nicht). klav = Anteil, um den das Schlüsselbein (Trapez) mitgeht. Alles auf 0 = keine Verbreiterung (die Drehknochen unten bleiben)
export const SCHULTER_HAUT = { breit: 0.015, vorn: 0.030, klav: 0.6, innen: 1, dreh: 1, hoch: 0.65 };   // dreh = Anteil der Drehung, den die Drehknochen verteilen (1 ganz, 0 gar nicht = Haut wie vorher); hoch = wie viel davon bei Armen über Kopf wegfällt (Band über der Schulter, Schutzhülle)
// Drehknochen (9.11.2026, Runde 2; Devin: „Schultern verrenkt, wenn sie so eingedreht sind“; Frontkniebeuge: Oberarm bis 136° gedreht, Untergriff über Kopf bis 171°). Bisher drehte der Deltamuskel mit der vollen Drehung des Oberarms
// gegen den Rumpf, und die Haut dazwischen faltete sich wie ein Bonbonpapier (Rückenbreite bis 20 cm unter dem Stand). Jetzt hat jeder Oberarm und jeder Unterarm DREH_N Stufen: die erste dreht gar nicht (reiner Schwenk des Arms, am Schultergelenk
// bzw. Ellbogen), jede weitere ein Stück mehr, die letzte (der Knochen selbst) ganz. Die Hautgewichte gehen entlang des Arms von einer Stufe zur nächsten (statt in einem Sprung); je Stufe ändert sich die Drehung nur um ein Drittel, darum fällt die Haut
// nicht mehr zusammen. Nur im Speicher beim Laden (Knochenliste und Hautgewichte), keine neue koerper.bin; stelle() legt die Stufen je Bild
export const DREH_N = 3;
// Rolle des Oberarms, die auf die Drehknochen verteilt wird (G13, 9.11.): Läuft sie durch ±180°, springt atan2 von +180° auf −180° und mit ihr die Haut des Oberarms (kabel_seitheben: 120° in einem Bild).
// Mit dem Schalter g.drehGlatt (setzt die Vorlage, bisher nur kabel_seitheben) fällt sie über 80° linear auf 0 bei 180° (Dreieck, höchstens 0,8 Steigung, damit der Drehknochen am Schulterende nicht schneller dreht als die echte Rolle),
// darunter und ohne Schalter bleibt alles, wie es war (für alle Übungen ändert das sonst die Hautverdrehung von über 40 Übungen, zum Beispiel Kniebeuge und Schulterdrücken)
const drehLauf = (w) => { const a = Math.abs(w) * 180 / Math.PI; return a <= 80 ? w : Math.sign(w) * 80 * (180 - Math.min(180, a)) / 100 * Math.PI / 180; };
export const DREH_STRECKE = { Arm: [0, 0.12], ForeArm: null };   // Strecke ab Schultergelenk bzw. Ellbogen (m), auf der die Drehung von keiner auf die ganze wächst; null = diese Kette bleibt wie vorher (der Unterarm: seine Haut reicht an Polster und Maschinen, die Schutzhülle schlug dort bei sechs Übungen an)
export const drehName = (S, kette, j) => S + kette + 'D' + j;
function drehKnochen(k) {
  if (k.dreh) return;
  k.dreh = true;
  const haut = k.meshes.find((m) => m.mat === 'haut');
  if (!haut) return;
  const P = (n) => k.knochen[k.index[n]].p, ketten = [];
  for (const S of ['Left', 'Right']) for (const [kette, naechster] of [['Arm', 'ForeArm'], ['ForeArm', 'Hand']]) {
    if (!DREH_STRECKE[kette]) continue;
    const basis = k.index[S + kette], J = P(S + kette), u = P(S + naechster).clone().sub(J).normalize(), stufen = [];
    for (let j = 0; j < DREH_N; j++) { const n = drehName(S, kette, j); k.index[n] = k.knochen.length; k.knochen.push({ name: n, eltern: k.knochen[basis].eltern, p: J.clone() }); stufen.push(k.index[n]); }
    stufen.push(basis);   // die letzte Stufe ist der Knochen selbst: volle Drehung
    ketten.push({ basis, J, u, stufen, von: DREH_STRECKE[kette][0], bis: DREH_STRECKE[kette][1] });
  }
  const GI = haut.gel.array, GW = haut.gew.array, pos = haut.pos, n = pos.count;
  for (let i = 0; i < n; i++) {
    let infl = null;
    for (const ke of ketten) for (let c = 0; c < 4; c++) if (GW[i * 4 + c] && GI[i * 4 + c] === ke.basis) {
      // das Gewicht dieses Knochens auf die zwei Stufen verteilen, zwischen denen der Punkt entlang des Arms liegt
      if (!infl) { infl = []; for (let q = 0; q < 4; q++) if (GW[i * 4 + q]) infl.push([GI[i * 4 + q], GW[i * 4 + q] / 255]); }
      const e = infl.find((x) => x[0] === ke.basis), d = (pos.getX(i) - ke.J.x) * ke.u.x + (pos.getY(i) - ke.J.y) * ke.u.y + (pos.getZ(i) - ke.J.z) * ke.u.z;
      const s = glatt(ke.von, ke.bis, d) * DREH_N, lo = Math.min(DREH_N - 1, Math.floor(s)), f = s - lo, w = e[1];
      e[0] = ke.stufen[lo]; e[1] = w * (1 - f); if (f > 0.002) infl.push([ke.stufen[lo + 1], w * f]);
      break;
    }
    if (!infl) continue;
    const best = infl.filter((x) => x[1] > 0.003).sort((a, b) => b[1] - a[1]).slice(0, 4), summe = best.reduce((a, x) => a + x[1], 0) || 1;
    const q8 = best.map((x) => Math.round(x[1] / summe * 255)); q8[0] += 255 - q8.reduce((a, x) => a + x, 0);
    for (let c = 0; c < 4; c++) { GI[i * 4 + c] = c < best.length ? best[c][0] : 0; GW[i * 4 + c] = c < best.length ? q8[c] : 0; }
  }
}
// Brustmuskel je Seite in Ruhelage (Mitte, Ausdehnung in m): dort zieht er sich zusammen bzw. dehnt sich
const BRUST = { x: 0.085, y: 1.385, z: 0.06, bx: 0.075, by: 0.07 };
// Muskelbäuche in der Ruhelage (T-Pose, linke Seite, Meter, am Modell gemessen 2.11., rechts gespiegelt): Mitte c, Ausdehnung s, Wölbung a in m bei voller Spannung.
// Daraus auch die goldene Fläche des arbeitenden Muskels (muskelMaske). Brust ohne Wölbung: die wölbt sich schon über uPec (und darf unten nicht in die Stange)
const MUSKEL_BAUCH = {
  brust: [{ c: [0.085, 1.385, 0.09], s: [0.075, 0.07, 0.06], a: 0 }],
  lat: [{ c: [0.155, 1.3, -0.115], s: [0.06, 0.1, 0.06], a: 0 }, { c: [0.11, 1.17, -0.125], s: [0.055, 0.09, 0.05], a: 0 }],
  oberer_ruecken: [{ c: [0.075, 1.41, -0.15], s: [0.06, 0.06, 0.04], a: 0.007 }],
  trapez: [{ c: [0.06, 1.52, -0.09], s: [0.075, 0.045, 0.05], a: 0.008 }],
  schulter_vorne: [{ c: [0.215, 1.485, -0.01], s: [0.05, 0.045, 0.04], a: 0.008 }],
  schulter_seite: [{ c: [0.25, 1.515, -0.075], s: [0.055, 0.045, 0.05], a: 0.009 }],
  schulter_hinten: [{ c: [0.225, 1.485, -0.14], s: [0.05, 0.045, 0.04], a: 0.007 }],
  bizeps: [{ c: [0.35, 1.43, -0.02], s: [0.06, 0.04, 0.04], a: 0 }],
  trizeps: [{ c: [0.33, 1.44, -0.125], s: [0.07, 0.045, 0.04], a: 0 }],
  unterarme: [{ c: [0.54, 1.445, -0.083], s: [0.06, 0.06, 0.06], a: 0 }],
  quadrizeps: [{ c: [0.115, 0.78, 0.05], s: [0.06, 0.13, 0.05], a: 0 }, { c: [0.07, 0.625, 0.03], s: [0.03, 0.045, 0.035], a: 0 }, { c: [0.18, 0.76, 0], s: [0.03, 0.11, 0.06], a: 0 }],
  beinbeuger: [{ c: [0.105, 0.74, -0.115], s: [0.06, 0.12, 0.04], a: 0 }],
  gesaess: [{ c: [0.095, 0.93, -0.125], s: [0.06, 0.07, 0.05], a: 0 }],
  adduktoren: [{ c: [0.03, 0.82, -0.03], s: [0.03, 0.09, 0.06], a: 0.006 }],
  abduktoren: [{ c: [0.15, 1, -0.06], s: [0.035, 0.05, 0.05], a: 0.005 }],
  waden: [{ c: [0.125, 0.36, -0.14], s: [0.055, 0.075, 0.04], a: 0 }],
  bauch: [{ c: [0.035, 1.16, 0.105], s: [0.04, 0.085, 0.035], a: 0.005 }],
  seitlicher_rumpf: [{ c: [0.125, 1.14, 0.03], s: [0.03, 0.07, 0.06], a: 0.005 }],
  unterer_ruecken: [{ c: [0.05, 1.12, -0.11], s: [0.035, 0.085, 0.04], a: 0.006 }]
};
// Wer bei einer Übung mitarbeitet, ohne genannt zu sein: je Hauptmuskel die Helfer und ihr Anteil (Devin, 2.11.: beim Latzug „der Bizeps … anspannt und dann wieder … relaxt“)
const HELFER = {
  lat: { bizeps: 0.8, unterarme: 0.7, trizeps: 0.25 }, oberer_ruecken: { bizeps: 0.7, unterarme: 0.6 }, schulter_hinten: { bizeps: 0.3, unterarme: 0.4 },
  brust: { trizeps: 0.7, schulter: 0.6 }, schulter_vorne: { trizeps: 0.7, schulter: 1 }, schulter_seite: { schulter: 1, unterarme: 0.3 }, trizeps: { unterarme: 0.4 }, bizeps: { unterarme: 0.6 },
  quadrizeps: { gesaess: 0.6, beinbeuger: 0.25, waden: 0.2 }, gesaess: { beinbeuger: 0.5, quadrizeps: 0.3 }, beinbeuger: { gesaess: 0.4, waden: 0.3 }, unterer_ruecken: { gesaess: 0.5, beinbeuger: 0.5 }
};
const SPIEL_NAME = { lat: 'lat', bizeps: 'bizeps', trizeps: 'trizeps', schulter_vorne: 'schulter', schulter_seite: 'schulter', schulter_hinten: 'schulter', unterarme: 'unterarme', quadrizeps: 'quadrizeps', beinbeuger: 'beinbeuger', gesaess: 'gesaess', waden: 'waden' };
const FUSS_HOEHE = 0.88;               // Knöchel liegt beim Modell etwas höher über der Sohle als in gelenke()
const FINGER = ['Index', 'Middle', 'Ring', 'Pinky'];
const KRUEMMUNG = [38, 48, 32];        // Grad je Fingerglied: locker geschlossene Hand (nichts in der Hand)
const DAUMEN = [10, 18, 14];
// Hand geöffnet vor dem Griff (g.handAuf): Finger fast gestreckt, Daumen weg von der Hand
const OFFEN = [8, 12, 8], DAUMEN_OFFEN = [2, 6, 4];
// Faust um Stange oder Griff (g.haelt): Finger schließen sich um die Faustmitte g.hand, der Daumen dreht vor die Handfläche
// (daumenDreh, Grad um die Fingerachse) und legt sich von der anderen Seite um den Griff. Exportiert, damit die Werkstatt sie einstellen kann
export const FAUST = { finger: [72, 88, 50], daumen: [30, 50, 40], daumenDreh: -60 };
// Griff wie bei einer echten Hand: Die Stange (Radius r) liegt quer in der Handfläche knapp vor den Fingerknöcheln, parallel zur
// Knöchellinie (gelenke() knickt die Hand dafür zur Kleinfingerseite). Jeder Finger beugt sich Glied für Glied, bis er die Stange
// berührt (Fingerdicke ~2,3 cm), Mittel- und Endglied, bis ihr Ende aufliegt (bis 1.11. nur bis zur ersten Berührung: die Spitze stand
// gerade ab, bei dicken Griffen 3,4–3,8 cm statt ~3 cm von der Achse, Devin: „unprofessionell“). Die Finger rücken dabei zusammen
// (ANZUG: so viel der Spreizung des Modells fällt weg, sonst Lücken wie bei einer Kralle). Der Daumen dreht vor die Handfläche und
// schließt sich von der anderen Seite um die Stange, bis er außen auf dem Mittelglied des Zeigefingers liegt. Gerechnet in der Ruhelage,
// einmal je Hand und Radius (auf mm gerundet)
const DAUMEN_GRIFF = [30, 50, 40], ANZUG = 0.85;
// Kelchgriff: Die Handfläche liegt von unten am Hantelkopf, die Finger gehen unter ihm durch und legen sich am Rand nach oben um ihn, der Daumen liegt außen am Kopf (Grad je Fingerglied; Ablauf davor: g.kelchW mischt mit der Faust)
export const KELCH = { finger: { Index: [0, 60, 35], Middle: [0, 55, 35], Ring: [0, 45, 30], Pinky: [0, 15, 10] }, neigung: { Index: 16, Middle: 8, Ring: 0, Pinky: -8 }, daumen: { abd: 5, dreh: 34, curl: 0.9 },
  unten: { finger: { Index: [5, 22, 15], Middle: [5, 28, 20], Ring: [5, 25, 20], Pinky: [5, 20, 15] }, neigung: { Index: 16, Middle: 8, Ring: 0, Pinky: -8 }, daumen: { abd: 5, dreh: 31, curl: 0.93 } },
  haken: { finger: { Index: [60, 62, 28], Middle: [62, 58, 25], Ring: [65, 48, 20], Pinky: [75, 45, 20] }, daumen: { abd: 15, dreh: -45, curl: 1 } },
  innen: { finger: { Index: [5, 0, 0], Middle: [0, 10, 5], Ring: [28, 5, 0], Pinky: [85, 0, 0] }, neigung: { Index: 0, Middle: 0, Ring: 0, Pinky: 0 }, daumen: { abd: 30, dreh: -30, curl: 0.3 } } };
const _griffe = new Map();
const segAbstand = (c, p, q) => {
  const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / l2)) : 0;
  return Math.hypot(c[0] - p[0] - t * dx, c[1] - p[1] - t * dy);
};
export function griffLoesen(P, ru, S, r) {
  const key = S + Math.round(r * 1000);
  if (_griffe.has(key)) return _griffe.get(key);
  const u = ru.finger.clone(), v = ru.ruecken.clone().negate(), w = u.clone().cross(v).normalize();
  const B = P(S + 'Hand').clone().add(u.clone().multiplyScalar(MASS.griff)).add(v.clone().multiplyScalar(MASS.griffTief));
  const d = w.clone();   // Stange quer zu den Fingern (gelenke() legt sie senkrecht zum Unterarm in die Hand)
  const R = r + 0.0115, MAX = [95, 110, 80];
  const loes = { finger: {}, glieder: {}, spreiz: {} };
  const abstandZurStange = (p) => { const q = p.clone().sub(B); return q.sub(d.clone().multiplyScalar(q.dot(d))).length(); };
  // Spreizung je Finger: Winkel des Grundglieds zum Mittelfinger in der Handfläche (um den Handrücken); beim Greifen fällt ANZUG davon weg
  const inFlaeche = (f) => { const x = P(S + 'Hand' + f + '2').clone().sub(P(S + 'Hand' + f + '1')); return x.sub(v.clone().multiplyScalar(x.dot(v))).normalize(); };
  const mitte = inFlaeche('Middle');
  for (const f of FINGER) { const x = inFlaeche(f); loes.spreiz[f] = Math.atan2(mitte.clone().cross(x).dot(ru.ruecken), mitte.dot(x)) * ANZUG; }
  for (const f of FINGER) {
    const J = [1, 2, 3, 4].map((j) => P(S + 'Hand' + f + j));
    const C = B.clone().add(d.clone().multiplyScalar(J[0].clone().sub(B).dot(w) / d.dot(w)));
    const zw = (p) => [p.clone().sub(J[0]).dot(u), p.clone().sub(J[0]).dot(v)];
    const c = zw(C);
    let p = [0, 0], phi = 0;
    const winkel = [];
    for (let k = 0; k < 3; k++) {
      const a = zw(J[k + 1]), b = zw(J[k]), L = Math.hypot(a[0] - b[0], a[1] - b[1]), e0 = Math.atan2(a[1] - b[1], a[0] - b[0]);
      // Grundglied dreht, bis es die Stange berührt (liegt sein Anfang schon daran: dicker Griff, bis sein Ende aufliegt);
      // Mittel- und Endglied legen sich ganz herum, bis ihr Ende aufliegt
      const innen = k > 0 || Math.hypot(p[0] - c[0], p[1] - c[1]) < R;
      let th = 0;
      while (th < MAX[k]) {
        const ang = e0 + phi + th * RAD, q = [p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L];
        if (innen ? Math.hypot(q[0] - c[0], q[1] - c[1]) <= R : segAbstand(c, p, q) <= R) break;
        th += 1;
      }
      winkel.push(th); phi += th * RAD;
      const ang = e0 + phi; p = [p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L];
    }
    loes.finger[f] = winkel;
  }
  // Gebeugte Finger (Gelenkpunkte in der Ruhelage), für das Ziel des Daumens und damit er nicht durch die Finger geht
  const gebeugt = (f) => {
    let m = umPunkt(P(S + 'Hand' + f + '1'), ru.ruecken, -loes.spreiz[f]); const pts = [P(S + 'Hand' + f + '1').clone()];
    for (let j = 1; j <= 3; j++) { m = m.clone().multiply(umPunkt(P(S + 'Hand' + f + j), w, loes.finger[f][j - 1] * RAD)); pts.push(P(S + 'Hand' + f + (j + 1)).clone().applyMatrix4(m)); }
    return pts;
  };
  const zeige = gebeugt('Index'), mittel = gebeugt('Middle');
  // Ziel des Daumens: legt sich vorn um die Stange und quer über den Zeigefinger kurz vor dem Endgelenk, die Spitze zeigt zum
  // Mittelfinger (wie bei einer geschlossenen Faust; das Mittelglied liegt bei dieser Hand zu weit hinter der Stange)
  const auf = zeige[2].clone().lerp(zeige[3], 0.35);
  const q = auf.clone().sub(B), aussen = q.sub(d.clone().multiplyScalar(q.dot(d))).normalize();
  const ziel = auf.clone().add(aussen.multiplyScalar(0.0115 + 0.009));
  const ulnar = P(S + 'HandPinky1').clone().sub(P(S + 'HandIndex1')).dot(w) > 0 ? w.clone() : w.clone().negate();
  const fingerPunkte = [];
  for (const kette of [zeige, mittel]) for (let i = 0; i < 3; i++) for (const u2 of [0.25, 0.75]) fingerPunkte.push(kette[i].clone().lerp(kette[i + 1], u2));
  const achse = ru.daumen.clone().cross(ru.ruecken.clone().negate()).normalize();
  const D = [1, 2, 3, 4].map((j) => P(S + 'HandThumb' + j));
  // Daumen: zur Hand schwenken (um die Handflächen-Normale), vor die Handfläche drehen (um die Fingerachse), dann beugen
  const daumen = (abd, dreh, curl) => {
    let mm = umPunkt(D[0], v, abd * RAD).multiply(umPunkt(D[0], u, dreh * RAD)); const pts = [];
    for (let j = 1; j <= 3; j++) { mm = mm.clone().multiply(umPunkt(D[j - 1], achse, DAUMEN_GRIFF[j - 1] * curl * RAD)); pts.push(D[j].clone().applyMatrix4(mm)); }
    return pts;
  };
  // Bewertung: Spitze am Ziel, Endglied quer zu den Fingern; Strafe, wenn der Daumen in der Stange oder in Zeige-/Mittelfinger steckt
  const wert = (pts) => {
    let e = pts[2].distanceTo(ziel) + 0.02 * (1 - pts[2].clone().sub(pts[1]).normalize().dot(ulnar));
    const glieder = [pts[0], pts[1], pts[2], pts[0].clone().lerp(pts[1], 0.5), pts[1].clone().lerp(pts[2], 0.5), D[0].clone().lerp(pts[0], 0.5)];
    for (const x of glieder) { if (abstandZurStange(x) < r + 0.0085) e += 1; }
    for (const x of glieder.slice(0, 2).concat(glieder.slice(3))) for (const f of fingerPunkte) if (x.distanceTo(f) < 0.017) e += 0.2;
    return e;
  };
  let best = { abd: 0, dreh: 0, curl: 1, e: Infinity };
  for (let abd = -40; abd <= 70; abd += 5) for (let dreh = -90; dreh <= 90; dreh += 10) for (let curl = 0; curl <= 2.01; curl += 0.1) {
    const e = wert(daumen(abd, dreh, curl));
    if (e < best.e) best = { abd, dreh, curl, e };
  }
  // fein nachsuchen um die beste Stelle
  const grob = best;
  for (let abd = grob.abd - 5; abd <= grob.abd + 5; abd += 1) for (let dreh = grob.dreh - 10; dreh <= grob.dreh + 10; dreh += 2) for (let curl = Math.max(0, grob.curl - 0.1); curl <= grob.curl + 0.1; curl += 0.02) {
    const e = wert(daumen(abd, dreh, curl));
    if (e < best.e) best = { abd, dreh, curl, e };
  }
  loes.daumen = best;
  _griffe.set(key, loes);
  return loes;
}
// Hinweis: FARBEN & Co. aus figur.js erst in Funktionen benutzen (figur.js importiert diese Datei, die Module hängen im Kreis)

/* ---------- Kleidung und Saunahut (Devins Look) ---------- */
// Masken in der Ruhelage (p = Punkt vor dem Skinning). Tanktop: Saum über dem Hosenbund, Ausschnitt vorn tief (U), hinten flacher,
// tiefe Armlöcher (Ellipse um das Schultergelenk), dazwischen die Träger über den Trapez. Hosenbeine bis knapp übers Knie,
// Socken bis ein Drittel der Wade mit geripptem Bund. dkNaht: Saum etwas dunkler (umgeschlagener Stoff)
const KLEIDUNG_GLSL = `
float dkTanktop(vec3 p) {
  float ax = abs(p.x);
  if (ax > 0.24 || p.y < 0.94 || p.y > 1.63) return 0.0;
  float vorn = smoothstep(-0.03, 0.03, p.z);
  float hals = mix(1.48 + 8.0 * ax * ax, 1.415 + 11.0 * ax * ax, vorn);
  vec2 e = vec2((ax - 0.235) / 0.115, (p.y - 1.43) / 0.19);
  return smoothstep(0.952, 0.958, p.y) * (1.0 - smoothstep(hals - 0.003, hals + 0.003, p.y)) * smoothstep(1.0, 1.04, dot(e, e));
}
float dkHosenbein(vec3 p) {
  if (abs(p.x) > 0.215 || p.y > 0.86) return 0.0;
  return smoothstep(0.597, 0.603, p.y);
}
float dkShorts(vec3 p) { return abs(p.x) <= 0.215 && p.y >= 0.6 && p.y <= 1.024 ? 1.0 : 0.0; }
#ifdef DK_STOFF
// Senkrechte Falten im lockeren Stoff (Höhe in m, nur für Licht und Schatten): unten am Shirt vorn und hinten, an den Hosenbeinen außen
float dkFalten(vec3 p) {
#if DK_STOFF == 1
  float w = atan(p.x, p.z + 0.015);
  return 0.0028 * (1.0 - smoothstep(0.98, 1.32, p.y)) * (1.0 - 0.6 * abs(sin(w))) * sin(7.0 * w + 2.0 * sin(3.0 * w + p.y * 9.0) + p.y * 3.0);
#else
  float s = p.x >= 0.0 ? 1.0 : -1.0, w = atan(p.x - s * 0.11, p.z + 0.025), innen = pow(max(0.0, cos(w + s * 1.5708)), 2.0);
  return 0.003 * (1.0 - smoothstep(0.64, 0.9, p.y)) * (1.0 - innen) * sin(6.0 * w + 1.7 * sin(2.0 * w + p.y * 14.0) + p.y * 5.0);
#endif
}
#endif
float dkSocke(vec3 p) {
  if (abs(p.x) > 0.215 || p.y > 0.26) return 0.0;
  return 1.0 - smoothstep(0.243, 0.2455, p.y);
}
// Abstand zum Rand des Shirts an Hals und Armloch (m, positiv im Stoff; wie dkTanktop)
float dkRandTop(vec3 p) {
  float ax = abs(p.x), vorn = smoothstep(-0.03, 0.03, p.z);
  float dh = mix(1.48 + 8.0 * ax * ax, 1.415 + 11.0 * ax * ax, vorn) - p.y;
  float kh = mix(16.0, 22.0, vorn) * ax;
  vec2 e = vec2((ax - 0.235) / 0.115, (p.y - 1.43) / 0.19), g = e / vec2(0.115, 0.19);
  return min(dh / sqrt(1.0 + kh * kh), (dot(e, e) - 1.02) / max(1e-3, 2.0 * length(g)));
}
float dkNaht(float y, float kante, float breite) { return 1.0 - 0.14 * (1.0 - smoothstep(kante + breite - 0.002, kante + breite, y)); }
float dkRippe(vec3 p) {
  float a = atan(p.z + 0.075, abs(p.x) - 0.114);
  return 0.5 + 0.5 * sin(a * 44.0);
}
`;
// Saunahut aus weißem Filz (Devins Markenzeichen, wie im Video vom 31.10.): zwei Filzhälften mit Naht von vorn über den Scheitel nach
// hinten, oben schmal und gerundet, unten glockig mit dicker, weicher Kante; sitzt bis an die Augenbrauen, hinten tiefer. Vorn seitlich
// das DK-Logo als Aufdruck. Geometrie in der Ruhelage; stelle() legt ihn jedes Bild mit dem Kopfknochen
const HUT_LAGE = () => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-10 * RAD, 0, -2 * RAD)).setPosition(0, 1.693, -0.012);   // etwas schief, wie aufgesetzt (Devin, 2.11.: „wie ein bisschen locker“)
const HUT_LOGO = { winkel: 28 * RAD, hoehe: 0.085, groesse: 0.066 };   // Aufdruck: Richtung von vorn zur linken Seite, Höhe über der Kante
const HUT_AUSSEN = [[0.124, 0], [0.122, 0.01], [0.115, 0.028], [0.108, 0.05], [0.102, 0.078], [0.097, 0.108], [0.091, 0.136], [0.082, 0.16],
  [0.069, 0.181], [0.052, 0.198], [0.032, 0.209], [0.014, 0.214], [0, 0.216]];   // Außenseite: Radius, Höhe über der Kante (m)
// Radius der Außenseite in der Höhe y (zwischen den Profilpunkten linear)
function hutRadius(y) {
  for (let i = 1; i < HUT_AUSSEN.length; i++) {
    const [r0, h0] = HUT_AUSSEN[i - 1], [r1, h1] = HUT_AUSSEN[i];
    if (y <= h1) return r0 + (r1 - r0) * Math.max(0, (y - h0) / (h1 - h0));
  }
  return 0;
}
// Hut weicht aus oder wird abgelegt (G9-H, 9.11.: „Saunahut überall dabei“). Wo er auf dem Kopf nicht geht (Liegen, Kopf unten, Polster und Stangen am Kopf), rechnet
// Ansicht.zeige vorab EINE feste Lage für die ganze Übung (Devin, 4.11.: „Hut sitzt fest“, kein Wackeln, kein Springen): erst auf dem Kopf mit kleiner Korrektur
// (hutKorr: höchstens 3 cm anheben, 25° kippen), sonst neben dem Kopf auf den Boden gelegt (hutFest: feste Lage, geht nicht mit dem Kopf mit)
const HUT_KOPFUNTEN_BLEIBT = false;   // false: hängt der Kopf nach unten (Handstand), fiele der Hut ab und liegt am Boden; true: er bliebe stehen, wo er sitzt (klebt)
const HUT_ARME = [['Arm', 'ForeArm', 0.045], ['ForeArm', 'Hand', 0.04], ['Hand', 'HandMiddle4', 0.025]];   // Kapseln wie in hutFrei
const HUT_DREH = new THREE.Vector3(0, 1.70, -0.012);   // Drehpunkt beim Kippen: Kopfmitte in Ruhelage
const HUT_KORREKTUREN = (() => {
  const l = [];
  for (const h of [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03]) for (let n = -25; n <= 25; n += 5) for (let r = -25; r <= 25; r += 5) {
    const k = Math.hypot(n, r); if (k <= 25.001) l.push({ hoch: h, nick: n, roll: r, kosten: h / 0.03 + k / 25 });   // 3 cm anheben kostet so viel wie 25° kippen
  }
  return l.sort((a, b) => a.kosten - b.kosten);   // billigste zuerst: die erste passende ist die kleinste Änderung
})();
function hutKorrMatrix(k) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(k.nick * RAD, 0, k.roll * RAD)), p2 = HUT_DREH.clone().applyQuaternion(q);
  return new THREE.Matrix4().compose(new THREE.Vector3(0, k.hoch, 0).add(HUT_DREH).sub(p2), q, new THREE.Vector3(1, 1, 1));
}
// Abstand² eines Punkts zur Strecke a–b
function segAbstand2(p, a, b) {
  const x = b.x - a.x, y = b.y - a.y, z = b.z - a.z, l2 = x * x + y * y + z * z;
  let t = l2 > 1e-12 ? ((p.x - a.x) * x + (p.y - a.y) * y + (p.z - a.z) * z) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + x * t - p.x, dy = a.y + y * t - p.y, dz = a.z + z * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}
// Abstand² eines Punkts zu einem gedrehten Quader { c, ax[3], hx[3] }
function kastenAbstand2(p, k) {
  let s = 0;
  for (let i = 0; i < 3; i++) { const t = Math.abs((p.x - k.c.x) * k.ax[i].x + (p.y - k.c.y) * k.ax[i].y + (p.z - k.c.z) * k.ax[i].z) - k.hx[i]; if (t > 0) s += t * t; }
  return s;
}
function saunahut() {
  const aussen = HUT_AUSSEN;
  const innen = aussen.map(([r, h]) => [Math.max(0, r - 0.007), h + 0.003 - 0.009 * Math.min(1, h / 0.05)]).reverse();   // innen, von oben nach unten
  const kante = [[0.1125, 0.002], [0.1155, -0.0035], [0.12, -0.0055], [0.1245, -0.004], [0.1262, 0.001]];   // dicke, gerundete Filzkante
  // Außenseite fein abtasten: nur so zeigt das Netz die Beulen und Falten des Filzes
  const fein = []; for (let i = 0; i < aussen.length - 1; i++) for (let k = 0; k < 3; k++) { const u = k / 3, [r0, h0] = aussen[i], [r1, h1] = aussen[i + 1]; fein.push([r0 + (r1 - r0) * u, h0 + (h1 - h0) * u]); } fein.push(aussen[aussen.length - 1]);
  const profil = [...innen, ...kante, ...fein].map(([r, h]) => new THREE.Vector2(r, h)), nP = profil.length, nS = 96;
  const geo = new THREE.LatheGeometry(profil, nS);
  // Grat an der Naht (vorn und hinten, x ≈ 0) und eine leicht unregelmäßige Form wie gewalkter Filz; dazu Innen-Kennung für den Shader
  const pos = geo.attributes.position, innenA = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = Math.hypot(x, z), w = Math.atan2(x, z);
    innenA[i] = (i % nP) < innen.length ? 1 : 0;
    if (r < 1e-6) { const h = Math.min(1, Math.max(0, y / 0.216)); pos.setXYZ(i, 0.013 * h * h, y * (1 - 0.03 * h * h * h), -0.009 * h * h); continue; }   // Spitze geht mit
    // Weicher Filz: Beulen, Dellen und Querfalten, die Spitze sackt zur Seite, der Rand wellt sich leicht; innen weniger
    const h = Math.min(1, Math.max(0, y / 0.216)), au = innenA[i] ? 0.25 : 1;
    const beule = 0.024 * Math.sin(2 * w + 0.7) * h + 0.016 * Math.sin(3 * w + 2.1) * h * h + 0.009 * Math.sin(5 * w + 0.4 + y * 12) * Math.min(1, y / 0.1) + 0.006 * Math.sin(7 * w + 2.6 + y * 22) * Math.min(1, y / 0.06);
    const falte = 0.0085 * Math.sin(y * 74 + 1.8 * Math.sin(2 * w + 0.5) + 0.9 * Math.sin(5 * w)) * Math.exp(-(((y - 0.07) / 0.05) ** 2)) + 0.006 * Math.sin(y * 118 + 2.4 * Math.sin(3 * w + 1.2)) * Math.exp(-(((y - 0.135) / 0.035) ** 2));
    const f = 1 + 0.03 * Math.exp(-((x / r / 0.16) ** 2)) + au * (0.007 * Math.sin(3 * w + 1.1) + beule + falte);
    const ys = y * (1 - 0.05 * h * h * h * (0.6 + 0.4 * Math.sin(w * 2 + 1))) + au * 0.0028 * Math.sin(3 * w + 0.5) * (1 - h) ** 3;
    pos.setXYZ(i, x * f + 0.013 * h * h, ys, z * f * 1.13 - 0.009 * h * h);   // Kopf ist länger als breit
  }
  geo.setAttribute('innen', new THREE.BufferAttribute(innenA, 1));
  geo.setAttribute('lokal', pos.clone());
  geo.computeVertexNormals();
  // Naht der Drehfläche (erste = letzte Spalte) und die Spitzen: Normalen angleichen, sonst sieht man einen Knick
  const nor = geo.attributes.normal, n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let j = 0; j < nP; j++) {
    n.fromBufferAttribute(nor, j).add(m.fromBufferAttribute(nor, nS * nP + j)).normalize();
    nor.setXYZ(j, n.x, n.y, n.z); nor.setXYZ(nS * nP + j, n.x, n.y, n.z);
    if (profil[j].x < 1e-6) for (let i = 0; i <= nS; i++) nor.setXYZ(i * nP + j, 0, innenA[j] ? -1 : 1, 0);
  }
  geo.applyMatrix4(HUT_LAGE());
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xe6dfd0, roughness: 0.97, metalness: 0, sheen: 1, sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xfff8ec), side: THREE.DoubleSide });
  const logo = logoTextur(), schwung = { value: new THREE.Vector2() }, glocke = { value: new THREE.Vector2() };   // Filz gibt nach: die Spitze schwingt etwas mit (Ansicht.schwingt, in Kopf-Koordinaten)
  // Filz: Fasern und Walkflecken (Helligkeit und Normale leicht verrauscht, an den Hut gebunden), Naht als feine Rille, innen dunkler, Aufdruck
  mat.onBeforeCompile = (s) => {
    s.uniforms.uLogo = { value: logo }; s.uniforms.uLogoAn = { value: logo ? 1 : 0 }; s.uniforms.uHutSchwung = schwung; s.uniforms.uHutGlocke = glocke;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float innen;\nattribute vec3 lokal;\nvarying float vInnen;\nvarying vec3 vLokal;\nuniform vec2 uHutSchwung;\nuniform vec2 uHutGlocke;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInnen = innen;\nvLokal = lokal;\nfloat dkHH = clamp(lokal.y / 0.216, 0.0, 1.0);\ntransformed.xz += uHutSchwung * dkHH * dkHH;\nfloat dkHW = atan(lokal.x, lokal.z);\nfloat dkHR = (1.0 - dkHH) * (1.0 - dkHH) * uHutGlocke.x;\ntransformed.xz += normalize(lokal.xz + 1e-5) * dkHR * (sin(2.0 * dkHW + uHutGlocke.y) + 0.6 * sin(3.0 * dkHW - uHutGlocke.y * 1.31));\ntransformed.y += dkHR * 0.5 * sin(3.0 * dkHW + uHutGlocke.y * 0.8);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vInnen;\nvarying vec3 vLokal;\nuniform sampler2D uLogo;\nuniform float uLogoAn;\n' + FILZ_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dkF = dkFilz(vLokal * 300.0) * 0.5 + dkFilz(vLokal * 90.0) * 0.3 + dkFilz(vLokal * 22.0) * 0.2;
float dkNahtR = (1.0 - smoothstep(0.0012, 0.0032, abs(vLokal.x))) * (1.0 - vInnen);
float dkStichH = dkNahtR * step(0.5, fract(vLokal.y / 0.0065)) * smoothstep(0.0006, 0.0018, abs(vLokal.x));
diffuseColor.rgb *= (0.86 + 0.2 * dkF) * (1.0 - 0.1 * dkNahtR) * (1.0 - 0.12 * dkStichH) * (1.0 - 0.3 * vInnen);
diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.965, 0.9), smoothstep(0.42, 0.68, dkFilz(vLokal * 9.0)) * 0.7);   // gewalkter Filz: leichte Flecken, an der Kante abgegriffen
diffuseColor.rgb *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.014, vLokal.y));
vec3 dkLR = vec3(cos(${HUT_LOGO.winkel.toFixed(4)}), 0.0, -sin(${HUT_LOGO.winkel.toFixed(4)}));
vec2 dkLP = vec2(sin(${HUT_LOGO.winkel.toFixed(4)}), cos(${HUT_LOGO.winkel.toFixed(4)}));
vec2 dkLU = vec2(dot(vLokal - vec3(0.0, ${HUT_LOGO.hoehe.toFixed(3)}, 0.0), dkLR) / ${HUT_LOGO.groesse.toFixed(3)} + 0.5, (vLokal.y - ${HUT_LOGO.hoehe.toFixed(3)}) / ${HUT_LOGO.groesse.toFixed(3)} + 0.5);
if (uLogoAn > 0.5 && vInnen < 0.5 && dot(normalize(vLokal.xz + 1e-6), dkLP) > 0.6 && all(greaterThan(dkLU, vec2(0.0))) && all(lessThan(dkLU, vec2(1.0)))) {
  vec4 dkL = texture2D(uLogo, dkLU);
  diffuseColor.rgb = mix(diffuseColor.rgb, dkL.rgb * (0.9 + 0.1 * dkF), dkL.a * 0.92);
}`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + 0.2 * vec3(dkFilz(vLokal * 340.0 + 7.0) - 0.5, dkFilz(vLokal * 340.0 + 19.0) - 0.5, dkFilz(vLokal * 340.0 + 31.0) - 0.5) + 0.14 * vec3(dkFilz(vLokal * 70.0 + 3.0) - 0.5, dkFilz(vLokal * 70.0 + 11.0) - 0.5, dkFilz(vLokal * 70.0 + 23.0) - 0.5));');
  };
  const hut = new THREE.Mesh(geo, mat);
  hut.castShadow = true; hut.receiveShadow = true; hut.matrixAutoUpdate = false; hut.userData.schwung = schwung; hut.userData.glocke = glocke;
  return hut;
}
// DK-Logo (wie icon.svg: D und K im Verlauf der Farbwelt) als Textur für den Aufdruck; ohne Browser (Prüfung in Node) keins
let _logo;
function logoTextur() {
  if (_logo !== undefined) return _logo;
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return (_logo = null);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.scale(256 / 400, 256 / 400); g.translate(-88, -56);   // Ausschnitt um die Buchstaben (viewBox 512)
  // Verlauf je Buchstabe von oben links nach unten rechts (wie im SVG: objectBoundingBox)
  for (const [d, x0, x1] of [['M132 150h76c62 0 104 42 104 106s-42 106-104 106h-76zM178 196v120h28c35 0 58-24 58-60s-23-60-58-60z', 132, 312],
    ['M300 150h46v86l62-86h54l-74 98 78 114h-56l-64-96v96h-46z', 300, 466]]) {
    const v = g.createLinearGradient(x0, 150, x1, 362); v.addColorStop(0, '#ff8a3d'); v.addColorStop(1, '#ff3d81');
    g.fillStyle = v; g.fill(new Path2D(d));
  }
  _logo = new THREE.CanvasTexture(c); _logo.colorSpace = THREE.SRGBColorSpace; _logo.anisotropy = 4;
  return _logo;
}
// Gesicht wie Devin (1.11.: „Haare und Gesicht“, Ziel 1:1): jünger und runder als das Sportler-Modell – untere Gesichtshälfte und Wangen
// breiter und voller, Kinn kürzer und weniger vorstehend. Nur Kopfpunkte (Gewicht am Kopfknochen), Augenpartie bleibt (dort sitzen die
// Augäpfel). Einmal je geladenem Körper in der Ruhelage; Maße am Modell gemessen (Kinn y 1,58, Mund 1,62, Nase 1,65, Augen 1,68–1,72)
function gesichtFormen(k) {
  const haut = k.meshes.find((m) => m.mat === 'haut'), kopf = k.index.Head;
  if (!haut || kopf === undefined) return;
  const p = haut.pos, gi = haut.gel, gw = haut.gew, glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  for (let i = 0; i < p.count; i++) {
    let w = 0; for (let j = 0; j < 4; j++) if (gi.getComponent(i, j) === kopf) w += gw.getComponent(i, j);
    if (w <= 0) continue;
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const vorn = glatt((z + 0.03) / 0.06);                                    // Vorderseite des Kopfes (Gesicht), hinten nichts
    const unten = glatt((1.685 - y) / 0.03) * glatt((y - 1.555) / 0.02);      // von der Augenlinie abwärts bis unters Kinn
    const breit = 0.09 * Math.exp(-(((y - 1.625) / 0.04) ** 2));              // am meisten auf Mundhöhe: Kiefer und Wangen
    const kinn = glatt((1.605 - y) / 0.025) * glatt((z - 0.02) / 0.04);       // Kinnspitze
    const nx = x * (1 + breit * unten * vorn * w);
    const ny = y + 0.006 * kinn * w;                                          // Kinn 6 mm kürzer
    const nz = z - 0.004 * kinn * w + 0.004 * Math.exp(-(((y - 1.645) / 0.02) ** 2)) * glatt((Math.abs(x) - 0.035) / 0.02) * vorn * w;   // Wangen voller
    p.setXYZ(i, nx, ny, nz);
  }
  p.needsUpdate = true;
}
// Haut feiner (Devin, 1.11. abends: Muskeln „nicht so eckig … schön smooth … gleichmäßig und weit verteilt“): einmal Loop-Unterteilung
// (jedes Dreieck → 4, die Punkte rücken auf die glatte Grenzfläche: Umrisse und Muskelübergänge werden rund), Normalen über die
// Textur-Nähte gemittelt. Ränder (Augen, Mund) bleiben, wo sie sind. Die Schuhe entstehen vorher aus dem groben Netz (darauf sind sie abgestimmt).
// 7281 Punkte / 12566 Dreiecke → etwa 27000 / 50000; einmal je geladenem Körper
function hautVerfeinern(k) {
  const m = k.meshes.find((x) => x.mat === 'haut');
  if (!m) return;
  const P = m.pos.array, n0 = m.pos.count, ix = m.idx.array, T = ix.length / 3;
  // Punkte gleicher Lage (Textur-Nähte) zusammenfassen
  const id = new Int32Array(n0), lage = new Map(); let nw = 0;
  for (let i = 0; i < n0; i++) {
    const s = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5);
    let w = lage.get(s); if (w === undefined) lage.set(s, (w = nw++)); id[i] = w;
  }
  const W = new Float64Array(nw * 3);
  for (let i = 0; i < n0; i++) for (let c = 0; c < 3; c++) W[id[i] * 3 + c] = P[i * 3 + c];
  // Kanten (verschweißt) mit ihren Gegenpunkten; Rand = nicht genau zwei Dreiecke
  const kante = new Map(), schl = (a, b) => (a < b ? a * nw + b : b * nw + a);
  for (let t = 0; t < T; t++) for (let e = 0; e < 3; e++) {
    const a = id[ix[t * 3 + e]], b = id[ix[t * 3 + (e + 1) % 3]], c = id[ix[t * 3 + (e + 2) % 3]];
    const s = schl(a, b); let g = kante.get(s); if (!g) kante.set(s, (g = [])); g.push(c);
  }
  const nb = Array.from({ length: nw }, () => []), rand = new Uint8Array(nw);
  for (const [s, g] of kante) { const a = Math.floor(s / nw), b = s % nw; nb[a].push(b); nb[b].push(a); if (g.length !== 2) rand[a] = rand[b] = 1; }
  // Alte Punkte: Loop-Maske (Warren), Randpunkte bleiben
  const neuW = new Float64Array(nw * 3);
  for (let v = 0; v < nw; v++) {
    const n = nb[v].length;
    if (rand[v] || n < 3) { for (let c = 0; c < 3; c++) neuW[v * 3 + c] = W[v * 3 + c]; continue; }
    const be = n === 3 ? 3 / 16 : 3 / (8 * n);
    for (let c = 0; c < 3; c++) { let s = 0; for (const u of nb[v]) s += W[u * 3 + c]; neuW[v * 3 + c] = (1 - n * be) * W[v * 3 + c] + be * s; }
  }
  // Neue Punkte: die alten behalten ihre Nummern, dazu einer je Kante und Textur-Seite (an Nähten zwei an derselben Stelle)
  const kpunkt = new Map(), paar = [], kschl = (i, j) => (i < j ? i * n0 + j : j * n0 + i);
  for (let t = 0; t < T; t++) for (let e = 0; e < 3; e++) {
    const i = ix[t * 3 + e], j = ix[t * 3 + (e + 1) % 3], s = kschl(i, j);
    if (!kpunkt.has(s)) { kpunkt.set(s, n0 + paar.length / 2); paar.push(Math.min(i, j), Math.max(i, j)); }
  }
  const N = n0 + paar.length / 2;
  const pos = new Float32Array(N * 3), uv = new Float32Array(N * 2), gel = new Uint8Array(N * 4), gew = new Uint8Array(N * 4), kleid = new Uint8Array(N * 2), teil = new Uint8Array(N);
  const U = m.uv.array, GI = m.gel.array, GW = m.gew.array, KL = m.kleid.array, TE = m.teil;
  for (let i = 0; i < n0; i++) {
    for (let c = 0; c < 3; c++) pos[i * 3 + c] = neuW[id[i] * 3 + c];
    for (let c = 0; c < 4; c++) { gel[i * 4 + c] = GI[i * 4 + c]; gew[i * 4 + c] = GW[i * 4 + c]; }
    uv[i * 2] = U[i * 2]; uv[i * 2 + 1] = U[i * 2 + 1]; kleid[i * 2] = KL[i * 2]; kleid[i * 2 + 1] = KL[i * 2 + 1]; teil[i] = TE[i];
  }
  const kw = new Map();   // Knochen → Gewicht beider Endpunkte
  for (let q = 0; q < paar.length / 2; q++) {
    const i = paar[q * 2], j = paar[q * 2 + 1], v = n0 + q, a = id[i], b = id[j], g = kante.get(schl(a, b));
    for (let c = 0; c < 3; c++) pos[v * 3 + c] = g.length === 2 ? 0.375 * (W[a * 3 + c] + W[b * 3 + c]) + 0.125 * (W[g[0] * 3 + c] + W[g[1] * 3 + c]) : 0.5 * (W[a * 3 + c] + W[b * 3 + c]);
    uv[v * 2] = (U[i * 2] + U[j * 2]) / 2; uv[v * 2 + 1] = (U[i * 2 + 1] + U[j * 2 + 1]) / 2;
    kleid[v * 2] = (KL[i * 2] + KL[j * 2] + 1) >> 1; kleid[v * 2 + 1] = (KL[i * 2 + 1] + KL[j * 2 + 1] + 1) >> 1;
    teil[v] = TE[i];
    kw.clear();
    for (const x of [i, j]) for (let c = 0; c < 4; c++) { const w = GW[x * 4 + c]; if (w) kw.set(GI[x * 4 + c], (kw.get(GI[x * 4 + c]) || 0) + w); }
    const best = [...kw].sort((x, y) => y[1] - x[1]).slice(0, 4), summe = best.reduce((s, x) => s + x[1], 0) || 1;
    let rest = 255;
    best.forEach(([kn, w], c) => { const q8 = c === best.length - 1 ? Math.max(0, rest) : Math.round(w / summe * 255); gel[v * 4 + c] = kn; gew[v * 4 + c] = q8; rest -= q8; });
  }
  const Ix = N > 65535 ? new Uint32Array(T * 12) : new Uint16Array(T * 12);
  for (let t = 0; t < T; t++) {
    const a = ix[t * 3], b = ix[t * 3 + 1], c = ix[t * 3 + 2], ab = kpunkt.get(kschl(a, b)), bc = kpunkt.get(kschl(b, c)), ca = kpunkt.get(kschl(c, a));
    Ix.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], t * 12);
  }
  // Normalen aus den Flächen, über die Nähte gemittelt (Kantenpunkte einer Naht teilen sich ihre verschweißte Kante)
  const wid = new Int32Array(N), kid = new Map(); let nk = nw;
  for (let i = 0; i < n0; i++) wid[i] = id[i];
  for (let q = 0; q < paar.length / 2; q++) { const s = schl(id[paar[q * 2]], id[paar[q * 2 + 1]]); let w = kid.get(s); if (w === undefined) kid.set(s, (w = nk++)); wid[n0 + q] = w; }
  const acc = new Float64Array(nk * 3);
  for (let t = 0; t < Ix.length; t += 3) {
    const a = Ix[t] * 3, b = Ix[t + 1] * 3, c = Ix[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const x of [Ix[t], Ix[t + 1], Ix[t + 2]]) { acc[wid[x] * 3] += nx; acc[wid[x] * 3 + 1] += ny; acc[wid[x] * 3 + 2] += nz; }
  }
  const nor = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const w = wid[i] * 3, l = Math.hypot(acc[w], acc[w + 1], acc[w + 2]) || 1; nor[i * 3] = acc[w] / l; nor[i * 3 + 1] = acc[w + 1] / l; nor[i * 3 + 2] = acc[w + 2] / l; }
  m.pos = new THREE.BufferAttribute(pos, 3); m.uv = new THREE.BufferAttribute(uv, 2); m.nor = new THREE.BufferAttribute(nor, 3);
  m.gel = new THREE.BufferAttribute(gel, 4); m.gew = new THREE.BufferAttribute(gew, 4, true); m.kleid = new THREE.BufferAttribute(kleid, 2, true);
  m.idx = new THREE.BufferAttribute(Ix, 1); m.teil = teil;
}
// Sneaker (Devin, 2.11.: „an den Füßen arbeiten“; bis dahin eine dünne Hülle um den Fuß, sah aus wie ein Pantoffel): eigenes Modell in der Ruhelage, Vorbild die weißen Laufschuhe aus dem Video:
// dicke Sohle mit Rille, Laufsohle, Obermaterial, gepolsterter Rand um den Knöchel, Schnürsenkel über Kreuz mit Schleife. Geht mit Fuß- und Zehenknochen, vorn biegt er am Ballen. Maße am Fuß des Modells
// gemessen (z −0,142…0,128, x 0,076…0,187, y bis 0,11); Zone je Punkt in 'schuh' (x: 0 Obermaterial, 1 Zwischensohle, 2 Laufsohle, 3 Schnürsenkel, 4 Polster). Bild: SCHUH_FARBE_GLSL. Der Fuß darin wird nicht gezeichnet
const SCHUH_MASS = { z0: -0.146, z1: 0.144, xo: 0.1215, zo: -0.083, rx: 0.044, rz: 0.053 };
const tabelle = (T, z) => { if (z <= T[0][0]) return T[0].slice(1); for (let i = 1; i < T.length; i++) if (z <= T[i][0]) { const a = T[i - 1], b = T[i], u = (z - a[0]) / (b[0] - a[0]), f = u * u * (3 - 2 * u); return a.slice(1).map((v, k) => v + (b[k + 1] - v) * (0.5 * u + 0.5 * f)); } return T[T.length - 1].slice(1); };
const SCHUH_UMRISS = [[-0.148, 0.098, 0.152], [-0.135, 0.09, 0.156], [-0.115, 0.083, 0.161], [-0.09, 0.077, 0.165], [-0.05, 0.076, 0.171], [-0.01, 0.079, 0.182], [0.03, 0.075, 0.192], [0.06, 0.071, 0.196], [0.09, 0.073, 0.19], [0.115, 0.078, 0.176], [0.135, 0.088, 0.158], [0.148, 0.102, 0.142]];
const SCHUH_HOCH = [[-0.148, 0.104], [-0.136, 0.116], [-0.03, 0.118], [-0.01, 0.103], [0.02, 0.087], [0.05, 0.074], [0.08, 0.063], [0.11, 0.055], [0.135, 0.047], [0.148, 0.04]];
const schuhUmriss = (z) => { const M = SCHUH_MASS, u = (z - (M.z0 + M.z1) / 2) / ((M.z1 - M.z0) / 2), [a, b] = tabelle(SCHUH_UMRISS, z), c = (a + b) / 2, h = (b - a) / 2 * Math.sqrt(Math.max(0, 1 - Math.abs(u) ** 7)); return [c - h, c + h]; };
const schuhFeder = (z) => 0.013 * glatt(0.085, 0.15, z) ** 1.5 + 0.004 * glatt(-0.11, -0.15, z);                    // vorn und hinten geht die Sohle etwas hoch
const schuhBiss = (z) => 0.0375 + 0.009 * glatt(0.0, -0.09, z) + schuhFeder(z);                                       // Oberkante der Zwischensohle
function schuhModell() {
  const M = SCHUH_MASS, pos = [], zone = [], tri = [];
  const punkt = (x, y, z, zn, par = 0) => { pos.push(x, y, z); zone.push(zn, par); return pos.length / 3 - 1; };
  const viereck = (a, b, c, d) => tri.push(a, b, c, a, c, d);
  // Stationen längs des Fußes: an den Enden und am Rand der Öffnung dichter
  const zOffen0 = M.zo - M.rz, zOffen1 = M.zo + M.rz, st = [];
  for (const u of [0, 0.03, 0.12, 0.27, 0.5, 0.75]) st.push(M.z0 + (zOffen0 - M.z0) * u);
  for (let i = 0; i <= 14; i++) st.push(M.zo - M.rz * Math.cos(Math.PI * i / 14));
  for (let i = 1; i <= 20; i++) { const u = i / 20; st.push(zOffen1 + (M.z1 - zOffen1) * (u < 0.65 ? u : 0.65 + 0.35 * Math.sin((u - 0.65) / 0.35 * Math.PI / 2))); }
  const rand = (z) => { const w = (z - M.zo) / M.rz; return 0.1 + 0.018 * glatt(0.35, 1, w) + 0.013 * glatt(-0.35, -1, w); };   // Höhe des Rands: seitlich tief, hinten und zur Zunge hoch
  const oben = (z) => { const u = Math.max(0, (z - 0.1) / (M.z1 - 0.1)), yb = schuhBiss(z), h = tabelle(SCHUH_HOCH, z)[0] + schuhFeder(z) * 0.6; return yb + (h - yb) * Math.sqrt(Math.max(0, 1 - u ** 3)); };
  const mitteOben = (z) => { const [a, b] = schuhUmriss(z), f = glatt(zOffen1 + 0.1, zOffen1 + 0.005, z); return (a + b) / 2 * (1 - f) + M.xo * f; };
  const MW = 11, NT = st.length;
  // Obermaterial: je Station zwei Hälften von der Sohle nach oben (Viertelellipse); vorn und hinten treffen sie sich oben, an der Öffnung enden sie am Rand
  const I = [], A = [];
  st.forEach((z) => {
    const [xa, xb] = schuhUmriss(z), yb = schuhBiss(z), offen = z > zOffen0 + 1e-6 && z < zOffen1 - 1e-6, w = (z - M.zo) / M.rz, hb = M.rx * Math.sqrt(Math.max(0, 1 - w * w));
    const xrI = offen ? M.xo - hb : mitteOben(z), xrA = offen ? M.xo + hb : mitteOben(z), yr = offen ? rand(z) : Math.max(yb + 0.002, oben(z));
    const rI = [], rA = [];
    for (let j = 0; j <= MW; j++) {
      const th = j / MW * Math.PI / 2, f = 1 - Math.cos(th), g = Math.sin(th);
      const auf = 0.5 * (j / MW) + 0.5 * g;   // Seitenwand etwas steiler, nicht ganz eine Ellipse
      if (j === MW && !offen) { const c = punkt(xrI, yr, z, 0); rI.push(c); rA.push(c); break; }
      rI.push(punkt(xa + (xrI - xa) * f, yb + (yr - yb) * auf, z, 0, 0));
      rA.push(punkt(xb + (xrA - xb) * f, yb + (yr - yb) * auf, z, 0, 0));
    }
    I.push(rI); A.push(rA);
  });
  for (let i = 0; i < NT - 1; i++) for (let j = 0; j < MW; j++) {
    viereck(I[i][j], I[i + 1][j], I[i + 1][j + 1], I[i][j + 1]);
    viereck(A[i][j], A[i][j + 1], A[i + 1][j + 1], A[i + 1][j]);
  }
  // Höhe des Obermaterials an (x, z) für Schnürsenkel
  const hoehe = (x, z) => { const [xa, xb] = schuhUmriss(z), c = mitteOben(z), yb = schuhBiss(z), yr = Math.max(yb + 0.002, oben(z)), xr = x < c ? xa : xb, f = Math.min(1, Math.abs(x - xr) / Math.max(1e-4, Math.abs(c - xr))), th = Math.acos(Math.max(0, 1 - f)); return yb + (yr - yb) * (0.5 * th / (Math.PI / 2) + 0.5 * Math.sin(th)); };
  // Sohle: Ringe um den Umriss, außen dicker werdend
  const umlauf = []; for (let i = 0; i < NT; i++) umlauf.push({ x: schuhUmriss(st[i])[0], z: st[i] }); for (let i = NT - 2; i > 0; i--) umlauf.push({ x: schuhUmriss(st[i])[1], z: st[i] });
  const NU = umlauf.length; umlauf.forEach((p, i) => { const a = umlauf[(i + NU - 1) % NU], b = umlauf[(i + 1) % NU]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; p.nx = -tz; p.nz = tx; });
  const mx = umlauf.reduce((s, p) => s + p.x, 0) / NU;
  { let f = 0; umlauf.forEach((p) => { f += p.nx * (p.x - mx) + p.nz * p.z; }); if (f < 0) umlauf.forEach((p) => { p.nx = -p.nx; p.nz = -p.nz; }); }
  // Profil: Zone, nach außen (m), Höhe relativ: h = Anteil zwischen Biss und Boden
  const PROFIL = [[1, -0.001, 0.0], [1, 0.0035, 0.03], [1, 0.0058, 0.2], [1, 0.0062, 0.42], [1, 0.0045, 0.5], [1, 0.0044, 0.56], [1, 0.0066, 0.66], [1, 0.0068, 0.84], [1, 0.0052, 0.93], [2, 0.0048, 0.935], [2, 0.0044, 1.0], [2, 0.0012, 1.02]];
  const unten = (z) => 0.0065 + schuhFeder(z);
  const ringe = PROFIL.map(([zn, aus, h], k) => umlauf.map((p) => { const yb = schuhBiss(p.z); return punkt(p.x + p.nx * aus, yb + (unten(p.z) - yb) * h, p.z + p.nz * aus, zn, k / (PROFIL.length - 1)); }));
  for (let k = 0; k < ringe.length - 1; k++) for (let i = 0; i < NU; i++) { const a = ringe[k][i], b = ringe[k][(i + 1) % NU], c = ringe[k + 1][(i + 1) % NU], d = ringe[k + 1][i]; viereck(a, d, c, b); }
  // Boden: von der untersten Kante über die Mitte
  const unt = ringe[ringe.length - 1], mitte = st.map((z) => { const [a, b] = schuhUmriss(z); return punkt((a + b) / 2, unten(z) - 0.0005, z, 2, 1); });
  for (let i = 0; i < NT - 1; i++) {
    const iu = (n) => unt[n], au = (n) => (n === 0 ? unt[0] : n === NT - 1 ? unt[NT - 1] : unt[NU - n]);
    viereck(iu(i), iu(i + 1), mitte[i + 1], mitte[i]);
    viereck(au(i), mitte[i], mitte[i + 1], au(i + 1));
  }
  // Polster um die Öffnung: Schlauch auf dem Rand
  const NR = 36, NQ = 7, ring = [];
  for (let i = 0; i < NR; i++) {
    const phi = i / NR * 2 * Math.PI, zz = M.zo + M.rz * Math.cos(phi), xx = M.xo + M.rx * Math.sin(phi), yy = rand(Math.max(zOffen0, Math.min(zOffen1, zz))), nx = Math.sin(phi), nz = Math.cos(phi), r = [];
    const dick = 0.0042 + 0.0014 * Math.abs(nx);
    for (let j = 0; j < NQ; j++) { const a = j / NQ * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a); r.push(punkt(xx + nx * ca * dick, yy - 0.002 + sa * dick * 1.25, zz + nz * ca * dick, 4, 0.5 + 0.5 * sa)); }
    ring.push(r);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NQ; j++) { const a = ring[i][j], b = ring[(i + 1) % NR][j], c = ring[(i + 1) % NR][(j + 1) % NQ], d = ring[i][(j + 1) % NQ]; viereck(a, b, c, d); }
  // Schnürsenkel: flache Bänder über Kreuz, oben eine Schleife
  const band = (pkte, breite = 0.0036, dicke = 0.0009) => {
    const n = pkte.length, reihen = [];
    for (let i = 0; i < n; i++) {
      const p = pkte[i], a = pkte[Math.max(0, i - 1)], b = pkte[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // Quer zum Band, möglichst waagrecht
      let qx = tz, qy = 0, qz = -tx; const ql = Math.hypot(qx, qz) || 1; qx /= ql; qz /= ql;
      const ux = qy * tz - qz * ty, uy = qz * tx - qx * tz, uz = qx * ty - qy * tx;
      const r = [];
      for (const [q, u] of [[-1, 0], [-0.5, 1], [0.5, 1], [1, 0], [0.5, -1], [-0.5, -1]]) r.push(punkt(p[0] + qx * q * breite + ux * u * dicke, p[1] + qy * q * breite + uy * u * dicke, p[2] + qz * q * breite + uz * u * dicke, 3, i / (n - 1)));
      reihen.push(r);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < 6; j++) { const a = reihen[i][j], b = reihen[i + 1][j], c = reihen[i + 1][(j + 1) % 6], d = reihen[i][(j + 1) % 6]; viereck(a, d, c, b); }
  };
  const REIHEN = [0.052, 0.036, 0.02, 0.004, -0.012, -0.027], lagenX = (z) => { const [a, b] = schuhUmriss(z), c = mitteOben(z); return [c - Math.min(0.021, (c - a) * 0.5), c + Math.min(0.021, (b - c) * 0.5)]; };
  const hoeheB = (x, z, plus) => hoehe(x, z) + plus;
  for (let k = 0; k < REIHEN.length - 1; k++) {
    const z0 = REIHEN[k], z1 = REIHEN[k + 1], [a0, b0] = lagenX(z0), [a1, b1] = lagenX(z1);
    for (const [xs, xe, oben0] of [[a0, b1, 0.0024], [b0, a1, 0.0034]]) {
      const pk = [];
      for (let i = 0; i <= 6; i++) { const u = i / 6, x = xs + (xe - xs) * u, z = z0 + (z1 - z0) * u, c = mitteOben(z); pk.push([x, Math.max(hoeheB(x, z, oben0), hoehe(c, z) - 0.0035 + oben0), z]); }
      band(pk);
    }
  }
  { const z = REIHEN[0], [a, b] = lagenX(z), pk = []; for (let i = 0; i <= 6; i++) { const x = a + (b - a) * i / 6; pk.push([x, hoeheB(x, z, 0.0024), z]); } band(pk); }
  // Schleife oben
  { const z = REIHEN[REIHEN.length - 1] - 0.002, c = mitteOben(z), y = hoehe(c, z) + 0.006;
    for (const s of [-1, 1]) {
      const lo = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * 2 * Math.PI; lo.push([c + s * (0.012 + 0.012 * Math.sin(a / 2) ** 1 * 1.4), y + 0.0015 * Math.sin(a) - 0.008 * Math.sin(a / 2) ** 2, z + 0.008 * Math.sin(a) + 0.006 * Math.sin(a / 2)]); }
      band(lo, 0.003);
      const en = []; for (let i = 0; i <= 5; i++) { const u = i / 5; en.push([c + s * (0.003 + 0.024 * u), y - 0.001 - 0.019 * u * u, z + 0.012 + 0.012 * u]); }
      band(en, 0.003);
    }
    // Knoten
    const kn = []; for (let i = 0; i <= 3; i++) kn.push([c - 0.004 + 0.008 * i / 3, y + 0.001, z]); band(kn, 0.004, 0.0024);
  }
  return { pos: new Float32Array(pos), zone: new Float32Array(zone), tri };
}
function turnschuhDaten(k) {
  const m = k.meshes.find((x) => x.mat === 'haut');
  if (!m) return null;
  const L = schuhModell(), n1 = L.pos.length / 3, n = n1 * 2, pos = new Float32Array(n * 3), zone = new Float32Array(n * 2), tri = [];
  pos.set(L.pos); zone.set(L.zone); zone.set(L.zone, n1 * 2);
  for (let i = 0; i < n1; i++) { pos[(n1 + i) * 3] = -L.pos[i * 3]; pos[(n1 + i) * 3 + 1] = L.pos[i * 3 + 1]; pos[(n1 + i) * 3 + 2] = L.pos[i * 3 + 2]; }
  for (let i = 0; i < L.tri.length; i += 3) tri.push(L.tri[i], L.tri[i + 1], L.tri[i + 2]);
  for (let i = 0; i < L.tri.length; i += 3) tri.push(n1 + L.tri[i], n1 + L.tri[i + 2], n1 + L.tri[i + 1]);
  // Knochen: hinten Fuß, ab dem Ballen Zehen
  const gel = new Uint8Array(n * 4), gew = new Uint8Array(n * 4), teil = new Uint8Array(n), kleid = new Uint8Array(n * 2);
  const FL = k.index.LeftFoot, FR = k.index.RightFoot, TL = k.index.LeftToeBase, TR = k.index.RightToeBase, tl = k.teile.indexOf('fuss_l'), tr = k.teile.indexOf('fuss_r');
  for (let i = 0; i < n; i++) {
    const z = pos[i * 3 + 2], w = glatt(0.03, 0.08, z), links = i < n1, q = Math.round(w * 255);
    gel[i * 4] = links ? FL : FR; gel[i * 4 + 1] = links ? TL : TR; gew[i * 4] = 255 - q; gew[i * 4 + 1] = q;
    teil[i] = links ? tl : tr; kleid[i * 2 + 1] = 255;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(tri); geo.computeVertexNormals();
  return {
    name: 'Turnschuhe', mat: 'schuh', pos: geo.attributes.position, nor: geo.attributes.normal,
    uv: new THREE.BufferAttribute(new Float32Array(n * 2), 2), schuh: new THREE.BufferAttribute(zone, 2),
    gel: new THREE.BufferAttribute(gel, 4), gew: new THREE.BufferAttribute(gew, 4, true),
    kleid: new THREE.BufferAttribute(kleid, 2, true), idx: new THREE.BufferAttribute(new Uint16Array(tri), 1), teil
  };
}
// Lockere Kleidung (Devin, 31.10.: Tanktop und Shorts „locker machen“ wie im Video): eigene Hüllen aus den Dreiecken der Haut
// (Bereich plus ein Ring Rand; die Kante schneidet der Shader an derselben Stelle wie bei der aufgemalten Kleidung, die darunter
// bleibt, falls die Haut doch einmal durch den Stoff kommt). Der Stoff fällt von der breitesten Stelle darüber senkrecht nach unten,
// statt jeder Einbuchtung zu folgen: Tanktop von Brust und Schulterblättern (Bauch und Kreuz mit Luft, an den Seiten wenig, wegen der
// Arme), Shorts je Bein von Hüfte und Gesäß, unten weit, innen eng (die Beine berühren sich sonst). Dazu Luft entlang der Normale, zum
// Saum hin mehr. 'eng' ist dieselbe Hülle knapp über der Haut: dorthin fällt der Stoff, wo er nach oben absteht (shader(): im Liegen
// liegt das Shirt auf dem Bauch). Gleiche Knochen-Gewichte wie die Haut
const glatt = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Masken wie KLEIDUNG_GLSL (Ruhelage)
function tanktopMaske(x, y, z) {
  const ax = Math.abs(x);
  if (ax > 0.24 || y < 0.94 || y > 1.63) return 0;
  const vorn = glatt(-0.03, 0.03, z), hals = 1.48 + 8 * ax * ax + (1.415 + 11 * ax * ax - 1.48 - 8 * ax * ax) * vorn;
  const ex = (ax - 0.235) / 0.115, ey = (y - 1.43) / 0.19;
  return glatt(0.952, 0.958, y) * (1 - glatt(hals - 0.003, hals + 0.003, y)) * glatt(1, 1.04, ex * ex + ey * ey);
}
const shortsMaske = (x, y) => (Math.abs(x) <= 0.215 && y >= 0.6 && y <= 1.024 ? 1 : 0);
// Größter Abstand der Haut von einer senkrechten Achse (ax, az) je Höhe (2 cm) und Richtung (10°; 0 = vorn, +90° = links), aus
// Punkten auf den Dreiecken (≤ 1 cm Abstand); Lücken im Kreis bzw. von der Nachbarhöhe gefüllt
function huelleRadien(P, I, dreiecke, ax, az, y0, y1) {
  const DY = 0.02, NW = 36, ny = Math.round((y1 - y0) / DY) + 1, R = Array.from({ length: ny }, () => new Float32Array(NW).fill(-1));
  const a = V(), b = V(), c = V(), q = V();
  for (const t of dreiecke) {
    a.fromArray(P, I[t] * 3); b.fromArray(P, I[t + 1] * 3); c.fromArray(P, I[t + 2] * 3);
    const s = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / 0.01));
    for (let i = 0; i <= s; i++) for (let j = 0; i + j <= s; j++) {
      q.copy(a).multiplyScalar((s - i - j) / s).addScaledVector(b, i / s).addScaledVector(c, j / s);
      const yb = Math.round((q.y - y0) / DY); if (yb < 0 || yb >= ny) continue;
      const dx = q.x - ax, dz = q.z - az, wb = Math.floor((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI) * NW) % NW;
      R[yb][wb] = Math.max(R[yb][wb], Math.hypot(dx, dz));
    }
  }
  for (const z of R) {
    const voll = []; for (let w = 0; w < NW; w++) if (z[w] >= 0) voll.push(w);
    if (!voll.length) continue;
    for (let w = 0; w < NW; w++) {
      if (voll.includes(w)) continue;
      let l = w, r = w, dl = 0, dr = 0;
      do { l = (l + NW - 1) % NW; dl++; } while (!voll.includes(l));
      do { r = (r + 1) % NW; dr++; } while (!voll.includes(r));
      z[w] = (z[l] * dr + z[r] * dl) / (dl + dr);
    }
  }
  for (let y = 1; y < ny; y++) if (R[y][0] < 0 && R[y - 1][0] >= 0) R[y].set(R[y - 1]);
  for (let y = ny - 2; y >= 0; y--) if (R[y][0] < 0 && R[y + 1][0] >= 0) R[y].set(R[y + 1]);
  return { R, D: R, y0, DY, NW };
}
// Fallender Stoff: unterhalb von yOben D(y) = max(R(y), D(y + DY) − k·DY), höchstens kappe über der Haut (k, kappe je Richtung)
function fallen(H, yOben, k, kappe) {
  const { R, y0, DY, NW } = H, top = Math.min(R.length - 1, Math.round((yOben - y0) / DY));
  H.D = R.map((z) => Float32Array.from(z));
  for (let w = 0; w < NW; w++) {
    const wi = (w + 0.5) / NW * 2 * Math.PI - Math.PI, kw = k(wi) * DY, kap = kappe(wi);
    for (let y = top - 1; y >= 0; y--) H.D[y][w] = Math.min(R[y][w] + kap, Math.max(R[y][w], H.D[y + 1][w] - kw));
  }
  // weich machen (1-2-1 über Richtung und Höhe), sonst sieht man die 10°-Fächer und 2-cm-Stufen im Stoff
  for (let pass = 0; pass < 2; pass++) {
    const A = H.D.map((z) => Float32Array.from(z)), ny = A.length;
    for (let y = 0; y < ny; y++) for (let w = 0; w < NW; w++) {
      const um = (yy) => A[yy][(w + NW - 1) % NW] + 2 * A[yy][w] + A[yy][(w + 1) % NW];
      H.D[y][w] = (um(Math.max(0, y - 1)) + 2 * um(y) + um(Math.min(ny - 1, y + 1))) / 16;
    }
  }
}
function liesD(H, y, w) {
  const { D, y0, DY, NW } = H;
  const fy = Math.max(0, Math.min(D.length - 1.001, (y - y0) / DY)), iy = Math.floor(fy), ty = fy - iy;
  const fw = ((w + Math.PI) / (2 * Math.PI) * NW - 0.5 + NW) % NW, iw = Math.floor(fw), tw = fw - iw, iw2 = (iw + 1) % NW;
  return (D[iy][iw] * (1 - tw) + D[iy][iw2] * tw) * (1 - ty) + (D[iy + 1][iw] * (1 - tw) + D[iy + 1][iw2] * tw) * ty;
}
function kleidungDaten(k) {
  const m = k.meshes.find((x) => x.mat === 'haut');
  if (!m) return [];
  const P = m.pos.array, I = m.idx.array, NR = m.nor.array, teil = m.teil, kl = m.kleid.array;
  const mitte = (t, c) => (P[I[t] * 3 + c] + P[I[t + 1] * 3 + c] + P[I[t + 2] * 3 + c]) / 3;
  const dreiecke = (wahl) => { const out = []; for (let t = 0; t < I.length; t += 3) if (wahl(t)) out.push(t); return out; };
  // Hülle: alle Dreiecke mit einer Ecke im Bereich; lage(v, normale) = lockerer Punkt, eng = Abstand der engen Hülle. Punkte an den
  // Textur-Nähten der Haut (gleicher Ort, doppelt gespeichert) werden verschweißt, sonst reißt der Stoff dort auf und zeigt eine Linie
  const ort = (v) => Math.round(P[v * 3] * 1e4) + ',' + Math.round(P[v * 3 + 1] * 1e4) + ',' + Math.round(P[v * 3 + 2] * 1e4);
  const armNamen = []; for (const S of ['Left', 'Right']) for (const kette of ['Arm', 'ForeArm']) { armNamen.push(S + kette); for (let j = 0; j < DREH_N; j++) armNamen.push(drehName(S, kette, j)); }   // mit den Drehknochen (Gewicht des Arms verteilt sich auf sie)
  const armKnochen = new Set(armNamen.map((b) => k.index[b]));
  const baue = (name, mat, imBereich, lage, eng, randAbstand, falte, engMisch) => {
    const neu = new Map(), orte = new Map(), alt = [], tri = [];
    for (let t = 0; t < I.length; t += 3) {
      const v = [I[t], I[t + 1], I[t + 2]];
      if (!v.some(imBereich)) continue;
      for (const x of v) {
        if (neu.has(x)) continue;
        const o = ort(x);
        if (!orte.has(o)) { orte.set(o, alt.length); alt.push(x); }
        neu.set(x, orte.get(o));
      }
      tri.push(...v.map((x) => neu.get(x)));
    }
    const n = alt.length, pos = new Float32Array(n * 3), ruhe = new Float32Array(n * 3), engA = new Float32Array(n * 3), hn = new Float32Array(n * 3), nv = V(), engJe = new Float32Array(n), engVon = typeof eng === 'function' ? eng : () => eng;
    alt.forEach((v, i) => {
      nv.set(NR[v * 3], NR[v * 3 + 1], NR[v * 3 + 2]).normalize();
      const p = lage(v, nv);
      // Wo der Oberarm die Haut mitnimmt (Achsel), liegt der Stoff eng an: sonst stünden die Seiten bei erhobenen Armen ab wie Flügel
      let arm = 0; for (let j = 0; j < 4; j++) if (armKnochen.has(m.gel.array[v * 4 + j])) arm += m.gew.array[v * 4 + j] / 255;
      // Am Rand (Hals, Armloch) liegt der Stoff an: Einfass und Träger stehen nicht von der Haut ab
      const locker = (1 - Math.min(1, arm * 2.5)) * (randAbstand ? glatt(0.004, 0.035, randAbstand(v)) : 1), engV = engVon(v);
      engJe[i] = engV;
      for (let c = 0; c < 3; c++) {
        ruhe[i * 3 + c] = P[v * 3 + c]; hn[i * 3 + c] = nv.getComponent(c); engA[i * 3 + c] = P[v * 3 + c] + hn[i * 3 + c] * engV;
        pos[i * 3 + c] = engA[i * 3 + c] + (p[c] - engA[i * 3 + c]) * locker;
      }
    });
    // Glätten (Taubin, behält das Volumen), wo der Stoff absteht; Randpunkte der Hülle bleiben. Danach nie näher an die Haut als 1 mm
    // über der engen Hülle
    const nbS = Array.from({ length: n }, () => new Set()), kanten = new Map();
    for (let i = 0; i < tri.length; i += 3) for (let a = 0; a < 3; a++) {
      const u = tri[i + a], v = tri[i + (a + 1) % 3], key = Math.min(u, v) * n + Math.max(u, v);
      nbS[u].add(v); nbS[v].add(u); kanten.set(key, (kanten.get(key) || 0) + 1);
    }
    const nb = nbS.map((s) => [...s]);
    const wg = new Float32Array(n);
    for (let i = 0; i < n; i++) wg[i] = glatt(0.002, 0.012, Math.hypot(pos[i * 3] - ruhe[i * 3], pos[i * 3 + 1] - ruhe[i * 3 + 1], pos[i * 3 + 2] - ruhe[i * 3 + 2]) - engJe[i]);
    for (const [key, c] of kanten) if (c === 1) { wg[Math.floor(key / n)] = 0; wg[key % n] = 0; }
    for (let it = 0; it < 48; it++) {
      const f = it % 2 ? -0.53 : 0.5, q = pos.slice();
      for (let i = 0; i < n; i++) {
        if (!wg[i]) continue;
        let sx = 0, sy = 0, sz = 0; for (const j of nb[i]) { sx += q[j * 3]; sy += q[j * 3 + 1]; sz += q[j * 3 + 2]; }
        const c = nb[i].length, w = f * wg[i];
        pos[i * 3] += (sx / c - q[i * 3]) * w; pos[i * 3 + 1] += (sy / c - q[i * 3 + 1]) * w; pos[i * 3 + 2] += (sz / c - q[i * 3 + 2]) * w;
      }
    }
    for (let i = 0; i < n; i++) {
      const d = (pos[i * 3] - ruhe[i * 3]) * hn[i * 3] + (pos[i * 3 + 1] - ruhe[i * 3 + 1]) * hn[i * 3 + 1] + (pos[i * 3 + 2] - ruhe[i * 3 + 2]) * hn[i * 3 + 2];
      if (d < engJe[i] + 0.001) for (let c = 0; c < 3; c++) pos[i * 3 + c] += hn[i * 3 + c] * (engJe[i] + 0.001 - d);
      if (falte) falte(pos, i, ruhe);   // weiche Falten zum Saum hin: der Rand wellt sich, im Umriss sichtbar
    }
    if (engMisch) for (let i = 0; i < n; i++) { const q = engMisch(ruhe[i * 3 + 1]); if (q > 0) for (let c = 0; c < 3; c++) engA[i * 3 + c] += (pos[i * 3 + c] - engA[i * 3 + c]) * q; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(tri); geo.computeVertexNormals();
    const kopie = (attr, groesse, Typ) => { const a = new Typ(n * groesse); alt.forEach((v, i) => { for (let c = 0; c < groesse; c++) a[i * groesse + c] = attr[v * groesse + c]; }); return a; };
    return {
      name, mat, pos: geo.attributes.position, nor: geo.attributes.normal, uv: new THREE.BufferAttribute(new Float32Array(n * 2), 2),
      gel: new THREE.BufferAttribute(kopie(m.gel.array, 4, Uint8Array), 4), gew: new THREE.BufferAttribute(kopie(m.gew.array, 4, Uint8Array), 4, true),
      kleid: new THREE.BufferAttribute(kopie(kl, 2, Uint8Array), 2, true), idx: new THREE.BufferAttribute(new Uint16Array(tri), 1),
      teil: kopie(teil, 1, Uint8Array), ruhe: new THREE.BufferAttribute(ruhe, 3), eng: new THREE.BufferAttribute(engA, 3)
    };
  };
  // Tanktop: Achse senkrecht durch die Rumpfmitte; Hülle nur aus dem Rumpf (ohne Schultern und Arme, ohne Hosenbund und Gesäß: unter
  // der Taille fällt der Stoff einfach weiter, statt über den Bund des Modells zu knicken)
  const rumpf = new Set(['bauch', 'brustkorb', 'ruecken', 'nacken'].map((t) => k.teile.indexOf(t)));
  const HT = huelleRadien(P, I, dreiecke((t) => [0, 1, 2].every((a) => rumpf.has(teil[I[t + a]])) && Math.abs(mitte(t, 0)) <= 0.215), 0, -0.015, 0.88, 1.66);
  fallen(HT, 1.40, (w) => 0.05 + 0.25 * Math.sin(w) ** 2, (w) => 0.024 - 0.012 * Math.sin(w) ** 2);
  const top = baue('Tanktop', 'top', (v) => tanktopMaske(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) >= 0.5, (v, nv) => {
    // Oben Luft entlang der Normale; wo der Stoff fällt, waagrecht nach außen bis zur fallenden Hülle (folgt so keinem Wulst der Haut)
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], dz = z + 0.015, r = Math.max(1e-6, Math.hypot(x, dz)), w = Math.atan2(x, dz), s2 = Math.sin(w) ** 2;
    const e = 0.0065 + (0.010 - 0.004 * s2) * glatt(1.40, 0.96, y), wd = glatt(1.48, 1.30, y), ra = (Math.max(r, liesD(HT, y, w)) + e - r) * wd;
    return [x + nv.x * e * (1 - wd) + x / r * ra, y + nv.y * e * (1 - wd), z + nv.z * e * (1 - wd) + dz / r * ra];
  }, (v) => 0.0035 + 0.0085 * glatt(1.08, 0.98, P[v * 3 + 1]), (v) => { const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], ax = Math.abs(x), vorn = glatt(-0.03, 0.03, z), hals = 1.48 + 8 * ax * ax + (1.415 + 11 * ax * ax - 1.48 - 8 * ax * ax) * vorn;
    const ex = (ax - 0.235) / 0.115, ey = (y - 1.43) / 0.19; return Math.min(hals - y, (Math.hypot(ex, ey) - 1.01) * 0.13); },
  (p, i, h) => { const x = h[i * 3], y = h[i * 3 + 1], dz = h[i * 3 + 2] + 0.015, r = Math.max(0.02, Math.hypot(x, dz)), w = Math.atan2(x, dz), a = 0.0065 * glatt(1.22, 0.96, y) * (1 - 0.5 * Math.abs(Math.sin(w)));
    const q = a * (0.5 + 0.5 * Math.sin(5 * w + 1.6 * Math.sin(2 * w + y * 7) + y * 3)); p[i * 3] += x / r * q; p[i * 3 + 2] += dz / r * q; }, (y) => 0.8 * glatt(1.14, 1.0, y));
  // Shorts: je Bein eine Achse durch den Oberschenkel; innen (zum anderen Bein) fast ohne Fall
  const beine = [1, -1].map((s) => {
    const H = huelleRadien(P, I, dreiecke((t) => s * mitte(t, 0) > -0.005 && Math.abs(mitte(t, 0)) <= 0.23 && mitte(t, 1) >= 0.54 && mitte(t, 1) <= 1.06), s * 0.11, -0.025, 0.54, 1.06);
    const innen = (w) => Math.max(0, Math.cos(w + s * Math.PI / 2)) ** 2;
    fallen(H, 0.93, (w) => 0.02 + 0.6 * innen(w), (w) => 0.05 * (1 - innen(w)) + 0.008 * innen(w));
    return { H, s, innen };
  });
  const hose = baue('Shorts', 'hose', (v) => shortsMaske(P[v * 3], P[v * 3 + 1]) > 0, (v, nv) => {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], B = beine[x >= 0 ? 0 : 1];
    const dx = x - B.s * 0.11, dz = z + 0.025, r = Math.max(1e-6, Math.hypot(dx, dz)), w = Math.atan2(dx, dz), inn = B.innen(w);
    const e = (0.005 + 0.004 * glatt(1.02, 0.92, y) + 0.02 * glatt(0.92, 0.62, y)) * (1 - 0.7 * inn), wd = glatt(0.95, 0.88, y) * (1 - inn);
    const ra = (Math.max(r, liesD(B.H, y, w)) + e - r) * wd;
    return [x + nv.x * e * (1 - wd) + dx / r * ra, y + nv.y * e * (1 - wd), z + nv.z * e * (1 - wd) + dz / r * ra];
  }, 0.004, null, (p, i, h) => { const x = h[i * 3], y = h[i * 3 + 1], s = x >= 0 ? 1 : -1, dx = x - s * 0.11, dz = h[i * 3 + 2] + 0.025, r = Math.max(0.02, Math.hypot(dx, dz)), w = Math.atan2(dx, dz), inn = Math.max(0, Math.cos(w + s * Math.PI / 2)) ** 2, a = 0.009 * glatt(0.86, 0.6, y) * (1 - inn);
    const q = a * (0.5 + 0.5 * Math.sin(4 * w + 1.4 * Math.sin(2 * w + y * 11) + y * 5 + s)); p[i * 3] += dx / r * q; p[i * 3 + 2] += dz / r * q; });
  const gt = top.gel.array, hu = k.index.Hips, bein = new Set(['LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'].map((b) => k.index[b]));
  for (let i = 0; i < gt.length; i++) if (bein.has(gt[i])) gt[i] = hu;
  const gi = hose.gel.array, gw = hose.gew.array, hr = hose.ruhe.array, kn = { [k.index.LeftLeg]: k.index.LeftUpLeg, [k.index.RightLeg]: k.index.RightUpLeg };
  for (let i = 0; i < gi.length / 4; i++) {
    const vorn = glatt(-0.075, -0.02, hr[i * 3 + 2]);
    for (let j = 0; j < 4; j++) {
      const ob = kn[gi[i * 4 + j]]; if (ob === undefined) continue;
      const rest = Math.round(gw[i * 4 + j] * vorn), weg = gw[i * 4 + j] - rest;
      let z = -1; for (let q = 0; q < 4; q++) if (gi[i * 4 + q] === ob) z = q;
      if (z >= 0) { gw[i * 4 + j] = rest; gw[i * 4 + z] += weg; } else if (vorn < 0.5) gi[i * 4 + j] = ob;
    }
  }
  return [top, hose];
}
// Shirt und Shorts fallen dorthin, wo die Schwerkraft sie zieht: steht der Stoff nach oben von der Haut ab (Bauch im Liegen, Rücken
// beim Vorbeugen), rückt er bis auf ein Fünftel an die enge Hülle; hängt er nach unten (Brust im Liegestütz), hängt das Shirt etwas weiter
// Atem (Devin, 1.11.: „von der Brust her“): in der Ruhelage wölbt sich der Brustkorb um Millimeter nach außen und hebt sich, der Bauch geht
// etwas mit; der Rücken wölbt sich kaum (20 %, sonst drückt er ins Polster und sieht aufgeblasen aus); Arme (T-Pose, weit außen) und Hals bleiben. Am Stoff
// zählt der Punkt auf der Haut (ruhe), so geht das Shirt mit
// Muskelspiel (Devin, 2.11.: „der Bizeps … sich anspannt und dann wieder … relaxt“, „mehr natürlicher“): Jeder Muskel hat je Seite eine Anspannung m (uMA, uMB, uMC; FigurModell.stelle rechnet sie je Bild aus Gelenkwinkel und Last).
// Angespannt wird der Bauch kürzer und höher und rückt zu seinem Ursprung, gedehnt (m < 0) wird er flacher. In der Ruhelage (T-Pose), Mitte c, Ausdehnung s, Höhe a in m, Weg d und Verkürzung k bei voller Spannung.
// Die Fläche kippt mit (Normale), vSpiel sagt dem Pixel-Shader, wie angespannt die Stelle ist
const SPIEL_PARS_GLSL = `
uniform vec4 uMA[2];
uniform vec4 uMB[2];
uniform float uMC[2];
uniform float uMasse;
varying float vSpiel;
void dkBauch(vec3 p, vec3 c, vec3 s, float a, vec3 d, vec3 k, float m, float r, inout float h, inout vec3 g, inout float sp) {
  float wa = m * (m > 0.0 ? 1.0 : 0.5) + uMasse * r;
  if (abs(wa) < 0.003) return;
  float u = max(m, 0.0);
  vec3 z = (p - c - d * u) / (s * (vec3(1.0) - k * u));
  float q = dot(z, z);
  if (q > 7.0) return;
  float w = exp(-q * (0.45 + 0.55 * q)), v = a * wa * w;   // oben runder, zum Rand steiler als eine Glocke: so setzt sich der Muskel ab
  h += v; g -= 2.0 * v * (0.45 + 1.1 * q) * z / s; sp += u * w;
}
`;
const SPIEL_GLSL = `
#ifdef DK_STOFF
vec3 dkSp = ruhe;
#else
vec3 dkSp = position;
#endif
float dkSg = dkSp.x < 0.0 ? -1.0 : 1.0, dkMH = 0.0, dkMS = 0.0;
vec3 dkMG = vec3(0.0);
{
  vec3 p = vec3(abs(dkSp.x), dkSp.y, dkSp.z);
  vec4 ma = dkSp.x < 0.0 ? uMA[1] : uMA[0], mb = dkSp.x < 0.0 ? uMB[1] : uMB[0];
  float mc = dkSp.x < 0.0 ? uMC[1] : uMC[0];
  if (p.y > 1.02) {
    if (p.x > 0.17) {
      dkBauch(p, vec3(0.345, 1.436, -0.02), vec3(0.066, 0.044, 0.042), 0.024, vec3(-0.014, 0.0, 0.002), vec3(0.16, 0.0, 0.0), ma.x, 0.5, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.33, 1.44, -0.125), vec3(0.075, 0.047, 0.042), 0.014, vec3(-0.01, 0.0, 0.0), vec3(0.12, 0.0, 0.0), ma.y, 0.6, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.245, 1.5, -0.065), vec3(0.058, 0.05, 0.065), 0.007, vec3(-0.004, 0.004, 0.0), vec3(0.1, 0.0, 0.0), ma.w, 1.6, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.54, 1.445, -0.083), vec3(0.07, 0.06, 0.06), 0.006, vec3(-0.008, 0.0, 0.0), vec3(0.1, 0.0, 0.0), mc, 0.5, dkMH, dkMG, dkMS);
    }
    if (p.x < 0.27 && p.y < 1.48) {
      dkBauch(p, vec3(0.155, 1.3, -0.115), vec3(0.065, 0.105, 0.065), 0.026, vec3(0.01, 0.014, 0.0), vec3(0.0, 0.1, 0.0), ma.z, 0.5, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.11, 1.17, -0.125), vec3(0.06, 0.095, 0.055), 0.012, vec3(0.004, 0.008, 0.0), vec3(0.0, 0.08, 0.0), ma.z, 0.6, dkMH, dkMG, dkMS);
    }
  } else {
    if (p.y > 0.5) {
      dkBauch(p, vec3(0.115, 0.78, 0.05), vec3(0.06, 0.13, 0.05), 0.013, vec3(0.0, 0.012, 0.0), vec3(0.0, 0.1, 0.0), mb.x, 0.8, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.07, 0.625, 0.03), vec3(0.03, 0.045, 0.035), 0.008, vec3(0.0, 0.006, 0.0), vec3(0.0, 0.08, 0.0), mb.x, 0.6, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.18, 0.76, 0.0), vec3(0.03, 0.11, 0.06), 0.007, vec3(0.0, 0.008, 0.0), vec3(0.0, 0.08, 0.0), mb.x, 0.8, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.105, 0.74, -0.115), vec3(0.06, 0.12, 0.04), 0.012, vec3(0.0, -0.012, 0.0), vec3(0.0, 0.12, 0.0), mb.y, 0.7, dkMH, dkMG, dkMS);
      dkBauch(p, vec3(0.095, 0.93, -0.125), vec3(0.06, 0.07, 0.05), 0.012, vec3(0.0, 0.006, 0.0), vec3(0.0, 0.06, 0.0), mb.z, 0.7, dkMH, dkMG, dkMS);
    } else {
      dkBauch(p, vec3(0.125, 0.36, -0.14), vec3(0.055, 0.075, 0.04), 0.013, vec3(0.0, 0.014, 0.0), vec3(0.0, 0.14, 0.0), mb.w, 0.5, dkMH, dkMG, dkMS);
    }
  }
  dkMG.x *= dkSg;
  dkMG -= normal * dot(dkMG, normal);
}
vSpiel = min(1.0, dkMS);
objectNormal = normalize(objectNormal - dkMG);
`;
const ATEM_GLSL = `
#ifdef DK_STOFF
vec3 dkAtemP = ruhe;
#else
vec3 dkAtemP = position;
#endif
float dkAtemQ = uAtem * (1.0 - smoothstep(0.16, 0.24, abs(dkAtemP.x)));
float dkAtemB = dkAtemQ * dkG(dkAtemP.y, 1.3, 0.1);
dkPecV += normal * (0.2 + 0.8 * smoothstep(-0.04, 0.07, dkAtemP.z)) * (dkAtemB * 0.018 + dkAtemQ * 0.005 * dkG(dkAtemP.y, 1.12, 0.08));
dkPecV.y += dkAtemB * 0.009;
`;
// Gesicht (Devin, 2.11.: „Gesicht … ein bisschen verziehen, weil es schwer ist … kleine Details“): das Modell hat keine Gesichtsknochen, darum hier in
// der Ruhelage um die gemessenen Stellen (Lidspalte x 3,4 cm, y 1,692–1,702; Mundlinie y 1,6235, Winkel x 2,7 cm). uMimik: x = Anstrengung (Brauen
// runter und zusammen, Augen kneifen, Wangen hoch, Mundwinkel auseinander und zurück, Lippen pressen; dazu Falten in der Farbe, MIMIK_FARBE, weil die
// Normalen sich nicht mitbewegen), y = Lidschlag (Oberlid über den Augapfel), z = Mund (beim Ausatmen öffnen sich die Lippen). Haut und Brauen gemeinsam, Stoff
// nicht. w = Lächeln (Pause, Blick zur Kamera). Augapfel (DK_AUGE): dreht sich um seine Mitte (uBlick, kleine Winkel), die Lider bleiben
const MIMIK_GLSL = `
#ifdef DK_AUGE
{
  vec3 dkAugeD = position - vec3(position.x < 0.0 ? -0.034 : 0.034, 1.699, 0.066);
  dkPecV += vec3(uBlick.x * dkAugeD.z, uBlick.y * dkAugeD.z, -uBlick.x * dkAugeD.x - uBlick.y * dkAugeD.y);
}
#elif !defined(DK_STOFF)
if (position.y > 1.56 && position.z > 0.0 && abs(position.x) < 0.1) {
  float dkX = abs(position.x), dkS = position.x < 0.0 ? -1.0 : 1.0, dkY = position.y;
  float dkAn = uMimik.x, dkMu = uMimik.z;
  float dkBr = dkG(dkX, 0.034, 0.034) * dkG(dkY, 1.716, 0.016), dkBi = dkG(dkX, 0.014, 0.016) * dkG(dkY, 1.712, 0.02);
  dkPecV.y -= dkAn * (0.004 * dkBr + 0.0035 * dkBi);
  dkPecV.x -= dkS * dkAn * 0.0035 * dkBi;
  #ifndef DK_HAAR
  float dkLid = clamp(uMimik.y + 0.3 * dkAn, 0.0, 1.0);
  float dkOb = smoothstep(1.696, 1.7, dkY) * dkG(dkX, 0.034, 0.026) * dkG(dkY, 1.704, 0.012);
  float dkUn = (1.0 - smoothstep(1.694, 1.697, dkY)) * dkG(dkX, 0.034, 0.026) * dkG(dkY, 1.69, 0.009);
  dkPecV.y += dkLid * (0.002 * dkUn - 0.0098 * dkOb);
  dkPecV.z += dkLid * 0.0018 * dkOb;
  float dkWa = dkG(dkX, 0.046, 0.018) * dkG(dkY, 1.662, 0.016);
  dkPecV.y += dkAn * 0.004 * dkWa; dkPecV.z += dkAn * 0.002 * dkWa;
  float dkMw = dkG(dkX, 0.027, 0.016) * dkG(dkY, 1.6235, 0.012);
  dkPecV.x += dkS * dkAn * 0.005 * dkMw; dkPecV.y += dkAn * 0.0003 * dkMw; dkPecV.z -= dkAn * 0.0015 * dkMw;
  dkPecV += uMimik.w * (vec3(dkS * 0.0032, 0.0042, -0.0012) * dkMw + vec3(0.0, 0.0022, 0.0012) * dkWa + vec3(0.0, 0.0009, 0.0) * dkUn);
  float dkLo = dkG(dkX, 0.0, 0.026) * dkG(dkY, 1.629, 0.006), dkLu = dkG(dkX, 0.0, 0.026) * dkG(dkY, 1.617, 0.008);
  dkPecV.y += (dkMu * 0.0018 - dkAn * 0.0008) * dkLo + (dkAn * 0.0008 - dkMu * 0.005) * dkLu;
  dkPecV.y -= dkMu * 0.003 * dkG(dkX, 0.0, 0.04) * dkG(dkY, 1.59, 0.018);
  #endif
}
#endif
`;
// Falten bei Anstrengung: Nasenflügel zum Mundwinkel (auch beim Lächeln), zwischen den Brauen; dazu wird das Gesicht unter Last etwas röter
const MIMIK_FARBE = `
#if !defined(DK_STOFF) && !defined(DK_AUGE)
if (uMimik.x + uMimik.w > 0.01 && vRuhe.y > 1.6 && vRuhe.z > 0.03) {
  float dkFX = abs(vRuhe.x), dkFY = vRuhe.y, dkFL = dkFX - (0.021 + 0.016 * clamp((1.655 - dkFY) / 0.03, 0.0, 1.0));
  float dkFN = exp(-dkFL * dkFL / 0.00001) * smoothstep(1.627, 1.636, dkFY) * (1.0 - smoothstep(1.65, 1.66, dkFY));
  float dkFZ = (dkFX - 0.007) / 0.0024;
  float dkFB = exp(-dkFZ * dkFZ) * smoothstep(1.69, 1.7, dkFY) * (1.0 - smoothstep(1.715, 1.725, dkFY));
  diffuseColor.rgb *= 1.0 - uMimik.x * (0.3 * dkFN + 0.4 * dkFB) - uMimik.w * 0.22 * dkFN;
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.05, 0.9, 0.86), uMimik.x * smoothstep(1.6, 1.66, dkFY) * (1.0 - smoothstep(1.74, 1.78, dkFY)) * smoothstep(0.03, 0.06, vRuhe.z));
}
#endif
`;
const STOFF_FALL_GLSL = `
#ifdef DK_STOFF
{
  vec4 dkE = bindMatrix * vec4(dkEng, 1.0);
  vec4 dkES = boneMatX * dkE * skinWeight.x + boneMatY * dkE * skinWeight.y + boneMatZ * dkE * skinWeight.z + boneMatW * dkE * skinWeight.w;
  vec3 dkEngS = (bindMatrixInverse * dkES).xyz;
  vec3 dkAb = transformed - dkEngS;
  vec3 dkW = mat3(modelMatrix) * dkAb;
  float dkL = length(dkW);
  float dkHoch = dkL > 1e-5 ? dkW.y / dkL : 0.0;
  float dkF = 1.0 - 0.8 * smoothstep(0.15, 0.85, dkHoch);
  #if DK_STOFF == 1
  dkF += 0.25 * smoothstep(0.3, 0.9, -dkHoch);
  #endif
  transformed = dkEngS + dkAb * dkF;
  #if DK_STOFF == 1
  vec3 dkSw = uStoff[0];
  #else
  vec3 dkSw = ruhe.x > 0.0 ? uStoff[1] : uStoff[2];
  #endif
  // Nach außen darf er frei schwingen, nach innen nur bis an die Haut; je näher am Saum, desto mehr. Dazu eine Welle um den Saum, solange er in Bewegung ist (uWelle)
  #if DK_STOFF == 1
  float dkSaumW = 1.0 - smoothstep(0.98, 1.34, ruhe.y), dkWe = uWelle.x, dkWw = atan(ruhe.x, ruhe.z + 0.015);
  #else
  float dkSaumW = 1.0 - smoothstep(0.62, 0.93, ruhe.y), dkWe = ruhe.x > 0.0 ? uWelle.y : uWelle.z, dkWw = atan(ruhe.x - sign(ruhe.x) * 0.11, ruhe.z + 0.025);
  #endif
  // Waagrecht frei nach außen, nach innen und zur Seite nur so weit, wie Luft da ist (sonst rutschte der Saum an der Hüfte unter die Shorts); hoch und runter wenig und überall gleich
  vec3 dkNh = vec3(dkAb.x, 0.0, dkAb.z), dkSh = vec3(dkSw.x, 0.0, dkSw.z);
  float dkNl = length(dkNh), dkShL = length(dkSh), dkRaum = 0.85 * dkNl * dkF;
  float dkAus = dkNl > 1e-5 && dkShL > 1e-5 ? dot(dkSh, dkNh) / (dkNl * dkShL) : 0.0;
  float dkMax = mix(dkRaum, 0.05, smoothstep(0.3, 0.8, dkAus));
  transformed += dkSh * dkSaumW * (dkShL > dkMax ? dkMax / dkShL : 1.0);
  transformed.y += clamp(dkSw.y, -0.012, 0.012) * dkSaumW;
  transformed += dkAb * dkF * dkSaumW * dkWe * (sin(3.0 * dkWw + uStoffZeit * 5.1 + ruhe.y * 9.0) + 0.55 * sin(5.0 * dkWw - uStoffZeit * 6.7 + ruhe.y * 14.0));
}
#endif
`;
// Falten als Höhenfeld auf die Normale (Oberflächen-Gradient aus Bildschirm-Ableitungen, unabhängig von Auflösung und Abstand).
// WebGL 1 kennt dFdx nur mit Erweiterung (das Physical-Material schaltet sie ein); ohne sie bleibt der Stoff glatt
const STOFF_FALTEN_GLSL = `
#if __VERSION__ >= 300 || defined(GL_OES_standard_derivatives)
{
  float dkH = dkStoffH;
  vec3 dkP = -vViewPosition, dkPx = dFdx(dkP), dkPy = dFdy(dkP);
  vec3 dkR1 = cross(dkPy, normal), dkR2 = cross(normal, dkPx);
  float dkDet = dot(dkPx, dkR1);
  if (abs(dkDet) > 1e-12) normal = normalize(normal - (dkR1 * dFdx(dkH) + dkR2 * dFdy(dkH)) / dkDet);
}
#endif
`;
// Stoff und Haut im Bild (Devin, 2.11.: „mehr Textur“; Vorbild das Video vom 31.10.: geripptes graues Tanktop mit Einfass, schwarze weite Shorts mit kleinem Aufdruck, gerippte Socken).
// uDetail ist eine kleine Kachel aus detailTextur(): R Poren, G Hautlinien, B Strick, A Fasern. dkLinie: Naht, verschwindet weich, wenn sie kleiner als ein Bildpunkt wird
const STOFF_PARS_GLSL = `
uniform sampler2D uDetail;
uniform sampler2D uLogo;
uniform float uLogoAn;
uniform float uSchweiss;
varying vec3 vRN;
#ifdef DK_STOFF
varying vec3 vH;
#endif
#ifdef DK_SCHUH
varying vec2 vSchuh;
#endif
#if __VERSION__ >= 300 || defined(GL_OES_standard_derivatives)
#define DK_FW(x) fwidth(x)
#else
#define DK_FW(x) 0.002
#endif
float dkQu(float v) { return v * v; }
float dkLinie(float d, float b) { float f = max(DK_FW(d), 1e-5); return clamp(1.0 - abs(d) / (b + f), 0.0, 1.0) * min(1.0, b / f + 0.2); }
vec4 dkKachel(vec3 p, float s) { return mix(texture2D(uDetail, p.xy * s), texture2D(uDetail, p.zy * s), smoothstep(0.35, 0.65, abs(vRN.x))); }
`;
const STOFF_FARBE_GLSL = `
float dkStoffH = 0.0;
#ifdef DK_STOFF
vec4 dkK;
#if DK_STOFF == 1
if (dkRandTop(vRuhe) < 0.0 || vH.y < 0.955 || abs(vRuhe.x) > 0.24 || vRuhe.y > 1.63) discard;
{
  dkK = dkKachel(vRuhe, 12.0);
  float dkR = dkRandTop(vRuhe), dkS = vH.y - 0.955;
  float dkBand = 1.0 - smoothstep(0.0095, 0.0108, dkR);
  float dkSaumB = 1.0 - smoothstep(0.0165, 0.0178, dkS);
  float dkN = max(dkLinie(dkR - 0.0112, 0.0007), max(dkLinie(dkS - 0.0182, 0.0007), dkLinie(dkS - 0.0135, 0.0006)));
  float dkSeite = dkLinie(vRuhe.z + 0.015, 0.0009) * smoothstep(0.1, 0.13, abs(vRuhe.x)) * step(vRuhe.y, 1.3);
  vec3 dkC = uOberteil * (1.0 + 0.26 * (dkK.a - 0.5)) * (1.0 + 0.1 * (dkK.b - 0.5) * (1.0 - dkBand)) * (1.0 + 0.05 * dkBand) * (1.0 - 0.09 * dkSaumB) * (1.0 - 0.17 * max(dkN, dkSeite));
  dkC *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.0022, min(dkR, dkS)));
  if (uSchweiss > 0.01) {
    float dkMa = max(exp(-dkQu(vRuhe.x / 0.085) - dkQu((vRuhe.y - 1.31) / 0.15)), exp(-dkQu(vRuhe.x / 0.11) - dkQu((vRuhe.y - 1.33) / 0.17)) * step(vRuhe.z, 0.0));
    dkMa = max(dkMa, exp(-dkQu((abs(vRuhe.x) - 0.17) / 0.05) - dkQu((vRuhe.y - 1.32) / 0.07)));
    float dkNass = smoothstep(0.42, 0.95, dkMa * (0.42 + 0.72 * uSchweiss) + 0.22 * (texture2D(uDetail, vRuhe.xy * 1.1 + vRuhe.zy * 0.5, 4.0).a - 0.5));
    dkC *= 1.0 - 0.24 * dkNass;
  }
  diffuseColor.rgb = dkC;
  dkStoffH = 0.00028 * (dkK.b - 0.5) * (1.0 - 0.8 * dkBand) + 0.00055 * dkBand + 0.00055 * dkSaumB - 0.00045 * max(dkN, dkSeite);
}
#else
if (vH.y < 0.6 || vH.y > 0.935 || abs(vRuhe.x) > 0.215) discard;   // darüber liegt die aufgemalte Hose eng an: so kommt der Bund nie durch den Saum des Shirts
{
  dkK = dkKachel(vRuhe, 19.0);
  float dkAx = abs(vRuhe.x), dkW = atan(dkAx - 0.11, vRuhe.z + 0.025), dkS = vH.y - 0.6;
  float dkSaumB = 1.0 - smoothstep(0.0195, 0.0208, dkS);
  float dkBund = smoothstep(0.972, 0.976, vH.y);
  float dkN = max(dkLinie(dkS - 0.0212, 0.0007), max(dkLinie(dkS - 0.0165, 0.0006), dkLinie(vH.y - 0.9715, 0.0008)));
  float dkSeite = dkLinie((dkW - 1.62) * 0.1, 0.001) * step(vH.y, 0.972);
  vec2 dkTq = vec2((dkW - 0.72) * 0.1, vH.y - 0.965), dkTe = vec2(0.075, -0.17);
  float dkTu = clamp(dot(dkTq, dkTe) / dot(dkTe, dkTe), 0.0, 1.0);
  float dkTasche = dkLinie(length(dkTq - dkTe * dkTu), 0.0012) * step(vH.y, 0.972);
  float dkBr = dkBund * (0.5 + 0.5 * sin(dkW * 46.0));
  vec3 dkC = uHose * (1.0 + 0.5 * (dkK.a - 0.5)) * (1.0 + 0.3 * (dkK.b - 0.5)) * (1.0 + 0.18 * dkSaumB) * (1.0 - 0.5 * max(dkN, max(dkSeite, dkTasche)));
  if (uLogoAn > 0.5 && vRuhe.x > 0.0) {
    vec2 dkLu = vec2((dkW - 0.98) * 0.1 / 0.052 + 0.5, (vH.y - 0.695) / 0.052 + 0.5);
    if (all(greaterThan(dkLu, vec2(0.0))) && all(lessThan(dkLu, vec2(1.0)))) dkC = mix(dkC, vec3(0.62), texture2D(uLogo, dkLu).a * 0.9);
  }
  diffuseColor.rgb = dkC;
  dkStoffH = 0.00018 * (dkK.b - 0.5) + 0.0005 * dkSaumB + 0.0007 * dkBund + 0.00035 * dkBr - 0.0004 * max(dkN, dkSeite) - 0.0005 * dkTasche;
}
#endif
diffuseColor.rgb *= (gl_FrontFacing ? 1.0 : 0.5);
diffuseColor.rgb *= 1.0 + DK_FALTE_FARBE * dkFalten(vRuhe);
dkStoffH += dkFalten(vRuhe);
float dkStoff = 1.0;
#elif defined(DK_SCHUH)
float dkStoff = 1.0;
__SCHUH__
#else
float dkBund = abs(vRuhe.x) <= 0.215 && vRuhe.y >= 0.6 ? 1.0 - smoothstep(1.03, 1.04, vRuhe.y) : 0.0;
float dkHose = max(max(vKleid.x, dkHosenbein(vRuhe)), dkBund);
float dkTop = dkTanktop(vRuhe) * (1.0 - dkBund);
float dkSock = dkSocke(vRuhe);
diffuseColor.rgb = mix(diffuseColor.rgb, uHose, dkHose);
diffuseColor.rgb = mix(diffuseColor.rgb, uOberteil, dkTop);
#ifdef DK_HAAR
{
  vec4 dkHk = texture2D(uDetail, vRuhe.xy * 52.0 + vRuhe.zy * vec2(33.0, 9.0));
  diffuseColor.rgb *= 0.58 + 0.84 * dkHk.a * (0.55 + 0.45 * dkHk.r);
  dkStoffH += 0.00045 * dkHk.a;
}
#endif
if (dkSock > 0.0) {
  // Socke: gerippt, oben ein Bund, unten Frottee
  vec4 dkK = dkKachel(vRuhe, 14.0);
  float dkRi = dkRippe(vRuhe), dkFf = 1.0 - smoothstep(0.0, 0.025, 0.245 - vRuhe.y) * 0.0;
  float dkOben = smoothstep(0.205, 0.209, vRuhe.y);
  vec3 dkC = uSocke * (1.0 - 0.05 * (1.0 - dkRi)) * (1.0 + 0.05 * (dkK.a - 0.5)) * (1.0 - 0.05 * dkLinie(vRuhe.y - 0.207, 0.0009));
  dkC *= 1.0 - 0.12 * (1.0 - smoothstep(0.11, 0.17, vRuhe.y));
  diffuseColor.rgb = mix(diffuseColor.rgb, dkC, dkSock);
  dkStoffH = dkSock * (0.00032 * dkRi + 0.00016 * (dkK.b - 0.5));
}
float dkStoff = max(max(dkHose, dkTop), dkSock);
#ifdef USE_NORMALMAP_TANGENTSPACE
if (vKleid.y > 0.5 && vRuhe.y < 0.09) discard;   // Fuß im Schuh
// Haut aus der Nähe: Poren und feine Linien (Kachel in der Ruhelage, von drei Seiten)
vec3 dkTN = abs(vRN); dkTN *= dkTN; dkTN *= dkTN; dkTN /= dkTN.x + dkTN.y + dkTN.z;
vec4 dkMi = texture2D(uDetail, vRuhe.zy * 24.0) * dkTN.x + texture2D(uDetail, vRuhe.xz * 24.0) * dkTN.y + texture2D(uDetail, vRuhe.xy * 24.0) * dkTN.z;
float dkHautA = 1.0 - dkStoff;
diffuseColor.rgb *= 1.0 - dkHautA * (0.05 * (1.0 - dkMi.r) + 0.035 * (1.0 - dkMi.g));
dkStoffH += dkHautA * (0.00006 * dkMi.r + 0.00004 * dkMi.g);
#endif
#endif
`;
// Sneaker im Bild (Ruhelage, |x|): Obermaterial aus Strick mit glatten Besätzen an Zehenkappe, Ferse und um die Schnürung, Nähte, Ösen, Zwischensohle mit Rille und feinem Korn, Laufsohle mit Profil, kleines Logo außen an der Ferse
const SCHUH_FARBE_GLSL = `
#ifdef DK_SCHUH
float dkSchuhRau = 0.72;
{
  float dkZ = vRuhe.z, dkAx = abs(vRuhe.x), dkY = vRuhe.y, dkZn = vSchuh.x;
  vec4 dkK = dkKachel(vRuhe, 26.0);
  vec3 dkC = uSchuh;
  if (dkZn < 0.5) {
    // Strick in der Fläche, Besätze glatt und etwas heller, an den Rändern genäht
    float dkMi = mix(0.122, 0.135, smoothstep(-0.03, 0.06, dkZ));
    float dkAb = abs(dkAx - dkMi);
    float dkStaeb = smoothstep(0.0095, 0.0115, dkAb) * (1.0 - smoothstep(0.0345, 0.0365, dkAb)) * (1.0 - smoothstep(0.06, 0.066, dkZ)) * smoothstep(0.04, 0.05, dkY);
    float dkZunge = (1.0 - smoothstep(0.0095, 0.0115, dkAb)) * (1.0 - smoothstep(0.06, 0.066, dkZ)) * smoothstep(-0.05, -0.04, dkZ);
    float dkKappeK = dkZ - (0.092 + 2.2 * (dkAx - 0.133) * (dkAx - 0.133) * 8.0);
    float dkKappe = smoothstep(-0.0008, 0.0008, dkKappeK);
    float dkFerseK = (-0.092 - dkZ) + 0.32 * (0.075 - dkY) * 0.5;
    float dkFerse = smoothstep(-0.0008, 0.0008, dkFerseK);
    float dkSeitK = (dkY - 0.036) - 0.42 * (0.02 - dkZ);   // Streifen an der Seite, von der Sohle schräg nach oben zur Schnürung
    float dkSeitB = smoothstep(-0.0008, 0.0008, dkSeitK) * (1.0 - smoothstep(0.0115, 0.0131, dkSeitK)) * smoothstep(-0.09, -0.078, dkZ) * (1.0 - smoothstep(0.04, 0.052, dkZ));
    float dkBesatz = max(max(dkStaeb, dkKappe), max(dkFerse, dkSeitB));
    float dkNaht = max(dkLinie(dkKappeK - 0.0017, 0.0005), dkLinie(dkFerseK - 0.0017, 0.0005));
    dkNaht = max(dkNaht, dkStaeb * max(dkLinie(dkAb - 0.0125, 0.0005), dkLinie(dkAb - 0.0335, 0.0005)));
    dkNaht = max(dkNaht, max(dkLinie(dkSeitK - 0.0017, 0.0004), dkLinie(dkSeitK - 0.0098, 0.0004)) * smoothstep(-0.09, -0.078, dkZ) * (1.0 - smoothstep(0.04, 0.052, dkZ)));
    float dkOese = 0.0;
    for (int dkI = 0; dkI < 6; dkI++) { float dkOz = 0.052 - 0.016 * float(dkI); dkOese = max(dkOese, 1.0 - smoothstep(0.0013, 0.0021, length(vec2(dkAb - 0.0135, dkZ - dkOz)))); }
    vec3 dkStrick = uSchuh * (0.9 + 0.2 * dkK.b) * (1.0 + 0.1 * (dkK.a - 0.5));
    vec3 dkLeder = uSchuh * vec3(1.03, 1.03, 1.02) * (1.0 + 0.03 * (dkK.a - 0.5));
    dkC = mix(dkStrick, dkLeder, dkBesatz);
    dkC = mix(dkC, uSchuh * vec3(0.8, 0.86, 0.83), dkSeitB * 0.85);
    dkC = mix(dkC, uSchuh * vec3(0.72, 0.8, 0.76), dkFerse * 0.5);
    dkC = mix(dkC, uSchuh * 0.82 * (0.9 + 0.2 * dkK.b), dkZunge);
    dkC *= (1.0 - 0.3 * dkNaht) * (1.0 - 0.72 * dkOese);
    if (uLogoAn > 0.5 && vRuhe.x * vRuhe.x > 0.0 && dkFerse > 0.5) {
      vec2 dkLu = vec2((-0.118 - dkZ) / 0.03 * sign(vRuhe.x) + 0.5, (dkY - 0.066) / 0.03 + 0.5);
      if (dkAx > 0.13 && all(greaterThan(dkLu, vec2(0.0))) && all(lessThan(dkLu, vec2(1.0)))) dkC = mix(dkC, vec3(0.2), texture2D(uLogo, dkLu).a * 0.8);
    }
    // Knick und Abnutzung am Ballen: feine Querfalten
    float dkKnick = smoothstep(0.022, 0.05, dkZ) * (1.0 - smoothstep(0.058, 0.09, dkZ)) * smoothstep(0.04, 0.06, dkY);
    dkStoffH = 0.0003 * (dkK.b - 0.5) * (1.0 - dkBesatz) + 0.0006 * dkBesatz - 0.0003 * dkNaht - 0.0008 * dkOese + 0.00035 * dkKnick * sin(dkZ * 480.0 + 3.0 * sin(dkAx * 80.0));
    dkSchuhRau = mix(0.78, 0.5, dkBesatz);
  } else if (dkZn < 1.5) {
    // Zwischensohle: Schaum, weich und leicht körnig, um die Rille etwas dunkler
    float dkKorn = texture2D(uDetail, vRuhe.zy * 42.0).r;
    float dkRille = smoothstep(0.32, 0.45, vSchuh.y) * (1.0 - smoothstep(0.55, 0.68, vSchuh.y));
    dkC = vec3(0.78, 0.78, 0.75) * (1.0 - 0.07 * (1.0 - dkKorn)) * (1.0 - 0.32 * dkRille);
    dkC *= 1.0 - 0.3 * smoothstep(0.82, 1.0, vSchuh.y);
    dkStoffH = 0.00012 * dkKorn;
    dkSchuhRau = 0.62;
  } else if (dkZn < 2.5) {
    // Laufsohle: Gummi mit Waffelprofil
    vec2 dkP = vRuhe.xz * 200.0;
    float dkWaf = smoothstep(-0.2, 0.2, sin(dkP.x + dkP.y) * sin(dkP.x - dkP.y));
    dkC = vec3(0.34, 0.38, 0.37) * (0.86 + 0.14 * dkWaf);
    dkStoffH = 0.0006 * dkWaf * step(0.98, vSchuh.y);
    dkSchuhRau = 0.86;
  } else if (dkZn < 3.5) {
    // Schnürsenkel: gewebt
    float dkGew = 0.5 + 0.5 * sin(vSchuh.y * 90.0);
    dkC = vec3(0.86, 0.86, 0.85) * (0.9 + 0.12 * dkGew);
    dkStoffH = 0.00012 * dkGew;
    dkSchuhRau = 0.9;
  } else {
    // Polster am Rand: weicher Stoff
    dkC = vec3(0.7, 0.71, 0.71) * (0.86 + 0.26 * dkK.a);
    dkStoffH = 0.00015 * (dkK.a - 0.5);
    dkSchuhRau = 0.95;
  }
  diffuseColor.rgb = dkC;
}
#endif
`;
// Baumwolle: matt, mit leichtem Schimmer an den Kanten (hebt die schwarzen Shorts vom dunklen Hintergrund ab)
function stoffMaterial(art) {
  const farbe = new THREE.Color(art === 1 ? FARBEN.oberteil : FARBEN.hose);
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide, sheen: art === 1 ? 0.35 : 0.6, sheenRoughness: 0.65,
    sheenColor: farbe.lerp(new THREE.Color(0xffffff), 0.2) });
  m.defines = { ...m.defines, DK_STOFF: art, DK_FALTE_FARBE: art === 1 ? '22.0' : '46.0' };
  return m;
}
// Kachel für die Nahaufnahme (einmal): R Poren, G feine Hautlinien, B Strick (Rippen, 32 je Kachel), A Fasern. Nahtlos, die kleineren Stufen werden von selbst glatt: von weitem bleibt nichts als Flimmern übrig
let _detail;
function detailTextur() {
  if (_detail) return _detail;
  const N = 256, d = new Uint8Array(N * N * 4), fr = (v) => v - Math.floor(v), zuf = (i, j, k) => fr(Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453);
  const rausch = (x, y, mx, my, k) => {
    const fx = x / N * mx, fy = y / N * my, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const g = (a, b) => zuf((a % mx + mx) % mx, (b % my + my) % my, k);
    return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
  };
  const pore = new Float32Array(N * N).fill(1);
  for (let a = 0; a < 40; a++) for (let b = 0; b < 40; b++) {
    const cx = (a + zuf(a, b, 1)) * N / 40, cy = (b + zuf(a, b, 2)) * N / 40, r = 0.75 + 0.8 * zuf(a, b, 3), st = 0.45 + 0.55 * zuf(a, b, 4);
    for (let y = Math.floor(cy - 4); y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
      const q = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r), i = ((y + N) % N) * N + (x + N) % N;
      pore[i] = Math.min(pore[i], 1 - st * Math.exp(-q));
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4, w1 = 1.7 * rausch(x, y, 7, 7, 5), w2 = 1.7 * rausch(x, y, 9, 9, 6);
    const l1 = Math.abs(Math.sin(Math.PI * (x / N * 13 + y / N * 8 + w1))), l2 = Math.abs(Math.sin(Math.PI * (x / N * -9 + y / N * 14 + w2)));
    const rx = Math.cos(2 * Math.PI * x / N * 32), ry = Math.cos(2 * Math.PI * y / N * 40 + (Math.floor(x / 8) % 2) * Math.PI);
    const faser = 0.5 * rausch(x, y, 128, 14, 7) + 0.3 * rausch(x, y, 64, 32, 8) + 0.2 * rausch(x, y, 16, 16, 9);
    d[i] = 255 * pore[y * N + x]; d[i + 1] = 255 * Math.min(1, 0.25 + 0.75 * Math.sqrt(Math.min(l1, l2)) * (0.75 + 0.5 * rausch(x, y, 24, 24, 10)));
    d[i + 2] = 255 * (0.5 + 0.5 * (0.72 * rx + 0.28 * ry)); d[i + 3] = 255 * Math.max(0, Math.min(1, 0.5 + 2.0 * (faser - 0.5)));
  }
  _detail = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  _detail.wrapS = _detail.wrapT = THREE.RepeatWrapping; _detail.magFilter = THREE.LinearFilter; _detail.minFilter = THREE.LinearMipmapLinearFilter;
  _detail.generateMipmaps = true; _detail.anisotropy = 4; _detail.needsUpdate = true;
  return _detail;
}
// Wertrauschen 0…1 (für den Filz)
const FILZ_GLSL = `
float dkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dkFilz(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dkHash(i), dkHash(i + vec3(1, 0, 0)), f.x), mix(dkHash(i + vec3(0, 1, 0)), dkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dkHash(i + vec3(0, 0, 1)), dkHash(i + vec3(1, 0, 1)), f.x), mix(dkHash(i + vec3(0, 1, 1)), dkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

export class FigurModell {
  constructor(k = geladen) {
    if (!k) throw new Error('Körper noch nicht geladen (ladeKoerper())');
    this.k = k;
    drehKnochen(k);   // Drehknochen für Oberarm und Unterarm: Knochenliste und Hautgewichte, einmal je geladenem Körper (vor allem, was die Haut ausliest)
    this.gruppe = new THREE.Group();
    // Teile wie in class Figur (Ansicht fragt teile[name], um Seitennamen _l/_r zu bilden)
    this.teile = {}; for (const t of k.teile) this.teile[t] = true;
    this.knochen = k.knochen.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; return b; });
    this.skelett = new THREE.Skeleton(this.knochen, this.knochen.map(() => new THREE.Matrix4()));
    this.A = this.knochen.map((b) => b.matrixWorld);
    // Leuchten: x = arbeitender Muskel, y = Coach erklärt (pro Punkt, weich zwischen Teilen)
    this.matHinweis = { color: new THREE.Color(FARBEN.cyan), emissive: new THREE.Color(FARBEN.cyan), emissiveIntensity: 0.9 };
    const mh = this.matHinweis;
    this.u = {
      uGlut: { value: 0.5 }, uGlutFarbe: { value: new THREE.Color(FARBEN.glut) }, uMuskelFarbe: { value: new THREE.Color(FARBEN.gold) },
      uHinweisFarbe: { value: mh.color }, uHinweis: { get value() { return mh.emissiveIntensity; } },
      uHose: { value: new THREE.Color(FARBEN.hose) }, uSchuh: { value: new THREE.Color(FARBEN.schuh) },
      uOberteil: { value: new THREE.Color(FARBEN.oberteil) }, uSocke: { value: new THREE.Color(FARBEN.socke) },
      uWelle: { value: new THREE.Vector3() }, uStoffZeit: { value: 0 }, uDetail: { value: detailTextur() }, uLogo: { value: logoTextur() }, uLogoAn: { value: logoTextur() ? 1 : 0 }, uSchweiss: { value: 0 },
      uPec: { value: new THREE.Vector2() }, uAtem: { value: 0 }, uSpann: { value: 0 }, uMA: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uMB: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uMC: { value: [0, 0] }, uMasse: { value: 0 }, uStoff: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }, uMimik: { value: new THREE.Vector4() }, uBlick: { value: new THREE.Vector2() }
    };
    const t = k.tex || {};   // ohne Texturen (Prüfung in Node): nur Form
    const stoff = {
      // Haut (Devin, 2.11.: „mehr realistischer … mehr Textur, mehr Körperzeichen“; die Karten baut textur/baue-haut.mjs): Relief in Rot und Grün in voller Stärke (Grün zeigt wie beim Modell nach oben,
      // darum y negativ), im Blaukanal der Glanz; weicher warmer Schimmer an den Kanten (sheen), leichter Glanz (clearcoat)
      haut: () => new THREE.MeshPhysicalMaterial({ map: t.haut, normalMap: t['haut-n'], normalScale: new THREE.Vector2(1, -1), roughness: 0.5, metalness: 0,
        sheen: 0.45, sheenColor: new THREE.Color(0xffb48c), sheenRoughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.35, color: new THREE.Color(0xfff2ea) }),
      augen: () => { const m = new THREE.MeshStandardMaterial({ map: t.augen, roughness: 0.14 }); m.defines = Object.assign({}, m.defines, { DK_AUGE: 1 }); return m; },   // Augapfel bleibt, die Lider gehen darüber
      // Haar-Textur ist grau (Quaternius färbt im Spiel ein): hier hellbraun wie Devins Haare (bis 1.11. dunkelbraun)
      haar: () => { const m = new THREE.MeshStandardMaterial({ map: t.haar, color: 0x8a6a48, roughness: 0.85, side: THREE.DoubleSide }); m.defines = Object.assign({}, m.defines, { DK_HAAR: 1 }); return m; },   // Brauen hier: bleiben beim Lidschlag stehen
      schuh: () => { const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, side: THREE.DoubleSide }); m.defines = Object.assign({}, m.defines, { DK_SCHUH: 1 }); return m; },
      // Lockere Kleidung (kleidungDaten): DK_STOFF 1 = Tanktop, 2 = Shorts; Kante, Farbe und Fall in shader()
      top: () => stoffMaterial(1), hose: () => stoffMaterial(2)
    };
    if (!k.gesicht) { gesichtFormen(k); k.gesicht = true; }   // einmal je geladenem Körper, vor allem, was die Haut ausliest
    if (!k.schuhe) k.schuhe = turnschuhDaten(k) || false;   // einmal je geladenem Körper
    if (!k.fein) { hautVerfeinern(k); k.fein = true; }   // nach den Schuhen (auf das grobe Netz abgestimmt)
    if (!k.kleidung) k.kleidung = kleidungDaten(k);   // aus dem feinen Netz: liegt genau über der Haut, sonst kam die glatte Haut an den Kanten durch den Stoff (bis 2.11. gezackte Armlöcher)
    this.meshes =[...k.meshes, ...(k.schuhe ? [k.schuhe] : []), ...k.kleidung].map((m) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', m.pos); geo.setAttribute('normal', m.nor); geo.setAttribute('uv', m.uv);
      geo.setAttribute('skinIndex', m.gel); geo.setAttribute('skinWeight', m.gew); geo.setAttribute('kleid', m.kleid); geo.setIndex(m.idx);
      if (m.ruhe) { geo.setAttribute('ruhe', m.ruhe); geo.setAttribute('eng', m.eng); }
      if (m.schuh) geo.setAttribute('schuh', m.schuh);
      geo.setAttribute('leucht', new THREE.BufferAttribute(new Float32Array(m.teil.length * 2), 2));
      // Gewicht je Punkt für den linken (x) und rechten (y) Brustmuskel: weich um die Muskelmitte, nur vorn (Stoff: am Punkt der Haut)
      const pec = new Float32Array(m.teil.length * 2), p = (m.ruhe || m.pos).array;
      for (let i = 0; i < m.teil.length; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], vorn = Math.max(0, Math.min(1, z / BRUST.z));
        for (const [j, sx] of [[0, 1], [1, -1]]) pec[i * 2 + j] = vorn * Math.exp(-(((x - sx * BRUST.x) / BRUST.bx) ** 2) - (((y - BRUST.y) / BRUST.by) ** 2));
      }
      geo.setAttribute('pec', new THREE.BufferAttribute(pec, 2));
      geo.setAttribute('spann', new THREE.BufferAttribute(new Float32Array(m.teil.length * 4), 4));   // spannung()
      const mat = stoff[m.mat]();
      mat.onBeforeCompile = (s) => this.shader(s);
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.bindMode = 'detached'; mesh.bind(this.skelett, new THREE.Matrix4());
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.boundingBox = new THREE.Box3(V(-0.9, 0, -0.2), V(0.9, 1.8, 0.2));
      mesh.userData.teil = m.teil; mesh.userData.netz = p; mesh.userData.koerper = m.mat === 'haut';   // Haut-Mesh eindeutig (für huelle.js/pruefe-3d statt über die Punktzahl)
      this.gruppe.add(mesh);
      return mesh;
    });
    this.koerperMesh = this.meshes.find((m) => m.userData.koerper);
    this.hut = saunahut(); this.gruppe.add(this.hut);
    // Hut zählt für die Kamera nur, wenn er sichtbar ist (Ansicht.zeige nimmt hutBox dazu); Prüfpunkte = Außenseite, ausgedünnt
    this.hutBox = this.hut.geometry.boundingBox || (this.hut.geometry.computeBoundingBox(), this.hut.geometry.boundingBox);
    this.hut.geometry.boundingBox = new THREE.Box3();
    const hp = this.hut.geometry.attributes.position, hi = this.hut.geometry.attributes.innen;
    this.hutPunkte = [];
    for (let i = 0; i < hp.count; i += 7) if (!hi.getX(i)) this.hutPunkte.push(V().fromBufferAttribute(hp, i));
    this.ruhe = this.ruhelage();
    this.markiere([]);
  }
  // Kleidung über die Haut legen (Devin, 31.10.: „das bin ich“ — graues Tanktop, schwarze Shorts bis übers Knie, weiße Socken und
  // Schuhe), dann Muskel-Glühen und Coach-Hinweis. Shorts und Schuhe kommen aus koerper.bin (kleid je Punkt); Tanktop, längere
  // Hosenbeine und Socken rechnet der Shader pro Pixel aus der Ruhelage (T-Pose, Meter, +x links, +z vorn): scharfe Kanten,
  // unabhängig vom Netz. Stoff ist rauer und zeigt die Poren der Haut-Normalen kaum noch.
  shader(s) {
    Object.assign(s.uniforms, this.u);
    // Brust (vor dem Skinning, in der Ruhelage): angespannt wölbt sie sich nach vorn und rückt zum Brustbein, gedehnt wird sie flacher
    // Stoff-Hüllen (DK_STOFF): vRuhe ist der Punkt auf der Haut (Masken wie bei der aufgemalten Kleidung), die enge Hülle geht mit
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 leucht;\nattribute vec2 kleid;\nattribute vec2 pec;\nuniform vec2 uPec;\nuniform float uAtem;\nattribute vec4 spann;\nuniform float uSpann;\n' + SPIEL_PARS_GLSL + '\nuniform vec4 uMimik;\nuniform vec2 uBlick;\nfloat dkG(float v, float m, float b) { float d = (v - m) / b; return exp(-d * d); }\nvarying vec2 vLeucht;\nvarying vec2 vKleid;\nvarying vec3 vRuhe;\nvarying vec3 vRN;\n#ifdef DK_STOFF\nattribute vec3 ruhe;\nattribute vec3 eng;\nuniform vec3 uStoff[3];\nuniform vec3 uWelle;\nuniform float uStoffZeit;\nvarying vec3 vH;\n#endif\n#ifdef DK_SCHUH\nattribute vec2 schuh;\nvarying vec2 vSchuh;\n#endif')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = normalize(objectNormal - spann.xyz * uSpann);\n' + SPIEL_GLSL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeucht = leucht;\nvKleid = kleid;\nfloat dkPec = uPec.x * pec.x + uPec.y * pec.y;\nvec3 dkPecV = normal * dkPec * (dkPec > 0.0 ? 0.018 : 0.009);\ndkPecV.x -= (uPec.x * pec.x - uPec.y * pec.y) * 0.009;\ndkPecV += normal * (spann.w * uSpann + dkMH + (pec.x + pec.y) * 0.012 * uMasse);\n' + ATEM_GLSL + MIMIK_GLSL + 'transformed += dkPecV;\n' +
        'vRN = normal;\n#ifdef DK_SCHUH\nvSchuh = schuh;\n#endif\n#ifdef DK_STOFF\nvRuhe = ruhe;\nvH = position;\nvec3 dkEng = eng + dkPecV;\n#else\nvRuhe = position;\n#endif')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + STOFF_FALL_GLSL);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSpiel;\nvarying vec2 vLeucht;\nvarying vec2 vKleid;\nvarying vec3 vRuhe;\nuniform vec4 uMimik;\nuniform float uGlut;\nuniform float uHinweis;\nuniform vec3 uGlutFarbe;\nuniform vec3 uMuskelFarbe;\nuniform vec3 uHinweisFarbe;\nuniform vec3 uHose;\nuniform vec3 uSchuh;\nuniform vec3 uOberteil;\nuniform vec3 uSocke;\n' + KLEIDUNG_GLSL + STOFF_PARS_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + STOFF_FARBE_GLSL.replace('__SCHUH__', SCHUH_FARBE_GLSL) + MIMIK_FARBE + 'float dkMuskel = vLeucht.x * (1.0 - vLeucht.y);\n#if defined(DK_STOFF) && DK_STOFF == 1\ndkMuskel *= 0.16 + 0.34 * vSpiel;\n#elif defined(DK_STOFF)\ndkMuskel *= 0.012;\n#elif defined(USE_NORMALMAP_TANGENTSPACE)\ndkMuskel *= (1.0 - 0.78 * dkTop) * (1.0 - 0.99 * dkHose);\ndiffuseColor.rgb *= vec3(1.0) + vec3(0.05, -0.012, -0.025) * vSpiel;\n#endif\ndiffuseColor.rgb = mix(diffuseColor.rgb, uMuskelFarbe * (0.32 + 1.0 * dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1))), dkMuskel * (0.24 + 0.24 * vSpiel));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHinweisFarbe, vLeucht.y);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_NORMALMAP_TANGENTSPACE\nroughnessFactor *= mix(1.45, 0.55, texture2D(normalMap, vNormalMapUv).b);\n#endif\nroughnessFactor = mix(roughnessFactor, 0.92, dkStoff);\n#ifdef DK_SCHUH\nroughnessFactor = dkSchuhRau;\n#endif\n#ifdef USE_NORMALMAP_TANGENTSPACE\nroughnessFactor *= (1.0 + 0.3 * dkHautA * (dkMi.g - 0.6)) * (1.0 - 0.16 * vSpiel);\n#endif')
      .replace('#include <normal_fragment_maps>', '#ifdef USE_NORMALMAP_TANGENTSPACE\nvec3 mapN = vec3(texture2D(normalMap, vNormalMapUv).rg * 2.0 - 1.0, 0.0);\nmapN.xy *= normalScale * (1.0 + 1.1 * vSpiel);\nmapN.z = sqrt(max(0.02, 1.0 - dot(mapN.xy, mapN.xy)));\nnormal = normalize(tbn * mapN);\n#else\n#include <normal_fragment_maps>\n#endif\nnormal = normalize(mix(normal, nonPerturbedNormal, dkStoff * 0.75));\n' + STOFF_FALTEN_GLSL)
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#if defined(USE_SHEEN) && defined(USE_NORMALMAP_TANGENTSPACE)\nmaterial.sheenColor *= 1.0 - dkHose;\n#endif')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlutFarbe * (uGlut * dkMuskel * (0.025 + 0.11 * vSpiel) * (0.3 + 0.7 * max(normal.z, 0.0))) + uHinweisFarbe * (uHinweis * vLeucht.y);');
  }
  // Feste Größen der Ruhelage: Gelenkpunkte, Rumpfachse, Richtungen von Armen, Händen und Daumen
  ruhelage() {
    const P = (n) => this.k.knochen[this.k.index[n]].p;
    const hueftMitte = P('LeftUpLeg').clone().add(P('RightUpLeg')).multiplyScalar(0.5);
    const schulterMitte = P('LeftArm').clone().add(P('RightArm')).multiplyScalar(0.5);
    const oben = schulterMitte.clone().sub(hueftMitte), rumpfHoehe = oben.length();
    const r = { P, hueftMitte, rumpfOben: oben.normalize(), rumpfHoehe, schulterSkala: MASS.schulterBreite / P('LeftArm').x };
    for (const S of ['Left', 'Right']) {
      const sg = S === 'Left' ? 1 : -1;
      const finger = richt(P(S + 'Hand'), P(S + 'HandMiddle1'));
      // Handrücken: senkrecht zur Handfläche (Zeigefinger liegt vorn, kleiner Finger hinten), zeigt nach oben
      const ruecken = P(S + 'HandIndex1').clone().sub(P(S + 'HandPinky1')).cross(finger).multiplyScalar(sg).normalize();
      const daumen = richt(P(S + 'HandThumb1'), P(S + 'HandThumb2'));
      // Winkel um die Fingerachse, der den Daumen in die Ebene der Hand klappt (zur Zeigefinger-Seite): für die flache Hand am Boden
      const quer = (v) => senkrecht(v, finger);
      const d = quer(daumen), ziel = quer(P(S + 'HandIndex1').clone().sub(P(S + 'HandPinky1')));
      r[S] = { oberarm: richt(P(S + 'Arm'), P(S + 'ForeArm')), unterarm: richt(P(S + 'ForeArm'), P(S + 'Hand')), finger, ruecken, daumen,
        daumenFlach: Math.atan2(d.clone().cross(ziel).dot(finger), d.dot(ziel)) * 0.85 };
    }
    return r;
  }
  // Darf der Hut in der jetzigen Pose auf dem Kopf sein? Nein, wenn er in den Boden taucht, mehr als 5 mm in ein Geräteteil (Bank,
  // Stange, Polster) oder ein Arm durch ihn geht, oder wenn der Kopf nach unten hängt (Handstand: er fiele herunter). Liegt der Kopf
  // waagrecht (Vierfüßler, Liegestütz), bleibt er auf, solange er nichts berührt (Devin, 31.10.: „Ja, wo es geht“). Ansicht prüft das
  // über Übung und Ablauf davor
  hutFrei(geraete) {
    const h = this.hut; h.updateMatrixWorld(true);
    const e = h.matrixWorld.elements;
    if (e[5] / Math.hypot(e[4], e[5], e[6]) < -0.5) return false;
    const p = V(), hw = this.hutPunkte.map((q) => q.clone().applyMatrix4(h.matrixWorld));
    if (hw.some((q) => q.y < 0.015)) return false;
    // Punkte in die Lage des Huts bringen: drin, wenn sie unter der Außenseite liegen (Profil HUT_AUSSEN, 5 mm Spiel; r = Dicke um den Punkt)
    const zuHut = h.matrixWorld.clone().multiply(HUT_LAGE()).invert(), mitte = V(0, 0.1, 0).applyMatrix4(HUT_LAGE()).applyMatrix4(h.matrixWorld);
    const drin = (q, r = 0) => { const y = q.y; if (y < -r || y > 0.216 + r) return false; return Math.hypot(q.x, q.z / 1.13) < hutRadius(Math.max(0, y)) + r - 0.005; };
    // Arme als Kapseln entlang der Knochen (Oberarm, Unterarm, Hand bis zur Fingerspitze): Hände am Hinterkopf, Arme dicht am Kopf
    const P = this.ruhe.P, I = this.k.index, a = V(), b = V(), gw = this.gruppe.matrixWorld;
    const gelenk = (out, name) => out.copy(P(name)).applyMatrix4(this.A[I[name]]).applyMatrix4(gw).applyMatrix4(zuHut);
    for (const S of ['Left', 'Right']) for (const [von, bis, r] of [['Arm', 'ForeArm', 0.045], ['ForeArm', 'Hand', 0.04], ['Hand', 'HandMiddle4', 0.025]]) {
      gelenk(a, S + von); gelenk(b, S + bis);
      for (let i = 0; i <= 6; i++) if (drin(p.copy(a).lerp(b, i / 6), r)) return false;
    }
    if (!geraete) return true;
    // Geräteteile in Kopfnähe als gedrehte Quader: Außenpunkte des Huts im Quader (8 mm Spiel; große Polster, Bänke) und den Quader
    // abtasten (Raster ≤ 2 cm, dünne Stangen entlang ihrer Achse)
    let frei = true;
    const c = V(), ax = [V(), V(), V()], hx = [0, 0, 0], gr = V(), d = V();
    const imQuader = (q) => { d.copy(q).sub(c); for (let i = 0; i < 3; i++) if (Math.abs(d.dot(ax[i])) > hx[i] - 0.008) return false; return true; };
    geraete.traverse((m) => {
      if (!frei || !m.isMesh || !m.visible || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox; if (b.isEmpty()) return;
      const me = m.matrixWorld.elements; b.getSize(gr);
      for (let i = 0; i < 3; i++) { ax[i].set(me[4 * i], me[4 * i + 1], me[4 * i + 2]); hx[i] = gr.getComponent(i) / 2 * ax[i].length(); ax[i].normalize(); }
      b.getCenter(c).applyMatrix4(m.matrixWorld);
      if (c.distanceTo(mitte) > Math.hypot(...hx) + 0.18) return;
      if (hw.some(imQuader)) { frei = false; return; }
      const n = hx.map((x) => Math.min(12, Math.max(1, Math.ceil(2 * x / 0.02))));
      for (let i = 0; i < n[0] && frei; i++) for (let j = 0; j < n[1] && frei; j++) for (let k = 0; k < n[2] && frei; k++) {
        p.copy(c).addScaledVector(ax[0], hx[0] * ((2 * i + 1) / n[0] - 1)).addScaledVector(ax[1], hx[1] * ((2 * j + 1) / n[1] - 1)).addScaledVector(ax[2], hx[2] * ((2 * k + 1) / n[2] - 1));
        if (drin(p.applyMatrix4(zuHut))) frei = false;
      }
    });
    return frei;
  }
  // Schnappschuss einer Pose für die Hut-Suche (Matrizen von Figur und Geräten müssen aktuell sein): Kopfknochen A (Ruhe → Welt), T = was Charakter-Mütze und Co. dem Hut
  // noch dazugeben (sonst Einheit), Arme als Kapseln (wie hutFrei), Körper als Kapseln aus den Gelenken g, Geräteteile als gedrehte Quader. So rechnet die Suche nicht jede Pose neu
  hutSchnapp(geraete, g) {
    const I = this.k.index, P = this.ruhe.P, gw = this.gruppe.matrixWorld, A = gw.clone().multiply(this.A[I.Head]);
    const T = A.clone().invert().multiply(gw.clone().multiply(this.hut.matrix));
    const kopf = new THREE.Vector3(0, 1.665, -0.02).applyMatrix4(A), arme = [];
    for (const S of ['Left', 'Right']) for (const [von, bis, r] of HUT_ARME) arme.push({ a: P(S + von).clone().applyMatrix4(this.A[I[S + von]]).applyMatrix4(gw), b: P(S + bis).clone().applyMatrix4(this.A[I[S + bis]]).applyMatrix4(gw), r });
    const K = (a, b, r) => ({ a: a.clone(), b: b.clone(), r });
    const koerper = [K(kopf, kopf, 0.125), K(g.becken, g.brust, 0.16), K(g.schulter.l, g.schulter.r, 0.07), K(g.brust, kopf, 0.07)];
    for (const s of ['l', 'r']) koerper.push(K(g.schulter[s], g.ellbogen[s], 0.055), K(g.ellbogen[s], g.handgelenk[s], 0.05), K(g.handgelenk[s], g.hand[s], 0.075),
      K(g.huefte[s], g.knie[s], 0.105), K(g.knie[s], g.knoechel[s], 0.07), K(g.ferse[s], g.zehe[s], 0.07));
    const kaesten = [], gr = V();
    geraete.traverse((m) => {
      if (!m.isMesh || !m.visible || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox; if (b.isEmpty()) return;
      const me = m.matrixWorld.elements; b.getSize(gr);
      const ax = [0, 1, 2].map((i) => V(me[4 * i], me[4 * i + 1], me[4 * i + 2])), hx = [0, 1, 2].map((i) => gr.getComponent(i) / 2 * ax[i].length());
      ax.forEach((x) => x.normalize());
      const c = b.getCenter(V()).applyMatrix4(m.matrixWorld);
      const k = { c, ax, hx }; if (kastenAbstand2(kopf, k) > 1.5 * 1.5) return;   // weiter weg kommt der Hut nie hin (höchstens 80 cm neben und 75 cm unter dem Kopf)
      kaesten.push(k);
    });
    return { A, T, kopf, arme, koerper, kaesten };
  }
  // Wie hutFrei, aber für einen Schnappschuss s und eine beliebige Hut-Matrix W (Ruhe → Welt). o.boden: tiefster erlaubter Hutpunkt (wie bisher 0,015), o.kopfUnten === false: der Hut darf
  // nach unten zeigen
  hutFreiIn(s, W, o = {}) {
    const e = W.elements, pts = this.hutPunkte, boden = o.boden != null ? o.boden : 0.015;
    if (o.kopfUnten !== false && e[5] / Math.hypot(e[4], e[5], e[6]) < -0.5) return false;
    for (let i = 0; i < pts.length; i++) { const q = pts[i]; if (e[1] * q.x + e[5] * q.y + e[9] * q.z + e[13] < boden) return false; }
    const lage = HUT_LAGE(), zuHut = W.clone().multiply(lage).invert(), mitte = V(0, 0.1, 0).applyMatrix4(lage).applyMatrix4(W);
    const drin = (q, r = 0) => { const y = q.y; if (y < -r || y > 0.216 + r) return false; return Math.hypot(q.x, q.z / 1.13) < hutRadius(Math.max(0, y)) + r - 0.005; };
    const p = V(), a = V(), b = V();
    for (const m of s.arme) { a.copy(m.a).applyMatrix4(zuHut); b.copy(m.b).applyMatrix4(zuHut); for (let i = 0; i <= 6; i++) if (drin(p.copy(a).lerp(b, i / 6), m.r)) return false; }
    let hw = null;
    const d = V();
    for (const k of s.kaesten) {
      if (kastenAbstand2(mitte, k) > 0.19 * 0.19) continue;   // außerhalb der Hüllkugel des Huts (18 cm + 8 mm Spiel): kann nichts berühren
      if (!hw) { hw = this._hw || (this._hw = pts.map(() => V())); for (let i = 0; i < pts.length; i++) hw[i].copy(pts[i]).applyMatrix4(W); }
      if (hw.some((q) => { d.copy(q).sub(k.c); for (let i = 0; i < 3; i++) if (Math.abs(d.dot(k.ax[i])) > k.hx[i] - 0.008) return false; return true; })) return false;
      const n = k.hx.map((x) => Math.min(12, Math.max(1, Math.ceil(2 * x / 0.02))));
      for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let l = 0; l < n[2]; l++) {
        p.copy(k.c).addScaledVector(k.ax[0], k.hx[0] * ((2 * i + 1) / n[0] - 1)).addScaledVector(k.ax[1], k.hx[1] * ((2 * j + 1) / n[1] - 1)).addScaledVector(k.ax[2], k.hx[2] * ((2 * l + 1) / n[2] - 1));
        if (drin(p.applyMatrix4(zuHut))) return false;
      }
    }
    return true;
  }
  // Kleinste Korrektur auf dem Kopf (HUT_KORREKTUREN, billigste zuerst), bei der der Hut in allen Schnappschüssen frei ist → { K, k } oder null
  hutKorrekturSuchen(snaps, zusatz = [0]) {
    // zusatz: zusätzliche Anhebungen (m), die alle passen müssen: der Hut einer Charakter-Mütze sitzt bis 3,5 cm höher (hutHoch), die gerechnete Tabelle soll für jeden Charakter gelten
    const W = new THREE.Matrix4(), Tv = zusatz.map((d) => new THREE.Matrix4().makeTranslation(0, d, 0)); let erst = 0;   // erst: Schnappschuss, an dem die letzte Korrektur scheiterte; kommt zuerst dran, so scheitern die Fehlversuche billig
    for (const k of HUT_KORREKTUREN) {
      const K = hutKorrMatrix(k); let ok = true;
      for (let n = 0; n < snaps.length && ok; n++) {
        const i = (erst + n) % snaps.length, s = snaps[i];
        for (const tv of Tv) {
          W.copy(s.A).multiply(K).multiply(s.T).multiply(tv);
          if (!this.hutFreiIn(s, W, { kopfUnten: !HUT_KOPFUNTEN_BLEIBT })) { ok = false; erst = i; break; }
        }
      }
      if (ok) return { K: k.hoch || k.nick || k.roll ? K : null, k };
    }
    return null;
  }
  // Tiefster Punkt des Huts in Hut-Koordinaten (Achse y, Kante bei 0): damit liegt er mit der Kante genau auf der Unterlage
  hutTiefe() {
    if (this._hutTiefe != null) return this._hutTiefe;
    const l = this.hut.geometry.attributes.lokal, hi = this.hut.geometry.attributes.innen; let m = 9;
    for (let i = 0; i < l.count; i++) if (!hi.getX(i)) m = Math.min(m, l.getY(i));
    return (this._hutTiefe = m);
  }
  // Hut mit der Kante flach auf die Unterlage (Höhe y) bei (x, z) stellen, das Logo zur Kamera (28° = Richtung des Logos, HUT_LOGO.winkel) → { M: hutFest in Gruppen-Koordinaten, W: Welt }
  hutAblegeMatrix(x, y, z, kamera) {
    const W = new THREE.Matrix4().makeRotationY(Math.atan2(kamera.x, kamera.z) - 28 * RAD).setPosition(x, y - this.hutTiefe(), z).multiply(HUT_LAGE().invert());
    return { M: this.gruppe.matrixWorld.clone().invert().multiply(W), W };
  }
  hutKorrBauen(hoch, nick, roll) { return hutKorrMatrix({ hoch, nick, roll }); }
  // Prüfsumme über Kopf, Körper und Geräteteile der Schnappschüsse (auf 2 mm gerundet, FNV-1a): ändert sich die Übung oder die Maschine, passt eine gerechnete Hut-Lage nicht mehr
  hutPruefsumme(snaps) {
    let h = 2166136261; const mix = (v) => { h = Math.imul(h ^ Math.round(v * 500), 16777619); };
    for (const s of snaps) {
      mix(s.kopf.x); mix(s.kopf.y); mix(s.kopf.z);
      for (const q of s.koerper) { mix(q.a.x); mix(q.a.y); mix(q.a.z); mix(q.b.x); mix(q.b.y); mix(q.b.z); }
      for (const k of s.kaesten) { mix(k.c.x); mix(k.c.y); mix(k.c.z); mix(k.hx[0]); mix(k.hx[1]); mix(k.hx[2]); }
    }
    return h >>> 0;
  }
  // Hut neben dem Kopf ablegen: Kopf nie höher als 75 cm (liegen, Bank, Kopf unten). Sucht rund um die Kopfmitte (nahe zuerst, auf der Seite der Kamera, nicht hinter dem Körper) eine Stelle am Boden, an der
  // in keinem Schnappschuss (Übung und Ablauf davor, snaps[nUebung…]) Körper oder Gerät (Hüllkugel 17 cm + 1 cm) berührt wird. Der Hut steht mit der Kante flach auf (Matte: 5 mm höher),
  // das Logo zur Kamera. → { M: hutFest (Gruppen-Koordinaten), W (Welt), x, z, y } oder null
  hutAblegenSuchen(snaps, nUebung, kamera) {
    const c = V(); let hoch = 0;
    for (let i = 0; i < nUebung; i++) { hoch = Math.max(hoch, snaps[i].kopf.y); c.x += snaps[i].kopf.x / nUebung; c.z += snaps[i].kopf.z / nUebung; }
    if (hoch > 0.75) return null;
    const rH = V(kamera.x, 0, kamera.z).normalize(), kand = [], S = V();
    for (const rho of [0.30, 0.36, 0.44, 0.54, 0.66, 0.80]) for (let w = 0; w < 24; w++) {
      const a = w * Math.PI / 12, dx = Math.sin(a), dz = Math.cos(a);
      kand.push({ x: c.x + rho * dx, z: c.z + rho * dz, kosten: rho + 0.12 * (1 - (dx * rH.x + dz * rH.z)) / 2 });
    }
    kand.sort((p, q) => p.kosten - q.kosten);
    const oben = (k) => k.c.y + Math.abs(k.ax[0].y) * k.hx[0] + Math.abs(k.ax[1].y) * k.hx[1] + Math.abs(k.ax[2].y) * k.hx[2];
    // Höhe der Unterlage: Boden, auf einer Matte 5 mm höher (flache Quader bis 1,2 cm)
    const unterlage = (x, z) => {
      let y = 0;
      for (const k of snaps[0].kaesten) {
        const t = oben(k); if (t > 0.012 || Math.abs(k.ax[1].y) < 0.99) continue;
        const dx = x - k.c.x, dz = z - k.c.z;
        if (Math.abs(dx * k.ax[0].x + dz * k.ax[0].z) <= k.hx[0] && Math.abs(dx * k.ax[2].x + dz * k.ax[2].z) <= k.hx[2]) y = Math.max(y, t);
      }
      return y;
    };
    let erst = 0, beste = null;
    const cam = V(kamera.x, kamera.y, kamera.z).normalize(), P = V();
    for (const k of kand) {
      if (beste && k.kosten >= beste.kosten) break;   // alle weiteren sind teurer
      const y = unterlage(k.x, k.z); S.set(k.x, y + 0.11, k.z);
      let frei = true;
      for (let n = 0; n < snaps.length && frei; n++) {
        const i = (erst + n) % snaps.length, s = snaps[i];
        for (const q of s.koerper) if (segAbstand2(S, q.a, q.b) < (q.r + 0.182) ** 2) { frei = false; break; }
        if (frei) for (const b of s.kaesten) if (oben(b) > 0.012 && kastenAbstand2(S, b) < 0.178 * 0.178) { frei = false; break; }
        if (!frei) erst = i;
      }
      if (!frei) continue;
      const h = this.hutAblegeMatrix(k.x, y, k.z, kamera);
      if (!snaps.every((s) => this.hutFreiIn(s, h.W, { boden: y - 0.005, kopfUnten: false }))) continue;
      // Verdeckt der Körper oder ein Gerät den Hut für die Kamera (Strahl vom Hut zur Kamera, in den Zeitpunkten der Übung)? Dann kostet es: 0,8 m weiter weg je verdecktem Anteil
      let verdeckt = 0;
      for (let i = 0; i < nUebung; i++) {
        const s = snaps[i]; let v = false;
        for (let d = 0.25; d < 1.6 && !v; d += 0.1) {
          P.copy(S).addScaledVector(cam, d);
          for (const q of s.koerper) if (segAbstand2(P, q.a, q.b) < (q.r + 0.07) ** 2) { v = true; break; }   // 7 cm Zuschlag: das echte Netz ist dicker als die Kapseln
          if (!v) for (const b of s.kaesten) if (oben(b) > 0.05 && kastenAbstand2(P, b) < 0.03 * 0.03) { v = true; break; }
        }
        if (v) verdeckt++;
      }
      const kosten = k.kosten + 0.8 * verdeckt / nUebung;
      if (!beste || kosten < beste.kosten) beste = { M: h.M, W: h.W, x: k.x, z: k.z, y, kosten };
    }
    return beste;
  }
  markiere(muskeln) {
    this.muskeln = muskeln || []; this.hervor = null;
    const arbeit = this.arbeit = {};
    for (const m of this.muskeln) { const n = SPIEL_NAME[m]; if (n) arbeit[n] = 1; const h = HELFER[m]; if (h) for (const k in h) arbeit[k] = Math.max(arbeit[k] || 0, h[k]); }
    this.muskelMaske(); this.leuchten();
  }
  hebeHervor(namen, farbe) {
    this.hervor = namen && namen.length ? new Set(namen) : null;
    if (farbe != null) { this.matHinweis.color.set(farbe); this.matHinweis.emissive.set(farbe); }
    this.leuchten();
  }
  // Goldene Fläche: weich um den Muskelbauch statt ganzer Körperteile mit harter, gezackter Kante (bis 2.11.); Bizeps und Trizeps, Lat und oberer Rücken sind so getrennt
  muskelMaske() {
    const baeuche = [];
    for (const m of this.muskeln) for (const b of MUSKEL_BAUCH[m] || []) baeuche.push([b, 1]);
    // Helfer leicht golden, solange sie nicht selbst genannt sind (Bizeps beim Latzug)
    for (const m of ['bizeps', 'trizeps']) if (!this.muskeln.includes(m) && (this.arbeit[m] || 0) >= 0.6) for (const b of MUSKEL_BAUCH[m]) baeuche.push([b, 0.45]);
    for (const mesh of this.meshes) {
      const a = mesh.geometry.attributes.leucht, f = a.array, p = mesh.userData.netz;
      for (let i = 0; i < a.count; i++) {
        let w = 0;
        for (const [b, st] of baeuche) {
          const dx = (Math.abs(p[i * 3]) - b.c[0]) / b.s[0], dy = (p[i * 3 + 1] - b.c[1]) / b.s[1], dz = (p[i * 3 + 2] - b.c[2]) / b.s[2], q = dx * dx + dy * dy + dz * dz;
          if (q < 12) w = Math.max(w, st * Math.exp(-0.5 * q));
        }
        f[i * 2] = Math.min(1, 1.3 * w);
      }
      a.needsUpdate = true;
    }
  }
  leuchten() {
    const h = this.hervor, hin = this.k.teile.map((t) => (h && (h.has(t) || h.has(LEUCHTET_MIT[t])) ? 1 : 0));
    for (const mesh of this.meshes) {
      const a = mesh.geometry.attributes.leucht, teil = mesh.userData.teil;
      for (let i = 0; i < teil.length; i++) a.array[i * 2 + 1] = hin[teil[i]];
      a.needsUpdate = true;
    }
  }
  // Die arbeitenden Muskeln wölben sich unter Spannung (Devin, 2.11.: „kleine Details“): je Punkt Wölbung in m (w) und ihr Gefälle in der Fläche (xyz, neigt die
  // Normale, damit auch das Licht den Muskel zeigt). Aus MUSKEL_BAUCH für die Muskeln der Übung; l, r: Anteil der Seite (einarmig: die andere Seite hält nur).
  // Stärke im Bild: g.spann (uSpann). Nur für die Live-Ansicht (Ansicht.zeige), Vorschaubilder bleiben bei 0
  spannung(l = 1, r = 1) {
    const baeuche = [];
    for (const m of this.muskeln) baeuche.push(...(MUSKEL_BAUCH[m] || []));
    for (const mesh of this.meshes) {
      const a = mesh.geometry.attributes.spann, f = a.array, p = mesh.userData.netz, nor = mesh.geometry.attributes.normal;
      f.fill(0);
      if (baeuche.length) for (let i = 0; i < a.count; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], ax = Math.abs(x), sg = x < 0 ? -1 : 1, seite = x < 0 ? r : l;
        let w = 0, gx = 0, gy = 0, gz = 0;
        for (const b of baeuche) {
          const dx = (ax - b.c[0]) / b.s[0], dy = (y - b.c[1]) / b.s[1], dz = (z - b.c[2]) / b.s[2], q = dx * dx + dy * dy + dz * dz;
          if (q > 6) continue;
          const h = b.a * Math.exp(-q);
          if (h > w) { w = h; gx = -2 * h * dx / b.s[0] * sg; gy = -2 * h * dy / b.s[1]; gz = -2 * h * dz / b.s[2]; }
        }
        if (!w) continue;
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i), d = gx * nx + gy * ny + gz * nz;
        f[i * 4] = (gx - d * nx) * seite; f[i * 4 + 1] = (gy - d * ny) * seite; f[i * 4 + 2] = (gz - d * nz) * seite; f[i * 4 + 3] = w * seite;
      }
      a.needsUpdate = true;
    }
  }
  // Muskelspiel je Bild (SPIEL_GLSL): die Form folgt dem Gelenk (Bizeps bei gebeugtem Ellbogen, Lat bei herabgezogenem Oberarm), die Last aus der Übung (g.spann, im Takt der Wiederholung) macht sie erst richtig hart.
  // Ohne Last bleibt der Grundanteil (ein gebeugter Arm wölbt den Bizeps auch ohne Gewicht ein wenig). Gedehnt wird der Lat flacher. m = Form · (Grund + (1 − Grund) · Anteil an der Übung · Last)
  muskelSpiel(g) {
    const R = g.R, last = g.spann || 0, arbeit = this.arbeit || {}, wink = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) / RAD;
    const hart = (name, grund) => grund + (1 - grund) * (arbeit[name] || 0.12) * last;
    ['l', 'r'].forEach((s, i) => {
      const o = richt(g.schulter[s], g.ellbogen[s]), u = richt(g.ellbogen[s], g.handgelenk[s]), beuge = wink(o, u), y = o.dot(R.oben);
      const th = richt(g.huefte[s], g.knie[s]), sc = richt(g.knie[s], g.knoechel[s]), knie = wink(th, sc), huefte = wink(th, (g.RB || R).oben.clone().negate());
      const voll = (v) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      const lat = voll((0.7 - y) / 1.4) * hart('lat', 0.22) - 0.3 * voll((y - 0.7) / 0.25);
      const pu = this.pump && this.pump[s], mit = (n, w) => (pu && pu[n] > w ? pu[n] : w);
      this.u.uMA.value[i].set(mit('bizeps', voll((beuge - 25) / 110) * hart('bizeps', 0.42)), mit('trizeps', voll((75 - beuge) / 65) * hart('trizeps', 0.12)), mit('lat', lat), mit('schulter', voll((y + 0.5) / 1.1) * hart('schulter', 0.3)));
      this.u.uMC.value[i] = mit('unterarme', (g.haelt && g.haelt[s] ? 0.55 : 0.12) * hart('unterarme', 0.3));
      const hub = g.ferse && g.zehe ? Math.max(0, (g.ferse[s].y - g.zehe[s].y) / MASS.fussLaenge) : 0;
      this.u.uMB.value[i].set(mit('quadrizeps', (0.65 + 0.35 * voll(knie / 90)) * hart('quadrizeps', 0.08)), mit('beinbeuger', voll((knie - 40) / 100) * hart('beinbeuger', 0.2)), mit('gesaess', (1 - 0.5 * voll(huefte / 90)) * hart('gesaess', 0.1)), mit('waden', (0.4 + 0.6 * voll(hub / 0.45)) * hart('waden', 0.12)));
    });
  }
  // Schweiß: die Haut glänzt, je länger die Übung läuft (0…1)
  glanz(f) { const m = this.koerperMesh.material; m.roughness = 0.5 - 0.12 * f; m.clearcoat = 0.12 + 0.3 * f; this.u.uSchweiss.value = f; }
  glut(staerke) { this.u.uGlut.value = this.hervor ? 0.15 : 0.25 + 0.9 * staerke; }

  // Schulter der Haut (siehe SCHULTER_HAUT): je Seite der Punkt, an dem der Armknochen der Haut sitzt (punkt) und um wie viel er gegen das Gelenk nach außen liegt (off, Vektor)
  schulterHaut(g) {
    const R = g.R, sk = MASS.schulterBreite / 0.205, out = { punkt: {}, off: {} };
    // Liegt der Rumpf (Bank, Matte, Hip Thrust, Band über dem Rücken), liegt die Schulter auf einem Gerät: Polster und Band sind für die alte Hautbreite gebaut (Schutzhülle in pruefe-3d.js: Polster höchstens 3,5 cm in der Haut,
    // beim Hip Thrust waren es schon 3,4 cm), dort bleibt die Haut wie vorher. Liegt der Rumpf mehr als 57° aus der Senkrechten, ist es null, bis 32° voll
    const lage = glatt(0.55, 0.85, R.oben.y);
    for (const [s, sg] of [['l', 1], ['r', -1]]) {
      const a = richt(g.schulter[s], g.ellbogen[s]), vorn = glatt(0.1, 0.5, Math.abs(a.dot(R.vor)));   // Oberarm zeigt nach vorn oder hinten (nicht zur Seite): dann trägt der Arm nicht mehr seitlich auf, und die Schulter wirkt schmal
      const innen = Math.max(0, (g.schulterBasis || g.schulter)[s].clone().sub(g.schulter[s]).dot(R.links) * sg);   // so weit rückte das Gelenk durch das Heben des Schlüsselbeins nach innen
      const d = ((SCHULTER_HAUT.breit + SCHULTER_HAUT.vorn * vorn) * sk + innen * SCHULTER_HAUT.innen) * lage;
      out.off[s] = R.links.clone().multiplyScalar(sg * d);
      out.punkt[s] = g.schulter[s].clone().add(out.off[s]);
    }
    out.lage = lage;   // 0 liegend … 1 aufrecht (auch für die Drehknochen)
    return out;
  }
  // Knochen aus den Gelenkpunkten (g = gelenke(pose)) legen
  stelle(g) {
    const r = this.ruhe, P = r.P, I = this.k.index, A = this.A, R = g.R, masse = this.masse || 0, armB = BAU.arm * (1 + 0.03 * masse), beinB = BAU.bein * (1 + 0.03 * masse), rumpfB = 1 + 0.02 * masse;
    const sh = this.schulterHaut(g);
    this.u.uMasse.value = masse;
    const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
    const gesetzt = new Set();
    const setze = (name, m) => { if (I[name] === undefined) return; A[I[name]].copy(m); gesetzt.add(I[name]); };
    // Rumpf: starr wie in gelenke() (Becken bis Hals), Ruhe-Rumpfachse → R.oben, Schultern auf MASS-Höhe. Mit Wirbelsäule (g.wirbel) folgt jeder Knochen ihrem Bogen: Becken wie g.RB, Brustkorb wie g.R, dazwischen anteilig
    const hueft = g.huefte.l.clone().add(g.huefte.r).multiplyScalar(0.5);
    const sb = g.schulterBasis || g.schulter, sy = sb.l.clone().add(sb.r).multiplyScalar(0.5).sub(hueft).dot(R.oben) / r.rumpfHoehe;
    const rumpf = {};
    for (const n of ['Root', 'Hips', 'Spine', 'Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder', 'Neck']) {
      const sx = (BAU.breite[n] || r.schulterSkala) * rumpfB;
      if (g.wirbel) {
        const syW = (MASS.rumpf - 0.01 + (g.schulterHub || 0)) / r.rumpfHoehe, h = n === 'Spine' || n === 'Spine1' || n === 'Spine2' ? P(n).clone().sub(r.hueftMitte).dot(r.rumpfOben) : n === 'Root' || n === 'Hips' ? 0 : r.rumpfHoehe;
        const s = h * syW - 0.02, oberst = h === r.rumpfHoehe, F = h === 0 ? g.RB : oberst ? R : wirbelRahmen(g.RB, g.wirbel, Math.max(0, s / MASS.rumpf));
        const welt = h === 0 ? hueft : oberst ? sb.l.clone().add(sb.r).multiplyScalar(0.5) : g.becken.clone().add(wirbelBogen(g.RB, g.wirbel, Math.max(0, s)));
        rumpf[n] = abbilden(new THREE.Matrix4(), r.hueftMitte.clone().addScaledVector(r.rumpfOben, h), X, r.rumpfOben, welt, F.links, F.oben, sx, syW, (BAU.tiefe[n] || 1) * rumpfB);
      } else
      rumpf[n] = abbilden(new THREE.Matrix4(), r.hueftMitte, X, r.rumpfOben, hueft, R.links, R.oben, sx, sy, (BAU.tiefe[n] || 1) * rumpfB);
      // Shrugs: Schulterknochen (Schlüsselbein, Trapez-Ansatz) gehen mit dem Schulterhub nach oben
      if (g.schulterHub && /Shoulder$/.test(n)) rumpf[n].premultiply(new THREE.Matrix4().makeTranslation(R.oben.x * g.schulterHub, R.oben.y * g.schulterHub, R.oben.z * g.schulterHub));
      if (g.schulterVor && /Shoulder$/.test(n)) rumpf[n].premultiply(new THREE.Matrix4().makeTranslation(R.vor.x * g.schulterVor, R.vor.y * g.schulterVor, R.vor.z * g.schulterVor));   // Schulterblatt gleitet um den Brustkorb
      // Schlüsselbein dreht mit dem gehobenen Arm (gelenke: schulterDreh)
      const sd = /Shoulder$/.test(n) && g.schulterDreh && g.schulterDreh[n === 'LeftShoulder' ? 'l' : 'r'];
      if (sd) rumpf[n].premultiply(new THREE.Matrix4().makeTranslation(sd.punkt.x, sd.punkt.y, sd.punkt.z).multiply(_T.makeRotationFromQuaternion(sd.q)).multiply(new THREE.Matrix4().makeTranslation(-sd.punkt.x, -sd.punkt.y, -sd.punkt.z)));
      // Schulter der Haut: das Schlüsselbein (Trapez, Schulterdach) geht ein Stück mit nach außen
      if (/Shoulder$/.test(n)) { const o = sh.off[n === 'LeftShoulder' ? 'l' : 'r'], k = SCHULTER_HAUT.klav; rumpf[n].premultiply(new THREE.Matrix4().makeTranslation(o.x * k, o.y * k, o.z * k)); }
      setze(n, rumpf[n]);
    }
    // Kopf: sitzt auf dem Hals, dreht mit kopfQ
    const kx = X.clone().applyQuaternion(g.kopfQ), ky = Y.clone().applyQuaternion(g.kopfQ);
    setze('Head', abbilden(new THREE.Matrix4(), P('Head'), X, Y, P('Head').clone().applyMatrix4(rumpf.Neck).addScaledVector(R.oben, 0.005 * (g.atem || 0) - BAU.hals), kx, ky, BAU.kopf, BAU.kopf, BAU.kopf));
    for (const s of ['l', 'r']) {
      const S = s === 'l' ? 'Left' : 'Right', sg = s === 'l' ? 1 : -1, ru = r[S];
      // Oberarm: Ellbogenbeuge in Ruhe vorn (+Z). Jetzt zeigt sie weg von der Ellbogenspitze, und zwar aus der Knickachse der IK (ellbogenAchse): am fast gestreckten Arm ist der
      // Abstand des Ellbogens zur Linie Schulter–Handgelenk winzig und seine Richtung zufällig, daraus kippte der Oberarm bis 170° in einem Bild (Devin, 2.11.: „Wegklicken … Schultern“)
      // Der Armknochen der Haut sitzt in sh.punkt (etwas weiter außen als das Gelenk) und zeigt zum echten Ellbogen
      const schultHaut = sh.punkt[s], dO = richt(schultHaut, g.ellbogen[s]);
      const wrist = g.handgelenk[s];
      const beuge = senkrecht(dO.clone().cross(g.ellbogenAchse[s]), dO, R.vor.clone().sub(R.links.clone().multiplyScalar(0.4 * sg)));
      setze(S + 'Arm', abbilden(new THREE.Matrix4(), P(S + 'Arm'), ru.oberarm, senkrecht(Z, ru.oberarm), schultHaut, dO, beuge,
        schultHaut.distanceTo(g.ellbogen[s]) / P(S + 'Arm').distanceTo(P(S + 'ForeArm')), armB, armB));
      // Unterarm: Handrücken dreht mit der Hand
      const dU = richt(g.ellbogen[s], wrist);
      let ruecken = senkrecht(g.handRuecken[s], dU, beuge);
      // Hand ohne Griff: weiter als rund 180° insgesamt dreht ein Unterarm nicht (Gelenkgrenze, siehe figur.js); nahe am Umschlag bei 180° läuft die Korrektur aus. Hand und Finger drehen mit
      let drehFrei = 0;
      if (!(g.haelt && g.haelt[s])) {
        const nn = senkrecht(g.ellbogenAchse[s].clone().multiplyScalar(sg), dU, beuge), tau = Math.atan2(nn.clone().cross(ruecken).dot(dU), nn.dot(ruecken));
        if (Math.abs(tau) > UNTERARM_MAX) { drehFrei = (Math.sign(tau) * UNTERARM_MAX - tau) * Math.min(1, (Math.PI - Math.abs(tau)) / (35 * RAD)); ruecken.applyAxisAngle(dU, drehFrei); }
      }
      setze(S + 'ForeArm', abbilden(new THREE.Matrix4(), P(S + 'ForeArm'), ru.unterarm, senkrecht(ru.ruecken, ru.unterarm), g.ellbogen[s], dU, ruecken,
        g.ellbogen[s].distanceTo(wrist) / P(S + 'ForeArm').distanceTo(P(S + 'Hand')), armB, armB));
      // Drehknochen (siehe drehKnochen): Oberarm = reiner Schwenk im Rumpfrahmen, dann die Drehung der Rolle in Drittel; Unterarm = neutrale Lage am Ellbogen, dann die Drehung der Hand in Drittel
      if (I[drehName(S, 'Arm', 0)] !== undefined) {
        const qR = R.q, aLoc = dO.clone().applyQuaternion(qR.clone().invert()), y0 = senkrecht(Z, ru.oberarm), qSw = new THREE.Quaternion().setFromUnitVectors(ru.oberarm, aLoc);
        const ySw = y0.clone().applyQuaternion(qSw).applyQuaternion(qR), ang = Math.atan2(ySw.clone().cross(beuge).dot(dO), ySw.dot(beuge));
        const lenO = schultHaut.distanceTo(g.ellbogen[s]) / P(S + 'Arm').distanceTo(P(S + 'ForeArm')), lenU = g.ellbogen[s].distanceTo(wrist) / P(S + 'ForeArm').distanceTo(P(S + 'Hand'));
        const neutral = senkrecht(g.ellbogenAchse[s].clone().multiplyScalar(sg), dU, beuge), tau = Math.atan2(neutral.clone().cross(ruecken).dot(dU), neutral.dot(ruecken));
        // Anteil der Drehung, der verteilt wird: nicht beim Liegen (Polster, Band: Schutzhülle) und weniger bei Armen über Kopf (der Deltamuskel steht dort sonst zu weit nach außen)
        const lam = SCHULTER_HAUT.dreh * sh.lage * (1 - SCHULTER_HAUT.hoch * glatt(0.3, 0.7, dO.dot(R.oben)));
        for (let j = 0; j < DREH_N; j++) {
          setze(drehName(S, 'Arm', j), abbilden(new THREE.Matrix4(), P(S + 'Arm'), ru.oberarm, y0, schultHaut, dO, beuge.clone().applyAxisAngle(dO, -lam * (g.drehGlatt ? drehLauf(ang) : ang) * (1 - j / DREH_N)), lenO, armB, armB));
          setze(drehName(S, 'ForeArm', j), abbilden(new THREE.Matrix4(), P(S + 'ForeArm'), ru.unterarm, senkrecht(ru.ruecken, ru.unterarm), g.ellbogen[s], dU, ruecken.clone().applyAxisAngle(dU, -lam * tau * (1 - j / DREH_N)), lenU, armB, armB));
        }
      }
      // Hand: Finger-Richtung (mit Knick) und Handrücken; der Rücken knickt um dieselbe Achse wie in gelenke()
      let fing = g.handFinger[s].clone().normalize();
      const knickAchse = g.handAchse[s].clone().cross(g.handRuecken[s]).normalize();
      let handRuecken = g.handRuecken[s].clone().applyAxisAngle(knickAchse, g.handKnick[s] || 0);
      if (drehFrei) { fing.applyAxisAngle(dU, drehFrei); handRuecken.applyAxisAngle(dU, drehFrei); }
      // Stütz (Liegestütz, Vierfüßler, Hand auf Bank oder Wand): Hand liegt flach auf, Rücken zeigt von der Fläche weg, Finger in der
      // Fläche — in Richtung der Finger, sonst Richtung Kopf, sonst Richtung Bauch (gelenke() kennt nur eine kleine Hand ohne Finger)
      const flach = g.flach && g.flach[s], haelt = !flach && g.haelt && g.haelt[s];
      if (flach) {
        const n = flach.clone().normalize(), inFlaeche = (v) => v.clone().sub(n.clone().multiplyScalar(v.dot(n)));
        fing = [inFlaeche(fing), inFlaeche(R.oben), inFlaeche(R.vor)].find((v) => v.length() > 0.3) || senkrecht(Z, n);
        fing.normalize(); handRuecken = n;
      }
      const hand = abbilden(new THREE.Matrix4(), P(S + 'Hand'), ru.finger, senkrecht(ru.ruecken, ru.finger), wrist, fing, senkrecht(handRuecken, fing, ruecken));
      setze(S + 'Hand', hand);
      // Finger zur Handfläche gekrümmt: um Stange/Hantel (haelt) zur Faust, sonst locker. Flach: gestreckt, Daumen seitlich neben die
      // Hand geklappt (beim Modell zeigt er schräg nach unten). Locker am Boden notfalls stärker krümmen, damit die Fingerspitzen darüber bleiben
      const zuHand = ru.finger.clone().cross(ru.ruecken.clone().negate()).normalize();
      const daumenAchse = ru.daumen.clone().cross(ru.ruecken.clone().negate()).normalize();
      const kette = (f, achse, winkel, c, start = hand) => {
        const glied = start.clone(), out = [];
        for (let j = 1; j <= 4; j++) { const n = S + 'Hand' + f + j; if (j <= 3) glied.multiply(umPunkt(P(n), achse, winkel[j - 1] * RAD * c)); out.push([n, glied.clone()]); }
        return out;
      };
      // Hält die Hand etwas: Finger und Daumen um den Griff (Radius aus haltErkennen); sonst locker bzw. flach
      const griff = haelt ? griffLoesen(P, ru, S, typeof g.haelt[s] === 'number' ? g.haelt[s] : GRIFF_R) : null;
      const kw0 = griff ? (g.kelchW && g.kelchW[s]) || 0 : 0, kw = Math.abs(kw0), kwF = kw0 < 0 ? kw * kw : kw, KK = kw0 < 0 ? KELCH.innen : S === 'Right' ? KELCH.unten : KELCH, kSg = S === 'Left' ? 1 : -1, d0 = g.haken && griff ? { abd: kSg * KELCH.haken.daumen.abd, dreh: kSg * KELCH.haken.daumen.dreh, curl: KELCH.haken.daumen.curl } : griff && griff.daumen, griffD = griff ? (kw ? { abd: d0.abd + (kSg * KK.daumen.abd - d0.abd) * kw, dreh: d0.dreh + (kSg * KK.daumen.dreh - d0.dreh) * kw, curl: d0.curl + (KK.daumen.curl - d0.curl) * kw } : d0) : null;
      const winkel = KRUEMMUNG;
      let krumm = flach ? 0 : haelt ? 1 : Math.max(0, Math.min(1, (wrist.y - 0.07) / 0.13));
      if (!flach && !haelt) for (const c of [krumm, 0.6, 1]) { krumm = c; if (P(S + 'HandMiddle4').clone().applyMatrix4(kette('Middle', zuHand, winkel, c)[3][1]).y > 0.01) break; }
      // Greifen als Bewegung (Devin, 1.11.: „seine Hände öffnen … zu den Griffen … greift … drückt die auch“): zu = 0 offen … 1 am Griff anliegend,
      // darüber drückt die Hand; ohne Griff öffnet g.handAuf (0 locker … 1 offen) die lockere Hand. Ohne Angabe wie gehabt: am Griff zu, sonst locker
      // Freie Hand: halb offen (locker geschlossen sah sie in der Luft aus, als wolle sie etwas greifen; Devin, 2.11. zum Dead Bug)
      const zu = griff ? (g.griffZu && g.griffZu[s] != null ? g.griffZu[s] : 1) : 0, offen = !griff && !flach ? (g.handAuf && g.handAuf.locker ? 0.22 : Math.max(0.55, (g.handAuf && g.handAuf[s]) || 0)) : 0;
      const mischW = (a, ca, b, cb) => [0, 1, 2].map((i) => a[i] * ca + b[i] * cb);
      for (const f of FINGER) for (const [n, m] of kette(f, zuHand, griff ? mischW(kw ? mischW(g.haken ? KELCH.haken.finger[f] : griff.finger[f], 1 - kwF, KK.finger[f], kwF) : g.haken ? KELCH.haken.finger[f] : griff.finger[f], zu, OFFEN, Math.max(0, 1 - zu)) : mischW(winkel, krumm * (1 - offen), OFFEN, offen), 1,
        griff ? hand.clone().multiply(umPunkt(P(S + 'Hand' + f + '1'), ru.ruecken, -(griff.spreiz[f] * (1 - kw) + -kSg * KK.neigung[f] * RAD * kw) * Math.min(1, zu))) : hand)) setze(n, m);
      const zuD = Math.min(1, zu);
      const daumenStart = flach ? hand.clone().multiply(umPunkt(P(S + 'HandThumb1'), ru.finger, ru.daumenFlach))
        : griff ? hand.clone().multiply(umPunkt(P(S + 'HandThumb1'), ru.ruecken.clone().negate(), griffD.abd * RAD * zuD)).multiply(umPunkt(P(S + 'HandThumb1'), ru.finger, griffD.dreh * RAD * zuD)) : hand;
      for (const [n, m] of kette('Thumb', daumenAchse, griff ? mischW(DAUMEN_GRIFF, griffD.curl * zuD, DAUMEN_OFFEN, 1 - zuD) : mischW(DAUMEN, krumm * (1 - offen), DAUMEN_OFFEN, offen), 1, daumenStart)) setze(n, m);
      // Bein: Kniescheibe zeigt dorthin, wohin das Knie aus der Linie Hüfte–Knöchel herausragt
      const dB = richt(g.huefte[s], g.knie[s]);
      const bl = richt(g.huefte[s], g.knoechel[s]);
      const kn = g.knie[s].clone().sub(g.huefte[s]); kn.sub(bl.clone().multiplyScalar(kn.dot(bl)));
      const fussVor = richt(g.ferse[s], g.zehe[s]);
      const ruheO = richt(P(S + 'UpLeg'), P(S + 'Leg'));
      setze(S + 'UpLeg', abbilden(new THREE.Matrix4(), P(S + 'UpLeg'), ruheO, senkrecht(Z, ruheO), g.huefte[s], dB, senkrecht(kn, dB, fussVor),
        g.huefte[s].distanceTo(g.knie[s]) / P(S + 'UpLeg').distanceTo(P(S + 'Leg')), beinB, beinB));
      const dS = richt(g.knie[s], g.knoechel[s]);
      const ruheS = richt(P(S + 'Leg'), P(S + 'Foot'));
      setze(S + 'Leg', abbilden(new THREE.Matrix4(), P(S + 'Leg'), ruheS, senkrecht(Z, ruheS), g.knie[s], dS, senkrecht(kn, dS, fussVor),
        g.knie[s].distanceTo(g.knoechel[s]) / P(S + 'Leg').distanceTo(P(S + 'Foot')), beinB, beinB));
      // Fuß: Sohle wie die Linie Ferse → Zehe, Fußrücken zeigt von der Fläche weg, auf der er steht (g.sohleN: Boden, schräge Platte …),
      // so rollt er auf einer Platte nicht seitlich weg; Zehen bleiben flach auf der Fläche, wenn die Ferse hochgeht
      const auf = (g.sohleN && g.sohleN[s]) || Y;
      const fuss = abbilden(new THREE.Matrix4(), P(S + 'Foot'), Y, Z, g.knoechel[s], senkrecht(auf, fussVor, dS.clone().negate()), fussVor, FUSS_HOEHE);
      setze(S + 'Foot', fuss);
      const hub = Math.asin(Math.max(-0.42, Math.min(1, -fussVor.dot(auf))));
      const zehen = fuss.clone().multiply(umPunkt(P(S + 'ToeBase'), X, -hub));
      setze(S + 'ToeBase', zehen); setze(S + 'Toe_End', zehen);
    }
    // Übrige Knochen (Enden, Wurzel) gehen mit ihrem Elternknochen mit
    this.k.knochen.forEach((kn, i) => { if (!gesetzt.has(i)) A[i].copy(kn.eltern >= 0 ? A[kn.eltern] : rumpf.Hips); });
    // Hut: auf dem Kopf (mit kleiner Korrektur hutKorr und leisem Wackeln hutLage) oder abgelegt (hutFest: feste Lage neben dem Kopf, rechnet Ansicht.zeige vorab)
    if (this.hutFest) this.hut.matrix.copy(this.hutFest);
    else { this.hut.matrix.copy(A[I.Head]); if (this.hutKorr) this.hut.matrix.multiply(this.hutKorr); if (this.hutLage) this.hut.matrix.multiply(this.hutLage); }
    this.hut.matrixWorldNeedsUpdate = true;
    // Brust: Oberarm vor den Körper geführt (Drücken, Butterfly zu) = angespannt, hinter den Körper (Bank unten, Rudern) = gedehnt
    const pec = (s, sg) => {
      const v = richt(g.schulter[s], g.ellbogen[s]), x = v.dot(R.links) * sg, z = v.dot(R.vor);
      return Math.max(-1, Math.min(1, (Math.atan2(z, x) / RAD - 25) / 55)) * Math.min(1, Math.hypot(x, z) * 1.4) * BAU.brust;
    };
    this.u.uPec.value.set(pec('l', 1), pec('r', -1));
    this.u.uAtem.value = g.atem || 0;
    this.u.uSpann.value = g.spann || 0;
    this.muskelSpiel(g);
    this.u.uMimik.value.set(g.mimik ? g.mimik.an : 0, g.mimik ? g.mimik.bl : 0, g.mimik ? g.mimik.mund : 0, g.mimik ? g.mimik.la || 0 : 0);
    this.u.uBlick.value.set(g.mimik ? g.mimik.bx || 0 : 0, g.mimik ? g.mimik.by || 0 : 0);
    this.skelett.update();
    // Grenzen für die Kamera (Ansicht.zeige misst die Figur): aus den Gelenkpunkten, mit Rand für Körper und Kopf
    const box = new THREE.Box3();
    for (const p of [g.becken, g.brust, g.kopf]) box.expandByPoint(p);
    for (const s of ['l', 'r']) for (const p of [g.schulter[s], g.ellbogen[s], g.hand[s], g.handgelenk[s], g.knie[s], g.zehe[s], g.ferse[s]]) box.expandByPoint(p);
    box.expandByScalar(0.12);
    for (const m of this.meshes) m.boundingBox.copy(box);
  }
}
