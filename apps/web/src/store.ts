import { create } from 'zustand';
import type { DirectorCommand, NowcastFrame, StormCell, CitizenReport } from '@vajra/contracts';
import type { DataAdapter, Snapshot } from './data/adapters';
import type { FrameAt } from './engine/engine';

export type LayerKey = 'radar' | 'satellite' | 'lightning' | 'nowcast' | 'extended' | 'cells' | 'tracks' | 'alerts' | 'confidence' | 'rings' | 'reports' | 'districts' | 'imagery';
export type BandKey = 'all' | '0-30' | '30-60' | '60-120' | '120-180';

interface State {
  adapter: DataAdapter | null;
  snap: Snapshot | null;
  /** previous cells (for easing between ticks) */
  prevCells: Map<string, StormCell>;
  receivedAt: number;
  nowcast: NowcastFrame[];
  selectedCellId: string | null;
  layers: Record<LayerKey, boolean>;
  band: BandKey;
  scrubMin: number;
  frame: FrameAt | null;
  playing: boolean;
  speed: number;
  directorOpen: boolean;
  introDone: boolean;
  pickMode: null | 'spawn' | 'report';
  spawnType: StormCell['type'];
  lang: string;
  seenAlerts: Set<string>;
  toast: { id: number; text: string; severity?: string } | null;
  setAdapter: (a: DataAdapter) => void;
  ingest: (s: Snapshot) => void;
  select: (id: string | null) => void;
  toggleLayer: (k: LayerKey, v?: boolean) => void;
  setBand: (b: BandKey) => void;
  setScrub: (m: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setDirector: (o: boolean) => void;
  setIntroDone: () => void;
  setPickMode: (m: State['pickMode']) => void;
  setSpawnType: (t: StormCell['type']) => void;
  setLang: (l: string) => void;
  send: (cmd: DirectorCommand) => Promise<CitizenReport | null>;
  showToast: (text: string, severity?: string) => void;
}

let scrubReq = 0;

export const useStore = create<State>((set, get) => ({
  adapter: null,
  snap: null,
  prevCells: new Map(),
  receivedAt: 0,
  nowcast: [],
  selectedCellId: null,
  layers: { radar: true, satellite: false, lightning: true, nowcast: true, extended: true, cells: true, tracks: true, alerts: true, confidence: false, rings: false, reports: true, districts: true, imagery: false },
  band: 'all',
  scrubMin: 0,
  frame: null,
  playing: true,
  speed: 1,
  directorOpen: false,
  introDone: (() => {
    try {
      return sessionStorage.getItem('vajra.intro') === '1' || new URLSearchParams(location.search).has('nointro');
    } catch {
      return false;
    }
  })(),
  pickMode: null,
  spawnType: 'supercell',
  lang: 'en',
  seenAlerts: new Set(),
  toast: null,
  setAdapter: (a) => set({ adapter: a }),
  ingest: (s) => {
    const prev = get().snap;
    const prevCells = new Map<string, StormCell>();
    if (prev) for (const c of prev.cells) prevCells.set(c.id, c);
    const patch: Partial<State> = { snap: s, prevCells, receivedAt: performance.now() };
    if (s.nowcast.length) patch.nowcast = s.nowcast;
    if (prev && prev.scenario.id !== s.scenario.id) {
      patch.nowcast = s.nowcast;
      patch.selectedCellId = null;
      patch.seenAlerts = new Set();
    }
    // toast for brand-new orange/red alerts
    const seen = new Set(get().seenAlerts);
    for (const a of s.alerts) {
      if (!seen.has(a.id + a.severity) && (a.status === 'active' || a.status === 'updated')) {
        seen.add(a.id + a.severity);
        if (prev && (a.severity === 'red' || a.severity === 'orange')) patch.toast = { id: Date.now(), text: `${a.severity.toUpperCase()} · ${a.headline}`, severity: a.severity };
      }
    }
    patch.seenAlerts = seen;
    set(patch);
    // keep the scrubbed forecast frame fresh
    const m = get().scrubMin;
    if (m !== 0 && get().adapter && s.stats.tick % 8 === 0) get().setScrub(m);
  },
  select: (id) => set({ selectedCellId: id }),
  toggleLayer: (k, v) => set((st) => ({ layers: { ...st.layers, [k]: v ?? !st.layers[k] } })),
  setBand: (b) => set({ band: b }),
  setScrub: (m) => {
    set({ scrubMin: m });
    const a = get().adapter;
    if (!a) return;
    if (Math.abs(m) < 2.5) {
      set({ frame: null });
      return;
    }
    const req = ++scrubReq;
    a.frameAt(m).then((f) => {
      if (req === scrubReq) set({ frame: f });
    });
  },
  setPlaying: (p) => {
    set({ playing: p });
    get().adapter?.command({ type: 'pause', value: !p });
  },
  setSpeed: (s) => {
    set({ speed: s });
    get().adapter?.command({ type: 'speed', value: s });
  },
  setDirector: (o) => set({ directorOpen: o }),
  setIntroDone: () => {
    try {
      sessionStorage.setItem('vajra.intro', '1');
    } catch {
      /* storage blocked */
    }
    set({ introDone: true });
  },
  setPickMode: (m) => set({ pickMode: m }),
  setSpawnType: (t) => set({ spawnType: t }),
  setLang: (l) => set({ lang: l }),
  send: async (cmd) => {
    const a = get().adapter;
    if (!a) return null;
    if (cmd.type === 'scenario' || cmd.type === 'reset' || cmd.type === 'seed') set({ scrubMin: 0, frame: null, selectedCellId: null });
    return a.command(cmd);
  },
  showToast: (text, severity) => set({ toast: { id: Date.now(), text, severity } }),
}));

export const selectedCell = (s: State) => s.snap?.cells.find((c) => c.id === s.selectedCellId) ?? null;
