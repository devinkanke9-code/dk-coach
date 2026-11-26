// DK Coach — Essen (26.11.2026). Devin: „Ernährungsplan, der wirklich funktioniert … direkt angezeigt … passt sich an … Kalorien-Tracking und allem Drum und Dran …
// wer keine Lust hat, bekommt eine grobe Diät.“ Fragekarte 26.11.: Stufe 1 (Tagesplan + Essen eintragen) und Stufe 3 (Teller und Ampel ohne Zählen),
// eigene Seite unter Mehr, unter 18 nur der Teller (Zählen nur mit Devins Freigabe im Plan, Feld e.zf).
// Die Ziele kommen aus dem Plan (Feld e, gerechnet von engine.js) und folgen dem Gewicht wie unter Status (status.js essenFuer, gewichtFuer).
// Alles bleibt auf diesem Handy (o.lies/o.schreib, Schlüssel dk_essen_<Plan-id>). Nur „Online suchen“ schickt den Suchbegriff an Open Food Facts.
// Regeln mit Quellen: wissen/daten/ernaehrung_app.json (kommt über build.js als essen-daten.js). Test: pruefe-essen.js.
import { essenFuer, gewichtFuer, verlaufSchluessel } from './status.js';
import { ESSEN } from './essen-daten.js';
import { leseBild, gtinOk } from './strichcode.js';   // Strichcode scannen (26.11.2026, Stufe 2a): eigener Leser, das Kamerabild bleibt auf dem Handy
import { leseRGBA as qrLesen, produktnummer } from './qrcode.js';   // QR-Code (26.11.2026, Devin: „QR auch einbauen“): Produktnummer aus GS1-QR-Codes, Links werden nie geöffnet

// Open Food Facts (26.11.2026 geprüft): Die alte Suche (world…/cgi/search.pl) antwortete mit 503. Die neue Suche liefert Namen, Code, Energie und Eiweiß,
// die genauen Nährwerte je 100 g holt die App erst beim Antippen über die Produkt-Adresse. Beide senden die Kopfzeile für fremde Seiten (CORS).
const OFF_SUCHE = 'https://search.openfoodfacts.org/search';
const OFF_PRODUKT = 'https://world.openfoodfacts.org/api/v2/product/';
const SVG_NS = 'http://www.w3.org/2000/svg';
const Z = ESSEN.zaehlen;
const TAG_MS = 86400000;
export const MAHLZEITEN = ['Frühstück', 'Mittag', 'Abend', 'Snacks'];
const HAKEN = (ESSEN.haken && ESSEN.haken.liste) || [];
const HAKEN_IDS = HAKEN.map((x) => x.id);
const schluessel = (p) => 'dk_essen_' + (p && p.id ? p.id : 'beispiel');
const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const alsZahl = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN);
const komma = (x, n) => x.toLocaleString('de-DE', { minimumFractionDigits: n || 0, maximumFractionDigits: n || 0 });
const r1 = (x) => Math.round(x * 10) / 10;
const kcalText = (x) => Math.round(x).toLocaleString('de-DE') + ' kcal';
const gText = (x) => komma(x < 10 && x % 1 ? r1(x) : Math.round(x), x < 10 && x % 1 ? 1 : 0) + ' g';
const liter = (ml) => komma(ml / 1000, ml % 1000 === 0 ? 0 : ml % 100 === 0 ? 1 : 2);
const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
export function isoTag(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
let VERSATZ = 0;   // 0 = heute, 1 = gestern … höchstens 6 Tage zurück

/* ---------- Wer darf zählen? ---------- */
// Unter 18 (Fragekarte 26.11.2026: „Teller-Regel, Zählen nur mit Freigabe“). Der Plan trägt kein Alter. Neue Pläne tragen ju = 1 (kompakt.js),
// ältere erkennt man sicher an der Eiweiß-Rechnung in engine.js: unter 15 gibt es keine Eiweißzahl je kg, von 15 bis 17 genau einen Wert unter 1 g/kg
// (rechner.json → jugendliche_15_18: 0,9 bzw. 0,8). Erwachsene haben immer einen Bereich (1,2–2 usw.) oder ab 65 genau 1,0.
export function istJung(e) { return !!e && (e.ju === 1 || !Array.isArray(e.ek) || (e.ek[0] === e.ek[1] && e.ek[0] < 1)); }
export function darfZaehlen(e) { return !!e && (!istJung(e) || e.zf === 1); }

/* ---------- Gespeicherter Stand: alles, was aus dem Speicher kommt, wird geprüft ---------- */
function lmSauber(x) {   // Lebensmittel je 100 g (Packungen in der EU tragen die Werte je 100 g oder 100 ml)
  if (!x || typeof x !== 'object') return null;
  const n = text(x.n, 70), k = alsZahl(x.k);
  if (!n || !(k >= 0 && k <= 900)) return null;
  const o = { n, k: Math.round(k) };
  for (const s of ['p', 'c', 'f']) { const v = alsZahl(x[s]); if (v >= 0 && v <= 100) o[s] = r1(v); }
  const pg = alsZahl(x.pg); if (pg > 0 && pg <= Z.gramm_max) { o.pg = Math.round(pg); const pn = text(x.pn, 40); if (pn) o.pn = pn; }
  if (x.q === 'off' || x.q === 'liste' || x.q === 'eigen' || x.q === 'gericht') o.q = x.q;
  if (typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x.id)) o.id = x.id;
  return o;
}
function eintragSauber(x) {
  if (!x || typeof x !== 'object') return null;
  const m = alsZahl(x.m), k = alsZahl(x.k), n = text(x.n, 70) || 'Eintrag';
  if (!(m >= 0 && m <= 3) || !(k >= 0 && k <= 10000)) return null;
  const o = { m: Math.round(m), n, k: Math.round(k) };
  if (x.s === 1) o.s = 1;   // geschätzt (Gericht ohne Packung)
  const g = alsZahl(x.g); if (g > 0 && g <= Z.gramm_max) o.g = Math.round(g);
  for (const s of ['p', 'c', 'f']) { const v = alsZahl(x[s]); if (v >= 0 && v <= 1000) o[s] = r1(v); }
  return o;
}
export function stand(roh) {
  const s = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  const tage = {}, t = s.tage && typeof s.tage === 'object' && !Array.isArray(s.tage) ? s.tage : {};
  for (const k of Object.keys(t).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().slice(-Z.tage_behalten)) {
    const d = t[k] && typeof t[k] === 'object' ? t[k] : {};
    tage[k] = { e: (Array.isArray(d.e) ? d.e : []).map(eintragSauber).filter(Boolean).slice(0, Z.eintraege_pro_tag_max),
      w: Math.max(0, Math.min(10000, Math.round(zahl(d.w) || 0))), hk: (Array.isArray(d.hk) ? d.hk : []).filter((x, i, a) => HAKEN_IDS.includes(x) && a.indexOf(x) === i) };
  }
  const liste = (v, max) => (Array.isArray(v) ? v : []).map(lmSauber).filter(Boolean).slice(0, max);
  return { v: 1, modus: s.modus === 'zaehlen' || s.modus === 'teller' ? s.modus : null, tage, eigene: liste(s.eigene, Z.eigene_max), zuletzt: liste(s.zuletzt, Z.zuletzt_max) };
}
export function summe(tag) {
  const s = { k: 0, p: 0, c: 0, f: 0 };
  for (const x of (tag && tag.e) || []) { s.k += x.k; s.p += x.p || 0; s.c += x.c || 0; s.f += x.f || 0; }
  return s;
}
export function fuerMenge(lm, g) {   // Werte für g Gramm, aus den Werten je 100 g
  const o = { n: lm.n, g: Math.round(g), k: Math.round(lm.k * g / 100) };
  for (const s of ['p', 'c', 'f']) if (typeof lm[s] === 'number') o[s] = r1(lm[s] * g / 100);
  return o;
}

