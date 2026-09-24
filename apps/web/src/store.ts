import { create } from 'zustand';
import type { CitizenReport, DirectorCommand, NowcastFrame, StormCell } from '@vajra/contracts';
import type { DataAdapter, Snapshot, SourceStatus } from './data/adapters';
import type { FrameAt } from './engine/engine';

export type LayerKey = 'radar' | 'satellite' | 'lightning' | 'nowcast' | 'extended' | 'cells' | 'tracks' | 'alerts' | 'confidence' | 'rings' | 'reports' | 'districts' | 'cities' | 'assets' | 'imagery';
export type BandKey = 'all' | '0-30' | '30-60' | '60-120' | '120-180';
export type DetailKind = 'cell' | 'alert' | 'strike' | 'report' | 'sensor' | 'asset' | 'city';
export interface Detail {
  kind: DetailKind;
  id: string;
}

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked (private mode) - the app works without it */
  }
};

const LAYERS_DEFAULT: Record<LayerKey, boolean> = { radar: true, satellite: false, lightning: true, nowcast: true, extended: true, cells: true, tracks: true, alerts: true, confidence: false, rings: false, reports: true, districts: true, cities: true, assets: false, imagery: false };
const OPACITY_DEFAULT: Record<LayerKey, number> = { radar: 0.92, satellite: 0.85, lightning: 1, nowcast: 0.9, extended: 0.55, cells: 1, tracks: 1, alerts: 1, confidence: 0.95, rings: 1, reports: 1, districts: 1, cities: 0.9, assets: 1, imagery: 1 };

