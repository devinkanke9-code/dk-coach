// DK Coach — Kunden-App. Läuft ohne Konto und offline.
// Der Plan kommt im Link vom Trainer, wird auf dem Handy gespeichert und nie an einen Server geschickt.
// Seit 29.10.2026: Link + Code (#z=…, verschlüsselt, mit Laufzeit), ohne Plan zuerst die Analyse. Alte Links (#p=…) gehen weiter.
// Aussehen und Abläufe wie die Kunden-Ansicht der Trainer-Seite (stil.css, gleiche Bausteine), dazu die 3D-Figur (buehne.js).
import { UEBUNGEN, STAND, ANALYSE } from './daten.js';
import { buehne, standbilder } from './buehne.js';
const K = window.DKKompakt;   // kompakt.js: Code, Verschlüsselung, Analyse-Format (gleich wie in der Trainer-Seite)

/* ---------- Hilfen ---------- */
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'checked' || k === 'value') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kinder.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const speicher = {
  lies(k, std) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : std; } catch (e) { return std; } },
  schreib(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
function toast(t) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = h('div', { class: 'toast', role: 'status', text: t }); document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
const bereich = (r, e) => !r ? '' : (r[0] === r[r.length - 1] ? String(r[0]) : r[0] + '–' + r[r.length - 1]) + (e === 'sek' ? ' s' : '');
const auf15 = (x) => Math.max(15, Math.round(x / 15) * 15);
function datumHeute() { const t = new Date(); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); }
const isoHeute = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const vorname = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const MUSKEL = { brust: 'Brust', lat: 'Latissimus', oberer_ruecken: 'Oberer Rücken', trapez: 'Trapez', schulter_vorne: 'Vordere Schulter',
  schulter_seite: 'Seitliche Schulter', schulter_hinten: 'Hintere Schulter', bizeps: 'Bizeps', trizeps: 'Trizeps', unterarme: 'Unterarme',
  quadrizeps: 'Oberschenkel vorn', beinbeuger: 'Oberschenkel hinten', gesaess: 'Gesäß', adduktoren: 'Innenseite Bein', abduktoren: 'Außenseite Hüfte',
  waden: 'Waden', bauch: 'Bauch', seitlicher_rumpf: 'Seitlicher Rumpf', unterer_ruecken: 'Unterer Rücken' };
const ZIEL = { muskelaufbau: 'Muskelaufbau', kraft: 'Kraft', fettabbau: 'Fettabbau', gesundheit: 'Gesundheit', fitness_allgemein: 'Fitness',
  ruecken_gesund: 'Gesunder Rücken', beweglichkeit: 'Beweglichkeit', ausdauer: 'Ausdauer' };
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const PHASE = { e: ['einstieg', 'Einstieg', 'Technik vor Gewicht'], a: ['aufbau', 'Aufbau', 'Steigern nach Regel'], d: ['deload', 'Entlastung', 'Weniger Sätze, leichter'] };

/* ---------- Plan aus dem Link ---------- */
function vonBase64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b;
}
async function entpacke(code) {
  const art = code[0], bytes = vonBase64url(code.slice(1));
  if (art === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  if (art === 'z') {
    const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(strom).text());
  }
  throw new Error('unbekanntes Format');
}
function pruefePlan(p) { return p && p.v === 1 && Array.isArray(p.t) && p.t.length && p.t.every((t) => Array.isArray(t.u)); }

/* iPhone: Apps vom Home-Bildschirm haben einen eigenen Speicher, sie sehen nicht, was Safari gespeichert hat.
 * Deshalb bleibt der Link in Safari in der Adresszeile, und das iPhone bekommt kein Manifest: „Zum Home-Bildschirm“
 * nimmt dann genau diesen Link mit, und die App fragt beim ersten Start einmal den Code ab. */
