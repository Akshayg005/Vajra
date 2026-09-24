/**
 * Full-screen volumetric cloud renderer (GLSL ES 3.0 through three's WebGL2 prefix).
 * Lighting: Beer-Lambert + powder, dual-lobe Henyey-Greenstein, Wrenninge multiple-scattering octaves,
 * energy-conserving integration (Hillaire 2015), cloud shadows on the surface, aerial perspective, ACES.
 * Shapes: mode 0 = cyclonic vortex with a clear stadium eye and log-spiral rain bands (aerial view);
 *         mode 1 = cumulonimbus (flat base, cauliflower tower tilted downshear, anvil, overshooting top, rain shaft).
 */
export const VOL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const VOL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uFlashPos;
uniform float uTime;
uniform float uMode;
uniform float uIntensity;
uniform float uGrowth;
uniform float uAnvil;
uniform float uEye;
uniform float uFlash;
uniform float uSteps;
uniform float uGround;
varying vec2 vUv;

#define PI 3.14159265
#define MAX_STEPS 224
const float R_OUT = 9.5;

float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
float sat(float v) { return clamp(v, 0.0, 1.0); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// Henyey-Greenstein scaled so that the isotropic phase = 1
float hg(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5); }

const vec3 SUN_COL = vec3(2.35, 2.26, 2.12);
const vec3 SKY_ZEN = vec3(0.20, 0.30, 0.44);
const vec3 SKY_HOR = vec3(0.46, 0.52, 0.58);
const vec3 HAZE = vec3(0.30, 0.36, 0.42);

/* ------------------------------ shapes ------------------------------ */

float topH(float r) {
  float e = uEye;
  float wall = smoothstep(e * 0.78, e * 1.3, r);
  float fall = 1.0 - 0.74 * smoothstep(e * 1.25, R_OUT, r);
  return 0.18 + mix(1.05, 1.75, uIntensity) * wall * fall;
}

// spiral band field in [0,1] (1 = on a rain band)
float bandField(vec3 p, float r) {
  float th = atan(p.z, p.x);
  float sp = th - 1.9 * log(r / uEye + 0.3) + uTime * 0.02;
  float a1 = 0.5 + 0.5 * cos(4.0 * sp);
  float a2 = 0.5 + 0.5 * cos(9.0 * sp + 1.3 + 0.6 * sin(r * 1.7));
  return sat(smoothstep(0.15, 0.9, a1) * 0.8 + a2 * 0.35);
}

// coverage in [0,1] and height fraction for the vortex
float vortexCov(vec3 p, out float hf) {
  float r = length(p.xz);
  float base = 0.14;
  float bands = bandField(p, r);
  float outer = smoothstep(uEye * 1.9, R_OUT * 0.5, r);
  // rain bands tower, the gaps between them hold a lower, thinner deck
  float top = base + (topH(r) - base) * mix(1.0, mix(0.42, 1.0, bands), outer);
  hf = (p.y - base) / max(top - base, 1e-3);
  if (hf < 0.0 || hf > 1.0 || r > R_OUT) return 0.0;
  // stadium effect: the eye widens with height
  float eR = uEye * (0.68 + 0.6 * hf);
  float eye = smoothstep(eR, eR * 1.14, r);
  float cov = mix(1.0, mix(0.5, 1.0, bands), outer);
  cov *= 1.0 - smoothstep(R_OUT * 0.7, R_OUT, r);
  return cov * eye * mix(0.85, 1.0, uIntensity);
}

// soft falloff so the noise, not the primitive, defines the cauliflower edges
float blob(vec3 p, vec3 c, vec3 r) { float l = length((p - c) / (r * 1.3)); return 1.0 - smoothstep(0.05, 1.0, l); }
// soft union: overlapping parts fuse into one mass instead of meeting at seams
float fuse(float a, float b) { return a + b - a * b; }

