// DK Coach — Ablauf vor jeder Übung (Devin, 29.10.: „geht er zu der Maschine hin und packt die und nimmt die raus und dann geht er
// in die Pose“). Die Figur läuft zum Gerät, hebt Hanteln vom Boden auf, setzt oder legt sich hin und greift zuletzt Stange oder Griffe.
// Danach beginnt die Übung bei tStart. Alles allgemein aus der Startpose der Vorlage, ohne eigene Angaben je Übung:
// stehen | sitzen | rueckenlage | bauchlage | seitlage | haengen (Klimmzug) | knien.
import * as THREE from 'three';
import { gelenke, rumpfRahmen, MASS } from './figur.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180, Y = V(0, 1, 0), FY = 0.08;
const ARM = () => MASS.oberarm + MASS.unterarm + MASS.griff;
const mix = (a, b, u) => a + (b - a) * u;
const glatt = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const seiten = (f) => ({ l: f('l', 1), r: f('r', -1) });
const waag = (v) => { const w = V(v.x, 0, v.z); return w.lengthSq() > 1e-6 ? w.normalize() : V(0, 0, 1); };
const winkelVon = (v) => Math.atan2(v.x, v.z);
const drehY = (w) => new THREE.Quaternion().setFromAxisAngle(Y, w);
const GENAU = () => ({ l: true, r: true });
const DAUER = { gehen: 1.1, drehen: 0.35, aufheben: 0.7, setzen: 0.9, legen: 1.0, greifen: 0.8 };   // Sekunden (gehen: je Meter)

