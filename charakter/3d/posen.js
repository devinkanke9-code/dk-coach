// DK Coach — Posen für die Status-Seite (Devin, 2.11.: „Arme … gecrossed … bestimmte Posen … Front Double Bicep, Rücken oder Beine“).
// Jede Pose ist eine vollständige Pose für gelenke(), dazu pump: wie hart welcher Muskel angespannt ist (je Seite), spann und anstrengung.
// Blick +z. Rücken ist dieselbe Figur um 180° gedreht, er dreht sich mit zwei kleinen Schritten dorthin
import * as THREE from 'three';
import { MASS } from './figur.js';
import { BAU } from './figur-modell.js';
import { stehen, uebergang } from './einleitung.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const seiten = (f) => ({ l: f('l', 1), r: f('r', -1) });
const FY = 0.08;
const ARMK = () => (MASS.oberarm + MASS.unterarm) / 0.56, SB = () => MASS.schulterBreite;
const allesPump = (w) => ({ bizeps: w, trizeps: w, lat: w, schulter: w, unterarme: w, quadrizeps: w, beinbeuger: w, gesaess: w, waden: w });

// Grundstellung: Becken, Rumpf, Füße; L dreht lokale Punkte in die Blickrichtung
function basis(winkel, o = {}) {
  const p = stehen(V(0, 0, 0), winkel, { tief: o.tief || 0.01, neigung: o.neigung != null ? o.neigung : -1.5 });
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), winkel), L = (x, y, z) => V(x, y, z).applyQuaternion(q);
  p.becken.y = FY + (MASS.oberschenkel + MASS.unterschenkel) * 1.0056 - (o.tief || 0.01);
  const ober = p.becken.y + MASS.rumpf - 0.03;
  p.fuss = seiten((s, sg) => L(sg * (o.breit || 0.17) * ARMK(), FY, 0));
  p.fussRicht = seiten((s, sg) => L(sg * 0.32, 0, 1));
  p.kniePol = seiten((s, sg) => L(sg * 0.3, 0, 1));
  p.flach = { l: null, r: null };
  return { p, L, ober };
}
const klon = (p) => Object.assign({}, p);

function verschraenkt(winkel = 0, fett = 0) {
  const { p, L, ober } = basis(winkel);
  // Rechter Unterarm liegt vorn oben, die rechte Hand auf dem linken Oberarm; die linke Hand steckt unter dem rechten Oberarm
  const k = ARMK(), t = 1 + (BAU.tiefe.Spine2 / 1.12 - 1) * 0.9;   // liegen vor der Brust, so weit wie sie tief ist
  p.hand = { l: L(-0.15 * k, ober - 0.215 * k, 0.225 * t + fett * 1.15), r: L(0.15 * k, ober - 0.145 * k, 0.25 * t + fett * 1.15) };
  p.ellbogenPol = seiten((s, sg) => L(sg * 0.25, -0.9, 0.4));
  p.handflaeche = { l: L(0.2, 0.3, -1), r: L(0.2, -0.2, -1) };
  p.handKnick = { l: -8, r: -14 };
  p.spannZiel = 0.12; p.anstrengungZiel = 0;
  return { pose: p, pump: { l: { bizeps: 0.34, unterarme: 0.25, schulter: 0.2 }, r: { bizeps: 0.34, unterarme: 0.25, schulter: 0.2 } }, faust: false };
}

