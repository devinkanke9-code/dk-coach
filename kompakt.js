/* DK Coach — Plan → kurzer Link für die Kunden-App.
 * Wird in die Trainer-Seite (app/build.js) und in Tests (Node) eingebunden. Kein Modul-Syntax, damit es überall läuft.
 * Format v1: { v, id, n, z, l, s, d, w:[e|a|d], ft:[0–6], t:[{n, m?, a?:{d, u:[[name, dosis]]}, u:[{i,s,w,r,p,e?,j?,x?,nm?}]}], pr, dl, h:[], ab:[], sh, ki }
 * ft = feste Trainingstage (0 = Montag), m = Dauer in min, a = Aufwärmen, j = je Seite. Ältere Links ohne diese Felder gehen weiter.
 * Seit 13.11.2026 (Pläne bei Schmerzen, Schritt 6): bs = Beschwerden des Plans (Namen der Beschwerde-Arten, sonst die Beschwerden), u.b = [[Nummer in bs, Grund]]:
 * wofür der Generator die Übung wegen einer Beschwerde angepasst hat („Angepasst wegen …“). Ist bs da, fragt die App nach dem Training nach den Schmerzen.
 * Seit 14.11.2026 (Vorlieben): u.y = [Grund, …] „Angepasst an dich“ (Lieblingsübung, statt einer Übung, die er nicht mag). Nur Text, ändert an der Übung nichts,
 * fragt nicht nach Schmerzen (dafür ist bs da). Ältere Apps lassen das Feld weg.
 * Seit 29.10.2026 dazu der App-Zugang (Link + Code, verschlüsselt) und die Analyse, die der Kunde zurückschickt (unten).
 */
