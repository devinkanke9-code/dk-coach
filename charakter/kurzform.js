// DK Coach — der fertige Charakter als kleiner Datensatz: nur Zahlen und Farben, kein Foto. So kommt er in den Link zum Kunden, der Kunde bearbeitet nichts.
const REGLER = ['schulter', 'brust', 'taille', 'arm', 'bein', 'kopf', 'beinl', 'huefte', 'hals'], GESICHT = ['breite', 'kiefer', 'kinn', 'wangen', 'stirn', 'augenAbstand', 'augenGroesse', 'brauen', 'nase', 'naseBreite', 'mundBreite', 'lippen'];
const ZAHLEN = ['e-groesse', 'e-gewicht', 'e-fett', 'e-jahre', 'e-training', 'e-essen', 'h-laenge', 't-relief', ...REGLER.map((n) => 't-' + n), ...GESICHT.map((n) => 'g-' + n)], FARBEN = ['c-haut', 'c-haar', 'c-brauen', 'c-augen', 'c-shirt', 'c-hose', 'c-socke', 'c-schuh'];
const STANDARD = { 'e-groesse': '175', 'e-gewicht': '50', 'e-fett': '', 'e-jahre': '0.5', 'e-training': '92', 'e-essen': '87', 'h-laenge': '6', 'e-geschlecht': 'm', 'c-haut': '#d6a27c', 'c-haar': '#5a4028', 'c-brauen': '#3a2a1c', 'c-augen': '#5a3a22', 'c-shirt': '#7c8086', 'c-hose': '#1b1c20', 'c-socke': '#f3f3f1', 'c-schuh': '#dcdedf' };
const R_SCHLUESSEL = { breit: ['schulter', 'aussen', 'taille', 'huefte', 'hueftG', 'arm', 'bein', 'brust', 'hals'], tiefe: ['brust', 'taille', 'huefte'], lang: ['rumpf', 'oberarm', 'unterarm', 'oberschenkel', 'unterschenkel'] };
const OBEN = ['ohne', 'tank', 'tshirt', 'langarm'], UNTEN = ['kurz', 'lang'];   // alte Links hatten an erster Stelle das Tanktop, das damals der Standard war: Standard ist jetzt oben ohne
const flach = (r) => [r.hoehe, r.kopf, ...R_SCHLUESSEL.breit.map((k) => r.breit[k]), ...R_SCHLUESSEL.tiefe.map((k) => r.tiefe[k]), ...R_SCHLUESSEL.lang.map((k) => r.lang[k])].map((v) => Math.round((v == null ? 1 : v) * 1000));
function ausFlach(a) { let i = 2; const r = { hoehe: a[0] / 1000, kopf: a[1] / 1000, breit: {}, tiefe: {}, lang: {} }; for (const g of ['breit', 'tiefe', 'lang']) for (const k of R_SCHLUESSEL[g]) r[g][k] = a[i++] / 1000; return r; }
// d: der Stand aus dem Editor; kopf: die Kurzform aus charakter.js
export function packen(d, kopf, name) {
  const f = d.felder, z = ZAHLEN.map((id) => (f[id] === '' || f[id] == null ? null : +f[id]));
  while (z.length && z[z.length - 1] === 0) z.pop();
  const o = { v: 1, z, c: FARBEN.map((id) => String(f[id] || STANDARD[id]).slice(1)).join(''), a: [OBEN.indexOf(d.oben || 'ohne'), UNTEN.indexOf(d.unten || 'kurz'), d.muetze === false ? 0 : 1, d.farbenGesetzt ? 1 : 0] };
  if (name) o.n = name;
  if (f['e-geschlecht'] === 'w') o.w = 1;
  if (kopf) o.k = kopf;
  if (d.rFoto) { o.r = flach(d.rFoto); o.d = [d.dFoto.groesse, +d.dFoto.gewicht.toFixed(1), +d.dFoto.fett.toFixed(1)]; }
  if (d.herkunft) o.h = d.herkunft;
  if (d.monate && d.monate.length) o.m = d.monate.slice(-12).map((m) => [m.monat, m.gewicht, m.fett, m.fettfrei]);
  if (d.gesetzt && d.gesetzt.training) o.gt = 1;
  if (d.gesetzt && d.gesetzt.essen) o.ge = 1;
  return o;
}
// Zurück in die Form, die die Seite versteht. Ohne Daten: die Startfigur
export function auspacken(o) {
  const felder = { ...STANDARD };
  for (const id of ZAHLEN) if (felder[id] == null) felder[id] = '0';
  if (!o) return { felder, leer: true, name: '', muetze: true, oben: 'ohne', unten: 'kurz', farbenGesetzt: false, herkunft: '', rFoto: null, dFoto: null, kopf: null, monate: [], gesetzt: {} };
  (o.z || []).forEach((v, i) => { felder[ZAHLEN[i]] = v == null ? '' : String(v); });
  FARBEN.forEach((id, i) => { felder[id] = '#' + String(o.c).substr(i * 6, 6); });
  if (o.w) felder['e-geschlecht'] = 'w';
  const a = o.a || [0, 0, 1, 0], d = { v: 13, felder, name: o.n || '', muetze: !!a[2], oben: OBEN[a[0]] || 'ohne', unten: UNTEN[a[1]] || 'kurz', farbenGesetzt: !!a[3], herkunft: o.h || '', rFoto: null, dFoto: null, kopf: null, monate: (o.m || []).map((m) => ({ monat: m[0], gewicht: m[1], fett: m[2], fettfrei: m[3] })), gesetzt: { training: !!o.gt, essen: !!o.ge } };
  if (o.r) { d.rFoto = ausFlach(o.r); d.dFoto = { groesse: o.d[0], gewicht: o.d[1], fett: o.d[2] }; }
  if (o.k) d.kopf = { ...o.k, regler: Object.fromEntries(GESICHT.map((n) => [n, (+felder['g-' + n] || 0) / 100])) };
  return d;
}
const zuB64 = (b) => { let t = ''; for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const ausB64 = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
const strom = (b, Art) => new Response(new Blob([b]).stream().pipeThrough(new Art('deflate-raw'))).arrayBuffer().then((x) => new Uint8Array(x));
export const zuText = async (o) => zuB64(await strom(new TextEncoder().encode(JSON.stringify(o)), CompressionStream));
export const ausText = async (t) => JSON.parse(new TextDecoder().decode(await strom(ausB64(t), DecompressionStream)));
