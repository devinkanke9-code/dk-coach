// DK Coach — Bewegungsvorlagen für die 3D-Figur.
// Jede Vorlage ist eine Funktion (optionen) → Animation { aufbau(geraete), pose(t), blick, abstand, kameraRicht, dauer }.
// t läuft von 0 (Start der Bewegung, z. B. unten bei der Kniebeuge) bis 1 (Endposition, z. B. oben).
import { THREE, V, RAD, MASS, rumpfRahmen, rumpfRing, rumpfPunkt } from './figur.js';

const FY = 0.07;                                  // Knöchelhöhe, Fuß steht auf dem Boden
const ARM = MASS.oberarm + MASS.unterarm + MASS.griff;   // Schulter bis Faustmitte (dort liegt das Ziel der Hand)
const STUETZ = MASS.oberarm + MASS.unterarm;                // Schulter bis Handgelenk: flache Hand beim Stütz (Liegestütz, Handstand)
const UNTERARM = Math.hypot(MASS.unterarm + MASS.griff, MASS.griffTief);   // Ellbogen bis Faustmitte
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
function hantelAn(obj, hand, achse) {
  obj.position.copy(hand);
  obj.quaternion.setFromUnitVectors(V(1, 0, 0), achse.clone().normalize());
}
function kabelZu(ger, z, nameAnker, nameZiel, ziel) { ger.legeStab(z[nameZiel], z[nameAnker], ziel); }
const unterarmAchse = (g, s) => g.hand[s].clone().sub(g.ellbogen[s]).normalize();
// Kurzhantel quer zur Hand (Obergriff/Untergriff) oder längs (Hammergriff)
function kurzhantelnAn(z, g, griff = 'quer') {
  for (const s of ['l', 'r']) {
    if (!z['kh_' + s]) continue;
    const ua = unterarmAchse(g, s);
    let achse;
    if (griff === 'hammer') { achse = g.R.vor.clone().sub(ua.clone().multiplyScalar(g.R.vor.dot(ua))); if (achse.lengthSq() < 1e-4) achse = g.R.oben.clone(); }
    else { achse = g.R.links.clone().sub(ua.clone().multiplyScalar(g.R.links.dot(ua))); }
    hantelAn(z['kh_' + s], g.hand[s], achse);
  }
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
function schienenAufbauen(ger, z) { z.schiene_l = ger.box(0.05, 2.3, 0.05, V(), ger.mRahmen); z.schiene_r = ger.box(0.05, 2.3, 0.05, V(), ger.mRahmen); }
function schienenAn(z) { if (z.schiene_l) for (const [s, sg] of [['l', 1], ['r', -1]]) z['schiene_' + s].position.set(sg * 0.95, 1.15, z.lh.position.z); }
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
const HACK_FUSS = V(0, 0.19, 0.36);   // Hack Squat: Mitte zwischen den Füßen auf der Plattform
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
  const lean = { hinten: 36, vorne: 16, goblet: 20, keine: 28, kurzhanteln: 26, multipresse: 22, kettlebell: 20, haengend: 18, band: 22 }[last] * (o.fersen ? 0.7 : 1);
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
      if (o.box) ger.box(0.42, 0.42, 0.38, V(0, 0.21, -0.38), ger.mPolster);
      return z;
    },
    pose(t) {
      // Unten Oberschenkel mindestens waagrecht, oben Knie gestreckt
      const beckenUnten = V(0, mix(0.97, o.box ? 0.62 : 0.45, tiefe), -0.17 * tiefe * (last === 'vorne' || last === 'goblet' ? 0.75 : 1));
      const becken = mv(beckenUnten, V(0, 0.985, 0.0), t);
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
          hand[s] = k.schulter[s].clone().add(V(sg * 0.06, -ARM * 0.997, 0));
          epol[s] = V(sg * 0.3, 0, -1);
        }
      }
      // Last über dem Mittelfuß: der ganze Körper rückt, bis die Stange (bzw. Hantel) senkrecht über der Fußmitte liegt
      if (last !== 'keine' && last !== 'band' && last !== 'multipresse') { const dz = 0.04 - (hand.l.z + hand.r.z) / 2; becken.z += dz; for (const s of ['l', 'r']) hand[s].z += dz; }
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
      else if (['klassisch', 'rumaenisch', 'sumo', 'goodmorning', 'trapbar'].includes(art)) z.lh = ger.langhantel();
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
        const schulterY = mix(stangeU, 0.0, 0) + ARM * 0.997;
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
          hand[s] = V(sg * breitGriff, k.schulter[s].y - ARM * 0.997, k.schulter[s].z + (art === 'trapbar' ? -0.02 : vomBoden ? mix(-0.03, 0.02, t) : 0.02));
          epol[s] = V(sg * 0.4, 0, -1);
        }
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kniePol: seiten((s, sg) => V(sg * (sumo ? 0.8 : 0.2), 0, 1)) }, stehFuesse(breite, 0, sumo ? 0.6 : 0.2),
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
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.03, -ARM * 0.997, 0.02)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)),
            fuss: { l: V(0.12, FY, 0.02), r: fussR }, fussRicht: { l: V(0.1, 0, 1), r: k.R.vor.clone().add(V(0, -0.2, 0)) }, kniePol: { l: V(0.1, 0, 1), r: k.R.vor.clone() } },
          props(g, z) { if (z.kh_l) kurzhantelnAn(z, g, 'hammer'); if (z.kh_r && !z.kh_l) hantelAn(z.kh_r, g.hand.r, V(0, 0, 1)); } };
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
        becken = mv(V(0.07, 0.55, -0.12), V(0, 0.975, 0.02), glatt(t));
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
        else if (last === 'kurzhanteln') { hand[s] = k.schulter[s].clone().add(V(sg * 0.07, -ARM * 0.997, 0)); epol[s] = V(sg * 0.3, 0, -1); }
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
      if (last === 'maschine') {   // Hip-Thrust-Maschine: Hüftpolster an zwei Hebeln, Drehpunkt vorn am Boden
        z.pad = ger.box(0.62, 0.09, 0.2, V(), ger.mPolster);
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.028, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.028, ger.mRahmen);
        ger.box(0.9, 0.06, 0.22, V(0, 0.03, 1.02), ger.mRahmen);
        for (const sx of [-1, 1]) ger.box(0.07, 0.34, 0.07, V(sx * 0.38, 0.17, 1.02), ger.mRahmen);
      }
      return z;
    },
    pose(t) {
      const bank = art === 'hipthrust' || art === 'einbeinig_bank';
      // Schulterblätter liegen auf der Bank bzw. dem Boden, Füße stehen; das Becken hebt sich
      const schulterPunkt = bank ? V(0, 0.5, -0.32) : V(0, 0.13, -0.3);
      const marsch = art === 'marsch', frog = art === 'frog';
      const beckenY = marsch ? 0.36 : frog ? mix(0.12, 0.3, t) : mix(bank ? 0.3 : 0.12, bank ? 0.55 : 0.36, t);
      const beckenZ = bank ? 0.18 : 0.18;
      const becken = V(0, beckenY, beckenZ);
      // Rumpf zeigt von Becken zur Schulter
      const d = schulterPunkt.clone().sub(becken).normalize();
      const winkel = Math.atan2(d.y, -d.z) / RAD;        // 0 = waagerecht
      const r = { neigung: 0, basis: quer(-90 + winkel) };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'langhantel' || last === 'multipresse' || last === 'maschine') { hand[s] = becken.clone().add(V(sg * 0.32, 0.13, 0.02)); epol[s] = V(sg, 0.5, 0); }
        else { hand[s] = bank ? k.schulter[s].clone().add(V(sg * 0.35, -0.02, 0.05)) : k.schulter[s].clone().add(V(sg * 0.12, -0.05, 0.45)); epol[s] = V(sg, 1, 0); }
      }
      const einbeinig = art === 'einbeinig' || art === 'einbeinig_bank';
      const fz = bank ? 0.62 : 0.67;   // oben Schienbein senkrecht, Knie etwa 90°
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
        pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand, ellbogenPol: epol, fuss, fussRicht, kniePol: kpol },
        props(g, z) {
          if (z.lh) { z.lh.position.copy(g.becken).add(V(0, 0.16, 0.02)); z.lh.quaternion.identity(); schienenAn(z); }
          if (z.pad) {
            z.pad.position.copy(g.becken).add(V(0, 0.15, 0.02));
            for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['hebel_' + s], V(sg * 0.38, 0.32, 1.02), z.pad.position.clone().add(V(sg * 0.33, 0, 0)));
          }
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
  return {
    aufbau(ger) {
      const z = {};
      if (sitzend) { ger.box(0.45, 0.45, 0.4, V(0, 0.225, -0.1), ger.mPolster); if (!khKnie) ger.box(0.4, 0.05, 0.12, V(0, 0.6, 0.25), ger.mPolster); }
      if (khKnie) { ger.box(0.5, 0.08, 0.2, V(0, 0.04, 0.36), ger.mRahmen); khAufbauen(ger, z); }
      if (art === 'stufe' || art === 'einbeinig' || art === 'maschine' || art === 'esel') ger.box(0.6, 0.12, 0.25, V(0, 0.06, 0.1), ger.mRahmen);
      if (o.last === 'multipresse') { z.lh = ger.langhantel(); schienenAufbauen(ger, z); }
      if (art === 'esel') {   // Polster auf dem Becken an einem Hebel, Griffe vorn
        ger.box(0.08, 1.25, 0.08, V(0, 0.625, -0.45), ger.mRahmen);
        z.pad = ger.box(0.38, 0.08, 0.26, V(), ger.mPolster); z.hebel = ger.stab(V(), V(0, 1, 0), 0.025, ger.mRahmen);
        ger.box(0.06, 0.95, 0.06, V(0, 0.475, 0.86), ger.mRahmen); ger.box(0.6, 0.04, 0.04, V(0, 0.95, 0.86), ger.mMetall);
      }
      if (art === 'maschine') {
        for (const sx of [-1, 1]) ger.box(0.07, 1.9, 0.07, V(sx * 0.42, 0.95, -0.3), ger.mRahmen);
        z.polster_l = ger.box(0.16, 0.07, 0.2, V(), ger.mPolster); z.polster_r = ger.box(0.16, 0.07, 0.2, V(), ger.mPolster);
        z.traeger = ger.box(0.84, 0.05, 0.05, V(), ger.mRahmen);
      }
      if (art === 'beinpresse') {
        Object.assign(z, beinmaschine({ art: 'beinpresse' }).aufbau(ger));
      }
      if (o.last === 'kurzhanteln') khAufbauen(ger, z, art !== 'einbeinig');
      return z;
    },
    pose(t) {
      if (art === 'beinpresse') {
        // Beine fast gestreckt in der Beinpresse, nur das Sprunggelenk arbeitet
        const bp = beinmaschine({ art: 'beinpresse' }).pose(1);
        const richt = V(0, Math.sin(40 * RAD), Math.cos(40 * RAD)), hoch = V(0, Math.cos(40 * RAD), -Math.sin(40 * RAD));
        const w = mix(-10, 30, t) * RAD;
        const fr = hoch.clone().multiplyScalar(Math.cos(w)).add(richt.clone().multiplyScalar(Math.sin(w)));
        bp.pose.fussRicht = seiten((s, sg) => fr.clone().add(V(sg * 0.15, 0, 0)));
        bp.props = (g, z) => {
          const ballen = g.zehe.l.clone().add(g.zehe.r).multiplyScalar(0.5);
          z.platte.position.copy(ballen).add(richt.clone().multiplyScalar(0.05)); z.platte.quaternion.setFromUnitVectors(V(0, 0, 1), richt);
        };
        return bp;
      }
      const stufe = art === 'stufe' || art === 'einbeinig' || art === 'maschine' ? 0.12 : 0;
      const hub = mix(stufe ? -15 : 0, 38, t);
      const anheben = Math.sin(Math.max(hub, -20) * RAD) * MASS.fussLaenge * 0.72;
      const fuss = { l: V(0.12, FY + stufe + anheben, 0.0), r: art === 'einbeinig' ? V(-0.12, 0.3, -0.25) : V(-0.12, FY + stufe + anheben, 0) };
      const zehen = { l: hub, r: art === 'einbeinig' ? 10 : hub };
      if (sitzend) {
        const becken = V(0, 0.55, -0.12);
        const r = { neigung: khKnie ? 12 : 5 };
        const k = rumpf(becken, r);
        const sh = khKnie ? 0.08 : 0, hubS = khKnie ? mix(-15, 38, t) : hub, anhebenS = Math.sin(Math.max(hubS, -20) * RAD) * MASS.fussLaenge * 0.72;
        return { pose: { becken, rumpf: r, fuss: { l: V(0.13, FY + sh + anhebenS, 0.36), r: V(-0.13, FY + sh + anhebenS, 0.36) }, zehen: { l: hubS, r: hubS },
          hand: seiten((s, sg) => V(sg * 0.15, khKnie ? 0.66 + anhebenS : 0.62, 0.25)), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)), kniePol: seiten((s, sg) => V(0, 1, 1)) },
          props(g, z) { if (khKnie) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.knie[s].clone().lerp(g.huefte[s], 0.12).add(V(0, 0.075, 0)), V(1, 0, 0)); } };
      }
      if (art === 'esel') {
        // Oberkörper waagerecht, Hände an den Griffen, Polster drückt auf das Becken
        const becken = V(0, 0.975 + 0.12 + anheben, 0.0);
        const r = { neigung: 84 };
        return { pose: { becken, rumpf: r, kopf: { neigung: -25 }, hand: seiten((s, sg) => V(sg * 0.22, 0.97, 0.84)), ellbogenPol: seiten((s, sg) => V(sg, -0.5, 0)),
            fuss: seiten((s, sg) => V(sg * 0.12, FY + 0.12 + anheben, 0.02)), zehen: seiten(() => hub), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
          props(g, z) { z.pad.position.copy(g.becken).add(V(0, 0.14, -0.04)); seil(z.hebel, V(0, 1.2, -0.45), z.pad.position.clone().add(V(0, 0.03, -0.12))); } };
      }
      const becken = V(0, 0.975 + stufe + anheben, 0.02);
      const r = { neigung: 2 };
      const k = rumpf(becken, r);
      const hand = seiten((s, sg) => o.last === 'multipresse' ? k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.42)).sub(k.R.vor.clone().multiplyScalar(0.1)).add(k.R.oben.clone().multiplyScalar(0.02))
        : art === 'maschine' ? k.schulter[s].clone().add(V(sg * 0.1, 0.1, 0.1)) : o.last === 'kurzhanteln' ? k.schulter[s].clone().add(V(sg * 0.06, -ARM * 0.997, 0)) : k.schulter[s].clone().add(V(sg * 0.12, -ARM * 0.9, 0.12)));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: art === 'maschine' ? seiten((s, sg) => V(sg, -1, 0)) : o.last === 'multipresse' ? seiten(() => V(0, -1, -0.6)) : undefined, fuss, zehen, kniePol: seiten((s, sg) => V(sg * 0.1, s === 'r' && art === 'einbeinig' ? -1 : 0, 1)) },
        props(g, z) {
          if (o.last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.polster_l) { for (const [s, sg] of [['l', 1], ['r', -1]]) z['polster_' + s].position.copy(g.schulter[s]).add(V(sg * 0.02, 0.09, 0)); z.traeger.position.set(0, g.schulter.l.y + 0.1, g.schulter.l.z - 0.12); }
        } };
    },
    blick: V(0, 0.55, 0), abstand: 2.9, kameraRicht: V(1, 0.25, 0.5)
  };
}

