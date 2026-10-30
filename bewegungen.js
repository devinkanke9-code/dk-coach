// DK Coach — Bewegungsvorlagen für die 3D-Figur.
// Jede Vorlage ist eine Funktion (optionen) → Animation { aufbau(geraete), pose(t), blick, abstand, kameraRicht, dauer }.
// t läuft von 0 (Start der Bewegung, z. B. unten bei der Kniebeuge) bis 1 (Endposition, z. B. oben).
import { THREE, V, RAD, MASS, SOHLE, BALLEN, HAND_ULNAR, rumpfRahmen, rumpfRing, rumpfPunkt, rundGeo, scheibenGeo, ik } from './figur.js';

const FY = 0.07;                                  // Knöchelhöhe, Fuß steht auf dem Boden
// Ellbogen bis Faustmitte: Die greifende Hand ist zur Kleinfingerseite geknickt (HAND_ULNAR), die Faust liegt griffTief zur Handfläche hin
const UNTERARM = Math.hypot(MASS.unterarm + MASS.griff * Math.cos(HAND_ULNAR), MASS.griff * Math.sin(HAND_ULNAR), MASS.griffTief);
const ARM = MASS.oberarm + UNTERARM;                        // Schulter bis Faustmitte bei gestrecktem Arm (dort liegt das Ziel der Hand)
const STUETZ = MASS.oberarm + MASS.unterarm;                // Schulter bis Handgelenk: flache Hand beim Stütz (Liegestütz, Handstand)
const genau = (v) => Object.assign(v, { genau: true });   // Ziel der Hand gilt genau (Vorlage rechnet schon mit Ellbogen → Faust)
const BEIN = MASS.oberschenkel + MASS.unterschenkel;
const mix = (a, b, t) => a + (b - a) * t;
const mv = (A, B, t) => A.clone().lerp(B, t);
const LIEGEND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, 0, 0));      // Rücken unten, Kopf nach -z
const BAUCHLAGE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, Math.PI, 0)); // Bauch unten, Kopf nach -z, linke Seite bei -x
// (Neigung in Bauchlage: negativ = Brust hebt sich vom Boden)
const quer = (grad) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), grad * RAD);

// Rumpfpunkte genau wie in figur.js → gelenke()
function rumpf(becken, r) {
  const R = rumpfRahmen(r);
  const brust = becken.clone().add(R.oben.clone().multiplyScalar(MASS.rumpf));
  const sch = (sg) => brust.clone().add(R.links.clone().multiplyScalar(sg * MASS.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03));
  return { R, brust, schulter: { l: sch(1), r: sch(-1) } };
}
const seiten = (f) => ({ l: f('l', 1), r: f('r', -1) });
const seitenBauch = (f) => ({ l: f('l', -1), r: f('r', 1) });   // Bauchlage und Stütz mit Kopf nach -z: links liegt bei -x
function stehFuesse(breite = 0.15, z = 0, aussen = 0.3) {
  return { fuss: seiten((s, sg) => V(sg * breite, FY, z)), fussRicht: seiten((s, sg) => V(sg * aussen, 0, 1)) };
}
// Neigung (Grad), bei der die Schultern auf Höhe h liegen
function neigungFuer(beckenY, schulterY) {
  const c = (schulterY - beckenY) / (MASS.rumpf - 0.03);
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

/* ---------- Geräte, die mitlaufen ---------- */
function stangeAn(obj, g, versatz) {
  const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
  if (versatz) mitte.add(versatz);
  obj.position.copy(mitte);
  obj.quaternion.setFromUnitVectors(V(1, 0, 0), g.hand.l.clone().sub(g.hand.r).normalize());
}
// Kabelstange zwischen beide Fäuste, Drehring zeigt zum Kabel (anker)
function kabelstangeAn(obj, g, anker) {
  const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), quer = g.hand.l.clone().sub(g.hand.r).normalize();
  obj.position.copy(mitte);
  const hoch = anker.clone().sub(mitte); hoch.sub(quer.clone().multiplyScalar(hoch.dot(quer)));
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(quer, hoch.normalize(), quer.clone().cross(hoch).normalize()));
  return mitte;
}
function hantelAn(obj, hand, achse) {
  obj.position.copy(hand);
  obj.quaternion.setFromUnitVectors(V(1, 0, 0), achse.clone().normalize());
}
function kabelZu(ger, z, nameAnker, nameZiel, ziel) { ger.legeStab(z[nameZiel], z[nameAnker], ziel); }
const unterarmAchse = (g, s) => g.hand[s].clone().sub(g.ellbogen[s]).normalize();
// Kurzhantel quer zur Hand (Obergriff/Untergriff), Hammergriff (Unterarm neutral gedreht, Handfläche zum Körper) oder daumenHoch (Y-Heben)
function kurzhantelnAn(z, g, griff = 'quer') {
  for (const s of ['l', 'r']) {
    if (!z['kh_' + s]) continue;
    const ua = unterarmAchse(g, s);
    khHalten(z, g, s, z['kh_' + s], griff === 'hammer' ? 'neutral' : griff === 'daumenHoch' ? { daumen: V(0, 1, 0) } : g.R.links.clone().sub(ua.clone().multiplyScalar(g.R.links.dot(ua))));
  }
}
// Kurzhantel in der Faust: liegt entlang der Fingerknöchel (so umschließen Finger und Daumen den Griff). achse = gewünschte Griffart
// ('neutral' = Hammergriff, { daumen } = Richtung des Daumens oder eine Achse quer zur Hand); sie geht über z.griffAchse an gelenke(),
// das die Hand im nächsten Bild dorthin dreht
function faustAchse(g, s) { return g.handAchse[s].clone().cross(g.handRuecken[s]).normalize(); }
function khHalten(z, g, s, kh, achse) {
  (z.griffAchse = z.griffAchse || {})[s] = achse.isVector3 ? achse.clone().normalize() : achse;
  const fa = faustAchse(g, s);
  hantelAn(kh, g.hand[s], achse.isVector3 && fa.dot(achse) < 0 ? fa.negate() : fa);
}
// Kettlebell in einer Hand: Griff in der Hand, die Kugel liegt außen am Unterarm (Rack, Drücken, Tragen über Kopf)
function kettlebellAn(kb, g, s) {
  const unten = g.handRuecken[s].clone().multiplyScalar(0.6).sub(g.handAchse[s].clone().multiplyScalar(0.8)).normalize();
  kb.position.copy(g.hand[s]).add(unten.clone().multiplyScalar(-0.02));
  kb.quaternion.setFromUnitVectors(V(0, -1, 0), unten);
}
function khAufbauen(ger, z, beide = true) { z.kh_l = ger.kurzhantel(); if (beide) z.kh_r = ger.kurzhantel(); }
// Seil, Band oder Hebel zwischen zwei Punkten (für ger.stab-Teile)
function seil(mesh, A, B) {
  const d = B.clone().sub(A), l = Math.max(d.length(), 1e-4);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.divideScalar(l)); mesh.scale.set(1, l, 1);
}
// Rumpf-Ausrichtung aus zwei Richtungen: oben (Becken → Brust) und vor (Bauchseite)
function basisAus(oben, vor) {
  const o = oben.clone().normalize();
  const v = vor.clone().sub(o.clone().multiplyScalar(vor.dot(o))).normalize();
  const l = o.clone().cross(v);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(l, o, v));
}
// Multipresse: zwei Führungsschienen an den Stangenenden
// Multipresse (Smith-Maschine): Die Stange läuft mit zwei Lagerböcken an senkrechten Chromstangen (Führungen bei x = ±SMITH_X), die Scheiben
// sitzen außen davon. Rahmen mit vier Pfosten, oben und hinten verbunden, vorne offen; Sicherheitsanschläge unten an den Führungen,
// Scheibenablage hinten. Die Stange kann nur senkrecht fahren: smithFuehren() legt die Hand-Ziele dieser Vorlagen auf die Führungslinie
const SMITH_X = 0.62;
function schienenAufbauen(ger, z) {
  const r = new THREE.Group();
  const teil = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); o.castShadow = true; o.receiveShadow = true; r.add(o); return o; };
  for (const sx of [-1, 1]) {
    for (const zz of [-0.38, 0.38]) teil(rundGeo(0.08, 2.2, 0.08, 0.01, 1), ger.mRahmen, sx * 1.02, 1.1, zz);
    for (const y of [0.03, 2.2]) teil(rundGeo(0.08, 0.06, 0.84, 0.01, 1), ger.mRahmen, sx * 1.02, y, 0);
    for (const y of [0.07, 2.16]) teil(rundGeo(1.02 - SMITH_X + 0.06, 0.06, 0.07, 0.01, 1), ger.mRahmen, sx * (1.02 + SMITH_X) / 2, y, 0);
    // Führung mit Sicherheitsanschlag (in einer Gruppe, die bei schrägen Führungen um ihre Mitte kippt)
    const f = new THREE.Group(); f.position.set(sx * SMITH_X, 1.12, 0); r.add(f); (z.smithFuehrung = z.smithFuehrung || []).push(f);
    maschTeil(f, new THREE.CylinderGeometry(0.016, 0.016, 2.08, 16), ger.mMetall);
    maschTeil(f, new THREE.CylinderGeometry(0.042, 0.042, 0.07, 20), ger.mGummi, 0, 0.42 - 1.12, 0);
    maschTeil(f, rundGeo(0.1, 0.03, 0.06, 0.008, 1), ger.mRahmen, 0, 0.375 - 1.12, 0);
    const horn = teil(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 16), ger.mMetall, sx * 1.02, 0.55, -0.5); horn.rotation.x = Math.PI / 2;   // Scheibenablage
    teil(scheibenGeo(0.225, 0.05), ger.mScheibe, sx * 1.02, 0.55, -0.52).rotation.x = Math.PI / 2;
  }
  for (const y of [0.03, 2.2]) teil(rundGeo(2.12, 0.06, 0.08, 0.01, 1), ger.mRahmen, 0, y, -0.38);
  teil(rundGeo(2.12, 0.06, 0.08, 0.01, 1), ger.mRahmen, 0, 2.2, 0.38);
  ger.gruppe.add(r);
  z.smith = r;
}
function schienenAn(z) {
  if (!z.smith || !z.lh) return;
  // Führungen gehen durch die Linie der Stange (z.smithLinie: Punkt oben + Neigung, sonst senkrecht durch die Stange)
  const L = z.smithLinie;
  z.smith.position.set(0, 0, L ? L.z + (1.12 - L.y) * Math.tan(L.kipp) : z.lh.position.z);
  for (const f of z.smithFuehrung || []) f.rotation.x = L ? L.kipp : 0;
  if (!z.lager) {   // Lagerböcke mit Haken: gehören zur Stange und fahren mit ihr an den Führungen
    z.lager = [-1, 1].map((sx) => {
      const g = new THREE.Group(); g.position.x = sx * SMITH_X;
      const block = new THREE.Mesh(rundGeo(0.07, 0.13, 0.075, 0.01, 1), z.smith.children[0].material); block.castShadow = true; g.add(block);
      const haken = new THREE.Mesh(rundGeo(0.02, 0.06, 0.05, 0.006, 1), z.smith.children[0].material); haken.position.set(0, 0.07, -0.05); g.add(haken);
      z.lh.add(g); return g;
    });
  }
}
// Hände an einer Multipresse: alle Hand-Ziele auf eine Linie (z fest = Mittel über die Bewegung), weil die Stange nur senkrecht fahren kann
function smithFuehren(f, oben = false) {
  return (o = {}) => {
    const a = f(o);
    if (o.last !== 'multipresse' || !a.pose) return a;
    const pose = a.pose;
    let zFest = null;
    a.pose = (t, z) => {
      const erg = pose.call(a, t, z);
      if (!erg.pose.hand) return erg;
      if (zFest == null) {
        const bei = (u) => { const h = pose.call(a, u, z).pose.hand; return { y: (h.l.y + h.r.y) / 2, z: (h.l.z + h.r.z) / 2 }; };
        const o1 = bei(1), u0 = bei(0);
        // Bank-/Schulterdrücken: Linie durch die Stange oben (über der Schulter), höchstens 8° schräg zur Stange unten (wie echte Smith-Maschinen)
        const kipp = oben ? Math.max(-8 * RAD, Math.min(8 * RAD, Math.atan2(o1.z - u0.z, o1.y - u0.y))) : 0;
        zFest = oben ? { y: o1.y, z: o1.z, kipp } : { y: 0, z: [0, 0.25, 0.5, 0.75, 1].map((u) => bei(u).z).reduce((x, y) => x + y, 0) / 5, kipp: 0 };
      }
      if (z) z.smithLinie = zFest;
      for (const s of ['l', 'r']) { const n = genau(erg.pose.hand[s].clone()); n.z = zFest.z + (n.y - zFest.y) * Math.tan(zFest.kipp); erg.pose.hand[s] = n; }   // genau: die Faust bleibt auf der Linie, auch bei fast gestreckten Armen
      return erg;
    };
    return a;
  };
}
const glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
// Körper als Brett um einen Drehpunkt (Fersen/Knie), Länge L bis zur Schulter: Winkel (Grad über der Waagrechten), bei dem die Schulter
// den Abstand d zum Griff hat (umgekehrtes Rudern: unten Arme gestreckt)
function winkelFuer(dreh, L, griff, d, von = -20, bis = 70) {
  const ab = (w) => dreh.clone().add(V(0, Math.sin(w * RAD), -Math.cos(w * RAD)).multiplyScalar(L)).distanceTo(griff);
  for (let i = 0; i < 40; i++) { const m = (von + bis) / 2; if (ab(m) > d) von = m; else bis = m; }
  return (von + bis) / 2;
}
const STATISCH = [1.5, 0.2, 1.5, 0.2];
const HACK = 38;   // Hack Squat: Rücken so viele Grad nach hinten gelehnt (Schienenwinkel)
const HACK_FUSS = V(0, 0.21, 0.36);   // Hack Squat: Mitte zwischen den Füßen auf der Plattform
// Tisch zum Rudern darunter: Platte in Höhe h, Vorderkante bei z = 0
function tisch(ger, h) {
  ger.box(1.1, 0.04, 0.75, V(0, h + 0.02, -0.33), ger.mRahmen);
  for (const sx of [-0.48, 0.48]) for (const sz of [-0.66, -0.02]) ger.box(0.05, h, 0.05, V(sx, h / 2, sz), ger.mRahmen);
}
// Türanker für Bänder: Tür mit Rahmen, Anker oben an der Tür
function tuer(ger, z0, hoehe = 2.05) {
  ger.box(0.86, hoehe, 0.04, V(0, hoehe / 2, z0), ger.mPolster);
  for (const sx of [-1, 1]) ger.box(0.06, hoehe + 0.06, 0.1, V(sx * 0.46, (hoehe + 0.06) / 2, z0), ger.mRahmen);
  ger.box(0.98, 0.06, 0.1, V(0, hoehe + 0.03, z0), ger.mRahmen);
}

/* =================================================================== */
/* Beine                                                                */
/* =================================================================== */

// Kniebeuge. last: hinten | vorne | goblet | keine | kurzhanteln | multipresse | kettlebell | haengend (eine Hantel hängt zwischen den Beinen) | band ; box, fersen (Fersen erhöht): true ; breite: Faktor
// dauer: [hoch, oben, runter, unten] in s (z. B. Pause unten; wirkt bei jeder Vorlage über animation())
export function kniebeuge(o = {}) {
  const last = o.last || 'hinten', tiefe = o.tiefe != null ? o.tiefe : 1, breite = 0.15 * (o.breite || 1);
  const lean = { hinten: 36, vorne: 16, goblet: 20, keine: 28, kurzhanteln: 26, multipresse: 32, kettlebell: 20, haengend: 18, band: 22 }[last] * (o.fersen ? 0.7 : 1);
  const sumo = (o.breite || 1) > 1.5;
  return {
    aufbau(ger) {
      const z = {};
      if (last === 'hinten' || last === 'vorne' || last === 'multipresse') z.lh = ger.langhantel();
      if (last === 'goblet' || last === 'haengend') { z.kh_l = ger.kurzhantel(); }
      if (last === 'band') { z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      if (o.fersen) ger.box(0.5, 0.035, 0.12, V(0, 0.0175, -0.05), ger.mRahmen);
      if (last === 'kettlebell') z.kb = ger.kettlebell();
      if (last === 'kurzhanteln') khAufbauen(ger, z);
      if (last === 'multipresse') for (const sx of [-1, 1]) ger.box(0.06, 2.3, 0.06, V(sx * 0.95, 1.15, -0.12), ger.mRahmen);
      if (o.box) ger.box(0.42, 0.35, 0.38, V(0, 0.175, -0.36), ger.mPolster);   // Box auf Parallel-Höhe
      return z;
    },
    pose(t) {
      // Unten Oberschenkel mindestens waagrecht, oben Knie gestreckt
      const beckenUnten = V(0, mix(0.97, o.box ? 0.48 : 0.44, tiefe), -0.17 * tiefe * (last === 'vorne' || last === 'goblet' ? 0.75 : 1));
      const becken = mv(beckenUnten, V(0, o.fersen ? 1.0 : sumo ? 0.946 : 0.985, 0.0), t);   // Sumo: weiter Stand, Füße bleiben flach
      const r = { neigung: mix(lean * tiefe, 4, t) };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'hinten' || last === 'multipresse') {
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.42)).sub(k.R.vor.clone().multiplyScalar(0.1)).add(k.R.oben.clone().multiplyScalar(0.02));
          epol[s] = k.R.oben.clone().multiplyScalar(-1).sub(k.R.vor.clone().multiplyScalar(0.6));
        } else if (last === 'vorne') {
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.2)).add(k.R.vor.clone().multiplyScalar(0.13)).add(k.R.oben.clone().multiplyScalar(0.02));
          epol[s] = k.R.vor.clone().add(k.R.links.clone().multiplyScalar(sg * 0.3));
        } else if (last === 'goblet' || last === 'kettlebell') {
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.05)).add(k.R.vor.clone().multiplyScalar(0.2)).sub(k.R.oben.clone().multiplyScalar(0.12));
          epol[s] = k.R.oben.clone().multiplyScalar(-1).add(k.R.links.clone().multiplyScalar(sg * 0.3));
        } else if (last === 'keine') {
          hand[s] = k.schulter[s].clone().add(V(0, -0.05, ARM * 0.95));
          epol[s] = V(sg, -1, 0);
        } else if (last === 'haengend') {
          // Arme hängen senkrecht, beide Hände halten eine Hantel in der Mitte
          const sch = k.schulter[s], dx = sch.x - sg * 0.035;
          hand[s] = V(sg * 0.035, sch.y - Math.sqrt(Math.max(0.01, (ARM * 0.97) ** 2 - dx * dx)), sch.z + 0.04);
          epol[s] = V(sg, 0, -0.3);
        } else if (last === 'band') {
          hand[s] = k.schulter[s].clone().add(k.R.vor.clone().multiplyScalar(0.1)).add(k.R.oben.clone().multiplyScalar(0.03)).add(k.R.links.clone().multiplyScalar(sg * 0.03));
          epol[s] = V(sg * 0.3, -1, 0.6);
        } else {
          hand[s] = k.schulter[s].clone().add(V(sg * 0.06, -ARM * 0.9995, 0));
          epol[s] = V(sg * 0.3, 0, -1);
        }
      }
      // Last über dem Mittelfuß: der ganze Körper rückt, bis die Stange (bzw. Hantel) senkrecht über der Fußmitte liegt
      if (last !== 'keine' && last !== 'band') { const dz = 0.04 - (hand.l.z + hand.r.z) / 2; becken.z += dz; for (const s of ['l', 'r']) hand[s].z += dz; }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kniePol: seiten((s, sg) => V(sg * (sumo ? 0.9 : 0.35), 0, 1)) }, stehFuesse(breite, 0, sumo ? 0.7 : 0.3),
          o.fersen ? { fuss: seiten((s, sg) => V(sg * breite, FY + 0.03, 0)), zehen: seiten(() => 14) } : {}),
        props(g, z) {
          if (z.lh) stangeAn(z.lh, g);
          if (z.kh_l && last === 'goblet') { z.kh_l.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)); z.kh_l.quaternion.setFromUnitVectors(V(1, 0, 0), g.R.oben); }
          if (z.kh_l && last === 'haengend') { z.kh_l.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)).add(V(0, -0.12, 0)); z.kh_l.quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); }
          if (z.band_l) for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['band_' + s], V(sg * 0.1, 0.03, 0.03), g.hand[s]);
          if (z.kb) z.kb.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)).add(V(0, 0.04, 0));
          if (last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
        }
      };
    },
    blick: V(0, 0.75, 0), abstand: 3.4
  };
}

// Kreuzheben & Hüftbeugen. art: klassisch | rumaenisch | trapbar | kurzhanteln | kettlebell | sumo | goodmorning | huefte_wand | einbeinig | pull_through
// last (rumaenisch, einbeinig): langhantel | kurzhanteln | keine ; einbeinig auch last kurzhantel (eine Hantel rechts) ; last (pull_through): kabel | band
// block: Blockheben ab Kniehöhe ; bstance: hinterer Fuß nur auf den Zehen ; sumo: breiter Stand (auch mit Kettlebell)
export function kreuzheben(o = {}) {
  const art = o.art || 'klassisch';
  const kh = art === 'kurzhanteln' || o.last === 'kurzhanteln';
  const steif = art === 'rumaenisch' || art === 'goodmorning' || art === 'huefte_wand';
  if (art === 'einbeinig' || art === 'pull_through') return hueftbeuge(art, o);
  return {
    aufbau(ger) {
      const z = {};
      if (kh) khAufbauen(ger, z);
      else if (art === 'trapbar') z.lh = trapBar(ger);   // wie eine Langhantel: liegt unten auf dem Boden, Ablauf davor greift sie dort
      else if (['klassisch', 'rumaenisch', 'sumo', 'goodmorning'].includes(art)) z.lh = ger.langhantel();
      if (art === 'kettlebell') z.kb = ger.kettlebell();
      if (art === 'huefte_wand') ger.box(1.2, 1.6, 0.06, V(0, 0.8, -0.42), ger.mRahmen);
      if (o.block) for (const sx of [-1, 1]) ger.box(0.16, 0.29, 0.5, V(sx * 0.78, 0.145, 0.0), ger.mRahmen);
      return z;
    },
    pose(t) {
      const sumo = art === 'sumo' || !!o.sumo;
      const breite = sumo ? 0.34 : 0.13;
      let beckenU, leanU;
      if (steif) { beckenU = V(0, 0.935, -0.2); leanU = art === 'huefte_wand' ? 55 : 68; }
      else if (sumo) { beckenU = V(0, 0.6, -0.12); leanU = null; }
      else if (o.block) { beckenU = V(0, 0.8, -0.17); leanU = null; }
      else { beckenU = V(0, 0.69, -0.2); leanU = null; }
      const becken = mv(beckenU, V(0, 0.975, 0), t);
      let neigung;
      const stangeU = o.block ? 0.515 : art === 'kurzhanteln' || art === 'kettlebell' ? 0.22 : 0.225;
      if (leanU == null) {
        // Schultern genau eine Armlänge über der Hantel
        const schulterY = mix(stangeU, 0.0, 0) + ARM * 0.9995;
        neigung = mix(neigungFuer(beckenU.y, schulterY), 3, t);
      } else neigung = mix(leanU, 3, t);
      if (art === 'goodmorning') neigung = mix(70, 3, t);
      const r = { neigung };
      let k = rumpf(becken, r);
      // Start vom Boden: Stange über dem Mittelfuß, Schienbein fast an der Stange, Schultern knapp vor der Stange (Becken rückt dafür)
      const vomBoden = !steif && art !== 'goodmorning' && art !== 'huefte_wand';
      if (vomBoden) { becken.z += (0.08 - k.schulter.l.z) * (1 - t); k = rumpf(becken, r); }
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (art === 'goodmorning') {
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.42)).sub(k.R.vor.clone().multiplyScalar(0.1));
          epol[s] = k.R.oben.clone().multiplyScalar(-1);
        } else if (art === 'huefte_wand') {
          hand[s] = becken.clone().add(V(sg * 0.12, 0.02, 0.12));
          epol[s] = V(sg, 0, -0.5);
        } else {
          const breitGriff = art === 'kettlebell' ? 0.045 : art === 'sumo' ? 0.17 : art === 'trapbar' ? 0.29 : kh ? 0.2 : 0.25;
          hand[s] = V(sg * breitGriff, k.schulter[s].y - ARM * 0.9995, k.schulter[s].z + (art === 'trapbar' ? -0.02 : vomBoden ? mix(-0.03, 0.02, t) : 0.02));
          epol[s] = V(sg * 0.4, 0, -1);
        }
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, handflaeche: art === 'trapbar' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, ellbogenPol: epol, kniePol: seiten((s, sg) => V(sg * (sumo ? 0.8 : 0.2), 0, 1)) }, stehFuesse(breite, 0, sumo ? 0.6 : 0.2),
          o.bstance ? { fuss: { l: V(0.13, FY, 0.06), r: V(-0.13, FY, -0.3) }, zehen: { l: 0, r: 55 }, fussRicht: { l: V(0.1, 0, 1), r: V(-0.1, 0, 1) } } : {}),
        props(g, z) {
          if (z.lh) stangeAn(z.lh, g);
          if (kh) kurzhantelnAn(z, g, 'quer');
          if (z.kb) z.kb.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)).add(V(0, 0.04, 0));
        }
      };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.35, 0.45)
  };
}

// Einbeiniges RDL (links steht, rechtes Bein geht nach hinten) und Pull-Through (Zug von hinten zwischen den Beinen)
function hueftbeuge(art, o) {
  const last = o.last || (art === 'pull_through' ? 'kabel' : 'keine');
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'einbeinig' && last === 'kurzhanteln') khAufbauen(ger, z);
      if (art === 'einbeinig' && last === 'kurzhantel') z.kh_r = ger.kurzhantel();
      if (art === 'pull_through') {
        if (last === 'kabel') ger.turm(V(0, 0, -1.05)); else ger.box(0.08, 0.4, 0.08, V(0, 0.2, -1.05), ger.mRahmen);
        z.seil = ger.stab(V(), V(0, 1, 0), last === 'band' ? 0.012 : 0.006, last === 'band' ? ger.mBand : ger.mKabel);
        if (last === 'kabel') z.griff = ger.griff();
      }
      return z;
    },
    pose(t) {
      if (art === 'einbeinig') {
        const becken = mv(V(0.03, 0.9, -0.08), V(0.03, 0.975, 0), t);
        const r = { neigung: mix(78, 3, t) };
        const k = rumpf(becken, r);
        const huefteR = becken.clone().add(k.R.links.clone().multiplyScalar(-MASS.hueftBreite)).sub(k.R.oben.clone().multiplyScalar(0.02));
        // freies Bein bleibt in Linie mit dem Oberkörper
        const fussR = huefteR.clone().add(k.R.oben.clone().multiplyScalar(-BEIN * 0.97)).add(V(0, 0.03 * t, 0));
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.03, -ARM * 0.9995, 0.02)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)),
            fuss: { l: V(0.12, FY, 0.02), r: fussR }, fussRicht: { l: V(0.1, 0, 1), r: k.R.vor.clone().add(V(0, -0.2, 0)) }, kniePol: { l: V(0.1, 0, 1), r: k.R.vor.clone() } },
          props(g, z) { if (z.kh_l) kurzhantelnAn(z, g, 'hammer'); if (z.kh_r && !z.kh_l) khHalten(z, g, 'r', z.kh_r, 'neutral'); } };
      }
      // Pull-Through: Rücken zum Turm, Seil zwischen den Beinen
      const becken = mv(V(0, 0.86, -0.17), V(0, 0.975, 0), t);
      const r = { neigung: mix(62, 0, t) };
      const k = rumpf(becken, r);
      const unten = seiten((s, sg) => k.schulter[s].clone().add(V(-sg * 0.13, -ARM * 0.93, -0.06)));
      const oben = seiten((s, sg) => { const sch = rumpf(V(0, 0.975, 0), { neigung: 0 }).schulter[s], dx = sch.x - sg * 0.04, dz = 0.17 - sch.z; return V(sg * 0.04, sch.y - Math.sqrt(Math.max(0.01, (ARM * 0.985) ** 2 - dx * dx - dz * dz)), 0.17); });
      const hand = seiten((s) => mv(unten[s], oben[s], t));
      return { pose: Object.assign({ becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3)), kniePol: seiten((s, sg) => V(sg * 0.35, 0, 1)) }, stehFuesse(0.2, 0, 0.4)),
        props(g, z) {
          const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          if (z.griff) z.griff.position.copy(m);
          seil(z.seil, last === 'kabel' ? V(0, 0.22, -1.0) : V(0, 0.32, -1.0), m);
        } };
    },
    blick: V(0, 0.75, 0), abstand: 3.4, kameraRicht: V(1, 0.35, art === 'pull_through' ? 0.2 : 0.45)
  };
}

// Ausfallschritt & Co. art: split | rueckwaerts | gehend | bulgarisch | stepup | seitlich ; last: keine | kurzhanteln | langhantel | multipresse ; kosaken: true (bei seitlich)
// Neu: stepup_seitlich, curtsy ; defizit (bei rueckwaerts): Start auf einer Stufe
export function ausfallschritt(o = {}) {
  const art = o.art || 'split', last = o.last || 'keine';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'bulgarisch') ger.bank(-0.62, 0.5, 0.43);
      if (art === 'stepup') ger.box(0.5, 0.42, 0.42, V(0.15, 0.21, 0.3), ger.mPolster);
      if (art === 'stepup_seitlich') ger.box(0.42, 0.42, 0.5, V(0.45, 0.21, 0.0), ger.mPolster);
      if (o.defizit) ger.box(0.5, 0.1, 0.42, V(0, 0.05, 0.2), ger.mRahmen);
      if (last === 'kurzhanteln') khAufbauen(ger, z);
      if (last === 'langhantel' || last === 'multipresse') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      return z;
    },
    pose(t) {
      let becken, fuss, zehen = { l: 0, r: 0 }, neigung = 8, fussRicht;
      if (art === 'seitlich' && o.kosaken) {
        // Kosaken-Kniebeuge: sehr breit, tief aufs linke Bein, rechtes Bein gestreckt mit Zehen nach oben (Ferse am Boden)
        becken = mv(V(0.36, 0.42, -0.14), V(0.1, 0.925, 0), t);
        fuss = { l: V(0.55, FY, 0), r: V(-0.42, FY, 0) };
        neigung = mix(32, 3, t);
        fussRicht = { l: V(0.4, 0, 1), r: V(-0.2, 0, 1).lerp(V(-0.15, 1.2, 0.35), 1 - glatt(t)) };
      } else if (art === 'seitlich') {
        becken = mv(V(0.28, 0.6, -0.12), V(0.12, 0.975, 0), t);
        fuss = { l: V(0.5, FY, 0), r: V(-0.25, FY, 0) };
        neigung = mix(28, 3, t);
        fussRicht = { l: V(0.4, 0, 1), r: V(-0.2, 0, 1) };
      } else if (art === 'stepup_seitlich') {
        // Box steht links: linker Fuß oben, rechter Fuß drückt mit hoch und kommt neben die Box
        becken = mv(V(0.17, 0.88, 0), V(0.4, 1.38, 0.02), t);
        fuss = { l: V(0.45, 0.42 + FY, 0.0), r: mv(V(-0.1, FY, 0), V(0.25, 0.47, 0.02), glatt(t)) };
        neigung = mix(14, 3, t);
        zehen = { l: 0, r: mix(0, 25, t) };
      } else if (art === 'curtsy') {
        // Rechtes Bein geht diagonal hinter das linke (wie ein Knicks), dann zurück zur Mitte
        const f = glatt((t - 0.2) / 0.65), heb = Math.sin(f * Math.PI) * 0.09;
        fuss = { l: V(0.13, FY, 0.06), r: mv(V(0.22, FY, -0.46), V(-0.13, FY, 0.0), f).add(V(0, heb, 0)) };
        becken = mv(V(0.07, 0.56, -0.23), V(0, 0.975, 0.02), glatt(t));
        zehen = { l: 0, r: mix(45, 0, f) };
        neigung = mix(10, 3, t);
        fussRicht = { l: V(0.15, 0, 1), r: V(0.1, 0, 1) };
      } else if (art === 'stepup') {
        becken = mv(V(0.12, 0.9, -0.05), V(0.14, 1.36, 0.28), t);
        fuss = { l: V(0.15, 0.42 + FY, 0.3), r: mv(V(-0.12, FY, -0.12), V(-0.1, 0.5, 0.2), t) };
        neigung = mix(20, 3, t);
      } else if (art === 'rueckwaerts' || art === 'gehend') {
        // Aus dem Stand: rückwärts geht das rechte Bein zurück, gehend tritt das linke nach vorn
        const f = glatt((t - 0.2) / 0.65);           // 0 = Schritt steht, 1 = Füße zusammen
        const heb = Math.sin(f * Math.PI) * 0.09;
        if (art === 'rueckwaerts') {
          // Defizit: beide Füße starten auf der Stufe (0,1 m), der rechte tritt nach hinten auf den Boden
          const dh = o.defizit ? 0.1 : 0;
          fuss = { l: V(0.12, FY + dh, 0.25), r: mv(V(-0.12, FY, -0.55), V(-0.12, FY + dh, 0.22), f).add(V(0, heb, 0)) };
          becken = mv(V(0, 0.55 + dh * 0.6, -0.1), V(0, 0.975 + dh, 0.22), glatt(t));
          zehen = { l: 0, r: mix(45, 0, f) };
        } else {
          fuss = { l: mv(V(0.12, FY, 0.5), V(0.12, FY, -0.28), f).add(V(0, heb, 0)), r: V(-0.12, FY, -0.3) };
          becken = mv(V(0, 0.55, 0.1), V(0, 0.975, -0.28), glatt(t));
          zehen = { l: 0, r: mix(45, 0, f) };
        }
        neigung = mix(9, 3, t);
      } else {
        const hinten = art === 'bulgarisch' ? V(-0.12, 0.47, -0.62) : V(-0.12, FY, -0.48);
        becken = mv(V(0, art === 'bulgarisch' ? 0.5 : 0.535, -0.1), V(0, art === 'bulgarisch' ? 0.83 : 0.9, -0.08), t);   // unten: hinteres Knie knapp über dem Boden
        fuss = { l: V(0.12, FY, 0.38), r: hinten };
        zehen = { l: 0, r: art === 'bulgarisch' ? -60 : 45 };
        neigung = mix(art === 'bulgarisch' ? 14 : 6, 3, t);
      }
      const r = { neigung };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'langhantel' || last === 'multipresse') { hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.42)).sub(k.R.vor.clone().multiplyScalar(0.1)); epol[s] = V(0, -1, -0.6); }
        else if (last === 'kurzhanteln') { hand[s] = k.schulter[s].clone().add(V(sg * 0.07, -ARM * 0.9995, 0)); epol[s] = V(sg * 0.3, 0, -1); }
        else if (o.kosaken) { hand[s] = k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.3)).sub(k.R.oben.clone().multiplyScalar(0.16)).add(k.R.links.clone().multiplyScalar(sg * 0.04)); epol[s] = V(sg, -0.6, -0.3); }
        else { hand[s] = becken.clone().add(V(sg * 0.17, 0.02, 0.06)); epol[s] = V(sg, -0.2, -0.6); }
      }
      return {
        pose: { becken, rumpf: r, hand, ellbogenPol: epol, fuss, zehen, fussRicht, kniePol: seiten((s, sg) => (s === 'r' && art !== 'seitlich' && art !== 'stepup' && art !== 'stepup_seitlich' ? V(-0.1, -1, 0.3) : V(sg * 0.1, 0, 1))) },   // hinteres Knie zeigt zum Boden
        props(g, z) { if (z.lh) { stangeAn(z.lh, g); schienenAn(z); } if (last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer'); }
      };
    },
    blick: V(0, 0.7, 0), abstand: 3.6, kameraRicht: art === 'seitlich' ? V(0.3, 0.3, 1) : V(1, 0.3, 0.35)
  };
}

const HT_P = V(0, 0.32, 1.06);   // Hip-Thrust-Maschine: Drehpunkt der Hebel vorn
// Hüftheben: art: hipthrust | bridge | einbeinig | einbeinig_bank ; last: langhantel | keine | maschine | multipresse
// Neu: frog (Fußsohlen zusammen, Knie außen) | marsch (Becken oben, Knie abwechselnd heben)
export function hueftheben(o = {}) {
  const art = o.art || 'hipthrust', last = o.last || (art === 'hipthrust' ? 'langhantel' : 'keine');
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'hipthrust' || art === 'einbeinig_bank') ger.querbank(-0.4, 0.43);
      else ger.matte();
      if (last === 'langhantel' || last === 'multipresse') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'maschine') hipthrustMaschineBauen(ger, z, HT_P, V(0, 0.3 + 0.15, 0.2));   // Hüftpolster an zwei Hebeln, Drehpunkt vorn am Boden
      return z;
    },
    pose(t) {
      const bank = art === 'hipthrust' || art === 'einbeinig_bank';
      // Schulterblätter liegen auf der Bank bzw. dem Boden, Füße stehen; das Becken hebt sich
      const schulterPunkt = bank ? V(0, 0.5, -0.32) : V(0, 0.13, -0.3);
      const marsch = art === 'marsch', frog = art === 'frog';
      const beckenY = marsch ? 0.36 : frog ? mix(0.12, 0.25, t) : mix(bank ? 0.3 : 0.12, bank ? 0.545 : 0.36, t);   // oben Hüfte gestreckt, nicht überstreckt
      const beckenZ = bank ? 0.18 : 0.18;
      const becken = V(0, beckenY, beckenZ);
      // Rumpf zeigt von Becken zur Schulter
      const d = schulterPunkt.clone().sub(becken).normalize();
      const winkel = Math.atan2(d.y, -d.z) / RAD;        // 0 = waagerecht
      const r = { neigung: 0, basis: quer(-90 + winkel) };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'maschine') {   // Hände an den Griffen neben dem Hüftpolster (Griffe laufen auf dem Bogen der Hebel)
          const pol = becken.clone().add(V(0, 0.15, 0.02)), w = hebelWinkel(HT_P, pol), L = V(0, 0.45, 0.2).distanceTo(HT_P);
          hand[s] = HT_P.clone().add(V(sg * 0.36, -0.02, -L).applyAxisAngle(V(1, 0, 0), w)); epol[s] = V(sg, 0.5, 0);
        } else if (last === 'langhantel' || last === 'multipresse') { hand[s] = becken.clone().add(V(sg * 0.32, 0.13, 0.02)); epol[s] = V(sg, 0.5, 0); }
        else { hand[s] = bank ? k.schulter[s].clone().add(V(sg * 0.35, -0.02, 0.05)) : k.schulter[s].clone().add(V(sg * 0.12, -0.05, 0.45)); epol[s] = V(sg, 1, 0); }
      }
      const einbeinig = art === 'einbeinig' || art === 'einbeinig_bank';
      const fz = bank ? 0.62 : 0.69;   // oben Schienbein senkrecht, Knie etwa 90°
      let fuss = { l: V(0.14, FY, fz), r: einbeinig ? becken.clone().add(V(-0.14, 0.15, 0.75)) : V(-0.14, FY, fz) };
      let kpol = { l: V(0.1, 1, 0.3), r: V(-0.1, 1, 0.3) }, fussRicht;
      if (frog) {   // Fußsohlen aneinander nah am Becken, Knie fallen nach außen
        fuss = { l: V(0.05, 0.1, 0.5), r: V(-0.05, 0.1, 0.5) };
        kpol = { l: V(1, 0.5, 0), r: V(-1, 0.5, 0) }; fussRicht = { l: V(-0.5, 0.3, 0.8), r: V(0.5, 0.3, 0.8) };
      }
      if (marsch) {   // ein Knie nach dem anderen zur Brust, Becken bleibt oben
        const w = Math.sin(t * Math.PI * 2);
        const heb = { l: Math.max(0, w), r: Math.max(0, -w) };
        fuss = seiten((s, sg) => V(sg * 0.14, FY + heb[s] * 0.3, 0.62 - heb[s] * 0.2));
      }
      return {
        pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand, handflaeche: last === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, ellbogenPol: epol, fuss, fussRicht, kniePol: kpol },
        props(g, z) {
          if (z.lh) { z.lh.position.copy(g.becken).add(V(0, 0.16, 0.02)); z.lh.quaternion.identity(); schienenAn(z); }
          if (z.ht) z.ht.hebel.rotation.x = hebelWinkel(HT_P, g.becken.clone().add(V(0, 0.15, 0.02)));
        }
      };
    },
    blick: V(0, 0.4, 0.1), abstand: 3.2, kameraRicht: art === 'frog' ? V(0.5, 0.6, 1) : V(1, 0.45, 0.25), dauer: art === 'marsch' ? [1.4, 0, 1.4, 0] : undefined
  };
}

