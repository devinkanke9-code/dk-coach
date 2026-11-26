// DK Coach — Kunden-App. Läuft ohne Konto und offline.
// Der Plan kommt im Link vom Trainer, wird auf dem Handy gespeichert und nie an einen Server geschickt.
// Seit 29.10.2026: Link + Code (#z=…, verschlüsselt, mit Laufzeit), ohne Plan zuerst die Analyse. Alte Links (#p=…) gehen weiter.
// Aussehen und Abläufe wie die Kunden-Ansicht der Trainer-Seite (stil.css, gleiche Bausteine), dazu die 3D-Figur (buehne.js).
import { UEBUNGEN, STAND, ANALYSE, KONTAKT, SCHMERZ } from './daten.js';
import { buehne, standbilder } from './buehne.js';
import { erklaerPunkte, ART_NAME } from './coach.js';
import * as Bestleistung from './bestleistung.js';
import * as Rang from './rang.js';
import * as Status from './status.js';   // Status (18.11.2026): eigener Charakter mit Zahlen, Skins, wer im Gym trainiert
import * as Figurwahl from './figurwahl.js';   // Figur überall (23.11.2026): eine Wahl je Kunde für Gym, Station, Training und Übungen
import * as Essen from './essen.js';   // Essen (26.11.2026): Tagesplan mit Zählen, Teller und Ampel ohne Zählen, nur auf diesem Handy
import * as PrRaum from './pr-raum.js';
import * as Spiel from './spiel.js';   // Punkte, Level und Serie fürs Gym (09.11.2026): nur Zahlen, nur auf diesem Handy
import * as Statistik from './statistik.js';   // Dein Fortschritt (17.11.2026): Statistik aus den eigenen Trainings, nur auf diesem Handy
import * as Grafik from './statistik-grafik.js';   // Statistik (21.11.2026): Leucht-Graph, auch in der Trainer-Seite
const K = window.DKKompakt;   // kompakt.js: Code, Verschlüsselung, Analyse-Format (gleich wie in der Trainer-Seite)
// Nie in einer fremden Seite (13.11.2026): Steckt die App in einem Rahmen (iframe), zeigt sie nichts und startet nicht.
// Sonst könnte eine fremde Seite sie unsichtbar überdecken und den Kunden Knöpfe tippen lassen. Per <meta> lässt sich frame-ancestors nicht setzen.
if (window.top !== window.self) { document.documentElement.style.display = 'none'; throw new Error('DK Coach läuft nicht in einem fremden Rahmen'); }

/* ---------- Hilfen ---------- */
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'checked' || k === 'value') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kinder.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const speicher = {
  lies(k, std) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : std; } catch (e) { return std; } },
  schreib(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
function ansagen(t) {   // QA 25.11.2026 (Rolle 15): feste, unsichtbare Ansage-Fläche (gibt es schon vor der Meldung, darum wird sie gesprochen)
  let ansage = document.getElementById('ansage');
  if (!ansage) { ansage = h('div', { id: 'ansage', 'aria-live': 'polite', style: 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap' }); document.body.append(ansage); }
  ansage.textContent = ''; setTimeout(() => { ansage.textContent = t; }, 60);
}
function toast(t) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  ansagen(t);   // QA 25.11.2026 (Rolle 15)
  const el = h('div', { class: 'toast', 'aria-hidden': 'true', text: t }); document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
const bereich = (r, e) => !r ? '' : (r[0] === r[r.length - 1] ? String(r[0]) : r[0] + '–' + r[r.length - 1]) + (e === 'sek' ? ' s' : '');
const auf15 = (x) => Math.max(15, Math.round(x / 15) * 15);
function datumHeute() { const t = new Date(); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); }
const isoHeute = () => { const t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const vorname = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const MUSKEL = { brust: 'Brust', lat: 'Latissimus', oberer_ruecken: 'Oberer Rücken', trapez: 'Trapez', schulter_vorne: 'Vordere Schulter',
  schulter_seite: 'Seitliche Schulter', schulter_hinten: 'Hintere Schulter', bizeps: 'Bizeps', trizeps: 'Trizeps', unterarme: 'Unterarme',
  quadrizeps: 'Oberschenkel vorn', beinbeuger: 'Oberschenkel hinten', gesaess: 'Gesäß', adduktoren: 'Innenseite Bein', abduktoren: 'Außenseite Hüfte',
  waden: 'Waden', bauch: 'Bauch', seitlicher_rumpf: 'Seitlicher Rumpf', unterer_ruecken: 'Unterer Rücken' };
const ZIEL = { muskelaufbau: 'Muskelaufbau', kraft: 'Kraft', fettabbau: 'Fettabbau', gesundheit: 'Gesundheit', fitness_allgemein: 'Fitness',
  ruecken_gesund: 'Gesunder Rücken', beweglichkeit: 'Beweglichkeit', ausdauer: 'Ausdauer' };
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const PHASE = { e: ['einstieg', 'Einstieg', 'Technik vor Gewicht'], a: ['aufbau', 'Aufbau', 'Steigern nach Regel'], d: ['deload', 'Entlastung', 'Weniger Sätze, leichter'] };

/* ---------- Plan aus dem Link ---------- */
function vonBase64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b;
}
async function entpacke(code) {
  const art = code[0], bytes = vonBase64url(code.slice(1));
  if (art === 'j') return JSON.parse(new TextDecoder().decode(bytes));
  if (art === 'z') return JSON.parse(new TextDecoder().decode(await K.ausDeflate(bytes)));
  throw new Error('unbekanntes Format');
}
function pruefePlan(p) { return !!K.planSauber(p); }

/* iPhone: Apps vom Home-Bildschirm haben einen eigenen Speicher, sie sehen nicht, was Safari gespeichert hat.
 * Deshalb bleibt der Link in Safari in der Adresszeile, und das iPhone bekommt kein Manifest: „Zum Home-Bildschirm“
 * nimmt dann genau diesen Link mit, und die App fragt beim ersten Start einmal den Code ab. */
const istIos = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installiert = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (!istIos) document.head.append(h('link', { rel: 'manifest', href: 'manifest.webmanifest' }));
function linkAusAdresse() { if (!istIos || installiert()) history.replaceState(null, '', location.pathname + location.search); }
// Schon verarbeitete Links (z. B. der Start-Link der Home-Bildschirm-App) nicht bei jedem Start neu entschlüsseln
const abdruck = (s) => s.slice(-24);
const schonGesehen = (s) => speicher.lies('dk_gesehen', []).includes(abdruck(s));
function gesehen(s) { speicher.schreib('dk_gesehen', speicher.lies('dk_gesehen', []).filter((x) => x !== abdruck(s)).concat(abdruck(s)).slice(-20)); }
function dauerhaft() { try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => {}); } catch (e) {} }   // Browser soll den Plan nicht wegräumen

async function linkEinlesen() {
  const z = /[#&]z=([A-Za-z0-9_-]+)/.exec(location.hash), m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  const u = /[#&]umzug=([A-Za-z0-9_-]+)/.exec(location.hash);   // Umzug von der alten Adresse (06.11.2026)
  if (u) return ohneCode(u[1], umzugEinlesen);
  const c = /[#&]c=([0-9-]{8,14})(?![0-9])/.exec(location.hash);   // kurzer Link mit Code (21.11.2026)
  if (c && K.appCodeGueltig(c[1])) return codeLinkEinlesen(K.appCodeNormal(c[1]));
  if (!z && !m) return false;
  if (!z) return ohneCode(m[1], planEinlesen);
  linkAusAdresse();
  if (schonGesehen(z[1])) return false;
  return zugangEinlesen(z[1]);
}
// Links ohne Code (#p=, #umzug=; 13.11.2026): Plan, Codes und Trainings stehen darin offen. Darum sofort aus der Adresszeile,
// damit nichts im Verlauf, in Lesezeichen oder auf einem geteilten Bildschirm bleibt. Nur Safari auf dem iPhone behält einen
// übernommenen Link: Sonst nimmt „Zum Home-Bildschirm“ nichts mit (die App dort hat einen eigenen Speicher, siehe oben).
function adresseLeeren() { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
async function ohneCode(teil, lesen) {
  const behalten = istIos && !installiert();
  if (!behalten) adresseLeeren();
  const ok = schonGesehen(teil) ? null : await lesen(teil);
  if (behalten && ok === false) adresseLeeren();
  return !!ok;
}
// Alte Links (#p=…, bis 28.10.2026): Plan offen im Link, ohne Code und ohne Laufzeit. Jeder kann so einen Link bauen,
// darum seit 13.11.2026: immer fragen (auch auf einem leeren Handy) und nie den Plan eines Zugangs mit Code ersetzen.
async function planEinlesen(code) {
  try {
    const p = K.planSauber(await entpacke(code));
    if (!p) throw new Error('kein Plan');
    p.id = p.id || ('p' + Date.now().toString(36));
    const plaene = speicher.lies('dk_plaene', {});
    const alt = plaene[p.id];
    gesehen(code);   // auch bei Nein: Der Start-Link einer Home-Bildschirm-App fragt dann nicht bei jedem Start neu
    if (konten()[p.id]) { toast('Nicht übernommen: Für deinen Zugang kommen Pläne nur mit Code von Devin.'); return false; }
    if (alt && alt.d && p.d && alt.d > p.d) return false;   // ein älterer Link überschreibt nie einen neueren Plan
    if (!confirm('Diesen Plan übernehmen? Er kommt ohne Code. Echte Pläne von Devin kommen heute immer mit Code. Tipp nur auf OK, wenn du sicher bist, dass der Link von Devin ist.'
      + (alt ? ' Dein gespeicherter Plan wird dabei ersetzt.' : ''))) { toast('Plan nicht übernommen.'); return false; }
    p.importiert = alt && alt.importiert || isoHeute();
    plaene[p.id] = p;
    speicher.schreib('dk_plaene', plaene);
    speicher.schreib('dk_aktiv', p.id);
    toast(alt ? 'Plan aktualisiert' : 'Plan gespeichert – ab jetzt auch ohne Internet');
    dauerhaft(); S.tagWahl = null;
    return true;
  } catch (e) {
    toast('Der Link ist unvollständig. Lass ihn dir nochmal schicken.');
    return false;
  }
}

/* ---------- Zugang: Link + Code (#z=…) ----------
 * Der Link trägt Name, Laufzeit und Plan verschlüsselt, der Code aus Devins Nachricht ist der Schlüssel.
 * Einmal eingegeben, merkt sich das Handy den Code: Neue Links von Devin gehen danach ohne Eingabe auf.
 * Ab dem Tag nach „bis“ sperrt die App, bis ein neuer Link kommt. */
const konten = () => speicher.lies('dk_konten', {});
const aktivesKonto = () => konten()[speicher.lies('dk_konto', '')] || null;
const abgelaufen = (ko) => !!(ko && ko.bis && isoHeute() > ko.bis);
const datumDe = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE');
const tageBis = (ko) => Math.round((new Date(ko.bis + 'T12:00:00') - new Date(isoHeute() + 'T12:00:00')) / 864e5);
function kontoSetzen(id, aenderung) { const alle = konten(); if (alle[id]) { Object.assign(alle[id], aenderung); speicher.schreib('dk_konten', alle); } }
function linkDatenOk(d) {
  // t darf nicht in der Zukunft liegen: Sonst könnte ein gefälschter Link alle echten als „älter“ aussperren
  return !!d && d.v === 2 && /^k[A-Za-z0-9]{1,16}$/.test(d.k || '') && typeof d.t === 'number' && d.t <= Date.now() + 1728e5 && (!d.n || typeof d.n === 'string') && (!d.bis || /^\d{4}-\d{2}-\d{2}$/.test(d.bis)) && (!d.p || pruefePlan(d.p));
}
async function zugangEinlesen(teil) {
  for (const c of new Set(Object.values(konten()).map((k) => k.code).filter(Boolean))) {   // Code schon bekannt? Dann ohne Eingabe
    let d = null;
    try { d = await K.entpacken(c, teil); } catch (e) { continue; }
    if (!linkDatenOk(d)) continue;
    if (typeof freiFuer === 'function' && !(await freiFuer(c))) {   // Schalter „aus“ bei Devin: der Link geht nicht auf (typeof: app/test.js prüft zugangEinlesen allein)
      gesehen(teil);
      if (konten()[d.k]) { sperren(d.k); speicher.schreib('dk_konto', d.k); speicher.schreib('dk_aktiv', d.k); }
      toast('Dein Zugang ist gerade ausgeschaltet. Schreib Devin.');
      return true;
    }
    anmelden(d, c, teil); return true;
  }
  S.wartet = teil; speicher.schreib('dk_wartet', teil);
  return true;
}
function anmelden(d, code, teil) {
  const alle = konten(), alt = alle[d.k];
  gesehen(teil); S.wartet = null; speicher.schreib('dk_wartet', null);
  // Link für ein anderes Konto oder mit anderem Code fürs selbe Konto: Wer schon eingeloggt ist, entscheidet selbst
  if (!alt && aktivesKonto() && !confirm('Dieser Link gehört zu einem anderen Konto' + (d.n ? ' („' + d.n.slice(0, 40) + '“)' : '') + '. Nur wechseln, wenn er wirklich von Devin kommt.')) { toast('Link nicht übernommen.'); return; }
  // Neuer Code von Devin (seit 13.11.2026 bekommen alte 8-stellige Codes auf Wunsch 12 Ziffern): einmal bestätigen, danach gilt nur der neue.
  // Ein älterer Link mit dem alten Code fragt nicht und ändert nichts (siehe t unten).
  if (alt && alt.code && K.appCodeNormal(alt.code) !== K.appCodeNormal(code) && !(alt.t > d.t) && !confirm('Neuer Code für dein Konto. Hat Devin dir einen neuen Code geschickt? Dann tipp auf OK, ab jetzt gilt der neue Code.')) { toast('Link nicht übernommen.'); return; }
  speicher.schreib('dk_konto', d.k); speicher.schreib('dk_aktiv', d.k);   // wer sich einloggt, sieht seinen eigenen Stand
  if (alt && alt.t > d.t) return;   // älterer Link (z. B. der Start-Link vom Home-Bildschirm) überschreibt nie einen neueren Stand
  // a: 3 = nur Gesundheits-Check (die 10 Fragen kamen schon über die Seite „Analyse für dich“), 2 = Analyse in 10 Fragen, 1 = alle Fragen
  const form = d.a === 3 ? 'gesundheit' : d.a === 2 ? 'kurz' : d.a ? 'lang' : (alt && alt.form) || null;
  alle[d.k] = { id: d.k, n: (typeof d.n === 'string' && d.n ? d.n : (alt && alt.n) || '').slice(0, 120), bis: d.bis || '', code: K.appCodeAnzeige(code), t: d.t, plan: !!d.p, warten: !!d.w,   // ohne Namen (Code-Briefkasten): der vom Link bleibt
    analyse: d.p || (alt && alt.form && alt.form !== form) ? null : (alt && alt.analyse) || null, form,   // andere Abfrage als vorher: nicht mehr „schon geschickt“
    c: d.c === 0 ? null : d.c && d.c.v === 1 ? d.c : (alt && alt.c) || null,   // Charakter von Devin: nur Zahlen und Farben, kein Foto. Ein Link ohne Charakter lässt den alten stehen, 0 nimmt ihn weg
    g: /^(weiblich|maennlich|divers)$/.test(d.g || '') ? d.g : (!d.g && alt && alt.g) || null };   // Geschlecht, das Devin eingetragen hat (die 10 Fragen fragen es nicht): für die Fragen nur für Frauen im Gesundheits-Check. Ohne Angabe (Code-Briefkasten) bleibt das vom Link
  speicher.schreib('dk_konten', alle);
  if (!alt && typeof farbeNachLogin === 'function') farbeNachLogin();   // Devin, 21.11.2026: „wenn du dann eingeloggt bist, dass du direkt schwarz-gold siehst“
  if (d.p) {
    // Neuer Plan (anderes Erstelldatum) = Woche 1 ab heute; nur geändert = die Wochen zählen weiter
    const plaene = speicher.lies('dk_plaene', {}), vorher = plaene[d.k];
    const sauber = K.planSauber(d.p);
    plaene[d.k] = Object.assign(sauber, { id: d.k, importiert: (vorher && vorher.d === sauber.d && vorher.importiert) || isoHeute() });
    speicher.schreib('dk_plaene', plaene);
    const ana = speicher.lies('dk_analyse10', null);   // Analyse von der Seite „Analyse für dich“: Devin hat sie (der Plan ist da), also weg vom Handy (19.11.2026)
    if (ana && ana.gesendet) speicher.schreib('dk_analyse10', null);
  }
  dauerhaft();
  const vn = vorname(d.n);
  if (!alt) toast('Hi' + (vn ? ' ' + vn : '') + '! Du bist eingeloggt.');
  else if (alt.t !== d.t) toast(d.p && !alt.plan ? 'Dein Plan ist da!' : d.p ? 'Neuer Stand von Devin ist da' : 'Aktualisiert');
  S.tagWahl = null; S.ansicht = 'heute';
}
// Nachricht von Devin einfügen: für die App vom Home-Bildschirm, die Links aus WhatsApp nicht selbst öffnet
// Code in Devins Nachricht: neu 12 Ziffern (1234-5678-9012), ältere 8 (1234-5678). Erst hinter „Code:“ suchen, sonst die erste passende Ziffernfolge
function codeInText(text) {
  const m = /Code:?\s*(\d{4}\s*-\s*\d{4}(?:\s*-\s*\d{4})?)(?!\d)/i.exec(text) || /(?:^|\D)(\d{4}\s*-\s*\d{4}(?:\s*-\s*\d{4})?)(?!\d)/.exec(text);
  return m ? K.appCodeNormal(m[1]) : '';
}
// Code-Feld: nur Ziffern, Striche nach je 4 (0000-0000-0000). Liefert die Zahl der Ziffern; bei 12 ist der Code komplett, alte 8-stellige mit „Einloggen“
function codeTippen(feld) {
  const n = K.appCodeNormal(feld.value).slice(0, 12);
  feld.value = (n.match(/\d{1,4}/g) || []).join('-');
  return n.length;
}
const CODE_FALSCH = 'Der Code hat 12 Ziffern, zum Beispiel 4821-7730-1956. Ältere Codes haben 8.';
// Kunden-Test 23.11.2026: „Da steht 12 Ziffern, und ich hab 12 getippt.“ Jetzt sagt die Meldung, wie viele Ziffern im Feld stehen.
const codeFalsch = (wert) => { const n = K.appCodeNormal(wert).length; return n ? 'Da stehen ' + n + (n === 1 ? ' Ziffer. ' : ' Ziffern. ') + CODE_FALSCH : 'Gib den Code aus Devins Nachricht ein, zum Beispiel 4821-7730-1956.'; };
async function textEinlesen(text) {
  text = String(text || '');
  const z = /[#&]z=([A-Za-z0-9_-]+)/.exec(text), p = /[#&]p=([A-Za-z0-9_-]+)/.exec(text);
  if (!z && !p) { toast('Darin ist kein Link von Devin. Kopier die ganze Nachricht.'); return; }
  if (!z) { await planEinlesen(p[1]); zeichne(); return; }
  const c = codeInText(text.replace(z[0], ''));   // steht der Code mit in der Nachricht: gleich einloggen
  if (c) {
    let d = null;
    try { d = await K.entpacken(c, z[1]); } catch (e) {}
    if (linkDatenOk(d)) {
      if (!(await freiFuer(c))) { toast(CODE_TEXTE.aus); return; }
      anmelden(d, c, z[1]); zeichne(); fotosVorladen(); return;
    }
    if (KONTAKT.briefkasten) {   // Link kaputt oder abgeschnitten: Der Code allein reicht
      const aus = await codeHolen(c);
      if (aus === 'ok') { gesehen(z[1]); zeichne(); fotosVorladen(); toast('Fertig, du bist eingeloggt.'); return; }
      if (aus === 'aus' || aus === 'erneuert' || aus === 'abgelaufen') { toast(CODE_TEXTE[aus]); return; }
    }
  }
  await zugangEinlesen(z[1]); zeichne(); fotosVorladen();
}
function einfuegenBlock(titel) {
  const feld = h('textarea', { class: 'eingabe', rows: '3', placeholder: 'Nachricht von Devin hier einfügen', 'aria-label': 'Nachricht von Devin' });
  // Kunden-Test 23.11.2026: Bei Unsinn kam nur ein kurzer Hinweis unten, „es passiert gar nichts“. Jetzt bleibt die Meldung unter dem Feld stehen.
  const meldung = h('p', { class: 'klein', role: 'status', hidden: true });
  const offen = h('div', { class: 'stapel', hidden: true }, feld, h('button', { class: 'knopf haupt', type: 'button', onclick: () => {
    if (!/[#&][zp]=/.test(feld.value)) { meldung.textContent = feld.value.trim() ? 'Darin ist kein Link von Devin. Kopier seine ganze Nachricht mit dem Link und füg sie hier ein.' : 'Füg zuerst Devins Nachricht hier ein.'; meldung.hidden = false; feld.focus(); return; }
    meldung.hidden = true; textEinlesen(feld.value);
  }, text: 'Übernehmen' }), meldung);
  return h('div', { class: 'stapel einfuegen' }, h('button', { class: 'knopf', type: 'button', onclick: async () => {
    let t = '';
    try { t = navigator.clipboard && navigator.clipboard.readText ? await navigator.clipboard.readText() : ''; } catch (e) {}   // das Handy fragt vorher
    if (/[#&][zp]=/.test(t)) textEinlesen(t); else { offen.hidden = false; feld.focus(); }
  }, text: titel || 'Link von Devin einfügen' }), offen);
}

/* ---------- Zustand ---------- */
const S = { ansicht: 'heute', plan: null, tagWahl: null };
function aktiverPlan() {
  const plaene = speicher.lies('dk_plaene', {});
  const id = speicher.lies('dk_aktiv', null);
  if (plaene[id]) return mitWechsel(plaene[id]);
  if (id && konten()[id]) return null;   // eingeloggt, aber noch ohne Plan (Analyse oder Warten)
  return mitWechsel(Object.values(plaene)[0] || null);
}
function uebung(u) {
  const d = UEBUNGEN[u.i] || { n: u.nm || u.i, m: [], t: [], f: [], v: [] };
  return { id: u.i, name: u.nm || d.n || u.i, saetze: u.s, wdh: u.w, rir: u.r, pause: u.p || [], einheit: u.e || d.e, einseitig: !!u.j, notiz: u.x, d, tausch: u.z || null, b: Array.isArray(u.b) ? u.b : [], y: Array.isArray(u.y) ? u.y.filter((x) => typeof x === 'string' && x) : [] };
}
// „Angepasst wegen …“ (13.11.2026, Pläne bei Schmerzen): wofür Devins Generator die Übung wegen einer Beschwerde angepasst hat (bs und b aus dem Link). Nur Text.
function angepasst(p, u) { const bs = (p && p.bs) || []; return (u.b || []).map(([i, g]) => ({ name: bs[i] || 'deiner Beschwerde', grund: g })).filter((x) => x.grund); }
function angepasstBlock(liste, kurz) {
  if (!liste.length) return null;
  if (kurz) return h('div', { class: 'notiz angepasst', text: 'Angepasst wegen ' + [...new Set(liste.map((x) => x.name))].join(', ') });
  return h('div', { class: 'blatt-abschnitt angepasst' }, liste.map((x) => h('p', null, h('b', { text: 'Angepasst wegen ' + x.name + ': ' }), x.grund)));
}
// „Angepasst an dich“ (14.11.2026): Lieblingsübung oder Ersatz für eine Übung, die er nicht mag (y aus dem Link). Nur Text.
function fuerDichBlock(u, kurz) {
  if (!u.y || !u.y.length) return null;
  const t = 'Angepasst an dich: ' + u.y.join(' ');
  return kurz ? h('div', { class: 'notiz angepasst fuer-dich', text: t }) : h('div', { class: 'blatt-abschnitt angepasst fuer-dich' }, h('p', null, h('b', { text: 'Angepasst an dich: ' }), u.y.join(' ')));
}
const istSek = (u) => u.einheit === 'sek';
const dosis = (u) => bereich(u.wdh, istSek(u) ? 'sek' : '') + (istSek(u) ? '' : ' Wdh');
const pauseText = (u) => bereich(u.pause.map(auf15)) + ' s';
const anzeigeName = (u) => u.name + (u.einseitig ? ' (je Seite)' : '');
// Woche des Plans (ab dem Tag, an dem der Link geöffnet wurde)
function aktuelleWoche(p) {
  const start = new Date(p.importiert || isoHeute());
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 6048e5));
}
/* Wechsel und Tausch (09.11.2026, Devin: „jede Woche … eine neue Übung“, „gibt es diese Maschine nicht, sollen wir die ändern?“, nur für eingeloggte Kunden).
 * Die Liste a kommt aus der Trainer-Seite und ist dort gegen Level, Geräte, Beschwerden und Gesundheits-Check geprüft: Die App wählt nur daraus, sie prüft selbst nichts.
 * Das Gespeicherte bleibt der Plan von Devin, hier entsteht bei jedem Lesen die Fassung dieser Woche. z merkt sich das Original. Ein Tausch gilt bis zum nächsten Plan (p.d). */
const tauschKey = (p) => 'dk_tausch_' + p.id;
function tauschLaden(p) { const t = speicher.lies(tauschKey(p), null); return t && t.d === p.d && t.m ? t.m : {}; }
function mitWechsel(p) {
  if (!p || p.id === 'beispiel' || !konten()[p.id] || !p.t.some((t) => t.u.some((u) => u.a))) return p;
  const w = aktuelleWoche(p), pins = tauschLaden(p), wf = p.wf || [];
  return Object.assign({}, p, { fokus: wf.length ? wf[w % wf.length] : '', t: p.t.map((t, ti) => {
    const wahl = t.u.map((roh) => {
      const m = pins[ti + '|' + roh.i];
      if (!m) return null;
      return m === roh.i ? { behalten: true } : (roh.a || []).find((a) => a.i === m && UEBUNGEN[a.i]) || null;
    });
    const fest = new Set(wahl.filter((x) => x && x.i).map((x) => x.i));
    return Object.assign({}, t, { u: t.u.map((roh, ui) => {
      let neu = wahl[ui] && wahl[ui].i ? wahl[ui] : null, art = neu ? 'tausch' : '';
      if (!wahl[ui] && roh.rt) {
        const pool = [null].concat(roh.a.slice(0, roh.rt)), kand = pool[w % pool.length];
        if (kand && UEBUNGEN[kand.i] && !fest.has(kand.i)) { neu = kand; art = 'neu'; }
      }
      const z = { ti, orig: roh, art };
      return neu ? Object.assign({}, roh, { e: undefined, j: undefined, b: undefined, y: undefined }, neu, { x: art === 'neu' ? 'Neu diese Woche' : 'Von dir getauscht', z }) : Object.assign({}, roh, { z });
    }) });
  }) });
}
// Was der Kunde statt dieser Übung nehmen darf: die Liste aus dem Plan, ohne was an dem Tag schon dran ist. Ist gerade nicht das Original dran, steht es oben
function tauschOptionen(u) {
  const z = u.tausch, p = aktiverPlan();
  if (!z || !p || !p.t[z.ti]) return [];
  const hier = new Set(p.t[z.ti].u.map((x) => x.i)), liste = (z.orig.a || []).filter((a) => UEBUNGEN[a.i] && !hier.has(a.i));
  return z.art && UEBUNGEN[z.orig.i] ? [{ i: z.orig.i, orig: true }].concat(liste) : liste;
}
// Gilt für jeden Tag mit derselben Übung, an dem der Ersatz erlaubt und noch nicht dran ist
function tauschen(z, neuId) {
  const p = aktiverPlan(), m = Object.assign({}, tauschLaden(p));
  p.t.forEach((t, ti) => t.u.forEach((x) => {
    if (!x.z || x.z.orig.i !== z.orig.i) return;
    const erlaubt = neuId === z.orig.i || (x.z.orig.a || []).some((a) => a.i === neuId);
    if (erlaubt && !t.u.some((y) => y !== x && y.i === neuId)) m[ti + '|' + x.z.orig.i] = neuId;
  }));
  speicher.schreib(tauschKey(p), { d: p.d, m });
}
const istEntlastung = (p) => (p.w || [])[aktuelleWoche(p)] === 'd';
// In der Entlastungswoche halb so viele Sätze (mindestens 1)
const satzZahl = (p, u) => istEntlastung(p) ? Math.max(1, Math.ceil(u.saetze / 2)) : u.saetze;

// Trainingstage: selbst gewählt (nur auf dem Handy) oder die festen Tage aus dem Plan; 0 = Montag
function kundenTage(p) {
  const eigen = speicher.lies('dk_tage_' + p.id, null);
  const t = Array.isArray(eigen) ? eigen : (p.ft || []);
  return t.filter((i) => i >= 0 && i < 7).sort();
}
function tagFuer(p, wt) { const i = kundenTage(p).indexOf(wt); return i >= 0 && i < p.t.length ? i : -1; }
const heuteIndex = () => (new Date().getDay() + 6) % 7;

// Abhaken: gilt nur heute, nur auf diesem Handy
const erledigtKey = (p, ti) => 'dk_erledigt_' + p.id + '_' + datumHeute() + '_' + ti;
const erledigtLaden = (p, ti) => speicher.lies(erledigtKey(p, ti), []);
function erledigtSetzen(p, ti, ui, an) {
  const l = erledigtLaden(p, ti).filter((x) => x !== ui);
  if (an) l.push(ui);
  speicher.schreib(erledigtKey(p, ti), l);
  zeichne();
}
// Feinschliff (10.11.2026): Die Haken dieser Woche bleiben liegen, damit die Wochenkarte auf „Heute“ zeigt, welche Tage geschafft sind. Abhaken selbst geht weiter nur heute.
// Datum je Wochentag von Montag bis heute, in der Form von datumHeute()
function wochenDaten(heute) {
  const t = new Date(), aus = [];
  for (let i = 0; i <= heute; i++) { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - (heute - i)); aus.push(d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate()); }
  return aus;
}
function altesAbhakenWeg() {
  try {
    const weg = [], bleibt = wochenDaten(heuteIndex()).map((d) => '_' + d + '_');
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^dk_erledigt_/.test(k) && !bleibt.some((x) => k.indexOf(x) >= 0)) weg.push(k); }
    weg.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
}

/* ---------- Leiste ---------- */
const BEREICHE = [
  ['heute', 'Heute', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><circle cx="12" cy="15" r="1.6"/>'],
  ['plan', 'Plan', '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>'],
  ['uebungen', 'Übungen', '<circle cx="12" cy="5" r="2"/><path d="M12 7v6M8 21l4-8 4 8M7 10l5 1 5-1"/>'],
  ['statistik', 'Statistik', '<path d="M4 20h16"/><path d="M5 16l4.2-4.6 3.3 3 6.5-7.4"/><circle cx="19" cy="7" r="1.6"/>'],   // Statistik (21.11.2026, Devin: „unten bei der Leiste steht Statistik“)
  ['rang', 'Rang', '<path d="M12 3l7 3v5.5c0 4.4-2.9 7.7-7 9.5-4.1-1.8-7-5.1-7-9.5V6z"/><path d="M12 8l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z"/>'],
  ['status', 'Status', '<circle cx="12" cy="7.6" r="3.6"/><path d="M4.6 21c.8-4.6 3.8-7.3 7.4-7.3s6.6 2.7 7.4 7.3"/>'],
  ['info', 'Infos', '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>']
];
// Leiste (Redesign 24.11.2026): am Handy vier Ziele (Heute, Plan, Übungen, Mehr), unter „Mehr“ Statistik, Rang, Status und Infos nach Aufgaben gruppiert.
// Ab 900 px stehen alle sieben beschriftet nebeneinander (CSS). Der aktive Bereich ist auch ohne Farbe erkennbar: Fläche hinter dem Symbol und fette Schrift.
const MEHR = ['statistik', 'rang', 'status', 'info'];
const MEHR_ICON = '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>';
const MEHR_GRUPPEN = [
  ['Dein Fortschritt', [['statistik', 'Trainings, Gewichte und der Verlauf je Übung'], ['rang', 'Punkte aus dem Gym, dein Level und deine Bestleistungen']]],
  ['Du', [['status', 'Deine Figur, dein Gewicht und deine Ernährung'], ['essen', 'Dein Tag: Kalorien, Eiweiß, Trinken und der Teller ohne Zählen']]],
  ['Hilfe und Zugang', [['info', 'Code, Frage an Devin, App aufs Handy, Farbwelt und Rechtliches']]]
];
function leiste() {
  const n = $('#leiste'); n.textContent = '';
  $('nav.leiste').hidden = !S.plan;
  n.style.gridTemplateColumns = '';
  n.classList.remove('sieben'); n.classList.add('mit-mehr');
  const aktiv = S.ansicht === 'fortschritt' ? 'statistik' : S.ansicht === 'essen' ? 'status' : S.ansicht;   // die alte Seite Fortschritt ist jetzt Statistik; Essen gehört zu Status (am Handy unter Mehr)
  const knopf = (id, name, icon, klasse, aktuell) => {
    const b = h('button', { type: 'button', class: klasse || null, 'aria-current': aktuell ? 'page' : null, onclick: () => geh(id) });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg>';
    b.append(h('span', { text: name })); return b;
  };
  for (const [id, name, icon] of BEREICHE) n.append(knopf(id, name, icon, MEHR.includes(id) ? 'nur-breit' : null, aktiv === id));
  n.append(knopf('mehr', 'Mehr', MEHR_ICON, 'nur-schmal', aktiv === 'mehr' || MEHR.includes(aktiv)));
}
// Ziele nur unter „Mehr“, ohne eigenen Knopf in der Leiste (Essen 26.11.2026, Devins Wahl: die Leiste aus dem Redesign bleibt, wie sie ist)
const NUR_MEHR = [['essen', 'Essen', '<circle cx="12" cy="12.5" r="5.5"/><path d="M3 3.5v4a1.5 1.5 0 0 0 3 0v-4M4.5 3.5V21M19.5 21V3.5c-1.6.9-2.5 2.8-2.5 5.5v3.5h2.5"/>']];
function ansichtMehr() {
  const icon = (id) => (BEREICHE.concat(NUR_MEHR).find((b) => b[0] === id) || [])[2] || '';
  const name = (id) => (BEREICHE.concat(NUR_MEHR).find((b) => b[0] === id) || [])[1] || id;
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Mehr' })),
    ...MEHR_GRUPPEN.map(([titel, ziele]) => h('section', { class: 'block mehr-gruppe', 'aria-label': titel }, h('h2', { class: 'mehr-titel', text: titel }),
      h('div', { class: 'mehr-liste' }, ziele.map(([id, text]) => {
        const b = h('button', { class: 'mehr-zeile', type: 'button', onclick: () => geh(id) });
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon(id) + '</svg>';
        b.append(h('span', null, h('b', { text: name(id) }), h('small', { text })), h('span', { class: 'mehr-pfeil', 'aria-hidden': 'true', text: '›' }));
        return b;
      }))))];
}
// Seitenwechsel: oben anfangen und den Fokus auf die Überschrift der neuen Seite setzen (Tastatur und Vorlesen wissen, wo sie sind)
function geh(id) {
  S.ansicht = id; zeichne(); window.scrollTo(0, 0);
  const t = document.querySelector('#ansicht h1');
  if (t) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) { /* nichts */ } }
}
// Farbwelt mit einem Tipp (18.11.2026, antippen.js „dk-look“): die Ansicht sofort in den neuen Farben neu zeichnen, ohne Neuladen; man bleibt auf derselben Seite an derselben Stelle
window.addEventListener('dk-look', () => { const y = window.scrollY; zeichne(); window.scrollTo(0, y); });
// Was die App zeigt: Code-Eingabe, Sperre nach Ablauf, Analyse, Warten auf den Plan, der Plan selbst oder Willkommen
function zustand() {
  if (S.laedt) return 'laedt';   // kurzer Link: Plan wird gerade geholt
  if (S.wartet) return 'code';
  const ko = aktivesKonto(), p = aktiverPlan();
  if (ko && ko.aus) return 'pausiert';   // Schalter „aus“ bei Devin (Code-Briefkasten, 19.11.2026)
  if (ko && (!p || p.id === ko.id)) {
    if (abgelaufen(ko)) return 'abgelaufen';
    if (!ko.plan) return ko.warten || ko.analyse === 'geschickt' ? 'warten' : 'analyse';
  }
  return p ? 'plan' : 'willkommen';
}
function zeichne() {
  Rang.aufraeumen();   // die 3D-Figur der Rang-Seite nicht weiterlaufen lassen
  const z = zustand();
  S.konto = aktivesKonto();
  document.body.classList.toggle('start', z === 'willkommen' && !installiert());
  if (z !== 'willkommen') startWeg();
  S.plan = z === 'plan' ? aktiverPlan() : null;
  $('#wer').textContent = S.plan ? (navigator.onLine === false ? 'Offline · alles da' : vorname(S.plan.n || (S.konto && S.konto.id === S.plan.id ? S.konto.n : ''))) : '';   // Plan aus dem Briefkasten: ohne Namen
  leiste();
  const ziel = $('#ansicht'); ziel.textContent = '';
  // Ruhig und schön (19.11.2026): nur der echte Seitenwechsel blendet ein; Neuzeichnen derselben Seite (Haken, Farbwelt) bleibt ruhig
  const ansichtSchluessel = z + '|' + (z === 'plan' ? S.ansicht : '');
  ziel.classList.toggle('still', ansichtSchluessel === S.letzteAnsicht); S.letzteAnsicht = ansichtSchluessel;
  const ansicht = { laedt: laedtAnsicht, code: codeAnsicht, pausiert: pausiertAnsicht, abgelaufen: abgelaufenAnsicht, analyse: analyseAnsicht, warten: wartenAnsicht, willkommen: startseite }[z]
    || { heute: ansichtHeute, plan: ansichtPlan, uebungen: ansichtUebungen, rang: ansichtRang, status: ansichtStatus, essen: ansichtEssen, info: ansichtInfo, statistik: ansichtStatistik, fortschritt: ansichtStatistik, mehr: ansichtMehr }[S.ansicht] || ansichtHeute;
  try { ziel.append(...[umzugKarte(), umzugFertigKarte(), ansicht()].flat().filter(Boolean)); }
  catch (e) {   // Kaputte Daten dürfen nie einen weißen Bildschirm ergeben: Ein neuer Link von Devin hilft immer weiter
    console.error(e); ziel.textContent = '';
    ziel.append(h('section', { class: 'block willkommen' }, logo(), h('h1', { text: 'Hier stimmt etwas nicht' }),
      h('p', { class: 'leise', text: 'Die gespeicherten Daten passen nicht zusammen. Füg Devins letzte Nachricht nochmal ein, dann geht es weiter.' }), einfuegenBlock('Link von Devin einfügen')));
  }
  standbilder(lade3d, [...document.querySelectorAll('[data-vorschau]')].filter((el) => el.dataset.vorschau && !el.querySelector('img')), (id) => UEBUNGEN[id]).catch(() => {});
  // laufendes Training nach Neuladen wieder zeigen. Seit 24.11.2026 nur, wenn der letzte Schritt keine 30 Minuten her ist und es nicht ausgeblendet wurde:
  // Wer Stunden später öffnet, sieht auf „Heute“ zuerst das offene Training mit Stand und „Training fortsetzen“.
  if (LAUF && LAUF.phase !== 'fertig' && !TM.el && !LAUF.gym && !TM.klein && Date.now() - (LAUF.seit || 0) < 30 * 60000) setTimeout(timerZeigen, 0);
}

/* ---------- Willkommen ---------- */
/* ---------- Code-Leiste (07.11.2026, Devin: „eine Leiste, wo du auf der Webseite deinen Code direkt eingeben kannst … als Erstes gezeigt“) ----------
   Der Kunde tippt nur den Code aus Devins Nachricht. Die Seite fragt den Code-Briefkasten (Google-Skript in Devins Konto) mit einer Prüfsumme
   des Codes, nie mit dem Code selbst, und bekommt den verschlüsselten Plan zurück. Danach läuft alles wie beim Link: Code schließt auf, anmelden(). */

/* ---------- Code-Briefkasten, Fassung 4 (19.11.2026, Devin: „dass wirklich der Login … perfekt abgelaufen wird“, „so eine Leiste … an und aus … steuern“) ----------
   Der Briefkasten kennt jeden Code, sobald Devin ihn in der Trainer-Seite erstellt: kein Freischalten, keine Mail nötig, auch 12 Ziffern und Codes per WhatsApp.
   Ein Code geht beliebig oft (Safari, App vom Home-Bildschirm, neues Handy): Das iPhone trennt Safari und Home-Bildschirm-App, ein Einmalcode sperrte dort aus.
   Sperren geht über Devins Schalter an/aus: Dann sagt der Briefkasten „aus“, die App sperrt und löscht den Plan vom Handy (Code und eigene Trainings bleiben,
   schaltet Devin wieder an, kommt der Plan von selbst zurück). Ohne Internet bleibt alles, wie es ist (offline zuerst): Die Sperre greift beim nächsten Öffnen mit Internet.
   Gefragt wird nur mit der Prüfsumme des Codes. Im Briefkasten liegt nur der verschlüsselte Plan, ohne Name und andere persönliche Daten (die kommen nur mit dem Link).
   Briefkasten vor Fassung 4 (ohne doPost): Die App fällt auf den alten Weg (?k=) zurück, alles geht wie vorher. */
async function pruefsummeVon(salz, text) {
  const roh = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salz + text));
  return Array.from(new Uint8Array(roh), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function briefFragen(daten, ms) {   // POST mit JSON als Text: kein Vorab-Check des Browsers, keine Cookies, nichts in der Adresse
  if (!KONTAKT.briefkasten) return { ok: false, grund: 'ohne' };
  if (navigator.onLine === false) return { ok: false, grund: 'netz' };
  const stopp = new AbortController(), uhr = setTimeout(() => stopp.abort(), ms || 20000);
  try {
    const r = await fetch(KONTAKT.briefkasten, { method: 'POST', body: JSON.stringify(daten), cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: stopp.signal });
    if (!r.ok) return { ok: false, grund: 'netz' };
    const text = await r.text();
    try { const j = JSON.parse(text); return j && typeof j === 'object' && !Array.isArray(j) ? j : { ok: false, grund: 'alt' }; } catch (e) { return { ok: false, grund: 'alt' }; }   // vor Fassung 4: HTML „doPost nicht gefunden“
  } catch (e) { return { ok: false, grund: 'netz' }; } finally { clearTimeout(uhr); }
}
async function codeFrage(code) { const z = K.appCodeNormal(code); return { k: await pruefsummeVon('dk-zugang|', z), l: z.length }; }
// Darf dieser Code gerade rein? Nein nur, wenn der Briefkasten ausdrücklich „aus“ sagt. Kein Netz, alter Briefkasten, noch nicht eingetragen: ja (offline zuerst).
async function freiFuer(code) {
  if (!KONTAKT.briefkasten || navigator.onLine === false) return true;
  const r = await briefFragen(Object.assign({ a: 'stand', t: Date.now() + 864e5 }, await codeFrage(code)), 8000);   // t in der Zukunft: nur an/aus, kein Plan
  return !(r.ok && r.an === false);
}
// Devin hat den Zugang ausgeschaltet: Plan vom Handy, das Konto bleibt mit Code (schaltet er wieder an, kommt der Plan von selbst zurück)
function sperren(id) {
  kontoSetzen(id, { aus: Date.now() });
  const plaene = speicher.lies('dk_plaene', {}); delete plaene[id]; speicher.schreib('dk_plaene', plaene);
  if (LAUF && LAUF.plan === id) laufSchliessen();
  S.tagWahl = null;
}
// Neuer Stand oder Sperre von Devin: beim Öffnen, bei Rückkehr in die App und wenn das Internet wiederkommt. Nie mitten im Training oder Gym.
let STAND_ZULETZT = 0;
// Fassung 5 (22.11.2026, Devin: „nach der Zahlung automatisch wieder drin“): Das Ende, das der Briefkasten nennt, gilt, auch ohne neuen Plan
// (Verlängerung nach Zahlung). Früher als bisher = „abgelaufen“, später = wieder drin, leer = ohne Ende. Nur ein Datum oder leer wird übernommen.
function bisUebernehmen(id, r) {
  if (!id || !r || typeof r.bis !== 'string' || (r.bis && !/^\d{4}-\d{2}-\d{2}$/.test(r.bis))) return false;
  const ko = konten()[id];
  if (!ko || (ko.bis || '') === r.bis) return false;
  kontoSetzen(id, { bis: r.bis });
  return true;
}
// Zeit des Eintrags im Briefkasten merken (nach einer Zeile „Plan behalten“ ist sie neuer als die Zeit im Plan): sonst holt die App bei jedem Öffnen denselben Plan.
// Erst nach anmelden aufrufen, sonst hielte anmelden den Plan für älter und nähme ihn nicht.
function standMerken(id, r) {
  const ko = konten()[id];
  if (ko && r && typeof r.t === 'number' && r.t > (ko.t || 0) && r.t <= Date.now() + 1728e5) kontoSetzen(id, { t: r.t });
}
async function zugangPruefen(vonHand) {
  const ko = aktivesKonto();
  if (!ko || !ko.code || !KONTAKT.briefkasten) return 'kein';
  if (navigator.onLine === false) return 'offline';
  if (!vonHand && (Date.now() - STAND_ZULETZT < 60000 || document.querySelector('.raum, .tm, .blatt.offen'))) return 'warte';
  STAND_ZULETZT = Date.now();
  const hatPlan = !!speicher.lies('dk_plaene', {})[ko.id];
  const r = await briefFragen(Object.assign({ a: 'stand', t: hatPlan || !ko.plan ? ko.t || 0 : 0 }, await codeFrage(ko.code)));   // Plan fehlt (war aus): ganz neu holen
  if (!r.ok) return r.grund || 'netz';   // alt, unbekannt (noch nicht eingetragen), netz, pause: nichts ändern
  if (r.an === false) { sperren(ko.id); zeichne(); return 'aus'; }
  const warAus = !!ko.aus;
  if (warAus) kontoSetzen(ko.id, { aus: null });
  const bisNeu = bisUebernehmen(ko.id, r);   // Verlängerung nach Zahlung oder Ablauf: gilt sofort, ohne neuen Plan
  if (r.erneuert || !r.neu || typeof r.z !== 'string') { if (warAus || bisNeu) zeichne(); return r.erneuert ? 'erneuert' : bisNeu ? 'bis' : 'aktuell'; }
  let d = null; try { d = await K.entpacken(ko.code, r.z); } catch (e) {}
  if (!linkDatenOk(d) || d.k !== ko.id) { if (warAus) zeichne(); return 'passt-nicht'; }
  if (!vonHand && document.querySelector('.raum, .tm, .blatt.offen')) { STAND_ZULETZT = 0; return 'warte'; }   // inzwischen ein Training geöffnet: später
  const ansichtVorher = S.ansicht;
  anmelden(d, ko.code, r.z);
  bisUebernehmen(ko.id, r);   // der Plan trägt das Ende vom Erstellen, der Briefkasten kennt die Verlängerung
  standMerken(ko.id, r);
  if (!vonHand) S.ansicht = ansichtVorher;   // von selbst: die Seite bleibt, wo man war
  zeichne(); fotosVorladen();
  return 'neu';
}
// Offline klar anzeigen
function netzAnzeigen() {
  let el = document.getElementById('netz-hinweis');
  if (navigator.onLine !== false) { if (el) el.remove(); return; }
  if (el) return;
  document.body.append(h('div', { id: 'netz-hinweis', class: 'netz-hinweis', role: 'status' }, h('b', { text: 'Offline' }), h('span', { text: Object.keys(speicher.lies('dk_plaene', {}) || {}).length ? ' · Dein Plan geht trotzdem. Neues kommt, sobald du wieder online bist.' : ' · Gerade kein Internet. Sobald du wieder online bist, geht es weiter.' })));
}
const CODE_TEXTE = {
  netz: 'Keine Verbindung. Bitte mit Internet nochmal versuchen.',
  unbekannt: 'Diesen Code kennt die Seite nicht. Prüf die Ziffern in Devins Nachricht. Hat er ihn gerade erst erstellt? Dann tipp gleich nochmal auf Einloggen.',
  'passt-nicht': 'Der Code passt nicht. Schau nochmal in Devins Nachricht.',
  aus: 'Dein Zugang ist gerade ausgeschaltet. Schreib Devin, dann schaltet er ihn wieder an.',
  erneuert: 'Für dich gibt es einen neuen Code. Nimm den Code aus Devins neuester Nachricht.',
  abgelaufen: 'Dein Zugang ist abgelaufen. Ist er verlängert, geht derselbe Code wieder, ohne neuen Link.',
  pause: 'Zu viele falsche Versuche mit alten Codes. Bitte in 10 Minuten nochmal.'
};
async function codeHolen(code) {
  const ziffern = K.appCodeNormal(code), frage = await codeFrage(ziffern);
  let r = await briefFragen(Object.assign({ a: 'holen' }, frage));
  if (!r.ok && r.grund === 'unbekannt') { await new Promise((ok) => setTimeout(ok, 3500)); r = await briefFragen(Object.assign({ a: 'holen' }, frage)); }   // gerade erst erstellt: einmal nachfassen
  let teil = '';
  if (r.ok && typeof r.z === 'string') teil = r.z.trim();
  else if (r.grund === 'alt') {   // Briefkasten vor Fassung 4: GET wie bisher
    const stopp = new AbortController(), uhr = setTimeout(() => stopp.abort(), 20000);
    try {
      const g = await fetch(KONTAKT.briefkasten + '?k=' + frage.k, { cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: stopp.signal });
      if (!g.ok) return 'netz';
      teil = (await g.text()).trim();
    } catch (e) { return 'netz'; } finally { clearTimeout(uhr); }
  } else return { aus: 'aus', abgelaufen: 'abgelaufen', erneuert: 'erneuert', pause: 'pause', unbekannt: 'unbekannt' }[r.grund] || 'netz';
  if (!teil || teil === 'leer' || !/^[A-Za-z0-9_-]{20,}$/.test(teil)) return 'unbekannt';
  let d = null;
  try { d = await K.entpacken(ziffern, teil); } catch (e) {}
  if (!linkDatenOk(d)) return 'passt-nicht';
  if (konten()[d.k] && konten()[d.k].aus) kontoSetzen(d.k, { aus: null });   // der Code geht wieder: Devin hat angeschaltet
  anmelden(d, ziffern, teil);
  bisUebernehmen(d.k, r);   // erstes Holen: das Ende aus dem Briefkasten (nach einer Zahlung später als im Plan)
  standMerken(d.k, r);
  return 'ok';
}
/* Kurzer Link mit Code (21.11.2026, Devin: „ein kleiner Link … der Kunde gibt einmal den Code ein und dann direkt wird das funktionieren … er kriegt direkt seinen Trainingsplan“):
   devin-kanke.com/#c=<Code>. Antippen reicht: Die App holt den Plan mit dem Code beim Briefkasten, wie die Code-Leiste. Ist der Code gerade erst erstellt, fasst sie
   noch zweimal nach (der Briefkasten holt Devins Entwurf in Sekunden ab). Kein Netz oder ein anderer Grund: Code-Leiste mit dem Code vorbelegt und einem klaren Satz.
   Steht das Konto schon auf diesem Handy, geht der Link ohne Netz auf (Neues holt zugangPruefen). Den Code nimmt die App aus der Adresszeile, außer in Safari am iPhone:
   Dort nimmt „Zum Home-Bildschirm“ den Link mit, und die App vom Home-Bildschirm loggt damit beim ersten Start von selbst ein. */
async function codeLinkEinlesen(ziffern) {
  linkAusAdresse();
  const da = Object.values(konten()).find((k) => k && k.code && K.appCodeNormal(k.code) === ziffern);
  if (da && !da.aus) { speicher.schreib('dk_konto', da.id); speicher.schreib('dk_aktiv', da.id); S.codeLink = null; S.codeFehler = null; return true; }
  S.codeLink = ziffern; S.codeFehler = null; S.laedt = true; zeichne();
  let aus = await codeHolen(ziffern);
  for (let i = 0; i < 2 && aus === 'unbekannt'; i++) { await new Promise((ok) => setTimeout(ok, 4000)); aus = await codeHolen(ziffern); }
  S.laedt = false;
  if (aus === 'ok') { S.codeLink = null; fotosVorladen(); return true; }
  S.codeFehler = aus;   // die Code-Leiste zeigt den Code und den Grund; kommt das Internet wieder, versucht die App es von selbst nochmal
  return true;
}
function laedtAnsicht() {
  return [h('section', { class: 'block willkommen', 'aria-busy': 'true' }, logo(), h('h1', { text: 'Einen Moment …' }),
    h('p', { class: 'leise', role: 'status', text: 'Dein Plan wird geladen. Das dauert nur ein paar Sekunden.' }))];
}
// Nach dem ersten Einloggen auf diesem Handy: Schwarz-Gold (Devin, 21.11.2026), seit 24.11.2026 Champagner (warmes Anthrazit, Champagnergold). Wer danach selbst umschaltet, behält seine Wahl.
function farbeNachLogin() {
  try { localStorage.setItem('dk_look', 'champagner'); } catch (e) {}
  const root = document.documentElement;
  if (root.dataset.look === 'champagner') return;
  root.dataset.look = 'champagner';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = '#131416';
  try { window.dispatchEvent(new CustomEvent('dk-look', { detail: 'champagner' })); } catch (e) {}
}
// QA 25.11.2026 (Rolle 10): Wer Code oder Nachricht verloren hat, fand Devin nur im Impressum. Jetzt direkt am Code-Feld.
function codeVerlorenZeile() {
  if (!KONTAKT.mail) return null;
  return h('p', { class: 'leise klein code-verloren' }, 'Code oder Nachricht verloren? ',
    h('a', { href: 'mailto:' + KONTAKT.mail + '?subject=' + encodeURIComponent('Code verloren'), text: 'Schreib Devin' }), ', dann schickt er dir einen neuen.');
}
function codeLeiste(art) {   // art 'zugang': schon eingeloggt (Infos), dann heißt die Leiste „Neuer Code von Devin?“
  if (!KONTAKT.briefkasten) return null;
  const status = h('p', { class: 'klein', role: 'status', text: !art && S.codeFehler ? CODE_TEXTE[S.codeFehler] || CODE_TEXTE.netz : null });   // kurzer Link ging nicht: warum
  let laeuft = false;
  const feld = h('input', { class: 'eingabe code-feld', id: 'code-start', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '14', placeholder: '0000-0000-0000',
    value: !art && S.codeLink ? K.appCodeAnzeige(S.codeLink) : null,
    'aria-describedby': 'code-start-hilfe',
    oninput: (e) => { const buchstaben = /[^\d\s-]/.test(e.target.value); if (codeTippen(e.target) === 12) los(); else if (buchstaben) status.textContent = 'Der Code hat nur Ziffern, Buchstaben gehören nicht dazu.'; },   // Kunden-Test 23.11.2026
    onkeydown: (e) => { if (e.key === 'Enter') los(); } });
  const knopfText = art === 'zugang' ? 'Einlösen' : 'Einloggen';   // unter Infos ist man schon eingeloggt (Gesamttest 13.11.2026)
  const knopf = h('button', { class: 'knopf haupt', type: 'button', onclick: () => los(), text: knopfText });
  async function los() {
    if (laeuft) return;
    if (!K.appCodeGueltig(feld.value)) { status.textContent = codeFalsch(feld.value); return; }
    laeuft = true; knopf.disabled = true; knopf.textContent = 'Prüfe …'; status.textContent = 'Einen Moment, das dauert ein paar Sekunden.';
    const aus = await codeHolen(feld.value);
    if (aus === 'ok') { S.codeLink = null; S.codeFehler = null; zeichne(); window.scrollTo(0, 0); fotosVorladen(); toast(art === 'zugang' ? 'Fertig, dein Plan ist auf dem neuesten Stand.' : 'Fertig, du bist eingeloggt.'); return; }
    laeuft = false; knopf.disabled = false; knopf.textContent = knopfText;
    status.textContent = CODE_TEXTE[aus] || CODE_TEXTE.netz;
    feld.select();
  }
  // QA 25.11.2026 (Rolle 08): Ging ein kurzer Link nicht (z. B. kein Netz), stand der Grund unter dem ersten Bildschirm, man sah nur die Startseite.
  if (!art && S.codeFehler && S.codeFehlerGezeigt !== S.codeFehler) { S.codeFehlerGezeigt = S.codeFehler; requestAnimationFrame(() => { const l = document.querySelector('.code-leiste'); if (l) l.scrollIntoView({ block: 'center' }); }); }
  return h('section', { class: 'block code-leiste' },
    h('label', { class: 'lbl', for: 'code-start', text: art === 'zugang' ? 'Neuer Code von Devin?' : 'Schon Kunde? Code von Devin' }),
    h('p', { class: 'leise klein', id: 'code-start-hilfe', text: art === 'zugang' ? 'Neue Pläne kommen von selbst, sobald du online bist. Hat Devin dir einen neuen Code geschickt? Dann hier eingeben.' : 'Hier eingeben, dann ist dein Plan da und bleibt auf dem Handy, auch ohne Internet.' }),
    h('div', { class: 'code-reihe' }, feld, knopf), status, art ? null : codeVerlorenZeile());
}
function pausiertAnsicht() {   // Schalter „aus“ bei Devin: kein Plan, nur ein klarer Satz und „Nochmal prüfen“
  const ko = aktivesKonto(), vn = vorname(ko.n);
  const knopf = h('button', { class: 'knopf haupt', type: 'button', text: 'Nochmal prüfen', onclick: async () => {
    knopf.disabled = true; knopf.textContent = 'Prüfe …';
    const r = await zugangPruefen(true);
    if (r === 'neu' || r === 'aktuell' || r === 'erneuert') return;
    knopf.disabled = false; knopf.textContent = 'Nochmal prüfen';
    toast(r === 'aus' ? 'Noch ausgeschaltet. Schreib Devin.' : r === 'offline' || r === 'netz' ? 'Keine Verbindung. Bitte mit Internet nochmal.' : 'Gerade nicht möglich. Bitte später nochmal.');
  } });
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: (vn ? vn + ', dein' : 'Dein') + ' Zugang ist pausiert' }),
    h('p', { class: 'leise', text: 'Devin hat deinen Zugang gerade ausgeschaltet. Schreib ihm, wenn du weitermachen willst. Sobald er ihn wieder anschaltet, ist dein Plan von selbst wieder da.' }),
    knopf, h('button', { class: 'knopf text', type: 'button', onclick: abmelden, text: 'Abmelden' }))];
}
function willkommen() {
  return [codeLeiste(), h('section', { class: 'block willkommen' },
    h('img', { class: 'logo', src: 'icon.svg', alt: '' }),
    h('h1', { text: 'Dein Trainingsplan' }),
    h('p', { class: 'leise', text: installiert()
      ? (KONTAKT.briefkasten ? 'Gib oben deinen Code von Devin ein. Oder kopier seine Nachricht und füg sie hier ein. Danach bleibst du eingeloggt, auch ohne Internet.' : 'Kopier die Nachricht von Devin (Link und Code) und füg sie hier ein. Danach bleibst du eingeloggt, auch ohne Internet.')
      : 'Öffne den Link, den dir Devin geschickt hat, und gib deinen Code ein. Danach ist dein Plan hier gespeichert und funktioniert auch ohne Internet.' }),
    einfuegenBlock(),
    h('button', { class: 'knopf text', type: 'button', onclick: beispiel, text: 'Beispielplan ansehen' })),
    installKarte(true)];
}