// Maschinen für die Beine im Sitzen/Liegen: art: strecker | beuger_sitzend | beuger_liegend | adduktoren | abduktoren | beinpresse | hackenschmidt
// Neu: einbeinig (strecker, beinpresse: nur das linke Bein arbeitet) ; abduktoren + band (auf der Bank, Band um die Knie) ; hackenschmidt + winkel (z. B. 15 = Pendel-Kniebeuge)
export function beinmaschine(o = {}) {
  const art = o.art || 'strecker';
  const hw = o.winkel || HACK, band = art === 'abduktoren' && o.band;
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'beuger_liegend') { ger.box(0.36, 0.08, 1.3, V(0, 0.62, -0.05), ger.mPolster); ger.box(0.08, 0.62, 0.08, V(0, 0.31, -0.05), ger.mRahmen); z.rolle = ger.zyl(0.05, 0.42, ger.mPolster); z.rolle.rotation.z = Math.PI / 2; }
      else if (art === 'hackenschmidt') {
        // Schräge Fußplatte vorn, zwei Schienen schräg nach hinten oben, darauf der Schlitten mit Rücken- und Schulterpolstern
        ger.box(0.7, 0.05, 0.55, V(0, 0.08, 0.32), ger.mRahmen, -12);
        const u = V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor = V(0, Math.sin(hw * RAD), Math.cos(hw * RAD));
        for (const sx of [-1, 1]) {
          const sch = ger.box(0.06, 2.0, 0.06, V(), ger.mRahmen);
          sch.position.copy(HACK_FUSS).sub(vor.clone().multiplyScalar(0.25)).add(u.clone().multiplyScalar(1.0)).add(V(sx * 0.3, 0, 0));
          sch.quaternion.setFromUnitVectors(V(0, 1, 0), u);
        }
        z.ruecken = ger.box(0.42, 0.7, 0.07, V(), ger.mPolster);
        z.sch_l = ger.box(0.12, 0.08, 0.2, V(), ger.mPolster); z.sch_r = ger.box(0.12, 0.08, 0.2, V(), ger.mPolster);
      }
      else if (art === 'beinpresse') { ger.box(0.5, 0.06, 0.8, V(0, 0.5, -0.35), ger.mPolster, -50); z.platte = ger.box(0.7, 0.5, 0.05, V(0, 0, 0), ger.mRahmen); }
      else if (band) { ger.box(0.4, 0.45, 1.0, V(0, 0.225, -0.2), ger.mPolster); z.band = ger.stab(V(), V(0, 1, 0), 0.03, ger.mBand); }
      else {
        ger.box(0.44, 0.1, 0.48, V(0, 0.5, -0.05), ger.mPolster); ger.box(0.44, 0.65, 0.1, V(0, 0.85, -0.32), ger.mPolster, -8);
        ger.box(0.1, 0.5, 0.1, V(0, 0.25, -0.05), ger.mRahmen);
        if (art === 'strecker' || art === 'beuger_sitzend') { z.rolle = ger.zyl(0.05, o.einbeinig ? 0.2 : 0.42, ger.mPolster); z.rolle.rotation.z = Math.PI / 2; }
        if (art === 'adduktoren' || art === 'abduktoren') { z.pad_l = ger.box(0.05, 0.3, 0.3, V(), ger.mPolster); z.pad_r = ger.box(0.05, 0.3, 0.3, V(), ger.mPolster); }
      }
      return z;
    },
    pose(t) {
      if (art === 'beuger_liegend') {
        const becken = V(0, 0.76, 0.18);
        const r = { basis: BAUCHLAGE, neigung: 0 };
        const k = rumpf(becken, r);
        const knieW = mix(10, 115, t) * RAD;
        const knie = (sg) => V(sg * 0.1, 0.72, 0.18 + MASS.oberschenkel);
        const fuss = seitenBauch((s, sg) => knie(sg).add(V(0, Math.sin(knieW) * MASS.unterschenkel, Math.cos(knieW) * MASS.unterschenkel)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -20 }, fuss, fussRicht: seiten((s, sg) => V(0, -Math.cos(knieW), Math.sin(knieW))), kniePol: seiten(() => V(0, -1, 0)),
            hand: seitenBauch((s, sg) => k.schulter[s].clone().add(V(sg * 0.18, -0.12, -0.25))), ellbogenPol: seitenBauch((s, sg) => V(sg, 0, 0)) },
          props(g, z) { z.rolle.position.copy(g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5)).add(V(0, 0.05, -0.03)); } };
      }
      if (art === 'hackenschmidt') {
        // Rumpf liegt am schrägen Polster (HACK Grad zurückgelehnt), Becken gleitet auf der Schienenlinie
        const u = V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor = V(0, Math.sin(hw * RAD), Math.cos(hw * RAD));
        const fussMitte = HACK_FUSS.clone();
        const becken = fussMitte.clone().add(u.clone().multiplyScalar(mix(0.5, BEIN * 1.02, t)));   // oben fast gestreckt
        const r = { basis: basisAus(u, vor), neigung: 0 };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => k.schulter[s].clone().add(u.clone().multiplyScalar(0.1)).add(vor.clone().multiplyScalar(0.09)).add(V(sg * 0.12, 0, 0)));
        return { pose: { becken, rumpf: r, kopf: { neigung: 5 }, hand, ellbogenPol: seiten((s, sg) => V(sg, -1, 0.4)),
            fuss: seiten((s, sg) => fussMitte.clone().add(V(sg * 0.15, 0, 0))), fussRicht: seiten((s, sg) => V(sg * 0.25, 0.2, 1)), kniePol: seiten((s, sg) => V(sg * 0.25, 0.3, 1)) },
          props(g, z) {
            z.ruecken.position.copy(g.becken).add(u.clone().multiplyScalar(0.3)).sub(vor.clone().multiplyScalar(0.17));
            z.ruecken.quaternion.copy(r.basis);
            for (const [s, sg] of [['l', 1], ['r', -1]]) {
              z['sch_' + s].position.copy(g.schulter[s]).add(u.clone().multiplyScalar(0.06)).add(V(sg * 0.02, 0, 0));
              z['sch_' + s].quaternion.copy(r.basis);
            }
          } };
      }
      if (art === 'beinpresse') {
        const becken = V(0, 0.62, -0.22);
        const r = { basis: quer(-48), neigung: 0 };
        const k = rumpf(becken, r);
        const richt = V(0, Math.sin(40 * RAD), Math.cos(40 * RAD));
        const weg = mix(0.45, 0.905, t);   // unten Knie etwa 100–110° gebeugt, oben fast gestreckt (nicht durchgedrückt)
        const huefteMitte = becken.clone().add(V(0, -0.02, 0));
        const mitteFuss = huefteMitte.clone().add(richt.clone().multiplyScalar(weg));
        const fuss = seiten((s, sg) => mitteFuss.clone().add(V(sg * 0.15, 0, 0)));
        if (o.einbeinig) fuss.r = V(-0.24, 0.12, 0.18);   // rechtes Bein ruht unten neben dem Sitz
        return { pose: { becken, rumpf: r, fuss, fussRicht: seiten((s, sg) => V(sg * 0.2, Math.cos(40 * RAD), -Math.sin(40 * RAD) * 0.2)), kniePol: seiten((s, sg) => V(sg * 0.3, 1, 0)),
            hand: seiten((s, sg) => becken.clone().add(V(sg * 0.25, 0.0, 0.05))), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)) },
          props(g, z) { z.platte.position.copy(mitteFuss).add(richt.clone().multiplyScalar(0.06)); z.platte.quaternion.setFromUnitVectors(V(0, 0, 1), richt); } };
      }
      const becken = band ? V(0, 0.55, -0.1) : V(0, 0.64, -0.12);
      const r = { neigung: band ? 4 : -8 };
      const k = rumpf(becken, r);
      let fuss, kpol = seiten((s, sg) => V(0, 1, 0.3)), fussRicht;
      if (art === 'strecker' || art === 'beuger_sitzend') {
        const w0 = (art === 'strecker' ? mix(90, -3, t) : mix(5, 100, t)) * RAD;   // Beinstrecker: oben ganz gestreckt
        const w = (s) => o.einbeinig && s === 'r' ? (art === 'strecker' ? 90 : 5) * RAD : w0;
        fuss = seiten((s, sg) => V(sg * 0.11, 0.58 - Math.sin(w(s)) * MASS.unterschenkel, 0.338 + Math.cos(w(s)) * MASS.unterschenkel));
        fussRicht = seiten((s) => V(0, Math.cos(w(s)), Math.sin(w(s))));
      } else if (band) {
        // Füße stehen fest, Knie drücken gegen das Band nach außen
        fuss = seiten((s, sg) => V(sg * 0.17, FY, 0.42));
        kpol = seiten((s, sg) => V(sg * mix(0.15, 1.3, t), 1, 0.5));
      } else {
        const spreiz = art === 'adduktoren' ? mix(0.42, 0.14, t) : mix(0.14, 0.42, t);
        fuss = seiten((s, sg) => V(sg * spreiz, 0.13, 0.62));
        kpol = seiten((s, sg) => V(sg * 0.3, 1, 0.2));
      }
      return { pose: { becken, rumpf: r, fuss, fussRicht, kniePol: kpol, hand: seiten((s, sg) => becken.clone().add(V(sg * 0.27, -0.02, 0.05))), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)) },
        props(g, z) {
          if (z.rolle) z.rolle.position.copy(o.einbeinig ? g.knoechel.l : g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5)).add(V(0, art === 'strecker' ? 0.06 : -0.06, art === 'strecker' ? 0.02 : -0.04));
          if (z.band) seil(z.band, g.knie.l.clone().add(V(0.06, 0.02, -0.03)), g.knie.r.clone().add(V(-0.06, 0.02, -0.03)));
          if (z.pad_l) for (const [s, sg] of [['l', 1], ['r', -1]]) z['pad_' + s].position.copy(g.knie[s]).add(V(sg * (art === 'abduktoren' ? 0.09 : -0.09), 0, 0));
        } };
    },
    blick: V(0, 0.6, 0.1), abstand: 3.0, kameraRicht: V(1, 0.4, 0.35)
  };
}

