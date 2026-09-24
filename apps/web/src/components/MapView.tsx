import { useEffect, useRef } from 'react';
import maplibregl, { type StyleSpecification } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { BitmapLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM, type Layer, type PickingInfo } from '@deck.gl/core';
import type { GridField, NowcastFrame, StormCell, CitizenReport, LightningStrike } from '@vajra/contracts';
import { useStore } from '../store';
import { CONF, CTT, DBZ, PROB, gridToBitmap } from '../lib/colormap';
import { SEV_RGB } from '../lib/format';
import { ellipse, moveKm } from '../engine/geo';
import { TICK_MS } from '../engine/engine';

export let activeMap: maplibregl.Map | null = null;

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    outline: { type: 'geojson', data: '/geo/india-outline.geojson' },
    states: { type: 'geojson', data: '/geo/india-states.geojson' },
    districts: { type: 'geojson', data: '/geo/india-districts.geojson' },
    // optional online imagery (no political boundaries drawn in imagery, so no conflict with SoI lines)
    imagery: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Imagery © Esri' },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#03050a' } },
    { id: 'imagery', type: 'raster', source: 'imagery', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.55, 'raster-saturation': -0.4 } },
    { id: 'land', type: 'fill', source: 'outline', paint: { 'fill-color': '#0c1528', 'fill-opacity': 0.95 } },
    { id: 'districts-line', type: 'line', source: 'districts', minzoom: 5.5, paint: { 'line-color': '#1f2a40', 'line-width': 0.5 } },
    { id: 'states-line', type: 'line', source: 'states', paint: { 'line-color': '#3b4a66', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.2] } },
    { id: 'outline-line', type: 'line', source: 'outline', paint: { 'line-color': '#7c8db0', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 8, 1.8] } },
  ],
};

interface Bmp {
  img: ImageBitmap | null;
  prev: ImageBitmap | null;
  at: number;
  key: number | string;
  bounds: [number, number, number, number];
}
const emptyBmp = (): Bmp => ({ img: null, prev: null, at: 0, key: -1, bounds: [0, 0, 0, 0] });

const BAND_RGB: Record<string, [number, number, number]> = {
  '0-30': [232, 121, 249],
  '30-60': [167, 139, 250],
  '60-120': [96, 165, 250],
  '120-180': [34, 211, 238],
};

/** Composite of the four lead-time bands: each pixel takes the earliest band with P >= 0.25. */
async function bandComposite(frames: NowcastFrame[]): Promise<ImageBitmap | null> {
  const main = frames.filter((f) => !f.extended);
  if (!main.length) return null;
  const { width: w, height: h } = main[0].prob;
  const img = new ImageData(w, h);
  for (let k = 0; k < w * h; k++) {
    for (const f of main) {
      const p = f.prob.data[k];
      if (p >= 0.25) {
        const [r, g, b] = BAND_RGB[f.band];
        img.data[k * 4] = r;
        img.data[k * 4 + 1] = g;
        img.data[k * 4 + 2] = b;
        img.data[k * 4 + 3] = 40 + Math.min(1, p) * 110;
        break;
      }
    }
  }
  return createImageBitmap(img);
}

async function extendedHatch(frames: NowcastFrame[]): Promise<ImageBitmap | null> {
  const f = frames.find((x) => x.extended);
  if (!f) return null;
  const { width: w, height: h } = f.prob;
  const img = new ImageData(w, h);
  for (let k = 0; k < w * h; k++) {
    if (f.prob.data[k] < 0.22) continue;
    const x = k % w;
    const y = (k / w) | 0;
    if ((x + y) % 4 > 0) continue;
    img.data[k * 4] = 196;
    img.data[k * 4 + 1] = 181;
    img.data[k * 4 + 2] = 253;
    img.data[k * 4 + 3] = 150;
  }
  return createImageBitmap(img);
}

