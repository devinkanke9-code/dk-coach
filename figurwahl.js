// DK Coach — Welche Figur trainiert (23.11.2026). Devin: „Der Status, wenn du den einstellst, dein Skin einstellst, siehst du den nicht, wenn du in den Gym gehst …
// dass es alles so eine Connection hat, damit das alles zusammenarbeitet in der App.“ und „du hast den Skin dir erstellt, aber dann wird er nicht gespeichert“.
// Eine Wahl gilt für den Kunden überall: im Gym (alle Wege hinein), an der Station, beim Training ohne Gym und in den Übungs-Blättern.
// Nur Rechnen und Speichern, keine 3D-Datei. Die Figur selbst baut charakter/gym.js. Gespeichert wird nur auf diesem Handy:
//   dk_figur_<Konto>        Wahl unter Status für dieses Konto: { f: 'eigen' | 'standard' | Skin-id, e: Kennung von Devins Charakter, den der Kunde zuletzt gesehen hat }
//   dk_figur                letzte Wahl auf diesem Handy: Rückfall ohne Plan, im Beispiel und für Konten ohne eigene Wahl und ohne Charakter von Devin
//   dk_meine_figur_<Konto>  was der Kunde auf „Mein Charakter“ eingestellt hat: { basis: Devins Charakter, von dem er ausging, von: Kennung des Charakters von Devin,
//                           den er zuletzt gesehen hat, wahl: { stand, monate, fett } oder null, c: die Figur fürs Gym (Kurzform wie ko.c), t }
// Neue Figur von Devin (Entscheidung 23.11.2026): Hat der Kunde selbst etwas gewählt oder eingestellt, wird nichts still überschrieben. Er sieht einmal einen Hinweis
// mit „Neue Figur von deinem Coach übernehmen“ oder „Meine behalten“. Hat er nie etwas eingestellt, nimmt die App Devins neue Figur einfach.
// Vor dem 23.11.2026 galt die Wahl je Plan (dk_figur_beispiel war eine eigene Wahl), und ein neuer Charakter von Devin war sofort gewählt.
import { SKINS, kennung } from './status.js';

const WAHL = 'dk_figur', WAHL_K = (k) => 'dk_figur_' + k.id, MEINE = (k) => 'dk_meine_figur_' + k.id;
const kurz = (c) => c && typeof c === 'object' && c.v === 1 && Array.isArray(c.z);
const gueltig = (w) => (w && typeof w === 'object' && typeof w.f === 'string' && (w.f === 'eigen' || w.f === 'standard' || SKINS.some((s) => s.id === w.f)) ? w : null);
const kopie = (o) => JSON.parse(JSON.stringify(o));
const zahl1 = (x) => Math.round(x * 10) / 10;

// Das Konto, um das es geht: beim Plan eines Kontos dieses, im Beispiel und ohne Plan das angemeldete Konto (derselbe Kunde)
export function kontoFuer(plan, konto) {
  if (!konto) return null;
  return !plan || plan.id === 'beispiel' || plan.id === konto.id ? konto : null;
}
function meineLesen(lies, k) { const r = k ? lies(MEINE(k), null) : null; return r && typeof r === 'object' && kurz(r.c) && kurz(r.basis) ? r : null; }

// Die eigene Figur des Kunden: was er auf „Mein Charakter“ eingestellt hat, sonst Devins Charakter. o: { plan, konto, lies, gewicht }
// → { c, devin (Devins Charakter), basis (davon geht „Mein Charakter“ aus), wahl, notiz, neu (Devin hat inzwischen eine neue geschickt) } oder { c: null }
// o.gewicht (Anschluss für später, Status-Feld „Dein Gewicht heute“, dk_gewicht_<Plan>.kg): ersetzt das Gewicht der Figur, solange auf „Mein Charakter“ „Jetzt“ gilt.
// Mit Minimum, Maximum oder Regler bleibt deren Gewicht. Ohne o.gewicht bleibt alles beim Gewicht aus der Figur
export function eigene(o) {
  const k = kontoFuer(o.plan, o.konto), devin = k && kurz(k.c) ? k.c : null;
  if (!devin) return { c: null };
  const r = meineLesen(o.lies, k), kd = kennung(devin), g = typeof o.gewicht === 'number' && o.gewicht >= 35 && o.gewicht <= 200 ? zahl1(o.gewicht) : null;
  const heute = (c) => { if (g == null) return c; const n = kopie(c); n.z = (n.z || []).slice(); while (n.z.length < 2) n.z.push(null); n.z[1] = g; return n; };
  if (!r) return { c: heute(devin), devin, basis: devin, wahl: null, notiz: '', neu: false };
  return { c: r.wahl ? r.c : heute(r.c), devin, basis: r.basis, wahl: r.wahl || null, notiz: notizVon(r.wahl), neu: r.von !== kd };
}
function notizVon(w) {
  if (!w) return '';
  if (w.stand === 'regler') return 'Auf „Mein Charakter“ eingestellt: Körperfett ' + Math.round(w.fett) + ' %.';
  const m = w.monate === 1 ? '1 Monat' : w.monate + ' Monaten';
  return 'Auf „Mein Charakter“ eingestellt: ' + (w.stand === 'min' ? 'Minimum' : 'Maximum') + ' in ' + m + '.';
}