// Wadenheben: art: stehend | sitzend | einbeinig | stufe | beinpresse | maschine (Schulterpolster) ; last: kurzhanteln
// Neu: esel (Hüfte gebeugt, Polster auf dem Becken) ; last multipresse (Stange auf dem Rücken) ; sitzend + last kurzhantel (Hanteln auf den Knien, Bank)
export function wadenheben(o = {}) {
  const art = o.art || 'stehend';
  const sitzend = art === 'sitzend', khKnie = sitzend && o.last === 'kurzhantel';
  // Sitzend an der Maschine: Kniepolster liegt auf den Oberschenkeln kurz vor den Knien (Knie aus Hüfte und Knöchel gerechnet)
  const WS_BECKEN = V(0, 0.55, -0.12), WS_RUMPF = { neigung: 5 }, WS_P = V(0, 0.3, 0.86);
  const wsHub = (t) => Math.sin(Math.max(mix(0, 38, t), -20) * RAD) * MASS.fussLaenge * BALLEN;
  const wsKnie = (t) => { const R = rumpfRahmen(WS_RUMPF), h = WS_BECKEN.clone().add(R.links.clone().multiplyScalar(MASS.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02)); return ik(h, V(0.13, FY + wsHub(t), 0.36), MASS.oberschenkel, MASS.unterschenkel, V(0, 1, 1)).mitte; };
  const wsPolster = (t) => { const kn = wsKnie(t); return V(0, kn.y + 0.1, kn.z - 0.07); };
  // Esel: Hüftpolster auf dem Becken an einem Hebel (Drehpunkt hinten oben)
  const ES_P = V(0, 1.3, -0.6), esPolster = (anheben) => V(0, 0.975 + 0.12 + anheben + 0.15, -0.04);
  return {
    aufbau(ger) {
      const z = {};
      if (sitzend && !khKnie) wadensitzBauen(ger, z, WS_BECKEN, WS_P, wsPolster(0));
      else if (sitzend) ger.box(0.45, 0.45, 0.4, V(0, 0.225, -0.1), ger.mPolster);
      if (khKnie) { ger.box(0.5, 0.08, 0.2, V(0, 0.04, 0.36), ger.mRahmen); khAufbauen(ger, z); }
      if (art === 'stufe' || art === 'einbeinig') ger.box(0.6, 0.12, 0.25, V(0, 0.06, 0.1), ger.mRahmen);
      if (o.last === 'multipresse') { z.lh = ger.langhantel(); schienenAufbauen(ger, z); }
      if (art === 'esel') eselBauen(ger, z, ES_P, esPolster(0));
      if (art === 'maschine') wadenmaschineBauen(ger, z, rumpf(V(0, 0.985 + 0.12, 0.02), { neigung: 2 }));
      if (art === 'beinpresse') {
        Object.assign(z, beinmaschine({ art: 'beinpresse' }).aufbau(ger));
      }
      if (o.last === 'kurzhanteln') khAufbauen(ger, z, art !== 'einbeinig');
      return z;
    },
    pose(t) {
      if (art === 'beinpresse') {
        // Beine fast gestreckt (Knie ~8° gebeugt), nur die Fußballen an der Unterkante der Platte, Fersen frei: das Sprunggelenk arbeitet
        // und schiebt die Platte. Abstand Knöchel → Platte über den Fußballen: 0,14·sin(Winkel) + 0,07·cos(Winkel)
        const bp = beinmaschine({ art: 'beinpresse' }).pose(0);
        const w = mix(-15, 28, t), D = bpWeg(8);
        bp.pose.fuss = seiten((s, sg) => bpHuefte(sg).add(V(sg * 0.06, 0, 0)).add(BP_BEIN.clone().multiplyScalar(D)));
        bp.pose.zehen = seiten(() => w);
        const ballen = (wg) => 0.14 * Math.sin(wg * RAD) + 0.07 * Math.cos(wg * RAD);
        bp.props = (g, z) => {
          const knoechel = g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5);
          // Platte: Fläche um ballen(w) hinter dem Knöchel, Fußballen an der Unterkante
          z.schlitten.position.copy(knoechel).add(BP_SCHIENE.clone().multiplyScalar(ballen(w) + 0.012)).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.14 + 0.28));   // Ballen 14 cm über dem Knöchel, Unterkante 3 cm darunter
        };
        return bp;
      }
      const stufe = art === 'stufe' || art === 'einbeinig' || art === 'maschine' ? 0.12 : 0;
      const hub = mix(stufe ? -15 : 0, 38, t);
      const anheben = Math.sin(Math.max(hub, -20) * RAD) * MASS.fussLaenge * BALLEN;
      const fuss = { l: V(0.12, FY + stufe + anheben, 0.0), r: art === 'einbeinig' ? V(-0.12, 0.3, -0.25) : V(-0.12, FY + stufe + anheben, 0) };
      const zehen = { l: hub, r: art === 'einbeinig' ? 10 : hub };
      if (sitzend) {
        const becken = V(0, 0.55, -0.12);
        const r = { neigung: khKnie ? 12 : 5 };
        const k = rumpf(becken, r);
        const sh = khKnie ? 0.08 : 0, hubS = khKnie ? mix(-15, 38, t) : hub, anhebenS = Math.sin(Math.max(hubS, -20) * RAD) * MASS.fussLaenge * BALLEN;
        return { pose: { becken, rumpf: r, fuss: { l: V(0.13, FY + sh + anhebenS, 0.36), r: V(-0.13, FY + sh + anhebenS, 0.36) }, zehen: { l: hubS, r: hubS },
          hand: khKnie ? seiten((s, sg) => V(sg * 0.15, 0.66 + anhebenS, 0.25)) : seiten((s, sg) => {
            const pol = wsPolster(t), w = hebelWinkel(WS_P, pol), L = pol.distanceTo(WS_P);
            return WS_P.clone().add(V(sg * 0.31, 0.03, -L).applyAxisAngle(V(1, 0, 0), w));
          }),
          handflaeche: khKnie ? undefined : seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)), kniePol: seiten((s, sg) => V(0, 1, 1)) },
          props(g, z) {
            if (khKnie) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.knie[s].clone().lerp(g.huefte[s], 0.12).add(V(0, 0.075, 0)), V(1, 0, 0));
            if (z.ws) { z.ws.hebel.rotation.x = hebelWinkel(WS_P, wsPolster(t)); }
          } };
      }
      if (art === 'esel') {
        // Oberkörper waagerecht, Hände an den Griffen, Polster drückt auf das Becken
        const becken = V(0, 0.975 + 0.12 + anheben, 0.0);
        const r = { neigung: 84 };
        return { pose: { becken, rumpf: r, kopf: { neigung: -25 }, hand: seiten((s, sg) => V(sg * 0.22, 0.97, 0.84)), ellbogenPol: seiten((s, sg) => V(sg, -0.5, 0)),
            fuss: seiten((s, sg) => V(sg * 0.12, FY + 0.12 + anheben, 0.02)), zehen: seiten(() => hub), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
          props(g, z) { z.es.hebel.rotation.x = hebelWinkel(ES_P, esPolster(anheben), 1); } };
      }
      const becken = V(0, 0.985 + stufe + anheben, 0.02);   // Knie gestreckt
      const r = { neigung: 2 };
      const k = rumpf(becken, r);
      const hand = seiten((s, sg) => o.last === 'multipresse' ? k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.42)).sub(k.R.vor.clone().multiplyScalar(0.1)).add(k.R.oben.clone().multiplyScalar(0.02))
        : art === 'maschine' ? k.schulter[s].clone().add(V(sg * 0.1, 0.1, 0.1)) : o.last === 'kurzhanteln' ? k.schulter[s].clone().add(V(sg * 0.06, -ARM * 0.9995, 0)) : k.schulter[s].clone().add(V(sg * 0.12, -ARM * 0.9, 0.12)));
      return { pose: { becken, rumpf: r, hand, handflaeche: art === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, ellbogenPol: art === 'maschine' ? seiten((s, sg) => V(sg, -1, 0)) : o.last === 'multipresse' ? seiten(() => V(0, -1, -0.6)) : undefined, fuss, zehen, kniePol: seiten((s, sg) => V(sg * 0.1, s === 'r' && art === 'einbeinig' ? -1 : 0, 1)) },
        props(g, z) {
          if (o.last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.wk) { const y = g.schulter.l.y; z.wk.sl.position.set(0, y, 0); seil(z.wk.kabel, V(0, y + 0.155, z.wk.zb), V(0, 2.03, -0.32)); z.block.heben(anheben * 1.2); }
        } };
    },
    blick: V(0, 0.55, 0), abstand: 2.9, kameraRicht: V(1, 0.25, 0.5)
  };
}

/* ---------- Maschinen-Baukasten ---------- */
// Alle Maschinen im selben Look wie im Studio: Rahmen aus Vierkantrohr (Grafit), Lederpolster, Chromstangen, Gummigriffe,
// Gewichtsblock in einer Verkleidung mit Farbstreifen. Bewegte Teile hängen an Gruppen (Hebel, Schlitten), die die Vorlage je Bild dreht.
function maschTeil(gruppe, geo, m, x = 0, y = 0, zz = 0) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); o.castShadow = true; o.receiveShadow = true; gruppe.add(o); return o; }
// Gewichtsblock mit Verkleidung: pos = Fußpunkt, vorn = offene Seite (zum Trainierenden hin). heben(m): ausgewählte Platten (ab dem Stift) gehen hoch
function gewichtsblock(ger, pos, vorn = V(0, 0, 1), hoehe = 1.9) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = Math.atan2(vorn.x, vorn.z);
  maschTeil(g, rundGeo(0.42, hoehe, 0.04, 0.01, 1), ger.mRahmen, 0, hoehe / 2, -0.14);
  for (const sx of [-1, 1]) {
    maschTeil(g, rundGeo(0.04, hoehe, 0.3, 0.01, 1), ger.mRahmen, sx * 0.21, hoehe / 2, 0);
    maschTeil(g, rundGeo(0.012, hoehe * 0.78, 0.02, 0.004, 1), ger.mAkzent, sx * 0.232, hoehe * 0.5, 0.12);
    maschTeil(g, new THREE.CylinderGeometry(0.01, 0.01, hoehe - 0.12, 12), ger.mMetall, sx * 0.085, hoehe / 2, 0);
  }
  maschTeil(g, rundGeo(0.47, 0.06, 0.33, 0.012, 1), ger.mRahmen, 0, hoehe + 0.03, 0);
  maschTeil(g, rundGeo(0.47, 0.05, 0.34, 0.01, 1), ger.mRahmen, 0, 0.025, 0);
  const platten = new THREE.Group(); g.add(platten);
  const N = 14, STIFT = 9, y0 = 0.075;
  for (let i = 0; i < N; i++) maschTeil(platten, rundGeo(0.3, 0.044, 0.16, 0.005, 1), i === N - 1 ? ger.mMetall : ger.mScheibe, 0, y0 + i * 0.047, 0);
  const stift = maschTeil(platten, new THREE.CylinderGeometry(0.007, 0.007, 0.12, 10), ger.mMetall, 0.04, y0 + (STIFT - 1) * 0.047, 0.1); stift.rotation.x = Math.PI / 2;
  maschTeil(platten, new THREE.SphereGeometry(0.016, 12, 8), ger.mAkzent, 0.04, y0 + (STIFT - 1) * 0.047, 0.165);
  ger.gruppe.add(g);
  return { g, heben(m) { platten.children.forEach((p, i) => { const k = i < N ? i : STIFT - 1; p.position.y = y0 + k * 0.047 + (k >= STIFT - 1 ? Math.max(0, m) : 0); }); } };
}
// Schaumstoffrolle (Beinstrecker, Beinbeuger, Rückenstrecker): Achse X, mit Chromkappen
function rollePolster(ger, laenge = 0.34, r = 0.048, gruppe = ger.gruppe) {
  const g = new THREE.Group();
  maschTeil(g, new THREE.CylinderGeometry(r, r, laenge, 24), ger.mPolster).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) maschTeil(g, new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.012, 18), ger.mMetall, sx * (laenge / 2 + 0.006)).rotation.z = Math.PI / 2;
  gruppe.add(g); return g;
}
// Drehpunkt eines Hebels: Lagergehäuse (Achse = achse, Standard X) mit Chromkappen
function drehlager(ger, pos, achse = V(1, 0, 0), laenge = 0.12) {
  const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(V(0, 1, 0), achse.clone().normalize());
  maschTeil(g, new THREE.CylinderGeometry(0.05, 0.05, laenge, 24), ger.mRahmen);
  for (const s of [-1, 1]) maschTeil(g, new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), ger.mMetall, 0, s * (laenge / 2 + 0.005));
  ger.gruppe.add(g); return g;
}
// Griff aus Chromrohr mit Gummistück in der Mitte (zwischen A und B), in einer Gruppe oder frei
function griffRohr(ger, A, B, gruppe = ger.gruppe, anteil = 0.62) {
  const rohr = maschTeil(gruppe, new THREE.CylinderGeometry(0.014, 0.014, 1, 14), ger.mMetall); seil(rohr, A, B);
  const m = A.clone().lerp(B, 0.5), d = B.clone().sub(A).multiplyScalar(anteil / 2);
  const gummi = maschTeil(gruppe, new THREE.CylinderGeometry(0.019, 0.019, 1, 14), ger.mGummi); seil(gummi, m.clone().sub(d), m.clone().add(d));
  return rohr;
}
// Vierkantrohr in einer Gruppe zwischen zwei Punkten (in deren Koordinaten)
function legeLaengs(o, A, B) { const d = B.clone().sub(A); o.position.copy(A).add(B).multiplyScalar(0.5); o.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return o; }
function rohrIn(ger, gruppe, A, B, b = 0.06) { return legeLaengs(maschTeil(gruppe, rundGeo(b, A.distanceTo(B), b, Math.min(0.008, b * 0.3), 1), ger.mRahmen), A, B); }
// Sitz auf einer Säule mit Rastbolzen; mitte = Mitte der Sitzfläche (Oberkante), neigung in Grad (vorn höher = positiv)
function sitzSaeule(ger, mitte, w = 0.42, l = 0.42, neigung = 0) {
  ger.polster(w, 0.09, l, mitte.clone().sub(V(0, 0.045, 0)), quer(-neigung));
  ger.vierkant(V(mitte.x, 0.05, mitte.z), V(mitte.x, mitte.y - 0.09, mitte.z), 0.08);
  maschTeil(ger.gruppe, new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10), ger.mMetall, mitte.x + 0.07, mitte.y - 0.25, mitte.z).rotation.z = Math.PI / 2;
  maschTeil(ger.gruppe, new THREE.SphereGeometry(0.022, 14, 10), ger.mAkzent, mitte.x + 0.11, mitte.y - 0.25, mitte.z);
}
// Bodenrahmen (Rechteck aus Vierkantrohr)
function bodenrahmen(ger, x0, x1, z0, z1) {
  for (const x of [x0, x1]) ger.vierkant(V(x, 0.035, z0), V(x, 0.035, z1), 0.07);
  for (const zz of [z0, z1]) ger.vierkant(V(x0, 0.035, zz), V(x1, 0.035, zz), 0.07);
}
// Hebel-Bahn: Ein Griff an einem Hebelarm läuft auf einem Kreisbogen um die Drehachse (Achse X). Mittelpunkt in der y-z-Ebene so,
// dass Start h0 und Ende h1 gleich weit weg liegen, mit fester Höhe (y) oder fester Tiefe (z) der Achse
function bogenMitte(h0, h1, fest) {
  const m = h0.clone().add(h1).multiplyScalar(0.5), dy = h1.y - h0.y, dz = h1.z - h0.z, ny = dz, nz = -dy;
  const k = fest.y != null ? (fest.y - m.y) / (Math.abs(ny) > 1e-6 ? ny : 1e-6) : (fest.z - m.z) / (Math.abs(nz) > 1e-6 ? nz : 1e-6);
  return V(0, m.y + k * ny, m.z + k * nz);
}
function bogenHand(h0, h1, C, t) {
  const a0 = Math.atan2(h0.y - C.y, h0.z - C.z), a1 = Math.atan2(h1.y - C.y, h1.z - C.z), r = Math.hypot(h0.y - C.y, h0.z - C.z);
  let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
  const a = a0 + da * t;
  return V(mix(h0.x, h1.x, t), C.y + Math.sin(a) * r, C.z + Math.cos(a) * r);
}
// Drückmaschine (Brustpresse, Schulterpresse): Sitz, Rückenpolster (r = Rumpf), zwei getrennte Hebelarme außen (Drehachse C, Achse X),
// Querrohr nach innen zum Griff; griff 'senkrecht' (Neutralgriff Brustpresse) oder 'laengs' (Neutralgriff über Kopf); Gewichtsblock hinten
const DM_X = 0.43;
function drueckmaschineBauen(ger, z, becken, r, C, griff) {
  const R = rumpfRahmen(r);
  bodenrahmen(ger, -0.45, 0.45, -0.85, 0.35);
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.44, 0.44);
  ger.polster(0.42, 0.66, 0.09, becken.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
  ger.vierkant(V(0, 0.05, becken.z - 0.42), becken.clone().add(R.oben.clone().multiplyScalar(0.34)).sub(R.vor.clone().multiplyScalar(0.23)), 0.07);
  for (const sx of [-1, 1]) {
    const s = sx > 0 ? 'l' : 'r', P = V(sx * DM_X, C.y, C.z);
    ger.vierkant(V(sx * DM_X, 0.05, C.z), P.clone().sub(V(0, 0.06, 0)), 0.08);
    drehlager(ger, P, V(1, 0, 0), 0.13);
    z['dmArm_' + s] = ger.stab(V(), V(0, 1, 0), 0.03, ger.mRahmen);
    z['dmQuer_' + s] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
    const g = new THREE.Group(); ger.gruppe.add(g);
    griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75);
    z['dmGriff_' + s] = g;
  }
  ger.vierkant(V(-DM_X, C.y, C.z), V(DM_X, C.y, C.z), 0.06);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.12, 0.25, becken.z + 0.62), V(sx * 0.12, 0.05, becken.z + 0.62), 0.05);
  ger.stab(V(-0.2, 0.25, becken.z + 0.62), V(0.2, 0.25, becken.z + 0.62), 0.016, ger.mMetall);   // Fußstütze
  z.block = gewichtsblock(ger, V(0, 0, becken.z - 0.78), V(0, 0, 1));
  z.dm = { C, griff };
}
// Arme und Griffe an die Hände setzen; hub = Anteil der Bewegung (0…1) für den Gewichtsblock
function drueckmaschineStellen(z, g, hub) {
  const { C, griff } = z.dm, X = z.dm.x || DM_X;
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const h = g.hand[s], A = V(sg * X, h.y, h.z), P = V(sg * X, C.y, C.z);
    seil(z['dmArm_' + s], P, A);
    // Querrohr vom Hebelarm bis zum Griff (Griff quer: bis zu seinem äußeren Ende)
    seil(z['dmQuer_' + s], A, h.clone().add(V(sg * (griff === 'quer' ? 0.075 : 0.03), griff === 'senkrecht' ? 0.075 : 0, 0)));
    const gr = z['dmGriff_' + s]; gr.position.copy(h);
    gr.quaternion.setFromUnitVectors(V(0, 1, 0), griff === 'senkrecht' ? V(0, 1, 0) : griff === 'quer' ? V(1, 0, 0) : V(0, 0, 1));
  }
  z.block.heben(0.3 * hub);
}
// Bizepsmaschine / Trizepsstrecker: Sitz, schräges Armpolster unter den Oberarmen, Hebel mit Kurvenscheiben dreht um die
// Ellbogenachse C (Achse X); Bizeps: Stange im Untergriff am Hebelende, Trizeps: zwei senkrechte Griffe (Handflächen zueinander).
// Gewichtsblock vorn, Kabel zur Kurvenscheibe
function armmaschineBauen(ger, z, becken, C, trizeps) {
  bodenrahmen(ger, -0.36, 0.36, -0.42, C.z + 1.0);
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.42, 0.4);
  const S = C.z + 0.22, oben = C.y - 0.13;
  ger.vierkant(V(0, 0.05, S), V(0, oben, S), 0.08);
  ger.vierkant(V(-0.37, oben, S), V(0.37, oben, S), 0.07);
  for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.37, oben, S), V(sx * 0.37, C.y, C.z), 0.06); drehlager(ger, V(sx * 0.37, C.y, C.z), V(1, 0, 0), 0.09); }
  ger.vierkant(V(0, 0.05, S), V(0, 0.05, C.z + 0.95), 0.07);
  z.pult = ger.polster(0.5, 0.07, 0.34, V());
  // Hebel: lokal zeigt er nach +z (Länge = Unterarm bis Faustmitte), dreht um X durch C
  const L = UNTERARM, h = new THREE.Group(); h.position.copy(C); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    maschTeil(h, new THREE.CylinderGeometry(0.1, 0.1, 0.022, 32), ger.mRahmen, sx * 0.3).rotation.z = Math.PI / 2;      // Kurvenscheibe
    maschTeil(h, new THREE.CylinderGeometry(0.03, 0.03, 0.026, 18), ger.mMetall, sx * 0.3).rotation.z = Math.PI / 2;
    rohrIn(ger, h, V(sx * 0.3, 0, 0.02), V(sx * 0.3, 0, L + 0.03), 0.045);
    if (trizeps) {
      griffRohr(ger, V(sx * 0.18, -0.075, L), V(sx * 0.18, 0.075, L), h, 0.75);
      rohrIn(ger, h, V(sx * 0.3, -0.085, L), V(sx * 0.18, -0.085, L), 0.032);
      rohrIn(ger, h, V(sx * 0.3, -0.085, L), V(sx * 0.3, 0, L), 0.032);
    }
  }
  if (!trizeps) griffRohr(ger, V(-0.3, 0, L), V(0.3, 0, L), h, 0.62);
  // Gewichtsblock rechts neben der Maschine (offene Seite zum Sitz), Kabel von der rechten Kurvenscheibe über eine Rolle oben
  z.block = gewichtsblock(ger, V(-0.78, 0, C.z - 0.05), V(1, 0, 0), 1.55);
  const rolle = V(-0.78, 1.66, C.z - 0.05);
  ger.vierkant(V(-0.37, oben, S), V(-0.6, oben, S), 0.05);
  ger.stab(V(-0.3, C.y + 0.1, C.z), V(-0.5, C.y + 0.1, C.z), 0.006, ger.mKabel);
  ger.stab(V(-0.5, C.y + 0.1, C.z), rolle, 0.006, ger.mKabel);
  z.am = { C, hebel: h };
}
function armmaschineStellen(z, g, hub) {
  const { C } = z.am, m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
  z.am.hebel.rotation.x = Math.atan2(-(m.y - C.y), m.z - C.z);
  const sch = g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5), ell = g.ellbogen.l.clone().add(g.ellbogen.r).multiplyScalar(0.5);
  const d = ell.clone().sub(sch).normalize(), n = V(0, -d.z, d.y).normalize();
  z.pult.position.copy(sch.lerp(ell, 0.6)).add(n.multiplyScalar(0.08)); z.pult.quaternion.setFromUnitVectors(V(0, 0, 1), d);
  z.block.heben(0.25 * hub);
}
// Bauchmaschine / Rückenstrecker-Maschine im Sitzen: Der Oberkörper dreht um die Hüfte, also dreht der Hebel um die Hüftachse
// (Lager außen neben dem Becken) und folgt dem Rumpf. Bauch: Brustpolster und Griffe neben dem Kopf, Rolle vor den Schienbeinen;
// Rücken: Rückenpolster unter den Schulterblättern, Gurtpolster über den Oberschenkeln, Fußplatte. Gewichtsblock rechts hinten
function rumpfmaschineBauen(ger, z, becken, bauch) {
  const k0 = rumpf(becken, { neigung: 0 }), lok = (p) => p.clone().sub(becken);   // aufrecht: Rumpf-Lage = Welt-Lage
  bodenrahmen(ger, -0.4, 0.4, becken.z - 0.5, becken.z + 0.62);
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.04), 0.42, 0.44);
  for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.37, 0.05, becken.z), V(sx * 0.37, becken.y - 0.06, becken.z), 0.07); drehlager(ger, V(sx * 0.37, becken.y, becken.z), V(1, 0, 0), 0.08); }
  const h = new THREE.Group(); h.position.copy(becken); ger.gruppe.add(h);
  const brust = lok(k0.brust), sch = { l: lok(k0.schulter.l), r: lok(k0.schulter.r) };
  maschTeil(h, new THREE.CylinderGeometry(0.09, 0.09, 0.022, 32), ger.mRahmen, -0.33).rotation.z = Math.PI / 2;   // Kurvenscheibe rechts
  if (bauch) {
    const pad = brust.clone().add(V(0, -0.06, 0.16)), hy = sch.l.y + 0.08, hz = sch.l.z + 0.12;
    for (const sx of [-1, 1]) {
      const s = sx > 0 ? 'l' : 'r', gx = sch[s].x - sx * 0.04;
      rohrIn(ger, h, V(sx * 0.4, 0, 0), V(sx * 0.4, hy, 0.02), 0.05);
      rohrIn(ger, h, V(sx * 0.4, hy, 0.02), V(sx * 0.4, hy, hz + 0.09), 0.045);
      rohrIn(ger, h, V(sx * 0.4, hy, hz + 0.09), V(gx, hy, hz + 0.09), 0.035);
      griffRohr(ger, V(gx, hy, hz - 0.075), V(gx, hy, hz + 0.09), h, 0.7);
    }
    // Brustpolster vor dem Brustbein, an einem Querrohr zwischen den Armen
    rohrIn(ger, h, V(-0.4, pad.y, pad.z + 0.06), V(0.4, pad.y, pad.z + 0.06), 0.045);
    for (const sx of [-1, 1]) rohrIn(ger, h, V(sx * 0.4, pad.y, 0.02), V(sx * 0.4, pad.y, pad.z + 0.06), 0.04);
    maschTeil(h, rundGeo(0.36, 0.2, 0.08, 0.03, 3), ger.mPolster, 0, pad.y, pad.z);
    // Rolle vor den Schienbeinen (Füße eingehakt)
    ger.vierkant(V(0, 0.05, becken.z + 0.6), V(0, 0.2, becken.z + 0.6), 0.06);
    ger.vierkant(V(-0.2, 0.2, becken.z + 0.6), V(0.2, 0.2, becken.z + 0.6), 0.05);
    rollePolster(ger, 0.36, 0.05).position.set(0, 0.2, becken.z + 0.53);
  } else {
    const pad = brust.clone().add(V(0, -0.12, -0.17));
    for (const sx of [-1, 1]) {
      rohrIn(ger, h, V(sx * 0.33, 0, 0), V(sx * 0.33, pad.y, -0.05), 0.05);
      rohrIn(ger, h, V(sx * 0.33, pad.y, -0.05), V(sx * 0.33, pad.y, pad.z - 0.06), 0.045);
    }
    rohrIn(ger, h, V(-0.33, pad.y, pad.z - 0.06), V(0.33, pad.y, pad.z - 0.06), 0.045);
    maschTeil(h, rundGeo(0.4, 0.26, 0.08, 0.03, 3), ger.mPolster, 0, pad.y, pad.z);
    // Gurtpolster über den Oberschenkeln, Fußplatte
    const knie = V(0, becken.y + 0.06, becken.z + 0.26);
    for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.3, becken.y - 0.06, becken.z), V(sx * 0.3, knie.y + 0.1, knie.z), 0.05);
    ger.vierkant(V(-0.3, knie.y + 0.1, knie.z), V(0.3, knie.y + 0.1, knie.z), 0.05);
    ger.box(0.46, 0.07, 0.14, knie.clone().add(V(0, 0.04, 0)), ger.mPolster);
    for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.2, 0.035, becken.z + 0.5), V(sx * 0.2, 0.05, becken.z + 0.5), 0.05);
    ger.box(0.52, 0.03, 0.3, V(0, 0.065, becken.z + 0.5), ger.mGummi);   // Fußplatte (Oberkante 0,08)
  }
  z.block = gewichtsblock(ger, V(-0.72, 0, becken.z - 0.2), V(1, 0, 0), 1.55);
  ger.vierkant(V(-0.37, 0.4, becken.z), V(-0.56, 0.4, becken.z - 0.2), 0.05);
  ger.stab(V(-0.33, becken.y + 0.09, becken.z), V(-0.5, becken.y + 0.09, becken.z), 0.006, ger.mKabel);
  ger.stab(V(-0.5, becken.y + 0.09, becken.z), V(-0.72, 1.66, becken.z - 0.2), 0.006, ger.mKabel);
  z.rm = { hebel: h };
}
// Hebel, der um eine Achse X durch P dreht und lokal nach richt (±z) zeigt: Winkel, mit dem sein Ende auf ziel (y-z) zeigt
function hebelWinkel(P, ziel, richt = -1) { const dy = ziel.y - P.y, dz = ziel.z - P.z; return richt < 0 ? Math.atan2(dy, -dz) : Math.atan2(-dy, dz); }
// Scheibenhorn mit Hantelscheiben (Achse X) in einer Hebelgruppe
function scheibenHorn(ger, gruppe, pos, sx, n = 2, r = 0.2) {
  maschTeil(gruppe, new THREE.CylinderGeometry(0.025, 0.025, 0.07 + n * 0.045, 16), ger.mMetall, pos.x + sx * (0.035 + n * 0.0225), pos.y, pos.z).rotation.z = Math.PI / 2;
  for (let i = 0; i < n; i++) maschTeil(gruppe, scheibenGeo(r, 0.04), ger.mScheibe, pos.x + sx * (0.05 + i * 0.045), pos.y, pos.z).rotation.z = Math.PI / 2;
}
// Wadenmaschine stehend: Stufe, zwei Säulen hinten mit Führungen, Schlitten mit Schulterpolstern und Griffen (fährt mit den Schultern),
// Gewichtsblock dahinter, Kabel über eine Rolle oben. k0 = Rumpf zu Beginn (Schultern)
function wadenmaschineBauen(ger, z, k0) {
  bodenrahmen(ger, -0.46, 0.46, -0.86, 0.3);
  ger.box(0.62, 0.1, 0.26, V(0, 0.05, 0.1), ger.mRahmen); ger.box(0.6, 0.02, 0.24, V(0, 0.11, 0.1), ger.mGummi);   // Stufe, Oberkante 0,12
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.42, 0.05, -0.32), V(sx * 0.42, 2.08, -0.32), 0.08);
    ger.stab(V(sx * 0.42, 0.35, -0.25), V(sx * 0.42, 1.98, -0.25), 0.013, ger.mMetall);
    for (const y of [0.35, 1.98]) ger.vierkant(V(sx * 0.42, y, -0.33), V(sx * 0.42, y, -0.24), 0.035);
  }
  ger.vierkant(V(-0.46, 2.08, -0.32), V(0.46, 2.08, -0.32), 0.08);
  const sl = new THREE.Group(); ger.gruppe.add(sl);
  const zb = k0.schulter.l.z - 0.14, y0 = k0.schulter.l.y;
  rohrIn(ger, sl, V(-0.42, 0.155, zb), V(0.42, 0.155, zb), 0.06);
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const sch = k0.schulter[s], px = sch.x + sx * 0.02, hx = sch.x + sx * 0.1;
    maschTeil(sl, rundGeo(0.07, 0.17, 0.08, 0.01, 1), ger.mRahmen, sx * 0.42, 0.155, -0.25);
    rohrIn(ger, sl, V(sx * 0.42, 0.155, -0.25), V(sx * 0.42, 0.155, zb), 0.05);
    rohrIn(ger, sl, V(px, 0.155, zb), V(px, 0.155, sch.z + 0.08), 0.045);
    maschTeil(sl, rundGeo(0.15, 0.07, 0.22, 0.03, 3), ger.mPolster, px, 0.1, sch.z);                 // Schulterpolster
    griffRohr(ger, V(hx, 0.1, sch.z + 0.03), V(hx, 0.1, sch.z + 0.17), sl, 0.7);                      // Griff längs
    rohrIn(ger, sl, V(px, 0.155, sch.z + 0.08), V(hx, 0.1, sch.z + 0.03), 0.03);
  }
  z.block = gewichtsblock(ger, V(0, 0, -0.68), V(0, 0, 1), 1.85);
  ger.stab(V(0, 2.03, -0.32), V(0, 1.9, -0.68), 0.006, ger.mKabel);
  maschTeil(ger.gruppe, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), ger.mMetall, 0, 2.03, -0.32).rotation.z = Math.PI / 2;
  z.wk = { sl, y0, zb, kabel: ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel) };
}
// Wadenmaschine sitzend: Sitz, Fußplatte, Hebel mit Drehpunkt vorn unten, Kniepolster auf den Oberschenkeln, Griffe, Scheibenhorn
function wadensitzBauen(ger, z, becken, P, polster0) {
  bodenrahmen(ger, -0.36, 0.36, becken.z - 0.36, P.z + 0.12);
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.42, 0.4);
  ger.box(0.5, 0.025, 0.22, V(0, 0.0125, 0.44), ger.mGummi);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.33, 0.05, P.z), V(sx * 0.33, P.y, P.z), 0.07);
  drehlager(ger, P, V(1, 0, 0), 0.72);
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    rohrIn(ger, h, V(sx * 0.27, 0, 0), V(sx * 0.27, 0, -L - 0.04), 0.05);
    griffRohr(ger, V(sx * 0.31, 0.03, -L - 0.08), V(sx * 0.31, 0.03, -L + 0.08), h, 0.7);
    rohrIn(ger, h, V(sx * 0.27, 0.03, -L + 0.08), V(sx * 0.31, 0.03, -L + 0.08), 0.03);
    scheibenHorn(ger, h, V(sx * 0.3, -0.02, -L + 0.3), sx, 2, 0.2);
  }
  maschTeil(h, rundGeo(0.46, 0.07, 0.15, 0.03, 3), ger.mPolster, 0, 0, -L);
  z.ws = { P, hebel: h, L };
}
// Esel-Wadenheben: Stufe, Griffstange vorn, Hüftpolster an einem Hebel mit Drehpunkt hinten oben, Scheibenhorn am Hebel
function eselBauen(ger, z, P, polster0) {
  bodenrahmen(ger, -0.42, 0.42, P.z - 0.1, 1.02);
  ger.box(0.62, 0.1, 0.26, V(0, 0.05, 0.1), ger.mRahmen); ger.box(0.6, 0.02, 0.24, V(0, 0.11, 0.1), ger.mGummi);
  for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.36, 0.05, 0.98), V(sx * 0.36, 0.99, 0.98), 0.07); ger.vierkant(V(sx * 0.36, 0.97, 0.98), V(sx * 0.36, 0.97, 0.84), 0.05); }
  griffRohr(ger, V(-0.38, 0.97, 0.84), V(0.38, 0.97, 0.84), ger.gruppe, 0.66);
  ger.polster(0.5, 0.06, 0.2, V(0, 1.03, 0.96));   // Unterarmpolster vorn
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.3, 0.05, P.z), V(sx * 0.3, P.y, P.z), 0.08);
  drehlager(ger, P, V(1, 0, 0), 0.66);
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) rohrIn(ger, h, V(sx * 0.24, 0, 0), V(sx * 0.24, 0, L + 0.05), 0.05);
  maschTeil(h, rundGeo(0.44, 0.08, 0.24, 0.03, 3), ger.mPolster, 0, -0.02, L);
  for (const sx of [-1, 1]) scheibenHorn(ger, h, V(sx * 0.27, 0, 0.28), sx, 2, 0.2);
  z.es = { P, hebel: h };
}
// Beinbeuger stehend: Plattform, Rahmen vorn mit Griffen und Oberschenkelpolster, Hebel um die rechte Knieachse mit Rolle hinter dem Knöchel
function beincurlStehendBauen(ger, z, knie) {
  bodenrahmen(ger, -0.4, 0.4, -0.36, 0.5);
  ger.box(0.56, 0.08, 0.5, V(0, 0.05, 0.0), ger.mRahmen); ger.box(0.54, 0.02, 0.48, V(0, 0.095, 0.0), ger.mGummi);   // Oberkante 0,1
  ger.vierkant(V(0, 0.05, 0.44), V(0, 1.22, 0.44), 0.08);
  ger.vierkant(V(-0.3, 1.25, 0.36), V(0.3, 1.25, 0.36), 0.06);
  ger.vierkant(V(0, 1.22, 0.44), V(0, 1.25, 0.36), 0.06);
  for (const sx of [-1, 1]) griffRohr(ger, V(sx * 0.18, 1.25, 0.3), V(sx * 0.3, 1.25, 0.3), ger.gruppe, 0.8);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.3, 1.25, 0.36), V(sx * 0.3, 1.25, 0.3), 0.05);
  // Oberschenkelpolster vor dem rechten Oberschenkel über dem Knie
  ger.vierkant(V(0, knie.y + 0.14, 0.44), V(-0.1, knie.y + 0.14, knie.z + 0.16), 0.05);
  ger.polster(0.18, 0.14, 0.07, V(-0.1, knie.y + 0.14, knie.z + 0.105));
  const P = V(-0.3, knie.y, knie.z);
  ger.vierkant(V(P.x, 0.05, P.z), P.clone().sub(V(0, 0.05, 0)), 0.07);
  drehlager(ger, P);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = MASS.unterschenkel - 0.05, rz = -0.085;
  maschTeil(z.hebel, new THREE.CylinderGeometry(0.09, 0.09, 0.022, 32), ger.mRahmen, -0.05).rotation.z = Math.PI / 2;
  rohrIn(ger, z.hebel, V(0, 0, 0), V(0, -L, rz), 0.055);
  rohrIn(ger, z.hebel, V(0, -L, rz), V(0.29, -L, rz), 0.04);
  rollePolster(ger, 0.17, 0.048, z.hebel).position.set(0.2, -L, rz);
  z.block = gewichtsblock(ger, V(-0.8, 0, 0.05), V(1, 0, 0), 1.6);
  ger.stab(V(-0.36, knie.y + 0.09, knie.z), V(-0.8, 1.7, 0.05), 0.006, ger.mKabel);
}
// Glute-Kickback-Maschine: Brustpolster, Griffstange, Hebel um die rechte Hüftachse mit Fußplatte unter der Sohle (geht mit dem Bein)
function kickbackMaschineBauen(ger, z, becken, r, huefte, bein) {
  const k = rumpf(becken, r), R = rumpfRahmen(r);
  bodenrahmen(ger, -0.42, 0.42, -0.55, 0.66);
  ger.box(0.5, 0.04, 0.5, V(0.08, 0.02, 0.02), ger.mGummi);
  const pad = k.brust.clone().add(R.vor.clone().multiplyScalar(0.16)).sub(R.oben.clone().multiplyScalar(0.1));
  ger.polster(0.42, 0.44, 0.08, pad, basisAus(R.oben, R.vor));
  const hinter = pad.clone().add(R.vor.clone().multiplyScalar(0.09));
  ger.vierkant(V(0, 0.05, 0.6), V(0, 1.0, 0.6), 0.08);
  ger.vierkant(V(0, 0.85, 0.6), hinter, 0.07);
  ger.vierkant(V(-0.32, 1.0, 0.6), V(0.32, 1.0, 0.6), 0.06);
  for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.32, 1.0, 0.6), V(sx * 0.32, 1.0, 0.53), 0.05); griffRohr(ger, V(sx * 0.32, 1.0, 0.53), V(sx * 0.08, 1.0, 0.53), ger.gruppe, 0.75); }
  const P = V(-0.36, huefte.y, huefte.z);
  ger.vierkant(V(P.x, 0.05, P.z), P.clone().sub(V(0, 0.06, 0)), 0.08);
  drehlager(ger, P);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const fx = huefte.x - P.x, tief = bein + SOHLE + 0.015;
  maschTeil(z.hebel, new THREE.CylinderGeometry(0.09, 0.09, 0.022, 32), ger.mRahmen, -0.05).rotation.z = Math.PI / 2;
  rohrIn(ger, z.hebel, V(0, 0, 0), V(0, -tief - 0.02, 0.0), 0.055);
  rohrIn(ger, z.hebel, V(0, -tief - 0.02, 0.0), V(fx + 0.07, -tief - 0.02, 0.0), 0.04);
  maschTeil(z.hebel, rundGeo(0.16, 0.03, 0.3, 0.008, 1), ger.mRahmen, fx, -tief, 0.05);
  maschTeil(z.hebel, rundGeo(0.15, 0.008, 0.28, 0.003, 1), ger.mGummi, fx, -tief + 0.017, 0.05);
  z.block = gewichtsblock(ger, V(-0.85, 0, -0.1), V(1, 0, 0), 1.6);
  ger.stab(V(-0.36, huefte.y + 0.09, huefte.z), V(-0.85, 1.7, -0.1), 0.006, ger.mKabel);
}
// Hip-Thrust-Maschine: Bank für die Schulterblätter, Fußplatte, Hebel mit Drehpunkt vorn am Boden, Hüftpolster mit Griffen, Scheibenhörner
function hipthrustMaschineBauen(ger, z, P, polster0) {
  bodenrahmen(ger, -0.45, 0.45, -0.55, P.z + 0.1);
  ger.box(0.72, 0.02, 0.42, V(0, 0.01, 0.62), ger.mGummi);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.42, 0.05, P.z), V(sx * 0.42, P.y, P.z), 0.08);
  drehlager(ger, P, V(1, 0, 0), 0.92);
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    rohrIn(ger, h, V(sx * 0.4, 0, 0), V(sx * 0.4, 0, -L - 0.03), 0.055);
    rohrIn(ger, h, V(sx * 0.31, 0, -L), V(sx * 0.4, 0, -L), 0.04);
    griffRohr(ger, V(sx * 0.36, -0.02, -L - 0.08), V(sx * 0.36, -0.02, -L + 0.08), h, 0.7);
    scheibenHorn(ger, h, V(sx * 0.43, 0, -L + 0.12), sx, 2, 0.2);
  }
  maschTeil(h, rundGeo(0.62, 0.09, 0.2, 0.035, 3), ger.mPolster, 0, 0, -L);
  z.ht = { P, hebel: h };
}
// T-Bar: Lagerbock hinten am Boden (Drehachse X durch P), Stange zwischen den Beinen nach vorn, enger Griff (zwei Griffe längs,
// Handflächen zueinander) und dahinter das Scheibenhorn mit Scheiben. Lokal zeigt der Hebel nach +z, griff0 = Griffmitte zu Beginn.
// brust: Brustpolster (r, becken) und Fußplatte für das brustgestützte T-Bar-Rudern
function tbarBauen(ger, z, P, griff0, brust) {
  ger.box(0.34, 0.05, 0.34, V(0, 0.025, P.z), ger.mRahmen);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.07, 0.05, P.z), V(sx * 0.07, P.y + 0.03, P.z), 0.05);
  drehlager(ger, P, V(1, 0, 0), 0.18);
  const L = griff0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  maschTeil(h, new THREE.CylinderGeometry(0.024, 0.024, L + 0.02, 18), ger.mMetall, 0, 0, (L + 0.02) / 2).rotation.x = Math.PI / 2;
  // Griff: kurzes Querstück unter der Stange, zwei Griffe längs (in den Händen)
  maschTeil(h, rundGeo(0.2, 0.03, 0.04, 0.008, 1), ger.mRahmen, 0, -0.03, L - 0.06);
  for (const sx of [-1, 1]) { griffRohr(ger, V(sx * 0.08, 0, L - 0.08), V(sx * 0.08, 0, L + 0.07), h, 0.8); rohrIn(ger, h, V(sx * 0.08, -0.03, L - 0.08), V(sx * 0.08, 0, L - 0.08), 0.025); }
  if (!brust) {   // stehend: Scheiben am Stangenende vor dem Griff (unter dem Oberkörper)
    maschTeil(h, new THREE.CylinderGeometry(0.026, 0.026, 0.3, 18), ger.mMetall, 0, 0, L + 0.25).rotation.x = Math.PI / 2;
    maschTeil(h, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), ger.mMetall, 0, 0, L + 0.12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 2; i++) maschTeil(h, scheibenGeo(0.17, 0.045), ger.mScheibe, 0, 0, L + 0.16 + i * 0.05).rotation.x = Math.PI / 2;
  } else {       // brustgestützt: Querrohr unter dem Polster, Scheibenhörner seitlich neben den Knien
    rohrIn(ger, h, V(-0.3, 0, L - 0.42), V(0.3, 0, L - 0.42), 0.05);
    for (const sx of [-1, 1]) scheibenHorn(ger, h, V(sx * 0.3, 0, L - 0.42), sx, 2, 0.17);
  }
  if (brust) {
    const k = rumpf(brust.becken, brust.r), R = rumpfRahmen(brust.r);
    const pad = k.brust.clone().add(R.vor.clone().multiplyScalar(0.15)).sub(R.oben.clone().multiplyScalar(0.12));
    ger.polster(0.36, 0.62, 0.08, pad, basisAus(R.oben, R.vor));
    const hinter = pad.clone().add(R.vor.clone().multiplyScalar(0.07));
    ger.vierkant(V(0, 0.05, hinter.z + 0.32), hinter.clone().add(R.oben.clone().multiplyScalar(0.12)), 0.08);
    ger.vierkant(V(0, 0.05, hinter.z + 0.32), V(0, 0.05, P.z), 0.07);
    for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.32, 0.035, P.z + 0.1), V(sx * 0.32, 0.035, hinter.z + 0.4), 0.07);
    ger.box(0.62, 0.03, 0.34, V(0, 0.055, 0.15), ger.mGummi);   // Fußplatte
  }
  z.tb = { P, hebel: h };
}
// Hyperextension 45°: Rahmen mit schrägem Hauptholm, zwei Hüftpolster vorn oben, Fußplatte senkrecht zu den Beinen mit Rollen hinter
// den Waden. fuss = Knöchel (Mitte), bein = Richtung Knöchel → Hüfte
function hyperBauen(ger, fuss, becken, bein) {
  const hinten = V(0, bein.z, -bein.y);   // Rückseite der Waden (nach oben-hinten)
  bodenrahmen(ger, -0.3, 0.3, fuss.z - 0.25, becken.z + 0.4);
  const fussMitte = fuss.clone().sub(bein.clone().multiplyScalar(SOHLE + 0.015)).add(hinten.clone().multiplyScalar(-0.05));
  ger.vierkant(V(0, 0.05, fuss.z - 0.2), V(0, becken.y - 0.12, becken.z + 0.12), 0.08);                // Hauptholm
  ger.vierkant(V(0, 0.05, becken.z + 0.3), V(0, becken.y - 0.12, becken.z + 0.12), 0.07);             // Stütze vorn
  ger.polster(0.5, 0.03, 0.34, fussMitte, basisAus(bein, hinten.clone().negate()), ger.mGummi);
  ger.vierkant(V(0, 0.05, fussMitte.z - 0.05), fussMitte.clone().sub(bein.clone().multiplyScalar(0.03)), 0.06);
  const rolle = fuss.clone().add(bein.clone().multiplyScalar(0.1)).add(hinten.clone().multiplyScalar(0.075));
  for (const sx of [-1, 1]) rollePolster(ger, 0.16, 0.045).position.copy(rolle).add(V(sx * 0.1, 0, 0));
  ger.vierkant(V(-0.2, rolle.y, rolle.z), V(0.2, rolle.y, rolle.z), 0.03);
  ger.vierkant(fussMitte.clone().add(hinten.clone().multiplyScalar(0.08)), V(0, rolle.y, rolle.z), 0.04);
  // Hüftpolster: schräg (45°), Oberkante an der Leiste
  const pad = becken.clone().add(V(0, -0.07, 0.11)), q = basisAus(bein, hinten.clone().negate());
  for (const sx of [-1, 1]) ger.polster(0.17, 0.3, 0.08, pad.clone().add(V(sx * 0.1, 0, 0)), q);
}
// Glute Ham Raise (GHD): langer Rahmen, rundes Kniepolster vorn, Fußplatte hinten mit zwei Rollen um die Knöchel
function ghdBauen(ger, knie, fussZ, fussY) {
  bodenrahmen(ger, -0.3, 0.3, fussZ - 0.25, 0.45);
  ger.vierkant(V(0, 0.05, 0.12), V(0, knie.y - 0.2, 0.12), 0.08);
  ger.vierkant(V(0, 0.05, fussZ - 0.12), V(0, fussY + 0.08, fussZ - 0.12), 0.08);
  ger.vierkant(V(0, knie.y - 0.2, 0.12), V(0, knie.y - 0.2, fussZ - 0.12), 0.07);
  maschTeil(ger.gruppe, new THREE.CylinderGeometry(0.11, 0.11, 0.44, 28), ger.mPolster, 0, knie.y - 0.17, 0.1).rotation.z = Math.PI / 2;   // runder Buckel
  ger.box(0.44, 0.04, 0.24, V(0, knie.y - 0.19, 0.1), ger.mRahmen);
  ger.box(0.4, 0.26, 0.03, V(0, fussY + 0.02, fussZ - 0.11), ger.mGummi);                             // Fußplatte hinter den Fußsohlen
  for (const [dy, dz] of [[0.075, 0.0], [-0.07, 0.03]]) { const r = rollePolster(ger, 0.36, 0.045); r.position.set(0, fussY + dy, fussZ + 0.06 + dz); }
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.2, fussY - 0.07, fussZ - 0.11), V(sx * 0.2, fussY + 0.075, fussZ + 0.06), 0.03);
}
// Reverse Hyper: hohe Bank mit Griffen vorn, Pendel um die Hüftachse hinter der Bankkante, Rolle hinter den Waden, Scheibenhorn
function reverseHyperBauen(ger, z, becken, griffZ) {
  bodenrahmen(ger, -0.36, 0.36, griffZ - 0.15, becken.z + 0.45);
  ger.polster(0.42, 0.08, 1.0, V(0, 0.84, becken.z - 0.44));
  for (const sz of [griffZ + 0.05, becken.z - 0.08]) ger.vierkant(V(0, 0.05, sz), V(0, 0.8, sz), 0.08);
  for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.2, 0.8, griffZ + 0.05), V(sx * 0.2, 0.8, griffZ - 0.04), 0.04); griffRohr(ger, V(sx * 0.2, 0.82, griffZ - 0.12), V(sx * 0.2, 0.82, griffZ + 0.02), ger.gruppe, 0.75); }
  const P = V(0, becken.y - 0.08, becken.z + 0.06);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.3, 0.05, P.z + 0.12), V(sx * 0.3, P.y, P.z), 0.07);
  drehlager(ger, P, V(1, 0, 0), 0.66);
  const h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  const L = BEIN * 0.8;
  for (const sx of [-1, 1]) rohrIn(ger, h, V(sx * 0.27, 0, 0), V(sx * 0.27, -L, 0.0), 0.05);
  rohrIn(ger, h, V(-0.27, -L, 0), V(0.27, -L, 0), 0.045);
  rollePolster(ger, 0.4, 0.05, h).position.set(0, -L + 0.02, 0.075);   // hinter den Waden (Beine schwingen nach +z)
  for (const sx of [-1, 1]) scheibenHorn(ger, h, V(sx * 0.27, -L - 0.12, 0.0), sx, 2, 0.17);
  z.rh = { P, hebel: h };
}
// Belt Squat: Plattform mit Gummiauflage und Schlitz, zwei Säulen mit Griffstange, Gewichtsblock vorn, Kabel unter der Plattform zur Kette
function beltBauen(ger, z) {
  bodenrahmen(ger, -0.45, 0.45, -0.4, 0.5);
  ger.box(0.84, 0.12, 0.62, V(0, 0.07, 0), ger.mRahmen);
  for (const sx of [-1, 1]) ger.box(0.36, 0.015, 0.56, V(sx * 0.21, 0.1375, 0), ger.mGummi);
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.32, 0.13, 0.42), V(sx * 0.32, 1.13, 0.42), 0.07);
    ger.vierkant(V(sx * 0.32, 1.13, 0.42), V(sx * 0.32, 1.13, 0.38), 0.05);
    griffRohr(ger, V(sx * 0.34, 1.13, 0.38), V(sx * 0.12, 1.13, 0.38), ger.gruppe, 0.75);
  }
  ger.vierkant(V(-0.12, 1.13, 0.38), V(0.12, 1.13, 0.38), 0.04);
  // Gewichtsblock rechts neben der Plattform, Kabel unter der Plattform zur Rolle unter dem Schlitz
  z.block = gewichtsblock(ger, V(-0.8, 0, 0.1), V(1, 0, 0), 1.6);
  maschTeil(ger.gruppe, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 20), ger.mMetall, 0, 0.1, 0.16).rotation.z = Math.PI / 2;
  ger.stab(V(0, 0.06, 0.16), V(-0.62, 0.06, 0.16), 0.006, ger.mKabel);
}
// Schrägbank für Übungen mit der Brust auf dem Polster (brustgestütztes Rudern, Spider Curl, Y-Heben, Reverse Flys): das Polster liegt
// am Oberkörper entlang vom Bauch bis zur oberen Brust, darunter ein Holm auf zwei Stützen mit Füßen
function brustbankBauen(ger, becken, r) {
  const R = rumpfRahmen(r), vor = R.vor.clone().multiplyScalar(0.155);
  const a = becken.clone().add(R.oben.clone().multiplyScalar(0.07)).add(vor), e = becken.clone().add(R.oben.clone().multiplyScalar(0.56)).add(vor);
  ger.polster(0.36, a.distanceTo(e), 0.08, a.clone().lerp(e, 0.5), basisAus(R.oben, R.vor));
  const h = R.vor.clone().multiplyScalar(0.075), oben = e.clone().add(h).sub(R.oben.clone().multiplyScalar(0.08)), unten = a.clone().add(h).add(R.oben.clone().multiplyScalar(0.05));
  ger.vierkant(unten, oben, 0.07);
  for (const p of [oben, unten]) { ger.vierkant(V(0, 0.05, p.z), p, 0.07); ger.vierkant(V(-0.26, 0.035, p.z), V(0.26, 0.035, p.z), 0.07); }
}
// Dip-Station: je Seite ein Holm mit Gummigriff (vorn), zwei Stützen und ein Fuß; y = Höhe der Holme, zMitte = Mitte der Holme
function dipBarrenBauen(ger, y = 1.25, zMitte = 0.05, x = 0.27) {
  for (const sx of [-1, 1]) {
    const hinten = V(sx * x, y, zMitte - 0.32), vorn = V(sx * x, y, zMitte + 0.3);
    griffRohr(ger, hinten, vorn, ger.gruppe, 0.5);
    for (const zz of [zMitte - 0.26, zMitte + 0.22]) ger.vierkant(V(sx * (x + 0.04), 0.05, zz), V(sx * (x + 0.04), y - 0.02, zz), 0.05);
    for (const zz of [zMitte - 0.26, zMitte + 0.22]) ger.vierkant(V(sx * (x + 0.04), y - 0.02, zz), V(sx * x, y - 0.02, zz), 0.04);
    ger.vierkant(V(sx * (x + 0.04), 0.035, zMitte - 0.4), V(sx * (x + 0.04), 0.035, zMitte + 0.36), 0.07);
  }
  for (const zz of [zMitte - 0.4, zMitte + 0.36]) ger.vierkant(V(-x - 0.04, 0.035, zz), V(x + 0.04, 0.035, zz), 0.06);
}
// Trap Bar (Sechseck): Rahmen um den Trainierenden, Griffe innen links und rechts (längs, Neutralgriff), Hülsen mit Scheiben
function trapBar(ger) {
  const g = new THREE.Group(), r = 0.016;
  const ecken = [V(0.36, 0, -0.2), V(0.36, 0, 0.2), V(0, 0, 0.42), V(-0.36, 0, 0.2), V(-0.36, 0, -0.2), V(0, 0, -0.42)];
  ecken.forEach((p, i) => { const q = ecken[(i + 1) % 6]; const o = maschTeil(g, new THREE.CylinderGeometry(r, r, p.distanceTo(q), 14), ger.mMetall); legeLaengs(o, p, q); });
  for (const sx of [-1, 1]) {
    griffRohr(ger, V(sx * 0.29, 0, -0.1), V(sx * 0.29, 0, 0.1), g, 0.7);
    for (const zz of [-0.1, 0.1]) legeLaengs(maschTeil(g, new THREE.CylinderGeometry(0.013, 0.013, 0.07, 12), ger.mMetall), V(sx * 0.29, 0, zz), V(sx * 0.36, 0, zz));
    legeLaengs(maschTeil(g, new THREE.CylinderGeometry(0.025, 0.025, 0.4, 16), ger.mMetall), V(sx * 0.36, 0, 0), V(sx * 0.76, 0, 0));
    maschTeil(g, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 18), ger.mMetall, sx * 0.4, 0, 0).rotation.z = Math.PI / 2;
    for (let i = 0; i < 2; i++) maschTeil(g, scheibenGeo(0.225, 0.045), ger.mScheibe, sx * (0.44 + i * 0.05), 0, 0).rotation.z = Math.PI / 2;
  }
  ger.gruppe.add(g); return g;
}
// Butterfly (Brust) bzw. Reverse Butterfly (hintere Schulter): Arme hängen an Drehachsen über den Schultern (senkrecht), Griffe senkrecht.
// richtung = 1: Figur sitzt mit dem Rücken zum Polster (Butterfly), -1: Brust am Polster (Reverse)
function butterflyBauen(ger, z, becken, r, richtung) {
  const R = rumpfRahmen(r), k = rumpf(becken, r);
  bodenrahmen(ger, -0.42, 0.42, -0.7, 0.3);
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02 * richtung), 0.44, 0.42);
  const lehne = richtung > 0 ? becken.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045))
    : becken.clone().add(R.oben.clone().multiplyScalar(0.3)).add(R.vor.clone().multiplyScalar(0.17 + 0.045));
  ger.polster(0.4, richtung > 0 ? 0.66 : 0.5, 0.09, lehne, basisAus(R.oben, R.vor));
  const saeule = V(0, 0, lehne.z - 0.25 * richtung);
  ger.vierkant(saeule.clone().setY(0.05), saeule.clone().setY(1.95), 0.09);
  ger.vierkant(saeule.clone().setY(lehne.y), lehne.clone().sub(R.vor.clone().multiplyScalar(0.06 * richtung)), 0.06);
  for (const sx of [-1, 1]) {
    const s = sx > 0 ? 'l' : 'r', P = V(k.schulter[s].x, 1.88, k.schulter[s].z);
    ger.vierkant(saeule.clone().setY(1.92), P.clone().setY(1.92), 0.07);
    drehlager(ger, P, V(0, 1, 0), 0.12);
    z['bfArm_' + s] = ger.stab(V(), V(0, 1, 0), 0.028, ger.mRahmen);
    z['bfQuer_' + s] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mRahmen);
    const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); z['bfGriff_' + s] = g;
    z['bfDreh_' + s] = P;
  }
  z.block = gewichtsblock(ger, V(-0.72, 0, saeule.z), V(1, 0, 0));
  z.bf = { richtung };
}
function butterflyStellen(z, g, hub) {
  for (const s of ['l', 'r']) {
    const P = z['bfDreh_' + s], h = g.hand[s], oben = V(P.x, h.y + 0.09, P.z);
    seil(z['bfArm_' + s], P, oben);
    seil(z['bfQuer_' + s], oben, V(h.x, h.y + 0.09, h.z));
    z['bfGriff_' + s].position.copy(h); z['bfGriff_' + s].quaternion.identity();
  }
  z.block.heben(0.28 * hub);
}

