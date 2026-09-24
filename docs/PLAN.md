# VAJRA — Plan (SIH26072: AI thunderstorm & lightning nowcasting)

Status: **implemented**. This document is the plan as built. Where the build differs from the first draft, the change is noted inline.

Assumptions:
- The prototype has no live access to IMD, MOSDAC or lightning feeds, so a seeded physics-guided simulator stands in for all of them behind the same adapter interface.
- Judges use a Windows laptop, may be offline, and may be on a projector.
- The target region at launch is East and Central India (Kolkata, Bihar–Jharkhand, Odisha, Vidarbha), plus Mumbai and Delhi NCR presets.

---

## A. Requirements

### Roles
| Role | Goal | Main screens |
| --- | --- | --- |
| IMD forecaster | Spot developing storms early, issue and adjust warnings, trust the numbers | Command Center, Cell Inspector, Alert Center, Verification |
| State disaster manager (SEOC) | See the impact on people and assets, and push alerts through all channels | Alert Center (impact, delivery), Analytics |
| District officer | Know which blocks and panchayats are affected and when | Alert detail (district → block → panchayat), Compare |
| Citizen | "Am I safe in the next hour? What should I do?" | `/public` (mobile) |
| Presenter | Make a severe event happen on cue, same way every time | Director Mode (Shift+D), `?seed=` |

### User stories (selected)
1. As a forecaster, I see a cell whose flash rate jumps above 2σ, highlighted within one tick (≤ 250 ms), with a reason like "flash rate +5.2σ".
2. As a forecaster, I get a draft warning with a polygon, bulletin text and impact. I can issue, edit, merge or suppress it. Red drafts auto-issue; others auto-issue after 3 min if nobody acts.
3. As a SEOC officer, I see exposed population, farmers in fields, schools in session, airports, highways, substations and fishing boats for every live warning. I also see SMS, WhatsApp, push and siren delivery counters.
4. As a district officer, I read the warned areas as state → district → block → panchayat and download CAP 1.2 XML and CSV.
5. As a citizen, I search my town or use geolocation, and get a risk dial, arrival countdown, 30-30 timer, nearest shelter and advice for my persona, in my language.
6. As a presenter, I press Shift+D to spawn a storm by clicking the map, force a lightning jump, fail a sensor or crash the engine. The app recovers by itself.

### Functional needs
All 20 features in section B, each with click-anything drawers and live-updating values.

### Non-functional needs (targets and how each is met)
| Need | Target | How |
| --- | --- | --- |
| Map frame rate | 60 fps at 1920×1080 | deck.gl layers; bitmap rasters are updated every 5 sim-min, not every frame. The engine tick at 1× takes 1–7 ms in the worker |
| Load time | < 3 s on a laptop, from a local build | ~119 KB gzip initial JS; the map chunk loads with the Command Center; three.js and charts are lazy |
| Offline | 100 % | Bundled boundaries, textures, fonts and shaders. Playwright offline test |
| 30-min run | No memory growth | Ring buffers for strikes, history and events; bitmaps retired after 3 s; soak test at 20× |
| Colour-blind safe | Severity never by colour alone | Every severity badge has an icon and text; reflectivity LUT is perceptually ordered |
| Projector | Readable at 3 m | Projector mode (P): bigger type, higher contrast |

---

## B. Feature map

Priority: **M** = Must, **S** = Should, **X** = Stretch. All items were built.

