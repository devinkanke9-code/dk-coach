// DK Coach — „Coach DK erklärt“: macht aus den Technik-Texten einer Übung Erklärpunkte für die 3D-Figur
// (welches Körperteil leuchtet, an welcher Stelle der Bewegung die Figur anhält) und liest sie vor.
// Läuft ganz ohne Internet: Text aus daten.js, Stimme vom Handy (Sprachausgabe des Browsers).

// Körperteile; es zählt das Teil, das im Satz zuerst vorkommt (Namen wie in figur.js → HINWEIS)
const KOERPER = [
  ['knie', /knie/],
  ['fuss', /füße|füßen|fuß|fersen?|zehen|sohle/],
  ['huefte', /hüfte|hüft|becken|gesäß|\bpo\b|gurt/],
  ['ruecken', /rücken|wirbelsäule|hohlkreuz|oberkörper/],
  ['bauch', /bauch|rumpf|rippen|körperspannung/],
  ['schulter', /schulter(?!breit|höhe)|achsel|trapez/],
  ['kopf', /kopf|kinn|blick|nacken|\bhals\b/],
  ['brust', /brust(?!höhe)/],
  ['ellbogen', /ellbogen|ellenbogen|oberarm/],
  ['hand', /\bhände?n?\b|handgelenk|handfläche|daumen|unterarm|faust|finger/],
  ['arme', /\barme?n?\b|in den hang/],
  ['bein', /\bbeine?n?\b|oberschenkel/]
];
// Kein Körperteil im Satz: Gerät in der Hand → Hände; sonst der Hauptmuskel der Übung
const GERAET = /stange|hantel|kettlebell|griffe?\b|\bseil|kabel|\bband\b/;
const MUSKEL_TEIL = { brust: 'brust', lat: 'ruecken', oberer_ruecken: 'ruecken', trapez: 'schulter', schulter_vorne: 'schulter', schulter_seite: 'schulter',
  schulter_hinten: 'schulter', bizeps: 'ellbogen', trizeps: 'ellbogen', unterarme: 'hand', quadrizeps: 'knie', beinbeuger: 'bein', gesaess: 'huefte',
  adduktoren: 'bein', abduktoren: 'huefte', waden: 'fuss', bauch: 'bauch', seitlicher_rumpf: 'bauch', unterer_ruecken: 'ruecken' };

export function teilAus(satz, muskeln) {
  const s = satz.toLowerCase();
  let best = null, pos = Infinity;
  for (const [teil, muster] of KOERPER) { const m = s.match(muster); if (m && m.index < pos) { best = teil; pos = m.index; } }
  if (best) return best;
  if (GERAET.test(s)) return 'hand';
  return MUSKEL_TEIL[(muskeln || [])[0]] || null;
}
// Stelle der Bewegung: 0 = Start/unten (z. B. tiefste Kniebeuge), 1 = Endposition/oben. Es zählt, was im Satz zuerst kommt.
const STELLEN = [
  [0.04, /unten|tiefst|tiefen punkt|in den hang|vor der brust|zur brust|ganz tief/],
  [0.35, /(bleibt|bleiben|halten|hält) oben|oben (bleib|halt)/],
  [0.96, /\boben\b|ganz hoch|endposition|zusammendrücken|zusammenziehen|über die stange|durchstrecken|hochdrücken|ganz strecken/],
  [0.2, /absenken|senken|ablassen|dehnung|runter/]
];
export function stelleAus(satz) {
  const s = satz.toLowerCase();
  let t = 0.35, pos = Infinity;
  for (const [wert, muster] of STELLEN) { const m = s.match(muster); if (m && m.index < pos) { t = wert; pos = m.index; } }
  return t;
}
const satz = (t) => /[.!?]$/.test(t.trim()) ? t.trim() : t.trim() + '.';
export const ART_NAME = { technik: 'So geht’s', fehler: 'Typischer Fehler', vorsicht: 'Vorsicht' };

// d = Übung aus daten.js: n Name, m Muskeln, t Technik, f Fehler, v Vorsicht, k eigene Erklärpunkte (erklaerungen.json)
export function erklaerPunkte(d) {
  const roh = d.k && d.k.length ? d.k : [
    ...(d.t || []).slice(0, 4).map((text) => ({ art: 'technik', text })),
    ...(d.f || []).slice(0, 2).map((text) => ({ art: 'fehler', text })),
    ...(d.v || []).slice(0, 1).map((text) => ({ art: 'vorsicht', text, teil: null }))
  ];
  return roh.map((p) => {
    const art = p.art || 'technik';
    const teil = p.teil !== undefined ? p.teil : teilAus(p.text, d.m);
    const vorn = art === 'fehler' ? 'Typischer Fehler: ' : art === 'vorsicht' ? 'Vorsicht: ' : '';
    return { art, text: p.text, teil, t: p.t != null ? p.t : stelleAus(p.text), sprechen: vorn + satz(p.text) };
  });
}

/* ---------- Stimme ---------- */
const TON = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let stimmeDe = null;
function deutscheStimme() {
  if (stimmeDe) return stimmeDe;
  const alle = speechSynthesis.getVoices().filter((v) => /^de([-_]|$)/i.test(v.lang));
  // Stimmen auf dem Gerät zuerst: die gehen auch ohne Netz
  stimmeDe = alle.find((v) => v.localService && /de[-_]de/i.test(v.lang)) || alle.find((v) => v.localService) || alle[0] || null;
  return stimmeDe;
}
if (TON && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', () => { stimmeDe = null; });
export const stimme = {
  moeglich: TON,
  an: (() => { try { return localStorage.getItem('dk_ton') !== '0'; } catch (e) { return true; } })(),
  schalten(an) { this.an = an; try { localStorage.setItem('dk_ton', an ? '1' : '0'); } catch (e) { /* egal */ } if (!an && TON) speechSynthesis.cancel(); }
};
// Spricht den Text (oder wartet die Lesezeit ab, wenn der Ton aus ist) und ruft dann fertig(). Rückgabe: Abbrechen.
export function sprich(text, fertig) {
  let erledigt = false, gestartet = false;
  const timer = [];
  const ende = () => { if (erledigt) return; erledigt = true; timer.forEach(clearTimeout); fertig(); };
  const lesezeit = Math.max(3200, 1400 + text.length * 70);
  if (!TON || !stimme.an) { timer.push(setTimeout(ende, lesezeit)); return () => { erledigt = true; timer.forEach(clearTimeout); }; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE'; u.rate = 1.03;
  const v = deutscheStimme(); if (v) u.voice = v;
  u.onstart = () => { gestartet = true; timer.push(setTimeout(ende, 5000 + text.length * 120)); };
  u.onend = ende; u.onerror = ende;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  // Keine Stimme auf dem Handy (oder sie bleibt stumm): dann zählt die Lesezeit
  timer.push(setTimeout(() => { if (!gestartet) { timer.push(setTimeout(ende, lesezeit - 1800)); } }, 1800));
  return () => { erledigt = true; timer.forEach(clearTimeout); speechSynthesis.cancel(); };
}
