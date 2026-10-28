// DK Coach — echtere 3D-Figur: ein durchgehender Körper mit Haut, Gesicht und Haaren (Quaternius-Sportler, CC0)
// statt einzelner Formen. Die Bewegung kommt weiter aus gelenke() in figur.js; hier wird jeder Knochen so gelegt,
// dass er genau zwischen den Gelenkpunkten liegt (gedreht und auf die Länge gestreckt).
// Gleiche Schnittstelle wie class Figur: gruppe, teile, markiere, hebeHervor, matHinweis, glut, stelle(g).
// koerper.bin und koerper-*.jpg baut kunden-app/modelle/umwandeln.js. Die Punkte liegen dort in der Ruhelage
// (T-Pose, Blick nach +Z, linke Seite +X, Meter), darum ist jede Knochen-Matrix direkt die Abbildung Ruhelage → jetzt.
import * as THREE from 'three';
import { FARBEN, MUSKEL_TEILE, LEUCHTET_MIT } from './figur.js';

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
// Breite je Rumpfknochen gegenüber dem Sportler: Schultern und Hüftgelenke des Modells liegen weiter außen als
// MASS.schulterBreite / MASS.hueftBreite, darum oben und am Becken etwas schmaler (Arme und Beine setzen genau an den Gelenkpunkten an)
const RUMPF_BREITE = { Root: 0.92, Hips: 0.92, Spine: 0.97, Spine1: 0.96, Spine2: 0.95, LeftShoulder: 0.9, RightShoulder: 0.9, Neck: 1.0 };
const RUMPF_TIEFE = 1.0, ARM_DICKE = 0.97, BEIN_DICKE = 1.0;
const FUSS_HOEHE = 0.88;               // Knöchel liegt beim Modell etwas höher über der Sohle als in gelenke()
const FINGER = ['Index', 'Middle', 'Ring', 'Pinky'];
const KRUEMMUNG = [38, 48, 32];        // Grad je Fingerglied (locker geschlossene Hand, passt zu Stange und Hantel)
const DAUMEN = [10, 18, 14];
const HAND_BODEN = 0.12;               // Handgelenk tiefer als das: Hand liegt am Boden auf (Stütz, Rückenlage)
// Hinweis: FARBEN & Co. aus figur.js erst in Funktionen benutzen (figur.js importiert diese Datei, die Module hängen im Kreis)

