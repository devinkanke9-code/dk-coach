// DK Coach — Trainingsraum (02.11.2026, Devin: „… einen Raum, wo die ganzen Geräte stehen … ein Weg … am Ende die Tür“, dann „wie ein kleines Videospiel … wie Mario, nächstes Level … nur in 3D … POV von oben … reingehen“).
// Der Trainingstag als kleines 3D-Spiel: Die Figur läuft von oben gesehen den Weg entlang von Station zu Station, an der Station taucht die Kamera ein und die Figur trainiert, am Ende geht es durch die Tür.
// Eine Ansicht (figur.js) zeichnet alles. Sie rechnet mit Figur und Gerät im Ursprung, darum bewegt sich nicht die Figur durch die Halle, sondern die Halle (Gruppe raum) wird unter ihr verschoben.
// An der Station liegt die Halle so, dass die Station im Ursprung liegt. Kamera (K), Figur (F, H) und Stationen rechnen in Hallen-Koordinaten: Eingang bei z > 0, der Weg führt nach -z.

const el = (tag, klasse, text) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; };
const glatt = (u) => u * u * (3 - 2 * u);
const klemme = (x, a, b) => Math.min(b, Math.max(a, x));
const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const ruheL = (u, v) => { const s = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453; return s - Math.floor(s); };   // fester „Zufall“ (Live-Gym: Marmor, Pflanzen, Deko)
const STILL = typeof window !== 'undefined' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Halle und Kamera als reine Rechnung (ohne Browser): raumOeffnen baut die Halle damit, und messe-kamera.mjs prüft sie für jede Station und jeden Winkel.
// Maße seit 07.11.2026 (Paket G1, Devin: „der Raum soll größer sein“, die Kamera ging beim Drehen durch die Wand): Breite 20 statt 12 m, Stationen 3,6 statt 3,2 m neben dem Gang,
// Fach 6,2 statt 5,2 m, Wände 4,6 statt 3,2 m hoch und mit Decke. Die Kamera kreist an der Station mit Radius 3,7 bis 9,1 m (Handy hochkant, Median 6,4 m): Station bis Wand sind jetzt 6,25 statt 2,65 m.
const BREITE = 20, WAND = 4.6, FACH = 6.2, SEITE_X = 3.6, STATION_R = 2.1, TUER_B = 4, TUER_H = 3.6;
const WAND_D = 0.3, RAND = 0.4, ENDE_ABSTAND = 9, ORBIT_Y_MIN = 0.6, ORBIT_Y_MAX = Math.min(3.4, WAND - 0.2), FOV_MAX = 80;   // Wanddicke, Abstand der Kamera zu jeder Wand, Höhen beim Wischen, weiteste Sicht beim Heranrücken
const FIGUR_RAND = 1.5;   // so nah an die Wand (Mitte der Wand) darf die Figur beim Laufen: Zwischen Figur und Kamera hinter ihr bleibt noch mindestens 0,95 m, die Kamera sitzt nie in der Figur
const SCHIENEN_X = [SEITE_X - 0.6, BREITE / 2 - 3];
const TERRASSE = 6, WAAGE_X = -6.5, WAAGE_Z = 3.0, WAAGE_R = 1.1, WAAGE_W = Math.PI / 2 - 0.3;   // Breite der Holzterrasse rund um die Halle; die Waage im Eingang (Mitte und Halbmesser der Trefferfläche)   // LED-Schienen unter der Decke (über den Stationsreihen und weiter außen), im Boden gespiegelt
const SPIEGEL_X = -6.8, SPIEGEL_Z = -5.5, SPIEGEL_R = 1.1, SPIEGEL_W = -Math.PI / 2, SPIEGEL_LAENGE = 8;   // der Posing-Platz vor der Spiegelwand (linke Wand), die Figur schaut zur Wand
const PR_TUER_X = 5.2, PR_TUER_Z = 3.4, PR_TUER_W = -Math.PI / 2 + 0.3;   // Tür zum PR-Raum, gegenüber der Waage (im Studio rechts, weil die Waage links steht; im Gym ohne Studio stand sie bei x −5,2 mit W = π/2 − 0,3)
const frei = (rich, ab, von, bis) => (rich > 1e-9 ? (bis - ab) / rich : rich < -1e-9 ? (von - ab) / rich : Infinity);   // wie viele Schritte in Richtung rich man von ab aus kommt, bis die Grenze von oder bis erreicht ist

// Maße der Halle für n Stationen. innen = Innenseiten der Wände, kasten = wo die Kamera sein darf (RAND Abstand zu jeder Wand, 0,2 m unter der Decke)
export function hallenMass(n) {
  const zStart = 3.6, zAnfang = zStart + 3.4, zStation = (i) => -2 - i * FACH, zEnde = zStation(Math.max(1, n) - 1) - ENDE_ABSTAND;
  const innen = { xMin: -BREITE / 2 + WAND_D / 2, xMax: BREITE / 2 - WAND_D / 2, zMin: zEnde + WAND_D / 2, zMax: zAnfang - WAND_D / 2 };
  return { n, breite: BREITE, wand: WAND, fach: FACH, seiteX: SEITE_X, stationR: STATION_R, rand: RAND, orbitY: [ORBIT_Y_MIN, ORBIT_Y_MAX], tuerB: TUER_B, tuerH: TUER_H, figurRand: FIGUR_RAND, terrasse: TERRASSE, waage: { x: WAAGE_X, z: WAAGE_Z, r: WAAGE_R }, spiegel: { x: SPIEGEL_X, z: SPIEGEL_Z, r: SPIEGEL_R, laenge: SPIEGEL_LAENGE, w: SPIEGEL_W },
    zStart, zAnfang, zEnde, zStation, laenge: zAnfang - zEnde, zMitte: (zAnfang + zEnde) / 2,
    stationX: (i) => (i % 2 === 0 ? -SEITE_X : SEITE_X), stationWinkel: (i) => (i % 2 === 0 ? Math.PI / 2 - 0.38 : -Math.PI / 2 + 0.38),
    innen, kasten: { xMin: innen.xMin + RAND, xMax: innen.xMax - RAND, zMin: innen.zMin + RAND, zMax: innen.zMax - RAND, yMin: 0.3, yMax: WAND - 0.2 } };
}
// Kamera in der Halle halten: Der Arm von von (Figur oder Mitte der Station) zur gewünschten Kamera zu wird kürzer, wo er an eine Wand stößt (gleiche Richtung), und die Höhe bleibt unter der Decke.
// Steht von selbst draußen (Figur vor der Tür), wird die Kamera in den Kasten geschoben. So geht sie nie durch eine Wand und nie nach draußen.
export function kameraImRaum(h, von, zu) {
  const k = h.kasten, ax = zu.x - von.x, az = zu.z - von.z;
  const drin = von.x >= k.xMin && von.x <= k.xMax && von.z >= k.zMin && von.z <= k.zMax;
  const s = drin ? Math.max(0, Math.min(1, frei(ax, von.x, k.xMin, k.xMax), frei(az, von.z, k.zMin, k.zMax))) : 1;
  return { x: klemme(von.x + ax * s, k.xMin, k.xMax), y: klemme(zu.y, k.yMin, k.yMax), z: klemme(von.z + az * s, k.zMin, k.zMax), s };
}
// Kreis der Kamera um die Station (Mitte, Radius r, Winkel w, Höhe y, Sicht fov in Grad). Stößt der Kreis an eine Wand, rückt die Kamera näher an die Figur heran; die Sicht wird dann weiter,
// damit die Figur gleich groß im Bild bleibt (höchstens FOV_MAX). Der gemerkte Radius r bleibt, sobald man von der Wand wegdreht, ist der Abstand wieder da.
export function umlaufKamera(h, o) {
  const p = kameraImRaum(h, o.mitte, { x: o.mitte.x + Math.sin(o.w) * o.r, y: o.y, z: o.mitte.z + Math.cos(o.w) * o.r });
  const r = Math.hypot(p.x - o.mitte.x, p.z - o.mitte.z), d0 = Math.hypot(o.r, o.y - o.mitte.y), d1 = Math.max(0.5, Math.hypot(r, p.y - o.mitte.y));
  const q = d0 / d1, reserve = 1 + 0.05 * klemme((q - 1) / 0.05, 0, 1);   // 5 % mehr Sicht, sobald die Kamera gekürzt ist (gemessen: der Umriss flacher Übungen wie Bauchlage ragt sonst knapp aus dem Bild)
  const fov = o.fov ? Math.min(FOV_MAX, Math.max(o.fov, 2 * Math.atan(Math.tan(o.fov * Math.PI / 360) * q * reserve) * 180 / Math.PI)) : 0;
  return { x: p.x, y: p.y, z: p.z, r, fov };
}
// Kamera beim Gehen: hinter und über der Figur (kamW = Winkel um sie herum, kamZ = Zoom), in der Halle gehalten. Wird der Arm an der Wand kürzer, geht der Blick weniger weit voraus (s), so bleibt die Figur im Bild.
// Entwurf nach Messung (Figur ganz im Bild bei jedem Zoom von 0,55 bis 2,3 und jedem Winkel, hochkant und quer): Arm 6 m × kamZ hinter der Figur, Höhe 4,4 m × kamZ (an der Decke gekappt), Blick 0,5 m voraus.
export function folgeKamera(h, F, kamW, kamZ, spieler, nick) {
  const dx = Math.sin(kamW), dz = Math.cos(kamW);
  // Live-Gym (10.11.2026): wie in einem Spiel in dritter Person, Kamera hinter und etwas über der Figur, der Blick geht weit in die Halle (Vorlage: Figur unten in der Mitte, Horizont im oberen Drittel).
  // nick hebt den Blick (positiv: nach oben sehen, die Kamera geht dabei tiefer), bleibt stehen, bis man ihn wieder ändert
  if (spieler === 'live') {
    const L = 6.55 * kamZ, phi = klemme(0.115 - (nick || 0) * 0.9, -0.12, 1.15), y = 1.35 + L * Math.sin(phi), hz = L * Math.cos(phi);
    const p = kameraImRaum(h, F, { x: F.x + dx * hz, y, z: F.z + dz * hz }), vor = 4 * Math.max(0.35, p.s);
    return { pos: p, blick: { x: F.x - dx * vor, y: 1.35 - (y - 1.35) * 0.6 + (nick || 0) * 3, z: F.z - dz * vor }, s: p.s };
  }
  const arm = spieler ? { h: 4.5 * kamZ, y: 0.9 + 3.5 * kamZ, voraus: 0.9, ziel: 0.95 } : { h: 6 * kamZ, y: 4.4 * kamZ, voraus: 0.5, ziel: 0.8 };   // eigener Charakter: groß im Bild
  const p = kameraImRaum(h, F, { x: F.x + dx * arm.h, y: arm.y, z: F.z + dz * arm.h });
  // Kürzt die Wand den Arm, steigt die Kamera dafür höher (gleiche Armlänge, soweit die Decke es zulässt): So bleibt die Figur gleich groß und ganz im Bild (gemessen: zu nah und zu tief schneidet sie sonst seitlich ab)
  if (p.s < 1) { const l = Math.hypot(p.x - F.x, p.z - F.z), d0 = Math.hypot(arm.h, arm.y - arm.ziel); p.y = Math.min(h.kasten.yMax, Math.max(p.y, arm.ziel + Math.sqrt(Math.max(0, d0 * d0 - l * l)))); }
  return { pos: p, blick: { x: F.x - dx * arm.voraus * p.s, y: arm.ziel, z: F.z - dz * arm.voraus * p.s }, s: p.s };
}
// Wo die Kamera an der Waage beginnt: von der Gangseite, im Hochformat etwas weiter weg und die Figur höher im Bild, weil unten die Karte liegt. Rückgabe wie bei den Stationen (Bahn für umlaufKamera, senken für orbit.versatz)
export function waageSicht(h, hochkant) {
  const senken = hochkant ? 1.0 : 0.4;   // hochkant etwas weiter weg und höher im Bild: Die Karte ist mit den Pose-Knöpfen höher
  return { senken, bahn: { mitte: { x: h.waage.x, y: 0.95 - senken, z: h.waage.z }, r: hochkant ? 4.7 : 4.6, w: WAAGE_W, y: 1.9 } };
}
// Wo die Kamera an der Station beginnt (aus der Voreinstellung der Ansicht: sichtLokal = Kamera, zielLokal = Mitte, beide in Koordinaten der Station), umgerechnet in Hallen-Koordinaten.
// opt: hochkant (Handy), nah (Probetag mit kleiner Karte), spieler (eigener Charakter). Steht hier, damit Node dieselbe Rechnung messen kann.
// Kamera am Spiegel: schräg von hinten (auf der Seite zur Halle hin, ohne Gerät im Weg), so sieht man die Figur und ihr Spiegelbild nebeneinander (hochkant ist der Bildwinkel schmal, darum nur 15° neben der Achse); die Bahn läuft wie bei der Waage um die Figur
export function spiegelSicht(h, hochkant) {
  const senken = hochkant ? 0.75 : 0.35;
  return { senken, bahn: { mitte: { x: h.spiegel.x, y: 0.95 - senken, z: h.spiegel.z }, r: hochkant ? 4.6 : 4.8, w: Math.PI / 2 + (hochkant ? 0.26 : 0.5), y: 1.8 } };
}
export function stationsSicht(s, opt) {
  const c = Math.cos(s.winkel), n = Math.sin(s.winkel), z = s.zielLokal, l = s.sichtLokal;
  const aus = (v) => ({ x: v.x * c + v.z * n + s.pos.x, y: v.y, z: -v.x * n + v.z * c + s.pos.z });
  const f = opt.nah ? (opt.hochkant ? 1.08 : 0.98) : opt.hochkant ? 1.4 : 1.14;
  const blick = aus(z), sicht = aus({ x: z.x + (l.x - z.x) * f, y: z.y + (l.y - z.y) * f, z: z.z + (l.z - z.z) * f });
  const senken = opt.hochkant ? (opt.nah ? 0.72 : opt.spieler ? 1.65 : 0.95) : 0.42;   // Figur steht oben im Bild, unten liegt die Karte (eigener Charakter: ganz über der Karte)
  blick.y -= senken;
  sicht.y = klemme(sicht.y, 1, 3);
  return { sicht, blick, senken };
}
const TEMPO = 2.8, SCHRITT = 0.36;   // Laufen in m/s, Schrittlänge

// Farbwelten (seit 09.11.2026 Fitnessstudio-Look, Devin: „modern, schwarz, nicht hell … die Stimmung folgt der Farbwelt“): Innenraum immer dunkel, Schwarz-Gold am dunkelsten und mit gedimmten Lichtern,
// Klar in Graphit mit kaltweißem Licht, Lagune in dunklem Petrol mit Aqua-Licht. Draußen (Himmel, Meer, Glas) bleibt je Farbwelt hell oder Nacht. studio = Stoffe für Wände, Decke, Fassade, Dach und die DK-Zeichen.
const FARBEN_LAGUNE = {
  himmel: 0x86cbee, nebel: 0x92d2f0, see: true, tuer: 0x14c7b6, schatten: '0,0,0',
  bodenA: '#22343D', bodenB: '#17262D', fuge: 'rgba(127,245,230,.10)', bodenLicht: 'rgba(72,232,214,.26)', bodenLicht0: 'rgba(72,232,214,0)',
  seiten: [0x2b4854, 0x213a45, 0x35606f, 0x172c35, 0x274350, 0x1d3540], led: 0x7ff5e6, halo: 0x48e8d6, haloStark: 0.62,
  ring: 0x14c7b6, ringAus: 0x3e8fa8, ringFertig: 0x0fa899, teller: 0x2f4b58, tellerSicht: 0.86, tellerFertig: 0.85,
  rahmen: 0x1c2a31, polster: 0x0b3a44, gummi: 0x0e171b, metall: 0x7ff5e6, glas: 0x6fd8ea,
  schild: { grund: 'rgba(11,24,31,.94)', text: '#F2FBFC', text2: '#9DB8C0', a: '#4FE3D3', b: '#25A5D3', kreis: '#06232B' },
  wegA: [0.3, 0.96, 0.88], wegB: [0.2, 0.78, 0.98], wegDunkel: 0.34, deck: 0x2b4450, strich: [0.35, 0.95, 0.9],
  // Meer, Himmel und Glas (09.11.2026): tropische Lagune mit türkisem Wasser
  himmelOben: '#43B3EE', himmelHorizont: '#D2F2FB', sonne: '#FFF3C8', meerNah: '#46DCD2', meerFern: '#1A97CF', schaum: '#FFFFFF', glitzer: '#FFFFFF',
  glasTon: '#BFEFFF', glasStark: 0.12, glanzStark: 0.36, sprosse: '#0F1B21', holz: ['#8E7556', '#7A6247'], palme: ['#1C8458', '#66D48F'], waage: '#FFB02E',
  studio: { wand: '#1F313A', wandB: '#14232A', wandLinie: 'rgba(127,245,230,.34)', decke: '#101D23', deckeLinie: 'rgba(127,245,230,.12)', fassade: '#0F1B21', fassadeLinie: 'rgba(127,245,230,.28)', dach: '#0E181D', logoA: '#7FF5E6', logoB: '#25D3C2', plakat: '#0C1A21', rahmen: '#14C7B6' }
};
const FARBEN_KLAR = {
  himmel: 0xf5f5f7, nebel: 0xf5f5f7, see: false, tuer: 0x0071e3, schatten: '0,0,0', aussen: '#ECECEF', aussenLinie: 'rgba(0,0,0,.05)',
  bodenA: '#34363D', bodenB: '#26282E', fuge: 'rgba(255,255,255,.07)', bodenLicht: 'rgba(160,200,255,.2)', bodenLicht0: 'rgba(160,200,255,0)',
  seiten: [0x3d3f47, 0x30323a, 0x4b4e59, 0x202228, 0x373a42, 0x2b2d34], led: 0xdce8ff, halo: 0x6aa8ff, haloStark: 0.5,
  ring: 0x2f8bff, ringAus: 0x6f7686, ringFertig: 0x30b35a, teller: 0x42454f, tellerSicht: 0.86, tellerFertig: 0.88,
  rahmen: 0x24262c, polster: 0x101114, gummi: 0x17181c, metall: 0xcfd7e3, glas: 0x9ab8de,
  schild: { grund: 'rgba(20,21,25,.94)', text: '#F5F7FA', text2: '#A4AAB6', a: '#4AA3FF', b: '#0A6BE0', kreis: '#0A0B0E' },
  wegA: [0.45, 0.72, 1], wegB: [0.25, 0.58, 1], wegDunkel: 0.32, deck: 0x40434c, strich: [0.4, 0.7, 1],
  // Meer, Himmel und Glas: ruhig und hell, Rahmen in Graphit, das Wasser fast weiß-blau
  himmelOben: '#DCE7F4', himmelHorizont: '#F8F9FC', sonne: '#FFFFFF', meerNah: '#DCE9F6', meerFern: '#C2D5E9', schaum: '#FFFFFF', glitzer: '#FFFFFF',
  glasTon: '#DDEBFA', glasStark: 0.12, glanzStark: 0.4, sprosse: '#1D1E22', holz: ['#A39683', '#928572'], palme: ['#8CA597', '#C6D8CC'], waage: '#FF9F0A',
  studio: { wand: '#383A42', wandB: '#2A2C33', wandLinie: 'rgba(255,255,255,.2)', decke: '#222328', deckeLinie: 'rgba(255,255,255,.08)', fassade: '#212226', fassadeLinie: 'rgba(255,255,255,.16)', dach: '#1C1D21', logoA: '#FFFFFF', logoB: '#9CC7F2', plakat: '#1C1D21', rahmen: '#0071E3' }
};
const FARBEN_GOLD = {
  himmel: 0x050507, nebel: 0x07070a, see: false, tuer: 0xf0cd74, schatten: '0,0,0', aussen: '#08080B', aussenLinie: 'rgba(139,92,246,.26)',
  bodenA: '#101015', bodenB: '#09090C', fuge: 'rgba(236,200,110,.11)', bodenLicht: 'rgba(139,92,246,.3)', bodenLicht0: 'rgba(139,92,246,0)',
  seiten: [0x1a1a20, 0x141418, 0xe0b95b, 0x0e0e11, 0x1d1d23, 0x121216], led: 0xb794ff, halo: 0x8b5cf6, haloStark: 0.8,
  ring: 0xf0cd74, ringAus: 0x7a6a3c, ringFertig: 0xcc9a33, teller: 0x2c2c36, tellerSicht: 0.9, tellerFertig: 0.95,
  rahmen: 0x1b1b20, polster: 0x0f0f13, gummi: 0x0a0a0c, metall: 0xe8c468, glas: 0x6b4fb0,
  schild: { grund: 'rgba(16,16,21,.96)', text: '#F5F1E7', text2: '#BDB7A8', a: '#F7DE93', b: '#CC9A33', kreis: '#1B1304' },
  wegA: [0.97, 0.87, 0.58], wegB: [0.8, 0.6, 0.2], wegDunkel: 0.24, deck: 0x17171c, strich: [0.98, 0.86, 0.52],
  // Meer, Himmel und Glas: Nacht, dunkles Wasser mit Gold und Lila im Glitzer, goldene Rahmen
  himmelOben: '#04040A', himmelHorizont: '#2A1646', sonne: '#F0CD74', meerNah: '#13133A', meerFern: '#08081A', schaum: '#9B7CF0', glitzer: '#F7DE93',
  glasTon: '#6B4FB0', glasStark: 0.1, glanzStark: 0.3, sprosse: '#E8C468', holz: ['#2B2119', '#1F1812'], palme: ['#0E1218', '#3A2D5C'], waage: '#F0CD74',
  studio: { wand: '#131318', wandB: '#0A0A0D', wandLinie: 'rgba(232,196,104,.38)', decke: '#08080B', deckeLinie: 'rgba(139,92,246,.14)', fassade: '#0B0B0F', fassadeLinie: 'rgba(232,196,104,.3)', dach: '#0A0A0D', logoA: '#F7DE93', logoB: '#CC9A33', plakat: '#0F0F14', rahmen: '#E8C468' }
};

// Tag und Nacht draußen (Devin 09.11.2026: „dass man einstellen kann, ob Tag oder Nacht ist, dann sieht man den Mond“). Ohne Wahl gilt, was die Farbwelt vorgibt (Schwarz-Gold Nacht, sonst Tag).
// AUSSEN_TAG und AUSSEN_NACHT gelten für die Farbwelten, die selbst nicht Tag beziehungsweise Nacht sind; palme und holz sind die Farben bei Tag (bei Nacht dunkelt ein Ton sie ab), ton* die Abdunklung bei Nacht.
const AUSSEN_TAG = { himmelOben: '#43B3EE', himmelHorizont: '#D2F2FB', sonne: '#FFF3C8', meerNah: '#46DCD2', meerFern: '#1A97CF', schaum: '#FFFFFF', glitzer: '#FFFFFF', glasTon: '#BFEFFF', palme: ['#1C8458', '#66D48F'], holz: ['#8E7556', '#7A6247'], lichtStark: 1.0 };
const AUSSEN_NACHT = { himmelOben: '#02050F', himmelHorizont: '#15284E', sonne: '#E9F1FF', meerNah: '#0E2C58', meerFern: '#050F26', schaum: '#86AEEA', glitzer: '#DCEAFF', glasTon: '#27406B', lichtStark: 0.8 };
// Live-Gym (10.11.2026, Devin: „genau das hier, was du in den Bildern siehst, einmal für dunkel und einmal für hell … sehr realistisch … wie GTA 6, nur für das Fitnessstudio“):
// schwarzer Marmor mit goldenen Adern, warme goldene LED statt Lila, die Nacht in tiefem Blau, die helle Fassung ist der Abend mit tiefer Sonne. Gilt in jeder Farbwelt, die Vorlage ist schwarz-gold.
const FARBEN_LIVE = Object.assign({}, FARBEN_GOLD, {
  led: 0xffd9a0, halo: 0xffb45a, haloStark: 0.75, bodenLicht: 'rgba(255,200,120,.18)', bodenLicht0: 'rgba(255,200,120,0)', aussenLinie: 'rgba(232,196,104,.26)', glas: 0x2a3446,
  himmelOben: '#020611', himmelHorizont: '#1A2B4E', sonne: '#FFE4B0', meerNah: '#0A1D3A', meerFern: '#030A1A', schaum: '#7E9AC6', glitzer: '#FFE0A0',
  glasTon: '#1C2A42', glasStark: 0.07, glanzStark: 0.2, palme: ['#0E1712', '#2B4433'],
  studio: Object.assign({}, FARBEN_GOLD.studio, { decke: '#050506', deckeLinie: 'rgba(232,196,104,.07)', wand: '#0E0E11', wandB: '#060607' })
});
FARBEN_LIVE.sprosse = '#1E1C19'; FARBEN_LIVE.ringAus = 0x4a4130; FARBEN_LIVE.teller = 0x09090b; FARBEN_LIVE.tellerSicht = 0.35; FARBEN_LIVE.tellerFertig = 0.45;   // die runden Platten unter den Geräten nur angedeutet, der Marmor bleibt sichtbar
const AUSSEN_ABEND = { himmelOben: '#3F70B3', himmelHorizont: '#F7A66A', sonne: '#FFD995', meerNah: '#2E7C98', meerFern: '#1A4B76', schaum: '#FFF1DE', glitzer: '#FFE3A8', glasTon: '#D9DCE0', palme: ['#1E5A38', '#62A35E'], holz: ['#8E7556', '#7A6247'], lichtStark: 1.0 };

function zeichne(breite, hoehe, malen) {
  const c = document.createElement('canvas'); c.width = breite; c.height = hoehe;
  malen(c.getContext('2d'), breite, hoehe);
  return c;
}
function runde(x, l, o, b, h, r) { x.beginPath(); x.moveTo(l + r, o); x.arcTo(l + b, o, l + b, o + h, r); x.arcTo(l + b, o + h, l, o + h, r); x.arcTo(l, o + h, l, o, r); x.arcTo(l, o, l + b, o, r); x.closePath(); }
const SCHRIFT = '-apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';

