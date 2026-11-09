// DK Coach — Bestleistungen (Kniebeuge, Bankdrücken, Kreuzheben) und Scheiben-Rechner (09.11.2026).
// Nur Regeln und Zahlen, kein DOM, kein Netz, kein Zufall: Darum lässt es sich mit Node prüfen (pruefe-bestleistung.mjs).
// Schutzregeln: Wie viele Wiederholungen mindestens nötig sind, legt der Plan fest (Feld m, aus Level, Alter und Gesundheit). m = 1 heißt: Ein einzelner Maximalversuch ist freigegeben, das gibt es nur für Erwachsene ab Level 3 ohne Beschwerden (Regel in der Engine).
// Fehlt die Angabe, gilt der strenge Wert. Sehr schwere Sätze (bis 3 Wdh) brauchen eine Bestätigung. Bestleistungen bringen keine Punkte und keine Medaillen, es gibt keinen Vergleich mit anderen, und alles bleibt auf diesem Handy.

export const VERSION = 1;
export const SCHLUESSEL = 'dk_bestleistung';
export const STANGE = 20;
export const SCHEIBEN = Object.freeze([20, 10, 5, 2.5, 1.25]);   // Devins Rechnung: 220 kg = 5 × 20 je Seite, 200 kg = 4 × 20 + 10 je Seite
export const MIN_WDH_STRENG = 8;   // wie Jugendliche in zielgruppen.json, solange der Plan noch keine eigene Angabe hat
export const SCHWER_BIS_WDH = 3;   // bis hierhin muss der Kunde bestätigen: Sicherung oder Spotter, aufgewärmt, ausgeschlafen
export const UEBUNGEN = Object.freeze([
  Object.freeze({ id: 'kniebeuge', name: 'Kniebeuge' }),
  Object.freeze({ id: 'langhantel_bankdruecken', name: 'Bankdrücken' }),
  Object.freeze({ id: 'kreuzheben', name: 'Kreuzheben' })
]);
const GRENZEN = Object.freeze({ kgMax: 500, wdhMax: 30, verlauf: 12, text: 8000 });
const istId = (id) => UEBUNGEN.some((u) => u.id === id);

/* ---------- Scheiben ---------- */
// Was auf jede Seite gehört: { stange, proSeite: [20, 20, 10], rest } mit rest = kg je Seite, die sich mit diesen Scheiben nicht stecken lassen
export function scheiben(kg) {
  const seite = Number.isFinite(kg) ? Math.max(0, (kg - STANGE) / 2) : 0, proSeite = [];
  let offen = seite;
  for (const s of SCHEIBEN) while (offen >= s - 1e-9) { proSeite.push(s); offen -= s; }
  return { stange: STANGE, proSeite, rest: Math.round(offen * 1000) / 1000 };
}
export function scheibenText(kg) {
  const x = scheiben(kg);
  if (!x.proSeite.length) return 'Nur die Stange (' + STANGE + ' kg)';
  const teile = [];
  for (const s of SCHEIBEN) { const n = x.proSeite.filter((p) => p === s).length; if (n) teile.push(n + ' × ' + String(s).replace('.', ',')); }
  return teile.join(' + ') + ' kg pro Seite';
}

/* ---------- Prüfen ---------- */
export function minWdh(m) { return Number.isInteger(m) && m >= 1 && m <= 15 ? m : MIN_WDH_STRENG; }
const kgOk = (kg) => Number.isFinite(kg) && kg >= STANGE && kg <= GRENZEN.kgMax && Number.isInteger(kg * 4);   // Vierteilkilo reicht für 1,25er auf beiden Seiten
const wdhOk = (w) => Number.isInteger(w) && w >= 1 && w <= GRENZEN.wdhMax;
const datumOk = (d) => typeof d === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(d);
const eintragOk = (e) => !!e && typeof e === 'object' && !Array.isArray(e) && kgOk(e.kg) && wdhOk(e.w) && datumOk(e.d);
export function besser(neu, alt) { return !alt || neu.kg > alt.kg || (neu.kg === alt.kg && neu.w > alt.w); }

const leer = () => ({ l: {}, h: {} });
function pruefe(roh) {
  if (typeof roh === 'string') { if (roh.length > GRENZEN.text) return null; roh = JSON.parse(roh); }
  if (!roh || typeof roh !== 'object' || Array.isArray(roh) || roh.v !== VERSION) return null;
  const s = leer();
  for (const u of UEBUNGEN) {
    const b = roh.l && Object.prototype.hasOwnProperty.call(roh.l, u.id) ? roh.l[u.id] : null, v = roh.h && Object.prototype.hasOwnProperty.call(roh.h, u.id) ? roh.h[u.id] : [];
    if (b !== null && !eintragOk(b)) return null;
    if (!Array.isArray(v) || v.length > GRENZEN.verlauf || !v.every(eintragOk)) return null;
    if (b) s.l[u.id] = { kg: b.kg, w: b.w, d: b.d };
    s.h[u.id] = v.map((e) => ({ kg: e.kg, w: e.w, d: e.d }));
  }
  return s;
}

