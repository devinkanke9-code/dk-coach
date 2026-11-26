// DK Coach — Gesundheits-Scan (26.11.2026). Devin: „eigener Gesundheits-Scan“. Fragekarte 26.11.: Training, Essen und Trinken aus Daten, die die App schon hat,
// dazu ein Wochen-Check (Schlaf und „Wie geht's dir?“, einmal pro Woche, etwa 30 Sekunden). Ergebnis: Ampel je Bereich und ein Tipp, keine Gesamtnote, kein Gewicht.
// Eigene Seite unter Mehr und eine Karte auf Heute. Kein medizinischer Test: Beschwerden gehen immer zu Devin, gedrückte Stimmung bekommt den Hinweis auf Hilfe.
// Alles bleibt auf diesem Handy (o.lies/o.schreib, Schlüssel dk_gesund_<Plan-id>). Kein Netz, keine Adresse nach außen.
// Regeln, Texte und Quellen: wissen/daten/gesundheit_app.json (kommt über build.js als gesund-daten.js). Test: pruefe-gesund.js.
import { GESUND } from './gesund-daten.js';
import { essenWoche, istJung } from './essen.js';

const G = GESUND, R = G.regeln;
const TAG_MS = 86400000;
const REIHE = ['schlaf', 'befinden', 'essen', 'trinken', 'training'];   // welcher Bereich beim Tipp zuerst drankommt
const RANG = { rot: 0, gelb: 1, gruen: 2 };
const ZEICHEN = { gruen: '✓', gelb: '–', rot: '!', grau: '?' };   // die Ampel ist auch ohne Farbe lesbar
const schluessel = (p) => 'dk_gesund_' + (p && p.id ? p.id : 'beispiel');
const wert15 = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const stufe = (x, gruenAb, gelbAb) => (x >= gruenAb ? 'gruen' : x >= gelbAb ? 'gelb' : 'rot');
const schlechter = (a, b) => (RANG[a] <= RANG[b] ? a : b);
const telLink = (n) => 'tel:' + String(n).replace(/[^0-9+]/g, '');
const tagKurz = (ms) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
const gleicherTag = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/* ---------- Gespeicherter Stand: alles, was aus dem Speicher kommt, wird geprüft ---------- */
export function checkSauber(x) {
  if (!x || typeof x !== 'object') return null;
  if (!(typeof x.t === 'number' && Number.isFinite(x.t) && x.t > 1.6e12 && x.t < 4.2e12)) return null;
  const o = { t: Math.round(x.t), sh: Number.isInteger(x.sh) && x.sh >= 0 && x.sh < R.schlaf.optionen.length ? x.sh : null,
    se: wert15(x.se), en: wert15(x.en), sm: wert15(x.sm), sr: wert15(x.sr), bs: x.bs === 1 ? 1 : x.bs === 0 ? 0 : null };
  return Object.values(o).some((v) => v === null) ? null : o;
}
export function stand(roh) {
  const s = roh && typeof roh === 'object' && !Array.isArray(roh) ? roh : {};
  return { v: 1, c: (Array.isArray(s.c) ? s.c : []).map(checkSauber).filter(Boolean).sort((a, b) => a.t - b.t).slice(-G.checks_behalten) };
}
// Der Check gilt eine Woche lang. Danach ist er „fällig“ (die Karte auf Heute zeigt dann den Knopf).
export function letzterCheck(st, jetzt) {
  const c = st.c[st.c.length - 1];
  return c && c.t <= jetzt + 60000 && jetzt - c.t < G.check_alle_tage * TAG_MS ? c : null;
}
export function mitCheck(st, c) {   // ein neuer Check ersetzt einen vom selben Tag
  return { v: 1, c: st.c.filter((x) => !gleicherTag(x.t, c.t)).concat([c]).slice(-G.checks_behalten) };
}

