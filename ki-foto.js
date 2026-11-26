// DK Coach — Foto vom Essen (26.11.2026, KI-Plan Stufe C/D, Devin: „Google AIY Food“). Läuft nur auf dem Handy: Das Bild-Modell (Google AIY Food V1, Apache 2.0)
// und die Laufzeit (MediaPipe Tasks Vision 1.2.3) liegen auf devin-kanke.com unter ki/ und werden erst beim ersten Foto geladen (ca. 35 MB), danach aus dem Offline-Speicher.
// Das Foto verlässt das Handy nie. Das Modell sagt nur, welche Klassen es sieht; welches Gericht das ist und welche Zahlen gelten, entscheidet die Liste (wissen/daten).
// Der Kunde wählt immer selbst aus den Vorschlägen. Kein Netz außer den eigenen Dateien, kein Speicher, kein Code aus Text (sicherheit-pruefen.js 5i).
let laden = null, fertig = false;
export const geladen = () => fertig;
export function vorbereiten() {
  if (!laden) {
    const pfad = (d) => new URL('./ki/' + d, import.meta.url).href;
    laden = import('./ki/vision_bundle.js').then((mp) => mp.ImageClassifier.createFromOptions(
      { wasmLoaderPath: pfad('vision_wasm_internal.js'), wasmBinaryPath: pfad('vision_wasm_internal.wasm') },
      // CPU statt GPU: Im GPU-Modus gab es auf dem iPhone falsche Ergebnisse (Recherche 26.11.2026, MODELLE.md)
      { baseOptions: { modelAssetPath: pfad('aiy_food_v1.tflite'), delegate: 'CPU' }, runningMode: 'IMAGE', maxResults: 40, displayNamesLocale: 'en' }))
      .then((k) => { fertig = true; return k; });
    laden.catch(() => { laden = null; });
  }
  return laden;
}
// Bild (Canvas oder Bild-Element) → [{ i: Klassen-Nummer, s: Wahrscheinlichkeit }]
export async function erkennen(bild) {
  const k = await vorbereiten();
  const r = k.classify(bild), liste = r && r.classifications && r.classifications[0] ? r.classifications[0].categories || [] : [];
  return liste.map((c) => ({ i: c.index, s: c.score })).filter((c) => Number.isInteger(c.i) && c.s >= 0 && c.s <= 1);
}
// Klassen → Gerichte: Wahrscheinlichkeiten je Gericht addieren (eine Klasse kann zu mehreren Gerichten gehören, z. B. Gyro → beide Döner).
// idx: { Klassen-Nummer: [Gericht-id, …] } aus essen-daten.js. Ergebnis: höchstens 3 Gerichte, das wahrscheinlichste zuerst.
export function gerichteAus(treffer, idx, gerichte) {
  const summe = {};
  for (const t of treffer || []) for (const id of (idx && idx[t.i]) || []) summe[id] = (summe[id] || 0) + t.s;
  return Object.entries(summe).map(([id, s]) => ({ g: (gerichte || []).find((x) => x.id === id), s: Math.min(1, s) }))
    .filter((x) => x.g).sort((a, b) => b.s - a.s).slice(0, 3);
}
