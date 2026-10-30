// DK Coach — 3D-Übungsfigur.
// Die Figur wird aus Gelenkpunkten gebaut: eine Bewegungsvorlage (bewegungen.js) sagt pro Zeitpunkt,
// wo Becken, Rumpf, Hände und Füße sind; Ellbogen und Knie rechnet die inverse Kinematik (zwei Knochen).
// Koordinaten: Meter, Y nach oben, Figur schaut nach +Z, ihre linke Seite ist +X.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { koerper, FigurModell } from './figur-modell.js';
import { baueEinleitung } from './einleitung.js';

// griff: Mitte der geschlossenen Faust (dort liegen Stange, Hantel, Griff) vom Handgelenk aus Richtung Finger; griffTief: so weit zur Handfläche hin
export const MASS = {
  oberarm: 0.29, unterarm: 0.27, oberschenkel: 0.45, unterschenkel: 0.44, griff: 0.085, griffTief: 0.028,
  schulterBreite: 0.205, hueftBreite: 0.095, rumpf: 0.50, hals: 0.07, kopf: 0.105, fussHoehe: 0.07, fussLaenge: 0.24
};
export const HAND_BODEN = 0.12;   // Ziel der Hand tiefer als das (und nichts in der Hand): Hand liegt flach am Boden (Stütz)

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
//         hand: {l: V, r: V} (Mitte der Faust = wo Stange/Hantel sitzt), ellbogenPol: {l, r}, handflaeche: {l, r} (Richtung, in die die Handfläche zeigt),
//         flach: {l: V, r: V} (Hand liegt flach auf einer Fläche, V = Richtung von der Fläche weg; hand = Handgelenk),
//         greift: {l, r} (Ziel tiefer als HAND_BODEN, trotzdem greifen statt flach aufstützen, z. B. Hantel vom Boden),
//         fuss: {l: V, r: V}, kniePol: {l, r}, fussRicht: {l, r} (Vektor), zehen: {l, r} (Grad, Fersenhub) }
// g.hand = Faustmitte (Geräte hängen dort), g.handgelenk = Handgelenk (dort beginnt die Hand des Körpers)
export function gelenke(pose) {
  const m = MASS;
  const R = rumpfRahmen(pose.rumpf || {});
  const becken = pose.becken.clone();
  const brust = becken.clone().add(R.oben.clone().multiplyScalar(m.rumpf));
  const nacken = brust.clone().add(R.oben.clone().multiplyScalar(m.hals));
  const kq = new THREE.Quaternion().setFromAxisAngle(R.links, ((pose.kopf && pose.kopf.neigung) || 0) * RAD);
  const kopfRicht = R.oben.clone().applyQuaternion(kq);
  const kopf = nacken.clone().add(kopfRicht.multiplyScalar(m.kopf + 0.03));
  // schulterHub (m): Schultern hochziehen (Shrugs), Schultergelenke wandern entlang der Rumpfachse
  const hubS = pose.schulterHub || 0;
  const schulter = {
    l: brust.clone().add(R.links.clone().multiplyScalar(m.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03 - hubS)),
    r: brust.clone().add(R.links.clone().multiplyScalar(-m.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03 - hubS))
  };
  const huefte = {
    l: becken.clone().add(R.links.clone().multiplyScalar(m.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02)),
    r: becken.clone().add(R.links.clone().multiplyScalar(-m.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02))
  };
  const out = { schulterHub: hubS, R, becken, brust, nacken, kopf, kopfQ: kq.clone().multiply(R.q), schulter, huefte, ellbogen: {}, hand: {}, handZiel: {}, handgelenk: {}, flach: {}, haelt: {}, handAchse: {}, handRuecken: {}, handKnick: {}, handFinger: {}, handMitte: {}, knie: {}, knoechel: {}, zehe: {}, ferse: {} };
  for (const s of ['l', 'r']) {
    const sg = s === 'l' ? 1 : -1;
    // Arme: Ellbogen zeigt standardmäßig nach hinten-außen
    const hz = ((pose.hand && pose.hand[s]) || schulter[s].clone().add(V(0.05 * sg, -(m.oberarm + m.unterarm + m.griff) * 0.98, 0))).clone();
    const epol = (pose.ellbogenPol && pose.ellbogenPol[s]) || R.vor.clone().multiplyScalar(-1).add(R.links.clone().multiplyScalar(0.4 * sg));
    const knick = ((pose.handKnick && pose.handKnick[s]) || 0) * RAD;
    // Hand-Ausrichtung zu einer Unterarm-Richtung a: Handrücken n (ohne Angabe Obergriff, Fingerknöchel quer zum Körper wie an der
    // Stange), Finger ak und Rücken nk nach dem Handgelenk-Knick (Grad, + = zur Handfläche)
    // Zeigt der Unterarm fast zur Seite (a ∥ links), geht der Handrücken weich zur Vorderseite über, statt zu springen
    const ausrichtung = (a) => {
      let n = pose.handflaeche && pose.handflaeche[s] ? pose.handflaeche[s].clone().negate() : a.clone().cross(R.links);
      n.sub(a.clone().multiplyScalar(n.dot(a)));
      const ersatz = R.vor.clone().sub(a.clone().multiplyScalar(R.vor.dot(a)));
      const w = Math.max(0, 1 - n.length() / 0.5);
      if (w > 0) n.add(ersatz.multiplyScalar(w * w));
      if (n.lengthSq() < 1e-8) n = R.oben.clone().sub(a.clone().multiplyScalar(R.oben.dot(a)));
      n.normalize();
      const achse = a.clone().cross(n).normalize();
      return { n, ak: a.clone().applyAxisAngle(achse, knick), nk: n.clone().applyAxisAngle(achse, knick) };
    };
    const faust = (r) => r.ak.clone().multiplyScalar(m.griff).sub(r.nk.clone().multiplyScalar(m.griffTief));
    const flach = (pose.flach && pose.flach[s]) || (hz.y < HAND_BODEN && !(pose.greift && pose.greift[s]) ? V(0, 1, 0) : null);
    let arm;
    // Hand flach am Boden: Handgelenk mindestens so hoch, wie Hand und Unterarm dick sind (sonst taucht der Daumen in den Boden)
    if (flach && !(pose.flach && pose.flach[s]) && hz.y < 0.045) hz.y = 0.045;
    if (flach) { arm = ik(schulter[s], hz, m.oberarm, m.unterarm, epol); out.handZiel[s] = hz; }
    else {
      // Faustmitte aufs Ziel. Die Hand sitzt starr am Unterarm, also hat Ellbogen → Faust eine feste Länge L: Ellbogen per IK mit L,
      // dann den Unterarm um den kleinen Winkel zwischen Unterarm-Achse und Linie zur Faust zurückdrehen
      const zuFaust = (a) => a.clone().multiplyScalar(m.unterarm).add(faust(ausrichtung(a)));
      const L = zuFaust(hz.clone().sub(schulter[s]).normalize()).length();
      // Die Vorlagen sind für einen Arm ohne Hand (Schulter → Handgelenk R0) gebaut. Fast gestreckte Arme sollen gestreckt bleiben:
      // dort rückt die Faust so weit nach außen, dass der Ellbogen denselben Winkel hat wie gedacht (Stange/Hantel geht mit).
      // Stark gebeugte Arme behalten das Ziel genau (Stange auf der Brust, Hantel an der Schulter). Immer genau: pose.fest (feste Stange)
      // oder ein Ziel mit .genau (Vorlage rechnet schon mit Ellbogen → Faust, z. B. Curl: Ellbogen fest, Unterarm klappt)
      const d = hz.distanceTo(schulter[s]), R0 = m.oberarm + m.unterarm;
      const genau = (pose.fest && pose.fest[s]) || (pose.hand && pose.hand[s] && pose.hand[s].genau);
      if (!genau && d > 1e-4 && d < R0) {
        const cosW = Math.max(-1, Math.min(1, (m.oberarm ** 2 + m.unterarm ** 2 - d * d) / (2 * m.oberarm * m.unterarm)));
        const winkel = Math.acos(cosW) / RAD, w = Math.max(0, Math.min(1, (winkel - 110) / 40));
        const dNeu = Math.sqrt(m.oberarm ** 2 + L * L - 2 * m.oberarm * L * cosW);
        if (w > 0) hz.sub(schulter[s]).multiplyScalar(1 + (dNeu / d - 1) * w * w * (3 - 2 * w)).add(schulter[s]);
      }
      out.handZiel[s] = hz;
      const k = ik(schulter[s], hz, m.oberarm, L, epol);
      const u = k.ende.clone().sub(k.mitte).normalize(), a = u.clone(), q = new THREE.Quaternion();
      for (let i = 0; i < 6; i++) a.applyQuaternion(q.setFromUnitVectors(zuFaust(a).normalize(), u)).normalize();
      arm = { mitte: k.mitte, ende: k.mitte.clone().add(a.multiplyScalar(m.unterarm)) };
    }
    const a = arm.ende.clone().sub(arm.mitte).normalize(), r = ausrichtung(a);
    out.ellbogen[s] = arm.mitte; out.handgelenk[s] = arm.ende; out.flach[s] = flach;
    out.hand[s] = flach ? arm.ende.clone() : arm.ende.clone().add(faust(r));
    out.handAchse[s] = a; out.handRuecken[s] = r.n;
    // handMitte = Mitte der Hand (Leuchten, Coach erklärt)
    out.handKnick[s] = knick; out.handFinger[s] = r.ak;
    out.handMitte[s] = arm.ende.clone().sub(a.clone().multiplyScalar(0.035)).add(r.ak.clone().multiplyScalar(0.047));
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

// Hält die Hand etwas? Ja, wenn ein bewegtes Gerät der Vorlage (Stange, Hantel, Griff, Kabel …) oder eine feste Stange die Faustmitte berührt
const _box = new THREE.Box3();
export function haltErkennen(g, z, festeStangen = []) {
  const teile = Object.values(z || {}).filter((o) => o && o.isObject3D);
  for (const o of teile) o.updateMatrixWorld(true);
  for (const s of ['l', 'r']) {
    g.haelt[s] = !g.flach[s] && (teile.some((o) => _box.setFromObject(o).expandByScalar(0.02).containsPoint(g.hand[s])) || festeStangen.some((b) => b.containsPoint(g.hand[s])));
  }
}
// Feste Stangen der Szene (Klimmzugstange, Barren, Pfosten): Teile, die sich über die Bewegung nicht rühren und in zwei Richtungen
// höchstens 7 cm dick sind. Liegt das Ziel einer Hand daran, greift die Faust genau dort (pose.fest), statt mit dem Arm nach außen zu rücken
export function festeStangen(anim, ger, z) {
  const lage = (t) => {
    const erg = anim.pose(t, z), g = gelenke(erg.pose);
    if (erg.props) erg.props(g, z);
    ger.gruppe.updateMatrixWorld(true);
    return ger.gruppe.children.map((o) => new THREE.Box3().setFromObject(o));
  };
  const zeiten = [0, 0.5, 1].map(lage), boxen = [];
  zeiten[0].forEach((b, i) => {
    if (b.isEmpty() || !zeiten.every((x) => x[i].min.distanceTo(b.min) < 1e-3 && x[i].max.distanceTo(b.max) < 1e-3)) return;
    const d = b.getSize(V()).toArray().sort((x, y) => x - y);
    if (d[1] <= 0.07) boxen.push(b.clone().expandByScalar(0.035));
  });
  return boxen;
}
export function festErkennen(pose, boxen) {
  if (!boxen.length || !pose.hand) return;
  for (const s of ['l', 'r']) {
    const h = pose.hand[s];
    if (h && boxen.some((b) => b.containsPoint(h))) (pose.fest = pose.fest || {})[s] = true;
  }
}

/* ---------- Material ---------- */
export const FARBEN = {
  haut: 0xc4927a, hose: 0x23262c, schuh: 0xeceef0, haar: 0x1c1612, dkGold: 0xc29c5e,
  gold: 0xffa53a, metall: 0xb4bcc6, scheibe: 0x2a2f36,
  holz: 0x39404a, polster: 0x232a33, boden: 0x12161c, linie: 0x6b7077, cyan: 0x35c6d4, glut: 0xff7a1a
};
function mat(farbe, opt = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color: farbe, roughness: 0.55, metalness: 0.05 }, opt)); }