/* ---------- Bewerten: jeder Bereich bekommt eine Stufe (gruen, gelb, rot, grau = keine Daten) und eine Zeile ---------- */
export function bewerteTraining(tr) {
  if (!tr || !(tr.geplant > 0)) return { s: 'grau', d: 'In deinem Plan stehen keine Trainingstage.', still: true };
  if (!tr.geschafft && !tr.jemals) return { s: 'grau', d: 'Nach deinem ersten Training siehst du hier deine Woche.' };
  const n = tr.geschafft, z = tr.geplant;
  return { s: stufe(n / z, R.training.gruen_ab_anteil, R.training.gelb_ab_anteil),
    d: n > z ? n + ' Trainings in 7 Tagen, geplant sind ' + z : n + ' von ' + z + ' Trainings in den letzten 7 Tagen' };
}
const ohneZahlen = { s: 'grau', d: 'In deinem Plan stehen keine Ernährungszahlen. Frag Devin danach.', still: true };
function tagGutEssen(t, w) {
  if (t.hk.includes('eiweiss') && t.hk.includes('gemuese')) return true;
  return t.n > 0 && !!(w.ziel && w.ziel.ew) && t.p >= w.ziel.ew[0];
}
export function bewerteEssen(w) {
  if (!w || !w.e) return ohneZahlen;
  if (!w.tage.some((t) => t.n > 0 || t.hk.includes('eiweiss') || t.hk.includes('gemuese'))) return { s: 'grau', d: 'Noch nichts eingetragen oder abgehakt.' };
  const gut = w.tage.filter((t) => tagGutEssen(t, w)).length;
  const zuWenig = !!(w.darf && w.ziel && w.ziel.kc > 0)
    && w.tage.filter((t) => t.n >= R.essen.zu_wenig_min_eintraege && t.k < w.ziel.kc * R.essen.zu_wenig_anteil).length >= R.essen.zu_wenig_ab_tagen;
  return { s: zuWenig ? schlechter(stufe(gut, R.essen.gruen_ab_tagen, R.essen.gelb_ab_tagen), 'gelb') : stufe(gut, R.essen.gruen_ab_tagen, R.essen.gelb_ab_tagen),
    d: gut + ' von 7 Tagen gut gegessen (genug Eiweiß' + (w.modus === 'teller' ? ' und Gemüse)' : ')'), zuWenig };
}
export function bewerteTrinken(w) {
  if (!w || !w.e) return ohneZahlen;
  const ziel = w.ziel && w.ziel.tr;
  if (!w.tage.some((t) => t.w > 0 || t.hk.includes('trinken'))) return { s: 'grau', d: 'Noch nichts eingetragen.' };
  const gut = w.tage.filter((t) => t.hk.includes('trinken') || (ziel > 0 && t.w >= ziel)).length;
  return { s: stufe(gut, R.trinken.gruen_ab_tagen, R.trinken.gelb_ab_tagen), d: gut + ' von 7 Tagen genug getrunken' };
}
export function bewerteSchlaf(c, jung) {
  if (!c) return { s: 'grau', d: 'Mach den Wochen-Check, dann steht hier dein Schlaf.' };
  const reg = jung ? R.schlaf.jugendliche : R.schlaf.erwachsene;
  const std = reg.gruen.includes(c.sh) ? 'gruen' : reg.gelb.includes(c.sh) ? 'gelb' : 'rot';
  const erholt = c.se <= R.schlaf.erholt_rot_bis ? 'rot' : c.se <= R.schlaf.erholt_gelb_bis ? 'gelb' : 'gruen';
  return { s: schlechter(std, erholt), d: R.schlaf.optionen[c.sh] + ' pro Nacht, erholt ' + c.se + ' von 5 (gut sind ' + reg.text + ')', std, erholt };
}
export function bewerteBefinden(c, schmerz) {
  const schmerzRot = typeof schmerz === 'number' && schmerz >= R.schmerz_training_rot_ab;
  const sz = schmerzRot ? 'Schmerz nach dem Training ' + schmerz + ' von 10' : '';
  if (!c) return schmerzRot ? { s: 'rot', d: sz, beschwerden: true } : { s: 'grau', d: 'Mach den Wochen-Check, dann steht hier, wie es dir geht.' };
  const m = (c.en + c.sm + (6 - c.sr)) / 3, beschwerden = c.bs === 1 || schmerzRot;
  return { s: beschwerden ? 'rot' : stufe(m, R.befinden.gruen_ab, R.befinden.gelb_ab),
    d: ['Energie ' + c.en, 'Stimmung ' + c.sm, 'Stress ' + c.sr + ' (je von 5)', c.bs === 1 ? 'Beschwerden' : '', sz].filter(Boolean).join(' · '),
    beschwerden, stimmungTief: c.sm <= R.befinden.stimmung_hilfe_bis };
}

