// DK Coach — Dein Fortschritt: Statistik aus den eigenen Trainings (17.11.2026).
// Auftrag: Kunden sehen jeden Tag, wie sie sich steigern, nach Tag, Woche, Monat und Jahr: Volumen, Trainings, Bestwerte je Übung
// und die Veränderung zum Zeitraum davor (Pfeil und Prozent). Nur Anzeige: Die Regel-Maschine (app/engine.js) bleibt unberührt.
// Nur Rechnen und ein Speicherschlüssel. Kein DOM, kein Netz, kein Zufall: Darum lässt sich alles mit Node prüfen (app/test.js, Abschnitt 27).
// Woher die Zahlen kommen: app.js legt jedes beendete Training in den Verlauf (dk_verlauf, nur die letzten 40). Damit auch Monat und Jahr stimmen,
// merkt sich dieses Modul die Sätze zusätzlich knapp unter dk_statistik (Start, Ende, je Übung Name und Sätze mit kg und Wdh; rund zwei Jahre).
// Gezählt wird nur, was der Kunde im Training eingetragen hat. Volumen = kg × Wdh über alle Sätze mit Gewicht. Übungen auf Zeit zählen als Sätze und Sekunden.
// Schutzregeln: nur das eigene Training, kein Vergleich mit anderen, keine Punkte, kein geschätztes Maximalgewicht, nichts vom Körper.
// Weniger als im Zeitraum davor ist kein Fehler (Entlastung, Pause): Die Seite zeigt das neutral. Alles bleibt auf diesem Handy.
// Seit 21.11.2026 (Devin: „Statistik unten in der Leiste … digitaler Graph mit Lichtern … wie lange die schon trainiert haben … bei mir auf der Trainer-Seite auch“):
// Ansicht „gesamt“ (seit dem ersten Training), seit() (wie lange schon), uebungVerlauf() (bester Satz je Übung über die Zeit) und archiv() (dieselbe knappe
// Form als reine Funktion, damit die Trainer-Seite die Trainings eines Kunden länger behält als die 80 im Block Trainings). Der Speicher merkt sich dazu
// den Tag des allerersten Trainings (b), der beim Kürzen nach 800 Tagen nicht verloren geht.

export const VERSION = 1;
export const SCHLUESSEL = 'dk_statistik';
export const ANSICHTEN = Object.freeze(['tag', 'woche', 'monat', 'jahr', 'gesamt']);
// Technische Grenzen: 1200 Trainings sind bei vier pro Woche fast sechs Jahre, dazu höchstens 800 Tage zurück (Jahr und Jahr davor), höchstens 600 000 Zeichen.
export const GRENZEN = Object.freeze({ trainings: 1200, tage: 800, uebungen: 30, saetze: 40, name: 80, kg: 1000, wdh: 3600, dauer: 6 * 3600, text: 600000, versatz: 600 });

/* ---------- Prüfen: aus einem Verlauf-Eintrag (app.js) oder der eigenen Form wird ein sauberer Eintrag ---------- */
const istObjekt = (o) => {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;   // nur schlichte Objekte, wie JSON sie macht
};
const zeitOk = (x) => typeof x === 'number' && Number.isFinite(x) && x > 1.5e12 && x < 4.1e12;   // 2017 bis 2099
// Zahl aus dem Training (auch „62,5“ als Text) oder null, wenn nichts oder Unsinn eingetragen ist
function wert(x, max) {
  if (typeof x === 'string') x = x.trim() === '' ? null : Number(x.replace(',', '.'));
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max ? Math.round(x * 100) / 100 : null;
}
function nameSauber(n) {
  if (typeof n !== 'string') return '';
  const t = n.replace(/\s+/g, ' ').trim();
  return t.length <= GRENZEN.name ? t : t.slice(0, GRENZEN.name).trim();
}
// { s: Start, e: Ende, n: Name des Trainingstags (wenn bekannt), u: [[Name, 1 = auf Zeit, [[kg, Wdh], …]], …] }
// oder null (kein Training: keine Zeit, keine Übung, kein Satz)
export function eintragSauber(r) {
  if (!istObjekt(r) || !zeitOk(r.s) || !Array.isArray(r.u)) return null;
  const e = zeitOk(r.e) && r.e >= r.s && r.e - r.s <= GRENZEN.dauer * 1000 ? r.e : r.s;
  const tn = nameSauber(typeof r.n === 'string' ? r.n : r.tn);   // eigene Form: n, Verlauf aus app.js: tn („Ganzkörper A“)
  const u = [];
  for (const x of r.u.slice(0, GRENZEN.uebungen)) {
    let name, sek, saetze;
    if (Array.isArray(x)) { name = x[0]; sek = x[1]; saetze = x[2]; }   // eigene Form
    else if (istObjekt(x)) { name = x.n; sek = x.sek; saetze = x.z; }   // Verlauf aus app.js: { n, sek, z: [[kg, Wdh, Satz-Sekunden, Pause], …] }
    else continue;
    name = nameSauber(name);
    if (!name || !Array.isArray(saetze)) continue;
    const z = [];
    for (const s of saetze.slice(0, GRENZEN.saetze)) if (Array.isArray(s)) z.push([wert(s[0], GRENZEN.kg), wert(s[1], GRENZEN.wdh)]);
    if (z.length) u.push([name, sek === 1 || sek === true ? 1 : 0, z]);
  }
  if (!u.length) return null;
  return tn ? { s: r.s, e, n: tn, u } : { s: r.s, e, u };
}
// Gleiche Startzeit = dasselbe Training (das spätere in der Liste gilt), danach nach der Zeit sortiert
function ordnen(liste) {
  const m = new Map();
  for (const x of liste) m.set(x.s, x);
  return [...m.values()].sort((a, b) => a.s - b.s);
}