/* ---------- Figur (Meshes zwischen Gelenkpunkten) ---------- */
// Muskel → Körperteile, die golden leuchten
export const MUSKEL_TEILE = {
  brust: ['brustkorb'], lat: ['ruecken'], oberer_ruecken: ['ruecken'], trapez: ['nacken', 'ruecken'],
  schulter_vorne: ['schulter_l', 'schulter_r'], schulter_seite: ['schulter_l', 'schulter_r'], schulter_hinten: ['schulter_l', 'schulter_r'],
  bizeps: ['oberarm_l', 'oberarm_r'], trizeps: ['oberarm_l', 'oberarm_r'], unterarme: ['unterarm_l', 'unterarm_r'],
  quadrizeps: ['oberschenkel_l', 'oberschenkel_r'], beinbeuger: ['oberschenkel_l', 'oberschenkel_r'], gesaess: ['gesaess_l', 'gesaess_r'],
  adduktoren: ['oberschenkel_l', 'oberschenkel_r'], abduktoren: ['gesaess_l', 'gesaess_r'], waden: ['unterschenkel_l', 'unterschenkel_r'],
  bauch: ['bauch'], seitlicher_rumpf: ['bauch'], unterer_ruecken: ['bauch']
};
// Kleidung über einem Muskel leuchtet mit
export const LEUCHTET_MIT = { hosenbein_l: 'oberschenkel_l', hosenbein_r: 'oberschenkel_r', hosenbund: 'gesaess_l' };

