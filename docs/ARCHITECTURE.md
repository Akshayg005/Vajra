# VAJRA architecture

## 1. System overview

```mermaid
flowchart LR
  subgraph Sources["Observation sources (adapters)"]
    SIM["SimulationAdapter<br/>(default, offline, seeded)"]
    DWR["DWR radar stub"]
    SAT["INSAT-3DR/3DS · MOSDAC stub"]
    LLN["Lightning network stub"]
    NWP["NWP stub"]
    AWS["AWS stub"]
  end

  subgraph Worker["Web Worker (Comlink)"]
    ENG["World engine<br/>cells · strikes · fields · sensors"]
    NOW["Nowcaster<br/>optical flow + advection + learned growth + CI"]
    MOD["Multi-task logistic model<br/>+ exact additive XAI"]
    ALM["Alert manager<br/>draft → issue · merge · suppress · CAP 1.2"]
    VER["Verifier<br/>POD FAR CSI ETS FSS Brier reliability"]
  end

  subgraph UI["React app (main thread)"]
    ST["Zustand store<br/>one world snapshot"]
    SEL["Shared selectors<br/>(counts agree everywhere)"]
    PAGES["Routes: Command · Alerts · 3D · Compare · Verification ·<br/>Sensors · Reports · Assistant · Analytics · Citizen · Welcome"]
  end

  subgraph API["FastAPI (optional)"]
    REST["/api/v1/* REST"]
    WS["/ws/live WebSocket"]
    LLM["Assistant proxy<br/>(ANTHROPIC_API_KEY server-side)"]
    DB[("SQLite")]
  end

  SIM --> ENG
  DWR -.-> ENG
  SAT -.-> ENG
  LLN -.-> ENG
  NWP -.-> ENG
  AWS -.-> ENG
  ENG --> NOW --> MOD --> ALM
  ENG --> VER
  NOW --> VER
  Worker -- "snapshot @ 4 Hz" --> ST --> SEL --> PAGES
  PAGES -- "commands (director, alert actions)" --> Worker
  WS -- "snapshots (ApiAdapter)" --> ST
  PAGES -- "chat" --> LLM
  REST --> DB
```

## 2. Data flow per tick

```mermaid
sequenceDiagram
  autonumber
  participant C as Clock (real IST, speed ×1/×5/×20)
  participant W as World (worker)
  participant N as Nowcaster
  participant A as AlertManager
  participant S as Store (UI)
  C->>W: tick(dt) every 250 ms
  W->>W: cells: envelope → dBZ → echo top → VIL → flash rate (EMA) → CTT (history-based)
  W->>W: Poisson strikes (CG ≈ 22 %, +CG share), 2σ lightning-jump test
  W->>W: sensors: faults, detectors with hysteresis, trust weights
  W->>N: every 5 sim-min: render dBZ grid, block-match motion, advect 0–180 min
  N->>N: learned-lifecycle growth (imperfect skill), CI term, neighbourhood probability
  N->>A: cell probabilities + XAI contributions (sum = P exactly)
  A->>A: severity → draft; auto-issue red / after 3 min; fatigue guard (merge/suppress)
  W->>W: Verifier stores forecasts, scores them when truth arrives
  W-->>S: snapshot (latency jitter 40–400 ms, occasional dropout)
  S-->>S: selectors: live alerts, worst severity, impact totals
```

## 3. Resilience

```mermaid
stateDiagram-v2
  [*] --> Local: default
  Local --> Api: ?source=api and /health ok
  Api --> Local: WS closed / health fails → "API lost" chip, same seed
  Local --> Restarting: worker error / crash drill
  Restarting --> Local: new worker, same seed, state rebuilt (spin-up)
  Api --> Api: 20 s health probe
```

- **Worker crash:** `SimulationAdapter.recover()` starts a new worker with the same seed and scenario. The UI shows a "recovering" chip and never goes blank.
- **API down:** the Vite dev plugin answers `/api/v1/health` with `{ok:false}` rather than a proxy 500. The UI stays on the local engine.
- **Per-route error boundaries:** a crash in one page shows a retry card; the rest of the app keeps running.
- **Offline:** the basemap, boundaries, textures, fonts and three.js assets are all bundled. The Playwright offline test blocks all external requests.

## 4. Engine physics coupling

```mermaid
flowchart LR
  ENV["Life-cycle envelope<br/>initiation → growth → mature → decay"] --> DBZ["max dBZ<br/>(bounded change per tick)"]
  DBZ --> TOP["echo top km"]
  DBZ --> VIL["VIL (Greene-Clark, 56 dBZ hail cap)"]
  TOP --> FR["flash rate ∝ H^4.9 (Price-Rind), EMA"]
  TOP --> CTT["cloud-top temp = 303 − 6.5·H (floor 192 K)"]
  CTT --> COOL["cooling K/15 min (from history)"]
  FR --> JUMP["2σ lightning jump (Schultz)"]
  FR --> STR["Poisson strikes"]
  DBZ & TOP & VIL & FR & COOL & JUMP --> P["model P(thunderstorm), P(lightning), P(squall), P(hail)"]
```

## 5. Front-end structure

| Layer | Files | Notes |
| --- | --- | --- |
| Engine (worker) | `src/engine/*` | The only place randomness is allowed: `mulberry32` + simplex noise, enforced by ESLint |
| Adapters | `src/data/adapters.ts`, `apiAdapter.ts` | Same `DataAdapter` interface for simulation, API and real-feed stubs |
| Store | `src/store.ts`, `src/selectors.ts` | One snapshot; derived counts come only from selectors |
| Map | `src/map/*` | MapLibre GL 6 + deck.gl `MapboxOverlay`, bitmap rasters (retired after 3 s to avoid GPU detach warnings) |
| Storm UI kit | `src/components/ui/*` | `Lightning` (WebGL, Odyssey), `VolumetricStorm` (full-screen volumetric raymarcher: tileable Perlin-Worley 3D noise, HG phase, multiple-scattering octaves, adaptive stepping and resolution), `RealisticStorm` (lightweight hero cloud), `ParallaxStorm`, `ScrollChoreography`, `SqueezeCarousel`, `LiquidEffectAnimation`, `Reveal`, `StormHero` |
| Pages | `src/pages/*` | Route-level lazy chunks; three.js and ECharts load on demand |

Budget: the initial JS is about 119 KB gzip. The map chunk (about 540 KB gzip) loads with the Command Center. three.js, ECharts and liquid1 are lazy.

## 6. Backend

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/health` | Engine status, LLM availability |
| `GET /api/v1/nowcast?lat&lng` | Point nowcast (probabilities, ETA, XAI) |
| `GET /api/v1/cells` · `GET /api/v1/alerts` | Current cells and alerts |
| `GET /api/v1/alerts/{id}/cap.xml` | CAP 1.2 XML |
| `POST /api/v1/reports` · `GET /api/v1/reports` | Citizen reports (sanitised, rate-limited, stored in SQLite) |
| `POST /api/v1/assistant` | Grounded assistant; LLM phrasing only when a key is configured |
| `POST /api/v1/director` | Demo controls |
| `WS /ws/live` | Snapshot stream |

Security:
- CORS allow-list from `VAJRA_CORS_ORIGINS`
- sliding-window rate limits
- CSP and security headers
- pydantic validation and input sanitisation
- the LLM key never leaves the server