/* ---------- Ein Tipp: zuerst Beschwerden und Stimmung, dann der schwächste Bereich ---------- */
export function tippWahl(b, faellig) {
  if (b.befinden.beschwerden) return 'beschwerden';
  if (b.befinden.stimmungTief) return 'stimmung';
  if (b.essen.zuWenig) return 'zu_wenig';
  const fuer = (id) => (id === 'schlaf' ? (b.schlaf.std === 'gruen' ? 'schlaf_erholt' : 'schlaf') : id === 'befinden' ? (b.befinden.s === 'rot' ? 'befinden' : 'befinden_gelb') : id);
  for (const s of ['rot', 'gelb']) for (const id of REIHE) if (b[id].s === s) return fuer(id);
  if (faellig || b.schlaf.s === 'grau' || b.befinden.s === 'grau') return 'check';
  const offen = REIHE.filter((id) => b[id].s === 'grau' && !b[id].still && id !== 'schlaf' && id !== 'befinden');
  if (REIHE.every((id) => b[id].s === 'grau')) return 'keine_daten';
  return offen.length ? offen[0] : 'alles_gruen';
}

// o: { plan, lies, training: { geschafft, geplant, jemals, schmerz }, jetzt? }
export function scan(o) {
  const jetzt = o.jetzt || Date.now(), p = o.plan, st = stand(o.lies(schluessel(p), null)), c = letzterCheck(st, jetzt);
  const w = essenWoche(p, o.lies, jetzt, G.tage), tr = o.training || null;
  const b = { training: bewerteTraining(tr), essen: bewerteEssen(w), trinken: bewerteTrinken(w),
    schlaf: bewerteSchlaf(c, !!(p && p.e && istJung(p.e))), befinden: bewerteBefinden(c, tr ? tr.schmerz : null) };
  const faellig = !c;
  return { b, check: c, faellig, tipp: tippWahl(b, faellig), checks: st.c, jung: !!(p && p.e && istJung(p.e)) };
}

/* ---------- Karte auf Heute ---------- */
function punkte(h, r) {
  return h('ul', { class: 'gs-punkte', 'aria-label': 'Ampel der letzten 7 Tage' }, G.bereiche.map((x) => {
    const s = r.b[x.id].s;
    return h('li', { class: 'gs-' + s, 'aria-label': x.name + ': ' + G.stufen[s] }, h('i', { 'aria-hidden': 'true', text: ZEICHEN[s] }), h('span', { 'aria-hidden': 'true', text: x.name }));
  }));
}
const devinKnopf = (o, klasse) => o.frage ? o.h('button', { class: klasse || 'knopf haupt', type: 'button', onclick: () => o.frage('Gesundheits-Scan: Ich habe gerade Beschwerden. '), text: 'Devin Bescheid sagen' }) : null;
export function kurzKarte(o) {
  const { h } = o, r = scan(o), t = G.tipps[r.tipp];
  return h('section', { class: 'block gs-karte', 'aria-labelledby': 'gs-karte-titel' },
    h('div', { class: 'woche-kopf' }, h('h2', { id: 'gs-karte-titel', text: 'Gesundheits-Scan' }),
      h('button', { class: 'knopf text klein', type: 'button', onclick: () => o.geh('gesund'), text: 'Ansehen' })),
    punkte(h, r),
    h('p', { class: 'gs-tipp-kurz' + (r.tipp === 'beschwerden' ? ' gs-wichtig' : '') }, h('b', { text: t.titel + '. ' }), t.text),
    h('div', { class: 'aktionen' },
      r.tipp === 'beschwerden' ? devinKnopf(o) : null,
      r.faellig ? h('button', { class: r.tipp === 'beschwerden' ? 'knopf' : 'knopf haupt', type: 'button', onclick: () => checkBlatt(o), text: 'Wochen-Check · 30 Sekunden' }) : null));
}