/* ---------- Tage, Wochen, Monate (Ortszeit; die Woche geht von Montag bis Sonntag) ---------- */
const TAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TAG_LANG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONAT_KURZ = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const MONAT_ZEICHEN = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const wochentag = (ms) => (new Date(ms).getDay() + 6) % 7;   // 0 = Montag
const tagAnfang = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const plusTage = (ms, n) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };   // auch über die Zeitumstellung richtig
const tageZwischen = (a, b) => Math.round((tagAnfang(b) - tagAnfang(a)) / 864e5);
const datumKurz = (ms) => { const d = new Date(ms); return d.getDate() + '.' + (d.getMonth() + 1) + '.'; };
const tagText = (ms) => TAG_KURZ[wochentag(ms)] + ', ' + datumKurz(ms);
const tagLang = (ms) => { const d = new Date(ms); return TAG_LANG[wochentag(ms)] + ', ' + d.getDate() + '. ' + MONAT[d.getMonth()] + ' ' + d.getFullYear(); };
export function kalenderwoche(ms) {
  const d = new Date(ms), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - (t.getUTCDay() + 6) % 7);   // Donnerstag dieser Woche bestimmt das Jahr
  const vierter = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - vierter) / 864e5 - 3 + (vierter.getUTCDay() + 6) % 7) / 7);
}
// „17.–23. Nov. 2026“, „27. Okt. – 2. Nov. 2026“
function spanne(von, bis) {
  const a = new Date(von), b = new Date(plusTage(bis, -1));
  if (a.getFullYear() !== b.getFullYear()) return a.getDate() + '. ' + MONAT_KURZ[a.getMonth()] + ' ' + a.getFullYear() + ' – ' + b.getDate() + '. ' + MONAT_KURZ[b.getMonth()] + ' ' + b.getFullYear();
  if (a.getMonth() !== b.getMonth()) return a.getDate() + '. ' + MONAT_KURZ[a.getMonth()] + ' – ' + b.getDate() + '. ' + MONAT_KURZ[b.getMonth()] + ' ' + b.getFullYear();
  return a.getDate() + '.–' + b.getDate() + '. ' + MONAT_KURZ[a.getMonth()] + ' ' + b.getFullYear();
}
const datumMittel = (ms) => { const d = new Date(ms); return d.getDate() + '. ' + MONAT_KURZ[d.getMonth()] + ' ' + d.getFullYear(); };   // „3. Nov. 2026“
// Wie lange schon, in der passenden Einheit: bis 30 Tage in Tagen, bis 13 Wochen in Wochen, bis 2 Jahre in Monaten, danach in Jahren
export function dauerSeit(tage) {
  const t = Number.isInteger(tage) && tage > 0 ? tage : 0;
  if (t <= 30) return { zahl: t, einheit: t === 1 ? 'Tag' : 'Tage' };
  if (t <= 91) { const w = Math.floor(t / 7); return { zahl: w, einheit: w === 1 ? 'Woche' : 'Wochen' }; }
  if (t < 730) { const m = Math.floor(t / 30.44); return { zahl: m, einheit: m === 1 ? 'Monat' : 'Monate' }; }
  const j = Math.floor(t / 365.25 * 10) / 10;
  return { zahl: j, einheit: 'Jahre' };
}