// Latzugstange: breit/normal mit abgewinkelten Enden und Gummigriffen, 'gerade' (Untergriff) oder 'parallel' (eng, Neutralgriff:
// zwei Griffe quer zur Stange). Achse X, Mitte im Ursprung (stangeAn legt sie zwischen die Fäuste), Öse für den Karabiner oben
function latzugstange(ger, typ, breite) {
  const g = new THREE.Group(), quer = (geo, m, x, y = 0) => { const o = maschTeil(g, geo, m, x, y); o.rotation.z = Math.PI / 2; return o; };
  if (typ === 'parallel') {
    quer(new THREE.CylinderGeometry(0.014, 0.014, breite * 2 + 0.06, 14), ger.mMetall, 0, 0.05);
    for (const sx of [-1, 1]) {
      maschTeil(g, new THREE.CylinderGeometry(0.018, 0.018, 0.13, 14), ger.mGummi, sx * breite, 0, 0).rotation.x = Math.PI / 2;
      maschTeil(g, new THREE.CylinderGeometry(0.011, 0.011, 0.06, 10), ger.mMetall, sx * breite, 0.03, -0.065);
      maschTeil(g, new THREE.CylinderGeometry(0.011, 0.011, 0.06, 10), ger.mMetall, sx * breite, 0.03, 0.065);
    }
  } else {
    const gerade = typ === 'gerade', innen = gerade ? breite + 0.12 : breite * 0.62;
    quer(new THREE.CylinderGeometry(0.015, 0.015, innen * 2, 16), ger.mMetall, 0);
    for (const sx of [-1, 1]) {
      if (gerade) { quer(new THREE.CylinderGeometry(0.019, 0.019, 0.16, 14), ger.mGummi, sx * breite); continue; }
      const ende = maschTeil(g, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 16), ger.mMetall, sx * (innen + 0.14), -0.04);
      ende.rotation.z = -sx * (Math.PI / 2 - 0.27);
      const gr = maschTeil(g, new THREE.CylinderGeometry(0.019, 0.019, 0.16, 14), ger.mGummi, sx * breite, -0.035);
      gr.rotation.z = -sx * (Math.PI / 2 - 0.27);
    }
  }
  maschTeil(g, new THREE.TorusGeometry(0.02, 0.005, 8, 16), ger.mMetall, 0, 0.035);
  ger.gruppe.add(g); return g;
}
// Latzugstation: Gewichtsblock vorn (die Figur schaut darauf), Säule bis oben, Ausleger mit Umlenkrolle über der Stange, Sitz,
// Knierolle über den Oberschenkeln
function latzugBauen(ger, z, stangeZ) {
  bodenrahmen(ger, -0.36, 0.36, -0.32, 1.0);
  sitzSaeule(ger, V(0, 0.435, -0.02), 0.44, 0.42);
  z.block = gewichtsblock(ger, V(0, 0, 0.84), V(0, 0, -1), 2.05);
  ger.vierkant(V(0, 2.08, 0.84), V(0, 2.42, 0.84), 0.1);
  ger.vierkant(V(0, 2.42, 0.92), V(0, 2.42, stangeZ - 0.07), 0.09);
  const rolle = ger.rolle(0.05); rolle.position.set(0, 2.33, stangeZ); rolle.rotation.y = Math.PI / 2;
  ger.vierkant(V(0, 2.42, stangeZ), V(0, 2.36, stangeZ), 0.05);
  ger.vierkant(V(0, 0.66, 0.66), V(0, 0.66, 0.2), 0.06);
  ger.vierkant(V(0, 0.05, 0.66), V(0, 0.66, 0.66), 0.06);
  rollePolster(ger, 0.42, 0.05).position.set(0, 0.665, 0.13);
}
// Unterstützungsmaschine (Klimmzug bzw. Dips mit Kniepolster): hoher Rahmen, Gewichtsblock hinten (zieht das Polster nach oben),
// Kniepolster auf einem Hebel von hinten unten, Tritte zum Aufsteigen; Klimmzuggriffe oben bzw. Barrengriffe
function assistBauen(ger, z, art) {
  bodenrahmen(ger, -0.62, 0.62, -0.95, 0.35);
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.62, 0.05, -0.35), V(sx * 0.62, 2.42, -0.35), 0.09);
    ger.box(0.13, 0.035, 0.22, V(sx * 0.4, 0.5, -0.1), ger.mGummi);
    ger.vierkant(V(sx * 0.4, 0.475, -0.18), V(sx * 0.62, 0.475, -0.35), 0.05);
  }
  ger.vierkant(V(-0.62, 2.42, -0.35), V(0.62, 2.42, -0.35), 0.09);
  if (art === 'klimmzug') {
    z.stange = ger.zyl(0.016, 1.3, ger.mMetall); z.stange.rotation.z = Math.PI / 2; z.stange.position.set(0, 2.25, 0);
    for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.62, 2.25, 0.0), V(sx * 0.62, 2.25, -0.35), 0.07); ger.box(0.05, 0.05, 0.05, V(sx * 0.64, 2.25, 0), ger.mRahmen); }
  } else {
    for (const sx of [-1, 1]) {
      const b = ger.zyl(0.02, 0.6, ger.mMetall); b.rotation.x = Math.PI / 2; b.position.set(sx * 0.27, 1.25, 0.05);
      const gr = ger.zyl(0.024, 0.2, ger.mGummi); gr.rotation.x = Math.PI / 2; gr.position.set(sx * 0.27, 1.25, 0.12);
      ger.vierkant(V(sx * 0.27, 1.25, -0.25), V(sx * 0.62, 1.25, -0.35), 0.06);
    }
  }
  z.block = gewichtsblock(ger, V(0, 0, -0.8), V(0, 0, 1), 2.05);
  z.assistDreh = V(0, 0.32, -0.6);
  drehlager(ger, z.assistDreh, V(1, 0, 0), 0.2);
  z.hub = ger.stab(V(), V(0, 1, 0), 0.035, ger.mRahmen);
  z.polster = ger.box(0.5, 0.07, 0.4, V(), ger.mPolster);
}
// Kniepolster unter die Knie, Hebel dorthin; der Block hebt sich, wenn die Figur tiefer geht (Gegengewicht)
function assistStellen(z, g) {
  const knie = g.knie.l.clone().add(g.knie.r).multiplyScalar(0.5);
  z.polster.position.copy(knie).add(V(0, -0.085, -0.12));
  seil(z.hub, z.assistDreh, z.polster.position.clone().add(V(0, -0.035, -0.05)));
  z.assistMax = Math.max(z.assistMax || 0, knie.y);
  z.block.heben(Math.min(0.5, (z.assistMax - knie.y) * 0.8));
}
// Kabelrudern sitzend: lange Bank, zwei schräge Fußplatten (Lücke für das Kabel), Umlenkrolle unten, Gewichtsblock vorn
const RU_FUSSFLAECHE = V(0, 0.819, -0.573), RU_ANKER = V(0, 0.32, 0.92);
function kabelruderBauen(ger, z, breit) {
  ger.vierkant(V(0, 0.05, -0.75), V(0, 0.05, 1.38), 0.09);
  for (const zz of [-0.62, 0.22]) ger.vierkant(V(0, 0.05, zz), V(0, 0.295, zz), 0.07);
  ger.box(0.4, 0.09, 1.0, V(0, 0.34, -0.2));
  for (const sx of [-1, 1]) {
    const mitte = V(sx * 0.13, 0.32, 0.62).sub(RU_FUSSFLAECHE.clone().multiplyScalar(SOHLE + 0.015)).add(V(0, 0.573, 0.819).multiplyScalar(0.06));
    ger.polster(0.17, 0.3, 0.03, mitte, basisAus(V(0, 0.573, 0.819), RU_FUSSFLAECHE), ger.mRahmen);
    ger.vierkant(V(sx * 0.13, 0.05, mitte.z + 0.06), mitte.clone().add(V(0, -0.08, 0.04)), 0.05);
  }
  const rolle = ger.rolle(0.05); rolle.position.copy(RU_ANKER);
  ger.vierkant(V(0, 0.05, RU_ANKER.z), RU_ANKER.clone().sub(V(0, 0.06, 0)), 0.07);
  z.block = gewichtsblock(ger, V(0, 0, 1.45), V(0, 0, -1), 1.7);
  z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
  z.griff = breit ? latzugstange(ger, 'gerade', 0.3) : rudergriffV(ger);
}
// V-Griff fürs enge Rudern: zwei senkrechte Gummigriffe nebeneinander, Bügel nach vorn zum Karabiner (lokal: Z zum Kabel)
function rudergriffV(ger) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    maschTeil(g, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 14), ger.mGummi, sx * 0.07, 0, 0);
    rohrIn(ger, g, V(sx * 0.07, 0.07, 0), V(0, 0.02, 0.16), 0.02);
    rohrIn(ger, g, V(sx * 0.07, -0.07, 0), V(0, -0.02, 0.16), 0.02);
  }
  maschTeil(g, new THREE.TorusGeometry(0.02, 0.005, 8, 16), ger.mMetall, 0, 0, 0.18).rotation.y = Math.PI / 2;
  ger.gruppe.add(g); return g;
}
// Rudermaschine (brustgestützt): Sitz, Brustpolster an einer Säule, zwei Hebelarme mit senkrechten Griffen (Drehachse vorn oben)
const RM_BECKEN = V(0, 0.58, -0.08), RM_RUMPF = { neigung: 18 };
const rmSchulter = (sg) => rumpf(RM_BECKEN, RM_RUMPF).schulter[sg > 0 ? 'l' : 'r'];
const rmVorn = (sg) => rmSchulter(sg).add(V(sg * 0.04, -0.06, ARM * 0.9995)), rmNah = (sg) => rmSchulter(sg).add(V(sg * 0.07, -0.2, 0.06));
const RM_C = bogenMitte(rmVorn(1), rmNah(1), { y: 1.72 });
function rudermaschineBauen(ger, z) {
  const R = rumpfRahmen(RM_RUMPF);
  bodenrahmen(ger, -0.45, 0.45, -0.45, 1.05);
  sitzSaeule(ger, V(0, RM_BECKEN.y - 0.115, RM_BECKEN.z), 0.42, 0.38);
  const brust = RM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.36)).add(R.vor.clone().multiplyScalar(0.19 + 0.045));
  ger.polster(0.36, 0.44, 0.09, brust, basisAus(R.oben, R.vor));
  ger.vierkant(V(0, 0.05, brust.z + 0.25), V(0, brust.y - 0.05, brust.z + 0.25), 0.08);
  ger.vierkant(V(0, brust.y - 0.05, brust.z + 0.25), brust.clone().add(R.vor.clone().multiplyScalar(0.05)), 0.06);
  for (const sx of [-1, 1]) {
    const sd = sx > 0 ? 'l' : 'r', P = V(sx * DM_X, RM_C.y, RM_C.z);
    ger.vierkant(V(sx * DM_X, 0.05, RM_C.z), P.clone().sub(V(0, 0.06, 0)), 0.08);
    drehlager(ger, P, V(1, 0, 0), 0.13);
    z['dmArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.03, ger.mRahmen);
    z['dmQuer_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
    const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); z['dmGriff_' + sd] = g;
  }
  ger.vierkant(V(-DM_X, RM_C.y, RM_C.z), V(DM_X, RM_C.y, RM_C.z), 0.06);
  z.block = gewichtsblock(ger, V(-0.85, 0, RM_C.z - 0.15), V(1, 0, 0));   // seitlich, damit die Figur von vorn zu sehen ist
  z.dm = { C: RM_C, griff: 'senkrecht' };
}

