'use strict';
/* DK Akademie. Läuft auf claude.ai (mit KI, Upload und Speichern im Konto) und als eigene Web-App unter akademie/lernen.html
   (offline, Lektionen verschlüsselt in inhalt.dkx, Stand auf dem Gerät). Gleicher Code für beide, gebaut mit akademie/bauen.mjs.
   Seit 05.11.2026 (Devin: „von Null anfangen“, „bin ich heute krank oder nicht?“): Neustart am 09.11.2026, Lerntage statt fester
   Wochentage (Mo–Sa, sonntags frei), jeden Morgen „fit oder krank?“, ein Krankentag schiebt den ganzen Plan einen Tag nach hinten. */
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
const KI_LINK = 'https://claude.ai/artifact/BewRn7hoz4oUi58xToF7ib';
const NEUSTART = '2026-11-09';
let P = null, L = null;
const TAG_MS = 864e5, WT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  });
  kinder.flat(Infinity).forEach(k => { if (k == null || k === false) return; el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
  return el;
}
function toast(t) {
  const alt = document.querySelector('.toast'); if (alt) alt.remove();
  const el = h('div', { class: 'toast', role: 'status', text: t }); document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
function datumAus(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); }
function heute() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
const plusTage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const kurzDatum = d => WT[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '. ' + MON[d.getMonth()];
const punkt = s => /\.$/.test(s) ? s : s + '.';   // Satzende ohne doppelten Punkt nach „Nov.“
const mischen = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');

/* ---------- Plan in Lerntagen: jede Woche 6 Lerntage (5 Lektionen, dann Wochentest + Coaching). e.tag = Nummer des Lerntags (0 = erster).
   Sonntag ist frei, ein Krankentag zählt nicht. So rückt der Plan nach, statt rot zu werden. ---------- */
let EINHEITEN = [], LERNTAGE = 0;
function planBauen() {
  EINHEITEN = [];
  P.wochen.forEach((w, wi) => w.tage.forEach((t, ti) => {
    const tag = wi * 6 + ti;
    if (ti === 5) EINHEITEN.push({ id: 'wt' + pad(w.nr), art: 'wochentest', titel: 'Wochentest Woche ' + w.nr, fach: 'Prüfung', woche: w.nr, tag });
    EINHEITEN.push({ id: t.id, art: t.art || (t.fach === 'Coaching' ? 'coaching' : 'lektion'), titel: t.titel, fach: t.fach, woche: w.nr, tag });
  }));
  LERNTAGE = P.wochen.length * 6;
}
const einheit = id => EINHEITEN.find(e => e.id === id);
const erledigt = id => !!S.stand.erledigt[id];
function wocheVon(i) { return P.wochen[Math.min(P.wochen.length - 1, Math.max(0, Math.floor(i / 6)))]; }

/* ---------- Kalender: Start, Krankentage, Lerntage ---------- */
function startDatum() { return datumAus(S.stand.start || NEUSTART); }
const istKrank = d => (S.stand.tage || {})[ymd(d)] === 'krank';
const istLerntag = d => d.getDay() !== 0 && !istKrank(d);
// Lerntage zwischen Start und diesem Datum (ohne das Datum selbst); vor dem Start -1
function lerntagVor(d) {
  const s = startDatum();
  if (d < s) return -1;
  let n = 0;
  for (let x = s; x < d; x = plusTage(x, 1)) if (istLerntag(x)) n++;
  return n;
}
// Datum des i-ten Lerntags; in der Zukunft ohne Krankheit gerechnet
function datumVon(i) {
  let x = startDatum(), n = -1;
  for (let k = 0; k < 900; k++, x = plusTage(x, 1)) if (istLerntag(x) && ++n === i) return x;
  return x;
}
// hi = Nummer des heutigen (an freien Tagen: des nächsten) Lerntags; art: vorStart | lernen | frei | krank | fertig
function heuteStand() {
  const d = heute();
  if (d < startDatum()) return { hi: -1, art: 'vorStart' };
  const hi = lerntagVor(d);
  if (hi >= LERNTAGE) return { hi, art: 'fertig' };
  if (istKrank(d)) return { hi, art: 'krank' };
  if (d.getDay() === 0) return { hi, art: 'frei' };
  return { hi, art: 'lernen' };
}
function tagSetzen(d, wert) {
  const t = S.stand.tage || (S.stand.tage = {});
  if (wert) t[ymd(d)] = wert; else delete t[ymd(d)];
  Speicher.speichere('stand');
}

/* ---------- Zustand und Speichern (claude.ai-Datenbank, privat unter data/users/<id>; sonst nur dieses Gerät) ---------- */
const S = {
  tab: 'heute', ansicht: null,
  stand: { erledigt: {}, quiz: {}, falsch: {}, haken: {}, stat: {}, tage: {}, start: '', pruefung: '', anbieter: '' },
  system: { regeln: [], notiz: '' },
  medien: [], chat: [], chatThema: null
};
// v2 = Neustart am 09.11.2026 (der alte Stand v1 bleibt liegen, wird aber nicht mehr gelesen)
const LOKAL = 'dkakademie_v2', DOK = { stand: 'stand2', system: 'system' };
function lokalSichern() { try { localStorage.setItem(LOKAL, JSON.stringify({ stand: S.stand, system: S.system, medien: S.medien })); } catch (e) {} }
function mischeStand(a, b) {
  const x = Object.assign({}, b, a);
  ['erledigt', 'quiz', 'haken', 'stat', 'falsch', 'tage'].forEach(k => { x[k] = Object.assign({}, b[k] || {}, a[k] || {}); });
  return x;
}
const Speicher = {
  art: 'lokal', db: null, uid: null, schreibt: {}, wartet: {}, uhr: {},
  start() {
    try {
      const x = JSON.parse(localStorage.getItem(LOKAL) || 'null');
      if (x) { S.stand = mischeStand(x.stand || {}, S.stand); Object.assign(S.system, x.system || {}); S.medien = x.medien || []; }
    } catch (e) {}
    if (!window.claude || !window.claude.use) return;
    Promise.all([claude.use('db'), claude.use('user')]).then(([db, user]) => {
      if (!db || !user) return;
      return user.id().then(id => {
        if (!id) return;
        this.db = db; this.uid = id; this.art = 'db';
        let erst = true;
        db.collection('data/users/' + id).onSnapshot(snap => {
          let stand = null, system = null; const med = [];
          snap.docs.forEach(d => { const x = d.data(); if (!x) return; if (x.typ === DOK.stand) stand = x; else if (x.typ === 'system') system = x; else if (x.typ === 'medium') med.push(x); });
          if (erst) {
            erst = false;
            S.stand = mischeStand(stand || {}, S.stand); this.schreibe('stand');
            if (system) { if (!S.system.regeln.length && !S.system.notiz) S.system = system; else this.schreibe('system'); } else if (S.system.regeln.length || S.system.notiz) this.schreibe('system');
          } else {
            if (stand && !this.schreibt.stand && !this.wartet.stand && !this.uhr.stand) S.stand = stand;
            if (system && !this.schreibt.system && !this.wartet.system && !this.uhr.system) S.system = system;
          }
          S.medien = med.sort((a, b) => String(a.am).localeCompare(String(b.am)));
          lokalSichern(); auffrischen();
        }, () => { this.art = 'lokal'; });
      });
    }).catch(() => {});
  },
  speichere(was) {
    lokalSichern();
    if (this.art !== 'db') return;
    clearTimeout(this.uhr[was]);
    this.uhr[was] = setTimeout(() => { this.uhr[was] = null; this.schreibe(was); }, 600);
  },
  schreibe(was) {
    if (this.art !== 'db') return;
    if (this.schreibt[was]) { this.wartet[was] = true; return; }
    this.schreibt[was] = true; this.wartet[was] = false;
    const daten = JSON.parse(JSON.stringify(Object.assign({}, was === 'stand' ? S.stand : S.system, { typ: DOK[was] })));
    this.db.collection('data/users/' + this.uid).doc(DOK[was]).set(daten)
      .catch(() => toast('Speichern klappt gerade nicht. Dein Stand bleibt auf diesem Gerät.'))
      .then(() => { this.schreibt[was] = false; if (this.wartet[was]) this.schreibe(was); });
  },
  medium(m) {
    S.medien.push(m); lokalSichern();
    if (this.art === 'db') return this.db.collection('data/users/' + this.uid).doc(m.id).set(m);
    return Promise.resolve();
  },
  mediumWeg(m) {
    S.medien = S.medien.filter(x => x.id !== m.id); lokalSichern();
    if (this.art === 'db') return this.db.collection('data/users/' + this.uid).doc(m.id).delete();
    return Promise.resolve();
  }
};
function abhaken(id) {
  if (!S.stand.erledigt[id]) { S.stand.erledigt[id] = ymd(heute()); Speicher.speichere('stand'); }
}

/* ---------- Fragen: Schlüssel = Lektion#Nummer. Falsch beantwortete kommen in „Schwächen“, bis sie 2× richtig sind ---------- */
const frageKey = (id, i) => id + '#' + i;
function frageAus(key) { const [id, i] = key.split('#'); const l = L[id]; return l && l.fragen && l.fragen[+i] ? { key, id, f: l.fragen[+i], fach: (einheit(id) || {}).fach || '' } : null; }
function fragenVon(ids) { const r = []; ids.forEach(id => { const l = L[id]; if (l && l.fragen) l.fragen.forEach((f, i) => r.push({ key: frageKey(id, i), id, f, fach: (einheit(id) || {}).fach || '' })); }); return r; }
const theorieIds = () => Object.keys(L).filter(id => /^w\d/.test(id));
function antworten(q, richtig) {
  const st = S.stand.stat[q.fach] || (S.stand.stat[q.fach] = { r: 0, n: 0 });
  st.n++; if (richtig) st.r++;
  const fa = S.stand.falsch[q.key];
  if (!richtig) S.stand.falsch[q.key] = { n: (fa ? fa.n : 0) + 1, ok: 0 };
  else if (fa) { fa.ok = (fa.ok || 0) + 1; if (fa.ok >= 2) delete S.stand.falsch[q.key]; }
  Speicher.speichere('stand');
}
// Eine Frage mit Antwortknöpfen; nach dem Tippen: richtig/falsch + warum
function frageBlock(q, nr, fertig) {
  const box = h('div', { class: 'ak-frage' }, h('b', { text: (nr ? nr + '. ' : '') + q.f.frage }));
  const knoepfe = q.f.optionen.map((o, i) => h('button', { class: 'ak-opt', type: 'button', text: o, onclick: () => {
    knoepfe.forEach((k, j) => { k.disabled = true; if (j === q.f.richtig) k.classList.add('richtig'); });
    const ok = i === q.f.richtig;
    if (!ok) knoepfe[i].classList.add('falsch');
    box.appendChild(h('p', { class: 'ak-warum', text: (ok ? 'Richtig. ' : 'Nicht ganz. ') + (q.f.warum || '') }));
    antworten(q, ok);
    if (fertig) fertig(ok);
  } }));
  knoepfe.forEach(k => box.appendChild(k));
  return box;
}

/* ---------- 3D-Figur: dieselbe Bühne wie in DK Coach (Dateien in 3d/, erst bei Bedarf geladen) ---------- */
const D3 = { modul: null, ui: null };
function lade3d() {
  if (!D3.modul) D3.modul = Promise.all([import('./3d/figur.js'), import('./3d/bewegungen.js'),
    import('./3d/figur-modell.js').then(m => m.ladeKoerper('3d/koerper.txt')).catch(() => null)])
    .then(r => Object.assign({}, r[0], r[1]), e => { D3.modul = null; throw e; });
  return D3.modul;
}
function ladeBuehnenModul() {
  if (!D3.ui) D3.ui = import('./3d/buehne.js').catch(e => { D3.ui = null; throw e; });
  return D3.ui;
}
const hat3d = id => !!(id && DK_3D[id] && UEB[id]);
function daten3d(id) {
  const u = UEB[id] || {}, a = DK_3D[id];
  return { n: u.n || '', m: u.m || [], a: a ? { vorlage: a.vorlage, optionen: a.optionen } : null, t: u.t || [], f: u.f || [], v: u.v || [], k: a && a.k };
}
let BUEHNEN = [];
function buehne3d() {
  const platz = h('div', { class: 'buehne laedt' }); let b = null, aus = false, wartet = null;
  ladeBuehnenModul().then(M => {
    if (aus) return;
    b = M.buehne({ lade3d });
    if (platz.parentNode) platz.parentNode.replaceChild(b.el, platz);
    if (wartet) b.zeige(wartet);
  }, () => { platz.classList.remove('laedt'); platz.classList.add('fehlt'); });
  const st = { get el() { return b ? b.el : platz; }, zeige(d) { if (b) b.zeige(d); else wartet = d; }, weg() { aus = true; if (b) b.weg(); } };
  BUEHNEN.push(st);
  return st;
}
function buehnenWeg() { BUEHNEN.forEach(b => { try { b.weg(); } catch (e) {} }); BUEHNEN = []; }
// Übungen umschalten, eine Bühne (WebGL ist am Handy teuer)
function uebungenAnsicht(ids) {
  ids = ids.filter(hat3d);
  if (!ids.length) return null;
  const b = buehne3d(); let akt = ids[0];
  const chips = ids.map(id => h('button', { class: 'ak-chip', type: 'button', 'aria-pressed': String(id === akt), text: UEB[id].n, onclick: () => {
    akt = id; chips.forEach((c, j) => c.setAttribute('aria-pressed', String(ids[j] === akt))); b.zeige(daten3d(id));
  } }));
  b.zeige(daten3d(akt));
  return h('div', { class: 'stapel' }, ids.length > 1 ? h('div', { class: 'ak-chips' }, chips) : null, h('div', { class: 'ak-buehne' }, b.el));
}

/* ---------- Kleines Markdown für KI-Antworten (nur Absätze, Listen, fett) ---------- */
function inline(tag, s) {
  const el = document.createElement(tag);
  String(s).split(/(\*\*[^*]+\*\*)/).forEach(t => { if (/^\*\*[^*]+\*\*$/.test(t)) el.appendChild(h('b', { text: t.slice(2, -2) })); else if (t) el.appendChild(document.createTextNode(t)); });
  return el;
}
function md(text) {
  const box = h('div', { class: 'ak-md' }); let liste = null, absatz = [];
  const weiter = () => { if (absatz.length) { box.appendChild(inline('p', absatz.join(' '))); absatz = []; } };
  String(text || '').split('\n').forEach(z => {
    const m = z.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) { weiter(); const ol = /^\s*\d/.test(z); if (!liste || liste.tagName !== (ol ? 'OL' : 'UL')) { liste = h(ol ? 'ol' : 'ul'); box.appendChild(liste); } liste.appendChild(inline('li', m[1])); return; }
    liste = null;
    if (!z.trim()) { weiter(); return; }
    if (/^\s*#+\s/.test(z)) { weiter(); box.appendChild(h('p', null, h('b', { text: z.replace(/^\s*#+\s*/, '') }))); return; }
    absatz.push(z.trim());
  });
  weiter();
  return box;
}

/* ---------- Leiste ---------- */
const TABS = [
  ['heute', 'Heute', 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
  ['plan', 'Plan', 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8 13h3M8 16h6'],
  ['fragen', 'Fragen', 'M5 5h14v10H9l-4 4zM9.5 8.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.4M12 13.5v.2'],
  ['pruefung', 'Prüfung', 'M7 4h10v16H7zM10 8h4M10 12h4M10 16h2'],
  ['system', 'System', 'M4 6h16M4 12h16M4 18h16M8 4v4M15 10v4M11 16v4']
];
function leiste() {
  const box = document.getElementById('leiste'); box.textContent = '';
  TABS.forEach(([id, name, pfad]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', pfad); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); svg.appendChild(p);
    box.appendChild(h('button', { type: 'button', 'aria-current': S.tab === id && !S.ansicht ? 'page' : null, onclick: () => geh(id) }, svg, name));
  });
}
function geh(tab) { S.tab = tab; S.ansicht = null; zeichne(); window.scrollTo(0, 0); }
function oeffneAnsicht(a) { S.ansicht = a; zeichne(); window.scrollTo(0, 0); }

/* ---------- Zeichnen ---------- */
function zeichne() {
  buehnenWeg();
  const ziel = document.getElementById('inhalt'); ziel.textContent = '';
  const a = S.ansicht;
  const teile = a ? (a.art === 'lektion' ? lektionAnsicht(a) : quizAnsicht(a)) : ({ heute: heuteAnsicht, plan: planAnsicht, fragen: fragenAnsicht, pruefung: pruefungAnsicht, system: systemAnsicht }[S.tab])();
  [].concat(teile).forEach(t => t && ziel.appendChild(t));
  leiste();
  const st = heuteStand();
  document.getElementById('kopf-rechts').textContent = st.art === 'vorStart' ? 'Start ' + kurzDatum(startDatum()) : st.art === 'fertig' ? 'Plan geschafft' : 'Woche ' + wocheVon(st.hi).nr + ' von ' + P.wochen.length;
}
// Nach neuen Daten aus der Datenbank: nur Übersichten neu zeichnen (keine laufende Lektion, kein Tippen stören)
function auffrischen() {
  if (S.ansicht || S.tab === 'fragen') return;
  if (S.tab === 'system' && document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  zeichne();
}

function statusEl(e, hi) {
  const fertig = erledigt(e.id), alt = !fertig && e.tag < hi, jetzt = e.tag === hi;
  return h('span', { class: 'ak-status' + (fertig ? ' fertig' : jetzt ? ' heute' : alt ? ' alt' : ''), 'aria-label': fertig ? 'erledigt' : alt ? 'nachholen' : jetzt ? 'heute' : 'offen', text: fertig ? '✓' : alt ? '!' : '' });
}
function einheitZeile(e, hi, mitDatum) {
  const fertig = erledigt(e.id), alt = !fertig && e.tag < hi;
  const unter = [mitDatum !== false ? kurzDatum(datumVon(e.tag)) : null, e.fach, e.art === 'wochentest' ? '10 Fragen' : e.art === 'probe' ? '30 Fragen · 45 min' : null].filter(Boolean).join(' · ');
  return h('button', { class: 'ak-zeile' + (alt ? ' alt' : '') + (e.tag === hi && !fertig ? ' jetzt' : ''), type: 'button', onclick: () => oeffne(e) },
    statusEl(e, hi), h('b', { text: e.titel }), h('span', { class: 'unter', text: unter }), h('span', { class: 'pfeil', text: '›' }));
}
function oeffne(e) {
  if (e.art === 'wochentest') {
    const ids = EINHEITEN.filter(x => x.woche === e.woche && x.art === 'lektion').map(x => x.id);
    const alle = fragenVon(ids);
    if (!alle.length) { toast('Für diese Woche gibt es noch keine Fragen.'); return; }
    return oeffneAnsicht({ art: 'quiz', titel: e.titel, liste: mischen(alle).slice(0, 10), einheit: e.id });
  }
  if (e.art === 'probe') return oeffneAnsicht({ art: 'quiz', titel: e.titel, liste: mischen(fragenVon(theorieIds())).slice(0, 30), einheit: e.id, minuten: 45 });
  if (e.art === 'schwaechen') return starteSchwaechen(e.id);
  if (!L[e.id]) { toast('Diese Lektion wird gerade noch geschrieben.'); return; }
  oeffneAnsicht({ art: 'lektion', id: e.id, schritt: 0 });
}
function starteSchwaechen(einheitId) {
  const fr = Object.keys(S.stand.falsch).map(frageAus).filter(Boolean);
  const liste = fr.length ? mischen(fr).slice(0, 20) : mischen(fragenVon(theorieIds().filter(id => erledigt(id)).concat(theorieIds())).slice(0, 15));
  if (!liste.length) { toast('Noch keine Fragen da.'); return; }
  oeffneAnsicht({ art: 'quiz', titel: fr.length ? 'Deine Schwächen' : 'Zufallsfragen', liste, einheit: einheitId || null });
}

/* Heute: erst „fit oder krank?“, dann die Einheit des Tages */
function heuteAnsicht() {
  const st = heuteStand(), hi = st.hi, teile = [], d = heute();
  const offen = EINHEITEN.filter(e => e.tag < hi && !erledigt(e.id));
  const fertigN = EINHEITEN.filter(e => erledigt(e.id)).length;
  const naechste = EINHEITEN.find(e => e.tag === hi);
  if (st.art === 'vorStart') {
    const n = Math.round((startDatum() - d) / TAG_MS);
    teile.push(h('section', { class: 'ak-hero' },
      h('span', { class: 'ak-eyebrow', text: 'Neustart · ' + kurzDatum(startDatum()) }),
      h('h1', { class: 'ak-titel', text: '12 Wochen bis zur B-Lizenz' }),
      h('p', { class: 'ak-ziel', text: 'Jeden Tag 30 Minuten: fünf Lektionen, dann Wochentest und Coaching. Sonntags frei. Bist du krank, sagst du es morgens hier und der Plan rückt einen Tag nach hinten.' }),
      h('div', { class: 'ak-meta' }, h('span', { class: 'chip gold', text: n === 1 ? 'Morgen geht’s los' : 'Noch ' + n + ' Tage' })),
      h('div', { class: 'reihe' }, (x => h('button', { class: 'knopf haupt', type: 'button', text: x === EINHEITEN[0] ? 'Lektion 1 schon ansehen' : 'Weiter: ' + x.titel, onclick: () => oeffne(x) }))(EINHEITEN.find(e => !erledigt(e.id)) || EINHEITEN[0]),
        h('button', { class: 'knopf', type: 'button', text: 'Ganzen Plan ansehen', onclick: () => geh('plan') }))));
  } else if (st.art === 'fertig') {
    teile.push(h('section', { class: 'ak-hero' }, h('span', { class: 'ak-eyebrow', text: 'Plan beendet' }),
      h('h1', { class: 'ak-titel', text: 'Du bist durch.' }),
      h('p', { class: 'ak-ziel', text: 'Halte das Wissen frisch: Schwächen und Probeprüfungen findest du unter Prüfung.' })));
  } else if (st.art === 'krank') {
    teile.push(h('section', { class: 'ak-hero ak-krank' },
      h('span', { class: 'ak-eyebrow', text: 'Heute · ' + kurzDatum(d) + ' · Pause' }),
      h('h1', { class: 'ak-titel', text: 'Gute Besserung' }),
      h('p', { class: 'ak-ziel', text: 'Heute ist Pause, ohne schlechtes Gewissen. Dein Plan rückt einen Tag nach hinten' + (naechste ? ': „' + naechste.titel + '“ kommt am ' + punkt(kurzDatum(datumVon(hi))) : '.') }),
      h('div', { class: 'reihe' }, h('button', { class: 'knopf', type: 'button', text: 'Doch fit – heute lernen', onclick: () => { tagSetzen(d, 'fit'); zeichne(); } }))));
  } else if (st.art === 'frei') {
    const w = wocheVon(hi);
    teile.push(h('section', { class: 'ak-hero' }, h('span', { class: 'ak-eyebrow', text: 'Sonntag · frei' }),
      h('h1', { class: 'ak-titel', text: offen.length ? 'Frei – oder nachholen' : 'Heute frei' }),
      h('p', { class: 'ak-ziel', text: offen.length ? 'Du hast ' + offen.length + ' offene Einheit' + (offen.length > 1 ? 'en' : '') + '. Heute ist ein guter Tag dafür.' : 'Erhol dich. Morgen geht es mit Woche ' + w.nr + ' weiter' + (naechste ? ': „' + naechste.titel + '“.' : '.') })));
  } else if (!(S.stand.tage || {})[ymd(d)]) {
    // Erst fragen: fit oder krank?
    teile.push(h('section', { class: 'ak-hero ak-frage-tag' },
      h('span', { class: 'ak-eyebrow', text: 'Heute · ' + kurzDatum(d) + ' · Lerntag ' + (hi + 1) + ' von ' + LERNTAGE }),
      h('h1', { class: 'ak-titel', text: 'Wie geht’s dir heute?' }),
      h('p', { class: 'ak-ziel', text: 'Bist du krank, ist heute Pause und dein Plan rückt einen Tag nach hinten. Es geht nichts verloren.' }),
      h('div', { class: 'ak-wahl' },
        h('button', { class: 'knopf haupt ak-wahl-fit', type: 'button', onclick: () => { tagSetzen(d, 'fit'); zeichne(); } }, h('b', { text: 'Fit' }), h('span', { text: 'Los geht’s mit der Lektion' })),
        h('button', { class: 'knopf ak-wahl-krank', type: 'button', onclick: () => { tagSetzen(d, 'krank'); toast('Gute Besserung. Dein Plan rückt einen Tag nach hinten.'); zeichne(); } }, h('b', { text: 'Krank' }), h('span', { text: 'Heute Pause' })))));
  } else {
    const w = wocheVon(hi);
    EINHEITEN.filter(e => e.tag === hi).forEach(e => {
      const l = L[e.id], fertig = erledigt(e.id);
      teile.push(h('section', { class: 'ak-hero' },
        h('span', { class: 'ak-eyebrow', text: 'Heute · Lerntag ' + (hi + 1) + ' · Woche ' + w.nr + ' · ' + e.fach }),
        h('h1', { class: 'ak-titel', text: e.titel }),
        l && l.ziel ? h('p', { class: 'ak-ziel', text: l.ziel }) : null,
        h('div', { class: 'ak-meta' }, h('span', { class: 'chip gold', text: e.art === 'wochentest' ? '10 Fragen' : e.art === 'probe' ? '30 Fragen · 45 min' : '30 min' }),
          l && l.uebungen3d && l.uebungen3d.some(hat3d) ? h('span', { class: 'chip', text: '3D-Figur' }) : null,
          fertig ? h('span', { class: 'chip gut', text: 'Erledigt' }) : null),
        h('div', { class: 'reihe' }, h('button', { class: 'knopf haupt', type: 'button', text: fertig ? 'Nochmal ansehen' : 'Starten', onclick: () => oeffne(e) }))));
    });
  }
  if (offen.length) {
    const nachtragen = h('div', { class: 'stapel', hidden: true });
    teile.push(h('section', { class: 'stapel' }, h('h2', { text: 'Nachholen (' + offen.length + ')' }),
      h('div', { class: 'ak-liste' }, offen.slice(0, 5).map(e => einheitZeile(e, hi))),
      h('div', { class: 'reihe' },
        offen.length > 5 ? h('button', { class: 'knopf text', type: 'button', text: 'Alle im Plan ansehen', onclick: () => geh('plan') }) : null,
        h('button', { class: 'knopf text', type: 'button', text: 'Ich war krank', onclick: () => { nachtragen.hidden = !nachtragen.hidden; if (!nachtragen.hidden) krankNachtragen(nachtragen); } })),
      nachtragen));
  }
  // Stand
  const quote = Object.values(S.stand.stat).reduce((a, s) => [a[0] + s.r, a[1] + s.n], [0, 0]);
  const pct = Math.round(fertigN / EINHEITEN.length * 100), U = 2 * Math.PI * 38;
  const ring = h('div', { class: 'ak-ring' });
  ring.innerHTML = '<svg viewBox="0 0 92 92" aria-hidden="true"><circle class="bahn" cx="46" cy="46" r="38"/><circle class="fort" cx="46" cy="46" r="38" stroke-dasharray="' + U.toFixed(1) + '" stroke-dashoffset="' + (U * (1 - pct / 100)).toFixed(1) + '"/></svg>';
  ring.appendChild(h('span', null, pct + ' %', h('small', { text: 'geschafft' })));
  const krankN = Object.values(S.stand.tage || {}).filter(x => x === 'krank').length;
  teile.push(h('section', { class: 'block' },
    h('div', { class: 'ak-stand' }, ring, h('div', null, h('b', { text: fertigN + ' von ' + EINHEITEN.length + ' Einheiten' }),
      h('span', { class: 'leise klein', text: st.art === 'vorStart' ? 'Der Plan startet am ' + punkt(kurzDatum(startDatum())) : 'Lerntag ' + Math.min(LERNTAGE, hi + 1) + ' von ' + LERNTAGE + (krankN ? ' · ' + krankN + (krankN === 1 ? ' Krankentag' : ' Krankentage') : '') + '. Ziel: ' + punkt(kurzDatum(datumVon(LERNTAGE - 1))) }))),
    h('div', { class: 'ak-zahlen' },
      h('div', { class: 'ak-zahl' }, h('b', { text: String(serie()) }), h('small', { text: 'Tage am Stück' })),
      h('div', { class: 'ak-zahl' }, h('b', { text: quote[1] ? Math.round(quote[0] / quote[1] * 100) + ' %' : '–' }), h('small', { text: 'Fragen richtig' })),
      h('div', { class: 'ak-zahl' }, h('b', { text: pruefungText().zahl }), h('small', { text: pruefungText().text })))));
  if (IN_CLAUDE) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Frag die KI' }),
    h('p', { class: 'leise', text: 'Etwas nicht verstanden? Frag einfach. Die KI kennt alle Lektionen und kann Übungen als 3D-Figur zeigen.' }),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf', type: 'button', text: 'Frage stellen', onclick: () => { S.chatThema = null; geh('fragen'); } }))));
  return teile;
}
// Vergangene Lerntage nachträglich als krank eintragen (höchstens 14 Tage zurück)
function krankNachtragen(box) {
  box.textContent = '';
  const tage = [], s = startDatum();
  for (let x = plusTage(heute(), -1), k = 0; k < 14 && x >= s; k++, x = plusTage(x, -1)) if (x.getDay() !== 0 && !istKrank(x)) tage.push(x);
  if (!tage.length) { box.appendChild(h('p', { class: 'leise klein', text: 'Keine Tage zum Eintragen.' })); return; }
  box.appendChild(h('p', { class: 'leise klein', text: 'Tipp die Tage an, an denen du krank warst. Der Plan rückt dann nach.' }));
  box.appendChild(h('div', { class: 'ak-chips' }, tage.map(x => h('button', { class: 'ak-chip', type: 'button', text: kurzDatum(x), onclick: () => { tagSetzen(x, 'krank'); toast(kurzDatum(x) + ': krank eingetragen.'); zeichne(); } }))));
}
function serie() {
  const tage = new Set(Object.values(S.stand.erledigt));
  let d = heute(), n = 0;
  if (!tage.has(ymd(d))) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  for (let i = 0; i < 400; i++) {
    if (tage.has(ymd(d))) n++;
    else if (d.getDay() !== 0 && !istKrank(d)) break;   // Sonntag und Krankentage unterbrechen die Serie nicht
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return n;
}
function pruefungText() {
  if (!S.stand.pruefung) return { zahl: '?', text: 'Prüfung: Termin fehlt' };
  const n = Math.round((datumAus(S.stand.pruefung) - heute()) / TAG_MS);
  return n >= 0 ? { zahl: String(n), text: 'Tage bis zur Prüfung' } : { zahl: '✓', text: 'Prüfung war' };
}

/* Plan */
function planAnsicht() {
  const hi = heuteStand().hi, aktuell = Math.max(1, Math.min(P.wochen.length, Math.floor(Math.max(0, hi) / 6) + 1));
  return [h('div', { class: 'stapel' }, h('h1', { text: 'Dein Plan' }),
    h('p', { class: 'leise', text: 'Start: ' + kurzDatum(startDatum()) + ' · Pro Woche 6 Lerntage: 5 Lektionen, dann Wochentest und Coaching. Sonntags frei, Krankentage schieben den Plan. Rot = nachholen.' })),
    ...P.wochen.map(w => {
      const es = EINHEITEN.filter(e => e.woche === w.nr), f = es.filter(e => erledigt(e.id)).length;
      const det = h('details', { class: 'ak-woche', open: w.nr === aktuell || null },
        h('summary', null, h('b', { text: 'Woche ' + w.nr }), h('i', { text: f + '/' + es.length }), h('span', { text: w.thema })),
        h('div', { class: 'ak-liste' }, h('div', { class: 'ak-balken', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.round(f / es.length * 100) + '%' })), es.map(e => einheitZeile(e, hi))));
      return det;
    })];
}

/* Lektion: Lesen → Ansehen → Fragen → Praxis */
const SCHRITTE = ['Lesen', 'Ansehen', 'Fragen', 'Praxis'];
function lektionAnsicht(a) {
  const l = L[a.id], e = einheit(a.id) || { fach: '', woche: 0, tag: 0 }, coaching = e.art === 'coaching';
  a.ok = a.ok || {};
  const tabs = h('nav', { class: 'ak-schritte', 'aria-label': 'Schritte' }, SCHRITTE.map((s, i) =>
    h('button', { type: 'button', class: a.ok[i] ? 'ok' : '', 'aria-current': i === a.schritt ? 'step' : null, text: (i + 1) + ' ' + s, onclick: () => { a.schritt = i; zeichne(); window.scrollTo(0, 0); } })));
  const kopf = h('div', { class: 'stapel' },
    h('button', { class: 'knopf klein ak-zurueck', type: 'button', text: '‹ Zurück', onclick: () => { S.ansicht = null; zeichne(); } }),
    h('span', { class: 'ak-eyebrow', text: 'Woche ' + e.woche + ' · ' + kurzDatum(datumVon(e.tag)) + ' · ' + e.fach }),
    h('h1', { class: 'ak-titel', text: l.titel }),
    l.ziel ? h('p', { class: 'ak-ziel', text: l.ziel }) : null);
  let inhalt;
  if (a.schritt === 0) {
    a.ok[0] = true;
    inhalt = [
      l.kern && l.kern.length ? h('section', { class: 'block' }, h('h2', { text: 'Das musst du wissen' }), h('ul', { class: 'ak-kern' }, l.kern.map(k => inline('li', k)))) : null,
      h('section', { class: 'ak-text' }, [].concat(l.erklaerung || []).map(p => md(p))),
      l.merke ? h('div', { class: 'ak-merke' }, h('small', { text: 'Merke' }), inline('span', l.merke)) : null,
      l.begriffe && l.begriffe.length ? h('section', { class: 'stapel' }, h('h2', { text: 'Fachbegriffe' }),
        h('dl', { class: 'ak-begriffe' }, l.begriffe.map(b => h('div', null, h('dt', { text: b.wort }), h('dd', { text: b.bedeutung }))))) : null
    ];
  } else if (a.schritt === 1) {
    a.ok[1] = true;
    const eigene = S.medien.filter(m => m.lektion === a.id);
    inhalt = [
      uebungenAnsicht(l.uebungen3d || []),
      (l.videos || []).length || l.suche ? h('section', { class: 'stapel' }, h('h2', { text: 'Videos' }),
        (l.videos || []).map(v => h('a', { class: 'ak-link', href: v.url, target: '_blank', rel: 'noopener' }, h('span', { class: 'play', 'aria-hidden': 'true', text: '▶' }), h('b', { text: v.titel }), h('span', { text: 'YouTube · ' + (v.kanal || '') }), h('i', { text: '↗' }))),
        l.suche ? h('a', { class: 'ak-link', href: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(l.suche), target: '_blank', rel: 'noopener' }, h('span', { class: 'play', 'aria-hidden': 'true', text: '⌕' }), h('b', { text: 'Mehr Videos suchen' }), h('span', { text: '„' + l.suche + '“' }), h('i', { text: '↗' })) : null) : null,
      medienBlock(a.id, eigene),
      !(l.uebungen3d || []).some(hat3d) && !(l.videos || []).length && !eigene.length ? h('p', { class: 'leise', text: 'Zu diesem Thema gibt es keine Übung in 3D. Schau dir ein Video an oder lade ein eigenes Foto oder Video hoch.' }) : null
    ];
  } else if (a.schritt === 2) {
    const fr = (l.fragen || []).map((f, i) => ({ key: frageKey(a.id, i), id: a.id, f, fach: e.fach }));
    a.antw = a.antw || {};
    const zaehle = () => {
      const n = Object.keys(a.antw).length;
      if (n === fr.length) {
        a.ok[2] = true;
        const r = Object.values(a.antw).filter(Boolean).length;
        S.stand.quiz[a.id] = { r, n, am: ymd(heute()) }; Speicher.speichere('stand');
        stand.textContent = r + ' von ' + n + ' richtig.' + (r < n ? ' Die falschen kommen in „Schwächen“ wieder.' : ' Stark.');
        weiterK.disabled = false;
      }
    };
    const stand = h('p', { class: 'leise', role: 'status', text: fr.length + ' Fragen wie in der Prüfung. Tipp eine Antwort an.' });
    const weiterK = h('button', { class: 'knopf haupt', type: 'button', text: 'Weiter zur Praxis', disabled: true, onclick: () => { a.schritt = 3; zeichne(); window.scrollTo(0, 0); } });
    inhalt = [h('section', { class: 'block' }, stand, fr.map((q, i) => frageBlock(q, i + 1, ok => { a.antw[i] = ok; zaehle(); })))];
    inhalt.weiter = weiterK;
  } else {
    a.ok[3] = true;
    const haken = S.stand.haken[a.id] || [];
    inhalt = [
      l.praxis ? h('section', { class: 'block' }, h('h2', { text: coaching ? 'Deine Aufgabe' : 'Praxis heute' }), md(l.praxis)) : null,
      l.schritte && l.schritte.length ? h('section', { class: 'block' }, h('h2', { text: 'Schritt für Schritt' }),
        h('div', null, l.schritte.map((s, i) => {
          const cb = h('input', { type: 'checkbox', id: 'h-' + a.id + '-' + i, checked: !!haken[i] || null, onchange: () => { const x = S.stand.haken[a.id] || (S.stand.haken[a.id] = []); x[i] = cb.checked; Speicher.speichere('stand'); } });
          return h('label', { class: 'ak-check', for: 'h-' + a.id + '-' + i }, h('span', { class: 'haken' }, cb, h('span')), inline('p', s));
        }))) : null,
      l.vorlage ? h('section', { class: 'block' }, h('h2', { text: 'Vorlage zum Kopieren' }), h('div', { class: 'ak-vorlage', id: 'vorlage-' + a.id, text: l.vorlage }),
        h('div', { class: 'reihe' }, h('button', { class: 'knopf klein', type: 'button', text: 'Kopieren', onclick: ev => kopieren(l.vorlage, document.getElementById('vorlage-' + a.id)) }))) : null,
      (l.quellen || []).length ? h('details', { class: 'block' }, h('summary', { text: 'Quellen (' + l.quellen.length + ')' }),
        h('div', { class: 'ak-quellen' }, l.quellen.map(q => h('a', { href: q.url, target: '_blank', rel: 'noopener', text: q.titel || q.url })))) : null
    ];
  }
  const fertig = erledigt(a.id);
  const unten = h('div', { class: 'stapel' },
    inhalt.weiter || (a.schritt < 3
      ? h('button', { class: 'knopf haupt', type: 'button', text: 'Weiter: ' + SCHRITTE[a.schritt + 1], onclick: () => { a.schritt++; zeichne(); window.scrollTo(0, 0); } })
      : h('button', { class: 'knopf haupt', type: 'button', text: fertig ? 'Erledigt ✓' : 'Lektion abschließen', disabled: fertig || null, onclick: () => {
          abhaken(a.id); toast('Lektion erledigt. Weiter so.'); S.ansicht = null; zeichne(); window.scrollTo(0, 0);
        } })),
    h('button', { class: 'knopf', type: 'button', text: 'Frag die KI zu diesem Thema', onclick: () => { S.chatThema = a.id; S.ansicht = null; S.tab = 'fragen'; zeichne(); window.scrollTo(0, 0); } }));
  return [kopf, tabs, ...inhalt.filter(Boolean), unten];
}
function kopieren(text, el) {
  try {
    navigator.clipboard.writeText(text).then(() => toast('Kopiert.'), () => auswaehlen(el));
  } catch (e) { auswaehlen(el); }
}
function auswaehlen(el) {
  if (!el) return;
  const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  toast('Text ist markiert. Jetzt kopieren.');
}

/* Eigene Fotos, Videos und YouTube-Links zu einer Lektion */
function medienBlock(lektionId, eigene) {
  const datei = h('input', { type: 'file', accept: 'image/*,video/mp4,video/quicktime,video/webm', hidden: true, id: 'datei-' + lektionId, onchange: () => { if (datei.files[0]) hochladen(datei.files[0], lektionId); datei.value = ''; } });
  const link = h('input', { class: 'eingabe', type: 'url', id: 'link-' + lektionId, placeholder: 'YouTube-Link einfügen', inputmode: 'url' });
  const grid = h('div', { class: 'ak-medien' }, eigene.filter(m => m.art !== 'link').map(m => mediumEl(m)));
  return h('section', { class: 'stapel' }, h('h2', { text: 'Deine Fotos und Videos' }),
    eigene.filter(m => m.art === 'link').map(m => h('a', { class: 'ak-link', href: m.url, target: '_blank', rel: 'noopener' }, h('span', { class: 'play', 'aria-hidden': 'true', text: '▶' }), h('b', { text: m.titel || 'Dein Video' }), h('span', { text: m.url }), h('i', { text: '↗' }))),
    grid.childNodes.length ? grid : null,
    IN_CLAUDE ? h('div', { class: 'reihe' }, datei, h('button', { class: 'knopf', type: 'button', text: '+ Foto oder Video', onclick: () => datei.click() })) : null,
    h('div', { class: 'ak-eingabe' }, link, h('button', { class: 'knopf', type: 'button', text: 'Link speichern', onclick: () => {
      const u = link.value.trim();
      if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(u)) { toast('Bitte einen YouTube-Link einfügen (https://youtube.com/… oder youtu.be/…).'); return; }
      Speicher.medium({ typ: 'medium', id: 'm_' + Date.now().toString(36), lektion: lektionId, art: 'link', url: u, titel: 'Dein Video', am: new Date().toISOString() }).then(() => { toast('Link gespeichert.'); zeichne(); }, () => toast('Speichern klappt gerade nicht.'));
    } })),
    h('p', { class: 'leise klein', text: IN_CLAUDE ? 'Fotos und kurze Videos bis 20 MB. Nur du siehst sie, solange du die Akademie nicht teilst.' : 'Fotos und Videos hochladen geht in der claude.ai-Fassung. Hier kannst du YouTube-Links speichern.' }));
}
function mediumEl(m) {
  const src = '/_blob/' + m.asset;
  const weg = h('button', { class: 'weg', type: 'button', 'aria-label': 'Löschen', text: '✕', onclick: () => {
    const box = h('div', { class: 'ak-bestaetigen' }, h('span', { text: 'Wirklich löschen?' }),
      h('button', { class: 'knopf klein', type: 'button', text: 'Löschen', onclick: () => mediumLoeschen(m) }),
      h('button', { class: 'knopf klein text', type: 'button', text: 'Behalten', onclick: () => box.remove() }));
    el.after(box);
  } });
  const el = h('div', { class: 'ak-medium' }, m.art === 'video' ? h('video', { src, controls: true, playsinline: true, preload: 'metadata' }) : h('img', { src, alt: m.titel || 'Dein Foto', loading: 'lazy' }), weg);
  return el;
}
async function hochladen(file, lektionId) {
  const assets = window.claude && window.claude.use ? await claude.use('assets') : null;
  if (!assets) { toast('Hochladen geht nur, wenn du die Akademie auf claude.ai öffnest.'); return; }
  if (file.size > 20 * 1024 * 1024) { toast('Die Datei ist größer als 20 MB. Kürze das Video in der Fotos-App auf wenige Sekunden.'); return; }
  let typ = file.type || '';
  if (/quicktime/i.test(typ) || /\.mov$/i.test(file.name) || (!typ && /\.mp4$/i.test(file.name))) typ = 'video/mp4';
  if (/heic|heif/i.test(typ)) { toast('HEIC geht nicht. Stell die Kamera auf „Maximale Kompatibilität“ oder mach einen Screenshot.'); return; }
  toast('Lädt hoch …');
  try {
    const r = await assets.upload(file, typ && typ !== file.type ? { type: typ } : undefined);
    await Speicher.medium({ typ: 'medium', id: 'm_' + Date.now().toString(36), lektion: lektionId, asset: r.id, art: /^video/.test(r.contentType) ? 'video' : 'bild', titel: file.name, am: new Date().toISOString() });
    toast('Gespeichert.'); zeichne();
  } catch (e) {
    const c = e && e.code;
    toast(c === 'too_large' ? 'Zu groß. Maximal 20 MB.' : c === 'unsupported_type' ? 'Dieses Format geht nicht. Fotos als JPG/PNG, Videos als MP4.' : c === 'quota_or_state' ? 'Der Speicher der Akademie ist voll.' : 'Hochladen hat nicht geklappt. Versuch es gleich nochmal.');
  }
}
async function mediumLoeschen(m) {
  try {
    if (m.asset) { const assets = await claude.use('assets'); if (assets) await assets.delete(m.asset); }
    await Speicher.mediumWeg(m); toast('Gelöscht.'); zeichne();
  } catch (e) { toast('Löschen hat nicht geklappt.'); }
}

/* Quiz: Wochentest, Probeprüfung, Schwächen – eine Frage nach der anderen */
function quizAnsicht(a) {
  a.i = a.i || 0; a.r = a.r || 0; a.falsche = a.falsche || [];
  if (a.minuten && !a.ende) a.ende = Date.now() + a.minuten * 60e3;
  const zurueck = h('button', { class: 'knopf klein ak-zurueck', type: 'button', text: '‹ Abbrechen', onclick: () => { clearInterval(a.uhrId); S.ansicht = null; zeichne(); } });
  if (a.i >= a.liste.length) {
    clearInterval(a.uhrId);
    const pct = Math.round(a.r / a.liste.length * 100);
    if (a.einheit && !a.gezaehlt) { a.gezaehlt = true; abhaken(a.einheit); }
    return [h('div', { class: 'stapel' }, h('span', { class: 'ak-eyebrow', text: a.titel }), h('div', { class: 'ak-ergebnis', text: pct + ' %' }),
      h('p', { class: 'ak-ziel', text: a.r + ' von ' + a.liste.length + ' richtig.' + (a.falsche.length ? ' Die falschen findest du unter Prüfung → Schwächen.' : '') })),
      a.falsche.length ? h('section', { class: 'block' }, h('h2', { text: 'Das schaust du dir nochmal an' }),
        a.falsche.map(q => h('div', { class: 'ak-frage' }, h('b', { text: q.f.frage }), h('p', { text: 'Richtig: ' + q.f.optionen[q.f.richtig] }), h('p', { class: 'ak-warum', text: q.f.warum || '' }),
          L[q.id] ? h('button', { class: 'knopf klein', type: 'button', text: 'Zur Lektion: ' + L[q.id].titel, onclick: () => oeffneAnsicht({ art: 'lektion', id: q.id, schritt: 0 }) }) : null))) : null,
      h('button', { class: 'knopf haupt', type: 'button', text: 'Fertig', onclick: () => { S.ansicht = null; zeichne(); } })];
  }
  const q = a.liste[a.i];
  const uhr = a.ende ? h('span', { class: 'chip gold zahl', role: 'timer' }) : null;
  if (uhr) {
    const tick = () => { const s = Math.max(0, Math.round((a.ende - Date.now()) / 1000)); uhr.textContent = Math.floor(s / 60) + ':' + pad(s % 60); };
    tick(); clearInterval(a.uhrId); a.uhrId = setInterval(tick, 1000);
  }
  const weiter = h('button', { class: 'knopf haupt', type: 'button', text: a.i + 1 < a.liste.length ? 'Nächste Frage' : 'Ergebnis ansehen', disabled: true, onclick: () => { a.i++; zeichne(); window.scrollTo(0, 0); } });
  return [zurueck,
    h('div', { class: 'stapel' }, h('div', { class: 'reihe' }, h('span', { class: 'ak-eyebrow', text: a.titel }), uhr),
      h('div', { class: 'tm-punkte', 'aria-label': 'Frage ' + (a.i + 1) + ' von ' + a.liste.length }, a.liste.map((_, j) => h('i', { class: j < a.i ? 'an' : j === a.i ? 'jetzt' : '' }))),
      h('span', { class: 'leise klein', text: 'Frage ' + (a.i + 1) + ' von ' + a.liste.length + (q.fach ? ' · ' + q.fach : '') })),
    h('section', { class: 'block' }, frageBlock(q, 0, ok => { if (ok) a.r++; else a.falsche.push(q); weiter.disabled = false; })),
    weiter];
}

/* Prüfung */
function pruefungAnsicht() {
  const anzahlF = Object.keys(S.stand.falsch).length, alle = fragenVon(theorieIds()).length;
  const faecher = Object.entries(S.stand.stat).filter(([, s]) => s.n).sort((a, b) => a[1].r / a[1].n - b[1].r / b[1].n);
  return [h('div', { class: 'stapel' }, h('h1', { text: 'Prüfung üben' }),
      h('p', { class: 'leise', text: alle + ' Prüfungsfragen aus allen Lektionen. Die Prüfung ist bei den meisten Anbietern eine Klausur (oft Multiple Choice) und eine Lehrprobe. Format und Bestehensgrenze stehen in der Prüfungsordnung deines Anbieters.' })),
    h('div', { class: 'ak-liste' },
      h('button', { class: 'ak-zeile', type: 'button', onclick: () => starteSchwaechen() }, h('span', { class: 'ak-status' + (anzahlF ? ' alt' : ''), text: anzahlF ? '!' : '✓' }), h('b', { text: 'Schwächen wiederholen' }), h('span', { class: 'unter', text: anzahlF ? anzahlF + (anzahlF === 1 ? ' Frage, die du falsch hattest' : ' Fragen, die du falsch hattest') : 'Keine offenen Fehler. Dann gibt es Zufallsfragen.' }), h('span', { class: 'pfeil', text: '›' })),
      h('button', { class: 'ak-zeile', type: 'button', onclick: () => oeffneAnsicht({ art: 'quiz', titel: '10 Zufallsfragen', liste: mischen(fragenVon(theorieIds())).slice(0, 10) }) }, h('span', { class: 'ak-status', text: '10' }), h('b', { text: 'Zufallsfragen' }), h('span', { class: 'unter', text: 'Quer durch alle Themen, ca. 5 Minuten' }), h('span', { class: 'pfeil', text: '›' })),
      h('button', { class: 'ak-zeile', type: 'button', onclick: () => oeffneAnsicht({ art: 'quiz', titel: 'Probeprüfung', liste: mischen(fragenVon(theorieIds())).slice(0, 30), minuten: 45 }) }, h('span', { class: 'ak-status', text: '30' }), h('b', { text: 'Probeprüfung' }), h('span', { class: 'unter', text: '30 Fragen, 45 Minuten auf der Uhr' }), h('span', { class: 'pfeil', text: '›' }))),
    h('section', { class: 'stapel' }, h('h2', { text: 'Lehrprobe' }),
      h('div', { class: 'ak-liste' }, ['w11-2', 'w11-3', 'w12-2', 'w12-3'].map(id => einheit(id)).filter(Boolean).map(e => einheitZeile(e, heuteStand().hi, false)))),
    faecher.length ? h('section', { class: 'block' }, h('h2', { text: 'So stehst du je Fach' }),
      h('div', { class: 'balken' }, faecher.map(([f, s]) => { const p = Math.round(s.r / s.n * 100); return h('div', null, h('span', { text: f }), h('i', { class: p < 60 ? 'zu-wenig' : '', style: '--w:' + p + '%' }), h('span', { class: 'zahl', text: p + ' %' })); })),
      h('p', { class: 'leise klein', text: 'Oben steht, was du am meisten üben solltest.' })) : null];
}

/* Mein System: eigene Regeln, Coaching-Ablauf, Prüfungstermin */
function systemAnsicht() {
  const coaching = EINHEITEN.filter(e => e.art === 'coaching'), hi = heuteStand().hi;
  const regeln = S.system.regeln || (S.system.regeln = []);
  const r = h('input', { class: 'eingabe', id: 'regel', placeholder: 'Regel, z. B. „Jeder Anfänger startet mit Ganzkörper 3×/Woche“' });
  const w = h('input', { class: 'eingabe', id: 'warum', placeholder: 'Warum?' });
  const g = h('input', { class: 'eingabe', id: 'gilt', placeholder: 'Gilt für (alle, Anfänger, Frauen …)' });
  const notiz = h('textarea', { class: 'eingabe', id: 'notiz', rows: '5', placeholder: 'So coache ich: Ablauf, Haltung, was mich ausmacht …', value: S.system.notiz || '', oninput: () => { S.system.notiz = notiz.value; Speicher.speichere('system'); } });
  const termin = h('input', { class: 'eingabe', type: 'date', id: 'termin', value: S.stand.pruefung || '', onchange: () => { S.stand.pruefung = termin.value; Speicher.speichere('stand'); toast('Prüfungstermin gespeichert.'); } });
  const anbieter = h('input', { class: 'eingabe', id: 'anbieter', placeholder: 'z. B. BSA, Safs & Beta, IST …', value: S.stand.anbieter || '', onchange: () => { S.stand.anbieter = anbieter.value.trim(); Speicher.speichere('stand'); toast('Gespeichert.'); } });
  return [h('div', { class: 'stapel' }, h('h1', { text: 'Mein System' }),
      h('p', { class: 'leise', text: 'Hier steht, wie du coachst. Die KI richtet ihre Antworten danach.' })),
    h('section', { class: 'stapel' }, h('h2', { text: 'Coaching-Ablauf' }),
      h('p', { class: 'leise klein', text: 'Der feste Ablauf vom Angebot bis zum ersten Kunden. Am Ende jeder Lernwoche ein Schritt.' }),
      h('div', { class: 'ak-liste' }, coaching.map(e => {
        const l = L[e.id], hk = S.stand.haken[e.id] || [], n = l && l.schritte ? l.schritte.length : 0, f = hk.filter(Boolean).length;
        const z = einheitZeile(e, hi);
        if (n) z.querySelector('.unter').textContent = kurzDatum(datumVon(e.tag)) + ' · ' + f + ' von ' + n + ' Schritten';
        return z;
      }))),
    h('section', { class: 'block' }, h('h2', { text: 'Meine Regeln' }),
      regeln.length ? h('div', { class: 'ak-liste' }, regeln.map((x, i) => h('div', { class: 'ak-frage' }, h('b', { text: x.regel }),
        x.warum ? h('p', { class: 'leise', text: 'Warum: ' + x.warum }) : null, x.gilt ? h('p', { class: 'leise klein', text: 'Gilt für: ' + x.gilt }) : null,
        h('div', { class: 'reihe' }, h('button', { class: 'knopf klein text', type: 'button', text: 'Entfernen', onclick: ev => {
          const box = h('span', { class: 'ak-bestaetigen' }, 'Regel entfernen?', h('button', { class: 'knopf klein', type: 'button', text: 'Ja', onclick: () => { regeln.splice(i, 1); Speicher.speichere('system'); zeichne(); } }), h('button', { class: 'knopf klein text', type: 'button', text: 'Nein', onclick: () => box.remove() }));
          ev.currentTarget.after(box);
        } }))))) : h('p', { class: 'leise', text: 'Noch keine Regeln. Schreib auf, was du bei jedem Kunden gleich machst. In Woche 11 kommt dazu eine eigene Lektion.' }),
      h('div', { class: 'feld' }, h('label', { for: 'regel', text: 'Neue Regel' }), r, w, g),
      h('div', { class: 'reihe' }, h('button', { class: 'knopf haupt', type: 'button', text: 'Regel speichern', onclick: () => {
        if (!r.value.trim()) { toast('Schreib zuerst die Regel.'); r.focus(); return; }
        regeln.push({ regel: r.value.trim(), warum: w.value.trim(), gilt: g.value.trim(), am: ymd(heute()) }); Speicher.speichere('system'); toast('Regel gespeichert.'); zeichne();
      } }))),
    h('section', { class: 'block' }, h('h2', { text: 'So coache ich' }), notiz),
    h('section', { class: 'block' }, h('h2', { text: 'Prüfung' }),
      h('div', { class: 'raster2' }, h('div', { class: 'feld' }, h('label', { for: 'termin', text: 'Prüfungstermin' }), termin), h('div', { class: 'feld' }, h('label', { for: 'anbieter', text: 'Anbieter' }), anbieter)),
      h('p', { class: 'leise klein', text: 'Sobald du Anbieter und Unterlagen hast, passe ich den Plan an deinen Lehrgang an.' })),
    krankBlock(),
    uebertragenBlock(),
    neustartBlock(),
    h('section', { class: 'block' }, h('h2', { text: 'Erinnerung' }),
      h('p', { class: 'leise', text: 'Jarvis erinnert dich am PC an die Akademie. Die Akademie selbst läuft auch ohne PC, auf dem Handy sogar ohne Internet.' }),
      h('p', { class: 'leise klein', text: Speicher.art === 'db' ? 'Dein Fortschritt wird in deinem claude.ai-Konto gespeichert, auf allen Geräten gleich.' : 'Dein Fortschritt liegt auf diesem Gerät. Mit „Stand übertragen“ nimmst du ihn auf ein anderes Gerät mit.' }))];
}
// Krankentage: ansehen und wieder streichen
function krankBlock() {
  const tage = Object.keys(S.stand.tage || {}).filter(k => S.stand.tage[k] === 'krank').sort().reverse();
  return h('section', { class: 'block' }, h('h2', { text: 'Krankentage' }),
    tage.length ? h('div', { class: 'ak-chips' }, tage.map(k => h('button', { class: 'ak-chip', type: 'button', 'aria-label': kurzDatum(datumAus(k)) + ' streichen', text: kurzDatum(datumAus(k)) + '  ✕', onclick: () => { tagSetzen(datumAus(k), null); toast('Krankentag gestrichen.'); zeichne(); } })))
      : h('p', { class: 'leise', text: 'Keine. Bist du krank, tippst du morgens unter Heute auf „Krank“.' }),
    tage.length ? h('p', { class: 'leise klein', text: 'Tippen streicht einen Tag. Der Plan rechnet dann neu.' }) : null);
}
// Stand als Code mitnehmen (z. B. vom Handy auf den PC oder auf ein neues Handy)
function standCode() {
  const b = new TextEncoder().encode(JSON.stringify({ v: 2, stand: S.stand, system: S.system }));
  let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return 'DKA2:' + btoa(s);
}
function standAusCode(code) {
  const roh = String(code || '').trim().replace(/\s+/g, '');
  if (!/^DKA2:/.test(roh)) throw new Error('kein Code');
  const s = atob(roh.slice(5)), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  const x = JSON.parse(new TextDecoder().decode(b));
  if (!x || !x.stand || typeof x.stand !== 'object') throw new Error('kein Stand');
  return x;
}
function uebertragenBlock() {
  const feld = h('textarea', { class: 'eingabe', id: 'stand-code', rows: '3', placeholder: 'Code einfügen (beginnt mit DKA2:)' });
  const ausgabe = h('div', { class: 'ak-vorlage', id: 'stand-code-aus', hidden: true });
  return h('section', { class: 'block' }, h('h2', { text: 'Stand übertragen' }),
    h('p', { class: 'leise', text: 'Nimm deinen Fortschritt auf ein anderes Gerät mit: hier Code kopieren, dort einfügen.' }),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf', type: 'button', text: 'Code kopieren', onclick: () => { const c = standCode(); ausgabe.textContent = c; ausgabe.hidden = false; kopieren(c, ausgabe); } })),
    ausgabe,
    h('div', { class: 'feld' }, h('label', { for: 'stand-code', text: 'Code von einem anderen Gerät' }), feld),
    h('div', { class: 'reihe' }, h('button', { class: 'knopf', type: 'button', text: 'Code übernehmen', onclick: ev => {
      let x; try { x = standAusCode(feld.value); } catch (e) { toast('Das ist kein gültiger Akademie-Code.'); return; }
      const box = h('span', { class: 'ak-bestaetigen' }, 'Ersetzt deinen Stand auf diesem Gerät.',
        h('button', { class: 'knopf klein', type: 'button', text: 'Übernehmen', onclick: () => {
          S.stand = mischeStand(x.stand, { erledigt: {}, quiz: {}, falsch: {}, haken: {}, stat: {}, tage: {}, start: '', pruefung: '', anbieter: '' });
          if (x.system) S.system = Object.assign({ regeln: [], notiz: '' }, x.system);
          Speicher.speichere('stand'); Speicher.speichere('system'); toast('Stand übernommen.'); zeichne();
        } }),
        h('button', { class: 'knopf klein text', type: 'button', text: 'Abbrechen', onclick: () => box.remove() }));
      ev.currentTarget.after(box);
    } })));
}
// Von vorn: Fortschritt löschen, neuer Starttag (Regeln, Notizen, Prüfungstermin bleiben)
function neustartBlock() {
  const d = heute(), montag = plusTage(d, ((8 - d.getDay()) % 7) || 7);
  const neu = start => () => {
    S.stand = Object.assign({}, S.stand, { erledigt: {}, quiz: {}, falsch: {}, haken: {}, stat: {}, tage: {}, start: ymd(start) });
    Speicher.speichere('stand'); toast('Neustart am ' + punkt(kurzDatum(start))); geh('heute');
  };
  const frage = (start, ev) => {
    const box = h('span', { class: 'ak-bestaetigen' }, 'Fortschritt löschen und am ' + kurzDatum(start) + ' bei Lektion 1 anfangen?',
      h('button', { class: 'knopf klein', type: 'button', text: 'Ja, neu starten', onclick: neu(start) }),
      h('button', { class: 'knopf klein text', type: 'button', text: 'Abbrechen', onclick: () => box.remove() }));
    ev.currentTarget.after(box);
  };
  return h('section', { class: 'block' }, h('h2', { text: 'Neu starten' }),
    h('p', { class: 'leise', text: 'Starttag jetzt: ' + punkt(kurzDatum(startDatum())) + ' Ein Neustart löscht erledigte Lektionen und Fragen-Statistik. Deine Regeln, Notizen und der Prüfungstermin bleiben.' }),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf', type: 'button', text: 'Ab heute', onclick: ev => frage(d, ev) }),
      h('button', { class: 'knopf', type: 'button', text: 'Ab Montag, ' + montag.getDate() + '. ' + MON[montag.getMonth()], onclick: ev => frage(montag, ev) })));
}

/* Fragen an die KI (läuft über dein claude.ai-Konto, kein Schlüssel) */
const KI_REGELN = [
  'Du bist die KI der DK Akademie, dem Lernbereich von Devin Kanke (Natural-Bodybuilder). Er macht die Fitnesstrainer-B-Lizenz und coacht online mit seiner App DK Coach.',
  'Deine Aufgabe: seine Frage so erklären, dass er sie versteht, in der Prüfung richtig beantwortet und beim Coachen anwenden kann.',
  'So antwortest du:',
  '- Deutsch, Du-Form, kurze klare Sätze. Zuerst die Antwort in 1–2 Sätzen, dann Schritt für Schritt erklärt, dann ein Beispiel aus dem Studio oder Coaching.',
  '- Fachbegriffe mit Latein und Deutsch. Am Ende ein kurzer Merksatz, wenn es passt.',
  '- Keine erfundenen Zahlen. Wenn Lehrbücher oder B-Lizenz-Anbieter Verschiedenes sagen, sag das. Wenn du unsicher bist, sag es offen.',
  '- Gesundheit: keine Diagnosen, keine Therapie, keine Ernährungspläne mit Zahlen für Kranke; bei Schmerzen, Krankheit oder Medikamenten an Arzt oder Physio verweisen.',
  '- Nutze die Werkzeuge: lektionen_suchen/lektion_lesen, um auf die passende Lektion der Akademie zu verweisen (nenne sie mit Titel). Wenn es um eine Bewegung oder einen Muskel geht, zeig mit uebung_suchen und uebung_3d_zeigen eine passende Übung als 3D-Figur.',
  '- Form: kurze Absätze, Listen mit „- “, **fett** sparsam. Keine Überschriften mit #, keine Tabellen, keine Emojis, keine Floskeln wie „Tauche ein“, „Gamechanger“, „ganzheitlich“.'
].join('\n');
function kiKontext() {
  const t = [];
  const l = S.chatThema && L[S.chatThema];
  if (l) t.push('Er kommt gerade aus der Lektion „' + l.titel + '“. Kernpunkte: ' + (l.kern || []).join(' | '));
  const st = heuteStand(), hE = st.art === 'lernen' ? EINHEITEN.find(e => e.tag === st.hi) : null;
  if (hE) t.push('Heute im Plan: ' + hE.titel + ' (' + hE.fach + ').');
  const regeln = (S.system.regeln || []).map(r => '- ' + r.regel + (r.warum ? ' (warum: ' + r.warum + ')' : '') + (r.gilt ? ' [gilt für: ' + r.gilt + ']' : ''));
  if (regeln.length) t.push('Devins eigene Regeln (sein System), beachte sie, wo sie passen:\n' + regeln.join('\n'));
  if (S.system.notiz) t.push('So coacht Devin (seine Worte): ' + S.system.notiz.slice(0, 1200));
  return t.join('\n\n');
}
function suche(liste, text, felder) {
  const w = norm(text).split(/\s+/).filter(x => x.length > 1);
  return liste.map(x => { const s = norm(felder(x)); return { x, p: w.reduce((a, t) => a + (s.includes(t) ? 1 : 0), 0) }; }).filter(r => r.p > 0).sort((a, b) => b.p - a.p).map(r => r.x);
}
function kiWerkzeuge(blase) {
  return [
    { name: 'lektionen_suchen', description: 'Sucht Lektionen der DK Akademie nach Stichworten. Gibt bis zu 6 Treffer mit id, titel, fach zurück.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Stichworte, z. B. "Superkompensation" oder "Kniebeuge Fehler"' } }, required: ['text'] },
      execute: i => suche(Object.keys(L).map(id => ({ id, titel: L[id].titel, fach: (einheit(id) || {}).fach || '', kern: (L[id].kern || []).join(' ') })), String(i.text || ''), x => x.titel + ' ' + x.kern + ' ' + x.fach).slice(0, 6).map(x => ({ id: x.id, titel: x.titel, fach: x.fach })) },
    { name: 'lektion_lesen', description: 'Liest eine Lektion der Akademie (Ziel, Kernpunkte, Merksatz, Fachbegriffe) per id.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: i => { const l = L[String(i.id)]; if (!l) throw new Error('Keine Lektion mit dieser id'); return { titel: l.titel, ziel: l.ziel, kern: l.kern, merke: l.merke, begriffe: l.begriffe }; } },
    { name: 'uebung_suchen', description: 'Sucht Übungen, die als 3D-Figur gezeigt werden können, nach Name oder Muskel. Gibt bis zu 8 Treffer mit id und Name zurück.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'z. B. "Kniebeuge", "Latzug", "Brust"' } }, required: ['text'] },
      execute: i => suche(Object.keys(UEB).filter(hat3d).map(id => ({ id, n: UEB[id].n, m: (UEB[id].m || []).join(' ') })), String(i.text || ''), x => x.n + ' ' + x.id.replace(/_/g, ' ') + ' ' + x.m).slice(0, 8).map(x => ({ id: x.id, name: x.n })) },
    { name: 'uebung_3d_zeigen', description: 'Zeigt eine Übung als bewegte 3D-Figur unter deiner Antwort (id aus uebung_suchen). Höchstens eine pro Antwort.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: i => {
        const id = String(i.id);
        if (!hat3d(id)) throw new Error('Diese Übung gibt es nicht als 3D-Figur. Erst uebung_suchen nutzen.');
        if (blase.buehne) return 'Es wird schon eine Übung gezeigt.';
        const b = buehne3d(); blase.buehne = b; b.zeige(daten3d(id));
        blase.unten.appendChild(h('div', { class: 'ak-buehne' }, b.el));
        return 'Wird gezeigt: ' + UEB[id].n;
      } }
  ];
}
function fragenAnsicht() {
  if (!IN_CLAUDE) return [h('div', { class: 'stapel' }, h('h1', { text: 'Fragen an die KI' }),
      h('p', { class: 'leise', text: 'Die KI läuft in der claude.ai-Fassung der Akademie. Dort kennt sie alle Lektionen und dein System. Du brauchst dafür eine Anmeldung bei claude.ai.' })),
    h('section', { class: 'block' }, h('h2', { text: 'So geht’s' }),
      h('ol', null, h('li', { text: 'Akademie in claude.ai öffnen (am besten am PC oder im Browser, in dem du bei claude.ai angemeldet bist).' }), h('li', { text: 'Unten auf „Fragen“ tippen und deine Frage stellen.' })),
      h('div', { class: 'reihe' }, h('a', { class: 'knopf haupt', href: KI_LINK, target: '_blank', rel: 'noopener', text: 'In claude.ai öffnen' }))),
    h('p', { class: 'leise klein', text: 'Dein Fortschritt von hier ist dort nicht automatisch. Unter System → „Stand übertragen“ nimmst du ihn mit.' })];
  const log = h('div', { class: 'ak-chat', 'aria-live': 'polite' });
  const feld = h('textarea', { class: 'eingabe', id: 'ki-frage', rows: '2', placeholder: 'Deine Frage, z. B. „Was ist der Unterschied zwischen Agonist und Synergist?“' });
  const senden = h('button', { class: 'knopf haupt', type: 'button', text: 'Fragen', onclick: () => fragen(feld.value) });
  const stopp = h('button', { class: 'knopf', type: 'button', text: 'Stopp', hidden: true });
  feld.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); fragen(feld.value); } });
  const thema = S.chatThema && L[S.chatThema];
  const zeigeVerlauf = () => {
    log.textContent = '';
    S.chat.forEach(m => log.appendChild(m.rolle === 'du' ? h('div', { class: 'msg du', text: m.text }) : h('div', { class: 'msg agent' }, md(m.text))));
  };
  let ctl = null;
  stopp.onclick = () => { if (ctl) ctl.abort(); };
  function fragen(text) {
    text = String(text || '').trim();
    if (!text) { feld.focus(); return; }
    if (!window.claude || !window.claude.use) { toast('Die KI läuft nur, wenn du die Akademie auf claude.ai öffnest.'); return; }
    feld.value = ''; senden.disabled = true; stopp.hidden = false;
    S.chat.push({ rolle: 'du', text });
    zeigeVerlauf();
    buehnenWeg();   // alte 3D-Figur aus der letzten Antwort freigeben (WebGL am Handy)
    const unten = h('div', { class: 'stapel' }), text0 = h('div', null, h('p', { class: 'leise', text: 'Denkt nach …' }));
    const blase = { unten, buehne: null };
    log.appendChild(h('div', { class: 'msg agent' }, text0, unten));
    const kontext = kiKontext();
    const verlauf = [];
    S.chat.slice(-10).forEach(m => {
      const role = m.rolle === 'du' ? 'user' : 'assistant', vor = verlauf[verlauf.length - 1];
      if (vor && vor.role === role) vor.content += '\n\n' + m.text; else verlauf.push({ role, content: m.text });
    });
    while (verlauf.length && verlauf[0].role !== 'user') verlauf.shift();
    verlauf[0] = { role: 'user', content: KI_REGELN + (kontext ? '\n\n' + kontext : '') + '\n\nFrage von Devin:\n' + verlauf[0].content };
    ctl = new AbortController();
    const onText = u => { text0.textContent = ''; text0.appendChild(md(u.text)); };
    claude.use('sample').then(sample => {
      if (!sample) throw { code: 'not_granted' };
      return sample(verlauf, { tools: kiWerkzeuge(blase), signal: ctl.signal, onText, modelTier: 'default' })
        .catch(e => { if (e && e.code === 'tools_unavailable') return sample(verlauf, { signal: ctl.signal, onText, modelTier: 'default', cache: false }); throw e; });
    }).then(r => {
      text0.textContent = ''; text0.appendChild(md(r.text));
      S.chat.push({ rolle: 'ki', text: r.text });
      try { localStorage.setItem('dkakademie_chat', JSON.stringify(S.chat.slice(-20))); } catch (e) {}
    }).catch(e => {
      const c = e && e.code;
      text0.textContent = (e && e.text ? e.text + '\n\n' : '') + (c === 'cancelled' ? 'Gestoppt.' : c === 'not_granted' ? 'Die KI ist für diese Seite nicht freigegeben. Öffne die Akademie auf claude.ai und erlaube „Claude fragen“.' : c === 'rate_limited' ? 'Gerade zu viele Anfragen. Warte kurz und frag dann nochmal.' : 'Die KI antwortet gerade nicht. Versuch es gleich nochmal.');
      if (c !== 'cancelled') S.chat.pop();
    }).then(() => { senden.disabled = false; stopp.hidden = true; ctl = null; });
  }
  zeigeVerlauf();
  const vorschlaege = (thema ? ['Erklär mir „' + thema.titel + '“ einfacher', 'Stell mir 3 mündliche Prüfungsfragen dazu', 'Wie erkläre ich das einem Kunden?'] : ['Was lerne ich heute und warum ist das wichtig?', 'Stell mir 3 Prüfungsfragen zu dieser Woche', 'Zeig mir die Kniebeuge in 3D und erklär die Technik']);
  return [h('div', { class: 'stapel' }, h('h1', { text: 'Fragen an die KI' }),
      h('div', { class: 'ak-thema' }, thema ? [h('span', { class: 'chip gold', text: 'Thema: ' + thema.titel }), h('button', { class: 'knopf klein text', type: 'button', text: 'Thema lösen', onclick: () => { S.chatThema = null; zeichne(); } })] : h('span', { text: 'Frag alles zur B-Lizenz und zum Coachen. Die KI kennt deine Lektionen und dein System.' }))),
    h('div', { class: 'ak-chips' }, vorschlaege.map(v => h('button', { class: 'ak-chip', type: 'button', text: v, onclick: () => fragen(v) }))),
    log,
    h('div', { class: 'ak-eingabe' }, feld, h('div', { class: 'stapel' }, senden, stopp)),
    S.chat.length ? h('button', { class: 'knopf klein text', type: 'button', text: 'Verlauf leeren', onclick: () => { S.chat = []; try { localStorage.removeItem('dkakademie_chat'); } catch (e) {} zeichne(); } }) : null];
}

/* Start: auf claude.ai liegen die Inhalte als AK im Code, in der Web-App holt schloss.js sie entschlüsselt und ruft starte() */
function starte(ak) {
  P = ak.plan; L = ak.lektionen; planBauen();
  try { S.chat = JSON.parse(localStorage.getItem('dkakademie_chat') || '[]'); } catch (e) { S.chat = []; }
  Speicher.start();
  zeichne();
}
window.DKAkademie = { starte };
if (typeof AK !== 'undefined') starte(AK);