const istIos = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installiert = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!istIos) document.head.append(h('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
function linkAusAdresse() { if (!istIos || installiert()) history.replaceState(null, '', location.pathname + location.search); }
// Schon verarbeitete Links (z. B. der Start-Link der Home-Bildschirm-App) nicht bei jedem Start neu entschlüsseln
const abdruck = (s) => s.slice(-24);
const schonGesehen = (s) => speicher.lies('dk_gesehen', []).includes(abdruck(s));
function gesehen(s) { speicher.schreib('dk_gesehen', speicher.lies('dk_gesehen', []).filter((x) => x !== abdruck(s)).concat(abdruck(s)).slice(-20)); }
function dauerhaft() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch (e) {} }   // Browser soll den Plan nicht wegräumen

async function linkEinlesen() {
  const z = /[#&]z=([A-Za-z0-9_-]+)/.exec(location.hash), m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!z && !m) return false;
  linkAusAdresse();
  const teil = z ? z[1] : m[1];
  if (schonGesehen(teil)) return false;
  return z ? zugangEinlesen(teil) : planEinlesen(teil);
}
// Alte Links (#p=…, bis 28.10.2026): Plan offen im Link, ohne Code und ohne Laufzeit
async function planEinlesen(code) {
  try {
    const p = await entpacke(code);
    if (!pruefePlan(p)) throw new Error('kein Plan');
    p.id = p.id || ('p' + Date.now().toString(36));
    const plaene = speicher.lies('dk_plaene', {});
    const alt = plaene[p.id];
    gesehen(code);
    if (alt && alt.d && p.d && alt.d > p.d) return false;   // ein älterer Link überschreibt nie einen neueren Plan
    p.importiert = alt && alt.importiert || isoHeute();
    plaene[p.id] = p;
    speicher.schreib('dk_plaene', plaene);
    speicher.schreib('dk_aktiv', p.id);
    toast(alt ? 'Plan aktualisiert' : 'Plan gespeichert – ab jetzt auch ohne Internet');
    dauerhaft(); S.tagWahl = null;
    return true;
  } catch (e) {
    toast('Der Link ist unvollständig. Lass ihn dir nochmal schicken.');
    return false;
  }
}

/* ---------- Zugang: Link + Code (#z=…) ----------
 * Der Link trägt Name, Laufzeit und Plan verschlüsselt, der Code aus Devins Nachricht ist der Schlüssel.
 * Einmal eingegeben, merkt sich das Handy den Code: Neue Links von Devin gehen danach ohne Eingabe auf.
 * Ab dem Tag nach „bis“ sperrt die App, bis ein neuer Link kommt. */
const konten = () => speicher.lies('dk_konten', {});
const aktivesKonto = () => konten()[speicher.lies('dk_konto', '')] || null;
const abgelaufen = (ko) => !!(ko && ko.bis && isoHeute() > ko.bis);
const datumDe = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE');
const tageBis = (ko) => Math.round((new Date(ko.bis + 'T12:00:00') - new Date(isoHeute() + 'T12:00:00')) / 864e5);
function kontoSetzen(id, aenderung) { const alle = konten(); if (alle[id]) { Object.assign(alle[id], aenderung); speicher.schreib('dk_konten', alle); } }
function linkDatenOk(d) {
  return !!d && d.v === 2 && /^k[A-Za-z0-9]{1,16}$/.test(d.k || '') && typeof d.t === 'number' && (!d.bis || /^\d{4}-\d{2}-\d{2}$/.test(d.bis)) && (!d.p || pruefePlan(d.p));
}
async function zugangEinlesen(teil) {
  for (const c of new Set(Object.values(konten()).map((k) => k.code).filter(Boolean))) {   // Code schon bekannt? Dann ohne Eingabe
    let d = null;
    try { d = await K.entpacken(c, teil); } catch (e) { continue; }
    if (linkDatenOk(d)) { anmelden(d, c, teil); return true; }
  }
  S.wartet = teil; speicher.schreib('dk_wartet', teil);
  return true;
}
function anmelden(d, code, teil) {
  const alle = konten(), alt = alle[d.k];
  gesehen(teil); S.wartet = null; speicher.schreib('dk_wartet', null);
  speicher.schreib('dk_konto', d.k); speicher.schreib('dk_aktiv', d.k);   // wer sich einloggt, sieht seinen eigenen Stand
  if (alt && alt.t > d.t) return;   // älterer Link (z. B. der Start-Link vom Home-Bildschirm) überschreibt nie einen neueren Stand
  alle[d.k] = { id: d.k, n: d.n || '', bis: d.bis || '', code: K.appCodeAnzeige(code), t: d.t, plan: !!d.p, warten: !!d.w,
    analyse: d.p ? null : (alt && alt.analyse) || null,
    form: d.a === 2 ? 'kurz' : d.a ? 'lang' : (alt && alt.form) || null };   // a: 2 = Analyse in 10 Fragen, 1 = alle Fragen
  speicher.schreib('dk_konten', alle);
  if (d.p) {
    // Neuer Plan (anderes Erstelldatum) = Woche 1 ab heute; nur geändert = die Wochen zählen weiter
    const plaene = speicher.lies('dk_plaene', {}), vorher = plaene[d.k];
    plaene[d.k] = Object.assign({}, d.p, { id: d.k, importiert: (vorher && vorher.d === d.p.d && vorher.importiert) || isoHeute() });
    speicher.schreib('dk_plaene', plaene);
  }
  dauerhaft();
  const vn = vorname(d.n);
  if (!alt) toast('Hi' + (vn ? ' ' + vn : '') + '! Du bist eingeloggt.');
  else if (alt.t !== d.t) toast(d.p && !alt.plan ? 'Dein Plan ist da!' : d.p ? 'Neuer Stand von Devin ist da' : 'Aktualisiert');
  S.tagWahl = null; S.ansicht = 'heute';
}
// Nachricht von Devin einfügen: für die App vom Home-Bildschirm, die Links aus WhatsApp nicht selbst öffnet
async function textEinlesen(text) {
  text = String(text || '');
  const z = /[#&]z=([A-Za-z0-9_-]+)/.exec(text), p = /[#&]p=([A-Za-z0-9_-]+)/.exec(text);
  if (!z && !p) { toast('Darin ist kein Link von Devin. Kopier die ganze Nachricht.'); return; }
  if (!z) { await planEinlesen(p[1]); zeichne(); return; }
  const c = /(\d{4})\s*-\s*(\d{4})/.exec(text.replace(z[0], ''));   // steht der Code mit in der Nachricht: gleich einloggen
  if (c) {
    let d = null;
    try { d = await K.entpacken(c[1] + c[2], z[1]); } catch (e) {}
    if (linkDatenOk(d)) { anmelden(d, c[1] + c[2], z[1]); zeichne(); fotosVorladen(); return; }
  }
  await zugangEinlesen(z[1]); zeichne(); fotosVorladen();
}
function einfuegenBlock(titel) {
  const feld = h('textarea', { class: 'eingabe', rows: '3', placeholder: 'Nachricht von Devin hier einfügen', 'aria-label': 'Nachricht von Devin' });
  const offen = h('div', { class: 'stapel', hidden: true }, feld, h('button', { class: 'knopf haupt', type: 'button', onclick: () => textEinlesen(feld.value), text: 'Übernehmen' }));
  return h('div', { class: 'stapel einfuegen' }, h('button', { class: 'knopf', type: 'button', onclick: async () => {
    let t = '';
    try { t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; } catch (e) {}   // das Handy fragt vorher
    if (/[#&][zp]=/.test(t)) textEinlesen(t); else { offen.hidden = false; feld.focus(); }
  }, text: titel || 'Link von Devin einfügen' }), offen);
}

/* ---------- Zustand ---------- */
const S = { ansicht: 'heute', plan: null, tagWahl: null };
function aktiverPlan() {
  const plaene = speicher.lies('dk_plaene', {});
  const id = speicher.lies('dk_aktiv', null);
  if (plaene[id]) return plaene[id];
  if (id && konten()[id]) return null;   // eingeloggt, aber noch ohne Plan (Analyse oder Warten)
  return Object.values(plaene)[0] || null;
}
function uebung(u) {
  const d = UEBUNGEN[u.i] || { n: u.nm || u.i, m: [], t: [], f: [], v: [] };
  return { id: u.i, name: u.nm || d.n || u.i, saetze: u.s, wdh: u.w, rir: u.r, pause: u.p || [], einheit: u.e || d.e, einseitig: !!u.j, notiz: u.x, d };
}
const istSek = (u) => u.einheit === 'sek';
const dosis = (u) => bereich(u.wdh, istSek(u) ? 'sek' : '') + (istSek(u) ? '' : ' Wdh');
const pauseText = (u) => bereich(u.pause.map(auf15)) + ' s';
const anzeigeName = (u) => u.name + (u.einseitig ? ' (je Seite)' : '');
// Woche des Plans (ab dem Tag, an dem der Link geöffnet wurde)
function aktuelleWoche(p) {
  const start = new Date(p.importiert || isoHeute());
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 6048e5));
}
const istEntlastung = (p) => (p.w || [])[aktuelleWoche(p)] === 'd';
// In der Entlastungswoche halb so viele Sätze (mindestens 1)
const satzZahl = (p, u) => istEntlastung(p) ? Math.max(1, Math.ceil(u.saetze / 2)) : u.saetze;

// Trainingstage: selbst gewählt (nur auf dem Handy) oder die festen Tage aus dem Plan; 0 = Montag
function kundenTage(p) {
  const eigen = speicher.lies('dk_tage_' + p.id, null);
  const t = Array.isArray(eigen) ? eigen : (p.ft || []);
  return t.filter((i) => i >= 0 && i < 7).sort();
}
function tagFuer(p, wt) { const i = kundenTage(p).indexOf(wt); return i >= 0 && i < p.t.length ? i : -1; }
const heuteIndex = () => (new Date().getDay() + 6) % 7;

// Abhaken: gilt nur heute, nur auf diesem Handy
const erledigtKey = (p, ti) => 'dk_erledigt_' + p.id + '_' + datumHeute() + '_' + ti;
const erledigtLaden = (p, ti) => speicher.lies(erledigtKey(p, ti), []);
function erledigtSetzen(p, ti, ui, an) {
  const l = erledigtLaden(p, ti).filter((x) => x !== ui);
  if (an) l.push(ui);
  speicher.schreib(erledigtKey(p, ti), l);
  zeichne();
}
function altesAbhakenWeg() {
  try {
    const weg = [], heute = '_' + datumHeute() + '_';
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^dk_erledigt_/.test(k) && k.indexOf(heute) < 0) weg.push(k); }
    weg.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

/* ---------- Leiste ---------- */
const BEREICHE = [
  ['heute', 'Heute', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.6"/>'],
  ['plan', 'Plan', '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>'],
  ['uebungen', 'Übungen', '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M7 10l5 1 5-1"/>'],
  ['info', 'Infos', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>']
];
function leiste() {
  const n = $('#leiste'); n.textContent = '';
  $('nav.leiste').hidden = !S.plan;
  n.style.gridTemplateColumns = 'repeat(' + BEREICHE.length + ', 1fr)';
  for (const [id, name, icon] of BEREICHE) {
    const b = h('button', { type: 'button', 'aria-current': S.ansicht === id ? 'page' : null, onclick: () => geh(id) });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg>';
    b.append(h('span', { text: name })); n.append(b);
  }
}
function geh(id) { S.ansicht = id; zeichne(); window.scrollTo(0, 0); }
// Was die App zeigt: Code-Eingabe, Sperre nach Ablauf, Analyse, Warten auf den Plan, der Plan selbst oder Willkommen
function zustand() {
  if (S.wartet) return 'code';
  const ko = aktivesKonto(), p = aktiverPlan();
  if (ko && (!p || p.id === ko.id)) {
    if (abgelaufen(ko)) return 'abgelaufen';
    if (!ko.plan) return ko.warten || ko.analyse === 'geschickt' ? 'warten' : 'analyse';
  }
  return p ? 'plan' : 'willkommen';
}
function zeichne() {
  const z = zustand();
  S.konto = aktivesKonto();
  S.plan = z === 'plan' ? aktiverPlan() : null;
  $('#wer').textContent = S.plan ? (navigator.onLine === false ? 'Offline · alles da' : vorname(S.plan.n)) : '';
  leiste();
  const ziel = $('#ansicht'); ziel.textContent = '';
  const ansicht = { code: codeAnsicht, abgelaufen: abgelaufenAnsicht, analyse: analyseAnsicht, warten: wartenAnsicht, willkommen }[z]
    || { heute: ansichtHeute, plan: ansichtPlan, uebungen: ansichtUebungen, info: ansichtInfo }[S.ansicht] || ansichtHeute;
  ziel.append(...ansicht().filter(Boolean));
  standbilder(lade3d, [...document.querySelectorAll('[data-vorschau]')].filter((el) => el.dataset.vorschau && !el.querySelector('img')), (id) => UEBUNGEN[id]).catch(() => {});
  if (LAUF && LAUF.phase !== 'fertig' && !TM.el) setTimeout(timerZeigen, 0);   // laufendes Training nach Neuladen wieder zeigen
}

/* ---------- Willkommen ---------- */
function willkommen() {
  return [h('section', { class: 'block willkommen' },
    h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
    h('h1', { text: 'Dein Trainingsplan' }),
    h('p', { class: 'leise', text: installiert()
      ? 'Kopier die Nachricht von Devin (Link und Code) und füg sie hier ein. Danach bleibst du eingeloggt, auch ohne Internet.'
      : 'Öffne den Link, den dir Devin geschickt hat, und gib deinen Code ein. Danach ist dein Plan hier gespeichert und funktioniert auch ohne Internet.' }),
    einfuegenBlock(),
    h('button', { class: 'knopf text', type: 'button', onclick: beispiel, text: 'Beispielplan ansehen' })),
    installKarte(true)];
}

/* ---------- Code, Sperre, Warten ---------- */
const logo = () => h('img', { class: 'logo', src: 'icon.svg', alt: '' });
function codeAnsicht() {
  const fehler = h('p', { class: 'klein', role: 'status' });
  let laeuft = false;
  const feld = h('input', { class: 'eingabe code-feld', id: 'code', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '9', placeholder: '0000-0000',
    oninput: (e) => { const n = K.appCodeNormal(e.target.value).slice(0, 8); e.target.value = n.length > 4 ? n.slice(0, 4) + '-' + n.slice(4) : n; if (n.length === 8) los(); },
    onkeydown: (e) => { if (e.key === 'Enter') los(); } });
  const knopf = h('button', { class: 'knopf haupt', type: 'button', onclick: () => los(), text: 'Einloggen' });
  async function los() {
    if (laeuft) return;
    if (!K.appCodeGueltig(feld.value)) { fehler.textContent = 'Der Code hat 8 Ziffern, zum Beispiel 4821-7730.'; return; }
    laeuft = true; knopf.disabled = true; knopf.textContent = 'Prüfe …'; fehler.textContent = '';
    let d = null;
    try { d = await K.entpacken(feld.value, S.wartet); } catch (e) {}
    if (linkDatenOk(d)) { anmelden(d, feld.value, S.wartet); zeichne(); window.scrollTo(0, 0); fotosVorladen(); return; }
    laeuft = false; knopf.disabled = false; knopf.textContent = 'Einloggen';
    fehler.textContent = 'Der Code passt nicht zu diesem Link. Schau nochmal in Devins Nachricht.';
    feld.select();
  }
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: 'Willkommen bei DK Coach' }),
    h('p', { class: 'leise', text: 'Gib den Code aus Devins Nachricht ein. Danach bleibst du eingeloggt und brauchst ihn nicht mehr.' }),
    h('label', { class: 'lbl', for: 'code', text: 'Dein Code' }), feld, knopf, fehler),
    aktiverPlan() || aktivesKonto() ? h('button', { class: 'knopf text', type: 'button', onclick: () => { S.wartet = null; speicher.schreib('dk_wartet', null); zeichne(); }, text: 'Abbrechen' }) : null];
}
function abgelaufenAnsicht() {
  const ko = aktivesKonto(), vn = vorname(ko.n);
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: (vn ? vn + ', dein' : 'Dein') + ' Zugang ist abgelaufen' }),
    h('p', { class: 'leise', text: 'Er lief bis ' + datumDe(ko.bis) + '. Willst du weitermachen? Schreib Devin. Seinen neuen Link öffnest du einfach, der Code ist schon gespeichert.' }),
    einfuegenBlock('Neuen Link einfügen'))];
}
function wartenAnsicht() {
  const ko = aktivesKonto(), vn = vorname(ko.n), geschickt = ko.analyse === 'geschickt';
  if (geschickt) sendeTextVorbereiten(ko);
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: 'Danke' + (vn ? ', ' + vn : '') + '!' }),
    h('p', { class: 'leise', text: 'Deine Analyse ist bei Devin. Er baut jetzt deinen Plan und schickt dir einen neuen Link. Den öffnest du einfach, der Code ist schon gespeichert.' }),
    geschickt ? h('div', { class: 'aktionen' }, sendenKnopf(ko, 'Nochmal schicken', 'knopf'),
      h('button', { class: 'knopf', type: 'button', onclick: () => { kontoSetzen(ko.id, { analyse: null }); zeichne(); window.scrollTo(0, 0); }, text: 'Antworten ändern' })) : null,
    einfuegenBlock('Neuen Link einfügen'))];
}

/* ---------- Analyse: der Kunde füllt sie aus, Devin baut daraus den Plan ----------
 * Fragen und Auswahl kommen aus der Wissensbasis (daten.js → ANALYSE): dasselbe Formular wie in der Trainer-Seite, ohne Trainer-Felder.
 * Die Antworten bleiben als Entwurf auf dem Handy, bis der Kunde sie verschlüsselt an Devin schickt (DK-Analyse:…:Ende).
 * Was eine Antwort bedeutet (Stopp, Anpassung), entscheidet allein die Trainer-Seite beim Einfügen. */
