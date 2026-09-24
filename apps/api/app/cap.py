"""CAP 1.2 (OASIS) builder, SACHET-style. Mirrors capXml() in apps/web/src/engine/alerts.ts."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape

IST = timezone(timedelta(hours=5, minutes=30))
SEV = {"red": "Extreme", "orange": "Severe", "yellow": "Moderate", "green": "Minor"}
URG = {"red": "Immediate", "orange": "Immediate", "yellow": "Expected", "green": "Future"}
EVENT = {"thunderstorm": "Thunderstorm & lightning", "lightning": "Frequent lightning", "hail": "Hailstorm", "squall": "Squall / Kalbaisakhi winds", "heavy_rain": "Intense rain & lightning"}


def iso(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, IST).replace(microsecond=0).isoformat()


def build_cap(a: dict) -> str:
    poly = " ".join(f"{lat:.4f},{lng:.4f}" for lng, lat in a["polygon"])
    areas = "; ".join(x["name"] for x in a.get("areas", []))
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>{escape(a['id'])}</identifier>
  <sender>vajra-nowcast@demo.local</sender>
  <sent>{iso(a['updatedAt'])}</sent>
  <status>Exercise</status>
  <msgType>{'Update' if a.get('status') == 'updated' else 'Alert'}</msgType>
  <scope>Public</scope>
  <info>
    <language>en-IN</language>
    <category>Met</category>
    <event>{escape(EVENT.get(a['hazard'], 'Thunderstorm'))}</event>
    <responseType>Shelter</responseType>
    <urgency>{URG[a['severity']]}</urgency>
    <severity>{SEV[a['severity']]}</severity>
    <certainty>{'Likely' if a['probability'] > 0.7 else 'Possible'}</certainty>
    <effective>{iso(a['issuedAt'])}</effective>
    <expires>{iso(a['expiresAt'])}</expires>
    <senderName>VAJRA Nowcast Desk (prototype)</senderName>
    <headline>{escape(a['headline'])}</headline>
    <description>{escape(a.get('bulletin', ''))}</description>
    <instruction>Stay indoors. Avoid open fields, trees, water bodies and metal structures. Wait 30 minutes after the last thunder.</instruction>
    <parameter><valueName>ColourCode</valueName><value>{a['severity'].upper()}</value></parameter>
    <parameter><valueName>Probability</valueName><value>{round(a['probability'] * 100)}</value></parameter>
    <area>
      <areaDesc>{escape(areas)}</areaDesc>
      <polygon>{poly}</polygon>
    </area>
  </info>
</alert>"""
