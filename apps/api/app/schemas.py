"""Pydantic models mirroring packages/contracts/src/index.ts (v1). Keep the two in sync."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

Severity = Literal["green", "yellow", "orange", "red"]
Stage = Literal["initiation", "growth", "mature", "decay"]
StormType = Literal["pulse", "multicell", "squall", "supercell"]
EventType = Literal["lightning", "hail", "damage", "waterlogging"]


class MultiTaskProbs(BaseModel):
    thunderstorm: float
    lightning: float
    hail: float
    gust50: float
    heavyRain: float


class EnvProfile(BaseModel):
    capeJkg: float
    cinJkg: float
    shear06: float
    pwMm: float
    iwvRise: float
    convergence: float


class TrackPoint(BaseModel):
    t: float
    lng: float
    lat: float
    maxDbz: float


class XaiContribution(BaseModel):
    feature: str
    label: str
    value: float
    unit: str
    pp: float
    logit: float


class XaiExplanation(BaseModel):
    target: str
    probability: float
    contributions: list[XaiContribution]
    reason: str


class StormCell(BaseModel):
    id: str
    label: str
    lng: float
    lat: float
    radiusKm: float
    elongation: float
    orientationDeg: float
    stage: Stage
    type: StormType
    ageMin: float
    headingDeg: float
    speedKmh: float
    maxDbz: float
    echoTopKm: float
    vil: float
    flashRate: float
    cttK: float
    cttCoolingK15: float
    lightningJump: bool
    jumpSigma: float
    hail: bool
    downburst: bool
    env: EnvProfile
    track: list[TrackPoint]
    forecastTrack: list[TrackPoint]
    history: list[dict]
    probs: MultiTaskProbs
    xai: XaiExplanation
    severity: Severity


class LightningStrike(BaseModel):
    id: int
    t: float
    lng: float
    lat: float
    kind: Literal["CG", "IC"]
    polarity: Literal[1, -1]
    peakKa: float
    cellId: Optional[str]


class ImpactEstimate(BaseModel):
    alertId: str
    population: int
    farmersInField: int
    schoolsInSession: int
    students: int
    airports: list[str]
    highwaysKm: int
    substations: int
    fishingBoats: int
    hospitals: int


class DeliveryCounter(BaseModel):
    channel: Literal["sms", "whatsapp", "push", "siren", "cap"]
    target: int
    sent: int
    delivered: int
    failed: int


class AreaRef(BaseModel):
    level: Literal["state", "district", "block", "panchayat"]
    name: str


class Alert(BaseModel):
    id: str
    cellId: str
    issuedAt: float
    updatedAt: float
    expiresAt: float
    severity: Severity
    hazard: Literal["thunderstorm", "lightning", "hail", "squall", "heavy_rain"]
    headline: str
    polygon: list[tuple[float, float]]
    areas: list[AreaRef]
    district: str
    state: str
    etaMin: float
    probability: float
    impact: ImpactEstimate
    delivery: list[DeliveryCounter]
    bulletin: str
    status: Literal["draft", "active", "updated", "expired", "merged", "suppressed"]
    suppressed: int
    mergedFrom: list[str]
    issuedBy: Optional[Literal["auto", "forecaster"]] = None
    edited: bool = False
    mergedInto: Optional[str] = None
    falseAlarm: Optional[bool] = None


class PointNowcast(BaseModel):
    lat: float
    lon: float
    leadMin: float
    probability: float
    probs: MultiTaskProbs
    nearestStrikeKm: Optional[float]
    nearestCellId: Optional[str]
    etaMin: Optional[float]
    severity: Severity


class ReportIn(BaseModel):
    """Citizen report as submitted. Text is sanitised: tags and control characters are stripped."""

    t: float
    lng: float = Field(ge=60, le=100)
    lat: float = Field(ge=5, le=40)
    event: EventType
    text: str = Field(min_length=1, max_length=280)
    place: str = Field(min_length=1, max_length=120)
    source: Literal["app", "whatsapp", "sms", "demo"] = "app"
    id: Optional[str] = Field(default=None, max_length=32)
    status: Optional[Literal["verified", "unverified", "duplicate", "fake"]] = None
    matchScore: Optional[float] = Field(default=None, ge=0, le=1)
    matchReason: Optional[str] = Field(default=None, max_length=300)
    duplicateOf: Optional[str] = Field(default=None, max_length=32)

    @field_validator("text", "place", "matchReason")
    @classmethod
    def strip_markup(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import re

        v = re.sub(r"<[^>]*>", "", v)
        v = re.sub(r"[\x00-\x1f\x7f<>{}`$\\]", "", v)
        return v.strip()


class CitizenReport(ReportIn):
    id: str
    status: Literal["verified", "unverified", "duplicate", "fake"]
    matchScore: float
    matchReason: str


class AssistantIn(BaseModel):
    question: str = Field(min_length=1, max_length=300)
    draft: str = Field(min_length=1, max_length=2000)
    lang: Literal["en", "hi", "mr", "bn", "or", "ta", "te", "kn"] = "en"


class AssistantOut(BaseModel):
    answer: str
    source: Literal["llm", "engine"]


class DirectorIn(BaseModel):
    type: Literal["scenario", "spawn", "jump", "speed", "seed", "reset", "sensorFail", "pause"]
    id: Optional[str] = None
    lng: Optional[float] = None
    lat: Optional[float] = None
    stormType: Optional[StormType] = None
    strength: Optional[float] = None
    cellId: Optional[str] = None
    value: Optional[float] = None
    lock: Optional[bool] = None
