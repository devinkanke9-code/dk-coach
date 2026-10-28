// DK Coach — Kunden-App. Läuft ohne Konto und offline.
// Der Plan kommt im Link (#p=…) vom Trainer, wird auf dem Handy gespeichert und nie an einen Server geschickt.
import { UEBUNGEN, STAND } from './daten.js';
import { erklaerPunkte, lesezeit, ART_NAME } from './coach.js';

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
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kinder.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const speicher = {
  lies(k, std) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : std; } catch (e) { return std; } },
  schreib(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
function toast(t) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = h('div', { class: 'toast', role: 'status', text: t }); document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
const bereich = (r, e) => !r ? '' : (r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]) + (e === 'sek' ? ' s' : '');
const heute = () => new Date().toISOString().slice(0, 10);
const MUSKEL = { brust: 'Brust', lat: 'Latissimus', oberer_ruecken: 'Oberer Rücken', trapez: 'Trapez', schulter_vorne: 'Vordere Schulter',
  schulter_seite: 'Seitliche Schulter', schulter_hinten: 'Hintere Schulter', bizeps: 'Bizeps', trizeps: 'Trizeps', unterarme: 'Unterarme',
  quadrizeps: 'Oberschenkel vorn', beinbeuger: 'Oberschenkel hinten', gesaess: 'Gesäß', adduktoren: 'Innenseite Bein', abduktoren: 'Außenseite Hüfte',
  waden: 'Waden', bauch: 'Bauch', seitlicher_rumpf: 'Seitlicher Rumpf', unterer_ruecken: 'Unterer Rücken' };
const ZIEL = { muskelaufbau: 'Muskelaufbau', kraft: 'Kraft', fettabbau: 'Fettabbau', gesundheit: 'Gesundheit', fitness_allgemein: 'Fitness',
  ruecken_gesund: 'Gesunder Rücken', beweglichkeit: 'Beweglichkeit', ausdauer: 'Ausdauer' };

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
    p.importiert = alt && alt.importiert || heute();
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
const S = { ansicht: 'heute', plan: null, tag: null };
function aktiverPlan() {
  const plaene = speicher.lies('dk_plaene', {});
  const id = speicher.lies('dk_aktiv', null);
  return plaene[id] || Object.values(plaene)[0] || null;
}
function uebung(u) {
  const d = UEBUNGEN[u.i] || {};
  return { id: u.i, name: u.nm || d.n || u.i, saetze: u.s, wdh: u.w, rir: u.r, pause: u.p, einheit: u.e || d.e, notiz: u.x, d };
}
function logHeute() { const log = speicher.lies('dk_log', {}); return log[heute()] || { tag: null, saetze: {}, kg: {} }; }
function logSpeichern(eintrag) { const log = speicher.lies('dk_log', {}); log[heute()] = eintrag; speicher.schreib('dk_log', log); }
function letzteKg(id) {
  const log = speicher.lies('dk_log', {});
  for (const d of Object.keys(log).sort().reverse()) { if (d === heute()) continue; const v = log[d].kg && log[d].kg[id]; if (v) return { kg: v, datum: d }; }
  return null;
}
function naechsterTag(p) {
  const log = speicher.lies('dk_log', {});
  const fertig = Object.keys(log).sort().reverse().find((d) => log[d].fertig && log[d].plan === p.id);
  if (!fertig) return 0;
  return (log[fertig].tag + 1) % p.t.length;
}
function aktuelleWoche(p) {
  const start = new Date(p.importiert || heute());
  const w = Math.floor((Date.now() - start.getTime()) / (7 * 864e5));
  return Math.max(0, Math.min((p.w || []).length - 1, w));
}