/* ---------- Posen ---------- */
// Vollständige Pose aus einer Vorlagen-Pose: alle Ziele so, wie gelenke() sie gelöst hat (Faust, Knöchel, Pole, Fußrichtung)
function vollstaendig(pose) {
  const g = gelenke(pose), p = { becken: g.becken.clone(), rumpf: { basis: g.R.q.clone() }, kopf: { neigung: (pose.kopf && pose.kopf.neigung) || 0 }, fest: GENAU() };
  const mitte = (a, b) => a.clone().add(b).multiplyScalar(0.5);
  p.hand = seiten((s) => g.hand[s].clone());
  p.fuss = seiten((s) => g.knoechel[s].clone());
  // Pol = wohin Ellbogen/Knie aus der Linie ragen; bei gestrecktem Glied der Pol der Vorlage (sonst kippt es beim Mischen)
  const pol = (v, alt, ersatz) => (v.length() > 0.01 ? v : ((alt && alt.clone()) || ersatz.clone()));
  p.ellbogenPol = seiten((s) => pol(g.ellbogen[s].clone().sub(mitte(g.schulter[s], g.handgelenk[s])), pose.ellbogenPol && pose.ellbogenPol[s], g.R.vor.clone().negate()));
  p.kniePol = seiten((s) => pol(g.knie[s].clone().sub(mitte(g.huefte[s], g.knoechel[s])), pose.kniePol && pose.kniePol[s], g.R.vor));
  p.fussRicht = seiten((s) => g.zehe[s].clone().sub(g.ferse[s]));
  p.handflaeche = seiten((s) => g.handRuecken[s].clone().negate());
  p.zehen = Object.assign({}, pose.zehen || {});
  p.handKnick = Object.assign({}, pose.handKnick || {});
  p.flach = seiten((s) => (g.flach[s] ? g.flach[s].clone() : null));
  p.greift = seiten((s) => !g.flach[s]);
  return { pose: p, g };
}
// Zwischen zwei vollständigen Posen; hand: eigener Anteil für die Hände (sie greifen zuletzt)
function mische(A, B, u, hand = u) {
  const lv = (a, b, x) => a.clone().lerp(b, x), ln = (a, b, x) => { const v = lv(a, b, x); return v.lengthSq() > 1e-8 ? v : b.clone(); };
  const p = {
    becken: lv(A.becken, B.becken, u), rumpf: { basis: A.rumpf.basis.clone().slerp(B.rumpf.basis, u) },
    kopf: { neigung: mix(A.kopf.neigung, B.kopf.neigung, u) }, fest: GENAU()
  };
  p.hand = seiten((s) => lv(A.hand[s], B.hand[s], hand));
  p.fuss = seiten((s) => lv(A.fuss[s], B.fuss[s], u));
  for (const k of ['ellbogenPol', 'handflaeche']) p[k] = seiten((s) => ln(A[k][s], B[k][s], hand));
  for (const k of ['kniePol', 'fussRicht']) p[k] = seiten((s) => ln(A[k][s], B[k][s], u));
  p.zehen = seiten((s) => mix(A.zehen[s] || 0, B.zehen[s] || 0, u));
  p.handKnick = seiten((s) => mix(A.handKnick[s] || 0, B.handKnick[s] || 0, hand));
  p.flach = seiten((s) => (hand < 0.5 ? A.flach[s] : B.flach[s]));
  p.greift = seiten((s) => (hand < 0.5 ? A.greift[s] : B.greift[s]));
  return p;
}
// Stehend (oder gehend: phase in Bogenmaß, 0 = Füße nebeneinander) an pos (Becken x/z), Blick in Richtung winkel (0 = +z)
function stehen(pos, winkel, o = {}) {
  const q = drehY(winkel), d = (x, y, z) => V(x, y, z).applyQuaternion(q).add(V(pos.x, 0, pos.z));
  const ph = o.phase || 0, schritt = o.schritt == null ? 0.2 : o.schritt, s1 = Math.sin(ph), c1 = Math.cos(ph);
  const becken = d(0, 0.965 + (o.phase != null ? 0.012 * Math.cos(2 * ph) : 0.01) - (o.tief || 0), 0);
  const p = { becken, rumpf: { basis: q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), (o.neigung || 2) * RAD)) }, kopf: { neigung: 0 }, fest: GENAU() };
  const R = rumpfRahmen(p.rumpf), brust = becken.clone().add(R.oben.clone().multiplyScalar(MASS.rumpf));
  const schulter = (sg) => brust.clone().add(R.links.clone().multiplyScalar(sg * MASS.schulterBreite)).sub(R.oben.clone().multiplyScalar(0.03));
  p.hand = o.hand || seiten((s, sg) => schulter(sg).add(V(0, -ARM() * 0.95, 0)).add(V(sg * 0.05, 0, -sg * 0.14 * s1 * (o.phase != null ? 1 : 0)).applyQuaternion(q)));
  p.fuss = seiten((s, sg) => d(sg * 0.11, FY + (o.phase != null ? 0.07 * Math.max(0, sg * c1) : 0), sg * schritt * s1));
  p.ellbogenPol = seiten((s, sg) => V(sg * 0.3, 0, -1).applyQuaternion(q));
  p.kniePol = seiten((s, sg) => V(sg * 0.1, 0, 1).applyQuaternion(q));
  p.fussRicht = seiten((s, sg) => V(sg * 0.15, 0, 1).applyQuaternion(q));
  p.handflaeche = seiten((s, sg) => V(-sg, 0, 0).applyQuaternion(q));
  p.zehen = {}; p.handKnick = {};
  p.flach = { l: null, r: null }; p.greift = GENAU();
  return p;
}
// Hände locker auf den Oberschenkeln (Sitzen, vor dem Greifen)
function haendeAufBeinen(p) {
  const g = gelenke(p);
  const q = Object.assign({}, p);
  q.hand = seiten((s) => g.huefte[s].clone().lerp(g.knie[s], 0.55).add(g.R.oben.clone().multiplyScalar(0.07)).add(g.R.vor.clone().multiplyScalar(0.02)));
  q.handflaeche = seiten(() => g.R.oben.clone().negate());
  q.ellbogenPol = seiten((s, sg) => g.R.links.clone().multiplyScalar(sg).sub(g.R.vor.clone().multiplyScalar(0.5)));
  q.flach = { l: null, r: null };
  return q;
}
// Hände seitlich neben dem Körper (Liegen, vor dem Greifen)
function haendeNeben(p) {
  const g = gelenke(p), q = Object.assign({}, p);
  q.hand = seiten((s, sg) => g.huefte[s].clone().add(g.R.links.clone().multiplyScalar(sg * 0.17)).add(g.R.oben.clone().multiplyScalar(0.08)));
  q.ellbogenPol = seiten((s, sg) => g.R.links.clone().multiplyScalar(sg));
  q.flach = { l: null, r: null };
  return q;
}

