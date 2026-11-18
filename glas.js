/* DK Coach — durchsichtige Karten in der Kunden-App (statt Glas-Linse).
 * 18.11.2026, Devin: „dass es durchsichtig ist, dass man einfach nur durchgucken kann, aber nichts anderes … beim Glaseffekt … ist einfach nur ein Bild drin,
 * was sich bewegt da nur und vergrößert … den Glaseffekt einfach wegmachen und dann einfach nur durchsichtig machen“, dazu: „dass der Hintergrund immer gleich bleibt
 * und dass da keine reingezoomt ist … nicht die ganze Zeit rumbackt“.
 * Vorher (16.11.) malte diese Datei in jede Karte eine Leinwand mit dem vergrößerten Hintergrund, etwa 30-mal pro Sekunde. Beim Wischen bewegte und vergrößerte sich
 * das Bild darin und lief hinterher. Jetzt markiert sie die Karten nur noch (Klasse g-glas); das Aussehen steht in index.html (Abschnitt „Durchsichtig statt Linse“):
 * klar wie eine Scheibe, feiner Rand, Schriftschatten. Nichts wird gemalt, keine Schleife, der Hintergrund steht fest.
 * Nur wo das Studio-Bild zu sehen ist (Lagune, Schwarz-Gold). Klar, Sport, Blätter, Training und Gym bleiben wie bisher. Mit „Transparenz reduzieren“ bleibt alles dicht.
 * Kein Modul: index.html lädt die Datei nach antippen.js.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  var ZIEL = '.block, .rang-kurz', OHNE = '.block .block, .blatt, .tm, .raum, .st-mock, .rang-auf';
  if (!document.querySelector('meta[name="dk-wellen-video"]')) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;
  function markieren(el) {
    if (el.classList.contains('g-glas') || (el.parentElement && el.parentElement.closest(OHNE)) || el.closest('.blatt, .tm, .raum, .st-mock, .rang-auf')) return;
    el.classList.add('g-glas');
  }
  var geplant = false;
  function alle() {
    geplant = false;
    if (!root.classList.contains('dk-wellen-an') || root.dataset.look === 'sport') return;   // Sport: Karten bleiben ruhig und dicht
    var liste = document.querySelectorAll(ZIEL);
    for (var k = 0; k < liste.length; k++) markieren(liste[k]);
  }
  function planen() { if (geplant) return; geplant = true; setTimeout(alle, 0); }
  new MutationObserver(planen).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(planen).observe(root, { attributes: true, attributeFilter: ['class', 'data-look'] });
  planen();
})();
