// DK Coach — Das Gym der App mit dem eigenen Charakter. Figur, Bewegungen und Gym laufen aus diesem Ordner als eigene Kopie: Die normale Übungsfigur der App bleibt davon unberührt, und sie behält ihre eigene Hautkarte.
// Erst wird alles geladen, dann öffnet sich das Gym. Geht dabei etwas schief (zum Beispiel ohne Internet, wenn der Ordner noch nie geladen war), nimmt die App ihr normales Gym.
const KOERPER = '3d/koerper.bin';
const DATEIEN = ['kunde.html', 'studio.jpg', 'charakter.js', 'frisur.js', 'kleidung.js', 'koerperform.js', 'fotomass.js', 'gesicht.js', 'gesicht-ref.js', 'kurzform.js', 'spielfigur.js', 'stand.js',
  '3d/raum.js', '3d/figur.js', '3d/figur-modell.js', '3d/einleitung.js', '3d/bewegungen.js', '3d/posen.js', '3d/spieltag.js', '3d/vendor/OrbitControls.js', KOERPER, '3d/koerper-haut.jpg', '3d/koerper-haut-n.jpg', '3d/koerper-haar.jpg', '3d/koerper-augen.jpg'];
const kopie = (o) => JSON.parse(JSON.stringify(o));
let basis = null;
// c: der Charakter aus dem Konto (kurzform.packen). o: was raumOeffnen braucht, ohne lade3d, dazu name
export async function oeffnen(c, o) {
  const [raum, fig, modell, be, posen, sp, ku] = await Promise.all([import('./3d/raum.js'), import('./3d/figur.js'), import('./3d/figur-modell.js'), import('./3d/bewegungen.js'), import('./3d/posen.js'), import('./spielfigur.js'), import('./kurzform.js')]);
  await modell.ladeKoerper(new URL(KOERPER, import.meta.url).href);
  if (!basis) basis = { BAU: kopie(modell.BAU), MASS: kopie(fig.MASS) };   // vor dem ersten Anpassen: Ein zweiter Besuch im Gym rechnet wieder von der Grundfigur aus
  const D = ku.auspacken(c);
  let haltung = () => {};
  return raum.raumOeffnen({ ...o, lade3d: async () => ({ ...fig, ...be }), spieler: {
    name: o.name,
    haltung: (p, w) => haltung(p, w),
    bauen: (a) => { window.dkGym = a; haltung = sp.haltung(sp.ausDaten(a, D, { basis, BAU: modell.BAU, MASS: fig.MASS, gelenke: fig.gelenke, messHaltung: posen.messHaltung })); }
  } });
}
// Wer einen Charakter hat, soll ihn auch ohne Internet im Gym dabeihaben: einmal alles laden, der Offline-Speicher behält es
export function vorladen() { for (const f of DATEIEN) fetch(new URL(f, import.meta.url)).catch(() => {}); }
