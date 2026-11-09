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
    // eigener Rahmen schneidet die Welle auf die Form des Knopfs zu; der Knopf selbst schneidet nichts ab (größere Trefferfläche, 07.11.2026)
    var rahmen = el.querySelector(':scope > .dk-rahmen');
    if (!rahmen) { rahmen = document.createElement('span'); rahmen.className = 'dk-rahmen'; rahmen.setAttribute('aria-hidden', 'true'); el.appendChild(rahmen); }
    rahmen.appendChild(w);
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

/* Farbwelt wählen: Lagune, Klar oder Schwarz-Gold, auf diesem Gerät gemerkt (kleines Menü oben rechts im Kopf).
 * Die Wahl steht immer ausdrücklich in dk_look. Ohne Eintrag gilt: neue Besucher der Kunden-App bekommen Schwarz-Gold (frühes Skript in index.html und analyse.html, Devin 05.11.2026), wer dort schon Daten hat und die Trainer-Seite bleiben bei Lagune. */
(function () {
  var SCHLUESSEL = 'dk_look';
  var WELTEN = [['lagune', 'Lagune'], ['klar', 'Klar'], ['gold', 'Schwarz-Gold']];
  function lies() { try { return localStorage.getItem(SCHLUESSEL) || ''; } catch (e) { return ''; } }
  function waehle(wert) {
    try { localStorage.setItem(SCHLUESSEL, wert); } catch (e) {}
    location.reload();   // 3D-Bühne und Vorschaubilder entstehen dann in den neuen Farben
  }
  function knopf() {
    var kopf = document.querySelector('.kopf-innen');
    if (!kopf || kopf.querySelector('.look-wahl')) return;
    var jetzt = document.documentElement.dataset.look || 'lagune', rahmen = document.createElement('div'), b = document.createElement('button'), menue = document.createElement('div');
    rahmen.className = 'look-rahmen';
    b.type = 'button'; b.className = 'look-wahl'; b.title = 'Farbwelt wählen'; b.setAttribute('aria-label', 'Farbwelt wählen'); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', 'false');
    menue.className = 'look-menue'; menue.setAttribute('role', 'menu'); menue.hidden = true;
    function zeigen(an) { menue.hidden = !an; b.setAttribute('aria-expanded', String(an)); }
    WELTEN.forEach(function (w) {
      var e = document.createElement('button'), probe = document.createElement('i');
      e.type = 'button'; e.className = 'look-eintrag'; e.setAttribute('role', 'menuitemradio'); e.setAttribute('aria-checked', String(jetzt === w[0]));
      probe.className = 'look-probe ' + w[0]; e.appendChild(probe); e.appendChild(document.createTextNode(w[1]));
      e.addEventListener('click', function () { zeigen(false); if (w[0] !== jetzt) waehle(w[0]); });
      menue.appendChild(e);
    });
    b.addEventListener('click', function (e) { e.stopPropagation(); zeigen(menue.hidden); });
    document.addEventListener('click', function (e) { if (!menue.hidden && !rahmen.contains(e.target)) zeigen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menue.hidden) { zeigen(false); b.focus(); } });
    rahmen.appendChild(b); rahmen.appendChild(menue);
    kopf.appendChild(rahmen);
  }
  if (lies()) document.documentElement.dataset.look = lies();
  if (document.querySelector('meta[name="dk-ohne-farbwahl"]')) return;   // Seiten ohne Menü für die Farbwelt (Analyse für dich)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopf); else knopf();
})();

/* Knopf-Gefühl (06.11.2026, Devin: „schön smooth mit Effekten … wird groß, wird angepoppt … ein bisschen verfolgt … wenn du länger hältst …
 * so 3 Millimeter … verwischen nach überall hin“).
 * Maus drüber: Der Knopf hebt sich, ein Lichtpunkt folgt dem Zeiger, der Knopf zieht leicht zum Zeiger (bis 3 px).
 * Drücken: gibt nach, ein Lichtstreifen läuft quer über den Knopf. Halten (ab 0,2 s) und ziehen: folgt dem Finger federnd bis 30 px (am Handy rund 5 mm),
 * in jede Richtung, sichtbar gedehnt. Loslassen: springt auf und wackelt federnd aus (Plopp), vom Ziehen fliegt er dabei an seinen Platz zurück.
 * Weit gezogen (über 44 px) zählt nicht als Tipp. Wer vor dem Halten den Finger bewegt, scrollt ganz normal.
 * 07.11.2026 auf Devins Wunsch verstärkt: „Mehr Plopp“, „Weiter mitziehen“ (5 statt 3 mm), „Mehr Glanz“.
 * Im Ruhezustand ohne transform, damit Schrift und Rand scharf bleiben (Aussehen in app/src/stil.css, Abschnitt „Knöpfe zum Anfassen“).
 */
