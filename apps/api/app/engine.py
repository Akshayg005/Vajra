"""Compact Python port of the VAJRA simulation engine (stretch goal).

Same contracts and the same physics coupling as apps/web/src/engine, without the rasters:
seeded mulberry32 PRNG -> storm agents with lifecycle -> dBZ -> echo top -> VIL -> flash rate (Price-Rind)
-> CTT -> multi-task logistic model with exact additive XAI -> IMD colour code -> alerts.
The web app uses this only with ?source=api; it never mixes this world with its local engine.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Optional

LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


class Rng:
    """mulberry32 - identical output to the TypeScript engine for the same seed."""

    def __init__(self, seed: int) -> None:
        self.a = seed & 0xFFFFFFFF

    def f(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def range(self, a: float, b: float) -> float:
        return a + (b - a) * self.f()

    def normal(self, mu: float = 0.0, sigma: float = 1.0) -> float:
        u = max(1e-9, self.f())
        v = self.f()
        return mu + sigma * math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)

    def poisson(self, lam: float) -> int:
        if lam <= 0:
            return 0
        if lam > 30:
            return max(0, round(self.normal(lam, math.sqrt(lam))))
        L, k, p = math.exp(-lam), 0, 1.0
        while True:
            k += 1
            p *= self.f()
            if p <= L:
                return k - 1


SCENARIOS = {
    "kolkata-kalbaisakhi": dict(name="Kolkata Kalbaisakhi squall line", center=(87.9, 22.9), bbox=(85.2, 21.0, 89.6, 24.7), steer=125, speed=52, cape=3400, shear=19, pw=48,
                                 cells=[(86.3, 23.9, "squall", 0.95), (86.9, 24.2, "multicell", 0.75), (87.6, 22.2, "pulse", 0.45)]),
    "bihar-jharkhand-outbreak": dict(name="Bihar-Jharkhand lightning outbreak", center=(85.6, 24.9), bbox=(83.2, 23.0, 88.0, 27.0), steer=100, speed=30, cape=3000, shear=12, pw=55,
                                      cells=[(84.6, 25.3, "multicell", 0.85), (85.1, 25.9, "pulse", 0.6), (85.8, 24.3, "multicell", 0.7)]),
    "mumbai-monsoon": dict(name="Mumbai monsoon cell", center=(72.95, 19.1), bbox=(71.4, 17.6, 74.6, 20.6), steer=75, speed=22, cape=1800, shear=9, pw=66,
                            cells=[(72.4, 19.0, "multicell", 0.8), (72.2, 18.6, "pulse", 0.55)]),
    "delhi-dust-thunder": dict(name="Delhi NCR dust-thunder squall", center=(77.1, 28.7), bbox=(74.8, 26.9, 79.4, 30.5), steer=115, speed=45, cape=2200, shear=16, pw=30,
                                cells=[(75.9, 29.4, "squall", 0.8), (76.3, 29.8, "multicell", 0.6)]),
    "odisha-coastal": dict(name="Odisha coastal storm", center=(85.8, 20.3), bbox=(83.8, 18.6, 88.0, 22.2), steer=140, speed=35, cape=3100, shear=15, pw=52,
                            cells=[(85.0, 21.0, "supercell", 0.9), (85.5, 21.4, "multicell", 0.65)]),
    "vidarbha-marathwada": dict(name="Vidarbha-Marathwada afternoon cells", center=(77.8, 20.1), bbox=(75.2, 18.2, 80.4, 22.0), steer=60, speed=25, cape=2700, shear=11, pw=38,
                                 cells=[(77.2, 19.6, "pulse", 0.7), (78.3, 20.5, "multicell", 0.8)]),
}

LIFE = {"pulse": (15, 20, 25), "multicell": (25, 60, 40), "squall": (30, 120, 60), "supercell": (30, 100, 50)}


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def smoothstep(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def move_km(lng: float, lat: float, heading: float, km: float) -> tuple[float, float]:
    h = math.radians(heading)
    return lng + math.sin(h) * km / (111.32 * math.cos(math.radians(lat))), lat + math.cos(h) * km / 111.32


def dist_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    dx = (a[0] - b[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = (a[1] - b[1]) * 111.32
    return math.hypot(dx, dy)


@dataclass
class Cell:
    id: str
    lng: float
    lat: float
    type: str
    strength: float
    born: float
    g: float
    m: float
    d: float
    heading: float
    speed: float
    max_dbz: float = 20.0
    echo_top: float = 3.0
    vil: float = 0.0
    flash_rate: float = 0.0
    ctt: float = 285.0
    cooling: float = 0.0
    stage: str = "initiation"
    track: list = field(default_factory=list)
    history: list = field(default_factory=list)
    fr_samples: list = field(default_factory=list)
    jump_until: float = 0.0
    jump_sigma: float = 0.0
    dead: bool = False


FEATURES = [
    ("iwv_rise", "IWV rise (GNSS)", "mm/h", 1.0, 1.2),
    ("ctt_drop", "Cloud-top cooling", "K/15min", 2.0, 6.0),
    ("cape_cin", "CAPE minus CIN", "J/kg", 1600.0, 900.0),
    ("convergence", "Low-level convergence", "e-5/s", 2.0, 2.5),
    ("shear", "0-6 km shear", "m/s", 12.0, 6.0),
    ("flash_trend", "Flash-rate trend", "fl/min per 10 min", 0.5, 4.0),
]
WEIGHTS = {
    "thunderstorm": (-0.9, [0.45, 0.75, 0.6, 0.5, 0.25, 0.55], 1.0),
    "lightning": (-1.1, [0.3, 0.85, 0.55, 0.35, 0.2, 0.9], 1.0),
    "hail": (-2.9, [0.1, 0.7, 0.8, 0.25, 0.75, 0.6], 0.6),
    "gust50": (-2.2, [0.05, 0.5, 0.55, 0.3, 0.85, 0.35], 0.6),
    "heavyRain": (-1.6, [0.95, 0.45, 0.3, 0.55, -0.1, 0.2], 0.6),
}


class World:
    TICK_S = 0.25

    def __init__(self, scenario: str = "kolkata-kalbaisakhi", seed: Optional[int] = None) -> None:
        self.speed = 1.0
        self.paused = False
        self.load(scenario, seed)

    def load(self, scenario: str, seed: Optional[int] = None) -> None:
        self.sc_id = scenario if scenario in SCENARIOS else "kolkata-kalbaisakhi"
        self.sc = SCENARIOS[self.sc_id]
        self.seed = seed if seed is not None else (int(time.time()) * 2654435761) & 0xFFFFFFFF
        self.rng = Rng(self.seed)
        self.t = time.time() * 1000
        self.tick = 0
        self.counter = 0
        self.cells: list[Cell] = []
        self.strikes: list[dict] = []
        self.strike_seq = 0
        self.alerts: dict[str, dict] = {}
        self.events: list[dict] = []
        for lng, lat, typ, s in self.sc["cells"]:
            c = self.spawn(lng, lat, typ, s)
            c.born = self.t - c.g * 60000 * 0.8
        for _ in range(40):
            self.step(60000)

    def spawn(self, lng: float, lat: float, typ: str, strength: float) -> Cell:
        self.counter += 1
        g, m, d = LIFE[typ]
        k = self.rng.range(0.8, 1.25)
        dev = 25 if typ == "supercell" else 5 if typ == "squall" else self.rng.normal(0, 12)
        cid = f"{LETTERS[self.counter % len(LETTERS)]}{self.counter:02d}"
        c = Cell(cid, lng, lat, typ, strength, self.t, g * k, m * k, d * k, (self.sc["steer"] + dev) % 360,
                 self.sc["speed"] * (1.2 if typ == "squall" else 1.0) * self.rng.range(0.9, 1.1))
        self.cells.append(c)
        return c

    def intensity(self, c: Cell, t: float) -> tuple[float, str]:
        age = (t - c.born) / 60000
        if age < c.g * 0.35:
            return smoothstep(0, c.g, age) * 0.9, "initiation"
        if age < c.g:
            return smoothstep(0, c.g, age), "growth"
        if age < c.g + c.m:
            return 0.92 + 0.08 * math.sin((age - c.g) / 7), "mature"
        return 1 - smoothstep(c.g + c.m, c.g + c.m + c.d, age), "decay"

    def env(self, c: Cell) -> dict:
        grow = c.stage in ("growth", "initiation")
        return {
            "capeJkg": self.sc["cape"] * (0.9 + 0.1 * math.sin(c.lng * 3)),
            "cinJkg": -35.0,
            "shear06": float(self.sc["shear"]),
            "pwMm": float(self.sc["pw"]),
            "iwvRise": 2.6 if grow else (-0.5 if c.stage == "decay" else 1.2),
            "convergence": 5.5 if grow else (-0.5 if c.stage == "decay" else 2.8),
        }

    def step(self, dt_ms: float) -> None:
        self.t += dt_ms
        self.tick += 1
        dt_min = dt_ms / 60000
        if self.rng.f() < 1 - math.exp(-5 / 60 * dt_min):
            w, s, e, n = self.sc["bbox"]
            self.spawn(self.rng.range(w + 0.3, e - 0.3), self.rng.range(s + 0.3, n - 0.3), "pulse" if self.rng.f() < 0.65 else "multicell", self.rng.range(0.4, 0.85))
        for c in self.cells:
            I, c.stage = self.intensity(c, self.t)
            prev_ctt = c.ctt
            c.max_dbz = min(72, max(10, 18 + 47 * c.strength * I + self.rng.normal(0, 0.4)))
            c.echo_top = min(18.5, max(2, 3 + 12.5 * c.strength * I))
            z = min(c.max_dbz, 56)
            c.vil = min(90, 3.44e-6 * 10 ** (z * 0.05714) * 0.42 * c.echo_top * 1000 * min(1, max(0, (c.max_dbz - 18) / 40)))
            c.flash_rate = 0.7 * c.flash_rate + 0.3 * min(160, 3.44e-5 * c.echo_top ** 4.9)
            c.ctt = min(290, max(192, 303 - 6.5 * c.echo_top))
            if dt_min > 0:
                c.cooling = 0.7 * c.cooling + 0.3 * (prev_ctt - c.ctt) / dt_min * 15
            c.lng, c.lat = move_km(c.lng, c.lat, c.heading, c.speed * dt_min / 60)
            if not c.track or self.t - c.track[-1]["t"] >= 300000:
                c.track = (c.track + [{"t": self.t, "lng": c.lng, "lat": c.lat, "maxDbz": c.max_dbz}])[-30:]
            if not c.history or self.t - c.history[-1]["t"] >= 120000:
                c.history = (c.history + [{"t": self.t, "maxDbz": c.max_dbz, "echoTopKm": c.echo_top, "vil": c.vil, "flashRate": c.flash_rate, "cttK": c.ctt}])[-45:]
                c.fr_samples = (c.fr_samples + [c.flash_rate])[-12:]
                self.detect_jump(c)
            for _ in range(min(300, self.rng.poisson(c.flash_rate * dt_min))):
                cg = self.rng.f() < 0.22
                pol = 1 if cg and self.rng.f() < 0.1 else -1
                lng, lat = move_km(c.lng, c.lat, self.rng.range(0, 360), abs(self.rng.normal(0, 6)))
                self.strike_seq += 1
                self.strikes.append({"id": self.strike_seq, "t": self.t - self.rng.range(0, dt_ms), "lng": lng, "lat": lat, "kind": "CG" if cg else "IC",
                                     "polarity": pol, "peakKa": round(24 * math.exp(self.rng.normal(0, 0.5)) if cg else 8 * math.exp(self.rng.normal(0, 0.5)), 1), "cellId": c.id})
            if (self.t - c.born) / 60000 > c.g + c.m + c.d:
                c.dead = True
        self.cells = [c for c in self.cells if not c.dead]
        cutoff = self.t - 20 * 60000
        self.strikes = [s for s in self.strikes if s["t"] >= cutoff][-6000:]
        self.update_alerts()

    def detect_jump(self, c: Cell) -> None:
        s = c.fr_samples
        if len(s) < 7:
            return
        d = [(s[i] - s[i - 1]) / 2 for i in range(1, len(s))]
        cur, prev = d[-1], d[-6:-1]
        mean = sum(prev) / len(prev)
        sd = math.sqrt(sum((x - mean) ** 2 for x in prev) / len(prev)) or 0.05
        c.jump_sigma = (cur - mean) / sd
        if cur > mean + 2 * sd and c.flash_rate > 8 and cur > 0.4 and self.t > c.jump_until:
            c.jump_until = self.t + 20 * 60000
            self.events.append({"id": len(self.events) + 1, "t": self.t, "kind": "jump", "text": f"Lightning jump in {c.id}: +{c.jump_sigma:.1f} sigma", "severity": "orange", "cellId": c.id})
            self.events = self.events[-60:]

    def features(self, c: Cell) -> list[float]:
        e = self.env(c)
        old = c.history[-6]["flashRate"] if len(c.history) >= 6 else (c.history[0]["flashRate"] if c.history else 0)
        return [e["iwvRise"], c.cooling, e["capeJkg"] - 3 * abs(e["cinJkg"]), e["convergence"], e["shear06"], c.flash_rate - old]

    def predict(self, c: Cell) -> tuple[dict, dict]:
        x = self.features(c)
        zs = [max(-3, min(3, (v - f[3]) / f[4])) for v, f in zip(x, FEATURES)]
        probs = {}
        xai = None
        for k, (b, w, pk) in WEIGHTS.items():
            bp = b + (c.max_dbz - 40) / 6 * pk
            terms = [wi * zi for wi, zi in zip(w, zs)]
            L = bp + sum(terms)
            p = min(0.97, max(0.01, sigmoid(L)))
            probs[k] = p
            if k == "thunderstorm":
                p0 = sigmoid(bp)
                ratio = 0 if abs(L - bp) < 1e-6 else (p - p0) / (L - bp)
                contribs = [{"feature": "bias", "label": "Base rate + echo intensity", "value": c.max_dbz, "unit": "dBZ", "pp": round(p0 * 100, 1), "logit": bp}]
                contribs += [{"feature": f[0], "label": f[1], "value": v, "unit": f[2], "pp": round(t * ratio * 100, 1), "logit": t} for f, v, t in zip(FEATURES, x, terms)]
                resid = round(round(p * 100, 1) - sum(ci["pp"] for ci in contribs), 1)
                big = max(range(len(contribs)), key=lambda i: abs(contribs[i]["pp"]))
                contribs[big]["pp"] = round(contribs[big]["pp"] + resid, 1)
                xai = {"target": "thunderstorm", "probability": round(p * 100, 1) / 100, "contributions": contribs, "reason": f"{round(p * 100)}% chance: echo {c.max_dbz:.1f} dBZ, cloud tops cooling {c.cooling:.1f} K/15 min."}
        return probs, xai

    @staticmethod
    def severity(p: dict, c: Cell, jump: bool) -> str:
        hazard = jump or c.flash_rate > 25 or p["gust50"] > 0.6
        if p["thunderstorm"] >= 0.7 and hazard and c.max_dbz >= 52:
            return "red"
        if p["thunderstorm"] >= 0.55 and c.max_dbz >= 45:
            return "orange"
        if p["thunderstorm"] >= 0.45 and c.max_dbz >= 40:
            return "yellow"
        return "green"

    def polygon(self, c: Cell) -> list[tuple[float, float]]:
        pts = []
        for m in (0, 45):
            clng, clat = move_km(c.lng, c.lat, c.heading, c.speed * m / 60)
            r = 14 + m / 3
            pts += [move_km(clng, clat, a, r) for a in range(0, 360, 30)]
        # convex hull
        pts = sorted(set(pts))

        def cross(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

        lower, upper = [], []
        for p in pts:
            while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
                lower.pop()
            lower.append(p)
        for p in reversed(pts):
            while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
                upper.pop()
            upper.append(p)
        hull = lower[:-1] + upper[:-1]
        return [(round(x, 4), round(y, 4)) for x, y in hull + hull[:1]]

    def update_alerts(self) -> None:
        live = {c.id for c in self.cells}
        for c in self.cells:
            probs, _ = self.predict(c)
            sev = self.severity(probs, c, self.t < c.jump_until)
            aid = f"VJA-{c.id}"
            a = self.alerts.get(aid)
            if sev == "green":
                continue
            pop = int(2500 * 800 * (0.5 + probs["thunderstorm"]))
            if a is None:
                self.alerts[aid] = a = {
                    "id": aid, "cellId": c.id, "issuedAt": self.t, "updatedAt": self.t, "expiresAt": self.t + 90 * 60000, "severity": sev,
                    "hazard": "lightning" if c.flash_rate > 8 else "thunderstorm", "headline": f"Thunderstorm & lightning near storm {c.id}",
                    "polygon": self.polygon(c), "areas": [{"level": "district", "name": "Nearest district"}], "district": "—", "state": "—",
                    "etaMin": 0, "probability": probs["thunderstorm"],
                    "impact": {"alertId": aid, "population": pop, "farmersInField": pop // 9, "schoolsInSession": 0, "students": 0, "airports": [], "highwaysKm": 40, "substations": 1, "fishingBoats": 0, "hospitals": 3},
                    "delivery": [{"channel": ch, "target": int(pop * 0.82), "sent": 0, "delivered": 0, "failed": 0} for ch in ("sms", "whatsapp", "push", "siren", "cap")],
                    "bulletin": "", "status": "active", "suppressed": 0, "mergedFrom": [],
                }
            a.update(severity=sev, probability=probs["thunderstorm"], updatedAt=self.t, polygon=self.polygon(c), expiresAt=self.t + 90 * 60000)
            a["bulletin"] = (f"NOWCAST WARNING ({sev.upper()}) {aid}. Storm {c.id} ({c.type}) moving {round(c.heading)} deg at {round(c.speed)} km/h. "
                             f"Max {c.max_dbz:.1f} dBZ, tops {c.echo_top:.1f} km, {c.flash_rate:.1f} flashes/min. Stay indoors; follow the 30-30 rule.")
            for d in a["delivery"]:
                add = min(d["target"] - d["sent"], 6000)
                d["sent"] += add
                d["failed"] += int(add * 0.02)
                d["delivered"] = d["sent"] - d["failed"]
        for a in self.alerts.values():
            if a["cellId"] not in live:
                a["status"] = "expired"

    def cell_contract(self, c: Cell) -> dict:
        probs, xai = self.predict(c)
        jump = self.t < c.jump_until
        fc = []
        for m in (0, 15, 30, 45, 60, 90, 120, 180):
            lng, lat = move_km(c.lng, c.lat, c.heading, c.speed * m / 60)
            I, _ = self.intensity(c, self.t + m * 60000)
            fc.append({"t": self.t + m * 60000, "lng": lng, "lat": lat, "maxDbz": min(70, 18 + 47 * c.strength * I)})
        return {
            "id": c.id, "label": f"Cell {c.id}", "lng": c.lng, "lat": c.lat, "radiusKm": 5 + 7 * c.strength, "elongation": 4.5 if c.type == "squall" else 1.3,
            "orientationDeg": (self.sc["steer"] + 90) % 180, "stage": c.stage, "type": c.type, "ageMin": (self.t - c.born) / 60000, "headingDeg": c.heading,
            "speedKmh": c.speed, "maxDbz": c.max_dbz, "echoTopKm": c.echo_top, "vil": c.vil, "flashRate": c.flash_rate, "cttK": c.ctt, "cttCoolingK15": c.cooling,
            "lightningJump": jump, "jumpSigma": c.jump_sigma, "hail": c.vil / max(1, c.echo_top) > 3.3, "downburst": False, "env": self.env(c),
            "track": c.track, "forecastTrack": fc, "history": c.history, "probs": probs, "xai": xai, "severity": self.severity(probs, c, jump),
        }

    def snapshot(self) -> dict:
        cells = [self.cell_contract(c) for c in self.cells]
        return {
            "stats": {"tick": self.tick, "tickMs": 0, "simTime": self.t, "speed": self.speed, "seed": self.seed, "cells": len(cells),
                      "strikesLastMin": sum(1 for s in self.strikes if s["t"] >= self.t - 60000), "strikesTotal": self.strike_seq, "source": "api", "latencyMs": 0},
            "scenario": {"id": self.sc_id, "name": self.sc["name"], "region": self.sc["name"], "regime": "premonsoon_norwester", "center": list(self.sc["center"]), "zoom": 7,
                         "bbox": list(self.sc["bbox"]), "steeringDeg": self.sc["steer"], "steeringKmh": self.sc["speed"], "startHourIST": 15, "month": 4, "cape": self.sc["cape"],
                         "shear": self.sc["shear"], "pw": self.sc["pw"], "cells": [], "spawnRatePerHour": 5, "landUse": "mixed", "description": ""},
            "cells": cells,
            "strikes": self.strikes[-3000:],
            "alerts": list(self.alerts.values())[-40:],
            "sensors": [],
            "reports": [],
            "verification": {"scores": [], "reliability": [], "samples": 0, "updatedAt": self.t},
            "regime": {"regime": "premonsoon_norwester", "label": "Pre-monsoon Nor'wester (Kalbaisakhi)", "confidence": 0.86,
                       "scores": {"premonsoon_norwester": 0.86, "monsoon_convection": 0.06, "western_disturbance": 0.03, "postmonsoon_nem": 0.02, "nw_dust_thunder": 0.03}, "drivers": []},
            "events": self.events[-40:],
        }

    def point_nowcast(self, lat: float, lon: float, lead: float) -> dict:
        best: Optional[tuple[float, Cell]] = None
        for c in self.cells:
            for m in range(0, int(lead) + 1, 5):
                lng, la = move_km(c.lng, c.lat, c.heading, c.speed * m / 60)
                if dist_km((lng, la), (lon, lat)) < 18:
                    if best is None or m < best[0]:
                        best = (m, c)
                    break
        near = [dist_km((s["lng"], s["lat"]), (lon, lat)) for s in self.strikes if s["t"] >= self.t - 15 * 60000]
        if best:
            probs, _ = self.predict(best[1])
            p = probs["thunderstorm"] * (1 - best[0] / 400)
            sev = self.severity(probs, best[1], self.t < best[1].jump_until)
        else:
            probs = {"thunderstorm": 0.03, "lightning": 0.03, "hail": 0.01, "gust50": 0.01, "heavyRain": 0.02}
            p, sev = 0.03, "green"
        return {"lat": lat, "lon": lon, "leadMin": lead, "probability": min(0.97, p), "probs": probs, "nearestStrikeKm": min(near) if near else None,
                "nearestCellId": best[1].id if best else None, "etaMin": best[0] if best else None, "severity": sev}