interface State {
  adapter: DataAdapter | null;
  source: SourceStatus;
  apiOnline: boolean;
  llmOnline: boolean;
  seed: number;
  seedLocked: boolean;
  snap: Snapshot | null;
  prevCells: Map<string, StormCell>;
  receivedAt: number;
  nowcast: NowcastFrame[];
  selectedCellId: string | null;
  detail: Detail | null;
  layers: Record<LayerKey, boolean>;
  opacity: Record<LayerKey, number>;
  band: BandKey;
  scrubMin: number;
  frame: FrameAt | null;
  frameLoading: boolean;
  playing: boolean;
  speed: number;
  directorOpen: boolean;
  introDone: boolean;
  projector: boolean;
  pickMode: null | 'spawn' | 'report';
  spawnType: StormCell['type'];
  seenAlerts: Set<string>;
  toast: { id: number; text: string; severity?: string } | null;
  setAdapter: (a: DataAdapter) => void;
  setSource: (s: SourceStatus) => void;
  setApi: (online: boolean, llm: boolean) => void;
  setSeed: (seed: number, locked: boolean) => void;
  ingest: (s: Snapshot) => void;
  select: (id: string | null) => void;
  openDetail: (d: Detail | null) => void;
  toggleLayer: (k: LayerKey, v?: boolean) => void;
  setOpacity: (k: LayerKey, v: number) => void;
  setBand: (b: BandKey) => void;
  setScrub: (m: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setDirector: (o: boolean) => void;
  setIntroDone: () => void;
  setProjector: (p: boolean) => void;
  setPickMode: (m: State['pickMode']) => void;
  setSpawnType: (t: StormCell['type']) => void;
  send: (cmd: DirectorCommand) => Promise<CitizenReport | null>;
  showToast: (text: string, severity?: string) => void;
}

let scrubReq = 0;
let toastSeq = 0;

export const useStore = create<State>((set, get) => ({
  adapter: null,
  source: 'local',
  apiOnline: false,
  llmOnline: false,
  seed: 0,
  seedLocked: false,
  snap: null,
  prevCells: new Map(),
  receivedAt: 0,
  nowcast: [],
  selectedCellId: null,
  detail: null,
  layers: LAYERS_DEFAULT,
  opacity: OPACITY_DEFAULT,
  band: 'all',
  scrubMin: 0,
  frame: null,
  frameLoading: false,
  playing: true,
  speed: 1,
  directorOpen: false,
  introDone: readLS('vajra.introSkipped') === '1' || new URLSearchParams(location.search).has('nointro'),
  projector: readLS('vajra.projector') === '1',
  pickMode: null,
  spawnType: 'supercell',
  seenAlerts: new Set(),
  toast: null,
  setAdapter: (a) => set({ adapter: a }),
  setSource: (s) => set({ source: s }),
  setApi: (online, llm) => set({ apiOnline: online, llmOnline: llm }),
  setSeed: (seed, locked) => set({ seed, seedLocked: locked }),
  ingest: (s) => {
    const prev = get().snap;
    const prevCells = new Map<string, StormCell>();
    if (prev) for (const c of prev.cells) prevCells.set(c.id, c);
    const patch: Partial<State> = { snap: s, prevCells, receivedAt: performance.now() };
    if (s.nowcast.length) patch.nowcast = s.nowcast;
    if (prev && prev.scenario.id !== s.scenario.id) {
      patch.nowcast = s.nowcast;
      patch.selectedCellId = null;
      patch.detail = null;
      patch.seenAlerts = new Set();
    }
    const seen = new Set(get().seenAlerts);
    for (const a of s.alerts) {
      const key = a.id + a.severity + a.status;
      if (!seen.has(key) && (a.status === 'active' || a.status === 'updated')) {
        seen.add(key);
        if (prev && (a.severity === 'red' || a.severity === 'orange')) patch.toast = { id: ++toastSeq, text: `${a.severity.toUpperCase()} · ${a.headline}`, severity: a.severity };
      }
    }
    patch.seenAlerts = seen;
    const sel = get().selectedCellId;
    if (sel && !s.cells.some((c) => c.id === sel) && prev?.cells.some((c) => c.id === sel)) {
      patch.toast = { id: ++toastSeq, text: `Storm ${sel} has dissipated`, severity: 'green' };
      patch.selectedCellId = null;
      if (get().detail?.kind === 'cell') patch.detail = null;
    }
    set(patch);
    const m = get().scrubMin;
    if (m !== 0 && get().adapter && s.stats.tick % 8 === 0) get().setScrub(m);
  },
  select: (id) => set({ selectedCellId: id, detail: id ? { kind: 'cell', id } : get().detail?.kind === 'cell' ? null : get().detail }),
  openDetail: (d) => set({ detail: d, selectedCellId: d?.kind === 'cell' ? d.id : get().selectedCellId }),
  toggleLayer: (k, v) => set((st) => ({ layers: { ...st.layers, [k]: v ?? !st.layers[k] } })),
  setOpacity: (k, v) => set((st) => ({ opacity: { ...st.opacity, [k]: v } })),
  setBand: (b) => set({ band: b }),
  setScrub: (m) => {
    set({ scrubMin: m });
    const a = get().adapter;
    if (!a) return;
    if (Math.abs(m) < 2.5) {
      set({ frame: null, frameLoading: false });
      return;
    }
    const req = ++scrubReq;
    set({ frameLoading: true });
    void a.frameAt(m).then((f) => {
      if (req === scrubReq) set({ frame: f, frameLoading: false });
    });
  },
  setPlaying: (p) => {
    set({ playing: p });
    void get().adapter?.command({ type: 'pause', value: !p });
  },
  setSpeed: (s) => {
    set({ speed: s });
    void get().adapter?.command({ type: 'speed', value: s });
  },
  setDirector: (o) => set({ directorOpen: o }),
  setIntroDone: () => {
    writeLS('vajra.introSkipped', '1');
    set({ introDone: true });
  },
  setProjector: (p) => {
    writeLS('vajra.projector', p ? '1' : '0');
    set({ projector: p });
  },
  setPickMode: (m) => set({ pickMode: m }),
  setSpawnType: (t) => set({ spawnType: t }),
  send: async (cmd) => {
    const a = get().adapter;
    if (!a) return null;
    if (cmd.type === 'scenario' || cmd.type === 'reset' || cmd.type === 'seed') set({ scrubMin: 0, frame: null, selectedCellId: null, detail: null });
    if (cmd.type === 'seed') set({ seed: cmd.value, seedLocked: cmd.lock });
    return a.command(cmd);
  },
  showToast: (text, severity) => set({ toast: { id: ++toastSeq, text, severity } }),
}));

export const selectedCell = (s: State) => s.snap?.cells.find((c) => c.id === s.selectedCellId) ?? null;
