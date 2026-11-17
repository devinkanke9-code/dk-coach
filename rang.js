// DK Coach — Seite „Rang“: Punkte, Ränge und Bestleistungen mit Scheiben und Figur (09.11.2026).
// Nur Anzeige. Die Regeln stehen in spiel.js und bestleistung.js. Alles bleibt auf dem Handy, Texte kommen nur als textContent in die Seite.
import * as Spiel from './spiel.js';
import * as B from './bestleistung.js';
import * as Medaille from './medaille.js';

const komma = (x) => String(x).replace('.', ',');
const offen = { form: null };
export function aufraeumen() { offen.form = null; }
export const wertText = (b) => komma(b.kg) + ' kg × ' + b.w;

// Rang mit Medaille (16.11.2026): runde Medaille mit Band statt Wappen. Metall und Band je Rang wie bei den 3D-Medaillen (medaille.js). zu: noch nicht erreicht.
const BAND = { 1: ['#3F4652', '#A7B0BD'], 2: ['#6B3E1C', '#D8A06A'], 3: ['#2C2F36', '#8E939C'], 4: ['#39424E', '#C5CFDA'], 5: ['#22344A', '#8FB4DA'],
  6: ['#4B5563', '#F2F5F9'], 7: ['#7A1E2E', '#F7DE93'], 8: ['#26324A', '#E8E8E4'], 9: ['#123B5C', '#A7E6FF'], 10: ['#17151C', '#8B5CF6'] };
export function wappen(h, nr, gross, zu) {
  const b = BAND[nr] || BAND[1];
  return h('div', { class: 'rang-wappen rm t' + nr + (gross ? ' gross' : '') + (zu ? ' zu' : ''), style: '--band1:' + b[0] + ';--band2:' + b[1], 'aria-hidden': 'true' },
    h('i', { class: 'rm-band' }), h('span', { class: 'rm-scheibe' }, h('b', { text: String(nr) })));
}
// Kleiner Level-Weg: 10 Punkte, erreichte in Farbe, der aktuelle leuchtet
const wegKlein = (h, level) => h('div', { class: 'rm-weg', 'aria-hidden': 'true' }, Spiel.LEVEL.map((l, i) => h('i', { class: 't' + (i + 1) + (i + 1 < level ? ' da' : i + 1 === level ? ' jetzt' : '') })));
const balken = (h, anteil) => h('div', { class: 'rang-balken', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.round(Math.max(0, Math.min(1, anteil)) * 100) + '%' }));
const punkteWort = (n) => n + (n === 1 ? ' Punkt' : ' Punkte');

// Kleine Karte auf „Heute“: tippen öffnet die Rang-Seite. Feinschliff (10.11.2026): darunter steht, wie viel bis zum nächsten Rang fehlt
export function kurzKarte(c) {
  const h = c.h, st = Spiel.status(), max = Spiel.LEVEL.length;
  return h('button', { class: 'rang-kurz rm-karte', type: 'button', onclick: c.oeffnen, 'aria-label': 'Rang ' + st.level + ' von ' + max + ', ' + st.titel + ', ' + punkteWort(st.punkte) },
    h('span', { class: 'rm-oben' }, wappen(h, st.level),
      h('span', { class: 'rang-kurz-text' }, h('small', { class: 'rm-stufe', text: 'Rang ' + st.level + ' von ' + max }), h('b', { text: st.titel })),
      h('span', { class: 'rang-kurz-pkt' }, h('b', { text: String(st.punkte) }), h('small', { text: 'Punkte' }))),
    h('span', { class: 'rm-ziel' }, balken(h, st.anteil), st.level < max ? wappen(h, st.level + 1, false, true) : null),
    h('small', { class: 'rang-kurz-ziel', text: st.naechstes ? 'Noch ' + punkteWort(st.naechstes.fehlt) + ' bis „' + st.naechstes.titel + '“' : 'Ganz oben angekommen' }),
    wegKlein(h, st.level));
}

// Großer Moment beim Aufstieg: legt sich über alles, tippen schließt
export function aufstiegZeigen(h, a, lade3d) {
  if (!a || !a.titel) return;
  try { if (window.DKGefuehl) window.DKGefuehl.spiel('aufstieg'); } catch (e) { /* Töne und Vibration (10.11.2026): Fanfare und Applaus */ }
  if (lade3d && Medaille.hatMedaille(a.level)) { const l = Spiel.LEVEL[a.level - 1]; Medaille.zeigen({ h, lade3d, nr: a.level, titel: a.titel, ab: l ? l.ab : 0, neu: true }); return; }
  const alt = document.querySelector('.rang-auf'); if (alt) alt.remove();
  const el = h('div', { class: 'rang-auf', role: 'dialog', 'aria-label': 'Neuer Rang: ' + a.titel, onclick: () => el.remove() },
    h('div', { class: 'rang-strahlen', 'aria-hidden': 'true' }),
    wappen(h, a.level, true),
    h('small', { text: 'Neuer Rang' }),
    h('h1', { text: a.titel }),
    h('p', { text: 'Antippen zum Weitermachen' }));
  document.body.append(el);
}