// Drehkörper aus einem Profil [Anteil der Länge -0,5…0,5, Radius in m]; Länge 1, Enden geschlossen
function drehkoerper(punkte, seg = 18) {
  const p = [new THREE.Vector2(0, -0.5), ...punkte.map(([y, r]) => new THREE.Vector2(r, y)), new THREE.Vector2(0, 0.5)];
  return new THREE.LatheGeometry(p, seg);
}
// Arm- und Beinform: Radius am Anfang, dickste Stelle (bei Anteil pm), Ende; Enden rund (keine Kante am Gelenk).
// kappe: wie lang die Rundung an den Enden ist (Anteil); klein = Glied geht fast ohne Einschnürung ins Gelenk über
function glied(r0, rMax, r1, pm, kappe = 0.08) {
  const p = [];
  const us = [0.004, 0.015, 0.03, 0.05, 0.08, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.92, 0.95, 0.97, 0.985, 0.996];
  for (const u of us) {
    const basis = u < pm ? r0 + (rMax - r0) * Math.sin(Math.PI / 2 * u / pm) : r1 + (rMax - r1) * Math.cos(Math.PI / 2 * (u - pm) / (1 - pm));
    const rand = Math.min(u, 1 - u) / kappe;
    p.push([u - 0.5, basis * (rand >= 1 ? 1 : Math.sqrt(1 - (1 - rand) * (1 - rand)))]);
  }
  return drehkoerper(p, 24);
}
/* ---------- Muskulöser Rumpf: eine Fläche aus Querschnitten + Muskeln ---------- */
// Rumpf-Rahmen: x = links, y = Höhe über dem Becken, z = vorn. Der Rumpf ist starr (Becken bis Hals).
// Profil: Höhe, halbe Breite, Tiefe vorn, Tiefe hinten, Rundung (2 = Ellipse, mehr = eckiger). Unten Becken/Po, oben Hals.
const RUMPF_PROFIL = [
  [-0.135, 0.0, 0.0, 0.0, 2.0], [-0.128, 0.07, 0.04, 0.05, 2.0], [-0.112, 0.125, 0.064, 0.078, 2.2], [-0.078, 0.152, 0.08, 0.092, 2.3],
  [-0.038, 0.162, 0.089, 0.095, 2.3], [0.0, 0.155, 0.094, 0.089, 2.2], [0.06, 0.143, 0.097, 0.083, 2.2], [0.12, 0.137, 0.098, 0.083, 2.2],
  [0.18, 0.139, 0.101, 0.087, 2.3], [0.24, 0.149, 0.106, 0.093, 2.4], [0.30, 0.165, 0.11, 0.1, 2.5], [0.36, 0.18, 0.112, 0.106, 2.6],
  [0.41, 0.186, 0.11, 0.108, 2.6], [0.46, 0.178, 0.1, 0.104, 2.6], [0.50, 0.15, 0.083, 0.094, 2.4], [0.535, 0.105, 0.066, 0.075, 2.2],
  [0.56, 0.062, 0.05, 0.056, 2.0], [0.575, 0.0, 0.0, 0.0, 2.0]
];
const glattStufe = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const gauss = (u) => Math.exp(-u * u);
const fenster = (h, a, b, w) => glattStufe((h - a + w) / w) * (1 - glattStufe((h - b) / w));
// Querschnitt in Höhe h (Catmull-Rom zwischen den Zeilen, damit keine Kanten entstehen)
function profil(h) {
  const P = RUMPF_PROFIL;
  let i = 0; while (i < P.length - 2 && h > P[i + 1][0]) i++;
  const u = Math.max(0, Math.min(1, (h - P[i][0]) / (P[i + 1][0] - P[i][0])));
  const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
  const out = [];
  for (let k = 1; k <= 4; k++) out.push(Math.max(0, 0.5 * (2 * b[k] + (-a[k] + c[k]) * u + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * u * u + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * u * u * u)));
  return out;
}
// Muskeln als Beulen und Rinnen (in m nach außen). vorn/hinten: 0…1, wie weit der Punkt auf Vorder-/Rückseite liegt
function muskelRelief(x, h, vorn, hinten) {
  const ax = Math.abs(x);
  let d = 0;
  // Brust: zwei Brustmuskeln mit klarer Unterkante, Rinne am Brustbein
  const brustH = h > 0.405 ? gauss((h - 0.405) / 0.055) : Math.exp(-Math.pow((0.405 - h) / 0.05, 4));
  d += vorn * 0.02 * gauss((ax - 0.08) / 0.065) * brustH;
  d -= vorn * 0.005 * gauss(x / 0.012) * fenster(h, 0.3, 0.47, 0.03);
  // Sixpack: drei Reihen, Mittellinie
  const bauch = vorn * fenster(h, 0.035, 0.285, 0.03);
  let reihen = 0; for (const hr of [0.07, 0.148, 0.226]) reihen += Math.exp(-Math.pow((h - hr) / 0.033, 4));
  d += bauch * 0.008 * Math.exp(-Math.pow((ax - 0.036) / 0.027, 4)) * reihen;
  d -= bauch * 0.004 * gauss(x / 0.008);
  // Seitliche Bauchmuskeln
  d += 0.006 * gauss((ax - 0.13) / 0.03) * gauss((h - 0.12) / 0.07) * (1 - 0.5 * hinten);
  // Latissimus: breite Flügel unter den Armen
  d += hinten * 0.022 * gauss((ax - 0.115) / 0.055) * gauss((h - 0.36) / 0.08);
  // Wirbelsäule: Rinne, daneben die Rückenstrecker
  d -= hinten * 0.008 * gauss(x / 0.014) * fenster(h, 0.0, 0.48, 0.04);
  d += hinten * 0.008 * gauss((ax - 0.032) / 0.018) * gauss((h - 0.12) / 0.09);
  // Trapez: vom Nacken zur Schulter
  d += (0.4 + 0.6 * hinten) * 0.018 * gauss((ax - 0.06) / 0.05) * gauss((h - 0.515) / 0.035);
  // Gesäß: zwei runde Backen, Rinne in der Mitte
  d += hinten * 0.036 * gauss((ax - 0.07) / 0.06) * gauss((h + 0.052) / 0.048);
  d -= hinten * 0.012 * gauss(x / 0.013) * (1 - glattStufe((h + 0.03) / 0.03));
  return d;
}
// Punkt auf der Rumpf-Fläche: Höhe h, Winkel w (0 = vorn, π/2 = links), aus = zusätzlich nach außen (für Bund und Gurt)
export function rumpfPunkt(h, w, aus = 0) {
  const [W, Df, Db, n] = profil(h);
  const s = Math.sin(w), c = Math.cos(w), e = 2 / n, D = c >= 0 ? Df : Db;
  const x = W * Math.sign(s) * Math.pow(Math.abs(s), e);
  const z = D * Math.sign(c) * Math.pow(Math.abs(c), e);
  let nx = x / (W * W + 1e-6), nz = z / (D * D + 1e-6);
  const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  const d = muskelRelief(x, h, glattStufe((c - 0.15) / 0.45), glattStufe((-c - 0.15) / 0.45)) * Math.min(1, W / 0.06) + aus;
  return V(x + nx * d, h, z + nz * d);
}
// Ein Stück der Fläche (Höhe h0…h1, Winkel w0…w1). Normalen aus der Fläche selbst, damit Nähte zwischen Stücken nicht auffallen
function rumpfStueck(h0, h1, w0, w1, nh, nw) {
  const pos = [], nor = [], idx = [], e = 1e-3;
  for (let i = 0; i <= nh; i++) {
    const h = h0 + (h1 - h0) * i / nh;
    for (let j = 0; j <= nw; j++) {
      const w = w0 + (w1 - w0) * j / nw;
      const p = rumpfPunkt(h, w);
      const n = rumpfPunkt(h, w + e).sub(rumpfPunkt(h, w - e)).cross(rumpfPunkt(h + e, w).sub(rumpfPunkt(h - e, w)));
      if (n.lengthSq() < 1e-14) n.set(0, h > 0.2 ? 1 : -1, 0);
      n.normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z);
    }
  }
  for (let i = 0; i < nh; i++) for (let j = 0; j < nw; j++) {
    const a = i * (nw + 1) + j, b = a + 1, c = a + nw + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}