| # | Feature | Route | Main components | Engine outputs used | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | Live Command Center map (dBZ, IR CTT, lightning CG/IC/polarity/kA with fade, 0–30/30–60/60–120/120–180 bands, hatched 3–6 h) | `/` | `MapView`, `LayerPanel`, `map/rasters.ts`, `map/vectorLayers.ts` | `GridField` dBZ/CTT, `LightningStrike[]`, `NowcastFrame` | M |
| 2 | Storm cell tracking (ID, stage, track, cone, speed/dir, type, hail/downburst) | `/` | `CellList`, `vectorLayers` | `StormCell` | M |
| 3 | Time scrubber −120 … +180 min, 1×/5×/20× | `/` | `TimeScrubber`, TopBar controls | `frameAt(lead)` | M |
| 4 | Cell Inspector (dBZ, echo top, VIL, flash rate, jump, CTT cooling, CAPE/CIN/shear/PW, sparklines, ETA to districts/panchayats) | drawer | `CellInspector`, `Sparkline` | `StormCell.history`, `env` | M |
| 5 | 3D Storm View (volume, echo top, overshooting top, charge tripole, channels) plus the new **realistic raymarched cloud** | `/storm3d` | `Storm3D`, `ui/realistic-storm` | `stormVolume`, `boltPath` | S |
| 6 | Explainable AI (contributions sum exactly, plain-language reason) | drawer | `XaiPanel` | `explain()` | M |
| 7 | Multi-task outputs P(TS), P(lightning), P(hail), P(gust>50), P(heavy rain) | drawer / citizen | `XaiPanel`, `RiskDial` | `MultiTaskProbs` | M |
| 8 | Confidence / bust map (DWR 250 km rings, initiation zones, disagreement) | `/` layer | `vectorLayers` | `radarCoverage`, CI field | S |
| 9 | Weather regime classifier with confidence | TopBar | chip | `RegimeState` (≤ 97 %) | S |
| 10 | Verification Lab (POD/FAR/CSI/ETS/FSS/Brier/reliability, vs persistence and optical flow) | `/verification` | `VerificationLab`, `EChart` | `VerificationSummary` | M |
| 11 | Coarse-to-fine (12 km NWP vs VAJRA swipe; block → panchayat) | `/compare` | `Compare` | NWP stub field vs nowcast | S |
| 12 | Impact-based warnings | `/alerts`, `/` strip | `ImpactStrip`, `AlertDetail` | `ImpactEstimate` | M |
| 13 | Alert Center (IMD colours + icon + text, polygons, bulletin, channels, CAP 1.2, counters, fatigue guard) | `/alerts` | `AlertList`, `AlertDetail`, `PolygonEditor` | `Alert`, `DeliveryCounter` | M |
| 14 | Sensor & fusion health (latency, uptime, trust; spike/frozen/drift/dropout; auto-exclude and recover) | `/sensors` | `FusionDiagram`, `SensorMap`, `AnomalyTimeline` | `SensorStatus` | S |
| 15 | Citizen reports (AI check vs radar/lightning, duplicate merge, fake flag, pins, filters) | `/reports` | `ReportForm`, list, map | `CitizenReport`, `verifyReport` | S |
| 16 | AI assistant (chat + voice, 8 languages, grounded, map/chart cards, sector advisories) | `/assistant` | `Assistant`, `MessageCards`, `speech.ts` | `pointNowcast`, snapshot | M |
| 17 | Citizen "Am I safe?" (risk, countdown, distance, 30-30, shelter, 7 personas, commute advice, share card) | `/public` | `CitizenView`, `RiskDial`, `shareCard` | `PointNowcast` | M |
| 18 | Analytics & replay (density heatmap, district ranking, preset replay; storm gallery carousel) | `/analytics` | `Analytics`, `ui/carousel-squeeze` | decayed CG density | S |
| 19 | Director Mode (Shift+D) | overlay | `DirectorPanel` | `DirectorCommand` | M |
| 20 | Cinematic intro (Earth → India, skippable) | overlay | `Intro` | – | X |
| + | Landing page with storm UI kit | `/welcome` | `StormHero`, `ParallaxStorm`, `ScrollChoreography`, `SqueezeCarousel`, `LiquidEffectAnimation`, `Lightning` | live stats | S (added later) |

---

## C. Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the Mermaid diagrams. Rules:
- The engine runs in a **Web Worker** (Comlink) and ticks every 250 ms of wall time. Snapshots go to a Zustand store. Numbers ease between snapshots (`AnimatedNumber`) at 60 fps.
- There is **one data source per session**: `SimulationAdapter` (default) or `ApiAdapter` (`?source=api`). Their world states are never mixed.
- If the API goes away, the UI **falls back** to the local engine with the same seed and shows a chip. It does not show an error page.
- The optional **FastAPI** service uses the same contracts, from `packages/contracts` (TS) and `app/schemas.py` (pydantic).