(function (root) {
  'use strict';
  var TAGE = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  function kundenId(kunde) { return 'k' + String(kunde.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16); }
  function planKompakt(kunde, plan) {
    var p = plan;
    var phase = { einstieg: 'e', aufbau: 'a', deload: 'd' };
    var h = [].concat(p.hinweise || []);
    (p.alter_hinweise || []).forEach(function (a) { (a.texte || a.hinweise || []).forEach(function (t) { h.push(t); }); });
    var arten = p.beschwerde_arten || [];
    var bs = arten.map(function (a) { return a.name || a.id; });
    if (!bs.length) bs = ((p.kunde && p.kunde.beschwerden) || []).filter(function (b) { return b && b !== 'keine'; });
    var aus = {
      v: 1,
      id: kundenId(kunde),
      n: kunde.name || '',
      z: p.kunde && p.kunde.ziel,
      l: p.kunde && p.kunde.level,
      m: p.bestleistung_min_wdh,
      s: p.split && (p.split.name || p.split.id),
      d: (p.erstellt || new Date().toISOString()).slice(0, 10),
      w: (p.wochen || []).map(function (w) { return phase[w.phase] || 'a'; }),
      ft: [].concat(kunde.feste_tage || []).map(function (x) { return TAGE.indexOf(x); }).filter(function (i) { return i >= 0; }),
      t: (p.tage || []).map(function (t) {
        var aw = t.aufwaermen;
        return { n: t.name, m: t.dauer_min || undefined,
          a: aw && (aw.uebungen || []).length ? { d: aw.dauer_min, u: aw.uebungen.map(function (x) { return [x.name, x.dosis || '']; }) } : undefined,
          u: (t.uebungen || []).map(function (u) {
          var o = { i: u.id, s: u.saetze, w: u.wdh, r: u.rir, p: u.pause };
          if (u.einheit === 'sek') o.e = 'sek';
          if (u.einseitig) o.j = 1;
          if (u.notiz) o.x = u.notiz;
          if (u.eigene || u.id === 'eigene' || /^eigen/.test(u.id || '')) o.nm = u.name;
          if (u.fuer_dich && u.fuer_dich.length) o.y = u.fuer_dich.slice(0, 2).map(function (x) { return String(x && x.grund || ''); }).filter(Boolean);
          if (o.y && !o.y.length) delete o.y;
          if (u.angepasst && u.angepasst.length) o.b = u.angepasst.slice(0, 4).map(function (x) { var i = -1; arten.forEach(function (a, j) { if (i < 0 && a.id === x.art) i = j; }); return [Math.max(0, i), x.grund]; });
          return o;
        }) };
      }),
      pr: p.progression && p.progression.regel,
      dl: p.deload && p.deload.wie,
      h: h,
      ab: (p.abbruch || []).slice(0, 12),
      ar: (p.abbruch_regeln || []).map(function (r) { return { t: r.titel, x: r.text }; }),
      sh: p.sicherheit || '',
      ki: p.ki_text && p.ki_text.einleitung || ''
    };
    if (bs.length) aus.bs = bs;
    var nw = ernaehrungKompakt(p.ernaehrung, kunde); if (nw) aus.e = nw;   // Nährwerte für App und Status (23.11.2026)
    return aus;
  }
  function base64url(bytes) {
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  // Browser: komprimiert mit deflate-raw, sonst unkomprimiert ('j')
  function planCode(kompakt) {
    var json = JSON.stringify(kompakt);
    var bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream === 'undefined') return Promise.resolve('j' + base64url(bytes));
    var strom = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Response(strom).arrayBuffer().then(function (buf) { return 'z' + base64url(new Uint8Array(buf)); });
  }
  function vonBase64url(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b;
  }

  /* ---------- App-Zugang (29.10.2026): Link + Code, seit 13.11.2026 mit 12 Ziffern ----------
   * Der Link trägt Name, Laufzeit und Plan verschlüsselt (#z=…), der Code ist der Schlüssel: PBKDF2 (SHA-256) → AES-GCM.
   * Ohne Code lässt sich der Link nicht einfach lesen. 8 Ziffern ließen sich mit genug Rechenzeit durchprobieren, darum bekommen neue Codes 12 Ziffern
   * (1234-5678-9012). Alte 8-stellige Codes gelten weiter: Schlüssel und Prüfsumme entstehen wie bisher nur aus den Ziffern.
   * Dasselbe Verfahren für die Analyse, die der Kunde zurückschickt (DK-Analyse:…:Ende).
   * Aufbau: 1 Byte Art (1 = deflate-raw, 0 = roh; als AAD mitgeprüft) | 16 Byte Salz | 12 Byte IV | Geheimtext */
  var APP_RUNDEN = 250000;
  var APP_STELLEN = 12;          // neue Codes
  var APP_STELLEN_ALT = 8;       // Codes von vor dem 13.11.2026, gehen weiter
  function zufall(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function appCodeNormal(c) { return String(c || '').replace(/\D/g, ''); }
  function appCodeAnzeige(c) { var n = appCodeNormal(c); return n.length > 8 ? n.slice(0, 4) + '-' + n.slice(4, 8) + '-' + n.slice(8, 12) : n.slice(0, 4) + '-' + n.slice(4, 8); }
  function appCodeNeu(vergeben) {   // 12 Ziffern, gleich verteilt (nur Bytes unter 250); vergeben: Codes, die schon ein Kunde hat (kommt keiner doppelt vor)
    var schon = {};
    (vergeben || []).forEach(function (c) { var n = appCodeNormal(c); if (n) schon[n] = true; });
    for (var runde = 0; runde < 100; runde++) {
      var s = '';
      while (s.length < APP_STELLEN) { var a = zufall(32); for (var i = 0; i < a.length && s.length < APP_STELLEN; i++) if (a[i] < 250) s += a[i] % 10; }
      if (!schon[s]) return appCodeAnzeige(s);
    }
    throw new Error('kein freier Code');
  }
  function appCodeGueltig(c) { var l = appCodeNormal(c).length; return l === APP_STELLEN || l === APP_STELLEN_ALT; }
  var GRENZE = 4000000;   // größer ist kein echter Plan: Ein gefälschter Link soll das Handy nicht volllaufen lassen
  function strom(bytes, Art) {   // Art = CompressionStream oder DecompressionStream
    var leser = new Blob([bytes]).stream().pipeThrough(new Art('deflate-raw')).getReader(), teile = [], n = 0;
    function weiter() {
      return leser.read().then(function (r) {
        if (r.done) { var aus = new Uint8Array(n), p = 0; teile.forEach(function (t) { aus.set(t, p); p += t.length; }); return aus; }
        n += r.value.length;
        if (n > GRENZE) { leser.cancel(); throw new Error('zu groß'); }
        teile.push(r.value);
        return weiter();
      });
    }
    return weiter();
  }
  function appSchluessel(code, salz) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(appCodeNormal(code)), 'PBKDF2', false, ['deriveKey']).then(function (basis) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salz, iterations: APP_RUNDEN, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function verpacken(code, daten) {
    var roh = new TextEncoder().encode(JSON.stringify(daten));
    var art = typeof CompressionStream === 'undefined' ? 0 : 1;
    var salz = zufall(16), iv = zufall(12);
    return Promise.all([art ? strom(roh, CompressionStream) : roh, appSchluessel(code, salz)]).then(function (r) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new Uint8Array([art]) }, r[1], r[0]);
    }).then(function (c) {
      var g = new Uint8Array(c), alles = new Uint8Array(29 + g.length);
      alles[0] = art; alles.set(salz, 1); alles.set(iv, 17); alles.set(g, 29);
      return base64url(alles);
    });
  }
  function entpacken(code, text) {   // scheitert bei falschem Code oder kaputtem Link
    return Promise.resolve().then(function () {
      var b = vonBase64url(text);
      if (b.length < 46 || b[0] > 1) throw new Error('kaputt');
      return appSchluessel(code, b.slice(1, 17)).then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(17, 29), additionalData: b.slice(0, 1) }, key, b.slice(29));
      }).then(function (roh) { roh = new Uint8Array(roh); return b[0] ? strom(roh, DecompressionStream) : roh; });
    }).then(function (roh) { return JSON.parse(new TextDecoder().decode(roh)); });
  }

  /* ---------- Plan aus einem Link prüfen (Sicherheitsprüfung 4.11.2026) ----------
   * Ein Link kann gefälscht sein: Durch kommt nur, was die Form eines echten Plans hat. Angezeigt wird ohnehin nur als Text,
   * hier geht es darum, dass falsche Typen die App nicht abstürzen lassen und riesige Zahlen sie nicht lahmlegen.
   * Neues Feld in planKompakt? Dann auch hier eintragen, sonst stoppt kunden-app/sicherheit-pruefen.js das Veröffentlichen. */
  function idOk(v) { return typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(v) && !(v in {}); }
  function text(v, n) { return typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' && isFinite(v) ? String(v) : ''; }
  function liste(v, n) { return Array.isArray(v) ? v.slice(0, n) : []; }
  function texte(v, n, l) { return liste(v, n).filter(function (x) { return typeof x === 'string'; }).map(function (x) { return x.slice(0, l); }); }
  function zahl(v, von, bis) { return typeof v === 'number' && isFinite(v) ? Math.min(bis, Math.max(von, v)) : undefined; }
  function zahlen(v, von, bis) {   // Wiederholungen, RIR, Pause: [von, bis]
    var a = liste(Array.isArray(v) ? v : [v], 4).map(function (x) { return zahl(x, von, bis); }).filter(function (x) { return x !== undefined; });
    return a.length ? a : undefined;
  }
  function datum(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''; }
  /* ---------- Nährwerte im Plan (23.11.2026, Feld e) ----------
   * Für „Deine Nährwerte“ in der App und für Status (neues Gewicht → neue Werte). Nur, wenn die Rechnung Zahlen gibt (keine Sperre wie Essstörung).
   * Kein Alter, keine Größe, kein Geschlecht: jk sagt, wie sich das Kalorienziel je kg ändert. Kurze Schlüssel wie im übrigen Plan:
   *   v 1 · kc Kalorienziel kcal/Tag · er Bedarf (Erhaltung) · ar d|p|e (Defizit, Plus, Erhaltung) · rk 1 = „Bedarf statt Plus“ · jk kcal je kg Gewicht
   *   ew [g, g] Eiweiß pro Tag · ek [g/kg, g/kg] Eiweiß je kg Bezugsgewicht · eb Bezugsgewicht Eiweiß (bei Übergewicht kleiner als kg) · ft Fett g · fm Fett mindestens g
   *   kh Kohlenhydrate g · tr Trinken ml (Mindestmenge) · kg Gewicht der Analyse · sc [[id, Text], …] die 2 ersten Schritte
   *   hd { e, g, k, f, m, a } Hand-Portionen pro Mahlzeit (Eiweiß, Gemüse, Kohlenhydrate, Fett, Mahlzeiten am Tag, Satz zum Anpassen), nur für alle, die nicht zählen */
  function ernaehrungKompakt(er, kunde) {
    if (!er || er.status !== 'zahlen' || !er.kalorien || !er.kalorien.ziel) return undefined;
    var k = er.kalorien, e = { v: 1, kc: k.ziel, er: k.erhaltung, ar: k.art === 'defizit' ? 'd' : k.art === 'plus' ? 'p' : 'e' };
    if (k.rekomposition) e.rk = 1;
    if (typeof k.je_kg === 'number') e.jk = k.je_kg;
    if (er.eiweiss) { e.ew = er.eiweiss.g_tag; e.ek = er.eiweiss.g_pro_kg; e.eb = er.eiweiss.bezug_kg; }
    if (er.fett_g) e.ft = er.fett_g;
    if (er.fett_min_g) e.fm = er.fett_min_g;
    if (er.kohlenhydrate_g) e.kh = er.kohlenhydrate_g;
    if (er.trinken_ml) e.tr = er.trinken_ml;
    if (+kunde.gewicht_kg) e.kg = +kunde.gewicht_kg;
    if ((er.schritte || []).length) e.sc = er.schritte.slice(0, 2).map(function (s) { return [s.id, s.text]; });
    if (er.hand && er.hand.pro_mahlzeit) { var p = er.hand.pro_mahlzeit; e.hd = { e: p.eiweiss, g: p.gemuese, k: p.kohlenhydrate, f: p.fett, m: er.hand.mahlzeiten }; if (er.hand.anpassen) e.hd.a = er.hand.anpassen; }
    return e;
  }
  function ernaehrungSauber(e) {   // Feld e beim Einlesen in der App: nur Zahlen in sinnvollen Grenzen, Texte begrenzt, sonst weg
    if (!e || typeof e !== 'object' || e.v !== 1 || typeof e.kc !== 'number' || !(e.kc >= 800 && e.kc <= 8000)) return undefined;
    var aus = { v: 1, kc: Math.round(e.kc) };
    var paar = function (x, von, bis) { return Array.isArray(x) && x.length === 2 && x.every(function (y) { return typeof y === 'number' && isFinite(y) && y >= von && y <= bis; }) && x[0] <= x[1] ? [x[0], x[1]] : undefined; };
    if (typeof e.er === 'number' && e.er >= 800 && e.er <= 8000) aus.er = Math.round(e.er);
    if (e.ar === 'd' || e.ar === 'p' || e.ar === 'e') aus.ar = e.ar;
    if (e.rk === 1) aus.rk = 1;
    if (typeof e.jk === 'number' && e.jk >= 0 && e.jk <= 100) aus.jk = Math.round(e.jk * 10) / 10;
    var ew = paar(e.ew, 0, 600), ek = paar(e.ek, 0, 4);
    if (ew) aus.ew = ew;
    if (ek) aus.ek = ek;
    var kgOk = function (v) { return typeof v === 'number' && v >= 20 && v <= 400; };   // Reihenfolge wie in ernaehrungKompakt
    if (kgOk(e.eb)) aus.eb = Math.round(e.eb * 10) / 10;
    ['ft', 'fm', 'kh'].forEach(function (s) { if (typeof e[s] === 'number' && e[s] > 0 && e[s] <= 1500) aus[s] = Math.round(e[s]); });
    if (typeof e.tr === 'number' && e.tr > 0 && e.tr <= 8000) aus.tr = Math.round(e.tr);
    if (kgOk(e.kg)) aus.kg = Math.round(e.kg * 10) / 10;
    if (Array.isArray(e.sc)) {
      var sc = e.sc.slice(0, 2).filter(function (x) { return Array.isArray(x) && typeof x[0] === 'string' && /^[a-z_]{2,30}$/.test(x[0]) && typeof x[1] === 'string' && x[1]; }).map(function (x) { return [x[0], x[1].slice(0, 300)]; });
      if (sc.length) aus.sc = sc;
    }
    if (e.hd && typeof e.hd === 'object') {
      var hd = {};
      ['e', 'g', 'k', 'f'].forEach(function (s) { if (typeof e.hd[s] === 'number' && e.hd[s] >= 0 && e.hd[s] <= 6) hd[s] = e.hd[s]; });
      if (Number.isInteger(e.hd.m) && e.hd.m >= 1 && e.hd.m <= 8) hd.m = e.hd.m;
      if (typeof e.hd.a === 'string' && e.hd.a) hd.a = e.hd.a.slice(0, 300);
      if (['e', 'g', 'k', 'f'].every(function (s) { return s in hd; })) aus.hd = hd;
    }
    return aus;
  }
  function planSauber(p) {
    if (!p || typeof p !== 'object' || p.v !== 1 || !Array.isArray(p.t) || !p.t.length) return null;
    if (!p.t.every(function (t) { return t && typeof t === 'object' && Array.isArray(t.u); })) return null;
    var aus = {
      v: 1, n: text(p.n, 120), z: text(p.z, 60), l: typeof p.l === 'number' ? zahl(p.l, 0, 9) : text(p.l, 20), m: Number.isInteger(p.m) ? zahl(p.m, 1, 15) : undefined, s: text(p.s, 120), d: datum(p.d),
      w: liste(p.w, 104).filter(function (x) { return x === 'e' || x === 'a' || x === 'd'; }),
      ft: liste(p.ft, 7).filter(function (x) { return x === Math.floor(x) && x >= 0 && x < 7; }),
      t: p.t.slice(0, 14).map(function (t) {
        var tag = { n: text(t.n, 200), m: zahl(t.m, 0, 600), u: t.u.slice(0, 40).filter(function (u) { return u && typeof u === 'object'; }).map(function (u) {
          var o = { i: typeof u.i === 'string' && idOk(u.i) ? u.i : 'eigene', s: Math.round(zahl(u.s, 1, 20) || 1), w: zahlen(u.w, 0, 1000), r: zahlen(u.r, -1, 20), p: zahlen(u.p, 0, 3600) };
          if (u.e === 'sek') o.e = 'sek';
          if (u.j) o.j = 1;
          if (u.x) o.x = text(u.x, 400);
          if (u.nm) o.nm = text(u.nm, 160);
          if (Array.isArray(u.b)) {   // „Angepasst wegen …“: Nummer der Beschwerde in bs und Grund, nur als Text
            var nb = Array.isArray(p.bs) ? Math.min(p.bs.length, 8) : 0;
            var ang = u.b.slice(0, 4).filter(function (x) { return Array.isArray(x) && x[0] === Math.floor(x[0]) && x[0] >= 0 && x[0] < nb && typeof x[1] === 'string' && x[1]; }).map(function (x) { return [x[0], text(x[1], 300)]; });
            if (ang.length) o.b = ang;
          }
          if (Array.isArray(u.y)) {   // „Angepasst an dich“ (14.11.2026): nur Texte
            var y = u.y.slice(0, 2).filter(function (x) { return typeof x === 'string' && x; }).map(function (x) { return text(x, 200); }).filter(Boolean);
            if (y.length) o.y = y;
          }
          if (Array.isArray(u.a)) {   // sichere Ersatzübungen aus der Trainer-Seite (engine.js → wechselDaten)
            var ers = u.a.slice(0, 8).filter(function (x) { return x && typeof x === 'object' && typeof x.i === 'string' && idOk(x.i); }).map(function (x) {
              var e = { i: x.i, w: zahlen(x.w, 0, 1000), r: zahlen(x.r, -1, 20), p: zahlen(x.p, 0, 3600) };
              if (x.e === 'sek') e.e = 'sek';
              if (x.j) e.j = 1;
              return e;
            });
            if (ers.length) { o.a = ers; var rt = Math.min(ers.length, Math.round(zahl(u.rt, 0, 8) || 0)); if (rt) o.rt = rt; }
          }
          return o;
        }) };
        if (t.a && typeof t.a === 'object') tag.a = { d: zahl(t.a.d, 0, 120), u: liste(t.a.u, 30).filter(Array.isArray).map(function (x) { return [text(x[0], 200), text(x[1], 120)]; }) };
        return tag;
      }),
      pr: text(p.pr, 6000), dl: text(p.dl, 6000), h: texte(p.h, 60, 1500), ab: texte(p.ab, 40, 600),
      ar: liste(p.ar, 40).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) { return { t: text(r.t, 200), x: text(r.x, 3000) }; }),
      sh: text(p.sh, 6000), ki: text(p.ki, 6000)
    };
    if (idOk(p.id)) aus.id = p.id;
    if (datum(p.importiert)) aus.importiert = datum(p.importiert);
    if (Array.isArray(p.wf)) { var wf = texte(p.wf, 8, 200); if (wf.length) aus.wf = wf; }
    if (Array.isArray(p.bs)) { var bs = liste(p.bs, 8).map(function (x) { return typeof x === 'string' ? x.slice(0, 120) : ''; }); if (bs.some(Boolean)) aus.bs = bs; }
    var nw = ernaehrungSauber(p.e); if (nw) aus.e = nw;   // Nährwerte (23.11.2026)
    return aus;
  }

  /* ---------- Analyse vom Kunden (29.10.2026) ----------
   * Der Kunde füllt in der App die Anamnese (ohne Trainer-Felder) und den Gesundheits-Check aus und schickt beides verschlüsselt an Devin.
   * Übernehmen: nur bekannte Felder mit passenden Werten. Gesundheit nur strenger: ein Ja oder „Weiß nicht“ bleibt,
   * Beschwerden und Zielgruppen kommen nur dazu. Level, ärztliche Freigabe und Eltern-Einwilligung setzt nur Devin.
   * Seit 06.11.2026 auch die Seite „Analyse für dich“ in Fassung 11 (Grunddaten, bis zu 5 Ziele, Gesundheits-Check, Einwilligung):
   * Name, Alter und Geschlecht nur, solange Devin noch nichts eingetragen hat (grunddaten_offen), und gesundheit_offen sperrt den Plan,
   * bis jede Frage beantwortet ist, die für diesen Kunden gilt. */
  var NUR_TRAINER = ['level', 'notizen_coach', 'schwerpunkt', 'saetze_max'];   // schwerpunkt seit 01.11.2026: setzt Devin, nie der Kunde
  var ZG_NUR_TRAINER = ['einsteiger_erwachsene', 'frauen'];   // ergeben sich aus Erfahrung und Geschlecht, hakt Devin an
  var GRUND = ['name', 'alter', 'geschlecht'];   // davon hängen Eltern-Einwilligung und die Fragen nur für Frauen ab
  function nurTrainer(f) { return NUR_TRAINER.indexOf(f.id) >= 0 || /nur für Devin|trägt Devin/.test(f.label || ''); }
  function analyseAbschnitte(abschnitte) {
    return (abschnitte || []).map(function (a) { return { id: a.id, titel: a.titel, felder: (a.felder || []).filter(function (f) { return !nurTrainer(f); }) }; })
      .filter(function (a) { return a.felder.length; });
  }
  function istJa(v) { return v === true || v === 'weiss_nicht'; }
  // Wie frageAktiv in engine.js: Folgefragen nur nach Ja oder „Weiß nicht“, Fragen nur für Frauen nur bei weiblich
  function frageAktiv(k, f) {
    var n = f.nur_wenn;
    if (!n) return true;
    if (n.frage_ja && !istJa((k.screening || {})[n.frage_ja])) return false;
    if (n.geschlecht && !(n.geschlecht === 'w' ? k.geschlecht === 'weiblich' : k.geschlecht === 'maennlich')) return false;
    return true;
  }
  function checkOffen(k, screening) { return (screening || []).filter(function (f) { return frageAktiv(k, f) && (k.screening || {})[f.id] === undefined; }).length; }
  function zeitOk(t) { t = +t; return t > 1e12 && t < 1e14 ? t : Date.now(); }   // 2001 bis 5138: alles andere ist kein echter Zeitpunkt (und toISOString stürzte ab)
  function feldWert(f, v) {   // undefined = nicht übernehmen
    if (v == null || v === '') return undefined;
    if (f.typ === 'text' || f.typ === 'lang') { var s = String(v).trim().slice(0, f.typ === 'lang' ? 2000 : 300); return s || undefined; }
    if (f.typ === 'zahl') { var n = Number(v); return !isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max) ? undefined : n; }
    if (f.typ === 'ja_nein') return v === true || v === false ? v : undefined;
    var opts = f.optionen || [];
    var finde = function (x) { for (var i = 0; i < opts.length; i++) if (String(opts[i].wert) === String(x)) return opts[i]; return null; };
    if (f.typ === 'auswahl') { var o = finde(v); return o ? o.wert : undefined; }
    if (f.typ === 'mehrfach') {   // „Keine“ (exklusiv) nur, wenn sonst nichts gewählt ist
      var liste = [], ex = null;
      [].concat(v).forEach(function (x) { var o = finde(x); if (!o) return; if (o.exklusiv) ex = o.wert; else if (liste.indexOf(o.wert) < 0) liste.push(o.wert); });
      if (f.max_wahl > 0 && liste.length > f.max_wahl) liste = liste.slice(0, f.max_wahl);   // Höchstzahl (z. B. Wunsch-Muskeln, 24.11.2026)
      return liste.length ? liste : ex != null ? [ex] : undefined;
    }
    return undefined;
  }
  // wissen = { abschnitte (Anamnese), screening (Fragen), zielgruppen (ids) }
  function analyseUebernehmen(k, antwort, wissen) {
    var r = { felder: 0, gesundheit: 0, strenger: 0 };
    var a = (antwort && antwort.a) || {}, s = (antwort && antwort.s) || {}, hat = Object.prototype.hasOwnProperty;
    var v11 = !!antwort && antwort.v === 11, grundFrei = v11 && !!k.grunddaten_offen, zeit = zeitOk(antwort && antwort.t);
    analyseAbschnitte(wissen.abschnitte).forEach(function (ab) {
      ab.felder.forEach(function (f) {
        // Name, Alter und Geschlecht, die Devin schon eingetragen hat, ändert keine Kundennachricht: Davon hängen Eltern-Einwilligung und Gesundheitsfragen ab.
        // Ausnahme Fassung 11: Der Kunde kommt frisch aus dem Eingang (grunddaten_offen), Devin hat noch nichts eingetragen, die Analyse bringt die Grunddaten selbst mit.
        if (!hat.call(a, f.id) || (GRUND.indexOf(f.id) >= 0 && !grundFrei && k[f.id] != null && k[f.id] !== '')) return;
        var v = feldWert(f, a[f.id]);
        if (v === undefined) return;
        if (f.id === 'beschwerden') {
          var alt = [].concat(k.beschwerden || []).filter(function (x) { return x !== 'keine'; });
          var neu = v.filter(function (x) { return x !== 'keine'; });
          alt.forEach(function (x) { if (neu.indexOf(x) < 0) { neu.push(x); r.strenger++; } });
          if (neu.length) v = neu;
        }
        k[f.id] = v; r.felder++;
      });
    });
    k.screening = k.screening || {};
    (wissen.screening || []).forEach(function (f) {
      if (!hat.call(s, f.id)) return;
      var v = s[f.id];
      if (v !== true && v !== false && v !== 'weiss_nicht') return;
      if (v === false && istJa(k.screening[f.id])) { r.strenger++; return; }
      k.screening[f.id] = v; r.gesundheit++;
    });
    var bekannt = (wissen.zielgruppen || []).filter(function (id) { return ZG_NUR_TRAINER.indexOf(id) < 0; });
    [].concat((antwort && antwort.zg) || []).forEach(function (id) {
      if (bekannt.indexOf(id) >= 0 && [].concat(k.zielgruppen || []).indexOf(id) < 0) k.zielgruppen = [].concat(k.zielgruppen || [], [id]);
    });
    r.offen = checkOffen(k, wissen.screening);
    if (v11) {
      // Grunddaten vollständig: ab jetzt ändert sie keine Nachricht mehr (wie bei allem, was Devin selbst einträgt)
      if (grundFrei && GRUND.every(function (id) { return k[id] != null && k[id] !== ''; })) delete k.grunddaten_offen;
      // Offener Check sperrt den Plan. Gelöscht wird die Marke nie: Bei vollständigem Check sperrt sie nichts, eine spätere Folgefrage bleibt so aber Pflicht.
      if (r.offen) k.gesundheit_offen = true;
      // Einwilligung nur festhalten. eltern_einwilligung (schriftlich, für die Engine) setzt weiter nur Devin.
      var e = (antwort && antwort.e) || {};
      if (e.einwilligung === true) k.einwilligung = e.eltern === true ? { am: new Date(zeit).toISOString(), eltern: true } : { am: new Date(zeit).toISOString() };
    }
    var vorher = k.analyse || {};   // kommt danach nur der Gesundheits-Check (App-Link a: 3), bleibt die Zahl der Angaben stehen
    k.analyse = { am: new Date(zeit).toISOString(), felder: r.felder || vorher.felder || 0, gesundheit: r.gesundheit || vorher.gesundheit || 0 };
    return r;
  }

  /* ---------- Analyse von der Seite „Analyse für dich“ (31.10.2026, Fassung 11 seit 06.11.2026) ----------
   * Fassung 10: die 10 Antworten per WhatsApp als lesbarer Text plus Zeile DK-Analyse10:…:Ende (JSON, base64url, nicht verschlüsselt: kein Code, kein Name).
   * Fassung 11: erst „Über dich“ (g), dann bis zu 5 Ziele (a.ziele) und die Fragen (a), der Gesundheits-Check (s: ja, nein, unsicher) und die Einwilligung (e),
   *   per E-Mail an Devin (WhatsApp als zweiter Weg), Zeile DK-Analyse11:…:Ende. Kommt so heraus, wie analyseUebernehmen es nimmt: { v: 11, t, a, s, e },
   *   aus den Zielen wird ziel (das erste, für den Generator) und ziele_weitere. Ohne Einwilligung: null (dann keine Gesundheitsdaten übernehmen).
   * Hier nur lesen; übernommen wird wie jede Analyse mit analyseUebernehmen (nur bekannte Felder, gültige Werte).
   * Umbrüche und Leerzeichen im Code stören nicht: Mail-Programme und WhatsApp brechen lange Zeilen um. */
  var S_WERT = { ja: true, nein: false, unsicher: 'weiss_nicht' };
  var G_FELDER = ['name', 'alter', 'geschlecht', 'groesse_cm', 'gewicht_kg', 'beruf'];
  var NICHT_AUS_A = G_FELDER.concat(['ziel', 'ziele', 'ziele_weitere', 'mail', '__proto__', 'constructor', 'prototype']);   // Grunddaten nur aus g, Ziele nur aus der Liste
  function objekt(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function analyseSeiteLesen(text) {
    var m = /DK-Analyse(10|11):([A-Za-z0-9_-]+):Ende/.exec(String(text || '').replace(/\s+/g, ''));
    if (!m || m[2].length > 200000) return null;   // eine echte Analyse hat ein paar KB
    var d;
    try { d = JSON.parse(new TextDecoder().decode(vonBase64url(m[2]))); } catch (e) { return null; }
    if (!objekt(d) || !objekt(d.a) || d.v !== +m[1]) return null;
    if (d.v === 10) return { v: 10, t: zeitOk(d.t), a: d.a };
    if (!objekt(d.g) || !objekt(d.e) || d.e.einwilligung !== true) return null;
    var a = {}, s = {}, ziele = [], hat = Object.prototype.hasOwnProperty;
    Object.keys(d.a).forEach(function (id) { if (NICHT_AUS_A.indexOf(id) < 0) a[id] = d.a[id]; });
    G_FELDER.forEach(function (id) { if (hat.call(d.g, id)) a[id] = d.g[id]; });
    (Array.isArray(d.a.ziele) ? d.a.ziele : []).forEach(function (z) { if (typeof z === 'string' && z && ziele.indexOf(z) < 0 && ziele.length < 5) ziele.push(z); });
    if (ziele.length) a.ziel = ziele[0];
    if (ziele.length > 1) a.ziele_weitere = ziele.slice(1);
    if (objekt(d.s)) Object.keys(d.s).forEach(function (id) { if (/^[a-z0-9_]{1,60}$/.test(id) && id !== '__proto__' && typeof d.s[id] === 'string' && hat.call(S_WERT, d.s[id])) s[id] = S_WERT[d.s[id]]; });
    var r = { v: 11, t: zeitOk(d.t), a: a, s: s, e: d.e.eltern === true ? { einwilligung: true, eltern: true } : { einwilligung: true } };
    // E-Mail für den Zugang (22.11.2026, Senden-Knopf): Die Analyse kommt dann aus Devins eigenem Konto, die Adresse des Kunden steht hier (und im Reply-To). Nur gültig und klein geschrieben
    var mail = typeof d.g.mail === 'string' ? d.g.mail.trim().toLowerCase() : '';
    if (mail.length <= 120 && /^[^\s@<>()",;:\\]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(mail)) r.mail = mail;
    return r;
  }

  var API = { planKompakt: planKompakt, planCode: planCode, base64url: base64url, kundenId: kundenId,
    appCodeNeu: appCodeNeu, appCodeNormal: appCodeNormal, appCodeGueltig: appCodeGueltig, appCodeAnzeige: appCodeAnzeige,
    verpacken: verpacken, entpacken: entpacken, analyseAbschnitte: analyseAbschnitte, analyseUebernehmen: analyseUebernehmen,
    analyseSeiteLesen: analyseSeiteLesen, ZG_NUR_TRAINER: ZG_NUR_TRAINER, planSauber: planSauber, idOk: idOk,
    ausDeflate: function (b) { return strom(b, DecompressionStream); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DKKompakt = API;
})(this);
