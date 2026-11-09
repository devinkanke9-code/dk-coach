// DK Coach — PR-Raum (09.11.2026, Devin: „eine Tür … einen anderen Raum … eine Bank und Squat Rack und noch eine Stange auf dem Boden … das sind meine PRs, heute werde ich einen brechen“).
// Die Halle selbst ist raum.js (mit dem eigenen Charakter, wenn es einen gibt). Hier stehen nur die drei Stationen und die Karte zum Eintragen. Bestleistungen geben keine Punkte und keine Medaillen.
import * as B from './bestleistung.js';
import * as Spiel from './spiel.js';
import { formular, stangeBild, wertText } from './rang.js';

const REIHE = ['langhantel_bankdruecken', 'kniebeuge', 'kreuzheben'];   // erst die Bank, dann das Rack, dann die Stange auf dem Boden

// c: { h, UEBUNGEN, plan, toast, datum, starte(wie) → Promise des Raums, ausgang, beiZu() }
export async function oeffnen(c) {
  const h = c.h, st = Spiel.status(), min = B.minWdh(c.plan && c.plan.m);
  const alle = () => B.stand();
  const eintrag = (id) => alle().find((x) => x.id === id);
  let raum = null;
  const uebungen = REIHE.map((id) => {
    const x = eintrag(id);
    return { id, name: x.name, d: c.UEBUNGEN[id] || { n: x.name, m: [] }, dosis: '', pause: '', fertig: false, scheiben: x.beste ? B.scheiben(x.beste.kg).proSeite : null, wert: x.beste ? wertText(x.beste) : 'Noch offen' };
  });
  function karte(i, ort) {
    const id = REIHE[i], x = eintrag(id), d = uebungen[i].d;
    ort.textContent = '';
    const sauber = (d.t || []).slice(0, 3);
    ort.append(
      h('div', { class: 'pr-raum-wert' }, h('small', { text: 'Dein PR' }), h('b', { text: x.beste ? wertText(x.beste) : 'Noch offen' })),
      x.beste ? stangeBild(h, x.beste.kg) : '',
      x.beste ? h('p', { class: 'klein leise pr-text', text: B.scheibenText(x.beste.kg) }) : '',
      formular(c, x, min, {
        knopf: 'PR eintragen',
        beiKg: (kg) => { if (raum) raum.scheibenSetzen(i, B.scheiben(kg).proSeite); },   // beim Tippen liegen die Scheiben schon auf der Stange
        beiNeu: (r) => {
          if (raum) { raum.scheibenSetzen(i, B.scheiben(r.beste.kg).proSeite, wertText(r.beste)); raum.jubel('Neuer PR', x.name + ' ' + wertText(r.beste)); raum.karteRunter(); }
          karte(i, ort);
        }
      }),
      h('button', { class: 'knopf klein', type: 'button', onclick: () => raum && raum.karteRunter(), text: 'Ausführung ansehen' }),
      sauber.length ? h('ul', { class: 'pr-raum-tipps' }, sauber.map((t) => h('li', { text: t }))) : '',
      h('p', { class: 'klein leise', text: 'PRs bringen keine Punkte und keine Medaillen. Die gibt es nur fürs Training.' }));
  }
  raum = await c.starte({
    titel: 'PR-Raum', uebungen, beiStation: karte, beiStationWeg: () => {}, beiZu: () => c.beiZu(),
    pr: { rang: 'Rang ' + st.level + ' · ' + st.titel, titel: st.titel, level: st.level, ausgang: c.ausgang || 'Zurück' }
  });
  return raum;
}