---

## D. Tech stack

| Tech | Why |
| --- | --- |
| React 18 + Vite 8 + TypeScript (strict) | Fast dev loop, typed contracts end to end |
| Tailwind 3 | Consistent tokens (storm palette, severity colours), no CSS drift |
| MapLibre GL 6 + deck.gl 9 | Open-source vector basemap offline; GPU layers for strikes, cones and polygons |
| react-three-fiber / drei / three | 3D storm, intro globe, raymarched cloud |
| Framer Motion | Scroll choreography, reveals, eased toasts and drawers |
| ECharts 6 | Verification curves, reliability, histograms |
| Zustand | One store, cheap selectors, no prop drilling |
| i18next | 8 Indian languages for the bulletin, citizen app and assistant |
| Comlink | Typed RPC to the engine worker |
| Zod | Runtime validation of API responses and forms |
| FastAPI + pydantic + SQLite | Swagger at `/docs`, CAP builder, reports and alerts log, LLM proxy, WebSocket |
| Python engine port (stretch, done) | The API can stream its own world over `/ws/live` |

---

## E. Simulation engine design

**World state** (`engine/engine.ts`): scenario, cells, strikes ring buffer, grids, sensors, alerts, reports, verifier, regime, stats. Everything is advanced by an injected clock at real IST pace (×1/×5/×20).

**Randomness:**
- `mulberry32` PRNG plus simplex noise, used only inside `engine/` (an ESLint rule forbids `Math.random` elsewhere).
- The default seed is `fnv1a(date + session)`; `?seed=` locks it.
- Id counters are kept per world, so identical seeds give identical ids.

**Storm-cell agents** (`engine/cells.ts`):
- A life-cycle envelope runs initiation → growth → mature → decay. Duration by type: pulse 30–60 min, multicell 60–120, squall line 2–4 h, supercell 2–3 h.
- Motion follows the steering wind plus noise. Squall lines are elongated (axis ratio 3–6).
- Cells can split or merge. New cells start near outflow boundaries and in the scenario's initiation zones.

**Coupled rules** (bounded change per tick, √dt noise):
- One intensity `eff = strength × envelope × env(CAPE, shear, CIN)` drives everything.
- max dBZ targets 18 + 47·eff (+4·eff for supercells) and changes by at most ~4 dBZ/min.
- Echo top targets 3 + 12.5·eff km (+ type bonus), capped at 18.5 km, and changes by at most ~0.8 km/min.
- VIL uses Greene-Clark with dBZ capped at 56 (the hail cap).
- Flash rate F = 3.44e-5·H^4.9 (Price-Rind) × jump boost, smoothed with an EMA (τ = 1 min).
- CTT = 303 − 6.5·H K, floor 192 K; cooling is measured over ~12–15 min of history.
- Probabilities come from these features (below).

**Lightning:**
- Strikes are Poisson with rate = flash rate. CG is 22 % of flashes (27 % in squall lines). +CG is 8 % of CG (15 % in supercells, 22 % in decaying cells). Peak current is lognormal, with median 24 kA for −CG, 35 kA for +CG and 8 kA for IC.
- Strike positions are Gaussian around the core, shifted downshear.

**Lightning-jump detector:**
- A Schultz-style 2σ test on the 2-min flash-rate derivative, using the previous 10 min.
- It only fires when the flash rate is above 8 fl/min.
- A jump flags the cell and raises P(severe) for 30 min.

**Nowcast:**
- Every 5 sim-min the engine renders the dBZ grid and estimates motion by block matching (optical flow).
- It then advects semi-Lagrangian to 180 min and applies a learned-lifecycle growth/decay term. That term has deliberately imperfect skill (0.2–0.8 per cell) and a bias.
- A convective-initiation term adds new-storm probability in initiation zones.
- Neighbourhood probability (≥ 35 dBZ) uses a window whose radius grows with lead: r = 1 + lead/30 cells, so 5×5 at 30 min and 15×15 at 3 h.

