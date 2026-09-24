import { useEffect, useRef } from 'react';
import { maplibregl } from '../map/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { BitmapLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM, type Layer, type PickingInfo } from '@deck.gl/core';
import type { Alert, CitizenReport, LightningStrike, NowcastFrame, SensorStatus, StormCell } from '@vajra/contracts';
import { useStore, type Detail } from '../store';
import { CONF, CTT, DBZ, PROB } from '../lib/colormap';
import { TICK_MS } from '../engine/engine';
import { BASE_STYLE } from '../map/baseStyle';
import { bandComposite, bmpLayers, emptyBmp, extendedHatch, setBmp, updateBmp } from '../map/rasters';
import { alertLayer, assetLayers, cellLayers, cityLayers, easeCells, reportLayer, ringLayers, strikeLayers, trackLayers } from '../map/vectorLayers';
import { isLive } from '../selectors';
import type { Infra, Town } from '../engine/places';

export let activeMap: maplibregl.Map | null = null;

/** Map pick -> detail drawer target (click anything). */
function detailFor(info: PickingInfo): Detail | null {
  const id = info.layer?.id;
  const o = info.object as unknown;
  if (!id || !o) return null;
  if (id === 'cells') return { kind: 'cell', id: (o as StormCell).id };
  if (id === 'alerts') return { kind: 'alert', id: (o as Alert).id };
  if (id === 'strikes') return { kind: 'strike', id: String((o as LightningStrike).id) };
  if (id === 'reports') return { kind: 'report', id: (o as CitizenReport).id };
  if (id === 'dwr-sites') return { kind: 'sensor', id: (o as SensorStatus).id };
  if (id === 'assets') return { kind: 'asset', id: (o as Infra).name };
  if (id === 'cities') return { kind: 'city', id: (o as Town).name };
  return null;
}