/* ---------- Speicher: ein Schlüssel, nur Text ---------- */
const istSpeicher = (s) => !!s && typeof s.lies === 'function' && typeof s.schreibe === 'function';
const browserSpeicher = {
  lies() { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(SCHLUESSEL); } catch (e) { return null; } },
  schreibe(k, text) { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(SCHLUESSEL, text); return true; } catch (e) { return false; } }
};
let eingesetzt = null;
export function setzeSpeicher(s) { eingesetzt = istSpeicher(s) ? s : null; }   // nur für Tests
const wahl = (s) => (istSpeicher(s) ? s : eingesetzt || browserSpeicher);
function lesen(sp) { let roh; try { roh = sp.lies(SCHLUESSEL); } catch (e) { return undefined; } try { return roh == null ? leer() : pruefe(roh); } catch (e) { return null; } }
function schreiben(sp, s) { try { const t = JSON.stringify({ v: VERSION, l: s.l, h: s.h }); return t.length <= GRENZEN.text && sp.schreibe(SCHLUESSEL, t) !== false; } catch (e) { return false; } }

// Für die Anzeige: je Übung { id, name, beste: { kg, w, d } | null, verlauf: [...] }. Wirft nie.
export function stand(speicher) {
  let s = null;
  try { s = lesen(wahl(speicher)); } catch (e) { s = null; }
  s = s || leer();
  return UEBUNGEN.map((u) => ({ id: u.id, name: u.name, beste: s.l[u.id] || null, verlauf: (s.h[u.id] || []).slice() }));
}

/* ---------- Eintragen ---------- */
// e: { id, kg, wdh, min, datum, sicher }. Antwort: { ok: false, grund: 'wdh' | 'kg' | 'uebung' | 'sicher' | 'speicher', min? } oder { ok: true, neu: true|false, beste }
export function eintragen(e, speicher) {
  try {
    const sp = wahl(speicher), min = minWdh(e && e.min);
    if (!e || !istId(e.id)) return { ok: false, grund: 'uebung' };
    if (!kgOk(e.kg)) return { ok: false, grund: 'kg' };
    if (!wdhOk(e.wdh) || e.wdh < min) return { ok: false, grund: 'wdh', min };
    if (e.wdh <= SCHWER_BIS_WDH && e.sicher !== true) return { ok: false, grund: 'sicher' };
    if (!datumOk(e.datum)) return { ok: false, grund: 'uebung' };
    const s = lesen(sp);
    if (!s) return { ok: false, grund: 'speicher' };   // kaputt oder nicht lesbar: nichts überschreiben
    const neu = { kg: e.kg, w: e.wdh, d: e.datum }, alt = s.l[e.id];
    if (!besser(neu, alt)) return { ok: true, neu: false, beste: alt };
    s.l[e.id] = neu;
    const v = s.h[e.id] || (s.h[e.id] = []);
    v.unshift(neu);
    while (v.length > GRENZEN.verlauf) v.pop();
    if (!schreiben(sp, s)) return { ok: false, grund: 'speicher' };
    return { ok: true, neu: true, beste: neu };
  } catch (err) { return { ok: false, grund: 'speicher' }; }
}

// Nach dem Training: saetze = [{ id, kg, wdh }] aus dem Log. Gibt die neuen Bestleistungen zurück: [{ id, name, kg, w }], je Übung höchstens eine (die beste).
export function ausTraining(saetze, min, datum, speicher) {
  const aus = [];
  try {
    for (const u of UEBUNGEN) {
      let beste = null;
      for (const x of Array.isArray(saetze) ? saetze : []) {
        if (!x || x.id !== u.id || !kgOk(x.kg) || !wdhOk(x.wdh) || x.wdh < minWdh(min)) continue;
        const k = { kg: x.kg, w: x.wdh };
        if (besser(k, beste)) beste = k;
      }
      if (!beste) continue;
      const r = eintragen({ id: u.id, kg: beste.kg, wdh: beste.w, min, datum, sicher: true }, speicher);   // Sätze aus dem Plan sind kein Maximalversuch
      if (r.ok && r.neu) aus.push({ id: u.id, name: u.name, kg: beste.kg, w: beste.w });
    }
  } catch (e) { /* das Training läuft immer weiter */ }
  return aus;
}