// Ring um den Rumpf in Höhe h (Hosenbund, Gurt): r = Dicke, hoch = Streckung nach oben/unten
export function rumpfRing(h, aus, r, hoch = 1) {
  const pkt = [];
  for (let j = 0; j < 72; j++) { const p = rumpfPunkt(h, j / 72 * Math.PI * 2, aus); p.y = 0; pkt.push(p); }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pkt, true), 120, r, 10, true);
  geo.scale(1, hoch, 1); geo.translate(0, h, 0);
  return geo;
}
// Deltamuskel: Kappe über dem Schultergelenk, läuft weich in den Oberarm aus (y = 0 am Gelenk, -y = Richtung Ellbogen)
const DELTA = new THREE.LatheGeometry([[0, 0.065], [0.03, 0.06], [0.05, 0.05], [0.066, 0.035], [0.074, 0.015], [0.076, -0.01], [0.073, -0.04],
  [0.066, -0.07], [0.06, -0.1], [0.057, -0.13], [0.055, -0.15], [0, -0.155]].reverse().map(([r, y]) => new THREE.Vector2(r, y)), 32);   // von unten nach oben, sonst zeigen die Flächen nach innen
// Hosenbein: oben rund (geht ins Becken über), unten gerader Saum; Länge 1 vom Hüftgelenk abwärts
const HOSENBEIN = drehkoerper([[-0.5, 0.05], [-0.47, 0.075], [-0.42, 0.09], [-0.34, 0.097], [0.0, 0.096], [0.5, 0.093]], 22);
const SEITE = 1.83;   // Winkel, an dem Vorder- und Rückseite aneinanderstoßen (etwas hinter der Flanke)
const BUND = 0.02;    // Oberkante der Shorts über dem Becken