export class FigurModell {
  constructor(k = geladen) {
    if (!k) throw new Error('Körper noch nicht geladen (ladeKoerper())');
    this.k = k;
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
      uHose: { value: new THREE.Color(FARBEN.hose) }, uSchuh: { value: new THREE.Color(FARBEN.schuh) }
    };
    const t = k.tex || {};   // ohne Texturen (Prüfung in Node): nur Form
    const stoff = {
      haut: () => new THREE.MeshStandardMaterial({ map: t.haut, normalMap: t['haut-n'], roughness: 0.62, metalness: 0.02 }),
      augen: () => new THREE.MeshStandardMaterial({ map: t.augen, roughness: 0.3 }),
      // Haar-Textur ist grau (Quaternius färbt im Spiel ein): hier dunkelbraun wie FARBEN.haar
      haar: () => new THREE.MeshStandardMaterial({ map: t.haar, color: 0x4a3426, roughness: 0.85, side: THREE.DoubleSide })
    };
    this.meshes = k.meshes.map((m) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', m.pos); geo.setAttribute('normal', m.nor); geo.setAttribute('uv', m.uv);
      geo.setAttribute('skinIndex', m.gel); geo.setAttribute('skinWeight', m.gew); geo.setAttribute('kleid', m.kleid); geo.setIndex(m.idx);
      geo.setAttribute('leucht', new THREE.BufferAttribute(new Float32Array(m.teil.length * 2), 2));
      const mat = stoff[m.mat]();
      mat.onBeforeCompile = (s) => this.shader(s);
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.bindMode = 'detached'; mesh.bind(this.skelett, new THREE.Matrix4());
      mesh.castShadow = true; mesh.frustumCulled = false;
      mesh.boundingBox = new THREE.Box3(V(-0.9, 0, -0.2), V(0.9, 1.8, 0.2));
      mesh.userData.teil = m.teil;
      this.gruppe.add(mesh);
      return mesh;
    });
    this.ruhe = this.ruhelage();
    this.markiere([]);
  }
  // Shorts und Schuhe über die Haut legen, dann Muskel-Glühen und Coach-Hinweis
  shader(s) {
    Object.assign(s.uniforms, this.u);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 leucht;\nattribute vec2 kleid;\nvarying vec2 vLeucht;\nvarying vec2 vKleid;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLeucht = leucht;\nvKleid = kleid;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLeucht;\nvarying vec2 vKleid;\nuniform float uGlut;\nuniform float uHinweis;\nuniform vec3 uGlutFarbe;\nuniform vec3 uMuskelFarbe;\nuniform vec3 uHinweisFarbe;\nuniform vec3 uHose;\nuniform vec3 uSchuh;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHose, vKleid.x);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uSchuh, vKleid.y);\nfloat dkMuskel = vLeucht.x * (1.0 - vLeucht.y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uMuskelFarbe, dkMuskel * 0.75);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uHinweisFarbe, vLeucht.y);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uGlutFarbe * (uGlut * dkMuskel) + uHinweisFarbe * (uHinweis * vLeucht.y);');
  }
  // Feste Größen der Ruhelage: Gelenkpunkte, Rumpfachse, Richtungen von Armen, Händen und Daumen
  ruhelage() {
    const P = (n) => this.k.knochen[this.k.index[n]].p;
    const hueftMitte = P('LeftUpLeg').clone().add(P('RightUpLeg')).multiplyScalar(0.5);
    const schulterMitte = P('LeftArm').clone().add(P('RightArm')).multiplyScalar(0.5);
    const oben = schulterMitte.clone().sub(hueftMitte), rumpfHoehe = oben.length();
    const r = { P, hueftMitte, rumpfOben: oben.normalize(), rumpfHoehe };
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
  markiere(muskeln) { this.muskeln = muskeln || []; this.hervor = null; this.leuchten(); }
  hebeHervor(namen, farbe) {
    this.hervor = namen && namen.length ? new Set(namen) : null;
    if (farbe != null) { this.matHinweis.color.set(farbe); this.matHinweis.emissive.set(farbe); }
    this.leuchten();
  }
  leuchten() {
    const an = new Set();
    for (const m of this.muskeln) for (const t of MUSKEL_TEILE[m] || []) an.add(t);
    for (const [kleid, teil] of Object.entries(LEUCHTET_MIT)) if (an.has(teil)) an.add(kleid);
    const h = this.hervor, namen = this.k.teile;
    const muskel = namen.map((t) => (an.has(t) ? 1 : 0)), hin = namen.map((t) => (h && (h.has(t) || h.has(LEUCHTET_MIT[t])) ? 1 : 0));
    for (const mesh of this.meshes) {
      const a = mesh.geometry.attributes.leucht, teil = mesh.userData.teil;
      for (let i = 0; i < teil.length; i++) { a.array[i * 2] = muskel[teil[i]]; a.array[i * 2 + 1] = hin[teil[i]]; }
      a.needsUpdate = true;
    }
  }
  glut(staerke) { this.u.uGlut.value = this.hervor ? 0.15 : 0.25 + 0.9 * staerke; }

  // Knochen aus den Gelenkpunkten (g = gelenke(pose)) legen
  stelle(g) {
    const r = this.ruhe, P = r.P, I = this.k.index, A = this.A, R = g.R;
    const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
    const gesetzt = new Set();
    const setze = (name, m) => { if (I[name] === undefined) return; A[I[name]].copy(m); gesetzt.add(I[name]); };
    // Rumpf: starr wie in gelenke() (Becken bis Hals), Ruhe-Rumpfachse → R.oben, Schultern auf MASS-Höhe
    const hueft = g.huefte.l.clone().add(g.huefte.r).multiplyScalar(0.5);
    const sy = g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5).sub(hueft).dot(R.oben) / r.rumpfHoehe;
    const rumpf = {};
    for (const [n, sx] of Object.entries(RUMPF_BREITE)) {
      rumpf[n] = abbilden(new THREE.Matrix4(), r.hueftMitte, X, r.rumpfOben, hueft, R.links, R.oben, sx, sy, RUMPF_TIEFE);
      setze(n, rumpf[n]);
    }
    // Kopf: sitzt auf dem Hals, dreht mit kopfQ
    const kx = X.clone().applyQuaternion(g.kopfQ), ky = Y.clone().applyQuaternion(g.kopfQ);
    setze('Head', abbilden(new THREE.Matrix4(), P('Head'), X, Y, P('Head').clone().applyMatrix4(rumpf.Neck), kx, ky));
    for (const s of ['l', 'r']) {
      const S = s === 'l' ? 'Left' : 'Right', sg = s === 'l' ? 1 : -1, ru = r[S];
      // Oberarm: Ellbogenbeuge in Ruhe vorn (+Z). Jetzt zeigt sie weg von der Ellbogenspitze (IK-Pol)
      const dO = richt(g.schulter[s], g.ellbogen[s]);
      const linie = richt(g.schulter[s], g.hand[s]);
      const spitze = g.ellbogen[s].clone().sub(g.schulter[s]); spitze.sub(linie.clone().multiplyScalar(spitze.dot(linie)));
      const beuge = senkrecht(spitze.negate(), dO, R.vor.clone().sub(R.links.clone().multiplyScalar(0.4 * sg)));
      setze(S + 'Arm', abbilden(new THREE.Matrix4(), P(S + 'Arm'), ru.oberarm, senkrecht(Z, ru.oberarm), g.schulter[s], dO, beuge,
        g.schulter[s].distanceTo(g.ellbogen[s]) / P(S + 'Arm').distanceTo(P(S + 'ForeArm')), ARM_DICKE, ARM_DICKE));
      // Unterarm: Handrücken dreht mit der Hand
      const dU = richt(g.ellbogen[s], g.hand[s]);
      const ruecken = senkrecht(g.handRuecken[s], dU, beuge);
      setze(S + 'ForeArm', abbilden(new THREE.Matrix4(), P(S + 'ForeArm'), ru.unterarm, senkrecht(ru.ruecken, ru.unterarm), g.ellbogen[s], dU, ruecken,
        g.ellbogen[s].distanceTo(g.hand[s]) / P(S + 'ForeArm').distanceTo(P(S + 'Hand')), ARM_DICKE, ARM_DICKE));
      // Hand: Finger-Richtung (mit Knick) und Handrücken; der Rücken knickt um dieselbe Achse wie in gelenke()
      let fing = g.handFinger[s].clone().normalize();
      const knickAchse = g.handAchse[s].clone().cross(g.handRuecken[s]).normalize();
      let handRuecken = g.handRuecken[s].clone().applyAxisAngle(knickAchse, g.handKnick[s] || 0);
      // Handgelenk am Boden (Liegestütz, Vierfüßler, Stütz): Hand liegt flach auf, Rücken oben, Finger waagerecht —
      // in Richtung der Finger, sonst Richtung Kopf, sonst Richtung Bauch (gelenke() kennt nur eine kleine Hand ohne Finger)
      const amBoden = g.hand[s].y < HAND_BODEN;
      if (amBoden) {
        const waag = (v) => V(v.x, 0, v.z);
        fing = [waag(fing), waag(R.oben), waag(R.vor)].find((v) => v.length() > 0.3) || V(0, 0, 1);
        fing.normalize(); handRuecken = V(0, 1, 0);
      }
      const hand = abbilden(new THREE.Matrix4(), P(S + 'Hand'), ru.finger, senkrecht(ru.ruecken, ru.finger), g.hand[s], fing, senkrecht(handRuecken, fing, ruecken));
      setze(S + 'Hand', hand);
      // Finger locker gekrümmt (zur Handfläche), Daumen etwas. Flach am Boden: gestreckt, Daumen seitlich neben die Hand
      // geklappt (beim Modell zeigt er schräg nach unten). Sonst notfalls stärker krümmen, damit die Fingerspitzen über dem Boden bleiben
      const zuHand = ru.finger.clone().cross(ru.ruecken.clone().negate()).normalize();
      const daumenAchse = ru.daumen.clone().cross(ru.ruecken.clone().negate()).normalize();
      const kette = (f, achse, winkel, c, start = hand) => {
        const glied = start.clone(), out = [];
        for (let j = 1; j <= 4; j++) { const n = S + 'Hand' + f + j; if (j <= 3) glied.multiply(umPunkt(P(n), achse, winkel[j - 1] * RAD * c)); out.push([n, glied.clone()]); }
        return out;
      };
      let krumm = amBoden ? 0 : Math.max(0, Math.min(1, (g.hand[s].y - 0.07) / 0.13));
      if (!amBoden) for (const c of [krumm, 0.6, 1]) { krumm = c; if (P(S + 'HandMiddle4').clone().applyMatrix4(kette('Middle', zuHand, KRUEMMUNG, c)[3][1]).y > 0.01) break; }
      for (const f of FINGER) for (const [n, m] of kette(f, zuHand, KRUEMMUNG, krumm)) setze(n, m);
      const daumenStart = amBoden ? hand.clone().multiply(umPunkt(P(S + 'HandThumb1'), ru.finger, ru.daumenFlach)) : hand;
      for (const [n, m] of kette('Thumb', daumenAchse, DAUMEN, krumm, daumenStart)) setze(n, m);
      // Bein: Kniescheibe zeigt dorthin, wohin das Knie aus der Linie Hüfte–Knöchel herausragt
      const dB = richt(g.huefte[s], g.knie[s]);
      const bl = richt(g.huefte[s], g.knoechel[s]);
      const kn = g.knie[s].clone().sub(g.huefte[s]); kn.sub(bl.clone().multiplyScalar(kn.dot(bl)));
      const fussVor = richt(g.ferse[s], g.zehe[s]);
      const ruheO = richt(P(S + 'UpLeg'), P(S + 'Leg'));
      setze(S + 'UpLeg', abbilden(new THREE.Matrix4(), P(S + 'UpLeg'), ruheO, senkrecht(Z, ruheO), g.huefte[s], dB, senkrecht(kn, dB, fussVor),
        g.huefte[s].distanceTo(g.knie[s]) / P(S + 'UpLeg').distanceTo(P(S + 'Leg')), BEIN_DICKE, BEIN_DICKE));
      const dS = richt(g.knie[s], g.knoechel[s]);
      const ruheS = richt(P(S + 'Leg'), P(S + 'Foot'));
      setze(S + 'Leg', abbilden(new THREE.Matrix4(), P(S + 'Leg'), ruheS, senkrecht(Z, ruheS), g.knie[s], dS, senkrecht(kn, dS, fussVor),
        g.knie[s].distanceTo(g.knoechel[s]) / P(S + 'Leg').distanceTo(P(S + 'Foot')), BEIN_DICKE, BEIN_DICKE));
      // Fuß: Sohle wie die Linie Ferse → Zehe; Zehen bleiben flach, wenn die Ferse hochgeht
      const fuss = abbilden(new THREE.Matrix4(), P(S + 'Foot'), Y, Z, g.knoechel[s], senkrecht(Y, fussVor, dS.clone().negate()), fussVor, FUSS_HOEHE);
      setze(S + 'Foot', fuss);
      const hub = Math.asin(Math.max(0, Math.min(1, -fussVor.y)));
      const zehen = fuss.clone().multiply(umPunkt(P(S + 'ToeBase'), X, -hub));
      setze(S + 'ToeBase', zehen); setze(S + 'Toe_End', zehen);
    }
    // Übrige Knochen (Enden, Wurzel) gehen mit ihrem Elternknochen mit
    this.k.knochen.forEach((kn, i) => { if (!gesetzt.has(i)) A[i].copy(kn.eltern >= 0 ? A[kn.eltern] : rumpf.Hips); });
    this.skelett.update();
    // Grenzen für die Kamera (Ansicht.zeige misst die Figur): aus den Gelenkpunkten, mit Rand für Körper und Kopf
    const box = new THREE.Box3();
    for (const p of [g.becken, g.brust, g.kopf]) box.expandByPoint(p);
    for (const s of ['l', 'r']) for (const p of [g.schulter[s], g.ellbogen[s], g.hand[s], g.knie[s], g.zehe[s], g.ferse[s]]) box.expandByPoint(p);
    box.expandByScalar(0.12);
    for (const m of this.meshes) m.boundingBox.copy(box);
  }
}
