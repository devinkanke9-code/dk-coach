/* DK Coach – kurze Coaching-Anfrage unter /analyse/ (27.11.2026)
 * Devin: „Neuen Besuchern soll sofort klar sein, dass ich persönliches Fitness-Coaching anbiete … Öffne den Fragebogen direkt mit der Zielfrage.“
 * Ablauf: Ziel → Wobei soll ich dich unterstützen (mehrfach) → passende Rückfragen (jede nur einmal) → Kontakt → Zusammenfassung → „Coaching anfragen“.
 * Keine Gesundheitsdaten, kein Plan, keine Buchung, keine Zahlung. Die ausführliche Analyse mit Gesundheits-Check kommt danach (analyse/?onboarding).
 * Versand: ohne eigenes Skript (kontakt.json → anfrage_skript) öffnet „Coaching anfragen“ die Mail-App. Das sagt die Seite vorher, und die Bestätigung
 * erscheint erst, wenn die Person selbst sagt, dass sie die Mail abgeschickt hat. Mit Skript zählt nur die Antwort { ok: true }.
 * Antworten aus ausgeblendeten Zweigen bleiben im Entwurf (Zurück erhält sie), erscheinen aber weder in der Zusammenfassung noch in der Nachricht.
 * Betreff und Text enthalten bewusst weder „Analyse für“ noch „DK-Analyse“: Die Trainer-Seite (Gmail-Eingang, Autopilot) macht daraus nie einen Plan. */
