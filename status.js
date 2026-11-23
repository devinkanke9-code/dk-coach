// DK Coach — Status (18.11.2026). Devin: „Status … Skin auswählen oder deinen Charakter auswählen, den du aus dir selber machst mit deinen Bildern … Fettanzahl“,
// in der Fragekarte: unten in der Leiste, eigener Charakter + Skins, Zahlen auch zeigen.
// Zeigt den eigenen Charakter mit Größe, Gewicht und Körperfett und lässt wählen, wer im Gym trainiert: der eigene Charakter, die normale Figur oder ein fertiger Skin.
// Die Wahl bleibt nur auf diesem Handy (dk_figur_<Plan>). Schickt Devin einen neuen eigenen Charakter, ist der sofort gewählt.
// Skins sind fertige Charakter-Daten wie Devins Charaktere (nur Zahlen und Farben, charakter/kurzform.js) und laufen im Gym über charakter/gym.js.
// Die 3D-Figur kennt bisher nur einen Männerkörper mit kurzen Haaren, darum sind alle Skins Männer-Figuren. Bilder: arbeit-status/skins-vorschau.js.

export const SKINS = [
  { id: 'athlet', name: 'Athlet', bild: 'skin-athlet.jpg', c: { v: 1, z: [182, 82, 11, 4, 92, 87, 8], c: 'd6a27c2b1d1424180f5a3a2216161b16161bf3f3f1f2f2f2', a: [1, 0, 0, 1], n: 'Athlet' } },
  { id: 'kraftpaket', name: 'Kraftpaket', bild: 'skin-kraftpaket.jpg', c: { v: 1, z: [178, 96, 17, 6, 92, 87, 3], c: '8d5a3b1515151111115a3a22c8f1351b1c20f3f3f116161b', a: [2, 0, 0, 1], n: 'Kraftpaket' } },
  { id: 'laeufer', name: 'Läufer', bild: 'skin-laeufer.jpg', c: { v: 1, z: [176, 68, 10, 3, 92, 87, 12], c: 'c68a5e1d14101d14105a3a22f2f2f223409af3f3f1f2f2f2', a: [2, 0, 0, 1], n: 'Läufer' } },
  { id: 'gold', name: 'Gold', bild: 'skin-gold.jpg', c: { v: 1, z: [180, 80, 13, 5, 92, 87, 6], c: 'e8b8963a24142a1a0e5a3a22d4a94a141418141418141418', a: [1, 1, 0, 1], n: 'Gold' } }
];

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const komma = (x, n) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
const schluessel = (p) => 'dk_figur_' + (p && p.id ? p.id : 'beispiel');

// Kurze Kennung des eigenen Charakters: Ändert sie sich, kam ein neuer von Devin
export function kennung(c) {
  if (!c) return '';
  const t = JSON.stringify(c);
  let x = 2166136261;
  for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0).toString(36) + '-' + t.length.toString(36);
}

// Wer trainiert im Gym? { id, c, name, eigen }. c = null heißt: die normale Figur der App.
// Ohne Wahl wie bisher: der eigene Charakter, sonst die normale Figur. Was aus dem Speicher kommt, zählt nur, wenn es eine bekannte Figur ist.
export function figurFuer(p, eigen, lies) {
  const w = p ? lies(schluessel(p), null) : null, gewaehlt = w && typeof w === 'object' && typeof w.f === 'string' ? w : null;
  if (eigen && (!gewaehlt || gewaehlt.f === 'eigen' || gewaehlt.e !== kennung(eigen))) return { id: 'eigen', c: eigen, name: 'Dein Charakter', eigen: true };
  const s = gewaehlt ? SKINS.find((x) => x.id === gewaehlt.f) : null;
  return s ? { id: s.id, c: s.c, name: s.name, eigen: false } : { id: 'standard', c: null, name: 'Standard', eigen: false };
}

// Zahlen des eigenen Charakters wie auf „Mein Charakter“ (charakter/stand.js): Körperfett eingetragen oder geschätzt.
// Körperfett aus Alter (18.11.2026): gleiche Formel wie stand.js fettSchaetzung (Deurenberg 1991, Jugend- und Erwachsenen-Formel mit weichem Übergang von 13 bis 18), mit dem Alter aus dem Charakter (al); ohne Alter 25 Jahre wie bisher
export function zahlenVon(c) {
  const z = c && Array.isArray(c.z) ? c.z : [], frau = !!(c && c.w), ein = zahl(z[2]), al = zahl(c && c.al);
  const groesse = Math.max(130, Math.min(220, zahl(z[0]) || 175)), gewicht = Math.max(35, Math.min(200, zahl(z[1]) || 50)), alter = al != null && al >= 10 && al <= 100 ? Math.round(al) : null;
  const geschaetzt = !(ein >= 3), bmi = gewicht / ((groesse / 100) ** 2), j = alter || 25, u = Math.max(0, Math.min(1, (j - 13) / 5));
  const jung = 1.51 * bmi - 0.7 * j - (frau ? 0 : 3.6) + 1.4, erwachsen = 1.2 * bmi + 0.23 * j - (frau ? 0 : 10.8) - 5.4;
  const fett = geschaetzt ? Math.max(frau ? 14 : 7, Math.min(45, jung + (erwachsen - jung) * u)) : Math.min(60, ein);
  return { groesse, gewicht, alter, fett, geschaetzt };
}

