// DK Coach — Ablauf vor jeder Übung (Devin, 29.10.: „geht er zu der Maschine hin und packt die und nimmt die raus und dann geht er
// in die Pose“). Die Figur läuft zum Gerät, hebt Hanteln vom Boden auf, setzt oder legt sich hin und greift zuletzt Stange oder Griffe.
// Danach beginnt die Übung bei tStart. Alles allgemein aus der Startpose der Vorlage, ohne eigene Angaben je Übung:
// stehen | sitzen | rueckenlage | bauchlage | seitlage | haengen (Klimmzug) | knien.
// Seit 30.10. weicht der Ablauf den Geräten aus: Alle Teile werden als Quader vermessen. Ist der gerade Weg verstellt, läuft die Figur
// über ein Bodenraster um das Gerät herum und kommt zuletzt gerade auf ihren Platz zu. Ist schon der Platz vor dem Gerät verstellt,
// rechnet der Ablauf andere Einstiege durch (seitlich hinsetzen und eindrehen, erst hinten absetzen und unter dem Polster durchrutschen,
// vorn vorbeugen und rückwärts unter das Polster steigen) und nimmt den, bei dem der Körper am wenigsten in Teile eintaucht.
import * as THREE from 'three';
import { gelenke, rumpfRahmen, wirbelRahmen, wirbelBogen, MASS, haltErkennen, hakenGriff, griffBei, KELCH_MASS } from './figur.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180, Y = V(0, 1, 0), FY = 0.08;
const ARM = () => MASS.oberarm + MASS.unterarm + MASS.griff;
const mix = (a, b, u) => a + (b - a) * u;
const glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const seiten = (f) => ({ l: f('l', 1), r: f('r', -1) });
const waag = (v) => { const w = V(v.x, 0, v.z); return w.lengthSq() > 1e-6 ? w.normalize() : V(0, 0, 1); };
const winkelVon = (v) => Math.atan2(v.x, v.z);
const drehY = (w) => new THREE.Quaternion().setFromAxisAngle(Y, w);
const kurz = (w) => Math.atan2(Math.sin(w), Math.cos(w));
const GENAU = () => ({ l: true, r: true, ablauf: true });   // ablauf: Hände und Körper stehen schon so, wie gelenke() sie gerechnet hat
const UM_Y = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI);
const DAUER = { gehen: 1.1, drehen: 0.35, aufheben: 0.7, setzen: 0.9, legen: 1.0, greifen: 0.8, eindrehen: 1.1, rutschen: 0.8 };   // Sekunden (gehen: je Meter)