// Stand (Devin, 3.11.: ohne Shirt, man soll Bauch und Form sehen): locker, Arme hängen etwas weg vom Körper, damit nichts den Rumpf verdeckt. Je mehr Fett an Flanke und Arm, desto weiter weg (fett: m)
function stand(winkel = 0, fett = 0) {
  const { p, L, ober } = basis(winkel, { breit: 0.15, neigung: -1 });
  const arm = (MASS.oberarm + MASS.unterarm + MASS.griff) * 0.97, s = 0.27 + 1.3 * fett, c = Math.sqrt(1 - s * s);
  p.hand = seiten((_, sg) => L(sg * (SB() + arm * s), ober - arm * c, 0.03));
  p.ellbogenPol = seiten((_, sg) => L(sg * 0.5, 0, -1));
  p.handflaeche = seiten((_, sg) => L(-sg * 0.75, 0, 0.65));
  p.handKnick = { l: 6, r: 6 };
  p.fussRicht = seiten((_, sg) => L(sg * 0.24, 0, 1));
  p.handAuf = { locker: true };
  p.spannZiel = 0.1; p.anstrengungZiel = 0;
  return { pose: p, pump: { l: { lat: 0.2, unterarme: 0.12 }, r: { lat: 0.2, unterarme: 0.12 } }, faust: false };
}
// Bauch und Beine: Hände hinter dem Kopf, Ellbogen weit auf, ein Bein etwas vor. Zeigt Bauch und Flanken frei
function bauchPose(winkel = 0) {
  const { p, L, ober } = basis(winkel, { breit: 0.15, neigung: -2 });
  const k = ARMK();
  p.hand = seiten((_, sg) => L(sg * 0.075 * k, ober + 0.235 * k, -0.095 - (BAU.tiefe.Spine2 - 1.12) * 0.1));
  p.ellbogenPol = seiten((_, sg) => L(sg, 0.32, -0.12));
  p.handflaeche = seiten((_, sg) => L(-sg * 0.35, -0.15, 0.9));
  p.handKnick = { l: 12, r: 12 };
  p.fuss.r = L(-0.17, FY, 0.11);
  p.fussRicht.r = L(-0.42, 0, 1);
  p.kniePol.r = L(-0.45, 0.04, 1);
  p.kopf = { neigung: -2, dreh: 0 };
  p.spannZiel = 1; p.anstrengungZiel = 0.3;
  return { pose: p, pump: { l: { quadrizeps: 0.7, lat: 0.5, trizeps: 0.35, schulter: 0.3 }, r: { quadrizeps: 0.9, lat: 0.5, trizeps: 0.35, schulter: 0.3 } }, faust: false };
}
// Beide Arme wie beim Front und Back Double Biceps: Oberarm waagerecht zur Seite, Unterarm hoch, Fäuste etwa auf Kopfhöhe, Handflächen zum Kopf
function doppelBiceps(p, L, ober) {
  const k = ARMK();
  p.hand = seiten((s, sg) => L(sg * (SB() + 0.075 * k), ober + 0.345 * k, 0.05 * k));
  p.ellbogenPol = seiten((s, sg) => L(sg, -0.08, -0.1));
  p.handflaeche = seiten((s, sg) => L(-sg * 0.9, 0.05, 0.42));
  p.handKnick = { l: -38, r: -38 };
}
function frontBiceps(winkel = 0) {
  const { p, L, ober } = basis(winkel, { breit: 0.2, neigung: -2.5 });
  doppelBiceps(p, L, ober);
  p.fuss.r = L(-0.21, FY, 0.07);
  p.fussRicht.r = L(-0.45, 0, 1);
  p.spannZiel = 1; p.anstrengungZiel = 0.42;
  return { pose: p, pump: { l: allesPump(0.95), r: allesPump(0.95) }, faust: true };
}
function rueckenBiceps(winkel = Math.PI) {
  const { p, L, ober } = basis(winkel, { breit: 0.18, neigung: -1 });
  doppelBiceps(p, L, ober);
  // Linkes Bein zeigt nach hinten auf den Zehen: Wade und Beinbeuger zeigen zur Kamera
  p.fuss.l = L(0.15, FY + 0.05, -0.26);
  p.fussRicht.l = L(0.2, -0.75, 1);
  p.zehen = { l: 38 };
  p.kniePol.l = L(0.15, 0, 1);
  p.kopfDreh = -32;   // schaut über die Schulter
  p.spannZiel = 1; p.anstrengungZiel = 0.42;
  return { pose: p, pump: { l: Object.assign(allesPump(0.95), { waden: 1, beinbeuger: 1 }), r: allesPump(0.95) }, faust: true };
}
function beine(winkel = 0, fett = 0) {
  const { p, L, ober } = basis(winkel, { breit: 0.17, neigung: -3 });
  // Fäuste an den Hüften, Ellbogen nach außen und etwas nach vorn: das rechte Bein steht vorn und außen und zeigt den Oberschenkel
  const hb = MASS.hueftBreite / 0.095;
  p.hand = seiten((s, sg) => L(sg * (0.2 * hb + fett * 0.9), p.becken.y + 0.125, 0.01));
  p.ellbogenPol = seiten((s, sg) => L(sg, -0.4, -0.3));
  p.handflaeche = seiten((s, sg) => L(-sg, 0.1, -0.1));
  p.handKnick = { l: -10, r: -10 };
  p.fuss.r = L(-0.25, FY, 0.2);
  p.fussRicht.r = L(-0.62, 0, 1);
  p.kniePol.r = L(-0.55, 0.05, 1);
  p.fuss.l = L(0.15, FY, -0.05);
  p.spannZiel = 0.9; p.anstrengungZiel = 0.38;
  return { pose: p, pump: { l: { quadrizeps: 0.72, waden: 0.5, gesaess: 0.5, unterarme: 0.4, lat: 0.45, schulter: 0.4 }, r: { quadrizeps: 1, waden: 0.8, gesaess: 0.6, unterarme: 0.4, lat: 0.45, schulter: 0.4 } }, faust: true };
}