/* ---------- Startseite (04.11.2026, Devin: „die Webseite so wie Apple“): für alle ohne Plan. Aufbau wie dort: jeder Block eine kurze Überschrift, eine Zeile, Knöpfe, ein großes Bild. Oben trainiert die echte Figur live. In der App vom Home-Bildschirm bleibt es beim knappen Willkommen, dort will man nur noch den Link einfügen. ---------- */
const START_FIGUR = 'kniebeuge', START_UEBUNG = 'beinpresse';
let START3D = null, STARTSEHEN = null, STARTBUEHNE = null;
function startWeg() {
  if (START3D) { START3D.weg(); START3D = null; }
  if (STARTSEHEN) { STARTSEHEN.disconnect(); STARTSEHEN = null; }
  if (STARTBUEHNE) { STARTBUEHNE.disconnect(); STARTBUEHNE = null; }
}
const startBild = (name, alt, b, h2) => h('img', { src: 'start/' + name + ({ klar: '-klar', gold: '-gold', sport: '-gold', champagner: '-gold' }[document.documentElement.dataset.look] || '') + '.jpg', alt, width: b, height: h2, loading: 'lazy', onerror: (e) => e.target.remove() });
// Blöcke erscheinen beim Hinscrollen, die Figur rechnet nur, solange sie zu sehen ist
function startBeobachten() {
  const bloecke = [...document.querySelectorAll('.st-block:not(.da)')];
  if (STARTSEHEN) STARTSEHEN.disconnect();
  if (!window.IntersectionObserver) { bloecke.forEach((b) => b.classList.add('da')); return; }
  STARTSEHEN = new IntersectionObserver((liste) => liste.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('da'); STARTSEHEN.unobserve(e.target); } }), { threshold: 0, rootMargin: '0px 0px 12% 0px' });
  bloecke.forEach((b) => STARTSEHEN.observe(b));
  if (START3D && !STARTBUEHNE) { STARTBUEHNE = new IntersectionObserver((liste) => { if (START3D) START3D.ruhe(!liste[liste.length - 1].isIntersecting); }); STARTBUEHNE.observe(START3D.el); }
}
function gymZeigen() { beispiel(); raumStarten(aktiverPlan(), 0); window.scrollTo(0, 0); }
function uebungZeigen() { beispiel(); const p = aktiverPlan(); oeffneUebung(uebung(p.t[0].u.find((u) => u.i === START_UEBUNG) || p.t[0].u[0]), 0); }
function beispielEnde() {
  const plaene = speicher.lies('dk_plaene', {}); delete plaene.beispiel; speicher.schreib('dk_plaene', plaene);
  if (speicher.lies('dk_aktiv', null) === 'beispiel') speicher.schreib('dk_aktiv', null);
  if (LAUF && LAUF.plan === 'beispiel') { LAUF = null; laufSichern(); }
  S.tagWahl = null; S.ansicht = 'heute'; zeichne(); window.scrollTo(0, 0);
}
/* ---------- Startseite als Rundgang mit Devin (24.11.2026, Redesign) ----------
   Erster Bildschirm: Angebot, wie es funktioniert, Preis mit Ende der Gratiszeit und die nächste Aktion, sofort lesbar und ohne 3D (die Figur lud vorher ~3,8 MB).
   Danach hat jeder Abschnitt eine Aufgabe: echter Ausschnitt aus dem Beispielplan, Devins Prüfung, Leistung und Preis, das Gym (optional), schon Kunde.
   Bewegung: nur Planvorschau und Devins Abschnitt erscheinen sanft (8 px, 220 ms, einmal). Ohne JavaScript oder bei weniger Bewegung steht alles sofort da. */
