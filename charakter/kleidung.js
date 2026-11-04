// DK Coach — Kleidung des Charakters: oben ohne (Devin, 3.11.: „ohne T-Shirt … nur mit Bauchmuskeln“), Tanktop, T-Shirt oder Langarm, Shorts oder lange Hose. Die lockeren Hüllen für Tanktop und Shorts bleiben. Was darüber hinausgeht (Ärmel, Schulter, Halsbereich, Hosenbein) liegt pro Bildpunkt auf der Haut,
// mit demselben Stoff und einigen Millimetern Dicke. Die Masken rechnen in der Ruhelage (T-Pose, Meter), darum passen sie zu jeder Körperform und Haltung
const UNI = { uDkAermel: { value: 0 }, uDkLang: { value: 0 }, uDkOhne: { value: 0 }, uDkFalte: { value: 0 } };
const ENDE = { tank: 0, tshirt: 0.375, langarm: 0.745 };

const MASKEN = `
uniform float uDkAermel;
uniform float uDkLang;
uniform float uDkOhne;
uniform float uDkFalte;
// Oben ohne sieht man die Oberkante der Hose: vorn unter dem Nabel, an den Seiten über dem Hüftknochen, hinten etwas höher (wie bundOben in koerperform.js)
float dkBundOben(vec3 p) { float v = smoothstep(-0.07, 0.05, p.z); return mix(1.088, 1.04 + 0.62 * p.x * p.x, v); }
float dkAusschnitt(vec3 p) {
  float ax = abs(p.x);
  return mix(1.513 + 5.0 * ax * ax, 1.487 + 5.5 * ax * ax, smoothstep(-0.03, 0.03, p.z)) - p.y;
}
float dkOberteil(vec3 p) {
  if (uDkAermel <= 0.0 || p.y < 0.94 || p.y > 1.62) return 0.0;
  return smoothstep(0.952, 0.958, p.y) * smoothstep(-0.002, 0.002, dkAusschnitt(p)) * (1.0 - smoothstep(uDkAermel - 0.002, uDkAermel + 0.002, abs(p.x)));
}
float dkLangBein(vec3 p) {
  if (uDkLang <= 0.0 || abs(p.x) > 0.215 || p.y > 0.82) return 0.0;
  return smoothstep(0.118, 0.122, p.y);
}
`;
// Haut wölbt sich unter dem Stoff: oben eng, das Hosenbein fällt zum Knöchel gerade
const DICKE = `
#ifdef USE_NORMALMAP_TANGENTSPACE
{
  float dkOd = uDkAermel > 0.0 && position.y > 0.94 && position.y < 1.62 ? smoothstep(0.0, 0.006, dkAusschnitt(position)) * (1.0 - smoothstep(uDkAermel - 0.015, uDkAermel + 0.002, abs(position.x))) : 0.0;
  float dkBd = uDkLang > 0.0 && abs(position.x) <= 0.215 && position.y <= 0.82 ? smoothstep(0.11, 0.125, position.y) : 0.0;
  float dkOb2 = uDkOhne > 0.5 && abs(position.x) <= 0.235 && position.y > 0.6 ? 1.0 - smoothstep(dkBundOben(position) - 0.008, dkBundOben(position) - 0.001, position.y) : 0.0;
  transformed += normal * (dkOd * 0.0028 + dkBd * (mix(0.018, 0.013, smoothstep(0.13, 0.36, position.y)) + 0.009 * smoothstep(0.4, 0.6, position.y)) + dkOb2 * mix(0.0048, 0.0032, smoothstep(0.93, 1.0, position.y)));
}
#endif
`;
const STOFF_OBEN = `
if (uDkOhne > 0.5) {
  float dkBo = dkBundOben(vRuhe) - vRuhe.y;
  if (dkBund > 0.0) {
    vec4 dkK5 = dkKachel(vRuhe, 19.0);
    float dkW5 = atan(vRuhe.x, vRuhe.z + 0.02), dkGu = 1.0 - smoothstep(0.0335, 0.0348, dkBo), dkRp = 0.5 + 0.5 * sin(dkW5 * 118.0);
    float dkNt5 = max(max(dkLinie(dkBo - 0.0028, 0.0006), dkLinie(dkBo - 0.0312, 0.0006)), dkLinie(dkBo - 0.0352, 0.0007));
    float dkFa = (1.0 - smoothstep(0.03, 0.12, dkBo)) * sin(dkW5 * 19.0 + 3.0 * sin(dkW5 * 7.0));
    vec3 dkC5 = uHose * (1.0 + 0.5 * (dkK5.a - 0.5)) * (1.0 + 0.3 * (dkK5.b - 0.5));
    dkC5 = mix(dkC5, uHose * (1.08 + 0.34 * dkRp) * (1.0 + 0.2 * (dkK5.a - 0.5)), dkGu);
    dkC5 *= (1.0 - 0.5 * dkNt5) * (1.0 + 0.06 * dkFa * (1.0 - dkGu));
    float dkH5 = 0.00024 * dkRp * dkGu + 0.0009 * dkGu - 0.0004 * dkNt5 + 0.00028 * dkFa * (1.0 - dkGu) + 0.00018 * (dkK5.b - 0.5) * (1.0 - dkGu);
    // Kordel: zwei Enden aus dem Bund, vorn in der Mitte
    if (vRuhe.z > 0.0 && abs(vRuhe.x) < 0.04 && dkBo > 0.0 && dkBo < 0.11) {
      vec2 dkQ = vec2(abs(vRuhe.x), dkBo);
      float dkD = 1.0, dkT = 0.0;
      vec2 dkP0 = vec2(0.009, 0.0165), dkP1 = vec2(0.0135, 0.04), dkP2 = vec2(0.0145 + 0.0015 * sign(vRuhe.x), 0.066), dkP3 = vec2(0.0125 + 0.004 * sign(vRuhe.x), 0.092);
      for (int dkI = 0; dkI < 3; dkI++) {
        vec2 dkA = dkI == 0 ? dkP0 : dkI == 1 ? dkP1 : dkP2, dkB = dkI == 0 ? dkP1 : dkI == 1 ? dkP2 : dkP3, dkE = dkB - dkA;
        float dkU = clamp(dot(dkQ - dkA, dkE) / dot(dkE, dkE), 0.0, 1.0), dkL = length(dkQ - dkA - dkE * dkU);
        if (dkL < dkD) { dkD = dkL; dkT = (float(dkI) + dkU) / 3.0; }
      }
      float dkRad = 0.0015, dkKo = 1.0 - smoothstep(dkRad - 0.0004, dkRad + 0.0004, dkD), dkSp = (1.0 - smoothstep(dkRad, dkRad + 0.0034, dkD)) * 0.45;
      float dkEnde = smoothstep(0.86, 0.88, dkT), dkMu = 0.5 + 0.5 * sin((dkQ.x * 2.0 + dkQ.y * 3.0) * 900.0);
      dkC5 *= 1.0 - dkSp * (1.0 - dkKo);
      dkC5 = mix(dkC5, mix(vec3(0.6, 0.6, 0.585) * (0.82 + 0.18 * dkMu), vec3(0.11), dkEnde), dkKo);
      dkH5 += dkKo * 0.0014 * sqrt(max(0.0, 1.0 - dkD * dkD / (dkRad * dkRad))) * (1.0 + 0.1 * dkMu);
      float dkOe = 1.0 - smoothstep(0.0024, 0.003, length(dkQ - dkP0));
      dkC5 = mix(dkC5, vec3(0.06), dkOe * (1.0 - dkKo));
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, dkC5, dkBund);
    dkStoffH += dkBund * dkH5;
  }
  // Brustwarzen und Nabel: immer da, egal wie viel Zeichnung die Haut gerade zeigt
  if (vRuhe.z > 0.02 && dkBund < 0.5) {
    float dkWd = length(vec2(abs(vRuhe.x) - 0.115, (vRuhe.y - 1.405) * 1.04));
    if (dkWd < 0.03) {
      float dkAr = 1.0 - smoothstep(0.0118, 0.0148, dkWd), dkWa = exp(-(dkWd * dkWd) / (0.0044 * 0.0044)), dkKoe = 0.8 + 0.2 * dkKachel(vRuhe, 38.0).a;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.72, 0.56, 0.53) * dkKoe, dkAr);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.68, 0.66), dkWa);
      dkStoffH += 0.0003 * dkAr + 0.0014 * dkWa;
    }
    vec2 dkNq = vec2(vRuhe.x / 0.0064, (vRuhe.y - 1.106) / 0.0076);
    float dkNd = dot(dkNq, dkNq);
    if (dkNd < 12.0) {
      float dkNa = exp(-dkNd * 1.05);
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.56, 0.42, 0.39), dkNa);
      dkStoffH += -0.0026 * exp(-dkNd * 1.15) + 0.00035 * exp(-(sqrt(dkNd) - 1.8) * (sqrt(dkNd) - 1.8) * 2.2);
    }
  }
  // Falten bei viel Fett: unter der Brust, seitlich über der Hüfte, hinten über dem Bund
  if (uDkFalte > 0.0 && dkBund < 0.5) {
    float dkAx = abs(vRuhe.x), dkFb = 0.0, dkFh = 0.0;
    if (vRuhe.z > 0.0 && dkAx < 0.2) { float dkLi = vRuhe.y - (1.33 + 0.9 * (dkAx - 0.105) * (dkAx - 0.105)); dkFb = exp(-dkLi * dkLi / (0.015 * 0.015)) * smoothstep(0.035, 0.075, dkAx) * (1.0 - smoothstep(0.15, 0.2, dkAx)); }
    if (dkAx > 0.06 && dkAx < 0.24) { float dkTh = atan(dkAx / 0.15, (vRuhe.z + 0.005) / 0.11), dkLi = vRuhe.y - (1.135 + 0.03 * dkTh); dkFh = exp(-dkLi * dkLi / (0.014 * 0.014)) * smoothstep(1.2, 1.5, dkTh) * (1.0 - smoothstep(2.7, 3.0, dkTh)); }
    float dkFa2 = dkFb * smoothstep(0.1, 0.8, uDkFalte) + dkFh * smoothstep(0.3, 1.1, uDkFalte);
    if (dkFa2 > 0.001) { diffuseColor.rgb *= 1.0 - 0.1 * dkFa2; dkStoffH -= 0.0014 * dkFa2; }
  }
  // Der Bund drückt: schmaler Schatten auf der Haut darüber
  if (dkBo < 0.0 && dkBo > -0.05 && abs(vRuhe.x) < 0.25) diffuseColor.rgb *= 1.0 - 0.3 * exp(dkBo / 0.0028) - 0.11 * exp(dkBo / 0.012);
}
{
  float dkOb = dkOberteil(vRuhe) * (1.0 - dkBund);
  if (dkOb > 0.0) {
    vec4 dkK2 = mix(dkKachel(vRuhe, 12.0), mix(texture2D(uDetail, vRuhe.yx * 12.0), texture2D(uDetail, vRuhe.zx * 12.0), smoothstep(0.35, 0.65, abs(vRN.y))), smoothstep(0.2, 0.25, abs(vRuhe.x)));
    float dkHs = dkAusschnitt(vRuhe), dkAs = uDkAermel - abs(vRuhe.x);
    float dkBandH = 1.0 - smoothstep(0.0115, 0.0128, dkHs), dkBandA = 1.0 - smoothstep(0.0165, 0.0178, dkAs);
    float dkNt = max(dkLinie(dkHs - 0.0132, 0.0007), dkLinie(dkAs - 0.0182, 0.0007));
    vec3 dkC2 = uOberteil * (1.0 + 0.26 * (dkK2.a - 0.5)) * (1.0 + 0.1 * (dkK2.b - 0.5) * (1.0 - dkBandH)) * (1.0 + 0.05 * dkBandH) * (1.0 - 0.09 * dkBandA) * (1.0 - 0.17 * dkNt);
    dkC2 *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.0022, min(dkHs, dkAs)));
    diffuseColor.rgb = mix(diffuseColor.rgb, dkC2, dkOb);
    dkStoffH = dkOb * (0.00028 * (dkK2.b - 0.5) * (1.0 - 0.8 * dkBandH) + 0.00055 * dkBandH + 0.00055 * dkBandA - 0.00045 * dkNt);
  }
  float dkTk = dkTanktop(vRuhe) * (1.0 - dkBund) * (1.0 - dkOb) * (1.0 - uDkOhne);
  if (dkTk > 0.0) {
    vec4 dkK4 = dkKachel(vRuhe, 12.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, uOberteil * (1.0 + 0.26 * (dkK4.a - 0.5)) * (1.0 + 0.1 * (dkK4.b - 0.5)), dkTk);
  }
  float dkLb = dkLangBein(vRuhe);
  if (dkLb > 0.0) {
    vec4 dkK3 = dkKachel(vRuhe, 19.0);
    float dkS3 = vRuhe.y - 0.12, dkSaum3 = 1.0 - smoothstep(0.0195, 0.0208, dkS3), dkNt3 = max(dkLinie(dkS3 - 0.0212, 0.0007), dkLinie(dkS3 - 0.0165, 0.0006));
    vec3 dkC3 = uHose * (1.0 + 0.5 * (dkK3.a - 0.5)) * (1.0 + 0.3 * (dkK3.b - 0.5)) * (1.0 + 0.18 * dkSaum3) * (1.0 - 0.5 * dkNt3);
    float dkW3 = atan(abs(vRuhe.x) - 0.11, vRuhe.z + 0.025);
    if (uLogoAn > 0.5 && vRuhe.x > 0.0) {
      vec2 dkLu = vec2((dkW3 - 0.98) * 0.1 / 0.052 + 0.5, (vRuhe.y - 0.695) / 0.052 + 0.5);
      if (all(greaterThan(dkLu, vec2(0.0))) && all(lessThan(dkLu, vec2(1.0)))) dkC3 = mix(dkC3, vec3(0.62), texture2D(uLogo, dkLu).a * 0.9);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, dkC3, dkLb);
    dkStoffH = dkLb * (0.00018 * (dkK3.b - 0.5) + 0.0005 * dkSaum3 - 0.0004 * dkNt3 + 0.0016 * (1.0 - smoothstep(0.2, 0.6, vRuhe.y)) * sin(5.0 * dkW3 + 1.6 * sin(2.0 * dkW3 + vRuhe.y * 12.0) + vRuhe.y * 6.0));
  }
}
`;
function ersetze(t, a, b) { if (!t.includes(a)) throw new Error('Kleidung: Stelle fehlt: ' + a.slice(0, 50)); return t.replace(a, () => b); }
function patche(mat, name, f) {
  const alt = mat.onBeforeCompile, vorher = mat.customProgramCacheKey.call(mat);
  mat.onBeforeCompile = (s, r) => {
    if (alt) alt.call(mat, s, r);
    Object.assign(s.uniforms, UNI);
    s.vertexShader = ersetze(s.vertexShader, '#include <common>', '#include <common>\n' + MASKEN);
    s.fragmentShader = ersetze(s.fragmentShader, '#include <common>', '#include <common>\n' + MASKEN);
    f(s);
  };
  mat.customProgramCacheKey = () => vorher + '|kleidung-' + name;
  mat.needsUpdate = true;
}
export function vorbereiten(figur) {
  if (figur.kleidungBereit) return;
  figur.kleidungBereit = true;
  patche(figur.koerperMesh.material, 'haut', (s) => {
    s.vertexShader = ersetze(s.vertexShader, '#include <skinning_vertex>', DICKE + '#include <skinning_vertex>');
    let t = s.fragmentShader;
    t = ersetze(t, '1.0 - smoothstep(1.03, 1.04, vRuhe.y)', 'mix(1.0 - smoothstep(0.958, 0.964, vRuhe.y), 1.0 - smoothstep(-0.0009, 0.0009, vRuhe.y - dkBundOben(vRuhe)), uDkOhne)');
    t = ersetze(t, 'float dkHose = max(max(vKleid.x, dkHosenbein(vRuhe)), dkBund);', 'float dkHose = max(max(max(vKleid.x * (1.0 - uDkOhne), dkHosenbein(vRuhe)), dkBund), dkLangBein(vRuhe));');
    t = ersetze(t, 'float dkTop = dkTanktop(vRuhe) * (1.0 - dkBund);', 'float dkTop = max(dkTanktop(vRuhe) * (1.0 - uDkOhne), dkOberteil(vRuhe)) * (1.0 - dkBund);');
    t = ersetze(t, 'float dkSock = dkSocke(vRuhe);', 'float dkSock = dkSocke(vRuhe) * (1.0 - dkLangBein(vRuhe));');
    t = ersetze(t, 'diffuseColor.rgb = mix(diffuseColor.rgb, uOberteil, dkTop);', 'diffuseColor.rgb = mix(diffuseColor.rgb, uOberteil, dkTop);\n' + STOFF_OBEN);
    t = ersetze(t, 'material.sheenColor *= 1.0 - dkHose;', 'material.sheenColor *= (1.0 - dkHose) * (1.0 - dkTop);\nmaterial.sheenColor += dkTop * (uOberteil * 0.8 + vec3(0.2)) * 0.35 + max(dkLangBein(vRuhe), dkBund * uDkOhne) * (uHose * 0.8 + vec3(0.2)) * 0.6;\nmaterial.sheenRoughness = mix(material.sheenRoughness, 0.65, dkStoff);\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - dkStoff;\n#endif');
    s.fragmentShader = t;
  });
  for (const m of figur.meshes) {
    if (!(m.material.defines && m.material.defines.DK_STOFF === 2)) continue;
    const g = m.geometry, P = g.attributes.position, E = g.attributes.eng, R = g.attributes.ruhe, st = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
    if (P.dkAngelegt) continue;   // gemeinsame Daten des Körpers: nur einmal, auch wenn es eine zweite Figur gibt (Gym)
    P.dkAngelegt = true;
    for (let i = 0; i < P.count; i++) { const q = st(1.0, 0.86, R.getY(i)); P.setXYZ(i, E.getX(i) + (P.getX(i) - E.getX(i)) * q, E.getY(i) + (P.getY(i) - E.getY(i)) * q, E.getZ(i) + (P.getZ(i) - E.getZ(i)) * q); }
    P.needsUpdate = true; g.computeVertexNormals();
  }
  // Hüllen: die Kanten des Tanktops und der Saum der Shorts verschwinden, sobald der Stoff dort weitergeht
  for (const m of figur.meshes) {
    const art = m.material.defines && m.material.defines.DK_STOFF;
    if (art === 1) patche(m.material, 'top', (s) => { s.fragmentShader = ersetze(s.fragmentShader, 'float dkR = dkRandTop(vRuhe), dkS = vH.y - 0.955;', 'float dkR = dkRandTop(vRuhe) + (uDkAermel > 0.0 ? 1.0 : 0.0), dkS = vH.y - 0.955;'); });
    if (art === 2) patche(m.material, 'hose', (s) => {
      s.fragmentShader = ersetze(s.fragmentShader, 'vH.y > 0.935', 'vH.y > mix(0.935, 0.985, uDkOhne)');
      s.fragmentShader = ersetze(s.fragmentShader, 'float dkBund = smoothstep(0.972, 0.976, vH.y);', 'float dkBund = smoothstep(0.972, 0.976, vH.y) * (1.0 - uDkOhne);');
      s.fragmentShader = ersetze(s.fragmentShader, 'dkS = vH.y - 0.6;', 'dkS = vH.y - 0.6 + uDkLang;');
      s.fragmentShader = ersetze(s.fragmentShader, 'if (vH.y < 0.6 ||', 'if (vH.y < 0.6 + 0.14 * uDkLang ||');
      s.vertexShader = ersetze(s.vertexShader, '#include <skinning_vertex>', 'transformed = mix(transformed, dkEng + normal * 0.0195, uDkLang * (1.0 - smoothstep(0.76, 0.92, position.y)));\n#include <skinning_vertex>');
    });
  }
}
export function falten(wert) { UNI.uDkFalte.value = wert; }
export function setze(figur, oben, unten) {
  vorbereiten(figur);
  UNI.uDkAermel.value = ENDE[oben] || 0; UNI.uDkLang.value = unten === 'lang' ? 1 : 0; UNI.uDkOhne.value = oben === 'ohne' ? 1 : 0;
  for (const m of figur.meshes) if (m.material.defines && m.material.defines.DK_STOFF === 1) m.visible = oben !== 'ohne';
  figur.kleidungArt = { oben: oben === 'ohne' || ENDE[oben] ? oben : 'tank', unten: unten === 'lang' ? 'lang' : 'kurz' };
}
