// DK Coach — Bewegungsvorlagen für die 3D-Figur.
// Jede Vorlage ist eine Funktion (optionen) → Animation { aufbau(geraete), pose(t), blick, abstand, kameraRicht, dauer }.
// t läuft von 0 (Start der Bewegung, z. B. unten bei der Kniebeuge) bis 1 (Endposition, z. B. oben).
import { THREE, V, RAD, MASS, SOHLE, BALLEN, HAND_ULNAR, rumpfRahmen, wirbelRahmen, wirbelBogen, rumpfRing, rumpfPunkt, rundGeo, scheibenGeo, ik, gelenke, KELCH_MASS, kelchGriff, hakenGriff, griffBei } from './figur.js';
export { KELCH_MASS };

const FY = 0.07;                                  // Knöchelhöhe, Fuß steht auf dem Boden
// Ellbogen bis Faustmitte: Die greifende Hand ist zur Kleinfingerseite geknickt (HAND_ULNAR), die Faust liegt griffTief zur Handfläche hin
const UNTERARM = Math.hypot(MASS.unterarm + MASS.griff * Math.cos(HAND_ULNAR), MASS.griff * Math.sin(HAND_ULNAR), MASS.griffTief);
const ARM = MASS.oberarm + UNTERARM;                        // Schulter bis Faustmitte bei gestrecktem Arm (dort liegt das Ziel der Hand)
const STUETZ = MASS.oberarm + MASS.unterarm;                // Schulter bis Handgelenk: flache Hand beim Stütz (Liegestütz, Handstand)
const genau = (v) => Object.assign(v, { genau: true });   // Ziel der Hand gilt genau (Vorlage rechnet schon mit Ellbogen → Faust)
// Ende einer Ruderbewegung wie im Lehrbuch (Devin 31.10.: „die Arme gehen viel zu weit nach hinten“): Oberarm ext° hinter der Rumpflinie
// (Ellbogen knapp hinter dem Brustkorb, nicht weiter; Experience Life/Gentilcore, Planfit: Zug zum Bauchnabel bzw. unteren Brustkorb),
// abd° seitlich vom Körper, Unterarm zeigt in Zugrichtung (freie Gewichte: senkrecht nach unten, Kabel/Band: zum Ansatz). k = rumpf(…)
function ruderEnde(k, s, sg, { ext = 40, abd = 15, zug = V(0, -1, 0) } = {}) {
  const e = ext * RAD, a = abd * RAD, R = k.R;
  const oberarm = R.oben.clone().multiplyScalar(-Math.cos(e) * Math.cos(a)).addScaledVector(R.vor, -Math.sin(e) * Math.cos(a)).addScaledVector(R.links, sg * Math.sin(a)).normalize();
  return k.schulter[s].clone().addScaledVector(oberarm, MASS.oberarm).addScaledVector(zug.clone().normalize(), UNTERARM);
}
const BEIN = MASS.oberschenkel + MASS.unterschenkel;
const mix = (a, b, t) => a + (b - a) * t;
const mv = (A, B, t) => A.clone().lerp(B, t);
const LIEGEND = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, 0, 0));      // Rücken unten, Kopf nach -z
const BAUCHLAGE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, Math.PI, 0)); // Bauch unten, Kopf nach -z, linke Seite bei -x
// (Neigung in Bauchlage: negativ = Brust hebt sich vom Boden)
const quer = (grad) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), grad * RAD);

// Rumpfpunkte genau wie in figur.js → gelenke()
function rumpf(becken, r, w = null) {
  const RB = rumpfRahmen(r), R = w ? wirbelRahmen(RB, w) : RB;
  const brust = w ? becken.clone().add(wirbelBogen(RB, w, MASS.rumpf)) : becken.clone().add(R.oben.clone().multiplyScalar(MASS.rumpf));
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
// Neu: laengs (Griffachse bleibt die ganze Bewegung längs zum Rumpf bzw. zur Bank: Fliegende, oben Handflächen zueinander, unten nach oben)
function kurzhantelnAn(z, g, griff = 'quer') {
  for (const s of ['l', 'r']) {
    if (!z['kh_' + s]) continue;
    const ua = unterarmAchse(g, s);
    khHalten(z, g, s, z['kh_' + s], griff === 'hammer' ? 'neutral' : griff === 'daumenHoch' ? { daumen: V(0, 1, 0) } : griff === 'laengs' ? g.R.oben.clone().sub(ua.clone().multiplyScalar(g.R.oben.dot(ua))) : g.R.links.clone().sub(ua.clone().multiplyScalar(g.R.links.dot(ua))));
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
  // Arm hängt: die Kugel hängt nach unten. Unterarm oben (Rack, Drücken, über Kopf): sie liegt hinter dem Handrücken
  const x = faustAchse(g, s), a = g.handAchse[s], w0 = Math.max(0, Math.min(1, (a.y + 0.2) / 0.6)), w = w0 * w0 * (3 - 2 * w0), unten = V(0, -1, 0).lerp(g.handRuecken[s].clone().multiplyScalar(0.98).addScaledVector(a, -0.2), w), y = unten.negate(), yy = y.addScaledVector(x, -y.dot(x)).normalize(), z2 = x.clone().cross(yy);
  kb.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yy, z2));
  kb.position.copy(g.hand[s]).addScaledVector(yy, -0.02);
}
// Griff um die vorgegebene Mitte der Handgelenke W: Der Unterarm macht genau die geplante Bewegung
function kelchAmGelenk(W, U, vor, li, innen) { const g0 = kelchGriff(V(), U, vor, li, innen), w0 = V(); for (const s of ['l', 'r']) w0.add(g0.hand[s]).addScaledVector(g0.kelch[s].finger, -MASS.griff).addScaledVector(g0.kelch[s].ruecken, MASS.griffTief); return kelchGriff(W.clone().addScaledVector(w0, -0.5), U, vor, li, innen); }
// Griff um eine vorgegebene Mitte der Faustpunkte M
function kelchUm(M, U, vor, li, innen) { const g0 = kelchGriff(V(), U, vor, li, innen), C = M.clone().sub(g0.hand.l.clone().add(g0.hand.r).multiplyScalar(0.5)); return kelchGriff(C, U, vor, li, innen); }
// Hantel in die Hände: Mitte der Faustpunkte minus Griffhöhe. kelchW 0: hängt an den Fingern unter dem Kopf, 1: Kopf liegt auf den Handflächen. Eine Kante des Sechskants zeigt nach vorn (kante 30, 0: eine Fläche)
function kelchAn(kh, g, U0, vor = null, li = null, innen = false) {
  // Hängt sie noch an den Fingern, hängt sie senkrecht; erst im Griff nimmt sie die Lage der Übung an
  const k = Math.abs((g.kelchW && g.kelchW.l) || 0), U = k < 1 ? V(0, 1, 0).lerp(U0, k).normalize() : U0, v = (vor || g.R.vor).clone().addScaledVector(U, -(vor || g.R.vor).dot(U)).normalize(), g0 = griffBei(k, V(), U, v, li, innen);
  const off = g0.hand.l.clone().add(g0.hand.r).multiplyScalar(0.5), z = innen ? v.clone().negate() : v.clone(), y = z.clone().cross(U).normalize();
  kh.position.copy(g.hand.l).add(g.hand.r).multiplyScalar(0.5).sub(off);
  kh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(U, y, z)).premultiply(new THREE.Quaternion().setFromAxisAngle(U, KELCH_MASS.kante * RAD));
}
// Hängende Hantel in beiden Händen (Haken, figur.js): die Ziele der Arme, die Hantel hängt 4,2 cm unter dieser Höhe
const HAENGEN = 0.042, HAENGEN_X = 0.06;
// Kettlebell in beiden Händen: Griffbogen durch die Fäuste, die Kugel in Verlängerung der Arme
function kbBeide(kb, g) {
  const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), d = m.clone().sub(g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5)).normalize(), x = g.R.links.clone().addScaledVector(d, -g.R.links.dot(d)).normalize(), y = d.clone().negate(), z2 = x.clone().cross(y);
  kb.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z2));
  kb.position.copy(m).addScaledVector(y, -0.016);
}
function khAufbauen(ger, z, beide = true) { z.kh_l = ger.kurzhantel(); if (beide) z.kh_r = ger.kurzhantel(); }
// Seil, Band oder Hebel zwischen zwei Punkten (für ger.stab-Teile)
function seil(mesh, A, B) {
  const d = B.clone().sub(A), l = Math.max(d.length(), 1e-4);
  mesh.position.copy(A).add(B).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.divideScalar(l)); mesh.scale.set(1, l, 1);
}
// Band als Kette über mehrere Punkte: z[name] ist das erste Stück, weitere entstehen als Kopien (gleiches Material), übrige werden unsichtbar
function bandKette(z, name, punkte) {
  const st = z[name + '_kette'] || (z[name + '_kette'] = [z[name]]);
  while (st.length < punkte.length - 1) { const k = z[name].clone(); z[name].parent.add(k); st.push(k); }
  st.forEach((m, i) => { m.visible = i < punkte.length - 1; if (m.visible) seil(m, punkte[i], punkte[i + 1]); });
}
// Schlaufe um beide Knie/Beine: vorderer und hinterer Strang außen herum (zweiter Strang als Kopie)
function schlaufe(z, name, g, A, B, r = 0.012, um = g.R.vor) {   // um: Richtung des ersten Strangs (stehend vor, sitzend oben)
  if (!z[name + 'H']) { z[name + 'H'] = z[name].clone(); z[name].parent.add(z[name + 'H']); }
  bandKette(z, name, umDenKoerper(g, A, B, r, um)); bandKette(z, name + 'H', umDenKoerper(g, A, B, r, um.clone().negate()));
}
// Körper als Ersatzformen für Bänder (an der Haut gemessen): Oberschenkel 10 cm, Schienbein 6 cm, Oberarm 5,5 cm, Unterarm 4,5 cm,
// Rumpf unten 14 cm / oben 17,5 cm um eine Linie, die 3 bzw. 6 cm vor Becken → Brust liegt (Brust steht weiter vor als der Rücken)
function koerperKapseln(g) {
  const k = [], vor = g.R.vor, mitte = g.becken.clone().lerp(g.brust, 0.45);
  k.push([g.becken.clone().addScaledVector(vor, 0.03), mitte.clone().addScaledVector(vor, 0.03), 0.14], [mitte.clone().addScaledVector(vor, 0.06), g.brust.clone().addScaledVector(vor, 0.06), 0.175], [g.kopf, g.kopf, 0.11]);
  for (const s of ['l', 'r']) k.push([g.huefte[s], g.knie[s], 0.11], [g.knie[s], g.knoechel[s], 0.065], [g.schulter[s], g.ellbogen[s], 0.078], [g.ellbogen[s], g.handgelenk[s], 0.05]);
  return k;
}
// Strang des Bands zwischen den Händen (Schlinge, hinter dem Nacken): Er hängt nie in der Luft und erscheint nie aus dem Nichts, sondern ist von Anfang an das obere Ende der Schlinge. Am Boden liegt er flach
// zwischen den Händen, dann zieht er sich gerade; geht er durch den Körper, läuft er außen herum (hinter dem Kopf: nach hinten, sonst vor dem Körper). Das Ende liegt erst in der Hand, dann 5,5 cm in der Faust
function bandSchlingeOben(z, g) {
  const A = g.hand.l, B = g.hand.r, mitte = (A.y + B.y) / 2, e = 0.055 * Math.min(1, Math.max(0, (mitte - 0.15) / 0.3)) / Math.max(0.1, A.distanceTo(B));
  const hinten = Math.min(A.y, B.y) > g.brust.y - 0.1, nach = hinten ? g.R.vor.clone().negate() : g.R.vor.clone();
  const pkt = umDenKoerper(g, A.clone().lerp(B, e), B.clone().lerp(A, e), 0.012, nach);
  const sack = (mitte - 0.012) * (1 - Math.min(1, Math.max(0, (mitte - 0.05) / 0.3)));   // unten liegt das Band auf dem Boden, nur an den Händen hebt es sich
  if (sack > 0.001) {
    if (pkt.length === 2) pkt.splice(1, 0, pkt[0].clone().lerp(pkt[1], 0.12), pkt[0].clone().lerp(pkt[1], 0.88));
    for (let i = 1; i < pkt.length - 1; i++) pkt[i].y = Math.max(0.012, pkt[i].y - sack);
  }
  bandKette(z, 'band_n', pkt);
}
// Band unter dem Fuß: kommt an der Außenkante des Mittelfußes am Boden heraus, nicht mitten durch den Fuß (bis 31.10. 2,6–3,1 cm darin)
function bandAmFuss(g, s, aussen) {
  const mitte = g.ferse[s].clone().lerp(g.ballen[s], 0.5);
  return V(mitte.x + aussen * 0.06, 0.012, mitte.z);
}
// Weg eines gespannten Bands von A nach B außen um den Körper: geht die Strecke durch eine Ersatzform, kommt an der tiefsten Stelle ein
// Punkt dazu, der auf kürzestem Weg nach außen geschoben ist (höchstens drei; nach = bevorzugte Richtung, z. B. hinter den Rücken)
function umDenKoerper(g, A, B, r = 0.012, nach = null) {
  const kaps = koerperKapseln(g), pkt = [A.clone(), B.clone()];
  for (let runde = 0; runde < 3; runde++) {
    let best = null;
    for (let i = 0; i < pkt.length - 1; i++) for (let j = 1; j < 24; j++) {
      const P = pkt[i].clone().lerp(pkt[i + 1], j / 24);
      for (const [C0, C1, rad] of kaps) {
        const d = C1.clone().sub(C0), u = d.lengthSq() > 1e-8 ? Math.max(0, Math.min(1, P.clone().sub(C0).dot(d) / d.lengthSq())) : 0;
        const Q = C0.clone().addScaledVector(d, u), tief = rad + r - P.distanceTo(Q);
        if (tief > 0.004 && (!best || tief > best.tief)) best = { tief, i, P, Q, rad, d };
      }
    }
    if (!best) break;
    let raus = best.P.clone().sub(best.Q);
    if (nach) raus.addScaledVector(nach, 0.6);
    if (best.d.lengthSq() > 1e-8) raus.sub(best.d.clone().multiplyScalar(raus.dot(best.d) / best.d.lengthSq()));
    if (raus.lengthSq() < 1e-8) raus = nach ? nach.clone() : V(0, 0, 1);
    pkt.splice(best.i + 1, 0, best.Q.clone().addScaledVector(raus.normalize(), best.rad + r + 0.006));
  }
  return pkt;
}
// Rumpf-Ausrichtung aus zwei Richtungen: oben (Becken → Brust) und vor (Bauchseite)
function basisAus(oben, vor) {
  const o = oben.clone().normalize();
  const v = vor.clone().sub(o.clone().multiplyScalar(vor.dot(o))).normalize();
  const l = o.clone().cross(v);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(l, o, v));
}
/* ---------- R4: Platten- und Rahmengeräte in der DK Line (Auftrag R, Paket R4, 09.11.2026) ----------
   Schwere graphitfarbene Rundrohre (ger.holm), silberne Hebel- und Gleitteile, Goldkappen, geformte Polster mit Naht, Scheibenhörner mit Goldkappe und ein
   Typenschild am Rahmen. Diese Geräte haben keinen Gewichtsstapel, also auch kein Seil. Körperkontakt (Polster, Fußplatten) und Griffe bleiben genau, wie sie waren. */
const _r4Scheiben = new Map();
// Hantelscheibe wie scheibenGeo (Rand, vertiefte Fläche, Nabe mit Loch), aber mit 28 statt 40 Segmenten: spart je Scheibe rund 450 Dreiecke (Grenze: 15 000 je Maschine)
function r4_scheibeGeo(r, d) {
  const key = r.toFixed(3) + ',' + d.toFixed(3);
  if (!_r4Scheiben.has(key)) {
    const h = d / 2, loch = Math.min(0.026, r * 0.3), nabe = Math.min(r * 0.32, loch + 0.03);
    const pkt = [[loch, -h], [nabe, -h], [nabe + 0.01, -0.68 * h], [r * 0.84, -0.68 * h], [r * 0.9, -h], [r - 0.004, -h], [r, -h + 0.004], [r, h - 0.004], [r - 0.004, h], [r * 0.9, h], [r * 0.84, 0.68 * h], [nabe + 0.01, 0.68 * h], [nabe, h], [loch, h], [loch, -h]];
    _r4Scheiben.set(key, new THREE.LatheGeometry(pkt.map(([x, y]) => new THREE.Vector2(x, y)), 28));
  }
  return _r4Scheiben.get(key);
}
// Scheibenhorn (Achse X) aus Rundrohr: von pos nach außen (sx = ±1), Länge l, Goldkappe am Ende. scheiben: [[Abstand ab pos, Radius, Dicke], …]; die Scheiben bleiben sichtbar
function r4_horn(ger, gruppe, pos, sx, scheiben, l) {
  const E = pos.clone().add(V(sx * l, 0, 0));
  holmIn(ger, gruppe, pos, E, 0.05, ger.mHebel);
  maschTeil(gruppe, dkZyl(0.03, 0.012, 18), ger.mDKGold, E.x + sx * 0.031, E.y, E.z).rotation.z = Math.PI / 2;   // die Rundung des Rohrs reicht 2,5 cm über E hinaus: die Kappe liegt an
  for (const [d, r, dick] of scheiben) maschTeil(gruppe, r4_scheibeGeo(r, dick), ger.mScheibe, pos.x + sx * d, pos.y, pos.z).rotation.z = Math.PI / 2;
}
// Typenschild an einem Rahmenrohr: Halteplatte aus Graphit, davor das Schild. P = Mitte der Schildfläche, blick = Richtung, in die es schaut (waagerecht)
function r4_schild(ger, gruppe, P, blick, titel, untertitel) {
  const s = ger.schild(titel, untertitel); ger.gruppe.remove(s); gruppe.add(s);
  s.position.copy(P); s.rotation.y = Math.atan2(blick.x, blick.z);
  maschTeil(s, rundGeo(0.2, 0.1, 0.012, 0.004, 1), ger.mDK, 0, 0, -0.01);
  return s;
}
// Gummifuß und geformtes Polster in einer Gruppe (bewegte Rahmen)
function r4_fuss(ger, gruppe, P) { const f = ger.fussDK(P); if (gruppe !== ger.gruppe) { ger.gruppe.remove(f); gruppe.add(f); } return f; }
function r4_polster(ger, gruppe, w, h, d, pos, q) { const b = ger.polsterGeformt(w, h, d, pos, q); if (gruppe !== ger.gruppe) { ger.gruppe.remove(b); gruppe.add(b); } return b; }
// Bodenrahmen aus Rundrohr ohne Mittelholm: zwei Längsholme (x = ±xs) und zwei Querholme, Gummifüße an den Enden und in der Mitte
function r4_boden(ger, xs, zr, zv) {
  for (const sx of [-1, 1]) { ger.holm(V(sx * xs, 0.05, zr), V(sx * xs, 0.05, zv), DK.boden); for (const zz of [zr, (zr + zv) / 2, zv]) ger.fussDK(V(sx * xs, 0, zz)); }
  for (const zz of [zr, zv]) ger.holm(V(-xs, 0.05, zz), V(xs, 0.05, zz), DK.boden);
}
// Klimmzugstation: zwei Pfosten (Rundrohr) mit Fußholm und Gummifüßen, Querstange aus Chrom (wie bisher: Achse X, Höhe hoehe, Tiefe zz), goldene Flansche an den Pfosten, Typenschild
function r4_klimmzugStation(ger, hoehe, breite, zz) {
  const s = ger.zyl(0.016, breite, ger.mMetall); s.rotation.z = Math.PI / 2; s.position.set(0, hoehe, zz);
  for (const sx of [-1, 1]) {
    const x = sx * breite / 2;
    ger.holm(V(x, 0.05, zz), V(x, hoehe + 0.04, zz), DK.holm);                                             // Pfosten Ø 9,5 cm
    ger.holm(V(x, 0.05, zz - 0.25), V(x, 0.05, zz + 0.25), DK.boden);                                      // Fußholm (Grundfläche wie die alte Fußplatte)
    for (const dz of [-0.25, 0.25]) ger.fussDK(V(x, 0, zz + dz));
    ger.teil(dkZyl(0.05, 0.012, 20), ger.mDKGold, V(x - sx * (0.0475 + 0.006), hoehe, zz)).rotation.z = Math.PI / 2;   // Flansch an der Innenseite des Pfostens, die Stange geht hindurch
  }
  r4_schild(ger, ger.gruppe, V(breite / 2 + 0.0475 + 0.016, 1.35, zz), V(1, 0, 0), 'KLIMMZUG', 'RÜCKEN');
  return s;
}
// Multipresse: zwei Führungsschienen an den Stangenenden
// Multipresse (Smith-Maschine): Die Stange läuft mit zwei Lagerböcken an senkrechten Chromstangen (Führungen bei x = ±SMITH_X), die Scheiben
// sitzen außen davon. Rahmen mit vier Pfosten, oben und hinten verbunden, vorne offen; Sicherheitsanschläge unten an den Führungen,
// Scheibenablage hinten. Die Stange kann nur senkrecht fahren: smithFuehren() legt die Hand-Ziele dieser Vorlagen auf die Führungslinie
const SMITH_X = 0.62;
// DK Line (R4): vier Pfosten Ø 9,5 cm, Kopf- und Bodenholme, chromblanke Führungen (wie bisher), Scheibenablage hinten mit Goldkappe, Typenschild oben vorn. Der Rahmen fährt in z mit der Stange
function schienenAufbauen(ger, z) {
  const r = new THREE.Group();
  const holm = (A, B, d, m) => holmIn(ger, r, A, B, d, m), teil = (geo, m, x, y, zz) => maschTeil(r, geo, m, x, y, zz);
  const HX = 1.02, ZV = 0.38, ZH = -0.38, HO = 2.3;
  for (const sx of [-1, 1]) {
    for (const zz of [ZH, ZV]) {                                                                              // vier Pfosten mit Goldringen
      holm(V(sx * HX, 0.05, zz), V(sx * HX, HO, zz), DK.holm);
      for (const y of [0.3, HO - 0.14]) teil(dkZyl(0.0525, 0.012, 20), ger.mDKGold, sx * HX, y, zz);
    }
    holm(V(sx * HX, 0.05, ZH - 0.04), V(sx * HX, 0.05, ZV + 0.04), DK.boden);                               // Bodenholm je Seite
    holm(V(sx * HX, HO - 0.05, ZH), V(sx * HX, HO - 0.05, ZV), DK.strebe);                                     // Kopfholm je Seite
    for (const y of [0.075, 2.2]) holm(V(sx * SMITH_X, y, 0), V(sx * HX, y, 0), DK.strebe);               // Führungshalter unten und oben
    for (const zz of [ZH - 0.04, ZV + 0.04]) r4_fuss(ger, r, V(sx * HX, 0, zz));
    // Führung mit Sicherheitsanschlag (in einer Gruppe, die bei schrägen Führungen um ihre Mitte kippt)
    const f = new THREE.Group(); f.position.set(sx * SMITH_X, 1.12, 0); r.add(f); (z.smithFuehrung = z.smithFuehrung || []).push(f);
    maschTeil(f, new THREE.CylinderGeometry(0.016, 0.016, 2.16, 16), ger.mMetall);
    maschTeil(f, new THREE.CylinderGeometry(0.042, 0.042, 0.07, 20), ger.mGummi, 0, 0.42 - 1.12, 0);
    maschTeil(f, rundGeo(0.1, 0.03, 0.06, 0.008, 1), ger.mHebel, 0, 0.375 - 1.12, 0);
    // Scheibenablage hinten: Horn nach hinten aus dem Pfosten, darauf eine Scheibe
    holm(V(sx * HX, 0.55, ZH), V(sx * HX, 0.55, -0.62), 0.05, ger.mHebel);
    teil(dkZyl(0.03, 0.012, 18), ger.mDKGold, sx * HX, 0.55, -0.62 - 0.031).rotation.x = Math.PI / 2;
    teil(r4_scheibeGeo(0.225, 0.05), ger.mScheibe, sx * HX, 0.55, -0.52).rotation.x = Math.PI / 2;
  }
  holm(V(-HX, 0.05, ZH), V(HX, 0.05, ZH), DK.boden);                                                        // Querholm unten hinten (vorn bleibt offen)
  holm(V(-HX, HO, ZH), V(HX, HO, ZH), DK.holm);                                                             // Querholme oben
  holm(V(-HX, HO, ZV), V(HX, HO, ZV), DK.holm);
  r4_schild(ger, r, V(0, HO, ZV + 0.0475 + 0.016), V(0, 0, 1), 'MULTIPRESSE', 'GANZKÖRPER');
  ger.gruppe.add(r);
  z.smith = r; z.smithMat = { hebel: ger.mHebel, gold: ger.mDKGold };
}
function schienenAn(z) {
  if (!z.smith || !z.lh) return;
  // Führungen gehen durch die Linie der Stange (z.smithLinie: Punkt oben + Neigung, sonst senkrecht durch die Stange)
  const L = z.smithLinie;
  z.smith.position.set(0, 0, L ? L.z + (1.12 - L.y) * Math.tan(L.kipp) : z.lh.position.z);
  for (const f of z.smithFuehrung || []) f.rotation.x = L ? L.kipp : 0;
  if (!z.lager) {   // DK Line (R4): Gleitlager der Stange in Silber mit Goldleiste und Sicherheitshaken in Gold; sie gehören zur Stange und fahren mit ihr an den Führungen
    const M = z.smithMat;
    z.lager = [-1, 1].map((sx) => {
      const g = new THREE.Group(); g.position.x = sx * SMITH_X;
      const block = new THREE.Mesh(rundGeo(0.09, 0.13, 0.085, 0.015, 1), M.hebel); block.castShadow = true; g.add(block);
      const leiste = new THREE.Mesh(rundGeo(0.05, 0.012, 0.004, 0.0015, 1), M.gold); leiste.position.set(0, 0.03, 0.0445); g.add(leiste);
      const haken = new THREE.Mesh(rundGeo(0.025, 0.06, 0.05, 0.006, 1), M.gold); haken.position.set(0, 0.07, -0.05); g.add(haken);
      z.lh.add(g); return g;
    });
  }
}
// Hände an einer Multipresse: alle Hand-Ziele auf eine Linie (z fest = Mittel über die Bewegung), weil die Stange nur senkrecht fahren kann.
// anker 'oben': Linie durch die Stange oben (Schulterdrücken: über der Schulter), höchstens 8° schräg; 'mitte' (Bankdrücken): Linie durch die
// Mitte zwischen Brustpunkt unten und Lockout über der Schulter, bis 13° schräg – so stehen die Unterarme unten fast senkrecht und die Stange
// liegt oben noch über dem Schultergelenk (bis 1.11. Anker oben, 8°: Unterarm unten 19° zum Kopf geneigt)
function smithFuehren(f, ankerVon = null) {
  return (o = {}) => {
    const a = f(o), anker = typeof ankerVon === 'function' ? ankerVon(o) : ankerVon;
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
        const grenze = (anker === 'mitte' ? 13 : 8) * RAD, kipp = anker ? Math.max(-grenze, Math.min(grenze, Math.atan2(o1.z - u0.z, o1.y - u0.y))) : 0;
        zFest = anker === 'oben' ? { y: o1.y, z: o1.z, kipp } : anker === 'mitte' ? { y: (o1.y + u0.y) / 2, z: (o1.z + u0.z) / 2, kipp } : { y: 0, z: [0, 0.25, 0.5, 0.75, 1].map((u) => bei(u).z).reduce((x, y) => x + y, 0) / 5, kipp: 0 };
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
// Tisch für Rudern am Tisch: Platte über dem Körper (Richtung Füße), die Hände greifen die Kante bei z = 0, der Kopf liegt außerhalb
// der Platte (sonst stößt er oben an); Beine nach innen versetzt, damit die Ellbogen frei sind
function tisch(ger, h, x = 0) {   // x: Tischmitte seitlich versetzt (einarmig: die Hand greift mittig)
  ger.box(1.1, 0.04, 0.75, V(x, h + 0.02, 0.345), ger.mRahmen);
  for (const sx of [-0.5, 0.5]) for (const sz of [0.2, 0.66]) ger.box(0.05, h, 0.05, V(x + sx, h / 2, sz), ger.mRahmen);
  const kante = ger.zyl(0.02, 1.1, ger.mRahmen); kante.rotation.z = Math.PI / 2; kante.position.set(x, h + 0.02, -0.03);   // runde Vorderkante: dort schließt sich die Faust
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

// Hantel an der Brust: Der obere Kopf liegt am oberen Brustkorb an (bis 5.11. vor 0,265, hoch -0,06: am Sechskant gemessen 0 cm in der Haut, Ellbogen 112–116°). Die Schutzhülle sah den Kopf als Quader, dessen Ecken 3,5 cm über den Sechskant ragen (siehe kopfRund)
export const GOBLET = { vor: 0.205, hoch: 0, polAussen: 0.4, polVor: -0.5 };
// Sechskant-Kopf für die Schutzhülle als Zylinder im Sechseck statt als Quader drum herum: nur, wo die Hantel an der Haut liegt (Goblet, Frontal-Tragen)
function kopfRund(kh) {
  for (const k of [...kh.children]) {
    if (k.geometry.type !== 'CylinderGeometry' || k.geometry.parameters.radialSegments !== 6) continue;
    k.userData.keinTeil = true;
    const r = kh.userData.kopfR * Math.cos(Math.PI / 6), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, k.geometry.parameters.height, 12), k.material);
    m.position.copy(k.position); m.quaternion.copy(k.quaternion); kh.add(m);
  }
  return kh;
}
// Weg zwischen Hocke und Stand, wenn sich der Kniewinkel gleichmäßig ändert (0 unten … 1 oben, Winkel in Grad): Kurz vor dem Strecken kommt fast keine Beinlänge mehr dazu. Linear in der Höhe schoss das Knie dort bis 8 cm je Bild nach hinten
function beinWeg(t, unten, oben) {
  const d = (w) => Math.sqrt(MASS.oberschenkel ** 2 + MASS.unterschenkel ** 2 + 2 * MASS.oberschenkel * MASS.unterschenkel * Math.cos(w * RAD)), d0 = d(unten), d1 = d(oben);
  return (d(mix(unten, oben, Math.max(0, Math.min(1, t)))) - d0) / (d1 - d0);
}
// Beckenhöhe, bei der das Bein gerade gestreckt ist: Knöchel auf Höhe y, Hüftgelenk dx, dz daneben
const beckenGestreckt = (y, dx, dz = 0) => y + 0.02 + Math.sqrt(Math.max(0.01, (BEIN * 0.9995) ** 2 - dx * dx - dz * dz));
// Stange auf dem oberen Rücken: Sie liegt oben auf dem Trapez, die Hand liegt von oben auf ihr, das Handgelenk leicht gebeugt, die Ellbogen zeigen nach unten. griff = Abstand der Faust zur Mitte.
// Bis 5.11. Faust 3 cm tiefer und 3 cm weiter hinten mit geradem Handgelenk: 119° Außendrehung in der Schulter, 133° im Ellbogen
function stangeHinten(k, s, sg, griff, knick = 30, polVor = 0.34, polAussen = 0) {
  return { hand: k.brust.clone().addScaledVector(k.R.links, sg * griff).addScaledVector(k.R.vor, -0.07).addScaledVector(k.R.oben, 0.05), pol: k.R.oben.clone().negate().addScaledVector(k.R.vor, polVor).addScaledVector(k.R.links, sg * polAussen),
    flaeche: k.R.oben.clone().multiplyScalar(0.5).add(k.R.vor), knick };
}
// Arme vor der Brust gekreuzt, Hände an den Schultern (Aufstehen vom Stuhl, Wandsitzen)
function armeGekreuzt(k) {
  return { hand: seiten((s, sg) => k.brust.clone().addScaledVector(k.R.links, -sg * 0.15).addScaledVector(k.R.vor, 0.135).addScaledVector(k.R.oben, s === 'l' ? -0.06 : -0.1)),
    ellbogenPol: seiten((s, sg) => k.R.oben.clone().negate().addScaledVector(k.R.links, sg * 0.5).addScaledVector(k.R.vor, 0.5)), handflaeche: seiten(() => k.R.vor.clone().negate()) };
}
// Stuhl mit Lehne: Sitzfläche 0,45 m hoch, vorn 0,40 m vor der Lehne. x0 = Mitte, zLehne = Lage der Lehne (Figur sitzt nach +z). Oberkante der Lehne STUHL_LEHNE
const STUHL_LEHNE = 0.92, STUHL_SITZ = 0.45;
function stuhlBauen(ger, x0, zLehne) {
  ger.box(0.44, 0.04, 0.42, V(x0, STUHL_SITZ - 0.02, zLehne + 0.21), ger.mPolster);
  for (const sx of [-1, 1]) {
    ger.box(0.035, STUHL_SITZ - 0.04, 0.035, V(x0 + sx * 0.19, (STUHL_SITZ - 0.04) / 2, zLehne + 0.39), ger.mRahmen);
    ger.box(0.035, STUHL_LEHNE - 0.02, 0.035, V(x0 + sx * 0.19, (STUHL_LEHNE - 0.02) / 2, zLehne + 0.02), ger.mRahmen);
  }
  ger.box(0.44, 0.09, 0.03, V(x0, STUHL_LEHNE - 0.045, zLehne + 0.02), ger.mPolster);
}
// Kniebeuge. last: hinten | vorne | goblet | keine | kurzhanteln | multipresse | kettlebell | haengend (eine Hantel hängt zwischen den Beinen) | band ; box, fersen (Fersen erhöht): true ; breite: Faktor
// stuhl: true (vom Stuhl aufstehen, Arme gekreuzt: eigene Bewegung, 5.11.) ; ablagen: true (Sicherungsablagen seitlich, knapp unter der Stange am tiefsten Punkt)
// dauer: [hoch, oben, runter, unten] in s (z. B. Pause unten; wirkt bei jeder Vorlage über animation())
// Ablauf davor (wirkt über animation()): standVersatz, ablaufBand (schlinge: Band als geschlossene Schlinge am Boden, die Figur steigt darauf, nimmt sie auf und legt sie hinter den Nacken)
export function kniebeuge(o = {}) {
  const last = o.last || 'hinten', tiefe = o.tiefe != null ? o.tiefe : 1, stuhl = !!o.stuhl, sumo = (o.breite || 1) > 1.5;
  // Fersen schulterbreit, etwa 1,05× (bis 5.11. 0,15: 0,65×); Aufstehen vom Stuhl hüftbreit, wie der Text es sagt
  const breite = o.breite ? 0.15 * o.breite : stuhl ? 0.13 : 0.235;
  // Multipresse: Füße 10 cm vor der Stange, dann steht das Schienbein steiler und der Rumpf bleibt aufrechter als frei (die Führung hält die Stange)
  const fussZ = last === 'multipresse' ? 0.1 : 0, fussY = FY + (o.fersen ? 0.03 : 0);
  const lean = { hinten: 36, vorne: 17, goblet: 22, keine: o.box ? 35 : 28, kurzhanteln: 26, multipresse: 25, kettlebell: 20, haengend: 18, band: 28 }[last] * (o.fersen ? 0.7 : 1);
  // Becken unten (Höhe, z). Stangen hinten, Multipresse und Frontkniebeuge rücken noch mit dem ganzen Körper, bis die Stange richtig steht (unten).
  // Box: Hüfte nach hinten, Gesäß sitzt auf der Kante, Oberschenkel waagerecht, Schienbein 20° (bis 5.11. volle Kniebeuge vor der Box, Hüfte vor und unter der Kante)
  const UNTEN = { hinten: [0.44, -0.17], vorne: [0.44, -0.15], goblet: [0.45, -0.175], keine: o.box ? [0.495, -0.265] : [0.45, -0.19], kurzhanteln: [0.45, -0.18], multipresse: [0.425, -0.08], kettlebell: [0.45, -0.175], haengend: [0.468, -0.12], band: [0.45, -0.185] }[last];
  if (o.fersen) { UNTEN[0] = 0.455; UNTEN[1] = -0.155; }
  const BOX_H = 0.385;   // Box auf Parallel-Höhe: Das Gesäß liegt bei waagerechtem Oberschenkel gerade auf
  const STUHL_U = V(0, STUHL_SITZ + 0.115, -0.34), STUHL_ZLEHNE = -0.62;
  return {
    aufbau(ger) {
      const z = {};
      if (last === 'hinten' || last === 'vorne' || last === 'multipresse') z.lh = ger.langhantel();
      if (last === 'goblet') z.kh_l = kopfRund(ger.kurzhantel(KELCH_MASS.schwer));
      if (last === 'haengend') z.kh_l = ger.kurzhantel();
      if (last === 'band') for (const n of ['band_l', 'band_r', 'band_n', 'band_unter']) z[n] = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand);
      if (o.fersen) ger.box(0.5, 0.035, 0.12, V(0, 0.0175, -0.05), ger.mRahmen);
      if (last === 'kettlebell') z.kb = ger.kettlebell();
      if (last === 'kurzhanteln') khAufbauen(ger, z);
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (o.box) ger.box(0.42, BOX_H, 0.38, V(0, BOX_H / 2, -0.35), ger.mPolster);
      // Sicherungsablagen: zwei Rohre längs neben der Figur, Oberkante knapp 2 cm unter der Griffstange am tiefsten Punkt (Stange unten auf 0,927 m); der vordere Pfosten steht dort, wo der Ablauf den Ständer aufstellt
      if (o.ablagen) for (const sx of [-1, 1]) {
        ger.box(0.05, 0.03, 0.74, V(sx * 0.6, 0.88, -0.07), ger.mMetall);
        for (const pz of [-0.42, 0.28]) { ger.box(0.05, 1.05, 0.05, V(sx * 0.6, 0.525, pz), ger.mRahmen); ger.box(0.12, 0.03, 0.2, V(sx * 0.6, 0.015, pz), ger.mRahmen); }
      }
      if (stuhl) { stuhlBauen(ger, 0, STUHL_ZLEHNE); ger.box(1.4, 1.8, 0.06, V(0, 0.9, STUHL_ZLEHNE - 0.05), ger.mRahmen); }   // Stuhl an der Wand, so kann er nicht wegrutschen
      return z;
    },
    pose(t) {
      // Vom Stuhl aufstehen: sitzt vorn auf der Kante, neigt den Rumpf aus der Hüfte vor, bis das Gewicht auf den Füßen liegt (Gesäß bleibt auf dem Stuhl), dann erst hoch und ganz aufrichten
      if (stuhl) {
        const vor = glatt(t / 0.34), hoch = beinWeg(Math.max(0, (t - 0.3) / 0.7) ** 1.5, 100, 4);
        const obenY = beckenGestreckt(FY, breite - MASS.hueftBreite, 0.01);
        const becken = mv(STUHL_U, V(0, obenY, -0.01), hoch);
        const r = { neigung: t < 0.34 ? mix(16, 45, vor) : mix(45, 2, glatt((t - 0.34) / 0.66)) };
        const k = rumpf(becken, r);
        return { pose: Object.assign({ becken, rumpf: r, kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, armeGekreuzt(k), stehFuesse(breite, 0, 0.2)) };
      }
      // Unten Oberschenkel mindestens waagrecht, oben Knie gestreckt. Der Kniewinkel ändert sich gleichmäßig, das gibt den Weg dazwischen
      const s0 = beinWeg(t, o.box ? 110 : 125, 4);
      const beckenUnten = V(0, mix(0.97, UNTEN[0], tiefe), UNTEN[1] * tiefe);
      const dx = breite - MASS.hueftBreite, hZiel = last === 'multipresse' ? fussZ : 0;
      const becken = mv(beckenUnten, V(0, beckenGestreckt(fussY, dx, 0.03), hZiel), s0);
      const r = { neigung: mix(lean * tiefe, last === 'vorne' ? 3 : 4, s0) };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {}, knick = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'hinten' || last === 'multipresse') {
          // Griff 1,8× Schulter, das Handgelenk etwas stärker überstreckt: So eng geht es mit diesen Armlängen (Ellbogen 150° ist die Grenze, 1,5× wären 158°). Der Oberarm hängt dabei zwangsläufig steil: Mit der Faust so nah an der Schulter kommt er höchstens auf rund 30°
          const a = stangeHinten(k, s, sg, 0.37, 50, 0.2, 0.3);
          hand[s] = a.hand; epol[s] = a.pol; flaeche[s] = a.flaeche; knick[s] = a.knick;
        } else if (last === 'vorne') {
          // Stange liegt vorn auf den Schultern, die Finger halten sie, das Handgelenk ist weit überstreckt: nur so stehen die Ellbogen hoch und vorn (bis 5.11. Knick 55°, Oberarm 47°, Ellbogen 162°)
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.33)).add(k.R.vor.clone().multiplyScalar(0.09)).add(k.R.oben.clone().multiplyScalar(0.02));
          epol[s] = k.R.vor.clone().addScaledVector(k.R.oben, -0.1).addScaledVector(k.R.links, sg * 0.15);
          flaeche[s] = k.R.oben.clone().addScaledVector(k.R.vor, -0.4); knick[s] = -85;
        } else if (last === 'goblet' || last === 'kettlebell') {
          hand[s] = k.brust.clone().add(k.R.links.clone().multiplyScalar(sg * 0.05)).add(k.R.vor.clone().multiplyScalar(0.22)).sub(k.R.oben.clone().multiplyScalar(0.12));   // Hantel liegt vor Brust und Bauch an
          epol[s] = k.R.oben.clone().multiplyScalar(-1).add(k.R.links.clone().multiplyScalar(sg * 0.3));
        } else if (last === 'keine') {
          hand[s] = k.schulter[s].clone().add(V(0, -0.05, ARM * 0.985));   // Arme lang nach vorn als Gegengewicht (bis 5.11. ARM * 0,95: 39° gebeugt)
          epol[s] = V(sg, -1, 0);
        } else if (last === 'haengend') {
          // Arme hängen lang, beide Hände halten eine Hantel am oberen Kopf (bis 5.11. 41° gebeugt, weil die Faust 12 cm höher saß)
          const sch = k.schulter[s], dx = sch.x - sg * HAENGEN_X, dz = 0.18;
          hand[s] = V(sg * HAENGEN_X, sch.y - Math.sqrt(Math.max(0.01, (ARM * 0.985) ** 2 - dx * dx - dz * dz)) - 0.06, sch.z + dz);
          epol[s] = V(sg, 0, -0.3);
        } else if (last === 'band') {
          // Band liegt hinter dem Nacken auf den Schultern (wie eine Stange), die Hände fassen es seitlich, Ellbogen unten
          const a = stangeHinten(k, s, sg, 0.5);
          hand[s] = a.hand; epol[s] = a.pol; flaeche[s] = a.flaeche; knick[s] = a.knick;
        } else {
          hand[s] = k.schulter[s].clone().add(V(sg * mix(0.2, 0.1, glatt((s0 - 0.72) / 0.28)), -ARM * 0.9995, 0));   // Hanteln unten außen neben den Knien, erst ganz oben dicht am Oberschenkel
          epol[s] = V(sg * 0.3, 0, -1);
        }
      }
      // Stange über dem Mittelfuß: der ganze Körper rückt, bis sie senkrecht über der Fußmitte liegt. Frontkniebeuge: oben steht sie etwas vor der Fußmitte, der Körper bleibt über dem Fuß (bis 5.11. Rücklage, Sprunggelenk -7°).
      // Goblet, Hängend und Co.: Der Körper bleibt über dem Fuß, die kleine Hantel zieht ihn nicht bis hinter die Fersen (bis 5.11. stand die Hantel über der Fußmitte, die Hüfte 20 cm hinter dem Knöchel)
      const zLast = last === 'hinten' || last === 'multipresse' ? 0.04 : last === 'vorne' ? mix(0.075, 0.1, s0) : null;
      if (zLast != null) { const dz = zLast - (hand.l.z + hand.r.z) / 2; becken.z += dz; for (const s of ['l', 'r']) hand[s].z += dz; }
      // Goblet: Die Hantel hängt senkrecht vor der Brust, der obere Kopf liegt an der Brust, die Hände halten ihn von unten (kelchGriff)
      let kelch = null;
      if (last === 'goblet') {
        const gr = kelchGriff(k.brust.clone().addScaledVector(k.R.vor, GOBLET.vor).addScaledVector(k.R.oben, GOBLET.hoch).add(V(0, -0.128, 0)), V(0, 1, 0), k.R.vor);
        hand.l = gr.hand.l; hand.r = gr.hand.r; kelch = gr.kelch;
        for (const [s, sg] of [['l', 1], ['r', -1]]) epol[s] = V(sg * GOBLET.polAussen, -1, GOBLET.polVor);
      }
      if (last === 'haengend') { const gr = hakenGriff(V(0, hand.l.y - HAENGEN, hand.l.z), V(0, 1, 0), k.R.vor, k.R.links); hand.l = gr.hand.l; hand.r = gr.hand.r; kelch = gr.kelch; }
      const flaecheDa = Object.keys(flaeche).length > 0;
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kelch, haken: last === 'haengend', handflaeche: last === 'haengend' ? seiten((s, sg) => V(-sg, 0, 0)) : flaecheDa ? flaeche : undefined, handKnick: flaecheDa ? knick : undefined, handAuf: last === 'keine' ? seiten(() => 1) : undefined, kniePol: seiten((s, sg) => V(sg * (sumo ? 0.9 : 0.35), 0, 1)) }, stehFuesse(breite, fussZ, sumo ? 0.7 : 0.3),
          o.fersen ? { fuss: seiten((s, sg) => V(sg * breite, fussY, 0)), zehen: seiten(() => 14) } : {}),
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.kh_l && last === 'goblet') kelchAn(z.kh_l, g, V(0, 1, 0));
          if (z.kh_l && last === 'haengend') kelchAn(z.kh_l, g, V(0, 1, 0));
          if (z.band_l) {
            for (const [s, sg] of [['l', 1], ['r', -1]]) bandKette(z, 'band_' + s, g.hand[s].y < 0.72 ? [g.hand[s], bandAmFuss(g, s, sg)] : umDenKoerper(g, bandAmFuss(g, s, sg), g.hand[s], 0.012, g.R.links.clone().multiplyScalar(sg)).reverse());   // von der Hand aus: das erste Stück bleibt in der Hand, wie lang die Kette auch ist; beim Aufheben liegt das Band außen, gerade
            seil(z.band_unter, bandAmFuss(g, 'l', 1), bandAmFuss(g, 'r', -1));   // unter beiden Füßen durch: ein Band, nicht zwei Stücke (bis 5.11.)
            bandSchlingeOben(z, g);
          }
          if (z.kb) kbBeide(z.kb, g);
          if (last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
        }
      };
    },
    blick: V(0, 0.75, 0), abstand: 3.4
  };
}

// Zug vom Boden je Art: lean = Rumpfneigung am Start, zu/zo = Stange über dem Fuß unten/oben (Knöchel 0, Fußmitte 0,06), vor/hin = Schulter vor der Stange unten/oben, griff = Griffhöhe am Boden
const KH_ZUG = {
  klassisch: { lean: 63, zu: 0.068, zo: 0.09, vor: 0.02, hin: -0.125 },
  sumo: { lean: 52, zu: 0.07, zo: 0.09, vor: 0.02, hin: -0.125 },
  // Griffe 6 cm über der Mitte der Scheiben (hohe Griffe): Hüfte tiefer, Rumpf aufrechter als beim klassischen Kreuzheben, der Quadrizeps arbeitet mit
  trapbar: { lean: 45, zu: 0.035, zo: 0.01, vor: 0.015, hin: -0.01, griff: 0.285 },
  kettlebell: { lean: 63, zu: 0.04, zo: 0.13, vor: 0.025, hin: -0.15, griff: 0.22 },
  kettlebell_sumo: { lean: 52, zu: 0.04, zo: 0.09, vor: 0.025, hin: -0.11, griff: 0.22 },
  kurzhanteln: { lean: 63, zu: 0.09, zo: 0.1, vor: 0.02, hin: -0.11, griff: 0.22 }
};
// Kreuzheben & Hüftbeugen. art: klassisch | rumaenisch | trapbar | kurzhanteln | kettlebell | sumo | goodmorning | huefte_wand | einbeinig | pull_through
// last (rumaenisch, einbeinig): langhantel | kurzhanteln | keine ; einbeinig auch last kurzhantel (eine Hantel rechts) ; last (pull_through): kabel | band
// block: Blockheben ab Kniehöhe ; bstance: hinterer Fuß nur auf den Zehen ; sumo: breiter Stand (auch mit Kettlebell)
export function kreuzheben(o = {}) {
  const art = o.art || 'klassisch';
  const kh = art === 'kurzhanteln' || o.last === 'kurzhanteln';
  const steif = art === 'rumaenisch' || art === 'goodmorning' || art === 'huefte_wand';
  if (art === 'einbeinig' || art === 'pull_through') return hueftbeuge(art, o);
  return {
    ablaufT: art === 'rumaenisch' || art === 'goodmorning' ? 1 : 0,   // fängt oben an: Die Stange liegt in Hüfthöhe im Ständer, von dort geht es hinunter (bis 5.11. stand sie im Ablauf am Schienbein); Good Morning: aufrecht unter der Stange auf dem Rücken, nicht schon vorgebeugt (6.11.: der Rumpf lief beim Vorbeugen 5 cm in sie)
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
      // Kettlebell: Füße schulterbreit, die Kugel steht dazwischen (bis 5.11. 0,58×, kein Platz, sie stand an den Zehen). Hüftbeuge an der Wand bleibt eng
      const breite = sumo ? 0.34 : art === 'kettlebell' ? 0.217 : art === 'huefte_wand' ? 0.13 : 0.16;
      const hx = o.bstance ? 0.045 : 0;   // Schrittstellung: Becken über dem vorderen Bein
      const stand = (grad) => FY + Math.sqrt((MASS.oberschenkel ** 2 + MASS.unterschenkel ** 2 + 2 * MASS.oberschenkel * MASS.unterschenkel * Math.cos(grad * RAD)) - (breite - MASS.hueftBreite) ** 2) + 0.02;   // Beckenhöhe im Stand bei dieser Kniebeugung
      const griffX = art === 'kettlebell' ? 0.045 : art === 'sumo' ? 0.17 : art === 'trapbar' ? 0.29 : kh ? 0.22 : 0.25;
      const lang = (dz) => Math.sqrt((ARM * 0.9995) ** 2 - (griffX - MASS.schulterBreite) ** 2 - dz * dz);   // Höhe des gestreckten Arms von der Schulter bis zur Stange, die dz davor oder dahinter liegt
      const zug = !steif && art !== 'goodmorning' && !o.block ? KH_ZUG[sumo ? (art === 'kettlebell' ? 'kettlebell_sumo' : 'sumo') : art] : null;
      let becken, neigung, stZ = 0;
      if (zug) {
        // Zug vom Boden: Die Stange läuft senkrecht über der Fußmitte. Bis zum Knie heben Hüfte und Schultern fast gemeinsam ab (Rücken ändert den Winkel kaum, das Knie geht zurück und das Schienbein wird senkrecht, die Stange kommt frei vorbei),
        // danach schiebt die Hüfte vor. Bis 5.11. liefen Becken und Neigung gerade von unten nach oben: das Knie blieb vorn, die Stange wich dort 10 cm aus
        const a = sumo ? 0.3 : 0.48, u = a * t + (1 - a) * t ** 4, w = glatt((t - 0.3) / 0.7), L = MASS.rumpf - 0.03;
        neigung = mix(zug.lean, 1, u); stZ = mix(zug.zu, zug.zo, w);
        const dz = mix(zug.vor, zug.hin, w), hO = stand(3.6) + L * Math.cos(RAD) - lang(zug.hin), schY = mix(zug.griff || 0.225, hO, t) + lang(dz);
        becken = V(0, schY - L * Math.cos(neigung * RAD), stZ + dz - L * Math.sin(neigung * RAD));
      } else if (o.block) {
        becken = blockBecken(t);
        neigung = mix(neigungFuer(blockBecken(0).y, 0.515 + ARM * 0.9995), 1, t);   // Schultern genau eine Armlänge über der Hantel
      } else {
        // Oben Knie leicht gebeugt, Rumpf aufrecht. Schrittstellung: die Hüfte geht weniger weit zurück, sonst läge die Last hinter dem vorderen Fuß
        const wand = art === 'huefte_wand', b0 = o.bstance ? V(hx, 0.945, -0.15) : V(0, wand ? 0.935 : 0.925, -0.2), b1 = V(hx, o.bstance || wand ? 0.975 : stand(12), wand ? 0 : -0.02);
        becken = mv(b0, b1, t);
        neigung = mix(art === 'goodmorning' ? 70 : wand ? 55 : o.bstance ? 62 : 68, wand ? 3 : 0.5, t);
        stZ = mix(kh ? 0.095 : 0.09, 0.1, t);   // Rumänisch: Stange bleibt über der Fußmitte, die Arme gehen unten nach hinten (Lat fest), bis 5.11. hingen sie senkrecht und die Last lag 15–20 cm vor dem Schienbein
      }
      const r = { neigung };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {}, knick = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (art === 'goodmorning') {
          // Armhaltung wie bei der Kniebeuge mit Stange hinten (Griff 1,8×; bis 5.11. 2,05×, Hände weit außen und Schulter 118° außen gedreht)
          const sh = stangeHinten(k, s, sg, 0.37, 50, 0.2, 0.3);
          hand[s] = sh.hand; epol[s] = sh.pol; flaeche[s] = sh.flaeche; knick[s] = sh.knick;
        } else if (art === 'huefte_wand') {
          hand[s] = becken.clone().add(V(sg * 0.12, 0.02, 0.12));
          epol[s] = V(sg, 0, -0.5);
        } else if (o.block) {
          hand[s] = V(sg * griffX, k.schulter[s].y - ARM * 0.9995, k.schulter[s].z + mix(-0.03, 0.02, t));
          epol[s] = V(sg * 0.4, 0, -1);
        } else {
          hand[s] = V(hx + sg * griffX, k.schulter[s].y - lang(k.schulter[s].z - stZ), stZ);
          epol[s] = V(sg * 0.4, 0, -1);
        }
      }
      const pose = Object.assign({ becken, rumpf: r, hand, handflaeche: art === 'trapbar' ? seiten((s, sg) => V(-sg, 0, 0)) : art === 'goodmorning' ? flaeche : undefined, handKnick: art === 'goodmorning' ? knick : undefined, ellbogenPol: epol, kniePol: seiten((s, sg) => V(sg * (sumo ? mix(art === 'kettlebell' ? 0.45 : 0.5, 0.8, glatt(t)) : art === 'kettlebell' ? 0.35 : 0.2), 0, 1)) }, stehFuesse(breite, 0, sumo ? 0.6 : 0.2),
        // Schrittstellung: Füße seitlich nur 13 cm versetzt, das Becken über dem vorderen Fuß, der trägt; der hintere stützt nur mit den Zehen (bis 5.11. 26 cm, das Becken mittig dazwischen)
        o.bstance ? { fuss: { l: V(0.085, FY, 0), r: V(-0.045, FY, -0.31) }, zehen: { l: 0, r: 35 }, fussRicht: { l: V(0.1, 0, 1), r: V(-0.1, 0, 1) }, kniePol: { l: V(0.2, 0, 1), r: V(-0.1, 0, 1) } } : {});
      // Stange oder Hanteln gleiten an den Beinen; stetig über das Knie (bis 5.11. sprang die Hand dort um 7–8 cm). Trap Bar steht seitlich, die Kettlebell zwischen den Beinen
      if (o.block) vorDenBeinenKapsel(pose);
      else if (art !== 'goodmorning' && art !== 'huefte_wand' && art !== 'trapbar' && art !== 'kettlebell') vorDenBeinenKapsel(pose, kh ? 0.085 : 0.006, 0.002);
      return {
        pose,
        props(g, z) {
          if (z.lh) stangeAn(z.lh, g);
          if (kh) kurzhantelnAn(z, g, 'quer');
          if (z.kb) kbBeide(z.kb, g);
        }
      };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.35, 0.45)
  };
}

// Stange vor den Beinen statt darin: nach einem ersten Lösen die Vorderseite der Beine auf Höhe der Hände (an der Haut gemessen:
// Oberschenkel 12 → 7 cm, Schienbein 6,4 → 4 cm vor der Linie Hüfte → Knie → Knöchel) und beide Hände so weit nach vorn, dass die
// Last mit Radius r davor liegt (Stange liegt an, geht nicht hinein)
function vorDenBeinen(pose, r = 0.016, rand = 0.003) {
  const g = gelenke(pose), y = (pose.hand.l.y + pose.hand.r.y) / 2;
  let vorn = -Infinity;
  for (const s of ['l', 'r']) for (const [A, B, ra, rb] of [[g.huefte[s], g.knie[s], 0.12, 0.072], [g.knie[s], g.knoechel[s], 0.058, 0.034]]) {
    if ((y - A.y) * (y - B.y) > 0) continue;
    const u = (y - A.y) / (B.y - A.y), p = A.clone().lerp(B, u), c = Math.abs(B.y - A.y) / A.distanceTo(B);
    vorn = Math.max(vorn, p.z + mix(ra, rb, u) / Math.max(0.5, c));
  }
  const fehlt = vorn + r + rand - Math.min(pose.hand.l.z, pose.hand.r.z);
  if (fehlt > 0) for (const s of ['l', 'r']) pose.hand[s] = pose.hand[s].clone().setZ(pose.hand[s].z + fehlt);
}
// Dasselbe stetig über das Knie: Abstand der Stange zu Oberschenkel und Schienbein als Kapseln im Schnitt y-z (Vorderseite wie oben)
function vorDenBeinenKapsel(pose, r = 0.016, rand = 0.003) {
  const g = gelenke(pose), y = (pose.hand.l.y + pose.hand.r.y) / 2, z0 = Math.min(pose.hand.l.z, pose.hand.r.z);
  const stoesst = (z) => ['l', 'r'].some((s) => [[g.huefte[s], g.knie[s], 0.12, 0.072], [g.knie[s], g.knoechel[s], 0.058, 0.034]].some(([A, B, ra, rb]) => {
    const dy = B.y - A.y, dz = B.z - A.z, u = Math.max(0, Math.min(1, ((y - A.y) * dy + (z - A.z) * dz) / (dy * dy + dz * dz)));
    return Math.hypot(y - A.y - dy * u, z - A.z - dz * u) < mix(ra, rb, u) + r + rand;
  }));
  let z = z0;
  while (stoesst(z) && z < z0 + 0.3) z += 0.002;
  for (const s of ['l', 'r']) pose.hand[s] = pose.hand[s].clone().setZ(pose.hand[s].z + z - z0);
}
// Blockheben: Knie bleibt über dem Knöchel (Schienbein senkrecht), die Hüfte schwingt auf einem Bogen um das Knie nach vorn-oben
// (das Knie streckt sich, statt vorzuschieben); zu Beginn Rumpf etwa 50° vorgeneigt, Schultern knapp vor der Stange
function blockBecken(t) {
  const w = mix(36.4, 0, t) * RAD;
  return V(0, FY + MASS.unterschenkel + 0.02 + MASS.oberschenkel * Math.cos(w), -MASS.oberschenkel * Math.sin(w));
}
// Vorderseite des Rumpfs vor der Linie Becken → Brust (an der Haut gemessen, Brust gespannt), je Abstand s entlang R.oben
const RUMPF_VORN = [[-0.05, 0.14], [0.05, 0.145], [0.1, 0.152], [0.15, 0.155], [0.2, 0.172], [0.25, 0.19], [0.3, 0.215], [0.35, 0.236], [0.4, 0.245], [0.45, 0.19], [0.5, 0.156], [0.55, 0.11]];
function rumpfVorn(s) {
  if (s < RUMPF_VORN[0][0] || s > RUMPF_VORN[RUMPF_VORN.length - 1][0]) return 0;
  let i = 0; while (RUMPF_VORN[i + 1][0] < s) i++;
  const [s0, f0] = RUMPF_VORN[i], [s1, f1] = RUMPF_VORN[i + 1];
  return mix(f0, f1, (s - s0) / (s1 - s0));
}
// Stange oder Griff vor dem Rumpf statt darin: beide Hände entlang R.vor, bis die Last (Radius r) vorn am Rumpf anliegt
function vorDemRumpf(pose, r = 0.016) {
  const R = rumpfRahmen(pose.rumpf), m = pose.hand.l.clone().add(pose.hand.r).multiplyScalar(0.5).sub(pose.becken);
  const f = rumpfVorn(m.dot(R.oben)); if (!f) return;
  const fehlt = f + r + 0.003 - m.dot(R.vor);
  if (fehlt > 0) for (const s of ['l', 'r']) pose.hand[s] = pose.hand[s].clone().addScaledVector(R.vor, fehlt);
}
/* ---------- Paket R3 (Auftrag R, 09.11.2026): Kabelzug in der DK Line ----------
   Jeder Kabelzug mit Kabel (nicht Band) steht an einem Turm wie kabelturmDK (Fliegende), aber an beliebiger Stelle und in beliebiger Richtung:
   r3_turm baut Säule mit Schiene, Wagen und Öse am Seilausgang A, dahinter den Stapel (gewichtsblockDK). Das Seil läuft von der Öse senkrecht hoch zur Rolle oben
   auf der Säule, waagerecht zur Kopfrolle des Stapels und über die bewegliche Rolle zur festen Öse (2:1): zieht jemand das Seil um d länger, steigt der Stapel
   um d/2 (turm.zieh(Länge der Strecke Öse bis Hand oder Griff)). Der Stapel hebt sich nur über das Seil (kein ger.turm, kein nachBild mehr).
   A = Seilausgang, weg = waagerechte Richtung von der Öse zur Säule (vom Trainierenden weg), kam = Kamerarichtung: der Stapel steht zur Kamera hin offen (Schild lesbar) */
function r3_turm(ger, A, weg, kam, titel = 'KABELZUG', untertitel = '', o = {}) {
  const yTop = o.yTop || Math.max(2.3, A.y + 0.3), hMax = o.hMax || 0.5, F = yTop - (0.14 + hMax + 0.18);   // Rolle oben mindestens 30 cm über der Öse
  const w = V(weg.x, 0, weg.z).normalize(), fw = w.clone().negate(), P = V(A.x, 0, A.z).addScaledVector(w, 0.135), ry = Math.atan2(fw.x, fw.z);   // Säule 13,5 cm hinter der Öse (fw zeigt zum Trainierenden)
  const vorn = V(-w.z, 0, w.x); if (vorn.dot(kam) < 0) vorn.negate();
  const an = (d, y) => P.clone().addScaledVector(fw, d).setY(y);   // Punkt in Höhe y, d vor der Säulenachse (zum Trainierenden hin)
  const teil = (geo, m, d, y) => { const t = ger.teil(geo, m, an(d, y)); t.rotation.y = ry; return t; };
  teil(rundGeo(0.3, 0.05, 0.2, 0.02, 1), ger.mDK, 0.08, 0.025);                                                  // Fußplatte der Säule
  ger.holm(an(0, 0.08), an(0, yTop), DK.holm);                                                                    // Säule
  const yU = Math.min(0.3, A.y - 0.1);
  teil(rundGeo(0.06, yTop - 0.12 - yU, 0.012, 0.004, 1), ger.mHebel, 0.0535, (yU + yTop - 0.12) / 2);             // Schiene (reicht bis unter die Öse)
  teil(rundGeo(0.14, 0.13, 0.06, 0.012, 1), ger.mDK, 0.0895, A.y);                                                // Wagen
  ger.teil(new THREE.TorusGeometry(0.02, 0.0045, 8, 16), ger.mDKGold, A).rotation.y = ry;                        // Seilöse am Seilausgang
  const B = gewichtsblockDK(ger, P.clone().addScaledVector(w, 0.31), vorn, F, titel, untertitel, { hMax });
  const seil = stapelAnHebel(ger, { block: B, straenge: 2, naben: [{ zug: true, x: A.x, y: A.y, z: A.z, rN: 0, dir: 1, dD: yTop - A.y }] });
  ger.holm(an(0, yTop), seil.nb[0].Wd, 0.045);                                                                    // Halter der Rolle oben auf der Säule
  let ruhe = Infinity;   // kürzestes Seil bisher: dort steht der Stapel unten (wie früher ger.nachBild)
  seil.zieh = (l) => { ruhe = Math.min(ruhe, l); return seil.stelle([l - ruhe]); };
  return Object.assign(seil, { A, P, fw, an, yTop });
}
// Turm(e) an z hängen: z.dkTurm (für Prüfung und props) und je Turm z.stapel_i (so findet das Prüfwerkzeug den Gewichtsblock)
const r3_setze = (z, ...tuerme) => { z.dkTurm = tuerme; tuerme.forEach((t, i) => { z['stapel_' + i] = t.block; }); return z; };
// Seilknoten (goldene Hülse) am Kabelende, an der die zwei Seilenden eines Seilgriffs hängen; die Vorlage setzt sie in props auf den Knoten
const r3_knoten = (ger) => ger.teil(new THREE.SphereGeometry(0.013, 12, 8), ger.mDKGold);
// Länge eines Seilwegs über mehrere Punkte (Kabel, das am Körper vorbei läuft)
const r3_laenge = (punkte) => punkte.reduce((s, p, i) => (i ? s + p.distanceTo(punkte[i - 1]) : 0), 0);
// Vorlauf (beim Aufbau, einmal durch die Bewegung): so kennt jeder Turm das kürzeste Seil schon vor dem ersten Bild, der Stapel steht in Ruhe unten und die Seillänge
// bleibt von Anfang an gleich (sonst stellt sich das erst im ersten Durchlauf ein, wie früher bei ger.nachBild). a = die Vorlage (this im Aufbau)
function r3_vorlauf(a, z) {
  try { for (let i = 0; i <= 20; i++) { const e = a.pose(i / 20, {}), g = gelenke(e.pose); if (e.props) e.props(g, z); } } catch (err) { /* ohne Vorlauf: der Stapel stellt sich im ersten Durchlauf ein */ }
}
// Halterung vom Haltegriff G zur Säule: an der Flanke der Säule, damit das senkrechte Seil an der Öse frei bleibt (mindestens 3,5 cm Luft); sonst erst seitlich weg, dann zur Säule
function r3_halter(ger, T, G, b = 0.028) {
  const t = V(-T.fw.z, 0, T.fw.x), a = V(T.A.x, 0, T.A.z), g = V(G.x, 0, G.z);
  const abstand = (f) => { const d = f.clone().sub(g), u = Math.max(0, Math.min(1, a.clone().sub(g).dot(d) / Math.max(d.lengthSq(), 1e-9))); return a.distanceTo(g.clone().addScaledVector(d, u)); };
  const wahl = [1, -1].map((s) => { const f = V(T.P.x, 0, T.P.z).addScaledVector(t, s * 0.05); return { s, f, d: abstand(f) }; }).sort((x, y) => y.d - x.d)[0];
  const F = V(wahl.f.x, G.y, wahl.f.z);
  if (wahl.d >= 0.035) ger.vierkant(G, F, b);
  else { const M = G.clone().addScaledVector(t, wahl.s * 0.1); ger.vierkant(G, M, b); ger.vierkant(M, F, b); }
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
        if (last === 'kabel') r3_setze(z, r3_turm(ger, V(0, 0.22, -1.0), V(0, 0, -1), V(1, 0.35, 0.2), 'KABELZUG', 'GESÄSS')); else ger.box(0.08, 0.4, 0.08, V(0, 0.2, -1.05), ger.mRahmen);   // R3: DK-Kabelturm hinter der Figur
        z.seil = ger.stab(V(), V(0, 1, 0), last === 'band' ? 0.012 : 0.004, last === 'band' ? ger.mBand : ger.mKabel);
        if (last === 'kabel') { z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.knoten = r3_knoten(ger); }   // Seilgriff: je ein Ende in jeder Hand
      }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      if (art === 'einbeinig') {
        const becken = mv(V(0.03, 0.94, -0.08), V(0.03, 0.975, 0), t);   // unten Standbein-Knie 21° statt 41° (6.11.: Becken 4 cm höher, dafür Rumpf unten 84° statt 78° geneigt, die Hüfte beugt weiter wie zuvor)
        const r = { neigung: mix(84, 3, t) };
        const k = rumpf(becken, r);
        const huefteR = becken.clone().add(k.R.links.clone().multiplyScalar(-MASS.hueftBreite)).sub(k.R.oben.clone().multiplyScalar(0.02));
        // freies Bein bleibt in Linie mit dem Oberkörper
        // oben pendelt das Bein einige Grad hinter die Senkrechte: der Fuß schwebt über dem Boden bei fast gestrecktem Knie (bis 5.11. kürzeres Bein mit angehobenem Fuß: Knie bis 57°, Zehe rutschte)
        const frei = (mix(84, 3, t) + 9 * t) * RAD, fussR = huefteR.clone().add(V(0, -Math.cos(frei), -Math.sin(frei)).multiplyScalar(BEIN * 0.995));
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.075, -ARM * 0.9995, 0.02)));   // Hanteln etwas außen neben den Beinen
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)),
            fuss: { l: V(0.12, FY, 0.02), r: fussR }, fussRicht: { l: V(0.1, 0, 1), r: k.R.vor.clone().add(V(0, -0.2 + 0.5 * t, 0)) }, kniePol: { l: V(0.1, 0, 1), r: k.R.vor.clone() } },
          props(g, z) { if (z.kh_l) kurzhantelnAn(z, g, 'hammer'); if (z.kh_r && !z.kh_l) khHalten(z, g, 'r', z.kh_r, 'neutral'); } };
      }
      // Pull-Through: Rücken zum Turm, Seil zwischen den Beinen
      const becken = mv(V(0, 0.905, -0.21), V(0, 0.975, 0), t);   // unten Knie rund 30°: Hüftbeuge, keine Kniebeuge (bis 5.11. 49°)
      const r = { neigung: mix(62, 0, t) };
      const k = rumpf(becken, r);
      // Die Arme halten nur: fast gestreckt von der Schulter zum Griff, unten zieht das Kabel die Hände zwischen die Knie (bis 5.11. Ellbogen unten 65–71° gebeugt)
      const hand = seiten((s, sg) => { const ziel = V(sg * mix(0.06, 0.04, t), mix(0.53, 0.8, t), mix(0.03, 0.17, t)); return k.schulter[s].clone().add(ziel.sub(k.schulter[s]).setLength(ARM * 0.985)); });
      return { pose: Object.assign({ becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3)), kniePol: seiten((s, sg) => V(sg * 0.35, 0, 1)) }, stehFuesse(0.2, 0, 0.4)),
        props(g, z) {
          const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), a = last === 'kabel' ? V(0, 0.22, -1.0) : V(0, 0.32, -1.0);
          if (z.strang_l) { const knoten = m.clone().add(a.clone().sub(m).setLength(0.16)); seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r); z.knoten.position.copy(knoten); z.dkTurm[0].zieh(a.distanceTo(knoten)); }
          else seil(z.seil, a, m);
        } };
    },
    blick: V(0, 0.75, 0), abstand: 3.4, kameraRicht: V(1, 0.35, art === 'pull_through' ? 0.2 : 0.45),
    ablaufEigen: art === 'pull_through' ? (h) => Object.assign(bandVomBoden(h, 'zwischen'), { von: V(-0.9, 0, 1.2) }) : undefined   // Griff liegt zwischen den Füßen, das Seil flach zur Rolle (bis 5.11. hing es beim Hinlaufen in Kniehöhe); die Figur kommt quer dazu
  };
}

// Fuß auf den Zehen: So hoch steht der Knöchel, wenn der Fußballen um grad gekippt am Boden bleibt (wie figur.js rechnet; steht er schon dort, hebt ihn figur.js nicht mehr ruckartig an)
const zehenHoehe = (grad) => Math.max(FY, MASS.fussHoehe * 0.6 + 0.02 + Math.sin(grad * RAD) * MASS.fussLaenge * BALLEN);
const STUFE_SEITLICH = 0.2, BANK_VORN = -0.455;   // Seitliches Step-up: niedrige Stufe (bis 5.11. 42 cm: Knie 125°, Sprunggelenk 58°) ; Bulgarisch: Vorderkante der Bank
// Ausfallschritt & Co. art: split | rueckwaerts | gehend | bulgarisch | stepup | seitlich ; last: keine | kurzhanteln | langhantel | multipresse ; kosaken: true (bei seitlich)
// Neu: stepup_seitlich, curtsy ; defizit (bei rueckwaerts): Start auf einer Stufe ; durchgehen: true (bei gehend: die Figur geht wirklich von Schritt zu Schritt, im Ort auf einem mitlaufenden Streifenboden; eigene Bewegung, 5.11.)
// Ablauf davor (wirkt über animation()): schrittExtra (steigen: erst, bogen, fussDreh = der Fuß dreht beim Hinaufsteigen in der Luft nach außen, Bulgarian)
export function ausfallschritt(o = {}) {
  const art = o.art || 'split', last = o.last || 'keine', gehen = art === 'gehend' && !!o.durchgehen;
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'bulgarisch') ger.bank(BANK_VORN - 0.25, 0.5, 0.43);   // Der Fußrücken liegt hinter der Vorderkante auf, das Schienbein hängt frei davor
      if (art === 'stepup') ger.box(0.62, 0.3, 0.42, V(0.03, 0.15, 0.3), ger.mPolster);   // breit genug für beide Füße; 30 cm hoch: Knie mit dem Fuß auf der Kiste etwa 90° (form_3d.json 60 bis 95°; bis 9.11. 42 cm = 107°)
      if (art === 'stepup_seitlich') ger.box(0.36, STUFE_SEITLICH, 0.5, V(0.45, STUFE_SEITLICH / 2, 0.0), ger.mPolster);   // schmaler und der Standfuß unten weiter weg: Beim Hinlaufen bleibt der andere Fuß vor der Stufe (bis 5.11. 13 cm darin)
      if (o.defizit) ger.box(0.5, 0.1, 0.42, V(0, 0.05, 0.2), ger.mRahmen);
      if (last === 'kurzhanteln') khAufbauen(ger, z);
      if (last === 'langhantel' || last === 'multipresse') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (gehen) {
        // Streifen am Boden laufen unter der Figur nach hinten, der stehende Fuß bleibt auf seinem Streifen: So geht sie, ohne aus dem Bild zu laufen
        z.streifen = new THREE.Group(); ger.gruppe.add(z.streifen);
        for (let i = -6; i <= 6; i++) { const m = maschTeil(z.streifen, new THREE.BoxGeometry(0.9, 0.004, 0.035), ger.mRahmen, 0, 0.002, i * 0.4); m.castShadow = false; m.userData.keinTeil = true; }
      }
      return z;
    },
    pose(t, zst) {
      let becken, fuss, zehen = { l: 0, r: 0 }, neigung = 8, fussRicht, reisen = null, kpolR = null, kpolL = null;
      if (art === 'seitlich' && o.kosaken) {
        // Kosaken-Kniebeuge: sehr breit, tief aufs linke Bein. Das rechte Bein bleibt gestreckt und dreht um seinen Knöchel, das Becken läuft darum auf einem Bogen
        // (bis 5.11. gerade Linie: das Bein knickte unterwegs bis 60°). Der rechte Fuß rollt auf der Ferse hoch, die Zehen zeigen oben nach außen (bis 5.11. flach, weil die Ferse in den Boden gemusst hätte)
        const s = beinWeg(t, 127, 4), w = (mix(69, 31.5, s)) * RAD, zh = mix(-0.14, 0, s), Rxy = Math.sqrt(0.885 ** 2 - zh * zh);
        const fr = V(-0.2, 0, 1).lerp(V(0, 0.7, 0.71), 1 - glatt(t)).normalize();
        fuss = { l: V(0.62, FY, 0), r: V(-0.49 + fr.x * 0.06, 0.068 + 0.06 * Math.max(0, fr.y), -0.059 + fr.z * 0.06) };
        becken = V(fuss.r.x + MASS.hueftBreite + Rxy * Math.sin(w), fuss.r.y + 0.02 + Rxy * Math.cos(w), zh);
        neigung = mix(32, 3, s);
        fussRicht = { l: V(0.4, 0, 1), r: fr };
        kpolR = V(-0.2, 0, 1).lerp(V(-0.25, 0.6, 0.77), 1 - glatt(t)); kpolL = V(0.45, 0, 1);   // Bein unten etwa 40° nach außen gedreht
      } else if (art === 'seitlich') {
        // Der rechte Fuß steht fest, das rechte Bein bleibt lang (Knie unter 10°): Das Becken läuft auf einem Bogen um seinen Knöchel. Der linke Fuß tritt 2,5× Schulter zur Seite, die Hüfte geht über ihm nach hinten.
        // Zurück: Er stößt sich ab und kommt zurück neben den rechten in den Stand. Bis 5.11. blieben die Füße breit stehen, beide Knie gebeugt: eine halbe breite Kniebeuge
        const s = glatt(t), w = mix(55.3, 2.3, s) * RAD, zh = mix(-0.16, 0, s), Rxy = Math.sqrt(mix(0.885, 0.889, s) ** 2 - zh * zh);
        becken = V(-0.5 + MASS.hueftBreite + Rxy * Math.sin(w), FY + 0.02 + Rxy * Math.cos(w), zh);
        const f = glatt((s - 0.35) / 0.55);
        fuss = { l: V(mix(0.53, -0.24, f), FY + Math.sin(f * Math.PI) * 0.06, 0), r: V(-0.5, FY, 0) };
        neigung = mix(32, 3, s);
        fussRicht = { l: V(0.12, 0, 1), r: V(-0.12, 0, 1) };
        kpolL = V(0.4, 0, 1);
      } else if (art === 'stepup_seitlich') {
        // Stufe steht links, das Gewicht liegt schon unten über dem oberen Fuß: linker Fuß oben, rechter hängt nur mit und kommt neben die Stufe
        const s = beinWeg(t, 86, 4), y0 = STUFE_SEITLICH + FY;
        becken = mv(V(0.3, 0.93, -0.12), V(0.37, beckenGestreckt(y0, 0.015, 0.02), 0.0), s);
        fuss = { l: V(0.45, y0, 0.0), r: mv(V(-0.02, FY, 0), V(0.17, 0.29, 0.02), glatt(t / 0.6)) };
        neigung = mix(16, 3, s);
        zehen = { l: 0, r: mix(0, 18, t) };
      } else if (art === 'curtsy') {
        // Rechtes Bein geht diagonal hinter das linke, weit über dessen Linie hinaus (Fuß 27 cm daneben, Oberschenkel 20–30° über die Mitte, Knie hinter der linken Ferse), dann zurück in den Stand.
        // Bis 5.11. nur 9 cm daneben, Knie 20 cm außen: ein gewöhnlicher Ausfallschritt
        const f = glatt((t - 0.12) / 0.75), heb = Math.sin(f * Math.PI) * 0.13, fw = glatt((f - 0.02) / 0.82), g = mix(50, 0, glatt((f - 0.45) / 0.55));   // Fuß wandert früher zurück (bis 5.11. Hüftadduktion 33° beim Aufstehen)
        const s = beinWeg(t, 106, 4);
        fuss = { l: V(0.13, FY, 0.06), r: mv(V(0.37, 0, -0.48), V(-0.13, 0, 0.0), fw).setY(zehenHoehe(g) + heb) };
        becken = mv(V(0.07, 0.54, -0.255), V(0, beckenGestreckt(FY, 0.035, 0.03), 0.02), s);   // hinteres Knie 5 cm über dem Boden (bis 5.11. 7 cm)
        zehen = { l: 0, r: g };
        neigung = mix(10, 3, s);
        fussRicht = { l: V(0.15, 0, 1), r: V(0.1, 0, 1) };
        kpolR = V(mix(0.3, -0.1, s), mix(-1, 0, s), mix(0.3, 1, s));
      } else if (art === 'stepup') {
        // Linker Fuß steht ganz auf der Kiste. Der rechte stößt kaum ab: Ferse hoch, dann hängt er hinter der Kiste, hebt sich über ihre Kante und setzt neben dem linken auf; oben sind Knie und Hüfte gestreckt.
        // Bis 5.11. blieb das Knie bei 24° und der rechte Fuß schwebte neben der Kiste
        const s = beinWeg(t, 92, 4), kY = 0.3 + FY;
        const hoch = glatt(t / 0.5), vor = glatt((t - 0.62) / 0.3), ab = glatt((t - 0.8) / 0.2), g = mix(glatt(t / 0.25) * 40, 0, glatt((t - 0.6) / 0.38));
        fuss = { l: V(0.14, kY, 0.3), r: V(mix(-0.12, -0.1, vor), Math.max(zehenHoehe(g), mix(FY, kY + 0.1, hoch)) - 0.1 * ab, mix(-0.12, 0.28, vor)) };
        becken = mv(V(0.1, 0.9, -0.05), V(0.02, beckenGestreckt(kY, 0.045, 0.02), 0.285), s);
        neigung = mix(20, 3, s);
        zehen = { l: 0, r: g };
      } else if (art === 'rueckwaerts' || art === 'gehend') {
        // Aus dem Stand: rückwärts geht das rechte Bein zurück, gehend tritt das linke nach vorn
        const f = glatt((t - 0.2) / 0.65);           // 0 = Schritt steht, 1 = Füße zusammen
        const heb = Math.sin(f * Math.PI) * 0.15, fw = glatt((f - 0.3) / 0.6);   // Fuß erst anheben, dann versetzen (sonst schleift die Fußspitze)
        if (art === 'rueckwaerts') {
          // Defizit: beide Füße starten auf der Stufe (0,1 m), der rechte tritt nach hinten auf den Boden
          // Der hintere Fuß bleibt länger auf den Zehen und setzt erst vorn ab (bis 5.11. fiel die Ferse schon in der Luft: Sprunggelenk 54° und das Knie sprang 10 cm)
          // Der Fuß löst sich früher, bevor das hintere Bein ganz gestreckt ist: gestreckt schlug das Knie um (10 cm je Bild)
          const dh = o.defizit ? 0.1 : 0, f2 = glatt((t - 0.08) / 0.77), fw2 = glatt((f2 - 0.12) / 0.72), g = mix(45, 0, glatt((f2 - 0.5) / 0.5)), s = beinWeg(t, 101, 4);
          fuss = { l: V(0.12, FY + dh, 0.25), r: mv(V(-0.12, 0, -0.55), V(-0.12, 0, 0.22), fw2).setY(zehenHoehe(g) + Math.sin(f2 * Math.PI) * 0.15 + dh * fw2) };
          becken = mv(V(0, 0.55 + dh * 0.25, -0.1 - dh * 0.4), V(0, beckenGestreckt(FY + dh, 0.025, 0.03), 0.22), s);   // Defizit: unten tiefer und weiter hinten, das hintere Knie kommt knapp über den Boden, das vordere bleibt unter 105° (bis 5.11. 8 cm und 106°)
          zehen = { l: 0, r: g };
          kpolR = V(-0.1, -mix(1, 0, glatt(f2 / 0.55)), mix(0.3, 1, glatt(f2 / 0.55)));   // das Knie dreht nach vorn, solange der Fuß noch hinten ist (zeigte es weiter nach unten, schlug es unter der Hüfte um)
        } else if (!gehen) {
          // Vorwärts: der Fuß löst sich erst, wenn das Becken schon deutlich zurück ist (bis 5.11. schon bei halber Höhe), und führt in der Luft mit angezogenen Zehen: erst die Ferse setzt auf
          const xv = Math.max(0, Math.min(1, (t - 0.3) / 0.58)), fv = xv, fwv = glatt(xv), nick = 14 * Math.sin(xv * Math.PI) * RAD;
          fuss = { l: mv(V(0.12, FY, 0.5), V(0.12, FY, -0.28), fwv).add(V(0, Math.sin(fv * Math.PI) * 0.15, 0)), r: V(-0.12, FY, -0.3) };
          fussRicht = { l: V(0.1, Math.sin(nick), Math.cos(nick)), r: undefined };
          becken = mv(V(0, 0.55, 0.1), V(0, 0.975, -0.28), glatt(t));
          zehen = { l: 0, r: mix(45, 0, fv) };
        } else {
          // Gehend (Weg in der Welt, vorderer Fuß bei 0). Hoch (t 0 → 1): Der vordere Fuß bleibt stehen, das Becken schiebt sich über ihn, der hintere zieht durch bis neben ihn. Runter (t 1 → 0): Er setzt zum nächsten Schritt an
          // und landet 80 cm weiter vorn, der andere bleibt stehen und geht auf die Zehen. Die Seiten wechseln bei jedem Schritt. Alles läuft mit dem Becken im Ort, die Streifen am Boden gehen gegenläufig mit
          const runter = !!(zst && zst.runter);
          if (zst) { if (zst.warRunter && !runter) zst.seiteR = !zst.seiteR; zst.warRunter = runter; }
          const a = zst && zst.seiteR ? 'r' : 'l', b = a === 'l' ? 'r' : 'l', xa = a === 'l' ? 0.12 : -0.12, oben = beckenGestreckt(FY, 0.025, 0.02);
          let P, Y, za, ga, zb, yb, gb;
          if (!runter) {
            const s = beinWeg(t, 107, 4), q = glatt((t - 0.15) / 0.8);
            P = mix(-0.4, -0.02, glatt(t)); Y = mix(0.55, oben, s); za = 0; ga = 0;
            gb = mix(45, 8, q); zb = mix(-0.76, 0, q); yb = Math.max(zehenHoehe(gb), FY + 0.03) + Math.sin(q * Math.PI) * 0.1;
            neigung = mix(9, 3, s);
          } else {
            const v = 1 - t, q = glatt((v - 0.03) / 0.67), g0 = glatt((v - 0.3) / 0.7);
            P = mix(-0.02, 0.4, glatt(v / 0.95)); Y = mix(oben, 0.55, glatt((v - 0.35) / 0.65));
            ga = 45 * g0; za = 0.1416 * (1 - Math.cos(ga * RAD));   // der stehende Fuß rollt über den Ballen, der Ballen bleibt auf dem Boden
            gb = mix(8, -12, glatt(q / 0.7)) + 12 * glatt((v - 0.68) / 0.17); zb = 0.8 * q; yb = FY + 0.03 * (1 - q) + Math.sin(q * Math.PI) * 0.1 + 0.06 * Math.sin(Math.max(0, -gb) * RAD);
            neigung = mix(3, 9, glatt(v));
          }
          fuss = {}; zehen = {};
          fuss[a] = V(xa, zehenHoehe(ga), za - P); fuss[b] = V(-xa, yb, zb - P); zehen[a] = ga; zehen[b] = gb;
          becken = V(xa * 0.08, Y, 0);
          reisen = P;
        }
        neigung = gehen ? neigung : mix(9, 3, t);
      } else {
        // Bulgarisch: Fußrücken liegt auf der Bank, Zehen zeigen nach hinten, der Fuß bleibt dort liegen. Bis 5.11. zeigten die Zehen nach vorn oben: nur die Schuhspitze berührte die Kante
        const hinten = art === 'bulgarisch' ? V(-0.09, 0.525, BANK_VORN - 0.045) : V(-0.12, FY, last === 'multipresse' ? -0.42 : -0.48);   // Multipresse: vor der hinteren Querstrebe des Gestells
        const s = art === 'bulgarisch' ? beinWeg(t, 109, 6) : t;
        // unten: hinteres Knie knapp über dem Boden. Bulgarisch: Schienbein unten fast senkrecht (bis 5.11. 5° nach hinten, das Becken zu weit hinter dem vorderen Fuß)
        becken = art === 'bulgarisch' ? mv(V(0, 0.455, -0.06), V(0, 0.86, -0.02), s) : mv(V(0, 0.535, -0.1), V(0, 0.9, -0.08), s);   // Bulgarisch: Bank 6 cm näher, hinteres Knie unten rund 5,5 cm über dem Boden, das hintere Bein nicht mehr überstreckt (bis 5.11. 8 cm, Hüfte -38°)
        fuss = { l: V(0.12, FY, 0.38), r: hinten };   // Bulgarisch: Stand 2,0× statt 2,36× (hintere Hüfte unten bis 5.11. -29°)
        zehen = { l: 0, r: art === 'bulgarisch' ? 0 : 45 };
        if (art === 'bulgarisch') fussRicht = { l: undefined, r: V(0, -0.22, -1) };
        neigung = mix(art === 'bulgarisch' ? 19 : 6, 3, s);   // Bulgarisch unten 19° statt 14°: die hintere Hüfte ist unten höchstens 25° gestreckt (bis 6.11. -29°); sonst Rumpf wie zuvor
      }
      const r = { neigung };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {}, knick = {};
      const stange = last === 'langhantel' || last === 'multipresse';
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (stange) { const a = stangeHinten(k, s, sg, 0.39); hand[s] = a.hand; epol[s] = a.pol; flaeche[s] = a.flaeche; knick[s] = a.knick; }
        else if (last === 'kurzhanteln') { hand[s] = k.schulter[s].clone().add(V(sg * 0.07, -ARM * 0.9995, 0)); epol[s] = V(sg * 0.3, 0, -1); }
        else if (o.kosaken) { hand[s] = k.brust.clone().add(k.R.vor.clone().multiplyScalar(0.3)).sub(k.R.oben.clone().multiplyScalar(0.16)).add(k.R.links.clone().multiplyScalar(sg * 0.04)); epol[s] = V(sg, -0.6, -0.3); }
        else { hand[s] = becken.clone().add(V(sg * 0.17, 0.02, 0.06)); epol[s] = V(sg, -0.2, -0.6); }
      }
      return {
        pose: { becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: stange ? flaeche : undefined, handKnick: stange ? knick : undefined, fuss, zehen, fussRicht, fussFlaeche: art === 'stepup' || art === 'stepup_seitlich' || o.defizit ? { l: V(0, 1, 0) } : undefined,
          kniePol: seiten((s, sg) => (s === 'r' && kpolR ? kpolR : s === 'l' && kpolL ? kpolL : gehen ? (() => { const w = glatt((becken.z - 0.05 - fuss[s].z) / 0.25); return V(sg * 0.1, -w, mix(1, 0.3, w)); })() : s === 'r' && art !== 'seitlich' && art !== 'stepup' && art !== 'stepup_seitlich' ? V(-0.1, -1, 0.3) : V(sg * 0.1, 0, 1))) },   // hinteres Knie zeigt zum Boden
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
          if (z.streifen && reisen != null) z.streifen.position.z = -(((reisen % 0.4) + 0.4) % 0.4);
        }
      };
    },
    blick: V(0, 0.7, 0), abstand: gehen ? 4.2 : 3.6, kameraRicht: art === 'seitlich' ? V(0.3, 0.3, 1) : V(1, 0.3, 0.35), dauer: gehen ? [1, 0.1, 1.2, 0.25] : undefined
  };
}

// Fuß in der Luft locker: Richtung Ferse → Zehe, wenn das Sprunggelenk grad steht (0 = rechter Winkel zum Schienbein, negativ = gestreckt). h = Hüftgelenk, z = Knöchel
function fussLocker(h, z, pol, grad) {
  const b = ik(h, z, MASS.oberschenkel, MASS.unterschenkel, pol), sc = z.clone().sub(b.mitte).normalize(), vorn = b.mitte.clone().sub(h).normalize();
  vorn.addScaledVector(sc, -vorn.dot(sc)); if (vorn.lengthSq() < 1e-6) vorn.copy(pol).addScaledVector(sc, -pol.dot(sc));
  const w = (90 + grad) * RAD;
  return sc.multiplyScalar(Math.cos(w)).addScaledVector(vorn.normalize(), Math.sin(w));
}
const HT_P = V(0, 0.32, 1.06);   // Hip-Thrust-Maschine: Drehpunkt der Hebel vorn
// Band am Boden, Ablauf davor (bis 5.11. hing es beim Hinlaufen in Übungslage in der Luft, die Figur ging hinein): Das Band liegt flach da, wo die Füße hinkommen, und seine Enden daneben.
// Die Figur stellt sich darauf, geht in die Hocke, greift die Enden und steht auf. art: 'zwischen' (Griff zwischen den Füßen, das Seil kommt von hinten: Pull-Through), 'stange' (Griffstange liegt vor den Füßen, das Kabel kommt zwischen ihnen durch)
// schlinge (Kniebeuge mit Band) und enden (Schulterdrücken mit Band, 5.11.): Das Band liegt als ein durchgehendes Stück am Boden (schlinge: geschlossen, die Enden greift die Figur und legt sie über den Kopf
// hinter den Nacken; enden: ein Streifen unter beiden Füßen, die Enden zeigen nach vorn). Die Figur kommt von hinten, steigt mit beiden Füßen darauf, geht in die Hocke, greift und steht mit dem Band auf (bis 5.11.
// zwei getrennte Stücke am Boden, der Strang im Nacken erschien beim Aufstehen aus dem Nichts)
function bandVomBoden({ Gp, gg, stehen }, art = '') {
  const zwischen = art === 'zwischen', stange = art === 'stange', schlinge = art === 'schlinge', enden = art === 'enden';
  const blick = V(gg.R.vor.x, 0, gg.R.vor.z).normalize(), w = Math.atan2(blick.x, blick.z), q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), w);
  const fm = gg.knoechel.l.clone().add(gg.knoechel.r).multiplyScalar(0.5).setY(0), welt = (x, y, zz) => V(x, y, zz).applyQuaternion(q).add(fm);
  const stand = fm.clone().addScaledVector(blick, -0.03);
  const hocke = stehen(stand, w, { neigung: 66 });
  hocke.becken = welt(0, zwischen ? 0.44 : 0.46, zwischen ? -0.2 : stange ? -0.04 : -0.12);
  hocke.fuss = seiten((s) => Gp.fuss[s].clone()); hocke.fussRicht = seiten((s) => Gp.fussRicht[s].clone());
  hocke.kniePol = seiten((s, sg) => V(sg * (stange ? 0.1 : 0.35), 0, 1).applyQuaternion(q));
  hocke.hand = seiten((s, sg) => (zwischen ? welt(sg * 0.05, 0.04, 0.03) : stange ? welt(sg * Math.abs(Gp.hand[s].x), 0.05, 0.5) : welt(sg * 0.3, 0.05, 0.22)));
  hocke.handflaeche = seiten((s, sg) => V(-sg, 0, 0).applyQuaternion(q));
  hocke.ellbogenPol = seiten((s, sg) => V(sg, 0, zwischen ? 0.2 : -0.5).applyQuaternion(q));
  if (schlinge || enden) {
    const hoehe = beckenGestreckt(FY, Math.abs(Gp.fuss.l.x) - MASS.hueftBreite, 0.03), kPol = seiten((s, sg) => V(sg * 0.35, 0, 1).applyQuaternion(q));
    const auf = stehen(stand, w); auf.becken = welt(0, hoehe, 0); auf.fuss = hocke.fuss; auf.fussRicht = hocke.fussRicht;   // aufrecht, die Füße schon auf dem Band
    const schritte = [{ ziel: auf, d: 0.75, steigen: { bogen: 0.06, erst: 'l' } }, { ziel: hocke, d: 0.85, verzug: 0.2 }];
    if (schlinge) {
      // Aufstehen, die Hände vor dem Bauch am Band; dann hoch über den Kopf nach hinten und mit dem Band auf den Nacken; zuletzt hinunter in die Tiefe der Übung
      const hoch = stehen(stand, w, { neigung: 4 });
      Object.assign(hoch, { becken: welt(0, hoehe, 0), fuss: hocke.fuss, fussRicht: hocke.fussRicht, kniePol: kPol });
      const sch = gelenke(hoch).schulter;
      hoch.hand = seiten((s, sg) => sch[s].clone().add(V(sg * 0.09, -0.55, 0.28).applyQuaternion(q)));
      hoch.ellbogenPol = seiten((s, sg) => V(sg, -0.3, -0.7).applyQuaternion(q));
      const kopf = Object.assign({}, hoch, { hand: seiten((s, sg) => sch[s].clone().add(V(sg * 0.25, 0.56, -0.12).applyQuaternion(q))), ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3).applyQuaternion(q)) });
      schritte.push({ ziel: hoch, d: 0.75, aussen: 0.08 }, { ziel: kopf, d: 0.85 }, { ziel: Gp, d: 0.95 });   // aussen: die Stränge laufen beim Aufstehen außen an Oberschenkel und Knie vorbei
    } else schritte.push({ ziel: Gp, d: 1.4, verzug: 0.1 });   // Hände mit dem Band zu den Schultern: nicht in 0,6 s, sondern in einem ruhigen Zug
    return { name: schlinge ? 'bandschlinge' : 'bandenden', blick, stand: stand.clone().addScaledVector(blick, -0.25), griffNach: 2, ruhe: hocke, schritte };
  }
  if (zwischen) {   // über das Seil stellen: davor anhalten und umdrehen, dann rückwärts darüber (beim Drehen auf der Stelle streiften die Schienbeine das Seil)
    const breit = stehen(stand, w); breit.fuss = hocke.fuss; breit.fussRicht = hocke.fussRicht;
    return { name: 'bandboden', blick, stand: stand.clone().addScaledVector(blick, 0.36), griffNach: 2, ruhe: hocke, schritte: [{ ziel: breit, d: 0.8, steigen: { bogen: 0.05, erst: 'l' } }, { ziel: hocke, d: 0.9, verzug: 0.2 }, { ziel: Gp, d: 1 }] };
  }
  return { name: 'bandboden', blick, stand, griffNach: 1, ruhe: hocke, schritte: [{ ziel: hocke, d: 0.9, verzug: 0.2 }, { ziel: Gp, d: 1, aussen: 0.05 }] };
}
// Hip Thrust, Ablauf davor (bis 5.11. ging der Rumpf beim Hinsetzen durch die Stange). Langhantel wie im Studio: mit dem Rücken zur Bank hinsetzen, die Beine lang unter die Stange
// schieben, die mit den Scheiben am Boden über den Schienbeinen liegt, vorbeugen, greifen, über die Beine bis in die Hüftfalte rollen, Füße heran, Hüfte hoch.
// Multipresse: Die Stange hängt im Haken über dem Schoß, die Figur setzt sich davor, rutscht darunter, greift hinauf, die Stange kommt mit der Hüfte zusammen
function hipThrustAblauf({ Gp, stehen, haendeAufBeinen }, smith) {
  const sitzt = (by, bz, neigung, fz, fx = 0.14) => {
    const p = stehen(V(0, 0, bz), 0, { neigung });
    p.becken = V(0, by, bz);
    p.fuss = seiten((s, sg) => V(sg * fx, FY, fz));
    p.kniePol = seiten((s, sg) => V(sg * 0.2, 1, 0.3));
    return p;
  };
  const anStange = (p, y, zz, pol) => { p.hand = seiten((s, sg) => V(sg * 0.32, y, zz)); p.handflaeche = seiten(() => V(0, -1, 0)); p.ellbogenPol = seiten((s, sg) => V(sg * pol[0], pol[1], pol[2])); return p; };
  const hocke = haendeAufBeinen(sitzt(0.52, -0.07, 28, 0.04, 0.13));
  hocke.kniePol = seiten((s, sg) => V(sg * 0.25, 0, 1));
  const sitz = haendeAufBeinen(sitzt(0.13, -0.03, -8, 0.4));
  if (smith) {
    // Zwischen Bank und Stange ist von der Seite kein Durchkommen (Scheiben, Pfosten): von hinten auf die Bank setzen, die Beine über die Bank nach vorn schwingen, vor der Kante hinunterrutschen
    const hinten = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI), mitte = V(0, 0, -0.4), B = V(0, 0.56, -0.4);
    const nachHinten = (p, fz, fy) => {   // Blick zur Rückseite der Bank; fz: Füße so weit vor dem Becken, fy: so hoch
      p.fuss = seiten((s, sg) => V(sg * 0.14, fy, fz).applyQuaternion(hinten).add(mitte)); p.kniePol = seiten((s, sg) => V(sg * 0.2, 1, 0.6).applyQuaternion(hinten));
      p.rumpf = { basis: hinten.clone().multiply(p.rumpf.basis) };
      for (const k of ['ellbogenPol', 'fussRicht', 'handflaeche']) p[k] = seiten((s) => p[k][s].clone().applyQuaternion(hinten));
      return haendeAufBeinen(p);
    };
    const aufBank = nachHinten(sitzt(0.58, -0.4, 2, 0), 0.44, FY);
    const angezogen = nachHinten(sitzt(0.58, -0.4, -16, 0), 0.34, 0.58);   // Beine anziehen, über die Bank schwingen, vorn wieder absetzen
    const vornOben = haendeAufBeinen(Object.assign(sitzt(0.58, -0.4, -16, -0.06), { fuss: seiten((s, sg) => V(sg * 0.14, 0.58, -0.06)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 0.6)) }));
    const vornAuf = haendeAufBeinen(Object.assign(sitzt(0.58, -0.4, 2, 0.08), { kniePol: seiten((s, sg) => V(sg * 0.2, 1, 0.6)) }));
    const kante = haendeAufBeinen(sitzt(0.56, -0.2, 8, 0.36));
    const rutscht = haendeAufBeinen(sitzt(0.14, 0.1, -32, 0.62, 0.2));
    const greift = anStange(sitzt(0.15, 0.12, -34, 0.62, 0.2), Gp.hand.l.y + 0.18, Gp.hand.l.z, [0.5, -1, 0]);   // Haken 18 cm über der Startlage der Stange (bis 5.11. 33 cm: Stange knapp 0,6 m hoch, im Studio hängt sie in den untersten Haken)
    return { name: 'hipthrust_smith', blick: V(0, 0, -1), stand: V(0, 0, -0.75), von: V(-1.5, 0, -0.75), griffNach: 7, ruhe: greift,
      schritte: [{ ziel: aufBank, d: 0.9 }, { ziel: angezogen, d: 0.45 }, { ziel: vornOben, d: 0.8, dreh: { m: B, w: -Math.PI } }, { ziel: vornAuf, d: 0.45 }, { ziel: kante, d: 0.5 }, { ziel: rutscht, d: 0.7 }, { ziel: greift, d: 0.8, verzug: 0.2 }, { ziel: Gp, d: 1 }] };
  }
  const lang = haendeAufBeinen(sitzt(0.13, -0.03, -8, 0.85));
  const greift = anStange(sitzt(0.13, -0.03, 38, 0.85), 0.225, 0.7, [1, 0.2, -0.2]);
  const rollt = anStange(sitzt(0.13, -0.03, 12, 0.85), 0.225, 0.4, [1, -0.2, -0.4]);
  const inFalte = anStange(sitzt(0.13, -0.03, -18, 0.85), 0.23, 0.09, [0.9, -0.5, 0.2]);
  const hebt = anStange(sitzt(0.13, -0.02, -22, 0.85), 0.3, 0.09, [1, -0.4, 0.3]);
  const fuesse = anStange(sitzt(0.15, 0.06, -33, Gp.fuss.l.z, Math.abs(Gp.fuss.l.x)), 0.15 + 0.215, 0.09, [1, -0.4, 0.3]);
  for (const k of [lang, greift, rollt, inFalte, hebt]) k.fussRicht = seiten((s, sg) => V(sg * 0.2, 0.3, 1));   // Beine lang: Fersen am Boden, Zehen flach genug unter der Stange durch
  return { name: 'hipthrust', blick: V(0, 0, 1), stand: V(0, 0, 0.02), griffNach: 4, ruhe: greift,
    schritte: [{ ziel: hocke, d: 0.6 }, { ziel: sitz, d: 0.6 }, { ziel: lang, d: 0.6 }, { ziel: greift, d: 0.8, verzug: 0.2 }, { ziel: rollt, d: 0.6 }, { ziel: inFalte, d: 0.6 }, { ziel: hebt, d: 0.3 }, { ziel: fuesse, d: 0.6 }, { ziel: Gp, d: 0.7 }] };
}
// Hüftheben: art: hipthrust | bridge | einbeinig | einbeinig_bank ; last: langhantel | keine | maschine | multipresse
// Neu: frog (Fußsohlen zusammen, Knie außen) | marsch (Becken oben, Knie abwechselnd heben) | beckenkippen (nur das Becken kippt, Po bleibt liegen)
// Ablauf davor (wirkt über animation()): standVersatz, schrittExtra
export function hueftheben(o = {}) {
  const art = o.art || 'hipthrust', last = o.last || (art === 'hipthrust' ? 'langhantel' : 'keine');
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'hipthrust') ger.querbank(-0.4, 0.43);
      else if (art === 'einbeinig_bank') { ger.querbank(-0.4, 0.43); ger.box(1.75, 0.07, 0.3, V(0, 0.43, -0.4), ger.mPolster); }   // lang wie ein Sofa: die Arme liegen darauf
      else ger.matte();
      if (last === 'langhantel' || last === 'multipresse') {
        z.lh = ger.langhantel();
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.36, 20), ger.mPolster); pad.rotation.z = Math.PI / 2; pad.castShadow = true; z.lh.add(pad);   // Polster auf der Hüftfalte
      }
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'maschine') hipthrustMaschineBauen(ger, z, HT_P, V(0, 0.3 + 0.235, 0.26));   // Hüftpolster an zwei Hebeln, Drehpunkt vorn am Boden
      return z;
    },
    pose(t) {
      if (art === 'beckenkippen') {
        // Nur das Becken kippt, der untere Rücken kommt flach zum Boden, der Po bleibt liegen
        // Der Rumpf der Figur hat keine Lendenlordose: das Einrollen hebt das Becken darum um den Bogen der Wirbelsäule. Der Brustkorb gibt etwas nach (Schultern sinken in die Matte, Rippen kommen 3° Richtung Schambein), so hebt der Po höchstens 2 cm (bis 5.11. 5,4 cm)
        const r = { basis: LIEGEND, neigung: mix(0, -10, t) }, w = { beuge: mix(0, 13, t) }, becken = beckenUnter(V(0, mix(0.12, 0.098, t), 0.18 - MASS.rumpf + 0.03), r, w), k = rumpf(becken, r, w);
        return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: 5 }, hand: seiten((s, sg) => k.schulter[s].clone().setY(0.05).add(V(sg * 0.12, 0, 0.545))), flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)), fuss: { l: V(0.14, FY, 0.77), r: V(-0.14, FY, 0.77) }, kniePol: { l: V(0.1, 1, 0.3), r: V(-0.1, 1, 0.3) } } };
      }
      const bank = art === 'hipthrust' || art === 'einbeinig_bank';
      // Schulterblätter liegen auf der Bank bzw. dem Boden, Füße stehen; das Becken hebt sich
      const schulterPunkt = bank ? V(0, 0.6, -0.32) : V(0, 0.14, -0.25);   // Bank: Rücken (gut 11 cm hinter dem Schultergelenk) liegt auf der Bankkante
      const marsch = art === 'marsch', frog = art === 'frog';
      const beckenY = marsch ? 0.35 : frog ? mix(0.12, 0.25, t) : mix(bank ? 0.3 : 0.12, bank ? 0.545 : 0.35, t);   // oben Hüfte gestreckt, nicht überstreckt
      // Am Boden bleiben die Schultern liegen, das Becken hebt sich auf einem Bogen um sie (bis 5.11. rutschten Schultern und Hände beim Heben 5 cm über die Matte)
      const beckenZ = bank ? 0.18 : schulterPunkt.z + Math.sqrt((MASS.rumpf - 0.03) ** 2 - (beckenY - schulterPunkt.y) ** 2);
      const becken = V(0, beckenY, beckenZ);
      // Rumpf zeigt von Becken zur Schulter
      const d = schulterPunkt.clone().sub(becken).normalize();
      const winkel = Math.atan2(d.y, -d.z) / RAD;        // 0 = waagerecht
      const r = { neigung: 0, basis: quer(-90 + winkel) };
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'maschine') {   // Hände an den Griffen neben dem Hüftpolster (Griffe laufen auf dem Bogen der Hebel)
          const pol = becken.clone().add(V(0, 0.235, 0.08)), w = hebelWinkel(HT_P, pol), L = V(0, 0.3 + 0.235, 0.26).distanceTo(HT_P);
          hand[s] = genau(HT_P.clone().add(V(sg * 0.36, -0.095, -L).applyAxisAngle(V(1, 0, 0), w))); epol[s] = V(sg * 0.7, -1, 1.1);
        } else if (last === 'langhantel' || last === 'multipresse') { hand[s] = genau(becken.clone().add(V(sg * 0.32, 0.165, 0.03))); epol[s] = V(sg * 0.7, -1, 1.1); }   // Hände auf der Stange (bis 1.11. 3 cm darunter); die Ellbogen hängen seitlich neben dem Rumpf (bis 5.11. standen sie breit ab, Schulter 103° innen gedreht)
        else if (bank) { hand[s] = V(sg * 0.7525, 0.51, -0.31); epol[s] = V(0, -0.1, -1); }   // Arme ausgebreitet auf der Bank, Ellbogen liegt auf (bis 5.11. schwebten die Ellbogen, die Hände stützten hinter der Schulter: W-Form, Schulter 148° gedreht)
        else { hand[s] = V(sg * (MASS.schulterBreite + 0.12), 0.05, schulterPunkt.z + Math.sqrt(0.556 ** 2 - 0.12 ** 2 - (schulterPunkt.y - 0.05) ** 2)); epol[s] = V(sg, 1, 0); }   // am Boden: Arme lang neben dem Körper, Handflächen auf der Matte (bis 5.11. knickten sie 70° nach außen)
      }
      const einbeinig = art === 'einbeinig' || art === 'einbeinig_bank';
      const fz = bank ? 0.62 : 0.685;   // oben Schienbein senkrecht, Knie etwa 90°
      const fx = art === 'hipthrust' ? 0.2 : 0.14;   // Hip Thrust: Füße fast schulterbreit (bis 5.11. 0,63×)
      let fuss = { l: V(fx, FY, fz), r: einbeinig ? becken.clone().add(V(-0.14, 0.15, 0.75)) : V(-fx, FY, fz) };
      let kpol = { l: V(art === 'hipthrust' ? 0.2 : 0.1, 1, 0.3), r: V(art === 'hipthrust' ? -0.2 : -0.1, 1, 0.3) }, fussRicht;
      if (einbeinig) fussRicht = { l: undefined, r: fussLocker(becken.clone().add(k.R.links.clone().multiplyScalar(-MASS.hueftBreite)).addScaledVector(k.R.oben, -0.02), fuss.r, kpol.r, art === 'einbeinig' ? -20 : -30) };   // freier Fuß locker (bis 5.11. −66°)
      if (frog) {   // Fußsohlen aneinander nah am Becken, Knie fallen nach außen
        fuss = { l: V(0.05, 0.1, 0.5), r: V(-0.05, 0.1, 0.5) };
        kpol = { l: V(0.55, 0.5, 0.3), r: V(-0.55, 0.5, 0.3) }; fussRicht = { l: V(-0.1, 0.3, 0.9), r: V(0.1, 0.3, 0.9) };
      }
      if (marsch) {
        // Ein Knie nach dem anderen Richtung Brust, Becken bleibt oben: Der Oberschenkel geht bis fast senkrecht, das Knie bleibt um 90° (Winkel laufen, nicht der Fuß auf gerader Linie: bis 5.11. klappte das Knie auf 151° zusammen)
        const w = Math.sin(t * Math.PI * 2), heb = { l: w > 0 ? w * w : 0, r: w < 0 ? w * w : 0 };
        fussRicht = {};
        fuss = seiten((s, sg) => {
          const H = becken.clone().add(k.R.links.clone().multiplyScalar(sg * MASS.hueftBreite)).addScaledVector(k.R.oben, -0.02), A0 = V(sg * 0.14, FY, 0.62), b0 = ik(H, A0, MASS.oberschenkel, MASS.unterschenkel, kpol[s]);
          const dreh = (v) => Math.atan2(v.y, v.z) / RAD, ph0 = dreh(b0.mitte.clone().sub(H)), ps0 = dreh(A0.clone().sub(b0.mitte));
          const ph = mix(ph0, 90, heb[s]), ps = mix(ps0, 0, heb[s]), richt = (a) => V(0, Math.sin(a * RAD), Math.cos(a * RAD));
          fussRicht[s] = richt(mix(0, ps - 25 + 90, heb[s])).add(V(sg * 0.1, 0, 0));   // am Boden flach, in der Luft locker
          return heb[s] ? H.clone().addScaledVector(richt(ph), MASS.oberschenkel).addScaledVector(richt(ps), MASS.unterschenkel).setX(sg * 0.14) : A0;
        });
      }
      return {
        pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand, handflaeche: last === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, flach: last === 'keine' && bank ? seiten(() => V(0, 1, 0)) : undefined, ellbogenPol: epol, fuss, fussRicht, kniePol: kpol },
        props(g, z) {
          // Die Stange liegt in den Händen (dieselbe Lage wie Becken + 16,5 cm; im Ablauf rollen die Hände sie über die Beine), die Scheiben stehen höchstens auf dem Boden
          if (z.lh) { const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5); z.lh.position.set(0, m.y < 0.25 ? 0.225 : m.y < 0.3 ? mix(0.225, 0.3, (m.y - 0.25) / 0.05) : m.y, z.smithLinie ? z.smithLinie.z : m.z); z.lh.quaternion.identity(); schienenAn(z); }
          if (z.ht) z.ht.hebel.rotation.x = hebelWinkel(HT_P, g.becken.clone().add(V(0, 0.235, 0.08)));
        }
      };
    },
    blick: V(0, 0.4, 0.1), abstand: 3.2, kameraRicht: art === 'frog' ? V(0.5, 0.6, 1) : V(1, 0.45, 0.25), dauer: art === 'marsch' ? [2.4, 0, 2.4, 0] : undefined,
    ablaufUnten: art === 'hipthrust' && (last === 'langhantel' || last === 'multipresse'),
    ablaufEigen: art === 'hipthrust' && (last === 'langhantel' || last === 'multipresse') ? (h) => hipThrustAblauf(h, last === 'multipresse') : undefined
  };
}

// Wadenheben: art: stehend | sitzend | einbeinig | stufe | beinpresse | maschine (Schulterpolster) ; last: kurzhanteln
// Neu: esel (Hüfte gebeugt, Polster auf dem Becken) ; last multipresse (Stange auf dem Rücken) ; sitzend + last kurzhantel (Hanteln auf den Knien, Bank)
// einbeinstand (ruhig auf einem Bein stehen, keine Stufe, Hand auf der Stuhllehne: eigene Bewegung, 5.11.)
// Ablauf davor (wirkt über animation()): standVersatz, schrittExtra, einstiegVorgebeugt
export function wadenheben(o = {}) {
  const art = o.art || 'stehend';
  const sitzend = art === 'sitzend', khKnie = sitzend && o.last === 'kurzhantel', smith = o.last === 'multipresse';
  // Sitzend an der Maschine: Kniepolster liegt auf den Oberschenkeln kurz vor den Knien (Knie aus Hüfte und Knöchel gerechnet). Der Fußballen steht auf einem Block, die Ferse sinkt darunter (bis 5.11. auf der Matte am Boden: keine Dehnung)
  const WS_STUFE = 0.1, WS_BECKEN = V(0, 0.55 + WS_STUFE, -0.12), WS_RUMPF = { neigung: 5 }, WS_P = V(0, 0.3 + WS_STUFE, 0.86);
  // Wie hoch der Knöchel über der Fläche steht, wenn der Fußballen auf ihr liegen bleibt (bis 2.11. nur der erste Teil: oben schwebte der Ballen 1,5 cm, unten sank die Sohle ein)
  const hebt = (h) => Math.sin(h * RAD) * MASS.fussLaenge * BALLEN + FY * (Math.cos(h * RAD) - 1);
  // So weit rückt der Knöchel nach vorn, wenn die Ferse kippt und der Ballen stehen bleibt
  const rollt = (h) => MASS.fussLaenge * BALLEN * (1 - Math.cos(h * RAD));
  const WS_Z = khKnie ? 0.36 : 0.285;   // Maschine: Knöchel so weit hinten, dass das Knie unten nicht aufgeht
  const wsHubW = (t) => (khKnie ? mix(-29, 35, t) : mix(-20, 45, t));
  const wsHub = (t) => hebt(wsHubW(t));
  const wsKnie = (t) => { const R = rumpfRahmen(WS_RUMPF), h = WS_BECKEN.clone().add(R.links.clone().multiplyScalar(MASS.hueftBreite)).sub(R.oben.clone().multiplyScalar(0.02)); return ik(h, V(0.13, FY + WS_STUFE + wsHub(t), WS_Z + rollt(wsHubW(t))), MASS.oberschenkel, MASS.unterschenkel, V(0, 1, 1)).mitte; };
  const wsPolster = (t) => { const kn = wsKnie(t); return V(0, kn.y + 0.145, kn.z - 0.06); };
  // Esel: Hüftpolster auf dem Becken an einem Hebel (Drehpunkt hinten oben)
  const ES_P = V(0, 1.3, -0.6), esPolster = (anheben) => V(0, 0.975 + 0.12 + anheben + 0.15, -0.04);
  // Einbeinig: Stange neben der Figur, Griff etwa in Brusthöhe. Die linke Hand hält dort fest und zieht nicht (bis 5.11. schwebten die Hände, ohne Halt wäre das auf der Stufenkante kaum zu stehen).
  // Stehend: Hand leicht an der Wand, Einbeinstand: Hand auf der Stuhllehne
  const HALT = V(0.72, 1.41, 0.44), WAND_X = 0.73, LEHNE = V(-0.335, STUHL_LEHNE + 0.03, 0.17);
  const anWand = art === 'stehend' && !o.last;
  return {
    aufbau(ger) {
      const z = {};
      if (sitzend && !khKnie) wadensitzBauen(ger, z, WS_BECKEN, WS_P, wsPolster(0), WS_STUFE);
      else if (sitzend) ger.box(0.45, 0.45, 0.4, V(0, 0.225, -0.1), ger.mPolster);
      // nur unter den Fußballen, Ferse und Mittelfuß sinken frei (bis 31.10. lag die Kante unter dem Fußgewölbe: 4 cm darin)
      if (khKnie) { ger.box(0.5, 0.08, 0.2, V(0, 0.04, 0.595), ger.mRahmen); khAufbauen(ger, z); z.tuch = ger.box(0.3, 0.02, 0.1, V(0, 0.7, 0.25), ger.mBand); }   // zusammengelegtes Handtuch zwischen Hantel und Knien (Text)
      if (art === 'stufe' || art === 'einbeinig') ger.box(0.6, 0.12, 0.25, V(0, 0.06, 0.265), ger.mRahmen);   // Kante direkt hinter dem Fußballen, Ferse und Mittelfuß frei
      if (art === 'einbeinig') { ger.box(0.05, 2, 0.05, V(HALT.x, 1, HALT.z), ger.mRahmen); ger.box(0.3, 0.02, 0.3, V(HALT.x, 0.01, HALT.z), ger.mRahmen); }
      if (anWand) ger.box(0.06, 1.9, 1, V(WAND_X + 0.03, 0.95, 0), ger.mRahmen);
      if (art === 'einbeinstand') stuhlBauen(ger, -0.45, 0.15);
      if (smith) { z.lh = ger.langhantel(); schienenAufbauen(ger, z); }
      if (art === 'esel') eselBauen(ger, z, ES_P, esPolster(0));
      if (art === 'maschine') wadenmaschineBauen(ger, z, rumpf(V(0, 0.985 + 0.12, 0.02), { neigung: 2 }));
      if (art === 'beinpresse') {
        Object.assign(z, beinmaschine({ art: 'beinpresse' }).aufbau(ger));
      }
      if (o.last === 'kurzhanteln') khAufbauen(ger, z, art !== 'einbeinig');
      return z;
    },
    pose(t) {
      if (art === 'einbeinstand') {
        // Ruhig auf dem linken Bein, Becken waagerecht, Blick nach vorn; der rechte Fuß knapp über dem Boden, die rechte Hand liegt auf der Lehne. Keine Stufe, keine Ferse auf und ab (bis 5.11. einbeiniges Wadenheben)
        const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI), becken = V(0.07, 0.974 + 0.002 * atmen, 0.02), r = { neigung: 1 }, k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: 0 }, hand: { r: LEHNE.clone(), l: k.schulter.l.clone().add(V(0.03, -ARM * 0.995, 0.03)) }, flach: { r: V(0, 1, 0) }, ellbogenPol: { r: V(-0.4, -1, -0.4), l: V(0.3, 0, -1) },
          fuss: { l: V(0.11, FY, 0.02), r: V(-0.1, 0.113, -0.14) }, zehen: { l: 0, r: 8 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } };
      }
      if (art === 'beinpresse') {
        // Beine fast gestreckt (Knie ~8° gebeugt), nur die Fußballen an der Unterkante der Platte, Fersen frei: das Sprunggelenk arbeitet
        // und schiebt die Platte. Abstand Knöchel → Platte über den Fußballen: 0,14·sin(Winkel) + 0,07·cos(Winkel)
        const bp = beinmaschine({ art: 'beinpresse' }).pose(0);
        const w = mix(-26, 28, t), D = bpWeg(8);   // unten tief in die Dehnung: Ferse unter der Plattformkante (bis 5.11. nur 15°, Sprunggelenk +6°)
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
      // Einbeinig und an der Multipresse steht der Körper etwas weiter vorn (Schwerpunkt bzw. Stange über dem Vorfuß), das Schienbein neigt sich dadurch: Der Fuß kippt entsprechend weniger, damit das Sprunggelenk bei +18° und -35° bleibt
      const vorn = art === 'einbeinig' || smith;
      const hub = mix(vorn ? -11 : stufe ? -15 : art === 'esel' ? -17 : 0, vorn ? 42 : 38, t);
      const anheben = hebt(hub);
      const fuss = { l: V(0.12, FY + stufe + anheben, 0.0), r: art === 'einbeinig' ? V(-0.12, 0.38 + anheben, -0.1) : V(-0.12, FY + stufe + anheben, 0) };
      const zehen = { l: hub, r: art === 'einbeinig' ? 0 : hub };
      if (sitzend) {
        const becken = khKnie ? V(0, 0.55, -0.12) : WS_BECKEN.clone();
        const r = { neigung: khKnie ? 12 : 5 };
        const k = rumpf(becken, r);
        const sh = khKnie ? 0.08 : WS_STUFE, hubS = wsHubW(t), anhebenS = hebt(hubS), zS = WS_Z + rollt(hubS);
        // Fußballen auf der Kante (Fläche), die Zehen liegen darauf flach, auch wenn die Ferse hoch ist; unten sinkt die Ferse unter die Kante
        return { pose: { becken, rumpf: r, fuss: { l: V(0.13, FY + sh + anhebenS, zS), r: V(-0.13, FY + sh + anhebenS, zS) }, zehen: { l: hubS, r: hubS }, fussFlaeche: seiten(() => V(0, 1, 0)),
          hand: khKnie ? seiten((s, sg) => V(sg * 0.15, 0.7 + anhebenS, 0.25)) : seiten((s, sg) => {
            const pol = wsPolster(t), w = hebelWinkel(WS_P, pol), L = wsPolster(0).distanceTo(WS_P);   // Griff sitzt fest am Hebel
            return genau(WS_P.clone().add(V(sg * 0.33, 0.03, -L).applyAxisAngle(V(1, 0, 0), w)));   // genau: sonst 7,6 cm neben dem Griff (1.11.)
          }),
          handflaeche: khKnie ? undefined : seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -1)), kniePol: seiten((s, sg) => V(0, 1, 1)) },
          props(g, z) {
            if (khKnie) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], V(1, 0, 0));   // in der Faust, liegt auf dem Knie auf
            if (khKnie && z.tuch) z.tuch.position.copy(g.hand.l).add(g.hand.r).multiplyScalar(0.5).add(V(0, -0.02, 0));
            if (z.ws) { z.ws.hebel.rotation.x = hebelWinkel(WS_P, wsPolster(t)); }
          } };
      }
      if (art === 'esel') {
        // Oberkörper waagerecht, Hände an den Griffen, Polster drückt auf das Becken. Nur der Vorfuß steht auf der Kante, die Ferse sinkt unter sie (bis 5.11. lag der ganze Fuß auf dem Block: keine Dehnung)
        const dz = rollt(hub), becken = V(0, 0.975 + 0.12 + anheben, dz);
        const r = { neigung: 84 };
        return { pose: { becken, rumpf: r, kopf: { neigung: -25 }, hand: seiten((s, sg) => V(sg * 0.22, 0.97, 0.84)), ellbogenPol: seiten((s, sg) => V(sg, -0.5, 0)),
            fuss: seiten((s, sg) => V(sg * 0.12, FY + 0.12 + anheben, 0.02 + dz)), zehen: seiten(() => hub), fussFlaeche: seiten(() => V(0, 1, 0)), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
          props(g, z) { z.es.hebel.rotation.x = hebelWinkel(ES_P, esPolster(anheben), 1); } };
      }
      const dz = art === 'einbeinig' ? rollt(hub) : 0;
      if (art === 'einbeinig') { fuss.l.z += dz; fuss.r.z += dz; }
      const becken = V(0, 0.985 + stufe + anheben, (vorn ? 0.09 : 0.02) + dz);   // Knie gestreckt
      const r = { neigung: vorn ? 4 : 2 };
      const k = rumpf(becken, r);
      const hand = seiten((s, sg) => smith ? stangeHinten(k, s, sg, 0.42).hand
        : art === 'maschine' ? k.schulter[s].clone().add(V(sg * 0.1, 0.1, 0.1)) : o.last === 'kurzhanteln' ? k.schulter[s].clone().add(V(sg * 0.06, -ARM * 0.9995, 0))
          : art === 'einbeinig' && s === 'l' ? V(HALT.x, HALT.y, HALT.z) : anWand && s === 'l' ? V(WAND_X - 0.03, k.schulter.l.y - 0.1 - anheben, 0.15)
            : (art === 'einbeinig' || anWand) ? k.schulter[s].clone().add(V(sg * 0.03, -ARM * 0.995, 0.03)) : k.schulter[s].clone().add(V(sg * 0.12, -ARM * 0.9, 0.12)));
      // Auf der Stufe bzw. Plattform: Fußballen auf der Fläche, die Zehen liegen darauf flach, auch oben auf den Zehenspitzen (bis 31.10. zeigten
      // sie dort in die Kante, 2,5–2,8 cm)
      const fussFlaeche = stufe ? { l: V(0, 1, 0), r: art === 'einbeinig' ? null : V(0, 1, 0) } : undefined;
      const fussRicht = art === 'einbeinig' ? { r: fussLocker(becken.clone().add(V(-MASS.hueftBreite, -0.02, 0)), fuss.r, V(0, -1, 0.3), 25) } : undefined;
      const stange = smith ? stangeHinten(k, 'l', 1, 0.42) : null;
      return { pose: { becken, rumpf: r, hand, flach: anWand ? { l: V(-1, 0, 0) } : undefined, handflaeche: art === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0)) : smith ? seiten(() => stange.flaeche) : undefined, handKnick: smith ? seiten(() => stange.knick) : undefined,
        ellbogenPol: art === 'maschine' ? seiten((s, sg) => V(sg, -1, 0)) : smith ? seiten(() => stange.pol) : art === 'einbeinig' ? { l: V(0.3, -1, -0.5), r: V(-0.3, 0, -1) } : anWand ? { l: V(0.3, -1, -0.5), r: V(-0.3, 0, -1) } : undefined, fuss, zehen, fussRicht, fussFlaeche, kniePol: seiten((s, sg) => V(sg * 0.1, s === 'r' && art === 'einbeinig' ? -1 : 0, s === 'r' && art === 'einbeinig' ? 0.3 : 1)) },
        props(g, z) {
          if (o.last === 'kurzhanteln') kurzhantelnAn(z, g, 'hammer');
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.wk) r2_wadenStellen(z, g);   // DK Line: Hebel, Seil und Stapel
        } };
    },
    blick: V(0, 0.55, 0), abstand: 2.9, kameraRicht: anWand ? V(-1, 0.25, 0.5) : V(1, 0.25, 0.5), dauer: art === 'einbeinstand' ? STATISCH : undefined   // an der Wand: Blick von der freien Seite, die Wand steht dahinter (bis 5.11. verdeckte sie die Figur ganz)
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
/* ---------- DK Line (Auftrag D, 09.11.2026): Designsprache, Gewichtsstapel mit Seil, Pilotmaschinen ----------
   Vorbild für Rahmen und Hebel: schwere graphitfarbene Rundrohre, silberne Hebelarme, dicke Lagerböcke mit Goldkappe, schwarze Polster mit Goldnaht;
   Stapel in schwarzer Verkleidung mit Sichtfenster und Typenschild. Eigene Marke "DK" (keine fremden Namen oder Logos). Maße: daten/designsprache.md */
const DK = { holm: 0.095, strebe: 0.065, boden: 0.075, achse: 0.52 };   // Durchmesser Hauptholm, Strebe, Bodenholm; Mitte der Seitenrahmen (x)
const _dkZyl = new Map();
function dkZyl(r, l, seg = 20) { const k = r.toFixed(4) + ',' + l.toFixed(4) + ',' + seg; if (!_dkZyl.has(k)) _dkZyl.set(k, new THREE.CylinderGeometry(r, r, l, seg)); return _dkZyl.get(k); }
// Mehrere Geometrien (nur verschoben, ohne Index) zu einer: spart Meshes (Plattenstapel). teile: [[Geometrie, Verschiebung], …]
function verschmelze(teile) {
  let n = 0; for (const [g] of teile) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const [g, p] of teile) {
    const a = g.attributes.position, b = g.attributes.normal;
    for (let i = 0; i < a.count; i++, o++) { pos.set([a.getX(i) + p.x, a.getY(i) + p.y, a.getZ(i) + p.z], o * 3); nor.set([b.getX(i), b.getY(i), b.getZ(i)], o * 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return geo;
}
// Rundrohr in einer Gruppe (Koordinaten der Gruppe), z. B. am Hebel oder am Stapel
function holmIn(ger, gruppe, A, B, d, m) { const o = ger.holm(A, B, d, m); ger.gruppe.remove(o); gruppe.add(o); return o; }
// Seil um eine Rolle (Mitte W, Radius r) zwischen den Punkten P0 (davor) und P1 (danach): Achse der Rolle und die beiden Berührpunkte
// (ein = Seil läuft von P0 auf die Rolle, aus = Seil läuft zu P1); die Achse steht senkrecht auf der Ebene P0, W, P1
function umlenk(P0, W, P1, r) {
  const a = W.clone().sub(P0).cross(P1.clone().sub(W));
  if (a.lengthSq() < 1e-10) a.set(1, 0, 0);
  a.normalize();
  const tang = (P, davor) => {
    const d = P.clone().sub(W), D = Math.max(d.length(), r * 1.001), ed = d.clone().divideScalar(D), ep = a.clone().cross(ed), c = r / D, s = Math.sqrt(1 - c * c);
    let best = null, bw = -Infinity;
    for (const sg of [1, -1]) {
      const N = W.clone().addScaledVector(ed, r * c).addScaledVector(ep, sg * r * s), t = a.clone().cross(N.clone().sub(W)).divideScalar(r);   // t: Laufrichtung auf der Rolle
      const w = davor ? N.clone().sub(P).dot(t) : P.clone().sub(N).dot(t);
      if (w > bw) { bw = w; best = N; }
    }
    return best;
  };
  return { a, ein: tang(P0, true), aus: tang(P1, false) };
}
// Bodenrahmen: Seitenholme außen (x = ±xs), Querholme hinten (zr) und vorn (zv), Mittelholm von zm bis vorn (trägt Sitz und Säulen), Gummifüße
function dkBoden(ger, xs, zr, zv, zm = zr, zq = zv) {   // zq: vorderer Querholm (bei kurzem Querholm laufen die Seitenholme weiter bis zv)
  for (const x of [-xs, xs]) ger.holm(V(x, 0.05, zr), V(x, 0.05, zv), DK.boden);
  for (const zz of [zr, zq]) ger.holm(V(-xs, 0.05, zz), V(xs, 0.05, zz), DK.boden);
  ger.holm(V(0, 0.05, zm), V(0, 0.05, zq), DK.boden);
  for (const x of [-xs, xs]) for (const zz of [zr, (zr + zv) / 2, zv]) ger.fussDK(V(x, 0, zz));
}
// Sitz auf Rundrohr-Säule mit Rastbolzen (Polsterfläche wie bei sitzSaeule: mitte = Mitte der Sitzfläche, Oberkante)
function sitzSaeuleDK(ger, mitte, w = 0.42, l = 0.42, neigung = 0) {
  ger.polsterGeformt(w, 0.09, l, mitte.clone().sub(V(0, 0.045, 0)), quer(-neigung));
  ger.holm(V(mitte.x, 0.05, mitte.z), V(mitte.x, mitte.y - 0.125, mitte.z), 0.07);   // obere Kappe liegt unter dem Polster an
  maschTeil(ger.gruppe, dkZyl(0.012, 0.07, 10), ger.mMetall, mitte.x + 0.07, mitte.y - 0.25, mitte.z).rotation.z = Math.PI / 2;
  maschTeil(ger.gruppe, new THREE.SphereGeometry(0.022, 14, 10), ger.mDKGold, mitte.x + 0.11, mitte.y - 0.25, mitte.z);
}
// Seitenrahmen (sg = ±1): Pfosten aus Rundrohr mit Lagerbock auf der Hebelachse C, darüber ein dünnerer Mast bis zur Seilrolle (oben m über C), schräge Strebe
// zum Boden (strebe = { y, z } oder null). Kein Querrohr zur anderen Seite: beide Seiten hängen nur über den Bodenrahmen zusammen
function dkSeitenrahmen(ger, sg, C, oben, strebe, xs = DK.achse) {
  const x = sg * xs;
  ger.holm(V(x, 0.05, C.z), V(x, C.y - 0.085, C.z), DK.holm);
  ger.lagerbock(V(x, C.y, C.z), sg);
  ger.holm(V(x, C.y + 0.085, C.z), V(x, C.y + oben, C.z), DK.strebe);
  if (strebe) ger.holm(V(x, strebe.y, C.z), V(x, 0.05, strebe.z), DK.strebe);
}
// Gewichtsstapel DK Line: schwarze Verkleidung mit Sichtfenster und Typenschild, 12 Stahlplatten (6 am Stecker), zwei Chromstangen, goldener Stecker, Zugstab oben
// aus dem Deckel mit beweglicher Rolle (o.mRolle) oder Öse; darüber der Rollenkopf. pos = Fußpunkt, vorn = offene Seite (zum Trainierenden), F = Höhe der Verkleidung.
// Der Stapel hebt sich nur über stapelAnHebel (Seillänge); heben(h) setzt die Höhe (m) direkt
function gewichtsblockDK(ger, pos, vorn, F = 1.55, titel = '', untertitel = '', o = {}) {
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = Math.atan2(vorn.x, vorn.z);
  const t = (geo, m, x, y, zz) => maschTeil(g, geo, m, x, y, zz);
  const N = 12, STIFT = 6, P0 = 0.12, PITCH = 0.047, hMax = o.hMax || 0.3, rm = 0.04, rg = 0.04, yM0 = F + 0.14, yG = yM0 + hMax + 0.18;
  t(rundGeo(0.56, 0.1, 0.46, 0.02, 1), ger.mDK, 0, 0.05, 0);                                                                  // Sockel
  for (const sx of [-1, 1]) t(rundGeo(0.035, F - 0.1, 0.36, 0.01, 1), ger.mVerkleidung, sx * 0.245, (F + 0.1) / 2, 0);        // Seitenwände
  t(rundGeo(0.455, F - 0.1, 0.035, 0.01, 1), ger.mVerkleidung, 0, (F + 0.1) / 2, -0.2);                                       // Rückwand
  const yF = P0 + N * PITCH + 0.1;                                                                                             // Oberkante des Sichtfensters
  t(rundGeo(0.455, F - yF, 0.03, 0.008, 1), ger.mVerkleidung, 0, (F + yF) / 2, 0.175);                                         // Blende über dem Fenster
  t(rundGeo(0.455, 0.014, 0.034, 0.004, 1), ger.mDKGold, 0, yF + 0.007, 0.175);                                                // goldene Leiste
  t(rundGeo(0.012, F - yF - 0.05, 0.004, 0.002, 1), ger.mDKGold, 0.2, (F + yF) / 2, 0.1925);                                   // goldener Streifen
  for (const sz of [-1, 1]) t(rundGeo(0.56, 0.05, 0.2, 0.016, 1), ger.mDK, 0, F + 0.025, sz * 0.13);                                // Deckel in zwei Hälften mit Schlitz für den Zugstab
  for (const sx of [-1, 1]) t(dkZyl(0.011, F - 0.1, 12), ger.mMetall, sx * 0.19, (F + 0.1) / 2, 0);                            // Führungsstangen (außerhalb der Platten)
  const kasten = (w, h, d) => new THREE.BoxGeometry(w, h, d).toNonIndexed(), platten = new THREE.Group(); g.add(platten);
  for (let i = 0; i < N; i++) {                                                                                                 // zwölf Platten 30 × 3,5 × 20 cm mit zwei Führungsohren, einzeln (die oberen sechs steigen)
    const y = P0 + i * PITCH + 0.0175;
    maschTeil(platten, verschmelze([[kasten(0.3, 0.035, 0.2), V(0, y, 0)], [kasten(0.029, 0.035, 0.05), V(0.1645, y, 0)], [kasten(0.029, 0.035, 0.05), V(-0.1645, y, 0)]]), ger.mHebel);
  }
  const bewegt = new THREE.Group(); g.add(bewegt);   // Zubehör, das mit den Platten steigt: Stecker, Zugstab, Rolle
  const yStift = P0 + STIFT * PITCH + 0.0175, yO = P0 + (N - 1) * PITCH + 0.035;
  maschTeil(bewegt, dkZyl(0.007, 0.17, 10), ger.mMetall, 0, yStift, 0.085).rotation.x = Math.PI / 2;                           // Stecker
  maschTeil(bewegt, new THREE.SphereGeometry(0.017, 14, 10), ger.mDKGold, 0, yStift, 0.185);
  const yE = o.mRolle === false ? yM0 : yM0 - rm;   // Zugstab endet an der Öse bzw. am tiefsten Punkt der Rolle (dort läuft das Seil unten herum)
  maschTeil(bewegt, dkZyl(0.009, yE - yO, 12), ger.mKabel, 0, (yO + yE) / 2, 0);                                              // Zugstab (Seilmaterial: Teil der Kette Platten, Stab, Seil)
  if (o.mRolle === false) maschTeil(bewegt, new THREE.SphereGeometry(0.014, 12, 8), ger.mDKGold, 0, yM0, 0);                   // Öse am Kopf des Zugstabs
  else { const M = ger.rolleDK(V(0, yM0, 0), V(0, 0, 1), rm); ger.gruppe.remove(M); bewegt.add(M); }
  for (const sx of [-1, 1]) holmIn(ger, g, V(sx * 0.2, F + 0.05, -0.14), V(sx * 0.2, yG + 0.07, -0.14), 0.055);                 // Rollenkopf: zwei Pfosten und Querstück
  t(rundGeo(0.46, 0.09, 0.07, 0.02, 1), ger.mDK, 0, yG, -0.1);
  if (titel) {   // Schild vorn auf der Blende (Stapel seitlich der Maschine) oder außen auf der +x-Wand (Stapel hinter der Maschine: von der Kamera aus lesbar)
    const s = ger.schild(titel, untertitel); ger.gruppe.remove(s); g.add(s);
    if (o.seite) { s.rotation.y = Math.PI / 2; s.position.set(0.2655, F - 0.22, 0); } else s.position.set(0, F - 0.16, 0.19);
  }
  ger.gruppe.add(g);
  const welt = (v) => v.clone().applyAxisAngle(V(0, 1, 0), g.rotation.y).add(g.position);
  return { g, bewegt, platten, F, yM0, yG, hMax, rm, rg, welt, heben(h) { bewegt.position.y = h; platten.children.forEach((p, i) => { p.position.y = i >= STIFT ? h : 0; }); } };
}
// Seilweg Stapel → Hebel (wiederverwendbar): Stahlseil vom Zugstab des Stapels (bewegliche Rolle mit zwei Strängen oder Öse) über Rollen am Rollenkopf und
// Rollen über den Hebeln zu den Nocken (Scheiben auf der Hebelachse). Beide Enden hängen an Anschlüssen (Nocken-Nase am Hebel, Öse am Stapelkopf), das Seil ist
// immer straff und die Länge bleibt gleich: dreht der Hebel um dTheta, wickelt sich das Seil um die Nocke (Länge rN · dTheta) und der Stapel steigt um die
// Längenänderung geteilt durch die Zahl der Stränge an der Rolle (zwei Hebel: Mittelwert, ein Hebel mit Öse: 1:1, mit Rolle und fester Öse: 2:1).
// o: { block, straenge: 1 | 2, naben: [{ x, y, z (Hebelachse an der Nockenebene), rN (Nockenradius), dir (+1/-1: in welche Richtung dreht der Hebel in der Übung,
// Winkel von +z nach +y), dD (Höhe der Rolle über der Achse) }] }. stelle([theta je Nocke]) setzt Seil, Nocken und Stapel und liefert die Hubhöhe (m)
function stapelAnHebel(ger, o) {
  const B = o.block, rm = B.rm, rg = B.rg, rD = 0.04, w0 = 0.5, zwei = o.straenge !== 1;
  const nb = o.naben.map((n) => {
    const dD = n.dD || 0.45, beta = Math.acos(n.rN / dD), phiT = Math.PI / 2 + n.dir * beta, C = V(n.x, n.y, n.z);
    return { ...n, dD, phiT, C, K: C.clone().add(V(0, dD, 0)), T: C.clone().add(V(0, n.rN * Math.sin(phiT), n.rN * Math.cos(phiT))), L0: 6 * n.rN * Math.sin(w0 / 6), th0: null, arc: [V(), V(), V()] };
  });
  const S = zwei ? [B.welt(V(-rm, B.yG, 0)), B.welt(V(rm, B.yG, 0))] : [B.welt(V(0, B.yG, 0))];
  const horiz = (a, b) => V(b.x - a.x, 0, b.z - a.z).normalize();
  const kreuzen = (a, b, c, d) => { const f = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); return f(a, b, c) * f(a, b, d) < 0 && f(c, d, a) * f(c, d, b) < 0; };
  let zuord = nb.map((_, k) => k);   // Strang i läuft zur Nocke zuord[i]; so, dass sich die Seile in der Draufsicht nicht kreuzen
  if (nb.length === 2) { const wg = (i, k) => S[i].clone().addScaledVector(horiz(S[i], nb[k].K), rg); if (kreuzen(wg(0, 0), nb[0].K, wg(1, 1), nb[1].K)) zuord = [1, 0]; }
  const i0 = nb.length === 1 && zwei && S[1].distanceTo(nb[0].K) < S[0].distanceTo(nb[0].K) ? 1 : 0;   // ein Hebel mit fester Öse: der nähere Strang läuft zum Hebel
  zuord.forEach((k, i) => {
    const si = nb.length === 1 && zwei ? i0 : i, n = nb[k], Wg = S[si].clone().addScaledVector(horiz(S[si], n.K), rg), G = umlenk(S[si].clone().sub(V(0, 0.3, 0)), Wg, n.K, rg);
    const tau = n.T.clone().sub(n.K).normalize(), uin = n.K.clone().sub(G.aus).normalize();
    const Wd = n.K.clone().sub(uin.clone().sub(tau.clone().multiplyScalar(uin.dot(tau))).normalize().multiplyScalar(rD)), D = umlenk(G.aus, Wd, n.T, rD);   // Rolle berührt die Tangente zur Nocke in K
    const mitte = (W, r, A, B) => { const v = A.clone().sub(W).add(B.clone().sub(W)); return v.lengthSq() < 1e-8 ? A.clone() : W.clone().addScaledVector(v.normalize(), r); };   // Punkt auf dem Radrand in der Mitte des Bogens
    n.Wd = Wd; n.strang = si; n.kette = [n.T, D.aus, mitte(Wd, rD, D.aus, D.ein), D.ein, G.aus, mitte(Wg, rg, G.aus, G.ein), S[si].clone()];
    ger.rolleDK(Wg, G.a, rg); ger.rolleDK(Wd, D.a, rD);
    if (n.zug) return;   // Seilende wandert mit der Hand (Kabelturm): keine Nocke
    n.nase = ger.teil(new THREE.SphereGeometry(0.009, 12, 8), ger.mDKGold);   // Seilende: Kugel (gepresste Seilkugel) an der Nocke
    // Nocke: Kreisausschnitt aus Stahlblech (3 cm), dreht mit dem Hebel um die Achse; das Seil läuft auf ihrem Rand. Er reicht von der Nase bis dorthin,
    // wo das Seil bei vollem Hebelweg (dth, rad) abläuft
    const R0 = n.rN - 0.004, aA = n.phiT - n.dir * ((n.dth || 0.8) + 0.15), aB = n.phiT + n.dir * (w0 + 0.12), lo = Math.min(aA, aB), hi = Math.max(aA, aB);
    n.nocke = new THREE.Group(); n.nocke.position.copy(n.C); ger.gruppe.add(n.nocke);
    for (let k = 0; k < 3; k++) {   // drei Keile: so liegt das Seil am Rand außerhalb der Kästen der Teile
      // Keil in eigener Lage: Mittellinie entlang +Y (so liegt sein Kasten eng an), dann um X auf seinen Winkel gedreht
      const w1 = new THREE.Shape(), a1 = lo + (hi - lo) * k / 3, a2 = lo + (hi - lo) * (k + 1) / 3, am = (a1 + a2) / 2, ha = (a2 - a1) / 2; w1.moveTo(0, 0);
      for (let j = 0; j <= 6; j++) { const b = -ha + 2 * ha * j / 6; w1.lineTo(-R0 * Math.sin(b), R0 * Math.cos(b)); }
      w1.lineTo(0, 0);
      const ng = new THREE.ExtrudeGeometry(w1, { depth: 0.03, bevelEnabled: false, curveSegments: 1 }); ng.rotateY(Math.PI / 2); ng.translate(-0.015, 0, 0);
      const m = new THREE.Mesh(ng, ger.mHebel); m.rotation.x = Math.PI / 2 - am; m.castShadow = true; m.receiveShadow = true; n.nocke.add(m);
    }
  });
  const M = [V(), V(), V()], knoten = [];   // Knoten von Anschluss zu Anschluss: Nocke (oder Zugstelle), Rollen, bewegliche Rolle, Rollen, Nocke oder feste Öse
  const vor = (n) => (n.zug ? [...n.kette] : [n.arc[2], n.arc[1], n.arc[0], ...n.kette]), rueck = (n) => (n.zug ? [...n.kette].reverse() : [...n.kette].reverse().concat([n.arc[0], n.arc[1], n.arc[2]]));
  const oese = (si) => { const E = B.welt(V(si ? rm : -rm, B.yG, 0)); ger.teil(new THREE.SphereGeometry(0.009, 12, 8), ger.mDKGold, E); holmIn(ger, ger.gruppe, B.welt(V(si ? rm : -rm, B.yG, -0.07)), E, 0.02); return E; };
  if (zwei) { const e0 = nb.find((n) => n.strang === 0), e1 = nb.find((n) => n.strang === 1); knoten.push(...(e0 ? vor(e0) : [oese(0)]), ...M, ...(e1 ? rueck(e1) : [oese(1)])); }
  else knoten.push(...vor(nb[0]), M[0]);
  const seg = []; for (let i = 0; i < knoten.length - 1; i++) seg.push(ger.seilTeil(knoten[i], knoten[i + 1]));
  const setze = (ws, h) => {
    nb.forEach((n, k) => { if (!n.zug) n.arc.forEach((p, j) => { const a = n.phiT + n.dir * ws[k] * (j + 1) / 3; p.set(n.x, n.y + n.rN * Math.sin(a), n.z + n.rN * Math.cos(a)); }); });
    B.heben(h);
    const yM = B.yM0 + h;
    if (zwei) { M[0].copy(B.welt(V(-rm, yM, 0))); M[1].copy(B.welt(V(0, yM - rm, 0))); M[2].copy(B.welt(V(rm, yM, 0))); } else M[0].copy(B.welt(V(0, yM, 0)));
    seg.forEach((s, i) => ger.legeStab(s, knoten[i], knoten[i + 1]));
    nb.forEach((n, k) => { if (!n.zug) { n.nase.position.copy(n.arc[2]); n.nocke.rotation.x = -n.dir * (ws[k] - w0); } });   // Nocke dreht mit dem Hebel
  };
  setze(nb.map(() => w0), 0);
  const res = {
    nb, seg, knoten, hub: 0, block: B,
    stelle(th) {
      let summe = 0;
      const ws = nb.map((n, k) => { if (n.th0 === null) n.th0 = th[k]; if (n.zug) { summe += th[k] - n.th0; return w0; } const w = Math.max(0.02, w0 + n.dir * (th[k] - n.th0)); summe += 6 * n.rN * Math.sin(w / 6) - n.L0; return w; });
      res.hub = Math.max(0, Math.min(B.hMax, summe / (zwei ? 2 : 1)));
      setze(ws, res.hub); return res.hub;
    }
  };
  return res;
}
// Brustpolster-Rudermaschine, Beinstrecker und Drückmaschinen bauen mit diesen Teilen weiter unten (rudermaschineBauen, drueckmaschineBauen, streckerBauenDK)
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
function drueckmaschineBauen(ger, z, becken, r, C, griff, dk) {
  if (!dk) return drueckmaschineBauenAlt(ger, z, becken, r, C, griff);   // ohne DK-Angaben wie bisher
  // DK Line (Auftrag D): getrennte Seitenrahmen mit Lagerböcken statt Querrohr auf Achshöhe; Stapel hinten zwischen den Holmen des Bodenrahmens.
  // dk: { titel, untertitel (Schild), dir (Drehrichtung des Hebels in der Übung), rN (Nockenradius) }
  const R = rumpfRahmen(r), oben = 0.45, stackZ = dk.stackZ != null ? dk.stackZ : becken.z - 0.78, zr = Math.min(-0.85, C.z - 0.12, stackZ - 0.28), zv = becken.z > 0.1 ? 1.1 : 0.7;
  dkBoden(ger, DK.achse, zr, zv, stackZ + 0.23);
  sitzSaeuleDK(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.44, 0.44);
  ger.polsterGeformt(0.32, 0.66, 0.09, becken.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));   // schmal: Ellbogen gehen unten daran vorbei
  ger.holm(V(0, 0.05, becken.z - 0.42), becken.clone().add(R.oben.clone().multiplyScalar(0.34)).sub(R.vor.clone().multiplyScalar(0.2625)), DK.strebe);   // Kappe liegt an der Polsterrückseite an
  const strebe = C.y > 0.8 ? { y: C.y - 0.45, z: C.z + (C.z > -0.3 ? -0.75 : 0.75) } : null;
  for (const sx of [-1, 1]) {
    const s = sx > 0 ? 'l' : 'r';
    dkSeitenrahmen(ger, sx, C, oben, strebe);
    z['dmArm_' + s] = ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel);
    z['dmQuer_' + s] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mHebel);
    const gg = new THREE.Group(); ger.gruppe.add(gg);
    griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), gg, 0.75);
    if (griff === 'laengs') gg.userData.frei = V(0, 1, 0);   // Schwenkgriff: dreht mit der Hand
    z['dmGriff_' + s] = gg;
  }
  ger.holm(V(0, 0.05, becken.z + 0.62), V(0, 0.25, becken.z + 0.62), DK.strebe);
  ger.stab(V(-0.2, 0.25, becken.z + 0.62), V(0.2, 0.25, becken.z + 0.62), 0.016, ger.mMetall);   // Fußstütze
  z.block = gewichtsblockDK(ger, V(0, 0, stackZ), V(0, 0, 1), 1.55, dk.titel, dk.untertitel, { seite: true });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ x: sg * (DK.achse + 0.08), y: C.y, z: C.z, rN: dk.rN, dir: dk.dir, dth: dk.dth, dD: oben })) });
  seil.nb.forEach((n) => ger.holm(V(Math.sign(n.x) * DK.achse, C.y + oben, C.z), n.Wd, 0.04));   // Halter der Seilrolle am Mast
  z.dkSeil = seil; z.dm = { C, griff, dk: seil };
}
function drueckmaschineBauenAlt(ger, z, becken, r, C, griff) {
  const R = rumpfRahmen(r);
  bodenrahmen(ger, -0.45, 0.45, -0.85, becken.z > 0.1 ? 1.1 : 0.7);   // vorderes Rahmenrohr vor den Füßen, nicht darunter (Schrägpresse: Füße weiter vorn)
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.44, 0.44);
  ger.polster(0.32, 0.66, 0.09, becken.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));   // schmal: Ellbogen gehen unten daran vorbei
  ger.vierkant(V(0, 0.05, becken.z - 0.42), becken.clone().add(R.oben.clone().multiplyScalar(0.34)).sub(R.vor.clone().multiplyScalar(0.23)), 0.07);
  for (const sx of [-1, 1]) {
    const s = sx > 0 ? 'l' : 'r', P = V(sx * DM_X, C.y, C.z);
    ger.vierkant(V(sx * DM_X, 0.05, C.z), P.clone().sub(V(0, 0.06, 0)), 0.08);
    drehlager(ger, P, V(1, 0, 0), 0.13);
    z['dmArm_' + s] = ger.stab(V(), V(0, 1, 0), 0.03, ger.mRahmen);
    z['dmQuer_' + s] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mRahmen);
    const g = new THREE.Group(); ger.gruppe.add(g);
    griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75);
    if (griff === 'laengs') g.userData.frei = V(0, 1, 0);   // Schwenkgriff: dreht mit der Hand
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
  const { C, griff } = z.dm, X = z.dm.x || DM_X, th = [];
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const h = g.hand[s], A = V(sg * X, h.y, h.z), P = V(sg * X, C.y, C.z);
    th.push(Math.atan2(h.y - C.y, h.z - C.z));   // Winkel des Hebels (von +z nach +y): dreht die Nocke und zieht das Seil (DK Line)
    seil(z['dmArm_' + s], P, A);
    // Querrohr vom Hebelarm bis zum Griff (Griff quer: bis zu seinem äußeren Ende)
    seil(z['dmQuer_' + s], A, h.clone().add(V(sg * (griff === 'quer' ? 0.075 : 0.03), griff === 'senkrecht' ? 0.075 : 0, 0)));
    const gr = z['dmGriff_' + s]; gr.position.copy(h);
    gr.quaternion.setFromUnitVectors(V(0, 1, 0), griff === 'senkrecht' ? V(0, 1, 0) : griff === 'quer' ? V(1, 0, 0) : V(0, 0, 1));
  }
  if (z.dm.dk) z.dm.dk.stelle(th); else z.block.heben(0.3 * hub);   // DK Line: der Stapel hebt sich so, wie das Seil es zulässt
}
/* ---------- Paket R1 (Auftrag R, 09.11.2026): Sitz-, Hebel-, Arm- und Butterfly-Maschinen in der DK Line ----------
   Eigene Bausteine mit Präfix r1_. r1_nockenSeil macht dasselbe wie stapelAnHebel (Seil von Anschluss zu Anschluss, Länge konstant, der Stapel steigt nur über das Seil),
   aber für jede Hebelachse (Nockenebene aus achse und e2, Winkel von e1 = e2 × achse nach e2), mit der Nockenscheibe an der Stelle, an der das Seil aufliegt
   (stapelAnHebel setzt sie gespiegelt), mit einer Mastrolle (oben) für tief liegende Nocken und mit direktem Seilweg zur Kopfrolle (Butterfly). */
function r1_nockenSeil(ger, o) {
  const B = o.block, rm = B.rm, rg = B.rg, rD = 0.04, w0 = 0.5, zwei = o.straenge !== 1;
  const wickel = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const rolle = (pos, achse, r) => (o.sparsam ? r1_rolle(ger, pos, achse, r) : ger.rolleDK(pos, achse, r));   // sparsam: Rollen ohne Goldkappe (weniger Meshes)
  const nb = o.naben.map((n) => {
    const e2 = n.e2.clone().normalize(), a = n.achse.clone().normalize(), e1 = e2.clone().cross(a).normalize();   // e1 × e2 = a: Drehrichtung der Winkel
    const r = { ...n, e1, e2, a, C: n.C.clone(), dD: n.dD || 0.45, rE: n.oben ? n.oben.r || 0.04 : 0, th0: n.th0 == null ? null : n.th0, dir: n.dir || 1, dth: n.dth || 0.8 };
    r.w = (v) => Math.atan2(v.dot(e2), v.dot(e1));   // Winkel einer Richtung in der Nockenebene
    r.pt = (rr, phi) => r.C.clone().addScaledVector(e1, rr * Math.cos(phi)).addScaledVector(e2, rr * Math.sin(phi));
    if (n.v0 && n.v1) { r.th0 = r.w(n.v0); const d = wickel(r.w(n.v1) - r.th0); r.dir = d < 0 ? -1 : 1; r.dth = Math.abs(d); }   // Ruhelage und Drehrichtung aus der Lage des Hebels am Anfang und am Ende der Übung
    r.nA = Math.min(5, Math.max(3, Math.ceil((w0 + r.dth + 0.1) / 0.5))); r.arc = Array.from({ length: r.nA }, () => V()); r.L0 = 2 * r.nA * n.rN * Math.sin(w0 / (2 * r.nA));   // Sehnen auf dem Nockenrand: je höchstens 0,45 rad, damit das Seil nicht tief in die Scheibe schneidet
    if (!n.direkt) { r.phiT = Math.PI / 2 + r.dir * Math.acos(Math.min(1, n.rN / r.dD)); r.K = r.pt(r.dD, Math.PI / 2); r.T = r.pt(n.rN, r.phiT); }
    return r;
  });
  const S = zwei ? [B.welt(V(-rm, B.yG, 0)), B.welt(V(rm, B.yG, 0))] : [B.welt(V(0, B.yG, 0))];
  const horiz = (a, b) => { const d = V(b.x - a.x, 0, b.z - a.z); return d.lengthSq() < 1e-8 ? V(1, 0, 0) : d.normalize(); };
  const ziel = (n) => (n.oben ? n.oben.W : n.direkt ? n.C : n.K);
  const kreuzen = (a, b, c, d) => { const f = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x); return f(a, b, c) * f(a, b, d) < 0 && f(c, d, a) * f(c, d, b) < 0; };
  let zuord = nb.map((_, k) => k);   // Strang i läuft zur Nocke zuord[i]; so, dass sich die Seile von oben gesehen nicht kreuzen
  if (zwei && nb.length === 2) { const wg = (i, k) => S[i].clone().addScaledVector(horiz(S[i], ziel(nb[k])), rg); if (kreuzen(wg(0, 0), ziel(nb[0]), wg(1, 1), ziel(nb[1]))) zuord = [1, 0]; }
  const mitte = (W, r, A, Bp) => { const v = A.clone().sub(W).add(Bp.clone().sub(W)); return v.lengthSq() < 1e-8 ? A.clone() : W.clone().addScaledVector(v.normalize(), r); };   // Punkt auf dem Radrand mitten im Bogen
  zuord.forEach((k, i) => {
    const n = nb[k], Z = ziel(n), Wg = S[i].clone().addScaledVector(horiz(S[i], Z), rg), P0 = S[i].clone().sub(V(0, 0.3, 0));
    let G = umlenk(P0, Wg, Z, rg), kette;
    if (n.direkt) {   // Seil von der Kopfrolle gerade zur Nocke: der Berührpunkt T folgt aus dem Ablaufpunkt der Kopfrolle
      for (let it = 0; it < 3; it++) {
        const d = G.aus.clone().sub(n.C), dx = d.dot(n.e1), dy = d.dot(n.e2), Dn = Math.max(Math.hypot(dx, dy), n.rN * 1.01);
        n.phiT = Math.atan2(dy, dx) + n.dir * Math.acos(n.rN / Dn); n.T = n.pt(n.rN, n.phiT);
        G = umlenk(P0, Wg, n.T, rg);
      }
      kette = [n.T, G.aus, mitte(Wg, rg, G.aus, G.ein), S[i].clone()];
    } else {
      const tau = n.T.clone().sub(n.K).normalize(), We = n.oben ? n.oben.W.clone() : null;
      let E = null, D = null, Wd = n.K.clone();
      G = umlenk(P0, Wg, We || n.K, rg);
      for (let it = 0; it < 3; it++) {   // Rollen so lange abgleichen, bis die Tangenten zueinander passen
        if (We) E = umlenk(G.aus, We, D ? D.ein : n.K, n.rE);
        const vor = We ? E.aus : G.aus, uin = n.K.clone().sub(vor).normalize();
        Wd = n.K.clone().sub(uin.clone().sub(tau.clone().multiplyScalar(uin.dot(tau))).normalize().multiplyScalar(rD));   // Rolle D berührt die Tangente zur Nocke in K
        D = umlenk(vor, Wd, n.T, rD);
        G = umlenk(P0, Wg, We ? E.ein : D.ein, rg);
      }
      kette = [n.T, D.aus, mitte(Wd, rD, D.aus, D.ein), D.ein, ...(We ? [E.aus, mitte(We, n.rE, E.aus, E.ein), E.ein] : []), G.aus, mitte(Wg, rg, G.aus, G.ein), S[i].clone()];
      n.Wd = Wd; n.We = We; rolle(Wd, D.a, rD); if (We) rolle(We, E.a, n.rE);
    }
    n.Wg = Wg; n.strang = i; n.kette = kette; rolle(Wg, G.a, rg);
    n.nase = ger.teil(new THREE.SphereGeometry(0.009, 12, 8), ger.mDKGold);   // Seilende: gepresste Kugel an der Nocke
    // Nocke: Kreisausschnitt aus Stahlblech (3 cm), dreht mit dem Hebel um die Achse; das Seil läuft auf ihrem Rand. Er reicht von der Nase bis dorthin, wo das Seil bei vollem Hebelweg abläuft
    const R0 = n.rN - 0.004, aA = n.phiT - n.dir * (n.dth + 0.15), aB = n.phiT + n.dir * (w0 + 0.12), lo = Math.min(aA, aB), hi = Math.max(aA, aB);
    n.nocke = new THREE.Group(); n.nocke.position.copy(n.C); ger.gruppe.add(n.nocke);
    const keile = n.keile || Math.min(4, Math.max(2, Math.ceil((hi - lo) / 0.8)));
    for (let q = 0; q < keile; q++) {   // mehrere Keile (je höchstens 0,8 rad), jeder in eigener Lage mit der Mittellinie entlang +x: so liegt das Seil am Rand außerhalb der Kästen der Teile
      const a1 = lo + (hi - lo) * q / keile, a2 = lo + (hi - lo) * (q + 1) / keile, am = (a1 + a2) / 2, ha = (a2 - a1) / 2, sh = new THREE.Shape(); sh.moveTo(0, 0);
      for (let j = 0; j <= 6; j++) { const b = -ha + 2 * ha * j / 6; sh.lineTo(R0 * Math.cos(b), R0 * Math.sin(b)); }
      sh.lineTo(0, 0);
      const ng = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false, curveSegments: 1 }); ng.translate(0, 0, -0.015);   // Dicke entlang der Achse
      const m = new THREE.Mesh(ng, ger.mHebel); m.castShadow = true; m.receiveShadow = true;
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(n.e1.clone().multiplyScalar(Math.cos(am)).addScaledVector(n.e2, Math.sin(am)), n.e1.clone().multiplyScalar(-Math.sin(am)).addScaledVector(n.e2, Math.cos(am)), n.a));   // x = Richtung des Keils (Winkel am, von e1 nach e2)
      n.nocke.add(m);
    }
  });
  const M = [V(), V(), V()], knoten = [];   // Knoten von Anschluss zu Anschluss: Nasen, Rollen, bewegliche Rolle (oder Öse am Zugstab)
  const vor = (n) => [...n.arc].reverse().concat(n.kette), rueck = (n) => [...n.kette].reverse().concat(n.arc);
  if (zwei) { const e0 = nb.find((n) => n.strang === 0), e1 = nb.find((n) => n.strang === 1); knoten.push(...vor(e0), ...M, ...rueck(e1)); }
  else knoten.push(...vor(nb[0]), M[0]);
  const seg = []; for (let i = 0; i < knoten.length - 1; i++) seg.push(ger.seilTeil(knoten[i], knoten[i + 1]));
  const setze = (ws, h) => {
    nb.forEach((n, k) => { n.arc.forEach((p, j) => p.copy(n.pt(n.rN, n.phiT + n.dir * ws[k] * (j + 1) / n.nA))); });
    B.heben(h);
    const yM = B.yM0 + h;
    if (zwei) { M[0].copy(B.welt(V(-rm, yM, 0))); M[1].copy(B.welt(V(0, yM - rm, 0))); M[2].copy(B.welt(V(rm, yM, 0))); } else M[0].copy(B.welt(V(0, yM, 0)));
    seg.forEach((s, i) => ger.legeStab(s, knoten[i], knoten[i + 1]));
    nb.forEach((n, k) => { n.nase.position.copy(n.arc[n.nA - 1]); n.nocke.quaternion.setFromAxisAngle(n.a, n.dir * (ws[k] - w0)); });   // die Nocke dreht mit dem Hebel
  };
  setze(nb.map(() => w0), 0);
  const res = {
    nb, seg, knoten, hub: 0, block: B,
    stelle(th) {   // th: Winkel des Hebels je Nocke (von e1 nach e2); liefert die Hubhöhe (m)
      let summe = 0;
      const ws = nb.map((n, k) => {
        if (n.th0 === null) n.th0 = th[k];
        if (n.dir * wickel(th[k] - n.th0) < 0) n.th0 = th[k];   // hinter der Ruhelage: Ruhelage nachziehen (Stapel bleibt unten)
        const w = Math.max(0.02, w0 + n.dir * wickel(th[k] - n.th0)); summe += 2 * n.nA * n.rN * Math.sin(w / (2 * n.nA)) - n.L0; return w;
      });
      res.hub = Math.max(0, Math.min(B.hMax, summe / (zwei ? 2 : 1)));
      setze(ws, res.hub); return res.hub;
    },
    stelleV(vek) { return res.stelle(vek.map((v, k) => nb[k].w(v))); }   // wie stelle, aber aus der Richtung des Hebels (Welt)
  };
  return res;
}
// Umlenkrolle mit nur drei Teilen (Rad und zwei Wangen, ohne Goldkappe): spart Meshes bei den Maschinen mit vielen Rollen
function r1_rolle(ger, pos, achse, r) {
  const g = new THREE.Group(); g.position.copy(pos); g.quaternion.setFromUnitVectors(V(0, 1, 0), achse.clone().normalize());
  const teil = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); return o; };
  teil(dkZyl(r, 0.02, 20), ger.mHebel, 0); teil(dkZyl(r * 1.4, 0.007, 20), ger.mDK, 0.0135); teil(dkZyl(r * 1.4, 0.007, 20), ger.mDK, -0.0135);
  ger.gruppe.add(g); return g;
}
// Lagerbock um eine beliebige Hebelachse P (Richtung achse): wie ger.lagerbock, nur nicht auf X festgelegt. hub = +1/-1: auf welcher Seite entlang der Achse die silberne Nabe
// (Hebelseite) sitzt; kappe = false lässt die Goldkappe auf der anderen Seite weg
function r1_lager(ger, P, achse, hub = -1, kappe = true, hubL = 0.03) {
  const g = new THREE.Group(); g.position.copy(P); g.quaternion.setFromUnitVectors(V(1, 0, 0), achse.clone().normalize());
  const teil = (geo, m, x, quer) => { const o = new THREE.Mesh(geo, m); o.position.x = x; if (quer) o.rotation.z = Math.PI / 2; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  teil(rundGeo(0.09, 0.17, 0.17, 0.03, 1), ger.mDK, 0, false); teil(dkZyl(0.058, hubL, 24), ger.mHebel, hub * (0.045 + hubL / 2), true);   // hubL: Länge der Nabe (länger, wenn die Nocke ohne Achsstück direkt darauf sitzen soll)
  if (kappe) teil(dkZyl(0.05, 0.02, 24), ger.mDKGold, -hub * 0.055, true);
  ger.gruppe.add(g); return g;
}
// Rundrohr von (x, 0.05, z) senkrecht hoch bis unter die Unterseite eines Polsters (Mitte pc, Dicke d, Flächennormale n nach oben): die Kappe liegt an der Fläche an
function r1_stuetzeUnter(ger, pc, n, d, x, z, dm = DK.strebe) {
  const r = dm / 2, y = pc.y + (-d / 2 - r - (x - pc.x) * n.x - (z - pc.z) * n.z) / n.y;
  return ger.holm(V(x, 0.05, z), V(x, y, z), dm);
}
// Armpolster der Bizeps-/Trizepsmaschine (wie scottPolster, Größe und Lage gleich; scottPolster selbst bleibt für die freie Scott-Bank): Polster mit Naht, darunter ein Rundrohr bis zum Querholm
function r1_scottPolster(ger, z, becken, dicke, zStuetze) {
  const L = scottLage(becken);
  z.pult = ger.polsterGeformt(0.5, dicke, 0.34, V());
  scottPultLegen(z.pult, L.schM, L.ellM);
  r1_stuetzeUnter(ger, z.pult.position, V(0, 1, 0).applyQuaternion(z.pult.quaternion), dicke, 0, zStuetze);
  return L;
}
// Beinbeuger liegend in der DK Line: Polster und Griffe wie bisher, Seitenholme tragen Lagerbock und Griffpfosten, Hebel silbern, Stapel links mit Seil zur Nocke (1:1)
function r1_beugerLiegend(ger, z) {
  const XS = 0.40, P = BL_KNIE.clone().setX(-SM_HEBEL_X), zS = 0.15, oben = 2.13 - P.y;   // Hebel links (neben dem Stapel): die rechte Seite bleibt frei für den Weg zur Bank. Seilrolle auf 2,13 m
  dkBoden(ger, XS, -1.0, 0.8, -1.0, 0.8);
  ger.polsterGeformt(0.38, 0.09, 0.75, V(0, 0.54, -0.475));   // Brustpolster
  const hq = quer(-6), hp = V(0, 0.562, 0.2);
  ger.polsterGeformt(0.38, 0.09, 0.62, hp, hq);   // etwas höheres Hüftpolster
  r1_stuetzeUnter(ger, V(0, 0.54, -0.475), V(0, 1, 0), 0.09, 0, -0.5);
  r1_stuetzeUnter(ger, hp, V(0, 1, 0).applyQuaternion(hq), 0.09, 0, 0.2);
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.385, 0.05, -0.54), V(sx * 0.385, 0.56, -0.54), 0.045); griffRohr(ger, V(sx * 0.385, 0.58, -0.54), V(sx * 0.385, 0.74, -0.54)); }   // Griffe senkrecht, quer zum Unterarm
  dkSeitenrahmen(ger, -1, P, oben, null, XS);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = 0.385, rz = 0.103, rl = 0.36;   // Rolle liegt oben am Unterschenkel an (Rückseite des Beins in Bauchlage)
  holmIn(ger, z.hebel, V(0, 0, 0), V(0, -L, rz), 0.055, ger.mHebel);
  holmIn(ger, z.hebel, V(0, -L, rz), V(-Math.sign(P.x) * (Math.abs(P.x) - rl / 2 - 0.01), -L, rz), 0.04, ger.mHebel);   // Querrohr vom Hebelarm bis zum Ende der Rolle
  rollePolster(ger, rl, 0.048, z.hebel).position.set(-P.x, -L, rz);
  z.block = gewichtsblockDK(ger, V(-0.8, 0, zS), V(1, 0, 0), 1.55, 'BEINBEUGER LIEGEND', 'OBERSCHENKEL', { mRolle: false });
  ger.holm(V(-XS, 0.05, zS), V(-0.57, 0.05, zS), DK.boden);   // Seitenholm links bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 1, naben: [{ C: V(-(XS + 0.08), P.y, P.z), achse: V(-1, 0, 0), e2: V(0, 1, 0), rN: 0.14, dD: oben, v0: V(0, Math.sin(2 * RAD), Math.cos(2 * RAD)), v1: V(0, Math.sin(115 * RAD), Math.cos(115 * RAD)) }] });
  ger.holm(V(-XS, P.y + oben, P.z), z.dkSeil.nb[0].Wd, 0.04);   // Halter der Seilrolle am Mast
  return z;
}
// Lage des Polsters am Knie bei Spreizung a (rad) für Adduktoren/Abduktoren, wie in beinmaschine.props gerechnet (Knie aus smKnie, Hüfte aus dem Becken)
function r1_padLage(a, sg, abd) {
  const R = rumpfRahmen(SM_RUMPF), K = smKnie(a)[sg > 0 ? 'l' : 'r'], H = SM_BECKEN.clone().sub(R.oben.clone().multiplyScalar(0.02)).add(V(sg * MASS.hueftBreite, 0, 0));
  const td = K.clone().sub(H).setY(0).normalize(), aussen = V(sg * td.z, 0, -sg * td.x);
  return K.clone().sub(td.clone().multiplyScalar(0.05)).add(aussen.multiplyScalar(abd ? 0.11 : -0.11));
}
// Adduktoren/Abduktoren: je Seite ein Schwenkarm um eine senkrechte Achse unter der Sitzvorderkante (Pfosten auf dem Querholm, Lagerbock, Nabe mit Armen, darüber die Nocke).
// Das Seil verlässt die Nocke waagrecht nach hinten, läuft an einem Mast hinter der Lehne hoch und oben zur Kopfrolle des Stapels
function r1_schwenkBauen(ger, z, art, zS) {
  const abd = art === 'abduktoren', zM = -0.70, zP = 0.14, yH = 0.30, yC = yH + 0.045, yE = 2.13, nab = [], hubs = {};
  const a0 = (abd ? 8 : 42) * RAD, a1 = (abd ? 40 : 8) * RAD;
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const A = V(sg * 0.13, yH, zP), C = V(A.x, yC, zP), K = V(sg * 0.22, yC, zM + 0.12);
    hubs[s] = A;
    ger.holm(V(A.x, 0.05, zP), V(A.x, yH - 0.06 - 0.045 - 0.0325, zP), DK.strebe);   // Pfosten auf dem vorderen Querholm, die Kappe liegt unter dem Lagerbock an
    r1_lager(ger, V(A.x, yH - 0.06, zP), V(0, 1, 0), 1, false, 0.045);   // Gehäuse; die silberne Nabe (Arme, 4,5 cm hoch) sitzt darüber, die Nocke direkt auf der Nabe
    const out = V(-0.8 - K.x, 0, zS - K.z).normalize(), We = V(K.x, yE, K.z - 0.04).addScaledVector(out, 0.04);   // Mastrolle: das senkrechte Seil läuft 4 cm hinter K hoch
    ger.holm(V(K.x, 0.05, zM), V(K.x, yC, zM), DK.strebe); ger.holm(V(K.x, yC, zM), V(K.x, yE, zM), DK.strebe);   // Mast in zwei Stücken: am Treffpunkt hängen die Halter der Rollen
    const dir0 = r1_padLage(a0, sg, abd).sub(A).setY(0), dir1 = r1_padLage(a1, sg, abd).sub(A).setY(0);
    nab.push({ C, achse: V(0, 1, 0), e2: K.clone().sub(C).normalize(), rN: abd ? 0.10 : 0.12, dD: K.distanceTo(C), oben: { W: We, r: 0.04 }, keile: 2, v0: dir0, v1: dir1, mastX: K.x, mastZ: zM, K });
  }
  for (const s of ['l', 'r']) {
    z['arm_' + s] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mHebel); z['rarm_' + s] = ger.stab(V(), V(0, 1, 0), 0.02, ger.mHebel);
    z['pad_' + s] = ger.polsterGeformt(0.065, 0.2, 0.26, V()); z['raste_' + s] = ger.stab(V(), V(0, 1, 0), 0.016, ger.mMetall);
  }
  z.block = gewichtsblockDK(ger, V(-0.8, 0, zS), V(1, 0, 0), 1.55, abd ? 'ABDUKTOREN' : 'ADDUKTOREN', abd ? 'AUSSEN-OBERSCHENKEL' : 'INNEN-OBERSCHENKEL');
  ger.holm(V(-0.40, 0.05, zS), V(-0.57, 0.05, zS), DK.boden);   // Seitenholm links bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 2, sparsam: true, naben: nab.map((n) => ({ ...n })) });
  z.dkSeil.nb.forEach((n) => { ger.holm(V(n.mastX, n.oben.W.y, n.mastZ), n.oben.W, 0.04); ger.holm(V(n.mastX, n.K.y, n.mastZ), n.Wd, 0.04); });   // Halter von Mastrolle und unterer Rolle
  z.r1 = { hubs, abd };
}
function r1_schwenkStellen(z, g) {
  const abd = z.r1.abd, vek = [];
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const td = g.knie[s].clone().sub(g.huefte[s]).setY(0).normalize(), aussen = V(sg * td.z, 0, -sg * td.x), H = z.r1.hubs[s];
    const pad = g.knie[s].clone().sub(td.clone().multiplyScalar(0.05)).add(aussen.multiplyScalar(abd ? 0.11 : -0.11));
    z['pad_' + s].position.copy(pad); z['pad_' + s].quaternion.copy(basisAus(V(0, 1, 0), td));
    seil(z['arm_' + s], H, pad.clone().sub(V(0, 0.1, 0)));
    const raste = g.knoechel[s].clone().add(V(0, -0.085, 0.03));
    seil(z['raste_' + s], raste.clone().sub(V(0.07, 0, 0)), raste.clone().add(V(0.07, 0, 0)));
    seil(z['rarm_' + s], H, raste);
    vek.push(V(pad.x - H.x, 0, pad.z - H.z));
  }
  z.dkSeil.stelleV(vek);
}
// Seitheben-Maschine in der DK Line: Sitz, Lehne, Säule wie bisher; je Seite ein Lagerbock auf der Drehachse durch die Schulter (Achse shAchse), Hebel silbern, Polster am Oberarm,
// Nocke hinter dem Lager; das Seil läuft senkrecht an einem Mast hinter der Maschine hoch und oben zum Stapel links
function r1_seithebenBauen(ger, z, SH_BECKEN, SH_RUMPF) {
  const k = rumpf(SH_BECKEN, SH_RUMPF), R = k.R, saeuleZ = SH_BECKEN.z - 0.42, zS = SH_BECKEN.z - 0.1, yE = 2.13, nab = [];
  dkBoden(ger, 0.42, saeuleZ, 0.3, saeuleZ, 0.3);
  sitzSaeuleDK(ger, V(0, SH_BECKEN.y - 0.115, SH_BECKEN.z), 0.42, 0.4);
  ger.polsterGeformt(0.4, 0.6, 0.09, SH_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
  const yB = k.schulter.l.y + 0.1145;   // Höhe der Halter (Oberkante der Lagergehäuse; die Achsen liegen waagrecht auf Schulterhöhe)
  ger.holm(V(0, 0.05, saeuleZ), V(0, yB, saeuleZ), DK.holm);
  ger.holm(V(0, 0.62, saeuleZ), SH_BECKEN.clone().add(V(0, 0.2, -0.24)).sub(R.vor.clone().multiplyScalar(0.0325)), DK.strebe);   // Strebe zur Rückseite der Lehne
  for (const [sd, sg] of [['l', 1], ['r', -1]]) {
    const a = shAchse(sg), P = k.schulter[sd].clone().addScaledVector(a, -0.2), Ph = P.clone().addScaledVector(a, -0.06), C = P.clone().addScaledVector(a, -0.14);
    ger.holm(V(0, Ph.y + 0.1145, saeuleZ), V(Ph.x, Ph.y + 0.1145, Ph.z), DK.strebe);   // Halter von der Säule über das Lagergehäuse, die Kappe liegt oben an
    r1_lager(ger, Ph, a, 1);   // Nabe auf der Hebelseite (vorn), Goldkappe hinten
    const K = V(C.x, yE, C.z), mZ = saeuleZ, out = V(-0.82 - K.x, 0, zS - K.z).normalize();
    ger.holm(V(C.x, 0.05, mZ), V(C.x, yE, mZ), DK.strebe);   // Mast hinter der Nocke
    const dD = yE - C.y, v0 = V(0, -Math.cos(26 * RAD), 0).addScaledVector(shQuer(sg), Math.sin(26 * RAD)), v1 = V(0, -Math.cos(88 * RAD), 0).addScaledVector(shQuer(sg), Math.sin(88 * RAD));
    nab.push({ C, achse: a, e2: V(0, 1, 0), rN: 0.17, dD, v0, v1, mastX: C.x, mastZ: mZ, yE });
    z['shArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mHebel); z['shVor_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mHebel);
    z['shHand_' + sd] = ger.stab(V(), V(0, 1, 0), 0.016, ger.mHebel); z['shStift_' + sd] = ger.stab(V(), V(0, 1, 0), 0.016, ger.mHebel);
    z['pad_' + sd] = ger.polsterGeformt(0.07, 0.2, 0.13, V());
    const gr = new THREE.Group(); ger.gruppe.add(gr); griffRohr(ger, V(0, -0.06, 0), V(0, 0.06, 0), gr, 0.75); gr.userData.frei = V(0, 1, 0); z['shGriff_' + sd] = gr;   // dreht mit der Hand
    z['shDreh_' + sd] = P;
  }
  z.block = gewichtsblockDK(ger, V(-0.82, 0, zS), V(1, 0, 0), 1.55, 'SEITHEBEN', 'SCHULTERN');
  ger.holm(V(-0.42, 0.05, zS), V(-0.59, 0.05, zS), DK.boden);   // Seitenholm links bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 2, naben: nab.map((n) => ({ ...n })) });
  z.dkSeil.nb.forEach((n) => ger.holm(V(n.mastX, n.yE, n.mastZ), n.Wd, 0.04));   // Halter der Seilrolle am Mastkopf
}
// Bizepsmaschine / Trizepsstrecker in der DK Line: Sitz und Armpolster an denselben Stellen wie bisher, Seitenrahmen mit Lagerböcken außen (die Hebelarme bei x = ±0,3 laufen innen
// daran vorbei), Hebel silbern, Nocken außen am Lager, Stapel links mit Typenschild; das Seil läuft von beiden Nocken an den Masten hoch zur Kopfrolle des Stapels (zwei Stränge, Mittelwert).
// Der Hebel dreht um die Ellbogenachse C (Achse X); Bizeps: Stange im Untergriff am Hebelende, Trizeps: zwei senkrechte Griffe (Handflächen zueinander).
// winkel = { v0, v1 }: Richtung des Hebels (Welt, y-z) am Anfang und am Ende der Übung (aus der Vorlage), daraus folgen Ruhelage und Drehrichtung der Nocke
function armmaschineBauen(ger, z, becken, C, trizeps, winkel) {
  const XS = 0.40, oben = 2.13 - C.y, zS = C.z - 0.05;
  dkBoden(ger, XS, C.z - 0.75, C.z, C.z - 0.75, C.z);   // Seitenholme tragen Lagerböcke und Streben, der Mittelholm Sitz und Armpolster
  sitzSaeuleDK(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.42, 0.4);
  r1_scottPolster(ger, z, becken, 0.07, C.z - 0.07);   // fest, bewegt sich nicht mit dem Arm
  for (const sg of [-1, 1]) dkSeitenrahmen(ger, sg, C, oben, { y: C.y - 0.45, z: C.z - 0.75 }, XS);
  // Hebel: lokal zeigt er nach +z (Länge = Unterarm bis Faustmitte), dreht um X durch C
  const L = UNTERARM, h = new THREE.Group(); h.position.copy(C); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    holmIn(ger, h, V(sx * 0.3, 0, 0.02), V(sx * 0.3, 0, L + 0.03), 0.055, ger.mHebel);
    if (trizeps) {
      griffRohr(ger, V(sx * 0.225, -0.075, L), V(sx * 0.225, 0.075, L), h, 0.75);
      holmIn(ger, h, V(sx * 0.3, -0.085, L), V(sx * 0.225, -0.085, L), 0.032, ger.mHebel);
      holmIn(ger, h, V(sx * 0.3, -0.085, L), V(sx * 0.3, 0, L), 0.032, ger.mHebel);
    }
  }
  if (!trizeps) griffRohr(ger, V(-0.3, 0, L), V(0.3, 0, L), h, 0.62);
  // Stapel links neben der Maschine (offene Seite zum Sitz), Seil von beiden Nocken über die Masten
  z.block = gewichtsblockDK(ger, V(-0.8, 0, zS), V(1, 0, 0), 1.55, trizeps ? 'TRIZEPSSTRECKER' : 'BIZEPSMASCHINE', 'OBERARM');
  ger.holm(V(-XS, 0.05, zS), V(-0.57, 0.05, zS), DK.boden);   // Seitenholm links bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ C: V(sg * (XS + 0.08), C.y, C.z), achse: V(-1, 0, 0), e2: V(0, 1, 0), rN: 0.125, dD: oben, v0: winkel.v0, v1: winkel.v1 })) });
  z.dkSeil.nb.forEach((n) => ger.holm(V(Math.sign(n.C.x) * XS, C.y + oben, C.z), n.Wd, 0.04));   // Halter der Seilrolle am Mast
  z.am = { C, hebel: h };
}
function armmaschineStellen(z, g, hub) {
  const { C } = z.am, m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
  z.am.hebel.rotation.x = Math.atan2(-(m.y - C.y), m.z - C.z);
  const v = V(0, m.y - C.y, m.z - C.z);
  z.dkSeil.stelleV([v, v]);   // beide Nocken sitzen am selben Hebel; der Stapel hebt sich nur über das Seil
}
/* ---------- Paket R2 (Auftrag R, 09.11.2026): Zug-, Rumpf-, Hüft- und Wadenmaschinen in der DK Line ----------
   Wie die Pilotmaschinen (daten/designsprache.md): Rundrohr-Rahmen, silberne Hebel, Lagerböcke mit Goldkappe, Polster mit Goldnaht, Stapel mit Typenschild und
   Seil von Anschluss zu Anschluss (stapelAnHebel). Pose, Handwege, Polsterflächen und Griffe bleiben wie bisher. Hilfen mit Präfix r2_ */
// Polster mit Goldnaht in einer Gruppe (zum Beispiel am Hebel): Größe und Lage wie das alte Polster. ohneNaht = -1 oder +1: auf dieser Seite der dünnsten Achse fehlt die Naht
// (dort liegt der Körper an und drückt das weiche Polster ein; die Naht zählt für die Schutzhülle nicht als Polster und darf nur 2,5 cm eintauchen)
function r2_polsterIn(ger, gruppe, w, h, d, pos, q, ohneNaht) {
  const p = ger.polsterGeformt(w, h, d, pos, q); ger.gruppe.remove(p); gruppe.add(p);
  if (ohneNaht && p.children.length === 2) p.remove(p.children[ohneNaht < 0 ? 0 : 1]);
  return p;
}
// Typenschild auf einer kleinen Tafel außen an einem Pfosten (x = Außenfläche des Pfostens, Blick nach +x zur Kamera)
function r2_tafel(ger, x, y, zz, titel, untertitel) {
  ger.teil(rundGeo(0.02, 0.14, 0.26, 0.004, 1), ger.mDK, V(x + 0.01, y, zz));
  const s = ger.schild(titel, untertitel); s.rotation.y = Math.PI / 2; s.position.set(x + 0.023, y, zz); return s;
}
// Bauchmaschine / Rückenstrecker-Maschine im Sitzen: Der Oberkörper dreht um die Hüfte, also dreht der Hebel um die Hüftachse
// (Lagerböcke außen neben dem Becken) und folgt dem Rumpf. Bauch: Brustpolster und Griffe neben dem Kopf, Rolle vor den Schienbeinen;
// Rücken: Rückenpolster unter den Schulterblättern, Gurtpolster über den Oberschenkeln, Fußplatte. DK Line: Stapel links neben der Maschine,
// Seil von der Nocke am Hebel über die Rolle am Mast zum Stapel (1:1)
function rumpfmaschineBauen(ger, z, becken, bauch) {
  const k0 = rumpf(becken, { neigung: 0 }), lok = (p) => p.clone().sub(becken), XS = 0.47, oben = 0.55;   // aufrecht: Rumpf-Lage = Welt-Lage
  dkBoden(ger, XS, becken.z - 0.5, becken.z + 0.72);   // vorn vor den Zehen (bis 31.10. 10 cm weiter hinten, Zehen darauf)
  ger.holm(V(-XS, 0.05, becken.z - 0.2), V(-0.72, 0.05, becken.z - 0.2), DK.boden);   // verbindet den Bodenrahmen mit dem Sockel des Stapels
  sitzSaeuleDK(ger, V(0, becken.y - 0.115, becken.z + 0.04), 0.42, 0.44);
  for (const sg of [-1, 1]) dkSeitenrahmen(ger, sg, V(0, becken.y, becken.z), sg < 0 ? oben : 0.1, null, XS);   // Hüftlager außen; links der Mast für die Seilrolle
  const h = new THREE.Group(); h.position.copy(becken); ger.gruppe.add(h);
  const brust = lok(k0.brust), sch = { l: lok(k0.schulter.l), r: lok(k0.schulter.r) }, hm = (A, B, d) => holmIn(ger, h, A, B, d, ger.mHebel);
  if (bauch) {
    const pad = brust.clone().add(V(0, -0.06, 0.22)), hy = sch.l.y + 0.08, hz = sch.l.z + 0.22;   // Polster vor der Brust (steht gut 20 cm vor), Griffe weiter vorn (Ellbogen rund 140°)
    for (const sx of [-1, 1]) {
      const s = sx > 0 ? 'l' : 'r', gx = sch[s].x - sx * 0.04;
      hm(V(sx * 0.4, 0, 0), V(sx * 0.4, hy, 0.02), 0.055);
      hm(V(sx * 0.4, hy, 0.02), V(sx * 0.4, hy, hz + 0.09), 0.045);
      hm(V(sx * 0.4, hy, hz + 0.09), V(gx, hy, hz + 0.09), 0.035);
      griffRohr(ger, V(gx, hy, hz - 0.075), V(gx, hy, hz + 0.09), h, 0.7);
    }
    // Brustpolster vor dem Brustbein, an einem Querrohr zwischen den Armen
    hm(V(-0.4, pad.y, pad.z + 0.06), V(0.4, pad.y, pad.z + 0.06), 0.045);
    for (const sx of [-1, 1]) hm(V(sx * 0.4, pad.y, 0.02), V(sx * 0.4, pad.y, pad.z + 0.06), 0.04);
    r2_polsterIn(ger, h, 0.36, 0.2, 0.08, V(0, pad.y, pad.z), undefined, -1);   // Brust liegt an der hinteren Fläche an
    // Rolle vor den Schienbeinen (Füße eingehakt)
    ger.holm(V(0, 0.05, becken.z + 0.6), V(0, 0.2, becken.z + 0.6), DK.strebe);
    ger.holm(V(-0.2, 0.2, becken.z + 0.6), V(0.2, 0.2, becken.z + 0.6), 0.05);
    rollePolster(ger, 0.36, 0.05).position.set(0, 0.2, becken.z + 0.53);
  } else {
    const pad = brust.clone().add(V(0, -0.12, -0.17));
    for (const sx of [-1, 1]) {
      hm(V(sx * 0.41, 0, 0), V(sx * 0.33, 0, 0), 0.05);   // von der Nabe des Lagerbocks zum Arm
      hm(V(sx * 0.33, 0, 0), V(sx * 0.33, pad.y, -0.05), 0.05);
      hm(V(sx * 0.33, pad.y, -0.05), V(sx * 0.33, pad.y, pad.z - 0.06), 0.045);
    }
    hm(V(-0.33, pad.y, pad.z - 0.06), V(0.33, pad.y, pad.z - 0.06), 0.045);
    r2_polsterIn(ger, h, 0.4, 0.26, 0.08, V(0, pad.y, pad.z));
    // Gurtpolster über den Oberschenkeln, Fußplatte
    const knie = V(0, becken.y + 0.06, becken.z + 0.38);   // Gurtpolster nah am Knie: Bauch und Brust beugen sich frei darüber
    for (const sx of [-1, 1]) ger.holm(V(sx * 0.3, becken.y - 0.06, becken.z), V(sx * 0.3, knie.y + 0.12, knie.z), 0.05);
    for (const sx of [-1, 1]) ger.holm(V(sx * 0.3, knie.y + 0.12, knie.z), V(sx * 0.22, knie.y + 0.07, knie.z), 0.04);   // Polster seitlich gehalten, kein Rohr quer vor dem Bauch
    ger.polsterGeformt(0.46, 0.07, 0.14, knie.clone().add(V(0, 0.06, 0)));   // liegt auf den Oberschenkeln, drückt nicht hinein
    for (const sx of [-1, 1]) ger.holm(V(sx * 0.2, 0.04, becken.z + 0.5), V(sx * 0.2, 0.05, becken.z + 0.5), 0.05);
    ger.box(0.52, 0.03, 0.3, V(0, 0.065, becken.z + 0.5), ger.mGummi);   // Fußplatte (Oberkante 0,08)
  }
  z.block = gewichtsblockDK(ger, V(-0.95, 0, becken.z - 0.2), V(1, 0, 0), 1.55, bauch ? 'BAUCHMASCHINE' : 'RÜCKENSTRECKER', bauch ? 'BAUCH' : 'RÜCKEN', { mRolle: false });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 1, naben: [{ x: -(XS + 0.08), y: becken.y, z: becken.z, rN: 0.2, dir: bauch ? -1 : 1, dth: 0.9, dD: oben }] });   // Bauch: der Hebel dreht beim Einrollen nach vorn, Rücken: nach hinten
  ger.holm(V(-XS, becken.y + oben, becken.z), seil.nb[0].Wd, 0.04);   // Halter der Seilrolle am Mast
  z.rm = { hebel: h, dk: seil }; z.dkSeil = seil;
}
// Hebel, der um eine Achse X durch P dreht und lokal nach richt (±z) zeigt: Winkel, mit dem sein Ende auf ziel (y-z) zeigt
function hebelWinkel(P, ziel, richt = -1) { const dy = ziel.y - P.y, dz = ziel.z - P.z; return richt < 0 ? Math.atan2(dy, -dz) : Math.atan2(-dy, dz); }
// Scheibenhorn mit Hantelscheiben (Achse X) in einer Hebelgruppe
function scheibenHorn(ger, gruppe, pos, sx, n = 2, r = 0.2) {
  maschTeil(gruppe, new THREE.CylinderGeometry(0.025, 0.025, 0.07 + n * 0.045, 16), ger.mMetall, pos.x + sx * (0.035 + n * 0.0225), pos.y, pos.z).rotation.z = Math.PI / 2;
  for (let i = 0; i < n; i++) maschTeil(gruppe, scheibenGeo(r, 0.04), ger.mScheibe, pos.x + sx * (0.05 + i * 0.045), pos.y, pos.z).rotation.z = Math.PI / 2;
}
// Wadenmaschine stehend (DK Line): Stufe unter dem Vorfuß wie bisher, je Seite ein Seitenrahmen mit Lagerbock hinter den Schultern, ein silberner Hebel zum
// Schulterpolster (der Schlitten mit Polstern und Griffen fährt mit den Schultern), Stapel hinten, Seil von der Nocke am Hebel über die Rolle am Mast zum Stapel.
// Hebt sich die Ferse, hebt sich der Hebel und mit ihm der Stapel. k0 = Rumpf zu Beginn (Schultern)
function wadenmaschineBauen(ger, z, k0) {
  const XS = 0.47, oben = 0.45, y0 = k0.schulter.l.y, zb = k0.schulter.l.z - 0.14, qx = Math.abs(k0.schulter.l.x) + 0.1;   // Träger und Hebel laufen außen am Polster (x wie der Griff), nicht über dem Polster: mehr Abstand zum Kopfraum
  const C = V(0, y0 + 0.1, -0.35), strebe = { y: C.y - 0.5, z: C.z - 0.7 };
  dkBoden(ger, XS, -1.08, 0.5, -1.08, -1.08);
  // Stufe, Oberkante 0,12, nur unter dem Vorfuß (bis 31.10. 10 cm weiter hinten: Fußgewölbe 2,8 cm in der Kante)
  ger.box(0.62, 0.1, 0.26, V(0, 0.05, 0.265), ger.mRahmen); ger.box(0.6, 0.02, 0.24, V(0, 0.11, 0.265), ger.mGummi);
  for (const sx of [-1, 1]) dkSeitenrahmen(ger, sx, C, oben, strebe, XS);
  const sl = new THREE.Group(); ger.gruppe.add(sl);   // fährt mit den Schultern: Polster, Griffe, Rohre dazwischen
  for (const [s, sx] of [['l', 1], ['r', -1]]) {
    const sch = k0.schulter[s], px = sch.x + sx * 0.02, hx = sch.x + sx * 0.1;
    holmIn(ger, sl, V(sx * qx, 0.1, zb), V(sx * qx, 0.1, sch.z + 0.03), 0.045, ger.mHebel);   // Träger von hinten außen am Polster entlang bis zum Griff
    r2_polsterIn(ger, sl, 0.15, 0.07, 0.22, V(px, 0.1, sch.z));                 // Schulterpolster
    griffRohr(ger, V(hx, 0.1, sch.z + 0.03), V(hx, 0.1, sch.z + 0.17), sl, 0.7);   // Griff längs
  }
  z.block = gewichtsblockDK(ger, V(0, 0, -0.8), V(0, 0, 1), 1.55, 'WADENPRESSE', 'WADEN', { seite: true });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ x: sg * (XS + 0.08), y: C.y, z: C.z, rN: 0.2, dir: 1, dth: 0.35, dD: oben })) });
  seil.nb.forEach((n) => ger.holm(V(Math.sign(n.x) * XS, C.y + oben, C.z), n.Wd, 0.04));   // Halter der Seilrolle am Mast
  const arm = { l: ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel), r: ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel) };
  z.dkSeil = seil;
  z.wk = { sl, y0, zb, qx, P: { l: V(XS - 0.06, C.y, C.z), r: V(-(XS - 0.06), C.y, C.z) }, arm, dk: seil };
}
// Schlitten folgt den Schultern, je Seite ein Hebel vom Lager zum Schlitten; der Stapel hebt sich über die Nocken
function r2_wadenStellen(z, g) {
  const w = z.wk, y = g.schulter.l.y, th = [];
  w.sl.position.set(0, y, 0);
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const Q = V(sg * w.qx, y + 0.1, w.zb), P = w.P[s];
    seil(w.arm[s], P, Q); th.push(Math.atan2(Q.y - P.y, Q.z - P.z));
  }
  w.dk.stelle(th);
}
// Wadenmaschine sitzend (DK Line, mit Scheiben beladen, kein Stapel): Sitz, Fußblock, Hebel mit Drehpunkt vorn unten (Lagerböcke mit Goldkappe), Kniepolster
// auf den Oberschenkeln, Griffe, Scheibenhorn, Typenschild am Rahmen
function wadensitzBauen(ger, z, becken, P, polster0, stufe) {
  const XS = 0.33;
  dkBoden(ger, XS, becken.z - 0.36, P.z + 0.12, becken.z - 0.36, 0.1);   // vorderer Querholm unter dem Sitz, nicht unter den Fersen
  sitzSaeuleDK(ger, V(0, becken.y - 0.125, becken.z - 0.02), 0.42, 0.32);   // Sitz kürzer: Unten sinkt das Knie, die Sitzkante blieb sonst im Oberschenkel
  ger.box(0.5, stufe - 0.012, 0.26, V(0, (stufe - 0.012) / 2, 0.55), ger.mRahmen); ger.box(0.5, 0.012, 0.26, V(0, stufe - 0.006, 0.55), ger.mGummi);   // Fußblock: Kante direkt hinter dem Fußballen, die Ferse sinkt darunter
  for (const sx of [-1, 1]) { ger.holm(V(sx * XS, 0.05, P.z), V(sx * XS, P.y - 0.085, P.z), DK.holm); ger.lagerbock(V(sx * XS, P.y, P.z), sx); }
  r2_tafel(ger, XS + 0.0475, 0.2, P.z, 'WADENPRESSE', 'SITZEND');
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    holmIn(ger, h, V(sx * 0.27, 0, 0), V(sx * 0.27, 0, -L - 0.04), 0.05, ger.mHebel);
    griffRohr(ger, V(sx * 0.33, -0.045, -L), V(sx * 0.33, 0.105, -L), h, 0.7);   // senkrecht: quer zum Unterarm (längs lief er fast parallel dazu)
    holmIn(ger, h, V(sx * 0.27, 0.03, -L), V(sx * 0.33, 0.03, -L), 0.03, ger.mHebel);
    scheibenHorn(ger, h, V(sx * 0.3, -0.02, -L + 0.3), sx, 2, 0.2);
  }
  r2_polsterIn(ger, h, 0.46, 0.07, 0.15, V(0, 0, -L));
  z.ws = { P, hebel: h, L };
}
// Esel-Wadenheben (DK Line, mit Scheiben beladen, kein Stapel): Stufe, Griffstange vorn, Hüftpolster an einem Hebel mit Drehpunkt hinten oben (Lagerböcke
// mit Goldkappe), Scheibenhorn am Hebel, Typenschild am Rahmen
function eselBauen(ger, z, P, polster0) {
  const XS = 0.3;
  dkBoden(ger, 0.42, P.z, 1.02, 1.02, 1.02);
  ger.box(0.62, 0.1, 0.26, V(0, 0.05, 0.285), ger.mRahmen); ger.box(0.6, 0.02, 0.24, V(0, 0.11, 0.285), ger.mGummi);   // nur unter dem Vorfuß
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.36, 0.05, 0.98), V(sx * 0.36, 0.99, 0.98), DK.strebe); ger.holm(V(sx * 0.36, 0.97, 0.98), V(sx * 0.36, 0.97, 0.84), 0.05); }
  griffRohr(ger, V(-0.38, 0.97, 0.84), V(0.38, 0.97, 0.84), ger.gruppe, 0.66);
  ger.polsterGeformt(0.5, 0.06, 0.2, V(0, 1.03, 0.96));   // Unterarmpolster vorn
  for (const sx of [-1, 1]) { ger.holm(V(sx * XS, 0.05, P.z), V(sx * XS, P.y - 0.085, P.z), DK.holm); ger.lagerbock(V(sx * XS, P.y, P.z), sx); }
  r2_tafel(ger, XS + 0.0475, 0.5, P.z, 'ESEL-WADEN', 'WADEN');
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) holmIn(ger, h, V(sx * 0.24, 0, 0), V(sx * 0.24, 0, L + 0.05), 0.05, ger.mHebel);
  r2_polsterIn(ger, h, 0.44, 0.08, 0.24, V(0, -0.02, L), undefined, -1);   // Gesäß liegt an der Unterseite an
  for (const sx of [-1, 1]) scheibenHorn(ger, h, V(sx * 0.27, 0, 0.28), sx, 2, 0.2);
  z.es = { P, hebel: h };
}
// Beinbeuger stehend (DK Line): Plattform wie bisher, Rahmen vorn mit Griffen und Oberschenkelpolster, Hebel um die rechte Knieachse (Lagerbock links außen) mit Rolle
// hinter dem Knöchel; der Stapel steht links, das Seil läuft von der Nocke am Hebel über die Rolle am Mast zum Stapel (1:1)
function beincurlStehendBauen(ger, z, knie) {
  const XS = 0.33, oben = 0.45, P = V(-XS, knie.y, knie.z), rx = -0.1 + XS;   // Rolle liegt in der Welt bei x = -0,1 am Unterschenkel (rx: dieselbe Stelle am Hebel)
  dkBoden(ger, 0.4, -0.36, 0.5, 0.5, 0.5);
  ger.holm(V(-0.4, 0.05, knie.z), V(-0.72, 0.05, knie.z), DK.boden);   // verbindet den Bodenrahmen mit dem Sockel des Stapels
  ger.box(0.56, 0.08, 0.5, V(0, 0.05, 0.0), ger.mRahmen); ger.box(0.54, 0.02, 0.48, V(0, 0.095, 0.0), ger.mGummi);   // Oberkante 0,1
  ger.holm(V(0, 0.05, 0.44), V(0, 1.22, 0.44), DK.holm);
  ger.holm(V(-0.3, 1.25, 0.36), V(0.3, 1.25, 0.36), DK.strebe);
  ger.holm(V(0, 1.22, 0.44), V(0, 1.25, 0.36), DK.strebe);
  for (const sx of [-1, 1]) griffRohr(ger, V(sx * 0.18, 1.25, 0.3), V(sx * 0.3, 1.25, 0.3), ger.gruppe, 0.8);
  for (const sx of [-1, 1]) ger.holm(V(sx * 0.3, 1.25, 0.36), V(sx * 0.3, 1.25, 0.3), 0.05);
  // Oberschenkelpolster vor dem rechten Oberschenkel über dem Knie
  ger.holm(V(0, knie.y + 0.14, 0.44), V(-0.1, knie.y + 0.14, knie.z + 0.165), 0.05);   // Kappe liegt an der Polsterrückseite an
  ger.polsterGeformt(0.18, 0.14, 0.07, V(-0.1, knie.y + 0.14, knie.z + 0.105));
  dkSeitenrahmen(ger, -1, P, oben, null, XS);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = MASS.unterschenkel - 0.05, rz = -0.085;
  holmIn(ger, z.hebel, V(0.06, 0, 0), V(0.06, -L, rz), 0.055, ger.mHebel);   // Nabe des Lagerbocks liegt 6 cm innen
  holmIn(ger, z.hebel, V(0.06, -L, rz), V(rx + 0.09, -L, rz), 0.04, ger.mHebel);
  rollePolster(ger, 0.17, 0.048, z.hebel).position.set(rx, -L, rz);
  z.block = gewichtsblockDK(ger, V(-0.95, 0, knie.z), V(1, 0, 0), 1.55, 'BEINBEUGER', 'RÜCKSEITE', { mRolle: false });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 1, naben: [{ x: P.x - 0.08, y: P.y, z: P.z, rN: 0.15, dir: -1, dth: 1.7, dD: oben }] });   // der Unterschenkel dreht nach hinten
  ger.holm(V(P.x, P.y + oben, P.z), seil.nb[0].Wd, 0.04);   // Halter der Seilrolle am Mast
  // hebelStellen meldet den Winkel von +z nach +y: hinter der Waagerechten springt er von -180° auf +180°, hier fortlaufend weiterzählen
  z.dkSeil = Object.create(seil, { stelle: { value(th) { return seil.stelle([th[0] > 0 ? th[0] - 2 * Math.PI : th[0]]); } } });
}
// Glute-Kickback-Maschine (DK Line): Brustpolster, Griffstange, Hebel um die rechte Hüftachse mit Fußplatte unter der Sohle (geht mit dem Bein), Lagerbock links
// außen; der Stapel steht links, das Seil läuft von der Nocke am Hebel über die Rolle am Mast zum Stapel (1:1)
function kickbackMaschineBauen(ger, z, becken, r, huefte, bein) {
  const k = rumpf(becken, r), R = rumpfRahmen(r), XS = 0.36, oben = 0.5, P = V(-XS, huefte.y, huefte.z);
  dkBoden(ger, XS, -0.55, 0.6, 0.6, 0.6);
  ger.holm(V(-XS, 0.05, P.z), V(-0.72, 0.05, P.z), DK.boden);   // verbindet den Bodenrahmen mit dem Sockel des Stapels
  ger.box(0.5, 0.02, 0.5, V(0.08, 0.01, 0.02), ger.mGummi);
  const pad = k.brust.clone().add(R.vor.clone().multiplyScalar(0.27)).sub(R.oben.clone().multiplyScalar(0.1));   // an der Brust (steht gut 23 cm vor)
  ger.polsterGeformt(0.42, 0.44, 0.08, pad, basisAus(R.oben, R.vor));
  ger.holm(V(0, 0.05, 0.6), V(0, 1.0, 0.6), DK.holm);
  ger.holm(V(0, 0.85, 0.6), pad.clone().add(R.vor.clone().multiplyScalar(0.0725)), DK.strebe);   // Kappe liegt an der Polsterfläche an
  ger.holm(V(-0.32, 1.0, 0.6), V(0.32, 1.0, 0.6), DK.strebe);
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.32, 1.0, 0.6), V(sx * 0.32, 1.0, 0.53), 0.05); griffRohr(ger, V(sx * 0.32, 1.0, 0.53), V(sx * 0.08, 1.0, 0.53), ger.gruppe, 0.75); }
  dkSeitenrahmen(ger, -1, P, oben, null, XS);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const fx = huefte.x - P.x, tief = bein + SOHLE + 0.015;
  holmIn(ger, z.hebel, V(0.06, 0, 0), V(0.06, -tief - 0.02, 0.0), 0.055, ger.mHebel);   // Nabe des Lagerbocks liegt 6 cm innen
  holmIn(ger, z.hebel, V(0.06, -tief - 0.02, 0.0), V(fx + 0.07, -tief - 0.02, 0.0), 0.04, ger.mHebel);
  maschTeil(z.hebel, rundGeo(0.16, 0.03, 0.3, 0.008, 1), ger.mRahmen, fx, -tief, 0.05);
  maschTeil(z.hebel, rundGeo(0.15, 0.008, 0.28, 0.003, 1), ger.mGummi, fx, -tief + 0.017, 0.05);
  z.block = gewichtsblockDK(ger, V(-0.95, 0, P.z), V(1, 0, 0), 1.55, 'KICKBACK', 'GESÄSS', { mRolle: false });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 1, naben: [{ x: P.x - 0.08, y: P.y, z: P.z, rN: 0.18, dir: -1, dth: 0.9, dD: oben }] });   // das Bein schwingt nach hinten
  ger.holm(V(P.x, P.y + oben, P.z), seil.nb[0].Wd, 0.04);   // Halter der Seilrolle am Mast
  z.dkSeil = seil;
}
// Hip-Thrust-Maschine (DK Line, mit Scheiben beladen, kein Stapel): Bank für die Schulterblätter (aus der Vorlage), Fußplatte, Hebel mit Drehpunkt vorn am Boden
// (Lagerböcke mit Goldkappe), Hüftpolster mit Griffen, Scheibenhörner, Typenschild am Rahmen
function hipthrustMaschineBauen(ger, z, P, polster0) {
  const XS = 0.46;
  dkBoden(ger, XS, -0.55, P.z + 0.1, P.z + 0.1, P.z + 0.1);
  ger.box(0.72, 0.006, 0.42, V(0, 0.003, 0.62), ger.mGummi);
  for (const sx of [-1, 1]) { ger.holm(V(sx * XS, 0.05, P.z), V(sx * XS, P.y - 0.085, P.z), DK.holm); ger.lagerbock(V(sx * XS, P.y, P.z), sx); }
  r2_tafel(ger, XS + 0.0475, 0.2, P.z, 'HIP THRUST', 'GESÄSS');
  const L = polster0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  for (const sx of [-1, 1]) {
    holmIn(ger, h, V(sx * 0.4, 0, 0), V(sx * 0.4, 0, -L - 0.03), 0.055, ger.mHebel);
    holmIn(ger, h, V(sx * 0.31, 0, -L), V(sx * 0.4, 0, -L), 0.04, ger.mHebel);
    griffRohr(ger, V(sx * 0.36, -0.02, -L), V(sx * 0.36, -0.17, -L), h, 0.7);   // senkrecht unter dem Querrohr: quer zum Unterarm (längs lief er fast parallel dazu)
    scheibenHorn(ger, h, V(sx * 0.43, 0, -L + 0.12), sx, 2, 0.2);
  }
  r2_polsterIn(ger, h, 0.62, 0.09, 0.2, V(0, 0, -L));
  z.ht = { P, hebel: h };
}
// T-Bar: Lagerbock hinten am Boden (Drehachse X durch P), Stange zwischen den Beinen nach vorn, enger Griff (zwei Griffe längs,
// Handflächen zueinander) und dahinter das Scheibenhorn mit Scheiben. Lokal zeigt der Hebel nach +z, griff0 = Griffmitte zu Beginn.
// brust: Brustpolster (r, becken) und Fußplatte für das brustgestützte T-Bar-Rudern
// DK Line (R4): zwei Lagerböcke mit Goldkappe auf Rundrohr-Füßen (keine durchgehende Achse), Hebel aus silbernem Rundrohr, Hörner mit Goldkappe, geformtes Brustpolster
function tbarBauen(ger, z, P, griff0, brust) {
  for (const sx of [-1, 1]) {
    ger.lagerbock(V(sx * 0.11, P.y, P.z), sx);
    ger.holm(V(sx * 0.11, 0.05, P.z - 0.2), V(sx * 0.11, 0.05, P.z + 0.3), DK.boden);                       // Fußholm
    if (P.y - 0.085 > 0.1) ger.holm(V(sx * 0.11, 0.05, P.z), V(sx * 0.11, P.y - 0.085, P.z), DK.strebe);   // Stütze unter dem Lager
    for (const dz of [-0.2, 0.3]) ger.fussDK(V(sx * 0.11, 0, P.z + dz));
  }
  ger.holm(V(-0.11, 0.05, P.z - 0.2), V(0.11, 0.05, P.z - 0.2), DK.boden);                                   // Querholm hinten
  r4_schild(ger, ger.gruppe, V(0.11 + 0.0375 + 0.016, 0.05, P.z + 0.2), V(1, 0, 0), 'T-BAR-RUDERN', 'RÜCKEN');
  const L = griff0.distanceTo(P), h = new THREE.Group(); h.position.copy(P); ger.gruppe.add(h);
  maschTeil(h, dkZyl(0.04, 0.07, 18), ger.mHebel).rotation.z = Math.PI / 2;                                   // Nabe des Hebels zwischen den Lagern
  // brustgestützt: die Stange läuft 7 cm unter den Griffen und unter dem Polster durch bis vor den Griff
  if (brust) {
    holmIn(ger, h, V(0, -0.07, 0.03), V(0, -0.07, L + 0.26), 0.05, ger.mHebel);
    holmIn(ger, h, V(0, 0, 0), V(0, -0.07, 0.03), 0.05, ger.mHebel); holmIn(ger, h, V(0, -0.03, L - 0.06), V(0, -0.07, L - 0.06), 0.03, ger.mHebel);
  } else holmIn(ger, h, V(0, 0, 0), V(0, 0, L + 0.02), 0.05, ger.mHebel);
  // Griff: kurzes Querstück unter der Stange, zwei Griffe längs (in den Händen; unverändert)
  maschTeil(h, rundGeo(0.2, 0.03, 0.04, 0.008, 1), ger.mDK, 0, -0.03, L - 0.06);
  for (const sx of [-1, 1]) { griffRohr(ger, V(sx * 0.08, 0, L - 0.08), V(sx * 0.08, 0, L + 0.07), h, 0.8); holmIn(ger, h, V(sx * 0.08, -0.03, L - 0.08), V(sx * 0.08, 0, L - 0.08), 0.025, ger.mHebel); }
  if (!brust) {   // stehend: Scheiben am Stangenende vor dem Griff (unter dem Oberkörper), Ø 30 cm: oben bleiben sie vor der Brust
    holmIn(ger, h, V(0, 0, L + 0.12), V(0, 0, L + 0.45), 0.05, ger.mHebel);
    maschTeil(h, dkZyl(0.03, 0.012, 18), ger.mDKGold, 0, 0, L + 0.481).rotation.x = Math.PI / 2;
    maschTeil(h, dkZyl(0.045, 0.03, 20), ger.mDKGold, 0, 0, L + 0.17).rotation.x = Math.PI / 2;
    for (let i = 0; i < 2; i++) maschTeil(h, r4_scheibeGeo(0.15, 0.045), ger.mScheibe, 0, 0, L + 0.21 + i * 0.05).rotation.x = Math.PI / 2;
  } else {        // brustgestützt: Querrohr am vorderen Hebelende direkt vor dem Griff, Scheibenhörner seitlich neben dem Polster
    holmIn(ger, h, V(-0.3, -0.07, L + 0.24), V(0.3, -0.07, L + 0.24), 0.05, ger.mHebel);
    for (const sx of [-1, 1]) r4_horn(ger, h, V(sx * 0.3, -0.07, L + 0.24), sx, [[0.05, 0.17, 0.04], [0.095, 0.17, 0.04]], 0.16);
  }
  if (brust) {
    const k = rumpf(brust.becken, brust.r), R = rumpfRahmen(brust.r);
    const pad = k.brust.clone().add(R.vor.clone().multiplyScalar(0.255)).sub(R.oben.clone().multiplyScalar(0.05));   // an der Brust (gut 21 cm vor der Rumpfachse), schmal für die Ellbogen
    ger.polsterGeformt(0.24, 0.25, 0.08, pad, basisAus(R.oben, R.vor));
    const hinter = pad.clone().add(R.vor.clone().multiplyScalar(0.07));
    ger.holm(V(0, 0.05, hinter.z + 0.5), hinter.clone().add(R.oben.clone().multiplyScalar(0.08)), DK.boden);
    ger.holm(V(0, 0.05, hinter.z + 0.5), V(0, 0.05, P.z), DK.boden);
    for (const sx of [-1, 1]) { ger.holm(V(sx * 0.32, 0.05, P.z + 0.1), V(sx * 0.32, 0.05, hinter.z + 0.58), DK.boden); for (const zz of [P.z + 0.1, hinter.z + 0.58]) ger.fussDK(V(sx * 0.32, 0, zz)); }
    ger.holm(V(-0.32, 0.05, hinter.z + 0.58), V(0.32, 0.05, hinter.z + 0.58), DK.boden);
    ger.box(0.62, 0.006, 0.34, V(0, 0.003, TB_FUSS_Z), ger.mGummi);   // Gummimatte unter den Füßen
  }
  z.tb = { P, hebel: h };
}
// Hyperextension 45°: Rahmen mit schrägem Hauptholm, zwei Hüftpolster vorn oben, Fußplatte senkrecht zu den Beinen mit Rollen hinter
// den Waden. fuss = Knöchel (Mitte), bein = Richtung Knöchel → Hüfte
// DK Line (R4): Hauptholm Ø 8 cm, Rundrohr-Bodenrahmen mit Gummifüßen, Hüftpolster geformt, Rollenachse silbern, Typenschild am Hauptholm
function hyperBauen(ger, fuss, becken, bein) {
  const hinten = V(0, bein.z, -bein.y);   // Rückseite der Waden (nach oben-hinten)
  const zr = fuss.z - 0.25, zv = becken.z + 0.7;
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.3, 0.05, zr), V(sx * 0.3, 0.05, zv), DK.boden); for (const zz of [zr, (zr + zv) / 2, zv]) ger.fussDK(V(sx * 0.3, 0, zz)); }
  for (const zz of [zr, zv]) ger.holm(V(-0.3, 0.05, zz), V(0.3, 0.05, zz), DK.boden);
  const fussMitte = fuss.clone().sub(bein.clone().multiplyScalar(SOHLE + 0.015)).add(hinten.clone().multiplyScalar(-0.05));
  // Hüftpolster: schräg (45°) vor den Oberschenkeln, Oberkante knapp unter der Hüftbeuge: der Bauch klappt darüber
  const pad = becken.clone().add(V(0, -0.07, 0.11)).sub(bein.clone().multiplyScalar(0.3)).sub(hinten.clone().multiplyScalar(0.14)), q = basisAus(bein, hinten.clone().negate());
  const knoten = V(0, becken.y - 0.33, becken.z - 0.02);
  ger.holm(V(0, 0.05, fuss.z - 0.2), knoten, 0.08);                                // Hauptholm
  ger.holm(V(0, 0.05, becken.z + 0.62), knoten, DK.boden);                         // Stütze vorn, weit vorn am Boden: der Rumpf hängt frei davor
  ger.holm(knoten, pad.clone().add(hinten.clone().multiplyScalar(0.03)), DK.strebe);   // Träger endet im Polster
  ger.polster(0.5, 0.03, 0.34, fussMitte, basisAus(bein, hinten.clone().negate()), ger.mGummi);   // Fußplatte (Körperkontakt, unverändert)
  ger.holm(V(0, 0.05, fussMitte.z - 0.05), fussMitte.clone().sub(bein.clone().multiplyScalar(0.03)), DK.strebe);
  const rolle = fuss.clone().add(bein.clone().multiplyScalar(0.1)).add(hinten.clone().multiplyScalar(0.075));
  for (const sx of [-1, 1]) rollePolster(ger, 0.16, 0.045).position.copy(rolle).add(V(sx * 0.1, 0, 0));
  ger.holm(V(-0.2, rolle.y, rolle.z), V(0.2, rolle.y, rolle.z), 0.03, ger.mHebel);   // Achse der Rollen
  ger.holm(fussMitte.clone().add(hinten.clone().multiplyScalar(0.08)), V(0, rolle.y, rolle.z), 0.04, ger.mHebel);
  for (const sx of [-1, 1]) ger.polsterGeformt(0.17, 0.3, 0.08, pad.clone().add(V(sx * 0.1, 0, 0)), q);
  r4_schild(ger, ger.gruppe, V(0.04 + 0.016, 0.1 + (knoten.y - 0.1) * 0.45, fuss.z - 0.2 + (knoten.z - fuss.z + 0.2) * 0.45), V(1, 0, 0), 'RÜCKENSTRECKER', 'RÜCKEN');
}
// Glute Ham Raise (GHD): langer Rahmen, rundes Kniepolster vorn, Fußplatte hinten mit zwei Rollen um die Knöchel
// DK Line (R4): Mittelholm mit Querrohr unter dem Kniepolster (das Polster liegt auf, ohne einzusinken), Rundrohr-Rahmen, Rollen am Silberrahmen, Typenschild
function ghdBauen(ger, knie, fussZ, fussY) {
  const zv = 0.45, zr = fussZ - 0.25;
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.3, 0.05, zr), V(sx * 0.3, 0.05, zv), DK.boden); for (const zz of [zr, (zr + zv) / 2, zv]) ger.fussDK(V(sx * 0.3, 0, zz)); }
  for (const zz of [zr, zv]) ger.holm(V(-0.3, 0.05, zz), V(0.3, 0.05, zz), DK.boden);
  const yB = knie.y - 0.23, yQ = yB - 0.11 - 0.0225;   // Kniepolster (r = 11 cm) liegt oben auf dem Querrohr
  ger.holm(V(0, 0.05, 0.12), V(0, yQ, 0.12), DK.holm);                                          // vordere Stütze
  ger.holm(V(0, 0.05, fussZ - 0.12), V(0, fussY + 0.08, fussZ - 0.12), DK.holm);                // hintere Stütze
  ger.holm(V(0, yQ, 0.12), V(0, yQ, fussZ - 0.12), DK.strebe);                                  // Längsholm
  ger.holm(V(-0.2, yQ, 0.2), V(0.2, yQ, 0.2), 0.045, ger.mHebel);                               // Querrohr, trägt das Polster
  ger.holm(V(0, yQ, 0.12), V(0, yQ, 0.2), 0.045);
  // runder Buckel unter den Oberschenkeln kurz vor dem Knie (Körperkontakt, unverändert) mit goldenen Endkappen
  maschTeil(ger.gruppe, new THREE.CylinderGeometry(0.11, 0.11, 0.44, 28), ger.mPolster, 0, yB, 0.2).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) maschTeil(ger.gruppe, dkZyl(0.1, 0.012, 24), ger.mDKGold, sx * 0.226, yB, 0.2).rotation.z = Math.PI / 2;
  ger.box(0.4, 0.26, 0.03, V(0, fussY + 0.02, fussZ - 0.11), ger.mGummi);                       // Fußplatte hinter den Fußsohlen (unverändert)
  // untere Rolle liegt vorn am Schienbein an, nicht darin
  for (const [dy, dz] of [[0.075, 0.0], [-0.105, 0.03]]) { const r = rollePolster(ger, 0.36, 0.045); r.position.set(0, fussY + dy, fussZ + 0.06 + dz); }
  for (const sx of [-1, 1]) {   // je Seite ein Silberarm von der Fußplatte zu beiden Rollen (die untere Rolle hing bisher frei)
    ger.holm(V(sx * 0.2, fussY - 0.105, fussZ - 0.11), V(sx * 0.2, fussY + 0.075, fussZ + 0.06), 0.035, ger.mHebel);
    ger.holm(V(sx * 0.2, fussY - 0.105, fussZ - 0.11), V(sx * 0.2, fussY - 0.105, fussZ + 0.09), 0.035, ger.mHebel);
  }
  r4_schild(ger, ger.gruppe, V(0.0475 + 0.016, 0.55, fussZ - 0.12), V(1, 0, 0), 'GHD', 'RÜCKSEITE');
}
// Reverse Hyperextension auf der Bank: hohe, stabile Bank mit Griffen vorn, ohne Pendel und ohne Gewicht (so steht es im Text; bis 5.11. Maschine mit Pendel und Scheiben). Hinten ist die Bank offen, die Beine schwingen frei
// DK Line (R4): Bank mit Rundrohr-Rahmen, geformtes Polster (unverändert in Lage und Größe), Griffe wie bisher auf Rundrohr-Pfosten, Typenschild am Mittelpfosten
function reverseHyperBauen(ger, z, becken, griffZ) {
  const zr = griffZ - 0.15, zv = becken.z - 0.1;   // endet vor den Füßen
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.36, 0.05, zr), V(sx * 0.36, 0.05, zv), DK.boden); for (const zz of [zr, (zr + zv) / 2, zv]) ger.fussDK(V(sx * 0.36, 0, zz)); }
  for (const zz of [zr, zv]) ger.holm(V(-0.36, 0.05, zz), V(0.36, 0.05, zz), DK.boden);
  // Polster so hoch, dass die Brust (24,5 cm vor der Wirbelsäule) aufliegt; Griffe seitlich neben dem Polster auf eigenen Pfosten
  const oben = becken.y - 0.23;
  ger.polsterGeformt(0.42, 0.08, 0.9, V(0, oben - 0.04, becken.z - 0.57));   // endet vor der Leiste: Oberschenkel hängen frei
  for (const sz of [griffZ + 0.05, becken.z - 0.2]) ger.holm(V(0, 0.05, sz), V(0, oben - 0.08 - 0.0475, sz), DK.holm);
  ger.holm(V(0, oben - 0.08 - 0.0475, griffZ + 0.05), V(0, oben - 0.08 - 0.0475, becken.z - 0.2), DK.strebe);   // Längsholm unter dem Polster
  const gy = becken.y - 0.23;   // Griffe auf Höhe der Polsteroberkante
  for (const sx of [-1, 1]) { ger.holm(V(sx * 0.27, 0.05, griffZ + 0.05), V(sx * 0.27, gy - 0.02, griffZ + 0.05), DK.boden); ger.holm(V(sx * 0.27, gy - 0.02, griffZ + 0.05), V(sx * 0.27, gy - 0.02, griffZ - 0.04), 0.045); griffRohr(ger, V(sx * 0.27, gy, griffZ - 0.12), V(sx * 0.27, gy, griffZ + 0.02), ger.gruppe, 0.75); }
  r4_schild(ger, ger.gruppe, V(0.0475 + 0.016, 0.5, griffZ + 0.05), V(1, 0, 0), 'REVERSE-HYPER', 'GESÄSS, RÜCKEN');
}
// Belt Squat: Plattform mit Gummiauflage und Schlitz, zwei Säulen mit Griffstange, Gewichtsblock vorn, Kabel unter der Plattform zur Kette
const BELT_ROLLE_Z = 0.03;   // Die Kette läuft vom Gurt senkrecht nach unten zwischen den Beinen zur Rolle im Boden (bis 5.11. 16 cm vor den Füßen)
// DK Line (R4): Plattform aus zwei Graphit-Deckplatten mit Gummiauflage (Körperkontakt wie bisher) und offenem Schlitz für die Kette, Rundrohr-Rahmen mit Gummifüßen, Haltesäulen mit Griffen (unverändert).
// Kein Stapel und kein Seil: Die Kette der Vorlage läuft durch den Schlitz über eine Rolle, unter der Plattform zu einer Säule links und dort hoch zu einem Gewichtsträger (silberne Gleithülsen auf
// zwei Chromstangen, Horn mit Goldkappe und Scheiben). z.block.heben(h) setzt die Höhe des Trägers; die Vorlage ruft es in jedem Bild auf
function beltBauen(ger, z) {
  const z0 = BELT_ROLLE_Z, xc = -0.74, yC = 0.4;
  r4_boden(ger, 0.45, -0.4, 0.5);
  for (const zz of [-0.25, 0.25]) ger.holm(V(xc, 0.05, zz), V(0.45, 0.05, zz), DK.boden);   // Querholme unter den Deckplatten, bis zur Säule links
  ger.holm(V(-0.45, 0.05, 0.42), V(0.45, 0.05, 0.42), DK.boden);                              // Querholm unter den Haltesäulen
  ger.holm(V(xc, 0.05, -0.25), V(xc, 0.05, 0.25), DK.boden);                                  // Fußholm der Gewichtssäule
  for (const zz of [-0.25, 0.25]) ger.fussDK(V(xc, 0, zz));
  for (const sx of [-1, 1]) {
    ger.box(0.36, 0.06, 0.56, V(sx * 0.21, 0.1, 0), ger.mDK);                                 // Deckplatte
    ger.box(0.36, 0.015, 0.56, V(sx * 0.21, 0.1375, 0), ger.mGummi);                          // Gummiauflage (Körperkontakt, unverändert)
    ger.holm(V(sx * 0.32, 0.05, 0.42), V(sx * 0.32, 1.13, 0.42), DK.holm);                    // Haltesäule
    ger.holm(V(sx * 0.32, 1.13, 0.42), V(sx * 0.32, 1.13, 0.38), 0.05);
    griffRohr(ger, V(sx * 0.34, 1.13, 0.38), V(sx * 0.12, 1.13, 0.38), ger.gruppe, 0.75);       // Griffe (unverändert)
  }
  ger.holm(V(-0.12, 1.13, 0.38), V(0.12, 1.13, 0.38), 0.04);
  r4_schild(ger, ger.gruppe, V(0.32 + 0.0475 + 0.016, 0.7, 0.42), V(1, 0, 0), 'BELT SQUAT', 'BEINE, GESÄSS');
  // Rolle im Schlitz (Oberkante y = 0,14: dort endet die Kette der Vorlage), Kette unter der linken Deckplatte zur Rolle am Fuß der Säule und links um sie herum nach oben
  ger.holm(V(-0.05, 0.035, z0), V(0.05, 0.035, z0), 0.05);
  ger.rolleDK(V(0, 0.1, z0), V(1, 0, 0), 0.04);
  const kette = (A, B) => ger.stab(A, B, 0.01, ger.mMetall);
  const r1b = [V(0, 0.14, z0), V(-0.0283, 0.1283, z0), V(-0.04, 0.1, z0), V(-0.0283, 0.0717, z0), V(0, 0.06, z0)];
  for (let i = 0; i < r1b.length - 1; i++) kette(r1b[i], r1b[i + 1]);
  kette(V(0, 0.06, z0), V(xc + 0.04, 0.06, z0));
  ger.rolleDK(V(xc + 0.04, 0.1, z0), V(0, 0, 1), 0.04);
  const r2 = [V(xc + 0.04, 0.06, z0), V(xc + 0.04 - 0.0283, 0.0717, z0), V(xc, 0.1, z0)];
  for (let i = 0; i < r2.length - 1; i++) kette(r2[i], r2[i + 1]);
  // Gewichtssäule: zwei Rohre mit Kopfholm, dazwischen zwei Chromstangen; der Träger gleitet mit Hülsen darauf
  for (const sz of [-1, 1]) {
    ger.holm(V(xc, 0.05, z0 + sz * 0.14), V(xc, 1.0, z0 + sz * 0.14), DK.strebe);
    ger.stab(V(xc, 0.0875, z0 + sz * 0.07), V(xc, 0.975, z0 + sz * 0.07), 0.012, ger.mMetall);
  }
  ger.holm(V(xc, 1.0, z0 - 0.14), V(xc, 1.0, z0 + 0.14), DK.strebe);
  const kw = new THREE.Group(); kw.position.set(xc, yC, z0); ger.gruppe.add(kw);
  for (const sz of [-1, 1]) {
    maschTeil(kw, dkZyl(0.03, 0.12, 20), ger.mHebel, 0, 0, sz * 0.07);                        // Gleithülse (gleiche Achse wie die Chromstange)
    for (const dy of [-0.066, 0.066]) maschTeil(kw, dkZyl(0.034, 0.012, 20), ger.mDKGold, 0, dy, sz * 0.07);
  }
  holmIn(ger, kw, V(0, 0, -0.07), V(0, 0, 0.07), 0.05, ger.mHebel);                           // Querstück zwischen den Hülsen
  maschTeil(kw, new THREE.SphereGeometry(0.014, 12, 8), ger.mDKGold, 0, -0.045, 0);           // Öse für die Kette
  r4_horn(ger, kw, V(0, 0, 0), -1, [[0.12, 0.2, 0.05], [0.175, 0.2, 0.05], [0.23, 0.18, 0.05]], 0.34);
  const kV = kette(V(xc, 0.1, z0), V(xc, 0.2, z0)), A0 = V(xc, 0.1, z0);   // senkrechtes Kettenstück von der Rolle zur Öse (länger, wenn der Träger steigt)
  z.block = { heben(h) { const y = yC + Math.max(0, Math.min(0.3, h)); kw.position.y = y; seil(kV, A0, V(xc, y - 0.059, z0)); } };
  z.block.heben(0);
}
// Schrägbank für Übungen mit der Brust auf dem Polster (brustgestütztes Rudern, Spider Curl, Y-Heben, Reverse Flys): das Polster liegt
// am Oberkörper entlang vom Bauch bis zur oberen Brust, darunter ein Holm auf zwei Stützen mit Füßen
function brustbankBauen(ger, becken, r, vorAb = 0.27) {   // vorAb = Polster so weit vor der Wirbelsäule (m)
  const R = rumpfRahmen(r), vor = R.vor.clone().multiplyScalar(vorAb);   // Polster liegt an der Brust (Brust steht gut 20 cm vor der Wirbelsäule)
  const a = becken.clone().add(R.oben.clone().multiplyScalar(0.2)).add(vor), e = becken.clone().add(R.oben.clone().multiplyScalar(0.56)).add(vor);
  ger.polster(0.36, a.distanceTo(e), 0.08, a.clone().lerp(e, 0.5), basisAus(R.oben, R.vor));
  const h = R.vor.clone().multiplyScalar(0.075), oben = e.clone().add(h).sub(R.oben.clone().multiplyScalar(0.08)), unten = a.clone().add(h).add(R.oben.clone().multiplyScalar(0.05));
  ger.vierkant(unten, oben, 0.07);
  for (const p of [oben, unten]) { ger.vierkant(V(0, 0.05, p.z), p, 0.07); ger.vierkant(V(-0.26, 0.035, p.z), V(0.26, 0.035, p.z), 0.07); }
}
// Schrägbank (Rückenlage, Becken bei becken, Rumpf r): Sitz unter dem Gesäß, Lehne liegt an Gesäß und Schulterblättern an. Der Rücken
// steht bei der Figur bis 11,7 cm hinter der Linie Becken → Brust (Schulterblätter, Gesäß), die Lendenwirbelsäule hohl
function schraegbankBauen(ger, becken, r) {
  const R = rumpfRahmen(r), hinten = R.vor.clone().multiplyScalar(-(0.11 + 0.035));
  const a = becken.clone().add(R.oben.clone().multiplyScalar(0.02)).add(hinten), e = becken.clone().add(R.oben.clone().multiplyScalar(0.8)).add(hinten);
  ger.polster(0.3, a.distanceTo(e), 0.07, a.clone().lerp(e, 0.5), basisAus(R.oben, R.vor));
  const sitzY = becken.y - 0.115;
  ger.polster(0.3, 0.07, 0.36, V(0, sitzY - 0.035, becken.z + 0.06));
  // Gestell: Säule unter dem Sitz, Strebe unter die Lehne, Fußträger
  const lehne = a.clone().lerp(e, 0.45).add(R.vor.clone().multiplyScalar(-0.045));
  ger.vierkant(V(0, 0.05, becken.z + 0.06), V(0, sitzY - 0.07, becken.z + 0.06), 0.07);
  ger.vierkant(V(0, 0.05, lehne.z), lehne, 0.07);
  ger.vierkant(V(0, 0.035, becken.z + 0.3), V(0, 0.035, lehne.z - 0.1), 0.07);
  for (const zz of [becken.z + 0.3, lehne.z - 0.1]) ger.vierkant(V(-0.24, 0.035, zz), V(0.24, 0.035, zz), 0.07);
}
// Dip-Station: je Seite ein Holm mit Gummigriff (vorn), zwei Stützen und ein Fuß; y = Höhe der Holme, zMitte = Mitte der Holme
// DK Line (R4): je Seite Griff wie bisher (Chrom mit Gummi), Stützen und Fuß aus Rundrohr mit Gummifüßen, Typenschild an der Stütze
function dipBarrenBauen(ger, y = 1.25, zMitte = 0.05, x = 0.27) {
  for (const sx of [-1, 1]) {
    const hinten = V(sx * x, y, zMitte - 0.32), vorn = V(sx * x, y, zMitte + 0.3), xs = sx * (x + 0.04);
    griffRohr(ger, hinten, vorn, ger.gruppe, 0.5);
    for (const zz of [zMitte - 0.26, zMitte + 0.22]) {
      ger.holm(V(xs, 0.05, zz), V(xs, y - 0.02, zz), DK.boden);                    // Stütze
      ger.teil(dkZyl(0.045, 0.012, 20), ger.mDKGold, V(xs, 0.4, zz));
      ger.holm(V(xs, y - 0.02, zz), V(sx * x, y - 0.02, zz), 0.045);               // Arm zum Griff
    }
    ger.holm(V(xs, 0.05, zMitte - 0.4), V(xs, 0.05, zMitte + 0.36), DK.boden);     // Fußholm
    for (const zz of [zMitte - 0.4, zMitte + 0.36]) ger.fussDK(V(xs, 0, zz));
  }
  for (const zz of [zMitte - 0.4, zMitte + 0.36]) ger.holm(V(-x - 0.04, 0.05, zz), V(x + 0.04, 0.05, zz), DK.boden);
  r4_schild(ger, ger.gruppe, V(x + 0.04 + 0.0375 + 0.016, 0.8, zMitte + 0.22), V(1, 0, 0), 'DIP-BARREN', 'TRIZEPS, BRUST');
}
// Trap Bar (Sechseck): Rahmen um den Trainierenden, Griffe innen links und rechts (längs, Neutralgriff), Hülsen mit Scheiben
function trapBar(ger) {
  // Ursprung = Griffe; Rahmen und Scheiben hängen 6 cm darunter (hohe Griffe, damit die Hüfte beim Start tiefer stehen kann)
  const g = new THREE.Group(), r = 0.016, y0 = -0.06;
  const ecken = [V(0.36, y0, -0.2), V(0.36, y0, 0.2), V(0, y0, 0.42), V(-0.36, y0, 0.2), V(-0.36, y0, -0.2), V(0, y0, -0.42)];
  ecken.forEach((p, i) => { const q = ecken[(i + 1) % 6]; const o = maschTeil(g, new THREE.CylinderGeometry(r, r, p.distanceTo(q), 14), ger.mMetall); legeLaengs(o, p, q); });
  for (const sx of [-1, 1]) {
    griffRohr(ger, V(sx * 0.29, 0, -0.1), V(sx * 0.29, 0, 0.1), g, 0.7);
    for (const zz of [-0.1, 0.1]) { const b = V(sx * 0.36, y0, zz), a = V(sx * 0.29, 0, zz); legeLaengs(maschTeil(g, new THREE.CylinderGeometry(0.013, 0.013, a.distanceTo(b), 12), ger.mMetall), a, b); }
    legeLaengs(maschTeil(g, new THREE.CylinderGeometry(0.025, 0.025, 0.4, 16), ger.mMetall), V(sx * 0.36, y0, 0), V(sx * 0.76, y0, 0));
    maschTeil(g, new THREE.CylinderGeometry(0.04, 0.04, 0.02, 18), ger.mMetall, sx * 0.4, y0, 0).rotation.z = Math.PI / 2;
    for (let i = 0; i < 2; i++) maschTeil(g, scheibenGeo(0.225, 0.045), ger.mScheibe, sx * (0.44 + i * 0.05), y0, 0).rotation.z = Math.PI / 2;
  }
  ger.gruppe.add(g); return g;
}
// Butterfly (Brust) bzw. Reverse Butterfly (hintere Schulter) in der DK Line: Drehachsen senkrecht über den Schultern, die Hebel laufen oben waagrecht zum Griff hinüber und hängen dort
// senkrecht herab (sie drehen um die Schulter, um den Körper herum). richtung = 1: Figur sitzt mit dem Rücken zum Polster (Butterfly), -1: Brust am Polster (Reverse).
// DK Line: Säule aus Rundrohr auf dem Bodenrahmen, je Seite Lagergehäuse mit Nabe (Arme unten) und Goldkappe, darüber die Nocke; der Stapel steht hinter der Säule (bei Reverse davor),
// das Seil läuft waagrecht über die Säule zur Kopfrolle (kein Mast nötig); die Hebelwinkel stehen in den Vorlagen (Butterfly 80° bis -13°, Reverse 8° bis 86°, von +z nach außen)
function butterflyBauen(ger, z, becken, r, richtung) {
  // Reverse: Drehachsen auf 2,14 m (die stehende Figur geht beim Hereinkommen unter den Lagern durch, mindestens 5 cm über dem Hutraum), Verkleidung 1,70 m: Kopfrolle auf 2,32 m knapp über den Nocken (2,28 m)
  const R = rumpfRahmen(r), k = rumpf(becken, r), XS = 0.42, yP = richtung > 0 ? 1.88 : 2.14, F = richtung > 0 ? 1.48 : 1.70;   // Butterfly: Achsen auf 1,88 m, Kopfrolle auf 2,10 m, Nocken auf 2,02 m
  sitzSaeuleDK(ger, V(0, becken.y - 0.115, becken.z + 0.02 * richtung), 0.44, 0.42);
  const lehne = richtung > 0 ? becken.clone().add(R.oben.clone().multiplyScalar(0.36)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045))
    : becken.clone().add(R.oben.clone().multiplyScalar(0.36)).add(R.vor.clone().multiplyScalar(0.245 + 0.045));   // Brustpolster vor der Brust, endet über dem Schoß
  ger.polsterGeformt(richtung > 0 ? 0.4 : 0.32, richtung > 0 ? 0.66 : 0.38, 0.09, lehne, basisAus(R.oben, R.vor));
  const saeule = V(0, 0, lehne.z - 0.25 * richtung), zS = saeule.z - richtung * 0.35;
  if (richtung > 0) dkBoden(ger, XS, saeule.z, 0.2, saeule.z, 0.2);   // Säule steht auf dem hinteren Querholm
  else { dkBoden(ger, XS, -0.7, 0, -0.7, 0); ger.holm(V(0, 0.05, 0), V(0, 0.05, saeule.z), DK.boden); ger.fussDK(V(0, 0, saeule.z)); }   // Mittelholm bis zur Säule (die Füße stehen daneben)
  ger.holm(V(0, 0.05, saeule.z), V(0, yP + 0.06, saeule.z), DK.holm);   // Säule bis zur Höhe der Lagergehäuse
  ger.holm(V(0, lehne.y, saeule.z), lehne.clone().sub(R.vor.clone().multiplyScalar(0.0775 * richtung)), DK.strebe);   // Strebe zum Polster, die Kappe liegt an
  const w0 = (richtung > 0 ? 80 : 8) * RAD, w1 = (richtung > 0 ? -13 : 86) * RAD, nab = [];
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const P = V(k.schulter[s].x, yP, k.schulter[s].z), Ph = P.clone().add(V(0, 0.06, 0)), C = P.clone().add(V(0, 0.14, 0));
    r1_lager(ger, Ph, V(0, 1, 0), -1);   // Nabe unten (Arme), Gehäuse, Goldkappe oben; darüber die Nocke
    ger.holm(V(0, Ph.y, saeule.z), V(P.x, Ph.y, P.z - richtung * 0.1145), DK.strebe);   // Halter von der Säule, die Kappe liegt an der Rückseite des Gehäuses an
    nab.push({ C, achse: V(0, sg, 0), e2: V(0, 0, -richtung), rN: 0.17, direkt: true, v0: V(sg * Math.sin(w0), 0, Math.cos(w0)), v1: V(sg * Math.sin(w1), 0, Math.cos(w1)) });
    z['bfArm_' + s] = ger.stab(V(), V(0, 1, 0), 0.028, ger.mHebel);
    z['bfQuer_' + s] = ger.stab(V(), V(0, 1, 0), 0.026, ger.mHebel);
    const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); z['bfGriff_' + s] = g;
    z['bfDreh_' + s] = P;
  }
  z.block = gewichtsblockDK(ger, V(0, 0, zS), V(0, 0, richtung), F, richtung > 0 ? 'BUTTERFLY' : 'REVERSE BUTTERFLY', richtung > 0 ? 'BRUST' : 'HINTERE SCHULTER', { seite: true });
  ger.holm(V(0, 0.05, saeule.z), V(0, 0.05, zS + richtung * 0.23), DK.boden);   // Mittelholm bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 2, naben: nab });
  z.bf = { richtung };
}
function butterflyStellen(z, g, hub) {
  const vek = [];
  for (const s of ['l', 'r']) {
    const P = z['bfDreh_' + s], h = g.hand[s], ueber = V(h.x, P.y, h.z);   // über dem Griff, in Höhe des Drehlagers
    seil(z['bfQuer_' + s], P, ueber);
    seil(z['bfArm_' + s], ueber, V(h.x, h.y + 0.09, h.z));
    z['bfGriff_' + s].position.copy(h); z['bfGriff_' + s].quaternion.identity();
    vek.push(V(ueber.x - P.x, 0, ueber.z - P.z));   // Richtung des Hebels von oben gesehen
  }
  z.dkSeil.stelleV(vek);   // der Stapel hebt sich nur über das Seil
}

// Latzugstange: breit/normal mit abgewinkelten Enden und Gummigriffen, 'gerade' (Untergriff) oder 'parallel' (eng, Neutralgriff:
// zwei Griffe quer zur Stange). Achse X, Mitte im Ursprung (stangeAn legt sie zwischen die Fäuste), Öse (DK Line: Gold) für den Karabiner oben
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
      ende.rotation.z = -sx * (Math.PI / 2 + 0.27);   // Enden zeigen nach außen-unten und schließen an die Mitte an (bis 5.11. nach oben, mit Lücke zur Mitte)
      const gr = maschTeil(g, new THREE.CylinderGeometry(0.019, 0.019, 0.16, 14), ger.mGummi, sx * breite, -0.035);
      gr.rotation.z = -sx * (Math.PI / 2 + 0.27);
    }
  }
  maschTeil(g, new THREE.TorusGeometry(0.02, 0.005, 8, 16), ger.mDKGold, 0, 0.035);
  ger.gruppe.add(g); return g;
}
// Latzugstation (DK Line): Sitz und Knierolle wie bisher (Rundrohr), der Stapel steht vorn quer (Fenster und Typenschild zur Kamera), ein Ausleger mit Rolle
// über der Stange; das Seil läuft von der Öse an der Stange über die Rolle am Ausleger zur Kopfrolle des Stapels und über die bewegliche Rolle zur festen Öse
// (2:1: wird das Seil zwischen Stange und Rolle um d länger, steigt der Stapel um d/2). Die Länge setzt r2_latzugStellen
function latzugBauen(ger, z, stangeZ) {
  const hMax = 0.45, F = 1.7, zS = 0.98, dD = 0.14;
  dkBoden(ger, 0.36, -0.32, 0.66);
  sitzSaeuleDK(ger, V(0, 0.435, -0.02), 0.44, 0.42);
  z.block = gewichtsblockDK(ger, V(0, 0, zS), V(1, 0, 0), F, 'LATZUG', 'RÜCKEN', { hMax });
  const yG = z.block.yG;
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [{ zug: true, x: 0, y: yG - dD, z: stangeZ, rN: 0, dir: 1, dD }] });
  const Wd = seil.nb[0].Wd;
  ger.holm(V(-0.075, yG - 0.01, zS - 0.23), V(-0.075, yG - 0.01, Wd.z), DK.strebe);   // Ausleger vom Rollenkopf des Stapels nach vorn über den Kopf
  ger.holm(V(-0.075, yG, Wd.z), Wd, 0.045);   // Halter der Rolle am Ende
  ger.holm(V(0, 0.05, 0.66), V(0, 0.665, 0.66), DK.strebe);   // Halter der Knierolle: Pfosten auf dem vorderen Querholm, Arm bis an die Rolle (Kappe liegt an)
  ger.holm(V(0, 0.665, 0.66), V(0, 0.665, 0.18 + 0.0325), DK.strebe);
  rollePolster(ger, 0.42, 0.05).position.set(0, 0.665, 0.13);
  z.lz = { aus: seil.nb[0].T.clone(), dk: seil, kugel: ger.teil(new THREE.SphereGeometry(0.012, 12, 8), ger.mDKGold) }; z.dkTurm = [seil];   // goldene Seilkugel am Seilende an der Stange
}
// Seil von der Austrittsstelle an der Rolle zur Öse der Stange; der Stapel hebt sich mit der Seillänge
function r2_latzugStellen(z) {
  const oese = z.lh.position.clone().add(V(0, 0.04, 0));
  seil(z.seil, z.lz.aus, oese); z.seil_l = z.seil; z.lz.kugel.position.copy(oese);   // Handseil unter dem Namen der Kabeltürme (Messwerkzeug)
  z.lz.dk.stelle([oese.distanceTo(z.lz.aus)]);
}
// Hebel-Latzug (DK Line): Seitenrahmen mit Lagerböcken um die Achse LH_C (Kreisbogen der Griffe), silberne Arme mit Schwenkgriffen, Sitz und Knierolle wie bisher,
// Stapel hinten, Seil von den Nocken über die Rollen an den Masten zum Stapel
function r2_latzugHebelBauen(ger, z) {
  const C = LH_C, oben = 0.45, stackZ = -0.8, strebe = C.y > 0.8 ? { y: C.y - 0.45, z: C.z + 0.75 } : null;
  dkBoden(ger, DK.achse, -1.08, 0.7, stackZ + 0.23);
  sitzSaeuleDK(ger, V(0, 0.435, -0.02), 0.44, 0.42);
  ger.holm(V(0, 0.05, 0.55), V(0, 0.665, 0.55), DK.strebe);   // Halter der Knierolle (Kappe liegt an der Rolle an)
  ger.holm(V(0, 0.665, 0.55), V(0, 0.665, 0.18 + 0.0325), DK.strebe);
  rollePolster(ger, 0.42, 0.05).position.set(0, 0.665, 0.13);
  for (const sx of [-1, 1]) {
    const sd = sx > 0 ? 'l' : 'r';
    dkSeitenrahmen(ger, sx, C, oben, strebe);
    z['dmArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel); z['dmQuer_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mHebel);
    const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); g.userData.frei = V(0, 1, 0); z['dmGriff_' + sd] = g;   // Schwenkgriffe
  }
  z.block = gewichtsblockDK(ger, V(0, 0, stackZ), V(0, 0, 1), 1.55, 'LATZUG', 'RÜCKEN', { seite: true });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ x: sg * (DK.achse + 0.08), y: C.y, z: C.z, rN: 0.22, dir: -1, dth: 0.9, dD: oben })) });
  seil.nb.forEach((n) => ger.holm(V(Math.sign(n.x) * DK.achse, C.y + oben, C.z), n.Wd, 0.04));   // Halter der Seilrolle am Mast
  z.dkSeil = seil; z.dm = { C, griff: 'laengs', x: 0.44, dk: seil };
}
// Unterstützungsmaschine (Klimmzug bzw. Dips mit Kniepolster, DK Line): hoher Rahmen aus Rundrohr (Pfosten hinter der Stange, damit der Kopf oben frei bleibt),
// Tritte zum Aufsteigen, Klimmzuggriffe oben bzw. Barrengriffe; das Kniepolster hängt an zwei silbernen Hebeln, die hinten in Lagerböcken drehen. Der Stapel steht
// hinten und hebt sich über das Seil an den Nocken, wenn das Polster sinkt (Gegengewicht). Lage des Polsters wie bisher
function assistBauen(ger, z, art) {
  const XS = 0.3, oben = 0.5, zP = -0.95, zS = -1.5, ax = 0.24;
  // Höhe des Drehpunkts: so, dass sich der Hebelarm bis zum Polster über die ganze Bewegung möglichst wenig streckt (gesucht aus der Polsterbahn der Vorlage)
  const E = []; for (let i = 0; i <= 10; i++) E.push(r2_assistPad(art, i / 10).add(V(0, -0.035, -0.05)));
  let yP = 0.7, beste = 1e9;
  for (let y = 0.2; y <= 1.6; y += 0.025) { const L = E.map((e) => Math.hypot(e.y - y, e.z - zP)), r = Math.max(...L) / Math.min(...L); if (r < beste) { beste = r; yP = y; } }
  const C = V(0, yP, zP);
  dkBoden(ger, 0.62, zS - 0.265, 0.35, zS + 0.23 + 0.0375);
  for (const zz of [zP, zS + 0.23 + 0.0375]) ger.holm(V(-0.62, 0.05, zz), V(0.62, 0.05, zz), DK.boden);
  for (const sx of [-1, 1]) {
    ger.holm(V(sx * 0.62, 0.05, -0.5), V(sx * 0.62, 2.42, -0.5), DK.holm);
    ger.box(0.13, 0.035, 0.22, V(sx * 0.4, 0.31, -0.1), ger.mGummi);   // Tritt, 31 cm hoch (bis 9.11. 50 cm: unter der Stange stieß der Hut beim Hinaufsteigen an die Stange)
    ger.holm(V(sx * 0.4, 0.26, -0.18), V(sx * 0.62, 0.26, -0.5), DK.strebe);
  }
  ger.holm(V(-0.62, 2.42, -0.5), V(0.62, 2.42, -0.5), DK.holm);
  if (art === 'klimmzug') {
    z.stange = ger.zyl(0.016, 1.3, ger.mMetall); z.stange.rotation.z = Math.PI / 2; z.stange.position.set(0, 2.25, 0);
    for (const sx of [-1, 1]) { ger.holm(V(sx * 0.62, 2.25, -0.5), V(sx * 0.62, 2.25, 0.0), DK.strebe); ger.teil(new THREE.SphereGeometry(0.026, 14, 10), ger.mDKGold, V(sx * 0.655, 2.25, 0)); }
  } else {
    for (const sx of [-1, 1]) {
      const b = ger.zyl(0.02, 0.6, ger.mMetall); b.rotation.x = Math.PI / 2; b.position.set(sx * 0.27, 1.25, 0.05);
      const gr = ger.zyl(0.024, 0.2, ger.mGummi); gr.rotation.x = Math.PI / 2; gr.position.set(sx * 0.27, 1.25, 0.12);
      ger.holm(V(sx * 0.27, 1.25, -0.25), V(sx * 0.62, 1.25, -0.5), DK.strebe);
    }
  }
  for (const sx of [-1, 1]) dkSeitenrahmen(ger, sx, C, oben, null, XS);
  z.block = gewichtsblockDK(ger, V(0, 0, zS), V(0, 0, 1), 1.55, art === 'klimmzug' ? 'KLIMMZUG-HILFE' : 'DIP-HILFE', art === 'klimmzug' ? 'RÜCKEN' : 'TRIZEPS', { seite: true });
  const th1 = Math.atan2(E[10].y - yP, E[10].z - zP);   // höchste Lage des Polsters (t = 1): dort ruht der Stapel
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ x: sg * (XS + 0.08), y: yP, z: zP, rN: 0.22, dir: -1, dth: 0.7, dD: oben })) });
  seil.nb.forEach((n) => { n.th0 = th1; ger.holm(V(Math.sign(n.x) * XS, yP + oben, zP), n.Wd, 0.04); });   // Halter der Seilrolle am Mast
  z.polster = ger.polsterGeformt(0.5, 0.07, 0.4, V());
  z.dkSeil = seil;
  z.assist = { P: { l: V(ax, yP, zP), r: V(-ax, yP, zP) }, arm: { l: ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel), r: ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel) }, dk: seil };
}
// Lage des Kniepolsters bei t (wie assistStellen, aus der Pose der Vorlage gerechnet)
function r2_assistPad(art, t) {
  const g = gelenke((art === 'klimmzug' ? klimmzug({ art: 'maschine' }) : trizeps({ art: 'dips', assistiert: true })).pose(t).pose);
  return g.knie.l.clone().add(g.knie.r).multiplyScalar(0.5).add(V(0, -0.085, -0.12));
}
// Kniepolster unter die Knie, die Hebel dorthin; der Stapel hebt sich über das Seil, wenn die Figur tiefer geht (Gegengewicht)
function assistStellen(z, g) {
  const knie = g.knie.l.clone().add(g.knie.r).multiplyScalar(0.5), a = z.assist, th = [];
  z.polster.position.copy(knie).add(V(0, -0.085, -0.12));
  for (const [s, sg] of [['l', 1], ['r', -1]]) {
    const E = z.polster.position.clone().add(V(0, -0.035, -0.05)); E.x = sg * 0.24;
    seil(a.arm[s], a.P[s], E); th.push(Math.atan2(E.y - a.P[s].y, E.z - a.P[s].z));
  }
  a.dk.stelle(th);
}
// Kabelrudern sitzend (DK Line): lange Bank, zwei schräge Fußplatten (Lücke für das Kabel), Kabelturm mit Säule, Schiene, Wagen und Seilöse am Seilausgang, dahinter
// der Stapel quer (Fenster und Schild zur Kamera). Das Seil läuft von der Öse senkrecht hoch zur Rolle oben auf der Säule, waagerecht zur Kopfrolle des Stapels und
// über die bewegliche Rolle zur festen Öse (2:1). Rolle etwa auf der Linie des gestreckten Arms, breiter Griff: Rolle höher (hohe Ellbogen, Zug fast waagerecht).
// Fußplatten so weit vorn, dass die Knie nur leicht gebeugt sind
const RU_FUSSFLAECHE = V(0, 0.42, -0.907), RU_ANKER = V(0, 0.4, 1.08), RU_ANKER_HOCH = V(0, 0.8, 1.08), RU_FUSS_Z = 0.7;
function kabelruderBauen(ger, z, breit) {
  const anker = breit ? RU_ANKER_HOCH : RU_ANKER, hMax = 0.3, yTop = 2.2, F = yTop - (0.14 + hMax + 0.18), zc = anker.z + 0.135, zS = zc + 0.33, A = V(0, anker.y, anker.z);
  ger.holm(V(0, 0.05, -0.75), V(0, 0.05, zc), DK.holm);
  for (const zz of [-0.62, 0.22]) ger.holm(V(0, 0.05, zz), V(0, 0.2625, zz), DK.strebe);
  ger.polsterGeformt(0.4, 0.09, 1.0, V(0, 0.34, -0.2));
  for (const sx of [-1, 1]) {
    const mitte = V(sx * 0.13, 0.32, RU_FUSS_Z).sub(RU_FUSSFLAECHE.clone().multiplyScalar(SOHLE + 0.015)).add(V(0, 0.907, 0.42).multiplyScalar(0.06));
    ger.polster(0.17, 0.3, 0.03, mitte, basisAus(V(0, 0.907, 0.42), RU_FUSSFLAECHE), ger.mRahmen);
    ger.holm(V(sx * 0.13, 0.05, mitte.z + 0.22), mitte.clone().add(RU_FUSSFLAECHE.clone().multiplyScalar(-0.04)), 0.05);   // Strebe von hinten an die Plattenrückseite
  }
  ger.teil(rundGeo(0.3, 0.05, 0.2, 0.02, 1), ger.mDK, V(0, 0.025, zc - 0.08));                                               // Fußplatte der Säule
  ger.holm(V(0, 0.08, zc), V(0, yTop - 0.03, zc), DK.holm);                                                                  // Säule
  ger.teil(rundGeo(0.06, yTop - 0.42, 0.012, 0.004, 1), ger.mHebel, V(0, (0.3 + yTop - 0.12) / 2, zc - 0.0535));            // Schiene
  ger.teil(rundGeo(0.14, 0.13, 0.06, 0.012, 1), ger.mDK, V(0, anker.y, zc - 0.0895));                                        // Wagen
  ger.teil(new THREE.TorusGeometry(0.02, 0.0045, 8, 16), ger.mDKGold, A);                                                    // Seilöse am Seilausgang
  z.block = gewichtsblockDK(ger, V(0, 0, zS), V(1, 0, 0), F, 'KABELRUDERN', 'RÜCKEN', { hMax });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [{ zug: true, x: 0, y: anker.y, z: anker.z, rN: 0, dir: 1, dD: yTop - anker.y }] });
  ger.holm(V(0, yTop, zc), seil.nb[0].Wd, 0.045);   // Halter der Rolle oben auf der Säule
  z.kr = { oese: A, dk: seil, kugel: ger.teil(new THREE.SphereGeometry(0.012, 12, 8), ger.mDKGold) }; z.dkTurm = [seil];   // goldene Seilkugel am Seilende am Griff
  z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
  z.griff = breit ? latzugstange(ger, 'gerade', 0.3) : rudergriffV(ger);
}
// Seil von der Öse am Turm zum Griff (Ring des V-Griffs: der Griff dreht nur um die senkrechte Achse, der Ring liegt 18 cm vor der Mitte auf der waagerechten Linie
// zum Turm; breite Stange: Öse 2 cm über der Mitte); der Stapel hebt sich mit der Seillänge
function r2_kabelruderStellen(z, mitte, anker, breit) {
  const d = anker.clone().sub(mitte), ende = mitte.clone().add(breit ? d.normalize().multiplyScalar(0.02) : V(d.x, 0, d.z).normalize().multiplyScalar(0.18));
  seil(z.seil, z.kr.oese, ende); z.seil_l = z.seil; z.kr.kugel.position.copy(ende); z.kr.dk.stelle([ende.distanceTo(z.kr.oese)]);
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
// hinten: Ellbogen gut 40° hinter der Rumpflinie, Unterarm waagrecht zum Hebel (vorher Hände neben der Brust, Ellbogen 64° zurück)
const rmVorn = (sg) => rmSchulter(sg).add(V(sg * 0.04, -0.06, ARM * 0.9995)), rmNah = (sg) => ruderEnde(rumpf(RM_BECKEN, RM_RUMPF), sg > 0 ? 'l' : 'r', sg, { ext: 42, abd: 22, zug: V(0, -0.1, 1) });
const RM_C = bogenMitte(rmVorn(1), rmNah(1), { y: 1.72 });
function rudermaschineBauen(ger, z) {
  // DK Line (Auftrag D): zwei getrennte Seitenrahmen mit Lagerböcken (kein Querrohr über dem Kopf), Hebel silbern, Stapel mit Seil und Schild.
  // Körper, Polster und Handwege (RM_C, bogenHand) bleiben wie bisher
  const R = rumpfRahmen(RM_RUMPF), C = RM_C, oben = 0.45;
  dkBoden(ger, DK.achse, -0.55, 1.05);
  ger.holm(V(-DK.achse, 0.05, C.z - 0.15), V(-0.62, 0.05, C.z - 0.15), DK.boden);   // verbindet den Bodenrahmen mit dem Sockel des Stapels
  sitzSaeuleDK(ger, V(0, RM_BECKEN.y - 0.115, RM_BECKEN.z), 0.42, 0.38);
  // Brustpolster 30 cm breit, 2,5 cm weiter vorn: die Oberarme gehen vorn daran vorbei, die Brust liegt an (bis 31.10. 4,7 cm darin)
  const brust = RM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.36)).add(R.vor.clone().multiplyScalar(0.215 + 0.045));
  ger.polsterGeformt(0.3, 0.44, 0.09, brust, basisAus(R.oben, R.vor));
  ger.holm(V(0, 0.05, brust.z + 0.25), V(0, brust.y - 0.05, brust.z + 0.25), 0.075);
  ger.holm(V(0, brust.y - 0.05, brust.z + 0.25), brust.clone().add(R.vor.clone().multiplyScalar(0.0725)), 0.055);   // Kappe liegt an der Polsterfläche an
  for (const sx of [-1, 1]) {
    const sd = sx > 0 ? 'l' : 'r';
    dkSeitenrahmen(ger, sx, C, oben, { y: C.y - 0.5, z: C.z - 0.75 });
    z['dmArm_' + sd] = ger.stab(V(), V(0, 1, 0), 0.0275, ger.mHebel);
    z['dmQuer_' + sd] = ger.stab(V(), V(0, 1, 0), 0.022, ger.mHebel);
    const g = new THREE.Group(); ger.gruppe.add(g); griffRohr(ger, V(0, -0.075, 0), V(0, 0.075, 0), g, 0.75); z['dmGriff_' + sd] = g;
  }
  z.block = gewichtsblockDK(ger, V(-0.85, 0, C.z - 0.15), V(1, 0, 0), 1.55, 'SITZENDES RUDERN', 'RÜCKEN');   // seitlich, damit die Figur von vorn zu sehen ist
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 2, naben: [1, -1].map((sg) => ({ x: sg * (DK.achse + 0.08), y: C.y, z: C.z, rN: 0.24, dir: -1, dth: 0.66, dD: oben })) });
  seil.nb.forEach((n) => ger.holm(V(Math.sign(n.x) * DK.achse, C.y + oben, C.z), n.Wd, 0.04));   // Halter der Seilrolle am Mast
  z.dkSeil = seil; z.dm = { C, griff: 'senkrecht', dk: seil };
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
// Maße des Sitzes: Standard (Wadenpresse) und flach (Beinpresse seit 5.11.): Lehne 60° statt 48°, Bein näher an der Schlittenbahn, Umkehr bei Knie 91°. So bleibt die Hüfte unten unter 125° und das Becken am Polster (bis 5.11. 144°, Oberschenkel an der Brust)
const BP_STD = { lehne: BP_LEHNE, bein: BP_BEIN, unten: BP_UNTEN };
const BP_FLACH = { lehne: 60, bein: BP_SCHIENE.clone().add(BP_PLATTE_OBEN.clone().multiplyScalar(0.09)).normalize(), unten: 91 };
const bpRahmen = (m = BP_STD) => rumpfRahmen({ basis: quer(-m.lehne) });
const bpHuefte = (sg, m = BP_STD) => BP_BECKEN.clone().sub(bpRahmen(m).oben.multiplyScalar(0.02)).add(V(sg * MASS.hueftBreite, 0, 0));
// Abstand Hüftgelenk → Knöchel bei einer Kniebeugung (Grad)
const bpWeg = (beuge) => Math.sqrt(MASS.oberschenkel ** 2 + MASS.unterschenkel ** 2 - 2 * MASS.oberschenkel * MASS.unterschenkel * Math.cos((180 - beuge) * RAD));
const bpFuss0 = (sg, m = BP_STD) => bpHuefte(0, m).add(V(sg * BP_FUSSBREITE, 0, 0)).add(m.bein.clone().multiplyScalar(bpWeg(m.unten)));
// Schlittenweg ab unten, bei dem das Knie so stark gebeugt ist
function bpHub(beuge, m = BP_STD) {
  const c = bpFuss0(1, m).sub(bpHuefte(1, m)), b = c.dot(BP_SCHIENE), D = bpWeg(beuge);
  return -b + Math.sqrt(Math.max(0, b * b - (c.lengthSq() - D * D)));
}
// Mitte der Plattenoberfläche, wenn der Schlitten um hub (m) aus der unteren Stellung gefahren ist
const bpPlatte = (hub, m = BP_STD) => bpFuss0(1, m).add(bpFuss0(-1, m)).multiplyScalar(0.5).add(BP_SCHIENE.clone().multiplyScalar(hub + SOHLE)).add(BP_PLATTE_OBEN.clone().multiplyScalar(0.07));   // Fußmitte etwa in der Plattenmitte
const BP_DREH = basisAus(BP_PLATTE_OBEN, BP_SCHIENE);   // Schlitten-Lage: X quer, Y Platte nach oben, Z = Fahrrichtung
// DK Line (R4): Sitz- und Rückenpolster geformt (Lage und Maße wie bisher), Bodenrahmen und Schienen aus Rundrohr, silberne Chromführungen, Schlitten mit Graphitplatte,
// Gummibelag (Körperkontakt, unverändert), Goldleiste, goldenen Radkappen und Hörnern mit Goldkappe; die Scheiben bleiben sichtbar. Typenschild an der hinteren Stütze und auf der Plattenrückseite
function beinpresseBauen(ger, z, m = BP_STD) {
  const R = bpRahmen(m), X = V(1, 0, 0), PO = BP_PLATTE_OBEN, PS = BP_SCHIENE;
  // Sitz: Rückenpolster parallel zum Rücken, Sitzpolster unter dem Po, beide auf Rundrohr-Stützen
  ger.polsterGeformt(0.46, 0.72, 0.09, BP_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.33)).sub(R.vor.clone().multiplyScalar(0.13 + 0.045)), basisAus(R.oben, R.vor));
  const sitzN = R.oben.clone().multiplyScalar(Math.cos(35 * RAD)).add(R.vor.clone().multiplyScalar(Math.sin(35 * RAD))).normalize();
  const sitzVor = X.clone().cross(sitzN).normalize();
  const sitz = BP_BECKEN.clone().sub(sitzN.clone().multiplyScalar(0.115 + 0.045)).add(sitzVor.clone().multiplyScalar(0.06));
  ger.polsterGeformt(0.44, 0.09, 0.42, sitz, basisAus(sitzN, sitzVor));
  const unterSitz = sitz.clone().sub(sitzN.clone().multiplyScalar(0.08)), unterLehne = BP_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.45)).sub(R.vor.clone().multiplyScalar(0.27));
  for (const sx of [-1, 1]) {
    ger.holm(V(sx * 0.17, 0.05, unterSitz.z), unterSitz.clone().add(V(sx * 0.17, 0, 0)), DK.strebe);                          // Stütze unter dem Sitz (Kappe liegt unter dem Polster an)
    ger.holm(V(sx * 0.17, 0.05, unterLehne.z - 0.1), unterLehne.clone().add(V(sx * 0.17, 0, 0)), DK.strebe);                  // Stütze hinter der Lehne
    for (const zz of [unterSitz.z, unterLehne.z - 0.1]) ger.holm(V(sx * 0.17, 0.05, zz), V(sx * 0.3, 0.05, zz), DK.strebe);   // kurze Fußstreben zu den Längsholmen
    // Haltegriff neben dem Sitz: Pfosten, waagerechte Chromstange mit Gummigriff (Griffe unverändert)
    const griff = BP_BECKEN.clone().add(V(sx * 0.34, 0, 0)).add(sitzN.clone().multiplyScalar(0.02)).add(sitzVor.clone().multiplyScalar(0.07));
    ger.holm(V(sx * 0.34, 0.06, griff.z - 0.02), griff.clone().sub(sitzN.clone().multiplyScalar(0.1)), 0.05);
    // senkrecht zur Sitzfläche, quer zum Unterarm (längs lief er fast parallel dazu)
    ger.stab(griff.clone().sub(sitzN.clone().multiplyScalar(0.11)), griff.clone().add(sitzN.clone().multiplyScalar(0.09)), 0.014, ger.mMetall);
    ger.stab(griff.clone().sub(sitzN.clone().multiplyScalar(0.075)), griff.clone().add(sitzN.clone().multiplyScalar(0.075)), 0.018, ger.mGummi);
  }
  z.bpGriff = { sitzVor };
  // Grundrahmen am Boden, Schienen unter 45°, Stützen
  const P0 = bpPlatte(0, m), hubMax = bpHub(BP_OBEN, m);
  const schiene = (sx, s) => P0.clone().add(X.clone().multiplyScalar(sx * 0.26)).add(PO.clone().multiplyScalar(-0.42)).add(PS.clone().multiplyScalar(s));
  const s0 = -0.42, s1 = hubMax + 0.78, zHinten = -0.95, zVorn = schiene(1, s1).z + 0.12;
  for (const sx of [-1, 1]) {
    ger.holm(V(sx * 0.3, 0.05, zHinten), V(sx * 0.3, 0.05, zVorn), DK.boden);                                                 // Längsholm am Boden
    for (const zz of [zHinten, (zHinten + zVorn) / 2, zVorn]) ger.fussDK(V(sx * 0.3, 0, zz));
    ger.holm(schiene(sx, s0), schiene(sx, s1), 0.075);                                                                        // Schiene
    ger.stab(schiene(sx, s0).add(PO.clone().multiplyScalar(0.0495)), schiene(sx, s1).add(PO.clone().multiplyScalar(0.0495)), 0.012, ger.mMetall);   // Laufschiene (Chrom)
    ger.holm(V(sx * 0.26, 0.05, schiene(sx, s0).z), schiene(sx, s0), DK.strebe);                                              // Stütze unten
    ger.teil(dkZyl(0.04, 0.012, 20), ger.mDKGold, V(sx * 0.26, 0.3, schiene(sx, s0).z));
    for (const y of [0.3, 1.1]) ger.teil(dkZyl(0.0525, 0.012, 20), ger.mDKGold, V(sx * 0.3, y, schiene(sx, s1).z));
    ger.holm(V(sx * 0.3, 0.05, schiene(sx, s1).z), schiene(sx, s1), DK.holm);                                                 // Stütze oben (hinten)
    ger.holm(V(sx * 0.3, 0.05, schiene(sx, s1).z - 0.55), schiene(sx, s1 - 0.5), DK.strebe);                                  // Strebe
    const anschlag = ger.teil(rundGeo(0.07, 0.07, 0.12, 0.015, 1), ger.mGummi, schiene(sx, s0 + 0.12).add(PO.clone().multiplyScalar(0.0495 + 0.012 + 0.035))); anschlag.quaternion.copy(BP_DREH);   // Anschlag unten: liegt auf der Chromführung
  }
  for (const zz of [zHinten, zVorn]) ger.holm(V(-0.3, 0.05, zz), V(0.3, 0.05, zz), DK.boden);
  ger.holm(schiene(-1, s1), schiene(1, s1), DK.strebe);
  r4_schild(ger, ger.gruppe, schiene(1, s1).add(V(0.0475 + 0.016, -0.35, 0)), V(1, 0, 0), 'BEINPRESSE', 'OBERSCHENKEL');
  // Schlitten: Fußplatte mit Gummibelag, Wagen auf den Schienen, Hörner mit Scheiben (alles in einer Gruppe, fährt mit)
  const sch = new THREE.Group(); sch.quaternion.copy(BP_DREH);
  const teil = (geo, mat, x, y, zz) => maschTeil(sch, geo, mat, x, y, zz);
  teil(rundGeo(0.78, 0.62, 0.045, 0.012, 2), ger.mDK, 0, 0, 0.0225 + 0.008);
  teil(rundGeo(0.72, 0.56, 0.012, 0.005, 1), ger.mGummi, 0, 0, 0.004);   // Gummibelag (Körperkontakt, unverändert)
  teil(rundGeo(0.7, 0.012, 0.008, 0.003, 1), ger.mDKGold, 0, 0.295, 0.004);   // Goldleiste am oberen Rand der Platte
  const schild = ger.schild('BEINPRESSE', 'OBERSCHENKEL'); ger.gruppe.remove(schild); sch.add(schild); schild.position.set(0, 0.12, 0.056);   // auf der Rückseite der Platte
  for (const sx of [-1, 1]) {
    holmIn(ger, sch, V(sx * 0.26, -0.33, 0.04), V(sx * 0.26, -0.33, 0.54), 0.06);                                            // Wagenholm über der Schiene
    holmIn(ger, sch, V(sx * 0.3, -0.22, 0.06), V(sx * 0.26, -0.33, 0.3), 0.06);                                              // Strebe von der Platte zum Wagen
    for (const zz of [0.12, 0.46]) teil(dkZyl(0.028, 0.012, 16), ger.mDKGold, sx * 0.296, -0.33, zz).rotation.z = Math.PI / 2;   // goldene Radkappen
    holmIn(ger, sch, V(sx * 0.26, -0.33, 0.3), V(sx * 0.3, -0.2, 0.3), 0.05);                                                // Hornträger
    r4_horn(ger, sch, V(sx * 0.3, -0.2, 0.3), sx, [[0.085, 0.225, 0.05], [0.14, 0.2, 0.05]], 0.32);
  }
  holmIn(ger, sch, V(-0.26, -0.33, 0.5), V(0.26, -0.33, 0.5), 0.06);                                                         // Querholm hinten am Wagen
  ger.gruppe.add(sch);
  z.schlitten = sch;
  return z;
}
// Maschinen für die Beine im Sitzen/Liegen: art: strecker | beuger_sitzend | beuger_liegend | adduktoren | abduktoren | beinpresse | hackenschmidt
// Neu: einbeinig (strecker, beinpresse: nur das linke Bein arbeitet) ; abduktoren + band (auf der Bank, Band um die Knie) ; hackenschmidt + winkel (Schienenwinkel) ; hackenschmidt + pendel (Pendel-Kniebeuge: Schwenkarm auf einer Bogenbahn)
// beinpresse + lehne (Lehne flacher, Bein entlang der Schlittenbahn: die Hüfte bleibt unten unter 125°) ; strecker + isometrisch (nur bis 60° Kniebeugung, dort halten)
// Ablauf davor (wirkt über animation()): standVersatz
export function beinmaschine(o = {}) {
  const art = o.art || 'strecker';
  const hw = o.winkel || HACK, band = art === 'abduktoren' && o.band, bp = o.lehne ? BP_FLACH : BP_STD, pendel = art === 'hackenschmidt' && !!o.pendel;
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'beinpresse') return beinpresseBauen(ger, z, bp);
      if (art === 'hackenschmidt') return hackBauen(ger, z, pendel ? 0 : hw, pendel);
      // Bank 2 cm niedriger und vorn 5 cm kürzer: Oberschenkel und Waden liegen an, statt 4 cm einzusinken (bis 31.10.)
      if (band) { ger.box(0.4, 0.43, 0.95, V(0, 0.215, -0.225), ger.mPolster); z.band = ger.teil(new THREE.BoxGeometry(0.006, 1, 0.05), ger.mBand); return z; }   // flaches Miniband
      if (art === 'beuger_liegend') return r1_beugerLiegend(ger, z);   // R1: DK Line
      if (art === 'strecker') return streckerBauenDK(ger, z, o.einbeinig);   // DK Line (Auftrag D)
      return sitzmaschineBauen(ger, z, art, o);   // R1: Beinbeuger sitzend, Adduktoren, Abduktoren in der DK Line
    },
    pose(t) {
      if (art === 'beuger_liegend') {
        const becken = BL_BECKEN.clone();
        const r = { basis: BAUCHLAGE, neigung: 0 };
        const knieW = mix(2, 115, t) * RAD;   // unten fast ganz gestreckt (bis 5.11. 28°)
        const knie = (sg) => BL_KNIE.clone().setX(sg * 0.1);
        const fuss = seitenBauch((s, sg) => knie(sg).add(V(0, Math.sin(knieW) * MASS.unterschenkel, Math.cos(knieW) * MASS.unterschenkel)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -20 }, fuss, fussRicht: seiten((s, sg) => V(0, -Math.cos(knieW), Math.sin(knieW))), kniePol: seiten(() => V(0, -1, 0)),
            hand: seitenBauch((s, sg) => genau(V(sg * 0.385, 0.66, -0.54))), handflaeche: seitenBauch((s, sg) => V(-sg, 0, 0)), ellbogenPol: seitenBauch((s, sg) => V(sg, 0.3, 0)) },
          props(g, z) { hebelStellen(z, g, 'l', (phi) => 0.24 * Math.max(0, Math.min(1, (((phi - 90 + 360) % 360) - 2) / 113))); } };
      }
      if (art === 'hackenschmidt') {
        // Rumpf liegt am schrägen Polster (HACK Grad zurückgelehnt), Becken gleitet auf der Schienenlinie.
        // Pendel: Polster und Becken schwingen an einem langen Arm um den Drehpunkt hinter der Figur; nach unten geht es erst senkrecht, dann zurück, der Rumpf richtet sich dabei auf (Knie weit vor, Ferse bleibt flach)
        const a = pendel ? mix(PD_WINKEL, 0, t) * RAD : 0, q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
        const u0 = pendel ? V(0, Math.cos(PD_LEHNE * RAD), -Math.sin(PD_LEHNE * RAD)) : V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor0 = pendel ? V(0, Math.sin(PD_LEHNE * RAD), Math.cos(PD_LEHNE * RAD)) : V(0, Math.sin(hw * RAD), Math.cos(hw * RAD));
        const u = u0.clone().applyQuaternion(q), vor = vor0.clone().applyQuaternion(q);
        const fussMitte = pendel ? PD_FUSS.clone() : HACK_FUSS.clone();
        const becken = pendel ? PD_HUEFTE.clone().addScaledVector(u0, 0.02).sub(PD_P).applyQuaternion(q).add(PD_P) : fussMitte.clone().add(u.clone().multiplyScalar(mix(0.5, BEIN * 1.01, t)));   // oben fast gestreckt, nicht durchgedrückt
        const r = { basis: basisAus(u, vor), neigung: 0 };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => k.schulter[s].clone().add(u.clone().multiplyScalar(0.1)).add(vor.clone().multiplyScalar(0.09)).add(V(sg * 0.12, 0, 0)));
        return { pose: { becken, rumpf: r, kopf: { neigung: pendel ? mix(2, 16, t) : 5 }, hand, handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg, -1, 0.4)),
            fuss: seiten((s, sg) => fussMitte.clone().add(V(sg * 0.22, 0, 0))), fussFlaeche: seiten(() => (pendel ? PD_PLATTFORM : HACK_PLATTFORM).clone()), fussRicht: seiten((s, sg) => V(sg * 0.25, 0.2, 1)), kniePol: seiten((s, sg) => V(sg * 0.25, 0.3, 1)) },   // Füße schulterbreit (bis 5.11. 0,66×)
          props(g, z) {
            z.hackSchlitten.position.copy(g.becken);
            if (pendel) {
              z.hackSchlitten.quaternion.copy(basisAus(u, vor));
              for (const [sx, arm] of [[-1, z.pdArm_r], [1, z.pdArm_l]]) seil(arm, PD_P.clone().add(V(sx * 0.3, 0, 0)), g.becken.clone().addScaledVector(u, 0.32).addScaledVector(vor, -0.235).add(V(sx * 0.3, 0, 0)));
            }
          } };
      }
      if (art === 'beinpresse') {
        // Becken im Sitz, Rücken am Polster, Füße flach auf der Platte; der Schlitten fährt mit den Füßen entlang der Schienen
        const r = { basis: quer(-bp.lehne), neigung: 0 }, R = rumpfRahmen(r);
        const hub = mix(0, bpHub(BP_OBEN, bp), t);
        const fuss = seiten((s, sg) => bpFuss0(sg, bp).add(BP_SCHIENE.clone().multiplyScalar(hub)));
        if (o.einbeinig && o.lehne) fuss.l.x = 0.06;   // Fuß mittig auf der Platte
        const zehen = BP_PLATTE_OBEN.clone(), aussen = Math.tan(12 * RAD);
        const pose = { becken: BP_BECKEN.clone(), rumpf: r, kopf: { neigung: 18 }, fuss,
          fussFlaeche: seiten(() => BP_SCHIENE.clone().negate()), fussRicht: seiten((s, sg) => zehen.clone().add(V(sg * aussen, 0, 0))),
          kniePol: seiten((s, sg) => BP_PLATTE_OBEN.clone().add(V(sg * 0.22, 0, 0))),
          // Hände an den Griffen neben dem Sitz (Neutralgriff: Handflächen zum Körper)
          hand: seiten((s, sg) => { const h = BP_BECKEN.clone().add(V(sg * 0.34, 0, 0)).add(R.oben.clone().multiplyScalar(Math.cos(35 * RAD) * 0.02)).add(R.vor.clone().multiplyScalar(0.02)).add(V(0, 0.012, 0.06)); return o.lehne ? genau(h) : h; }),   // lehne: genau am Griff, der Arm ist dort gestreckter
          handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.6, 0, -1)) };
        if (o.einbeinig) {
          // Rechtes Bein ruht: Oberschenkel liegt auf dem Sitz, Knie an der Vorderkante, Unterschenkel hängt locker davor (zwischen den Stützen
          // der Schienen). Bis 31.10. lag es quer über Sitzkante und Haltegriff zum Boden, 4–5 cm darin; daneben auf den Boden passt es nicht
          const sitzN = R.oben.clone().multiplyScalar(Math.cos(35 * RAD)).add(R.vor.clone().multiplyScalar(Math.sin(35 * RAD))).normalize(), sitzVor = V(1, 0, 0).cross(sitzN).normalize();
          const knie = BP_BECKEN.clone().addScaledVector(R.links, -MASS.hueftBreite).addScaledVector(R.oben, -0.02).addScaledVector(sitzVor, MASS.oberschenkel * 0.99).add(V(-0.03, 0, 0));
          pose.fuss.r = knie.clone().add(V(-0.01, -MASS.unterschenkel * 0.97, 0.09)); pose.fussFlaeche.r = null; pose.fussRicht.r = V(-0.1, -0.4, 1); pose.kniePol.r = sitzVor.clone().addScaledVector(sitzN, 0.4);
        }
        return { pose, props(g, z) { z.schlitten.position.copy(bpPlatte(hub, bp)); } };
      }
      const becken = band ? V(0, 0.55, -0.1) : SM_BECKEN.clone();
      // Rumpf: Beinbeuger sitzend und Abduktoren leicht nach vorn (der Text will das; lösen sich dafür von der Lehne), bis 5.11. 8° zurück. Hüfte beim Beinbeuger so um 95°
      const r = band ? { neigung: 4 } : art === 'beuger_sitzend' ? { neigung: 9 } : art === 'abduktoren' ? { neigung: 12 } : { ...SM_RUMPF };
      let fuss, kpol = seiten((s, sg) => V(0, 1, 0.3)), fussRicht, fussFlaeche;
      // Hände an den Griffen neben dem Sitz (Neutralgriff)
      const hand = band ? seiten((s, sg) => becken.clone().add(V(sg * 0.27, -0.02, 0.05))) : seiten((s, sg) => genau(V(sg * 0.36, 0.6, -0.05)));   // genau am Griff (bis 5.11. 10 cm darunter)
      if (art === 'strecker' || art === 'beuger_sitzend') {
        const w0 = (art === 'strecker' ? (o.isometrisch ? mix(90, 66, t) : mix(90, -3, t)) : mix(5, 125, t)) * RAD;   // Beinstrecker: oben ganz gestreckt, isometrisch nur bis 60° Kniebeugung. Beinbeuger sitzend: bis 119° (bis 5.11. 94°, der Unterschenkel stand erst senkrecht)
        const w = (s) => o.einbeinig && s === 'r' ? (art === 'strecker' ? 90 : 5) * RAD : w0;
        fuss = seiten((s, sg) => V(sg * 0.11, SM_KNIE.y - Math.sin(w(s)) * MASS.unterschenkel, SM_KNIE.z + Math.cos(w(s)) * MASS.unterschenkel));
        fussRicht = seiten((s) => V(0, Math.cos(w(s)), Math.sin(w(s))));
      } else if (band) {
        // Füße stehen fest, Knie drücken gegen das Band nach außen, bis 25° (bis 5.11. 34°, die Hüfte drehte bis 70°)
        fuss = seiten((s, sg) => V(sg * 0.19, FY, 0.42));
        kpol = seiten((s, sg) => V(sg * mix(0.15, 0.62, t), 1, 0.5));
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
          if (z.hebel) hebelStellen(z, g, 'l', art === 'strecker' ? (phi) => 0.24 * Math.max(0, Math.min(1, phi / 93)) : (phi) => 0.24 * Math.max(0, Math.min(1, (85 - phi) / 120)));
          // Band als Schlaufe um beide Oberschenkel knapp über den Knien: außen um jeden Oberschenkel, dazwischen straff (bis 5.11. ein dicker Bogen über den Knien)
          if (z.band) {
            const OR = 0.1, C = seiten((s) => g.knie[s].clone().add(g.huefte[s].clone().sub(g.knie[s]).setLength(0.09))), pkt = [];
            const bogen = (s, sg, von, bis) => { const a = g.knie[s].clone().sub(g.huefte[s]).normalize(), auf = V(0, 1, 0).addScaledVector(a, -a.y).normalize(), au = auf.clone().cross(a).multiplyScalar(sg); for (let i = 0; i <= 5; i++) { const w = mix(von, bis, i / 5) * RAD; pkt.push(C[s].clone().addScaledVector(au, OR * Math.cos(w)).addScaledVector(auf, OR * Math.sin(w))); } };
            bogen('l', 1, 90, -90); bogen('r', -1, -90, 90); pkt.push(pkt[0].clone());
            bandKette(z, 'band', pkt);
          }
          if (z.pad_l) r1_schwenkStellen(z, g);   // R1: Polster, Arme, Fußraste und Seil (der Stapel hebt sich nur über das Seil)
        } };
    },
    blick: V(0, 0.6, 0.1), abstand: 3.0, kameraRicht: V(1, 0.4, 0.35), dauer: o.isometrisch ? [1.2, 3, 1.2, 0.6] : undefined
  };
}
// Sitzende Beinmaschinen (Beinstrecker, Beinbeuger sitzend, Adduktoren, Abduktoren): Becken, Rumpf 8° zurückgelehnt, Kniegelenk
// (= Drehachse beim Beinstrecker/-beuger), Hebel an der rechten Außenseite (x = SM_HEBEL_X)
const SM_BECKEN = V(0, 0.64, -0.12), SM_RUMPF = { neigung: -8 }, SM_KNIE = V(0, 0.58, 0.338), SM_HEBEL_X = 0.31;
// Liegender Beinbeuger: Becken und Kniegelenk (Drehachse)
const BL_BECKEN = V(0, 0.76, 0.18), BL_KNIE = V(0, 0.72, 0.2 + Math.sqrt(MASS.oberschenkel ** 2 - 0.04 ** 2));   // Drehachse genau am Kniegelenk, eine Oberschenkellänge vom Hüftgelenk (bis 5.11. 2 cm zu nah, das Knie kam nie unter 28°)
// Knie bei Adduktoren/Abduktoren: Oberschenkel im Winkel a gespreizt, fast waagerecht
function smKnie(a) {
  const R = rumpfRahmen(SM_RUMPF);
  return seiten((s, sg) => SM_BECKEN.clone().sub(R.oben.clone().multiplyScalar(0.02)).add(V(sg * MASS.hueftBreite, 0, 0)).add(V(sg * Math.sin(a), -0.05, Math.cos(a)).setLength(MASS.oberschenkel)));
}
// Sitzende Beinmaschinen in der DK Line (Beinbeuger sitzend, Adduktoren, Abduktoren): Sitz, Rückenpolster und Haltegriffe an denselben Stellen wie bisher (Rundrohr statt Vierkant),
// Rahmen aus Rundrohr mit Gummifüßen, Stapel links daneben. art: beuger_sitzend | adduktoren | abduktoren (der Beinstrecker hat seine eigene Fassung, streckerBauenDK)
function sitzmaschineBauen(ger, z, art, o = {}) {
  const R = rumpfRahmen(SM_RUMPF), beuger = art === 'beuger_sitzend', XS = 0.40, zS = -0.25;
  if (beuger) dkBoden(ger, XS, -0.62, 0.5, -0.62, -0.02);   // vorderer Querholm unter der Sitzvorderkante: bei voller Beugung hängen die Füße davor (3 cm Abstand zu den Fersen)
  else dkBoden(ger, XS, -0.70, 0.19, -0.70, 0.14);   // hinten die Masten, vorn die Lagerpfosten der Schwenkarme
  sitzSaeuleDK(ger, V(0, 0.51, beuger ? -0.09 : -0.03), 0.44, beuger ? 0.32 : 0.44, -5);   // kurz (Beinbeuger): vorn Platz für die Zehen bei voller Beugung
  ger.polsterGeformt(0.44, 0.62, 0.09, SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.35)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
  ger.holm(V(0, 0.05, -0.55), SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.33)).sub(R.vor.clone().multiplyScalar(0.2625)), DK.strebe);   // Kappe liegt an der Polsterrückseite an
  for (const sx of [-1, 1]) {
    ger.holm(V(sx * 0.36, 0.05, -0.05), V(sx * 0.36, 0.5635, -0.05), 0.045);   // außen neben Hüfte und Oberschenkel
    griffRohr(ger, V(sx * 0.36, 0.6, -0.19), V(sx * 0.36, 0.6, 0.09));
  }
  if (beuger) hebelBauen(ger, z, SM_KNIE.clone().setX(SM_HEBEL_X), -1, o.einbeinig, zS);
  else r1_schwenkBauen(ger, z, art, zS);
  return z;
}
// Hebel mit Drehachse P (Achse X) am Kniegelenk in der DK Line: Lagerbock außen im Seitenrahmen, Arm am Schienbein entlang (silbern), Querrohr, Schaumstoffrolle über dem Knöchel,
// seite = +1 vor dem Schienbein, -1 dahinter (Beinbeuger sitzend); Stapel links, Seil von der Nocke außen am Lager hoch zur Rolle über dem Lager (1:1)
function hebelBauen(ger, z, P, seite, einbeinig, zS = -0.25) {
  const XS = 0.40, oben = 2.13 - P.y;   // Seilrolle auf 2,13 m: das Seil quert hoch über dem Kopf, auch beim Hereinkommen im Stehen
  dkSeitenrahmen(ger, 1, P, oben, null, XS);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = 0.385, rz = seite * (seite < 0 ? 0.118 : 0.103), rx = einbeinig ? 0.11 : 0, rl = einbeinig ? 0.17 : 0.36;   // Rolle liegt am Schienbein (vorn ~5 cm) bzw. an der Wade (hinten ~7 cm) an
  holmIn(ger, z.hebel, V(0, 0, 0), V(0, -L, rz), 0.055, ger.mHebel);
  holmIn(ger, z.hebel, V(0, -L, rz), V(rx + rl / 2 - P.x + 0.01, -L, rz), 0.04, ger.mHebel);
  rollePolster(ger, rl, 0.048, z.hebel).position.set(rx - P.x, -L, rz);
  z.block = gewichtsblockDK(ger, V(-0.8, 0, zS), V(1, 0, 0), 1.55, 'BEINBEUGER SITZEND', 'OBERSCHENKEL', { mRolle: false });
  ger.holm(V(-XS, 0.05, zS), V(-0.57, 0.05, zS), DK.boden);   // Seitenholm links bis zum Sockel des Stapels
  z.dkSeil = r1_nockenSeil(ger, { block: z.block, straenge: 1, naben: [{ C: V(XS + 0.08, P.y, P.z), achse: V(-1, 0, 0), e2: V(0, 1, 0), rN: 0.14, dD: oben, v0: V(0, -Math.sin(5 * RAD), Math.cos(5 * RAD)), v1: V(0, -Math.sin(125 * RAD), Math.cos(125 * RAD)) }] });
  ger.holm(V(XS, P.y + oben, P.z), z.dkSeil.nb[0].Wd, 0.04);   // Halter der Seilrolle am Mast
  // Polster über den Knien hält die Oberschenkel auf dem Sitz; es hängt mit einem Rundrohr am unteren Ende des Mastes (dort endet auch der Mast), weit weg vom Hebel
  const y = SM_KNIE.y + 0.135;
  ger.polsterGeformt(0.42, 0.075, 0.15, V(0, y, 0.24));
  ger.holm(V(XS, P.y + 0.085, P.z), V(0.21 + 0.0225 - 0.003, y, 0.24), 0.045);
}
// Hebel dreht so, dass er am Schienbein der Seite s anliegt; heben(phi) = Hub des Gewichtsblocks aus dem Winkel (Grad, 0 = Schienbein senkrecht nach unten)
function hebelStellen(z, g, s, heben) {
  const d = g.knoechel[s].clone().sub(g.knie[s]); d.x = 0; d.normalize();
  z.hebel.quaternion.setFromUnitVectors(V(0, -1, 0), d);
  if (z.dkSeil) z.dkSeil.stelle([Math.atan2(d.y, d.z)]);   // DK Line (Beinstrecker): Nocke und Seil bestimmen die Hubhöhe
  else if (z.block) z.block.heben(heben(Math.atan2(d.z, -d.y) / RAD));
}
// Kabelturm DK Line (Fliegende): eine Säule je Seite (sx = ±1) mit Schiene, Wagen und Seilöse am Seilausgang anker, dahinter der Stapel mit Rollenkopf.
// Das Seil läuft von der Öse senkrecht hoch zur Rolle oben auf der Säule, waagerecht zur Kopfrolle des Stapels und über die bewegliche Rolle zur festen Öse (2:1):
// wird das Seil zwischen Griff und Öse um d länger, steigt der Stapel um d/2. Die Strecke Griff bis Öse setzt die Vorlage, die Länge stellt stelle([Länge]) ein
function kabelturmDK(ger, sx, anker) {
  const x = sx * Math.abs(anker.x), yTop = 2.3, hMax = 0.5, F = yTop - (0.14 + hMax + 0.18), zc = anker.z - 0.135, zS = zc - 0.31, A = V(x, anker.y, anker.z);
  ger.teil(rundGeo(0.3, 0.05, 0.2, 0.02, 1), ger.mDK, V(x, 0.025, zc + 0.08));                                              // Fußplatte der Säule
  ger.holm(V(x, 0.08, zc), V(x, yTop, zc), DK.holm);                                                                         // Säule
  ger.teil(rundGeo(0.06, yTop - 0.42, 0.012, 0.004, 1), ger.mHebel, V(x, (0.3 + yTop - 0.12) / 2, zc + 0.0535));            // Schiene
  ger.teil(rundGeo(0.14, 0.13, 0.06, 0.012, 1), ger.mDK, V(x, anker.y, zc + 0.0895));                                        // Wagen
  ger.teil(new THREE.TorusGeometry(0.02, 0.0045, 8, 16), ger.mDKGold, A);                                                    // Seilöse am Seilausgang
  const B = gewichtsblockDK(ger, V(x, 0, zS), V(-sx, 0, 0), F, 'KABELZUG', 'BRUST', { hMax });
  const seil = stapelAnHebel(ger, { block: B, straenge: 2, naben: [{ zug: true, x, y: anker.y, z: anker.z, rN: 0, dir: 1, dD: yTop - anker.y }] });
  ger.holm(V(x, yTop, zc), seil.nb[0].Wd, 0.045);                                                                            // Halter der Rolle oben auf der Säule
  return seil;
}
// Beinstrecker in der DK Line: Sitz, Rückenpolster und Haltegriffe an denselben Stellen wie bisher (Rundrohr statt Vierkant), Hebel silbern am Schienbein mit
// Lagerbock außen (links); der Stapel steht rechts daneben, das Seil läuft vom Rollenkopf über eine Rolle über dem Lager zur Nocke (1:1, ein Strang)
function streckerBauenDK(ger, z, einbeinig) {
  const R = rumpfRahmen(SM_RUMPF), XS = 0.40, P = SM_KNIE.clone().setX(SM_HEBEL_X), oben = 1.55;   // Seilrolle auf 2,1 m: das Seil quert hoch über dem Kopf, auch beim Hereinkommen im Stehen
  dkBoden(ger, XS, -0.62, 0.45, -0.62, 0.18);   // vorderer Querholm hinter der Ferse (Füße hängen davor)
  ger.holm(V(-XS, 0.05, -0.25), V(-0.57, 0.05, -0.25), DK.boden);   // verbindet den Bodenrahmen mit dem Sockel des Stapels
  sitzSaeuleDK(ger, V(0, 0.51, -0.03), 0.44, 0.44, -5);
  ger.polsterGeformt(0.44, 0.62, 0.09, SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.35)).sub(R.vor.clone().multiplyScalar(0.135 + 0.045)), basisAus(R.oben, R.vor));
  ger.holm(V(0, 0.05, -0.55), SM_BECKEN.clone().add(R.oben.clone().multiplyScalar(0.33)).sub(R.vor.clone().multiplyScalar(0.2625)), DK.strebe);
  for (const sx of [-1, 1]) {
    ger.holm(V(sx * 0.36, 0.05, -0.05), V(sx * 0.36, 0.585, -0.05), 0.045);   // außen neben Hüfte und Oberschenkel
    griffRohr(ger, V(sx * 0.36, 0.6, -0.19), V(sx * 0.36, 0.6, 0.09));
  }
  dkSeitenrahmen(ger, 1, P, oben, null, XS);
  z.hebel = new THREE.Group(); z.hebel.position.copy(P); ger.gruppe.add(z.hebel);
  const L = 0.385, rz = 0.103, rx = einbeinig ? 0.11 : 0, rl = einbeinig ? 0.17 : 0.36;   // Rolle liegt am Schienbein (vorn ~5 cm) an
  holmIn(ger, z.hebel, V(0, 0, 0), V(0, -L, rz), 0.055, ger.mHebel);
  holmIn(ger, z.hebel, V(0, -L, rz), V(rx + rl / 2 - P.x + 0.01, -L, rz), 0.04, ger.mHebel);
  rollePolster(ger, rl, 0.048, z.hebel).position.set(rx - P.x, -L, rz);
  z.block = gewichtsblockDK(ger, V(-0.8, 0, -0.25), V(1, 0, 0), 1.55, 'BEINSTRECKER', 'OBERSCHENKEL', { mRolle: false });
  const seil = stapelAnHebel(ger, { block: z.block, straenge: 1, naben: [{ x: XS + 0.08, y: P.y, z: P.z, rN: 0.15, dir: 1, dth: 1.65, dD: oben }] });
  ger.holm(V(XS, P.y + oben, P.z), seil.nb[0].Wd, 0.04);
  z.dkSeil = seil; return z;
}
// Hackenschmidt: Fußplattform vorne 12° höher, Schienen hinter dem Rücken (HACK Grad zurückgelehnt), Schlitten mit Rückenpolster,
// Schulterpolstern, Griffen und Hörnern mit Scheiben; der Schlitten fährt mit dem Becken
const HACK_PLATTFORM = V(0, Math.cos(12 * RAD), -Math.sin(12 * RAD));
// Pendel-Kniebeuge: Die Fußplatte liegt flacher und 10 cm weiter vorn als bei der Hackenschmidt (Sprunggelenk unten höchstens rund 40°), das Polster hängt an einem Schwenkarm. PD_HUEFTE = Hüftgelenk oben, unten = PD_UNTEN,
// PD_P = Drehpunkt so, dass PD_WINKEL Grad Schwenk beide verbindet; der Rumpf dreht mit, oben PD_LEHNE Grad zurückgelehnt
const PD_PLATTFORM = V(0, Math.cos(8 * RAD), -Math.sin(8 * RAD)), PD_FUSS = V(0, 0.21, 0.45), PD_WINKEL = 18, PD_LEHNE = 23, PD_HUEFTE = V(0, 1.075, 0.297), PD_UNTEN = V(0, 0.684, 0.259);
const PD_P = (() => { const c = PD_UNTEN.clone().sub(PD_HUEFTE), l = c.length(), R = l / (2 * Math.sin(PD_WINKEL / 2 * RAD)); c.divideScalar(l); return PD_HUEFTE.clone().lerp(PD_UNTEN, 0.5).add(V(0, -c.z, c.y).multiplyScalar(R * Math.cos(PD_WINKEL / 2 * RAD))); })();
// DK Line (R4): Hackenschmidt und Pendel-Kniebeuge. Rundrohr-Rahmen mit Gummifüßen, Schienen mit Chromführung und silbernen Gleithülsen am Schlitten, Rückenplatte nur so hoch wie das
// Polster (der Kopf bleibt frei), Hörner mit Goldkappe; Pendel: je Seite ein Rahmen mit Lagerbock (keine durchgehende Achse), silberne Schwenkarme. Polster, Griffe und Fußplatten wie bisher
function hackBauen(ger, z, hw, pendel = false) {
  const u = pendel ? V(0, Math.cos(PD_LEHNE * RAD), -Math.sin(PD_LEHNE * RAD)) : V(0, Math.cos(hw * RAD), -Math.sin(hw * RAD)), vor = pendel ? V(0, Math.sin(PD_LEHNE * RAD), Math.cos(PD_LEHNE * RAD)) : V(0, Math.sin(hw * RAD), Math.cos(hw * RAD)), X = V(1, 0, 0);
  const titel = pendel ? 'PENDEL-KNIEBEUGE' : 'HACKENSCHMIDT';
  if (pendel) {
    // zwei Seitenrahmen mit Drehpunkt hinter der Figur (PD_P), Schwenkarme bis zum Polster (keine Schienen)
    r4_boden(ger, 0.4, PD_P.z - 0.2, 0.72);
    ger.box(0.72, 0.05, 0.6, V(0, 0.085, 0.42), ger.mDK, -8);
    ger.box(0.66, 0.012, 0.54, V(0, 0.085, 0.42).add(PD_PLATTFORM.clone().multiplyScalar(0.031)), ger.mGummi, -8);
    for (const sx of [-1, 1]) {
      ger.holm(V(sx * 0.3, 0.05, 0.42), V(sx * 0.3, 0.065, 0.42), 0.05);
      dkSeitenrahmen(ger, sx, PD_P, 0.16, { y: 0.55, z: PD_P.z + 0.65 }, 0.4);
    }
    r4_schild(ger, ger.gruppe, V(0.4 + 0.0475 + 0.016, 0.6, PD_P.z), V(1, 0, 0), titel, 'BEINE, GESÄSS');
    z.pdArm_l = ger.stab(V(), V(0, 1, 0), 0.03, ger.mHebel); z.pdArm_r = ger.stab(V(), V(0, 1, 0), 0.03, ger.mHebel);
  } else {
    r4_boden(ger, 0.42, -1.3, 0.66);
    ger.box(0.72, 0.05, 0.58, V(0, 0.08, 0.32), ger.mDK, -12);
    ger.box(0.66, 0.012, 0.52, V(0, 0.08, 0.32).add(HACK_PLATTFORM.clone().multiplyScalar(0.031)), ger.mGummi, -12);
    const A = (sx) => HACK_FUSS.clone().sub(vor.clone().multiplyScalar(0.3)).add(X.clone().multiplyScalar(sx * 0.3)).sub(u.clone().multiplyScalar(0.12));
    const B = (sx) => A(sx).add(u.clone().multiplyScalar(2.05));
    for (const sx of [-1, 1]) {
      ger.holm(V(sx * 0.3, 0.05, 0.32), V(sx * 0.3, 0.065, 0.32), 0.05);
      ger.holm(A(sx), B(sx), 0.075);                                                                    // Schiene
      ger.stab(A(sx).add(vor.clone().multiplyScalar(0.05)), B(sx).add(vor.clone().multiplyScalar(0.05)), 0.012, ger.mMetall);   // Chromführung
      ger.holm(V(sx * 0.3, 0.05, A(sx).z), A(sx), DK.strebe);                                          // Stütze unten
      ger.holm(V(sx * 0.36, 0.05, B(sx).z), B(sx), DK.holm);                                           // Stütze oben
    }
    ger.holm(B(-1), B(1), DK.strebe);
    const Bm = B(1), unten = V(0.36, 0.05, Bm.z);
    r4_schild(ger, ger.gruppe, V(0.36 + (Bm.x - 0.36) * 0.5 + 0.0475 + 0.016, 0.9, Bm.z), V(1, 0, 0), titel, 'BEINE, GESÄSS');
  }
  // Schlitten im Becken-Rahmen (X quer, Y = u entlang der Schienen, Z = vor)
  const sch = new THREE.Group(); sch.quaternion.copy(basisAus(u, vor));
  r4_polster(ger, sch, 0.42, 0.72, 0.07, V(0, 0.3, -0.17));                                            // Rückenpolster (Körperkontakt, unverändert)
  const plH = pendel ? 0.5 : 0.64;                                                                        // Rückenplatte: niedriger als das Polster (Abstand zum Kopf; Pendel: der Kopf liegt näher)
  maschTeil(sch, rundGeo(0.5, plH, 0.05, 0.01, 1), ger.mDK, 0, -0.06 + plH / 2, -0.235);
  for (const sx of [-1, 1]) {
    r4_polster(ger, sch, 0.13, 0.08, 0.22, V(sx * 0.2, 0.47 + 0.1, 0.0));                              // Schulterpolster
    holmIn(ger, sch, V(sx * 0.235, 0.47 + 0.11, -0.12), V(sx * 0.235, 0.47 + 0.11, -0.235), 0.045);   // Halter weit außen im Polster: Abstand zum Kopf
    griffRohr(ger, V(sx * 0.325, 0.57, 0.02), V(sx * 0.325, 0.57, 0.17), sch);                          // Griffe (unverändert)
    holmIn(ger, sch, V(sx * 0.325, 0.57, 0.02), V(sx * 0.3, 0.55, -0.235), 0.035);
    for (const y of [0.05, 0.6]) {
      holmIn(ger, sch, V(sx * 0.25, y, -0.235), V(sx * 0.3, y, -0.25), 0.04);                           // Arm von der Platte zur Hülse
      if (!pendel) {                                                                                      // Gleithülse auf der Chromführung (gleiche Achse)
        maschTeil(sch, dkZyl(0.032, 0.14, 20), ger.mHebel, sx * 0.3, y, -0.25);
        for (const dy of [-0.077, 0.077]) maschTeil(sch, dkZyl(0.036, 0.012, 20), ger.mDKGold, sx * 0.3, y + dy, -0.25);
      }
    }
    if (pendel) holmIn(ger, sch, V(sx * 0.25, 0.32, -0.235), V(sx * 0.3, 0.32, -0.235), 0.05);          // hier greift der Schwenkarm an
    r4_horn(ger, sch, V(sx * 0.31, 0.08, -0.25), sx, [[0.09, 0.225, 0.05], [0.145, 0.2, 0.05]], 0.3);
  }
  ger.gruppe.add(sch);
  z.hackSchlitten = sch;
  return z;
}

/* =================================================================== */
/* Drücken                                                              */
/* =================================================================== */

// Überzug: Achse der Hantel entlang der Arme, leicht gekippt, damit das Handgelenk nicht 90° schaffen muss
function ueberzugAchse(S, M, li) { const a = M.clone().sub(S).normalize(), U = a.clone().applyAxisAngle(li, 22 * RAD); return { U, v: U.clone().cross(li) }; }
// SZ-Stange mit sichtbarem Knick (ger.sz ist gerade): Enden und Scheiben aus dem Baukasten, das Griffstück in W-Form. Die Griffzonen laufen 22° schräg (innen näher am Kopf), die Faust sitzt mitten darauf und dreht sich halb ein
function szStange(ger) {
  const g = ger.sz(), linie = [[0, 0.03], [0.07, 0.03], [0.22, -0.03], [0.29, 0], [0.41, 0]];
  g.children[0].visible = false;
  for (const sx of [-1, 1]) for (let i = 0; i < linie.length - 1; i++) {
    const A = V(sx * linie[i][0], 0, -linie[i][1]), B = V(sx * linie[i + 1][0], 0, -linie[i + 1][1]);
    legeLaengs(maschTeil(g, new THREE.CylinderGeometry(0.014, 0.014, A.distanceTo(B) + 0.004, 14), ger.mMetall), A, B);
  }
  return g;
}
// Die Ebene des Knicks steht quer zum Unterarm und dreht mit ihm, wie eine Stange in der Hand
function szStellen(lh, g) {
  const x = g.hand.l.clone().sub(g.hand.r).normalize(), ua = g.handgelenk.l.clone().sub(g.ellbogen.l).add(g.handgelenk.r).sub(g.ellbogen.r), y = ua.addScaledVector(x, -ua.dot(x)).normalize();
  lh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y)));
}
// Negativbank: Beinhalter am oberen Bankende. Die Rolle liegt vorn auf dem Schienbein über dem Knöchel: so kann die Figur nicht kopfwärts rutschen (Text: „Beine sicher einhaken“). Bis 5.11. dazu eine Rolle unter der Kniekehle, genau dort, wo die Figur steht und sich hinsetzt: Beine und Rumpf gingen hindurch
function beinhalterBauen(ger) {
  const z0 = 0.8, kopf = V(0, 0.86, z0), R2 = V(0, 1.004, 0.806);
  ger.vierkant(V(0, 0.035, z0), kopf, 0.06);
  ger.vierkant(V(-0.26, 0.035, z0), V(0.26, 0.035, z0), 0.07);
  ger.vierkant(V(0, 0.035, 0.33), V(0, 0.035, z0), 0.06);
  ger.vierkant(kopf, R2, 0.05); rollePolster(ger, 0.44, 0.045).position.copy(R2);
}
// Bankdrücken & Fliegende im Liegen. last: langhantel | kurzhanteln | maschine | multipresse | sz ; neigung: 0 | 30 | -15 ; griff: normal | eng ; art: druecken | fliegende | ueberzug | stirn | boden
// Neu: einarmig (nur links eine Kurzhantel) ; griff neutral (Hammergriff, Ellbogen näher am Körper) ; griffLaengs (fliegende: die Hantel bleibt längs zur Bank, die Hände drehen nicht um)
// Ablauf davor (wirkt über animation()): sitzVersatz
export function bankdruecken(o = {}) {
  const last = o.last || 'langhantel', neig = o.neigung || 0, art = o.art || 'druecken', boden = art === 'boden' || o.boden;
  // Schräg-Brustpresse (last maschine): Griffe laufen auf dem Bogen der Hebel (Drehachse hinter der Lehne), unten vor der oberen Brust
  const schraegBahn = () => {
    const becken = V(0, 0.58, 0.28), r = { basis: quer(-90 + neig), neigung: 0 }, k = rumpf(becken, r), dx = 0.33 - MASS.schulterBreite;
    // Griffe unten dicht an der oberen Brust (5 cm vor der Brustfront, Ellbogen 124°), Druck etwa senkrecht zur Lehne, oben Arm knapp vor der Streckung (bis 9.11. 12 cm weiter vorn: 18 cm vor der Brustfront, nur etwa der halbe Weg, Devin 9.11.; bis 5.11. die Bahn der Langhantel: unten 143°, oben senkrecht über dem Kopf)
    const h0 = (s, sg) => k.schulter[s].clone().addScaledVector(k.R.links, sg * dx).addScaledVector(k.R.oben, -0.12).addScaledVector(k.R.vor, 0.29);
    const h1 = (s, sg) => k.schulter[s].clone().addScaledVector(k.R.links, sg * dx).addScaledVector(k.R.oben, -0.02).addScaledVector(k.R.vor, 0.647);
    return { becken, r, h0, h1, C: bogenMitte(h0('l', 1), h1('l', 1), { z: becken.z - 0.95 }) };
  };
  return {
    aufbau(ger) {
      const z = {};
      if (boden) ger.matte();
      else if (last === 'maschine') { /* Sitz und Lehne gehören zur Maschine */ }
      else if (neig > 0) schraegbankBauen(ger, V(0, 0.58, 0.28), { basis: quer(-90 + neig), neigung: 0 });
      else if (neig < 0) {
        // Polster liegt am Rücken an und reicht 13 cm über das Becken hinaus: das Gesäß liegt ganz auf der Bank (bis 5.11. endete es am Gesäß, die Füße standen am Boden, Hüfte 32° überstreckt)
        ger.bank(-0.018, 1.0, 0.372, -neig);
        beinhalterBauen(ger);
      } else ger.bank(-0.05, 1.2, 0.43, 0);
      if (last === 'langhantel' || last === 'sz' || last === 'multipresse') z.lh = last === 'sz' ? szStange(ger) : ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kurzhanteln' && art === 'ueberzug') z.kh_l = ger.kurzhantel(KELCH_MASS.innen.schwer);   // Überzug: eine schwere Hantel mit beiden Händen
      else if (last === 'kurzhanteln') khAufbauen(ger, z, !o.einarmig);
      if (last === 'maschine') { const sp = schraegBahn(); drueckmaschineBauen(ger, z, sp.becken, sp.r, sp.C, 'quer', { titel: 'SCHRÄGE BRUSTPRESSE', untertitel: 'BRUST', dir: 1, rN: 0.30, dth: 0.45, stackZ: -0.8 }); }   // Schräg-Brustpresse (dth 0,45: längerer Hebelweg, bis 9.11. 0,32)
      return z;
    },
    pose(t) {
      const hoehe = boden ? 0.13 : 0.565;
      const winkel = boden ? 0 : neig;
      const becken = boden ? V(0, 0.13, 0.32) : neig > 0 ? V(0, 0.58, 0.28) : V(0, hoehe + (neig < 0 ? 0.05 : 0), 0.3);
      const r = { basis: quer(-90 + winkel), neigung: 0 };
      const k = rumpf(becken, r);
      // Griff: normal etwa 1,5 × Schulterbreite (Unterarme unten senkrecht), eng knapp schulterbreit
      const breit = o.griff === 'eng' ? 0.225 : o.griff === 'neutral' ? 0.29 : last === 'kurzhanteln' ? 0.37 : 0.33;   // eng: 1,1× Schulter („nicht enger“)
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const sch = k.schulter[s];
        const brustOben = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.14)).add(k.R.vor.clone().multiplyScalar(0.14));
        if (art === 'fliegende') {
          const w = mix(15, 99, t) * RAD;  // 15° = Arme weit offen, 99° = Hanteln treffen sich fast über der Brust (vorher 85°: 52 cm auseinander)
          // Schrägbank: Bogen 20° kopfwärts gelegt, oben stehen die Hanteln über der oberen Brust (bis 5.11. 30° fußwärts der Senkrechten)
          const kipp = neig > 10 ? 20 * RAD : 0;
          hand[s] = sch.clone().add(k.R.vor.clone().multiplyScalar(Math.sin(w) * Math.cos(kipp) * ARM * 0.985)).addScaledVector(k.R.oben, Math.sin(w) * Math.sin(kipp) * ARM * 0.985).add(k.R.links.clone().multiplyScalar(sg * Math.cos(w) * ARM * 0.985));   // Ellbogen leicht gebeugt (10–30°)
          epol[s] = k.R.vor.clone().multiplyScalar(-0.3).add(k.R.oben.clone().multiplyScalar(-0.2)).add(k.R.links.clone().multiplyScalar(sg));
          if (o.griffLaengs) flaeche[s] = k.R.links.clone().multiplyScalar(-sg).addScaledVector(k.R.vor, 0.6);   // Handfläche zeigt nach innen-oben, so bleibt die Hand bei der Längs-Hantel auf einer Seite des Unterarms
        } else if (art === 'ueberzug') {
          const w = mix(150, 85, t) * RAD, lang = ARM * 0.895;   // Arme leicht gebeugt, der Winkel bleibt (bis 5.11. fast gestreckt, 4°)
          const innen = last === 'kurzhanteln' ? 0.145 : 0.12;   // eine Hantel: Hände fast zusammen
          hand[s] = sch.clone().add(k.R.links.clone().multiplyScalar(-sg * innen)).add(k.R.vor.clone().multiplyScalar(Math.sin(w) * lang)).add(k.R.oben.clone().multiplyScalar(-Math.cos(w) * lang));
          epol[s] = k.R.links.clone().multiplyScalar(sg);
        } else if (art === 'stirn') {
          // Ellbogen steht fest, der Oberarm ist 12° zum Kopf geneigt und bleibt so; nur der Unterarm klappt, oben bleiben 8° Beugung und damit Spannung (Kurzhanteln: unten über der Stirn, nicht im Kopf)
          // Bis 5.11. endete der Unterarm oben fußwärts vom Oberarm: der Arm ging dafür mit nach vorn (103° auf 87°)
          // Stange: unten läuft sie hinter dem Kopf vorbei (1.11. 132° und 8 cm statt 140° und 6 cm: Kopf jetzt größer)
          const aO = 12 * RAD, innen = last === 'kurzhanteln' ? 0 : 0.06, oA = Math.sqrt(MASS.oberarm ** 2 - innen ** 2), w = mix(last === 'kurzhanteln' ? 128 : 132, last === 'kurzhanteln' ? 20 : 15, t) * RAD;
          const ell = sch.clone().add(k.R.vor.clone().multiplyScalar(Math.cos(aO) * oA)).add(k.R.oben.clone().multiplyScalar(Math.sin(aO) * oA)).add(k.R.links.clone().multiplyScalar(-sg * innen));
          hand[s] = genau(ell.clone().add(k.R.vor.clone().multiplyScalar(Math.cos(w) * UNTERARM)).add(k.R.oben.clone().multiplyScalar(Math.sin(w) * UNTERARM)));
          epol[s] = k.R.vor.clone().add(k.R.oben.clone().multiplyScalar(-0.5));
        } else {
          // Unten berührt die Stange die untere Brust (Brustbein), oben Arme gestreckt über den Schultern
          // Schrägbank: obere Brust; Kurzhanteln unten etwas höher (Oberarm kaum unter der Bankebene); oben senkrecht über der Schulter
          const brustUnten = k.brust.clone().sub(k.R.oben.clone().multiplyScalar(neig > 10 ? 0.12 : neig < 0 ? 0.25 : 0.2)).add(k.R.vor.clone().multiplyScalar(0.14));
          let unten = brustUnten.add(k.R.links.clone().multiplyScalar(sg * breit)).add(k.R.vor.clone().multiplyScalar(boden ? 0.12 : last === 'kurzhanteln' ? 0.18 : 0.05));   // Bodendrücken: Oberarme liegen unten auf dem Boden auf
          const oben = sch.clone().add(k.R.links.clone().multiplyScalar(sg * (breit - MASS.schulterBreite))).add(V(0, ARM * 0.995, 0));
          // Stange: unten genau auf der Haut (RUMPF_VORN) an der Stelle s über dem Becken, mit etwas Luft. Bis 5.11. steckte sie 3 cm in der Brust, der Arm faltete sich dafür (Ellbogen 136–152°)
          // Flach und eng untere Brust, schräg obere Brust knapp unter dem Schlüsselbein; Multipresse stoppt schräg kurz vor der Brust, dafür steht die Stange oben nicht über der Schulter, sondern über der Brust (Führung)
          if ((last === 'langhantel' || last === 'multipresse') && !boden) {
            const smith = last === 'multipresse', dx = breit - MASS.schulterBreite, sU = o.griff === 'eng' ? 0.22 : neig > 10 ? (smith ? 0.365 : 0.39) : 0.25, luft = neig > 10 ? (smith ? 0.03 : 0.006) : 0.01;
            unten = becken.clone().addScaledVector(k.R.oben, sU).addScaledVector(k.R.vor, rumpfVorn(sU) + 0.014 + luft).addScaledVector(k.R.links, sg * breit);
            const vorn = smith ? (neig > 10 ? 0.16 : 0.1) : 0;   // so weit fußwärts der Schulter steht die Stange oben
            oben.copy(sch).addScaledVector(k.R.links, sg * dx).add(V(0, Math.sqrt(Math.max(0, (ARM * (o.griff === 'eng' ? 0.998 : 0.995)) ** 2 - dx * dx - vorn * vorn)), vorn));
          }
          let untenZiel = unten, ellUnten = null;
          if (last === 'kurzhanteln' && !boden && neig <= 0) {
            // Kurzhanteln: unten steht der Unterarm senkrecht unter der Hantel (Lehrbuch; bis 1.11. 11–16° schräg). Ellbogen 55° vom Rumpf
            // (Neutralgriff 40°, Negativbank 45°: Griff höchstens 2 Schulterbreiten), Oberarm 8° unter der Bankebene (nicht deutlich darunter);
            // die Hand liegt senkrecht über dem Ellbogen
            const a = (o.griff === 'neutral' ? 40 : neig < 0 ? 45 : 55) * RAD;
            const fussH = k.R.oben.clone().negate().setY(0).normalize(), linksH = k.R.links.clone().setY(0).normalize();
            const sinD = Math.sin(8 * RAD), cosD = Math.cos(8 * RAD);
            const u = linksH.multiplyScalar(sg * Math.sin(a) * cosD).addScaledVector(fussH, Math.cos(a) * cosD).add(V(0, -sinD, 0));
            ellUnten = sch.clone().addScaledVector(u, MASS.oberarm);
            untenZiel = genau(ellUnten.clone().add(V(0, UNTERARM, 0)));
          }
          hand[s] = mv(untenZiel, oben, t);
          const eng = o.griff === 'eng' || o.griff === 'neutral';
          // Ellbogen unter der Stange (Unterarm senkrecht) und etwa 45–70° vom Körper, nicht seitlich ausgestellt
          epol[s] = k.R.links.clone().multiplyScalar(sg * (o.griff === 'eng' ? 0.35 : o.griff === 'neutral' ? 0.75 : last === 'multipresse' && neig > 10 ? 0.42 : 0.55)).add(V(0, -1, 0)).add(k.R.oben.clone().multiplyScalar(eng ? -0.7 : -0.45));
          if (ellUnten) epol[s] = ellUnten.clone().sub(sch.clone().lerp(hand[s], 0.5));   // Ellbogen dorthin, wo er unten senkrecht unter der Hantel steht
          if (o.griff === 'neutral') flaeche[s] = k.R.links.clone().multiplyScalar(-sg);
        }
      }
      if (last === 'maschine' && art === 'druecken') { const sp = schraegBahn(); for (const [s, sg] of [['l', 1], ['r', -1]]) hand[s] = bogenHand(sp.h0(s, sg), sp.h1(s, sg), sp.C, t); }
      // Einarmig: die freie Hand hält sich seitlich an der Bankkante neben der Hüfte fest, der Arm liegt locker gebeugt am Körper (bis 5.11. lag sie auf dem Bauch, der Unterarm quer vor dem Hals)
      if (o.einarmig) { hand.r = genau(V(-0.175, 0.42, 0.345)); epol.r = V(-1, -0.25, 0); }
      const fuss = boden ? seiten((s, sg) => V(sg * 0.18, FY, 0.75)) : neig < 0 ? seiten((s, sg) => V(sg * 0.11, 0.869, 0.834)) : seiten((s, sg) => V(sg * 0.3, FY, 0.78));   // Negativbank: Beine eingehakt, Hüfte 60°, Knie 100°
      let kelch = null;
      if (last === 'kurzhanteln' && art === 'ueberzug') { const M = hand.l.clone().add(hand.r).multiplyScalar(0.5), q = ueberzugAchse(k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5), M, k.R.links), gr = kelchUm(M, q.U, q.v, k.R.links, true); hand.l = gr.hand.l; hand.r = gr.hand.r; kelch = gr.kelch; }
      return {
        pose: { becken, rumpf: r, kopf: { neigung: 0 }, hand, kelch, ellbogenPol: epol, handflaeche: flaeche, fuss, kniePol: neig < 0 ? seiten((s, sg) => V(sg * 0.05, 1, -0.4)) : seiten((s, sg) => V(sg * 0.3, 1, 0.3)), fussRicht: neig < 0 ? seiten((s, sg) => V(sg * 0.1, 0.72, 0.7)) : undefined, faust: o.einarmig ? { r: true } : undefined,
          handKnick: (last === 'langhantel' || last === 'multipresse') && art === 'druecken' && !boden ? seiten(() => 18) : undefined },   // Stange tief im Handballen, direkt über dem Unterarm (Handgelenk leicht nach hinten, nicht stark geknickt)
        props(g, z) {
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); if (last === 'sz') szStellen(z.lh, g); }
          if (last === 'kurzhanteln' && art === 'ueberzug') {
            // Hantel in Verlängerung der Arme, der obere Kopf liegt in den Handflächen
            const q = ueberzugAchse(g.schulter.l.clone().add(g.schulter.r).multiplyScalar(0.5), g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), g.R.links);
            kelchAn(z.kh_l, g, q.U, q.v, g.R.links, true);
          } else if (last === 'kurzhanteln') kurzhantelnAn(z, g, art === 'fliegende' && o.griffLaengs ? 'laengs' : art === 'fliegende' || art === 'stirn' || o.griff === 'neutral' ? 'hammer' : 'quer');   // Stirndrücken: Hanteln neben dem Kopf
          if (z.dm) drueckmaschineStellen(z, g, t);
        }
      };
    },
    aufhebeFrei: neig < 0,
    blick: V(0, 0.65, 0.05), abstand: 3.3, kameraRicht: V(1, 0.6, 0.45)
  };
}

// Liegestütz-Familie. art: normal | knie | wand | schraeg (Hände erhöht) | erhoeht (Füße erhöht) | eng | band
//   | archer | einarmig | einarmig_erhoeht | pseudo_planche | pike | pike_erhoeht | handstand | handstand_liegestuetz
// Neu: defizit (Hände auf Blöcken, Brust tiefer) | plyo (Hände lösen sich oben) | schulterblatt (Arme gestreckt, nur Schulterblätter)
// Ablauf davor (wirkt über animation()): standVersatz
export function liegestuetz(o = {}) {
  const art = o.art || 'normal';
  if (['archer', 'einarmig', 'einarmig_erhoeht', 'pseudo_planche'].includes(art)) return liegestuetzSchwer(art);
  if (['pike', 'pike_erhoeht', 'handstand', 'handstand_liegestuetz'].includes(art)) return kopfueber(art);
  if (art === 'schulterblatt') return schulterblattStuetz();
  return {
    aufbau(ger) {
      const z = {};
      // Wand nur als Fläche zur Figur hin: Von der anderen Seite sieht man durch sie hindurch auf Hände, Kopf und Ellbogen (bis 5.11. Quader: von vorn nur schwarze Wand, schräg verdeckte die Kante den Kopf)
      if (art === 'wand') {
        const w = ger.teil(new THREE.PlaneGeometry(1.4, 2.0), ger.mRahmen, V(0, 1.0, 0.95)); w.rotation.y = Math.PI;
        const glas = ger.teil(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.1, depthWrite: false }), V(0, 1.0, 0.95)); glas.castShadow = false; glas.receiveShadow = false; glas.userData.keinTeil = true;   // von der Rückseite als Hauch sichtbar
      }
      if (art === 'schraeg') ger.querbank(0.78, 0.45);   // Bank quer: die Kante ist breiter als der Griff, beide Hände liegen ganz auf (bis 5.11. Bank längs, 28 cm schmal, die Hände lagen daneben)
      if (art === 'erhoeht') ger.bank(-1.08, 0.45, 0.24, 0);   // Polster oben 0,295: die Zehen (tiefster Hautpunkt 0,283) liegen auf (bis 1.11. 0,455: der Fuß steckte im Polster)
      if (art !== 'wand') ger.matte();
      if (art === 'band') z.b1 = ger.stab(V(), V(0, 1, 0), 0.011, ger.mBand);
      if (art === 'defizit') for (const sx of [-1, 1]) ger.box(0.13, 0.1, 0.24, V(sx * 0.287, 0.05, 0.36), ger.mScheibe);   // Hand ganz auf dem Block, Finger ragen nicht vor
      return z;
    },
    pose(t) {
      // Körper als Brett um den Drehpunkt (Füße oder Knie); Hände stehen fest
      // Füße erhöht: Hände etwas weiter zur Brust (bis 1.11. 0,42: Brust blieb 10 cm über dem Boden, tiefer kamen die Ellbogen auf den Boden)
      // Sonst: oben unter den Schultern, unten liegen sie unter der unteren Brust (bis 5.11. 0,42: oben 9 cm vor den Schultern, unten lag der Unterarm flach auf der Matte)
      const handZ = art === 'wand' ? 0.94 : art === 'schraeg' ? 0.72 : art === 'erhoeht' ? 0.36 : art === 'defizit' ? 0.31 : art === 'knie' ? 0.35 : 0.335;
      const flug = art === 'plyo' ? 0.08 * glatt((t - 0.7) / 0.3) : 0;   // explosiv: erst wenn die Arme fast lang sind (Ellbogen 19°, so landet er auch wieder), lösen sich die Hände 8 cm von der Matte (bis 5.11. schon bei Ellbogen 50°)
      // Wand: Schulter auf einem Kreis um die Knöchel (Körper als Brett) und im Abstand der Armlänge von der Hand. Hände auf Brusthöhe, oben 19°, unten 31° zur Senkrechten
      // (bis 5.11. Füße 20 cm näher: nur 8–21°; dazu war der Arm oben 5 cm zu kurz für das Ziel). Ferse fest 20° gehoben, der Knöchel steht und rutscht nicht
      const WAND_FUSS = V(0, 0.1104, -0.02), LW = MASS.rumpf - 0.01 + BEIN * 0.9985, wandUnten = WAND_FUSS.y + Math.sqrt(LW * LW - (0.94 - 0.25 - WAND_FUSS.z) ** 2);
      const handY = (art === 'wand' ? wandUnten - 0.12 : art === 'schraeg' ? 0.5 : art === 'defizit' ? 0.14 : 0.04) + flug;
      const breit = art === 'eng' ? 0.185 : art === 'defizit' ? 0.287 : 0.24;   // eng: schulterbreit oder etwas enger (0,9×); Defizit 1,4×: tiefer ohne den Arm ganz zu falten
      const fussPunkt = art === 'wand' ? WAND_FUSS.clone() : art === 'erhoeht' ? V(0, 0.505, -0.98) : art === 'knie' ? V(0, 0.06, -0.46) : V(0, 0.11, -0.95);
      // Schulterhöhe über der Hand: oben Armlänge, unten knapp über Hand
      // Oben Arme gestreckt, unten Brust knapp über dem Boden
      const abstandOben = art === 'plyo' ? STUETZ * 0.985 : STUETZ * 0.997, abstandUnten = art === 'wand' ? Math.hypot(0.25, 0.12) : art === 'defizit' ? 0.16 : art === 'erhoeht' ? 0.15 : art === 'knie' ? 0.16 : art === 'schraeg' ? 0.25 : 0.155;   // Brust berührt fast den Boden (breiter Körper: nicht tiefer)
      // Explosiv: bis zum Abheben fast gestreckt (Landung mit 15–20° Ellbogen), in der Luft ganz lang
      const hoch = art === 'plyo' ? (t < 0.7 ? mix(abstandUnten, abstandOben, t / 0.7) : mix(abstandOben, STUETZ * 0.996, glatt((t - 0.7) / 0.3))) : mix(abstandUnten, abstandOben, t);
      // Schulter liegt auf der Linie von der Hand senkrecht zum Körper (vereinfacht: über der Hand, Richtung weg von der Wand)
      let sch;
      if (art === 'wand') sch = kreisSchnitt(fussPunkt, V(0, handY, handZ), LW, hoch);
      // Knie-Liegestütz: Knie bis Schulter bleibt eine Linie und dreht um die Knie (Knie bleiben am Boden)
      else if (art === 'knie') { const L = MASS.oberschenkel + MASS.rumpf - 0.01, y = handY + hoch; sch = V(0, y, fussPunkt.z + Math.sqrt(L * L - (y - fussPunkt.y) ** 2)); }
      // Hände erhöht: Körper schräg, Füße so nah, dass die Beine gestreckt bleiben
      else if (art === 'schraeg') { const bahn = schulterBahn(V(0, handY, handZ), fussPunkt.y, 0.09, abstandUnten, abstandOben, t, 0.11); sch = bahn.sch; fussPunkt.z = bahn.fussZ; }
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
      const epol = seiten((s, sg) => (art === 'wand' ? V(sg * 0.5, -1, -0.7) : V(sg * (art === 'eng' ? 0.4 : art === 'erhoeht' ? 0.15 : art === 'schraeg' ? 0.6 : 1), 0.5, -1)));
      let fuss, kpol;
      if (art === 'knie') {
        // Unterschenkel flach auf der Matte, Fuß 55° gestreckt, Zehen am Boden (bis 5.11. schwebte der Unterschenkel 25° über der Matte, der Fuß in Verlängerung des Schienbeins)
        fuss = seiten((s, sg) => V(sg * 0.1, 0.075, fussPunkt.z - MASS.unterschenkel * 0.998));
        kpol = seiten(() => V(0, -1, 0));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, flach, ellbogenPol: epol, fuss, kniePol: kpol, fussRicht: seiten(() => V(0, -0.574, -0.819)), fussFlaeche: seiten(() => V(0, -0.819, 0.574)) },
          props(g) { fingerStellen(g, (s, sg) => V(sg * 0.25, 0, 1)); } };
      }
      fuss = seiten((s, sg) => fussPunkt.clone().add(V(sg * 0.09, 0, 0)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, beinGerade: true, hand, flach, ellbogenPol: epol, fuss, kniePol: seiten(() => art === 'wand' ? V(0, 0, 1) : V(0, -1, 0)), fussRicht: seiten(() => art === 'wand' ? V(0, 0, 1) : V(0, -1, 0.2)), zehen: seiten(() => art === 'wand' ? 20 : 0) },
        props(g, z) {
          fingerStellen(g, (s, sg) => (art === 'wand' ? V(sg * 0.25, 1, 0) : V(sg * 0.25, 0, 1)));
          // Band läuft von Hand zu Hand über den oberen Rücken
          if (!z.b1) return;
          bandKette(z, 'b1', bandUeberRuecken(g));
        } };
    },
    blick: V(0, 0.45, 0), abstand: 3.4, kameraRicht: art === 'wand' ? V(1, 0.3, -0.4) : V(1, 0.35, 0.3), dauer: art === 'plyo' ? [0.4, 0.2, 0.9, 0.2] : undefined
  };
}

// Schnittpunkt zweier Kreise in der Ebene y-z: Abstand L von F (Knöchel) und d von H (Hand), der obere der beiden (Körper über der Linie F–H)
function kreisSchnitt(F, H, L, d) {
  const dy = H.y - F.y, dz = H.z - F.z, D = Math.hypot(dy, dz), a = (L * L - d * d + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L * L - a * a));
  return V(0, F.y + (a * dy + h * dz) / D, F.z + (a * dz - h * dy) / D);
}
// Flache Hand im Stütz: Die Finger zeigen immer dorthin. Ohne Angabe nimmt figur-modell.js die Richtung des Unterarms: die Hand drehte sich auf der Matte mit und sprang, sobald der Arm senkrecht stand
function fingerStellen(g, richt) { for (const [s, sg] of [['l', 1], ['r', -1]]) if (g.flach[s]) g.handFinger[s] = richt(s, sg).normalize(); }
// Band unter der linken Hand, außen am Arm vorbei, über die Schulter, flach über den oberen Rücken und genauso zur rechten Hand: gespannt, ein glatter Bogen (bis 5.11. eckig, stand neben Arm und Rücken ab)
function bandUeberRuecken(g) {
  const R = g.R, hinten = R.vor.clone().negate(), seite = (s, sg) => {
    const f = g.handFinger[s].clone(), S = g.schulter[s], aussen = R.links.clone().multiplyScalar(sg);
    return [
      g.handgelenk[s].clone().addScaledVector(f, 0.05).setY(g.handgelenk[s].y - 0.03),
      S.clone().addScaledVector(aussen, 0.088).addScaledVector(hinten, 0.02),
      S.clone().addScaledVector(aussen, 0.062).addScaledVector(hinten, 0.082).addScaledVector(R.oben, -0.012),
      S.clone().addScaledVector(aussen, -0.03).addScaledVector(hinten, 0.122).addScaledVector(R.oben, -0.05),
      S.clone().addScaledVector(aussen, -0.12).addScaledVector(hinten, 0.128).addScaledVector(R.oben, -0.065)
    ];
  };
  const links = seite('l', 1), rechts = seite('r', -1).reverse();
  return new THREE.CatmullRomCurve3([...links, ...rechts], false, 'centripetal').getPoints(40);
}
// Schulterblatt-Liegestütz: Hände und Arme stehen, die Schultergelenke auch; Bewegen tut sich nur der Körper zwischen den Schultern. t = 0: die Brust ist zwischen die Schultern gesunken (Schulterblätter zusammen),
// t = 1: Boden weggedrückt, der obere Rücken rund (Schulterblätter auseinander). Das Becken liegt still, der Brustkorb geht zwischen den Schultern gut 8 cm auf und ab: Wirbelsäule (beuge) und gleitendes Schulterblatt (schulterVor) zusammen.
// Bis 5.11. kam die Bewegung aus dem Ellbogen (4–20°), genau der Fehler aus dem App-Text; danach kippte nur der Körper um die feste Schulter, im Bild ein leichtes Wippen des Beckens
function schulterblattStuetz() {
  const handZ = 0.335, F = V(0, 0.11, -0.95), S = V(0, 0.04 + 0.005 + STUETZ * 0.9985, handZ - 0.005);
  return {
    aufbau(ger) { ger.matte(); return {}; },
    pose(t) {
      // Das Becken bleibt, wo es im geraden Brett läge, kippt aber mit: t = 0 Rücken gerade, der Brustkorb tiefer als die Schultern; t = 1 Becken eingerollt und der Rücken rund, der Brustkorb über den Schultern.
      // Die Schulter bleibt über der Hand: So weit, wie der Brustkorb sich hebt oder senkt, gleitet das Schulterblatt um ihn herum
      const R0 = S.clone().sub(F).normalize(), a = mix(-4, 6, t) * RAD, w0 = Math.atan2(R0.y, R0.z) + a;
      const w = { beuge: mix(0, 14, t) }, r = { basis: basisAus(V(0, Math.sin(w0), Math.cos(w0)), V(0, -1, 0)), neigung: 0 };
      const becken = beckenUnter(S, { basis: basisAus(R0, V(0, -1, 0)), neigung: 0 }, { beuge: 0 }), k = rumpf(becken, r, w), schulterVor = (S.y - k.schulter.l.y) / k.R.vor.y;
      return { pose: { becken, rumpf: r, wirbel: w, schulterVor, kopf: { neigung: -10 - w.beuge * 0.7 }, beinGerade: true, hand: seiten((s, sg) => V(sg * 0.24, 0.04, handZ)), flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.7, 0.5, -1)),
        fuss: seiten((s, sg) => F.clone().add(V(sg * 0.09, 0, 0))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -1, 0.2)), zehen: seiten(() => 0) },
        props(g) { fingerStellen(g, (s, sg) => V(sg * 0.25, 0, 1)); } };
    },
    blick: V(0, 0.45, 0), abstand: 3.4, kameraRicht: V(1, 0.35, 0.3), dauer: [0.8, 0.3, 0.8, 0.3]
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
function schulterBahn(hand, fussY, fussBreit, dUnten, dOben, t, zurueck = 0.03) {   // zurueck: unten Hand so weit vor der Schulter (Hände erhöht: Unterarm liegt sonst waagerecht)
  const L = MASS.rumpf - 0.01 + Math.sqrt((BEIN * 0.985) ** 2 - (fussBreit - MASS.hueftBreite) ** 2);
  const unten = V(0, hand.y + dUnten, hand.z - zurueck);
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
      let hand, sch, epol, fussBreit = 0.09, fussZ = art === 'pseudo_planche' ? -1.06 : -0.95;
      if (art === 'archer') {
        hand = { l: V(0.5, handY, handZ), r: V(-0.5, handY, handZ) };
        // oben beide Arme gestreckt: Schulterhöhe aus Armlänge und dem tatsächlichen Abstand Schulter → Hand (bis 1.11. 0,31 statt 0,295: 23° gebeugt)
        const x = mix(-0.24, 0, t), hoch = mix(0.22, Math.sqrt((STUETZ * 0.999) ** 2 - (0.5 - MASS.schulterBreite) ** 2 - 0.03 ** 2) + 0.005, t);   // + Handgelenk über der flachen Hand
        sch = V(x, handY + hoch, handZ - 0.03);
        epol = { l: V(0.3, 1, 0), r: V(-1, 0.3, -0.6) };
        fussBreit = 0.2;
      } else if (art === 'pseudo_planche') {
        // Hände unter dem Bauch, Schultern 32 cm davor. Oben Arme lang und die Schultern bleiben vorn (bis 5.11. Hände unter den Rippen, Schultern 20 cm davor, Ellbogen oben 35°)
        const hz = -0.07, L = MASS.rumpf - 0.01 + BEIN * 0.985, y = handY + mix(0.22, Math.sqrt((STUETZ * 0.998) ** 2 - 0.32 ** 2 - 0.035 ** 2) + 0.005, t);
        hand = seiten((s, sg) => V(sg * 0.24, handY, hz));
        sch = V(0, y, fussZ + Math.sqrt(L * L - (y - 0.11) ** 2));
        epol = seiten((s, sg) => V(sg * 0.3, 0.3, -1));
      } else {
        // einarmig: rechte Hand unter der Brust, linke Hand auf dem Rücken, Füße weit
        hand = { r: V(-0.1, handY, handZ) };
        fussBreit = 0.32;
        const bahn = schulterBahn(hand.r, 0.11, fussBreit, erhoeht ? 0.27 : 0.225, STUETZ * 0.99, t);   // unten Brust knapp über dem Boden, oben Arm lang (bis 5.11. oben 40° gebeugt)
        sch = bahn.sch.setX(0.02); fussZ = bahn.fussZ;
        epol = { r: V(-0.6, 0.3, -1), l: V(1, 1, 0) };
      }
      const stuetz = V(0, 0.11, fussZ);
      const b = brettPose(stuetz, sch);
      if (!hand.l) hand.l = b.becken.clone().add(V(0.06, 0.15, -0.02));
      return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -10 }, beinGerade: true, hand, ellbogenPol: epol, fuss: seiten((s, sg) => stuetz.clone().add(V(sg * fussBreit, 0, 0))),
        kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -1, 0.2)) },
        props(g) { fingerStellen(g, (s, sg) => (art === 'pseudo_planche' ? V(sg, 0, -0.45) : V(sg * 0.25, 0, 1))); } };   // Pseudo-Planche: Finger schräg nach außen und hinten
    },
    blick: V(0, 0.45, 0), abstand: 3.4, kameraRicht: V(1, 0.4, 0.3)
  };
}

// Pike auf der Box (45 cm hoch, vorn bei z = −0,3): Knöchel so hoch, dass der Fußballen bei 50° Fersenhub 1 cm über der Box liegt
const PIKE_FERSE = 50, PIKE_KNOECHEL = V(0, 0.45 + 0.072 + MASS.fussLaenge * BALLEN * Math.sin(PIKE_FERSE * RAD), -0.47);
// Rumpfrichtung (Becken → Schultern) mit den Schultern bei S, bei der die Hüftgelenke genau L vom Knöchel A liegen (Becken über den Schultern)
function rumpfZuKnoechel(S, A, L) {
  const p = Math.hypot(S.y - A.y, S.z - A.z), c = (p * p + 0.49 * 0.49 - L * L) / (2 * 0.49);
  const psi = Math.atan2(S.z - A.z, S.y - A.y) + Math.acos(Math.max(-1, Math.min(1, c / p)));
  return V(0, Math.cos(psi), Math.sin(psi));
}
// Kopfüber: Pike-Liegestütz, Handstand an der Wand (halten oder drücken)
function kopfueber(art) {
  const pike = art.startsWith('pike'), stand = art.startsWith('handstand');
  return {
    aufbau(ger) {
      ger.matte();
      if (art === 'pike_erhoeht') ger.box(0.5, 0.45, 0.4, V(0, 0.225, -0.5), ger.mPolster);
      if (stand) ger.box(1.4, 2.4, 0.08, V(0, 1.2, -0.13), ger.mRahmen);   // Knie und Oberschenkel lehnen an, nicht hinein
      return {};
    },
    pose(t) {
      let sch, oben, fuss, handZ = 0.42, kopf = 15;
      if (art === 'pike') {
        // Unten stoppt der Kopf 4 cm über der Matte vor den Händen, Ellbogen 110°; oben Arme gestreckt. Die Füße stehen fest, Beine lang: das Becken bleibt oben, der Rumpf kippt um die Hüfte
        // (bis 5.11. sank das Becken mit, die Beine schoben die Füße 10 cm nach hinten, der Kopf lag auf der Matte)
        const A = V(0, 0.143, -0.66);
        sch = mv(V(0, 0.34, 0.3), V(0, 0.62, 0.38), t);
        oben = rumpfZuKnoechel(sch, A, 0.886);
        fuss = seiten((s, sg) => A.clone().setX(sg * 0.1));
      } else if (art === 'pike_erhoeht') {
        // Fußballen auf der Box (Ferse 50° gehoben, Zehen flach darauf), Beine gestreckt: die Hüfte bleibt eine Beinlänge vom Knöchel weg und
        // der Rumpf kippt dafür (bis 31.10. waren die Knie 40° gebeugt, zu Beginn seitlich weggeklappt, und die Zehen steckten 6 cm in der Box)
        sch = mv(V(0, 0.36, 0.45), V(0, 0.61, 0.4), t);   // unten: Scheitel tippt den Boden gerade an (Rumpf fast senkrecht); oben Arme lang (bis 5.11. Ellbogen oben 50°)
        oben = rumpfZuKnoechel(sch, PIKE_KNOECHEL, 0.886);
        fuss = seiten((s, sg) => PIKE_KNOECHEL.clone().setX(sg * 0.1));
      } else {
        // Bauch zur Wand (Vorderseite bei z = −0,09): Hände 25 cm davor, Körper 8° gekippt, der Bauch ist fast an der Wand. Arme lang, die Schultern gehen zu den Ohren (Schultergürtel, gelenke);
        // bis 5.11. knickten die Arme 36–47°, der Halt sah aus wie die Mitte eines Handstand-Liegestützes
        handZ = 0.16;
        const tief = art === 'handstand' ? 0 : mix(0.245, 0, t);   // unten: Scheitel knapp über dem Boden
        sch = V(0, 0.045 + STUETZ * 0.9992 - tief, handZ + (art === 'handstand' ? 0 : 0.02 * (1 - t)));
        // Füße lehnen an der Wand: Körper kippt mit den Füßen zur Wand
        oben = V(0, -1, 0.125 + (art === 'handstand' ? 0 : 0.1 * (1 - t)));
        fuss = null;
        kopf = 25;
      }
      const o = oben.clone().normalize();
      const becken = sch.clone().sub(o.clone().multiplyScalar(MASS.rumpf - 0.03));
      const r = { basis: basisAus(o, stand ? V(0, 0, -1) : V(0, -1, -0.4)), neigung: 0 };
      // Beine fast gestreckt (bis 31.10. 0,96: Knie knickten 6 cm zur Wand, 2,6 cm hinein)
      if (!fuss) fuss = seiten((s, sg) => { const f = becken.clone().sub(o.clone().multiplyScalar(BEIN * 0.98)).add(V(sg * 0.09, 0, 0)); if (stand) f.z = Math.max(f.z, -0.015); return f; });   // an der Wand: Zehen liegen an, nicht darin
      const hand = seiten((s, sg) => V(sg * 0.22, 0.04, handZ));
      return { pose: { becken, rumpf: r, kopf: { neigung: kopf }, beinGerade: true, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, 0.3, -1)),
        fuss, kniePol: seiten(() => stand ? V(0, 0, -1) : art === 'pike_erhoeht' ? V(0, -1, 0.3) : V(0, 0.3, 1)), fussRicht: seiten(() => stand ? V(0, 1, -0.65) : art === 'pike_erhoeht' ? V(0, 0, 1) : V(0, -0.4, 1)),
        fussFlaeche: art === 'pike_erhoeht' ? seiten(() => V(0, 1, 0)) : undefined, zehen: seiten(() => (art === 'pike_erhoeht' ? PIKE_FERSE : pike ? 35 : 0)) },
        props(g) { fingerStellen(g, (s, sg) => V(sg * 0.25, 0, 1)); } };
    },
    blick: V(0, 0.8, 0.2), abstand: 3.6, kameraRicht: stand ? V(0.9, 0.2, 1) : V(1, 0.25, 0.35), dauer: art === 'handstand' ? STATISCH : undefined
  };
}

// Schulterpresse an der Maschine: Becken und Rumpf wie sitzendes Drücken; Griffe (Neutralgriff) auf dem Bogen um eine Drehachse hinten
const SP_BECKEN = V(0, 0.56, -0.08), SP_RUMPF = { neigung: -4 };
const spSchulter = (sg) => rumpf(SP_BECKEN, SP_RUMPF).schulter[sg > 0 ? 'l' : 'r'];
// Griffe etwa auf Schulterhöhe vor den Schultern: Oberarm 45°, Ellbogen knapp 120° (bis 5.11. Griff fast an der Schulter, Ellbogen 147°, eng am Rumpf wie beim Arnold Press); oben Ellbogen 8°
const spUnten = (sg) => spSchulter(sg).add(V(sg * 0.13, 0.12, 0.3)), spOben = (sg) => spSchulter(sg).add(V(sg * 0.07, ARM * 0.99, 0.02));
const SP_C = bogenMitte(spUnten(1), spOben(1), { z: -0.7 });
// Schulterdrücken. last: langhantel | kurzhanteln | maschine | kettlebell | band ; sitzend: bool ; art: druecken | arnold | landmine
// Neu: art pushpress (Langhantel, kurzer Kniestoß) ; last multipresse ; einarmig (links drückt, rechts an der Hüfte) ; boden (Z-Press, am Boden sitzend)
// Ablauf davor (wirkt über animation()): ablaufBand (enden: ein Band unter beiden Füßen, je ein Ende in der Hand; die Figur steigt darauf und nimmt die Enden vom Boden auf)
export function schulterdruecken(o = {}) {
  const last = o.last || 'kurzhanteln', art = o.art || 'druecken', sitzend = o.sitzend !== false && last !== 'langhantel' ? !!o.sitzend : false;
  const stange = last === 'langhantel' || last === 'multipresse', boden = !!o.boden;
  if (art === 'landmine') return landmine(o);
  return {
    ablaufT: last === 'multipresse' ? 1 : 0,   // Multipresse: Die Stange wird oben ausgehängt. Beim Hinsetzen hängt sie über dem Kopf, nicht in Brusthöhe im Weg
    aufbau(ger) {
      const z = {};
      if (sitzend && !boden && last !== 'maschine') { ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.05), ger.mPolster); ger.box(0.36, 0.7, 0.08, V(0, 0.85, -0.25), ger.mPolster, last === 'multipresse' ? -2 : -5); }
      if (boden) ger.matte();
      if (stange) z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell' && o.einarmig) z.kb = ger.kettlebell();
      else if (last === 'kurzhanteln' || last === 'kettlebell') khAufbauen(ger, z, !o.einarmig);
      if (last === 'maschine') drueckmaschineBauen(ger, z, SP_BECKEN, SP_RUMPF, SP_C, 'laengs', { titel: 'SCHULTERPRESSE', untertitel: 'SCHULTERN', dir: 1, rN: 0.22, dth: 0.8 });
      if (last === 'band') { z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_unter = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      return z;
    },
    pose(t) {
      // Push Press: erst kurz in die Knie (Stange bleibt vorn auf den Schultern, unten bei t = 0,16), dann strecken die Beine, und erst daraus drücken die Arme. 6 cm, Knie 44°: kürzer ist kein Dip mehr
      const dip = art === 'pushpress' ? 0.06 * (glatt(t / 0.16) - glatt((t - 0.16) / 0.2)) : 0;
      const u = art === 'pushpress' ? glatt((t - 0.22) / 0.78) : t;   // Anteil des Armwegs
      const becken = boden ? V(0, 0.12, -0.15) : sitzend ? V(0, 0.56, -0.08) : V(0, 0.975 - dip, 0);
      const r = { neigung: boden ? 2 : sitzend ? (last === 'multipresse' ? -2 : -4) : -2 };   // Multipresse: fast senkrechte Lehne (Text)
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const sch = k.schulter[s];
        const breit = stange || last === 'maschine' ? 0.1 : 0.08, vorS = last === 'langhantel' ? 0.17 : 0.14;
        const griffX = last === 'langhantel' ? 0.04 : breit;   // Langhantel: Griff 1,2× Schulter (Text: schulterbreit), die Ellbogen stehen knapp außerhalb der Hände
        // Arnold: unten Hände vor dem Gesicht, Ellbogen vorn; oben wie normales Drücken
        // Unten: Stange vorn auf Schulterhöhe (Schlüsselbein), Hanteln seitlich etwa auf Ohrhöhe; oben Arme gestreckt über den Schultern
        // Langhantel: Startposition wie im Lehrbuch – Unterarme von vorn und seitlich senkrecht unter der Stange, die vorn auf den Schultern
        // vor dem Hals liegt; Höhe daraus, dass der Ellbogen eine Oberarmlänge von der Schulter weg genau unter der Hand steht (bis 1.11.: 8 cm
        // über dem Schultergelenk, Unterarm 12° schräg)
        const startHoch = Math.sqrt(MASS.oberarm ** 2 - breit ** 2 - vorS ** 2), ellStart = sch.clone().add(V(sg * breit, -startHoch, vorS));
        // Kettlebell: Rack vor dem Schlüsselbein, Oberarm 25° nah am Rumpf, Ellbogen 140° (bis 5.11. Start der Kurzhantel seitlich am Kopf)
        const rackE = sch.clone().add(V(sg * 0.065, -0.26, 0.115));
        const unten = art === 'arnold' ? sch.clone().add(V(-sg * 0.02, 0.07, 0.21)) : last === 'kettlebell' ? genau(sch.clone().add(V(-sg * 0.03, 0.085, 0.22))) : last === 'langhantel' ? ellStart.clone().add(V(sg * (griffX - breit), Math.sqrt(UNTERARM ** 2 - (griffX - breit) ** 2), 0)) : stange || last === 'maschine' ? sch.clone().add(V(sg * breit, 0.08, 0.14)) : sch.clone().add(V(sg * 0.17, 0.19, 0.13));
        const oben = sch.clone().add(V(sg * (stange ? griffX : breit - 0.03), ARM * 0.995, 0.02));   // Stange: die Hände bleiben, wo sie sind (bis 5.11. rutschten sie auf der Stange 3 cm)
        hand[s] = last === 'maschine' ? bogenHand(spUnten(sg), spOben(sg), SP_C, t) : mv(unten, oben, u);
        // Stange: geht senkrecht vor dem Gesicht hoch (Kinn und Nase bleiben dahinter, der Kopf nimmt sich leicht zurück) und erst
        // über der Stirn zurück über die Schultern
        // Multipresse: Führungen stehen fest, die Stange läuft senkrecht vor dem Gesicht
        // Unten liegt die Stange in Kinnhöhe vor dem Gesicht, die Führung läuft 8° schräg zum Körper hin: oben steht sie nah über der Schulter (Oberarm rund 165°). Der Ellbogenwinkel ändert sich gleichmäßig, daraus folgt die Höhe; linear in der Höhe sprang der Ellbogen kurz vor dem Strecken (bis 5.11. Stange senkrecht 20 cm vor der Schulter: oben 156°, Ellbogen 7 cm in einem Bild)
        if (last === 'multipresse') {
          const d = armLang(mix(140, 7, u)), m = Math.tan(8 * RAD), c = 0.19 + m * 0.13, p = 1 + m * m, bx = 0.07, y = (c * m + Math.sqrt(c * c * m * m - p * (c * c + bx * bx - d * d))) / p;
          hand[s] = genau(sch.clone().add(V(sg * bx, y, c - m * y)));
        }
        else if (stange) hand[s].z = sch.z + vorS + 0.03 * Math.sin(Math.PI * Math.min(1, u / 0.7)) - (vorS - 0.02) * glatt((u - 0.45) / 0.55);
        // Ellbogen unten etwa 30–60° vor der Körperseite (Schulterblattebene), nicht ganz seitlich
        epol[s] = art === 'arnold' ? mv(V(sg * 0.15, -1, 1), V(sg, -1, 0.6), glatt(t * 1.4)) : V(sg, -1, last === 'maschine' ? 1.35 : stange ? 1.2 : 1.0);
        if (last === 'multipresse') epol[s] = sch.clone().add(V(sg * 0.144, -0.221, 0.121)).sub(sch.clone().lerp(hand[s], 0.5)).normalize().lerp(V(sg, -0.6, -0.25).normalize(), glatt(u));   // unten Ellbogen 40° vor der Körperebene, oben zeigt er locker nach außen
        if (last === 'langhantel' && art !== 'arnold') epol[s] = ellStart.clone().sub(sch.clone().lerp(hand[s], 0.5)).normalize().lerp(epol[s].clone().normalize(), glatt(u));   // unten Ellbogen genau unter der Hand
        if (last === 'kettlebell') epol[s] = rackE.clone().sub(sch.clone().lerp(unten, 0.5)).normalize().lerp(epol[s].clone().normalize(), glatt(t));
        if (last === 'maschine') { const uM = spUnten(sg), E0 = sch.clone().add(V(sg * 0.168, -0.205, 0.118)); epol[s] = E0.sub(sch.clone().lerp(uM, 0.5)).normalize().lerp(epol[s].clone().normalize(), glatt(t)); }   // unten Oberarm 45° gehoben, 35° vor der Körperseite
      }
      if (o.einarmig) { hand.r = becken.clone().add(V(-0.17, 0.05, 0.06)); epol.r = V(-1, 0, -0.5); }
      // Am Boden: Beine gestreckt, Füße locker 15° gestreckt, die Fersen liegen auf (bis 5.11. Knie 27°, der Fuß nach vorn geklappt wie auf einem Boden, auf dem er steht)
      const fuesse = boden ? { beinGerade: true, fuss: seiten((s, sg) => V(sg * 0.16, 0.075, -0.15 + BEIN * 0.998)), kniePol: seiten(() => V(0, 1, 0)), fussRicht: seiten((s, sg) => V(sg * 0.25, 0.966, 0.259)), fussFlaeche: seiten(() => V(0, 0.259, -0.966)) }
        : sitzend ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.14);
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kopf: { neigung: stange ? -12 * Math.sin(Math.PI * Math.min(1, u / 0.65)) : 0 }, handflaeche: last === 'maschine' ? seiten((s, sg) => V(-sg, 0, 0))
          : last === 'kettlebell' ? { l: mv(V(-1, 0, 0.25), V(-0.15, 0, 1), glatt(t)) }   // Rack: Handfläche zum Körper, die Kugel außen am Unterarm; oben nach vorn
          : art === 'arnold' ? seiten((s, sg) => { const w = Math.PI * glatt(Math.min(1, t * 1.4)); return V(-sg * Math.sin(w), 0, -Math.cos(w)); }) : undefined }, fuesse),
        props(g, z) {
          if (z.dm) drueckmaschineStellen(z, g, t);
          if (z.lh) { stangeAn(z.lh, g); schienenAn(z); }
          if (z.kb) kettlebellAn(z.kb, g, 'l');
          if (z.kh_l && art === 'arnold') for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], faustAchse(g, s));
          else if (z.kh_l) kurzhantelnAn(z, g, 'quer');
          if (z.band_l) {
            for (const [s, sg] of [['l', 1], ['r', -1]]) bandKette(z, 'band_' + s, umDenKoerper(g, bandAmFuss(g, s, sg), g.hand[s], 0.012, g.R.links.clone().multiplyScalar(sg)));
            seil(z.band_unter, bandAmFuss(g, 'l', 1), bandAmFuss(g, 'r', -1));   // unter beiden Füßen durch: ein Band (bis 5.11. nur zwei Stücke)
          }
        }
      };
    },
    blick: V(0, 1.1, 0), abstand: 3.6, dauer: art === 'pushpress' ? [0.8, 0.4, 1.6, 0.5] : undefined
  };
}

// Landmine-Drücken: Ein Stangenende steckt vorn am Boden in der Halterung, das andere liegt in beiden Händen vor der Brust (Hände hintereinander am Stangenende). Die Stange schwenkt um die Halterung,
// die Hände gehen auf diesem Bogen rund 50° schräg nach vorn-oben, oben Oberarm 125° und Arm fast gestreckt. Leichte Schrittstellung, Rumpf 14° vor. Vorne endet die Stange kurz hinter der oberen Hand, die Brust bleibt frei
function landmine(o) {
  const anker = V(0, 0.03, 2.2126), h0 = V(0, 1.256, 0.364), h1 = V(0, 1.6154, 0.6612);
  return {
    aufbau(ger) {
      const z = { stange: ger.zyl(0.022, 1, ger.mMetall), huelse: ger.zyl(0.034, 1, ger.mRahmen) };
      z.scheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28);
      ger.box(0.24, 0.03, 0.24, anker.clone().setY(0.015), ger.mRahmen);
      ger.box(0.08, 0.06, 0.08, anker, ger.mRahmen);
      return z;
    },
    pose(t) {
      const ende = bogenHand(h0, h1, anker, t), richt = ende.clone().sub(anker).normalize();
      const hand = { l: genau(ende.clone().addScaledVector(richt, 0.048)), r: genau(ende.clone().addScaledVector(richt, -0.048)) };
      return { pose: { becken: V(0, 0.93, -0.05), rumpf: { neigung: 14 }, kopf: { neigung: -6 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.6, -1, -0.1)), fuss: { l: V(0.13, FY, 0.2), r: V(-0.13, 0.1104, -0.42) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) {
          const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), d = m.clone().sub(anker).normalize();
          seil(z.stange, anker, m.clone().addScaledVector(d, 0.078));
          seil(z.huelse, anker, anker.clone().addScaledVector(d, 0.28));
          z.scheibe.position.copy(m).addScaledVector(d, -0.26); z.scheibe.quaternion.setFromUnitVectors(V(0, 1, 0), d);
        } };
    },
    blick: V(0, 1.0, 0.8), abstand: 4.2, kameraRicht: V(1, 0.3, 0.25)
  };
}

const KSH_TURM = V(-0.78, 0, 0.12);   // Kabel-Seitheben: Turm rechts neben der Figur, so weit weg, dass die freie Hand ihn mit fast gestrecktem Arm hält
const SEIL_AUFRECHT = 0.42;   // Aufrechtes Rudern: Rolle so nah vor den Füßen, dass das Kabel höchstens 20–25° aus der Senkrechten läuft (bis 5.11. 0,7: bis 30° schräg, die Figur stand zu weit weg)
const SH_EBENE = 20 * RAD;   // Seitheben-Maschine: Ebene der Arme vor der Körperseite (Regel 20–40°, Griff oben 1,7× Schulterbreite; bis 5.11. 28°, 1,4×)
const shAchse = (sg) => V(-sg * Math.sin(SH_EBENE), 0, Math.cos(SH_EBENE)), shQuer = (sg) => V(sg * Math.cos(SH_EBENE), 0, Math.sin(SH_EBENE));   // Drehachse des Hebels (durch die Schulter), Richtung nach außen
// Schrägbank für Heben mit Bauch und Brust auf dem Polster: durchgehendes Polster vom Becken bis zur Brust, Holm darunter, zwei Stützen mit Füßen vor den Zehen, unter dem Polster ist Platz für die Beine
function schraegPolsterBauen(ger, becken, r) {
  const R = rumpfRahmen(r), punkt = (s, v) => becken.clone().addScaledVector(R.oben, s).addScaledVector(R.vor, v);
  const a = punkt(0.0, 0.17 + 0.04), e = punkt(0.6, 0.255 + 0.04), richt = e.clone().sub(a).normalize();   // langes Polster (60 statt 42 cm): Bauch und Brust liegen ganz auf (bis 5.11. kurzes Polster nur unter der Brust)
  ger.polster(0.3, a.distanceTo(e), 0.08, a.clone().lerp(e, 0.5), basisAus(richt, R.vor));
  const h = R.vor.clone().multiplyScalar(0.075), A = a.clone().add(h), E = e.clone().add(h);
  ger.vierkant(A, E, 0.07);
  const bei = (zz) => A.clone().lerp(E, (zz - A.z) / (E.z - A.z));
  for (const zz of [0.36, 0.6]) { const p = bei(zz); ger.vierkant(V(0, 0.05, zz), p, 0.07); ger.vierkant(V(-0.26, 0.035, zz), V(0.26, 0.035, zz), 0.07); }
  ger.vierkant(V(0, 0.035, 0.36), V(0, 0.035, 0.6), 0.07);
}
// Seitheben-Maschine, Ablauf davor: vor dem Gerät stehen, Hände vor den Bauch, rückwärts durch die Griffe hindurch hinsetzen (die Griffe stehen so breit, dass das Becken dazwischen passt; bis 5.11. ging der Oberschenkel durch den Griff)
function seithebenMaschineAblauf({ Gp, stehen }) {
  const an = (p) => Object.assign({}, p, { hand: seiten((s, sg) => p.becken.clone().add(V(sg * 0.06, 0.13, 0.27))), handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.15, -1, -0.5)), flach: { l: null, r: null } });
  return { name: 'sitzen', blick: V(0, 0, 1), stand: V(0, 0, 0.62), von: V(1.3, 0, 1.15), schritte: [{ ziel: an(stehen(V(0, 0, 0.62), 0)), d: 0.4 }, { ziel: an(Gp), d: 1.2 }, { ziel: Gp, d: 0.8, verzug: 0.35 }] };
}
// Heben für die Schulter: art: seitheben | frontheben | reverse_fly | ytw ; last: kurzhanteln | kabel | maschine | band ; vorgebeugt: bool ; sitzend ; brustgestuetzt: bool (Schrägbank)
// Neu: art aufrecht (aufrechtes Rudern, Kabel vorn unten) | y (Y-Heben, zwei Kabel überkreuzt) ; last scheibe (Frontheben mit Hantelscheibe) ; angelehnt (Seitheben einarmig, rechts am Pfosten)
// Ablauf davor (wirkt über animation()): standVersatz, ablaufBand (true | stange: Griffstange liegt vor den Füßen)
export function schulterheben(o = {}) {
  const art = o.art || 'seitheben', last = o.last || 'kurzhanteln';
  const yKabel = art === 'y' && last === 'kabel', angelehnt = !!o.angelehnt;
  if (art === 'reverse_fly' && last === 'maschine' && !o.brustgestuetzt) return schulterzug({ art: 'reverse_butterfly' });
  const SH_BECKEN = V(0, 0.56, -0.05), SH_RUMPF = { neigung: 2 };   // Seitheben-Maschine: sitzend, aufrecht
  const SH_BAUCH = V(0, 0.95, -0.02);   // Bauch auf der Schrägbank: Füße flach am Boden, Knie 25° (bis 5.11. fast durchgedrückt, 4°)
  const vorgebeugt = art === 'reverse_fly' && !o.brustgestuetzt;
  const maschine = art === 'seitheben' && last === 'maschine';   // Seitheben-Maschine: sitzend, Polster außen am Oberarm
  const sitzend = (!!o.sitzend || maschine) && !vorgebeugt && !o.brustgestuetzt;
  return {
    ablaufEigen: maschine ? seithebenMaschineAblauf : undefined,
    aufbau(ger) {
      const z = {};
      if (maschine) r1_seithebenBauen(ger, z, SH_BECKEN, SH_RUMPF);   // R1: DK Line
      if (last === 'kurzhanteln') khAufbauen(ger, z, !angelehnt);
      if (last === 'scheibe') { z.scheibe = ger.zyl(0.2, 0.05, ger.mScheibe, 28); }
      if (last === 'band') { z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_unter = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }   // Band unter beiden Mittelfüßen, je ein Ende in der Hand
      if (angelehnt) ger.box(0.08, 1.8, 0.08, V(-0.45, 0.9, 0.05), ger.mRahmen);
      if (yKabel) { r3_setze(z, r3_turm(ger, V(-0.62, 0.15, 0.12), V(-1, 0, 0), V(0.35, 0.25, 1), 'KABELZUG', 'SCHULTERN', { hMax: 0.7 }), r3_turm(ger, V(0.62, 0.15, 0.12), V(1, 0, 0), V(0.35, 0.25, 1), 'KABELZUG', 'SCHULTERN', { hMax: 0.7 })); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); }   // R3: zwei DK-Kabeltürme, Seil kreuzt
      else if (last === 'kabel') {
        // Seitheben: Turm rechts neben der Figur, Rolle unten etwas vor der Körperebene (das Kabel läuft vor den Beinen zur linken Hand)
        // R3: DK-Kabelturm; die Öse sitzt, wo das Seil bisher ausgetreten ist (Seitheben rechts neben der Figur, Stapel nach außen; Aufrechtes Rudern vor, Frontheben hinter der Figur)
        const aK = art === 'seitheben' ? KSH_TURM.clone().add(V(0.06, 0.15, 0)) : V(0, art === 'reverse_fly' ? 1.6 : 0.15, art === 'aufrecht' ? SEIL_AUFRECHT : art === 'reverse_fly' ? 0.7 : -0.55);
        r3_setze(z, r3_turm(ger, aK, art === 'seitheben' ? V(-1, 0, 0) : V(0, 0, aK.z > 0 ? 1 : -1), art === 'aufrecht' ? V(0.8, 0.25, 0.6) : V(0.35, 0.25, 1), 'KABELZUG', 'SCHULTERN')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel);
        if (art === 'frontheben' || art === 'aufrecht') z.griff = ger.griff(art === 'aufrecht' ? 0.62 : 0.46);
        // Griff am Turm für die freie Hand (Text: „mit freier Hand festhalten“)
        if (art === 'seitheben') { const x = KSH_TURM.x + 0.1, zz = KSH_TURM.z; griffRohr(ger, V(x, 0.92, zz), V(x, 1.08, zz)); for (const y of [0.93, 1.07]) r3_halter(ger, z.dkTurm[0], V(x, y, zz), 0.024); }   // R3: Halter an der Flanke der Säule, das Seil an der Öse bleibt frei
      }
      if (o.brustgestuetzt) schraegPolsterBauen(ger, SH_BAUCH, { neigung: 45 });
      if (sitzend && !maschine) ger.bank(-0.3, 0.9, 0.41, 0);   // Flachbank, die Figur sitzt am vorderen Ende (bis 5.11. ein Würfel)
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      const lehnt = art === 'seitheben' && last === 'kurzhanteln' && !angelehnt;   // Text: leicht vorgebeugt, aus der Hüfte, der Rücken bleibt gerade
      const becken = vorgebeugt ? V(0, 0.88, -0.12) : o.brustgestuetzt ? SH_BAUCH.clone() : sitzend ? SH_BECKEN.clone() : angelehnt ? V(0.13, 0.955, 0.02) : lehnt ? V(0, 0.965, -0.035) : V(0, 0.975, 0);
      const r = { neigung: vorgebeugt ? 60 : o.brustgestuetzt ? 45 : lehnt ? (sitzend ? 7 : 12) : 2, seit: angelehnt ? 14 : 0 };
      if (maschine) {
        // Der Oberarm hebt den Hebel: Ellbogen 90° gebeugt, der Unterarm liegt in Richtung der Drehachse und bleibt waagerecht, die Hand hält den Griff nur locker, die Ellbogen führen, bis Schulterhöhe in der
        // Schulterblattebene. Bis 5.11. Arm fast gestreckt wie beim freien Seitheben, die Hände griffen ins Leere
        const k = rumpf(becken, r), w = mix(26, 88, t) * RAD, hand = {}, epol = {}, flaeche = {};   // unten bleibt das Gewicht im Hebel, der Oberarm 26° vom Körper: die Griffe stehen breiter als das Becken (bis 5.11. 14°, der Oberschenkel stieß beim Hinsetzen daran)
        for (const [sd, sg] of [['l', 1], ['r', -1]]) {
          const Q = shQuer(sg), u = V(0, -Math.cos(w), 0).addScaledVector(Q, Math.sin(w)), E = k.schulter[sd].clone().addScaledVector(u, MASS.oberarm);
          hand[sd] = genau(E.clone().addScaledVector(shAchse(sg), UNTERARM));
          epol[sd] = E.clone().sub(k.schulter[sd].clone().lerp(hand[sd], 0.5));
          flaeche[sd] = Q.clone().multiplyScalar(-Math.cos(w)).add(V(0, -Math.sin(w), 0));   // Handfläche innen, oben nach unten: der Unterarm bleibt neutral und dreht mit dem Hebel
        }
        return { pose: { becken, rumpf: r, hand, handflaeche: flaeche, ellbogenPol: epol, fuss: seiten((sd, sg) => V(sg * 0.22, FY, 0.42)), kniePol: seiten((sd, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            for (const [sd, sg] of [['l', 1], ['r', -1]]) {
              const P = z['shDreh_' + sd], S = g.schulter[sd], a = shAchse(sg), u = g.ellbogen[sd].clone().sub(S).normalize();
              // Polster außen am Oberarm kurz über dem Ellbogen (die Seite, in die der Arm hebt: unten außen, oben obendrauf), es liegt an
              const aussen = a.clone().cross(u).normalize().multiplyScalar(sg), pad = S.clone().addScaledVector(u, MASS.oberarm * 0.8).addScaledVector(aussen, 0.087);
              z['pad_' + sd].position.copy(pad); z['pad_' + sd].quaternion.copy(basisAus(u, a));
              const hinten = P.clone().add(pad).sub(S), vorn = pad.clone().addScaledVector(a, UNTERARM);
              seil(z['shArm_' + sd], P, hinten); seil(z['shVor_' + sd], hinten, pad.clone().addScaledVector(a, -0.065));
              seil(z['shHand_' + sd], pad.clone().addScaledVector(a, 0.065), vorn); seil(z['shStift_' + sd], vorn, g.hand[sd].clone().addScaledVector(u, -0.062));
              z['shGriff_' + sd].position.copy(g.hand[sd]); z['shGriff_' + sd].quaternion.identity();
            }
            z.dkSeil.stelleV(['l', 'r'].map((sd) => g.ellbogen[sd].clone().sub(g.schulter[sd])));   // R1: der Stapel hebt sich nur über das Seil (Richtung des Oberarms)
          } };
      }
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (last === 'kabel' && art === 'seitheben' && s === 'r') { hand[s] = V(KSH_TURM.x + 0.1, 1.0, KSH_TURM.z); epol[s] = V(-0.6, -1, -0.4); continue; }   // freie Hand am Griff am Turm, Arm fast gestreckt (bis 5.11. auf der Hüfte)
        if (last === 'kabel' && art === 'seitheben') {
          // Kabel-Seitheben wie im Lehrbuch (ExRx, Strengthlog): Griff in der fernen Hand, sie startet vor der anderen Hüfte, das Kabel läuft vor
          // dem Körper; Arm fast gestreckt seitlich in der Schulterblattebene bis Schulterhöhe. Bis 31.10. kam das Kabel von hinten durch das Bein
          const d0 = becken.clone().add(V(-0.02, -0.145, 0.17)).sub(k.schulter[s]).normalize(), w1 = 82 * RAD;
          const d1 = V(0, -Math.cos(w1), 0).addScaledVector(k.R.links, sg * Math.sin(w1)).addScaledVector(k.R.vor, 0.05 + 0.55 * Math.sin(w1)).normalize();
          hand[s] = k.schulter[s].clone().addScaledVector(d0.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(d0, d1), t)), ARM * 0.985);
          epol[s] = V(0, 1, 0).addScaledVector(k.R.vor, -0.3); continue;
        }
        if (angelehnt && s === 'r') { hand[s] = V(-0.41, 1.15, 0.05); epol[s] = V(-0.5, -1, 0); continue; }
        const sch = k.schulter[s];
        if (art === 'aufrecht') {
          // Griff 1,15× Schulter (Text: mindestens schulterbreit; bis 5.11. 0,5×, genau der Fehler aus dem Text), Stange vom Oberschenkel bis unter die Brust, Ellbogen führen nach oben-außen
          // Ellbogen höchstens bis knapp unter Schulterhöhe (unter 90° Abspreizen): Stange bis zur unteren Brust. Unten Arme lang (Ellbogen 10–15°, bis 5.11. 34°)
          hand[s] = mv(V(sg * 0.235, 0.797, 0.12), k.brust.clone().add(V(sg * 0.235, -0.3, 0.13)), t);
          epol[s] = V(sg, 0.45, -0.25); continue;
        }
        if (yKabel) {
          // Arme starten überkreuzt vor der Hüfte und gehen schräg nach oben-außen (Y)
          const w = mix(10, 150, t) * RAD;
          const d = V(0, -Math.cos(w), 0).add(k.R.links.clone().multiplyScalar(sg * 0.6 * Math.sin(w))).add(k.R.vor.clone().multiplyScalar(0.45 * Math.sin(w) + 0.2));
          // Abstand zur Schulter fest: Ellbogen 10–20° über den ganzen Weg, wie auf der Schrägbank (bis 5.11. 37–63°, sah nach Ziehen aus)
          hand[s] = sch.clone().add(d.normalize().multiplyScalar(ARM * 0.988).add(V(-sg * 0.22 * (1 - glatt(t * 1.6)), 0, 0)).normalize().multiplyScalar(ARM * 0.988));
          epol[s] = V(sg, 0.3, -0.5); continue;
        }
        let w = mix(art === 'reverse_fly' ? 7 : 8, art === 'ytw' ? 160 : lehnt ? 77 : 82, t) * RAD;
        let richtung;
        if (art === 'frontheben') richtung = k.R.oben.clone().multiplyScalar(-Math.cos(w)).add(k.R.vor.clone().multiplyScalar(Math.sin(w))).add(k.R.links.clone().multiplyScalar(sg * 0.1));
        else if (art === 'reverse_fly') richtung = k.R.oben.clone().multiplyScalar(-Math.cos(w) * 0.3).add(V(0, -Math.cos(w), 0)).add(k.R.links.clone().multiplyScalar(sg * Math.sin(w)));
        else if (art === 'ytw') {
          const unten = V(0, -1, 0).add(k.R.links.clone().multiplyScalar(sg * 0.12)).normalize();
          const y = k.R.oben.clone().multiplyScalar(0.86).add(k.R.links.clone().multiplyScalar(sg * 0.5)).sub(k.R.vor.clone().multiplyScalar(0.06)).normalize();
          richtung = unten.clone().applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(unten, y), glatt(t)));
        }
        // Seitheben in der Schulterblattebene (etwa 30° vor der Seite), bis Schulterhöhe; Ellbogen nur leicht gebeugt
        else richtung = V(0, -Math.cos(w), 0).add(k.R.links.clone().multiplyScalar(sg * Math.sin(w))).add((lehnt ? V(0, 0, 1) : k.R.vor.clone()).multiplyScalar(0.05 + 0.55 * Math.sin(w)));   // vorgebeugt: die Hanteln hängen trotzdem senkrecht
        hand[s] = sch.clone().add(richtung.normalize().multiplyScalar(ARM * 0.985));
        if (last === 'scheibe') hand[s].add(k.R.links.clone().multiplyScalar(-sg * 0.06));
        epol[s] = art === 'frontheben' ? k.R.links.clone().multiplyScalar(sg) : V(0, 1, 0).add(k.R.vor.clone().multiplyScalar(-0.3));
      }
      const pose = Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, kniePol: seiten((s, sg) => sitzend ? V(sg * 0.2, 1, 1) : V(sg * 0.2, 0, 1)) }, sitzend ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.42)) } : stehFuesse(0.14, vorgebeugt ? 0.05 : 0));
      if (art === 'frontheben' && !sitzend) vorDenBeinen(pose, last === 'kurzhanteln' ? 0.085 : last === 'scheibe' ? 0.035 : 0.018);   // Hantelkopf liegt an (bis 31.10. 0,075: 2,6 cm im Oberschenkel)
      if (last === 'kabel' && art === 'seitheben') pose.drehGlatt = true;   // G13: nur diese Übung (kabel_seitheben): die Rolle des Oberarms läuft durch ±180°, die Drehknochen sprangen (figur-modell.js drehLauf)
      if (art === 'aufrecht') { vorDenBeinen(pose, 0.018); vorDemRumpf(pose, 0.018); }
      return {
        pose,
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
          if (z.griff) kabelstangeAn(z.griff, g, V(0, 0.15, art === 'aufrecht' ? SEIL_AUFRECHT : -0.55));
          if (z.band_l) {
            for (const [s, sg] of [['l', 1], ['r', -1]]) { bandKette(z, 'band_' + s, g.hand[s].y < 0.72 ? [g.hand[s], bandAmFuss(g, s, sg)] : umDenKoerper(g, bandAmFuss(g, s, sg), g.hand[s], 0.012, g.R.links.clone().multiplyScalar(sg)).reverse()); (z.griffAchse = z.griffAchse || {})[s] = 'neutral'; }   // von der Hand aus: das erste Stück bleibt in der Hand; beim Aufheben liegt das Band außen, gerade
            seil(z.band_unter, bandAmFuss(g, 'l', 1), bandAmFuss(g, 'r', -1));
          }
          if (z.seil_l) { seil(z.seil_l, V(-0.62, 0.15, 0.12), g.hand.l); seil(z.seil_r, V(0.62, 0.15, 0.12), g.hand.r); if (z.dkTurm) { z.dkTurm[0].zieh(V(-0.62, 0.15, 0.12).distanceTo(g.hand.l)); z.dkTurm[1].zieh(V(0.62, 0.15, 0.12).distanceTo(g.hand.r)); } }
          if (z.seil) { const a = art === 'seitheben' ? KSH_TURM.clone().add(V(0.06, 0.15, 0)) : V(0, art === 'reverse_fly' ? 1.6 : 0.15, art === 'aufrecht' ? SEIL_AUFRECHT : art === 'reverse_fly' ? 0.7 : -0.55); const ziel = z.griff ? mitte : g.hand.l; const d = ziel.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(ziel).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); if (z.dkTurm) z.dkTurm[0].zieh(l); }
        }
      };
    },
    blick: V(0, 1.05, 0), abstand: 3.6, kameraRicht: art === 'aufrecht' ? V(0.8, 0.25, 0.6) : V(0.35, 0.25, 1)
  };
}

/* =================================================================== */
/* Ziehen                                                               */
/* =================================================================== */

// Brustgestützt (Kurzhantel, T-Bar): steht, Füße flach unter dem Körper, Knie 30–45°, Hüfte 70–80°, Brust auf dem Polster (bis 5.11. Becken 0,68 m ohne Sitz, Knie 90°: wie beim Wandsitzen; Kurzhantel Sprunggelenk 64°)
const TB_FUSS_Z = 0.0, BR_BECKEN = V(0, 0.9, -0.17), BR_RUMPF = { neigung: 48 };
// Polster fürs brustgestützte Kurzhantelrudern: liegt an Bauch und Brust an (Vorderseite 15 cm unten, 24 cm an der Brust vor der Rumpfachse, darum etwa 10° flacher als der Rumpf), Kinn über dem oberen Ende. Holm auf zwei Streben, Füße vor den Schuhspitzen
function ruderbankBauen(ger, becken, r) {
  const R = rumpfRahmen(r), punkt = (sa) => becken.clone().addScaledVector(R.oben, sa).addScaledVector(R.vor, 0.19 + 0.19 * (sa - 0.06));
  const a = punkt(0.1), e = punkt(0.54), lang = e.clone().sub(a).normalize(), hinten = R.links.clone().cross(lang).normalize();   // hinten: von der Figur weg (Unterseite)
  ger.polster(0.3, a.distanceTo(e), 0.08, a.clone().lerp(e, 0.5), basisAus(lang, hinten));
  const unten = a.clone().addScaledVector(lang, 0.08).addScaledVector(hinten, 0.07), oben = e.clone().addScaledVector(lang, -0.08).addScaledVector(hinten, 0.07);
  ger.vierkant(unten, oben, 0.07);
  const fussU = V(0, 0.035, unten.z + 0.25), fussO = V(0, 0.035, oben.z + 0.16);
  ger.vierkant(fussU, unten, 0.06); ger.vierkant(fussO, oben, 0.06); ger.vierkant(fussU, fussO, 0.06);
  for (const f of [fussU, fussO]) ger.vierkant(V(-0.24, 0.035, f.z), V(0.24, 0.035, f.z), 0.07);
}
// Rudern. art: vorgebeugt | einarmig | brustgestuetzt | kabel_sitzend | maschine | umgekehrt | tbar ; last: langhantel | kurzhanteln | kabel | band
// umgekehrt: knie (Knie gebeugt), einarmig ; kabel_sitzend: griff breit ; brustgestuetzt + langhantel = T-Bar ; tuerrahmen ; kabel_stehend (einarmig) ; tisch: true (umgekehrt an der Tischkante)
// Neu: pendlay (Stange setzt jede Wdh am Boden ab) | seal (bäuchlings auf hoher Bank) ; last multipresse | kettlebell (einarmig) ;
//   erhoeht (umgekehrt, Füße auf der Box) ; griff unter (vorgebeugt, Yates) ; einarmig (maschine) ; band (kabel_stehend) ; tbar = stehend mit Hebel
//   band_stehend (beide Arme, Band auf Brusthöhe)
// Neu: zumBauch (true: vorgebeugt mit Stange / kabel_sitzend eng: der Griff kommt bis an den Bauchnabel statt an den unteren Brustkorb)
// Ablauf davor (wirkt über animation()): standVersatz
export function rudern(o = {}) {
  const art = o.art || 'vorgebeugt', last = o.last || 'langhantel';
  if (art === 'tuerrahmen' || art === 'kabel_stehend' || art === 'band_stehend') return rudernStehend(art, o);
  if (art === 'seal') return sealRudern();
  const breitGriff = o.griff === 'breit';
  // T-Bar (stehend oder brustgestützt mit Langhantel): enger Griff, die Hände laufen auf dem Bogen der Stange um den Drehpunkt hinten
  const tbar = last === 'langhantel' && (art === 'brustgestuetzt' || art === 'tbar');
  const tbarBahn = () => {
    const brust = art === 'brustgestuetzt', becken = brust ? BR_BECKEN : V(0, 0.925, -0.17), r = brust ? BR_RUMPF : { neigung: 47 }, k = rumpf(becken, r);
    // brustgestützt: unten hängen die Arme knapp vor der Polsterkante, oben kommt der Griff bis an den unteren Brustkorb
    const h0 = (s, sg) => k.schulter[s].clone().add(V(-sg * 0.11, -ARM * 0.985, 0.02 + (brust ? 0.04 : 0))), h1 = (s, sg) => k.brust.clone().sub(k.R.oben.clone().multiplyScalar(0.3 - (brust ? 0.04 : 0))).add(k.R.links.clone().multiplyScalar(sg * 0.08)).add(k.R.vor.clone().multiplyScalar(brust ? 0.22 : 0.235));   // Griff oben am Bauch (stehend 1,5 cm weiter vorn: Hebel nicht im Hosenbund) (17 cm vor der Wirbelsäule)
    const P = bogenMitte(h0('l', 1).setX(0), h1('l', 1).setX(0), { y: brust ? 0.5 : 0.1 });   // brustgestützt: Lager höher, der Hebel steigt flacher als das Polster und bleibt darunter
    return { becken, r, P, h0, h1, mitte: (t) => bogenHand(h0('l', 1).setX(0), h1('l', 1).setX(0), P, t) };
  };
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'einarmig' && last !== 'kettlebell') ger.bank(-0.05, 1.1, 0.4, 0);   // niedriger: der Oberschenkel steht fast senkrecht, das Schienbein liegt auf
      if (art === 'brustgestuetzt' && last !== 'langhantel') ruderbankBauen(ger, BR_BECKEN, BR_RUMPF);
      if (art === 'kabel_sitzend') kabelruderBauen(ger, z, breitGriff);
      if (art === 'maschine') rudermaschineBauen(ger, z);   // Sitz, Brustpolster, Hebelarme mit senkrechten Griffen
      if (art === 'umgekehrt') { if (o.tisch) tisch(ger, 0.76, o.einarmig ? -MASS.schulterBreite : 0); else z.stange = ger.stange(0.95, 1.2, 0.0); }
      if (o.erhoeht) ger.box(0.5, 0.45, 0.4, V(0, 0.225, 1.42), ger.mPolster);
      if ((last === 'langhantel' || last === 'multipresse') && art === 'vorgebeugt') z.lh = ger.langhantel();
      if (last === 'multipresse') schienenAufbauen(ger, z);
      if (last === 'kettlebell') z.kb = ger.kettlebell();
      if (tbar) { const tb = tbarBahn(); tbarBauen(ger, z, tb.P, tb.mitte(0), art === 'brustgestuetzt' ? { becken: tb.becken, r: tb.r } : null); }
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'einarmig');
      return z;
    },
    pose(t) {
      // Unter dem Tisch (Platte 0,76 m) liegt der Körper flacher als unter der Stange (0,95 m). Die Faust sitzt um die Tischkante, nicht darunter (bis 5.11. ragten die offenen Finger durch die Platte)
      const griffY = o.tisch ? 0.76 : 0.95, griffTisch = (x) => V(x, 0.78, -0.03);
      if (art === 'umgekehrt' && o.knie) {
        // Knie 90°, Füße flach: Linie Knie → Schulter, Hüfte gestreckt
        // Knie so weit weg, dass die Brust oben an die Stange bzw. Tischkante kommt (wie bei gestreckten Beinen, Drehpunkt Knie)
        const knie = V(0, 0.52, o.tisch ? 0.82 : 0.74);
        const unten = winkelFuer(knie, MASS.oberschenkel + 0.02 + MASS.rumpf - 0.03, o.tisch ? griffTisch(0) : V(0, griffY - 0.03, 0.0), o.tisch ? ARM * 0.9985 : ARM * 0.99, o.tisch ? -40 : -20);
        const obenW = Math.atan2(griffY - knie.y, knie.z) / RAD - 17;
        const w = mix(o.tisch ? unten : Math.max(-5, unten), obenW, t) * RAD;
        const richt = V(0, Math.sin(w), -Math.cos(w));
        const becken = knie.clone().add(richt.clone().multiplyScalar(MASS.oberschenkel + 0.02));
        const r = { basis: basisAus(richt, V(0, 1, 0)), neigung: 0 };
        const hand = seiten((s, sg) => (o.tisch ? griffTisch(sg * 0.215) : V(sg * 0.26, griffY, 0.0)));   // Tischkante etwa schulterbreit
        if (o.einarmig) hand.l = becken.clone().add(V(0.15, 0.12, -0.15));
        return { pose: { becken, rumpf: r, kopf: { neigung: o.tisch ? mix(38, 10, t) : 10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), fuss: seiten((s, sg) => V(sg * 0.12, FY, 0.92)), fussRicht: seiten(() => V(0, 0, 1)), kniePol: seiten(() => V(0, 1, 0.2)) } };
      }
      if (art === 'umgekehrt') {
        // Körper hängt schräg unter der Stange bzw. Tischkante, Fersen am Boden (erhöht: auf der Box, Körper fast waagerecht)
        // Fersen so weit weg, dass die Brust (Brustbein, gut 23 cm vor der Wirbelsäule) oben genau an die Stange bzw. Tischkante kommt:
        // der Körper dreht um die Fersen, der Kopf bleibt jenseits der Stange
        // Am Boden stehen die Füße auf den Fersen, Knöchel so hoch, dass die Ferse am Boden bleibt und die Fußspitzen hoch zeigen (bis 5.11. lagen sie flach, Sprunggelenk -76°)
        const fussP = o.erhoeht ? V(0, 0.45 + FY, 1.2) : V(0, 0.112, o.tisch ? 1.07 : 0.94);
        const obenW = Math.atan2(griffY - fussP.y, fussP.z) / RAD - 11.6;
        // Einarmig: breite Beine gegen das Wegdrehen, die Hand greift mittig an der Tischkante, direkt über der Schulter; breit stehend reicht das Bein bis zur Linie nicht so weit
        const breitBein = o.einarmig ? 0.27 : 0.1, langBein = o.einarmig ? BEIN * 0.979 : BEIN + 0.02;
        // unten hängen die Arme gestreckt
        const griffSeit = o.tisch ? (o.einarmig ? 0 : 0.215 - MASS.schulterBreite) : 0;
        const unten = o.tisch ? winkelFuer(fussP, langBein + MASS.rumpf - 0.03, griffTisch(0), Math.sqrt((ARM * 0.9985) ** 2 - griffSeit ** 2)) : winkelFuer(fussP, BEIN + 0.02 + MASS.rumpf - 0.03, V(0, griffY - 0.03, 0.0), ARM * 0.965);   // Schulter liegt neben der Körperlinie: 0,99 reichte nicht bis zur Stange, 0,955 beugte die Arme 16° (1.11.)
        const winkel = mix(unten, obenW, t);
        const richt = V(0, Math.sin(winkel * RAD), -Math.cos(winkel * RAD));
        const becken = fussP.clone().add(richt.clone().multiplyScalar(langBein));
        const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), richt);
        const r = { basis, neigung: 0 };
        const hand = seiten((s, sg) => (o.tisch ? griffTisch(o.einarmig ? sg * MASS.schulterBreite : sg * 0.215) : V(sg * 0.26, griffY, 0.0)));
        const pose = { becken, rumpf: r, kopf: { neigung: 10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), fuss: seiten((s, sg) => fussP.clone().add(V(sg * breitBein, 0, 0))), fussRicht: seiten(() => V(0, 1, 0.2)), kniePol: seiten(() => V(0, 1, 0)) };
        if (!o.erhoeht) { const steil = (70 - winkel) * RAD; pose.fussRicht = seiten(() => V(0, Math.sin(steil), Math.cos(steil))); }   // Ferse als Drehpunkt: das Sprunggelenk bleibt etwa 20° gestreckt
        if (o.einarmig) {   // freie Hand liegt flach auf dem Bauch, zieht nicht mit
          const R = rumpfRahmen(r);
          hand.l = becken.clone().addScaledVector(R.oben, 0.16).addScaledVector(R.vor, 0.2).addScaledVector(R.links, 0.1);
          pose.flach = { l: R.vor.clone() }; pose.ellbogenPol.l = R.links.clone().addScaledVector(R.vor, -0.3);
        }
        return { pose };
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
      if (art === 'kabel_sitzend') {
        const becken = V(0, 0.5, -0.15), anker = breitGriff ? RU_ANKER_HOCH : RU_ANKER;
        const r = { neigung: mix(10, -4, t) };   // aufrecht, nur wenig vor und zurück (bis 5.11. 25° bis -6°)
        const k = rumpf(becken, r);
        const hand = {};
        // vorn: Arme gestreckt, in einer Linie mit dem Kabel; hinten eng zum Bauch, breit zur unteren Brust mit Ellbogen auf halber Schulterhöhe (bis 5.11. über Schulterhöhe, Stange an der Schulter)
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5), seit = breitGriff ? 0.3 : 0.07;
        const vorn = sm.clone().add((breitGriff ? V(0, -0.2, 1) : V(0, -0.5, 1)).normalize().multiplyScalar(Math.sqrt((ARM * 0.998) ** 2 - (MASS.schulterBreite - seit) ** 2))), nah = k.brust.clone().add(breitGriff ? k.R.oben.clone().multiplyScalar(-0.18).addScaledVector(k.R.vor, 0.26) : o.zumBauch ? V(0, -0.32, 0.08) : V(0, -0.24, 0.12));
        for (const [s, sg] of [['l', 1], ['r', -1]]) hand[s] = mv(vorn, nah, t).add(V(sg * (breitGriff ? 0.3 : 0.07), 0, 0));
        const pose = { becken, rumpf: r, hand, handflaeche: breitGriff ? undefined : seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => breitGriff ? V(sg, -0.25, -0.75) : V(sg * 0.3, -0.5, -1)),
          fuss: seiten((s, sg) => V(sg * 0.13, 0.32, RU_FUSS_Z)), fussFlaeche: seiten(() => RU_FUSSFLAECHE.clone()), fussRicht: seiten(() => V(0, 0.7, 1)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 0)) };
        vorDemRumpf(pose, breitGriff ? 0.016 : 0.04);
        return { pose,
          props(g, z) {
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
            z.griff.position.copy(mitte); z.griff.quaternion.copy(breitGriff ? new THREE.Quaternion() : basisAus(V(0, 1, 0), anker.clone().sub(mitte)));
            r2_kabelruderStellen(z, mitte, anker, breitGriff);   // Seil und Stapel (DK Line)
          } };
      }
      if (art === 'einarmig' && last === 'kettlebell') {
        // Schrittstellung ohne Bank: linker Fuß vorn, die freie linke Hand stützt sich auf den vorderen Oberschenkel, rechts zieht die Kettlebell zur Hüfte (bis 5.11. das Kurzhantel-Bild auf der Bank)
        const becken = V(0, 0.89, -0.03);
        const r = { neigung: 60 };
        const k = rumpf(becken, r);
        const haengt = k.schulter.r.clone().add(V(-0.01, -ARM * 0.9995, 0)), gezogen = ruderEnde(k, 'r', -1, { ext: 40, abd: 12 });
        const hand = { l: V(0.115, 0.64, 0.19), r: mv(haengt, gezogen, t) };
        return { pose: { becken, rumpf: r, kopf: { neigung: -25 }, hand, flach: { l: V(0, 0.55, 0.83) }, ellbogenPol: { l: V(1, 0.2, -0.4), r: V(-0.25, 0.6, -1) }, fuss: { l: V(0.1, FY, 0.26), r: V(-0.2, FY, -0.47) }, zehen: { r: 25 }, fussRicht: { l: V(0.1, 0, 1), r: V(-0.15, 0, 1) }, kniePol: { l: V(0.1, 0, 1), r: V(-0.1, 0, 1) } },
          props(g, z) { z.kb.position.copy(g.hand.r).add(V(0, -0.01, 0)); } };
      }
      if (art === 'einarmig') {
        // Linkes Knie und linke Hand auf der Bank, Oberschenkel fast senkrecht, Schienbein liegt auf (bis 5.11. Knie 127°, Schienbein hob ab, Fuß schwebte), rechts zieht
        const becken = V(0.05, 0.94, -0.2);
        const r = { neigung: 80, drehung: 0 };
        const k = rumpf(becken, r);
        const haengt = k.schulter.r.clone().add(V(-0.07, -ARM * 0.9995, 0));
        const gezogen = k.schulter.r.clone().add(V(-0.14, -0.23, -0.2));   // Ellbogen zieht nach hinten-oben, Hantel außen neben Rumpf und Standbein
        const hand = { l: V(0.1, 0.48, 0.3), r: mv(haengt, gezogen, t) };
        return { pose: { becken, rumpf: r, kopf: { neigung: -30 }, hand, flach: { l: V(0, 1, 0) }, ellbogenPol: { l: V(1, 0, -0.2), r: V(-0.3, 0.6, -1) }, fuss: { l: V(0.1, 0.505, -0.6), r: V(-0.24, FY, -0.22) }, fussRicht: { l: V(0, -0.45, -1), r: V(-0.2, 0, 1) }, kniePol: { l: V(0, -1, 0.5), r: V(-0.3, 0, 1) } },
          props(g, z) { if (z.kh_l) khHalten(z, g, 'r', z.kh_l, 'neutral'); if (z.kb) z.kb.position.copy(g.hand.r).add(V(0, -0.01, 0)); } };
      }
      const brust = art === 'brustgestuetzt', pendlay = !!o.pendlay, unter = o.griff === 'unter';
      // Knie nur leicht gebeugt (10–30°), Rumpf höchstens 45° über der Waagrechten, Pendlay fast waagrecht
      // Rumpf etwa 45° (bis 5.11. 55°), Yates aufrechter (Text: 30 bis 45°), Pendlay waagerecht: Schienbein senkrecht, Stange unten am Boden (Scheibenradius + Armlänge legen die Höhe der Schulter fest)
      const becken = brust ? BR_BECKEN : pendlay ? V(0, 0.873, -0.21) : unter ? V(0, 0.935, -0.14) : art === 'tbar' ? V(0, 0.925, -0.17) : V(0, 0.925, -0.16);
      const r = brust ? BR_RUMPF : { neigung: pendlay ? 89 : unter ? 45 : art === 'tbar' ? 47 : 46 };
      const k = rumpf(becken, r);
      const hand = {}, epol = {}, flaeche = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        // Stange: die Hände bleiben auf der Stange, wo sie sind (bis 5.11. rutschten sie 7 cm je Seite zur Mitte). Kurzhanteln außen an Knien und Hüfte vorbei
        const griffX = unter ? 0.22 : pendlay ? 0.25 : 0.24, breit = last === 'kurzhanteln' ? 0.09 : griffX - MASS.schulterBreite;
        // Pendlay: Stange liegt unten auf dem Boden (Scheibenradius 0,225 m), über dem Mittelfuß; die Arme stehen dafür etwa 10° schräg nach hinten
        const haengt = pendlay ? V(sg * griffX, 0.228, k.schulter[s].z - 0.115) : k.schulter[s].clone().add(V(sg * breit, -ARM * 0.9995, 0.02));
        if (unter) flaeche[s] = V(0, 0.2, 1);
        // Kurzhanteln: Ellbogen knapp hinter den Brustkorb, Unterarm senkrecht, Hantel neben dem Bauch (vorher 57° zurück); Stange am Bauch, Pendlay zum unteren Brustkorb
        const gezogen = last === 'kurzhanteln' ? ruderEnde(k, s, sg, { ext: 42, abd: brust ? 22 : 14 })   // brustgestützt: Hanteln außen am Polster und den Oberschenkeln vorbei
          : k.brust.clone().sub(k.R.oben.clone().multiplyScalar(pendlay ? 0.24 : o.zumBauch ? 0.4 : 0.3)).add(k.R.links.clone().multiplyScalar(sg * griffX)).add(k.R.vor.clone().multiplyScalar(0.12));
        hand[s] = mv(haengt, gezogen, t);
        epol[s] = unter ? V(sg * 0.12, 0.6, -1) : V(sg * 0.3, 0.6, -1);   // Yates: Ellbogen nah am Rumpf
        if (tbar) { const tb = tbarBahn(); hand[s] = bogenHand(tb.h0(s, sg), tb.h1(s, sg), tb.P, t); flaeche[s] = V(-sg, 0, 0); epol[s] = V(sg * 0.5, 0.4, -1); }
      }
      const pose = Object.assign({ becken, rumpf: r, kopf: { neigung: -20 }, hand, ellbogenPol: epol, handflaeche: flaeche, kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, stehFuesse(0.15, brust ? TB_FUSS_Z : pendlay ? 0.04 : 0.05));
      if (!tbar && last !== 'kurzhanteln') { vorDemRumpf(pose); vorDenBeinen(pose); }
      return {
        pose,
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
      ger.box(0.28, 0.08, 1.6, V(0, 0.8, 0.3), ger.mPolster);   // schmal: Oberarme hängen frei daneben
      for (const sz of [-0.35, 0.95]) { ger.box(0.06, 0.76, 0.06, V(0, 0.38, sz), ger.mRahmen); ger.box(0.4, 0.04, 0.06, V(0, 0.02, sz), ger.mRahmen); }
      const z = {}; khAufbauen(ger, z); return z;
    },
    pose(t) {
      const becken = V(0, 1.07, 0.3), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r);
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      // unten Arme gestreckt; oben Ellbogen knapp hinter dem Rumpf, Unterarm hängt senkrecht (vorher 54° zurück)
      const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(V(0, -ARM * 0.9995, 0)).add(L(sg, 0.04)), ruderEnde(k, s, sg, { ext: 42, abd: 18 }), t));
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, ellbogenPol: seiten((s, sg) => L(sg, 0.4).add(V(0, 1, 0.4))),
          // Beine fast gestreckt, Schienbeine liegen vorn auf der Bank, die Knie knapp darüber (bis 31.10. drückten sie 3,7 cm hinein)
          fuss: seiten((s, sg) => V(0, 0.91, 0.3 + BEIN * 0.995).add(L(sg, 0.1))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.72, 0.7)) },   // Füße hängen locker über das Bankende, etwa 45° gestreckt (vorher 75°)
        props(g, z) { kurzhantelnAn(z, g, 'hammer'); } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, 0.2)
  };
}

// Rudern im Stand: am Türrahmen (zurücklehnen, beide Hände am Rahmen), einarmig am Kabel bzw. Band in Schrittstellung oder beidarmig am Band auf Brusthöhe
const BAND_ANKER = V(0, 1.25, 1.12);
function rudernStehend(art, o = {}) {
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'tuerrahmen') {
        // Türöffnung 80 cm; die Faust fasst die vordere Kante des Rahmens (runde Kante als Griff) im Hammergriff: Daumen oben, die Finger gehen um die Kante herum
        for (const sx of [-1, 1]) {
          ger.box(0.1, 2.1, 0.12, V(sx * 0.45, 1.05, 0.34), ger.mRahmen);
          const kante = ger.zyl(0.018, 2.06, ger.mRahmen); kante.position.set(sx * 0.41, 1.03, 0.28);
        }
        ger.box(1.0, 0.12, 0.12, V(0, 2.16, 0.34), ger.mRahmen);
      }
      else if (art === 'band_stehend') {
        ger.box(0.08, 1.4, 0.08, V(0, 0.7, BAND_ANKER.z + 0.05), ger.mRahmen);
        for (const s of ['l', 'r']) { z['band_' + s] = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z['griff_' + s] = ger.griff(); }
      }
      else if (o.band) { ger.box(0.08, 1.4, 0.08, V(-0.15, 0.7, 1.0), ger.mRahmen); z.seil = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.griff = ger.griff(); }
      else {
        r3_setze(z, r3_turm(ger, V(-0.15, 1.2, 0.95), V(0, 0, 1), V(1, 0.3, 0.5), 'KABELZUG', 'RÜCKEN')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff();   // R3: DK-Kabelturm, Öse wie bisher auf 1,2 m
        // Haltestange am Gestell für die freie Hand, in Reichweite neben dem Turm
        ger.stab(V(0.3, 0.04, 0.62), V(0.3, 1.5, 0.62), 0.02, ger.mRahmen);
        ger.vierkant(V(0.3, 0.03, 0.62), z.dkTurm[0].an(0.15, 0.03), 0.06); r3_halter(ger, z.dkTurm[0], V(0.3, 1.5, 0.62), 0.05);
      }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      if (art === 'tuerrahmen') {
        // Start: Arme gestreckt, gut 20° zurückgelehnt, Körper als Linie. Ende: Brust am Rahmen, Ellbogen etwa 115° (bis 5.11. nur 18° bis 11° und Ellbogen 57° bis 111°)
        const griffZ = 0.28, griffY = 1.2, griffX = 0.41, fussP = V(0, FY, 0.26), lang = BEIN + 0.02 + MASS.rumpf - 0.03;
        const unten = 90 - winkelFuer(fussP, lang, V(0, griffY, griffZ), Math.sqrt((ARM * 0.9985) ** 2 - (griffX - MASS.schulterBreite) ** 2), 40, 89);
        const a = mix(unten, 10, t) * RAD;
        const richt = V(0, Math.cos(a), -Math.sin(a));
        const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.02));
        const r = { basis: basisAus(richt, V(0, 0, 1)), neigung: 0 };
        return { pose: { becken, rumpf: r, kopf: { neigung: 8 }, hand: seiten((s, sg) => V(sg * griffX, griffY, griffZ)), handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.35, -1, -0.7)),
          fuss: seiten((s, sg) => fussP.clone().add(V(sg * 0.12, 0, 0))), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } };
      }
      if (art === 'band_stehend') {
        // Aufrecht, Füße hüftbreit, Knie leicht gebeugt, Band vorn auf Brusthöhe, Zug waagerecht: vorn lange Arme, hinten Ellbogen nah am Körper knapp hinter dem Rumpf (bis 5.11. Sitzen auf dem Boden, Band um die Füße: der Text verlangt Brusthöhe)
        const becken = V(0, 0.975, -0.02);
        const r = { neigung: mix(5, 0, t) };
        const k = rumpf(becken, r);
        const hand = seiten((s, sg) => mv(k.schulter[s].clone().add(BAND_ANKER.clone().sub(k.schulter[s]).setLength(ARM * 0.998)), ruderEnde(k, s, sg, { ext: 40, abd: 10, zug: V(0, -0.15, 1) }), t));
        return { pose: { becken, rumpf: r, hand, handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.25, -0.4, -1)), fuss: seiten((s, sg) => V(sg * 0.12, FY, -0.02)), fussRicht: seiten((s, sg) => V(sg * 0.2, 0, 1)), kniePol: seiten((s, sg) => V(sg * 0.15, 0, 1)) },
          props(g, z) { for (const s of ['l', 'r']) { z['griff_' + s].position.copy(g.hand[s]); seil(z['band_' + s], BAND_ANKER, g.hand[s]); } } };
      }
      // Schrittstellung, vorderes Knie 15–25°. Vorn gleitet die rechte Schulter mit (Rumpf dreht wenig nach links), hinten zurück (bis 5.11. umgekehrt und Knie 4°)
      const anker = V(-0.15, 1.2, 0.95), becken = V(0, 0.91, 0.02);
      const r = { neigung: 10, drehung: mix(9, -3, t) };
      const k = rumpf(becken, r);
      // vorn: Arm lang zur Rolle; hinten: Ellbogen neben der Hüfte, 40° hinter dem Rumpf, Griff an der Hüfte (bis 5.11. Ellbogen 29° bis 140°, Griff vor der Brust)
      const hand = { r: mv(k.schulter.r.clone().add(anker.clone().sub(k.schulter.r).setLength(ARM * 0.998)), ruderEnde(k, 'r', -1, { ext: 40, abd: 8, zug: V(0.02, -0.5, 1) }), t), l: o.band ? becken.clone().add(V(0.17, 0.05, 0.06)) : V(0.3, 1.16, 0.62) };
      return { pose: { becken, rumpf: r, hand, handflaeche: { r: V(1, 0, 0) }, ellbogenPol: { r: V(-0.3, -0.3, -1), l: o.band ? V(1, 0, -0.5) : V(1, -0.6, -0.4) }, fuss: { l: V(0.13, FY, 0.32), r: V(-0.13, FY, -0.3) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, anker, g.hand.r); if (z.dkTurm) z.dkTurm[0].zieh(anker.distanceTo(g.hand.r)); } };
    },
    blick: V(0, 1.0, 0.1), abstand: 3.6, kameraRicht: V(1, 0.3, art === 'tuerrahmen' ? -0.35 : 0.5)
  };
}

// Box zum Einstieg (sprung, negativ, halten): Oberkante und Mitte. Füße flach darauf: Knie etwa 85°, Hüfte etwa 60°, Schienbein höchstens 30° vor der Senkrechten (bis 5.11.: 55 cm hoch, Sprunggelenk 77° gebeugt)
const KZ_BOX = 0.36, KZ_BOX_Z = 0.2, KZ_FUSS_Z = 0.16;
// Griff neutral: zwei parallele Griffe in Blickrichtung (Handflächen zueinander). Sie ragen von der Querstange, die weiter vorn sitzt, zur Figur: Der Griff liegt, wo sonst die Stange ist, der Kopf geht frei daran vorbei
function klimmzugParallelBauen(ger, z, breit) {
  z.stange = r4_klimmzugStation(ger, 2.25, 1.3, 0.17);
  for (const sx of [-1, 1]) {
    griffRohr(ger, V(sx * breit, 2.25, -0.09), V(sx * breit, 2.25, 0.09), ger.gruppe, 0.85);
    ger.stab(V(sx * breit, 2.25, 0.09), V(sx * breit, 2.25, 0.17), 0.014, ger.mMetall);
  }
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
    ablaufVor: art === 'halten' ? () => klimmzug({ ...o, art: 'negativ' }).pose(0).pose : undefined,   // Text: von der Box in die obere Position steigen. Bis 5.11. stand die Figur beim Hinlaufen in der Box
    aufbau(ger) {
      const z = {};
      if (latzug) {
        if (hebel) {
          r2_latzugHebelBauen(ger, z);   // Hebel-Latzug in der DK Line (Auftrag R, Paket R2)
        } else {
          latzugBauen(ger, z, LZ_STANGE_Z);
          z.lh = latzugstange(ger, art === 'latzug_eng' ? 'parallel' : o.griff === 'unter' ? 'gerade' : 'gewinkelt', art === 'latzug_eng' ? 0.16 : o.griff === 'unter' ? 0.18 : o.griff === 'breit' ? 0.42 : 0.33);
          z.seil = ger.stab(V(), V(0, 1, 0), 0.006, ger.mKabel);
        }
      }
      else if (art === 'maschine') assistBauen(ger, z, 'klimmzug');
      else if (o.griff === 'neutral') klimmzugParallelBauen(ger, z, 0.2);
      else z.stange = r4_klimmzugStation(ger, 2.25, art === 'archer' ? 1.8 : 1.3, 0);
      if (art === 'sprung' || art === 'negativ' || art === 'halten') ger.box(0.5, KZ_BOX, 0.45, V(0, KZ_BOX / 2, KZ_BOX_Z), ger.mPolster);
      if (art === 'band') { z.band_a = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.band_b = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'zusatzgewicht') z.kh = ger.kurzhantel();
      return z;
    },
    pose(t) {
      const breit = art === 'chinup' ? 0.2 : art === 'latzug_eng' ? 0.16 : art === 'archer' ? 0.5 : o.griff === 'neutral' ? 0.2 : o.griff === 'unter' ? 0.18 : o.griff === 'breit' ? 0.42 : 0.33;
      // Handflächen: Untergriff zum Gesicht, Hammergriff zueinander, sonst Obergriff (Standard der Figur)
      const flaeche = art === 'chinup' || o.griff === 'unter' ? seiten(() => V(0, 0, -1)) : o.griff === 'neutral' || art === 'latzug_eng' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined;
      if (latzug) {
        const becken = V(0, 0.55, -0.02);
        const r = { neigung: -14 };
        const k = rumpf(becken, r);
        const oben = seiten((s, sg) => V(sg * breit, k.schulter[s].y + ARM * 0.985, k.schulter[s].z + 0.12));
        // Unten: Stange an der oberen Brust. Ellbogen laufen in der Linie des Kabels nach unten, Unterarm fast parallel zum Kabel, Ellbogen vor der
        // Schulterlinie (Devin, 2.11.: „dürfen nicht hinter den Rücken“; bis dahin unten 11 cm hinter der Schulter, Unterarm 56° schräg). Starre Stange: Hände bleiben an den Griffen
        const unten = seiten((s, sg) => k.brust.clone().add(V(sg * breit, 0.045, 0.186)));
        const hand = hebel ? seiten((s, sg) => bogenHand(oben[s], unten[s], LH_C, t)) : seiten((s) => mv(oben[s], unten[s], t));
        return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, handflaeche: hebel ? seiten((s, sg) => V(-sg, 0, 0)) : flaeche, ellbogenPol: seiten((s, sg) => (o.griff === 'unter' ? V(sg * 0.12, -0.85, 0.5) : V(sg * 0.36, -0.92, 0.13))), fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.38)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
          props(g, z) {
            if (z.dm) { drueckmaschineStellen(z, g, t); return; }
            stangeAn(z.lh, g, art === 'latzug' && o.griff !== 'unter' ? V(0, 0.035, 0) : null); r2_latzugStellen(z);   // gewinkelte Stange: Griffe 3,5 cm unter der Mitte; Seil und Stapel (DK Line)
          } };
      }
      // Schulterblatt-Klimmzug: Die Arme bleiben gestreckt, die Hände und Schultergelenke bleiben, wo sie sind. Im Hang hängen die Schultern an den Ohren (schulterHub), sie senken sich und der Körper steigt um diesen Weg (bis 5.11. stieg die Schulter, Ellbogen 4° bis 60°: ein Teilklimmzug)
      const senken = art === 'schulterblatt' ? mix(0.075, 0, glatt(t)) : 0;
      let hub = art === 'schulterblatt' ? 0 : art === 'halten' ? mix(0.47, 0.5, t) : mix(0, 0.52, t);
      let schulterY = 2.25 - Math.sqrt(Math.max(0.01, (ARM * 0.99) ** 2 - Math.max(0, breit - MASS.schulterBreite) ** 2)) + hub, x = 0;
      if (art === 'archer') { schulterY = mix(2.25 - Math.sqrt((ARM * 0.99) ** 2 - (breit - MASS.schulterBreite) ** 2), 2.11, t); x = mix(0, -0.22, t); }
      // Oben geht der Kopf hinter der Stange vorbei (Kinn über die Stange): Körper rückt mit der Höhe etwas nach hinten
      const zurueck = glatt(hub / 0.5);
      const becken = V(x, schulterY + 0.03 - (MASS.rumpf - 0.03) - 0.03 - senken, -0.03 - 0.11 * zurueck);
      const r = { neigung: -6 - 4 * zurueck, seit: art === 'archer' ? mix(0, -8, t) : 0 };
      const hand = seiten((s, sg) => V(sg * breit, 2.25, 0));
      // Schulterblatt: hängt tiefer, die Knie sind stärker gebeugt: so bleiben die Füße frei in der Luft und gehen gleichmäßig mit dem Körper
      let fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.08, art === 'schulterblatt' ? -BEIN * 0.81 : -BEIN * 0.86, art === 'schulterblatt' ? -0.25 : -0.22)));
      let kpol = seiten(() => V(0, 0, 1)), fussRicht = seiten(() => V(0, -0.6, 1));
      const kniend = seiten((s, sg) => becken.clone().add(V(sg * 0.09, -0.47, -0.42)));    // Knie 90°, Unterschenkel nach hinten
      // Sprung und Negativ: Beine strecken sich auf der Box (Absprung), danach lösen sich die Füße und gehen in den freien Hang (hängende Zehen zeigen nach unten)
      if (art === 'sprung' || art === 'negativ') {
        const los = glatt((t - 0.26) / 0.5);
        fuss = seiten((s, sg) => { const auf = V(sg * 0.11, KZ_BOX + FY, KZ_FUSS_Z), f = mv(auf, becken.clone().add(V(sg * 0.08, -BEIN * 0.86, -0.22)), los); f.y = Math.max(f.y, auf.y); return f; });
        fussRicht = seiten(() => V(0, -0.6 * los, 1));
      }
      if (art === 'maschine') { fuss = kniend; kpol = seiten(() => V(0, -1, 1)); fussRicht = seiten(() => V(0, -0.3, -1)); }
      if (art === 'band') { fuss.r = becken.clone().add(V(-0.1, -0.36, 0.08)); kpol.r = V(0, 0.3, 1); fussRicht.r = V(0, -1, 0.1); }   // Fuß hängt locker, etwa 30° gestreckt (vorher 82°)
      if (art === 'zusatzgewicht') fuss = seiten((s, sg) => becken.clone().add(V(sg * 0.03, -BEIN * 0.9, -0.12)));
      return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, handflaeche: flaeche, schulterHub: senken, ellbogenPol: seiten((s, sg) => art === 'chinup' ? V(sg * 0.02, -0.85, 0.5) : V(sg, -0.8, -0.2)), fuss, fussBleibt: art === 'sprung' || art === 'negativ', fussRicht, kniePol: kpol },
        props(g, z) {
          if (z.polster) assistStellen(z, g);
          // Band vorn unter dem Knie eingehängt
          if (z.band_a) { const k = g.knie.r.clone().add(V(0, -0.06, 0)).add(g.R.vor.clone().multiplyScalar(0.055)); seil(z.band_a, V(-0.04, 2.24, 0), k); seil(z.band_b, V(0.04, 2.24, 0), k.clone().add(V(0.05, 0, 0))); }
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
const lzUnten = (sg, breit) => rumpf(LZ_BECKEN, LZ_RUMPF).brust.clone().add(V(sg * breit, 0.045, 0.186));
const LH_C = bogenMitte(lzOben(1, 0.33), lzUnten(1, 0.33), { z: -0.42 });

// Latzug ohne Sitz: einarmig im Halbkniestand am Kabel, oder in Bauchlage mit Handtuch
function latzugBoden(art) {
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'latzug_einarmig') { r3_setze(z, r3_turm(ger, V(-0.3, 2.2, 0.4), V(0, 0, 1), V(-1, 0.3, 0.3), 'KABELZUG', 'RÜCKEN')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff(); ger.matte(); }   // R3: DK-Kabelturm mit hoher Säule (Öse bei 2,2 m)
      else if (art === 'latzug_band') { tuer(ger, 0.62); ger.matte(); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); }
      else { ger.matte(); z.tuch = ger.stab(V(), V(0, 1, 0), 0.02, ger.mBand); }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      if (art === 'latzug_band') {
        // Aufrecht kniend vor der Tür, Band oben an der Tür verankert; Hände ziehen von oben-vorn bis neben die Schultern
        const becken = V(0, 0.62, -0.05);
        const r = { neigung: -6 };
        const k = rumpf(becken, r);
        const oben = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.15, 1, 0.55).normalize().multiplyScalar(ARM * 0.9995)));
        // unten: Griff vor der oberen Brust, Ellbogen etwa 120° (vorher Hand fast auf der Schulter, 151°)
        const hand = seiten((s, sg) => mv(oben[s], k.schulter[s].clone().add(V(sg * 0.12, -0.06, 0.3)), t));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.36, -0.92, 0.13)),
            fuss: seiten((s, sg) => becken.clone().add(V(sg * 0.1, -0.5, -0.44))), kniePol: seiten(() => V(0, -1, 1)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) { for (const [s, sg] of [['l', 1], ['r', -1]]) bandKette(z, 'band_' + s, umDenKoerper(g, V(sg * 0.05, 2.02, 0.58), g.hand[s])); } };
      }
      if (art === 'latzug_einarmig') {
        const becken = V(0, 0.55, -0.06);
        const r = { neigung: 4, seit: mix(-6, 4, t) };
        const k = rumpf(becken, r);
        // oben Arm gestreckt Richtung Kabelrolle
        const hand = { r: mv(k.schulter.r.clone().add(V(-0.3, 2.2, 0.4).sub(k.schulter.r).normalize().multiplyScalar(ARM * 1.01)), k.schulter.r.clone().add(V(-0.1, -0.06, 0.3)), t), l: V(0.15, 0.56, 0.32) };   // unten Griff neben der Brust, Ellbogen etwa 120° (vorher Hand an der Schulter, 156°)
        return { pose: { becken, rumpf: r, hand, ellbogenPol: { r: V(-0.36, -0.92, 0.13), l: V(1, 0, -0.5) }, fuss: { l: V(0.14, FY, 0.4), r: V(-0.1, 0.1, -0.52) }, kniePol: { l: V(0.1, 0, 1), r: V(0, -1, 0.3) }, fussRicht: { l: V(0.1, 0, 1), r: V(0, -0.3, -1) }, zehen: { l: 0, r: -60 } },
          props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, V(-0.3, 2.2, 0.4), g.hand.r); z.dkTurm[0].zieh(V(-0.3, 2.2, 0.4).distanceTo(g.hand.r)); } };
      }
      // Bauchlage, Kopf nach -z: Becken bleibt liegen, die Brust (Neigung -13: liegt auf dem Boden) hebt sich erst im Zug (Wirbelsäule). Das Handtuch ist ein straffes, gerades Stück zwischen den Händen: vorn lange Arme,
      // dann im Bogen über den Kopf zum Nacken, die Hände ziehen es auseinander, die Ellbogen gehen Richtung Hüfte, Oberarm am Ende rund 50° zum Rumpf (bis 5.11. Knick über einen dritten Punkt, dann unter dem Kinn zur Brust: Oberarm 68°, Ellbogen nur wenig unter Schulterhöhe)
      const becken = V(0, 0.12, 0.25);
      const r = { basis: BAUCHLAGE, neigung: -13 }, w = { beuge: mix(0, -9, t) };
      const k = rumpf(becken, r, w);
      const hand = seitenBauch((s, sg) => mv(k.schulter[s].clone().add(V(sg * 0.075, -0.01, -Math.sqrt((ARM * 0.997) ** 2 - 0.075 ** 2 - 0.01 ** 2))), k.schulter[s].clone().add(V(sg * 0.19, 0.12, -0.11)), t).add(V(0, 0.06 * Math.sin(Math.PI * t), 0)));
      // Fuß locker: Fußrücken zum Boden, etwa 55° gestreckt (fussFlaeche = wohin der Fußrücken zeigt), das Schienbein liegt knapp darüber (vorher 88°, Fuß in Verlängerung des Schienbeins)
      const fw = 35 * RAD;
      const ePol = seitenBauch((s, sg) => V(sg, 0.5, 0.8).normalize().lerp(V(sg * 0.3, -0.1, 0.2).normalize(), glatt(t)));
      return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: mix(-10, 20, glatt(t)) }, hand, greift: seiten(() => true), ellbogenPol: ePol, fuss: seitenBauch((s, sg) => V(sg * 0.1, 0.105, 0.27 + BEIN * 0.998)), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -Math.sin(fw), Math.cos(fw))), fussFlaeche: seiten(() => V(0, -Math.cos(fw), -Math.sin(fw))) },
        props(g, z) { seil(z.tuch, g.hand.l, g.hand.r); } };
    },
    blick: art === 'latzug_band' ? V(0, 1.1, 0.2) : V(0, 0.6, 0), abstand: art === 'latzug_band' ? 3.9 : 3.4, kameraRicht: art === 'latzug_einarmig' ? V(-1, 0.3, 0.3) : V(1, art === 'bauchlage' ? 0.5 : 0.3, 0.45)   /* einarmig: von der Seite des Arbeitsarms, der Turm steht nicht davor */
  };
}

/* =================================================================== */
/* Arme                                                                 */
/* =================================================================== */

// Scott-Curl und Bizepsmaschine: Rumpfneigung (Grad) und Richtung der Oberarme (Welt, linke Seite) auf dem Armpolster; von = wo das Polster
// oben anfängt (m ab der Schulter), damit es vor der Brust endet und nicht in ihr
export const SCOTT = { neigung: 18, arm: [0.0193, -0.1846, 0.22], von: 0.24, abstand: 0.058, bis: 0.07, beugung: [8, 126] };
// Schultern und Ellbogen beim Scott-Curl (sitzend, Becken bei becken): je Seite und die Mitte (x = 0)
function scottLage(becken) {
  const k = rumpf(becken, { neigung: SCOTT.neigung }), ell = {};
  for (const [s, sg] of [['l', 1], ['r', -1]]) ell[s] = k.schulter[s].clone().add(V(sg * SCOTT.arm[0], SCOTT.arm[1], SCOTT.arm[2]).normalize().multiplyScalar(MASS.oberarm * 0.98));
  return { k, ell, schM: k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5), ellM: ell.l.clone().add(ell.r).multiplyScalar(0.5) };
}
// Armpolster mit Stütze: Polster fest unter den Oberarmen, darunter ein Rohr senkrecht zum Boden (zwischen den Knien hindurch)
function scottPolster(ger, z, becken, dicke) {
  const L = scottLage(becken);
  z.pult = ger.polster(0.5, dicke, 0.34, V());
  scottPultLegen(z.pult, L.schM, L.ellM);
  const unter = V(0, -dicke / 2 - 0.01, 0).applyQuaternion(z.pult.quaternion).add(z.pult.position);
  ger.vierkant(V(0, 0.05, unter.z), unter, 0.06);
  ger.vierkant(V(-0.14, 0.035, unter.z), V(0.14, 0.035, unter.z), 0.07);
  return L;
}
// Freie Scott-Bank: Sitz, Armpolster auf einer Stütze, Bodenträger zwischen Sitz und Stütze (Füße stehen daneben auf dem Boden)
function scottBankBauen(ger, z, becken) {
  sitzSaeule(ger, V(0, becken.y - 0.115, becken.z + 0.02), 0.4, 0.38);
  scottPolster(ger, z, becken, 0.065);
  const vorn = z.pult.position.z;
  ger.vierkant(V(0, 0.035, becken.z - 0.2), V(0, 0.035, vorn), 0.07);
  ger.vierkant(V(-0.22, 0.035, becken.z - 0.2), V(0.22, 0.035, becken.z - 0.2), 0.07);
}
// Armpolster für Scott-Curl und Bizepsmaschine: liegt fest unter den Oberarmen (Oberfläche knapp unter der Haut des Oberarms), reicht von
// SCOTT.von bis etwas über den Ellbogen; sch/ell = Mitte der Schultern bzw. Ellbogen aus der Vorlage
function scottPultLegen(pult, sch, ell) {
  const d = ell.clone().sub(sch).setX(0), L = d.length(); d.normalize();
  const geo = pult.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
  const gr = geo.boundingBox.getSize(V()), bis = L + SCOTT.bis;
  pult.scale.z = (bis - SCOTT.von) / gr.z;
  pult.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, d.z, -d.y), d));   // y = vom Arm weg nach oben
  pult.position.copy(sch).setX(0).addScaledVector(d, (SCOTT.von + bis) / 2).addScaledVector(V(0, -d.z, d.y), SCOTT.abstand + gr.y / 2);
}
// Spider Curl: Die Figur steht hinter einer langen Schrägbank (etwa 45°), Bauch und Brust liegen auf der Lehne, die Arme hängen seitlich am Polster vorbei,
// die Beine sind fast gestreckt (bis 5.11. kurzes Pult, die Figur hing in einer halben Kniebeuge und die Beine trugen alles)
const SPIDER_BECKEN = V(0, 0.96, -0.2), SPIDER_RUMPF = { neigung: 35 };
function spiderBankBauen(ger, becken, r) {
  const R = rumpfRahmen(r), bauch = becken.clone().addScaledVector(R.oben, 0.1).addScaledVector(R.vor, 0.152), brust = becken.clone().addScaledVector(R.oben, 0.38).addScaledVector(R.vor, 0.225);
  const d = brust.clone().sub(bauch).normalize(), n = V(0, -d.z, d.y), a = bauch.clone().addScaledVector(d, -0.06), e = brust.clone().addScaledVector(d, 0.1);   // n: von der Figur weg
  ger.polster(0.36, a.distanceTo(e), 0.08, a.clone().lerp(e, 0.5).addScaledVector(n, 0.04), basisAus(d, n));
  const unten = a.clone().addScaledVector(n, 0.115).addScaledVector(d, 0.04), oben = e.clone().addScaledVector(n, 0.115).addScaledVector(d, -0.06);
  ger.vierkant(unten, oben, 0.07);
  for (const p of [oben, unten]) { ger.vierkant(V(0, 0.05, p.z), p, 0.07); ger.vierkant(V(-0.26, 0.035, p.z), V(0.26, 0.035, p.z), 0.07); }
  ger.vierkant(V(0, 0.035, unten.z), V(0, 0.035, oben.z), 0.07);
}
// SZ-Stange mit Knick: Das Griffstück läuft von oben gesehen im Zickzack, die Hände liegen auf den schrägen Stücken (bei x = ±0,18), das Handgelenk steht dadurch leicht gedreht (bis 5.11. gerade wie eine Langhantel)
function szStangeCurl(ger) {
  const lh = ger.sz(), pk = [[0.39, 0], [0.31, 0], [0.26, 0.032], [0.1, -0.032], [0, 0]];
  lh.children[0].visible = false;
  for (const sg of [-1, 1]) for (let i = 0; i < pk.length - 1; i++) {
    const A = V(sg * pk[i][0], 0, pk[i][1]), B = V(sg * pk[i + 1][0], 0, pk[i + 1][1]);
    const rohr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, A.distanceTo(B), 12), ger.mMetall); rohr.castShadow = true; lh.add(legeLaengs(rohr, A, B));
  }
  return lh;
}
// Bizeps. last: kurzhanteln | langhantel | sz | kabel | band ; griff: quer | hammer | ober (Reverse Curl) ; seilgriff: true ; art: stehend | scott | konzentration | schraeg
// art maschine = Scott-Maschine ; art bayesian = Rücken zum Kabelturm, Arm hinter dem Körper (einarmig)
// Neu: art spider (bäuchlings auf der Schrägbank) | drag (Stange am Körper hoch, Ellbogen nach hinten) | handgelenk (Unterarme auf den Oberschenkeln) ;
//   zottman (hoch im Untergriff, runter im Obergriff) ; griff ober bei handgelenk = Handrücken heben ; einarmig (art scott: eine Hantel rechts, die linke Hand liegt auf dem Oberschenkel)
// Ablauf davor (wirkt über animation()): ablaufBand
export function curl(o = {}) {
  const last = o.last || 'kurzhanteln', art = o.art || 'stehend';
  if (art === 'bayesian') return bayesianCurl();
  if (art === 'handgelenk') return handgelenkCurl(o);
  if (art === 'maschine') {
    // Bizepsmaschine (o.trizeps: Trizepsstrecker, gleiche Maschine, Arm streckt sich, Griffe senkrecht): Armweg wie Scott-Curl um den Ellbogen
    const tri = !!o.trizeps, c = curl(tri ? { art: 'scott', last: 'sz', beugung: [-2, 126], griffX: 0.225 } : { art: 'scott', last: 'sz' }), pose = c.pose;   // Trizeps: Griffe in der Linie der Unterarme, unten ganz gestreckt
    const becken = V(0, 0.56, -0.08), C = scottLage(becken).ellM;
    const hebelRichtung = (t) => { const g0 = gelenke(pose(tri ? 1 - t : t).pose), m = g0.hand.l.clone().add(g0.hand.r).multiplyScalar(0.5); return V(0, m.y - C.y, m.z - C.z); };   // R1: Richtung des Hebels zur Hand (y-z)
    c.aufbau = (ger) => { const z = {}; armmaschineBauen(ger, z, becken, C, tri, { v0: hebelRichtung(0), v1: hebelRichtung(1) }); return z; };
    c.pose = (t, zst) => {
      const p = pose(tri ? 1 - t : t, zst);
      if (tri) { p.pose.handflaeche = seiten((s, sg) => V(-sg, 0, 0)); p.pose.ellbogenHalt = seiten((s, sg) => V(sg * 0.5, -0.7, -0.5)); }   // G13: im gestreckten Arm bleibt der Ellbogen unten-hinten, etwas nach außen (Pol schwindet dort, figur.js polStabil; rein unten-hinten stieß 3,2 cm in den Hebel der Maschine, erlaubt sind 2,5 cm)
      p.props = (g, z) => armmaschineStellen(z, g, t);
      return p;
    };
    c.kameraRicht = V(1, 0.35, 0.4);
    return c;
  }
  return {
    ueberSitz: art === 'scott',   // Ablauf: bei Hanteln oder Stange von hinten über den Sitz steigen (das Pult steht vor den Oberschenkeln, von vorn liefen sie hinein)
    aufbau(ger) {
      const z = {};
      if (art === 'scott') scottBankBauen(ger, z, V(0, 0.56, -0.08));
      if (art === 'konzentration' || art === 'schraeg') ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster);
      if (art === 'spider') spiderBankBauen(ger, SPIDER_BECKEN, SPIDER_RUMPF);
      if (art === 'schraeg') ger.box(0.3, 0.8, 0.08, V(0, 0.8, -0.405), ger.mPolster, -30);   // Lehne liegt am Rücken an (vorher 4 cm darin), schmal: Oberarme hängen frei daneben
      if (last === 'langhantel' || last === 'sz') z.lh = last === 'sz' ? szStangeCurl(ger) : ger.langhantel();
      if (last === 'kurzhanteln') khAufbauen(ger, z, art !== 'konzentration' && !o.einarmig);
      if (art === 'stehend' && last === 'kurzhanteln' && o.griff === 'ober') { kopfRund(z.kh_l); kopfRund(z.kh_r); }
      if (last === 'band') {   // Band unter den Füßen, je ein Griff in der Hand (bis 5.11. fehlte es ganz)
        for (const n of ['band_l', 'band_r', 'band_fuss']) z[n] = ger.stab(V(), V(0, 1, 0), 0.01, ger.mBand);
        z.griff_l = ger.griff(); z.griff_r = ger.griff();
      }
      if (last === 'kabel') {
        r3_setze(z, r3_turm(ger, V(0, 0.15, 0.55), V(0, 0, 1), V(0.9, 0.2, 0.6), 'KABELZUG', 'BIZEPS')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel);   // R3: DK-Kabelturm vor der Figur
        if (o.seilgriff) { z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.knoten = r3_knoten(ger); }
        else z.griff = ger.griff(0.5);
      }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t, zst) {
      const sitzend = art !== 'stehend' && art !== 'spider' && art !== 'drag';
      const becken = sitzend ? V(0, 0.56, -0.08) : art === 'spider' ? SPIDER_BECKEN.clone() : V(0, 0.975, 0);
      const r = { neigung: art === 'konzentration' ? 35 : art === 'schraeg' ? -30 : art === 'scott' ? SCOTT.neigung : art === 'spider' ? SPIDER_RUMPF.neigung : 0 };
      const k = rumpf(becken, r), beugung = o.beugung || SCOTT.beugung;
      const hand = {}, epol = {}, flaeche = {};
      // Kurzhanteln stehend: unten neben dem Oberschenkel im Hammergriff und etwas außen (Tragewinkel des Ellbogens), beim Hochgehen
      // dreht die Hand in den Untergriff (Supination, Zottman runter in den Obergriff); sonst ginge die Hantel unten ins Bein
      // Schrägbank ebenso: unten neben der Hüfte im Hammergriff (sonst ragt die quer liegende Hantel ins Gesäß), über dem Gesäß in den Untergriff
      const khSteh = art === 'stehend' && last === 'kurzhanteln', dreh = (khSteh || (art === 'schraeg' && last === 'kurzhanteln')) && ['quer', 'ober'].includes(o.griff || 'quer');
      // Reverse Curl: von unten bis oben im Obergriff (Text: Handrücken nach vorn), die Hantel liegt unten quer vor dem Oberschenkel: Hände etwas außen, Ellbogen unten etwas vor, Arm 14° gebeugt (bis 5.11. unten Hammergriff, er drehte erst beim Hochgehen)
      const oberKh = khSteh && o.griff === 'ober';
      // erst drehen, wenn die Hantel vor dem Oberschenkel (Schrägbank: über dem Gesäß) ist
      const spaet = art === 'schraeg' ? 0.62 : 0, u = oberKh ? 1 : glatt((t - 0.15 - spaet) / (art === 'schraeg' ? 0.25 : 0.35)), aussenWeg = (oberKh ? 0.5 : 1) * (1 - glatt((t - spaet) / 0.5));
      // Zottman: Oben, im ersten Stück des Rückwegs, dreht die Hand vom Untergriff über den Hammergriff (Daumen zur Schulter) in den Obergriff (bis 5.11. schlug sie dort in einem Bild um)
      const zDreh = o.zottman && zst && zst.runter ? glatt((1 - t) / 0.2) : 0;
      const aussen = o.griff === 'ober' ? -1 : Math.cos(Math.PI * zDreh);   // Daumen unten nach vorn, oben nach außen (Untergriff), Zottman runter nach innen
      const uD = art === 'schraeg' ? u * 0.3 : u;   // Schrägbank: oben nur bis etwa 100° Unterarmdrehung (bis 5.11. -114°), die Hantel steht oben leicht schräg
      const daumen = (s, sg, R) => ({ daumen: R.vor.clone().multiplyScalar(1 - uD).add(R.links.clone().multiplyScalar(sg * aussen * uD)).addScaledVector(R.oben, Math.sin(Math.PI * zDreh) * uD).normalize() });
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        let ell;
        if (art === 'scott') ell = scottLage(becken).ell[s];   // Oberarm liegt auf dem Polster
        // Oberarm hängt fast senkrecht, leicht nach innen, der Ellbogen liegt am rechten Oberschenkel und bleibt dort (bis 5.11. war das Ziel außer Reichweite, der Oberarm schwang von 33° auf 67°)
        else if (art === 'konzentration') ell = k.schulter[s].clone().add(V(sg * -0.224, -0.973, 0.03).normalize().multiplyScalar(MASS.oberarm * 0.998));
        // Ellbogen genau eine Oberarmlänge unter der Schulter, sonst kann der Arm unten nicht ganz strecken
        else if (art === 'spider') ell = k.schulter[s].clone().add(V(sg * 0.045, -MASS.oberarm * 0.97, 0.03).normalize().multiplyScalar(MASS.oberarm * 0.998));   // 1.11.: Arme 2,5 cm weiter außen, die kräftigeren Oberarme lagen an der Polsterkante
        // Schrägbank: Arme hängen etwas seitlich neben der Bank, sonst streifen die Hanteln beim Hochkommen Hüfte und Gesäß (vorher 8 cm)
        else ell = k.schulter[s].clone().add(V(sg * (art === 'schraeg' ? 0.09 : 0.02), -MASS.oberarm * 0.97, art === 'schraeg' ? -0.04 : oberKh ? mix(0.075, 0.03, glatt(t / 0.4)) : art === 'stehend' && last !== 'kurzhanteln' && last !== 'band' ? 0.035 : 0.02).normalize().multiplyScalar(MASS.oberarm * 0.998));
        // Scott: unten nicht ganz durchstrecken (Bizepssehne), oben fast ganz beugen
        // unten Arm (fast) gestreckt, Scott nicht ganz (Bizepssehne); Schrägbank oben nicht übers Ziel hinaus
        // Stange (Lang-, SZ-Hantel, Kabel) stehend: unten vor den Oberschenkeln, Arm minimal gebeugt, nicht in den Beinen
        const w = mix(o.seilgriff ? 9 : last === 'sz' && o.griff !== 'ober' && art === 'stehend' ? 21 : oberKh ? 15 : art === 'stehend' && last !== 'kurzhanteln' && last !== 'band' ? 15 : art === 'konzentration' ? 8 : 1, art === 'schraeg' ? 120 : art === 'konzentration' ? 133 : 140, t) * RAD;   // Schrägbank: oben vor den Schultern, nicht über der Brust
        let ab = V(0, -Math.cos(w), Math.sin(w));
        if (art === 'scott') {   // Scott: Beugung im Ellbogen von SCOTT.beugung[0] bis [1] Grad, gemessen am Oberarm auf dem Polster
          const d = ell.clone().sub(k.schulter[s]).setX(0).normalize(), hoch = V(0, d.z, -d.y), b = mix(beugung[0], beugung[1], t) * RAD;
          ab = d.multiplyScalar(Math.cos(b)).add(hoch.multiplyScalar(Math.sin(b)));
        }
        if (art === 'konzentration') {   // Unterarm klappt vom Oberarm weg nach vorn: unten fast in Verlängerung des Arms, oben vor der Schulter
          const d = ell.clone().sub(k.schulter[s]).normalize(), vor = V(0, 0, 1).addScaledVector(d, -d.z).normalize();
          ab = d.multiplyScalar(Math.cos(w)).addScaledVector(vor, Math.sin(w));
        }
        if (o.seilgriff) ab.x -= sg * mix(0.2, 0.1, t);   // Seil: Hände unten mittig, zur Schulter hin gehen die Enden auseinander, die Ellbogen bleiben am Körper (bis 5.11. blieben die Hände zusammen, der Oberarm schwang 30° ab)
        if (khSteh && art === 'stehend') ab.x += sg * 0.2 * aussenWeg;   // 1.11.: 0,2 statt 0,17 (Beine kräftiger)
        // Schrägbank: unten hängt der Unterarm in Verlängerung des leicht abgespreizten Oberarms (Arm gestreckt, bis 31.10. 20° gebeugt)
        if (art === 'schraeg') ab.x += sg * 0.2 * Math.max(0, Math.cos(w));
        hand[s] = genau(ell.clone().add(ab.normalize().multiplyScalar(UNTERARM + (o.griffX ? MASS.oberarm * 0.02 : 0))));   // griffX (Trizepsstrecker): scottLage rechnet den Oberarm 2 % kürzer, sonst bliebe der Arm unten krumm
        if (art === 'konzentration' && s === 'l') { hand[s] = becken.clone().add(V(0.2, 0.05, 0.3)); }
        if (last === 'langhantel' || last === 'sz') hand[s].x = sg * (o.griffX || (last === 'sz' ? 0.18 : 0.21));   // etwa schulterbreit, Ellbogen bleiben seitlich am Körper
        // Scott: Pol zeigt zum Ellbogen auf dem Polster (fest), sonst klappt der Ellbogen oben, wenn die Hand nah an der Schulter ist, nach oben weg
        epol[s] = art === 'scott' || (art === 'konzentration' && s === 'r') || o.seilgriff ? ell.clone().sub(k.schulter[s].clone().lerp(hand[s], 0.5)) : V(0, -0.4, -1);
        if (art === 'scott' && o.einarmig && s === 'l') {   // Die freie Hand liegt außen auf dem linken Oberschenkel, der Arm geht am Pult vorbei
          hand[s] = V(0.29, 0.66, 0.2);
          epol[s] = V(1, -0.2, -0.5);
        }
        if (art === 'drag') {   // Stange gleitet am Körper hoch, Ellbogen wandern nach hinten: unten Arme fast gestreckt vor den Oberschenkeln, oben an der unteren Brust (bis 5.11. Start am Hosenbund, 61° gebeugt)
          hand[s] = mv(V(sg * 0.2, 0.805, 0.1), V(sg * 0.2, 1.22, 0.13), t);
          epol[s] = V(sg * 0.2, 0, -1);
          if (s === 'r') { const p = { becken, rumpf: r, hand }; vorDemRumpf(p, 0.016); vorDenBeinen(Object.assign(p, stehFuesse(0.14)), 0.016); hand.l = p.hand.l; hand.r = p.hand.r; }   // Stange liegt am Körper an
        }
        // Handfläche: Untergriff zeigt zur Schulter, Obergriff (Reverse Curl) davon weg, Hammergriff zur Körpermitte
        const a = hand[s].clone().sub(ell).normalize(), unter = V(0, a.z, -a.y);
        const ober = o.griff === 'ober' || (o.zottman && zDreh > 0.5);   // Zottman: runter im Obergriff (die Griffachse aus daumen() bestimmt die Hand, das hier gilt nur ohne sie)
        flaeche[s] = o.griff === 'hammer' ? k.R.links.clone().multiplyScalar(-sg) : art === 'drag' ? V(-sg * 0.04, 0.3, 1) : ober ? unter.negate() : unter;
        if (dreh) flaeche[s] = k.R.links.clone().multiplyScalar(-sg * (1 - u)).add(flaeche[s].multiplyScalar(u)).normalize();   // unten zur Körpermitte   // unten zur Körpermitte
        if (art === 'scott' && o.einarmig && s === 'l') flaeche[s] = V(0, -1, 0.2);   // freie Hand liegt flach auf dem Oberschenkel
      }
      return {
        pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: flaeche }, dreh ? { griffAchse: seiten((s, sg) => daumen(s, sg, k.R)) } : art === 'konzentration' ? { griffAchse: { r: daumen('r', -1, k.R) } } : {}, sitzend ? { fuss: seiten((s, sg) => V(sg * (art === 'konzentration' ? 0.34 : 0.25), FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.3, 1, 1)) } : stehFuesse(0.14, art === 'spider' ? -0.3 : 0)),
        props(g, z) {
          if (z.lh) stangeAn(z.lh, g);
          if (last === 'sz') {   // Die Stange dreht mit den Unterarmen, der Knick liegt quer zu ihnen. Obergriff: umgedreht, die Hände liegen auf den anderen schrägen Stücken
            const a = unterarmAchse(g, 'l').add(unterarmAchse(g, 'r')).normalize();
            z.lh.rotateX(Math.atan2(-a.z, -a.y) + (o.griff === 'ober' ? Math.PI : 0));
          }
          if (z.kh_l && dreh) { for (const [s, sg] of [['l', 1], ['r', -1]]) khHalten(z, g, s, z['kh_' + s], daumen(s, sg, g.R)); }
          else if (z.kh_l) {
            if (art === 'konzentration') khHalten(z, g, 'r', z.kh_l, daumen('r', -1, g.R));
            else if (o.einarmig) { const ua = unterarmAchse(g, 'r'); khHalten(z, g, 'r', z.kh_l, g.R.links.clone().sub(ua.clone().multiplyScalar(g.R.links.dot(ua)))); }
            else kurzhantelnAn(z, g, o.griff === 'hammer' ? 'hammer' : 'quer');
          }
          if (art === 'spider' && z.kh_l) for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], V(1, 0, 0));
          if (z.band_l) {   // Das Band läuft unter beiden Füßen durch, je ein Ende geht in die Hand
            const fuss = { l: bandAmFuss(g, 'l', 1), r: bandAmFuss(g, 'r', -1) };
            seil(z.band_fuss, fuss.l, fuss.r);
            for (const [s, sg] of [['l', 1], ['r', -1]]) { z['griff_' + s].position.copy(g.hand[s]); bandKette(z, 'band_' + s, umDenKoerper(g, fuss[s], g.hand[s], 0.01, g.R.links.clone().multiplyScalar(sg))); }
          }
          if (z.seil) {
            const mitte = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), a = V(0, 0.15, 0.55);
            if (z.strang_l) {   // Seilgriff: Kabel bis zum Knoten, von dort je ein Seilende in jede Hand
              const knoten = mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.16));
              seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r);
              z.knoten.position.copy(knoten); z.dkTurm[0].zieh(a.distanceTo(knoten));
            } else { kabelstangeAn(z.griff, g, a); seil(z.seil, a, mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(0.03))); z.dkTurm[0].zieh(a.distanceTo(mitte) - 0.03); }
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
  // Rumpf so weit vor, dass die Oberarme hängen und die Unterarme auf den Oberschenkeln liegen; das Handgelenk ragt 3–4 cm über das Knie hinaus. Ellbogen und Handgelenk stehen fest (bis 5.11. Rumpf 18°, Unterarm in der Luft, er wanderte 3 cm mit)
  const becken = V(0, 0.56, -0.08), r = { neigung: 34 }, k = rumpf(becken, r);
  const gelenk = (sg) => V(sg * 0.18, 0.6, 0.452);
  const ell = (s, sg) => { const S = k.schulter[s], x = sg * 0.165, z = 0.19; return V(x, S.y - Math.sqrt((MASS.oberarm * 0.998) ** 2 - (x - S.x) ** 2 - (z - S.z) ** 2), z); };
  return {
    aufbau(ger) { ger.box(0.4, 0.45, 0.4, V(0, 0.225, -0.08), ger.mPolster); const z = {}; khAufbauen(ger, z); return z; },
    pose(t) {
      const knick = ober ? mix(-20, 40, t) : mix(40, -45, t);   // handKnick: + zum Handrücken, - zur Handfläche. Untergriff: oben zur Handfläche gerollt, Obergriff: oben zum Handrücken
      // Das Handgelenk bleibt, wo es ist (Unterarm liegt auf dem Oberschenkel), die Faust geht um es herum (bis 3.11. stand die Faust fest und der Unterarm wanderte, die Hantel lag 10 cm neben der Faust)
      const kw = knick * RAD, hand = {}, epol = {};
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        const E = ell(s, sg), W = E.clone().add(gelenk(sg).sub(E).normalize().multiplyScalar(MASS.unterarm)), a = W.clone().sub(E).normalize();
        const n = V(0, ober ? 1 : -1, 0).addScaledVector(a, -(ober ? 1 : -1) * a.y).normalize(), ak = a.clone().multiplyScalar(Math.cos(kw)).addScaledVector(n, Math.sin(kw)), nk = n.clone().multiplyScalar(Math.cos(kw)).addScaledVector(a, -Math.sin(kw));
        hand[s] = genau(W.clone().addScaledVector(ak, MASS.griff).addScaledVector(nk, -MASS.griffTief));
        epol[s] = E.clone().sub(k.schulter[s].clone().lerp(hand[s], 0.5));
      }
      return { pose: { becken, rumpf: r, kopf: { neigung: -15 }, hand, handflaeche: seiten(() => V(0, ober ? -1 : 1, 0)), handKnick: seiten(() => knick), ellbogenPol: epol,
          fuss: seiten((s, sg) => V(sg * 0.2, FY, 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { for (const s of ['l', 'r']) hantelAn(z['kh_' + s], g.hand[s], faustAchse(g, s)); } };
    },
    blick: V(0, 0.65, 0.1), abstand: 2.6, kameraRicht: V(1, 0.45, 0.4)
  };
}

// Bayesian Curl: Rücken zum Turm, der rechte Oberarm steht fest 22° hinter der Rumpflinie, der Unterarm klappt vor ihm hoch zur Schulter, Schrittstellung
// (bis 5.11. klappte er nach hinten, die Hand landete hinter dem Kopf; das Kabel läuft außen an der Hüfte vorbei)
function bayesianCurl() {
  return {
    aufbau(ger) { const z = r3_setze({}, r3_turm(ger, V(-0.42, 0.25, -0.75), V(0, 0, -1), V(1, 0.2, 0.15), 'KABELZUG', 'BIZEPS')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff(); r3_vorlauf(this, z); return z; },   // R3: DK-Kabelturm hinter der Figur
    pose(t) {
      const becken = V(0, 0.96, 0.02);
      const r = { neigung: 8 };
      const k = rumpf(becken, r);
      const e = 22 * RAD, u = k.R.oben.clone().multiplyScalar(-Math.cos(e)).addScaledVector(k.R.vor, -Math.sin(e)).add(V(-0.1, 0, 0)).normalize();
      const ell = k.schulter.r.clone().addScaledVector(u, MASS.oberarm * 0.998);
      const vor = V(0, u.z, -u.y).normalize();     // senkrecht zum Oberarm nach vorn: dorthin klappt der Unterarm
      const w = mix(14, 135, t) * RAD;
      const a = u.clone().multiplyScalar(Math.cos(w)).addScaledVector(vor, Math.sin(w));
      const handR = genau(ell.clone().addScaledVector(a, UNTERARM));
      return { pose: { becken, rumpf: r, hand: { r: handR, l: becken.clone().add(V(0.17, 0.05, 0.06)) }, handflaeche: { r: V(0, a.z, -a.y) }, ellbogenPol: { r: ell.clone().sub(k.schulter.r.clone().lerp(handR, 0.5)), l: V(1, 0, -0.5) },
          fuss: { l: V(0.13, FY, 0.3), r: V(-0.13, FY, -0.22) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) { z.griff.position.copy(g.hand.r); seil(z.seil, V(-0.42, 0.25, -0.75), g.hand.r); z.dkTurm[0].zieh(V(-0.42, 0.25, -0.75).distanceTo(g.hand.r)); } };
    },
    blick: V(0, 0.95, 0), abstand: 3.2, kameraRicht: V(1, 0.2, 0.15)
  };
}

// Band oben befestigt: schmaler Pfosten mit Fuß und Öse (eine Tür stünde der Übung im Bild), anker = Ansatz des Bands
function bandPfosten(ger, anker) {
  const hoehe = anker.y + 0.08, x = anker.x, zz = anker.z + 0.05;
  ger.vierkant(V(x, 0.03, zz), V(x, hoehe, zz), 0.07);
  ger.vierkant(V(x - 0.2, 0.03, zz), V(x + 0.2, 0.03, zz), 0.06);
  ger.vierkant(V(x, 0.03, zz - 0.2), V(x, 0.03, zz + 0.2), 0.06);
  ger.stab(V(x, anker.y, anker.z - 0.02), V(x, anker.y, anker.z + 0.05), 0.016, ger.mMetall);
}
// Trizeps. art: pushdown | ueberkopf | kickback | dips | dip_maschine ; last: kabel | kurzhantel | band | koerpergewicht
// pushdown: einarmig ; dips: brust (mehr Vorneigung), assistiert (Kniepolster an der Maschine)
// Neu: art bankdips (Hände hinter dir auf der Bank) | maschine (Trizepsstrecker sitzend, Ellbogen auf dem Pult) ; pushdown: seil, griff unter
export function trizeps(o = {}) {
  const art = o.art || 'pushdown', last = o.last || 'kabel';
  if (art === 'dip_maschine') return dipMaschine();
  if (art === 'bankdips') return bankDips();
  if (art === 'maschine') return curl({ art: 'maschine', trizeps: true });   // Trizepsstrecker: Bizepsmaschine rückwärts, Griffe senkrecht
  const band = art === 'ueberkopf' && last === 'band', kabelKopf = art === 'ueberkopf' && last === 'kabel';
  const turmX = o.einarmig ? -0.22 : 0;   // einarmig: Rolle über der arbeitenden Hand, das Kabel läuft vor dem Arm herunter, nicht quer vor der Brust
  // Überkopf am Kabel: Seil von der mittelhohen Rolle hinter dem Rücken; von der tiefen Rolle liefe es beim gestreckten Arm durch den Kopf
  const ANKER_KOPF = V(0, 2.0, -0.9);
  return {
    ablaufT: art === 'ueberkopf' && last === 'kurzhantel' ? 1 : 0,
    aufbau(ger) {
      const z = {};
      if (art === 'pushdown' && last === 'band') { bandPfosten(ger, V(0, 2.0, 0.42)); z.band_l = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.012, ger.mBand); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }
      else if (art === 'pushdown' && o.seil) { r3_setze(z, r3_turm(ger, V(0, 2.0, 0.55), V(0, 0, 1), V(1, 0.25, 0.55), 'KABELZUG', 'TRIZEPS')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.knoten = r3_knoten(ger); }   // R3: DK-Kabelturm, Öse oben wie bisher auf 2 m
      else if (art === 'pushdown') { r3_setze(z, r3_turm(ger, V(turmX, 2.0, 0.55), V(0, 0, 1), V(1, 0.25, 0.55), 'KABELZUG', 'TRIZEPS')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff(o.einarmig ? 0 : 0.5); }
      if (art === 'ueberkopf') { if (last === 'kabel') { r3_setze(z, r3_turm(ger, ANKER_KOPF, V(0, 0, -1), V(1, 0.25, 0.55), 'KABELZUG', 'TRIZEPS')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.knoten = r3_knoten(ger); } else if (band) { z.seil = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); } else { z.kh_l = ger.kurzhantel(KELCH_MASS.innen.schwer); } }
      if (art === 'kickback') { ger.bank(-0.17, 1.1, 0.4, 0).position.x = 0.14;   // Bank reicht vom Fuß des Stützbeins bis unter die Stützhand
        z.kh_l = ger.kurzhantel(); }   // Bank unter der Stützseite, rechts ist Platz für Standbein und Hantel
      if (art === 'dips' && o.assistiert) assistBauen(ger, z, 'dips');
      else if (art === 'dips') dipBarrenBauen(ger);
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      if (art === 'dips') {
        // Unten Oberarm nahe der Waagerechten (70–85° zur Senkrechten, Ellbogen um 100°), die Schulter kommt dafür ein Stück vor die Hände; oben Arme gestreckt (bis 5.11. unten nur 55–65°, oben bis 17° gebeugt)
        const griff = V(0.27, 1.25, 0.08), hebU = (o.brust ? 80 : 75) * RAD, beuU = 100 * RAD, unten = V(0, griff.y + MASS.oberarm * Math.cos(hebU) + UNTERARM * Math.cos(beuU - hebU), griff.z + MASS.oberarm * Math.sin(hebU) - UNTERARM * Math.sin(beuU - hebU));
        const oben = V(0, griff.y + Math.sqrt((ARM * 0.998) ** 2 - (griff.x - MASS.schulterBreite) ** 2 - 0.05 ** 2), griff.z + 0.05);
        const S = mv(unten, oben, t), r = { neigung: o.brust ? mix(26, 16, t) : mix(18, 8, t) };   // leichte Vorlage, unten höchstens etwa 30°
        const becken = S.clone().addScaledVector(rumpfRahmen(r).oben, -(MASS.rumpf - 0.03));
        const fuss = o.assistiert ? seiten((s, sg) => becken.clone().add(V(sg * 0.09, -0.47, -0.42))) : seiten((s, sg) => becken.clone().add(V(sg * 0.07, -0.72, -0.3)));
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * griff.x, griff.y, griff.z)), handflaeche: seiten((s, sg) => V(-sg, 0, 0)), ellbogenPol: seiten((s, sg) => V(sg * (o.brust ? 0.3 : 0.2), 0.3, -1)),
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
        // Linkes Knie auf der Bank, Schienbein liegt flach, der Fuß am Bankende. Das Becken steht so hoch, dass das rechte Standbein leicht gebeugt ist (bis 5.11. Schienbein 35° steil, Fuß in der Luft, Standbein 44°)
        const becken = V(0.05, 0.89, -0.38);
        const r = { neigung: 80 };
        const k = rumpf(becken, r);
        // Oberarm waagerecht und fest am Körper, nur wenig außen: die Hantel läuft außen an Hüfte und Bein vorbei
        const ell = k.schulter.r.clone().add(V(-0.5, -0.01, -1).normalize().multiplyScalar(MASS.oberarm * 0.998));
        const w = mix(95, -6, t) * RAD;   // unten Unterarm senkrecht, oben ganz gestreckt
        const u = ell.clone().sub(k.schulter.r).normalize(), runter = V(0, -1, 0).addScaledVector(u, u.y).normalize();   // Unterarm klappt in der Ebene des Oberarms: am Ende liegt er genau in seiner Verlängerung
        const handR = genau(ell.clone().addScaledVector(u, Math.cos(w) * UNTERARM).addScaledVector(runter, Math.sin(w) * UNTERARM));
        return { pose: { becken, rumpf: r, kopf: { neigung: -30 }, hand: { l: V(0.17, 0.47, 0.3), r: handR }, flach: { l: V(0, 1, 0) }, ellbogenPol: { l: V(1, 0, -0.2), r: ell.clone().sub(k.schulter.r.clone().lerp(handR, 0.5)) }, fuss: { l: V(0.13, 0.52, -0.68), r: V(-0.12, FY, -0.68) }, fussRicht: { l: V(0, -0.9, -0.45), r: V(-0.2, 0, 1) }, kniePol: { l: V(0, -1, 0.5), r: V(-0.3, 0, 1) } },
          props(g, z) { khHalten(z, g, 'r', z.kh_l, 'neutral'); } };
      }
      const becken = V(0, 0.975, kabelKopf ? -0.02 : 0);
      const r = { neigung: art === 'pushdown' ? 3 : kabelKopf ? 8 : -4 };   // Pushdown: aufrecht, bei mehr Vorlage käme der gestreckte Arm nicht vor den Oberschenkel, ohne dass der Oberarm vom Rumpf weggeht (bis 5.11. 10°)
      const k = rumpf(becken, r);
      const hand = {}, epol = {};
      let gelenkZiel = null;
      for (const [s, sg] of [['l', 1], ['r', -1]]) {
        if (art === 'pushdown') {
          // Griffbreite: Stange etwas enger als die Schultern; Seil: oben zusammen, unten auseinander bis neben die Oberschenkel; Band: unten neben die Oberschenkel; einarmig: die Hand endet neben dem Oberschenkel (bis 31.10. Griff 2,6 cm darin)
          const neben = o.seil || o.einarmig || last === 'band', breite = o.seil ? mix(0.07, 0.19, t) : o.einarmig ? 0.215 : last === 'band' ? mix(0.155, 0.19, t) : 0.155;
          // Oberarm bleibt am Körper, nur der Unterarm bewegt sich: oben an der Rumpfachse, unten geht er wenig vor, nur so weit, dass der Griff vor den Oberschenkel kommt. Neben dem Oberschenkel bleibt er fast an der Achse
          // Stange: Am Ende liegen Schulter, Ellbogen und Faust auf einer Linie, die Stange liegt am Oberschenkel an, der Oberarm steht dafür 10° vor dem Rumpf (bis 5.11. blieb 1,5 cm Luft und der Ellbogen 14° gebeugt)
          const stangePd = !neben;
          const e = mix(2, o.einarmig ? 3 : neben ? 8 : 10.2, t) * RAD, aussen = o.einarmig ? 0.016 : stangePd ? -0.022 * t : 0, ell = k.schulter[s].clone().addScaledVector(k.R.oben, -Math.cos(e) * MASS.oberarm * 0.998).addScaledVector(k.R.vor, Math.sin(e) * MASS.oberarm * 0.998).add(V(sg * aussen, 0, 0));
          const w = mix(95, stangePd ? 7.7 : o.einarmig ? 3 : 8, t) * RAD;   // unten gestreckt, Hände vor den Oberschenkeln (neben ihnen: auch etwas davor, der Griff streift sonst das Bein)
          const x = sg * breite, dx = (x - ell.x) / UNTERARM, c = Math.sqrt(Math.max(0.2, 1 - dx * dx));
          hand[s] = genau(ell.clone().add(V(0, -Math.cos(w) * c, Math.sin(w) * c).multiplyScalar(UNTERARM)).setX(x));
          // Pol genau zum geplanten Ellbogen: der Oberarm bleibt am Körper (bis 31.10. Pol nach hinten → Oberarm 11–12° davon weg)
          epol[s] = ell.clone().sub(k.schulter[s].clone().lerp(hand[s], 0.5));
        } else if (kabelKopf) {
          // Rücken zum Kabel: Arme schräg nach vorn-oben, am Ende 17° vor der Senkrechten, die Oberarme bleiben neben dem Kopf
          const a0 = 17 * RAD, ell = k.schulter[s].clone().add(V(-sg * 0.04, Math.cos(a0), Math.sin(a0)).normalize().multiplyScalar(MASS.oberarm * 0.998));
          const w = mix(-118, 17, t) * RAD;   // Richtung des Unterarms, von der Senkrechten nach vorn: unten hinter dem Kopf, oben in Verlängerung des Oberarms
          hand[s] = genau(ell.clone().add(V(-sg * 0.06, Math.cos(w), Math.sin(w)).normalize().multiplyScalar(UNTERARM)));
          epol[s] = ell.clone().sub(k.schulter[s].clone().lerp(hand[s], 0.5));
        } else {
          const ell = k.schulter[s].clone().add(V(-sg * 0.04, MASS.oberarm * 0.99, 0.03));
          const w = mix(135, -4, t) * RAD;   // oben ganz gestreckt, unten hinter dem Kopf (nicht im Nacken)
          hand[s] = genau(ell.clone().add(V(-sg * 0.06, Math.cos(w) * UNTERARM, -Math.sin(w) * UNTERARM)));
          if (last === 'kurzhantel') (gelenkZiel = gelenkZiel || V()).add(ell).add(V(0, Math.cos(w) * MASS.unterarm, -Math.sin(w) * MASS.unterarm)).addScaledVector(V(-sg, 0, 0), 0.05);
          epol[s] = V(sg * 0.2, 1, 0.4);
        }
      }
      // Eine Hantel über dem Kopf: Handflächen von unten am oberen Kopf, die Hantel hängt fast senkrecht (oben leicht gekippt, sonst müsste das Handgelenk 90° schaffen)
      let kelch = null;
      if (art === 'ueberkopf' && last === 'kurzhantel') { const tau = mix(17, 25, t) * RAD, U = V(0, Math.cos(tau), Math.sin(tau)), v = U.clone().cross(V(1, 0, 0)), gr = kelchAmGelenk(gelenkZiel.multiplyScalar(0.5), U, v, V(1, 0, 0), true); hand.l = gr.hand.l; hand.r = gr.hand.r; kelch = gr.kelch; }
      // einarmig: die freie Hand liegt an der Hüfte
      if (o.einarmig && art === 'pushdown') { hand.l = becken.clone().add(V(0.17, 0.05, 0.06)); epol.l = V(1, 0, -0.5); }
      // Band über Kopf: hinterer Fuß steht auf dem Band ; Kabel über Kopf: kleine Schrittstellung gegen den Zug nach hinten
      const fuesse = band ? { fuss: { l: V(0.13, FY, 0.22), r: V(-0.13, FY, -0.25) }, zehen: { l: 0, r: 15 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } : kabelKopf ? { fuss: { l: V(0.13, FY, 0.16), r: V(-0.13, FY, -0.2) }, zehen: { l: 0, r: 12 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } : stehFuesse(0.14, 0, 0.25);
      // Untergriff: Handflächen nach oben bzw. vorn ; Seil: Handflächen zueinander
      const flaeche = o.griff === 'unter' ? seiten((s) => { const a = hand[s].clone().sub(k.schulter[s]); return V(0, Math.max(0.2, -a.y), 1); }) : o.seil || o.einarmig || (art === 'pushdown' && last === 'band') || kabelKopf ? seiten((s, sg) => V(-sg, 0, 0)) : undefined;
      const pose = Object.assign({ becken, rumpf: r, hand, ellbogenPol: epol, handflaeche: flaeche, kelch }, fuesse, kabelKopf ? { ellbogenHalt: seiten(() => V(0, 0, 1)) } : {});   // G13: Kabel über Kopf: der Ellbogen zeigt im gestreckten Arm nach vorn (Pol schwindet dort, figur.js polStabil)
      if (art === 'pushdown' && !o.einarmig && !o.seil && last !== 'band') vorDenBeinen(pose, 0.003, 0);   // unten: die Stange liegt vor den Oberschenkeln
      return {
        pose,
        props(g, z) {
          const mitte = o.einarmig ? g.hand.r.clone() : g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5);
          if (z.strang_l) { const a = kabelKopf ? ANKER_KOPF : V(0, 2.0, 0.55), knoten = mitte.clone().add(a.clone().sub(mitte).normalize().multiplyScalar(kabelKopf ? 0.22 : 0.16)); seil(z.seil, a, knoten); seil(z.strang_l, knoten, g.hand.l); seil(z.strang_r, knoten, g.hand.r); z.knoten.position.copy(knoten); z.dkTurm[0].zieh(a.distanceTo(knoten)); }
          if (z.griff) {
            const anker = V(turmX, 2.0, 0.55);
            if (o.einarmig) z.griff.position.copy(mitte); else kabelstangeAn(z.griff, g, anker);
            seil(z.seil, anker, mitte.clone().add(anker.clone().sub(mitte).normalize().multiplyScalar(o.einarmig ? 0 : 0.03)));
            z.dkTurm[0].zieh(anker.distanceTo(mitte) - (o.einarmig ? 0 : 0.03));
          }
          if (z.band_l) for (const [s, sg] of [['l', 1], ['r', -1]]) { z['griff_' + s].position.copy(g.hand[s]); bandKette(z, 'band_' + s, umDenKoerper(g, V(sg * 0.04, 2.0, 0.42), g.hand[s], 0.012, g.R.vor)); }
          if (band) bandKette(z, 'seil', umDenKoerper(g, bandAmFuss(g, 'r', -1), mitte, 0.03, g.R.vor.clone().negate()));
          if (z.kh_l && art === 'ueberkopf') { const tau = mix(17, 25, t) * RAD, U = V(0, Math.cos(tau), Math.sin(tau)); kelchAn(z.kh_l, g, U, U.clone().cross(V(1, 0, 0)), V(1, 0, 0), true); }
        }
      };
    },
    blick: V(0, 1.1, 0), abstand: 3.4, kameraRicht: V(1, 0.25, 0.55)
  };
}

// Becken zu einer Schultermitte S, wenn das Becken im Rahmen r liegt und die Wirbelsäule um w gebogen ist (Brustkorb bleibt, Becken rollt)
function beckenUnter(S, r, w) {
  const RB = rumpfRahmen(r), R = wirbelRahmen(RB, w);
  return S.clone().addScaledVector(R.oben, 0.03).sub(wirbelBogen(RB, w, MASS.rumpf));
}
// Hüftgelenk wie in gelenke() (RB = Rahmen des Beckens)
function hueftGelenk(becken, RB, s) { return becken.clone().addScaledVector(RB.links, (s === 'l' ? 1 : -1) * MASS.hueftBreite).addScaledVector(RB.oben, -0.02); }
// Bein aus Winkeln statt aus einem Fußziel: a = Oberschenkel von „aus“ (Bein lang) Richtung „hoch“ (Hüftbeugung), k = Kniebeugung, in Grad. So bleibt das Bein in jedem Bild so gerade, wie k sagt
// (ein Ziel auf gerader Linie knickt das Knie unterwegs). pol = Kniepol, fr(p) = Fußrichtung, p Grad gestreckt (0 = Fuß quer zum Schienbein)
function beinAus(huefte, a, k, aus, hoch) {
  const dir = (w) => aus.clone().multiplyScalar(Math.cos(w * RAD)).addScaledVector(hoch, Math.sin(w * RAD));
  return { fuss: huefte.clone().addScaledVector(dir(a), MASS.oberschenkel).addScaledVector(dir(a - k), MASS.unterschenkel), pol: dir(a - k / 2 + 90), fr: (p) => dir(a - k + 90 - p) };
}
const BEIN_AUS = V(0, 0, 1), BEIN_HOCH = V(0, 1, 0);   // beinAus in Rückenlage: 0° = Bein lang auf dem Boden, 90° = senkrecht
// Rückenlage: Arm lang neben dem Körper, Hand flach am Boden (Ziel = Handgelenk), knapp unter der vollen Armlänge
function armNeben(S, sg, y = 0.05, aussen = 0.1) { const dy = S.y - y; return V(S.x + sg * aussen, y, S.z + Math.sqrt(Math.max(0.01, (STUETZ * 0.997) ** 2 - dy * dy - aussen * aussen))); }
// Hände locker an den Schläfen: so weit weg von der Schulter, dass der Ellbogen rund 140° gebeugt bleibt (nicht ganz zusammengefaltet)
const amKopf = (k, sg) => k.brust.clone().addScaledVector(k.R.oben, 0.19).addScaledVector(k.R.links, sg * 0.1).addScaledVector(k.R.vor, 0.02);
// Arme vor der Brust gekreuzt: Hand auf der anderen Brustseite, Ellbogen tief vor dem Rumpf (Oberarm 20–40°, Unterarm über der Brust). Der linke Arm liegt oben
const gekreuzt = (k, sg) => k.brust.clone().addScaledVector(k.R.vor, sg > 0 ? 0.25 : 0.215).addScaledVector(k.R.links, -sg * 0.09).addScaledVector(k.R.oben, sg > 0 ? -0.04 : -0.09);
const gekreuztPol = (k, sg, aussen = 0.25) => k.R.oben.clone().negate().addScaledVector(k.R.vor, 0.5).addScaledVector(k.R.links, sg * aussen);
// Eine flache Hand in der Luft: gelenke() nimmt flache Hände als Stütze und senkt den Körper, wenn der Arm über die Waagerechte geht. Stützt nur die andere Hand (Bird Dog),
// bleibt der Körper, wo er ist: Becken und freie Hand um den Betrag zurück (frei = 'l', 'r' oder null)
function ohneSinken(pose, frei) {
  if (!frei) return pose;
  const d = pose.becken.clone().sub(gelenke(pose).becken);
  pose.becken = pose.becken.clone().add(d);
  pose.hand = Object.assign({}, pose.hand, { [frei]: pose.hand[frei].clone().add(d) });
  return pose;
}
// Hollow-Form (Rückenlage, Becken bei z = 0,25): Wirbelsäule rund, Arme und Beine lang. Hold und Rock teilen sie; a = 0…1 kleine Atembewegung
function hollowForm(a = 0) {
  const r = { basis: LIEGEND, neigung: -8 }, w = { beuge: 26 }, becken = V(0, 0.12, 0.25), k = rumpf(becken, r, w), RB = rumpfRahmen(r);
  const eArm = (9 + a) * RAD, eBein = 10 + a;
  const hand = seiten((s) => k.schulter[s].clone().add(V(0, Math.sin(eArm) * ARM * 0.998, -Math.cos(eArm) * ARM * 0.998)));   // Griff schulterbreit: Oberarme neben den Ohren
  const bein = seiten((s) => beinAus(hueftGelenk(becken, RB, s), eBein, 7, BEIN_AUS, BEIN_HOCH));
  return { r, w, becken, hand, fuss: seiten((s, sg) => bein[s].fuss.clone().add(V(-sg * 0.02, 0, 0))), kpol: seiten((s) => bein[s].pol), fr: seiten((s) => bein[s].fr(35)) };
}
// Hängen an der Stange (Beinheben, Knieheben): Arme gestreckt, Schultern knapp hinter der Stange. roll: Grad, um die das Becken nach hinten einrollt (die Brust bleibt, die Wirbelsäule gleicht aus);
// vor: Grad, um die der Rumpf nach vorn kippt, wenn die Beine vorn sind (das Becken wandert zurück, sonst läge der Schwerpunkt vor der Stange)
const HANG_Y = 2.4, HANG_X = 0.3;   // Stange so hoch, dass gestreckte Beine frei hängen
function hangPose(roll, vor) {
  const r = { neigung: vor - roll }, w = { beuge: roll }, sx = HANG_X - MASS.schulterBreite;
  const becken = beckenUnter(V(0, HANG_Y - Math.sqrt((ARM * 0.9985) ** 2 - sx * sx), -0.03), r, w);
  return { becken, r, w, RB: rumpfRahmen(r), hand: seiten((s, sg) => V(sg * HANG_X, HANG_Y, 0)), ellbogenPol: seiten((s, sg) => V(sg, 0, -0.3)) };
}

/* =================================================================== */
/* Rumpf                                                                */
/* =================================================================== */

const KC_TURM_Z = 0.95;   // Kabelcrunch: Turm vor der knienden Figur
const RS45_HUEFTE = V(0, 1.04, 0.12), RS45_BEIN = V(0, Math.SQRT1_2, Math.SQRT1_2);   // 45°-Rückenstrecker: Hüftgelenk (Drehpunkt) und Richtung Knöchel → Hüfte (Bein in der Flucht der Bank)
// art: plank | seitstuetz | deadbug | fersen_tippen | birddog | crunch | curlup | beinheben_haengend | beinheben_liegend | rollout | pallof | hollow | russian | kabelcrunch | rueckenstrecker | superman | rueckenstrecker_sanft
//   | plank_knie | body_saw | rollout_stehend | reverse_crunch | knieheben_haengend | hollow_rock | bauchmaschine | rueckenstrecker_maschine ; pallof: last band ; rollout: last langhantel
// Neu: situp | vup | fahrrad | schultertippen | mountain | lsitz | negativ_crunch ; seitstuetz + heben (Hüfte senken und heben)
// Ablauf davor (wirkt über animation()): standVersatz
// Neu (G10-N2): fersenrutschen | beinheben_einbeinig (Rückenlage ohne Gerät, ein Bein arbeitet, eigene Funktion rumpfLiegend)
export function rumpfuebung(o = {}) {
  const art = o.art || 'plank';
  if (art === 'fersenrutschen' || art === 'beinheben_einbeinig') return rumpfLiegend(art);
  if (['situp', 'vup', 'fahrrad', 'schultertippen', 'mountain', 'lsitz', 'negativ_crunch'].includes(art)) return rumpfNeu(art);
  if (['plank_knie', 'body_saw', 'rollout_stehend', 'reverse_crunch', 'knieheben_haengend', 'hollow_rock', 'bauchmaschine', 'rueckenstrecker_maschine'].includes(art)) return rumpfMehr(art);
  const band = art === 'pallof' && o.last === 'band';
  return {
    aufbau(ger) {
      const z = {};
      if (['plank', 'seitstuetz', 'deadbug', 'fersen_tippen', 'birddog', 'crunch', 'curlup', 'beinheben_liegend', 'hollow', 'russian', 'superman', 'rueckenstrecker_sanft', 'rollout'].includes(art)) ger.matte();
      if (art === 'beinheben_haengend') z.stange = ger.stange(HANG_Y, 1.2, 0);
      // Sanfte Rückenstreckung: flaches Kissen unter Bauch und Becken, zusammengelegtes Handtuch unter der Stirn (so steht es im Text)
      if (art === 'rueckenstrecker_sanft') { ger.box(0.46, 0.05, 0.44, V(0, 0.025, 0.24), ger.mAkzent); ger.box(0.24, 0.03, 0.2, V(0, 0.015, -0.47), ger.mAkzent); }
      if (band) { ger.box(0.08, 1.4, 0.08, V(-0.9, 0.7, 0.2), ger.mRahmen); z.seil = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.griff = ger.griff(); z.griff.visible = false; }
      else if (art === 'pallof') { r3_setze(z, r3_turm(ger, V(-0.9, 1.33, 0.2), V(-1, 0, 0), V(1, 0.45, 0.3), 'KABELZUG', 'RUMPF')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff(); }   // R3: DK-Kabelturm seitlich, Öse auf Brusthöhe
      // Kabelcrunch: kniend vor dem Turm (Blick zur oberen Rolle), Seilgriff mit Knoten vor dem Gesicht, je ein Ende neben dem Kopf
      else if (art === 'kabelcrunch') { r3_setze(z, r3_turm(ger, V(0, 2.0, KC_TURM_Z - 0.07), V(0, 0, 1), V(1, 0.45, 0.3), 'KABELZUG', 'BAUCH')); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.strang_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.strang_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mSeil); z.knoten = r3_knoten(ger); }   // R3: DK-Kabelturm vor der knienden Figur
      if (art === 'rollout' && o.last === 'langhantel') z.lh = ger.langhantel();
      else if (art === 'rollout') { z.rad = ger.zyl(0.1, 0.08, ger.mScheibe, 24); z.rad.rotation.z = Math.PI / 2; }
      if (art === 'rueckenstrecker') { const f = RS45_HUEFTE.clone().addScaledVector(RS45_BEIN, -BEIN * 0.998), bk = RS45_HUEFTE.clone().addScaledVector(RS45_BEIN, 0.02); hyperBauen(ger, f, bk, RS45_BEIN); }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'superman' || art === 'rueckenstrecker_sanft') {
        // Bauchlage: Die Brust hebt sich aus der Wirbelsäule (nur leicht, kein Hohlkreuz). Der Brustkorb steht weit vor der Wirbelsäule: er liegt auf, das Becken liegt tiefer (bzw. auf dem Kissen)
        const sanft = art === 'rueckenstrecker_sanft', r = { basis: BAUCHLAGE, neigung: sanft ? -2 : mix(-9.5, -12.5, t) }, w = { beuge: mix(0, sanft ? -10 : -14, t) };
        const becken = V(0, sanft ? 0.2 : 0.14, 0.25), k = rumpf(becken, r, w);
        if (sanft) {
          // Sanft: Arme lang neben dem Körper (gehen mit dem Brustkorb), Beine bleiben am Boden, Stirn liegt auf dem Handtuch, Kopf und Brust heben nur ein paar Zentimeter
          const hand = seitenBauch((s, sg) => k.schulter[s].clone().add(V(sg * 0.12, -0.17, 0.518)));
          const fuss = seitenBauch((s, sg) => V(sg * 0.1, 0.125, 0.27 + Math.sqrt((BEIN * 0.998) ** 2 - 0.1 * 0.1)));
          return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: mix(25, 14, t) }, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seitenBauch((s, sg) => V(sg, 1, 0)), fuss, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.45, 1)) } };
        }
        // Superman: Start flach, Arme und Beine liegen. Arme lang, Hände und Füße heben 10–13 cm, das Becken bleibt liegen, die Hüfte streckt
        const hand = seitenBauch((s, sg) => { const S = k.schulter[s], y = mix(0.07, 0.2, t), dy = y - S.y, dx = sg * 0.03; return S.clone().add(V(dx, dy, -Math.sqrt((ARM * 0.998) ** 2 - dx * dx - dy * dy))); });
        const fuss = seitenBauch((s, sg) => V(sg * 0.1, mix(0.11, 0.25, t), 0.27 + Math.sqrt((BEIN * 0.998) ** 2 - 0.1 * 0.1 - mix(0.02, 0.1, t) ** 2)));
        return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: 6 }, beinGerade: true, hand, greift: seiten(() => true), handflaeche: seiten(() => V(0, -1, 0)), ellbogenPol: seiten(() => V(0, 1, 0)), fuss, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.45, 1)) } };
      }
      if (art === 'plank' || art === 'seitstuetz' || art === 'hollow') {
        if (art === 'seitstuetz') {
          // Wie die Vorlage seitstuetz: Unterarm flach, Ellbogen unter der Schulter, Oberarm senkrecht, Beine gestreckt und übereinander, Körper als Linie (Bauch zeigt nach -x, Kopf nach -z, rechte Seite unten).
          // Hüftheben: Die Füße bleiben, das gestreckte Bein schwenkt um den Knöchel, das Becken sinkt 13 cm seitlich, die Wirbelsäule neigt sich zur Seite, die Schulter gibt 3 cm nach
          const bauch = V(-1, 0, 0), e0 = 18.3, drop = o.heben ? mix(0.13, 0, t) : 0.012 * (1 - atmen);
          const fussP = V(0, 0.108, 0.75), S0 = fussP.clone().add(V(0, Math.sin(e0 * RAD), -Math.cos(e0 * RAD)).multiplyScalar(BEIN * 0.998 + MASS.rumpf - 0.01));
          const eB = Math.asin(Math.sin(e0 * RAD) - drop / (BEIN * 0.998)) / RAD, H = fussP.clone().add(V(0, Math.sin(eB * RAD), -Math.cos(eB * RAD)).multiplyScalar(BEIN * 0.998));
          const eS = Math.atan2(S0.y - H.y, H.z - S0.z) / RAD, w = { seit: mix(0, 15, drop / 0.13) }, eP = eS - w.seit / 2;
          const obenP = V(0, Math.sin(eP * RAD), -Math.cos(eP * RAD)), r = { basis: basisAus(obenP, bauch), neigung: 0 }, RB = rumpfRahmen(r);
          // Das Becken kippt mit: Die Hüften rücken nicht gleich weit vom Fuß weg. Unten bleibt das Bein genau gestreckt, das obere Bein legt sich entsprechend an (Knie höchstens 7°)
          const obenFuss = V(0, Math.cos(e0 * RAD), Math.sin(e0 * RAD)).multiplyScalar(0.045), fussR = fussP.clone().sub(obenFuss), fussL = fussP.clone().add(obenFuss);
          const hr = fussR.clone().add(H.clone().addScaledVector(RB.links, -MASS.hueftBreite).sub(fussR).setLength(BEIN * 0.998)), becken = hr.addScaledVector(RB.links, MASS.hueftBreite).addScaledVector(obenP, 0.02);
          const hl = hueftGelenk(becken, RB, 'l'), k = rumpf(becken, r, w);
          // Der Ellbogen steht fest am Boden (auch wenn die Schulter ein paar Zentimeter wandert): der Pol zeigt genau auf ihn
          const k0 = rumpf(fussP.clone().add(V(0, Math.sin(e0 * RAD), -Math.cos(e0 * RAD)).multiplyScalar(BEIN * 0.998 + 0.02)), { basis: basisAus(V(0, Math.sin(e0 * RAD), -Math.cos(e0 * RAD)), bauch), neigung: 0 });
          const ellR = V(k0.schulter.r.x + 0.03, 0.06, k0.schulter.r.z - 0.01);
          return { pose: { becken, rumpf: r, wirbel: w, hand: { l: becken.clone().addScaledVector(RB.links, 0.16).addScaledVector(RB.vor, 0.05), r: V(k0.schulter.r.x - 0.24, 0.055, k0.schulter.r.z - 0.02) }, ellbogenPol: { l: V(0.45, 1, 0), r: ellR.sub(k.schulter.r) },
            fuss: { l: hl.clone().add(fussL.clone().sub(hl).setLength(BEIN * 0.998)), r: fussR }, kniePol: seiten(() => V(-1, 0, 0)), fussRicht: seiten(() => V(-1, 0, 0.2)) } };
        }
        if (art === 'hollow') {
          // Becken nach hinten gekippt, unterer Rücken flach am Boden, Schulterblätter frei: die Wirbelsäule rundet sich, Arme neben den Ohren und Beine lang, Fersen knapp über dem Boden. Halten: nur der Atem bewegt die Figur
          const form = hollowForm(atmen);
          return { pose: { becken: form.becken, rumpf: form.r, wirbel: form.w, kopf: { neigung: 6 }, hand: form.hand, ellbogenPol: seiten((s, sg) => V(sg, 0, 0)), fuss: form.fuss, kniePol: form.kpol, fussRicht: form.fr } };
        }
        // Unterarmstütz
        const richt = V(0, Math.sin(13 * RAD), -Math.cos(13 * RAD));
        const fussP = V(0, FY, 0.8);
        const becken = fussP.clone().add(richt.clone().multiplyScalar(BEIN + 0.03 + 0.015 * atmen));
        const basis = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), richt);
        const r = { basis: new THREE.Quaternion().setFromAxisAngle(richt, Math.PI).multiply(basis), neigung: 0 };
        const k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, beinGerade: true, hand: seitenBauch((s, sg) => V(sg * 0.1, 0.05, k.schulter[s].z - 0.3)), ellbogenPol: seitenBauch((s, sg) => V(sg * 0.2, -1, 0.2)), fuss: seitenBauch((s, sg) => fussP.clone().add(V(sg * (art === 'plank' ? 0.123 : 0.09), 0, 0))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -1, 0.3)) } };
      }
      if (art === 'fersen_tippen') {
        // Rückenlage, Arme lang neben dem Körper am Boden, Beine in der Luft (Hüfte und Knie 90°). Eine Ferse sinkt zum Boden: Die Bewegung läuft aus der Hüfte (90° auf 46°), das Knie bleibt gebeugt. Antippen, zurück, dann die andere
        const links = t < 0.5, u = links ? t * 2 : t * 2 - 1, w = glatt(Math.min(u, 1 - u) / 0.45);
        const r = { basis: LIEGEND, neigung: 0 }, becken = V(0, 0.12, 0.25), k = rumpf(becken, r), RB = rumpfRahmen(r);
        const hand = seiten((s, sg) => armNeben(k.schulter[s], sg));
        const bein = seiten((s) => { const unten = (s === 'l') === links ? w : 0; return beinAus(hueftGelenk(becken, RB, s), mix(90, 46, unten), mix(90, 99, unten), BEIN_AUS, BEIN_HOCH); });
        return { pose: { becken, rumpf: r, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)), fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(18)) } };
      }
      if (art === 'deadbug' || art === 'birddog') {
        // erste Hälfte linke Seite strecken und zurück, zweite Hälfte rechte; der Wechsel liegt dort, wo beide Seiten unten sind (sonst
        // springt der gestreckte Arm von einer Seite auf die andere); gestreckt kurz halten (Bird Dog länger: der Text verlangt das Halten)
        const links = t < 0.5, u = links ? t * 2 : t * 2 - 1;
        const w = glatt(Math.min(u, 1 - u) / (art === 'birddog' ? 0.3 : 0.4));
        if (art === 'deadbug') {
          const r = { basis: LIEGEND, neigung: 0 };
          const becken = V(0, 0.12, 0.25);
          const k = rumpf(becken, r), RB = rumpfRahmen(r);
          // Der Arm steht senkrecht und geht im Bogen über den Kopf, lang und mit Knick nur knapp über null
          const hand = seiten((s) => { const th = ((s === 'l') === links ? 78 * w : 0) * RAD; return k.schulter[s].clone().add(V(0, ARM * 0.998 * Math.cos(th), -ARM * 0.998 * Math.sin(th))); });
          const handflaeche = seiten((s, sg) => V(-sg, 0, 0));   // Handflächen zueinander
          // Das Gegenbein wird aus 90/90 lang: Hüfte und Knie öffnen zusammen, die Ferse endet knapp über dem Boden
          const bein = seiten((s) => { const lang = (s === 'r') === links ? w : 0; return beinAus(hueftGelenk(becken, RB, s), mix(90, 5, lang), mix(90, 7, lang), BEIN_AUS, BEIN_HOCH); });
          return { pose: { becken, rumpf: r, hand, handflaeche, ellbogenPol: seiten((s, sg) => V(sg, 0, 0)), fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(12)) } };
        }
        // Vierfüßlerstand: Hände unter den Schultern, Arme gestreckt. Der Arm ist länger als der Oberschenkel, der Rücken steigt darum leicht zum Kopf an (mit waagerechtem Rumpf knickten die Ellbogen 50°)
        const becken = V(0, 0.54, -0.3);
        const r = { basis: BAUCHLAGE, neigung: -8 };
        const k = rumpf(becken, r), RB = rumpfRahmen(r);
        const boden = (s) => V(k.schulter[s].x, 0.047, k.schulter[s].z);
        // Der Arm schwenkt lang um die Schulter nach vorn (auf gerader Linie vom Boden knickte der Ellbogen 115°), das Gegenbein öffnet Hüfte und Knie zusammen bis auf Rumpfhöhe, der Fuß bleibt locker
        const hand = seiten((s) => { if ((s === 'l') !== links || w < 1e-4) return boden(s); const th = 98 * w * RAD, S = k.schulter[s]; return S.clone().add(V(0, -Math.cos(th), -Math.sin(th)).multiplyScalar(boden(s).distanceTo(S))); });
        // Das Knie beugt zuerst noch etwas mehr: der Fuß hebt vom Boden ab, statt über die Matte zu schleifen, dann wird das Bein lang
        const bein = seiten((s) => { const lang = (s === 'r') === links ? w : 0; return beinAus(hueftGelenk(becken, RB, s), mix(87, 3, lang), mix(90, 7, glatt((lang - 0.15) / 0.85)) + 12 * Math.sin(Math.PI * Math.min(1, lang / 0.5)), BEIN_AUS, V(0, -1, 0)); });
        // Ellbogen-Pol nach hinten unten: steht quer zum Arm, ob er senkrecht stützt oder nach vorn gestreckt ist (mit Pol nach oben lagen
        // senkrechter Stützarm und Pol parallel → Ellbogen schlug beim Seitenwechsel um)
        const epol = seiten(() => V(0, -1, 1));
        return { pose: ohneSinken({ becken, rumpf: r, kopf: { neigung: -5 }, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: epol, fussBleibt: true, fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr((s === 'r') === links ? mix(66, 10, w) : 66)) }, w > 1e-4 ? (links ? 'l' : 'r') : null) };
      }
      if (art === 'crunch' || art === 'curlup' || art === 'russian') {
        // Der Rumpf rollt ein, statt im Hüftgelenk zu klappen (5.11.): Beim Crunch bleibt der untere Rücken auf der Matte, das Becken kippt leicht nach hinten, nur die Schulterblätter heben ab (rund 30°). Curl-up: nur Kopf und Schultern, 14°. Russian Twist: Becken bleibt, die Wirbelsäule dreht
        const r = { basis: LIEGEND, neigung: art === 'russian' ? 45 : art === 'crunch' ? mix(0, -6, t) : 0 };
        const w = art === 'russian' ? { dreh: mix(-32, 32, t) } : { beuge: art === 'curlup' ? mix(0, 14, t) : mix(0, 38, t) };
        const becken = V(0, art === 'russian' ? 0.155 : 0.12, art === 'curlup' ? 0.05 : 0.25);   // Russian Twist: sitzt auf dem Po, nicht darin. Curl-up: das lange Bein liegt noch auf der Matte
        const k = rumpf(becken, r, w);
        // Russian Twist: Hände vor dem Brustbein, Ellbogen tief neben dem Rumpf (Oberarm rund 50°, Ellbogen rund 90°), die Arme drehen nur mit dem Brustkorb
        const hand = art === 'russian' ? seiten((s, sg) => k.brust.clone().addScaledVector(k.R.vor, 0.4).addScaledVector(k.R.oben, -0.2).addScaledVector(k.R.links, sg * 0.04))
          : art === 'curlup' ? seiten((s, sg) => becken.clone().add(V(sg * 0.11, -0.06, -0.04)))   // Hände unter dem unteren Rücken
          : seiten((s, sg) => amKopf(k, sg));
        // Curl-up: das rechte Bein liegt lang am Boden, das linke ist gebeugt, der Fuß steht flach. Russian Twist: Fersen am Boden, Zehen oben. Crunch: Füße flach
        const RB = rumpfRahmen(r), lang = art === 'curlup' ? hueftGelenk(becken, RB, 'r').add(V(-0.02, -0.01, Math.sqrt((BEIN * 0.998) ** 2 - 0.02 * 0.02 - 0.01 * 0.01))) : null;
        const fuss = art === 'curlup' ? { l: V(0.15, FY, becken.z + 0.47), r: lang } : seiten((s, sg) => V(sg * 0.15, art === 'russian' ? 0.09 : FY, 0.7));
        return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: art === 'russian' ? 0 : mix(0, art === 'curlup' ? 4 : 12, t) }, hand, ellbogenPol: seiten((s, sg) => art === 'russian' ? k.R.oben.clone().multiplyScalar(-0.5).addScaledVector(k.R.links, sg * 0.85) : k.R.links.clone().multiplyScalar(sg)), fuss, kniePol: art === 'curlup' ? { l: V(0, 1, 0), r: V(-0.1, 1, 0) } : seiten(() => V(0, 1, 0)), fussRicht: art === 'curlup' ? { l: undefined, r: V(-0.1, 0.8, 0.5) } : art === 'russian' ? seiten((s, sg) => V(sg * 0.1, 0.45, 1)) : undefined } };
      }
      if (art === 'beinheben_haengend' || art === 'beinheben_liegend') {
        const haengend = art === 'beinheben_haengend';
        if (haengend) {
          // Beine gestreckt und geschlossen über die Waagerechte, erst am Ende rollt das Becken 22° nach hinten ein (die Brust bleibt, die Wirbelsäule gleicht aus). Das Becken wandert dafür etwas zurück, Arme bleiben lang
          const h = hangPose(mix(0, 22, glatt((t - 0.5) / 0.5)), mix(0, 7, glatt(t)));
          const bein = seiten((s) => beinAus(hueftGelenk(h.becken, h.RB, s), mix(2, 98, t), 7, V(0, -1, 0), V(0, 0, 1)));
          return { pose: { becken: h.becken, rumpf: h.r, wirbel: h.w, kopf: { neigung: -5 }, hand: h.hand, ellbogenPol: h.ellbogenPol, fuss: seiten((s, sg) => bein[s].fuss.clone().add(V(-sg * 0.02, 0, 0))), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(20)) } };
        }
        // Rückenlage: gestreckte Beine steigen bis fast senkrecht, die Hände liegen flach neben dem Körper, oben kippt das Becken wenig nach hinten (die Lende bleibt am Boden)
        const r = { basis: LIEGEND, neigung: mix(0, -6, t) }, ws = { beuge: mix(0, 6, t) };
        const becken = V(0, 0.12, 0.25);
        const k = rumpf(becken, r, ws), RB = rumpfRahmen(r);
        const bein = seiten((s) => beinAus(hueftGelenk(becken, RB, s), mix(4, 88, t), 7, BEIN_AUS, BEIN_HOCH));
        return { pose: { becken, rumpf: r, wirbel: ws, hand: seiten((s, sg) => armNeben(k.schulter[s], sg)), flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)), fuss: seiten((s, sg) => bein[s].fuss.clone().add(V(-sg * 0.02, 0, 0))), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(18)) } };
      }
      if (art === 'rollout') {
        // t = 0 gestreckt weit vorn, t = 1 zurück im Kniestand: Oberschenkel fast senkrecht, Schultern kurz vor der Stange, Hüfte und Oberarm je 45–60° (bis 5.11. endete der Rückweg halb)
        const winkel = mix(10, 88, t), rw = mix(12, 47, t) * RAD;
        const knieP = V(0, 0.065, -0.25);   // Kniemitte: Knie liegt auf der Matte und bleibt dort (Becken aus Oberschenkellänge und Hüftgelenk genau gerechnet)
        const richt = V(0, Math.sin(winkel * RAD), Math.cos(winkel * RAD)), obenR = V(0, Math.sin(rw), Math.cos(rw));
        const becken = knieP.clone().addScaledVector(richt, MASS.oberschenkel).addScaledVector(obenR, 0.02);
        const r = { basis: basisAus(obenR, V(0, -1, 0)), neigung: 0 };
        const k = rumpf(becken, r);
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5);
        // Rad: Griffe 0,1 m hoch; Langhantel: Stange liegt auf großen Scheiben (Radius 0,225 m)
        const lh = o.last === 'langhantel', griffY = lh ? 0.225 : 0.1;
        const radZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.995) ** 2 - (sm.y - griffY) ** 2));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand: seiten((s, sg) => V(sg * (lh ? 0.2 : 0.08), griffY, radZ)), griffRollt: true, greift: seiten(() => true), ellbogenPol: seiten(() => V(0, 1, 0)), fuss: seiten((s, sg) => V(sg * 0.1, 0.1, knieP.z - Math.sqrt(MASS.unterschenkel ** 2 - 0.035 ** 2))), kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) { const rollt = (g.hand.l.z + g.hand.r.z) / 2; if (z.lh) { z.lh.position.set(0, griffY, rollt); z.lh.quaternion.identity(); } else z.rad.position.set(0, 0.1, rollt); } };
      }
      if (art === 'pallof') {
        const becken = V(0, 0.965, 0); const r = { neigung: 0 }; const k = rumpf(becken, r);   // Knie 15° statt 26°
        const nah = k.brust.clone().add(V(0, -0.1, 0.2)), weit = k.brust.clone().add(V(0, -0.1, 0.642));   // Griff 20 cm vor der Brust: das Kabel streift sie nicht (1.11.). Vorn fast gestreckt: Ellbogen unter 10°
        const hand = seiten((s, sg) => mv(nah, weit, t).add(V(sg * 0.035, 0, 0)));
        return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, 0)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, stehFuesse(band ? 0.14 : 0.2)),   // Band: hüftbreit (bis 5.11. 0,89× Schulter)
          props(g, z) { const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5); z.griff.position.copy(m); z.griff.userData.frei = null; z.griff.quaternion.setFromUnitVectors(V(1, 0, 0), g.hand.l.clone().sub(g.hand.r).normalize()); const a = V(-0.9, 1.33, 0.2);   /* Rolle auf Brusthöhe, vor der Körperebene: das Kabel läuft waagerecht vor der Brust vorbei */ const d = m.clone().sub(a), l = d.length(); z.seil.position.copy(a).add(m).multiplyScalar(0.5); z.seil.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z.seil.scale.set(1, l, 1); if (z.dkTurm) z.dkTurm[0].zieh(l); } };
      }
      if (art === 'kabelcrunch') {
        // Wie im Lehrbuch (Strengthlog, ExRx): kniend mit Blick zum Kabelturm, Seilenden neben dem Kopf, die Hüfte bleibt stehen, der Rumpf rollt ein,
        // bis die Ellbogen zu den Oberschenkeln kommen. Bis 31.10. stand der Turm hinter der Figur und das Kabel lief 5 cm durch Nacken und Kopf
        const becken = V(0, 0.5, 0.0);
        const r = { neigung: mix(20, 24, t) }, w = { beuge: mix(5, 50, t) };
        const k = rumpf(becken, r, w);
        const hand = seiten((s, sg) => k.brust.clone().addScaledVector(k.R.oben, 0.14).addScaledVector(k.R.links, sg * 0.12).addScaledVector(k.R.vor, 0.14));
        return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: 20 }, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.3, -1, 1)), fuss: seiten((s, sg) => V(sg * 0.15, 0.1, -0.42)), kniePol: seiten(() => V(0, -1, 0.4)), fussRicht: seiten(() => V(0, -0.3, -1)) },
          props(g, z) {
            const m = g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), a = V(0, 2.0, KC_TURM_Z - 0.07);
            const knoten = m.clone().add(a.clone().sub(m).normalize().multiplyScalar(0.6));   // Knoten vor dem Gesicht, nicht im Kopf (R3: 60 cm vor den Händen, die Seilenden laufen außen am Kopf vorbei: so bleibt der Saunahut sichtbar)
            seil(z.seil, a, knoten); for (const [sd, sg] of [['l', 1], ['r', -1]]) bandKette(z, 'strang_' + sd, [knoten, g.hand[sd].clone().addScaledVector(g.R.links, sg * 0.10).addScaledVector(g.R.vor, 0.08), g.hand[sd]]); z.knoten.position.copy(knoten); z.dkTurm[0].zieh(a.distanceTo(knoten));
          } };
      }
      if (art === 'rueckenstrecker') {
        // Bein gestreckt in der Flucht der Bank, das Hüftgelenk ist der Drehpunkt. Oben Körper als gerade Linie (Rumpf 45°), unten Hüfte 80° gebeugt, der Rücken bleibt neutral
        const r = { neigung: mix(125, 45.5, t) }, R = rumpfRahmen(r);
        const becken = RS45_HUEFTE.clone().addScaledVector(R.oben, 0.02);
        const k = rumpf(becken, r);
        const fuss = seiten((s, sg) => RS45_HUEFTE.clone().addScaledVector(RS45_BEIN, -BEIN * 0.998).add(V(sg * 0.09, 0, 0)));
        return { pose: { becken, rumpf: r, kopf: { neigung: -8 }, hand: seiten((s, sg) => gekreuzt(k, sg)), handflaeche: seiten(() => k.R.vor.clone().negate()), ellbogenPol: seiten((s, sg) => gekreuztPol(k, sg, 1.1)), fuss, kniePol: seiten(() => V(0, -1, 1)),
          fussRicht: seiten(() => V(0, -1, 1)), fussFlaeche: seiten(() => RS45_BEIN.clone()) } };
      }
      return rumpfuebung({ art: 'plank' }).pose(t);
    },
    blick: V(0, 0.45, 0.1), abstand: 3.5, kameraRicht: V(1, 0.45, 0.3), dauer: art === 'superman' ? [1.2, 1, 1.4, 0.4] : art === 'rueckenstrecker_sanft' ? [1.2, 3, 1.6, 0.6] : art === 'curlup' ? [1.2, 2, 1.4, 0.5] : art === 'seitstuetz' && o.heben ? undefined : ['plank', 'seitstuetz', 'hollow'].includes(art) ? [1.5, 0.2, 1.5, 0.2] : art === 'birddog' ? [12, 0, 0, 0] : art === 'deadbug' || art === 'fersen_tippen' ? [10, 0, 0, 0] : undefined,
    // Einmal durch: linke Seite, rechte Seite. Tempo also gleichmäßig, Anstrengung und Atem aus dem Strecken
    gleichmaessig: art === 'deadbug' || art === 'birddog' || art === 'fersen_tippen', belastung: art === 'deadbug' || art === 'birddog' || art === 'fersen_tippen' ? (t) => glatt(Math.min((t < 0.5 ? t * 2 : t * 2 - 1), 1 - (t < 0.5 ? t * 2 : t * 2 - 1)) / (art === 'birddog' ? 0.3 : 0.4)) : undefined
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
      if (art === 'frontal' || art === 'seitbeugen') { z.kh_l = art === 'frontal' ? kopfRund(ger.kurzhantel()) : ger.kurzhantel(); return z; }
      if (o.last === 'langhantel' || o.last === 'multipresse') z.lh = ger.langhantel();
      else if (o.last === 'kabel') { r3_setze(z, r3_turm(ger, V(0, 0.15, 0.55), V(0, 0, 1), V(1, 0.3, 0.6), 'KABELZUG', 'NACKEN')); z.griff = ger.griff(0.6); z.seil = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); }   // R3: DK-Kabelturm vor der Figur   // Kabelstange, lang genug für den schulterbreiten Griff (bis 5.11. endete der Griff vor den Händen)
      else khAufbauen(ger, z, art !== 'suitcase');
      if (o.last === 'multipresse') schienenAufbauen(ger, z);
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t, z) {
      if (art === 'schulterheben') {
        const becken = V(0, 0.975, 0); const r = { neigung: 4 }; const k = rumpf(becken, r);
        const hub = mix(0, 0.09, t);   // 9 cm, der Kopf bleibt stehen: die Schultern kommen den Ohren sichtbar näher (bis 5.11. 6 cm und der Kopf ging mit)
        const vorn = o.last === 'kabel' || o.last === 'multipresse' || o.last === 'langhantel';
        // Arme bleiben gestreckt, nur die Schultern gehen hoch (schulterHub)
        // Kurzhanteln im Neutralgriff außen neben den Beinen, Stange vor den Oberschenkeln
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * (vorn ? 0.06 : 0.1), -Math.sqrt((ARM * 0.999) ** 2 - (vorn ? 0.13 : 0.03) ** 2) + hub, vorn ? 0.13 : 0.03)));
        const pose = Object.assign({ becken, rumpf: r, hand, schulterHub: hub, kopfBleibt: true, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)) }, stehFuesse(0.13));
        if (vorn) vorDenBeinen(pose, 0.018);
        return { pose,
          props(g, z) {
            if (z.griff) { const a = V(0, 0.15, 0.55); kabelstangeAn(z.griff, g, a); seil(z.seil, a, z.griff.position.clone().add(a.clone().sub(z.griff.position).normalize().multiplyScalar(0.03))); z.dkTurm[0].zieh(a.distanceTo(z.griff.position) - 0.03); }
            else if (z.lh) { stangeAn(z.lh, g); schienenAn(z); } else kurzhantelnAn(z, g, 'hammer');
          } };
      }
      if (art === 'seitbeugen') {
        const becken = V(0, 0.975, 0), r = { neigung: 0 }, ws = { beuge: 2, seit: mix(-26, 8, t) };   // Hantel rechts: Seite wird gedehnt und zieht zurück. Das Becken bleibt gerade
        const k = rumpf(becken, r, ws);
        const hand = { r: k.schulter.r.clone().add(V(-0.06, -ARM * 0.9995, 0)),   // Arm hängt leicht abgespreizt: Hantel neben dem Oberschenkel (1.11.: Beine kräftiger, vorher senkrecht unter der Schulter)
          l: becken.clone().add(V(0.17, 0.05, 0.06)) };   // freie Hand bleibt an der Hüfte, die steht still (bis 5.11. rechnete sie vom Brustkorb aus und rutschte mit)
        return { pose: Object.assign({ becken, rumpf: r, wirbel: ws, hand, ellbogenPol: { r: V(-0.3, 0, -1), l: V(1, 0, -0.5) } }, stehFuesse(0.15)),
          props(g, z) { khHalten(z, g, 'r', z.kh_l, 'neutral'); } };
      }
      // Gehen auf der Stelle: t läuft gleichmäßig. Der Standfuß steht fest (bis 31.10. rutschte er bei jedem Schritt 20 cm nach hinten
      // wie beim Moonwalk), das Schwungbein hebt Knie und Fuß und setzt ihn an derselben Stelle wieder auf
      const p = t * Math.PI * 2;
      const becken = V(-0.085 * Math.sin(p), 0.965 + 0.015 * Math.abs(Math.sin(p)), 0);   // Becken über den Standfuß (sonst kippte die Figur)
      const r = { neigung: 2, seit: art === 'suitcase' ? 0 : 0 };
      const k = rumpf(becken, r);
      const fuss = seiten((s, sg) => { const ph = p + (s === 'l' ? 0 : Math.PI), heb = Math.max(0, Math.sin(ph)); return V(sg * 0.11, FY + heb * 0.11, 0.05 * heb); });
      const oben = (s, sg) => k.schulter[s].clone().add(V(-sg * 0.01, ARM * 0.998, 0.01));   // Arm ganz gestreckt, Hand senkrecht über der Schulter (bis 5.11. 0,96: 27° gebeugt)
      const gr = art === 'frontal' ? kelchGriff(k.brust.clone().addScaledVector(k.R.vor, GOBLET.vor + 0.012).addScaledVector(k.R.oben, GOBLET.hoch).add(V(0, -0.128, 0)), V(0, 1, 0), k.R.vor) : null;
      const hand = seiten((s, sg) => art === 'suitcase' && s === 'l' ? k.schulter[s].clone().add(V(0.05, -ARM * 0.994, 0.012))   // freier Arm hängt locker (bis 5.11. abgespreizt, im Text ein Fehler)
        : art === 'ueberkopf' || (art === 'kellner' && s === 'l') ? oben(s, sg)
        : gr ? gr.hand[s]
        : k.schulter[s].clone().add(V(sg * 0.085, -ARM * 0.9995, 0)));   // Hanteln 8,5 cm außen: kräftige Beine schwingen beim Gehen nicht hinein (1.11.)
      const epol = seiten((s, sg) => art === 'ueberkopf' || (art === 'kellner' && s === 'l') ? V(sg, 0, 0) : art === 'frontal' ? V(sg * GOBLET.polAussen, -1, GOBLET.polVor) : V(sg * 0.3, 0, -1));
      return { pose: { becken, rumpf: r, hand, kelch: gr && gr.kelch, ellbogenPol: epol, handflaeche: art === 'ueberkopf' || art === 'kellner' ? seiten((s, sg) => V(-sg, 0, 0)) : undefined, fuss, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) {
          if (z.kb) { kettlebellAn(z.kb, g, 'l'); return; }
          if (art === 'frontal') { kelchAn(z.kh_l, g, V(0, 1, 0)); return; } if (z.lh) stangeAn(z.lh, g); else { if (z.kh_l && art === 'suitcase') khHalten(z, g, 'r', z.kh_l, 'neutral'); else kurzhantelnAn(z, g, 'hammer'); } } };
    },
    blick: V(0, 0.85, 0), abstand: 3.4, dauer: art === 'schulterheben' || art === 'seitbeugen' ? undefined : [1.2, 0, 0, 0]
  };
}

// Abstand Schulter → Faust bei Ellbogenbeugung e (Grad): Bleibt die Hand in diesem Abstand, läuft sie auf dem Kreisbogen um die Schulter und der Ellbogenwinkel steht fest (Fliegende, Überzug)
const armLang = (e) => Math.sqrt(MASS.oberarm ** 2 + UNTERARM ** 2 + 2 * MASS.oberarm * UNTERARM * Math.cos(e * RAD));
// Richtung von der Schulter aus: phi 0 zur Seite, 90 nach vorn, darüber über die Mitte; eps über der Waagerechten (Grad)
const flyRichtung = (sg, phi, eps) => V(sg * Math.cos(phi * RAD) * Math.cos(eps * RAD), Math.sin(eps * RAD), Math.sin(phi * RAD) * Math.cos(eps * RAD));
// Fliegende: Rollen, Rumpf und Bogen je Art. von/bisEps: Start- und Endhöhe der Hand, e: Ellbogen. Die Hände treffen sich vor dem Körper
const FLY = {
  crossover: { neigung: 8, beckenZ: -0.02, e: 20, von: [12, -3], bisEps: -12, anker: V(0.85, 1.45, -0.42) },   // Rollen auf Schulterhöhe, Hände treffen sich auf Brusthöhe
  band: { neigung: 6, beckenZ: -0.01, e: 20, von: [12, -8], bisEps: -10, anker: V(0.93, 1.42, -0.42) },   // Pfosten etwas weiter außen: Beim Hinlaufen schwingt der Arm nicht hinein (bis 5.11. 0,85)
  kabelfly_hoch: { neigung: 17, beckenZ: -0.04, e: 20, von: [12, 18], bisEps: -41, zu: 0.08, anker: V(0.85, 1.95, -0.42) },   // Rollen oben, nach unten-vorn bis zum Bauchnabel
  kabelfly_tief: { neigung: 12, beckenZ: -0.03, e: 25, von: [15, -38], bisEps: 14, anker: V(0.85, 0.2, -0.42) }   // Rollen unten, nach oben bis Kinnhöhe
};
// Griff zum Festhalten an einer Turmsäule: senkrechtes Rohr auf zwei Stegen, P = Mitte des Griffs, turm = Säule
function haltegriff(ger, P, turm) {
  const A = P.clone().add(V(0, -0.13, 0)), B = P.clone().add(V(0, 0.13, 0));
  griffRohr(ger, A, B);
  for (const Q of [A, B]) ger.vierkant(Q, V(turm.x, Q.y, turm.z), 0.028);
}
// Stuhl neben der Figur: Die Rückenlehne steht zu ihr hin, oben liegt das Rohr, das die Hand hält (Beinheben im Stand)
function stuhlKabel(ger, x, zMitte) {
  const h = 0.46, b = 0.2, d = 0.4;
  ger.polster(d, 0.05, 2 * b, V(x + d / 2, h, zMitte));
  for (const sz of [-1, 1]) {
    ger.vierkant(V(x + 0.02, 0.02, zMitte + sz * b), V(x + 0.02, 0.9, zMitte + sz * b), 0.04);
    ger.vierkant(V(x + d - 0.02, 0.02, zMitte + sz * b), V(x + d - 0.02, h, zMitte + sz * b), 0.04);
  }
  griffRohr(ger, V(x + 0.02, 0.92, zMitte - b - 0.01), V(x + 0.02, 0.92, zMitte + b + 0.01), ger.gruppe, 0.8);
  ger.vierkant(V(x + 0.02, 0.72, zMitte - b), V(x + 0.02, 0.72, zMitte + b), 0.03);
}
// Kabel/Band-Übungen im Stehen: art: facepull | crossover (Rollen auf Schulterhöhe) | kabelfly_hoch (Rollen oben) | kabelfly_tief (Rollen unten) | kickback_bein | abduktion_bein | adduktion_bein | woodchop | holzhacker_quer | ueberzug ; last: kabel | band | stuhl (ohne Gerät, Hand auf der Stuhllehne)
// Neu: kickback_bein + last maschine (Brustpolster, Hebel hinter der Ferse)
export function kabelstand(o = {}) {
  const art = o.art || 'facepull', last = o.last || 'kabel';
  const kbMaschine = art === 'kickback_bein' && last === 'maschine';
  // Fliegende mit Band: Band kommt von zwei Pfosten hinter dem Körper auf Brusthöhe
  const bandFly = art === 'crossover' && last === 'band', flyArt = FLY[bandFly ? 'band' : art] || null, bein = ['kickback_bein', 'abduktion_bein', 'adduktion_bein'].includes(art);
  const anker = flyArt ? flyArt.anker : { facepull: V(0, 1.58, 1.1), kickback_bein: V(0, 0.15, 0.7), abduktion_bein: V(0.75, 0.15, 0.4), adduktion_bein: V(-0.7, 0.15, 0.25), woodchop: V(0.8, 1.9, 0.2), holzhacker_quer: V(0.85, 1.33, 0.6), ueberzug: last === 'band' ? V(0, 2.1, 1.1) : V(0, 1.95, 1.2) }[art];
  const griffTurm = art === 'abduktion_bein' ? V(0.653, 1.2, 0.348) : art === 'adduktion_bein' ? V(-0.597, 1.2, 0.213) : null;
  // R3: Kamerarichtung vorab (der Stapel des DK-Kabelturms steht zur Kamera hin offen) und Muskelgruppe auf dem Typenschild
  const kamR = (art === 'abduktion_bein' && last === 'kabel') || art === 'holzhacker_quer' ? V(-0.55, 0.3, 1) : flyArt ? V(0.45, 0.25, 1) : art === 'kickback_bein' && last === 'kabel' ? V(1, 0.3, 0.2) : art === 'facepull' || art === 'ueberzug' ? V(1, 0.3, 0.35) : V(0.9, 0.3, 0.7);
  const turmGruppe = { facepull: 'SCHULTERN', kickback_bein: 'GESÄSS', abduktion_bein: 'HÜFTE', adduktion_bein: 'HÜFTE', woodchop: 'RUMPF', holzhacker_quer: 'RUMPF', ueberzug: 'RÜCKEN' }[art] || 'BRUST';
  return {
    aufbau(ger) {
      const z = {};
      if (kbMaschine) { const becken = V(0, 0.975, -0.08); kickbackMaschineBauen(ger, z, becken, { neigung: 55 }, becken.clone().add(V(-0.095, -0.02, 0)), BEIN * 0.965); return z; }
      if (last === 'stuhl') { stuhlKabel(ger, 0.5, 0); return z; }
      if (last === 'kabel') { if (flyArt) { z.dkTurm = [kabelturmDK(ger, 1, anker), kabelturmDK(ger, -1, anker)]; z.stapel_l = z.dkTurm[0].block; z.stapel_r = z.dkTurm[1].block; } else r3_setze(z, r3_turm(ger, anker, anker.x === 0 ? V(0, 0, anker.z > 0 ? 1 : -1) : V(anker.x, 0, anker.z), kamR, 'KABELZUG', turmGruppe, art === 'ueberzug' ? { hMax: 0.65 } : {})); }   // Fliegende: DK-Kabelturm mit Stapel und Seil; R3: alle übrigen Kabelzüge ebenso (Stapel hinter der Öse, vom Trainierenden weg)
      if (bandFly) for (const sx of [-1, 1]) { ger.box(0.07, 1.5, 0.07, V(sx * anker.x, 0.75, anker.z - 0.04), ger.mRahmen); ger.box(0.3, 0.03, 0.3, V(sx * anker.x, 0.015, anker.z - 0.04), ger.mRahmen); }   // zwei Pfosten hinter der Figur: das Band läuft außen an Arm und Brust vorbei
      else if (last === 'band') bandPfosten(ger, anker);
      if (griffTurm && last === 'kabel') { griffRohr(ger, griffTurm.clone().add(V(0, -0.13, 0)), griffTurm.clone().add(V(0, 0.13, 0))); for (const dy of [-0.13, 0.13]) r3_halter(ger, z.dkTurm[0], griffTurm.clone().add(V(0, dy, 0))); }   // R3: Haltegriff mit Haltern an der Flanke der Säule (das Seil an der Öse bleibt frei)
      if (art === 'kickback_bein') { if (z.dkTurm) { griffRohr(ger, V(-0.26, 1.22, 0.6), V(0.26, 1.22, 0.6), ger.gruppe, 0.8); for (const sx of [-1, 1]) { ger.vierkant(V(sx * 0.26, 0.05, 0.6), V(sx * 0.26, 1.22, 0.6), 0.04); ger.vierkant(V(sx * 0.26, 0.03, 0.6), z.dkTurm[0].an(0.17, 0.03).setX(sx * 0.1), 0.05); } } else { griffRohr(ger, V(-0.22, 1.22, 0.6), V(0.22, 1.22, 0.6), ger.gruppe, 0.8); ger.vierkant(V(0, 1.22, 0.6), V(0, 1.22, 0.66), 0.03); } }   // R3: Haltestange auf zwei Füßen vor dem Turm (das Seil läuft in der Mitte an der Stange vorbei, die Hände halten sie mit Abstand zu den Füßen)   // Haltestange am Turm: abstützen
      const dicke = last === 'band' ? 0.012 : flyArt ? 0.006 : 0.004, m = last === 'band' ? ger.mBand : ger.mKabel;   // R3: Seil am DK-Turm 8 mm
      z.seil_l = ger.stab(V(), V(0, 1, 0), dicke, m);
      if (flyArt || (art === 'ueberzug' && last === 'band')) { z.seil_r = ger.stab(V(), V(0, 1, 0), dicke, m); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }
      if (art === 'ueberzug' && last === 'kabel') z.griff = ger.griff(0.5);
      if (art === 'woodchop' || art === 'holzhacker_quer') z.griff = ger.griff(0.22);   // kurze Stange für beide Hände, Kabel am Ring
      if (art === 'facepull') { const dS = last === 'band' ? 0.012 : 0.014, mS = last === 'band' ? ger.mBand : ger.mSeil; z.strang_l = ger.stab(V(), V(0, 1, 0), dS, mS); z.strang_r = ger.stab(V(), V(0, 1, 0), dS, mS); if (last === 'kabel') z.knoten = r3_knoten(ger); }
      if (last === 'kabel' && bein) z.knoten = r3_knoten(ger);   // R3: Karabiner an der Manschette: das Kabel endet an einem Teil, nicht in der Luft
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      let becken = V(0, 0.975, 0), r = { neigung: 4 }, ws = null, hand = {}, epol = {}, flaeche, fuss, kpol, fussRicht, fussFlaeche, fuesse = null, kopf, vorBeine = false;
      if (art === 'facepull') {
        // Start: einen Schritt von der Rolle weg, Arme in Linie zu ihr, das Seil kommt fast waagerecht (bis 5.11. Hände unter der Rolle, Kabel steil nach oben). Ende: Ellbogen hoch und außen, Hände neben dem Kopf, Daumen zeigen nach hinten
        r = { neigung: 2 };
        const k = rumpf(becken, r);
        for (const [s, sg] of [['l', 1], ['r', -1]]) {
          const weit = k.schulter[s].clone().add(V(sg * 0.08, anker.y, anker.z).sub(k.schulter[s]).normalize().multiplyScalar(ARM * 0.995));
          const nah = k.schulter[s].clone().add(V(sg * 0.22, 0.2, 0.08));
          hand[s] = mv(weit, nah, t); epol[s] = V(sg, 0.4, -0.2);
        }
      } else if (art === 'ueberzug') {
        // Arme fast gestreckt, die Hände auf dem Bogen um die Schulter: Start hoch vorn in Linie zur Rolle (Dehnung unter der Achsel), Ende an den Oberschenkeln (bis 5.11. Ellbogen 17–94°, es wurde Rudern)
        const kabel = last === 'kabel', L = armLang(15);
        r = { neigung: kabel ? 22 : 10 }; becken = V(0, 0.97, kabel ? -0.05 : -0.02);
        const k = rumpf(becken, r), a = mix(kabel ? 118 : 125, kabel ? -2 : 7, t) * RAD;
        for (const [s, sg] of [['l', 1], ['r', -1]]) { hand[s] = genau(k.schulter[s].clone().add(V(0, -Math.cos(a), Math.sin(a)).multiplyScalar(L))); epol[s] = V(sg, -0.1, 0); }
        vorBeine = kabel;
      } else if (flyArt) {
        // Hand auf dem Kreisbogen um die Schulter, Ellbogenwinkel fest (bis 5.11. gerade Linie von offen nach zu: mitten im Weg 95–104° gebeugt, es wurde Drücken). Der Ellbogen läuft der Hand nach, die Handfläche zeigt in die Zugrichtung
        const c = flyArt, L = armLang(c.e);
        r = { neigung: c.neigung }; becken = V(0, 0.95, c.beckenZ);
        const k = rumpf(becken, r);
        flaeche = {};
        for (const [s, sg] of [['l', 1], ['r', -1]]) {
          const v0 = flyRichtung(sg, c.von[0], c.von[1]), v1 = flyRichtung(sg, 90 + Math.asin((MASS.schulterBreite - (c.zu || 0.055)) / (L * Math.cos(c.bisEps * RAD))) / RAD, c.bisEps);
          const w = Math.acos(Math.max(-1, Math.min(1, v0.dot(v1)))), d = v0.clone().multiplyScalar(Math.sin((1 - t) * w)).addScaledVector(v1, Math.sin(t * w)).divideScalar(Math.sin(w));
          const T = v0.clone().cross(v1).normalize().cross(d).normalize();   // Bewegungsrichtung
          hand[s] = genau(k.schulter[s].clone().addScaledVector(d, L));
          epol[s] = T.clone().negate().add(V(0, 0.12, 0));
          flaeche[s] = T;
        }
        fuesse = { fuss: { l: V(0.13, FY, 0.2), r: V(-0.13, FY, -0.2) }, zehen: { l: 0, r: 15 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) };   // Schrittstellung gegen den Zug nach hinten
      } else if (art === 'woodchop' || art === 'holzhacker_quer') {
        // Die Drehung kommt aus der Hüfte (Becken ±18°) und dem Brustkorb (Wirbelsäule ±22°), der Lendenbereich bleibt ruhig; Arme lang vor dem Brustbein, das Dreieck dreht mit, das Kabel läuft waagerecht
        // (bis 5.11. drehte der ganze Rumpf als Block 75° aus den Füßen, die Hände lagen tief vor dem Bauch)
        r = { neigung: 4, drehung: mix(18, -18, t) }; ws = { dreh: mix(22, -22, t) };
        const k2 = rumpf(becken, r, ws), mitte = k2.schulter.l.clone().add(k2.schulter.r).multiplyScalar(0.5), halb = 0.05;
        let p;
        if (art === 'woodchop') { const p0 = mv(V(0.55, 1.55, 0.25), V(-0.35, 0.65, 0.35), t); p = mitte.clone().add(p0.sub(mitte).normalize().multiplyScalar(Math.sqrt((ARM * 0.96) ** 2 - MASS.schulterBreite ** 2))); }
        else p = mitte.clone().addScaledVector(k2.R.vor, Math.sqrt((ARM * 0.99) ** 2 - (MASS.schulterBreite - halb) ** 2 - 0.065 ** 2)).addScaledVector(k2.R.oben, -0.065);
        hand = seiten((s, sg) => p.clone().addScaledVector(k2.R.links, sg * halb)); epol = seiten((s, sg) => k2.R.links.clone().multiplyScalar(sg).add(V(0, -1, 0)));
        // Der hintere Fuß dreht über den Ballen mit und hebt die Ferse, der Ballen bleibt stehen
        fuss = {}; fussRicht = {}; kpol = {}; const zehen = {};
        for (const [s, sg] of [['l', 1], ['r', -1]]) {
          const v = s === 'l' ? glatt((t - 0.5) / 0.5) : glatt((0.5 - t) / 0.5), g0 = sg * 16.7 * RAD, g1 = g0 - sg * 35 * v * RAD, heb = 20 * v;
          const fr0 = V(Math.sin(g0), 0, Math.cos(g0)), fr1 = V(Math.sin(g1), 0, Math.cos(g1)), ball = V(sg * 0.16, 0, 0).addScaledVector(fr0, MASS.fussLaenge * BALLEN);
          fuss[s] = ball.addScaledVector(fr1, -MASS.fussLaenge * BALLEN * Math.cos(heb * RAD)).setY(FY + Math.sin(heb * RAD) * MASS.fussLaenge * BALLEN);
          fussRicht[s] = fr1; zehen[s] = heb; kpol[s] = V(Math.sin(r.drehung * RAD * 0.8) + sg * 0.1, 0, 1);
        }
        fuesse = { fuss, fussRicht, kniePol: kpol, zehen };
      } else if (kbMaschine) {
        // Oberkörper liegt schräg auf dem Polster, Hände am Griff, rechtes Bein drückt nach hinten-oben, bis der Oberschenkel in der Rumpflinie liegt (bis 5.11. blieb er 35° davor); Kopf in Verlängerung des Rumpfs, Blick schräg nach unten
        becken = V(0, 0.975, -0.08); r = { neigung: 55 }; kopf = { neigung: -22 };
        hand = seiten((s, sg) => V(sg * 0.2, 1.0, 0.53)); epol = seiten((s, sg) => V(sg, -0.5, 0));
        const w2 = mix(-5, 76, t) * RAD, huefteR = becken.clone().add(V(-0.095, -0.02, 0));
        const d = V(0, -Math.cos(w2), -Math.sin(w2));
        fuss = { l: V(0.11, FY + 0.02, 0.0), r: huefteR.clone().add(d.clone().multiplyScalar(BEIN * 0.965)) };
        // Fußsohle liegt flach auf der Platte des Hebels (senkrecht zum Bein), Zehen nach vorn
        kpol = seiten((s, sg) => V(sg * 0.1, 0, 1)); fussRicht = { l: V(0.15, 0, 1), r: V(0, d.z, -d.y) }; fussFlaeche = { r: d.clone().negate() };
      } else {
        // Bein-Übungen: rechtes Bein arbeitet, gestreckt (bis 5.11. Bein 3 % zu kurz: Knie 28–45°), das Becken verlagert sich über den linken Standfuß, eine Hand hält sich fest, die andere liegt an der Hüfte (bis 5.11. schwebten beide Arme)
        const kick = art === 'kickback_bein', abd = art === 'abduktion_bein';
        r = { neigung: kick ? 20 : 2 };
        becken = kick ? V(0, 0.975, -0.02) : abd ? V(mix(0.03, 0.105, t), 0.975, 0) : V(mix(0.05, 0.075, t), 0.975, 0);
        const R = rumpfRahmen(r), huefteR = becken.clone().addScaledVector(R.links, -0.095).addScaledVector(R.oben, -0.02);
        const w = (kick ? mix(2, 34, t) : abd ? mix(0, 36, t) : mix(-24, 17, t)) * RAD;
        const richt = kick ? V(0, -Math.cos(w), -Math.sin(w)) : abd ? V(-Math.sin(w), -Math.cos(w), last === 'kabel' ? 0.055 : 0.01) : V(Math.sin(w), -Math.cos(w), mix(0.02, 0.2, glatt(t))).normalize();   // Adduktion: zieht vor dem Standbein vorbei
        const L = BEIN * (art === 'adduktion_bein' ? 0.995 - 0.012 * Math.sin(Math.PI * t) : 0.998);   // Adduktion: in der Mitte des Wegs etwas kürzer, die Zehen schleifen sonst über den Boden
        fuss = { l: V(kick ? 0.09 : abd ? 0.12 : 0.11, FY, kick ? -0.03 : abd && last === 'kabel' ? -0.05 : art === 'adduktion_bein' ? -0.03 : 0), r: huefteR.clone().add(richt.normalize().multiplyScalar(L)) };
        kpol = seiten((s, sg) => V(sg * 0.1, 0, 1)); fussRicht = { l: V(0.15, 0, 1), r: V(-0.05, art === 'adduktion_bein' ? 0 : -0.15, 1) };
        const anHuefte = (s, sg) => becken.clone().add(V(sg * 0.17, 0.05, 0.06));
        if (kick) { hand = seiten((s, sg) => V(sg * 0.16, 1.22, 0.6)); epol = seiten((s, sg) => V(sg, -0.6, -0.2)); }
        else if (abd) { hand = { l: last === 'stuhl' ? V(0.52, 0.92, 0.02) : griffTurm.clone(), r: anHuefte('r', -1) }; epol = { l: V(1, -0.3, -0.5), r: V(-1, 0, -0.5) }; }
        else { hand = { r: griffTurm.clone(), l: anHuefte('l', 1) }; epol = { r: V(-1, -0.3, -0.5), l: V(1, 0, -0.5) }; }
      }
      const pose = Object.assign({ becken, rumpf: r, wirbel: ws, hand, handflaeche: flaeche, griffAchse: griffTurm && last === 'kabel' ? { [art === 'abduktion_bein' ? 'l' : 'r']: { daumen: V(0, 1, 0) } } : undefined, ellbogenPol: epol, kopf }, fuesse || (fuss ? { fuss, kniePol: kpol, fussRicht, fussFlaeche } : stehFuesse(0.16, art === 'facepull' ? -0.05 : 0)));
      if (vorBeine) vorDenBeinen(pose, 0.018);   // Stange vor den Oberschenkeln
      return {
        pose,
        props(g, z) {
          if (z.hebel) {   // Hebel dreht mit dem Bein um die Hüftachse
            const d = g.knoechel.r.clone().sub(g.huefte.r); d.x = 0; d.normalize();
            z.hebel.quaternion.setFromUnitVectors(V(0, -1, 0), d); z.dkSeil.stelle([Math.atan2(d.y, d.z)]); return;
          }
          if (last === 'stuhl') return;
          const ankerR = V(-anker.x, anker.y, anker.z);
          if (z.griff_l) for (const s of ['l', 'r']) z['griff_' + s].position.copy(g.hand[s]);
          let ziele = z.seil_r ? [['seil_l', g.hand.l, flyArt ? anker : V(0.04, anker.y, anker.z)], ['seil_r', g.hand.r, flyArt ? ankerR : V(-0.04, anker.y, anker.z)]] :
            bein ? [['seil_l', art === 'kickback_bein' ? g.knoechel.r.clone().add(V(0, 0.035, 0.075)) /* Öse vorn an der Manschette: Kabel läuft über dem Fußrücken, nicht hindurch (bis 31.10. 3 cm) */ : g.knoechel.r.clone().addScaledVector(anker.clone().sub(g.knoechel.r).normalize(), 0.055), anker]]   // Kabel an der Manschette, auf der Seite zum Turm
              : [['seil_l', g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5), anker]];
          if (z.griff) {   // Kabelstange: Kabel endet am Ring
            const mitte = kabelstangeAn(z.griff, g, anker);
            ziele = [['seil_l', V(0, 0.03, 0).applyQuaternion(z.griff.quaternion).add(mitte), anker]];   // R3: Kabel endet am Drehring der Stange (3 cm über der Mitte), so streift es die Gummikappen nicht
          }
          if (art === 'facepull') {
            // Seil mit zwei Enden: Knoten 22 cm vor den Händen, vor dem Gesicht bleibt er mindestens 20 cm vor dem Kopf
            const mitte = ziele[0][1], k0 = mitte.clone().add(anker.clone().sub(mitte).normalize().multiplyScalar(0.22)), ueber = g.kopf.clone().addScaledVector(g.R.vor, 0.2).sub(k0).dot(g.R.vor), knoten = ueber > 0 ? k0.addScaledVector(g.R.vor, ueber) : k0;
            ziele = [['seil_l', knoten, anker]]; if (z.knoten) z.knoten.position.copy(knoten);
            for (const [s, sg] of [['l', 1], ['r', -1]]) bandKette(z, 'strang_' + s, umDenKoerper(g, knoten, g.hand[s], 0.01, g.R.links.clone().multiplyScalar(sg)));
          }
          if (z.knoten && bein) z.knoten.position.copy(ziele[0][1]);
          for (const [n, ziel, a] of ziele) { const d = ziel.clone().sub(a), l = d.length(); z[n].position.copy(a).add(ziel).multiplyScalar(0.5); z[n].quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); z[n].scale.set(1, l, 1); }
          if (z.dkTurm) { if (flyArt) { z.dkTurm[0].stelle([g.hand.l.distanceTo(anker)]); z.dkTurm[1].stelle([g.hand.r.distanceTo(ankerR)]); } else z.dkTurm[0].zieh(ziele[0][1].distanceTo(ziele[0][2])); }   // DK Line: Seil im Turm, der Stapel hebt sich mit der Seillänge
        }
      };
    },
    blick: V(0, 1.0, 0), abstand: 3.6, kameraRicht: (art === 'abduktion_bein' && last === 'kabel') || art === 'holzhacker_quer' ? V(-0.55, 0.3, 1) : flyArt ? V(0.45, 0.25, 1) : art === 'kickback_bein' && last === 'kabel' ? V(1, 0.3, 0.2) : art === 'facepull' || art === 'ueberzug' ? V(1, 0.3, 0.35) : V(0.9, 0.3, 0.7)
  };
}

// Schwung: Kettlebell Swing
export function swing() {
  const kh = kreuzheben({ art: 'kettlebell' });
  return {
    aufbau: kh.aufbau,
    pose(t) {
      // Die Hüfte streckt zuerst und schnell, die Arme führen nur und pendeln nach. Runter umgekehrt: Die Arme fallen, die Hüfte wartet, dann erst beugt sie
      const h = glatt(t / 0.72);
      const becken = mv(V(0, 0.855, -0.185), V(0, 0.975, 0), h);
      const r = { neigung: mix(49, 0, h) };   // Hüfte weit hinten: Knie 50° (untere Grenze der Form-Regel), Hüfte 90° (obere Grenze), so viel Hüftbeuge wie die Regeln erlauben
      const k = rumpf(becken, r);
      const w = mix(-40, 90, glatt(t)) * RAD;  // Arme pendeln von hinten zwischen den Beinen nach vorn bis Schulterhöhe
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(-sg * 0.145, 0, 0)).add(V(0, -Math.cos(w), Math.sin(w)).multiplyScalar(ARM * 0.98)));
      return { pose: Object.assign({ becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg, 0, -0.5)), kniePol: seiten((s, sg) => V(sg * 0.3, 0, 1)) }, stehFuesse(0.2)),
        props(g, z) { kbBeide(z.kb, g); } };
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
      if (ghd) { ghdBauen(ger, V(0, 0.07 + hy, 0), -MASS.unterschenkel * 0.99, 0.12 + hy); return {}; }   // GHD-Gerät: Kniepolster vorn, Fußplatte mit Rollen hinten
      ger.matte();
      // Polster liegt oben auf der Achillessehne (hält die Fersen unten), zwei Stützen außen; bis 31.10. stand es hinter den Füßen, 3,6 cm darin
      if (art === 'nordic') { ger.box(0.5, 0.1, 0.1, V(0, 0.21, -0.39), ger.mPolster); for (const sx of [-1, 1]) ger.box(0.05, 0.21, 0.05, V(sx * 0.28, 0.105, -0.39), ger.mRahmen); }
      return {};
    },
    pose(t) {
      const knie = V(0, 0.07 + hy, 0);
      const w = ghd ? mix(88, 0, t) : art === 'nordic' ? mix(80, 0, t) : mix(-40, 0, t);      // Neigung des ganzen Körpers ab Knie (+ = nach vorn)
      const richt = V(0, Math.cos(w * RAD), Math.sin(w * RAD));
      // Nordic und Glute Ham: das Hüftgelenk liegt 2 cm unter dem Becken; der Oberschenkel bleibt so voll lang, in der Waagerechten ist das Knie fast gestreckt (bis 5.11. blieb es 29° gebeugt)
      const becken = knie.clone().add(richt.clone().multiplyScalar(MASS.oberschenkel + (art === 'nordic' ? 0.02 : 0)));
      const r = { neigung: w };
      const k = rumpf(becken, r);
      const pose = { becken, rumpf: r, ellbogenPol: seiten((s, sg) => V(sg, -1, -0.5)), fuss: seiten((s, sg) => V(sg * 0.1, 0.12 + hy, -MASS.unterschenkel * (art === 'nordic' ? 0.99 : 0.98))), kniePol: seiten(() => V(0, -1, 0.3)), fussRicht: seiten(() => V(0, -0.2, -1)), fussFlaeche: ghd ? seiten(() => V(0, 0, 1)) : undefined };
      if (art === 'nordic' && !ghd) {
        // Unten fangen die Hände ab: Sie liegen flach am Boden vor den Schultern, der Körper sinkt bis 80° mit gebeugten Ellbogen darüber; oben warten sie vor der Brust (bis 5.11. blieben sie in der Luft, nichts stützte)
        const boden = seiten((s, sg) => V(sg * 0.24, 0.045, 1.205)), brust = seiten((s, sg) => k.brust.clone().add(V(sg * 0.15, -0.15, 0.2))), u = glatt((t - 0.05) / 0.55);
        pose.hand = seiten((s) => mv(boden[s], brust[s], u));
        pose.flach = seiten(() => V(0, 1, 0).lerp(V(0, 0.3, -1), u).normalize());
        pose.ellbogenPol = seiten((s, sg) => V(sg, mix(0.9, -1, u), mix(-0.3, -0.5, u)));
        pose.kopf = { neigung: mix(-25, 0, u) }; pose.fussRicht = seiten(() => V(0, -0.34, -0.94));
        const ist = gelenke(pose).becken;   // gestreckte Arme über dem Kopf: gelenke() senkt den Körper um den Schultergürtel; Becken zurück auf seine Bahn, sonst knickt das Knie
        becken.add(mv(ist, becken, 2).sub(becken));
      } else pose.hand = seiten((s, sg) => art === 'nordic' ? k.brust.clone().add(V(sg * 0.15, -0.15, 0.2)) : becken.clone().add(V(sg * 0.2, 0, 0.05)));
      return { pose };
    },
    blick: V(0, 0.5 + hy * 0.6, 0), abstand: 3.3, kameraRicht: V(1, 0.3, 0.2)
  };
}

// Mobilität / sonstiges Liegen: art: clamshell | seitlage_abduktion | seitlage_adduktion | aussenrotation
export function seitlage(o = {}) {
  const art = o.art || 'clamshell';
  return {
    aufbau(ger) {
      ger.matte(); const z = {};
      if (art === 'aussenrotation') {
        z.kh_l = ger.kurzhantel();
        z.tuch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.17, 16), new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.95 })); z.tuch.castShadow = true; ger.gruppe.add(z.tuch);   // gerolltes Handtuch zwischen Ellbogen und Rippen
      }
      return z;
    },
    pose(t) {
      // auf der rechten Seite liegend, Kopf nach -z, Bauch nach -x
      const basis = new THREE.Quaternion().setFromEuler(new THREE.Euler(-90 * RAD, 0, 90 * RAD, 'ZXY'));
      const r = { basis, neigung: 0 };
      const becken = V(0, 0.2, 0.2);
      const k = rumpf(becken, r);
      const vor = k.R.vor, ab = k.R.oben.clone().negate(), oben = k.R.links, huefte = seiten((s, sg) => becken.clone().addScaledVector(oben, sg * MASS.hueftBreite).addScaledVector(k.R.oben, -0.02));
      const lage = (w) => ab.clone().multiplyScalar(Math.cos(w * RAD)).addScaledVector(vor, Math.sin(w * RAD));   // Richtung in der Liegeebene, w = Beugung
      // Gebeugtes Bein in der Liegeebene: Hüfte hb, Knie kb, Knöchel in Höhe y. Das Knie zeigt nach vorn; bis 5.11. zeigte der Pol die Beinlinie entlang, das untere Knie knickte nach hinten
      const gebeugt = (s, hb, kb, y) => huefte[s].clone().addScaledVector(lage(hb), MASS.oberschenkel).addScaledVector(lage(hb - kb), MASS.unterschenkel).setY(y);
      // Gestrecktes Bein: heben (Grad, zur Decke), streck (Grad, hinter die Körperlinie), Zehen zeigen nach vorn, die Sohle von der Beinlinie weg
      const gestreckt = (s, heben, streck) => { const d = ab.clone().multiplyScalar(Math.cos(heben * RAD)).addScaledVector(oben, Math.sin(heben * RAD)).multiplyScalar(Math.cos(streck * RAD)).addScaledVector(vor, -Math.sin(streck * RAD)); return { z: huefte[s].clone().addScaledVector(d, BEIN * 0.9985), d }; };
      let fuss, kpol = seiten(() => vor.clone()), fussRicht = {}, fussFlaeche = {};
      const liegt = (s, grad, pol = vor) => { const b = ik(huefte[s], fuss[s], MASS.oberschenkel, MASS.unterschenkel, pol); fussRicht[s] = fussLockerRumpf(huefte[s], fuss[s], pol, grad); fussFlaeche[s] = b.mitte.clone().sub(fuss[s]).normalize(); };
      const gerade = (s, b) => { fuss[s] = b.z; fussRicht[s] = vor.clone().addScaledVector(b.d, -vor.dot(b.d)); fussFlaeche[s] = b.d.clone().negate(); };
      if (art === 'clamshell') {
        // Hüfte 45°, Knie 90°, Füße aufeinander in Verlängerung des Rückens (bis 5.11. Knie 135°, Fersen am Gesäß); das obere Knie öffnet, die Füße bleiben zusammen
        fuss = { l: gebeugt('l', 45, 90, 0.19), r: gebeugt('r', 45, 90, 0.085) };
        liegt('l', -20); liegt('r', -20);
        kpol.l = vor.clone().addScaledVector(oben, mix(0, 1.0, t));
      } else if (art === 'seitlage_adduktion') {
        // Oberes Bein steht gebeugt vor dem Körper, das untere, gestreckte Bein hebt sich (bis 5.11. Knie 29° gebeugt, Fuß lang)
        fuss = { l: becken.clone().add(V(-0.35, -0.12, 0.38)) };
        gerade('r', gestreckt('r', mix(0, 22, t), 0));
        kpol.l = V(-0.5, 1, 0.3); fussRicht.l = V(-0.45, 0, 0.9); fussFlaeche.l = null;
      } else if (art === 'seitlage_abduktion') {
        // Oberes Bein gestreckt, leicht hinter der Körperlinie, Zehen nach vorn; unteres gebeugt (bis 5.11. Knie 44° auch oben, Fuß lang, Sohle zur Kamera)
        fuss = { r: gebeugt('r', 30, 45, 0.075) };
        gerade('l', gestreckt('l', mix(-5, 33, t), 7)); liegt('r', -25);
      } else {
        // Beine übereinander, Hüften 40°, Knie 70° (bis 5.11. versetzt)
        fuss = { l: gebeugt('l', 40, 70, 0.19), r: gebeugt('r', 40, 70, 0.085) };
        liegt('l', -20); liegt('r', -20);
      }
      const hand = { l: V(-0.03, 0.42, 0.22), r: k.schulter.r.clone().add(V(0, 0.08, -0.3)) }, epol = { l: V(0.8, 0.1, 0), r: V(0, 1, 0) }, flach = { l: V(0, 1, 0), r: null };   // obere Hand liegt flach auf der Hüfte
      if (art === 'aussenrotation') {
        // Oberer Arm: Oberarm seitlich am Rumpf (Ellbogen an der Taille auf dem Handtuch), Ellbogen 90°; der Unterarm dreht in der Ebene quer zum Oberarm von schräg unten vor dem Bauch bis 65° über die Waagerechte
        // (rund 75° Außendrehung; bis 5.11. senkrecht am Anschlag, die Hantel lag davor bis 10 cm in Brust und Rücken)
        const ober = ab.clone().multiplyScalar(Math.cos(15 * RAD)).addScaledVector(vor, Math.sin(15 * RAD)).addScaledVector(oben, 0.25).normalize();
        const ell = k.schulter.l.clone().addScaledVector(ober, MASS.oberarm), phi = mix(-20, 65, t) * RAD;
        const e1 = vor.clone().addScaledVector(ober, -vor.dot(ober)).normalize(), e2 = oben.clone().addScaledVector(ober, -oben.dot(ober)).addScaledVector(e1, -oben.dot(e1)).normalize();
        hand.l = genau(ell.clone().addScaledVector(e1, Math.cos(phi) * UNTERARM).addScaledVector(e2, Math.sin(phi) * UNTERARM));
        epol.l = ell.clone().sub(k.schulter.l.clone().lerp(hand.l, 0.5)); flach.l = null;
      }
      return { pose: { becken, rumpf: r, hand, flach, ellbogenPol: epol, fuss, kniePol: kpol, fussRicht, fussFlaeche },
        props(g, z) {
          if (z.kh_l) khHalten(z, g, 'l', z.kh_l, 'neutral');
          if (z.tuch) { z.tuch.position.copy(g.ellbogen.l).addScaledVector(oben, -0.113).addScaledVector(ab, 0.03).addScaledVector(vor, -0.01); z.tuch.quaternion.setFromUnitVectors(V(0, 1, 0), ab); }
        } };
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
      // Unten nur so tief, dass der Oberarm höchstens etwa 60° hinter den Körper geht (Schulter schonen) und der Ellbogen bei 90° steht, oben Arme gestreckt
      const becken = mv(V(0, 0.372, -0.145), V(0, 0.555, -0.14), t), r = { neigung: 6 };
      const hand = seiten((s, sg) => V(sg * 0.2, 0.47, -0.27));   // Hände flach auf der Bankkante
      return { pose: { becken, rumpf: r, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg * 0.04, 0, -1)),   // Ellbogen zeigen nach hinten, nicht nach außen
        fuss: seiten((s, sg) => V(sg * 0.12, FY, 0.62)), kniePol: seiten((s, sg) => V(sg * 0.1, 1, 1)), fussRicht: seiten(() => V(0, 0.2, 1)) } };
    },
    blick: V(0, 0.6, 0), abstand: 3.0, kameraRicht: V(1, 0.3, 0.45)
  };
}

// Dip-Maschine im Sitzen: Griffe seitlich, nach unten drücken
function dipMaschine() {
  const becken = V(0, 0.56, -0.08), r = { neigung: 5 };   // aufrecht, nur so wenig vor, wie die Schulter braucht
  const k = rumpf(becken, r);
  // Griffe (längs, Handflächen zueinander) laufen auf dem Bogen der Hebel. Start: Griff auf Bauchnabelhöhe, Oberarm 48° hinter dem Rumpf, Ellbogen unter der Schulter, etwa 105° gebeugt (bis 5.11. Griff an der Brust, Ellbogen auf Schulterhöhe, Oberarm 71° hinten: überdehnt die Schulter)
  // Ende: neben der Hüfte, Arme gestreckt
  const startHand = (s, sg) => { const e = (48 + r.neigung) * RAD, f = (48 + r.neigung - 105) * RAD; return k.schulter[s].clone().add(V(sg * 0.1, -Math.cos(e) * MASS.oberarm * 0.998 - Math.cos(f) * UNTERARM, -Math.sin(e) * MASS.oberarm * 0.998 - Math.sin(f) * UNTERARM)); };
  const h0 = (s, sg) => startHand(s, sg), h1 = (s, sg) => k.schulter[s].clone().add(V(sg * 0.1, -1, 0.02).normalize().multiplyScalar(ARM * 0.9995));
  const C = bogenMitte(h0('l', 1), h1('l', 1), { z: becken.z - 0.5 });
  return {
    aufbau(ger) { const z = {}; drueckmaschineBauen(ger, z, becken, r, C, 'laengs', { titel: 'DIP-MASCHINE', untertitel: 'TRIZEPS', dir: -1, rN: 0.28, dth: 0.46 }); return z; },
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
        // Polster 2,5 cm tiefer (Rücken liegt auf), Stützen enden unter dem Polster (vorher ragten sie durch Kopf und Beine)
        const pad = ger.box(0.32, 0.07, 1.3, V(), ger.mPolster); pad.position.copy(dreh(V(0, 0.0, 0.05))); pad.quaternion.copy(qNeg);
        const unter = (zz) => { const n = V(0, 1, 0).applyQuaternion(qNeg), c = pad.position, a = V(0, 0, 1).applyQuaternion(qNeg); return c.y + (zz - c.z) * a.y / a.z - 0.035 / n.y; };
        for (const zz of [-0.35, 0.55]) { const h = unter(zz); ger.box(0.06, h, 0.06, V(0, h / 2, zz), ger.mRahmen); }
        // Rolle über dem Rist (Füße eingehakt), nicht neben dem Knöchel (bis 31.10. steckte der Fuß 3,7 cm darin)
        const rolle = ger.zyl(0.05, 0.36, ger.mPolster); rolle.rotation.z = Math.PI / 2; rolle.position.copy(dreh(V(0, 0.25, 0.83)));
      }
      return z;
    },
    pose(t) {
      if (art === 'schultertippen' || art === 'mountain') {
        // Hoher Stütz: Hände unter den Schultern, Arme gestreckt (Schulter so hoch, wie der Arm lang ist), auf den Zehen, Körper gerade. Einmal durch: erst die linke Seite, dann die rechte (bis 5.11. kam jede Seite zweimal hintereinander)
        const w = Math.sin(t * Math.PI * 2) ** 2, heb = { l: t < 0.5 ? w : 0, r: t < 0.5 ? 0 : w };
        const tippen = art === 'schultertippen', breit = tippen ? 0.2 : 0.1;
        // Schultertippen: Becken und Schultern verlagern sich 4–6 cm zur Stützhand, sonst läge der Schwerpunkt neben der Stützfläche; der Rumpf dreht nicht
        const seite = tippen ? 0.055 * (heb.r - heb.l) : 0, sch = V(seite, 0.046 + STUETZ * 0.998, 0.4);
        const beinL = Math.sqrt((BEIN * 0.998) ** 2 - (breit - MASS.hueftBreite) ** 2), lang = beinL + MASS.rumpf - 0.01;
        const stuetz = V(0, 0.19, sch.z - Math.sqrt(lang * lang - (sch.y - 0.19) ** 2));   // Knöchel 19 cm hoch: so steht der Fuß auf den Zehen
        const b = brettPose(stuetz, sch);
        if (art === 'mountain') {   // Das Becken hebt sich beim Knieanziehen um bis zu 5 cm (quer zur Körperlinie, die Füße bleiben, wo sie sind), sonst schleift das Knie am Boden
          const quer = V(0, b.richt.z, -b.richt.y), hoch = b.becken.clone().addScaledVector(quer, 0.05 * w), richt = sch.clone().sub(hoch).normalize();
          b.becken = sch.clone().sub(richt.clone().multiplyScalar(MASS.rumpf - 0.03)); b.r = { basis: basisAus(richt, V(0, -1, 0)), neigung: 0 };
        }
        const k = rumpf(b.becken, b.r), RB = rumpfRahmen(b.r);
        const boden = (s, sg) => V(sg * 0.21, 0.046, 0.42);
        let hand = seiten(boden), fuss = seiten((s, sg) => stuetz.clone().add(V(sg * breit, 0, 0)));
        let kpol = seiten(() => V(0, -1, 0)), fr = seiten(() => V(0, -1, 0.26)), flach, epol = seiten((s, sg) => V(sg * 0.6, 0.3, -1));
        if (tippen) {
          // Die Hand geht unter dem Kinn zur Vorderseite der anderen Schulter: Ellbogen nach unten-außen (nicht hoch über den Rücken), Handfläche dreht vom Boden zum Körper, die Finger liegen auf dem Schultergelenk. Der Stützarm bleibt lang
          hand = seiten((s, sg) => mv(boden(s, sg), k.schulter[s === 'l' ? 'r' : 'l'].clone().addScaledVector(k.R.links, sg * 0.19).addScaledVector(k.R.vor, 0.14).addScaledVector(k.R.oben, 0.05), heb[s]).addScaledVector(k.R.oben, 0.06 * Math.sin(Math.PI * heb[s])));
          flach = seiten((s, sg) => { const th = Math.PI * glatt(heb[s] / 0.8); return V(sg * Math.sin(th), Math.cos(th), 0.35 * Math.sin(th / 2)); });
          epol = seiten((s, sg) => V(sg, 0.1, -0.1).lerp(V(sg * 0.8, -0.5, 0.45), glatt(heb[s] / 0.5)));   // am langen Stützarm nach außen, beim Tippen nach unten-außen: der Ellbogen schlägt nicht um
        } else {
          // Das Knie kommt unter die Brust: Hüfte bis 112°, Knie rund 130°. Der Fuß läuft dicht über dem Boden nach vorn (das Knie beugt nur so weit, wie der Knöchel auf rund 20 cm Höhe bleibt): Mehr Hüfte oder weniger Knie gehen nicht, der Fuß läge sonst im Boden. Das Bein schwingt wenig nach außen, sonst streift das Knie die Matte
          const aus = RB.oben.clone().negate(), hoch = RB.vor, R0 = Math.hypot(aus.y, hoch.y), d0 = Math.atan2(hoch.y, aus.y);
          const bein = seiten((s) => {
            const H = hueftGelenk(b.becken, RB, s), F = mix(3.5, 112, heb[s]), fr0 = F * RAD, knieY = H.y + MASS.oberschenkel * (aus.y * Math.cos(fr0) + hoch.y * Math.sin(fr0));
            const c = Math.max(-1, Math.min(1, (0.19 + 0.09 * Math.sin(Math.PI * Math.min(1, heb[s] / 0.8)) - knieY) / MASS.unterschenkel / R0)), wS = (d0 + Math.acos(c)) / RAD;
            return beinAus(H, F, Math.max(7, F - wS), aus, hoch);
          });
          fuss = seiten((s, sg) => heb[s] < 1e-4 ? stuetz.clone().add(V(sg * breit, 0, 0)) : bein[s].fuss.add(V(sg * (breit - MASS.hueftBreite) + sg * 0.06 * Math.sin(Math.PI * heb[s]), 0, 0)));
          kpol = seiten((s, sg) => bein[s].pol.clone().add(V(sg * 0.2 * glatt(heb[s] / 0.3), 0, 0)));
          fr = seiten((s) => V(0, -1, 0.26).lerp(bein[s].fr(58), glatt(heb[s] / 0.6)));
        }
        return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -10 }, beinGerade: tippen, hand, flach, ellbogenPol: epol, fuss, kniePol: kpol, fussRicht: fr } };
      }
      if (art === 'lsitz') {
        // Stütz am Barren: Arme lang, Schultern tief, Beine gestreckt und geschlossen waagerecht nach vorn. Der Schwerpunkt liegt über den Händen: das Becken sitzt hinter den Händen, der Rumpf neigt sich leicht vor und rundet sich wenig
        const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
        const r = { neigung: 3 + atmen }, ws = { beuge: 14 }, handZ = 0.05, sz = -0.04, sdx = 0.27 - MASS.schulterBreite;
        const becken = beckenUnter(V(0, 1.25 + Math.sqrt((ARM * 0.9995) ** 2 - sdx * sdx - (handZ - sz) ** 2), sz), r, ws), RB = rumpfRahmen(r);
        const bein = seiten((s) => beinAus(hueftGelenk(becken, RB, s), 1 + atmen, 6, BEIN_AUS, BEIN_HOCH));
        return { pose: { becken, rumpf: r, wirbel: ws, kopf: { neigung: -6 }, hand: seiten((s, sg) => genau(V(sg * 0.27, 1.25, handZ))), ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)),
          fuss: seiten((s, sg) => bein[s].fuss.clone().add(V(-sg * 0.02, 0, 0))), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(40)) } };
      }
      // Rückenlage auf der Matte (Negativbank: alles um das Becken gedreht, Kopf tiefer)
      const becken0 = V(0, 0.12, 0.25);
      let neigung = 0, drehung = 0, hand, fuss, kpol = seiten(() => V(0, 1, 0)), fussRicht, handflaeche, w, epol = seiten((s, sg) => V(sg, 0.4, 0)), greift, kopf;
      if (art === 'situp' || neg) {
        // Sit-up: erst rollt der Rumpf ein (Kopf und Schultern), dann kommt das Becken dazu. Negativ-Crunch: nur einrollen, das Becken bleibt auf der Bank. Arme vor der Brust gekreuzt, fest am Rumpf
        neigung = neg ? mix(0, -4, t) : mix(0, 56, glatt((t - 0.2) / 0.8)); w = { beuge: neg ? mix(0, 42, t) : mix(0, 26, glatt(t / 0.45)) };
        if (!neg) becken0.y += 0.035 * neigung / 56;   // sitzt oben auf dem Po, nicht darin
        const k = rumpf(becken0, { basis: LIEGEND, neigung }, w);
        hand = seiten((s, sg) => gekreuzt(k, sg));
        handflaeche = seiten(() => k.R.vor.clone().negate()); epol = seiten((s, sg) => gekreuztPol(k, sg));
        fuss = seiten((s, sg) => V(sg * 0.15, neg ? 0.2 : FY, neg ? 0.78 : 0.7));
      } else if (art === 'vup') {
        // Oberkörper und gestreckte Beine kommen gleichzeitig hoch: das Becken rollt auf die Sitzknochen, der Rücken rundet sich, oben steht ein V. Die Hände gehen zu den Schienbeinen
        neigung = mix(0, 30, t); w = { beuge: mix(0, 26, t) };
        becken0.y += 0.03 * t;
        const k = rumpf(becken0, { basis: LIEGEND, neigung }, w), RB = rumpfRahmen({ basis: LIEGEND, neigung });
        const bein = seiten((s) => beinAus(hueftGelenk(becken0, RB, s), mix(6, 66, t), 7, BEIN_AUS, BEIN_HOCH));
        fuss = seiten((s, sg) => bein[s].fuss.clone().add(V(-sg * 0.02, 0, 0)));
        const sb = bein.l.fuss.clone().sub(hueftGelenk(becken0, RB, 'l')).normalize(), ziel = becken0.clone().addScaledVector(sb, 0.62);
        // Die Arme bleiben gestreckt und gehen im Bogen über oben zu den Schienbeinen (bis 5.11. mitten durch: Ellbogen knickte 175°)
        hand = seiten((s, sg) => { const S = k.schulter[s], Z = ziel.clone().add(V(sg * 0.1, 0.05, 0)).sub(S), a1 = Math.atan2(Z.y, -Z.z), a = mix(5 * RAD, a1, t); return S.clone().add(V(sg * 0.03 * (1 - t), Math.sin(a) * ARM * 0.998, -Math.cos(a) * ARM * 0.998)); });
        greift = seiten(() => true);
        kpol = seiten((s) => bein[s].pol); fussRicht = seiten((s) => bein[s].fr(20));
      } else {
        // Fahrrad-Crunch: Schultern oben, Rumpf dreht, Knie wechseln (links zieht, wenn der rechte Ellbogen kommt). Das Knie kommt über die Hüfte (Hüfte rund 95°, Mittellinie bleibt), das andere Bein wird lang
        const seite = mix(-1, 1, t);
        neigung = -4; w = { beuge: 32, dreh: seite * 30 };   // Das Becken bleibt liegen, Brustkorb hebt ab und dreht
        const k = rumpf(becken0, { basis: LIEGEND, neigung }, w), RB = rumpfRahmen({ basis: LIEGEND, neigung });
        hand = seiten((s, sg) => amKopf(k, sg));
        handflaeche = seiten((s, sg) => k.R.links.clone().multiplyScalar(-sg)); epol = seiten((s, sg) => k.R.links.clone().multiplyScalar(sg).addScaledVector(k.R.oben, -0.3).addScaledVector(k.R.vor, 0.2));
        const anz = (s) => s === 'l' ? glatt((seite + 1) / 2) : glatt((1 - seite) / 2);   // 1 = Knie an der Brust
        const bein = seiten((s) => beinAus(hueftGelenk(becken0, RB, s), mix(22, 98, anz(s)), mix(9, 100, anz(s)), BEIN_AUS, BEIN_HOCH));
        fuss = seiten((s) => bein[s].fuss); kpol = seiten((s) => bein[s].pol); fussRicht = seiten((s) => bein[s].fr(20));
      }
      return { pose: { becken: dreh(becken0), rumpf: { basis: neg ? qNeg.clone().multiply(LIEGEND) : LIEGEND, neigung, drehung }, wirbel: w, kopf,
          hand: seiten((s) => dreh(hand[s])), greift, handflaeche: handflaeche ? seiten((s) => drehR(handflaeche[s])) : undefined, ellbogenPol: seiten((s) => drehR(epol[s])), fuss: seiten((s) => dreh(fuss[s])),
          kniePol: seiten((s) => drehR(kpol[s])), fussRicht: fussRicht ? seiten((s) => drehR(fussRicht[s])) : undefined } };
    },
    blick: V(0, 0.45, 0.1), abstand: 3.4, kameraRicht: art === 'lsitz' ? V(1, 0.25, 0.5) : V(1, 0.45, 0.3),
    dauer: art === 'lsitz' ? STATISCH : art === 'mountain' ? [1.8, 0, 0, 0] : art === 'schultertippen' ? [3.6, 0, 0, 0] : art === 'fahrrad' ? [1.4, 0.2, 1.4, 0.2] : undefined,
    // Einmal durch: linke Seite, rechte Seite, das Ende passt wieder an den Anfang (t läuft nur vorwärts)
    gleichmaessig: art === 'mountain' || art === 'schultertippen'
  };
}

// Weitere Rumpfübungen
const BS_ELLBOGEN_Z = -0.5, RS_BALLEN_Z = -0.75;   // Body Saw: Ellbogen stehen hier am Boden. Rollout aus dem Stand: Fußballen
const RM_GRIFF = V(MASS.schulterBreite - 0.04, 0.55, 0.22);   // Griff der Bauchmaschine im Hebel (Bezug Becken): 22 cm vor der Schulter, damit die Arme nicht ganz zusammengefaltet sind
function rumpfMehr(art) {
  return {
    aufbau(ger) {
      const z = {};
      if (['plank_knie', 'body_saw', 'rollout_stehend', 'reverse_crunch', 'hollow_rock'].includes(art)) ger.matte();
      if (art === 'body_saw') { z.gleit_l = ger.zyl(0.08, 0.015, ger.mGold, 20); z.gleit_r = ger.zyl(0.08, 0.015, ger.mGold, 20); }
      if (art === 'rollout_stehend') z.lh = ger.langhantel();   // Stange mit großen Scheiben (Griffe schulterbreit), so steht es im Text
      if (art === 'knieheben_haengend') ger.stange(HANG_Y, 1.2, 0);
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
          // Die Ellbogen bleiben am Boden stehen, die Schultern schwenken um sie (kein Rutschen der Ellbogen): t = 0 zurückgeschoben, 15 cm hinter den Ellbogen; t = 1 knapp vor ihnen. Die Füße gleiten rund 22 cm mit
          const a = mix(31, -13, t) * RAD;
          S = V(0, 0.055 + 0.29 * Math.cos(a), BS_ELLBOGEN_Z + 0.29 * Math.sin(a));
          stuetz = V(0, FY, S.z + Math.sqrt(1.378 ** 2 - (S.y - FY) ** 2));
          fuss = seitenBauch((s, sg) => stuetz.clone().add(V(sg * 0.09, 0, 0)));
        }
        const b = brettPose(stuetz, S);
        const hz = art === 'body_saw' ? BS_ELLBOGEN_Z - 0.27 : S.z - 0.3;
        return { pose: { becken: b.becken, rumpf: b.r, kopf: { neigung: -5 }, beinGerade: art === 'body_saw', hand: seitenBauch((s, sg) => V(sg * 0.1, 0.05, hz)), ellbogenPol: seitenBauch((s, sg) => V(sg * 0.2, -1, 0.2)),
            fuss, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => art === 'plank_knie' ? V(0, -0.2, 1) : V(0, -1, 0.3)) },
          props(g, z) { if (z.gleit_l) for (const s of ['l', 'r']) z['gleit_' + s].position.set(g.zehe[s].x, 0.01, g.zehe[s].z); } };
      }
      if (art === 'rollout_stehend') {
        // Die Fußballen bleiben stehen, die Ferse hebt sich, je flacher der Körper wird (der Knöchel läuft auf einem Kreis um den Ballen, darum kein Rutschen). Das Bein bleibt gerade (Länge fest), t = 0: Körper fast waagerecht als Linie,
        // Arme in der Verlängerung, Hüfte offen; t = 1: Hüfte 114° gebeugt, Becken hoch, Beine fast senkrecht. Die Stange rollt so, dass die Arme lang bleiben
        const n = mix(65, 0, t) * RAD, eL = mix(4.6, 80, t) * RAD, eR = mix(4.6, -34, t) * RAD;
        const knoechel = V(0, 0.062 + Math.sin(n) * MASS.fussLaenge * BALLEN, RS_BALLEN_Z - Math.cos(n) * MASS.fussLaenge * BALLEN);
        const obenR = V(0, Math.sin(eR), Math.cos(eR)), r = { basis: basisAus(obenR, V(0, -1, 0)), neigung: 0 };
        const huefte = knoechel.clone().add(V(0, Math.sin(eL), Math.cos(eL)).multiplyScalar(Math.sqrt((BEIN * 0.998) ** 2 - 0.025 * 0.025)));
        const becken = huefte.clone().addScaledVector(obenR, 0.02), k = rumpf(becken, r);
        const sm = k.schulter.l.clone().add(k.schulter.r).multiplyScalar(0.5), griffY = 0.225;
        const stangeZ = sm.z + Math.sqrt(Math.max(0.01, (ARM * 0.998) ** 2 - (sm.y - griffY) ** 2));
        return { pose: { becken, rumpf: r, kopf: { neigung: -10 }, hand: seiten((s, sg) => V(sg * 0.2, griffY, stangeZ)), griffRollt: true, greift: seiten(() => true), ellbogenPol: seiten((s, sg) => V(sg, 0, 0)),
            fuss: seiten((s, sg) => knoechel.clone().add(V(sg * 0.12, 0, 0))), fussRicht: seiten(() => V(0, 0, 1)), zehen: seiten(() => n / RAD), kniePol: seiten(() => V(0, -0.3, 1)) },
          props(g, z) { z.lh.position.set(0, griffY, (g.hand.l.z + g.hand.r.z) / 2); z.lh.quaternion.identity(); } };
      }
      if (art === 'reverse_crunch') {
        // Das Becken rollt vom Boden hoch, die Schultern bleiben liegen: Die Bewegung kommt aus der unteren Wirbelsäule (bis 5.11. schob sich der steife Rumpf nur hoch). Der Brustkorb hebt 6° mit, so kommt das Becken 30° Rollen mit rund 10 cm aus
        const r = { basis: LIEGEND, neigung: mix(0, -30, t) }, w = { beuge: mix(0, 36, t) };
        const S = V(0, 0.12, 0.25 - MASS.rumpf + 0.03), becken = beckenUnter(S, r, w), RB = rumpfRahmen(r);
        // Knie bleibt rund 95° gebeugt, die Hüfte beugt nur 90° auf 110°. Die Arme liegen lang neben dem Körper und bleiben, wo sie sind
        const bein = seiten((s) => beinAus(hueftGelenk(becken, RB, s), mix(90, 110, t), 95, RB.oben.clone().negate(), RB.vor));
        return { pose: { becken, rumpf: r, wirbel: w, hand: seiten((s, sg) => armNeben(S.clone().setX(sg * MASS.schulterBreite), sg)), flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)),
          fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(30)) } };
      }
      if (art === 'knieheben_haengend') {
        // Frei hängen, Beine fast gestreckt; die Knie kommen zur Brust (Oberschenkel 42° über der Waagerechten, Knie 100°), das Becken rollt in der zweiten Hälfte 26° nach hinten ein, der Rumpf pendelt höchstens 6°
        const h = hangPose(mix(0, 26, glatt((t - 0.35) / 0.65)), mix(0, 6, glatt(t)));
        const bein = seiten((s) => beinAus(hueftGelenk(h.becken, h.RB, s), mix(3, 132, t), mix(10, 100, glatt(t * 1.6)), V(0, -1, 0), V(0, 0, 1)));
        return { pose: { becken: h.becken, rumpf: h.r, wirbel: h.w, kopf: { neigung: -5 }, hand: h.hand, ellbogenPol: h.ellbogenPol, fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(25)) } };
      }
      if (art === 'hollow_rock') {
        // Die Hollow-Form bleibt gleich und rollt auf dem runden Rücken: Drehung um den Krümmungsmittelpunkt über dem Boden, dazu derselbe Weg am Boden entlang (rollt, statt um einen Punkt zu kippen). Der Auflagepunkt wandert vom oberen Rücken zum Gesäß
        const a = mix(-7, 7, t) * RAD, C = V(0, 0.9, 0.1), weg = V(0, 0, 0.9 * a);
        const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
        const dreh = (p) => p.clone().sub(C).applyQuaternion(q).add(C).add(weg);
        const form = hollowForm();
        return { pose: { becken: dreh(form.becken), rumpf: { basis: q.clone().multiply(LIEGEND), neigung: form.r.neigung }, wirbel: form.w, kopf: { neigung: 6 }, hand: seiten((s) => dreh(form.hand[s])), ellbogenPol: seiten((s, sg) => V(sg, 0, 0)),
          fuss: seiten((s) => dreh(form.fuss[s])), kniePol: seiten((s) => form.kpol[s].clone().applyQuaternion(q)), fussRicht: seiten((s) => form.fr[s].clone().applyQuaternion(q)) } };
      }
      // Maschinen im Sitzen: Bauch einrollen bzw. Rücken nach hinten strecken
      const bauch = art === 'bauchmaschine';
      const becken = V(0, 0.56, -0.08);
      // Bauchmaschine: Das Becken bleibt auf dem Sitz, der Rumpf rollt ein. Rückenstrecker: das Becken ist fixiert (kippt höchstens 8°), die Wirbelsäule streckt von 20° Beugung bis aufrecht
      const r = { neigung: bauch ? mix(-4, 4, t) : mix(8, 0, t) }, w = { beuge: bauch ? mix(0, 32, t) : mix(20, 0, t) };
      const k = rumpf(becken, r, w);
      // Der Hebel dreht um die Hüftachse: mit dem Rumpf bewegt sich sein Winkel, nicht der des Brustkorbs (Brustkorb und Hebel laufen sonst bis 14 cm auseinander). Griffe und Polster folgen dem Hebel, die Hände bleiben an den Griffen
      const hebelW = Math.atan2(k.brust.z - becken.z, k.brust.y - becken.y);
      const hebelQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), hebelW);
      const hand = bauch ? seiten((s, sg) => becken.clone().add(RM_GRIFF.clone().setX(sg * RM_GRIFF.x).applyQuaternion(hebelQ)))
        : seiten((s, sg) => gekreuzt(k, sg));   // Arme vor der Brust gekreuzt
      return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: bauch ? 15 : -5 }, hand, handflaeche: bauch ? seiten((s, sg) => k.R.links.clone().multiplyScalar(-sg)) : seiten(() => k.R.vor.clone().negate()),
          ellbogenPol: seiten((s, sg) => bauch ? V(sg * 0.4, -1, 0.5) : gekreuztPol(k, sg)), fuss: seiten((s, sg) => V(sg * 0.13, bauch ? FY : 0.08 + FY, bauch ? 0.36 : 0.42)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) },
        props(g, z) { z.rm.hebel.quaternion.copy(hebelQ); z.rm.dk.stelle([Math.PI / 2 - hebelW]); } };   // DK Line: Hebelwinkel (von +z nach +y) bewegt Nocke, Seil und Stapel
    },
    blick: V(0, 0.6, 0), abstand: 3.4, kameraRicht: V(1, 0.4, 0.3),
    dauer: art === 'plank_knie' ? STATISCH : art === 'hollow_rock' ? [0.9, 0.1, 0.9, 0.1] : art === 'body_saw' ? [1.2, 0.2, 1.2, 0.2] : undefined
  };
}

// Freier Fuß hängt locker: Richtung Ferse → Zehen aus dem Schienbein (Hüftgelenk, Knöchel, Pol des Knies), um grad gestreckt (bis 5.11. feste Richtung: beim Skater Squat zeitweise 87° gestreckt)
function fussLockerRumpf(huefte, knoechel, pol, grad) {
  const kn = ik(huefte, knoechel, MASS.oberschenkel, MASS.unterschenkel, pol).mitte, sc = knoechel.clone().sub(kn).normalize(), th = kn.clone().sub(huefte).normalize();
  const vorn = th.addScaledVector(sc, -th.dot(sc));
  if (vorn.lengthSq() < 1e-4) vorn.copy(pol).addScaledVector(sc, -pol.dot(sc));
  return vorn.normalize().multiplyScalar(Math.cos(grad * RAD)).addScaledVector(sc, Math.sin(grad * RAD));
}
// Einbeinige Kniebeuge: links steht. art: pistol | pistol_halt | box | skater | shrimp
export function einbeinkniebeuge(o = {}) {
  const art = o.art || 'pistol';
  const vorn = art === 'pistol' || art === 'pistol_halt' || art === 'box', halt = art === 'pistol_halt';
  // Pistol mit Festhalten: Stange seitlich vorn, die linke Hand hält an einer Stelle fest, der Arm streckt sich beim Absenken (bis 5.11. Stange genau vorn, beide Hände wanderten 40 cm daran hoch)
  const HALT = V(0.56, 1.3, 0.34);
  return {
    aufbau(ger) {
      if (art === 'box') ger.box(0.42, 0.45, 0.38, V(0, 0.225, -0.38), ger.mPolster);
      if (halt) { ger.box(0.05, 2, 0.05, V(HALT.x, 1, HALT.z), ger.mRahmen); ger.box(0.3, 0.02, 0.3, V(HALT.x, 0.01, HALT.z), ger.mRahmen); }
      if (art === 'skater') ger.box(0.3, 0.04, 0.3, V(-0.1, 0.02, -0.38), ger.mPolster);   // Kniekissen 4 cm (1.11.: feinere Haut, Knie lag 3,5 cm drin)
      return {};
    },
    pose(t) {
      let becken, neigung, fussR, kpolR, frR, zehenR = 0;
      const w8 = beinWeg(t, art === 'box' ? 92 : art === 'skater' ? 119 : vorn ? 135 : 125, 4), oben = V(0.05, beckenGestreckt(FY, 0.065, 0.02), 0.03);
      if (vorn) {
        // Pistol: ganz tief, Gesäß an der Wade, Ferse flach (bis 5.11. Knie 115°). Oben bleibt der freie Fuß vorn in der Luft, 10–20 cm über dem Boden (bis 5.11. stand er am Boden, das sah wie Abstoßen aus)
        becken = mv(art === 'box' ? V(0.05, 0.6, -0.28) : halt ? V(0.05, 0.43, -0.18) : V(0.05, 0.385, -0.15), oben, w8);
        neigung = mix(art === 'box' ? 34 : halt ? 34 : 42, 3, w8);
        const w = mix(80, 30, w8) * RAD;  // freies Bein gestreckt nach vorn
        fussR = becken.clone().add(V(-0.12, -0.02 - Math.cos(w) * BEIN * 0.99, Math.sin(w) * BEIN * 0.99));
        kpolR = V(0, 1, 0.3); frR = V(0, Math.sin(w) * 0.6, 1);
      } else {
        becken = mv(V(0.05, 0.5, -0.12), oben, w8);
        neigung = mix(art === 'skater' ? 38 : 26, 3, w8);
        kpolR = V(0, -1, 0.5);
        if (art === 'skater') fussR = mv(V(-0.1, 0.24, -0.68), V(-0.12, 0.5, -0.36), w8);
        // Shrimp: Die Hand hält den Fuß am Gesäß. Unten Knie kurz über dem Boden, oben hängt der Oberschenkel fast senkrecht unter dem Becken (bis 5.11. lag der Fuß auf Höhe des unteren Rückens, Hüfte 34° hinter dem Körper)
        else fussR = becken.clone().add(mv(V(-0.1, 0.015, -0.235), V(-0.1, -0.08, -0.27), w8));
        frR = fussLockerRumpf(becken.clone().add(V(-MASS.hueftBreite, -0.02, 0)), fussR, kpolR, art === 'skater' ? 40 : 30);
      }
      const r = { neigung };
      const k = rumpf(becken, r);
      let hand, epol = seiten((s, sg) => V(sg, -0.5, -0.3));
      if (halt) hand = { l: V(HALT.x, HALT.y, HALT.z), r: k.schulter.r.clone().add(V(-0.02, -0.1, ARM * 0.985)) };
      else if (art === 'shrimp') hand = { r: fussR.clone().add(V(0, 0.03, -0.04)), l: k.schulter.l.clone().add(V(0.03, -0.05, ARM * 0.985)) };
      else if (art === 'box' || art === 'pistol') hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.02, mix(-0.1, -0.03, w8), ARM * 0.985)));   // Arme lang nach vorn als Gegengewicht (bis 5.11. ARM * 0,85–0,93: 50° gebeugt, oben auf Bauchhöhe)
      else { const w = mix(82, 8, w8) * RAD; hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.06 * w8, -Math.cos(w) * ARM * 0.97, Math.sin(w) * ARM * 0.97))); }   // Skater: Arme schwingen fast lang von vorn nach unten (linear gedacht knickten sie unterwegs 90°)
      if (art === 'shrimp') epol.r = V(-0.5, 0, -1);
      if (halt) epol.l = V(0.5, -1, -0.5);
      return { pose: { becken, rumpf: r, kopf: { neigung: -5 }, hand, handAuf: seiten(() => 1), ellbogenPol: epol, fuss: { l: V(0.08, FY, 0.05), r: fussR }, kniePol: { l: V(0.15, 0, 1), r: kpolR }, fussRicht: { l: V(0.1, 0, 1), r: frR }, zehen: { l: 0, r: zehenR } } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, 0.35)
  };
}

const GURT_H = -0.03;   // Belt Squat: Höhe des Gurts über dem Becken: tief auf dem Becken, nicht am Bauch (bis 5.11. 7,5 cm höher, über dem Hosenbund: genau der Fehler aus dem Text)
// Spanish Squat, Ablauf davor: Die Bänder liegen vom Pfosten flach am Boden bis neben die Füße (bis 5.11. hingen sie in Kniehöhe, die Figur lief hinein). In die Hocke, greifen, beim Aufrichten hinter die Knie ziehen, loslassen, Arme nach vorn
function spanishAblauf(h) {
  const plan = bandVomBoden(h), hocke = plan.schritte[0].ziel, halb = h.stehen(plan.stand, 0, { neigung: 58 });
  halb.becken = V(0, 0.72, -0.2);
  halb.hand = seiten((s, sg) => V(sg * 0.23, 0.46, 0.02));
  for (const k of ['fuss', 'fussRicht', 'kniePol', 'handflaeche', 'ellbogenPol']) halb[k] = hocke[k];
  const los = Object.assign({}, halb, { hand: seiten((s, sg) => V(sg * 0.25, 0.68, 0.02)), becken: V(0, 0.8, -0.14), rumpf: h.stehen(plan.stand, 0, { neigung: 40 }).rumpf });   // die Hand bleibt hinter dem Knie, bis das Band dort liegt
  // Die Figur kommt von hinten und steigt mit beiden Füßen in das U des Bands (5.11.: bis dahin stand sie schon mitten darin)
  const auf = h.stehen(plan.stand, Math.atan2(plan.blick.x, plan.blick.z));
  auf.fuss = hocke.fuss; auf.fussRicht = hocke.fussRicht;
  auf.becken = V(plan.stand.x, beckenGestreckt(FY, Math.abs(hocke.fuss.l.x) - MASS.hueftBreite, 0.03), plan.stand.z);
  plan.stand = plan.stand.clone().addScaledVector(plan.blick, -0.25); plan.griffNach = 2;
  plan.schritte = [{ ziel: auf, d: 0.7, steigen: { bogen: 0.06, erst: 'l' } }, plan.schritte[0], { ziel: halb, d: 0.7 }, { ziel: los, d: 0.35 }, { ziel: h.Gp, d: 0.8 }];
  return plan;
}
// Kniebeuge-Sonderformen: art: wandsitzen | spanish | sissy | belt
export function sonderkniebeuge(o = {}) {
  const art = o.art || 'wandsitzen';
  const SISSY_HALT = V(-0.5, 1.15, 0.36);   // Sissy Squat: Griff an der Stange, die Hand bleibt dort (bis 5.11. wanderte sie 25 cm mit, unten war der Arm stark gebeugt)
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'wandsitzen') ger.box(1.4, 1.8, 0.06, V(0, 0.9, -0.42), ger.mRahmen);
      if (art === 'spanish') { for (const sx of [-1, 1]) ger.box(0.06, 1.6, 0.06, V(sx * 0.5, 0.8, 0.95), ger.mRahmen); z.band_l = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      if (art === 'sissy') { ger.box(0.05, 1.9, 0.05, V(SISSY_HALT.x, 0.95, SISSY_HALT.z), ger.mRahmen); ger.box(0.3, 0.02, 0.3, V(SISSY_HALT.x, 0.01, SISSY_HALT.z), ger.mRahmen); }
      if (art === 'belt') {
        beltBauen(ger, z);
        // Gurt liegt tief auf der Hüfte und läuft ringsum eng am Körper; vorn eine Öse für die Kette
        z.gurt = new THREE.Group();
        const ring = new THREE.Mesh(rumpfRing(GURT_H, 0.05, 0.012, 2.8), ger.mBand);   // 5 cm weiter außen als die alte Körperform: liegt auf der Haut
        ring.userData.keinTeil = true;   // Ring ist hohl: die Schutzhülle sähe nur seinen Quader (huelle.js)
        z.gurt.add(ring);
        const oese = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 20), ger.mMetall);
        oese.position.copy(rumpfPunkt(GURT_H, 0, 0.08)); z.gurt.add(oese);   // vor dem Bauch, nicht darin
        ger.gruppe.add(z.gurt);
        z.kette = ger.stab(V(), V(0, 1, 0), 0.01, ger.mMetall);
      }
      return z;
    },
    pose(t) {
      const atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      if (art === 'wandsitzen') {
        // Füße schulterbreit (bis 5.11. 0,63×), Arme vor der Brust gekreuzt: Hände auf den Oberschenkeln nennt der Text als Fehler
        const becken = V(0, 0.52 + 0.005 * atmen, -0.24), r = { neigung: 0 }, k = rumpf(becken, r);
        return { pose: Object.assign({ becken, rumpf: r, fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.24)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) }, armeGekreuzt(k)) };
      }
      if (art === 'spanish') {
        // Das Band hält die Knie: Schienbein bleibt fast senkrecht, Knie an einem Ort, das Becken läuft auf einem Bogen darum nach hinten (bis 5.11. gerade Linie: Schienbein 14° vor). Rumpf aufrecht
        const b = mix(90, 15, t) * RAD, kn = V(0, FY + 0.44, 0.115), r = { neigung: mix(16, 4, t) };
        const becken = V(0, kn.y + 0.02 + 0.45 * Math.cos(b), kn.z - 0.45 * Math.sin(b)), k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, hand: seiten((s, sg) => k.schulter[s].clone().add(V(0, -0.05, ARM * 0.985))), handAuf: seiten(() => 1), ellbogenPol: seiten((s, sg) => V(sg, -1, 0)), fuss: seiten((s, sg) => V(sg * 0.15, FY, 0.1)), kniePol: seiten((s, sg) => V(sg * 0.2, 0, 1)) },
          props(g, z) {
            // Ein Band von Pfosten zu Pfosten, hinter den Knien durch (bis 5.11. zwei Stücke, die am Knie endeten). Am Boden liegt es als U um die Füße: die Arme außen neben den Füßen, der Bogen hinter den Fersen;
            // die Figur steigt hinein, nimmt die Arme in die Hände und zieht das Band samt Bogen hoch, bis es hinter den Knien liegt
            const kehle = seiten((s) => g.knie[s].clone().add(V(0, -0.05, -0.09))), hinterFerse = Math.min(g.ferse.l.z, g.ferse.r.z) - 0.1;
            const bogen = seiten((s, sg) => V(sg * 0.3, 0.012, hinterFerse).lerp(kehle[s], glatt((g.hand[s].y - 0.08) / 0.35)));
            const mitte = bogen.l.clone().lerp(bogen.r, 0.5);
            for (const [s, sg] of [['l', 1], ['r', -1]]) {
              const P = kehle[s], A = V(sg * 0.47, 0.5, 0.95), h = g.hand[s];
              // Ablauf davor: Solange die Hand unter dem Knie ist, hält sie das Band, am Boden liegt es flach bis zum Pfosten; sonst liegt es hinter dem Knie
              const w = 1 - glatt((h.y - P.y - 0.02) / 0.12);
              if (w <= 0) { bandKette(z, 'band_' + s, [mitte, ...umDenKoerper(g, P, A, 0.025, g.R.links.clone().multiplyScalar(sg))]); continue; }
              const Q = P.clone().lerp(h.clone().setY(Math.max(0.012, h.y - 0.05)), w), boden = 1 - glatt((h.y - 0.08) / 0.25);   // das Band kommt unten aus der Faust
              bandKette(z, 'band_' + s, [mitte, bogen[s], ...(boden > 0 ? [Q, Q.clone().lerp(A, 0.5).lerp(V(A.x, 0.012, A.z - 0.1), boden), A] : umDenKoerper(g, Q, A, 0.025, g.R.links.clone().multiplyScalar(sg)))]);
            }
          } };
      }
      if (art === 'sissy') {
        // Auf den Fußballen: Die Knie schieben nach vorn, Oberschenkel und Rumpf bleiben fast eine Linie (Hüfte unten etwa 10°). Oben ist das Knie fast gestreckt (bis 5.11. blieb es bei 49°)
        const a = mix(68, 8, t) * RAD, b = mix(47, 7, t) * RAD, y0 = zehenHoehe(50), kn = V(0, y0 + 0.44 * Math.cos(a), 0.44 * Math.sin(a));
        const becken = V(0, kn.y + 0.02 + 0.45 * Math.cos(b), kn.z - 0.45 * Math.sin(b)), r = { neigung: mix(-38, -3, t) }, k = rumpf(becken, r);
        return { pose: { becken, rumpf: r, kopf: { neigung: 10 }, hand: { r: V(SISSY_HALT.x, SISSY_HALT.y, SISSY_HALT.z), l: k.brust.clone().addScaledVector(k.R.vor, 0.16).addScaledVector(k.R.links, -0.02).addScaledVector(k.R.oben, -0.1) }, handflaeche: { l: k.R.vor.clone().negate() }, ellbogenPol: { r: V(-1, -0.5, 0), l: V(1, -1, 0) },
          fuss: seiten((s, sg) => V(sg * 0.12, y0, 0)), zehen: seiten(() => 50), kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) } };
      }
      // Belt Squat: Gurt an der Hüfte, Kette senkrecht nach unten, Hände leicht am Haltegriff
      const becken = mv(V(0, 0.585, -0.17), V(0, 1.123, 0.0), beinWeg(t, 125, 5)), r = { neigung: mix(14, 3, t) };
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.25, 1.13, 0.38)), ellbogenPol: seiten((s, sg) => V(sg, -1, -0.3)), fuss: seiten((s, sg) => V(sg * 0.2, 0.15 + FY, 0.02)), fussRicht: seiten((s, sg) => V(sg * 0.35, 0, 1)), kniePol: seiten((s, sg) => V(sg * 0.35, 0, 1)) },
        props(g, z) {
          z.gurt.position.copy(g.becken); z.gurt.quaternion.copy(g.R.q);
          const o = rumpfPunkt(GURT_H, 0, 0.08), vorn = g.becken.clone().add(g.R.links.clone().multiplyScalar(o.x)).add(g.R.oben.clone().multiplyScalar(o.y - 0.022)).add(g.R.vor.clone().multiplyScalar(o.z));
          seil(z.kette, vorn, V(0, 0.14, BELT_ROLLE_Z));
          if (z.block) z.block.heben(0.3 * t);
        } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(1, 0.3, art === 'wandsitzen' ? 0.6 : 0.4), dauer: art === 'wandsitzen' ? STATISCH : undefined,
    ablaufEigen: art === 'spanish' ? spanishAblauf : undefined
  };
}

// Seitlicher Bandgang: leichte Hocke (Knie 40°), zwei Schritte nach links, zwei zurück; Miniband über den Knien. Füße gehen sichtbar auf und zu (Hüftabduktion 10° Unterschied, bis 5.11. 6° bei Knie 60–74°)
export function bandgang() {
  return {
    aufbau(ger) { return { band: ger.stab(V(), V(0, 1, 0), 0.016, ger.mBand) }; },
    pose(t) {
      const ph = t * 4, i = Math.min(3, Math.floor(ph)), u = glatt(ph - i);
      const heb = Math.sin(u * Math.PI) * 0.06;
      let l = 0.11, rr = -0.11, bx = 0;
      if (i === 0) { l = mix(0.11, 0.39, u); bx = mix(0, 0.14, u); }
      if (i === 1) { l = 0.39; rr = mix(-0.11, 0.17, u); bx = mix(0.14, 0.28, u); }
      if (i === 2) { l = 0.39; rr = mix(0.17, -0.11, u); bx = mix(0.28, 0.14, u); }
      if (i === 3) { l = mix(0.39, 0.11, u); bx = mix(0.14, 0, u); }
      const hebL = i === 0 || i === 3 ? heb : 0, hebR = i === 1 || i === 2 ? heb : 0;
      const becken = V(bx, 0.915, -0.05), r = { neigung: 12 };
      const k = rumpf(becken, r);
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => k.brust.clone().add(V(sg * 0.07, -0.2, 0.3))), ellbogenPol: seiten((s, sg) => V(sg, -1, 0)),
          fuss: { l: V(l, FY + hebL, 0.04), r: V(rr, FY + hebR, 0.04) }, kniePol: seiten((s, sg) => V(sg * 0.4, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.1, 0, 1)) },
        props(g, z) { schlaufe(z, 'band', g, g.knie.l.clone().add(V(0.08, 0.06, -0.01)), g.knie.r.clone().add(V(-0.08, 0.06, -0.01))); } };
    },
    blick: V(0, 0.7, 0), abstand: 3.4, kameraRicht: V(0.3, 0.3, 1), dauer: [3.2, 0, 0, 0]
  };
}

// Beinbeuger ohne Maschine bzw. im Stehen: art: gleiten | gleiten_einbeinig | band | stehend
// Ablauf davor (wirkt über animation()): standVersatz
export function beincurl(o = {}) {
  const art = o.art || 'gleiten';
  return {
    aufbau(ger) {
      const z = {};
      if (art !== 'stehend') ger.matte();
      if (art.startsWith('gleiten')) { z.gleit_l = ger.zyl(0.08, 0.015, ger.mGold, 20); z.gleit_r = ger.zyl(0.08, 0.015, ger.mGold, 20); }
      if (art === 'band') { ger.box(0.06, 0.3, 0.06, V(0, 0.15, 1.4), ger.mRahmen); z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }   // Anker tief: das Band zieht von Anfang an gegen die Beugung
      if (art === 'stehend') beincurlStehendBauen(ger, z, V(-0.1, 0.975 + 0.1 - 0.47, 0.06));
      return z;
    },
    pose(t) {
      if (art.startsWith('gleiten')) {
        // Rückenlage, Becken oben, Fersen auf Gleitern: t = 0 Beine fast lang (Knie 20°, bis 5.11. 48°), t = 1 Fersen nah am Gesäß. Die Schultern bleiben liegen, das Becken geht auf einem Bogen um sie
        const schulterPunkt = V(0, 0.14, -0.45), by = mix(0.2, 0.36, t);
        const becken = V(0, by, schulterPunkt.z + Math.sqrt((MASS.rumpf - 0.03) ** 2 - (by - schulterPunkt.y) ** 2));
        const d = schulterPunkt.clone().sub(becken).normalize();
        const r = { neigung: 0, basis: quer(-90 + Math.atan2(d.y, -d.z) / RAD) };
        const k = rumpf(becken, r);
        const fz = mix(0.91, 0.39, t), einbeinig = art === 'gleiten_einbeinig', kpol = seiten(() => V(0, 1, 0.3));
        const huefte = (sg) => becken.clone().addScaledVector(k.R.links, sg * MASS.hueftBreite).addScaledVector(k.R.oben, -0.02);
        // Fuß auf der Ferse, Sprunggelenk bleibt neutral (Zehen hoch, bis 5.11. lag er flach): der Fuß rollt über die Ferse, der Knöchel steht so hoch, wie die Ferse es verlangt
        const aufFerse = (sg) => { let z0 = V(sg * 0.12, 0.1, fz), rf; for (let i = 0; i < 3; i++) { rf = fussLockerRumpf(huefte(sg), z0, kpol.l, 5); z0 = z0.clone().setY(0.067 + 0.06 * Math.max(0, rf.y)); } return { z: z0, r: rf }; };
        const fl = aufFerse(1), fr = einbeinig ? null : aufFerse(-1);
        const frei = einbeinig ? becken.clone().add(V(-0.1, BEIN * 0.9, 0.35)) : null;   // anderes Bein in der Luft
        const fuss = { l: fl.z, r: einbeinig ? frei : fr.z };
        return { pose: { becken, rumpf: r, kopf: { neigung: 20 }, hand: seiten((s, sg) => V(sg * (MASS.schulterBreite + 0.12), 0.05, schulterPunkt.z + Math.sqrt(0.556 ** 2 - 0.12 ** 2 - (schulterPunkt.y - 0.05) ** 2))), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)),   // Arme lang, Handflächen auf der Matte (bis 5.11. Ellbogen 67°)
            fuss, fussRicht: { l: fl.r, r: einbeinig ? fussLockerRumpf(huefte(-1), frei, kpol.r, -20) : fr.r }, kniePol: kpol },
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
          props(g, z) { bandKette(z, 'band', umDenKoerper(g, g.knoechel.l.clone().add(g.knoechel.r).multiplyScalar(0.5), V(0, 0.08, 1.38))); } };
      }
      // Stehend an der Maschine: rechtes Bein beugt, Oberschenkel bleibt senkrecht
      const becken = V(0, 0.975 + 0.1, 0.02), r = { neigung: 14 };
      const k = rumpf(becken, r);
      // unten Fuß knapp über der Plattform; Fuß angezogen (15° über der Senkrechten zum Schienbein), so bleiben die Zehen über der Plattform
      // (bis 31.10. zeigten sie nach unten, 4 cm in die Plattform)
      const w = mix(26, 105, t) * RAD;
      const knieR = V(-0.1, becken.y - 0.47, 0.06);
      const fussR = knieR.clone().add(V(0, -Math.cos(w) * MASS.unterschenkel, -Math.sin(w) * MASS.unterschenkel));
      return { pose: { becken, rumpf: r, hand: seiten((s, sg) => V(sg * 0.24, 1.25, 0.3)), ellbogenPol: seiten((s, sg) => V(sg, -1, -0.5)),
          fuss: { l: V(0.12, 0.1 + FY, 0.02), r: fussR }, fussRicht: { l: V(0.1, 0, 1), r: V(0, -Math.sin(w - 15 * RAD), Math.cos(w - 15 * RAD)) }, kniePol: { l: V(0.1, 0, 1), r: V(0, 0, 1) } },
        props(g, z) { hebelStellen(z, g, 'r', (phi) => 0.28 * Math.max(0, -phi - 26) / 79); } };   // Unterschenkel dreht nach hinten (phi negativ): Block hebt sich ab 26°
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
        stuetz = V(0, 0.15, 0.42);   // Mitte der Knie (das obere liegt auf dem unteren): Knie, Hüfte und Schulter in einer Linie
        S = stuetz.clone().add(V(0, 0.39 + 0.015 * atmen, -Math.sqrt(0.94 ** 2 - 0.39 ** 2)));
      } else if (art === 'abduktion') {
        stuetz = V(0, FY, 0.75);
        S = stuetz.clone().add(V(0, 0.46, -Math.sqrt(1.38 ** 2 - 0.46 ** 2)));
      } else if (art === 'copenhagen_lang') {
        stuetz = V(0, 0.505, 0.85);
        S = stuetz.clone().add(V(0, 0.04 + 0.02 * t, -Math.sqrt(1.38 ** 2 - 0.04 ** 2)));
      } else {
        stuetz = V(0, 0.5, 0.55);
        S = stuetz.clone().add(V(0, 0.04 + 0.02 * t, -Math.sqrt(0.94 ** 2 - 0.04 ** 2)));
      }
      const b = brettPose(stuetz, S, bauch);
      const k = rumpf(b.becken, b.r);
      const handR = V(k.schulter.r.x - 0.24, 0.055, k.schulter.r.z - 0.02);   // Unterarm liegt auf, nicht im Boden
      const handL = b.becken.clone().add(k.R.links.clone().multiplyScalar(0.16)).add(k.R.vor.clone().multiplyScalar(0.05));   // freie Hand auf der Hüfte (bis 5.11. stand der Arm angewinkelt in der Luft)
      if (art === 'knie') {
        fuss = { r: stuetz.clone().add(V(0.38, -0.05, 0.1)), l: stuetz.clone().add(V(0.38, 0.05, 0.1)) };
      } else if (art === 'abduktion') {
        // Beide Beine lang: das obere hebt gestreckt aus der Hüfte (bei 0,97 Beinlänge knickte das Knie bis 37°)
        const huefteL = hueftGelenk(b.becken, k.R, 'l');
        const a = mix(0, 35, t) * RAD;
        const bein = b.richt.clone().negate().multiplyScalar(Math.cos(a)).add(k.R.links.clone().multiplyScalar(Math.sin(a)));
        fuss = { r: stuetz.clone(), l: huefteL.add(bein.multiplyScalar(BEIN * 0.998)) };
        kpol = seiten(() => V(-1, 0, 0));
      } else {
        // oberes Bein liegt auf der Bank, unteres Bein hebt sich bis knapp unter die Bank (kurz: das Knie bleibt unter der Bankkante, bis 31.10.
        // ging es 4–5 cm hindurch)
        const oben = art === 'copenhagen_lang' ? stuetz.clone() : stuetz.clone().add(b.richt.clone().multiplyScalar(-0.43));
        const unten = art === 'copenhagen_lang' ? mv(V(0, 0.09, 0.84), V(0, 0.36, 0.84), t) : mv(V(0, 0.09, 0.9), V(0, 0.3, 0.86), t);
        fuss = { l: oben, r: unten };
      }
      return { pose: { becken: b.becken, rumpf: b.r, hand: { l: handL, r: handR }, ellbogenPol: { l: V(0.45, 1, 0), r: V(0.3, -1, 0) }, fuss, kniePol: kpol,
        fussRicht: seiten(() => art === 'knie' ? V(0, 0, 1) : V(-1, 0, 0.2)) } };
    },
    blick: V(0, 0.4, 0.1), abstand: 3.4, kameraRicht: V(-1, 0.5, 0.35), dauer: art === 'knie' ? STATISCH : undefined
  };
}

const AR_ANKER = V(0.76, 1.16, 0.3);   // Außenrotation: Ansatz auf Ellbogenhöhe und weit genug vorn, das Band läuft gerade und frei am Bauch vorbei (bis 5.11. knickte es dort, Ansatz 16 cm zu tief)
// Handtuch: heller Stoff
const handtuchStoff = () => new THREE.MeshStandardMaterial({ color: 0xd9d5cb, roughness: 0.95 });
// Hintere Schulter & Rotatoren: art: reverse_butterfly | pull_apart | kabel_reverse_fly | aussenrotation | yt_bauchlage ; last: kabel (aussenrotation am Kabelturm statt Band)
export function schulterzug(o = {}) {
  const art = o.art || 'reverse_butterfly';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'reverse_butterfly') butterflyBauen(ger, z, V(0, 0.56, -0.12), { neigung: 6 }, -1);
      if (art === 'pull_apart') z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand);
      if (art === 'kabel_reverse_fly') { r3_setze(z, r3_turm(ger, V(-0.85, 1.45, 0.5), V(-1, 0, 0), V(0.5, 0.35, 1), 'KABELZUG', 'SCHULTERN'), r3_turm(ger, V(0.85, 1.45, 0.5), V(1, 0, 0), V(0.5, 0.35, 1), 'KABELZUG', 'SCHULTERN')); z.seil_l = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.seil_r = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); }   // R3: zwei DK-Kabeltürme (Öse jeweils auf der Seite der Hand, Seile kreuzen vorn)
      if (art === 'aussenrotation' && o.last === 'kabel') { r3_setze(z, r3_turm(ger, AR_ANKER.clone(), V(1, 0, 0), V(0.5, 0.35, 1), 'KABELZUG', 'SCHULTERN')); z.band = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff = ger.griff(); }   // R3: DK-Kabelturm seitlich, Öse = Ansatz des Bands
      else if (art === 'aussenrotation') { ger.box(0.08, 1.3, 0.08, V(0.8, 0.65, AR_ANKER.z), ger.mRahmen); z.band = ger.stab(V(), V(0, 1, 0), 0.014, ger.mBand); }
      // Zusammengerolltes Handtuch zwischen Oberarm und Rippen auf Ellbogenhöhe
      if (art === 'aussenrotation') { const rolle = ger.teil(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 18), handtuchStoff(), V(-0.16, 1.2, 0.075)); rolle.rotation.x = Math.PI / 2; }
      if (art === 'yt_bauchlage') { ger.matte(); ger.teil(rundGeo(0.26, 0.05, 0.2, 0.02, 3), handtuchStoff(), V(0, 0.03, -0.5)); }   // Handtuch unter der Stirn
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      if (art === 'yt_bauchlage') {
        const becken = V(0, 0.16, 0.25), r = { basis: BAUCHLAGE, neigung: -6 };   // breite Brust liegt auf, nicht im Boden
        const k = rumpf(becken, r);
        // Erst heben als Y (Hochpunkt t = 0,2), dann senken, dicht über der Matte zum T schwenken (ruhig, bis 5.11. sprang die Hand dabei 27 cm) und als T heben (Hochpunkt t = 0,8). Oben knapp über Schulterhöhe, Arme fast gestreckt
        const lift = Math.max(Math.sin(Math.PI * Math.min(1, t / 0.4)) ** 2, Math.sin(Math.PI * Math.max(0, (t - 0.6) / 0.4)) ** 2);
        const y = glatt((t - 0.28) / 0.44);  // 0 = Y, 1 = T
        const flaeche = {};
        const hand = seitenBauch((s, sg) => {
          const dY = V(sg * 0.55, 0, -0.83), dT = V(sg, 0, 0.05);
          const d = mv(dY, dT, y).normalize().multiplyScalar(Math.cos(0.3)).add(V(0, mix(-0.2, 0.14, lift), 0)).normalize();
          const da = V(0, 1, 0).cross(d); flaeche[s] = s === 'r' ? da : da.clone().negate();   // Daumen oben
          return k.schulter[s].clone().add(d.multiplyScalar(ARM * 0.985));
        });
        // Fuß 55° gestreckt, die Zehen liegen auf der Matte (bis 5.11. in Verlängerung des Schienbeins, 89°)
        return { pose: { becken, rumpf: r, kopf: { neigung: 12 }, hand, handflaeche: flaeche, greift: seiten(() => true), ellbogenPol: seiten(() => V(0, 1, 0)), fuss: seitenBauch((s, sg) => V(sg * 0.1, FY, 0.27 + BEIN * 0.998))   /* Hüfte liegt 2 cm hinter dem Becken: Beine fast gestreckt, Knie bleibt über dem Boden */, kniePol: seiten(() => V(0, -1, 0)), fussRicht: seiten(() => V(0, -0.574, 0.819)), fussFlaeche: seiten(() => V(0, -0.819, -0.574)) } };
      }
      if (art === 'aussenrotation') {
        const becken = V(0, 0.975, 0), r = { neigung: 2 };
        const k = rumpf(becken, r);
        const ell = k.schulter.r.clone().add(V(-0.06, -0.283, 0.03));   // Handtuch dazwischen: der Oberarm steht 6 cm vom Körper
        const phi = mix(-55, 50, t) * RAD;
        // Der Unterarm dreht um die Achse des Oberarms (Ellbogen bleibt, Beugung bleibt 90°)
        const oa = ell.clone().sub(k.schulter.r).normalize(), b0 = V(0, 0, 1).addScaledVector(oa, -oa.z).normalize(), b1 = oa.clone().cross(b0), ua = b0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(b1, Math.sin(phi));
        const handR = genau(ell.clone().addScaledVector(ua, UNTERARM));
        // Daumen oben, Handfläche zur Körpermitte: der Unterarm bleibt neutral (bis 5.11. zeigte die Handfläche nach unten, der Unterarm war 114° verdreht)
        return { pose: Object.assign({ becken, rumpf: r, hand: { r: handR, l: becken.clone().add(V(0.17, 0.05, 0.06)) }, handflaeche: { r: oa.clone().negate().cross(ua) }, ellbogenPol: { r: ell.clone().sub(k.schulter.r.clone().lerp(handR, 0.5)), l: V(1, 0, -0.5) } }, stehFuesse(0.15)),
          props(g, z) { const weg = umDenKoerper(g, AR_ANKER, g.hand.r, 0.012, g.R.vor); bandKette(z, 'band', weg); if (z.dkTurm) z.dkTurm[0].zieh(r3_laenge(weg)); if (z.griff) { z.griff.position.copy(g.hand.r); z.griff.quaternion.setFromUnitVectors(V(1, 0, 0), V(0, 1, 0)); } } };
      }
      const sitzt = art === 'reverse_butterfly';
      const becken = sitzt ? V(0, 0.56, -0.12) : V(0, 0.975, 0);
      const r = { neigung: sitzt ? 6 : 2 };
      const k = rumpf(becken, r);
      const w = mix(art === 'kabel_reverse_fly' ? -24 : 8, 86, t) * RAD, kreuz = art === 'kabel_reverse_fly' ? Math.max(0, Math.min(1, -Math.sin(w) * 4)) : 0;   // Kabel: Arme kreuzen sich vorn (links vor rechts, 5 cm Abstand, damit sie nicht ineinander stecken)
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(w), -0.03 + sg * 0.06 * kreuz, Math.cos(w) + sg * 0.1 * kreuz).normalize().multiplyScalar(ARM * (art === 'pull_apart' || art === 'kabel_reverse_fly' ? 0.996 : 0.98))));   // Ellbogen leicht gebeugt (Band und Kabel: Arme fast gestreckt, bis 5.11. 27°)
      return { pose: Object.assign({ becken, rumpf: r, hand, handflaeche: sitzt ? seiten((s, sg) => V(-sg * Math.cos(w), 0, Math.sin(w))) : undefined, ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -0.2)) }, sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.35)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : stehFuesse(0.15)),
        props(g, z) {
          if (z.bf) butterflyStellen(z, g, t);
          if (z.band) bandKette(z, 'band', umDenKoerper(g, g.hand.l, g.hand.r, 0.012, g.R.vor));   // vor der Brust, nicht durch sie
          if (z.seil_l) { seil(z.seil_l, V(-0.85, 1.45, 0.5), g.hand.l); seil(z.seil_r, V(0.85, 1.45, 0.5), g.hand.r); if (z.dkTurm) { z.dkTurm[0].zieh(V(-0.85, 1.45, 0.5).distanceTo(g.hand.l)); z.dkTurm[1].zieh(V(0.85, 1.45, 0.5).distanceTo(g.hand.r)); } }
        } };
    },
    blick: V(0, 1.1, 0), abstand: 3.4, kameraRicht: art === 'yt_bauchlage' ? V(1, 0.7, 0.4) : V(0.5, 0.35, art === 'reverse_butterfly' ? -1 : 1), dauer: art === 'yt_bauchlage' ? [2.0, 0.3, 2.4, 0.4] : undefined
  };
}

// Sitzende Brustmaschinen: Becken, Rumpf 6° zurückgelehnt; Brustpresse: Griffe unten/oben, Drehachse der Hebel darüber (Kreisbogen)
const BM_BECKEN = V(0, 0.56, -0.14), BM_RUMPF = { neigung: -6 };
const bmSchulter = (sg) => rumpf(BM_BECKEN, BM_RUMPF).schulter[sg > 0 ? 'l' : 'r'];
// Griffe unten dicht an der Brust (4 cm vor der Brustfront; ACE: Griffe „nicht tiefer als die Vorderseite der Brust“), Ellbogen 118°, Oberarm 62° gehoben und 18° hinter der Körperebene; oben Ellbogen 12°, nicht durchgedrückt
// (bis 9.11. Griffe 37 cm vor der Schulter = 14 cm vor der Brustfront: die Figur ging nur etwa den halben Weg zur Brust, Devin 9.11.; bis 5.11. Griffe fast auf der Brust, Ellbogen 138°, der Arm am Rumpf)
const bmUnten = (sg) => bmSchulter(sg).add(V(sg * 0.13, -0.12, 0.28)), bmOben = (sg) => bmSchulter(sg).add(V(-sg * 0.06, -0.12, ARM * 0.968));
const BM_C = bogenMitte(bmUnten(1), bmOben(1), { y: 1.62 });
const BAND_PFOSTEN = V(0.9, 1.26, -0.85);   // Band-Brustdrücken: Ansatz des Bands (x je Seite) auf Handhöhe (Text: Brusthöhe), so weit außen und hinten, dass der Weg hinein frei bleibt
const BS_BECKEN = V(0, 0.912, -0.03), BS_RUMPF = { neigung: 8 };   // Drücken im Stand: Schrittstellung, vorderes Knie 18°, hinteres 8°, Ferse hinten gehoben (bis 5.11. beide Knie 4°)
// Brust an Maschine bzw. mit Band im Stand: art: presse | butterfly | band_stehend
// Neu: band_stehend + last kabel (zwei Kabeltürme hinter dem Körper)
export function brustmaschine(o = {}) {
  const art = o.art || 'presse', kabel = o.last === 'kabel';
  const sitzt = art !== 'band_stehend';
  return {
    aufbau(ger) {
      const z = {};
      if (art === 'presse') drueckmaschineBauen(ger, z, BM_BECKEN, BM_RUMPF, BM_C, 'senkrecht', { titel: 'BRUSTPRESSE', untertitel: 'BRUST', dir: 1, rN: 0.30, dth: 0.55 });   // dth 0,55: der Hebel dreht jetzt 29° (längerer Weg zur Brust, bis 9.11. 21°)
      else if (sitzt) butterflyBauen(ger, z, BM_BECKEN, BM_RUMPF, 1); else if (kabel) { r3_setze(z, r3_turm(ger, V(0.8, BAND_PFOSTEN.y, -0.72), V(0.7, 0, -0.7), V(0.9, 0.35, 0.8), 'KABELZUG', 'BRUST'), r3_turm(ger, V(-0.8, BAND_PFOSTEN.y, -0.72), V(-0.7, 0, -0.7), V(0.9, 0.35, 0.8), 'KABELZUG', 'BRUST')); z.band_l = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.band_r = ger.stab(V(), V(0, 1, 0), 0.004, ger.mKabel); z.griff_l = ger.griff(); z.griff_r = ger.griff(); }   // R3: zwei DK-Kabeltürme hinter dem Körper
      // Band: an zwei Pfosten hinter dem Körper (wie zwei Rack-Streben) knapp unter Brusthöhe, so läuft es unter den Armen nach vorn statt
      // durch Oberarm und Schulter (bis 31.10.: ein Pfosten in der Mitte, Band 5 cm im Oberarm)
      else { for (const sx of [-1, 1]) ger.box(0.06, 1.5, 0.06, V(sx * BAND_PFOSTEN.x, 0.75, BAND_PFOSTEN.z - 0.04), ger.mRahmen); z.band_l = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); z.band_r = ger.stab(V(), V(0, 1, 0), 0.013, ger.mBand); }
      if (z.dkTurm) r3_vorlauf(this, z);
      return z;
    },
    pose(t) {
      const becken = sitzt ? BM_BECKEN.clone() : BS_BECKEN.clone();
      const r = sitzt ? { ...BM_RUMPF } : { ...BS_RUMPF };
      const k = rumpf(becken, r);
      let hand, epol, handflaeche;
      if (art === 'butterfly') {
        // Bogen um die Schulter von 80° (Arme seitlich, nicht hinter der Rumpfebene) bis −13°: die Griffe treffen sich vor der Brust
        // (Devin 31.10.: „man geht nicht zusammen“; vorher endete der Bogen außerhalb der Schultern, Hände 63 cm auseinander)
        const w = mix(80, -13, t) * RAD;
        hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(w), -0.12, Math.cos(w)).normalize().multiplyScalar(ARM * 0.982)));   // Ellbogen leicht gebeugt
        epol = seiten((s, sg) => V(sg * 0.3, -1, -0.3));
        handflaeche = seiten((s, sg) => V(-sg * Math.cos(w), 0, Math.sin(w)));   // Handfläche zeigt in Zugrichtung (nach innen-vorn)
      } else if (sitzt) {
        // Brustpresse: Griffe laufen auf dem Bogen der Hebelarme von Brusthöhe neben dem Körper nach vorn (Arme gestreckt, nicht durchgedrückt)
        hand = seiten((s, sg) => bogenHand(bmUnten(sg), bmOben(sg), BM_C, t));
        // Ellbogen: unten 9 cm hinter der Schulter (Oberarm 62° gehoben, 18° hinter der Körperebene; bis 9.11. in der Körperebene), oben vorn 66°. Der Pol kommt aus der Lage des Ellbogens in jedem Bild, so bleibt der Oberarm auf dem ganzen Weg oben (bis 5.11. sackte er in der Mitte auf 46°)
        const E0 = (sg) => bmSchulter(sg).add(V(sg * 0.25, -0.145, -0.09)), E1 = (sg) => bmSchulter(sg).add(V(sg * 0.03, -0.11, 0.268));
        epol = seiten((s, sg) => E0(sg).lerp(E1(sg), t).sub(bmSchulter(sg).lerp(hand[s], 0.5))); handflaeche = seiten((s, sg) => V(-sg, 0, 0));
      } else {
        // Griffe waagerecht auf Brusthöhe. Unten Ellbogen 11 cm unter der Schulter (Oberarm 65° gehoben) und 20° hinter der Körperebene, Ellbogen 124°, Griffe 3 cm vor der Brustfront (ACE: Kabelpresse „bis die Griffe die Brust leicht berühren oder nah daran sind“; bis 9.11. 5° hinter der Körperebene,
        // Griffe 10 cm vor der Brustfront, nur etwa der halbe Weg, Devin 9.11.; bis 5.11. hing der Ellbogen 23 cm unter der Schulter, wie am Ende eines Curls). Oben Ellbogen 10°, am Kabel laufen die Griffe vor der Brust zusammen (0,4×, Text), mit Band nach vorn
        const u0 = (sg) => k.R.oben.clone().multiplyScalar(-Math.cos(65 * RAD)).addScaledVector(k.R.links, sg * Math.sin(65 * RAD) * Math.cos(20 * RAD)).addScaledVector(k.R.vor, -Math.sin(65 * RAD) * Math.sin(20 * RAD));
        const E0 = (s, sg) => k.schulter[s].clone().addScaledVector(u0(sg), MASS.oberarm);
        const H0 = (s, sg) => { const e = E0(s, sg); return e.addScaledVector(V(-sg * 0.2, 0, 0.98).normalize(), UNTERARM); };
        const H1 = (s, sg) => { const S = k.schulter[s], y = H0(s, sg).y, x = sg * (kabel ? 0.08 : 0.145); return V(x, y, S.z + Math.sqrt((ARM * 0.996) ** 2 - (S.x - x) ** 2 - (S.y - y) ** 2)); };
        hand = seiten((s, sg) => genau(mv(H0(s, sg), H1(s, sg), t)));
        epol = seiten((s, sg) => E0(s, sg).sub(k.schulter[s].clone().lerp(H0(s, sg), 0.5)).normalize().lerp(V(sg * 0.8, -1, -0.5).normalize(), glatt(t)));
      }
      const fuesse = sitzt ? { fuss: seiten((s, sg) => V(sg * 0.22, FY, 0.36)), kniePol: seiten((s, sg) => V(sg * 0.2, 1, 1)) } : { fuss: { l: V(0.13, FY, 0.28), r: V(-0.13, 0.1104, -0.45) }, zehen: { l: 0, r: 20 }, kniePol: seiten((s, sg) => V(sg * 0.1, 0, 1)) };
      return { pose: Object.assign({ becken, rumpf: r, hand, handflaeche, ellbogenPol: epol }, fuesse),
        props(g, z) {
          if (z.dm) drueckmaschineStellen(z, g, t);
          if (z.bf) butterflyStellen(z, g, t);
          for (const [s, sg] of [['l', 1], ['r', -1]]) {
            if (z['band_' + s]) { const weg = umDenKoerper(g, kabel ? V(sg * 0.8, BAND_PFOSTEN.y, -0.72) : BAND_PFOSTEN.clone().setX(sg * BAND_PFOSTEN.x), g.hand[s], 0.012, g.R.links.clone().multiplyScalar(sg).addScaledVector(g.R.oben, 0.5).normalize()); bandKette(z, 'band_' + s, weg); if (z.dkTurm) z.dkTurm[sg > 0 ? 0 : 1].zieh(r3_laenge(weg)); }
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
// Neu (G10-N2): hampelmann | hohe_knie (Cardio ohne Gerät, eigene Funktion sprungCardio); hohe_knie hat die Option tempo: marsch (Standard) | lauf
export function sprung(o = {}) {
  const art = o.art || 'kniebeuge';
  if (art === 'hampelmann' || art === 'hohe_knie') return sprungCardio(art, o);
  const BOX = 0.5, BOXZ = 0.56;   // Kasten so weit vorn, dass die Knie in der Ausholbewegung frei sind
  const fx = art === 'box' ? 0.14 : 0.21;   // Sprungkniebeuge: Füße schulterbreit (bis 5.11. 0,61×)
  const hTief = art === 'box' ? 0.56 : 0.625, nTief = art === 'box' ? 32 : 24;   // Sprungkniebeuge: halbe Kniebeuge, Knie etwa 85°, Rumpf etwa 25° (bis 5.11. Knie 100°, Rumpf 38°)
  return {
    aufbau(ger) { if (art === 'box') ger.box(0.6, BOX, 0.45, V(0, BOX / 2, BOXZ), ger.mPolster); return {}; },
    pose(t, zst) {
      if (art === 'ausfallschritt') {
        // t = 0: links vorn unten, t = 1: rechts vorn unten. Die Füße stehen, bis die Beine gestreckt sind (t = 0,28), wechseln in der Luft und landen ab t = 0,72; so rutscht nichts am Boden
        const q = Math.max(0, Math.min(1, (t - 0.28) / 0.44)), w = glatt(q), luft = Math.sin(Math.PI * q), hoch = Math.sin(Math.PI * t) ** 2;
        const gl = mix(0, 45, w), gr = mix(45, 0, w);
        const fuss = { l: V(0.12, zehenHoehe(gl) + luft * 0.16, mix(0.36, -0.42, w)), r: V(-0.12, zehenHoehe(gr) + luft * 0.16, mix(-0.42, 0.36, w)) };
        const becken = V(0, 0.565 + hoch * 0.46, mix(-0.04, 0.0, hoch));
        const r = { neigung: 6 };
        const k = rumpf(becken, r);
        // Arme eng am Körper, Ellbogen 90°, schwingen gegengleich zu den Beinen wie beim Laufen (bis 5.11. weit abgespreizt, und der Arm ging mit dem Bein derselben Seite vor)
        const pw = glatt(t);
        const hand = seiten((s, sg) => { const f = mix(s === 'l' ? -35 : 35, s === 'l' ? 35 : -35, pw) * RAD; return k.schulter[s].clone().add(V(-sg * 0.02, -Math.cos(f) * MASS.oberarm + Math.sin(f) * UNTERARM, Math.sin(f) * MASS.oberarm + Math.cos(f) * UNTERARM)); });
        return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -1)), fuss,
          zehen: { l: gl, r: gr }, kniePol: { l: V(0.1, -mix(0, 0.7, w), 1), r: V(-0.1, -mix(0.7, 0, w), 1) } } };
      }
      // kniebeuge und box: Absprung aus der halben Kniebeuge, Arme schwingen von hinten nach oben
      let fussZ = 0, fussY = FY, luft = 0, hRel;
      if (art === 'box') {
        // hoch: aus dem Stand ausholen (bis t = 0,14 in die halbe Kniebeuge), strecken und abspringen; runter: vom Kasten zurücksteigen,
        // unten wieder im Stand (wie der Anfang, sonst springt die Figur nach dem Zurücksteigen in die Hocke)
        const p = zst && zst.runter ? t : glatt((t - 0.3) / 0.5);
        // hoch: Füße steigen erst über die Kastenkante, dann nach vorn auf den Kasten (sonst fliegen die Zehen in die Kante)
        if (zst && zst.runter) { fussZ = mix(0, BOXZ - 0.02, p); fussY = FY + BOX * p; }
        else { fussZ = mix(0, BOXZ - 0.02, glatt((p - 0.2) / 0.8)); fussY = FY + BOX * glatt(p / 0.5) + 0.12 * Math.sin(Math.PI * p); }
        const ausholen = t < 0.14 ? glatt(t / 0.14) : 1 - glatt((t - 0.14) / 0.16);
        hRel = zst && zst.runter ? 0.9 : 0.9 - 0.34 * ausholen - 0.24 * Math.sin(Math.PI * p);
      } else {
        luft = 0.2 * glatt((t - 0.72) / 0.28);
        fussY = FY + luft;
        hRel = mix(hTief, 0.9, glatt(Math.min(1, t / 0.72)));
      }
      const becken = V(0, fussY - FY + 0.085 + hRel, fussZ - 0.1 * (0.9 - hRel) / 0.34);
      const r = { neigung: 6 + nTief * (0.9 - hRel) / 0.34 };
      const k = rumpf(becken, r);
      // Arme: Box aus dem Hängen nach hinten ausholen, dann nach vorn oben (unten wieder hängend); sonst von hinten nach oben
      const w = (art === 'box' ? (t < 0.14 ? mix(0, -45, glatt(t / 0.14)) : mix(-45, 150, glatt((t - 0.14) / 0.86))) : mix(-45, 150, glatt(t))) * RAD;
      const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * 0.06, -Math.cos(w), Math.sin(w) * 0.8).normalize().multiplyScalar(ARM * (art === 'box' ? 0.95 : mix(0.95, 0.996, glatt((t - 0.45) / 0.45))))));   // Sprungkniebeuge: in der Luft Arme gestreckt (bis 5.11. 32–41°)
      const spitz = art === 'box' ? 0 : mix(0, 35, glatt((t - 0.6) / 0.4));
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.4, 0, -1)), fuss: seiten((s, sg) => V(sg * fx, fussY, fussZ)),
        zehen: seiten(() => spitz), kniePol: seiten((s, sg) => V(sg * 0.3, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.25, 0, 1)) } };
    },
    blick: V(0, 0.9, 0.2), abstand: 3.8, kameraRicht: V(1, 0.3, 0.45),
    dauer: art === 'ausfallschritt' ? [0.55, 0.3, 0.55, 0.3] : art === 'box' ? [1.3, 0.6, 1.4, 0.4] : [0.65, 0.25, 0.9, 0.35]
  };
}

// Vierfüßlerstand (Kopf nach -z, Knie unter der Hüfte, Arme lang unter den Schultern): art fire_hydrant | donkey_kick (rechtes Bein arbeitet) | baer (Knie schweben knapp über dem Boden)
export function vierfuessler(o = {}) {
  const art = o.art || 'fire_hydrant';
  return {
    aufbau(ger) { ger.matte(); return {}; },
    pose(t) {
      const baer = art === 'baer', atmen = 0.5 - 0.5 * Math.cos(t * Math.PI);
      // Arme gestreckt: Die Schulter steht so hoch über der Hand, wie der Arm lang ist, der Rumpf steigt dafür zum Kopf leicht an (bis 5.11. waagerecht, Ellbogen 41–58° wie im halben Liegestütz)
      const bY = 0.53 + (baer ? 0.035 : 0), r = { basis: BAUCHLAGE, neigung: -Math.asin((0.045 + STUETZ * 0.9975 - bY) / (MASS.rumpf - 0.03)) / RAD };
      const becken = V(0, bY, -0.3), k = rumpf(becken, r);
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      const hand = seiten((s, sg) => V(0, 0.045, k.schulter[s].z).add(L(sg, MASS.schulterBreite)));
      const knieBoden = (sg) => V(0, baer ? 0.1 + 0.01 * atmen : 0.065, -0.3).add(L(sg, 0.1));
      const huefteR = becken.clone().add(L(-1, MASS.hueftBreite)).add(V(0, -0.02, 0)), aussenR = L(-1, 1);
      let fuss = seiten((s, sg) => knieBoden(sg).add(V(0, baer ? -0.02 : 0.04, MASS.unterschenkel * 0.96)));
      let kpol = seiten(() => V(0, -1, -0.2)), fussRicht = seiten(() => V(0, baer ? -1 : -0.2, baer ? -0.3 : 1)), zehen;   // Bär: Zehen untergeschlagen (zeigen zum Kopf)
      if (baer) zehen = seiten(() => 60);
      // Arbeitsfuß: am Boden auf dem Spann wie der andere, in der Luft locker (bis 5.11. blieb er lang gestreckt bzw. zeigte zum Kopf)
      const fussLuft = (schien, vorn, u) => { const w = mix(11.3, 62, glatt(u)) * RAD; return schien.clone().normalize().multiplyScalar(Math.cos(w)).addScaledVector(vorn, Math.sin(w)); };
      if (art === 'fire_hydrant') {
        // Knie bleibt 90° gebeugt und hebt sich seitlich auf 52° (mehr schafft kaum jemand bei stillem Becken, bis 5.11. 70°)
        const a = mix(0, 52, t) * RAD;
        const seitlich = aussenR.clone().multiplyScalar(Math.sin(a)).add(V(0, -Math.cos(a), 0));
        const kn = huefteR.clone().add(seitlich.clone().multiplyScalar(MASS.oberschenkel)), schien = V(0, 0.03, MASS.unterschenkel * 0.96);
        fuss.r = kn.clone().add(schien).add(V(0, mix(fuss.l.y - huefteR.y + MASS.oberschenkel - schien.y, 0, glatt(t / 0.3)), 0));   // am Boden auf gleicher Höhe wie der andere Fuß
        kpol.r = seitlich.clone().add(V(0, 0, -0.15));
        fussRicht.r = fussLuft(schien, seitlich, (52 * t - 15) / 30);
      }
      if (art === 'donkey_kick') {
        // Knie bleibt 90° gebeugt, Fußsohle drückt Richtung Decke, bis der Oberschenkel waagerecht ist
        const b = mix(0, 90, t) * RAD;
        const ober = V(0, -Math.cos(b), Math.sin(b)), unter = V(0, Math.sin(b), Math.cos(b));
        const kn = huefteR.clone().add(ober.clone().multiplyScalar(MASS.oberschenkel));
        fuss.r = kn.clone().add(unter.clone().multiplyScalar(MASS.unterschenkel * 0.97)).add(V(0, mix(fuss.l.y - huefteR.y + MASS.oberschenkel, 0, glatt(t / 0.3)), 0));   // am Boden auf gleicher Höhe wie der andere Fuß
        kpol.r = ober.clone().sub(unter);
        fussRicht.r = fussLuft(unter, ober, t / 0.35);
      }
      return { pose: { becken, rumpf: r, kopf: { neigung: 3 }, hand, ellbogenPol: seiten(() => V(0, 1, 0.2)), fuss, kniePol: kpol, fussRicht, zehen } };
    },
    blick: V(0, 0.35, -0.3), abstand: 3.2, kameraRicht: art === 'fire_hydrant' ? V(-0.5, 0.4, 1) : V(-1, 0.35, 0.35), dauer: art === 'baer' ? STATISCH : undefined
  };
}

const RH_BECKEN = V(0, 1.09, 0.22);   // hohe Bank: die gestreckten Beine hängen unten frei (Hüfte 82°, Fußspitzen rund 10 cm über dem Boden)
// Bauchlage auf einer hohen Bank: art reverse_hyper (Hüfte an der Bankkante, gestreckte Beine von unten nach hinten-oben)
export function bauchbank(o = {}) {
  return {
    aufbau(ger) { const z = {}; reverseHyperBauen(ger, z, RH_BECKEN, rumpf(RH_BECKEN, { basis: BAUCHLAGE, neigung: 0 }).schulter.l.z - 0.3); return z; },
    pose(t) {
      const becken = RH_BECKEN.clone(), r = { basis: BAUCHLAGE, neigung: 0 };
      const k = rumpf(becken, r), RB = rumpfRahmen(r);
      const L = (sg, f) => k.R.links.clone().multiplyScalar(sg * f);
      // Ohne Gewicht, wie im Text: gestreckte Beine aus der Hüfte (82° gebeugt) nach hinten-oben bis zur Linie mit dem Oberkörper, nicht darüber. Die Hände halten die Griffe vorn an der Bank
      const bein = seiten((s) => beinAus(hueftGelenk(becken, RB, s), mix(82, 0, t), 7, V(0, 0, 1), V(0, -1, 0)));
      return { pose: { becken, rumpf: r, kopf: { neigung: 5 }, hand: seiten((s, sg) => V(0, becken.y - 0.23, k.schulter[s].z - 0.3).add(L(sg, 0.27))), ellbogenPol: seiten((s, sg) => L(sg, 1).add(V(0, 0.3, 0.6))),
        fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: seiten((s) => bein[s].fr(25)) } };
    },
    blick: V(0, 0.8, 0.2), abstand: 3.4, kameraRicht: V(1, 0.3, 0.35), dauer: [1.2, 0.8, 2.0, 0.4]
  };
}

/* =================================================================== */
/* G10-N2 (09.11.2026): Rückenlage ohne Gerät (Reha) und Cardio ohne Gerät  */
/* =================================================================== */

// Bein in der Längsebene als Winkel: Der Knöchel liegt D vor der Hüfte (+z) und h über (+) oder unter (−) ihr, das Knie zeigt nach oben.
// Ergebnis für beinAus: Hüftwinkel a (Oberschenkel über der Waagerechten) und Kniebeugung k, beide in Grad. So sind Knie und Hüfte genau die Zahlen, die im Text stehen
function liegeBeinZiel(D, h) {
  const L1 = MASS.oberschenkel, L2 = MASS.unterschenkel, d = Math.min(Math.hypot(D, h), (L1 + L2) * 0.999);
  const alpha = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)), knie = Math.PI - Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
  return { a: (Math.atan2(h, D) + alpha) / RAD, k: knie / RAD };
}
// Rückenlage auf der Matte, das linke Bein (zur Kamera hin) arbeitet, eine Wiederholung = hin, halten, zurück, kurze Pause (dauer).
// fersenrutschen: Ferse gleitet am Boden zum Po, Knie bis genau 90° (nach einer OP ist die Beugung anfangs oft darauf begrenzt, mehr zeigt die App nie).
// beinheben_einbeinig: das andere Bein steht aufgestellt, das gestreckte Bein hebt bis die Oberschenkel auf gleicher Höhe liegen (Lende bleibt flach, Knie bleibt gestreckt)
function rumpfLiegend(art) {
  const fersen = art === 'fersenrutschen', L1 = MASS.oberschenkel, L2 = MASS.unterschenkel;
  const becken = V(0, 0.12, 0.25), r = { basis: LIEGEND, neigung: 0 }, k0 = rumpf(becken, r), RB = rumpfRahmen(r);
  const huefte = (s) => hueftGelenk(becken, RB, s);
  const lang = (s) => beinAus(huefte(s), 0, 4, BEIN_AUS, BEIN_HOCH);   // gestreckt auf der Matte: Knöchel 9 cm hoch, die Ferse liegt auf
  const D0 = lang('l').fuss.z - huefte('l').z, h0 = lang('l').fuss.y - huefte('l').y;
  const stuetz = liegeBeinZiel(0.56, FY - becken.y);   // aufgestelltes Bein: Fuß flach, 56 cm vor der Hüfte (Hüfte rund 45°, Knie rund 100°)
  return {
    aufbau(ger) { ger.matte(); return {}; },
    pose(t) {
      const w = glatt(t), hand = seiten((s, sg) => armNeben(k0.schulter[s], sg)), bein = {};
      if (fersen) {
        // Der Knöchel gleitet auf gleicher Höhe zum Po; die Winkel folgen daraus. Ende: Knie 90° (Abstand Hüfte–Knöchel = Wurzel aus Oberschenkel² + Unterschenkel²)
        const D1 = Math.sqrt(L1 * L1 + L2 * L2 - h0 * h0), z = liegeBeinZiel(mix(D0, D1, w), h0);
        bein.l = beinAus(huefte('l'), z.a, z.k, BEIN_AUS, BEIN_HOCH); bein.r = lang('r');
      } else {
        bein.l = beinAus(huefte('l'), mix(0, stuetz.a, w), mix(4, 3, w), BEIN_AUS, BEIN_HOCH);
        bein.r = beinAus(huefte('r'), stuetz.a, stuetz.k, BEIN_AUS, BEIN_HOCH);
      }
      // Füße: liegend zeigen die Zehen leicht nach oben (der Boden begrenzt es), das gehobene Bein zieht die Fußspitze zum Körper (p < 0), das aufgestellte steht flach
      const fuss = { l: fersen ? V(0, 0.45, 0.89) : bein.l.fr(mix(60, -5, w)), r: fersen ? V(0, 0.45, 0.89) : V(-0.1, 0, 1) };
      return { pose: { becken, rumpf: r, hand, flach: seiten(() => V(0, 1, 0)), ellbogenPol: seiten((s, sg) => V(sg, 1, 0)), fuss: seiten((s) => bein[s].fuss), kniePol: seiten((s) => bein[s].pol), fussRicht: fuss } };
    },
    blick: V(0, 0.45, 0.1), abstand: 3.5, kameraRicht: V(1, 0.45, 0.3),
    dauer: fersen ? [2, 0.5, 2, 0.5] : [2, 1.5, 2, 0.5], gleichmaessig: true
  };
}

// Cardio ohne Gerät (Stand auf dem Boden). hampelmann: t = 0 Füße zusammen und Arme unten, t = 1 Füße weit auseinander und Arme über dem Kopf; dazwischen ein kleiner Sprung,
// die Landung ist weich (Knie 20°, auf dem Ballen). hohe_knie: t = 0 linkes Knie oben, t = 1 rechtes Knie oben (Spiegelbild), Arme gegengleich; tempo marsch (Standard, immer ein Fuß am Boden) | lauf (kurze Flugphase, schneller)
function sprungCardio(art, o) {
  const hampel = art === 'hampelmann', lauf = !hampel && o.tempo === 'lauf', L1 = MASS.oberschenkel, L2 = MASS.unterschenkel;
  const huefteHoch = (knie, dx) => Math.sqrt(L1 * L1 + L2 * L2 + 2 * L1 * L2 * Math.cos(knie * RAD) - dx * dx);   // Hüftgelenk über dem Knöchel bei dieser Kniebeugung und seitlichem Versatz
  const sinus = (u) => Math.sin(Math.PI * Math.max(0, Math.min(1, u)));
  return {
    aufbau() { return {}; },
    pose(t) {
      if (hampel) {
        // Flug von t = 0,2 bis 0,8 (rund 0,24 s bei 0,4 s je Richtung, 5,5 cm Höhe); der Knöchel bleibt dabei unter 0,2 m, sonst springt der Fuß (figur.js FUSS_LUFT). Arme starten etwas früher als die Beine
        const q = Math.max(0, Math.min(1, (t - 0.2) / 0.6)), luft = Math.sin(Math.PI * q), wb = glatt(q), wa = glatt(t / 0.9);
        const spur = mix(0.075, 0.38, wb), knie = mix(20, 6, luft), zeh = mix(12, 30, luft), ay = zehenHoehe(zeh) + 0.055 * luft;
        const becken = V(0, ay + huefteHoch(knie, Math.abs(spur - MASS.hueftBreite)) + 0.02, 0), r = { neigung: mix(6, 3, luft) }, k = rumpf(becken, r);
        // Arme gestreckt in der Körperebene: 5° (hängen) bis 185° (über dem Kopf, die Hände rund 30 cm auseinander)
        const aw = mix(5, 185, wa) * RAD, A = ARM * 0.996;
        const hand = seiten((s, sg) => k.schulter[s].clone().add(V(sg * Math.sin(aw) * A, -Math.cos(aw) * A, 0)));
        // Handflächen: hängend zum Körper, in der Waagerechten nach unten, oben nach vorn (der Oberarm dreht sich beim Heben nach außen); ohne Angabe klappte die Hand in der Waagerechten um (6 cm Sprung)
        const nachVorn = Math.max(0, Math.min(1, (aw / RAD - 90) / 90));
        const flaeche = seiten((s, sg) => (aw <= Math.PI / 2 ? V(-sg * Math.cos(aw), -Math.sin(aw), 0) : V(0, -1, 0).lerp(V(0, 0, 1), nachVorn)));
        return { pose: { becken, rumpf: r, hand, handflaeche: flaeche, ellbogenPol: seiten((s, sg) => V(sg * 0.3, 0, -1)), fuss: seiten((s, sg) => V(sg * spur, ay, 0)), zehen: seiten(() => zeh),
          kniePol: seiten((s, sg) => V(sg * mix(0.15, 0.6, wb), 0, 1)), fussRicht: seiten((s, sg) => V(sg * mix(0.12, 0.5, wb), 0, 1)) } };
      }
      // Hohe Knie: Das aufsetzende Bein sinkt in der ersten Hälfte, das andere steigt in der zweiten; in der Mitte stehen kurz beide am Boden (Lauf: beide kurz in der Luft)
      const pause = lauf ? 0.35 : 0.45, hebL = 1 - glatt(t / pause), hebR = glatt((t - (1 - pause)) / pause), pw = glatt(t);
      const flug = lauf ? 0.035 * sinus((t - 0.35) / 0.3) : 0, kS = 10 + 6 * Math.sin(Math.PI * t) ** 2;   // Standbein federt von 10° auf 16°
      const ay = FY + flug, becken = V(0, ay + huefteHoch(kS, 0.015) + 0.02, 0), r = { neigung: 3 }, k = rumpf(becken, r), RB = rumpfRahmen(r);
      const bein = (s, sg, heb) => {
        const hg = hueftGelenk(becken, RB, s), unten = V(sg * 0.11, ay, 0);
        // Ganz oben: Oberschenkel rund 88° nach vorn, Knie 95°, der Fuß hängt locker (Zehen nach unten). Der Knöchel läuft vom Boden dorthin, das Knie folgt aus den Beinlängen
        const oben = beinAus(hg, 88, 95, V(0, -1, 0), V(0, 0, 1));
        return { fuss: mv(unten, oben.fuss, heb), pol: V(sg * 0.1, 0.4, 1), fr: mv(V(sg * 0.1, 0, 1), oben.fr(45), heb).normalize() };
      };
      const b = { l: bein('l', 1, hebL), r: bein('r', -1, hebR) };
      // Arme im rechten Winkel, schwingen gegengleich zu den Beinen wie beim Laufen (rechtes Knie hoch: linker Arm vorn)
      const hand = seiten((s, sg) => { const f = mix(s === 'l' ? -35 : 35, s === 'l' ? 35 : -35, pw) * RAD; return k.schulter[s].clone().add(V(-sg * 0.02, -Math.cos(f) * MASS.oberarm + Math.sin(f) * UNTERARM, Math.sin(f) * MASS.oberarm + Math.cos(f) * UNTERARM)); });
      return { pose: { becken, rumpf: r, hand, ellbogenPol: seiten((s, sg) => V(sg * 0.2, -1, -1)), fuss: seiten((s) => b[s].fuss), kniePol: seiten((s) => b[s].pol), fussRicht: seiten((s) => b[s].fr) } };
    },
    blick: V(0, 0.9, 0.2), abstand: 3.8, kameraRicht: hampel ? V(0.5, 0.25, 1) : V(1, 0.3, 0.45),
    dauer: hampel ? [0.4, 0.1, 0.4, 0.1] : lauf ? [0.3, 0, 0.3, 0] : [0.5, 0, 0.5, 0], gleichmaessig: true
  };
}

/* G10-N1 BEGINN */
/* =================================================================== */
/* Dehnungen (Halteübungen) und Schulterpendeln (G10-N1, 9.11.2026)      */
/* =================================================================== */

// Eine Schleife 0 → 1 → 0 (t = 0 und t = 1 sind gleich): Ausatmen, die Dehnung gibt ein Stück nach, dann wieder ein Stück zurück
const dehnAtem = (t) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t);
// Wand nur als Fläche zur Figur hin (wie beim Wand-Liegestütz: von der anderen Seite sieht man durch sie hindurch auf Hände und Ellbogen), dazu ein Hauch Glas für die Rückseite
function dehnWand(ger, geo, pos) {
  const w = ger.teil(geo, ger.mRahmen, pos); w.rotation.y = Math.PI;
  const glas = ger.teil(geo, new THREE.MeshBasicMaterial({ color: 0x9aa4b2, transparent: true, opacity: 0.1, depthWrite: false }), pos);
  glas.castShadow = false; glas.receiveShadow = false; glas.userData.keinTeil = true;
}
// Offene Tür: Wand mit 80-cm-Öffnung (Fläche zur Figur hin bei z = zv), davor Zarge aus zwei Pfosten und Kopfbalken wie bei rudern tuerrahmen.
// Die Wand besteht aus drei getrennten Flächen (links, rechts, über der Tür): die Schutzhülle misst jedes Teil als Quader, eine Wand mit Loch gälte als volle Fläche quer durch die Figur
function tuerOffen(ger, zv) {
  dehnWand(ger, new THREE.PlaneGeometry(0.9, 2.5), V(-0.85, 1.25, zv));
  dehnWand(ger, new THREE.PlaneGeometry(0.9, 2.5), V(0.85, 1.25, zv));
  dehnWand(ger, new THREE.PlaneGeometry(0.8, 0.45), V(0, 2.275, zv));
  for (const sx of [-1, 1]) ger.box(0.06, 2.07, 0.1, V(sx * 0.43, 1.035, zv + 0.05), ger.mRahmen);   // Zarge hinter der Wandfläche (von vorn sichtbar), nichts steht vor der Wand
  ger.box(0.92, 0.06, 0.1, V(0, 2.08, zv + 0.05), ger.mRahmen);
}

// Hüftbeuger-Dehnung im halben Kniestand (Matte): das hintere (rechte) Knie liegt unter der Hüfte, der Oberschenkel steht bis 12° hinter der Senkrechten; vorn steht der linke Fuß, Oberschenkel waagerecht,
// Schienbein senkrecht (Knie 90° über dem Knöchel). Das Becken ist nach hinten gekippt, die Wirbelsäule gleicht aus: Brustkorb senkrecht, unterer Rücken flach. Hände an den Hüften
const HB_KNIE = V(-0.095, 0.075, -0.22), HB_EXT = 11.25;
function dehnHueftbeuger(t) {
  const e = dehnAtem(t), ext = mix(HB_EXT - 1.25, HB_EXT + 1.25, e) * RAD, kipp = mix(10, 13, e);
  const r = { neigung: -kipp }, w = { beuge: kipp }, RB = rumpfRahmen(r);
  const hueR = HB_KNIE.clone().add(V(0, Math.cos(ext), Math.sin(ext)).multiplyScalar(MASS.oberschenkel));
  const becken = hueR.clone().addScaledVector(RB.links, MASS.hueftBreite).addScaledVector(RB.oben, 0.02);
  // Der vordere Knöchel steht fest (er rutscht nicht auf der Matte): dort, wo das Schienbein senkrecht unter dem waagerechten Oberschenkel steht, wenn die Hüfte in der Mitte der Schleife ist
  const e0 = HB_EXT * RAD, vorn = V(0.095, HB_KNIE.y + MASS.oberschenkel * Math.cos(e0) - MASS.unterschenkel, HB_KNIE.z + MASS.oberschenkel * (Math.sin(e0) + 1));
  // Hinten liegt der Unterschenkel fast waagerecht auf der Matte (Fußrücken unten, wie beim Latzug im Halbkniestand)
  const hinten = HB_KNIE.clone().add(V(-0.005, Math.sin(3 * RAD), -Math.cos(3 * RAD)).multiplyScalar(MASS.unterschenkel * 0.998));
  const hand = seiten((s, sg) => hueftGelenk(becken, RB, s).add(V(sg * 0.075, 0.095, -0.03)));
  return { pose: { becken, rumpf: r, wirbel: w, kopf: { neigung: 0 }, hand, flach: seiten((s, sg) => V(sg, 0, 0.1)), ellbogenPol: seiten((s, sg) => V(sg, 0.1, -0.5)),
      fuss: { l: vorn, r: hinten }, kniePol: { l: V(0.05, 1, 0.9), r: V(0, -1, 0.3) }, fussRicht: { l: V(0.08, 0, 1), r: V(0, -0.3, -1) }, zehen: { l: 0, r: -60 } },
    props(g) { fingerStellen(g, () => V(0, -0.5, 0.85)); } };
}

// Brustdehnung am Türrahmen: der rechte Ellbogen liegt am Rahmen (Oberarm waagerecht, Unterarm senkrecht, flache Hand am Rahmen) und bleibt dort; die Schulter schiebt sich an ihm vorbei nach vorn
// (bis 3,5°) und der Brustkorb dreht sich bis 13° vom Arm weg. Der linke Arm hängt. Linker Fuß einen kleinen Schritt durch die Tür, rechter dahinter
const DB_ZT = 0.3;
function dehnBrustStellung(e) {
  const phi = mix(1, 3.5, e) * RAD, drop = 8 * RAD, r = { neigung: 8, drehung: mix(10, 13, e) };
  const E = V(-0.51, 1.36, DB_ZT - 0.085);   // Ellbogen: 8,5 cm vor der Wand (die Haut des Oberarms reicht rund 10 cm über die Knochenlinie hinaus) und bleibt dort; der Unterarm legt sich nach oben an die Wand
  const S = E.clone().add(V(Math.cos(phi) * Math.cos(drop), Math.sin(drop), Math.sin(phi) * Math.cos(drop)).multiplyScalar(MASS.oberarm));
  return { r, E, S, becken: S.clone().sub(rumpf(V(), r).schulter.r) };
}
function dehnBrust(t) {
  const { r, E, S, becken } = dehnBrustStellung(dehnAtem(t)), mitte = dehnBrustStellung(0.5).becken;
  const W = E.clone().add(V(0, 1, 0.204).normalize().multiplyScalar(MASS.unterarm * 0.9995));   // Handgelenk 3 cm vor der Wand: Unterarm fast senkrecht, oben 11° zur Wand hin
  return { pose: { becken, rumpf: r, kopf: { neigung: 0 }, hand: { r: W }, flach: { r: V(0, 0, -1) }, ellbogenPol: { r: E.clone().sub(S) },
      fuss: { l: V(mitte.x + 0.1, FY, mitte.z + 0.22), r: V(mitte.x - 0.1, FY, mitte.z - 0.2) }, kniePol: seiten((s, sg) => V(sg * 0.05, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.05, 0, 1)) },
    props(g) { fingerStellen(g, () => V(0, 1, 0.1)); } };
}

// Wadendehnung an der Wand: der Körper ist eine gerade Linie von der hinteren (rechten) Ferse, 23,6–24,4° aus der Senkrechten; die Hände liegen auf Brusthöhe an der Wand, die Arme sind leicht gebeugt.
// Das hintere Bein ist gestreckt, die Ferse bleibt am Boden und der Fuß zeigt nach vorn; das vordere Knie ist gebeugt
const DW_Z = 0.95;
function dehnWade(t) {
  const e = dehnAtem(t), a = mix(23.6, 24.4, e) * RAD, r = { neigung: a / RAD }, RB = rumpfRahmen(r);
  const hinten = V(-0.1, FY, -0.15), hueR = hinten.clone().add(V(0, Math.cos(a), Math.sin(a)).multiplyScalar(BEIN * 0.9993));
  const becken = hueR.clone().addScaledVector(RB.links, MASS.hueftBreite).addScaledVector(RB.oben, 0.02);
  return { pose: { becken, rumpf: r, kopf: { neigung: -14 }, hand: seiten((s, sg) => V(sg * 0.215, 1.28, DW_Z - 0.012)), flach: seiten(() => V(0, 0, -1)), ellbogenPol: seiten((s, sg) => V(sg * 0.5, -1, -0.7)),
      fuss: { l: V(0.1, FY, 0.5), r: hinten }, kniePol: seiten((s, sg) => V(sg * 0.05, 0, 1)), fussRicht: seiten((s, sg) => V(sg * 0.04, 0, 1)) },
    props(g) { fingerStellen(g, (s, sg) => V(sg * 0.25, 1, 0)); } };
}

// Dehnungen (Halteübungen; Schleife von 4 s mit Atem und kleinem Nachgeben, kein Wippen; wie lange gehalten wird, steht in den Daten). art: hueftbeuger (halber Kniestand auf der Matte, rechtes Knie hinten)
//   | brust_tuerrahmen (rechter Unterarm am Türrahmen, linker Fuß durch die Tür) | wade_wand (Hände an der Wand, rechtes Bein hinten gestreckt)
export function dehnung(o = {}) {
  const art = ['brust_tuerrahmen', 'wade_wand'].includes(o.art) ? o.art : 'hueftbeuger';
  const stellung = { hueftbeuger: dehnHueftbeuger, brust_tuerrahmen: dehnBrust, wade_wand: dehnWade }[art];
  // Kamera bei der Tür auf der Wandseite, an der die Figur steht (sie kommt im Ablauf von der Kameraseite herein: von der Gegenseite liefe sie durch die Wand)
  const ansicht = { hueftbeuger: [V(0, 0.55, 0), 3.0, V(-1, 0.25, 0.35)], brust_tuerrahmen: [V(0, 1.05, 0.2), 3.4, V(-1, 0.25, -0.2)], wade_wand: [V(0, 0.8, 0.4), 3.4, V(-1, 0.25, -0.3)] }[art];
  return {
    aufbau(ger) {
      if (art === 'hueftbeuger') ger.matte();
      else if (art === 'brust_tuerrahmen') tuerOffen(ger, DB_ZT);
      else dehnWand(ger, new THREE.PlaneGeometry(1.6, 2.4), V(0, 1.2, DW_Z));
      return {};
    },
    pose: stellung,
    blick: ansicht[0], abstand: ansicht[1], kameraRicht: ansicht[2],
    // Eine Schleife in 4 s, gleichmäßig (die Vorlage bremst selbst); der Atem folgt der Dehnung (nur ein Drittel des vollen Atemhubs, ruhig)
    dauer: [4, 0, 0, 0], gleichmaessig: true, belastung: (t) => 0.3 * dehnAtem(t)
  };
}

// Schulterpendeln (Codman): vorgebeugt am Tisch, die linke Hand stützt flach auf der Platte, der rechte Arm hängt locker und kreist (Ø 20 cm, ein Kreis in 2 s).
// Der Arm wird nicht geführt: das Becken wippt in kleinen Kreisen (Knie federn, Füße bleiben), die Hand folgt der Schulter mit Verzug wie ein Pendel (0,15 Umlauf)
export function pendeln(o = {}) {
  const TISCH = 0.75, TX = 0.4, TZ = 0.8;
  return {
    aufbau(ger) {
      // Tisch: Platte 90 × 60 cm, Oberkante 75 cm; er beginnt links von der pendelnden Hand
      ger.box(0.9, 0.04, 0.6, V(TX, TISCH - 0.02, TZ), ger.mRahmen);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ger.box(0.05, TISCH - 0.04, 0.05, V(TX + sx * 0.4, (TISCH - 0.04) / 2, TZ + sz * 0.25), ger.mRahmen);
      return {};
    },
    pose(t) {
      const w = 2 * Math.PI * t, r = { neigung: 62 };
      const becken = V(0, 0.955, -0.07).add(V(0.025 * Math.cos(w), 0, 0.025 * Math.sin(w)));
      const k = rumpf(becken, r), S = k.schulter.r, lag = w - 0.15 * 2 * Math.PI, R = 0.085, L = ARM * 0.995;
      const hand = { l: V(0.205, TISCH + 0.03, 0.72), r: V(S.x + R * Math.cos(lag), S.y - Math.sqrt(L * L - R * R), S.z + R * Math.sin(lag)) };
      return { pose: { becken, rumpf: r, kopf: { neigung: -25 }, hand, flach: { l: V(0, 1, 0) }, ellbogenPol: { l: V(0.6, -0.3, -0.7), r: V(0.3, 0, -1) },
          fuss: seiten((s, sg) => V(sg * 0.12, FY, 0)), kniePol: seiten((s, sg) => V(sg * 0.08, 0.1, 1)), fussRicht: seiten((s, sg) => V(sg * 0.2, 0, 1)) },
        props(g) { fingerStellen(g, (s, sg) => V(sg * 0.25, 0, 1)); } };
    },
    blick: V(0, 0.8, 0.35), abstand: 3.3, kameraRicht: V(-1, 0.3, 0.25),
    // Gleichmäßige Schleife ohne Halt: ein Kreis in 2 s
    dauer: [2, 0, 0, 0], gleichmaessig: true
  };
}
/* G10-N1 ENDE */

export const VORLAGEN = { kniebeuge, kreuzheben, ausfallschritt, hueftheben, wadenheben, beinmaschine, bankdruecken, liegestuetz, schulterdruecken, schulterheben, rudern, klimmzug, curl, trizeps, rumpfuebung, tragen, kabelstand, swing, kniestand, seitlage,
  einbeinkniebeuge, sonderkniebeuge, bandgang, beincurl, seitstuetz, schulterzug, brustmaschine, sprung, vierfuessler, bauchbank, dehnung, pendeln };
// Schulterdrücken und Schrägbank: Führung durch die Stange oben (gestreckt über dem Schultergelenk); flaches Bankdrücken: zwischen Brustpunkt
// und Lockout (Schrägbank mit 'mitte' führte die Stange beim Hinlegen weiter durch den Rücken)
for (const n of ['kniebeuge', 'ausfallschritt', 'hueftheben', 'wadenheben', 'bankdruecken', 'schulterdruecken', 'rudern', 'tragen']) VORLAGEN[n] = smithFuehren(VORLAGEN[n], n === 'bankdruecken' ? (o) => (o.neigung > 0 ? 'oben' : 'mitte') : n === 'schulterdruecken' ? 'oben' : null);

export function animation(eintrag) {
  const f = VORLAGEN[eintrag && eintrag.vorlage];
  if (!f) return null;
  const o = eintrag.optionen || {};
  const a = f(o);
  // Für jede Vorlage: eigenes Tempo (z. B. Pause unten) und eigene Kamerarichtung
  if (o.dauer) a.dauer = o.dauer;
  if (o.kamera) a.kameraRicht = V(o.kamera[0], o.kamera[1], o.kamera[2]);
  // Ablauf davor (einleitung.js): Stehplatz verschieben, weiter vorn oder hinten hinsetzen, Bogen im letzten Schritt
  if (o.standVersatz) a.standVersatz = V(...o.standVersatz);
  if (o.sitzVersatz) a.sitzVersatz = o.sitzVersatz;
  if (o.schrittExtra) a.schrittExtra = o.schrittExtra;
  if (o.einstiegVorgebeugt) a.einstiegVorgebeugt = true;
  if (o.ablaufBand) a.ablaufEigen = (h) => bandVomBoden(h, o.ablaufBand);
  genauUeberR0(a);
  fussAmBoden(a);
  a.schluessel = eintrag.vorlage + ':' + JSON.stringify(o);   // Schlüssel für gerechnete Hut-Lagen (figur.js HUT_TABELLE)
  return a;
}
// Geht das Ziel einer Hand in der Bewegung über R0 (Oberarm + Unterarm) hinweg, gilt es genau: figur.js streckt Arme mit Zielen knapp
// unter R0 ganz (Vorlagen ohne Hand), Ziele darüber nimmt sie genau – genau dort sprang die Faust um bis zu 10 cm und der Ellbogen
// ploppte (Latzug, Bankdrücken, Rudern, Brustpresse …; seit 31.10.). Die Vorlagen rechnen mit ARM bis zur Faust, also stimmt genau
// Kommt der Knöchel einer Seite in der Bewegung unter 20 cm (figur.js FUSS_LUFT, Fuß am Boden)? (G13, 9.11.) Nur dann dreht figur.js den Fuß beim Abheben weich vom Bodenfuß (Spann nach oben) zur Lage nach dem Schienbein;
// ein Fuß, der die ganze Zeit schwebt (Skater Squat, hinten), behält seine Lage. pose.fussBoden = { l, r }
function fussAmBoden(a) {
  const boden = { l: false, r: false };
  try {
    for (let i = 0; i <= 50; i++) {
      const e = a.pose(i / 50, {}), p = e && e.pose; if (!p) continue;
      const g = gelenke(p);
      for (const s of ['l', 'r']) if (g.knoechel[s].y <= 0.2) boden[s] = true;
    }
  } catch (err) { return; }
  const pose0 = a.pose;
  a.pose = function (t, z) { const e = pose0.call(this, t, z); if (e && e.pose) e.pose.fussBoden = boden; return e; };
}
function genauUeberR0(a) {
  const R0 = MASS.oberarm + MASS.unterarm, unter = { l: false, r: false }, ueber = { l: false, r: false };
  try {
    for (let i = 0; i <= 24; i++) {
      const e = a.pose(i / 24, {}), p = e && e.pose; if (!p || !p.hand) continue;
      const g = gelenke(p);
      for (const s of ['l', 'r']) {
        if (!p.hand[s] || (p.fest && p.fest[s])) continue;
        const d = p.hand[s].distanceTo(g.schulter[s]);
        if (d > R0 + 0.002) ueber[s] = true; else if (d > 0.46 && d < R0 - 0.002) unter[s] = true;
      }
    }
  } catch (e) { return; }
  const seitenGenau = ['l', 'r'].filter((s) => unter[s] && ueber[s]);
  if (!seitenGenau.length) return;
  const pose0 = a.pose;
  a.pose = function (t, z) {
    const e = pose0.call(this, t, z);
    if (e && e.pose && e.pose.hand) for (const s of seitenGenau) if (e.pose.hand[s]) { e.pose.hand[s] = e.pose.hand[s].clone(); e.pose.hand[s].genau = true; }
    return e;
  };
}
