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
//         hand: {l: V, r: V}, ellbogenPol: {l, r}, handflaeche: {l, r} (Richtung, in die die Handfläche zeigt),
//         fuss: {l: V, r: V}, kniePol: {l, r}, fussRicht: {l, r} (Vektor), zehen: {l, r} (Grad, Fersenhub) }
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
  const out = { R, becken, brust, nacken, kopf, kopfQ: kq.clone().multiply(R.q), schulter, huefte, ellbogen: {}, hand: {}, handAchse: {}, handRuecken: {}, handKnick: {}, handFinger: {}, handMitte: {}, knie: {}, knoechel: {}, zehe: {}, ferse: {} };
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1;
    // Arme: Ellbogen zeigt standardmäßig nach hinten-außen
    const hz = (pose.hand && pose.hand[s]) || schulter[s].clone().add(V(0.05 * sg, -0.55, 0));
    const epol = (pose.ellbogenPol && pose.ellbogenPol[s]) || R.vor.clone().multiplyScalar(-1).add(R.links.clone().multiplyScalar(0.4 * sg));
    const arm = ik(schulter[s], hz, m.oberarm, m.unterarm, epol);
    out.ellbogen[s] = arm.mitte; out.hand[s] = arm.ende;
    // Handrücken: ohne Angabe Obergriff (Fingerknöchel quer zum Körper, wie an der Stange)
    const a = arm.ende.clone().sub(arm.mitte).normalize();
    let n = pose.handflaeche && pose.handflaeche[s] ? pose.handflaeche[s].clone().negate() : a.clone().cross(R.links);
    n.sub(a.clone().multiplyScalar(n.dot(a)));
    if (n.lengthSq() < 1e-6) n = R.vor.clone().sub(a.clone().multiplyScalar(R.vor.dot(a)));
    out.handAchse[s] = a; out.handRuecken[s] = n.normalize();
    // Handgelenk-Knick (Grad, + = zur Handfläche): Hand dreht um das Handgelenk, handMitte = Mitte der Hand
    const knick = ((pose.handKnick && pose.handKnick[s]) || 0) * RAD;
    const ak = a.clone().applyAxisAngle(a.clone().cross(out.handRuecken[s]).normalize(), knick);
    out.handKnick[s] = knick; out.handFinger[s] = ak;
    out.handMitte[s] = arm.ende.clone().sub(a.clone().multiplyScalar(0.035)).add(ak.clone().multiplyScalar(0.047));
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
  haut: 0xc4927a, shirt: 0x202329, hose: 0x14161a, schuh: 0xeceef0, haar: 0x1c1612, dkGold: 0xc29c5e,
  gold: 0xffa53a, metall: 0xb4bcc6, scheibe: 0x2a2f36,
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
// Kleidung über einem Muskel leuchtet mit
const LEUCHTET_MIT = { hosenbein_l: 'oberschenkel_l', hosenbein_r: 'oberschenkel_r', hosenbund: 'gesaess_l' };

// Drehkörper aus einem Profil [Anteil der Länge -0,5…0,5, Radius in m]; Länge 1, Enden geschlossen
function drehkoerper(punkte, seg = 18) {
  const p = [new THREE.Vector2(0, -0.5), ...punkte.map(([y, r]) => new THREE.Vector2(r, y)), new THREE.Vector2(0, 0.5)];
  return new THREE.LatheGeometry(p, seg);
}
// Arm- und Beinform: Radius am Anfang, dickste Stelle (bei Anteil pm), Ende; Enden rund (keine Kante am Gelenk)
function glied(r0, rMax, r1, pm) {
  const p = [], kappe = 0.08;
  const us = [0.004, 0.015, 0.03, 0.05, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92, 0.95, 0.97, 0.985, 0.996];
  for (const u of us) {
    const basis = u < pm ? r0 + (rMax - r0) * Math.sin(Math.PI / 2 * u / pm) : r1 + (rMax - r1) * Math.cos(Math.PI / 2 * (u - pm) / (1 - pm));
    const rand = Math.min(u, 1 - u) / kappe;
    p.push([u - 0.5, basis * (rand >= 1 ? 1 : Math.sqrt(1 - (1 - rand) * (1 - rand)))]);
  }
  return drehkoerper(p, 16);
}
// V-Form des Oberkörpers: schmale Taille, breite Brust, runde Schultern
const RUMPF = [[-0.5, 0.05], [-0.46, 0.08], [-0.38, 0.09], [-0.15, 0.1], [0.12, 0.122], [0.3, 0.132], [0.4, 0.122], [0.47, 0.09], [0.495, 0.05]];
const BAUCH = [[-0.5, 0.06], [-0.42, 0.09], [-0.1, 0.1], [0.38, 0.094], [0.48, 0.065]];