/* ---------- Einleitung bauen ---------- */
// anim = Vorlage, z = ihre Geräte, ger = Geraete, kamera = Richtung der Kamera (dorthin ist Platz zum Anlaufen)
export function baueEinleitung(anim, ger, z, kamera) {
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
  } else if (k0 === 'bauchlage' && k1 === 'bauchlage') G = L1.g.becken.y >= L0.g.becken.y ? L1 : L0;   // Liegestütz: oben anfangen
  else if (stehend && k0 !== 'stehen') G = L1;   // ohne Last aus der Hocke (Kniebeuge): aufrecht anfangen
  props(G);   // alle Geräte in ihre Startlage
  const art = kategorie(G.g), gg = G.g;

  // Ständer für eine Langhantel, die nicht am Boden liegt: zwei Pfosten mit Haken unter den Stangenenden
  if (z.lh && z.lh.position.y >= 0.3 && (art === 'stehen' || art === 'rueckenlage' || art === 'sitzen')) {
    const c = z.lh.position.clone(), a = V(1, 0, 0).applyQuaternion(z.lh.quaternion).normalize();
    const weg = art === 'rueckenlage' ? waag(gg.R.oben).multiplyScalar(0.12) : waag(gg.R.vor).multiplyScalar(0.24);
    for (const sx of [-1, 1]) {
      const p = c.clone().add(a.clone().multiplyScalar(sx * 0.6)).add(weg);
      ger.box(0.05, c.y + 0.06, 0.05, V(p.x, (c.y + 0.06) / 2, p.z), ger.mRahmen);
      const haken = c.clone().add(a.clone().multiplyScalar(sx * 0.6)).add(weg.clone().multiplyScalar(0.5)).add(V(0, -0.035, 0));
      ger.box(0.04, 0.03, weg.length() + 0.05, haken, ger.mRahmen, 0, winkelVon(weg) / RAD);
    }
  }

  // Wo die Figur vor dem Gerät steht und wohin sie schaut
  const fussMitte = gg.knoechel.l.clone().add(gg.knoechel.r).multiplyScalar(0.5);
  let blick, stand, schritte = [];
  const Gp = G.pose;
  if (art === 'sitzen') {
    blick = waag(gg.R.vor); stand = gg.becken.clone().add(blick.clone().multiplyScalar(0.2));
    const sitz = haendeAufBeinen(Gp);
    schritte = [[sitz, DAUER.setzen, 0], [Gp, DAUER.greifen, 0.35]];
  } else if (art === 'rueckenlage') {
    blick = waag(gg.R.oben).negate();   // Richtung Füße
    const q = drehY(winkelVon(blick));
    const sitz = stehen(gg.becken, winkelVon(blick));
    sitz.becken = gg.becken.clone();
    const R = rumpfRahmen(sitz.rumpf);
    const aufBoden = Math.max(gg.knoechel.l.y, gg.knoechel.r.y) < 0.18;
    sitz.fuss = seiten((s, sg) => aufBoden ? gg.knoechel[s].clone() : gg.becken.clone().add(blick.clone().multiplyScalar(0.42)).add(R.links.clone().multiplyScalar(sg * 0.14)).setY(FY));
    sitz.kniePol = seiten((s, sg) => V(sg * 0.2, 1, 0.6).applyQuaternion(q));
    stand = gg.becken.clone().add(blick.clone().multiplyScalar(0.22));
    schritte = [[haendeAufBeinen(sitz), DAUER.setzen, 0], [haendeNeben(Gp), DAUER.legen, 0], [Gp, DAUER.greifen, 0.35]];
  } else if ((art === 'bauchlage' || art === 'seitlage') && gg.becken.y < 0.5) {   // am Boden: erst knien
    blick = waag(gg.R.oben);   // Richtung Kopf
    const kniePunkt = gg.becken.clone().setY(0);
    const knien = stehen(kniePunkt, winkelVon(blick));
    knien.becken = kniePunkt.clone().setY(0.56);
    knien.fuss = seiten((s, sg) => kniePunkt.clone().add(blick.clone().multiplyScalar(-0.42)).add(V(sg * 0.12, 0, 0).applyQuaternion(drehY(winkelVon(blick)))).setY(0.09));
    knien.kniePol = seiten(() => blick.clone());
    knien.zehen = seiten(() => -40);
    knien.fussRicht = seiten(() => blick.clone().negate().add(V(0, -1.2, 0)));
    stand = kniePunkt.clone().add(blick.clone().multiplyScalar(-0.15));
    schritte = [[knien, DAUER.setzen, 0], [Gp, DAUER.legen, 0.1, 0.1]];
  } else if (art === 'haengen') {
    blick = waag(gg.R.vor); stand = gg.becken.clone();
    const greifen = stehen(stand, winkelVon(blick), { hand: seiten((s) => gg.hand[s].clone()) });
    greifen.ellbogenPol = seiten((s, sg) => V(sg, -0.3, 0).applyQuaternion(drehY(winkelVon(blick))));
    schritte = [[greifen, DAUER.greifen, 0.2], [Gp, DAUER.setzen, 0]];
  } else {
    blick = waag(gg.R.vor); stand = art === 'stehen' ? fussMitte.clone().add(blick.clone().multiplyScalar(-0.03)) : gg.becken.clone();
    schritte = [[Gp, DAUER.greifen + 0.3, 0.35]];
  }
  const winkel = winkelVon(blick);

  // Anlauf: von der Seite (quer zur Kamera), bleibt auf der Bodenscheibe
  const kh = waag(kamera || V(0.62, 0.32, 0.72)), seitlich = V(kh.z, 0, -kh.x);
  let start = stand.clone().setY(0).add(kh.clone().multiplyScalar(-0.25)).add(seitlich.multiplyScalar(1.4));   // von der Seite quer durchs Bild, nicht an der Kamera vorbei
  if (V(start.x, 0, start.z).length() > 1.9) start.setLength(1.9);
  const weg = V(stand.x - start.x, 0, stand.z - start.z), meter = weg.length(), richtung = winkelVon(weg);

  // Zeitleiste
  const teile = [];
  const tGehen = Math.max(0.6, meter * DAUER.gehen);
  teile.push({ d: tGehen, bild: (u) => { const w = glatt(u) * 0.7 + u * 0.3; const pos = start.clone().add(weg.clone().multiplyScalar(w)); return stehen(pos, richtung, { phase: (w * meter / 0.44) * Math.PI, schritt: 0.2 * Math.min(1, u * 5, (1 - u) * 5) }); } });
  let dw = winkel - richtung; dw = Math.atan2(Math.sin(dw), Math.cos(dw));
  teile.push({ d: DAUER.drehen, bild: (u) => stehen(stand, richtung + dw * glatt(u)) });
  let vorher = stehen(stand, winkel), haeltAb = Infinity;
  // Hanteln liegen neben den Füßen: in die Hocke, greifen, aufstehen
  if (hanteln.length) {
    const q = drehY(winkel), ort = { kh_l: V(0.31, 0.075, 0.06), kh_r: V(-0.31, 0.075, 0.06), kb: V(0, 0.23, 0.24) };
    const ablage = {}; for (const n of hanteln) ablage[n] = stand.clone().setY(0).add(ort[n].clone().applyQuaternion(q));
    const hocke = stehen(stand, winkel, { tief: 0.36, neigung: 34 });
    hocke.hand = seiten((s, sg) => z['kh_' + s] ? ablage['kh_' + s].clone() : ablage.kb ? ablage.kb.clone().add(V(sg * 0.035, 0, 0).applyQuaternion(q))
      : stand.clone().add(V(sg * 0.17, 0.5, 0.2).applyQuaternion(q)));   // ohne Hantel in dieser Hand: Hand aufs Knie
    hocke.fuss = seiten((s, sg) => stand.clone().add(V(sg * 0.17, 0, 0).applyQuaternion(q)).setY(FY));
    hocke.kniePol = seiten((s, sg) => V(sg * 0.45, 0, 1).applyQuaternion(q));
    hocke.handflaeche = seiten((s, sg) => V(-sg, 0, 0).applyQuaternion(q));
    for (const n of hanteln) { z[n].position.copy(ablage[n]); z[n].quaternion.copy(n === 'kb' ? new THREE.Quaternion() : new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), V(0, 0, 1).applyQuaternion(q))); }
    haeltAb = teile.reduce((a, x) => a + x.d, 0) + DAUER.aufheben;
    teile.push({ d: DAUER.aufheben, bild: (u) => mische(vorher, hocke, glatt(u)) });
    const oben = stehen(stand, winkel);
    teile.push({ d: DAUER.aufheben, bild: (u) => mische(hocke, oben, glatt(u)) });
    vorher = oben;
  }
  // Hinsetzen/Hinlegen/Knien, zuletzt greifen
  const tGriff = teile.reduce((a, x) => a + x.d, 0) + schritte.reduce((a, x) => a + x[1], 0) - 0.05;
  for (const [ziel, d, verzug, bogen] of schritte) {   // bogen: Becken in der Mitte so viel höher (Knie bleiben über dem Boden)
    const von = vorher;
    teile.push({ d, bild: (u) => { const p = mische(von, ziel, glatt(u), glatt((u - verzug) / (1 - verzug))); if (bogen) p.becken.y += bogen * Math.sin(Math.PI * glatt(u)); return p; } });
    vorher = ziel;
  }
  const dauer = teile.reduce((a, x) => a + x.d, 0);
  return {
    dauer, tStart: G.t,
    // Pose zur Zeit sek; geraete: ab wann die Geräte mit den Händen mitgehen (Hanteln nach dem Aufheben, sonst nach dem Greifen)
    pose(sek) {
      let x = sek;
      for (const teil of teile) { if (x <= teil.d) return teil.bild(teil.d > 0 ? x / teil.d : 1); x -= teil.d; }
      return teile[teile.length - 1].bild(1);
    },
    gehtMit: (sek) => sek >= Math.min(haeltAb, tGriff)
  };
}

// Art der Startpose aus den Gelenken
export function kategorie(g) {
  const fussY = Math.max(g.knoechel.l.y, g.knoechel.r.y), oben = g.R.oben.y, vorY = g.R.vor.y;
  const haendeOben = Math.min(g.hand.l.y, g.hand.r.y) > g.kopf.y;
  if (fussY > 0.25 && haendeOben) return 'haengen';
  if (fussY < 0.2 && g.becken.y > 0.75) return 'stehen';
  if (fussY < 0.25 && oben > 0.5 && g.becken.y > 0.3) return 'sitzen';
  if (Math.abs(oben) < 0.6) return vorY > 0.4 ? 'rueckenlage' : vorY < -0.4 ? 'bauchlage' : 'seitlage';
  if (Math.min(g.knie.l.y, g.knie.r.y) < 0.15) return 'knien';
  return 'sonst';
}