/* ---------- Rechnen ---------- */
const leereSumme = () => ({ trainings: 0, tage: 0, saetze: 0, wdh: 0, volumen: 0, sekunden: 0, halten: 0, ohneWerte: 0 });
const SUMMEN = ['trainings', 'tage', 'saetze', 'wdh', 'volumen', 'sekunden', 'halten'];
// Alle Trainings mit Start in [von, bis)
function summe(liste, von, bis) {
  const s = leereSumme(), tage = new Set();
  let wdh = 0, vol = 0, halten = 0;
  for (const t of liste) {
    if (t.s < von || t.s >= bis) continue;
    s.trainings++; tage.add(tagAnfang(t.s)); s.sekunden += Math.round((t.e - t.s) / 1000);
    for (const [, sek, z] of t.u) for (const [kg, w] of z) {
      s.saetze++;
      if (w == null) s.ohneWerte++;
      if (sek) halten += w || 0;
      else { wdh += w || 0; if (kg > 0 && w > 0) vol += kg * w; }
    }
  }
  s.tage = tage.size; s.wdh = Math.round(wdh); s.volumen = Math.round(vol); s.halten = Math.round(halten);
  return s;
}
// Veränderung zum Zeitraum davor. prozent = null, wenn davor nichts war (dann heißt es „neu“ oder es gab beide Male nichts)
export function aenderung(jetzt, vorher) {
  const a = Number.isFinite(jetzt) ? jetzt : 0, b = Number.isFinite(vorher) ? vorher : 0;
  return { wert: a, vorher: b, diff: a - b, prozent: b > 0 ? Math.round((a - b) / b * 100) : null, richtung: a > b ? 'hoch' : a < b ? 'runter' : 'gleich', neu: b === 0 && a > 0 };
}
// Besserer Satz: mehr Gewicht, bei gleichem Gewicht mehr Wiederholungen (wie bestleistung.js). Ohne Gewicht zählen die Wiederholungen, auf Zeit die Sekunden.
export function besser(a, b, sek) {
  if (!a) return false;
  if (!b) return true;
  const ka = a.kg > 0 ? a.kg : 0, kb = b.kg > 0 ? b.kg : 0, wa = a.w > 0 ? a.w : 0, wb = b.w > 0 ? b.w : 0;
  return sek ? wa > wb || (wa === wb && ka > kb) : ka > kb || (ka === kb && wa > wb);
}
const zaehlt = (kg, w) => kg > 0 || w > 0;   // ein Satz ohne Eintrag kann kein Bestwert sein
function besterIn(t, name, sek) {
  let b = null;
  for (const [n, , z] of t.u) if (n === name) for (const [kg, w] of z) if (zaehlt(kg, w) && besser({ kg, w }, b, sek)) b = { kg, w };
  return b;
}
const hat = (t, name) => t.u.some((x) => x[0] === name);
// Je Übung im Zeitraum: Sätze, Wdh, Volumen, Sekunden, wie oft, bester Satz
function uebungenIn(liste, von, bis) {
  const m = new Map();
  for (const t of liste) {
    if (t.s < von || t.s >= bis) continue;
    const schon = new Set();
    for (const [name, sek, z] of t.u) {
      let x = m.get(name);
      if (!x) { x = { name, sek: !!sek, saetze: 0, wdh: 0, volumen: 0, halten: 0, mal: 0, bester: null }; m.set(name, x); }
      if (!schon.has(name)) { x.mal++; schon.add(name); }
      for (const [kg, w] of z) {
        x.saetze++;
        if (x.sek) x.halten += w || 0;
        else { x.wdh += w || 0; if (kg > 0 && w > 0) x.volumen += kg * w; }
        if (zaehlt(kg, w) && besser({ kg, w }, x.bester, x.sek)) x.bester = { kg, w };
      }
    }
  }
  for (const x of m.values()) { x.wdh = Math.round(x.wdh); x.volumen = Math.round(x.volumen); x.halten = Math.round(x.halten); }
  return m;
}

