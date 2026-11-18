// DK Coach — Dein Fortschritt: Statistik aus den eigenen Trainings (17.11.2026).
// Auftrag: Kunden sehen jeden Tag, wie sie sich steigern, nach Tag, Woche, Monat und Jahr: Volumen, Trainings, Bestwerte je Übung
// und die Veränderung zum Zeitraum davor (Pfeil und Prozent). Nur Anzeige: Die Regel-Maschine (app/engine.js) bleibt unberührt.
// Nur Rechnen und ein Speicherschlüssel. Kein DOM, kein Netz, kein Zufall: Darum lässt sich alles mit Node prüfen (app/test.js, Abschnitt 27).
// Woher die Zahlen kommen: app.js legt jedes beendete Training in den Verlauf (dk_verlauf, nur die letzten 40). Damit auch Monat und Jahr stimmen,
// merkt sich dieses Modul die Sätze zusätzlich knapp unter dk_statistik (Start, Ende, je Übung Name und Sätze mit kg und Wdh; rund zwei Jahre).
// Gezählt wird nur, was der Kunde im Training eingetragen hat. Volumen = kg × Wdh über alle Sätze mit Gewicht. Übungen auf Zeit zählen als Sätze und Sekunden.
// Schutzregeln: nur das eigene Training, kein Vergleich mit anderen, keine Punkte, kein geschätztes Maximalgewicht, nichts vom Körper.
// Weniger als im Zeitraum davor ist kein Fehler (Entlastung, Pause): Die Seite zeigt das neutral. Alles bleibt auf diesem Handy.

export const VERSION = 1;
export const SCHLUESSEL = 'dk_statistik';
export const ANSICHTEN = Object.freeze(['tag', 'woche', 'monat', 'jahr']);
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
    summe: leereSumme(), vorher: null, aenderung: null, uebungen: [], neueBestwerte: 0, balken: [], balkenWas: 'volumen', frueher: false, spaeter: false };
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
  // Säulen: Woche je Tag, Monat je Tag, Jahr je Monat (Tag: keine). Hat niemand Gewicht eingetragen, zeigen sie die Sätze.
  if (ansicht !== 'tag') {
    const faecher = [];
    if (ansicht === 'woche') for (let i = 0; i < 7; i++) faecher.push([plusTage(von, i), plusTage(von, i + 1), TAG_KURZ[i], TAG_LANG[i], true]);
    else if (ansicht === 'monat') { const m = new Date(von).getMonth(); for (let i = 0, n = tageZwischen(von, bis); i < n; i++) faecher.push([plusTage(von, i), plusTage(von, i + 1), String(i + 1), (i + 1) + '. ' + MONAT[m], i % 7 === 0]); }
    else { const y = new Date(von).getFullYear(); for (let m = 0; m < 12; m++) faecher.push([new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime(), MONAT_ZEICHEN[m], MONAT[m], true]); }
    aus.balken = faecher.map(([a, b, label, name, zeigen]) => {
      const s = summe(liste, a, b);
      return { label, name, zeigen, volumen: s.volumen, saetze: s.saetze, trainings: s.trainings, heute: a <= jetzt && jetzt < b, spaeter: a > jetzt };
    });
    aus.balkenWas = aus.balken.some((x) => x.volumen > 0) ? 'volumen' : 'saetze';
  }
  return aus;
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
// undefined = nicht lesbar oder von einer neueren App-Fassung (dann bleibt alles, wie es ist), sonst die geprüfte Liste (Kaputtes zählt nicht)
function lesen(sp) {
  let roh;
  try { roh = sp.lies(SCHLUESSEL); } catch (e) { return undefined; }
  if (roh == null || roh === '') return [];
  try {
    if (typeof roh !== 'string' || roh.length > GRENZEN.text) return [];
    const o = JSON.parse(roh);
    if (!istObjekt(o) || !Array.isArray(o.t) || !Number.isInteger(o.v)) return [];
    if (o.v > VERSION) return undefined;
    return o.v === VERSION ? ordnen(o.t.map(eintragSauber).filter(Boolean)) : [];
  } catch (e) { return []; }
}
// Nur die letzten 800 Tage und 1200 Trainings; passt es trotzdem nicht, gehen die ältesten zuerst
function kuerzen(liste, jetzt) {
  const grenze = plusTage(tagAnfang(jetzt), -GRENZEN.tage);
  let l = liste.filter((x) => x.s >= grenze);
  if (l.length > GRENZEN.trainings) l = l.slice(l.length - GRENZEN.trainings);
  let text = JSON.stringify({ v: VERSION, t: l });
  while (text.length > GRENZEN.text && l.length) { l = l.slice(Math.max(1, Math.ceil(l.length / 20))); text = JSON.stringify({ v: VERSION, t: l }); }
  return { liste: l, text };
}
// Trainings dazunehmen (Verlauf-Einträge aus app.js oder eigene Form). Schreibt nur, wenn sich etwas ändert.
// opt: { speicher, jetzt }. Antwort { ok, neu } (neu = so viele Trainings kamen dazu). Wirft nie.
export function aufnehmen(liste, opt) {
  try {
    const o = istObjekt(opt) ? opt : {};
    const sp = wahl(o.speicher), jetzt = zeitOk(o.jetzt) ? o.jetzt : Date.now();
    const alt = lesen(sp);
    if (alt === undefined) return { ok: false, neu: 0 };
    const vorher = new Map(alt.map((x) => [x.s, JSON.stringify(x)]));
    const dazu = (Array.isArray(liste) ? liste : []).map(eintragSauber).filter(Boolean);
    const { liste: l, text } = kuerzen(ordnen(alt.concat(dazu)), jetzt);
    if (l.length === alt.length && l.every((x) => vorher.get(x.s) === JSON.stringify(x))) return { ok: true, neu: 0 };
    const neu = l.filter((x) => !vorher.has(x.s)).length;
    return sp.schreibe(SCHLUESSEL, text) !== false ? { ok: true, neu } : { ok: false, neu: 0 };
  } catch (e) { return { ok: false, neu: 0 }; }
}
// Alle gemerkten Trainings, geprüft und nach Zeit sortiert. Wirft nie.
export function trainings(speicher) {
  try { return lesen(wahl(speicher)) || []; } catch (e) { return []; }
}