// Analyse-Schritte wie analyse.html → schritte(): Über dich 1 + Fragen 10 + Gesundheits-Check 1 + Essen 1 (fällt bei Essstörung weg) + Nährwerte 1 + Einwilligung 1 + Abschicken 1.
// Höchstens 16, mit Essstörung 15. Ändert sich der Ablauf in analyse.html, hier mitändern (vorher stand 16 im Text und 18 im Kommentar).
const PLAETZE = 'Maximal 10 Plätze in den ersten zwei Monaten.';   // Devin 24.11.2026: nur der Satz, kein Zähler
const ANALYSE_SCHRITTE = 16, ANALYSE_MINUTEN = 10;
const analyseAngefangen = () => { const a = speicher.lies('dk_analyse10', null); return !!(a && !a.gesendet && a.schritt > 0); };   // Kunden-Test 23.11.2026: angefangene Analyse heißt „fortsetzen“
const analyseKnopf = (klasse) => h('a', { class: 'knopf haupt ' + (klasse || ''), href: 'analyse/', text: analyseAngefangen() ? 'Analyse fortsetzen' : 'Analyse starten' });
const beispielKnopf = (klasse, text) => h('button', { class: 'knopf ' + (klasse || 'zweit'), type: 'button', onclick: beispiel, text: text || 'Beispielplan ansehen' });
// Preis in einem Satz, schon beim ersten Preis mit dem Ende der Gratiszeit
function preisSatz(a) { return gratisZeit(a) + ' kostenlos, endet automatisch. Danach ' + a.preis + ' € im Monat, nur wenn du weitermachen willst.'; }
// „Ich habe einen Code“: kompakt neben den Aktionen, öffnet die Code-Leiste an Ort und Stelle. Kam jemand über einen kurzen Link, ist sie schon offen.
function codeZugang() {
  if (!KONTAKT.briefkasten) return null;
  const offen = !!(S.codeOffen || S.codeLink || S.codeFehler);
  const knopf = h('button', { class: 'knopf text rg-code-knopf', type: 'button', 'aria-expanded': String(offen), 'aria-controls': 'rg-code', text: 'Ich habe einen Code',
    onclick: () => { S.codeOffen = !offen; const y = window.scrollY; zeichne(); window.scrollTo(0, y); if (S.codeOffen) { const f = document.getElementById('code-start'); if (f) f.focus(); } } });
  return h('div', { class: 'rg-code' }, knopf, offen ? h('div', { id: 'rg-code' }, codeLeiste()) : null);
}
const heldBild = () => { const hell = /^(klar|lagune)$/.test(document.documentElement.dataset.look || ''); return 'hintergrund-breit' + (hell ? '-hell' : '') + '.jpg'; };
// Sanftes Erscheinen an zwei Stellen. Schon vorbeigescrollt (schnelles Scrollen) = sofort sichtbar, ohne Effekt. Einmal pro Abschnitt, Zurückscrollen bewegt nichts.
let RUNDGANG = null;
function rundgangBeobachten() {
  if (RUNDGANG) { RUNDGANG.disconnect(); RUNDGANG = null; }
  const teile = [...document.querySelectorAll('.rg-erscheint:not(.rg-da)')];
  const ruhig = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (ruhig || !window.IntersectionObserver) return;   // ohne Effekt: Inhalt steht ohnehin da (die Klasse rg-bereit fehlt)
  RUNDGANG = new IntersectionObserver((liste) => liste.forEach((e) => {
    const el = e.target;
    if (e.isIntersecting) { el.classList.add('rg-da'); RUNDGANG.unobserve(el); }
    else if (e.boundingClientRect.bottom < 0) { el.classList.add('rg-sofort', 'rg-da'); RUNDGANG.unobserve(el); }   // übersprungen
  }), { threshold: 0.12 });
  teile.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight) return; el.classList.add('rg-bereit'); RUNDGANG.observe(el); });   // nur, was noch unterhalb liegt
  // Sicherheitsnetz: Ein Sprung über den Abschnitt hinweg (Anker #preis, sehr schnelles Wischen) meldet der Beobachter nicht. Was erreicht oder übersprungen ist, steht sofort da.
  if (!RUNDGANG_NETZ) {
    RUNDGANG_NETZ = true;
    let uhr = 0;
    window.addEventListener('scroll', () => {
      if (uhr) return;
      uhr = requestAnimationFrame(() => {
        uhr = 0;
        document.querySelectorAll('.rg-erscheint.rg-bereit:not(.rg-da)').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0) el.classList.add('rg-sofort', 'rg-da'); else if (r.top < window.innerHeight * 0.92) el.classList.add('rg-da');
          if (el.classList.contains('rg-da') && RUNDGANG) RUNDGANG.unobserve(el);
        });
      });
    }, { passive: true });
  }
}
let RUNDGANG_NETZ = false;
function planVorschau() {
  const p = beispielPlan(), t = p.t[0];
  return h('div', { class: 'rg-plan', role: 'group', 'aria-label': 'Ausschnitt aus dem Beispielplan' },
    h('div', { class: 'rg-plan-kopf' }, h('span', { class: 'nr', text: 'Training 1' }), h('h3', { text: t.n }), h('span', { class: 'leise klein zahl', text: '~' + t.m + ' min' })),
    h('ol', { class: 'rg-zeilen' }, t.u.slice(0, 4).map((roh) => {
      const u = uebung(roh);
      return h('li', { class: 'rg-zeile' }, h('b', { class: 'rg-name', text: anzeigeName(u) }),
        h('span', { class: 'rg-werte' }, h('span', null, h('small', { text: 'Sätze' }), h('b', { class: 'zahl', text: String(u.saetze) })),
          h('span', null, h('small', { text: 'Wdh' }), h('b', { class: 'zahl', text: bereich(u.wdh) })),
          h('span', null, h('small', { text: 'Reserve' }), h('b', { class: 'zahl', text: bereich(u.rir) + ' Wdh' })),
          h('span', null, h('small', { text: 'Pause' }), h('b', { class: 'zahl', text: pauseText(u) }))));
    })),
    h('p', { class: 'leise klein', text: '+ ' + (t.u.length - 4) + ' weitere Übungen. Alle mit 3D-Figur, Timer und Eintragen im Training.' }));
}
function startseite() {
  startWeg();
  if (installiert()) return willkommen();
  setTimeout(rundgangBeobachten, 0);
  const a = KONTAKT.abo, ue = KONTAKT.ueber_mich;
  // Devins Text aus kontakt.json: die Sätze zur Prüfung beim Vorstellen, der Satz zur Abrechnung bei Preis und Bedingungen
  const saetze = ue ? ue.text.split(/(?<=\.)\s+/) : [], abrechnung = saetze.filter((x) => /Abrechnung/.test(x)), vorstellung = saetze.filter((x) => !/Abrechnung/.test(x));
  return [
    h('section', { class: 'rg-held', 'aria-labelledby': 'rg-titel' },
      h('div', { class: 'rg-held-text' },
        h('p', { class: 'rg-marke', text: KONTAKT.marke }),
        h('h1', { id: 'rg-titel', text: 'Dein Trainingsplan. Von Devin.' }),
        h('p', { class: 'rg-wie', text: 'Du beantwortest ein paar Fragen. Ich schaue mir deine Antworten an und erstelle deinen Plan.' }),
        h('p', { class: 'rg-dauer leise klein', text: 'Höchstens ' + ANALYSE_SCHRITTE + ' kurze Schritte, etwa ' + ANALYSE_MINUTEN + ' Minuten. Dein Entwurf bleibt auf diesem Handy, du kannst jederzeit weitermachen.' }),
        h('div', { class: 'rg-aktionen' }, analyseKnopf('rg-gross'), beispielKnopf('zweit rg-gross')),
        a ? h('p', { class: 'rg-preis' }, h('b', { text: gratisZeit(a) + ' kostenlos' }), ', endet automatisch. Danach ' + a.preis + ' € im Monat, nur wenn du weitermachen willst. ', h('span', { class: 'rg-plaetze', text: PLAETZE })) : null,
        codeZugang()),
      h('div', { class: 'rg-held-bild' }, h('img', { src: heldBild(), alt: 'Das DK-Gym: Blick durch die Glasfront aufs Meer, davor Bänke und Geräte', width: 1600, height: 900, fetchpriority: 'high', decoding: 'async' }))),
    h('section', { class: 'rg-teil rg-erscheint', 'aria-labelledby': 'rg-vorschau' },
      h('div', { class: 'rg-teil-text' }, h('p', { class: 'rg-klein-titel', text: 'Das bekommst du' }), h('h2', { id: 'rg-vorschau', text: 'Ein Plan, der auf eine Handfläche passt.' }),
        h('p', { class: 'leise', text: 'Sätze, Wiederholungen, Reserve und Pause auf einen Blick. Ein Ausschnitt aus dem echten Beispielplan.' }),
        h('div', { class: 'rg-aktionen' }, beispielKnopf('zweit'))),
      planVorschau()),
    h('section', { class: 'rg-teil rg-devin rg-erscheint', 'aria-labelledby': 'rg-devin' },
      h('div', { class: 'rg-teil-text' }, h('p', { class: 'rg-klein-titel', text: 'Persönlich geprüft' }), h('h2', { id: 'rg-devin', text: ue ? ue.zeile : 'Devin Kanke.' }),
        vorstellung.length ? h('p', { class: 'rg-zitat', text: vorstellung.join(' ') }) : null),
      h('ol', { class: 'rg-schritte' },
        h('li', null, h('b', { text: 'Du beantwortest die Analyse.' }), h('span', { class: 'leise', text: 'Ziele, Training, Gesundheits-Check. Höchstens ' + ANALYSE_SCHRITTE + ' Schritte.' })),
        h('li', null, h('b', { text: 'Devin schaut sich alles an.' }), h('span', { class: 'leise', text: 'Er meldet sich innerhalb von 24 Stunden und baut deinen Plan.' })),
        h('li', null, h('b', { text: 'Du trainierst mit deinem Plan.' }), h('span', { class: 'leise', text: 'Link und Code von Devin öffnen ihn auf deinem Handy, auch ohne Internet.' })))),
    a ? h('section', { class: 'rg-teil rg-angebot', id: 'preis', 'aria-labelledby': 'rg-preis' },
      h('div', { class: 'rg-teil-text' }, h('p', { class: 'rg-klein-titel', text: 'Leistung und Preis' }), h('h2', { id: 'rg-preis', text: gratisZeit(a) + ' kostenlos.' }),
        h('p', { class: 'leise', text: 'Keine Zahlungsdaten für die Gratiszeit. Sie endet automatisch, du musst nichts kündigen. Machst du nicht weiter, kostet es nichts: Die App zeigt dann statt des Plans „Zugang abgelaufen“.' }),   // QA 25.11.2026 (Rolle 05)
        h('p', { class: 'rg-plaetze', text: PLAETZE })),
      h('div', { class: 'rg-preis-karte' },
        h('ul', { class: 'rg-leistung' }, a.punkte.map((x) => h('li', { text: x }))),
        h('p', { class: 'rg-betrag' }, h('b', { class: 'zahl', text: a.preis + ' €' }), h('span', { text: ' im Monat danach' })),
        h('p', { class: 'leise klein', text: 'Nur wenn du weitermachen willst: Abo über PayPal, verlängert sich monatlich, jederzeit zum Monatsende kündbar. Unter 18 nur zusammen mit deinen Eltern.' + (abrechnung.length ? ' ' + abrechnung.join(' ') : '') }),
        analyseKnopf('rg-gross'))) : null,
    h('section', { class: 'rg-teil rg-gym', 'aria-labelledby': 'rg-gym' },
      h('div', { class: 'rg-teil-text' }, h('p', { class: 'rg-klein-titel', text: 'Optional' }), h('h2', { id: 'rg-gym', text: 'Dein Gym mit Meerblick. In 3D.' }),
        h('p', { class: 'leise', text: 'Geh von Gerät zu Gerät. Jede geschaffte Station bringt Punkte, die Punkte ergeben deinen Rang. Dein Plan funktioniert genauso ohne das Gym.' }),
        h('div', { class: 'rg-aktionen' }, h('button', { class: 'knopf zweit', type: 'button', onclick: gymZeigen, text: 'Ins Gym' }), h('button', { class: 'knopf text', type: 'button', onclick: uebungZeigen, text: 'Eine Übung in 3D ansehen' }))),
      h('figure', { class: 'rg-gym-bild' }, startBild('gym', 'Das DK-Gym in 3D: Weg mit Stationen, die Figur und die Tür zum PR-Raum', 1000, 845))),
    h('section', { class: 'rg-teil rg-eigen', 'aria-labelledby': 'rg-eigen' },
      h('div', { class: 'rg-teil-text' }, h('h2', { id: 'rg-eigen', text: 'Du hast schon einen Plan?' }),
        h('p', { class: 'leise', text: 'Öffne den Link aus Devins Nachricht oder gib deinen Code ein. Du kannst auch die ganze Nachricht kopieren und hier einfügen.' })),   // Kunden-Test 23.11.2026
      h('div', { class: 'stapel' }, S.codeOffen || S.codeLink || S.codeFehler ? null : codeLeiste(), einfuegenBlock(),   // oben schon offen: nur einmal, die Felder haben feste ids
        h('details', { class: 'rg-install' }, h('summary', { text: 'Als App aufs Handy' }), installKarte(true)))),
    h('footer', { class: 'st-fuss' }, h('span', { text: KONTAKT.marke }), rechtlichesLinks())
  ];
}

