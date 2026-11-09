// DK Coach — Spielstand fürs Gym: Punkte, Level, Titel und Wochen-Serie (09.11.2026, Paket G3 „Bonus-System“).
// Nur Regeln und Zahlen. Kein DOM, kein Netz, kein Zufall: Darum lässt sich alles mit Node prüfen (pruefe-spiel.mjs) und bleibt leicht zu überblicken.
// Schutzregeln (PLAN.md, Abschnitt 4; Devin und viele Kunden sind unter 18):
//  - Gezählt wird nur Training: nichts vom Körper, keine Rangliste, kein Vergleich mit anderen, nichts zu kaufen, nichts per Zufall.
//  - Kein Druck: Punkte und Level gehen nie verloren. Verpasst jemand eine Woche, beginnt die Serie still von vorn, ohne Abzug und ohne Meldung.
//  - Fair: Wer wegen Beschwerden weniger oder angepasste Übungen hat, bekommt dieselben Einheiten-Punkte (fest 50).
//  - Alles bleibt auf dem Gerät, in einem einzigen Speicherschlüssel. Beim Lesen wird jeder Wert geprüft: Kaputtes oder Fremdes zählt nicht,
//    dann ist der Stand leer. Nach außen wirft nichts einen Fehler.
// Die Statuskarte im Raum liest status(); app.js meldet stationGeschafft() und einheitGeschafft().

export const VERSION = 1;
export const SCHLUESSEL = 'dk_spiel_stand';   // der einzige Speicherschlüssel; app.js nimmt genau ihn beim Umzug mit (UMZUG_JE)

/* ---------- Die Regeln. Hier drehen, wenn Devin etwas anders will: Das Level wird nie gespeichert, nur aus den Punkten berechnet, alte Stände passen also immer. ---------- */
export const PUNKTE = Object.freeze({
  station: 10,      // je geschaffter Übung (im Gym: Station)
  mindestSekunden: 30,   // Devin (09.11.): eine Übung zählt erst, wenn sie mindestens eine halbe Minute gelaufen ist
  einheit: 50,      // für die ganze Einheit (die Tür); fest, egal wie viele Übungen der Plan hat
  alleSaetze: 25,   // dazu, wenn jeder Satz der Einheit gemacht ist
  wochenZiel: 20,   // einmal je Woche, sobald das Wochenziel erreicht ist
  proTag: 250       // mehr zählt an einem Tag nicht, damit Wiederholen nichts bringt (der Wochen-Bonus ist davon ausgenommen, sonst ginge er an einem vollen Tag verloren)
});
// Zehn Level mit wachsenden Abständen (100, 150, 250, 400, 500, 600, 800, 1000, 1200). Bei drei vollen Einheiten pro Woche ist Level 10 nach gut zehn Wochen da.
export const LEVEL = Object.freeze([
  { ab: 0, titel: 'Neuling' }, { ab: 100, titel: 'Stammgast' }, { ab: 250, titel: 'Eisen' }, { ab: 500, titel: 'Stahl' }, { ab: 900, titel: 'Titan' },
  { ab: 1400, titel: 'Chrom' }, { ab: 2000, titel: 'Gold' }, { ab: 2800, titel: 'Platin' }, { ab: 3800, titel: 'Diamant' }, { ab: 5000, titel: 'Legende' }
].map((l) => Object.freeze(l)));
// Technische Grenzen, nicht zum Drehen: Ein gespeicherter Stand, der nicht dazu passt, gilt als kaputt. 60 + 240 Listeneinträge bleiben unter 20 000 Zeichen
// (der Umzug nimmt höchstens 50 000 an).
export const GRENZEN = Object.freeze({ punkte: 1e6, einheiten: 1e5, woche: 2e4, wocheEinheiten: 1e3, serie: 5e3, einheitenListe: 60, stationenListe: 240, text: 2e4 });

