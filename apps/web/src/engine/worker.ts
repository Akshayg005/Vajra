/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import type { DirectorCommand, WorldSnapshot } from '@vajra/contracts';
import { LIVE_RATE, TICK_MS, World, type FrameAt } from './engine';
import { capXml } from './alerts';

export type WorkerSnapshot = WorldSnapshot & { changed: Record<string, boolean> };
export interface StartOptions {
  scenarioId: string;
  seed: number;
  locked: boolean;
  speed: number;
  paused: boolean;
}

let world: World | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let listener: ((s: WorkerSnapshot) => void) | null = null;

function emit() {
  if (!world || !listener) return;
  const snap = world.snapshot();
  const buffers: Transferable[] = [snap.dbz.data.buffer, snap.ctt.data.buffer, snap.confidence.data.buffer, snap.nwp.data.buffer, snap.density.data.buffer];
  listener(Comlink.transfer(snap, buffers));
}

const api = {
  /** Start (or restart after a crash) with an explicit seed so a restart reproduces the same world. */
  async start(opts: StartOptions, onSnapshot: (s: WorkerSnapshot) => void) {
    world = new World(opts.scenarioId, { seed: opts.seed, locked: opts.locked, clock: () => Date.now() });
    world.speed = opts.speed;
    world.paused = opts.paused;
    listener = onSnapshot;
    emit();
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!world) return;
      if (!world.paused) world.step(TICK_MS * LIVE_RATE * world.speed);
      emit();
    }, TICK_MS);
    return { tickMs: TICK_MS, liveRate: LIVE_RATE, seed: world.seed, baseSeed: world.baseSeed };
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
  /** test hook for the auto-recovery path (Director Mode "crash worker") */
  crash() {
    setTimeout(() => {
      throw new Error('VAJRA worker crash (simulated)');
    }, 0);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
  },
};

export type EngineApi = typeof api;
Comlink.expose(api);