/* =================================================================== */
/* Drücken                                                              */
/* =================================================================== */

// Bankdrücken & Fliegende im Liegen. last: langhantel | kurzhanteln | maschine | multipresse | sz ; neigung: 0 | 30 | -15 ; griff: normal | eng ; art: druecken | fliegende | ueberzug | stirn | boden
// Neu: einarmig (nur links eine Kurzhantel) ; griff neutral (Hammergriff, Ellbogen näher am Körper)
export function bankdruecken(o = {}) {
  const last = o.last || 'langhantel', neig = o.neigung || 0, art = o.art || 'druecken', boden = art === 'boden' || o.boden;
  return {
    aufbau(ger) {
      const z = {};
      if (boden) ger.matte();
      else if (neig > 0) { ger.box(0.3, 0.07, 0.4, V(0, 0.43, 0.32), ger.mPolster); ger.box(0.3, 0.07, 0.8, V(0, 0.43 + Math.sin(neig * RAD) * 0.4, 0.12 - 0.4 - Math.cos(neig * RAD) * 0.4 + 0.4), ger.mPolster, -neig); ger.box(0.06, 0.43, 0.06, V(0, 0.215, 0), ger.mRahmen); }
      else ger.bank(-0.05, 1.2, neig < 0 ? 0.5 : 0.43, neig);
      if (last === 'langhantel' || last === 'sz' || last === 'multipresse') z.lh = last === 'sz' ? ger.sz() : ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'ueberzug' && !o.einarmig);   // Überzug: eine Hantel mit beiden Händen
      if (last === 'maschine') {   // Brustpresse: Gestell hinter der Lehne, Hebel vom Drehpunkt oben zu den Griffen
        for (const sx of [-1, 1]) ger.box(0.07, 1.55, 0.07, V(sx * 0.45, 0.775, -0.42), ger.mRahmen);
        ger.box(0.97, 0.07, 0.07, V(0, 1.55, -0.42), ger.mRahmen);
        z.griff_l = ger.griff(); z.griff_r = ger.griff();
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
      }
      return z;
    },
    pose(t) {
      const hoehe = boden ? 0.13 : 0.565;
      const winkel = boden ? 0 : neig;
      const becken = boden ? V(0, 0.13, 0.32) : neig > 0 ? V(0, 0.58, 0.28) : V(0, hoehe + (neig < 0 ? 0.05 : 0), 0.3);
      const r = { basis: quer(-90 + winkel), neigung: 0 };
      const k = rumpf(becken, r);
      // Griff: normal etwa 1,5 × Schulterbreite (Unterarme unten senkrecht), eng knapp schulterbreit
      const breit = o.griff === 'eng' ? 0.17 : o.griff === 'neutral' ? 0.24 : 0.31;
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
          const brustUnten = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(neig > 10 ? 0.12 : 0.2)).add(k.R.vor.clone().multiplyScalar(0.14));
          const unten = brustUnten.add(k.R.links.clone().multiplyScalar(sg * breit)).add(k.R.vor.clone().multiplyScalar(boden ? 0.12 : last === 'kurzhanteln' ? 0.14 : 0.05));   // Bodendrücken: Oberarme liegen unten auf dem Boden auf
          const oben = sch.clone().add(k.R.links.clone().multiplyScalar(sg * (breit - MASS.schulterBreite))).add(V(0, ARM * 0.995, 0));
          hand[s] = mv(unten, oben, t);
          const eng = o.griff === 'eng' || o.griff === 'neutral';
          // Ellbogen unter der Stange (Unterarm senkrecht) und etwa 45–70° vom Körper, nicht seitlich ausgestellt
          epol[s] = k.R.links.clone().multiplyScalar(sg * (eng ? 0.3 : 0.55)).add(V(0, -1, 0)).add(k.R.oben.clone().multiplyScalar(eng ? -0.7 : -0.45));
          if (o.griff === 'neutral') flaeche[s] = k.R.links.clone().multiplyScalar(-sg);
        }
      }
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
          if (z.griff_l) for (const [s, sg] of [['l', 1], ['r', -1]]) {
            z['griff_' + s].position.copy(g.hand[s]);
            seil(z['hebel_' + s], V(sg * 0.45, 1.5, -0.42), g.hand[s].clone().add(V(sg * 0.07, 0, 0)));
          }
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
      const handY = (art === 'wand' ? 1.25 : art === 'schraeg' ? 0.5 : art === 'defizit' ? 0.14 : 0.04) + flug;
      const breit = art === 'eng' ? 0.13 : 0.24;
      const fussPunkt = art === 'wand' ? V(0, FY, -0.1) : art === 'erhoeht' ? V(0, 0.5, -0.98) : art === 'knie' ? V(0, 0.06, -0.46) : art === 'defizit' || art === 'plyo' ? V(0, 0.11, -0.92) : V(0, 0.11, -0.95);
      // Schulterhöhe über der Hand: oben Armlänge, unten knapp über Hand
      // Oben Arme gestreckt, unten Brust knapp über dem Boden
      const abstandOben = STUETZ * 0.99, abstandUnten = art === 'wand' ? 0.25 : art === 'defizit' ? 0.11 : art === 'schulterblatt' ? STUETZ * 0.97 : 0.16;
      const schulterMitte = V(0, handY, handZ).add(V(0, 0, 0));
      const hoch = mix(abstandUnten, abstandOben, t);
      // Schulter liegt auf der Linie von der Hand senkrecht zum Körper (vereinfacht: über der Hand, Richtung weg von der Wand)
      let sch;
      if (art === 'wand') sch = V(0, handY - 0.05, handZ - hoch);
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
      const epol = seiten((s, sg) => V(sg * (art === 'eng' ? 0.2 : 0.8), 0.5, -1));
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
        const x = mix(-0.24, 0, t), hoch = mix(0.22, Math.sqrt((STUETZ * 0.96) ** 2 - 0.31 ** 2), t);
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
        sch = mv(V(0, 0.3, 0.44), V(0, 0.58, 0.36), t);
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