/* ---------- Prüfen ---------- */
const PLAN_MUSTER = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;   // wie K.idOk in kompakt.js
const EINHEIT_MUSTER = /^[A-Za-z][A-Za-z0-9_-]{0,40}\|\d{4}-\d{1,2}-\d{1,2}\|\d{1,2}$/;
const STATION_MUSTER = /^[A-Za-z][A-Za-z0-9_-]{0,40}\|\d{4}-\d{1,2}-\d{1,2}\|\d{1,2}\|\d{1,2}$/;
const istObjekt = (o) => {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;   // nur schlichte Objekte, wie JSON sie macht
};
// Ganze Zahl im Bereich, sonst null (Number.isInteger lehnt Text, NaN und unendlich schon ab)
const ganz = (x, von, bis) => (Number.isInteger(x) && x >= von && x <= bis ? x + 0 : null);
function liste(x, muster, max) {
  if (!Array.isArray(x) || x.length > max) return null;
  const aus = [];
  for (let i = 0; i < x.length; i++) { const e = x[i]; if (typeof e !== 'string' || !muster.test(e)) return null; aus.push(e); }   // for statt every: Lücken im Feld fallen sonst durch
  return aus;
}
// Datum wie datumHeute() in app.js („2026-11-9“, ohne führende Nullen); gibt es in der Form zurück oder null
function datumPruefen(s) {
  const m = typeof s === 'string' ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) : null;
  if (!m) return null;
  const j = +m[1], mo = +m[2], t = +m[3], d = new Date(Date.UTC(j, mo - 1, t));
  return j >= 2000 && j <= 2100 && d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t ? j + '-' + mo + '-' + t : null;
}
// Tag und Woche aus der Ortszeit (wie datumHeute): Die Woche geht von Montag bis Sonntag. Der 1.1.1970 war ein Donnerstag, darum + 3.
function zeitVon(jetzt) {
  const ms = Number.isFinite(jetzt) && jetzt > 9.47e11 && jetzt < 4.1e12 ? jetzt : Date.now();
  const d = new Date(ms), j = d.getFullYear(), m = d.getMonth(), t = d.getDate();
  return { ms, tag: j + '-' + (m + 1) + '-' + t, woche: Math.floor((Date.UTC(j, m, t) / 864e5 + 3) / 7) };
}

/* ---------- Speicher: ein Schlüssel, nur Text. Tests tauschen ihn aus (setzeSpeicher), im Browser ist es localStorage. ---------- */
const istSpeicher = (s) => !!s && typeof s.lies === 'function' && typeof s.schreibe === 'function';
// Die Methoden hier nehmen nie einen fremden Schlüssel: Das Prüfskript (sicherheit-pruefen.js) sucht genau diese zwei Aufrufe
const browserSpeicher = {
  lies() { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(SCHLUESSEL); } catch (e) { return null; } },
  schreibe(k, text) { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(SCHLUESSEL, text); return true; } catch (e) { return false; } }
};
let eingesetzt = null;
export function setzeSpeicher(s) { eingesetzt = istSpeicher(s) ? s : null; }   // nur für Tests; null stellt den Browser-Speicher wieder ein
const speicherWahl = (s) => (istSpeicher(s) ? s : eingesetzt || browserSpeicher);