let EN = null;   // Entwurf: { id, a: Antworten, s: Gesundheits-Check, zg: Zielgruppen, schritt }
const entwurfKey = (ko) => 'dk_analyse_' + ko.id;
function entwurfLaden(ko) { const e = speicher.lies(entwurfKey(ko), null) || {}; return { id: ko.id, a: Object.assign({ name: ko.n || '' }, e.a), s: e.s || {}, zg: e.zg || [], schritt: e.schritt || 0 }; }
const entwurfSichern = () => speicher.schreib('dk_analyse_' + EN.id, EN);
const istJa = (v) => v === true || v === 'weiss_nicht';
const STEUER = new Set(), STEUER_S = new Set();   // Antworten, von denen Folgefragen abhängen: bei Änderung neu zeichnen
ANALYSE.abschnitte.forEach((a) => a.felder.forEach((f) => { if (f.zeige_wenn) STEUER.add(f.zeige_wenn.feld); }));
ANALYSE.screening.forEach((f) => { if (f.nur_wenn && f.nur_wenn.frage_ja) STEUER_S.add(f.nur_wenn.frage_ja); });
function anSichtbar(f, e = EN) {
  const z = f.zeige_wenn; if (!z) return true;
  const v = [].concat(e.a[z.feld] == null ? [] : e.a[z.feld]).map(String);
  if (z.enthaelt) return [].concat(z.enthaelt).some((x) => v.includes(String(x)));
  if (z.nicht_nur) return v.some((x) => ![].concat(z.nicht_nur).map(String).includes(x));
  return true;
}
function frageAktiv(f, e = EN) {   // wie E.frageAktiv in engine.js
  const n = f.nur_wenn; if (!n) return true;
  if (n.frage_ja && !istJa(e.s[n.frage_ja])) return false;
  if (n.geschlecht && !(n.geschlecht === 'w' ? e.a.geschlecht === 'weiblich' : e.a.geschlecht === 'maennlich')) return false;
  return true;
}
function anFehler(a) {
  return a.felder.filter((f) => anSichtbar(f)).map((f) => {
    const v = EN.a[f.id], leer = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (leer) return f.pflicht && f.typ !== 'lang' ? f.label : null;   // Freitext ist wie in der Trainer-Seite nie Pflicht
    if (f.typ === 'zahl' && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) return f.label + ' (' + f.min + '–' + f.max + ')';
    return null;
  }).filter(Boolean);
}
function anFeld(f, ohneLabel) {   // ohneLabel: die Überschrift stellt die Frage schon (Analyse in 10 Fragen), Label nur für Vorleseprogramme
  const id = 'an_' + f.id, wert = EN.a[f.id];
  const setze = (v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete EN.a[f.id]; else EN.a[f.id] = v; entwurfSichern(); if (STEUER.has(f.id)) zeichne(); };
  const hilfe = f.hilfe ? h('p', { class: 'hilfe', text: f.hilfe }) : null;
  const titel = f.label + (f.pflicht && f.typ !== 'lang' ? ' *' : '');
  if (f.typ === 'auswahl' || f.typ === 'mehrfach' || f.typ === 'ja_nein') {
    const mehr = f.typ === 'mehrfach';
    const opts = f.typ === 'ja_nein' ? [{ wert: true, label: 'Ja' }, { wert: false, label: 'Nein' }] : (f.optionen || []);
    return h('div', { class: 'feld', role: 'group', 'aria-labelledby': id }, h('span', { class: ohneLabel ? 'lbl versteckt' : 'lbl', id, text: titel }), hilfe,
      h('div', { class: 'optionen' }, opts.map((o, i) => {
        const an = mehr ? [].concat(wert || []).some((x) => String(x) === String(o.wert)) : wert != null && String(wert) === String(o.wert);
        return h('label', null, h('input', { type: mehr ? 'checkbox' : 'radio', name: id, id: id + '_' + i, checked: an, onchange: (e) => {
          if (!mehr) { setze(o.wert); return; }
          let neu = [].concat(EN.a[f.id] || []).filter((x) => String(x) !== String(o.wert));
          if (e.target.checked) { neu = o.exklusiv ? [] : neu.filter((x) => !opts.some((oo) => oo.exklusiv && String(oo.wert) === String(x))); neu.push(o.wert); }
          setze(neu);
          if (opts.some((oo) => oo.exklusiv) && !STEUER.has(f.id)) zeichne();
        } }), h('span', { text: o.label }));
      })));
  }
  const inp = f.typ === 'lang'
    ? h('textarea', { class: 'eingabe', id, value: wert || '', placeholder: f.platzhalter || null, oninput: (e) => setze(e.target.value) })
    : h('input', { class: 'eingabe', id, type: f.typ === 'zahl' ? 'number' : 'text', inputmode: f.typ === 'zahl' ? 'decimal' : null, min: f.min, max: f.max,
      value: wert != null ? wert : '', autocomplete: 'off', placeholder: f.platzhalter || null,
      oninput: (e) => setze(f.typ === 'zahl' ? (e.target.value === '' ? null : +e.target.value) : e.target.value) });
  return h('div', { class: 'feld' }, h('label', { for: id, class: ohneLabel ? 'versteckt' : null, text: titel }), hilfe, f.einheit ? h('div', { class: 'mit-einheit' }, inp, h('span', { text: f.einheit })) : inp);
}
function anGesundheit() {
  const OPT = [[true, 'Ja', 'ja'], [false, 'Nein', 'nein'], ['weiss_nicht', 'Weiß nicht', 'ja']];
  return [h('section', { class: 'block' }, h('h2', { text: 'Gesundheits-Check' }),
    h('p', { class: 'leise klein', text: 'Ehrlich antworten, das schützt dich. „Weiß nicht“ ist okay, dann klärt Devin das mit dir. Bei manchen Antworten brauchst du vor dem Training eine ärztliche Freigabe.' }),
    ANALYSE.screening.filter((f) => frageAktiv(f)).map((f) => h('div', { class: 'frage' }, h('span', { text: f.frage }),
      h('div', { class: 'janein' }, OPT.map(([w, t, c], i) => h('label', null,
        h('input', { type: 'radio', name: 'scr_' + f.id, id: 'scr_' + f.id + '_' + i, checked: EN.s[f.id] === w, onchange: () => { EN.s[f.id] = w; entwurfSichern(); if (STEUER_S.has(f.id)) zeichne(); } }),
        h('span', { class: c, text: t }))))))),
    ANALYSE.zielgruppen.length ? h('section', { class: 'block' }, h('h2', { text: 'Trifft etwas davon auf dich zu?' }),
      h('p', { class: 'leise klein', text: 'Freiwillig. Hilft Devin, deinen Plan anzupassen.' }),
      h('div', { class: 'optionen' }, ANALYSE.zielgruppen.map((z) => h('label', null, h('input', { type: 'checkbox', checked: EN.zg.includes(z.id), onchange: (e) => {
        EN.zg = EN.zg.filter((x) => x !== z.id); if (e.target.checked) EN.zg.push(z.id); entwurfSichern();
      } }), h('span', { text: z.name }))))) : null];
}
// Verschlüsseln dauert kurz (PBKDF2). Deshalb vorher, damit „Teilen“ direkt im Tipp startet (sonst blockt das iPhone).
let SENDE = { key: '', p: null, text: '' };
function sendeTextVorbereiten(ko) {
  const e = speicher.lies(entwurfKey(ko), null);
  if (!e) return;
  const key = JSON.stringify(e);
  if (SENDE.key === key) return;
  // Nur, was gerade sichtbar ist: eine Folgefrage, deren Ausgangsfrage jetzt Nein ist, geht nicht mit
  const a = {}, s = {};
  ANALYSE.abschnitte.forEach((ab) => ab.felder.forEach((f) => { if (e.a[f.id] != null && anSichtbar(f, e)) a[f.id] = e.a[f.id]; }));
  ANALYSE.screening.forEach((f) => { if (e.s[f.id] !== undefined && frageAktiv(f, e)) s[f.id] = e.s[f.id]; });
  const vn = vorname(a.name || ko.n);
  SENDE = { key, text: '', p: K.verpacken(ko.code, { v: 1, k: ko.id, t: Date.now(), a, s, zg: e.zg || [] }).then((z) => {
    SENDE.text = 'Hi Devin, hier ist meine Analyse für DK Coach' + (vn ? ' (' + vn + ')' : '') + '.\n\nCode für DK Coach (nicht ändern):\nDK-Analyse:' + z + ':Ende';
    document.querySelectorAll('[data-senden]').forEach((b) => { b.disabled = false; b.textContent = b.dataset.senden; });
  }) };
}
function sendenKnopf(ko, text, klasse) {
  return h('button', { class: klasse, type: 'button', 'data-senden': text, disabled: !SENDE.text || null, text: SENDE.text ? text : 'Wird vorbereitet …', onclick: async (ev) => {
    const t = SENDE.text, knopf = ev.currentTarget;
    if (!t) return;
    let ok = false;
    if (navigator.share) {
      try { await navigator.share({ text: t }); ok = true; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (!ok) { try { await navigator.clipboard.writeText(t); ok = true; toast('Kopiert. Jetzt in WhatsApp an Devin einfügen.'); } catch (e) {} }
    if (!ok) {   // weder Teilen noch Kopieren: Text zum Markieren zeigen
      const feld = h('textarea', { class: 'eingabe', rows: '4', readonly: true, value: t, 'aria-label': 'Analyse zum Kopieren' });
      knopf.after(h('p', { class: 'klein', text: 'Markier den Text, kopier ihn und schick ihn Devin:' }), feld); feld.select();
      ok = true;
    }
    kontoSetzen(ko.id, { analyse: 'geschickt' });
    setTimeout(() => { zeichne(); window.scrollTo(0, 0); }, 400);
  } });
}
// Analyse in 10 Fragen (ANALYSE.kurz, Link mit a: 2): ein Bildschirm pro Frage, die Felder kommen aus den Abschnitten.
// Danach immer der ganze Gesundheits-Check. Bleibt eine Frage leer, fragt die App einmal nach; beim zweiten Tipp geht es weiter.
const FELD = new Map(ANALYSE.abschnitte.flatMap((a) => a.felder.map((f) => [f.id, f])));
const GEMAHNT = new Set();
const leer = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
function analyseAnsicht() {
  const ko = aktivesKonto();
  if (!EN || EN.id !== ko.id) EN = entwurfLaden(ko);
  const kurz = ko.form === 'kurz' && (ANALYSE.kurz || []).length > 0;
  const fragen = kurz ? ANALYSE.kurz.map((q, i) => ({ art: 'abschnitt', titel: 'Frage ' + (i + 1), q, a: { felder: q.felder.map((id) => FELD.get(id)).filter(Boolean) } }))
    : ANALYSE.abschnitte.map((a) => ({ art: 'abschnitt', titel: a.titel, a }));
  const alle = fragen.concat([{ art: 'gesundheit', titel: 'Gesundheits-Check' }, { art: 'senden', titel: 'Abschicken' }]);
  EN.schritt = Math.min(EN.schritt || 0, alle.length - 1);
  const akt = alle[EN.schritt], vn = vorname(ko.n);
  const gehZu = (i) => { EN.schritt = i; entwurfSichern(); zeichne(); window.scrollTo(0, 0); };
  const teile = [h('div', { class: 'plan-kopf' },
    h('h1', { text: EN.schritt === 0 ? 'Hi' + (vn ? ' ' + vn : '') + '!' : akt.q ? akt.titel + ' von ' + fragen.length : akt.titel }),
    EN.schritt === 0 || !akt.q ? h('p', { class: 'leise', text: EN.schritt > 0 ? 'Schritt ' + (EN.schritt + 1) + ' von ' + alle.length
      : kurz ? 'Bevor Devin deinen Plan baut, hat er ' + fragen.length + ' Fragen an dich. Danach kommt ein kurzer Gesundheits-Check. Deine Antworten bleiben auf dem Handy, bis du sie abschickst.'
      : 'Bevor Devin deinen Plan baut, braucht er ein paar Infos von dir. Dauert etwa 10 Minuten. Deine Antworten bleiben auf dem Handy, bis du sie abschickst.' }) : null),
    h('div', { class: 'schritte', style: 'grid-template-columns:repeat(' + alle.length + ',1fr)' }, alle.map((s, i) =>
      h('button', { type: 'button', class: i <= EN.schritt ? 'an' : '', 'aria-label': 'Schritt ' + (i + 1) + ': ' + s.titel, title: s.titel, onclick: () => { if (i < EN.schritt) gehZu(i); } })))];
  if (akt.art === 'abschnitt') teile.push(h('section', { class: 'block' },
    akt.q ? [h('h2', { class: 'frage-gross', text: akt.q.frage }), akt.q.unter ? h('p', { class: 'leise', text: akt.q.unter }) : null] : EN.schritt === 0 ? h('h2', { text: akt.titel }) : null,
    h('div', { class: 'stapel' }, akt.a.felder.filter((f) => anSichtbar(f)).map((f) => anFeld(f, !!akt.q && akt.q.frage_ist === f.id)))));
  if (akt.art === 'gesundheit') teile.push(...anGesundheit());
  if (akt.art === 'senden') {
    sendeTextVorbereiten(ko);
    const ja = ANALYSE.screening.filter((f) => frageAktiv(f) && istJa(EN.s[f.id])).length;
    teile.push(h('section', { class: 'block' }, h('h2', { text: 'Fertig!' }),
      h('p', { text: 'Tipp auf „An Devin schicken“ und wähl WhatsApp. Devin baut daraus deinen Plan und schickt dir einen neuen Link.' }),
      ja ? h('p', { class: 'meldung klein', text: 'Du hast ' + ja + '× „Ja“ oder „Weiß nicht“ im Gesundheits-Check. Devin schaut sich das an. Vielleicht brauchst du vorher eine ärztliche Freigabe.' }) : null,
      EN.a.alter != null && +EN.a.alter < 18 ? h('p', { class: 'meldung klein', text: 'Du bist unter 18: Devin braucht die schriftliche Einwilligung deiner Eltern, bevor es losgeht.' }) : null,
      h('p', { class: 'leise klein', text: 'Deine Antworten gehen verschlüsselt raus. Lesen kann sie nur Devin mit deinem Code.' }),
      sendenKnopf(ko, 'An Devin schicken', 'knopf haupt')));
  }
  const ges = alle.findIndex((x) => x.art === 'gesundheit');
  if (!kurz && akt.art === 'abschnitt' && EN.schritt < ges - 1 && alle.every((x) => x.art !== 'abschnitt' || !anFehler(x.a).length)) {
    teile.push(h('button', { class: 'knopf text', type: 'button', onclick: () => gehZu(ges), text: 'Rest überspringen → Gesundheits-Check' }));
  }
  const weiter = () => {
    if (akt.art === 'abschnitt') { const f = anFehler(akt.a); if (f.length) { toast('Bitte ausfüllen: ' + f.slice(0, 3).join(', ')); return; } }
    if (akt.q && !GEMAHNT.has(akt.q.id) && akt.a.felder.every((x) => leer(EN.a[x.id]))) { GEMAHNT.add(akt.q.id); toast('Ein Satz reicht schon. Oder tipp nochmal auf Weiter.'); return; }
    if (akt.art === 'gesundheit') { const offen = ANALYSE.screening.filter((f) => frageAktiv(f) && EN.s[f.id] === undefined).length; if (offen) { toast('Bitte jede Frage beantworten (' + offen + ' offen)'); return; } }
    gehZu(EN.schritt + 1);
  };
  teile.push(h('div', { class: 'fuss' },
    EN.schritt > 0 ? h('button', { class: 'knopf', type: 'button', onclick: () => gehZu(EN.schritt - 1), text: 'Zurück' }) : h('span'),
    akt.art !== 'senden' ? h('button', { class: 'knopf haupt', type: 'button', onclick: weiter, text: 'Weiter' + (alle[EN.schritt + 1].q ? '' : ' · ' + alle[EN.schritt + 1].titel) }) : null));
  return [h('div', { class: 'analyse stapel' }, teile)];
}
function beispiel() {
  const t = (n, m, u) => ({ n, m, u: u.map(([i, s, w, r, p]) => ({ i, s, w, r, p })) });
  const ids = Object.keys(UEBUNGEN);
  const nimm = (...k) => k.find((x) => UEBUNGEN[x]) || ids[0];
  const p = { v: 1, id: 'beispiel', n: 'Beispiel', z: 'muskelaufbau', l: 2, s: 'Ganzkörper 2×', d: isoHeute(), importiert: isoHeute(), w: ['e', 'a', 'a', 'a', 'a', 'd'], ft: [0, 3],
    t: [t('Ganzkörper A', 45, [[nimm('goblet_squat'), 3, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_bankdruecken', 'liegestuetz'), 3, [8, 12], [2, 3], [90, 120]], [nimm('brustgestuetztes_kurzhantelrudern', 'einarmiges_kurzhantelrudern'), 3, [8, 12], [2, 3], [90, 120]], [nimm('dead_bug'), 2, [8, 12], [2, 3], [60, 90]]]),
      t('Ganzkörper B', 45, [[nimm('rumaenisches_kreuzheben_kurzhanteln', 'rumaenisches_kreuzheben_kh'), 3, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_schulterdruecken_sitzend'), 3, [8, 12], [2, 3], [90, 120]], [nimm('split_squat'), 2, [8, 12], [2, 3], [90, 120]], [nimm('seitheben_kurzhanteln'), 2, [12, 15], [2, 3], [60, 90]]])],
    pr: 'Schaffst du in allen Sätzen die obere Wiederholungszahl mit 2 Wiederholungen Reserve, nimm beim nächsten Mal etwas mehr Gewicht.', h: ['Beispiel mit erfundenen Daten.'], ab: [] };
  const plaene = speicher.lies('dk_plaene', {}); plaene[p.id] = p; speicher.schreib('dk_plaene', plaene); speicher.schreib('dk_aktiv', p.id);
  S.tagWahl = null; zeichne();
}

/* ---------- Kopf jeder Ansicht ---------- */
function kopf(unter) {
  const n = vorname(S.plan.n);
  return h('div', { class: 'plan-kopf' }, h('h1', { text: n ? 'Hi ' + n : 'Dein Training' }), unter ? h('p', { class: 'leise', text: unter }) : null);
}

/* ---------- Heute: Wochenleiste, Training des Tages, Übungen abhaken ---------- */
function ansichtHeute() {
  const p = S.plan, heute = heuteIndex();
  const teile = [kopf(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))];
  const ko = aktivesKonto();
  if (ko && ko.id === p.id && ko.bis && tageBis(ko) <= 7) teile.push(h('p', { class: 'meldung klein', text: (tageBis(ko) === 0 ? 'Dein Zugang endet heute.' : 'Dein Zugang läuft noch ' + tageBis(ko) + (tageBis(ko) === 1 ? ' Tag.' : ' Tage.')) + ' Schreib Devin, wenn du weitermachen willst.' }));
  if (!kundenTage(p).length) {
    teile.push(h('p', { class: 'meldung', text: 'Wähle zuerst deine Trainingstage. Dann siehst du hier jeden Tag, was dran ist.' }), trainingstageBlock(p), installKarte());
    return teile;
  }
  if (S.tagWahl == null) S.tagWahl = heute;
  teile.push(wochenleiste(p, heute));
  const ti = tagFuer(p, S.tagWahl);
  teile.push(ti >= 0 ? trainingsKarte(p, ti, S.tagWahl === heute) : ruhetagKarte(p, S.tagWahl, heute));
  teile.push(verlaufBlock());
  const w = aktuelleWoche(p), ph = PHASE[(p.w || [])[w]];
  if (ph) teile.push(h('p', { class: 'leise klein', text: 'Woche ' + (w + 1) + ' von ' + p.w.length + ' · ' + ph[1] + ': ' + ph[2] + (ph[0] === 'deload' ? ' (halb so viele Sätze)' : '') }));
  else if (p.w && w >= p.w.length) teile.push(h('p', { class: 'meldung klein', text: 'Dein Plan ist durch. Sprich mit Devin über den nächsten.' }));
  teile.push(installKarte());
  return teile;
}
function wochenleiste(p, heute) {
  return h('div', { class: 'wochenleiste', role: 'group', 'aria-label': 'Wochentage' }, WOCHENTAGE.map((w, i) => {
    const ti = tagFuer(p, i);
    return h('button', { type: 'button', class: 'wt' + (i === S.tagWahl ? ' an' : '') + (i === heute ? ' heute' : '') + (ti >= 0 ? ' training' : ''),
      'aria-pressed': i === S.tagWahl ? 'true' : 'false', 'aria-label': w + (i === heute ? ' (heute)' : '') + (ti >= 0 ? ': T' + (ti + 1) + ' ' + p.t[ti].n : ': Ruhetag'),
      onclick: () => { S.tagWahl = i; zeichne(); } },
      h('span', { text: w.slice(0, 2) }), h('b', { text: ti >= 0 ? 'T' + (ti + 1) : '–' }));
  }));
}
function mini3d(u) {
  return h('button', { class: 'mini3d' + (u.d.a ? '' : ' ohne'), type: 'button', 'aria-label': anzeigeName(u) + ' in 3D ansehen', 'data-vorschau': u.d.a ? u.id : '',
    onclick: (e) => { e.stopPropagation(); oeffneUebung(u); } }, u.d.a ? '' : '–');
}
function trainingsKarte(p, ti, istHeute) {
  const t = p.t[ti], erledigt = istHeute ? erledigtLaden(p, ti) : [];
  const alle = istHeute && t.u.length && erledigt.length >= t.u.length;
  return h('section', { class: 'block heute' },
    h('div', { class: 'tag-kopf' }, h('span', { class: 'nr', text: 'T' + (ti + 1) }), h('h3', { text: t.n }), t.m ? h('span', { class: 'leise klein zahl', text: '~' + t.m + ' min' }) : null),
    !istHeute ? h('p', { class: 'leise klein', text: WOCHENTAGE[S.tagWahl] + ' · Vorschau' }) : null,
    h('div', { class: 'aktionen' }, startKnopf(p, ti, istHeute ? 'Training starten' : 'Diese Einheit starten')),
    aufwaermen(t),
    istHeute ? h('p', { class: 'klein' + (alle ? '' : ' leise'), role: 'status', text: alle ? 'Alles erledigt. Stark, bis zum nächsten Training!' : erledigt.length + ' von ' + t.u.length + ' Übungen erledigt' }) : null,
    h('div', { class: 'ueb-liste' }, t.u.map((roh, ui) => {
      const u = uebung(roh), fertig = erledigt.indexOf(ui) >= 0;
      return h('div', { class: 'ueb-karte mit3d' + (fertig ? ' fertig' : '') + (istHeute ? '' : ' ohne-haken') },
        istHeute ? h('label', { class: 'haken' }, h('input', { type: 'checkbox', checked: fertig, 'aria-label': anzeigeName(u) + ' erledigt',
          onchange: (e) => erledigtSetzen(p, ti, ui, e.target.checked) }), h('span', { 'aria-hidden': 'true' })) : null,
        h('button', { class: 'ueb-name', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u, ti), text: anzeigeName(u) }),
        h('div', { class: 'klein zahl leise', text: satzZahl(p, u) + ' × ' + dosis(u) + (u.rir ? ' · RIR ' + bereich(u.rir) : '') + (u.pause.length ? ' · Pause ' + pauseText(u) : '') }),
        u.notiz ? h('div', { class: 'notiz', text: u.notiz }) : null,
        mini3d(u));
    })));
}
function aufwaermen(t) {
  return t.a && t.a.u && t.a.u.length ? h('details', null, h('summary', { class: 'klein', text: 'Aufwärmen' + (t.a.d ? ' · ' + t.a.d + ' min' : '') }),
    h('ul', { class: 'klein' }, t.a.u.map(([n, x]) => h('li', { text: n + (x ? ' — ' + x : '') })))) : null;
}
function ruhetagKarte(p, wt, heute) {
  let naechster = null;
  for (let i = 1; i <= 7 && !naechster; i++) { const ti = tagFuer(p, (wt + i) % 7); if (ti >= 0) naechster = { wt: (wt + i) % 7, ti }; }
  return h('section', { class: 'block heute' },
    h('h3', { text: wt === heute ? 'Heute ist Ruhetag' : WOCHENTAGE[wt] + ': Ruhetag' }),
    h('p', { class: 'leise klein', text: 'Erholung gehört zum Training. Schlaf gut, iss genug, beweg dich locker.' }),
    naechster ? h('p', null, 'Nächstes Training: ', h('b', { text: WOCHENTAGE[naechster.wt] + ' · T' + (naechster.ti + 1) + ' ' + p.t[naechster.ti].n })) : null,
    naechster ? h('button', { class: 'knopf', type: 'button', onclick: () => { S.tagWahl = naechster.wt; zeichne(); }, text: 'Training ansehen' }) : null);
}
// Große Muskeln an zwei Tagen direkt hintereinander? Dann ein Tipp (wie in der Trainer-Seite)
const GROSSE_MUSKELN = ['brust', 'lat', 'oberer_ruecken', 'quadrizeps', 'beinbeuger', 'gesaess'];
function tageZuNah(p) {
  const tage = kundenTage(p).slice(0, p.t.length), nah = [];
  const muskeln = (t) => { const m = {}; t.u.forEach((roh) => ((UEBUNGEN[roh.i] || {}).m || []).forEach((x) => { if (GROSSE_MUSKELN.includes(x)) m[x] = 1; })); return m; };
  tage.forEach((wt, i) => {
    const morgen = tage.indexOf((wt + 1) % 7);
    if (morgen < 0) return;
    const a = muskeln(p.t[i]), b = muskeln(p.t[morgen]);
    if (Object.keys(a).some((m) => b[m])) nah.push(WOCHENTAGE[wt].slice(0, 2) + '/' + WOCHENTAGE[(wt + 1) % 7].slice(0, 2));
  });
  return nah;
}
function trainingstageBlock(p) {
  const tage = kundenTage(p), n = p.t.length, nah = tageZuNah(p);
  function setze(i, an) {
    const neu = kundenTage(p).filter((x) => x !== i);
    if (an) neu.push(i);
    speicher.schreib('dk_tage_' + p.id, neu.sort());
    zeichne();
  }
  return h('section', { class: 'block', id: 'trainingstage' }, h('h2', { text: 'Deine Trainingstage' }),
    h('p', { class: 'leise klein', text: 'Dein Plan hat ' + n + ' Trainingstag' + (n === 1 ? '' : 'e') + ' pro Woche. Wähle, an welchen Tagen du trainierst. Das merkt sich nur dein Handy.' }),
    h('div', { class: 'optionen' }, WOCHENTAGE.map((w, i) => h('label', null,
      h('input', { type: 'checkbox', checked: tage.includes(i), 'aria-label': w, onchange: (e) => setze(i, e.target.checked) }), h('span', { text: w.slice(0, 2) })))),
    tage.length && tage.length < n ? h('p', { class: 'klein', text: 'Noch ' + (n - tage.length) + ' Tag(e) wählen, dann hat jeder Trainingstag seinen Platz.' }) : null,
    tage.length > n ? h('p', { class: 'klein', text: 'Du hast mehr Tage gewählt, als dein Plan hat. Die letzten bleiben frei.' }) : null,
    nah.length ? h('p', { class: 'klein', text: 'Tipp: ' + nah.join(', ') + ' trainieren dieselben großen Muskeln. Besser einen Tag Pause dazwischen.' }) : null,
    tage.length ? h('ul', { class: 'klein' }, tage.slice(0, n).map((i, k) => h('li', null, h('b', { text: WOCHENTAGE[i] + ': ' }), 'T' + (k + 1) + ' · ' + p.t[k].n))) : null);
}

/* ---------- Plan ---------- */
function ansichtPlan() {
  const p = S.plan, jetzt = aktuelleWoche(p);
  const teile = [kopf([ZIEL[p.z] || p.z, p.l ? 'Level ' + p.l : '', p.s].filter(Boolean).join(' · '))];
  if (p.ki) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Vom Coach' }), h('p', { class: 'ki-text', text: p.ki })));
  p.t.forEach((t, ti) => teile.push(tagBlock(p, t, ti)));
  if ((p.w && p.w.length) || p.pr || p.dl) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wochen' }),
    p.w && p.w.length ? h('div', { class: 'wochen' }, p.w.map((ph, i) => h('div', { class: 'woche ' + (PHASE[ph] || PHASE.a)[0] + (i === jetzt ? ' jetzt' : ''), 'aria-current': i === jetzt ? 'step' : null },
      h('b', { text: 'W' + (i + 1) }), h('small', { text: (PHASE[ph] || PHASE.a)[1] })))) : null,
    p.pr ? h('div', { class: 'stapel' }, h('h3', { text: 'So steigerst du' }), h('p', { text: p.pr })) : null,
    p.dl ? h('p', { class: 'klein' }, h('b', { text: 'Entlastungswoche: ' }), p.dl) : null));
  if (p.h && p.h.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wichtig für dich' }), h('ul', null, p.h.map((x) => h('li', { text: x })))));
  if (p.sh || (p.ab && p.ab.length) || (p.ar && p.ar.length)) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Sicherheit' }),
    p.sh ? h('p', { text: p.sh }) : null,
    p.ab && p.ab.length ? h('div', null, h('b', { class: 'klein', text: 'Sofort aufhören bei:' }), h('ul', { class: 'klein' }, p.ab.map((x) => h('li', { text: x })))) : null,
    (p.ar || []).map((r) => h('p', { class: 'klein' }, h('b', { text: r.t + ': ' }), r.x))));
  teile.push(trainingstageBlock(p));
  teile.push(h('p', { class: 'leise klein', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + '. Gespeichert auf diesem Handy, läuft auch ohne Internet. Neuer Link von Devin = neuer Stand.' }));
  return teile;
}
function tagBlock(p, t, ti) {
  const sek = t.u.some((roh) => istSek(uebung(roh)));
  return h('section', { class: 'block', id: 'tag-' + (ti + 1) },
    h('div', { class: 'tag-kopf' }, h('span', { class: 'nr', text: 'T' + (ti + 1) }), h('h3', { text: t.n }), t.m ? h('span', { class: 'leise klein zahl', text: '~' + t.m + ' min' }) : null),
    aufwaermen(t),
    h('div', { class: 'tabelle-wrap' }, h('table', { class: 'ueb' },
      h('thead', null, h('tr', null, ['Übung', 'Sätze', sek ? 'Wdh / Zeit' : 'Wdh', 'RIR', 'Pause'].map((x) => h('th', { text: x })))),
      h('tbody', null, t.u.map((roh) => {
        const u = uebung(roh);
        return h('tr', null,
          h('td', null, h('button', { class: 'ueb-name', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u, ti), text: anzeigeName(u) }),
            u.notiz ? h('div', { class: 'notiz', text: u.notiz }) : null),
          h('td', { class: 'z', 'data-l': 'Sätze', text: satzZahl(p, u) }), h('td', { class: 'z', 'data-l': istSek(u) ? 'Zeit' : 'Wdh', text: bereich(u.wdh, istSek(u) ? 'sek' : '') }),
          h('td', { class: 'z', 'data-l': 'RIR', text: bereich(u.rir) }), h('td', { class: 'z', 'data-l': 'Pause', text: u.pause.length ? pauseText(u) : '' }));
      })))),
    h('div', { class: 'aktionen' }, startKnopf(p, ti, 'Diese Einheit starten')));
}

/* ---------- Übungen ---------- */
function ansichtUebungen() {
  const p = S.plan, gesehen = new Set(), liste = [];
  p.t.forEach((t) => t.u.forEach((roh) => { const k = roh.i + (roh.nm || ''); if (!gesehen.has(k)) { gesehen.add(k); liste.push(uebung(roh)); } }));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Übungen' }), h('p', { class: 'leise', text: 'Tippe auf eine Übung: Die Figur zeigt dir die Bewegung in 3D. Mit dem Finger drehst du sie rundum, „Coach DK erklärt“ zeigt dir, worauf es ankommt.' })),
    h('div', { class: 'stapel' }, liste.map((u) => h('button', { class: 'eintrag mit3d', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u) },
      h('span', { class: 'mini3d' + (u.d.a ? '' : ' ohne'), 'aria-hidden': 'true', 'data-vorschau': u.d.a ? u.id : '' }, u.d.a ? '' : '–'),
      h('b', { text: anzeigeName(u) }),
      h('span', { class: 'leise klein', text: (u.d.m || []).map((m) => MUSKEL[m] || m).join(', ') || 'Eigene Übung' }))))];
}

/* ---------- Infos ---------- */
let installEreignis = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEreignis = e; zeichne(); });
// Anleitung: als App auf den Home-Bildschirm (bis der Kunde sie wegtippt; unter Infos immer)
function installKarte(immer) {
  if (installiert() || (!immer && speicher.lies('dk_install_weg', false))) return null;
  const ua = navigator.userAgent || '', ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
  const iphone = ['Öffne den Link in Safari, nicht in WhatsApp.', 'Tippe unten auf Teilen (Viereck mit Pfeil nach oben).', 'Wähle „Zum Home-Bildschirm“ und nenne es „DK Coach“.',
    'Öffne DK Coach vom Home-Bildschirm und gib deinen Code dort noch einmal ein (das iPhone trennt App und Safari).'];
  const andro = ['Öffne den Link in Chrome, nicht in WhatsApp.', 'Tippe oben rechts auf ⋮.', 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'];
  const liste = (titel, schritte) => h('div', null, titel ? h('b', { class: 'klein', text: titel }) : null, h('ol', { class: 'klein' }, schritte.map((s) => h('li', { text: s }))));
  return h('section', { class: 'block' }, h('h2', { text: 'Als App aufs Handy' }),
    h('p', { class: 'leise klein', text: 'Dann öffnest du deinen Plan mit einem Tipp vom Home-Bildschirm, auch ohne Internet.' }),
    installEreignis ? h('button', { class: 'knopf haupt', type: 'button', onclick: async () => { installEreignis.prompt(); await installEreignis.userChoice; installEreignis = null; zeichne(); }, text: 'App installieren' })
      : ios ? liste('', iphone) : android ? liste('', andro) : [liste('iPhone', iphone), liste('Android', andro)],
    !immer ? h('button', { class: 'knopf klein', type: 'button', onclick: () => { speicher.schreib('dk_install_weg', true); zeichne(); }, text: 'Erledigt, ausblenden' }) : null);
}
function ansichtInfo() {
  const p = S.plan, ko = aktivesKonto(), mitZugang = ko && ko.id === p.id;
  const plaene = Object.values(speicher.lies('dk_plaene', {}));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Infos' })),
    mitZugang ? h('section', { class: 'block' }, h('h2', { text: 'Dein Zugang' }),
      h('p', { class: 'klein', text: 'Eingeloggt als ' + (ko.n || 'Kunde') + (ko.bis ? ' · bis ' + datumDe(ko.bis) + (tageBis(ko) >= 0 ? ' (noch ' + tageBis(ko) + (tageBis(ko) === 1 ? ' Tag)' : ' Tage)') : '') : ' · ohne Ablauf') }),
      h('p', { class: 'leise klein', text: 'Neuer Link von Devin? Einfach öffnen, der Code ist gespeichert. In der App vom Home-Bildschirm: Nachricht kopieren und hier einfügen.' }),
      einfuegenBlock('Neuen Link einfügen'),
      h('button', { class: 'knopf klein', type: 'button', onclick: abmelden, text: 'Abmelden' })) : null,
    installKarte(true),
    h('section', { class: 'block' }, h('h2', { text: 'Begriffe' }),
      h('p', { class: 'klein', text: 'Reserve (RIR): Wiederholungen, die du am Ende des Satzes noch schaffen würdest. RIR 2 heißt: aufhören, wenn noch zwei gehen würden.' }),
      h('p', { class: 'klein', text: 'Pause: Zeit zwischen zwei Sätzen. Im Training läuft sie als Ring und geht danach von selbst weiter.' }),
      h('p', { class: 'klein', text: 'Coach DK erklärt: Knopf auf jeder 3D-Figur. Die Figur hält an der wichtigen Stelle an und zeigt dir, worauf du achten musst.' })),
    h('section', { class: 'block' }, h('h2', { text: 'Gespeichert' }),
      h('p', { class: 'klein leise', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + ' · nur auf diesem Handy · Übungsdaten Stand ' + new Date(STAND).toLocaleDateString('de-DE') }),
      plaene.length > 1 ? h('div', { class: 'reihe' }, plaene.map((x) => h('button', { class: 'knopf klein', type: 'button', onclick: () => {
        speicher.schreib('dk_aktiv', x.id); if (konten()[x.id]) speicher.schreib('dk_konto', x.id); S.tagWahl = null; zeichne();
      }, text: (x.id === p.id ? '✓ ' : '') + (x.n || 'Plan') + (x.s ? ' · ' + x.s : '') }))) : null,
      !mitZugang ? einfuegenBlock('Neuen Link einfügen') : null,
      !mitZugang ? h('button', { class: 'knopf klein', type: 'button', onclick: planLoeschen, text: 'Diesen Plan vom Handy löschen' }) : null)];
}
// Abmelden: Zugang, Plan und Analyse-Entwurf gehen vom Handy (Devin kann jederzeit einen neuen Link schicken)
function abmelden(e) {
  const b = e.currentTarget;
  if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich abmelden? Nochmal tippen'; return; }
  const ko = aktivesKonto(), alle = konten(), plaene = speicher.lies('dk_plaene', {});
  delete alle[ko.id]; delete plaene[ko.id];
  speicher.schreib('dk_konten', alle); speicher.schreib('dk_plaene', plaene); speicher.schreib(entwurfKey(ko), null);
  speicher.schreib('dk_konto', Object.keys(alle)[0] || null); speicher.schreib('dk_aktiv', Object.keys(plaene)[0] || null);
  EN = null; S.tagWahl = null; S.ansicht = 'heute'; zeichne(); window.scrollTo(0, 0);
}
function planLoeschen(e) {
  const b = e.currentTarget;
  if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich löschen? Nochmal tippen'; return; }
  const plaene = speicher.lies('dk_plaene', {}); delete plaene[S.plan.id]; speicher.schreib('dk_plaene', plaene);
  speicher.schreib('dk_aktiv', Object.keys(plaene)[0] || null); S.tagWahl = null; zeichne();
}

