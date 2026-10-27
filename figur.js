// DK Coach — 3D-Übungsfigur.
// Die Figur wird aus Gelenkpunkten gebaut: eine Bewegungsvorlage (bewegungen.js) sagt pro Zeitpunkt,
// wo Becken, Rumpf, Hände und Füße sind; Ellbogen und Knie rechnet die inverse Kinematik (zwei Knochen).
// Koordinaten: Meter, Y nach oben, Figur schaut nach +Z, ihre linke Seite ist +X.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export const MASS = {
  oberarm: 0.29, unterarm: 0.27, oberschenkel: 0.45, unterschenkel: 0.44,
  schulterBreite: 0.19, hueftBreite: 0.095, rumpf: 0.50, hals: 0.07, kopf: 0.105, fussHoehe: 0.07, fussLaenge: 0.24
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180;

/* ---------- Rumpf-Rahmen: aus Neigung, Seitneigung und Drehung ---------- */
// Liefert die drei Achsen des Oberkörpers (vor, oben, links) in Weltkoordinaten.
export function rumpfRahmen(r) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r.neigung || 0) * RAD, (r.drehung || 0) * RAD, -(r.seit || 0) * RAD, 'YXZ'));
  if (r.basis) q.premultiply(r.basis);
  return { oben: V(0, 1, 0).applyQuaternion(q), vor: V(0, 0, 1).applyQuaternion(q), links: V(1, 0, 0).applyQuaternion(q), q };
}

/* ---------- Zwei-Knochen-IK ---------- */
// Wurzel A, Ziel Z, Längen a/b, Richtung, in die das Mittelgelenk zeigen soll (pol).
export function ik(A, Z, a, b, pol) {
  const d = Z.clone().sub(A);
  let l = d.length();
  const max = (a + b) * 0.9995, min = Math.abs(a - b) + 1e-3;
  const u = l > 1e-6 ? d.clone().divideScalar(l) : V(0, -1, 0);
  l = Math.min(Math.max(l, min), max);
  const cosA = (a * a + l * l - b * b) / (2 * a * l);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let v = pol.clone().sub(u.clone().multiplyScalar(pol.dot(u)));
  if (v.lengthSq() < 1e-8) v = Math.abs(u.y) < 0.9 ? V(0, 1, 0).sub(u.clone().multiplyScalar(u.y)) : V(0, 0, 1);
  v.normalize();
  const M = A.clone().add(u.clone().multiplyScalar(a * cosA)).add(v.multiplyScalar(a * sinA));
  const Ende = A.clone().add(u.multiplyScalar(l));
  return { mitte: M, ende: Ende };
}