/* ---------- Beinpresse 45° (mit Scheiben beladen) ---------- */
// Wie eine echte 45°-Beinpresse: Grundrahmen am Boden, zwei Schienen unter 45°, darauf der Schlitten mit Fußplatte und Hantelscheiben
// an den Hörnern; Rückenpolster 48° zurückgelehnt, Sitzpolster darunter (125° zum Rücken), Haltegriffe neben dem Sitz.
// Die Füße stehen flach und etwas breiter als die Hüfte auf der Platte (Zehen leicht nach außen, Knie folgen den Zehen). Die Füße
// bleiben auf der Platte und fahren mit dem Schlitten genau entlang der Schienen: Daraus ergibt sich der Kniewinkel (unten ~95°, oben ~12°).
const BP_SCHIENE = V(0, Math.SQRT1_2, Math.SQRT1_2);          // Fahrrichtung des Schlittens
const BP_PLATTE_OBEN = V(0, Math.SQRT1_2, -Math.SQRT1_2);     // auf der Platte zur Oberkante
const BP_BECKEN = V(0, 0.62, -0.22), BP_LEHNE = 48;            // Becken im Sitz, Rücken so weit zurückgelehnt (Grad)
const BP_BEIN = BP_SCHIENE.clone().add(BP_PLATTE_OBEN.clone().multiplyScalar(0.18)).normalize();   // Hüfte → Fuß unten: Füße mittig-hoch auf der Platte
const BP_UNTEN = 95, BP_OBEN = 12, BP_FUSSBREITE = 0.155;
const bpRahmen = () => rumpfRahmen({ basis: quer(-BP_LEHNE) });
const bpHuefte = (sg) => BP_BECKEN.clone().sub(bpRahmen().oben.multiplyScalar(0.02)).add(V(sg * MASS.hueftBreite, 0, 0));
// Abstand Hüftgelenk → Knöchel bei einer Kniebeugung (Grad)
const bpWeg = (beuge) => Math.sqrt(MASS.oberschenkel ** 2 + MASS.unterschenkel ** 2 - 2 * MASS.oberschenkel * MASS.unterschenkel * Math.cos((180 - beuge) * RAD));
const bpFuss0 = (sg) => bpHuefte(0).add(V(sg * BP_FUSSBREITE, 0, 0)).add(BP_BEIN.clone().multiplyScalar(bpWeg(BP_UNTEN)));
// Schlittenweg ab unten, bei dem das Knie so stark gebeugt ist
function bpHub(beuge) {
  const c = bpFuss0(1).sub(bpHuefte(1)), b = c.dot(BP_SCHIENE), D = bpWeg(beuge);
  return -b + Math.sqrt(Math.max(0, b * b - (c.lengthSq() - D * D)));
}
// Mitte der Plattenoberfläche, wenn der Schlitten um hub (m) aus der unteren Stellung gefahren ist
const bpPlatte = (hub) => bpFuss0(1).add(bpFuss0(-1)).multiplyScalar(0.5).add(BP_SCHIENE.clone().multiplyScalar(hub + SOHLE)).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.07));   // Fußmitte etwa in der Plattenmitte
const BP_DREH = basisAus(BP_PLATTE_OBEN, BP_SCHIENE);   // Schlitten-Lage: X quer, Y Platte nach oben, Z = Fahrrichtung
function beinpresseBauen(ger, z) {
  const R = bpRahmen(), X = V(1, 0, 0);
  const lok = (x, y, zz) => V(x, y, zz).applyQuaternion(BP_DREH);
  // Sitz: Rückenpolster parallel zum Rücken, Sitzpolster unter dem Po, beide auf einem Stahlrahmen
  ger.polster(0.46, 0.72, 0.09, BP_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.33)).sub(R.vor.clone().multiplyScalar(0.13 + 0.045)), basisAus(R.oben, R.vor));
  const sitzN = R.oben.clone().multiplyScalar(Math.cos(35 * RAD)).add(R.vor.clone().multiplyScalar(Math.sin(35 * RAD))).normalize();
  const sitzVor = X.clone().cross(sitzN).normalize();
  const sitz = BP_BECKEN.clone().sub(sitzN.clone().multiplyScalar(0.115 + 0.045)).add(sitzVor.clone().multiplyScalar(0.06));
  ger.polster(0.44, 0.09, 0.42, sitz, basisAus(sitzN, sitzVor));
  const unterSitz = sitz.clone().sub(sitzN.clone().multiplyScalar(0.08)), unterLehne = BP_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.45)).sub(R.vor.clone().multiplyScalar(0.27));
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.17, 0.06, unterSitz.z), unterSitz.clone().add(V(sx * 0.17, 0, 0)), 0.06);
    ger.vierkant(V(sx * 0.17, 0.06, unterLehne.z - 0.1), unterLehne.clone().add(V(sx * 0.17, 0, 0)), 0.06);
    // Haltegriff neben dem Sitz: Pfosten, waagerechte Chromstange mit Gummigriff
    const griff = BP_BECKEN.clone().add(V(sx * 0.34, 0, 0)).add(sitzN.clone().multiplyScalar(0.02)).add(sitzVor.clone().multiplyScalar(0.07));
    ger.vierkant(V(sx * 0.34, 0.06, griff.z - 0.02), griff.clone().sub(V(0, 0.03, 0)), 0.045);
    ger.stab(griff.clone().sub(sitzVor.clone().multiplyScalar(0.14)), griff.clone().add(sitzVor.clone().multiplyScalar(0.14)), 0.014, ger.mMetall);
    ger.stab(griff.clone().sub(sitzVor.clone().multiplyScalar(0.075)), griff.clone().add(sitzVor.clone().multiplyScalar(0.075)), 0.018, ger.mGummi);
  }
  z.bpGriff = { sitzVor };
  // Grundrahmen am Boden, Schienen unter 45°, Stützen
  const P0 = bpPlatte(0), hubMax = bpHub(BP_OBEN);
  const schiene = (sx, s) => P0.clone().add(X.clone().multiplyScalar(sx * 0.26)).add(BP_PLATTE_OBEN.clone().multiplyScalar(-0.42)).add(BP_SCHIENE.clone().multiplyScalar(s));
  const s0 = -0.42, s1 = hubMax + 0.78;
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.3, 0.04, -0.95), V(sx * 0.3, 0.04, schiene(sx, s1).z + 0.12), 0.08);
    ger.vierkant(schiene(sx, s0), schiene(sx, s1), 0.075);
    ger.stab(schiene(sx, s0).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.045)), schiene(sx, s1).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.045)), 0.012, ger.mMetall);   // Laufschiene
    ger.vierkant(V(sx * 0.26, 0.05, schiene(sx, s0).z), schiene(sx, s0), 0.07);
    ger.vierkant(V(sx * 0.3, 0.05, schiene(sx, s1).z), schiene(sx, s1), 0.08);
    ger.vierkant(V(sx * 0.3, 0.05, schiene(sx, s1).z - 0.55), schiene(sx, s1 - 0.5), 0.06);
    ger.box(0.06, 0.06, 0.1, schiene(sx, s0 + 0.12).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.07)), ger.mGummi);   // Anschlag unten
  }
  for (const zz of [-0.95, schiene(1, s1).z + 0.12]) ger.vierkant(V(-0.34, 0.04, zz), V(0.34, 0.04, zz), 0.08);
  ger.vierkant(schiene(-1, s1), schiene(1, s1), 0.07);
  // Schlitten: Fußplatte mit Gummibelag, Wagen auf den Schienen, Hörner mit Scheiben (alles in einer Gruppe, fährt mit)
  const sch = new THREE.Group(); sch.quaternion.copy(BP_DREH);
  const teil = (geo, m, x, y, zz) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, zz); o.castShadow = true; o.receiveShadow = true; sch.add(o); return o; };
  teil(rundGeo(0.78, 0.62, 0.045, 0.012, 2), ger.mRahmen, 0, 0, 0.0225 + 0.008);
  teil(rundGeo(0.72, 0.56, 0.012, 0.005, 1), ger.mGummi, 0, 0, 0.004);
  teil(rundGeo(0.62, 0.12, 0.5, 0.012, 1), ger.mRahmen, 0, -0.33, 0.29);
  for (const sx of [-1, 1]) {
    teil(rundGeo(0.06, 0.4, 0.06, 0.01, 1), ger.mRahmen, sx * 0.3, -0.12, 0.2).rotation.x = -0.6;
    for (const zz of [0.12, 0.46]) teil(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), ger.mGummi, sx * 0.26, -0.39, zz).rotation.z = Math.PI / 2;   // Laufrollen
    const horn = teil(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 20), ger.mMetall, sx * 0.47, -0.2, 0.3); horn.rotation.z = Math.PI / 2;
    for (const [i, x] of [[0, 0.385], [1, 0.44]]) { const p = teil(scheibenGeo(i ? 0.2 : 0.225, 0.05), ger.mScheibe, sx * x, -0.2, 0.3); p.rotation.z = Math.PI / 2; }
  }
  ger.gruppe.add(sch);
  z.schlitten = sch;
  return z;
}
// Maschinen für die Beine im Sitzen/Liegen: art: strecker | beuger_sitzend | beuger_liegend | adduktoren | abduktoren | beinpresse | hackenschmidt
// Neu: einbeinig (strecker, beinpresse: nur das linke Bein arbeitet) ; abduktoren + band (auf der Bank, Band um die Knie) ; hackenschmidt + winkel (z. B. 15 = Pendel-Kniebeuge)
export function beinmaschine(o = {}) {
  const art = o.art || 'strecker';
  const hw = o.winkel || HACK, band = art === 'abduktoren' && o.band;
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'beinpresse') return beinpresseBauen(ger, z);
      if (art === 'hackenschmidt') return hackBauen(ger, z, hw);
      if (band) { ger.box(0.4, 0.45, 1.0, V(0, 0.225, -0.2), ger.mPolster); z.band = ger.stab(V(), V(0, 1, 0), 0.03, ger.mBand); return z; }
      if (art === 'beuger_liegend') {
        // Liegender Beinbeuger: Brustpolster, etwas höheres Hüftpolster, Griffe vorn; Drehachse auf dem Kniegelenk, Rolle über den Fersen
        bodenrahmen(ger, -0.26, 0.26, -1.0, 0.72);
        ger.box(0.38, 0.09, 0.75, V(0, 0.54, -0.475), ger.mPolster);
        ger.polster(0.38, 0.09, 0.62, V(0, 0.582, 0.2), quer(-6));
        for (const zz of [-0.7, 0.35]) ger.vierkant(V(0, 0.05, zz), V(0, 0.5, zz), 0.07);
        for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.385, 0.05, -0.54), V(sx * 0.385, 0.62, -0.54), 0.045); griffRohr(ger, V(sx * 0.385, 0.64, -0.66), V(sx * 0.385, 0.64, -0.42)); }
        hebelBauen(ger, z, BL_KNIE.clone().setX(SM_HEBEL_X), 1, false);
        z.block = gewichtsblock(ger, V(-0.78, 0, 0.15), V(1, 0, 0));
        return z;
      }
      sitzmaschineBauen(ger, z);
      if (art === 'strecker' || art === 'beuger_sitzend') {
        hebelBauen(ger, z, SM_KNIE.clone().setX(SM_HEBEL_X), art === 'strecker' ? 1 : -1, o.einbeinig);
        if (art === 'beuger_sitzend') {   // Polster über den Knien hält die Oberschenkel auf dem Sitz
          const y = SM_KNIE.y + 0.115;
          ger.polster(0.42, 0.075, 0.15, V(0, y, 0.24));
          ger.vierkant(V(SM_HEBEL_X, y, 0.24), V(0.2, y, 0.24), 0.045);
          ger.vierkant(V(SM_HEBEL_X, 0.05, 0.22), V(SM_HEBEL_X, y + 0.02, 0.22), 0.05);
        }
      } else {
        // Adduktoren/Abduktoren: zwei Hebelarme, die um senkrechte Achsen unter der Sitzvorderkante drehen; Polster am Knie, Fußraste
        for (const s of ['l', 'r']) {
          z['arm_' + s] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mRahmen); z['rarm_' + s] = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen);
          z['pad_' + s] = ger.polster(0.065, 0.2, 0.26, V()); z['raste_' + s] = ger.stab(V(), V(0, 1, 0), 0.016, ger.mMetall);
        }
        for (const sx of [-1, 1]) drehlager(ger, V(sx * 0.13, 0.36, 0.14), V(0, 1, 0), 0.1);
      }
      return z;
    },
    pose(t) {
      if (art === 'beuger_liegend') {
        const becken = BL_BECKEN.clone();
        const r = { basis: BAUCHLAGE, neigung: 0 };
        const knieW = mix(10, 115, t) * RAD;
        const knie = (sg) => BL_KNIE.clone().setX(sg * 0.1);
        const fuss = seitenBauch((s, sg) => knie(sg).add(V(0, Math.sin(knieW) * MASS.unterschenkel, Math.cos(knieW) * MASS.unterschenkel)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -20 }, fuss, fussRicht: seiten((s, sg) => V(0, -Math.cos(knieW), Math.sin(knieW))), kniePol: seiten(() => V(0, -1, 0)),
            hand: seitenBauch((s, sg) => V(sg * 0.385, 0.64, -0.54)), handflaeche: seitenBauch((s, sg) => V(-sg, 0, 0)), ellbogenPol: seitenBauch((s, sg) => V(sg, 0.3, 0)) },
          props(g, z) { hebelStellen(z, g, 'l', (phi) => 0.24 * Math.max(0, Math.min(1, (phi - 10) / 105))); } };
      }
      if (art === 'hackenschmidt') {
        // Rumpf liegt am schrägen Polster (HACK Grad zurückgelehnt), Becken gleitet auf der Schienenlinie
        const u = V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor = V(0, Math.sin(hw * RAD), Math.cos(hw * RAD));
        const fussMitte = HACK_FUSS.clone();
        const becken = fussMitte.clone().add(u.clone().multiplyScalar(mix(0.5, BEIN * 1.02, t)));   // oben fast gestreckt
        const r = { basis: basisAus(u, vor), neigung: 0 };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => k.schulter[s].clone().add(u.clone().multiplyScalar(0.1)).add(vor.clone().multiplyScalar(0.09)).add(V(sg * 0.12, 0, 0)));
        return { pose: { becken, rumpf: r, kopf: { neigung: 5 }, hand, handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg, -1, 0.4)),
            fuss: seiten((s, sg) => fussMitte.clone().add(V(sg * 0.15, 0, 0))), fussFlaeche: seiten(() => HACK_PLATTFORM.clone()), fussRicht: seiten((s, sg) => V(sg * 0.25, 0.2, 1)), kniePol: seiten((s, sg) => V(sg * 0.25, 0.3, 1)) },
          props(g, z) { z.hackSchlitten.position.copy(g.becken); } };
      }
      if (art === 'beinpresse') {
        // Becken im Sitz, Rücken am Polster, Füße flach auf der Platte; der Schlitten fährt mit den Füßen entlang der Schienen
        const r = { basis: quer(-BP_LEHNE), neigung: 0 }, R = rumpfRahmen(r);
        const hub = mix(0, bpHub(BP_OBEN), t);
        const fuss = seiten((s, sg) => bpFuss0(sg).add(BP_SCHIENE.clone().multiplyScalar(hub)));
        const zehen = BP_PLATTE_OBEN.clone(), aussen = Math.tan(12 * RAD);
        const pose = { becken: BP_BECKEN.clone(), rumpf: r, kopf: { neigung: 18 }, fuss,
          fussFlaeche: seiten(() => BP_SCHIENE.clone().negate()), fussRicht: seiten((s, sg) => zehen.clone().add(V(sg * aussen, 0, 0))),
          kniePol: seiten((s, sg) => BP_PLATTE_OBEN.clone().add(V(sg * 0.22, 0, 0))),
          // Hände an den Griffen neben dem Sitz (Neutralgriff: Handflächen zum Körper)
          hand: seiten((s, sg) => BP_BECKEN.clone().add(V(sg * 0.34, 0, 0)).add(R.oben.clone().multiplyScalar(Math.cos(35 * RAD) * 0.02)).add(R.vor.clone().multiplyScalar(0.02)).add(V(0, 0.012, 0.06))),
          handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.6, 0, -1)) };
        if (o.einbeinig) { pose.fuss.r = V(-0.26, FY, 0.2); pose.fussFlaeche.r = V(0, 1, 0); pose.fussRicht.r = V(-0.15, 0, 1); pose.kniePol.r = V(-0.2, 0.3, 1); }   // rechtes Bein ruht unten neben dem Sitz
        return { pose, props(g, z) { z.schlitten.position.copy(bpPlatte(hub)); } };
      }
      const becken = band ? V(0, 0.55, -0.1) : SM_BECKEN.clone();
      const r = band ? { neigung: 4 } : { ...SM_RUMPF };
      let fuss, kpol = seiten((s, sg) => V(0, 1, 0.3)), fussRicht, fussFlaeche;
      // Hände an den Griffen neben dem Sitz (Neutralgriff)
      const hand = band ? seiten((s, sg) => becken.clone().add(V(sg * 0.27, -0.02, 0.05))) : seiten((s, sg) => V(sg * 0.3, 0.6, -0.05));
      if (art === 'strecker' || art === 'beuger_sitzend') {
        const w0 = (art === 'strecker' ? mix(90, -3, t) : mix(5, 100, t)) * RAD;   // Beinstrecker: oben ganz gestreckt
        const w = (s) => o.einbeinig && s === 'r' ? (art === 'strecker' ? 90 : 5) * RAD : w0;
        fuss = seiten((s, sg) => V(sg * 0.11, SM_KNIE.y - Math.sin(w(s)) * MASS.unterschenkel, SM_KNIE.z + Math.cos(w(s)) * MASS.unterschenkel));
        fussRicht = seiten((s) => V(0, Math.cos(w(s)), Math.sin(w(s))));
      } else if (band) {
        // Füße stehen fest, Knie drücken gegen das Band nach außen
        fuss = seiten((s, sg) => V(sg * 0.17, FY, 0.42));
        kpol = seiten((s, sg) => V(sg * mix(0.15, 1.3, t), 1, 0.5));
      } else {
        // Oberschenkel fast waagerecht, im Winkel a gespreizt; Unterschenkel hängen zur Fußraste
        const a = (art === 'adduktoren' ? mix(42, 8, t) : mix(8, 40, t)) * RAD;
        const K = smKnie(a);
        fuss = seiten((s, sg) => K[s].clone().add(V(0, -0.415, 0.13).setLength(MASS.unterschenkel * 0.995)));
        kpol = seiten((s, sg) => V(sg * Math.sin(a), 0.35, Math.cos(a)));
        fussRicht = seiten((s, sg) => V(sg * Math.sin(a) * 0.6, 0, 1)); fussFlaeche = seiten(() => V(0, 1, 0));
      }
      return { pose: { becken, rumpf: r, fuss, fussRicht, fussFlaeche, kniePol: kpol, hand, handflaeche: band ? undefined : seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)) },
        props(g, z) {
          if (z.hebel) hebelStellen(z, g, 'l', art === 'strecker' ? (phi) => 0.24 * Math.max(0, Math.min(1, phi / 93)) : (phi) => 0.24 * Math.max(0, Math.min(1, (85 - phi) / 95)));
          if (z.band) seil(z.band, g.knie.l.clone().add(V(0.06, 0.02, -0.03)), g.knie.r.clone().add(V(-0.06, 0.02, -0.03)));
          if (z.pad_l) {
            let spreiz = 0;
            for (const [s, sg] of [['l', 1], ['r', -1]]) {
              const td = g.knie[s].clone().sub(g.huefte[s]).setY(0).normalize(), aussen = V(sg * td.z, 0, -sg * td.x);
              const pad = g.knie[s].clone().sub(td.clone().multiplyScalar(0.05)).add(aussen.clone().multiplyScalar(art === 'abduktoren' ? 0.11 : -0.11));
              z['pad_' + s].position.copy(pad); z['pad_' + s].quaternion.copy(basisAus(V(0, 1, 0), td));
              const dreh = V(sg * 0.13, 0.36, 0.14);
              seil(z['arm_' + s], dreh, pad.clone().sub(V(0, 0.1, 0)));
              const raste = g.knoechel[s].clone().add(V(0, -0.085, 0.03));
              seil(z['raste_' + s], raste.clone().sub(V(0.07, 0, 0)), raste.clone().add(V(0.07, 0, 0)));
              seil(z['rarm_' + s], dreh, raste);
              spreiz += Math.abs(Math.atan2(td.x, td.z)) / 2;
            }
            if (z.block) z.block.heben(0.3 * Math.abs(spreiz - (art === 'adduktoren' ? 42 : 8) * RAD));
          }
        } };
    },
    blick: V(0, 0.6, 0.1), abstand: 3.0, kameraRicht: V(1, 0.4, 0.35)
  };
}
// Sitzende Beinmaschinen (Beinstrecker, Beinbeuger sitzend, Adduktoren, Abduktoren): Becken, Rumpf 8° zurückgelehnt, Kniegelenk
// (= Drehachse beim Beinstrecker/-beuger), Hebel an der rechten Außenseite (x = SM_HEBEL_X)
const SM_BECKEN = V(0, 0.64, -0.12), SM_RUMPF = { neigung: -8 }, SM_KNIE = V(0, 0.58, 0.338), SM_HEBEL_X = 0.31;
// Liegender Beinbeuger: Becken und Kniegelenk (Drehachse)
const BL_BECKEN = V(0, 0.76, 0.18), BL_KNIE = V(0, 0.72, 0.18 + MASS.oberschenkel);
// Knie bei Adduktoren/Abduktoren: Oberschenkel im Winkel a gespreizt, fast waagerecht
function smKnie(a) {
  const R = rumpfRahmen(SM_RUMPF);
  return seiten((s, sg) => SM_BECKEN.clone().sub(R.oben.clone().multiplyScalar(0.02)).add(V(sg * MASS.hueftBreite, 0, 0)).add(V(sg * Math.sin(a), -0.05, Math.cos(a)).setLength(MASS.oberschenkel)));
}
// Sitz, Rückenpolster, Griffe neben dem Sitz, Gewichtsblock links daneben
function sitzmaschineBauen(ger, z) {
  const R = rumpfRahmen(SM_RUMPF);
  bodenrahmen(ger, -0.32, 0.32, -0.62, 0.3);
  sitzSaeule(ger, V(0, 0.515, 0.0), 0.44, 0.5);
  ger.polster(0.44, 0.62, 0.09, SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.35)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
  ger.vierkant(V(0, 0.05, -0.55), SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.33)).sub(R.vor.clone().multiplyScalar(0.23)), 0.07);
  for (const sx of [-1, 1]) {
    ger.vierkant(V(sx * 0.3, 0.05, -0.05), V(sx * 0.3, 0.585, -0.05), 0.045);
    griffRohr(ger, V(sx * 0.3, 0.6, -0.19), V(sx * 0.3, 0.6, 0.09));
  }
  z.block = gewichtsblock(ger, V(-0.8, 0, -0.25), V(1, 0, 0));
}
// Hebel mit Drehachse P (Achse X) am Kniegelenk: Arm am Schienbein entlang, Querrohr, Schaumstoffrolle über dem Knöchel,
// seite = +1 vor dem Schienbein (Beinstrecker; beim liegenden Beinbeuger oben = hinten am Bein), -1 dahinter (Beinbeuger sitzend)
function hebelBauen(ger, z, P, seite, einbeinig) {
  ger.vierkant(V(P.x, 0.05, P.z), P.clone().sub(V(0, 0.05, 0)), 0.07);
  drehlager(ger, P);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = 0.385, rz = seite * 0.085, rx = einbeinig ? 0.11 : 0, rl = einbeinig ? 0.17 : 0.36;
  rohrIn(ger, z.hebel, V(0, 0, 0), V(0, -L, rz), 0.055);
  rohrIn(ger, z.hebel, V(0, -L, rz), V(rx + rl / 2 - P.x + 0.01, -L, rz), 0.04);
  rollePolster(ger, rl, 0.048, z.hebel).position.set(rx - P.x, -L, rz);
}
// Hebel dreht so, dass er am Schienbein der Seite s anliegt; heben(phi) = Hub des Gewichtsblocks aus dem Winkel (Grad, 0 = Schienbein senkrecht nach unten)
function hebelStellen(z, g, s, heben) {
  const d = g.knoechel[s].clone().sub(g.knie[s]); d.x = 0; d.normalize();
  z.hebel.quaternion.setFromUnitVectors(V(0, -1, 0), d);
  if (z.block) z.block.heben(heben(Math.atan2(d.z, -d.y) / RAD));
}
// Hackenschmidt: Fußplattform vorne 12° höher, Schienen hinter dem Rücken (HACK Grad zurückgelehnt), Schlitten mit Rückenpolster,
// Schulterpolstern, Griffen und Hörnern mit Scheiben; der Schlitten fährt mit dem Becken
const HACK_PLATTFORM = V(0, Math.cos(12 * RAD), -Math.sin(12 * RAD));
function hackBauen(ger, z, hw) {
  const u = V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor = V(0, Math.sin(hw * RAD), Math.cos(hw * RAD)), X = V(1, 0, 0);
  bodenrahmen(ger, -0.42, 0.42, -1.3, 0.66);
  ger.box(0.72, 0.05, 0.58, V(0, 0.08, 0.32), ger.mRahmen, -12);
  ger.box(0.66, 0.012, 0.52, V(0, 0.08, 0.32).add(HACK_PLATTFORM.clone().multiplyScalar(0.031)), ger.mGummi, -12);
  for (const sx of [-1, 1]) ger.vierkant(V(sx * 0.3, 0.05, 0.32), V(sx * 0.3, 0.07, 0.32), 0.06);
  const A = (sx) => HACK_FUSS.clone().sub(vor.clone().multiplyScalar(0.3)).add(X.clone().multiplyScalar(sx * 0.3)).sub(u.clone().multiplyScalar(0.12));
  const B = (sx) => A(sx).add(u.clone().multiplyScalar(2.05));
  for (const sx of [-1, 1]) {
    ger.vierkant(A(sx), B(sx), 0.075);
    ger.stab(A(sx).add(vor.clone().multiplyScalar(0.05)), B(sx).add(vor.clone().multiplyScalar(0.05)), 0.012, ger.mMetall);
    ger.vierkant(V(sx * 0.3, 0.05, A(sx).z), A(sx), 0.07);
    ger.vierkant(V(sx * 0.36, 0.05, B(sx).z), B(sx), 0.075);
  }
  ger.vierkant(B(-1), B(1), 0.07);
  // Schlitten im Becken-Rahmen (X quer, Y = u entlang der Schienen, Z = vor)
  const sch = new THREE.Group(); sch.quaternion.copy(basisAus(u, vor));
  maschTeil(sch, rundGeo(0.42, 0.72, 0.07, 0.028, 3), ger.mPolster, 0, 0.3, -0.17);
  maschTeil(sch, rundGeo(0.62, 0.8, 0.05, 0.01, 1), ger.mRahmen, 0, 0.32, -0.235);
  for (const sx of [-1, 1]) {
    maschTeil(sch, rundGeo(0.13, 0.08, 0.22, 0.03, 3), ger.mPolster, sx * 0.2, 0.47 + 0.075, 0.0);
    rohrIn(ger, sch, V(sx * 0.2, 0.47 + 0.11, -0.12), V(sx * 0.2, 0.47 + 0.11, -0.235), 0.05);
    griffRohr(ger, V(sx * 0.325, 0.57, 0.02), V(sx * 0.325, 0.57, 0.17), sch);
    rohrIn(ger, sch, V(sx * 0.325, 0.57, 0.02), V(sx * 0.3, 0.55, -0.235), 0.035);
    for (const y of [0.05, 0.6]) maschTeil(sch, rundGeo(0.1, 0.14, 0.09, 0.01, 1), ger.mRahmen, sx * 0.3, y, -0.265);
    const horn = maschTeil(sch, new THREE.CylinderGeometry(0.025, 0.025, 0.28, 20), ger.mMetall, sx * 0.47, 0.08, -0.265); horn.rotation.z = Math.PI / 2;
    for (const [i, x] of [[0, 0.4], [1, 0.455]]) maschTeil(sch, scheibenGeo(i ? 0.2 : 0.225, 0.05), ger.mScheibe, sx * x, 0.08, -0.265).rotation.z = Math.PI / 2;
  }
  ger.gruppe.add(sch);
  z.hackSchlitten = sch;
  return z;
}

/* =================================================================== */
/* Drücken                                                              */
/* =================================================================== */

// Bankdrücken & Fliegende im Liegen. last: langhantel | kurzhanteln | maschine | multipresse | sz ; neigung: 0 | 30 | -15 ; griff: normal | eng ; art: druecken | fliegende | ueberzug | stirn | boden
// Neu: einarmig (nur links eine Kurzhantel) ; griff neutral (Hammergriff, Ellbogen näher am Körper)
export function bankdruecken(o = {}) {
  const last = o.last || 'langhantel', neig = o.neigung || 0, art = o.art || 'druecken', boden = art === 'boden' || o.boden;
  // Schräg-Brustpresse (last maschine): Griffe laufen auf dem Bogen der Hebel (Drehachse hinter der Lehne), unten vor der oberen Brust
  const schraegBahn = () => {
    const becken = V(0, 0.58, 0.28), r = { basis: quer(-90 + neig), neigung: 0 }, k = rumpf(becken, r), breit = 0.33;
    const h0 = (s, sg) => k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.12)).add(k.R.vor.clone().multiplyScalar(0.19)).add(k.R.links.clone().multiplyScalar(sg * breit));
    const h1 = (s, sg) => k.schulter[s].clone().add(k.R.links.clone().multiplyScalar(sg * (breit - MASS.schulterBreite))).add(V(0, ARM * 0.995, 0));
    return { becken, r, h0, h1, C: bogenMitte(h0('l', 1), h1('l', 1), { z: becken.z - 0.95 }) };
  };
  return {
    aufbau(ger) {
      const z = {};
      if (boden) ger.matte();
      else if (last === 'maschine') { /* Sitz und Lehne gehören zur Maschine */ }
      else if (neig > 0) { ger.box(0.3, 0.07, 0.4, V(0, 0.43, 0.32), ger.mPolster); ger.box(0.3, 0.07, 0.8, V(0, 0.43 + Math.sin(neig * RAD) * 0.4, 0.12 - 0.4 - Math.cos(neig * RAD) * 0.4 + 0.4), ger.mPolster, -neig); ger.box(0.06, 0.43, 0.06, V(0, 0.215, 0), ger.mRahmen); }
      else ger.bank(-0.05, 1.2, neig < 0 ? 0.5 : 0.43, neig);
      if (last === 'langhantel' || last === 'sz' || last === 'multipresse') z.lh = last === 'sz' ? ger.sz() : ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'ueberzug' && !o.einarmig);   // Überzug: eine Hantel mit beiden Händen
      if (last === 'maschine') { const sp = schraegBahn(); drueckmaschineBauen(ger, z, sp.becken, sp.r, sp.C, 'quer'); }   // Schräg-Brustpresse
      return z;
    },
    pose(t) {
      const hoehe = boden ? 0.13 : 0.565;
      const winkel = boden ? 0 : neig;
      const becken = boden ? V(0, 0.13, 0.32) : neig > 0 ? V(0, 0.58, 0.28) : V(0, hoehe + (neig < 0 ? 0.05 : 0), 0.3);
      const r = { basis: quer(-90 + winkel), neigung: 0 };
      const k = rumpf(becken, r);
      // Griff: normal etwa 1,5 × Schulterbreite (Unterarme unten senkrecht), eng knapp schulterbreit
      const breit = o.griff === 'eng' ? 0.17 : o.griff === 'neutral' ? 0.29 : last === 'kurzhanteln' ? 0.37 : 0.33;
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const sch = k.schulter[s];
        const brustOben = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.14)).add(k.R.vor.clone().multiplyScalar(0.14));
        if (art === 'fliegende') {
          const w = mix(15, 85, t) * RAD;  // 15° = Arme weit offen, 85° = über der Brust
          hand[s] = sch.clone().add(k.R.vor.clone().multiplyScalar(Math.sin(w) * ARM * 0.985)).add(k.R.links.clone().multiplyScalar(sg * Math.cos(w) * ARM * 0.985));   // Ellbogen leicht gebeugt (10–30°)
          epol[s] = k.R.vor.clone().multiplyScalar(-0.3).add(k.R.oben.clone().multiplyScalar(-0.2)).add(k.R.links.clone().multiplyScalar(sg));
        } else if (art === 'ueberzug') {
          const w = mix(150, 85, t) * RAD;
          const innen = last === 'kurzhanteln' ? 0.145 : 0.12;   // eine Hantel: Hände fast zusammen
          hand[s] = sch.clone().add(k.R.links.clone().multiplyScalar(-sg * innen)).add(k.R.vor.clone().multiplyScalar(Math.sin(w) * ARM * 0.95)).add(k.R.oben.clone().multiplyScalar(-Math.cos(w) * ARM * 0.95));
          epol[s] = k.R.links.clone().multiplyScalar(sg);
        } else if (art === 'stirn') {
          const w = mix(140, 5, t) * RAD; // Ellbogen fest über der Schulter, Unterarm klappt
          const ell = sch.clone().add(k.R.vor.clone().multiplyScalar(MASS.oberarm * 0.95)).add(k.R.oben.clone().multiplyScalar(0.06)).add(k.R.links.clone().multiplyScalar(-sg * 0.06));
          hand[s] = genau(ell.clone().add(k.R.vor.clone().multiplyScalar(Math.cos(w) * UNTERARM)).add(k.R.oben.clone().multiplyScalar(Math.sin(w) * UNTERARM)));
          epol[s] = k.R.vor.clone().add(k.R.oben.clone().multiplyScalar(-0.5));
        } else {
          // Unten berührt die Stange die untere Brust (Brustbein), oben Arme gestreckt über den Schultern
          // Schrägbank: obere Brust; Kurzhanteln unten etwas höher (Oberarm kaum unter der Bankebene); oben senkrecht über der Schulter
          const brustUnten = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(neig > 10 ? 0.12 : neig < 0 ? 0.25 : 0.2)).add(k.R.vor.clone().multiplyScalar(0.14));
          const unten = brustUnten.add(k.R.links.clone().multiplyScalar(sg * breit)).add(k.R.vor.clone().multiplyScalar(boden ? 0.12 : last === 'kurzhanteln' ? 0.18 : 0.05));   // Bodendrücken: Oberarme liegen unten auf dem Boden auf
          const oben = sch.clone().add(k.R.links.clone().multiplyScalar(sg * (breit - MASS.schulterBreite))).add(V(0, ARM * 0.995, 0));
          hand[s] = mv(unten, oben, t);
          const eng = o.griff === 'eng' || o.griff === 'neutral';
          // Ellbogen unter der Stange (Unterarm senkrecht) und etwa 45–70° vom Körper, nicht seitlich ausgestellt
          epol[s] = k.R.links.clone().multiplyScalar(sg * (o.griff === 'eng' ? 0.3 : o.griff === 'neutral' ? 0.75 : 0.55)).add(V(0, -1, 0)).add(k.R.oben.clone().multiplyScalar(eng ? -0.7 : -0.45));
          if (o.griff === 'neutral') flaeche[s] = k.R.links.clone().multiplyScalar(-sg);
        }
      }
      if (last === 'maschine' && art === 'druecken') { const sp = schraegBahn(); for (const [s, sg] of [['l', 1], ['r', -1]]) hand[s] = bogenHand(sp.h0(s, sg), sp.h1(s, sg), sp.C, t); }
      // Einarmig: rechte Hand liegt auf dem Bauch
      if (o.einarmig) { hand.r = becken.clone().add(k.R.vor.clone().multiplyScalar(0.14)).add(k.R.oben.clone().multiplyScalar(0.12)).add(k.R.links.clone().multiplyScalar(-0.05)); epol.r = k.R.links.clone().multiplyScalar(-1); }
      const fuss = boden ? seiten((s, sg) => V(sg * 0.18, FY, 0.75)) : seiten((s, sg) => V(sg * 0.3, FY, 0.78));
      return {
        pose: { becken, rumpf: r, kopf: { neigung: 0 }, hand, ellbogenPol: epol, handflaeche: flaeche, fuss, kniePol: seiten((s, sg) => V(sg * 0.3, 1, 0.3)) },
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (last === 'kurzhanteln' && art === 'ueberzug') {
            // Hantel senkrecht zwischen den Händen, obere Scheibe liegt in den Handflächen
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), sm = g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5);
            const achse = mitte.clone().sub(sm).normalize();
            hantelAn(z.kh_l, mitte.add(achse.clone().multiplyScalar(0.1)), achse);
          } else if (last === 'kurzhanteln') kurzhantelnAn(z, g, art === 'fliegende' || o.griff === 'neutral' ? 'hammer' : 'quer');
          if (z.dm) drueckmaschineStellen(z, g, t);
        }
      };
    },
    blick: V(0, 0.65, 0.05), abstand: 3.3, kameraRicht: V(1, 0.6, 0.45)
  };
}

// Liegestütz-Familie. art: normal | knie | wand | schraeg (Hände erhöht) | erhoeht (Füße erhöht) | eng | band
//   | archer | einarmig | einarmig_erhoeht | pseudo_planche | pike | pike_erhoeht | handstand | handstand_liegestuetz
// Neu: defizit (Hände auf Blöcken, Brust tiefer) | plyo (Hände lösen sich oben) | schulterblatt (Arme gestreckt, nur Schulterblätter)
export function liegestuetz(o = {}) {
  const art = o.art || 'normal';
  if (['archer', 'einarmig', 'einarmig_erhoeht', 'pseudo_planche'].includes(art)) return liegestuetzSchwer(art);
  if (['pike', 'pike_erhoeht', 'handstand', 'handstand_liegestuetz'].includes(art)) return kopfueber(art);
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'wand') ger.box(1.4, 2.0, 0.06, V(0, 1.0, 0.98), ger.mRahmen);
      if (art === 'schraeg') ger.bank(0.72, 0.4, 0.45, 0);
      if (art === 'erhoeht') ger.bank(-0.82, 0.45, 0.42, 0);
      if (art !== 'wand') ger.matte();
      if (art === 'band') for (const n of ['b1', 'b2', 'b3']) z[n] = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand);
      if (art === 'defizit') for (const sx of [-1, 1]) ger.box(0.12, 0.1, 0.2, V(sx * 0.24, 0.05, 0.42), ger.mScheibe);
      return z;
    },
    pose(t) {
      // Körper als Brett um den Drehpunkt (Füße oder Knie); Hände stehen fest
      const handZ = art === 'wand' ? 0.94 : art === 'schraeg' ? 0.72 : 0.42;
      const flug = art === 'plyo' ? 0.13 * glatt((t - 0.72) / 0.28) : 0;   // explosiv: Hände heben oben kurz ab
      // Wand: Schulter liegt auf einem Kreis um die Füße (Körper als Brett), Hände etwa 12 cm unter der Schulter (Brusthöhe)
      const LW = MASS.rumpf - 0.01 + BEIN * 0.985, wandFuss = 0.2, wandSch = (d) => FY + Math.sqrt(LW * LW - (0.94 - d - wandFuss) ** 2);
      const handY = (art === 'wand' ? wandSch(0.25) - 0.12 : art === 'schraeg' ? 0.5 : art === 'defizit' ? 0.14 : 0.04) + flug;
      const breit = art === 'eng' ? 0.13 : 0.24;
      const fussPunkt = art === 'wand' ? V(0, FY, wandFuss) : art === 'erhoeht' ? V(0, 0.5, -0.98) : art === 'knie' ? V(0, 0.06, -0.46) : art === 'defizit' || art === 'plyo' ? V(0, 0.11, -0.92) : V(0, 0.11, -0.95);
      // Schulterhöhe über der Hand: oben Armlänge, unten knapp über Hand
      // Oben Arme gestreckt, unten Brust knapp über dem Boden
      const abstandOben = STUETZ * 0.997, abstandUnten = art === 'wand' ? 0.25 : art === 'defizit' ? 0.11 : art === 'schulterblatt' ? STUETZ * 0.97 : art === 'erhoeht' ? 0.21 : art === 'knie' ? 0.16 : 0.155;   // Brust berührt fast den Boden (breiter Körper: nicht tiefer)
      const schulterMitte = V(0, handY, handZ).add(V(0, 0, 0));
      const hoch = mix(abstandUnten, abstandOben, t);
      // Schulter liegt auf der Linie von der Hand senkrecht zum Körper (vereinfacht: über der Hand, Richtung weg von der Wand)
      let sch;
      if (art === 'wand') sch = V(0, wandSch(hoch), handZ - hoch);
      // Knie-Liegestütz: Knie bis Schulter bleibt eine Linie und dreht um die Knie (Knie bleiben am Boden)
      else if (art === 'knie') { const L = MASS.oberschenkel + MASS.rumpf - 0.01, y = handY + hoch; sch = V(0, y, fussPunkt.z + Math.sqrt(L * L - (y - fussPunkt.y) ** 2)); }
      // Hände erhöht: Körper schräg, Füße so nah, dass die Beine gestreckt bleiben
      else if (art === 'schraeg') { const bahn = schulterBahn(V(0, handY, handZ), fussPunkt.y, 0.09, abstandUnten, abstandOben, t); sch = bahn.sch; fussPunkt.z = bahn.fussZ; }
      // Defizit und explosiv: Körper bleibt ein Brett und dreht um die Füße (Hände höher, Brust tiefer)
      else if (art === 'defizit' || art === 'plyo') { const L = MASS.rumpf + BEIN * 0.97 - 0.01, y = handY + hoch; sch = V(0, y, fussPunkt.z + Math.sqrt(L * L - (y - fussPunkt.y) ** 2)); }
      // Sonst: Körper bleibt ein gerades Brett und dreht um die Füße (Abstand Fuß–Schulter fest)
      else { const L = MASS.rumpf - 0.01 + BEIN * 0.985, y = handY + hoch; sch = V(0, y, fussPunkt.z + Math.sqrt(L * L - (y - fussPunkt.y) ** 2)); }
      const vonFuss = sch.clone().sub(fussPunkt);
      const laenge = vonFuss.length();
      const richt = vonFuss.clone().normalize();
      // Becken liegt auf der Linie Fuß→Schulter
      const rumpfL = MASS.rumpf - 0.03;
      const becken = sch.clone().sub(richt.clone().multiplyScalar(rumpfL));
      // Bauch zeigt nach unten (an der Wand: zur Wand)
      const r = { basis: basisAus(richt, art === 'wand' ? V(0, 0, 1) : V(0, -1, 0)), neigung: 0 };
      const hand = seiten((s, sg) => V(sg * breit, handY, handZ));
      const flach = seiten(() => (art === 'wand' ? V(0, 0, -1) : V(0, 1, 0)));   // Hände flach auf Boden, Bank, Blöcken oder an der Wand
      // Ellbogen etwa 45° vom Körper; an der Wand zeigen sie nach unten-hinten
      const epol = seiten((s, sg) => (art === 'wand' ? V(sg * 0.5, -1, -0.7) : V(sg * (art === 'eng' ? 0.2 : art === 'erhoeht' ? 0.15 : 0.7), 0.5, -1)));
      let fuss, kpol;
      if (art === 'knie') {
        fuss = seiten((s, sg) => V(sg * 0.1, 0.22, -0.86));
        kpol = seiten(() => V(0, -1, 0));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, flach, ellbogenPol: epol, fuss, kniePol: kpol, fussRicht: seiten(() => V(0, 0.3, -1)) } };
      }
      fuss = seiten((s, sg) => fussPunkt.clone().add(V(sg * 0.09, 0, 0)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, flach, ellbogenPol: epol, fuss, kniePol: seiten(() => art === 'wand' ? V(0, 0, 1) : V(0, -1, 0)), fussRicht: seiten(() => art === 'wand' ? V(0, 0, 1) : V(0, -1, 0.2)), zehen: seiten(() => art === 'wand' ? 25 : 0) },
        props(g, z) {
          // Band läuft von Hand zu Hand über den oberen Rücken
          if (!z.b1) return;
          const ruecken = (s) => g.schulter[s].clone().sub(g.R.vor.clone().multiplyScalar(0.07)).add(g.R.oben.clone().multiplyScalar(-0.04));
          seil(z.b1, g.hand.l, ruecken('l')); seil(z.b2, ruecken('l'), ruecken('r')); seil(z.b3, ruecken('r'), g.hand.r);
        } };
    },
    blick: V(0, 0.45, 0), abstand: 3.4, kameraRicht: V(1, 0.35, 0.3), dauer: art === 'plyo' ? [0.4, 0.2, 0.9, 0.2] : art === 'schulterblatt' ? [0.8, 0.3, 0.8, 0.3] : undefined
  };
}

// Körper als Brett von einem Stützpunkt (Füße/Knie) zur Schultermitte, Bauch nach unten
function brettPose(stuetz, schulterMitte, bauch = V(0, -1, 0)) {
  const richt = schulterMitte.clone().sub(stuetz).normalize();
  const becken = schulterMitte.clone().sub(richt.clone().multiplyScalar(MASS.rumpf - 0.03));
  return { becken, richt, r: { basis: basisAus(richt, bauch), neigung: 0 } };
}
// Schulterweg bei festen Füßen: Abstand L zu den Knöcheln (Körper als Brett), Abstand d zu den Händen.
// Die Füße stehen so, dass die Schulter unten genau über den Händen ist; liefert Schultermitte und Fuß-z.
function schulterBahn(hand, fussY, fussBreit, dUnten, dOben, t) {
  const L = MASS.rumpf - 0.01 + Math.sqrt((BEIN * 0.985) ** 2 - (fussBreit - MASS.hueftBreite) ** 2);
  const unten = V(0, hand.y + dUnten, hand.z - 0.03);
  const F = V(0, fussY, unten.z - Math.sqrt(L * L - (unten.y - fussY) ** 2));
  const d = mix(dUnten, dOben, t);
  const dy = hand.y - F.y, dz = hand.z - F.z, D = Math.hypot(dy, dz);
  const a = (L * L - d * d + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L * L - a * a));
  return { sch: V(0, F.y + (a * dy + h * dz) / D, F.z + (a * dz - h * dy) / D), fussZ: F.z };
}