// DK-Logo (Pfade wie im App-Symbol) als Textur für die Shorts
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
    const hose = mat(FARBEN.hose, { roughness: 0.72 });
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
    // Rumpf aus Stücken derselben Fläche: so leuchten Brust, Rücken, Bauch und Po einzeln (arbeitende Muskeln, Coach erklärt)
    this.rumpfTeile = [];
    const rumpfTeil = (name, geo, matl) => { const m = teil(name, geo, matl); this.rumpfTeile.push(m); return m; };
    rumpfTeil('bauch', rumpfStueck(BUND, 0.27, 0, Math.PI * 2, 16, 56), haut);
    rumpfTeil('brustkorb', rumpfStueck(0.27, 0.575, -SEITE, SEITE, 22, 34), haut);
    rumpfTeil('ruecken', rumpfStueck(0.27, 0.575, SEITE, Math.PI * 2 - SEITE, 22, 30), haut);
    rumpfTeil('hosenbund', rumpfStueck(-0.135, BUND, -SEITE, SEITE, 16, 30), hose);
    rumpfTeil('gesaess_l', rumpfStueck(-0.135, BUND, SEITE, Math.PI, 16, 16), hose);
    rumpfTeil('gesaess_r', rumpfStueck(-0.135, BUND, Math.PI, Math.PI * 2 - SEITE, 16, 16), hose);
    // Bund der Shorts: läuft ringsum am Körper entlang
    rumpfTeil(null, rumpfRing(BUND - 0.004, 0.002, 0.008, 2.2), mat(0x34383f, { roughness: 0.55 }));
    kapsel('nacken', 0.056, haut, 0.08);
    // Kopf leicht oval, Haare als Kappe nach hinten gekippt (zeigt, wohin die Figur schaut)
    const kopf = kugel('kopf', MASS.kopf, haut); kopf.scale.set(0.9, 1.08, 1);
    const haarForm = new THREE.SphereGeometry(MASS.kopf * 1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52); haarForm.rotateX(-0.5);
    const haar = new THREE.Mesh(haarForm, mat(FARBEN.haar, { roughness: 0.9 })); haar.castShadow = true; kopf.add(haar);
    // DK außen auf dem linken Hosenbein
    this.logo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshStandardMaterial({
      map: logoTextur(), transparent: true, alphaTest: 0.05, roughness: 0.35, metalness: 0.5,
      emissive: 0xc29c5e, emissiveIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.logo.material.emissiveMap = this.logo.material.map;
    this.gruppe.add(this.logo);
    this.handRuecken = {};
    for (const s of ['l', 'r']) {
      // Muskulös, aber natürlich: Bizeps/Trizeps, kräftige Unterarme, runde Schultern, Oberschenkel und Waden mit Form
      teil('oberarm_' + s, glied(0.058, 0.066, 0.045, 0.38, 0.035), haut); teil('unterarm_' + s, glied(0.046, 0.052, 0.031, 0.2, 0.035), haut);
      const hand = kugel('hand_' + s, 1, haut); hand.scale.set(0.043, 0.052, 0.03);
      // Goldene Knöchel-Leiste auf dem Handrücken: zeigt, ob Ober- oder Untergriff
      const leiste = new THREE.CapsuleGeometry(0.008, 0.05, 4, 8); leiste.rotateZ(Math.PI / 2);
      this.handRuecken[s] = teil(null, leiste, gold);
      teil('schulter_' + s, DELTA, haut);
      teil('oberschenkel_' + s, glied(0.082, 0.089, 0.055, 0.28, 0.035), haut); teil('unterschenkel_' + s, glied(0.052, 0.061, 0.034, 0.27, 0.035), haut);
      teil('hosenbein_' + s, HOSENBEIN, hose);
      kapsel('fuss_' + s, 0.04, schuh, MASS.fussLaenge * 0.8);
      kugel('knie_' + s, 0.055, haut); kugel('ellbogen_' + s, 0.046, haut);
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
    for (const m of this.rumpfTeile) { m.position.copy(g.becken); m.quaternion.copy(R.q); }
    K(T.nacken, g.brust, g.nacken.clone().add(R.oben.clone().multiplyScalar(0.02)));
    T.kopf.position.copy(g.kopf); T.kopf.quaternion.copy(g.kopfQ);
    // Logo: außen auf dem linken Hosenbein, Schrift läuft quer zum Bein
    const bein = g.knie.l.clone().sub(g.huefte.l).normalize(), hoch = bein.clone().negate();
    const aussen = R.links.clone().sub(bein.clone().multiplyScalar(R.links.dot(bein))).normalize();
    this.logo.quaternion.setFromRotationMatrix(M4.makeBasis(hoch.clone().cross(aussen), hoch, aussen));
    this.logo.position.copy(g.huefte.l).lerp(g.knie.l, 0.2).add(aussen.multiplyScalar(0.1));
    for (const s of ['l', 'r']) {
      K(T['oberarm_' + s], g.schulter[s], g.ellbogen[s]);
      K(T['unterarm_' + s], g.ellbogen[s], g.handgelenk[s]);
      const a = g.handFinger[s], quer = g.handAchse[s].clone().cross(g.handRuecken[s]).normalize(), n = quer.clone().cross(a).normalize(), hand = T['hand_' + s];
      hand.quaternion.setFromRotationMatrix(M4.makeBasis(quer, a, n));
      hand.position.copy(g.handMitte[s]);
      this.handRuecken[s].quaternion.copy(hand.quaternion);
      this.handRuecken[s].position.copy(g.handMitte[s]).add(n.clone().multiplyScalar(0.026)).add(a.clone().multiplyScalar(0.01));
      // Schulter (Deltamuskel): runde Kappe über dem Gelenk, geht mit dem Oberarm mit
      const arm = g.ellbogen[s].clone().sub(g.schulter[s]).normalize();
      T['schulter_' + s].position.copy(g.schulter[s]).add(R.links.clone().multiplyScalar(s === 'l' ? -0.006 : 0.006));
      T['schulter_' + s].quaternion.setFromUnitVectors(V(0, -1, 0), arm);
      T['ellbogen_' + s].position.copy(g.ellbogen[s]);
      K(T['oberschenkel_' + s], g.huefte[s], g.knie[s]);
      K(T['hosenbein_' + s], g.huefte[s].clone().sub(g.knie[s].clone().sub(g.huefte[s]).multiplyScalar(0.06)), g.huefte[s].clone().lerp(g.knie[s], 0.42));
      K(T['unterschenkel_' + s], g.knie[s], g.knoechel[s]);
      T['knie_' + s].position.copy(g.knie[s]);
      K(T['fuss_' + s], g.ferse[s], g.zehe[s]);
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
// Farbe als CSS-Text für Canvas-Texturen (getHex liefert sRGB)
const rgba = (c, a) => { const x = c.getHex(); return 'rgba(' + (x >> 16 & 255) + ',' + (x >> 8 & 255) + ',' + (x & 255) + ',' + a + ')'; };
const HINWEIS_FARBE = { technik: 0x35c6d4, fehler: 0xff4b3a, vorsicht: 0xffa53a };

export class Ansicht {
  // opt: standbild (Vorschaubild, ohne Steuerung), hintergrund (Farbe), effekte (Leuchtboden, Partikel, Farblichter; Hintergrund kommt dann aus dem CSS)
  constructor(canvas, opt = {}) {
    this.canvas = canvas;
    this.effekte = !!opt.effekte && !opt.standbild;
    this.einleitung = opt.einleitung != null ? !!opt.einleitung : !opt.standbild;   // Ablauf vor der Übung (hinlaufen, greifen)
    // Farben der Bühne (Kantenlicht, Bodenring, Pulse, Funken): aus der Farbwelt der Seite (buehne.js gibt sie mit), sonst Orange/Türkis
    this.farbeA = new THREE.Color(opt.farbeA || 0xffa53a); this.farbeB = new THREE.Color(opt.farbeB || 0x35c6d4);
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
    // Zwei farbige Kantenlichter: Farbe A von hinten links, Farbe B von hinten rechts
    const kante = new THREE.DirectionalLight(this.farbeA, 1.1); kante.position.set(-3, 2.5, -3); this.szene.add(kante);
    const kante2 = new THREE.DirectionalLight(this.farbeB, 0.9); kante2.position.set(3, 1.8, -2.5); this.szene.add(kante2);
    const boden = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), mat(FARBEN.boden, { roughness: 0.9, transparent: this.effekte, opacity: this.effekte ? 0.92 : 1 }));
    boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true; this.szene.add(boden);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.17, 2.2, 96), new THREE.MeshBasicMaterial({ color: this.effekte ? this.farbeB : 0x3a3226, transparent: true, opacity: this.effekte ? 0.55 : 1 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; this.szene.add(ring);
    if (this.effekte) this.effekteBauen();
    // Echter Körper (figur-modell.js), sobald koerper.bin geladen ist (app.js lädt ihn mit); sonst die gebaute Figur
    this.figur = koerper() ? new FigurModell() : new Figur(); this.szene.add(this.figur.gruppe);
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
    const kegel = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: leuchtTextur(rgba(this.farbeA, 0.55), rgba(this.farbeA, 0)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    kegel.rotation.x = -Math.PI / 2; kegel.position.y = 0.004; this.szene.add(kegel); this.kegel = kegel;
    this.pulse = [0, 1].map((i) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 96), new THREE.MeshBasicMaterial({ color: i ? this.farbeB : this.farbeA, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      r.rotation.x = -Math.PI / 2; r.position.y = 0.006; this.szene.add(r); return r;
    });
    const n = 140, pos = new Float32Array(n * 3), farbe = new Float32Array(n * 3);
    const gold = this.farbeA.clone().lerp(new THREE.Color(0xffffff), 0.25), tuerkis = this.farbeB.clone().lerp(new THREE.Color(0xffffff), 0.25);
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
    this.stangen = festeStangen(animation, this.geraete, this.zustand);
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
    // Ablauf davor (hinlaufen, aufheben, hinsetzen, greifen): nur in der Live-Ansicht, nicht bei Standbildern
    this.intro = null;
    if (this.einleitung) {
      try { this.intro = baueEinleitung(animation, this.geraete, this.zustand, richt.clone()); this.introZeit = 0; } catch (e) { this.intro = null; }
    }
  }
  // Ein Bild des Ablaufs davor: Geräte gehen erst mit, wenn die Hände sie gegriffen haben
  introBild(sek) {
    const pose = this.intro.pose(sek), g = gelenke(pose);
    this.gAktuell = g;
    if (this.intro.gehtMit(sek)) { const erg = this.uebung.pose(this.intro.tStart, this.zustand); if (erg.props) erg.props(g, this.zustand); }
    haltErkennen(g, this.zustand, this.stangen || []);
    this.figur.stelle(g);
    this.figur.glut(0);
  }
  bild(t) {
    if (!this.uebung) return;
    if (this.zustand) this.zustand.runter = !!this.runter;   // für Übungen, die hoch anders aussehen als runter (Zottman Curl)
    const erg = this.uebung.pose(t, this.zustand);
    festErkennen(erg.pose, this.stangen || []);
    const g = gelenke(erg.pose);
    this.gAktuell = g;
    if (erg.props) erg.props(g, this.zustand);
    haltErkennen(g, this.zustand, this.stangen || []);   // erst die Geräte setzen, dann weiß die Hand, ob sie zur Faust wird
    this.figur.stelle(g);
    this.figur.glut(t);
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
        if (this.festT != null) this.intro = null;
        if (this.intro) {
          if (this.laeuft) this.introZeit += dt * this.tempo;
          if (this.introZeit < this.intro.dauer) this.introBild(this.introZeit);
          else { this.zeit = this.intro.tStart > 0.5 ? (this.uebung.dauer || [1.0, 0.4, 2.0, 0.5])[0] : 0; this.intro = null; }
        }
        if (!this.intro) {
          if (this.festT != null) { this.tJetzt += (this.festT - this.tJetzt) * Math.min(1, dt * 3); t = this.tJetzt; }
          else { t = this.phase(this.zeit); this.tJetzt = t; }
          this.bild(t);
        }
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