/* ---------- Code, Sperre, Warten ---------- */
const logo = () => h('img', { class: 'logo', src: 'icon.svg', alt: '' });
function codeAnsicht() {
  const fehler = h('p', { class: 'klein', role: 'status' });
  let laeuft = false;
  const feld = h('input', { class: 'eingabe code-feld', id: 'code', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '14', placeholder: '0000-0000-0000',
    oninput: (e) => { if (codeTippen(e.target) === 12) los(); },
    onkeydown: (e) => { if (e.key === 'Enter') los(); } });
  const knopf = h('button', { class: 'knopf haupt', type: 'button', onclick: () => los(), text: 'Einloggen' });
  async function los() {
    if (laeuft) return;
    if (!K.appCodeGueltig(feld.value)) { fehler.textContent = codeFalsch(feld.value); return; }
    laeuft = true; knopf.disabled = true; knopf.textContent = 'Prüfe …'; fehler.textContent = '';
    let d = null;
    try { d = await K.entpacken(feld.value, S.wartet); } catch (e) {}
    let grund = '';
    if (linkDatenOk(d)) {
      if (await freiFuer(feld.value)) { anmelden(d, feld.value, S.wartet); zeichne(); window.scrollTo(0, 0); fotosVorladen(); return; }
      grund = 'aus';
    } else if (KONTAKT.briefkasten) {   // Link kaputt oder abgeschnitten (Instagram schneidet nach 1000 Zeichen ab): Der Code allein reicht
      const teil = S.wartet, aus = await codeHolen(feld.value);
      if (aus === 'ok') { gesehen(teil); zeichne(); window.scrollTo(0, 0); fotosVorladen(); toast('Fertig, du bist eingeloggt.'); return; }
      if (aus === 'aus' || aus === 'erneuert' || aus === 'abgelaufen' || aus === 'netz') grund = aus;
    }
    laeuft = false; knopf.disabled = false; knopf.textContent = 'Einloggen';
    // QA 25.11.2026 (Rolle 08): Der Link ließ sich mit dem Code nicht öffnen. Ohne Netz kann die App Devins Briefkasten nicht fragen, der Code passt aber sicher nicht zu diesem Link
    if (grund === 'netz') { fehler.textContent = 'Der Code passt nicht zu diesem Link. Prüf die Ziffern in Devins Nachricht. Ohne Internet kann die App nicht nachsehen, ob Devin dir einen neueren Code geschickt hat.'; feld.select(); return; }
    fehler.textContent = grund ? CODE_TEXTE[grund] : 'Der Code passt nicht zu diesem Link. Prüf die Ziffern in Devins Nachricht. Ist der Link abgeschnitten? Dann gib den Code oben auf devin-kanke.com ein.';
    feld.select();
  }
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: 'Willkommen bei DK Coach' }),
    h('p', { class: 'leise', text: 'Gib den Code aus Devins Nachricht ein. Danach bleibst du eingeloggt und brauchst ihn nicht mehr.' }),
    h('label', { class: 'lbl', for: 'code', text: 'Dein Code' }), feld, knopf, fehler, codeVerlorenZeile()),
    aktiverPlan() || aktivesKonto() ? h('button', { class: 'knopf text', type: 'button', onclick: () => { S.wartet = null; speicher.schreib('dk_wartet', null); zeichne(); }, text: 'Abbrechen' }) : null];
}
// Nach der Zahlung (26.11.2026): sofort beim Briefkasten nachsehen. Ist das Ende verlängert, zeichnet zugangPruefen schon neu (der Plan ist wieder da).
async function nachZahlungPruefen(e) {
  const b = e.currentTarget; b.disabled = true; b.textContent = 'Prüfe …';
  const r = await zugangPruefen(true);
  if (r === 'aus') return;
  if (!abgelaufen(aktivesKonto())) { toast('Fertig, du bist wieder drin.'); return; }
  b.disabled = false; b.textContent = 'Schon bezahlt? Nochmal prüfen';
  toast(r === 'offline' || r === 'netz' ? 'Keine Verbindung. Bitte mit Internet nochmal.' : 'Noch nicht da. Nach der Zahlung dauert es meist ein paar Minuten. Schau gleich nochmal.');
}
function abgelaufenAnsicht() {
  const ko = aktivesKonto(), vn = vorname(ko.n), a = KONTAKT.abo, link = bezahlLink(a, ko);
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: (vn ? vn + ', dein' : 'Dein') + ' Zugang ist abgelaufen' }),
    h('p', { class: 'leise', text: 'Er lief bis ' + datumDe(ko.bis) + '. Willst du weitermachen? ' + (link ? 'Schließ das Abo ab. Sobald die Zahlung da ist, bist du von selbst wieder drin, mit deinem Plan. Meist dauert das ein paar Minuten. Öffne dafür einfach wieder diese Seite.' : 'Schreib Devin. Seinen neuen Link öffnest du einfach, der Code ist schon gespeichert.') }),
    a ? weiterAbo(a, ko) : null,
    link && ko.code && KONTAKT.briefkasten ? h('button', { class: 'knopf text', type: 'button', text: 'Schon bezahlt? Nochmal prüfen', onclick: nachZahlungPruefen }) : null,
    // QA 25.11.2026 (Rolle 09): Der Text sagte „Schreib Devin“, aber ohne Weg zu ihm (Infos und Impressum sind hier nicht erreichbar)
    !link && KONTAKT.mail ? h('a', { class: 'knopf haupt', href: 'mailto:' + KONTAKT.mail + '?subject=' + encodeURIComponent('Weitermachen mit DK Coach') + '&body=' + encodeURIComponent('Hi Devin, mein Zugang ist abgelaufen (' + (ko.n || '') + '). Ich will weitermachen.'), text: 'Devin schreiben' }) : null,
    !link && KONTAKT.mail ? h('p', { class: 'leise klein', text: 'Oder direkt an ' + KONTAKT.mail + '.' }) : null,
    einfuegenBlock('Neuen Link einfügen'))];
}
// Angebot (21.11.2026): Gratis-Zeit, danach ein Preis im Monat. Nur mit echtem Impressum (KONTAKT.abo), Bezahl-Knopf nur mit PayPal-Link
function gratisZeit(a) { return a.gratis === 1 ? '1 Monat' : a.gratis + ' Monate'; }
function aboKarte(a, name, knopf) {
  return h('div', { class: 'st-stufe haupt' }, h('span', { class: 'st-stufe-name', text: name }),
    h('p', { class: 'st-stufe-preis' }, h('b', { text: a.preis + ' €' }), h('span', { text: ' im Monat' })),
    h('ul', null, a.punkte.map((p) => h('li', { text: p }))), knopf || null);
}
function angebotBlock(knopf) {
  const a = KONTAKT.abo;
  return h('section', { class: 'st-block st-breit st-angebot' },
    h('div', { class: 'st-text' }, h('h2', { text: gratisZeit(a) + ' kostenlos.' }), h('p', { class: 'st-zeile', text: 'Keine Zahlungsdaten. Jederzeit kündbar.' }), h('div', { class: 'st-knoepfe' }, knopf())),
    h('div', { class: 'st-stufen eins' }, aboKarte(a, 'Danach'),
      h('p', { class: 'leise klein', text: 'Die Gratis-Zeit endet von selbst. Danach kannst du für ' + a.preis + ' € im Monat weitermachen, jederzeit zum Monatsende kündbar. Unter 18? Dann nur zusammen mit deinen Eltern.' })));
}
// Bezahl-Knopf (26.11.2026, Devin: „Rest einbauen“): PayPal-Abo, Link aus kontakt.json (abo.link, fertig bis auf custom).
// Nur ein vollständiger Link zählt: PayPal-Abo mit notify_url zu „DK Zahlungen“ (Google-Skript). Ohne diese Meldung bliebe der Kunde nach dem Zahlen draußen.
// custom = Kunden-ID (wie daten.k im Plan): Daran erkennt „DK Zahlungen“ den Kunden, der Briefkasten verlängert um einen Monat, die App übernimmt das neue Ende.
function bezahlLink(a, ko) {
  const l = a && typeof a.link === 'string' ? a.link : '';
  if (!/^https:\/\/www\.paypal\.com\/cgi-bin\/webscr\?cmd=_xclick-subscriptions&/.test(l) || /[?&]custom=/.test(l)
    || !/&notify_url=https%3A%2F%2Fscript\.google\.com%2Fmacros%2Fs%2F[A-Za-z0-9_-]{20,}%2Fexec(&|$)/.test(l)) return null;
  if (!ko || !/^k[A-Za-z0-9]{1,16}$/.test(ko.id || '')) return null;
  return l + '&custom=' + encodeURIComponent(ko.id);
}
function weiterAbo(a, ko) {
  const link = bezahlLink(a, ko);
  const knopf = link ? h('a', { class: 'knopf haupt', href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Zahlungspflichtig abonnieren' }) : null;
  return h('div', { class: 'st-stufen eins weiter' }, aboKarte(a, 'Weitermachen', knopf),
    h('p', { class: 'leise klein', text: (link ? 'Zahlung über PayPal. ' : 'Schreib Devin, dass du weitermachen willst. ') + 'Das Abo kostet ' + a.preis + ' € im Monat, verlängert sich jeden Monat und ist jederzeit zum Monatsende kündbar. Unter 18? Dann nur zusammen mit deinen Eltern.' }));
}
function wartenAnsicht() {
  const ko = aktivesKonto(), vn = vorname(ko.n), geschickt = ko.analyse === 'geschickt';
  if (geschickt) sendeTextVorbereiten(ko);
  return [h('section', { class: 'block willkommen' }, logo(),
    h('h1', { text: 'Danke' + (vn ? ', ' + vn : '') + '!' }),
    h('p', { class: 'leise', text: (ko.form === 'gesundheit' ? 'Dein Gesundheits-Check' : 'Deine Analyse') + ' ist bei Devin. Er baut jetzt deinen Plan und schickt dir einen neuen Link. Den öffnest du einfach, der Code ist schon gespeichert.' }),
    geschickt ? h('div', { class: 'aktionen' }, sendenKnopf(ko, 'Nochmal schicken', 'knopf'),
      h('button', { class: 'knopf', type: 'button', onclick: () => { kontoSetzen(ko.id, { analyse: null }); zeichne(); window.scrollTo(0, 0); }, text: 'Antworten ändern' })) : null,
    ko.c ? charakterLink() : null,
    einfuegenBlock('Neuen Link einfügen'))];
}

/* ---------- Analyse: der Kunde füllt sie aus, Devin baut daraus den Plan ----------
 * Fragen und Auswahl kommen aus der Wissensbasis (daten.js → ANALYSE): dasselbe Formular wie in der Trainer-Seite, ohne Trainer-Felder.
 * Die Antworten bleiben als Entwurf auf dem Handy, bis der Kunde sie verschlüsselt an Devin schickt (DK-Analyse:…:Ende).
 * Was eine Antwort bedeutet (Stopp, Anpassung), entscheidet allein die Trainer-Seite beim Einfügen. */
let EN = null;   // Entwurf: { id, a: Antworten, s: Gesundheits-Check, zg: Zielgruppen, schritt }
const entwurfKey = (ko) => 'dk_analyse_' + ko.id;
function entwurfLaden(ko) { const e = speicher.lies(entwurfKey(ko), null) || {}; return { id: ko.id, a: Object.assign({ name: ko.n || '' }, ko.g ? { geschlecht: ko.g } : null, e.a), s: e.s || {}, zg: e.zg || [], schritt: e.schritt || 0 }; }
const entwurfSichern = () => speicher.schreib('dk_analyse_' + EN.id, EN);
const istJa = (v) => v === true || v === 'weiss_nicht';
const STEUER = new Set(), STEUER_S = new Set();   // Antworten, von denen Folgefragen abhängen: bei Änderung neu zeichnen
ANALYSE.abschnitte.forEach((a) => a.felder.forEach((f) => { if (f.zeige_wenn) STEUER.add(f.zeige_wenn.feld); }));
ANALYSE.screening.forEach((f) => { if (f.nur_wenn && f.nur_wenn.frage_ja) STEUER_S.add(f.nur_wenn.frage_ja); });
function anSichtbar(f, e = EN) {
  const z = f.zeige_wenn; if (!z) return true;
  const v = [].concat(e.a[z.feld] == null ? [] : e.a[z.feld]).map(String);
  if (z.enthaelt) return [].concat(z.enthaelt).some((x) => v.includes(String(x)));
  if (z.nicht_nur) return v.some((x) => ![].concat(z.nicht_nur).map(String).includes(x));
  return true;
}
function frageAktiv(f, e = EN) {   // wie E.frageAktiv in engine.js
  const n = f.nur_wenn; if (!n) return true;
  if (n.frage_ja && !istJa(e.s[n.frage_ja])) return false;
  if (n.geschlecht && !(n.geschlecht === 'w' ? e.a.geschlecht === 'weiblich' : e.a.geschlecht === 'maennlich')) return false;
  return true;
}
function anFehler(a) {
  return a.felder.filter((f) => anSichtbar(f)).map((f) => {
    const v = EN.a[f.id], leer = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (leer) return f.pflicht && f.typ !== 'lang' ? f.label : null;   // Freitext ist wie in der Trainer-Seite nie Pflicht
    if (f.typ === 'zahl' && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) return f.label + ' (' + f.min + '–' + f.max + ')';
    return null;
  }).filter(Boolean);
}
function anFeld(f, ohneLabel) {   // ohneLabel: die Überschrift stellt die Frage schon (Analyse in 10 Fragen), Label nur für Vorleseprogramme
  const id = 'an_' + f.id, wert = EN.a[f.id];
  const setze = (v) => { if (v == null || v === '' || (Array.isArray(v) && !v.length)) delete EN.a[f.id]; else EN.a[f.id] = v; entwurfSichern(); if (STEUER.has(f.id)) zeichne(); };
  const hilfe = f.hilfe && !ohneLabel ? h('p', { class: 'hilfe', text: f.hilfe }) : null;   // Analyse in 10 Fragen: die Frage selbst erklärt schon
  const titel = f.label + (f.pflicht && f.typ !== 'lang' ? ' *' : '');
  if (f.typ === 'auswahl' || f.typ === 'mehrfach' || f.typ === 'ja_nein') {
    const mehr = f.typ === 'mehrfach';
    const opts = f.typ === 'ja_nein' ? [{ wert: true, label: 'Ja' }, { wert: false, label: 'Nein' }] : (f.optionen || []);
    return h('div', { class: 'feld', role: 'group', 'aria-labelledby': id }, h('span', { class: ohneLabel ? 'lbl versteckt' : 'lbl', id, text: titel }), hilfe,
      h('div', { class: 'optionen' }, opts.map((o, i) => {
        const an = mehr ? [].concat(wert || []).some((x) => String(x) === String(o.wert)) : wert != null && String(wert) === String(o.wert);
        return h('label', null, h('input', { type: mehr ? 'checkbox' : 'radio', name: id, id: id + '_' + i, checked: an, onchange: (e) => {
          if (!mehr) { setze(o.wert); return; }
          let neu = [].concat(EN.a[f.id] || []).filter((x) => String(x) !== String(o.wert));
          if (e.target.checked) { neu = o.exklusiv ? [] : neu.filter((x) => !opts.some((oo) => oo.exklusiv && String(oo.wert) === String(x))); neu.push(o.wert); }
          setze(neu);
          if (opts.some((oo) => oo.exklusiv) && !STEUER.has(f.id)) zeichne();
        } }), h('span', { text: o.label }));
      })));
  }
  const inp = f.typ === 'lang'
    ? h('textarea', { class: 'eingabe', id, value: wert || '', placeholder: f.platzhalter || null, oninput: (e) => setze(e.target.value) })
    : h('input', { class: 'eingabe', id, type: f.typ === 'zahl' ? 'number' : 'text', inputmode: f.typ === 'zahl' ? 'decimal' : null, min: f.min, max: f.max,
      value: wert != null ? wert : '', autocomplete: 'off', placeholder: f.platzhalter || null,
      oninput: (e) => setze(f.typ === 'zahl' ? (e.target.value === '' ? null : +e.target.value) : e.target.value) });
  return h('div', { class: 'feld' }, h('label', { for: id, class: ohneLabel ? 'versteckt' : null, text: titel }), hilfe, f.einheit ? h('div', { class: 'mit-einheit' }, inp, h('span', { text: f.einheit })) : inp);
}
// Fragen nur für Frauen brauchen das Geschlecht. Kommt der Zugang über die Code-Leiste, kennt die App es nicht (es liegt bewusst nicht im Code-Briefkasten):
// dann fragt der Check einmal selbst. Die Antwort bleibt auf dem Handy und geht mit dem Check an Devin, der Plan ändert sich dadurch nicht (19.11.2026).
const GESCHLECHT_FRAGEN = ANALYSE.screening.some((f) => f.nur_wenn && f.nur_wenn.geschlecht);
const geschlechtFragen = () => GESCHLECHT_FRAGEN && !(aktivesKonto() || {}).g;   // Devin hat es nicht mitgeschickt (Code-Leiste): die App fragt
const geschlechtFehlt = () => geschlechtFragen() && !/^(weiblich|maennlich|divers)$/.test(EN.a.geschlecht || '');
function geschlechtFrage() {
  return h('div', { class: 'frage geschlecht-frage', role: 'group', 'aria-labelledby': 'scr-geschlecht' }, h('span', { id: 'scr-geschlecht', text: 'Ein paar Fragen sind nur für Frauen. Du bist …' }),
    h('div', { class: 'janein' }, [['weiblich', 'Frau'], ['maennlich', 'Mann'], ['divers', 'Divers']].map(([w, t], i) => h('label', null,
      h('input', { type: 'radio', name: 'scr_geschlecht', id: 'scr_geschlecht_' + i, checked: EN.a.geschlecht === w, onchange: () => { EN.a.geschlecht = w; entwurfSichern(); zeichne(); } }),
      h('span', { class: 'nein', text: t })))));
}
function anGesundheit() {
  const OPT = [[true, 'Ja', 'ja'], [false, 'Nein', 'nein'], ['weiss_nicht', 'Weiß nicht', 'ja']];
  return [h('section', { class: 'block' }, h('h2', { text: 'Gesundheits-Check' }),
    h('p', { class: 'leise klein', text: 'Ehrlich antworten, das schützt dich. „Weiß nicht“ ist okay, dann klärt Devin das mit dir. Bei manchen Antworten brauchst du vor dem Training eine ärztliche Freigabe.' }),
    geschlechtFragen() ? geschlechtFrage() : null,
    ANALYSE.screening.filter((f) => frageAktiv(f)).map((f) => h('div', { class: 'frage' }, h('span', { text: f.frage }),
      h('div', { class: 'janein' }, OPT.map(([w, t, c], i) => h('label', null,
        h('input', { type: 'radio', name: 'scr_' + f.id, id: 'scr_' + f.id + '_' + i, checked: EN.s[f.id] === w, onchange: () => { EN.s[f.id] = w; entwurfSichern(); if (STEUER_S.has(f.id)) zeichne(); } }),
        h('span', { class: c, text: t }))))))),
    ANALYSE.zielgruppen.length ? h('section', { class: 'block' }, h('h2', { text: 'Trifft etwas davon auf dich zu?' }),
      h('p', { class: 'leise klein', text: 'Freiwillig. Hilft Devin, deinen Plan anzupassen.' }),
      h('div', { class: 'optionen' }, ANALYSE.zielgruppen.map((z) => h('label', null, h('input', { type: 'checkbox', checked: EN.zg.includes(z.id), onchange: (e) => {
        EN.zg = EN.zg.filter((x) => x !== z.id); if (e.target.checked) EN.zg.push(z.id); entwurfSichern();
      } }), h('span', { text: z.name }))))) : null];
}
// Verschlüsseln dauert kurz (PBKDF2). Deshalb vorher, damit „Teilen“ direkt im Tipp startet (sonst blockt das iPhone).
let SENDE = { key: '', p: null, text: '' };
function sendeTextVorbereiten(ko) {
  const e = speicher.lies(entwurfKey(ko), null);
  if (!e) return;
  const key = JSON.stringify(e);
  if (SENDE.key === key) return;
  // Nur, was gerade sichtbar ist: eine Folgefrage, deren Ausgangsfrage jetzt Nein ist, geht nicht mit
  const a = {}, s = {};
  if (ko.form !== 'gesundheit') ANALYSE.abschnitte.forEach((ab) => ab.felder.forEach((f) => { if (e.a[f.id] != null && anSichtbar(f, e)) a[f.id] = e.a[f.id]; }));   // nur Check: die Analyse hat Devin schon
  ANALYSE.screening.forEach((f) => { if (e.s[f.id] !== undefined && frageAktiv(f, e)) s[f.id] = e.s[f.id]; });
  const vn = vorname(a.name || ko.n);
  SENDE = { key, text: '', p: K.verpacken(ko.code, { v: 1, k: ko.id, t: Date.now(), a, s, zg: e.zg || [] }).then((z) => {
    SENDE.text = 'Hi Devin, hier ist ' + (ko.form === 'gesundheit' ? 'mein Gesundheits-Check' : 'meine Analyse') + ' für ' + KONTAKT.marke + (vn ? ' (' + vn + ')' : '') + '.\n\nCode für ' + KONTAKT.marke + ' (nicht ändern):\nDK-Analyse:' + z + ':Ende';
    document.querySelectorAll('[data-senden]').forEach((b) => { b.disabled = false; b.textContent = b.dataset.senden; });
  }) };
}
function sendenKnopf(ko, text, klasse) {
  return h('button', { class: klasse, type: 'button', 'data-senden': text, disabled: !SENDE.text || null, text: SENDE.text ? text : 'Wird vorbereitet …', onclick: async (ev) => {
    const t = SENDE.text, knopf = ev.currentTarget;
    if (!t) return;
    let ok = false;
    if (navigator.share) {
      try { await navigator.share({ text: t }); ok = true; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    if (!ok) { try { await navigator.clipboard.writeText(t); ok = true; toast('Kopiert. Jetzt in WhatsApp an Devin einfügen.'); } catch (e) {} }
    if (!ok) {   // weder Teilen noch Kopieren: Text zum Markieren zeigen
      const feld = h('textarea', { class: 'eingabe', rows: '4', readonly: true, value: t, 'aria-label': 'Analyse zum Kopieren' });
      knopf.after(h('p', { class: 'klein', text: 'Markier den Text, kopier ihn und schick ihn Devin:' }), feld); feld.select();
      ok = true;
    }
    kontoSetzen(ko.id, { analyse: 'geschickt' });
    setTimeout(() => { zeichne(); window.scrollTo(0, 0); }, 400);
  } });
}
// Analyse in 10 Fragen (ANALYSE.kurz, Link mit a: 2): ein Bildschirm pro Frage, die Felder kommen aus den Abschnitten.
// Danach immer der ganze Gesundheits-Check. Bleibt eine Frage leer, fragt die App einmal nach; beim zweiten Tipp geht es weiter.
const FELD = new Map(ANALYSE.abschnitte.flatMap((a) => a.felder.map((f) => [f.id, f])));
const GEMAHNT = new Set();
const leer = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
function analyseAnsicht() {
  const ko = aktivesKonto();
  if (!EN || EN.id !== ko.id) EN = entwurfLaden(ko);
  const kurz = ko.form === 'kurz' && (ANALYSE.kurz || []).length > 0, nurCheck = ko.form === 'gesundheit';   // nurCheck: Link a: 3
  const fragen = nurCheck ? [] : kurz ? ANALYSE.kurz.map((q, i) => ({ art: 'abschnitt', titel: 'Frage ' + (i + 1), q, a: { felder: q.felder.map((id) => FELD.get(id)).filter(Boolean) } }))
    : ANALYSE.abschnitte.map((a) => ({ art: 'abschnitt', titel: a.titel, a }));
  const alle = fragen.concat([{ art: 'gesundheit', titel: 'Gesundheits-Check' }, { art: 'senden', titel: 'Abschicken' }]);
  EN.schritt = Math.min(EN.schritt || 0, alle.length - 1);
  const akt = alle[EN.schritt], vn = vorname(ko.n);
  const gehZu = (i) => { EN.schritt = i; entwurfSichern(); zeichne(); window.scrollTo(0, 0); };
  const teile = [h('div', { class: 'plan-kopf' },
    h('h1', { text: EN.schritt === 0 ? 'Hi' + (vn ? ' ' + vn : '') + '!' : akt.q ? akt.titel + ' von ' + fragen.length : akt.titel }),
    EN.schritt === 0 || !akt.q ? h('p', { class: 'leise', text: EN.schritt > 0 ? 'Schritt ' + (EN.schritt + 1) + ' von ' + alle.length
      : nurCheck ? 'Danke für deine Antworten! Bevor Devin deinen Plan baut, noch ein kurzer Gesundheits-Check (etwa 2 Minuten, nur Ja oder Nein). Deine Antworten bleiben auf dem Handy, bis du sie abschickst.'
      : kurz ? 'Bevor Devin deinen Plan baut, hat er ' + fragen.length + ' Fragen an dich. Danach kommt ein kurzer Gesundheits-Check. Deine Antworten bleiben auf dem Handy, bis du sie abschickst.'
      : 'Bevor Devin deinen Plan baut, braucht er ein paar Infos von dir. Dauert etwa 10 Minuten. Deine Antworten bleiben auf dem Handy, bis du sie abschickst.' }) : null),
    h('div', { class: 'schritte', style: 'grid-template-columns:repeat(' + alle.length + ',1fr)' }, alle.map((s, i) =>
      h('button', { type: 'button', class: i <= EN.schritt ? 'an' : '', 'aria-label': 'Schritt ' + (i + 1) + ': ' + s.titel, title: s.titel, onclick: () => { if (i < EN.schritt) gehZu(i); } })))];
  if (akt.art === 'abschnitt') teile.push(h('section', { class: 'block' },
    akt.q ? [h('h2', { class: 'frage-gross', text: akt.q.frage }), akt.q.unter ? h('p', { class: 'leise', text: akt.q.unter }) : null] : EN.schritt === 0 ? h('h2', { text: akt.titel }) : null,
    h('div', { class: 'stapel' }, akt.a.felder.filter((f) => anSichtbar(f)).map((f) => anFeld(f, !!akt.q && akt.q.frage_ist === f.id)))));
  if (akt.art === 'gesundheit') teile.push(...anGesundheit());
  if (akt.art === 'senden') {
    sendeTextVorbereiten(ko);
    const ja = ANALYSE.screening.filter((f) => frageAktiv(f) && istJa(EN.s[f.id])).length;
    teile.push(h('section', { class: 'block' }, h('h2', { text: 'Fertig!' }),
      h('p', { text: 'Tipp auf „An Devin schicken“ und wähl WhatsApp. Devin baut daraus deinen Plan und schickt dir einen neuen Link.' }),
      ja ? h('p', { class: 'meldung klein', text: 'Du hast ' + ja + '× „Ja“ oder „Weiß nicht“ im Gesundheits-Check. Devin schaut sich das an. Vielleicht brauchst du vorher eine ärztliche Freigabe.' }) : null,
      EN.a.alter != null && +EN.a.alter < 18 ? h('p', { class: 'meldung klein', text: 'Du bist unter 18: Devin braucht die schriftliche Einwilligung deiner Eltern, bevor es losgeht.' }) : null,
      h('p', { class: 'leise klein', text: 'Deine Antworten gehen mit deinem Code verschlüsselt an Devin.' }),
      sendenKnopf(ko, 'An Devin schicken', 'knopf haupt')));
  }
  const ges = alle.findIndex((x) => x.art === 'gesundheit');
  if (!kurz && akt.art === 'abschnitt' && EN.schritt < ges - 1 && alle.every((x) => x.art !== 'abschnitt' || !anFehler(x.a).length)) {
    teile.push(h('button', { class: 'knopf text', type: 'button', onclick: () => gehZu(ges), text: 'Rest überspringen → Gesundheits-Check' }));
  }
  const weiter = () => {
    if (akt.art === 'abschnitt') { const f = anFehler(akt.a); if (f.length) { toast('Bitte ausfüllen: ' + f.slice(0, 3).join(', ')); return; } }
    if (akt.q && !GEMAHNT.has(akt.q.id) && akt.a.felder.every((x) => leer(EN.a[x.id]))) {   // ganz leer: einmal nachhaken (Ankreuzen oder ein Satz), beim zweiten Tipp weiter
      GEMAHNT.add(akt.q.id);
      toast(akt.a.felder.some((x) => x.typ === 'auswahl' || x.typ === 'mehrfach') ? 'Tipp an, was passt. Oder tipp nochmal auf Weiter.' : 'Ein Satz reicht schon. Oder tipp nochmal auf Weiter.');
      return;
    }
    if (akt.art === 'gesundheit' && geschlechtFehlt()) { toast('Bitte oben antippen: Frau, Mann oder divers.'); return; }   // sonst fehlten Fragen nur für Frauen
    if (akt.art === 'gesundheit') { const offen = ANALYSE.screening.filter((f) => frageAktiv(f) && EN.s[f.id] === undefined).length; if (offen) { toast('Bitte jede Frage beantworten (' + offen + ' offen)'); return; } }
    gehZu(EN.schritt + 1);
  };
  teile.push(h('div', { class: 'fuss' },
    EN.schritt > 0 ? h('button', { class: 'knopf', type: 'button', onclick: () => gehZu(EN.schritt - 1), text: 'Zurück' }) : h('span'),
    akt.art !== 'senden' ? h('button', { class: 'knopf haupt', type: 'button', onclick: weiter, text: 'Weiter' + (alle[EN.schritt + 1].q ? '' : ' · ' + alle[EN.schritt + 1].titel) }) : null));
  return [h('div', { class: 'analyse stapel' }, teile)];
}
// Beispielplan (Redesign 24.11.2026): dieselben Daten für die Planvorschau auf der Startseite und die Demo. Heute ist immer ein Trainingstag,
// das zweite Training drei Tage später (vorher fest Mo und Do: dienstags sah man einen Ruhetag und einen verpassten Montag).
function beispielPlan() {
  const t = (n, m, u) => ({ n, m, u: u.map(([i, s, w, r, p]) => ({ i, s, w, r, p })) });
  const ids = Object.keys(UEBUNGEN);
  const nimm = (...k) => k.find((x) => UEBUNGEN[x]) || ids[0];
  const p = { v: 1, id: 'beispiel', n: 'Beispiel', z: 'muskelaufbau', l: 2, s: 'Ganzkörper 2×', d: isoHeute(), importiert: isoHeute(), w: ['e', 'a', 'a', 'a', 'a', 'd'], ft: [heuteIndex(), (heuteIndex() + 3) % 7].sort((x, y) => x - y),
    t: [t('Ganzkörper A', 50, [[nimm('beinpresse'), 3, [10, 12], [2, 3], [90, 120]], [nimm('latzug_breit'), 3, [10, 12], [2, 3], [90, 120]], [nimm('brustpresse_maschine'), 3, [10, 12], [2, 3], [90, 120]], [nimm('kabelrudern_sitzend'), 3, [10, 12], [2, 3], [90, 120]], [nimm('butterfly_maschine'), 2, [12, 15], [2, 3], [60, 90]], [nimm('trizepsdruecken_kabel'), 2, [12, 15], [2, 3], [60, 90]], [nimm('bauchmaschine_crunch'), 2, [12, 15], [2, 3], [60, 90]]]),
      t('Ganzkörper B', 45, [[nimm('kh_rumaenisches_kreuzheben'), 3, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_schulterdruecken_sitzend'), 3, [8, 12], [2, 3], [90, 120]], [nimm('split_squat'), 2, [8, 12], [2, 3], [90, 120]], [nimm('kurzhantel_seitheben'), 2, [12, 15], [2, 3], [60, 90]]])],
    // Status „Deine Ernährung“ (23.11.2026): erfundene Nährwerte im Format von Feld e (kompakt.js), Mann mit 80 kg, Muskelaufbau
    e: { v: 1, kc: 2900, er: 2640, ar: 'p', jk: 33, ew: [128, 176], ek: [1.6, 2.2], eb: 80, ft: 95, fm: 64, kh: 360, tr: 1410, kg: 80,
      sc: [['wasser', 'Trink zu jeder Mahlzeit ein großes Glas Wasser.'], ['eiweiss', 'Plane zu jeder Mahlzeit eine Eiweißquelle ein, zum Beispiel Quark, Eier, Fleisch oder Linsen.']], hd: { e: 1, g: 1, k: 1, f: 1, m: 4 } },
    pr: 'Schaffst du in allen Sätzen die obere Wiederholungszahl mit 2 Wiederholungen Reserve, nimm beim nächsten Mal etwas mehr Gewicht.', h: ['Beispiel mit erfundenen Daten.'], ab: [] };
  return p;
}
function beispiel() {
  const p = beispielPlan();
  const plaene = speicher.lies('dk_plaene', {}); plaene[p.id] = p; speicher.schreib('dk_plaene', plaene); speicher.schreib('dk_aktiv', p.id);
  S.tagWahl = null; zeichne();
}

/* ---------- Kopf jeder Ansicht ---------- */
// Feinschliff (10.11.2026): Gruß nach Tageszeit; die kleine Zeile (Datum oder Plan) steht über der Überschrift; Plan und Rang haben einen eigenen Titel
function gruss(n) {
  const std = new Date().getHours();
  const g = std >= 5 && std < 11 ? 'Guten Morgen' : std >= 18 ? 'Guten Abend' : 'Hi';
  if (!n) return g === 'Hi' ? 'Dein Training' : g;
  return g === 'Hi' ? 'Hi ' + n : g + ', ' + n;
}
function kopf(unter, titel) {
  const n = vorname(S.plan.n);
  // Ein Plan ohne Konto kam über einen alten Link ohne Code: Den kann jeder bauen, also sagt die App das auch
  const ohneCode = S.plan.id !== 'beispiel' && !konten()[S.plan.id];
  return h('div', { class: 'plan-kopf gruss' }, unter ? h('p', { class: 'leise klein', text: unter }) : null, h('h1', { text: titel || gruss(n) }),
    ohneCode ? h('p', { class: 'meldung klein', text: 'Dieser Plan kam über einen Link ohne Code. Frag Devin, ob er wirklich von ihm ist.' }) : null);
}

const charakterLink = () => h('a', { class: 'knopf charakter-knopf', href: 'charakter/kunde.html', text: 'Mein Charakter' });
/* ---------- Heute: Wochenleiste, Training des Tages, Übungen abhaken ---------- */
let OHNE_3D = false;   // Der PR-Raum hat nicht geladen: Die Rang-Seite zeigt dann das Formular
function ansichtStatus() {
  // Figur überall (23.11.2026): eigen = die eigene Figur des Kunden (was er auf „Mein Charakter“ eingestellt hat, sonst Devins Charakter), jetzt und waehlen aus figurwahl.js
  const ei = Figurwahl.eigene(figurZiel());
  return [figurHinweis(), ...Status.ansicht({ h, plan: S.plan, eigen: ei.c, eigenNotiz: ei.notiz, jetzt: figurJetzt(), waehlen: figurWaehlen, lies: speicher.lies, schreib: speicher.schreib, toast, neu: zeichne,
    geh, vorladen: () => import('./charakter/gym.js').then((m) => m.vorladen()).catch(() => {}) })];
}
// Essen (26.11.2026): neu zeichnen ohne nach oben zu springen (Haken, Glas, Eintrag), nur der Tageswechsel bleibt oben
function ansichtEssen() {
  const neu = () => { const y = window.scrollY; zeichne(); window.scrollTo(0, y); };
  return Essen.ansicht({ h, plan: S.plan, lies: speicher.lies, schreib: speicher.schreib, toast, neu, blatt: oeffneBlatt, blattZu: () => schliesseBlatt() });
}
function ansichtRang() { return Rang.ansicht({ h, kopf: () => kopf('', 'Dein Rang'), lade3d, UEBUNGEN, plan: S.plan, toast, datum: datumHeute, neu: zeichne, prRaum: () => prRaumOeffnen(null), ohne3d: () => OHNE_3D }); }
function ansichtHeute() {
  let p = S.plan;
  const heute = heuteIndex();
  if (p.id === 'beispiel' && p.d !== isoHeute()) { beispiel(); return []; }   // Beispiel von einem anderen Tag: frisch, damit heute ein Trainingstag ist (beispiel() zeichnet neu)
  const istBeispiel = p.id === 'beispiel';
  const datum = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  const teile = [kopf(datum, istBeispiel ? 'Dein Beispielplan' : null), figurHinweis()];   // figurHinweis: neue Figur von Devin (23.11.2026), meist null
  // Beispiel offen zeigen (Redesign 24.11.2026): was es ist, was nicht gespeichert wird, und der Weg zum eigenen Plan
  if (istBeispiel) teile.push(h('section', { class: 'rg-beispiel', 'aria-label': 'Beispielstatus' },
    h('p', null, h('b', { text: 'Beispiel mit erfundenen Daten. ' }), 'Probier alles aus. Was du hier trainierst, landet nicht in deinem Verlauf.'),
    h('div', { class: 'rg-aktionen' }, h('a', { class: 'knopf haupt klein', href: 'analyse/', text: analyseAngefangen() ? 'Eigene Analyse fortsetzen' : 'Eigenen Plan anfragen' }),
      h('button', { class: 'knopf text klein', type: 'button', onclick: beispielEnde, text: 'Beispiel beenden' }))));
  // Kunden-Test 23.11.2026: Die Code-Karte mitten im Beispiel verwirrte Neue („ich hab doch gar keinen Code“). Wer später Devins Code bekommt, findet sie unter Infos und auf der Startseite.
  const ko = aktivesKonto();
  if (ko && ko.id === p.id && ko.bis && tageBis(ko) <= 7) {
    const link = bezahlLink(KONTAKT.abo, ko);   // mit Bezahl-Knopf (26.11.2026): gleich hier verlängern, die bezahlte Zeit hängt sich hinten an
    teile.push(h('p', { class: 'meldung klein' }, (tageBis(ko) === 0 ? 'Dein Zugang endet heute.' : 'Dein Zugang läuft noch ' + tageBis(ko) + (tageBis(ko) === 1 ? ' Tag.' : ' Tage.'))
      + (link ? ' Willst du weitermachen? ' : ' Schreib Devin, wenn du weitermachen willst.'),
      link ? h('a', { href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Abo für ' + KONTAKT.abo.preis + ' € im Monat abschließen' }) : null));
  }
  // Erst wenn jeder Trainingstag einen Wochentag hat, kommt die Woche (vorher blieb nach dem ersten Haken nur ein Tag übrig)
  if (kundenTage(p).length < planTage(p)) {
    const offen = offenesTraining(p);
    if (offen) teile.push(offen);
    teile.push(h('p', { class: 'meldung', text: 'Dein Plan hat ' + planTage(p) + ' Trainingstag' + (planTage(p) === 1 ? '' : 'e') + '. Wähle deine Tage, dann siehst du hier deine ganze Woche.' }), trainingstageBlock(p), installKompakt());
    return teile;
  }
  if (S.tagWahl == null) S.tagWahl = heute;
  // Zuerst, was jetzt dran ist (Redesign 24.11.2026): ein offenes Training mit Stand, sonst die Einheit des gewählten Tages oder der Ruhetag mit dem nächsten Training
  const offen = offenesTraining(p), ti = tagFuer(p, S.tagWahl);
  if (offen) teile.push(offen);
  teile.push(ti >= 0 ? trainingsKarte(p, ti, S.tagWahl === heute) : ruhetagKarte(p, S.tagWahl, heute));
  teile.push(wochenKarte(p, heute));
  if (ko && ko.id === p.id && ko.c) teile.push(charakterLink());
  if (!istBeispiel) teile.push(Rang.kurzKarte({ h, oeffnen: () => geh('rang') }));
  teile.push(fortschrittKarte(p));
  teile.push(tippKarte(p, ti >= 0 ? ti : (naechstesTraining(p, S.tagWahl) || { ti: -1 }).ti));
  if (!istBeispiel) teile.push(verlaufBlock());
  const w = aktuelleWoche(p), ph = PHASE[(p.w || [])[w]];   // die Zeile „Woche x von y“ steht jetzt in der Wochenkarte
  if (!ph && p.w && w >= p.w.length) teile.push(h('p', { class: 'meldung klein', text: 'Dein Plan ist durch. Sprich mit Devin über den nächsten.' }));
  teile.push(installKompakt());
  return teile;
}
// Offenes Training zuerst (Rückkehrer, 24.11.2026): Tagesname, wie lange es läuft und wie viele Sätze schon gespeichert sind. Fortsetzen hat Vorrang vor Beenden.
function offenesTraining(p) {
  if (!LAUF || LAUF.phase === 'fertig' || LAUF.plan !== p.id) return null;
  const erfasst = LAUF.uebungen.reduce((s, u) => s + u.log.length, 0), gesamt = LAUF.uebungen.reduce((s, u) => s + u.saetze, 0);
  const min = Math.max(1, Math.round((Date.now() - LAUF.start) / 60000)), planMin = (p.t[LAUF.tagNr - 1] || {}).m;
  const beenden = h('button', { class: 'knopf text', type: 'button', text: 'Einheit beenden', onclick: (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich beenden? Nochmal tippen'; return; }
    laufBeenden('abgebrochen');
  } });
  return h('section', { class: 'block heute rg-offen', 'aria-labelledby': 'rg-offen-titel' },
    h('div', { class: 'tag-kopf' }, h('span', { class: 'nr', text: 'Offenes Training · Training ' + LAUF.tagNr }), h('h2', { id: 'rg-offen-titel', text: LAUF.tagName })),
    h('p', { class: 'rg-stand' }, h('span', { class: 'zahl', text: 'Seit ' + min + ' min' }), planMin ? h('span', { class: 'leise zahl', text: ' · geplant ~' + planMin + ' min' }) : null),
    h('p', { class: 'rg-stand' }, h('b', { class: 'zahl', text: erfasst + ' von ' + gesamt }), erfasst === 1 ? ' Satz gespeichert' : ' Sätzen gespeichert', ' · Übung ' + Math.min(LAUF.ue + 1, LAUF.uebungen.length) + ' von ' + LAUF.uebungen.length),
    h('div', { class: 'aktionen' }, startKnopf(p, LAUF.tagNr - 1, 'Training fortsetzen'), beenden));
}
// Als App aufs Handy (24.11.2026): hinter einer kompakten Aktion statt als große Karte; unter Infos steht sie immer
function installKompakt() {
  if (installiert() || speicher.lies('dk_install_weg', false)) return null;
  return h('details', { class: 'rg-install block' }, h('summary', { text: 'Als App aufs Handy' }), installKarte(true),
    h('button', { class: 'knopf text klein', type: 'button', onclick: () => { speicher.schreib('dk_install_weg', true); zeichne(); }, text: 'Ausblenden (bleibt unter Infos)' }));
}
/* Feinschliff (10.11.2026, Devin: „wie eine App, die man täglich benutzen kann und es nächsten Tag benutzen will“):
 * Die Woche ist eine Karte: Tage mit Datum, geschaffte Tage mit Haken, darunter der Stand der Woche und die Serie. */
// Welche Tage dieser Woche sind geschafft? Ein Training bis zum Ende (Spielstand) oder alle Übungen des Tages abgehakt. Gelesen wird nur, nichts geschrieben.
function wocheErledigt(p, heute) {
  const stand = speicher.lies(Spiel.SCHLUESSEL, null), liste = stand && Array.isArray(stand.einheitenListe) ? stand.einheitenListe : [];
  return wochenDaten(heute).map((d) => {
    const vorn = p.id + '|' + d + '|';
    if (liste.some((x) => typeof x === 'string' && x.indexOf(vorn) === 0)) return true;
    return p.t.some((t, ti) => { const l = speicher.lies('dk_erledigt_' + p.id + '_' + d + '_' + ti, null); return Array.isArray(l) && t.u.length > 0 && l.length >= t.u.length; });
  });
}
function naechstesTraining(p, wt) {
  for (let i = 1; i <= 7; i++) { const ti = tagFuer(p, (wt + i) % 7); if (ti >= 0) return { wt: (wt + i) % 7, ti }; }
  return null;
}
function wochenleiste(p, heute, fertig) {
  const jetzt = new Date(), nr = (i) => new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - (heute - i)).getDate();
  return h('div', { class: 'wochenleiste', role: 'group', 'aria-label': 'Wochentage' }, WOCHENTAGE.map((w, i) => {
    const ti = tagFuer(p, i), ok = !!(fertig && fertig[i]);
    return h('button', { type: 'button', class: 'wt' + (i === S.tagWahl ? ' an' : '') + (i === heute ? ' heute' : '') + (i < heute ? ' vorbei' : '') + (ti >= 0 ? ' training' : '') + (ok ? ' fertig' : ''),
      'aria-pressed': i === S.tagWahl ? 'true' : 'false', 'aria-label': w + (i === heute ? ' (heute)' : '') + (ti >= 0 ? ': Training ' + (ti + 1) + ', ' + p.t[ti].n : ': Ruhetag') + (ok ? ', erledigt' : ''),
      onclick: () => { S.tagWahl = i; zeichne(); } },
      h('span', { text: w.slice(0, 2) }), h('span', { class: 'wt-nr', text: String(nr(i)) }), h('b', { text: ok ? '✓' : ti >= 0 ? '•' : '\u00a0' }));
  }));
}
function wochenKarte(p, heute) {
  const fertig = wocheErledigt(p, heute), ziel = planTage(p), n = Math.min(ziel, fertig.filter(Boolean).length), offen = ziel - n;
  const w = aktuelleWoche(p), ph = PHASE[(p.w || [])[w]];
  const st = p.id === 'beispiel' ? null : Spiel.status(), serie = st && st.serieWochen > 0 ? st.serieWochen : 0;
  return h('section', { class: 'block woche-karte' },
    h('div', { class: 'woche-kopf' }, h('h2', { text: 'Diese Woche' }),
      h('button', { class: 'knopf text klein', type: 'button', onclick: () => { geh('plan'); setTimeout(() => { const el = $('#trainingstage'); if (el) el.scrollIntoView({ block: 'start' }); }, 0); }, text: 'Tage ändern' }),
      ph ? h('p', { class: 'leise klein', text: 'Woche ' + (w + 1) + ' von ' + p.w.length + ' · ' + ph[1] + ': ' + ph[2] + (ph[0] === 'deload' ? ' (halb so viele Sätze)' : '') }) : null),
    wochenleiste(p, heute, fertig),
    // Der Ring füllt sich mit jedem Training der Woche und wird grün, wenn alle geschafft sind
    h('div', { class: 'woche-stand' + (offen > 0 ? '' : ' voll'), role: 'status' },
      h('span', { class: 'woche-ring', style: '--p:' + (ziel ? Math.round(n / ziel * 100) : 0), 'aria-hidden': 'true' }, h('b', { text: offen > 0 ? n + '/' + ziel : '✓' })),
      h('span', { class: 'woche-text' },
        h('b', { text: offen > 0 ? 'Noch ' + offen + (offen === 1 ? ' Training' : ' Trainings') + ' diese Woche' : (ziel === 1 ? 'Training geschafft' : 'Alle ' + ziel + ' Trainings geschafft') }),
        serie ? h('small', { text: 'Serie: ' + serie + (serie === 1 ? ' Woche' : ' Wochen') }) : null)));
}
// Balken über der Übungsliste; ist alles abgehakt, steht dabei, wann es weitergeht
function fortschritt(p, t, n, alle) {
  const nx = alle ? naechstesTraining(p, heuteIndex()) : null;
  return h('div', { class: 'fortschritt' + (alle ? ' voll' : ''), role: 'status' },
    h('div', { class: 'fortschritt-balken', 'aria-hidden': 'true' }, h('i', { style: 'width:' + (t.u.length ? Math.round(Math.min(1, n / t.u.length) * 100) : 0) + '%' })),
    h('p', { class: 'klein' + (alle ? '' : ' leise'), text: alle ? 'Alles erledigt. Stark, bis zum nächsten Training!' : n + ' von ' + t.u.length + ' Übungen erledigt' }),
    nx ? h('p', { class: 'klein leise', text: 'Nächstes Training: ' + WOCHENTAGE[nx.wt] + ' · ' + p.t[nx.ti].n }) : null);
}
// Jeden Tag ein anderer Technik-Punkt zu einer Übung aus dem gezeigten Training. Der Text kommt wörtlich aus den geprüften Übungsdaten („So geht’s“), hier wird nichts erfunden.
function tippKarte(p, ti) {
  const t = p.t[ti];
  if (!t) return null;
  const punkte = (u) => (Array.isArray(u.d.t) ? u.d.t.filter((x) => typeof x === 'string' && x.trim()) : []);
  const mit = t.u.map((roh) => uebung(roh)).filter((u) => punkte(u).length);
  if (!mit.length) return null;
  const d = new Date(), tag = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  const u = mit[tag % mit.length], alle = punkte(u), kurz = alle.filter((x) => x.length <= 150), wahl = kurz.length ? kurz : alle;
  const satz = wahl[Math.floor(tag / mit.length) % wahl.length].trim();
  return h('section', { class: 'block tagestipp' },
    h('div', { class: 'tipp-text' }, h('small', { text: 'Technik-Tipp des Tages' }),
      h('button', { class: 'ueb-name', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u, ti), text: anzeigeName(u) }),
      h('p', { text: /[.!?…]$/.test(satz) ? satz : satz + '.' })),
    mini3d(u));
}
function mini3d(u) {
  return h('button', { class: 'mini3d' + (u.d.a ? '' : ' ohne'), type: 'button', 'aria-label': anzeigeName(u) + ' in 3D ansehen', 'data-vorschau': u.d.a ? u.id : '',
    onclick: (e) => { e.stopPropagation(); oeffneUebung(u); } }, u.d.a ? '' : '–');
}
function trainingsKarte(p, ti, istHeute) {
  const t = p.t[ti], erledigt = istHeute ? erledigtLaden(p, ti) : [];
  const alle = istHeute && t.u.length && erledigt.length >= t.u.length;
  return h('section', { class: 'block heute' },
    h('div', { class: 'tag-kopf' }, h('span', { class: 'nr', text: 'Training ' + (ti + 1) }), h('h3', { text: t.n }), t.m ? h('span', { class: 'leise klein zahl', text: '~' + t.m + ' min' }) : null),
    !istHeute ? h('p', { class: 'leise klein', text: WOCHENTAGE[S.tagWahl] + ' · Vorschau' }) : null,
    offenesTraining(p) ? null : h('div', { class: 'aktionen' }, startKnopf(p, ti, istHeute ? 'Training starten' : 'Diese Einheit starten'), h('button', { class: 'knopf gym-knopf', type: 'button', onclick: () => raumStarten(p, ti), text: 'Ins Gym' })),   // läuft schon ein Training, steht „Fortsetzen“ in der Karte darüber
    aufwaermen(t),
    istHeute ? fortschritt(p, t, erledigt.length, alle) : null,
    p.fokus && t.u.some((roh) => roh.z && !roh.z.art && !istSek(uebung(roh))) ? h('p', { class: 'notiz', text: 'Fokus diese Woche: ' + p.fokus }) : null,
    h('div', { class: 'ueb-liste' }, t.u.map((roh, ui) => {
      const u = uebung(roh), fertig = erledigt.indexOf(ui) >= 0;
      return h('div', { class: 'ueb-karte mit3d' + (fertig ? ' fertig' : '') + (istHeute ? '' : ' ohne-haken') },
        istHeute ? h('label', { class: 'haken' }, h('input', { type: 'checkbox', checked: fertig, 'aria-label': anzeigeName(u) + ' erledigt',
          onchange: (e) => erledigtSetzen(p, ti, ui, e.target.checked) }), h('span', { 'aria-hidden': 'true' })) : null,
        h('button', { class: 'ueb-name', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u, ti), text: anzeigeName(u) }),
        h('div', { class: 'ueb-dosis' }, h('b', { text: satzZahl(p, u) + ' × ' + dosis(u) }), u.pause.length ? h('small', { text: 'Pause ' + pauseText(u) }) : null),
        u.notiz ? h('div', { class: 'notiz', text: u.notiz }) : null,
        angepasstBlock(angepasst(p, u), true), fuerDichBlock(u, true),
        mini3d(u));
    })));
}
function aufwaermen(t) {
  return t.a && t.a.u && t.a.u.length ? h('details', null, h('summary', { class: 'klein', text: 'Aufwärmen' + (t.a.d ? ' · ' + t.a.d + ' min' : '') }),
    h('ul', { class: 'klein' }, t.a.u.map(([n, x]) => h('li', { text: n + (x ? ' — ' + x : '') })))) : null;
}
function ruhetagKarte(p, wt, heute) {
  const naechster = naechstesTraining(p, wt);
  return h('section', { class: 'block heute ruhetag' },
    h('div', { class: 'tag-kopf' }, h('span', { class: 'nr', text: wt === heute ? 'Heute' : WOCHENTAGE[wt] }), h('h3', { text: 'Ruhetag' })),
    h('p', { class: 'leise klein', text: 'Erholung gehört zum Training. Schlaf gut, iss genug, beweg dich locker.' }),
    naechster ? h('div', { class: 'naechstes' },
      h('span', null, h('small', { text: 'Nächstes Training · ' + WOCHENTAGE[naechster.wt] }), h('b', { text: p.t[naechster.ti].n })),
      h('button', { class: 'knopf klein', type: 'button', 'aria-label': 'Nächstes Training ansehen', onclick: () => { S.tagWahl = naechster.wt; zeichne(); }, text: 'Ansehen' })) : null,
    // Kunden-Test 23.11.2026: Am Ruhetag fand niemand das Gym. Es geht jetzt auch hier hinein, mit den Geräten des nächsten Trainings.
    naechster ? h('div', { class: 'aktionen' }, h('button', { class: 'knopf gym-knopf', type: 'button', onclick: () => raumStarten(p, naechster.ti), text: 'Ins Gym gehen' })) : null);
}
// Große Muskeln an zwei Tagen direkt hintereinander? Dann ein Tipp (wie in der Trainer-Seite)
const GROSSE_MUSKELN = ['brust', 'lat', 'oberer_ruecken', 'quadrizeps', 'beinbeuger', 'gesaess'];
function tageZuNah(p, tage = kundenTage(p)) {
  tage = tage.slice(0, p.t.length);
  const nah = [];
  const muskeln = (t) => { const m = {}; t.u.forEach((roh) => ((UEBUNGEN[roh.i] || {}).m || []).forEach((x) => { if (GROSSE_MUSKELN.includes(x)) m[x] = 1; })); return m; };
  tage.forEach((wt, i) => {
    const morgen = tage.indexOf((wt + 1) % 7);
    if (morgen < 0) return;
    const a = muskeln(p.t[i]), b = muskeln(p.t[morgen]);
    if (Object.keys(a).some((m) => b[m])) nah.push(WOCHENTAGE[wt].slice(0, 2) + '/' + WOCHENTAGE[(wt + 1) % 7].slice(0, 2));
  });
  return nah;
}
const planTage = (p) => Math.min(7, p.t.length);
// Vorschlag: behält schon gewählte Tage, so wenig gleiche große Muskeln an Folgetagen wie möglich, Abstände gleichmäßig, lieber unter der Woche
function vorschlagTage(p) {
  const n = planTage(p), gewaehlt = kundenTage(p);
  let best = null;
  for (let m = 1; m < 128; m++) {
    const tage = [0, 1, 2, 3, 4, 5, 6].filter((i) => (m >> i) & 1);
    if (tage.length !== n) continue;
    const luecken = tage.map((t, i) => ((tage[(i + 1) % n] - t + 7) % 7) || 7);
    const wert = gewaehlt.filter((x) => !tage.includes(x)).length * 50 + tageZuNah(p, tage).length * 100 + (Math.max(...luecken) - Math.min(...luecken)) * 10 + (tage.includes(6) ? 3 : 0) + (tage.includes(5) ? 1 : 0) + (tage[0] !== 0 ? 1 : 0);
    if (!best || wert < best.wert) best = { wert, tage };
  }
  return best ? best.tage : [];
}
function trainingstageBlock(p) {
  const tage = kundenTage(p), n = planTage(p), nah = tageZuNah(p), voll = tage.length >= n;
  function setze(i, an) {
    const neu = kundenTage(p).filter((x) => x !== i);
    if (an) neu.push(i);
    speicher.schreib('dk_tage_' + p.id, neu.sort());
    if (an && neu.length === n) toast('Deine Woche steht');
    zeichne();
  }
  const vorschlag = tage.length < n ? vorschlagTage(p) : null;
  return h('section', { class: 'block', id: 'trainingstage' }, h('h2', { text: 'Deine Trainingstage' }),
    h('p', { class: 'leise klein', text: 'Dein Plan hat ' + n + ' Trainingstag' + (n === 1 ? '' : 'e') + ' pro Woche. Wähle, an welchen Tagen du trainierst. Das merkt sich nur dein Handy.' }),
    // Sind alle Tage vergeben, erst einen abwählen, dann einen anderen wählen
    h('div', { class: 'optionen' }, WOCHENTAGE.map((w, i) => h('label', null,
      h('input', { type: 'checkbox', checked: tage.includes(i), disabled: voll && !tage.includes(i), 'aria-label': w, onchange: (e) => setze(i, e.target.checked) }), h('span', { text: w.slice(0, 2) })))),
    tage.length && tage.length < n ? h('p', { class: 'klein', text: 'Noch ' + (n - tage.length) + (n - tage.length === 1 ? ' Tag' : ' Tage') + ' wählen, dann hat jeder Trainingstag seinen Platz.' }) : null,
    vorschlag && vorschlag.length ? h('button', { class: 'knopf', type: 'button', onclick: () => { speicher.schreib('dk_tage_' + p.id, vorschlag); toast('Deine Woche steht'); zeichne(); },
      text: 'Vorschlag nehmen: ' + vorschlag.map((i) => WOCHENTAGE[i].slice(0, 2)).join(', ') }) : null,
    tage.length > n ? h('p', { class: 'klein', text: 'Du hast mehr Tage gewählt, als dein Plan hat. Die letzten bleiben frei.' }) : null,
    nah.length ? h('p', { class: 'klein', text: 'Tipp: ' + nah.join(', ') + ' trainieren dieselben großen Muskeln. Besser einen Tag Pause dazwischen.' }) : null,
    tage.length ? h('ul', { class: 'klein' }, tage.slice(0, n).map((i, k) => h('li', null, h('b', { text: WOCHENTAGE[i] + ': ' }), 'Training ' + (k + 1) + ' · ' + p.t[k].n))) : null);
}

/* ---------- Plan ---------- */
function ansichtPlan() {
  const p = S.plan, jetzt = aktuelleWoche(p);
  const teile = [kopf([ZIEL[p.z] || p.z, p.l ? 'Level ' + p.l : '', p.s].filter(Boolean).join(' · '), 'Dein Plan')];
  if (p.ki) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Vom Coach' }), h('p', { class: 'ki-text', text: p.ki })));
  p.t.forEach((t, ti) => teile.push(tagBlock(p, t, ti)));
  if ((p.w && p.w.length) || p.pr || p.dl) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wochen' }),
    p.w && p.w.length ? h('div', { class: 'wochen' }, p.w.map((ph, i) => h('div', { class: 'woche ' + (PHASE[ph] || PHASE.a)[0] + (i === jetzt ? ' jetzt' : ''), 'aria-current': i === jetzt ? 'step' : null },
      h('b', { text: 'W' + (i + 1) }), h('small', { text: (PHASE[ph] || PHASE.a)[1] })))) : null,
    p.pr ? h('div', { class: 'stapel' }, h('h3', { text: 'So steigerst du' }), h('p', { text: p.pr })) : null,
    p.dl ? h('p', { class: 'klein' }, h('b', { text: 'Entlastungswoche: ' }), p.dl) : null));
  if (p.h && p.h.length) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Wichtig für dich' }), h('ul', null, p.h.map((x) => h('li', { text: x })))));
  if (p.sh || (p.ab && p.ab.length) || (p.ar && p.ar.length)) teile.push(h('section', { class: 'block' }, h('h2', { text: 'Sicherheit' }),
    p.sh ? h('p', { text: p.sh }) : null,
    p.ab && p.ab.length ? h('div', null, h('b', { class: 'klein', text: 'Sofort aufhören bei:' }), h('ul', { class: 'klein' }, p.ab.map((x) => h('li', { text: x })))) : null,
    (p.ar || []).map((r) => h('p', { class: 'klein' }, h('b', { text: r.t + ': ' }), r.x))));
  teile.push(trainingstageBlock(p));
  teile.push(h('p', { class: 'leise klein', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + '. Gespeichert auf diesem Handy, läuft auch ohne Internet. Neuer Link von Devin = neuer Stand.' }));
  return teile;
}
// Tagesplan (24.11.2026): „Diese Einheit starten“ sitzt neben Titel und Dauer; die kompakte Tabelle bleibt (auf schmalen Handys geordnete Übungszeilen, Werte mit Einheit).
// Reserve (RIR) erklärt ein Tipp auf die Spaltenüberschrift in einem Satz.
const RIR_SATZ = 'Reserve (RIR) heißt: So viele Wiederholungen würdest du am Ende des Satzes noch schaffen. RIR 2 heißt also aufhören, wenn noch zwei gehen würden.';
function rirKnopf(ziel) {
  return h('button', { class: 'rir-knopf', type: 'button', 'aria-expanded': 'false', 'aria-controls': ziel, onclick: (e) => {
    const b = e.currentTarget, el = document.getElementById(ziel), an = b.getAttribute('aria-expanded') !== 'true';
    document.querySelectorAll('.rir-knopf[aria-controls="' + ziel + '"]').forEach((x) => x.setAttribute('aria-expanded', String(an)));
    if (el) el.hidden = !an;
  } }, 'Reserve', h('span', { class: 'rir-i', 'aria-hidden': 'true', text: '?' }));
}
function tagBlock(p, t, ti) {
  const sek = t.u.some((roh) => istSek(uebung(roh))), mitRir = t.u.some((roh) => uebung(roh).rir), rirId = 'rir-' + (ti + 1);
  return h('section', { class: 'block', id: 'tag-' + (ti + 1) },
    h('div', { class: 'tag-kopf mit-start' }, h('span', { class: 'nr', text: 'Training ' + (ti + 1) }), h('h3', { text: t.n }), t.m ? h('span', { class: 'leise klein zahl', text: '~' + t.m + ' min · ' + t.u.length + ' Übungen' }) : null,
      h('div', { class: 'tag-start' }, startKnopf(p, ti, 'Diese Einheit starten'))),
    aufwaermen(t),
    h('div', { class: 'tabelle-wrap' }, h('table', { class: 'ueb' },
      h('thead', null, h('tr', null, h('th', { text: 'Übung' }), h('th', { text: 'Sätze' }), h('th', { text: sek ? 'Wdh / Zeit' : 'Wdh' }), h('th', null, mitRir ? rirKnopf(rirId) : 'Reserve'), h('th', { text: 'Pause' }))),
      h('tbody', null, t.u.map((roh) => {
        const u = uebung(roh);
        return h('tr', null,
          h('td', null, h('button', { class: 'ueb-name', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u, ti), text: anzeigeName(u) }),
            u.notiz ? h('div', { class: 'notiz', text: u.notiz }) : null, angepasstBlock(angepasst(p, u), true), fuerDichBlock(u, true)),
          h('td', { class: 'z', 'data-l': 'Sätze', text: satzZahl(p, u) }), h('td', { class: 'z', 'data-l': istSek(u) ? 'Zeit' : 'Wdh', text: bereich(u.wdh, istSek(u) ? 'sek' : '') }),
          h('td', { class: 'z', 'data-l': 'Reserve', text: u.rir ? bereich(u.rir) + ' Wdh' : '' }), h('td', { class: 'z', 'data-l': 'Pause', text: u.pause.length ? pauseText(u) : '' }));
      })))),
    mitRir ? h('div', { class: 'rir-mobil' }, rirKnopf(rirId)) : null,   // schmale Handys: die Tabelle hat dort keine Überschriften
    mitRir ? h('p', { class: 'rir-satz klein', id: rirId, hidden: true, text: RIR_SATZ }) : null);   // Kunden-Test 23.11.2026: „Was heißt Reserve?“
}

/* ---------- Übungen ---------- */
function ansichtUebungen() {
  const p = S.plan, gesehen = new Set(), liste = [];
  p.t.forEach((t) => t.u.forEach((roh) => { const k = roh.i + (roh.nm || ''); if (!gesehen.has(k)) { gesehen.add(k); liste.push(uebung(roh)); } }));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Übungen' }), h('p', { class: 'leise', text: (matchMedia('(hover: hover) and (pointer: fine)').matches   // QA 25.11.2026 (Rolle 13): am Computer gibt es keinen Finger
    ? 'Klick auf eine Übung: Die Figur zeigt dir die Bewegung in 3D. Mit gedrückter Maustaste drehst du sie rundum, „Coach DK erklärt“ zeigt dir, worauf es ankommt.'
    : 'Tippe auf eine Übung: Die Figur zeigt dir die Bewegung in 3D. Mit dem Finger drehst du sie rundum, „Coach DK erklärt“ zeigt dir, worauf es ankommt.') })),
    h('div', { class: 'stapel' }, liste.map((u) => h('button', { class: 'eintrag mit3d', type: 'button', 'aria-haspopup': 'dialog', onclick: () => oeffneUebung(u) },
      h('span', { class: 'mini3d' + (u.d.a ? '' : ' ohne'), 'aria-hidden': 'true', 'data-vorschau': u.d.a ? u.id : '' }, u.d.a ? '' : '–'),
      h('b', { text: anzeigeName(u) }),
      h('span', { class: 'leise klein', text: (u.d.m || []).map((m) => MUSKEL[m] || m).join(', ') || 'Eigene Übung' }))))];
}

/* ---------- Infos ---------- */
let installEreignis = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEreignis = e; zeichne(); });
// Anleitung: als App auf den Home-Bildschirm (bis der Kunde sie wegtippt; unter Infos immer)
function installKarte(immer) {
  if (installiert() || (!immer && speicher.lies('dk_install_weg', false))) return null;
  const ua = navigator.userAgent || '', ios = /iPhone|iPad|iPod/.test(ua), android = /Android/.test(ua);
  const iphone = ['Öffne den Link in Safari, nicht in WhatsApp.', 'Tippe unten auf Teilen (Viereck mit Pfeil nach oben).', 'Wähle „Zum Home-Bildschirm“ und nenne es „Devin Kanke“.',
    'Öffne die App vom Home-Bildschirm und gib deinen Code dort noch einmal ein (das iPhone trennt App und Safari).'];
  const andro = ['Öffne den Link in Chrome, nicht in WhatsApp.', 'Tippe oben rechts auf ⋮.', 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'];
  const liste = (titel, schritte) => h('div', null, titel ? h('b', { class: 'klein', text: titel }) : null, h('ol', { class: 'klein' }, schritte.map((s) => h('li', { text: s }))));
  return h('section', { class: 'block' }, h('h2', { text: 'Als App aufs Handy' }),
    h('p', { class: 'leise klein', text: 'Dann öffnest du deinen Plan mit einem Tipp vom Home-Bildschirm, auch ohne Internet.' }),
    installEreignis ? h('button', { class: 'knopf haupt', type: 'button', onclick: async () => { installEreignis.prompt(); await installEreignis.userChoice; installEreignis = null; zeichne(); }, text: 'App installieren' })
      : ios ? liste('', iphone) : android ? liste('', andro) : [liste('iPhone', iphone), liste('Android', andro)],
    !immer ? h('button', { class: 'knopf klein', type: 'button', onclick: () => { speicher.schreib('dk_install_weg', true); zeichne(); }, text: 'Erledigt, ausblenden' }) : null);
}
// Töne und Vibration (10.11.2026): an- und ausschalten, nur auf diesem Handy
function gefuehlBlock() {
  const G = window.DKGefuehl;
  if (!G) return null;
  const schalter = (titel, an, setzen) => h('button', { class: 'knopf klein', type: 'button', 'aria-pressed': String(an), onclick: () => { setzen(!an); zeichne(); }, text: titel + ': ' + (an ? 'an' : 'aus') });
  return h('section', { class: 'block' }, h('h2', { text: 'Töne und Vibration' }),
    h('p', { class: 'leise klein', text: 'Ein leises Klicken bei jedem Knopf, ein Ton nach jedem Satz, Klatschen und Applaus, wenn dein Training geschafft ist. Steht dein Handy auf lautlos, bleibt es still.' }),
    G.iphoneKlopfen ? h('p', { class: 'leise klein', text: 'Auf dem iPhone spürst du ab iOS 18 ein kurzes Klopfen, wenn du etwas antippst.' }) : null,
    h('div', { class: 'reihe' }, schalter('Töne', G.ton(), G.setzeTon), schalter('Vibration', G.vibration(), G.setzeVibration),
      h('button', { class: 'knopf klein', type: 'button', onclick: () => G.spiel('geschafft'), text: 'Probe: Training geschafft' })));
}
// Farbwelt mit einem Tipp (18.11.2026): dieselben Farbwelten wie der runde Knopf oben rechts, hier zum direkten Antippen (antippen.js → window.dkFarbe)
function farbBlock() {
  const F = window.dkFarbe; if (!F) return null;
  return h('section', { class: 'block farb-block' }, h('h2', { text: 'Farbwelt' }),
    h('p', { class: 'leise klein', text: 'Antippen und sofort sehen. Oder oben rechts auf den runden Knopf tippen: Jeder Tipp zeigt die nächste.' }),
    h('div', { class: 'farb-wahl' }, F.welten.map(([w, n]) => h('button', { class: 'farb-eintrag', type: 'button', 'aria-pressed': F.jetzt() === w ? 'true' : 'false', onclick: () => { if (F.jetzt() !== w) F.setzen(w); } },
      h('i', { class: 'look-probe ' + w, 'aria-hidden': 'true' }), h('span', { text: n })))));
}
function ansichtInfo() {
  const p = S.plan, ko = aktivesKonto(), mitZugang = ko && ko.id === p.id;
  const plaene = Object.values(speicher.lies('dk_plaene', {}));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Infos' })),
    codeLeiste(mitZugang ? 'zugang' : ''),   // Code-Leiste auch unter Infos (07.11.2026): neuer Code oder neuester Plan
    mitZugang ? h('section', { class: 'block' }, h('h2', { text: 'Dein Zugang' }),
      h('p', { class: 'klein', text: 'Eingeloggt als ' + (ko.n || 'Kunde') + (ko.bis ? ' · bis ' + datumDe(ko.bis) + (tageBis(ko) >= 0 ? ' (noch ' + tageBis(ko) + (tageBis(ko) === 1 ? ' Tag)' : ' Tage)') : '') : ' · ohne Ablauf') }),
      h('p', { class: 'leise klein', text: 'Neuer Link von Devin? Einfach öffnen, der Code ist gespeichert. In der App vom Home-Bildschirm: Nachricht kopieren und hier einfügen.' }),
      einfuegenBlock('Neuen Link einfügen'),
      ko.code && KONTAKT.briefkasten ? h('button', { class: 'knopf klein', type: 'button', text: 'Nach neuem Plan suchen', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = 'Suche …'; const r = await zugangPruefen(true); if (r === 'neu') { toast('Neuer Stand von Devin ist da'); return; } if (r === 'aus') return; b.disabled = false; b.textContent = 'Nach neuem Plan suchen'; toast(r === 'aktuell' || r === 'unbekannt' ? 'Dein Plan ist aktuell.' : r === 'erneuert' ? CODE_TEXTE.erneuert : r === 'offline' || r === 'netz' ? 'Keine Verbindung. Bitte mit Internet nochmal.' : 'Gerade nicht möglich. Bitte später nochmal.'); } }) : null,
      h('button', { class: 'knopf klein', type: 'button', onclick: abmelden, text: 'Abmelden' })) : null,
    feedbackBlock(),   // Feedback an Devin (20.11.2026)
    installKarte(true),
    gefuehlBlock(),
    farbBlock(),
    h('section', { class: 'block' }, h('h2', { text: 'Begriffe' }),
      // QA 25.11.2026 (Rolle 02, Anfängerin): „Sätze“, „Wdh“ und die Aufteilung standen im Plan, waren aber nirgends erklärt
      h('p', { class: 'klein', text: 'Satz: eine Runde einer Übung am Stück. 3 Sätze heißt: Übung machen, Pause, das Ganze noch zweimal.' }),
      h('p', { class: 'klein', text: 'Wdh (Wiederholungen): wie oft du die Bewegung in einem Satz machst. 10–15 Wdh heißt: mindestens 10, höchstens 15.' }),
      h('p', { class: 'klein', text: 'Aufteilung: Ganzkörper trainiert jedes Mal den ganzen Körper. Oberkörper/Unterkörper wechselt zwischen oben und Beinen. Push/Pull/Beine heißt Drücken (Brust, Schultern, Trizeps), Ziehen (Rücken, Bizeps) und Beine an eigenen Tagen.' }),
      h('p', { class: 'klein', text: 'Reserve (RIR): Wiederholungen, die du am Ende des Satzes noch schaffen würdest. RIR 2 heißt: aufhören, wenn noch zwei gehen würden.' }),
      h('p', { class: 'klein', text: 'Pause: Zeit zwischen zwei Sätzen. Im Training läuft sie als Ring und geht danach von selbst weiter.' }),
      h('p', { class: 'klein', text: 'Coach DK erklärt: Knopf auf jeder 3D-Figur. Die Figur hält an der wichtigen Stelle an und zeigt dir, worauf du achten musst.' })),
    h('section', { class: 'block' }, h('h2', { text: 'Gespeichert' }),
      h('p', { class: 'klein leise', text: 'Plan vom ' + new Date(p.d || p.importiert).toLocaleDateString('de-DE') + ' · nur auf diesem Handy · Übungsdaten Stand ' + new Date(STAND).toLocaleDateString('de-DE') }),
      plaene.length > 1 ? h('div', { class: 'reihe' }, plaene.map((x) => h('button', { class: 'knopf klein', type: 'button', onclick: () => {
        speicher.schreib('dk_aktiv', x.id); if (konten()[x.id]) speicher.schreib('dk_konto', x.id); S.tagWahl = null; zeichne();
      }, text: (x.id === p.id ? '✓ ' : '') + (x.n || 'Plan') + (x.s ? ' · ' + x.s : '') }))) : null,
      !mitZugang ? einfuegenBlock('Neuen Link einfügen') : null,
      !mitZugang ? h('button', { class: 'knopf klein', type: 'button', onclick: planLoeschen, text: 'Diesen Plan vom Handy löschen' }) : null),
    infoUeber()];
}
// Abmelden: Zugang, Plan und Analyse-Entwurf gehen vom Handy (Devin kann jederzeit einen neuen Link schicken)
function abmelden(e) {
  const b = e.currentTarget;
  if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich abmelden? Nochmal tippen'; return; }
  const ko = aktivesKonto(), alle = konten(), plaene = speicher.lies('dk_plaene', {});
  delete alle[ko.id]; delete plaene[ko.id];
  speicher.schreib('dk_konten', alle); speicher.schreib('dk_plaene', plaene); speicher.schreib(entwurfKey(ko), null);
  speicher.schreib(VERLAUF_KEY, null); speicher.schreib('dk_tage_' + ko.id, null); if (LAUF) laufSchliessen();   // der nächste auf diesem Handy soll nichts davon sehen
  speicher.schreib(Statistik.SCHLUESSEL, null);   // Dein Fortschritt geht mit (wie der Verlauf)
  speicher.schreib(FRAGE_MAIL_KEY, null); speicher.schreib(LAUF_GESENDET_KEY, null);   // Adresse für Antworten und „schon gesendet“ gehen mit (23.11.2026)
  speicher.schreib('dk_konto', Object.keys(alle)[0] || null); speicher.schreib('dk_aktiv', Object.keys(plaene)[0] || null);
  EN = null; S.tagWahl = null; S.ansicht = 'heute'; zeichne(); window.scrollTo(0, 0);
}
function planLoeschen(e) {
  const b = e.currentTarget;
  if (!b.dataset.sicher) { b.dataset.sicher = '1'; b.textContent = 'Wirklich löschen? Nochmal tippen'; return; }
  const plaene = speicher.lies('dk_plaene', {}); delete plaene[S.plan.id]; speicher.schreib('dk_plaene', plaene);
  speicher.schreib('dk_aktiv', Object.keys(plaene)[0] || null); S.tagWahl = null; zeichne();
}

