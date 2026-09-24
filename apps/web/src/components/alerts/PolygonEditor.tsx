import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import type { Alert, LngLat } from '@vajra/contracts';
import { Save, Undo2 } from 'lucide-react';
import { BASE_STYLE } from '../../map/baseStyle';
import { SEV_RGB } from '../../lib/format';

/** Drag the vertices of a warning polygon; Save sends it to the engine, which recomputes exposure. */
export function PolygonEditor({ alert, onSave, onCancel }: { alert: Alert; onSave: (p: LngLat[]) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [poly, setPoly] = useState<LngLat[]>(() => alert.polygon.slice(0, -1));
  const polyRef = useRef(poly);
  polyRef.current = poly;
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    const xs = alert.polygon.map((p) => p[0]);
    const ys = alert.polygon.map((p) => p[1]);
    const map = new maplibregl.Map({ container: ref.current!, style: BASE_STYLE, bounds: [Math.min(...xs) - 0.2, Math.min(...ys) - 0.2, Math.max(...xs) + 0.2, Math.max(...ys) + 0.2], attributionControl: false, fadeDuration: 0 });
    mapRef.current = map;
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay as unknown as maplibregl.IControl);
    return () => {
      overlay.finalize();
      map.remove();
      overlayRef.current = null;
    };
  }, [alert.id]);

  useEffect(() => {
    const o = overlayRef.current;
    if (!o) return;
    const ring = [...poly, poly[0]];
    const rgb = SEV_RGB[alert.severity];
    o.setProps({
      layers: [
        new PolygonLayer<{ ring: LngLat[] }>({ id: 'edit-poly', data: [{ ring }], getPolygon: (d) => d.ring, getFillColor: [...rgb, 40], getLineColor: [...rgb, 255], getLineWidth: 2, lineWidthUnits: 'pixels' }),
        new ScatterplotLayer<{ p: LngLat; i: number }>({
          id: 'edit-vertices',
          data: poly.map((p, i) => ({ p, i })),
          getPosition: (d) => d.p,
          getRadius: 7,
          radiusUnits: 'pixels',
          getFillColor: [255, 255, 255],
          getLineColor: [...rgb, 255],
          stroked: true,
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          pickable: true,
          // the map must not pan while a vertex is under the pointer
          onHover: (info: PickingInfo) => {
            const m = mapRef.current;
            if (!m || dragging.current !== null) return true;
            if (info.object) m.dragPan.disable();
            else m.dragPan.enable();
            return true;
          },
          onDragStart: (info: PickingInfo<{ p: LngLat; i: number }>) => {
            dragging.current = info.object?.i ?? null;
            return true;
          },
          onDrag: (info: PickingInfo) => {
            const i = dragging.current;
            if (i === null || !info.coordinate) return true;
            const next = polyRef.current.slice();
            next[i] = [info.coordinate[0], info.coordinate[1]];
            setPoly(next);
            return true;
          },
          onDragEnd: () => {
            dragging.current = null;
            mapRef.current?.dragPan.enable();
            return true;
          },
        }),
      ],
      getCursor: ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) => (isHovering ? 'move' : isDragging ? 'grabbing' : 'grab'),
    });
  }, [poly, alert.severity]);

  return (
    <div>
      <div className="relative h-[300px] overflow-hidden rounded-lg border border-white/10">
        <div ref={ref} className="absolute inset-0" />
        <div className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] text-white">Drag the white vertices to reshape the warning area</div>
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn btn-primary" onClick={() => onSave([...poly, poly[0]])}>
          <Save className="h-4 w-4" /> Save polygon & recompute impact
        </button>
        <button className="btn" onClick={() => setPoly(alert.polygon.slice(0, -1))}>
          <Undo2 className="h-4 w-4" /> Reset
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