float cbCov(vec3 p, out float hf) {
  float g = uGrowth;
  float base = 0.42;
  float top = mix(1.8, 3.6, g);
  hf = (p.y - base) / (top - base);
  if (p.y < base - 0.05 || p.y > top + 0.55) return 0.0;
  float cov = 0.0;
  // main updraft: paired cauliflower turrets per level, tilted downshear (+x) with height
  for (int i = 0; i < 6; i++) {
    float k = float(i) / 5.0;
    float y = base + 0.4 + k * (top - base - 0.45);
    float w = mix(1.5, 1.1, k) * mix(0.7, 1.0, g);
    float sx = 0.55 * k * k;
    float ph = float(i) * 2.1;
    cov = fuse(cov, blob(p, vec3(sx + 0.36 * cos(ph), y, 0.36 * sin(ph)), vec3(w, w * 0.9, w)));
    cov = fuse(cov, blob(p, vec3(sx - 0.32 * cos(ph + 0.9), y + 0.18, -0.32 * sin(ph + 0.9)), vec3(w * 0.88, w * 0.85, w * 0.88)));
  }
  // overshooting top, sunk into the anvil over the updraft
  cov = fuse(cov, blob(p, vec3(0.5, top - 0.02, 0.0), vec3(0.85, 0.42, 0.85)) * g);
  // shared base shelf; the younger flanking tower grows out of it against the main tower
  cov = fuse(cov, blob(p, vec3(-0.55, base + 0.34, 0.35), vec3(2.3, 0.5, 1.7)) * 0.9);
  cov = fuse(cov, blob(p, vec3(-1.05, base + 0.62 * g + 0.42, 0.55), vec3(1.05, 0.95 * g + 0.45, 0.95)));
  // anvil: flares out of the tower top, spreads (mostly downwind) and thins toward its edges
  vec2 ac = p.xz - vec2(0.7 + 1.3 * uAnvil, 0.0);
  float ar = length(ac * vec2(1.0 / (1.4 + 2.2 * uAnvil), 1.0 / (1.2 + 1.4 * uAnvil)));
  float thick = mix(0.85, 0.14, sat(ar));
  float flare = smoothstep(top - thick, top - thick + 0.22, p.y) * (1.0 - smoothstep(top + 0.02, top + 0.22, p.y));
  float anvil = flare * (1.0 - smoothstep(0.6, 1.0, ar)) * smoothstep(0.25, 0.45, g);
  // shoulder where the tower spreads into the anvil, so there is no neck between them
  float shoulder = blob(p, vec3(0.75, top - 0.4, 0.0), vec3(1.35, 0.55, 1.15)) * smoothstep(0.25, 0.45, g);
  cov = fuse(cov, fuse(anvil, shoulder));
  // flat, dark base
  cov *= smoothstep(base - 0.04, base + 0.1, p.y);
  return sat(cov);
}

// x = density, y = height fraction
vec2 density(vec3 p, bool detail) {
  float hf;
  float cov = uMode < 0.5 ? vortexCov(p, hf) : cbCov(p, hf);
  float rain = 0.0;
  if (uMode > 0.5 && p.y < 0.5) {
    // rain shaft under the core (dim, streaky)
    float rr = length(p.xz - vec2(0.15, 0.0));
    float sh = texture(uNoise, vec3(p.x * 0.9, p.y * 0.12 + uTime * 0.35, p.z * 0.9)).g;
    rain = smoothstep(0.95, 0.1, rr) * smoothstep(0.0, 0.45, p.y + 0.02) * (0.35 + 0.65 * sh) * 0.1 * uGrowth;
  }
  if (cov < 0.004) return vec2(rain, 0.0);
  vec3 q = p;
  vec3 qd = p;
  float scale;
  if (uMode < 0.5) {
    // differential rotation shears the noise into spiral streaks, faster near the eye
    float r = length(p.xz);
    float a = uTime * 0.22 / (r + 0.7) + 3.2 * log(r + 0.35);
    q.xz = rot(a) * p.xz;
    q.y *= 1.8;
    // detail follows the flow but is sheared far less, so billows stay lumpy
    qd.xz = rot(uTime * 0.22 / (r + 0.7) + 0.9 * log(r + 0.35)) * p.xz;
    scale = 0.5;
  } else {
    q += vec3(-uTime * 0.012, -uTime * 0.03, 0.0);
    qd = q;
    scale = 0.36;
  }
  vec4 lo = texture(uNoise, q * scale);
  float lowFbm = lo.g * 0.625 + lo.b * 0.25 + lo.a * 0.125;
  float baseCloud = remap(lo.r, lowFbm - 1.0, 1.0, 0.0, 1.0);
  // height gradient: flat dark bases, billowing rounded tops
  float grad = uMode < 0.5 ? smoothstep(0.0, 0.12, hf) * smoothstep(1.0, 0.72, hf) : 1.0;
  baseCloud *= grad;
  float c = remap(baseCloud, 1.0 - cov, 1.0, 0.0, 1.0) * cov;
  if (c <= 0.0) return vec2(rain, hf);
  if (detail) {
    vec3 dq = qd * scale * (uMode < 0.5 ? 4.6 : 4.3) + vec3(0.0, uTime * 0.02, 0.0);
    vec4 hi = texture(uNoise, dq);
    float hiFbm = hi.g * 0.625 + hi.b * 0.25 + hi.a * 0.125;
    // wispy at the bottom, billowy at the top
    float hm = mix(hiFbm, 1.0 - hiFbm, sat(hf * 4.0));
    c = remap(c, hm * (uMode < 0.5 ? 0.66 : 0.58), 1.0, 0.0, 1.0);
  }
  return vec2(max(c, 0.0) + rain, hf);
}

