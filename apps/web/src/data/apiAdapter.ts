import type { CitizenReport, DirectorCommand, GridField, PointNowcast, WorldSnapshot } from '@vajra/contracts';
import type { DataAdapter, Snapshot, SourceStatus } from './adapters';
import type { StartOptions } from '../engine/worker';
import type { FrameAt } from '../engine/engine';
import { PointNowcastSchema } from './schemas';

const emptyGrid = (name: GridField['name'], bbox: [number, number, number, number], t: number): GridField => ({ name, width: 1, height: 1, bbox, resKm: 0, t, data: new Float32Array(1) });

type ApiSnapshot = Omit<WorldSnapshot, 'dbz' | 'ctt' | 'nowcast' | 'confidence' | 'nwp' | 'density'>;

function isApiSnapshot(x: unknown): x is ApiSnapshot {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return Array.isArray(o.cells) && Array.isArray(o.alerts) && typeof o.stats === 'object' && typeof o.scenario === 'object';
}

/**
 * Talks to the FastAPI service (apps/api) over WS /ws/live and REST /api/v1.
 * The Python engine port streams cells, strikes, alerts and scores (no rasters), so raster layers show as unavailable
 * in this mode rather than being faked locally. If the socket drops, the app falls back to the local engine.
 */
export class ApiAdapter implements DataAdapter {
  readonly id = 'api' as const;
  readonly label = 'VAJRA API (FastAPI /ws/live)';
  private ws: WebSocket | null = null;
  private closedByUs = false;

  async start(opts: StartOptions, onSnapshot: (s: Snapshot) => void, onStatus: (s: SourceStatus) => void) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws/live?scenario=${encodeURIComponent(opts.scenarioId)}`);
    this.ws.onopen = () => onStatus('api');
    this.ws.onclose = () => {
      if (!this.closedByUs) onStatus('api-lost');
    };
    this.ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof msg !== 'object' || msg === null || (msg as { type?: string }).type !== 'snapshot') return;
      const d = (msg as { data: unknown }).data;
      if (!isApiSnapshot(d)) return;
      const bbox = d.scenario.bbox;
      const t = d.stats.simTime;
      onSnapshot({
        ...d,
        dbz: emptyGrid('dbz', bbox, t),
        ctt: emptyGrid('ctt', bbox, t),
        confidence: emptyGrid('confidence', bbox, t),
        nwp: emptyGrid('nwp', bbox, t),
        density: emptyGrid('density', bbox, t),
        nowcast: [],
        changed: { nowcast: false, ctt: false, conf: false, nwp: false, density: false },
      });
    };
  }
  async command(cmd: DirectorCommand): Promise<CitizenReport | null> {
    await fetch('/api/v1/director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    return null;
  }
  async frameAt(): Promise<FrameAt | null> {
    return null;
  }
  async pointNowcast(lat: number, lon: number, leadMin: number): Promise<PointNowcast | null> {
    const r = await fetch(`/api/v1/nowcast?lat=${lat}&lon=${lon}&lead=${leadMin}`);
    if (!r.ok) return null;
    const p = PointNowcastSchema.safeParse(await r.json());
    return p.success ? p.data : null;
  }
  async capXml(alertId: string) {
    const r = await fetch(`/api/v1/alerts/${encodeURIComponent(alertId)}/cap.xml`);
    return r.ok ? r.text() : null;
  }
  crash() {
    this.ws?.close();
  }
  stop() {
    this.closedByUs = true;
    this.ws?.close();
  }
}