const leererStand = () => ({ punkte: 0, einheiten: 0, tag: '', tagPunkte: 0, woche: 0, wocheEinheiten: 0, wocheBonus: false, wochenZiel: 1, serie: 0, serieWoche: 0, einheitenListe: [], stationenListe: [] });
const kopie = (s) => Object.assign({}, s, { einheitenListe: s.einheitenListe.slice(), stationenListe: s.stationenListe.slice() });
// Aus gespeichertem Text oder Objekt einen geprüften Stand machen, sonst null. Es zählen nur eigene Felder; was nicht stimmt, macht den ganzen Stand ungültig.
function pruefe(roh) {
  if (typeof roh === 'string') {
    if (roh.length > GRENZEN.text) return null;
    roh = JSON.parse(roh);   // wirft bei kaputtem Text, lesen() fängt das ab
  }
  if (!istObjekt(roh)) return null;
  const g = (k) => (Object.prototype.hasOwnProperty.call(roh, k) ? roh[k] : undefined);
  if (g('v') !== VERSION) return null;
  const bonus = g('wocheBonus');
  const s = {
    punkte: ganz(g('punkte'), 0, GRENZEN.punkte),
    einheiten: ganz(g('einheiten'), 0, GRENZEN.einheiten),
    tag: g('tag') === '' ? '' : datumPruefen(g('tag')),
    tagPunkte: ganz(g('tagPunkte'), 0, GRENZEN.punkte),   // nicht an proTag gebunden, sonst wären alte Stände nach einer neuen Regel ungültig
    woche: ganz(g('woche'), 0, GRENZEN.woche),
    wocheEinheiten: ganz(g('wocheEinheiten'), 0, GRENZEN.wocheEinheiten),
    wocheBonus: bonus === true || bonus === false ? bonus : null,
    wochenZiel: ganz(g('wochenZiel'), 1, 7),
    serie: ganz(g('serie'), 0, GRENZEN.serie),
    serieWoche: ganz(g('serieWoche'), 0, GRENZEN.woche),
    einheitenListe: liste(g('einheitenListe'), EINHEIT_MUSTER, GRENZEN.einheitenListe),
    stationenListe: liste(g('stationenListe'), STATION_MUSTER, GRENZEN.stationenListe)
  };
  for (const k of Object.keys(s)) if (s[k] === null) return null;
  return s;   // ein Level gibt es hier absichtlich nicht: Es wird aus den Punkten berechnet, nie aus dem Speicher geglaubt
}
// null = gelesen, aber kaputt (gilt als leer); undefined = gar nicht lesbar. Dann wird nichts geschrieben, sonst könnte ein vorübergehender Fehler einen guten Stand überschreiben.
function lesen(sp) {
  let roh;
  try { roh = sp.lies(SCHLUESSEL); } catch (e) { return undefined; }
  try { return pruefe(roh); } catch (e) { return null; }
}
function schreiben(sp, s) {
  try {
    const text = JSON.stringify(Object.assign({ v: VERSION }, s));
    if (text.length > GRENZEN.text) return false;
    return sp.schreibe(SCHLUESSEL, text) !== false;   // voll oder verboten: false, nie ein Fehler
  } catch (e) { return false; }
}

/* ---------- Level ---------- */
export function levelFuer(punkte) {
  let n = 1;
  for (let i = 1; i < LEVEL.length; i++) if (punkte >= LEVEL[i].ab) n = i + 1;
  return n;
}
const aufstieg = (vorher, punkte) => { const n = levelFuer(punkte); return n > vorher ? { level: n, titel: LEVEL[n - 1].titel } : null; };
function zielText(leer, naechstes) {
  if (leer) return 'Nächstes Ziel: Schaff deine erste Station im Gym.';
  if (!naechstes) return 'Nächstes Ziel: Bleib dabei, du bist schon ganz oben.';
  return 'Nächstes Ziel: Rang ' + naechstes.nr + ' „' + naechstes.titel + '“, noch ' + naechstes.fehlt + (naechstes.fehlt === 1 ? ' Punkt.' : ' Punkte.');
}

