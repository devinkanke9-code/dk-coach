// DK Coach — 3D-Medaille für jeden erreichten Rang (09.11.2026, Devin: „glänzende Medaille … mit einem Bodybuilder … das kannst du drehen … aber das kriegst du nur, wenn du wirklich das erreichst“).
// Nur Anzeige: Welche Medaille jemand hat, ergibt sich allein aus den Punkten in spiel.js (Training). Bestleistungen geben keine Medaillen. Kein Netz, kein Speicher, alle Texte nur als textContent in die Seite.
const STILL = typeof window !== 'undefined' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Metall je Rang. feld: Grund der Medaille, figur: Relief darauf, band: Farben des Bandes, schrift: Farbe der Gravur
const ART = {
  2: { name: 'Bronze', metall: 0xc4803f, rau: 0.26, feld: 0x7c4a22, figur: 0xdc9a58, band: ['#6B3E1C', '#D8A06A'], schrift: '#3A1F0B', motiv: 'hantel' },
  3: { name: 'Eisen', metall: 0x7b8088, rau: 0.38, feld: 0x3e4148, figur: 0x9aa0a9, band: ['#2C2F36', '#8E939C'], schrift: '#16181C', motiv: 'hantel' },
  4: { name: 'Stahl', metall: 0xb7c0ca, rau: 0.2, feld: 0x626b76, figur: 0xd5dde6, band: ['#39424E', '#C5CFDA'], schrift: '#1C2229', motiv: 'hantel' },
  5: { name: 'Titan', metall: 0x93a3b8, rau: 0.24, feld: 0x3f4d60, figur: 0xbcd0e6, band: ['#22344A', '#8FB4DA'], schrift: '#101A26', motiv: 'athlet' },
  6: { name: 'Chrom', metall: 0xf1f4f8, rau: 0.05, feld: 0x8d949e, figur: 0xffffff, band: ['#4B5563', '#F2F5F9'], schrift: '#20252C', motiv: 'athlet' },
  7: { name: 'Gold', metall: 0xf6c04a, rau: 0.13, feld: 0xa8741a, figur: 0xffd877, band: ['#7A1E2E', '#F7DE93'], schrift: '#4A2E05', motiv: 'athlet' },
  8: { name: 'Platin', metall: 0xe8e8e4, rau: 0.1, feld: 0x8f8f8b, figur: 0xfbfbf8, band: ['#26324A', '#E8E8E4'], schrift: '#22262D', motiv: 'athlet', lorbeer: true },
  9: { name: 'Diamant', metall: 0xc6f0ff, rau: 0.06, feld: 0x4f8fb0, figur: 0xecfaff, band: ['#123B5C', '#A7E6FF'], schrift: '#0B2A40', motiv: 'athlet', lorbeer: true, steine: 0xdff6ff },
  10: { name: 'Legende', metall: 0xf2c14e, rau: 0.1, feld: 0x17151c, figur: 0xffd46b, band: ['#17151C', '#8B5CF6'], schrift: '#2A1B02', motiv: 'athlet', lorbeer: true, steine: 0xb794ff, krone: true }
};
export const hatMedaille = (nr) => !!ART[nr];
export const metallName = (nr) => (ART[nr] ? ART[nr].name : '');

function leinwand(b, h, malen) { const c = document.createElement('canvas'); c.width = b; c.height = h; malen(c.getContext('2d'), b, h); return c; }
const SCHRIFT = '-apple-system, "SF Pro Display", "Segoe UI", system-ui, sans-serif';

// Text im Bogen: mitte = Winkel der Textmitte (0 = oben), unten = von innen lesbar am unteren Rand
function bogen(x, text, mx, my, r, mitte, unten) {
  const zeichen = [...text], breiten = zeichen.map((z) => x.measureText(z).width + 6), summe = breiten.reduce((a, b) => a + b, 0);
  let w = mitte - (unten ? -1 : 1) * summe / r / 2;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  zeichen.forEach((z, i) => {
    const halb = breiten[i] / 2 / r * (unten ? -1 : 1);
    w += halb;
    x.save(); x.translate(mx + Math.sin(w) * r, my - Math.cos(w) * r); x.rotate(w + (unten ? Math.PI : 0)); x.fillText(z, 0, 0); x.restore();
    w += halb;
  });
}

