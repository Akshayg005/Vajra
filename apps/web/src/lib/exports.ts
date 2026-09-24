import type { Alert } from '@vajra/contracts';
import { fmtIST } from '../engine/geo';
import { download } from './format';

const csvCell = (v: string | number) => {
  const s = String(v);
  // guard against CSV/formula injection in Excel and quote everything
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Excel-friendly CSV (UTF-8 BOM so Indic names open correctly). */
export function alertsCsv(alerts: Alert[]): string {
  const head = [
    'id',
    'status',
    'severity',
    'hazard',
    'issued_ist',
    'updated_ist',
    'expires_ist',
    'state',
    'district',
    'areas',
    'probability_pct',
    'eta_min',
    'population',
    'farmers_in_field',
    'schools_in_session',
    'airports',
    'sms_delivered',
    'whatsapp_delivered',
    'suppressed_repeats',
    'merged_from',
    'issued_by',
  ];
  const rows = alerts.map((a) => [
    a.id,
    a.status,
    a.severity,
    a.hazard,
    fmtIST(a.issuedAt),
    fmtIST(a.updatedAt),
    fmtIST(a.expiresAt),
    a.state,
    a.district,
    a.areas.map((x) => `${x.level}:${x.name}`).join('; '),
    (a.probability * 100).toFixed(1),
    a.etaMin,
    a.impact.population,
    a.impact.farmersInField,
    a.impact.schoolsInSession,
    a.impact.airports.join('; '),
    a.delivery.find((d) => d.channel === 'sms')?.delivered ?? 0,
    a.delivery.find((d) => d.channel === 'whatsapp')?.delivered ?? 0,
    a.suppressed,
    a.mergedFrom.join('; '),
    a.issuedBy ?? '',
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function downloadCsv(alerts: Alert[], t: number) {
  download(`vajra-alerts-${new Date(t + 5.5 * 3600e3).toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`, alertsCsv(alerts), 'text/csv;charset=utf-8');
}