/* ---------- Posen ---------- */
const kelchVersetzt = (k, d) => (k && k.lage ? Object.assign({}, k, { lage: Object.assign({}, k.lage, { C: k.lage.C.clone().add(d) }) }) : k);
// Vollständige Pose aus einer Vorlagen-Pose: alle Ziele so, wie gelenke() sie gelöst hat (Faust, Knöchel, Pole, Fußrichtung)
function vollstaendig(pose) {
  const g = gelenke(pose), p = { becken: g.becken.clone(), rumpf: { basis: g.RB.q.clone() }, wirbel: pose.wirbel || null, kopf: { neigung: (pose.kopf && pose.kopf.neigung) || 0 }, fest: GENAU() };
  const mitte = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  p.hand = seiten((s) => g.hand[s].clone());
  p.fuss = seiten((s) => g.knoechel[s].clone());
  // Pol = wohin Ellbogen/Knie aus der Linie ragen; bei gestrecktem Glied der Pol der Vorlage (sonst kippt es beim Mischen)
  const pol = (v, alt, ersatz) => (v.length() > 0.01 ? v : ((alt && alt.clone()) || ersatz.clone()));
  p.ellbogenPol = seiten((s) => { const v = g.ellbogenAchse[s].clone().cross((pose.kelch && pose.kelch[s] ? g.handgelenk[s] : g.handZiel[s]).clone().sub(g.schulter[s]).normalize()); return v.lengthSq() > 1e-6 ? v.normalize() : pol(g.ellbogen[s].clone().sub(mitte(g.schulter[s], g.handgelenk[s])), pose.ellbogenPol && pose.ellbogenPol[s], g.R.vor.clone().negate()); });
  p.kniePol = seiten((s) => pol(g.knie[s].clone().sub(mitte(g.huefte[s], g.knoechel[s])), pose.kniePol && pose.kniePol[s], g.R.vor));
  p.fussRicht = seiten((s) => g.zehe[s].clone().sub(g.ferse[s]));
  p.handflaeche = seiten((s) => g.handRuecken[s].clone().negate());
  p.zehen = Object.assign({}, pose.zehen || {});
  // Fläche unter dem Fuß (Box, schräge Platte) mitnehmen, sonst steht der Fuß im letzten Bild des Ablaufs anders als in der Übung
  // (bis 31.10. zeigten beim Pike auf der Box die Zehen 4–6 cm in die Box)
  p.fussFlaeche = seiten((s) => (pose.fussFlaeche && pose.fussFlaeche[s] ? pose.fussFlaeche[s].clone() : null));
  if (pose.schulterHub) p.schulterHub = pose.schulterHub;
  if (pose.schulterVor) p.schulterVor = pose.schulterVor;
  p.handKnick = Object.assign({}, pose.handKnick || {});
  p.kelchW = Object.assign({}, g.kelchW);
  // Hantel dort, wo gelenke() die Hände hingelegt hat (Arme über dem Kopf: die Schulter hebt sie mit)
  p.kelch = pose.kelch ? kelchVersetzt(pose.kelch, g.hand.l.clone().sub(pose.hand.l)) : null;
  p.haken = !!pose.haken;
  for (const s of ['l', 'r']) if (g.kelchW[s]) p.handKnick[s] = g.handKnick[s] / RAD;   // Kelchgriff: das Handgelenk folgt aus der Lage der Hand
  p.flach = seiten((s) => (g.flach[s] ? g.flach[s].clone() : null));
  p.greift = seiten((s) => !g.flach[s]);
  return { pose: p, g };
}
// Schulter- und Hüftgelenk einer Pose mit Rumpf nur aus basis (wie gelenke() sie setzt)
function wurzeln(p) {
  const RB = rumpfRahmen(p.rumpf), R = p.wirbel ? wirbelRahmen(RB, p.wirbel) : RB, brust = p.wirbel ? p.becken.clone().add(wirbelBogen(RB, p.wirbel, MASS.rumpf)) : p.becken.clone().addScaledVector(R.oben, MASS.rumpf);
  return { R, schulter: seiten((s, sg) => brust.clone().addScaledVector(R.links, sg * MASS.schulterBreite).addScaledVector(R.oben, -0.03)),
    huefte: seiten((s, sg) => p.becken.clone().addScaledVector(RB.links, sg * MASS.hueftBreite).addScaledVector(RB.oben, -0.02)) };
}
// Ziel (Hand bzw. Fuß) zwischen zwei Posen im Bogen um sein Gelenk: Richtung im Rahmen des Rumpfs auf der Kugel, Abstand linear. Auf
// gerader Linie ginge die Hand oft an der Schulter vorbei oder durch sie hindurch (Arm klappt ganz zusammen, Ellbogen schlägt um, z. B.
// beim Hinlegen oder beim Greifen der Klimmzugstange). Bleibt das Ziel in der Welt fast stehen (Hand am Griff, Fuß am Boden), gilt die
// gerade Linie
// Der Weg ist eine Drehung um eine feste Achse n (Rumpf-Rahmen: links, oben, vor). Ein Arm kommt dabei nie hintenherum (Devin, 2.11. zum Latzug: „greift von hinten nach vorne …
// nur vorne“; bis dahin ging die Hand auf dem kürzesten Weg bis 60 cm hinter den Rücken): läge der Weg hinter dem Körper oder liegen die Enden fast gegenüber, führt er als Kreis über vorn
function armWeg(eA, eB, sg, arm) {
  // hinter dem Körper: die Mitte des kürzesten Wegs liegt hinten und nicht weit außen (seitlich hoch und nach hinten, z. B. zur Stange auf dem Rücken, bleibt)
  const mitte = eA.clone().add(eB), ml = mitte.length() || 1, hinten = arm && ml > 1e-3 && eA.dot(eB) < 0.5 && mitte.z / ml < -0.25 && mitte.z / ml < -0.6 * Math.max(0, mitte.x * sg / ml);
  if (eA.dot(eB) > -0.9 && !hinten) {
    const n = eA.clone().cross(eB);
    return n.lengthSq() < 1e-10 ? { n: V(1, 0, 0), w: 0 } : { n: n.normalize(), w: Math.atan2(eA.clone().cross(eB).length(), eA.dot(eB)) };
  }
  const f = V(arm ? sg * 0.2 : 0, arm ? 0.5 * (eA.y + eB.y) : 0, 1).normalize(), n = f.clone().sub(eA).cross(eB.clone().sub(eA));
  if (n.lengthSq() < 1e-8) { const m = V(0, 0, 1).addScaledVector(eA, -eA.z); if (m.lengthSq() < 1e-4) m.set(0, 1, 0); return { n: eA.clone().cross(m).normalize(), w: Math.PI }; }
  n.normalize();
  const c = n.clone().multiplyScalar(n.dot(eA)), a = eA.clone().sub(c), b = eB.clone().sub(c);
  let w = Math.atan2(a.clone().cross(b).dot(n), a.dot(b)); if (w < 0) w += 2 * Math.PI;
  return { n, w };
}
const lokal = (v, R) => V(v.dot(R.links), v.dot(R.oben), v.dot(R.vor));
function imBogen(zA, zB, a, b, wu, x, s) {
  const gerade = zA.clone().lerp(zB, x), welt = zA.distanceTo(zB), anteil = Math.max(0, Math.min(1, (welt - 0.05) / 0.2));
  if (anteil <= 0) return gerade;
  const vA = lokal(zA.clone().sub(a[wu.n][s]), a.R), vB = lokal(zB.clone().sub(b[wu.n][s]), b.R), dA = vA.length(), dB = vB.length();
  if (dA < 1e-4 || dB < 1e-4) return gerade;
  const eA = vA.clone().divideScalar(dA), eB = vB.clone().divideScalar(dB), weg = armWeg(eA, eB, s === 'l' ? 1 : -1, wu.n === 'schulter');
  const e = eA.clone().applyAxisAngle(weg.n, weg.w * x);
  // Über den Kopf hinweg bleibt der Arm lang und beugt sich erst am Ende (ging der Abstand gleichmäßig zurück, klappte der Arm schon unterwegs zusammen und der Ellbogen stand hinter dem Rücken)
  let d = mix(dA, dB, x);
  if (wu.n === 'schulter' && weg.w > 2.2) d += Math.min(1, (weg.w - 2.2) / 0.8) * Math.sin(Math.PI * x) * Math.max(0, 0.58 - d);
  const R = wu.m.R;
  const bogen = wu.m[wu.n][s].clone().addScaledVector(R.links, e.x * d).addScaledVector(R.oben, e.y * d).addScaledVector(R.vor, e.z * d);
  bogen.y = Math.max(bogen.y, Math.min(zA.y, zB.y));   // nie tiefer als das tiefere Ende (sonst geht der Fuß beim Hinlegen in den Boden)
  return gerade.lerp(bogen, anteil);
}
// Pol des Ellbogens bzw. Handfläche zwischen zwei Posen (Devin, 2.11.: „nicht … komplett 360 Grad drehen“; als gerade Linie zwischen zwei Vektoren schlug der Oberarm im Ablauf bis 160° in einem Bild um):
// Der Vektor geht starr mit der Drehung des Arms mit (armWeg), was dann noch fehlt, ist eine Drehung um die Armachse, gleichmäßig über den Weg und auf der kürzeren Seite; steht das Ziel fast gegenüber, dort, wo der Ellbogen außen bleibt
function armVektor(vA, vB, zA, zB, a, b, m, x, s) {
  const sg = s === 'l' ? 1 : -1, oA = lokal(vA, a.R), oB = lokal(vB, b.R);
  const eA = lokal(zA.clone().sub(a.schulter[s]), a.R), eB = lokal(zB.clone().sub(b.schulter[s]), b.R);
  const lv = vA.clone().lerp(vB, x), gerade = lv.lengthSq() > 1e-8 ? lv : vB.clone();
  if (eA.lengthSq() < 1e-6 || eB.lengthSq() < 1e-6 || oA.lengthSq() < 1e-8 || oB.lengthSq() < 1e-8) return gerade;
  eA.normalize(); eB.normalize();
  const aA = oA.dot(eA), aB = oB.dot(eB), qA = oA.clone().addScaledVector(eA, -aA), qB = oB.clone().addScaledVector(eB, -aB), lA = qA.length(), lB = qB.length();
  if (lA < 0.03 * oA.length() || lB < 0.03 * oB.length()) return gerade;
  qA.divideScalar(lA); qB.divideScalar(lB);
  const weg = armWeg(eA, eB, sg, true), t = qA.clone().applyAxisAngle(weg.n, weg.w);
  let phi = Math.atan2(t.clone().cross(qB).dot(eB), t.dot(qB));
  if (Math.abs(phi) > 2.6) {   // fast gegenüber: in der Mitte möglichst außen
    const halb = (w) => qA.clone().applyAxisAngle(eA, w / 2).applyAxisAngle(weg.n, weg.w / 2).x * sg;
    const alt = phi > 0 ? phi - 2 * Math.PI : phi + 2 * Math.PI;
    if (halb(alt) > halb(phi)) phi = alt;
  }
  const e = eA.clone().applyAxisAngle(weg.n, weg.w * x), q = qA.clone().applyAxisAngle(eA, phi * x).applyAxisAngle(weg.n, weg.w * x);
  const v = q.multiplyScalar(mix(lA, lB, x)).addScaledVector(e, mix(aA, aB, x)), R = m.R;
  return V().addScaledVector(R.links, v.x).addScaledVector(R.oben, v.y).addScaledVector(R.vor, v.z);
}
// Drehung des Unterarms einer Pose (Winkel vom neutralen Handrücken zum Handrücken, um die Achse des Unterarms). Im Ablauf läuft nicht die Handfläche, sondern dieser Winkel von Pose zu Pose: er bleibt so in seinen Grenzen und schlägt nie um
const UNTERARM = new WeakMap();
const drehAus = (g, s) => { const a = g.handAchse[s], n = g.handRuecken[s], nn = g.ellbogenAchse[s].clone().multiplyScalar(s === 'l' ? 1 : -1); nn.addScaledVector(a, -nn.dot(a)); return Math.atan2(nn.clone().cross(n).dot(a), nn.dot(n)); };
function unterarmVon(p) {
  let t = UNTERARM.get(p);
  if (!t) { const g = gelenke(p); t = seiten((s) => drehAus(g, s)); UNTERARM.set(p, t); }
  return t;
}
// Lage der Hand in einer Pose (für den Weg in einen Griff an der Hantel)
const HANDLAGE = new WeakMap();
function handLage(p) {
  if (p.kelch) return p.kelch;
  let t = HANDLAGE.get(p);
  if (!t) { const g = gelenke(p); t = seiten((s) => ({ finger: g.handFinger[s].clone().normalize(), ruecken: g.handRuecken[s].clone().applyAxisAngle(g.handAchse[s].clone().cross(g.handRuecken[s]).normalize(), g.handKnick[s] || 0).normalize() })); HANDLAGE.set(p, t); }
  return t;
}
const rahmen = (f) => { const F = f.finger.clone().addScaledVector(f.ruecken, -f.finger.dot(f.ruecken)).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F, f.ruecken, F.clone().cross(f.ruecken))); };
// Zwischen zwei vollständigen Posen; hand: eigener Anteil für die Hände (sie greifen zuletzt); vorne: die Hantel in beiden Händen geht in der Mitte so weit vor dem Körper
function mische(A, B, u, hand = u, vorne = 0) {
  const lv = (a, b, x) => a.clone().lerp(b, x), ln = (a, b, x) => { const v = lv(a, b, x); return v.lengthSq() > 1e-8 ? v : b.clone(); };
  const p = {
    becken: lv(A.becken, B.becken, u), rumpf: { basis: A.rumpf.basis.clone().slerp(B.rumpf.basis, u) },
    kopf: { neigung: mix(A.kopf.neigung, B.kopf.neigung, u) }, fest: GENAU()
  };
  if (A.schulterHub || B.schulterHub) p.schulterHub = mix(A.schulterHub || 0, B.schulterHub || 0, u);   // Schultergürtel läuft mit, sonst springt er am Ende des Ablaufs in die Startpose
  if (A.schulterVor || B.schulterVor) p.schulterVor = mix(A.schulterVor || 0, B.schulterVor || 0, u);
  if (A.wirbel || B.wirbel) { const wa = A.wirbel || {}, wb = B.wirbel || {}; p.wirbel = { beuge: mix(wa.beuge || 0, wb.beuge || 0, u), seit: mix(wa.seit || 0, wb.seit || 0, u), dreh: mix(wa.dreh || 0, wb.dreh || 0, u) }; }
  const wA = wurzeln(A), wB = wurzeln(B), wM = wurzeln(p);
  p.hand = seiten((s) => imBogen(A.hand[s], B.hand[s], wA, wB, { n: 'schulter', m: wM }, hand, s));
  p.fuss = seiten((s) => imBogen(A.fuss[s], B.fuss[s], wA, wB, { n: 'huefte', m: wM }, u, s));
  for (const k of ['ellbogenPol', 'handflaeche']) p[k] = seiten((s) => armVektor(A[k][s], B[k][s], A.hand[s], B.hand[s], wA, wB, wM, hand, s));
  for (const k of ['kniePol', 'fussRicht']) p[k] = seiten((s) => ln(A[k][s], B[k][s], u));
  { const ua = unterarmVon(A), ub = unterarmVon(B); p.unterarm = seiten((s) => mix(ua[s], ub[s], hand)); }
  p.zehen = seiten((s) => mix(A.zehen[s] || 0, B.zehen[s] || 0, u));
  p.fussFlaeche = seiten((s) => ((u < 0.5 ? A : B).fussFlaeche || {})[s] || null);   // gilt ab der zweiten Hälfte (Fuß kommt dort an)
  p.handKnick = seiten((s) => mix(A.handKnick[s] || 0, B.handKnick[s] || 0, hand));
  p.kelchW = seiten((s) => { const a = (A.kelchW && A.kelchW[s]) || 0, b = (B.kelchW && B.kelchW[s]) || 0; return mix(a, b, b < 0 ? glatt((hand - 0.55) / 0.45) : hand); });   // über den Kopf: die Finger bleiben unter dem Kopf eingehakt, bis die Arme fast oben sind
  p.haken = !!(A.haken || B.haken);
  p.flach = seiten((s) => (hand < 0.5 ? A.flach[s] : B.flach[s]));
  p.greift = seiten((s) => (hand < 0.5 ? A.greift[s] : B.greift[s]));
  // Eine Hantel in beiden Händen (kelch): gerechnet wird die Hantel, die Hände halten sie über den ganzen Weg (Devin, 3.11.: das Aufheben sah nicht sauber aus; bis dahin liefen die Hände je für sich im Bogen um die Schulter, die Hantel hing dazwischen).
  // Erst unterwegs rollen die Hände unter den Kopf
  const la = A.kelch && A.kelch.lage, lb = B.kelch && B.kelch.lage;
  if (la && lb) {
    // Über den Kopf rollen die Hände, bevor die Hantel hinübergeht (im Griff liegt sie höher); beim Zurücklegen (vorne groß) erst, wenn der Rumpf fast liegt
    const z0 = lb.innen || !la.innen ? lb : la, ka = Math.abs(A.kelchW.l || 0), kb = Math.abs(B.kelchW.l || 0), k = ka === kb ? ka : mix(ka, kb, z0.innen ? (vorne > 0.3 ? glatt((hand - 0.5) / 0.5) : glatt((hand - 0.3) / 0.42)) : glatt((hand - 0.3) / 0.6));
    // Die Hantel läuft im Rahmen des Rumpfs (legt er sich zurück, bleibt sie vor ihm). Über den Kopf: erst vor dem Gesicht hoch, zuletzt nach hinten über den Kopf (bis dahin ging sie durch Brust und Kopf)
    const imRumpf = (W, C0, b0) => { const d = C0.clone().sub(b0); return { l: d.dot(W.R.links), o: d.dot(W.R.oben), v: d.dot(W.R.vor) }; };
    const bA = A.becken.clone().addScaledVector(wA.R.oben, MASS.rumpf), bB = B.becken.clone().addScaledVector(wB.R.oben, MASS.rumpf), bM = p.becken.clone().addScaledVector(wM.R.oben, MASS.rumpf), ra = imRumpf(wA, la.C, bA), rb = imRumpf(wB, lb.C, bB);
    const spaet = glatt((hand - 0.72) / 0.28), hochAnteil = z0.innen ? 0.94 * glatt(hand / 0.72) + 0.06 * spaet : hand, zurueck = z0.innen ? 0.2 * glatt((hand - 0.5) / 0.22) + 0.8 * spaet : hand;
    const C = bM.addScaledVector(wM.R.links, mix(ra.l, rb.l, hand)).addScaledVector(wM.R.oben, mix(ra.o, rb.o, hochAnteil)).addScaledVector(wM.R.vor, mix(ra.v, rb.v, zurueck) + vorne * Math.sin(Math.PI * hand));
    const U = k < 1 ? V(0, 1, 0).lerp(z0.U, k).normalize() : z0.U, gr = griffBei(k, C, U, z0.vor, z0.li, z0.innen, z0.schwer);
    p.hand = gr.hand; p.kelch = gr.kelch; p.kelchW = seiten(() => (z0.innen ? -k : k)); p.haken = true;
  } else if (A.kelch || B.kelch) {
    // Die Hand kommt zum Griff (oder löst sich von ihm): sie dreht gleichmäßig in die neue Lage
    const fa = handLage(A), fb = handLage(B), w = seiten((s) => p.kelchW[s]);
    p.kelch = seiten((s) => { const q = rahmen(fa[s]).slerp(rahmen(fb[s]), hand); return { finger: V(1, 0, 0).applyQuaternion(q), ruecken: V(0, 1, 0).applyQuaternion(q), innen: (B.kelch || A.kelch)[s].innen, w: w[s] }; });
  }
  return p;
}
// Ganze Pose um die Senkrechte durch m drehen (Eindrehen auf dem Sitz)
function drehePose(p, m, w) {
  const q = drehY(w), um = (v) => v.clone().sub(m).applyQuaternion(q).add(m), r = (v) => v.clone().applyQuaternion(q);
  const n = Object.assign({}, p, { becken: um(p.becken), rumpf: { basis: q.clone().multiply(p.rumpf.basis) } });
  n.hand = seiten((s) => um(p.hand[s])); n.fuss = seiten((s) => um(p.fuss[s]));
  for (const k of ['ellbogenPol', 'kniePol', 'fussRicht', 'handflaeche']) n[k] = seiten((s) => r(p[k][s]));
  n.flach = seiten((s) => (p.flach[s] ? r(p.flach[s]) : null));
  n.fussFlaeche = seiten((s) => (p.fussFlaeche && p.fussFlaeche[s] ? r(p.fussFlaeche[s]) : null));
  return n;
}
// Stehend (oder gehend: phase in Bogenmaß, 0 = Füße nebeneinander) an pos (Becken x/z), Blick in Richtung winkel (0 = +z);
// hoch = auf einer Box oder Stufe dieser Höhe
export function stehen(pos, winkel, o = {}) {
  const q = drehY(winkel), d = (x, y, z) => V(x, y, z).applyQuaternion(q).add(V(pos.x, o.hoch || 0, pos.z));
  const ph = o.phase || 0, schritt = o.schritt == null ? 0.2 : o.schritt, s1 = Math.sin(ph), c1 = Math.cos(ph);
  // geht = wie weit im Gehen (Schrittlänge 0…0,2): Fuß heben, Becken wippen und Arme schwingen laufen damit aus, das letzte Bild des
  // Gehens ist genau das Stehen (sonst ruckt der Fuß aus der Luft auf den Boden)
  const geht = o.phase != null ? Math.min(1, schritt / 0.2) : 0;
  const becken = d(0, 0.975 - geht * (0.01 - 0.012 * Math.cos(2 * ph)) - (o.tief || 0), 0);
  const p = { becken, rumpf: { basis: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (o.neigung || 2) * RAD)) }, kopf: { neigung: 0 }, fest: GENAU() };
  const R = rumpfRahmen(p.rumpf), brust = becken.clone().add(R.oben.clone().multiplyScalar(MASS.rumpf));
  const schulter = (sg) => brust.clone().add(R.links.clone().multiplyScalar(sg * MASS.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03));
  p.hand = o.hand || seiten((s, sg) => schulter(sg).add(V(0, -ARM() * 0.95, 0)).add(V(sg * 0.05, 0, -sg * 0.14 * s1 * geht).applyQuaternion(q)));
  p.fuss = seiten((s, sg) => d(sg * 0.11, FY + 0.07 * geht * Math.max(0, sg * c1), sg * schritt * s1));
  p.ellbogenPol = seiten((s, sg) => V(sg * 0.3, 0, -1).applyQuaternion(q));
  p.kniePol = seiten((s, sg) => V(sg * 0.1, 0, 1).applyQuaternion(q));
  p.fussRicht = seiten((s, sg) => V(sg * 0.15, 0, 1).applyQuaternion(q));
  p.handflaeche = seiten((s, sg) => V(-sg, 0, 0).applyQuaternion(q));
  p.zehen = {}; p.handKnick = {};
  p.flach = { l: null, r: null }; p.greift = GENAU();
  return p;
}
// Sitzend mit aufrechtem Rumpf: Becken bei m (Höhe aus m), Blick winkel, Füße am Boden vor = Abstand der Füße vor dem Becken
function sitzen(m, winkel, vor, kniePol = V(0, 1, 0.6)) {
  const q = drehY(winkel), p = stehen(m, winkel);
  p.becken = m.clone();
  p.fuss = seiten((s, sg) => m.clone().add(V(sg * 0.13, 0, vor).applyQuaternion(q)).setY(FY));
  p.kniePol = seiten((s, sg) => V(sg * 0.15, kniePol.y, kniePol.z).applyQuaternion(q));
  return p;
}
// Hände locker auf den Oberschenkeln (Sitzen, vor dem Greifen). Die Ellbogen hängen seitlich; stößt ein Arm so an ein Gerät (z. B. an das
// Armpolster der Seitheben-Maschine, bis 31.10. 4–5 cm), hängen sie enger am Körper bzw. nach hinten. QAKT: Geräte des laufenden Ablaufs
let QAKT = null;
const ELLBOGEN_POLE = [[1, -0.5, 0], [0.35, -1, -0.2], [0.1, -1, -0.6]];   // je [außen, vor, oben] im Rahmen des Rumpfs
function haendeAufBeinen(p) {
  const g = gelenke(p);
  const q = Object.assign({}, p);
  q.kelch = null;
  q.hand = seiten((s) => g.huefte[s].clone().lerp(g.knie[s], 0.55).add(g.R.oben.clone().multiplyScalar(0.07)).add(g.R.vor.clone().multiplyScalar(0.02)));
  q.handflaeche = seiten(() => g.R.oben.clone().negate());
  q.flach = { l: null, r: null };
  let best = null;
  for (const [a, v, o] of ELLBOGEN_POLE) {
    q.ellbogenPol = seiten((s, sg) => g.R.links.clone().multiplyScalar(sg * a).addScaledVector(g.R.vor, v).addScaledVector(g.R.oben, o));
    if (!QAKT || !QAKT.length) return q;
    const t = tiefen(gelenke(q), QAKT);
    let arm = 0; for (let k = 0; k < QAKT.length; k++) arm = Math.max(arm, t[NG * k + 2]);
    if (!best || arm < best.arm - 0.005) best = { arm, pol: q.ellbogenPol };
    if (arm < 0.01) break;
  }
  q.ellbogenPol = best.pol;
  return q;
}
// Mit Hanteln in den Händen (Sitzen): die Hantel steht senkrecht auf dem Oberschenkel nahe am Knie (wie vor dem Bankdrücken), die Faust
// eine halbe Hantel darüber; beide = eine Hantel für beide Hände steht zwischen den Oberschenkeln
function hantelnAufBeinen(p, beide = false, kelch = null) {
  const g = gelenke(p), q = Object.assign({}, p);
  q.kelch = null;
  const mitte = g.knie.l.clone().add(g.knie.r).add(g.huefte.l).add(g.huefte.r).multiplyScalar(0.25);
  q.hand = seiten((s, sg) => (beide ? mitte.clone().add(V(0, 0.32, 0)).addScaledVector(g.R.links, sg * 0.05) : g.huefte[s].clone().lerp(g.knie[s], 0.8).add(V(0, 0.3, 0))));
  q.handflaeche = seiten((s, sg) => g.R.links.clone().multiplyScalar(-sg));
  q.ellbogenPol = seiten((s, sg) => g.R.links.clone().multiplyScalar(sg).sub(g.R.vor.clone().multiplyScalar(0.5)));
  q.flach = { l: null, r: null }; q.greift = GENAU();
  if (beide && kelch) { const gr = hakenGriff(mitte.clone().add(V(0, 0.278, 0)).addScaledVector(g.R.vor, 0.1), V(0, 1, 0), g.R.vor, g.R.links, kelch.lage && kelch.lage.innen ? KELCH_MASS.innen.schwer : KELCH_MASS.schwer); q.hand = gr.hand; q.kelch = gr.kelch; q.kelchW = seiten(() => 0); q.haken = true; }
  return q;
}
// Hände seitlich neben dem Körper (Liegen, vor dem Greifen)
function haendeNeben(p) {
  const g = gelenke(p), q = Object.assign({}, p);
  q.kelch = null;
  q.hand = seiten((s, sg) => g.huefte[s].clone().add(g.R.links.clone().multiplyScalar(sg * 0.17)).add(g.R.oben.clone().multiplyScalar(0.08)));
  q.ellbogenPol = seiten((s, sg) => g.R.links.clone().multiplyScalar(sg));
  q.flach = { l: null, r: null };
  return q;
}
// Übergang von einer Pose zur nächsten (Schritt { ziel, d, verzug, bogen, heben, dreh }): verzug = Hände greifen später,
// bogen = Becken in der Mitte höher (negativ: tiefer, unter einem Polster durch), heben = Füße in der Mitte angehoben (über Rahmen und
// Stufen), dreh = { m, w }: um die Senkrechte durch m eindrehen (die Form mischt sich im Rahmen der Zielpose, die Drehung läuft im Bogen),
// aussen = Hände in der Mitte so weit seitlich vom Körper weg (Hanteln gehen außen an Oberschenkeln und Hüfte vorbei),
// steigen = { erst, bogen }: auf eine Box oder Stufe steigen: erst ein Fuß, dann der andere, jeder zuerst hoch (bogen über die höhere
// Lage), dann hinüber; das Becken kommt erst hoch, wenn der erste Fuß oben steht
function uebergang(von, s) {
  const verzug = s.verzug || 0, A = s.dreh ? drehePose(von, s.dreh.m, s.dreh.w) : von;
  return (u) => {
    const g = glatt(u), h = glatt((u - verzug) / (1 - verzug)), p = mische(A, s.ziel, g, h, s.vorne || 0);
    if (s.steigen) {
      const erst = s.steigen.erst || 'l';
      for (const [k, a, b] of [[erst, 0, 0.55], [erst === 'l' ? 'r' : 'l', 0.45, 1]]) {
        if (s.steigen.nur && s.steigen.nur !== k) continue;   // nur: der andere Fuß bleibt stehen bzw. liegen (Knie schon auf dem Polster)
        const v = Math.max(0, Math.min(1, (u - a) / (b - a))), P0 = A.fuss[k], P1 = s.ziel.fuss[k], oben = Math.max(P0.y, P1.y) + s.steigen.bogen;
        const f = P0.clone().lerp(P1, glatt((v - 0.15) / 0.75));
        f.y = v < 0.55 ? mix(P0.y, oben, glatt(v / 0.55)) : mix(oben, P1.y, glatt((v - 0.55) / 0.45));
        p.fuss[k] = f;
        // fussDreh (Vorlage, Bulgarian: vorn zeigen die Zehen nach vorn, auf der Bank nach hinten): der Fuß dreht mit dem Schritt in der Luft nach außen; die gerade
        // Mischung lief spät durch „Zehen nach unten“, und die Zehen fegten 4 cm durch das Polster (Befund 6.11.)
        { const ra = A.fussRicht[k], rb = s.ziel.fussRicht[k], wa = Math.atan2(ra.x, ra.z), wb = Math.atan2(rb.x, rb.z), nick = (r) => r.y / (Math.hypot(r.x, r.z) || 1);
          if (s.steigen.fussDreh) {
            const aussen = k === 'l' ? 1 : -1, e = glatt((v - 0.15) / 0.75); let dw = kurz(wb - wa); if (dw * aussen < 0) dw += aussen * 2 * Math.PI;
            const w = wa + dw * e; p.fussRicht[k] = V(Math.sin(w), mix(nick(ra), nick(rb), e), Math.cos(w));
          } }
      }
      if (!s.steigen.mitBecken) p.becken.y = mix(A.becken.y, s.ziel.becken.y, glatt((u - 0.3) / 0.6));   // mitBecken: das Becken hebt sich gleichmäßig (ein Knie liegt schon oben und muss erreichbar bleiben)
    }
    // halten = { K, K2, L, L2 }: ein Knie liegt auf dem Polster (bei K, wandert nach K2), das Becken bleibt mindestens L (→ L2) davon weg; auf
    // gerader Linie käme es unterwegs näher, und das Knie drückte ins Polster
    if (s.halten) { const H = s.halten, Kp = H.K.clone().lerp(H.K2 || H.K, g), L = mix(H.L, H.L2 == null ? H.L : H.L2, g), d = p.becken.clone().sub(Kp); if (d.length() < L) p.becken = Kp.add(d.setLength(L)); }
    if (s.bogen) p.becken.y += s.bogen * Math.sin(Math.PI * g);
    if (s.handHoch) p.hand = seiten((k) => p.hand[k].clone().add(V(0, s.handHoch * Math.sin(Math.PI * h), 0)));   // Vorlage: die Hand geht im Bogen über eine Kante
    if (s.aussen) { const R = rumpfRahmen(p.rumpf), w = s.aussen * Math.sin(Math.PI * h); p.hand = seiten((k, sg) => p.hand[k].clone().addScaledVector(R.links, sg * w)); }
    if (s.heben) { const hb = s.heben * Math.sin(Math.PI * Math.min(1, g / (s.hebenBis || 1))); for (const k of ['l', 'r']) p.fuss[k].y += hb; }
    return s.dreh ? drehePose(p, s.dreh.m, -s.dreh.w * (1 - g)) : p;
  };
}