/* ---------- Abnahme zu schnell? (rechner.json → grenzen: mehr als 1 % pro Woche über 2 Wochen) ---------- */
export function schnellAbnahme(verlauf, jetzt) {
  const v = (Array.isArray(verlauf) ? verlauf : []).filter((x) => Array.isArray(x) && zahl(x[0]) && zahl(x[1]) && x[1] >= 30 && x[1] <= 250).sort((a, b) => a[0] - b[0]);
  if (v.length < 2) return null;
  const neu = v[v.length - 1];
  if ((jetzt || Date.now()) - neu[0] > 14 * TAG_MS) return null;   // letzter Wert ist alt: dazu nichts sagen
  const alt = v.find((x) => neu[0] - x[0] <= 28 * TAG_MS && neu[0] - x[0] >= Z.abnahme_tage_min * TAG_MS);
  if (!alt) return null;
  const wochen = (neu[0] - alt[0]) / (7 * TAG_MS), proWoche = (alt[1] - neu[1]) / alt[1] * 100 / wochen;
  return proWoche > Z.abnahme_max_prozent_woche ? { proWoche, von: alt[1], bis: neu[1] } : null;
}

/* ---------- Online suchen (Open Food Facts) ---------- */
// Nur auf Tipp, nur der Suchbegriff geht raus: kein Name, kein Plan, kein Code. Open Food Facts ist frei und braucht keinen Schlüssel (Daten unter ODbL).
// Die Antwort ist fremder Text: nur Zahlen in sinnvollen Grenzen, Namen gekürzt, nie als HTML (die App setzt alles als textContent).
const codeOk = (c) => typeof c === 'string' && /^\d{6,14}$/.test(c);
const markeVon = (b) => text(String(Array.isArray(b) ? b[0] || '' : String(b || '').split(',')[0]).replace(/^[a-z]{2}:/, ''), 30);
export function offAdresse(begriff) {
  return OFF_SUCHE + '?q=' + encodeURIComponent(text(begriff, 60)) + '&page_size=20&langs=de&fields=code,product_name,product_name_de,brands,serving_quantity,nutriscore_data';
}
export function produktAdresse(code) {
  if (!codeOk(code)) throw new Error('Code');
  return OFF_PRODUKT + code + '?fields=code,product_name,product_name_de,brands,serving_quantity,nutriments';
}
// Treffer der Suche: Name, Code und eine Vorschau (Energie und Eiweiß je 100 g aus den Nutri-Score-Daten), mehr liefert die Suche nicht
export function offTreffer(daten) {
  const liste = daten && Array.isArray(daten.hits) ? daten.hits : [];
  const aus = [];
  for (const x of liste) {
    if (!x || typeof x !== 'object' || !codeOk(x.code)) continue;
    const name = text(x.product_name_de, 60) || text(x.product_name, 60), marke = markeVon(x.brands);
    if (!name) continue;
    const teile = x.nutriscore_data && x.nutriscore_data.components ? [].concat(x.nutriscore_data.components.positive || [], x.nutriscore_data.components.negative || []) : [];
    const wert = (id, einheit) => { const t = teile.find((y) => y && y.id === id && y.unit === einheit); return t ? alsZahl(t.value) : NaN; };
    const kj = wert('energy', 'kJ'), p = wert('proteins', 'g');
    const vorschau = lmSauber({ n: name, k: kj >= 0 ? kj / 4.184 : NaN, p });   // 1 kcal = 4,184 kJ
    aus.push({ code: x.code, n: name + (marke ? ' · ' + marke : ''), v: vorschau ? { k: vorschau.k, p: vorschau.p } : null });
    if (aus.length >= 15) break;
  }
  return aus;
}
// Ein Produkt: alle Werte je 100 g. Unplausibles (z. B. mehr als 100 g Nährstoffe je 100 g) fällt weg.
export function offProdukt(daten) {
  const x = daten && daten.product && typeof daten.product === 'object' ? daten.product : null;
  if (!x || !codeOk(x.code)) return null;
  const nu = x.nutriments && typeof x.nutriments === 'object' ? x.nutriments : {};
  let k = alsZahl(nu['energy-kcal_100g']);
  if (!(k >= 0)) { const kj = alsZahl(nu.energy_100g); if (kj >= 0) k = kj / 4.184; }
  const name = text(x.product_name_de, 60) || text(x.product_name, 60), marke = markeVon(x.brands);
  const lm = lmSauber({ n: (name || 'Produkt') + (marke ? ' · ' + marke : ''), k, p: nu.proteins_100g, c: nu.carbohydrates_100g, f: nu.fat_100g, pg: x.serving_quantity, q: 'off', id: 'off' + x.code });
  if (!lm || (lm.p || 0) + (lm.c || 0) + (lm.f || 0) > 105) return null;
  if (lm.pg) lm.pn = '1 Portion';
  return lm;
}
const holen = { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', mode: 'cors' };
async function offSuchen(begriff) {
  const r = await fetch(offAdresse(begriff), holen);
  if (!r.ok) throw new Error('Antwort ' + r.status);
  return offTreffer(await r.json());
}
async function offHolen(code) {
  const r = await fetch(produktAdresse(code), holen);
  if (r.status === 404) return null;   // Produkt unbekannt
  if (!r.ok) throw new Error('Antwort ' + r.status);
  return offProdukt(await r.json());
}
// Strichcode nachschlagen: UPC-A steht als 12 oder 13 Ziffern (mit führender 0) in der Datenbank, darum beide Schreibweisen
export function schreibweisen(code) {
  if (!gtinOk(code)) return [];
  if (code.length === 13 && code[0] === '0') return [code, code.slice(1)];
  if (code.length === 12) return [code, '0' + code];
  return [code];
}
async function codeHolen(code) {
  for (const c of schreibweisen(code)) { const lm = await offHolen(c); if (lm) return lm; }
  return null;
}

/* ---------- Suche in der Grundliste und in den eigenen Lebensmitteln (ohne Internet) ---------- */
const einfach = (s) => String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ');
export function sucheLokal(st, begriff) {
  const q = einfach(begriff).trim().split(/\s+/).filter(Boolean);
  const alle = st.eigene.concat((ESSEN.lebensmittel || []).map((x) => Object.assign({ q: 'liste' }, x)), (ESSEN.gerichte || []).map((x) => Object.assign({ q: 'gericht' }, x)));
  const passt = alle.filter((lm) => { const n = einfach(lm.n); return q.every((w) => n.indexOf(w) >= 0); });
  const gesehen = new Set();
  return passt.filter((lm) => { const k = einfach(lm.n); if (gesehen.has(k)) return false; gesehen.add(k); return true; }).slice(0, 30);
}

/* ---------- Kleine Bausteine ---------- */
function svg(tag, attrs, ...kinder) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  for (const c of kinder) if (c) el.append(c);
  return el;
}
function strichcodeBild() {   // kleines Strichcode-Zeichen für den Knopf (gezeichnet, kein HTML aus Text)
  const g = svg('svg', { viewBox: '0 0 30 20', class: 'es-scan-bild', 'aria-hidden': 'true' });
  let x = 2;
  [2, 1, 1, 2, 3, 1, 1, 1, 2, 2, 1, 3, 2, 1, 1, 1].forEach((w, i) => { if (i % 2 === 0) g.append(svg('rect', { x, y: 2, width: w, height: 16, rx: 0.3 })); x += w; });
  return g;
}
function balken(h, name, wert, ziel, bereich) {
  const max = bereich ? bereich[1] : ziel, anteil = max > 0 ? Math.min(1, wert / max) : 0;
  const zielText = bereich ? (bereich[0] === bereich[1] ? bereich[0] : bereich[0] + '–' + bereich[1]) + ' g' : Math.round(ziel) + ' g';
  const im = bereich ? wert >= bereich[0] : null;
  const zeile = h('div', { class: 'es-balken' + (im ? ' im-ziel' : '') },
    h('div', { class: 'es-balken-kopf' }, h('b', { text: name }), h('span', { text: gText(wert) + ' von ' + zielText })),
    h('div', { class: 'es-spur', role: 'img', 'aria-label': name + ': ' + gText(wert) + ' von ' + zielText }, h('i', { style: 'width:' + Math.round(anteil * 100) + '%' }),
      bereich && bereich[0] < bereich[1] ? h('em', { style: 'left:' + Math.round(bereich[0] / bereich[1] * 100) + '%', 'aria-hidden': 'true' }) : null));
  return zeile;
}
function ring(h, gegessen, ziel) {
  const r = 52, umfang = 2 * Math.PI * r, anteil = ziel > 0 ? Math.min(1, gegessen / ziel) : 0;
  const bild = svg('svg', { viewBox: '0 0 120 120', 'aria-hidden': 'true', class: 'es-ring-bild' },
    svg('circle', { cx: 60, cy: 60, r, class: 'es-ring-spur' }),
    anteil > 0 ? svg('circle', { cx: 60, cy: 60, r, class: 'es-ring-wert', 'stroke-dasharray': (umfang * anteil).toFixed(1) + ' ' + umfang.toFixed(1), transform: 'rotate(-90 60 60)' }) : null);   // bei 0 kein Punkt
  return h('div', { class: 'es-ring', role: 'img', 'aria-label': kcalText(gegessen) + ' von ' + kcalText(ziel) + ' gegessen' }, bild,
    h('div', { class: 'es-ring-mitte', 'aria-hidden': 'true' }, h('b', { text: Math.round(gegessen).toLocaleString('de-DE') }), h('span', { text: 'von ' + kcalText(ziel) })));
}
function tagName(versatz) {
  if (versatz === 0) return 'Heute';
  if (versatz === 1) return 'Gestern';
  const d = new Date(Date.now() - versatz * TAG_MS);
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ---------- Seite ---------- */
// o: { h, plan, lies, schreib, toast, neu, blatt, blattZu }
export function ansicht(o) {
  const { h } = o, p = o.plan, e = p && p.e;
  const st = stand(o.lies(schluessel(p), null));
  const speichern = () => { if (!o.schreib(schluessel(p), st)) o.toast('Konnte nicht speichern: Der Speicher auf diesem Handy ist voll.'); };
  const tagKey = isoTag(new Date(Date.now() - VERSATZ * TAG_MS));
  const tag = () => st.tage[tagKey] || (st.tage[tagKey] = { e: [], w: 0, hk: [] });
  const tagLesen = st.tage[tagKey] || { e: [], w: 0, hk: [] };
  const beispiel = p && p.id === 'beispiel';
  const teile = [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Essen' }))];
  if (beispiel) teile.push(h('p', { class: 'meldung klein', text: 'Beispiel mit erfundenen Zahlen. Mit deinem eigenen Plan stehen hier deine Werte.' }));

  // Ohne Zahlen im Plan: kein Zählen, kein Teller. Das passiert bei älteren Plänen und immer dann, wenn engine.js keine Zahlen gibt
  // (Essstörung, Schwangerschaft, Krankheit, sehr starkes Unter- oder Übergewicht, keine Ernährungstipps gewünscht). Dann redet Devin selbst mit dem Kunden.
  if (!e) {
    teile.push(h('section', { class: 'block es-ohne' }, h('h2', { text: 'Deine Ernährung' }),
      h('p', { text: 'In deinem Plan stehen keine Ernährungszahlen. Frag Devin danach. Mit seinem nächsten Link steht hier dein Tagesplan.' })));
    return teile;
  }
  const jung = istJung(e), darf = darfZaehlen(e);
  const modus = darf ? st.modus || (e.hd ? 'teller' : 'zaehlen') : 'teller';
  const gw = gewichtFuer(p, o.lies), ziel = essenFuer(e, gw.rechenKg);

  // Tag wählen: heute und 6 Tage zurück (zum Nachtragen)
  teile.push(h('div', { class: 'es-tag', role: 'group', 'aria-label': 'Tag wählen' },
    h('button', { class: 'knopf klein es-tag-pfeil', type: 'button', 'aria-label': 'Tag davor', disabled: VERSATZ >= 6 || null, onclick: () => { VERSATZ = Math.min(6, VERSATZ + 1); o.neu(); }, text: '‹' }),
    h('b', { class: 'es-tag-name', text: tagName(VERSATZ) }),
    h('button', { class: 'knopf klein es-tag-pfeil', type: 'button', 'aria-label': 'Tag danach', disabled: VERSATZ === 0 || null, onclick: () => { VERSATZ = Math.max(0, VERSATZ - 1); o.neu(); }, text: '›' })));

  const warn = schnellAbnahme(o.lies(verlaufSchluessel(p), null));
  if (warn) teile.push(h('section', { class: 'block es-warnung', role: 'note' }, h('h2', { text: 'Du nimmst gerade sehr schnell ab' }),
    h('p', { text: 'Von ' + komma(warn.von, 1) + ' auf ' + komma(warn.bis, 1) + ' kg, das sind etwa ' + komma(warn.proWoche, 1) + ' % pro Woche. Mehr als 1 % pro Woche ist zu schnell.' }),
    h('p', { text: 'Iss etwas mehr und sag Devin Bescheid, dann passt er deine Zahlen an.' })));

  if (darf) teile.push(h('div', { class: 'fs-wahl es-modus', role: 'group', 'aria-label': 'Wie willst du essen?' },
    [['zaehlen', 'Zählen'], ['teller', 'Ohne Zählen']].map(([id, name]) => h('button', { type: 'button', class: 'fs-wahl-knopf', 'aria-pressed': String(modus === id),
      onclick: () => { if (modus === id) return; st.modus = id; speichern(); o.neu(); }, text: name }))));
  else teile.push(h('p', { class: 'leise klein es-jung', text: 'Kalorien zählen schaltet Devin für dich frei. Bis dahin zeigt dir der Teller, was dir guttut. Du wächst noch, darum gibt es kein Minus.' }));

  if (modus === 'zaehlen') teile.push(...zaehlenTeile(o, { e, ziel, gw, st, tagLesen, tag, speichern, jung }));
  else teile.push(...tellerTeile(o, { e, jung, st, tagLesen, tag, speichern }));
  teile.push(trinkenKarte(o, { ziel, tagLesen, tag, speichern }));

  teile.push(h('section', { class: 'block es-info' }, h('h2', { text: 'Gut zu wissen' }),
    h('ul', null,
      modus === 'zaehlen' ? h('li', { text: 'Kalorien und Nährwerte sind immer Schätzungen. Packung, Datenbank und echtes Essen weichen oft voneinander ab.' }) : null,
      h('li', { text: 'Eine Orientierung für gesunde Menschen, kein Ernährungsplan vom Arzt. Bei Beschwerden oder Fragen zur Gesundheit: frag Devin.' }),
      h('li', { text: ESSEN.hilfe.essstoerung }),
      h('li', { text: 'Was du hier einträgst, bleibt nur auf diesem Handy.' }),
      modus === 'zaehlen' ? h('li', { text: 'Nährwerte der Grundliste: USDA FoodData Central und Schweizer Nährwertdatenbank (BLV). Online-Suche: Open Food Facts (Daten unter ODbL).' }) : null)));
  return teile;
}

/* ---------- Zählen ---------- */
function zaehlenTeile(o, c) {
  const { h } = o, { e, ziel, gw, tagLesen } = c, s = summe(tagLesen);
  const rest = ziel.kc - s.k;
  const satz = rest >= 0 ? 'Noch ' + kcalText(rest) + ' bis zu deinem Ziel.' : kcalText(-rest) + ' über deinem Ziel. Kein Problem: Morgen geht es normal weiter.';
  const zielSatz = { d: 'Etwas unter deinem Bedarf, damit du langsam Fett verlierst.', p: 'Etwas über deinem Bedarf, damit Muskeln wachsen können.', e: 'Ungefähr dein Bedarf an einem normalen Tag.' }[e.ar || 'e'];
  const karte = h('section', { class: 'block es-ziel' }, h('h2', { text: VERSATZ === 0 ? 'Dein Tag' : tagName(VERSATZ) }),
    h('div', { class: 'es-ziel-oben' }, ring(h, s.k, ziel.kc),
      h('div', { class: 'es-ziel-text' }, h('p', { class: 'es-rest', text: satz }), h('p', { class: 'leise klein', text: zielSatz + (c.jung ? ' Du wächst noch, darum kein Minus.' : '') }))),
    ziel.ew ? balken(h, 'Eiweiß', s.p, null, ziel.ew) : null,
    ziel.kh != null ? balken(h, 'Kohlenhydrate', s.c, ziel.kh) : null,
    ziel.ft != null ? balken(h, 'Fett', s.f, ziel.ft) : null,
    h('p', { class: 'leise klein', text: 'Gerechnet mit ' + komma(gw.rechenKg, gw.rechenKg % 1 ? 1 : 0) + ' kg' + (gw.zuWeit ? ' aus deiner Analyse: Dein neues Gewicht weicht zu stark ab, sag Devin Bescheid.' : '. Ändert sich dein Gewicht, trag es unter Status ein.') }));
  const mahlzeiten = h('section', { class: 'block es-mahlzeiten' }, h('h2', { text: 'Was du gegessen hast' }),
    MAHLZEITEN.map((name, m) => {
      const liste = tagLesen.e.map((x, i) => [x, i]).filter(([x]) => x.m === m), k = liste.reduce((a, [x]) => a + x.k, 0);
      return h('div', { class: 'es-mahlzeit' },
        h('div', { class: 'es-mahlzeit-kopf' }, h('b', { text: name }), h('span', { class: 'leise', text: liste.length ? kcalText(k) : '' }),
          h('button', { class: 'knopf klein es-plus', type: 'button', 'aria-label': name + ': Essen eintragen', onclick: () => eintragenBlatt(o, c, m), text: '+ Eintragen' })),
        liste.length ? h('ul', { class: 'es-liste' }, liste.map(([x, i]) => h('li', null,
          h('span', null, h('b', { text: x.n }), h('small', { text: [x.s ? 'geschätzt' : null, x.g ? x.g + ' g' : null, (x.s ? '≈ ' : '') + kcalText(x.k), typeof x.p === 'number' ? gText(x.p) + ' Eiweiß' : null].filter(Boolean).join(' · ') })),
          h('button', { class: 'es-weg', type: 'button', 'aria-label': x.n + ' entfernen', onclick: () => { c.tag().e.splice(i, 1); c.speichern(); o.toast('Entfernt'); o.neu(); }, text: '✕' })))) : null);
    }));
  return [karte, mahlzeiten];
}

/* ---------- Eintragen (Blatt von unten) ---------- */
function eintragenBlatt(o, c, mahlzeit) {
  const { h } = o, st = c.st;
  let m = mahlzeit;
  const inhalt = h('div', { class: 'es-blatt' });
  const mWahl = h('div', { class: 'fs-wahl es-mwahl', role: 'group', 'aria-label': 'Mahlzeit' });
  const mZeichnen = () => mWahl.replaceChildren(...MAHLZEITEN.map((n, i) => h('button', { type: 'button', class: 'fs-wahl-knopf', 'aria-pressed': String(i === m), onclick: () => { m = i; mZeichnen(); }, text: n })));
  mZeichnen();
  const zeige = (...kinder) => inhalt.replaceChildren(mWahl, ...kinder.flat().filter(Boolean));
  const fertig = (eintrag, lm) => {
    const t = c.tag();
    if (t.e.length >= Z.eintraege_pro_tag_max) { o.toast('Für diesen Tag sind es schon sehr viele Einträge.'); return; }
    t.e.push(Object.assign({}, eintrag, { m }, lm && lm.q === 'gericht' ? { s: 1 } : {}));   // die gewählte Mahlzeit gilt immer; Gericht = Schätzung
    if (lm) {
      const gleich = (x) => (lm.id && x.id === lm.id) || einfach(x.n) === einfach(lm.n);
      st.zuletzt = [lm].concat(st.zuletzt.filter((x) => !gleich(x))).slice(0, Z.zuletzt_max);
      if (lm.q === 'off' || lm.q === 'eigen') st.eigene = [lm].concat(st.eigene.filter((x) => !gleich(x))).slice(0, Z.eigene_max);   // geht danach auch ohne Internet
    }
    c.speichern(); o.blattZu(); o.toast('Eingetragen'); o.neu();
  };

  // Schritt 1: suchen
  const suche = (begriff) => {
    const feld = h('input', { class: 'eingabe', type: 'search', id: 'es-suche', autocomplete: 'off', enterkeyhint: 'search', placeholder: 'z. B. Haferflocken, Skyr, Banane', value: begriff || '', 'aria-label': 'Lebensmittel suchen' });
    const treffer = h('div', { class: 'es-treffer', 'aria-live': 'polite' });
    const online = h('div', { class: 'es-online' });
    const zeile = (lm) => h('button', { class: 'es-lm', type: 'button', onclick: () => menge(lm, feld.value) },
      h('b', { text: lm.n }), h('small', { text: kcalText(lm.k) + (typeof lm.p === 'number' ? ' · ' + gText(lm.p) + ' Eiweiß' : '') + ' je 100 g' + (lm.q === 'off' ? ' · Open Food Facts' : '') }));
    const neuSuchen = () => {
      const q = feld.value.trim();
      online.replaceChildren();
      if (!q) { treffer.replaceChildren(...(st.zuletzt.length ? [h('p', { class: 'leise klein', text: 'Zuletzt gegessen' }), ...st.zuletzt.map(zeile)] : [h('p', { class: 'leise klein', text: 'Tipp ein, was du gegessen hast.' })])); return; }
      const lokal = sucheLokal(st, q);
      treffer.replaceChildren(...(lokal.length ? lokal.map(zeile) : [h('p', { class: 'leise klein', text: 'In deiner Liste nichts gefunden.' })]));
      if (q.length >= 2) online.append(h('button', { class: 'knopf klein', type: 'button', onclick: () => onlineSuchen(q), text: 'Online suchen: „' + text(q, 30) + '“' }),
        h('p', { class: 'leise klein', text: 'Dabei geht nur dein Suchbegriff an Open Food Facts, eine freie Lebensmittel-Datenbank. Die Werte dort tragen Nutzer ein, sie können falsch sein.' }));
    };
    const onlineSuchen = (q) => {
      if (navigator.onLine === false) { online.replaceChildren(h('p', { class: 'meldung klein', text: 'Ohne Internet geht die Online-Suche nicht. Trag die Werte von der Packung ein.' })); return; }
      online.replaceChildren(h('p', { class: 'leise klein', role: 'status', text: 'Suche bei Open Food Facts …' }));
      offSuchen(q).then((liste) => {
        if (!inhalt.isConnected) return;
        online.replaceChildren(...(liste.length ? [h('p', { class: 'leise klein', text: 'Von Open Food Facts (Daten unter ODbL):' }), ...liste.map(offZeile)]
          : [h('p', { class: 'leise klein', text: 'Online nichts gefunden. Trag die Werte von der Packung ein.' })]));
      }, () => { if (inhalt.isConnected) online.replaceChildren(h('p', { class: 'meldung klein', text: 'Die Online-Suche hat gerade nicht geklappt. Versuch es gleich nochmal oder trag die Werte von der Packung ein.' })); });
    };
    // Treffer antippen: erst jetzt die genauen Werte holen. Klappt das nicht, reichen Kalorien und Eiweiß aus der Vorschau.
    const offZeile = (t) => {
      const b = h('button', { class: 'es-lm', type: 'button', onclick: () => {
        b.disabled = true; b.querySelector('small').textContent = 'Lade die Nährwerte …';
        offHolen(t.code).then((lm) => { if (!inhalt.isConnected) return; if (lm) menge(lm, feld.value); else throw new Error('leer'); })
          .catch(() => {
            if (!inhalt.isConnected) return;
            if (t.v) menge(lmSauber({ n: t.n, k: t.v.k, p: t.v.p, q: 'off', id: 'off' + t.code }), feld.value);
            else { b.disabled = false; b.querySelector('small').textContent = 'Keine Nährwerte gefunden. Nimm „Werte von der Packung“.'; }
          });
      } }, h('b', { text: t.n }), h('small', { text: t.v ? '≈ ' + kcalText(t.v.k) + (typeof t.v.p === 'number' ? ' · ' + gText(t.v.p) + ' Eiweiß' : '') + ' je 100 g · Open Food Facts' : 'Open Food Facts · antippen für die Werte' }));
      return b;
    };
    feld.addEventListener('input', neuSuchen);
    feld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const q = feld.value.trim(); if (q.length >= 2 && !sucheLokal(st, q).length) onlineSuchen(q); } });
    zeige(h('button', { class: 'knopf haupt es-scan-knopf', type: 'button', onclick: () => scanner() }, strichcodeBild(), h('span', null, h('b', { text: 'Packung scannen' }), h('small', { text: 'Strichcode oder QR-Code' }))),
      (ESSEN.gerichte || []).length ? h('button', { class: 'knopf es-gericht-knopf', type: 'button', onclick: () => gerichte('') }, h('span', null, h('b', { text: 'Gericht schätzen' }), h('small', { text: 'Ohne Packung, z. B. Döner, Pizza, Nudeln' }))) : null,
      feld, treffer, online,
      h('div', { class: 'es-wege' },
        h('button', { class: 'knopf klein', type: 'button', onclick: () => eigenes(feld.value), text: 'Werte von der Packung' }),
        h('button', { class: 'knopf klein', type: 'button', onclick: () => schnell(), text: 'Nur Kalorien' })));
    neuSuchen();
    setTimeout(() => { try { feld.focus({ preventScroll: true }); } catch (x) { /* nichts */ } }, 80);
  };

  // Schritt 2: wie viel?
  const menge = (lm, begriff) => {
    const feld = h('input', { class: 'eingabe', id: 'es-gramm', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: String(lm.pg || 100), 'aria-describedby': 'es-gramm-wert' });
    const wert = h('p', { class: 'es-mengenwert', id: 'es-gramm-wert', role: 'status' });
    const lesen = () => { const g = alsZahl(feld.value); return g > 0 && g <= Z.gramm_max ? g : null; };
    const zeigeWert = () => { const g = lesen(); if (!g) { wert.textContent = 'Bitte eine Menge in Gramm eintragen.'; return; } const x = fuerMenge(lm, g);
      wert.textContent = '= ' + [kcalText(x.k), typeof x.p === 'number' ? gText(x.p) + ' Eiweiß' : null, typeof x.c === 'number' ? gText(x.c) + ' KH' : null, typeof x.f === 'number' ? gText(x.f) + ' Fett' : null].filter(Boolean).join(' · '); };
    feld.addEventListener('input', zeigeWert);
    const setze = (g) => { feld.value = String(g); zeigeWert(); };
    const istGericht = lm.q === 'gericht' && lm.pg;
    const chips = istGericht ? [[Math.round(lm.pg * 0.7), 'klein (' + Math.round(lm.pg * 0.7) + ' g)'], [lm.pg, 'normal: ' + (lm.pn || '1 Portion') + ' (' + lm.pg + ' g)'], [Math.round(lm.pg * 1.4), 'groß (' + Math.round(lm.pg * 1.4) + ' g)']]
      : [lm.pg ? [lm.pg, (lm.pn || '1 Portion') + ' (' + lm.pg + ' g)'] : null, lm.pg ? [lm.pg * 2, '2 Portionen'] : null, [100, '100 g'], [50, '50 g']].filter(Boolean);
    const eintragen = () => { const g = lesen(); if (!g) { o.toast('Bitte eine Menge in Gramm eintragen.'); feld.focus(); return; } fertig(fuerMenge(lm, g), lm); };
    feld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') eintragen(); });
    zeige(istGericht ? h('p', { class: 'meldung klein', text: 'Schätzung: Rezept und Menge sind bei jedem Gericht anders. Die Werte sind ein Durchschnitt aus einer Lebensmittel-Datenbank.' }) : null,
      h('div', { class: 'es-gewaehlt' }, h('b', { text: lm.n }),
      h('small', { text: 'Je 100 g: ' + [kcalText(lm.k), typeof lm.p === 'number' ? gText(lm.p) + ' Eiweiß' : null, typeof lm.c === 'number' ? gText(lm.c) + ' KH' : null, typeof lm.f === 'number' ? gText(lm.f) + ' Fett' : null].filter(Boolean).join(' · ') })),
      h('div', { class: 'es-chips' }, chips.map(([g, n]) => h('button', { class: 'chip es-chip', type: 'button', onclick: () => setze(g), text: n }))),
      h('label', { class: 'lbl', for: 'es-gramm', text: 'Menge in Gramm (bei Getränken ml)' }), feld, wert,
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => suche(begriff), text: 'Zurück' }), h('button', { class: 'knopf haupt', type: 'button', onclick: eintragen, text: 'Eintragen' })));
    zeigeWert();
  };

  // Strichcode scannen (Stufe 2a): Kamera hinten, Rahmen in der Mitte, alle 120 ms ein Bild. Erst der eingebaute Leser des Handys (BarcodeDetector,
  // z. B. Android Chrome), sonst strichcode.js. Ein Code gilt erst, wenn er zweimal gelesen wurde. Nur die Ziffern gehen an Open Food Facts.
  const kamera = { stream: null, timer: 0, an: false };
  const beiVersteckt = () => { if (document.visibilityState === 'hidden') kameraAus(); };   // App im Hintergrund: Kamera aus
  const kameraAus = () => {
    kamera.an = false; clearTimeout(kamera.timer);
    document.removeEventListener('visibilitychange', beiVersteckt);
    if (kamera.stream) { kamera.stream.getTracks().forEach((t) => t.stop()); kamera.stream = null; }
  };
  const scanner = () => {
    kameraAus();
    const video = h('video', { class: 'es-video', playsinline: '', muted: '', autoplay: '', 'aria-hidden': 'true' });
    video.muted = true; video.playsInline = true;
    const status = h('p', { class: 'es-scan-status', role: 'status', text: 'Kamera startet …' });
    zeige(h('div', { class: 'es-scan' }, video, h('div', { class: 'es-scan-rahmen', 'aria-hidden': 'true' })), status,
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => { kameraAus(); suche(''); }, text: 'Zurück' }),
        h('button', { class: 'knopf', type: 'button', onclick: () => { kameraAus(); nummer(); }, text: 'Nummer eintippen' })),
      h('p', { class: 'leise klein', text: 'Das Kamerabild bleibt auf deinem Handy. Nur die Produktnummer geht an Open Food Facts. Links aus QR-Codes öffnet die App nie.' }));
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status.textContent = 'Hier geht die Kamera nicht. Tipp die Nummer unter dem Strichcode ein.'; return; }
    kamera.an = true;
    document.addEventListener('visibilitychange', beiVersteckt);
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }).then((stream) => {
      if (!kamera.an || !inhalt.isConnected) { stream.getTracks().forEach((t) => t.stop()); return; }
      kamera.stream = stream; video.srcObject = stream;
      const spur = stream.getVideoTracks()[0];
      try { const f = spur.getCapabilities ? spur.getCapabilities().focusMode : null; if (f && f.indexOf('continuous') >= 0) spur.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}); } catch (e) { /* nicht jedes Handy kann das */ }
      video.play().catch(() => {});
      status.textContent = 'Halte den Strichcode waagerecht in den Rahmen. QR-Codes gehen auch.';
      lesen(video, status);
    }, (err) => {
      kamera.an = false;
      status.textContent = err && err.name === 'NotAllowedError' ? 'Die Kamera ist nicht erlaubt. Erlaube sie für diese Seite in den Einstellungen oder tipp die Nummer unter dem Strichcode ein.'
        : err && err.name === 'NotFoundError' ? 'Keine Kamera gefunden. Tipp die Nummer unter dem Strichcode ein.' : 'Die Kamera ging nicht an. Tipp die Nummer unter dem Strichcode ein.';
    });
  };
  const lesen = (video, status) => {
    const leinwand = document.createElement('canvas'), ctx = leinwand.getContext('2d', { willReadFrequently: true }), zaehler = {};
    let eingebaut = null, runde = 0, linkGesehen = false;
    // Eingebauter Leser (z. B. Android Chrome): Strichcode und QR, wenn das Handy beides kann
    if ('BarcodeDetector' in window) {
      Promise.resolve(window.BarcodeDetector.getSupportedFormats ? window.BarcodeDetector.getSupportedFormats() : ['ean_13', 'ean_8', 'upc_a'])
        .then((kann) => { const f = ['ean_13', 'ean_8', 'upc_a', 'qr_code'].filter((x) => kann.indexOf(x) >= 0); if (f.length) eingebaut = new window.BarcodeDetector({ formats: f }); }).catch(() => { eingebaut = null; });
    }
    const treffer = (code) => { kameraAus(); if (navigator.vibrate) navigator.vibrate(40); gefunden(code); };
    const nurLink = () => { if (!linkGesehen) { linkGesehen = true; status.textContent = 'Das ist ein QR-Code ohne Produktnummer, zum Beispiel ein Link. Scanne lieber den Strichcode auf der Packung.'; } };
    const schritt = async () => {
      if (!kamera.an || !inhalt.isConnected) { kameraAus(); return; }
      const vw = video.videoWidth, vh = video.videoHeight, bw = video.clientWidth, bh = video.clientHeight;
      if (video.readyState >= 2 && vw && bw) {
        const mass = Math.max(bw / vw, bh / vh), sichtW = bw / mass, sichtH = bh / mass;
        runde++;
        if (eingebaut) {   // ganzer sichtbarer Ausschnitt, der eingebaute Leser findet Codes überall
          const sw = Math.round(sichtW), sh = Math.round(sichtH), zw = Math.min(sw, 1280), zh = Math.max(1, Math.round(sh * zw / sw));
          leinwand.width = zw; leinwand.height = zh;
          ctx.drawImage(video, Math.round((vw - sw) / 2), Math.round((vh - sh) / 2), sw, sh, 0, 0, zw, zh);
          try {
            for (const x of await eingebaut.detect(leinwand)) {
              if (x.format === 'qr_code') { const nr = produktnummer({ text: x.rawValue, gs1: false }); if (nr) { treffer(nr); return; } nurLink(); }
              else if (gtinOk(x.rawValue)) { treffer(x.rawValue); return; }
            }
          } catch (e) { eingebaut = null; }
        } else if (runde % 2 === 1) {
          // Strichcode: im Rahmen (Mitte, 80 % breit, 52 % hoch wie .es-scan-rahmen, passt auch für QR), 13 Zeilen, ein Code gilt nach zwei Lesungen
          const sw = Math.round(sichtW * 0.8), sh = Math.round(sichtH * 0.52), sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
          const zw = Math.min(sw, 1280), zh = Math.max(1, Math.round(sh * zw / sw));
          leinwand.width = zw; leinwand.height = zh;
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, zw, zh);
          for (const [code, n] of Object.entries(leseBild(ctx.getImageData(0, 0, zw, zh).data, zw, zh, 13))) {
            zaehler[code] = (zaehler[code] || 0) + n;
            if (zaehler[code] >= 2) { treffer(code); return; }
          }
        } else {
          // QR: Quadrat in der Mitte (90 % der kürzeren Seite), höchstens 640 px. Reed-Solomon prüft jeden Code, darum reicht eine Lesung.
          const seite = Math.round(Math.min(sichtW, sichtH) * 0.9), z = Math.min(seite, 640);
          leinwand.width = z; leinwand.height = z;
          ctx.drawImage(video, Math.round((vw - seite) / 2), Math.round((vh - seite) / 2), seite, seite, 0, 0, z, z);
          const qr = qrLesen(ctx.getImageData(0, 0, z, z).data, z, z);
          if (qr) { const nr = produktnummer(qr); if (nr) { treffer(nr); return; } nurLink(); }
        }
      }
      if (kamera.an) kamera.timer = setTimeout(schritt, eingebaut ? 150 : 90);
    };
    schritt();
  };
  // Ziffern von Hand (wenn die Kamera nicht geht oder der Code zerknittert ist)
  const nummer = () => {
    const feld = h('input', { class: 'eingabe', id: 'es-ean', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'z. B. 4337185761638' });
    const pruefen = () => {
      const code = feld.value.replace(/\D/g, '');
      if (!gtinOk(code)) { o.toast('Die Nummer stimmt nicht. Sie hat 8, 12 oder 13 Ziffern und steht unter dem Strichcode.'); feld.focus(); return; }
      gefunden(code);
    };
    feld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pruefen(); });
    zeige(h('label', { class: 'lbl', for: 'es-ean', text: 'Nummer unter dem Strichcode' }), feld,
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => suche(''), text: 'Zurück' }), h('button', { class: 'knopf haupt', type: 'button', onclick: pruefen, text: 'Nachschlagen' })));
    setTimeout(() => { try { feld.focus({ preventScroll: true }); } catch (x) { /* nichts */ } }, 80);
  };
  // Gefunden: erst in den eigenen Lebensmitteln (dann auch ohne Internet), sonst bei Open Food Facts. Unbekannt: Werte von der Packung, die App merkt sich den Code.
  const gefunden = (code) => {
    const status = h('p', { class: 'es-scan-status', role: 'status', text: 'Strichcode ' + code + ': suche das Produkt …' });
    const wege = h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => scanner(), text: 'Nochmal scannen' }));
    zeige(status, wege);
    const ids = schreibweisen(code).flatMap((c) => ['off' + c, 'ean' + c]), bekannt = st.eigene.find((x) => ids.indexOf(x.id) >= 0);
    if (bekannt) { menge(bekannt, ''); return; }
    if (navigator.onLine === false) { status.textContent = 'Ohne Internet kann ich das Produkt nicht nachschlagen. Trag die Werte von der Packung ein.'; wege.append(h('button', { class: 'knopf haupt', type: 'button', onclick: () => eigenes('', code), text: 'Werte von der Packung' })); return; }
    codeHolen(code).then((lm) => {
      if (!inhalt.isConnected) return;
      if (lm) { menge(lm, ''); return; }
      status.textContent = 'Dieses Produkt kennt Open Food Facts noch nicht. Trag die Werte von der Packung ein, dann kennt die App es beim nächsten Scan.';
      wege.append(h('button', { class: 'knopf haupt', type: 'button', onclick: () => eigenes('', code), text: 'Werte von der Packung' }));
    }, () => {
      if (!inhalt.isConnected) return;
      status.textContent = 'Das Nachschlagen hat gerade nicht geklappt. Versuch es gleich nochmal oder trag die Werte von der Packung ein.';
      wege.append(h('button', { class: 'knopf haupt', type: 'button', onclick: () => eigenes('', code), text: 'Werte von der Packung' }));
    });
  };

  // Gericht schätzen (26.11.2026, Stufe 2 ohne Packung, Devin: „Erst Gerichte-Liste, dann KI“): Gerichte nach Gruppen, Suche, dann Portion klein/normal/groß.
  // Später schlägt ein Bild-Modell auf dem Handy das Gericht aus genau dieser Liste vor (Plan: KI-PLAN.md im Arbeitsordner).
  const gerichte = (begriff) => {
    const feld = h('input', { class: 'eingabe', type: 'search', id: 'es-gericht-suche', autocomplete: 'off', placeholder: 'z. B. Döner, Pizza, Bowl', value: begriff || '', 'aria-label': 'Gericht suchen' });
    const liste = h('div', { class: 'es-treffer' });
    const zeile = (g) => h('button', { class: 'es-lm', type: 'button', onclick: () => menge(Object.assign({ q: 'gericht' }, g), '') },
      h('b', { text: g.n }), h('small', { text: (g.pg ? '≈ ' + kcalText(g.k * g.pg / 100) + ' pro ' + (g.pn || 'Portion') : kcalText(g.k) + ' je 100 g') + (typeof g.p === 'number' && g.pg ? ' · ' + gText(g.p * g.pg / 100) + ' Eiweiß' : '') }));
    const neu = () => {
      const q = einfach(feld.value).trim().split(/\s+/).filter(Boolean), alle = ESSEN.gerichte || [];
      const passt = alle.filter((g) => q.every((w) => einfach(g.n).indexOf(w) >= 0));
      if (q.length) { liste.replaceChildren(...(passt.length ? passt.map(zeile) : [h('p', { class: 'leise klein', text: 'Nichts gefunden. Nimm ein ähnliches Gericht oder „Nur Kalorien“.' })])); return; }
      const gruppen = [];
      for (const g of alle) { let gr = gruppen.find((x) => x.n === (g.gr || 'Weitere')); if (!gr) gruppen.push(gr = { n: g.gr || 'Weitere', l: [] }); gr.l.push(g); }
      liste.replaceChildren(...gruppen.flatMap((gr) => [h('p', { class: 'es-gruppe', text: gr.n }), ...gr.l.map(zeile)]));
    };
    feld.addEventListener('input', neu);
    zeige(h('p', { class: 'leise klein', text: 'Für Essen ohne Packung: Such dein Gericht und wähl die Portion. Das ist immer eine Schätzung.' }), feld, liste,
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => suche(''), text: 'Zurück' }), h('button', { class: 'knopf', type: 'button', onclick: () => schnell(), text: 'Nur Kalorien' })));
    neu();
  };

  // Werte von der Packung (je 100 g, so stehen sie auf jeder Packung in der EU). Mit Strichcode merkt sich die App ihn (id ean…).
  const eigenes = (name, code) => {
    const f = (id, label, wert, mode) => [h('label', { class: 'lbl', for: id, text: label }), h('input', { class: 'eingabe', id, type: 'text', inputmode: mode || 'decimal', autocomplete: 'off', value: wert || '' })];
    const wert = (id) => alsZahl(inhalt.querySelector('#' + id).value);
    const weiter = () => {
      const n = text(inhalt.querySelector('#es-e-name').value, 70), k = wert('es-e-k');
      if (!n) { o.toast('Bitte einen Namen eintragen.'); return; }
      if (!(k >= 0 && k <= 900)) { o.toast('Kalorien je 100 g: eine Zahl von 0 bis 900.'); return; }
      const lm = lmSauber({ n, k, p: wert('es-e-p'), c: wert('es-e-c'), f: wert('es-e-f'), pg: wert('es-e-pg'), q: 'eigen', id: code && gtinOk(code) ? 'ean' + code : undefined });
      if (!lm || (lm.p || 0) + (lm.c || 0) + (lm.f || 0) > 105) { o.toast('Eiweiß, Kohlenhydrate und Fett je 100 g zusammen höchstens 100 g.'); return; }
      menge(lm, name);
    };
    zeige(h('p', { class: 'leise klein', text: 'Die Werte je 100 g stehen hinten auf der Packung. Das Lebensmittel merkt sich die App für das nächste Mal.' + (code ? ' Strichcode: ' + code : '') }),
      f('es-e-name', 'Name', text(name, 70), 'text'), f('es-e-k', 'Kalorien je 100 g (kcal)'), f('es-e-p', 'Eiweiß je 100 g (freiwillig)'), f('es-e-c', 'Kohlenhydrate je 100 g (freiwillig)'),
      f('es-e-f', 'Fett je 100 g (freiwillig)'), f('es-e-pg', 'Eine Portion in Gramm (freiwillig)'),
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => suche(name), text: 'Zurück' }), h('button', { class: 'knopf haupt', type: 'button', onclick: weiter, text: 'Weiter' })));
  };

  // Nur Kalorien: zum Beispiel im Restaurant, wenn die Menge unbekannt ist
  const schnell = () => {
    const name = h('input', { class: 'eingabe', id: 'es-s-name', type: 'text', autocomplete: 'off', placeholder: 'z. B. Pizza im Restaurant' });
    const k = h('input', { class: 'eingabe', id: 'es-s-k', type: 'text', inputmode: 'numeric', autocomplete: 'off' });
    const p = h('input', { class: 'eingabe', id: 'es-s-p', type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    const eintragen = () => {
      const kv = alsZahl(k.value), pv = alsZahl(p.value);
      if (!(kv > 0 && kv <= 5000)) { o.toast('Kalorien: eine Zahl von 1 bis 5.000.'); k.focus(); return; }
      fertig(eintragSauber({ n: text(name.value, 70) || 'Mahlzeit', k: kv, p: pv >= 0 && pv <= 300 ? pv : undefined, m: 0 }), null);
    };
    zeige(h('p', { class: 'leise klein', text: 'Wenn du die Menge nicht kennst: schätz die Kalorien grob. Lieber grob eintragen als gar nicht.' }),
      h('label', { class: 'lbl', for: 'es-s-name', text: 'Was war es?' }), name, h('label', { class: 'lbl', for: 'es-s-k', text: 'Kalorien (kcal)' }), k,
      h('label', { class: 'lbl', for: 'es-s-p', text: 'Eiweiß in g (freiwillig)' }), p,
      h('div', { class: 'es-wege' }, h('button', { class: 'knopf', type: 'button', onclick: () => suche(''), text: 'Zurück' }), h('button', { class: 'knopf haupt', type: 'button', onclick: eintragen, text: 'Eintragen' })));
  };

  o.blatt('Essen eintragen', tagName(VERSATZ), [inhalt], kameraAus);   // Blatt zu: Kamera sofort aus
  suche('');
}

/* ---------- Ohne Zählen: Teller, Hand, Ampel, Tages-Haken ---------- */
function tellerBild(h) {
  // Halber Teller Gemüse und Obst, ein Viertel Eiweiß, ein Viertel Kohlenhydrate (Harvard Healthy Eating Plate), daneben Öl und Glas
  const r = 54, cx = 64, cy = 64;
  const bild = svg('svg', { viewBox: '0 0 168 128', class: 'es-teller-bild', 'aria-hidden': 'true' },
    svg('circle', { cx, cy, r: r + 7, class: 'es-teller-rand' }),
    svg('path', { d: 'M' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + cx + ' ' + (cy + r) + ' Z', class: 'es-t-gemuese' }),
    svg('path', { d: 'M' + cx + ' ' + cy + ' L' + cx + ' ' + (cy - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy + ' Z', class: 'es-t-eiweiss' }),
    svg('path', { d: 'M' + cx + ' ' + cy + ' L' + (cx + r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + cx + ' ' + (cy + r) + ' Z', class: 'es-t-kh' }),
    svg('rect', { x: 140, y: 30, width: 18, height: 34, rx: 4, class: 'es-t-glas' }),
    svg('circle', { cx: 149, cy: 92, r: 7, class: 'es-t-oel' }));
  return bild;
}
function tellerTeile(o, c) {
  const { h } = o, { e, jung, tagLesen } = c, T = ESSEN.teller, A = ESSEN.ampel;
  const farbe = { gemuese: 'es-f-gemuese', eiweiss: 'es-f-eiweiss', kohlenhydrate: 'es-f-kh' };
  const teile = [];
  if (Array.isArray(e.sc) && e.sc.length) teile.push(h('section', { class: 'block es-schritte' }, h('h2', { text: 'Deine ersten Schritte' }), h('ul', null, e.sc.map((s) => h('li', { text: s[1] })))));
  const hd = e.hd;
  teile.push(h('section', { class: 'block es-teller' }, h('h2', { text: 'So sieht ein guter Teller aus' }),
    h('div', { class: 'es-teller-oben' }, tellerBild(h),
      h('ul', { class: 'es-legende' }, T.teile.map((t) => h('li', null, h('i', { class: farbe[t.id], 'aria-hidden': 'true' }), h('span', null, h('b', { text: (t.anteil === 0.5 ? 'Die Hälfte: ' : 'Ein Viertel: ') + t.name }), h('small', { text: t.text })))),
        h('li', null, h('i', { class: 'es-f-oel', 'aria-hidden': 'true' }), h('span', null, h('b', { text: T.fett.name }), h('small', { text: T.fett.text }))),
        h('li', null, h('i', { class: 'es-f-glas', 'aria-hidden': 'true' }), h('span', null, h('b', { text: 'Trinken' }), h('small', { text: T.trinken.text }))))),
    hd ? h('div', { class: 'es-hand' }, h('b', { text: 'Deine Menge pro Mahlzeit' + (hd.m ? ' (' + hd.m + '× am Tag)' : '') }),
      h('ul', null, [[hd.e, 'Handfläche', 'Handflächen', 'Eiweiß'], [hd.g, 'Faust', 'Fäuste', 'Gemüse oder Obst'], [hd.k, 'Hand voll', 'Hände voll', 'Kohlenhydrate'], [hd.f, 'Daumen', 'Daumen', 'Fett']]
        .filter((x) => x[0] > 0).map((x) => h('li', { text: komma(x[0], x[0] % 1 ? 1 : 0) + ' ' + (x[0] <= 1 ? x[1] : x[2]) + ' ' + x[3] }))),
      hd.a && !jung ? h('p', { class: 'leise klein', text: hd.a }) : null) : h('p', { class: 'leise klein', text: T.hinweis })));
  const gruppe = (id, g) => h('div', { class: 'es-ampel-gruppe es-ampel-' + id },
    h('div', { class: 'es-ampel-kopf' }, h('i', { 'aria-hidden': 'true' }), h('b', { text: g.name }), h('small', { text: g.satz })),
    h('ul', null, g.eintraege.map((x) => h('li', { text: jung && x.text_unter_18 ? x.text_unter_18 : x.text }))));
  teile.push(h('section', { class: 'block es-ampel' }, h('h2', { text: 'Die Ampel' }),
    h('p', { class: 'leise klein', text: 'Die Ampel zeigt dir, was oft auf den Teller gehört und was eher selten. Alles darf mal sein.' }),
    gruppe('gruen', A.gruen), gruppe('gelb', A.gelb), gruppe('rot', A.rot)));
  // Drei Haken am Tag: Ziele über Verhalten, nicht über Gewicht
  const hk = tagLesen.hk || [];
  const woche = [];
  for (let i = 6; i >= 0; i--) { const k = isoTag(new Date(Date.now() - (VERSATZ + i) * TAG_MS)), t = c.st.tage[k]; woche.push(!!(t && HAKEN_IDS.every((id) => t.hk.indexOf(id) >= 0))); }
  teile.push(h('section', { class: 'block es-haken' }, h('h2', { text: VERSATZ === 0 ? 'Deine Haken für heute' : 'Deine Haken · ' + tagName(VERSATZ) }),
    h('div', { class: 'es-haken-liste' }, HAKEN.map((x) => h('button', { class: 'es-haken-knopf', type: 'button', 'aria-pressed': String(hk.indexOf(x.id) >= 0),
      onclick: () => { const t = c.tag(), i = t.hk.indexOf(x.id); if (i >= 0) t.hk.splice(i, 1); else t.hk.push(x.id); c.speichern(); o.neu(); } }, h('i', { 'aria-hidden': 'true' }), h('span', { text: x.text })))),
    h('div', { class: 'es-woche', role: 'img', 'aria-label': 'Letzte 7 Tage: an ' + woche.filter(Boolean).length + ' Tagen alle Haken' }, woche.map((x) => h('i', { class: x ? 'voll' : '' }))),
    h('p', { class: 'leise klein', text: 'Die Punkte zeigen die letzten 7 Tage. Voll heißt: alle drei Haken.' })));
  return teile;
}

/* ---------- Trinken (für alle) ---------- */
function trinkenKarte(o, c) {
  const { h } = o, ml = c.tagLesen.w || 0, ziel = c.ziel.tr || null;
  const aendern = (d) => { const t = c.tag(); t.w = Math.max(0, Math.min(10000, (t.w || 0) + d)); c.speichern(); o.neu(); };
  return h('section', { class: 'block es-trinken' }, h('h2', { text: 'Trinken' }),
    h('div', { class: 'es-trinken-reihe' },
      h('button', { class: 'knopf klein', type: 'button', 'aria-label': 'Ein Glas weniger', disabled: ml <= 0 || null, onclick: () => aendern(-250), text: '−' }),
      h('div', { class: 'es-trinken-wert', role: 'status' }, h('b', { text: liter(ml) + ' l' }), ziel ? h('span', { text: 'von ab ' + komma(Math.round(ziel / 100) / 10, 1) + ' l' }) : null),
      h('button', { class: 'knopf haupt klein', type: 'button', onclick: () => aendern(250), text: '+ 1 Glas' })),
    ziel ? h('div', { class: 'es-spur', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.min(100, Math.round(ml / ziel * 100)) + '%' })) : null,
    h('p', { class: 'leise klein', text: 'Ein Glas sind 250 ml. Wasser oder ungesüßter Tee, beim Sport und bei Hitze mehr.' }));
}
