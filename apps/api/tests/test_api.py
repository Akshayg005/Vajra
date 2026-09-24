"""API contract tests (pytest). Run: .venv\Scripts\python -m pytest -q  (Windows)"""
import os

os.environ["VAJRA_SEED"] = "1234"
os.environ["VAJRA_DB"] = os.path.join(os.path.dirname(__file__), "_test.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.engine import Rng, World  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas import Alert, PointNowcast, StormCell  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["engine"] is True


def test_rng_matches_typescript_mulberry32():
    # first three draws of mulberry32(1234) produced by apps/web/src/engine/prng.ts
    r = Rng(1234)
    assert [round(r.f(), 10) for _ in range(3)] == [0.0732949781,0.7034119898,0.9028560191]


def test_determinism_same_seed():
    a, b = World("kolkata-kalbaisakhi", 99), World("kolkata-kalbaisakhi", 99)
    a.t = b.t = 0
    for w in (a, b):
        for _ in range(20):
            w.step(60000)
    assert [c.id for c in a.cells] == [c.id for c in b.cells]
    assert [round(c.max_dbz, 6) for c in a.cells] == [round(c.max_dbz, 6) for c in b.cells]


def test_cells_contract_and_xai_sum():
    r = client.get("/api/v1/cells")
    assert r.status_code == 200
    for c in r.json()["cells"]:
        cell = StormCell.model_validate(c)
        s = round(sum(x.pp for x in cell.xai.contributions), 1)
        assert abs(s - round(cell.xai.probability * 100, 1)) < 0.05


def test_nowcast_contract():
    r = client.get("/api/v1/nowcast", params={"lat": 22.57, "lon": 88.36, "lead": 60})
    assert r.status_code == 200
    p = PointNowcast.model_validate(r.json())
    assert 0 <= p.probability < 1


def test_nowcast_validation():
    assert client.get("/api/v1/nowcast", params={"lat": 99, "lon": 88, "lead": 60}).status_code == 422


def test_alerts_and_cap():
    r = client.get("/api/v1/alerts")
    assert r.status_code == 200
    alerts = r.json()["alerts"]
    for a in alerts:
        Alert.model_validate(a)
    if alerts:
        x = client.get(f"/api/v1/alerts/{alerts[0]['id']}/cap.xml")
        assert x.status_code == 200
        assert 'xmlns="urn:oasis:names:tc:emergency:cap:1.2"' in x.text
        import xml.etree.ElementTree as ET

        root = ET.fromstring(x.text)
        ns = {"c": "urn:oasis:names:tc:emergency:cap:1.2"}
        for tag in ["identifier", "sender", "sent", "status", "msgType", "scope"]:
            assert root.find(f"c:{tag}", ns) is not None
        info = root.find("c:info", ns)
        for tag in ["category", "event", "urgency", "severity", "certainty", "area"]:
            assert info.find(f"c:{tag}", ns) is not None
    assert client.get("/api/v1/alerts/NOPE/cap.xml").status_code == 404


def test_report_sanitised_and_stored():
    body = {"t": 1.0, "lng": 88.3, "lat": 22.5, "event": "hail", "text": "<script>alert(1)</script>Hail here", "place": "Kolkata", "source": "app"}
    r = client.post("/api/v1/reports", json=body)
    assert r.status_code == 201
    j = r.json()
    assert "<" not in j["text"] and "Hail here" in j["text"]  # tags stripped, text kept
    assert j["status"] in ("verified", "unverified", "fake", "duplicate")
    assert any(x["id"] == j["id"] for x in client.get("/api/v1/reports").json()["reports"])


def test_report_validation():
    bad = {"t": 1.0, "lng": 10, "lat": 22.5, "event": "hail", "text": "x", "place": "p"}
    assert client.post("/api/v1/reports", json=bad).status_code == 422


def test_assistant_fallback_without_key():
    os.environ.pop("ANTHROPIC_API_KEY", None)
    r = client.post("/api/v1/assistant", json={"question": "Lightning in Patna?", "draft": "Unlikely (4%).", "lang": "en"})
    assert r.status_code == 200
    assert r.json() == {"answer": "Unlikely (4%).", "source": "engine"}


def test_ws_stream():
    with client.websocket_connect("/ws/live") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "snapshot"
        d = msg["data"]
        for k in ["stats", "scenario", "cells", "strikes", "alerts", "regime", "events"]:
            assert k in d
        assert d["stats"]["source"] == "api"