**Model:**
- One logistic per task over the engine features: IWV rise, CTT drop rate, CAPE, CIN, convergence, shear, flash-rate trend, dBZ.
- XAI contributions are computed in probability space so they **add up exactly** to the shown P. There is a test for this.
- Confidence is capped at 97 %.

**Verification:**
- Forecasts are stored at issue time and scored when truth arrives: categorical scores with lead-dependent tolerance (1/2/4 px on the 8 km grid), FSS, Brier and reliability bins.
- Expected ranges are CSI ≈ 0.35–0.6 at 30 min, falling with lead. At 2–3 h it is about 0.2, which is realistic.

**Priors:** regional and seasonal settings per scenario:
- CAPE/CIN ranges
- steering wind
- storm-type mix
- phase hour: afternoon peaks inland, nocturnal on the coast

**Built-in imperfections:**
- latency jitter of 40–400 ms
- about one sensor dropout every ~10 min
- one false alarm (a "bust" cell that fizzles) per scenario window
- confidence never reaches 100 %
- the alert fatigue guard sometimes merges alerts

**Scenario presets:** Kolkata Kalbaisakhi squall line · Bihar–Jharkhand lightning outbreak over farmland · Mumbai monsoon cell · Delhi NCR dust-thunder squall · Odisha coastal storm · Vidarbha–Marathwada afternoon cells.

**Budgets:**
- the engine ticks every 250 ms and takes 1–7 ms at 1×
- the nowcast grid and optical flow run every 5 sim-min (~20–40 ms in the worker)
- snapshot posting is ≤ 4 Hz
- a 240-step spin-up builds the history (tracks, sparklines, verification) before the first paint

---

## F. Data model

All types live in `packages/contracts/src/index.ts`:

`StormCell`, `LightningStrike`, `GridField`, `NowcastFrame`, `MultiTaskProbs`, `XaiContribution`, `XaiExplanation`, `AdminArea`, `ImpactEstimate`, `DeliveryCounter`, `Alert` (status `draft|active|updated|expired|merged|suppressed`, `issuedBy`, `edited`, `mergedInto`), `SensorStatus`, `CitizenReport`, `VerificationScore`, `VerificationSummary`, `RegimeState`, `Scenario`, `EngineStats` (incl. `latencyMs`), `WorldSnapshot`, `EngineEvent`, `PointNowcast`, `DirectorCommand`.

## G. API contracts (v1)

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/v1/health` | `{ ok, engine, llm, seed }` |
| GET | `/api/v1/nowcast?lat&lng&lead` | `PointNowcast` |
| GET | `/api/v1/cells` | `StormCell[]` |
| GET | `/api/v1/alerts` | `Alert[]` |
| GET | `/api/v1/alerts/{id}/cap.xml` | CAP 1.2 XML |
| POST | `/api/v1/reports` | `CitizenReport` (201) |
| GET | `/api/v1/reports` | `CitizenReport[]` |
| POST | `/api/v1/assistant` | `{ text, cards }` |
| POST | `/api/v1/director` | ack |
| WS | `/ws/live` | `WorldSnapshot` stream |

## H. Folder structure

```
apps/web/{src/{engine,data,map,components/{ui,alerts,citizen,assistant,sensors,reports},pages,lib,i18n},public/{geo,textures,shots},e2e}
apps/api/{app,tests}
packages/contracts/src
docs/  scripts/
```

## I. Design system

- **Theme** (changed from the first "cyan/violet" draft at the user's request): the storm palette.
  - amber *volt* `#f5a524`, ember `#ff7a1a`, storm blue *plasma* `#5aa9ff`
  - navy-black *ink* `#04070d` → `#223350`
  - no purple, so it does not read as "AI-generic"