// Höhenkarte des Bodybuilders (Doppel-Bizeps, relief-athlet.js): Rot und Grün sind zusammen 16 Bit, so bleibt die Fläche glatt
let reliefDaten = null;
async function ladeRelief() {
  if (reliefDaten) return reliefDaten;
  const img = new Image(); img.src = new URL('./relief-athlet.png', import.meta.url).href;
  await img.decode();
  const N = img.width, d = leinwand(N, N, (x) => x.drawImage(img, 0, 0)).getContext('2d').getImageData(0, 0, N, N).data, f = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) f[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / 65535;
  return (reliefDaten = { N, f });
}
const glatt2 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Ausschnitt des Körpers als Fläche, die aus dem Feld wächst. o: { x0, y0, b (Anteile des Bildes), welt (Kantenlänge), tief, dy, unten (Ausblenden am unteren Rand) }
function reliefFlaeche(T, R, o) {
  const S = 260, pos = new Float32Array((S + 1) * (S + 1) * 3), h = new Float32Array((S + 1) * (S + 1)), idx = [];
  const wert = (u, v) => { const x = Math.max(0, Math.min(R.N - 1.001, u * (R.N - 1))), y = Math.max(0, Math.min(R.N - 1.001, v * (R.N - 1))), i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j, f = R.f, n = R.N; return f[j * n + i] * (1 - a) * (1 - b) + f[j * n + i + 1] * a * (1 - b) + f[(j + 1) * n + i] * (1 - a) * b + f[(j + 1) * n + i + 1] * a * b; };
  for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) {
    const k = j * (S + 1) + i, sx = i / S, sy = j / S, px = (sx - 0.5) * o.welt, py = (0.5 - sy) * o.welt + (o.dy || 0), r = Math.hypot(px, py);
    let w = wert(o.x0 + sx * o.b, o.y0 + sy * o.b) * (1 - glatt2(0.72, 0.775, r));
    if (o.unten) w *= 1 - glatt2(o.unten, 1, sy);
    h[k] = w; pos[k * 3] = px; pos[k * 3 + 1] = py; pos[k * 3 + 2] = 0.0605 + w * o.tief;
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const a = j * (S + 1) + i, b = a + 1, c = a + S + 1, d = c + 1; if (h[a] + h[b] + h[c] + h[d] > 1e-4) idx.push(a, c, b, b, c, d); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function baue(T, renderer, nr, titel, ab, R) {
  const A = ART[nr], gruppe = new T.Group(), weg = [];
  const merke = (x) => { weg.push(x); return x; };
  const metall = (farbe, rau, mehr) => merke(new T.MeshStandardMaterial(Object.assign({ color: farbe, metalness: 1, roughness: rau, envMapIntensity: 1.35 }, mehr)));
  const tex = (c) => { const t = merke(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; };
  const mRand = metall(A.metall, A.rau), mFeld = metall(A.feld, Math.min(0.55, A.rau + 0.22)), mFigur = metall(A.figur, Math.max(0.05, A.rau - 0.05));

  // Körper der Medaille: gedreht aus einem Profil, von hinten nach vorn (so zeigen die Flächen nach außen)
  const p = [[0, -0.06], [0.78, -0.06], [0.81, -0.08], [0.83, -0.14], [0.95, -0.14], [0.995, -0.115], [1.0, -0.09], [1.0, 0.09], [0.995, 0.115], [0.95, 0.14], [0.83, 0.14], [0.81, 0.08], [0.78, 0.06], [0, 0.06]].map(([r, z]) => new T.Vector2(r, z));
  const koerperGeo = merke(new T.LatheGeometry(p, 128)); koerperGeo.rotateX(Math.PI / 2);
  gruppe.add(new T.Mesh(koerperGeo, mRand));

  // Feld: feine Strahlen als Struktur, darauf liegt das Relief
  const strahlen = leinwand(1024, 1024, (x, b, h) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, b, h);
    x.translate(b / 2, h / 2);
    for (let i = 0; i < 240; i++) { x.rotate(Math.PI * 2 / 240); x.fillStyle = i % 2 ? '#a8a8a8' : '#585858'; x.beginPath(); x.moveTo(0, 0); x.lineTo(-5, -b / 2); x.lineTo(5, -b / 2); x.closePath(); x.fill(); }
  });
  const strahlenT = merke(new T.CanvasTexture(strahlen));
  const feldGeo = merke(new T.CircleGeometry(0.79, 96));
  const feld = new T.Mesh(feldGeo, metall(A.feld, Math.min(0.55, A.rau + 0.18), { bumpMap: strahlenT, bumpScale: 0.6 })); feld.position.z = 0.0612; gruppe.add(feld);
  const feldHinten = new T.Mesh(feldGeo, mFeld); feldHinten.position.z = -0.0612; feldHinten.rotation.y = Math.PI; gruppe.add(feldHinten);

  // Gravur auf dem Rand: oben der Rang, unten die Marke
  const randText = leinwand(2048, 2048, (x, b, h) => {
    x.fillStyle = A.schrift; x.font = '800 100px ' + SCHRIFT;
    const r = b / 2 * 0.895;
    bogen(x, titel.toUpperCase(), b / 2, h / 2, r, 0, false);
    bogen(x, 'DK COACH', b / 2, h / 2, r, Math.PI, true);
    for (const w of [Math.PI / 2, -Math.PI / 2]) { x.beginPath(); x.arc(b / 2 + Math.sin(w) * r, h / 2 - Math.cos(w) * r, 15, 0, 7); x.fill(); }
  });
  const randGeo = merke(new T.RingGeometry(0.8, 1.0, 128));
  const rand = new T.Mesh(randGeo, merke(new T.MeshStandardMaterial({ map: tex(randText), transparent: true, metalness: 0, roughness: 0.9, envMapIntensity: 0, depthWrite: false }))); rand.position.z = 0.1425; gruppe.add(rand);

  // Rückseite
  const hinten = leinwand(1024, 1024, (x, b, h) => {
    x.textAlign = 'center'; x.textBaseline = 'middle'; const hell = nr === 10 ? '#FFD46B' : '#FFFFFF';
    x.fillStyle = hell; x.font = '600 64px ' + SCHRIFT; x.fillText('DK COACH', b / 2, 280);
    x.font = '800 190px ' + SCHRIFT; x.fillText(String(nr), b / 2, 470);
    x.font = '700 76px ' + SCHRIFT; x.fillText(titel, b / 2, 640, 720);
    x.font = '500 50px ' + SCHRIFT; x.fillText('Durch Training verdient', b / 2, 745, 720);
    x.fillText('ab ' + String(ab).replace(/\B(?=(\d{3})+$)/g, '.') + ' Punkten', b / 2, 810, 720);
  });
  const hintenM = new T.Mesh(feldGeo, merke(new T.MeshStandardMaterial({ map: tex(hinten), transparent: true, metalness: 0.6, roughness: 0.4, depthWrite: false }))); hintenM.position.z = -0.0625; hintenM.rotation.y = Math.PI; gruppe.add(hintenM);

  // Relief in der Mitte
  const kugel = merke(new T.SphereGeometry(1, 28, 20)), m4 = new T.Matrix4(), q = new T.Quaternion(), achse = new T.Vector3(0, 0, 1);
  const relief = (teile, mass, dy) => {
    const inst = new T.InstancedMesh(kugel, mFigur, teile.length);
    teile.forEach(([x, y, z, a, b, c, r], i) => { q.setFromAxisAngle(achse, r); m4.compose(new T.Vector3(x * mass, y * mass + dy, 0.075 + z * mass * 0.6), q, new T.Vector3(a * mass, b * mass, c * mass * 0.75)); inst.setMatrixAt(i, m4); });
    inst.instanceMatrix.needsUpdate = true; gruppe.add(inst);
  };
  if (R && (A.motiv === 'athlet' || A.motiv === 'oberkoerper')) {
    const o = A.motiv === 'oberkoerper' ? { x0: 0.13, y0: 0.03, b: 0.74, welt: 1.6, tief: 0.17, dy: -0.02, unten: 0.66 } : A.lorbeer ? { x0: 0, y0: 0, b: 1, welt: 1.34, tief: 0.13, dy: 0.0 } : { x0: 0, y0: 0, b: 1, welt: 1.5, tief: 0.15, dy: 0.0 };
    gruppe.add(new T.Mesh(merke(reliefFlaeche(T, R, o)), mFigur));
  } else {
    const h = new T.Group(); h.rotation.z = 0.5; h.position.z = 0.14;
    const stange = new T.Mesh(merke(new T.CylinderGeometry(0.04, 0.04, 1.26, 24)), mFigur); stange.rotation.z = Math.PI / 2; h.add(stange);
    for (const s of [-1, 1]) for (const [x, r, d] of [[0.36, 0.31, 0.09], [0.46, 0.25, 0.08], [0.55, 0.18, 0.07], [0.63, 0.06, 0.06]]) {
      const c = new T.Mesh(merke(new T.CylinderGeometry(r, r, d, 48)), mFigur); c.rotation.z = Math.PI / 2; c.position.x = s * x; c.scale.z = 0.42; h.add(c);
    }
    gruppe.add(h);
  }
  if (A.lorbeer) {
    const blaetter = [];
    for (const s of [-1, 1]) for (let i = 0; i < 11; i++) {
      const w = (2.86 - i * 0.2) * s, r = 0.69 + (i % 2 ? 0.035 : -0.035);
      blaetter.push([Math.sin(w) * r / 1.0, Math.cos(w) * r / 1.0, 0.03, 0.03, 0.07, 0.03, -w + s * 0.5]);
    }
    relief(blaetter, 1, 0);
  }
  if (A.steine) {
    const stein = merke(new T.OctahedronGeometry(0.05, 0)), mS = merke(new T.MeshStandardMaterial({ color: A.steine, metalness: 0.65, roughness: 0.06, envMapIntensity: 1.7, flatShading: true, emissive: A.steine, emissiveIntensity: 0.1 }));
    for (let i = 0; i < 8; i++) { const w = (i + 0.5) / 8 * Math.PI * 2; if (Math.abs(Math.sin(w)) < 0.2) continue; const s = new T.Mesh(stein, mS); s.position.set(Math.sin(w) * 0.895, Math.cos(w) * 0.895, 0.15); gruppe.add(s); }
  }
  if (A.krone) {
    const form = new T.Shape(); form.moveTo(-0.17, 0); form.lineTo(-0.2, 0.15); form.lineTo(-0.09, 0.06); form.lineTo(0, 0.2); form.lineTo(0.09, 0.06); form.lineTo(0.2, 0.15); form.lineTo(0.17, 0); form.closePath();
    const k = new T.Mesh(merke(new T.ExtrudeGeometry(form, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 })), mFigur); k.position.set(-0.05, 0.56, 0.08); k.scale.setScalar(0.28); gruppe.add(k);
  }

  // Öse und Band
  const oese = new T.Mesh(merke(new T.TorusGeometry(0.13, 0.03, 16, 48)), mRand); oese.position.y = 1.1; gruppe.add(oese);
  const bandC = leinwand(256, 256, (x, b, h) => { x.fillStyle = A.band[0]; x.fillRect(0, 0, b, h); x.fillStyle = A.band[1]; x.fillRect(b * 0.36, 0, b * 0.28, h); x.fillRect(b * 0.08, 0, b * 0.06, h); x.fillRect(b * 0.86, 0, b * 0.06, h); });
  const bandT = tex(bandC);
  const bandGeo = merke(new T.PlaneGeometry(0.66, 0.98, 8, 12));
  const pos = bandGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), x = pos.getX(i); pos.setX(i, x * (0.72 + 0.28 * (y + 0.49) / 0.98)); pos.setZ(i, Math.sin((y + 0.49) * 3.2) * 0.03 - 0.02); } bandGeo.computeVertexNormals();
  const band = new T.Mesh(bandGeo, merke(new T.MeshStandardMaterial({ map: bandT, roughness: 0.55, metalness: 0.15, side: T.DoubleSide }))); band.position.y = 1.68; gruppe.add(band);
  const spange = new T.Mesh(merke(new T.BoxGeometry(0.8, 0.13, 0.08)), mRand); spange.position.y = 2.2; gruppe.add(spange);

  // Licht aus dem Raum: helle Flächen, die sich im Metall spiegeln
  const env = new T.Scene(); env.background = new T.Color(0x07080c);
  const flaeche = (b, h, farbe, st, x, y, z) => { const m = new T.Mesh(merke(new T.PlaneGeometry(b, h)), merke(new T.MeshBasicMaterial({ color: new T.Color(farbe).multiplyScalar(st), side: T.DoubleSide }))); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
  flaeche(8, 3, 0xffffff, 12, 0, 7, 3); flaeche(3, 9, 0xfff0d8, 9, -7, 1, 4); flaeche(3, 9, 0xdfe8ff, 7, 7, 0, 4); flaeche(10, 2, 0xffffff, 5, 0, -6, 4); flaeche(5, 5, 0xffd9a0, 3, 0, 1, -8); flaeche(1.2, 8, 0xffffff, 16, 3.5, 2, 8);
  const pm = new T.PMREMGenerator(renderer), rt = pm.fromScene(env, 0.025); pm.dispose();
  return { gruppe, umgebung: rt.texture, entsorgen() { weg.forEach((x) => x.dispose && x.dispose()); rt.dispose(); } };
}

