"""SQLite storage for citizen reports and the alert log (stdlib sqlite3, one file, no ORM)."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path

DB_PATH = Path(os.environ.get("VAJRA_DB", Path(__file__).resolve().parent.parent / "data" / "vajra.db"))
_lock = threading.Lock()


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.execute("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, t REAL, body TEXT NOT NULL)")
    c.execute("CREATE TABLE IF NOT EXISTS alert_log (id TEXT, t REAL, severity TEXT, body TEXT NOT NULL, PRIMARY KEY (id, t))")
    return c


_db = _conn()


def save_report(r: dict) -> None:
    with _lock:
        _db.execute("INSERT OR REPLACE INTO reports (id, t, body) VALUES (?, ?, ?)", (r["id"], r["t"], json.dumps(r)))
        _db.commit()


def list_reports(limit: int = 200) -> list[dict]:
    with _lock:
        rows = _db.execute("SELECT body FROM reports ORDER BY t DESC LIMIT ?", (limit,)).fetchall()
    return [json.loads(b) for (b,) in rows]


def log_alert(a: dict) -> None:
    with _lock:
        _db.execute("INSERT OR IGNORE INTO alert_log (id, t, severity, body) VALUES (?, ?, ?, ?)", (a["id"], a["updatedAt"], a["severity"], json.dumps(a)))
        _db.commit()


def alert_log(limit: int = 500) -> list[dict]:
    with _lock:
        rows = _db.execute("SELECT body FROM alert_log ORDER BY t DESC LIMIT ?", (limit,)).fetchall()
    return [json.loads(b) for (b,) in rows]