/* ---------- Leiste ---------- */
const BEREICHE = [
  ['heute', 'Heute', '<path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M9 14l2 2 4-4"/>'],
  ['plan', 'Plan', '<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6M9 16h4"/>'],
  ['uebungen', 'Übungen', '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M7 10l5 1 5-1"/>'],
  ['info', 'Infos', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>']
];
function leiste() {
  const n = $('#leiste'); n.textContent = '';
  n.hidden = !S.plan;
  for (const [id, name, icon] of BEREICHE) {
    const b = h('button', { 'aria-current': S.ansicht === id ? 'page' : null, onclick: () => geh(id) });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg>';
    b.append(h('span', { text: name })); n.append(b);
  }
}
function geh(id) { S.ansicht = id; zeichne(); window.scrollTo(0, 0); }
function zeichne() {
  S.plan = aktiverPlan();
  $('#wer').textContent = S.plan ? S.plan.n || '' : '';
  leiste();
  const ziel = $('#inhalt'); ziel.textContent = '';
  if (!S.plan) return ziel.append(...willkommen());
  ziel.append(...({ heute: ansichtHeute, plan: ansichtPlan, uebungen: ansichtUebungen, info: ansichtInfo }[S.ansicht])());
  vorschauenNachladen();
}

/* ---------- Willkommen ---------- */
function willkommen() {
  return [h('div', { class: 'leer' },
    h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
    h('h1', { text: 'Dein Trainingsplan' }),
    h('p', { class: 'leise', text: 'Öffne den Link, den dir dein Trainer geschickt hat. Danach ist dein Plan hier gespeichert und funktioniert auch ohne Internet.' }),
    h('button', { class: 'knopf', onclick: beispiel, text: 'Beispielplan ansehen' })),
    installHinweis()];
}
function beispiel() {
  const t = (n, u) => ({ n, u: u.map(([i, s, w, r, p]) => ({ i, s, w, r, p })) });
  const ids = Object.keys(UEBUNGEN);
  const nimm = (...k) => k.find((x) => UEBUNGEN[x]) || ids[0];
  const p = { v: 1, id: 'beispiel', n: 'Beispiel', z: 'muskelaufbau', l: 2, s: 'Ganzkörper 2×', d: heute(), importiert: heute(), w: ['e', 'a', 'a', 'a', 'a', 'd'],
    t: [t('Ganzkörper A', [[nimm('goblet_squat'), 3, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_bankdruecken', 'liegestuetz'), 3, [8, 12], [2, 3], [90, 120]], [nimm('brustgestuetztes_kurzhantelrudern', 'einarmiges_kurzhantelrudern'), 3, [8, 12], [2, 3], [90, 120]], [nimm('dead_bug'), 2, [8, 12], [2, 3], [60, 90]]]),
      t('Ganzkörper B', [[nimm('rumaenisches_kreuzheben_kurzhanteln', 'rumaenisches_kreuzheben_kh'), 3, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_schulterdruecken_sitzend'), 3, [8, 12], [2, 3], [90, 120]], [nimm('split_squat'), 2, [8, 12], [2, 3], [90, 120]], [nimm('seitheben_kurzhanteln'), 2, [12, 15], [2, 3], [60, 90]]])],
    pr: 'Schaffst du in allen Sätzen die obere Wiederholungszahl mit 2 Wiederholungen Reserve, nimm beim nächsten Mal etwas mehr Gewicht.', h: ['Beispiel mit erfundenen Daten.'], ab: [] };
  const plaene = speicher.lies('dk_plaene', {}); plaene[p.id] = p; speicher.schreib('dk_plaene', plaene); speicher.schreib('dk_aktiv', p.id);
  zeichne();
}

/* ---------- Heute ---------- */
function ansichtHeute() {
  const p = S.plan, log = logHeute();
  if (S.tag == null) S.tag = log.tag != null && log.plan === p.id ? log.tag : naechsterTag(p);
  const tag = p.t[S.tag] || p.t[0];
  const woche = (p.w || [])[aktuelleWoche(p)];
  const teile = [
    h('div', { class: 'reihe' }, h('h1', { text: tag.n })),
    woche ? h('p', { class: 'leise klein', text: 'Woche ' + (aktuelleWoche(p) + 1) + ' von ' + p.w.length + ' · ' + ({ e: 'Einstieg: Technik vor Gewicht', a: 'Aufbau: steigern nach Regel', d: 'Entlastung: weniger Sätze, leichter' }[woche] || '') }) : null,
    h('div', { class: 'tage', role: 'group', 'aria-label': 'Trainingstag' }, p.t.map((t, i) => h('button', { class: 'tag-chip', 'aria-pressed': i === S.tag ? 'true' : 'false', onclick: () => { S.tag = i; zeichne(); } },
      h('b', { text: 'Tag ' + (i + 1) }), h('span', { text: t.n }))))
  ];
  const offen = tag.u.findIndex((roh, ui) => ((log.plan === p.id && log.tag === S.tag && log.saetze[S.tag + '_' + ui]) || 0) < (woche === 'd' ? Math.max(1, Math.ceil(roh.s / 2)) : roh.s));
  teile.push(h('button', { class: 'start-knopf', onclick: () => starteEinheit(offen < 0 ? 0 : offen) },
    h('span', { class: 'start-icon', 'aria-hidden': 'true', text: '▶' }),
    h('span', null, h('b', { text: offen > 0 ? 'Training fortsetzen' : offen < 0 ? 'Training ansehen' : 'Training starten' }), h('br'), h('span', { class: 'klein', text: tag.u.length + ' Übungen · jede mit 3D-Figur' }))));
  const block = h('section', { class: 'block' });
  tag.u.forEach((roh, ui) => {
    const u = uebung(roh);
    const key = S.tag + '_' + ui;
    const fertig = (log.plan === p.id && log.tag === S.tag && log.saetze[key]) || 0;
    const satzZahl = woche === 'd' ? Math.max(1, Math.ceil(u.saetze / 2)) : u.saetze;
    const vorher = letzteKg(u.id);
    block.append(h('div', { class: 'ueb tippbar', onclick: karteTippen(u) },
      vorschauKnopf(u),
      h('div', null,
        h('button', { class: 'name', text: u.name }),
        h('div', { class: 'werte' },
          h('span', null, h('b', { text: satzZahl }), ' Sätze'), h('span', null, h('b', { text: bereich(u.wdh, u.einheit) }), u.einheit === 'sek' ? '' : ' Wdh'),
          u.rir ? h('span', null, 'Reserve ', h('b', { text: bereich(u.rir) })) : null, u.pause ? h('span', null, 'Pause ', h('b', { text: bereich(u.pause) + ' s' })) : null),
        u.notiz ? h('p', { class: 'notiz', text: u.notiz }) : null,
        h('div', { class: 'saetze' },
          Array.from({ length: satzZahl }, (_, i) => h('button', { class: 'satz' + (i < fertig ? ' fertig' : ''), 'aria-label': 'Satz ' + (i + 1) + (i < fertig ? ' erledigt' : ''),
            onclick: () => satzTippen(key, i, u) }, String(i + 1))),
          h('input', { class: 'kg', type: 'number', inputmode: 'decimal', step: '0.5', min: '0', placeholder: vorher ? vorher.kg + ' kg' : 'kg', 'aria-label': 'Gewicht in kg',
            value: (log.plan === p.id && log.kg && log.kg[u.id]) || '', onchange: (e) => { const l = logHeute(); l.plan = p.id; l.tag = S.tag; l.kg = l.kg || {}; l.kg[u.id] = e.target.value; logSpeichern(l); } })),
        vorher ? h('p', { class: 'notiz', text: 'Letztes Mal: ' + vorher.kg + ' kg' }) : null)));
  });
  teile.push(block);
  const alle = tag.u.reduce((a, _, ui) => a + ((log.plan === p.id && log.tag === S.tag && log.saetze[S.tag + '_' + ui]) || 0), 0);
  teile.push(h('button', { class: 'knopf haupt', onclick: trainingFertig, text: log.fertig && log.tag === S.tag ? 'Training erledigt ✓' : 'Training abschließen' }));
  if (p.pr) teile.push(h('section', { class: 'block' }, h('h2', { text: 'So steigerst du' }), h('p', { text: p.pr })));
  return teile;
}
function satzSetzen(key, i, u) {
  const l = logHeute(); l.plan = S.plan.id; l.tag = S.tag; l.saetze = l.saetze || {};
  const jetzt = l.saetze[key] || 0;
  l.saetze[key] = i < jetzt ? i : i + 1;
  logSpeichern(l);
  if (l.saetze[key] > jetzt && u.pause) pauseStarten(u.pause[0]);
}
function satzTippen(key, i, u) { satzSetzen(key, i, u); zeichne(); }
// Ganze Übungskarte antippen öffnet die 3D-Figur (Satz-Knöpfe und kg-Feld nicht)
function karteTippen(u) { return (ev) => { if (ev.target.closest('.satz, input, a')) return; oeffne3d(u); }; }
function trainingFertig() {
  const l = logHeute(); l.plan = S.plan.id; l.tag = S.tag; l.fertig = true; logSpeichern(l);
  toast('Stark. Training gespeichert.'); zeichne();
}
let pauseUhr = null;
function pauseStarten(sek) {
  clearInterval(pauseUhr); document.querySelectorAll('.timer').forEach((x) => x.remove());
  let rest = sek;
  const zahl = h('b', { text: '' });
  const el = h('div', { class: 'timer', role: 'timer' }, h('span', { class: 'leise klein', text: 'Pause' }), zahl,
    h('button', { class: 'knopf klein', onclick: () => { clearInterval(pauseUhr); el.remove(); }, text: 'Weiter' }));
  document.body.append(el);
  const ticken = () => {
    zahl.textContent = Math.floor(rest / 60) + ':' + String(rest % 60).padStart(2, '0');
    if (rest <= 0) { clearInterval(pauseUhr); zahl.textContent = 'Los'; try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} setTimeout(() => el.remove(), 2500); }
    rest--;
  };
  ticken(); pauseUhr = setInterval(ticken, 1000);
}

/* ---------- Plan ---------- */
function ansichtPlan() {
  const p = S.plan, jetzt = aktuelleWoche(p);
  const teile = [h('h1', { text: 'Dein Plan' }),
    h('p', { class: 'leise', text: [ZIEL[p.z] || p.z, p.s, p.t.length + '× pro Woche', p.w ? p.w.length + ' Wochen' : ''].filter(Boolean).join(' · ') })];
  if (p.ki) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Von deinem Coach' }), h('p', { text: p.ki })));
  if (p.w && p.w.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wochen' }),
    h('div', { class: 'wochen' }, p.w.map((ph, i) => h('div', { class: 'woche ' + ({ e: 'einstieg', a: 'aufbau', d: 'deload' }[ph] || '') + (i === jetzt ? ' jetzt' : '') },
      h('b', { text: 'W' + (i + 1) }), { e: 'Einstieg', a: 'Aufbau', d: 'Entlastung' }[ph] || ''))),
    p.dl ? h('p', { class: 'klein leise', text: 'Entlastungswoche: ' + p.dl }) : null));
  p.t.forEach((t, ti) => {
    teile.push(h('section', { class: 'block' }, h('h2', { text: 'Tag ' + (ti + 1) + ' · ' + t.n }),
      h('div', null, t.u.map((roh) => { const u = uebung(roh); return h('div', { class: 'ueb tippbar', onclick: karteTippen(u) }, vorschauKnopf(u),
        h('div', null, h('button', { class: 'name', text: u.name }),
          h('div', { class: 'werte' }, h('span', null, h('b', { text: u.saetze }), ' × ', h('b', { text: bereich(u.wdh, u.einheit) })), u.rir ? h('span', null, 'Reserve ', h('b', { text: bereich(u.rir) })) : null, u.pause ? h('span', null, 'Pause ', h('b', { text: bereich(u.pause) + ' s' })) : null),
          u.notiz ? h('p', { class: 'notiz', text: u.notiz }) : null)); }))));
  });
  if (p.pr) teile.push(h('section', { class: 'block' }, h('h2', { text: 'So steigerst du' }), h('p', { text: p.pr })));
  return teile;
}

/* ---------- Übungen ---------- */
function ansichtUebungen() {
  const p = S.plan, gesehen = new Set(), liste = [];
  p.t.forEach((t) => t.u.forEach((roh) => { if (!gesehen.has(roh.i + (roh.nm || ''))) { gesehen.add(roh.i + (roh.nm || '')); liste.push(uebung(roh)); } }));
  return [h('h1', { text: 'Übungen' }), h('p', { class: 'leise', text: 'Tippe auf eine Übung: Die Figur zeigt dir die Bewegung in 3D. Mit dem Finger drehst du sie rundum.' }),
    h('div', { class: 'liste-ueb' }, liste.map((u) => h('button', { onclick: () => oeffne3d(u) },
      h('span', { class: 'mini', 'data-vorschau': u.d.a ? u.id : '' }, u.d.a ? '3D' : '–'),
      h('span', null, h('b', { text: u.name }), h('br'), h('span', { class: 'leise klein', text: (u.d.m || []).map((m) => MUSKEL[m] || m).join(', ') })))))];
}

/* ---------- Infos ---------- */
let installEreignis = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEreignis = e; if (S.ansicht === 'info' || !S.plan) zeichne(); });
function installiert() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function installHinweis() {
  if (installiert()) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return h('section', { class: 'block' }, h('h2', { text: 'Als App aufs Handy' }),
    installEreignis ? h('button', { class: 'knopf haupt', onclick: async () => { installEreignis.prompt(); await installEreignis.userChoice; installEreignis = null; zeichne(); }, text: 'App installieren' })
      : h('p', { text: ios ? 'In Safari unten auf „Teilen“ tippen, dann „Zum Home-Bildschirm“. Danach startest du DK Coach wie eine App, auch ohne Internet.'
        : 'Im Browser-Menü (⋮) „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen. Danach startest du DK Coach wie eine App, auch ohne Internet.' }));
}
function ansichtInfo() {
  const p = S.plan;
  const teile = [h('h1', { text: 'Infos' })];
  teile.push(installHinweis());
  if (p.h && p.h.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wichtig für dich' }), h('ul', null, p.h.map((x) => h('li', { text: x })))));
  if (p.ab && p.ab.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Sofort aufhören bei' }), h('ul', null, p.ab.map((x) => h('li', { text: x })))));
  if (p.ar && p.ar.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wenn es wehtut' }), p.ar.map((r) => h('p', { class: 'klein' }, h('b', { text: r.t + ': ' }), r.x))));
  if (p.sh) teile.push(h('p', { class: 'meldung klein', text: p.sh }));
  teile.push(h('section', { class: 'block' }, h('h2', { text: 'Begriffe' }),
    h('p', { class: 'klein', text: 'Reserve (RIR): Wiederholungen, die du am Ende des Satzes noch schaffen würdest. Reserve 2 heißt: aufhören, wenn noch zwei gehen würden.' }),
    h('p', { class: 'klein', text: 'Pause: Zeit zwischen zwei Sätzen. Tippst du einen Satz ab, startet die Uhr.' })));
  const plaene = Object.values(speicher.lies('dk_plaene', {}));
  teile.push(h('section', { class: 'block' }, h('h2', { text: 'Gespeichert' }),
    h('p', { class: 'klein leise', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + ' · nur auf diesem Handy · Übungsdaten Stand ' + STAND }),
    plaene.length > 1 ? h('div', { class: 'reihe' }, plaene.map((x) => h('button', { class: 'knopf klein', onclick: () => { speicher.schreib('dk_aktiv', x.id); S.tag = null; zeichne(); }, text: (x.id === p.id ? '✓ ' : '') + (x.n || 'Plan') + ' · ' + (x.s || '') }))) : null,
    h('button', { class: 'knopf klein', onclick: planLoeschen, text: 'Diesen Plan vom Handy löschen' })));
  return teile;
}
function planLoeschen(e) {
  const b = e.currentTarget;
  if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich löschen? Nochmal tippen'; return; }
  const plaene = speicher.lies('dk_plaene', {}); delete plaene[S.plan.id]; speicher.schreib('dk_plaene', plaene);
  speicher.schreib('dk_aktiv', Object.keys(plaene)[0] || null); S.tag = null; zeichne();
}

/* ---------- 3D ---------- */
let modul3d = null;
async function lade3d() {
  if (!modul3d) modul3d = Promise.all([import('./figur.js'), import('./bewegungen.js')]).then(([f, b]) => ({ ...f, ...b }));
  return modul3d;
}
function vorschauKnopf(u) {
  return h('button', { class: 'bild', 'aria-label': u.name + ' in 3D ansehen', 'data-vorschau': u.d.a ? u.id : '' });
}
const vorschauCache = new Map();
let vorschauAnsicht = null;
async function vorschauenNachladen() {
  const ziele = [...document.querySelectorAll('[data-vorschau]')].filter((el) => el.dataset.vorschau && !el.querySelector('img'));
  if (!ziele.length) return;
  const M = await lade3d();
  if (!vorschauAnsicht) {
    const c = document.createElement('canvas'); c.width = 192; c.height = 192; c.style.cssText = 'position:fixed;left:-500px;top:0;width:192px;height:192px';
    document.body.append(c);
    vorschauAnsicht = new M.Ansicht(c, { standbild: true, hintergrund: 0x23262a });
  }
  for (const el of ziele) {
    const id = el.dataset.vorschau;
    if (!vorschauCache.has(id)) {
      const a = M.animation(UEBUNGEN[id].a);
      if (!a) continue;
      vorschauAnsicht.zeige(a, UEBUNGEN[id].m);
      vorschauAnsicht.standbild(0.55);
      vorschauCache.set(id, vorschauAnsicht.canvas.toDataURL('image/jpeg', 0.82));
      await new Promise((r) => setTimeout(r, 0));
    }
    el.textContent = ''; el.append(h('img', { src: vorschauCache.get(id), alt: '' }));
  }
}
// 3D-Bühne mit Drehknöpfen: dreht per Finger oder Knopf, die Übung läuft dabei weiter
function buehne() {
  const canvas = h('canvas', { 'aria-label': '3D-Figur, mit dem Finger drehen' });
  const knopf = (text, label, fn, extra) => h('button', Object.assign({ class: 'rund', 'aria-label': label, onclick: fn, text }, extra || {}));
  let ansicht = null;
  const auto = knopf('360°', 'Automatisch drehen', () => { const an = !ansicht.steuerung.autoRotate; ansicht.autoDrehen(an); auto.setAttribute('aria-pressed', String(an)); }, { 'aria-pressed': 'true' });
  const pause = knopf('❚❚', 'Pause', () => { ansicht.laeuft = !ansicht.laeuft; pause.setAttribute('aria-pressed', String(!ansicht.laeuft)); pause.textContent = ansicht.laeuft ? '❚❚' : '▶'; }, { 'aria-pressed': 'false' });
  const langsam = knopf('½×', 'Langsam', () => { ansicht.tempo = ansicht.tempo === 1 ? 0.4 : 1; langsam.setAttribute('aria-pressed', String(ansicht.tempo !== 1)); }, { 'aria-pressed': 'false' });
  const links = knopf('⟲', 'Nach links drehen', () => { ansicht.drehe(-45); auto.setAttribute('aria-pressed', 'false'); });
  const rechts = knopf('⟳', 'Nach rechts drehen', () => { ansicht.drehe(45); auto.setAttribute('aria-pressed', 'false'); });
  // Foto neben der Figur: So macht's Devin (nur wenn es zur Übung ein Foto gibt)
  const fotoBild = h('img', { alt: '', onerror: () => { foto.hidden = true; } });
  const foto = h('button', { class: 'devin-foto', hidden: true, 'aria-label': 'Foto vergrößern: So macht’s Devin', onclick: () => fotoGross(fotoBild.src) },
    fotoBild, h('span', { text: 'So macht’s Devin' }));
  // Coach DK erklärt: Figur hält an, Körperteil leuchtet, Pfeil und Text (ohne Stimme)
  let gezeigt = null, erk = null;
  const erklaerKnopf = h('button', { class: 'erklaer-knopf', hidden: true, onclick: () => {
    if (!ansicht || !gezeigt) return;
    if (erk) erk.ende();
    erk = erklaerung(ansicht, gezeigt, el, () => { erk = null; ansicht.autoDrehen(auto.getAttribute('aria-pressed') === 'true'); });
  } }, h('span', { class: 'ek-welle', 'aria-hidden': 'true' }), 'Coach DK erklärt');
  const el = h('div', { class: 'buehne' }, h('div', { class: 'glanz' }), canvas, foto, erklaerKnopf,
    h('div', { class: 'steuer' }, links, auto, pause, langsam, rechts),
    h('p', { class: 'tipp', text: 'Wischen zum Drehen · zwei Finger zum Zoomen' }));
  const passe = () => ansicht && ansicht.groesse();
  const beobachter = window.ResizeObserver ? new ResizeObserver(passe) : null;
  return {
    el,
    async zeige(d) {
      if (erk) erk.ende();
      gezeigt = d;
      foto.hidden = !d.b;
      if (d.b) fotoBild.src = d.b;
      el.classList.toggle('ohne', !d.a);
      erklaerKnopf.hidden = !d.a || !erklaerPunkte(d).length;
      if (!d.a) return;
      const M = await lade3d();
      if (!el.isConnected) return;
      if (!ansicht) {
        ansicht = new M.Ansicht(canvas, { effekte: true });
        ansicht.beiDrehStopp = () => auto.setAttribute('aria-pressed', 'false');
        ansicht.start();
        if (beobachter) beobachter.observe(canvas); else window.addEventListener('resize', passe);
      }
      el.classList.remove('wechsel'); void el.offsetWidth; el.classList.add('wechsel');
      ansicht.groesse();
      ansicht.zeige(M.animation(d.a), d.m);
      ansicht.autoDrehen(auto.getAttribute('aria-pressed') === 'true');
    },
    weg() { if (erk) erk.ende(); if (ansicht) ansicht.entsorgen(); if (beobachter) beobachter.disconnect(); window.removeEventListener('resize', passe); }
  };
}
// Erklärt eine Übung Punkt für Punkt auf der 3D-Bühne. fertig() kommt, wenn die Erklärung zu Ende ist oder abgebrochen wurde.
function erklaerung(ansicht, d, buehneEl, fertig) {
  const punkte = erklaerPunkte(d);
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
  const pfeil = svg('svg', { class: 'erklaer-pfeil', 'aria-hidden': 'true' });
  const spitze = svg('marker', { id: 'ek-spitze', viewBox: '0 0 10 10', refX: '6', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' });
  spitze.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'currentColor' }));
  const defs = svg('defs'); defs.append(spitze);
  const linie = svg('path', { class: 'ek-linie', 'marker-end': 'url(#ek-spitze)' });
  const kern = svg('circle', { class: 'ek-kern', r: '7' });
  pfeil.append(defs, linie, kern);
  const art = h('span', { class: 'eb-art' });
  const text = h('p', { class: 'eb-text' });
  const leiste = h('div', { class: 'eb-punkte' });
  // Zeitleiste: zeigt, wann der nächste Punkt kommt
  const zeit = h('div', { class: 'eb-zeit' }, h('i'));
  const pauseKnopf = h('button', { class: 'eb-knopf', 'aria-label': 'Pause', text: '❚❚', onclick: () => { pausiert = !pausiert; pauseKnopf.textContent = pausiert ? '▶' : '❚❚'; pauseKnopf.setAttribute('aria-label', pausiert ? 'Weiter' : 'Pause'); gehe(Math.max(0, i)); } });
  const blase = h('div', { class: 'erklaer-blase', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'eb-kopf' }, art, h('button', { class: 'eb-knopf', 'aria-label': 'Erklärung beenden', text: '✕', onclick: () => ende() })),
    text,
    h('div', { class: 'eb-nav' },
      h('button', { class: 'eb-knopf', 'aria-label': 'Vorheriger Punkt', text: '◀', onclick: () => gehe(Math.max(0, i - 1)) }),
      leiste, pauseKnopf,
      h('button', { class: 'eb-knopf', 'aria-label': 'Nächster Punkt', text: '▶', onclick: () => gehe(i + 1) })),
    zeit);
  buehneEl.append(pfeil, blase);
  buehneEl.classList.add('erklaert');
  ansicht.autoDrehen(false);
  let i = -1, pausiert = false, warte = null, vorbei = false, oben = false;

  // Pfeil von der Blase zum leuchtenden Körperteil, jedes Bild neu; die Blase weicht nach oben aus, wenn das Teil dahinter wäre
  ansicht.beiBild = () => {
    const pos = ansicht.hinweisBildschirm();
    if (!pos || !pos.sichtbar) { pfeil.classList.remove('an'); return; }
    const H = buehneEl.clientHeight, bh = blase.offsetHeight;
    if (!oben && pos.y > H - bh - 40) oben = true; else if (oben && pos.y < H - bh - 120) oben = false;
    blase.classList.toggle('oben', oben);
    const ax = Math.min(Math.max(pos.x, blase.offsetLeft + 30), blase.offsetLeft + blase.offsetWidth - 30);
    const ay = oben ? blase.offsetTop + bh + 4 : blase.offsetTop - 4;
    const dx = pos.x - ax, dy = pos.y - ay, l = Math.hypot(dx, dy) || 1;
    if (l < 40) { pfeil.classList.remove('an'); return; }
    const ex = pos.x - dx / l * 22, ey = pos.y - dy / l * 22;
    linie.setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} Q${ax.toFixed(1)},${((ay + ey) / 2).toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`);
    kern.setAttribute('cx', pos.x.toFixed(1)); kern.setAttribute('cy', pos.y.toFixed(1));
    pfeil.classList.add('an');
  };
  function zeigeBlase(kopf, inhalt, klasse) {
    blase.className = 'erklaer-blase ' + klasse + (oben ? ' oben' : '');
    pfeil.setAttribute('class', 'erklaer-pfeil ' + klasse);
    art.textContent = kopf; text.textContent = inhalt;
    text.classList.remove('neu'); void text.offsetWidth; text.classList.add('neu');
    leiste.textContent = '';
    punkte.forEach((p, j) => leiste.append(h('span', { class: 'eb-p ' + p.art + (j === i ? ' jetzt' : j < i ? ' war' : '') })));
  }
  function stoppen() { clearTimeout(warte); zeit.firstChild.style.transition = 'none'; zeit.firstChild.style.width = '0'; }
  // Nach ms zum nächsten Schritt; die Zeitleiste läuft dabei voll
  function spaeter(ms, weiter) {
    const balken = zeit.firstChild;
    void balken.offsetWidth;
    balken.style.transition = 'width ' + ms + 'ms linear'; balken.style.width = '100%';
    warte = setTimeout(weiter, ms);
  }
  function gehe(n) {
    if (vorbei) return;
    stoppen();
    if (n >= punkte.length) return schluss();
    i = n;
    const p = punkte[i];
    ansicht.hinweis(p.teil ? p : null);
    zeigeBlase(ART_NAME[p.art] + ' · ' + (i + 1) + '/' + punkte.length, p.text, p.art);
    if (!pausiert) spaeter(lesezeit(p.text), () => gehe(i + 1));
  }
  function schluss() {
    i = punkte.length;
    ansicht.hinweis(null);
    zeigeBlase('Coach DK', 'Jetzt bist du dran. Achte auf diese Punkte!', 'technik');
    spaeter(2600, ende);
  }
  function ende() {
    if (vorbei) return;
    vorbei = true; stoppen();
    ansicht.beiBild = null; ansicht.hinweis(null);
    pfeil.remove(); blase.remove(); buehneEl.classList.remove('erklaert');
    fertig();
  }
  // Start: Name der Übung, dann Punkt für Punkt
  zeigeBlase('Coach DK erklärt', d.n, 'technik');
  spaeter(1800, () => gehe(0));
  return { ende };
}
function muskelChips(d) { return h('div', { class: 'reihe' }, (d.m || []).map((m, i) => h('span', { class: 'muskel' + (i ? '' : ' haupt'), text: MUSKEL[m] || m }))); }
// Vollbild-Ebene, die mit der Zurück-Taste zugeht
function ebene(klasse, label) {
  const el = h('div', { class: klasse, role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
  let beimSchliessen = null;
  const zu = () => { window.removeEventListener('popstate', zu); if (beimSchliessen) beimSchliessen(); el.remove(); };
  document.body.append(el);
  history.pushState({ ebene: 1 }, '');
  window.addEventListener('popstate', zu);
  return { el, schliessen: () => history.back(), set beimSchliessen(f) { beimSchliessen = f; } };
}
function fotoGross(src) {
  const e = ebene('foto-gross', 'So macht’s Devin');
  e.el.append(h('div', { class: 'blatt-kopf' }, h('button', { class: 'zu', 'aria-label': 'Schließen', onclick: e.schliessen, text: '✕' })),
    h('img', { src, alt: 'Devin zeigt die Übung', onclick: e.schliessen }), h('p', { text: 'So macht’s Devin' }));
}
// Fotos der Plan-Übungen einmal laden: Der Offline-Speicher behält sie, so sind sie auch ohne Netz im Gym da
function fotosVorladen() {
  if (!S.plan || navigator.onLine === false) return;
  const pfade = new Set();
  for (const t of S.plan.t || []) for (const x of t.u || []) { const d = UEBUNGEN[x.i]; if (d && d.b) pfade.add(d.b); }
  if (pfade.size) setTimeout(() => pfade.forEach((p) => fetch(p).catch(() => {})), 2500);
}
async function oeffne3d(u) {
  const d = u.d;
  const e = ebene('blatt', u.name);
  const b = buehne();
  e.beimSchliessen = () => b.weg();
  e.el.append(
    h('div', { class: 'blatt-kopf' }, h('button', { class: 'zu', 'aria-label': 'Schließen', onclick: e.schliessen, text: '✕' })),
    b.el,
    h('div', { class: 'namensband' }, h('h3', { text: u.name }), muskelChips(d)),
    h('div', { class: 'blatt-info' },
      u.saetze ? h('p', { class: 'klein' }, h('b', { text: u.saetze + ' × ' + bereich(u.wdh, u.einheit) }), u.rir ? ' · Reserve ' + bereich(u.rir) : '', u.pause ? ' · Pause ' + bereich(u.pause) + ' s' : '') : null,
      d.t && d.t.length ? h('div', null, h('h2', { text: 'So geht’s' }), h('ul', null, d.t.map((x) => h('li', { text: x })))) : null,
      d.f && d.f.length ? h('div', null, h('h2', { text: 'Typische Fehler' }), h('ul', null, d.f.map((x) => h('li', { text: x })))) : null,
      d.v && d.v.length ? h('p', { class: 'klein leise', text: 'Vorsicht: ' + d.v.join(' ') }) : null));
  b.zeige(d);
}

/* ---------- Einheit: Training Schritt für Schritt mit 3D-Figur ---------- */
function starteEinheit(start = 0) {
  const p = S.plan, tag = p.t[S.tag] || p.t[0], woche = (p.w || [])[aktuelleWoche(p)];
  const liste = tag.u.map(uebung);
  let i = Math.max(0, Math.min(start, liste.length - 1));
  const e = ebene('einheit', 'Training: ' + tag.n);
  const b = buehne();
  e.beimSchliessen = () => { b.weg(); zeichne(); };
  const fortschritt = h('div', { class: 'fortschritt' });
  const zaehler = h('span', { class: 'zaehler' });
  const unten = h('div', { class: 'einheit-unten' });
  e.el.append(h('div', { class: 'einheit-kopf' }, h('button', { class: 'zu', 'aria-label': 'Training schließen', onclick: e.schliessen, text: '✕' }), h('div', { class: 'einheit-titel' }, h('b', { text: tag.n }), zaehler)), fortschritt, b.el, unten);
  const satzZahl = (u) => woche === 'd' ? Math.max(1, Math.ceil(u.saetze / 2)) : u.saetze;
  const erledigt = (ui) => { const l = logHeute(); return (l.plan === p.id && l.tag === S.tag && l.saetze[S.tag + '_' + ui]) || 0; };
  function zeigen() {
    const u = liste[i], key = S.tag + '_' + i, n = satzZahl(u), fertig = erledigt(i);
    zaehler.textContent = 'Übung ' + (i + 1) + ' von ' + liste.length;
    fortschritt.textContent = '';
    liste.forEach((x, j) => fortschritt.append(h('button', { class: 'punkt' + (j === i ? ' jetzt' : '') + (erledigt(j) >= satzZahl(x) ? ' fertig' : ''), 'aria-label': 'Übung ' + (j + 1) + ': ' + x.name, onclick: () => { i = j; zeigen(); } })));
    const vorher = letzteKg(u.id), l0 = logHeute();
    unten.textContent = '';
    unten.append(...[
      h('div', { class: 'namensband gross' }, h('h3', { text: u.name }), muskelChips(u.d)),
      h('div', { class: 'werte gross' },
        h('span', null, h('b', { text: Math.min(fertig + 1, n) + '/' + n }), ' Satz'), h('span', null, h('b', { text: bereich(u.wdh, u.einheit) }), u.einheit === 'sek' ? '' : ' Wdh'),
        u.rir ? h('span', null, 'Reserve ', h('b', { text: bereich(u.rir) })) : null, u.pause ? h('span', null, 'Pause ', h('b', { text: bereich(u.pause) + ' s' })) : null),
      u.notiz ? h('p', { class: 'notiz', text: u.notiz }) : null,
      h('div', { class: 'saetze gross' },
        Array.from({ length: n }, (_, k) => h('button', { class: 'satz' + (k < fertig ? ' fertig' : ''), 'aria-label': 'Satz ' + (k + 1) + (k < fertig ? ' erledigt' : ''),
          onclick: () => { satzSetzen(key, k, u); if (erledigt(i) >= n && i < liste.length - 1) toast('Übung geschafft. Weiter geht’s!'); zeigen(); } }, String(k + 1))),
        h('input', { class: 'kg', type: 'number', inputmode: 'decimal', step: '0.5', min: '0', placeholder: vorher ? vorher.kg + ' kg' : 'kg', 'aria-label': 'Gewicht in kg',
          value: (l0.plan === p.id && l0.kg && l0.kg[u.id]) || '', onchange: (ev) => { const l = logHeute(); l.plan = p.id; l.tag = S.tag; l.kg = l.kg || {}; l.kg[u.id] = ev.target.value; logSpeichern(l); } })),
      vorher ? h('p', { class: 'notiz', text: 'Letztes Mal: ' + vorher.kg + ' kg' }) : null,
      u.d.t && u.d.t.length ? h('details', { class: 'technik' }, h('summary', { text: 'So geht’s' }), h('ul', null, u.d.t.map((x) => h('li', { text: x })))) : null,
      h('div', { class: 'einheit-nav' },
        h('button', { class: 'knopf', disabled: i === 0, onclick: () => { i--; zeigen(); }, text: '← Zurück' }),
        i < liste.length - 1 ? h('button', { class: 'knopf haupt', onclick: () => { i++; zeigen(); }, text: 'Nächste Übung →' })
          : h('button', { class: 'knopf haupt', onclick: () => { trainingFertig(); e.schliessen(); }, text: 'Training abschließen ✓' }))].filter(Boolean));
    if (b.aktuell !== u.id) { b.aktuell = u.id; b.zeige(u.d); }
  }
  zeigen();
}

/* ---------- Start ---------- */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
(async () => {
  await linkEinlesen();
  zeichne();
  fotosVorladen();
})();
window.addEventListener('hashchange', async () => { if (await linkEinlesen()) { S.tag = null; zeichne(); fotosVorladen(); } });