/* ---------- Eigene Seite ---------- */
export function ansicht(o) {
  const { h } = o, p = o.plan, r = scan(o), t = G.tipps[r.tipp];
  const teile = [h('div', { class: 'plan-kopf' }, h('h1', { text: 'Gesundheits-Scan' })),
    h('p', { class: 'leise gs-unter', text: 'Deine letzten 7 Tage auf einen Blick. ' + G.grenze })];
  if (p && p.id === 'beispiel') teile.push(h('p', { class: 'meldung klein', text: 'Beispielplan: Was du hier einträgst, bleibt nur auf diesem Handy.' }));
  if (r.b.befinden.beschwerden) teile.push(h('section', { class: 'block gs-warnung', role: 'note', 'aria-labelledby': 'gs-bs-titel' },
    h('h2', { id: 'gs-bs-titel', text: G.tipps.beschwerden.titel }), h('p', { text: G.tipps.beschwerden.text }), h('div', { class: 'aktionen' }, devinKnopf(o))));
  if (r.b.befinden.stimmungTief) teile.push(hilfeKarte(o));
  if (r.tipp !== 'beschwerden' && r.tipp !== 'stimmung') teile.push(h('section', { class: 'block gs-tipp', 'aria-labelledby': 'gs-tipp-titel' },
    h('small', { text: 'Dein Tipp für diese Woche' }), h('h2', { id: 'gs-tipp-titel', text: t.titel }), h('p', { text: t.text }),
    r.tipp === 'zu_wenig' ? h('div', { class: 'aktionen' }, devinKnopf(o, 'knopf')) : null));
  teile.push(h('section', { class: 'block gs-ampel', 'aria-labelledby': 'gs-ampel-titel' }, h('h2', { id: 'gs-ampel-titel', text: 'Deine Woche' }),
    h('ul', { class: 'gs-liste' }, G.bereiche.map((x) => {
      const b = r.b[x.id], ziel = x.id === 'training' ? () => o.geh('heute') : x.id === 'essen' || x.id === 'trinken' ? () => o.geh('essen') : () => checkBlatt(o);
      return h('li', null, h('button', { class: 'gs-zeile gs-' + b.s, type: 'button', onclick: ziel, 'aria-label': x.name + ': ' + G.stufen[b.s] + '. ' + b.d },
        h('i', { 'aria-hidden': 'true', text: ZEICHEN[b.s] }),
        h('span', { class: 'gs-zeile-text' }, h('span', { class: 'gs-zeile-kopf' }, h('b', { text: x.name }), h('span', { class: 'gs-wort', text: G.stufen[b.s] })), h('small', { text: b.d })),
        h('span', { class: 'gs-pfeil', 'aria-hidden': 'true', text: '›' })));
    }))));
  teile.push(h('section', { class: 'block gs-check', 'aria-labelledby': 'gs-check-titel' }, h('h2', { id: 'gs-check-titel', text: 'Wochen-Check' }),
    h('p', { class: 'leise klein', text: r.check ? 'Zuletzt: ' + tagKurz(r.check.t) + ' · Der nächste ist in ' + Math.max(1, G.check_alle_tage - Math.floor(((o.jetzt || Date.now()) - r.check.t) / TAG_MS)) + ' Tagen dran.'
      : 'Sechs kurze Fragen zu Schlaf und Befinden, etwa 30 Sekunden. Einmal pro Woche reicht.' }),
    h('button', { class: r.check ? 'knopf' : 'knopf haupt', type: 'button', onclick: () => checkBlatt(o), text: r.check ? 'Neu machen' : 'Wochen-Check machen' }),
    verlauf(h, r)));
  teile.push(h('section', { class: 'block gs-info' }, h('h2', { text: 'Gut zu wissen' }),
    h('ul', null,
      h('li', { text: G.grenze + ' Bei Beschwerden oder Fragen zur Gesundheit: Devin oder deine Ärztin oder dein Arzt.' }),
      h('li', { text: 'Training, Essen und Trinken kommen aus dem, was du in der App abhakst und einträgst. Fehlt etwas, ist die Ampel ungenau.' }),
      h('li', { text: 'Schlaf: Erwachsene brauchen mindestens 7 Stunden, Jugendliche 8 bis 10 Stunden (Amerikanische Akademie für Schlafmedizin).' }),
      h('li', { text: 'Was du im Wochen-Check einträgst, bleibt nur auf diesem Handy. Devin sieht es nur, wenn du ihm schreibst.' }),
      h('li', { text: G.hilfe.notruf }))));
  return teile;
}
function hilfeKarte(o) {
  const { h } = o, t = G.tipps.stimmung;
  return h('section', { class: 'block gs-hilfe', role: 'note', 'aria-labelledby': 'gs-hilfe-titel' }, h('h2', { id: 'gs-hilfe-titel', text: t.titel }), h('p', { text: t.text }),
    h('p', { text: 'Reden hilft, auch anonym (' + G.hilfe.land + '):' }),
    h('ul', { class: 'gs-telefone' }, G.hilfe.telefone.map((x) => h('li', null, h('a', { href: telLink(x.nummer), text: x.nummer }), h('span', { text: x.name + ', ' + x.wann })))),
    h('p', { class: 'leise klein', text: G.hilfe.notruf }));
}
function verlauf(h, r) {
  const alte = r.checks.slice(-4).reverse();
  if (!alte.length) return null;
  return h('ul', { class: 'gs-verlauf', 'aria-label': 'Deine letzten Checks' }, alte.map((c) => {
    const s = bewerteSchlaf(c, r.jung).s, b = bewerteBefinden(c, null).s;
    return h('li', null, h('span', { text: tagKurz(c.t) }),
      h('span', { class: 'gs-mini gs-' + s }, h('i', { 'aria-hidden': 'true', text: ZEICHEN[s] }), 'Schlaf: ' + G.stufen[s]),
      h('span', { class: 'gs-mini gs-' + b }, h('i', { 'aria-hidden': 'true', text: ZEICHEN[b] }), 'Befinden: ' + G.stufen[b]));
  }));
}

