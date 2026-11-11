/* DK Coach — Töne und Vibration für die Kunden-App (Devin 10.11.2026: „bei jedem Knopfdruck etwas fühlen, nach dem Workout ein Klatschen,
 * alles nutzen, was das Handy kann“).
 * - Alle Töne werden hier mit Web Audio erzeugt: keine Tondateien, keine fremden Aufnahmen, keine Sprachausgabe.
 * - Kein Zufall: Das Rauschen für Klatschen und Applaus kommt aus einer festen Zahlenfolge, gleiche Leistung klingt immer gleich.
 * - Vibration: Android über navigator.vibrate. Das iPhone kennt navigator.vibrate nicht; ab iOS 18 gibt Safari beim Umlegen eines
 *   Schalters (input type=checkbox switch) ein kurzes Klopfen. Das nutzt diese Datei, darum spürt man dort kurze Klopfer, keine langen Muster.
 *   Fehlt navigator.vibrate, setzt diese Datei einen Ersatz ein; so klopft es auch an den Stellen, die schon vibrieren (Gym, Medaille, Antippen).
 * - Steht das iPhone auf lautlos, bleibt es still (mit Absicht, das ist Sache des Handys).
 * - Einstellungen nur auf diesem Gerät: dk_ton und dk_vibration („0“ = aus). Kein Netz.
 * Kein Modul: index.html lädt die Datei vor antippen.js. Andere Teile rufen window.DKGefuehl.spiel('name').
 */