// spieler (optional): der eigene Charakter statt der Standardfigur. { name, bauen(ansicht, M) vor dem Aufbau der Stationen, haltung(pose, winkel) im Gehen und Stehen }. Dann: Kamera näher dran, Einstieg durch die Tür, Name über dem Kopf, „Hier trainieren“ am Gerät
// Rückfall-Bremse für langsame Handys (Empfehlung von 3D-Ablauf): Solange der Spiegel gezeichnet wird, kommt die ganze Halle je Bild zweimal dran. Wird es dauerhaft langsam, kommt erst eine kleinere
// Textur, dann eine noch kleinere, zuletzt bleibt der Spiegel dunkles Glas. Maßstab ist der Bildabstand mit Spiegel im Vergleich zu den Bildern ohne Spiegel (so löst ein Handy im Stromsparmodus,
// das ohnehin nur 30 Bilder zeigt, die Bremse nicht aus). Reine Rechnung, wird in pruefe-bremse.mjs mit künstlichen Bildabständen geprüft.
export function spiegelBremse(opt = {}) {
  const FENSTER = opt.fenster || 45, GRENZE = opt.grenze || 24, FAKTOR = opt.faktor || 1.35, STUFEN = opt.stufen || [1, 0.67, 0.42];   // Bilder je Urteil, ms, Faktor zu ohne Spiegel, Faktoren der Texturgröße
  let stufe = 0, ohne = 0, summe = 0, n = 0, aus = false;
  return {
    get skala() { return aus ? 0 : STUFEN[stufe]; }, get aus() { return aus; },
    // dt: Abstand zum vorigen Bild in ms, mitSpiegel: ob im vorigen Bild der Spiegel gezeichnet wurde. Gibt zurück: 0 nichts, 1 kleinere Textur, 2 aus
    messe(dt, mitSpiegel) {
      if (aus || !(dt > 2 && dt < 250)) { summe = 0; n = 0; return 0; }   // Lücken (Tab im Hintergrund, Ladepause) zählen nicht
      if (!mitSpiegel) { ohne = ohne ? ohne * 0.95 + dt * 0.05 : dt; summe = 0; n = 0; return 0; }
      summe += dt; n++;
      if (n < FENSTER) return 0;
      const mittel = summe / n; summe = 0; n = 0;
      if (mittel > GRENZE && mittel > (ohne || 16.7) * FAKTOR) { if (stufe < STUFEN.length - 1) { stufe++; return 1; } aus = true; return 2; }
      return 0;
    }
  };
}
// Spiegel mit echtem Spiegelbild (09.11.2026, nach dem Muster des Reflektors von three.js, aber ohne eigenes Zeichenziel): Vor dem Bildschirm-Bild wird die Szene aus der gespiegelten Kamera
// in einen kleinen Teil des Bildschirms gezeichnet und in eine Textur kopiert (copyFramebufferToTexture), danach zeichnet das normale Bild darüber. So nimmt die Spiegelzeichnung genau die Programme des
// normalen Bildes (nichts muss extra übersetzt werden, kein Ruckeln beim ersten Blick) und hat denselben Farbton. Gezeichnet wird nur, wenn der Spiegel im Bild ist und die Kamera in der Halle steht.
// Leuchten (Live-Gym, 10.11.2026, Devin: „richtig gute Grafik … wie GTA 6“): helle Stellen (LED, Leuchtschrift, Sonne) bekommen einen weichen Schein wie in einem Spiel.
// Nach dem fertigen Bild wird es kopiert, nur das Helle bleibt, wird in zwei kleinen Bildern (ein Viertel und ein Achtel) weichgezeichnet und darübergelegt. Kostet wenig, weil die Weichzeichnung klein rechnet.
function leuchtenBauen(THREE) {
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), szeneQ = new THREE.Scene(), kam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); quad.frustumCulled = false; szeneQ.add(quad);
  const vs = 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', o = { vertexShader: vs, depthTest: false, depthWrite: false };
  const hellM = new THREE.ShaderMaterial(Object.assign({ uniforms: { t: { value: null }, schwelle: { value: 0.75 } },
    fragmentShader: 'uniform sampler2D t; uniform float schwelle; varying vec2 vU; void main(){ vec3 c = texture2D(t, vU).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(schwelle, 1.0, l), 1.0); }' }, o));
  const weichM = new THREE.ShaderMaterial(Object.assign({ uniforms: { t: { value: null }, schritt: { value: new THREE.Vector2() } },
    fragmentShader: 'uniform sampler2D t; uniform vec2 schritt; varying vec2 vU; void main(){ vec3 c = texture2D(t, vU).rgb * 0.227; c += (texture2D(t, vU + schritt * 1.385).rgb + texture2D(t, vU - schritt * 1.385).rgb) * 0.316; c += (texture2D(t, vU + schritt * 3.231).rgb + texture2D(t, vU - schritt * 3.231).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }' }, o));
  const mischM = new THREE.ShaderMaterial(Object.assign({ uniforms: { a: { value: null }, b: { value: null }, stark: { value: 0.8 } }, transparent: true, blending: THREE.AdditiveBlending,
    fragmentShader: 'uniform sampler2D a, b; uniform float stark; varying vec2 vU; void main(){ gl_FragColor = vec4((texture2D(a, vU).rgb * 0.7 + texture2D(b, vU).rgb * 1.1) * stark, 1.0); }' }, o));
  const ziel = () => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false }), r1 = ziel(), r2 = ziel(), r3 = ziel(), r4 = ziel();
  const gr = new THREE.Vector2(), ursprung = new THREE.Vector2(0, 0), neueFolge = +THREE.REVISION >= 166; let fb = null, fbB = 0, fbH = 0, kaputt = false;
  const lauf = (R, m, z) => { quad.material = m; R.setRenderTarget(z); R.render(szeneQ, kam); };
  const weich = (R, von, zu, b, h) => { weichM.uniforms.t.value = von.texture; weichM.uniforms.schritt.value.set(1 / b, 0); lauf(R, weichM, zu); weichM.uniforms.t.value = zu.texture; weichM.uniforms.schritt.value.set(0, 1 / h); lauf(R, weichM, von); };
  return {
    an: true, stark: 0.8, schwelle: 0.75,
    zeichne(R) {   // nach dem normalen Bild aufrufen
      if (!this.an || kaputt || this.stark <= 0.01) return;
      R.getDrawingBufferSize(gr); const b = gr.x, h = gr.y; if (b < 16 || h < 16) return;
      const b4 = b >> 2, h4 = h >> 2, b8 = b >> 3, h8 = h >> 3;
      if (!fb || fbB !== b || fbH !== h) { if (fb) fb.dispose(); fb = new THREE.FramebufferTexture(b, h); fb.minFilter = fb.magFilter = THREE.LinearFilter; fbB = b; fbH = h; r1.setSize(b4, h4); r2.setSize(b4, h4); r3.setSize(b8, h8); r4.setSize(b8, h8); }
      const alt = R.getRenderTarget(), klar = R.autoClear;
      try {
        R.setRenderTarget(null); if (neueFolge) R.copyFramebufferToTexture(fb, ursprung); else R.copyFramebufferToTexture(ursprung, fb);
        hellM.uniforms.t.value = fb; hellM.uniforms.schwelle.value = this.schwelle; lauf(R, hellM, r1);
        weich(R, r1, r2, b4, h4);
        weichM.uniforms.t.value = r1.texture; weichM.uniforms.schritt.value.set(0, 0); lauf(R, weichM, r3);   // verkleinern
        weich(R, r3, r4, b8, h8); weich(R, r3, r4, b8, h8);
        mischM.uniforms.a.value = r1.texture; mischM.uniforms.b.value = r3.texture; mischM.uniforms.stark.value = this.stark;
        R.autoClear = false; lauf(R, mischM, null);
      } catch (e) { kaputt = true; }   // geht es auf einem Gerät nicht, bleibt das Bild ohne Schein
      finally { R.autoClear = klar; R.setRenderTarget(alt); }
    },
    entsorgen() { if (fb) fb.dispose(); for (const r of [r1, r2, r3, r4]) r.dispose(); }
  };
}
function spiegelFlaeche(THREE, breite, hoehe, opt) {
  const uni = Object.assign({ tSpiegel: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, tonung: { value: new THREE.Color(opt.tonung) }, stark: { value: opt.stark } }, opt.uni);
  // opt.stoff (Live-Gym, 10.11.2026): eigener Stoff für dieselbe Spiegelrechnung, so spiegelt auch der Marmorboden; opt.skala 0 = gerade nicht zeichnen (Qualitätsstufe)
  const mat = opt.stoff ? opt.stoff(uni) : new THREE.ShaderMaterial({ uniforms: uni, fog: false, toneMapped: false,
    vertexShader: 'uniform mat4 textureMatrix; varying vec4 vT; varying vec2 vU; void main(){ vT = textureMatrix * vec4(position, 1.0); vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: ['uniform sampler2D tSpiegel; uniform vec3 tonung; uniform float stark; varying vec4 vT; varying vec2 vU;',
      'void main(){',
      '  vec3 c = texture2DProj(tSpiegel, vT).rgb * tonung * stark;   // schon im Farbraum des Bildschirms (Tonwerte und Kodierung wie das normale Bild)',
      '  float rand = smoothstep(0.0, 0.012, min(min(vU.x, 1.0 - vU.x), min(vU.y, 1.0 - vU.y)));',
      '  float glanz = smoothstep(0.0, 0.5, 0.5 - abs(fract(vU.x * 1.3 + vU.y * 0.5) - 0.5)) * 0.045;',
      '  gl_FragColor = vec4(c * mix(0.5, 1.0, rand) + glanz, 1.0);',
      '}'].join('\n') });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), mat), virt = new THREE.PerspectiveCamera();
  const refPos = new THREE.Vector3(), camPos = new THREE.Vector3(), rot = new THREE.Matrix4(), normal = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), ziel = new THREE.Vector3();
  const ebene = new THREE.Plane(), klipp = new THREE.Vector4(), q = new THREE.Vector4(), fr = new THREE.Frustum(), pv = new THREE.Matrix4(), vp = new THREE.Vector4(), gr = new THREE.Vector2(), ursprung = new THREE.Vector2(0, 0);
  let fb = null, fbB = 0, fbH = 0, ausgefallen = false, letzt = 0, letzteMitSpiegel = false;
  const bremse = spiegelBremse(), neueFolge = +THREE.REVISION >= 166;   // copyFramebufferToTexture: three bis r165 nimmt (Ort, Textur), ab r166 (Textur, Ort)
  // Vor dem normalen Bild aufrufen (nach Kamera und Figur). Gibt zurück, ob gezeichnet wurde.
  const zeichne = (renderer, szene, kamera) => {
    const jetzt = performance.now(), takt = jetzt - letzt; letzt = jetzt;
    let drinnen = true; try { drinnen = !opt.innen || !!opt.innen(); } catch (e) { ausgefallen = true; uni.tSpiegel.value = null; }   // ein Fehler hier darf den Bildlauf nicht anhalten; der Spiegel bleibt dunkles Glas
    if (!opt.ohneBremse && bremse.messe(takt, letzteMitSpiegel) === 2) uni.tSpiegel.value = null;   // dauerhaft zu langsam: der Spiegel bleibt dunkles Glas (der Boden hat seine eigene Stufenregel)
    letzteMitSpiegel = false;
    if (ausgefallen || bremse.aus || !drinnen || !opt.skala) return false;   // von außen (Einstiegsflug) liegt der Spiegel hinter der Wand
    const alt = renderer.getRenderTarget(), schatten = renderer.shadowMap.autoUpdate; renderer.getViewport(vp);
    try {
      kamera.updateMatrixWorld(); kamera.matrixWorldInverse.copy(kamera.matrixWorld).invert();
      pv.multiplyMatrices(kamera.projectionMatrix, kamera.matrixWorldInverse); fr.setFromProjectionMatrix(pv); mesh.updateMatrixWorld(true);
      if (!fr.intersectsObject(mesh)) return false;
      refPos.setFromMatrixPosition(mesh.matrixWorld); camPos.setFromMatrixPosition(kamera.matrixWorld);
      rot.extractRotation(mesh.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rot);
      view.subVectors(refPos, camPos);
      if (view.dot(normal) > 0) return false;   // die Kamera steht hinter dem Spiegel
      renderer.getDrawingBufferSize(gr);
      const bw = Math.max(64, Math.round(gr.x * opt.skala * bremse.skala)), bh = Math.max(64, Math.round(gr.y * opt.skala * bremse.skala)), pr = renderer.getPixelRatio();
      if (!fb || fbB !== bw || fbH !== bh) { if (fb) fb.dispose(); fb = new THREE.FramebufferTexture(bw, bh); fbB = bw; fbH = bh; uni.tSpiegel.value = fb; }
      view.reflect(normal).negate(); view.add(refPos);
      rot.extractRotation(kamera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      ziel.subVectors(refPos, look); ziel.reflect(normal).negate(); ziel.add(refPos);
      virt.position.copy(view); virt.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); virt.lookAt(ziel);
      virt.far = kamera.far; virt.near = kamera.near; virt.updateMatrixWorld(); virt.projectionMatrix.copy(kamera.projectionMatrix);
      uni.textureMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      uni.textureMatrix.value.multiply(virt.projectionMatrix).multiply(virt.matrixWorldInverse).multiply(mesh.matrixWorld);
      // schräge Nahebene: Alles hinter dem Spiegel (die Wand, draußen) bleibt weg
      ebene.setFromNormalAndCoplanarPoint(normal, refPos); ebene.applyMatrix4(virt.matrixWorldInverse);
      klipp.set(ebene.normal.x, ebene.normal.y, ebene.normal.z, ebene.constant);
      const pm = virt.projectionMatrix;
      q.x = (Math.sign(klipp.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(klipp.y) + pm.elements[9]) / pm.elements[5]; q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
      klipp.multiplyScalar(2 / klipp.dot(q));
      pm.elements[2] = klipp.x; pm.elements[6] = klipp.y; pm.elements[10] = klipp.z + 1 - 0.003; pm.elements[14] = klipp.w;
      mesh.visible = false; renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(null); renderer.setViewport(0, 0, bw / pr, bh / pr);
      renderer.render(szene, virt);
      if (neueFolge) renderer.copyFramebufferToTexture(fb, ursprung); else renderer.copyFramebufferToTexture(ursprung, fb);   // die Reihenfolge der Argumente hängt von der three-Fassung ab (hier r160: Ort, Textur)
      letzteMitSpiegel = true;
      return true;
    } catch (e) { ausgefallen = true; uni.tSpiegel.value = null; return false; }   // geht auf einem alten Gerät etwas schief, bleibt der Spiegel dunkles Glas und das Bild läuft weiter
    finally { renderer.setRenderTarget(alt); renderer.shadowMap.autoUpdate = schatten; renderer.setViewport(vp); mesh.visible = true; }
  };
  return { mesh, zeichne, entsorgen() { if (fb) fb.dispose(); mat.dispose(); mesh.geometry.dispose(); } };
}

