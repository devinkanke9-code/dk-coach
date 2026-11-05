/* DK Akademie als eigene Web-App (lernen.html): holt die verschlüsselten Lektionen (inhalt.dkx), entschlüsselt sie mit dem
   Akademie-Code und startet die Akademie (akademie.js → DKAkademie.starte). Der Code kommt aus dem Link (#k=…) oder steht schon
   auf diesem Gerät. Er geht nie ans Netz: der #-Teil wird nicht an den Server geschickt, entschlüsselt wird im Browser.
   Format von inhalt.dkx (bauen.mjs): "DKX1" · Runden (4 Byte) · Salz (16) · IV (12) · AES-GCM-Daten. Schlüssel = PBKDF2-SHA-256. */
(function () {
  'use strict';
  var MERKEN = 'dkakademie_code';
  var ziel = document.getElementById('inhalt');

  function sauber(code) { return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function ausLink() { var m = location.hash.match(/[#&]k=([A-Za-z0-9-]+)/); return m ? sauber(m[1]) : ''; }
  function gemerkt() { try { return sauber(localStorage.getItem(MERKEN)); } catch (e) { return ''; } }
  function merken(code) { try { localStorage.setItem(MERKEN, code); } catch (e) {} }

  var datei = null;
  function laden() {
    if (!datei) datei = fetch('inhalt.dkx').then(function (r) { if (!r.ok) throw new Error('fehlt'); return r.arrayBuffer(); })
      .catch(function (e) { datei = null; throw e; });
    return datei;
  }
  function oeffnen(code) {
    return laden().then(function (buf) {
      var b = new Uint8Array(buf);
      if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'DKX1') throw new Error('format');
      var runden = new DataView(buf).getUint32(4), salz = b.slice(8, 24), iv = b.slice(24, 36), daten = b.slice(36);
      return crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveKey'])
        .then(function (basis) { return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salz, iterations: runden, hash: 'SHA-256' }, basis, { name: 'AES-GCM', length: 256 }, false, ['decrypt']); })
        .then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, daten); })
        .then(function (klar) { return JSON.parse(new TextDecoder().decode(klar)); }, function () { var e = new Error('code'); e.falscherCode = true; throw e; });
    });
  }
  function el(tag, attrs, text) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }

  function schloss(meldung) {
    ziel.textContent = '';
    var box = el('section', { class: 'ak-hero ak-schloss' });
    box.appendChild(el('span', { class: 'ak-eyebrow' }, 'DK Akademie'));
    box.appendChild(el('h1', { class: 'ak-titel' }, 'Dein Akademie-Code'));
    box.appendChild(el('p', { class: 'ak-ziel' }, 'Die Lektionen sind verschlüsselt. Gib einmal deinen Code ein, danach merkt sich dieses Gerät ihn.'));
    var feld = el('input', { class: 'eingabe', id: 'ak-code', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'XXXX-XXXX-XXXX-XXXX', 'aria-label': 'Akademie-Code' });
    var fehler = el('p', { class: 'fehler', role: 'alert' }, meldung || '');
    var knopf = el('button', { class: 'knopf haupt', type: 'button' }, 'Öffnen');
    function los() {
      var code = sauber(feld.value);
      if (code.length < 8) { fehler.textContent = 'Der Code ist zu kurz.'; feld.focus(); return; }
      knopf.disabled = true; knopf.textContent = 'Prüfe …'; fehler.textContent = '';
      versuchen(code, true);
    }
    knopf.addEventListener('click', los);
    feld.addEventListener('keydown', function (e) { if (e.key === 'Enter') los(); });
    box.appendChild(feld); box.appendChild(knopf); box.appendChild(fehler);
    ziel.appendChild(box);
  }
  function versuchen(code, vonHand) {
    if (!vonHand) { ziel.textContent = ''; ziel.appendChild(el('p', { class: 'leise' }, 'Akademie lädt …')); }
    oeffnen(code).then(function (ak) {
      merken(code);
      window.DKAkademie.starte(ak);
    }, function (e) {
      if (e && e.falscherCode) { if (gemerkt() === code) { try { localStorage.removeItem(MERKEN); } catch (x) {} } schloss('Dieser Code passt nicht. Prüf ihn und versuch es nochmal.'); }
      else schloss(navigator.onLine === false ? 'Keine Verbindung. Öffne die Akademie einmal mit Internet, danach geht sie auch offline.' : 'Die Lektionen laden gerade nicht. Versuch es gleich nochmal.');
    });
  }

  // Offline-Speicher: eigener Service Worker nur für akademie/
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  // Installieren als App: Manifest nur außerhalb des iPhones (dort behält „Zum Home-Bildschirm“ so den Link mit dem Code)
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) { var m = el('link', { rel: 'manifest', href: 'manifest.webmanifest' }); document.head.appendChild(m); }

  var code = ausLink() || gemerkt();
  if (code) versuchen(code, false); else schloss('');
})();
