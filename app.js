// DK Coach — Kunden-App. Läuft ohne Konto und offline.
// Der Plan kommt im Link (#p=…) vom Trainer, wird auf dem Handy gespeichert und nie an einen Server geschickt.
// Aussehen und Abläufe wie die Kunden-Ansicht der Trainer-Seite (stil.css, gleiche Bausteine), dazu die 3D-Figur (buehne.js).
import { UEBUNGEN, STAND } from './daten.js';
import { buehne, standbilder } from './buehne.js';

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

async function linkEinlesen() {
  const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return null;
  try {
    const p = await entpacke(m[1]);
    if (!pruefePlan(p)) throw new Error('kein Plan');
    p.id = p.id || ('p' + Date.now().toString(36));
    const plaene = speicher.lies('dk_plaene', {});
    const alt = plaene[p.id];
    p.importiert = alt && alt.importiert || isoHeute();
    plaene[p.id] = p;
    speicher.schreib('dk_plaene', plaene);
    speicher.schreib('dk_aktiv', p.id);
    history.replaceState(null, '', location.pathname + location.search);
    toast(alt ? 'Plan aktualisiert' : 'Plan gespeichert – ab jetzt auch ohne Internet');
    return p;
  } catch (e) {
    history.replaceState(null, '', location.pathname + location.search);
    toast('Der Link ist unvollständig. Lass ihn dir nochmal schicken.');
    return null;
  }
}

/* ---------- Zustand ---------- */
const S = { ansicht: 'heute', plan: null, tagWahl: null };
function aktiverPlan() {
  const plaene = speicher.lies('dk_plaene', {});
  const id = speicher.lies('dk_aktiv', null);
  return plaene[id] || Object.values(plaene)[0] || null;
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
function zeichne() {
  S.plan = aktiverPlan();
  $('#wer').textContent = S.plan ? (navigator.onLine === false ? 'Offline · alles da' : vorname(S.plan.n)) : '';
  leiste();
  const ziel = $('#ansicht'); ziel.textContent = '';
  if (!S.plan) ziel.append(...willkommen().filter(Boolean));
  else ziel.append(...({ heute: ansichtHeute, plan: ansichtPlan, uebungen: ansichtUebungen, info: ansichtInfo }[S.ansicht] || ansichtHeute)().filter(Boolean));
  standbilder(lade3d, [...document.querySelectorAll('[data-vorschau]')].filter((el) => el.dataset.vorschau && !el.querySelector('img')), (id) => UEBUNGEN[id]).catch(() => {});
  if (LAUF && LAUF.phase !== 'fertig' && !TM.el) setTimeout(timerZeigen, 0);   // laufendes Training nach Neuladen wieder zeigen
}

/* ---------- Willkommen ---------- */
function willkommen() {
  return [h('section', { class: 'block willkommen' },
    h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
    h('h1', { text: 'Dein Trainingsplan' }),
    h('p', { class: 'leise', text: 'Öffne den Link, den dir dein Trainer geschickt hat. Danach ist dein Plan hier gespeichert und funktioniert auch ohne Internet.' }),
    h('button', { class: 'knopf', type: 'button', onclick: beispiel, text: 'Beispielplan ansehen' })),
    installKarte(true)];
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
const installiert = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Anleitung: als App auf den Home-Bildschirm (bis der Kunde sie wegtippt; unter Infos immer)
function installKarte(immer) {
  if (installiert() || (!immer && speicher.lies('dk_install_weg', false))) return null;
  const ua = navigator.userAgent || '', ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
  const iphone = ['Öffne den Link in Safari, nicht in WhatsApp.', 'Tippe unten auf Teilen (Viereck mit Pfeil nach oben).', 'Wähle „Zum Home-Bildschirm“ und nenne es „DK Coach“.'];
  const andro = ['Öffne den Link in Chrome, nicht in WhatsApp.', 'Tippe oben rechts auf ⋮.', 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'];
  const liste = (titel, schritte) => h('div', null, titel ? h('b', { class: 'klein', text: titel }) : null, h('ol', { class: 'klein' }, schritte.map((s) => h('li', { text: s }))));
  return h('section', { class: 'block' }, h('h2', { text: 'Als App aufs Handy' }),
    h('p', { class: 'leise klein', text: 'Dann öffnest du deinen Plan mit einem Tipp vom Home-Bildschirm, auch ohne Internet.' }),
    installEreignis ? h('button', { class: 'knopf haupt', type: 'button', onclick: async () => { installEreignis.prompt(); await installEreignis.userChoice; installEreignis = null; zeichne(); }, text: 'App installieren' })
      : ios ? liste('', iphone) : android ? liste('', andro) : [liste('iPhone', iphone), liste('Android', andro)],
    !immer ? h('button', { class: 'knopf klein', type: 'button', onclick: () => { speicher.schreib('dk_install_weg', true); zeichne(); }, text: 'Erledigt, ausblenden' }) : null);
}
function ansichtInfo() {
  const p = S.plan;
  const plaene = Object.values(speicher.lies('dk_plaene', {}));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Infos' })),
    installKarte(true),
    h('section', { class: 'block' }, h('h2', { text: 'Begriffe' }),
      h('p', { class: 'klein', text: 'Reserve (RIR): Wiederholungen, die du am Ende des Satzes noch schaffen würdest. RIR 2 heißt: aufhören, wenn noch zwei gehen würden.' }),
      h('p', { class: 'klein', text: 'Pause: Zeit zwischen zwei Sätzen. Im Training läuft sie als Ring und geht danach von selbst weiter.' }),
      h('p', { class: 'klein', text: 'Coach DK erklärt: Knopf auf jeder 3D-Figur. Die Figur hält an der wichtigen Stelle an und zeigt dir, worauf du achten musst.' })),
    h('section', { class: 'block' }, h('h2', { text: 'Gespeichert' }),
      h('p', { class: 'klein leise', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + ' · nur auf diesem Handy · Übungsdaten Stand ' + new Date(STAND).toLocaleDateString('de-DE') }),
      plaene.length > 1 ? h('div', { class: 'reihe' }, plaene.map((x) => h('button', { class: 'knopf klein', type: 'button', onclick: () => { speicher.schreib('dk_aktiv', x.id); S.tagWahl = null; zeichne(); }, text: (x.id === p.id ? '✓ ' : '') + (x.n || 'Plan') + (x.s ? ' · ' + x.s : '') }))) : null,
      h('button', { class: 'knopf klein', type: 'button', onclick: planLoeschen, text: 'Diesen Plan vom Handy löschen' }))];
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
  await linkEinlesen();
  zeichne();
  fotosVorladen();
})();
window.addEventListener('hashchange', async () => { if (await linkEinlesen()) { S.tagWahl = null; zeichne(); fotosVorladen(); } });
window.addEventListener('online', zeichne);
window.addEventListener('offline', zeichne);