(function () {
  'use strict';
  var KEY = 'dk_anfrage1', MAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

  var ZIELE = [['muskeln', 'Muskeln aufbauen'], ['abnehmen', 'Abnehmen'], ['staerker', 'Stärker werden'], ['fitter', 'Fitter werden'], ['regelmaessig', 'Regelmäßig trainieren'], ['unsicher', 'Ich bin mir noch unsicher']];
  var HILFE = [['plan', 'Einen Trainingsplan für meinen Alltag'], ['feedback', 'Feedback zu meinen Übungen'], ['dranbleiben', 'Hilfe beim Dranbleiben'],
    ['ernaehrung', 'Unterstützung bei der Ernährung oder ein Ernährungsplan'], ['besprechen', 'Erst mal besprechen, was zu mir passt']];
  var ERFAHRUNG = [['neu', 'Ich fange gerade an'], ['etwas', 'Weniger als 1 Jahr'], ['jahre', '1 bis 3 Jahre'], ['lange', 'Mehr als 3 Jahre']];
  var ORT = [['gym', 'Im Gym'], ['zuhause', 'Zuhause'], ['beides', 'Beides']];
  var GERAETE = [['kurzhanteln', 'Kurzhanteln'], ['langhantel', 'Langhantel'], ['bank', 'Hantelbank'], ['klimmzug', 'Klimmzugstange'], ['baender', 'Widerstandsbänder'], ['keine', 'Keine Geräte']];
  var TAGE = [['1', '1× pro Woche'], ['2', '2× pro Woche'], ['3', '3× pro Woche'], ['4', '4× pro Woche'], ['5', '5× oder öfter'], ['wechselt', 'Meine Woche wechselt']];
  var DAUER = [['30', 'Bis 30 Min.'], ['45', 'Etwa 45 Min.'], ['60', 'Etwa 60 Min.'], ['90', '90 Min. oder mehr']];
  var ESSEN = [['einfach', 'Einfache Mahlzeiten'], ['struktur', 'Mehr Struktur'], ['plan', 'Ein konkreter Ernährungsplan'], ['unsicher', 'Ich bin mir noch unsicher']];
  var RHYTHMUS = [['arbeitszeiten', 'Wechselnde Arbeitszeiten'], ['zeit', 'Wenig Zeit'], ['plan', 'Kein fester Plan'], ['anderes', 'Etwas anderes']];
  var KONTAKTWEG = [['mail', 'E-Mail'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram']];
  var SCHWERPUNKT = { training: { name: 'Regelmäßig trainieren', hilfe: ['plan'] }, ernaehrung: { name: 'Ernährung im Alltag', hilfe: ['ernaehrung'] } };

  function label(liste, w) { for (var i = 0; i < liste.length; i++) if (liste[i][0] === w) return liste[i][1]; return ''; }
  function labels(liste, ws) { return [].concat(ws || []).map(function (w) { return label(liste, w); }).filter(Boolean); }
  function leer(v) { return v == null || v === '' || (Array.isArray(v) && !v.length); }
  function hat(w) { return [].concat(A.hilfe || []).indexOf(w) >= 0; }

  var O, inhalt, zu, A = {}, S = { schritt: 0, gesendet: false, weg: null, t: null, schwerpunkt: null, mailGeoeffnet: false, sendFehler: false, vonUebersicht: false, raus: false };

  function h(tag, attr) {
    var el = document.createElement(tag);
    Object.keys(attr || {}).forEach(function (k) {
      var v = attr[k]; if (v == null || v === false) return;
      if (k === 'text') el.textContent = v; else if (k === 'class') el.className = v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v; else if (k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = !!v; else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(function (c) { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  function toast(t) {
    var alt = document.querySelector('.toast'); if (alt) alt.remove();
    var el = h('div', { class: 'toast', role: 'status', text: t }); document.body.append(el); setTimeout(function () { el.remove(); }, 3800);
  }
  function laden() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.v === 1 && d.a && typeof d.a === 'object') {
        A = d.a; S.schritt = Math.max(0, +d.schritt || 0); S.gesendet = !!d.gesendet; S.weg = d.weg || null; S.t = +d.t || null; S.schwerpunkt = SCHWERPUNKT[d.sp] ? d.sp : null;
        if (S.gesendet && S.t && Date.now() - S.t > 30 * 864e5) { localStorage.removeItem(KEY); A = {}; S.schritt = 0; S.gesendet = false; S.t = null; S.weg = null; }   // 30 Tage nach dem Senden: weg vom Handy
      }
    } catch (e) { /* kein Speicher: neu anfangen */ }
  }
  function speichern() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, a: A, schritt: S.schritt, gesendet: S.gesendet, weg: S.weg, t: S.t, sp: S.schwerpunkt })); } catch (e) { /* ohne Speicher geht es trotzdem */ } }
  function aendern() { S.gesendet = false; S.t = null; S.mailGeoeffnet = false; speichern(); }

  /* ---------- Schritte: hängen von „Wobei soll ich dich unterstützen?“ ab, jede Rückfrage nur einmal ---------- */
  function schritte() {
    var l = [{ art: 'ziel', titel: 'Dein Ziel' }, { art: 'hilfe', titel: 'Unterstützung' }];
    var nurBesprechen = hat('besprechen') && (A.hilfe || []).length === 1;
    if (!nurBesprechen) {
      if (hat('plan') || hat('feedback')) l.push({ art: 'training', titel: 'Dein Training' }, { art: 'woche', titel: 'Deine Woche' }, { art: 'wuensche', titel: 'Wünsche' });
      if (hat('ernaehrung')) l.push({ art: 'essen', titel: 'Ernährung' });
      if (hat('dranbleiben')) l.push({ art: 'rhythmus', titel: 'Dranbleiben' });
    }
    if (hat('besprechen')) l.push({ art: 'besprechen', titel: 'Besprechen' });
    l.push({ art: 'kontakt', titel: 'Kontakt' }, { art: 'uebersicht', titel: 'Zusammenfassung' });
    return l;
  }
  function stelle(art) { var l = schritte(); for (var i = 0; i < l.length; i++) if (l[i].art === art) return i + 1; return 1; }

  /* ---------- Bausteine ---------- */
  function kopf(st, n, gesamt, titel, unter) {
    return [h('div', { class: 'an-fortschritt', role: 'progressbar', 'aria-label': 'Fortschritt', 'aria-valuemin': '0', 'aria-valuemax': String(gesamt), 'aria-valuenow': String(n), 'aria-valuetext': 'Schritt ' + n + ' von ' + gesamt },
      h('i', { style: 'width:' + Math.round(n / gesamt * 100) + '%' })),
      h('div', { class: 'an-kopfzeile' }, h('p', { class: 'titelzeile', text: st.titel }), h('span', { class: 'an-schritt', text: 'Schritt ' + n + ' von ' + gesamt })),
      h('h1', { class: 'frage-titel', id: 'titel', tabindex: '-1', text: titel }),
      unter ? h('p', { class: 'leise', id: 'titel-unter', text: unter }) : null];
  }
  // Auswahlkarten: Radio (eins) oder Checkbox (mehrere), echte Formularelemente = Tastatur, Vorlesen und sichtbarer Fokus aus stil.css
  function karten(name, liste, wert, mehr, setze, gruppenLabel) {
    var werte = [].concat(wert || []);
    return h('div', { class: 'optionen af-karten', role: mehr ? 'group' : 'radiogroup', 'aria-labelledby': gruppenLabel || 'titel' }, liste.map(function (o, i) {
      var an = werte.indexOf(o[0]) >= 0;
      return h('label', null, h('input', { type: mehr ? 'checkbox' : 'radio', name: name, id: name + '_' + i, value: o[0], checked: an, onchange: function (e) {
        if (!mehr) { setze(o[0]); return; }
        var neu = [].concat(A[name] || []).filter(function (x) { return x !== o[0]; });
        if (e.target.checked) { if (o[0] === 'keine') neu = []; else neu = neu.filter(function (x) { return x !== 'keine'; }); neu.push(o[0]); }
        setze(neu);
      } }), h('span', { text: o[1] }));
    }));
  }
  function frage(id, text, inhaltEl, frei) {
    return h('div', { class: 'feld af-frage', role: 'group', 'aria-labelledby': id + '_l' }, h('p', { class: 'af-label', id: id + '_l' }, text, frei ? h('span', { class: 'frei', text: ' (freiwillig)' }) : null), inhaltEl);
  }
  function setzeUndZeichne(feld) { return function (v) { if (leer(v)) delete A[feld]; else A[feld] = v; aendern(); zeichne(true); }; }
  function fehlerZeile(id) { return h('p', { class: 'af-fehler', id: id, role: 'alert', hidden: true }); }
  function zeigeFehler(text, fokus) {
    var f = document.getElementById('af-fehler'); if (!f) { toast(text); return; }
    f.textContent = text; f.hidden = false;
    var el = fokus ? document.querySelector(fokus) : null; if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' }); } else f.scrollIntoView({ block: 'center' });
  }
  function fuss(n, gesamt, weiterText, los, zurueckWeg) {
    return h('div', { class: 'fuss reihe' },
      n > 1 || zurueckWeg ? h('button', { class: 'knopf', type: 'button', onclick: function () { S.vonUebersicht = false; if (n > 1) geh(n - 1); else location.href = '../'; }, text: n > 1 ? 'Zurück' : 'Startseite' }) : h('span'),
      h('button', { class: 'knopf haupt', type: 'button', style: 'margin-left:auto', onclick: los, text: weiterText }));
  }
  function weiterText(n, gesamt) { return S.vonUebersicht ? 'Zur Zusammenfassung' : n + 1 === gesamt ? 'Zur Zusammenfassung' : 'Weiter'; }
  // Aus der Zusammenfassung geändert: Hat die Änderung neue Rückfragen freigeschaltet (z. B. Ernährung dazu), kommen die zuerst, dann zurück zur Zusammenfassung
  function weiter(n, gesamt) {
    if (!S.vonUebersicht) { geh(n + 1); return; }
    var offen = luecke();
    if (offen && offen !== n && offen < stelle('uebersicht')) { geh(offen); return; }
    S.vonUebersicht = false; geh(stelle('uebersicht'));
  }

  /* ---------- Seiten ---------- */
  function zielSeite(st, n, g) {
    var sp = S.schwerpunkt ? SCHWERPUNKT[S.schwerpunkt] : null;
    return [h('section', { class: 'block' },
      h('p', { class: 'af-einstieg', text: 'Erzähl mir kurz, wo du stehst und was du erreichen willst.' }),
      kopf(st, n, g, 'Was möchtest du erreichen?', 'Tipp an, was am meisten zählt. Das ist dein Hauptziel.'),
      sp ? h('p', { class: 'af-schwerpunkt' }, 'Dein Schwerpunkt: ', h('b', { text: sp.name }), '. Du kannst ihn gleich noch ändern.') : null,
      altEntwurf(),
      karten('ziel', ZIELE, A.ziel, false, setzeUndZeichne('ziel')),
      fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () { if (!A.ziel) { zeigeFehler('Bitte tipp ein Ziel an. „Ich bin mir noch unsicher“ geht auch.', 'input[name=ziel]'); return; } weiter(n, g); }, true),
      ruhigerHinweis()];
  }
  function hilfeSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Wobei soll ich dich unterstützen?', 'Du kannst mehreres antippen.'),
      karten('hilfe', HILFE, A.hilfe, true, setzeUndZeichne('hilfe')), fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () { if (leer(A.hilfe)) { zeigeFehler('Bitte tipp mindestens eins an. „Erst mal besprechen“ geht auch.', 'input[name=hilfe]'); return; } weiter(n, g); })];
  }
  function trainingSeite(st, n, g) {
    var mitGeraeten = A.ort === 'zuhause' || A.ort === 'beides';
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Wo stehst du beim Training?', 'Damit ich weiß, womit wir starten.'),
      frage('erfahrung', 'Wie viel Erfahrung hast du?', karten('erfahrung', ERFAHRUNG, A.erfahrung, false, setzeUndZeichne('erfahrung'), 'erfahrung_l')),
      frage('ort', 'Wo trainierst du?', karten('ort', ORT, A.ort, false, setzeUndZeichne('ort'), 'ort_l')),
      mitGeraeten ? frage('geraete', 'Welche Geräte hast du zuhause?', karten('geraete', GERAETE, A.geraete, true, setzeUndZeichne('geraete'), 'geraete_l')) : null,
      fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () {
        if (!A.erfahrung) { zeigeFehler('Bitte tipp an, wie viel Erfahrung du hast.', 'input[name=erfahrung]'); return; }
        if (!A.ort) { zeigeFehler('Bitte tipp an, wo du trainierst.', 'input[name=ort]'); return; }
        if (mitGeraeten && leer(A.geraete)) { zeigeFehler('Bitte tipp an, welche Geräte du hast. „Keine Geräte“ geht auch.', 'input[name=geraete]'); return; }
        weiter(n, g);
      })];
  }
  function wocheSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Wie oft und wie lange kannst du trainieren?', 'Ehrlich, auch in stressigen Wochen. Lieber wenig, das du schaffst.'),
      frage('tage', 'Wie oft pro Woche?', karten('tage', TAGE, A.tage, false, setzeUndZeichne('tage'), 'tage_l')),
      frage('dauer', 'Wie viel Zeit pro Training?', karten('dauer', DAUER, A.dauer, false, setzeUndZeichne('dauer'), 'dauer_l')),
      fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () {
        if (!A.tage) { zeigeFehler('Bitte tipp an, wie oft du trainieren kannst. „Meine Woche wechselt“ geht auch.', 'input[name=tage]'); return; }
        if (!A.dauer) { zeigeFehler('Bitte tipp an, wie viel Zeit du pro Training hast.', 'input[name=dauer]'); return; }
        weiter(n, g);
      })];
  }
  function textfeld(id, wert, platzhalter, labelId) {
    return h('textarea', { class: 'eingabe', id: 'f_' + id, 'aria-labelledby': labelId, value: wert || '', maxlength: 1000, rows: 3, placeholder: platzhalter,
      oninput: function (e) { var v = e.target.value; if (v.trim()) A[id] = v; else delete A[id]; aendern(); } });
  }
  function wuenscheSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Hast du besondere Wünsche?', 'Freiwillig. Du kannst diesen Schritt mit einem Tipp überspringen.'),
      frage('vorlieben', 'Übungen, die du gern machst oder gar nicht magst', textfeld('vorlieben', A.vorlieben, 'z. B. gern Kniebeugen, kein Laufband', 'vorlieben_l'), true),
      frage('wunsch', 'Sonst noch etwas, worauf ich achten soll?', textfeld('wunsch', A.wunsch, 'z. B. Rücken stärken, Training vor der Arbeit', 'wunsch_l'), true)),
      h('div', { class: 'fuss reihe' },
        h('button', { class: 'knopf', type: 'button', onclick: function () { S.vonUebersicht = false; geh(n - 1); }, text: 'Zurück' }),
        h('button', { class: 'knopf text af-ueberspringen', type: 'button', onclick: function () { weiter(n, g); }, text: 'Überspringen' }),
        h('button', { class: 'knopf haupt', type: 'button', onclick: function () { weiter(n, g); }, text: weiterText(n, g) }))];
  }
  function essenSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Was würde dir im Alltag am meisten helfen?', 'Beim Essen. Die genauen Fragen klären wir später.'),
      karten('essen', ESSEN, A.essen, false, setzeUndZeichne('essen')), fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () { if (!A.essen) { zeigeFehler('Bitte tipp an, was dir am meisten helfen würde.', 'input[name=essen]'); return; } weiter(n, g); })];
  }
  function rhythmusSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Was bringt dich gerade am ehesten aus dem Rhythmus?', 'Damit wir genau da ansetzen.'),
      karten('rhythmus', RHYTHMUS, A.rhythmus, false, setzeUndZeichne('rhythmus')),
      A.rhythmus === 'anderes' ? frage('rhythmus_text', 'Was ist es?', textfeld('rhythmus_text', A.rhythmus_text, 'Ein Satz reicht', 'rhythmus_text_l'), true) : null,
      fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () { if (!A.rhythmus) { zeigeFehler('Bitte tipp an, was am ehesten passt. „Etwas anderes“ geht auch.', 'input[name=rhythmus]'); return; } weiter(n, g); })];
  }
  function besprechenSeite(st, n, g) {
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Was möchtest du mit mir klären?', 'Freiwillig. Du kannst das Feld auch leer lassen.'),
      frage('klaeren', 'Deine Frage oder dein Thema', textfeld('klaeren', A.klaeren, 'z. B. Wie fange ich an, wenn ich Schicht arbeite?', 'klaeren_l'), true)),
      fuss(n, g, weiterText(n, g), function () { weiter(n, g); })];
  }
  function kontaktFeldInfo() {
    return A.weg === 'whatsapp' ? { label: 'Deine Handynummer für WhatsApp', typ: 'tel', mode: 'tel', ac: 'tel', ph: 'z. B. 0151 23456789' }
      : A.weg === 'instagram' ? { label: 'Dein Instagram-Name', typ: 'text', mode: 'text', ac: 'off', ph: 'z. B. @deinname' }
        : { label: 'Deine E-Mail-Adresse', typ: 'email', mode: 'email', ac: 'email', ph: 'Deine E-Mail-Adresse' };
  }
  function kontaktFehler() {
    var w = String(A.kontakt || '').trim();
    if (!String(A.vorname || '').trim()) return ['Bitte trag deinen Vornamen ein.', '#f_vorname'];
    if (!w) return [A.weg === 'whatsapp' ? 'Bitte trag deine Handynummer ein.' : A.weg === 'instagram' ? 'Bitte trag deinen Instagram-Namen ein.' : 'Bitte trag deine E-Mail-Adresse ein.', '#f_kontakt'];
    if ((A.weg || 'mail') === 'mail' && !MAIL_RE.test(w)) return ['Die E-Mail-Adresse sieht nicht vollständig aus. Sie braucht ein @ und eine Endung wie .de.', '#f_kontakt'];
    if (A.weg === 'whatsapp' && !/^\+?[0-9 ()/-]{6,22}$/.test(w)) return ['Die Handynummer sieht nicht richtig aus. Nur Ziffern, Leerzeichen und + am Anfang.', '#f_kontakt'];
    if (A.weg === 'instagram' && !/^@?[A-Za-z0-9._]{1,30}$/.test(w)) return ['Der Instagram-Name darf nur Buchstaben, Zahlen, Punkt und Unterstrich haben.', '#f_kontakt'];
    return null;
  }
  function kontaktSeite(st, n, g) {
    if (!A.weg) A.weg = 'mail';
    var info = kontaktFeldInfo();
    var vor = h('input', { class: 'eingabe', id: 'f_vorname', type: 'text', autocomplete: 'given-name', maxlength: 40, value: A.vorname || '', 'aria-describedby': 'af-fehler',
      oninput: function (e) { var v = e.target.value; if (v.trim()) A.vorname = v; else delete A.vorname; e.target.removeAttribute('aria-invalid'); aendern(); } });
    var kon = h('input', { class: 'eingabe', id: 'f_kontakt', type: info.typ, inputmode: info.mode, autocomplete: info.ac, maxlength: 120, value: A.kontakt || '', placeholder: info.ph, 'aria-describedby': 'af-fehler',
      oninput: function (e) { var v = e.target.value; if (v.trim()) A.kontakt = v; else delete A.kontakt; e.target.removeAttribute('aria-invalid'); aendern(); } });
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Wie erreiche ich dich?', 'Damit ich mich bei dir melden kann.'),
      h('div', { class: 'feld' }, h('label', { for: 'f_vorname', text: 'Dein Vorname' }), vor),
      frage('weg', 'Wie soll ich mich melden?', karten('weg', KONTAKTWEG, A.weg, false, function (v) { A.weg = v; delete A.kontakt; aendern(); zeichne(true); }, 'weg_l')),
      h('div', { class: 'feld' }, h('label', { for: 'f_kontakt', text: info.label }), kon),
      h('p', { class: 'leise klein', text: 'Ich nutze das nur, um dir zu antworten. Fragen zur Gesundheit kommen erst später, wenn wir gesprochen haben.' }),
      fehlerZeile('af-fehler')),
      fuss(n, g, weiterText(n, g), function () {
        var f = kontaktFehler();
        if (f) { var el = document.querySelector(f[1]); if (el) el.setAttribute('aria-invalid', 'true'); zeigeFehler(f[0], f[1]); return; }
        A.vorname = String(A.vorname).trim(); A.kontakt = String(A.kontakt).trim(); speichern(); weiter(n, g);
      })];
  }

  /* ---------- Zusammenfassung und Nachricht: nur was zu den aktuellen Antworten gehört ---------- */
  function teile() {
    var l = schritte(), arten = l.map(function (s) { return s.art; }), z = [];
    var sp = S.schwerpunkt ? SCHWERPUNKT[S.schwerpunkt].name : null;
    z.push({ art: 'ziel', titel: 'Dein Ziel', zeilen: [['Hauptziel', label(ZIELE, A.ziel)]].concat(sp ? [['Schwerpunkt', sp]] : []) });
    z.push({ art: 'hilfe', titel: 'Unterstützung', zeilen: [[null, labels(HILFE, A.hilfe).join('\n')]] });
    if (arten.indexOf('training') >= 0) {
      var tz = [['Erfahrung', label(ERFAHRUNG, A.erfahrung)], ['Ort', label(ORT, A.ort)]];
      if (A.ort === 'zuhause' || A.ort === 'beides') tz.push(['Geräte', labels(GERAETE, A.geraete).join(', ')]);
      z.push({ art: 'training', titel: 'Dein Training', zeilen: tz });
      z.push({ art: 'woche', titel: 'Deine Woche', zeilen: [['Wie oft', label(TAGE, A.tage)], ['Wie lange', label(DAUER, A.dauer)]] });
      var wz = []; if (A.vorlieben) wz.push(['Übungen', A.vorlieben.trim()]); if (A.wunsch) wz.push(['Sonst noch', A.wunsch.trim()]);
      z.push({ art: 'wuensche', titel: 'Wünsche', zeilen: wz.length ? wz : [[null, 'Keine angegeben']] });
    }
    if (arten.indexOf('essen') >= 0) z.push({ art: 'essen', titel: 'Ernährung', zeilen: [['Am meisten hilft', label(ESSEN, A.essen)]] });
    if (arten.indexOf('rhythmus') >= 0) z.push({ art: 'rhythmus', titel: 'Dranbleiben', zeilen: [['Aus dem Rhythmus bringt mich', label(RHYTHMUS, A.rhythmus) + (A.rhythmus === 'anderes' && A.rhythmus_text ? ': ' + A.rhythmus_text.trim() : '')]] });
    if (arten.indexOf('besprechen') >= 0) z.push({ art: 'besprechen', titel: 'Besprechen', zeilen: [[null, A.klaeren ? A.klaeren.trim() : 'Kein Thema angegeben, einfach besprechen']] });
    z.push({ art: 'kontakt', titel: 'Kontakt', zeilen: [['Vorname', String(A.vorname || '').trim()], [label(KONTAKTWEG, A.weg || 'mail'), String(A.kontakt || '').trim()]] });
    return z;
  }
  function betreff() { return 'Coaching-Anfrage: ' + String(A.vorname || '').trim().slice(0, 40); }
  function nachricht() {
    var z = ['Hi Devin, ich interessiere mich für dein persönliches Coaching.', ''];
    teile().forEach(function (t) { z.push(t.titel.toUpperCase()); t.zeilen.forEach(function (x) { z.push((x[0] ? x[0] + ': ' : '') + x[1]); }); z.push(''); });
    z.push('Unverbindliche Anfrage über die Webseite. Keine Buchung, keine Zahlung.');
    return z.join('\n');
  }
  function mailLink() { return 'mailto:' + O.empfaenger + '?subject=' + encodeURIComponent(betreff()) + '&body=' + encodeURIComponent(nachricht()); }
  function luecke() {   // erster Schritt (1-basiert), an dem noch etwas fehlt, sonst 0
    var l = schritte();
    for (var i = 0; i < l.length; i++) {
      var a = l[i].art, fehlt = (a === 'ziel' && !A.ziel) || (a === 'hilfe' && leer(A.hilfe)) || (a === 'training' && (!A.erfahrung || !A.ort || ((A.ort === 'zuhause' || A.ort === 'beides') && leer(A.geraete))))
        || (a === 'woche' && (!A.tage || !A.dauer)) || (a === 'essen' && !A.essen) || (a === 'rhythmus' && !A.rhythmus) || (a === 'kontakt' && !!kontaktFehler());
      if (fehlt) return i + 1;
    }
    return 0;
  }
  function bereit() {   // vor dem Senden: alles Nötige da? Sonst zur ersten Lücke
    var n = luecke();
    if (n) { toast('Da fehlt noch etwas.'); geh(n); return false; }
    return true;
  }
  var sendet = false;
  function absenden(knopf) {
    if (sendet || !bereit()) return;
    sendet = true; knopf.disabled = true; knopf.textContent = 'Wird gesendet …';
    var stopp = typeof AbortController === 'function' ? new AbortController() : null, uhr = setTimeout(function () { if (stopp) stopp.abort(); }, 20000);
    var paket = { art: 'anfrage', v: 1, betreff: betreff(), text: nachricht(), mail: (A.weg || 'mail') === 'mail' ? String(A.kontakt).trim().toLowerCase() : null };
    var ende = function () { clearTimeout(uhr); sendet = false; };
    fetch(O.anfrage.skript, { method: 'POST', body: JSON.stringify(paket), cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: stopp ? stopp.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { if (!j || j.ok !== true) throw new Error(String((j && j.grund) || 'abgelehnt')); S.sendFehler = false; S.gesendet = true; S.weg = 'skript'; S.t = Date.now(); speichern(); })
      .then(function () { zeichne(); }, function () { S.sendFehler = true; zeichne(true); toast('Das hat nicht geklappt. Deine Antworten sind noch da.'); })
      .then(ende, ende);
  }
  function kopieren() {
    var text = 'An: ' + O.empfaenger + '\nBetreff: ' + betreff() + '\n\n' + nachricht();
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('Kopiert. Füg den Text in eine Mail an ' + O.empfaenger + ' ein.'); }, function () {
      var feld = h('textarea', { class: 'eingabe', rows: 6, readonly: true, value: text, 'aria-label': 'Anfrage zum Kopieren' });
      var ort = document.getElementById('af-kopie'); if (ort) { ort.textContent = ''; ort.append(h('p', { class: 'klein', text: 'Markier den Text und kopier ihn:' }), feld); feld.select(); }
    });
  }
  function uebersichtSeite(st, n, g) {
    var skript = !!(O.anfrage && O.anfrage.skript);
    var los = skript ? h('button', { class: 'knopf haupt', type: 'button', text: 'Coaching anfragen', onclick: function (e) { absenden(e.currentTarget); } })
      : h('a', { class: 'knopf haupt', href: mailLink(), text: 'Coaching anfragen', onclick: function (e) { if (!bereit()) { e.preventDefault(); return; } S.mailGeoeffnet = true; setTimeout(function () { zeichne(true); }, 600); } });
    var bloecke = teile().map(function (t) {
      return h('section', null, h('div', { class: 'kopfzeile' }, h('h2', { text: t.titel }),
        h('button', { class: 'knopf text klein', type: 'button', 'aria-label': t.titel + ' ändern', onclick: function () { S.vonUebersicht = true; geh(stelle(t.art)); }, text: 'Ändern' })),
        t.zeilen.map(function (x) { return h('div', { class: 'zeile' + (x[0] ? ' paar' : '') }, x[0] ? h('b', { text: x[0] }) : null, h('span', { text: x[1] || '–' })); }));
    });
    return [h('section', { class: 'block' }, kopf(st, n, g, 'Stimmt alles?', 'Tipp auf „Ändern“, wenn du etwas anpassen willst.'),
      h('div', { class: 'zusammen' }, bloecke),
      h('div', { class: 'af-versand' + (S.mailGeoeffnet ? ' af-wartet' : '') },
        skript ? h('p', { class: 'leise klein', text: 'Mit „Coaching anfragen“ geht deine Anfrage direkt an mich (über ein Skript in meinem Google-Konto). Das ist keine Buchung und kostet nichts.' })
          : h('p', { class: 'af-wichtig', text: 'Wichtig: „Coaching anfragen“ öffnet deine Mail-App mit allem drin. Die Mail ist erst bei mir, wenn du sie dort selbst abschickst. Das ist keine Buchung und kostet nichts.' }),
        h('p', { class: 'leise klein', text: 'Empfänger: Devin Kanke' + (skript ? '.' : ', ' + O.empfaenger + '.') + ' Ich nutze deine Angaben nur, um dir zu antworten. Details stehen in der Datenschutzerklärung.' }),
        skript && S.sendFehler ? h('div', { class: 'meldung an-fehler', role: 'alert' },
          h('p', { text: 'Das Senden hat nicht geklappt. Deine Antworten sind noch da. Prüf dein Internet und tipp nochmal auf „Coaching anfragen“. Oder schick sie mit deiner Mail-App.' }),
          h('div', { class: 'reihe' }, h('a', { class: 'knopf', href: mailLink(), onclick: function () { S.mailGeoeffnet = true; setTimeout(function () { zeichne(true); }, 600); }, text: 'Mit Mail-App senden' }))) : null,
        S.mailGeoeffnet ? h('div', { class: 'meldung af-frage-gesendet', role: 'status' },
          h('p', { text: 'Hast du die Mail in deiner Mail-App abgeschickt?' }),
          h('div', { class: 'reihe' },
            h('button', { class: 'knopf haupt', type: 'button', onclick: function () { S.gesendet = true; S.weg = 'mail'; S.t = Date.now(); speichern(); zeichne(); }, text: 'Ja, abgeschickt' }),
            h('button', { class: 'knopf', type: 'button', onclick: function () { S.mailGeoeffnet = false; S.mailProblem = true; zeichne(true); }, text: 'Nein, das ging nicht' }))) : null,
        S.mailProblem && !S.mailGeoeffnet ? h('div', { class: 'meldung', role: 'status' },
          h('p', { text: 'Kein Problem. Kopier deine Anfrage und schick sie mir als Mail an ' + O.empfaenger + '. Oder schreib mir einfach „Interesse“.' }),
          h('div', { class: 'reihe' }, h('button', { class: 'knopf', type: 'button', onclick: kopieren, text: 'Anfrage kopieren' })), h('div', { id: 'af-kopie' })) : null),
      rechtliches()),
      h('div', { class: 'fuss reihe' }, h('button', { class: 'knopf', type: 'button', onclick: function () { geh(n - 1); }, text: 'Zurück' }), los)];
  }
  function dankeSeite() {
    var vn = String(A.vorname || '').trim();
    return [h('section', { class: 'block start af-danke' },
      h('img', { class: 'logo', src: '../icon.svg', alt: '' }),
      h('h1', { id: 'titel', tabindex: '-1', text: 'Danke' + (vn ? ', ' + vn : '') + '!' }),
      h('p', { text: 'Ich schaue mir deine Antworten an und melde mich bei dir. Dann besprechen wir, welche Unterstützung zu deinem Ziel und deinem Alltag passt.' }),
      S.weg === 'mail' ? h('p', { class: 'leise klein', text: 'Falls die Mail doch nicht rausging: Du findest sie in deiner Mail-App unter Entwürfe oder Postausgang.' }) : null,
      h('button', { class: 'knopf haupt', type: 'button', onclick: function () { location.href = '../'; }, text: 'Zur Startseite' }),
      h('button', { class: 'knopf text', type: 'button', onclick: function () { S.gesendet = false; S.mailGeoeffnet = false; geh(stelle('uebersicht')); }, text: 'Antworten nochmal ansehen' }),
      h('button', { class: 'knopf text', type: 'button', onclick: function () { try { localStorage.removeItem(KEY); } catch (e) { /* egal */ } A = {}; S.gesendet = false; S.schritt = 0; S.schwerpunkt = null; toast('Gelöscht.'); geh(1); }, text: 'Antworten auf diesem Handy löschen' })),
      rechtliches()];
  }
  function raus() {
    return h('section', { class: 'block start' },
      h('h1', { id: 'titel', tabindex: '-1', text: 'Später weitermachen?' }),
      h('p', { class: 'leise', text: 'Deine Antworten bleiben auf diesem Handy. Öffne die Seite einfach wieder, dann geht es da weiter, wo du aufgehört hast.' }),
      h('button', { class: 'knopf haupt', type: 'button', onclick: function () { S.raus = false; zeichne(); }, text: 'Weiter ausfüllen' }),
      h('button', { class: 'knopf text', type: 'button', onclick: function () { location.href = '../'; }, text: 'Zur Startseite' }));
  }
  function rechtliches() {
    var r = O.rechtliches || []; if (!r.length) return null;
    return h('p', { class: 'rechtliches' }, r.map(function (x) { return h('a', { href: x[1], text: x[0] }); }));
  }
  function ruhigerHinweis() {   // für alle, die von Devin den Link zur ausführlichen Analyse haben (alter Link ohne ?onboarding)
    return h('p', { class: 'leise klein af-onboarding' }, 'Hat Devin dir schon geschrieben und den Link zur ausführlichen Analyse geschickt? ', h('a', { href: '?onboarding', text: 'Zur ausführlichen Analyse' }), '.');
  }
  function altEntwurf() {   // Entwurf der ausführlichen Analyse (vor dem 27.11.2026 angefangen): nichts geht verloren
    try {
      var alt = JSON.parse(localStorage.getItem(O.altKey) || 'null');
      if (!alt || alt.gesendet || !(alt.schritt > 0)) return null;
      return h('div', { class: 'meldung klein af-alt' }, h('p', { text: 'Du hast die ausführliche Analyse schon angefangen. Die ist noch auf diesem Handy.' }), h('a', { class: 'knopf', href: '?onboarding', text: 'Dort weitermachen' }));
    } catch (e) { return null; }
  }

  /* ---------- Ablauf ---------- */
  function verlauf(n, ersetzen) { try { var st = { dkAnfrage: n }; if (ersetzen) history.replaceState(st, ''); else if (!history.state || history.state.dkAnfrage !== n) history.pushState(st, ''); } catch (e) { /* egal */ } }
  function geh(n) { S.schritt = n; S.raus = false; speichern(); verlauf(n); zeichne(); }
  function zeichne(still) {
    var y = window.scrollY, BEDIEN = 'input,button,select,textarea,a[href]';
    var fokusNr = still && document.activeElement && inhalt.contains(document.activeElement) ? [].indexOf.call(inhalt.querySelectorAll(BEDIEN), document.activeElement) : -1;
    if (!still) { var t = document.querySelector('.toast'); if (t) t.remove(); }
    var l = schritte(), g = l.length;
    if (S.schritt < 1) S.schritt = 1;
    if (S.schritt > g) S.schritt = g;
    var st = l[S.schritt - 1], n = S.schritt, teileListe;
    zu.hidden = S.raus || S.gesendet;
    if (S.raus) teileListe = raus();
    else if (S.gesendet) teileListe = dankeSeite();
    else teileListe = ({ ziel: zielSeite, hilfe: hilfeSeite, training: trainingSeite, woche: wocheSeite, wuensche: wuenscheSeite, essen: essenSeite, rhythmus: rhythmusSeite, besprechen: besprechenSeite, kontakt: kontaktSeite, uebersicht: uebersichtSeite })[st.art](st, n, g);
    inhalt.textContent = '';
    inhalt.classList.toggle('still', !!still);
    [].concat(teileListe).forEach(function (x) { if (x) inhalt.append(x); });
    if (still) { window.scrollTo(0, y); var wieder = fokusNr >= 0 ? inhalt.querySelectorAll(BEDIEN)[fokusNr] : null; if (wieder) wieder.focus({ preventScroll: true }); return; }
    window.scrollTo(0, 0);
    var titel = document.getElementById('titel'); if (titel) titel.focus({ preventScroll: true });
  }

  window.DKAnfrage = {
    start: function (opt) {
      O = opt; inhalt = opt.inhalt; zu = opt.zu;
      laden();
      // Schwerpunkt von der Startseite (?schwerpunkt=training|ernaehrung): änderbare Vorauswahl bei „Wobei soll ich dich unterstützen?“
      var m = /(^|&)schwerpunkt=(training|ernaehrung)(&|$)/.exec(location.search.slice(1));
      if (m && !S.gesendet) {
        S.schwerpunkt = m[2];
        if (leer(A.hilfe)) A.hilfe = SCHWERPUNKT[m[2]].hilfe.slice();
        else SCHWERPUNKT[m[2]].hilfe.forEach(function (w) { if (A.hilfe.indexOf(w) < 0) A.hilfe.push(w); });
        speichern();
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
      }
      if (!S.schritt) S.schritt = 1;
      zu.setAttribute('aria-label', 'Kurze Analyse verlassen');
      zu.addEventListener('click', function () { S.raus = true; zeichne(); });
      window.addEventListener('popstate', function (e) {
        if (S.gesendet) { location.replace('../'); return; }
        S.raus = false; S.vonUebersicht = false; S.schritt = e.state && typeof e.state.dkAnfrage === 'number' ? e.state.dkAnfrage : 1; speichern(); zeichne();
      });
      verlauf(S.schritt, true);
      zeichne();
    }
  };
})();