/* ------------------------------ lighting ------------------------------ */

float EXT() { return uMode < 0.5 ? 20.0 : 13.0; }

float lightOD(vec3 p) {
  float od = 0.0;
  float st = uMode < 0.5 ? 0.07 : 0.1;
  float dist = 0.0;
  for (int j = 0; j < 6; j++) {
    dist += st;
    od += density(p + uSunDir * dist, j < 3).x * st;
    st *= 1.65;
  }
  return od * EXT() * (uMode < 0.5 ? 1.4 : 1.15);
}

vec3 sunScatter(float od, float cosT) {
  // Wrenninge et al. multiple-scattering approximation
  float a = 1.0, b = 1.0, c = 1.0, s = 0.0;
  for (int k = 0; k < 4; k++) {
    float ph = mix(hg(cosT, 0.72 * c), hg(cosT, -0.22 * c), 0.3);
    s += a * exp(-od * b) * ph;
    a *= 0.46; b *= 0.36; c *= 0.55;
  }
  return SUN_COL * s;
}

vec3 skyCol(vec3 rd) {
  float h = sat(rd.y);
  vec3 col = mix(SKY_HOR, SKY_ZEN, pow(h, 0.55));
  float s = max(dot(rd, uSunDir), 0.0);
  col += vec3(1.0, 0.9, 0.75) * (pow(s, 8.0) * 0.25 + pow(s, 600.0) * 6.0);
  return col;
}

// transmittance toward the sun from a surface point (cloud shadow)
float surfaceShadow(vec3 p) {
  float od = 0.0;
  float st = 0.16;
  float t = 0.02 + st * ign(gl_FragCoord.xy + 17.0);
  for (int j = 0; j < 18; j++) {
    vec3 s = p + uSunDir * t;
    if (s.y > 4.4) break;
    od += density(s, false).x * st;
    t += st;
  }
  return exp(-od * EXT() * 0.75);
}