/* ---------- Pose → Gelenkpunkte ---------- */
// pose: { becken: Vector3, rumpf: {neigung, seit, drehung, basis?}, kopf: {neigung},
//         hand: {l: V, r: V}, ellbogenPol: {l, r}, fuss: {l: V, r: V}, kniePol: {l, r}, fussRicht: {l, r} (Vektor), zehen: {l, r} (Grad, Fersenhub) }
export function gelenke(pose) {
  const m = MASS;
  const R = rumpfRahmen(pose.rumpf || {});
  const becken = pose.becken.clone();
  const brust = becken.clone().add(R.oben.clone().multiplyScalar(m.rumpf));
  const nacken = brust.clone().add(R.oben.clone().multiplyScalar(m.hals));
  const kq = new THREE.Quaternion().setFromAxisAngle(R.links, ((pose.kopf && pose.kopf.neigung) || 0) * RAD);
  const kopfRicht = R.oben.clone().applyQuaternion(kq);
  const kopf = nacken.clone().add(kopfRicht.multiplyScalar(m.kopf + 0.03));
  const schulter = {
    l: brust.clone().add(R.links.clone().multiplyScalar(m.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03)),
    r: brust.clone().add(R.links.clone().multiplyScalar(-m.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03))
  };
  const huefte = {
    l: becken.clone().add(R.links.clone().multiplyScalar(m.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02)),
    r: becken.clone().add(R.links.clone().multiplyScalar(-m.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02))
  };
  const out = { R, becken, brust, nacken, kopf, schulter, huefte, ellbogen: {}, hand: {}, knie: {}, knoechel: {}, zehe: {}, ferse: {} };
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1;
    // Arme: Ellbogen zeigt standardmäßig nach hinten-außen
    const hz = (pose.hand && pose.hand[s]) || schulter[s].clone().add(V(0.05 * sg, -0.55, 0));
    const epol = (pose.ellbogenPol && pose.ellbogenPol[s]) || R.vor.clone().multiplyScalar(-1).add(R.links.clone().multiplyScalar(0.4 * sg));
    const arm = ik(schulter[s], hz, m.oberarm, m.unterarm, epol);
    out.ellbogen[s] = arm.mitte; out.hand[s] = arm.ende;
    // Beine: Knie zeigt nach vorn (leicht außen)
    const fz = (pose.fuss && pose.fuss[s]) || huefte[s].clone().add(V(0.02 * sg, -(m.oberschenkel + m.unterschenkel), 0));
    const kpol = (pose.kniePol && pose.kniePol[s]) || V(0.15 * sg, 0, 1);
    const bein = ik(huefte[s], fz, m.oberschenkel, m.unterschenkel, kpol);
    out.knie[s] = bein.mitte; out.knoechel[s] = bein.ende;
    // Fuß: Richtung (Standard: nach vorn, leicht außen), Fersenhub in Grad
    const fr = ((pose.fussRicht && pose.fussRicht[s]) || V(0.18 * sg, 0, 1)).clone().normalize();
    const hub = ((pose.zehen && pose.zehen[s]) || 0) * RAD;
    const sohle = fr.clone().multiplyScalar(Math.cos(hub)).add(V(0, -Math.sin(hub), 0)).normalize();
    // Boden: Zehen und Ferse bleiben über dem Boden (Fuß kippt um den Knöchel)
    const ky = out.knoechel[s].y, versatz = m.fussHoehe * 0.6 + 0.02;
    const yMin = (versatz - ky) / (m.fussLaenge * 0.75), yMax = (ky - versatz) / (m.fussLaenge * 0.25);
    if (yMin <= yMax && (sohle.y < yMin || sohle.y > yMax)) {
      const y = Math.max(-1, Math.min(1, Math.min(Math.max(sohle.y, yMin), yMax)));
      const h = Math.hypot(sohle.x, sohle.z) || 1e-6, neu = Math.sqrt(Math.max(0, 1 - y * y));
      sohle.set(sohle.x / h * neu, y, sohle.z / h * neu);
    }
    out.zehe[s] = out.knoechel[s].clone().add(sohle.clone().multiplyScalar(m.fussLaenge * 0.75)).add(V(0, -m.fussHoehe * 0.6, 0));
    out.ferse[s] = out.knoechel[s].clone().add(sohle.clone().multiplyScalar(-m.fussLaenge * 0.25)).add(V(0, -m.fussHoehe * 0.6, 0));
  }
  return out;
}

/* ---------- Material ---------- */
export const FARBEN = {
  koerper: 0x6a7686, koerperDunkel: 0x2f3742, gelenk: 0x35c6d4, gold: 0xffa53a, metall: 0xb4bcc6, scheibe: 0x2a2f36,
  holz: 0x39404a, polster: 0x232a33, boden: 0x12161c, linie: 0x6b7077, cyan: 0x35c6d4, glut: 0xff7a1a
};
function mat(farbe, opt = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color: farbe, roughness: 0.55, metalness: 0.05 }, opt)); }

/* ---------- Figur (Meshes zwischen Gelenkpunkten) ---------- */
// Muskel → Körperteile, die golden leuchten
const MUSKEL_TEILE = {
  brust: ['brustkorb'], lat: ['ruecken'], oberer_ruecken: ['ruecken'], trapez: ['nacken', 'ruecken'],
  schulter_vorne: ['schulter_l', 'schulter_r'], schulter_seite: ['schulter_l', 'schulter_r'], schulter_hinten: ['schulter_l', 'schulter_r'],
  bizeps: ['oberarm_l', 'oberarm_r'], trizeps: ['oberarm_l', 'oberarm_r'], unterarme: ['unterarm_l', 'unterarm_r'],
  quadrizeps: ['oberschenkel_l', 'oberschenkel_r'], beinbeuger: ['oberschenkel_l', 'oberschenkel_r'], gesaess: ['gesaess_l', 'gesaess_r'],
  adduktoren: ['oberschenkel_l', 'oberschenkel_r'], abduktoren: ['gesaess_l', 'gesaess_r'], waden: ['unterschenkel_l', 'unterschenkel_r'],
  bauch: ['bauch'], seitlicher_rumpf: ['bauch'], unterer_ruecken: ['bauch']
};