/* ---------- Status: das, was die Karte im Raum zeigt ---------- */
function statusAus(s, zeit) {
  const punkte = s.punkte, level = levelFuer(punkte), von = LEVEL[level - 1].ab, naechst = LEVEL[level] || null, bis = naechst ? naechst.ab : null;
  const naechstes = naechst ? { nr: level + 1, titel: naechst.titel, fehlt: bis - punkte } : null;
  const leer = !s.punkte && !s.einheiten && !s.einheitenListe.length && !s.stationenListe.length;
  return {
    leer, punkte, level, titel: LEVEL[level - 1].titel, vonPunkten: von, bisPunkten: bis,
    anteil: naechst ? (punkte - von) / (bis - von) : 1,   // im höchsten Level ist der Balken voll
    naechstes,
    // Die Serie zählt Wochen. Sie lebt, solange die letzte geschaffte Woche diese oder die davor ist; danach beginnt sie still bei null (Punkte bleiben)
    serieWochen: s.serie > 0 && s.serieWoche >= zeit.woche - 1 ? s.serie : 0,
    einheiten: s.einheiten,
    dieseWoche: s.woche === zeit.woche ? s.wocheEinheiten : 0,
    wochenZiel: s.wochenZiel,
    ziel: zielText(leer, naechstes)
  };
}
// Liest und prüft, schreibt nichts und wirft nie. Ist der Speicher leer, kaputt oder gesperrt, kommt der leere Stand.
export function status(jetzt = Date.now(), speicher) {
  try { return statusAus(lesen(speicherWahl(speicher)) || leererStand(), zeitVon(jetzt)); } catch (e) { return statusAus(leererStand(), zeitVon(Date.now())); }   // null und undefined: leerer Stand
}

/* ---------- Punkte vergeben ---------- */
// Höchstens proTag Punkte je Kalendertag: So bringt Wiederholen nichts, und ein normaler Trainingstag (auch mit vielen Übungen) bleibt weit darunter
function tagesPlus(s, wunsch, tag) {
  if (s.tag !== tag) { s.tag = tag; s.tagPunkte = 0; }
  const plus = Math.max(0, Math.min(wunsch, PUNKTE.proTag - s.tagPunkte));
  s.tagPunkte += plus;
  return plus;
}
const merke = (l, eintrag, max) => { l.push(eintrag); while (l.length > max) l.shift(); };   // die ältesten fallen weg
// Einmal je (Plan, Datum, Trainingstag) und Station. Fehlt das Datum oder ist es unbrauchbar, gilt der Tag von jetzt; Plan, Tag und Station müssen stimmen.
function schluessel(e, zeit, mitStation) {
  if (!e || typeof e !== 'object') return null;
  const plan = typeof e.plan === 'string' && PLAN_MUSTER.test(e.plan) ? e.plan : null;
  const tag = ganz(e.tag, 0, 99), station = mitStation ? ganz(e.station, 0, 99) : 0;
  if (plan === null || tag === null || station === null) return null;
  return plan + '|' + (datumPruefen(e.datum) || zeit.tag) + '|' + tag + (mitStation ? '|' + station : '');
}
const wochenZielVon = (x) => (Number.isFinite(x) ? Math.min(7, Math.max(1, Math.round(x))) : null);   // Plantage pro Woche, mindestens 1
const antwort = (plus, levelAuf, s, zeit, mehr) => Object.assign({ plus, levelAuf }, mehr, { status: statusAus(s, zeit) });
const nichts = (jetzt, speicher, mehr) => Object.assign({ plus: 0, levelAuf: null }, mehr, { status: status(jetzt, speicher) });

// Eine Station ist geschafft (alle Sätze der Übung). e: { plan, datum, tag, station, wochenZiel? } mit tag und station als Zahl ab 0.
// Gibt { plus, levelAuf: null | { level, titel }, status } zurück; plus ist 0, wenn die Station schon gewertet war oder das Tageslimit erreicht ist.
export function stationGeschafft(e, jetzt = Date.now(), speicher) {
  try {
    const sp = speicherWahl(speicher), zeit = zeitVon(jetzt), gelesen = lesen(sp), alt = gelesen || leererStand(), key = schluessel(e, zeit, true);
    if (gelesen === undefined || key === null || alt.stationenListe.includes(key)) return antwort(0, null, alt, zeit);
    if (!(Number.isFinite(e.sekunden) && e.sekunden >= PUNKTE.mindestSekunden)) return antwort(0, null, alt, zeit, { zuKurz: true });   // nicht gemerkt: Wird die Übung richtig zu Ende gemacht, zählt sie noch
    const s = kopie(alt), vorher = levelFuer(s.punkte), ziel = wochenZielVon(e.wochenZiel);
    merke(s.stationenListe, key, GRENZEN.stationenListe);
    if (ziel) s.wochenZiel = ziel;   // so zeigt die Karte schon vor der ersten fertigen Einheit „x von y“ richtig
    s.punkte = Math.min(GRENZEN.punkte, s.punkte + tagesPlus(s, PUNKTE.station, zeit.tag));
    if (!schreiben(sp, s)) return antwort(0, null, alt, zeit);   // nicht gespeichert: nichts melden, was beim nächsten Lesen wieder weg wäre
    return antwort(s.punkte - alt.punkte, aufstieg(vorher, s.punkte), s, zeit);
  } catch (err) { return nichts(jetzt, speicher); }
}