/* ---------- 3D ---------- */
let modul3d = null;
// Den echten Körper gleich mitladen (Texturen inklusive); klappt das nicht, zeigt die Bühne die gebaute Figur
function lade3d() {
  if (!modul3d) modul3d = Promise.all([import('./figur.js'), import('./bewegungen.js'), import('./figur-modell.js').then((m) => m.ladeKoerper()).catch(() => null)])
    .then(([f, b]) => ({ ...f, ...b }), (e) => { modul3d = null; throw e; });
  return modul3d;
}
function fotoGross(src) {
  const zu = () => { el.remove(); document.removeEventListener('keydown', taste); };
  const taste = (e) => { if (e.key === 'Escape') zu(); };
  const el = h('div', { class: 'foto-gross', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'So macht’s Devin' },
    h('div', { class: 'zu-reihe' }, h('button', { class: 'zu-rund', type: 'button', 'aria-label': 'Schließen', onclick: zu, text: '✕' })),
    h('img', { src, alt: 'Devin zeigt die Übung', onclick: zu }), h('p', { text: 'So macht’s Devin' }));
  document.body.append(el); document.addEventListener('keydown', taste);
}
// Fotos der Plan-Übungen einmal laden: Der Offline-Speicher behält sie, so sind sie auch ohne Netz im Gym da
function fotosVorladen() {
  if (!S.plan || navigator.onLine === false) return;
  const pfade = new Set();
  for (const t of S.plan.t || []) for (const x of t.u || []) { const d = UEBUNGEN[x.i]; if (d && d.b) pfade.add(d.b); }
  if (pfade.size) setTimeout(() => pfade.forEach((p) => fetch(p).catch(() => {})), 2500);
}

