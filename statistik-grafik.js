// DK Coach — Leucht-Graph für die Statistik (21.11.2026).
// Devin: „Da siehst du dann sozusagen einen digitalen Graph mit Lichten und dann siehst du, wie hoch und wie du dich gesteigert hast.“
// Für die Kunden-App (Seite Statistik in der Leiste) und die Trainer-Seite (Block Statistik beim Kunden; app/build.js setzt dieses Modul
// dort als DKGrafik ein). Ein dunkles Display mit leuchtender Linie in der Akzentfarbe der Farbwelt, Lichtsäulen unter den Punkten,
// Antippen oder Ziehen zeigt den Wert. Baut nur SVG-Elemente (createElementNS, Texte als textContent): kein HTML aus Text, kein Netz, kein Speicher.
// Ruhig (Devins Regel „keine Dauer-Animationen“): Die Linie zeichnet sich einmal beim Öffnen, danach steht alles still; „Bewegung reduzieren“ schaltet das ab.
// Das Leuchten ist ein SVG-Filter (feGaussianBlur), weil iPhones CSS-Filter auf SVG-Teilen nicht zeichnen.

const B = 340, H = 196, RAND = Object.freeze({ l: 14, r: 40, o: 34, u: 28 });   // rechts ein Streifen für die Zahlen der Skala, damit kein Punkt sie verdeckt
export const MASSE = Object.freeze({ breite: B, hoehe: H, rand: RAND });
const r1 = (x) => Math.round(x * 10) / 10;

// Runde Obergrenze der Skala (1, 2, 2,5, 5 oder 10 mal 10^n), damit die Linien im Raster glatte Werte haben
export function schoeneGrenze(max) {
  if (!(max > 0) || !Number.isFinite(max)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p;
  const stufe = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return stufe * p;
}

// Glatte Linie durch die Punkte ohne Überschwingen (monotone kubische Kurve nach Fritsch-Carlson): Sie geht nie unter null und nie über den höchsten Punkt
function kurve(p) {
  if (!p.length) return '';
  if (p.length === 1) return 'M' + p[0].x + ',' + p[0].y;
  const n = p.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].y - p[i].y) / (p[i + 1].x - p[i].x));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  let pfad = 'M' + p[0].x + ',' + p[0].y;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1].x - p[i].x) / 3;
    pfad += ' C' + r1(p[i].x + h) + ',' + r1(p[i].y + m[i] * h) + ' ' + r1(p[i + 1].x - h) + ',' + r1(p[i + 1].y - m[i + 1] * h) + ' ' + p[i + 1].x + ',' + p[i + 1].y;
  }
  return pfad;
}

// Reine Rechnung (ohne Browser prüfbar): Werte → Koordinaten, Linie, Fläche und Raster.
// Verbunden werden nur Werte > 0 (Tage ohne Training liegen als kleiner Punkt auf der Grundlinie), null = Zukunft (wird nicht gezeichnet).
// opt.abNull = false (Verlauf einer Übung): Die Skala beginnt knapp unter dem kleinsten Wert statt bei null, mit vier runden Stufen.
// So sieht man eine Steigerung von 50 auf 60 kg; Volumen und Sätze bleiben ehrlich ab null.
export function geometrie(werte, opt) {
  const w = Array.isArray(werte) ? werte : [];
  const n = w.length, innenB = B - RAND.l - RAND.r, innenH = H - RAND.o - RAND.u, basis = RAND.o + innenH;
  const positiv = w.filter((v) => Number.isFinite(v) && v > 0);
  let unten = 0, max = schoeneGrenze(Math.max(0, ...positiv));
  if (opt && opt.abNull === false && positiv.length > 1) {
    const kl = Math.min(...positiv), gr = Math.max(...positiv);
    let stufe = schoeneGrenze((gr - kl) / 2 || gr * 0.1);
    unten = Math.max(0, Math.floor((kl - stufe) / stufe) * stufe);
    while (unten + 4 * stufe < gr) { stufe = schoeneGrenze(stufe * 1.01); unten = Math.max(0, Math.floor((kl - stufe) / stufe) * stufe); }
    max = unten + 4 * stufe;
  }
  const x = (i) => (n <= 1 ? RAND.l + innenB / 2 : RAND.l + innenB * i / (n - 1));
  const y = (v) => RAND.o + innenH * (1 - (v - unten) / (max - unten));
  const punkte = w.map((v, i) => ({ i, x: r1(x(i)), y: Number.isFinite(v) && v > 0 ? r1(y(v)) : null, wert: Number.isFinite(v) ? v : null }));
  const aktiv = punkte.filter((p) => p.y != null);
  const linie = kurve(aktiv);
  const flaeche = aktiv.length > 1 ? linie + ' L' + aktiv[aktiv.length - 1].x + ',' + basis + ' L' + aktiv[0].x + ',' + basis + ' Z' : '';
  const gitter = [0.25, 0.5, 0.75, 1].map((f) => { const v = unten + (max - unten) * f; return { y: r1(y(v)), wert: Math.round(v * 100) / 100 }; });
  let top = null;
  for (const p of aktiv) if (!top || p.wert > top.wert) top = p;
  return { punkte, aktiv, linie, flaeche, max, unten, basis, gitter, top, breite: B, hoehe: H };
}

