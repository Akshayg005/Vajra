import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { Alert, CitizenReport, LightningStrike, SensorStatus, StormCell } from '@vajra/contracts';
import { SEV_RGB } from '../lib/format';
import { ellipse, moveKm } from '../engine/geo';
import { INFRA, TOWNS, type Infra, type Town } from '../engine/places';

type RGBA = [number, number, number, number];
export interface CellLite {
  id: string;
  lng: number;
  lat: number;
  maxDbz: number;
  radiusKm: number;
  severity: StormCell['severity'];
}

export function coneFor(c: StormCell): [number, number][] {
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

export function easeCells(cells: StormCell[], prev: Map<string, StormCell>, k: number): StormCell[] {
  const e = k < 0 ? 0 : k > 1 ? 1 : 1 - Math.pow(1 - k, 2);
  return cells.map((c) => {
    const p = prev.get(c.id);
    if (!p) return c;
    return { ...c, lng: p.lng + (c.lng - p.lng) * e, lat: p.lat + (c.lat - p.lat) * e, radiusKm: p.radiusKm + (c.radiusKm - p.radiusKm) * e };
  });
}

export function ringLayers(sensors: SensorStatus[], tick: number, opacity: number): Layer[] {
  const rings = sensors.filter((s) => s.kind === 'dwr');
  return [
    new PathLayer<SensorStatus>({
      id: 'dwr-rings',
      data: rings,
      opacity,
      getPath: (s) => ellipse(s.lng, s.lat, s.rangeKm ?? 250, s.rangeKm ?? 250, 0, 72),
      getColor: (s) => (s.state === 'excluded' || s.anomaly === 'dropout' ? [239, 68, 68, 220] : s.state === 'ok' ? [34, 211, 238, 90] : [251, 146, 60, 180]),
      getWidth: (s) => (s.state === 'excluded' ? 2.5 : 1.2),
      widthUnits: 'pixels',
      updateTriggers: { getColor: tick, getWidth: tick },
    }),
    new ScatterplotLayer<SensorStatus>({
      id: 'dwr-sites',
      data: rings,
      opacity,
      pickable: true,
      getPosition: (s) => [s.lng, s.lat],
      getRadius: 5,
      radiusUnits: 'pixels',
      stroked: true,
      getLineColor: [5, 7, 13],
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
      getFillColor: (s) => (s.state === 'excluded' ? [239, 68, 68] : s.state === 'ok' ? [34, 211, 238] : [251, 146, 60]),
      updateTriggers: { getFillColor: tick },
    }),
  ];
}

export function alertLayer(alerts: Alert[], pulse: number, opacity: number): Layer {
  return new PolygonLayer<Alert>({
    id: 'alerts',
    data: alerts,
    opacity,
    pickable: true,
    getPolygon: (a) => a.polygon,
    getFillColor: (a) => [...SEV_RGB[a.severity], a.status === 'draft' ? 10 : 22] as RGBA,
    getLineColor: (a) => [...SEV_RGB[a.severity], a.status === 'draft' ? 150 : 230] as RGBA,
    getLineWidth: (a) => (a.status === 'draft' ? 1.2 : a.severity === 'red' ? 2.5 + pulse * 1.5 : 1.8),
    lineWidthUnits: 'pixels',
    stroked: true,
    filled: true,
    updateTriggers: { getLineWidth: Math.round(pulse * 10), getFillColor: alerts.map((a) => a.status).join(), getLineColor: alerts.map((a) => a.severity + a.status).join() },
  });
}

export function strikeLayers(strikes: LightningStrike[], flashing: LightningStrike[], seen: Map<number, number>, simNow: number, strikeTick: number, now: number, opacity: number): Layer[] {
  return [
    new ScatterplotLayer<LightningStrike>({
      id: 'strikes',
      data: strikes,
      opacity,
      pickable: true,
      getPosition: (s) => [s.lng, s.lat],
      getRadius: (s) => (s.kind === 'CG' ? 2.6 : 1.4),
      radiusUnits: 'pixels',
      getFillColor: (s) => {
        const age = (simNow - s.t) / 60000;
        const a = Math.max(20, 255 * (1 - age / 20));
        if (s.kind === 'IC') return [167, 139, 250, a * 0.55];
        return s.polarity > 0 ? [244, 114, 182, a] : [186, 250, 255, a];
      },
      updateTriggers: { getFillColor: strikeTick },
    }),
    new ScatterplotLayer<LightningStrike>({
      id: 'flash',
      data: flashing,
      opacity,
      getPosition: (s) => [s.lng, s.lat],
      getRadius: (s) => 3 + ((now - (seen.get(s.id) ?? now)) / 700) * 22,
      radiusUnits: 'pixels',
      stroked: true,
      filled: true,
      getFillColor: (s) => [255, 255, 255, 200 * (1 - (now - (seen.get(s.id) ?? now)) / 700)],
      getLineColor: (s) => (s.polarity > 0 ? [244, 114, 182, 255] : [103, 232, 249, 255]),
      getLineWidth: 1.5,
      lineWidthUnits: 'pixels',
      updateTriggers: { getRadius: now, getFillColor: now },
    }),
  ];
}

export function reportLayer(reports: CitizenReport[], opacity: number): Layer {
  return new ScatterplotLayer<CitizenReport>({
    id: 'reports',
    data: reports,
    opacity,
    getPosition: (r) => [r.lng, r.lat],
    getRadius: 5,
    radiusUnits: 'pixels',
    stroked: true,
    getLineColor: [5, 7, 13],
    getLineWidth: 1.5,
    lineWidthUnits: 'pixels',
    getFillColor: (r) => (r.status === 'verified' ? [34, 197, 94] : r.status === 'fake' ? [100, 116, 139] : r.status === 'duplicate' ? [148, 163, 184] : [250, 204, 21]),
    pickable: true,
  });
}

export function cityLayers(bbox: [number, number, number, number], opacity: number, zoom: number): Layer[] {
  const [w, s, e, n] = bbox;
  const minPop = zoom < 6.5 ? 900000 : zoom < 7.5 ? 250000 : 60000;
  const towns = TOWNS.filter((t) => t.lng > w - 1 && t.lng < e + 1 && t.lat > s - 1 && t.lat < n + 1 && t.pop >= minPop);
  return [
    new ScatterplotLayer<Town>({ id: 'cities', data: towns, opacity, pickable: true, getPosition: (t) => [t.lng, t.lat], getRadius: (t) => (t.pop > 1e6 ? 3.5 : 2.5), radiusUnits: 'pixels', getFillColor: [226, 232, 240, 220], updateTriggers: { getRadius: minPop } }),
    new TextLayer<Town>({
      id: 'city-labels',
      data: towns,
      opacity: opacity * 0.9,
      getPosition: (t) => [t.lng, t.lat],
      getText: (t) => t.name.replace(/ \(.*\)/, ''),
      getSize: (t) => (t.pop > 1e6 ? 13 : 11),
      getColor: [203, 213, 225, 210],
      getPixelOffset: [6, 0],
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      fontFamily: 'Inter, sans-serif',
      fontWeight: 500,
      outlineWidth: 3,
      outlineColor: [4, 9, 19, 220],
      fontSettings: { sdf: true },
      characterSet: 'auto',
    }),
  ];
}

const ASSET_GLYPH: Record<Infra['kind'], string> = { airport: '✈', substation: 'ϟ', highway: '═', port: '⚓', hospital: '+' };

export function assetLayers(bbox: [number, number, number, number], opacity: number): Layer[] {
  const [w, s, e, n] = bbox;
  const assets = INFRA.filter((a) => a.lng > w - 0.5 && a.lng < e + 0.5 && a.lat > s - 0.5 && a.lat < n + 0.5);
  return [
    new ScatterplotLayer<Infra>({ id: 'assets', data: assets, opacity, pickable: true, getPosition: (a) => [a.lng, a.lat], getRadius: 9, radiusUnits: 'pixels', getFillColor: [15, 23, 42, 230], getLineColor: [250, 204, 21, 230], stroked: true, getLineWidth: 1.5, lineWidthUnits: 'pixels' }),
    new TextLayer<Infra>({ id: 'asset-glyphs', data: assets, opacity, getPosition: (a) => [a.lng, a.lat], getText: (a) => ASSET_GLYPH[a.kind], getSize: 12, getColor: [250, 204, 21, 255], fontFamily: 'Inter, sans-serif', characterSet: Object.values(ASSET_GLYPH).join('') }),
  ];
}

export function trackLayers(cells: StormCell[], selected: string | null, opacity: number): Layer[] {
  return [
    new PolygonLayer<StormCell>({ id: 'cones', data: cells.filter((c) => c.forecastTrack.length > 1 && c.maxDbz > 35), opacity, getPolygon: coneFor, getFillColor: (c) => (c.id === selected ? [167, 139, 250, 70] : [167, 139, 250, 30]), getLineColor: [196, 181, 253, 140], getLineWidth: 1, lineWidthUnits: 'pixels', stroked: true, updateTriggers: { getFillColor: selected } }),
    new PathLayer<StormCell>({ id: 'past', data: cells.filter((c) => c.track.length > 1), opacity, getPath: (c) => [...c.track.map((p) => [p.lng, p.lat] as [number, number]), [c.lng, c.lat] as [number, number]], getColor: [226, 232, 240, 170], getWidth: 2, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
  ];
}

export function cellLayers(cellData: CellLite[], jumps: StormCell[], selected: string | null, pulse: number, now: number, tick: number, pickable: boolean, compact: boolean, opacity: number): Layer[] {
  const out: Layer[] = [
    new ScatterplotLayer<CellLite>({
      id: 'cells',
      data: cellData,
      opacity,
      getPosition: (c) => [c.lng, c.lat],
      getRadius: (c) => Math.max(3500, c.radiusKm * 1000 * 1.25),
      radiusUnits: 'meters',
      stroked: true,
      filled: true,
      getFillColor: (c) => (c.id === selected ? [34, 211, 238, 40] : [0, 0, 0, 1]),
      getLineColor: (c) => (c.id === selected ? [34, 211, 238, 255] : ([...SEV_RGB[c.severity], 235] as RGBA)),
      getLineWidth: (c) => (c.id === selected ? 2.5 + pulse * 2 : 2),
      lineWidthUnits: 'pixels',
      pickable,
      updateTriggers: { getLineColor: [selected, tick], getLineWidth: [selected, Math.round(pulse * 10)], getFillColor: selected },
    }),
    new TextLayer<CellLite>({
      id: 'cell-labels',
      data: cellData,
      opacity,
      getPosition: (c) => [c.lng, c.lat],
      getText: (c) => `${c.id} · ${c.maxDbz.toFixed(1)}`,
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
  ];
  if (jumps.length)
    out.push(
      new ScatterplotLayer<StormCell>({ id: 'jump-ring', data: jumps, opacity, getPosition: (c) => [c.lng, c.lat], getRadius: (c) => c.radiusKm * 1000 * (1.6 + ((now / 1400) % 1) * 1.6), radiusUnits: 'meters', stroked: true, filled: false, getLineColor: [34, 211, 238, 255 * (1 - ((now / 1400) % 1))], getLineWidth: 2, lineWidthUnits: 'pixels', updateTriggers: { getRadius: now, getLineColor: now } }),
    );
  return out;
}
