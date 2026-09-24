export const KM_PER_DEG_LAT = 111.32;
export const kmPerDegLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

export function distanceKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** bearing from point 1 to point 2, degrees clockwise from north */
export function bearingDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const dx = (lng2 - lng1) * kmPerDegLng((lat1 + lat2) / 2);
  const dy = (lat2 - lat1) * KM_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** move a point by distance km toward heading deg */
export function moveKm(lng: number, lat: number, headingDeg: number, km: number): [number, number] {
  const h = (headingDeg * Math.PI) / 180;
  const dy = Math.cos(h) * km;
  const dx = Math.sin(h) * km;
  return [lng + dx / kmPerDegLng(lat), lat + dy / KM_PER_DEG_LAT];
}

/** unit vector (east, north) for heading */
export function headingVec(deg: number): [number, number] {
  const h = (deg * Math.PI) / 180;
  return [Math.sin(h), Math.cos(h)];
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const logit = (p: number) => Math.log(p / (1 - p));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function angleDiff(a: number, b: number): number {
  const d = ((a - b + 540) % 360) - 180;
  return d;
}

/** ellipse polygon around a point, axes in km */
export function ellipse(lng: number, lat: number, aKm: number, bKm: number, orientDeg: number, n = 32): [number, number][] {
  const out: [number, number][] = [];
  const o = (orientDeg * Math.PI) / 180;
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2;
    const x = Math.cos(th) * bKm;
    const y = Math.sin(th) * aKm;
    // rotate so that 'a' axis points along orientDeg
    const e = x * Math.cos(o) + y * Math.sin(o);
    const nn = -x * Math.sin(o) + y * Math.cos(o);
    out.push([lng + e / kmPerDegLng(lat), lat + nn / KM_PER_DEG_LAT]);
  }
  return out;
}

/** convex hull (monotone chain) */
export function convexHull(pts: [number, number][]): [number, number][] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  hull.push(hull[0]);
  return hull;
}

export function pointInPolygon(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const IST_OFFSET_MS = 5.5 * 3600 * 1000;
export function istHour(t: number): number {
  const d = new Date(t + IST_OFFSET_MS);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
}
export function fmtIST(t: number, withSec = false): string {
  const d = new Date(t + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return withSec ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}