// Welche Beschriftungen unten stehen: nur die erlaubten (zeigen), höchstens 7, gleichmäßig verteilt
export function beschriftungen(daten, hoechstens) {
  const n = hoechstens || 7;
  const erlaubt = (Array.isArray(daten) ? daten : []).map((d, i) => (d && d.zeigen !== false ? i : -1)).filter((i) => i >= 0);
  if (erlaubt.length <= n) return erlaubt;
  const schritt = Math.ceil(erlaubt.length / n);
  return erlaubt.filter((_, k) => k % schritt === 0);
}

/* ---------- Zeichnen (nur im Browser) ---------- */
const NS = 'http://www.w3.org/2000/svg';
let zaehler = 0;
function s(tag, attrs, kinder) {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs || {})) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  for (const c of kinder || []) if (c) e.appendChild(c);
  return e;
}
function text(tag, klasse, inhalt) { const e = document.createElement(tag); if (klasse) e.className = klasse; e.textContent = inhalt; return e; }

// daten: [{ label, name, wert, text?, zeigen?, markiert?, spaeter? }]
// opt: { titel (für Vorlesen), wertText(n) → „2.480 kg“, achsenText(n), animieren, leerText, abNull (false = Skala knapp unter dem kleinsten Wert) }
export function leuchtGraph(daten, opt) {
  const o = opt || {};
  const d = (Array.isArray(daten) ? daten : []).filter(Boolean);
  const werte = d.map((x) => (x.spaeter ? null : Number.isFinite(x.wert) && x.wert > 0 ? x.wert : 0));
  const g = geometrie(werte, { abNull: o.abNull });
  const wertText = typeof o.wertText === 'function' ? o.wertText : (v) => String(v);
  const achsenText = typeof o.achsenText === 'function' ? o.achsenText : wertText;
  const id = 'lg' + (++zaehler);

  const huelle = document.createElement('div');
  huelle.className = 'lg' + (o.animieren ? ' lg-zeichnen' : '');
  huelle.setAttribute('role', 'group');
  if (o.titel) huelle.setAttribute('aria-label', o.titel);

  const filter = (fid, staerke) => s('filter', { id: fid, filterUnits: 'userSpaceOnUse', x: 0, y: 0, width: B, height: H }, [
    s('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: staerke, result: 'b' }),
    s('feMerge', null, [s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' })])]);
  const verlauf = (vid, oben, unten) => s('linearGradient', { id: vid, x1: 0, y1: 0, x2: 0, y2: 1 }, [
    s('stop', { offset: 0, style: 'stop-color:var(--lg-licht);stop-opacity:' + oben }), s('stop', { offset: 1, style: 'stop-color:var(--lg-licht);stop-opacity:' + unten })]);
  const svg = s('svg', { viewBox: '0 0 ' + B + ' ' + H, class: 'lg-svg', 'aria-hidden': 'true', focusable: 'false' }, [
    s('defs', null, [filter(id + 'g', 2.2), filter(id + 'h', 6), verlauf(id + 'f', 0.34, 0), verlauf(id + 's', 0.5, 0)])]);

  // Raster mit Werten rechts, Grundlinie
  for (const z of g.gitter) {
    svg.appendChild(s('line', { x1: RAND.l, x2: B - RAND.r + 6, y1: z.y, y2: z.y, class: 'lg-gitter' }));
    const t = s('text', { x: B - 6, y: z.y + 3.5, 'text-anchor': 'end', class: 'lg-zahl' }); t.textContent = g.aktiv.length ? achsenText(z.wert) : ''; svg.appendChild(t);
  }
  svg.appendChild(s('line', { x1: RAND.l, x2: B - RAND.r + 6, y1: g.basis, y2: g.basis, class: 'lg-basis' }));
  // Lichtsäulen unter den Punkten, Fläche, Leuchten und Linie
  for (const p of g.aktiv) svg.appendChild(s('rect', { x: p.x - 1.25, y: p.y, width: 2.5, height: Math.max(0, g.basis - p.y), rx: 1.25, fill: 'url(#' + id + 's)', class: 'lg-saeule' }));
  if (g.flaeche) svg.appendChild(s('path', { d: g.flaeche, fill: 'url(#' + id + 'f)', class: 'lg-flaeche' }));
  if (g.aktiv.length > 1) {
    svg.appendChild(s('path', { d: g.linie, pathLength: 1, class: 'lg-glut', filter: 'url(#' + id + 'h)' }));
    svg.appendChild(s('path', { d: g.linie, pathLength: 1, class: 'lg-linie', filter: 'url(#' + id + 'g)' }));
  }
  // Tage ohne Training: kleiner Punkt auf der Grundlinie
  g.punkte.forEach((p, i) => { if (p.y == null && !d[i].spaeter) svg.appendChild(s('circle', { cx: p.x, cy: g.basis, r: 1.6, class: 'lg-leer' })); });
  // Zeiger (beim Antippen) und Punkte
  const zeiger = s('line', { x1: 0, x2: 0, y1: RAND.o - 6, y2: g.basis, class: 'lg-zeiger', visibility: 'hidden' });
  svg.appendChild(zeiger);
  const kreise = new Map();
  g.aktiv.forEach((p, k) => {
    const top = g.top === p, jetzt = !!d[p.i].markiert;
    if (top) svg.appendChild(s('circle', { cx: p.x, cy: p.y, r: 9, class: 'lg-halo', style: '--i:' + k }));
    const c = s('circle', { cx: p.x, cy: p.y, r: top ? 4.6 : 3.4, class: 'lg-punkt' + (top ? ' top' : '') + (jetzt ? ' jetzt' : ''), filter: 'url(#' + id + 'g)', style: '--i:' + k });
    kreise.set(p.i, c); svg.appendChild(c);
  });
  // Beschriftung unten (erste links-, letzte rechtsbündig, damit nichts abgeschnitten wird)
  const zeilen = beschriftungen(d);
  zeilen.forEach((i, k) => {
    const p = g.punkte[i];
    const anker = zeilen.length > 1 && k === 0 && p.x < 40 ? 'start' : zeilen.length > 1 && k === zeilen.length - 1 && p.x > B - 40 ? 'end' : 'middle';
    const t = s('text', { x: anker === 'start' ? Math.max(RAND.l, p.x - 4) : anker === 'end' ? Math.min(B - RAND.r, p.x + 4) : p.x, y: g.basis + 17, 'text-anchor': anker,
      class: 'lg-achse' + (d[i].markiert ? ' jetzt' : '') });
    t.textContent = d[i].label || ''; svg.appendChild(t);
  });
  huelle.appendChild(svg);

  if (!g.aktiv.length) { huelle.appendChild(text('div', 'lg-leertext', o.leerText || 'Noch keine Werte')); return huelle; }

  // Antippen, Ziehen oder Pfeiltasten: nächster Punkt mit Wert, Wert in der Blase
  const tipp = document.createElement('div');
  tipp.className = 'lg-tipp'; tipp.setAttribute('role', 'status'); tipp.setAttribute('aria-live', 'polite');
  huelle.appendChild(tipp);
  let gewaehlt = null;
  function waehle(p) {
    if (!p) return;
    if (gewaehlt) { const alt = kreise.get(gewaehlt.i); if (alt) alt.classList.remove('gewaehlt'); }
    gewaehlt = p;
    const c = kreise.get(p.i); if (c) c.classList.add('gewaehlt');
    zeiger.setAttribute('x1', p.x); zeiger.setAttribute('x2', p.x); zeiger.setAttribute('visibility', 'visible');
    const x = d[p.i];
    tipp.textContent = '';
    tipp.append(text('small', null, x.name || x.label || ''), text('b', null, x.text || wertText(x.wert)));
    // Die Blase hängt am Punkt: links im Graphen nach rechts aufgeklappt, rechts nach links, sonst mittig; hoch oben unter dem Punkt
    tipp.style.left = (p.x / B * 100) + '%';
    tipp.style.top = (p.y / H * 100) + '%';
    tipp.classList.toggle('links', p.x / B < 0.36);
    tipp.classList.toggle('rechts', p.x / B > 0.6);
    tipp.classList.toggle('unten', p.y < 70);
  }
  const naechster = (xv) => g.aktiv.reduce((m, p) => (!m || Math.abs(p.x - xv) < Math.abs(m.x - xv) ? p : m), null);
  function vonZeiger(e) {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    waehle(naechster((e.clientX - r.left) / r.width * B));
  }
  svg.addEventListener('pointerdown', vonZeiger);
  svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) vonZeiger(e); });
  huelle.tabIndex = 0;
  huelle.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const k = g.aktiv.indexOf(gewaehlt) + (e.key === 'ArrowLeft' ? -1 : 1);
    waehle(g.aktiv[Math.max(0, Math.min(g.aktiv.length - 1, k))]);
  });
  // Zu Beginn: der markierte Punkt (heute bzw. der gewählte Tag), sonst der letzte mit Wert
  waehle(g.aktiv.find((p) => d[p.i].markiert) || g.aktiv[g.aktiv.length - 1]);
  return huelle;
}
