import type { RegimeId, RegimeState, Scenario } from '@vajra/contracts';

export const REGIME_LABEL: Record<RegimeId, string> = {
  premonsoon_norwester: "Pre-monsoon Nor'wester (Kalbaisakhi)",
  monsoon_convection: 'Monsoon convection',
  western_disturbance: 'Western disturbance',
  postmonsoon_nem: 'Post-monsoon / NE monsoon',
  nw_dust_thunder: 'NW India dust-thunder squall',
};

/**
 * Softmax classifier over simple synoptic features (month, location, PW, shear, CAPE, steering direction).
 * Scores are hand-set priors from IMD climatology; replace with the trained classifier via the adapter.
 */
export function classifyRegime(sc: Scenario, meanPw: number, meanShear: number, meanCape: number, hourIST: number): RegimeState {
  const [lng, lat] = sc.center;
  const m = sc.month;
  const steerFromNW = Math.cos(((sc.steeringDeg - 120) * Math.PI) / 180);
  const s: Record<RegimeId, number> = {
    premonsoon_norwester:
      (m >= 3 && m <= 5 ? 2.2 : -1) + (lng > 83 ? 1.1 : -0.6) + steerFromNW * 0.9 + (meanCape > 2500 ? 0.8 : 0) + (hourIST > 13 && hourIST < 20 ? 0.4 : 0),
    monsoon_convection: (m >= 6 && m <= 9 ? 2.3 : -1) + (meanPw > 55 ? 1.3 : -0.4) + (meanShear < 11 ? 0.6 : -0.3),
    western_disturbance: (m <= 3 || m === 12 ? 2 : -0.8) + (lat > 28 ? 0.9 : -0.8) + (sc.steeringDeg > 60 && sc.steeringDeg < 120 ? 0.4 : 0),
    postmonsoon_nem: (m >= 10 && m <= 12 ? 2.2 : -1.2) + (lat < 16 ? 1.2 : -0.7),
    nw_dust_thunder: (m >= 4 && m <= 6 ? 1.1 : -1) + (lat > 26 && lng < 80 ? 1.7 : -1) + (meanPw < 36 ? 1.2 : -0.4),
  };
  const keys = Object.keys(s) as RegimeId[];
  const mx = Math.max(...keys.map((k) => s[k]));
  const ex = keys.map((k) => Math.exp(s[k] - mx));
  const tot = ex.reduce((a, b) => a + b, 0);
  const scores = {} as Record<RegimeId, number>;
  keys.forEach((k, i) => (scores[k] = ex[i] / tot));
  const regime = keys.reduce((a, b) => (scores[a] > scores[b] ? a : b));
  const drivers: string[] = [];
  drivers.push(`Month ${m}: ${['', 'winter', 'winter', 'pre-monsoon', 'pre-monsoon', 'pre-monsoon', 'monsoon', 'monsoon', 'monsoon', 'monsoon', 'post-monsoon', 'post-monsoon', 'winter'][m]}`);
  drivers.push(`Mean PW ${meanPw.toFixed(0)} mm, 0-6 km shear ${meanShear.toFixed(0)} m/s`);
  drivers.push(`Mean CAPE ${Math.round(meanCape)} J/kg, steering to ${Math.round(sc.steeringDeg)} deg`);
  return { regime, label: REGIME_LABEL[regime], confidence: scores[regime], scores, drivers };
}