/* ---------- Geräte als Hindernisse ---------- */
// Jedes sichtbare Teil als gedrehter Quader in Weltlage (aus der Hülle seiner Form), mit Grundriss (konvexe Hülle der Ecken) und Höhe;
// ohne die Hanteln, die die Figur aufhebt, und ohne flache Matten
function quader(ger, aus) {
  ger.gruppe.updateMatrixWorld(true);
  const liste = [];
  ger.gruppe.traverse((m) => {
    if (!m.isMesh || !m.visible || !m.geometry) return;
    for (let o = m; o; o = o.parent) if (aus.has(o)) return;
    const geo = m.geometry; if (!geo.boundingBox) geo.computeBoundingBox();
    const b = geo.boundingBox, e = m.matrixWorld.elements, gr = b.getSize(V());
    const ax = [V(e[0], e[1], e[2]), V(e[4], e[5], e[6]), V(e[8], e[9], e[10])];
    const h = [gr.x / 2 * ax[0].length(), gr.y / 2 * ax[1].length(), gr.z / 2 * ax[2].length()];
    if (!(h[0] + h[1] + h[2] > 0) || !h.every(Number.isFinite)) return;
    ax.forEach((a) => a.normalize());
    const c = b.getCenter(V()).applyMatrix4(m.matrixWorld), ecken = [];
    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) ecken.push(c.clone().addScaledVector(ax[0], i * h[0]).addScaledVector(ax[1], j * h[1]).addScaledVector(ax[2], k * h[2]));
    const ys = ecken.map((p) => p.y), top = Math.max(...ys), bot = Math.min(...ys);
    if (top < 0.03) return;
    liste.push({ c, ax, h, r: Math.hypot(h[0], h[1], h[2]), top, bot, grund: huelle(ecken) });
  });
  return liste;
}
// Konvexe Hülle im Grundriss (x, z), gegen den Uhrzeigersinn
function huelle(pkte) {
  const p = pkte.map((v) => [v.x, v.z]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const kreuz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const unten = [], oben = [];
  for (const q of p) { while (unten.length >= 2 && kreuz(unten[unten.length - 2], unten[unten.length - 1], q) <= 1e-12) unten.pop(); unten.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (oben.length >= 2 && kreuz(oben[oben.length - 2], oben[oben.length - 1], q) <= 1e-12) oben.pop(); oben.push(q); }
  return unten.slice(0, -1).concat(oben.slice(0, -1));
}
// Abstand eines Bodenpunkts zum Grundriss (innen negativ)
function abstand2(x, z, poly) {
  let innen = poly.length >= 3, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1e-12)));
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
    if (dx * (z - a[1]) - dz * (x - a[0]) < 0) innen = false;
  }
  return innen ? -best : best;
}
// Körper als Kapseln (Mittellinie, Radius, Gruppe 0 Becken und Bauch | 1 Brust, Schultern, Kopf | 2 Arme | 3 Beine);
// Füße dürfen auf flache Bodenteile (Rahmen, Platten)
const NG = 4, bauch = (g) => g.becken.clone().lerp(g.brust, 0.5);
// Maße an der echten Haut abgeglichen (huelle.js, 31.10.): Bauch steht 14–17 cm, Brust bis 24,5 cm vor der Linie Becken → Brust, der
// Rücken 11–12 cm dahinter, darum liegen die Rumpf-Kapseln etwas vor der Linie; Oberschenkel 10–12 cm, Schienbein 6 cm, Deltamuskel 7 cm
const vorn = (p, g, d) => p.clone().addScaledVector(g.R.vor, d);
const KAPSELN = [
  [(g) => [vorn(g.becken, g, 0.03), vorn(bauch(g), g, 0.04)], 0.14, 0], [(g) => [g.huefte.l, g.huefte.r], 0.09, 0], [(g) => [vorn(bauch(g), g, 0.05), vorn(g.brust, g, 0.06)], 0.175, 1], [(g) => [g.kopf, g.kopf], 0.11, 1],
  [(g) => [g.schulter.l, g.schulter.r], 0.07, 1],
  ...['l', 'r'].flatMap((s) => [[(g) => [g.schulter[s], g.ellbogen[s]], 0.06, 2], [(g) => [g.ellbogen[s], g.hand[s]], 0.045, 2],
    [(g) => [g.huefte[s], g.knie[s]], 0.095, 3], [(g) => [g.knie[s], g.knoechel[s]], 0.06, 3], [(g) => [g.ferse[s], g.zehe[s]], 0.04, 3, true]])
];
const _p = V();
// Wie tief eine Kugel (Mitte p, Radius r) in den Quader q eintaucht (negativ: so weit davor)
function tiefeIn(p, r, q) {
  const dx = p.x - q.c.x, dy = p.y - q.c.y, dz = p.z - q.c.z;
  if (dx * dx + dy * dy + dz * dz > (q.r + r) * (q.r + r)) return -1;
  let aussen = 0, innen = -Infinity;
  for (let a = 0; a < 3; a++) { const v = q.ax[a], l = Math.abs(dx * v.x + dy * v.y + dz * v.z) - q.h[a]; if (l > 0) aussen += l * l; if (l > innen) innen = l; }
  return r - (aussen > 0 ? Math.sqrt(aussen) : innen);
}
// Wie tief der Körper (Gelenke g) in jedes Teil eintaucht (m; je Teil und Gruppe das Maximum, Index NG·Teil + Gruppe).
// Getrennt nach Gruppen, damit z. B. Arme auf dem Armpolster nicht erlauben, dass die Beine hindurchgehen
function tiefen(g, Q) {
  const aus = new Float32Array(Q.length * NG);
  for (const [f, r, gr, fuss] of KAPSELN) {
    const [A, B] = f(g), n = Math.max(1, Math.ceil(A.distanceTo(B) / 0.05));
    for (let i = 0; i <= n; i++) {
      _p.copy(A).lerp(B, i / n);
      for (let k = 0; k < Q.length; k++) {
        if (fuss && Q[k].top < 0.09) continue;
        const t = tiefeIn(_p, r, Q[k]);
        if (t > aus[NG * k + gr]) aus[NG * k + gr] = t;
      }
    }
  }
  return aus;
}
// Wie tief eine Kapsel (Strecke A–B, Radius r) höchstens in die Geräte taucht (Hantel am Boden)
function kapselTief(A, B, r, Q) {
  let max = 0;
  const n = Math.max(1, Math.ceil(A.distanceTo(B) / 0.03));
  for (let i = 0; i <= n; i++) { _p.copy(A).lerp(B, i / n); for (const q of Q) max = Math.max(max, tiefeIn(_p, r, q)); }
  return max;
}
// Kürzester Abstand zweier Strecken P1–Q1 und P2–Q2 (Ericson)
function streckenAbstand(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), zu = (x) => Math.max(0, Math.min(1, x));
  let s = 0, t = 0;
  if (a < 1e-9 && e < 1e-9) return r.length();
  if (a < 1e-9) t = zu(f / e);
  else if (e < 1e-9) s = zu(-c / a);
  else {
    const n = a * e - b * b;
    s = n > 1e-9 ? zu((b * f - c * e) / n) : 0; t = (b * s + f) / e;
    if (t < 0) { t = 0; s = zu(-c / a); } else if (t > 1) { t = 1; s = zu((b - c) / a); }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}
// Wie weit Arme (Seiten arme) und Beine einander durchdringen (Kapseln): beim Aufheben hängen die Arme neben bzw. zwischen den Knien
function armInBein(g, arme = ['l', 'r']) {
  let max = 0;
  for (const s of arme) for (const t of ['l', 'r']) {
    for (const [A, B, ra] of [[g.schulter[s], g.ellbogen[s], 0.055], [g.ellbogen[s], g.hand[s], 0.045]]) {
      for (const [C, D, rb] of [[g.huefte[t], g.knie[t], 0.08], [g.knie[t], g.knoechel[t], 0.055]]) max = Math.max(max, ra + rb - streckenAbstand(A, B, C, D));
    }
  }
  return max;
}
// Größte Eindringtiefe über das Erlaubte hinaus (erlaubt: je Teil und Gruppe, z. B. Sitz und Griffe in der Startpose)
function stoss(posen, Q, erlaubt) {
  let max = 0;
  for (const p of posen) { const t = tiefen(gelenke(p), Q); for (let k = 0; k < t.length; k++) max = Math.max(max, t[k] - erlaubt[k]); }
  return max;
}

/* ---------- Laufweg ---------- */
// Bodenraster (5 cm) auf der Bodenscheibe: wie weit jede Zelle von den Geräten weg ist (Körper als senkrechter Zylinder: auf Beinhöhe
// schmal, oben mit den Armen breiter). Flache Bodenteile (Rahmen, Platten, Stufen) kann die Figur übersteigen, sie kosten nur mehr.
const ZELLE = 0.05, FELD = 2.1, NZ = Math.round(2 * FELD / ZELLE) + 1;
const zelleVon = (x, z) => { const i = Math.round((x + FELD) / ZELLE), j = Math.round((z + FELD) / ZELLE); return i < 0 || j < 0 || i >= NZ || j >= NZ ? -1 : j * NZ + i; };
const mitteVon = (k) => V(-FELD + (k % NZ) * ZELLE, 0, -FELD + Math.floor(k / NZ) * ZELLE);
function raster(Q) {
  const frei = new Float32Array(NZ * NZ).fill(1), weich = new Uint8Array(NZ * NZ), niedrig = new Float32Array(NZ * NZ).fill(1);
  for (const q of Q) {
    if (q.bot > 1.85) continue;
    const flach = q.top < 0.13, r = flach ? 0.1 : q.top < 0.75 ? 0.19 : 0.26;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of q.grund) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const i0 = Math.max(0, Math.floor((x0 - r + FELD) / ZELLE)), i1 = Math.min(NZ - 1, Math.ceil((x1 + r + FELD) / ZELLE));
    const j0 = Math.max(0, Math.floor((z0 - r + FELD) / ZELLE)), j1 = Math.min(NZ - 1, Math.ceil((z1 + r + FELD) / ZELLE));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * NZ + i, d = abstand2(-FELD + i * ZELLE, -FELD + j * ZELLE, q.grund) - r;
      if (flach) { if (d < 0) weich[k] = 1; } else { if (d < frei[k]) frei[k] = d; if (q.top < 0.75 && d < niedrig[k]) niedrig[k] = d; }
    }
  }
  for (let k = 0; k < NZ * NZ; k++) if (mitteVon(k).length() > 2.0) frei[k] = Math.min(frei[k], -1);   // nicht von der Bodenscheibe
  return { frei, weich, niedrig };
}
// Kürzeste Wege vom Start über freie Zellen (8 Nachbarn, Bodenteile kosten dreifach)
function wege(R, start) {
  const n = NZ * NZ, dist = new Float64Array(n).fill(Infinity), von = new Int32Array(n).fill(-1);
  const heap = [], hoch = (i) => { while (i > 0) { const e = (i - 1) >> 1; if (heap[e][0] <= heap[i][0]) break; [heap[e], heap[i]] = [heap[i], heap[e]]; i = e; } };
  const runter = () => { let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
  dist[start] = 0; heap.push([0, start]);
  while (heap.length) {
    const [d, k] = heap[0], letzt = heap.pop(); if (heap.length) { heap[0] = letzt; runter(); }
    if (d > dist[k]) continue;
    const i = k % NZ, j = (k - i) / NZ;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NZ || jj >= NZ) continue;
      const kk = jj * NZ + ii; if (R.frei[kk] < 0) continue;
      const nd = d + (di && dj ? Math.SQRT2 : 1) * ZELLE * (R.weich[kk] ? 3 : 1);
      if (nd < dist[kk]) { dist[kk] = nd; von[kk] = k; heap.push([nd, kk]); hoch(heap.length - 1); }
    }
  }
  return { dist, von };
}
// Freie Sicht zwischen zwei Bodenpunkten (alle Zellen dazwischen frei)
function sicht(a, b, R) {
  const n = Math.ceil(a.distanceTo(b) / (ZELLE / 2));
  for (let i = 0; i <= n; i++) { const k = zelleVon(mix(a.x, b.x, i / n), mix(a.z, b.z, i / n)); if (k < 0 || R.frei[k] < 0) return false; }
  return true;
}
// Bahn aus Punkten: Länge, Punkt und Laufrichtung (über ±12 cm geglättet) nach der Strecke s
function bahn(punkte, ersatz = 0) {
  const abs = [0]; for (let i = 1; i < punkte.length; i++) abs.push(abs[i - 1] + punkte[i].distanceTo(punkte[i - 1]));
  const laenge = abs[abs.length - 1];
  const punkt = (s) => {
    s = Math.max(0, Math.min(laenge, s));
    let i = 1; while (i < abs.length - 1 && abs[i] < s) i++;
    const u = abs[i] > abs[i - 1] ? (s - abs[i - 1]) / (abs[i] - abs[i - 1]) : 0;
    return punkte[i - 1].clone().lerp(punkte[i], u);
  };
  const richtung = (s) => { const d = punkt(Math.min(laenge, s + 0.12)).sub(punkt(Math.max(0, s - 0.12))); return d.lengthSq() > 1e-8 ? winkelVon(d) : ersatz; };
  return { laenge, punkt, richtung };
}
// Weiter als 30 cm vom Standpunkt darf ein gerades Wegstück nicht über niedrige Teile führen (z. B. quer über eine flache Bank, die die
// Kapseln kaum fassen); je Zelle tief darin 3 cm Strafe (knappe Lücken zwischen zwei Teilen bleiben erlaubt)
function quer(P, q, L, R) {
  let belegt = 0;
  for (let x = 0.3; x < L; x += ZELLE) { const p = P.clone().lerp(q, x / L), k = zelleVon(p.x, p.z); if (k < 0 || R.niedrig[k] < -0.06) belegt++; }
  return Math.min(0.2, belegt * 0.03);
}
// Gehend mit Füßen ganz vorn/hinten (zum Prüfen; i wechselt den vorderen Fuß), Schritte werden kurz vor dem Ziel kürzer
const gehend = (pos, richt, i, rest) => stehen(pos, richt, { phase: i % 2 ? Math.PI / 2 : -Math.PI / 2, schritt: 0.2 * Math.min(1, rest / 0.3) });
// Weg vom Start zum Standpunkt P: Zuletzt gerade auf P zu (aus der Richtung, aus der der Körper nicht in Teile eintaucht), davor
// der kürzeste freie Weg im Raster, Ecken gerundet. Ergebnis: Punkte und wie tief der Körper auf dem letzten Stück noch eintaucht
function anlauf(P, wEnde, W, R, Q, erlaubt) {
  const kand = [];
  for (let a = 0; a < 24; a++) for (const L of [0.35, 0.55, 0.8]) {
    const w = a * Math.PI / 12, q = V(P.x + Math.sin(w) * L, 0, P.z + Math.cos(w) * L), k = zelleVon(q.x, q.z);
    if (k < 0 || R.frei[k] < 0 || !(W.dist[k] < Infinity)) continue;
    kand.push({ q, k, L, kosten: W.dist[k] + L });
  }
  if (!kand.length) return null;
  kand.sort((a, b) => a.kosten - b.kosten);
  let best = null;
  for (const c of kand.slice(0, 10)) {
    const richt = winkelVon(V(P.x - c.q.x, 0, P.z - c.q.z)), posen = [];
    for (let s = 0.1, i = 0; s <= c.L + 1e-6; s += 0.08, i++) posen.push(gehend(c.q.clone().lerp(P, s / c.L), richt, i, c.L - s));
    const dw = kurz(wEnde - richt);
    for (const u of [0.5, 1]) posen.push(stehen(P, richt + dw * u));
    c.stoss = Math.max(stoss(posen, Q, erlaubt), quer(P, c.q, c.L, R));
    c.wert = c.kosten + 12 * c.stoss;
    if (!best || c.wert < best.wert) best = c;
    if (c.stoss < 0.015) break;
  }
  // Rasterweg zurückverfolgen, dann Ecken abkürzen, wo die Sicht frei ist, und runden
  const zellen = []; for (let k = best.k; k >= 0; k = W.von[k]) zellen.unshift(mitteVon(k));
  const pk = [zellen[0]];
  for (let i = 0; i < zellen.length - 1;) {
    let j = zellen.length - 1; while (j > i + 1 && !sicht(zellen[i], zellen[j], R)) j--;
    pk.push(zellen[j]); i = j;
  }
  let pfad = [...pk.slice(0, -1), best.q];
  for (let n = 0; n < 2 && pfad.length > 2; n++) {
    const neu = [pfad[0]];
    for (let i = 0; i < pfad.length - 1; i++) {
      const a = pfad[i], b = pfad[i + 1];
      if (i > 0) neu.push(a.clone().lerp(b, 0.25));
      if (i < pfad.length - 2) neu.push(a.clone().lerp(b, 0.75));
    }
    neu.push(pfad[pfad.length - 1]);
    if (neu.every((p) => { const k = zelleVon(p.x, p.z); return k >= 0 && R.frei[k] > -0.03; })) pfad = neu; else break;
  }
  return { punkte: [...pfad, P.clone().setY(0)], stoss: best.stoss, laenge: best.kosten };
}