export class Figur {
  constructor() {
    this.gruppe = new THREE.Group();
    this.teile = {};
    this.matNormal = mat(FARBEN.koerper, { roughness: 0.42, metalness: 0.18 });
    this.matGelenk = mat(FARBEN.gelenk, { roughness: 0.35, metalness: 0.2, emissive: FARBEN.gelenk, emissiveIntensity: 0.25 });
    // Arbeitende Muskeln: leuchten orange-gold, je stärker die Anspannung, desto heller (siehe glut())
    this.matMuskel = mat(FARBEN.gold, { emissive: FARBEN.glut, emissiveIntensity: 0.5, roughness: 0.32, metalness: 0.12 });
    const kapsel = (name, r, matl, laenge = 0.25) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, laenge, 6, 14), matl || this.matNormal);
      m.castShadow = true; m.userData.r = r; m.userData.laenge = laenge;
      this.gruppe.add(m); this.teile[name] = m; return m;
    };
    const kugel = (name, r, matl) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), matl || this.matNormal);
      m.castShadow = true; this.gruppe.add(m); this.teile[name] = m; return m;
    };
    kapsel('bauch', 0.112, null, 0.18); kapsel('brustkorb', 0.13, null, 0.2); kapsel('ruecken', 0.12, null, 0.2); kapsel('nacken', 0.05, null, 0.08);
    kugel('kopf', MASS.kopf);
    for (const s of ['l', 'r']) {
      kapsel('oberarm_' + s, 0.048, null, MASS.oberarm); kapsel('unterarm_' + s, 0.04, null, MASS.unterarm); kugel('hand_' + s, 0.042, this.matGelenk);
      kugel('schulter_' + s, 0.062);
      kapsel('oberschenkel_' + s, 0.072, null, MASS.oberschenkel); kapsel('unterschenkel_' + s, 0.054, null, MASS.unterschenkel); kapsel('fuss_' + s, 0.038, this.matGelenk, MASS.fussLaenge * 0.8);
      kugel('gesaess_' + s, 0.085); kugel('knie_' + s, 0.052, this.matGelenk); kugel('ellbogen_' + s, 0.042, this.matGelenk);
    }
    this.markiere([]);
  }
  markiere(muskeln) {
    const an = new Set();
    for (const m of muskeln || []) for (const t of MUSKEL_TEILE[m] || []) an.add(t);
    for (const [name, mesh] of Object.entries(this.teile)) {
      if (an.has(name)) mesh.material = this.matMuskel;
      else if (/^(hand|knie|ellbogen|fuss)_/.test(name)) mesh.material = this.matGelenk;
      else mesh.material = this.matNormal;
    }
  }
  glut(staerke) { this.matMuskel.emissiveIntensity = 0.25 + 0.9 * staerke; }
  static setzeKapsel(mesh, A, B, dick = 1) {
    const d = B.clone().sub(A); const l = Math.max(d.length(), 1e-4);
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.divideScalar(l));
    mesh.scale.set(dick, Math.max(l / mesh.userData.laenge, 0.01), dick);
  }
  stelle(g) {
    const T = this.teile, K = Figur.setzeKapsel;
    const mitteBauch = g.becken.clone().lerp(g.brust, 0.42);
    K(T.bauch, g.becken.clone().add(g.R.oben.clone().multiplyScalar(0.02)), mitteBauch);
    K(T.brustkorb, mitteBauch.clone().add(g.R.vor.clone().multiplyScalar(0.025)), g.brust.clone().sub(g.R.oben.clone().multiplyScalar(0.05)).add(g.R.vor.clone().multiplyScalar(0.02)));
    K(T.ruecken, mitteBauch.clone().sub(g.R.vor.clone().multiplyScalar(0.03)), g.brust.clone().sub(g.R.oben.clone().multiplyScalar(0.06)).sub(g.R.vor.clone().multiplyScalar(0.03)));
    K(T.nacken, g.brust, g.nacken.clone().add(g.R.oben.clone().multiplyScalar(0.02)));
    T.kopf.position.copy(g.kopf);
    for (const s of ['l', 'r']) {
      K(T['oberarm_' + s], g.schulter[s], g.ellbogen[s]);
      K(T['unterarm_' + s], g.ellbogen[s], g.hand[s]);
      T['hand_' + s].position.copy(g.hand[s]);
      T['schulter_' + s].position.copy(g.schulter[s]);
      T['ellbogen_' + s].position.copy(g.ellbogen[s]);
      K(T['oberschenkel_' + s], g.huefte[s], g.knie[s]);
      K(T['unterschenkel_' + s], g.knie[s], g.knoechel[s]);
      T['knie_' + s].position.copy(g.knie[s]);
      K(T['fuss_' + s], g.ferse[s], g.zehe[s]);
      T['gesaess_' + s].position.copy(g.huefte[s]).sub(g.R.vor.clone().multiplyScalar(0.05)).add(g.R.oben.clone().multiplyScalar(0.03));
    }
  }
}