// Schwere Liegestütze: Archer, einarmig, Pseudo-Planche
function liegestuetzSchwer(art) {
  const erhoeht = art === 'einarmig_erhoeht';
  return {
    aufbau(ger) { ger.matte(); if (erhoeht) ger.bank(0.62, 0.45, 0.45, 0); return {}; },
    pose(t) {
      const handY = erhoeht ? 0.5 : 0.04, handZ = erhoeht ? 0.62 : 0.42;
      let hand, sch, epol, fussBreit = 0.09, fussZ = art === 'pseudo_planche' ? -1.12 : -0.95;
      if (art === 'archer') {
        hand = { l: V(0.5, handY, handZ), r: V(-0.5, handY, handZ) };
        const x = mix(-0.24, 0, t), hoch = mix(0.22, Math.sqrt((STUETZ * 1.0) ** 2 - 0.31 ** 2), t);
        sch = V(x, handY + hoch, handZ - 0.03);
        epol = { l: V(0.3, 1, 0), r: V(-1, 0.3, -0.6) };
        fussBreit = 0.2;
      } else if (art === 'pseudo_planche') {
        const hz = 0.05;
        hand = seiten((s, sg) => V(sg * 0.24, handY, hz));
        sch = V(0, handY + mix(0.22, Math.sqrt((STUETZ * 0.96) ** 2 - 0.2 ** 2), t), hz + 0.2);
        epol = seiten((s, sg) => V(sg * 0.3, 0.3, -1));
      } else {
        // einarmig: rechte Hand unter der Brust, linke Hand auf dem Rücken, Füße weit
        hand = { r: V(-0.1, handY, handZ) };
        fussBreit = 0.32;
        const bahn = schulterBahn(hand.r, 0.11, fussBreit, 0.27, STUETZ * 0.94, t);
        sch = bahn.sch.setX(0.02); fussZ = bahn.fussZ;
        epol = { r: V(-0.6, 0.3, -1), l: V(1, 1, 0) };
      }
      const stuetz = V(0, 0.11, fussZ);
      const b = brettPose(stuetz, sch);
      if (!hand.l) hand.l = b.becken.clone().add(V(0.06, 0.15, -0.02));
      return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -10 }, hand, ellbogenPol: epol, fuss: seiten((s, sg) => stuetz.clone().add(V(sg * fussBreit, 0, 0))),
        kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -1, 0.2)) } };
    },
    blick: V(0, 0.45, 0), abstand: 3.4, kameraRicht: V(1, 0.4, 0.3)
  };
}

// Kopfüber: Pike-Liegestütz, Handstand an der Wand (halten oder drücken)
function kopfueber(art) {
  const pike = art.startsWith('pike'), stand = art.startsWith('handstand');
  return {
    aufbau(ger) {
      ger.matte();
      if (art === 'pike_erhoeht') ger.box(0.5, 0.45, 0.4, V(0, 0.225, -0.5), ger.mPolster);
      if (stand) ger.box(1.4, 2.4, 0.08, V(0, 1.2, 0.0), ger.mRahmen);
      return {};
    },
    pose(t) {
      let sch, oben, fuss, handZ = 0.42, kopf = 15;
      if (art === 'pike') {
        sch = mv(V(0, 0.3, 0.44), V(0, 0.62, 0.38), t);   // oben Arme gestreckt
        oben = mv(V(0, -0.6, 0.8), V(0, -0.42, 0.91), t);
        fuss = seiten((s, sg) => V(sg * 0.1, 0.11, -0.66));
      } else if (art === 'pike_erhoeht') {
        sch = mv(V(0, 0.36, 0.45), V(0, 0.55, 0.38), t);   // unten: Scheitel tippt den Boden gerade an (Rumpf fast senkrecht)
        oben = mv(V(0, -0.97, 0.25), V(0, -0.98, 0.17), t);
        fuss = seiten((s, sg) => V(sg * 0.1, 0.45 + FY, -0.45));
      } else {
        // Bauch zur Wand: Wand bei z = 0, Hände 0,3 m davor
        handZ = 0.3;
        const tief = art === 'handstand' ? 0.02 * (1 - t) : mix(0.225, 0, t);   // unten: Scheitel knapp über dem Boden
        sch = V(0, 0.04 + STUETZ * 0.96 - tief, handZ + 0.02);
        // Füße lehnen an der Wand: Körper kippt mit den Füßen zur Wand
        oben = V(0, -1, 0.2 + (art === 'handstand' ? 0 : 0.1 * (1 - t)));
        fuss = null;
        kopf = 25;
      }
      const o = oben.clone().normalize();
      const becken = sch.clone().sub(o.clone().multiplyScalar(MASS.rumpf - 0.03));
      const r = { basis: basisAus(o, stand ? V(0, 0, -1) : V(0, -1, -0.4)), neigung: 0 };
      if (!fuss) fuss = seiten((s, sg) => becken.clone().sub(o.clone().multiplyScalar(BEIN * 0.96)).add(V(sg * 0.09, 0, 0)));
      const hand = seiten((s, sg) => V(sg * 0.22, 0.04, handZ));
      return { pose: { becken, rumpf: r, kopf: { neigung: kopf }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, 0.3, -1)),
        fuss, kniePol: seiten(() => stand ? V(0, 0, -1) : V(0, 0.3, 1)), fussRicht: seiten(() => stand ? V(0, 1, -0.6) : V(0, -0.4, 1)), zehen: seiten(() => (pike ? 35 : 0)) } };
    },
    blick: V(0, 0.8, 0.2), abstand: 3.6, kameraRicht: stand ? V(0.9, 0.2, 1) : V(1, 0.25, 0.35), dauer: art === 'handstand' ? STATISCH : undefined
  };
}

// Schulterpresse an der Maschine: Becken und Rumpf wie sitzendes Drücken; Griffe (Neutralgriff) auf dem Bogen um eine Drehachse hinten
const SP_BECKEN = V(0, 0.56, -0.08), SP_RUMPF = { neigung: -4 };
const spSchulter = (sg) => rumpf(SP_BECKEN, SP_RUMPF).schulter[sg > 0 ? 'l' : 'r'];
const spUnten = (sg) => spSchulter(sg).add(V(sg * 0.1, 0.08, 0.14)), spOben = (sg) => spSchulter(sg).add(V(sg * 0.07, ARM * 0.995, 0.02));
const SP_C = bogenMitte(spUnten(1), spOben(1), { z: -0.7 });
// Schulterdrücken. last: langhantel | kurzhanteln | maschine | kettlebell | band ; sitzend: bool ; art: druecken | arnold | landmine
// Neu: art pushpress (Langhantel, kurzer Kniestoß) ; last multipresse ; einarmig (links drückt, rechts an der Hüfte) ; boden (Z-Press, am Boden sitzend)
export function schulterdruecken(o = {}) {
  const last = o.last || 'kurzhanteln', art = o.art || 'druecken', sitzend = o.sitzend !== false && last !== 'langhantel' ? !!o.sitzend : false;
  const stange = last === 'langhantel' || last === 'multipresse', boden = !!o.boden;
  if (art === 'landmine') return landmine(o);
  return {
    aufbau(ger) {
      const z = {};
      if (sitzend && !boden && last !== 'maschine') { ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.05), ger.mPolster); ger.box(0.36, 0.7, 0.08, V(0, 0.85, -0.25), ger.mPolster, -5); }
      if (boden) ger.matte();
      if (stange) z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell' && o.einarmig) z.kb = ger.kettlebell();
      else if (last === 'kurzhanteln' || last === 'kettlebell') khAufbauen(ger, z, !o.einarmig);
      if (last === 'maschine') drueckmaschineBauen(ger, z, SP_BECKEN, SP_RUMPF, SP_C, 'laengs');
      if (last === 'band') { z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      return z;
    },
    pose(t) {
      const dip = art === 'pushpress' ? 0.08 * Math.sin(Math.PI * Math.min(1, t / 0.3)) : 0;   // Kniestoß am Anfang
      const becken = boden ? V(0, 0.12, -0.15) : sitzend ? V(0, 0.56, -0.08) : V(0, 0.975 - dip, 0);
      const r = { neigung: boden ? 2 : sitzend ? -4 : -2 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const sch = k.schulter[s];
        const breit = stange || last === 'maschine' ? 0.1 : 0.08;
        // Arnold: unten Hände vor dem Gesicht, Ellbogen vorn; oben wie normales Drücken
        // Unten: Stange vorn auf Schulterhöhe (Schlüsselbein), Hanteln seitlich etwa auf Ohrhöhe; oben Arme gestreckt über den Schultern
        const unten = art === 'arnold' ? sch.clone().add(V(-sg * 0.05, 0.12, 0.14)) : stange || last === 'maschine' ? sch.clone().add(V(sg * breit, 0.08, 0.14)) : sch.clone().add(V(sg * 0.17, 0.19, 0.13));
        const oben = sch.clone().add(V(sg * (breit - 0.03), ARM * 0.995, 0.02));
        hand[s] = last === 'maschine' ? bogenHand(spUnten(sg), spOben(sg), SP_C, t) : mv(unten, oben, t);
        // Ellbogen unten etwa 30–60° vor der Körperseite (Schulterblattebene), nicht ganz seitlich
        epol[s] = art === 'arnold' ? mv(V(sg * 0.15, -1, 1), V(sg, -1, 0.6), glatt(t * 1.4)) : V(sg, -1, last === 'maschine' ? 1.35 : stange ? 1.2 : 1.0);
      }
      if (o.einarmig) { hand.r = becken.clone().add(V(-0.17, 0.05, 0.06)); epol.r = V(-1, 0, -0.5); }
      const fuesse = boden ? { fuss: seiten((s, sg) => V(sg * 0.15, FY, -0.15 + BEIN * 0.97)), kniePol: seiten(() => V(0, 1, 0)), fussRicht: seiten((s, sg) => V(sg * 0.2, 1, 0.3)) }
        : sitzend ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.14);
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: last === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0))
          : art === 'arnold' ? seiten((s, sg) => { const w = Math.PI * glatt(Math.min(1, t * 1.4)); return V(-sg * Math.sin(w), 0, -Math.cos(w)); }) : undefined }, fuesse),
        props(g, z) {
          if (z.dm) drueckmaschineStellen(z, g, t);
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.kb) kettlebellAn(z.kb, g, 'l');
          if (z.kh_l && art === 'arnold') for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], faustAchse(g, s));
          else if (z.kh_l) kurzhantelnAn(z, g, 'quer');
          if (z.band_l) for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['band_' + s], V(sg * 0.14, 0.02, 0.06), g.hand[s]);
        }
      };
    },
    blick: V(0, 1.1, 0), abstand: 3.6, dauer: art === 'pushpress' ? [0.8, 0.4, 1.6, 0.5] : undefined
  };
}

// Landmine-Drücken: Stange steckt vorn im Boden, beide Hände drücken das Ende schräg nach vorn-oben
function landmine(o) {
  const anker = V(0, 0.03, 1.3), lang = 1.69;
  return {
    aufbau(ger) { const z = { stange: ger.zyl(0.022, 1, ger.mMetall) }; z.scheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28); ger.box(0.15, 0.06, 0.15, anker, ger.mRahmen); return z; },
    pose(t) {
      const w = mix(48.6, 62, t) * RAD;
      const ende = anker.clone().add(V(0, Math.sin(w) * lang, -Math.cos(w) * lang));
      const becken = V(0, 0.96, -0.05);
      const r = { neigung: 12 };
      const hand = seiten((s, sg) => ende.clone().add(V(sg * 0.035, -0.02, 0)));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.6, -1, 0)), fuss: { l: V(0.13, FY, 0.25), r: V(-0.13, FY, -0.3) }, zehen: { l: 0, r: 30 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) {
          const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          seil(z.stange, anker, m.clone().add(m.clone().sub(anker).normalize().multiplyScalar(0.1)));
          z.scheibe.position.copy(m).lerp(anker, 0.12); z.scheibe.quaternion.setFromUnitVectors(V(0, 1, 0), m.clone().sub(anker).normalize());
        } };
    },
    blick: V(0, 1.0, 0.3), abstand: 3.6, kameraRicht: V(1, 0.3, 0.4)
  };
}

// Heben für die Schulter: art: seitheben | frontheben | reverse_fly | ytw ; last: kurzhanteln | kabel | maschine | band ; vorgebeugt: bool ; sitzend ; brustgestuetzt: bool (Schrägbank)
// Neu: art aufrecht (aufrechtes Rudern, Kabel vorn unten) | y (Y-Heben, zwei Kabel überkreuzt) ; last scheibe (Frontheben mit Hantelscheibe) ; angelehnt (Seitheben einarmig, rechts am Pfosten)
export function schulterheben(o = {}) {
  const art = o.art || 'seitheben', last = o.last || 'kurzhanteln';
  const yKabel = art === 'y' && last === 'kabel', angelehnt = !!o.angelehnt;
  if (art === 'reverse_fly' && last === 'maschine' && !o.brustgestuetzt) return schulterzug({ art: 'reverse_butterfly' });
  const SH_BECKEN = V(0, 0.56, -0.05), SH_RUMPF = { neigung: 2 };   // Seitheben-Maschine: sitzend, aufrecht
  const vorgebeugt = art === 'reverse_fly' && !o.brustgestuetzt;
  const maschine = art === 'seitheben' && last === 'maschine';   // Seitheben-Maschine: sitzend, Polster außen am Oberarm
  const sitzend = (!!o.sitzend || maschine) && !vorgebeugt && !o.brustgestuetzt;
  return {
    aufbau(ger) {
      const z = {};
      if (maschine) {
        // Sitz, Rückenpolster, Säule; Drehachsen (vorn-hinten) hinter den Schultergelenken, Hebel außen am Oberarm, Polster vor dem Ellbogen, Griff vorn
        const k = rumpf(SH_BECKEN, SH_RUMPF), R = k.R;
        bodenrahmen(ger, -0.42, 0.42, -0.62, 0.3);
        sitzSaeule(ger, V(0, SH_BECKEN.y - 0.115, SH_BECKEN.z), 0.42, 0.4);
        ger.polster(0.4, 0.6, 0.09, SH_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
        const saeule = V(0, 0, SH_BECKEN.z - 0.42);
        ger.vierkant(saeule.clone().setY(0.05), saeule.clone().setY(k.schulter.l.y + 0.12), 0.09);
        ger.vierkant(saeule.clone().setY(0.62), SH_BECKEN.clone().add(V(0, 0.2, -0.24)), 0.06);
        for (const [sd, sg] of [['l', 1], ['r', -1]]) {
          const P = k.schulter[sd].clone().add(V(0, 0, -0.2));
          ger.vierkant(saeule.clone().setY(P.y + 0.12), V(P.x, P.y + 0.12, P.z), 0.07); ger.vierkant(V(P.x, P.y + 0.12, P.z), P.clone().add(V(0, 0.05, 0)), 0.06);
          drehlager(ger, P, V(0, 0, 1), 0.1);
          z['shArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mRahmen); z['shVor_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
          z['pad_' + sd] = ger.polster(0.07, 0.2, 0.13, V());
          const gr = new THREE.Group(); ger.gruppe.add(gr); griffRohr(ger, V(0, -0.06, 0), V(0, 0.06, 0), gr, 0.75); z['shGriff_' + sd] = gr;
          z['shDreh_' + sd] = P;
        }
        z.block = gewichtsblock(ger, V(-0.82, 0, SH_BECKEN.z - 0.1), V(1, 0, 0));
      }
      if (last === 'kurzhanteln') khAufbauen(ger, z, !angelehnt);
      if (last === 'scheibe') { z.scheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28); }
      if (angelehnt) ger.box(0.08, 1.8, 0.08, V(-0.45, 0.9, 0.05), ger.mRahmen);
      if (yKabel) { ger.turm(V(0.62, 0, 0.12)); ger.turm(V(-0.62, 0, 0.12)); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }
      else if (last === 'kabel') {
        z.anker = ger.turm(V(art === 'seitheben' ? -0.55 : 0, 0, art === 'reverse_fly' || art === 'aufrecht' ? 0.7 : -0.55)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        if (art === 'frontheben' || art === 'aufrecht') z.griff = ger.griff(art === 'aufrecht' ? 0.32 : 0.46);
      }
      if (o.brustgestuetzt) brustbankBauen(ger, V(0, 0.975, 0), { neigung: 45 });
      if (sitzend && !maschine) ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.05), ger.mPolster);
      return z;
    },
    pose(t) {
      const becken = vorgebeugt ? V(0, 0.88, -0.12) : sitzend ? SH_BECKEN.clone() : angelehnt ? V(0.13, 0.955, 0.02) : V(0, 0.975, 0);
      const r = { neigung: vorgebeugt ? 60 : o.brustgestuetzt ? 45 : 2, seit: angelehnt ? 14 : 0 };
      if (maschine) {
        // Arme heben fast gestreckt seitlich in der Schulterblattebene (etwa 30° vor der Seite) bis Schulterhöhe, Griff in der Hand
        const k = rumpf(becken, r), w = mix(8, 82, t) * RAD, hand = {}, epol = {};
        for (const [sd, sg] of [['l', 1], ['r', -1]]) {
          const richtung = V(0, -Math.cos(w), 0).add(k.R.links.clone().multiplyScalar(sg * Math.sin(w))).add(k.R.vor.clone().multiplyScalar(0.12 + 0.5 * Math.sin(w)));
          hand[sd] = k.schulter[sd].clone().add(richtung.normalize().multiplyScalar(ARM * 0.985));
          epol[sd] = V(0, 1, 0).add(k.R.vor.clone().multiplyScalar(-0.3));
        }
        return { pose: { becken, rumpf: r, hand, handflaeche: seiten((sd, sg) => V(-sg, 0, 0)), ellbogenPol: epol, fuss: seiten((sd, sg) => V(sg * 0.22, FY, 0.42)), kniePol: seiten((sd, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            for (const [sd, sg] of [['l', 1], ['r', -1]]) {
              const P = z['shDreh_' + sd], ua = g.handgelenk[sd].clone().sub(g.ellbogen[sd]).normalize();
              const aussen = V(0, 0, 1).cross(ua).normalize().multiplyScalar(-sg);   // senkrecht zum Unterarm, vom Körper weg (oben-außen)
              const pad = g.ellbogen[sd].clone().lerp(g.handgelenk[sd], 0.5).add(aussen.clone().multiplyScalar(0.06));
              z['pad_' + sd].position.copy(pad); z['pad_' + sd].quaternion.copy(basisAus(ua, V(0, 0, 1)));
              const hinten = V(pad.x, pad.y, P.z);
              seil(z['shArm_' + sd], P, hinten); seil(z['shVor_' + sd], hinten, pad.clone().add(V(0, 0, -0.065)));
              z['shGriff_' + sd].position.copy(g.hand[sd]); z['shGriff_' + sd].quaternion.identity();
            }
            z.block.heben(0.28 * t);
          } };
      }
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'kabel' && art === 'seitheben' && s === 'r') { hand[s] = becken.clone().add(V(-0.17, 0.05, 0.05)); epol[s] = V(-1, 0, -0.5); continue; }
        if (angelehnt && s === 'r') { hand[s] = V(-0.41, 1.15, 0.05); epol[s] = V(-0.5, -1, 0); continue; }
        const sch = k.schulter[s];
        if (art === 'aufrecht') {
          // Hände eng, Stange vom Oberschenkel bis unter die Brust, Ellbogen führen nach oben-außen
          // Ellbogen höchstens bis knapp unter Schulterhöhe (unter 90° Abspreizen): Stange bis zur unteren Brust
          hand[s] = mv(V(sg * 0.1, 0.93, 0.12), k.brust.clone().add(V(sg * 0.1, -0.24, 0.13)), t);
          epol[s] = V(sg, 0.9, -0.2); continue;
        }
        if (yKabel) {
          // Arme starten überkreuzt vor der Hüfte und gehen schräg nach oben-außen (Y)
          const w = mix(10, 150, t) * RAD;
          const d = V(0, -Math.cos(w), 0).add(k.R.links.clone().multiplyScalar(sg * 0.6 * Math.sin(w))).add(k.R.vor.clone().multiplyScalar(0.45 * Math.sin(w) + 0.2));
          hand[s] = sch.clone().add(d.normalize().multiplyScalar(ARM * 0.93)).add(V(-sg * 0.22 * (1 - glatt(t * 1.6)), 0, 0));
          epol[s] = V(sg, 0.3, -0.5); continue;
        }
        let w = mix(art === 'reverse_fly' ? 5 : 8, art === 'ytw' ? 160 : 82, t) * RAD;
        let richtung;
        if (art === 'frontheben') richtung = k.R.oben.clone().multiplyScalar(-Math.cos(w)).add(k.R.vor.clone().multiplyScalar(Math.sin(w))).add(k.R.links.clone().multiplyScalar(sg * 0.1));
        else if (art === 'reverse_fly') richtung = k.R.oben.clone().multiplyScalar(-Math.cos(w) * 0.3).add(V(0, -Math.cos(w), 0)).add(k.R.links.clone().multiplyScalar(sg * Math.sin(w)));
        else if (art === 'ytw') {
          const unten = V(0, -1, 0).add(k.R.links.clone().multiplyScalar(sg * 0.12)).normalize();
          const y = k.R.oben.clone().multiplyScalar(0.86).add(k.R.links.clone().multiplyScalar(sg * 0.5)).sub(k.R.vor.clone().multiplyScalar(0.06)).normalize();
          richtung = unten.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(unten, y), glatt(t)));
        }
        // Seitheben in der Schulterblattebene (etwa 30° vor der Seite), bis Schulterhöhe; Ellbogen nur leicht gebeugt
        else richtung = V(0, -Math.cos(w), 0).add(k.R.links.clone().multiplyScalar(sg * Math.sin(w))).add(k.R.vor.clone().multiplyScalar(0.05 + 0.55 * Math.sin(w)));
        hand[s] = sch.clone().add(richtung.normalize().multiplyScalar(ARM * 0.985));
        if (last === 'scheibe') hand[s].add(k.R.links.clone().multiplyScalar(-sg * 0.06));
        epol[s] = art === 'frontheben' ? k.R.links.clone().multiplyScalar(sg) : V(0, 1, 0).add(k.R.vor.clone().multiplyScalar(-0.3));
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kniePol: seiten((s, sg) => sitzend ? V(sg * 0.2, 1, 1) : V(sg * 0.2, 0, 1)) }, sitzend ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.42)) } : stehFuesse(0.14, vorgebeugt ? 0.05 : 0)),
        props(g, z) {
          if (z.pad_l) for (const [s, sg] of [['l', 1], ['r', -1]]) {
            // Polster liegt außen am Oberarm kurz vor dem Ellbogen, Hebel dreht hinter der Schulter
            const ob = g.schulter[s].clone().lerp(g.ellbogen[s], 0.8), aussen = g.ellbogen[s].clone().sub(g.schulter[s]).normalize();
            const quer = V(0, 0, 1).cross(aussen).normalize().multiplyScalar(sg);
            z['pad_' + s].position.copy(ob).add(quer.clone().multiplyScalar(0.065));
            z['pad_' + s].quaternion.setFromUnitVectors(V(0, 1, 0), aussen);
            seil(z['hebel_' + s], g.schulter[s].clone().add(V(0, 0.02, -0.16)), z['pad_' + s].position.clone().add(V(0, 0, -0.08)));
          }
          if (z.kh_l) kurzhantelnAn(z, g, art === 'frontheben' ? 'quer' : art === 'ytw' ? 'daumenHoch' : 'hammer');
          const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          if (z.scheibe) { z.scheibe.position.copy(mitte); z.scheibe.quaternion.setFromUnitVectors(V(0, 1, 0), g.R.vor); }
          if (z.griff) kabelstangeAn(z.griff, g, V(0, 0.15, art === 'aufrecht' ? 0.7 : -0.55));
          if (z.seil_l) { seil(z.seil_l, V(-0.62, 0.15, 0.12), g.hand.l); seil(z.seil_r, V(0.62, 0.15, 0.12), g.hand.r); }
          if (z.seil) { const a = V(art === 'seitheben' ? -0.55 : 0, art === 'reverse_fly' ? 1.6 : 0.15, art === 'reverse_fly' || art === 'aufrecht' ? 0.7 : -0.55); const ziel = z.griff ? mitte : g.hand.l; const d = ziel.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(ziel).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); }
        }
      };
    },
    blick: V(0, 1.05, 0), abstand: 3.6, kameraRicht: art === 'aufrecht' ? V(0.8, 0.25, 0.6) : V(0.35, 0.25, 1)
  };
}

/* =================================================================== */
/* Ziehen                                                               */
/* =================================================================== */

// Rudern. art: vorgebeugt | einarmig | brustgestuetzt | kabel_sitzend | maschine | umgekehrt | tbar ; last: langhantel | kurzhanteln | kabel | band
// umgekehrt: knie (Knie gebeugt), einarmig ; kabel_sitzend: griff breit ; brustgestuetzt + langhantel = T-Bar ; tuerrahmen ; kabel_stehend (einarmig) ; tisch: true (umgekehrt an der Tischkante)
// Neu: pendlay (Stange setzt jede Wdh am Boden ab) | seal (bäuchlings auf hoher Bank) ; last multipresse | kettlebell (einarmig) ;
//   erhoeht (umgekehrt, Füße auf der Box) ; griff unter (vorgebeugt, Yates) ; einarmig (maschine) ; band (kabel_stehend) ; tbar = stehend mit Hebel
export function rudern(o = {}) {
  const art = o.art || 'vorgebeugt', last = o.last || 'langhantel';
  if (art === 'tuerrahmen' || art === 'kabel_stehend') return rudernStehend(art, o);
  if (art === 'seal') return sealRudern();
  const breitGriff = o.griff === 'breit';
  // T-Bar (stehend oder brustgestützt mit Langhantel): enger Griff, die Hände laufen auf dem Bogen der Stange um den Drehpunkt hinten
  const tbar = last === 'langhantel' && (art === 'brustgestuetzt' || art === 'tbar');
  const tbarBahn = () => {
    const brust = art === 'brustgestuetzt', becken = brust ? V(0, 0.68, -0.15) : V(0, 0.925, -0.17), r = { neigung: brust ? 48 : 47 }, k = rumpf(becken, r);
    const h0 = (s, sg) => k.schulter[s].clone().add(V(-sg * 0.11, -ARM * 0.985, 0.02)), h1 = (s, sg) => k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.3)).add(k.R.links.clone().multiplyScalar(sg * 0.08)).add(k.R.vor.clone().multiplyScalar(0.12));
    const P = bogenMitte(h0('l', 1).setX(0), h1('l', 1).setX(0), { y: 0.1 });
    return { becken, r, P, h0, h1, mitte: (t) => bogenHand(h0('l', 1).setX(0), h1('l', 1).setX(0), P, t) };
  };
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'einarmig') ger.bank(-0.05, 1.1, 0.43, 0);
      if (art === 'brustgestuetzt' && last !== 'langhantel') brustbankBauen(ger, V(0, 0.68, -0.15), { neigung: 48 });
      if (art === 'kabel_sitzend' && last === 'band') {   // am Boden sitzend, Band um die Fußsohlen
        ger.matte(); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand);
      } else if (art === 'kabel_sitzend') kabelruderBauen(ger, z, breitGriff);
      if (art === 'maschine') rudermaschineBauen(ger, z);   // Sitz, Brustpolster, Hebelarme mit senkrechten Griffen
      if (art === 'umgekehrt') { if (o.tisch) tisch(ger, 0.76); else z.stange = ger.stange(0.95, 1.2, 0.0); }
      if (o.erhoeht) ger.box(0.5, 0.45, 0.4, V(0, 0.225, 1.42), ger.mPolster);
      if ((last === 'langhantel' || last === 'multipresse') && art === 'vorgebeugt') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell') z.kb = ger.kettlebell();
      if (tbar) { const tb = tbarBahn(); tbarBauen(ger, z, tb.P, tb.mitte(0), art === 'brustgestuetzt' ? { becken: tb.becken, r: tb.r } : null); }
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'einarmig');
      return z;
    },
    pose(t) {
      // Unter dem Tisch (Platte 0,76 m) liegt der Körper flacher als unter der Stange (0,95 m)
      const griffY = o.tisch ? 0.76 : 0.95;
      if (art === 'umgekehrt' && o.knie) {
        // Knie 90°, Füße flach: Linie Knie → Schulter, Hüfte gestreckt
        const knie = V(0, 0.52, 0.9);
        const unten = winkelFuer(knie, MASS.oberschenkel + 0.02 + MASS.rumpf - 0.03, V(0, griffY - 0.03, 0.0), ARM * 0.99);
        const w = (o.tisch ? mix(Math.max(-18, unten), 10, t) : mix(Math.max(-5, unten), 20, t)) * RAD;
        const richt = V(0, Math.sin(w), -Math.cos(w));
        const becken = knie.clone().add(richt.clone().multiplyScalar(MASS.oberschenkel + 0.02));
        const r = { basis: basisAus(richt, V(0, 1, 0)), neigung: 0 };
        const hand = seiten((s, sg) => V(sg * 0.26, griffY, 0.0));
        if (o.einarmig) hand.l = becken.clone().add(V(0.15, 0.12, -0.15));
        return { pose: { becken, rumpf: r, kopf: { neigung: 10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), fuss: seiten((s, sg) => V(sg * 0.12, FY, 0.92)), fussRicht: seiten(() => V(0, 0, 1)), kniePol: seiten(() => V(0, 1, 0.2)) } };
      }
      if (art === 'umgekehrt') {
        // Körper hängt schräg unter der Stange bzw. Tischkante, Fersen am Boden (erhöht: auf der Box, Körper fast waagerecht)
        const fussP = o.erhoeht ? V(0, 0.45 + FY, 1.38) : V(0, FY, o.tisch ? 1.37 : 1.34);   // Fersen so weit weg, dass die Schultern unten unter der Stange hängen
        // unten hängen die Arme gestreckt
        const unten = winkelFuer(fussP, BEIN + 0.02 + MASS.rumpf - 0.03, V(0, griffY - 0.03, 0.0), ARM * 0.99);
        const winkel = o.erhoeht ? mix(unten, 12, t) : o.tisch ? mix(o.einarmig ? Math.max(6, unten) : unten, 26, t) : mix(unten, 48, t);   // einarmig: freier Arm braucht Platz über dem Boden
        const richt = V(0, Math.sin(winkel * RAD), -Math.cos(winkel * RAD));
        const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02));
        const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), richt);
        const r = { basis, neigung: 0 };
        const hand = seiten((s, sg) => V(sg * 0.26, griffY, 0.0));
        if (o.einarmig) hand.l = becken.clone().add(V(0.15, 0.12, -0.15));
        return { pose: { becken, rumpf: r, kopf: { neigung: 10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), fuss: seiten((s, sg) => fussP.clone().add(V(sg * 0.1, 0, 0))), fussRicht: seiten(() => V(0, 1, 0.2)), kniePol: seiten(() => V(0, 1, 0)) } };
      }
      if (art === 'maschine') {
        // Sitzend, Brust am Polster; Griffe vorn auf Schulterhöhe, Ellbogen ziehen nach hinten
        const becken = RM_BECKEN.clone();
        const r = { ...RM_RUMPF };
        const hand = seiten((s, sg) => bogenHand(rmVorn(sg), rmNah(sg), RM_C, o.einarmig && s === 'l' ? 0 : t));   // vorn Arme gestreckt
        return { pose: { becken, rumpf: r, kopf: { neigung: 5 }, hand, handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.3, -0.3, -1)),
            fuss: seiten((s, sg) => V(sg * 0.16, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) { drueckmaschineStellen(z, g, t); } };
      }
      if (art === 'kabel_sitzend' && last === 'band') {
        // Am Boden, Beine gestreckt, Band um die Fußsohlen: Hände ziehen vom Fuß bis neben den Bauch
        const becken = V(0, 0.12, -0.25);
        const r = { neigung: mix(22, -4, t) };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => mv(V(sg * 0.12, 0.42, 0.42), k.brust.clone().add(V(sg * 0.18, -0.27, 0.06)), t));
        return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.4, -0.4, -1)),
            fuss: seiten((s, sg) => V(sg * 0.12, FY, -0.25 + BEIN * 0.95)), fussRicht: seiten(() => V(0, 1, 0.25)), kniePol: seiten(() => V(0, 1, 0)) },
          props(g, z) { for (const s of ['l', 'r']) seil(z['band_' + s], g.zehe[s].clone().add(V(0, 0.02, 0.02)), g.hand[s]); } };
      }
      if (art === 'kabel_sitzend') {
        const becken = V(0, 0.5, -0.15);
        const r = { neigung: mix(25, -6, t) };
        const k = rumpf(becken, r);
        const hand = {};
        // vorn: Arme gestreckt zum Kabel
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5), seit = breitGriff ? 0.3 : 0.07;
        const vorn = sm.clone().add(V(0, breitGriff ? -0.12 : -0.25, 1).normalize().multiplyScalar(Math.sqrt((ARM * 0.998) ** 2 - (MASS.schulterBreite - seit) ** 2))), nah = k.brust.clone().add(V(0, breitGriff ? -0.08 : -0.24, 0.12));
        for (const [s, sg] of [['l', 1], ['r', -1]]) hand[s] = mv(vorn, nah, t).add(V(sg * (breitGriff ? 0.3 : 0.07), 0, 0));
        return { pose: { becken, rumpf: r, hand, handflaeche: breitGriff ? undefined : seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => breitGriff ? V(sg, 0.4, -0.6) : V(sg * 0.3, -0.5, -1)),
            fuss: seiten((s, sg) => V(sg * 0.13, 0.32, 0.62)), fussFlaeche: seiten(() => RU_FUSSFLAECHE.clone()), fussRicht: seiten(() => V(0, 0.7, 1)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 0)) },
          props(g, z) {
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
            z.griff.position.copy(mitte); z.griff.quaternion.copy(breitGriff ? new THREE.Quaternion() : basisAus(V(0, 1, 0), RU_ANKER.clone().sub(mitte)));
            seil(z.seil, RU_ANKER.clone().add(V(0, 0.04, 0)), mitte.clone().add(RU_ANKER.clone().sub(mitte).normalize().multiplyScalar(breitGriff ? 0.02 : 0.18)));
            z.block.heben(0.3 * t);
          } };
      }
      if (art === 'einarmig') {
        // Linkes Knie und linke Hand auf der Bank, rechts zieht
        const becken = V(0.05, 0.86, -0.38);
        const r = { neigung: 80, drehung: 0 };
        const k = rumpf(becken, r);
        const haengt = k.schulter.r.clone().add(V(-0.02, -ARM * 0.9995, 0));
        const gezogen = k.schulter.r.clone().add(V(-0.06, -0.23, -0.2));   // Ellbogen zieht nach hinten-oben, Hantel neben dem Rumpf
        const hand = { l: V(0.17, 0.48, 0.32), r: mv(haengt, gezogen, t) };
        return { pose: { becken, rumpf: r, kopf: { neigung: -30 }, hand, ellbogenPol: { l: V(1, 0, -0.2), r: V(-0.3, 0.6, -1) }, fuss: { l: V(0.1, 0.52, -0.62), r: V(-0.3, FY, -0.2) }, fussRicht: { l: V(0, 0, -1), r: V(-0.2, 0, 1) }, kniePol: { l: V(0, -1, 0.5), r: V(-0.3, 0, 1) }, zehen: { l: -80, r: 0 } },
          props(g, z) { if (z.kh_l) khHalten(z, g, 'r', z.kh_l, 'neutral'); if (z.kb) z.kb.position.copy(g.hand.r).add(V(0, -0.01, 0)); } };
      }
      const brust = art === 'brustgestuetzt', pendlay = !!o.pendlay, unter = o.griff === 'unter';
      // Knie nur leicht gebeugt (10–30°), Rumpf höchstens 45° über der Waagrechten, Pendlay fast waagrecht
      const becken = brust ? V(0, 0.68, -0.15) : pendlay ? V(0, 0.865, -0.3) : unter ? V(0, 0.93, -0.14) : V(0, 0.925, -0.17);
      const r = { neigung: brust ? 48 : pendlay ? 82 : unter ? 47 : art === 'tbar' ? 47 : 55 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const breit = last === 'kurzhanteln' ? 0.03 : 0.07;
        // Pendlay: Stange liegt unten auf dem Boden (Scheibenradius 0,225 m)
        const haengt = pendlay ? V(sg * 0.26, 0.23, k.schulter[s].z + 0.02) : k.schulter[s].clone().add(V(sg * breit, -ARM * 0.9995, 0.02));
        if (unter) flaeche[s] = V(0, 0.2, 1);
        const gezogen = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.3)).add(k.R.links.clone().multiplyScalar(sg * 0.2)).add(k.R.vor.clone().multiplyScalar(0.12));
        hand[s] = mv(haengt, gezogen, t);
        epol[s] = V(sg * 0.3, 0.6, -1);
        if (tbar) { const tb = tbarBahn(); hand[s] = bogenHand(tb.h0(s, sg), tb.h1(s, sg), tb.P, t); flaeche[s] = V(-sg, 0, 0); epol[s] = V(sg * 0.5, 0.4, -1); }
      }
      return {
        pose: Object.assign({ becken, rumpf: r, kopf: { neigung: -20 }, hand, ellbogenPol: epol, handflaeche: flaeche, kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, stehFuesse(0.15, brust ? 0.15 : 0.05)),
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.tb) z.tb.hebel.rotation.x = hebelWinkel(z.tb.P, g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), 1);   // Stange dreht um den Lagerbock hinten
          if (z.kh_l) kurzhantelnAn(z, g, 'hammer');
        }
      };
    },
    blick: V(0, 0.75, 0), abstand: 3.4, kameraRicht: V(1, 0.35, 0.3)
  };
}

// Seal-Rudern: bäuchlings auf einer hohen Bank (Kopf nach -z), Arme hängen senkrecht, Kurzhanteln im Hammergriff zur Hüfte ziehen
function sealRudern() {
  return {
    aufbau(ger) {
      ger.box(0.36, 0.08, 1.6, V(0, 0.8, 0.3), ger.mPolster);
      for (const sz of [-0.35, 0.95]) { ger.box(0.06, 0.76, 0.06, V(0, 0.38, sz), ger.mRahmen); ger.box(0.4, 0.04, 0.06, V(0, 0.02, sz), ger.mRahmen); }
      const z = {}; khAufbauen(ger, z); return z;
    },
    pose(t) {
      const becken = V(0, 0.93, 0.3), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r);
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(0, -ARM * 0.9995, 0)).add(L(sg, 0.04)), k.schulter[s].clone().add(V(0, -0.16, 0.2)).add(L(sg, 0.1)), t));   // unten Arme gestreckt
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, ellbogenPol: seiten((s, sg) => L(sg, 0.4).add(V(0, 1, 0.4))),
          fuss: seiten((s, sg) => V(0, 0.95, 0.3 + BEIN * 0.96).add(L(sg, 0.1))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, 1)) },
        props(g, z) { kurzhantelnAn(z, g, 'hammer'); } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, 0.2)
  };
}

// Rudern im Stand: am Türrahmen (zurücklehnen, beide Hände am Rahmen) oder einarmig am Kabel bzw. Band in Schrittstellung
function rudernStehend(art, o = {}) {
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'tuerrahmen') { for (const sx of [-1, 1]) ger.box(0.1, 2.1, 0.14, V(sx * 0.5, 1.05, 0.32), ger.mRahmen); ger.box(1.1, 0.12, 0.14, V(0, 2.16, 0.32), ger.mRahmen); }
      else if (o.band) { ger.box(0.08, 1.4, 0.08, V(-0.15, 0.7, 1.0), ger.mRahmen); z.seil = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.griff = ger.griff(); z.griff.visible = false; }
      else { ger.turm(V(-0.15, 0, 1.0)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); }
      return z;
    },
    pose(t) {
      if (art === 'tuerrahmen') {
        const a = mix(18, 7, t) * RAD;
        const fussP = V(0, FY, 0.24);
        const richt = V(0, Math.cos(a), -Math.sin(a));
        const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02));
        const r = { basis: basisAus(richt, V(0, 0, 1)), neigung: 0 };
        return { pose: { becken, rumpf: r, kopf: { neigung: 8 }, hand: seiten((s, sg) => V(sg * 0.42, 1.3, 0.28)), ellbogenPol: seiten((s, sg) => V(sg, -0.6, -0.5)),
          fuss: seiten((s, sg) => fussP.clone().add(V(sg * 0.12, 0, 0))), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } };
      }
      const becken = V(0, 0.95, 0.02);
      const r = { neigung: 10, drehung: mix(-12, 8, t) };
      const k = rumpf(becken, r);
      const hand = { r: mv(V(-0.17, 1.18, 0.55), k.schulter.r.clone().add(V(-0.05, -0.3, 0.02)), t), l: becken.clone().add(V(0.17, 0.05, 0.06)) };
      return { pose: { becken, rumpf: r, hand, ellbogenPol: { r: V(-0.4, -0.3, -1), l: V(1, 0, -0.5) }, fuss: { l: V(0.13, FY, 0.3), r: V(-0.13, FY, -0.25) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, V(-0.15, 1.2, 0.95), g.hand.r); } };
    },
    blick: V(0, 1.0, 0.1), abstand: 3.6, kameraRicht: V(1, 0.3, art === 'tuerrahmen' ? -0.35 : 0.5)
  };
}