/* ---------- 3D ---------- */
let modul3d = null;
// Den echten Körper gleich mitladen (Texturen inklusive); klappt das nicht, zeigt die Bühne die gebaute Figur
function lade3dNormal() {
  KOPIEN.add('normal');
  if (!modul3d) modul3d = Promise.all([import('./figur.js'), import('./bewegungen.js'), import('./figur-modell.js').then((m) => m.ladeKoerper()).catch(() => null)])
    .then(([f, b]) => ({ ...f, ...b }), (e) => { modul3d = null; throw e; });
  return modul3d;
}
/* Figur überall (23.11.2026, Devin: „Der Status, wenn du den einstellst, dein Skin einstellst, siehst du den nicht, wenn du in den Gym gehst … dass es alles so eine Connection hat“):
   Die Figur, die der Kunde unter Status wählt (eigener Charakter oder Skin), zeigt jede 3D-Ansicht der App: Gym, Station, Training ohne Gym, Übungs-Blätter, Vorschaubilder.
   Die 3D-Dateien kommen dann aus charakter/ (eigene Kopie mit der Figur), die normale Kopie lädt gar nicht erst. Lädt die Figur nicht, zeigt die normale Figur die Übung (einmal ein Hinweis).
   KOPIEN merkt sich, welche Kopie schon geladen ist: Braucht eine neue Wahl die andere, lädt die Seite einmal neu (figurGewechselt), so sind am Handy nie zwei Kopien im Speicher. */
const KOPIEN = new Set();
let figur3d = null, figur3dSchl = '';
const figurZiel = () => ({ plan: S.plan, konto: aktivesKonto(), lies: speicher.lies, schreib: speicher.schreib });   // Anschluss für später (Status „Dein Gewicht heute“): gewicht: (speicher.lies('dk_gewicht_' + (S.plan && S.plan.id), null) || {}).kg, figurwahl.eigene nimmt es als Gewicht der eigenen Figur
const figurJetzt = () => Figurwahl.jetzt(figurZiel());
function lade3d() {
  const f = figurJetzt();
  if (!f.c) return lade3dNormal();
  const schl = f.id + ':' + Status.kennung(f.c);
  if (!figur3d || figur3dSchl !== schl) { KOPIEN.add('figur'); figur3dSchl = schl; figur3d = import('./charakter/gym.js').then((m) => m.lade3d(f.c)); }
  return figur3d.catch(() => {
    figur3d = null;
    if (!S.figurFehler) { S.figurFehler = true; toast((f.eigen ? 'Dein Charakter' : f.name) + ' lädt gerade nicht. Die normale Figur zeigt die Übung.'); }
    return lade3dNormal();
  });
}
// Nach einer neuen Wahl (Status, Hinweis „Neue Figur von Devin“): Braucht die Figur die andere 3D-Kopie und ist schon eine geladen, lädt die Seite einmal neu und zeigt danach dieselbe Seite
function figurGewechselt(text) {
  const kopie = figurJetzt().c ? 'figur' : 'normal';
  if (KOPIEN.size && !KOPIEN.has(kopie)) {
    try { sessionStorage.setItem('dk_figur_neu', JSON.stringify({ text, ansicht: S.ansicht })); location.reload(); return; } catch (e) { /* ohne sessionStorage geht es ohne Neuladen weiter */ }
  }
  if (kopie === 'figur') import('./charakter/gym.js').then((m) => m.vorladen()).catch(() => {});   // Figur und Gym einmal laden, dann geht es auch ohne Internet
  toast(text);
  try { window.dispatchEvent(new CustomEvent('dk-look', { detail: document.documentElement.dataset.look })); } catch (e) { zeichne(); }   // wie nach der Farbwahl: buehne.js malt die Vorschaubilder neu, die Seite zeichnet sich neu
}
function figurWaehlen(id, name) { Figurwahl.waehlen(figurZiel(), id); figurGewechselt((id === 'eigen' ? 'Dein Charakter' : name) + ' trainiert jetzt überall'); }
function figurHinweis() {
  return Figurwahl.hinweisKarte({ h, f: figurJetzt(),
    ja: () => { Figurwahl.uebernehmen(figurZiel()); figurGewechselt('Deine neue Figur von Devin trainiert jetzt überall'); },
    nein: () => { Figurwahl.behalten(figurZiel()); toast('Deine Figur bleibt'); zeichne(); } });
}
function fotoGross(src) {
  const zu = () => { el.remove(); document.removeEventListener('keydown', taste); };
  const taste = (e) => { if (e.key === 'Escape') zu(); };
  const el = h('div', { class: 'foto-gross', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'So macht’s Devin' },
    h('div', { class: 'zu-reihe' }, h('button', { class: 'zu-rund', type: 'button', 'aria-label': 'Schließen', onclick: zu, text: '✕' })),
    h('img', { src, alt: 'Devin zeigt die Übung', onclick: zu }), h('p', { text: 'So macht’s Devin' }));
  document.body.append(el); document.addEventListener('keydown', taste);
}
// Fotos der Plan-Übungen einmal laden: Der Offline-Speicher behält sie, so sind sie auch ohne Netz im Gym da
function fotosVorladen() {
  if (!S.plan || navigator.onLine === false) return;
  const ko = aktivesKonto();
  if ((ko && ko.c) || figurJetzt().c) setTimeout(() => import('./charakter/gym.js').then((m) => m.vorladen()).catch(() => {}), 3000);   // der eigene Charakter ist auch ohne Internet im Gym dabei
  const pfade = new Set();
  for (const t of S.plan.t || []) for (const x of t.u || []) { const d = UEBUNGEN[x.i]; if (d && d.b) pfade.add(d.b); }
  if (pfade.size) setTimeout(() => pfade.forEach((p) => fetch(p).catch(() => {})), 2500);
}

