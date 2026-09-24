/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import type { DirectorCommand, WorldSnapshot } from '@vajra/contracts';
import { LIVE_RATE, TICK_MS, World, type FrameAt } from './engine';
import { capXml } from './alerts';

let world: World | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let listener: ((s: WorldSnapshot & { changed: Record<string, boolean> }) => void) | null = null;

function buffersOf(s: WorldSnapshot): Transferable[] {
  const b: Transferable[] = [s.dbz.data.buffer, s.ctt.data.buffer, s.confidence.data.buffer, s.nwp.data.buffer, s.density.data.buffer];
  return b;
}

function emit() {
  if (!world || !listener) return;
  const snap = world.snapshot();
  listener(Comlink.transfer(snap, buffersOf(snap)));
}

const api = {
  async start(scenarioId: string, onSnapshot: (s: WorldSnapshot & { changed: Record<string, boolean> }) => void) {
    world = new World(scenarioId);
    listener = onSnapshot;
    emit();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!world) return;
      if (!world.paused) world.step(TICK_MS * LIVE_RATE * world.speed);
      emit();
    }, TICK_MS);
    return { tickMs: TICK_MS, liveRate: LIVE_RATE };
  },
  command(cmd: DirectorCommand) {
    if (!world) return null;
    const r = world.command(cmd);
    emit();
    return r;
  },
  frameAt(offsetMin: number): FrameAt | null {
    if (!world) return null;
    const f = world.frameAt(offsetMin);
    return Comlink.transfer(f, [f.dbz.data.buffer]);
  },
  pointNowcast(lat: number, lon: number, lead: number) {
    return world ? world.pointNowcast(lat, lon, lead) : null;
  },
  capXml(alertId: string) {
    const a = world?.alerts.alerts.find((x) => x.id === alertId);
    return a ? capXml(a) : null;
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
};

export type EngineApi = typeof api;
Comlink.expose(api);