/* ---------- Geräte ---------- */
export class Geraete {
  constructor() {
    this.gruppe = new THREE.Group();
    this.dyn = [];      // pro Bild neu gesetzte Teile
    this.mMetall = mat(FARBEN.metall, { metalness: 0.7, roughness: 0.3 });
    this.mScheibe = mat(FARBEN.scheibe, { roughness: 0.7 });
    this.mPolster = mat(FARBEN.polster, { roughness: 0.8 });
    this.mRahmen = mat(FARBEN.holz, { metalness: 0.4, roughness: 0.5 });
    this.mGold = mat(FARBEN.gold, { metalness: 0.5, roughness: 0.35 });
    this.mKabel = new THREE.MeshBasicMaterial({ color: 0x8a8f96 });
    this.mBand = mat(0x8e6a3a, { roughness: 0.6 });
  }
  leeren() { while (this.gruppe.children.length) this.gruppe.remove(this.gruppe.children[0]); this.dyn = []; }
  box(w, h, d, pos, m, rotX = 0, rotY = 0) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || this.mPolster);
    b.position.copy(pos); b.rotation.set(rotX * RAD, rotY * RAD, 0); b.castShadow = true; b.receiveShadow = true;
    this.gruppe.add(b); return b;
  }
  zyl(r, l, m, seg = 16) { const z = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), m); z.castShadow = true; this.gruppe.add(z); return z; }
  stab(A, B, r, m) { // Zylinder zwischen zwei Punkten (für bewegte Teile)
    const z = this.zyl(r, 1, m); this.legeStab(z, A, B); return z;
  }
  legeStab(z, A, B) {
    const d = B.clone().sub(A); const l = Math.max(d.length(), 1e-4);
    z.position.copy(A).add(B).multiplyScalar(0.5);
    z.quaternion.setFromUnitVectors(V(0, 1, 0), d.divideScalar(l)); z.scale.set(1, l, 1);
  }
  // Langhantel: Mitte + Achse
  langhantel() {
    const g = new THREE.Group();
    const stange = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.0, 12), this.mMetall); stange.rotation.z = Math.PI / 2; g.add(stange);
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.05, 32), this.mScheibe); s.rotation.z = Math.PI / 2; s.position.x = sx * 0.78; s.castShadow = true; g.add(s);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 40), this.mGold); ring.rotation.y = Math.PI / 2; ring.position.x = sx * 0.81; g.add(ring);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), this.mMetall); h.rotation.z = Math.PI / 2; h.position.x = sx * 0.73; g.add(h);
    }
    this.gruppe.add(g); return g;
  }
  sz() { const g = this.langhantel(); g.children[0].scale.y = 0.6; g.children.forEach((c, i) => { if (i > 0) c.position.x *= 0.62; c.scale.multiplyScalar(i > 0 ? 0.62 : 1); }); return g; }
  kurzhantel() {
    const g = new THREE.Group();
    const griff = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 10), this.mMetall); griff.rotation.z = Math.PI / 2; g.add(griff);
    for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 8), this.mScheibe); s.rotation.z = Math.PI / 2; s.position.x = sx * 0.12; s.castShadow = true; g.add(s); }
    this.gruppe.add(g); return g;
  }
  kettlebell() {
    const g = new THREE.Group();
    const k = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), this.mScheibe); k.position.y = -0.13; k.castShadow = true; g.add(k);
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), this.mScheibe); h.position.y = -0.04; g.add(h);
    this.gruppe.add(g); return g;
  }
  griff() { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 10), this.mGold); g.rotation.z = Math.PI / 2; const w = new THREE.Group(); w.add(g); this.gruppe.add(w); return w; }
  // Fest stehende Geräte
  bank(z0 = -0.2, laenge = 1.15, hoehe = 0.43, neigung = 0, fussZ = null) {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, laenge), this.mPolster);
    pad.castShadow = true; pad.receiveShadow = true;
    pad.rotation.x = -neigung * RAD; pad.position.set(0, hoehe, z0); g.add(pad);
    const fussA = new THREE.Mesh(new THREE.BoxGeometry(0.05, hoehe, 0.05), this.mRahmen); fussA.position.set(0, hoehe / 2, z0 - laenge * 0.35); g.add(fussA);
    const fussB = fussA.clone(); fussB.position.z = z0 + laenge * 0.35; g.add(fussB);
    for (const f of [fussA, fussB]) { const q = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.06), this.mRahmen); q.position.set(0, 0.02, f.position.z); g.add(q); }
    this.gruppe.add(g); return g;
  }
  querbank(z = -0.42, hoehe = 0.43) { // Bank quer zur Figur (Hip Thrust)
    this.box(1.1, 0.07, 0.3, V(0, hoehe, z), this.mPolster);
    for (const sx of [-0.4, 0.4]) { this.box(0.05, hoehe, 0.05, V(sx, hoehe / 2, z), this.mRahmen); this.box(0.06, 0.04, 0.35, V(sx, 0.02, z), this.mRahmen); }
  }
  turm(pos, hoehe = 2.1) { // Kabelturm
    const t = this.box(0.12, hoehe, 0.12, V(pos.x, hoehe / 2, pos.z), this.mRahmen);
    this.box(0.3, 0.04, 0.3, V(pos.x, 0.02, pos.z), this.mRahmen);
    return t;
  }
  stange(hoehe = 2.25, breite = 1.2, z = 0) {
    const s = this.zyl(0.016, breite, this.mMetall); s.rotation.z = Math.PI / 2; s.position.set(0, hoehe, z);
    for (const sx of [-1, 1]) this.box(0.06, hoehe, 0.06, V(sx * breite / 2, hoehe / 2, z), this.mRahmen);
    return s;
  }
  matte() { const m = this.box(0.7, 0.012, 1.9, V(0, 0.006, 0), mat(0x1f2226, { roughness: 0.9 })); m.castShadow = false; return m; }
}

