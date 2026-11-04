// DK Coach — Der eigene Charakter als Spielfigur im Gym (Devin, 4.11.: „… wenn du diesen Charakter auswählst mit deinem Bild … im Fitnessstudio spielen … das ist so wie dein Charakter“).
// Das Gym baut eine eigene Ansicht mit eigener Figur. Sie bekommt hier denselben Kopf, dieselben Farben, Haare, Kleidung und dieselbe Form wie die Figur auf der Bühne.
import * as THREE from 'three';
import * as cha from './charakter.js';
import * as fris from './frisur.js';
import * as kl from './kleidung.js';
import * as form from './koerperform.js';
import * as ges from './gesicht.js';
import { anwenden } from './fotomass.js';
import { daten, mitNachstellen, reliefMit, ausFoto } from './stand.js';

export const SITZ = 0.2;   // Sitz des Oberteils
export const FARBEN = ['c-haut', 'c-haar', 'c-brauen', 'c-augen', 'c-shirt', 'c-hose', 'c-socke', 'c-schuh'];
// Eine Farbe aus den gespeicherten Werten (Hex wie im Formular) auf die Figur
export function farbe(f, id, hex) {
  const c = new THREE.Color(hex), l = [c.r, c.g, c.b];
  if (id === 'c-haut') { const T = ges.hautAusZiel(l); f.koerperMesh.material.color.setRGB(T[0], T[1], T[2]); }
  else if (id === 'c-haar') cha.netzVon(f, 'Hair_Buzzed').material.color.setRGB(l[0] / 0.3, l[1] / 0.3, l[2] / 0.3);
  else if (id === 'c-brauen') cha.netzVon(f, 'Eyebrows').material.color.setRGB(l[0] / 0.2, l[1] / 0.2, l[2] / 0.2);
  else if (id === 'c-augen') cha.setzeIris(hex);
  else { const u = { 'c-shirt': f.u.uOberteil, 'c-hose': f.u.uHose, 'c-socke': f.u.uSocke, 'c-schuh': f.u.uSchuh }[id]; if (u) { if (!u.ur) u.ur = u.value.clone(); u.value.set(hex); } }
}
const vorbereiten = (f) => {
  cha.vorbereiten(f); fris.vorbereiten(f); kl.vorbereiten(f); form.vorbereiten(f);
  for (const m of f.meshes) if (m.material.defines && m.material.defines.DK_STOFF) m.receiveShadow = false;   // wie auf der Bühne: Die Schattenkarte kennt die Fettschichten nicht
};
// Geräte und Griffe sind für die Längen der Grundfigur gerechnet: Kürzere Arme kämen nicht mehr an die Stange, kürzere Beine nicht mehr auf den Boden.
// Darum zählt im Gym die Höhe nicht (ohne andere Menschen im Raum sieht man sie auch nicht) und die Längen sind die der Grundfigur. Breiten, Tiefen, Kopf im Verhältnis zum Körper und Fett bleiben genau wie auf der Bühne
export function spielMass(r) {
  const h = r.hoehe || 1, n = JSON.parse(JSON.stringify(r));
  n.hoehe = 1; n.kopf = (r.kopf || Math.sqrt(h)) / h;
  for (const k in n.lang) n.lang[k] = 1;
  return n;
}
// von: Figur auf der Bühne, nach: Figur im Gym. o: { r, f, L (Sitz des Oberteils), mm (Haarlänge), muetze, oben, unten, basis, BAU, MASS }
export function aufFigur(von, nach, o) {
  vorbereiten(nach);
  const kopf = cha.sichern(von);
  if (kopf) cha.wiederherstellen(nach, kopf);
  nach.koerperMesh.material.color.copy(von.koerperMesh.material.color);
  for (const n of ['Hair_Buzzed', 'Eyebrows']) cha.netzVon(nach, n).material.color.copy(cha.netzVon(von, n).material.color);
  for (const n of ['uOberteil', 'uHose', 'uSocke', 'uSchuh']) nach.u[n].value.copy(von.u[n].value);
  fris.setzeLaenge(nach, o.mm / 10);
  nach.ohneHut = !o.muetze;
  cha.setzeMuetze(nach, o.muetze);
  kl.setze(nach, o.oben, o.unten);
  kl.falten(o.f.a2);
  form.setzeForm(nach, o.f, o.L);
  anwenden(spielMass(o.r), o.basis, o.BAU, o.MASS, nach, 1);
}
// Die App hat keine Bühne: Hier entsteht die Figur aus dem gespeicherten Stand (kurzform.auspacken), Schritt für Schritt wie auf der Kundenseite. o: { basis, BAU, MASS, gelenke, messHaltung }. Gibt die Form zurück (für die Haltung)
export function ausDaten(ansicht, D, o) {
  const f = ansicht.figur, wert = (id) => D.felder[id], d = daten(wert, form.fettSchaetzung), v = +wert('t-relief') / 100;
  vorbereiten(f);
  if (D.kopf) cha.wiederherstellen(f, D.kopf);
  f.ohneHut = !D.muetze;
  cha.setzeMuetze(f, D.muetze);
  if (D.farbenGesetzt) for (const id of FARBEN) farbe(f, id, wert(id));
  kl.setze(f, D.oben === 'ohne' && d.frau ? 'tank' : D.oben, D.unten);
  fris.setzeLaenge(f, +wert('h-laenge') / 10);
  const rZahl = form.modell(d.groesse, d.gewicht, d.fett);
  form.setzeForm(f, { bf: d.fett, rel: reliefMit(d.ffm, d.h2, v), a1: 0, a2: 0 }, SITZ);
  form.aufGewicht({ ansicht, r: rZahl, gewicht: d.gewicht, fett: d.fett, fm: { anwenden }, gelenke: o.gelenke, haltung: () => o.messHaltung(0), basis: o.basis, BAU: o.BAU, MASS: o.MASS });
  const r = mitNachstellen(D.rFoto ? ausFoto(form.modell, D.rFoto, D.dFoto, d) : rZahl, wert), s = form.fettSchichten(f, d.gewicht, d.fett), fw = { bf: d.fett, rel: reliefMit(d.ffm, d.h2, v), a1: s.a1, a2: s.a2 };
  kl.falten(fw.a2);
  form.setzeForm(f, fw, SITZ);
  anwenden(spielMass(r), o.basis, o.BAU, o.MASS, f, 1);
  return fw;
}
// Gehen und Stehen im Gym: Je mehr Fett an Flanke und Arm, desto weiter stehen die Hände ab, die Hand ist locker
export function haltung(f) {
  const aus = 0.02 + 0.94 * (f.a1 * 0.012 + f.a2 * 0.03);
  return (p, w) => {
    const cx = Math.cos(w) * aus, sx = Math.sin(w) * aus;
    p.hand.l.x += cx; p.hand.l.z -= sx; p.hand.r.x -= cx; p.hand.r.z += sx;
    p.handAuf = { locker: true };
  };
}