// Zum Vermessen (Werkstatt): Arme etwas seitlich weg, Füße hüftbreit, wie die Anleitung es vom Kunden will
export function messHaltung(winkel = 0) {
  const { p, L, ober } = basis(winkel, { breit: 0.13, neigung: 0 });
  const arm = (MASS.oberarm + MASS.unterarm + MASS.griff) * 0.97;
  p.hand = seiten((s, sg) => L(sg * (SB() + arm * 0.5), ober - arm * 0.866, 0));
  p.ellbogenPol = seiten((s, sg) => L(sg * 0.2, 0, -1));
  p.handflaeche = seiten((s, sg) => L(-sg * 0.7, 0, 0.7));
  p.handKnick = {};
  p.spannZiel = 0; p.anstrengungZiel = 0;
  return p;
}
// Haltung aus dem Foto (welt: 33 Punkte in Metern, Bildachsen): Rumpf gedreht wie dort, Arme und Beine zeigen in dieselbe Richtung, mit den Längen der Figur
export function fotoHaltung(welt) {
  const W = (i) => V(welt[i].x, -welt[i].y, -welt[i].z), richt = (a, b) => b.clone().sub(a).normalize();
  const sl = W(11), sr = W(12), ql = W(23), qr = W(24), linie = sl.clone().sub(sr).add(ql.clone().sub(qr));
  const winkel = Math.atan2(-linie.z, linie.x);
  const { p, L } = basis(winkel, { breit: 0.15, neigung: 0 });
  // Beine zuerst: das Becken steht so hoch, dass der tiefere Fuß auf dem Boden ist
  const beine = {};
  for (const [s, sg, h, k, a] of [['l', 1, 23, 25, 27], ['r', -1, 24, 26, 28]]) beine[s] = { sg, dO: richt(W(h), W(k)), dS: richt(W(k), W(a)) };
  const tief = (s) => beine[s].dO.y * MASS.oberschenkel + beine[s].dS.y * MASS.unterschenkel - 0.02;
  p.becken.y = FY - Math.min(tief('l'), tief('r'));
  for (const s of ['l', 'r']) {
    const b = beine[s], Hf = L(b.sg * MASS.hueftBreite, 0, 0).add(V(0, p.becken.y - 0.02, 0)), kn = Hf.clone().addScaledVector(b.dO, MASS.oberschenkel), fu = kn.clone().addScaledVector(b.dS, MASS.unterschenkel);
    p.fuss[s] = V(fu.x, Math.max(FY, fu.y), fu.z);
    const li = richt(Hf, fu), po = kn.clone().sub(Hf); po.addScaledVector(li, -po.dot(li));
    p.kniePol[s] = po.length() > 0.012 ? po.normalize() : L(b.sg * 0.3, 0, 1);
  }
  const ober = p.becken.y + MASS.rumpf - 0.03;
  p.hand = {}; p.ellbogenPol = {};
  for (const [s, sg, sh, el, ha] of [['l', 1, 11, 13, 15], ['r', -1, 12, 14, 16]]) {
    const dU = richt(W(sh), W(el)), dF = richt(W(el), W(ha)), S = L(sg * SB(), 0, 0).add(V(0, ober, 0)), E = S.clone().addScaledVector(dU, MASS.oberarm), H = E.clone().addScaledVector(dF, MASS.unterarm + MASS.griff * 0.97);
    p.hand[s] = H;
    const li = richt(S, H), po = E.clone().sub(S); po.addScaledVector(li, -po.dot(li));
    p.ellbogenPol[s] = po.length() > 0.012 ? po.normalize() : L(sg * 0.2, 0, -1);
  }
  p.handflaeche = seiten((s, sg) => L(-sg * 0.7, 0, 0.7));
  p.handKnick = {};
  p.spannZiel = 0; p.anstrengungZiel = 0;
  return p;
}
export const fotoWelt = { punkte: null };
export const POSEN = {
  stand: { name: 'Stand', bau: (w, f) => stand(w, f), hinten: false },
  bauch: { name: 'Bauch', bau: bauchPose, hinten: false },
  ruhe: { name: 'Arme verschränkt', bau: verschraenkt, hinten: false },
  bizeps: { name: 'Front Double Biceps', bau: frontBiceps, hinten: false },
  ruecken: { name: 'Rücken', bau: rueckenBiceps, hinten: true },
  beine: { name: 'Beine', bau: beine, hinten: false },
  // Wie im Foto (Devin, 2.11.: direkt vergleichen): dieselbe Haltung wie auf dem Bild, entspannt
  foto: { name: 'Wie im Foto', bau: () => ({ pose: fotoHaltung(fotoWelt.punkte), pump: { l: {}, r: {} }, faust: false }), hinten: false }
};