// Klimmzug & Latzug. art: klimmzug | chinup | latzug | latzug_eng | band | negativ | schulterblatt | ueberzug_kabel ; griff: breit | eng | neutral
// Weitere arts: sprung (von der Box) | halten (oben halten) | archer | maschine (Kniepolster) | band (Band unter dem Knie) | zusatzgewicht
//   | latzug_einarmig (halbkniend am Kabel) | bauchlage (Latzug mit Handtuch am Boden) | latzug_band (Band an der Tür, kniend)
// Neu: griff breit (Obergriff weit) | unter (Latzug im Untergriff) ; maschine bei art latzug (Hebel statt Kabel) ; Handflächen je nach Griff
export function klimmzug(o = {}) {
  const art = o.art || 'klimmzug';
  const hebel = latzugArt(art) && !!o.maschine;
  if (art === 'latzug_einarmig' || art === 'bauchlage' || art === 'latzug_band') return latzugBoden(art);
  const latzug = art === 'latzug' || art === 'latzug_eng';
  return {
    aufbau(ger) {
      const z = {};
      if (latzug) {
        if (hebel) {
          // Hebel-Latzug: Sitz, Knierolle, zwei Hebelarme von einer Drehachse hinten oben, Griffe an den Armen
          bodenrahmen(ger, -0.5, 0.5, -0.75, 0.62);
          sitzSaeule(ger, V(0, 0.435, -0.02), 0.44, 0.42);
          ger.vierkant(V(0, 0.05, 0.55), V(0, 0.66, 0.55), 0.06); ger.vierkant(V(0, 0.66, 0.55), V(0, 0.66, 0.2), 0.06); rollePolster(ger, 0.42, 0.05).position.set(0, 0.665, 0.13);
          for (const sx of [-1, 1]) {
            const sd = sx > 0 ? 'l' : 'r', P = V(sx * 0.47, LH_C.y, LH_C.z);
            ger.vierkant(V(sx * 0.47, 0.05, LH_C.z), P.clone().sub(V(0, 0.06, 0)), 0.08);
            drehlager(ger, P, V(1, 0, 0), 0.13);
            z['dmArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.03, ger.mRahmen); z['dmQuer_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
            const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); z['dmGriff_' + sd] = g;
          }
          ger.vierkant(V(-0.47, LH_C.y, LH_C.z), V(0.47, LH_C.y, LH_C.z), 0.06);
          z.block = gewichtsblock(ger, V(0, 0, LH_C.z - 0.35), V(0, 0, 1));
          z.dm = { C: LH_C, griff: 'laengs', x: 0.47 };
        } else {
          latzugBauen(ger, z, LZ_STANGE_Z);
          z.lh = latzugstange(ger, art === 'latzug_eng' ? 'parallel' : o.griff === 'unter' ? 'gerade' : 'gewinkelt', art === 'latzug_eng' ? 0.16 : o.griff === 'unter' ? 0.18 : o.griff === 'breit' ? 0.42 : 0.33);
          z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        }
      }
      else if (art === 'maschine') assistBauen(ger, z, 'klimmzug');
      else z.stange = ger.stange(2.25, art === 'archer' ? 1.5 : 1.3, 0);
      if (art === 'sprung' || art === 'negativ') ger.box(0.5, 0.55, 0.45, V(0, 0.275, -0.15), ger.mPolster);
      if (art === 'band') { z.band_a = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.band_b = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'zusatzgewicht') z.kh = ger.kurzhantel();
      return z;
    },
    pose(t) {
      const breit = art === 'chinup' || art === 'latzug_eng' ? 0.16 : art === 'archer' ? 0.5 : o.griff === 'neutral' ? 0.2 : o.griff === 'unter' ? 0.18 : o.griff === 'breit' ? 0.42 : 0.33;
      // Handflächen: Untergriff zum Gesicht, Hammergriff zueinander, sonst Obergriff (Standard der Figur)
      const flaeche = art === 'chinup' || o.griff === 'unter' ? seiten(() => V(0, 0, -1)) : o.griff === 'neutral' || art === 'latzug_eng' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined;
      if (latzug) {
        const becken = V(0, 0.55, -0.02);
        const r = { neigung: -14 };
        const k = rumpf(becken, r);
        const oben = seiten((s, sg) => V(sg * breit, k.schulter[s].y + ARM * 0.985, k.schulter[s].z + 0.12));
        const unten = seiten((s, sg) => k.brust.clone().add(V(sg * (breit * 0.85), 0.02, 0.2)));
        const hand = hebel ? seiten((s, sg) => bogenHand(oben[s], unten[s], LH_C, t)) : seiten((s) => mv(oben[s], unten[s], t));
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, handflaeche: hebel ? seiten((s, sg) => V(-sg, 0, 0)) : flaeche, ellbogenPol: seiten((s, sg) => V(sg, -0.6, -0.3)), fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.38)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            if (z.dm) { drueckmaschineStellen(z, g, t); return; }
            stangeAn(z.lh, g); seil(z.seil, V(0, 2.28, LZ_STANGE_Z), z.lh.position.clone().add(V(0, 0.04, 0)));
            z.block.heben(0.3 * t);
          } };
      }
      let hub = art === 'schulterblatt' ? mix(0, 0.08, t) : art === 'halten' ? mix(0.47, 0.5, t) : mix(0, 0.52, t);
      let schulterY = 2.25 - Math.sqrt(Math.max(0.01, (ARM * 0.99) ** 2 - Math.max(0, breit - MASS.schulterBreite) ** 2)) + hub, x = 0;
      if (art === 'archer') { schulterY = mix(2.25 - Math.sqrt((ARM * 0.99) ** 2 - (breit - MASS.schulterBreite) ** 2), 2.11, t); x = mix(0, -0.22, t); }
      const becken = V(x, schulterY + 0.03 - (MASS.rumpf - 0.03) - 0.03, -0.03);
      const r = { neigung: -6, seit: art === 'archer' ? mix(0, -8, t) : 0 };
      const hand = seiten((s, sg) => V(sg * breit, 2.25, 0));
      let fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.08, -BEIN * 0.86, -0.22)));
      let kpol = seiten(() => V(0, 0, 1)), fussRicht = seiten(() => V(0, -0.6, 1));
      const kniend = seiten((s, sg) => becken.clone().add(V(sg * 0.09, -0.47, -0.42)));    // Knie 90°, Unterschenkel nach hinten
      if (art === 'sprung' || art === 'negativ') fuss = seiten((s, sg) => mv(V(sg * 0.11, 0.55 + FY, -0.12), becken.clone().add(V(sg * 0.08, -BEIN * 0.86, -0.22)), glatt(t * 1.6)));
      if (art === 'maschine') { fuss = kniend; kpol = seiten(() => V(0, -1, 1)); fussRicht = seiten(() => V(0, -0.3, -1)); }
      if (art === 'band') { fuss.r = kniend.r; kpol.r = V(0, -1, 1); fussRicht.r = V(0, -0.3, -1); }
      if (art === 'zusatzgewicht') fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.03, -BEIN * 0.9, -0.12)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, handflaeche: flaeche, ellbogenPol: seiten((s, sg) => V(sg, -0.8, art === 'chinup' ? 0.6 : -0.2)), fuss, fussRicht, kniePol: kpol },
        props(g, z) {
          if (z.polster) assistStellen(z, g);
          if (z.band_a) { const k = g.knie.r.clone().add(V(0, -0.05, 0)); seil(z.band_a, V(-0.04, 2.24, 0), k); seil(z.band_b, V(0.04, 2.24, 0), k.clone().add(V(0.05, 0, 0))); }
          if (z.kh) { z.kh.position.copy(g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5)).add(V(0, -0.02, 0.02)); z.kh.quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 0, 1)); }
        } };
    },
    // Negativ: schnell hoch (Sprung von der Box), oben halten, 4,5 s langsam ablassen
    blick: V(0, 1.35, 0), abstand: 4.4, kameraRicht: latzug ? V(1, 0.25, 0.1) : V(0.8, 0.15, 0.7), dauer: art === 'halten' ? STATISCH : art === 'sprung' ? [0.5, 0.6, 3.0, 0.5] : art === 'negativ' ? [0.6, 0.6, 4.5, 0.8] : undefined
  };
}

function latzugArt(art) { return art === 'latzug' || art === 'latzug_eng'; }
// Latzug: Becken, Rumpf 14° zurück; Umlenkrolle oben über der Stange; Hebel-Latzug: Drehachse hinten oben (Kreisbogen der Griffe)
const LZ_BECKEN = V(0, 0.55, -0.02), LZ_RUMPF = { neigung: -14 }, LZ_STANGE_Z = 0.1;
const lzOben = (sg, breit) => { const k = rumpf(LZ_BECKEN, LZ_RUMPF), s = sg > 0 ? 'l' : 'r'; return V(sg * breit, k.schulter[s].y + ARM * 0.985, k.schulter[s].z + 0.12); };
const lzUnten = (sg, breit) => rumpf(LZ_BECKEN, LZ_RUMPF).brust.clone().add(V(sg * (breit * 0.85), 0.02, 0.2));
const LH_C = bogenMitte(lzOben(1, 0.33), lzUnten(1, 0.33), { z: -0.42 });

// Latzug ohne Sitz: einarmig im Halbkniestand am Kabel, oder in Bauchlage mit Handtuch
function latzugBoden(art) {
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'latzug_einarmig') { ger.turm(V(-0.3, 0, 0.45), 2.3); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); ger.matte(); }
      else if (art === 'latzug_band') { tuer(ger, 0.62); ger.matte(); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      else { ger.matte(); z.tuch = ger.stab(V(), V(0, 1, 0), 0.02, ger.mBand); }
      return z;
    },
    pose(t) {
      if (art === 'latzug_band') {
        // Aufrecht kniend vor der Tür, Band oben an der Tür verankert; Hände ziehen von oben-vorn bis neben die Schultern
        const becken = V(0, 0.62, -0.05);
        const r = { neigung: -6 };
        const k = rumpf(becken, r);
        const oben = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.15, 1, 0.55).normalize().multiplyScalar(ARM * 0.97)));
        const hand = seiten((s, sg) => mv(oben[s], k.schulter[s].clone().add(V(sg * 0.17, -0.12, 0.06)), t));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten((s, sg) => V(sg, -0.7, -0.2)),
            fuss: seiten((s, sg) => becken.clone().add(V(sg * 0.1, -0.5, -0.44))), kniePol: seiten(() => V(0, -1, 1)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) { for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['band_' + s], V(sg * 0.05, 2.02, 0.58), g.hand[s]); } };
      }
      if (art === 'latzug_einarmig') {
        const becken = V(0, 0.55, -0.06);
        const r = { neigung: 4, seit: mix(-6, 4, t) };
        const k = rumpf(becken, r);
        // oben Arm gestreckt Richtung Kabelrolle
        const hand = { r: mv(k.schulter.r.clone().add(V(-0.3, 2.2, 0.4).sub(k.schulter.r).normalize().multiplyScalar(ARM * 0.998)), k.schulter.r.clone().add(V(-0.08, -0.26, 0.04)), t), l: V(0.15, 0.56, 0.32) };
        return { pose: { becken, rumpf: r, hand, ellbogenPol: { r: V(-1, -0.5, 0), l: V(1, 0, -0.5) }, fuss: { l: V(0.14, FY, 0.4), r: V(-0.1, 0.1, -0.52) }, kniePol: { l: V(0.1, 0, 1), r: V(0, -1, 0.3) }, fussRicht: { l: V(0.1, 0, 1), r: V(0, -0.3, -1) }, zehen: { l: 0, r: -60 } },
          props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, V(-0.3, 2.2, 0.4), g.hand.r); } };
      }
      // Bauchlage, Kopf nach -z, Brust leicht angehoben; Hände ziehen das Tuch von vorn zu den Schultern
      const becken = V(0, 0.12, 0.25);
      const r = { basis: BAUCHLAGE, neigung: -14 };
      const k = rumpf(becken, r);
      const hand = seitenBauch((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.2, 0.12, -0.5)), k.schulter[s].clone().add(V(sg * 0.3, 0.02, 0.06)), t));
      return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seitenBauch((s, sg) => V(sg, 0.3, 0.5)), fuss: seitenBauch((s, sg) => V(sg * 0.1, FY, 0.27 + BEIN * 0.998))   /* Hüfte liegt 2 cm hinter dem Becken: Beine fast gestreckt, Knie bleibt über dem Boden */, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, 1)) },
        props(g, z) { seil(z.tuch, g.hand.l, g.hand.r); } };
    },
    blick: art === 'latzug_band' ? V(0, 1.1, 0.2) : V(0, 0.6, 0), abstand: art === 'latzug_band' ? 3.9 : 3.4, kameraRicht: V(1, art === 'bauchlage' ? 0.5 : 0.3, 0.45)
  };
}

/* =================================================================== */
/* Arme                                                                 */
/* =================================================================== */

// Bizeps. last: kurzhanteln | langhantel | sz | kabel | band ; griff: quer | hammer | ober (Reverse Curl) ; seilgriff: true ; art: stehend | scott | konzentration | schraeg
// art maschine = Scott-Maschine ; art bayesian = Rücken zum Kabelturm, Arm hinter dem Körper (einarmig)
// Neu: art spider (bäuchlings auf der Schrägbank) | drag (Stange am Körper hoch, Ellbogen nach hinten) | handgelenk (Unterarme auf den Oberschenkeln) ;
//   zottman (hoch im Untergriff, runter im Obergriff) ; griff ober bei handgelenk = Handrücken heben
export function curl(o = {}) {
  const last = o.last || 'kurzhanteln', art = o.art || 'stehend';
  if (art === 'bayesian') return bayesianCurl();
  if (art === 'handgelenk') return handgelenkCurl(o);
  if (art === 'maschine') {
    // Bizepsmaschine (o.trizeps: Trizepsstrecker, gleiche Maschine, Arm streckt sich, Griffe senkrecht): Armweg wie Scott-Curl um den Ellbogen
    const tri = !!o.trizeps, c = curl({ art: 'scott', last: 'sz' }), pose = c.pose;
    const becken = V(0, 0.56, -0.08), ell = rumpf(becken, { neigung: 18 }).schulter.l.clone().add(V(0.02, -0.2, 0.22).normalize().multiplyScalar(MASS.oberarm * 0.98));
    const C = V(0, ell.y, ell.z);
    c.aufbau = (ger) => { const z = {}; armmaschineBauen(ger, z, becken, C, tri); return z; };
    c.pose = (t, zst) => {
      const p = pose(tri ? 1 - t : t, zst);
      if (tri) p.pose.handflaeche = seiten((s, sg) => V(-sg, 0, 0));
      p.props = (g, z) => armmaschineStellen(z, g, tri ? 1 - t : t);
      return p;
    };
    c.kameraRicht = V(1, 0.35, 0.4);
    return c;
  }
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'scott') { z.pult = ger.box(0.5, 0.06, 0.34, V(), ger.mPolster); ger.box(0.4, 0.5, 0.4, V(0, 0.25, -0.12), ger.mPolster); ger.box(0.06, 0.8, 0.06, V(0, 0.4, 0.15), ger.mRahmen); }
      if (art === 'konzentration' || art === 'schraeg') ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster);
      if (art === 'spider') brustbankBauen(ger, V(0, 0.68, -0.15), { neigung: 48 });
      if (art === 'schraeg') ger.box(0.36, 0.8, 0.08, V(0, 0.8, -0.38), ger.mPolster, -30);
      if (last === 'langhantel' || last === 'sz') z.lh = last === 'sz' ? ger.sz() : ger.langhantel();
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'konzentration');
      if (last === 'kabel') {
        ger.turm(V(0, 0, 0.6)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        if (o.seilgriff) { z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); }
        else z.griff = ger.griff(0.5);
      }
      return z;
    },
    pose(t, zst) {
      const sitzend = art !== 'stehend' && art !== 'spider' && art !== 'drag';
      const becken = sitzend ? V(0, 0.56, -0.08) : art === 'spider' ? V(0, 0.68, -0.15) : V(0, 0.975, 0);
      const r = { neigung: art === 'konzentration' ? 35 : art === 'schraeg' ? -30 : art === 'scott' ? 18 : art === 'spider' ? 48 : 0 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        let ell;
        if (art === 'scott') ell = k.schulter[s].clone().add(V(sg * 0.02, -0.2, 0.22).normalize().multiplyScalar(MASS.oberarm * 0.98));   // Oberarm liegt auf dem Polster
        else if (art === 'konzentration') ell = becken.clone().add(V(sg * 0.15, 0.06, 0.35));
        // Ellbogen genau eine Oberarmlänge unter der Schulter, sonst kann der Arm unten nicht ganz strecken
        else if (art === 'spider') ell = k.schulter[s].clone().add(V(sg * 0.02, -MASS.oberarm * 0.97, 0.03).normalize().multiplyScalar(MASS.oberarm * 0.998));
        else ell = k.schulter[s].clone().add(V(sg * 0.02, -MASS.oberarm * 0.97, art === 'schraeg' ? -0.08 : 0.02).normalize().multiplyScalar(MASS.oberarm * 0.998));
        // Scott: unten nicht ganz durchstrecken (Bizepssehne), oben fast ganz beugen
        // unten Arm (fast) gestreckt, Scott nicht ganz (Bizepssehne); Schrägbank oben nicht übers Ziel hinaus
        const w = mix(art === 'scott' ? 46 : 1, art === 'scott' ? 174 : art === 'schraeg' ? 126 : 140, t) * RAD;   // Scott oben: Hantel vor der Schulter, nicht vor dem Gesicht
        const ab = art === 'scott' ? V(0, -Math.cos(w), Math.sin(w) * 0.9 + 0.2) : V(0, -Math.cos(w), Math.sin(w));
        hand[s] = genau(ell.clone().add(ab.normalize().multiplyScalar(UNTERARM)));
        if (art === 'konzentration' && s === 'l') { hand[s] = becken.clone().add(V(0.2, 0.05, 0.3)); }
        if (last === 'langhantel' || last === 'sz') hand[s].x = sg * (last === 'sz' ? 0.18 : 0.21);   // etwa schulterbreit, Ellbogen bleiben seitlich am Körper
        if (o.seilgriff) hand[s].x = sg * 0.1;
        epol[s] = V(0, -0.4, -1);
        if (art === 'drag') {   // Stange gleitet am Körper hoch, Ellbogen wandern nach hinten
          hand[s] = mv(V(sg * 0.2, 0.9, 0.1), V(sg * 0.2, 1.22, 0.13), t);
          epol[s] = V(sg * 0.2, 0, -1);
        }
        // Handfläche: Untergriff zeigt zur Schulter, Obergriff (Reverse Curl) davon weg, Hammergriff zur Körpermitte
        const a = hand[s].clone().sub(ell).normalize(), unter = V(0, a.z, -a.y);
        const ober = o.griff === 'ober' || (o.zottman && zst && zst.runter);   // Zottman: runter im Obergriff
        flaeche[s] = o.griff === 'hammer' ? k.R.links.clone().multiplyScalar(-sg) : art === 'drag' ? V(0, 0.3, 1) : ober ? unter.negate() : unter;
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: flaeche }, sitzend ? { fuss: seiten((s, sg) => V(sg * 0.25, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.3, 1, 1)) } : stehFuesse(0.14, art === 'spider' ? 0.15 : 0)),
        props(g, z) {
          if (z.pult) {   // Scott-Pult liegt unter den Oberarmen
            const sch = g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5), ell = g.ellbogen.l.clone().add(g.ellbogen.r).multiplyScalar(0.5);
            const d = ell.clone().sub(sch).normalize(), n = V(0, -d.z, d.y).normalize();
            z.pult.position.copy(sch.lerp(ell, 0.62)).add(n.multiplyScalar(0.075)); z.pult.quaternion.setFromUnitVectors(V(0, 0, 1), d);
          }
          if (z.lh) stangeAn(z.lh, g);
          if (z.kh_l) { if (art === 'konzentration') khHalten(z, g, 'r', z.kh_l, g.R.links); else kurzhantelnAn(z, g, o.griff === 'hammer' ? 'hammer' : 'quer'); }
          if (art === 'spider' && z.kh_l) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], V(1, 0, 0));
          if (z.seil) {
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), a = V(0, 0.15, 0.55);
            if (z.strang_l) {   // Seilgriff: Kabel bis zum Knoten, von dort je ein Seilende in jede Hand
              const knoten = mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.16));
              seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r);
            } else { kabelstangeAn(z.griff, g, a); seil(z.seil, a, mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.03))); }
          }
        }
      };
    },
    blick: V(0, 0.95, 0), abstand: 3.0, kameraRicht: V(0.9, 0.2, 0.6)
  };
}

// Handgelenk-Curl: sitzend, Unterarme liegen auf den Oberschenkeln, nur die Hand bewegt sich im Handgelenk
function handgelenkCurl(o) {
  const ober = o.griff === 'ober';
  return {
    aufbau(ger) { ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster); const z = {}; khAufbauen(ger, z); return z; },
    pose(t) {
      const becken = V(0, 0.56, -0.08), r = { neigung: 32 };
      const knick = ober ? mix(30, -45, t) : mix(-40, 55, t);   // + = zur Handfläche
      const hand = seiten((s, sg) => V(sg * 0.13, 0.63, 0.37));
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, handflaeche: seiten(() => V(0, ober ? -1 : 1, 0)), handKnick: seiten(() => knick), ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -0.3)),
          fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.handMitte[s], V(1, 0, 0)); } };
    },
    blick: V(0, 0.65, 0.1), abstand: 2.6, kameraRicht: V(1, 0.45, 0.4)
  };
}

// Bayesian Curl: Rücken zum Turm, rechter Oberarm zeigt schräg nach hinten, Schrittstellung
function bayesianCurl() {
  return {
    aufbau(ger) { ger.turm(V(-0.2, 0, -0.8)); return { seil: ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel), griff: ger.griff() }; },
    pose(t) {
      const becken = V(0, 0.96, 0.02);
      const r = { neigung: 8 };
      const k = rumpf(becken, r);
      const ell = k.schulter.r.clone().add(V(-0.02, -0.25, -0.13).normalize().multiplyScalar(MASS.oberarm * 0.998));   // Arm hinter dem Körper, Ellbogen auf Oberarmlänge
      const u = ell.clone().sub(k.schulter.r).normalize();
      const quer = V(0, -u.z, u.y).normalize();     // nach vorn-unten, senkrecht zum Oberarm
      const w = mix(2, 140, t) * RAD;
      const handR = genau(ell.clone().add(u.clone().multiplyScalar(Math.cos(w)).add(quer.multiplyScalar(Math.sin(w))).multiplyScalar(UNTERARM)));
      return { pose: { becken, rumpf: r, hand: { r: handR, l: becken.clone().add(V(0.17, 0.05, 0.06)) }, ellbogenPol: { r: V(0, -1, -1), l: V(1, 0, -0.5) },
          fuss: { l: V(0.13, FY, 0.3), r: V(-0.13, FY, -0.22) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, V(-0.2, 0.25, -0.75), g.hand.r); } };
    },
    blick: V(0, 0.95, 0), abstand: 3.2, kameraRicht: V(1, 0.2, 0.15)
  };
}

// Trizeps. art: pushdown | ueberkopf | kickback | dips | dip_maschine ; last: kabel | kurzhantel | band | koerpergewicht
// pushdown: einarmig ; dips: brust (mehr Vorneigung), assistiert (Kniepolster an der Maschine)
// Neu: art bankdips (Hände hinter dir auf der Bank) | maschine (Trizepsstrecker sitzend, Ellbogen auf dem Pult) ; pushdown: seil, griff unter
export function trizeps(o = {}) {
  const art = o.art || 'pushdown', last = o.last || 'kabel';
  if (art === 'dip_maschine') return dipMaschine();
  if (art === 'bankdips') return bankDips();
  if (art === 'maschine') return curl({ art: 'maschine', trizeps: true });   // Trizepsstrecker: Bizepsmaschine rückwärts, Griffe senkrecht
  const band = art === 'ueberkopf' && last === 'band';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'pushdown' && last === 'band') { tuer(ger, 0.45); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      else if (art === 'pushdown' && o.seil) { ger.turm(V(0, 0, 0.42)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); }
      else if (art === 'pushdown') { ger.turm(V(0, 0, 0.42)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(o.einarmig ? 0 : 0.5); }
      if (art === 'ueberkopf') { if (last === 'kabel') { ger.turm(V(0, 0, -0.55)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); } else if (band) { z.seil = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); } else { z.kh_l = ger.kurzhantel(); } }
      if (art === 'kickback') { ger.bank(-0.05, 1.1, 0.43, 0); z.kh_l = ger.kurzhantel(); }
      if (art === 'dips' && o.assistiert) assistBauen(ger, z, 'dips');
      else if (art === 'dips') dipBarrenBauen(ger);
      return z;
    },
    pose(t) {
      if (art === 'dips') {
        // Unten Oberarm etwa waagerecht (Schulter nicht unter dem Ellbogen), oben Arme fast gestreckt
        const hub = mix(0.43, 0.64, t);
        const schulterY = 1.27 + hub;
        const becken = V(0, schulterY + 0.03 - (MASS.rumpf - 0.03) - 0.02 + (o.brust ? 0.05 : 0), o.brust ? -0.12 : -0.06);
        const r = { neigung: o.brust ? mix(26, 16, t) : mix(14, 8, t) };   // leichte Vorlage, unten höchstens etwa 30°
        const fuss = o.assistiert ? seiten((s, sg) => becken.clone().add(V(sg * 0.09, -0.47, -0.42))) : seiten((s, sg) => becken.clone().add(V(sg * 0.07, -0.72, -0.3)));
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.27, 1.25, 0.08)), handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * (o.brust ? 0.6 : 0.2), 0.3, -1)),
            fuss, fussRicht: seiten(() => o.assistiert ? V(0, -0.3, -1) : V(0, -0.8, 0.6)), kniePol: seiten(() => o.assistiert ? V(0, -1, 1) : V(0, 0, 1)) },
          props(g, z) {
            if (!z.polster) return;
            assistStellen(z, g); return;
            const knie = g.knie.l.clone().add(g.knie.r).multiplyScalar(0.5);
            z.polster.position.copy(knie).add(V(0, -0.08, -0.12));
            z.hub.position.set(0, (knie.y - 0.1) / 2, knie.z - 0.12); z.hub.scale.set(1, Math.max(knie.y - 0.1, 0.05), 1);
          } };
      }
      if (art === 'kickback') {
        const becken = V(0.05, 0.86, -0.38);
        const r = { neigung: 80 };
        const k = rumpf(becken, r);
        const ell = k.schulter.r.clone().add(V(-0.03, -0.04, -MASS.oberarm * 0.995));
        const w = mix(90, -12, t) * RAD;   // oben ganz gestreckt
        const handR = genau(ell.clone().add(V(0, -Math.sin(w) * UNTERARM, -Math.cos(w) * UNTERARM)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -30 }, hand: { l: V(0.17, 0.48, 0.32), r: handR }, ellbogenPol: { l: V(1, 0, -0.2), r: V(0, 1, 0) }, fuss: { l: V(0.1, 0.52, -0.62), r: V(-0.3, FY, -0.2) }, fussRicht: { l: V(0, 0, -1), r: V(-0.2, 0, 1) }, kniePol: { l: V(0, -1, 0.5), r: V(-0.3, 0, 1) }, zehen: { l: -80, r: 0 } },
          props(g, z) { khHalten(z, g, 'r', z.kh_l, 'neutral'); } };
      }
      const becken = V(0, 0.975, art === 'pushdown' ? 0 : 0);
      const r = { neigung: art === 'pushdown' ? 10 : -4 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (art === 'pushdown') {
          // Oberarm bleibt am Körper (entlang der Rumpfachse), nur der Unterarm bewegt sich
          const ell = k.schulter[s].clone().sub(k.R.oben.clone().multiplyScalar(MASS.oberarm * 0.995)).add(k.R.vor.clone().multiplyScalar(0.01));
          const w = mix(95, -6, t) * RAD;   // unten ganz gestreckt
          hand[s] = genau(ell.clone().add(V(-sg * 0.05, -Math.cos(w) * UNTERARM, Math.sin(w) * UNTERARM)));
          if (o.seil) hand[s].x = sg * mix(0.05, 0.15, t);   // Seil: unten die Enden auseinander
          epol[s] = V(0, 0, -1);
        } else {
          const ell = k.schulter[s].clone().add(V(-sg * 0.04, MASS.oberarm * 0.99, 0.03));
          const w = mix(150, -4, t) * RAD;   // oben ganz gestreckt
          hand[s] = genau(ell.clone().add(V(-sg * 0.06, Math.cos(w) * UNTERARM, -Math.sin(w) * UNTERARM)));
          epol[s] = V(sg * 0.2, 1, 0.4);
        }
      }
      if (o.einarmig && art === 'pushdown') { hand.r.x += 0.04; hand.l = becken.clone().add(V(0.17, 0.05, 0.06)); epol.l = V(1, 0, -0.5); }
      // Band über Kopf: hinterer Fuß steht auf dem Band
      const fuesse = band ? { fuss: { l: V(0.13, FY, 0.22), r: V(-0.13, FY, -0.25) }, zehen: { l: 0, r: 15 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } : stehFuesse(0.14, 0, 0.25);
      // Untergriff: Handflächen nach oben bzw. vorn ; Seil: Handflächen zueinander
      const flaeche = o.griff === 'unter' ? seiten((s) => { const a = hand[s].clone().sub(k.schulter[s]); return V(0, Math.max(0.2, -a.y), 1); }) : o.seil ? seiten((s, sg) => V(-sg, 0, 0)) : undefined;
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: flaeche }, fuesse),
        props(g, z) {
          const mitte = o.einarmig ? g.hand.r.clone() : g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          if (z.strang_l) { const a = V(0, 2.0, 0.38), knoten = mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.16)); seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r); }
          if (z.griff) {
            const anker = art === 'pushdown' ? V(0, 2.0, 0.38) : V(0, 0.2, -0.5);
            if (o.einarmig || art !== 'pushdown') z.griff.position.copy(mitte); else kabelstangeAn(z.griff, g, anker);
            seil(z.seil, anker, mitte.clone().add(anker.clone().sub(mitte).normalize().multiplyScalar(o.einarmig || art !== 'pushdown' ? 0 : 0.03)));
          }
          if (z.band_l) for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['band_' + s], V(sg * 0.04, 2.0, 0.42), g.hand[s]);
          if (band) seil(z.seil, V(-0.13, 0.02, -0.25), mitte);
          if (z.kh_l && art === 'ueberkopf') { z.kh_l.position.copy(mitte); z.kh_l.quaternion.setFromUnitVectors(V(1, 0, 0), g.hand.l.clone().sub(g.ellbogen.l).normalize()); }
        }
      };
    },
    // Band an der Tür: Kamera von der Seite, leicht von hinten, damit die Tür nichts verdeckt
    blick: V(0, 1.1, 0), abstand: 3.4, kameraRicht: art === 'pushdown' && last === 'band' ? V(1, 0.25, -0.2) : V(1, 0.25, 0.55)
  };
}

/* =================================================================== */
/* Rumpf                                                                */
/* =================================================================== */

// art: plank | seitstuetz | deadbug | birddog | crunch | curlup | beinheben_haengend | beinheben_liegend | rollout | pallof | hollow | russian | kabelcrunch | rueckenstrecker | superman
//   | plank_knie | body_saw | rollout_stehend | reverse_crunch | knieheben_haengend | hollow_rock | bauchmaschine | rueckenstrecker_maschine ; pallof: last band ; rollout: last langhantel
// Neu: situp | vup | fahrrad | schultertippen | mountain | lsitz | negativ_crunch ; seitstuetz + heben (Hüfte senken und heben)
export function rumpfuebung(o = {}) {
  const art = o.art || 'plank';
  if (['situp', 'vup', 'fahrrad', 'schultertippen', 'mountain', 'lsitz', 'negativ_crunch'].includes(art)) return rumpfNeu(art);
  if (['plank_knie', 'body_saw', 'rollout_stehend', 'reverse_crunch', 'knieheben_haengend', 'hollow_rock', 'bauchmaschine', 'rueckenstrecker_maschine'].includes(art)) return rumpfMehr(art);
  const band = art === 'pallof' && o.last === 'band';
  return {
    aufbau(ger) {
      const z = {};
      if (['plank', 'seitstuetz', 'deadbug', 'birddog', 'crunch', 'curlup', 'beinheben_liegend', 'hollow', 'russian', 'superman', 'rollout'].includes(art)) ger.matte();
      if (art === 'beinheben_haengend') z.stange = ger.stange(2.25, 1.2, 0);
      if (band) { ger.box(0.08, 1.4, 0.08, V(-0.9, 0.7, 0), ger.mRahmen); z.seil = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.griff = ger.griff(); z.griff.visible = false; }
      else if (art === 'pallof' || art === 'kabelcrunch') { ger.turm(V(art === 'pallof' ? -0.9 : 0, 0, art === 'pallof' ? 0 : -0.45)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); }
      if (art === 'rollout' && o.last === 'langhantel') z.lh = ger.langhantel();
      else if (art === 'rollout') { z.rad = ger.zyl(0.1, 0.08, ger.mScheibe, 24); z.rad.rotation.z = Math.PI / 2; }
      if (art === 'rueckenstrecker') { const f = V(0, 0.42, -0.45), bk = V(0, 0.98, 0.12); hyperBauen(ger, f, bk, bk.clone().sub(f).normalize()); }
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'plank' || art === 'seitstuetz' || art === 'hollow' || art === 'superman') {
        if (art === 'seitstuetz') {
          // Schulter bleibt über dem Unterarm (untere Schulter etwa 33 cm hoch); mit Hüftheben sinkt nur das Becken und hebt sich wieder
          const ang = 20.5;
          const richt = V(0, Math.sin(ang * RAD), -Math.cos(ang * RAD));
          const fussP = V(0, FY, 0.75);
          const sch = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02 + MASS.rumpf - 0.03));
          const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02 + 0.02 * atmen)).add(V(0, o.heben ? -mix(0.13, 0, t) : 0, 0));
          const oben = sch.clone().sub(becken).normalize();
          const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), oben).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -90 * RAD));
          const r = { basis, neigung: 0 };
          const k = rumpf(becken, r);
          return { pose: { becken, rumpf: r, hand: { l: k.schulter.l.clone().add(V(0, 0.45, 0)), r: V(-0.05, 0.03, -0.22) }, ellbogenPol: { l: V(0, 1, 0), r: V(0, 0, 1) }, fuss: { l: fussP.clone().add(V(0, 0.1, 0)), r: fussP.clone() }, kniePol: seiten(() => V(0, 0, -1)), fussRicht: seiten(() => V(-1, 0, 0)) } };
        }
        if (art === 'hollow' || art === 'superman') {
          const r = { basis: art === 'hollow' ? LIEGEND : BAUCHLAGE, neigung: art === 'hollow' ? 12 : -8 };
          const becken = V(0, 0.12, 0.25);
          const k = rumpf(becken, r);
          const hoch = 0.12 + 0.03 * atmen, S = art === 'hollow' ? seiten : seitenBauch;
          return { pose: { becken, rumpf: r, hand: S((s, sg) => k.schulter[s].clone().add(V(sg * 0.1, hoch, -ARM * 0.95))), ellbogenPol: seiten(() => V(0, 1, 0)), fuss: S((s, sg) => V(sg * 0.08, hoch + 0.05, (art === 'hollow' ? 0.25 + BEIN * 0.98 : 0.27 + BEIN * 0.998))), kniePol: seiten(() => V(0, art === 'hollow' ? 1 : -1, 0)), fussRicht: seiten(() => V(0, art === 'hollow' ? 0.3 : -0.3, 1)) } };
        }
        // Unterarmstütz
        const richt = V(0, Math.sin(13 * RAD), -Math.cos(13 * RAD));
        const fussP = V(0, FY, 0.8);
        const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.03 + 0.015 * atmen));
        const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), richt);
        const r = { basis: new THREE.Quaternion().setFromAxisAngle(richt, Math.PI).multiply(basis), neigung: 0 };
        const k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, hand: seitenBauch((s, sg) => V(sg * 0.1, 0.05, k.schulter[s].z - 0.3)), ellbogenPol: seitenBauch((s, sg) => V(sg * 0.2, -1, 0.2)), fuss: seitenBauch((s, sg) => fussP.clone().add(V(sg * 0.09, 0, 0))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -1, 0.3)) } };
      }
      if (art === 'deadbug' || art === 'birddog') {
        const links = (Math.floor(t * 0.999 * 2) % 2 === 0);
        const w = Math.sin(t * Math.PI);
        if (art === 'deadbug') {
          const r = { basis: LIEGEND, neigung: 0 };
          const becken = V(0, 0.12, 0.25);
          const k = rumpf(becken, r);
          const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.02, ARM * 0.92, 0)).add(V(0, 0, (s === 'l') === links ? -ARM * 0.9 * w : 0)).add(V(0, (s === 'l') === links ? -ARM * 0.7 * w : 0, 0)));
          const fuss = seiten((s, sg) => {
            const gestreckt = (s === 'r') === links;
            return V(sg * 0.12, mix(0.5, 0.18, gestreckt ? w : 0), mix(0.68, 1.12, gestreckt ? w : 0));
          });
          return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten(() => V(0, 0, 1)), fuss, kniePol: seiten(() => V(0, 1, 0.5)), fussRicht: seiten(() => V(0, 0.3, 1)) } };
        }
        // Vierfüßlerstand
        const becken = V(0, 0.54, -0.3);
        const r = { basis: BAUCHLAGE, neigung: 0 };
        const k = rumpf(becken, r);
        // In Bauchlage liegt die linke Körperseite bei -x: Seite aus der Schulter nehmen, nicht aus sg
        const sx = (s) => Math.sign(k.schulter[s].x);
        const hand = seiten((s) => (s === 'l') === links ? k.schulter[s].clone().add(V(0, 0.05 * w, -ARM * 0.95 * w)).add(V(0, -ARM * 0.9 * (1 - w), 0)) : V(k.schulter[s].x, 0.04, k.schulter[s].z));
        const fuss = seiten((s) => (s === 'r') === links ? V(sx(s) * 0.1, mix(0.1, 0.54, w), mix(-0.3 + MASS.oberschenkel, -0.3 + BEIN * 0.98, w)) : V(sx(s) * 0.1, 0.1, -0.3 + MASS.oberschenkel));   // Knie unter der Hüfte am Boden
        return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, hand, ellbogenPol: seiten(() => V(0, 1, 0)), fuss, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.2, 1)) } };
      }
      if (art === 'crunch' || art === 'curlup' || art === 'russian') {
        const heben = art === 'curlup' ? 18 : art === 'russian' ? 45 : 35;
        const r = { basis: LIEGEND, neigung: art === 'russian' ? heben : mix(0, heben, t), drehung: art === 'russian' ? mix(-35, 35, t) : 0 };
        const becken = V(0, art === 'russian' ? 0.155 : 0.12, 0.25);   // Russian Twist: sitzt auf dem Po, nicht darin
        const k = rumpf(becken, r);
        const hand = art === 'russian' ? seiten((s, sg) => k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.35)).add(V(sg * 0.04, 0, 0)))
          : art === 'curlup' ? seiten((s, sg) => becken.clone().add(V(sg * 0.06, -0.06, -0.08)))   // Hände unter dem unteren Rücken
          : seiten((s, sg) => k.brust.clone().add(k.R.oben.clone().multiplyScalar(0.14)).add(k.R.links.clone().multiplyScalar(sg * 0.13)));
        return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => k.R.links.clone().multiplyScalar(sg)), fuss: seiten((s, sg) => V(sg * 0.15, art === 'russian' ? 0.2 : FY, 0.7)), kniePol: seiten(() => V(0, 1, 0)) } };
      }
      if (art === 'beinheben_haengend' || art === 'beinheben_liegend') {
        const haengend = art === 'beinheben_haengend';
        const w = mix(0, 85, t) * RAD;
        if (haengend) {
          const becken = V(0, 2.25 - ARM * 0.99 - (MASS.rumpf - 0.03) + 0.03, -0.02);
          const r = { neigung: mix(0, -15, t) };
          const fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.08, -Math.cos(w) * BEIN * 0.96, Math.sin(w) * BEIN * 0.96)));
          return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.3, 2.25, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3)), fuss, kniePol: seiten(() => V(0, 1, 1)), fussRicht: seiten(() => V(0, Math.sin(w), Math.cos(w))) } };
        }
        const r = { basis: LIEGEND, neigung: 0 };
        const becken = V(0, 0.12, 0.25);
        const k = rumpf(becken, r);
        const fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.08, Math.sin(w) * BEIN * 0.96 + 0.02, Math.cos(w) * BEIN * 0.96)));
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => becken.clone().add(V(sg * 0.25, -0.06, -0.05))), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)), fuss, kniePol: seiten(() => V(0, 1, 0)), fussRicht: seiten(() => V(0, Math.cos(w), -Math.sin(w) + 1)) } };
      }
      if (art === 'rollout') {
        const winkel = mix(10, 50, t);   // 10 = gestreckt weit vorne, 60 = zurück
        const knieP = V(0, 0.065, -0.25);   // Kniemitte: Knie liegt auf der Matte
        const richt = V(0, Math.sin(winkel * RAD), Math.cos(winkel * RAD));
        const becken = knieP.clone().add(richt.clone().multiplyScalar(MASS.oberschenkel + 0.02));
        const r = { basis: basisAus(V(0, Math.sin(mix(12, 25, t) * RAD), Math.cos(mix(12, 25, t) * RAD)), V(0, -1, 0)), neigung: 0 };
        const k = rumpf(becken, r);
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5);
        // Rad: Griffe 0,1 m hoch; Langhantel: Stange liegt auf großen Scheiben (Radius 0,225 m)
        const lh = o.last === 'langhantel', griffY = lh ? 0.225 : 0.1;
        const radZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.995) ** 2 - (sm.y - griffY) ** 2));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand: seiten((s, sg) => V(sg * (lh ? 0.2 : 0.08), griffY, radZ)), greift: seiten(() => true), ellbogenPol: seiten(() => V(0, 1, 0)), fuss: seiten((s, sg) => V(sg * 0.1, 0.1, -0.25 - MASS.unterschenkel * 0.97)), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) { if (z.lh) { z.lh.position.set(0, griffY, radZ); z.lh.quaternion.identity(); } else z.rad.position.set(0, 0.1, radZ); } };
      }
      if (art === 'pallof') {
        const becken = V(0, 0.95, 0); const r = { neigung: 0 }; const k = rumpf(becken, r);
        const nah = k.brust.clone().add(V(0, -0.1, 0.12)), weit = k.brust.clone().add(V(0, -0.1, ARM * 0.95));
        const hand = seiten((s, sg) => mv(nah, weit, t).add(V(sg * 0.025, 0, 0)));
        return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, stehFuesse(0.2)),
          props(g, z) { const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5); z.griff.position.copy(m); const a = V(-0.9, 1.1, 0); const d = m.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(m).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); } };
      }
      if (art === 'kabelcrunch') {
        const becken = V(0, 0.5, 0.0);
        const r = { neigung: mix(25, 75, t) };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => k.brust.clone().add(k.R.oben.clone().multiplyScalar(0.12)).add(k.R.links.clone().multiplyScalar(sg * 0.08)).add(k.R.vor.clone().multiplyScalar(0.1)));
        return { pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, -1, 1)), fuss: seiten((s, sg) => V(sg * 0.15, 0.1, -0.42)), kniePol: seiten(() => V(0, -1, 0.4)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) { const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5); z.griff.position.copy(m); const a = V(0, 2.0, -0.45); const d = m.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(m).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); } };
      }
      if (art === 'rueckenstrecker') {
        const becken = V(0, 0.98, 0.12);
        const r = { neigung: mix(95, 40, t) };
        const k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: -20 }, hand: seiten((s, sg) => k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.12)).add(k.R.vor.clone().multiplyScalar(0.12))), ellbogenPol: seiten((s, sg) => V(sg, 0, 0)), fuss: seiten((s, sg) => V(sg * 0.12, 0.42, -0.45)), kniePol: seiten(() => V(0, 0, 1)),
          fussRicht: seiten(() => V(0, -1, 1)), fussFlaeche: seiten(() => V(0, 0.56, 0.57).normalize()), faust: seiten(() => true) } };
      }
      return rumpfuebung({ art: 'plank' }).pose(t);
    },
    blick: V(0, 0.45, 0.1), abstand: 3.5, kameraRicht: V(1, 0.45, 0.3), dauer: art === 'seitstuetz' && o.heben ? undefined : ['plank', 'seitstuetz', 'hollow', 'superman'].includes(art) ? [1.5, 0.2, 1.5, 0.2] : art === 'deadbug' || art === 'birddog' ? [1.2, 0.6, 1.2, 0.2] : undefined
  };
}