// Schulterdrücken. last: langhantel | kurzhanteln | maschine | kettlebell | band ; sitzend: bool ; art: druecken | arnold | landmine
// Neu: art pushpress (Langhantel, kurzer Kniestoß) ; last multipresse ; einarmig (links drückt, rechts an der Hüfte) ; boden (Z-Press, am Boden sitzend)
export function schulterdruecken(o = {}) {
  const last = o.last || 'kurzhanteln', art = o.art || 'druecken', sitzend = o.sitzend !== false && last !== 'langhantel' ? !!o.sitzend : false;
  const stange = last === 'langhantel' || last === 'multipresse', boden = !!o.boden;
  if (art === 'landmine') return landmine(o);
  return {
    aufbau(ger) {
      const z = {};
      if (sitzend && !boden) { ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.05), ger.mPolster); ger.box(0.36, 0.7, 0.08, V(0, 0.85, -0.25), ger.mPolster, -5); }
      if (boden) ger.matte();
      if (stange) z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell' && o.einarmig) z.kb = ger.kettlebell();
      else if (last === 'kurzhanteln' || last === 'kettlebell') khAufbauen(ger, z, !o.einarmig);
      if (last === 'maschine') { for (const sx of [-1, 1]) ger.box(0.06, 1.9, 0.06, V(sx * 0.45, 0.95, -0.3), ger.mRahmen); z.lh = ger.langhantel(); z.lh.scale.set(0.5, 1, 1); }
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
        hand[s] = mv(unten, oben, t);
        // Ellbogen unten etwa 30–60° vor der Körperseite (Schulterblattebene), nicht ganz seitlich
        epol[s] = art === 'arnold' ? mv(V(sg * 0.15, -1, 1), V(sg, -1, 0.6), glatt(t * 1.4)) : V(sg, -1, stange ? 1.2 : 1.0);
      }
      if (o.einarmig) { hand.r = becken.clone().add(V(-0.17, 0.05, 0.06)); epol.r = V(-1, 0, -0.5); }
      const fuesse = boden ? { fuss: seiten((s, sg) => V(sg * 0.15, FY, -0.15 + BEIN * 0.97)), kniePol: seiten(() => V(0, 1, 0)), fussRicht: seiten((s, sg) => V(sg * 0.2, 1, 0.3)) }
        : sitzend ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.14);
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol }, fuesse),
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.kb) kettlebellAn(z.kb, g, 'l');
          if (z.kh_l) kurzhantelnAn(z, g, art === 'arnold' && t < 0.4 ? 'hammer' : 'quer');
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
  const vorgebeugt = art === 'reverse_fly' && !o.brustgestuetzt;
  const maschine = art === 'seitheben' && last === 'maschine';   // Seitheben-Maschine: sitzend, Polster außen am Oberarm
  const sitzend = (!!o.sitzend || maschine) && !vorgebeugt && !o.brustgestuetzt;
  return {
    aufbau(ger) {
      const z = {};
      if (maschine) {
        ger.box(0.4, 0.62, 0.08, V(0, 0.98, -0.26), ger.mPolster);
        ger.box(0.08, 0.95, 0.08, V(0, 0.475, -0.32), ger.mRahmen);
        z.pad_l = ger.box(0.07, 0.2, 0.12, V(), ger.mPolster); z.pad_r = ger.box(0.07, 0.2, 0.12, V(), ger.mPolster);
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen);
      }
      if (last === 'kurzhanteln') khAufbauen(ger, z, !angelehnt);
      if (last === 'scheibe') { z.scheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28); }
      if (angelehnt) ger.box(0.08, 1.8, 0.08, V(-0.45, 0.9, 0.05), ger.mRahmen);
      if (yKabel) { ger.turm(V(0.62, 0, 0.12)); ger.turm(V(-0.62, 0, 0.12)); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }
      else if (last === 'kabel') {
        z.anker = ger.turm(V(art === 'seitheben' ? -0.55 : 0, 0, art === 'reverse_fly' || art === 'aufrecht' ? 0.7 : -0.55)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        if (art === 'frontheben' || art === 'aufrecht') { z.griff = ger.griff(); z.griff.scale.set(art === 'aufrecht' ? 2.2 : 3, 1, 1); }
      }
      if (o.brustgestuetzt) ger.box(0.34, 0.08, 0.9, V(0, 0.75, 0.25), ger.mPolster, 40);
      if (sitzend) ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.05), ger.mPolster);
      return z;
    },
    pose(t) {
      const becken = vorgebeugt ? V(0, 0.88, -0.12) : sitzend ? V(0, 0.56, -0.05) : angelehnt ? V(0.13, 0.955, 0.02) : V(0, 0.975, 0);
      const r = { neigung: vorgebeugt ? 60 : o.brustgestuetzt ? 45 : 2, seit: angelehnt ? 14 : 0 };
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
          if (z.kh_l) kurzhantelnAn(z, g, art === 'frontheben' ? 'quer' : 'hammer');
          const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          if (z.scheibe) { z.scheibe.position.copy(mitte); z.scheibe.quaternion.setFromUnitVectors(V(0, 1, 0), g.R.vor); }
          if (z.griff) z.griff.position.copy(mitte);
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
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'einarmig') ger.bank(-0.05, 1.1, 0.43, 0);
      if (art === 'brustgestuetzt') ger.box(0.34, 0.08, 0.95, V(0, 0.78, 0.18), ger.mPolster, 42);
      if (art === 'kabel_sitzend' && last === 'band') {   // am Boden sitzend, Band um die Fußsohlen
        ger.matte(); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand);
      } else if (art === 'kabel_sitzend') { ger.box(0.4, 0.4, 1.0, V(0, 0.2, -0.05), ger.mPolster); z.anker = ger.box(0.12, 0.6, 0.12, V(0, 0.3, 0.95), ger.mRahmen); ger.box(0.4, 0.3, 0.06, V(0, 0.2, 0.68), ger.mRahmen, -20); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); if (breitGriff) z.griff.scale.set(4.6, 1, 1); }
      if (art === 'maschine') {   // Rudermaschine: Sitz, Brustpolster vorn, Griffe an Hebeln vom Drehpunkt oben
        ger.box(0.4, 0.5, 0.36, V(0, 0.25, -0.18), ger.mPolster);
        ger.box(0.1, 0.5, 0.1, V(0, 0.25, 0.32), ger.mRahmen); ger.box(0.36, 0.42, 0.08, V(0, 0.97, 0.25), ger.mPolster, -10);
        for (const sx of [-1, 1]) ger.box(0.07, 1.75, 0.07, V(sx * 0.42, 0.875, 0.78), ger.mRahmen);
        ger.box(0.91, 0.07, 0.07, V(0, 1.75, 0.78), ger.mRahmen);
        z.griff_l = ger.griff(); z.griff_r = ger.griff();
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
      }
      if (art === 'umgekehrt') { if (o.tisch) tisch(ger, 0.76); else z.stange = ger.stange(0.95, 1.2, 0.0); }
      if (o.erhoeht) ger.box(0.5, 0.45, 0.4, V(0, 0.225, 1.42), ger.mPolster);
      if ((last === 'langhantel' || last === 'multipresse') && art === 'vorgebeugt') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell') z.kb = ger.kettlebell();
      if (last === 'langhantel' && (art === 'brustgestuetzt' || art === 'tbar')) { z.tgriff = ger.griff(); z.tgriff.scale.set(3.2, 1, 1); z.hebel = ger.stab(V(), V(0, 1, 0), 0.025, ger.mMetall); z.tscheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28); }
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
        const becken = V(0, 0.58, -0.08);
        const r = { neigung: 18 };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.04, -0.06, ARM * 0.99)), k.schulter[s].clone().add(V(sg * 0.07, -0.2, 0.06)), o.einarmig && s === 'l' ? 0 : t));   // vorn Arme gestreckt
        return { pose: { becken, rumpf: r, kopf: { neigung: 5 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, -0.3, -1)),
            fuss: seiten((s, sg) => V(sg * 0.16, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            for (const [s, sg] of [['l', 1], ['r', -1]]) {
              z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0));
              seil(z['hebel_' + s], V(sg * 0.42, 1.68, 0.78), g.hand[s].clone().add(V(sg * 0.05, 0.04, 0)));
            }
          } };
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
        const vorn = V(0, k.brust.y - (breitGriff ? 0.12 : 0.22), 0.55), nah = k.brust.clone().add(V(0, breitGriff ? -0.08 : -0.24, 0.12));
        for (const [s, sg] of [['l', 1], ['r', -1]]) hand[s] = mv(vorn, nah, t).add(V(sg * (breitGriff ? 0.3 : 0.07), 0, 0));
        return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => breitGriff ? V(sg, 0.4, -0.6) : V(sg * 0.3, -0.5, -1)), fuss: seiten((s, sg) => V(sg * 0.13, 0.32, 0.62)), fussRicht: seiten(() => V(0, 0.7, 1)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 0)) },
          props(g, z) { const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5); z.griff.position.copy(mitte); const a = V(0, 0.32, 0.92); const d = mitte.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(mitte).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); } };
      }
      if (art === 'einarmig') {
        // Linkes Knie und linke Hand auf der Bank, rechts zieht
        const becken = V(0.05, 0.86, -0.38);
        const r = { neigung: 80, drehung: 0 };
        const k = rumpf(becken, r);
        const haengt = k.schulter.r.clone().add(V(-0.02, -ARM * 0.997, 0));
        const gezogen = k.schulter.r.clone().add(V(-0.05, -0.2, -0.24));
        const hand = { l: V(0.17, 0.48, 0.32), r: mv(haengt, gezogen, t) };
        return { pose: { becken, rumpf: r, kopf: { neigung: -30 }, hand, ellbogenPol: { l: V(1, 0, -0.2), r: V(-0.3, 0.6, -1) }, fuss: { l: V(0.1, 0.52, -0.62), r: V(-0.3, FY, -0.2) }, fussRicht: { l: V(0, 0, -1), r: V(-0.2, 0, 1) }, kniePol: { l: V(0, -1, 0.5), r: V(-0.3, 0, 1) }, zehen: { l: -80, r: 0 } },
          props(g, z) { if (z.kh_l) hantelAn(z.kh_l, g.hand.r, V(0, 0, 1)); if (z.kb) z.kb.position.copy(g.hand.r).add(V(0, -0.01, 0)); } };
      }
      const brust = art === 'brustgestuetzt', pendlay = !!o.pendlay, unter = o.griff === 'unter';
      // Knie nur leicht gebeugt (10–30°), Rumpf höchstens 45° über der Waagrechten, Pendlay fast waagrecht
      const becken = brust ? V(0, 0.68, -0.15) : pendlay ? V(0, 0.84, -0.3) : unter ? V(0, 0.93, -0.14) : V(0, 0.925, -0.17);
      const r = { neigung: brust ? 48 : pendlay ? 82 : unter ? 47 : art === 'tbar' ? 47 : 55 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const breit = last === 'kurzhanteln' ? 0.03 : 0.07;
        // Pendlay: Stange liegt unten auf dem Boden (Scheibenradius 0,225 m)
        const haengt = pendlay ? V(sg * 0.26, 0.23, k.schulter[s].z + 0.02) : k.schulter[s].clone().add(V(sg * breit, -ARM * 0.997, 0.02));
        if (unter) flaeche[s] = V(0, 0.2, 1);
        const gezogen = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.3)).add(k.R.links.clone().multiplyScalar(sg * 0.2)).add(k.R.vor.clone().multiplyScalar(0.12));
        hand[s] = mv(haengt, gezogen, t);
        epol[s] = V(sg * 0.3, 0.6, -1);
      }
      return {
        pose: Object.assign({ becken, rumpf: r, kopf: { neigung: -20 }, hand, ellbogenPol: epol, handflaeche: flaeche, kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, stehFuesse(0.15, brust ? 0.15 : 0.05)),
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.hebel) {   // T-Bar: Hebel vom Drehpunkt bis zum Griff (brustgestützt: Drehpunkt vorn, stehend: hinten zwischen den Beinen durch)
            const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), dreh = art === 'tbar' ? V(0, 0.05, -1.15) : V(0, 0.05, 1.25), d = dreh.clone().sub(m).normalize();
            z.tgriff.position.copy(m); seil(z.hebel, dreh, m.clone().sub(d.clone().multiplyScalar(0.05)));
            z.tscheibe.position.copy(m).add(d.clone().multiplyScalar(art === 'tbar' ? -0.12 : 0.18)); z.tscheibe.quaternion.setFromUnitVectors(V(0, 1, 0), d);
          }
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
      const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(0, -ARM * 0.96, 0)).add(L(sg, 0.04)), k.schulter[s].clone().add(V(0, -0.16, 0.2)).add(L(sg, 0.1)), t));
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
        ger.box(0.45, 0.45, 0.42, V(0, 0.225, -0.05), ger.mPolster); ger.box(0.4, 0.08, 0.14, V(0, 0.68, 0.1), ger.mPolster); ger.box(0.12, 2.3, 0.12, V(0, 1.15, -0.45), ger.mRahmen);
        if (hebel) { ger.box(0.9, 0.08, 0.08, V(0, 2.05, -0.4), ger.mRahmen); z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.024, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.024, ger.mRahmen); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }
        else { z.lh = ger.langhantel(); z.lh.scale.set(art === 'latzug_eng' ? 0.25 : o.griff === 'unter' ? 0.32 : 0.6, 1, 1); z.lh.children.forEach((c, i) => { if (i > 0) c.visible = false; }); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }   // Latzugstange ohne Scheiben
      }
      else z.stange = ger.stange(2.25, art === 'archer' ? 1.5 : 1.3, 0);
      if (art === 'sprung' || art === 'negativ') ger.box(0.5, 0.55, 0.45, V(0, 0.275, -0.15), ger.mPolster);
      if (art === 'maschine') { z.polster = ger.box(0.5, 0.07, 0.4, V(), ger.mPolster); z.hub = ger.box(0.06, 1, 0.06, V(), ger.mRahmen); ger.box(0.5, 0.1, 0.5, V(0, 0.05, -0.35), ger.mRahmen); }
      if (art === 'band') { z.band_a = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.band_b = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'zusatzgewicht') z.kh = ger.kurzhantel();
      return z;
    },
    pose(t) {
      const breit = art === 'chinup' || art === 'latzug_eng' ? 0.16 : art === 'archer' ? 0.5 : o.griff === 'neutral' ? 0.2 : o.griff === 'unter' ? 0.18 : o.griff === 'breit' ? 0.42 : 0.33;
      // Handflächen: Untergriff zum Gesicht, Hammergriff zueinander, sonst Obergriff (Standard der Figur)
      const flaeche = art === 'chinup' || o.griff === 'unter' ? seiten(() => V(0, 0, -1)) : o.griff === 'neutral' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined;
      if (latzug) {
        const becken = V(0, 0.55, -0.02);
        const r = { neigung: -14 };
        const k = rumpf(becken, r);
        const oben = seiten((s, sg) => V(sg * breit, k.schulter[s].y + ARM * 0.985, k.schulter[s].z + 0.12));
        const unten = seiten((s, sg) => k.brust.clone().add(V(sg * (breit * 0.85), 0.02, 0.2)));
        const hand = seiten((s) => mv(oben[s], unten[s], t));
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, handflaeche: flaeche, ellbogenPol: seiten((s, sg) => V(sg, -0.6, -0.3)), fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.38)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            if (z.hebel_l) { for (const [s, sg] of [['l', 1], ['r', -1]]) { z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 0, 1)); seil(z['hebel_' + s], V(sg * 0.42, 2.05, -0.4), g.hand[s].clone().add(V(sg * 0.04, 0.03, 0))); } return; }
            stangeAn(z.lh, g); const mitte = z.lh.position.clone(); const a = V(0, 2.25, mitte.z); const d = a.clone().sub(mitte), l = d.length(); z.seil.position.copy(a).add(mitte).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); } };
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
          if (z.polster) {
            const knie = g.knie.l.clone().add(g.knie.r).multiplyScalar(0.5);
            z.polster.position.copy(knie).add(V(0, -0.08, -0.12));
            z.hub.position.set(0, (knie.y - 0.1) / 2, knie.z - 0.12); z.hub.scale.set(1, Math.max(knie.y - 0.1, 0.05), 1);
          }
          if (z.band_a) { const k = g.knie.r.clone().add(V(0, -0.05, 0)); seil(z.band_a, V(-0.04, 2.24, 0), k); seil(z.band_b, V(0.04, 2.24, 0), k.clone().add(V(0.05, 0, 0))); }
          if (z.kh) { z.kh.position.copy(g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5)).add(V(0, -0.02, 0.02)); z.kh.quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 0, 1)); }
        } };
    },
    // Negativ: schnell hoch (Sprung von der Box), oben halten, 4,5 s langsam ablassen
    blick: V(0, 1.35, 0), abstand: 4.4, kameraRicht: V(0.8, 0.15, 0.7), dauer: art === 'halten' ? STATISCH : art === 'sprung' ? [0.5, 0.6, 3.0, 0.5] : art === 'negativ' ? [0.6, 0.6, 4.5, 0.8] : undefined
  };
}

