import { useEffect, useState } from 'react';

type Ring = [number, number][];
export interface GeoLines {
  rings: Ring[];
}

const cache = new Map<string, Promise<GeoLines>>();

/** Load a local GeoJSON (SoI-compliant boundaries, bundled) as flat rings for canvas drawing. */
export function loadGeo(url: string): Promise<GeoLines> {
  if (!cache.has(url))
    cache.set(
      url,
      fetch(url)
        .then((r) => r.json())
        .then((j) => {
          const rings: Ring[] = [];
          for (const f of j.features) {
            const g = f.geometry;
            if (!g) continue;
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
            for (const p of polys) for (const r of p) rings.push(r);
          }
          return { rings };
        }),
    );
  return cache.get(url)!;
}

export function useGeo(url: string) {
  const [g, setG] = useState<GeoLines | null>(null);
  useEffect(() => {
    loadGeo(url).then(setG);
  }, [url]);
  return g;
}

export function drawGeo(ctx: CanvasRenderingContext2D, geo: GeoLines, bbox: [number, number, number, number], W: number, H: number, style: { stroke: string; width: number; fill?: string }) {
  const [w, s, e, n] = bbox;
  ctx.save();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.width;
  if (style.fill) ctx.fillStyle = style.fill;
  for (const r of geo.rings) {
    let inView = false;
    for (const [x, y] of r) if (x > w - 1 && x < e + 1 && y > s - 1 && y < n + 1) {
      inView = true;
      break;
    }
    if (!inView) continue;
    ctx.beginPath();
    r.forEach(([x, y], i) => {
      const px = ((x - w) / (e - w)) * W;
      const py = ((n - y) / (n - s)) * H;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    if (style.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