/* ---------- Blatt von unten (wie in der Trainer-Seite): Übung mit 3D-Figur ---------- */
let BLATT = null;
function oeffneBlatt(titel, unter, inhalt, beimSchliessen) {
  const eintrag = BLATT && BLATT.eintrag;   // Zurück-Taste: ein Eintrag im Verlauf pro offenem Blatt
  schliesseBlatt(true, true);
  const vorher = document.activeElement;
  const hg = h('div', { class: 'blatt-hg', onclick: () => schliesseBlatt() });
  const zu = h('button', { class: 'blatt-zu', type: 'button', 'aria-label': 'Schließen', text: '✕', onclick: () => schliesseBlatt() });
  const griff = h('div', { class: 'blatt-griff', 'aria-hidden': 'true' }, h('i'));
  const kopfEl = h('div', { class: 'blatt-kopf' }, h('h2', { id: 'blatt-titel', text: titel }), zu, unter ? h('div', { class: 'unter', text: unter }) : null);
  const el = h('div', { class: 'blatt', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'blatt-titel' }, griff, kopfEl, h('div', { class: 'blatt-inhalt' }, inhalt));
  document.body.append(hg, el);
  document.body.style.overflow = 'hidden';
  if (!eintrag) history.pushState({ blatt: 1 }, '');
  BLATT = { el, hg, vorher, beimSchliessen, eintrag: true };
  void el.offsetHeight;
  hg.classList.add('offen'); el.classList.add('offen');
  setTimeout(() => { try { zu.focus({ preventScroll: true }); } catch (e) { zu.focus(); } }, 60);
  // Nach unten ziehen schließt
  let start = null, dy = 0;
  const runter = (e) => { start = e.clientY; dy = 0; el.style.transition = 'none'; try { e.target.setPointerCapture(e.pointerId); } catch (x) {} };
  const zieh = (e) => { if (start === null) return; dy = Math.max(0, e.clientY - start); el.style.transform = 'translateY(' + dy + 'px)'; };
  const los = () => { if (start === null) return; start = null; el.style.transition = ''; el.style.transform = ''; if (dy > 90) schliesseBlatt(); };
  [griff, kopfEl].forEach((x) => {
    x.addEventListener('pointerdown', (e) => { if (e.target.closest('.blatt-zu')) return; runter(e); });
    x.addEventListener('pointermove', zieh); x.addEventListener('pointerup', los); x.addEventListener('pointercancel', los);
  });
}
// sofort: ohne Ausblenden; ohneZurueck: der Verlaufseintrag bleibt (neues Blatt übernimmt ihn oder er ist schon weg)
function schliesseBlatt(sofort, ohneZurueck) {
  if (!BLATT) return;
  const b = BLATT; BLATT = null;
  if (b.beimSchliessen) b.beimSchliessen();
  document.body.style.overflow = TM.el ? 'hidden' : '';
  b.el.classList.remove('offen'); b.hg.classList.remove('offen');
  const weg = () => { b.el.remove(); b.hg.remove(); };
  if (sofort) weg(); else setTimeout(weg, 420);
  if (!ohneZurueck && b.eintrag) { ZURUECK_LEISE = true; history.back(); }
  if (b.vorher && b.vorher.isConnected) { try { b.vorher.focus({ preventScroll: true }); } catch (e) {} }
}
let ZURUECK_LEISE = false;
window.addEventListener('popstate', () => {
  if (ZURUECK_LEISE) { ZURUECK_LEISE = false; return; }
  if (BLATT) { BLATT.eintrag = false; schliesseBlatt(false, true); return; }
  if (GYM) { if (GYM.raum) GYM.raum.schliessen(false); return; }
  if (PR) { if (PR.raum) PR.raum.schliessen(false); return; }
  if (TM.el && LAUF && LAUF.phase !== 'fertig') { history.pushState({ training: 1 }, ''); TM.frage = true; timerZeigen(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') schliesseBlatt(); });
document.addEventListener('touchstart', () => {}, { passive: true });   // iOS: sonst greift :active (Antipp-Effekt) nicht

function tauschBlatt(u) {
  oeffneBlatt('Gerät nicht da?', 'Sollen wir ' + u.name + ' ändern? Das hier passt sicher zu deinem Plan.', [
    h('div', { class: 'stapel' }, tauschOptionen(u).map((a) => {
      const d = UEBUNGEN[a.i];
      return h('button', { class: 'eintrag', type: 'button', onclick: () => { tauschen(u.tausch, a.i); schliesseBlatt(); toast('Getauscht: ' + d.n); zeichne(); } },
        h('b', { text: d.n + (a.orig ? ' (wie im Plan)' : '') }), h('span', { class: 'leise klein', text: (d.m || []).map((m) => MUSKEL[m] || m).join(', ') }));
    })),
    h('button', { class: 'knopf', type: 'button', onclick: () => feedbackBlatt({ u }), text: 'Nichts passt? Devin Bescheid sagen' })]);   // Feedback an Devin (20.11.2026)
}
/* ---------- Feedback an Devin (20.11.2026, Devin: „Feedback-Button … das gibt es hier nicht im Fitnessstudio … wird mir über Gmail geschickt“) ----------
   Ohne Kunden-Eingang öffnet sich die Mail-App fertig ausgefüllt an KONTAKT.mail (wie beim Training ohne Skript), der Kunde tippt nur noch auf Senden.
   Mit Kunden-Eingang (kontakt.json → eingang_skript, seit 23.11.2026 dasselbe Skript wie Analyse, Fragen und Trainings) geht es direkt in Devins Gmail, ohne Mail-App. Die Zeile DK-Feedback:…:Ende kann die Trainer-Seite später lesen. */
const FB_ARTEN = [['geraet', 'Gerät gibt es hier nicht'], ['unklar', 'Übung ist unklar'], ['anderes', 'Etwas anderes']];
const FB_PLATZ = { geraet: 'Zum Beispiel: Bei uns gibt es dafür eine Pendel-Kniebeuge.', unklar: 'Was ist dir unklar?', anderes: 'Deine Idee oder dein Problem …' };
let FB_ZULETZT = 0;
function feedbackWer() { const ko = aktivesKonto(); return ko && ko.n ? ko.n : ''; }   // nur eingeloggt: Name aus dem Zugang
function feedbackText(f) {
  const ko = aktivesKonto(), p = S.plan, art = (FB_ARTEN.find((a) => a[0] === f.art) || FB_ARTEN[2])[1];
  const z = ['DK Feedback · ' + (feedbackWer() || (p && p.n ? 'Plan ' + p.n + ', nicht eingeloggt' : 'ohne Plan')), new Date().toLocaleString('de-DE'), '', 'Worum es geht: ' + art];
  if (f.u) z.push('Übung: ' + anzeigeName(f.u));
  if (f.ti != null && p && p.t && p.t[f.ti]) z.push('Training ' + (f.ti + 1) + ' · ' + p.t[f.ti].n);
  z.push('', f.text || '(ohne Text)', '', 'Code für ' + KONTAKT.marke + ' (nicht ändern):',
    'DK-Feedback:' + zuB64(new TextEncoder().encode(JSON.stringify({ v: 1, a: f.art, u: f.u ? f.u.id : null, t: f.text || '', k: ko ? ko.id : null, s: STAND }))) + ':Ende');
  return z.join('\n');
}
function feedbackBetreff(f) { const art = (FB_ARTEN.find((a) => a[0] === f.art) || FB_ARTEN[2])[1]; return 'Feedback für ' + KONTAKT.marke + ': ' + art + (f.u ? ' · ' + anzeigeName(f.u) : ''); }
const feedbackMailLink = (f) => 'mailto:' + KONTAKT.mail + '?subject=' + encodeURIComponent(feedbackBetreff(f)) + '&body=' + encodeURIComponent(feedbackText(f).replace(/\n/g, '\r\n'));
/* Kunden-Eingang (23.11.2026, Devin: „sie drücken nur drauf und das wird direkt automatisiert gesendet … Drücken die drauf und direkt ist das bei mir“):
   EIN Google-Skript in Devins Konto (analyse-eingang/analyse-eingang.gs, kontakt.json → eingang_skript) nimmt Analyse, Fragen, Trainings und Feedback an und legt sie als Mail in sein Gmail.
   Wie briefPost: JSON als Text, keine Cookies, nichts in der Adresse, 20 s Zeit; ok nur, wenn das Skript ok sagt. Ohne Skript oder offline gleich { ok: false }: Dann nimmt jeder Knopf die Mail-App wie bisher. */
async function eingangSenden(daten) {
  if (!KONTAKT.eingang || navigator.onLine === false) return { ok: false };
  const stopp = new AbortController(), uhr = setTimeout(() => stopp.abort(), 20000);
  try {
    const r = await fetch(KONTAKT.eingang, { method: 'POST', body: JSON.stringify(Object.assign({ v: 1 }, daten)), cache: 'no-store', credentials: 'omit', redirect: 'follow', signal: stopp.signal });
    if (!r.ok) return { ok: false };
    try { const j = JSON.parse(await r.text()); return j && j.ok === true ? j : { ok: false }; } catch (e) { return { ok: false }; }
  } catch (e) { return { ok: false }; } finally { clearTimeout(uhr); }
}
function feedbackBlatt(f = {}) {
  const st = { art: f.u ? 'geraet' : 'anderes', text: '' }, direkt = !!KONTAKT.eingang, jetzt = () => Object.assign({}, f, st);
  const feld = h('textarea', { class: 'eingabe', rows: '4', maxlength: '600', 'aria-label': 'Was soll Devin wissen?' });
  const wahl = h('div', { class: 'fs-wahl fb-wahl', role: 'group', 'aria-label': 'Worum geht es?' });
  const senden = direkt ? h('button', { class: 'knopf haupt', type: 'button', text: 'An Devin senden' }) : h('a', { class: 'knopf haupt', href: feedbackMailLink(jetzt()), text: 'An Devin senden' });
  const neu = () => {
    wahl.replaceChildren(...FB_ARTEN.map(([w, n]) => h('button', { class: 'fs-wahl-knopf', type: 'button', 'aria-pressed': String(st.art === w), onclick: () => { st.art = w; neu(); }, text: n })));
    feld.placeholder = FB_PLATZ[st.art];
    if (!direkt) senden.href = feedbackMailLink(jetzt());
  };
  feld.addEventListener('input', () => { st.text = feld.value.trim().slice(0, 600); if (!direkt) senden.href = feedbackMailLink(jetzt()); });
  senden.addEventListener('click', async (e) => {
    if (!direkt) { setTimeout(() => { schliesseBlatt(); toast('Deine Mail-App ist offen. Tippe dort auf Senden.'); }, 400); return; }
    e.preventDefault();
    if (Date.now() - FB_ZULETZT < 30000) { toast('Gerade gesendet. Bitte kurz warten.'); return; }
    senden.disabled = true; senden.textContent = 'Sende …';
    const r = await eingangSenden({ art: 'feedback', betreff: feedbackBetreff(jetzt()), text: feedbackText(jetzt()) });
    if (r.ok) { FB_ZULETZT = Date.now(); schliesseBlatt(); toast('Danke! Devin hat dein Feedback.'); return; }
    senden.disabled = false; senden.textContent = 'An Devin senden';
    location.href = feedbackMailLink(jetzt()); toast('Direkt ging gerade nicht. Deine Mail-App ist offen, tippe dort auf Senden.');
  });
  const tauschen = f.u && f.u.tausch && !(LAUF && LAUF.phase !== 'fertig') && tauschOptionen(f.u).length;
  oeffneBlatt('Feedback an Devin', f.u ? 'Zu: ' + anzeigeName(f.u) : 'Fehlt ein Gerät, ist etwas unklar oder hast du eine Idee?', [
    h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Worum geht es?' }), wahl),
    h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Was soll Devin wissen? (freiwillig)' }), feld),
    senden,
    h('p', { class: 'leise klein', text: (direkt ? 'Geht direkt an Devin.' : 'Deine Mail-App öffnet sich fertig ausgefüllt. Tippe dort nur noch auf Senden.') + (feedbackWer() ? ' Dein Name aus dem Plan steht dabei.' : '') }),
    tauschen ? h('button', { class: 'knopf', type: 'button', onclick: () => tauschBlatt(f.u), text: 'Lieber gleich eine andere Übung wählen' }) : null
  ]);
  neu();
}
function feedbackBlock() {   // Frage oder Feedback an Devin (20.11.2026 Feedback, 23.11.2026 auch Fragen)
  return h('section', { class: 'block' }, h('h2', { text: 'Frage oder Feedback' }),
    h('p', { class: 'leise klein', text: 'Hast du eine Frage, fehlt in deinem Studio ein Gerät oder ist eine Übung unklar? Schreib es Devin. Bei einer Übung geht Feedback auch direkt über „Gibt es hier nicht? Feedback“.' }),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf', type: 'button', onclick: () => frageBlatt(), text: 'Frage stellen' }),
      h('button', { class: 'knopf', type: 'button', onclick: () => feedbackBlatt({}), text: 'Feedback schreiben' })));
}
/* ---------- Frage an Devin (23.11.2026, Devin: „wenn die irgendwelche Fragen haben …, dass sie das per E-Mail schicken können … Das ist einfach wie ein Knopf. Drücken die drauf und direkt ist das bei mir“) ----------
   Mit Kunden-Eingang: Frage und Adresse für die Antwort, ein Tipp, direkt in Devins Gmail. „Antworten“ geht dort an den Kunden (Reply-To).
   Die Adresse merkt sich nur dieses Handy, und erst nach dem Senden (für die nächste Frage). Abmelden löscht sie.
   Ohne Skript, offline oder wenn es nicht klappt: die Mail-App fertig ausgefüllt, „Antworten“ geht dann an die eigene Adresse des Kunden. */
const FRAGE_MAIL_KEY = 'dk_frage_mail', FRAGE_MAIL_RE = /^[^\s@<>()",;:\\]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;   // wie analyse.html und das Skript
let FRAGE_ZULETZT = 0;
const ohneSteuerzeichen = (t) => String(t || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
function frageBetreff() { const wer = ohneSteuerzeichen(feedbackWer()).slice(0, 120); return 'Frage für ' + KONTAKT.marke + (wer ? ': ' + wer : ''); }
function frageText(frage, mail) {
  const p = S.plan, z = ['DK Frage · ' + (ohneSteuerzeichen(feedbackWer()).slice(0, 120) || (p && p.n ? 'Plan ' + p.n + ', nicht eingeloggt' : 'ohne Plan')), new Date().toLocaleString('de-DE')];
  if (mail) z.push('Antwort bitte an: ' + mail);
  z.push('', frage);
  return z.join('\n');
}
const frageMailLink = (frage) => 'mailto:' + KONTAKT.mail + '?subject=' + encodeURIComponent(frageBetreff()) + '&body=' + encodeURIComponent(frageText(frage, '').replace(/\n/g, '\r\n'));
function frageBlatt() {
  const direkt = !!KONTAKT.eingang, gemerkt = direkt ? String(speicher.lies(FRAGE_MAIL_KEY, '') || '') : '';
  const feld = h('textarea', { class: 'eingabe', rows: '5', maxlength: '1000', 'aria-label': 'Deine Frage an Devin', placeholder: 'Zum Beispiel: Wie schwer soll ich bei der Kniebeuge anfangen?' });
  const adresse = direkt ? h('input', { class: 'eingabe', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', maxlength: '120',
    'aria-label': 'Deine E-Mail-Adresse für die Antwort', placeholder: 'deine E-Mail-Adresse', value: gemerkt }) : null;
  const meldung = h('p', { class: 'meldung klein fr-meldung', role: 'alert', style: 'display:none' });
  const senden = direkt ? h('button', { class: 'knopf haupt', type: 'button', text: 'An Devin senden' }) : h('a', { class: 'knopf haupt', href: frageMailLink(''), text: 'An Devin senden' });
  const frage = () => feld.value.trim().slice(0, 1000);
  const zeige = (t, el) => { meldung.textContent = t; meldung.style.display = t ? '' : 'none'; if (t && el) el.focus(); };
  feld.addEventListener('input', () => { zeige(''); if (!direkt) senden.href = frageMailLink(frage()); });
  if (adresse) adresse.addEventListener('input', () => zeige(''));
  senden.addEventListener('click', async (e) => {
    if (frage().length < 5) { e.preventDefault(); zeige('Schreib zuerst deine Frage.', feld); return; }
    if (!direkt) { setTimeout(() => { schliesseBlatt(); toast('Deine Mail-App ist offen. Tippe dort auf Senden.'); }, 400); return; }
    const mail = adresse.value.trim().toLowerCase();
    if (mail.length > 120 || !FRAGE_MAIL_RE.test(mail)) { zeige('Bitte trag deine E-Mail-Adresse ein, damit Devin dir antworten kann.', adresse); return; }
    if (senden.disabled) return;
    if (Date.now() - FRAGE_ZULETZT < 30000) { toast('Gerade gesendet. Bitte kurz warten.'); return; }
    senden.disabled = true; senden.textContent = 'Sende …';
    const r = await eingangSenden({ art: 'frage', betreff: frageBetreff(), text: frageText(frage(), mail), mail });
    if (r.ok) { FRAGE_ZULETZT = Date.now(); speicher.schreib(FRAGE_MAIL_KEY, mail); schliesseBlatt(); toast('Gesendet. Devin antwortet dir per E-Mail.'); return; }
    senden.disabled = false; senden.textContent = 'An Devin senden';
    location.href = frageMailLink(frage()); toast('Direkt ging gerade nicht. Deine Mail-App ist offen, tippe dort auf Senden.');
  });
  oeffneBlatt('Frage an Devin', 'Er antwortet dir per E-Mail.', [
    h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Deine Frage' }), feld),
    adresse ? h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Deine E-Mail für die Antwort' }), adresse) : null,
    meldung,
    senden,
    h('p', { class: 'leise klein', text: direkt ? 'Geht direkt an Devin.' + (feedbackWer() ? ' Dein Name aus dem Plan steht dabei.' : '') + ' Deine Adresse merkt sich nur dieses Handy.'
      : 'Deine Mail-App öffnet sich fertig ausgefüllt. Tippe dort nur noch auf Senden.' })
  ]);
}
function oeffneUebung(u, ti) {
  const d = u.d, p = S.plan;
  const b = buehne({ lade3d, fotoGross });
  const muskeln = (d.m || []).map((m) => MUSKEL[m] || m).join(', ');
  const abschnitt = (titel, liste) => liste && liste.length ? h('div', { class: 'blatt-abschnitt' }, h('b', { text: titel }), h('ul', null, liste.map((x) => h('li', { text: x })))) : null;
  oeffneBlatt(anzeigeName(u), [ti != null ? 'Training ' + (ti + 1) + ' · ' + p.t[ti].n : '', muskeln].filter(Boolean).join(' · '), [
    b.el,
    u.saetze ? h('div', { class: 'blatt-werte' },
      h('span', { class: 'chip', text: satzZahl(p, u) + ' Sätze' }), h('span', { class: 'chip', text: dosis(u) }),
      u.rir ? h('span', { class: 'chip', text: 'Reserve ' + bereich(u.rir) + ' Wdh' }) : null, u.pause.length ? h('span', { class: 'chip', text: pauseText(u) + ' Pause' }) : null) : null,
    u.notiz ? h('p', { class: 'notiz', text: u.notiz }) : null,
    angepasstBlock(angepasst(p, u)), fuerDichBlock(u),
    abschnitt('So geht’s', d.t), abschnitt('Typische Fehler', d.f),
    d.v && d.v.length ? h('div', { class: 'blatt-abschnitt' }, h('b', { text: 'Vorsicht' }), h('p', { text: d.v.join(' ') })) : null,
    !(LAUF && LAUF.phase !== 'fertig') && tauschOptionen(u).length ? h('button', { class: 'knopf', type: 'button', onclick: () => tauschBlatt(u), text: 'Gerät nicht da? Tauschen' }) : null,
    h('button', { class: 'knopf', type: 'button', onclick: () => feedbackBlatt({ u, ti }), text: 'Gibt es hier nicht? Feedback' })   // Feedback an Devin (20.11.2026)
  ], () => b.weg());
  b.zeige(d);
}

/* ---------- Training: Satz für Satz mit 3D-Figur, Pause als Ring (wie der Timer der Trainer-Seite) ---------- */
// Ergebnis-Text und Code „DK-Lauf:…:Ende“ sind gleich wie in der Trainer-Seite: Devin fügt sie dort beim Kunden ein.
const LAUF_KEY = 'dk_lauf', VERLAUF_KEY = 'dk_verlauf';
let LAUF = speicher.lies(LAUF_KEY, null);
const TM = { el: null, frage: false, wach: null, buehne: null, gezeigt: null, speichert: false, fehler: null, sperreBis: 0 };
const laufSichern = () => speicher.schreib(LAUF_KEY, LAUF);
function mmss(sek) {
  sek = Math.max(0, Math.round(sek || 0));
  const st = Math.floor(sek / 3600), m = Math.floor(sek % 3600 / 60), s = sek % 60;
  return (st ? st + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (s < 10 ? '0' : '') + s;
}
const datumZeit = (ms) => new Date(ms).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
let AUDIO = null;
// Töne und Vibration (10.11.2026): Töne und Klopfen aus gefuehl.js; fehlt die Datei, bleibt das alte Piepen
const gefuehl = (name) => { try { if (window.DKGefuehl) window.DKGefuehl.spiel(name); } catch (e) { /* nichts */ } };
function piep(n) {
  if (window.DKGefuehl) { gefuehl(n === 1 ? 'start' : 'weiter'); return; }
  try {
    AUDIO = AUDIO || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < (n || 2); i++) {
      const o = AUDIO.createOscillator(), g = AUDIO.createGain(), t0 = AUDIO.currentTime + i * 0.22;
      o.frequency.value = 880; o.connect(g); g.connect(AUDIO.destination);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.start(t0); o.stop(t0 + 0.18);
    }
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([150, 80, 150]); } catch (e) {}
}
function wach(an) {
  try {
    if (an && navigator.wakeLock && !TM.wach) navigator.wakeLock.request('screen').then((l) => { TM.wach = l; l.addEventListener('release', () => { TM.wach = null; }); }, () => {});
    if (!an && TM.wach) { TM.wach.release(); TM.wach = null; }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && LAUF && LAUF.phase !== 'fertig') { wach(true); timerTick(); } });

/* ---------- Gym (raum.js): der Trainingstag als kleines 3D-Spiel. LAUF bleibt die eine Wahrheit: An der Station läuft der normale Satz-Ablauf, nur ohne eigene Bühne (die Figur trainiert in der Halle). ---------- */
let GYM = null;
function raumLaden(wie, p) {
  const normal = () => import('./raum.js').then((m) => m.raumOeffnen({ ...wie, lade3d: lade3dNormal }));   // das normale Gym immer mit der normalen Kopie (raum.js holt einleitung.js aus demselben Ordner)
  // Eigener Charakter: läuft aus dem Ordner charakter/ mit eigener Kopie der Figur. Klappt das nicht, trainiert die normale Figur, das Training selbst bleibt gleich
  // Status (18.11.2026): Wer im Gym trainiert, wählt der Kunde unter Status (eigener Charakter, normale Figur oder ein Skin).
  // Figur überall (23.11.2026): dieselbe Wahl wie bei jeder 3D-Figur der App (figurwahl.js), auf allen Wegen hinein. „Im Gym spielen“ auf „Mein Charakter“ wählt vorher den eigenen Charakter (figurAusLink)
  const f = Figurwahl.jetzt({ plan: p, konto: aktivesKonto(), lies: speicher.lies }), c = f.c;
  if (c) KOPIEN.add('figur');
  if (c) toast(f.eigen ? 'Dein Charakter kommt …' : f.name + ' kommt …');
  return c ? import('./charakter/gym.js').then((m) => m.oeffnen(c, { ...wie, name: vorname(p.n) })).catch(() => { toast((f.eigen ? 'Dein Charakter lädt' : f.name + ' lädt') + ' gerade nicht. Heute trainiert die normale Figur.'); return normal(); }) : normal();
}
/* PR-Raum: aus dem Gym durch die Tür (zurueck bringt die Figur dann wieder vor die Tür) oder von der Rang-Seite */
let PR = null;
function prRaumOeffnen(zurueck) {
  if (PR || GYM) return;
  PR = {};
  const fertig = () => { PR = null; if (zurueck) zurueck(); else { document.body.style.overflow = ''; if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); } zeichne(); } };
  if (!zurueck && !(history.state && history.state.training)) history.pushState({ training: 1 }, '');
  PrRaum.oeffnen({ h, UEBUNGEN, plan: S.plan, toast, datum: datumHeute, ausgang: zurueck ? 'Zurück ins Gym' : 'Zurück', beiZu: fertig,
    starte: (wie) => raumLaden({ ...wie, lade3d }, S.plan) })
    .then((r) => { if (PR) PR.raum = r; }, () => { PR = null; OHNE_3D = true; toast('Der PR-Raum lädt gerade nicht. Du kannst hier eintragen.'); if (zurueck) zurueck(); else { if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); } zeichne(); } });
}
// Offenes Training (11.11.2026): Auf diesem Handy ist noch ein Training offen (anderes Konto oder anderer Trainingstag). Statt nur einer Meldung sagt ein Blatt,
// welches es ist, und bietet an: fortsetzen (nur gleicher Plan), beenden und dann ins Gym, oder abbrechen. Gemachte Sätze bleiben im Verlauf.
function laufVerwerfen() {
  if (!LAUF) return;
  if (LAUF.phase !== 'fertig' && LAUF.uebungen.some((u) => u.log.length)) {
    const r = ergebnis('abgebrochen');
    speicher.schreib(VERLAUF_KEY, [r].concat(verlaufListe().filter((x) => x.s !== r.s)).slice(0, 40));
    if (LAUF.plan !== 'beispiel') statistikMerken([r]);
  }
  LAUF = null; laufSichern(); wach(false);
  if (TM.buehne) { TM.buehne.weg(); TM.buehne = null; TM.gezeigt = null; }
  if (TM.el) { TM.el.remove(); TM.el = null; }
}
// Erst wenn das Blatt seinen Verlaufseintrag zurückgegeben hat, das Nächste öffnen (sonst nimmt der Zurück-Schritt das Gym gleich wieder mit)
function nachDemBlatt(tun) {
  let fertig = false;
  const los = () => { if (fertig) return; fertig = true; window.removeEventListener('popstate', los); setTimeout(tun, 0); };
  window.addEventListener('popstate', los); setTimeout(los, 600);
}
function altesTraining(p, ti) {
  if (!LAUF || !p) return;
  const eigen = LAUF.plan === p.id, saetze = LAUF.uebungen.reduce((n, u) => n + u.log.length, 0);
  const text = '„' + (LAUF.tagName || 'Training') + '“' + (!eigen && LAUF.kunde ? ' von ' + LAUF.kunde : '') + ', angefangen ' + datumZeit(LAUF.start) + ', '
    + (saetze ? saetze + (saetze === 1 ? ' Satz' : ' Sätze') + ' gemacht.' : 'noch kein Satz gemacht.');
  const knopf = (klasse, titel, tun) => h('button', { class: 'knopf ' + klasse, type: 'button', text: titel, onclick: () => { schliesseBlatt(true); if (tun) nachDemBlatt(tun); } });
  oeffneBlatt('Noch ein Training offen', 'Auf diesem Handy', [
    h('p', { text }),
    h('p', { class: 'leise klein', text: eigen ? 'Du kannst es fortsetzen oder beenden. Beendest du es, bleiben deine gemachten Sätze im Verlauf.'
      : 'Es gehört zu einem anderen Konto auf diesem Handy. Beendest du es, bleiben die gemachten Sätze im Verlauf.' }),
    h('div', { class: 'stapel' },
      eigen ? knopf('haupt', 'Altes Training fortsetzen', () => { if (!LAUF) return; if (LAUF.gym) raumStarten(p, LAUF.tagNr - 1); else timerZeigen(); }) : null,
      knopf(eigen ? '' : 'haupt', 'Altes Training beenden, dann ins Gym', () => { laufVerwerfen(); zeichne(); raumStarten(p, ti); }),
      knopf('', 'Abbrechen', null))
  ]);
}
function raumStarten(p, ti, abTuer) {
  if (GYM || !p) return;
  if (LAUF && LAUF.phase !== 'fertig' && (LAUF.plan !== p.id || LAUF.tagNr !== ti + 1)) { altesTraining(p, ti); return; }
  if (!LAUF || LAUF.phase === 'fertig') laufStarten(p, ti, true);
  LAUF.gym = true; LAUF.phase = 'frei'; laufSichern(); wach(true);
  if (TM.buehne) { TM.buehne.weg(); TM.buehne = null; TM.gezeigt = null; }
  if (TM.el) { TM.el.remove(); TM.el = null; }
  GYM = {};
  if (!(history.state && history.state.training)) history.pushState({ training: 1 }, '');
  const heute = tagFuer(p, heuteIndex()) === ti, haken = heute ? erledigtLaden(p, ti) : [];
  const wie = { lade3d, titel: LAUF.tagName, beiStation: gymStation, beiStationWeg: gymStationWeg, beiZu: gymZu, status: () => Spiel.status(), abTuer: !!abTuer, prTuer: () => { const zurueckZu = LAUF ? LAUF.tagNr - 1 : ti; GYM = null; gymStationWeg(); prRaumOeffnen(() => raumStarten(p, zurueckZu, true)); },   // status: Spielstand für die Karte im Raum (wirft nie)
    uebungen: LAUF.uebungen.map((u, i) => ({ id: u.id, name: u.name, dosis: u.saetze + ' × ' + u.dosis, pause: '', d: UEBUNGEN[u.id] || { n: u.name, m: [] }, fertig: u.log.length >= u.saetze || haken.indexOf(i) >= 0 })) };
  raumLaden(wie, p)
    .then((r) => { if (GYM) GYM.raum = r; }, () => { toast('Das Gym lädt gerade nicht.'); gymZu(false); });
}
// „Im Gym spielen“ auf „Mein Charakter“ (#gym, 23.11.2026): Der eigene Charakter wird gewählt und trainiert dann überall (vorher nur bei diesem einen Besuch, Status blieb beim Skin).
// Läuft vor dem ersten Zeichnen, damit die Vorschaubilder gleich mit derselben Figur entstehen (eine 3D-Kopie)
function figurAusLink() {
  if (/[#&]gym\b/.test(location.hash) && Figurwahl.eigene(figurZiel()).c && figurJetzt().id !== 'eigen') Figurwahl.waehlen(figurZiel(), 'eigen');
}
// Von der Seite „Mein Charakter“ (#gym): gleich ins Gym, mit dem laufenden Training, sonst dem von heute oder dem nächsten
function gymAusLink() {
  if (!/[#&]gym\b/.test(location.hash)) return;
  history.replaceState(null, '', location.pathname + location.search);   // den eigenen Charakter hat figurAusLink schon gewählt
  const p = S.plan;
  if (!p) return;
  if (LAUF && LAUF.phase !== 'fertig') { if (LAUF.gym && LAUF.plan === p.id) raumStarten(p, LAUF.tagNr - 1); return; }
  let ti = -1;
  for (let i = 0; i < 7 && ti < 0; i++) ti = tagFuer(p, (heuteIndex() + i) % 7);
  raumStarten(p, Math.max(0, ti));
}
function gymStation(i, ort) {
  const u = LAUF.uebungen[i];
  LAUF.ue = i; LAUF.satz = Math.min(u.log.length, u.saetze - 1); LAUF.phase = 'satz'; LAUF.seit = Date.now(); LAUF.uebungFertig = false;
  TM.gym = ort; TM.frage = false; laufSichern(); timerZeigen();
}
function gymStationWeg() {
  if (TM.el) { TM.el.remove(); TM.el = null; }
  TM.gym = null;
  if (LAUF && LAUF.phase !== 'fertig') { LAUF.phase = 'frei'; LAUF.uebungFertig = false; laufSichern(); }
}
function gymStationFertig() {
  const i = LAUF.ue, p = S.plan;
  if (p && p.id === LAUF.plan && tagFuer(p, heuteIndex()) === LAUF.tagNr - 1) erledigtSetzen(p, LAUF.tagNr - 1, i, true);
  const bonus = spielStation(p, i);   // { plus, levelAuf } oder nichts; der Raum zeigt es an
  if (GYM && GYM.raum) GYM.raum.stationFertig(i, bonus);
  gefuehl('station');
}
/* Spielstand (spiel.js): Jede Zeile fängt Fehler ab, das Training läuft immer weiter. Zählen tut es, wenn der Plan zum laufenden Training gehört;
   nachholen an einem anderen Wochentag gibt also auch Punkte (nur die Haken oben gelten allein am Plantag). Datum und Trainingstag wie in erledigtKey. */
const spielPasst = (p) => !!p && p.id !== 'beispiel' && !!LAUF && p.id === LAUF.plan;   // Beispiel (24.11.2026): keine Punkte, keine Serie, nichts im echten Spielstand
const spielTag = () => ({ datum: datumHeute(), tag: LAUF.tagNr - 1 });
// Wie lange die Übung wirklich gelaufen ist: alle Sätze zusammen, von „los“ bis „Satz fertig“
const uebungSekunden = (u) => (u && u.log ? u.log.reduce((s, x) => s + Math.max(0, (x.e - x.s) / 1000), 0) : 0);
const uebungZaehlt = (u) => uebungSekunden(u) >= Spiel.PUNKTE.mindestSekunden;
function spielStation(p, i) {
  try {
    if (!spielPasst(p)) return undefined;
    const r = Spiel.stationGeschafft({ plan: p.id, ...spielTag(), station: i, wochenZiel: planTage(p), sekunden: uebungSekunden(LAUF.uebungen[i]) });
    return { plus: r.plus, levelAuf: r.levelAuf, zuKurz: !!r.zuKurz };
  } catch (e) { return undefined; }
}
function spielEinheit(p) {
  try {
    if (!spielPasst(p) || !LAUF.uebungen.some((u) => u.log.length && uebungZaehlt(u))) return '';   // ohne eine Übung, die wirklich gelaufen ist, war es keine Einheit
    const r = Spiel.einheitGeschafft({ plan: p.id, ...spielTag(), alleSaetze: LAUF.uebungen.every((u) => u.log.length >= u.saetze), wochenZiel: planTage(p) });
    if (r.levelAuf) setTimeout(() => Rang.aufstiegZeigen(h, r.levelAuf, lade3d), 900);
    return Spiel.einheitText(r);
  } catch (e) { return ''; }
}
function spielToast(text) {
  if (!text) return;
  toast(text);
  const el = document.querySelector('.toast');
  if (el) el.style.zIndex = '60';   // die Zusammenfassung (.tm, Ebene 30) deckt sonst den Hinweis zu (.toast liegt auf 9)
}
function gymZu(geschafft) {
  GYM = null; gymStationWeg(); document.body.style.overflow = '';
  if (!LAUF) { zeichne(); return; }
  if (geschafft) { const text = spielEinheit(S.plan); laufBeenden('fertig'); spielToast(text); return; }
  wach(false);
  if (!LAUF.uebungen.some((u) => u.log.length)) LAUF = null;   // noch kein Satz gemacht: dann ist auch kein Training offen
  laufSichern();
  if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); }
  zeichne();
}
function startKnopf(p, ti, text) {
  if (LAUF && LAUF.phase !== 'fertig') return h('button', { class: 'knopf haupt', type: 'button', onclick: () => { const ap = aktiverPlan(); TM.klein = false; if (!LAUF.gym) timerZeigen(); else if (ap && LAUF.plan === ap.id) raumStarten(ap, LAUF.tagNr - 1); else altesTraining(p, ti); }, text: text === 'Training fortsetzen' ? text : 'Training läuft · fortsetzen' });
  return h('button', { class: 'knopf haupt', type: 'button', onclick: () => laufStarten(p, ti), text: text || 'Training starten' });
}
// Eine Übung für den Trainingslauf. tg: was im Plan stand, wenn der Kunde getauscht hat (steht im Text an Devin)
function laufEintrag(p, roh) {
  const u = uebung(roh), pz = u.pause, z = u.tausch, fokus = p.fokus && z && !z.art && !istSek(u) ? p.fokus : '';
  const e = { id: u.id, name: anzeigeName(u), saetze: Math.max(1, +satzZahl(p, u) || 1), dosis: dosis(u), sek: istSek(u),
    rir: u.rir ? bereich(u.rir) : '', pauseMin: pz.length ? auf15(pz[0]) : 60, pauseMax: pz.length ? auf15(pz[pz.length - 1]) : 90,
    tipp: fokus || (u.d.t || [])[0] || '', vorsicht: (u.d.v || [])[0] || '', angepasst: angepasst(p, u), log: [] };
  if (z && z.art === 'tausch') e.tg = (UEBUNGEN[z.orig.i] || {}).n || z.orig.i;
  return e;
}
// Tausch mitten im Training: nur solange die Übung noch keinen Satz hat. Im 3D-Gym nicht, dort steht die Station schon
function laufSlot() {
  if (TM.gym || aktUe().log.length) return null;
  const p = aktiverPlan(), roh = p && p.id === LAUF.plan && (p.t[LAUF.tagNr - 1] || { u: [] }).u[LAUF.ue];
  return roh && roh.z ? uebung(roh) : null;
}
function laufTauschen(u, neuId) {
  tauschen(u.tausch, neuId);
  const p = aktiverPlan();
  LAUF.uebungen[LAUF.ue] = laufEintrag(p, p.t[LAUF.tagNr - 1].u[LAUF.ue]);
  LAUF.seit = Date.now(); TM.tausch = false; laufSichern(); toast('Getauscht: ' + UEBUNGEN[neuId].n); timerZeigen();
}
function laufStarten(p, ti, gym) {
  const jetzt = Date.now(), t = p.t[ti];
  LAUF = { v: 1, plan: p.id, kunde: p.n || '', tagNr: ti + 1, tagName: t.n, start: jetzt, ue: 0, satz: 0, phase: 'satz', seit: jetzt, pauseZiel: 0,
    uebungen: t.u.map((roh) => laufEintrag(p, roh)), bs: (p.bs || []).filter(Boolean).slice(0, 8) };   // bs: Plan mit Beschwerden → nach dem Training nach den Schmerzen fragen
  TM.frage = false; TM.klein = false;
  if (gym) { LAUF.gym = true; LAUF.phase = 'frei'; }
  laufSichern(); piep(1); wach(true); if (!gym) timerZeigen();
}
const aktUe = () => LAUF.uebungen[LAUF.ue];
const letzterSatz = () => LAUF.ue === LAUF.uebungen.length - 1 && LAUF.satz === aktUe().saetze - 1;
/* Satz speichern (Redesign 24.11.2026): Gewicht und Wiederholungen stehen schon während des Satzes im Feld (vorbelegt mit dem letzten Gewicht).
   Ein Tipp speichert genau einen Eintrag auf diesem Handy: Doppeltipp und ein zweiter Tipp auf den neuen Knopf an derselben Stelle zählen nicht.
   Geht das Speichern schief (Speicher voll oder gesperrt), bleibt alles stehen, die Werte bleiben im Feld, „Nochmal speichern“ versucht es erneut.
   „Synchronisiert“ steht nirgends: Die App schickt Sätze nicht von selbst weg, gespeichert heißt hier „auf diesem Handy“. */
const sperre = (ms) => { TM.sperreBis = Date.now() + ms; };
const gesperrt = () => Date.now() < (TM.sperreBis || 0);
function satzFertig() {
  if (!LAUF || LAUF.phase !== 'satz' || TM.speichert || gesperrt()) return;
  TM.speichert = true; TM.tausch = false;
  const u = aktUe(), jetzt = Date.now(), vor = u.log[u.log.length - 1], ew = LAUF.entwurf || {};
  const eintrag = { s: LAUF.seit, e: jetzt, kg: ew.kg != null && ew.kg !== '' ? ew.kg : (vor ? vor.kg : ''), wdh: ew.wdh != null ? ew.wdh : '' };
  const vorher = { phase: LAUF.phase, seit: LAUF.seit, bonus: LAUF.bonus, uebungFertig: LAUF.uebungFertig, spruch: LAUF.spruch, pauseZiel: LAUF.pauseZiel };
  u.log.push(eintrag);
  if (letzterSatz() && !LAUF.gym) LAUF.phase = 'letzter';
  else {
    LAUF.phase = 'pause'; LAUF.pauseZiel = u.pauseMax;
    LAUF.uebungFertig = LAUF.satz === u.saetze - 1;
    if (LAUF.uebungFertig) LAUF.spruch = spruch(SPRUECHE_UEBUNG);
  }
  LAUF.seit = jetzt; LAUF.entwurf = null;
  LAUF.gespeichert = { ue: LAUF.ue, nr: u.log.length, name: u.name };
  if (!laufSichern()) {   // nichts verloren: zurück auf den Stand vor dem Tipp, Werte bleiben im Entwurf
    u.log.pop(); Object.assign(LAUF, vorher); LAUF.entwurf = ew; LAUF.gespeichert = null;
    TM.speichert = false; TM.fehler = 'Nicht gespeichert. Der Speicher auf diesem Handy ist voll oder gesperrt. Deine Werte sind noch da, tipp nochmal auf „Satz speichern“.';
    timerZeigen(); return;
  }
  TM.fehler = null; sperre(450);   // derselbe Finger tippt sonst gleich auf „Bereit · weiter“ an derselben Stelle
  ansagen('Satz ' + u.log.length + ' gespeichert');   // QA 25.11.2026 (Rolle 15): für Screenreader
  if (!LAUF.gym && u.log.length >= u.saetze) {   // im Gym meldet es die Station, sonst hier: Übung fertig, alle Sätze gemacht
    LAUF.bonus = spielStation(S.plan, LAUF.ue) || null;
    const auf = LAUF.bonus && LAUF.bonus.levelAuf;
    if (auf) setTimeout(() => Rang.aufstiegZeigen(h, auf, lade3d), 500);
  } else LAUF.bonus = null;
  laufSichern(); TM.speichert = false; timerZeigen();
  gefuehl(!LAUF.gym && u.log.length >= u.saetze ? 'station' : 'satz');
}
function naechsterSatz() {
  if (!LAUF || gesperrt()) return;
  const u = aktUe();
  if (LAUF.satz < u.saetze - 1) LAUF.satz++; else { LAUF.ue++; LAUF.satz = 0; }
  LAUF.phase = 'satz'; LAUF.seit = Date.now(); LAUF.uebungFertig = false; LAUF.gespeichert = null;
  laufSichern(); piep(2); timerZeigen();
}
// Nachträglich korrigieren (Pause): speichert bei jeder Eingabe, sagt ehrlich, ob es geklappt hat
function eintragen(feld, wert) {
  const u = aktUe(), s = u.log[u.log.length - 1];
  if (!s) return;
  s[feld] = String(wert).replace(',', '.').replace(/[^0-9.]/g, '');
  const ok = laufSichern(), el = document.getElementById('tm-korrektur');
  if (el) { el.textContent = ok ? 'Korrektur gespeichert.' : 'Nicht gespeichert. Der Speicher auf diesem Handy ist voll oder gesperrt.'; el.classList.toggle('fehler', !ok); }
}
// Werte für den laufenden Satz (vor dem Speichern): bleiben beim Neuladen erhalten
function entwurfSetzen(feld, wert) {
  LAUF.entwurf = Object.assign({}, LAUF.entwurf, { [feld]: String(wert).replace(',', '.').replace(/[^0-9.]/g, '') });
  laufSichern();
}
const zahlOderNull = (x) => x === '' || x == null || isNaN(+x) ? null : +x;
// Kompaktes Ergebnis: das, was Devin bekommt (gleiches Format wie die Trainer-Seite)
function ergebnis(status) {
  const ende = Date.now(), alle = [];
  LAUF.uebungen.forEach((u) => u.log.forEach((s) => alle.push(s)));
  const ue = LAUF.uebungen.filter((u) => u.log.length).map((u) => ({ n: u.name, sek: u.sek ? 1 : 0, tg: u.tg || undefined, z: u.log.map((s) => {
    const i = alle.indexOf(s), nach = alle[i + 1];
    const pz = nach ? nach.s - s.e : (s === alle[alle.length - 1] && LAUF.phase === 'satz' ? LAUF.seit - s.e : null);
    return [zahlOderNull(s.kg), zahlOderNull(s.wdh), Math.round((s.e - s.s) / 1000), pz != null ? Math.round(pz / 1000) : null];
  }) }));
  return { v: 1, k: LAUF.kunde, p: LAUF.plan, t: LAUF.tagNr, tn: LAUF.tagName, s: LAUF.start, e: ende, st: status, u: ue };
}
// Sätze aus dem Training als Bestleistung eintragen (nur Kniebeuge, Bankdrücken, Kreuzheben; Mindest-Wiederholungen aus dem Plan)
function spielBestleistung() {
  try {
    const p = S.plan;
    if (!spielPasst(p) || p.id === 'beispiel') return [];
    const zahl = (x) => zahlOderNull(typeof x === 'string' ? x.replace(',', '.').trim() : x);
    const saetze = LAUF.uebungen.flatMap((u) => u.log.map((s) => ({ id: u.id, kg: zahl(s.kg), wdh: zahl(s.wdh) })));
    return Bestleistung.ausTraining(saetze, p.m, datumHeute());
  } catch (e) { return []; }
}
function laufBeenden(status) {
  if (GYM) { const raum = GYM.raum; GYM = null; gymStationWeg(); if (raum) raum.schliessen(false, true); }
  const r = ergebnis(status);
  // Beispiel und echter Verlauf bleiben getrennt (24.11.2026): Ein Probetraining im Beispielplan landet nie in „Deine letzten Trainings“ oder der Statistik
  if (LAUF.plan !== 'beispiel') speicher.schreib(VERLAUF_KEY, [r].concat(verlaufListe().filter((x) => x.s !== r.s)).slice(0, 40));
  if (LAUF.plan !== 'beispiel') statistikMerken([r]);   // Dein Fortschritt: bleibt auch nach den 40 im Verlauf für Monat und Jahr
  // Heute gemachte Übungen abhaken (wenn heute dieser Trainingstag ist)
  const p = S.plan;
  if (p && p.id === LAUF.plan && tagFuer(p, heuteIndex()) === LAUF.tagNr - 1) {
    const ti = LAUF.tagNr - 1, fertig = erledigtLaden(p, ti);
    LAUF.uebungen.forEach((u, i) => { if (u.log.length && fertig.indexOf(i) < 0) fertig.push(i); });
    speicher.schreib(erledigtKey(p, ti), fertig);
  }
  LAUF.neuePR = spielBestleistung();
  LAUF.phase = 'fertig'; LAUF.ergebnis = r; TM.frage = false;
  laufSichern(); wach(false); timerZeigen();
  if (status === 'fertig') { gefuehl('geschafft'); if (LAUF.neuePR && LAUF.neuePR.length) gefuehl('bestleistung'); }
}
// Training ausblenden (24.11.2026): Die Einheit läuft weiter und ist gespeichert, „Heute“ zeigt sie zuerst mit „Training fortsetzen“
function trainingAusblenden() {
  TM.klein = true;
  if (TM.buehne) { TM.buehne.weg(); TM.buehne = null; TM.gezeigt = null; }
  if (TM.el) { TM.el.remove(); TM.el = null; }
  document.body.style.overflow = '';
  if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); }
  S.ansicht = 'heute'; zeichne(); window.scrollTo(0, 0);
  const t = document.querySelector('.rg-offen h2'); if (t) { t.setAttribute('tabindex', '-1'); try { t.focus({ preventScroll: true }); } catch (e) { /* nichts */ } }
}
function laufSchliessen() {
  LAUF = null; laufSichern(); wach(false);
  if (TM.buehne) { TM.buehne.weg(); TM.buehne = null; TM.gezeigt = null; }
  if (TM.el) { TM.el.remove(); TM.el = null; }
  document.body.style.overflow = '';
  if (history.state && history.state.training) { ZURUECK_LEISE = true; history.back(); }
  zeichne();
}
const saetzeGesamt = (r) => r.u.reduce((s, u) => s + u.z.length, 0);
const laufDauer = (r) => Math.round((r.e - r.s) / 1000);
function zuB64(b) { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function laufAlsText(r) {
  const z = ['DK Training · ' + (r.k || 'Kunde') + ' · T' + r.t + ' ' + r.tn, datumZeit(r.s),
    'Dauer ' + mmss(laufDauer(r)) + ' · ' + saetzeGesamt(r) + ' Sätze' + (r.st === 'abgebrochen' ? ' · vorzeitig beendet' : ''), ''];
  if (schmerzOk(r.sz)) z.splice(3, 0, 'Schmerz heute: ' + r.sz + ' von ' + SCHMERZ.max);
  r.u.forEach((u) => {
    z.push(u.n + (u.tg ? ' (vom Kunden getauscht, im Plan stand ' + u.tg + ')' : ''));
    u.z.forEach((s, i) => z.push('  ' + (i + 1) + '. ' + (s[0] != null ? s[0] + ' kg' : '–') + ' × ' + (s[1] != null ? s[1] + (u.sek ? ' s' : '') : '–') +
      ' · Satz ' + mmss(s[2]) + (s[3] != null ? ' · Pause ' + mmss(s[3]) : '')));
  });
  z.push('', 'Code für ' + KONTAKT.marke + ' (nicht ändern):', 'DK-Lauf:' + zuB64(new TextEncoder().encode(JSON.stringify(r))) + ':Ende');
  return z.join('\n');
}
function laufTabelle(r) {
  const zeilen = [];
  r.u.forEach((u) => {
    zeilen.push(h('tr', { class: 'ue' }, h('td', { colspan: '4', text: u.n }), h('td', { text: mmss(u.z.reduce((s, x) => s + x[2], 0)) })));
    u.z.forEach((s, i) => zeilen.push(h('tr', null, h('td', { text: String(i + 1) }), h('td', { text: s[0] != null ? String(s[0]).replace('.', ',') : '–' }),
      h('td', { text: s[1] != null ? s[1] + (u.sek ? ' s' : '') : '–' }), h('td', { text: mmss(s[2]) }), h('td', { text: s[3] != null ? mmss(s[3]) : '–' }))));
  });
  return h('div', { class: 'lauf-tab-wrap' }, h('table', { class: 'lauf-tab' },
    h('thead', null, h('tr', null, ['Satz', 'kg', 'Wdh', 'Satz-Zeit', 'Pause'].map((x) => h('th', { text: x })))), h('tbody', null, zeilen)));
}
const verlaufListe = () => speicher.lies(VERLAUF_KEY, []);
function kopieren(text, knopf) {
  const ok = () => { knopf.textContent = 'Kopiert, jetzt an Devin schicken'; };
  try { navigator.clipboard.writeText(text).then(ok, () => { knopf.textContent = 'Kopieren ging nicht'; }); } catch (e) { knopf.textContent = 'Kopieren ging nicht'; }
}
function verlaufBlock() {
  const v = verlaufListe();
  if (!v.length) return null;
  return h('section', { class: 'block' }, h('h2', { text: 'Deine letzten Trainings' }),
    h('p', { class: 'leise klein', text: 'Gespeichert auf diesem Handy. Antippen zum Ansehen und nochmal an Devin schicken.' }),
    h('div', { class: 'laeufe' }, v.slice(0, 8).map((r) => h('button', { class: 'lauf-zeile', type: 'button', onclick: () => laufBlatt(r) },
      h('b', { text: 'Training ' + r.t + ' · ' + r.tn }), h('span', { class: 'zahl', text: mmss(laufDauer(r)) }),
      h('span', { class: 'leise klein', text: datumZeit(r.s) + ' · ' + saetzeGesamt(r) + ' Sätze' + (r.st === 'abgebrochen' ? ' · vorzeitig beendet' : '') })))));
}
/* ---------- Dein Fortschritt (17.11.2026): Statistik aus den eigenen Trainings ----------
   Rechnung und Speicher stehen in statistik.js (reine Funktion, geprüft in app/test.js, Abschnitt 27). Hier nur Anzeige, Texte nur als textContent.
   Auf „Heute“ eine kleine Karte mit dieser Woche; „Alles ansehen“ öffnet die Seite mit Tag, Woche, Monat und Jahr.
   Seit 21.11.2026 eigene Seite „Statistik“ in der Leiste: wie lange schon dabei, Leucht-Graph (statistik-grafik.js), „Gesamt“ seit dem ersten Training,
   je Übung antippen = Verlauf des besten Satzes. Dieselbe Rechnung und derselbe Graph stehen in der Trainer-Seite beim Kunden.
   Weniger als davor bleibt neutral (kein Rot): Entlastung und Pausen gehören zum Training. Kein Vergleich mit anderen, keine Punkte. */
function statistikMerken(liste) {
  try { Statistik.aufnehmen((Array.isArray(liste) ? liste : []).filter((r) => r && r.k !== 'Beispiel')); } catch (e) { /* die App läuft immer weiter */ }
}
const FS_NAMEN = { tag: 'Tag', woche: 'Woche', monat: 'Monat', jahr: 'Jahr', gesamt: 'Gesamt' };
function fsAend(a) {
  if (!a) return null;
  const p = Statistik.prozentText(a);
  return h('span', { class: 'fs-aend ' + a.richtung, 'aria-label': a.neu ? 'neu dazu' : a.richtung === 'hoch' ? 'mehr als davor, ' + p : a.richtung === 'runter' ? 'weniger als davor, ' + p : 'gleich wie davor',
    text: Statistik.PFEIL[a.richtung] + ' ' + p });
}
// Kachel: Name, Zahl (Einheit klein dahinter, darf umbrechen), Veränderung und der Wert davor
function fsKachel(name, wert, einheit, aend, text) {
  const t = text || Statistik.zahlText;
  return h('div', { class: 'fs-kachel' }, h('small', { text: name }),
    h('b', null, t(wert), einheit ? h('span', { class: 'fs-einheit', text: ' ' + einheit }) : null),
    fsAend(aend), aend ? h('small', { class: 'fs-vorher', text: 'davor ' + t(aend.vorher) + (einheit ? ' ' + einheit : '') }) : null);
}
function fortschrittKarte(p) {
  if (!p || p.id === 'beispiel') return null;
  let r;
  try { r = Statistik.berechne(Statistik.trainings(), { ansicht: 'woche', jetzt: Date.now() }); } catch (e) { return null; }
  const oeffnen = () => { S.fsAnsicht = 'woche'; S.fsVersatz = 0; S.fsAlle = false; geh('statistik'); };
  const kopfZeile = h('div', { class: 'woche-kopf' }, h('h2', { text: 'Dein Fortschritt' }), h('button', { class: 'knopf text klein', type: 'button', onclick: oeffnen, text: 'Alles ansehen' }));
  if (r.leer) return h('section', { class: 'block fs-karte' }, kopfZeile,
    h('p', { class: 'leise klein', text: 'Nach deinem ersten Training siehst du hier, wie du dich steigerst: Volumen, Bestwerte und der Vergleich mit der Woche davor.' }));
  const s = r.summe, a = r.aenderung || {}, mitKg = s.volumen > 0 || (r.vorher && r.vorher.volumen > 0);
  return h('section', { class: 'block fs-karte' }, kopfZeile,
    h('div', { class: 'fs-mini' },
      h('div', { class: 'fs-kachel' }, h('small', { text: 'Trainings' }), h('b', { text: String(s.trainings) }), fsAend(a.trainings)),
      mitKg ? h('div', { class: 'fs-kachel' }, h('small', { text: 'Volumen' }), h('b', null, Statistik.zahlText(s.volumen), h('span', { class: 'fs-einheit', text: ' kg' })), fsAend(a.volumen))
        : h('div', { class: 'fs-kachel' }, h('small', { text: 'Wiederholungen' }), h('b', { text: Statistik.zahlText(s.wdh) }), fsAend(a.wdh)),
      h('div', { class: 'fs-kachel' }, h('small', { text: 'Bestwerte' }), h('b', { text: String(r.neueBestwerte) }), h('span', { class: 'fs-aend gleich', text: r.neueBestwerte === 1 ? 'neuer' : 'neue' }))),
    h('p', { class: 'leise klein', text: 'Diese Woche, ' + r.vergleich + '.' }));
}
function fsGraph(r, animieren) {
  if (!r.balken.length) return null;
  const was = r.balkenWas, istVol = was === 'volumen', name = istVol ? 'Volumen' : 'Sätze';
  const menge = (v) => Statistik.zahlText(v) + (istVol ? ' kg' : v === 1 ? ' Satz' : ' Sätze');
  const daten = r.balken.map((b) => ({ label: b.label, name: b.name, wert: b[was], zeigen: b.zeigen, markiert: b.heute, spaeter: b.spaeter,
    text: b[was] > 0 ? menge(b[was]) + (b.trainings > 1 ? ' · ' + b.trainings + ' Trainings' : '') : b.trainings ? '1 Training ohne Werte' : 'kein Training' }));
  const spitze = Math.max(0, ...r.balken.map((b) => b[was]));
  return h('div', { class: 'fs-diagramm' },
    h('div', { class: 'lg-kopf' }, h('small', { text: name + ' je ' + r.balkenJe }), spitze ? h('b', { text: 'Spitze ' + menge(spitze) }) : null),
    Grafik.leuchtGraph(daten, { titel: name + ' je ' + r.balkenJe + ' · ' + r.titel, wertText: menge, achsenText: fsKurz, animieren,
      leerText: r.ansicht === 'tag' ? 'Noch kein Training mit Werten' : 'In diesem Zeitraum kein Training' }));
}
// Zahlen am Rand des Graphen kurz: 2.500, 12,5k
const fsKurz = (v) => (v >= 10000 ? String(Math.round(v / 100) / 10).replace('.', ',') + 'k' : Statistik.zahlText(v));
const stWert = (name, wert, unter) => h('div', { class: 'st-wert' }, h('small', { text: name }), h('b', { text: wert }), unter ? h('small', { text: unter }) : null);
function fsUebung(u, r) {
  const marke = u.rekord ? h('span', { class: 'fs-chip rekord', text: 'Neuer Bestwert' }) : u.erstesMal ? h('span', { class: 'fs-chip', text: 'Zum ersten Mal' }) : null;
  const menge = [u.saetze + (u.saetze === 1 ? ' Satz' : ' Sätze'), u.sek ? (u.halten ? Statistik.zahlText(u.halten) + ' s' : '') : (u.wdh ? Statistik.zahlText(u.wdh) + ' Wdh' : ''),
    u.volumen ? Statistik.zahlText(u.volumen) + ' kg' : '', r.ansicht !== 'tag' && u.mal > 1 ? u.mal + '× trainiert' : ''].filter(Boolean).join(' · ');
  return h('button', { class: 'fs-ueb st-ueb-knopf', type: 'button', onclick: () => fsVerlaufBlatt(u.name), 'aria-label': u.name + ', Verlauf ansehen' },
    h('div', { class: 'fs-ueb-kopf' }, h('b', { text: u.name }), marke),
    h('div', { class: 'fs-ueb-wert' }, h('span', null, h('small', { text: 'Bester Satz ' }), h('b', { text: Statistik.satzText(u.bester, u.sek) })),
      u.richtung ? h('span', { class: 'fs-aend ' + u.richtung, text: Statistik.PFEIL[u.richtung] + ' ' + u.diff }) : null),
    h('small', { class: 'leise', text: menge }),
    h('span', { class: 'st-mehr', text: 'Verlauf ansehen ›' }));
}
// Eine Übung über die Zeit: je Training der beste Satz als Leucht-Graph, dazu erstes Mal, Bestwert und Steigerung
function fsVerlaufBlatt(name) {
  let v;
  try { v = Statistik.uebungVerlauf(Statistik.trainings(), name, { jetzt: Date.now() }); } catch (e) { return; }
  const einheit = (x) => (v.einheit === 'kg' ? Statistik.kgText(x) : Statistik.zahlText(x) + (v.einheit === 's' ? ' s' : ' Wdh'));
  const daten = v.punkte.map((p, i) => ({ label: p.label, name: p.name, wert: p.wert, text: p.text, zeigen: true, markiert: i === v.punkte.length - 1 }));
  const steigerung = v.richtung === 'hoch' ? Statistik.PFEIL.hoch + ' ' + v.steigerung : v.mal > 1 ? 'gleich' : '–';
  oeffneBlatt(name, v.einheit === 'kg' ? 'Bestes Gewicht je Training' : v.einheit === 's' ? 'Längste Zeit je Training' : 'Meiste Wiederholungen je Training', [
    h('div', { class: 'st-verlauf' },
      Grafik.leuchtGraph(daten, { titel: 'Verlauf ' + name, wertText: einheit, abNull: false, achsenText: (x) => (v.einheit === 'kg' ? Statistik.kgText(x).replace(' kg', '') : fsKurz(x)), animieren: true,
        leerText: 'Noch kein Satz mit Werten' }),
      h('div', { class: 'st-verlauf-werte' },
        stWert('Erstes Mal', v.erster ? v.erster.text : '–', v.erster ? v.erster.label : ''),
        stWert('Bestwert', v.bester ? v.bester.text : '–', v.bester ? v.bester.label : ''),
        stWert('Steigerung', steigerung, v.prozent > 0 ? '+' + v.prozent + ' %' : '')),
      h('p', { class: 'leise klein', text: v.mal === 1 ? 'Einmal mit Werten trainiert. Ab dem zweiten Mal siehst du hier deine Steigerung.'
        : v.mal + '× mit Werten trainiert. Je Training zählt der beste Satz: das meiste Gewicht, bei gleichem Gewicht die meisten Wiederholungen.' }))]);
}
// Wie lange schon dabei: vom ersten Training bis heute, dazu alles zusammengezählt
function fsSeit(liste) {
  let z;
  try { z = Statistik.seit(liste, { jetzt: Date.now(), beginn: Statistik.beginn() }); } catch (e) { return null; }
  if (!z.beginn) return null;
  const zahl = Number.isInteger(z.dauer.zahl) ? String(z.dauer.zahl) : String(z.dauer.zahl).replace('.', ',');
  return h('section', { class: 'block' }, h('div', { class: 'st-seit' },
    h('div', { class: 'st-seit-zahl', text: zahl }),
    h('div', { class: 'st-seit-text' }, h('b', { text: z.dauer.einheit + ' dabei' }), h('small', { text: 'Erstes Training am ' + z.datum })),
    h('div', { class: 'st-seit-werte' },
      stWert('Trainings', Statistik.zahlText(z.trainings)),
      z.volumen ? stWert('kg bewegt', z.volumen >= 100000 ? fsKurz(z.volumen) : Statistik.zahlText(z.volumen)) : stWert('Sätze', Statistik.zahlText(z.saetze)),
      stWert('trainiert', Statistik.dauerText(z.sekunden)))));
}
function ansichtStatistik() {
  const ansicht = Statistik.ANSICHTEN.indexOf(S.fsAnsicht) >= 0 ? S.fsAnsicht : 'woche';
  let liste = [], r;
  try { liste = Statistik.trainings(); r = Statistik.berechne(liste, { ansicht, versatz: S.fsVersatz || 0, jetzt: Date.now() }); } catch (e) { r = Statistik.berechne([], { ansicht }); }
  S.fsVersatz = r.versatz;
  // Der Graph zeichnet sich nur, wenn sich der Zeitraum wirklich ändert (nicht bei jedem Neuzeichnen, z. B. Farbwelt oder Haken)
  const schluessel = ansicht + '|' + r.versatz, animieren = S.fsGezeichnet !== schluessel;
  S.fsGezeichnet = schluessel;
  const neu = (wahl) => { Object.assign(S, wahl); zeichne(); };
  const teile = [kopf('Aus deinen Trainings · nur auf diesem Handy', 'Statistik'), fsSeit(liste),
    h('div', { class: 'fs-wahl st-wahl', role: 'group', 'aria-label': 'Zeitraum wählen' }, Statistik.ANSICHTEN.map((id) => h('button', { type: 'button', class: 'fs-wahl-knopf',
      'aria-pressed': id === ansicht ? 'true' : 'false', onclick: () => neu({ fsAnsicht: id, fsVersatz: 0, fsAlle: false }), text: FS_NAMEN[id] })))];
  if (r.leer) {
    teile.push(h('section', { class: 'block' }, h('h2', { text: 'Noch kein Training gespeichert' }),
      h('p', { class: 'leise klein', text: 'Starte ein Training und trag Gewicht und Wiederholungen ein. Danach siehst du hier jeden Tag, wie du dich steigerst.' })));
    return teile;
  }
  const s = r.summe, a = r.aenderung || {}, mitKg = s.volumen > 0 || (r.vorher && r.vorher.volumen > 0), gesamt = ansicht === 'gesamt';
  teile.push(h('section', { class: 'block fs-zeitraum' },
    h('div', { class: 'fs-zeit' + (gesamt ? ' ohne-pfeile' : '') },
      gesamt ? null : h('button', { class: 'fs-pfeil', type: 'button', 'aria-label': 'Früherer Zeitraum', disabled: !r.frueher, onclick: () => neu({ fsVersatz: r.versatz - 1, fsAlle: false }), text: '‹' }),
      h('div', { class: 'fs-zeit-text', role: 'status' }, h('b', { text: r.titel }),
        r.unter || (r.laeuft && !gesamt) ? h('small', { text: [r.unter, r.laeuft && !gesamt ? 'läuft noch' : ''].filter(Boolean).join(' · ') }) : null),
      gesamt ? null : h('button', { class: 'fs-pfeil', type: 'button', 'aria-label': 'Späterer Zeitraum', disabled: !r.spaeter, onclick: () => neu({ fsVersatz: r.versatz + 1, fsAlle: false }), text: '›' })),
    fsGraph(r, animieren),
    s.trainings ? h('div', { class: 'fs-zahlen' },
      mitKg ? fsKachel('Volumen', s.volumen, 'kg', a.volumen) : fsKachel('Wiederholungen', s.wdh, '', a.wdh),
      fsKachel('Trainings', s.trainings, '', a.trainings),
      fsKachel('Sätze', s.saetze, '', a.saetze),
      mitKg ? fsKachel('Wiederholungen', s.wdh, '', a.wdh) : fsKachel('Trainingszeit', s.sekunden, '', a.sekunden, Statistik.dauerText))
      : h('p', { class: 'leise', text: 'In diesem Zeitraum hast du nicht trainiert.' }),
    r.vergleich ? h('p', { class: 'leise klein', text: r.vergleich.charAt(0).toUpperCase() + r.vergleich.slice(1) + (r.vorher && !r.vorher.trainings ? ' (da war kein Training).' : '.') }) : null,
    gesamt && r.verbessert ? h('p', { class: 'leise klein', text: 'Seit deinem ersten Training hast du dich in ' + (r.verbessert === 1 ? 'einer Übung' : r.verbessert + ' Übungen') + ' gesteigert.' }) : null,
    s.trainings && a.volumen && a.volumen.richtung === 'runter' && mitKg ? h('p', { class: 'klein fs-hinweis', text: 'Weniger als davor ist in Ordnung: Entlastungswochen, Pausen und Technik-Tage gehören zum Training.' }) : null,
    s.ohneWerte ? h('p', { class: 'klein fs-hinweis', text: s.ohneWerte + (s.ohneWerte === 1 ? ' Satz hat' : ' Sätze haben') + ' keine Wiederholungen. Trag sie im Training ein, dann rechnet die Statistik genauer.' }) : null));
  if (r.uebungen.length) {
    const alle = S.fsAlle || r.uebungen.length <= 8;
    teile.push(h('section', { class: 'block' }, h('h2', { text: 'Deine Übungen' }),
      h('p', { class: 'leise klein', text: 'Bester Satz ' + r.uebungenVergleich + '. Antippen zeigt den Verlauf.' }),
      h('div', { class: 'fs-liste' }, (alle ? r.uebungen : r.uebungen.slice(0, 6)).map((u) => fsUebung(u, r))),
      alle ? null : h('button', { class: 'knopf klein', type: 'button', onclick: () => neu({ fsAlle: true }), text: 'Alle ' + r.uebungen.length + ' Übungen zeigen' })));
  }
  teile.push(h('section', { class: 'block fs-info' }, h('h2', { text: 'So rechnet die App' }),
    h('ul', { class: 'klein' },
      h('li', { text: 'Volumen = Gewicht × Wiederholungen, zusammengezählt über alle Sätze mit Gewicht.' }),
      h('li', { text: 'Bester Satz = das meiste Gewicht, bei gleichem Gewicht die meisten Wiederholungen. Ohne Gewicht zählen die Wiederholungen, bei Übungen auf Zeit die Sekunden.' }),
      h('li', { text: 'Läuft der Zeitraum noch, vergleicht die App mit genauso vielen Tagen davor. So ist der Vergleich fair.' }),
      h('li', { text: '„Gesamt“ zählt alles seit deinem ersten Training und vergleicht jede Übung mit dem ersten Mal.' }),
      h('li', { text: 'Gezählt wird, was du im Training einträgst. Die Statistik bleibt auf diesem Handy. Schickst du Devin dein Training, sieht er sie auch.' }))));
  return teile;
}
// Training per E-Mail an Devin (06.11.2026): Die Mail-App öffnet sich fertig ausgefüllt, der Kunde tippt nur noch auf Senden. WhatsApp bleibt als zweiter Weg.
// 23.11.2026 (Devin: „wenn die mit dem Workout fertig sind … sie drücken nur drauf und das wird direkt automatisiert gesendet“): Mit Kunden-Eingang (kontakt.json → eingang_skript)
// geht es mit einem Tipp direkt in Devins Gmail. Ohne Skript, offline oder wenn es nicht klappt: die Mail-App wie bisher.
// Devins Trainer-Seite findet die Zeile DK-Lauf in seinem Postfach und trägt das Training beim passenden Kunden ein (seit 23.11.2026 zuerst über die Kunden-Nummer p im Training).
const LAUF_GESENDET_KEY = 'dk_lauf_gesendet';   // Startzeiten der Trainings, die direkt bei Devin angekommen sind (nur dieses Handy)
const laufGesendet = (r) => (speicher.lies(LAUF_GESENDET_KEY, []) || []).indexOf(r.s) >= 0;
function laufBetreff(r) { return 'Training für ' + KONTAKT.marke + ': ' + (String(r.k || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) || 'Kunde') + ', ' + new Date(r.s).toLocaleDateString('de-DE'); }
function laufMailLink(r) {
  return 'mailto:' + KONTAKT.mail + '?subject=' + encodeURIComponent(laufBetreff(r)) + '&body=' + encodeURIComponent(laufAlsText(r).replace(/\n/g, '\r\n'));
}
function laufSendeKnopf(r, klasse) {
  if (!KONTAKT.eingang) return h('a', { class: klasse, href: laufMailLink(r), text: 'Per E-Mail an Devin' });
  const knopf = h('button', { class: klasse, type: 'button', text: 'An Devin senden' });
  const gesendet = () => { knopf.dataset.gesendet = '1'; knopf.textContent = 'An Devin gesendet ✓'; };
  knopf.addEventListener('click', async () => {
    if (knopf.dataset.gesendet) { toast('Schon gesendet. Devin hat dein Training.'); return; }
    if (knopf.dataset.sendet) return;   // zweiter Tipp, während es noch sendet
    knopf.dataset.sendet = '1'; knopf.textContent = 'Sende …';
    const ok = (await eingangSenden({ art: 'training', betreff: laufBetreff(r), text: laufAlsText(r) })).ok;
    delete knopf.dataset.sendet;
    if (ok) { speicher.schreib(LAUF_GESENDET_KEY, (speicher.lies(LAUF_GESENDET_KEY, []) || []).filter((s) => s !== r.s).concat([r.s]).slice(-60)); gesendet(); toast('Gesendet. Devin hat dein Training.'); return; }
    knopf.textContent = 'An Devin senden';
    location.href = laufMailLink(r); toast('Direkt ging gerade nicht. Deine Mail-App ist offen, tippe dort auf Senden.');
  });
  if (laufGesendet(r)) gesendet();
  return knopf;
}
function laufBlatt(r) {
  const knopf = h('button', { class: 'knopf', type: 'button', onclick: () => kopieren(laufAlsText(r), knopf), text: 'Text für WhatsApp kopieren' });
  oeffneBlatt('Training ' + r.t + ' · ' + r.tn, datumZeit(r.s), [h('div', { class: 'blatt-werte' }, h('span', { class: 'chip', text: 'Dauer ' + mmss(laufDauer(r)) }),
    h('span', { class: 'chip', text: saetzeGesamt(r) + ' Sätze' }), r.st === 'abgebrochen' ? h('span', { class: 'chip', text: 'vorzeitig beendet' }) : null,
    schmerzOk(r.sz) ? h('span', { class: 'chip', text: 'Schmerz ' + r.sz + '/' + SCHMERZ.max }) : null), laufTabelle(r), laufSendeKnopf(r, 'knopf haupt'), knopf]);
}
// Letztes Mal: aus den gespeicherten Trainings, sonst aus der alten Satz-Liste (App bis 28.10.)
function letztesMal(u, satz) {
  for (const r of verlaufListe()) {
    const alt = r.u.find((x) => x.n === u.name);
    if (alt && alt.z.length) return alt.z[Math.min(satz, alt.z.length - 1)];
  }
  const log = speicher.lies('dk_log', {});
  for (const d of Object.keys(log).sort().reverse()) { const v = log[d].kg && log[d].kg[u.id]; if (v) return [+v, null]; }
  return null;
}

const SPRUECHE_UEBUNG = [
  'Abgehakt. Die nächste wartet schon.', 'Sauber. Genau so wächst was.', 'Das war ehrliche Arbeit.', 'Stein auf Stein. Genau so.', 'Nicht geredet, gemacht.',
  'Technik vor Ego. Hast du gut gemacht.', 'Jeder Satz zählt. Der hier auch.', 'Durchgezogen. Respekt.', 'So sieht Dranbleiben aus.',
  'Die Übung ist erledigt. Du noch lange nicht.', 'Kurz durchatmen. Dann weiter.', 'Saubere Wiederholungen schlagen schwere Ausreden.',
  'Stark. Genau dafür bist du heute gekommen.', 'Ein Baustein mehr. Weiter bauen.', 'Fokus gehalten. Weiter so.'
];
const SPRUECHE_ENDE = [
  'Training erledigt. Der schwerste Teil war, anzufangen.', 'Heute hast du dir selbst was bewiesen.', 'Fertig. Jetzt essen, schlafen, wiederkommen.',
  'Das war deins. Das nimmt dir keiner mehr.', 'Wieder ein Tag, an dem du nicht gekniffen hast.', 'Ehrlich trainiert, Schritt für Schritt. So geht Natural.',
  'Ab unter die Dusche. Hast du dir verdient.'
];
const SPRUCH_KURZ = 'Heute war es kürzer. Zählt trotzdem: Du warst da.';
function spruch(liste) {
  LAUF.gesagt = LAUF.gesagt || [];
  let frei = liste.filter((s) => LAUF.gesagt.indexOf(s) < 0);
  if (!frei.length) { LAUF.gesagt = []; frei = liste; }
  const s = frei[Math.floor(Math.random() * frei.length)];
  LAUF.gesagt.push(s);
  return s;
}
const HAKEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const RING_U = 2 * Math.PI * 54;
function ring(id, inhalt, klasse) {
  const w = h('div', { class: 'tm-ring ' + (klasse || '') });
  w.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="tm-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--verlauf-a)"/><stop offset="1" style="stop-color:var(--verlauf-b)"/></linearGradient></defs>' +
    '<circle cx="60" cy="60" r="54" class="tm-ring-bahn"/><circle cx="60" cy="60" r="54" class="tm-ring-fort" id="' + id + '" stroke-dasharray="' + RING_U + '" stroke-dashoffset="' + RING_U + '"/></svg>';
  w.append(h('div', { class: 'tm-ring-mitte' }, inhalt));
  return w;
}
function satzPunkte(u, aktiv) {
  const p = [];
  for (let i = 0; i < u.saetze; i++) p.push(h('i', { class: i < u.log.length ? 'an' : (i === aktiv ? 'jetzt' : null) }));
  return h('div', { class: 'tm-punkte', 'aria-hidden': 'true' }, p);
}
function besterSatz(u) {
  let b = null;
  u.log.forEach((s) => {
    const kg = zahlOderNull(s.kg), w = zahlOderNull(s.wdh);
    if (kg == null && w == null) return;
    if (!b || (kg || 0) > (b.kg || 0) || ((kg || 0) === (b.kg || 0) && (w || 0) > (b.w || 0))) b = { kg, w };
  });
  return b;
}
function timerZeigen() {
  if (!LAUF) return;
  if (!TM.el) {
    TM.el = h('div', { class: 'tm', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Training', tabindex: '-1' }); (TM.gym || document.body).append(TM.el);   // tabindex: Fokus in den Dialog (QA 25.11.2026)
    if (!(history.state && history.state.training)) history.pushState({ training: 1 }, '');
  }
  document.body.style.overflow = 'hidden';
  const el = TM.el, fokusRein = !document.activeElement || document.activeElement === document.body || !document.activeElement.closest('.tm') || el.contains(document.activeElement); el.textContent = '';
  el.append(h('div', { class: 'tm-in' }, LAUF.phase === 'fertig' ? timerFertig() : timerLaeuft()));
  const stelle = LAUF.phase + ':' + LAUF.ue + ':' + LAUF.satz;
  if (TM.stelle !== stelle) { TM.stelle = stelle; TM.frage = false; el.scrollTop = 0; el.classList.remove('still'); }   // Kunden-Test 22.11.2026: „Training jetzt beenden?“ blieb beim nächsten Satz offen
  timerTick();
  if (fokusRein && !el.contains(document.activeElement) && !TM.klein) el.focus({ preventScroll: true });   // QA 25.11.2026 (Rolle 14)
}
// Die Bühne bleibt über alle Sätze dieselbe (eine 3D-Ansicht), nur die Übung wechselt
function trainingsBuehne(u) {
  if (!TM.buehne) TM.buehne = buehne({ lade3d, fotoGross });
  const d = UEBUNGEN[u.id] || { n: u.name, m: [] };
  if (TM.gezeigt !== u.id) { TM.gezeigt = u.id; TM.buehne.zeige(d); }
  return TM.buehne.el;
}
function timerLaeuft() {
  const u = aktUe(), pause = LAUF.phase === 'pause', letzter = LAUF.phase === 'letzter';
  const gesamt = LAUF.uebungen.reduce((s, x) => s + x.saetze, 0);
  const erledigt = LAUF.uebungen.reduce((s, x) => s + x.log.length, 0);
  const fort = []; for (let i = 0; i < gesamt; i++) fort.push(h('i', { class: i < erledigt ? 'an' : (i === erledigt && !pause && !letzter ? 'jetzt' : null) }));
  const teile = [
    h('div', { class: 'tm-kopf' }, h('div', { class: 'marke', text: 'Training ' + LAUF.tagNr + ' · ' + LAUF.tagName }), h('div', { class: 'tm-gesamt' }, h('span', { id: 'tm-gesamt', text: mmss((Date.now() - LAUF.start) / 1000) })),
      TM.gym ? null : h('button', { class: 'knopf text klein tm-klein', type: 'button', 'aria-label': 'Training ausblenden. Es läuft weiter, Fortsetzen steht auf Heute.', onclick: trainingAusblenden, text: 'Ausblenden' })),
    h('div', { class: 'tm-fort', 'aria-label': erledigt + ' von ' + gesamt + ' Sätzen' }, fort)
  ];
  const feier = pause && LAUF.uebungFertig, gymFeier = !!TM.gym && feier;
  if (feier) {
    const b = besterSatz(u), haken = h('div', { class: 'tm-haken', html: HAKEN });
    teile.push(h('div', { class: 'tm-feier' }, haken,
      h('small', { text: 'Übung geschafft' }),
      h('p', { class: 'tm-spruch', text: LAUF.spruch || '' }),
      h('span', { class: 'tm-von', text: 'Devin' }),
      LAUF.bonus && LAUF.bonus.plus > 0 ? h('p', { class: 'tm-plus', text: '+' + LAUF.bonus.plus + ' Punkte' }) : null,
      uebungZaehlt(u) ? null : h('p', { class: 'klein tm-mini', text: 'Unter ' + Spiel.PUNKTE.mindestSekunden + ' Sekunden: Diese Übung zählt nicht für deine Punkte.' }),
      h('p', { class: 'tm-mini', text: u.name + ' · ' + u.log.length + ' Sätze' + (b ? ' · bester Satz ' + (b.kg != null ? String(b.kg).replace('.', ',') + ' kg' : '') + (b.w != null ? (b.kg != null ? ' × ' : '') + b.w + (u.sek ? ' s' : ' Wdh') : '') : '') })));
  } else {
    teile.push(h('div', { class: 'tm-titel' }, h('p', { class: 'leise klein', text: 'Übung ' + (LAUF.ue + 1) + ' von ' + LAUF.uebungen.length }),
      h('h1', { class: 'tm-name', text: u.name }), satzPunkte(u, pause || letzter ? -1 : LAUF.satz)));
    teile.push(h('div', { class: 'tm-werte' },
      h('div', null, h('small', { text: 'Satz' }), h('b', { text: Math.min(LAUF.satz + 1, u.saetze) + ' / ' + u.saetze })),
      h('div', null, h('small', { text: u.sek ? 'Halten' : 'Ziel' }), h('b', { text: u.dosis })),
      u.rir ? h('button', { type: 'button', class: 'tm-wert-knopf', 'aria-expanded': String(!!TM.rir), 'aria-controls': 'tm-rir', onclick: () => { TM.rir = !TM.rir; TM.el && TM.el.classList.add('still'); timerZeigen(); } },
        h('small', null, 'Reserve ', h('span', { class: 'rir-i', 'aria-hidden': 'true', text: '?' })), h('b', { text: u.rir + ' Wdh' }))
        : h('div', null, h('small', { text: 'Pause' }), h('b', { text: mmss(u.pauseMax) }))));
    if (u.rir && TM.rir) teile.push(h('p', { class: 'rir-satz klein', id: 'tm-rir', text: RIR_SATZ }));   // RIR beim Antippen in einem Satz (24.11.2026)
  }
  if (pause || letzter) {
    const s = u.log[u.log.length - 1];
    const kg = h('input', { class: 'eingabe', id: 'tm-kg', inputmode: 'decimal', autocomplete: 'off', placeholder: '–', value: s.kg, 'aria-label': 'Gewicht in kg', oninput: (e) => eintragen('kg', e.target.value) });
    const wdh = h('input', { class: 'eingabe', id: 'tm-wdh', inputmode: 'numeric', autocomplete: 'off', placeholder: '–', value: s.wdh, 'aria-label': u.sek ? 'Gehalten in Sekunden' : 'Wiederholungen', oninput: (e) => eintragen('wdh', e.target.value) });
    // Kunden-Test 22.11.2026: Das Eintragen lag unter dem großen Pause-Ring, auf dem Handy erst nach Scrollen sichtbar, und niemand wusste,
    // dass es sich von selbst speichert. Jetzt steht es direkt unter den Werten, mit dem Satz dazu.
    // Redesign 24.11.2026: zuerst die Bestätigung mit Häkchen („Satz 2 gespeichert“), darunter die Werte zum Korrigieren
    const g = LAUF.gespeichert && LAUF.gespeichert.ue === LAUF.ue ? LAUF.gespeichert : { nr: u.log.length, name: u.name };
    const werteText = [s.kg !== '' && s.kg != null ? String(s.kg).replace('.', ',') + ' kg' : '', s.wdh !== '' && s.wdh != null ? s.wdh + (u.sek ? ' s' : ' Wdh') : ''].filter(Boolean).join(' × ');
    const bestaetigung = h('div', { class: 'tm-gespeichert', role: 'status' }, h('span', { class: 'tm-gespeichert-haken', html: HAKEN }),
      h('span', null, h('b', { text: 'Satz ' + g.nr + ' gespeichert' }), h('small', { text: (werteText ? werteText + ' · ' : '') + 'auf diesem Handy' })));
    const eintrag = h('div', { class: 'tm-karte' }, bestaetigung, h('small', { class: 'tm-label', text: 'Satz ' + u.log.length + (feier || letzter ? ' · ' + u.name : '') + ' korrigieren' }),
      h('div', { class: 'tm-eingabe' }, h('label', null, kg, h('span', { text: 'kg' })), h('label', null, wdh, h('span', { text: u.sek ? 'Sekunden' : 'Wdh' }))),
      h('p', { class: 'leise klein tm-speichert', id: 'tm-korrektur', role: 'status', text: 'Änderungen speichern sich von selbst.' }));
    if (pause && !gymFeier) teile.push(eintrag, ring('tm-ring', [h('small', { text: 'Pause' }), h('div', { class: 'tm-zeit', id: 'tm-uhr', text: mmss(LAUF.pauseZiel) })], 'pause'));
    else if (!pause) teile.push(h('div', { class: 'tm-feier' }, h('div', { class: 'tm-haken', html: HAKEN }), h('small', { text: 'Letzter Satz geschafft' }), h('p', { class: 'tm-mini', text: 'Stimmen die Werte? Dann bist du durch.' })), eintrag);
    else teile.push(eintrag);
    if (gymFeier) teile.push(h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: gymStationFertig, text: 'Station geschafft' }));
    else if (pause) {
      const nu = LAUF.satz < u.saetze - 1 ? { u, s: LAUF.satz + 2 } : { u: LAUF.uebungen[LAUF.ue + 1], s: 1 };
      teile.push(h('div', { class: 'tm-zwei' },
          h('button', { class: 'knopf', type: 'button', onclick: () => { LAUF.pauseZiel = Math.max(0, LAUF.pauseZiel - 30); laufSichern(); timerTick(); }, text: '− 30 s' }),
          h('button', { class: 'knopf', type: 'button', onclick: () => { LAUF.pauseZiel += 30; laufSichern(); timerTick(); }, text: '+ 30 s' })),
        h('div', { class: 'tm-karte tm-naechste' + (nu.s === 1 ? ' neu' : '') },
          h('small', { class: 'tm-label', text: nu.s === 1 ? 'Als Nächstes' : 'Gleich' }),
          h('b', { text: nu.u.name }),
          h('span', { class: 'leise klein', text: nu.s === 1 ? nu.u.saetze + ' Sätze · ' + nu.u.dosis : 'Satz ' + nu.s + ' von ' + nu.u.saetze + ' · ' + nu.u.dosis })),
        h('p', { class: 'tm-tipp tm-mitte', text: 'Pause laut Plan ' + mmss(u.pauseMin) + (u.pauseMin !== u.pauseMax ? ' bis ' + mmss(u.pauseMax) : '') + '. Danach geht es von selbst weiter.' }),
        h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: naechsterSatz, text: 'Bereit · weiter' }));
    } else teile.push(h('button', { class: 'knopf haupt tm-gross', type: 'button', onclick: () => { if (gesperrt()) return; const text = spielEinheit(S.plan); laufBeenden('fertig'); spielToast(text); }, text: 'Training abschließen' }));
  } else {
    // Satz läuft: die Figur zeigt die Übung, darunter die Satz-Uhr; ohne Figur (eigene Übung) der Ring wie in der Trainer-Seite
    if (TM.gym) teile.push(h('div', { class: 'tm-satzuhr' }, h('small', { text: 'Satz ' + (LAUF.satz + 1) + ' läuft' }), h('b', { class: 'zahl', id: 'tm-uhr', text: '0:00' })));
    else if ((UEBUNGEN[u.id] || {}).a) teile.push(trainingsBuehne(u), h('div', { class: 'tm-satzuhr' }, h('small', { text: 'Satz ' + (LAUF.satz + 1) + ' läuft' }), h('b', { class: 'zahl', id: 'tm-uhr', text: '0:00' })));
    else teile.push(ring('tm-ring', [h('small', { text: 'Satz ' + (LAUF.satz + 1) }), h('div', { class: 'tm-zeit', id: 'tm-uhr', text: '0:00' })], 'satz'));
    const vor = letztesMal(u, LAUF.satz), info = [];
    if (vor) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Letztes Mal ' }), (vor[0] != null ? String(vor[0]).replace('.', ',') + ' kg' : '–') + ' × ' + (vor[1] != null ? vor[1] + (u.sek ? ' s' : '') : '–')));
    // Kunden-Test 23.11.2026: „Was heißt Reserve?“ und „Welches Gewicht soll ich nehmen?“ Beim ersten Satz einer Übung steht es jetzt hier.
    if (!vor && !u.sek && LAUF.satz === 0) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Erstes Mal ' }), 'Nimm so viel Gewicht, dass alle Wiederholungen sauber gehen. War es leicht, nimm nächstes Mal etwas mehr.'));
    if (u.rir && LAUF.satz === 0) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Reserve ' + u.rir + ' ' }), 'heißt: Hör auf, wenn noch ' + u.rir + ' Wiederholungen gehen würden.'));
    if (u.tipp) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Technik ' }), u.tipp));
    (u.angepasst || []).forEach((x) => info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Angepasst wegen ' + x.name + ' ' }), x.grund)));
    if (u.vorsicht) info.push(h('p', { class: 'tm-tipp' }, h('b', { text: 'Vorsicht ' }), u.vorsicht));
    // Satz speichern (24.11.2026): Gewicht und Wiederholungen direkt über dem Knopf, beides mit dem Daumen erreichbar, auch bei offener Tastatur (klebt unten)
    const ew = LAUF.entwurf || {}, vorKg = u.log.length ? u.log[u.log.length - 1].kg : (vor && vor[0] != null ? String(vor[0]) : '');
    const kgFeld = h('input', { class: 'eingabe zahl', id: 'tm-kg', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next', placeholder: '–', value: ew.kg != null ? ew.kg : (vorKg || ''), 'aria-label': 'Gewicht in kg',
      oninput: (e) => entwurfSetzen('kg', e.target.value), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const w = document.getElementById('tm-wdh'); if (w) w.focus(); } } });
    if (ew.kg == null && vorKg) entwurfSetzen('kg', vorKg);
    const wdhFeld = h('input', { class: 'eingabe zahl', id: 'tm-wdh', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', placeholder: u.dosis.replace(/ Wdh$/, ''), value: ew.wdh || '', 'aria-label': u.sek ? 'Gehalten in Sekunden' : 'Wiederholungen',
      oninput: (e) => entwurfSetzen('wdh', e.target.value), onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); satzFertig(); } } });
    const speichernKnopf = h('button', { class: 'knopf haupt tm-gross tm-speichern', type: 'button', onclick: satzFertig, text: TM.fehler ? 'Nochmal speichern' : 'Satz ' + (LAUF.satz + 1) + ' speichern' });
    teile.push(h('div', { class: 'tm-aktion' },
      h('div', { class: 'tm-eingabe' }, h('label', null, kgFeld, h('span', { text: 'kg' })), h('label', null, wdhFeld, h('span', { text: u.sek ? 'Sekunden' : 'Wdh' }))),
      TM.fehler ? h('p', { class: 'tm-fehler', role: 'alert', text: TM.fehler }) : h('p', { class: 'leise klein tm-speichert', text: 'Was du nicht weißt, lässt du leer.' }),
      speichernKnopf));
    const slot = laufSlot(), wahl = slot ? tauschOptionen(slot) : [];
    if (wahl.length && !TM.tausch) teile.push(h('button', { class: 'knopf', type: 'button', onclick: () => { TM.tausch = true; timerZeigen(); const x = TM.el && TM.el.querySelector('.tm-tausch'); if (x) x.scrollIntoView({ block: 'center' }); }, text: 'Gerät nicht da? Tauschen' }));
    if (wahl.length && TM.tausch) teile.push(h('div', { class: 'tm-karte tm-tausch' }, h('p', { text: 'Sollen wir ' + u.name + ' ändern? Das hier passt sicher zu deinem Plan.' }),
      h('div', { class: 'stapel' }, wahl.map((a) => h('button', { class: 'knopf', type: 'button', onclick: () => laufTauschen(slot, a.i), text: UEBUNGEN[a.i].n + (a.orig ? ' (wie im Plan)' : '') }))),
      h('button', { class: 'knopf text', type: 'button', onclick: () => { TM.tausch = false; timerZeigen(); }, text: 'Doch nicht' })));
    if (info.length) teile.push(h('div', { class: 'tm-karte' }, info));
  }
  if (TM.frage) teile.push(h('div', { class: 'tm-frage' }, h('p', { text: 'Training jetzt beenden? Die fertigen Sätze bleiben gespeichert.' }),
    h('div', { class: 'tm-zwei' }, h('button', { class: 'knopf', type: 'button', onclick: () => { TM.frage = false; timerZeigen(); }, text: 'Weitermachen' }),
      h('button', { class: 'knopf', type: 'button', style: 'border-color:var(--stopp);color:var(--stopp)', onclick: () => laufBeenden('abgebrochen'), text: 'Beenden' }))));
  else teile.push(h('button', { class: 'knopf text tm-ende', type: 'button', onclick: () => { TM.frage = true; timerZeigen(); const x = TM.el && TM.el.querySelector('.tm-frage'); if (x) x.scrollIntoView({ block: 'center' }); }, text: 'Training vorzeitig beenden' }));
  return teile;
}
function timerFertig() {
  const r = LAUF.ergebnis, text = laufAlsText(r);
  if (!LAUF.endSpruch) { LAUF.endSpruch = r.st === 'abgebrochen' ? SPRUCH_KURZ : spruch(SPRUECHE_ENDE); laufSichern(); }
  const feld = h('textarea', { class: 'eingabe', readonly: true, 'aria-label': 'Text für Devin', style: 'min-height:110px;font-family:var(--f-zahl);font-size:12px', text });
  const knopf = h('button', { class: 'knopf tm-gross', type: 'button', onclick: () => {
    const fertig = () => { knopf.textContent = 'Kopiert'; };
    try { navigator.clipboard.writeText(text).then(fertig, () => { feld.select(); knopf.textContent = 'Text markiert, jetzt kopieren'; }); } catch (x) { feld.select(); }
  }, text: 'Text für WhatsApp kopieren' });
  return [
    h('div', { class: 'tm-kopf' }, h('div', { class: 'marke', text: KONTAKT.marke }), h('div', { class: 'tm-gesamt', text: datumZeit(r.s) })),
    h('div', { class: 'tm-feier tm-schluss' }, h('div', { class: 'tm-haken gross', html: HAKEN }),
      h('h1', { class: 'tm-name', text: r.st === 'abgebrochen' ? 'Für heute Schluss' : 'Geschafft' }),
      h('p', { class: 'tm-spruch', text: LAUF.endSpruch }),
      h('span', { class: 'tm-von', text: 'Devin' })),
    ...(LAUF.neuePR || []).map((x) => h('div', { class: 'tm-pr' }, h('small', { text: 'Neue Bestleistung' }), h('b', { text: x.name + ' · ' + String(x.kg).replace('.', ',') + ' kg × ' + x.w }))),
    h('div', { class: 'tm-sum' }, h('div', null, h('small', { text: 'Dauer' }), h('b', { text: mmss(laufDauer(r)) })),
      h('div', null, h('small', { text: 'Sätze' }), h('b', { text: String(saetzeGesamt(r)) })),
      h('div', null, h('small', { text: 'Übungen' }), h('b', { text: String(r.u.length) }))),
    schmerzFrage(),
    h('section', { class: 'block' }, h('h2', { text: 'Training ' + r.t + ' · ' + r.tn }), laufTabelle(r)),
    r.p === 'beispiel' ? h('section', { class: 'block' }, h('h2', { text: 'Das war ein Probetraining' }),   // Beispiel (24.11.2026): nichts im Verlauf, nichts an Devin
      h('p', { class: 'leise klein', text: 'Im Beispiel landet nichts in deinem Verlauf und nichts geht an Devin. Mit deinem eigenen Plan schickst du dein Training mit einem Tipp.' }),
      h('a', { class: 'knopf haupt tm-gross', href: 'analyse/', text: analyseAngefangen() ? 'Eigene Analyse fortsetzen' : 'Eigenen Plan anfragen' })) :
    h('section', { class: 'block' }, h('h2', { text: 'An Devin schicken' }),
      h('p', { class: 'leise klein', text: (KONTAKT.eingang ? 'Ein Tipp auf „An Devin senden“, und Devin hat dein Training.' : 'Per E-Mail geht es mit einem Tipp, deine Mail-App ist schon ausgefüllt.') + ' Oder kopier den Text für WhatsApp. Devin sieht dann deine Zeiten, Gewichte und Wiederholungen.' }),
      laufSendeKnopf(r, 'knopf haupt tm-gross'), knopf, feld),
    h('button', { class: 'knopf tm-gross', type: 'button', onclick: laufSchliessen, text: 'Fertig' })
  ];
}
/* Schmerz nach dem Training (13.11.2026, Pläne bei Schmerzen Schritt 6): nur wenn der Plan Beschwerden hat (LAUF.bs). 11 große Knöpfe 0–10,
 * Frage, Beschriftung und Stufen aus der Wissensbasis (daten.js → SCHMERZ). Der Wert steht als sz im Training an Devin, die Trainer-Seite wertet ihn aus. */