const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.6" r="3.6"/><path d="M4.6 21c.8-4.6 3.8-7.3 7.4-7.3s6.6 2.7 7.4 7.3"/></svg>';

// Körperfett für alle Altersstufen (Devin, Fragekarte 18.11.: „Auch unter 18 zeigen“)
function eigenKarte(o) {
  const { h } = o, z = zahlenVon(o.eigen);
  const feld = (wert, was) => h('div', { class: 'st-zahl' }, h('b', { text: wert }), h('span', { text: was }));
  return h('section', { class: 'block st-ich' },
    h('h2', { text: 'Dein Charakter' }),
    h('p', { class: 'leise klein', text: 'Von Devin für dich gebaut.' }),
    h('div', { class: 'st-zahlen' },
      feld(Math.round(z.groesse) + ' cm', 'Größe'),
      feld(komma(z.gewicht, 1) + ' kg', 'Gewicht'),
      feld((z.geschaetzt ? '≈ ' : '') + Math.round(z.fett) + ' %', z.geschaetzt ? 'Körperfett, geschätzt' : 'Körperfett')),
    z.geschaetzt ? h('p', { class: 'leise klein', text: 'Geschätzt aus ' + (z.alter ? 'Alter, Größe und Gewicht' : 'Größe und Gewicht') + '. Weißt du deinen Wert genau, sag ihn Devin.' }) : null,
    h('a', { class: 'knopf charakter-knopf', href: 'charakter/kunde.html', text: 'Ansehen und drehen' }));
}

function ohneKarte(o) {
  const { h } = o;
  return h('section', { class: 'block st-ich' },
    h('h2', { text: 'Dein eigener Charakter' }),
    h('p', { class: 'klein', text: 'Devin kann dir eine eigene 3D-Figur bauen: mit deiner Größe, deinem Gewicht und deinem Körperfett, auf Wunsch mit deinem Gesicht aus Fotos.' }),
    h('p', { class: 'leise klein', text: 'Frag Devin danach. Deine Figur kommt mit seinem nächsten Link und ist dann sofort hier.' }));
}

// o: { h, plan, eigen, lies, schreib, toast, neu, vorladen }
export function ansicht(o) {
  const { h } = o, jetzt = figurFuer(o.plan, o.eigen, o.lies);
  const waehlen = (id, name) => {
    o.schreib(schluessel(o.plan), { f: id, e: kennung(o.eigen) });
    if (id !== 'standard' && o.vorladen) o.vorladen();   // Figur und Gym einmal laden, dann geht es auch ohne Internet
    o.toast(id === 'eigen' ? 'Dein Charakter trainiert jetzt im Gym' : name + ' trainiert jetzt im Gym');
    o.neu();
  };
  const kachel = (id, name, bild) => h('button', { class: 'st-figur', type: 'button', 'aria-pressed': jetzt.id === id ? 'true' : 'false', onclick: () => { if (jetzt.id !== id) waehlen(id, name); } },
    bild ? h('img', { src: bild, alt: '', width: '330', height: '550', decoding: 'async' }) : h('span', { class: 'st-du', html: PERSON }),
    h('span', { class: 'st-name', text: name }));
  return [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Status' })),
    o.eigen ? eigenKarte(o) : ohneKarte(o),
    // 23.11.2026: hieß „st-wahl“ wie die Zeitraum-Wahl der Statistik (stil.css: Raster mit 5 Spalten), dadurch waren die Figuren eingequetscht. Eigener Name, keine Regel nötig.
    h('section', { class: 'block status-gymwahl' }, h('h2', { text: 'Wer trainiert im Gym?' }),
      h('div', { class: 'st-figuren' },
        o.eigen ? kachel('eigen', 'Mein Charakter', null) : null,
        kachel('standard', 'Standard', 'skin-standard.jpg'),
        SKINS.map((s) => kachel(s.id, s.name, s.bild))),
      h('p', { class: 'leise klein', text: 'Gilt ab dem nächsten Gang ins Gym. Die Wahl bleibt nur auf diesem Handy.' }))];
}