function latzugArt(art) { return art === 'latzug' || art === 'latzug_eng'; }

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
        const hand = { r: mv(V(-0.24, 1.5, 0.2), k.schulter.r.clone().add(V(-0.08, -0.26, 0.04)), t), l: V(0.15, 0.56, 0.32) };
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
    const c = curl({ art: 'scott', last: 'sz' });
    const aufbau = c.aufbau, pose = c.pose;
    c.aufbau = (ger) => { const z = aufbau(ger); z.lh.scale.set(0.45, 0.6, 0.6); z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen); return z; };
    c.pose = (t) => { const p = pose(t); const props = p.props; p.props = (g, z) => { props(g, z); for (const [s, sg] of [['l', 1], ['r', -1]]) seil(z['hebel_' + s], g.ellbogen[s].clone().add(V(sg * 0.12, -0.03, 0)), g.hand[s].clone().add(V(sg * 0.12, 0, 0))); }; return p; };
    return c;
  }
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'scott') { z.pult = ger.box(0.5, 0.06, 0.34, V(), ger.mPolster); ger.box(0.4, 0.5, 0.4, V(0, 0.25, -0.12), ger.mPolster); ger.box(0.06, 0.8, 0.06, V(0, 0.4, 0.15), ger.mRahmen); }
      if (art === 'konzentration' || art === 'schraeg') ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster);
      if (art === 'spider') ger.box(0.34, 0.08, 0.95, V(0, 0.78, 0.18), ger.mPolster, 42);
      if (art === 'schraeg') ger.box(0.36, 0.8, 0.08, V(0, 0.8, -0.38), ger.mPolster, -30);
      if (last === 'langhantel' || last === 'sz') z.lh = last === 'sz' ? ger.sz() : ger.langhantel();
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'konzentration');
      if (last === 'kabel') {
        ger.turm(V(0, 0, 0.6)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        if (o.seilgriff) { z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); }
        else z.griff = ger.griff();
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
        else if (art === 'spider') ell = k.schulter[s].clone().add(V(sg * 0.02, -MASS.oberarm * 0.97, 0.03));
        else ell = k.schulter[s].clone().add(V(sg * 0.02, -MASS.oberarm * 0.97, art === 'schraeg' ? -0.08 : 0.02));
        // Scott: unten nicht ganz durchstrecken (Bizepssehne), oben fast ganz beugen
        const w = mix(art === 'scott' ? 46 : 8, art === 'scott' ? 180 : 140, t) * RAD;
        const ab = art === 'scott' ? V(0, -Math.cos(w), Math.sin(w) * 0.9 + 0.2) : V(0, -Math.cos(w), Math.sin(w));
        hand[s] = genau(ell.clone().add(ab.normalize().multiplyScalar(UNTERARM)));
        if (art === 'konzentration' && s === 'l') { hand[s] = becken.clone().add(V(0.2, 0.05, 0.3)); }
        if (last === 'langhantel' || last === 'sz') hand[s].x = sg * (last === 'sz' ? 0.15 : 0.2);
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
          if (z.kh_l) { if (art === 'konzentration') hantelAn(z.kh_l, g.hand.r, g.R.links); else kurzhantelnAn(z, g, o.griff === 'hammer' ? 'hammer' : 'quer'); }
          if (art === 'spider' && z.kh_l) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], V(1, 0, 0));
          if (z.seil) {
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), a = V(0, 0.15, 0.55);
            if (z.strang_l) {   // Seilgriff: Kabel bis zum Knoten, von dort je ein Seilende in jede Hand
              const knoten = mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.16));
              seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r);
            } else { z.griff.position.copy(mitte); seil(z.seil, a, mitte); }
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
      const ell = k.schulter.r.clone().add(V(-0.02, -0.25, -0.13));
      const u = ell.clone().sub(k.schulter.r).normalize();
      const quer = V(0, -u.z, u.y).normalize();     // nach vorn-unten, senkrecht zum Oberarm
      const w = mix(10, 140, t) * RAD;
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
  if (art === 'maschine') { const c = curl({ art: 'maschine' }), p = c.pose; c.pose = (t, z) => p(1 - t, z); return c; }   // Scott-Maschine rückwärts: Arm streckt sich
  const band = art === 'ueberkopf' && last === 'band';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'pushdown' && last === 'band') { tuer(ger, 0.45); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      else if (art === 'pushdown' && o.seil) { ger.turm(V(0, 0, 0.42)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mScheibe); }
      else if (art === 'pushdown') { ger.turm(V(0, 0, 0.42)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); }
      if (art === 'ueberkopf') { if (last === 'kabel') { ger.turm(V(0, 0, -0.55)); z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); } else if (band) { z.seil = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); } else { z.kh_l = ger.kurzhantel(); } }
      if (art === 'kickback') { ger.bank(-0.05, 1.1, 0.43, 0); z.kh_l = ger.kurzhantel(); }
      if (art === 'dips') for (const sx of [-1, 1]) { const b = ger.zyl(0.02, 0.6, ger.mMetall); b.rotation.x = Math.PI / 2; b.position.set(sx * 0.27, 1.25, 0.05); ger.box(0.05, 1.25, 0.05, V(sx * 0.27, 0.625, -0.22), ger.mRahmen); }
      if (art === 'dips' && o.assistiert) { z.polster = ger.box(0.5, 0.07, 0.4, V(), ger.mPolster); z.hub = ger.box(0.06, 1, 0.06, V(), ger.mRahmen); }
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
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.27, 1.27, 0.05)), ellbogenPol: seiten((s, sg) => V(sg * (o.brust ? 0.6 : 0.2), 0.3, -1)),
            fuss, fussRicht: seiten(() => o.assistiert ? V(0, -0.3, -1) : V(0, -0.8, 0.6)), kniePol: seiten(() => o.assistiert ? V(0, -1, 1) : V(0, 0, 1)) },
          props(g, z) {
            if (!z.polster) return;
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
          props(g, z) { hantelAn(z.kh_l, g.hand.r, V(1, 0, 0)); } };
      }
      const becken = V(0, 0.975, art === 'pushdown' ? 0 : 0);
      const r = { neigung: art === 'pushdown' ? 10 : -4 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (art === 'pushdown') {
          // Oberarm bleibt am Körper (entlang der Rumpfachse), nur der Unterarm bewegt sich
          const ell = k.schulter[s].clone().sub(k.R.oben.clone().multiplyScalar(MASS.oberarm * 0.995)).add(k.R.vor.clone().multiplyScalar(0.03));
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
          if (z.griff) { z.griff.position.copy(mitte); seil(z.seil, art === 'pushdown' ? V(0, 2.0, 0.38) : V(0, 0.2, -0.5), mitte); }
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
      if (art === 'rueckenstrecker') { ger.box(0.4, 0.08, 0.45, V(0, 0.95, 0.3), ger.mPolster, 45); ger.box(0.3, 0.08, 0.15, V(0, 0.35, -0.45), ger.mPolster); ger.box(0.08, 0.95, 0.08, V(0, 0.47, 0.1), ger.mRahmen, 30); }
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'plank' || art === 'seitstuetz' || art === 'hollow' || art === 'superman') {
        if (art === 'seitstuetz') {
          const ang = o.heben ? mix(7, 24, t) : 18;   // Seitstütz mit Hüftheben: Becken sinkt und hebt sich
          const richt = V(0, Math.sin(ang * RAD), -Math.cos(ang * RAD));
          const fussP = V(0, FY, 0.75);
          const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02 + 0.02 * atmen));
          const seitlich = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 90 * RAD);
          const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), richt).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -90 * RAD));
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
        const radZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.96) ** 2 - (sm.y - griffY) ** 2));
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
        return { pose: { becken, rumpf: r, kopf: { neigung: -20 }, hand: seiten((s, sg) => k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.12)).add(k.R.vor.clone().multiplyScalar(0.12))), ellbogenPol: seiten((s, sg) => V(sg, 0, 0)), fuss: seiten((s, sg) => V(sg * 0.12, 0.42, -0.45)), kniePol: seiten(() => V(0, 0, 1)), fussRicht: seiten(() => V(0, -0.5, 1)) } };
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
        const hand = { r: k.schulter.r.clone().add(V(0, -ARM * 0.997, 0)), l: k.brust.clone().add(k.R.links.clone().multiplyScalar(0.16)).sub(k.R.oben.clone().multiplyScalar(0.36)).add(k.R.vor.clone().multiplyScalar(0.05)) };
        return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: { r: V(-0.3, 0, -1), l: V(1, 0, -0.5) } }, stehFuesse(0.15)),
          props(g, z) { hantelAn(z.kh_l, g.hand.r, V(0, 0, 1)); } };
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
        : k.schulter[s].clone().add(V(sg * 0.07, -ARM * 0.997, 0)));
      const epol = seiten((s, sg) => art === 'ueberkopf' || (art === 'kellner' && s === 'l') ? V(sg, 0, 0) : art === 'frontal' ? V(sg * 0.3, -1, 0) : V(sg * 0.3, 0, -1));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: art === 'ueberkopf' || art === 'kellner' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, fuss, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) {
          if (z.kb) { kettlebellAn(z.kb, g, 'l'); return; }
          if (art === 'frontal') { z.kh_l.position.copy(g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5)); z.kh_l.quaternion.setFromUnitVectors(V(1, 0, 0), g.R.oben); return; } if (z.lh) stangeAn(z.lh, g); else { if (z.kh_l && art === 'suitcase') hantelAn(z.kh_l, g.hand.r, V(0, 0, 1)); else kurzhantelnAn(z, g, 'hammer'); } } };
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
      if (kbMaschine) {
        ger.box(0.4, 0.08, 0.35, V(0, 1.12, 0.32), ger.mPolster, 60); ger.box(0.08, 1.1, 0.08, V(0, 0.55, 0.45), ger.mRahmen); ger.box(0.5, 0.04, 0.04, V(0, 1.0, 0.55), ger.mMetall);
        ger.box(0.5, 0.06, 0.6, V(0, 0.03, 0.2), ger.mRahmen);
        return { hebel: ger.stab(V(), V(0, 1, 0), 0.03, ger.mRahmen), pad: ger.box(0.14, 0.12, 0.08, V(), ger.mPolster) };
      }
      if (last === 'kabel') { if (art === 'crossover' || art === 'kabelfly_tief') { ger.turm(V(0.85, 0, -0.1)); ger.turm(V(-0.85, 0, -0.1)); } else ger.turm(V(anker.x, 0, anker.z)); }
      if (bandFly) { ger.box(0.1, 1.6, 0.1, V(0, 0.8, -0.52), ger.mRahmen); ger.box(1.0, 0.07, 0.07, V(0, 1.3, -0.52), ger.mRahmen); }
      const dicke = last === 'band' ? 0.012 : 0.006, m = last === 'band' ? ger.mBand : ger.mKabel;
      z.seil_l = ger.stab(V(), V(0, 1, 0), dicke, m);
      if (art === 'crossover' || art === 'kabelfly_tief') z.seil_r = ger.stab(V(), V(0, 1, 0), dicke, m);
      return z;
    },
    pose(t) {
      let becken = V(0, 0.975, 0), r = { neigung: 4 }, hand = {}, epol = {}, fuss, kpol, fussRicht;
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
          const offen = k.schulter[s].clone().add(V(sg * 0.5, bandFly ? -0.04 : art === 'crossover' ? 0.08 : -0.2, bandFly ? 0.08 : 0.14).normalize().multiplyScalar(ARM * 0.975));
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
          fuss = { l: V(0.11, FY, 0.0), r: huefteR.clone().add(V(0, -Math.cos(w2), -Math.sin(w2)).multiplyScalar(BEIN * 0.95)) };
          kpol = seiten((s, sg) => V(sg * 0.1, 0, 1)); fussRicht = { l: V(0.15, 0, 1), r: V(0, -0.6, 0.8) };
          void k2;
        }
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol }, fuss ? { fuss, kniePol: kpol, fussRicht } : stehFuesse(0.16, art === 'facepull' ? -0.05 : 0)),
        props(g, z) {
          if (z.hebel) { z.pad.position.copy(g.ferse.r).add(V(0, 0.03, -0.05)); seil(z.hebel, V(-0.12, 0.7, 0.2), z.pad.position); return; }
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
      const r = { neigung: mix(55, 0, t) };
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
      if (ghd) {   // GHD-Gerät: Oberschenkelpolster vorn, Fußplatte mit Rolle hinten
        ger.box(0.42, 0.12, 0.3, V(0, 0.9, 0.12), ger.mPolster, -15); ger.box(0.36, 0.3, 0.05, V(0, 1.05, -0.5), ger.mRahmen);
        const rolle = ger.zyl(0.05, 0.36, ger.mPolster); rolle.rotation.z = Math.PI / 2; rolle.position.set(0, 1.1, -0.42);
        ger.box(0.08, 0.86, 0.08, V(0, 0.43, 0.1), ger.mRahmen); ger.box(0.08, 1.0, 0.08, V(0, 0.5, -0.5), ger.mRahmen); ger.box(0.5, 0.05, 0.9, V(0, 0.025, -0.2), ger.mRahmen);
        return {};
      }
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
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg, -1, -0.5)), fuss: seiten((s, sg) => V(sg * 0.1, 0.12 + hy, -MASS.unterschenkel * 0.98)), kniePol: seiten(() => V(0, -1, 0.3)), fussRicht: seiten(() => V(0, -0.2, -1)) } };
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
        props(g, z) { if (z.kh_l) hantelAn(z.kh_l, g.hand.l, V(0, 0, 1)); } };
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
      const becken = mv(V(0, 0.37, -0.13), V(0, 0.555, -0.14), t), r = { neigung: 6 };
      const hand = seiten((s, sg) => V(sg * 0.2, 0.47, -0.27));   // Hände flach auf der Bankkante
      return { pose: { becken, rumpf: r, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.2, 0, -1)),
        fuss: seiten((s, sg) => V(sg * 0.12, FY, 0.62)), kniePol: seiten((s, sg) => V(sg * 0.1, 1, 1)), fussRicht: seiten(() => V(0, 0.2, 1)) } };
    },
    blick: V(0, 0.6, 0), abstand: 3.0, kameraRicht: V(1, 0.3, 0.45)
  };
}

