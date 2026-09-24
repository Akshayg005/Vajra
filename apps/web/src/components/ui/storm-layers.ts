/**
 * Procedural SVG layers for the parallax storm scene (made for VAJRA; replaces the remote mountain/fog PNGs).
 * Deterministic: shapes come from a small integer hash, so the scene is identical on every load and works offline.
 */
const W = 2400;
const H = 1200;

function h(i: number) {
  let x = (i * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const wrap = (defs: string, body: string, w = W, hgt = H) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}" preserveAspectRatio="none"><defs>${defs}</defs>${body}</svg>`;

/** ridge line: sum of sines + hashed jitter */
function ridge(base: number, amp: number, seed: number, step = 40) {
  let d = `M0 ${H}`;
  for (let x = 0; x <= W; x += step) {
    const y = base - amp * (0.55 * Math.sin(x / 310 + seed) + 0.3 * Math.sin(x / 97 + seed * 2) + 0.35 * (h(seed * 1000 + x) - 0.5));
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return d + ` L${W} ${H} Z`;
}

/** puffy cloud bank from overlapping circles */
function cloudBank(y: number, r: number, count: number, seed: number, fill: string, rim?: string) {
  let s = '';
  for (let i = 0; i < count; i++) {
    const cx = (i / (count - 1)) * W + (h(seed + i) - 0.5) * 120;
    const rr = r * (0.6 + h(seed + i * 7) * 0.8);
    const cy = y - rr * 0.35 + (h(seed + i * 13) - 0.5) * r * 0.5;
    s += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="${fill}"/>`;
    if (rim) s += `<circle cx="${(cx - rr * 0.18).toFixed(0)}" cy="${(cy - rr * 0.22).toFixed(0)}" r="${(rr * 0.82).toFixed(0)}" fill="none" stroke="${rim}" stroke-width="3" opacity="0.35"/>`;
  }
  return s + `<rect x="0" y="${y}" width="${W}" height="${H - y}" fill="${fill}"/>`;
}

export const SKY = uri(
  wrap(
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03060c"/><stop offset=".45" stop-color="#0a1629"/><stop offset=".72" stop-color="#1b2a44"/><stop offset=".86" stop-color="#6b4a2a"/><stop offset="1" stop-color="#c77a0a"/></linearGradient>
     <radialGradient id="g" cx=".72" cy=".78" r=".5"><stop offset="0" stop-color="#f5a524" stop-opacity=".55"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></radialGradient>`,
    `<rect width="${W}" height="${H}" fill="url(#s)"/><rect width="${W}" height="${H}" fill="url(#g)"/>`,
  ),
);

/** a towering cumulonimbus with an anvil, sunlit amber on the right flank */
export const ANVIL = uri(
  wrap(
    `<linearGradient id="c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b1424"/><stop offset=".65" stop-color="#1d2b44"/><stop offset="1" stop-color="#6e5a44"/></linearGradient>
     <filter id="b"><feGaussianBlur stdDeviation="6"/></filter>`,
    `<g filter="url(#b)"><path d="M620 1100 C 640 820, 760 700, 880 560 C 900 420, 980 330, 1040 300 C 900 290, 640 300, 420 270 C 700 200, 1200 160, 1700 190 C 1900 205, 2100 240, 2300 290 C 2050 300, 1700 300, 1420 310 C 1480 360, 1540 460, 1560 600 C 1640 720, 1720 860, 1760 1100 Z" fill="url(#c)"/>
     <ellipse cx="1180" cy="250" rx="160" ry="70" fill="#243451"/></g>
     <path d="M1420 310 C 1480 360, 1540 460, 1560 600 C 1640 720, 1720 860, 1760 1100" fill="none" stroke="#f5a524" stroke-width="6" opacity=".35"/>`,
  ),
);

export const HILLS_FAR = uri(wrap('', `<path d="${ridge(860, 140, 3)}" fill="#0c1a2e"/>`));
export const CLOUDS_MID = uri(wrap(`<filter id="b"><feGaussianBlur stdDeviation="10"/></filter>`, `<g filter="url(#b)" opacity=".85">${cloudBank(780, 120, 18, 21, '#15233a', '#f5a524')}</g>`));
export const HILLS_NEAR = uri(wrap('', `<path d="${ridge(960, 90, 11, 30)}" fill="#08111f"/>`));

/** city skyline: towers, a temple shikhara, a dome with minarets, a transmission pylon */
export const CITY = uri(
  wrap(
    '',
    (() => {
      let s = '';
      let x = 0;
      let i = 0;
      while (x < W) {
        const w = 40 + h(i) * 90;
        const top = 900 - (h(i * 3) * 190 + 30);
        s += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${w.toFixed(0)}" height="${(H - top).toFixed(0)}" fill="#060d18"/>`;
        // lit windows (amber, sparse)
        for (let k = 0; k < 6; k++) if (h(i * 17 + k) > 0.72) s += `<rect x="${(x + 8 + h(i * 5 + k) * (w - 20)).toFixed(0)}" y="${(top + 20 + h(i * 9 + k) * (900 - top - 40)).toFixed(0)}" width="5" height="7" fill="#f5a524" opacity=".7"/>`;
        x += w + 6 + h(i * 11) * 30;
        i++;
      }
      // temple shikhara
      s += `<path d="M560 1200 L560 820 L600 780 L610 700 L640 640 L650 590 L660 640 L690 700 L700 780 L740 820 L740 1200 Z" fill="#050b15"/><rect x="646" y="570" width="8" height="24" fill="#050b15"/>`;
      // dome + minarets
      s += `<path d="M1500 1200 L1500 830 Q1600 700 1700 830 L1700 1200 Z" fill="#050b15"/><rect x="1470" y="700" width="16" height="500" fill="#050b15"/><rect x="1714" y="700" width="16" height="500" fill="#050b15"/><circle cx="1478" cy="700" r="12" fill="#050b15"/><circle cx="1722" cy="700" r="12" fill="#050b15"/>`;
      // transmission pylon
      s += `<path d="M2000 1200 L2040 700 L2080 1200 M2010 1050 L2070 1050 M2020 900 L2060 900 M1990 760 L2090 760 M2040 700 L2040 680" stroke="#050b15" stroke-width="7" fill="none"/>`;
      return s;
    })(),
  ),
);

/** paddy fields + palms in the foreground */
export const FIELDS = uri(
  wrap(
    `<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07101d"/><stop offset="1" stop-color="#02050a"/></linearGradient>`,
    (() => {
      let s = `<path d="M0 1010 Q 600 980 1200 1000 T 2400 995 L2400 1200 L0 1200 Z" fill="url(#f)"/>`;
      for (let k = 0; k < 8; k++) s += `<path d="M0 ${1030 + k * 22} Q 1200 ${1015 + k * 22} 2400 ${1030 + k * 22}" stroke="#0e1a2c" stroke-width="2" fill="none" opacity=".7"/>`;
      for (let i = 0; i < 9; i++) {
        const x = 120 + i * 270 + h(i * 31) * 80;
        const hgt = 200 + h(i * 7) * 120;
        const lean = (h(i * 3) - 0.5) * 60;
        s += `<path d="M${x} 1015 Q ${x + lean * 0.5} ${1015 - hgt * 0.5} ${x + lean} ${1015 - hgt}" stroke="#03070e" stroke-width="9" fill="none"/>`;
        for (let f = 0; f < 7; f++) {
          const a = (f / 7) * Math.PI * 2;
          const fx = x + lean + Math.cos(a) * 90;
          const fy = 1015 - hgt + Math.sin(a) * 40 + 25;
          s += `<path d="M${x + lean} ${1015 - hgt} Q ${(x + lean + fx) / 2} ${1015 - hgt - 30} ${fx.toFixed(0)} ${fy.toFixed(0)}" stroke="#03070e" stroke-width="7" fill="none"/>`;
        }
      }
      return s;
    })(),
  ),
);

/** slanted rain streaks (tileable-ish) */
export const RAIN = uri(
  wrap(
    '',
    (() => {
      let s = '';
      for (let i = 0; i < 520; i++) {
        const x = h(i * 3) * W;
        const y = h(i * 5) * H;
        const l = 30 + h(i * 7) * 50;
        s += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - l * 0.35).toFixed(0)}" y2="${(y + l).toFixed(0)}" stroke="#a9d1ff" stroke-width="1.4" opacity="${(0.12 + h(i * 11) * 0.25).toFixed(2)}"/>`;
      }
      return s;
    })(),
  ),
);

export const FOG = uri(wrap(`<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1422" stop-opacity="0"/><stop offset="1" stop-color="#0a1422" stop-opacity=".9"/></linearGradient>`, `<rect y="${H * 0.55}" width="${W}" height="${H * 0.45}" fill="url(#g)"/>`));

/** Generated storm "photograph" for the liquid-glass effect (offline replacement for the remote image). */
export const STORM_POSTER = uri(
  wrap(
    `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a14"/><stop offset=".6" stop-color="#14233b"/><stop offset="1" stop-color="#b86f10"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="14"/></filter>`,
    `<rect width="1600" height="1000" fill="url(#s)"/><g filter="url(#b)">${cloudBank(520, 150, 12, 5, '#101b2e')}</g>
     <path d="M820 120 L760 360 L840 360 L700 700 L900 330 L815 330 L900 120 Z" fill="#e6f0ff"/><path d="M820 120 L760 360 L840 360 L700 700 L900 330 L815 330 L900 120 Z" fill="none" stroke="#f5a524" stroke-width="10" opacity=".35"/>`,
    1600,
    1000,
  ),
);