// Tragen & Gehen: art: farmer | suitcase | schulterheben (Shrugs) ; last: kurzhanteln | langhantel | kettlebell | kabel | multipresse
// Neu: ueberkopf (zwei Hanteln über Kopf) | kellner (eine Kettlebell über Kopf) | frontal (eine Hantel vor der Brust) | seitbeugen (stehend, Hantel rechts)
export function tragen(o = {}) {
  const art = o.art || 'farmer';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'kellner') { z.kb = ger.kettlebell(); return z; }
      if (art === 'frontal' || art === 'seitbeugen') { z.kh_l = ger.kurzhantel(); return z; }
      if (o.last === 'langhantel' || o.last === 'multipresse') z.lh = ger.langhantel();
      else if (o.last === 'kabel') { ger.turm(V(0, 0, 0.6)); z.lh = ger.griff(); z.lh.scale.set(3.6, 1, 1); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }
      else khAufbauen(ger, z, art !== 'suitcase');
      if (o.last === 'multipresse') schienenAufbauen(ger, z);
      return z;
    },
    pose(t, z) {
      if (art === 'schulterheben') {
        const becken = V(0, 0.975, 0); const r = { neigung: 4 }; const k = rumpf(becken, r);
        const hub = mix(0, 0.06, t);
        const vorn = o.last === 'kabel' || o.last === 'multipresse' || o.last === 'langhantel';
        // Arme bleiben gestreckt, nur die Schultern gehen hoch (schulterHub)
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.06, -Math.sqrt((ARM * 0.999) ** 2 - (vorn ? 0.13 : 0.03) ** 2) + hub, vorn ? 0.13 : 0.03)));
        return { pose: Object.assign({ becken, rumpf: r, hand, schulterHub: hub, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)) }, stehFuesse(0.13)),
          props(g, z) {
            if (z.lh) { stangeAn(z.lh, g); schienenAn(z); } else kurzhantelnAn(z, g, 'quer');
            if (z.seil) seil(z.seil, V(0, 0.15, 0.55), z.lh.position);
          } };
      }
      if (art === 'seitbeugen') {
        const becken = V(0, 0.975, 0), r = { neigung: 2, seit: mix(-22, 8, t) };
        const k = rumpf(becken, r);
        const hand = { r: k.schulter.r.clone().add(V(0, -ARM * 0.9995, 0)), l: k.brust.clone().add(k.R.links.clone().multiplyScalar(0.16)).sub(k.R.oben.clone().multiplyScalar(0.36)).add(k.R.vor.clone().multiplyScalar(0.05)) };
        return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: { r: V(-0.3, 0, -1), l: V(1, 0, -0.5) } }, stehFuesse(0.15)),
          props(g, z) { khHalten(z, g, 'r', z.kh_l, 'neutral'); } };
      }
      // Gehen auf der Stelle: t läuft gleichmäßig
      const p = t * Math.PI * 2;
      const becken = V(0, 0.965 + 0.015 * Math.abs(Math.sin(p)), 0);
      const r = { neigung: 2, seit: art === 'suitcase' ? 0 : 0 };
      const k = rumpf(becken, r);
      const fuss = seiten((s, sg) => { const ph = p + (s === 'l' ? 0 : Math.PI); return V(sg * 0.11, FY + Math.max(0, Math.sin(ph)) * 0.09, Math.cos(ph) * 0.2); });
      const oben = (s, sg) => k.schulter[s].clone().add(V(sg * 0.03, ARM * 0.96, 0.02));
      const hand = seiten((s, sg) => art === 'suitcase' && s === 'l' ? k.schulter[s].clone().add(V(0.18, -0.35, 0.05))
        : art === 'ueberkopf' || (art === 'kellner' && s === 'l') ? oben(s, sg)
        : art === 'frontal' ? k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.05)).add(k.R.vor.clone().multiplyScalar(0.2)).sub(k.R.oben.clone().multiplyScalar(0.12))
        : k.schulter[s].clone().add(V(sg * 0.07, -ARM * 0.9995, 0)));
      const epol = seiten((s, sg) => art === 'ueberkopf' || (art === 'kellner' && s === 'l') ? V(sg, 0, 0) : art === 'frontal' ? V(sg * 0.3, -1, 0) : V(sg * 0.3, 0, -1));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: art === 'ueberkopf' || art === 'kellner' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, fuss, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) {
          if (z.kb) { kettlebellAn(z.kb, g, 'l'); return; }
          if (art === 'frontal') { z.kh_l.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)); z.kh_l.quaternion.setFromUnitVectors(V(1, 0, 0), g.R.oben); return; } if (z.lh) stangeAn(z.lh, g); else { if (z.kh_l && art === 'suitcase') khHalten(z, g, 'r', z.kh_l, 'neutral'); else kurzhantelnAn(z, g, 'hammer'); } } };
    },
    blick: V(0, 0.85, 0), abstand: 3.4, dauer: art === 'schulterheben' ? undefined : [1.2, 0, 0, 0]
  };
}

// Kabel/Band-Übungen im Stehen: art: facepull | crossover | kabelfly_tief | kickback_bein | abduktion_bein | adduktion_bein | woodchop | holzhacker_quer | ueberzug ; last: kabel | band
// Neu: kickback_bein + last maschine (Brustpolster, Hebel hinter der Ferse)
export function kabelstand(o = {}) {
  const art = o.art || 'facepull', last = o.last || 'kabel';
  const kbMaschine = art === 'kickback_bein' && last === 'maschine';
  // Fliegende mit Band: Band läuft hinter dem Rücken um einen Pfosten auf Brusthöhe
  const bandFly = art === 'crossover' && last === 'band';
  const anker = bandFly ? V(0.45, 1.3, -0.48) : { facepull: V(0, 1.7, 0.75), crossover: V(0.85, 1.9, -0.1), kabelfly_tief: V(0.85, 0.2, -0.1), kickback_bein: V(0, 0.15, 0.7), abduktion_bein: V(-0.7, 0.15, 0), adduktion_bein: V(0.75, 0.15, 0), woodchop: V(0.8, 1.9, 0.2), holzhacker_quer: V(0.85, 1.25, 0.1), ueberzug: V(0, 2.0, 0.75) }[art];
  return {
    aufbau(ger) {
      const z = {};
      if (kbMaschine) { const becken = V(0, 0.96, -0.08); kickbackMaschineBauen(ger, z, becken, { neigung: 55 }, becken.clone().add(V(-0.095, -0.02, 0)), BEIN * 0.95); return z; }
      if (last === 'kabel') { if (art === 'crossover' || art === 'kabelfly_tief') { ger.turm(V(0.85, 0, -0.1)); ger.turm(V(-0.85, 0, -0.1)); } else ger.turm(V(anker.x, 0, anker.z)); }
      if (bandFly) { ger.box(0.1, 1.6, 0.1, V(0, 0.8, -0.52), ger.mRahmen); ger.box(1.0, 0.07, 0.07, V(0, 1.3, -0.52), ger.mRahmen); }
      const dicke = last === 'band' ? 0.012 : 0.006, m = last === 'band' ? ger.mBand : ger.mKabel;
      z.seil_l = ger.stab(V(), V(0, 1, 0), dicke, m);
      if (art === 'crossover' || art === 'kabelfly_tief') z.seil_r = ger.stab(V(), V(0, 1, 0), dicke, m);
      return z;
    },
    pose(t) {
      let becken = V(0, 0.975, 0), r = { neigung: 4 }, hand = {}, epol = {}, fuss, kpol, fussRicht, fussFlaeche;
      const k = rumpf(becken, r);
      if (art === 'facepull' || art === 'ueberzug') {
        for (const [s, sg] of [['l', 1], ['r', -1]]) {
          const weit = k.schulter[s].clone().add(V(sg * 0.08, art === 'ueberzug' ? 1.55 : 1.42, 0.62).sub(k.schulter[s]).normalize().multiplyScalar(ARM * 0.99));
          const nah = art === 'ueberzug' ? k.schulter[s].clone().add(V(sg * 0.05, -0.55, 0.1).normalize().multiplyScalar(ARM * 0.98)) : k.schulter[s].clone().add(V(sg * 0.22, 0.2, 0.08));
          hand[s] = mv(weit, nah, t); epol[s] = art === 'ueberzug' ? V(sg, 0, 0) : V(sg, 0.4, -0.2);
        }
      } else if (art === 'crossover' || art === 'kabelfly_tief') {
        for (const [s, sg] of [['l', 1], ['r', -1]]) {
          // offen: Arme seitlich, leicht vor der Brustebene (nicht weit dahinter), Ellbogen leicht gebeugt
          const offen = k.schulter[s].clone().add(V(sg * 0.5, bandFly ? -0.04 : art === 'crossover' ? 0.08 : -0.2, bandFly ? 0.08 : 0.14).normalize().multiplyScalar(ARM * 0.972));
          const zu = k.brust.clone().add(V(sg * 0.06, bandFly ? -0.1 : art === 'crossover' ? -0.3 : 0.05, bandFly ? 0.55 : 0.58));
          hand[s] = mv(offen, zu, t); epol[s] = V(sg, 0.3, -0.6);
        }
      } else if (art === 'woodchop' || art === 'holzhacker_quer') {
        r = { neigung: 6, drehung: mix(40, -35, t) };
        const p0 = art === 'woodchop' ? mv(V(0.55, 1.55, 0.25), V(-0.35, 0.65, 0.35), t) : mv(V(0.38, 1.22, 0.38), V(-0.32, 1.18, 0.4), t);
        // Arme bleiben fast gestreckt: Griff in Richtung p0, auf Armlänge von beiden Schultern
        const k2 = rumpf(becken, r), mitte = k2.schulter.l.clone().add(k2.schulter.r).multiplyScalar(0.5);
        const p = mitte.clone().add(p0.sub(mitte).normalize().multiplyScalar(Math.sqrt((ARM * 0.96) ** 2 - MASS.schulterBreite ** 2)));
        hand = { l: p.clone().add(V(0.03, 0, 0)), r: p.clone().add(V(-0.03, 0, 0)) }; epol = seiten((s, sg) => V(sg, -1, 0));
      } else {
        // Bein-Übungen am Kabel: rechtes Bein arbeitet
        hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.15, -0.45, 0.25))); epol = seiten((s, sg) => V(sg, -1, -0.3));
        const w = mix(0, art === 'kickback_bein' ? 30 : 32, t) * RAD;
        const huefteR = becken.clone().add(V(-0.095, -0.02, 0));
        const richt = art === 'kickback_bein' ? V(0, -Math.cos(w), -Math.sin(w)) : art === 'abduktion_bein' ? V(-Math.sin(w), -Math.cos(w), 0) : V(Math.sin(w * 0.8), -Math.cos(w), 0.05);
        fuss = { l: V(0.11, FY, 0), r: huefteR.clone().add(richt.multiplyScalar(BEIN * 0.97)) };
        kpol = seiten((s, sg) => V(sg * 0.1, 0, 1)); fussRicht = { l: V(0.2, 0, 1), r: V(-0.1, -0.2, 1) };
        if (art === 'kickback_bein') { r = { neigung: 20 }; }
        if (kbMaschine) {
          // Oberkörper liegt schräg auf dem Polster, Hände am Griff, rechtes Bein drückt nach hinten-oben
          becken = V(0, 0.96, -0.08); r = { neigung: 55 };
          const k2 = rumpf(becken, r);
          hand = seiten((s, sg) => V(sg * 0.2, 1.0, 0.53)); epol = seiten((s, sg) => V(sg, -0.5, 0));
          const w2 = mix(-5, 40, t) * RAD, huefteR = becken.clone().add(V(-0.095, -0.02, 0));
          const d = V(0, -Math.cos(w2), -Math.sin(w2));
          fuss = { l: V(0.11, FY + 0.04, 0.0), r: huefteR.clone().add(d.clone().multiplyScalar(BEIN * 0.95)) };
          // Fußsohle liegt flach auf der Platte des Hebels (senkrecht zum Bein), Zehen nach vorn
          kpol = seiten((s, sg) => V(sg * 0.1, 0, 1)); fussRicht = { l: V(0.15, 0, 1), r: V(0, d.z, -d.y) }; fussFlaeche = { r: d.clone().negate() };
          void k2;
        }
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol }, fuss ? { fuss, kniePol: kpol, fussRicht, fussFlaeche } : stehFuesse(0.16, art === 'facepull' ? -0.05 : 0)),
        props(g, z) {
          if (z.hebel) {   // Hebel dreht mit dem Bein um die Hüftachse
            const d = g.knoechel.r.clone().sub(g.huefte.r); d.x = 0; d.normalize();
            z.hebel.quaternion.setFromUnitVectors(V(0, -1, 0), d); z.block.heben(0.3 * t); return;
          }
          const ziele = art === 'crossover' || art === 'kabelfly_tief' ? [['seil_l', g.hand.l, anker], ['seil_r', g.hand.r, V(-anker.x, anker.y, anker.z)]] :
            ['kickback_bein', 'abduktion_bein', 'adduktion_bein'].includes(art) ? [['seil_l', g.knoechel.r, anker]] : [['seil_l', g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), anker]];
          for (const [n, ziel, a] of ziele) { const d = ziel.clone().sub(a), l = d.length(); z[n].position.copy(a).add(ziel).multiplyScalar(0.5); z[n].quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z[n].scale.set(1, l, 1); }
        }
      };
    },
    blick: V(0, 1.0, 0), abstand: 3.6, kameraRicht: V(0.9, 0.3, 0.7)
  };
}

// Schwung: Kettlebell Swing
export function swing() {
  const kh = kreuzheben({ art: 'kettlebell' });
  return {
    aufbau: kh.aufbau,
    pose(t) {
      const becken = mv(V(0, 0.84, -0.2), V(0, 0.975, 0), t);
      const r = { neigung: mix(47, 0, t) };   // unten Hüfte etwa 60–90° gebeugt (Hinge, keine Hocke)
      const k = rumpf(becken, r);
      const w = mix(-20, 90, t) * RAD;  // Arme pendeln nach vorn bis Schulterhöhe
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(-sg * 0.1, 0, 0)).add(V(0, -Math.cos(w), Math.sin(w)).multiplyScalar(ARM * 0.97)));
      return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg, 0, -0.5)), kniePol: seiten((s, sg) => V(sg * 0.3, 0, 1)) }, stehFuesse(0.2)),
        props(g, z) { z.kb.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)); } };
    },
    blick: V(0, 0.8, 0), abstand: 3.6, kameraRicht: V(1, 0.3, 0.3), dauer: [0.6, 0.15, 0.6, 0.1]
  };
}

// Nordic Curl & Rückneigen im Kniestand: art: nordic | reverse_nordic
// Neu: ghd (Glute Ham Raise: Knie auf dem Polster in 0,95 m Höhe, aus der Waagerechten hoch)
export function kniestand(o = {}) {
  const art = o.art || 'nordic', ghd = !!o.ghd, hy = ghd ? 0.88 : 0;
  return {
    aufbau(ger) {
      if (ghd) { ghdBauen(ger, V(0, 0.07 + hy, 0), -MASS.unterschenkel * 0.98, 0.12 + hy); return {}; }   // GHD-Gerät: Kniepolster vorn, Fußplatte mit Rollen hinten
      ger.matte(); if (art === 'nordic') ger.box(0.5, 0.1, 0.1, V(0, 0.1, -0.48), ger.mPolster); return {};
    },
    pose(t) {
      const knie = V(0, 0.07 + hy, 0);
      const w = ghd ? mix(88, 0, t) : art === 'nordic' ? mix(65, 0, t) : mix(-40, 0, t);      // Neigung des ganzen Körpers ab Knie (+ = nach vorn)
      const richt = V(0, Math.cos(w * RAD), Math.sin(w * RAD));
      const becken = knie.clone().add(richt.clone().multiplyScalar(MASS.oberschenkel));
      const r = { neigung: w };
      const k = rumpf(becken, r);
      const hand = seiten((s, sg) => art === 'nordic' ? k.brust.clone().add(V(sg * 0.15, -0.15, 0.2)) : becken.clone().add(V(sg * 0.2, 0, 0.05)));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg, -1, -0.5)), fuss: seiten((s, sg) => V(sg * 0.1, 0.12 + hy, -MASS.unterschenkel * 0.98)), kniePol: seiten(() => V(0, -1, 0.3)), fussRicht: seiten(() => V(0, -0.2, -1)), fussFlaeche: ghd ? seiten(() => V(0, 0, 1)) : undefined } };
    },
    blick: V(0, 0.5 + hy * 0.6, 0), abstand: 3.3, kameraRicht: V(1, 0.3, 0.2)
  };
}

// Mobilität / sonstiges Liegen: art: clamshell | seitlage_abduktion | seitlage_adduktion | aussenrotation
export function seitlage(o = {}) {
  const art = o.art || 'clamshell';
  return {
    aufbau(ger) { ger.matte(); const z = {}; if (art === 'aussenrotation') z.kh_l = ger.kurzhantel(); return z; },
    pose(t) {
      // auf der rechten Seite liegend, Kopf nach -z
      const basis = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, 0, 90 * RAD, 'ZXY'));
      const r = { basis, neigung: 0 };
      const becken = V(0, 0.2, 0.2);
      const k = rumpf(becken, r);
      let fuss, kpol;
      if (art === 'clamshell') {
        const offen = mix(0, 0.28, t);
        fuss = { l: V(0.07, 0.2, 0.55), r: V(-0.07, 0.1, 0.55) };
        kpol = { l: V(-1, offen * 4, 0.2), r: V(-1, -0.05, 0.2) };
      } else if (art === 'seitlage_adduktion') {
        // Oberes Bein steht gebeugt vor dem Körper, das untere Bein hebt sich
        const w = mix(0, 22, t) * RAD;
        fuss = { l: becken.clone().add(V(-0.35, -0.12, 0.38)), r: becken.clone().add(V(-0.05, -0.08 + Math.sin(w) * BEIN * 0.98, BEIN * 0.98 * Math.cos(w))) };
        kpol = { l: V(-0.5, 1, 0.3), r: V(-1, 0, 0) };
      } else {
        const w = art === 'seitlage_abduktion' ? mix(0, 35, t) * RAD : 0;
        fuss = { l: becken.clone().add(V(0.05, 0.08 + Math.sin(w) * BEIN, BEIN * 0.95 * Math.cos(w))), r: becken.clone().add(V(-0.05, -0.08, BEIN * 0.95)) };
        kpol = seiten(() => V(0, 0, 1));
      }
      const hand = { l: art === 'aussenrotation' ? k.schulter.l.clone().add(V(0.05, -0.25, 0)).add(V(0, mix(0, 0.22, t), mix(0.25, 0.05, t))) : becken.clone().add(V(0.1, 0.2, 0.05)), r: k.schulter.r.clone().add(V(0, 0.08, -0.3)) };
      return { pose: { becken, rumpf: r, hand, ellbogenPol: { l: V(0, -1, 0), r: V(0, 1, 0) }, fuss, kniePol: kpol, fussRicht: seiten(() => V(0, 0, 1)) },
        props(g, z) { if (z.kh_l) khHalten(z, g, 'l', z.kh_l, 'neutral'); } };
    },
    blick: V(0, 0.3, 0.2), abstand: 3.0, kameraRicht: V(0.6, 0.8, 0.5)
  };
}

/* =================================================================== */
/* Ergänzungen (27.10.): Maschinen, Kopfüber, einbeinig, Varianten      */
/* =================================================================== */

// Bankdips: Hände hinter dir auf der Bankkante, Beine vorn, Körper senkt sich senkrecht
function bankDips() {
  return {
    aufbau(ger) { ger.box(1.0, 0.45, 0.36, V(0, 0.225, -0.42), ger.mPolster); return {}; },
    pose(t) {
      // Unten nur so tief, dass der Oberarm höchstens etwa 60° hinter den Körper geht (Schulter schonen), oben Arme gestreckt
      const becken = mv(V(0, 0.385, -0.13), V(0, 0.555, -0.14), t), r = { neigung: 6 };
      const hand = seiten((s, sg) => V(sg * 0.2, 0.47, -0.27));   // Hände flach auf der Bankkante
      return { pose: { becken, rumpf: r, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.2, 0, -1)),
        fuss: seiten((s, sg) => V(sg * 0.12, FY, 0.62)), kniePol: seiten((s, sg) => V(sg * 0.1, 1, 1)), fussRicht: seiten(() => V(0, 0.2, 1)) } };
    },
    blick: V(0, 0.6, 0), abstand: 3.0, kameraRicht: V(1, 0.3, 0.45)
  };
}

// Dip-Maschine im Sitzen: Griffe seitlich, nach unten drücken
function dipMaschine() {
  const becken = V(0, 0.56, -0.08), r = { neigung: 10 };   // leicht nach vorn geneigt (Schulter schonen)
  const k = rumpf(becken, r);
  // Griffe (längs, Handflächen zueinander) laufen auf dem Bogen der Hebel: oben vor der Schulter, unten neben der Hüfte, Arme gestreckt
  const h0 = (s, sg) => k.schulter[s].clone().add(V(sg * 0.1, -0.2, 0.08)), h1 = (s, sg) => k.schulter[s].clone().add(V(sg * 0.1, -1, 0).normalize().multiplyScalar(ARM * 0.985));
  const C = bogenMitte(h0('l', 1), h1('l', 1), { z: becken.z - 0.5 });
  return {
    aufbau(ger) { const z = {}; drueckmaschineBauen(ger, z, becken, r, C, 'laengs'); return z; },
    pose(t) {
      const hand = seiten((s, sg) => bogenHand(h0(s, sg), h1(s, sg), C, t));
      return { pose: { becken, rumpf: r, hand, handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)), fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { drueckmaschineStellen(z, g, t); } };
    },
    blick: V(0, 0.8, 0), abstand: 3.2, kameraRicht: V(1, 0.3, 0.6)
  };
}

// Rumpf, Teil 3: Sit-up, V-Up, Fahrrad-Crunch, Schultertippen, Mountain Climber, L-Sitz, Crunch auf der Negativbank
function rumpfNeu(art) {
  const neg = art === 'negativ_crunch';
  const NEG = -24;   // Negativbank: Kopfende tiefer
  const qNeg = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), NEG * RAD), P = V(0, 0.6, 0.25);
  const dreh = (p) => neg ? p.clone().sub(V(0, 0.12, 0.25)).applyQuaternion(qNeg).add(P) : p;
  const drehR = (v) => neg ? v.clone().applyQuaternion(qNeg) : v;
  return {
    aufbau(ger) {
      const z = {};
      if (['situp', 'vup', 'fahrrad', 'schultertippen', 'mountain'].includes(art)) ger.matte();
      if (art === 'lsitz') dipBarrenBauen(ger);
      if (neg) {
        const pad = ger.box(0.32, 0.07, 1.3, V(), ger.mPolster); pad.position.copy(dreh(V(0, 0.04, 0.05))); pad.quaternion.copy(qNeg);
        ger.box(0.06, 0.5, 0.06, V(0, 0.25, -0.35), ger.mRahmen); ger.box(0.06, 0.75, 0.06, V(0, 0.375, 0.55), ger.mRahmen);
        const rolle = ger.zyl(0.05, 0.36, ger.mPolster); rolle.rotation.z = Math.PI / 2; rolle.position.copy(dreh(V(0, 0.14, 0.82)));
      }
      return z;
    },
    pose(t) {
      if (art === 'schultertippen' || art === 'mountain') {
        // Hoher Stütz: Hände unter den Schultern, Körper gerade
        const w = Math.sin(t * Math.PI * 2), heb = { l: Math.max(0, w), r: Math.max(0, -w) };
        const sch = V(0, 0.04 + STUETZ * 0.96, 0.39), stuetz = V(0, 0.11, -0.95);
        const b = brettPose(stuetz, sch);
        if (art === 'mountain') {   // Hüfte kommt beim Knieanziehen etwas hoch, sonst schleift das Knie am Boden
          const hoch = b.becken.clone().add(V(0, 0.14 * Math.min(1, 2 * Math.max(heb.l, heb.r)), 0)), richt = sch.clone().sub(hoch).normalize();
          b.becken = sch.clone().sub(richt.clone().multiplyScalar(MASS.rumpf - 0.03)); b.r = { basis: basisAus(richt, V(0, -1, 0)), neigung: 0 };
        }
        const k = rumpf(b.becken, b.r);
        let hand = seiten((s, sg) => V(sg * 0.22, 0.04, 0.42)), fuss = seiten((s, sg) => stuetz.clone().add(V(sg * 0.13, 0, 0)));
        let kpol = seiten(() => V(0, -1, 0));
        if (art === 'schultertippen') hand = seiten((s, sg) => mv(V(sg * 0.22, 0.04, 0.42), k.schulter[s === 'l' ? 'r' : 'l'].clone().add(V(sg * 0.02, -0.06, 0.04)), heb[s === 'l' ? 'l' : 'r']));
        else {
          fuss = seiten((s, sg) => mv(stuetz.clone().add(V(sg * 0.1, 0, 0)), V(sg * 0.12, 0.12, -0.08), heb[s]).add(V(0, 0.2 * Math.sin(Math.PI * heb[s]), 0)));
          for (const [s, sg] of [['l', 1], ['r', -1]]) {   // Ziel auf die Beinlänge kürzen (Hüfte ist beim Knieanziehen höher)
            const h = b.becken.clone().add(k.R.links.clone().multiplyScalar(sg * MASS.hueftBreite)).sub(k.R.oben.clone().multiplyScalar(0.02)), d = fuss[s].clone().sub(h);
            if (d.length() > BEIN * 0.985) fuss[s] = h.add(d.setLength(BEIN * 0.985));
          }
          kpol = seiten(() => V(0, 0, 1));
        }   // Fuß im Bogen, damit das Knie nicht über den Boden schleift
        return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.6, 0.3, -1)), fuss, kniePol: kpol, fussRicht: seiten(() => V(0, -1, 0.2)) } };
      }
      if (art === 'lsitz') {
        // Stütz am Barren, Arme gestreckt, Beine waagerecht nach vorn
        const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
        const becken = V(0, 1.25 + ARM * 0.95 - (MASS.rumpf - 0.03) - 0.03, 0.02), r = { neigung: -6 + 2 * atmen };
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.27, 1.27, 0.05)), ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)),
          fuss: seiten((s, sg) => becken.clone().add(V(sg * 0.07, 0.02 + 0.02 * atmen, BEIN * 0.97))), kniePol: seiten(() => V(0, 1, 0)), fussRicht: seiten(() => V(0, 0.3, 1)), zehen: seiten(() => -20) } };
      }
      // Rückenlage auf der Matte (Negativbank: alles um das Becken gedreht, Kopf tiefer)
      const becken0 = V(0, 0.12, 0.25);
      let neigung = 0, drehung = 0, hand, fuss, kpol = seiten(() => V(0, 1, 0)), fussRicht;
      if (art === 'situp' || neg) {
        neigung = mix(0, neg ? 40 : 82, t);
        const k = rumpf(becken0, { basis: LIEGEND, neigung });
        hand = seiten((s, sg) => k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.12)).add(k.R.links.clone().multiplyScalar(-sg * 0.1)).sub(k.R.oben.clone().multiplyScalar(0.06)));
        fuss = seiten((s, sg) => V(sg * 0.15, neg ? 0.2 : FY, neg ? 0.78 : 0.7));
      } else if (art === 'vup') {
        // Oberkörper und gestreckte Beine kommen gleichzeitig hoch, Hände greifen zu den Schienbeinen
        neigung = mix(0, 52, t);
        const w = mix(4, 58, t) * RAD;
        const k = rumpf(becken0, { basis: LIEGEND, neigung });
        fuss = seiten((s, sg) => becken0.clone().add(V(sg * 0.08, Math.sin(w) * BEIN * 0.96 + 0.02, Math.cos(w) * BEIN * 0.96)));
        const ziel = becken0.clone().add(V(0, Math.sin(w) * 0.55, Math.cos(w) * 0.55));
        hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.05, 0.06, -ARM * 0.93)), ziel.clone().add(V(sg * 0.1, 0.05, 0)), t));
        fussRicht = seiten(() => V(0, Math.cos(w), -Math.sin(w) + 1));
      } else {
        // Fahrrad-Crunch: Schultern oben, Rumpf dreht, Knie wechseln (links zieht, wenn der rechte Ellbogen kommt)
        const seite = mix(-1, 1, t);
        neigung = 30; drehung = seite * 32;
        const k = rumpf(becken0, { basis: LIEGEND, neigung, drehung });
        hand = seiten((s, sg) => k.brust.clone().add(k.R.oben.clone().multiplyScalar(0.14)).add(k.R.links.clone().multiplyScalar(sg * 0.13)));
        const anz = (s) => s === 'l' ? glatt((seite + 1) / 2) : glatt((1 - seite) / 2);   // 1 = Knie an der Brust
        fuss = seiten((s, sg) => mv(V(sg * 0.1, 0.3, 0.25 + BEIN * 0.9), V(sg * 0.1, 0.4, 0.55), anz(s)));
        fussRicht = seiten(() => V(0, 0.2, 1));
      }
      return { pose: { becken: dreh(becken0), rumpf: { basis: neg ? qNeg.clone().multiply(LIEGEND) : LIEGEND, neigung, drehung },
          hand: seiten((s) => dreh(hand[s])), ellbogenPol: seiten((s, sg) => drehR(V(sg, 0.4, 0))), fuss: seiten((s) => dreh(fuss[s])),
          kniePol: seiten((s) => drehR(kpol[s])), fussRicht: fussRicht ? seiten((s) => drehR(fussRicht[s])) : undefined } };
    },
    blick: V(0, 0.45, 0.1), abstand: 3.4, kameraRicht: art === 'lsitz' ? V(1, 0.25, 0.5) : V(1, 0.45, 0.3),
    dauer: art === 'lsitz' ? STATISCH : art === 'mountain' ? [0.6, 0, 0.6, 0] : art === 'schultertippen' ? [1.4, 0, 1.4, 0] : art === 'fahrrad' ? [1.0, 0.2, 1.0, 0.2] : undefined
  };
}