- **Severity:** IMD green/yellow/orange/red are used **only** for severity, always with an icon and text.
- **Numbers:** tabular numbers (`tnum`) and a monospace font for live values. Values ease; they never flicker.
- **Motion:**
  - value changes ease over 400–600 ms
  - panels lift in on route change (60 ms stagger)
  - scroll-driven sections on `/welcome`
  - `prefers-reduced-motion` turns animation off
- **Layouts:** 1920×1080 (primary), 1366×768 (laptop: compact TopBar, impact strip clears the legend), 390 px mobile for `/public`.
- **UI kit** (`src/components/ui`): `Lightning`, `RealisticStorm`, `ParallaxStorm`, `ScrollChoreography`, `SqueezeCarousel`, `LiquidEffectAnimation`, `StormHero`, `Reveal`.

## J. Roadmap (as executed)

| Phase | Scope | Done when |
| --- | --- | --- |
| 1 | Engine + worker + store | Deterministic snapshots at 4 Hz; seed test passes |
| 2 | Map + rasters + boundaries | dBZ/CTT/lightning render offline; SoI outline |
| 3 | Cells, tracks, cones, inspector, XAI | Contributions sum exactly; drawers open on click |
| 4 | Alerts + impact + CAP | Issue/merge/suppress/edit works; CAP validates |
| 5 | Citizen view | 390 px renders; 8 languages |
| 6 | Assistant | Grounded answers; streaming; voice where supported |
| 7 | Verification, sensors, reports, analytics, compare, 3D | Realistic scores; self-healing sensors |
| 8 | API + Python port + tests + security | pytest, Vitest, Playwright green; 0 audit findings |
| 9 | Storm theme + landing + UI kit | Screens captured; e2e for landing and 3D toggle |

## K. Decisions, trade-offs and fallbacks

| Decision | Trade-off | Fallback |
| --- | --- | --- |
| Simulation behind real adapter interfaces | Not real data | Stubs show exactly how each feed maps in |
| Worker engine | Serialisation cost | Snapshots are compact; rasters are sent only every 5 sim-min |
| Raymarched cloud | GPU cost | Adaptive resolution (~0.45 MP), IntersectionObserver pause, radar-volume view |
| Weak laptop GPU | – | Lightning shaders render at 60 % resolution and pause off-screen; projector mode |
| Browsers without Web Speech | – | Text chat still works; the mic button hides |
| Offline | – | Everything bundled; online satellite basemap is off by default |
| Projector colours | – | Projector mode; severity always has icon + text |

## L. Security

- No secrets in the bundle. `ANTHROPIC_API_KEY` is read only by the API.
- Chat and report input is validated with Zod (client) and pydantic (server), and sanitised: stripped control characters, length caps, no HTML.
- The CSV export guards against formula injection.
- CSP and security headers are set. CORS uses an allow-list, and there are sliding-window rate limits on reports and the assistant.
- `npm audit` and `pip-audit` report 0 known vulnerabilities after upgrades (maplibre-gl 6, vite 8, vitest 5, fastapi latest).

## M. Scaling story

The same contracts serve real feeds:
- **Ingest:**
  - DWR volume scans (ODIM/HDF5)
  - INSAT-3DR/3DS through MOSDAC (L1C, 15/30 min)
  - lightning network (ILDN or similar, streaming)
  - NWP (WRF/NCUM GRIB2)
  - AWS (MQTT)
  - all flowing into **Kafka** topics, and to WMO **WIS 2.0** for exchange
- **Storage:** raw data in object storage (S3/MinIO) as Zarr/COG tiles; vector features, alerts and reports in **PostGIS**.
- **Compute:**
  - the nowcast service runs on GPU: a ConvLSTM/UNet or a diffusion nowcaster replaces the learned-lifecycle term; the same XAI contract uses SHAP
  - the lightning-jump detector runs on a stream processor (Flink)
- **Serving:**
  - tiled rasters (XYZ/PMTiles), WebSocket fan-out, CAP to SACHET
  - SMS/WhatsApp gateways through the NDMA CAP integrated alert system
- **Frontend:** unchanged. `ApiAdapter` already speaks `/ws/live`.

## N. Demo script

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) (6 minutes, mapped to features and Director Mode triggers).