// DK-Logo (Pfade wie im App-Symbol) als Textur für die Brust
function logoTextur() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#e2bf7e'); g.addColorStop(1, '#a8834a');
  x.fillStyle = g; x.translate(128, 64); x.scale(0.4, 0.4); x.translate(-297, -256);
  x.fill(new Path2D('M132 150h76c62 0 104 42 104 106s-42 106-104 106h-76zM178 196v120h28c35 0 58-24 58-60s-23-60-58-60z'));
  x.fill(new Path2D('M300 150h46v86l62-86h54l-74 98 78 114h-56l-64-96v96h-46z'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

const M4 = new THREE.Matrix4();

export class Figur {
  constructor() {
    this.gruppe = new THREE.Group();
    this.teile = {};
    const haut = mat(FARBEN.haut, { roughness: 0.6, metalness: 0.02 });
    const shirt = mat(FARBEN.shirt, { roughness: 0.75, metalness: 0.05 });
    const hose = mat(FARBEN.hose, { roughness: 0.8 });
    const schuh = mat(FARBEN.schuh, { roughness: 0.5 });
    const gold = mat(FARBEN.dkGold, { roughness: 0.35, metalness: 0.6, emissive: FARBEN.dkGold, emissiveIntensity: 0.15 });
    // Arbeitende Muskeln: leuchten orange-gold, je stärker die Anspannung, desto heller (siehe glut())
    this.matMuskel = mat(FARBEN.gold, { emissive: FARBEN.glut, emissiveIntensity: 0.5, roughness: 0.32, metalness: 0.12 });
    const teil = (name, geo, matl, laenge = 1) => {
      const m = new THREE.Mesh(geo, matl); m.castShadow = true;
      m.userData.laenge = laenge; m.userData.mat = matl;
      this.gruppe.add(m); if (name) this.teile[name] = m; return m;
    };
    const kapsel = (name, r, matl, laenge) => teil(name, new THREE.CapsuleGeometry(r, laenge, 6, 14), matl, laenge);
    const kugel = (name, r, matl) => teil(name, new THREE.SphereGeometry(r, 20, 14), matl);
    teil('bauch', drehkoerper(BAUCH), shirt);
    teil('brustkorb', drehkoerper(RUMPF, 24), shirt);
    teil('ruecken', drehkoerper(RUMPF, 24), shirt);
    kapsel('nacken', 0.05, haut, 0.08);
    kapsel('hosenbund', 0.086, hose, 2 * MASS.hueftBreite);
    // Kopf leicht oval, Haare als Kappe nach hinten gekippt (zeigt, wohin die Figur schaut)
    const kopf = kugel('kopf', MASS.kopf, haut); kopf.scale.set(0.9, 1.08, 1);
    const haarForm = new THREE.SphereGeometry(MASS.kopf * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52); haarForm.rotateX(-0.5);
    const haar = new THREE.Mesh(haarForm, mat(FARBEN.haar, { roughness: 0.9 })); haar.castShadow = true; kopf.add(haar);
    // DK auf der Brust
    this.logo = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshStandardMaterial({
      map: logoTextur(), transparent: true, alphaTest: 0.05, roughness: 0.35, metalness: 0.5,
      emissive: 0xc29c5e, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.logo.material.emissiveMap = this.logo.material.map;
    this.gruppe.add(this.logo);
    this.handRuecken = {};
    for (const s of ['l', 'r']) {
      teil('oberarm_' + s, glied(0.05, 0.055, 0.037, 0.45), haut); teil('unterarm_' + s, glied(0.042, 0.046, 0.03, 0.25), haut);
      const hand = kugel('hand_' + s, 1, haut); hand.scale.set(0.043, 0.052, 0.03);
      // Goldene Knöchel-Leiste auf dem Handrücken: zeigt, ob Ober- oder Untergriff
      const leiste = new THREE.CapsuleGeometry(0.008, 0.05, 4, 8); leiste.rotateZ(Math.PI / 2);
      this.handRuecken[s] = teil(null, leiste, gold);
      kugel('schulter_' + s, 0.062, haut);
      teil('oberschenkel_' + s, glied(0.074, 0.08, 0.05, 0.3), haut); teil('unterschenkel_' + s, glied(0.05, 0.058, 0.034, 0.3), haut);
      teil('hosenbein_' + s, new THREE.CylinderGeometry(0.086, 0.08, 1, 18), hose);
      kapsel('fuss_' + s, 0.04, schuh, MASS.fussLaenge * 0.8);
      kugel('gesaess_' + s, 0.08, hose); kugel('knie_' + s, 0.053, haut); kugel('ellbogen_' + s, 0.04, haut);
    }
    // Coach erklärt: das Körperteil, um das es gerade geht, leuchtet in der Farbe des Hinweises
    this.matHinweis = mat(FARBEN.cyan, { emissive: FARBEN.cyan, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.1 });
    this.markiere([]);
  }
  markiere(muskeln) { this.muskeln = muskeln || []; this.hervor = null; this.materialien(); }
  // namen: Figur-Teile (z. B. 'knie_l', 'ruecken'); leer = nichts hervorheben
  hebeHervor(namen, farbe) {
    this.hervor = namen && namen.length ? new Set(namen) : null;
    if (farbe != null) { this.matHinweis.color.set(farbe); this.matHinweis.emissive.set(farbe); }
    this.materialien();
  }
  materialien() {
    const an = new Set();
    for (const m of this.muskeln) for (const t of MUSKEL_TEILE[m] || []) an.add(t);
    const h = this.hervor;
    for (const [name, mesh] of Object.entries(this.teile)) {
      mesh.material = h && (h.has(name) || h.has(LEUCHTET_MIT[name])) ? this.matHinweis : an.has(name) || an.has(LEUCHTET_MIT[name]) ? this.matMuskel : mesh.userData.mat;
    }
  }
  // Während ein Körperteil erklärt wird, glühen die Muskeln nur leise (damit der Hinweis heraussticht)
  glut(staerke) { this.matMuskel.emissiveIntensity = this.hervor ? 0.15 : 0.25 + 0.9 * staerke; }
  // Teil zwischen A und B legen; quer = Richtung der Breite (für ovalen Querschnitt), bx/bz = Breite/Tiefe
  static setzeKapsel(mesh, A, B, quer = null, bx = 1, bz = bx) {
    const d = B.clone().sub(A); const l = Math.max(d.length(), 1e-4);
    const y = d.divideScalar(l);
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    const x = quer ? quer.clone().sub(y.clone().multiplyScalar(quer.dot(y))) : null;
    if (x && x.lengthSq() > 1e-8) { x.normalize(); mesh.quaternion.setFromRotationMatrix(M4.makeBasis(x, y, x.clone().cross(y))); }
    else mesh.quaternion.setFromUnitVectors(V(0, 1, 0), y);
    mesh.scale.set(bx, Math.max(l / mesh.userData.laenge, 0.01), bz);
  }
  stelle(g) {
    const T = this.teile, K = Figur.setzeKapsel, R = g.R;
    const P = (hoch, vor = 0) => g.becken.clone().add(R.oben.clone().multiplyScalar(hoch)).add(R.vor.clone().multiplyScalar(vor));
    K(T.bauch, P(0), P(0.25, 0.005), R.links, 1.16, 0.92);
    K(T.brustkorb, P(0.17, 0.015), P(0.53, 0.015), R.links, 1.45, 0.82);
    K(T.ruecken, P(0.15, -0.035), P(0.5, -0.035), R.links, 1.45, 0.7);
    K(T.nacken, g.brust, g.nacken.clone().add(R.oben.clone().multiplyScalar(0.02)));
    K(T.hosenbund, g.huefte.r.clone().sub(R.vor.clone().multiplyScalar(0.015)), g.huefte.l.clone().sub(R.vor.clone().multiplyScalar(0.015)));
    T.kopf.position.copy(g.kopf); T.kopf.quaternion.copy(g.kopfQ);
    this.logo.position.copy(P(0.38, 0.117)); this.logo.quaternion.copy(R.q);
    for (const s of ['l', 'r']) {
      K(T['oberarm_' + s], g.schulter[s], g.ellbogen[s]);
      K(T['unterarm_' + s], g.ellbogen[s], g.hand[s]);
      const a = g.handFinger[s], quer = g.handAchse[s].clone().cross(g.handRuecken[s]).normalize(), n = quer.clone().cross(a).normalize(), hand = T['hand_' + s];
      hand.quaternion.setFromRotationMatrix(M4.makeBasis(quer, a, n));
      hand.position.copy(g.handMitte[s]);
      this.handRuecken[s].quaternion.copy(hand.quaternion);
      this.handRuecken[s].position.copy(g.handMitte[s]).add(n.clone().multiplyScalar(0.026)).add(a.clone().multiplyScalar(0.01));
      T['schulter_' + s].position.copy(g.schulter[s]);
      T['ellbogen_' + s].position.copy(g.ellbogen[s]);
      K(T['oberschenkel_' + s], g.huefte[s], g.knie[s]);
      K(T['hosenbein_' + s], g.huefte[s].clone().add(R.oben.clone().multiplyScalar(0.03)), g.huefte[s].clone().lerp(g.knie[s], 0.42));
      K(T['unterschenkel_' + s], g.knie[s], g.knoechel[s]);
      T['knie_' + s].position.copy(g.knie[s]);
      K(T['fuss_' + s], g.ferse[s], g.zehe[s]);
      T['gesaess_' + s].position.copy(g.huefte[s]).sub(R.vor.clone().multiplyScalar(0.05)).add(R.oben.clone().multiplyScalar(0.03));
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
// Leuchtender Ring (Markierung um das erklärte Körperteil)
function ringTextur() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.shadowColor = '#fff'; x.shadowBlur = 14; x.lineWidth = 7;
  x.beginPath(); x.arc(64, 64, 46, 0, Math.PI * 2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ---------- Coach erklärt: Körperteile ---------- */
// punkte(g): wo die Markierung sitzt (je Seite bei paarigen Teilen), teile: Figur-Teile, die leuchten, blick: beste Kamera
const paar = (x) => [{ s: 'l', v: x.l }, { s: 'r', v: x.r }];
const mitteVon = (a, b, u = 0.5) => a.clone().lerp(b, u);
export const HINWEIS = {
  knie: { punkte: (g) => paar(g.knie), teile: ['knie', 'unterschenkel'], blick: 'schraeg' },
  bein: { punkte: (g) => [{ s: 'l', v: mitteVon(g.huefte.l, g.knie.l) }, { s: 'r', v: mitteVon(g.huefte.r, g.knie.r) }], teile: ['oberschenkel', 'hosenbein'], blick: 'schraeg' },
  fuss: { punkte: (g) => [{ s: 'l', v: mitteVon(g.knoechel.l, g.zehe.l) }, { s: 'r', v: mitteVon(g.knoechel.r, g.zehe.r) }], teile: ['fuss'], blick: 'schraeg' },
  huefte: { punkte: (g) => [{ v: g.becken.clone().sub(g.R.vor.clone().multiplyScalar(0.06)) }], teile: ['gesaess', 'hosenbund'], blick: 'seite' },
  ruecken: { punkte: (g) => [{ v: mitteVon(g.becken, g.brust, 0.55).sub(g.R.vor.clone().multiplyScalar(0.13)) }], teile: ['ruecken'], blick: 'seite' },
  bauch: { punkte: (g) => [{ v: mitteVon(g.becken, g.brust, 0.4).add(g.R.vor.clone().multiplyScalar(0.12)) }], teile: ['bauch'], blick: 'seite' },
  brust: { punkte: (g) => [{ v: g.brust.clone().sub(g.R.oben.clone().multiplyScalar(0.12)).add(g.R.vor.clone().multiplyScalar(0.13)) }], teile: ['brustkorb'], blick: 'schraeg' },
  schulter: { punkte: (g) => paar(g.schulter), teile: ['schulter'], blick: 'schraeg' },
  kopf: { punkte: (g) => [{ v: g.kopf }], teile: ['kopf', 'nacken'], blick: 'seite' },
  ellbogen: { punkte: (g) => paar(g.ellbogen), teile: ['ellbogen', 'oberarm'], blick: 'seite' },
  arme: { punkte: (g) => [{ s: 'l', v: mitteVon(g.ellbogen.l, g.hand.l, 0.3) }, { s: 'r', v: mitteVon(g.ellbogen.r, g.hand.r, 0.3) }], teile: ['oberarm', 'unterarm', 'ellbogen'], blick: 'seite' },
  hand: { punkte: (g) => paar(g.handMitte || g.hand), teile: ['hand', 'unterarm'], blick: 'schraeg' }
};
const HINWEIS_FARBE = { technik: 0x35c6d4, fehler: 0xff4b3a, vorsicht: 0xffa53a };

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
    // Coach erklärt: festT = Stelle, an der die Figur anhält; fokus = Kamera-Ziel beim Heranzoomen
    this.festT = null; this.tJetzt = 0; this.fokus = null; this.hinweisAktiv = null; this.basisAbstand = 3;
    if (!opt.standbild) this.hinweisBauen();
    this.groesse();
  }
  // Zwei Markierungen (für linke und rechte Seite): weiches Leuchten + Ring, der nach außen pulsiert; sichtbar durch den Körper
  hinweisBauen() {
    const glanz = leuchtTextur('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'), ring = ringTextur();
    const sprite = (map) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.renderOrder = 10; s.visible = false; this.szene.add(s); return s;
    };
    this.marken = [0, 1].map(() => ({ glanz: sprite(glanz), ring: sprite(ring) }));
  }
  // p: { teil, art, t } → Figur fährt zur Stelle t und bleibt stehen, Teil leuchtet, Kamera dreht hin und zoomt etwas heran.
  // p ohne teil (z. B. Vorsicht-Hinweis) oder null → Figur bewegt sich wieder, Kamera zurück.
  hinweis(p) {
    const def = p && HINWEIS[p.teil];
    if (!def || !this.uebung) {
      if (this.festT != null) this.zeit = ((this.uebung && this.uebung.dauer) || [1])[0] * this.tJetzt;   // dort weiterlaufen, wo die Figur steht
      this.festT = null; this.hinweisAktiv = null;
      this.figur.hebeHervor(null);
      for (const m of this.marken || []) m.glanz.visible = m.ring.visible = false;
      if (this.fokus) this.fokus = { ziel: this.ziel.clone(), abstand: this.basisAbstand, zurueck: true };
      return;
    }
    const farbe = HINWEIS_FARBE[p.art] || HINWEIS_FARBE.technik;
    this.festT = p.t != null ? p.t : this.tJetzt;
    // Arbeitet nur eine Seite (einarmig, einbeinig)? Dann nur diese Seite zeigen
    let seiten = ['l', 'r'];
    if (this.g0 && this.g1) {
      const weg = (s) => def.punkte(this.g0).concat(def.punkte(this.g1)).filter((x) => x.s === s).map((x) => x.v);
      const dl = weg('l'), dr = weg('r');
      if (dl.length === 2 && dr.length === 2) {
        const l = dl[0].distanceTo(dl[1]), r = dr[0].distanceTo(dr[1]);
        if (l > 2.5 * r + 0.03) seiten = ['l']; else if (r > 2.5 * l + 0.03) seiten = ['r'];
      }
    }
    this.hinweisAktiv = { def, seiten };
    const namen = [];
    for (const n of def.teile) { if (this.figur.teile[n]) namen.push(n); else for (const s of seiten) namen.push(n + '_' + s); }
    this.figur.hebeHervor(namen, farbe);
    for (const m of this.marken || []) { m.glanz.material.color.set(farbe); m.ring.material.color.set(farbe); }
    // Kamera: beste Seite für dieses Körperteil, an der Stelle, wo die Figur gleich steht
    const g = gelenke(this.uebung.pose(this.festT, this.zustand).pose);
    const w = this.blickWinkel(def.blick, g);
    if (w != null && this.steuerung) { this.steuerung.autoRotate = false; this.drehZiel = w; }
    const pkt = this.hinweisPunkte(g);
    const mitte = pkt.reduce((a, v) => a.add(v), V()).divideScalar(Math.max(pkt.length, 1));
    this.fokus = { ziel: this.ziel.clone().lerp(mitte, 0.3), abstand: this.basisAbstand * 0.86 };
  }
  hinweisPunkte(g) {
    const h = this.hinweisAktiv;
    return h ? h.def.punkte(g).filter((x) => !x.s || h.seiten.includes(x.s)).map((x) => x.v) : [];
  }
  // Blickwinkel (Azimut) für seite/schraeg/vorn, aus der Ausrichtung der Figur; nimmt die Möglichkeit, die am nächsten liegt
  blickWinkel(art, g) {
    if (!this.steuerung) return null;
    const winkel = (v) => (Math.hypot(v.x, v.z) > 0.35 ? Math.atan2(v.x, v.z) : null);
    const seite = winkel(g.R.links);
    if (seite == null) return null;
    let vorn = winkel(g.R.vor);
    if (vorn == null) vorn = seite - Math.PI / 2;
    const kand = art === 'seite' ? [seite, seite + Math.PI] : art === 'vorn' ? [vorn] : [vorn + 0.7, vorn - 0.7];
    const jetzt = this.steuerung.getAzimuthalAngle();
    const abst = (w) => Math.abs(Math.atan2(Math.sin(w - jetzt), Math.cos(w - jetzt)));
    return kand.sort((a, b) => abst(a) - abst(b))[0];
  }
  // Wo das erklärte Körperteil gerade auf dem Bildschirm ist (Pixel im Canvas), für den Pfeil
  hinweisBildschirm() {
    if (!this.hinweisAktiv || !this.gAktuell) return null;
    const pkt = this.hinweisPunkte(this.gAktuell);
    if (!pkt.length) return null;
    const v = pkt.reduce((a, b) => a.add(b), V()).divideScalar(pkt.length).project(this.kamera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, sichtbar: v.z < 1 };
  }
  hinweisZeit(dt) {
    if (!this.marken) return;
    const pkt = this.gAktuell ? this.hinweisPunkte(this.gAktuell) : [];
    const jetzt = performance.now() / 1000;
    this.marken.forEach((m, i) => {
      const an = i < pkt.length;
      m.glanz.visible = m.ring.visible = an;
      if (!an) return;
      m.glanz.position.copy(pkt[i]); m.ring.position.copy(pkt[i]);
      m.glanz.scale.setScalar(0.24 + 0.05 * Math.sin(jetzt * 4));
      const u = (jetzt * 0.9 + i * 0.5) % 1;
      m.ring.scale.setScalar(0.1 + 0.3 * u); m.ring.material.opacity = 1 - u;
    });
    if (this.hinweisAktiv) this.figur.matHinweis.emissiveIntensity = 0.7 + 0.5 * Math.sin(jetzt * 4);
  }
  // Kamera weich zum Fokus schieben und heranzoomen (bzw. zurück)
  fokusZeit(dt) {
    if (!this.fokus || !this.steuerung) return;
    const k = Math.min(1, dt * 2.5), z = this.steuerung.target;
    const neu = z.clone().lerp(this.fokus.ziel, k);
    this.kamera.position.add(neu.clone().sub(z)); z.copy(neu);
    const off = this.kamera.position.clone().sub(z), l = off.length();
    off.setLength(l + (this.fokus.abstand - l) * k);
    this.kamera.position.copy(z).add(off);
    if (this.fokus.zurueck && z.distanceTo(this.fokus.ziel) < 0.003 && Math.abs(l - this.fokus.abstand) < 0.005) this.fokus = null;
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
    this.hinweis(null); this.fokus = null;
    this.geraete.leeren();
    this.uebung = animation;
    this.zustand = animation.aufbau ? animation.aufbau(this.geraete) : {};
    this.figur.markiere(muskeln || []);
    // Bewegung ausmessen: Figur + Geräte über mehrere Zeitpunkte, daraus Mittelpunkt und Abstand
    const box = new THREE.Box3();
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      this.bild(t);
      if (t === 0) this.g0 = this.gAktuell; else if (t === 1) this.g1 = this.gAktuell;
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
    this.ziel.copy(mitte); this.basisAbstand = ab;
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
    if (this.zustand) this.zustand.runter = !!this.runter;   // für Übungen, die hoch anders aussehen als runter (Zottman Curl)
    const erg = this.uebung.pose(t, this.zustand);
    const g = gelenke(erg.pose);
    this.gAktuell = g;
    this.figur.stelle(g);
    this.figur.glut(t);
    if (erg.props) erg.props(g, this.zustand);
  }
  // Tempo: hoch (konzentrisch) 1 s, oben 0,4 s, runter 2 s, unten 0,4 s
  phase(sek) {
    const dauer = this.uebung && this.uebung.dauer || [1.0, 0.4, 2.0, 0.5];
    const ges = dauer.reduce((a, b) => a + b, 0);
    let x = sek % ges;
    this.runter = x >= dauer[0] + dauer[1];
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
      let t = 0;
      if (this.uebung) {
        // Coach erklärt: Figur gleitet zur Stelle festT und bleibt dort stehen
        if (this.festT != null) { this.tJetzt += (this.festT - this.tJetzt) * Math.min(1, dt * 3); t = this.tJetzt; }
        else { t = this.phase(this.zeit); this.tJetzt = t; }
        this.bild(t);
      }
      this.effekteZeit(dt, t);
      this.hinweisZeit(dt);
      this.fokusZeit(dt);
      if (this.steuerung && this.drehZiel != null) {
        const jetzt = this.steuerung.getAzimuthalAngle();
        let d = this.drehZiel - jetzt; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.003) this.drehZiel = null; else this.setzeAzimut(jetzt + d * Math.min(1, dt * 7));
      }
      if (this.steuerung) this.steuerung.update();
      this.renderer.render(this.szene, this.kamera);
      if (this.beiBild) this.beiBild();
    };
    this._raf = requestAnimationFrame(schleife);
  }
  stopp() { cancelAnimationFrame(this._raf); }
  standbild(t) { this.bild(t); this.renderer.render(this.szene, this.kamera); }
  entsorgen() { this.stopp(); this.renderer.dispose(); if (this.steuerung) this.steuerung.dispose(); }
}

export { THREE, V, RAD };