/* ---------- Einstiege ---------- */
// Klassisch je nach Art der Startpose: hinsetzen (vor dem Sitz stehen), hinlegen (am Ende der Bank sitzen, zurücklegen),
// am Boden erst knien, hängen (unter der Stange greifen), sonst einfach in die Pose
// hantel: mit Hanteln in den Händen (true; 'beide' = eine Hantel für beide Hände)
function klassisch(art, G, Gp, gg, hantel = false, frei = false, sitzVersatz = 0) {
  const fussMitte = gg.knoechel.l.clone().add(gg.knoechel.r).multiplyScalar(0.5);
  if (art === 'sitzen') {
    const blick = waag(gg.R.vor);
    return { name: art, blick, abruecken: true, stand: gg.becken.clone().add(blick.clone().multiplyScalar(0.2)),
      schritte: hantel ? [{ ziel: hantelnAufBeinen(Gp, hantel === 'beide', Gp.kelch), d: DAUER.setzen, aussen: 0.1 }, { ziel: Gp, d: DAUER.greifen, aussen: 0.06 }]
        : [{ ziel: haendeAufBeinen(Gp), d: DAUER.setzen }, { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
  }
  if (art === 'rueckenlage') {
    const blick = waag(gg.R.oben).negate();   // Richtung Füße
    const q = drehY(winkelVon(blick));
    const sitz = stehen(gg.becken, winkelVon(blick));
    sitz.becken = gg.becken.clone().addScaledVector(blick, sitzVersatz);   // sitzVersatz (Vorlage): weiter vorn oder hinten hinsetzen, wenn dort eine Stange im Weg ist
    const R = rumpfRahmen(sitz.rumpf);
    const aufBoden = Math.max(gg.knoechel.l.y, gg.knoechel.r.y) < 0.18;
    sitz.fuss = seiten((s, sg) => aufBoden ? gg.knoechel[s].clone() : sitz.becken.clone().add(blick.clone().multiplyScalar(0.42)).add(R.links.clone().multiplyScalar(sg * 0.14)).setY(FY));
    sitz.kniePol = seiten((s, sg) => V(sg * 0.2, 1, 0.6).applyQuaternion(q));
    // Am Boden und nichts zu greifen (Devin, 2.11. zum Dead Bug: „Arme … locker mit dem Körper … erstmal auf dem Boden liegt mit dem Rücken und dann gehen die Hände hoch
    // langsam und dann fängt er an“): hinsetzen, zurücklegen mit den Armen neben dem Körper und den Füßen am Boden, dann die Beine, zuletzt ruhig die Hände
    if (frei && !hantel && gg.becken.y < 0.3) {
      const liegt = haendeNeben(Gp), schritte = [{ ziel: haendeAufBeinen(sitz), d: DAUER.setzen + 0.4 }];
      liegt.hand = seiten((s, sg) => gg.huefte[s].clone().addScaledVector(gg.R.links, sg * 0.24).addScaledVector(gg.R.oben, 0.14).setY(0.06));
      liegt.ellbogenPol = seiten((s, sg) => gg.R.links.clone().multiplyScalar(sg).addScaledVector(gg.R.vor, 0.3));
      if (aufBoden) schritte.push({ ziel: liegt, d: DAUER.legen + 0.3 });
      else schritte.push({ ziel: Object.assign({}, liegt, { fuss: seiten((s) => sitz.fuss[s].clone()), kniePol: sitz.kniePol, fussRicht: sitz.fussRicht, zehen: {} }), d: DAUER.legen + 0.3 }, { ziel: liegt, d: 0.9 });
      const weg = Math.max(...['l', 'r'].map((s) => liegt.hand[s].distanceTo(Gp.hand[s])));
      schritte.push({ ziel: Gp, d: Math.max(0.5, Math.min(1.8, weg / 0.45)) });
      return { name: art, blick, stand: gg.becken.clone().add(blick.clone().multiplyScalar(0.22)), schritte };
    }
    return { name: art, blick, stand: sitz.becken.clone().add(blick.clone().multiplyScalar(0.22)),
      // mit Hanteln: sie liegen beim Sitzen auf den Oberschenkeln und gehen beim Zurücklegen nah am Körper zur Brust (nicht neben die Bank)
      schritte: hantel ? [{ ziel: hantelnAufBeinen(sitz, hantel === 'beide', Gp.kelch), d: DAUER.setzen, aussen: 0.1 }, { ziel: Gp, d: DAUER.legen + DAUER.greifen, aussen: 0.06 }]
        : [{ ziel: haendeAufBeinen(sitz), d: DAUER.setzen }, { ziel: haendeNeben(Gp), d: DAUER.legen }, { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
  }
  if ((art === 'bauchlage' || art === 'seitlage') && (gg.becken.y < 0.5 || Math.max(gg.knie.l.y, gg.knie.r.y) < 0.15)) {   // am Boden (oder Vierfüßler): erst knien
    const blick = waag(gg.R.oben);   // Richtung Kopf
    const kniePunkt = gg.becken.clone().setY(0);
    const knien = stehen(kniePunkt, winkelVon(blick));
    knien.becken = kniePunkt.clone().setY(0.56);
    { const kr = rumpfRahmen(knien.rumpf), kb = knien.becken.clone().addScaledVector(kr.oben, MASS.rumpf - 0.03); knien.hand = seiten((s, sg) => kb.clone().addScaledVector(kr.links, sg * (MASS.schulterBreite + 0.05)).addScaledVector(kr.oben, -ARM() * 0.95)); }
    knien.fuss = seiten((s, sg) => kniePunkt.clone().add(blick.clone().multiplyScalar(-0.42)).add(V(sg * 0.12, 0, 0).applyQuaternion(drehY(winkelVon(blick)))).setY(0.09));
    knien.kniePol = seiten(() => blick.clone());
    knien.zehen = seiten(() => -40);
    knien.fussRicht = seiten(() => blick.clone().negate().add(V(0, -1.2, 0)));
    return { name: art, blick, stand: kniePunkt.clone().add(blick.clone().multiplyScalar(-0.15)), schritte: [{ ziel: knien, d: DAUER.setzen + 0.2 }, { ziel: Gp, d: DAUER.legen + 0.4, verzug: 0.1, bogen: 0.1 }] };
  }
  if (art === 'haengen') {
    const blick = waag(gg.R.vor), stand = gg.becken.clone();
    const greifen = stehen(stand, winkelVon(blick), { hand: seiten((s) => gg.hand[s].clone()) });
    greifen.ellbogenPol = seiten((s, sg) => V(sg, -0.3, 0).applyQuaternion(drehY(winkelVon(blick))));
    return { name: art, blick, stand, schritte: [{ ziel: greifen, d: DAUER.greifen, verzug: 0.2 }, { ziel: Gp, d: DAUER.setzen }] };
  }
  const blick = waag(gg.R.vor);
  return { name: art, blick, stand: art === 'stehen' ? fussMitte.clone().add(blick.clone().multiplyScalar(-0.03)) : gg.becken.clone(),
    schritte: [{ ziel: Gp, d: DAUER.greifen + 0.3, verzug: hantel ? 0 : 0.35, aussen: hantel && art !== 'stehen' ? 0.12 : 0 }] };
}
// Erhöhter Stand: Box oder Stufe unter den Zehen der Startpose (Oberkante 1–7 cm unter dem Zehenpunkt, mindestens 5 cm hoch)
function plattformUnter(gg, Q) {
  let best = null;
  for (const q of Q) for (const s of ['l', 'r']) {
    const z = gg.zehe[s], d = z.y - q.top;
    if (q.top < 0.05 || d < 0.01 || d > 0.09 || abstand2(z.x, z.z, q.grund) > 0.02) continue;
    if (!best || q.top > best.top) best = { q, top: q.top };
  }
  return best;
}
// Auf Box oder Stufe steigen (Devin: Figur stand beim Hinlaufen in der Klimmzug-Box bzw. mit dem Fuß in der Stufe): vor der Kante in
// Richtung d stehen, Blick zur Plattform, erst einen Fuß, dann den anderen hinaufsetzen, oben in die Blickrichtung der Übung drehen,
// dann wie klassisch (greifen bzw. in die Pose). Oben steht die Figur dort, wo das Becken der Startpose ist
function aufsteigen(art, Gp, gg, P, d, hantel) {
  const blick = waag(gg.R.vor), wB = winkelVon(blick), S0 = gg.becken.clone().setY(0), h = P.top;
  // Nur ein Fuß oben, der andere am Boden (Step-up, Ausfallschritt mit Erhöhung): unten so stehen, dass der Standfuß schon an seinem
  // Platz ist, und nur den anderen Fuß im Bogen hinaufsetzen
  const oben = ['l', 'r'].filter((s) => { const z = gg.zehe[s], dz = z.y - h; return dz >= 0.01 && dz <= 0.07 && abstand2(z.x, z.z, P.q.grund) <= 0.02; });
  const unten = ['l', 'r'].filter((s) => gg.zehe[s].y < 0.08);
  if (oben.length === 1 && unten.length === 1) {
    const j = unten[0], links = V(blick.z, 0, -blick.x), stand = gg.knoechel[j].clone().setY(0).addScaledVector(links, (j === 'l' ? -1 : 1) * 0.11);
    if (d.dot(blick) > -0.7) return null;   // nur einmal (für „von hinten“), die Richtung gibt die Übung vor
    return { name: 'aufsteigen1', blick, stand, schritte: [{ ziel: Gp, d: 0.9 + 0.8 * h, steigen: { erst: oben[0], bogen: 0.06 } }], vorwaerts: true };
  }
  const kante = Math.max(0, ...P.q.grund.map(([x, z]) => (x - S0.x) * d.x + (z - S0.z) * d.z));   // so weit reicht die Plattform in Richtung d
  const stand = S0.clone().addScaledVector(d, kante + 0.22), wf = winkelVon(d.clone().negate()), dw = kurz(wB - wf);
  // Unter einer Stange (Klimmzug) oben nicht höher als in der Startpose: in den Knien, sonst stößt der Kopf an
  const tief = art === 'haengen' ? Math.max(0, gelenke(stehen(S0, wB, { hoch: h })).kopf.y - gg.kopf.y) : 0, o = { hoch: h, tief };
  const schritte = [{ ziel: stehen(S0, wf, o), d: 0.75 + 1.2 * h, steigen: { bogen: 0.09 } }];
  if (Math.abs(dw) > 0.15) schritte.push({ ziel: stehen(S0, wB, o), d: 0.35 + 0.25 * Math.abs(dw), dreh: { m: S0, w: dw } });
  if (art === 'haengen') {
    const greifen = stehen(S0, wB, { ...o, hand: seiten((s) => gg.hand[s].clone()) });
    greifen.ellbogenPol = seiten((s, sg) => V(sg, -0.3, 0).applyQuaternion(drehY(wB)));
    schritte.push({ ziel: greifen, d: DAUER.greifen, verzug: 0.2 }, { ziel: Gp, d: DAUER.setzen });
  } else schritte.push({ ziel: Gp, d: DAUER.greifen + 0.3, verzug: hantel ? 0 : 0.35 });
  return { name: 'aufsteigen', blick: d.clone().negate(), stand, schritte, vorwaerts: d.dot(blick) < -0.7 };
}
// Seitlich einsteigen (Sitz mit Polster, Hebel oder Rolle davor): neben dem Sitz stehen, Rücken zum Sitz, seitlich hinsetzen,
// dann auf dem Sitz eindrehen und die Beine unter Polster und Hebel bringen (Füße angehoben über Rahmen), zuletzt greifen
function seitlichSetzen(Gp, gg, sg, zurueck, heben, vorRicht = null) {
  const vor = vorRicht || waag(gg.R.vor), aussen = V(vor.z, 0, -vor.x).multiplyScalar(sg), wA = winkelVon(aussen), B = gg.becken.clone();
  const m = B.clone().add(aussen.clone().multiplyScalar(0.06)).sub(vor.clone().multiplyScalar(zurueck));
  const sitz = haendeAufBeinen(sitzen(m, wA, 0.42));
  return { name: 'seitlich' + (sg > 0 ? 'L' : 'R') + zurueck + '/' + heben, blick: aussen, abruecken: true, stand: m.clone().setY(0).add(aussen.clone().multiplyScalar(0.2)),
    schritte: [{ ziel: sitz, d: DAUER.setzen }, { ziel: haendeAufBeinen(Gp), d: DAUER.eindrehen, dreh: { m: B, w: kurz(winkelVon(vor) - wA) }, heben, hebenBis: 0.65 },
      { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
}
// Über den Sitz steigen (wie im Studio an Maschinen mit Polster, Rolle oder Stange vor den Oberschenkeln, die beim Stehen vor dem Sitz
// in den Beinen stünden): hinter dem Sitz stehen, über den Sitz steigen (Füße links und rechts davon), aufrecht hinsetzen, die Beine
// unter Polster oder Rolle in ihre Lage bringen. Gibt die Posen; der Latzug nutzt sie auch (dort mit eigenem Greifen)
function ueberSitzPosen(Gp, gg, fussBreit = 0.2, fussVor = 0.02, stehBreit = 0.27) {
  const blick = waag(gg.R.vor), w = winkelVon(blick), quer = V(blick.z, 0, -blick.x), q = drehY(w), B = gg.becken;
  const stand = B.clone().setY(0).addScaledVector(blick, -0.53), ueber = B.clone().setY(0).addScaledVector(blick, -0.1);
  const breit = (p, d, v = 0) => { p.fuss = seiten((s, sg) => ueber.clone().addScaledVector(blick, v).addScaledVector(quer, sg * d).setY(FY)); return p; };
  const steht = breit(stehen(ueber, w, { tief: 0.04 }), stehBreit);   // über dem Sitz, die Füße daneben
  steht.kniePol = seiten((s, sg) => V(sg * 0.35, 0, 1).applyQuaternion(q));
  const aufrecht = { basis: q.clone() }, sitzt = (fuss, pol) => Object.assign({}, Gp, { rumpf: aufrecht, kopf: { neigung: 0 }, fuss, fussRicht: seiten((s, sg) => V(sg * 0.1, 0, 1).applyQuaternion(q)), kniePol: pol, zehen: {}, fussFlaeche: seiten(() => null) });
  const unten = haendeAufBeinen(sitzt(seiten((s, sg) => B.clone().addScaledVector(blick, fussVor).addScaledVector(quer, sg * fussBreit).setY(FY)), seiten((s, sg) => V(sg * 0.25, 0.4, 1).applyQuaternion(q))));
  const fuesse = haendeAufBeinen(sitzt(seiten((s) => Gp.fuss[s].clone()), seiten((s) => Gp.kniePol[s].clone())));
  return { blick, w, q, quer, stand, steht, unten, fuesse };
}
function ueberSitz(Gp, gg, fussBreit, fussVor, breit = 0.32) {
  const { blick, w, quer, stand, steht, unten, fuesse } = ueberSitzPosen(Gp, gg, fussBreit, fussVor, breit);
  // hinter dem Sitz erst breit hinstellen, dann gerade vor: die Beine gehen außen am Sitz vorbei, nicht schräg durch seine Ecken
  const hinten = stehen(stand, w); hinten.fuss = seiten((s, sg) => stand.clone().addScaledVector(quer, sg * breit).setY(FY));
  return { name: 'ueberSitz' + fussBreit + '/' + fussVor, blick, stand, schritte: [{ ziel: hinten, d: 0.6, steigen: { bogen: 0.06, erst: 'l' } }, { ziel: steht, d: 1.0, steigen: { bogen: 0.1, erst: 'l' } }, { ziel: unten, d: DAUER.setzen + 0.1 }, { ziel: fuesse, d: 0.7, steigen: { bogen: 0.03, erst: 'r' } },
    { ziel: Gp, d: DAUER.greifen + 0.3, verzug: 0.35 }] };
}
// Rückenlage mit Polster oder Hebel über dem Becken (Hip-Thrust-Maschine): weiter hinten absetzen (auf der Bank, sonst am Boden),
// Beine lang nach vorn unter dem Polster durchschieben, bis zur Kante der Bank vorrutschen, mit langen Beinen unter das Polster
// rutschen und zurücklegen, dann die Füße heranziehen
function langsitz(Gp, gg, Q, d) {
  const blick = waag(gg.R.oben).negate(), w = winkelVon(blick), q = drehY(w), B = gg.becken;
  const m = B.clone().sub(blick.clone().multiplyScalar(d)), bank = auflage(Q, m);
  m.y = Math.max(0.13, bank + 0.09);
  const weit = (hy) => Math.min(0.95, Math.sqrt(Math.max(0, (0.97 * (MASS.oberschenkel + MASS.unterschenkel)) ** 2 - (hy - 0.02 - FY) ** 2)));
  const sitz = haendeAufBeinen(sitzen(m, w, 0.26));
  const lang = haendeAufBeinen(sitzen(m, w, weit(m.y), V(0, 1, 0.15)));
  // Kante: so weit vor, wie die Auflage reicht (Becken bleibt auf Bankhöhe), Rumpf etwas zurück
  let k = m.clone();
  if (bank > 0.2) { for (let i = 1; i <= 12; i++) { const p = m.clone().add(blick.clone().multiplyScalar(0.03 * i)); if (auflage(Q, p) < 0.2) break; k = p; } }
  k.add(blick.clone().multiplyScalar(0.08)).setY(m.y - 0.03);   // Gesäß an der Kante, Becken schon etwas davor
  const kante = haendeAufBeinen(sitzen(k, w, weit(k.y) + 0.02, V(0, 1, 0.15)));
  kante.rumpf = { basis: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -15 * RAD)) };
  const fuesse = (vor) => seiten((s, sg) => B.clone().add(V(sg * 0.14, 0, vor).applyQuaternion(q)).setY(FY));
  // unter das Polster: Becken an seinen Platz, Rumpf zurück, Beine noch lang (Knie bleiben unter dem Polster)
  const unten = haendeNeben(Object.assign({}, Gp, { fuss: fuesse(0.8), kniePol: seiten((s, sg) => V(sg * 0.1, 1, 0.15).applyQuaternion(q)) }));
  return { name: 'langsitz' + d, blick, abruecken: true, stand: m.clone().setY(0).add(blick.clone().multiplyScalar(0.22)),
    schritte: [{ ziel: sitz, d: DAUER.setzen }, { ziel: lang, d: 0.6 }, ...(k.distanceTo(m) > 0.1 ? [{ ziel: kante, d: 0.6 }] : []),
      { ziel: unten, d: DAUER.rutschen, bogen: -0.06 }, { ziel: haendeNeben(Gp), d: 0.6 }, { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
}
// Höchste Auflage (Bank, Sitz) unter einem Bodenpunkt, niedriger als 0,75 m
function auflage(Q, m) {
  let h = 0;
  for (const q of Q) if (q.top < 0.75 && q.top > h && abstand2(m.x, m.z, q.grund) < -0.03) h = q.top;
  return h;
}
// Vorgebeugt unter einem Polster (Esel-Wadenheben): vor dem Polster stehen, vorbeugen und greifen, dann rückwärts unter das
// Polster steigen (Füße angehoben, z. B. auf die Stufe)
function vorgebeugt(Gp, gg, d) {
  const kopf = waag(gg.R.oben), weg = kopf.clone().multiplyScalar(d), tief = Math.max(0, Math.min(gg.knoechel.l.y, gg.knoechel.r.y) - FY);
  const stand = gg.knoechel.l.clone().add(gg.knoechel.r).multiplyScalar(0.5).add(weg).setY(0).sub(kopf.clone().multiplyScalar(0.03));
  // vorn: Startpose um weg nach vorn auf den Boden versetzt, Rumpf erst zu zwei Dritteln geneigt (Kopf bleibt vor dem Gerät), Hände schon an den Griffen
  const versetzt = Object.assign({}, Gp, { becken: Gp.becken.clone().add(weg).setY(Gp.becken.y - tief), fuss: seiten((s) => Gp.fuss[s].clone().add(weg).setY(Gp.fuss[s].y - tief)), zehen: {} });
  const vorn = mische(stehen(stand, winkelVon(kopf)), versetzt, 0.65, 1);
  return { name: 'vorgebeugt' + d, blick: kopf, stand,
    schritte: [{ ziel: vorn, d: DAUER.greifen + 0.3, verzug: 0.35 }, { ziel: Gp, d: DAUER.setzen, heben: tief > 0.03 ? 0.08 : 0 }] };
}
// Höchste Auflage unter einem Bodenpunkt bis zur Höhe unter (auch hohe Polster wie am Glute-Ham-Raise)
function auflageBauch(Q, m, unter) {
  let h = 0;
  for (const q of Q) if (q.top < unter && q.top > h && abstand2(m.x, m.z, q.grund) < -0.03) h = q.top;
  return h;
}
// Bauchlage auf einem hohen Gerät (Beinbeuger liegend, Glute-Ham-Raise, 45°-Rückenstrecker; Befund 5.11.: die Figur lief bis zum Becken der
// Startpose ins Polster und kippte von dort in die Pose). Wie im Studio: Liegen die Oberschenkel waagerecht, neben dem Gerät stehen, auf das
// Polster steigen und aufrecht knien, dann nach vorn ablegen. Stehen die Beine schräg auf einer Fußplatte, von hinten auf die Platte steigen,
// Becken ans Polster, der Körper gestreckt in einer Linie mit den Beinen (oberer Umkehrpunkt), dann abbeugen. sg: Seite (1 = links des Geräts)
function aufBauchlage(Gp, gg, Q, sg) {
  const kopf = waag(gg.R.oben), w = winkelVon(kopf), links = V(kopf.z, 0, -kopf.x), mitte = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  const km = mitte(gg.knie.l, gg.knie.r), hm = mitte(gg.huefte.l, gg.huefte.r), fm = mitte(gg.knoechel.l, gg.knoechel.r), T = km.clone().sub(hm);
  if (Math.abs(T.y) < 0.5 * T.length()) {
    // Kniepunkt auf dem Polster (beim Beinbeuger liegen die Knie in der Startpose über der Kante: so weit zum Becken hin, bis Polster darunter ist)
    let K = null;
    for (let i = 0; i <= 12 && !K; i++) { const p = km.clone().lerp(hm, i / 12), h = auflageBauch(Q, p, km.y + 0.02); if (h > 0.3 && km.y - h < 0.16) K = p.setY(h + 0.075); }
    if (!K) return null;
    const gleich = K.distanceTo(km) < 0.03, B = K.clone().addScaledVector(kopf, -0.03).setY(K.y + MASS.oberschenkel * 0.98);
    const kniet = stehen(B, w, { hoch: B.y - 0.975 });
    kniet.becken = B.clone();
    kniet.kniePol = seiten(() => kopf.clone().add(V(0, -1, 0)));   // aufrecht kniend: das Knie ist die Ecke zwischen Oberschenkel und Schienbein
    if (gleich) { kniet.fuss = seiten((s) => Gp.fuss[s].clone()); kniet.fussRicht = seiten((s) => Gp.fussRicht[s].clone()); kniet.zehen = Object.assign({}, Gp.zehen); }
    else {   // Schienbeine liegen auf dem Polster, die Füße zeigen nach hinten
      kniet.fuss = seiten((s, s2) => K.clone().addScaledVector(kopf, -MASS.unterschenkel * 0.97).addScaledVector(links, s2 * 0.1).setY(K.y + 0.01));
      kniet.fussRicht = seiten(() => kopf.clone().negate().add(V(0, -1.2, 0)));
      kniet.zehen = seiten(() => -40);
    }
    // Stehplatz neben dem Polster, so weit draußen, dass kein höheres Teil näher als 22 cm ist
    const stand = K.clone().setY(0);
    for (let i = 0; i < 40 && Q.some((q) => q.top > 0.2 && abstand2(stand.x, stand.z, q.grund) < 0.22); i++) stand.addScaledVector(links, sg * 0.03);
    // Zuerst das innere Knie hinauf an seinen Platz: der Oberschenkel geht schräg hinab zum Knie, das Becken steht daneben so hoch, dass
    // der äußere Fuß fast gestreckt am Boden bleibt, und so nah, dass der Oberschenkel das Knie erreicht (sonst drückt es ins Polster)
    const innen = sg > 0 ? 'r' : 'l', aussen = sg > 0 ? 'l' : 'r', Ki = K.clone().addScaledVector(links, -sg * 0.1);
    const Mb = K.clone().addScaledVector(links, sg * 0.36).setY(K.y + 0.27);
    const halb = stehen(Mb, w, { hoch: Mb.y - 0.975, neigung: 10 });
    halb.becken = Mb.clone();
    const hi = Mb.clone().addScaledVector(links, -sg * MASS.hueftBreite).add(V(0, -0.02, 0));
    halb.fuss = seiten((s) => (s === innen ? kniet.fuss[s].clone() : Mb.clone().addScaledVector(links, sg * 0.06).setY(FY)));
    halb.kniePol = seiten((s) => (s === innen ? Ki.clone().sub(hi.clone().add(kniet.fuss[s]).multiplyScalar(0.5)).normalize() : halb.kniePol[s]));
    halb.fussRicht = seiten((s) => (s === innen ? kniet.fussRicht[s].clone() : halb.fussRicht[s]));
    halb.zehen = seiten((s) => (s === innen ? (kniet.zehen[s] || 0) : 0));
    // dann das äußere Knie hoch über das Polster (der Fuß hängt darunter), zuletzt aufsetzen
    // (das Becken bleibt so weit vom Knie, dass der Oberschenkel es erreicht: gemessen von der Hüfte, die um die halbe Beckenbreite innen liegt)
    const Kh = Ki.clone().addScaledVector(links, sg * MASS.hueftBreite).add(V(0, 0.02, 0)), Lh = MASS.oberschenkel * 0.97;
    const Hb = Mb.clone().lerp(B, 0.5);
    { const d = Hb.clone().sub(Kh); if (d.length() < Lh) Hb.copy(Kh).add(d.setLength(Lh)); }
    const hoch = Object.assign({}, mische(halb, kniet, 0.5), { becken: Hb });
    hoch.fuss = seiten((s) => (s === innen ? kniet.fuss[s].clone() : kniet.fuss[s].clone().lerp(halb.fuss[s], 0.3).add(V(0, 0.3, 0))));
    const hiH = Hb.clone().addScaledVector(links, -sg * MASS.hueftBreite).add(V(0, -0.02, 0));   // Pol zeigt vom Weg Hüfte–Fuß zum Kniepunkt (das Knie bleibt, wo es liegt)
    hoch.kniePol = seiten((s) => (s === innen ? Ki.clone().sub(hiH.add(kniet.fuss[s]).multiplyScalar(0.5)).normalize() : kopf.clone().add(V(0, 0.4, 0))));
    hoch.fussRicht = seiten((s) => kniet.fussRicht[s].clone());
    return { name: 'aufknien' + (sg > 0 ? 'L' : 'R'), blick: kopf, stand,
      schritte: [{ ziel: halb, d: 1.2, steigen: { erst: aussen, bogen: 0.1 } },
        { ziel: hoch, d: 0.6, halten: { K: Kh, L: Lh } },
        { ziel: kniet, d: 0.6, halten: { K: Kh, L: Lh } },
        { ziel: Gp, d: 1.5, verzug: 0.2, halten: { K, K2: km, L: B.distanceTo(K), L2: Gp.becken.distanceTo(km) } }] };
  }
  if (sg < 0) return null;   // von hinten gibt es nur eine Seite
  // nur mit einer Fußplatte unter den Zehen (hängen die Beine frei, wie beim Reverse Hyperextension, passt das nicht)
  const zm = mitte(gg.zehe.l, gg.zehe.r);
  if (!Q.some((q) => q.top > 0.15 && q.top > zm.y - 0.12 && q.top < zm.y + 0.25 && abstand2(zm.x, zm.z, q.grund) < 0.03)) return null;
  const linie = hm.clone().sub(fm).normalize();
  const gestreckt = haendeNeben(Object.assign({}, Gp, { rumpf: { basis: drehY(w).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.acos(Math.max(-1, Math.min(1, linie.y))))) }, wirbel: null, kopf: { neigung: 0 } }));
  return { name: 'aufPlatte', blick: kopf, stand: fm.clone().setY(0).addScaledVector(kopf, -0.5),
    schritte: [{ ziel: gestreckt, d: 1.4, steigen: { erst: 'l', bogen: 0.08 } }, { ziel: Gp, d: 1.2, verzug: 0.2 }] };
}
// Kniepolster (Klimmzug- und Dip-Maschine mit Unterstützung; Befund 5.11.: die Figur stand beim Ankommen im Polster). Wie im Studio: vor
// dem Polster stehen, Rücken zur Maschine, rückwärts auf die beiden Trittstufen neben dem Polster steigen, Stange bzw. Griffe fassen, dann ein
// Knie nach dem anderen auf das Polster setzen. Unter einer Stange bleibt der Kopf darunter (in den Knien)
function aufKniepolster(Gp, gg, Q, art) {
  const blick = waag(gg.R.vor), w = winkelVon(blick), links = V(blick.z, 0, -blick.x), mitte = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  const km = mitte(gg.knie.l, gg.knie.r), h = auflageBauch(Q, km, km.y + 0.02);
  if (h < 0.3 || km.y - h > 0.16 || Math.min(gg.knoechel.l.y, gg.knoechel.r.y) < 0.4 || gg.R.oben.y < 0.8) return null;
  // Trittstufe je Seite: Teil niedriger als das Polster, neben ihm (mehr als 25 cm zur Seite, höchstens 30 cm vor oder hinter den Knien)
  const stufe = {};
  for (const q of Q) {
    if (q.top < 0.3 || q.top > h - 0.04) continue;
    const c = q.grund.reduce((a, [x, z]) => a.add(V(x, 0, z)), V()).multiplyScalar(1 / q.grund.length), d = c.clone().sub(km.clone().setY(0));
    const seit = d.dot(links), laengs = d.dot(blick), s = seit > 0 ? 'l' : 'r';
    if (Math.abs(seit) < 0.25 || Math.abs(laengs) > 0.3 || abstand2(c.x, c.z, q.grund) > -0.04) continue;
    if (!stufe[s] || q.top > stufe[s].top) stufe[s] = { c, top: q.top };
  }
  if (!stufe.l || !stufe.r) return null;
  const hoch = Math.min(stufe.l.top, stufe.r.top), S = mitte(stufe.l.c, stufe.r.c);
  // Füße auf den Stufen, so weit innen, wie die Stufe reicht (breiter Stand)
  const fuss = seiten((s) => stufe[s].c.clone().addScaledVector(links, (s === 'l' ? -1 : 1) * 0.03).setY(stufe[s].top + FY));
  // unter der Stange nur so tief in die Knie, dass der Kopf 20 cm unter ihr bleibt (Stange auf Höhe der Hände)
  const tief = art === 'haengen' ? Math.max(0, gelenke(stehen(S, w, { hoch })).kopf.y - (Math.min(gg.hand.l.y, gg.hand.r.y) - 0.2)) : 0;
  const oben = stehen(S, w, { hoch, tief });
  oben.fuss = fuss; oben.kniePol = seiten((s, sg) => V(sg * 0.15, 0, 1).applyQuaternion(drehY(w)));   // Knie nach vorn, nicht unter die Griffe
  const greifen = Object.assign({}, oben, { hand: seiten((s) => Gp.hand[s].clone()), handflaeche: Gp.handflaeche, ellbogenPol: Gp.ellbogenPol, flach: Gp.flach, greift: Gp.greift, kelch: Gp.kelch, kelchW: Gp.kelchW, handKnick: Gp.handKnick });
  // erst das linke Knie aufs Polster, der rechte Fuß bleibt auf der Stufe
  const einKnie = Object.assign({}, mische(greifen, Gp, 0.5, 1), { hand: seiten((s) => Gp.hand[s].clone()) });
  einKnie.fuss = { l: Gp.fuss.l.clone(), r: fuss.r.clone() };
  einKnie.kniePol = { l: Gp.kniePol.l.clone(), r: oben.kniePol.r.clone() };
  einKnie.fussRicht = { l: Gp.fussRicht.l.clone(), r: oben.fussRicht.r.clone() };
  const kb = art === 'haengen' ? 0.14 : 0.04;   // Fuß über das Polster heben; an der Dip-Maschine das erste nur knapp (das Knie stieße sonst an den Griff)
  return { name: 'kniepolster', blick, stand: S.clone().setY(0).addScaledVector(blick, 0.6),
    // Griffe neben dem Körper (Dips) fasst die Hand schon beim Hinaufsteigen (sonst streift der hängende Arm sie), die Stange oben erst danach
    schritte: [...(art === 'haengen' ? [{ ziel: oben, d: 1.4, steigen: { erst: 'l', bogen: 0.08 } }, { ziel: greifen, d: DAUER.greifen, verzug: 0.2 }] : [{ ziel: greifen, d: 1.6, steigen: { erst: 'l', bogen: 0.08 }, aussen: 0.12 }]),
      { ziel: einKnie, d: 0.9, steigen: { erst: 'l', nur: 'l', bogen: kb, mitBecken: true } }, { ziel: Gp, d: 0.9, steigen: { erst: 'r', nur: 'r', bogen: 0.14, mitBecken: true } }] };
}

/* ---------- Hanteln aufheben ---------- */
// Devin, 31.10.: nichts geht durch den Körper, auch keine Hantel. Die Hantel liegt flach am Boden dort, wo die Hände in der Hocke
// hinkommen: eine Hantel je Hand längs neben dem Fuß unter der Schulter, eine für beide Hände (Goblet, Kettlebell) aufrecht vor den
// Füßen zwischen den Knien. Gerechnet werden einige Hocken (Becken mehr oder weniger tief und zurück, Rücken so weit vorgeneigt, dass die Arme
// fast gestreckt hinunterreichen, Hanteln weiter außen bzw. vorn); genommen wird die natürlichste, bei der die Hände greifen, Arme und
// Knie einander frei lassen und weder Körper noch Hantel in Geräte tauchen. halter: je Hantel 'l' | 'r' | 'beide'.
// Ergebnis: Hocke, Pose nach dem Aufstehen und je Hantel die Lage am Boden (off: Abstand zur greifenden Hand bzw. Mitte der Hände);
// wahl.verstoss: wie weit die beste Hocke noch eintaucht bzw. die Hand die Hantel verfehlt (m)
function aufhebePlan(stand, winkel, z, halter, Q) {
  const namen = Object.keys(halter), q = drehY(winkel), qi = q.clone().invert(), o = stand.clone().setY(0);
  const vor = V(0, 0, 1).applyQuaternion(q), quer = V(1, 0, 0).applyQuaternion(q);
  const welt = (x, y, zz) => o.clone().add(V(x, y, zz).applyQuaternion(q)), lokal = (v) => v.clone().sub(o).applyQuaternion(qi);
  const beide = namen.some((n) => halter[n] === 'beide');
  // Lage am Boden: Kurzhantel längs (eine Hand) bzw. aufrecht stehend (beide Hände, wie beim Goblet), Kettlebell aufrecht mit dem
  // Griff in Greifrichtung; Höhe des Ursprungs über dem Boden aus der echten Form
  const lage = {}, ruhe = {}, auf = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), Y);
  for (const n of namen) {
    lage[n] = n === 'kb' ? (halter[n] === 'beide' ? q.clone() : q.clone().multiply(drehY(Math.PI / 2)))
      : halter[n] === 'beide' ? q.clone().multiply(auf).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 6)) : new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), vor);   // aufrecht: eine Fläche des Sechskants zu jeder Hand
    z[n].position.set(0, 0, 0); z[n].quaternion.copy(lage[n]); z[n].updateMatrixWorld(true);
    ruhe[n] = 0.002 - new THREE.Box3().setFromObject(z[n], true).min.y;
  }
  // Faustmitte zum Ursprung: Kettlebell im Griffbogen (bis 3.11. 3 cm unter dem Ursprung, die Hand steckte in der Kugel), eine Kurzhantel für beide Hände unter dem oberen Kopf
  const schwer = (z[namen[0]].userData.kopfR || 0.068) / 0.068;
  const griff = (n) => (n === 'kb' ? 0.016 : halter[n] === 'beide' ? hakenGriff(V(), Y, vor, quer, schwer).hand.l.y : 0);
  const breitGriff = 0.045;
  const kh = beide && !namen.includes('kb');   // eine Kurzhantel in beiden Händen: Haken am oberen Kopf (figur.js)
  const griffY = Math.min(...namen.map((n) => ruhe[n] + griff(n)));
  const erlaubt = tiefen(gelenke(stehen(stand, winkel)), Q).map((t) => t + 0.015);
  // Nach dem Aufstehen: eine Hantel je Hand hängt neben dem Körper, eine für beide Hände vor den Oberschenkeln
  const steh = stehen(stand, winkel), oben = stehen(stand, winkel);
  if (beide) {
    oben.hand = seiten((s, sg) => welt(sg * breitGriff, 0.86, 0.3));
    oben.handflaeche = namen.includes('kb') ? seiten(() => vor.clone().negate()) : seiten((s, sg) => quer.clone().multiplyScalar(-sg));
    oben.haken = kh;
    oben.ellbogenPol = seiten((s, sg) => quer.clone().multiplyScalar(sg).addScaledVector(vor, -0.3));
    // Die Hantel hängt nah vor den Oberschenkeln, die Ellbogen zeigen nach hinten: So bleiben sie beim Hochnehmen unten und gehen nicht zur Seite weg
    if (kh) { const gr = hakenGriff(welt(0, 0.81, 0.25 + (schwer - 1) * 0.068), Y, vor, quer, schwer); oben.hand = gr.hand; oben.kelch = gr.kelch; oben.kelchW = seiten(() => 0); oben.ellbogenPol = seiten((s, sg) => quer.clone().multiplyScalar(sg * 0.3).addScaledVector(vor, -1)); }
  }
  // Hantel (Kapsel) gegen Ober- und Unterschenkel: liegend beim Hinhocken, in der Hand (Lage wie am Boden) beim Aufstehen
  const hantelKapsel = (n, m) => {
    if (n === 'kb') { const c = m.clone().add(V(0, -0.13, 0)); return [c, c, 0.1]; }
    const a = V(1, 0, 0).applyQuaternion(lage[n]).multiplyScalar(0.13); return [m.clone().add(a), m.clone().sub(a), 0.068];
  };
  const inBein = (g, A, B, r) => { let m = -1; for (const t of ['l', 'r']) for (const [C, D, rb] of [[g.huefte[t], g.knie[t], 0.08], [g.knie[t], g.knoechel[t], 0.055]]) m = Math.max(m, r + rb - streckenAbstand(A, B, C, D)); return m; };
  let best = null;
  for (const by of [0.58, 0.52, 0.46, 0.4]) for (const zurueck of [0.2, 0.12, 0.04]) for (const aussen of [0, 0.06, 0.12]) {
    const schulterY = griffY + (beide ? 0.57 : 0.6);
    const neig = Math.max(15, Math.min(75, Math.acos(Math.max(-1, Math.min(1, (schulterY - by) / (MASS.rumpf - 0.03)))) / RAD));
    const p = stehen(stand, winkel, { neigung: neig });
    p.becken = welt(0, by, -zurueck);
    p.fuss = seiten((s, sg) => welt(sg * (beide ? 0.2 : 0.12), FY, 0));
    p.kniePol = seiten((s, sg) => V(sg * (beide ? 0.8 : 0.25), 0, 1).applyQuaternion(q));
    p.fussRicht = seiten((s, sg) => V(sg * (beide ? 0.4 : 0.15), 0, 1).applyQuaternion(q));
    p.haken = beide && !namen.includes('kb');
    const g0 = gelenke(p), sch = seiten((s) => lokal(g0.schulter[s])), knieZ = Math.max(lokal(g0.knie.l).z, lokal(g0.knie.r).z);
    const ort = {}, ziel = {};
    for (const n of namen) {
      const h = halter[n];
      if (h === 'beide') {
        ort[n] = welt(0, ruhe[n], Math.max((sch.l.z + sch.r.z) / 2, knieZ + 0.13) + aussen);
        if (kh) { const gr = hakenGriff(ort[n], Y, vor, quer, schwer); ziel.l = gr.hand.l; ziel.r = gr.hand.r; p.kelch = gr.kelch; p.kelchW = seiten(() => 0); }
        else for (const [s, sg] of [['l', 1], ['r', -1]]) ziel[s] = ort[n].clone().addScaledVector(quer, sg * breitGriff).add(V(0, griff(n), 0));
      } else {
        const sg = h === 'l' ? 1 : -1;
        ort[n] = welt(sg * (Math.max(Math.abs(sch[h].x) + 0.06, 0.28) + aussen), ruhe[n], sch[h].z);
        ziel[h] = ort[n].clone().add(V(0, griff(n), 0));
      }
    }
    // die freie Hand stützt sich aufs Knie
    p.hand = seiten((s) => ziel[s] || g0.knie[s].clone().add(V(0, 0.07, 0)).addScaledVector(vor, 0.02));
    p.handflaeche = seiten((s, sg) => (ziel[s] ? (beide && namen.includes('kb') ? vor.clone().negate() : quer.clone().multiplyScalar(-sg)) : V(0, -1, 0)));
    p.ellbogenPol = seiten((s, sg) => quer.clone().multiplyScalar(sg).addScaledVector(vor, -0.5));
    const g = gelenke(p);
    let fehler = 0, hantel = 0, koerper = 0, beine = 0;
    for (const s of Object.keys(ziel)) fehler = Math.max(fehler, g.hand[s].distanceTo(ziel[s]));
    const t = tiefen(g, Q); for (let k = 0; k < t.length; k++) koerper = Math.max(koerper, t[k] - erlaubt[k]);
    for (const n of namen) { const [A, B, r] = hantelKapsel(n, ort[n]); hantel = Math.max(hantel, kapselTief(A, B, r, Q)); }
    const arme = Math.max(0, armInBein(g, Object.keys(ziel)));
    if (fehler < 0.02) {
      const halt = (gx, n) => (halter[n] === 'beide' ? gx.hand.l.clone().add(gx.hand.r).multiplyScalar(0.5) : gx.hand[halter[n]].clone());
      for (const u of [0.5, 0.8, 1]) { const gu = u === 1 ? g : gelenke(mische(steh, p, glatt(u))); for (const n of namen) beine = Math.max(beine, inBein(gu, ...hantelKapsel(n, ort[n]))); }
      for (const u of [0.2, 0.4, 0.6, 0.8]) {
        const gu = gelenke(mische(p, oben, glatt(u)));
        for (const n of namen) beine = Math.max(beine, inBein(gu, ...hantelKapsel(n, halt(gu, n).add(ort[n].clone().sub(halt(g, n))))));
      }
    }
    const verstoss = Math.max(0, fehler - 0.01) + koerper + hantel + arme + beine;
    const wert = 10 * verstoss + Math.abs(by - 0.5) + 0.5 * Math.abs(zurueck - 0.12) + aussen;
    if (!best || wert < best.wert) best = { wert, verstoss, p, g, ort, fehler, koerper, hantel, arme, beine, by, zurueck, aussen, neig };
  }
  const ablage = {};
  for (const n of namen) {
    const halt = halter[n] === 'beide' ? best.g.hand.l.clone().add(best.g.hand.r).multiplyScalar(0.5) : best.g.hand[halter[n]].clone();
    ablage[n] = { p: best.ort[n], q: lage[n], off: best.ort[n].clone().sub(halt) };
  }
  return { hocke: best.p, oben, ablage, halter, wahl: best };
}

/* ---------- Einleitung bauen ---------- */
// anim = Vorlage, z = ihre Geräte, ger = Geraete, kamera = Richtung der Kamera (dorthin ist Platz zum Anlaufen)
export function baueEinleitung(anim, ger, z, kamera) {
  QAKT = null;   // Geräte dieses Ablaufs erst, wenn sie bekannt sind (unten)
  const obj = Object.values(z).filter((o) => o && o.isObject3D);
  const hanteln = ['kh_l', 'kh_r', 'kb'].filter((n) => z[n] && z[n].isObject3D);
  // Startzeitpunkt: Stange vom Boden (Kreuzheben) unten; Stange im Ständer dort, wo der Körper am aufrechtesten ist bzw. im Liegen oben
  // Griffachse der Kurzhanteln (setzen erst die props) vorher kennen, damit die Hand am Ende so greift wie in der Übung
  if (!z.griffAchse) { const e0 = anim.pose(0, z); if (e0.props) e0.props(gelenke(e0.pose), z); }
  const lage = (t) => {
    const erg = anim.pose(t, z);
    if (z.griffAchse && !erg.pose.griffAchse) erg.pose.griffAchse = z.griffAchse;
    const v = vollstaendig(erg.pose); return { t, erg, ...v };
  };
  const L0 = lage(0), L1 = lage(1);
  const props = (L) => { if (L.erg.props) L.erg.props(L.g, z); for (const o of obj) o.updateMatrixWorld(true); };
  const stangeY = (L) => { props(L); return z.lh ? z.lh.position.y : null; };
  let G = L0;
  const k0 = kategorie(L0.g), k1 = kategorie(L1.g), stehend = k0 === 'stehen' || k1 === 'stehen';
  if (z.lh) {
    const y0 = stangeY(L0), y1 = stangeY(L1);
    if (Math.min(y0, y1) < 0.3) G = y0 <= y1 ? L0 : L1;
    else if (stehend) G = Math.abs(L1.g.becken.y - L0.g.becken.y) > 0.05 ? (L1.g.becken.y > L0.g.becken.y ? L1 : L0) : (y0 <= y1 ? L0 : L1);
    else if (k0 === 'rueckenlage') G = y1 > y0 ? L1 : L0;
  } else if (k0 === 'bauchlage' && k1 === 'bauchlage') G = L1.g.becken.y > L0.g.becken.y + 0.02 ? L1 : L0;   // Liegestütz: oben anfangen (bleibt das Becken, wie beim Vierfüßler: vorn, Bein noch unten)
  else if (stehend && k0 !== 'stehen') G = L1;   // ohne Last aus der Hocke (Kniebeuge): aufrecht anfangen
  if (anim.ablaufT === 1) G = L1;   // Vorlage will oben anfangen (Hantel über dem Kopf: erst hoch, dann die erste Wiederholung; von unten ginge sie durch den Körper)
  if (anim.ablaufUnten) G = L0;   // Vorlage will unten anfangen (Hip Thrust: die Stange kommt vom Boden oder aus dem Haken zur Hüfte, die Übung beginnt dort)
  // ablaufVor (Vorlage): Pose, in die der Ablauf führt; aus ihr geht es zum Schluss in die Startpose (Klimmzug oben halten: erst auf die Box und an die Stange, dann hoch)
  let dannStart = null;
  if (anim.ablaufVor) { dannStart = G.pose; G = { t: G.t, erg: G.erg, ...vollstaendig(anim.ablaufVor()) }; }
  props(G);   // alle Geräte in ihre Startlage
  const art = kategorie(G.g), gg = G.g, Gp = G.pose;
  // Welche Hand hält in der Startpose etwas, und wie liegt der Griff (für das Hingreifen)
  const griffEnde = {}, griffDreh = {};
  { const h = gelenke(Gp); if (G.erg.props) G.erg.props(h, z); ger.nachBild(); haltErkennen(h, z, [], ger.gruppe);
    for (const s of ['l', 'r']) if (h.haelt[s] && h.haelt[s] > 0.007) {
      const nk = h.handRuecken[s].clone().applyAxisAngle(h.handAchse[s].clone().cross(h.handRuecken[s]).normalize(), h.handKnick[s] || 0);
      griffEnde[s] = h.handFinger[s].clone().cross(nk).normalize();
      griffDreh[s] = drehAus(h, s);
    }
    props(G);
  }

  // Latzug (Devin, 2.11.: „packt er von unten nach oben. Und dann packt er das und zieht es runter“; bis dahin im Stehen vor dem Sitz gegriffen, die Stange hing hinter dem Kopf): hinter dem Sitz stehen,
  // über den Sitz steigen (die Füße links und rechts davon), hinsetzen, die Füße unter die Knierolle, dann vorn hoch zur Stange, die senkrecht unter der Rolle hängt (aufrecht gerade erreichbar),
  // zugreifen, zurücklehnen. Die Stange hängt so hoch, wie das Seil in der Startpose lang ist; der Hut bleibt beim Hinsetzen hinter ihr
  let latzug = null;
  if (z.lh && z.seil && art === 'sitzen' && z.lh.position.y > gg.kopf.y) {
    const { blick, stand, steht, unten, fuesse } = ueberSitzPosen(Gp, gg);
    const seilE = [V(0, 0.5, 0), V(0, -0.5, 0)].map((p) => p.applyMatrix4(z.seil.matrixWorld)), rolle = seilE[0].y > seilE[1].y ? seilE[0] : seilE[1];
    const greif = Object.assign({}, fuesse, { hand: seiten((s) => gg.hand[s].clone().add(V(0, 0, rolle.z - z.lh.position.z))), handflaeche: seiten((s) => Gp.handflaeche[s].clone()), ellbogenPol: seiten((s) => Gp.ellbogenPol[s].clone()), kopf: { neigung: -12 }, flach: { l: null, r: null }, greift: GENAU() });
    const erg = anim.pose(G.t, z); if (erg.props) erg.props(gelenke(greif), z);   // Stange und Seil hängen in Ruhe dort
    for (const o of obj) o.updateMatrixWorld(true);
    latzug = { name: 'latzug', blick, stand, griffNach: 4, schritte: [{ ziel: steht, d: 1.1, steigen: { bogen: 0.1, erst: 'l' } }, { ziel: unten, d: DAUER.setzen + 0.1 }, { ziel: fuesse, d: 0.7, steigen: { bogen: 0.03, erst: 'r' } },
      { ziel: greif, d: DAUER.greifen + 0.3, verzug: 0.1 }, { ziel: Gp, d: 0.7 }] };
  }

  // Ständer für eine Langhantel, die nicht am Boden liegt: zwei Pfosten mit Haken unter den Stangenenden (nicht für die Latzugstange am Seil)
  if (z.lh && !z.seil && !anim.ablaufEigen && z.lh.position.y >= 0.3 && (art === 'stehen' || art === 'rueckenlage' || art === 'sitzen')) {
    const c = z.lh.position.clone(), a = V(1, 0, 0).applyQuaternion(z.lh.quaternion).normalize();
    const weg = art === 'rueckenlage' ? waag(gg.R.oben).multiplyScalar(0.12) : waag(gg.R.vor).multiplyScalar(0.24);
    for (const sx of [-1, 1]) {
      const p = c.clone().add(a.clone().multiplyScalar(sx * 0.6)).add(weg);
      ger.box(0.05, c.y + 0.06, 0.05, V(p.x, (c.y + 0.06) / 2, p.z), ger.mRahmen);
      const haken = c.clone().add(a.clone().multiplyScalar(sx * 0.6)).add(weg.clone().multiplyScalar(0.5)).add(V(0, -0.035, 0));
      ger.box(0.04, 0.03, weg.length() + 0.05, haken, ger.mRahmen, 0, winkelVon(weg) / RAD);
    }
  }

  // Kabelzug (Devin, 31.10.: „erst zur Rolle gehen, den Griff holen und rückwärts in Position gehen“): Griff und Seil hängen vor dem
  // Greifen an der Rolle (oben knapp darunter, unten liegt der Griff davor), nicht schon in Übungslage, wo die Figur beim Hinlaufen
  // hindurchginge. Die Figur läuft vor die Rolle, greift (unten aus der Hocke), geht in kurzen Schritten rückwärts auf ihren Platz und
  // geht in die Startpose; ab dem Greifen gehen Griff und Seil mit den Händen. Nur stehend, ein Seil von einer Rolle, Blick zur Rolle
  // (bis 60° daneben); Rolle hinter oder neben der Figur, zwei Türme, Fußschlaufen, Sitzen und Knien bleiben, wie sie sind
  let kabel = null;
  const seile = art === 'stehen' && !latzug && !hanteln.length && !z.seil_r ? [z.seil || z.seil_l].filter((o) => o && o.isMesh) : [];
  if (seile.length === 1) {
    const s = seile[0], E = [V(0, 0.5, 0), V(0, -0.5, 0)].map((p) => p.applyMatrix4(s.matrixWorld));
    const hm = gg.hand.l.clone().add(gg.hand.r).multiplyScalar(0.5), aI = E[0].distanceTo(hm) > E[1].distanceTo(hm) ? 0 : 1;
    const A = E[aI], ende = E[1 - aI], dl = gg.hand.l.distanceTo(ende), dr = gg.hand.r.distanceTo(ende);
    const beide = dl < 0.32 && dr < 0.32, haelt = dl <= dr ? 'l' : 'r';
    const fuss = Math.min(gg.knoechel.l.distanceTo(ende), gg.knoechel.r.distanceTo(ende)) < Math.min(dl, dr);   // Fußschlaufe
    const S = klassisch(art, G, Gp, gg).stand.clone().setY(0), Ah = V(A.x, 0, A.z), aus = S.clone().sub(Ah), dist = aus.length();
    const wB = winkelVon(waag(gg.R.vor)), wF = winkelVon(Ah.clone().sub(S)), dw = kurz(wB - wF);
    if (dist > 0.45 && !fuss && Math.min(dl, dr) < 0.3 && Math.abs(dw) < 1.05) {
      aus.divideScalar(dist);
      const vor = aus.clone().negate(), links = V(vor.z, 0, -vor.x), hoch = A.y > 0.75;   // Rolle mittel oder oben: Griff hängt daran
      const breit = beide ? Math.min(0.25, Math.max(0.06, gg.hand.l.distanceTo(gg.hand.r) / 2)) : 0;
      // oben hängt der Griff knapp unter der Rolle; unten liegt er ein Stück vor dem Turm am Boden (sonst stieße der Kopf beim Bücken an die Säule)
      const R = hoch ? A.clone().addScaledVector(aus, 0.08).add(V(0, -0.16, 0)) : Ah.clone().addScaledVector(aus, 0.35).setY(0.07);
      // Rolle hinter der Säulenkante: Griff so weit nach vorn, dass er frei vom Turm hängt
      const fest = quader(ger, new Set([...hanteln.map((n) => z[n]), ...obj]));
      for (let k = 0; k < 15 && fest.some((q) => q.top > R.y - 0.1 && q.bot < R.y + 0.1 && abstand2(R.x, R.z, q.grund) < 0.1); k++) R.addScaledVector(aus, 0.02);
      const F = hoch ? V(R.x, 0, R.z).addScaledVector(aus, 0.36) : Ah.clone().addScaledVector(aus, 0.85);
      const mitHaenden = (pos, o, m) => {
        const p = stehen(pos, wF, o);
        for (const [k, sg] of [['l', 1], ['r', -1]]) if (beide || k === haelt) p.hand[k] = m.clone().addScaledVector(links, beide ? sg * breit : 0);
        return p;
      };
      const tief = hoch ? 0 : Math.min(0.5, Math.max(0, (0.95 - R.y) * 0.6));
      const greifen = mitHaenden(F, { tief, neigung: hoch ? 2 : 10 + 30 * Math.min(1, Math.max(0, (0.9 - R.y) / 0.6)) }, R);
      if (hoch) greifen.ellbogenPol = seiten((k, sg) => V(sg, -0.4, 0).applyQuaternion(drehY(wF)));
      // oben: erst die Hände vor die Brust, dann hinauf zum Griff (im großen Bogen nach vorn gingen die Arme durch die Säule); unten: nach
      // dem Greifen mit langen Armen aufrichten, der Griff bleibt vor den Beinen
      const vorn = (y, d) => F.clone().addScaledVector(vor, d).setY(y);
      const schritte = hoch ? [{ ziel: mitHaenden(F, {}, vorn(Math.min(1.3, R.y), 0.34)), d: 0.45 }, { ziel: greifen, d: DAUER.greifen }]
        : [{ ziel: greifen, d: DAUER.greifen + 0.45, verzug: 0.2 }];
      const griffNach = schritte.length;
      if (!hoch) schritte.push({ ziel: mitHaenden(F, {}, vorn(0.72, 0.42)), d: 0.6 });
      const n = Math.max(1, Math.ceil(F.distanceTo(S) / 0.35));   // rückwärts, Schritte bis 35 cm, Griff vor dem Bauch
      for (let i = 1; i <= n; i++) {
        const P = F.clone().lerp(S, i / n);
        schritte.push({ ziel: mitHaenden(P, {}, P.clone().addScaledVector(vor, 0.3).setY(1.02)), d: 0.5, steigen: { bogen: 0.05, erst: i % 2 ? 'l' : 'r' } });
      }
      schritte.push(Object.assign({ ziel: Gp, d: DAUER.greifen + 0.3 + 0.3 * Math.abs(dw) }, Math.abs(dw) > 0.15 ? { dreh: { m: S, w: dw } } : {}));
      // Griff und Seil in Ruhe so, wie die Hände sie beim Greifen halten; geht der Körper dabei (ohne Griff und Seil) zu tief in Teile,
      // bleibt der alte Ablauf
      const vorher = obj.map((o) => o.matrixWorld.clone());
      if (G.erg.props) G.erg.props(gelenke(greifen), z);
      for (const o of obj) o.updateMatrixWorld(true);
      const bewegt = new Set(obj.filter((o, i) => !o.matrixWorld.equals(vorher[i])));
      const Qo = quader(ger, new Set([...hanteln.map((n) => z[n]), ...bewegt])), posen = [stehen(F, wF)];
      let von = posen[0];
      for (const st of schritte.slice(0, -1)) { const f = uebergang(von, st); for (const u of [0.25, 0.5, 0.75, 1]) posen.push(f(u)); von = st.ziel; }
      const erl = tiefen(gg, Qo).map((t, i) => t + (i % NG === 2 ? 0.08 : 0.015));   // Hände dürfen an Rolle und Turm (sie greifen dort)
      if (stoss(posen, Qo, erl) < 0.03) kabel = { name: 'kabelholen', blick: vor, stand: F, schritte, griffNach };
      else props(G);
    }
  }

  // ablaufEigen (Vorlage): eigener Einstieg { name, blick, stand, von, schritte, griffNach, ruhe }. ruhe = Pose beim Greifen: die Geräte liegen bis dahin so, wie die Hände sie dann
  // halten (Stange oder Band am Boden, Stange oben im Haken), statt in Übungslage im Weg zu stehen. Ab dem Greifen führen die props der Vorlage sie aus der Pose
  const eigen = anim.ablaufEigen ? anim.ablaufEigen({ Gp, gg, stehen, haendeAufBeinen }) : null;
  if (eigen && eigen.ruhe && G.erg.props) { G.erg.props(gelenke(eigen.ruhe), z); for (const o of obj) o.updateMatrixWorld(true); }

  // Geräte als Hindernisse; erlaubt ist, was die Startpose selbst berührt (Sitz, Polster, Griffe)
  const Q = quader(ger, new Set(hanteln.map((n) => z[n])));
  QAKT = Q;   // für haendeAufBeinen (Ellbogen nicht ins Gerät)
  const erlaubtEnde = tiefen(gg, Q).map((t) => t + 0.015);
  const bewerten = (plan) => {
    let von = stehen(plan.stand, winkelVon(plan.blick)); const posen = [von];
    for (const s of plan.schritte) { const f = uebergang(von, s); for (const u of s.dreh ? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] : [0.2, 0.4, 0.6, 0.8]) posen.push(f(u)); von = s.ziel; }   // Eindrehen feiner: die Beine streifen nur kurz
    return stoss(posen, Q, erlaubtEnde);
  };
  // Wo die Figur vor dem Gerät steht, wohin sie schaut und wie sie in die Startpose kommt: der klassische Einstieg, außer ein anderer
  // taucht deutlich weniger in die Geräte ein (Hanteln und Langhantel: immer klassisch)
  // Hanteln: welche Hand hält welche (Startpose; beide Hände nah an einer Hantel: Goblet, Kettlebell, Überzug)
  const halter = {};
  for (const n of hanteln) {
    const p = z[n].getWorldPosition(V()), dl = p.distanceTo(gg.hand.l), dr = p.distanceTo(gg.hand.r);
    halter[n] = dl < 0.2 && dr < 0.2 ? 'beide' : dl <= dr ? 'l' : 'r';
  }
  const hantelArt = hanteln.length ? (Object.values(halter).includes('beide') ? 'beide' : true) : false;
  const plaene = [eigen || kabel || latzug || klassisch(art, G, Gp, gg, hantelArt, !griffEnde.l && !griffEnde.r, anim.sitzVersatz || 0)];
  // Hanteln oder Stange im Sitzen: der Einstieg steht schon vor dem Aufheben fest (aufgehoben wird am Standplatz), darum hier wählen. Steht ein Pult oder
  // Polster so vor den Oberschenkeln, dass das Hinsetzen von vorn in es hineinläuft (Scott-Bank, Befund 6.11.: Oberschenkel 8–10 cm im Pult), steigt die Figur von hinten über den Sitz
  if (anim.ueberSitz && (hanteln.length || (z.lh && !z.seil)) && art === 'sitzen' && !eigen && !kabel && !latzug && auflage(Q, gg.becken) > 0.2 && auflage(Q, gg.becken) < 0.6) {
    const w0 = bewerten(plaene[0]);
    let best = null;
    for (const b of [0.2, 0.27, 0.34]) for (const v of [0.02, 0.12, 0.22]) { const p = ueberSitz(Gp, gg, b, v, 0.4); p.stoss = bewerten(p); if (!best || p.stoss < best.stoss) best = p; }
    // Zuletzt die Arme von oben auf das Pult legen: erst die Hände etwas anheben und die Ellbogen nach oben, sonst fegen die Arme von der Seite durch das Pult (Befund 6.11.: Unterarm 4–5 cm darin)
    best.schritte.splice(best.schritte.length - 1, 0, { ziel: Object.assign({}, Gp, { hand: seiten((k) => Gp.hand[k].clone().add(V(0, 0.1, 0))), ellbogenPol: seiten((k, sg) => V(sg * 0.5, 1, 0)) }), d: 0.3, verzug: 0.2 });
    if (w0 > 0.03 && best.stoss < w0 - 0.02) plaene[0] = best;
  }
  // Vorlage kann den Stehplatz verschieben (Wand, Rahmen oder Rollen genau dort, wo das Becken der Startpose ist) und dem letzten Schritt einen Bogen geben (Fuß hinauf auf die Bank)
  if (!kabel && !latzug && anim.schrittExtra) Object.assign(plaene[0].schritte[plaene[0].schritte.length - 1], anim.schrittExtra);
  // Erhöhter Stand (Klimmzug-Box, Stufe beim Wadenheben): statt in der Box zu stehen vor die Kante laufen und hinaufsteigen; von der
  // Seite, wo der Körper am wenigsten in Teile eintaucht (vorwärts hinauf bevorzugt). Tritt gegen den klassischen Einstieg an (unten),
  // der bleibt, wo das Hinaufsteigen mehr streift (Wadenmaschine: Kopf an den Griffen)
  const aufrecht = art === 'stehen' || art === 'haengen' || (art === 'sonst' && gg.becken.y > 0.75 && gg.R.oben.y > 0.8);   // sonst: einbeinig, Fersen oben
  const plattform = !latzug && !kabel && aufrecht ? plattformUnter(gg, Q) : null;
  if (plattform) {
    const blick = waag(gg.R.vor), quer = V(blick.z, 0, -blick.x);
    let best = null;
    for (const d of [blick.clone().negate(), quer, quer.clone().negate(), blick]) {
      const p = aufsteigen(art, Gp, gg, plattform, d, hantelArt);
      if (!p) continue;
      const w = bewerten(p) + (p.vorwaerts ? 0 : 0.004);
      if (!best || w < best.w) best = { p, w };
    }
    // Mit Hanteln steht der Einstieg vor dem Aufheben fest (aufgehoben wird am Standplatz, also vor der Stufe): dann gleich hier wählen
    if (best) { const w0 = hanteln.length ? bewerten(plaene[0]) : 0; if (hanteln.length && best.w < w0 - 0.02) plaene[0] = best.p; else plaene.push(best.p); }
  }
  // Stange quer über dem Stehplatz in Brusthöhe (Smith-Maschine, Ausfallschritt, Kniebeuge; Befund 5.11.: die Figur lief aufrecht durch die Stange,
  // Befund 6.11.: bei der Kniebeuge mit Stange hinten steckte der Rumpf 6–8 cm in ihr): vor bzw. hinter der Stange ankommen, geduckt darunter durch,
  // unter ihr aufrichten und in die Startpose (bis 6.11. nur im Ausfallschritt, Kniebeugen aus dem Ständer liefen aufrecht in die Stange)
  if (art === 'stehen' && z.lh && !z.seil && !kabel && !hanteln.length && z.lh.position.y > 1.0 && z.lh.position.y < 1.6) {
    const k = plaene[0], w = winkelVon(k.blick), yS = z.lh.position.y, SL = V(z.lh.position.x, 0, z.lh.position.z);
    if (Math.abs(SL.clone().sub(k.stand.clone().setY(0)).dot(k.blick)) < 0.3) for (const sgD of [1, -1]) for (const tief of [0.25, 0.35]) {
      const d = k.blick.clone().multiplyScalar(sgD), unter = SL.clone().addScaledVector(d, -0.05);
      const duck = stehen(unter, w, { tief, neigung: 25 });
      plaene.push({ name: 'ducken' + (sgD > 0 ? 'V' : 'H') + tief, blick: k.blick, stand: SL.clone().addScaledVector(d, -0.42),
        schritte: [{ ziel: duck, d: 0.9 }, { ziel: Gp, d: DAUER.greifen + 0.4, verzug: 0.35 }] });
    }
  }
  if (Q.length && !hanteln.length && !z.lh) {
    if (art === 'sitzen' && auflage(Q, gg.becken) > 0.2) for (const sg of [1, -1])   // seitlich nur auf einen Sitz
      for (const zurueck of [0.03, 0.1]) for (const heben of [0.1, 0.03]) plaene.push(seitlichSetzen(Gp, gg, sg, zurueck, heben));
    if (art === 'sitzen' && auflage(Q, gg.becken) > 0.2 && auflage(Q, gg.becken) < 0.6) for (const b of [0.2, 0.27, 0.34]) for (const v of [0.02, 0.12, 0.22]) plaene.push(ueberSitz(Gp, gg, b, v));   // niedriger Sitz: von hinten darübersteigen (Füße beim Hinsetzen neben dem Sitz)
    if (art === 'rueckenlage') for (const d of [0.35, 0.5, 0.62]) plaene.push(langsitz(Gp, gg, Q, d));
    if (art === 'bauchlage' && gg.becken.y >= 0.5) for (const sg of [1, -1]) { const p = aufBauchlage(Gp, gg, Q, sg); if (p) plaene.push(p); }
    if (art === 'haengen' || art === 'sonst') { const p = aufKniepolster(Gp, gg, Q, art); if (p) plaene.push(p); }
    // Hoher Sitz unter dem Becken, Beine nach vorn hinauf oder lang (Beinpresse, Beinbeuger sitzend): seitlich hinsetzen, dann die Beine hinauf und eindrehen.
    // Davor stehen Rahmen, Rolle oder Plattform; weiter vorn absetzen, wo hinten eine schräge Lehne steht
    if ((art === 'rueckenlage' || art === 'sonst') && gg.becken.y > 0.45 && auflage(Q, gg.becken) > 0.3)
      for (const sg of [1, -1]) for (const zurueck of [0.03, -0.06, -0.12]) plaene.push(seitlichSetzen(Gp, gg, sg, zurueck, 0.1, art === 'rueckenlage' ? waag(gg.R.oben).negate() : null));
    if (((art === 'bauchlage' || art === 'seitlage') && gg.becken.y >= 0.5 && Math.min(gg.knoechel.l.y, gg.knoechel.r.y) < 0.4) || anim.einstiegVorgebeugt) for (const d of [0.32, 0.45, ...(anim.einstiegVorgebeugt ? [0.6] : [])]) plaene.push(vorgebeugt(Gp, gg, d));
  }
  if (eigen) plaene.length = 1;
  if (anim.standVersatz && !kabel && !latzug) for (const p of plaene) p.stand = p.stand.clone().add(anim.standVersatz);
  // Stange vor der Brust (Frontkniebeuge; Befund 6.11.: am Stehplatz der Startpose steht der Körper fast an der Stange, die Schultern liefen beim Eindrehen
  // 4 cm hinein): bis 20 cm weiter hinten ankommen, bis aufrecht und halb eingedreht nichts mehr eintaucht, und erst mit dem Greifen an die Stange treten
  if (art === 'stehen' && z.lh && !z.seil && !kabel && !latzug && !hanteln.length && z.lh.position.y > 1.0 && z.lh.position.y < 1.6 && z.lh.position.clone().sub(gg.kopf).dot(waag(gg.R.vor)) > 0) {
    const k = plaene[0], w = winkelVon(k.blick), frei = new Float32Array(Q.length * NG);
    for (let i = 0; i <= 5; i++) {
      const P = k.stand.clone().addScaledVector(k.blick, -0.04 * i);
      if (i === 5 || stoss([stehen(P, w), stehen(P, w + 0.7), stehen(P, w - 0.7)], Q, frei) < 0.01) { k.stand = P; break; }
    }
  }
  const abgerueckt = new Map();   // gleiche Lage und gleiches Hinsetzen (Varianten, die sich erst beim Eindrehen unterscheiden): nur einmal rechnen
  for (const p of plaene) {
    // Vor dem Sitz: so weit abrücken (bis 20 cm), wie es das Eintauchen beim Stehen, Umdrehen und Hinsetzen verringert (sonst streift
    // beim Umdrehen der innere Fuß den Sitz oder der Fuß steht auf dem Bodenrahmen); nur, wenn es mindestens 1 cm bringt
    if (p.abruecken) {
      const schluessel = p.name.split('/')[0];
      if (!abgerueckt.has(schluessel)) {
        const w = winkelVon(p.blick), P0 = p.stand.clone(), setzen = p.schritte[0];
        const pruefen = (P) => { const st = stehen(P, w), f = uebergang(st, setzen); return stoss([st, stehen(P, w + 1.2), stehen(P, w - 1.2), f(0.25), f(0.5)], Q, erlaubtEnde); };
        let best = 0, bestWert = pruefen(P0);
        const wert0 = bestWert;
        if (wert0 >= 0.01) for (let i = 1; i <= 5; i++) { const x = pruefen(P0.clone().add(p.blick.clone().multiplyScalar(0.04 * i))); if (x < bestWert - 0.002) { bestWert = x; best = i; } }
        abgerueckt.set(schluessel, bestWert < wert0 - 0.01 ? 0.04 * best : 0);
      }
      p.stand.add(p.blick.clone().multiplyScalar(abgerueckt.get(schluessel)));
    }
    p.stoss = bewerten(p);
  }

  // Anlauf: von der Seite (quer zur Kamera), bleibt auf der Bodenscheibe. Ist der gerade Weg frei, bleibt er; sonst um die Geräte herum
  const kh = waag(kamera || V(0.62, 0.32, 0.72)), seitlich = V(kh.z, 0, -kh.x);
  const startVon = (stand, sg) => { const s = stand.clone().setY(0).add(kh.clone().multiplyScalar(-0.25)).add(seitlich.clone().multiplyScalar(1.4 * sg)); if (V(s.x, 0, s.z).length() > 1.9) s.setLength(1.9); return s; };
  let R = null, QW = Q; const W = {};   // QW: Hindernisse beim Laufen (mit den Hanteln am Boden)
  const weg = (plan) => {
    const wEnde = winkelVon(plan.blick), P = plan.stand.clone().setY(0), start = plan.von || startVon(P, 1);   // von (ablaufEigen): Anlauf von dort (Pull-Through: quer zum Seil, nicht an ihm entlang)
    const erlaubt = tiefen(gelenke(stehen(P, wEnde)), QW).map((t) => t + 0.015);   // beim Laufen zählt nur, was die Figur am Standpunkt berührt
    const gerade = [], meter = start.distanceTo(P), richt = winkelVon(P.clone().sub(start));
    for (let s = 0, i = 0; s <= meter; s += 0.08, i++) gerade.push(gehend(start.clone().lerp(P, s / meter), richt, i, meter - s));
    for (const u of [0.5, 1]) gerade.push(stehen(P, richt + kurz(wEnde - richt) * u));
    let stossGerade = QW.length ? stoss(gerade, QW, erlaubt) : 0;
    if (stossGerade >= 0.015) { if (!R) R = raster(QW); stossGerade = Math.max(stossGerade, quer(P, start, meter, R)); }
    if (stossGerade < 0.015 || plan.von) return { punkte: [start, P], stoss: stossGerade, laenge: meter };
    if (!R) R = raster(QW);
    let best = null;
    for (const sg of [1, -1]) {
      let s = startVon(P, sg), k = zelleVon(s.x, s.z);
      if (k < 0 || R.frei[k] < 0) {   // Start steht im Gerät: nächste freie Zelle
        let bk = -1, bd = Infinity;
        for (let i = 0; i < NZ * NZ; i++) if (R.frei[i] >= 0) { const d = mitteVon(i).distanceTo(s); if (d < bd) { bd = d; bk = i; } }
        if (bk < 0) continue; k = bk; s = mitteVon(k);
      }
      W[sg] = W[sg] || wege(R, k);
      const a = anlauf(P, wEnde, W[sg], R, QW, erlaubt);
      if (!a) continue;
      a.punkte[0] = s;
      a.wert = a.laenge + 12 * a.stoss + (sg < 0 ? 0.4 : 0);
      if (!best || a.wert < best.wert) best = a;
    }
    // Langhantel: neuer Weg nur, wenn er klar besser ist (dieser Ablauf soll bleiben, wie er war)
    return best && best.stoss < stossGerade - (z.lh ? 0.035 : 0.005) ? best : { punkte: [start, P], stoss: stossGerade, laenge: meter };
  };
  // Einstieg wählen: Eintauchen beim Einsteigen und auf dem letzten Stück des Wegs zusammen
  const hinten = (p) => (p.stand.clone().sub(gg.becken).setY(0).dot(kh) < -0.1 ? 0.015 : 0);
  const klass = plaene[0], wert = (p) => Math.max(p.stoss, p.weg.stoss) + hinten(p);
  // Hanteln (immer der klassische Einstieg): wo liegen sie am Boden; beim Hinlaufen weicht die Figur ihnen aus. Aufgehoben wird am Standpunkt, ist dort kein Platz
  // (vor einer Bank, unter einem Polster), bis 60 cm davor, dahinter oder daneben; danach ein, zwei Schritte zum Standpunkt
  let auf = null;
  if (hanteln.length) {
    const w0 = winkelVon(klass.blick), quer = V(klass.blick.z, 0, -klass.blick.x);
    for (const [d, r] of [[0, 0], [0.15, 0], [-0.15, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.45, 0], [-0.45, 0], [-0.3, 0.3], [-0.3, -0.3], [0, 0.5], [0, -0.5], [-0.6, 0]]) {
      const A = klass.stand.clone().addScaledVector(klass.blick, d).addScaledVector(quer, r), a = aufhebePlan(A, w0, z, halter, Q);
      if (anim.aufhebeFrei) a.wahl.verstoss = Math.max(a.wahl.verstoss, stoss([stehen(A, w0), stehen(A.clone().lerp(klass.stand, 0.5), w0), stehen(klass.stand, w0)], Q, erlaubtEnde));   // Vorlage: auch aufrecht und auf dem Weg zum Stehplatz muss Platz sein (Negativbank: in der Hocke frei, aufrecht in der Rolle)
      if (!auf || a.wahl.verstoss < auf.wahl.verstoss - 0.005) auf = Object.assign(a, { A, d: Math.hypot(d, r) });
      if (auf.wahl.verstoss < 0.005) break;
    }
    for (const n of hanteln) { z[n].position.copy(auf.ablage[n].p); z[n].quaternion.copy(auf.ablage[n].q); z[n].updateMatrixWorld(true); }
    QW = quader(ger, new Set());
  }
  klass.weg = weg(auf ? Object.assign({}, klass, { stand: auf.A }) : klass);
  let plan = klass;
  // Unter einer Stange in Körperhöhe und vor einer Stufe oder Box wird immer verglichen (der Planer erlaubt am Standplatz, was die Startpose berührt: dort liegt die Stange erst nach dem
  // Untertreten auf dem Körper, und der Fuß steht erst nach dem Hinaufsteigen auf der Stufe, nicht schon in ihr)
  if (wert(klass) > 0.03 || plaene.some((p) => p.name.startsWith('ducken') || p.name.startsWith('aufsteigen'))) {
    for (const p of plaene.slice(1).filter((p) => p.stoss < wert(klass) - 0.02).sort((a, b) => a.stoss - b.stoss).slice(0, 3)) {
      p.weg = weg(p);
      if (wert(p) < wert(plan) - (plan === klass ? 0.02 : 0)) plan = p;
    }
  }
  const { blick, stand, schritte } = plan, winkel = winkelVon(blick);

  // Zeitleiste
  const teile = [], b = bahn(plan.weg.punkte, winkel), meter = b.laenge;
  const tGehen = Math.max(0.6, meter * DAUER.gehen);
  teile.push({ d: tGehen, bild: (u) => { const w = glatt(u) * 0.7 + u * 0.3, s = w * meter; return stehen(b.punkt(s), b.richtung(s), { phase: (s / 0.44) * Math.PI, schritt: 0.2 * Math.min(1, u * 5, (1 - u) * 5) }); } });
  const richtung = b.richtung(meter), dw = kurz(winkel - richtung), ankunft = auf ? auf.A : stand;
  teile.push({ d: DAUER.drehen, bild: (u) => stehen(ankunft, richtung + dw * glatt(u)) });
  let vorher = stehen(ankunft, winkel), haeltAb = Infinity, tMit = Infinity;
  // Hanteln: in die Hocke, greifen, aufstehen (und vom Platz zum Aufheben ein, zwei Schritte zum Standpunkt)
  if (auf) {
    const { hocke, oben } = auf, von = vorher;
    haeltAb = teile.reduce((a, x) => a + x.d, 0) + DAUER.aufheben;
    tMit = haeltAb + DAUER.aufheben;
    teile.push({ d: DAUER.aufheben, bild: (u) => mische(von, hocke, glatt(u)) });
    teile.push({ d: DAUER.aufheben, bild: (u) => mische(hocke, oben, glatt(u)) });
    vorher = oben;
    if (auf.d) {
      const D = stand.clone().sub(auf.A).setY(0);
      const schieben = (p, v) => Object.assign({}, p, { becken: p.becken.clone().addScaledVector(D, v), hand: seiten((s) => p.hand[s].clone().addScaledVector(D, v)), kelch: kelchVersetzt(p.kelch, D.clone().multiplyScalar(v)) });
      teile.push({ d: 0.3 + Math.abs(auf.d) * 1.5, bild: (u) => {
        const p = schieben(oben, glatt(u));
        p.fuss = seiten((s, sg) => { const v = glatt((u - (sg > 0 ? 0 : 0.45)) / 0.55), f = oben.fuss[s].clone().addScaledVector(D, v); f.y += 0.06 * Math.sin(Math.PI * v); return f; });
        return p;
      } });
      vorher = schieben(oben, 1); vorher.fuss = seiten((s) => oben.fuss[s].clone().add(D));
    }
  }
  // Bis die Übung die Hanteln führt (tMit), setzt die Einleitung sie selbst: vor dem Greifen am Boden, beim Aufstehen in der Hand,
  // aus der Lage am Boden in die Haltung der Übung gedreht (kein Sprung beim Greifen)
  const halten = (sek, p) => {
    if (sek < haeltAb) { for (const n of hanteln) { z[n].position.copy(auf.ablage[n].p); z[n].quaternion.copy(auf.ablage[n].q); } return; }
    const g = gelenke(p), w = glatt((sek - haeltAb) / DAUER.aufheben), erg = anim.pose(G.t, z);
    if (erg.props) erg.props(g, z);
    for (const n of hanteln) {
      const a = auf.ablage[n], h = auf.halter[n], halt = h === 'beide' ? g.hand.l.clone().add(g.hand.r).multiplyScalar(0.5) : g.hand[h].clone();
      // Kurzhantel ist symmetrisch: um 180° gedreht sieht sie gleich aus, also zur näheren der beiden Lagen drehen (sonst schwenkt sie quer durchs Bein)
      const qU = z[n].quaternion.clone(), offU = z[n].position.clone().sub(halt);
      if (n !== 'kb' && h !== 'beide') { const um = qU.clone().multiply(UM_Y); if (Math.abs(um.dot(a.q)) > Math.abs(qU.dot(a.q))) qU.copy(um); }
      z[n].position.copy(halt).add(a.off.clone().lerp(offU, w));
      z[n].quaternion.copy(a.q).slerp(qU, w);
    }
  };
  // Hinsetzen/Hinlegen/Knien, zuletzt greifen
  const tGriff = teile.reduce((a, x) => a + x.d, 0) + schritte.slice(0, plan.griffNach || schritte.length).reduce((a, x) => a + x.d, 0) - 0.05;   // griffNach: Hände halten schon nach so vielen Schritten (Latzug)
  // Greifen als Bewegung (Devin, 1.11.: „seine Hände öffnen und zu den Griffen bewegen … greift die Griffe … drückt die auch“): die Hand öffnet
  // sich auf dem Weg, dreht sich schon zum Griff hin und schließt sich beim Ankommen. griffPlan je Hand: Achse des Griffs, Ankunft, Dauer des Wegs
  const griffPlan = {};
  { const tSchritte = teile.reduce((a, x) => a + x.d, 0);
    for (const s of ['l', 'r']) {
      if (!griffEnde[s]) continue;
      if (auf) { griffPlan[s] = { achse: null, an: haeltAb, weg: DAUER.aufheben }; continue; }   // Hantel am Boden liegt anders als in der Übung: die Hand richtet sich erst am Griff nach ihr
      let t = tSchritte, an = null, weg = 0;
      schritte.forEach((st, i) => {
        const dort = plan.griffNach ? i === plan.griffNach - 1 : st.ziel.hand && st.ziel.hand[s] && st.ziel.hand[s].distanceTo(Gp.hand[s]) < 0.015;
        if (an == null && dort) { an = t + st.d; weg = st.d * (1 - (st.verzug || 0)); }
        t += st.d;
      });
      if (an != null) griffPlan[s] = { achse: griffEnde[s], an, weg: Math.max(0.3, weg) };
    }
  }
  if (auf && Gp.kelch && Gp.kelchW.l > 0) for (const s of schritte) { s.aussen = 0; s.vorne = 0.03; }
  if (auf && Gp.kelch && Gp.kelchW.l < 0) for (const s of schritte) { s.aussen = 0; if (s.ziel === Gp) { s.vorne = art === 'rueckenlage' ? 0.46 : 0.04; s.d += 0.5; } }   // über den Kopf: erst hoch, dann hinüber; das braucht etwas länger
  // Griff am Ende quer zum Körper und die Hanteln auf den Knien: Die Ellbogen bleiben unten. Zur Seite weg läge der Unterarm auf dem Weg längs zum Griff, und die Hand kippte im Bildtakt hin und her (bis 3.11. beim Wadenheben im Sitzen)
  const knieQuer = auf && art === 'sitzen' && griffEnde.l && Math.abs(griffEnde.l.dot(gg.R.links)) > 0.9 && Math.abs(gg.hand.l.y - gg.huefte.l.y - 0.07) < 0.13;
  if (knieQuer) for (const s of schritte) if (s.ziel !== Gp) s.ziel = Object.assign({}, s.ziel, { ellbogenPol: seiten((k, sg) => gg.R.links.clone().multiplyScalar(sg * 0.35).addScaledVector(gg.R.oben, -1).addScaledVector(gg.R.vor, -0.3)) });
  for (const s of schritte) { teile.push({ d: s.d, bild: uebergang(vorher, s) }); vorher = s.ziel; }
  if (dannStart) { const st = { ziel: dannStart, d: 0.9 }; teile.push({ d: st.d, bild: uebergang(vorher, st) }); vorher = dannStart; }
  // Kommt die Hand erst mit dem letzten Schritt an, bleibt kurz Zeit zum Zugreifen, bevor die Übung beginnt
  const tEnde = teile.reduce((a, x) => a + x.d, 0);
  if (Object.values(griffPlan).some((p) => p.an > tEnde - 0.2)) { const ziel = vorher; teile.push({ d: 0.3, bild: () => ziel }); }
  const griffStand = (sek) => {
    const zu = {}, offen = {}, vor = {};
    for (const s of ['l', 'r']) {
      const p = griffPlan[s]; if (!p) continue;
      const von = p.an - p.weg;
      offen[s] = glatt((sek - von) / (p.weg * 0.55)); zu[s] = glatt((sek - p.an + 0.1) / 0.32);
      if (p.achse) vor[s] = { achse: p.achse, anteil: glatt((sek - von) / p.weg), dreh: griffDreh[s] };
      // Hantel in einer Hand, sie folgt schon der Faust: Der Griff liegt wie in der Übung, die Hand nimmt also immer dieselbe der beiden möglichen Lagen (bis 3.11. sprang sie beim Wadenheben im Sitzen im Bildtakt zwischen beiden)
      else if (knieQuer && sek >= tMit && griffEnde[s]) vor[s] = { achse: griffEnde[s], anteil: 1, dreh: griffDreh[s] };
    }
    return { griffZu: zu, handAuf: offen, griffVor: vor };
  };
  const dauer = teile.reduce((a, x) => a + x.d, 0);
  // Handtuch (Rolle am Ellbogen, Tuch zwischen den Händen): hängt nicht in der Luft, bis die Figur es in der Hand hat
  const tuch = z.tuch && z.tuch.isObject3D ? z.tuch : null;
  if (tuch) tuch.visible = false;
  return {
    dauer, tStart: G.t, griffPlan,
    // Pose zur Zeit sek (setzt bis zum Aufstehen auch die Hanteln); gehtMit: ab wann die Geräte mit den Händen mitgehen (Hanteln nach
    // dem Aufstehen, sonst nach dem Greifen)
    pose(sek) {
      let x = sek, p = null;
      for (const teil of teile) { if (x <= teil.d) { p = teil.bild(teil.d > 0 ? x / teil.d : 1); break; } x -= teil.d; }
      if (!p) p = teile[teile.length - 1].bild(1);
      if (auf && sek < tMit) halten(sek, p);
      if (tuch) tuch.visible = sek >= Math.min(tMit, tGriff);
      return Object.assign({}, p, griffStand(sek));
    },
    gehtMit: (sek) => sek >= Math.min(tMit, tGriff),
    // zum Prüfen: Art, gewählter Einstieg, Ende des Laufens (mit Drehen)
    art, einstieg: plan.name, phasen: { gehenBis: tGehen + DAUER.drehen }, aufheben: auf && Object.assign({ d: auf.d }, auf.wahl)
  };
}

// Art der Startpose aus den Gelenken
export function kategorie(g) {
  const fussY = Math.max(g.knoechel.l.y, g.knoechel.r.y), oben = g.R.oben.y, vorY = g.R.vor.y;
  const haendeOben = Math.min(g.hand.l.y, g.hand.r.y) > g.kopf.y;
  if (fussY > 0.25 && haendeOben && oben > 0.5) return 'haengen';
  if (fussY < 0.2 && g.becken.y > 0.75) return 'stehen';
  if (fussY < 0.25 && oben > 0.5 && g.becken.y > 0.3) return 'sitzen';
  if (Math.abs(oben) < 0.6) return vorY > 0.4 ? 'rueckenlage' : vorY < -0.4 ? 'bauchlage' : 'seitlage';
  if (Math.min(g.knie.l.y, g.knie.r.y) < 0.15) return 'knien';
  return 'sonst';
}

// Für die Status-Seite (Posen ineinander überführen)
export { mische, vollstaendig, drehePose, uebergang };