export function MapView({ compact = false, onMapClick }: { compact?: boolean; onMapClick?: (lng: number, lat: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  useEffect(() => {
    const sc = useStore.getState().snap?.scenario;
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
    map.addControl(overlay as unknown as maplibregl.IControl);

    const radar = emptyBmp();
    const sat = emptyBmp();
    const conf = emptyBmp();
    const bands = emptyBmp();
    const single = emptyBmp();
    let ext: { img: ImageBitmap | null; bounds: [number, number, number, number] } = { img: null, bounds: [0, 0, 0, 0] };
    let nowcastRef: NowcastFrame[] | null = null;
    let bandKey = '';
    let lastScenario = sc?.id;
    const seenStrike = new Map<number, number>();
    let maxStrikeId = 0;
    let strikesData: LightningStrike[] = [];
    let strikeTick = -1;
    let zoom = map.getZoom();
    map.on('zoomend', () => (zoom = map.getZoom()));

    let raf = 0;
    const frameLoop = () => {
      raf = requestAnimationFrame(frameLoop);
      const st = useStore.getState();
      const snap = st.snap;
      if (!snap) return;
      const now = performance.now();
      const L = st.layers;
      const O = st.opacity;
      if (snap.scenario.id !== lastScenario) {
        lastScenario = snap.scenario.id;
        const [w, s, e, n] = snap.scenario.bbox;
        map.fitBounds([w, s, e, n], { padding: compact ? 10 : 40, duration: 1600 });
        seenStrike.clear();
        maxStrikeId = 0;
      }
      // --- rasters (re-coloured only when the engine posts a new grid) ---
      updateBmp(radar, st.frame ? `f${st.frame.t}` : snap.dbz.t, st.frame ? st.frame.dbz : snap.dbz, DBZ);
      if (L.satellite) updateBmp(sat, snap.ctt.t, snap.ctt, CTT);
      if (L.confidence) updateBmp(conf, snap.confidence.t, snap.confidence, CONF);
      if (st.nowcast !== nowcastRef || bandKey !== st.band) {
        nowcastRef = st.nowcast;
        bandKey = st.band;
        const nc = st.nowcast;
        if (nc.length) {
          const bb = nc[0].prob.bbox;
          if (st.band === 'all') {
            void bandComposite(nc).then((img) => setBmp(bands, img, bb));
            single.img = null;
          } else {
            const f = nc.find((x) => x.band === st.band);
            if (f) updateBmp(single, `${f.issuedAt}-${f.band}`, f.prob, PROB);
            bands.img = null;
          }
          void extendedHatch(nc).then((img) => (ext = { img, bounds: bb }));
        }
      }
      // --- strikes: flash on first sight (real time), fade with simulated age ---
      if (snap.stats.tick !== strikeTick) {
        strikeTick = snap.stats.tick;
        strikesData = snap.strikes;
        for (const s of snap.strikes) if (s.id > maxStrikeId && !seenStrike.has(s.id)) seenStrike.set(s.id, now + ((s.id * 37) % TICK_MS));
        if (snap.strikes.length) maxStrikeId = Math.max(maxStrikeId, snap.strikes[snap.strikes.length - 1].id);
        if (seenStrike.size > 4000) for (const [id, t] of seenStrike) if (now - t > 2000) seenStrike.delete(id);
      }
      const flashing = L.lightning
        ? strikesData.filter((s) => {
            const t0 = seenStrike.get(s.id);
            return t0 !== undefined && now - t0 >= 0 && now - t0 < 700 && s.kind === 'CG';
          })
        : [];
      const cells = st.frame ? [] : easeCells(snap.cells, st.prevCells, (now - st.receivedAt) / TICK_MS);
      const selected = st.selectedCellId;
      const pulse = (Math.sin(now / 260) + 1) / 2;
      const simNow = snap.stats.simTime;

      const layers: Layer[] = [];
      if (L.satellite) layers.push(...bmpLayers('sat', sat, O.satellite, now, 600));
      if (L.radar) layers.push(...bmpLayers('radar', radar, O.radar, now, 250));
      if (L.nowcast && !st.frame) layers.push(...bmpLayers('bands', bands, O.nowcast, now, 500), ...bmpLayers('band-single', single, O.nowcast, now, 500));
      if (L.extended && !st.frame && ext.img)
        layers.push(new BitmapLayer({ id: 'ext', image: ext.img, bounds: ext.bounds, opacity: O.extended, _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT }));
      if (L.confidence) layers.push(...bmpLayers('conf', conf, O.confidence, now, 600));
      if (L.rings || L.confidence) layers.push(...ringLayers(snap.sensors, snap.stats.tick, O.rings));
      if (L.cities) layers.push(...cityLayers(snap.scenario.bbox, O.cities, zoom));
      if (L.assets && !compact) layers.push(...assetLayers(snap.scenario.bbox, O.assets));
      if (L.alerts && !st.frame) layers.push(alertLayer(snap.alerts.filter(isLive), pulse, O.alerts));
      if (L.lightning) layers.push(...strikeLayers(strikesData, flashing, seenStrike, simNow, strikeTick, now, O.lightning));
      if (L.reports && !compact)
        layers.push(
          reportLayer(
            snap.reports.filter((r) => simNow - r.t < 90 * 60000),
            O.reports,
          ),
        );
      if (L.tracks && cells.length) layers.push(...trackLayers(cells, selected, O.tracks));
      if (L.cells) {
        const cellData = st.frame ? st.frame.cells : cells.filter((c) => c.maxDbz > 30);
        layers.push(
          ...cellLayers(
            cellData,
            cells.filter((c) => c.lightningJump),
            selected,
            pulse,
            now,
            snap.stats.tick,
            !st.frame,
            compact,
            O.cells,
          ),
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
            void st.send({ type: 'spawn', lng, lat, stormType: st.spawnType, strength: 1 });
            st.setPickMode(null);
            return;
          }
          onClickRef.current?.(lng, lat);
          if (st.pickMode) return;
        }
        const d = detailFor(info);
        if (d) st.openDetail(d);
      },
      getCursor: ({ isHovering }: { isHovering: boolean }) => (useStore.getState().pickMode ? 'crosshair' : isHovering ? 'pointer' : 'grab'),
    });

    const applyBase = () => {
      const s = useStore.getState();
      if (!map.isStyleLoaded()) return;
      map.setLayoutProperty('imagery', 'visibility', s.layers.imagery ? 'visible' : 'none');
      map.setLayoutProperty('districts-line', 'visibility', s.layers.districts ? 'visible' : 'none');
      map.setPaintProperty('districts-line', 'line-opacity', s.opacity.districts);
      map.setPaintProperty('imagery', 'raster-opacity', s.opacity.imagery);
    };
    map.on('load', applyBase);
    const unsub = useStore.subscribe((s, p) => {
      if (s.layers !== p.layers || s.opacity !== p.opacity) applyBase();
    });

    return () => {
      cancelAnimationFrame(raf);
      unsub();
      overlay.finalize();
      map.remove();
      if (activeMap === map) activeMap = null;
    };
  }, [compact]);

  return <div ref={ref} className="absolute inset-0" role="application" aria-label="Live nowcast map. Click storms, warnings, strikes, reports, radars or assets for details." />;
}

export function flyToCell(c: { lng: number; lat: number }) {
  activeMap?.flyTo({ center: [c.lng, c.lat], zoom: Math.max(activeMap.getZoom(), 8), duration: 1200 });
}
