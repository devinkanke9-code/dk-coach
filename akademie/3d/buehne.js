// DK Coach — 3D-Bühne mit Drehknöpfen, Foto „So macht's Devin“ und „Coach DK erklärt“.
// Gemeinsam für Kunden-App (app.js) und Trainer-Seite (app/src/index.html lädt es aus 3d/). Aussehen: buehne.css.
// d = Übung wie in daten.js: { n: Name, m: Muskeln, a: 3D-Eintrag, t/f/v: Technik/Fehler/Vorsicht, k: eigene Erklärpunkte, b: Foto }
// lade3d() liefert die 3D-Module zusammen ({ Ansicht, animation, … }).
import { erklaerPunkte, lesezeit, ART_NAME } from './coach.js';

function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kinder.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// Bühne: dreht per Finger oder Knopf, die Übung läuft dabei weiter. fotoGross(src) zeigt das Foto groß (optional).
export function buehne({ lade3d, fotoGross }) {
  const canvas = h('canvas', { 'aria-label': '3D-Figur, mit dem Finger drehen' });
  const knopf = (text, label, fn, extra) => h('button', Object.assign({ class: 'rund', type: 'button', 'aria-label': label, onclick: fn, text }, extra || {}));
  let ansicht = null;
  const auto = knopf('360°', 'Automatisch drehen', () => { if (!ansicht) return; const an = !ansicht.steuerung.autoRotate; ansicht.autoDrehen(an); auto.setAttribute('aria-pressed', String(an)); }, { 'aria-pressed': 'true' });
  const pause = knopf('❚❚', 'Pause', () => { if (!ansicht) return; ansicht.laeuft = !ansicht.laeuft; pause.setAttribute('aria-pressed', String(!ansicht.laeuft)); pause.textContent = ansicht.laeuft ? '❚❚' : '▶'; }, { 'aria-pressed': 'false' });
  const langsam = knopf('½×', 'Langsam', () => { if (!ansicht) return; ansicht.tempo = ansicht.tempo === 1 ? 0.4 : 1; langsam.setAttribute('aria-pressed', String(ansicht.tempo !== 1)); }, { 'aria-pressed': 'false' });
  const links = knopf('⟲', 'Nach links drehen', () => { if (!ansicht) return; ansicht.drehe(-45); auto.setAttribute('aria-pressed', 'false'); });
  const rechts = knopf('⟳', 'Nach rechts drehen', () => { if (!ansicht) return; ansicht.drehe(45); auto.setAttribute('aria-pressed', 'false'); });
  // Foto neben der Figur: So macht's Devin (nur wenn es zur Übung ein Foto gibt)
  const fotoBild = h('img', { alt: '', onerror: () => { foto.hidden = true; } });
  const foto = h('button', { class: 'devin-foto', type: 'button', hidden: true, 'aria-label': 'Foto vergrößern: So macht’s Devin', onclick: () => fotoGross && fotoGross(fotoBild.src) },
    fotoBild, h('span', { text: 'So macht’s Devin' }));
  // Coach DK erklärt: Figur hält an, Körperteil leuchtet, Pfeil und Text (ohne Stimme)
  let gezeigt = null, erk = null, zuletzt = null;
  const erklaerKnopf = h('button', { class: 'erklaer-knopf', type: 'button', hidden: true, onclick: () => {
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
      if (!ansicht) el.classList.add('laedt');
      let M;
      try { M = await lade3d(); } catch (e) { el.classList.remove('laedt'); el.classList.add('ohne'); return; }
      el.classList.remove('laedt');
      if (!el.isConnected || gezeigt !== d) return;
      if (!ansicht) {
        // Licht und Ringe der Bühne in den Farben der Seite (Farbwelt in stil.css)
        const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || undefined;
        ansicht = new M.Ansicht(canvas, { effekte: true, farbeA: css('--verlauf-a'), farbeB: css('--verlauf-b') });
        ansicht.beiDrehStopp = () => auto.setAttribute('aria-pressed', 'false');
        ansicht.start();
        if (beobachter) beobachter.observe(canvas); else window.addEventListener('resize', passe);
      }
      el.classList.remove('wechsel'); void el.offsetWidth; el.classList.add('wechsel');
      ansicht.groesse();
      // Ablauf davor (hinlaufen, greifen) nur, wenn eine andere Übung kommt, nicht bei jedem Satz derselben Übung im Training
      ansicht.einleitung = zuletzt !== d.n; zuletzt = d.n;
      ansicht.zeige(M.animation(d.a), d.m);
      ansicht.autoDrehen(auto.getAttribute('aria-pressed') === 'true');
    },
    weg() { if (erk) erk.ende(); if (ansicht) ansicht.entsorgen(); ansicht = null; if (beobachter) beobachter.disconnect(); window.removeEventListener('resize', passe); }
  };
}

// Erklärt eine Übung Punkt für Punkt auf der 3D-Bühne. fertig() kommt, wenn die Erklärung zu Ende ist oder abgebrochen wurde.
export function erklaerung(ansicht, d, buehneEl, fertig) {
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
  const pauseKnopf = h('button', { class: 'eb-knopf', type: 'button', 'aria-label': 'Pause', text: '❚❚', onclick: () => { pausiert = !pausiert; pauseKnopf.textContent = pausiert ? '▶' : '❚❚'; pauseKnopf.setAttribute('aria-label', pausiert ? 'Weiter' : 'Pause'); gehe(Math.max(0, i)); } });
  const blase = h('div', { class: 'erklaer-blase', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'eb-kopf' }, art, h('button', { class: 'eb-knopf', type: 'button', 'aria-label': 'Erklärung beenden', text: '✕', onclick: () => ende() })),
    text,
    h('div', { class: 'eb-nav' },
      h('button', { class: 'eb-knopf', type: 'button', 'aria-label': 'Vorheriger Punkt', text: '◀', onclick: () => gehe(Math.max(0, i - 1)) }),
      leiste, pauseKnopf,
      h('button', { class: 'eb-knopf', type: 'button', 'aria-label': 'Nächster Punkt', text: '▶', onclick: () => gehe(i + 1) })),
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

// Standbilder der Figur für Listen (eine unsichtbare Bühne malt sie nacheinander, danach aus dem Zwischenspeicher)
const standCache = new Map();
let standAnsicht = null;
export async function standbilder(lade3d, ziele, datenZu) {
  if (!ziele.length) return;
  const M = await lade3d();
  if (!standAnsicht) {
    const c = document.createElement('canvas'); c.width = 192; c.height = 192; c.style.cssText = 'position:fixed;left:-500px;top:0;width:192px;height:192px';
    document.body.append(c);
    standAnsicht = new M.Ansicht(c, { standbild: true, hintergrund: 0x1a1c20 });
  }
  for (const el of ziele) {
    const id = el.dataset.vorschau, d = datenZu(id);
    if (!d || !d.a) continue;
    if (!standCache.has(id)) {
      const a = M.animation(d.a);
      if (!a) continue;
      standAnsicht.zeige(a, d.m);
      standAnsicht.standbild(0.55);
      standCache.set(id, standAnsicht.canvas.toDataURL('image/jpeg', 0.82));
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!el.isConnected) continue;
    el.textContent = ''; el.append(h('img', { src: standCache.get(id), alt: '' }));
  }
}
