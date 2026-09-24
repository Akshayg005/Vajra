import * as Comlink from 'comlink';
import type { CitizenReport, DirectorCommand, PointNowcast, WorldSnapshot } from '@vajra/contracts';
import type { EngineApi } from '../engine/worker';
import type { FrameAt } from '../engine/engine';

export type Snapshot = WorldSnapshot & { changed: Record<string, boolean> };

/**
 * One interface for every data source. The UI only ever talks to a DataAdapter.
 * Going live = swapping SimulationAdapter for the real-feed adapters below (same outputs).
 */
export interface DataAdapter {
  readonly id: 'simulation' | 'api';
  readonly label: string;
  start(scenarioId: string, onSnapshot: (s: Snapshot) => void): Promise<void>;
  command(cmd: DirectorCommand): Promise<CitizenReport | null>;
  frameAt(offsetMin: number): Promise<FrameAt | null>;
  pointNowcast(lat: number, lon: number, leadMin: number): Promise<PointNowcast | null>;
  capXml(alertId: string): Promise<string | null>;
  stop(): void;
}

/** Default: physics-guided simulation engine in a Web Worker (Comlink). */
export class SimulationAdapter implements DataAdapter {
  readonly id = 'simulation' as const;
  readonly label = 'VAJRA simulation engine (Web Worker)';
  private worker: Worker | null = null;
  private api: Comlink.Remote<EngineApi> | null = null;

  async start(scenarioId: string, onSnapshot: (s: Snapshot) => void) {
    this.worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    this.api = Comlink.wrap<EngineApi>(this.worker);
    await this.api.start(scenarioId, Comlink.proxy(onSnapshot));
  }
  async command(cmd: DirectorCommand) {
    return ((await this.api?.command(cmd)) as CitizenReport | null) ?? null;
  }
  async frameAt(offsetMin: number) {
    return (await this.api?.frameAt(offsetMin)) ?? null;
  }
  async pointNowcast(lat: number, lon: number, leadMin: number) {
    return (await this.api?.pointNowcast(lat, lon, leadMin)) ?? null;
  }
  async capXml(alertId: string) {
    return (await this.api?.capXml(alertId)) ?? null;
  }
  stop() {
    this.api?.stop();
    this.worker?.terminate();
  }
}

/**
 * FastAPI adapter (same contracts, /api/v1 + /ws/live). Used only when the service answers at start-up.
 * One data source per session: if it is chosen we never mix in local engine state.
 */
export async function apiAvailable(timeoutMs = 1200): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch('/api/v1/health', { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return false;
    const j = await r.json();
    return j?.engine === true;
  } catch {
    return false;
  }
}

/** Pick the data source once per session. Falls back to the local engine silently. */
export async function chooseAdapter(): Promise<DataAdapter> {
  const want = new URLSearchParams(location.search).get('source');
  if (want === 'api' && (await apiAvailable())) {
    const { ApiAdapter } = await import('./apiAdapter');
    return new ApiAdapter();
  }
  return new SimulationAdapter();
}

/* ------------------------------------------------------------------------------------------ */
/* Real-feed stubs. Same interface shape per feed; each maps a real product to engine outputs. */
/* ------------------------------------------------------------------------------------------ */

export interface FeedAdapter {
  id: string;
  name: string;
  product: string;
  format: string;
  cadence: string;
  mapsTo: string;
  status: 'stub' | 'connected';
  connect(): Promise<never>;
}

const stub = (f: Omit<FeedAdapter, 'status' | 'connect'>): FeedAdapter => ({
  ...f,
  status: 'stub',
  connect: () => Promise.reject(new Error(`${f.name}: not connected in the prototype (needs IMD data-sharing endpoint)`)),
});

export const FEED_ADAPTERS: FeedAdapter[] = [
  stub({ id: 'dwr', name: 'IMD Doppler Weather Radar', product: 'MAX(Z) / PPI volume, 39 sites', format: 'NetCDF / IRIS RAW via ODIM-H5', cadence: '10 min', mapsTo: 'GridField dbz, echo top, VIL' }),
  stub({ id: 'insat', name: 'INSAT-3DR / 3DS (MOSDAC)', product: 'TIR1 10.8 um brightness temperature, 4 km', format: 'HDF5', cadence: '15 min (rapid 4 min)', mapsTo: 'GridField ctt, cloud-top cooling' }),
  stub({ id: 'lln', name: 'Lightning Location Network (IITM/IMD)', product: 'CG + IC strokes, polarity, peak current', format: 'JSON / binary stream (MQTT)', cadence: 'real-time (<10 s)', mapsTo: 'LightningStrike[]' }),
  stub({ id: 'nwp', name: 'NWP NCUM 12 km / WRF 3 km', product: 'CAPE, CIN, shear, PW, convergence', format: 'GRIB2', cadence: 'hourly', mapsTo: 'EnvProfile, GridField nwp' }),
  stub({ id: 'aws', name: 'IMD AWS / ARG network', product: 'T, RH, wind, rain, pressure', format: 'CSV / JSON (WIS 2.0)', cadence: '15 min', mapsTo: 'SensorStatus, cold-pool detection' }),
];
