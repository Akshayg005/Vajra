"""VAJRA API (FastAPI). Swagger UI at /docs.

Endpoints mirror packages/contracts (v1). The web app works fully without this service; it uses it for the
alert log, the SQLite report store, the CAP endpoint, the LLM proxy and (with ?source=api) the Python engine.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from . import db, llm
from .cap import build_cap
from .engine import SCENARIOS, World
from .schemas import AssistantIn, AssistantOut, CitizenReport, DirectorIn, PointNowcast, ReportIn

@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan, title="VAJRA API", version="1.0.0", description="Thunderstorm & lightning nowcasting prototype (SIH26072). Contracts v1.")

ORIGINS = [o.strip() for o in os.environ.get("VAJRA_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://localhost:8080").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)

_seed_env = os.environ.get("VAJRA_SEED")
world = World(os.environ.get("VAJRA_SCENARIO", "kolkata-kalbaisakhi"), int(_seed_env) if _seed_env else None)

# ---------- simple sliding-window rate limit (per client IP) ----------
LIMITS = {"default": (120, 60.0), "reports": (10, 60.0), "assistant": (20, 60.0)}
_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def _limited(bucket: str, ip: str) -> bool:
    n, win = LIMITS[bucket]
    q = _hits[(bucket, ip)]
    now = time.monotonic()
    while q and now - q[0] > win:
        q.popleft()
    if len(q) >= n:
        return True
    q.append(now)
    return False


@app.middleware("http")
async def guard(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    path = request.url.path
    bucket = "reports" if path.startswith("/api/v1/reports") and request.method == "POST" else "assistant" if path.startswith("/api/v1/assistant") else "default"
    if _limited(bucket, ip):
        return JSONResponse({"detail": "rate limit exceeded"}, status_code=429, headers={"Retry-After": "30"})
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Frame-Options"] = "DENY"
    if not path.startswith("/docs") and not path.startswith("/openapi"):
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return resp


# ---------- background engine loop ----------
async def _loop() -> None:
    while True:
        await asyncio.sleep(World.TICK_S)
        if not world.paused:
            world.step(World.TICK_S * 1000 * world.speed)
            for a in world.alerts.values():
                if a["status"] in ("active", "updated"):
                    db.log_alert(a)


# ---------- routes ----------
@app.get("/api/v1/health")
def health() -> dict:
    return {"ok": True, "engine": True, "llm": llm.enabled(), "scenario": world.sc_id, "seed": world.seed, "version": "v1"}


@app.get("/api/v1/nowcast", response_model=PointNowcast)
def nowcast(lat: float = Query(ge=5, le=40), lon: float = Query(ge=60, le=100), lead: float = Query(60, ge=0, le=360)) -> dict:
    return world.point_nowcast(lat, lon, lead)


@app.get("/api/v1/cells")
def cells() -> dict:
    return {"issuedAt": world.t, "cells": [world.cell_contract(c) for c in world.cells]}


@app.get("/api/v1/alerts")
def alerts(log: bool = False) -> dict:
    if log:
        return {"issuedAt": world.t, "alerts": db.alert_log()}
    return {"issuedAt": world.t, "alerts": list(world.alerts.values())}


@app.get("/api/v1/alerts/{alert_id}/cap.xml")
def cap(alert_id: str) -> Response:
    a = world.alerts.get(alert_id) or next((x for x in db.alert_log() if x["id"] == alert_id), None)
    if not a:
        raise HTTPException(404, "alert not found")
    return Response(build_cap(a), media_type="application/xml")


@app.post("/api/v1/reports", response_model=CitizenReport, status_code=201)
def post_report(r: ReportIn) -> dict:
    body = r.model_dump()
    if not body.get("id"):
        body["id"] = f"CR-API-{int(time.time() * 1000) % 10_000_000:07d}"
    near = [s for s in world.strikes if abs(s["t"] - body["t"]) < 15 * 60000]
    body.setdefault("status", None)
    if body["status"] is None:
        from .engine import dist_km

        n = sum(1 for s in near if dist_km((s["lng"], s["lat"]), (body["lng"], body["lat"])) < 10)
        score = min(1.0, n / 4)
        body["matchScore"] = round(score, 2)
        body["status"] = "verified" if score >= 0.5 else "unverified" if score >= 0.15 else "fake"
        body["matchReason"] = f"{n} strikes within 10 km / 15 min"
    body["matchScore"] = body.get("matchScore") or 0.0
    body["matchReason"] = body.get("matchReason") or ""
    db.save_report(body)
    return body


@app.get("/api/v1/reports")
def get_reports(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return {"reports": db.list_reports(limit)}


@app.post("/api/v1/assistant", response_model=AssistantOut)
async def assistant(q: AssistantIn) -> dict:
    answer, source = await llm.rephrase(q.question, q.draft, q.lang)
    return {"answer": answer, "source": source}


@app.post("/api/v1/director")
def director(cmd: DirectorIn) -> dict:
    if cmd.type == "scenario" and cmd.id in SCENARIOS:
        world.load(cmd.id, world.seed)
    elif cmd.type == "reset":
        world.load(world.sc_id, world.seed)
    elif cmd.type == "seed" and cmd.value is not None:
        world.load(world.sc_id, int(cmd.value))
    elif cmd.type == "speed" and cmd.value:
        world.speed = max(0.1, min(120.0, cmd.value))
    elif cmd.type == "pause":
        world.paused = bool(cmd.value)
    elif cmd.type == "spawn" and cmd.lng is not None and cmd.lat is not None:
        world.spawn(cmd.lng, cmd.lat, cmd.stormType or "supercell", cmd.strength or 1.0)
    elif cmd.type == "jump":
        c = next((x for x in world.cells if x.id == cmd.cellId), None) or (max(world.cells, key=lambda x: x.max_dbz) if world.cells else None)
        if c:
            c.strength = min(1.2, c.strength * 1.15)
            c.m += 20
    return {"ok": True}


@app.websocket("/ws/live")
async def ws_live(ws: WebSocket) -> None:
    await ws.accept()
    scen = ws.query_params.get("scenario")
    if scen and scen in SCENARIOS and scen != world.sc_id:
        world.load(scen, world.seed)
    try:
        while True:
            await ws.send_json({"type": "snapshot", "data": world.snapshot()})
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        return
