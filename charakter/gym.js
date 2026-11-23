// DK Coach — Die gewählte Figur in 3D (eigener Charakter oder Skin). Figur, Bewegungen und Gym laufen aus diesem Ordner als eigene Kopie: Die normale Übungsfigur der App bleibt davon unberührt, und sie behält ihre eigene Hautkarte.
// Erst wird alles geladen, dann öffnet sich das Gym. Geht dabei etwas schief (zum Beispiel ohne Internet, wenn der Ordner noch nie geladen war), nimmt die App ihr normales Gym.
// Figur überall (23.11.2026, Devin: „dass es alles so eine Connection hat“): Dieselbe Kopie zeigt die Figur auch beim Training ohne Gym, in den Übungs-Blättern und in den Vorschaubildern (lade3d).
// Ist eine Figur gewählt, lädt die App die normale Kopie gar nicht erst: So liegt am Handy immer nur eine Kopie der 3D-Dateien im Speicher (vorher waren es im Gym zwei).
// Jede neue 3D-Ansicht bekommt die Figur gleich beim Bauen. Alle Ansichten dieser Kopie zeigen dieselbe Figur (Maße und Form gelten für die ganze Kopie).
const KOERPER = '3d/koerper.bin';
const DATEIEN = ['kunde.html', 'studio.jpg', 'charakter.js', 'frisur.js', 'kleidung.js', 'koerperform.js', 'fotomass.js', 'gesicht.js', 'gesicht-ref.js', 'kurzform.js', 'spielfigur.js', 'stand.js',
  '3d/raum.js', '3d/figur.js', '3d/figur-modell.js', '3d/einleitung.js', '3d/bewegungen.js', '3d/posen.js', '3d/spieltag.js', '3d/buehne.js', '3d/coach.js', '3d/vendor/OrbitControls.js', KOERPER, '3d/koerper-haut.jpg', '3d/koerper-haut-n.jpg', '3d/koerper-haar.jpg', '3d/koerper-augen.jpg'];
const kopie = (o) => JSON.parse(JSON.stringify(o));
let basis = null, mods = null;
// Einmal je Seite: die Module dieser Kopie und der Körper. Klappt es nicht, beim nächsten Mal neu versuchen
function laden() {
  if (!mods) mods = Promise.all([import('./3d/figur.js'), import('./3d/figur-modell.js'), import('./3d/bewegungen.js'), import('./3d/posen.js'), import('./spielfigur.js'), import('./kurzform.js')])
    .then(async ([fig, modell, be, posen, sp, ku]) => {
      await modell.ladeKoerper(new URL(KOERPER, import.meta.url).href);
      if (!basis) basis = { BAU: kopie(modell.BAU), MASS: kopie(fig.MASS) };   // vor dem ersten Anpassen: Jede Ansicht rechnet wieder von der Grundfigur aus
      return { fig, modell, be, posen, sp, ku };
    })
    .catch((e) => { mods = null; throw e; });
  return mods;
}
// Die Figur (c: Kurzform wie im Konto, kurzform.packen) auf eine Ansicht bringen. Gibt die Form zurück (für die Haltung im Gym)
function anwenden(m, ansicht, c) {
  const t0 = performance.now(), form = m.sp.ausDaten(ansicht, m.ku.auspacken(c), { basis, BAU: m.modell.BAU, MASS: m.fig.MASS, gelenke: m.fig.gelenke, messHaltung: m.posen.messHaltung });
  window.dkFigur = { name: c.n || '', kg: Array.isArray(c.z) ? c.z[1] : null, ms: Math.round(performance.now() - t0), anzahl: ((window.dkFigur && window.dkFigur.anzahl) || 0) + 1, hut: !!(ansicht.figur.hut && !ansicht.figur.ohneHut) };   // für Prüfungen: welche Figur zuletzt gebaut wurde
  return form;
}
// Für die Bühne (Training ohne Gym, Übungs-Blätter, Vorschaubilder): dieselben Module wie lade3d() in app.js, nur baut jede Ansicht gleich die Figur c
export async function lade3d(c) {
  const m = await laden();
  class Ansicht extends m.fig.Ansicht { constructor(canvas, opt) { super(canvas, opt); anwenden(m, this, c); } }
  return { ...m.fig, ...m.be, Ansicht };
}
// Das Gym. o: was raumOeffnen braucht, ohne lade3d, dazu name
export async function oeffnen(c, o) {
  const [raum, m] = await Promise.all([import('./3d/raum.js'), laden()]);
  let haltung = () => {};
  return raum.raumOeffnen({ ...o, lade3d: async () => ({ ...m.fig, ...m.be }), spieler: {
    name: o.name,
    haltung: (p, w) => haltung(p, w),
    bauen: (a) => { window.dkGym = a; haltung = m.sp.haltung(anwenden(m, a, c)); }
  } });
}
// Wer eine Figur gewählt hat, soll sie auch ohne Internet dabeihaben: einmal alles laden, der Offline-Speicher behält es
export function vorladen() { for (const f of DATEIEN) fetch(new URL(f, import.meta.url)).catch(() => {}); }
