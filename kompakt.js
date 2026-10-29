/* DK Coach — Plan → kurzer Link für die Kunden-App.
 * Wird in die Trainer-Seite (app/build.js) und in Tests (Node) eingebunden. Kein Modul-Syntax, damit es überall läuft.
 * Format v1: { v, id, n, z, l, s, d, w:[e|a|d], ft:[0–6], t:[{n, m?, a?:{d, u:[[name, dosis]]}, u:[{i,s,w,r,p,e?,j?,x?,nm?}]}], pr, dl, h:[], ab:[], sh, ki }
 * ft = feste Trainingstage (0 = Montag), m = Dauer in min, a = Aufwärmen, j = je Seite. Ältere Links ohne diese Felder gehen weiter.
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
    return {
      v: 1,
      id: kundenId(kunde),
      n: kunde.name || '',
      z: p.kunde && p.kunde.ziel,
      l: p.kunde && p.kunde.level,
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

  /* ---------- App-Zugang (29.10.2026): Link + 8-stelliger Code ----------
   * Der Link trägt Name, Laufzeit und Plan verschlüsselt (#z=…), der Code ist der Schlüssel: PBKDF2 (SHA-256) → AES-GCM.
   * Ohne Code ist der Link wertlos. Dasselbe Verfahren für die Analyse, die der Kunde zurückschickt (DK-Analyse:…:Ende).
   * Aufbau: 1 Byte Art (1 = deflate-raw, 0 = roh; als AAD mitgeprüft) | 16 Byte Salz | 12 Byte IV | Geheimtext */
  var APP_RUNDEN = 250000;
  function zufall(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function appCodeNeu() {   // 8 Ziffern, gleich verteilt (nur Bytes unter 250)
    var s = '';
    while (s.length < 8) { var a = zufall(16); for (var i = 0; i < a.length && s.length < 8; i++) if (a[i] < 250) s += a[i] % 10; }
    return s.slice(0, 4) + '-' + s.slice(4);
  }
  function appCodeNormal(c) { return String(c || '').replace(/\D/g, ''); }
  function appCodeGueltig(c) { return appCodeNormal(c).length === 8; }
  function appCodeAnzeige(c) { var n = appCodeNormal(c); return n.slice(0, 4) + '-' + n.slice(4, 8); }
  function strom(bytes, Art) {   // Art = CompressionStream oder DecompressionStream
    return new Response(new Blob([bytes]).stream().pipeThrough(new Art('deflate-raw'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
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

  /* ---------- Analyse vom Kunden (29.10.2026) ----------
   * Der Kunde füllt in der App die Anamnese (ohne Trainer-Felder) und den Gesundheits-Check aus und schickt beides verschlüsselt an Devin.
   * Übernehmen: nur bekannte Felder mit passenden Werten. Gesundheit nur strenger: ein Ja oder „Weiß nicht“ bleibt,
   * Beschwerden und Zielgruppen kommen nur dazu. Level, ärztliche Freigabe und Eltern-Einwilligung setzt nur Devin. */
  var NUR_TRAINER = ['level', 'notizen_coach'];
  var ZG_NUR_TRAINER = ['einsteiger_erwachsene', 'frauen'];   // ergeben sich aus Erfahrung und Geschlecht, hakt Devin an
  function nurTrainer(f) { return NUR_TRAINER.indexOf(f.id) >= 0 || /nur für Devin|trägt Devin/.test(f.label || ''); }
  function analyseAbschnitte(abschnitte) {
    return (abschnitte || []).map(function (a) { return { id: a.id, titel: a.titel, felder: (a.felder || []).filter(function (f) { return !nurTrainer(f); }) }; })
      .filter(function (a) { return a.felder.length; });
  }
  function istJa(v) { return v === true || v === 'weiss_nicht'; }
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
      return liste.length ? liste : ex != null ? [ex] : undefined;
    }
    return undefined;
  }
  // wissen = { abschnitte (Anamnese), screening (Fragen), zielgruppen (ids) }
  function analyseUebernehmen(k, antwort, wissen) {
    var r = { felder: 0, gesundheit: 0, strenger: 0 };
    var a = (antwort && antwort.a) || {}, s = (antwort && antwort.s) || {}, hat = Object.prototype.hasOwnProperty;
    analyseAbschnitte(wissen.abschnitte).forEach(function (ab) {
      ab.felder.forEach(function (f) {
        if (!hat.call(a, f.id) || (f.id === 'name' && k.name)) return;   // den Namen hat Devin schon eingetragen
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
    k.analyse = { am: new Date(+antwort.t || Date.now()).toISOString(), felder: r.felder, gesundheit: r.gesundheit };
    return r;
  }

  var API = { planKompakt: planKompakt, planCode: planCode, base64url: base64url, kundenId: kundenId,
    appCodeNeu: appCodeNeu, appCodeNormal: appCodeNormal, appCodeGueltig: appCodeGueltig, appCodeAnzeige: appCodeAnzeige,
    verpacken: verpacken, entpacken: entpacken, analyseAbschnitte: analyseAbschnitte, analyseUebernehmen: analyseUebernehmen,
    ZG_NUR_TRAINER: ZG_NUR_TRAINER };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DKKompakt = API;
})(this);