// Dip-Maschine im Sitzen: Griffe seitlich, nach unten drücken
function dipMaschine() {
  return {
    aufbau(ger) {
      ger.box(0.45, 0.45, 0.42, V(0, 0.225, -0.05), ger.mPolster); ger.box(0.4, 0.7, 0.08, V(0, 0.9, -0.28), ger.mPolster, -8);
      for (const sx of [-1, 1]) ger.box(0.06, 1.3, 0.06, V(sx * 0.4, 0.65, -0.32), ger.mRahmen);
      return { griff_l: ger.griff(), griff_r: ger.griff(), hebel_l: ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen), hebel_r: ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen) };
    },
    pose(t) {
      const becken = V(0, 0.56, -0.08), r = { neigung: 4 };
      const k = rumpf(becken, r);
      const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.1, -0.2, 0.08)), k.schulter[s].clone().add(V(sg * 0.1, -1, 0).normalize().multiplyScalar(ARM * 0.985)), t));   // unten Arme gestreckt
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)), fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { for (const [s, sg] of [['l', 1], ['r', -1]]) { z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 0, 1)); seil(z['hebel_' + s], V(sg * 0.4, 0.95, -0.32), g.hand[s]); } } };
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
      if (art === 'lsitz') for (const sx of [-1, 1]) { const b = ger.zyl(0.02, 0.6, ger.mMetall); b.rotation.x = Math.PI / 2; b.position.set(sx * 0.27, 1.25, 0.05); ger.box(0.05, 1.25, 0.05, V(sx * 0.27, 0.625, -0.22), ger.mRahmen); }
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
      if (art === 'bauchmaschine' || art === 'rueckenstrecker_maschine') {
        ger.box(0.45, 0.45, 0.42, V(0, 0.225, -0.05), ger.mPolster);
        for (const sx of [-1, 1]) ger.box(0.06, 1.5, 0.06, V(sx * 0.36, 0.75, -0.35), ger.mRahmen);
        z.polster = ger.box(0.4, 0.22, 0.08, V(), ger.mPolster);
        const rolle = ger.zyl(0.05, 0.36, ger.mPolster); rolle.rotation.z = Math.PI / 2; rolle.position.set(0, 0.2, 0.42);
      }
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
        const dy = sm.y - 0.1, radZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.96) ** 2 - dy * dy));
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
        : seiten((s, sg) => k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.13)).add(k.R.links.clone().multiplyScalar(-sg * 0.1)).sub(k.R.oben.clone().multiplyScalar(0.08)));
      return { pose: { becken, rumpf: r, kopf: { neigung: bauch ? 15 : -5 }, hand, ellbogenPol: seiten((s, sg) => bauch ? V(sg * 0.4, -1, 0.5) : V(sg, -0.5, 0)), fuss: seiten((s, sg) => V(sg * 0.13, FY, 0.36)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) {
          z.polster.quaternion.copy(g.R.q);
          z.polster.position.copy(g.brust).add(g.R.vor.clone().multiplyScalar(bauch ? 0.16 : -0.16)).sub(g.R.oben.clone().multiplyScalar(bauch ? 0.06 : 0.12));
        } };
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
        ger.box(0.8, 0.15, 0.6, V(0, 0.075, 0), ger.mRahmen);
        for (const sx of [-1, 1]) { ger.box(0.05, 1.05, 0.05, V(sx * 0.3, 0.6, 0.42), ger.mRahmen); }
        ger.box(0.65, 0.04, 0.04, V(0, 1.12, 0.38), ger.mMetall);
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
          seil(z.kette, vorn, V(0, 0.15, 0.16));
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
      if (art === 'stehend') {
        ger.box(0.5, 0.1, 0.5, V(0, 0.05, 0), ger.mRahmen); ger.box(0.4, 0.6, 0.08, V(0, 0.95, 0.32), ger.mPolster);
        for (const sx of [-1, 1]) ger.box(0.05, 1.3, 0.05, V(sx * 0.28, 0.65, 0.38), ger.mRahmen);
        z.rolle = ger.zyl(0.05, 0.25, ger.mPolster); z.rolle.rotation.z = Math.PI / 2;
      }
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
        props(g, z) { z.rolle.position.copy(g.knoechel.r).add(V(0, 0.02, -0.07)); } };
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
        S = stuetz.clone().add(V(0, 0.44 + 0.015 * atmen, -Math.sqrt(0.94 ** 2 - 0.44 ** 2)));
      } else if (art === 'abduktion') {
        stuetz = V(0, FY, 0.75);
        S = stuetz.clone().add(V(0, 0.43, -Math.sqrt(1.38 ** 2 - 0.43 ** 2)));
      } else if (art === 'copenhagen_lang') {
        stuetz = V(0, 0.5, 0.85);
        S = stuetz.clone().add(V(0, 0.01 + 0.02 * t, -1.38));
      } else {
        stuetz = V(0, 0.5, 0.55);
        S = stuetz.clone().add(V(0, 0.01 + 0.02 * t, -0.94));
      }
      const b = brettPose(stuetz, S, bauch);
      const k = rumpf(b.becken, b.r);
      const handR = V(k.schulter.r.x - 0.24, 0.04, k.schulter.r.z - 0.02);
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
      if (art === 'reverse_butterfly') {
        ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster); ger.box(0.36, 0.6, 0.08, V(0, 0.95, 0.2), ger.mPolster); ger.box(0.12, 1.9, 0.12, V(0, 0.95, 0.55), ger.mRahmen);
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.02, ger.mRahmen); z.griff_l = ger.griff(); z.griff_r = ger.griff();
      }
      if (art === 'pull_apart') z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand);
      if (art === 'kabel_reverse_fly') { ger.turm(V(0.85, 0, 0.55)); ger.turm(V(-0.85, 0, 0.55)); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); }
      if (art === 'aussenrotation' && o.last === 'kabel') { ger.turm(V(0.8, 0, 0.1)); z.band = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff = ger.griff(); }
      else if (art === 'aussenrotation') { ger.box(0.08, 1.3, 0.08, V(0.8, 0.65, 0.1), ger.mRahmen); z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'yt_bauchlage') ger.matte();
      return z;
    },
    pose(t) {
      if (art === 'yt_bauchlage') {
        const becken = V(0, 0.12, 0.25), r = { basis: BAUCHLAGE, neigung: -6 };
        const k = rumpf(becken, r);
        const lift = Math.sin(((t * 2) % 1) * Math.PI);
        const y = glatt((t - 0.42) / 0.16);  // 0 = Y, 1 = T (Wechsel, während die Arme unten sind)
        const hand = seitenBauch((s, sg) => {
          const dY = V(sg * 0.55, 0, -0.83), dT = V(sg, 0, 0.05);
          const d = mv(dY, dT, y).normalize().multiplyScalar(Math.cos(0.3)).add(V(0, mix(-0.25, 0.3, lift), 0)).normalize();
          return k.schulter[s].clone().add(d.multiplyScalar(ARM * 0.96));
        });
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten(() => V(0, 1, 0)), fuss: seitenBauch((s, sg) => V(sg * 0.1, FY, 0.27 + BEIN * 0.998))   /* Hüfte liegt 2 cm hinter dem Becken: Beine fast gestreckt, Knie bleibt über dem Boden */, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, 1)) } };
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
      return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -0.2)) }, sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.35)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.15)),
        props(g, z) {
          if (z.band) seil(z.band, g.hand.l, g.hand.r);
          if (z.seil_l) { seil(z.seil_l, V(-0.85, 1.45, 0.5), g.hand.l); seil(z.seil_r, V(0.85, 1.45, 0.5), g.hand.r); }
          if (z.hebel_l) for (const s of ['l', 'r']) { seil(z['hebel_' + s], V(0, g.hand[s].y + 0.05, 0.5), g.hand[s]); z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); }
        } };
    },
    blick: V(0, 1.1, 0), abstand: 3.4, kameraRicht: art === 'yt_bauchlage' ? V(1, 0.7, 0.4) : V(0.5, 0.35, art === 'reverse_butterfly' ? -1 : 1)
  };
}

