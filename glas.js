/* DK Coach — Glas-Linse für die Karten der Kunden-App.
 * 16.11.2026, Devin: „dass man komplett durchgucken kann … nicht verschwommen … wie bei einer Brille … ein bisschen verschoben … er vergrößert“,
 * und abends: „Es hat einfach nur ein Standbild von der Welle, aber ist nicht so wie Glas, dass man da durchgucken kann.“
 * Darum jetzt live: Jede Karte hat eine Leinwand, auf die bei jedem Bild genau das Stück des Wellen-Videos gemalt wird, das hinter der Karte liegt,
 * leicht vergrößert (Mitte) und am Rand stärker vergrößert (wie der dicke Rand eines Brillenglases). Die Wellen bewegen sich also durch das Glas
 * und verschieben sich beim Scrollen mit. Steht das Video (weniger Bewegung, Stromsparen), wird das Standbild gemalt, neu nur beim Scrollen.
 * Nur wo die Wellen zu sehen sind (Lagune, Schwarz-Gold). Klar, Sport, Blätter, Training und Gym bleiben wie bisher. Mit „Transparenz reduzieren“ bleibt alles dicht.
 * Kein Netz, keine Daten, nichts wird gespeichert. Kein Modul: index.html lädt die Datei nach antippen.js. Aussehen in index.html (Abschnitt „Glas“).
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var ZIEL = '.block, .rang-kurz', OHNE = '.block .block, .blatt, .tm, .raum, .st-mock, .rang-auf';
  if (!document.querySelector('meta[name="dk-wellen-video"]')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  // Vergrößerung von außen nach innen: Rand, Übergang, Mitte. Abstand vom Kartenrand in px.
  var STUFEN = [{ rand: 0, mal: 1.55 }, { rand: 5, mal: 1.32 }, { rand: 11, mal: 1.16 }];
  var linsen = [], standbild = null, standbildFuer = '', schmutzig = true, letztes = 0;

  function video() { return document.querySelector('.dk-wellen-video'); }
  function quelle() {
    var v = video();
    if (!v) return null;
    if (v.tagName === 'IMG') return v.complete && v.naturalWidth ? { bild: v, w: v.naturalWidth, h: v.naturalHeight, kasten: v.getBoundingClientRect(), laeuft: false } : null;   // Studio-Bild (17.11.2026)
    if (v.readyState >= 2 && v.videoWidth) return { bild: v, w: v.videoWidth, h: v.videoHeight, kasten: v.getBoundingClientRect(), laeuft: !v.paused };
    var p = v.poster || '';
    if (p && standbildFuer !== p) { standbildFuer = p; standbild = new Image(); standbild.onload = function () { schmutzig = true; }; standbild.src = p; }
    if (standbild && standbild.complete && standbild.naturalWidth) return { bild: standbild, w: standbild.naturalWidth, h: standbild.naturalHeight, kasten: v.getBoundingClientRect(), laeuft: false };
    return null;
  }
  function rundRechteck(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) { c.roundRect(x, y, w, h, Math.max(0, r)); return; }
    c.rect(x, y, w, h);
  }
  function malen(l, q) {
    var r = l.karte.getBoundingClientRect();
    if (r.bottom < -40 || r.top > innerHeight + 40 || r.width < 2) return;
    var bw = Math.round(r.width * DPR), bh = Math.round(r.height * DPR);
    if (l.leinwand.width !== bw || l.leinwand.height !== bh) { l.leinwand.width = bw; l.leinwand.height = bh; }
    var c = l.ctx, k = q.kasten, s = Math.max(k.width / q.w, k.height / q.h);   // wie object-fit: cover
    var ox = k.left + (k.width - q.w * s) / 2, oy = k.top + (k.height - q.h * s) / 2;
    var radius = parseFloat(getComputedStyle(l.karte).getPropertyValue('--g-r')) || 24;
    c.save();
    for (var i = 0; i < STUFEN.length; i++) {
      var st = STUFEN[i], e = st.rand;
      // Bildschirm-Ausschnitt dieser Stufe, um die Kartenmitte verkleinert (= vergrößert gezeigt)
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, hw = (r.width / 2 - e) / st.mal, hh = (r.height / 2 - e) / st.mal;
      if (hw <= 0 || hh <= 0) continue;
      if (e) { c.restore(); c.save(); rundRechteck(c, e * DPR, e * DPR, bw - 2 * e * DPR, bh - 2 * e * DPR, (radius - e) * DPR); c.clip(); }
      var sx = (cx - hw - ox) / s, sy = (cy - hh - oy) / s, sw = Math.min((2 * hw) / s, q.w), sh = Math.min((2 * hh) / s, q.h);
      // Ragt die Karte über den Bildschirmrand, liegt dahinter kein Video: Ausschnitt ins Bild schieben, sonst bleiben schwarze Ränder
      sx = Math.max(0, Math.min(q.w - sw, sx)); sy = Math.max(0, Math.min(q.h - sh, sy));
      try { c.drawImage(q.bild, sx, sy, sw, sh, e * DPR, e * DPR, bw - 2 * e * DPR, bh - 2 * e * DPR); } catch (x) { /* Bild noch nicht bereit */ }
    }
    c.restore();
  }
  function offenesFenster() { return document.hidden || !root.classList.contains('dk-wellen-an') || document.querySelector('.raum, .tm, .blatt.offen'); }
  function schleife(t) {
    requestAnimationFrame(schleife);
    if (!linsen.length || offenesFenster()) return;
    var q = quelle();
    if (!q) return;
    if (!q.laeuft && !schmutzig) return;
    if (q.laeuft && t - letztes < 32) return;   // höchstens etwa 30 Bilder pro Sekunde, das reicht für Wellen und schont den Akku
    letztes = t; schmutzig = false;
    linsen = linsen.filter(function (l) { return l.karte.isConnected; });
    for (var i = 0; i < linsen.length; i++) malen(linsen[i], q);
  }
  function linse(el) {
    if (el.classList.contains('g-glas') || (el.parentElement && el.parentElement.closest(OHNE)) || el.closest('.blatt, .tm, .raum, .st-mock, .rang-auf')) return;
    var s = document.createElement('span'), cv = document.createElement('canvas');
    s.className = 'g-linse'; s.setAttribute('aria-hidden', 'true'); s.appendChild(cv);
    el.appendChild(s); el.classList.add('g-glas');
    var ctx = cv.getContext('2d', { alpha: false });
    if (!ctx) return;
    linsen.push({ karte: el, leinwand: cv, ctx: ctx });
    schmutzig = true;
  }
  var geplant = false;
  function alle() {
    geplant = false;
    if (!root.classList.contains('dk-wellen-an') || root.dataset.look === 'sport') return;   // Sport: Karten bleiben ruhig und scharf, kein Glas
    var liste = document.querySelectorAll(ZIEL);
    for (var k = 0; k < liste.length; k++) linse(liste[k]);
    schmutzig = true;
  }
  function planen() { if (geplant) return; geplant = true; setTimeout(alle, 0); }
  new MutationObserver(planen).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(planen).observe(root, { attributes: true, attributeFilter: ['class', 'data-look'] });
  addEventListener('scroll', function () { schmutzig = true; }, { passive: true });
  addEventListener('resize', function () { schmutzig = true; });
  planen();
  requestAnimationFrame(schleife);
})();