export function stangeBild(h, kg) {
  const x = B.scheiben(kg), teil = () => x.proSeite.map((s) => h('i', { class: 'pl pl' + String(s).replace('.', '_') }));
  return h('div', { class: 'pr-stange', 'aria-hidden': 'true' }, h('span', { class: 'pr-seite' }, teil().reverse()), h('span', { class: 'pr-mitte' }), h('span', { class: 'pr-seite' }, teil()));
}

export function formular(c, u, min, opt = {}) {
  const h = c.h;
  const sicherBox = h('input', { type: 'checkbox', 'aria-label': 'Sicherheit bestätigen' });
  const sicherZeile = h('label', { class: 'pr-sicher' }, sicherBox, h('span', { text: 'Mit Sicherung oder Spotter, aufgewärmt und mindestens 5 Stunden geschlafen. Auf eigene Verantwortung.' }));
  sicherZeile.hidden = true;
  let uhrKg = null;
  const kgZahl = () => Number(String(kg.value).replace(',', '.').trim()), wZahl = () => Number(String(wdh.value).trim());
  const passeSicher = () => { const w = wZahl(); sicherZeile.hidden = !(Number.isInteger(w) && w >= 1 && w <= B.SCHWER_BIS_WDH); };
  const passeKg = () => { if (!opt.beiKg) return; clearTimeout(uhrKg); uhrKg = setTimeout(() => { const z = kgZahl(); if (Number.isFinite(z) && z >= B.STANGE && z <= 500) opt.beiKg(z); }, 350); };
  const kg = h('input', { class: 'eingabe', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', 'aria-label': 'Gewicht in kg', oninput: passeKg });
  const wdh = h('input', { class: 'eingabe', inputmode: 'numeric', autocomplete: 'off', placeholder: min === 1 ? 'Wdh' : 'ab ' + min, 'aria-label': 'Wiederholungen', oninput: passeSicher });
  const meldung = h('p', { class: 'klein pr-meldung', role: 'status' });
  const speichern = () => {
    const r = B.eintragen({ id: u.id, kg: kgZahl(), wdh: wZahl(), min, datum: c.datum(), sicher: sicherBox.checked });
    if (r.ok && r.neu) { offen.form = null; c.toast('Neuer PR: ' + u.name + ' ' + komma(r.beste.kg) + ' kg'); if (opt.beiNeu) opt.beiNeu(r); else c.neu(); return; }
    meldung.textContent = r.ok ? 'Deine Bestleistung ist höher: ' + komma(r.beste.kg) + ' kg × ' + r.beste.w + '. Die bleibt stehen.'
      : r.grund === 'wdh' ? 'Das zählt ab ' + r.min + ' Wiederholungen. Ein einzelner Maximalversuch ist in deinem Plan gerade nicht freigegeben.'
      : r.grund === 'sicher' ? 'So schwere Sätze nur mit Sicherung. Bitte das Kästchen oben bestätigen.'
      : r.grund === 'kg' ? 'Bitte das Gewicht zwischen 20 und 500 kg eintragen, in Schritten von 0,25 kg.' : 'Das hat gerade nicht geklappt. Versuch es bitte noch einmal.';
  };
  return h('div', { class: 'pr-form' },
    h('div', { class: 'tm-eingabe' }, h('label', null, kg, h('span', { text: 'kg' })), h('label', null, wdh, h('span', { text: 'Wdh' }))),
    sicherZeile,
    h('button', { class: 'knopf haupt', type: 'button', onclick: speichern, text: opt.knopf || 'Eintragen' }), meldung);
}

function karte(c, x, min) {
  const h = c.h, kg = x.beste && x.beste.kg;
  const kinder = [
    h('div', { class: 'pr-kopf' }, h('b', { text: x.name }),
      x.beste ? h('span', { class: 'pr-wert' }, h('b', { text: komma(kg) }), ' kg × ' + x.beste.w) : h('span', { class: 'pr-wert leise', text: 'noch offen' }))
  ];
  if (x.beste) {
    const y = B.scheiben(kg);
    kinder.push(stangeBild(h, kg), h('p', { class: 'klein leise pr-text', text: B.scheibenText(kg) + (y.rest > 0 ? ' · ' + komma(y.rest) + ' kg je Seite passen auf keine Scheibe' : '') }));
  }
  if (c.ohne3d()) {   // Der Raum lädt nicht (zum Beispiel altes Handy): eintragen geht trotzdem
    kinder.push(h('div', { class: 'aktionen' }, h('button', { class: 'knopf klein', type: 'button', onclick: () => { offen.form = offen.form === x.id ? null : x.id; c.neu(); }, text: offen.form === x.id ? 'Abbrechen' : 'Eintragen' })));
    if (offen.form === x.id) kinder.push(formular(c, x, min));
  }
  return h('div', { class: 'pr-karte' }, kinder);
}

export function ansicht(c) {
  const h = c.h, st = Spiel.status(), min = B.minWdh(c.plan && c.plan.m), P = Spiel.PUNKTE;
  const held = h('section', { class: 'block rang-held' },
    wappen(h, st.level, true),
    h('small', { text: 'Rang ' + st.level + ' von ' + Spiel.LEVEL.length }),
    h('h1', { text: st.titel }),
    h('div', { class: 'rang-pkt' }, h('b', { text: String(st.punkte) }), ' Punkte'),
    balken(h, st.anteil),
    h('p', { class: 'klein leise', text: st.naechstes ? 'Noch ' + punkteWort(st.naechstes.fehlt) + ' bis „' + st.naechstes.titel + '“' : 'Du bist ganz oben angekommen.' }),
    h('div', { class: 'rang-zahlen' },
      h('div', null, h('b', { text: String(st.einheiten) }), h('small', { text: st.einheiten === 1 ? 'Training' : 'Trainings' })),
      h('div', null, h('b', { text: String(st.serieWochen) }), h('small', { text: 'Wochen-Serie' })),
      h('div', null, h('b', { text: st.dieseWoche + '/' + st.wochenZiel }), h('small', { text: 'Diese Woche' }))));
  const regeln = h('section', { class: 'block' }, h('h2', { text: 'So sammelst du Punkte' }),
    h('ul', { class: 'rang-regeln' }, [
      ['+' + P.station, 'je fertige Übung, wenn sie mindestens ' + P.mindestSekunden + ' Sekunden gelaufen ist'],
      ['+' + P.einheit, 'für das ganze Training'],
      ['+' + P.alleSaetze, 'wenn du jeden Satz gemacht hast'],
      ['+' + P.wochenZiel, 'wenn dein Wochenziel geschafft ist']
    ].map(([z, t]) => h('li', null, h('b', { text: z }), h('span', { text: t })))),
    h('p', { class: 'klein leise', text: 'Punkte gehen nie verloren. Mehr Gewicht bringt keine Extrapunkte: Dein Körper geht vor.' }));
  const medaillen = h('section', { class: 'block' }, h('h2', { text: 'Deine Medaillen' }),
    h('div', { class: 'med-regal' }, Spiel.LEVEL.map((l, i) => {
      const nr = i + 1; if (!Medaille.hatMedaille(nr)) return null;
      const da = nr <= st.level;
      return h('button', { class: 'med-fach' + (da ? ' da' : ''), type: 'button', disabled: !da, 'aria-label': da ? 'Medaille ' + l.titel + ' ansehen' : l.titel + ': gesperrt, ab ' + l.ab + ' Punkten', onclick: () => Medaille.zeigen({ h, lade3d: c.lade3d, nr, titel: l.titel, ab: l.ab }) },
        wappen(h, nr, false, !da), h('b', { text: l.titel }), h('small', { text: da ? 'Ansehen' : 'ab ' + l.ab }));
    })),
    h('p', { class: 'klein leise', text: 'Medaillen gibt es nur fürs Training: Jeder neue Rang bringt eine.' }));
  // Dein Weg (Rang mit Medaille (16.11.2026)): von unten nach oben, erreichte Medaillen in Farbe, die aktuelle leuchtet, die nächsten zeigen, ab wie vielen Punkten
  const leiter = h('section', { class: 'block rm-pfad-block' }, h('h2', { text: 'Dein Weg nach oben' }),
    h('ol', { class: 'rang-leiter rm-pfad' }, Spiel.LEVEL.map((l, i) => {
      const nr = i + 1, jetzt = nr === st.level, drin = nr <= st.level;
      return h('li', { class: (jetzt ? 'jetzt ' : '') + (drin ? 'drin' : 'zu') }, wappen(h, nr, false, !drin),
        h('span', { class: 'rm-pfad-text' }, h('b', { text: l.titel }), h('span', { class: 'klein leise', text: jetzt ? 'Hier bist du' + (st.naechstes ? ' · noch ' + punkteWort(st.naechstes.fehlt) : '') : drin ? 'Geschafft' : 'ab ' + l.ab + ' Punkten' })),
        jetzt ? balken(h, st.anteil) : null);
    }).reverse()));
  const pr = h('section', { class: 'block' }, h('h2', { text: 'Deine PRs' }),
    h('button', { class: 'knopf haupt', type: 'button', onclick: c.prRaum, text: 'In den PR-Raum' }),
    h('div', { class: 'stapel' }, B.stand().map((x) => karte(c, x, min))),
    h('p', { class: 'klein leise pr-hinweis', text: (min === 1 ? 'Auch ein einzelner Maximalversuch zählt, wenn du willst. Das ist deine Entscheidung.' : 'Es zählt dein bester sauberer Satz ab ' + min + ' Wiederholungen. Einzelne Maximalversuche sind in deinem Plan nicht freigegeben.') + ' Sätze aus dem Training trägt die App selbst ein. Schwere Sätze nur mit Sicherung oder jemandem, der aufpasst. PRs bringen keine Punkte.' }));
  return [c.kopf('Rang'), held, leiter, medaillen, pr, regeln];
}
