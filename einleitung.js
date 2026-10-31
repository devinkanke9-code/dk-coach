// DK Coach — Ablauf vor jeder Übung (Devin, 29.10.: „geht er zu der Maschine hin und packt die und nimmt die raus und dann geht er
// in die Pose“). Die Figur läuft zum Gerät, hebt Hanteln vom Boden auf, setzt oder legt sich hin und greift zuletzt Stange oder Griffe.
// Danach beginnt die Übung bei tStart. Alles allgemein aus der Startpose der Vorlage, ohne eigene Angaben je Übung:
// stehen | sitzen | rueckenlage | bauchlage | seitlage | haengen (Klimmzug) | knien.
// Seit 30.10. weicht der Ablauf den Geräten aus: Alle Teile werden als Quader vermessen. Ist der gerade Weg verstellt, läuft die Figur
// über ein Bodenraster um das Gerät herum und kommt zuletzt gerade auf ihren Platz zu. Ist schon der Platz vor dem Gerät verstellt,
// rechnet der Ablauf andere Einstiege durch (seitlich hinsetzen und eindrehen, erst hinten absetzen und unter dem Polster durchrutschen,
// vorn vorbeugen und rückwärts unter das Polster steigen) und nimmt den, bei dem der Körper am wenigsten in Teile eintaucht.
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
const kurz = (w) => Math.atan2(Math.sin(w), Math.cos(w));
const GENAU = () => ({ l: true, r: true });
const DAUER = { gehen: 1.1, drehen: 0.35, aufheben: 0.7, setzen: 0.9, legen: 1.0, greifen: 0.8, eindrehen: 1.1, rutschen: 0.8 };   // Sekunden (gehen: je Meter)

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
// Ganze Pose um die Senkrechte durch m drehen (Eindrehen auf dem Sitz)
function drehePose(p, m, w) {
  const q = drehY(w), um = (v) => v.clone().sub(m).applyQuaternion(q).add(m), r = (v) => v.clone().applyQuaternion(q);
  const n = Object.assign({}, p, { becken: um(p.becken), rumpf: { basis: q.clone().multiply(p.rumpf.basis) } });
  n.hand = seiten((s) => um(p.hand[s])); n.fuss = seiten((s) => um(p.fuss[s]));
  for (const k of ['ellbogenPol', 'kniePol', 'fussRicht', 'handflaeche']) n[k] = seiten((s) => r(p[k][s]));
  n.flach = seiten((s) => (p.flach[s] ? r(p.flach[s]) : null));
  return n;
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
// Sitzend mit aufrechtem Rumpf: Becken bei m (Höhe aus m), Blick winkel, Füße am Boden vor = Abstand der Füße vor dem Becken
function sitzen(m, winkel, vor, kniePol = V(0, 1, 0.6)) {
  const q = drehY(winkel), p = stehen(m, winkel);
  p.becken = m.clone();
  p.fuss = seiten((s, sg) => m.clone().add(V(sg * 0.13, 0, vor).applyQuaternion(q)).setY(FY));
  p.kniePol = seiten((s, sg) => V(sg * 0.15, kniePol.y, kniePol.z).applyQuaternion(q));
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
// Übergang von einer Pose zur nächsten (Schritt { ziel, d, verzug, bogen, heben, dreh }): verzug = Hände greifen später,
// bogen = Becken in der Mitte höher (negativ: tiefer, unter einem Polster durch), heben = Füße in der Mitte angehoben (über Rahmen und
// Stufen), dreh = { m, w }: um die Senkrechte durch m eindrehen (die Form mischt sich im Rahmen der Zielpose, die Drehung läuft im Bogen)
function uebergang(von, s) {
  const verzug = s.verzug || 0, A = s.dreh ? drehePose(von, s.dreh.m, s.dreh.w) : von;
  return (u) => {
    const g = glatt(u), p = mische(A, s.ziel, g, glatt((u - verzug) / (1 - verzug)));
    if (s.bogen) p.becken.y += s.bogen * Math.sin(Math.PI * g);
    if (s.heben) { const h = s.heben * Math.sin(Math.PI * Math.min(1, g / (s.hebenBis || 1))); for (const k of ['l', 'r']) p.fuss[k].y += h; }
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
const KAPSELN = [
  [(g) => [g.becken, bauch(g)], 0.115, 0], [(g) => [g.huefte.l, g.huefte.r], 0.085, 0], [(g) => [bauch(g), g.brust], 0.115, 1], [(g) => [g.kopf, g.kopf], 0.1, 1],
  [(g) => [g.schulter.l, g.schulter.r], 0.06, 1],
  ...['l', 'r'].flatMap((s) => [[(g) => [g.schulter[s], g.ellbogen[s]], 0.045, 2], [(g) => [g.ellbogen[s], g.hand[s]], 0.038, 2],
    [(g) => [g.huefte[s], g.knie[s]], 0.07, 3], [(g) => [g.knie[s], g.knoechel[s]], 0.048, 3], [(g) => [g.ferse[s], g.zehe[s]], 0.035, 3, true]])
];
const _p = V();
// Wie tief der Körper (Gelenke g) in jedes Teil eintaucht (m; je Teil und Gruppe das Maximum, Index NG·Teil + Gruppe).
// Getrennt nach Gruppen, damit z. B. Arme auf dem Armpolster nicht erlauben, dass die Beine hindurchgehen
function tiefen(g, Q) {
  const aus = new Float32Array(Q.length * NG);
  for (const [f, r, gr, fuss] of KAPSELN) {
    const [A, B] = f(g), n = Math.max(1, Math.ceil(A.distanceTo(B) / 0.05));
    for (let i = 0; i <= n; i++) {
      _p.copy(A).lerp(B, i / n);
      for (let k = 0; k < Q.length; k++) {
        const q = Q[k];
        if (fuss && q.top < 0.09) continue;
        const dx = _p.x - q.c.x, dy = _p.y - q.c.y, dz = _p.z - q.c.z;
        if (dx * dx + dy * dy + dz * dz > (q.r + r) * (q.r + r)) continue;
        let aussen = 0, innen = -Infinity;
        for (let a = 0; a < 3; a++) { const v = q.ax[a], l = Math.abs(dx * v.x + dy * v.y + dz * v.z) - q.h[a]; if (l > 0) aussen += l * l; if (l > innen) innen = l; }
        const t = r - (aussen > 0 ? Math.sqrt(aussen) : innen);
        if (t > aus[NG * k + gr]) aus[NG * k + gr] = t;
      }
    }
  }
  return aus;
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
function klassisch(art, G, Gp, gg) {
  const fussMitte = gg.knoechel.l.clone().add(gg.knoechel.r).multiplyScalar(0.5);
  if (art === 'sitzen') {
    const blick = waag(gg.R.vor);
    return { name: art, blick, abruecken: true, stand: gg.becken.clone().add(blick.clone().multiplyScalar(0.2)), schritte: [{ ziel: haendeAufBeinen(Gp), d: DAUER.setzen }, { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
  }
  if (art === 'rueckenlage') {
    const blick = waag(gg.R.oben).negate();   // Richtung Füße
    const q = drehY(winkelVon(blick));
    const sitz = stehen(gg.becken, winkelVon(blick));
    sitz.becken = gg.becken.clone();
    const R = rumpfRahmen(sitz.rumpf);
    const aufBoden = Math.max(gg.knoechel.l.y, gg.knoechel.r.y) < 0.18;
    sitz.fuss = seiten((s, sg) => aufBoden ? gg.knoechel[s].clone() : gg.becken.clone().add(blick.clone().multiplyScalar(0.42)).add(R.links.clone().multiplyScalar(sg * 0.14)).setY(FY));
    sitz.kniePol = seiten((s, sg) => V(sg * 0.2, 1, 0.6).applyQuaternion(q));
    return { name: art, blick, stand: gg.becken.clone().add(blick.clone().multiplyScalar(0.22)),
      schritte: [{ ziel: haendeAufBeinen(sitz), d: DAUER.setzen }, { ziel: haendeNeben(Gp), d: DAUER.legen }, { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
  }
  if ((art === 'bauchlage' || art === 'seitlage') && gg.becken.y < 0.5) {   // am Boden: erst knien
    const blick = waag(gg.R.oben);   // Richtung Kopf
    const kniePunkt = gg.becken.clone().setY(0);
    const knien = stehen(kniePunkt, winkelVon(blick));
    knien.becken = kniePunkt.clone().setY(0.56);
    knien.fuss = seiten((s, sg) => kniePunkt.clone().add(blick.clone().multiplyScalar(-0.42)).add(V(sg * 0.12, 0, 0).applyQuaternion(drehY(winkelVon(blick)))).setY(0.09));
    knien.kniePol = seiten(() => blick.clone());
    knien.zehen = seiten(() => -40);
    knien.fussRicht = seiten(() => blick.clone().negate().add(V(0, -1.2, 0)));
    return { name: art, blick, stand: kniePunkt.clone().add(blick.clone().multiplyScalar(-0.15)), schritte: [{ ziel: knien, d: DAUER.setzen }, { ziel: Gp, d: DAUER.legen, verzug: 0.1, bogen: 0.1 }] };
  }
  if (art === 'haengen') {
    const blick = waag(gg.R.vor), stand = gg.becken.clone();
    const greifen = stehen(stand, winkelVon(blick), { hand: seiten((s) => gg.hand[s].clone()) });
    greifen.ellbogenPol = seiten((s, sg) => V(sg, -0.3, 0).applyQuaternion(drehY(winkelVon(blick))));
    return { name: art, blick, stand, schritte: [{ ziel: greifen, d: DAUER.greifen, verzug: 0.2 }, { ziel: Gp, d: DAUER.setzen }] };
  }
  const blick = waag(gg.R.vor);
  return { name: art, blick, stand: art === 'stehen' ? fussMitte.clone().add(blick.clone().multiplyScalar(-0.03)) : gg.becken.clone(), schritte: [{ ziel: Gp, d: DAUER.greifen + 0.3, verzug: 0.35 }] };
}
// Seitlich einsteigen (Sitz mit Polster, Hebel oder Rolle davor): neben dem Sitz stehen, Rücken zum Sitz, seitlich hinsetzen,
// dann auf dem Sitz eindrehen und die Beine unter Polster und Hebel bringen (Füße angehoben über Rahmen), zuletzt greifen
function seitlichSetzen(Gp, gg, sg, zurueck, heben) {
  const vor = waag(gg.R.vor), aussen = V(vor.z, 0, -vor.x).multiplyScalar(sg), wA = winkelVon(aussen), B = gg.becken.clone();
  const m = B.clone().add(aussen.clone().multiplyScalar(0.06)).sub(vor.clone().multiplyScalar(zurueck));
  const sitz = haendeAufBeinen(sitzen(m, wA, 0.42));
  return { name: 'seitlich' + (sg > 0 ? 'L' : 'R') + zurueck + '/' + heben, blick: aussen, abruecken: true, stand: m.clone().setY(0).add(aussen.clone().multiplyScalar(0.2)),
    schritte: [{ ziel: sitz, d: DAUER.setzen }, { ziel: haendeAufBeinen(Gp), d: DAUER.eindrehen, dreh: { m: B, w: kurz(winkelVon(vor) - wA) }, heben, hebenBis: 0.65 },
      { ziel: Gp, d: DAUER.greifen, verzug: 0.35 }] };
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
  const art = kategorie(G.g), gg = G.g, Gp = G.pose;

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

  // Geräte als Hindernisse; erlaubt ist, was die Startpose selbst berührt (Sitz, Polster, Griffe)
  const Q = quader(ger, new Set(hanteln.map((n) => z[n])));
  const erlaubtEnde = tiefen(gg, Q).map((t) => t + 0.015);
  const bewerten = (plan) => {
    let von = stehen(plan.stand, winkelVon(plan.blick)); const posen = [von];
    for (const s of plan.schritte) { const f = uebergang(von, s); for (const u of s.dreh ? [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] : [0.2, 0.4, 0.6, 0.8]) posen.push(f(u)); von = s.ziel; }   // Eindrehen feiner: die Beine streifen nur kurz
    return stoss(posen, Q, erlaubtEnde);
  };
  // Wo die Figur vor dem Gerät steht, wohin sie schaut und wie sie in die Startpose kommt: der klassische Einstieg, außer ein anderer
  // taucht deutlich weniger in die Geräte ein (Hanteln und Langhantel: immer klassisch)
  const plaene = [klassisch(art, G, Gp, gg)];
  if (Q.length && !hanteln.length && !z.lh) {
    if (art === 'sitzen' && auflage(Q, gg.becken) > 0.2) for (const sg of [1, -1])   // seitlich nur auf einen Sitz
      for (const zurueck of [0.03, 0.1]) for (const heben of [0.1, 0.03]) plaene.push(seitlichSetzen(Gp, gg, sg, zurueck, heben));
    if (art === 'rueckenlage') for (const d of [0.35, 0.5, 0.62]) plaene.push(langsitz(Gp, gg, Q, d));
    if ((art === 'bauchlage' || art === 'seitlage') && gg.becken.y >= 0.5 && Math.min(gg.knoechel.l.y, gg.knoechel.r.y) < 0.4) for (const d of [0.32, 0.45]) plaene.push(vorgebeugt(Gp, gg, d));
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
  let R = null; const W = {};
  const weg = (plan) => {
    const wEnde = winkelVon(plan.blick), P = plan.stand.clone().setY(0), start = startVon(P, 1);
    const erlaubt = tiefen(gelenke(stehen(P, wEnde)), Q).map((t) => t + 0.015);   // beim Laufen zählt nur, was die Figur am Standpunkt berührt
    const gerade = [], meter = start.distanceTo(P), richt = winkelVon(P.clone().sub(start));
    for (let s = 0, i = 0; s <= meter; s += 0.08, i++) gerade.push(gehend(start.clone().lerp(P, s / meter), richt, i, meter - s));
    for (const u of [0.5, 1]) gerade.push(stehen(P, richt + kurz(wEnde - richt) * u));
    let stossGerade = Q.length ? stoss(gerade, Q, erlaubt) : 0;
    if (stossGerade >= 0.015) { if (!R) R = raster(Q); stossGerade = Math.max(stossGerade, quer(P, start, meter, R)); }
    if (stossGerade < 0.015) return { punkte: [start, P], stoss: stossGerade, laenge: meter };
    if (!R) R = raster(Q);
    let best = null;
    for (const sg of [1, -1]) {
      let s = startVon(P, sg), k = zelleVon(s.x, s.z);
      if (k < 0 || R.frei[k] < 0) {   // Start steht im Gerät: nächste freie Zelle
        let bk = -1, bd = Infinity;
        for (let i = 0; i < NZ * NZ; i++) if (R.frei[i] >= 0) { const d = mitteVon(i).distanceTo(s); if (d < bd) { bd = d; bk = i; } }
        if (bk < 0) continue; k = bk; s = mitteVon(k);
      }
      W[sg] = W[sg] || wege(R, k);
      const a = anlauf(P, wEnde, W[sg], R, Q, erlaubt);
      if (!a) continue;
      a.punkte[0] = s;
      a.wert = a.laenge + 12 * a.stoss + (sg < 0 ? 0.4 : 0);
      if (!best || a.wert < best.wert) best = a;
    }
    // Hanteln und Langhantel: neuer Weg nur, wenn er klar besser ist (diese Abläufe sollen bleiben, wie sie waren)
    return best && best.stoss < stossGerade - (hanteln.length || z.lh ? 0.035 : 0) ? best : { punkte: [start, P], stoss: stossGerade, laenge: meter };
  };
  // Einstieg wählen: Eintauchen beim Einsteigen und auf dem letzten Stück des Wegs zusammen
  const hinten = (p) => (p.stand.clone().sub(gg.becken).setY(0).dot(kh) < -0.1 ? 0.015 : 0);
  const klass = plaene[0], wert = (p) => Math.max(p.stoss, p.weg.stoss) + hinten(p);
  klass.weg = weg(klass);
  let plan = klass;
  if (wert(klass) > 0.03) {
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
  const richtung = b.richtung(meter), dw = kurz(winkel - richtung);
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
  const tGriff = teile.reduce((a, x) => a + x.d, 0) + schritte.reduce((a, x) => a + x.d, 0) - 0.05;
  for (const s of schritte) { teile.push({ d: s.d, bild: uebergang(vorher, s) }); vorher = s.ziel; }
  const dauer = teile.reduce((a, x) => a + x.d, 0);
  return {
    dauer, tStart: G.t,
    // Pose zur Zeit sek; geraete: ab wann die Geräte mit den Händen mitgehen (Hanteln nach dem Aufheben, sonst nach dem Greifen)
    pose(sek) {
      let x = sek;
      for (const teil of teile) { if (x <= teil.d) return teil.bild(teil.d > 0 ? x / teil.d : 1); x -= teil.d; }
      return teile[teile.length - 1].bild(1);
    },
    gehtMit: (sek) => sek >= Math.min(haeltAb, tGriff),
    // zum Prüfen: Art, gewählter Einstieg, Ende des Laufens (mit Drehen)
    art, einstieg: plan.name, phasen: { gehenBis: tGehen + DAUER.drehen }
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