// Weitere Rumpfübungen
function rumpfMehr(art) {
  return {
    aufbau(ger) {
      const z = {};
      if (['plank_knie', 'body_saw', 'rollout_stehend', 'reverse_crunch', 'hollow_rock'].includes(art)) ger.matte();
      if (art === 'body_saw') { z.gleit_l = ger.zyl(0.08, 0.015, ger.mGold, 20); z.gleit_r = ger.zyl(0.08, 0.015, ger.mGold, 20); }
      if (art === 'rollout_stehend') { z.rad = ger.zyl(0.1, 0.08, ger.mScheibe, 24); z.rad.rotation.z = Math.PI / 2; }
      if (art === 'knieheben_haengend') ger.stange(2.25, 1.2, 0);
      if (art === 'bauchmaschine' || art === 'rueckenstrecker_maschine') rumpfmaschineBauen(ger, z, V(0, 0.56, -0.08), art === 'bauchmaschine');
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'plank_knie' || art === 'body_saw') {
        let stuetz, S, fuss;
        if (art === 'plank_knie') {
          stuetz = V(0, 0.07, 0.35);
          S = V(0, 0.34 + 0.012 * atmen, 0.35 - Math.sqrt(0.94 ** 2 - 0.27 ** 2));
          fuss = seitenBauch((s, sg) => V(sg * 0.09, 0.11, 0.35 + 0.42));
        } else {
          stuetz = V(0, FY, mix(0.92, 0.8, t));
          S = V(0, 0.34, stuetz.z - Math.sqrt(1.38 ** 2 - 0.26 ** 2));
          fuss = seitenBauch((s, sg) => stuetz.clone().add(V(sg * 0.09, 0, 0)));
        }
        const b = brettPose(stuetz, S);
        const hz = art === 'body_saw' ? -0.8 : S.z - 0.3;
        return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -5 }, hand: seitenBauch((s, sg) => V(sg * 0.1, 0.05, hz)), ellbogenPol: seitenBauch((s, sg) => V(sg * 0.2, -1, 0.2)),
            fuss, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => art === 'plank_knie' ? V(0, -0.2, 1) : V(0, -1, 0.3)) },
          props(g, z) { if (z.gleit_l) for (const s of ['l', 'r']) z['gleit_' + s].position.set(g.zehe[s].x, 0.01, g.zehe[s].z); } };
      }
      if (art === 'rollout_stehend') {
        const fussP = V(0, FY, -0.6);
        const d0 = V(0, Math.sin(12 * RAD), Math.cos(12 * RAD));
        const becken = mv(fussP.clone().add(d0.clone().multiplyScalar(BEIN)), V(0, 0.92, -0.42), glatt(t));
        const oben = mv(d0, V(0, -0.6, 0.8), t).normalize();
        const r = { basis: basisAus(oben, V(0, -1, 0)), neigung: 0 };
        const k = rumpf(becken, r);
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5);
        const dy = sm.y - 0.1, radZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.995) ** 2 - dy * dy));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand: seiten((s, sg) => V(sg * 0.08, 0.1, radZ)), greift: seiten(() => true), ellbogenPol: seiten((s, sg) => V(sg, 0, 0)),
            fuss: seiten((s, sg) => fussP.clone().add(V(sg * 0.12, 0, 0))), fussRicht: seiten(() => V(0, 0, 1)), zehen: seiten(() => 25), kniePol: seiten(() => V(0, 0, 1)) },
          props(g, z) { z.rad.position.set(0, 0.1, radZ); } };
      }
      if (art === 'reverse_crunch') {
        const r = { basis: LIEGEND, neigung: 0 };
        const becken = V(0, mix(0.12, 0.17, t), 0.25);
        const a = mix(0, 40, t) * RAD;
        const fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.09, Math.cos(a) * 0.45 - 0.06, -Math.sin(a) * 0.45 + 0.42)));
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => becken.clone().add(V(sg * 0.25, -0.06, -0.05))), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)),
          fuss, kniePol: seiten(() => V(0, 1, -0.3)), fussRicht: seiten(() => V(0, 0.2, 1)) } };
      }
      if (art === 'knieheben_haengend') {
        const becken = V(0, 2.25 - ARM * 0.99 - (MASS.rumpf - 0.03) + 0.03, -0.02);
        const r = { neigung: mix(0, -12, t) };
        const w = mix(0, 100, t) * RAD;
        const fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.09, -Math.cos(w) * 0.45 - 0.42, Math.sin(w) * 0.45 - 0.06 * t)));
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.3, 2.25, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3)), fuss, kniePol: seiten(() => V(0, 0, 1)), fussRicht: seiten(() => V(0, -0.5, 1)) } };
      }
      if (art === 'hollow_rock') {
        const P = V(0, 0.0, 0.15);
        const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), mix(-6, 6, t) * RAD);
        const dreh = (p) => p.clone().sub(P).applyQuaternion(q).add(P);
        const r0 = { basis: LIEGEND, neigung: 12 };
        const k = rumpf(V(0, 0.12, 0.25), r0);
        const hand = seiten((s, sg) => dreh(k.schulter[s].clone().add(V(sg * 0.1, 0.12, -ARM * 0.95))));
        const fuss = seiten((s, sg) => dreh(V(sg * 0.08, 0.17, 0.25 + BEIN * 0.98)));
        return { pose: { becken: dreh(V(0, 0.12, 0.25)), rumpf: { basis: q.clone().multiply(LIEGEND), neigung: 12 }, hand, ellbogenPol: seiten(() => V(0, 1, 0).applyQuaternion(q)),
          fuss, kniePol: seiten(() => V(0, 1, 0).applyQuaternion(q)), fussRicht: seiten(() => V(0, 0.3, 1).applyQuaternion(q)) } };
      }
      // Maschinen im Sitzen: Bauch einrollen bzw. Rücken nach hinten strecken
      const bauch = art === 'bauchmaschine';
      const becken = V(0, 0.56, -0.08);
      const r = { neigung: bauch ? mix(-4, 38, t) : mix(40, -12, t) };
      const k = rumpf(becken, r);
      const hand = bauch ? seiten((s, sg) => k.schulter[s].clone().add(k.R.vor.clone().multiplyScalar(0.12)).add(k.R.oben.clone().multiplyScalar(0.08)).add(k.R.links.clone().multiplyScalar(-sg * 0.04)))
        : seiten((s, sg) => k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.21)).add(k.R.links.clone().multiplyScalar(-sg * 0.09)).sub(k.R.oben.clone().multiplyScalar(0.03)));   // Arme vor der Brust verschränkt, Fäuste
      return { pose: { becken, rumpf: r, kopf: { neigung: bauch ? 15 : -5 }, hand, handflaeche: bauch ? seiten((s, sg) => k.R.links.clone().multiplyScalar(-sg)) : undefined, faust: bauch ? undefined : seiten(() => true),
          ellbogenPol: seiten((s, sg) => bauch ? V(sg * 0.4, -1, 0.5) : V(sg, -0.5, 0)), fuss: seiten((s, sg) => V(sg * 0.13, bauch ? FY : 0.08 + FY, bauch ? 0.36 : 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { z.rm.hebel.quaternion.copy(g.R.q); z.block.heben(0.22 * t); } };
    },
    blick: V(0, 0.6, 0), abstand: 3.4, kameraRicht: V(1, 0.4, 0.3),
    dauer: art === 'plank_knie' ? STATISCH : art === 'hollow_rock' ? [0.9, 0.1, 0.9, 0.1] : art === 'body_saw' ? [1.2, 0.2, 1.2, 0.2] : undefined
  };
}

// Einbeinige Kniebeuge: links steht. art: pistol | pistol_halt | box | skater | shrimp
export function einbeinkniebeuge(o = {}) {
  const art = o.art || 'pistol';
  const vorn = art === 'pistol' || art === 'pistol_halt' || art === 'box';
  return {
    aufbau(ger) {
      if (art === 'box') ger.box(0.42, 0.45, 0.38, V(0, 0.225, -0.38), ger.mPolster);
      if (art === 'pistol_halt') ger.box(0.06, 1.8, 0.06, V(0, 0.9, 0.58), ger.mRahmen);
      if (art === 'skater') ger.box(0.3, 0.05, 0.3, V(-0.1, 0.025, -0.38), ger.mPolster);
      return {};
    },
    pose(t) {
      let becken, neigung, fussR, kpolR, frR, zehenR = 0;
      if (vorn) {
        becken = mv(V(0.02, art === 'box' ? 0.6 : 0.42, -0.28), V(0.02, 0.975, 0.03), t);
        neigung = mix(art === 'box' ? 34 : 40, 3, t);
        const w = mix(80, 12, t) * RAD;  // freies Bein gestreckt nach vorn
        fussR = becken.clone().add(V(-0.12, -0.02 - Math.cos(w) * BEIN * 0.96, Math.sin(w) * BEIN * 0.96));
        kpolR = V(0, 1, 0.3); frR = V(0, Math.sin(w) * 0.6, 1);
      } else {
        becken = mv(V(0.02, 0.5, -0.12), V(0.02, 0.975, 0.03), t);
        neigung = mix(art === 'skater' ? 38 : 26, 3, t);
        if (art === 'skater') { fussR = mv(V(-0.1, 0.24, -0.68), V(-0.12, 0.5, -0.36), t); frR = V(0, 0.2, -1); }
        else { fussR = becken.clone().add(V(-0.1, 0.05, -0.18)); frR = V(0, 0.6, -1); }
        kpolR = V(0, -1, 0.5);
      }
      const r = { neigung };
      const k = rumpf(becken, r);
      let hand, epol = seiten((s, sg) => V(sg, -0.5, -0.3));
      if (art === 'pistol_halt') hand = seiten((s, sg) => V(sg * 0.05, mix(0.82, 1.25, t), 0.55));
      else if (art === 'shrimp') hand = { r: fussR.clone().add(V(0, 0.03, -0.04)), l: k.schulter.l.clone().add(V(0.03, -0.05, ARM * 0.93)) };
      else if (art === 'box' || art === 'pistol') hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.02, mix(-0.02, -0.25, t), ARM * mix(0.93, 0.85, t))));
      else hand = seiten((s, sg) => k.schulter[s].clone().add(mv(V(0, -0.05, ARM * 0.93), V(sg * 0.06, -ARM * 0.95, 0.08), t)));
      if (art === 'shrimp') epol.r = V(-0.5, 0, -1);
      return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, hand, ellbogenPol: epol, fuss: { l: V(0.08, FY, 0.05), r: fussR }, kniePol: { l: V(0.15, 0, 1), r: kpolR }, fussRicht: { l: V(0.1, 0, 1), r: frR }, zehen: { l: 0, r: zehenR } } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, 0.35)
  };
}

const GURT_H = 0.045;   // Belt Squat: Höhe des Gurts über dem Becken (knapp über den Shorts, frei von den Oberschenkeln)
// Kniebeuge-Sonderformen: art: wandsitzen | spanish | sissy | belt
export function sonderkniebeuge(o = {}) {
  const art = o.art || 'wandsitzen';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'wandsitzen') ger.box(1.4, 1.8, 0.06, V(0, 0.9, -0.42), ger.mRahmen);
      if (art === 'spanish') { for (const sx of [-1, 1]) ger.box(0.06, 1.6, 0.06, V(sx * 0.5, 0.8, 0.95), ger.mRahmen); z.band_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'sissy') ger.box(0.06, 1.7, 0.06, V(-0.5, 0.85, 0.1), ger.mRahmen);
      if (art === 'belt') {
        beltBauen(ger, z);
        // Gurt liegt tief auf der Hüfte und läuft ringsum eng am Körper; vorn eine Öse für die Kette
        z.gurt = new THREE.Group();
        z.gurt.add(new THREE.Mesh(rumpfRing(GURT_H, 0.014, 0.012, 2.8), ger.mBand));
        const oese = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), ger.mMetall);
        oese.position.copy(rumpfPunkt(GURT_H, 0, 0.03)); z.gurt.add(oese);
        ger.gruppe.add(z.gurt);
        z.kette = ger.stab(V(), V(0, 1, 0), 0.01, ger.mMetall);
      }
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'wandsitzen') {
        const becken = V(0, 0.52 + 0.005 * atmen, -0.24), r = { neigung: 0 };
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.16, 0.6, 0.12)), ellbogenPol: seiten((s, sg) => V(sg, 0, -0.5)), fuss: seiten((s, sg) => V(sg * 0.14, FY, 0.24)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) } };
      }
      if (art === 'spanish') {
        const becken = mv(V(0, 0.55, -0.32), V(0, 0.95, -0.02), t), r = { neigung: mix(24, 4, t) };
        const k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => k.schulter[s].clone().add(V(0, -0.05, ARM * 0.93))), ellbogenPol: seiten((s, sg) => V(sg, -1, 0)), fuss: seiten((s, sg) => V(sg * 0.15, FY, 0.1)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) },
          props(g, z) { for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['band_' + s], g.knie[s].clone().add(V(0, -0.03, -0.04)), V(sg * 0.47, 0.5, 0.95)); } };
      }
      if (art === 'sissy') {
        const becken = mv(V(0, 0.64, 0.12), V(0, 1.03, 0.0), t), r = { neigung: mix(-40, 0, t) };
        const k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: 10 }, hand: { r: V(-0.47, mix(0.95, 1.2, t), 0.1), l: k.brust.clone().add(V(-0.02, -0.05, 0.12)) }, ellbogenPol: { r: V(-1, -0.5, 0), l: V(1, -1, 0) },
          fuss: seiten((s, sg) => V(sg * 0.1, FY + 0.13, 0)), zehen: seiten(() => 50), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } };
      }
      // Belt Squat: Gurt an der Hüfte, Kette nach unten, Hände leicht am Haltegriff
      const becken = mv(V(0, 0.65, -0.1), V(0, 1.12, 0.0), t), r = { neigung: mix(14, 3, t) };
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.25, 1.13, 0.38)), ellbogenPol: seiten((s, sg) => V(sg, -1, -0.3)), fuss: seiten((s, sg) => V(sg * 0.2, 0.15 + FY, 0.02)), fussRicht: seiten((s, sg) => V(sg * 0.35, 0, 1)), kniePol: seiten((s, sg) => V(sg * 0.35, 0, 1)) },
        props(g, z) {
          z.gurt.position.copy(g.becken); z.gurt.quaternion.copy(g.R.q);
          const o = rumpfPunkt(GURT_H, 0, 0.03), vorn = g.becken.clone().add(g.R.links.clone().multiplyScalar(o.x)).add(g.R.oben.clone().multiplyScalar(o.y - 0.022)).add(g.R.vor.clone().multiplyScalar(o.z));
          seil(z.kette, vorn, V(0, 0.14, 0.16));
          if (z.block) z.block.heben(0.3 * t);
        } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, art === 'wandsitzen' ? 0.6 : 0.4), dauer: art === 'wandsitzen' ? STATISCH : undefined
  };
}

// Seitlicher Bandgang: leichte Hocke, zwei Schritte nach links, zwei zurück; Miniband über den Knien
export function bandgang() {
  return {
    aufbau(ger) { return { band: ger.stab(V(), V(0, 1, 0), 0.016, ger.mBand) }; },
    pose(t) {
      const ph = t * 4, i = Math.min(3, Math.floor(ph)), u = glatt(ph - i);
      const heb = Math.sin(u * Math.PI) * 0.06;
      let l = 0.13, rr = -0.13, bx = 0;
      if (i === 0) { l = mix(0.13, 0.35, u); bx = mix(0, 0.11, u); }
      if (i === 1) { l = 0.35; rr = mix(-0.13, 0.09, u); bx = mix(0.11, 0.22, u); }
      if (i === 2) { l = 0.35; rr = mix(0.09, -0.13, u); bx = mix(0.22, 0.11, u); }
      if (i === 3) { l = mix(0.35, 0.13, u); bx = mix(0.11, 0, u); }
      const hebL = i === 0 || i === 3 ? heb : 0, hebR = i === 1 || i === 2 ? heb : 0;
      const becken = V(bx, 0.84, -0.06), r = { neigung: 16 };
      const k = rumpf(becken, r);
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => k.brust.clone().add(V(sg * 0.07, -0.2, 0.3))), ellbogenPol: seiten((s, sg) => V(sg, -1, 0)),
          fuss: { l: V(l, FY + hebL, 0.04), r: V(rr, FY + hebR, 0.04) }, kniePol: seiten((s, sg) => V(sg * 0.4, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.15, 0, 1)) },
        props(g, z) { seil(z.band, g.knie.l.clone().add(V(0, 0.06, -0.01)), g.knie.r.clone().add(V(0, 0.06, -0.01))); } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(0.3, 0.3, 1), dauer: [3.2, 0, 0, 0]
  };
}

// Beinbeuger ohne Maschine bzw. im Stehen: art: gleiten | gleiten_einbeinig | band | stehend
export function beincurl(o = {}) {
  const art = o.art || 'gleiten';
  return {
    aufbau(ger) {
      const z = {};
      if (art !== 'stehend') ger.matte();
      if (art.startsWith('gleiten')) { z.gleit_l = ger.zyl(0.08, 0.015, ger.mGold, 20); z.gleit_r = ger.zyl(0.08, 0.015, ger.mGold, 20); }
      if (art === 'band') { ger.box(0.06, 0.5, 0.06, V(0, 0.25, 1.4), ger.mRahmen); z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'stehend') beincurlStehendBauen(ger, z, V(-0.1, 0.975 + 0.1 - 0.47, 0.06));
      return z;
    },
    pose(t) {
      if (art.startsWith('gleiten')) {
        // Rückenlage, Becken oben, Fersen auf Gleitern: t = 0 Beine lang, t = 1 Fersen nah am Gesäß
        const schulterPunkt = V(0, 0.13, -0.3);
        const becken = V(0, mix(0.2, 0.36, t), 0.18);
        const d = schulterPunkt.clone().sub(becken).normalize();
        const r = { neigung: 0, basis: quer(-90 + Math.atan2(d.y, -d.z) / RAD) };
        const k = rumpf(becken, r);
        const fz = mix(1.0, 0.6, t);
        const fuss = { l: V(0.12, FY, fz), r: art === 'gleiten_einbeinig' ? becken.clone().add(V(-0.1, BEIN * 0.9, 0.35)) : V(-0.12, FY, fz) };
        return { pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand: seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.12, -0.05, 0.45))), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)),
            fuss, fussRicht: { l: V(0, 0.8, 0.6), r: art === 'gleiten_einbeinig' ? V(0, 0.3, 1) : V(0, 0.8, 0.6) }, kniePol: seiten(() => V(0, 1, 0.3)) },
          props(g, z) { for (const s of ['l', 'r']) { if (art === 'gleiten_einbeinig' && s === 'r') { z.gleit_r.visible = false; continue; } z['gleit_' + s].position.set(g.ferse[s].x, 0.01, g.ferse[s].z); } } };
      }
      if (art === 'band') {
        const becken = V(0, 0.13, 0.15), r = { basis: BAUCHLAGE, neigung: -8 };
        const k = rumpf(becken, r);
        const w = mix(8, 95, t) * RAD;
        const knie = (sg) => V(sg * 0.1, 0.07, 0.15 + MASS.oberschenkel + 0.02);
        const fuss = seitenBauch((s, sg) => knie(sg).add(V(0, Math.sin(w) * MASS.unterschenkel, Math.cos(w) * MASS.unterschenkel)));
        return { pose: { becken, rumpf: r, kopf: { neigung: 0 }, hand: seitenBauch((s, sg) => k.schulter[s].clone().add(V(sg * 0.15, -0.08, -0.25))), ellbogenPol: seitenBauch((s, sg) => V(sg, 0.3, 0)),
            fuss, fussRicht: seiten(() => V(0, -Math.cos(w), Math.sin(w))), kniePol: seiten(() => V(0, -1, 0)) },
          props(g, z) { seil(z.band, g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5), V(0, 0.4, 1.38)); } };
      }
      // Stehend an der Maschine: rechtes Bein beugt, Oberschenkel bleibt senkrecht
      const becken = V(0, 0.975 + 0.1, 0.02), r = { neigung: 14 };
      const k = rumpf(becken, r);
      const w = mix(5, 105, t) * RAD;
      const knieR = V(-0.1, becken.y - 0.47, 0.06);
      const fussR = knieR.clone().add(V(0, -Math.cos(w) * MASS.unterschenkel, -Math.sin(w) * MASS.unterschenkel));
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.24, 1.25, 0.3)), ellbogenPol: seiten((s, sg) => V(sg, -1, -0.5)),
          fuss: { l: V(0.12, 0.1 + FY, 0.02), r: fussR }, fussRicht: { l: V(0.1, 0, 1), r: V(0, -Math.cos(w + 0.3), -Math.sin(w + 0.3) * 0.3 + 0.2) }, kniePol: { l: V(0.1, 0, 1), r: V(0, 0, 1) } },
        props(g, z) { hebelStellen(z, g, 'r', (phi) => 0.28 * Math.max(0, phi) / 105); } };
    },
    blick: V(0, 0.5, 0.2), abstand: 3.3, kameraRicht: V(1, art === 'stehend' ? 0.25 : 0.45, 0.25)
  };
}

// Seitstütz-Varianten (rechte Seite unten, Kopf nach -z, Bauch nach -x): art: knie | abduktion | copenhagen_kurz | copenhagen_lang
export function seitstuetz(o = {}) {
  const art = o.art || 'knie';
  const cop = art.startsWith('copenhagen');
  return {
    aufbau(ger) {
      ger.matte();
      if (cop) { ger.box(1.0, 0.07, 0.55, V(0, 0.45, 0.72), ger.mPolster); for (const sx of [-1, 1]) ger.box(0.05, 0.43, 0.05, V(sx * 0.42, 0.215, 0.72), ger.mRahmen); }
      return {};
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      const bauch = V(-1, 0, 0);
      let stuetz, S, fuss, kpol = seiten(() => V(-1, 0, 0));
      if (art === 'knie') {
        stuetz = V(0, 0.07, 0.4);
        S = stuetz.clone().add(V(0, 0.47 + 0.015 * atmen, -Math.sqrt(0.94 ** 2 - 0.47 ** 2)));
      } else if (art === 'abduktion') {
        stuetz = V(0, FY, 0.75);
        S = stuetz.clone().add(V(0, 0.46, -Math.sqrt(1.38 ** 2 - 0.46 ** 2)));
      } else if (art === 'copenhagen_lang') {
        stuetz = V(0, 0.5, 0.85);
        S = stuetz.clone().add(V(0, 0.04 + 0.02 * t, -Math.sqrt(1.38 ** 2 - 0.04 ** 2)));
      } else {
        stuetz = V(0, 0.5, 0.55);
        S = stuetz.clone().add(V(0, 0.04 + 0.02 * t, -Math.sqrt(0.94 ** 2 - 0.04 ** 2)));
      }
      const b = brettPose(stuetz, S, bauch);
      const k = rumpf(b.becken, b.r);
      const handR = V(k.schulter.r.x - 0.24, 0.055, k.schulter.r.z - 0.02);   // Unterarm liegt auf, nicht im Boden
      const handL = art === 'abduktion' ? b.becken.clone().add(k.R.links.clone().multiplyScalar(0.16)).add(k.R.vor.clone().multiplyScalar(0.05)) : k.schulter.l.clone().add(V(0, 0.45, 0));
      if (art === 'knie') {
        fuss = { r: stuetz.clone().add(V(0.38, 0.03, 0.12)), l: stuetz.clone().add(V(0.38, 0.13, 0.12)) };
      } else if (art === 'abduktion') {
        const huefteL = b.becken.clone().add(k.R.links.clone().multiplyScalar(MASS.hueftBreite));
        const a = mix(0, 35, t) * RAD;
        const bein = b.richt.clone().negate().multiplyScalar(Math.cos(a)).add(k.R.links.clone().multiplyScalar(Math.sin(a)));
        fuss = { r: stuetz.clone(), l: huefteL.add(bein.multiplyScalar(BEIN * 0.97)) };
        kpol = seiten(() => V(-1, 0, 0));
      } else {
        // oberes Bein liegt auf der Bank, unteres Bein hebt sich bis unter die Bank
        const oben = art === 'copenhagen_lang' ? stuetz.clone() : stuetz.clone().add(b.richt.clone().multiplyScalar(-0.43));
        const unten = art === 'copenhagen_lang' ? mv(V(0, 0.09, 0.84), V(0, 0.37, 0.84), t) : mv(V(0, 0.09, 0.9), V(0, 0.36, 0.88), t);
        fuss = { l: oben, r: unten };
      }
      return { pose: { becken: b.becken, rumpf: b.r, hand: { l: handL, r: handR }, ellbogenPol: { l: V(0, 1, 0), r: V(0.3, -1, 0) }, fuss, kniePol: kpol,
        fussRicht: seiten(() => art === 'knie' ? V(0, 0, 1) : V(-1, 0, 0.2)) } };
    },
    blick: V(0, 0.4, 0.1), abstand: 3.4, kameraRicht: V(-1, 0.5, 0.35), dauer: art === 'knie' ? STATISCH : undefined
  };
}

// Hintere Schulter & Rotatoren: art: reverse_butterfly | pull_apart | kabel_reverse_fly | aussenrotation | yt_bauchlage ; last: kabel (aussenrotation am Kabelturm statt Band)
export function schulterzug(o = {}) {
  const art = o.art || 'reverse_butterfly';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'reverse_butterfly') butterflyBauen(ger, z, V(0, 0.56, -0.12), { neigung: 6 }, -1);
      if (art === 'pull_apart') z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand);
      if (art === 'kabel_reverse_fly') { ger.turm(V(0.85, 0, 0.55)); ger.turm(V(-0.85, 0, 0.55)); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }
      if (art === 'aussenrotation' && o.last === 'kabel') { ger.turm(V(0.8, 0, 0.1)); z.band = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); }
      else if (art === 'aussenrotation') { ger.box(0.08, 1.3, 0.08, V(0.8, 0.65, 0.1), ger.mRahmen); z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'yt_bauchlage') ger.matte();
      return z;
    },
    pose(t) {
      if (art === 'yt_bauchlage') {
        const becken = V(0, 0.16, 0.25), r = { basis: BAUCHLAGE, neigung: -6 };   // breite Brust liegt auf, nicht im Boden
        const k = rumpf(becken, r);
        const lift = Math.sin(((t * 2) % 1) * Math.PI);
        const y = glatt((t - 0.42) / 0.16);  // 0 = Y, 1 = T (Wechsel, während die Arme unten sind)
        const hand = seitenBauch((s, sg) => {
          const dY = V(sg * 0.55, 0, -0.83), dT = V(sg, 0, 0.05);
          const d = mv(dY, dT, y).normalize().multiplyScalar(Math.cos(0.3)).add(V(0, mix(-0.25, 0.3, lift), 0)).normalize();
          return k.schulter[s].clone().add(d.multiplyScalar(ARM * 0.96));
        });
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, greift: seiten(() => true), ellbogenPol: seiten(() => V(0, 1, 0)), fuss: seitenBauch((s, sg) => V(sg * 0.1, FY, 0.27 + BEIN * 0.998))   /* Hüfte liegt 2 cm hinter dem Becken: Beine fast gestreckt, Knie bleibt über dem Boden */, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, 1)) } };
      }
      if (art === 'aussenrotation') {
        const becken = V(0, 0.975, 0), r = { neigung: 2 };
        const k = rumpf(becken, r);
        const ell = k.schulter.r.clone().add(V(0.03, -0.28, 0.03));
        const phi = mix(-55, 50, t) * RAD;
        const handR = genau(ell.clone().add(V(-Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(UNTERARM)));
        return { pose: Object.assign({ becken, rumpf: r, hand: { r: handR, l: becken.clone().add(V(0.17, 0.05, 0.06)) }, ellbogenPol: { r: V(0.2, -1, -0.4), l: V(1, 0, -0.5) } }, stehFuesse(0.15)),
          props(g, z) { seil(z.band, V(0.76, 1.0, 0.1), g.hand.r); if (z.griff) { z.griff.position.copy(g.hand.r); z.griff.quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); } } };
      }
      const sitzt = art === 'reverse_butterfly';
      const becken = sitzt ? V(0, 0.56, -0.12) : V(0, 0.975, 0);
      const r = { neigung: sitzt ? 6 : 2 };
      const k = rumpf(becken, r);
      const w = mix(art === 'kabel_reverse_fly' ? -12 : 8, 86, t) * RAD;
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(w), -0.03, Math.cos(w)).normalize().multiplyScalar(ARM * 0.98)));   // Ellbogen leicht gebeugt
      return { pose: Object.assign({ becken, rumpf: r, hand, handflaeche: sitzt ? seiten((s, sg) => V(-sg * Math.cos(w), 0, Math.sin(w))) : undefined, ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -0.2)) }, sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.35)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.15)),
        props(g, z) {
          if (z.bf) butterflyStellen(z, g, t);
          if (z.band) seil(z.band, g.hand.l, g.hand.r);
          if (z.seil_l) { seil(z.seil_l, V(-0.85, 1.45, 0.5), g.hand.l); seil(z.seil_r, V(0.85, 1.45, 0.5), g.hand.r); }
        } };
    },
    blick: V(0, 1.1, 0), abstand: 3.4, kameraRicht: art === 'yt_bauchlage' ? V(1, 0.7, 0.4) : V(0.5, 0.35, art === 'reverse_butterfly' ? -1 : 1)
  };
}

// Sitzende Brustmaschinen: Becken, Rumpf 6° zurückgelehnt; Brustpresse: Griffe unten/oben, Drehachse der Hebel darüber (Kreisbogen)
const BM_BECKEN = V(0, 0.56, -0.14), BM_RUMPF = { neigung: -6 };
const bmSchulter = (sg) => rumpf(BM_BECKEN, BM_RUMPF).schulter[sg > 0 ? 'l' : 'r'];
const bmUnten = (sg) => bmSchulter(sg).add(V(sg * 0.12, -0.15, 0.12)), bmOben = (sg) => bmSchulter(sg).add(V(-sg * 0.06, -0.12, ARM * 0.99));
const BM_C = bogenMitte(bmUnten(1), bmOben(1), { y: 1.62 });
// Brust an Maschine bzw. mit Band im Stand: art: presse | butterfly | band_stehend
// Neu: band_stehend + last kabel (zwei Kabeltürme hinter dem Körper)
export function brustmaschine(o = {}) {
  const art = o.art || 'presse', kabel = o.last === 'kabel';
  const sitzt = art !== 'band_stehend';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'presse') drueckmaschineBauen(ger, z, BM_BECKEN, BM_RUMPF, BM_C, 'senkrecht');
      else if (sitzt) butterflyBauen(ger, z, BM_BECKEN, BM_RUMPF, 1); else if (kabel) { ger.turm(V(0.55, 0, -0.75)); ger.turm(V(-0.55, 0, -0.75)); z.band_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.band_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }
      else { ger.box(0.08, 1.5, 0.08, V(0, 0.75, -0.75), ger.mRahmen); z.band_l = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); }
      return z;
    },
    pose(t) {
      const becken = sitzt ? BM_BECKEN.clone() : V(0, 0.96, 0.02);
      const r = sitzt ? { ...BM_RUMPF } : { neigung: 8 };
      const k = rumpf(becken, r);
      let hand, epol, handflaeche;
      if (art === 'butterfly') {
        const w = mix(80, 10, t) * RAD;
        hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(w), -0.12, Math.cos(w)).normalize().multiplyScalar(ARM * 0.982)));   // Ellbogen leicht gebeugt
        epol = seiten((s, sg) => V(sg * 0.3, -1, -0.3));
        handflaeche = seiten((s, sg) => V(-sg * Math.cos(w), 0, Math.sin(w)));   // Handfläche zeigt in Zugrichtung (nach innen-vorn)
      } else if (sitzt) {
        // Brustpresse: Griffe laufen auf dem Bogen der Hebelarme von Brusthöhe neben dem Körper nach vorn (Arme gestreckt, nicht durchgedrückt)
        hand = seiten((s, sg) => bogenHand(bmUnten(sg), bmOben(sg), BM_C, t));
        epol = seiten((s, sg) => V(sg * 0.8, -1, -0.5)); handflaeche = seiten((s, sg) => V(-sg, 0, 0));
      } else {
        // Griffe unten auf Brusthöhe neben dem Körper, Ellbogen etwa 45–60° vom Rumpf (keine T-Form), oben Arme gestreckt
        hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.12, -0.15, 0.12)), k.schulter[s].clone().add(V(-sg * 0.06, -0.12, ARM * 0.99)), t));
        epol = seiten((s, sg) => V(sg * 0.8, -1, -0.5));
      }
      const fuesse = sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.36)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : { fuss: { l: V(0.13, FY, 0.3), r: V(-0.13, FY, -0.25) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) };
      return { pose: Object.assign({ becken, rumpf: r, hand, handflaeche, ellbogenPol: epol }, fuesse),
        props(g, z) {
          if (z.dm) drueckmaschineStellen(z, g, t);
          if (z.bf) butterflyStellen(z, g, t);
          for (const [s, sg] of [['l', 1], ['r', -1]]) {
            if (z['band_' + s]) seil(z['band_' + s], kabel ? V(sg * 0.5, 1.3, -0.72) : V(sg * 0.03, 1.3, -0.72), g.hand[s]);
            if (kabel) { z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); }
          }
        } };
    },
    blick: V(0, 0.95, 0), abstand: 3.3, kameraRicht: V(0.9, 0.35, 0.8)
  };
}

/* =================================================================== */
/* Ergänzungen (27.10. abends): Sprünge, Vierfüßlerstand, Bauchlage auf der Bank */
/* =================================================================== */

// Sprünge: art kniebeuge (Sprungkniebeuge) | box (Box Jump) | ausfallschritt (Beinwechsel in der Luft)
export function sprung(o = {}) {
  const art = o.art || 'kniebeuge';
  const BOX = 0.5, BOXZ = 0.5;
  return {
    aufbau(ger) { if (art === 'box') ger.box(0.6, BOX, 0.45, V(0, BOX / 2, BOXZ), ger.mPolster); return {}; },
    pose(t, zst) {
      if (art === 'ausfallschritt') {
        // t = 0: links vorn unten, t = 1: rechts vorn unten; in der Mitte in der Luft
        const p = glatt(t), luft = Math.sin(Math.PI * p);
        const vorn = (z) => V(0, FY + luft * 0.12, z);
        const fuss = { l: vorn(mix(0.36, -0.42, p)).add(V(0.12, 0, 0)), r: vorn(mix(-0.42, 0.36, p)).add(V(-0.12, 0, 0)) };
        const becken = V(0, 0.52 + luft * 0.5, mix(-0.04, 0.0, luft));
        const r = { neigung: 6 };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.05, -0.45, (s === 'l' ? -1 : 1) * mix(-0.25, 0.25, p))));
        return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)), fuss,
          zehen: { l: mix(0, 45, p), r: mix(45, 0, p) }, kniePol: { l: V(0.1, -mix(0, 0.7, p), 1), r: V(-0.1, -mix(0.7, 0, p), 1) } } };
      }
      // kniebeuge und box: Absprung aus der halben Kniebeuge, Arme schwingen von hinten nach oben
      let fussZ = 0, fussY = FY, luft = 0, hRel;
      if (art === 'box') {
        const p = zst && zst.runter ? t : glatt((t - 0.22) / 0.58);   // runter: vom Kasten zurücksteigen
        fussZ = mix(0, BOXZ - 0.02, p); fussY = FY + BOX * p + (zst && zst.runter ? 0 : 0.18 * Math.sin(Math.PI * p));
        hRel = zst && zst.runter ? 0.88 : 0.9 - 0.34 * (1 - glatt(t / 0.22)) - 0.24 * Math.sin(Math.PI * p);
      } else {
        luft = 0.2 * glatt((t - 0.72) / 0.28);
        fussY = FY + luft;
        hRel = mix(0.56, 0.9, glatt(Math.min(1, t / 0.72)));
      }
      const becken = V(0, fussY - FY + 0.085 + hRel, fussZ - 0.1 * (0.9 - hRel) / 0.34);
      const r = { neigung: 6 + 32 * (0.9 - hRel) / 0.34 };
      const k = rumpf(becken, r);
      const w = mix(-45, 150, glatt(t)) * RAD;
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.06, -Math.cos(w), Math.sin(w) * 0.8).normalize().multiplyScalar(ARM * 0.95)));
      const spitz = art === 'box' ? 0 : mix(0, 35, glatt((t - 0.6) / 0.4));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.4, 0, -1)), fuss: seiten((s, sg) => V(sg * 0.14, fussY, fussZ)),
        zehen: seiten(() => spitz), kniePol: seiten((s, sg) => V(sg * 0.3, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.25, 0, 1)) } };
    },
    blick: V(0, 0.9, 0.2), abstand: 3.8, kameraRicht: V(1, 0.3, 0.45),
    dauer: art === 'ausfallschritt' ? [0.55, 0.3, 0.55, 0.3] : art === 'box' ? [1.1, 0.6, 1.4, 0.4] : [0.45, 0.25, 0.9, 0.35]
  };
}

// Vierfüßlerstand (Kopf nach -z, Knie unter der Hüfte): art fire_hydrant | donkey_kick (rechtes Bein arbeitet) | baer (Knie schweben knapp über dem Boden)
export function vierfuessler(o = {}) {
  const art = o.art || 'fire_hydrant';
  return {
    aufbau(ger) { ger.matte(); return {}; },
    pose(t) {
      const baer = art === 'baer', atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      const becken = V(0, 0.535 + (baer ? 0.035 : 0), -0.3), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r);
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      const hand = seiten((s, sg) => V(0, 0.04, k.schulter[s].z).add(L(sg, 0.2)));
      const knieBoden = (sg) => V(0, baer ? 0.1 + 0.01 * atmen : 0.065, -0.3).add(L(sg, 0.1));
      const huefteR = becken.clone().add(L(-1, MASS.hueftBreite)).add(V(0, -0.02, 0)), aussenR = L(-1, 1);
      let fuss = seiten((s, sg) => knieBoden(sg).add(V(0, baer ? -0.02 : 0.04, MASS.unterschenkel * 0.96)));
      let kpol = seiten(() => V(0, -1, -0.2)), fussRicht = seiten(() => V(0, baer ? -1 : -0.2, baer ? -0.3 : 1)), zehen;   // Bär: Zehen untergeschlagen (zeigen zum Kopf)
      if (baer) zehen = seiten(() => 60);
      if (art === 'fire_hydrant') {
        // Knie bleibt 90° gebeugt und hebt sich seitlich bis etwa Hüfthöhe
        const a = mix(0, 70, t) * RAD;
        const seitlich = aussenR.clone().multiplyScalar(Math.sin(a)).add(V(0, -Math.cos(a), 0));
        const kn = huefteR.clone().add(seitlich.clone().multiplyScalar(MASS.oberschenkel));
        fuss.r = kn.clone().add(V(0, 0.03, MASS.unterschenkel * 0.96));
        kpol.r = seitlich.add(V(0, 0, -0.15));
      }
      if (art === 'donkey_kick') {
        // Knie bleibt 90° gebeugt, Fußsohle drückt Richtung Decke
        const b = mix(0, 95, t) * RAD;
        const ober = V(0, -Math.cos(b), Math.sin(b)), unter = V(0, Math.sin(b), Math.cos(b));
        const kn = huefteR.clone().add(ober.clone().multiplyScalar(MASS.oberschenkel));
        fuss.r = kn.clone().add(unter.clone().multiplyScalar(MASS.unterschenkel * 0.97));
        kpol.r = ober.clone().sub(unter);
        fussRicht.r = ober.clone().negate().add(V(0, 0.2, 0));
      }
      return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, hand, ellbogenPol: seiten(() => V(0, 1, 0.2)), fuss, kniePol: kpol, fussRicht, zehen } };
    },
    blick: V(0, 0.35, -0.3), abstand: 3.2, kameraRicht: art === 'fire_hydrant' ? V(-0.5, 0.4, 1) : V(-1, 0.35, 0.35), dauer: art === 'baer' ? STATISCH : undefined
  };
}

// Bauchlage auf einer hohen Bank: art reverse_hyper (Hüfte an der Bankkante, gestreckte Beine von unten nach hinten-oben)
export function bauchbank(o = {}) {
  return {
    aufbau(ger) { const z = {}; reverseHyperBauen(ger, z, V(0, 0.97, 0.22), rumpf(V(0, 0.97, 0.22), { basis: BAUCHLAGE, neigung: 0 }).schulter.l.z - 0.12); return z; },
    pose(t) {
      const becken = V(0, 0.97, 0.22), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r);
      const b = mix(12, 78, t) * RAD;   // 0 = Beine hängen senkrecht, 90 = waagerecht nach hinten; oben nicht überstrecken
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      const fuss = seiten((s, sg) => becken.clone().add(V(0, -0.02 - Math.cos(b) * BEIN * 0.96, Math.sin(b) * BEIN * 0.96)).add(L(sg, 0.1)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand: seiten((s, sg) => V(0, 0.82, k.schulter[s].z - 0.12).add(L(sg, 0.2))), ellbogenPol: seiten((s, sg) => L(sg, 1).add(V(0, 0.2, 0))),
        fuss, kniePol: seiten(() => V(0, 0, -1)), fussRicht: seiten(() => V(0, -Math.sin(b), -Math.cos(b)).add(V(0, 0, 0.2))) },
        props(g, z) {   // Pendel folgt den Beinen
          const d = g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5).sub(z.rh.P); d.x = 0; d.normalize();
          z.rh.hebel.quaternion.setFromUnitVectors(V(0, -1, 0), d);
        } };
    },
    blick: V(0, 0.8, 0.2), abstand: 3.4, kameraRicht: V(1, 0.3, 0.35)
  };
}

export const VORLAGEN = { kniebeuge, kreuzheben, ausfallschritt, hueftheben, wadenheben, beinmaschine, bankdruecken, liegestuetz, schulterdruecken, schulterheben, rudern, klimmzug, curl, trizeps, rumpfuebung, tragen, kabelstand, swing, kniestand, seitlage,
  einbeinkniebeuge, sonderkniebeuge, bandgang, beincurl, seitstuetz, schulterzug, brustmaschine, sprung, vierfuessler, bauchbank };
// Bankdrücken und Schulterdrücken: Führung liegt über der Schulter (Stange oben gestreckt über dem Schultergelenk)
for (const n of ['kniebeuge', 'ausfallschritt', 'hueftheben', 'wadenheben', 'bankdruecken', 'schulterdruecken', 'rudern', 'tragen']) VORLAGEN[n] = smithFuehren(VORLAGEN[n], n === 'bankdruecken' || n === 'schulterdruecken');

export function animation(eintrag) {
  const f = VORLAGEN[eintrag && eintrag.vorlage];
  if (!f) return null;
  const o = eintrag.optionen || {};
  const a = f(o);
  // Für jede Vorlage: eigenes Tempo (z. B. Pause unten) und eigene Kamerarichtung
  if (o.dauer) a.dauer = o.dauer;
  if (o.kamera) a.kameraRicht = V(o.kamera[0], o.kamera[1], o.kamera[2]);
  return a;
}
