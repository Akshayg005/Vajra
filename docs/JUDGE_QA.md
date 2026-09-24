# Judge Q&A sheet

**Q: Is this real data?**
No. This is a prototype running on a seeded, physics-guided simulator, and the UI says so.

Every feed sits behind a `DataAdapter` with the same interface as the real-feed stubs:
- DWR (ODIM/HDF5)
- INSAT-3DR/3DS via MOSDAC
- the lightning network
- NWP (GRIB2)
- AWS

Swapping in real feeds does not touch the UI. The FastAPI service already streams the same contracts over `/ws/live`.

**Q: What is the AI here?**
- **Nowcasting:** optical-flow motion (block matching) plus semi-Lagrangian advection, plus a learned life-cycle growth/decay term and a convective-initiation term.
- **Classification:** one multi-task logistic model gives P(thunderstorm), P(lightning), P(hail), P(gust > 50 km/h) and P(heavy rain) from radar, satellite, lightning and environment features.
- **Explainability:** contributions are computed so they sum exactly to the probability shown, and there is a unit test for that.
- **Production path:** a ConvLSTM/UNet or diffusion nowcaster trained on DWR mosaics would replace the growth term, keeping the same XAI contract (SHAP).

**Q: How do you detect severe storms early?**
- **Lightning jump:** Schultz et al. 2σ algorithm on the 2-min change in flash rate. It typically leads severe weather by 10–30 min.
- **Satellite:** cloud-top cooling over about 15 min.
- **Radar:** VIL and echo top (overshooting top above about 14.5 km).

**Q: Why should we trust the numbers?**
- The Verification Lab stores every forecast and scores it later against the "truth" grid:
  - POD, FAR, CSI, ETS
  - FSS at 24 km
  - Brier score and reliability
- It compares VAJRA with optical-flow extrapolation and persistence.
- Scores fall with lead time. CSI is about 0.35–0.6 at 30 min and about 0.2 at 2–3 h. We kept them realistic on purpose.

**Q: How do you avoid alert fatigue?**
- Overlapping warnings for the same storm are **merged**, and repeats within the cooldown are **suppressed**.
- Forecasters can edit polygons, merge or suppress.
- Only red drafts auto-issue at once. Others auto-issue after 3 min if nobody acts.

**Q: Maps and boundaries?**
- The India outline is from the DataMeet Survey-of-India-compliant set (CC BY 4.0), including all of J&K and Ladakh.
- State and district layers are bundled offline.
- There are no IMD or MoES logos.

**Q: Does it work offline, and on a weak laptop?**
- Yes, it works offline. Everything is bundled, and a Playwright test blocks external requests.
- GPU effects render at reduced resolution and pause when off-screen:
  - the lightning shader at 60 %
  - the raymarched cloud at ~0.45 MP, with adaptive DPR
- Projector mode (P) raises contrast.

**Q: Languages and accessibility?**
- 8 languages: English, Hindi, Marathi, Bengali, Odia, Tamil, Telugu, Kannada.
- Severity always has icon + text + colour, never colour alone.
- There is a skip link.
- `prefers-reduced-motion` is honoured.

**Q: How does it scale to all of India?**
- **Ingest:** feeds come in through Kafka / WIS 2.0.
- **Storage:** tiles as Zarr/COG, and PostGIS for alerts and reports.
- **Compute:**
  - GPU inference service for the nowcast
  - Flink for the lightning jump
  - tiled rasters served to clients
- **Delivery:** CAP 1.2 to SACHET for SMS, cell broadcast and sirens. The front end already consumes the WebSocket contract.

**Q: Security?**
- No secrets in the bundle. The LLM key is server-side only, read from `ANTHROPIC_API_KEY`.
- Zod and pydantic validation, input sanitisation, CSV formula-injection guard.
- CSP and security headers, a CORS allow-list, per-IP rate limits.
- `npm audit` and `pip-audit` both report 0 known vulnerabilities.

**Q: What if the backend dies during the demo?**
- The UI silently falls back to the in-browser engine with the same seed.
- If the engine worker crashes, it restarts with the same seed. You can show this live with Director → Resilience drill.

**Q: What would you build next?**
See the top 5 upgrades in [AUDIT_REPORT.md](AUDIT_REPORT.md).
