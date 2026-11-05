// DK Coach — Trainingsraum (02.11.2026, Devin: „… einen Raum, wo die ganzen Geräte stehen … ein Weg … am Ende die Tür“, dann „wie ein kleines Videospiel … wie Mario, nächstes Level … nur in 3D … POV von oben … reingehen“).
// Der Trainingstag als kleines 3D-Spiel: Die Figur läuft von oben gesehen den Weg entlang von Station zu Station, an der Station taucht die Kamera ein und die Figur trainiert, am Ende geht es durch die Tür.
// Eine Ansicht (figur.js) zeichnet alles. Sie rechnet mit Figur und Gerät im Ursprung, darum bewegt sich nicht die Figur durch die Halle, sondern die Halle (Gruppe raum) wird unter ihr verschoben.
// An der Station liegt die Halle so, dass die Station im Ursprung liegt. Kamera (K), Figur (F, H) und Stationen rechnen in Hallen-Koordinaten: Eingang bei z > 0, der Weg führt nach -z.

const el = (tag, klasse, text) => { const e = document.createElement(tag); if (klasse) e.className = klasse; if (text != null) e.textContent = text; return e; };
const glatt = (u) => u * u * (3 - 2 * u);
const klemme = (x, a, b) => Math.min(b, Math.max(a, x));
const winkelDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const STILL = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const BREITE = 12, WAND = 3.2, FACH = 5.2, SEITE_X = 3.2, STATION_R = 2.1, TUER_B = 3.2, TUER_H = 3.1;
const TEMPO = 2.8, SCHRITT = 0.36;   // Laufen in m/s, Schrittlänge

const FARBEN_LAGUNE = {
  himmel: 0x86cbee, nebel: 0x92d2f0, see: true, tuer: 0x14c7b6, schatten: '8,50,80',
  bodenA: '#C4E6F6', bodenB: '#AEDBF0', fuge: 'rgba(8,70,110,.2)', bodenLicht: 'rgba(255,255,255,.62)', bodenLicht0: 'rgba(255,255,255,0)',
  seiten: [0xdcedf6, 0xcfe5f1, 0xffffff, 0xc4dcea, 0xf2f9fc, 0xd6e9f3], led: 0x7ff5e6, halo: 0x48e8d6, haloStark: 0.6,
  ring: 0x14c7b6, ringAus: 0x5db6e0, ringFertig: 0x0fa899, teller: 0xffffff, tellerSicht: 0.6, tellerFertig: 0.85,
  rahmen: 0xe3edf2, polster: 0x123a55, gummi: 0x1b3446, metall: null, glas: 0xbfe9f7,
  schild: { grund: 'rgba(255,255,255,.96)', text: '#0B2434', text2: '#3A5668', a: '#4FB8F5', b: '#25D3C2', kreis: '#06293B' },
  wegA: [0.05, 0.62, 0.72], wegB: [0.06, 0.74, 0.62], wegDunkel: 0.36, deck: 0xf3fafd, strich: [0.03, 0.43, 0.72]
};
const FARBEN_KLAR = {
  himmel: 0xf5f5f7, nebel: 0xf5f5f7, see: false, tuer: 0x0071e3, schatten: '0,0,0', aussen: '#ECECEF', aussenLinie: 'rgba(0,0,0,.05)',
  bodenA: '#FFFFFF', bodenB: '#F1F1F4', fuge: 'rgba(0,0,0,.08)', bodenLicht: 'rgba(0,113,227,.07)', bodenLicht0: 'rgba(0,113,227,0)',
  seiten: [0xe8e8ed, 0xdcdce1, 0xffffff, 0xcdcdd2, 0xf5f5f7, 0xe3e3e8], led: 0xbcdcfb, halo: 0x0071e3, haloStark: 0.14,
  ring: 0x0071e3, ringAus: 0x9cc7f2, ringFertig: 0x1b7f35, teller: 0xffffff, tellerSicht: 0.75, tellerFertig: 0.92,
  rahmen: 0xe3e3e8, polster: 0x1d1d1f, gummi: 0x2a2a2d, metall: null, glas: 0xcfe3f8,
  schild: { grund: 'rgba(255,255,255,.97)', text: '#1D1D1F', text2: '#6E6E73', a: '#0071E3', b: '#0071E3', kreis: '#FFFFFF' },
  wegA: [0, 0.44, 0.89], wegB: [0, 0.44, 0.89], wegDunkel: 0.3, deck: 0xfbfbfd, strich: [0, 0.44, 0.89]
};
const FARBEN_GOLD = {
  himmel: 0x050507, nebel: 0x07070a, see: false, tuer: 0xf0cd74, schatten: '0,0,0', aussen: '#08080B', aussenLinie: 'rgba(139,92,246,.26)',
  bodenA: '#131318', bodenB: '#0B0B0E', fuge: 'rgba(236,200,110,.13)', bodenLicht: 'rgba(139,92,246,.36)', bodenLicht0: 'rgba(139,92,246,0)',
  seiten: [0x1a1a20, 0x141418, 0xe0b95b, 0x0e0e11, 0x1d1d23, 0x121216], led: 0xb794ff, halo: 0x8b5cf6, haloStark: 1,
  ring: 0xf0cd74, ringAus: 0x7a6a3c, ringFertig: 0xcc9a33, teller: 0x1c1c22, tellerSicht: 0.82, tellerFertig: 0.95,
  rahmen: 0x1b1b20, polster: 0x0f0f13, gummi: 0x0a0a0c, metall: 0xe8c468, glas: 0x6b4fb0,
  schild: { grund: 'rgba(16,16,21,.96)', text: '#F5F1E7', text2: '#BDB7A8', a: '#F7DE93', b: '#CC9A33', kreis: '#1B1304' },
  wegA: [0.97, 0.87, 0.58], wegB: [0.8, 0.6, 0.2], wegDunkel: 0.24, deck: 0x17171c, strich: [0.98, 0.86, 0.52]
};