/* ---------- Blatt von unten (wie in der Trainer-Seite): Übung mit 3D-Figur ---------- */
let BLATT = null;
function oeffneBlatt(titel, unter, inhalt, beimSchliessen) {
  const eintrag = BLATT && BLATT.eintrag;   // Zurück-Taste: ein Eintrag im Verlauf pro offenem Blatt
  schliesseBlatt(true, true);
  const vorher = document.activeElement;
  const hg = h('div', { class: 'blatt-hg', onclick: () => schliesseBlatt() });
  const zu = h('button', { class: 'blatt-zu', type: 'button', 'aria-label': 'Schließen', text: '✕', onclick: () => schliesseBlatt() });
  const griff = h('div', { class: 'blatt-griff', 'aria-hidden': 'true' }, h('i'));
  const kopfEl = h('div', { class: 'blatt-kopf' }, h('h2', { id: 'blatt-titel', text: titel }), zu, unter ? h('div', { class: 'unter', text: unter }) : null);
  const el = h('div', { class: 'blatt', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'blatt-titel' }, griff, kopfEl, h('div', { class: 'blatt-inhalt' }, inhalt));
  document.body.append(hg, el);
  document.body.style.overflow = 'hidden';
  if (!eintrag) history.pushState({ blatt: 1 }, '');
  BLATT = { el, hg, vorher, beimSchliessen, eintrag: true };
  void el.offsetHeight;
  hg.classList.add('offen'); el.classList.add('offen');
  setTimeout(() => { try { zu.focus({ preventScroll: true }); } catch (e) { zu.focus(); } }, 60);
  // Nach unten ziehen schließt
  let start = null, dy = 0;
  const runter = (e) => { start = e.clientY; dy = 0; el.style.transition = 'none'; try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const zieh = (e) => { if (start === null) return; dy = Math.max(0, e.clientY - start); el.style.transform = 'translateY(' + dy + 'px)'; };
  const los = () => { if (start === null) return; start = null; el.style.transition = ''; el.style.transform = ''; if (dy > 90) schliesseBlatt(); };
  [griff, kopfEl].forEach((x) => {
    x.addEventListener('pointerdown', (e) => { if (e.target.closest('.blatt-zu')) return; runter(e); });
    x.addEventListener('pointermove', zieh); x.addEventListener('pointerup', los); x.addEventListener('pointercancel', los);
  });
}
// sofort: ohne Ausblenden; ohneZurueck: der Verlaufseintrag bleibt (neues Blatt übernimmt ihn oder er ist schon weg)
function schliesseBlatt(sofort, ohneZurueck) {
  if (!BLATT) return;
  const b = BLATT; BLATT = null;
  if (b.beimSchliessen) b.beimSchliessen();
  document.body.style.overflow = TM.el ? 'hidden' : '';
  b.el.classList.remove('offen'); b.hg.classList.remove('offen');
  const weg = () => { b.el.remove(); b.hg.remove(); };
  if (sofort) weg(); else setTimeout(weg, 420);
  if (!ohneZurueck && b.eintrag) { ZURUECK_LEISE = true; history.back(); }
  if (b.vorher && b.vorher.isConnected) { try { b.vorher.focus({ preventScroll: true }); } catch (e) {} }
}
let ZURUECK_LEISE = false;
window.addEventListener('popstate', () => {
  if (ZURUECK_LEISE) { ZURUECK_LEISE = false; return; }
  if (BLATT) { BLATT.eintrag = false; schliesseBlatt(false, true); return; }
  if (TM.el && LAUF && LAUF.phase !== 'fertig') { history.pushState({ training: 1 }, ''); TM.frage = true; timerZeigen(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') schliesseBlatt(); });
document.addEventListener('touchstart', () => {}, { passive: true });   // iOS: sonst greift :active (Antipp-Effekt) nicht

function oeffneUebung(u, ti) {
  const d = u.d, p = S.plan;
  const b = buehne({ lade3d, fotoGross });
  const muskeln = (d.m || []).map((m) => MUSKEL[m] || m).join(', ');
  const abschnitt = (titel, liste) => liste && liste.length ? h('div', { class: 'blatt-abschnitt' }, h('b', { text: titel }), h('ul', null, liste.map((x) => h('li', { text: x })))) : null;
  oeffneBlatt(anzeigeName(u), [ti != null ? 'T' + (ti + 1) + ' · ' + p.t[ti].n : '', muskeln].filter(Boolean).join(' · '), [
    b.el,
    u.saetze ? h('div', { class: 'blatt-werte' },
      h('span', { class: 'chip', text: satzZahl(p, u) + ' Sätze' }), h('span', { class: 'chip', text: dosis(u) }),
      u.rir ? h('span', { class: 'chip', text: 'RIR ' + bereich(u.rir) }) : null, u.pause.length ? h('span', { class: 'chip', text: pauseText(u) + ' Pause' }) : null) : null,
    u.notiz ? h('p', { class: 'notiz', text: u.notiz }) : null,
    abschnitt('So geht’s', d.t), abschnitt('Typische Fehler', d.f),
    d.v && d.v.length ? h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Vorsicht' }), h('p', { text: d.v.join(' ') })) : null
  ], () => b.weg());
  b.zeige(d);
}

/* ---------- Training: Satz für Satz mit 3D-Figur, Pause als Ring (wie der Timer der Trainer-Seite) ---------- */
// Ergebnis-Text und Code „DK-Lauf:…:Ende“ sind gleich wie in der Trainer-Seite: Devin fügt sie dort beim Kunden ein.
const LAUF_KEY = 'dk_lauf', VERLAUF_KEY = 'dk_verlauf';
let LAUF = speicher.lies(LAUF_KEY, null);
const TM = { el: null, frage: false, wach: null, buehne: null, gezeigt: null };
const laufSichern = () => speicher.schreib(LAUF_KEY, LAUF);
function mmss(sek) {
  sek = Math.max(0, Math.round(sek || 0));
  const st = Math.floor(sek / 3600), m = Math.floor(sek % 3600 / 60), s = sek % 60;
  return (st ? st + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (s < 10 ? '0' : '') + s;
}
const datumZeit = (ms) => new Date(ms).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
let AUDIO = null;
function piep(n) {
  try {
    AUDIO = AUDIO || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < (n || 2); i++) {
      const o = AUDIO.createOscillator(), g = AUDIO.createGain(), t0 = AUDIO.currentTime + i * 0.22;
      o.frequency.value = 880; o.connect(g); g.connect(AUDIO.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.18);
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) {}
}
function wach(an) {
  try {
    if (an && navigator.wakeLock && !TM.wach) navigator.wakeLock.request('screen').then((l) => { TM.wach = l; l.addEventListener('release', () => { TM.wach = null; }); }, () => {});
    if (!an && TM.wach) { TM.wach.release(); TM.wach = null; }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && LAUF && LAUF.phase !== 'fertig') { wach(true); timerTick(); } });

function startKnopf(p, ti, text) {
  if (LAUF && LAUF.phase !== 'fertig') return h('button', { class: 'knopf haupt', type: 'button', onclick: timerZeigen, text: 'Training läuft · fortsetzen' });
  return h('button', { class: 'knopf haupt', type: 'button', onclick: () => laufStarten(p, ti), text: text || 'Training starten' });
}
function laufStarten(p, ti) {
  const jetzt = Date.now(), t = p.t[ti];
  LAUF = { v: 1, plan: p.id, kunde: p.n || '', tagNr: ti + 1, tagName: t.n, start: jetzt, ue: 0, satz: 0, phase: 'satz', seit: jetzt, pauseZiel: 0,
    uebungen: t.u.map((roh) => {
      const u = uebung(roh), pz = u.pause;
      return { id: u.id, name: anzeigeName(u), saetze: Math.max(1, +satzZahl(p, u) || 1), dosis: dosis(u), sek: istSek(u),
        rir: u.rir ? bereich(u.rir) : '', pauseMin: pz.length ? auf15(pz[0]) : 60, pauseMax: pz.length ? auf15(pz[pz.length - 1]) : 90,
        tipp: (u.d.t || [])[0] || '', vorsicht: (u.d.v || [])[0] || '', log: [] };
    }) };
  TM.frage = false;
  laufSichern(); piep(1); wach(true); timerZeigen();
}
const aktUe = () => LAUF.uebungen[LAUF.ue];
const letzterSatz = () => LAUF.ue === LAUF.uebungen.length - 1 && LAUF.satz === aktUe().saetze - 1;
function satzFertig() {
  const u = aktUe(), jetzt = Date.now(), vor = u.log[u.log.length - 1];
  u.log.push({ s: LAUF.seit, e: jetzt, kg: vor ? vor.kg : '', wdh: '' });
  if (letzterSatz()) LAUF.phase = 'letzter';
  else {
    LAUF.phase = 'pause'; LAUF.pauseZiel = u.pauseMax;
    LAUF.uebungFertig = LAUF.satz === u.saetze - 1;
    if (LAUF.uebungFertig) LAUF.spruch = spruch(SPRUECHE_UEBUNG);
  }
  LAUF.seit = jetzt;
  laufSichern(); timerZeigen();
  const f = document.getElementById('tm-wdh');
  if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) {} }, 60);
}
function naechsterSatz() {
  const u = aktUe();
  if (LAUF.satz < u.saetze - 1) LAUF.satz++; else { LAUF.ue++; LAUF.satz = 0; }
  LAUF.phase = 'satz'; LAUF.seit = Date.now(); LAUF.uebungFertig = false;
  laufSichern(); piep(2); timerZeigen();
}
function eintragen(feld, wert) {
  const u = aktUe(), s = u.log[u.log.length - 1];
  if (!s) return;
  s[feld] = String(wert).replace(',', '.').replace(/[^0-9.]/g, '');
  laufSichern();
}
const zahlOderNull = (x) => x === '' || x == null || isNaN(+x) ? null : +x;
// Kompaktes Ergebnis: das, was Devin bekommt (gleiches Format wie die Trainer-Seite)
function ergebnis(status) {
  const ende = Date.now(), alle = [];
  LAUF.uebungen.forEach((u) => u.log.forEach((s) => alle.push(s)));
  const ue = LAUF.uebungen.filter((u) => u.log.length).map((u) => ({ n: u.name, sek: u.sek ? 1 : 0, z: u.log.map((s) => {
    const i = alle.indexOf(s), nach = alle[i + 1];
    const pz = nach ? nach.s - s.e : (s === alle[alle.length - 1] && LAUF.phase === 'satz' ? LAUF.seit - s.e : null);
    return [zahlOderNull(s.kg), zahlOderNull(s.wdh), Math.round((s.e - s.s) / 1000), pz != null ? Math.round(pz / 1000) : null];
  }) }));
  return { v: 1, k: LAUF.kunde, t: LAUF.tagNr, tn: LAUF.tagName, s: LAUF.start, e: ende, st: status, u: ue };
}
function laufBeenden(status) {
  const r = ergebnis(status);
  const verlauf = [r].concat(verlaufListe().filter((x) => x.s !== r.s)).slice(0, 40);
  speicher.schreib(VERLAUF_KEY, verlauf);
  // Heute gemachte Übungen abhaken (wenn heute dieser Trainingstag ist)
  const p = S.plan;
  if (p && p.id === LAUF.plan && tagFuer(p, heuteIndex()) === LAUF.tagNr - 1) {
    const ti = LAUF.tagNr - 1, fertig = erledigtLaden(p, ti);
    LAUF.uebungen.forEach((u, i) => { if (u.log.length && fertig.indexOf(i) < 0) fertig.push(i); });
    speicher.schreib(erledigtKey(p, ti), fertig);
  }
  LAUF.phase = 'fertig'; LAUF.ergebnis = r; TM.frage = false;
  laufSichern(); wach(false); timerZeigen();
}
function laufSchliessen() {
  LAUF = null; laufSichern(); wach(false);
  if (TM.buehne) { TM.buehne.weg(); TM.buehne = null; TM.gezeigt = null; }
  if (TM.el) { TM.el.remove(); TM.el = null; }
  document.body.style.overflow = '';
  if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); }
  zeichne();
}
const saetzeGesamt = (r) => r.u.reduce((s, u) => s + u.z.length, 0);
const laufDauer = (r) => Math.round((r.e - r.s) / 1000);
function zuB64(b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function laufAlsText(r) {
  const z = ['DK Training · ' + (r.k || 'Kunde') + ' · T' + r.t + ' ' + r.tn, datumZeit(r.s),
    'Dauer ' + mmss(laufDauer(r)) + ' · ' + saetzeGesamt(r) + ' Sätze' + (r.st === 'abgebrochen' ? ' · vorzeitig beendet' : ''), ''];
  r.u.forEach((u) => {
    z.push(u.n);
    u.z.forEach((s, i) => z.push('  ' + (i + 1) + '. ' + (s[0] != null ? s[0] + ' kg' : '–') + ' × ' + (s[1] != null ? s[1] + (u.sek ? ' s' : '') : '–') +
      ' · Satz ' + mmss(s[2]) + (s[3] != null ? ' · Pause ' + mmss(s[3]) : '')));
  });
  z.push('', 'Code für DK Coach (nicht ändern):', 'DK-Lauf:' + zuB64(new TextEncoder().encode(JSON.stringify(r))) + ':Ende');
  return z.join('\n');
}
function laufTabelle(r) {
  const zeilen = [];
  r.u.forEach((u) => {
    zeilen.push(h('tr', { class: 'ue' }, h('td', { colspan: '4', text: u.n }), h('td', { text: mmss(u.z.reduce((s, x) => s + x[2], 0)) })));
    u.z.forEach((s, i) => zeilen.push(h('tr', null, h('td', { text: String(i + 1) }), h('td', { text: s[0] != null ? String(s[0]).replace('.', ',') : '–' }),
      h('td', { text: s[1] != null ? s[1] + (u.sek ? ' s' : '') : '–' }), h('td', { text: mmss(s[2]) }), h('td', { text: s[3] != null ? mmss(s[3]) : '–' }))));
  });
  return h('div', { class: 'lauf-tab-wrap' }, h('table', { class: 'lauf-tab' },
    h('thead', null, h('tr', null, ['Satz', 'kg', 'Wdh', 'Satz-Zeit', 'Pause'].map((x) => h('th', { text: x })))), h('tbody', null, zeilen)));
}
const verlaufListe = () => speicher.lies(VERLAUF_KEY, []);
function kopieren(text, knopf) {
  const ok = () => { knopf.textContent = 'Kopiert, jetzt an Devin schicken'; };
  try { navigator.clipboard.writeText(text).then(ok, () => { knopf.textContent = 'Kopieren ging nicht'; }); } catch (e) { knopf.textContent = 'Kopieren ging nicht'; }
}
function verlaufBlock() {
  const v = verlaufListe();
  if (!v.length) return null;
  return h('section', { class: 'block' }, h('h2', { text: 'Deine letzten Trainings' }),
    h('p', { class: 'leise klein', text: 'Gespeichert auf diesem Handy. Antippen zum Ansehen und nochmal an Devin schicken.' }),
    h('div', { class: 'laeufe' }, v.slice(0, 8).map((r) => h('button', { class: 'lauf-zeile', type: 'button', onclick: () => laufBlatt(r) },
      h('b', { text: 'T' + r.t + ' · ' + r.tn }), h('span', { class: 'zahl', text: mmss(laufDauer(r)) }),
      h('span', { class: 'leise klein', text: datumZeit(r.s) + ' · ' + saetzeGesamt(r) + ' Sätze' + (r.st === 'abgebrochen' ? ' · vorzeitig beendet' : '') })))));
}
function laufBlatt(r) {
  const knopf = h('button', { class: 'knopf', type: 'button', onclick: () => kopieren(laufAlsText(r), knopf), text: 'Text für Devin kopieren' });
  oeffneBlatt('T' + r.t + ' · ' + r.tn, datumZeit(r.s), [h('div', { class: 'blatt-werte' }, h('span', { class: 'chip', text: 'Dauer ' + mmss(laufDauer(r)) }),
    h('span', { class: 'chip', text: saetzeGesamt(r) + ' Sätze' }), r.st === 'abgebrochen' ? h('span', { class: 'chip', text: 'vorzeitig beendet' }) : null), laufTabelle(r), knopf]);
}
// Letztes Mal: aus den gespeicherten Trainings, sonst aus der alten Satz-Liste (App bis 28.10.)
function letztesMal(u, satz) {
  for (const r of verlaufListe()) {
    const alt = r.u.find((x) => x.n === u.name);
    if (alt && alt.z.length) return alt.z[Math.min(satz, alt.z.length - 1)];
  }
  const log = speicher.lies('dk_log', {});
  for (const d of Object.keys(log).sort().reverse()) { const v = log[d].kg && log[d].kg[u.id]; if (v) return [+v, null]; }
  return null;
}

const SPRUECHE_UEBUNG = [
  'Abgehakt. Die nächste wartet schon.', 'Sauber. Genau so wächst was.', 'Das war ehrliche Arbeit.', 'Stein auf Stein. Genau so.', 'Nicht geredet, gemacht.',
  'Technik vor Ego. Hast du gut gemacht.', 'Jeder Satz zählt. Der hier auch.', 'Durchgezogen. Respekt.', 'So sieht Dranbleiben aus.',
  'Die Übung ist erledigt. Du noch lange nicht.', 'Kurz durchatmen. Dann weiter.', 'Saubere Wiederholungen schlagen schwere Ausreden.',
  'Stark. Genau dafür bist du heute gekommen.', 'Ein Baustein mehr. Weiter bauen.', 'Fokus gehalten. Weiter so.'
];
const SPRUECHE_ENDE = [
  'Training erledigt. Der schwerste Teil war, anzufangen.', 'Heute hast du dir selbst was bewiesen.', 'Fertig. Jetzt essen, schlafen, wiederkommen.',
  'Das war deins. Das nimmt dir keiner mehr.', 'Wieder ein Tag, an dem du nicht gekniffen hast.', 'Ehrlich trainiert, Schritt für Schritt. So geht Natural.',
  'Ab unter die Dusche. Hast du dir verdient.'
];
const SPRUCH_KURZ = 'Heute war es kürzer. Zählt trotzdem: Du warst da.';
function spruch(liste) {
  LAUF.gesagt = LAUF.gesagt || [];
  let frei = liste.filter((s) => LAUF.gesagt.indexOf(s) < 0);
  if (!frei.length) { LAUF.gesagt = []; frei = liste; }
  const s = frei[Math.floor(Math.random() * frei.length)];
  LAUF.gesagt.push(s);
  return s;
}
const HAKEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const RING_U = 2 * Math.PI * 54;
function ring(id, inhalt, klasse) {
  const w = h('div', { class: 'tm-ring ' + (klasse || '') });
  w.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="tm-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--verlauf-a)"/><stop offset="1" style="stop-color:var(--verlauf-b)"/></linearGradient></defs>' +
    '<circle cx="60" cy="60" r="54" class="tm-ring-bahn"/><circle cx="60" cy="60" r="54" class="tm-ring-fort" id="' + id + '" stroke-dasharray="' + RING_U + '" stroke-dashoffset="' + RING_U + '"/></svg>';
  w.append(h('div', { class: 'tm-ring-mitte' }, inhalt));
  return w;
}
function satzPunkte(u, aktiv) {
  const p = [];
  for (let i = 0; i < u.saetze; i++) p.push(h('i', { class: i < u.log.length ? 'an' : (i === aktiv ? 'jetzt' : null) }));
  return h('div', { class: 'tm-punkte', 'aria-hidden': 'true' }, p);
}
function besterSatz(u) {
  let b = null;
  u.log.forEach((s) => {
    const kg = zahlOderNull(s.kg), w = zahlOderNull(s.wdh);
    if (kg == null && w == null) return;
    if (!b || (kg || 0) > (b.kg || 0) || ((kg || 0) === (b.kg || 0) && (w || 0) > (b.w || 0))) b = { kg, w };
  });
  return b;
}
function timerZeigen() {
  if (!LAUF) return;
  if (!TM.el) {
    TM.el = h('div', { class: 'tm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Training' }); document.body.append(TM.el);
    if (!(history.state && history.state.training)) history.pushState({ training: 1 }, '');
  }
  document.body.style.overflow = 'hidden';
  const el = TM.el; el.textContent = '';
  el.append(h('div', { class: 'tm-in' }, LAUF.phase === 'fertig' ? timerFertig() : timerLaeuft()));
  const stelle = LAUF.phase + ':' + LAUF.ue + ':' + LAUF.satz;
  if (TM.stelle !== stelle) { TM.stelle = stelle; el.scrollTop = 0; }
  timerTick();
}
// Die Bühne bleibt über alle Sätze dieselbe (eine 3D-Ansicht), nur die Übung wechselt
function trainingsBuehne(u) {
  if (!TM.buehne) TM.buehne = buehne({ lade3d, fotoGross });
  const d = UEBUNGEN[u.id] || { n: u.name, m: [] };
  if (TM.gezeigt !== u.id) { TM.gezeigt = u.id; TM.buehne.zeige(d); }
  return TM.buehne.el;
}
function timerLaeuft() {
  const u = aktUe(), pause = LAUF.phase === 'pause', letzter = LAUF.phase === 'letzter';
  const gesamt = LAUF.uebungen.reduce((s, x) => s + x.saetze, 0);
  const erledigt = LAUF.uebungen.reduce((s, x) => s + x.log.length, 0);
  const fort = []; for (let i = 0; i < gesamt; i++) fort.push(h('i', { class: i < erledigt ? 'an' : (i === erledigt && !pause && !letzter ? 'jetzt' : null) }));
  const teile = [
    h('div', { class: 'tm-kopf' }, h('div', { class: 'marke', text: 'T' + LAUF.tagNr + ' · ' + LAUF.tagName }), h('div', { class: 'tm-gesamt' }, h('span', { id: 'tm-gesamt', text: mmss((Date.now() - LAUF.start) / 1000) }))),
    h('div', { class: 'tm-fort', 'aria-label': erledigt + ' von ' + gesamt + ' Sätzen' }, fort)
  ];
  const feier = pause && LAUF.uebungFertig;
  if (feier) {
    const b = besterSatz(u), haken = h('div', { class: 'tm-haken', html: HAKEN });
    teile.push(h('div', { class: 'tm-feier' }, haken,
      h('small', { text: 'Übung geschafft' }),
      h('p', { class: 'tm-spruch', text: LAUF.spruch || '' }),
      h('span', { class: 'tm-von', text: 'Devin' }),
      h('p', { class: 'tm-mini', text: u.name + ' · ' + u.log.length + ' Sätze' + (b ? ' · bester Satz ' + (b.kg != null ? String(b.kg).replace('.', ',') + ' kg' : '') + (b.w != null ? (b.kg != null ? ' × ' : '') + b.w + (u.sek ? ' s' : ' Wdh') : '') : '') })));
  } else {
    teile.push(h('div', { class: 'tm-titel' }, h('p', { class: 'leise klein', text: 'Übung ' + (LAUF.ue + 1) + ' von ' + LAUF.uebungen.length }),
      h('h1', { class: 'tm-name', text: u.name }), satzPunkte(u, pause || letzter ? -1 : LAUF.satz)));
    teile.push(h('div', { class: 'tm-werte' },
      h('div', null, h('small', { text: 'Satz' }), h('b', { text: Math.min(LAUF.satz + 1, u.saetze) + ' / ' + u.saetze })),
      h('div', null, h('small', { text: u.sek ? 'Halten' : 'Ziel' }), h('b', { text: u.dosis })),
      h('div', null, h('small', { text: u.rir ? 'Reserve' : 'Pause' }), h('b', { text: u.rir ? u.rir + ' Wdh' : mmss(u.pauseMax) }))));
  }
  if (pause || letzter) {
    const s = u.log[u.log.length - 1];
    const kg = h('input', { class: 'eingabe', id: 'tm-kg', inputmode: 'decimal', autocomplete: 'off', placeholder: '–', value: s.kg, 'aria-label': 'Gewicht in kg', oninput: (e) => eintragen('kg', e.target.value) });
    const wdh = h('input', { class: 'eingabe', id: 'tm-wdh', inputmode: 'numeric', autocomplete: 'off', placeholder: '–', value: s.wdh, 'aria-label': u.sek ? 'Gehalten in Sekunden' : 'Wiederholungen', oninput: (e) => eintragen('wdh', e.target.value) });
    if (pause) teile.push(ring('tm-ring', [h('small', { text: 'Pause' }), h('div', { class: 'tm-zeit', id: 'tm-uhr', text: mmss(LAUF.pauseZiel) })], 'pause'));
    else teile.push(h('div', { class: 'tm-feier' }, h('div', { class: 'tm-haken', html: HAKEN }), h('small', { text: 'Letzter Satz geschafft' }), h('p', { class: 'tm-mini', text: 'Trag ihn noch ein, dann bist du durch.' })));
    teile.push(h('div', { class: 'tm-karte' }, h('small', { class: 'tm-label', text: 'Satz ' + u.log.length + (feier || letzter ? ' · ' + u.name : '') + ' eintragen' }),
      h('div', { class: 'tm-eingabe' }, h('label', null, kg, h('span', { text: 'kg' })), h('label', null, wdh, h('span', { text: u.sek ? 'Sekunden' : 'Wdh' })))));
    if (pause) {
      const nu = LAUF.satz < u.saetze - 1 ? { u, s: LAUF.satz + 2 } : { u: LAUF.uebungen[LAUF.ue + 1], s: 1 };
      teile.push(h('div', { class: 'tm-zwei' },
          h('button', { class: 'knopf', type: 'button', onclick: () => { LAUF.pauseZiel = Math.max(0, LAUF.pauseZiel - 30); laufSichern(); timerTick(); }, text: '− 30 s' }),
          h('button', { class: 'knopf', type: 'button', onclick: () => { LAUF.pauseZiel += 30; laufSichern(); timerTick(); }, text: '+ 30 s' })),
        h('div', { class: 'tm-karte tm-naechste' + (nu.s === 1 ? ' neu' : '') },
          h('small', { class: 'tm-label', text: nu.s === 1 ? 'Als Nächstes' : 'Gleich' }),
          h('b', { text: nu.u.name }),
          h('span', { class: 'leise klein', text: nu.s === 1 ? nu.u.saetze + ' Sätze · ' + nu.u.dosis : 'Satz ' + nu.s + ' von ' + nu.u.saetze + ' · ' + nu.u.dosis })),
        h('p', { class: 'tm-tipp tm-mitte', text: 'Pause laut Plan ' + mmss(u.pauseMin) + (u.pauseMin !== u.pauseMax ? ' bis ' + mmss(u.pauseMax) : '') + '. Danach geht es von selbst weiter.' }),
        h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: naechsterSatz, text: 'Bereit · weiter' }));
    } else teile.push(h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: () => laufBeenden('fertig'), text: 'Training abschließen' }));
  } else {
    // Satz läuft: die Figur zeigt die Übung, darunter die Satz-Uhr; ohne Figur (eigene Übung) der Ring wie in der Trainer-Seite
    if ((UEBUNGEN[u.id] || {}).a) teile.push(trainingsBuehne(u), h('div', { class: 'tm-satzuhr' }, h('small', { text: 'Satz ' + (LAUF.satz + 1) + ' läuft' }), h('b', { class: 'zahl', id: 'tm-uhr', text: '0:00' })));
    else teile.push(ring('tm-ring', [h('small', { text: 'Satz ' + (LAUF.satz + 1) }), h('div', { class: 'tm-zeit', id: 'tm-uhr', text: '0:00' })], 'satz'));
    const vor = letztesMal(u, LAUF.satz), info = [];
    if (vor) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Letztes Mal ' }), (vor[0] != null ? String(vor[0]).replace('.', ',') + ' kg' : '–') + ' × ' + (vor[1] != null ? vor[1] + (u.sek ? ' s' : '') : '–')));
    if (u.tipp) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Technik ' }), u.tipp));
    if (u.vorsicht) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Vorsicht ' }), u.vorsicht));
    teile.push(h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: satzFertig, text: 'Satz fertig' }));
    if (info.length) teile.push(h('div', { class: 'tm-karte' }, info));
  }
  if (TM.frage) teile.push(h('div', { class: 'tm-frage' }, h('p', { text: 'Training jetzt beenden? Die fertigen Sätze bleiben gespeichert.' }),
    h('div', { class: 'tm-zwei' }, h('button', { class: 'knopf', type: 'button', onclick: () => { TM.frage = false; timerZeigen(); }, text: 'Weitermachen' }),
      h('button', { class: 'knopf', type: 'button', style: 'border-color:var(--stopp);color:var(--stopp)', onclick: () => laufBeenden('abgebrochen'), text: 'Beenden' }))));
  else teile.push(h('button', { class: 'knopf text tm-ende', type: 'button', onclick: () => { TM.frage = true; timerZeigen(); }, text: 'Training vorzeitig beenden' }));
  return teile;
}
function timerFertig() {
  const r = LAUF.ergebnis, text = laufAlsText(r);
  if (!LAUF.endSpruch) { LAUF.endSpruch = r.st === 'abgebrochen' ? SPRUCH_KURZ : spruch(SPRUECHE_ENDE); laufSichern(); }
  const feld = h('textarea', { class: 'eingabe', readonly: true, 'aria-label': 'Text für Devin', style: 'min-height:110px;font-family:var(--f-zahl);font-size:12px', text });
  const knopf = h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: () => {
    const fertig = () => { knopf.textContent = 'Kopiert'; };
    try { navigator.clipboard.writeText(text).then(fertig, () => { feld.select(); knopf.textContent = 'Text markiert, jetzt kopieren'; }); } catch (x) { feld.select(); }
  }, text: 'Text kopieren' });
  return [
    h('div', { class: 'tm-kopf' }, h('div', { class: 'marke', text: 'DK COACH' }), h('div', { class: 'tm-gesamt', text: datumZeit(r.s) })),
    h('div', { class: 'tm-feier tm-schluss' }, h('div', { class: 'tm-haken gross', html: HAKEN }),
      h('h1', { class: 'tm-name', text: r.st === 'abgebrochen' ? 'Für heute Schluss' : 'Geschafft' }),
      h('p', { class: 'tm-spruch', text: LAUF.endSpruch }),
      h('span', { class: 'tm-von', text: 'Devin' })),
    h('div', { class: 'tm-sum' }, h('div', null, h('small', { text: 'Dauer' }), h('b', { text: mmss(laufDauer(r)) })),
      h('div', null, h('small', { text: 'Sätze' }), h('b', { text: String(saetzeGesamt(r)) })),
      h('div', null, h('small', { text: 'Übungen' }), h('b', { text: String(r.u.length) }))),
    h('section', { class: 'block' }, h('h2', { text: 'T' + r.t + ' · ' + r.tn }), laufTabelle(r)),
    h('section', { class: 'block' }, h('h2', { text: 'An Devin schicken' }),
      h('p', { class: 'leise klein', text: 'Kopier den Text und schick ihn Devin, zum Beispiel per WhatsApp. Er sieht dann deine Zeiten, Gewichte und Wiederholungen.' }),
      knopf, feld),
    h('button', { class: 'knopf tm-gross', type: 'button', onclick: laufSchliessen, text: 'Fertig' })
  ];
}
function timerTick() {
  if (!LAUF || !TM.el || LAUF.phase === 'fertig') return;
  const jetzt = Date.now(), g = document.getElementById('tm-gesamt'), u = document.getElementById('tm-uhr'), rg = document.getElementById('tm-ring');
  if (g) g.textContent = mmss((jetzt - LAUF.start) / 1000);
  if (LAUF.phase === 'satz') {
    const lauf = (jetzt - LAUF.seit) / 1000;
    if (u) u.textContent = mmss(lauf);
    if (rg) rg.setAttribute('stroke-dashoffset', String(RING_U * (1 - (lauf % 60) / 60)));
  }
  if (LAUF.phase === 'pause') {
    const rest = LAUF.pauseZiel - (jetzt - LAUF.seit) / 1000;
    if (u) u.textContent = mmss(Math.ceil(rest));
    if (rg) rg.setAttribute('stroke-dashoffset', String(RING_U * Math.min(1, Math.max(0, rest / Math.max(1, LAUF.pauseZiel)))));
    if (rest <= 0) naechsterSatz();
  }
}
setInterval(timerTick, 250);

/* ---------- Start ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => {
  altesAbhakenWeg();
  S.wartet = speicher.lies('dk_wartet', null);
  await linkEinlesen();
  zeichne();
  fotosVorladen();
})();
window.addEventListener('hashchange', async () => { if (await linkEinlesen()) { zeichne(); window.scrollTo(0, 0); fotosVorladen(); } });
window.addEventListener('online', zeichne);
window.addEventListener('offline', zeichne);
