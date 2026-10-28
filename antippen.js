/* DK Coach — Antipp-Gefühl für Trainer-Seite und Kunden-App (Devin: „wenn du drauf drückst, dass es sich mitbewegt, größer wird, Spaß macht“).
 * Gedrückt halten: das Element federt größer, eine Lichtwelle läuft vom Finger aus. Loslassen: kurzes Nachfedern.
 * Abhaken: kleine Funken in den Farben des Verlaufs. Android vibriert ganz kurz. Beim Scrollen passiert nichts.
 * Aussehen in app/src/stil.css (Abschnitt „Antippen“). Wer weniger Bewegung eingestellt hat, bekommt nur die Farben.
 * Kein Modul: app/build.js setzt die Datei in die Trainer-Seite ein, die Kunden-App lädt sie direkt.
 */
(function () {
  'use strict';
  var ZIEL = 'button, a[href], summary, .haken, .optionen label, .janein label, [role="button"]';
  var ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var druck = null;   // { el, x, y, an, uhr }

  function welle(el, x, y) {
    var r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    var w = document.createElement('span');
    w.className = 'dk-welle';
    w.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (x - r.left - d / 2) + 'px;top:' + (y - r.top - d / 2) + 'px';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.classList.add('dk-wellen');
    el.appendChild(w);
    setTimeout(function () { w.remove(); }, 650);
  }
  function an() {
    if (!druck || druck.an) return;
    druck.an = true;
    druck.el.classList.remove('dk-los');
    druck.el.classList.add('dk-druck');
    if (!ruhig) welle(druck.el, druck.x, druck.y);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  }
  function abbrechen() {
    if (!druck) return;
    clearTimeout(druck.uhr);
    druck.el.classList.remove('dk-druck');
    druck = null;
  }
  function los() {
    if (!druck) return;
    var el = druck.el;
    if (!druck.an) an();
    clearTimeout(druck.uhr);
    druck = null;
    el.classList.remove('dk-druck');
    if (ruhig) return;
    void el.offsetWidth;
    el.classList.add('dk-los');
    setTimeout(function () { el.classList.remove('dk-los'); }, 460);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var el = e.target.closest ? e.target.closest(ZIEL) : null;
    if (!el || el.disabled) return;
    abbrechen();
    // kurz warten: wer scrollt, bewegt den Finger gleich weiter, dann bleibt alles ruhig
    druck = { el: el, x: e.clientX, y: e.clientY, an: false };
    druck.uhr = setTimeout(an, 70);
  }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (druck && Math.abs(e.clientX - druck.x) + Math.abs(e.clientY - druck.y) > 12) abbrechen();
  }, { passive: true });
  document.addEventListener('pointerup', los, { passive: true });
  document.addEventListener('pointercancel', abbrechen, { passive: true });
  window.addEventListener('scroll', abbrechen, { passive: true, capture: true });

  // Abhaken: Funken fliegen aus dem Haken
  document.addEventListener('change', function (e) {
    var cb = e.target;
    if (ruhig || !cb.matches || !cb.matches('.haken input[type="checkbox"]') || !cb.checked) return;
    var r = cb.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (var i = 0; i < 14; i++) {
      var f = document.createElement('i'), w = (i / 14) * Math.PI * 2 + Math.random() * 0.4, d = 26 + Math.random() * 30;
      f.className = 'dk-funke' + (i % 2 ? ' b' : '');
      f.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--dx:' + (Math.cos(w) * d).toFixed(1) + 'px;--dy:' + (Math.sin(w) * d).toFixed(1) + 'px';
      document.body.appendChild(f);
      setTimeout(f.remove.bind(f), 700);
    }
  }, true);   // vor dem eigenen Handler: der zeichnet neu, danach wäre der Haken schon weg
})();
