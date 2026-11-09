/* DK Coach — Plan-Generator.
 * Rechnet regelbasiert aus Kundendaten + Wissensbasis einen Trainingsplan.
 * Jede Zahl kommt aus der Wissensbasis (wissen/daten). Fehlt etwas, meldet der
 * Generator das, statt einen Wert zu erfinden. Läuft im Browser (window.DKEngine)
 * und in Node (module.exports) — gleiche Datei.
 */
(function (root) {
  'use strict';

  var GELENKE = ['knie', 'huefte', 'lws', 'schulter', 'ellbogen', 'handgelenk'];
  var GYM_AUSRUESTUNG = ['koerpergewicht', 'band', 'kurzhantel', 'kettlebell', 'langhantel', 'sz_stange',
    'maschine', 'kabel', 'smith', 'bank', 'klimmzugstange', 'dipstation', 'box'];
  // Beschwerden aus dem Formular → Gelenk-Schlüssel der Übungsdatenbank
  var BESCHWERDE_GELENK = { knie: 'knie', schulter: 'schulter', ruecken: 'lws', huefte: 'huefte', ellbogen: 'ellbogen', handgelenk: 'handgelenk' };
  var LEVEL_NAME = { 1: 'Einstieg', 2: 'Grundlagen', 3: 'Fortgeschritten', 4: 'Erfahren', 5: 'Profi' };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function mitte(r) { return Array.isArray(r) ? (r[0] + r[r.length - 1]) / 2 : r; }
  function arr(x) { return Array.isArray(x) ? x : (x == null ? [] : [x]); }
  function parseMax(v) {
    if (typeof v === 'number') return v;
    var m = /max\s*(\d)/.exec(String(v || ''));
    return m ? +m[1] : 2;
  }
  // Level-Angaben: [a, b] = Bereich a bis b, längere Listen = einzelne Level
  function imLevel(liste, l) {
    var a = arr(liste);
    if (!a.length) return true;
    if (a.length === 2) return l >= a[0] && l <= a[1];
    return a.indexOf(l) >= 0;
  }
  function bmi(k) { return k.gewicht_kg && k.groesse_cm ? k.gewicht_kg / Math.pow(k.groesse_cm / 100, 2) : null; }

  /* ---------- 1. Screening ---------- */
  // Antworten: true = Ja, false = Nein, 'weiss_nicht' zählt wie Ja (PAR-Q+)
  function ja(k, id) { var v = k.screening && k.screening[id]; return v === true || v === 'weiss_nicht'; }
  function frageAktiv(k, f) {
    var n = f.nur_wenn;
    if (!n) return true;
    if (n.frage_ja && !ja(k, n.frage_ja)) return false;
    if (n.geschlecht && !(n.geschlecht === 'w' ? k.geschlecht === 'weiblich' : k.geschlecht === 'maennlich')) return false;
    return true;
  }
  function bedingungErfuellt(k, b) {
    var b2 = bmi(k);
    if (b.alter_min != null && !(k.alter != null && k.alter >= b.alter_min)) return false;
    if (b.alter_max != null && !(k.alter != null && k.alter <= b.alter_max)) return false;
    if (b.bmi_min != null && !(b2 != null && b2 >= b.bmi_min)) return false;
    if (b.ja_alle && !arr(b.ja_alle).every(function (id) { return ja(k, id); })) return false;
    if (b.ja_eine_von && !arr(b.ja_eine_von).some(function (id) { return ja(k, id); })) return false;
    if (b.ja_mindestens != null && arr(b.aus).filter(function (id) { return ja(k, id); }).length < b.ja_mindestens) return false;
    return true;
  }
  function pruefeScreening(W, k) {
    var res = { stopp: [], anpassen: [], hinweis: [], zielgruppen: [], beschwerden: [], zusatz: [], rirMin: 0 };
    var S = W.sicherheit || {};
    function einordnen(art, eintrag, freigabeMoeglich) {
      if (art === 'stopp' && k.arzt_freigabe && freigabeMoeglich !== false) { art = 'anpassen'; eintrag.folge = 'Ärztliche Freigabe liegt vor. ' + (eintrag.folge || ''); }
      if (art === 'stopp' && freigabeMoeglich === false) eintrag.ohne_freigabe = true;
      (res[art] || res.hinweis).push(eintrag);
    }
    arr(S.screening).forEach(function (f) {
      if (!frageAktiv(k, f) || !ja(k, f.id)) return;
      einordnen(f.bei_ja || 'hinweis', { id: f.id, frage: f.frage, folge: f.folge }, f.freigabe_moeglich);
      if (f.zielgruppe) res.zielgruppen.push(f.zielgruppe);
      if (f.beschwerde) res.beschwerden.push(f.beschwerde);
      if (f.zusatz) res.zusatz.push(f.zusatz);
    });
    arr(S.screening_regeln).forEach(function (r) {
      var bd = r.bedingung || {};
      if (bd.ja_eine_von_bei_ja || bd.arzt_freigabe != null) return;   // schon über die Einzelfragen abgedeckt
      if (!Object.keys(bd).length || !bedingungErfuellt(k, bd)) return;
      einordnen(r.ergebnis || 'hinweis', { id: r.id, frage: r.text, folge: '' }, r.freigabe_moeglich);
      if (r.regeln && r.regeln.rir_min != null) res.rirMin = Math.max(res.rirMin, r.regeln.rir_min);
    });
    // Unter 18: ohne schriftliche Einwilligung der Eltern kein Plan
    if (k.alter != null && k.alter < 18 && !k.eltern_einwilligung) {
      res.stopp.push({ id: 'eltern', frage: 'Unter 18: Die schriftliche Einwilligung der Eltern fehlt noch.', folge: 'Im Gesundheits-Check anhaken, sobald sie vorliegt.' });
    }
    // Analyse von der Seite „Analyse für dich“ (ohne Gesundheits-Check, seit 31.10.2026): kein Plan, bevor jede Frage des Checks
    // beantwortet ist (auch eine ärztliche Freigabe ersetzt das nicht)
    if (k.gesundheit_offen) {
      var offen = arr(S.screening).filter(function (f) { return frageAktiv(k, f) && (k.screening || {})[f.id] === undefined; }).length;
      if (offen) res.stopp.push({ id: 'gesundheit_offen', frage: 'Der Gesundheits-Check fehlt noch (' + offen + ' Fragen offen).', folge: 'Mit dem Kunden durchgehen (Schritt Gesundheits-Check) oder ihn per App ausfüllen lassen.' });
    }
    return res;
  }

  /* ---------- 2. Zielgruppen + Einschränkungen ---------- */
  var BESCHWERDE_GRUPPE = { knie: 'knieprobleme', schulter: 'schulterprobleme', ruecken: 'rueckenschmerzen_unspezifisch' };
  function ermittleZielgruppen(W, k, extra) {
    var b = bmi(k);
    var ids = {};
    arr(W.zielgruppen && W.zielgruppen.zielgruppen).forEach(function (z) {
      var e = z.erkennung || {};
      if (e.manuell) return;
      var ok = false;
      if (e.alter_max != null || e.alter_min != null) {
        ok = k.alter != null && (e.alter_max == null || k.alter <= e.alter_max) && (e.alter_min == null || k.alter >= e.alter_min);
      }
      if (e.bmi_min != null) ok = b != null && b >= e.bmi_min && (e.alter_min == null || k.alter >= e.alter_min);
      if (ok) ids[z.id] = true;
    });
    arr(k.zielgruppen).concat(arr(extra)).forEach(function (id) { ids[id] = true; });
    arr(k.beschwerden).forEach(function (bid) { if (BESCHWERDE_GRUPPE[bid]) ids[BESCHWERDE_GRUPPE[bid]] = true; });
    return arr(W.zielgruppen && W.zielgruppen.zielgruppen).filter(function (z) { return ids[z.id]; });
  }

  /* ---------- Wiedereinstieg nach OP oder Verletzung (seit 09.11.2026, Wissensbasis wiedereinstieg.json) ----------
     Kein Reha-Programm: Ohne schriftliche Freigabe gibt es keinen Plan. Was die Stelle darf, sagen Arzt oder Physio; die Stufe stellt Devin danach ein. */
  function wiedereinstiegDaten(W, k) {
    var d = W.wiedereinstieg;
    if (!d || !k || !k.we_aktiv) return null;
    return { d: d, stufe: arr(d.stufen).filter(function (s) { return s.id === k.we_stufe; })[0] || null,
      regionen: arr(k.we_regionen).map(function (id) { return arr(d.regionen).filter(function (r) { return r.id === id; })[0]; }).filter(Boolean) };
  }
  function wiedereinstiegStopp(W, k) {
    var we = wiedereinstiegDaten(W, k);
    if (!we) return null;
    if (!k.arzt_freigabe) return { id: 'wiedereinstieg_freigabe', frage: 'Wiedereinstieg nach OP oder Verletzung: Die schriftliche Freigabe von Arzt oder Physio fehlt.', folge: 'Liegt sie vor, im Plan-Schritt anhaken und die Vorgaben eintragen.' };
    if (!we.regionen.length || !we.stufe) return { id: 'wiedereinstieg_angaben', frage: 'Wiedereinstieg: Betroffene Stelle oder Stufe fehlt.', folge: 'Beides im Plan-Schritt auswählen, so wie es in der Freigabe steht.' };
    return null;
  }
  // Tage aus allem, was noch erlaubt ist. Nicht mehr als technik.max_tage.
  function wiedereinstiegSplit(W, k, ctx, warnungen) {
    var t = W.wiedereinstieg.technik || {}, tage = Math.min(k.tage, t.max_tage || 3);
    if (tage < k.tage) warnungen.push('Wiedereinstieg: höchstens ' + tage + ' Krafttage pro Woche.');
    if (k.split_wunsch) warnungen.push('Wiedereinstieg: Die Aufteilung rechnet DK Coach aus dem, was erlaubt ist.');
    var frei = bausteinGruppen(W).filter(function (g) {
      if (arr(t.auto_ohne).indexOf(g.id) >= 0) return false;
      return arr(g.slots).some(function (s) {
        return W.uebungen.some(function (ex) { return ex.muster === s.muster && (!s.muskel || arr(ex.muskel_primaer).indexOf(s.muskel) >= 0) && uebungErlaubt(ex, ctx).length === 0; });
      });
    });
    if (frei.length < (t.min_gruppen || 3)) return null;
    var aufbau = [], namen = [], grosse = frei.filter(function (g) { return g.gross; }), kleine = frei.filter(function (g) { return !g.gross; });
    for (var i = 0; i < tage; i++) {
      var dreh = function (l) { var n = l.length ? i % l.length : 0; return l.slice(n).concat(l.slice(0, n)); };
      aufbau.push([bausteinTyp(dreh(grosse).concat(dreh(kleine)).map(function (g) { return g.id; }))]);
      namen.push('Training ' + 'ABC'.charAt(i));
    }
    return { id: 'wiedereinstieg', eigen: true, we: true, name: 'Wiedereinstieg: ' + ctx.grenzen.we.stufe.name, beschreibung: 'Plan nach schriftlicher Freigabe, ohne Belastung der betroffenen Stelle, soweit vorgegeben.', tage_aufbau: aufbau, namen: namen };
  }
  function einschraenkungen(W, k, gruppen, scr) {
    scr = scr || { beschwerden: [], zusatz: [], rirMin: 0 };
    var lim = {}; GELENKE.forEach(function (g) { lim[g] = 2; });
    var meiden = {}, anpassen = {}, hinweise = [], arzt = [];
    var faktor = 1, rirMin = 0, levelMax = 5, wdh = null, pflichtFreigabe = [];

    function gelenke(obj) {
      Object.keys(obj || {}).forEach(function (g) { if (g in lim) lim[g] = Math.min(lim[g], parseMax(obj[g])); });
    }
    function zusatzAnwenden(d) {
      gelenke(d.gelenke);
      arr(d.muster_meiden).forEach(function (m) { meiden[m] = d.name; });
      arr(d.muster_anpassen).forEach(function (m) { anpassen[m] = d.name; });
      hinweise = hinweise.concat(arr(d.hinweise));
      if (d.rir_min != null) rirMin = Math.max(rirMin, d.rir_min);
      if (d.arzt) arzt.push(d.name + ': ' + d.arzt);
    }
    arr(scr.zusatz).forEach(function (zid) {
      var d = arr(W.sicherheit && W.sicherheit.beschwerden_zusatz).filter(function (x) { return x.id === zid; })[0];
      if (d) zusatzAnwenden(d);
    });
    rirMin = Math.max(rirMin, scr.rirMin || 0);
    arr(k.beschwerden).concat(arr(scr.beschwerden)).filter(function (x, i, l) { return l.indexOf(x) === i; }).forEach(function (bid) {
      if (bid === 'keine') return;
      var d = arr(W.sicherheit && W.sicherheit.beschwerden).filter(function (x) { return x.id === bid; })[0];
      if (d) {
        gelenke(d.gelenke);
        arr(d.muster_meiden).forEach(function (m) { meiden[m] = d.name; });
        arr(d.muster_anpassen).forEach(function (m) { anpassen[m] = d.name; });
        hinweise = hinweise.concat(arr(d.hinweise));
        if (d.arzt) arzt.push(d.name + ': ' + d.arzt);
      } else if (BESCHWERDE_GELENK[bid]) {
        lim[BESCHWERDE_GELENK[bid]] = Math.min(lim[BESCHWERDE_GELENK[bid]], 1);
      }
    });
    gruppen.forEach(function (z) {
      if (z.volumen_faktor) faktor = Math.min(faktor, z.volumen_faktor);
      if (z.rir_min != null) rirMin = Math.max(rirMin, z.rir_min);
      if (z.level_max != null) levelMax = Math.min(levelMax, z.level_max);
      if (z.wdh) wdh = wdh ? [Math.max(wdh[0], z.wdh[0]), Math.min(wdh[1], z.wdh[1])] : z.wdh.slice();
      if (wdh && wdh[0] > wdh[1]) wdh = [wdh[1], wdh[1]];
      gelenke(z.gelenke);
      arr(z.muster_meiden).forEach(function (m) { meiden[m] = z.name; });
      hinweise = hinweise.concat(arr(z.plan_hinweise));
      if (z.arzt_freigabe === 'pflicht' && !k.arzt_freigabe) pflichtFreigabe.push(z.name);
    });
    var we = wiedereinstiegDaten(W, k), weGrenze = null;
    if (we && we.stufe && we.regionen.length) {
      var s = we.stufe;
      weGrenze = { stufe: s, regionen: we.regionen, muskeln: {}, posVerboten: arr(s.pos_verboten), nurStabil: !!s.nur_stabil, beineMax: 2, armeMax: 2, griffMax: 2,
        rumpfNurMaschine: !!s.muskeln_sperren && we.regionen.some(function (r) { return r.rumpf_nur_maschine; }) };
      we.regionen.forEach(function (r) {
        arr(r.gelenke).forEach(function (g) { if (g in lim && s.gelenk_max != null) lim[g] = Math.min(lim[g], s.gelenk_max); });
        if (s.muskeln_sperren) {
          arr(r.muskeln_gesperrt).forEach(function (m) { weGrenze.muskeln[m] = r.name; });
          arr(r.muster_gesperrt).forEach(function (m) { meiden[m] = r.name; });
        }
        if (r.teil === 'bein' && s.beine_tragen_max != null) weGrenze.beineMax = Math.min(weGrenze.beineMax, s.beine_tragen_max);
        if (r.teil === 'arm') {
          if (s.arme_stuetzen_max != null) weGrenze.armeMax = Math.min(weGrenze.armeMax, s.arme_stuetzen_max);
          var gm = r.griff_max != null && s.muskeln_sperren ? r.griff_max : s.griff_max;
          if (gm != null) weGrenze.griffMax = Math.min(weGrenze.griffMax, gm);
        }
        if (s.id === 'leicht') arr(r.muster_gesperrt_leicht).forEach(function (m) { meiden[m] = r.name; });
        // „Stufe ruht: …“ nur bei dieser Stufe, ohne das Etikett
        hinweise = hinweise.concat(arr(r.hinweise).filter(function (t) { return !/^Stufe /.test(t) || t.toLowerCase().indexOf('stufe ' + s.id) === 0; })
          .map(function (t) { return t.replace(/^Stufe [^:]+:\s*/, ''); }));
      });
      hinweise = arr(s.hinweise).concat(hinweise);
      if (s.volumen_faktor) faktor = Math.min(faktor, s.volumen_faktor);
      if (s.rir_min != null) rirMin = Math.max(rirMin, s.rir_min);
      if (s.level_max != null) levelMax = Math.min(levelMax, s.level_max);
      if (s.wdh) { wdh = wdh ? [Math.max(wdh[0], s.wdh[0]), Math.min(wdh[1], s.wdh[1])] : s.wdh.slice(); if (wdh[0] > wdh[1]) wdh = [wdh[1], wdh[1]]; }
    }
    return { pflichtFreigabe: pflichtFreigabe, gelenkLimit: lim, musterMeiden: meiden, musterAnpassen: anpassen, hinweise: hinweise, arzt: arzt,
      volumenFaktor: faktor, rirMin: rirMin, levelMax: levelMax, wdh: wdh, we: weGrenze };
  }

  /* ---------- 3. Übungsauswahl ---------- */
  function verfuegbareAusruestung(k) {
    var set = { koerpergewicht: true };
    if (k.ort === 'gym' || k.ort === 'beides') GYM_AUSRUESTUNG.forEach(function (a) { set[a] = true; });
    arr(k.ausruestung).forEach(function (a) { set[a] = true; });
    return set;
  }

  // „Nur Maschinen“ (Kunde.geraete = 'maschinen', gilt im Gym): Maschine, Kabelzug, Multipresse, Bank als Zubehör.
  // Rumpfübungen ohne Gerät bleiben erlaubt, dafür gibt es kaum Maschinen.
  var MASCHINE = ['maschine', 'kabel', 'smith'];
  function nurMaschinen(k) { return k.geraete === 'maschinen' && (k.ort === 'gym' || k.ort === 'beides'); }
  function maschinenUebung(ex) {
    var a = arr(ex.ausruestung);
    function an(x) { return MASCHINE.indexOf(x) >= 0; }
    if (a.some(an) && a.every(function (x) { return an(x) || x === 'bank'; })) return true;
    return /^rumpf/.test(ex.muster) && a.every(function (x) { return an(x) || x === 'koerpergewicht' || x === 'bank'; });
  }

  function uebungErlaubt(ex, ctx) {
    var gruende = [];
    if (ex.level_min > ctx.level) gruende.push('Level');
    if (!arr(ex.ausruestung).every(function (a) { return ctx.ausruestung[a]; })) gruende.push('Ausrüstung');
    if (nurMaschinen(ctx.kunde) && !maschinenUebung(ex)) gruende.push('Nur Maschinen');
    var ort = ctx.kunde.ort === 'beides' ? ['zuhause', 'gym'] : [ctx.kunde.ort];
    if (ex.ort && !ort.some(function (o) { return arr(ex.ort).indexOf(o) >= 0; })) gruende.push('Ort');
    GELENKE.forEach(function (g) {
      var bel = (ex.gelenkbelastung || {})[g] || 0;
      if (bel > ctx.grenzen.gelenkLimit[g]) gruende.push('Gelenk ' + g);
    });
    if (ctx.grenzen.musterMeiden[ex.muster]) gruende.push('Muster gesperrt');
    if (ctx.ausschluss[ex.id]) gruende.push('Kunde mag sie nicht');
    if (ctx.level <= 1 && ex.technik_anspruch >= 3) gruende.push('Technik zu schwer');
    var we = ctx.grenzen.we;
    if (we) {
      var pos = ex.position;
      if (!pos) gruende.push('Wiedereinstieg: Körperposition unbekannt');
      else {
        if (we.posVerboten.indexOf(pos.pos) >= 0) gruende.push('Wiedereinstieg: Position');
        if (pos.beine_tragen > we.beineMax) gruende.push('Wiedereinstieg: Beine');
        if (pos.arme_stuetzen > we.armeMax) gruende.push('Wiedereinstieg: Arme');
        if (pos.griff > we.griffMax) gruende.push('Wiedereinstieg: Griff');
        if (we.nurStabil && pos.pos !== 'sitzend' && pos.pos !== 'liegend') gruende.push('Wiedereinstieg: nicht stabil');
      }
      if (arr(ex.muskel_primaer).concat(arr(ex.muskel_sekundaer)).some(function (m) { return we.muskeln[m]; })) gruende.push('Wiedereinstieg: Stelle ruht');
      if (ex.technik_anspruch >= 3) gruende.push('Wiedereinstieg: Technik zu schwer');
      if (we.rumpfNurMaschine && /^rumpf/.test(ex.muster) && arr(ex.ausruestung).indexOf('maschine') < 0) gruende.push('Wiedereinstieg: Rumpf nur an der Maschine');
    }
    return gruende;
  }

  var LAST = ['langhantel', 'kurzhantel', 'maschine', 'kabel', 'smith', 'sz_stange', 'kettlebell'];
  // Bewertung: passt die Übung zu Level, Ort, Ziel und Beschwerden? Höher = besser.
  function punkte(ex, ctx, slot) {
    var p = 0, aus = arr(ex.ausruestung), lvl = ctx.level;
    var gym = ctx.kunde.ort === 'gym' || ctx.kunde.ort === 'beides';
    // Rolle im Ablauf: vorne Grundübungen, hinten Ergänzungen
    if (slot.rolle && ex.rolle === slot.rolle) p += 3;
    if (slot.index < 2 && ex.rolle === 'grund') p += 3;
    if (slot.index >= 3 && ex.rolle === 'isolation') p += 1;
    // Level: nicht zu leicht (Regression nur, wenn nötig), Technik nicht über dem Können
    var zuLeicht = (lvl - 2) - (ex.level_min || 1);
    if (zuLeicht > 0) p -= zuLeicht * 2.5;
    if (lvl <= 2 && (ex.technik_anspruch || 1) >= 3) p -= 3;
    // Belastbarkeit: Zusatzgewicht lässt sich fein steigern
    var mitLast = aus.some(function (x) { return LAST.indexOf(x) >= 0; });
    if (gym) {
      if (mitLast) p += 2;
      if (aus.indexOf('band') >= 0) p -= 3;
      if (!mitLast && aus.every(function (x) { return x === 'koerpergewicht' || x === 'bank' || x === 'box'; }) && !/^rumpf/.test(ex.muster)) p -= 2;
      if (lvl <= 2 && aus.indexOf('maschine') >= 0) p += 1;
    } else if (mitLast) p += 1.5;
    // Wiederholungsbereich muss zum Ziel passen (Kraft braucht schwere Übungen)
    if (ctx.zielWdh && ex.wdh_bereich && ex.einheit !== 'sek') {
      var lo = Math.max(ctx.zielWdh[0], ex.wdh_bereich[0]), hi = Math.min(ctx.zielWdh[1], ex.wdh_bereich[1]);
      if (lo > hi) p -= 4;
      else p += Math.min(2, (hi - lo + 1) / 3);
    }
    // Ergänzungen dorthin, wo noch wenig Volumen ist
    if (ctx.abdeckung && ex.rolle !== 'grund') {
      var min = Math.min.apply(null, arr(ex.muskel_primaer).map(function (m) { return ctx.abdeckung[m] || 0; }).concat([99]));
      p += 3 / (1 + min);
    }
    // Abwechslung zwischen A/B-Tagen, Wünsche
    p -= (ctx.benutzt[ex.id] || 0) * 4;
    if (ctx.liebling[ex.id]) p += 5;
    // Bewährte Standardübungen (planarten.json → regeln.klassiker): Rang in der Liste. Nicht bei Beschwerden, dort geht schonend vor.
    if (ctx.grenzen.we) {
      if (aus.indexOf('maschine') >= 0) p += 4;
      if (ex.position && (ex.position.pos === 'sitzend' || ex.position.pos === 'liegend')) p += 3;
      if (ex.rolle === 'isolation') p += 2;
      if (aus.indexOf('langhantel') >= 0) p -= 4;
      p -= (ex.technik_anspruch || 1) * 1.5;
    } else if (ctx.klassiker && !Object.keys(ctx.grenzen.musterAnpassen).length) {
      var kl = ctx.klassiker[slot.muster + '|' + (slot.muskel || '') + '|' + (slot.rolle || '')] || ctx.klassiker[slot.muster + '|' + (slot.muskel || '')] || ctx.klassiker[slot.muster];
      var rang = kl ? kl.indexOf(ex.id) : -1;
      if (rang >= 0) p += Math.max(1, 6 - rang * 0.6);
    }
    // Gelenke schonen, stärker bei Beschwerden
    var bel = 0; GELENKE.forEach(function (g) { bel += (ex.gelenkbelastung || {})[g] || 0; });
    p -= bel * (Object.keys(ctx.grenzen.musterAnpassen).length ? 0.6 : 0.25);
    if (ctx.grenzen.musterAnpassen[ex.muster]) p -= bel;
    return p;
  }

  // Wenn für ein Bewegungsmuster nichts Sicheres verfügbar ist: nächstverwandtes Muster
  var MUSTER_ERSATZ = {
    vertikal_ziehen: ['horizontal_ziehen'], horizontal_ziehen: ['vertikal_ziehen'],
    vertikal_druecken: ['isolation_schulter', 'horizontal_druecken'], horizontal_druecken: ['vertikal_druecken'],
    kniedominant: ['ausfallschritt'], ausfallschritt: ['kniedominant'],
    hueftdominant: ['isolation_beine'], isolation_beine: ['hueftdominant'],
    rumpf_anti_extension: ['rumpf_anti_rotation'], rumpf_anti_rotation: ['rumpf_anti_extension'], rumpf_flexion: ['rumpf_anti_extension']
  };

  function waehleUebung(W, ctx, slot, imTag) {
    var kand = W.uebungen.filter(function (ex) {
      if (imTag && imTag[ex.id]) return false;
      if (slot.muster && ex.muster !== slot.muster) return false;
      if (slot.muskel && arr(ex.muskel_primaer).indexOf(slot.muskel) < 0) return false;
      return uebungErlaubt(ex, ctx).length === 0;
    });
    if (!kand.length) return null;
    kand.sort(function (a, b) { return punkte(b, ctx, slot) - punkte(a, ctx, slot); });
    return kand[0];
  }

  // Schwerpunkt aus Beruf oder Sport (seit 01.11.2026, Wissensbasis regeln.schwerpunkte, Feld k.schwerpunkt setzt Devin):
  // jeder passende Krafttag bekommt eine Zusatzübung aus der Liste. Gewählt wird nur, was uebungErlaubt durchlässt (Level, Beschwerden,
  // Gesundheits-Check, Ausrüstung); Muster mit Anpassung zuletzt, sonst die am wenigsten genutzte (Abwechslung zwischen den Tagen).
  // nicht_bei (z. B. keine Sprünge bei Knie, Beckenboden, Schwangerschaft): dann gilt die Ersatzliste sonst.
  function schwerpunkteFuer(W, k, gruppen, scr) {
    var L = arr(W.regeln.schwerpunkte && W.regeln.schwerpunkte.liste);
    var zg = gruppen.map(function (z) { return z.id; }), zus = arr(scr.zusatz), bes = arr(k.beschwerden).concat(arr(scr.beschwerden));
    var trifft = function (liste, hat) { return arr(liste).some(function (x) { return hat.indexOf(x) >= 0; }); };
    return uniq(arr(k.schwerpunkt)).map(function (id) { return L.filter(function (s) { return s.id === id; })[0]; }).filter(Boolean).map(function (s) {
      var nb = s.nicht_bei || {};
      return { def: s, uebungen: [], fehlt: 0, haupt: 0, ersatz: false,
        gesperrt: trifft(nb.beschwerden, bes) ? 'Beschwerden' : trifft(nb.zusatz, zus) ? 'Gesundheits-Check' : trifft(nb.zielgruppen, zg) ? 'Zielgruppe' : '' };
    });
  }
  function schwerpunktWahl(W, ctx, teil, tag, imTag) {
    var muster = tag.uebungen.map(function (u) { return W.index[u.id].muster; });
    var kand = arr(teil.uebungen).map(function (id, i) { return { ex: W.index[id], i: i }; }).filter(function (x) {
      return x.ex && !imTag[x.ex.id] && !(teil.muster_neu && muster.indexOf(x.ex.muster) >= 0) && uebungErlaubt(x.ex, ctx).length === 0;
    });
    var rang = function (x) { return (ctx.grenzen.musterAnpassen[x.ex.muster] ? 1000 : 0) + (ctx.benutzt[x.ex.id] || 0) * 10 + x.i * 0.01; };
    kand.sort(function (a, b) { return rang(a) - rang(b); });
    return kand.length ? kand[0].ex : null;
  }
  function schwerpunktEinbauen(W, ctx, tag, sp, imTag) {
    sp.forEach(function (x) {
      var s = x.def, teil = s;
      if (!arr(s.tage).some(function (p) { return tag.typ.indexOf(p) === 0 || arr(tag.def.familien).indexOf(p) >= 0; })) return;
      var ex = x.gesperrt ? null : schwerpunktWahl(W, ctx, s, tag, imTag);
      if (!ex && s.sonst) { teil = s.sonst; ex = schwerpunktWahl(W, ctx, teil, tag, imTag); }
      if (!ex) { x.fehlt++; return; }
      if (teil !== s) x.ersatz = true; else x.haupt++;
      var vorne = (teil.wo || s.wo) === 'anfang';
      var u = { id: ex.id, slot: { muster: ex.muster, index: vorne ? -1 : 99, schwerpunkt: s.id,
        saetze: teil.saetze || s.saetze, wdh: teil.wdh || null, pause: teil.pause || null, rir: teil.rir || null } };
      if (vorne) tag.uebungen.unshift(u); else tag.uebungen.push(u);
      ctx.benutzt[ex.id] = (ctx.benutzt[ex.id] || 0) + 1;
      arr(ex.muskel_primaer).forEach(function (m) { ctx.abdeckung[m] = (ctx.abdeckung[m] || 0) + 1; });
      imTag[ex.id] = true;
      x.uebungen.push(ex.name);
    });
  }
  // Extra-Muskeln (Feld extra_muskeln): je Gruppe bis zu extra.tage_max Tage, zuerst Tage ohne diese Gruppe, möglichst weit auseinander
  function extraVerteilen(W, k, tage) {
    var ex = W.regeln.extra_muskeln || {}, alle = bausteinGruppen(W), proTyp = {};
    var max = (ex.tage_max && ex.tage_max[String(k.level)]) || 1;
    arr(k.extra_muskeln).forEach(function (id) {
      var g = alle.filter(function (x) { return x.id === id; })[0];
      if (!g) return;
      var kraft = tage.filter(function (t) { return t.typ !== LEICHTER_TAG; });
      var hatGruppe = function (t) { return arr(t.def.muskeln_fokus).some(function (m) { return arr(g.muskeln).indexOf(m) >= 0; }); };
      var kand = kraft.filter(function (t) { return !hatGruppe(t); });
      if (!kand.length) kand = kraft;
      var typen = [], gewaehlt = [];
      kand.forEach(function (t) { if (typen.indexOf(t.typ) < 0) typen.push(t.typ); });
      typen.forEach(function (typ) {
        if (gewaehlt.length >= max) return;
        var nr = tage.filter(function (t) { return t.typ === typ; })[0].nr;
        if (gewaehlt.some(function (x) { return Math.abs(x.nr - nr) < 2; }) && typen.length > max) return;
        gewaehlt.push({ typ: typ, nr: nr });
      });
      gewaehlt.forEach(function (x) { (proTyp[x.typ] = proTyp[x.typ] || []).push(g); });
    });
    return proTyp;
  }
  function extraEinbauen(W, ctx, tag, gruppen, imTag, warnungen) {
    var ex = W.regeln.extra_muskeln || {};
    gruppen.forEach(function (g) {
      var wahl = null;
      arr(g.slots).some(function (s) { wahl = waehleUebung(W, ctx, Object.assign({}, s, { index: 60 }), imTag); return !!wahl; });
      if (!wahl) { warnungen.push('Extra ' + g.name + ': keine passende Übung (Level, Beschwerden oder Ausrüstung).'); return; }
      tag.uebungen.push({ id: wahl.id, slot: { muster: wahl.muster, index: 98, schwerpunkt: 'extra_' + g.id, extra: g.name, saetze: arr(ex.saetze).length ? ex.saetze : [2, 3] } });
      ctx.benutzt[wahl.id] = (ctx.benutzt[wahl.id] || 0) + 1;
      arr(wahl.muskel_primaer).forEach(function (m) { ctx.abdeckung[m] = (ctx.abdeckung[m] || 0) + 1; });
      imTag[wahl.id] = true;
    });
  }
  // Wiedereinstieg: kein Muskel über der Wochengrenze des Levels (primäre Sätze); erst Ergänzungen aus dem vollsten Tag, jeder Tag behält mindestens 3 Übungen
  function wochenGrenzeWiedereinstieg(W, tage, vol) {
    var hoch = vol.bereich[1], schutz = 0;
    var primaer = function () { var s = {}; tage.forEach(function (t) { t.uebungen.forEach(function (u) { arr(W.index[u.id].muskel_primaer).forEach(function (m) { s[m] = (s[m] || 0) + u.saetze; }); }); }); return s; };
    while (schutz++ < 40) {
      var ist = primaer(), m = Object.keys(ist).filter(function (x) { return ist[x] > hoch; })[0];
      if (!m) return;
      var kand = [];
      tage.forEach(function (t) { if (t.uebungen.length > 3) t.uebungen.forEach(function (u) { if (arr(W.index[u.id].muskel_primaer).indexOf(m) >= 0) kand.push({ t: t, u: u }); }); });
      if (!kand.length) return;
      kand.sort(function (a, b) { return (b.t.uebungen.length - a.t.uebungen.length) || ((W.index[a.u.id].rolle === 'grund' ? 1 : 0) - (W.index[b.u.id].rolle === 'grund' ? 1 : 0)); });
      kand[0].t.uebungen.splice(kand[0].t.uebungen.indexOf(kand[0].u), 1);
    }
  }
  // Extra-Muskeln dürfen die Wochengrenze des Levels nicht sprengen: sonst fällt die letzte Extra-Übung weg
  function extraBegrenzen(W, tage, vol, warnungen) {
    var hoch = vol.bereich[1], schutz = 0;
    while (schutz++ < 20) {
      var ist = volumenIst(W, tage), treffer = null;
      for (var i = tage.length - 1; i >= 0 && !treffer; i--) {
        tage[i].uebungen.forEach(function (u) {
          if (u.slot.extra && arr(W.index[u.id].muskel_primaer).some(function (m) { return ist[m] > hoch; })) treffer = { tag: tage[i], u: u };
        });
      }
      if (!treffer) return;
      treffer.tag.uebungen.splice(treffer.tag.uebungen.indexOf(treffer.u), 1);
      warnungen.push('Extra ' + treffer.u.slot.extra + ': an einem Tag weggelassen, sonst zu viele Sätze pro Woche (höchstens ' + hoch + ').');
    }
  }
  // Bausteintage: höchstens so viele Sätze je Muskel und Einheit wie volumen_regeln erlaubt (die Sätze der größten Übung zuerst kürzen, nie unter 2)
  function saetzeProEinheitBegrenzen(W, k, tag) {
    var c = W.regeln.volumen_regeln && W.regeln.volumen_regeln.max_saetze_pro_muskel_pro_einheit;
    var cap = c && c[String(k.level)];
    if (!(cap > 0)) return;
    var schutz = 0, muskelVon = function (u) { return arr(W.index[u.id].muskel_primaer); };
    while (schutz++ < 60) {
      var summe = {};
      tag.uebungen.forEach(function (u) { muskelVon(u).forEach(function (m) { summe[m] = (summe[m] || 0) + u.saetze; }); });
      var zuViel = Object.keys(summe).filter(function (m) { return summe[m] > cap; })[0];
      if (!zuViel) return;
      var kand = tag.uebungen.filter(function (u) { return muskelVon(u).indexOf(zuViel) >= 0 && u.saetze > 2; }).sort(function (a, b) { return b.saetze - a.saetze; })[0];
      if (!kand) return;
      kand.saetze--;
    }
  }
  function letzteOhneSchwerpunkt(liste) {   // beim Kürzen bleibt der Schwerpunkt bis zuletzt
    for (var i = liste.length - 1; i >= 0; i--) if (!liste[i].slot.schwerpunkt) return liste.splice(i, 1)[0];
    return liste.pop();
  }

  // Ersatz: zuerst gleiches Bewegungsmuster und gleicher Hauptmuskel, dann verwandtes Muster
  function alternativen(W, ctx, ex) {
    var prim = arr(ex.muskel_primaer)[0];
    var verwandt = MUSTER_ERSATZ[ex.muster] || [];
    function rang(e) {
      var r = 0;
      if (e.muster === ex.muster) r += 10;
      else if (verwandt.indexOf(e.muster) >= 0) r += 4;
      if (arr(e.muskel_primaer).indexOf(prim) >= 0) r += 5;
      if (arr(ex.ersatz).indexOf(e.id) >= 0 || ex.regression === e.id || ex.progression === e.id) r += 3;
      return r;
    }
    var slot = { index: ex.rolle === 'grund' ? 0 : 4 };
    return W.uebungen.filter(function (e) {
      return e.id !== ex.id && (e.muster === ex.muster || verwandt.indexOf(e.muster) >= 0) && uebungErlaubt(e, ctx).length === 0;
    }).sort(function (x, y) { return (rang(y) + punkte(y, ctx, slot)) - (rang(x) + punkte(x, ctx, slot)); });
  }

  /* ---------- 4. Belastung ---------- */
  function zielWdh(W, k, grenzen) {
    var R = W.regeln && W.regeln.intensitaet && (W.regeln.intensitaet[k.ziel] || W.regeln.intensitaet.fitness_allgemein);
    return grenzen.wdh || (R && ((R.wdh_nach_level && R.wdh_nach_level[String(k.level)]) || R.wdh)) || null;
  }
  function intensitaet(W, k, grenzen, ex) {
    var R = W.regeln.intensitaet[k.ziel] || W.regeln.intensitaet.fitness_allgemein;
    if (!R) throw new Error('Wissensbasis: keine Intensitätsregeln für Ziel ' + k.ziel);
    var lvl = String(k.level);
    var basis = ex.rolle === 'grund' || !R.wdh_isolation ? ((R.wdh_nach_level && R.wdh_nach_level[lvl]) || R.wdh) : R.wdh_isolation;
    var wdh = (grenzen.wdh || basis).slice();
    var exb = ex.wdh_bereich || wdh;
    var lo = Math.max(wdh[0], exb[0]), hi = Math.min(wdh[1], exb[1]);
    if (lo > hi) { lo = exb[0]; hi = exb[1]; }
    var rir = (R.rir && (R.rir[lvl] || R.rir[k.level])) || [2, 3];
    rir = [Math.max(rir[0], grenzen.rirMin), Math.max(rir[1], grenzen.rirMin)];
    var pause = (R.pause_sek && (R.pause_sek[ex.rolle === 'grund' ? 'grund' : 'isolation'])) || [60, 120];
    return { wdh: [lo, hi], einheit: ex.einheit || 'wdh', rir: rir, pause: pause };
  }

  function wochenVolumen(W, k, grenzen) {
    var v = W.regeln.volumen_saetze_pro_muskel_woche[String(k.level)];
    if (!v) throw new Error('Wissensbasis: kein Wochenvolumen für Level ' + k.level);
    var f = (W.regeln.volumen_faktor_ziel || {})[k.ziel] || 1;
    var ziel = mitte([v.min, v.max]) * f * grenzen.volumenFaktor;
    return { ziel: Math.round(ziel), bereich: [v.min, v.max], faktorZiel: f, faktorGruppe: grenzen.volumenFaktor };
  }

  /* ---------- 5. Split ---------- */
  function waehleSplit(W, k, warnungen) {
    var s = arr(W.regeln.splits).filter(function (x) { return x.tage === k.tage && imLevel(x.level, k.level); });
    if (!s.length) s = arr(W.regeln.splits).filter(function (x) { return x.tage === k.tage; });
    if (!s.length) throw new Error('Wissensbasis: kein Split für ' + k.tage + ' Tage');
    if (k.split_wunsch === EIGEN) { var e = eigenerSplit(W, k, warnungen || []); if (e) return e; return s[0]; }
    if (k.split_wunsch) {
      var w = s.filter(function (x) { return x.id === k.split_wunsch; })[0];
      if (w) return w;
      var nichtLevel = arr(W.regeln.splits).filter(function (x) { return x.id === k.split_wunsch; })[0];
      if (nichtLevel && warnungen) warnungen.push('„' + nichtLevel.name + '“ passt nicht zu diesem Level oder dieser Tageszahl. Stattdessen: ' + s[0].name + '.');
    } else if (k.split_art && k.split_art !== 'egal') {   // Wunsch des Kunden aus der Analyse; Devins Auswahl (split_wunsch) geht vor
      var arten = W.regeln.split_wunsch_arten || {}, ids = arr(arten.splits && arten.splits[k.split_art]);
      var passt = s.filter(function (x) { return ids.indexOf(x.id) >= 0; })[0];
      if (passt) return passt;
      if (ids.length && warnungen) warnungen.push('Kunde wünscht „' + ((arten.namen || {})[k.split_art] || k.split_art) + '“, das passt nicht zu Level ' + k.level + ' und ' + k.tage + ' Tagen. Stattdessen: ' + s[0].name + '.');
    }
    return s[0];
  }

  /* ---------- Tage aus Muskelgruppen (seit 09.11.2026, Wissensbasis planarten.json → regeln.split_bausteine) ---------- */
  var EIGEN = 'eigen';
  function bausteinGruppen(W) { return arr(W.regeln.split_bausteine && W.regeln.split_bausteine.gruppen); }
  function bausteinTyp(gruppen) { return 'b:' + gruppen.join('+'); }
  function istBausteinTyp(typ) { return /^b:/.test(typ); }
  function gruppenAusTyp(W, typ) {
    var alle = bausteinGruppen(W);
    return typ.slice(2).split('+').map(function (id) { return alle.filter(function (g) { return g.id === id; })[0]; }).filter(Boolean);
  }
  // Tagestyp aus Bausteinen, Form wie regeln.tagestypen. Reihenfolge: große Gruppen vorn, je Gruppe ihre Plätze am Stück.
  function tagAusBausteinen(W, typ, minuten) {
    var R = W.regeln, gruppen = gruppenAusTyp(W, typ);
    var gross = gruppen.filter(function (g) { return g.gross; }), klein = gruppen.filter(function (g) { return !g.gross; });
    var sortiert = gross.concat(klein);
    var richt = (R.uebungen_pro_einheit && R.uebungen_pro_einheit.richtwert_nach_minuten) || {};
    var stufen = Object.keys(richt).map(Number).sort(function (a, b) { return a - b; });
    var ziel = (R.uebungen_pro_einheit && R.uebungen_pro_einheit.max) || 8;
    for (var i = 0; i < stufen.length; i++) if (minuten <= stufen[i]) { ziel = richt[stufen[i]]; break; }
    var anzahl = sortiert.map(function () { return 0; }), summe = 0, weiter = true;
    while (summe < ziel && weiter) {
      weiter = false;
      for (var j = 0; j < sortiert.length && summe < ziel; j++) {
        if (anzahl[j] < arr(sortiert[j].slots).length) { anzahl[j]++; summe++; weiter = true; }
      }
    }
    var reihe = [];
    sortiert.forEach(function (g, gi) { arr(g.slots).slice(0, anzahl[gi]).forEach(function (s) { reihe.push(Object.assign({}, s, { baustein: g.id })); }); });
    var zuerst = [];
    klein.slice().reverse().forEach(function (g) { arr(g.slots).forEach(function (s) { if (zuerst.indexOf(s.muster) < 0) zuerst.push(s.muster); }); });
    var fokus = [], familien = {};
    gruppen.forEach(function (g) {
      fokus = fokus.concat(arr(g.muskeln));
      if (g.art === 'ober') { familien.oberkoerper = true; }
      if (g.art === 'unter') { familien.unterkoerper = true; familien.beine = true; }
      if (g.art === 'rumpf') { familien.rumpf = true; }
    });
    return { name: gruppen.map(function (g) { return g.name; }).join(' + '), muster_reihenfolge: reihe, slot_muskel: [],
      streichen_zuerst: zuerst, muskeln_fokus: fokus, familien: Object.keys(familien) };
  }
  // Eigener Split: je Trainingstag eine Liste von Muskelgruppen (Feld split_eigen, Trainer-Seite)
  function eigenerSplit(W, k, warnungen) {
    var bekannt = {}; bausteinGruppen(W).forEach(function (g) { bekannt[g.id] = g; });
    var tage = arr(k.split_eigen).slice(0, k.tage).map(function (t) { return arr(t).filter(function (id, i, l) { return bekannt[id] && l.indexOf(id) === i; }); })
      .filter(function (t) { return t.length; });
    if (!tage.length) { warnungen.push('Eigener Split ist leer: Es gilt die normale Aufteilung.'); return null; }
    if (tage.length < k.tage) warnungen.push('Eigener Split: nur ' + tage.length + ' von ' + k.tage + ' Tagen sind belegt.');
    return { id: EIGEN, eigen: true, name: 'Eigener Split', beschreibung: tage.map(function (t, i) {
      return 'Tag ' + (i + 1) + ': ' + t.map(function (id) { return bekannt[id].name; }).join(' + '); }).join(' · '),
      tage_aufbau: tage.map(function (t) { return [bausteinTyp(t)]; }) };
  }
  function tagesDefinition(W, typ, minuten) {
    if (istBausteinTyp(typ)) return tagAusBausteinen(W, typ, minuten);
    return W.regeln.tagestypen[typ];
  }
  // Eigener Split: Hinweise für Devin (48 h Abstand, Einsteiger, Muskeln ohne Training)
  function splitPruefen(W, k, split, warnungen) {
    if (!split.eigen || split.we) return;
    var R = W.regeln, grossIds = {};
    bausteinGruppen(W).forEach(function (g) { if (g.gross) grossIds[g.id] = g.name; });
    var tage = split.tage_aufbau.map(function (t) { return istBausteinTyp(t[0]) ? t[0].slice(2).split('+') : []; });
    tage.forEach(function (t, i) {
      if (i === 0) return;
      var doppelt = t.filter(function (id) { return grossIds[id] && tage[i - 1].indexOf(id) >= 0; });
      if (doppelt.length) warnungen.push('Eigener Split: ' + doppelt.map(function (id) { return grossIds[id]; }).join(', ') + ' an Tag ' + i + ' und Tag ' + (i + 1) +
        '. Liegen die Tage direkt hintereinander, fehlt der Abstand von ' + ((R.split_regeln && R.split_regeln.mindestabstand_gleicher_muskel_h) || 48) + ' Stunden.');
    });
    if (k.level <= 1) warnungen.push('Eigener Split bei Level 1: Für Einsteiger sind 2 bis 3 Ganzkörper-Einheiten pro Woche empfohlen.');
    var einmal = Object.keys(grossIds).filter(function (id) { return tage.filter(function (t) { return t.indexOf(id) >= 0; }).length === 1; });
    if (einmal.length) warnungen.push('Eigener Split: ' + einmal.map(function (id) { return grossIds[id]; }).join(', ') + ' nur 1× pro Woche. Empfohlen sind 2×, damit sich die Sätze besser verteilen.');
  }

  // Mehr Tage als Krafttage fürs Level erlaubt (split_regeln.max_krafttage_pro_level):
  // die übrigen Tage werden leichte Rumpf-/Ausdauertage
  var LEICHTER_TAG = 'rumpf_ausdauer';
  function krafttage(aufbau) { return arr(aufbau).filter(function (t) { return t[0] !== LEICHTER_TAG; }); }
  function krafttageBegrenzen(W, k, split, warnungen, ag) {
    var R = W.regeln;
    var max = R.split_regeln && R.split_regeln.max_krafttage_pro_level && R.split_regeln.max_krafttage_pro_level[String(k.level)];
    var grund = 'Level ' + k.level;
    // Altersgrenze (z. B. unter 18) gilt, wenn sie strenger ist
    if (ag && ag.max_krafttage != null && (max == null || ag.max_krafttage < max)) { max = ag.max_krafttage; grund = ag.name; }
    var kraft = krafttage(split.tage_aufbau);
    if (!(max >= 1) || kraft.length <= max) return split;
    if (!R.tagestypen[LEICHTER_TAG]) throw new Error('Wissensbasis: Tagestyp ' + LEICHTER_TAG + ' fehlt');
    // Gerüst: reiner Kraft-Split mit genau max Tagen für dieses Level, sonst die ersten max Krafttage
    var basis = split.eigen ? null : arr(R.splits).filter(function (s) {
      return s.tage === max && imLevel(s.level, k.level) && krafttage(s.tage_aufbau).length === max;
    })[0];
    var kern = basis ? basis.tage_aufbau : kraft.slice(0, max);
    var leicht = split.tage_aufbau.length - max;
    // Leichte Tage gleichmäßig zwischen die Krafttage legen
    var nach = kern.map(function () { return 0; });
    for (var j = 0; j < leicht; j++) nach[Math.floor(j * max / leicht)]++;
    var aufbau = [];
    kern.forEach(function (t, i) {
      aufbau.push(t.slice());
      for (var n = 0; n < nach[i]; n++) aufbau.push([LEICHTER_TAG]);
    });
    warnungen.push(grund + ': höchstens ' + max + ' Krafttage pro Woche. ' +
      (leicht === 1 ? '1 Tag ist ein leichter Rumpf- und Ausdauertag.' : leicht + ' Tage sind leichte Rumpf- und Ausdauertage.'));
    var name = basis ? basis.name : kern.map(function (t) { return istBausteinTyp(t[0]) ? tagAusBausteinen(W, t[0], 60).name : (R.tagestypen[t[0]] || {}).name || typNameLesbar(t[0]); }).join(' / ');
    return { id: (basis || split).id + '_plus_' + leicht + '_leicht', eigen: split.eigen,
      name: name + ' + ' + (leicht === 1 ? 'Rumpf/Cardio-Tag' : leicht + ' Rumpf/Cardio-Tage'),
      beschreibung: max + ' Krafttage plus ' + leicht + ' leichte' + (leicht === 1 ? 'r Tag' : ' Tage') + ' (Grenze: ' + grund + ').',
      tage_aufbau: aufbau };
  }

  /* ---------- Sicherheit + Alter: Texte für den Plan ---------- */
  var ABBRUCH_TITEL = { schmerz_regel: 'Schmerz-Regel', nach_abbruch: 'Nach einem Abbruch' };
  function abbruchRegeln(W) {
    var a = (W.sicherheit && W.sicherheit.abbruch_regeln) || {};
    return Object.keys(a).filter(function (key) { return typeof a[key] === 'string' && a[key]; }).map(function (key) {
      var t = ABBRUCH_TITEL[key] || key.replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
      return { id: key, titel: t, text: a[key] };
    });
  }
  // alter_anpassung: Schlüssel unter_<Alter> (jünger als) und ab_<Alter> (so alt oder älter)
  function altersgruppe(key, alter) {
    var m = /^(unter|ab)_(\d+)$/.exec(key);
    if (!m || alter == null || alter === '' || isNaN(+alter)) return null;
    var grenze = +m[2];
    if (m[1] === 'unter' ? !(+alter < grenze) : !(+alter >= grenze)) return null;
    return m[1] + ' ' + grenze;
  }
  function alterHinweise(W, alter) {
    var A = (W.regeln && W.regeln.alter_anpassung) || {};
    return Object.keys(A).map(function (key) {
      var g = altersgruppe(key, alter);
      return g && arr(A[key]).length ? { id: key, titel: 'Training ' + g, hinweise: arr(A[key]) } : null;
    }).filter(Boolean);
  }
  // alter_anpassung.grenzen: feste Obergrenzen je Altersgruppe; mehrere passende → jeweils die strengste
  function alterGrenzen(W, alter) {
    var G = (W.regeln && W.regeln.alter_anpassung && W.regeln.alter_anpassung.grenzen) || {};
    var res = { name: '' };
    Object.keys(G).forEach(function (key) {
      var g = altersgruppe(key, alter);
      if (!g) return;
      ['max_krafttage', 'saetze_max'].forEach(function (f) {
        var v = G[key][f];
        if (typeof v === 'number' && (res[f] == null || v < res[f])) res[f] = v;
      });
      res.name = res.name || g.charAt(0).toUpperCase() + g.slice(1);
    });
    return res;
  }

  /* ---------- Ernährung: nur Grundregeln für Gesunde, alles aus rechner.json ---------- */
  // Formeln kommen als echte Funktionen (W.formeln = DK_FORMELN aus build.js), kein eval
  var ALLTAG_PAL = { sitzend: 'sitzend', gemischt: 'sitzend_etwas_bewegung', stehend_gehend: 'stehend_gehend', koerperlich_schwer: 'koerperlich_schwer' };
  // rechner.grenzen: Krankheiten/Zustände mit Ernährungsbezug, Essstörung, Schwangerschaft → keine Kalorien- oder Makrozahlen
  var ERN_FRAGEN_SPERRE = /^(essstoerung|periode_aus|schwanger|diabetes|herz|bluthochdruck|schwere_erkrankung)/;
  var ERN_GRUPPEN_SPERRE = ['schwangerschaft', 'nach_geburt', 'diabetes_typ2', 'bluthochdruck', 'osteoporose'];
  function runde(x, auf) { return Math.round(x / auf) * auf; }
  function altersWert(tabelle, alter) {   // Schlüssel wie "15-18" oder "65+"
    var key = Object.keys(tabelle || {}).filter(function (s) {
      var m = /^(\d+)(?:-(\d+)|\+)$/.exec(s);
      return m && alter >= +m[1] && (m[2] == null || alter <= +m[2]);
    })[0];
    return key ? tabelle[key] : null;
  }
  function sportZuschlag(liste, tage) {
    var mit = arr(liste).map(function (z) { var m = /(\d+)\s*-\s*(\d+)/.exec(z.bedingung || ''); return m ? { von: +m[1], bis: +m[2], z: z.zuschlag } : null; }).filter(Boolean);
    var passt = mit.filter(function (x) { return tage >= x.von && tage <= x.bis; })[0];
    if (passt) return passt.z;
    var darunter = mit.filter(function (x) { return x.bis < tage; }).sort(function (a, b) { return b.bis - a.bis; })[0];
    return darunter ? darunter.z : 0;
  }
  function ernaehrung(W, k, scr, gruppen) {
    var RC = W.rechner || {}, F = W.formeln || {}, M = RC.makros || {}, ZA = RC.ziel_anpassung || {};
    if (k.ernaehrung_tipps === false || k.ernaehrung_tipps === 'nein') return { status: 'aus', gruende: ['Kunde möchte keine Ernährungstipps.'], hinweise: [] };
    var res = { status: 'zahlen', kalorien: null, eiweiss: null, fett_min_g: null, trinken_ml: null, ballaststoffe_g: null, gruende: [], hinweise: [] };
    var g = k.geschlecht === 'maennlich' || k.geschlecht === 'weiblich' ? k.geschlecht : null;
    var erwachsen = k.alter != null && k.alter >= 18;
    var b = bmi(k);
    var kat = erwachsen && b ? arr(RC.bmi_kategorien).filter(function (c) { return b < c.bis; })[0] : null;
    var aktion = (kat && kat.aktion) || '';

    // Trinken (allgemeine Info, gilt immer)
    var tr = k.alter != null ? altersWert(M.getraenke_ml_tag_dge, k.alter) : null;
    if (tr) res.trinken_ml = tr;
    if (M.wasser_hinweis) res.hinweise.push(M.wasser_hinweis);

    // Sperren: dann keine Kalorien- und Makrozahlen
    Object.keys(k.screening || {}).forEach(function (id) { if (ERN_FRAGEN_SPERRE.test(id) && ja(k, id)) res.gruende.push('Gesundheits-Check: ' + id); });
    arr(gruppen).forEach(function (z) { if (ERN_GRUPPEN_SPERRE.indexOf(z.id) >= 0) res.gruende.push(z.name); });
    // strengere Regel gilt: rechner.grenzen sperrt schon unter BMI 17 („ärztlich abklären“)
    if (/keine Kalorien|Fachkraft|ärztlich abklären/.test(aktion)) res.gruende.push('BMI ' + fmt(b) + ' (' + kat.label + ')');
    if (k.alter != null && k.alter < 10) res.gruende.push('unter 10 Jahre');
    if (res.gruende.length) { res.status = 'allgemein'; return res; }

    // Kalorien
    var palStufe = arr(RC.pal_stufen).filter(function (s) { return s.id === ALLTAG_PAL[k.alltag_aktivitaet]; })[0];
    var fid = erwachsen ? 'mifflin_st_jeor' : 'schofield_10_17';
    var fehlt = [];
    if (!k.gewicht_kg) fehlt.push('Gewicht');
    if (erwachsen && !k.groesse_cm) fehlt.push('Größe');
    if (k.alter == null) fehlt.push('Alter');
    if (!g) fehlt.push('Geschlecht männlich/weiblich (Formel)');
    if (!palStufe) fehlt.push('Alltag (Job, Schule)');
    if (!F[fid] || !F.gesamtumsatz) fehlt.push('Formeln');
    if (!fehlt.length) {
      var gu = erwachsen ? F.mifflin_st_jeor(k.gewicht_kg, k.groesse_cm, k.alter, g) : F.schofield_10_17(k.gewicht_kg, g);
      var pal = Math.min(palStufe.wert + sportZuschlag(RC.pal_sport_zuschlag, k.tage), RC.pal_max || 2.4);
      var erh = F.gesamtumsatz(gu, pal), ziel = erh;
      var nurErhalt = !erwachsen || /kein Defizit/.test(aktion);
      if (k.ziel === 'fettabbau' && !nurErhalt && F.kalorien_fettabbau && k.alter >= ((ZA.fettabbau || {}).ab_alter || 18)) ziel = F.kalorien_fettabbau(gu, pal, k.alter, g);
      if (k.ziel === 'muskelaufbau' && erwachsen && F.kalorien_muskelaufbau && k.alter >= ((ZA.muskelaufbau || {}).ab_alter || 18)) ziel = F.kalorien_muskelaufbau(gu, pal, k.alter);
      res.kalorien = { grundumsatz: runde(gu, 10), erhaltung: runde(erh, 10), ziel: runde(ziel, 10), pal: Math.round(pal * 100) / 100,
        art: ziel < erh - 1 ? 'defizit' : ziel > erh + 1 ? 'plus' : 'erhaltung', formel: (arr(RC.formeln).filter(function (f) { return f.id === fid; })[0] || {}).name || fid };
      if (!erwachsen && ZA.unter_18 && ZA.unter_18.hinweis) res.hinweise.unshift(ZA.unter_18.hinweis);
      if (k.ziel === 'fettabbau' && res.kalorien.art === 'erhaltung' && erwachsen) res.hinweise.unshift('Ein sicheres Kaloriendefizit ist hier nicht möglich: lieber mehr Bewegung im Alltag, bei Bedarf eine Ernährungsfachkraft fragen.');
      var ge = (arr(RC.formeln).filter(function (f) { return f.id === 'gesamtumsatz'; })[0] || {}).hinweis;
      if (ge) res.hinweise.unshift(ge);
      if (M.fett_g_pro_kg_min != null && M.fett_prozent_energie_min != null && M.kcal_pro_g) {
        res.fett_min_g = Math.round(Math.max(M.fett_g_pro_kg_min * k.gewicht_kg, ziel * M.fett_prozent_energie_min / 100 / M.kcal_pro_g.fett));
      }
    } else res.gruende.push('Für Kalorien fehlt: ' + fehlt.join(', '));

    // Eiweiß
    var ek = M.eiweiss_g_pro_kg || {}, gkg = null, art = '';
    if (!erwachsen) { var j = ek.jugendliche_15_18; if (k.alter >= 15 && j && g && j[g]) { gkg = [j[g], j[g]]; art = 'Jugendliche'; } }
    else if (k.alter >= 65 && ek.ab_65) { gkg = [ek.ab_65, ek.ab_65]; art = 'ab 65'; }
    else if (k.ziel === 'muskelaufbau' || k.ziel === 'kraft') { gkg = ek.standard; art = 'Krafttraining'; }
    else if (k.ziel === 'fettabbau' && res.kalorien && res.kalorien.art === 'defizit') { gkg = ek.diaet; art = 'Krafttraining im Defizit'; }
    else { gkg = ek.sport; art = 'regelmäßiges Training'; }
    if (gkg && k.gewicht_kg) {
      var normal = arr(RC.bmi_kategorien).filter(function (c) { return c.label === 'Normalgewicht'; })[0];
      var bezug = erwachsen && b && normal && b > normal.bis ? normal.bis * Math.pow(k.groesse_cm / 100, 2) : k.gewicht_kg;
      res.eiweiss = { g_pro_kg: gkg, g_tag: [Math.round(gkg[0] * bezug), Math.round(gkg[1] * bezug)], bezug_kg: Math.round(bezug), art: art,
        pro_mahlzeit_g: M.eiweiss_pro_mahlzeit_g || null, mahlzeiten: M.eiweiss_mahlzeiten_pro_tag || null };
      if (bezug !== k.gewicht_kg && M.eiweiss_bezugsgewicht) res.hinweise.push(M.eiweiss_bezugsgewicht);
      if (gkg[1] > 2 && M.eiweiss_obergrenze_hinweis) res.hinweise.push(M.eiweiss_obergrenze_hinweis);
    }
    // Fett als Richtwert (rechner.makros.fett_prozent_energie_richtwert, nie unter der Untergrenze) und Kohlenhydrate als Rest der Kalorien nach Eiweiß
    // (Mitte des Bereichs) und Fett (rechner.makros.kohlenhydrate). Seit 07.11.2026, für „Deine Nährwerte“ auf der Analyse-Seite und den Plan.
    if (res.kalorien && res.eiweiss && res.fett_min_g != null && M.kcal_pro_g && M.fett_prozent_energie_richtwert != null) {
      res.fett_g = Math.max(res.fett_min_g, runde(res.kalorien.ziel * M.fett_prozent_energie_richtwert / 100 / M.kcal_pro_g.fett, 5));
      var khRest = (res.kalorien.ziel - (res.eiweiss.g_tag[0] + res.eiweiss.g_tag[1]) / 2 * M.kcal_pro_g.eiweiss - res.fett_g * M.kcal_pro_g.fett) / M.kcal_pro_g.kohlenhydrate;
      if (khRest > 0) res.kohlenhydrate_g = runde(khRest, 5);
    }
    if (k.alter != null && k.alter >= 19 && M.ballaststoffe_g_min) res.ballaststoffe_g = M.ballaststoffe_g_min;
    if (ja(k, 'medikamente')) res.hinweise.unshift('Du nimmst Medikamente: Stimm die Werte mit deinem Arzt ab.');
    if (/empfehlen/.test(aktion)) res.hinweise.unshift('BMI ' + fmt(b) + ' (' + kat.label + '): ' + aktion + '.');
    return res;
  }

  // Nur die Ernährung, ohne ganzen Plan (Seite „Analyse für dich“ → „Deine Nährwerte“, 07.11.2026). Gleich streng wie erstellePlan:
  // Stoppt der Plan (Gesundheits-Check, unter 18 ohne Einwilligung der Eltern, ärztliche Freigabe für eine Zielgruppe), gibt es auch keine Zahlen.
  // Sonst genau dieselbe Rechnung wie im Plan (ernaehrung), also dieselben Zahlen, die Devin in seinem Plan sieht.
  function ernaehrungFuer(W, kundeIn) {
    var k = JSON.parse(JSON.stringify(kundeIn || {}));
    k.tage = +k.tage || +k.tage_pro_woche || 3; k.alter = k.alter != null && k.alter !== '' ? +k.alter : null;
    k.gewicht_kg = +k.gewicht_kg || null; k.groesse_cm = +k.groesse_cm || null;
    var scr = pruefeScreening(W, k), gruppen = ermittleZielgruppen(W, k, scr.zielgruppen);
    var stopp = scr.stopp.map(function (s) { return s.id; });
    gruppen.forEach(function (z) { if (z.arzt_freigabe === 'pflicht' && !k.arzt_freigabe) stopp.push('freigabe_' + z.id); });
    if (stopp.length) return { status: 'stopp', gruende: stopp, hinweise: [] };
    return ernaehrung(W, k, scr, gruppen);
  }

  /* ---------- 6. Plan bauen ---------- */
  function erstellePlan(W, kundeIn, optionen) {
    optionen = optionen || {};
    var k = JSON.parse(JSON.stringify(kundeIn));
    k.level = +k.level || 1; k.tage = +k.tage || 3; k.alter = k.alter != null && k.alter !== '' ? +k.alter : null;
    k.minuten = +k.minuten_pro_einheit || +k.minuten || 60;
    k.gewicht_kg = +k.gewicht_kg || null; k.groesse_cm = +k.groesse_cm || null;
    var warnungen = [];
    var fehlt = ['ziel', 'ort'].filter(function (f) { return !k[f]; });
    if (fehlt.length) throw new Error('Angaben fehlen: ' + fehlt.join(', '));

    var scr = pruefeScreening(W, k);
    if (scr.stopp.length) {
      return { status: 'stopp', kunde: k, screening: scr,
        text: 'Kein Plan: mindestens eine Antwort im Gesundheits-Check verlangt zuerst eine ärztliche Abklärung.' };
    }
    var weStopp = wiedereinstiegStopp(W, k);
    if (weStopp) {
      scr.stopp.push(weStopp);
      return { status: 'stopp', kunde: k, screening: scr, text: 'Kein Plan: ' + weStopp.frage };
    }
    var gruppen = ermittleZielgruppen(W, k, scr.zielgruppen);
    var grenzen = einschraenkungen(W, k, gruppen, scr);
    if (!grenzen.we && arr(scr.anpassen).some(function (x) { return x.id === 'operation_verletzung'; }) && W.wiedereinstieg) {
      warnungen.push('OP oder Verletzung in den letzten 6 Monaten: Stelle im Plan-Schritt unter „Nach OP oder Verletzung“ einstellen.');
    }
    grenzen.pflichtFreigabe.forEach(function (n) {
      scr.stopp.push({ id: 'freigabe_' + n, frage: n + ': Für diese Gruppe ist eine ärztliche Freigabe Pflicht.', folge: 'Liegt sie schriftlich vor, im Gesundheits-Check anhaken.' });
    });
    if (scr.stopp.length) {
      return { status: 'stopp', kunde: k, screening: scr,
        text: 'Kein Plan: mindestens eine Antwort im Gesundheits-Check verlangt zuerst eine Abklärung.' };
    }
    if (k.level > grenzen.levelMax) {
      warnungen.push('Level von ' + k.level + ' auf ' + grenzen.levelMax + ' gesenkt (' + (grenzen.we ? 'Wiedereinstieg' : 'Zielgruppe') + ').');
      k.level = grenzen.levelMax;
    }

    var ctx = { kunde: k, level: k.level, ausruestung: verfuegbareAusruestung(k), grenzen: grenzen,
      benutzt: {}, ausschluss: {}, liebling: {}, abdeckung: {}, zielWdh: zielWdh(W, k, grenzen), klassiker: W.regeln.klassiker && W.regeln.klassiker.listen };
    arr(k.ausschluss_ids).forEach(function (id) { ctx.ausschluss[id] = true; });
    arr(k.liebling_ids).forEach(function (id) { ctx.liebling[id] = true; });
    var sp = schwerpunkteFuer(W, k, gruppen, scr);

    var ag = alterGrenzen(W, k.alter);
    var weSplit = grenzen.we ? wiedereinstiegSplit(W, k, ctx, warnungen) : null;
    if (grenzen.we && !weSplit) {
      scr.stopp.push({ id: 'wiedereinstieg_zu_wenig', frage: 'Wiedereinstieg: Mit diesen Vorgaben und dieser Ausrüstung bleiben zu wenige sichere Übungen übrig.', folge: 'Im Studio an Maschinen gibt es meist mehr Möglichkeiten. Sonst läuft das Training vorerst bei Arzt oder Physio, nach der nächsten Freigabe neu erstellen.' });
      return { status: 'stopp', kunde: k, screening: scr, text: 'Kein Plan: Mit diesen Vorgaben und dieser Ausrüstung bleiben zu wenige sichere Übungen übrig.' };
    }
    var split = krafttageBegrenzen(W, k, weSplit || waehleSplit(W, k, warnungen), warnungen, ag);
    splitPruefen(W, k, split, warnungen);
    var vol = wochenVolumen(W, k, grenzen);
    var R = W.regeln;
    var zeitSatz = R.zeit_pro_satz_sek || { grund: 45, isolation: 35 };
    var maxUeb = (R.uebungen_pro_einheit && R.uebungen_pro_einheit.max) || 8;
    var minUeb = (R.uebungen_pro_einheit && R.uebungen_pro_einheit.min) || 4;
    var aufw = W.aufwaermen_cardio && W.aufwaermen_cardio.aufwaermen;
    var aufwMin = aufw && aufw.allgemein ? mitte(aufw.allgemein.dauer_min) : 8;

    // Wie oft trifft jeder Tagestyp einen Muskel? → Sätze pro Slot
    var tage = split.tage_aufbau.map(function (typen, i) {
      var typ = typen[0];
      var def = tagesDefinition(W, typ, k.minuten);
      if (!def) throw new Error('Wissensbasis: Tagestyp ' + typ + ' fehlt');
      return { nr: i + 1, typ: typ, name: (split.namen && split.namen[i]) || def.name || typNameLesbar(typ), def: def, uebungen: [] };
    });

    var extraProTyp = extraVerteilen(W, k, tage);

    // Gleicher Tagestyp = gleiche Übungen (sonst lässt sich nichts steigern)
    var proTyp = {}, zusatzProTyp = {};
    tage.forEach(function (tag) {
      if (proTyp[tag.typ]) {
        tag.uebungen = proTyp[tag.typ].map(function (u) { return { id: u.id, slot: u.slot }; });
        tag.uebungen.forEach(function (u) { arr(W.index[u.id].muskel_primaer).forEach(function (m) { ctx.abdeckung[m] = (ctx.abdeckung[m] || 0) + 1; }); });
        return;
      }
      var sm = arr(tag.def.slot_muskel);
      var slots = arr(tag.def.muster_reihenfolge).map(function (m, i) {
        var slot = typeof m === 'string' ? { muster: m, index: i } : Object.assign({ index: i }, m);
        if (sm[i] && !slot.muskel) slot.muskel = sm[i];
        return slot;
      });
      var imTag = {};
      slots.forEach(function (slot) {
        var versuche = [slot.muster].concat(MUSTER_ERSATZ[slot.muster] || []);
        var ex = null, genutzt = null;
        for (var v = 0; v < versuche.length && !ex; v++) {
          if (grenzen.musterMeiden[versuche[v]]) continue;
          var s = Object.assign({}, slot, { muster: versuche[v] });
          ex = waehleUebung(W, ctx, s, imTag);
          if (!ex && s.muskel) { delete s.muskel; ex = waehleUebung(W, ctx, s, imTag); }
          genutzt = versuche[v];
        }
        if (!ex) {
          if (!grenzen.we) warnungen.push(tag.name + ': ' + musterLesbar(slot.muster) + ' entfällt' +
            (grenzen.musterMeiden[slot.muster] ? ' (' + grenzen.musterMeiden[slot.muster] + ').' : ' — keine sichere Übung mit dieser Ausrüstung.'));
          return;
        }
        if (genutzt !== slot.muster && !grenzen.we) warnungen.push(tag.name + ': statt ' + musterLesbar(slot.muster) + ' → ' + ex.name + ' (Ausrüstung/Beschwerden).');
        ctx.benutzt[ex.id] = (ctx.benutzt[ex.id] || 0) + 1;
        arr(ex.muskel_primaer).forEach(function (m) { ctx.abdeckung[m] = (ctx.abdeckung[m] || 0) + 1; });
        imTag[ex.id] = true;
        tag.uebungen.push({ id: ex.id, slot: slot });
      });
      if (tag.typ !== LEICHTER_TAG) schwerpunktEinbauen(W, ctx, tag, sp, imTag);
      extraEinbauen(W, ctx, tag, arr(extraProTyp[tag.typ]), imTag, warnungen);
      proTyp[tag.typ] = tag.uebungen;
    });

    // Frequenz je Muskel zählen (primär)
    var freq = {};
    tage.forEach(function (tag) {
      var gesehen = {};
      tag.uebungen.forEach(function (u) {
        arr(W.index[u.id].muskel_primaer).forEach(function (m) { gesehen[m] = true; });
      });
      Object.keys(gesehen).forEach(function (m) { freq[m] = (freq[m] || 0) + 1; });
    });

    // Sätze verteilen
    tage.forEach(function (tag) {
      var proMuskel = {};
      tag.uebungen.forEach(function (u) {
        arr(W.index[u.id].muskel_primaer).forEach(function (m) { proMuskel[m] = (proMuskel[m] || 0) + 1; });
      });
      var spMax = (R.saetze_pro_uebung && R.saetze_pro_uebung.max) || 4;
      if (ag.saetze_max != null) spMax = Math.min(spMax, ag.saetze_max);   // Altersgrenze, z. B. unter 18
      var spMin = (R.saetze_pro_uebung && R.saetze_pro_uebung.min) || 2;
      tag.uebungen.forEach(function (u) {
        var ex = W.index[u.id];
        var klein = ex.rolle === 'isolation' || /^rumpf|^isolation|^wade|^tragen/.test(ex.muster);
        var saetze;
        if (u.slot.schwerpunkt && u.slot.saetze) saetze = u.slot.saetze[k.level <= 2 ? 0 : 1];   // Schwerpunkt: Sätze aus der Wissensbasis
        else if (tag.typ === LEICHTER_TAG) saetze = spMin;   // leichter Tag: Mindestzahl Sätze
        else if (klein) saetze = k.level <= 2 ? 2 : 3;   // Ergänzung: kleine Muskeln bekommen indirektes Volumen mit
        else {
          var s = arr(ex.muskel_primaer).map(function (m) { return vol.ziel / (freq[m] || 1) / (proMuskel[m] || 1); });
          saetze = Math.round(Math.min.apply(null, s.length ? s : [3]));
        }
        var obergrenze = k.level <= 1 ? Math.min(3, spMax) : spMax;
        saetze = clamp(saetze, Math.min(!klein && k.level >= 3 ? 3 : 2, obergrenze), obergrenze);
        if (+k.saetze_max >= 2) saetze = Math.min(saetze, +k.saetze_max);   // Kundenwunsch (setzt Devin), nie unter 2 (ACSM)
        var it = intensitaet(W, k, grenzen, ex);
        if (u.slot.wdh) {   // z. B. Sprünge: wenige Wiederholungen, volle Pausen, viel Reserve
          var exw = ex.wdh_bereich || u.slot.wdh, wlo = Math.max(u.slot.wdh[0], exw[0]), whi = Math.min(u.slot.wdh[1], exw[1]);
          it.wdh = wlo <= whi ? [wlo, whi] : u.slot.wdh.slice();
        }
        if (u.slot.pause) it.pause = u.slot.pause.slice();
        if (u.slot.rir) it.rir = [Math.max(u.slot.rir[0], grenzen.rirMin), Math.max(u.slot.rir[1], grenzen.rirMin)];
        u.saetze = saetze;
        u.wdh = it.wdh; u.einheit = it.einheit; u.rir = it.rir; u.pause = it.pause;
      });
      if (istBausteinTyp(tag.typ)) saetzeProEinheitBegrenzen(W, k, tag);
      if (grenzen.we && grenzen.we.stufe.saetze_stelle_max) tag.uebungen.forEach(function (u) {
        var ex = W.index[u.id], trifft = grenzen.we.regionen.some(function (r) {
          return arr(r.gelenke).some(function (g) { return ((ex.gelenkbelastung || {})[g] || 0) > 0; }) || arr(ex.muskel_primaer).some(function (m) { return arr(r.muskeln_gesperrt).indexOf(m) >= 0; });
        });
        if (trifft) u.saetze = Math.min(u.saetze, grenzen.we.stufe.saetze_stelle_max);
      });
      // Zeit einpassen: immer bei der Übung mit den meisten Sätzen kürzen (Ergänzungen zuerst)
      function dauer() {
        return aufwMin + tag.uebungen.reduce(function (t, u) {
          var ex = W.index[u.id];
          return t + u.saetze * ((ex.rolle === 'grund' ? zeitSatz.grund : zeitSatz.isolation) + mitte(u.pause)) / 60;
        }, 0);
      }
      var schutz = 0;
      while (dauer() > k.minuten && schutz++ < 80) {
        // Reihenfolge: erst über 3 Sätze kürzen, dann Ergänzungsübungen streichen, dann auf 2 Sätze
        var ueber3 = tag.uebungen.filter(function (u) { return u.saetze > 3; });
        var zuerst = arr(tag.def.streichen_zuerst);
        // Schwerpunkt-Übungen kommen zur Mindestzahl dazu und werden nie gestrichen (eher Sätze kürzen, sonst Zeit-Warnung)
        var spAnz = tag.uebungen.filter(function (u) { return u.slot.schwerpunkt; }).length;
        var ergaenzung = tag.uebungen.filter(function (u) { return !u.slot.schwerpunkt && (W.index[u.id].rolle !== 'grund' || zuerst.indexOf(u.slot.muster) >= 0); });
        ergaenzung.sort(function (a, b) {
          var ia = zuerst.indexOf(a.slot.muster), ib = zuerst.indexOf(b.slot.muster);
          return (ib < 0 ? 99 : ib) - (ia < 0 ? 99 : ia) || a.slot.index - b.slot.index;
        });
        if (!ueber3.length && ergaenzung.length && tag.uebungen.length - spAnz > minUeb) {
          var raus = ergaenzung[ergaenzung.length - 1];
          tag.uebungen.splice(tag.uebungen.indexOf(raus), 1);
          (tag.gestrichen = tag.gestrichen || []).push(W.index[raus.id].name);
          continue;
        }
        var kandidat = tag.uebungen.filter(function (u) { return u.saetze > 2; }).sort(function (a, b) {
          var ga = W.index[a.id].rolle === 'grund' ? 1 : 0, gb = W.index[b.id].rolle === 'grund' ? 1 : 0;
          return (b.saetze - a.saetze) || (ga - gb) || (b.slot.index - a.slot.index);
        })[0];
        if (kandidat) { kandidat.saetze--; tag.gekuerzt = true; continue; }
        if (tag.uebungen.length - spAnz > minUeb) {
          var weg = letzteOhneSchwerpunkt(tag.uebungen);
          (tag.gestrichen = tag.gestrichen || []).push(W.index[weg.id].name);
          continue;
        }
        warnungen.push(tag.name + ': passt nicht ganz in ' + k.minuten + ' Minuten (ca. ' + Math.round(dauer()) + ').');
        break;
      }
      while (tag.uebungen.length > maxUeb) letzteOhneSchwerpunkt(tag.uebungen);
      // Höchstens 2–3 Sätze, aber viel Volumen (seit 01.11.2026, Kunde: „viel Volumen, maximal 2 Sätze“): die freie Zeit mit einer
      // zweiten Übung für die Hauptbewegungen des Tages füllen. Gleicher Tagestyp = gleiche Zusatzübungen. Nur erlaubte Übungen.
      if (+k.saetze_max >= 2 && tag.typ !== LEICHTER_TAG) {
        var imTagZ = {}; tag.uebungen.forEach(function (u) { imTagZ[u.id] = true; });
        var mitSaetzen = function (ex, slot) {
          var it = intensitaet(W, k, grenzen, ex);
          return { id: ex.id, slot: slot, saetze: Math.min(2, +k.saetze_max), wdh: it.wdh, einheit: it.einheit, rir: it.rir, pause: it.pause };
        };
        var dauerMit = function (ex, s) { return s * ((ex.rolle === 'grund' ? zeitSatz.grund : zeitSatz.isolation) + mitte(intensitaet(W, k, grenzen, ex).pause)) / 60; };
        if (zusatzProTyp[tag.typ]) zusatzProTyp[tag.typ].forEach(function (z) { tag.uebungen.push(mitSaetzen(W.index[z.id], z.slot)); });
        else {
          var neuZ = [], haupt = arr(tag.def.muster_reihenfolge).map(function (m) { return typeof m === 'string' ? m : m.muster; })
            .filter(function (m) { return !/^isolation|^rumpf|^wade|^tragen/.test(m); });
          haupt.forEach(function (m) {
            if (tag.uebungen.length >= maxUeb) return;
            var ex = waehleUebung(W, ctx, { muster: m, index: 50 }, imTagZ);
            if (!ex || dauer() + dauerMit(ex, Math.min(2, +k.saetze_max)) > k.minuten) return;
            var z = mitSaetzen(ex, { muster: m, index: 50, zusatz: true });
            tag.uebungen.push(z); neuZ.push({ id: ex.id, slot: z.slot });
            imTagZ[ex.id] = true; ctx.benutzt[ex.id] = (ctx.benutzt[ex.id] || 0) + 1;
          });
          zusatzProTyp[tag.typ] = neuZ;
        }
      }
      tag.dauer_min = Math.round(dauer());
    });
    extraBegrenzen(W, tage, vol, warnungen);
    if (grenzen.we) wochenGrenzeWiedereinstieg(W, tage, vol);
    tage.forEach(function (t) { if (t.gestrichen) warnungen.push(t.name + ': ' + uniq(t.gestrichen).join(', ') + ' weggelassen (Zeit).'); });
    // Schwerpunkt: Hinweis für den Kunden, Warnung für Devin, wenn er nicht (ganz) umsetzbar war
    var spHinweise = [], spName = {};
    sp.forEach(function (x) {
      var s = x.def, drin = tage.some(function (t) { return t.uebungen.some(function (u) { return u.slot.schwerpunkt === s.id; }); });
      spName[s.id] = s.name;
      if (x.haupt) spHinweise.push(s.plan_hinweis);
      if (x.ersatz && s.sonst) spHinweise.push(s.sonst.warum);
      if (x.gesperrt) warnungen.push('Schwerpunkt ' + s.name + ': nicht in voller Form (' + x.gesperrt + ')' + (drin ? ', stattdessen ' + uniq(x.uebungen).join(', ') + '.' : '.'));
      if (!drin) warnungen.push('Schwerpunkt ' + s.name + ': keine passende Übung (Level, Beschwerden oder Ausrüstung).');
      else if (x.fehlt) warnungen.push('Schwerpunkt ' + s.name + ': an ' + x.fehlt + ' Tag(en) keine passende Übung.');
    });
    if (tage.some(function (t) { return t.gekuerzt; })) warnungen.push('Sätze gekürzt, damit jede Einheit in ' + k.minuten + ' Minuten passt. Mehr Zeit = mehr Volumen.');

    var ist = volumenIst(W, tage);

    // Progression / Wochen
    var prog = arr(R.progression && R.progression.modelle).filter(function (m) { return imLevel(m.fuer_level, k.level); })[0];
    var mzw = R.mesozyklus_wochen && R.mesozyklus_wochen[String(k.level)];
    var wePruef = grenzen.we ? ((W.wiedereinstieg.technik || {}).pruef_wochen || 4) : 0;
    var wochenAnzahl = wePruef ? Math.min(+k.wochen || wePruef, wePruef) : (+k.wochen || (mzw ? mzw[1] : 8));
    var einstieg = R.einstiegsphase || {};
    var einstiegWochen = wePruef ? wePruef : k.level <= 2 ? (einstieg.wochen ? einstieg.wochen[0] : 2) : 0;
    var wochen = [];
    for (var w = 1; w <= wochenAnzahl; w++) {
      var phase = w <= einstiegWochen ? 'einstieg' : (w === wochenAnzahl && wochenAnzahl >= 5 ? 'deload' : 'aufbau');
      wochen.push({ nr: w, phase: phase,
        text: phase === 'einstieg' ? 'Technik lernen, Gewicht leicht, eher mehr Wiederholungen übrig lassen'
          : phase === 'deload' ? (R.deload && R.deload.wie) || 'Entlastung'
          : 'Steigern nach Progressionsregel' });
    }

    // Aufwärmen + Cardio
    var weVorsichtig = grenzen.we && grenzen.we.stufe.id !== 'aufbau';   // Aufwärmen und Ausdauer belasten die Stelle oft mit: nur nach Vorgabe
    tage.forEach(function (tag) { tag.aufwaermen = weVorsichtig ? null : aufwaermenFuer(W, k, tag.typ); });
    var cardio = weVorsichtig ? [] : arr(W.aufwaermen_cardio && W.aufwaermen_cardio.cardio).filter(function (c) {
      return arr(c.ziel).indexOf(k.ziel) >= 0 && imLevel(c.level, k.level);
    });
    var weTexte = [];
    if (grenzen.we) {
      var we0 = W.wiedereinstieg;
      if (weVorsichtig) weTexte.push('Aufwärmen und Ausdauer nur so, wie es Arzt oder Physio erlaubt haben. Die betroffene Stelle bleibt dabei außen vor.');
      if (k.we_vorgaben) weTexte.push('Vorgabe von Arzt oder Physio: ' + String(k.we_vorgaben).slice(0, 400));
      weTexte.push('Dieser Plan läuft ' + wochenAnzahl + ' Wochen. Spätestens dann, oder früher, wenn es in deiner Freigabe steht, schauen Arzt oder Physio wieder drauf. Bei Widerspruch gilt immer ihre Vorgabe, nicht dieser Plan.');
      if (we0.gesunde_seite && we0.gesunde_seite.kurz && grenzen.we.stufe.id === 'ruht' && grenzen.we.regionen.some(function (r) { return r.teil !== 'rumpf'; })) weTexte.push(we0.gesunde_seite.kurz);
      warnungen.push('Wiedereinstieg: Prüfe jede Übung gegen die schriftliche Vorgabe. DK Coach kennt weder Seite noch Winkel oder Lastgrenzen daraus.');
    }

    var plan = {
      status: scr.anpassen.length || warnungen.length || gruppen.length ? 'angepasst' : 'ok',
      erstellt: new Date().toISOString(),
      wissen_stand: W.stand,
      kunde: { name: k.name, alter: k.alter, geschlecht: k.geschlecht, ziel: k.ziel, level: k.level,
        level_name: LEVEL_NAME[k.level], tage: k.tage, minuten: k.minuten, ort: k.ort, beschwerden: k.beschwerden,
        geraete: nurMaschinen(k) ? 'maschinen' : 'alle' },
      screening: scr,
      zielgruppen: gruppen.map(function (z) { return { id: z.id, name: z.name }; }),
      split: { id: split.id, name: split.name, beschreibung: split.beschreibung, eigen: !!split.eigen },
      volumen: { ziel_pro_muskel: vol.ziel, bereich: vol.bereich, ist: ist },
      tage: tage.map(function (t) {
        return { nr: t.nr, typ: t.typ, name: t.name, dauer_min: t.dauer_min,
          leicht: t.typ === LEICHTER_TAG, hinweis: t.typ === LEICHTER_TAG ? t.def.hinweis || '' : '',
          aufwaermen: t.aufwaermen,
          uebungen: t.uebungen.map(function (u) {
            var ex = W.index[u.id];
            return { id: u.id, name: ex.name, saetze: u.saetze, wdh: u.wdh, einheit: u.einheit, rir: u.rir,
              pause: u.pause, technik: ex.technik, vorsicht: ex.vorsicht, einseitig: ex.einseitig,
              muskeln: ex.muskel_primaer, notiz: u.slot.extra ? 'Extra: ' + u.slot.extra : u.slot.schwerpunkt ? 'Schwerpunkt ' + spName[u.slot.schwerpunkt] : '' };
          }) };
      }),
      wochen: wochen,
      progression: prog ? { name: prog.name, regel: prog.regel, wann: R.progression.wann_steigern } : null,
      deload: R.deload || null,
      aufwaermsaetze: aufw && aufw.aufwaermsaetze,
      cardio: cardio.slice(0, 2),
      erholung: W.aufwaermen_cardio && W.aufwaermen_cardio.erholung,
      schwerpunkte: sp.map(function (x) { return { id: x.def.id, name: x.def.name, uebungen: uniq(x.uebungen), ersatz: x.ersatz, gesperrt: x.gesperrt }; }),
      hinweise: uniq(weTexte.concat(spHinweise, grenzen.hinweise)),
      arzt_wenn: uniq(grenzen.arzt),
      warnungen: uniq(warnungen),
      sicherheit: (W.sicherheit && W.sicherheit.standard_hinweis_plan) || '',
      abbruch: arr(W.sicherheit && W.sicherheit.abbruch_warnzeichen).concat(grenzen.we ? arr(W.wiedereinstieg.pflicht && W.wiedereinstieg.pflicht.warnzeichen).map(function (x) { return x.text; }) : []),
      wiedereinstieg: grenzen.we ? { stufe: grenzen.we.stufe.id, stufe_name: grenzen.we.stufe.name, regionen: grenzen.we.regionen.map(function (r) { return r.name; }),
        art: k.we_art || '', von: k.we_von || '', datum: k.we_datum || '', vorgaben: k.we_vorgaben || '', pruefen_nach_wochen: wochenAnzahl } : null,
      abbruch_regeln: abbruchRegeln(W),
      alter_hinweise: alterHinweise(W, k.alter),
      ernaehrung: ernaehrung(W, k, scr, gruppen),
      ki_text: null
    };
    plan.qualitaet = pruefeQualitaet(W, plan);
    return plan;
  }

  function pruefeQualitaet(W, plan) {
    var p = [];
    var ziel = plan.volumen.ziel_pro_muskel;
    var gross = ['brust', 'lat', 'oberer_ruecken', 'quadrizeps', 'beinbeuger', 'gesaess'];
    gross.forEach(function (m) {
      var ist = plan.volumen.ist[m] || 0;
      if (ist < ziel * 0.5 && !plan.wiedereinstieg) p.push({ ok: false, text: muskelLesbar(m) + ': nur ' + fmt(ist) + ' Sätze/Woche (Ziel ca. ' + ziel + ')' });
      else if (ist > plan.volumen.bereich[1] * 1.5) p.push({ ok: false, text: muskelLesbar(m) + ': ' + fmt(ist) + ' Sätze/Woche, deutlich über dem Bereich für das Level (' + plan.volumen.bereich.join('–') + ')' });
    });
    var leer = plan.tage.filter(function (t) { return t.uebungen.length < 3; });
    if (leer.length) p.push({ ok: false, text: leer.length + ' Trainingstag(e) mit weniger als 3 Übungen' });
    if (!plan.progression) p.push({ ok: false, text: 'Keine Progressionsregel für dieses Level in der Wissensbasis' });
    if (!p.length) p.push({ ok: true, text: plan.wiedereinstieg ? 'Wiedereinstieg: Muskeln an der betroffenen Stelle fehlen mit Absicht' : 'Volumen, Übungszahl und Progression im Rahmen' });
    return p;
  }

  /* ---------- 8. Eigene Pläne und Vorlagen ---------- */
  function aufwaermenFuer(W, k, typ) {
    var aufw = W.aufwaermen_cardio && W.aufwaermen_cardio.aufwaermen, routinen = arr(aufw && aufw.routinen);
    var art = /unter|bein/.test(typ) ? 'unterkoerper' : /ober|push|pull/.test(typ) ? 'oberkoerper' : 'ganzkoerper';
    if (istBausteinTyp(typ)) {
      var arten = {}; gruppenAusTyp(W, typ).forEach(function (g) { if (g.art !== 'rumpf') arten[g.art] = true; });
      art = arten.ober && arten.unter ? 'ganzkoerper' : arten.unter ? 'unterkoerper' : arten.ober ? 'oberkoerper' : 'ganzkoerper';
    }
    var orte = k.ort === 'beides' ? ['zuhause', 'gym'] : [k.ort];
    return routinen.filter(function (r) {
      return arr(r.fuer).indexOf(art) >= 0 && (!r.ort || orte.some(function (o) { return arr(r.ort).indexOf(o) >= 0; }));
    })[0] || routinen[0] || null;
  }
  // Tatsächliches Volumen (primär 1, sekundär 0,5); eigene Übungen zählen mit ihren eingetragenen Muskeln
  function volumenIst(W, tage) {
    var ist = {};
    arr(tage).forEach(function (tag) {
      arr(tag.uebungen).forEach(function (u) {
        var ex = W.index[u.id];
        arr(ex ? ex.muskel_primaer : u.muskeln).forEach(function (m) { ist[m] = (ist[m] || 0) + u.saetze; });
        arr(ex && ex.muskel_sekundaer).forEach(function (m) { ist[m] = (ist[m] || 0) + u.saetze * 0.5; });
      });
    });
    return ist;
  }
  function tagDauer(W, tag) {
    var R = W.regeln || {}, zs = R.zeit_pro_satz_sek || { grund: 45, isolation: 35 };
    var aufw = W.aufwaermen_cardio && W.aufwaermen_cardio.aufwaermen;
    return Math.round((aufw && aufw.allgemein ? mitte(aufw.allgemein.dauer_min) : 8) + arr(tag.uebungen).reduce(function (t, u) {
      var ex = W.index[u.id] || {};
      return t + u.saetze * ((ex.rolle === 'grund' ? zs.grund : zs.isolation) + mitte(u.pause || [60, 120])) / 60;
    }, 0));
  }
  // Nach jeder Änderung von Hand: Nummern, Dauer, Volumen und Prüfung neu
  function planNachrechnen(W, plan) {
    arr(plan.tage).forEach(function (t, i) { t.nr = i + 1; t.dauer_min = tagDauer(W, t); });
    if (plan.volumen) plan.volumen.ist = volumenIst(W, plan.tage);
    if (plan.volumen) plan.qualitaet = pruefeQualitaet(W, plan);
    return plan;
  }
  // Höchstzahl Sätze pro Übung (Daten-Maximum, Einstieg 3, Altersgrenze) und Krafttage pro Woche (Level, Alter)
  function satzGrenze(W, ctx) {
    var R = W.regeln || {}, max = (R.saetze_pro_uebung && R.saetze_pro_uebung.max) || 4;
    if (ctx.level <= 1) max = Math.min(max, 3);
    if (ctx.ag && ctx.ag.saetze_max != null) max = Math.min(max, ctx.ag.saetze_max);
    return max;
  }
  function krafttageGrenze(W, ctx) {
    var sr = (W.regeln && W.regeln.split_regeln) || {};
    var max = sr.max_krafttage_pro_level ? sr.max_krafttage_pro_level[String(ctx.level)] : null;
    if (ctx.ag && ctx.ag.max_krafttage != null && (max == null || ctx.ag.max_krafttage < max)) max = ctx.ag.max_krafttage;
    return max;
  }
  // Eine Übung so in den Plan setzen, wie der Generator es täte: RIR und Pause aus den Regeln, Sätze in den
  // Grenzen des Kunden, Wiederholungen nie außerhalb der Zielgruppen-Grenze (grenzen.wdh).
  // u: { id } aus der Datenbank oder { eigen: true, name }, dazu wahlweise saetze, wdh (+ wdh_manuell), einheit, notiz.
  // Ob eine Datenbank-Übung für den Kunden erlaubt ist, prüft der Aufrufer (uebungErlaubt).
  function planUebung(W, ctx, u) {
    var eigen = !!u.eigen, ex = eigen ? null : W.index[u.id];
    if (!eigen && !ex) return null;
    var einheit = eigen ? (u.einheit === 'sek' ? 'sek' : 'wdh') : (ex.einheit || 'wdh');
    var manuell = (eigen || u.wdh_manuell) && Array.isArray(u.wdh) && u.wdh.length === 2 && +u.wdh[0] > 0 && +u.wdh[1] > 0;
    var it = intensitaet(W, ctx.kunde, ctx.grenzen, ex || { rolle: 'isolation', einheit: einheit, wdh_bereich: manuell ? u.wdh : null });
    var wdh = it.wdh, hinweis = '';
    if (manuell) {
      wdh = [Math.min(+u.wdh[0], +u.wdh[1]), Math.max(+u.wdh[0], +u.wdh[1])];
      var g = ctx.grenzen.wdh;
      if (g && einheit !== 'sek') {
        var lo = Math.max(wdh[0], g[0]), hi = Math.min(wdh[1], g[1]);
        if (lo > hi) { lo = g[0]; hi = g[1]; }
        if (lo !== wdh[0] || hi !== wdh[1]) hinweis = 'Wiederholungen auf ' + g[0] + '–' + g[1] + ' gesetzt (Grenze der Zielgruppe).';
        wdh = [lo, hi];
      }
    }
    var max = satzGrenze(W, ctx), soll = Math.round(+u.saetze) || 3;
    if (soll > max) hinweis = (hinweis ? hinweis + ' ' : '') + 'Höchstens ' + max + ' Sätze.';
    var r = { id: eigen ? (/^eigen_/.test(u.id || '') ? u.id : 'eigen_' + Math.random().toString(36).slice(2, 9)) : ex.id,
      name: eigen ? (String(u.name || '').trim().slice(0, 80) || 'Eigene Übung') : ex.name,
      saetze: clamp(soll, 1, max), wdh: wdh, einheit: einheit, rir: it.rir, pause: it.pause,
      technik: ex ? ex.technik : [], vorsicht: ex ? ex.vorsicht : [], einseitig: ex ? !!ex.einseitig : false,
      muskeln: ex ? ex.muskel_primaer : arr(u.muskeln), notiz: String(u.notiz || '').slice(0, 140) };
    if (eigen) r.eigen = true;
    if (manuell) r.wdh_manuell = true;
    if (hinweis) r.hinweis = hinweis;   // nur für den Aufrufer, kommt nicht in den Plan
    return r;
  }
  // Vorlage = Tage mit Übungen und Sätzen, ohne Kundendaten. Wiederholungen nur, wenn von Hand gesetzt.
  function vorlageAusPlan(plan, name) {
    return { typ: 'vorlage', name: String(name || '').trim().slice(0, 60) || 'Meine Vorlage', erstellt: new Date().toISOString(),
      tage: arr(plan.tage).map(function (t) {
        return { name: t.name, leicht: !!t.leicht, hinweis: t.hinweis || '', uebungen: arr(t.uebungen).map(function (u) {
          var v = { saetze: u.saetze, notiz: u.notiz || '' };
          if (u.eigen) { v.eigen = true; v.name = u.name; v.wdh = u.wdh; v.einheit = u.einheit; v.muskeln = u.muskeln; }
          else { v.id = u.id; if (u.wdh_manuell) { v.wdh = u.wdh; v.wdh_manuell = true; } }
          return v;
        }) };
      }) };
  }
  // Plan für einen Kunden aus einer Vorlage: Gesundheits-Check, Hinweise, Ernährung usw. wie beim Generator,
  // die Tage aus der Vorlage. Was für den Kunden nicht erlaubt ist, wird ersetzt oder fällt weg (mit Warnung).
  function planAusVorlage(W, kundeIn, vorlage) {
    var tageV = arr(vorlage && vorlage.tage);
    if (!tageV.length) throw new Error('Die Vorlage hat keine Trainingstage.');
    var plan = erstellePlan(W, Object.assign({}, kundeIn, { tage: Math.min(tageV.length, 6), split_wunsch: null }));
    if (plan.status === 'stopp') return plan;
    var ctx = kontext(W, kundeIn), warn = [];
    if ((+kundeIn.level || 1) > ctx.level) warn.push('Level von ' + kundeIn.level + ' auf ' + ctx.level + ' gesenkt (Zielgruppe).');
    var maxK = krafttageGrenze(W, ctx), kraft = 0, tage = [];
    tageV.forEach(function (tv) {
      var name = String(tv.name || 'Tag ' + (tage.length + 1)).slice(0, 60);
      if (!tv.leicht && maxK != null && kraft >= maxK) { warn.push(name + ' weggelassen: höchstens ' + maxK + ' Krafttage pro Woche.'); return; }
      if (!tv.leicht) kraft++;
      var imTag = {};
      var uebungen = arr(tv.uebungen).map(function (u) {
        if (!u.eigen) {
          var ex = W.index[u.id];
          if (!ex) { warn.push(name + ': Übung „' + u.id + '“ gibt es nicht mehr.'); return null; }
          var gruende = uebungErlaubt(ex, ctx);
          if (imTag[ex.id]) gruende.push('doppelt');
          if (gruende.length) {
            var alt = alternativen(W, ctx, ex).filter(function (e) { return !imTag[e.id]; })[0];
            if (!alt) { warn.push(name + ': ' + ex.name + ' entfällt (' + gruende.join(', ') + ').'); return null; }
            warn.push(name + ': statt ' + ex.name + ' → ' + alt.name + ' (' + gruende.join(', ') + ').');
            u = Object.assign({}, u, { id: alt.id, wdh_manuell: false });
          }
          imTag[u.id] = true;
        }
        var pu = planUebung(W, ctx, u);
        if (pu && pu.hinweis) { warn.push(name + ': ' + pu.name + ': ' + pu.hinweis); delete pu.hinweis; }
        return pu;
      }).filter(Boolean);
      tage.push({ nr: tage.length + 1, typ: tv.leicht ? LEICHTER_TAG : 'eigen', name: name, leicht: !!tv.leicht, hinweis: tv.hinweis || '',
        aufwaermen: ctx.grenzen.we && ctx.grenzen.we.stufe.id !== 'aufbau' ? null : aufwaermenFuer(W, ctx.kunde, name.toLowerCase()), uebungen: uebungen });
    });
    if (+kundeIn.tage && +kundeIn.tage !== tage.length) warn.push('Die Vorlage hat ' + tage.length + ' Trainingstage, im Formular stehen ' + kundeIn.tage + '.');
    plan.tage = tage;
    plan.kunde.tage = tage.length;
    plan.split = { id: 'vorlage', name: vorlage.name || 'Eigene Vorlage', beschreibung: 'Aus einer Vorlage von Devin.' };
    plan.vorlage = { id: vorlage.id || null, name: vorlage.name || '' };
    plan.warnungen = uniq(warn);
    plan.status = plan.warnungen.length || plan.screening.anpassen.length || plan.zielgruppen.length ? 'angepasst' : 'ok';
    return planNachrechnen(W, plan);
  }
  // Startvorlagen für Anfänger, nur Maschinen. Nichts fest eingetragen: der Generator baut sie aus der
  // Wissensdatenbank für einen gesunden Erwachsenen (Gewicht, Größe, Alter wirken hier nur auf die Ernährung,
  // die nicht in die Vorlage kommt).
  function startVorlagen(W) {
    var ref = { name: 'Vorlage', alter: 30, geschlecht: 'maennlich', groesse_cm: 178, gewicht_kg: 75, ziel: 'muskelaufbau', level: 1,
      minuten_pro_einheit: 60, ort: 'gym', geraete: 'maschinen', beschwerden: ['keine'], screening: {} };
    return [2, 3].map(function (tage) {
      var v = vorlageAusPlan(erstellePlan(W, Object.assign({}, ref, { tage: tage })), 'Anfänger Ganzkörper ' + tage + 'x · nur Maschinen');
      v.id = 'dk_anfaenger_' + tage; v.dk = true;
      v.beschreibung = 'Level Einstieg, ' + tage + ' Tage pro Woche, Maschinen und Kabelzug. Aus der Wissensdatenbank.';
      return v;
    });
  }

  /* ---------- Hilfen ---------- */
  function uniq(a) { var s = {}; return a.filter(function (x) { if (!x || s[x]) return false; s[x] = 1; return true; }); }
  function fmt(n) { return (Math.round(n * 2) / 2).toString().replace('.', ','); }
  var MUSKEL_NAME = { brust: 'Brust', lat: 'Latissimus', oberer_ruecken: 'Oberer Rücken', trapez: 'Trapez',
    schulter_vorne: 'Vordere Schulter', schulter_seite: 'Seitliche Schulter', schulter_hinten: 'Hintere Schulter',
    bizeps: 'Bizeps', trizeps: 'Trizeps', unterarme: 'Unterarme', quadrizeps: 'Quadrizeps', beinbeuger: 'Beinbeuger',
    gesaess: 'Gesäß', adduktoren: 'Adduktoren', abduktoren: 'Abduktoren', waden: 'Waden', bauch: 'Bauch',
    seitlicher_rumpf: 'Seitlicher Rumpf', unterer_ruecken: 'Unterer Rücken' };
  var MUSTER_NAME = { kniedominant: 'Kniebeuge-Muster', hueftdominant: 'Hüftstreckung', ausfallschritt: 'Ausfallschritt',
    horizontal_druecken: 'Drücken horizontal', vertikal_druecken: 'Drücken über Kopf', horizontal_ziehen: 'Rudern',
    vertikal_ziehen: 'Ziehen von oben', isolation_arme: 'Arme', isolation_schulter: 'Schulter isoliert',
    isolation_beine: 'Beine isoliert', rumpf_anti_extension: 'Rumpf (Anti-Extension)', rumpf_anti_rotation: 'Rumpf (Anti-Rotation)',
    rumpf_flexion: 'Bauch', tragen: 'Tragen', wade: 'Waden' };
  function muskelLesbar(m) { return MUSKEL_NAME[m] || m; }
  function musterLesbar(m) { return MUSTER_NAME[m] || m; }
  function typNameLesbar(t) {
    var m = { ganzkoerper: 'Ganzkörper', oberkoerper: 'Oberkörper', unterkoerper: 'Unterkörper', push: 'Push', pull: 'Pull', beine: 'Beine' };
    var p = t.split('_');
    return (m[p[0]] || p[0]) + (p[1] ? ' ' + p[1].toUpperCase() : '');
  }

  function indexiere(W) {
    W.index = {};
    W.uebungen.forEach(function (e) { W.index[e.id] = e; });
    return W;
  }

  /* Kontext für Tausch/Agent: dieselben Regeln wie beim Erstellen */
  function kontext(W, kundeIn) {
    var k = JSON.parse(JSON.stringify(kundeIn));
    k.level = +k.level || 1;
    var scr = pruefeScreening(W, k);
    var gruppen = ermittleZielgruppen(W, k, scr.zielgruppen);
    var grenzen = einschraenkungen(W, k, gruppen, scr);
    k.level = Math.min(k.level, grenzen.levelMax);
    var ctx = { kunde: k, level: k.level, ausruestung: verfuegbareAusruestung(k), grenzen: grenzen, benutzt: {}, ausschluss: {}, liebling: {}, abdeckung: null,
      zielWdh: zielWdh(W, k, grenzen), ag: alterGrenzen(W, k.alter) };
    arr(k.ausschluss_ids).forEach(function (id) { ctx.ausschluss[id] = true; });
    return ctx;
  }

  var API = {
    indexiere: indexiere,
    erstellePlan: erstellePlan,
    kontext: kontext,
    alternativen: function (W, kunde, id) { return alternativen(W, kontext(W, kunde), W.index[id]); },
    pruefeUebung: function (W, kunde, id) { return uebungErlaubt(W.index[id], kontext(W, kunde)); },
    intensitaet: function (W, kunde, id) { var c = kontext(W, kunde); return intensitaet(W, c.kunde, c.grenzen, W.index[id]); },
    pruefeQualitaet: pruefeQualitaet,
    abbruchRegeln: abbruchRegeln,
    alterHinweise: alterHinweise,
    alterGrenzen: alterGrenzen,
    ernaehrung: ernaehrung,
    ernaehrungFuer: ernaehrungFuer,
    // eigene Pläne und Vorlagen
    satzGrenze: function (W, kunde) { return satzGrenze(W, kontext(W, kunde)); },
    krafttageGrenze: function (W, kunde) { return krafttageGrenze(W, kontext(W, kunde)); },
    planUebung: function (W, kunde, u) { return planUebung(W, kontext(W, kunde), u); },
    erlaubteUebungen: function (W, kunde) { var c = kontext(W, kunde); return W.uebungen.filter(function (e) { return uebungErlaubt(e, c).length === 0; }); },
    planNachrechnen: planNachrechnen,
    vorlageAusPlan: vorlageAusPlan,
    planAusVorlage: planAusVorlage,
    startVorlagen: startVorlagen,
    maschinenUebung: maschinenUebung,
    LEICHTER_TAG: LEICHTER_TAG,
    frageAktiv: frageAktiv,
    bmi: bmi,
    muskelLesbar: muskelLesbar,
    musterLesbar: musterLesbar,
    LEVEL_NAME: LEVEL_NAME
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DKEngine = API;
})(this);