function zeichne(breite, hoehe, malen) {
  const c = document.createElement('canvas'); c.width = breite; c.height = hoehe;
  malen(c.getContext('2d'), breite, hoehe);
  return c;
}
function runde(x, l, o, b, h, r) { x.beginPath(); x.moveTo(l + r, o); x.arcTo(l + b, o, l + b, o + h, r); x.arcTo(l + b, o + h, l, o + h, r); x.arcTo(l, o + h, l, o, r); x.arcTo(l, o, l + b, o, r); x.closePath(); }
const SCHRIFT = '-apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';

// spieler (optional): der eigene Charakter statt der Standardfigur. { name, bauen(ansicht, M) vor dem Aufbau der Stationen, haltung(pose, winkel) im Gehen und Stehen }. Dann: Kamera näher dran, Einstieg durch die Tür, Name über dem Kopf, „Hier trainieren“ am Gerät
export async function raumOeffnen({ lade3d, titel, uebungen, beiStation, beiStationWeg, beiZu, spieler }) {
  const LOOK = document.documentElement.dataset.look, GOLD = LOOK === 'gold', P = GOLD ? FARBEN_GOLD : LOOK === 'klar' ? FARBEN_KLAR : FARBEN_LAGUNE;
  // Oberfläche
  const wurzel = el('div', 'raum'); wurzel.setAttribute('role', 'dialog'); wurzel.setAttribute('aria-modal', 'true'); wurzel.setAttribute('aria-label', 'Trainingsraum');
  const bild = el('canvas', 'raum-bild'); bild.setAttribute('aria-label', 'Begehbares Gym mit den Geräten des Tages, von oben');
  const zu = el('button', 'raum-zu', '✕'); zu.type = 'button'; zu.setAttribute('aria-label', 'Raum verlassen');
  const kopf = el('div', 'raum-kopf'), kopfT = el('b', null, titel || 'Dein Gym heute'), kopfS = el('span', 'raum-stand');
  const punkte = el('div', 'raum-punkte'); uebungen.forEach(() => punkte.append(el('i')));
  const kopfText = el('div', 'raum-kopftext'); kopfText.append(kopfT, kopfS); kopf.append(zu, kopfText, punkte);
  const tipp = el('div', 'raum-tipp', spieler ? 'Knüppel: laufen · Wischen: Kamera' : 'Station antippen · Knüppel: selbst laufen');
  const stick = el('div', 'raum-stick'), stickK = el('i'); stick.append(stickK); stick.setAttribute('aria-hidden', 'true');
  const weiter = el('button', 'raum-weiter'); weiter.type = 'button';
  const unten = el('div', 'raum-unten'); unten.append(stick, weiter);
  const karte = el('section', 'raum-karte'), kKopf = el('div', 'raum-karte-kopf'), kNr = el('span', 'raum-nr'), kZurueck = el('button', 'raum-zurueck', 'Zurück'), kInhalt = el('div', 'raum-inhalt'); kZurueck.type = 'button';
  kKopf.append(kNr, kZurueck); karte.append(kKopf, kInhalt);
  const meldung = el('div', 'raum-meldung'); meldung.setAttribute('role', 'status');
  const popEl = el('div', 'raum-pop'), blitz = el('div', 'raum-blitz');
  const laden = el('div', 'raum-laden'), ladenT = el('p', null, 'Dein Gym wird aufgebaut …'); laden.append(el('i', 'raum-kreis'), ladenT);
  const ende = el('div', 'raum-ende');
  wurzel.append(bild, kopf, tipp, unten, karte, meldung, popEl, blitz, laden, ende);
  wurzel.classList.add('faehrt');
  document.body.append(wurzel);

  let a = null, offen = true, beobachter = null, aufraeumen = null;
  function schliessen(geschafft, still) {
    if (!offen) return; offen = false;
    if (beobachter) beobachter.disconnect();
    if (aufraeumen) aufraeumen();
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
  if (GOLD) { const lila = new THREE.DirectionalLight(0x9b6cff, spieler ? 0.5 : 1.5); lila.position.set(-1, 5, -2.5); szene.add(lila); }
  const lichter = szene.children.filter((o) => o.isDirectionalLight);
  let kameraLicht = null;   // eigener Charakter: warmes Licht aus Richtung der Kamera, so stimmt der Hautton von jeder Seite
  if (spieler) { kameraLicht = new THREE.DirectionalLight(0xfff0e4, GOLD ? 1.1 : 0.6); szene.add(kameraLicht); }
  szene.fog = new THREE.Fog(P.nebel, 70, 520);
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
  const N = uebungen.length, zStart = 3.6;
  const zStation = (i) => -2 - i * FACH;
  const zEnde = zStation(N - 1) - 7.5, zAnfang = zStart + 3.4, LAENGE = zAnfang - zEnde, zMitte = (zAnfang + zEnde) / 2;
  const stationen = uebungen.map((u, i) => {
    const links = i % 2 === 0, x = links ? -SEITE_X : SEITE_X;
    return { i, u, links, d: u.d, pos: V(x, 0, zStation(i)), winkel: links ? Math.PI / 2 - 0.38 : -Math.PI / 2 + 0.38, fertig: !!u.fertig, anim: null, statisch: null };
  });
  const ausLokal = (s, v) => v.clone().applyAxisAngle(Y, s.winkel).add(s.pos);

  /* ---------- Umgebung: Lagune oder schwarzer Grund ---------- */
  const aussenT = tex(zeichne(512, 512, (x, b, h) => {
    if (P.see) {
      x.fillStyle = '#25B9CC'; x.fillRect(0, 0, b, h);
      x.fillStyle = 'rgba(255,255,255,.28)'; for (let i = 0; i < 70; i++) x.fillRect((i * 173) % b, (i * 97) % h, 18 + (i * 7) % 44, 3);
    } else {
      x.fillStyle = P.aussen; x.fillRect(0, 0, b, h);
      x.strokeStyle = P.aussenLinie; x.lineWidth = 2; x.strokeRect(0, 0, b, h);
    }
  }), true);
  aussenT.repeat.set(P.see ? 26 : 90, P.see ? 26 : 90);
  raum.add(flach(new THREE.PlaneGeometry(1600, 1600), grund(0xffffff, { map: aussenT }), 0, -0.5, zMitte));

  /* ---------- Boden der Halle: Platten, Spiegelung der LED-Schienen ---------- */
  const bodenT = tex(zeichne(1024, 512, (x, b, h) => {
    const g = x.createLinearGradient(0, 0, b, 0); g.addColorStop(0, P.bodenB); g.addColorStop(0.5, P.bodenA); g.addColorStop(1, P.bodenB); x.fillStyle = g; x.fillRect(0, 0, b, h);
    const streifenX = (mx, br) => { const s = x.createLinearGradient(mx - br, 0, mx + br, 0); s.addColorStop(0, P.bodenLicht0); s.addColorStop(0.5, P.bodenLicht); s.addColorStop(1, P.bodenLicht0); x.fillStyle = s; x.fillRect(mx - br, 0, br * 2, h); };
    streifenX(b * (0.5 - 2.6 / BREITE), b * 0.07); streifenX(b * (0.5 + 2.6 / BREITE), b * 0.07);
    const s = x.createLinearGradient(0, h * 0.34, 0, h * 0.66); s.addColorStop(0, P.bodenLicht0); s.addColorStop(0.5, P.bodenLicht); s.addColorStop(1, P.bodenLicht0); x.fillStyle = s; x.fillRect(0, h * 0.34, b, h * 0.32);
    x.strokeStyle = P.fuge; x.lineWidth = 2;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(b * i / 6, 0); x.lineTo(b * i / 6, h); x.stroke(); }
    x.beginPath(); x.moveTo(0, 1); x.lineTo(b, 1); x.stroke();
  }), true);
  bodenT.repeat.set(1, LAENGE / FACH);
  raum.add(flach(new THREE.PlaneGeometry(BREITE, LAENGE), grund(0xffffff, { map: bodenT }), 0, 0, zMitte));
  // Stege vor den Türen
  raum.add(flach(new THREE.PlaneGeometry(TUER_B + 1.2, 16), grund(P.deck), 0, -0.02, zAnfang + 8));
  raum.add(flach(new THREE.PlaneGeometry(TUER_B + 1.2, 40), grund(P.deck), 0, -0.02, zEnde - 20));

  /* ---------- Niedrige Wände (Sicht von oben wie in die offene Halle) ---------- */
  const wandM = grund(0xffffff, { vertexColors: true });
  const wand = (b, h, t, x, y, z) => { const m = new THREE.Mesh(kiste(b, h, t), wandM); m.position.set(x, y, z); raum.add(m); return m; };
  const wandL = wand(0.3, WAND, LAENGE, -BREITE / 2, WAND / 2, zMitte), wandR = wand(0.3, WAND, LAENGE, BREITE / 2, WAND / 2, zMitte), wandVorn = [], wandHinten = [];
  const stueck = (BREITE - TUER_B) / 2;
  for (const z of [zAnfang, zEnde]) (z === zAnfang ? wandVorn : wandHinten).push(wand(stueck, WAND, 0.3, -(TUER_B + stueck) / 2, WAND / 2, z), wand(stueck, WAND, 0.3, (TUER_B + stueck) / 2, WAND / 2, z));

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
  leiste(true, LAENGE, -BREITE / 2, WAND + 0.06, zMitte); leiste(true, LAENGE, BREITE / 2, WAND + 0.06, zMitte);   // auf den Wänden
  leiste(true, LAENGE - 1, -2.6, 4.5, zMitte); leiste(true, LAENGE - 1, 2.6, 4.5, zMitte);                            // Schienen oben über der Halle
  for (let z = zAnfang - FACH / 2; z > zEnde; z -= FACH) leiste(false, 5.2, 0, 4.5, z);

  /* ---------- Türen ---------- */
  const rahmenM = grund(P.tuer, { transparent: true, opacity: 0.6, fog: false }), rahmenA = grund(P.tuer, { fog: false });
  const rahmen = (z, m) => { for (const [b, h, x, y] of [[0.14, TUER_H + 0.14, -TUER_B / 2, TUER_H / 2], [0.14, TUER_H + 0.14, TUER_B / 2, TUER_H / 2], [TUER_B + 0.14, 0.14, 0, TUER_H]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(b, h, 0.14), m); r.position.set(x, y, z); raum.add(r); (z === zAnfang ? wandVorn : wandHinten).push(r); } };
  rahmen(zAnfang, rahmenA); rahmen(zEnde, rahmenM);
  const tuerGlas = grund(P.glas, { transparent: true, opacity: 0.42, depthWrite: false });
  const fluegelL = new THREE.Mesh(new THREE.BoxGeometry(TUER_B / 2 - 0.04, TUER_H, 0.06), tuerGlas), fluegelR = fluegelL.clone();
  fluegelL.position.set(-TUER_B / 4, TUER_H / 2, zEnde); fluegelR.position.set(TUER_B / 4, TUER_H / 2, zEnde); raum.add(fluegelL, fluegelR);
  const tuerSchild = zeichne(640, 128, () => {}), tuerTex = tex(tuerSchild);
  const schild = new THREE.Sprite(new THREE.SpriteMaterial({ map: tuerTex, transparent: true, depthWrite: false, toneMapped: false, fog: false })); schild.scale.set(4.2, 0.84, 1); schild.position.set(0, TUER_H + 0.9, zEnde); schild.renderOrder = 6; raum.add(schild);
  function schildMalen(fertig) {
    const x = tuerSchild.getContext('2d'); x.clearRect(0, 0, 640, 128);
    x.fillStyle = P.schild.grund; runde(x, 6, 8, 628, 112, 56); x.fill();
    x.fillStyle = P.schild.text; x.font = '600 54px ' + SCHRIFT; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(fertig ? 'Raus, geschafft!' : 'Ziel', 320, 66, 590);
    tuerTex.needsUpdate = true;
  }
  schildMalen(false);

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
      x.fillText(s.fertig ? '✓' : String(s.i + 1), 90, 95);
      x.textAlign = 'left'; x.font = '600 50px ' + SCHRIFT; x.fillStyle = s.fertig ? F2.text2 : F2.text;
      const zeilen = []; let z = '';
      for (const w of s.u.name.split(' ')) { const neu = z ? z + ' ' + w : w; if (x.measureText(neu).width > 510 && z) { zeilen.push(z); z = w; } else z = neu; } zeilen.push(z);
      const zwei = zeilen.slice(0, 2); if (zeilen.length > 2) zwei[1] += ' …';
      zwei.forEach((zeile, i) => x.fillText(zeile, 172, 93 + (i - (zwei.length - 1) / 2) * 56, 520));
      t.needsUpdate = true;
    };
    s.schildMalen();
    return sp;
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
    s.startLokal = V(0, 0, 1.8); s.startW = Math.PI;
    let oben = 1.5;
    if (s.anim) {
      try {
        a.zeige(s.anim, s.d.m || []);
        if (a.intro) {
          const p0 = a.intro.pose(0); a.introBild(0);
          if (p0.becken) s.startLokal = V(p0.becken.x, 0, p0.becken.z);
          if (p0.rumpf && p0.rumpf.basis) { const v = V(0, 0, 1).applyQuaternion(p0.rumpf.basis); s.startW = Math.atan2(v.x, v.z); }
        } else a.bild(0);
        a.geraete.gruppe.updateMatrixWorld(true);
        const kopie = a.geraete.gruppe.clone(true);
        kopie.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } o.updateMatrix(); o.matrixAutoUpdate = false; });
        g.add(kopie); s.statisch = kopie;
        const box = new THREE.Box3().setFromObject(a.geraete.gruppe); if (isFinite(box.max.y)) oben = Math.max(oben, box.max.y);
      } catch (e) { s.anim = null; }
    }
    a.uebung = null; a.intro = null; a.geraete.leeren();
    const sp = namensSchild(s); sp.position.set(s.pos.x, Math.min(oben, 2.5) + 0.75, s.pos.z); raum.add(sp); s.schild = sp;
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

  let namensTafel = null;
  if (spieler && spieler.name) {
    const t = zeichne(640, 128, (x, b) => { x.font = '800 60px ' + SCHRIFT; const w = Math.min(b - 8, x.measureText(spieler.name).width + 70); x.fillStyle = P.schild.grund; runde(x, (b - w) / 2, 10, w, 108, 54); x.fill(); x.fillStyle = P.schild.text; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(spieler.name, b / 2, 67, b - 50); });
    namensTafel = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(t), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false }));   // Der Name bleibt auch vor einem Gerät lesbar
    namensTafel.scale.set(1.5, 0.3, 1); namensTafel.position.set(0, 2.2, 0); namensTafel.renderOrder = 7; szene.add(namensTafel);
  }
  /* ---------- Figur und Kamera ---------- */
  const F = V(0, 0, zAnfang + 4), K = { pos: V(0, LAENGE * 0.95, zMitte + LAENGE * 0.62), blick: V(0, 0, zMitte), fov: sichtOben() };
  let H = Math.PI, zielH = Math.PI, ph = 0, schrittL = 0, gang = null, warte = 0, nachWarte = null, hupf = 0;
  let hallenWinkel = 0, aktiv = null, kamFlug = null, modus = 'draussen', orbit = null, zeit = 0, gehX = 0, gehY = 0;
  let kamW = 0, kamZ = 1, bisZiel = 0, vonZiel = 0, tuerOffen = 0, auftritt = null, nahe = null;
  const legeHalle = (p, w) => {
    const delta = w - hallenWinkel; hallenWinkel = w;
    raum.rotation.y = -w; raum.position.set(p.x, 0, p.z).applyAxisAngle(Y, -w).negate(); raum.updateMatrixWorld(true);
    if (delta) for (const l of lichter) l.position.applyAxisAngle(Y, -delta);
  };
  const legeKamera = () => {
    a.kamera.position.copy(raum.localToWorld(K.pos.clone()));
    a.kamera.lookAt(raum.localToWorld(K.blick.clone()));
    if (Math.abs(a.kamera.fov - K.fov) > 0.01) { a.kamera.fov = K.fov; a.kamera.updateProjectionMatrix(); }
  };
  const verfolgen = () => {
    const dx = Math.sin(kamW), dz = Math.cos(kamW);
    if (spieler) return { pos: V(F.x + dx * 4.5 * kamZ, 0.9 + 3.5 * kamZ, F.z + dz * 4.5 * kamZ), blick: V(F.x - dx * 0.9, 0.95, F.z - dz * 0.9), fov: sichtOben() };   // dein Charakter ist groß im Bild
    return { pos: V(F.x + dx * 7.4 * kamZ, 8.8 * kamZ, F.z + dz * 7.4 * kamZ), blick: V(F.x - dx * 1.5, 0.8, F.z - dz * 1.5), fov: sichtOben() };
  };
  function kameraZu(ziel, dauer, dann) {
    kamFlug = { vonPos: K.pos.clone(), vonBlick: K.blick.clone(), vonFov: K.fov, ziel: typeof ziel === 'function' ? ziel : () => ziel, u: 0, dauer: STILL ? 0.01 : dauer, dann };
  }
  function setzeAktiv(i) {
    const s = stationen[i];
    aktiv = i;
    legeHalle(s.pos, s.winkel);
    a.figur.gruppe.position.y = 0;
    a.kamera.fov = sichtStation(); a.kamera.updateProjectionMatrix();
    a.zeige(s.anim, s.d.m || []);
    s.sichtLokal = a.kamera.position.clone(); s.zielLokal = a.ziel.clone();
    if (s.statisch) s.statisch.visible = false;
    spielerRing.visible = false; if (namensTafel) namensTafel.visible = false;
    legeKamera();
  }
  function frei(p, w) {
    if (aktiv != null && stationen[aktiv].statisch) stationen[aktiv].statisch.visible = true;
    aktiv = null; a.uebung = null; a.intro = null; a.geraete.leeren(); a.figur.markiere([]);
    if (a.figur.hut) { a.figur.hut.visible = !a.figur.ohneHut; if (a.figur.haarAnzeige) a.figur.haarAnzeige(); }
    F.set(p.x, 0, p.z); H = zielH = w; legeHalle(F, 0); spielerRing.visible = true; if (namensTafel) namensTafel.visible = true;
  }
  const offeneZahl = () => stationen.filter((s) => !s.fertig).length;
  const naechste = () => { const s = stationen.find((x) => !x.fertig); return s ? s.i : null; };

  function stand() {
    const fertig = N - offeneZahl(), n = naechste();
    kopfS.textContent = fertig + ' von ' + N + ' geschafft';
    [...punkte.children].forEach((p, i) => { p.className = stationen[i].fertig ? 'an' : i === n ? 'jetzt' : ''; });
    const anteil = (z) => wegIndex(V(0, 0, z)) / STUECKE;
    vonZiel = n == null ? anteil(zEnde + 2.4) : n === 0 ? 0 : anteil(stationen[n - 1].pos.z);
    bisZiel = n == null ? 1 : anteil(stationen[n].pos.z);
    wegU.von.value = vonZiel;
    weiter.textContent = '';
    if (nahe != null && !stationen[nahe].fertig) weiter.append(el('small', null, 'Hier trainieren'), el('b', null, stationen[nahe].u.name));
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
    pop('Station ' + (i + 1), s.u.name);
    s.schild.visible = false; lichtSaeule.visible = false;
    const nah = spieler && spieler.karteKlein;   // Probetag mit kleiner Karte: Figur groß. Die Karte der App mit den Sätzen ist höher, dort bleibt es beim normalen Abstand
    const blick = ausLokal(s, s.zielLokal), sicht = ausLokal(s, s.sichtLokal.clone().sub(s.zielLokal).multiplyScalar(nah ? (hochkant() ? 1.08 : 0.98) : hochkant() ? 1.4 : 1.14).add(s.zielLokal));
    blick.y -= hochkant() ? (nah ? 0.72 : spieler ? 1.65 : 0.95) : 0.42;   // Figur steht oben im Bild, unten liegt die Karte (eigener Charakter: ganz über der Karte)
    sicht.y = klemme(sicht.y, 1, 3);
    kameraZu({ pos: sicht, blick, fov: sichtStation() }, 1.5, () => {
      const off = K.pos.clone().sub(blick);
      orbit = { mitte: blick, r: Math.hypot(off.x, off.z), w: Math.atan2(off.x, off.z), y: K.pos.y };
      kNr.textContent = 'Station ' + (i + 1) + ' von ' + N; kNr.dataset.station = i; kInhalt.textContent = '';
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
  function stationFertig(i) {
    const s = stationen[i]; if (!s || !offen) return;
    s.fertig = true; s.schildMalen(); funken();
    if (navigator.vibrate) { try { navigator.vibrate(14); } catch (e) {} }
    stand();
    pop(N - offeneZahl() + ' von ' + N, offeneZahl() ? 'Station geschafft' : 'Alles geschafft');
    zurueckZurKarte(true);
  }
  kZurueck.addEventListener('click', () => zurueckZurKarte(false));

  function rausgehen() {
    if (offeneZahl()) { sag('Noch offen: ' + stationen.filter((s) => !s.fertig).map((s) => s.u.name).join(', ')); return; }
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
  weiter.addEventListener('click', () => { const n = nahe != null && !stationen[nahe].fertig ? nahe : naechste(); if (n == null) rausgehen(); else zurStation(n); });

  /* ---------- Antippen, Wischen, Knüppel ---------- */
  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function angetippt(cx, cy) {
    if (modus === 'draussen' || modus === 'station') return;
    const r = bild.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(ndc, a.kamera);
    const o = raum.worldToLocal(strahl.ray.origin.clone()), d = strahl.ray.direction.clone().applyAxisAngle(Y, hallenWinkel);
    // Boden- oder Gerätetreffer: nächste Station unter dem Finger
    let beste = null, bt = 1e9;
    for (const s of stationen) {
      const fx = o.x - s.pos.x, fz = o.z - s.pos.z, A = d.x * d.x + d.z * d.z, B = fx * d.x + fz * d.z, C = fx * fx + fz * fz - STATION_R * STATION_R, D = B * B - A * C;
      if (D < 0 || !A) continue;
      const t = (-B - Math.sqrt(D)) / A, y = o.y + d.y * Math.max(t, 0);
      if (t > -1 && y < 3.6 && t < bt) { bt = t; beste = s; }
    }
    if (beste) return zurStation(beste.i);
    if (d.y >= -0.01) return;
    const t = -o.y / d.y, x = o.x + d.x * t, z = o.z + d.z * t;
    if (Math.abs(x) < TUER_B && z < zEnde + 3.6) return rausgehen();
    tipp.classList.add('weg');
    lauf([V(klemme(x, -BREITE / 2 + 0.7, BREITE / 2 - 0.7), 0, klemme(z, zEnde + 0.9, zAnfang - 0.7))], null);
  }
  const finger = { id: null, x: 0, y: 0, sx: 0, sy: 0, zeit: 0, weit: false };
  bild.addEventListener('pointerdown', (e) => { if (finger.id != null) return; finger.id = e.pointerId; finger.x = finger.sx = e.clientX; finger.y = finger.sy = e.clientY; finger.zeit = performance.now(); finger.weit = false; try { bild.setPointerCapture(e.pointerId); } catch (x) {} });
  bild.addEventListener('pointermove', (e) => {
    if (e.pointerId !== finger.id) return;
    const dx = e.clientX - finger.x, dy = e.clientY - finger.y; finger.x = e.clientX; finger.y = e.clientY;
    if (Math.hypot(e.clientX - finger.sx, e.clientY - finger.sy) > 8) finger.weit = true;
    if (!finger.weit) return;
    if (modus === 'station' && orbit) { orbit.w -= dx * 0.008; orbit.y = klemme(orbit.y - dy * 0.008, 0.6, 3.4); }
    else if (modus === 'gehen' || modus === 'lauf') { kamW -= dx * 0.006; kamZ = klemme(kamZ + dy * 0.004, 0.55, 2.3); tipp.classList.add('weg'); }
  });
  const loslassen = (e) => {
    if (e.pointerId !== finger.id) return; finger.id = null;
    if (!finger.weit && performance.now() - finger.zeit < 450 && e.type === 'pointerup') angetippt(e.clientX, e.clientY);
  };
  bild.addEventListener('pointerup', loslassen); bild.addEventListener('pointercancel', loslassen);
  bild.addEventListener('wheel', (e) => { e.preventDefault(); kamZ = klemme(kamZ + e.deltaY * 0.001, 0.55, 2.3); }, { passive: false });
  let stickId = null;
  const stickSetzen = (e) => {
    const r = stick.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2, gr = r.width / 2 - 14;
    let x = (e.clientX - mx) / gr, y = (e.clientY - my) / gr; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    gehX = x; gehY = y; stickK.style.transform = 'translate(' + x * gr + 'px,' + y * gr + 'px)';
  };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (x) {} stickSetzen(e); gang = null; tipp.classList.add('weg'); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickSetzen(e); });
  const stickLos = (e) => { if (e.pointerId !== stickId) return; stickId = null; gehX = gehY = 0; stickK.style.transform = ''; };
  stick.addEventListener('pointerup', stickLos); stick.addEventListener('pointercancel', stickLos);

  // Am PC: Pfeiltasten oder WASD statt Knüppel
  const tasten = new Set(), TASTE = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'v', w: 'v', W: 'v', ArrowDown: 'h', s: 'h', S: 'h' };
  const tasteNeu = (e) => {
    const t = TASTE[e.key]; if (!t || stickId != null) return;
    if (e.type === 'keydown') tasten.add(t); else tasten.delete(t);
    const x = (tasten.has('r') ? 1 : 0) - (tasten.has('l') ? 1 : 0), y = (tasten.has('h') ? 1 : 0) - (tasten.has('v') ? 1 : 0), l = Math.hypot(x, y) || 1;
    gehX = x / l; gehY = y / l; e.preventDefault();
    if (x || y) { gang = null; tipp.classList.add('weg'); }
  };
  if (spieler) { window.addEventListener('keydown', tasteNeu); window.addEventListener('keyup', tasteNeu); aufraeumen = () => { window.removeEventListener('keydown', tasteNeu); window.removeEventListener('keyup', tasteNeu); }; }
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
    const an = aktiv == null && modus !== 'station' && Math.hypot(ziel.x - F.x, ziel.z - F.z) > 1.15 && F.z > zEnde + 1.2 ? 1 : 0;
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
  a.kameraFolgt = (dt) => {
    zeit += dt;
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
          F.x += dx * TEMPO * dt; F.z += dz * TEMPO * dt; zielH = Math.atan2(dx, dz); bewegt = st;
          for (const s of stationen) { const ex = F.x - s.pos.x, ez = F.z - s.pos.z, l = Math.hypot(ex, ez); if (l < 1.3 && l > 0.001) { F.x = s.pos.x + ex / l * 1.3; F.z = s.pos.z + ez / l * 1.3; } }
          F.x = klemme(F.x, -BREITE / 2 + 0.5, BREITE / 2 - 0.5); F.z = klemme(F.z, zEnde + 0.7, zAnfang - 0.5);
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
        if (spieler) {
          if (spieler.haltung) spieler.haltung(pose, H);
          a.atme(pose, null);   // er lebt: atmet, blinzelt, und steht er, schaut er dich an, solange du nicht hinter ihm stehst
          a.schaue(pose, lauft ? null : a.kamera.position, lauft ? 0 : 1, !lauft);
          if (modus === 'gehen') {
            let b = null, bd = 2.5;
            for (const s of stationen) { const d = Math.hypot(F.x - s.pos.x, F.z - s.pos.z); if (d < bd) { bd = d; b = s.i; } }
            if (b !== nahe) { nahe = b; stand(); }
          } else if (nahe != null) { nahe = null; stand(); }
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
      K.pos.set(orbit.mitte.x + Math.sin(orbit.w) * orbit.r, orbit.y, orbit.mitte.z + Math.cos(orbit.w) * orbit.r); K.blick.copy(orbit.mitte);
    } else if (modus !== 'draussen' || gang) {
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
    if (P.see) { aussenT.offset.x = zeit * 0.006; aussenT.offset.y = zeit * 0.0025; }
    const n = naechste(), puls = 0.5 + 0.5 * Math.sin(zeit * 3);
    stationen.forEach((s) => {
      const jetzt = s.i === n;
      s.ring.material.color.set(s.fertig ? P.ringFertig : jetzt ? P.ring : P.ringAus);
      s.ring.material.opacity = jetzt ? 0.6 + 0.4 * puls : 0.9;
      s.teller.material.opacity = s.fertig ? P.tellerFertig : P.tellerSicht;
      if (spieler) s.schild.material.opacity = klemme((Math.hypot(K.pos.x - s.pos.x, K.pos.z - s.pos.z) - 4.2) / 2.6, 0, 1);
    });
    lichtSaeule.material.opacity = 0.4 + 0.25 * puls;
    spielerRing.material.opacity = 0.5 + 0.4 * puls;
    if (n == null) { tuerOffen = Math.min(1, tuerOffen + dt / 1.6); rahmenM.opacity = 0.6 + 0.4 * puls; }
    const k = glatt(tuerOffen); fluegelL.position.x = -TUER_B / 4 - k * (TUER_B / 2 + 0.05); fluegelR.position.x = TUER_B / 4 + k * (TUER_B / 2 + 0.05);
  };

  /* ---------- Los: erst die ganze Halle von hoch oben, dann läuft die Figur durch die Tür hinein ---------- */
  stand();
  wegU.bis.value = 0;
  if (spieler) F.z = zAnfang + 0.3;
  frei(F, Math.PI);
  a.figur.gruppe.visible = true;
  legeKamera();
  a.groesse();
  if (typeof ResizeObserver !== 'undefined') { beobachter = new ResizeObserver(() => a.groesse()); beobachter.observe(bild); }
  a.start();
  laden.classList.add('weg');
  setTimeout(() => laden.remove(), 500);
  pop(spieler ? 'Dein Charakter' : 'Dein Gym heute', (spieler && spieler.name) || titel || 'Training');
  if (spieler) {
    popEl.style.top = '70%'; setTimeout(() => { popEl.style.top = ''; }, 1600);   // das Gesicht bleibt frei
    // Der Einstieg zeigt ihn von vorn. Bei „Bewegung reduzieren“ geht es ohne Fahrt gleich los
    lauf([V(0, 0, 1.6)], () => { if (modus === 'draussen') { modusSetzen('gehen'); zielH = Math.PI; } });
    gang.tempo = 1.5;
    if (!STILL) auftritt = { t: 0, dauer: 3.7 }; else kameraZu(verfolgen, 0.01, null);
  } else setTimeout(() => {
    if (!offen) return;
    lauf(route(F, V(0, 0, zStart)), () => { if (modus === 'draussen') { modusSetzen('gehen'); zielH = Math.PI; } });
    kameraZu(verfolgen, STILL ? 0.01 : 3, null);
  }, STILL ? 0 : 1300);
  setTimeout(() => { tipp.classList.add('weg'); }, 12000);
  return { schliessen, stationFertig, zurKarte: () => zurueckZurKarte(false) };
}
