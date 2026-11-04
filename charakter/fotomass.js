// DK Coach — Figur aus Fotos (Devin, 2.11.: „ich schicke den Körper rein und dann wird ein 3D-Format gebaut“, „ein Foto reinschicken und dann wird es gebaut“).
// Läuft ganz auf dem Gerät: MediaPipe Pose (Apache 2.0, ki/) findet Körperpunkte und den Umriss, daraus werden Längen und Breiten in cm. Die Fotos verlassen das Gerät nicht.
// Ein Foto von vorn reicht, eins von der Seite macht die Tiefe genauer. Gemessen wird die Figur selbst genauso (REF), darum heben sich Fehler der Erkennung weitgehend auf
let werkzeug = null, laden = null;
export function ladeErkennung() {
  if (laden) return laden;
  const u = (p) => new URL(p, document.baseURI).href;
  laden = (async () => {
    const vision = await import(u('ki/vision_bundle.js'));
    // Modell als Base64-Text: die Testseite liefert keine .task-Dateien aus (in der App kann es direkt als Datei liegen)
    const antwort = await fetch(u('ki/pose.txt'));
    if (!antwort.ok) throw new Error('pose.txt: ' + antwort.status);
    const b64 = atob((await antwort.text()).trim()), modell = new Uint8Array(b64.length);
    for (let i = 0; i < b64.length; i++) modell[i] = b64.charCodeAt(i);
    const fileset = { wasmLoaderPath: u('ki/vision_wasm_internal.js'), wasmBinaryPath: u('ki/vision_wasm_internal.wasm') };
    werkzeug = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: modell, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true,
      minPoseDetectionConfidence: 0.35, minPosePresenceConfidence: 0.35
    });
    return werkzeug;
  })().catch((err) => {
    // Der nächste Versuch lädt neu; die Ursache bleibt für die Messung, die Meldung für den Menschen
    laden = null;
    const f = new Error('Die Bilderkennung ließ sich hier nicht starten. Prüf deine Verbindung und versuch es noch einmal.');
    f.ursache = String((err && err.message) || err);
    throw f;
  });
  return laden;
}
// Punkte (MediaPipe): 0 Nase, 11/12 Schultern, 13/14 Ellbogen, 15/16 Handgelenke, 23/24 Hüften, 25/26 Knie, 27/28 Knöchel, 29/30 Fersen, 31/32 Zehen
const P = { nase: 0, sl: 11, sr: 12, el: 13, er: 14, hl: 15, hr: 16, ql: 23, qr: 24, kl: 25, kr: 26, al: 27, ar: 28, fl: 29, fr: 30, zl: 31, zr: 32 };
const mitte = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const abst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (l) => { const s = l.filter((v) => v > 0).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Bild → Punkte in Pixeln und Maske (Umriss) in derselben Auflösung
export async function erkenne(bild) {
  const pl = await ladeErkennung();
  const erg = pl.detect(bild);
  if (!erg.landmarks || !erg.landmarks.length) return null;
  const mp = erg.segmentationMasks && erg.segmentationMasks[0];
  if (!mp) return null;
  const w = mp.width, h = mp.height, roh = mp.getAsFloat32Array(), d = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = roh[i] > 0.5 ? 1 : 0;
  mp.close && mp.close();
  const lm = erg.landmarks[0], pkt = {};
  for (const k in P) { const p = lm[P[k]]; pkt[k] = { x: p.x * w, y: p.y * h, sichtbar: p.visibility == null ? 1 : p.visibility }; }
  const wl = erg.worldLandmarks && erg.worldLandmarks[0], gier = wl ? Math.atan2(Math.abs(wl[11].z - wl[12].z), Math.abs(wl[11].x - wl[12].x) + 1e-4) : 0;
  return { w, h, d, pkt, gier, welt: wl ? wl.map((p) => ({ x: p.x, y: p.y, z: p.z })) : null, alle: lm.map((p) => ({ x: p.x * w, y: p.y * h, s: p.visibility == null ? 1 : p.visibility })) };
}
const an = (e, x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < e.w && y < e.h && e.d[y * e.w + x] === 1; };
// Breite des Umrisses in Zeile y um x0: bis zur ersten Lücke auf jeder Seite (2 Pixel Lücke werden übersprungen)
function zeile(e, y, x0) {
  if (!an(e, x0, y)) { let f = -1; for (let r = 1; r < e.w * 0.12 && f < 0; r++) { if (an(e, x0 + r, y)) f = x0 + r; else if (an(e, x0 - r, y)) f = x0 - r; } if (f < 0) return { l: x0, r: x0, b: 0 }; x0 = f; }
  let l = x0, r = x0, luecke = 0;
  for (let x = x0 - 1; x >= 0; x--) { if (an(e, x, y)) { l = x; luecke = 0; } else if (++luecke > 2) break; }
  luecke = 0;
  for (let x = x0 + 1; x < e.w; x++) { if (an(e, x, y)) { r = x; luecke = 0; } else if (++luecke > 2) break; }
  return { l, r, b: r - l + 1 };
}
// Dicke quer zur Linie p→q an der Stelle t (Mittel aus drei Schnitten nahe beieinander)
function quer(e, p, q, t) {
  const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, werte = [];
  for (const d of [-0.05, 0, 0.05]) {
    const cx = p.x + dx * (t + d), cy = p.y + dy * (t + d);
    let a = 0, b = 0, f = 0;
    for (let s = 1; s < l * 0.8; s++) { if (an(e, cx + nx * s, cy + ny * s)) { a = s; f = 0; } else if (++f > 2) break; }
    f = 0;
    for (let s = 1; s < l * 0.8; s++) { if (an(e, cx - nx * s, cy - ny * s)) { b = s; f = 0; } else if (++f > 2) break; }
    werte.push(a + b + 1);
  }
  return median(werte);
}
// Kopf- und Fußpunkt: Scheitel aus dem Umriss, außer etwas sitzt drauf (Mütze, hohe Frisur): dann aus Nase und Schultern
function hoehePx(e) {
  const k = e.pkt, s = mitte(k.sl, k.sr), nx = k.nase.x, b = e.h - 1;
  let top = k.nase.y;
  for (let y = Math.round(k.nase.y); y >= 0; y--) { let treffer = false; for (let dx = -8; dx <= 8; dx += 4) if (an(e, nx + dx, y)) treffer = true; if (treffer) top = y; else if (k.nase.y - y > 6 && !treffer) break; }
  const schaetz = k.nase.y - 0.62 * (s.y - k.nase.y), mitMuetze = top < schaetz - Math.max(0.25 * (s.y - k.nase.y), 0.012 * e.h);
  if (mitMuetze) top = schaetz;
  const fuss = Math.max(k.fl.y, k.fr.y, k.zl.y, k.zr.y, k.al.y + 0.02 * e.h);
  let unten = fuss;
  for (const f of [k.fl, k.fr, k.zl, k.zr]) for (let y = Math.round(f.y); y < b; y++) { if (an(e, f.x, y)) unten = Math.max(unten, y); else break; }
  return { top, unten, px: unten - top, mitMuetze, abgeschnitten: top < 0.004 * e.h || unten > 0.996 * e.h || top <= 1, sichtbarFuss: Math.max(k.fl.sichtbar, k.fr.sichtbar, k.al.sichtbar, k.ar.sichtbar) };
}
// Steht die Person aufrecht, und ist das Foto von vorn oder von der Seite?
export function stehtGerade(e) {
  const k = e.pkt, sm = mitte(k.sl, k.sr), qm = mitte(k.ql, k.qr), T = qm.y - sm.y, km = mitte(k.kl, k.kr), am = mitte(k.al, k.ar);
  if (!(T > 0) || !(km.y > qm.y) || !(am.y > km.y) || Math.abs(qm.x - sm.x) > 0.4 * T || am.y - qm.y < 0.9 * T || k.nase.y > sm.y) return { ok: false, grund: 'Auf dem Foto stehst du nicht gerade: bitte aufrecht und von Kopf bis Fuß.' };
  return { ok: true, seitlich: Math.abs(k.sl.x - k.sr.x) < 0.3 * T };
}
// Maße von vorn in cm bei bekannter Größe
export function messeVorn(e, groesse) {
  const k = e.pkt, H = hoehePx(e), s = groesse / H.px, sm = mitte(k.sl, k.sr), qm = mitte(k.ql, k.qr), T = qm.y - sm.y;
  const inZeilen = (a, b, f) => { const w = []; for (let t = a; t <= b; t += 0.03) w.push(zeile(e, sm.y + T * t, sm.x + (qm.x - sm.x) * t).b); return f(w); };
  const hals = (() => { const w = []; for (let t = 0.35; t <= 0.85; t += 0.05) w.push(zeile(e, k.nase.y + (sm.y - k.nase.y) * t, k.nase.x + (sm.x - k.nase.x) * t).b); return Math.min(...w.filter((v) => v > 0)); })();
  const schulter = inZeilen(-0.02, 0.12, (w) => Math.max(...w));
  const brustW = inZeilen(0.34, 0.46, median), taille = inZeilen(0.5, 0.82, (w) => Math.min(...w.filter((v) => v > 0))), huefte = inZeilen(0.92, 1.12, (w) => Math.max(...w));
  const armeAn = brustW > schulter * 0.9 || brustW > taille * 1.45;   // Arme liegen am Körper: Brustbreite nicht messbar
  const oberarm = median([quer(e, k.sl, k.el, 0.66), quer(e, k.sr, k.er, 0.66)]), unterarm = median([quer(e, k.el, k.hl, 0.3), quer(e, k.er, k.hr, 0.3)]);
  const dick = (a, b, a2, b2, t) => {
    const q = quer(e, a, b, t), mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t, mx2 = a2.x + (b2.x - a2.x) * t, abstand = Math.abs(mx - mx2);
    return q > abstand * 1.12 ? zeile(e, my, (mx + mx2) / 2).b / 2 : q;
  };
  const oberschenkel = median([dick(k.ql, k.kl, k.qr, k.kr, 0.4), dick(k.qr, k.kr, k.ql, k.kl, 0.4)]), wade = median([dick(k.kl, k.al, k.kr, k.ar, 0.3), dick(k.kr, k.ar, k.kl, k.al, 0.3)]);
  // Leicht gedreht: Schultergelenke um den Winkel, Rumpf wie eine Ellipse (Tiefe rund 80 % der Breite). Bis 40°, darüber ist es kein Foto von vorn mehr
  const g = Math.min(0.7, e.gier || 0), kG = 1 / Math.cos(g), kR = 1 / Math.sqrt(Math.cos(g) ** 2 + 0.64 * Math.sin(g) ** 2);
  return {
    groesse, cmJePx: s, gier: g, warnung: warnungen(e, H, 'vorn', armeAn),
    hals: hals * s, schulter: schulter * s * kR, gelenkBreite: abst(k.sl, k.sr) * s * kG, brust: armeAn ? 0 : brustW * s * kR, taille: taille * s * kR, huefte: huefte * s * kR, hueftGelenk: abst(k.ql, k.qr) * s * kG,
    oberarm: oberarm * s, unterarm: unterarm * s, oberschenkel: oberschenkel * s, wade: wade * s,
    lRumpf: T * s, lOberarm: median([abst(k.sl, k.el), abst(k.sr, k.er)]) * s, lUnterarm: median([abst(k.el, k.hl), abst(k.er, k.hr)]) * s,
    lOberschenkel: median([abst(k.ql, k.kl), abst(k.qr, k.kr)]) * s, lUnterschenkel: median([abst(k.kl, k.al), abst(k.kr, k.ar)]) * s
  };
}
// Dicke einer Gliedmaße, wenn die Innenseite am Körper liegt: von der Linie p→q nur nach außen (weg von x = mitte) bis zum Umriss, mal zwei
function querAussen(e, p, q, t, mitte) {
  const dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, cxm = p.x + dx * t;
  let nx = -dy / l, ny = dx / l;
  if ((cxm - mitte) * nx < 0) { nx = -nx; ny = -ny; }
  const werte = [];
  for (const d of [-0.06, 0, 0.06]) {
    const cx = p.x + dx * (t + d), cy = p.y + dy * (t + d);
    let a = 0, f = 0;
    for (let s = 1; s < l * 0.8; s++) { if (an(e, cx + nx * s, cy + ny * s)) { a = s; f = 0; } else if (++f > 2) break; }
    werte.push(2 * a + 1);
  }
  return median(werte);
}
// Rohmaße für den Abgleich Foto gegen Figur: dieselbe Messung auf beiden Bildern, auch wenn Arme anliegen oder der Körper gedreht ist. Ohne Korrekturen, die Figur steht ja genauso
export function messeRoh(e, groesse) {
  const k = e.pkt, H = hoehePx(e), s = groesse / H.px, sm = mitte(k.sl, k.sr), qm = mitte(k.ql, k.qr), T = qm.y - sm.y;
  const inZeilen = (a, b, f) => { const w = []; for (let t = a; t <= b; t += 0.03) w.push(zeile(e, sm.y + T * t, sm.x + (qm.x - sm.x) * t).b); return f(w); };
  const hals = (() => { const w = []; for (let t = 0.35; t <= 0.85; t += 0.05) w.push(zeile(e, k.nase.y + (sm.y - k.nase.y) * t, k.nase.x + (sm.x - k.nase.x) * t).b); return Math.min(...w.filter((v) => v > 0)); })();
  const armBei = (y) => {
    const xs = [];
    for (const [a, b] of [[k.sl, k.el], [k.el, k.hl], [k.sr, k.er], [k.er, k.hr]]) if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
    for (const [a, b] of [[k.el, k.hl], [k.er, k.hr]]) { const c = { x: b.x + (b.x - a.x) * 0.35, y: b.y + (b.y - a.y) * 0.35 }; if ((y - b.y) * (y - c.y) <= 0 && b.y !== c.y) xs.push(b.x + (c.x - b.x) * (y - b.y) / (c.y - b.y)); }
    return xs;
  };
  const prof = [];
  for (let t = -0.02; t <= 1.13; t += 0.03) { const y = sm.y + T * t, z = zeile(e, y, sm.x + (qm.x - sm.x) * t), frei = !armBei(y).some((x) => x >= z.l - 4 && x <= z.r + 4); prof.push({ t, b: z.b * s, frei }); }
  // Dicke quer nur, wenn beide Seiten im Freien enden; sonst liegt die Gliedmaße am oder vor dem Körper
  const querFrei = (p, q, t) => { const v = quer(e, p, q, t), l = abst(p, q); return v > 0 && v < l * 0.62 ? v : 0; };
  const beide = (a, b) => (a > 0 && b > 0 ? (a + b) / 2 : a || b);
  return {
    groesse, cmJePx: s, hoehePx: H.px, mitMuetze: H.mitMuetze, abgeschnitten: H.abgeschnitten, prof, ohren: e.alle ? Math.hypot(e.alle[7].x - e.alle[8].x, e.alle[7].y - e.alle[8].y) * s : 0,
    hals: hals * s, schulter: inZeilen(-0.02, 0.12, (w) => Math.max(...w)) * s, brust: inZeilen(0.34, 0.46, median) * s, taille: inZeilen(0.55, 0.8, median) * s, huefte: inZeilen(0.92, 1.1, median) * s,
    oberarm: median([querAussen(e, k.sl, k.el, 0.5, sm.x), querAussen(e, k.sr, k.er, 0.5, sm.x)]) * s, unterarm: beide(querFrei(k.el, k.hl, 0.35), querFrei(k.er, k.hr, 0.35)) * s,
    oberschenkel: median([querAussen(e, k.ql, k.kl, 0.45, qm.x), querAussen(e, k.qr, k.kr, 0.45, qm.x)]) * s, wade: median([querAussen(e, k.kl, k.al, 0.3, qm.x), querAussen(e, k.kr, k.ar, 0.3, qm.x)]) * s,
    lRumpf: T * s, lOberarm: Math.max(abst(k.sl, k.el), abst(k.sr, k.er)) * s, lUnterarm: Math.max(abst(k.el, k.hl), abst(k.er, k.hr)) * s,
    lOberschenkel: Math.max(abst(k.ql, k.kl), abst(k.qr, k.kr)) * s, lUnterschenkel: Math.max(abst(k.kl, k.al), abst(k.kr, k.ar)) * s
  };
}
export const hatMuetze = (e) => hoehePx(e).mitMuetze;
// Maße von der Seite: Tiefe von Brust, Taille, Gesäß, Oberschenkel
export function messeSeite(e, groesse) {
  const k = e.pkt, H = hoehePx(e), s = groesse / H.px, sm = mitte(k.sl, k.sr), qm = mitte(k.ql, k.qr), T = qm.y - sm.y;
  const inZeilen = (a, b, f) => { const w = []; for (let t = a; t <= b; t += 0.03) w.push(zeile(e, sm.y + T * t, sm.x + (qm.x - sm.x) * t).b); return f(w); };
  return { cmJePx: s, warnung: warnungen(e, H, 'seite', false), brustT: inZeilen(0.2, 0.34, median) * s, tailleT: inZeilen(0.5, 0.82, median) * s, huefteT: inZeilen(0.9, 1.12, median) * s };
}
function warnungen(e, H, art, armeAn) {
  const w = [];
  if (H.abgeschnitten) w.push('Kopf oder Füße sind am Bildrand abgeschnitten: der ganze Körper muss drauf sein.');
  else if (H.sichtbarFuss < 0.3) w.push('Die Füße sind schlecht zu sehen, die Größe stimmt dadurch weniger genau.');
  if (H.px < e.h * 0.45) w.push('Du bist weit weg im Bild: näher ran gibt genauere Maße.');
  if (armeAn) w.push('Die Arme liegen am Körper: halte sie etwas seitlich weg, sonst wird die Brust geschätzt.');
  if (art === 'vorn' && (e.gier || 0) > 0.35) w.push('Du stehst leicht gedreht: gerade zur Kamera werden die Breiten genauer.');
  return w;
}
// Die DK-Figur, genauso gemessen (kalibriere in der Werkstatt, 2.11.): ihre Maße sind die 100 %
export const REF = { vorn: { groesse: 180, hals: 12.73, schulter: 56.85, gelenkBreite: 39.35, brust: 36, taille: 31.39, huefte: 41.71, hueftGelenk: 20.34, oberarm: 12.07, unterarm: 12.07, oberschenkel: 22.83, wade: 13.17, lRumpf: 52.5, lOberarm: 28.75, lUnterarm: 24.81, lOberschenkel: 41.01, lUnterschenkel: 35.85 }, seite: { brustT: 33.12, tailleT: 31.29, huefteT: 26.95 } };
export function setzeRef(r) { REF.vorn = r.vorn; REF.seite = r.seite; }
// Körperfett grob aus Hals, Taille und Größe (US-Navy-Formel), Umfänge als Ellipse aus Breite und Tiefe. Nur Schätzung
export function schaetzeFett(v, se, frau = false) {
  const umfang = (a, b) => { const x = a / 2, y = b / 2; return Math.PI * (3 * (x + y) - Math.sqrt((3 * x + y) * (x + 3 * y))); };
  const hals = umfang(v.hals, v.hals * 1.05), taille = umfang(v.taille, se ? se.tailleT : v.taille * 0.72), huefte = umfang(v.huefte, se ? se.huefteT : v.huefte * 0.72), log = Math.log10;
  const f = frau ? 495 / (1.29579 - 0.35004 * log(taille + huefte - hals) + 0.221 * log(v.groesse)) - 450 : 495 / (1.0324 - 0.19077 * log(taille - hals) + 0.15456 * log(v.groesse)) - 450;
  return Math.max(4, Math.min(45, f));
}
export const armFrei = (v) => ({ ober: v.oberarm <= 0.82 * v.oberschenkel, unter: v.unterarm <= 0.72 * v.oberschenkel });
function armVerhaeltnis(v, R, gr) {
  const f = armFrei(v), bein = gr(v.oberschenkel + 0.5 * v.wade, R.oberschenkel + 0.5 * R.wade);
  if (f.ober && f.unter) return gr(v.oberarm + 0.6 * v.unterarm, R.oberarm + 0.6 * R.unterarm);
  if (f.ober) return gr(v.oberarm, R.oberarm);
  if (f.unter) return gr(v.unterarm, R.unterarm);
  return bein;
}
// Aus den Maßen die Verhältnisse zur DK-Figur (begrenzt, damit eine schlechte Erkennung die Figur nicht zerstört)
export function verhaeltnisse(v, se) {
  const R = REF.vorn, RS = REF.seite, gr = (a, b, lo = 0.72, hi = 1.32) => (a > 0 && b > 0 ? Math.max(lo, Math.min(hi, a / b)) : 1);
  const hoehe = v.groesse / R.groesse;
  const breit = { schulter: gr(v.gelenkBreite, R.gelenkBreite), aussen: gr(v.schulter, R.schulter), taille: gr(v.taille, R.taille), huefte: gr(v.huefte, R.huefte), hueftG: gr(v.hueftGelenk, R.hueftGelenk), arm: armVerhaeltnis(v, R, gr), bein: gr((v.oberschenkel + 0.5 * v.wade), (R.oberschenkel + 0.5 * R.wade)) };
  breit.brust = v.brust > 0 ? gr(v.brust, R.brust) : (breit.aussen + breit.taille) / 2;
  const tiefe = se ? { brust: gr(se.brustT, RS.brustT), taille: gr(se.tailleT, RS.tailleT), huefte: gr(se.huefteT, RS.huefteT) } : { brust: breit.brust, taille: breit.taille, huefte: breit.huefte };
  const lang = { rumpf: gr(v.lRumpf, R.lRumpf, 0.8, 1.25), oberarm: gr(v.lOberarm, R.lOberarm, 0.8, 1.25), unterarm: gr(v.lUnterarm, R.lUnterarm, 0.8, 1.25), oberschenkel: gr(v.lOberschenkel, R.lOberschenkel, 0.8, 1.25), unterschenkel: gr(v.lUnterschenkel, R.lUnterschenkel, 0.8, 1.25) };
  return { hoehe, breit, tiefe, lang };
}

// Überträgt die Verhältnisse auf die Figur: Längen in MASS (die Knochen richten sich danach), Breiten und Tiefen in BAU. basis = Kopie der Ausgangswerte. stark 0…1: für den weichen Übergang
export function anwenden(r, basis, BAU, MASS, figur, stark = 1) {
  const m = (a, b) => a + (b - a) * stark, B = basis.BAU, M = basis.MASS, h = r.hoehe;
  MASS.oberarm = m(M.oberarm, M.oberarm * h * r.lang.oberarm); MASS.unterarm = m(M.unterarm, M.unterarm * h * r.lang.unterarm); MASS.griff = m(M.griff, M.griff * h);
  MASS.oberschenkel = m(M.oberschenkel, M.oberschenkel * h * r.lang.oberschenkel); MASS.unterschenkel = m(M.unterschenkel, M.unterschenkel * h * r.lang.unterschenkel);
  MASS.rumpf = m(M.rumpf, M.rumpf * h * r.lang.rumpf); MASS.schulterBreite = m(M.schulterBreite, M.schulterBreite * h * r.breit.schulter); MASS.hueftBreite = m(M.hueftBreite, M.hueftBreite * h * r.breit.hueftG);
  const b = r.breit, t = r.tiefe;
  BAU.breite.Spine2 = m(B.breite.Spine2, B.breite.Spine2 * h * b.brust); BAU.breite.Spine1 = m(B.breite.Spine1, B.breite.Spine1 * h * (b.brust + b.taille) / 2); BAU.breite.Spine = m(B.breite.Spine, B.breite.Spine * h * b.taille);
  BAU.breite.Hips = m(B.breite.Hips, B.breite.Hips * h * b.huefte); BAU.breite.Root = m(B.breite.Root, B.breite.Root * h * b.huefte);
  BAU.tiefe.Spine2 = m(B.tiefe.Spine2, B.tiefe.Spine2 * h * t.brust); BAU.tiefe.Spine1 = m(B.tiefe.Spine1, B.tiefe.Spine1 * h * (t.brust + t.taille) / 2); BAU.tiefe.Spine = m(B.tiefe.Spine, B.tiefe.Spine * h * t.taille);
  BAU.tiefe.Hips = m(B.tiefe.Hips, B.tiefe.Hips * h * t.huefte); BAU.tiefe.Root = m(B.tiefe.Root, B.tiefe.Root * h * t.huefte);
  const hl = b.hals == null ? 1 : b.hals; BAU.breite.Neck = m(B.breite.Neck, B.breite.Neck * h * hl); BAU.tiefe.Neck = m(B.tiefe.Neck, B.tiefe.Neck * h * hl);
  BAU.arm = m(B.arm, B.arm * h * b.arm); BAU.bein = m(B.bein, B.bein * h * b.bein); BAU.kopf = m(B.kopf, B.kopf * (r.kopf || Math.pow(h, 0.5)));
  if (figur && figur.ruhe) figur.ruhe.schulterSkala = MASS.schulterBreite / figur.ruhe.P('LeftArm').x;
}

export function nurSeite(e, groesse) {
  const v = messeVorn(e, groesse), se = messeSeite(e, groesse), r = verhaeltnisse(v, se);
  r.breit.brust = r.tiefe.brust; r.breit.taille = r.tiefe.taille; r.breit.huefte = r.tiefe.huefte; r.breit.schulter = 1 + (r.tiefe.brust - 1) * 0.5; r.breit.aussen = r.breit.schulter; r.breit.hueftG = 1;
  return { r, v, se };
}

// Taugt das Foto dafür, dass die Figur es ganz trägt? Liegen Arme vor dem Rumpf, fehlt dort das Shirt, und der Arm wäre daraufgemalt. Stark gedreht fehlt eine Seite
export function ganzesFotoTaugt(e) {
  const k = e.pkt, smY = (k.sl.y + k.sr.y) / 2, qmY = (k.ql.y + k.qr.y) / 2;
  const innen = (p) => {
    const t = (p.y - smY) / (qmY - smY || 1);
    if (t < 0.12 || t > 1.02) return false;
    const a = Math.min(k.sl.x, k.sr.x) + (Math.min(k.ql.x, k.qr.x) - Math.min(k.sl.x, k.sr.x)) * t, b = Math.max(k.sl.x, k.sr.x) + (Math.max(k.ql.x, k.qr.x) - Math.max(k.sl.x, k.sr.x)) * t;
    return p.x > a && p.x < b;
  };
  const mitte = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const vorn = [k.el, k.er, k.hl, k.hr, mitte(k.el, k.hl), mitte(k.er, k.hr)].some(innen);
  if (vorn || (e.gier || 0) > 0.6) return { ok: false, grund: 'Damit die Figur dein ganzes Foto tragen kann, brauche ich dich gerade von vorn und mit den Armen seitlich weg vom Körper. Mit diesem Foto bekommt sie nur dein Gesicht und die Farben deiner Kleidung.' };
  return { ok: true };
}
