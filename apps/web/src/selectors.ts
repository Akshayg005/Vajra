import { useMemo } from 'react';
import type { Alert, Severity, WorldSnapshot } from '@vajra/contracts';
import { useStore } from './store';

/**
 * Single definitions shared by every panel so numbers always agree
 * (header, nav badge, alert list, map polygons, impact strip, assistant, citizen view).
 */
export const isLive = (a: Alert) => a.status === 'active' || a.status === 'updated' || a.status === 'draft';
export const isIssued = (a: Alert) => a.status === 'active' || a.status === 'updated';

export const SEV_RANK: Record<Severity, number> = { green: 0, yellow: 1, orange: 2, red: 3 };

export function liveAlerts(snap: WorldSnapshot | null): Alert[] {
  return snap ? snap.alerts.filter(isLive) : [];
}

export function worstSeverity(alerts: Alert[]): Severity {
  return alerts.reduce<Severity>((w, a) => (SEV_RANK[a.severity] > SEV_RANK[w] ? a.severity : w), 'green');
}

/** memoised per snapshot */
export function useLiveAlerts() {
  const snap = useStore((s) => s.snap);
  return useMemo(() => liveAlerts(snap), [snap]);
}

export interface ImpactTotals {
  population: number;
  farmers: number;
  schools: number;
  students: number;
  airports: number;
  highwaysKm: number;
  substations: number;
  boats: number;
}

export function impactTotals(alerts: Alert[]): ImpactTotals {
  const issued = alerts.filter(isIssued);
  const sum = (f: (a: Alert) => number) => issued.reduce((acc, a) => acc + f(a), 0);
  return {
    population: sum((a) => a.impact.population),
    farmers: sum((a) => a.impact.farmersInField),
    schools: sum((a) => a.impact.schoolsInSession),
    students: sum((a) => a.impact.students),
    airports: new Set(issued.flatMap((a) => a.impact.airports)).size,
    highwaysKm: sum((a) => a.impact.highwaysKm),
    substations: sum((a) => a.impact.substations),
    boats: sum((a) => a.impact.fishingBoats),
  };
}