// Wer trainiert jetzt? o: { plan, konto, lies } → { id, c, name, eigen, neu } (c = null: die normale Figur der App; neu: 'eigen' oder 'wahl', wenn der Hinweis kommt)
export function jetzt(o) {
  const k = kontoFuer(o.plan, o.konto), ei = eigene(o), devin = ei.devin || null;
  const fig = { id: 'eigen', c: ei.c, name: 'Dein Charakter', eigen: true, neu: ei.neu ? 'eigen' : null };
  let w = k ? gueltig(o.lies(WAHL_K(k), null)) : null;
  const eigeneWahl = !!w;
  if (!w && !devin) w = gueltig(o.lies(WAHL, null)) || gueltig(o.lies('dk_figur_beispiel', null));   // dk_figur_beispiel: Wahl im Beispiel vor dem 23.11.2026
  if (devin && (!w || w.f === 'eigen')) return fig;   // ohne eigene Wahl wie bisher: Devins Charakter
  const neu = devin && eigeneWahl && w.e !== kennung(devin) ? 'wahl' : null;   // Devin hat eine (neue) Figur geschickt, seit der Kunde gewählt hat
  const s = w ? SKINS.find((x) => x.id === w.f) : null;
  return s ? { id: s.id, c: s.c, name: s.name, eigen: false, neu } : { id: 'standard', c: null, name: 'Standard', eigen: false, neu };
}

// Wahl unter Status (oder „Im Gym spielen“ auf „Mein Charakter“). o: { plan, konto, lies, schreib }
export function waehlen(o, id) {
  const k = kontoFuer(o.plan, o.konto), devin = k && kurz(k.c) ? k.c : null;
  if (k) o.schreib(WAHL_K(k), { f: id, e: kennung(devin) });
  o.schreib(WAHL, { f: id });
}

// Hinweis „Neue Figur von Devin“: übernehmen = Devins neuer Charakter trainiert (das Eingestellte ist weg), behalten = alles bleibt, der Hinweis kommt für diese Figur nicht wieder
export function uebernehmen(o) {
  const k = kontoFuer(o.plan, o.konto); if (!k) return;
  o.schreib(MEINE(k), null);
  waehlen(o, 'eigen');
}
export function behalten(o) {
  const k = kontoFuer(o.plan, o.konto), devin = k && kurz(k.c) ? k.c : null; if (!devin) return;
  const kd = kennung(devin), w = gueltig(o.lies(WAHL_K(k), null)), r = meineLesen(o.lies, k);
  if (w && w.e !== kd) o.schreib(WAHL_K(k), Object.assign({}, w, { e: kd }));
  if (r && r.von !== kd) o.schreib(MEINE(k), Object.assign({}, r, { von: kd }));
}

// Von „Mein Charakter“: das Eingestellte speichern. o: { lies, schreib, konto, wahl ({ stand, monate, fett } oder null für „Jetzt“), gewicht, fett }
// Die Figur fürs Gym ist der Ausgangs-Charakter mit dem Gewicht und dem Körperfett, die die Seite gerade zeigt. Gibt true zurück, wenn sich etwas geändert hat
export function meineSpeichern(o) {
  const k = o.konto, devin = k && kurz(k.c) ? k.c : null; if (!devin) return false;
  const vorher = meineLesen(o.lies, k), basis = vorher ? vorher.basis : devin, kd = kennung(devin);
  let neu = null;
  if (o.wahl) {
    const c = kopie(basis); c.z = (c.z || []).slice(); while (c.z.length < 3) c.z.push(null);
    c.z[1] = zahl1(o.gewicht); c.z[2] = zahl1(o.fett);
    neu = { basis, von: vorher ? vorher.von : kd, wahl: o.wahl, c, t: Date.now() };
  } else if (vorher && kennung(basis) !== kd) neu = { basis, von: vorher.von, wahl: null, c: basis, t: Date.now() };   // „Jetzt“ mit behaltener älterer Figur: die bleibt
  const gleich = JSON.stringify(vorher && { b: kennung(vorher.basis), w: vorher.wahl, c: kennung(vorher.c) }) === JSON.stringify(neu && { b: kennung(neu.basis), w: neu.wahl, c: kennung(neu.c) });
  if (!gleich) o.schreib(MEINE(k), neu);
  return !gleich;
}

// Karte „Neue Figur von Devin“ (für Heute und Status). o: { h, f (aus jetzt), ja, nein }
export function hinweisKarte(o) {
  const { h, f } = o;
  if (!f || !f.neu) return null;
  const text = f.neu === 'eigen' ? 'Devin hat deinen Charakter neu gebaut. Gerade trainiert noch die Figur, die du auf „Mein Charakter“ eingestellt hast.'
    : 'Devin hat dir eine neue Figur gebaut. Gerade trainiert noch deine Wahl: ' + f.name + '.';
  return h('section', { class: 'block figur-neu' }, h('h2', { text: 'Neue Figur von Devin' }), h('p', { class: 'klein', text }),
    h('div', { class: 'stapel' },
      h('button', { class: 'knopf haupt', type: 'button', onclick: o.ja, text: 'Neue Figur von deinem Coach übernehmen' }),
      h('button', { class: 'knopf', type: 'button', onclick: o.nein, text: 'Meine behalten' })));
}