vec3 surface(vec3 ro, vec3 rd, float tHit, out float dist) {
  vec3 p = ro + rd * tHit;
  dist = tHit;
  float sh = surfaceShadow(p);
  if (uGround < 0.5) {
    // ocean: animated wave normal from the noise volume, Fresnel sky reflection, sun glint
    float s = 1.6;
    float e = 0.02;
    vec3 w = vec3(uTime * 0.03, 0.37, uTime * 0.021);
    float h0 = texture(uNoise, vec3(p.x * s, 0.0, p.z * s) + w).b;
    float hx = texture(uNoise, vec3((p.x + e) * s, 0.0, p.z * s) + w).b;
    float hz = texture(uNoise, vec3(p.x * s, 0.0, (p.z + e) * s) + w).b;
    float h1 = texture(uNoise, vec3(p.x * s * 3.1, 0.2, p.z * s * 3.1) - w * 1.7).a;
    float wk = exp(-tHit * 0.09);
    vec3 n = normalize(vec3((-(hx - h0) / e * 0.012 - (h1 - 0.5) * 0.05) * wk, 1.0, (-(hz - h0) / e * 0.012) * wk));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 refl = skyCol(reflect(rd, n)) * mix(0.3, 0.8, sh);
    float r = length(p.xz);
    // steel-grey sea; turquoise only where sunlight reaches the water inside the eye
    float eyeWater = uMode < 0.5 ? 1.0 - smoothstep(uEye * 0.8, uEye * 1.3, r) : 0.0;
    vec3 water = mix(vec3(0.010, 0.022, 0.032), mix(vec3(0.02, 0.05, 0.065), vec3(0.02, 0.2, 0.2), eyeWater), sh);
    float spec = pow(max(dot(reflect(rd, n), uSunDir), 0.0), 220.0) * 5.0 * sh;
    // whitecaps where the wind is strongest (under the eyewall)
    float foam = uMode < 0.5 ? smoothstep(0.7, 0.9, h0) * smoothstep(R_OUT * 0.9, uEye, r) * 0.12 : 0.0;
    return water * (1.0 - fres) + refl * fres + spec * SUN_COL * 0.3 + foam * vec3(0.8, 0.85, 0.9) * (0.3 + 0.7 * sh);
  }
  // land: dark monsoon plains with field texture, lit by the sun through the cloud
  vec4 n = texture(uNoise, vec3(p.x * 0.25, 0.1, p.z * 0.25));
  vec3 alb = mix(vec3(0.05, 0.075, 0.035), vec3(0.11, 0.1, 0.07), n.g) * (0.8 + 0.4 * n.a);
  vec3 lit = alb * (SUN_COL * max(uSunDir.y, 0.0) * sh + SKY_ZEN * 0.9);
  return lit;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
`;

export const VOL_FRAG_MAIN = /* glsl */ `
vec2 boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv;
  vec3 t1 = (bmax - ro) * inv;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 v = uInvProj * vec4(ndc, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  vec3 ro = uCamPos;

  // background: sky or lit surface
  vec3 bg;
  float bgDist = 1e4;
  bool ground = rd.y < -1e-4;
  if (ground) {
    float tg = -ro.y / rd.y;
    bg = surface(ro, rd, tg, bgDist);
  } else {
    bg = skyCol(rd);
  }

  vec3 bmin = uMode < 0.5 ? vec3(-R_OUT, 0.12, -R_OUT) : vec3(-4.6, 0.0, -4.6);
  vec3 bmax = uMode < 0.5 ? vec3(R_OUT, 2.2, R_OUT) : vec3(7.0, 4.6, 4.6);
  vec2 hit = boxHit(ro, rd, bmin, bmax);
  vec3 L = vec3(0.0);
  float T = 1.0;
  float firstHit = -1.0;
  if (hit.x < hit.y && hit.y > 0.0) {
    float t0 = max(hit.x, 0.0);
    float t1 = min(hit.y, bgDist);
    // adaptive march: long strides through clear air, step back and refine on entering cloud
    float dtS = (uMode < 0.5 ? 0.024 : 0.03) * clamp(128.0 / uSteps, 0.6, 1.8);
    float dt = dtS * 3.0;
    float t = t0 + dt * ign(gl_FragCoord.xy);
    float cosT = dot(rd, uSunDir);
    float ext = EXT();
    for (int i = 0; i < MAX_STEPS * 2; i++) {
      if (float(i) >= uSteps * 2.0 || t > t1) break;
      vec3 p = ro + rd * t;
      vec2 dh = density(p, true);
      float d = dh.x;
      if (d > 0.002) {
        if (dt > dtS * 2.0) {
          t -= dt * 0.75;
          dt = dtS;
          continue;
        }
        if (firstHit < 0.0) firstHit = t;
        float sigma = d * ext;
        float od = lightOD(p);
        vec3 sunL = sunScatter(od, cosT);
        // powder effect darkens the sun-facing crevices of dense billows
        float powder = 1.0 - exp(-2.0 * d * ext * 0.12);
        sunL *= mix(1.0, powder, 0.7 * (1.0 - 0.5 * sat(cosT)));
        float hf = sat(dh.y);
        float ao = density(p + vec3(0.0, 0.06, 0.0), false).x + density(p + vec3(0.0, 0.18, 0.0), false).x * 0.8;
        vec3 amb = mix(vec3(0.035, 0.045, 0.06), vec3(0.22, 0.27, 0.33), hf * hf) * exp(-ao * ext * 0.09) * (0.35 + 0.65 * exp(-od * 0.15));
        vec3 S = (sunL + amb) * sigma;
        // lightning lights the cloud from inside (blue-white)
        float fd = length(p - uFlashPos);
        S += vec3(0.75, 0.85, 1.0) * uFlash * 22.0 * exp(-fd * (uMode < 0.5 ? 2.2 : 1.6)) * sigma;
        float tr = exp(-sigma * dt);
        L += T * (S - S * tr) / max(sigma, 1e-4);
        T *= tr;
        if (T < 0.008) break;
      } else {
        dt = min(dt * 1.3, dtS * 5.0);
      }
      t += dt;
    }
  }

  // aerial perspective: cloud and surface each fogged by their own distance (the sky is left as is)
  float fogC = firstHit > 0.0 ? sat(1.0 - exp(-max(firstHit - 8.0, 0.0) * 0.016)) : 0.0;
  L = mix(L, HAZE * (1.0 - T), fogC);
  if (ground) bg = mix(bg, mix(HAZE, SKY_HOR, sat(bgDist / 80.0)), sat(1.0 - exp(-max(bgDist - 8.0, 0.0) * 0.016)));
  if (ground) bgDist = min(bgDist, 1e3);
  vec3 col = L + T * bg;
  col = aces(col * 0.52);
  col = pow(col, vec3(1.0 / 2.2));
  gl_FragColor = vec4(col, 1.0);
}
`;