/* ---------- Ansicht: Szene, Kamera, Drehen mit dem Finger ---------- */
// Weiches Leuchten als Textur (für Lichtkegel am Boden und Partikel)
function leuchtTextur(innen, aussen) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, innen); g.addColorStop(1, aussen);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Ansicht {
  // opt: standbild (Vorschaubild, ohne Steuerung), hintergrund (Farbe), effekte (Leuchtboden, Partikel, Farblichter; Hintergrund kommt dann aus dem CSS)
  constructor(canvas, opt = {}) {
    this.canvas = canvas;
    this.effekte = !!opt.effekte && !opt.standbild;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: this.effekte, preserveDrawingBuffer: !!opt.standbild });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.szene = new THREE.Scene();
    if (this.effekte) this.renderer.setClearColor(0x000000, 0);
    else this.szene.background = new THREE.Color(opt.hintergrund != null ? opt.hintergrund : 0x101214);
    this.kamera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    this.kamera.position.set(2.6, 1.6, 3.2);
    const hemi = new THREE.HemisphereLight(0xe6eef8, 0x141a22, 1.0); this.szene.add(hemi);
    const sonne = new THREE.DirectionalLight(0xfff1de, 1.9); sonne.position.set(2.5, 4.5, 3); sonne.castShadow = true;
    sonne.shadow.mapSize.set(1024, 1024); Object.assign(sonne.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1, near: 0.5, far: 12 });
    sonne.shadow.radius = 4; this.szene.add(sonne);
    // Zwei farbige Kantenlichter: Gold von hinten links, Türkis von hinten rechts
    const kante = new THREE.DirectionalLight(0xffa53a, 1.1); kante.position.set(-3, 2.5, -3); this.szene.add(kante);
    const kante2 = new THREE.DirectionalLight(0x35c6d4, 0.9); kante2.position.set(3, 1.8, -2.5); this.szene.add(kante2);
    const boden = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), mat(FARBEN.boden, { roughness: 0.9, transparent: this.effekte, opacity: this.effekte ? 0.92 : 1 }));
    boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true; this.szene.add(boden);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.17, 2.2, 96), new THREE.MeshBasicMaterial({ color: this.effekte ? 0x35c6d4 : 0x3a3226, transparent: true, opacity: this.effekte ? 0.55 : 1 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; this.szene.add(ring);
    if (this.effekte) this.effekteBauen();
    this.figur = new Figur(); this.szene.add(this.figur.gruppe);
    this.geraete = new Geraete(); this.szene.add(this.geraete.gruppe);
    if (!opt.standbild) {
      this.steuerung = new OrbitControls(this.kamera, canvas);
      this.steuerung.enableDamping = true; this.steuerung.enablePan = false;
      this.steuerung.minDistance = 1.8; this.steuerung.maxDistance = 7;
      this.steuerung.maxPolarAngle = Math.PI * 0.53;
      this.steuerung.autoRotate = true; this.steuerung.autoRotateSpeed = 1.6;
      canvas.addEventListener('pointerdown', () => { this.steuerung.autoRotate = false; this.drehZiel = null; if (this.beiDrehStopp) this.beiDrehStopp(); });
    }
    this.ziel = V(0, 0.85, 0);
    this.uebung = null; this.zeit = 0; this.laeuft = true; this.tempo = 1; this.drehZiel = null;
    this.groesse();
  }
  // Leuchtender Bodenkreis, Pulsringe und schwebende Lichtpunkte
  effekteBauen() {
    const kegel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: leuchtTextur('rgba(255,165,58,0.55)', 'rgba(255,165,58,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    kegel.rotation.x = -Math.PI / 2; kegel.position.y = 0.004; this.szene.add(kegel); this.kegel = kegel;
    this.pulse = [0, 1].map((i) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 96), new THREE.MeshBasicMaterial({ color: i ? 0x35c6d4 : 0xffa53a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.006; this.szene.add(r); return r;
    });
    const n = 140, pos = new Float32Array(n * 3), farbe = new Float32Array(n * 3);
    const gold = new THREE.Color(0xffb35a), tuerkis = new THREE.Color(0x5fe3ee);
    this.partikelTempo = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const w = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.7;
      pos.set([Math.cos(w) * r, Math.random() * 2.6, Math.sin(w) * r], i * 3);
      farbe.set((Math.random() < 0.6 ? gold : tuerkis).toArray(), i * 3);
      this.partikelTempo[i] = 0.05 + Math.random() * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(farbe, 3));
    this.partikel = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, map: leuchtTextur('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.szene.add(this.partikel);
  }
  effekteZeit(dt, t) {
    if (!this.effekte) return;
    const p = this.partikel.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i) + this.partikelTempo[i] * dt; if (y > 2.6) y = 0; p.setY(i, y); }
    p.needsUpdate = true;
    this.partikel.rotation.y += dt * 0.05;
    const jetzt = performance.now() / 1000;
    this.pulse.forEach((r, i) => {
      const u = (jetzt * 0.45 + i * 0.5) % 1;
      r.scale.setScalar(0.8 + u * 2.2); r.material.opacity = 0.65 * (1 - u);
    });
    this.kegel.material.opacity = 0.75 + 0.25 * t;
  }
  // Kamera um die Figur drehen (Grad), weich animiert; die Übung läuft dabei weiter
  drehe(grad) {
    if (!this.steuerung) return;
    this.steuerung.autoRotate = false;
    const basis = this.drehZiel != null ? this.drehZiel : this.steuerung.getAzimuthalAngle();
    this.drehZiel = basis + grad * RAD;
  }
  autoDrehen(an) { if (this.steuerung) { this.steuerung.autoRotate = an; this.drehZiel = null; } }
  setzeAzimut(w) {
    const z = this.steuerung.target, off = this.kamera.position.clone().sub(z);
    const sph = new THREE.Spherical().setFromVector3(off); sph.theta = w;
    this.kamera.position.copy(z).add(V().setFromSpherical(sph)); this.kamera.lookAt(z);
  }
  groesse() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false); this.kamera.aspect = w / h; this.kamera.updateProjectionMatrix();
  }
  // uebung: { aufbau(geraete) → state, pose(t, state) → {pose, props}, ziel?: Vector3, abstand? }
  zeige(animation, muskeln) {
    this.geraete.leeren();
    this.uebung = animation;
    this.zustand = animation.aufbau ? animation.aufbau(this.geraete) : {};
    this.figur.markiere(muskeln || []);
    // Bewegung ausmessen: Figur + Geräte über mehrere Zeitpunkte, daraus Mittelpunkt und Abstand
    const box = new THREE.Box3();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      this.bild(t);
      this.figur.gruppe.updateMatrixWorld(true); this.geraete.gruppe.updateMatrixWorld(true);
      box.expandByObject(this.figur.gruppe);
    }
    const nurFigur = box.clone();
    box.expandByObject(this.geraete.gruppe);
    // Geräte zählen nur halb (eine lange Stange soll die Figur nicht winzig machen)
    const mitte = nurFigur.getCenter(V()).lerp(box.getCenter(V()), 0.35);
    const groesse = nurFigur.getSize(V()).lerp(box.getSize(V()), 0.25);
    const radius = Math.max(groesse.length() * 0.42, groesse.y * 0.56, 0.55);
    const fov = this.kamera.fov * RAD;
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * this.kamera.aspect);
    const ab = (radius / Math.sin(Math.min(fov, hFov) / 2)) * (this.effekte ? 1.12 : 1.02);
    // Live-Ansicht: Knöpfe liegen unten über dem Bild, darum Figur etwas nach oben rücken
    if (this.effekte) mitte.y -= radius * 0.16;
    this.ziel.copy(mitte);
    if (this.steuerung) { this.steuerung.target.copy(mitte); this.steuerung.minDistance = ab * 0.55; this.steuerung.maxDistance = ab * 1.8; }
    const richt = (animation.kameraRicht || V(0.62, 0.32, 0.72)).clone().normalize();
    this.kamera.position.copy(mitte).add(richt.multiplyScalar(ab));
    this.kamera.lookAt(mitte);
    if (this.effekte) { for (const o of [this.kegel, ...this.pulse]) o.position.set(mitte.x, o.position.y, mitte.z); this.partikel.position.set(mitte.x, 0, mitte.z); }
    this.drehZiel = null;
    this.zeit = 0;
  }
  bild(t) {
    if (!this.uebung) return;
    const erg = this.uebung.pose(t, this.zustand);
    const g = gelenke(erg.pose);
    this.figur.stelle(g);
    this.figur.glut(t);
    if (erg.props) erg.props(g, this.zustand);
  }
  // Tempo: hoch (konzentrisch) 1 s, oben 0,4 s, runter 2 s, unten 0,4 s
  phase(sek) {
    const dauer = this.uebung && this.uebung.dauer || [1.0, 0.4, 2.0, 0.5];
    const ges = dauer.reduce((a, b) => a + b, 0);
    let x = sek % ges;
    const glatt = (u) => u * u * (3 - 2 * u);
    if (x < dauer[0]) return glatt(x / dauer[0]);
    x -= dauer[0]; if (x < dauer[1]) return 1;
    x -= dauer[1]; if (x < dauer[2]) return 1 - glatt(x / dauer[2]);
    return 0;
  }
  start() {
    let vorher = performance.now();
    const schleife = (jetzt) => {
      this._raf = requestAnimationFrame(schleife);
      const dt = Math.min((jetzt - vorher) / 1000, 0.1); vorher = jetzt;
      if (this.laeuft) this.zeit += dt * this.tempo;
      const t = this.uebung ? this.phase(this.zeit) : 0;
      if (this.uebung) this.bild(t);
      this.effekteZeit(dt, t);
      if (this.steuerung && this.drehZiel != null) {
        const jetzt = this.steuerung.getAzimuthalAngle();
        let d = this.drehZiel - jetzt; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.003) this.drehZiel = null; else this.setzeAzimut(jetzt + d * Math.min(1, dt * 7));
      }
      if (this.steuerung) this.steuerung.update();
      this.renderer.render(this.szene, this.kamera);
    };
    this._raf = requestAnimationFrame(schleife);
  }
  stopp() { cancelAnimationFrame(this._raf); }
  standbild(t) { this.bild(t); this.renderer.render(this.szene, this.kamera); }
  entsorgen() { this.stopp(); this.renderer.dispose(); if (this.steuerung) this.steuerung.dispose(); }
}

export { THREE, V, RAD };
