# VAJRA: 6-minute demo script

Setup before judges arrive:
- Run `.\scripts\rehearsal.ps1 -Seed 2026`, or open `http://localhost:5173/?seed=2026#/welcome`.
- With the seed locked, storms, alerts and faults are identical on every run.
- If using a projector, press **P** for projector mode.
- Keep a second tab open on `#/public` in phone view (DevTools device mode, 390×844).

| Time | Screen | Say (short) | Do / Director trigger |
| --- | --- | --- | --- |
| 0:00–0:30 | `/welcome` hero | "Lightning kills about 2,500 people a year in India. Most were outdoors and had no warning. VAJRA gives a 0–3 hour warning down to the panchayat." | Let the lightning and 3D cloud play. Point at the live stats (cells, strikes/min, CSI, warnings). They come from the running engine. |
| 0:30–0:50 | `/welcome` scroll | "One engine drives every screen." | Scroll through the parallax storm and the choreography; stop on "Open the live Command Center" and click it. |
| 0:50–1:50 | `/` Command Center | "Radar mosaic, lightning by type and polarity, nowcast bands out to 3 h, and a hatched 3–6 h outlook marked low confidence. Each cell is tracked with a 60-min cone." | Toggle Satellite IR on and off. Drag the **time scrubber** to +60 min (`]` ×4), then `0` to return. Click a red cell → **Cell Inspector**: dBZ, echo top, VIL, flash rate, CTT cooling, ETA to districts. |
| 1:50–2:30 | Cell Inspector → XAI | "Every probability explains itself. These contributions add up exactly to the number shown." | Show the XAI bars and the plain-language reason. Mention the multi-task outputs: lightning, hail, gust, heavy rain. |
| 2:30–3:00 | **Director: lightning jump** | "Watch this storm's flash rate." | **Shift+D → Force a lightning jump** on that cell. The event log shows "+x σ"; the cell gets the ⚡ badge. A red draft appears and auto-issues, with a red toast and lightning flash. |
| 3:00–3:50 | `/alerts` | "Impact, not just weather: people exposed, farmers in fields, schools, substations, fishing boats. Warned areas go down to the panchayat." | Open the red alert. Switch the bulletin language (Hindi → Bengali). Click **CAP 1.2** and **CSV**. Show **Merge** / **Suppress** (the fatigue guard). Point at the SMS / WhatsApp / siren counters. |
| 3:50–4:30 | `/public` on a phone | "What a farmer in Bardhaman sees." | Search "Bardhaman": red card with lightning, risk dial, countdown, 30-30 rule, nearest shelter. Pick the **Farmer** persona. Switch the language. |
| 4:30–5:00 | `/verification` | "We score ourselves. CSI is about 0.4 at 30 min and falls with lead time. It beats extrapolation and persistence, and it isn't perfect. That's what honest numbers look like." | Show skill vs lead and the reliability diagram. |
| 5:00–5:30 | **Director: sensor failure + crash drill** | "Real networks fail." | **Trigger a sensor failure** (DWR Kolkata dropout). `/sensors` shows it excluded, then re-admitted after probation. Then run the **Resilience drill**: the engine worker crashes and recovers by itself with the same seed. |
| 5:30–6:00 | `/storm3d` then close | "Here's the storm the forecaster is looking at, shaped by its live life cycle and flash rate. Same contracts plug into DWR, INSAT, the lightning network and NWP. Runs fully offline." | Toggle **Realistic cloud ↔ Radar volume**. End on the cloud. |

Backup lines:
- **If asked about the assistant:** open `/assistant` and ask "Will lightning hit Patna in the next hour?" in Hindi. The answer streams, with map and chart cards.
- **If the projector washes out colours:** press **P**. Severity always has an icon and text as well as colour.
- **If something freezes:** press `Esc`, then Shift+D → Resilience drill. The app recovers without reloading.
