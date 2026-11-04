// DK Coach — Aus den gespeicherten Werten eines Charakters die Zahlen der Figur: im Editor, auf der Kundenseite und im Gym der App derselbe Weg. Nur Rechnen, keine Figur und keine Seite.
export const EINS = () => ({ hoehe: 1, kopf: 1, breit: { schulter: 1, aussen: 1, taille: 1, huefte: 1, hueftG: 1, arm: 1, bein: 1, brust: 1, hals: 1 }, tiefe: { brust: 1, taille: 1, huefte: 1 }, lang: { rumpf: 1, oberarm: 1, unterarm: 1, oberschenkel: 1, unterschenkel: 1 } });
export const mischR = (a, b, u) => { const r = EINS(); r.hoehe = a.hoehe + (b.hoehe - a.hoehe) * u; r.kopf = (a.kopf || 1) + ((b.kopf || 1) - (a.kopf || 1)) * u; for (const g of ['breit', 'tiefe', 'lang']) for (const k in r[g]) { const p = a[g][k] == null ? 1 : a[g][k], q = b[g][k] == null ? 1 : b[g][k]; r[g][k] = p + (q - p) * u; } return r; };
// wert(id): der Inhalt eines Felds, als Text wie im Formular
export function daten(wert, fettSchaetzung) {
  const groesse = Math.max(130, Math.min(220, +wert('e-groesse') || 175)), gewicht = Math.max(35, Math.min(200, +wert('e-gewicht') || 50)), frau = wert('e-geschlecht') === 'w', ein = +wert('e-fett'), geschaetzt = !(ein >= 3);
  const fett = geschaetzt ? (fettSchaetzung ? fettSchaetzung(groesse, gewicht, frau) : 10) : Math.min(60, ein), h2 = (groesse / 100) ** 2, ffm = gewicht * (1 - fett / 100);
  return { groesse, gewicht, frau, fett, geschaetzt, h2, ffm, grenzeFfm: (frau ? 21 : 25) * h2, fettGrenze: frau ? 24 : 15 };
}
export function mitNachstellen(r, wert) {
  const n = mischR(r, r, 0), t = (id) => 1 + +wert(id) / 100;
  n.breit.schulter *= t('t-schulter'); n.breit.aussen *= t('t-schulter'); n.breit.brust *= t('t-brust'); n.tiefe.brust *= t('t-brust'); n.breit.taille *= t('t-taille'); n.tiefe.taille *= t('t-taille'); n.breit.arm *= t('t-arm'); n.breit.bein *= t('t-bein');
  n.kopf = (n.kopf || 1) * t('t-kopf');
  n.breit.huefte *= t('t-huefte'); n.tiefe.huefte *= t('t-huefte'); n.breit.hueftG *= 1 + (t('t-huefte') - 1) * 0.5; n.breit.hals *= t('t-hals');
  // Beinlänge: die Gesamthöhe bleibt, der Rumpf gleicht aus
  const bl = t('t-beinl'); n.lang.oberschenkel *= bl; n.lang.unterschenkel *= bl; n.lang.rumpf *= 1 - (bl - 1) * 0.89 / 0.5;
  return n;
}
// Was sich zwischen zwei Ständen in den Zahlen ändert, kommt auf die Form obendrauf, auch wenn sie aus Fotos stammt: Gewicht ändern ändert die Figur, Minimum und Maximum zeigen das Ziel
export function nachZahlen(modell, r0, g0, von, zu) {
  const a0 = modell(g0, von.gewicht, von.fett), b0 = modell(g0, zu.gewicht, zu.fett), n = mischR(r0, r0, 0);
  for (const g of ['breit', 'tiefe']) for (const k in a0[g]) if (n[g][k] != null) n[g][k] *= b0[g][k] / a0[g][k];
  return n;
}
// Muskelzeichnung: Wie stark sich die Muskeln abheben, hängt an der fettfreien Masse (FFMI 15 fast nichts als Sehnen und Rippen, ab FFMI 22 voll). Wo sie noch sichtbar ist, sagt je Stelle das Körperfett (koerperform.js)
const reliefAus = (ffm, h2) => 0.35 + 0.65 * Math.max(0, Math.min(1, (ffm / h2 - 15) / 7));
// Mit dem Regler (v von -1 bis 1): 0 lässt es bei dem, was die Zahlen hergeben; plus zeigt mehr, minus weniger
export function reliefMit(ffm, h2, v) { const g = reliefAus(ffm, h2); return v >= 0 ? g + (1 - g) * v : g * (1 + v); }
// Foto-Maß: Es gilt für den Stand beim Messen, die Zahlen von heute kommen obendrauf
export function ausFoto(modell, rFoto, dFoto, d) { const r = nachZahlen(modell, rFoto, dFoto.groesse, dFoto, d); r.hoehe = d.groesse / 180; return r; }