/* ---------- Die Statistik für die Seite ---------- */
// eingabe: Trainings (eigene Form oder Verlauf-Einträge), opt: { ansicht: 'tag' | 'woche' | 'monat' | 'jahr', versatz: 0 = jetzt, -1 = davor …, jetzt: ms }
// Woche, Monat und Jahr sind Kalender-Zeiträume. Läuft der Zeitraum noch, zählt davor nur die gleiche Zahl an Tagen (Mo–Mi zu Mo–Mi), damit der Vergleich fair ist.
// Tag = ein Tag mit Training (versatz 0 = der letzte), verglichen mit dem Trainingstag davor; je Übung zählt dort das letzte Mal.
// Reine Funktion: liest keinen Speicher, ändert die Eingabe nicht, gleiche Eingabe gibt gleiches Ergebnis.
export function berechne(eingabe, opt) {
  const o = istObjekt(opt) ? opt : {};
  const jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now();
  const ansicht = ANSICHTEN.indexOf(o.ansicht) >= 0 ? o.ansicht : 'woche';
  let versatz = Number.isInteger(o.versatz) ? Math.max(-GRENZEN.versatz, Math.min(0, o.versatz)) : 0;
  const heute = tagAnfang(jetzt), morgen = plusTage(heute, 1);
  const liste = ordnen((Array.isArray(eingabe) ? eingabe : []).map(eintragSauber).filter(Boolean)).filter((t) => t.s < morgen);
  const aus = { ansicht, versatz, leer: !liste.length, titel: '', unter: '', laeuft: false, von: 0, bis: 0, vergleich: '', uebungenVergleich: '',
    summe: leereSumme(), vorher: null, aenderung: null, uebungen: [], neueBestwerte: 0, verbessert: 0, balken: [], balkenWas: 'volumen', balkenJe: 'Tag', frueher: false, spaeter: false };
  let von, bis, vorVon = null, vorBis = null;
  if (ansicht === 'tag') {
    const tage = [...new Set(liste.map((t) => tagAnfang(t.s)))].sort((a, b) => b - a);
    if (!tage.length) { aus.versatz = 0; aus.titel = 'Heute'; aus.unter = tagLang(heute); aus.von = heute; aus.bis = morgen; return aus; }
    const i = Math.min(-versatz, tage.length - 1);
    aus.versatz = versatz = -i;
    von = tage[i]; bis = plusTage(von, 1);
    // Verglichen wird mit dem letzten Mal desselben Trainingstags („Ganzkörper A“), sonst mit dem Trainingstag davor: Beintag gegen Armtag sagt wenig
    const namen = new Set(liste.filter((t) => t.s >= von && t.s < bis && t.n).map((t) => t.n));
    const gleich = namen.size ? liste.filter((t) => t.s < von && namen.has(t.n)).pop() : null;
    if (gleich) { vorVon = tagAnfang(gleich.s); vorBis = plusTage(vorVon, 1); }
    else if (i + 1 < tage.length) { vorVon = tage[i + 1]; vorBis = plusTage(vorVon, 1); }
    aus.titel = von === heute ? 'Heute' : von === plusTage(heute, -1) ? 'Gestern' : TAG_LANG[wochentag(von)];
    aus.unter = tagLang(von);
    aus.vergleich = gleich ? 'im Vergleich zum letzten Mal „' + gleich.n + '“ (' + tagText(vorVon) + ')'
      : vorVon != null ? 'im Vergleich zum Trainingstag davor (' + tagText(vorVon) + ')' : '';
    aus.uebungenVergleich = 'im Vergleich zum letzten Mal';
    aus.frueher = i + 1 < tage.length; aus.spaeter = i > 0;
  } else if (ansicht === 'gesamt') {
    // Seit Beginn: vom Tag des ersten Trainings bis heute. Kein Zeitraum davor; je Übung zählt der Vergleich zum ersten Mal.
    aus.versatz = versatz = 0;
    von = liste.length ? tagAnfang(liste[0].s) : heute; bis = morgen;
    aus.laeuft = true;
    aus.titel = 'Seit Beginn';
    aus.unter = liste.length ? 'seit ' + datumMittel(von) : '';
    aus.uebungenVergleich = 'seit dem ersten Mal';
  } else {
    const d = new Date(jetzt), j = d.getFullYear(), mo = d.getMonth();
    if (ansicht === 'woche') { von = plusTage(plusTage(heute, -wochentag(heute)), 7 * versatz); bis = plusTage(von, 7); vorVon = plusTage(von, -7); }
    else if (ansicht === 'monat') { von = new Date(j, mo + versatz, 1).getTime(); bis = new Date(j, mo + versatz + 1, 1).getTime(); vorVon = new Date(j, mo + versatz - 1, 1).getTime(); }
    else { von = new Date(j + versatz, 0, 1).getTime(); bis = new Date(j + versatz + 1, 0, 1).getTime(); vorVon = new Date(j + versatz - 1, 0, 1).getTime(); }
    vorBis = von;
    aus.laeuft = von <= jetzt && jetzt < bis;
    let n = 0;   // > 0: davor zählen nur so viele Tage wie bisher um sind
    if (aus.laeuft) { const tg = tageZwischen(von, heute) + 1, b = plusTage(vorVon, tg); if (b < von) { vorBis = b; n = tg; } }
    const pv = new Date(vorVon), pj = new Date(von).getFullYear();
    if (ansicht === 'woche') {
      const kw = kalenderwoche(von);
      aus.titel = versatz === 0 ? 'Diese Woche' : versatz === -1 ? 'Letzte Woche' : 'KW ' + kw;
      aus.unter = (versatz >= -1 ? 'KW ' + kw + ' · ' : '') + spanne(von, bis);
      const davor = versatz === 0 ? 'letzter Woche' : 'der Woche davor';
      aus.vergleich = 'im Vergleich zu ' + (n ? (n === 1 ? 'Montag ' : 'Mo–' + TAG_KURZ[n - 1] + ' ') + davor : davor);
      aus.uebungenVergleich = 'im Vergleich zu ' + davor;
    } else if (ansicht === 'monat') {
      const name = MONAT[new Date(von).getMonth()] + ' ' + pj, vorName = MONAT[pv.getMonth()] + (pv.getFullYear() !== pj ? ' ' + pv.getFullYear() : '');
      aus.titel = versatz === 0 ? 'Dieser Monat' : versatz === -1 ? 'Letzter Monat' : name;
      aus.unter = versatz >= -1 ? name : spanne(von, bis);
      aus.vergleich = 'im Vergleich zum ' + (n ? (n === 1 ? '1. ' : '1.–' + n + '. ') : '') + vorName;
      aus.uebungenVergleich = 'im Vergleich zum ' + vorName;
    } else {
      aus.titel = versatz === 0 ? 'Dieses Jahr' : versatz === -1 ? 'Letztes Jahr' : String(pj);
      aus.unter = versatz >= -1 ? String(pj) : '';
      aus.vergleich = n ? 'im Vergleich zum 1.1.–' + datumKurz(plusTage(vorBis, -1)) + pv.getFullYear() : 'im Vergleich zu ' + pv.getFullYear();
      aus.uebungenVergleich = 'im Vergleich zu ' + pv.getFullYear();
    }
    aus.frueher = liste.length > 0 && liste[0].s < von;
    aus.spaeter = versatz < 0;
  }
  aus.von = von; aus.bis = bis;
  aus.summe = summe(liste, von, bis);
  if (vorVon != null) {
    aus.vorher = summe(liste, vorVon, vorBis);
    aus.aenderung = {};
    for (const k of SUMMEN) aus.aenderung[k] = aenderung(aus.summe[k], aus.vorher[k]);
  }
  // Je Übung: bester Satz im Zeitraum, verglichen mit dem ganzen Zeitraum davor (Tag: mit dem letzten Mal). Neuer Bestwert = besser als alles vorher.
  const davor = ansicht === 'tag' || vorVon == null ? null : uebungenIn(liste, vorVon, von);
  const frueher = liste.filter((t) => t.s < von);
  for (const x of uebungenIn(liste, von, bis).values()) {
    if (ansicht === 'gesamt') {   // Steigerung seit dem ersten Mal: bester Satz insgesamt gegen den besten Satz beim ersten Mal
      let erster = null;
      for (const t of liste) { if (t.s < von || t.s >= bis) continue; const b = besterIn(t, x.name, x.sek); if (b) { erster = b; break; } }
      x.vorher = x.mal > 1 ? erster : null;
      x.erstesMal = false; x.rekord = false;
      x.richtung = x.bester && x.vorher ? (besser(x.bester, x.vorher, x.sek) ? 'hoch' : besser(x.vorher, x.bester, x.sek) ? 'runter' : 'gleich') : null;
      x.diff = x.richtung ? diffText(x.bester, x.vorher, x.sek) : '';
      aus.uebungen.push(x);
      continue;
    }
    let alles = null, letztes = null, gab = false;
    for (let k = frueher.length - 1; k >= 0; k--) {
      const t = frueher[k];
      if (!hat(t, x.name)) continue;
      gab = true;
      const b = besterIn(t, x.name, x.sek);
      if (b && !letztes) letztes = b;
      if (besser(b, alles, x.sek)) alles = b;
    }
    const vorher = ansicht === 'tag' ? letztes : (davor && davor.has(x.name) ? davor.get(x.name).bester : null);
    x.vorher = vorher;
    x.erstesMal = !gab;
    x.rekord = !!x.bester && !!alles && besser(x.bester, alles, x.sek);
    x.richtung = x.bester && vorher ? (besser(x.bester, vorher, x.sek) ? 'hoch' : besser(vorher, x.bester, x.sek) ? 'runter' : 'gleich') : null;
    x.diff = x.richtung ? diffText(x.bester, vorher, x.sek) : '';
    aus.uebungen.push(x);
  }
  aus.uebungen.sort((a, b) => b.volumen - a.volumen || b.saetze - a.saetze || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  aus.neueBestwerte = aus.uebungen.filter((x) => x.rekord).length;
  aus.verbessert = aus.uebungen.filter((x) => x.richtung === 'hoch').length;
  // Verlauf für den Graphen: Woche je Tag, Monat je Tag, Jahr je Monat, Tag = die letzten 10 Trainingstage bis zu diesem,
  // Seit Beginn je Tag (bis 2 Wochen), je Woche (bis 16 Wochen), sonst je Monat. Hat niemand Gewicht eingetragen, zeigt er die Sätze.
  const faecher = [];
  if (ansicht === 'tag') {
    const tage = [...new Set(liste.filter((t) => t.s < bis).map((t) => tagAnfang(t.s)))].sort((a, b) => a - b).slice(-10);
    for (const a of tage) faecher.push([a, plusTage(a, 1), datumKurz(a), tagLang(a), true, a === von]);
    aus.balkenJe = 'Trainingstag';
  } else if (ansicht === 'woche') for (let i = 0; i < 7; i++) faecher.push([plusTage(von, i), plusTage(von, i + 1), TAG_KURZ[i], TAG_LANG[i], true]);
  else if (ansicht === 'monat') { const m = new Date(von).getMonth(); for (let i = 0, n = tageZwischen(von, bis); i < n; i++) faecher.push([plusTage(von, i), plusTage(von, i + 1), String(i + 1), (i + 1) + '. ' + MONAT[m], i % 7 === 0]); }
  else if (ansicht === 'jahr') { const y = new Date(von).getFullYear(); for (let m = 0; m < 12; m++) faecher.push([new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime(), MONAT_ZEICHEN[m], MONAT[m], true]); aus.balkenJe = 'Monat'; }
  else if (liste.length) {
    const tg = tageZwischen(von, heute) + 1;
    if (tg <= 14) for (let i = 0; i < tg; i++) { const a = plusTage(von, i); faecher.push([a, plusTage(a, 1), datumKurz(a), tagLang(a), true]); }
    else if (tg <= 16 * 7) {
      aus.balkenJe = 'Woche';
      for (let a = plusTage(von, -wochentag(von)); a < morgen; a = plusTage(a, 7)) faecher.push([a, plusTage(a, 7), 'KW ' + kalenderwoche(a), 'KW ' + kalenderwoche(a) + ' · ' + datumKurz(a) + '–' + datumKurz(plusTage(a, 6)), true]);
    } else {
      aus.balkenJe = 'Monat';
      const d = new Date(von), letzter = new Date(jetzt);
      let y = d.getFullYear(), m = d.getMonth();
      const n = (letzter.getFullYear() - y) * 12 + letzter.getMonth() - m + 1;
      if (n > 40) { m += n - 40; y += Math.floor(m / 12); m %= 12; }   // höchstens die letzten 40 Monate
      for (let i = 0; i < Math.min(n, 40); i++) {
        const a = new Date(y, m + i, 1), b = new Date(y, m + i + 1, 1);
        faecher.push([a.getTime(), b.getTime(), MONAT_KURZ[a.getMonth()], MONAT[a.getMonth()] + ' ' + a.getFullYear(), true]);
      }
    }
  }
  aus.balken = faecher.map(([a, b, label, name, zeigen, markiert]) => {
    const s = summe(liste, a, b);
    return { label, name, zeigen, volumen: s.volumen, saetze: s.saetze, trainings: s.trainings,
      heute: markiert === undefined ? a <= jetzt && jetzt < b : markiert, spaeter: a > jetzt };
  });
  aus.balkenWas = aus.balken.some((x) => x.volumen > 0) ? 'volumen' : 'saetze';
  return aus;
}

// Wie lange schon trainiert: vom ersten Training (oder dem gemerkten Tag des allerersten, opt.beginn) bis heute, dazu alles zusammengezählt.
// Reine Funktion. opt: { jetzt, beginn }
export function seit(eingabe, opt) {
  const o = istObjekt(opt) ? opt : {};
  const jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now(), heute = tagAnfang(jetzt), morgen = plusTage(heute, 1);
  const liste = ordnen((Array.isArray(eingabe) ? eingabe : []).map(eintragSauber).filter(Boolean)).filter((t) => t.s < morgen);
  const gemerkt = zeitOk(o.beginn) && o.beginn < morgen ? o.beginn : null;
  const erstes = liste.length ? liste[0].s : null;
  const beginn = erstes == null ? gemerkt : gemerkt != null && gemerkt < erstes ? gemerkt : erstes;
  const s = summe(liste, -Infinity, morgen);
  if (beginn == null) return { beginn: null, tage: 0, dauer: dauerSeit(0), datum: '', trainings: 0, trainingstage: 0, saetze: 0, wdh: 0, volumen: 0, sekunden: 0, halten: 0, letztes: null };
  const tage = tageZwischen(beginn, heute) + 1;
  return { beginn, tage, dauer: dauerSeit(tage), datum: datumMittel(beginn), trainings: s.trainings, trainingstage: s.tage, saetze: s.saetze, wdh: s.wdh,
    volumen: s.volumen, sekunden: s.sekunden, halten: s.halten, letztes: liste.length ? liste[liste.length - 1].s : null };
}

// Eine Übung über die Zeit: je Trainingstag der beste Satz (höchstens die letzten 60 Tage mit dieser Übung).
// wert = kg (wenn je Gewicht eingetragen war), sonst Wdh, bei Übungen auf Zeit Sekunden. Reine Funktion. opt: { jetzt }
export function uebungVerlauf(eingabe, name, opt) {
  const o = istObjekt(opt) ? opt : {};
  const jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now(), morgen = plusTage(tagAnfang(jetzt), 1);
  const liste = ordnen((Array.isArray(eingabe) ? eingabe : []).map(eintragSauber).filter(Boolean)).filter((t) => t.s < morgen);
  const n = nameSauber(name);
  const tage = new Map();
  let sek = false;
  for (const t of liste) {
    if (!hat(t, n)) continue;
    sek = !!t.u.find((x) => x[0] === n)[1];
    const b = besterIn(t, n, sek);
    if (!b) continue;
    const k = tagAnfang(t.s), alt = tage.get(k);
    if (!alt || besser(b, alt.bester, sek)) tage.set(k, { s: t.s, bester: b });
  }
  let punkte = [...tage.values()].sort((a, b) => a.s - b.s);
  const mitKg = !sek && punkte.some((p) => p.bester.kg > 0);
  const einheit = sek ? 's' : mitKg ? 'kg' : 'Wdh';
  punkte = punkte.slice(-60).map((p) => ({ s: p.s, label: datumKurz(p.s), name: tagLang(p.s), bester: p.bester,
    wert: sek ? p.bester.w || 0 : mitKg ? p.bester.kg || 0 : p.bester.w || 0, text: satzText(p.bester, sek) }));
  let bester = null;
  for (const p of punkte) if (besser(p.bester, bester ? bester.bester : null, sek)) bester = p;
  const erster = punkte[0] || null, letzter = punkte[punkte.length - 1] || null;
  const zwei = punkte.length > 1;
  const richtung = zwei ? (besser(bester.bester, erster.bester, sek) ? 'hoch' : 'gleich') : null;
  return { name: n, sek, einheit, punkte, mal: punkte.length, erster, letzter, bester,
    steigerung: zwei ? diffText(bester.bester, erster.bester, sek) : '', richtung,
    prozent: zwei && erster.wert > 0 ? Math.round((bester.wert - erster.wert) / erster.wert * 100) : null };
}

/* ---------- Texte (deutsch, mit Komma und Tausenderpunkt) ---------- */
export function zahlText(n) {
  const x = Math.round(Number.isFinite(n) ? n : 0);
  return (x < 0 ? '−' : '') + String(Math.abs(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
const komma = (x) => String(Math.round(Math.abs(x) * 100) / 100).replace('.', ',');
export function kgText(kg) { return !(kg > 0) ? '0 kg' : (Number.isInteger(kg) ? zahlText(kg) : komma(kg)) + ' kg'; }
export function satzText(b, sek) {
  if (!b) return '–';
  const kg = b.kg > 0 ? kgText(b.kg) : '', w = b.w > 0 ? komma(b.w) : '';
  if (sek) return w ? w + ' s' + (kg ? ' mit ' + kg : '') : kg || '–';
  if (kg && w) return kg + ' × ' + w;
  return kg || (w ? w + ' Wdh' : '–');
}
export function diffText(a, b, sek) {
  if (!a || !b) return '';
  const ka = a.kg > 0 ? a.kg : 0, kb = b.kg > 0 ? b.kg : 0, wa = a.w > 0 ? a.w : 0, wb = b.w > 0 ? b.w : 0;
  const mit = (x, einheit) => (x > 0 ? '+' : '−') + komma(x) + ' ' + einheit;
  if (sek) return wa !== wb ? mit(wa - wb, 's') : ka !== kb ? mit(ka - kb, 'kg') : 'gleich';
  if (ka !== kb) return mit(ka - kb, 'kg');
  return wa !== wb ? mit(wa - wb, 'Wdh') : 'gleich';
}
export function prozentText(a) {
  if (!a) return '';
  if (a.neu) return 'neu';
  if (a.prozent == null) return '±0';
  if (a.prozent === 0) return a.diff > 0 ? '+<1 %' : a.diff < 0 ? '−<1 %' : '±0 %';
  return (a.prozent > 0 ? '+' : '−') + Math.abs(a.prozent) + ' %';
}
export function dauerText(sek) {
  const m = Math.round((Number.isFinite(sek) ? sek : 0) / 60);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' h';
}
export const PFEIL = Object.freeze({ hoch: '↑', runter: '↓', gleich: '→' });

/* ---------- Speicher: ein Schlüssel, nur Text. Tests tauschen ihn aus (setzeSpeicher), sonst ist es der Speicher des Browsers. ---------- */
const istSpeicher = (s) => !!s && typeof s.lies === 'function' && typeof s.schreibe === 'function';
// Lesen wirft, wenn der Speicher gesperrt ist: Dann wird auch nichts geschrieben (lesen() gibt undefined)
const browserSpeicher = {
  lies() { return typeof localStorage === 'undefined' ? null : localStorage.getItem(SCHLUESSEL); },
  schreibe(k, text) { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(SCHLUESSEL, text); return true; } catch (e) { return false; } }
};
let eingesetzt = null;
export function setzeSpeicher(s) { eingesetzt = istSpeicher(s) ? s : null; }   // nur für Tests; null stellt den Browser-Speicher wieder ein
const wahl = (s) => (istSpeicher(s) ? s : eingesetzt || browserSpeicher);
// Gespeicherte Form: { v: 1, b: Start des allerersten Trainings (bleibt beim Kürzen), t: [Einträge] }.
// lesbar() gibt { liste, b } oder undefined (neuere Fassung: dann bleibt alles, wie es ist); Kaputtes zählt nicht.
function lesbar(o) {
  if (!istObjekt(o) || !Array.isArray(o.t) || !Number.isInteger(o.v)) return { liste: [], b: null };
  if (o.v > VERSION) return undefined;
  if (o.v !== VERSION) return { liste: [], b: null };
  return { liste: ordnen(o.t.map(eintragSauber).filter(Boolean)), b: zeitOk(o.b) ? o.b : null };
}
function lesen(sp) {
  let roh;
  try { roh = sp.lies(SCHLUESSEL); } catch (e) { return undefined; }
  if (roh == null || roh === '') return { liste: [], b: null };
  try {
    if (typeof roh !== 'string' || roh.length > GRENZEN.text) return { liste: [], b: null };
    return lesbar(JSON.parse(roh));
  } catch (e) { return { liste: [], b: null }; }
}
// Nur die letzten 800 Tage und 1200 Trainings (die Trainer-Seite kann weniger verlangen); passt es trotzdem nicht, gehen die ältesten zuerst
function kuerzen(liste, jetzt, g, b) {
  const grenze = plusTage(tagAnfang(jetzt), -g.tage);
  let l = liste.filter((x) => x.s >= grenze);
  if (l.length > g.trainings) l = l.slice(l.length - g.trainings);
  const form = (t) => (b != null ? { v: VERSION, b, t } : { v: VERSION, t });
  let text = JSON.stringify(form(l));
  while (text.length > g.text && l.length) { l = l.slice(Math.max(1, Math.ceil(l.length / 20))); text = JSON.stringify(form(l)); }
  return { liste: l, text, archiv: form(l) };
}
// Reine Funktion: alte Sammlung (gespeicherte Form oder nichts) + neue Trainings → neue Sammlung. Ändert nichts an der Eingabe.
// opt: { jetzt, trainings, text } (kleinere Grenzen, z. B. für die Trainer-Seite). Antwort { archiv, geaendert, neu }; bei einer neueren Fassung bleibt alt, wie es ist.
export function archiv(alt, dazu, opt) {
  const o = istObjekt(opt) ? opt : {};
  const jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now();
  const g = { tage: GRENZEN.tage,
    trainings: Number.isInteger(o.trainings) && o.trainings > 0 ? Math.min(o.trainings, GRENZEN.trainings) : GRENZEN.trainings,
    text: Number.isInteger(o.text) && o.text > 1000 ? Math.min(o.text, GRENZEN.text) : GRENZEN.text };
  const a = alt == null ? { liste: [], b: null } : lesbar(alt);
  if (a === undefined) return { archiv: alt, geaendert: false, neu: 0 };
  const neuListe = (Array.isArray(dazu) ? dazu : []).map(eintragSauber).filter(Boolean);
  const alles = ordnen(a.liste.concat(neuListe));
  const erstes = alles.length ? alles[0].s : null;
  const b = a.b != null && (erstes == null || a.b <= erstes) ? a.b : erstes;
  const { liste: l, text, archiv: aus } = kuerzen(alles, jetzt, g, b);
  const vorher = new Map(a.liste.map((x) => [x.s, JSON.stringify(x)]));
  const gleich = b === a.b && l.length === a.liste.length && l.every((x) => vorher.get(x.s) === JSON.stringify(x));
  return { archiv: gleich && istObjekt(alt) ? alt : aus, geaendert: !gleich, neu: l.filter((x) => !vorher.has(x.s)).length, text };
}
// Trainings dazunehmen (Verlauf-Einträge aus app.js oder eigene Form). Schreibt nur, wenn sich etwas ändert.
// opt: { speicher, jetzt }. Antwort { ok, neu } (neu = so viele Trainings kamen dazu). Wirft nie.
export function aufnehmen(liste, opt) {
  try {
    const o = istObjekt(opt) ? opt : {};
    const sp = wahl(o.speicher), jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now();
    const alt = lesen(sp);
    if (alt === undefined) return { ok: false, neu: 0 };
    const r = archiv({ v: VERSION, b: alt.b, t: alt.liste }, liste, { jetzt });
    if (!r.geaendert) return { ok: true, neu: 0 };
    return sp.schreibe(SCHLUESSEL, r.text) !== false ? { ok: true, neu: r.neu } : { ok: false, neu: 0 };
  } catch (e) { return { ok: false, neu: 0 }; }
}
// Alle gemerkten Trainings, geprüft und nach Zeit sortiert. Wirft nie.
export function trainings(speicher) {
  try { const a = lesen(wahl(speicher)); return a ? a.liste : []; } catch (e) { return []; }
}
// Start des allerersten Trainings (auch wenn es schon aus der Liste gekürzt ist), sonst null. Wirft nie.
export function beginn(speicher) {
  try { const a = lesen(wahl(speicher)); return a ? (a.b != null ? a.b : a.liste.length ? a.liste[0].s : null) : null; } catch (e) { return null; }
}