// Brust an Maschine bzw. mit Band im Stand: art: presse | butterfly | band_stehend
// Neu: band_stehend + last kabel (zwei Kabeltürme hinter dem Körper)
export function brustmaschine(o = {}) {
  const art = o.art || 'presse', kabel = o.last === 'kabel';
  const sitzt = art !== 'band_stehend';
  return {
    aufbau(ger) {
      const z = {};
      if (sitzt) {
        ger.box(0.42, 0.45, 0.42, V(0, 0.225, -0.1), ger.mPolster); ger.box(0.4, 0.75, 0.08, V(0, 0.98, -0.34), ger.mPolster, -6);
        for (const sx of [-1, 1]) ger.box(0.06, 1.8, 0.06, V(sx * 0.42, 0.9, -0.36), ger.mRahmen);
        z.hebel_l = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen); z.hebel_r = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen); z.griff_l = ger.griff(); z.griff_r = ger.griff();
      } else if (kabel) { ger.turm(V(0.55, 0, -0.75)); ger.turm(V(-0.55, 0, -0.75)); z.band_l = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.band_r = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }
      else { ger.box(0.08, 1.5, 0.08, V(0, 0.75, -0.75), ger.mRahmen); z.band_l = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); }
      return z;
    },
    pose(t) {
      const becken = sitzt ? V(0, 0.56, -0.14) : V(0, 0.96, 0.02);
      const r = { neigung: sitzt ? -6 : 8 };
      const k = rumpf(becken, r);
      let hand, epol;
      if (art === 'butterfly') {
        const w = mix(80, 10, t) * RAD;
        hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(w), -0.12, Math.cos(w)).normalize().multiplyScalar(ARM * 0.975)));   // Ellbogen leicht gebeugt
        epol = seiten((s, sg) => V(sg * 0.3, -1, -0.3));
      } else {
        hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.08, -0.1, 0.08)), k.schulter[s].clone().add(V(-sg * 0.06, -0.1, ARM * 0.93)), t));
        epol = seiten((s, sg) => V(sg, -0.4, -0.6));
      }
      const fuesse = sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.36)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : { fuss: { l: V(0.13, FY, 0.3), r: V(-0.13, FY, -0.25) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) };
      return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol }, fuesse),
        props(g, z) {
          for (const [s, sg] of [['l', 1], ['r', -1]]) {
            if (z['hebel_' + s]) { seil(z['hebel_' + s], V(sg * 0.42, art === 'butterfly' ? 1.7 : 1.6, -0.3), g.hand[s]); z['griff_' + s].position.copy(g.hand[s]); z['griff_' + s].quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); }
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
      let kpol = seiten(() => V(0, -1, -0.2)), fussRicht = seiten(() => V(0, baer ? -1 : -0.2, baer ? 0.3 : 1)), zehen;
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
    aufbau(ger) {
      ger.box(0.4, 0.08, 1.0, V(0, 0.84, -0.22), ger.mPolster);
      for (const sz of [-0.62, 0.18]) { ger.box(0.06, 0.8, 0.06, V(0, 0.4, sz), ger.mRahmen); ger.box(0.44, 0.04, 0.06, V(0, 0.02, sz), ger.mRahmen); }
      return {};
    },
    pose(t) {
      const becken = V(0, 0.97, 0.22), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r);
      const b = mix(12, 92, t) * RAD;   // 0 = Beine hängen senkrecht, 90 = waagerecht nach hinten
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      const fuss = seiten((s, sg) => becken.clone().add(V(0, -0.02 - Math.cos(b) * BEIN * 0.96, Math.sin(b) * BEIN * 0.96)).add(L(sg, 0.1)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand: seiten((s, sg) => V(0, 0.82, k.schulter[s].z - 0.12).add(L(sg, 0.2))), ellbogenPol: seiten((s, sg) => L(sg, 1).add(V(0, 0.2, 0))),
        fuss, kniePol: seiten(() => V(0, 0, -1)), fussRicht: seiten(() => V(0, -Math.sin(b), -Math.cos(b)).add(V(0, 0, 0.2))) } };
    },
    blick: V(0, 0.8, 0.2), abstand: 3.4, kameraRicht: V(1, 0.3, 0.35)
  };
}

export const VORLAGEN = { kniebeuge, kreuzheben, ausfallschritt, hueftheben, wadenheben, beinmaschine, bankdruecken, liegestuetz, schulterdruecken, schulterheben, rudern, klimmzug, curl, trizeps, rumpfuebung, tragen, kabelstand, swing, kniestand, seitlage,
  einbeinkniebeuge, sonderkniebeuge, bandgang, beincurl, seitstuetz, schulterzug, brustmaschine, sprung, vierfuessler, bauchbank };

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
