import * as Comlink from 'comlink';
import type { CitizenReport, DirectorCommand, PointNowcast } from '@vajra/contracts';
import type { EngineApi, StartOptions, WorkerSnapshot } from '../engine/worker';
import type { FrameAt } from '../engine/engine';
import { HealthSchema } from './schemas';

export type Snapshot = WorkerSnapshot;
export type SourceStatus = 'local' | 'api' | 'api-lost' | 'worker-restarted';

/**
 * One interface for every data source. The UI only ever talks to a DataAdapter.
 * Going live = swapping SimulationAdapter for the real-feed adapters below (same outputs).
 */
export interface DataAdapter {
  readonly id: 'simulation' | 'api';
  readonly label: string;
  start(opts: StartOptions, onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus) => void): Promise<void>;
  command(cmd: DirectorCommand): Promise<CitizenReport | null>;
  frameAt(offsetMin: number): Promise<FrameAt | null>;
  pointNowcast(lat: number, lon: number, leadMin: number): Promise<PointNowcast | null>;
  capXml(alertId: string): Promise<string | null>;
  crash(): void;
  stop(): void;
}

/** Default: physics-guided simulation engine in a Web Worker (Comlink). Restarts itself with the same seed on a crash. */
export class SimulationAdapter implements DataAdapter {
  readonly id = 'simulation' as const;
  readonly label = 'VAJRA simulation engine (Web Worker)';
  private worker: Worker | null = null;
  private api: Comlink.Remote<EngineApi> | null = null;
  private opts: StartOptions | null = null;
  private onSnapshot: ((s: Snapshot) => void) | null = null;
  private onStatus: ((s: SourceStatus) => void) | null = null;
  private lastScenario = '';
  private restarts = 0;

  async start(opts: StartOptions, onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus) => void) {
    this.opts = opts;
    this.onSnapshot = onSnapshot;
    this.onStatus = onStatus;
    await this.boot(opts);
  }

  private async boot(opts: StartOptions) {
    this.worker?.terminate();
    const w = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
    this.worker = w;
    w.onerror = (ev) => {
      ev.preventDefault();
      this.recover();
    };
    this.api = Comlink.wrap<EngineApi>(w);
    await this.api.start(
      opts,
      Comlink.proxy((s: Snapshot) => {
        this.lastScenario = s.scenario.id;
        this.onSnapshot?.(s);
      }),
    );
  }

  /** auto-recovery: restart the worker with the same seed and the scenario it was running */
  private recover() {
    if (!this.opts || this.restarts > 5) return;
    this.restarts++;
    const opts = { ...this.opts, scenarioId: this.lastScenario || this.opts.scenarioId };
    this.onStatus?.('worker-restarted');
    void this.boot(opts);
  }

  setOptions(p: Partial<StartOptions>) {
    if (this.opts) this.opts = { ...this.opts, ...p };
  }
  async command(cmd: DirectorCommand) {
    if (cmd.type === 'speed') this.setOptions({ speed: cmd.value });
    if (cmd.type === 'pause') this.setOptions({ paused: cmd.value });
    if (cmd.type === 'seed') this.setOptions({ seed: cmd.value, locked: cmd.lock });
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
  crash() {
    void this.api?.crash();
  }
  stop() {
    void this.api?.stop();
    this.worker?.terminate();
  }
}

/** Is the FastAPI service reachable? (validated with Zod; any failure = offline) */
export async function apiHealth(timeoutMs = 1200) {
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch('/api/v1/health', { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const parsed = HealthSchema.safeParse(await r.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Pick the data source once per session. Falls back to the local engine silently. */
export async function chooseAdapter(): Promise<DataAdapter> {
  const want = new URLSearchParams(location.search).get('source');
  if (want === 'api') {
    const h = await apiHealth();
    if (h?.engine) {
      const { ApiAdapter } = await import('./apiAdapter');
      return new ApiAdapter();
    }
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
  stub({ id: 'insat', name: 'INSAT-3DR / 3DS (MOSDAC)', product: 'TIR1 10.8 µm brightness temperature, 4 km', format: 'HDF5', cadence: '15 min (rapid 4 min)', mapsTo: 'GridField ctt, cloud-top cooling' }),
  stub({ id: 'lln', name: 'Lightning Location Network (IITM/IMD)', product: 'CG + IC strokes, polarity, peak current', format: 'JSON / binary stream (MQTT)', cadence: 'real-time (<10 s)', mapsTo: 'LightningStrike[]' }),
  stub({ id: 'nwp', name: 'NWP NCUM 12 km / WRF 3 km', product: 'CAPE, CIN, shear, PW, convergence', format: 'GRIB2', cadence: 'hourly', mapsTo: 'EnvProfile, GridField nwp' }),
  stub({ id: 'aws', name: 'IMD AWS / ARG network', product: 'T, RH, wind, rain, pressure', format: 'CSV / JSON (WIS 2.0)', cadence: '15 min', mapsTo: 'SensorStatus, cold-pool detection' }),
];
