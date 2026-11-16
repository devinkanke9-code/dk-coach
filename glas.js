/* DK Coach — Glas-Linse für die Karten der Kunden-App (16.11.2026, Devin: „Glaseffekt … dass man komplett durchgucken kann … nicht verschwommen …
 * wie bei einer Brille … ein bisschen verschoben … er vergrößert“).
 * Jede Karte bekommt eine Schicht, die das Wellenbild der Seite klar und leicht vergrößert zeigt (Standbild der aktiven Farbwelt), zugeschnitten auf die Karte.
 * So sieht man durch die Karte wie durch ein Brillenglas. Aussehen in index.html (Abschnitt „Glas“). Das geht auch auf dem iPhone (kein SVG-Filter nötig).
 * Nur wo die Wellen zu sehen sind: Farbwelt Klar, Blätter, Training und Gym bleiben wie bisher. Mit „Transparenz reduzieren“ bleiben die Karten dicht.
 * Kein Netz, keine Daten, nichts wird gespeichert. Kein Modul: index.html lädt die Datei nach antippen.js.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var ZIEL = '.block, .rang-kurz', OHNE = '.block .block, .blatt, .tm, .raum, .st-mock, .rang-auf';
  if (!document.querySelector('meta[name="dk-wellen-video"]')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  // Karten außerhalb des Bildschirms brauchen ihre Schicht nicht (spart Grafikspeicher)
  var sicht = 'IntersectionObserver' in window ? new IntersectionObserver(function (liste) {
    liste.forEach(function (e) { e.target.classList.toggle('g-fern', !e.isIntersecting); });
  }, { rootMargin: '240px 0px' }) : null;
  function linse(el) {
    if (el.classList.contains('g-glas') || (el.parentElement && el.parentElement.closest(OHNE)) || el.closest('.blatt, .tm, .raum, .st-mock, .rang-auf')) return;
    var s = document.createElement('span'), i = document.createElement('i');
    s.className = 'g-linse'; s.setAttribute('aria-hidden', 'true'); s.appendChild(i);
    el.appendChild(s); el.classList.add('g-glas');
    if (sicht) sicht.observe(el);
  }
  var geplant = false;
  function alle() {
    geplant = false;
    if (!root.classList.contains('dk-wellen-an')) return;
    var liste = document.querySelectorAll(ZIEL);
    for (var k = 0; k < liste.length; k++) linse(liste[k]);
  }
  function planen() { if (geplant) return; geplant = true; (window.requestAnimationFrame || setTimeout)(alle); }
  new MutationObserver(planen).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(planen).observe(root, { attributes: true, attributeFilter: ['class'] });
  planen();
})();