(function () {
  'use strict';
  var ZIEL = 'button, a[href], summary, .haken, .optionen label, .janein label, [role="button"]';
  var ctx = null, haupt = null, rauschen = null;

  /* ---------- Einstellungen ---------- */
  function lies(k) { try { return localStorage.getItem(k) !== '0'; } catch (e) { return true; } }
  function setze(k, an) { try { localStorage.setItem(k, an ? '1' : '0'); } catch (e) { /* nichts */ } }
  var tonAn = function () { return lies('dk_ton'); };
  var vibAn = function () { return lies('dk_vibration'); };

  /* ---------- Vibration ---------- */
  var nativ = typeof navigator.vibrate === 'function' ? navigator.vibrate.bind(navigator) : null;
  var schalter = null, offen = null;   // offen: Klopfer, die auf das nächste Antippen warten (das iPhone klopft nur bei einer Berührung)
  function schalterBauen() {
    if (schalter || !document.body) return schalter;
    var l = document.createElement('label'), i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    l.appendChild(i); document.body.appendChild(l);
    schalter = l; return l;
  }
  function klopfen() { try { var l = schalterBauen(); if (l) l.click(); } catch (e) { /* nichts */ } }
  function klopfer(n, abstand) { for (var k = 0; k < n; k++) setTimeout(klopfen, k * (abstand || 110)); }
  // Muster in Millisekunden wie bei navigator.vibrate: [an, aus, an, …] → so viele Klopfer wie „an“-Stücke (höchstens 4)
  function zaehle(muster) {
    if (typeof muster === 'number') return muster > 0 ? 1 : 0;
    if (!muster || !muster.length) return 0;
    var n = 0; for (var k = 0; k < muster.length; k += 2) if (muster[k] > 0) n++;
    return Math.min(4, n);
  }
  function aktiv() { var u = navigator.userActivation; return !u || u.isActive; }
  function vibrieren(muster) {
    if (!vibAn()) return true;
    if (nativ) { try { return nativ(muster); } catch (e) { return false; } }
    var n = zaehle(muster);
    if (!n) return true;
    if (aktiv()) klopfer(n); else offen = { n: n, zeit: Date.now() };
    return true;
  }
  try { navigator.vibrate = vibrieren; } catch (e) { /* nichts */ }

  /* ---------- Töne ---------- */
  function zahlen(start) {   // feste Zahlenfolge (mulberry32): gleiche Folge bei jedem Start
    var a = start >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function bereit() {
    if (!tonAn()) return null;
    try {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
        var komp = ctx.createDynamicsCompressor();
        komp.threshold.value = -10; komp.ratio.value = 3; komp.attack.value = 0.003; komp.release.value = 0.2;
        haupt = ctx.createGain(); haupt.gain.value = 1.5;
        haupt.connect(komp); komp.connect(ctx.destination);
        var z = zahlen(20261110), b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
        for (var k = 0; k < d.length; k++) d[k] = z() * 2 - 1;
        rauschen = b;
      }
      if (ctx.state !== 'running') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function huelle(g, t, spitze, an, ab) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(spitze, t + an);
    g.gain.exponentialRampToValueAtTime(0.0001, t + an + ab);
  }
  function ton(t, frei, art, laut, an, ab, ziel) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = art || 'sine'; o.frequency.setValueAtTime(frei, t);
    huelle(g, t, laut, an, ab);
    o.connect(g); g.connect(ziel || haupt);
    o.start(t); o.stop(t + an + ab + 0.05);
    return o;
  }
  function rausch(t, dauer, filter, frei, q, laut, an, ab, versatz) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = rauschen; f.type = filter; f.frequency.value = frei; f.Q.value = q;
    huelle(g, t, laut, an, ab);
    s.connect(f); f.connect(g); g.connect(haupt);
    s.start(t, versatz || 0, dauer); s.stop(t + dauer + 0.05);
  }
  // Ein Klatscher: drei ganz kurze Stöße und ein kurzer Nachhall (wie zwei Hände)
  function klatscher(t, laut, hell, versatz) {
    var f = 1100 + (hell || 0);
    for (var k = 0; k < 3; k++) rausch(t + k * 0.009, 0.02, 'bandpass', f, 0.9, laut * (k === 2 ? 1 : 0.7), 0.001, 0.012, (versatz || 0) + k * 0.03);
    rausch(t + 0.027, 0.16, 'bandpass', f * 1.15, 0.7, laut * 0.55, 0.002, 0.11, (versatz || 0) + 0.2);
  }
  // Applaus: viele Klatscher in fester Reihenfolge, schwillt an und ab
  function applaus(t, dauer, laut) {
    var z = zahlen(77), n = Math.round(dauer * 34);
    for (var k = 0; k < n; k++) {
      var p = k / n, form = Math.sin(Math.PI * Math.min(1, p * 1.25));
      klatscher(t + p * dauer + z() * 0.03, laut * (0.25 + 0.75 * form) * (0.5 + z() * 0.5), (z() - 0.5) * 900, z() * 0.6);
    }
  }
  function akkord(t, freis, art, laut, an, ab, stufe) {
    freis.forEach(function (f, k) { ton(t + k * (stufe || 0), f, art, laut, an, ab); });
  }

  var TOENE = {
    // leises Klicken bei jedem Knopf
    klick: function (t) { ton(t, 1650, 'sine', 0.09, 0.002, 0.03); rausch(t, 0.02, 'highpass', 3500, 0.7, 0.1, 0.001, 0.012); },
    // Abhaken: ein kurzes „Plopp“ nach oben
    haken: function (t) { var o = ton(t, 520, 'sine', 0.35, 0.004, 0.14); o.frequency.exponentialRampToValueAtTime(1180, t + 0.07); },
    // Training startet: Schwung nach oben und ein tiefer Schlag
    start: function (t) {
      var o = ton(t, 70, 'sine', 0.5, 0.005, 0.28); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
      rausch(t, 0.35, 'bandpass', 900, 0.8, 0.12, 0.2, 0.12);
      akkord(t + 0.22, [523.25, 783.99], 'triangle', 0.12, 0.01, 0.35, 0.06);
    },
    // Satz fertig: Hantelscheibe klingt kurz an, dazu ein dumpfer Schlag
    satz: function (t) {
      var o = ton(t, 95, 'sine', 0.45, 0.003, 0.16); o.frequency.exponentialRampToValueAtTime(60, t + 0.14);
      [523, 1347, 2215, 3120].forEach(function (f, k) { ton(t + 0.005, f, 'sine', 0.13 / (k + 1), 0.002, 0.5 - k * 0.08); });
    },
    // Pause vorbei: zwei helle Töne, weiter geht’s
    weiter: function (t) { ton(t, 783.99, 'triangle', 0.22, 0.01, 0.22); ton(t + 0.18, 1174.66, 'triangle', 0.24, 0.01, 0.4); },
    // Übung oder Station geschafft: drei Töne nach oben, mit Glanz
    station: function (t) {
      akkord(t, [523.25, 659.25, 783.99], 'triangle', 0.2, 0.008, 0.32, 0.09);
      ton(t + 0.27, 1567.98, 'sine', 0.12, 0.01, 0.6);
      klatscher(t + 0.3, 0.5, 200, 0.1);
    },
    // Training geschafft: Klatschen im Takt, Applaus und ein heller Akkord
    geschafft: function (t) {
      klatscher(t, 0.9, 0, 0.05); klatscher(t + 0.24, 0.9, 120, 0.15); klatscher(t + 0.48, 1, 240, 0.25);
      var a = t + 0.62;
      akkord(a, [261.63, 329.63, 392, 523.25], 'sawtooth', 0.045, 0.06, 1.5, 0.05);
      akkord(a, [523.25, 659.25, 783.99, 1046.5], 'triangle', 0.13, 0.02, 1.4, 0.07);
      applaus(a + 0.05, 2.1, 0.55);
    },
    // Neuer Rang: kleine Fanfare, dann Applaus
    aufstieg: function (t) {
      [392, 523.25, 659.25].forEach(function (f, k) { ton(t + k * 0.12, f, 'square', 0.06, 0.005, 0.1); ton(t + k * 0.12, f, 'triangle', 0.16, 0.005, 0.12); });
      var a = t + 0.4;
      akkord(a, [523.25, 659.25, 783.99, 1046.5, 1318.5], 'triangle', 0.12, 0.02, 1.6, 0.03);
      [2093, 2637, 3136, 4186].forEach(function (f, k) { ton(a + 0.15 + k * 0.08, f, 'sine', 0.05, 0.005, 0.5); });
      applaus(a + 0.2, 1.8, 0.5);
    },
    // Neue Bestleistung: tiefer Schlag und Glanz
    bestleistung: function (t) {
      var o = ton(t, 80, 'sine', 0.5, 0.004, 0.3); o.frequency.exponentialRampToValueAtTime(50, t + 0.28);
      akkord(t + 0.05, [659.25, 987.77, 1318.5], 'triangle', 0.14, 0.01, 0.9, 0.06);
      [2637, 3520].forEach(function (f, k) { ton(t + 0.3 + k * 0.1, f, 'sine', 0.05, 0.005, 0.5); });
    }
  };
  // Vibration je Ereignis (Millisekunden, wie navigator.vibrate)
  var MUSTER = {
    klick: 8, haken: 12, start: [30, 60, 50], satz: [25, 50, 25], weiter: [40, 70, 40],
    station: [20, 40, 20, 40, 60], geschafft: [30, 210, 30, 210, 40, 160, 220], aufstieg: [20, 100, 20, 100, 30, 140, 260], bestleistung: [60, 80, 120]
  };

  // Große Momente spielen nacheinander, nie übereinander (z. B. Training geschafft und gleich danach ein neuer Rang)
  var GROSS = { geschafft: 2.6, aufstieg: 2.2, bestleistung: 1.1 };
  var frei = 0;   // Zeit (Date.now), ab der der nächste große Moment beginnen darf
  function spiel(name, nurTon) {
    var jetzt = Date.now(), warte = 0;
    if (GROSS[name]) { warte = Math.max(0, frei - jetzt); frei = jetzt + warte + GROSS[name] * 1000; }
    try {
      if (TOENE[name] && bereit()) TOENE[name](ctx.currentTime + 0.01 + warte / 1000);
    } catch (e) { /* nichts */ }
    if (!nurTon && MUSTER[name] !== undefined) {
      if (warte) setTimeout(function () { vibrieren(MUSTER[name]); }, warte); else vibrieren(MUSTER[name]);
    }
  }

  /* ---------- Antippen: leises Klicken und Klopfen, Abhaken mit Plopp ---------- */
  var LEISE_KNOEPFE = '.raum-stick, .raum-kamstick';   // Knüppel im Gym: kein Klicken bei jeder Bewegung
  document.addEventListener('click', function (e) {
    var jetzt = Date.now();
    if (offen && jetzt - offen.zeit < 900) { klopfer(offen.n); offen = null; }
    else { offen = null; }
    var el = e.target && e.target.closest ? e.target.closest(ZIEL) : null;
    if (!el || el.disabled || el.closest(LEISE_KNOEPFE)) { bereit(); return; }
    if (el.dataset && el.dataset.ton === 'aus') { bereit(); return; }   // Knöpfe mit eigenem Ton (z. B. Satz fertig) sagen das selbst
    spiel(el.matches('.haken, .haken *') ? 'haken' : 'klick', true);   // die Vibration beim Drücken macht schon antippen.js
  }, true);
  // Das iPhone gibt Töne erst nach einer Berührung frei: beim ersten Antippen vorbereiten
  ['touchend', 'pointerup', 'keydown'].forEach(function (art) { document.addEventListener(art, function () { bereit(); }, { capture: true, passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ctx && ctx.state !== 'running') { try { ctx.resume(); } catch (e) { /* nichts */ } } });

  window.DKGefuehl = {
    spiel: spiel,
    ton: function () { return tonAn(); },
    vibration: function () { return vibAn(); },
    setzeTon: function (an) { setze('dk_ton', an); if (an) spiel('haken', true); },
    setzeVibration: function (an) { setze('dk_vibration', an); if (an) vibrieren(MUSTER.satz); },
    iphoneKlopfen: !nativ
  };
})();