const schmerzOk = (v) => !!SCHMERZ && Number.isInteger(v) && v >= SCHMERZ.min && v <= SCHMERZ.max;
function schmerzFrage() {
  const r = LAUF.ergebnis, sk = SCHMERZ;
  if (!sk || !(LAUF.bs || []).length) return null;
  const werte = []; for (let i = sk.min; i <= sk.max; i++) werte.push(i);
  const stufe = schmerzOk(r.sz) ? sk.stufen.find((x) => r.sz <= x.bis) : null;
  return h('section', { class: 'block schmerz' },
    h('h2', { id: 'schmerz-frage', text: sk.frage }),
    h('p', { class: 'leise klein', id: 'schmerz-hilfe', text: 'Tipp eine Zahl an: ' + sk.links + ', ' + sk.rechts + '. Devin sieht sie mit deinem Training.' }),
    h('div', { class: 'schmerz-skala', role: 'group', 'aria-labelledby': 'schmerz-frage', 'aria-describedby': 'schmerz-hilfe' }, werte.map((n) =>
      h('button', { type: 'button', class: 'schmerz-wert' + (r.sz === n ? ' an' : ''), 'aria-pressed': r.sz === n ? 'true' : 'false', 'aria-label': 'Schmerz ' + n + ' von ' + sk.max, onclick: () => schmerzSetzen(n), text: String(n) }))),
    h('div', { class: 'schmerz-ende', 'aria-hidden': 'true' }, h('span', { text: sk.links }), h('span', { text: sk.rechts })),
    stufe ? h('p', { class: 'schmerz-stufe', role: 'status', text: stufe.text }) : null);
}
function schmerzSetzen(n) {
  if (!LAUF || !LAUF.ergebnis || !schmerzOk(n)) return;
  const r = LAUF.ergebnis; r.sz = n;
  if (TM.el) TM.el.classList.add('still');   // gleiche Ansicht, nur ein Knopf neu: nicht alles neu einblenden (Gesamttest 13.11.2026)
  speicher.schreib(VERLAUF_KEY, verlaufListe().map((x) => (x.s === r.s ? Object.assign({}, x, { sz: n }) : x)));
  laufSichern(); timerZeigen();
  const b = TM.el && TM.el.querySelector('.schmerz-wert.an');
  if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* nichts */ }
}
function timerTick() {
  if (!LAUF || !TM.el || LAUF.phase === 'fertig') return;
  const jetzt = Date.now(), g = document.getElementById('tm-gesamt'), u = document.getElementById('tm-uhr'), rg = document.getElementById('tm-ring');
  if (g) g.textContent = mmss((jetzt - LAUF.start) / 1000);
  if (LAUF.phase === 'satz') {
    const lauf = (jetzt - LAUF.seit) / 1000;
    if (u) u.textContent = mmss(lauf);
    if (rg) rg.setAttribute('stroke-dashoffset', String(RING_U * (1 - (lauf % 60) / 60)));
  }
  if (LAUF.phase === 'pause') {
    const rest = LAUF.pauseZiel - (jetzt - LAUF.seit) / 1000;
    if (u) u.textContent = mmss(Math.ceil(rest));
    if (rg) rg.setAttribute('stroke-dashoffset', String(RING_U * Math.min(1, Math.max(0, rest / Math.max(1, LAUF.pauseZiel)))));
    if (rest <= 0 && !(TM.gym && LAUF.uebungFertig)) naechsterSatz();
  }
}
setInterval(timerTick, 250);

