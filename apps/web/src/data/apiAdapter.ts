import type { CitizenReport, DirectorCommand, GridField, PointNowcast } from '@vajra/contracts';
import type { DataAdapter, Snapshot } from './adapters';
import type { FrameAt } from '../engine/engine';

const emptyGrid = (name: GridField['name'], bbox: [number, number, number, number], t: number): GridField => ({ name, width: 1, height: 1, bbox, resKm: 0, t, data: new Float32Array(1) });

/**
 * Talks to the FastAPI service (apps/api) over WS /ws/live and REST /api/v1.
 * The Python engine port streams cells, strikes, alerts, sensors and scores (no rasters),
 * so raster layers show as unavailable in this mode rather than being faked locally.
 */
export class ApiAdapter implements DataAdapter {
  readonly id = 'api' as const;
  readonly label = 'VAJRA API (FastAPI /ws/live)';
  private ws: WebSocket | null = null;

  async start(scenarioId: string, onSnapshot: (s: Snapshot) => void) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws/live?scenario=${encodeURIComponent(scenarioId)}`);
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type !== 'snapshot') return;
        const d = msg.data;
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
      } catch {
        /* ignore malformed frames */
      }
    };
  }
  async command(cmd: DirectorCommand): Promise<CitizenReport | null> {
    const r = await fetch('/api/v1/director', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    return r.ok ? ((await r.json()) as CitizenReport | null) : null;
  }
  async frameAt(): Promise<FrameAt | null> {
    return null;
  }
  async pointNowcast(lat: number, lon: number, leadMin: number): Promise<PointNowcast | null> {
    const r = await fetch(`/api/v1/nowcast?lat=${lat}&lon=${lon}&lead=${leadMin}`);
    return r.ok ? r.json() : null;
  }
  async capXml(alertId: string) {
    const r = await fetch(`/api/v1/alerts/${encodeURIComponent(alertId)}/cap.xml`);
    return r.ok ? r.text() : null;
  }
  stop() {
    this.ws?.close();
  }
}
