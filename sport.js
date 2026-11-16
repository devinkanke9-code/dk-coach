/* Maus-Effekte der Farbwelt „Sport“ (16.11.2026, Devin: „Die Oberfläche soll subtil auf die Position des Mauszeigers reagieren“).
 * - Ein weicher, schwacher Lichtschein im Hintergrund folgt der Maus (eine feste Fläche, nur transform).
 * - Über einer Karte wandert ein Licht über Fläche und Rand, die Karte neigt sich leicht zur Maus und rückt höchstens 3 px. Andere Karten bleiben stehen.
 * Nur in der Farbwelt „Sport“, nur mit präzisem Zeiger und Hover (Maus, Trackpad), nie bei „weniger Bewegung“. Touch bekommt nur die kurze Tap-Reaktion aus sport.css.
 * Leistung: Mausbewegungen werden pro Bild gebündelt (requestAnimationFrame), es wird nichts neu gezeichnet, nur CSS-Werte gesetzt.
 * Steht die Maus still und ist alles angekommen, läuft keine Schleife mehr. Beim Drücken friert die Karte ein (Klicken und Wischen auf der 3D-Figur bleiben ruhig). */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!window.matchMedia || !window.requestAnimationFrame) return;
  var zeiger = window.matchMedia('(hover: hover) and (pointer: fine)');
  var ruhig = window.matchMedia('(prefers-reduced-motion: reduce)');
  var KARTE = '.block, .st-block:not(.st-held):not(.st-frei), .kunde, .naechstes';
  var NICHT = '.blatt, .tm, .raum, .st-mock, .look-menue';   // Blätter, Training, Gym und die Vorschau auf der Startseite bleiben ruhig
  var MAX_RUECK = 3;   // px in Richtung Maus
  var MAX_NEIGUNG = 1.6;   // Grad bei kleinen Karten, große neigen sich weniger

  var schein = null, an = false, laeuft = false, gedrueckt = false;
  var mx = -1000, my = -1000, sx = -1000, sy = -1000, sichtbar = false;
  var karte = null, kRect = null;

  function aktiv() { return root.dataset.look === 'sport' && zeiger.matches && !ruhig.matches; }

  function scheinBauen() {
    if (schein) return;
    schein = document.createElement('div');
    schein.className = 'sp-schein'; schein.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(schein, document.body.firstChild);
  }

  function karteLos() {
    if (!karte) return;
    karte.classList.remove('sp-aktiv');
    karte = null; kRect = null;
  }

  function karteAn(el) {
    if (el === karte) return;
    karteLos();
    if (!el) return;
    if (!el.querySelector(':scope > .sp-rand')) {
      if (getComputedStyle(el).position === 'static') el.classList.add('sp-rel');
      var licht = document.createElement('span'), rand = document.createElement('span');
      licht.className = 'sp-licht'; rand.className = 'sp-rand';
      licht.setAttribute('aria-hidden', 'true'); rand.setAttribute('aria-hidden', 'true');
      el.insertBefore(rand, el.firstChild); el.insertBefore(licht, el.firstChild);
    }
    el.classList.add('sp-karte');
    karte = el; kRect = null;
    void el.offsetWidth;   // Ausgangslage merken, damit das Neigen weich beginnt
    el.classList.add('sp-aktiv');
  }

  function bild() {
    laeuft = false;
    if (!an) return;
    // Lichtschein: läuft weich hinterher
    var dx = mx - sx, dy = my - sy;
    if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) { sx += dx * 0.14; sy += dy * 0.14; weiter(); } else { sx = mx; sy = my; }
    if (schein) schein.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
    // Karte unter der Maus
    if (karte && !karte.isConnected) karteLos();
    if (karte && !gedrueckt) {
      if (!kRect) kRect = karte.getBoundingClientRect();
      var r = kRect, w = r.width || 1, h = r.height || 1;
      var px = Math.min(1, Math.max(0, (mx - r.left) / w)), py = Math.min(1, Math.max(0, (my - r.top) / h));
      var nx = px * 2 - 1, ny = py * 2 - 1;   // -1 … 1 von der Mitte aus
      var neigung = Math.min(MAX_NEIGUNG, 300 / Math.max(w, h) * MAX_NEIGUNG);
      var s = karte.style;
      s.setProperty('--sp-mx', (px * w).toFixed(0) + 'px');
      s.setProperty('--sp-my', (py * h).toFixed(0) + 'px');
      s.setProperty('--sp-rx', (-ny * neigung).toFixed(2) + 'deg');
      s.setProperty('--sp-ry', (nx * neigung).toFixed(2) + 'deg');
      s.setProperty('--sp-tx', (nx * MAX_RUECK).toFixed(2) + 'px');
      s.setProperty('--sp-ty', (ny * MAX_RUECK).toFixed(2) + 'px');
    }
  }
  function weiter() { if (!laeuft) { laeuft = true; requestAnimationFrame(bild); } }

  function bewegt(e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    mx = e.clientX; my = e.clientY;
    if (!sichtbar) { sichtbar = true; if (sx < -900) { sx = mx; sy = my; } if (schein) schein.classList.add('an'); }
    var ziel = e.target && e.target.closest ? e.target.closest(KARTE) : null;
    if (ziel && ziel.closest(NICHT)) ziel = null;
    if (ziel && ziel.parentElement && ziel.parentElement.closest(KARTE)) ziel = ziel.parentElement.closest(KARTE);   // Karte in Karte: die äußere neigt sich
    if (!gedrueckt) karteAn(ziel);
    weiter();
  }
  function raus(e) {
    if (e.relatedTarget) return;   // nur wenn die Maus das Fenster verlässt
    sichtbar = false; if (schein) schein.classList.remove('an');
    karteLos();
  }
  function runter() { gedrueckt = true; }
  function hoch() { gedrueckt = false; weiter(); }
  function gescrollt() { kRect = null; if (karte) weiter(); }

  function schalten() {
    var soll = aktiv();
    if (soll === an) return;
    an = soll;
    if (an) {
      scheinBauen();
      document.addEventListener('pointermove', bewegt, { passive: true });
      document.addEventListener('mouseout', raus, { passive: true });
      document.addEventListener('pointerdown', runter, { passive: true });
      document.addEventListener('pointerup', hoch, { passive: true });
      window.addEventListener('scroll', gescrollt, { passive: true, capture: true });
      window.addEventListener('resize', gescrollt, { passive: true });
    } else {
      document.removeEventListener('pointermove', bewegt);
      document.removeEventListener('mouseout', raus);
      document.removeEventListener('pointerdown', runter);
      document.removeEventListener('pointerup', hoch);
      window.removeEventListener('scroll', gescrollt, { capture: true });
      window.removeEventListener('resize', gescrollt);
      karteLos(); sichtbar = false;
      if (schein) schein.classList.remove('an');
    }
  }
  function los() {
    schalten();
    var lausche = function (mq) { if (mq.addEventListener) mq.addEventListener('change', schalten); else if (mq.addListener) mq.addListener(schalten); };
    lausche(zeiger); lausche(ruhig);
    new MutationObserver(schalten).observe(root, { attributes: true, attributeFilter: ['data-look'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', los); else los();
})();