/* ---------- Wochen-Check (Blatt von unten): sechs Fragen, große Knöpfe ---------- */
export function checkBlatt(o) {
  const { h } = o, antw = {}, F = G.fragen;
  const speichern = h('button', { class: 'knopf haupt', type: 'button', disabled: true, text: 'Speichern' });
  const fehlt = () => F.filter((f) => antw[f.id] == null).length;
  const hinweis = h('p', { class: 'leise klein', role: 'status', text: 'Noch ' + F.length + ' Fragen offen.' });
  const pruefe = () => { const n = fehlt(); speichern.disabled = n > 0; hinweis.textContent = n ? 'Noch ' + n + (n === 1 ? ' Frage offen.' : ' Fragen offen.') : 'Fertig. Tippe auf Speichern.'; };
  const frage = (f, i) => {
    const werte = f.art === 'schlaf' ? R.schlaf.optionen.map((t, k) => [k, t]) : f.art === 'janein' ? [[0, 'Nein'], [1, 'Ja']] : [1, 2, 3, 4, 5].map((k) => [k, String(k)]);
    const wahl = h('div', { class: 'gs-wahl gs-wahl-' + (f.art || 'skala'), role: 'group', 'aria-labelledby': 'gs-f-' + f.id });
    const zeichnen = () => wahl.replaceChildren(...werte.map(([v, t]) => h('button', { type: 'button', class: 'gs-wert', 'aria-pressed': String(antw[f.id] === v),
      'aria-label': f.art ? t : t + ' von 5', onclick: () => { antw[f.id] = v; zeichnen(); pruefe(); }, text: t })));
    zeichnen();
    return h('div', { class: 'blatt-abschnitt gs-frage' }, h('b', { id: 'gs-f-' + f.id, text: (i + 1) + '. ' + f.frage }),
      f.links ? h('small', { class: 'leise', text: f.links + ', ' + f.rechts }) : null, wahl);
  };
  speichern.addEventListener('click', () => {
    if (fehlt()) return;
    const c = checkSauber(Object.assign({ t: Date.now() }, antw));
    if (!c) return;
    if (!o.schreib(schluessel(o.plan), mitCheck(stand(o.lies(schluessel(o.plan), null)), c))) { o.toast('Konnte nicht speichern: Der Speicher auf diesem Handy ist voll.'); return; }
    o.blattZu();
    o.toast(c.bs === 1 ? 'Gespeichert. Sag Devin wegen deiner Beschwerden Bescheid.' : 'Gespeichert');
    o.neu();
  });
  o.blatt('Wochen-Check', 'Schlaf und Befinden · etwa 30 Sekunden', [h('div', { class: 'gs-blatt' }, F.map(frage), hinweis, speichern,
    h('p', { class: 'leise klein', text: 'Bleibt nur auf diesem Handy. ' + G.grenze }))]);
}