// pr (optional): Die Halle ist der PR-Raum. { rang, titel, level, ausgang }, die Übungen tragen scheiben und wert. prTuer (optional): Im Gym steht die Tür zum PR-Raum, der Aufruf kommt, wenn die Figur durch ist. abTuer: Die Figur kommt gerade aus dem PR-Raum zurück.
export async function raumOeffnen({ lade3d, titel, uebungen, beiStation, beiStationWeg, beiZu, spieler, status, pr, prTuer, abTuer, test }) {   // status (optional): liefert den Spielstand für die Waage im Eingang; ohne ihn gibt es keine Waage
  const LIVE = !pr;   // Live-Gym: Look der Vorlage, frei laufen (WASD, Maus, zwei Knüppel), Anzeige wie im Spiel; der PR-Raum bleibt, wie er ist
  const LOOK = document.documentElement.dataset.look, GOLD = LIVE || LOOK === 'gold', P = LIVE ? FARBEN_LIVE : GOLD ? FARBEN_GOLD : LOOK === 'klar' ? FARBEN_KLAR : FARBEN_LAGUNE;
  let zeitWahl = null; try { zeitWahl = localStorage.getItem('dk_gym_zeit'); } catch (e) {}
  const nativNacht = GOLD, zeitNacht = zeitWahl === 'nacht' || (zeitWahl !== 'tag' && nativNacht);   // Tag oder Nacht: ohne Wahl gilt die Farbwelt (Schwarz-Gold ist Nacht)
  const TAGP = nativNacht ? (LIVE ? AUSSEN_ABEND : AUSSEN_TAG) : P, NACHTP = nativNacht ? P : AUSSEN_NACHT;   // die Farben für draußen bei Tag und bei Nacht (Live-Gym: der helle Stand ist der Abend)
  // Oberfläche
  const wurzel = el('div', 'raum'); wurzel.setAttribute('role', 'dialog'); wurzel.setAttribute('aria-modal', 'true'); wurzel.setAttribute('aria-label', pr ? 'PR-Raum' : 'Trainingsraum');
  const bild = el('canvas', 'raum-bild'); bild.setAttribute('aria-label', 'Begehbares Gym mit den Geräten des Tages, von oben');
  const zu = el('button', 'raum-zu', '✕'); zu.type = 'button'; zu.setAttribute('aria-label', 'Raum verlassen');
  const kopf = el('div', 'raum-kopf'), kopfT = el('b', null, titel || 'Dein Gym heute'), kopfS = el('span', 'raum-stand');
  const punkte = el('div', 'raum-punkte'); if (!pr) uebungen.forEach(() => punkte.append(el('i')));
  const kopfText = el('div', 'raum-kopftext'); kopfText.append(kopfT, kopfS); kopf.append(zu, kopfText, punkte);
  const tipp = el('div', 'raum-tipp', pr ? 'Geh zu einem Gerät und trag deinen PR ein' : spieler ? 'Knüppel: laufen · Wischen: Kamera' + (status ? ' · Waage: Status' : '') : 'Station' + (status ? ', Waage' : '') + ' oder Spiegel antippen · Knüppel: selbst laufen');
  const stick = el('div', 'raum-stick'), stickK = el('i'); stick.append(stickK); stick.setAttribute('aria-hidden', 'true');
  const weiter = el('button', 'raum-weiter'); weiter.type = 'button';
  const unten = el('div', 'raum-unten'); unten.append(stick, weiter);
  const karte = el('section', 'raum-karte'), kKopf = el('div', 'raum-karte-kopf'), kNr = el('span', 'raum-nr'), kZurueck = el('button', 'raum-zurueck', 'Zurück'), kInhalt = el('div', 'raum-inhalt'); kZurueck.type = 'button';
  // Griff zum Runterwischen (07.11.2026, Devin: „damit du es einfach runtersliden kannst, damit du nur die Übung siehst … wieder hochsliden, wenn du fertig bist“)
  const kGriff = el('button', 'raum-griff'), kTitel = el('div', 'raum-kopf-links'), kName = el('b', 'raum-kname'); kGriff.type = 'button'; kGriff.append(el('i'));
  kGriff.setAttribute('aria-label', 'Karte nach unten schieben'); kGriff.setAttribute('aria-expanded', 'true');
  kTitel.append(kNr, kName); kKopf.append(kTitel, kZurueck); karte.append(kGriff, kKopf, kInhalt);
  const meldung = el('div', 'raum-meldung'); meldung.setAttribute('role', 'status');
  const popEl = el('div', 'raum-pop'), blitz = el('div', 'raum-blitz');
  const laden = el('div', 'raum-laden'), ladenT = el('p', null, 'Dein Gym wird aufgebaut …'); laden.append(el('i', 'raum-kreis'), ladenT);
  const ende = el('div', 'raum-ende');
  wurzel.append(bild, kopf, tipp, unten, karte, meldung, popEl, blitz, laden, ende);
  wurzel.classList.add('faehrt');
  document.body.append(wurzel);

  let a = null, offen = true, beobachter = null, aufraeumen = null, spiegelEnde = null, livePlan = null, liveKarte = null;   // livePlan, liveKarte: Anzeige im Live-Gym
  function schliessen(geschafft, still) {
    if (!offen) return; offen = false;
    if (beobachter) beobachter.disconnect();
    if (aufraeumen) aufraeumen();
    if (spiegelEnde) spiegelEnde();
    if (a) { a.entsorgen(); if (a.renderer.forceContextLoss) a.renderer.forceContextLoss(); }
    wurzel.remove();
    if (beiZu && !still) beiZu(!!geschafft);
  }
  zu.addEventListener('click', () => schliessen(false));

  let M, stehen;
  try { M = await lade3d(); stehen = (await import('./einleitung.js')).stehen; } catch (e) { ladenT.textContent = 'Das Gym lädt gerade nicht. Später nochmal öffnen.'; return; }
  if (!offen) return;
  const { THREE, V, Ansicht, gelenke } = M;
  const Y = V(0, 1, 0), css = (n) => getComputedStyle(wurzel).getPropertyValue(n).trim();

  a = new Ansicht(bild, { hell: !GOLD, hintergrund: P.himmel, farbeA: css('--verlauf-a'), farbeB: css('--verlauf-b') });
  a.steuerung.dispose();
  a.steuerung = { autoRotate: false, target: V(), minDistance: 0, maxDistance: 0, update() {}, dispose() {}, getAzimuthalAngle: () => 0 };   // die Kamera führt der Raum selbst
  if (spieler && spieler.bauen) { try { await spieler.bauen(a, M); } catch (e) { schliessen(false, true); throw e; } if (!offen) return; }
  const hochkant = () => bild.clientHeight > bild.clientWidth * 1.2;
  const sichtOben = () => (hochkant() ? 60 : 44), sichtStation = () => (hochkant() ? 56 : 42);
  a.kamera.near = 0.1; a.kamera.far = 1200; a.kamera.fov = sichtOben(); a.kamera.updateProjectionMatrix();
  const szene = a.szene;
  for (const o of szene.children) if (o.isMesh && /Circle|Ring/.test(o.geometry.type)) o.visible = false;   // Boden und Ring der Bühne: hier nicht
  if (GOLD && !LIVE) { const lila = new THREE.DirectionalLight(0x9b6cff, spieler ? 0.5 : 1.5); lila.position.set(-1, 5, -2.5); szene.add(lila); }
  if (LIVE) { const warm = new THREE.DirectionalLight(0xffc27a, 1.1); warm.position.set(-2, 5, -3); szene.add(warm); }   // Live-Gym: warmes Licht von den goldenen LED
  const lichter = szene.children.filter((o) => o.isDirectionalLight);
  let kameraLicht = null;   // eigener Charakter: warmes Licht aus Richtung der Kamera, so stimmt der Hautton von jeder Seite
  if (spieler) { kameraLicht = new THREE.DirectionalLight(0xfff0e4, GOLD ? 1.1 : 0.6); szene.add(kameraLicht); }
  const halle = hallenMass(uebungen.length);
  szene.fog = new THREE.Fog(P.himmelHorizont,Math.max(70, halle.laenge + 30), 520 + halle.laenge);
  // Geräte passend zum Raum
  const gm = a.geraete;
  gm.mRahmen.color.set(P.rahmen); gm.mPolster.color.set(P.polster); gm.mGummi.color.set(P.gummi);
  if (P.metall) { gm.mMetall.color.set(P.metall); gm.mKabel.color.set(P.metall); }

  const tex = (c, wdh) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (wdh) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const grund = (farbe, opt) => new THREE.MeshBasicMaterial(Object.assign({ color: farbe, toneMapped: false }, opt));
  const flach = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); return m; };
  const kiste = (b, h, t) => {   // Kiste mit festen Farben je Seite: bleibt beim Stationswechsel gleich hell
    const g = new THREE.BoxGeometry(b, h, t), c = [], farbe = new THREE.Color();
    for (const x of P.seiten) { farbe.set(x); for (let i = 0; i < 4; i++) c.push(farbe.r, farbe.g, farbe.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
  };

  /* ---------- Plan der Halle ---------- */
  const raum = new THREE.Group(); szene.add(raum);
  const N = uebungen.length, { zStart, zStation, zEnde, zAnfang, laenge: LAENGE, zMitte } = halle;
  const stationen = uebungen.map((u, i) => {
    const links = i % 2 === 0, x = halle.stationX(i);
    return { i, u, links, d: u.d, pos: V(x, 0, zStation(i)), winkel: halle.stationWinkel(i), fertig: !!u.fertig, anim: null, statisch: null };
  });
  const ausLokal = (s, v) => v.clone().applyAxisAngle(Y, s.winkel).add(s.pos);

  /* ---------- Umgebung: Himmel mit Sonne und Meer, das auf die Halle zuläuft (09.11.2026, Devin: „freier … du guckst nach draußen, dann siehst du das Meer … moderner, schöner, mit mehr Design“) ---------- */
  // Farben für Schattierungen kommen als „#RRGGBB“ und gehen ungewandelt in die Schattierer (wie bei wegA und wegB)
  const rgb = (h) => new THREE.Vector3(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  // Himmel: eine große Kugel um alles, im Bildraum „Welt“ (nicht in der Halle), dreht aber mit der Halle mit (legeHalle), so bleibt die Sonne am selben Platz
  const himmelU = { oben: { value: rgb(P.himmelOben) }, horizont: { value: rgb(P.himmelHorizont) }, sonne: { value: rgb(P.sonne) }, sonneRicht: { value: (LIVE ? V(0.82, 0.075, -0.45) : V(0.78, 0.3, 0.55)).normalize() }, mondRicht: { value: (LIVE ? V(0.76, 0.17, -0.5) : V(0.78, 0.155, 0.5)).normalize() }, nacht: { value: 0 }, abend: { value: LIVE ? 1 : 0 } };   // Live-Gym: tiefe Abendsonne vorn rechts, durch die Glasfront zu sehen
  const himmel = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), new THREE.ShaderMaterial({ uniforms: himmelU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vR; void main(){ vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vR; uniform vec3 oben, horizont, sonne, sonneRicht, mondRicht; uniform float nacht, abend;
      float hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){
        vec3 r = normalize(vR); float h = clamp(r.y, 0.0, 1.0);
        vec3 c = mix(horizont, oben, pow(h, 0.5));
        float s = max(dot(r, sonneRicht), 0.0);
        c += sonne * (pow(s, 700.0) * 1.3 + pow(s, 14.0) * 0.2 + (pow(s, 5.0) * 0.38 + pow(s, 60.0) * 0.5) * abend) * (1.0 - nacht);   // abend: großer warmer Hof um die tiefe Sonne (Live-Gym)
        float m = dot(r, mondRicht);
        float scheibe = smoothstep(0.99935, 0.99965, m);
        c += sonne * (0.82 + 0.18 * sin(r.x * 1400.0 + r.y * 900.0) * sin(r.z * 1100.0)) * scheibe * nacht;
        c += sonne * (pow(max(m, 0.0), 260.0) * 0.45 + pow(max(m, 0.0), 16.0) * 0.1) * nacht;
        vec3 q = floor(r * 280.0);
        c += vec3(0.85, 0.9, 1.0) * step(0.9984, hsh(q)) * (0.35 + 0.65 * hsh(q + 3.1)) * smoothstep(0.1, 0.5, r.y) * nacht * (1.0 - scheibe);
        gl_FragColor = vec4(c, 1.0);
      }` }));
  himmel.renderOrder = -10; himmel.frustumCulled = false; szene.add(himmel);
  // Meer: Farbe von flach (nah an der Halle) zu tief, Schaumbänder wandern auf die Terrassen zu, Glitzer; zum Horizont geht es in die Farbe des Himmels über
  const meerU = { zeit: { value: 0 }, zOff: { value: zMitte }, nah: { value: rgb(P.meerNah) }, fern: { value: rgb(P.meerFern) }, schaum: { value: rgb(P.schaum) }, glitzer: { value: rgb(P.glitzer) }, nebel: { value: rgb(P.himmelHorizont) },
    kante: { value: new THREE.Vector3(BREITE / 2 + TERRASSE, zAnfang + 10, zEnde - 8) }, lichtV: { value: V(0, 1, 0) }, lichtC: { value: V(1, 1, 1) } };
  const meerGeo = new THREE.PlaneGeometry(1800, 1800); meerGeo.rotateX(-Math.PI / 2);
  const meer = new THREE.Mesh(meerGeo, new THREE.ShaderMaterial({ uniforms: meerU, fog: false,
    // Der Abstand zur Kamera wird erst im Bildpunkt aus der Lage im Blickraum gerechnet (ein Abstand je Ecke der riesigen Fläche wäre über das ganze Meer falsch gemittelt).
    // Wellen (09.11.2026): drei Wellenzüge geben die Steigung, daraus kommen Lichtspiegelung von Sonne oder Mond (Glanzpfad), Spiegelung des Horizonts am flachen Blickwinkel und Hell und Dunkel der Wellen
    vertexShader: 'varying vec2 vP; varying vec3 vV, vNx, vNy, vNz; uniform float zOff; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; vP = position.xz + vec2(0.0, zOff); vNx = normalMatrix * vec3(1.0, 0.0, 0.0); vNy = normalMatrix * vec3(0.0, 1.0, 0.0); vNz = normalMatrix * vec3(0.0, 0.0, 1.0); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec2 vP; varying vec3 vV, vNx, vNy, vNz; uniform float zeit; uniform vec3 nah, fern, schaum, glitzer, nebel, kante, lichtV, lichtC;
      void main(){
        float vD = length(vV);
        float dx = max(abs(vP.x) - kante.x, 0.0), dz = max(max(vP.y - kante.y, kante.z - vP.y), 0.0);
        float d = length(vec2(dx, dz));
        float tief = smoothstep(0.0, 90.0, d);
        vec3 c = mix(nah, fern, pow(tief, 0.7));
        float w = sin(d * 0.55 + zeit * 1.1 + sin(vP.y * 0.07 + zeit * 0.2) * 2.0 + sin(vP.x * 0.05) * 1.5);
        float band = smoothstep(0.8, 1.0, w) * (1.0 - smoothstep(0.0, 60.0, d)) * 0.55;
        c += (schaum - c) * band;
        vec2 d1 = vec2(0.90, 0.44), d2 = vec2(-0.42, 0.91), d3 = vec2(0.24, -0.97);
        vec2 g = d1 * cos(dot(d1, vP) * 0.9 + zeit * 0.9) * 0.054 + d2 * cos(dot(d2, vP) * 1.7 + zeit * 1.3) * 0.070 + d3 * cos(dot(d3, vP) * 2.9 + zeit * 2.0) * 0.060;
        g *= 1.0 - smoothstep(25.0, 220.0, vD);
        vec3 nH = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 nV = normalize(nH.x * vNx + nH.y * vNy + nH.z * vNz);
        vec3 V = normalize(-vV);
        float fr = pow(1.0 - max(dot(nV, V), 0.0), 4.0);
        c = mix(c, nebel * 0.85 + 0.06, fr * 0.5);
        c *= 0.92 + 0.5 * (g.x * 0.9 + g.y * 0.6);
        vec3 R = reflect(-V, nV);
        float sp = max(dot(R, lichtV), 0.0);
        c += lichtC * (pow(sp, 700.0) * 2.2 + pow(sp, 70.0) * 0.3) * (1.0 - smoothstep(80.0, 420.0, vD));
        float spiel = 0.5 + 0.5 * sin(vP.x * 0.9 + vP.y * 0.7 + zeit * 1.4) * sin(vP.x * 0.5 - vP.y * 0.8 - zeit * 0.9);
        c = mix(c, c * 1.08 + 0.02, spiel * 0.35 * (1.0 - tief));
        // Glitzer: einzelne runde Funken, je Feld ein eigener Takt (ein Muster aus Sinuswellen sah wie ein Gitter aus), weit weg nicht mehr (sonst flimmert es)
        vec2 zelle = floor(vP * 1.3), innen = fract(vP * 1.3) - 0.5; float hz = fract(sin(dot(zelle, vec2(12.9898, 78.233))) * 43758.5453);
        float fk = pow(max(0.0, sin(zeit * (0.8 + hz) * 2.0 + hz * 40.0)), 20.0) * step(0.6, hz) * pow(smoothstep(0.5, 0.0, length(innen)), 2.0) * (1.0 - smoothstep(8.0, 70.0, vD));
        c += glitzer * fk * 0.9;
        c = mix(c, nebel, smoothstep(80.0, 560.0, vD));
        gl_FragColor = vec4(c, 1.0);
      }` }));
  meer.position.set(0, -0.45, zMitte); meer.renderOrder = -5; raum.add(meer);

  /* ---------- Boden der Halle: Platten, Spiegelung der LED-Schienen ---------- */
  const bodenT = tex(zeichne(2048, 512, (x, b, h) => {
    const g = x.createLinearGradient(0, 0, b, 0); g.addColorStop(0, P.bodenB); g.addColorStop(0.5, P.bodenA); g.addColorStop(1, P.bodenB); x.fillStyle = g; x.fillRect(0, 0, b, h);
    const streifenX = (mx, br) => { const s = x.createLinearGradient(mx - br, 0, mx + br, 0); s.addColorStop(0, P.bodenLicht0); s.addColorStop(0.5, P.bodenLicht); s.addColorStop(1, P.bodenLicht0); x.fillStyle = s; x.fillRect(mx - br, 0, br * 2, h); };
    for (const sx of SCHIENEN_X) { streifenX(b * (0.5 - sx / BREITE), b * 0.84 / BREITE); streifenX(b * (0.5 + sx / BREITE), b * 0.84 / BREITE); }
    const s = x.createLinearGradient(0, h * 0.34, 0, h * 0.66); s.addColorStop(0, P.bodenLicht0); s.addColorStop(0.5, P.bodenLicht); s.addColorStop(1, P.bodenLicht0); x.fillStyle = s; x.fillRect(0, h * 0.34, b, h * 0.32);
    x.strokeStyle = P.fuge; x.lineWidth = 2;
    const spalten = Math.round(BREITE / 2); for (let i = 1; i < spalten; i++) { x.beginPath(); x.moveTo(b * i / spalten, 0); x.lineTo(b * i / spalten, h); x.stroke(); }
    x.beginPath(); x.moveTo(0, 1); x.lineTo(b, 1); x.stroke();
    x.strokeStyle = P.studio.wandLinie; x.lineWidth = 5;   // schmale Lichtlinie 0,6 m vor jeder Längswand (Studio-Look)
    for (const sx of [0.6, BREITE - 0.6]) { x.beginPath(); x.moveTo(b * sx / BREITE, 0); x.lineTo(b * sx / BREITE, h); x.stroke(); }
  }), true);
  bodenT.repeat.set(1, LAENGE / FACH);
  /* Live-Gym: polierter schwarzer Marmor mit goldenen und hellen Adern in großen Platten (1,25 m), der die Halle spiegelt (Spiegelrechnung wie die Spiegelwand, unscharf wie echter Stein, am flachen Blick stärker).
     Ein Bild deckt 4 × 4 Platten (5 m), die Adern laufen über die Fugen; die Fugen rechnet der Schattierer. Der Spiegel wird je nach Qualitätsstufe kleiner oder abgeschaltet (dann bleibt der Glanz der Platten). */
  let bodenSp = null, bodenOpt = null;
  if (LIVE) {
    const GR = matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
    const marmor = new THREE.CanvasTexture(zeichne(GR, GR, (x, b, h) => {
      x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, b, h);
      for (let k = 0; k < 90; k++) {   // weiche Wolken im Stein
        const px = ruheL(k, 1) * b, py = ruheL(k, 2) * h, r = (0.05 + ruheL(k, 3) * 0.22) * b, g = x.createRadialGradient(px, py, 0, px, py, r), w = ruheL(k, 4) > 0.5;
        g.addColorStop(0, w ? 'rgba(60,54,48,0.16)' : 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
      }
      const ader = (k, farbe, breite, schritte) => {   // eine Ader: ein unruhiger Weg mit Verzweigungen, dreimal versetzt gezeichnet, damit sie über den Rand nahtlos weiterläuft
        let px = ruheL(k, 5) * b, py = ruheL(k, 6) * h, w = ruheL(k, 7) * Math.PI * 2; const weg = [[px, py]];
        for (let i = 0; i < schritte; i++) { w += (ruheL(k * 31 + i, 8) - 0.5) * 0.9; const l = b * (0.01 + ruheL(k + i, 9) * 0.02); px += Math.cos(w) * l; py += Math.sin(w) * l; weg.push([px, py]); }
        for (const ox of [-b, 0, b]) for (const oy of [-h, 0, h]) {
          x.beginPath(); weg.forEach(([qx, qy], i) => (i ? x.lineTo(qx + ox, qy + oy) : x.moveTo(qx + ox, qy + oy))); x.strokeStyle = farbe; x.lineWidth = breite; x.stroke();
        }
      };
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.shadowColor = 'rgba(214,170,92,0.4)'; x.shadowBlur = b / 500;
      for (let k = 0; k < 10; k++) ader(k, 'rgba(206,164,92,' + (0.16 + ruheL(k, 10) * 0.3).toFixed(2) + ')', b / 1500 + ruheL(k, 11) * b / 1000, 60 + Math.floor(ruheL(k, 12) * 80));
      x.shadowBlur = 0;
      for (let k = 16; k < 46; k++) ader(k, 'rgba(190,175,150,' + (0.08 + ruheL(k, 10) * 0.14).toFixed(2) + ')', b / 1400, 30 + Math.floor(ruheL(k, 12) * 50));
      for (let k = 0; k < 2600; k++) { x.fillStyle = 'rgba(255,240,210,' + (ruheL(k, 13) * 0.06).toFixed(3) + ')'; x.fillRect(ruheL(k, 14) * b, ruheL(k, 15) * h, 1.5, 1.5); }
    }));
    marmor.wrapS = marmor.wrapT = THREE.RepeatWrapping; marmor.anisotropy = 8;   // ungewandelt (wie das Spiegelbild schon im Farbraum des Bildschirms)
    bodenSp = spiegelFlaeche(THREE, BREITE, LAENGE, bodenOpt = { skala: 0.5, ohneBremse: true, innen: () => K.pos.y < WAND && K.pos.x > -BREITE / 2 && K.pos.x < BREITE / 2 && K.pos.z < zAnfang && K.pos.z > zEnde,
      uni: { marmor: { value: marmor }, wdh: { value: new THREE.Vector2(BREITE / 5, LAENGE / 5) }, an: { value: 1 }, glanzStark: { value: 0.62 } },
      stoff: (uni) => new THREE.ShaderMaterial({ uniforms: uni, fog: false, toneMapped: false,
        vertexShader: 'uniform mat4 textureMatrix; varying vec4 vT; varying vec2 vU; varying vec3 vW; void main(){ vT = textureMatrix * vec4(position, 1.0); vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform sampler2D tSpiegel, marmor; uniform vec2 wdh; uniform float an, glanzStark; varying vec4 vT; varying vec2 vU; varying vec3 vW;
          void main(){
            vec2 st = vU * wdh; vec3 c = texture2D(marmor, st).rgb;
            vec2 f = fract(st * 4.0), fr = min(f, 1.0 - f); float rand = min(fr.x, fr.y), fuge = smoothstep(0.0, 0.006, rand);   // Fugen der Platten
            c *= mix(0.25, 1.0, fuge); c += vec3(0.05, 0.04, 0.03) * (1.0 - smoothstep(0.006, 0.016, rand)) * fuge;
            vec3 v = normalize(cameraPosition - vW); float fres = 0.22 + 0.78 * pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
            if (an > 0.5) {
              vec2 uv = vT.xy / vT.w, ver = (c.rg - 0.05) * 0.012;   // die Adern verziehen das Bild ein wenig, ein Hauch Unschärfe wie bei Stein
              vec2 d = vec2(0.0016, 0.0022);
              vec3 r = texture2D(tSpiegel, uv + ver).rgb * 0.36 + (texture2D(tSpiegel, uv + ver + d).rgb + texture2D(tSpiegel, uv + ver - d).rgb + texture2D(tSpiegel, uv + ver + vec2(-d.x, d.y)).rgb + texture2D(tSpiegel, uv + ver + vec2(d.x, -d.y)).rgb) * 0.16;
              float k = glanzStark * fres * fuge; c = c * (1.0 - k * 0.6) + r * k;
            }
            gl_FragColor = vec4(c, 1.0);
          }` }) });
    bodenSp.mesh.rotation.x = -Math.PI / 2; bodenSp.mesh.position.set(0, 0, zMitte); bodenSp.mesh.renderOrder = -1; raum.add(bodenSp.mesh);
  } else raum.add(flach(new THREE.PlaneGeometry(BREITE, LAENGE), grund(0xffffff, { map: bodenT }), 0, 0, zMitte));
  // Terrassen aus Holz rund um die Halle, dazu je ein Steg ins Meer vor dem Eingang und hinter dem Ziel
  const holzT = tex(zeichne(256, 256, (x, b, h) => {
    for (let i = 0; i < 8; i++) { x.fillStyle = TAGP.holz[i % 2]; x.fillRect(i * 32, 0, 32, h); }   // acht Bohlen nebeneinander
    x.fillStyle = 'rgba(0,0,0,.16)'; for (let i = 0; i < 8; i++) { x.fillRect(i * 32, 0, 2, h); x.fillRect(i * 32, (i * 97) % h, 32, 2); }   // Fugen und versetzte Stöße
  }), true);
  const holzMats = [];
  const planken = (b, l, x, y, z) => { const t = holzT.clone(); t.needsUpdate = true; t.repeat.set(b / 1.6, l / 1.6); const m = flach(new THREE.PlaneGeometry(b, l), grund(0xffffff, { map: t }), x, y, z); raum.add(m); holzMats.push(m.material); return m; };
  for (const s of [-1, 1]) planken(TERRASSE, LAENGE, s * (BREITE / 2 + TERRASSE / 2), -0.02, zMitte);   // Terrassen an den Längsseiten
  planken(BREITE + 2 * TERRASSE, 10, 0, -0.02, zAnfang + 5);   // Vorplatz am Eingang
  planken(BREITE + 2 * TERRASSE, 8, 0, -0.02, zEnde - 4);   // Terrasse hinter dem Ziel
  planken(TUER_B + 1.2, 16, 0, -0.01, zAnfang + 18);   // Steg ins Meer vor dem Eingang
  planken(TUER_B + 1.2, 30, 0, -0.01, zEnde - 23);   // Steg ins Meer hinter dem Ziel

  /* ---------- Glashalle (09.11.2026): Sockel, Glas mit Glanz, schmale Sprossen und ein Balken oben; das Dach bleibt offen (Himmel, Sonne), nur Sparren und LED-Schienen ---------- */
  const wandM = grund(0xffffff, { vertexColors: true });
  const glasM = new THREE.MeshBasicMaterial({ color: P.glasTon, transparent: true, opacity: P.glasStark, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const sprosseM = grund(P.sprosse), sprosseGeo = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), qNull = new THREE.Quaternion();
  const glanzT = tex(zeichne(256, 128, (x, b, h) => {   // drei schräge Lichtbänder wie Spiegelungen im Glas
    for (const [px, br, al] of [[30, 40, 0.55], [105, 14, 0.35], [160, 52, 0.4]]) {
      const g = x.createLinearGradient(px, 0, px + br, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + al + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + br, 0); x.lineTo(px + br - 46, h); x.lineTo(px - 46, h); x.closePath(); x.fill();
    }
  }), true);
  // Eine Glasfront von (x0, z0) nach (x1, z1) in Hallen-Koordinaten, von der Höhe y0 bis y0 + h. Gibt die Gruppe zurück (zum Ausblenden)
  function glasFront(x0, z0, x1, z1, y0, h, opt) {
    const o = Object.assign({ raster: 2.45, dick: 0.1, sockel: 0, balken: false }, opt), dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.max(1, Math.round(L / o.raster));
    const g = new THREE.Group(); g.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2); g.rotation.y = Math.atan2(-dz, dx); raum.add(g);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(L, h), glasM));
    const t = glanzT.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, L / 9), 1);
    const glanz = new THREE.Mesh(new THREE.PlaneGeometry(L, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: P.glanzStark, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    glanz.position.z = 0.012; g.add(glanz);
    const sp = new THREE.InstancedMesh(sprosseGeo, sprosseM, n + 1);
    for (let i = 0; i <= n; i++) { m4.compose(V(-L / 2 + i * L / n, 0, 0), qNull, V(o.dick, h, o.dick * 1.6)); sp.setMatrixAt(i, m4); }
    sp.instanceMatrix.needsUpdate = true; sp.frustumCulled = false; g.add(sp);
    if (o.sockel) { const s = new THREE.Mesh(kiste(L, o.sockel, 0.3), wandM); s.position.y = -h / 2 - o.sockel / 2; g.add(s); }
    if (o.balken) { const b = new THREE.Mesh(kiste(L, 0.3, 0.34), wandM); b.position.y = h / 2 + 0.15; g.add(b); }
    return g;
  }
  const SOCKEL = 0.5, hGlas = WAND - SOCKEL, wandVorn = [], wandHinten = [];
  /* Studio-Gebäude (09.11.2026, Devin: „… wie ein richtiges, modernes Fitnessstudio, modern, schwarz, nicht hell … von außen Wände und ein Flachdach, von oben nicht hineinsehen“):
     Wände zu, Dach zu, das Meer nur durch die Glasfront rechts. Dach und Decke sind ein Quader: Die Oberseite sieht man nur von oben, die Unterseite nur von unten, dazwischen gibt es keinen Durchblick. */
  const ST = P.studio;
  const ruhe = (u, v) => { const s = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453; return s - Math.floor(s); };   // fester „Zufall“ für feines Korn, damit die Flächen nicht flach wirken
  const korn = (x, b, h, n, a, sal) => { for (let k = 0; k < n; k++) { x.fillStyle = 'rgba(255,255,255,' + (ruhe(k, sal) * a).toFixed(3) + ')'; x.fillRect(ruhe(k, sal + 1) * b, ruhe(k, sal + 2) * h, 2, 2); } };
  const wandT = tex(zeichne(1024, 1024, (x, b, h) => {   // Innenwand: vier Platten je Feld, dunkle Fugen mit feinem Lichtrand, Sockelleiste mit Lichtlinie
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, ST.wandB); g.addColorStop(0.5, ST.wand); g.addColorStop(1, ST.wandB); x.fillStyle = g; x.fillRect(0, 0, b, h);
    for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(i * b / 4 - 3, 0, 6, h); x.fillStyle = ST.wandLinie; x.globalAlpha = 0.3; x.fillRect(i * b / 4 + 3, 0, 2, h); x.globalAlpha = 1; }
    x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, h * 0.9, b, h * 0.1);
    x.fillStyle = ST.wandLinie; x.fillRect(0, h * 0.9 - 3, b, 5);
    x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, b, h * 0.05);
    korn(x, b, h, 1500, 0.035, 1);
  }), true);
  const fassadeT = tex(zeichne(1024, 1024, (x, b, h) => {   // Außenwand: dunkle Platten mit schmalen Lichtlinien oben und unten
    x.fillStyle = ST.fassade; x.fillRect(0, 0, b, h);
    for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(i * b / 4 - 2, 0, 4, h); }
    x.fillStyle = ST.fassadeLinie; x.fillRect(0, h * 0.04, b, 4); x.fillRect(0, h * 0.9, b, 3);
    korn(x, b, h, 1200, 0.03, 5);
  }), true);
  const deckeT = tex(zeichne(512, 512, (x, b, h) => {   // Akustikdecke: Platten mit feiner Fuge und Lamellen
    x.fillStyle = ST.decke; x.fillRect(0, 0, b, h);
    x.strokeStyle = ST.deckeLinie; x.lineWidth = 3; x.strokeRect(2, 2, b - 4, h - 4);
    x.fillStyle = 'rgba(255,255,255,.025)'; for (let i = 0; i < 16; i++) x.fillRect(0, i * h / 16, b, 2);
  }), true);
  deckeT.repeat.set(BREITE / 3.1, LAENGE / 3.1);
  const dachT = tex(zeichne(512, 512, (x, b, h) => {   // Dachhaut in Bahnen
    x.fillStyle = ST.dach; x.fillRect(0, 0, b, h);
    x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, 0, b, 3); x.fillRect(0, 0, 3, h);
    korn(x, b, h, 600, 0.04, 8);
  }), true);
  dachT.repeat.set(BREITE / 2.4, LAENGE / 2.4);
  // Stoff für eine Wandfläche der Länge laenge ab Höhe y0 mit Höhe h (die Platten bleiben überall gleich groß)
  const flaeche = (T, laenge, y0, h) => { const t = T.clone(); t.needsUpdate = true; t.repeat.set(Math.max(0.2, laenge / FACH), h / WAND); t.offset.set(0, y0 / WAND); return grund(0xffffff, { map: t }); };
  const obenM = grund(ST.dach);
  // Wandquader von (x0, z0) bis (x1, z1); innen: welche Seite in die Halle schaut ('+x', '-x', '+z' oder '-z'), die anderen sind Außenwand
  const wandKasten = (x0, x1, z0, z1, y0, y1, innen) => {
    const bx = x1 - x0, bz = z1 - z0, h = y1 - y0, laengs = innen === '+x' || innen === '-x', len = laengs ? bz : bx;
    const mi = flaeche(wandT, len, y0, h), ma = flaeche(fassadeT, len, y0, h), m = [ma, ma, obenM, obenM, ma, ma];
    m[{ '+x': 0, '-x': 1, '+z': 4, '-z': 5 }[innen]] = mi;
    const k = new THREE.Mesh(new THREE.BoxGeometry(bx, h, bz), m); k.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return k;
  };
  const wandL = new THREE.Group(); raum.add(wandL);   // linke Längswand: zu (Spiegel und DK-Tafeln kommen dazu)
  wandL.add(wandKasten(-BREITE / 2 - WAND_D / 2, -BREITE / 2 + WAND_D / 2, zEnde + WAND_D / 2, zAnfang - WAND_D / 2, 0, WAND, '+x'));
  const wandR = glasFront(BREITE / 2, zAnfang, BREITE / 2, zEnde, SOCKEL, hGlas, { sockel: SOCKEL, balken: true });   // rechte Längswand: die Glasfront zum Meer
  for (const z of [zAnfang, zEnde]) {   // Stirnwände mit Türöffnung (Eingang und Ziel)
    const liste = z === zAnfang ? wandVorn : wandHinten, innen = z === zAnfang ? '-z' : '+z', z0 = z - WAND_D / 2, z1 = z + WAND_D / 2;
    for (const m of [wandKasten(-BREITE / 2 - WAND_D / 2, -TUER_B / 2, z0, z1, 0, WAND, innen), wandKasten(TUER_B / 2, BREITE / 2 + WAND_D / 2, z0, z1, 0, WAND, innen), wandKasten(-TUER_B / 2, TUER_B / 2, z0, z1, TUER_H, WAND, innen)]) { raum.add(m); liste.push(m); }
  }
  // Flachdach mit Rand; die Unterseite des Quaders ist die Decke
  const fassM = grund(0xffffff, { map: fassadeT }), dachM = grund(0xffffff, { map: dachT }), deckeM = grund(0xffffff, LIVE ? { map: deckeT, transparent: true, opacity: 0.96, depthWrite: false } : { map: deckeT });   // Live-Gym: Glasdach, nachts fast schwarz, am Abend sieht man den Himmel
  const dachPlatte = new THREE.Mesh(new THREE.BoxGeometry(BREITE + 2 * WAND_D, 0.35, LAENGE + 2 * WAND_D), [fassM, fassM, dachM, deckeM, fassM, fassM]);
  dachPlatte.position.set(0, WAND + 0.175, zMitte); raum.add(dachPlatte);
  if (LIVE) {   // Glasdach: dunkle Träger quer und längs, die LED-Schienen sitzen darunter
    const balkenM = grund(0x0b0b0e), bh = 0.16, by = WAND - 0.09 + bh / 2;
    for (let z = zAnfang - FACH / 2; z > zEnde; z -= FACH) { const b = new THREE.Mesh(new THREE.BoxGeometry(BREITE, bh, 0.26), balkenM); b.position.set(0, by, z); raum.add(b); }
    for (const x of [...SCHIENEN_X, ...SCHIENEN_X.map((v) => -v)]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, bh, LAENGE), balkenM); b.position.set(x, by + 0.002, zMitte); raum.add(b); }
  }
  const randM = grund(ST.fassade);
  for (const [bx, bz, px, pz] of [[BREITE + 2 * WAND_D, 0.2, 0, zAnfang + WAND_D - 0.1], [BREITE + 2 * WAND_D, 0.2, 0, zEnde - WAND_D + 0.1], [0.2, LAENGE + 2 * WAND_D, -BREITE / 2 - WAND_D + 0.1, zMitte], [0.2, LAENGE + 2 * WAND_D, BREITE / 2 + WAND_D - 0.1, zMitte]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(bx, 0.45, bz), randM); r.position.set(px, WAND + 0.35 + 0.225, pz); raum.add(r);
  }
  // Geländer aus Glas am Rand der Längsterrassen
  for (const s of [-1, 1]) glasFront(s * (BREITE / 2 + TERRASSE), zAnfang, s * (BREITE / 2 + TERRASSE), zEnde, 0, 1.0, { raster: 3, dick: 0.07 });
  // Palmen (09.11.2026, Devin: „bessere Qualität von Palmen“): geringelter, gebogener Stamm, sechzehn Wedel mit Mittelrippe und Fiedern; eine Form, viele Plätze; die Farben gelten für den Tag, bei Nacht dunkelt ein Ton sie ab
  function palmenGeo() {
    const pos = [], farbe = [], idx = [], c0 = new THREE.Color(TAGP.palme[0]), c1 = new THREE.Color(TAGP.palme[1]), stamm = new THREE.Color(TAGP.holz[1]).multiplyScalar(0.7), ring = new THREE.Color(TAGP.holz[1]).multiplyScalar(0.45);
    const punkt = (x, y, z, c) => { pos.push(x, y, z); farbe.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
    const HS = 4.6, RINGE = 10, SEITEN = 8, biege = (u) => 0.6 * u * u;
    for (let i = 0; i <= RINGE; i++) { const u = i / RINGE, r = 0.19 - 0.075 * u + (i % 2 ? 0.012 : 0); for (let j = 0; j < SEITEN; j++) { const w = j / SEITEN * Math.PI * 2; punkt(biege(u) + Math.cos(w) * r, u * HS, Math.sin(w) * r, i % 2 ? stamm : ring); } }
    for (let i = 0; i < RINGE; i++) for (let j = 0; j < SEITEN; j++) { const p = i * SEITEN + j, q = i * SEITEN + (j + 1) % SEITEN; idx.push(p, q, p + SEITEN, q, q + SEITEN, p + SEITEN); }
    const sx = biege(1), WEDEL = 14, SEG = 12;
    for (let k = 0; k < WEDEL; k++) {
      const az = k / WEDEL * Math.PI * 2 + k * 0.55, hub = 0.5 + 0.32 * Math.sin(k * 1.9), L = 2.5 + 0.4 * Math.sin(k * 2.7), cx = Math.cos(az), cz = Math.sin(az), sa = -cz, sb = cx;   // sa, sb: waagerecht quer zum Wedel
      const R = [];
      for (let s = 0; s <= SEG; s++) { const t = s / SEG, aus = t * L * Math.cos(hub), auf = t * L * Math.sin(hub) - 1.7 * t * t; R.push([sx + cx * aus, HS + auf, cz * aus]); }
      let vorher = -1;
      for (let s = 0; s <= SEG; s++) {   // Mittelrippe als schmaler Streifen
        const t = s / SEG, br = 0.035 * (1 - t * 0.6), c = c0.clone().lerp(c1, t * 0.7), px = R[s][0], py = R[s][1], pz = R[s][2];
        const l = punkt(px - sa * br, py, pz - sb * br, c); punkt(px + sa * br, py, pz + sb * br, c);
        if (vorher >= 0) idx.push(vorher, vorher + 1, l, vorher + 1, l + 1, l);
        vorher = l;
      }
      for (let s = 1; s < SEG; s++) {   // Fiedern: je Rippenstück links und rechts ein schmales Dreieck, nach außen und unten gebogen
        const t = s / SEG, len = 1.05 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.08)) * (1 - 0.3 * t) + 0.12, c = c0.clone().lerp(c1, t), a = R[s], b = R[s + 1];
        for (const seite of [-1, 1]) {
          const tx = (a[0] + b[0]) / 2 + sa * seite * len + cx * len * 0.22, ty = (a[1] + b[1]) / 2 - len * 0.7, tz = (a[2] + b[2]) / 2 + sb * seite * len + cz * len * 0.22;
          const i0 = punkt(a[0], a[1], a[2], c), i1 = punkt(b[0], b[1], b[2], c), i2 = punkt(tx, ty, tz, c1.clone().lerp(c0, 0.15 + 0.2 * (1 - t)));
          idx.push(i0, i1, i2);
        }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(farbe, 3)); g.setIndex(idx); return g;
  }
  const palmenOrte = [];
  for (let z = zAnfang - 2, i = 0; z > zEnde + 4; z -= 11, i++) for (const s of [-1, 1]) palmenOrte.push([s * (BREITE / 2 + 1.8 + ((i * 7 + (s > 0 ? 3 : 0)) % 3) * 0.9), z - (s > 0 ? 4 : 0), 0.9 + ((i * 13 + (s > 0 ? 2 : 0)) % 5) * 0.08]);
  palmenOrte.push([-(BREITE / 2 + 3.5), zAnfang + 4, 1.1], [BREITE / 2 + 3.5, zAnfang + 3, 1.0], [-(BREITE / 2 + 2.5), zEnde - 3, 1.0], [BREITE / 2 + 2.5, zEnde - 4, 1.15]);
  const palmen = new THREE.InstancedMesh(palmenGeo(), grund(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), palmenOrte.length);
  palmenOrte.forEach(([x, z, sk], i) => { m4.compose(V(x, 0, z), new THREE.Quaternion().setFromAxisAngle(Y, i * 2.4), V(sk, sk, sk)); palmen.setMatrixAt(i, m4); });
  palmen.instanceMatrix.needsUpdate = true; palmen.frustumCulled = false; raum.add(palmen);

  /* ---------- LED: leuchtende Schienen oben, Lichtschein drumherum ---------- */
  const scheinT = tex(zeichne(32, 128, (x, b, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, b, h); }));
  const scheinM = grund(P.halo, { map: scheinT, transparent: true, depthWrite: false, opacity: P.haloStark, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const scheinTL = scheinT.clone(); scheinTL.center.set(0.5, 0.5); scheinTL.rotation = Math.PI / 2; scheinTL.needsUpdate = true;
  const scheinML = scheinM.clone(); scheinML.map = scheinTL;
  const ledM = grund(P.led, { fog: false });
  const leiste = (langs, laenge, x, y, z) => {
    const m = new THREE.Mesh(langs ? new THREE.BoxGeometry(0.07, 0.07, laenge) : new THREE.BoxGeometry(laenge, 0.07, 0.07), ledM); m.position.set(x, y, z); raum.add(m);
    raum.add(flach(new THREE.PlaneGeometry(langs ? 1.1 : laenge, langs ? laenge : 1.1), langs ? scheinML : scheinM, x, y, z));
  };
  leiste(true, LAENGE, -BREITE / 2 + 0.35, WAND - 0.1, zMitte); leiste(true, LAENGE, BREITE / 2 - 0.35, WAND - 0.1, zMitte);   // unter dem Balken an den Glasfronten
  for (const sx of SCHIENEN_X) { leiste(true, LAENGE - 1, -sx, WAND - 0.1, zMitte); leiste(true, LAENGE - 1, sx, WAND - 0.1, zMitte); }   // Schienen unter den Sparren
  for (let z = zAnfang - FACH / 2; z > zEnde; z -= FACH) leiste(false, SCHIENEN_X[1] * 2, 0, WAND - 0.1, z);
  leiste(true, LAENGE - 0.6, -BREITE / 2 + 0.55, 0.07, zMitte); leiste(false, BREITE - 1.2, 0, 0.07, zEnde + 0.6);   // Lichtleisten am Wandfuß links und vor der Zielwand (Studio-Look)

  /* ---------- Türen: Eingang (Flügel weiter unten), Ziel mit Glasflügeln, die am Ende aufgehen ---------- */
  const rahmenM = grund(P.tuer, { transparent: true, opacity: 0.6, fog: false }), rahmenA = grund(P.tuer, { fog: false });
  const rahmen = (z, m) => { for (const [b, h, x, y] of [[0.14, TUER_H + 0.14, -TUER_B / 2, TUER_H / 2], [0.14, TUER_H + 0.14, TUER_B / 2, TUER_H / 2], [TUER_B + 0.14, 0.14, 0, TUER_H]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(b, h, 0.14), m); r.position.set(x, y, z); raum.add(r); (z === zAnfang ? wandVorn : wandHinten).push(r); } };
  rahmen(zAnfang, rahmenA); rahmen(zEnde, rahmenM);
  const tuerGlas = grund(P.glas, { transparent: true, opacity: 0.3, depthWrite: false });
  const fluegelL = new THREE.Mesh(new THREE.BoxGeometry(TUER_B / 2 - 0.04, TUER_H, 0.06), tuerGlas), fluegelR = fluegelL.clone();
  fluegelL.position.set(-TUER_B / 4, TUER_H / 2, zEnde); fluegelR.position.set(TUER_B / 4, TUER_H / 2, zEnde); raum.add(fluegelL, fluegelR);
  const tuerSchild = zeichne(640, 128, () => {}), tuerTex = tex(tuerSchild);
  const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: tuerTex, transparent: true, depthWrite: false, toneMapped: false, fog: false })); schild.scale.set(4.2, 0.84, 1); schild.position.set(0, TUER_H + 0.5, zEnde + 0.2); schild.renderOrder = 6; raum.add(schild);
  function schildMalen(fertig) {
    const x = tuerSchild.getContext('2d'); x.clearRect(0, 0, 640, 128);
    x.fillStyle = P.schild.grund; runde(x, 6, 8, 628, 112, 56); x.fill();
    x.fillStyle = P.schild.text; x.font = '600 54px ' + SCHRIFT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(pr ? (pr.ausgang || 'Zurück') : fertig ? 'Raus, geschafft!' : 'Ziel', 320, 66, 590);
    tuerTex.needsUpdate = true;
  }
  schildMalen(false);

  /* ---------- Eingang (09.11.2026, Devin: „die Figur öffnet die Tür, geht hinein“): zwei Flügel aus getöntem Glas mit schwarzem Rahmen, die vor der Figur nach innen aufschwingen ---------- */
  const eingangFl = [], flRahmenM = grund(ST.fassade), flGlasM = grund(P.glas, { transparent: true, opacity: 0.38, depthWrite: false }), griffM = grund(P.tuer, { fog: false });
  for (const s of [-1, 1]) {
    const g = new THREE.Group(), b = TUER_B / 2 - 0.04; g.position.set(s * (TUER_B / 2 - 0.02), 0, zAnfang);
    const glas = new THREE.Mesh(new THREE.BoxGeometry(b, TUER_H - 0.1, 0.04), flGlasM); glas.position.set(-s * b / 2, TUER_H / 2, 0); g.add(glas);
    for (const [bb, hh, px, py] of [[b, 0.12, -s * b / 2, TUER_H - 0.1], [b, 0.14, -s * b / 2, 0.07], [0.1, TUER_H - 0.1, -s * 0.05, TUER_H / 2], [0.1, TUER_H - 0.1, -s * (b - 0.05), TUER_H / 2]]) { const t = new THREE.Mesh(new THREE.BoxGeometry(bb, hh, 0.08), flRahmenM); t.position.set(px, py, 0); g.add(t); }
    const griff = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.1, 0.16), griffM); griff.position.set(-s * (b - 0.22), 1.05, 0); g.add(griff);
    raum.add(g); wandVorn.push(g); eingangFl.push({ g, s });
  }

  /* ---------- DK im Raum: Das Zeichen kommt aus dem App-Symbol (icon.svg), dazu beleuchtete Tafeln innen und außen, ein Schildband über dem Eingang, das Logo auf dem Dach und im Boden ---------- */
  const D_PFAD = new Path2D('M132 150h76c62 0 104 42 104 106s-42 106-104 106h-76zM178 196v120h28c35 0 58-24 58-60s-23-60-58-60z'), K_PFAD = new Path2D('M300 150h46v86l62-86h54l-74 98 78 114h-56l-64-96v96h-46z');
  const dkZeichen = (x, mx, my, hoehe, a, b) => {   // das D und das K, Mitte bei (mx, my), Gesamthöhe hoehe in Bildpunkten
    const s = hoehe / 212; x.save(); x.translate(mx, my); x.scale(s, s); x.translate(-297, -256);
    const g = x.createLinearGradient(132, 150, 462, 362); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fill(D_PFAD); x.fill(K_PFAD); x.restore();
  };
  const namenZug = (x, px, py, gross, klein, a, b, breite) => {   // DEVIN KANKE und darunter COACH
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = a; x.font = '800 ' + gross + 'px ' + SCHRIFT; x.fillText('DEVIN', px, py - gross * 0.86, breite); x.fillText('KANKE', px, py + gross * 0.1, breite);
    x.fillStyle = b; x.font = '700 ' + klein + 'px ' + SCHRIFT; x.fillText('C O A C H', px + 4, py + gross * 0.98, breite);
  };
  const plakatT = tex(zeichne(1024, 512, (x, b, h) => {   // breite Tafel: dunkles Feld mit feinem Lichtrahmen, links das DK, rechts der Name
    x.fillStyle = ST.plakat; runde(x, 8, 8, b - 16, h - 16, 44); x.fill();
    x.strokeStyle = ST.rahmen; x.globalAlpha = 0.85; x.lineWidth = 6; runde(x, 8, 8, b - 16, h - 16, 44); x.stroke(); x.globalAlpha = 1;
    dkZeichen(x, 240, h / 2, 290, ST.logoA, ST.logoB); namenZug(x, 440, h / 2, 96, 54, ST.logoA, ST.logoB, 540);
  }));
  const quadratT = tex(zeichne(512, 512, (x, b, h) => {   // quadratische Tafel nur mit dem DK
    x.fillStyle = ST.plakat; runde(x, 8, 8, b - 16, h - 16, 52); x.fill();
    x.strokeStyle = ST.rahmen; x.globalAlpha = 0.85; x.lineWidth = 6; runde(x, 8, 8, b - 16, h - 16, 52); x.stroke(); x.globalAlpha = 1;
    dkZeichen(x, b / 2, h / 2, 270, ST.logoA, ST.logoB);
  }));
  const bandT = tex(zeichne(2048, 256, (x, b, h) => {   // Schildband über der Eingangstür: DK und der ganze Name in einer Zeile
    x.fillStyle = ST.plakat; runde(x, 6, 6, b - 12, h - 12, 40); x.fill();
    x.strokeStyle = ST.rahmen; x.globalAlpha = 0.85; x.lineWidth = 6; runde(x, 6, 6, b - 12, h - 12, 40); x.stroke(); x.globalAlpha = 1;
    dkZeichen(x, 190, h / 2, 170, ST.logoA, ST.logoB);
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = ST.logoA; x.font = '800 118px ' + SCHRIFT; x.fillText('DEVIN KANKE', 330, h / 2 - 2, 1000);
    x.fillStyle = ST.logoB; x.font = '700 74px ' + SCHRIFT; x.fillText('COACH', 1380, h / 2 + 6, 560);
  }));
  const dachLogoT = tex(zeichne(1024, 1024, (x, b, h) => {   // auf dem Dach: das DK groß und darunter der Name (von oben gelesen, oben ist die Zielseite)
    x.globalAlpha = 0.92; dkZeichen(x, b / 2, h * 0.42, 560, ST.logoA, ST.logoB); x.globalAlpha = 1;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ST.logoA; x.font = '800 110px ' + SCHRIFT; x.fillText('DEVIN KANKE COACH', b / 2, h * 0.85, b - 80);
  }));
  const bodenLogoT = tex(zeichne(512, 512, (x, b, h) => { x.globalAlpha = 0.2; dkZeichen(x, b / 2, h / 2, 300, ST.logoA, ST.logoB); }));
  const tafel = (tx, br, ho, px, py, pz, dreh, ziel) => {   // Tafel an der Wand (Fläche schaut nach +z, dreh dreht um die Höhenachse); ziel: Gruppe oder Liste, damit sie mit der Wand verschwindet
    const m = new THREE.Mesh(new THREE.PlaneGeometry(br, ho), grund(0xffffff, { map: tx, transparent: true, depthWrite: false, fog: false }));
    m.position.set(px, py, pz); m.rotation.y = dreh; m.renderOrder = 2; raum.add(m);
    if (Array.isArray(ziel)) ziel.push(m); else if (ziel) ziel.add(m);
    return m;
  };
  for (const s of [-1, 1]) {
    tafel(plakatT, 4.4, 2.2, s * 5.7, 2.35, zEnde + WAND_D / 2 + 0.02, 0, wandHinten);   // Zielwand innen, links und rechts neben der Tür
    tafel(plakatT, 4.4, 2.2, s * 5.7, 2.45, zAnfang - WAND_D / 2 - 0.02, Math.PI, wandVorn);   // Eingangswand innen
    tafel(quadratT, 3.2, 3.2, s * 6.2, 2.1, zAnfang + WAND_D / 2 + 0.02, 0, wandVorn);   // Fassade außen
  }
  tafel(bandT, 6.4, 0.8, 0, TUER_H + 0.5, zAnfang + WAND_D / 2 + 0.02, 0, wandVorn);   // Schildband über der Eingangstür
  for (const z of [WAAGE_Z, ...Array.from({ length: 6 }, (_, i) => halle.spiegel.z - halle.spiegel.laenge / 2 - 3.2 - i * 2 * FACH)].filter((zz) => zz > zEnde + 4)) tafel(quadratT, 2.6, 2.6, -BREITE / 2 + WAND_D / 2 + 0.02, 2.5, z, Math.PI / 2, wandL);   // DK-Tafeln an der linken Wand: hinter der Waage und hinter dem Spiegel (der Spiegel bleibt frei)
  tafel(quadratT, 6, 6, -BREITE / 2 - WAND_D / 2 - 0.02, 2.4, zMitte, -Math.PI / 2, wandL);   // außen an der linken Wand
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), grund(0xffffff, { map: dachLogoT, transparent: true, depthWrite: false, fog: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, WAND + 0.35 + 0.012, zMitte); m.renderOrder = 2; raum.add(m); }   // Logo auf dem Dach
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), grund(0xffffff, { map: bodenLogoT, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.011, zAnfang - 1.9); m.renderOrder = 1; raum.add(m); }   // Zeichen im Boden hinter der Tür

  /* ---------- Spiegel (09.11.2026, Devin: „Spiegel, an denen man posen kann“): Spiegelwand an der linken Wand mit echtem Spiegelbild, davor der Posing-Platz ---------- */
  const SP = halle.spiegel, spiegelXWand = -BREITE / 2 + WAND_D / 2, spiegelHoehe = 3, spiegelY = 0.5 + spiegelHoehe / 2;
  const spiegelF = spiegelFlaeche(THREE, SP.laenge, spiegelHoehe, { skala: 0.6, innen: () => K.pos.x > halle.innen.xMin && K.pos.x < halle.innen.xMax && K.pos.z > halle.innen.zMin && K.pos.z < halle.innen.zMax && K.pos.y < WAND, tonung: GOLD ? '#f6eedb' : LOOK === 'klar' ? '#eef2fb' : '#e6fbf7', stark: 0.92 });
  spiegelF.mesh.position.set(spiegelXWand + 0.02, spiegelY, SP.z); spiegelF.mesh.rotation.y = Math.PI / 2; wandL.add(spiegelF.mesh);
  const spRahmenM = grund(ST.fassade);
  for (const [bz, bh, zc, yc] of [[SP.laenge + 0.24, 0.12, SP.z, 0.5 - 0.06], [SP.laenge + 0.24, 0.12, SP.z, 0.5 + spiegelHoehe + 0.06], [0.12, spiegelHoehe, SP.z - SP.laenge / 2 - 0.06, spiegelY], [0.12, spiegelHoehe, SP.z + SP.laenge / 2 + 0.06, spiegelY], [0.07, spiegelHoehe, SP.z - SP.laenge / 6, spiegelY], [0.07, spiegelHoehe, SP.z + SP.laenge / 6, spiegelY]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, bh, bz), spRahmenM); r.position.set(spiegelXWand + 0.045, yc, zc); wandL.add(r);
  }
  leiste(true, SP.laenge + 0.24, spiegelXWand + 0.12, 0.5 + spiegelHoehe + 0.16, SP.z);   // Lichtband über dem Spiegel
  const spiegel = { pos: V(SP.x, 0, SP.z), r: SP.r, istSpiegel: true, schild: null };
  {
    const g = new THREE.Group(); g.position.copy(spiegel.pos); g.rotation.y = SP.w; raum.add(g);
    const teller = flach(new THREE.CircleGeometry(SP.r, 48), grund(P.teller, { transparent: true, opacity: P.tellerSicht, depthWrite: false }), 0, 0.006, 0);
    const ring = flach(new THREE.RingGeometry(SP.r - 0.07, SP.r, 64), grund(P.ring, { transparent: true, opacity: 0.95, depthWrite: false }), 0, 0.009, 0);
    const marken = grund(P.ring, { transparent: true, opacity: 0.4, depthWrite: false }), sohlen = [-0.2, 0.2].map((x) => { const t = flach(new THREE.CircleGeometry(0.17, 24), marken, x, 0.01, 0.04); t.scale.set(1, 1.9, 1); t.renderOrder = 2; return t; });   // zwei Fußmarken zum Draufstellen
    teller.renderOrder = 1; ring.renderOrder = 1; g.add(teller, ring, ...sohlen);
    const sc = zeichne(720, 180, () => {}), st = tex(sc);
    const ssp = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, toneMapped: false, fog: false })); ssp.scale.set(2.8, 0.7, 1); ssp.position.set(spiegel.pos.x, 2.85, spiegel.pos.z); ssp.renderOrder = 5; raum.add(ssp);
    const x = sc.getContext('2d'), F2 = P.schild; x.fillStyle = F2.grund; runde(x, 6, 14, 708, 152, 76); x.fill();
    const gr = x.createLinearGradient(26, 34, 146, 154); gr.addColorStop(0, F2.a); gr.addColorStop(1, F2.b); x.fillStyle = gr; x.beginPath(); x.arc(90, 90, 60, 0, 7); x.fill();
    x.fillStyle = F2.kreis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 60px ' + SCHRIFT; x.fillText('P', 90, 96);
    x.textAlign = 'left'; x.font = '600 52px ' + SCHRIFT; x.fillStyle = F2.text; x.fillText('Posen am Spiegel', 172, 93, 520); st.needsUpdate = true;
    spiegel.schild = ssp;
  }
  spiegelEnde = () => spiegelF.entsorgen();

  /* ---------- Weg: leuchtende Punkte wie auf einer Spielkarte, Licht läuft bis zur nächsten Station ---------- */
  const wegPunkte = [V(0, 0.014, zStart)];
  stationen.forEach((s) => wegPunkte.push(V(s.links ? -0.55 : 0.55, 0.014, s.pos.z)));
  wegPunkte.push(V(0, 0.014, zEnde + 2.4), V(0, 0.014, zEnde - 0.6));
  const wegKurve = new THREE.CatmullRomCurve3(wegPunkte, false, 'catmullrom', 0.5);
  const WEG_L = wegKurve.getLength(), STUECKE = Math.ceil(WEG_L * 4), pos = [], uv = [], idx = [], WEG_B = 0.34;
  const wegFein = wegKurve.getSpacedPoints(STUECKE);
  wegFein.forEach((p, i) => {
    const q = wegFein[Math.min(i + 1, STUECKE)], o = wegFein[Math.max(i - 1, 0)], n = V(-(q.z - o.z), 0, q.x - o.x).normalize();
    pos.push(p.x + n.x * WEG_B, p.y, p.z + n.z * WEG_B, p.x - n.x * WEG_B, p.y, p.z - n.z * WEG_B);
    uv.push(i / STUECKE, 0, i / STUECKE, 1);
    if (i < STUECKE) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  });
  const wegGeo = new THREE.BufferGeometry(); wegGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wegGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wegGeo.setIndex(idx);
  const wegU = { zeit: { value: 0 }, von: { value: 0 }, bis: { value: 0 }, laenge: { value: WEG_L }, breite: { value: WEG_B * 2 }, a: { value: new THREE.Vector3(...P.wegA) }, b: { value: new THREE.Vector3(...P.wegB) }, dunkel: { value: P.wegDunkel } };
  const wegMat = new THREE.ShaderMaterial({ uniforms: wegU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vU; uniform float zeit, von, bis, laenge, breite, dunkel; uniform vec3 a, b;
      void main(){
        float m = vU.x * laenge, abstand = 0.72;
        vec2 p = vec2((fract(m / abstand) - 0.5) * abstand, (vU.y - 0.5) * breite);
        float d = length(p), r = 0.2;
        vec3 farbe = mix(a, b, 0.5 + 0.5 * sin(m * 0.5));
        float welle = 0.5 + 0.5 * sin((m - zeit * 3.0) * 1.3);
        float punkt = smoothstep(r, r - 0.04, d), schein = smoothstep(r + 0.14, r, d) * 0.3;
        float jetzt = vU.x >= von && vU.x < bis ? 1.0 : 0.0, war = vU.x < von ? 1.0 : 0.0;
        float staerke = war * 0.5 + (1.0 - war - jetzt) * dunkel;
        gl_FragColor = vec4(farbe, max(punkt, schein * war) * staerke);
      }` });
  const weg = new THREE.Mesh(wegGeo, wegMat); weg.renderOrder = 2; raum.add(weg);
  const wegIndex = (p) => { let beste = 0, d = 1e9; wegFein.forEach((q, i) => { const e = Math.hypot(q.x - p.x, q.z - p.z); if (e < d) { d = e; beste = i; } }); return beste; };
  function route(von, nach) {
    const iA = wegIndex(von), iB = wegIndex(nach), pkt = [], schritt = iA < iB ? 3 : -3;
    if (Math.abs(iA - iB) > 6) for (let i = iA + schritt; schritt > 0 ? i < iB - 2 : i > iB + 2; i += schritt) pkt.push(V(wegFein[i].x, 0, wegFein[i].z));
    pkt.push(nach.clone().setY(0));
    return pkt;
  }

  /* ---------- Stationen: Gerät steht schon da (Stand des Ablaufs davor), Schild, Ring ---------- */
  const schattenT = tex(zeichne(256, 256, (x, b) => { const g = x.createRadialGradient(b / 2, b / 2, 10, b / 2, b / 2, b / 2); const f = P.schatten; g.addColorStop(0, 'rgba(' + f + ',.46)'); g.addColorStop(0.7, 'rgba(' + f + ',.16)'); g.addColorStop(1, 'rgba(' + f + ',0)'); x.fillStyle = g; x.fillRect(0, 0, b, b); }));
  const platte = new THREE.CircleGeometry(STATION_R, 64), ringGeo = new THREE.RingGeometry(STATION_R - 0.08, STATION_R, 96);
  function namensSchild(s) {
    const c = zeichne(720, 180, () => {}), t = tex(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, fog: false })); sp.scale.set(spieler ? 2.8 : 3.6, spieler ? 0.7 : 0.9, 1); sp.renderOrder = 5;
    s.schildMalen = () => {
      const x = c.getContext('2d'), F2 = P.schild; x.clearRect(0, 0, 720, 180);
      x.fillStyle = F2.grund; runde(x, 6, 14, 708, 152, 76); x.fill();
      const g = x.createLinearGradient(26, 34, 146, 154); g.addColorStop(0, F2.a); g.addColorStop(1, F2.b); x.fillStyle = g; x.beginPath(); x.arc(90, 90, 60, 0, 7); x.fill();
      x.fillStyle = F2.kreis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 68px ' + SCHRIFT;
      if (pr) x.font = '700 50px ' + SCHRIFT;
      x.fillText(pr ? 'PR' : s.fertig ? '✓' : String(s.i + 1), 90, 95);
      x.textAlign = 'left'; x.font = '600 50px ' + SCHRIFT; x.fillStyle = s.fertig ? F2.text2 : F2.text;
      const zeilen = []; let z = '';
      for (const w of s.u.name.split(' ')) { const neu = z ? z + ' ' + w : w; if (x.measureText(neu).width > 510 && z) { zeilen.push(z); z = w; } else z = neu; } zeilen.push(z);
      const zwei = pr ? [s.u.name, s.u.wert || 'Noch offen'] : zeilen.slice(0, 2); if (!pr && zeilen.length > 2) zwei[1] += ' …';
      zwei.forEach((zeile, i) => x.fillText(zeile, 172, 93 + (i - (zwei.length - 1) / 2) * 56, 520));
      t.needsUpdate = true;
    };
    s.schildMalen();
    return sp;
  }
  // Das Gerät im Stand vor dem Ablauf als feste Kopie in die Halle stellen. Gibt die Höhe zurück (für das Schild)
  function geraetBauen(s) {
    let oben = 1.5;
    if (s.anim) {
      try {
        a.geraete.scheiben = Array.isArray(s.u.scheiben) ? s.u.scheiben : null;   // PR-Raum: genau die Scheiben des Kunden
        a.zeige(s.anim, s.d.m || []);
        if (a.intro) {
          const p0 = a.intro.pose(0); a.introBild(0);
          if (p0.becken) s.startLokal = V(p0.becken.x, 0, p0.becken.z);
          if (p0.rumpf && p0.rumpf.basis) { const v = V(0, 0, 1).applyQuaternion(p0.rumpf.basis); s.startW = Math.atan2(v.x, v.z); }
        } else a.bild(0);
        a.geraete.gruppe.updateMatrixWorld(true);
        const kopie = LIVE ? zusammenfassen(a.geraete.gruppe) : a.geraete.gruppe.clone(true);   // Live-Gym: je Stoff ein Netz (ein Kabelzug hatte über 100 Teile, die Halle wird für Boden und Spiegel mehrmals gezeichnet)
        if (LIVE) { kopie.position.copy(a.geraete.gruppe.position); kopie.quaternion.copy(a.geraete.gruppe.quaternion); kopie.scale.copy(a.geraete.gruppe.scale); }
        // Die feste Kopie bekommt eigene Geometrien (Befund von Devin 09.11.: nach der Station waren die Geräte in der Halle weg). Das Gerät im Ablauf teilt seine Geometrien mit der Kopie und gibt sie beim Wechsel frei (leeren);
        // danach zeichnet drei die geteilten Teile der festen Kopie nicht mehr. Je Gerät wird jede Geometrie nur einmal kopiert.
        const eigene = new Map();
        kopie.traverse((o) => {
          if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
          if ((o.isMesh || o.isLine || o.isPoints) && o.geometry && o.geometry.clone) { let g = eigene.get(o.geometry); if (!g) { g = o.geometry.clone(); eigene.set(o.geometry, g); } o.geometry = g; }
          if (o.matrixAutoUpdate) { o.updateMatrix(); o.matrixAutoUpdate = false; }   // zusammengefasste Teile haben ihre Lage schon fest
        });
        if (s.statisch) s.gruppe.remove(s.statisch);
        s.gruppe.add(kopie); s.statisch = kopie;
        const box = new THREE.Box3().setFromObject(a.geraete.gruppe); if (isFinite(box.max.y)) oben = Math.max(oben, box.max.y);
      } catch (e) { s.anim = null; }
    }
    a.uebung = null; a.intro = null; a.geraete.leeren();
    return oben;
  }
  for (let i = 0; i < N; i++) {
    const s = stationen[i], g = new THREE.Group();
    g.position.copy(s.pos); g.rotation.y = s.winkel; raum.add(g);
    s.teller = flach(platte, grund(P.teller, { transparent: true, opacity: P.tellerSicht, depthWrite: false }), 0, 0.006, 0);
    s.ring = flach(ringGeo, grund(P.ringAus, { transparent: true, opacity: 0.9, depthWrite: false }), 0, 0.009, 0);
    s.teller.renderOrder = 1; s.ring.renderOrder = 1;
    const schatten = flach(new THREE.CircleGeometry(STATION_R * 0.86, 32), grund(0xffffff, { map: schattenT, transparent: true, depthWrite: false }), 0, 0.01, 0); schatten.renderOrder = 1;
    g.add(s.teller, s.ring, schatten);
    s.anim = s.d && s.d.a ? M.animation(s.d.a) : null;
    s.gruppe = g;
    s.startLokal = V(0, 0, 1.8); s.startW = Math.PI;
    const oben = geraetBauen(s);
    const sp = namensSchild(s); sp.position.set(s.pos.x, Math.min(oben, 2.5) + 0.75, s.pos.z); raum.add(sp); s.schild = sp; if (LIVE) { sp.scale.multiplyScalar(0.6); sp.position.y += 0.35; }   // Live-Gym: kleinere Namensschilder, der Raum bleibt frei
    s.start = ausLokal(s, s.startLokal); s.startH = s.startW + s.winkel;
    ladenT.textContent = 'Dein Gym wird aufgebaut … ' + Math.round((i + 1) / Math.max(1, N) * 100) + ' %';
    await new Promise((r) => setTimeout(r));
    if (!offen) return;
  }
  // Echter Schatten nur um die Figur (sie steht im Ursprung), Ring unter der Figur, Lichtsäule über der nächsten Station
  const schattenFlaeche = flach(new THREE.PlaneGeometry(9, 9), new THREE.ShadowMaterial({ opacity: GOLD ? 0.5 : 0.28 }), 0, 0.016, 0); schattenFlaeche.receiveShadow = true; schattenFlaeche.renderOrder = 3; szene.add(schattenFlaeche);
  const spielerRing = flach(new THREE.RingGeometry(0.46, 0.56, 48), grund(P.ring, { transparent: true, opacity: 0.85, depthWrite: false }), 0, 0.02, 0); spielerRing.renderOrder = 3; szene.add(spielerRing);
  const saeuleT = tex(zeichne(16, 128, (x, b, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,.75)'); x.fillStyle = g; x.fillRect(0, 0, b, h); }));
  const lichtSaeule = new THREE.Mesh(new THREE.CylinderGeometry(STATION_R * 0.98, STATION_R * 0.98, 3.2, 48, 1, true), grund(P.ring, { map: saeuleT, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: GOLD ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, opacity: 0.55 }));
  lichtSaeule.renderOrder = 4; raum.add(lichtSaeule);

  /* ---------- Waage im Eingang (09.11.2026, Devin: „im Eingang eine Waage … wenn du da draufgehst, kommst du in den Statusbereich“): zeigt den Spielstand, nie das Körpergewicht ---------- */
  const waage = status ? { pos: V(halle.waage.x, 0, halle.waage.z), r: halle.waage.r, istWaage: true, schild: null } : null;
  const boote = [], hindernisse = [];   // Live-Gym: Boote auf dem Meer; Hindernisse, durch die die Figur nicht läuft ({ x, z, r } Kreis oder { box: [x0, x1, z0, z1] })
  let sprint = false;   // Live-Gym: rennen (Shift am PC, Knüppel ganz an den Rand ziehen am Handy)   // Live-Gym: Boote auf dem Meer, schaukeln leicht
  const LOUNGE_Z = halle.spiegel.z - halle.spiegel.laenge / 2 - 3.2 - FACH;   // Live-Gym: Lounge und Leuchtschrift an der linken Wand, zwischen den DK-Tafeln
  let waageSchirmMalen = () => {};
  if (waage) {
    const g = new THREE.Group(); g.position.copy(waage.pos); g.rotation.y = WAAGE_W; raum.add(g);
    const teller = flach(new THREE.CircleGeometry(waage.r, 48), grund(P.teller, { transparent: true, opacity: P.tellerSicht, depthWrite: false }), 0, 0.006, 0);
    const ring = flach(new THREE.RingGeometry(waage.r - 0.07, waage.r, 64), grund(P.waage, { transparent: true, opacity: 0.95, depthWrite: false }), 0, 0.009, 0);
    teller.renderOrder = 1; ring.renderOrder = 1;
    const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.82, 0.05, 48), grund(P.gummi)); fuss.position.y = 0.04;
    const platte = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.78, 0.035, 48), grund(P.deck)); platte.position.y = 0.083;
    const led = flach(new THREE.RingGeometry(0.6, 0.66, 64), grund(P.waage), 0, 0.103, 0);
    const trittM = grund(P.waage, { transparent: true, opacity: 0.4, depthWrite: false }), tritte = [-0.2, 0.2].map((x) => { const t = flach(new THREE.CircleGeometry(0.17, 24), trittM, x, 0.104, 0.04); t.scale.set(1, 1.9, 1); t.renderOrder = 2; return t; });   // zwei Trittflächen, damit man sie als Waage erkennt
    const saeule = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.1), grund(P.gummi)); saeule.position.set(0, 0.575, -0.95);
    const schirmC = zeichne(256, 160, () => {}), schirmT = tex(schirmC);
    const schirm = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.6), grund(0xffffff, { map: schirmT })); schirm.position.set(0, 1.28, -0.92); schirm.rotation.x = -0.22;
    g.add(teller, ring, fuss, platte, led, ...tritte, saeule, schirm);
    waageSchirmMalen = (st) => {   // das Display auf der Säule: Level und Titel, ohne Spielstand eine Einladung
      const x = schirmC.getContext('2d'); x.clearRect(0, 0, 256, 160);
      x.fillStyle = '#0B1620'; runde(x, 4, 4, 248, 152, 22); x.fill(); x.strokeStyle = P.waage; x.lineWidth = 4; runde(x, 4, 4, 248, 152, 22); x.stroke();
      x.fillStyle = P.waage; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 62px ' + SCHRIFT; x.fillText(st ? 'LV ' + st.level : 'Status', 128, 66, 230);
      x.fillStyle = '#F4F7FA'; x.font = '600 30px ' + SCHRIFT; x.fillText(st ? st.titel : 'Tipp mich an', 128, 120, 230);
      schirmT.needsUpdate = true;
    };
    const schildC = zeichne(720, 180, () => {}), schildT = tex(schildC);
    const wsp = new THREE.Sprite(new THREE.SpriteMaterial({ map: schildT, transparent: true, depthWrite: false, toneMapped: false, fog: false })); wsp.scale.set(2.8, 0.7, 1); wsp.position.set(waage.pos.x, 2.85, waage.pos.z); wsp.renderOrder = 5; raum.add(wsp);
    { const x = schildC.getContext('2d'), F2 = P.schild; x.fillStyle = F2.grund; runde(x, 6, 14, 708, 152, 76); x.fill();
      const gr = x.createLinearGradient(26, 34, 146, 154); gr.addColorStop(0, P.waage); gr.addColorStop(1, F2.b); x.fillStyle = gr; x.beginPath(); x.arc(90, 90, 60, 0, 7); x.fill();
      x.fillStyle = F2.kreis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 60px ' + SCHRIFT; x.fillText('★', 90, 96);
      x.textAlign = 'left'; x.font = '600 52px ' + SCHRIFT; x.fillStyle = F2.text; x.fillText('Dein Status', 172, 93, 520); schildT.needsUpdate = true; }
    waage.schild = wsp;
    let st0 = null; try { st0 = status(); } catch (e) {}
    waageSchirmMalen(st0);
  }

  /* ---------- Tür zum PR-Raum (09.11.2026, Devin: „in einen anderen Raum gehen … da ist eine Tür“): steht gegenüber der Waage. Antippen oder hindurchgehen, dann öffnet die App den PR-Raum ---------- */
  /* ---------- Mehr Geräte als Deko (10.11.2026, Devin: „dass es wirklich aussieht wie ein Fitnessstudio“, Antwort: „Mehr Geräte als Deko“) ----------
     Kopien der festen Geräte des Tages stehen an den Längsseiten, zur Hallenmitte gedreht, ohne Bedienung (wie in einem echten Studio gibt es Geräte mehrfach). Je Gerät werden die Teile je Stoff zu einem Netz
     zusammengefasst (wenige Zeichenaufrufe). Frei bleiben Spiegelwand und Posing-Platz, die Waage und rechts vorn Eingang und PR-Tür. Kommt die Kamera nah, wird das Gerät ausgeblendet, damit es nie den Blick versperrt. */
  function zusammenfassen(quelle) {
    quelle.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(quelle.matrixWorld).invert(), gruppen = new Map(), aus = new THREE.Group();
    quelle.traverse((o) => {
      if ((!o.isMesh && !o.isLine) || !o.visible) return;
      const rel = new THREE.Matrix4().copy(inv).multiply(o.matrixWorld);
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) { const k = o.clone(false); k.matrixAutoUpdate = false; k.matrix.copy(rel); aus.add(k); return; }   // Sonderfälle: einzeln übernehmen
      const a = o.geometry.attributes, art = ['normal', 'uv', 'color'].filter((k) => a[k]), schl = o.material.uuid + '|' + art.join(',') + '|' + (a.color ? a.color.itemSize : 0);
      (gruppen.get(schl) || gruppen.set(schl, { mat: o.material, art, teile: [] }).get(schl)).teile.push([o.geometry, rel]);
    });
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const { mat, art, teile } of gruppen.values()) {
      const pos = [], felder = { normal: [], uv: [], color: [] }, idx = []; let basis = 0, cGroesse = 3;
      for (const [g, m] of teile) {
        const p = g.attributes.position, n = p.count; nm.getNormalMatrix(m);
        for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); }
        if (art.includes('normal')) for (let i = 0; i < n; i++) { v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize(); felder.normal.push(v.x, v.y, v.z); }
        if (art.includes('uv')) for (let i = 0; i < n; i++) felder.uv.push(g.attributes.uv.getX(i), g.attributes.uv.getY(i));
        if (art.includes('color')) { const c = g.attributes.color; cGroesse = c.itemSize; for (let i = 0; i < n; i++) for (let j = 0; j < c.itemSize; j++) felder.color.push(c.array[i * c.itemSize + j]); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + basis); else for (let i = 0; i < n; i++) idx.push(i + basis);
        basis += n;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (art.includes('normal')) geo.setAttribute('normal', new THREE.Float32BufferAttribute(felder.normal, 3));
      if (art.includes('uv')) geo.setAttribute('uv', new THREE.Float32BufferAttribute(felder.uv, 2));
      if (art.includes('color')) geo.setAttribute('color', new THREE.Float32BufferAttribute(felder.color, cGroesse));
      geo.setIndex(basis > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const netz = new THREE.Mesh(geo, mat); netz.matrixAutoUpdate = false; aus.add(netz);
    }
    return aus;
  }
  const deko = [];
  if (!pr) {
    const vorlagen = stationen.filter((s) => s.statisch).map((s) => zusammenfassen(s.statisch));
    const matteT = tex(zeichne(256, 256, (x, b, h) => { x.fillStyle = '#16181d'; x.fillRect(0, 0, b, h); x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 4; x.strokeRect(8, 8, b - 16, h - 16); })), matteM = grund(0xffffff, { map: matteT });   // Gummimatte unter jedem Deko-Gerät
    if (vorlagen.length) {
      const SPG = halle.spiegel, frei = (x, z) => {
        if (x < 0 && z > SPG.z - SPG.laenge / 2 - 1.8 && z < SPG.z + SPG.laenge / 2 + 1.8) return false;   // Spiegelwand und Posing-Platz
        if (waage && Math.hypot(x - waage.pos.x, z - waage.pos.z) < 3.2) return false;   // Waage
        if (x > 0 && z > zAnfang - 7.5) return false;   // rechts vorn: Eingang und PR-Tür
        if (LIVE && x > 0 && z > zAnfang - 13) return false;   // Live-Gym: rechts vorn steht die Kurzhantel-Ablage
        if (LIVE && x < 0 && z < LOUNGE_Z + 5 && z > LOUNGE_Z - 5) return false;   // Live-Gym: links die Lounge unter der Leuchtschrift
        return true;
      };
      let k = 0;
      for (let z = zAnfang - 3.5; z > zEnde + 2.5 && deko.length < 10; z -= 4.8) for (const sx of [-1, 1]) {
        const x = sx * (BREITE / 2 - 2.2); if (!frei(x, z) || deko.length >= 10) continue;
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(flach(new THREE.PlaneGeometry(3.4, 3.4), matteM, 0, 0.004, 0), vorlagen[k++ % vorlagen.length].clone()); raum.add(g); deko.push(g); if (LIVE) hindernisse.push({ x, z, r: 1.7 });
      }
    }
  }
  /* ---------- Poster an den Wänden (10.11.2026, Devin: „irgendwelche Bodybuilder an der Wand“): die eigene Figur in vier Posen, beim Laden einmal gerendert (in einen Teil des Bildschirms, ausgelesen,
     mit Rahmen, DK und Namen auf eine Leinwand gemalt). Keine Bilddateien, keine echten Personen. Plätze: Eingangs- und Zielwand außen neben den DK-Tafeln, links an freien Wandstücken. Nicht im PR-Raum. */
  // Live-Gym: Legenden mit erfundenen Namen (keine echten Personen; echte Namen und Gesichter bräuchten Rechte). Die Figur ist die DK-Figur in Posen.
  const LEGENDEN = ['ATLAS', 'TITAN', 'KOLOSS', 'HERKULES'];
  /* Live-Gym (10.11.2026, Devin: „Bodybuilder-Legenden … cool ästhetisch, du fühlst dich zu Hause“): zwei goldene Statuen auf schwarzen Sockeln links und rechts der Zieltür.
     Die Figur wird in die Pose gestellt und ihre Form einmal fest abgegossen (die Knochen auf die Punkte gerechnet), danach kostet eine Statue nur noch zwei Zeichenaufrufe. */
  function statuenMachen() {
    if (!LIVE || !a.figur.meshes) return;
    const altH = H, env = a.geraete.mMetall && a.geraete.mMetall.envMap;
    const gold = new THREE.MeshStandardMaterial({ color: 0xd9b066, metalness: 1, roughness: 0.3, envMap: env || null, envMapIntensity: 1.2 }), sockelM = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.25, metalness: 0.3 });
    const v = new THREE.Vector3();
    try {
      [[0, -3.3, 0], [6, 3.3, 1]].forEach(([nr, x, li]) => {
        const p = POSEN[nr]; if (!p) return; H = 0;
        const pose = stehen(V(0, 0, 0), 0); posAlt = posNr = nr; posT = 1; posMix = 1; posAn = true; posAuto = false; posAnwenden(pose, 0);
        a.figur.stelle(gelenke(pose)); a.figur.gruppe.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(a.figur.gruppe.matrixWorld).invert(), pos = [], idx = []; let o = 0;
        for (const m of a.figur.meshes) {
          if (!m.isSkinnedMesh || !m.userData.koerper) continue;   // nur der Körper: eine klassische Statue ohne Kleidung (die Kleidung ist ein Schattierer-Trick und lässt sich nicht abgießen)
          m.skeleton.update(); const g = m.geometry, pp = g.attributes.position, rel = new THREE.Matrix4().copy(inv).multiply(m.matrixWorld);
          for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i); m.applyBoneTransform(i, v); v.applyMatrix4(rel); pos.push(v.x, v.y, v.z); }
          if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o); else for (let i = 0; i < pp.count; i++) idx.push(i + o);
          o += pp.count;
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
        const st = new THREE.Group(); st.position.set(x, 0, zEnde + 2.5); raum.add(st); hindernisse.push({ x, z: zEnde + 2.5, r: 0.8 });
        const sockel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.9, 1.15), sockelM); sockel.position.y = 0.45; st.add(sockel);
        const band = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.04, 1.18), gold); band.position.y = 0.88; st.add(band);
        const figur = new THREE.Mesh(geo, gold); figur.position.y = 0.9; figur.scale.setScalar(1.08); figur.castShadow = false; st.add(figur);
        const schildT = tex(zeichne(512, 160, (c, b, h) => { c.fillStyle = '#0c0c0e'; c.fillRect(0, 0, b, h); c.strokeStyle = '#D9B066'; c.lineWidth = 5; c.strokeRect(8, 8, b - 16, h - 16); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#F2D48A'; c.font = '800 64px ' + SCHRIFT; c.fillText(LEGENDEN[li], b / 2, 66); c.fillStyle = '#B9B2A2'; c.font = '600 26px ' + SCHRIFT; c.fillText('DK LEGENDE', b / 2, 122); }));
        const tafelS = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.28), grund(0xffffff, { map: schildT })); tafelS.position.set(0, 0.5, 0.58); st.add(tafelS);
      });
    } catch (e) { /* geht das Abgießen nicht, gibt es eben keine Statuen */ }
    finally { H = altH; posAn = false; posMix = 0; }
  }
  function posterMachen() {
    if (pr) return;
    const R = a.renderer, gl = R.getContext(), pxr = R.getPixelRatio(), bw = 240, bh = 360, puffer = new Uint8Array(bw * bh * 4), leinwaende = [];
    const posterNr = [0, 2, 1, 6].filter((n) => POSEN[n]);
    const kam = new THREE.PerspectiveCamera(28, bw / bh, 0.1, 40); kam.position.set(0, 1.12, 4.6); kam.lookAt(0, 1.0, 0); kam.updateMatrixWorld(true);
    const versteckt = []; for (const o of szene.children) if (o !== a.figur.gruppe && !o.isLight && o.visible) { versteckt.push(o); o.visible = false; }
    const hg = szene.background, nebel = szene.fog, altH = H, vp = new THREE.Vector4(); R.getViewport(vp);
    szene.background = new THREE.Color(0x15141c); szene.fog = null;
    try {
      for (const nr of posterNr) {
        const p = POSEN[nr], legende = LEGENDEN[leinwaende.length % LEGENDEN.length]; H = p.dreh || 0;   // die Rückenposen zeigen den Rücken
        const pose = stehen(V(0, 0, 0), H); posAlt = posNr = nr; posT = 1; posMix = 1; posAn = true; posAuto = false; posAnwenden(pose, 0);
        a.figur.stelle(gelenke(pose));
        R.setRenderTarget(null); R.setViewport(0, 0, bw / pxr, bh / pxr); R.render(szene, kam);
        gl.readPixels(0, 0, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, puffer);
        const bild = new ImageData(bw, bh); for (let y = 0; y < bh; y++) bild.data.set(puffer.subarray((bh - 1 - y) * bw * 4, (bh - y) * bw * 4), y * bw * 4);   // von unten nach oben gelesen
        leinwaende.push(zeichne(300, 450, (x, b, h) => {
          const fig = document.createElement('canvas'); fig.width = bw; fig.height = bh; fig.getContext('2d').putImageData(bild, 0, 0);
          x.fillStyle = '#15141c'; x.fillRect(0, 0, b, h); x.drawImage(fig, 14, 14, b - 28, (b - 28) * bh / bw);
          const v = x.createRadialGradient(b / 2, h * 0.42, b * 0.25, b / 2, h * 0.45, b * 0.85); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)'); x.fillStyle = v; x.fillRect(0, 0, b, h);
          x.fillStyle = 'rgba(10,10,14,0.88)'; x.fillRect(0, h - 74, b, 74);
          x.strokeStyle = P.schild.a; x.lineWidth = 6; x.strokeRect(5, 5, b - 10, h - 10);
          dkZeichen(x, 46, 40, 34, P.schild.a, P.schild.b);
          x.fillStyle = P.schild.text; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 26px ' + SCHRIFT; x.fillText(LIVE ? legende : p.name.toUpperCase(), b / 2, h - 44, b - 30);
          x.fillStyle = P.schild.a; x.font = '600 14px ' + SCHRIFT; x.fillText(LIVE ? 'DK LEGENDE · ' + p.name.toUpperCase() : 'DK COACH', b / 2, h - 18, b - 24);
        }));
      }
    } catch (e) { leinwaende.length = 0; }   // geht das Rendern nicht, gibt es eben keine Poster
    finally { for (const o of versteckt) o.visible = true; szene.background = hg; szene.fog = nebel; H = altH; posAn = false; posMix = 0; R.setViewport(vp); }
    if (!leinwaende.length) return;
    const tx = leinwaende.map((c) => tex(c)), plaetze = [];
    for (const s of [-1, 1]) { plaetze.push([s * 8.85, 2.3, zAnfang - WAND_D / 2 - 0.03, Math.PI, wandVorn]); plaetze.push([s * 8.85, 2.3, zEnde + WAND_D / 2 + 0.03, 0, wandHinten]); }
    for (let z = halle.spiegel.z - halle.spiegel.laenge / 2 - 3.2 - FACH; z > zEnde + 3; z -= 2 * FACH) if (!LIVE || Math.abs(z - LOUNGE_Z) > 1) plaetze.push([-BREITE / 2 + WAND_D / 2 + 0.03, 2.6, z, Math.PI / 2, null]);
    plaetze.forEach(([x, y, z, dreh, ziel], i) => tafel(tx[i % tx.length], 1.5, 2.25, x, y, z, dreh, ziel));
  }
  const prT = prTuer ? { pos: V(PR_TUER_X, 0, PR_TUER_Z), r: 1.5, istTuer: true, schild: null, vorn: V(PR_TUER_X - 2.1, 0, PR_TUER_Z + 0.6), raus: Math.atan2(-2.1, 0.6) } : null;
  let naheTuer = false, tuerUnterwegs = false;
  if (prT) {
    const g = new THREE.Group(); g.position.copy(prT.pos); g.rotation.y = PR_TUER_W; raum.add(g); prT.gruppe = g;
    const wand = new THREE.Mesh(kiste(3.6, TUER_H + 0.3, 0.36), grund(0xffffff, { vertexColors: true })); wand.position.set(0, (TUER_H + 0.3) / 2, -0.22);
    const glutT = tex(zeichne(256, 512, (x, b, h) => {
      const v = x.createLinearGradient(0, h, 0, 0); v.addColorStop(0, P.schild.a); v.addColorStop(0.55, P.schild.b); v.addColorStop(1, P.schild.grund); x.fillStyle = v; x.fillRect(0, 0, b, h);
      const r = x.createRadialGradient(b / 2, h * 0.62, 10, b / 2, h * 0.62, b * 0.75); r.addColorStop(0, 'rgba(255,255,255,.85)'); r.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = r; x.fillRect(0, 0, b, h);
    }));
    const glut = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3), grund(0xffffff, { map: glutT })); glut.position.set(0, 1.5, -0.03);
    const rahmenTuer = grund(P.tuer, { fog: false });
    for (const [b, h, x, y] of [[0.16, 3.16, -1.03, 1.58], [0.16, 3.16, 1.03, 1.58], [2.22, 0.16, 0, 3.08]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(b, h, 0.2), rahmenTuer); r.position.set(x, y, 0); g.add(r); }
    const tritt = flach(new THREE.CircleGeometry(1.25, 48), grund(P.ring, { transparent: true, opacity: 0.22, depthWrite: false }), 0, 0.012, 1.3); tritt.renderOrder = 1;
    g.add(wand, glut, tritt);
    // Türflügel: zwei Flügel mit Griffleisten, die zum Gang hin aufschwingen, wenn die Figur nah ist; dahinter bleibt der Lichtschein
    const fluegelM = grund(0x14161b, { fog: false }), griffM = grund(P.tuer, { fog: false }), randM = grund(P.tuer, { transparent: true, opacity: 0.18, fog: false }); prT.fluegel = [];
    for (const sg of [-1, 1]) {
      const dreh = new THREE.Group(); dreh.name = 'pr-fluegel'; dreh.position.set(sg * 1.0, 0, 0.03); g.add(dreh);
      const blatt = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, 0.07), fluegelM); blatt.position.set(-sg * 0.5, 1.5, 0);
      const leiste = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 0.09), griffM); leiste.position.set(-sg * 0.86, 1.4, 0.03);
      const rand = new THREE.Mesh(new THREE.BoxGeometry(0.94, 2.9, 0.01), randM); rand.position.set(-sg * 0.5, 1.5, 0.04);
      dreh.add(blatt, leiste, rand); prT.fluegel.push({ dreh, sg });
    }
    prT.auf = 0; prT.glutMat = glut.material;
    const schildC = zeichne(720, 180, () => {}), schildT = tex(schildC);
    const psp = new THREE.Sprite(new THREE.SpriteMaterial({ map: schildT, transparent: true, depthWrite: false, toneMapped: false, fog: false })); psp.scale.set(2.8, 0.7, 1); psp.position.set(prT.pos.x - 0.2, TUER_H + 0.75, prT.pos.z); psp.renderOrder = 5; raum.add(psp);
    { const x = schildC.getContext('2d'), F2 = P.schild; x.fillStyle = F2.grund; runde(x, 6, 14, 708, 152, 76); x.fill();
      const gr = x.createLinearGradient(26, 34, 146, 154); gr.addColorStop(0, F2.a); gr.addColorStop(1, F2.b); x.fillStyle = gr; x.beginPath(); x.arc(90, 90, 60, 0, 7); x.fill();
      x.fillStyle = F2.kreis; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '700 50px ' + SCHRIFT; x.fillText('PR', 90, 95);
      x.textAlign = 'left'; x.font = '600 56px ' + SCHRIFT; x.fillStyle = F2.text; x.fillText('PR-Raum', 172, 93, 520); schildT.needsUpdate = true; }
    prT.schild = psp;
  }
  if (pr && pr.titel) {   // Devin: „da siehst du deinen Rang auf jeden Fall“: große Tafel über der Tür
    const c = zeichne(1024, 300, (x, b, h) => {
      const F2 = P.schild; x.fillStyle = F2.grund; runde(x, 6, 6, b - 12, h - 12, 60); x.fill(); x.strokeStyle = F2.a; x.lineWidth = 6; runde(x, 6, 6, b - 12, h - 12, 60); x.stroke();
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = F2.text2; x.font = '600 58px ' + SCHRIFT; x.fillText('Dein Rang ' + (pr.level || ''), b / 2, 88, b - 80);
      const g = x.createLinearGradient(0, 130, 0, 260); g.addColorStop(0, F2.a); g.addColorStop(1, F2.b); x.fillStyle = g; x.font = '800 118px ' + SCHRIFT; x.fillText(pr.titel, b / 2, 196, b - 80);
    });
    const tafel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(c), transparent: true, depthWrite: false, toneMapped: false, fog: false })); tafel.scale.set(5.2, 1.52, 1); tafel.position.set(0, 3.1, zEnde + 4.2); tafel.renderOrder = 6; raum.add(tafel);
  }

  let namensTafel = null;
  if (spieler && spieler.name) {
    const t = zeichne(640, 128, (x, b) => { x.font = '800 60px ' + SCHRIFT; const w = Math.min(b - 8, x.measureText(spieler.name).width + 70); x.fillStyle = P.schild.grund; runde(x, (b - w) / 2, 10, w, 108, 54); x.fill(); x.fillStyle = P.schild.text; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(spieler.name, b / 2, 67, b - 50); });
    namensTafel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(t), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));   // Der Name bleibt auch vor einem Gerät lesbar
    namensTafel.scale.set(1.5, 0.3, 1); namensTafel.position.set(0, 2.2, 0); namensTafel.renderOrder = 7; szene.add(namensTafel);
  }
  /* ---------- Figur und Kamera ---------- */
  const F = V(0, 0, zAnfang + 4), K = { pos: V(15, 16, zAnfang + 28), blick: V(-1, 2.2, zAnfang - 8), fov: sichtOben() };   // erst das Gebäude schräg von oben (Flachdach, Fassade, Glasfront zum Meer)
  let H = Math.PI, zielH = Math.PI, ph = 0, schrittL = 0, gang = null, warte = 0, nachWarte = null, hupf = 0;
  let hallenWinkel = 0, aktiv = null, kamFlug = null, modus = 'draussen', orbit = null, zeit = 0, gehX = 0, gehY = 0;
  let kamNick = 0, kamStickX = 0, kamStickY = 0, kamStickId = null;   // Kamera-Joystick (09.11.2026): drehen und nach oben oder unten sehen
  let kamW = 0, kamZ = 1, bisZiel = 0, vonZiel = 0, tuerOffen = 0, auftritt = null, nahe = null;
  let tuerEin = spieler ? 1 : 0, tuerEinZiel = tuerEin, tuerSicht = false, reach = 0, reachZiel = 0, einstiegLaeuft = !spieler;   // Eingangstür (0 zu, 1 auf), Blick von draußen auf die Tür, Hand zum Türgriff
  const legeHalle = (p, w) => {
    const delta = w - hallenWinkel; hallenWinkel = w;
    raum.rotation.y = -w; raum.position.set(p.x, 0, p.z).applyAxisAngle(Y, -w).negate(); raum.updateMatrixWorld(true); himmel.rotation.y = -w;   // die Sonne bleibt am selben Platz der Halle
    if (delta) for (const l of lichter) l.position.applyAxisAngle(Y, -delta);
  };
  const legeKamera = () => {
    a.kamera.position.copy(raum.localToWorld(K.pos.clone()));
    a.kamera.lookAt(raum.localToWorld(K.blick.clone()));
    if (Math.abs(a.kamera.fov - K.fov) > 0.01) { a.kamera.fov = K.fov; a.kamera.updateProjectionMatrix(); }
  };
  const verfolgen = () => {
    if (LIVE) {
      const k = folgeKamera(halle, F, kamW, kamZ, 'live', kamNick), p = V(k.pos.x, k.pos.y, k.pos.z);
      // Live-Gym (Devin: „Kamera wie im Spiel … geht nie durch Wände oder Geräte“): Steht zwischen Figur und Kamera ein Gerät, Möbel oder eine Statue (unter 2,6 m Höhe), rückt die Kamera davor heran
      const dx = p.x - F.x, dz = p.z - F.z, L = Math.hypot(dx, dz); let frei = 1;
      if (L > 0.5) for (let t = 1.0 / L; t <= 1; t += 0.15 / L) {
        const x = F.x + dx * t, z = F.z + dz * t, y = 1.35 + (p.y - 1.35) * t; if (y > 2.6) break;
        const drin = stationen.some((s) => s.i !== aktiv && Math.hypot(x - s.pos.x, z - s.pos.z) < 1.25) || hindernisse.some((h) => (h.box ? x > h.box[0] - 0.2 && x < h.box[1] + 0.2 && z > h.box[2] - 0.2 && z < h.box[3] + 0.2 : Math.hypot(x - h.x, z - h.z) < h.r + 0.2));
        if (drin) { frei = Math.max(1.3 / L, t - 0.2 / L); break; }
      }
      if (frei < 1) { p.x = F.x + dx * frei; p.z = F.z + dz * frei; p.y = 1.35 + (p.y - 1.35) * frei + (1 - frei) * 0.9; }   // näher heran und etwas höher, so bleibt die Figur im Bild
      return { pos: p, blick: V(k.blick.x, k.blick.y, k.blick.z), fov: hochkant() ? 66 : 50 };
    }
    const k = folgeKamera(halle, F, kamW, kamZ, !!spieler);   // geht nie durch eine Wand, nie über die Decke; dein Charakter ist groß im Bild
    return { pos: V(k.pos.x, k.pos.y, k.pos.z), blick: V(k.blick.x, k.blick.y + kamNick * 9, k.blick.z), fov: sichtOben() };   // kamNick hebt den Blick (Joystick der Kamera), so sieht man auch den Mond
  };
  const vorTuer = () => ({ pos: V(0, 2.5, zAnfang + 7.6), blick: V(0, 1.75, zAnfang), fov: sichtOben() });   // der Blick von draußen auf die Eingangstür
  function kameraZu(ziel, dauer, dann) {
    kamFlug = { vonPos: K.pos.clone(), vonBlick: K.blick.clone(), vonFov: K.fov, ziel: typeof ziel === 'function' ? ziel : () => ziel, u: 0, dauer: STILL ? 0.01 : dauer, dann };
  }
  function setzeAktiv(i) {
    const s = stationen[i];
    aktiv = i;
    legeHalle(s.pos, s.winkel);
    a.figur.gruppe.position.y = 0;
    a.kamera.fov = sichtStation(); a.kamera.updateProjectionMatrix();
    a.geraete.scheiben = Array.isArray(s.u.scheiben) ? s.u.scheiben : null;
    a.zeige(s.anim, s.d.m || []);
    s.sichtLokal = a.kamera.position.clone(); s.zielLokal = a.ziel.clone();
    if (s.statisch) s.statisch.visible = false;
    spielerRing.visible = false; if (namensTafel) namensTafel.visible = false;
    legeKamera();
  }
  function frei(p, w) {
    if (aktiv != null && stationen[aktiv].statisch) stationen[aktiv].statisch.visible = true;
    aktiv = null; a.uebung = null; a.intro = null; a.geraete.leeren(); a.figur.markiere([]);
    for (const s of stationen) if (s.veraltet) { s.veraltet = false; geraetBauen(s); }   // PR-Raum: Das Gerät zeigt jetzt die neuen Scheiben
    a.figur.hutFest = null; a.figur.hutKorr = null;   // zwischen den Stationen sitzt der Hut wieder auf dem Kopf
    if (a.figur.hut) { a.figur.hut.visible = !a.figur.ohneHut; if (a.figur.haarAnzeige) a.figur.haarAnzeige(); }
    F.set(p.x, 0, p.z); H = zielH = w; legeHalle(F, 0); spielerRing.visible = true; if (namensTafel) namensTafel.visible = true;
  }
  const offeneZahl = () => stationen.filter((s) => !s.fertig).length;
  const naechste = () => { if (pr) return null; const s = stationen.find((x) => !x.fertig); return s ? s.i : null; };   // im PR-Raum gibt es keine Reihenfolge, die Tür ist offen

  function stand() {
    if (pr) {
      kopfS.textContent = pr.rang || ''; weiter.textContent = ''; vonZiel = 0; bisZiel = 1; wegU.von.value = 0;
      if (nahe != null) weiter.append(el('small', null, 'PR eintragen'), el('b', null, stationen[nahe].u.name));
      else weiter.append(el('small', null, 'Zur Tür'), el('b', null, pr.ausgang || 'Zurück'));
      schildMalen(true); lichtSaeule.visible = false; rahmenM.opacity = 1;
      return;
    }
    const fertig = N - offeneZahl(), n = naechste();
    if (livePlan) livePlan.auffrischen();
    kopfS.textContent = fertig + ' von ' + N + ' geschafft';
    [...punkte.children].forEach((p, i) => { p.className = stationen[i].fertig ? 'an' : i === n ? 'jetzt' : ''; });
    const anteil = (z) => wegIndex(V(0, 0, z)) / STUECKE;
    vonZiel = n == null ? anteil(zEnde + 2.4) : n === 0 ? 0 : anteil(stationen[n - 1].pos.z);
    bisZiel = n == null ? 1 : anteil(stationen[n].pos.z);
    wegU.von.value = vonZiel;
    weiter.textContent = '';
    if (naheTuer) weiter.append(el('small', null, 'Tür öffnen'), el('b', null, 'PR-Raum'));
    else if (nahe != null && !stationen[nahe].fertig) weiter.append(el('small', null, 'Hier trainieren'), el('b', null, stationen[nahe].u.name));
    else if (n == null) weiter.append(el('small', null, 'Alles geschafft'), el('b', null, 'Zur Tür'));
    else weiter.append(el('small', null, n === 0 ? 'Los geht’s' : 'Nächste Station: ' + (n + 1)), el('b', null, stationen[n].u.name));
    if (n == null) { schildMalen(true); lichtSaeule.visible = false; rahmenM.opacity = 1; }
    else { lichtSaeule.visible = true; lichtSaeule.position.set(stationen[n].pos.x, 1.6, stationen[n].pos.z); }
  }
  function modusSetzen(m) {
    modus = m;
    wurzel.classList.toggle('an-station', m === 'station');
    wurzel.classList.toggle('faehrt', m === 'draussen' || m === 'lauf');
  }
  function pop(klein, gross) {
    popEl.textContent = ''; popEl.append(el('small', null, klein), gross); popEl.classList.remove('an'); void popEl.offsetWidth; popEl.classList.add('an');
  }
  function lauf(punkte2, dann) { gang = { punkte: punkte2, i: 0, dann }; }

  /* Zur Station laufen, kurz drehen, dann taucht die Kamera ein und die Figur geht ins Gerät */
  function zurStation(i) {
    if (modus === 'draussen') return;
    tipp.classList.add('weg'); karte.classList.remove('offen'); orbit = null;
    stationen.forEach((x) => { x.schild.visible = true; });
    if (aktiv != null) frei(stationen[aktiv].start, stationen[aktiv].startH);
    modusSetzen('lauf');
    const s = stationen[i];
    lauf(route(F, s.start), () => { zielH = s.startH; warte = STILL ? 0 : 0.22; nachWarte = () => ankommen(i); });
    kameraZu(verfolgen, 0.7);
  }
  function ankommen(i) {
    const s = stationen[i];
    F.copy(s.start); H = zielH = s.startH;
    if (s.anim) setzeAktiv(i);
    else { s.sichtLokal = V(0.8, 1.6, 4.2); s.zielLokal = V(0, 0.9, 0); }
    pop(pr ? 'PR-Raum' : 'Station ' + (i + 1), s.u.name);
    s.schild.visible = false; lichtSaeule.visible = false;
    const nah = spieler && spieler.karteKlein;   // Probetag mit kleiner Karte: Figur groß. Die Karte der App mit den Sätzen ist höher, dort bleibt es beim normalen Abstand
    const sv = stationsSicht(s, { hochkant: hochkant(), nah: !!nah, spieler: !!spieler });   // die Rechnung steht oben (reine Funktion, wird auch gemessen)
    const blick = V(sv.blick.x, sv.blick.y, sv.blick.z), sicht = V(sv.sicht.x, sv.sicht.y, sv.sicht.z), off = sicht.clone().sub(blick);
    // Bahn der Kamera um die Figur: gemerkt werden Radius, Winkel und Höhe; an der Wand kürzt umlaufKamera den Radius in jedem Bild, so geht sie nie durch die Wand
    const bahn = { mitte: blick, r: Math.hypot(off.x, off.z), w: Math.atan2(off.x, off.z), y: sicht.y, fov: sichtStation(), versatz: sv.senken, heben: 0, hebenZiel: 0 }, start = umlaufKamera(halle, bahn);
    kameraZu({ pos: V(start.x, start.y, start.z), blick, fov: start.fov || sichtStation() }, 1.5, () => {
      orbit = bahn;
      kNr.textContent = pr ? s.u.name : 'Station ' + (i + 1) + ' von ' + N; kNr.dataset.station = i; kInhalt.textContent = ''; kName.textContent = pr ? (s.u.wert || 'Noch offen') : s.u.name; karteUnten(false, true);
      if (s.fertig || !beiStation) kInhalt.append(el('h2', null, s.u.name), el('p', 'raum-dosis', s.u.dosis || ''), el('p', 'raum-klein', s.fertig ? 'Diese Station hast du schon geschafft.' : (s.u.pause || '')));
      else beiStation(i, kInhalt);
      karte.classList.add('offen'); modusSetzen('station');
    });
  }
  function zurueckZurKarte(hochspringen) {
    karte.classList.remove('offen'); orbit = null;
    stationen.forEach((x) => { x.schild.visible = true; });
    const i = +kNr.dataset.station, s = stationen[i];
    if (beiStationWeg) beiStationWeg(i);
    blitz.classList.remove('an'); void blitz.offsetWidth; blitz.classList.add('an');
    frei(s.start, s.startH); stand();
    const n = naechste(), ziel = n == null ? V(0, 0, zEnde) : stationen[n].start;
    zielH = Math.atan2(ziel.x - F.x, ziel.z - F.z);
    if (hochspringen) hupf = 1;
    modusSetzen('gehen');
    kameraZu(verfolgen, 1.1);
  }
  function funken() {
    if (STILL) return;
    const mx = wurzel.clientWidth / 2, my = wurzel.clientHeight * 0.42;
    for (let i = 0; i < 26; i++) {
      const f = el('i', 'dk-funke' + (i % 2 ? ' b' : '')), w = i / 26 * Math.PI * 2, d = 80 + (i * 37) % 130;
      f.style.left = mx + 'px'; f.style.top = my + 'px'; f.style.setProperty('--dx', Math.cos(w) * d + 'px'); f.style.setProperty('--dy', Math.sin(w) * d + 'px');
      wurzel.append(f); setTimeout(() => f.remove(), 700);
    }
  }
  function stationFertig(i, bonus) {   // bonus (optional, aus dem Spielstand): { plus: Punkte, levelAuf: { level, titel } | null }, nur zum Anzeigen
    const s = stationen[i]; if (!s || !offen) return;
    s.fertig = true; s.schildMalen(); funken();
    if (navigator.vibrate) { try { navigator.vibrate(14); } catch (e) {} }
    stand();
    pop((bonus && bonus.plus > 0 ? '+' + bonus.plus + ' Punkte · ' : '') + (N - offeneZahl()) + ' von ' + N, offeneZahl() ? 'Station geschafft' : 'Alles geschafft');
    if (bonus && bonus.levelAuf) setTimeout(() => { if (offen) pop('Neuer Rang: ' + bonus.levelAuf.level, bonus.levelAuf.titel); }, 1600);   // erst die Punkte lesen lassen (auch bei „Bewegung reduzieren“), nur sehen, kein Ton
    if (waage) { let st = null; try { st = status(); } catch (e) {} waageSchirmMalen(st); }   // das Display an der Waage zeigt gleich den neuen Stand
    zurueckZurKarte(true);
  }
  // Die Tür steht beim Reinlaufen hinter der Figur: Der kleine Knopf schickt sie von überall hin
  if (prT) { const b = el('button', 'raum-pr-knopf', 'PR-Raum'); b.type = 'button'; b.setAttribute('aria-label', 'Zur Tür in den PR-Raum gehen'); b.addEventListener('click', () => zurPrTuer()); wurzel.append(b); }
  // Zur Tür gehen, durch, Blende, dann öffnet die App den PR-Raum
  function zurPrTuer() {
    if (!prT || modus === 'draussen' || modus === 'station' || tuerUnterwegs) return;
    tuerUnterwegs = true;
    tipp.classList.add('weg'); karte.classList.remove('offen'); orbit = null;
    stationen.forEach((x) => { x.schild.visible = true; });
    if (aktiv != null) frei(stationen[aktiv].start, stationen[aktiv].startH);
    modusSetzen('lauf');
    lauf([...route(F, prT.vorn), prT.pos.clone()], () => { ende.classList.add('offen'); setTimeout(() => { schliessen(false, true); prTuer(); }, STILL ? 0 : 480); });
    kameraZu(verfolgen, 0.7);
  }
  /* Waage: hinlaufen (antippen) oder draufgehen, dann zeigt die Karte den Spielstand. Drehen und Karte runterwischen gehen wie an einer Station. */
  let waageAktiv = false, waageGesperrt = false, waageZeit = 0;
  function zurWaage() {
    if (!waage || modus === 'draussen' || waageAktiv || spiegelAktiv) return;
    tipp.classList.add('weg'); karte.classList.remove('offen'); orbit = null;
    stationen.forEach((x) => { x.schild.visible = true; });
    if (aktiv != null) frei(stationen[aktiv].start, stationen[aktiv].startH);
    modusSetzen('lauf');
    lauf(route(F, waage.pos), () => { zielH = WAAGE_W; warte = STILL ? 0 : 0.22; nachWarte = statusZeigen; });
    kameraZu(verfolgen, 0.7);
  }
  function statusKarte() {   // Inhalt der Karte aus dem Spielstand: Level, Balken, Punkte, Serie, Einheiten, nächstes Ziel (alles Text, nichts Fremdes in die Seite)
    let st = null; try { st = status(); } catch (e) {}
    waageSchirmMalen(st); kInhalt.textContent = '';
    if (!st) { const pz0 = posChipsBauen(); kInhalt.append(el('h2', null, 'Dein Status'), el('p', 'raum-klein', 'Dein Spielstand ist gerade nicht da. Später nochmal versuchen.'), pz0[0], pz0[1]); posChipsFaerben(); return; }
    const kopf = el('div', 'raum-status-kopf'); kopf.append(el('b', null, 'Rang ' + st.level), el('span', null, st.titel));
    const balken = el('div', 'raum-status-balken'), fuell = el('i'); fuell.style.width = Math.round(klemme(+st.anteil || 0, 0, 1) * 100) + '%'; balken.append(fuell);
    const bis = el('p', 'raum-klein', st.naechstes ? 'Noch ' + st.naechstes.fehlt + (st.naechstes.fehlt === 1 ? ' Punkt' : ' Punkte') + ' bis Rang ' + st.naechstes.nr + ' · ' + st.naechstes.titel : 'Höchster Rang erreicht. Stark!');
    const werte = el('div', 'raum-status-werte');
    for (const [zahl, text] of [[st.punkte, 'Punkte'], [st.serieWochen, st.serieWochen === 1 ? 'Woche in Folge' : 'Wochen in Folge'], [st.einheiten, st.einheiten === 1 ? 'Einheit' : 'Einheiten']]) { const d = el('div'); d.append(el('b', null, String(zahl)), el('small', null, text)); werte.append(d); }
    kInhalt.append(kopf, balken, bis, werte); if (st.ziel) kInhalt.append(el('p', 'raum-klein raum-ziel', st.ziel));
    const pz = posChipsBauen(); kInhalt.append(pz[0], pz[1]); posChipsFaerben();   // Posen auf der Waage (Devin, 09.11.2026)
  }
  function statusZeigen() {
    if (!waage || waageAktiv) return;
    waageAktiv = true; waage.schild.visible = false;
    F.copy(waage.pos); H = zielH = WAAGE_W; posGrund = WAAGE_W; posAn = false; posMix = 0;
    const ws = waageSicht(halle, hochkant()), blick = V(ws.bahn.mitte.x, ws.bahn.mitte.y, ws.bahn.mitte.z);
    const bahn = { ...ws.bahn, mitte: blick, fov: sichtStation(), versatz: ws.senken, heben: 0, hebenZiel: 0 }, start = umlaufKamera(halle, bahn);
    kameraZu({ pos: V(start.x, start.y, start.z), blick, fov: start.fov || sichtStation() }, 1.3, () => {
      orbit = bahn; kNr.textContent = 'Dein Status'; kNr.dataset.station = ''; kName.textContent = 'Waage'; statusKarte();
      karte.classList.add('offen'); modusSetzen('station'); karteUnten(false, true);
    });
  }
  function statusZu() {
    posEnde(); karte.classList.remove('offen'); orbit = null; waageAktiv = false; waageGesperrt = true; waage.schild.visible = true;
    modusSetzen('gehen'); kameraZu(verfolgen, 1.0);
  }
  /* Posen (09.11.2026, Devin: „… wenn er auf der Waage ist, auch posen kann: Doppelbizeps, Rückenpose, Beinepose, Bauchmuskelpose und Most Muscular“): fünf Posen für die Waage und den Spiegel (ohne Ton).
     Eine Pose-Maschine für beide Orte: posWahl blendet weich in die Pose und dreht die Figur, wenn die Pose es braucht (Rücken), posEnde geht zurück ins Stehen. Am Spiegel wechselt es alle 3,4 s von selbst, bis man eine Pose antippt. */
  let posAn = false, posNr = 0, posAlt = 0, posT = 1, posMix = 0, posHalt = 0, posAuto = false, posGrund = 0, posChips = [], posName = null;
  const POSEN = [   // hand: [links, rechts] je [zur Seite der Figur, hoch, nach vorn] ab dem Becken; pol: wohin die Ellbogen zeigen; neigung: Rumpf nach vorn in Grad; fuss: halbe Standbreite; fussVor: [links, rechts] Fuß nach vorn in m;
                    // tief: Becken tiefer in m; dreh: die Figur dreht sich um (Bogenmaß); rumpfDreh: der Rumpf dreht sich (Grad, plus = nach links)
    { name: 'Front Double Biceps', kurz: 'Bizeps vorn', hand: [[0.43, 0.8, 0.06], [-0.43, 0.8, 0.06]], pol: [[1, 0.3, -0.35], [-1, 0.3, -0.35]], neigung: 0, fuss: 0.21, fussVor: [0, 0], tief: 0, dreh: 0, rumpfDreh: 0 },
    { name: 'Back Double Biceps', kurz: 'Biz. hinten', hand: [[0.43, 0.8, 0.06], [-0.43, 0.8, 0.06]], pol: [[1, 0.3, -0.35], [-1, 0.3, -0.35]], neigung: 6, fuss: 0.2, fussVor: [0, -0.2], tief: 0.02, dreh: Math.PI, rumpfDreh: 0 },
    { name: 'Side Chest', kurz: 'Side Chest', hand: [[0.05, 0.52, 0.36], [-0.05, 0.54, 0.34]], pol: [[1, -0.3, 0.1], [-1, -0.3, 0.1]], neigung: 2, fuss: 0.2, fussVor: [0.3, -0.08], tief: 0.04, dreh: Math.PI / 2, rumpfDreh: -35 },
    { name: 'Bauchmuskeln', kurz: 'Bauch', hand: [[0.11, 0.8, -0.06], [-0.11, 0.8, -0.06]], pol: [[1, 0.15, 0.4], [-1, 0.15, 0.4]], neigung: 10, fuss: 0.2, fussVor: [0.28, 0], tief: 0.04, dreh: 0, rumpfDreh: 0 },
    { name: 'Beine', kurz: 'Beine', hand: [[0.24, 0.1, 0.1], [-0.24, 0.1, 0.1]], pol: [[1, -0.1, -0.25], [-1, -0.1, -0.25]], neigung: 3, fuss: 0.24, fussVor: [0.5, -0.12], tief: 0.09, dreh: 0, rumpfDreh: -12 },
    { name: 'Lat Spread (Rücken)', kurz: 'Rücken', hand: [[0.2, 0.1, 0.14], [-0.2, 0.1, 0.14]], pol: [[1, 0, -0.7], [-1, 0, -0.7]], neigung: 8, fuss: 0.21, fussVor: [0, 0], tief: 0, dreh: Math.PI, rumpfDreh: 0 },
    { name: 'Most Muscular', kurz: 'Most M.', hand: [[0.07, 0.44, 0.34], [-0.07, 0.44, 0.34]], pol: [[1, -0.2, 0.2], [-1, -0.2, 0.2]], neigung: 16, fuss: 0.22, fussVor: [0, 0], tief: 0.06, dreh: 0, rumpfDreh: 0 }
  ];
  function posChipsFaerben() {
    posChips.forEach((b, i) => b.classList.toggle('jetzt', posAn && posNr === i));
    if (posName) posName.textContent = posAn ? POSEN[posNr].name : 'Tippe eine Pose an.';
  }
  function posChipsBauen() {   // fünf Knöpfe und darunter der Name der Pose: antippen = diese Pose, dieselbe nochmal = zurück ins Stehen
    posChips = [];
    const reihe = el('div', 'raum-pose-reihe');
    POSEN.forEach((p, i) => {
      const b = el('button', 'raum-pose-chip'); b.type = 'button'; b.append(el('b', null, String(i + 1)), el('small', null, p.kurz));
      b.addEventListener('click', () => { if (posAn && posNr === i && !posAuto) posEnde(); else posWahl(i, false); });
      reihe.append(b); posChips.push(b);
    });
    posName = el('p', 'raum-pose-name');
    return [reihe, posName];
  }
  function posWahl(nr, auto) {
    if (posMix > 0.05) { posAlt = posNr; posNr = nr; posT = 0; } else { posAlt = posNr = nr; posT = 1; }   // aus dem Stehen: hineinblenden; aus einer Pose: hinüberblenden
    posAn = true; posAuto = !!auto; posHalt = 0; zielH = posGrund + POSEN[nr].dreh; posChipsFaerben();
  }
  function posEnde() { posAn = false; posAuto = false; zielH = posGrund; posChipsFaerben(); }
  function posAnwenden(pose, dt) {   // liegt über dem Stehen: weich hinein und hinüber (jedes Bild gerufen, ohne Pose kostet es nichts)
    posMix += ((posAn ? 1 : 0) - posMix) * (STILL ? 1 : 1 - Math.exp(-dt * 3.2));
    if (!posAn && posMix < 0.002) { posMix = 0; return; }
    posT = Math.min(1, posT + dt / (STILL ? 0.01 : 0.75));
    if (posAn && posAuto && !STILL && modus === 'station') { posHalt += dt; if (posHalt > 3.4) posWahl((posNr + 1) % POSEN.length, true); }
    const u = glatt(posT), A = POSEN[posAlt], B = POSEN[posNr], w = posMix, mix = (a, b) => a + (b - a) * u;
    pose.becken.y -= mix(A.tief, B.tief) * w;   // zuerst das Becken: Alles Weitere rechnet ab dem Becken
    const vorn = V(Math.sin(H), 0, Math.cos(H)), links = V(Math.cos(H), 0, -Math.sin(H)), oben = V(0, 1, 0);
    const ort = (o) => pose.becken.clone().addScaledVector(links, o[0]).addScaledVector(oben, o[1]).addScaledVector(vorn, o[2]);
    const richt = (o) => links.clone().multiplyScalar(o[0]).addScaledVector(oben, o[1]).addScaledVector(vorn, o[2]);
    pose.hand.l = pose.hand.l.clone().lerp(ort(A.hand[0]).lerp(ort(B.hand[0]), u), w); pose.hand.r = pose.hand.r.clone().lerp(ort(A.hand[1]).lerp(ort(B.hand[1]), u), w);
    pose.ellbogenPol.l = pose.ellbogenPol.l.clone().lerp(richt(A.pol[0]).lerp(richt(B.pol[0]), u), w); pose.ellbogenPol.r = pose.ellbogenPol.r.clone().lerp(richt(A.pol[1]).lerp(richt(B.pol[1]), u), w);
    const spreiz = (mix(A.fuss, B.fuss) - 0.11) * w;
    pose.fuss.l = pose.fuss.l.clone().addScaledVector(links, spreiz).addScaledVector(vorn, mix(A.fussVor[0], B.fussVor[0]) * w);
    pose.fuss.r = pose.fuss.r.clone().addScaledVector(links, -spreiz).addScaledVector(vorn, mix(A.fussVor[1], B.fussVor[1]) * w);
    const dreh = mix(A.rumpfDreh, B.rumpfDreh) * w * Math.PI / 180, neig = mix(A.neigung, B.neigung) * w * Math.PI / 180;
    pose.rumpf.basis = pose.rumpf.basis.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), dreh)).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), neig));
  }
  /* Spiegel (09.11.2026): hinlaufen (antippen) oder daraufgehen, dann dreht sich die Figur zum Spiegel und zeigt der Reihe nach die fünf Posen; Drehen und Karte runterwischen gehen wie an der Waage */
  let spiegelAktiv = false, spiegelGesperrt = false, spiegelZeit = 0;
  function zumSpiegel() {
    if (modus === 'draussen' || waageAktiv || spiegelAktiv) return;
    tipp.classList.add('weg'); karte.classList.remove('offen'); orbit = null;
    stationen.forEach((x) => { x.schild.visible = true; });
    if (aktiv != null) frei(stationen[aktiv].start, stationen[aktiv].startH);
    modusSetzen('lauf');
    lauf(route(F, spiegel.pos), () => { zielH = SPIEGEL_W; warte = STILL ? 0 : 0.22; nachWarte = spiegelStart; });
    kameraZu(verfolgen, 0.7);
  }
  function spiegelKarte() {
    kInhalt.textContent = '';
    const pz = posChipsBauen(), weiterB = el('button', 'raum-pose-weiter', 'Nächste Pose'); weiterB.type = 'button'; weiterB.addEventListener('click', () => posWahl((posNr + 1) % POSEN.length, false));
    kInhalt.append(el('p', 'raum-klein', 'Dreh die Kamera mit dem Finger, dann siehst du dich von allen Seiten.'), pz[0], pz[1], weiterB); posChipsFaerben();
  }
  function spiegelStart() {
    if (spiegelAktiv) return;
    spiegelAktiv = true; spiegel.schild.visible = false;
    F.copy(spiegel.pos); H = zielH = SPIEGEL_W; posGrund = SPIEGEL_W; posAn = false; posMix = 0; posWahl(0, true);
    const ss = spiegelSicht(halle, hochkant()), blick = V(ss.bahn.mitte.x, ss.bahn.mitte.y, ss.bahn.mitte.z);
    const bahn = { ...ss.bahn, mitte: blick, fov: sichtStation(), versatz: ss.senken, heben: 0, hebenZiel: 0 }, start = umlaufKamera(halle, bahn);
    kameraZu({ pos: V(start.x, start.y, start.z), blick, fov: start.fov || sichtStation() }, 1.3, () => {
      orbit = bahn; kNr.textContent = 'Spiegel'; kNr.dataset.station = ''; kName.textContent = 'Posen'; spiegelKarte();
      karte.classList.add('offen'); modusSetzen('station'); karteUnten(false, true);
    });
  }
  function spiegelZu() {
    posEnde(); karte.classList.remove('offen'); orbit = null; spiegelAktiv = false; spiegelGesperrt = true; spiegel.schild.visible = true;
    modusSetzen('gehen'); kameraZu(verfolgen, 1.0);
  }
  kZurueck.addEventListener('click', () => (waageAktiv ? statusZu() : spiegelAktiv ? spiegelZu() : zurueckZurKarte(false)));

  /* Karte runter- und hochwischen (07.11.2026): am Griff oder an der Kopfzeile ziehen. Unten bleibt nur die Kopfzeile mit dem Namen der Übung,
     die Kamera holt die Figur in die Mitte, drehen geht weiter. Hochwischen oder die Leiste antippen holt die Karte zurück. */
  function karteUnten(unten, sofort) {
    karte.classList.toggle('unten', !!unten);
    karte.style.setProperty('--raum-blick', Math.round(kKopf.offsetTop + kKopf.offsetHeight + 4) + 'px');
    if (sofort) { karte.classList.add('zieht'); void karte.offsetWidth; karte.classList.remove('zieht'); }
    kGriff.setAttribute('aria-expanded', unten ? 'false' : 'true');
    kGriff.setAttribute('aria-label', unten ? 'Karte hochholen' : 'Karte nach unten schieben');
    if (orbit) { orbit.hebenZiel = unten ? orbit.versatz * 0.85 : 0; if (sofort) orbit.heben = orbit.hebenZiel; }
  }
  const zug = { id: null, y0: 0, start: 0, hub: 0, bewegt: false, griff: false, v: 0, ly: 0, lt: 0 };
  karte.addEventListener('pointerdown', (e) => {
    if (zug.id != null || !karte.classList.contains('offen') || (e.pointerType === 'mouse' && e.button > 0)) return;
    const unten = karte.classList.contains('unten');
    if (e.target.closest('.raum-zurueck') || (!unten && !e.target.closest('.raum-griff, .raum-karte-kopf'))) return;   // offen: nur am Griff und an der Kopfzeile
    const blickH = unten ? parseFloat(karte.style.getPropertyValue('--raum-blick')) || 64 : kKopf.offsetTop + kKopf.offsetHeight + 4;
    zug.id = e.pointerId; zug.y0 = zug.ly = e.clientY; zug.lt = e.timeStamp; zug.hub = Math.max(0, karte.offsetHeight - blickH);   // Zeit des Fingers selbst: stimmt auch, wenn das Gym gerade viel rechnet
    zug.start = unten ? zug.hub : 0; zug.bewegt = false; zug.griff = !!e.target.closest('.raum-griff'); zug.v = 0;
    try { karte.setPointerCapture(e.pointerId); } catch (x) {}
  });
  karte.addEventListener('pointermove', (e) => {
    if (e.pointerId !== zug.id) return;
    const dy = e.clientY - zug.y0, t = e.timeStamp;
    if (!zug.bewegt) { if (Math.abs(dy) < 6) return; zug.bewegt = true; karte.classList.add('zieht'); }
    let y = zug.start + dy;
    if (y < 0) y = -Math.min(22, Math.sqrt(-y) * 3); else if (y > zug.hub) y = zug.hub + Math.min(22, Math.sqrt(y - zug.hub) * 3);   // an den Enden federt sie nur ein bisschen
    karte.style.transform = 'translate3d(0, ' + y.toFixed(1) + 'px, 0)';
    zug.v = (e.clientY - zug.ly) / Math.max(1, t - zug.lt); zug.ly = e.clientY; zug.lt = t;
    if (orbit) orbit.hebenZiel = orbit.versatz * 0.85 * klemme(y / Math.max(1, zug.hub), 0, 1);   // die Kamera geht beim Ziehen mit
  });
  const zugEnde = (e) => {
    if (e.pointerId !== zug.id) return;
    zug.id = null;
    const warUnten = karte.classList.contains('unten'), dy = e.clientY - zug.y0;
    karte.style.transform = ''; karte.classList.remove('zieht');
    if (!zug.bewegt) { if (e.type === 'pointerup' && (warUnten || zug.griff)) karteUnten(!warUnten); else if (orbit) orbit.hebenZiel = warUnten ? orbit.versatz * 0.85 : 0; return; }
    const weit = Math.abs(dy) > zug.hub * 0.25, schnell = Math.abs(zug.v) > 0.4;
    karteUnten(warUnten ? !(dy < 0 && (weit || (schnell && zug.v < 0))) : (dy > 0 && (weit || (schnell && zug.v > 0))));
  };
  karte.addEventListener('pointerup', zugEnde); karte.addEventListener('pointercancel', zugEnde);
  kGriff.addEventListener('click', (e) => { if (e.detail === 0) karteUnten(!karte.classList.contains('unten')); });   // Tastatur (Enter, Leertaste); Finger und Maus laufen über pointerup

  function rausgehen() {
    if (!pr && offeneZahl()) { sag('Noch offen: ' + stationen.filter((s) => !s.fertig).map((s) => s.u.name).join(', ')); return; }
    karte.classList.remove('offen');
    if (aktiv != null) frei(stationen[aktiv].start, stationen[aktiv].startH);
    modusSetzen('draussen');
    lauf([...route(F, V(0, 0, zEnde + 1.6)), V(0, 0, zEnde - 7)], null);
    kameraZu(verfolgen, 0.8);
    const warteBisTuer = () => {
      if (!offen) return;
      if (F.z > zEnde + 1.2 && gang) { setTimeout(warteBisTuer, 120); return; }
      kameraZu({ pos: V(0, 3.4, zEnde + 5.2), blick: V(0, 1.2, zEnde - 14), fov: sichtOben() }, 1.8);
      setTimeout(zeigeEnde, STILL ? 0 : 1800);
    };
    warteBisTuer();
  }
  function zeigeEnde() {
    if (!offen) return;
    ende.classList.add('offen');   // Blende, danach zeigt die App die Zusammenfassung (Zeiten, Gewichte, an Devin schicken)
    setTimeout(() => schliessen(true), STILL ? 0 : 950);
  }
  let sagUhr = null;
  function sag(t) { meldung.textContent = t; meldung.classList.add('offen'); clearTimeout(sagUhr); sagUhr = setTimeout(() => meldung.classList.remove('offen'), 3200); }
  weiter.addEventListener('click', () => { if (naheTuer) return zurPrTuer(); const n = nahe != null && !stationen[nahe].fertig ? nahe : naechste(); if (n == null) rausgehen(); else zurStation(n); });

  /* ---------- Antippen, Wischen, Knüppel ---------- */
  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function einstiegUeberspringen() {   // Antippen im Einstieg: gleich hinein, die Tür steht offen
    if (!einstiegLaeuft) return;
    einstiegLaeuft = false; gang = null; nachWarte = null; warte = 0; kamFlug = null; tuerSicht = false; reachZiel = 0; reach = 0; tuerEinZiel = 1; tuerEin = 1;
    F.set(0, 0, zStart); H = zielH = Math.PI; modusSetzen('gehen'); kameraZu(verfolgen, STILL ? 0.01 : 0.7, null);
  }
  function angetippt(cx, cy) {
    if (modus === 'draussen' && einstiegLaeuft) { einstiegUeberspringen(); return; }
    if (modus === 'draussen' || modus === 'station') return;
    const r = bild.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(ndc, a.kamera);
    const o = raum.worldToLocal(strahl.ray.origin.clone()), d = strahl.ray.direction.clone().applyAxisAngle(Y, hallenWinkel);
    // Boden- oder Gerätetreffer: nächste Station unter dem Finger
    let beste = null, bt = 1e9;
    for (const s of [...stationen, ...(waage ? [waage] : []), ...(prT ? [prT] : []), spiegel]) {
      const fx = o.x - s.pos.x, fz = o.z - s.pos.z, A = d.x * d.x + d.z * d.z, B = fx * d.x + fz * d.z, C = fx * fx + fz * fz - (s.r || STATION_R) ** 2, D = B * B - A * C;
      if (D < 0 || !A) continue;
      const t = (-B - Math.sqrt(D)) / A, y = o.y + d.y * Math.max(t, 0);
      if (t > -1 && y < 3.6 && t < bt) { bt = t; beste = s; }
    }
    if (beste) return beste.istSpiegel ? zumSpiegel() : beste.istWaage ? zurWaage() : beste.istTuer ? zurPrTuer() : zurStation(beste.i);
    if (d.x < -1e-6) {   // die Spiegelwand selbst antippen
      const ts = (spiegelXWand - o.x) / d.x, ys = o.y + d.y * ts, zs = o.z + d.z * ts;
      if (ts > 0 && ys > 0.4 && ys < 3.6 && Math.abs(zs - SP.z) < SP.laenge / 2 + 0.2) return zumSpiegel();
    }
    if (d.y >= -0.01) return;
    const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
    if (Math.abs(x) < TUER_B && z < zEnde + 3.6) return rausgehen();
    tipp.classList.add('weg');
    lauf([V(klemme(x, -BREITE / 2 + FIGUR_RAND, BREITE / 2 - FIGUR_RAND), 0, klemme(z, zEnde + FIGUR_RAND, zAnfang - FIGUR_RAND))], null);
  }
  const finger = { id: null, x: 0, y: 0, sx: 0, sy: 0, zeit: 0, weit: false };
  const zeiger = new Map(); let pinch = null;   // alle Finger auf dem Bild: zwei Finger zoomen (an der Übung, an der Waage und am Spiegel rückt die Kamera heran, beim Gehen ändert sich die Höhe wie beim Ziehen nach oben und unten)
  const ZOOM_MIN = 0.3, ZOOM_MAX = 1.25, ZOOM_NAH = 1.5;   // Faktor auf den Radius der Bahn (orbit.r0 = der Radius zu Beginn); näher als 1,5 m an die Mitte geht die Kamera nie
  const zoomSetzen = (z) => { if (orbit.r0 == null) orbit.r0 = orbit.r; orbit.r = Math.max(orbit.r0 * klemme(z, ZOOM_MIN, ZOOM_MAX), Math.min(orbit.r0, ZOOM_NAH)); };
  const pinchStart = () => {
    const p = [...zeiger.entries()]; if (p.length !== 2 || !((modus === 'station' && orbit) || modus === 'gehen' || modus === 'lauf')) return;
    const d = Math.hypot(p[0][1].x - p[1][1].x, p[0][1].y - p[1][1].y); if (d < 20) return;
    finger.weit = true; tipp.classList.add('weg');
    pinch = { a: p[0][0], b: p[1][0], d0: d, z0: modus === 'station' && orbit ? (orbit.r0 == null ? 1 : orbit.r / orbit.r0) : kamZ };
  };
  bild.addEventListener('pointerdown', (e) => {
    zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (finger.id != null) { if (!pinch && zeiger.size === 2) { pinchStart(); try { bild.setPointerCapture(e.pointerId); } catch (x) {} } return; }
    finger.id = e.pointerId; finger.x = finger.sx = e.clientX; finger.y = finger.sy = e.clientY; finger.zeit = performance.now(); finger.weit = false; try { bild.setPointerCapture(e.pointerId); } catch (x) {}
  });
  bild.addEventListener('pointermove', (e) => {
    if (zeiger.has(e.pointerId)) zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {   // zwei Finger: auseinander = hineinzoomen, zusammen = herauszoomen
      if (e.pointerId === finger.id) { finger.x = e.clientX; finger.y = e.clientY; }
      const a = zeiger.get(pinch.a), b = zeiger.get(pinch.b); if (!a || !b) return;
      const f = pinch.d0 / Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      if (modus === 'station' && orbit) zoomSetzen(pinch.z0 * f); else kamZ = klemme(pinch.z0 * f, 0.55, 2.3);
      return;
    }
    if (e.pointerId !== finger.id) return;
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y; finger.x = e.clientX; finger.y = e.clientY;
    if (Math.hypot(e.clientX - finger.sx, e.clientY - finger.sy) > 8) finger.weit = true;
    if (!finger.weit) return;
    if (modus === 'station' && orbit) { orbit.w -= dx * 0.008; orbit.y = klemme(orbit.y - dy * 0.008, ORBIT_Y_MIN, ORBIT_Y_MAX); }
    else if (modus === 'gehen' || modus === 'lauf') { kamW -= dx * 0.006; if (LIVE) kamNick = klemme(kamNick + dy * 0.004, -0.6, 1); else kamZ = klemme(kamZ + dy * 0.004, 0.55, 2.3); tipp.classList.add('weg'); }   // Live-Gym: ziehen = umsehen (Zoom mit Mausrad oder zwei Fingern)
  });
  const loslassen = (e) => {
    zeiger.delete(e.pointerId);
    if (pinch && (e.pointerId === pinch.a || e.pointerId === pinch.b)) { pinch = null; finger.weit = true; }   // nach dem Zoomen kein Antippen
    if (e.pointerId !== finger.id) return; finger.id = null;
    if (!finger.weit && performance.now() - finger.zeit < 450 && e.type === 'pointerup') angetippt(e.clientX, e.clientY);
  };
  bild.addEventListener('pointerup', loslassen); bild.addEventListener('pointercancel', loslassen);
  bild.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (modus === 'station' && orbit) { if (orbit.r0 == null) orbit.r0 = orbit.r; zoomSetzen(orbit.r / orbit.r0 * Math.exp(e.deltaY * 0.0012)); }   // an der Übung: Mausrad zoomt
    else kamZ = klemme(kamZ + e.deltaY * 0.001, 0.55, 2.3);
  }, { passive: false });
  let stickId = null;
  const stickSetzen = (e) => {
    const r = stick.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2, gr = r.width / 2 - 14;
    let x = (e.clientX - mx) / gr, y = (e.clientY - my) / gr; const l = Math.hypot(x, y); sprint = l > 1.12; if (l > 1) { x /= l; y /= l; }   // über den Rand gezogen: rennen
    gehX = x; gehY = y; stickK.style.transform = 'translate(' + x * gr + 'px,' + y * gr + 'px)';
  };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (x) {} stickSetzen(e); gang = null; tipp.classList.add('weg'); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickSetzen(e); });
  const stickLos = (e) => { if (e.pointerId !== stickId) return; stickId = null; gehX = gehY = 0; sprint = false; stickK.style.transform = ''; };
  stick.addEventListener('pointerup', stickLos); stick.addEventListener('pointercancel', stickLos);
  // Zweiter Joystick, rechts über dem großen Knopf: die Kamera (nur beim Gehen; an der Übung wischt man oder zoomt mit zwei Fingern)
  const kamStick = el('div', 'raum-kamstick'), kamStickK = el('i'); kamStick.append(kamStickK); kamStick.setAttribute('aria-hidden', 'true'); wurzel.append(kamStick);
  const kamStickSetzen = (e) => {
    const rc = kamStick.getBoundingClientRect(), mx = rc.left + rc.width / 2, my = rc.top + rc.height / 2, gr = rc.width / 2 - 12;
    let x = (e.clientX - mx) / gr, y = (e.clientY - my) / gr; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    kamStickX = x; kamStickY = y; kamStickK.style.transform = 'translate(' + x * gr + 'px,' + y * gr + 'px)';
  };
  kamStick.addEventListener('pointerdown', (e) => { kamStickId = e.pointerId; try { kamStick.setPointerCapture(e.pointerId); } catch (x) {} kamStickSetzen(e); tipp.classList.add('weg'); });
  kamStick.addEventListener('pointermove', (e) => { if (e.pointerId === kamStickId) kamStickSetzen(e); });
  const kamStickLos = (e) => { if (e.pointerId !== kamStickId) return; kamStickId = null; kamStickX = kamStickY = 0; kamStickK.style.transform = ''; };
  kamStick.addEventListener('pointerup', kamStickLos); kamStick.addEventListener('pointercancel', kamStickLos);

  // Am PC: Pfeiltasten oder WASD statt Knüppel
  const tasten = new Set(), TASTE = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'v', w: 'v', W: 'v', ArrowDown: 'h', s: 'h', S: 'h' };
  const tasteNeu = (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (LIVE && e.type === 'keydown' && !e.repeat) {   // Live-Gym: E = das, was der große Knopf gerade anbietet; Tab = Plan auf- und zuklappen
      if (e.key === 'e' || e.key === 'E') { if (weiter.offsetParent && getComputedStyle(weiter).visibility !== 'hidden') weiter.click(); e.preventDefault(); return; }
      if (e.key === 'Tab') { e.preventDefault(); if (livePlan) livePlan.umschalten(); return; }
    }
    if (e.key === 'Shift') { sprint = e.type === 'keydown'; return; }
    const t = TASTE[e.key]; if (!t || stickId != null) return;
    if (e.type === 'keydown') tasten.add(t); else tasten.delete(t);
    const x = (tasten.has('r') ? 1 : 0) - (tasten.has('l') ? 1 : 0), y = (tasten.has('h') ? 1 : 0) - (tasten.has('v') ? 1 : 0), l = Math.hypot(x, y) || 1;
    gehX = x / l; gehY = y / l; e.preventDefault();
    if (x || y) { gang = null; tipp.classList.add('weg'); }
  };
  if (spieler || LIVE) { window.addEventListener('keydown', tasteNeu); window.addEventListener('keyup', tasteNeu); aufraeumen = () => { window.removeEventListener('keydown', tasteNeu); window.removeEventListener('keyup', tasteNeu); }; }
  /* ---------- Führung (04.11.2026, Devin: Striche, die „die ganze Zeit den Charakter verfolgen und ihn immer zu der nächsten Übung führen“): Vom Charakter laufen Striche über den Boden zur nächsten Station, danach zur Tür, und ziehen beim Laufen mit. Sie nehmen den Gang in der Mitte, sonst gingen sie durch fremde Geräte. ---------- */
  const STRICH_N = 240, STRICH_B = 0.2, STRICH_Y = 0.021;
  const strichPos = new Float32Array((STRICH_N + 1) * 6), strichWo = new Float32Array((STRICH_N + 1) * 4), strichIdx = [];
  for (let i = 0; i < STRICH_N; i++) { const k = i * 2; strichIdx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const strichGeo = new THREE.BufferGeometry();
  strichGeo.setAttribute('position', new THREE.BufferAttribute(strichPos, 3).setUsage(THREE.DynamicDrawUsage));
  strichGeo.setAttribute('wo', new THREE.BufferAttribute(strichWo, 2).setUsage(THREE.DynamicDrawUsage));
  strichGeo.setIndex(strichIdx);
  const strichU = { zeit: { value: 0 }, laenge: { value: 1 }, sicht: { value: 0 }, farbe: { value: new THREE.Vector3(...P.strich) } };
  const strichMat = new THREE.ShaderMaterial({ uniforms: strichU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'attribute vec2 wo; varying vec2 vW; void main(){ vW = wo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // Der Abstand zählt vom Ziel aus: So bleiben die Striche auf dem Boden liegen, wenn die Linie beim Laufen kürzer wird, und wandern trotzdem zum Ziel
    fragmentShader: `varying vec2 vW; uniform float zeit, laenge, sicht; uniform vec3 farbe;
      void main(){
        float rest = laenge - vW.x, abstand = 0.74;
        float x = (fract((rest + zeit * 1.5) / abstand) - 0.5) * abstand;
        float d = length(vec2(max(abs(x) - 0.17, 0.0), vW.y)) - 0.075;
        float strich = smoothstep(0.018, -0.018, d), schein = smoothstep(0.12, 0.0, d) * 0.24;
        float rand = smoothstep(0.6, 1.05, vW.x) * smoothstep(0.0, 0.55, rest);
        gl_FragColor = vec4(farbe, max(strich, schein) * rand * sicht);
      }` });
  const strich = new THREE.Mesh(strichGeo, strichMat); strich.renderOrder = 4; strich.frustumCulled = false; strich.visible = false; raum.add(strich);
  let strichStand = '';
  function strichLegen(dt) {
    strichU.zeit.value = STILL ? 0 : zeit;
    const n = naechste(), ziel = n == null ? V(0, 0, zEnde + 0.2) : stationen[n].start;
    const an = !pr && aktiv == null && modus !== 'station' && Math.hypot(ziel.x - F.x, ziel.z - F.z) > 1.15 && F.z > zEnde + 1.2 ? 1 : 0;
    strichU.sicht.value += (an - strichU.sicht.value) * Math.min(1, dt * (an ? 4 : 9));
    strich.visible = strichU.sicht.value > 0.01;
    if (!strich.visible || !an) return;   // beim Ausblenden bleibt die Linie, wie sie war
    const stand2 = n + ':' + F.x.toFixed(2) + ':' + F.z.toFixed(2);
    if (stand2 === strichStand) return;   // steht er, bleibt die Linie, wie sie ist
    strichStand = stand2;
    const r = ziel.z < F.z ? -1 : 1, punkte2 = [V(F.x, STRICH_Y, F.z)];
    if (Math.abs(ziel.z - F.z) > 3.4) punkte2.push(V(klemme(F.x, -0.6, 0.6), STRICH_Y, F.z + r * 1.3), V(klemme(ziel.x, -0.6, 0.6), STRICH_Y, ziel.z - r * 1.3));
    punkte2.push(V(ziel.x, STRICH_Y, ziel.z));
    const kurve = new THREE.CatmullRomCurve3(punkte2), L = kurve.getLength(), stuecke = Math.min(STRICH_N, Math.ceil(L / 0.2));
    kurve.arcLengthDivisions = stuecke * 2; kurve.updateArcLengths();
    const p = kurve.getSpacedPoints(stuecke);
    for (let i = 0; i <= stuecke; i++) {
      const q = p[Math.min(i + 1, stuecke)], o = p[Math.max(i - 1, 0)], tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l * STRICH_B, nz = tx / l * STRICH_B, m = L * i / stuecke, k = i * 6, w = i * 4;
      strichPos[k] = p[i].x + nx; strichPos[k + 1] = STRICH_Y; strichPos[k + 2] = p[i].z + nz;
      strichPos[k + 3] = p[i].x - nx; strichPos[k + 4] = STRICH_Y; strichPos[k + 5] = p[i].z - nz;
      strichWo[w] = m; strichWo[w + 1] = STRICH_B; strichWo[w + 2] = m; strichWo[w + 3] = -STRICH_B;
    }
    strichGeo.attributes.position.needsUpdate = true; strichGeo.attributes.wo.needsUpdate = true;
    strichGeo.setDrawRange(0, stuecke * 6);
    strichU.laenge.value = L;
  }

  /* ---------- Jedes Bild (die Ansicht ruft das direkt vor dem Zeichnen) ---------- */
  /* ---------- PR-Raum: Powerlifting-Stimmung (09.11.2026): schwarze Gummiplatten mit weißem Rand unter den Geräten und Scheibenstapel an den Wänden; das warme Licht kommt über die LED und die Lampen ---------- */
  if (pr) {
    const gummiT = tex(zeichne(512, 512, (x, b, h) => {
      x.fillStyle = '#0a0b0d'; x.fillRect(0, 0, b, h);
      for (let i = 0; i < 1400; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.02 + ((i * 37) % 7) * 0.006) + ')'; x.fillRect((i * 97) % b, (i * 53) % h, 2, 2); }
      x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 6; x.strokeRect(14, 14, b - 28, h - 28); x.strokeStyle = 'rgba(255,255,255,0.18)'; x.lineWidth = 3; x.strokeRect(40, 40, b - 80, h - 80);
    }));
    for (const s of stationen) { const g = new THREE.Group(); g.position.set(s.pos.x, 0.004, s.pos.z); g.rotation.y = s.winkel; g.add(flach(new THREE.PlaneGeometry(4.6, 4.6), grund(0xffffff, { map: gummiT }), 0, 0, 0)); raum.add(g); }
    const stapelOrte = [[BREITE / 2 - 1.3, zStation(0) + 2.9], [BREITE / 2 - 1.3, zStation(Math.min(1, N - 1)) + 2.9], [BREITE / 2 - 1.3, zStation(N - 1) + 2.9], [-BREITE / 2 + 1.3, zEnde + 4.5], [-BREITE / 2 + 1.3, zAnfang - 2.5]], SCHEIBEN = 6;
    const stapel = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.045, 24), grund(0xffffff), stapelOrte.length * SCHEIBEN), farbenS = [0xd62b2b, 0x2b63d6, 0xe6c52e, 0x2eb34d, 0xe9e9e9, 0x2b63d6], fc = new THREE.Color();
    stapelOrte.forEach(([x, z], i) => { for (let k = 0; k < SCHEIBEN; k++) { m4.compose(V(x + ((i * 7 + k * 3) % 5 - 2) * 0.006, 0.0225 + k * 0.047, z), qNull, V(1, 1, 1)); stapel.setMatrixAt(i * SCHEIBEN + k, m4); stapel.setColorAt(i * SCHEIBEN + k, fc.setHex(farbenS[(k + i) % farbenS.length])); } });
    stapel.instanceMatrix.needsUpdate = true; stapel.instanceColor.needsUpdate = true; stapel.frustumCulled = false; raum.add(stapel);
  }

  /* ---------- Lampen (09.11.2026, Devin: „geile Lampen, die schon leuchten, wenn es dunkler ist“): Hängeleuchten über dem Gang und über jeder Station; bei Nacht Lichtschein, Lichtkegel und Lichtfleck auf dem Boden ---------- */
  const lampenOrte = [];
  for (let z = zAnfang - FACH; z > zEnde + 3; z -= FACH) lampenOrte.push([0, z]);   // über dem Gang, zwischen den Querschienen
  for (const s of stationen) lampenOrte.push([s.pos.x, s.pos.z]);   // über jeder Station
  for (const g of deko) lampenOrte.push([g.position.x * 0.96, g.position.z]);   // über jedem Deko-Gerät
  const LAMPE_H = 1.5, LAMPE_Y = WAND - LAMPE_H, lampeFarbe = new THREE.Color(pr ? 0xff9a4a : P.led).lerp(new THREE.Color(0xfff1d6), 0.55), qFlach = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2);
  const lichtT = tex(zeichne(128, 128, (x, b, h) => { const g = x.createRadialGradient(b / 2, h / 2, 0, b / 2, h / 2, b / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, b, h); }));
  const lampeInnenM = grund(0xffffff, { side: THREE.DoubleSide, fog: false });
  const lampeSchnur = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), grund(0x0c0d10), lampenOrte.length);
  const lampeSchirm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 0.3, 20, 1, true), grund(P.rahmen, { side: THREE.DoubleSide }), lampenOrte.length);
  const lampeBirne = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 8), lampeInnenM, lampenOrte.length);
  const lampeFleckM = grund(lampeFarbe, { map: lichtT, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, fog: false });
  const lampeFleck = new THREE.InstancedMesh(new THREE.CircleGeometry(2.3, 32), lampeFleckM, lampenOrte.length);
  const lampeKegelU = { nacht: { value: 0 }, farbe: { value: new THREE.Color(lampeFarbe) }, hoehe: { value: LAMPE_Y } };
  const lampeKegel = new THREE.InstancedMesh(new THREE.ConeGeometry(1.45, LAMPE_Y, 24, 1, true), new THREE.ShaderMaterial({ uniforms: lampeKegelU, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying float vy; uniform float hoehe; void main(){ vy = position.y / hoehe + 0.5; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vy; uniform float nacht; uniform vec3 farbe; void main(){ gl_FragColor = vec4(farbe, pow(vy, 1.6) * 0.2 * nacht); }' }), lampenOrte.length);
  // Lichtschein um die Birne: ein Quadrat, das zur Kamera schaut (kein Punkt: Handys begrenzen die Punktgröße)
  const lampeGlowU = { karte: { value: lichtT }, farbe: { value: new THREE.Color(lampeFarbe) }, groesse: { value: 2.4 }, deckkraft: { value: 0 } };
  const lampeGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: lampeGlowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vU; uniform float groesse; void main(){ vU = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * groesse; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec2 vU; uniform sampler2D karte; uniform vec3 farbe; uniform float deckkraft; void main(){ gl_FragColor = vec4(farbe, texture2D(karte, vU).a * deckkraft); }' }), lampenOrte.length);
  lampeGlow.renderOrder = 3;
  lampenOrte.forEach(([x, z], i) => {
    m4.compose(V(x, WAND - LAMPE_H / 2, z), qNull, V(1, LAMPE_H, 1)); lampeSchnur.setMatrixAt(i, m4);
    m4.compose(V(x, LAMPE_Y, z), qNull, V(1, 1, 1)); lampeSchirm.setMatrixAt(i, m4);
    m4.compose(V(x, LAMPE_Y - 0.04, z), qNull, V(1, 1, 1)); lampeBirne.setMatrixAt(i, m4);
    m4.compose(V(x, 0.014, z), qFlach, V(1, 1, 1)); lampeFleck.setMatrixAt(i, m4);
    m4.compose(V(x, LAMPE_Y / 2, z), qNull, V(1, 1, 1)); lampeKegel.setMatrixAt(i, m4);
    m4.compose(V(x, LAMPE_Y - 0.12, z), qNull, V(1, 1, 1)); lampeGlow.setMatrixAt(i, m4);
  });
  lampeFleck.renderOrder = 1; lampeKegel.renderOrder = 2;
  for (const o of [lampeSchnur, lampeSchirm, lampeBirne, lampeFleck, lampeKegel, lampeGlow]) { o.instanceMatrix.needsUpdate = true; o.frustumCulled = false; raum.add(o); }

  /* ---------- Live-Gym: Ausbau nach Devins Vorlage (10.11.2026): LED-Linien an Decke und Wänden statt Hängelampen, leuchtendes DK an der Rückwand, Leuchtschrift mit Lounge,
     Theke, Kübelpflanzen, Kurzhantel-Ablage, großes DK im Boden. Alles eigene Formen, keine fremden Marken; Sprüche sind allgemeine Sätze ---------- */
  if (LIVE) {
    for (const o of [lampeSchnur, lampeSchirm, lampeBirne, lampeFleck, lampeKegel, lampeGlow]) o.visible = false;
    const neonM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf6d6a0), toneMapped: false, fog: false }), linien = [], YD = WAND - 0.04;
    const strich = (x0, y0, z0, x1, y1, z1, d) => linien.push([V(x0, y0, z0), V(x1, y1, z1), d || 0.05]);
    for (let z = zAnfang - FACH / 2; z - FACH > zEnde; z -= FACH) {   // Decke: je Feld ein Rahmen über dem Gang, von den Ecken Linien zu den Schienen (wie Kassetten)
      const z0 = z - 0.8, z1 = z - FACH + 0.8, xr = 2.3;
      strich(-xr, YD, z0, xr, YD, z0); strich(-xr, YD, z1, xr, YD, z1); strich(-xr, YD, z0, -xr, YD, z1); strich(xr, YD, z0, xr, YD, z1);
      for (const sx of [-1, 1]) { strich(sx * xr, YD, z0, sx * SCHIENEN_X[1], YD, z); strich(sx * xr, YD, z1, sx * SCHIENEN_X[1], YD, z - FACH); }
    }
    for (const sx of [-1, 1]) strich(sx * (BREITE / 2 - 0.4), YD - 0.03, zAnfang - 0.6, sx * (BREITE / 2 - 0.4), YD - 0.03, zEnde + 0.6, 0.06);   // Lichtbänder an den Längsseiten
    const belegt = [[halle.spiegel.z, halle.spiegel.laenge / 2 + 0.6], [WAAGE_Z, 1.6], [LOUNGE_Z, 3.2]];   // linke Wand: hier hängen schon Spiegel, Tafeln, Poster, Leuchtschrift
    for (let z = halle.spiegel.z - halle.spiegel.laenge / 2 - 3.2; z > zEnde + 3; z -= FACH) belegt.push([z, 1.6]);
    const xl = -BREITE / 2 + WAND_D / 2 + 0.04;
    for (let z = zAnfang - 1.2; z > zEnde + 1; z -= 1.55) if (!belegt.some(([m, r]) => Math.abs(z - m) < r)) strich(xl, 0.25, z, xl, WAND - 0.3, z, 0.05);   // senkrechte Lichtstreifen links
    for (const sx of [-1, 1]) for (const x of [TUER_B / 2 + 0.45]) strich(sx * x, 0.2, zEnde + WAND_D / 2 + 0.04, sx * x, WAND - 0.25, zEnde + WAND_D / 2 + 0.04, 0.06);   // Rückwand
    const neon = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), neonM, linien.length), q = new THREE.Quaternion(), vz = V(0, 0, 1);
    linien.forEach(([p0, p1, d], i) => { const r = p1.clone().sub(p0), l = r.length(); q.setFromUnitVectors(vz, r.normalize()); m4.compose(p0.clone().add(p1).multiplyScalar(0.5), q, V(d, d * 0.7, l)); neon.setMatrixAt(i, m4); });
    neon.instanceMatrix.needsUpdate = true; neon.frustumCulled = false; raum.add(neon);
    // Leuchtendes DK (Rückwand links), Spruch-Tafel mit Krone (Rückwand rechts), Leuchtschrift über der Lounge (linke Wand)
    const leucht = (b, h, malen) => tex(zeichne(b, h, (x) => { x.shadowColor = 'rgba(255,196,110,0.95)'; malen(x, b, h); }));
    const dkLeuchtT = leucht(1024, 512, (x, b, h) => {
      x.fillStyle = '#060607'; x.fillRect(0, 0, b, h);
      for (const blur of [60, 26, 8]) { x.shadowBlur = blur; dkZeichen(x, b / 2, h / 2, 330, '#FFE9B8', '#F2C46E'); }
      x.shadowBlur = 0; dkZeichen(x, b / 2, h / 2, 330, '#FFF8E6', '#FFE0A0');
    });
    const spruchT = leucht(512, 512, (x, b, h) => {
      x.fillStyle = '#0B0B0D'; x.fillRect(0, 0, b, h); x.strokeStyle = 'rgba(232,196,104,.8)'; x.lineWidth = 6; x.strokeRect(14, 14, b - 28, h - 28);
      x.fillStyle = '#E8C468'; x.beginPath(); x.moveTo(196, 118); x.lineTo(214, 72); x.lineTo(236, 104); x.lineTo(256, 58); x.lineTo(276, 104); x.lineTo(298, 72); x.lineTo(316, 118); x.closePath(); x.fill();   // Krone
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#F5F1E7'; x.shadowBlur = 14;
      ['TRAIN', 'EAT', 'SLEEP', 'REPEAT'].forEach((w, i) => { x.font = '800 ' + (i === 3 ? 66 : 70) + 'px ' + SCHRIFT; x.fillText(w, b / 2, 180 + i * 78); });
    });
    const schriftT = leucht(1024, 512, (x, b, h) => {
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.save(); x.translate(b / 2, h / 2); x.rotate(-0.07);
      ['DISCIPLINE', 'BUILDS', 'FREEDOM'].forEach((w, i) => {
        x.font = '700 118px ' + SCHRIFT; const y = (i - 1) * 140;
        for (const blur of [40, 16]) { x.shadowBlur = blur; x.fillStyle = '#FFC978'; x.fillText(w, 0, y); }
        x.shadowBlur = 4; x.fillStyle = '#FFF4DC'; x.fillText(w, 0, y);
      });
      x.restore();
    });
    tafel(dkLeuchtT, 4.6, 2.3, -5.7, 2.4, zEnde + WAND_D / 2 + 0.05, 0, wandHinten);
    tafel(tex(zeichne(64, 32, (x, b, h) => { x.fillStyle = '#060607'; x.fillRect(0, 0, b, h); })), 4.6, 2.3, 5.7, 2.4, zEnde + WAND_D / 2 + 0.04, 0, wandHinten);   // dunkle Fläche über der alten Tafel
    tafel(spruchT, 2.2, 2.2, 5.7, 2.4, zEnde + WAND_D / 2 + 0.06, 0, wandHinten);
    tafel(schriftT, 5.6, 2.8, xl + 0.02, 2.75, LOUNGE_Z, Math.PI / 2, wandL);
    // Möbel und Pflanzen: echte Lichtrechnung, damit sie im LED-Licht Form haben
    const leder = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.55, metalness: 0.05 }), schwarz = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.35, metalness: 0.4 });
    const goldM = new THREE.MeshStandardMaterial({ color: 0xd9b25c, roughness: 0.3, metalness: 1 }), chrom = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.2, metalness: 1 });
    const block = (g, b, h, t, x, y, z, m) => { const k = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), m); k.position.set(x, y, z); g.add(k); return k; };
    { // Lounge: Sofa, Tisch, warmes Licht am Boden
      const g = new THREE.Group(); g.position.set(-BREITE / 2 + 1.0, 0, LOUNGE_Z); g.rotation.y = Math.PI / 2; raum.add(g);
      block(g, 3.4, 0.42, 0.95, 0, 0.21, 0, leder); block(g, 3.4, 0.55, 0.24, 0, 0.62, -0.36, leder); block(g, 0.24, 0.62, 0.95, -1.58, 0.31, 0, leder); block(g, 0.24, 0.62, 0.95, 1.58, 0.31, 0, leder);
      for (const sx of [-0.8, 0.8]) block(g, 1.5, 0.14, 0.7, sx, 0.49, 0.06, leder);
      block(g, 1.3, 0.34, 0.65, 0, 0.17, 1.25, schwarz); block(g, 1.32, 0.02, 0.67, 0, 0.345, 1.25, goldM);
      block(g, 3.6, 0.03, 0.06, 0, 0.02, 0.5, neonM);
      hindernisse.push({ box: [-BREITE / 2, -BREITE / 2 + 2.4, LOUNGE_Z - 1.85, LOUNGE_Z + 1.85] });
    }
    { // Theke unter dem leuchtenden DK
      const g = new THREE.Group(); g.position.set(-5.7, 0, zEnde + 1.3); raum.add(g);
      hindernisse.push({ box: [-7.65, -3.75, zEnde + 0.85, zEnde + 1.75] });
      block(g, 3.8, 1.05, 0.8, 0, 0.525, 0, schwarz); block(g, 3.9, 0.05, 0.9, 0, 1.075, 0, goldM); block(g, 3.8, 0.04, 0.04, 0, 0.98, 0.42, neonM); block(g, 3.8, 0.04, 0.04, 0, 0.06, 0.42, neonM);
    }
    // Kübelpflanzen: ein Topf, viele Blätter in einer Form (wenige Zeichenaufrufe), überall dieselbe Pflanze, etwas gedreht
    const blattT = tex(zeichne(128, 256, (x, b, h) => {
      const g = x.createLinearGradient(0, 0, b, 0); g.addColorStop(0, '#1d5a2e'); g.addColorStop(0.5, '#3f8f45'); g.addColorStop(1, '#1d5a2e'); x.fillStyle = g;
      x.beginPath(); x.moveTo(b / 2, h); x.bezierCurveTo(0, h * 0.7, 0, h * 0.25, b / 2, 0); x.bezierCurveTo(b, h * 0.25, b, h * 0.7, b / 2, h); x.fill();
      x.strokeStyle = 'rgba(200,230,170,.5)'; x.lineWidth = 3; x.beginPath(); x.moveTo(b / 2, h); x.lineTo(b / 2, 8); x.stroke();
    }));
    const blattGeo = (() => {
      const teile = [];
      for (let i = 0; i < 22; i++) {
        const w = i / 22 * Math.PI * 2 + ruheL(i, 21) * 0.4, kipp = 0.35 + ruheL(i, 22) * 0.7, l = 0.75 + ruheL(i, 23) * 0.55, pg = new THREE.PlaneGeometry(0.28, l, 1, 4);
        const pp = pg.attributes.position; for (let k = 0; k < pp.count; k++) { const y = pp.getY(k) + l / 2; pp.setY(k, y); pp.setZ(k, -0.18 * (y / l) * (y / l)); }   // gebogen
        pg.rotateX(-kipp); pg.rotateY(w); pg.translate(0, 0.72, 0); teile.push(pg);
      }
      const n = teile.reduce((s, g) => s + g.attributes.position.count, 0), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = []; let o = 0;
      for (const g of teile) { pos.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + o); o += g.attributes.position.count; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
    })();
    const blattM = new THREE.MeshStandardMaterial({ map: blattT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }), topfGeo = new THREE.CylinderGeometry(0.34, 0.27, 0.72, 24), randGeo = new THREE.TorusGeometry(0.34, 0.018, 6, 32);
    const pflanze = (x, z, w) => { hindernisse.push({ x, z, r: 0.45 }); const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = w; const t = new THREE.Mesh(topfGeo, schwarz); t.position.y = 0.36; const r = new THREE.Mesh(randGeo, goldM); r.rotation.x = Math.PI / 2; r.position.y = 0.72; g.add(t, r, new THREE.Mesh(blattGeo, blattM)); raum.add(g); };
    for (let z = zAnfang - 1.4; z > zEnde + 1; z -= FACH) pflanze(BREITE / 2 - 0.75, z, z);   // an der Glasfront
    for (const dz of [-2.4, 2.4]) pflanze(-BREITE / 2 + 0.75, LOUNGE_Z + dz, dz);   // neben der Lounge
    for (const sx of [-1, 1]) pflanze(sx * (BREITE / 2 - 0.8), zEnde + 0.9, sx);   // Ecken der Rückwand
    { // Kurzhantel-Ablage rechts vorn (an der Glasfront), zwei Reihen
      const g = new THREE.Group(); g.position.set(BREITE / 2 - 1.5, 0, zAnfang - 8.5); raum.add(g); hindernisse.push({ box: [BREITE / 2 - 1.85, BREITE / 2 - 1.1, zAnfang - 10.8, zAnfang - 6.2] });
      const L = 4.4; for (const sz of [-1, 1]) { block(g, 0.06, 0.78, 0.06, 0.32, 0.39, sz * L / 2, schwarz); block(g, 0.06, 0.78, 0.06, -0.32, 0.39, sz * L / 2, schwarz); }
      block(g, 0.5, 0.05, L, 0.22, 0.52, 0, schwarz); block(g, 0.5, 0.05, L, -0.18, 0.78, 0, schwarz);
      const paare = 9, kopf = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6 }), paare * 2 * 2), griff = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), chrom, paare * 2);
      const qz = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI / 2); let ki = 0, gi = 0;
      for (const [ry, rx] of [[0.55, 0.22], [0.81, -0.18]]) for (let i = 0; i < paare; i++) {
        const r = 0.055 + i * 0.006, zz = -L / 2 + 0.3 + i * (L - 0.6) / (paare - 1), b = 0.3;
        m4.compose(V(rx, ry + r, zz), qz, V(1, b, 1)); griff.setMatrixAt(gi++, m4);
        for (const sx of [-1, 1]) { m4.compose(V(rx + sx * (b / 2 - 0.03), ry + r, zz), qz, V(r, 0.07, r)); kopf.setMatrixAt(ki++, m4); }
      }
      kopf.count = ki; griff.count = gi; kopf.instanceMatrix.needsUpdate = true; griff.instanceMatrix.needsUpdate = true; g.add(kopf, griff);
    }
    // Draußen: zwei Sportwagen auf der Terrasse vor der Glasfront (eigene Form, ohne Marke), Jachten und Segelboote auf dem Meer
    const lack = (farbe) => new THREE.MeshStandardMaterial({ color: farbe, metalness: 0.55, roughness: 0.22, envMap: (a.geraete.mMetall && a.geraete.mMetall.envMap) || null, envMapIntensity: 1.1 });
    const scheibeM = new THREE.MeshStandardMaterial({ color: 0x0a0d12, metalness: 0.6, roughness: 0.08 }), reifenM = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.8 }), felgeM = chrom;
    const profil = (pts, tiefe, m, fase) => { const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))); const g = new THREE.ExtrudeGeometry(sh, { depth: tiefe, bevelEnabled: true, bevelThickness: fase, bevelSize: fase, bevelSegments: 3, curveSegments: 6 }); g.translate(0, 0, -tiefe / 2); return new THREE.Mesh(g, m); };
    const auto = (farbe, x, z, w) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = w; raum.add(g);
      g.add(profil([[-2.2, 0.32], [2.25, 0.32], [2.3, 0.52], [2.05, 0.66], [1.05, 0.82], [-1.0, 0.9], [-2.0, 0.86], [-2.25, 0.62]], 1.76, lack(farbe), 0.08));
      g.add(profil([[-1.05, 0.86], [1.0, 0.8], [0.4, 1.16], [-0.35, 1.18]], 1.5, scheibeM, 0.06));
      for (const [px, pz] of [[1.42, 0.86], [1.42, -0.86], [-1.4, 0.86], [-1.4, -0.86]]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 24), reifenM); r.rotation.x = Math.PI / 2; r.position.set(px, 0.34, pz); g.add(r);
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 12), felgeM); fl.rotation.x = Math.PI / 2; fl.position.set(px, 0.34, pz); g.add(fl);
      }
      for (const sz of [-0.62, 0.62]) { block(g, 0.05, 0.07, 0.36, 2.34, 0.6, sz, grund(0xfff4dc)); block(g, 0.05, 0.06, 0.42, -2.31, 0.66, sz, grund(0xff2a1a)); }
    };
    auto(0xb0141c, BREITE / 2 + 3.1, zAnfang - 4.5, Math.PI / 2 + 0.35); auto(0xf2b51a, BREITE / 2 + 3.2, zAnfang - 10.5, Math.PI / 2 + 0.35);
    const weissM = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.45 }), fensterM = grund(0x15181d), segelM = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.8, side: THREE.DoubleSide });
    const fensterLicht = grund(0xffd28a); boote.length = 0;
    const jacht = (x, z, w, gr) => {
      const g = new THREE.Group(); g.position.set(x, -0.45, z); g.rotation.y = w; g.scale.setScalar(gr); raum.add(g); boote.push(g);
      g.add(profil([[-6, 0.0], [5.5, 0.0], [7.4, 1.4], [-6.2, 1.4]], 3.4, weissM, 0.15));
      block(g, 7.5, 1.1, 2.8, -0.8, 1.95, 0, weissM); block(g, 7.6, 0.38, 2.86, -0.8, 1.95, 0, fensterM); block(g, 4.2, 0.9, 2.3, -1.4, 2.95, 0, weissM); block(g, 4.3, 0.3, 2.36, -1.4, 2.95, 0, fensterM);
      block(g, 7.6, 0.08, 2.88, -0.8, 1.95, 0, fensterLicht);
    };
    const segler = (x, z, w, gr) => {
      const g = new THREE.Group(); g.position.set(x, -0.45, z); g.rotation.y = w; g.scale.setScalar(gr); raum.add(g); boote.push(g);
      g.add(profil([[-3.5, 0.1], [3.2, 0.1], [4.2, 0.9], [-3.6, 0.9]], 1.9, weissM, 0.1));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 10, 8), weissM); mast.position.set(0.4, 5.9, 0); g.add(mast);
      const gross = new THREE.Shape([new THREE.Vector2(0.45, 1.3), new THREE.Vector2(0.45, 10.4), new THREE.Vector2(-3.0, 1.3)]), vor = new THREE.Shape([new THREE.Vector2(0.35, 9.8), new THREE.Vector2(3.9, 1.1), new THREE.Vector2(0.35, 1.2)]);
      for (const sh of [gross, vor]) g.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), segelM));
    };
    jacht(BREITE / 2 + 48, zMitte + 6, 0.25, 1); jacht(BREITE / 2 + 95, zMitte - 30, -0.4, 1.3); segler(BREITE / 2 + 34, zMitte - 12, 0.9, 1); segler(BREITE / 2 + 70, zMitte + 26, -0.2, 1.2); segler(-6, zEnde - 70, 0.4, 1.1);
    { // großes DK im Boden (eingelegt, golden), im Gang zwischen den ersten Geräten
      const t = tex(zeichne(512, 512, (x, b, h) => { x.globalAlpha = 0.55; dkZeichen(x, b / 2, h / 2, 330, '#E9C77A', '#B8893A'); }));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), grund(0xffffff, { map: t, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.012, zStation(0) - FACH / 2); m.renderOrder = 1; raum.add(m);
    }
  }

  /* ---------- Tag und Nacht: Zustand, Anwendung auf Himmel, Meer, Palmen, Terrassen, Glas, Lampen und Figurenlicht, dazu der Schalter oben rechts ---------- */
  const ZV = {}; for (const k of ['himmelOben', 'himmelHorizont', 'sonne', 'meerNah', 'meerFern', 'schaum', 'glitzer']) ZV[k] = [rgb(TAGP[k]), rgb(NACHTP[k])];
  const lerpV = (v, k, z) => v.lerpVectors(ZV[k][0], ZV[k][1], z);
  const farbeTag = (k) => [new THREE.Color(TAGP[k]), new THREE.Color(NACHTP[k])], glasTonZ = farbeTag('glasTon'), nebelZ = farbeTag('himmelHorizont');
  const ledBasis = new THREE.Color(pr ? 0xff7a3d : P.led), tonWeiss = new THREE.Color(0xffffff), tonPalme = new THREE.Color(GOLD ? '#2D2650' : '#34456E'), tonHolz = new THREE.Color(GOLD ? '#3A3050' : '#3E4864');
  const lichtBasis = lichter.map((l) => l.intensity), sonneH = himmelU.sonneRicht.value, mondH = himmelU.mondRicht.value, lichtH = V();
  let zn = zeitNacht ? 1 : 0, znZiel = zn;
  function zeitSetzen(z) {
    lerpV(himmelU.oben.value, 'himmelOben', z); lerpV(himmelU.horizont.value, 'himmelHorizont', z); lerpV(himmelU.sonne.value, 'sonne', z); himmelU.nacht.value = z;
    lerpV(meerU.nah.value, 'meerNah', z); lerpV(meerU.fern.value, 'meerFern', z); lerpV(meerU.schaum.value, 'schaum', z); lerpV(meerU.glitzer.value, 'glitzer', z); meerU.nebel.value.copy(himmelU.horizont.value);
    meerU.lichtC.value.copy(himmelU.sonne.value).multiplyScalar((TAGP.lichtStark || 1) * (1 - z) + (NACHTP.lichtStark || 0.8) * z);
    szene.fog.color.copy(nebelZ[0]).lerp(nebelZ[1], z); glasM.color.copy(glasTonZ[0]).lerp(glasTonZ[1], z);
    palmen.material.color.copy(tonWeiss).lerp(tonPalme, z); for (const m of holzMats) m.color.copy(tonWeiss).lerp(tonHolz, z);
    if (LIVE) deckeM.opacity = 0.18 + 0.8 * z;
    ledM.color.copy(ledBasis).multiplyScalar((LIVE ? 0.6 : 1) * (0.55 + 0.45 * z)); scheinM.opacity = P.haloStark * (0.45 + 0.55 * z); scheinML.opacity = scheinM.opacity;
    lampeKegelU.nacht.value = z; lampeGlowU.deckkraft.value = 0.95 * z; lampeFleckM.opacity = 0.38 * z; lampeInnenM.color.copy(lampeFarbe).multiplyScalar(0.4 + 0.6 * z);
    lichter.forEach((l, i) => { l.intensity = lichtBasis[i] * (1 - 0.3 * (z - (nativNacht ? 1 : 0))); });   // bei Nacht etwas weniger Licht auf der Figur (in Schwarz-Gold ist es schon abgestimmt)
  }
  function zeitTick(dt) {   // Übergang Tag und Nacht in 1,4 s; jedes Bild: Richtung von Sonne oder Mond im Blickraum für die Spiegelung im Meer
    if (zn !== znZiel) { const sch = STILL ? 1 : dt / 1.4; zn += Math.max(-sch, Math.min(sch, znZiel - zn)); zeitSetzen(zn); }
    lichtH.lerpVectors(sonneH, mondH, zn).normalize();
    meerU.lichtV.value.copy(lichtH).transformDirection(raum.matrixWorld).transformDirection(a.kamera.matrixWorldInverse);
  }
  const zeitKnopf = el('button', 'raum-zeit'); zeitKnopf.type = 'button';
  const zeitZeichen = () => { zeitKnopf.textContent = znZiel > 0.5 ? '☾︎' : '☀︎'; zeitKnopf.setAttribute('aria-label', znZiel > 0.5 ? 'Es ist Nacht. Auf Tag umschalten' : 'Es ist Tag. Auf Nacht umschalten'); };
  zeitKnopf.addEventListener('click', () => {
    znZiel = znZiel > 0.5 ? 0 : 1; if (STILL) { zn = znZiel; zeitSetzen(zn); }
    try { localStorage.setItem('dk_gym_zeit', znZiel > 0.5 ? 'nacht' : 'tag'); } catch (e) {}
    zeitZeichen(); pop(znZiel > 0.5 ? 'Nacht' : 'Tag', znZiel > 0.5 ? 'Mond und Lampen an' : 'Sonne und Meer');
  });
  if (pr) { scheinM.color.set(0xff8a4a); scheinML.color.set(0xff8a4a); }   // PR-Raum: warmes Licht
  zeitSetzen(zn); zeitZeichen(); wurzel.append(zeitKnopf);

  /* ---------- Live-Gym: Anzeige wie im Spiel (10.11.2026, nach Devins Vorlage): Plan oben links (nur der echte Plan des Tages), DK-Schild oben rechts, runde Karte unten links,
     am PC die Tasten unten rechts; am Handy stehen unten die zwei Knüppel und die Karte sitzt kleiner oben rechts ---------- */
  if (LIVE) {
    wurzel.classList.add('live');
    const plan = el('section', 'live-plan'), pk = el('button', 'live-plan-kopf'); pk.type = 'button'; pk.setAttribute('aria-expanded', 'true');
    { const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), pfad = document.createElementNS(NS, 'path');   // Hantel-Zeichen, Punkt für Punkt gebaut (kein HTML aus Text, so will es die Sicherheitsprüfung)
      svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('aria-hidden', 'true');
      for (const [k, v] of [['d', 'M4 12v8M8.5 9v14M23.5 9v14M28 12v8M8.5 16h15'], ['stroke', 'currentColor'], ['stroke-width', '2.8'], ['stroke-linecap', 'round'], ['fill', 'none']]) pfad.setAttribute(k, v);
      svg.append(pfad); pk.append(svg); }
    const pkT = el('span', 'live-plan-titel'); pkT.append(el('b', null, 'Dein Trainingsplan'), el('small', null, titel || 'Training'));
    pk.append(pkT, el('i', 'live-plan-pfeil', '›'));
    const liste = el('ol', 'live-plan-liste');
    const zeilen = stationen.map((s) => { const li = el('li'); li.append(el('i', 'live-haken'), el('span', null, s.u.name), el('em', null, s.u.dosis || '')); liste.append(li); return li; });
    plan.append(pk, liste); wurzel.append(plan);
    livePlan = {
      umschalten() { plan.classList.toggle('zu'); pk.setAttribute('aria-expanded', String(!plan.classList.contains('zu'))); },
      auffrischen() { const n = naechste(); zeilen.forEach((li, i) => { li.className = stationen[i].fertig ? 'fertig' : i === n ? 'jetzt' : ''; }); }
    };
    pk.addEventListener('click', () => livePlan.umschalten());
    livePlan.auffrischen();
    const schildL = el('div', 'live-schild'); schildL.setAttribute('aria-hidden', 'true');
    schildL.append(zeichne(240, 120, (x, b) => { dkZeichen(x, b / 2, 44, 64, ST.logoA, ST.logoB); x.fillStyle = '#F5F1E7'; x.font = '600 21px ' + SCHRIFT; x.textAlign = 'center'; x.fillText('C O A C H', b / 2, 104); }));
    wurzel.append(schildL);
    const tastenL = el('div', 'live-tasten'); tastenL.setAttribute('aria-hidden', 'true');
    for (const [k, t] of [['WASD', 'Laufen'], ['Shift', 'Rennen'], ['Maus', 'Umsehen'], ['E', 'Interagieren'], ['TAB', 'Plan']]) { const z = el('span'); z.append(el('kbd', null, k), t); tastenL.append(z); }
    wurzel.append(tastenL);
    // Runde Karte: Halle, Geräte, Waage, Weg zum nächsten Gerät; dreht mit der Kamera (vorn ist oben), N zeigt zur Rückwand der Halle
    const kc = el('canvas', 'live-karte'); kc.setAttribute('aria-hidden', 'true'); wurzel.append(kc);
    const kx = kc.getContext('2d'); let kUhr = 0;
    liveKarte = (dt) => {
      kUhr -= dt; if (kUhr > 0) return; kUhr = 1 / 15;
      const d = Math.min(2, window.devicePixelRatio || 1), cw = Math.round(kc.clientWidth * d); if (!cw) return;
      if (kc.width !== cw) { kc.width = cw; kc.height = cw; }
      const R = cw / 2, m = R / 15, co = Math.cos(kamW), si = Math.sin(kamW);
      const S = (x, z) => [R + (co * (x - F.x) - si * (z - F.z)) * m, R + (si * (x - F.x) + co * (z - F.z)) * m];
      kx.setTransform(1, 0, 0, 1, 0, 0); kx.clearRect(0, 0, cw, cw);
      kx.save(); kx.beginPath(); kx.arc(R, R, R - 1, 0, Math.PI * 2); kx.clip();
      kx.fillStyle = 'rgba(12,12,15,0.82)'; kx.fillRect(0, 0, cw, cw);
      const ecke = (pts, fuell, linie, lb) => { kx.beginPath(); pts.forEach(([x, z], i) => { const [u, v] = S(x, z); if (i) kx.lineTo(u, v); else kx.moveTo(u, v); }); kx.closePath(); if (fuell) { kx.fillStyle = fuell; kx.fill(); } if (linie) { kx.strokeStyle = linie; kx.lineWidth = lb * d; kx.stroke(); } };
      const hb = BREITE / 2; ecke([[-hb, zAnfang], [hb, zAnfang], [hb, zEnde], [-hb, zEnde]], 'rgba(40,40,46,0.9)', 'rgba(232,196,104,0.55)', 1.4);
      { const [u0, v0] = S(hb, zAnfang), [u1, v1] = S(hb, zEnde); kx.strokeStyle = 'rgba(120,170,230,0.8)'; kx.lineWidth = 2.4 * d; kx.beginPath(); kx.moveTo(u0, v0); kx.lineTo(u1, v1); kx.stroke(); }   // Glasfront
      const n = naechste(), ziel = n == null ? V(0, 0, zEnde + 0.2) : stationen[n].start;
      { const [u0, v0] = S(F.x, F.z), [u1, v1] = S(ziel.x, ziel.z); kx.setLineDash([3 * d, 3 * d]); kx.strokeStyle = 'rgba(247,222,147,0.9)'; kx.lineWidth = 1.6 * d; kx.beginPath(); kx.moveTo(u0, v0); kx.lineTo(u1, v1); kx.stroke(); kx.setLineDash([]); }
      for (const s of stationen) { const [u, v] = S(s.pos.x, s.pos.z); kx.fillStyle = s.fertig ? 'rgba(150,140,120,0.7)' : s.i === n ? '#F7DE93' : 'rgba(230,226,215,0.85)'; kx.fillRect(u - 3.2 * d, v - 3.2 * d, 6.4 * d, 6.4 * d); }
      if (waage) { const [u, v] = S(waage.pos.x, waage.pos.z); kx.strokeStyle = 'rgba(247,222,147,0.8)'; kx.lineWidth = 1.4 * d; kx.beginPath(); kx.arc(u, v, 3.4 * d, 0, Math.PI * 2); kx.stroke(); }
      kx.restore();
      kx.strokeStyle = 'rgba(232,196,104,0.6)'; kx.lineWidth = 1.5 * d; kx.beginPath(); kx.arc(R, R, R - 1.5 * d, 0, Math.PI * 2); kx.stroke();
      kx.fillStyle = '#F5F1E7'; kx.font = '700 ' + Math.round(10 * d) + 'px ' + SCHRIFT; kx.textAlign = 'center'; kx.textBaseline = 'middle'; kx.fillText('N', R + si * (R - 11 * d), R - co * (R - 11 * d));
      kx.save(); kx.translate(R, R); kx.rotate(kamW - H + Math.PI); kx.fillStyle = '#FFFFFF'; kx.beginPath(); kx.moveTo(0, -7 * d); kx.lineTo(5 * d, 6 * d); kx.lineTo(0, 3 * d); kx.lineTo(-5 * d, 6 * d); kx.closePath(); kx.fill(); kx.restore();
    };
    tipp.textContent = matchMedia('(pointer: coarse)').matches ? 'Linker Knüppel: laufen · rechter Knüppel: umsehen' : 'WASD: laufen · Maus ziehen: umsehen · E: am Gerät trainieren';
  }

  /* ---------- Live-Gym: Qualität (Ziel 60 Bilder pro Sekunde, so scharf wie das Gerät schafft). Start am PC Stufe 4, am Handy Stufe 3; fällt der Schnitt über 1,5 s unter etwa 53 Bilder,
     geht es eine Stufe runter (erst Schärfe, dann Bodenspiegel, zuletzt der Schein). Hoch geht es nicht von selbst: Bei 60 Hz sieht man Reserven nicht an den Bildabständen. ---------- */
  const leuchten = LIVE ? leuchtenBauen(THREE) : null, DPR = window.devicePixelRatio || 1, FEIN = matchMedia('(pointer: fine)').matches;
  const QS = [{ pr: 1, boden: 0, schein: false }, { pr: 1.25, boden: 0, schein: true }, { pr: 1.5, boden: 0.3, schein: true }, { pr: 2, boden: 0.4, schein: true }, { pr: 2.5, boden: 0.5, schein: true }, { pr: 3, boden: 0.5, schein: true }];
  let qStufe = FEIN ? 4 : 3, qSumme = 0, qN = 0, qFest = false;
  const qAnwenden = () => {
    const q = QS[qStufe]; a.renderer.setPixelRatio(Math.max(0.75, Math.min(q.pr, FEIN ? Math.max(DPR, 1.25) : DPR))); a.groesse();
    if (bodenSp) { bodenOpt.skala = q.boden; bodenSp.mesh.material.uniforms.an.value = q.boden > 0 ? 1 : 0; }
    if (leuchten) leuchten.an = q.schein;
  };
  const qMessen = (dt) => {
    if (!(dt > 0.002 && dt < 0.25) || document.hidden || qFest) return;
    qSumme += dt; qN++; if (qSumme < 1.5) return;
    const mittel = qSumme / qN * 1000; qSumme = 0; qN = 0;
    if (mittel > 18.8 && qStufe > 0) { qStufe--; qAnwenden(); }
  };
  if (LIVE) { qAnwenden(); a.beiBild = () => leuchten.zeichne(a.renderer); }

  a.kameraFolgt = (dt) => {
    zeit += dt;
    if (liveKarte) liveKarte(dt);
    if (!STILL) boote.forEach((g, i) => { g.position.y = -0.45 + Math.sin(zeit * 0.7 + i * 1.7) * 0.07; g.rotation.z = Math.sin(zeit * 0.55 + i) * 0.025; g.rotation.x = Math.sin(zeit * 0.43 + i * 2.1) * 0.02; });
    if (LIVE) { qMessen(dt); leuchten.stark = 0.45 + 0.27 * zn; leuchten.schwelle = 0.93 - 0.21 * zn; }   // nachts mehr Schein, am Abend weniger (der helle Himmel soll nicht verschwimmen)
    // Figur: läuft oder steht (an der Station übernimmt die Ansicht)
    if (aktiv == null) {
      let bewegt = 0;
      if (warte > 0) { warte -= dt; if (warte <= 0 && nachWarte) { const f = nachWarte; nachWarte = null; f(); } }
      else if (nachWarte) { const f = nachWarte; nachWarte = null; f(); }
      if (aktiv == null) {
        if (gang) {
          let rest = (STILL ? 1000 : gang.tempo || TEMPO) * dt;
          while (rest > 0 && gang) {
            const z = gang.punkte[gang.i], dx = z.x - F.x, dz = z.z - F.z, l = Math.hypot(dx, dz);
            if (l <= rest) {
              F.x = z.x; F.z = z.z; rest -= l; gang.i++;
              if (gang.i >= gang.punkte.length) { const dann = gang.dann; gang = null; if (dann) dann(); }
            } else { F.x += dx / l * rest; F.z += dz / l * rest; zielH = Math.atan2(dx, dz); rest = 0; }
          }
          bewegt = gang ? (gang.tempo || TEMPO) / TEMPO : 1;
        } else if (modus === 'gehen' && (gehX || gehY)) {
          const sin = Math.sin(kamW), cos = Math.cos(kamW), dx = gehX * cos + gehY * sin, dz = -gehX * sin + gehY * cos, st = Math.hypot(gehX, gehY);
          const tempo = TEMPO * (LIVE && sprint ? 1.75 : 1);
          F.x += dx * tempo * dt; F.z += dz * tempo * dt; zielH = Math.atan2(dx, dz); bewegt = st * tempo / TEMPO;
          for (const h of hindernisse) {   // Live-Gym: nicht durch Möbel, Statuen, Pflanzen und Deko-Geräte laufen, sondern daran entlang
            if (h.box) { const r = 0.35, x0 = h.box[0] - r, x1 = h.box[1] + r, z0 = h.box[2] - r, z1 = h.box[3] + r; if (F.x > x0 && F.x < x1 && F.z > z0 && F.z < z1) { const w = [F.x - x0, x1 - F.x, F.z - z0, z1 - F.z], m = Math.min(...w); if (m === w[0]) F.x = x0; else if (m === w[1]) F.x = x1; else if (m === w[2]) F.z = z0; else F.z = z1; } }
            else { const ex = F.x - h.x, ez = F.z - h.z, l = Math.hypot(ex, ez), r = h.r + 0.35; if (l < r && l > 0.001) { F.x = h.x + ex / l * r; F.z = h.z + ez / l * r; } }
          }
          for (const s of stationen) { const ex = F.x - s.pos.x, ez = F.z - s.pos.z, l = Math.hypot(ex, ez); if (l < 1.3 && l > 0.001) { F.x = s.pos.x + ex / l * 1.3; F.z = s.pos.z + ez / l * 1.3; } }
          F.x = klemme(F.x, -BREITE / 2 + FIGUR_RAND, BREITE / 2 - FIGUR_RAND); F.z = klemme(F.z, zEnde + FIGUR_RAND, zAnfang - FIGUR_RAND);
        }
      }
      if (aktiv == null) {
        H += winkelDiff(H, zielH) * Math.min(1, dt * 11);
        schrittL += ((bewegt ? SCHRITT * Math.max(0.55, bewegt) : 0) - schrittL) * Math.min(1, dt * 9);
        const posi = V(0, 0, 0);
        const lauft = schrittL > 0.012;
        if (lauft) ph += (TEMPO * Math.max(0.6, bewegt || 0.6) / Math.max(0.2, schrittL)) * dt;
        const pose = lauft ? stehen(posi, H, { phase: ph, schritt: schrittL, neigung: 2 + 8 * (schrittL / SCHRITT) }) : stehen(posi, H);
        if (!lauft) pose.becken.y += Math.sin(zeit * 1.9) * 0.004;
        reach += (reachZiel - reach) * Math.min(1, dt * (STILL ? 100 : 7));
        if (reach > 0.02) {   // an der Tür: die rechte Hand geht zum Türgriff
          const vorn = V(Math.sin(H), 0, Math.cos(H)), rechts = V(-Math.cos(H), 0, Math.sin(H)), hz = pose.becken.clone().add(V(0, 0.1, 0)).addScaledVector(vorn, 0.58).addScaledVector(rechts, 0.14);
          pose.hand.r = pose.hand.r.clone().lerp(hz, reach);
        }
        posAnwenden(pose, dt);
        if (pr && !spieler) {   // ohne eigenen Charakter: Knopf „PR eintragen“, sobald die Figur am Gerät steht
          let b = null, bd = 2.5;
          if (modus === 'gehen') for (const s of stationen) { const d = Math.hypot(F.x - s.pos.x, F.z - s.pos.z); if (d < bd) { bd = d; b = s.i; } }
          if (b !== nahe) { nahe = b; stand(); }
        }
        if (spieler) {
          if (spieler.haltung) spieler.haltung(pose, H);
          a.atme(pose, null);   // er lebt: atmet, blinzelt, und steht er, schaut er dich an, solange du nicht hinter ihm stehst
          a.schaue(pose, lauft ? null : a.kamera.position, lauft ? 0 : 1, !lauft);
          if (modus === 'gehen') {
            let b = null, bd = 2.5;
            for (const s of stationen) { const d = Math.hypot(F.x - s.pos.x, F.z - s.pos.z); if (d < bd) { bd = d; b = s.i; } }
            if (b !== nahe) { nahe = b; stand(); }
          } else if (nahe != null) { nahe = null; stand(); }
        } else if (LIVE) {   // Live-Gym: steht die Figur an einem Gerät, bietet der große Knopf (und E) „Hier trainieren“ an
          let b = null, bd = 2.5;
          if (modus === 'gehen') for (const s of stationen) { const d = Math.hypot(F.x - s.pos.x, F.z - s.pos.z); if (d < bd) { bd = d; b = s.i; } }
          if (b !== nahe) { nahe = b; stand(); }
        }
        if (waage && modus === 'gehen' && !waageAktiv) {   // draufgehen: kurz auf der Waage stehen bleiben, dann kommt der Status; erst nach dem Weggehen wieder
          const d = Math.hypot(F.x - waage.pos.x, F.z - waage.pos.z);
          if (d < 0.7 && !waageGesperrt) { waageZeit += dt; if (waageZeit > 0.45) { waageZeit = 0; zurWaage(); } } else { waageZeit = 0; if (d > 1.7) waageGesperrt = false; }
        }
        if (modus === 'gehen' && !spiegelAktiv && !waageAktiv) {   // auf den Posing-Platz gehen: kurz stehen bleiben, dann zeigt die Figur Posen; erst nach dem Weggehen wieder
          const d = Math.hypot(F.x - spiegel.pos.x, F.z - spiegel.pos.z);
          if (d < 0.7 && !spiegelGesperrt) { spiegelZeit += dt; if (spiegelZeit > 0.45) { spiegelZeit = 0; zumSpiegel(); } } else { spiegelZeit = 0; if (d > 1.7) spiegelGesperrt = false; }
        }
        if (prT && modus === 'gehen' && !tuerUnterwegs) {   // durch die Tür gehen; in der Nähe zeigt der große Knopf sie an
          const d = Math.hypot(F.x - prT.pos.x, F.z - prT.pos.z), na = d < 2.9;
          if (d < 1.15) zurPrTuer();
          if (na !== naheTuer) { naheTuer = na; stand(); }
        }
        a.figur.stelle(gelenke(pose)); if (a.figur.glut) a.figur.glut(0);
        if (hupf > 0) { hupf = Math.max(0, hupf - dt / 0.62); const u = 1 - hupf; a.figur.gruppe.position.y = Math.sin(u * Math.PI) * 0.62; } else a.figur.gruppe.position.y = 0;
        if (namensTafel) namensTafel.position.y = 2.2 + a.figur.gruppe.position.y;
        legeHalle(F, 0);
      }
    }
    // Kamera
    if (auftritt) {
      // Einstieg: Er kommt durch die Tür auf dich zu, dann fährt die Kamera seitlich um ihn herum nach hinten, ab da spielst du
      auftritt.t += dt;
      const u = glatt(klemme((auftritt.t - 1.1) / (auftritt.dauer - 1.1), 0, 1)), w = Math.PI * (1 - u) + kamW, z = verfolgen(), R = 2.75 + (Math.hypot(z.pos.x - F.x, z.pos.z - F.z) - 2.75) * u;
      K.pos.set(F.x + Math.sin(w) * R, 1.34 + (z.pos.y - 1.34) * u, F.z + Math.cos(w) * R);
      K.blick.set(F.x, 1.2, F.z).lerp(z.blick, u); K.fov = sichtStation() + (z.fov - sichtStation()) * u;
      if (auftritt.t >= auftritt.dauer) auftritt = null;
    } else if (kamFlug) {
      kamFlug.u = Math.min(1, kamFlug.u + dt / kamFlug.dauer);
      const u = glatt(kamFlug.u), z = kamFlug.ziel();
      K.pos.lerpVectors(kamFlug.vonPos, z.pos, u); K.blick.lerpVectors(kamFlug.vonBlick, z.blick, u); K.fov = kamFlug.vonFov + (z.fov - kamFlug.vonFov) * u;
      if (kamFlug.u >= 1) { const dann = kamFlug.dann; kamFlug = null; if (dann) dann(); }
    } else if (modus === 'station' && orbit) {
      orbit.heben += (orbit.hebenZiel - orbit.heben) * (STILL ? 1 : 1 - Math.exp(-dt * 7));   // Karte unten: der Blick hebt sich zur Figur, die Kamera geht ein Stück mit
      const p = umlaufKamera(halle, { mitte: orbit.mitte, r: orbit.r, w: orbit.w, y: orbit.y + orbit.heben * 0.35, fov: orbit.fov }); K.pos.set(p.x, p.y, p.z); K.blick.copy(orbit.mitte); K.blick.y += orbit.heben; if (p.fov) K.fov = p.fov;   // an der Wand rückt die Kamera näher heran, die Sicht weitet sich, die Figur bleibt gleich groß
    } else if (tuerSicht) {
      const z = vorTuer(), k = 1 - Math.exp(-dt * 4);   // draußen vor der Tür: die Kamera bleibt, bis die Figur hineingeht
      K.pos.lerp(z.pos, k); K.blick.lerp(z.blick, k); K.fov += (z.fov - K.fov) * k;
    } else if (modus !== 'draussen' || gang) {
      if (modus === 'gehen' || modus === 'lauf') {   // Kamera-Joystick: rechts und links dreht die Kamera, oben und unten hebt und senkt den Blick (ohne Finger geht der Blick weich zurück)
        if (kamStickX || kamStickY) { kamW -= kamStickX * 1.9 * dt; kamNick = klemme(kamNick - kamStickY * 1.6 * dt, LIVE ? -0.6 : -0.3, 1); } else if (kamNick && !LIVE) kamNick -= kamNick * (1 - Math.exp(-dt * 1.6));   // Live-Gym: der Blick bleibt, wie man ihn gestellt hat
      }
      const z = verfolgen(), k = 1 - Math.exp(-dt * 5.5);
      K.pos.lerp(z.pos, k); K.blick.lerp(z.blick, k); K.fov += (z.fov - K.fov) * k;
    }
    legeKamera();
    if (spieler) {
      kameraLicht.position.copy(a.kamera.position);
      // Eine Wand zwischen Kamera und Halle geht weg, wie beim Blick in ein Puppenhaus
      wandL.visible = K.pos.x > -BREITE / 2; wandR.visible = K.pos.x < BREITE / 2;
      for (const m of wandVorn) m.visible = K.pos.z < zAnfang; for (const m of wandHinten) m.visible = K.pos.z > zEnde;
    }
    // Licht und Bewegung im Raum
    wegU.zeit.value = zeit;
    strichLegen(dt);
    wegU.bis.value += (bisZiel - wegU.bis.value) * Math.min(1, dt * 1.5);   // der Weg zur nächsten Station leuchtet nach und nach auf
    meerU.zeit.value = STILL ? 0 : zeit;   // das Meer steht still bei „Bewegung reduzieren“
    zeitTick(dt);
    const n = naechste(), puls = 0.5 + 0.5 * Math.sin(zeit * 3);
    stationen.forEach((s) => {
      const jetzt = s.i === n;
      s.ring.material.color.set(s.fertig ? P.ringFertig : jetzt ? P.ring : P.ringAus);
      s.ring.material.opacity = jetzt ? 0.6 + 0.4 * puls : 0.9;
      s.teller.material.opacity = s.fertig ? P.tellerFertig : P.tellerSicht;
      if (spieler) s.schild.material.opacity = klemme((Math.hypot(K.pos.x - s.pos.x, K.pos.z - s.pos.z) - 4.2) / 2.6, 0, 1);
    });
    if (!spiegelAktiv) spiegel.schild.material.opacity = klemme((Math.hypot(K.pos.x - spiegel.pos.x, K.pos.z - spiegel.pos.z) - 4.2) / 2.6, 0, 1);
    if (prT) {   // Steht die Figur hinter der Tür oder die Kamera, ist die Wand weg: Sie verdeckt nie die Figur
      const nx = Math.sin(PR_TUER_W), nz = Math.cos(PR_TUER_W), seite = (p) => (p.x - prT.pos.x) * nx + (p.z - prT.pos.z) * nz;
      prT.gruppe.visible = seite(K.pos) > 0 && seite(F) > -0.2;
    }
    for (const g of deko) { const dx = K.pos.x - g.position.x, dz = K.pos.z - g.position.z; g.visible = dx * dx + dz * dz > 6.8; }   // Deko-Geräte nah an der Kamera ausblenden (2,6 m)
    if (prT) prT.schild.material.opacity = klemme((Math.hypot(K.pos.x - prT.pos.x, K.pos.z - prT.pos.z) - 3.6) / 2.6, 0, 1);
    if (prT && prT.fluegel) {   // die Flügel schwingen auf, wenn die Figur nah ist oder zur Tür läuft
      const nah = tuerUnterwegs || Math.hypot(F.x - prT.pos.x, F.z - prT.pos.z) < 3.4;
      prT.auf += ((nah ? 1 : 0) - prT.auf) * (STILL ? 1 : 1 - Math.exp(-dt * 4.5));
      const w = glatt(prT.auf) * 1.45; for (const f of prT.fluegel) f.dreh.rotation.y = f.sg * w;   // die Flügel schwingen zum Gang hin auf und stehen dann rechts und links neben dem Durchgang
      prT.glutMat.color.setScalar(0.3 + 0.7 * glatt(prT.auf));
    }
    if (waage && !waageAktiv) waage.schild.material.opacity = klemme((Math.hypot(K.pos.x - waage.pos.x, K.pos.z - waage.pos.z) - 4.2) / 2.6, 0, 1);   // das Schild verblasst, wenn die Kamera nah ist (sonst verdeckt es die Figur)
    lichtSaeule.material.opacity = (LIVE ? 0.3 : 1) * (0.4 + 0.25 * puls) * klemme((Math.hypot(K.pos.x - lichtSaeule.position.x, K.pos.z - lichtSaeule.position.z) - (STATION_R - 0.4)) / 1.2, 0, 1);   // steht die Kamera in der Lichtsäule, blendet sie aus (sonst liegt ein Schleier über dem Bild)
    spielerRing.material.opacity = 0.5 + 0.4 * puls;
    if (n == null) { tuerOffen = Math.min(1, tuerOffen + dt / 1.6); rahmenM.opacity = 0.6 + 0.4 * puls; }
    const k = glatt(tuerOffen); fluegelL.position.x = -TUER_B / 4 - k * (TUER_B / 2 + 0.05); fluegelR.position.x = TUER_B / 4 + k * (TUER_B / 2 + 0.05);
    tuerEin += (tuerEinZiel - tuerEin) * (STILL ? 1 : 1 - Math.exp(-dt * 3.4));   // Eingang: die Flügel schwingen nach innen auf
    const te = glatt(klemme(tuerEin, 0, 1)); for (const e of eingangFl) e.g.rotation.y = -e.s * te * 1.75;
    if (bodenSp) bodenSp.zeichne(a.renderer, szene, a.kamera);   // Live-Gym: das Spiegelbild im Marmorboden
    spiegelF.zeichne(a.renderer, szene, a.kamera);   // das Spiegelbild für dieses Bild (nur wenn der Spiegel im Bild ist)
  };

  /* ---------- Los: erst die ganze Halle von hoch oben, dann läuft die Figur durch die Tür hinein ---------- */
  stand();
  wegU.bis.value = 0;
  const ausPr = !!(abTuer && prT);   // zurück aus dem PR-Raum: Die Figur steht vor der Tür, ohne Einzug
  if (ausPr) { frei(prT.vorn, prT.raus); modusSetzen('gehen'); const z = verfolgen(); K.pos.copy(z.pos); K.blick.copy(z.blick); K.fov = z.fov; tipp.classList.add('weg'); einstiegLaeuft = false; tuerEin = tuerEinZiel = 1; }
  else if (LIVE) { frei(V(0, 0, zStart - 3.4), Math.PI); modusSetzen('gehen'); einstiegLaeuft = false; tuerEin = tuerEinZiel = 1; const z = verfolgen(); K.pos.copy(z.pos); K.blick.copy(z.blick); K.fov = z.fov; }   // Live-Gym: man steht gleich in der Halle, hinter der Figur
  else { if (spieler) F.z = zAnfang + 0.3; frei(F, Math.PI); }
  a.figur.gruppe.visible = true;
  legeKamera();
  a.groesse();
  posterMachen();   // erst jetzt hat die Zeichenfläche ihre echte Größe
  statuenMachen();
  if (typeof ResizeObserver !== 'undefined') { beobachter = new ResizeObserver(() => a.groesse()); beobachter.observe(bild); }
  a.start();
  laden.classList.add('weg');
  setTimeout(() => laden.remove(), 500);
  if (ausPr) pop('Zurück im', 'Gym');
  else pop(pr ? 'Willkommen im' : spieler ? 'Dein Charakter' : 'Dein Gym heute', pr ? 'PR-Raum' : (spieler && spieler.name) || titel || 'Training');
  if (ausPr || LIVE) { /* er steht schon da */ }
  else if (spieler) {
    popEl.style.top = '70%'; setTimeout(() => { popEl.style.top = ''; }, 1600);   // das Gesicht bleibt frei
    // Der Einstieg zeigt ihn von vorn. Bei „Bewegung reduzieren“ geht es ohne Fahrt gleich los
    lauf([V(0, 0, 1.6)], () => { if (modus === 'draussen') { modusSetzen('gehen'); zielH = Math.PI; } });
    gang.tempo = 1.5;
    if (!STILL) auftritt = { t: 0, dauer: 3.7 }; else kameraZu(verfolgen, 0.01, null);
  } else setTimeout(() => {
    if (!offen || !einstiegLaeuft) return;
    // Einstieg (09.11.2026): erst das Gebäude von oben (Flachdach mit DK), dann der Blick auf die Eingangstür; die Figur geht hin, hebt die Hand, die Tür geht auf, sie geht hinein
    const hinein = () => {
      tuerEinZiel = 1; reachZiel = 0; tuerSicht = false;
      lauf(route(F, V(0, 0, zStart)), () => { einstiegLaeuft = false; if (modus === 'draussen') { modusSetzen('gehen'); zielH = Math.PI; } });
      kameraZu(verfolgen, STILL ? 0.01 : 2.3, null);
    };
    if (STILL) { hinein(); return; }
    kameraZu(vorTuer, 1.8, () => { tuerSicht = true; });
    setTimeout(() => {
      if (!offen || !einstiegLaeuft) return;
      lauf([V(0, 0, zAnfang + 1.75)], () => { reachZiel = 1; warte = 0.6; nachWarte = () => { tuerEinZiel = 1; warte = 0.85; nachWarte = hinein; }; });
    }, 800);
  }, STILL ? 0 : 1000);
  setTimeout(() => { tipp.classList.add('weg'); }, 12000);
  // Für den PR-Raum: andere Scheiben auf die Stange (während die Karte offen ist, bleibt die Figur dabei stehen), Karte runter, kurzer Jubel
  function scheibenSetzen(i, liste, wert) {
    const s = stationen[i]; if (!s || !s.anim || !offen) return;
    s.u.scheiben = liste; s.veraltet = true;
    if (wert !== undefined) { s.u.wert = wert; s.schildMalen(); if (aktiv === i) kName.textContent = wert; }
    if (aktiv === i) { const vor = a.einleitung; a.einleitung = false; a.geraete.scheiben = liste; a.zeige(s.anim, s.d.m || []); a.einleitung = vor; if (s.statisch) s.statisch.visible = false; }
  }
  const jubel = (klein, gross) => { if (!offen) return; funken(); pop(klein, gross); if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} } };
  const zugang = test ? { test: {   // nur für Prüfseiten (test: true): Figur und Kamera setzen, Stufe und Bildzeiten lesen
    setze(x, z, h, w, nick, zoom) { if (aktiv == null && modus === 'gehen') { F.set(x, 0, z); H = zielH = h; kamW = w; kamNick = nick || 0; if (zoom) kamZ = zoom; const k = verfolgen(); K.pos.copy(k.pos); K.blick.copy(k.blick); K.fov = k.fov; } },
    zeit(n) { znZiel = n; zn = n; zeitSetzen(n); zeitZeichen(); }, stufe: (n) => { if (n != null) { qStufe = n; qFest = true; qAnwenden(); } return { stufe: qStufe, pr: a.renderer.getPixelRatio() }; },
    modus: () => modus, nahe: () => nahe, szene, renderer: a.renderer, F: () => ({ x: F.x, z: F.z, h: H }) } } : {};
  return { schliessen, stationFertig, zumSpiegel, scheibenSetzen, jubel, karteRunter: () => karteUnten(true), zurKarte: () => (waageAktiv ? statusZu() : spiegelAktiv ? spiegelZu() : zurueckZurKarte(false)), ...zugang };
}