function coneFor(c: StormCell): [number, number][] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (const p of c.forecastTrack.filter((q) => q.t - c.forecastTrack[0].t <= 60 * 60000)) {
    const m = (p.t - c.forecastTrack[0].t) / 60000;
    const half = c.radiusKm * 0.8 + m * 0.35 + 2;
    left.push(moveKm(p.lng, p.lat, (c.headingDeg + 270) % 360, half));
    right.push(moveKm(p.lng, p.lat, (c.headingDeg + 90) % 360, half));
  }
  return [...left, ...right.reverse(), left[0]];
}

function easeCells(cells: StormCell[], prev: Map<string, StormCell>, k: number): StormCell[] {
  const e = k < 0 ? 0 : k > 1 ? 1 : k;
  return cells.map((c) => {
    const p = prev.get(c.id);
    if (!p) return c;
    return { ...c, lng: p.lng + (c.lng - p.lng) * e, lat: p.lat + (c.lat - p.lat) * e, radiusKm: p.radiusKm + (c.radiusKm - p.radiusKm) * e };
  });
}

export function MapView({ compact = false, onMapClick }: { compact?: boolean; onMapClick?: (lng: number, lat: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  useEffect(() => {
    const st0 = useStore.getState();
    const sc = st0.snap?.scenario;
    const map = new maplibregl.Map({
      container: ref.current!,
      style: BASE_STYLE,
      center: sc?.center ?? [82, 22],
      zoom: sc?.zoom ?? 4.5,
      minZoom: 3,
      maxZoom: 11,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 0,
    });
    activeMap = map;
    if (!compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], pickingRadius: 6 });
    overlayRef.current = overlay;
    map.addControl(overlay as unknown as maplibregl.IControl);

    const radar = emptyBmp();
    const sat = emptyBmp();
    const conf = emptyBmp();
    const bands = emptyBmp();
    const ext = emptyBmp();
    const single = emptyBmp();
    let nowcastRef: NowcastFrame[] | null = null;
    let bandKey = '';
    let lastScenario = sc?.id;
    const seenStrike = new Map<number, number>();
    let maxStrikeId = 0;
    let strikesData: LightningStrike[] = [];
    let strikeTick = -1;

    const bboxOf = (g: GridField): [number, number, number, number] => g.bbox;
    const updateBmp = (b: Bmp, key: number | string, g: GridField, lut: typeof DBZ, opts?: { hatch?: boolean; alphaScale?: number }) => {
      if (b.key === key || g.width < 2) return;
      b.key = key;
      gridToBitmap(g, lut, opts).then((img) => {
        if (b.key !== key) return;
        b.prev = b.img;
        b.img = img;
        b.at = performance.now();
        b.bounds = bboxOf(g);
      });
    };

    let raf = 0;
    const frameLoop = () => {
      raf = requestAnimationFrame(frameLoop);
      const st = useStore.getState();
      const snap = st.snap;
      if (!snap) return;
      const now = performance.now();
      const L = st.layers;
      if (snap.scenario.id !== lastScenario) {
        lastScenario = snap.scenario.id;
        const [w, s, e, n] = snap.scenario.bbox;
        map.fitBounds([w, s, e, n], { padding: compact ? 10 : 40, duration: 1600 });
        seenStrike.clear();
      }
      // --- rasters (updated when the engine posts new grids) ---
      const dbzField = st.frame ? st.frame.dbz : snap.dbz;
      updateBmp(radar, st.frame ? `f${st.frame.t}` : snap.dbz.t, dbzField, DBZ);
      if (L.satellite) updateBmp(sat, snap.ctt.t, snap.ctt, CTT);
      if (L.confidence) updateBmp(conf, snap.confidence.t, snap.confidence, CONF);
      if (st.nowcast !== nowcastRef || bandKey !== st.band) {
        nowcastRef = st.nowcast;
        bandKey = st.band;
        const nc = st.nowcast;
        if (nc.length) {
          const bb = nc[0].prob.bbox;
          if (st.band === 'all') {
            bandComposite(nc).then((img) => {
              bands.prev = bands.img;
              bands.img = img;
              bands.at = performance.now();
              bands.bounds = bb;
            });
            single.img = null;
          } else {
            const f = nc.find((x) => x.band === st.band);
            if (f) {
              single.key = -1;
              updateBmp(single, `${f.issuedAt}-${f.band}`, f.prob, PROB);
            }
            bands.img = null;
          }
          extendedHatch(nc).then((img) => {
            ext.img = img;
            ext.bounds = bb;
          });
        }
      }
      // --- strikes: flash on first sight (real time), fade with simulated age ---
      if (snap.stats.tick !== strikeTick) {
        strikeTick = snap.stats.tick;
        strikesData = snap.strikes;
        for (const s of snap.strikes) {
          if (s.id > maxStrikeId) {
            // stagger flashes across the tick so they don't pop together
            seenStrike.set(s.id, now + ((s.id * 37) % TICK_MS));
          }
        }
        maxStrikeId = snap.strikes.length ? Math.max(maxStrikeId, snap.strikes[snap.strikes.length - 1].id) : maxStrikeId;
        if (seenStrike.size > 3000) for (const [id, t] of seenStrike) if (now - t > 2000) seenStrike.delete(id);
      }
      const flashing = L.lightning ? strikesData.filter((s) => {
        const t0 = seenStrike.get(s.id);
        return t0 !== undefined && now - t0 >= 0 && now - t0 < 700 && s.kind === 'CG';
      }) : [];

      const k = (now - st.receivedAt) / TICK_MS;
      const cellsRaw = st.frame ? null : snap.cells;
      const cells = cellsRaw ? easeCells(cellsRaw, st.prevCells, k) : [];
      const frameCells = st.frame?.cells ?? [];
      const selected = st.selectedCellId;
      const pulse = (Math.sin(now / 260) + 1) / 2;
      const simNow = snap.stats.simTime;

      const layers: Layer[] = [];
      const bmpLayer = (id: string, b: Bmp, opacity = 1, fade = 250) => {
        if (!b.img) return;
        const kk = Math.min(1, (now - b.at) / fade);
        if (b.prev && kk < 1)
          layers.push(new BitmapLayer({ id: id + '-prev', image: b.prev, bounds: b.bounds, opacity: opacity * (1 - kk), _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT, textureParameters: { minFilter: 'linear', magFilter: 'linear' } }));
        layers.push(new BitmapLayer({ id, image: b.img, bounds: b.bounds, opacity: opacity * (b.prev ? kk : 1), _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT, textureParameters: { minFilter: 'linear', magFilter: 'linear' } }));
      };
      if (L.satellite) bmpLayer('sat', sat, 0.85, 600);
      if (L.radar) bmpLayer('radar', radar, 0.92, 250);
      if (L.nowcast && !st.frame) {
        bmpLayer('bands', bands, 0.9, 500);
        bmpLayer('band-single', single, 0.9, 500);
      }
      if (L.extended && !st.frame && ext.img) layers.push(new BitmapLayer({ id: 'ext', image: ext.img, bounds: ext.bounds, opacity: 0.55, _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT }));
      if (L.confidence) bmpLayer('conf', conf, 0.95, 600);
      if (L.rings || L.confidence) {
        const rings = snap.sensors.filter((s) => s.kind === 'dwr');
        layers.push(
          new PathLayer({
            id: 'dwr-rings',
            data: rings,
            getPath: (s: (typeof rings)[number]) => ellipse(s.lng, s.lat, s.rangeKm ?? 250, s.rangeKm ?? 250, 0, 72),
            getColor: (s: (typeof rings)[number]) => (s.state === 'excluded' ? [239, 68, 68, 220] : s.state === 'ok' ? [34, 211, 238, 90] : [251, 146, 60, 180]),
            getWidth: (s: (typeof rings)[number]) => (s.state === 'excluded' ? 2.5 : 1.2),
            widthUnits: 'pixels',
            updateTriggers: { getColor: snap.stats.tick, getWidth: snap.stats.tick },
          }),
          new ScatterplotLayer({ id: 'dwr-sites', data: rings, getPosition: (s: (typeof rings)[number]) => [s.lng, s.lat], getRadius: 4, radiusUnits: 'pixels', getFillColor: (s: (typeof rings)[number]) => (s.state === 'excluded' ? [239, 68, 68] : [34, 211, 238]), updateTriggers: { getFillColor: snap.stats.tick } }),
        );
      }
      if (L.alerts && !st.frame) {
        const act = snap.alerts.filter((a) => a.status === 'active' || a.status === 'updated');
        layers.push(
          new PolygonLayer({
            id: 'alerts',
            data: act,
            getPolygon: (a: (typeof act)[number]) => a.polygon,
            getFillColor: (a: (typeof act)[number]) => [...SEV_RGB[a.severity], 22] as [number, number, number, number],
            getLineColor: (a: (typeof act)[number]) => [...SEV_RGB[a.severity], 230] as [number, number, number, number],
            getLineWidth: (a: (typeof act)[number]) => (a.severity === 'red' ? 2.5 + pulse * 1.5 : 1.8),
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: true,
            updateTriggers: { getLineWidth: Math.round(pulse * 10) },
          }),
        );
      }
      if (L.lightning) {
        layers.push(
          new ScatterplotLayer({
            id: 'strikes',
            data: strikesData,
            getPosition: (s: LightningStrike) => [s.lng, s.lat],
            getRadius: (s: LightningStrike) => (s.kind === 'CG' ? 2.6 : 1.4),
            radiusUnits: 'pixels',
            getFillColor: (s: LightningStrike) => {
              const age = (simNow - s.t) / 60000;
              const a = Math.max(25, 255 * (1 - age / 20));
              if (s.kind === 'IC') return [167, 139, 250, a * 0.55];
              return s.polarity > 0 ? [244, 114, 182, a] : [186, 250, 255, a];
            },
            updateTriggers: { getFillColor: strikeTick },
          }),
          new ScatterplotLayer({
            id: 'flash',
            data: flashing,
            getPosition: (s: LightningStrike) => [s.lng, s.lat],
            getRadius: (s: LightningStrike) => 3 + ((now - (seenStrike.get(s.id) ?? now)) / 700) * 22,
            radiusUnits: 'pixels',
            stroked: true,
            filled: true,
            getFillColor: (s: LightningStrike) => [255, 255, 255, 200 * (1 - (now - (seenStrike.get(s.id) ?? now)) / 700)],
            getLineColor: (s: LightningStrike) => (s.polarity > 0 ? [244, 114, 182, 255] : [103, 232, 249, 255]),
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels',
            updateTriggers: { getRadius: now, getFillColor: now },
          }),
        );
      }
      if (L.reports && !compact) {
        const reps = snap.reports.filter((r) => simNow - r.t < 90 * 60000);
        layers.push(
          new ScatterplotLayer({
            id: 'reports',
            data: reps,
            getPosition: (r: CitizenReport) => [r.lng, r.lat],
            getRadius: 5,
            radiusUnits: 'pixels',
            stroked: true,
            getLineColor: [5, 7, 13],
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels',
            getFillColor: (r: CitizenReport) => (r.status === 'verified' ? [34, 197, 94] : r.status === 'fake' ? [100, 116, 139] : r.status === 'duplicate' ? [148, 163, 184] : [250, 204, 21]),
            pickable: true,
          }),
        );
      }
      if (L.tracks && cells.length) {
        layers.push(
          new PolygonLayer({ id: 'cones', data: cells.filter((c) => c.forecastTrack.length > 1 && c.maxDbz > 35), getPolygon: coneFor, getFillColor: (c: StormCell) => (c.id === selected ? [167, 139, 250, 70] : [167, 139, 250, 30]), getLineColor: [196, 181, 253, 140], getLineWidth: 1, lineWidthUnits: 'pixels', stroked: true, updateTriggers: { getFillColor: selected } }),
          new PathLayer({ id: 'past', data: cells.filter((c) => c.track.length > 1), getPath: (c: StormCell) => [...c.track.map((p) => [p.lng, p.lat] as [number, number]), [c.lng, c.lat] as [number, number]], getColor: [226, 232, 240, 170], getWidth: 2, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
        );
      }
      if (L.cells) {
        const cellData = st.frame ? frameCells : cells.filter((c) => c.maxDbz > 30);
        layers.push(
          new ScatterplotLayer({
            id: 'cells',
            data: cellData,
            getPosition: (c: { lng: number; lat: number }) => [c.lng, c.lat],
            getRadius: (c: { radiusKm: number }) => Math.max(3500, c.radiusKm * 1000 * 1.25),
            radiusUnits: 'meters',
            stroked: true,
            filled: true,
            getFillColor: (c: { id: string }) => (c.id === selected ? [34, 211, 238, 40] : [0, 0, 0, 0]),
            getLineColor: (c: { severity: StormCell['severity']; id: string }) => (c.id === selected ? [34, 211, 238, 255] : [...SEV_RGB[c.severity], 235] as [number, number, number, number]),
            getLineWidth: (c: { id: string }) => (c.id === selected ? 2.5 + pulse * 2 : 2),
            lineWidthUnits: 'pixels',
            pickable: !st.frame,
            updateTriggers: { getLineColor: [selected, snap.stats.tick], getLineWidth: [selected, Math.round(pulse * 10)], getFillColor: selected },
          }),
          new TextLayer({
            id: 'cell-labels',
            data: cellData,
            getPosition: (c: { lng: number; lat: number }) => [c.lng, c.lat],
            getText: (c: { id: string; maxDbz: number }) => `${c.id} · ${Math.round(c.maxDbz)}`,
            getSize: compact ? 11 : 12,
            getColor: [241, 245, 249, 235],
            getPixelOffset: [0, -22],
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            outlineWidth: 3,
            outlineColor: [5, 7, 13, 230],
            fontSettings: { sdf: true },
            characterSet: 'auto',
          }),
        );
        const jumps = cells.filter((c) => c.lightningJump);
        if (jumps.length)
          layers.push(
            new ScatterplotLayer({ id: 'jump-ring', data: jumps, getPosition: (c: StormCell) => [c.lng, c.lat], getRadius: (c: StormCell) => c.radiusKm * 1000 * (1.6 + ((now / 1400) % 1) * 1.6), radiusUnits: 'meters', stroked: true, filled: false, getLineColor: [34, 211, 238, 255 * (1 - ((now / 1400) % 1))], getLineWidth: 2, lineWidthUnits: 'pixels', updateTriggers: { getRadius: now, getLineColor: now } }),
          );
      }
      overlay.setProps({ layers });
    };
    raf = requestAnimationFrame(frameLoop);

    overlay.setProps({
      onClick: (info: PickingInfo) => {
        const st = useStore.getState();
        if (info.coordinate && (st.pickMode || onClickRef.current)) {
          const [lng, lat] = info.coordinate as [number, number];
          if (st.pickMode === 'spawn') {
            st.send({ type: 'spawn', lng, lat, stormType: st.spawnType, strength: 1 });
            st.setPickMode(null);
            return;
          }
          onClickRef.current?.(lng, lat);
          if (st.pickMode) return;
        }
        if (info.layer?.id === 'cells' && info.object) st.select((info.object as StormCell).id);
      },
      getCursor: ({ isHovering }: { isHovering: boolean }) => (useStore.getState().pickMode ? 'crosshair' : isHovering ? 'pointer' : 'grab'),
    });

    const unsub = useStore.subscribe((s, p) => {
      if (s.layers.imagery !== p.layers.imagery && map.isStyleLoaded()) map.setLayoutProperty('imagery', 'visibility', s.layers.imagery ? 'visible' : 'none');
      if (s.layers.districts !== p.layers.districts && map.isStyleLoaded()) map.setLayoutProperty('districts-line', 'visibility', s.layers.districts ? 'visible' : 'none');
    });

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      overlay.finalize();
      map.remove();
      if (activeMap === map) activeMap = null;
    };
  }, [compact]);

  return <div ref={ref} className="absolute inset-0" />;
}

export function flyToCell(c: { lng: number; lat: number }) {
  activeMap?.flyTo({ center: [c.lng, c.lat], zoom: Math.max(activeMap.getZoom(), 8), duration: 1200 });
}