// Regie: hält die laufende Pose, führt von einer zur nächsten über und liefert der Ansicht eine Übung, die nur aus diesem Stand besteht
export class Posing {
  constructor() {
    const r = POSEN.stand.bau(0, 0);
    this.fettZu = 0; this.name = 'stand'; this.ziel = r; this.von = null; this.u = 1; this.d = 1; this.lauf = null;
    this.pump = { l: {}, r: {} }; this.faust = { l: false, r: false };
    this.anim = { aufbau: () => ({}), pose: () => ({ pose: this.aktuell() }), blick: V(0, 1, 0), abstand: 5, kameraRicht: V(0, 0.05, 1), dauer: [1, 0, 1, 0] };
  }
  wechsle(name) {
    if (name === this.name && !this.lauf) return;
    const def = POSEN[name], alt = this.ziel.pose, warHinten = POSEN[this.name].hinten, ziel = def.bau(def.hinten ? Math.PI : 0, this.fettZu || 0);
    const d = warHinten !== def.hinten ? 1.5 : 1.1;
    const schritt = { ziel: ziel.pose, d, verzug: 0.05 };
    // Umdrehen: die Form mischt sich im Rahmen der Zielpose, die Drehung läuft im Bogen, die Füße machen zwei kleine Schritte
    if (warHinten !== def.hinten) { schritt.dreh = { m: V(0, 0, 0), w: warHinten ? -Math.PI : Math.PI }; schritt.steigen = { bogen: 0.05, erst: 'l' }; }
    this.lauf = uebergang(alt, schritt); this.d = d; this.u = 0; this.ziel = ziel; this.name = name;
  }
  // Maße geändert: die laufende Pose neu rechnen
  neu() { const d = POSEN[this.name]; if (!this.lauf) this.ziel = d.bau(d.hinten ? Math.PI : 0, this.fettZu || 0); }
  schritt(dt) {
    if (this.lauf) { this.u = Math.min(1, this.u + dt / this.d); if (this.u >= 1) this.lauf = null; }
    const k = Math.min(1, dt * 5);
    for (const s of ['l', 'r']) {
      const z = this.ziel.pump[s] || {};
      const f = this.pumpFaktor == null ? 1 : this.pumpFaktor;   // Körper aus dem Foto: Muskeln spannen sich weniger heraus als beim modellierten Bodybuilder
      for (const n of Object.keys(allesPump(0))) this.pump[s][n] = (this.pump[s][n] || 0) + ((this.u > 0.45 ? (z[n] || 0) * f : 0) - (this.pump[s][n] || 0)) * k;
    }
  }
  aktuell() {
    const roh = this.lauf ? this.lauf(this.u) : this.ziel.pose, p = klon(roh), kz = this.ziel.pose.kopfDreh || 0;
    this.kopfDreh = (this.kopfDreh || 0) + (kz - (this.kopfDreh || 0)) * 0.08;
    p.kopf = { neigung: (roh.kopf && roh.kopf.neigung) || 0, dreh: this.kopfDreh };
    if (this.blick) p.blickPunkt = this.blick();
    p.fest = { l: true, r: true, ablauf: true };
    p.spannZiel = this.ziel.pose.spannZiel * (this.u > 0.45 ? 1 : 0.2); p.anstrengungZiel = this.ziel.pose.anstrengungZiel * (this.u > 0.45 ? 1 : 0.3);
    const zu = this.ziel.faust && this.u > 0.5;
    p.faust = { l: zu, r: zu };
    return p;
  }
}