// Eine Einheit ist geschafft (die Tür). e: { plan, datum, tag, alleSaetze, wochenZiel }, alleSaetze nur mit true, wochenZiel = Plantage pro Woche.
// Gibt { plus, levelAuf, wocheGeschafft, status } zurück. Die 50 Punkte sind fest: Wer weniger oder angepasste Übungen hat, bekommt genauso viel.
export function einheitGeschafft(e, jetzt = Date.now(), speicher) {
  const mehr = { wocheGeschafft: false };
  try {
    const sp = speicherWahl(speicher), zeit = zeitVon(jetzt), gelesen = lesen(sp), alt = gelesen || leererStand(), key = schluessel(e, zeit, false);
    if (gelesen === undefined || key === null || alt.einheitenListe.includes(key)) return antwort(0, null, alt, zeit, mehr);
    const s = kopie(alt), vorher = levelFuer(s.punkte), ziel = wochenZielVon(e.wochenZiel);
    merke(s.einheitenListe, key, GRENZEN.einheitenListe);
    s.einheiten = Math.min(GRENZEN.einheiten, s.einheiten + 1);
    if (s.woche !== zeit.woche) { s.woche = zeit.woche; s.wocheEinheiten = 0; s.wocheBonus = false; }   // Montag beginnt eine neue Woche bei null
    s.wocheEinheiten = Math.min(GRENZEN.wocheEinheiten, s.wocheEinheiten + 1);
    if (ziel) s.wochenZiel = ziel;
    let plus = tagesPlus(s, PUNKTE.einheit + (e.alleSaetze === true ? PUNKTE.alleSaetze : 0), zeit.tag), wocheGeschafft = false;
    if (!s.wocheBonus && s.wocheEinheiten >= s.wochenZiel) {   // höchstens einmal je Woche
      s.wocheBonus = true; wocheGeschafft = true; plus += PUNKTE.wochenZiel;
      // Serie in Wochen: die Woche davor geschafft = weiter, sonst beginnt sie still bei 1 (nichts wird abgezogen)
      if (s.serieWoche !== zeit.woche) s.serie = Math.min(GRENZEN.serie, s.serie > 0 && s.serieWoche === zeit.woche - 1 ? s.serie + 1 : 1);
      s.serieWoche = zeit.woche;
    }
    s.punkte = Math.min(GRENZEN.punkte, s.punkte + plus);
    if (!schreiben(sp, s)) return antwort(0, null, alt, zeit, mehr);
    return antwort(s.punkte - alt.punkte, aufstieg(vorher, s.punkte), s, zeit, { wocheGeschafft });
  } catch (err) { return nichts(jetzt, speicher, mehr); }
}

// Ein kurzer, freundlicher Satz für nach der Einheit (leer, wenn es nichts zu sagen gibt). Steht hier, damit die Wörter an einer Stelle liegen und prüfbar sind.
export function einheitText(r) {
  if (!r || typeof r !== 'object') return '';
  const teile = [];
  if (r.plus > 0) teile.push('+' + r.plus + ' Punkte');
  if (r.wocheGeschafft) teile.push('Wochenziel geschafft');
  if (r.levelAuf && r.levelAuf.titel) teile.push('Neuer Rang: ' + r.levelAuf.titel);
  return teile.length ? 'Stark gemacht! ' + teile.join(' · ') : '';
}