(function () {
  'use strict';
  var KNOPF = '.knopf, nav.leiste button, .chip, .wt, .rund, .eb-knopf, .blatt-zu, .zu-rund, .st-beispiel';
  var MAX = 30, HALTEN_MS = 200, WEIT = 44;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var kg = null, schwebt = null;

  function knopfVon(ziel) {
    var el = ziel && ziel.closest ? ziel.closest(KNOPF) : null;
    // nur echte Knöpfe und Links: Chips und Kästen, die nur etwas anzeigen, bleiben ruhig (sonst blockiert Halten dort das Scrollen)
    if (el && !el.matches('button, a[href], [role=button], label, summary')) return el.parentElement ? knopfVon(el.parentElement) : null;
    return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' ? el : null;
  }
  function licht(el) {
    if (el.querySelector(':scope > .kg-licht')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.classList.add('dk-wellen');
    var l = document.createElement('span');
    l.className = 'kg-licht'; l.setAttribute('aria-hidden', 'true');
    el.appendChild(l);
  }
  function lichtWeg(el) {
    setTimeout(function () {
      if (el.classList.contains('kg-schwebt') || el.classList.contains('kg-zieht') || el.classList.contains('kg-drueckt') || el.classList.contains('kg-glanz')) return;
      var l = el.querySelector(':scope > .kg-licht'); if (l) l.remove();
    }, 900);
  }
  function setze(el, x, y, kx, ky, sx, sy) {
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((x - r.left) / (r.width || 1) * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((y - r.top) / (r.height || 1) * 100).toFixed(1) + '%');
    el.style.setProperty('--kx', kx.toFixed(2) + 'px');
    el.style.setProperty('--ky', ky.toFixed(2) + 'px');
    if (sx != null) { el.style.setProperty('--sx', sx.toFixed(4)); el.style.setProperty('--sy', sy.toFixed(4)); }
  }
  function ruhe(el) { ['--kx', '--ky', '--sx', '--sy'].forEach(function (k) { el.style.removeProperty(k); }); }
  function schwebenAus() {
    if (!schwebt) return;
    schwebt.classList.remove('kg-schwebt'); ruhe(schwebt); lichtWeg(schwebt); schwebt = null;
  }

  // Maus: schweben, Licht folgt, leichter Zug zum Zeiger
  document.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || e.buttons || kg) return;
    var el = knopfVon(e.target);
    if (el !== schwebt) { schwebenAus(); if (el) { schwebt = el; licht(el); el.classList.add('kg-schwebt'); } }
    if (!el) return;
    var r = el.getBoundingClientRect(), px = (e.clientX - r.left) / (r.width || 1) - .5, py = (e.clientY - r.top) / (r.height || 1) - .5;
    setze(el, e.clientX, e.clientY, px * 6, py * 4);
  }, { passive: true });
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) schwebenAus(); }, { passive: true });

  // Gedrückt: nachgeben, halten, ziehen, loslassen
  function ende(plopp) {
    if (!kg) return;
    var el = kg.el, weit = kg.weit, kx = kg.kx || 0, ky = kg.ky || 0;
    clearTimeout(kg.uhr); kg = null;
    el.classList.remove('kg-drueckt', 'kg-zieht', 'kg-plopp');
    ruhe(el); lichtWeg(el);
    if (plopp) {   // Plopp: aus der gezogenen Stelle zurück, aufspringen, ausfedern
      el.style.setProperty('--kx0', kx.toFixed(2) + 'px'); el.style.setProperty('--ky0', ky.toFixed(2) + 'px');
      void el.offsetWidth;
      el.classList.add('kg-plopp');
      setTimeout(function () { el.classList.remove('kg-plopp'); el.style.removeProperty('--kx0'); el.style.removeProperty('--ky0'); }, 720);
    }
    if (weit) {   // weit gezogen: das war Spielen, kein Tipp
      var stopp = function (ev) { if (el.contains(ev.target)) { ev.preventDefault(); ev.stopPropagation(); } };
      document.addEventListener('click', stopp, true);
      setTimeout(function () { document.removeEventListener('click', stopp, true); }, 350);
    }
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || !e.isPrimary) return;
    var el = knopfVon(e.target);
    if (!el) return;
    ende(false);
    if (schwebt === el) { el.classList.remove('kg-schwebt'); schwebt = null; }
    kg = { el: el, id: e.pointerId, x0: e.clientX, y0: e.clientY, halten: false, weit: false, kx: 0, ky: 0 };
    licht(el); setze(el, e.clientX, e.clientY, 0, 0);
    el.classList.remove('kg-glanz'); void el.offsetWidth; el.classList.add('kg-glanz');   // Lichtstreifen läuft bei jedem Drücken einmal durch
    setTimeout(function () { el.classList.remove('kg-glanz'); lichtWeg(el); }, 850);
    el.classList.add('kg-drueckt');
    kg.uhr = setTimeout(function () {
      if (!kg || kg.el !== el) return;
      kg.halten = true; licht(el);
      el.classList.remove('kg-drueckt'); el.classList.add('kg-zieht');
      setze(el, kg.x0, kg.y0, 0, 0, 1, 1);
      try { el.setPointerCapture(kg.id); } catch (x) {}
      try { if (navigator.vibrate) navigator.vibrate(6); } catch (x) {}
    }, HALTEN_MS);
  }, { passive: true });
  document.addEventListener('pointermove', function (e) {
    if (!kg || e.pointerId !== kg.id) return;
    var dx = e.clientX - kg.x0, dy = e.clientY - kg.y0, d = Math.sqrt(dx * dx + dy * dy);
    if (!kg.halten) { if (d > 8) ende(false); return; }   // vor dem Halten bewegt: scrollen oder wischen
    if (d > WEIT) kg.weit = true;
    var f = d ? MAX * Math.tanh(d / (MAX * 1.5)) / d : 0, s = Math.min(.07, d / 520);
    kg.kx = dx * f; kg.ky = dy * f;
    setze(kg.el, e.clientX, e.clientY, kg.kx, kg.ky, 1 + s * Math.abs(dx) / (d || 1), 1 + s * Math.abs(dy) / (d || 1));
  }, { passive: true });
  // Während des Haltens nicht scrollen, sonst bricht der Browser das Ziehen ab
  document.addEventListener('touchmove', function (e) { if (kg && kg.halten && e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', function (e) { if (kg && e.pointerId === kg.id) ende(true); }, { passive: true });
  document.addEventListener('pointercancel', function (e) { if (kg && e.pointerId === kg.id) ende(false); }, { passive: true });
  window.addEventListener('scroll', function () { if (kg && !kg.halten) ende(false); }, { passive: true, capture: true });
})();

/* Kein Reinzoomen (07.11.2026, Devin: „dass man nicht reinzoomen kann in der Webseite“), nur auf Seiten mit <meta name="dk-kein-zoom">.
 * Das iPhone beachtet user-scalable=no im viewport nicht, darum Zwei-Finger-Gesten hier abfangen. Den Doppeltipp-Zoom verhindert touch-action: manipulation.
 * Die 3D-Figur dreht und zoomt weiter: OrbitControls arbeitet mit Pointer-Events auf ihrer eigenen Fläche (touch-action: none). */
(function () {
  'use strict';
  if (!document.querySelector('meta[name="dk-kein-zoom"]')) return;
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
  document.addEventListener('touchmove', function (e) { if (e.touches && e.touches.length > 1 && e.cancelable) e.preventDefault(); }, { passive: false });
})();

/* Wellen im Hintergrund (09.11.2026, Devin: „Wellen … so einen Strand … sehr realistisch“, Video von Pexels, frei nutzbar): nur auf Seiten mit <meta name="dk-wellen-video">.
 * Lagune hell, Schwarz-Gold dieselben Wellen dunkel, Klar ohne. Es lädt nur die Fassung der aktiven Farbwelt. Bei „weniger Bewegung“ oder Datensparen bleibt ein Standbild.
 * Hält an, solange Gym, Training oder ein Blatt offen sind (schont Akku und 3D). */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="dk-wellen-video"]');
  if (!meta) return;
  var pfad = meta.getAttribute('content') || '', root = document.documentElement, v = null;
  var still = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || (navigator.connection && navigator.connection.saveData);
  function art() { var l = root.dataset.look; return l === 'klar' ? '' : l === 'gold' ? 'dunkel' : 'hell'; }
  function abspielen() {
    if (!v || still) return;
    if (document.hidden || document.querySelector('.raum, .tm, .blatt.offen')) { if (!v.paused) v.pause(); return; }
    if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }   // Stromsparmodus am iPhone: Standbild bleibt stehen
  }
  function setzen() {
    var a = art();
    if ((v ? v.dataset.art : '') === a) return;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); v = null; }
    root.classList.toggle('dk-wellen-an', !!a);
    if (!a) return;
    v = document.createElement('video');
    v.className = 'dk-wellen-video'; v.dataset.art = a; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.tabIndex = -1;
    ['muted', 'playsinline', 'disablepictureinpicture', 'disableremoteplayback'].forEach(function (x) { v.setAttribute(x, ''); });
    v.setAttribute('aria-hidden', 'true');
    v.poster = pfad + 'wellen-' + a + '.jpg';
    if (!still) { v.preload = 'auto'; v.src = pfad + 'wellen-' + a + '.mp4'; }
    document.body.insertBefore(v, document.body.firstChild);
    abspielen();
  }
  setzen();
  new MutationObserver(setzen).observe(root, { attributes: true, attributeFilter: ['data-look'] });
  document.addEventListener('visibilitychange', abspielen);
  setInterval(abspielen, 1500);
})();