// Zeigt die Medaille groß über allem. Drehen mit dem Finger. opt: { h, lade3d, nr, titel, ab, neu, wappen }
export async function zeigen(opt) {
  const { h, lade3d, nr, titel, ab, neu } = opt;
  if (!ART[nr]) return;
  const alt = document.querySelector('.med'); if (alt) alt.remove();
  const bild = h('canvas', { class: 'med-bild', role: 'img', 'aria-label': 'Medaille ' + titel + ' in 3D, mit dem Finger drehen' });
  let zu = () => {};
  const weiter = h('button', { class: 'knopf haupt med-zu', type: 'button', onclick: () => zu(), text: neu ? 'Weiter' : 'Schließen' });
  const hinweis = h('p', { class: 'med-hinweis', text: 'Mit dem Finger drehen' });
  const wurzel = h('div', { class: 'med', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Medaille ' + titel },
    h('div', { class: 'rang-strahlen', 'aria-hidden': 'true' }), bild,
    h('div', { class: 'med-kopf' }, h('small', { text: neu ? 'Neuer Rang' : 'Rang ' + nr + ' · ' + ART[nr].name }), h('h1', { text: titel })),
    h('div', { class: 'med-fuss' }, hinweis, weiter));
  document.body.append(wurzel);
  let lauf = true, renderer = null, teile = null, uhr = 0;
  zu = () => {
    if (!lauf) return; lauf = false; cancelAnimationFrame(uhr);
    try { if (teile) teile.entsorgen(); if (renderer) { renderer.dispose(); if (renderer.forceContextLoss) renderer.forceContextLoss(); } } catch (e) { /* nichts */ }
    wurzel.remove();
    if (opt.beiZu) opt.beiZu();
  };
  let T, R = null;
  try { T = (await lade3d()).THREE; R = await ladeRelief().catch(() => null); } catch (e) { hinweis.textContent = 'Die 3D-Medaille lädt gerade nicht. Später nochmal öffnen.'; return { zu }; }
  if (!lauf) return;
  try {
    renderer = new T.WebGLRenderer({ canvas: bild, antialias: true, alpha: true });
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
    const szene = new T.Scene(), kamera = new T.PerspectiveCamera(30, 1, 0.1, 40);
    teile = baue(T, renderer, nr, titel, ab, R);
    szene.environment = teile.umgebung;
    const licht = new T.DirectionalLight(0xffffff, 1.6); licht.position.set(2, 3, 5); szene.add(licht);
    szene.add(teile.gruppe);
    const passe = () => {
      const b = bild.clientWidth || 1, h2 = bild.clientHeight || 1;
      renderer.setSize(b, h2, false); kamera.aspect = b / h2;
      const sichtHoehe = Math.max(4.6, 2.5 / kamera.aspect), z = sichtHoehe / 2 / Math.tan(kamera.fov * Math.PI / 360);   // die Medaille füllt die Breite des Handys
      kamera.position.set(0, 0, z); kamera.updateProjectionMatrix();
    };
    passe();
    window.addEventListener('resize', passe);
    const altZu = zu; zu = () => { window.removeEventListener('resize', passe); altZu(); };

    // Drehen: Finger gibt den Winkel vor, danach läuft es aus; wer nichts tut, sieht sie langsam kreisen
    const d = { y: 0, x: 0, vy: 0, id: null, lx: 0, ly: 0, beruehrt: false };
    bild.addEventListener('pointerdown', (e) => { d.id = e.pointerId; d.lx = e.clientX; d.ly = e.clientY; d.vy = 0; d.beruehrt = true; hinweis.classList.add('weg'); try { bild.setPointerCapture(e.pointerId); } catch (x) { /* nichts */ } });
    bild.addEventListener('pointermove', (e) => { if (e.pointerId !== d.id) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; d.y += dx * 0.012; d.vy = dx * 0.012; d.x = Math.max(-0.55, Math.min(0.55, d.x + dy * 0.008)); });
    const los = (e) => { if (e.pointerId === d.id) d.id = null; };
    bild.addEventListener('pointerup', los); bild.addEventListener('pointercancel', los);

    const dauerEin = STILL ? 0 : neu ? 1.7 : 0.9, start = performance.now(); let vorher = start;
    const bildBauen = (jetzt) => {
      if (!lauf) return;
      uhr = requestAnimationFrame(bildBauen);
      const dt = Math.min(0.05, (jetzt - vorher) / 1000), t = (jetzt - start) / 1000; vorher = jetzt;
      if (d.id == null) { d.y += d.vy; d.vy *= Math.pow(0.04, dt); if (!STILL && Math.abs(d.vy) < 0.002) d.y += dt * 0.55; }
      const u = dauerEin ? Math.min(1, t / dauerEin) : 1, e = 1 - Math.pow(1 - u, 3);
      teile.gruppe.rotation.y = d.y + (1 - e) * Math.PI * (neu ? 6 : 2);
      teile.gruppe.rotation.x = d.x;
      teile.gruppe.scale.setScalar(0.3 + 0.7 * e);
      teile.gruppe.position.y = -0.3 + (STILL ? 0 : Math.sin(t * 1.2) * 0.025);
      renderer.render(szene, kamera);
    };
    uhr = requestAnimationFrame(bildBauen);
    if (navigator.vibrate && neu) { try { navigator.vibrate([20, 60, 40]); } catch (e) { /* nichts */ } }
  } catch (e) { hinweis.textContent = 'Die 3D-Medaille lädt gerade nicht. Später nochmal öffnen.'; }
  return { zu: () => zu() };
}