/* ---------- Über mich und Rechtliches (06.11.2026): Text und Angaben aus kontakt.json, die Links nur, wenn es die Seiten gibt ---------- */
const aboLinks = () => KONTAKT.abo ? [' · ', h('a', { href: 'widerruf/', text: 'Widerruf' }), ' · ', h('a', { href: 'kuendigen/', text: 'Verträge hier kündigen' })] : [];
const rechtlichesLinks = () => KONTAKT.rechtliches ? [' · ', h('a', { href: 'impressum/', text: 'Impressum' }), ' · ', h('a', { href: 'datenschutz/', text: 'Datenschutz' })].concat(aboLinks()) : null;
function infoUeber() {
  const u = KONTAKT.ueber_mich;   // null, solange Devins eigener Text fehlt: dann nur der Kontakt
  return h('section', { class: 'block' }, h('h2', { text: u ? 'Über mich' : 'Kontakt' }),
    u ? h('p', { class: 'klein', text: u.zeile + ' ' + u.text }) : null,
    h('p', { class: 'klein leise' }, 'Fragen? Schreib mir: ', h('span', { text: KONTAKT.mail })),
    KONTAKT.rechtliches ? h('p', { class: 'klein' }, h('a', { href: 'impressum/', text: 'Impressum' }), ' · ', h('a', { href: 'datenschutz/', text: 'Datenschutz' }), aboLinks()) : null);
}

/* ---------- Umzug auf die eigene Adresse (06.11.2026) ----------
 * Der Speicher eines Handys gehört immer zu einer Adresse. Zieht die App um (kontakt.json → adresse), nimmt ein Knopf in der alten App alles im #-Teil mit:
 * Konto mit Code, Plan, Trainings, Trainingstage, Analyse-Entwurf, Farbwelt. Der #-Teil geht nie an einen Server.
 * Die neue App führt zusammen, statt zu überschreiben: Der neuere Stand gewinnt, Trainings werden vereint, danach prüft sie alles wie beim Start.
 * iPhone: Der #-Teil bleibt in Safari in der Adresszeile, „Zum Home-Bildschirm“ nimmt ihn mit, die neue App übernimmt beim ersten Start alles, ohne Code.
 * Fällig ist der Umzug, sobald die alte Adresse umleitet: Die Probe (manifest.webmanifest?umzug=…) geht am Offline-Speicher vorbei (sw.js), und fetch folgt der Umleitung nicht. */
const NEUE_ADRESSE = KONTAKT.adresse;
const ALTE_ADRESSE = /\.github\.io$/.test(location.hostname) && location.origin !== new URL(NEUE_ADRESSE).origin;
const LOOKS = ['lagune', 'klar', 'gold', 'sport', 'champagner'];
const UMZUG_JE = /^dk_(?:(?:tage|analyse)_[A-Za-z][A-Za-z0-9_-]{0,40}|spiel_stand|bestleistung)$/;   // seit 09.11.2026 auch der Spielstand (genau dieser eine Schlüssel, spiel.js), sonst nichts
async function umzugPruefen() {
  if (!ALTE_ADRESSE || S.umzug || navigator.onLine === false) return;
  try {
    const r = await fetch('manifest.webmanifest?umzug=' + Date.now(), { redirect: 'manual', cache: 'no-store' });
    if (r.type === 'opaqueredirect') { S.umzug = true; zeichne(); }
  } catch (e) {}
}
function umzugDaten() {
  const d = {};
  for (const k of ['dk_konten', 'dk_konto', 'dk_plaene', 'dk_aktiv', 'dk_wartet', VERLAUF_KEY]) { const v = speicher.lies(k, null); if (v != null) d[k] = v; }
  try {
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (UMZUG_JE.test(k)) { const v = speicher.lies(k, null); if (v != null) d[k] = v; } }
    const l = localStorage.getItem('dk_look'); if (LOOKS.includes(l)) d.look = l;
  } catch (e) {}
  return d;
}
function umzugKarte() {
  if (!S.umzug) return null;
  const d = umzugDaten(), ort = new URL(NEUE_ADRESSE).host;
  const etwas = Object.keys(d.dk_konten || {}).length > 0 || Object.keys(d.dk_plaene || {}).some((id) => id !== 'beispiel') || (d[VERLAUF_KEY] || []).length > 0;
  const knopf = h('a', { class: 'knopf haupt', href: NEUE_ADRESSE, target: '_blank', rel: 'noopener', text: etwas ? 'Wird vorbereitet …' : 'Zur neuen Adresse' });
  if (etwas) {
    knopf.addEventListener('click', (e) => { if (!knopf.dataset.bereit) e.preventDefault(); });
    K.planCode({ v: 1, t: Date.now(), d }).then((code) => { knopf.href = NEUE_ADRESSE + '#umzug=' + code; knopf.textContent = 'Alles mitnehmen'; knopf.dataset.bereit = '1'; },
      () => { knopf.textContent = 'Zur neuen Adresse'; knopf.dataset.bereit = '1'; });
  }
  return h('section', { class: 'block umzug' }, h('h2', { text: 'Neue Adresse: ' + ort }),
    h('p', { class: 'klein', text: etwas ? 'Die App ist umgezogen. Tipp auf den Knopf: Plan, Code und Trainings kommen mit, du musst nichts neu eingeben.' : 'Die App ist umgezogen. Ab jetzt findest du sie unter ' + ort + '.' }),
    knopf,
    h('p', { class: 'leise klein', text: istIos ? 'Leg die neue Seite danach wie beim ersten Mal auf den Home-Bildschirm (in Safari: Teilen → „Zum Home-Bildschirm“). Die neue App übernimmt alles beim ersten Öffnen. Diese alte App kannst du dann löschen.'
      : 'Installier die neue Seite danach wieder als App. Diese alte App kannst du dann löschen.' }));
}
function umzugFertigKarte() {
  if (!S.umzugNeu || installiert()) return null;
  return h('section', { class: 'block umzug' }, h('h2', { text: 'Fast fertig' }),
    h('p', { class: 'klein', text: 'Dein Plan, dein Code und deine Trainings sind da. Leg die App jetzt neu auf den Home-Bildschirm' + (istIos ? ' (unten Teilen → „Zum Home-Bildschirm“). Die neue App übernimmt alles beim ersten Öffnen, ohne Code.' : ', deine Daten kommen mit.') + ' Die alte App kannst du danach löschen.' }),
    !istIos && installEreignis ? h('button', { class: 'knopf haupt', type: 'button', onclick: async () => { installEreignis.prompt(); await installEreignis.userChoice; installEreignis = null; zeichne(); }, text: 'App installieren' }) : null);
}
async function umzugEinlesen(teil) {
  let u = null;
  try { u = await entpacke(teil); } catch (e) {}
  const ist = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  if (!ist(u) || u.v !== 1 || typeof u.t !== 'number' || u.t > Date.now() + 1728e5 || !ist(u.d)) { gesehen(teil); toast('Der Umzug-Link ist unvollständig. Tipp in der alten App nochmal auf den Knopf.'); return false; }
  const d = u.d, kHier = konten(), pHier = speicher.lies('dk_plaene', {});
  const leer = !Object.keys(kHier).length && !Object.keys(pHier).some((id) => id !== 'beispiel');
  // Immer fragen (13.11.2026), auch auf einem leeren Handy: Der Umzug-Link hat keinen Code, jeder könnte so einen bauen und schicken
  gesehen(teil);   // auch bei Nein: Der Start-Link einer Home-Bildschirm-App fragt dann nicht bei jedem Start neu
  if (!confirm('Daten von der alten Adresse übernehmen? Der Link kommt ohne Code. Tipp nur auf OK, wenn du ihn selbst in der alten App über „Alles mitnehmen“ geöffnet hast.'
    + (leer ? '' : ' Dein Stand hier bleibt, das Neuere gewinnt.'))) { toast('Nicht übernommen.'); return false; }
  let neu = 0;
  // Ein Zugang, der hier schon mit Code liegt, wechselt durch den Umzug nie seinen Code, und sein Plan kommt nur mit demselben Code mit (13.11.2026)
  const kVorher = Object.assign({}, kHier);
  const fremd = (id) => !!(kVorher[id] && kVorher[id].code) && !(ist(d.dk_konten) && ist(d.dk_konten[id]) && typeof d.dk_konten[id].code === 'string' && K.appCodeNormal(d.dk_konten[id].code) === K.appCodeNormal(kVorher[id].code));
  // Konten: nur mit gültigem Code, der neuere Stand (t) gewinnt
  if (ist(d.dk_konten)) for (const [id, ko] of Object.entries(d.dk_konten)) {
    if (!K.idOk(id) || !ist(ko) || typeof ko.t !== 'number' || ko.t > Date.now() + 1728e5 || typeof ko.code !== 'string' || !K.appCodeGueltig(ko.code) || fremd(id)) continue;
    if (!kHier[id] || !(kHier[id].t >= ko.t)) { kHier[id] = Object.assign({}, ko, { id, code: K.appCodeAnzeige(ko.code) }); neu++; }
  }
  // Pläne: geprüft wie beim Start, ein neuerer Plan (Erstelldatum d) gewinnt, der Beispielplan bleibt zurück
  if (ist(d.dk_plaene)) for (const [id, p] of Object.entries(d.dk_plaene)) {
    const sauber = id !== 'beispiel' && K.idOk(id) && !fremd(id) && K.planSauber(p);
    if (sauber && (!pHier[id] || (sauber.d || '') > (pHier[id].d || ''))) { pHier[id] = Object.assign(sauber, { id }); neu++; }
  }
  // Kommt ein echter Plan mit, hat der Beispielplan ausgedient: Wer ihn hier vorher angesehen hat, sieht danach seinen eigenen Plan
  if (pHier.beispiel && Object.keys(pHier).some((id) => id !== 'beispiel')) { delete pHier.beispiel; if (LAUF && LAUF.plan === 'beispiel') { LAUF = null; laufSichern(); } }
  speicher.schreib('dk_konten', kHier); speicher.schreib('dk_plaene', pHier);
  for (const k of ['dk_konto', 'dk_aktiv']) {
    const jetzt = speicher.lies(k, null) || '';
    if ((!K.idOk(jetzt) || !(kHier[jetzt] || pHier[jetzt])) && K.idOk(d[k] || '') && (kHier[d[k]] || pHier[d[k]])) speicher.schreib(k, d[k]);
  }
  if (!speicher.lies('dk_wartet', null) && typeof d.dk_wartet === 'string' && /^[A-Za-z0-9_-]{8,20000}$/.test(d.dk_wartet)) speicher.schreib('dk_wartet', d.dk_wartet);
  // Trainings: vereint (gleicher Start = dasselbe Training), neueste zuerst, höchstens 40 wie in der App
  const lauf = (r) => ist(r) && typeof r.s === 'number' && typeof r.e === 'number' && Array.isArray(r.u) && r.u.length <= 60 && JSON.stringify(r).length < 20000 &&
    r.u.every((x) => ist(x) && typeof x.n === 'string' && Array.isArray(x.z) && x.z.length <= 40 && x.z.every((s) => Array.isArray(s) && s.length <= 4 && s.every((w) => w === null || typeof w === 'number')));
  if (Array.isArray(d[VERLAUF_KEY])) {
    const vorher = verlaufListe(), schon = new Set();
    const v = vorher.concat(d[VERLAUF_KEY].filter(lauf)).filter((r) => !schon.has(r.s) && schon.add(r.s)).sort((a, b) => b.s - a.s).slice(0, 40);
    if (v.length !== vorher.length) neu++;
    speicher.schreib(VERLAUF_KEY, v);
    statistikMerken(v);
  }
  // Trainingstage und Analyse-Entwurf: nur, wo hier noch nichts steht
  for (const [k, w] of Object.entries(d)) {
    if (!UMZUG_JE.test(k) || speicher.lies(k, null) != null) continue;
    if (k.startsWith('dk_tage_') ? Array.isArray(w) && w.length <= 7 && w.every((i) => Number.isInteger(i) && i >= 0 && i < 7) : ist(w) && JSON.stringify(w).length < 50000) speicher.schreib(k, w);
  }
  if (leer && LOOKS.includes(d.look)) {   // Farbwelt nur auf einem leeren Handy übernehmen
    try { localStorage.setItem('dk_look', d.look); } catch (e) {}
    document.documentElement.dataset.look = d.look;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = d.look === 'klar' ? '#F5F5F7' : d.look === 'gold' ? '#060608' : d.look === 'sport' ? '#111215' : d.look === 'champagner' ? '#131416' : '#86CBEE';
  }
  gespeichertesPruefen();
  S.umzugNeu = true; S.tagWahl = null; S.ansicht = 'heute'; dauerhaft();
  toast(neu ? 'Umzug geschafft: Plan, Code und Trainings sind da.' : 'Alles war schon da.');
  return true;
}

/* ---------- Start ---------- */
// Schon Gespeichertes einmal beim Start prüfen: So wird auch ein Handy wieder gesund, das vor der Sicherheitsprüfung (4.11.2026) einen gefälschten Link geöffnet hat
function gespeichertesPruefen() {
  const istObjekt = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const plaene = speicher.lies('dk_plaene', {}), neuP = {};
  for (const id of istObjekt(plaene) ? Object.keys(plaene) : []) { const p = K.idOk(id) && K.planSauber(plaene[id]); if (p) neuP[id] = Object.assign(p, { id }); }
  if (JSON.stringify(neuP) !== JSON.stringify(plaene)) speicher.schreib('dk_plaene', neuP);
  const alle = konten(), neuK = {};
  for (const id of istObjekt(alle) ? Object.keys(alle) : []) if (K.idOk(id) && istObjekt(alle[id])) neuK[id] = Object.assign(alle[id], { id, n: typeof alle[id].n === 'string' ? alle[id].n.slice(0, 120) : '', bis: /^\d{4}-\d{2}-\d{2}$/.test(alle[id].bis || '') ? alle[id].bis : '' });
  if (JSON.stringify(neuK) !== JSON.stringify(alle)) speicher.schreib('dk_konten', neuK);
  for (const k of ['dk_aktiv', 'dk_konto']) { const v = speicher.lies(k, null); if (v != null && !K.idOk(v)) speicher.schreib(k, null); }
  if (speicher.lies('dk_sitzungen', null) != null) speicher.schreib('dk_sitzungen', null);   // Sitzungen der Fassung 3 (16.11.2026) gibt es nicht mehr
}
// Sofort neue Fassung (16.11.2026, Devin: „es ist tatsächlich noch nicht online“): Die App kommt aus dem Offline-Speicher, eine neue Fassung lädt im Hintergrund.
// Übernimmt sie, lädt die App einmal neu, sobald nichts offen ist (kein Gym, Training oder Blatt; der Plan steckt im #-Teil und bleibt).
// Kommt die App wieder in den Vordergrund (Home-Bildschirm am iPhone), fragt sie nach einer neuen Fassung.
// 16.11.2026 (Devin: „Zeige bei neuer Version einen verständlichen Hinweis mit Jetzt aktualisieren … Unterbrich keine laufende Übung“): Die neue Fassung wartet.
// Gerade geöffnet oder zurückgekommen (12 s) und nichts offen: gleich übernehmen. Sonst Hinweis mit „Jetzt aktualisieren“, im Training/Gym erst danach.
// Nachgesehen wird beim Öffnen, bei Rückkehr in die App, wenn das Internet wiederkommt und alle 30 Minuten. Trainings und Plan liegen im Speicher des Handys und bleiben.
if ('serviceWorker' in navigator) {
  const hatteFassung = !!navigator.serviceWorker.controller, START = Date.now();
  let neuLaden = false, reg = null, hinweis = null, zurueck = 0;
  const offenesEtwas = () => !!document.querySelector('.raum, .tm, .rg-offen, .blatt.offen, .rang-auf');   // .rg-offen: ausgeblendetes Training auf Heute
  const tippt = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
  const jetztNeu = () => { if (!neuLaden || offenesEtwas()) return; neuLaden = false; location.reload(); };
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hatteFassung) return; neuLaden = true; jetztNeu(); });
  const anwenden = () => { if (reg && reg.waiting) { neuLaden = true; reg.waiting.postMessage('jetzt'); } else location.reload(); };
  const pruefen = () => { if (reg && navigator.onLine !== false) reg.update().catch(() => {}); };
  const hinweisWeg = () => { if (hinweis) { hinweis.remove(); hinweis = null; } };
  const wartet = () => {
    if (!reg || !reg.waiting || !navigator.serviceWorker.controller) { hinweisWeg(); return; }
    if (offenesEtwas()) { hinweisWeg(); return; }
    if (!tippt() && Date.now() - Math.max(START, zurueck) < 12000) { anwenden(); return; }
    if (hinweis) return;
    const knopf = h('button', { class: 'knopf haupt', type: 'button', text: 'Jetzt aktualisieren', onclick: () => { knopf.disabled = true; knopf.textContent = 'Lädt …'; anwenden(); } });
    hinweis = h('div', { class: 'update-hinweis', role: 'status' }, h('div', { class: 'update-text' }, h('b', { text: 'Neue Version da' }), h('small', { text: 'Dauert nur einen Moment. Dein Plan und deine Trainings bleiben.' })), knopf);
    document.body.append(hinweis);
  };
  try { if (window.caches) caches.open('dk-flags').then((c) => c.put('update-knopf', new Response('1'))).catch(() => {}); } catch (e) {}   // sagt der neuen sw.js: diese App kann „Jetzt aktualisieren“
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => {
    reg = r;
    r.addEventListener('updatefound', () => { const n = r.installing; if (n) n.addEventListener('statechange', wartet); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { zurueck = Date.now(); pruefen(); } else jetztNeu(); });
    window.addEventListener('online', pruefen);
    pruefen(); wartet();
  }).catch(() => {});
  setInterval(() => { jetztNeu(); wartet(); }, 2000);
  setInterval(pruefen, 30 * 60 * 1000);
}
(async () => {
  altesAbhakenWeg();
  statistikMerken(verlaufListe());   // Dein Fortschritt: Trainings aus dem Verlauf übernehmen (auch die von vor dem 17.11.2026)
  gespeichertesPruefen();
  S.wartet = speicher.lies('dk_wartet', null);
  await linkEinlesen();
  figurAusLink();
  const figurNeu = (() => { try { const x = JSON.parse(sessionStorage.getItem('dk_figur_neu') || 'null'); sessionStorage.removeItem('dk_figur_neu'); return x; } catch (e) { return null; } })();   // nach dem Neuladen wegen neuer Figur (figurGewechselt)
  if (figurNeu && typeof figurNeu.ansicht === 'string') S.ansicht = figurNeu.ansicht;
  zeichne();
  if (figurNeu && figurNeu.text) toast(String(figurNeu.text).slice(0, 80));
  fotosVorladen();
  gymAusLink();
  umzugPruefen();
  netzAnzeigen();
  zugangPruefen().catch(() => {});
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') zugangPruefen().catch(() => {}); });   // zurück in der App: Neues oder Schalter „aus“
window.addEventListener('hashchange', async () => { if (await linkEinlesen()) { zeichne(); window.scrollTo(0, 0); fotosVorladen(); } });
// QA 25.11.2026 (Rolle 19): Zurück-Wisch zeigte eine alte Fassung der Seite aus dem Browser-Speicher (Code-Eingabe, obwohl eingeloggt).
// Ist der Login-Stand seit dem Verlassen anders, frisch laden.
let LOGIN_BEIM_VERLASSEN = null;
const loginStand = () => { try { return ['dk_konten', 'dk_konto', 'dk_aktiv', 'dk_wartet'].map((k) => localStorage.getItem(k)).join('|'); } catch (e) { return ''; } };
window.addEventListener('pagehide', () => { LOGIN_BEIM_VERLASSEN = loginStand(); });
window.addEventListener('pageshow', (e) => { if (e.persisted && LOGIN_BEIM_VERLASSEN !== null && LOGIN_BEIM_VERLASSEN !== loginStand()) location.reload(); });
window.addEventListener('online', () => { zeichne(); umzugPruefen(); netzAnzeigen(); zugangPruefen().catch(() => {}); if (S.codeLink && !S.laedt) codeLinkEinlesen(S.codeLink).then(() => { zeichne(); window.scrollTo(0, 0); }); });
window.addEventListener('offline', () => { zeichne(); netzAnzeigen(); });
