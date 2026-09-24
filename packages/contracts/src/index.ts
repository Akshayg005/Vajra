/**
 * VAJRA shared contracts (v1).
 * Used by the web app, the simulation worker and mirrored by the FastAPI service (apps/api/app/schemas.py).
 * Units are always in the field name or comment. Times are epoch milliseconds (UTC) unless noted.
 */

export const CONTRACT_VERSION = 'v1' as const;

export type LngLat = [number, number];

export type LifecycleStage = 'initiation' | 'growth' | 'mature' | 'decay';
export type StormType = 'pulse' | 'multicell' | 'squall' | 'supercell';
export type Severity = 'green' | 'yellow' | 'orange' | 'red';
export type LeadBand = '0-30' | '30-60' | '60-120' | '120-180' | '180-360';

export type RegimeId =
  | 'premonsoon_norwester'
  | 'monsoon_convection'
  | 'western_disturbance'
  | 'postmonsoon_nem'
  | 'nw_dust_thunder';

export interface TrackPoint {
  t: number;
  lng: number;
  lat: number;
  maxDbz: number;
}

export interface CellHistorySample {
  t: number;
  maxDbz: number;
  echoTopKm: number;
  vil: number;
  flashRate: number;
  cttK: number;
}

export interface StormCell {
  id: string;
  label: string;
  lng: number;
  lat: number;
  /** effective radius of the >=35 dBZ core, km */
  radiusKm: number;
  /** major/minor axis ratio (squall lines are long) */
  elongation: number;
  /** orientation of the major axis, degrees clockwise from north */
  orientationDeg: number;
  stage: LifecycleStage;
  type: StormType;
  ageMin: number;
  /** motion toward, degrees clockwise from north */
  headingDeg: number;
  speedKmh: number;
  maxDbz: number;
  echoTopKm: number;
  /** vertically integrated liquid, kg/m2 */
  vil: number;
  /** total flashes per minute (CG + IC) */
  flashRate: number;
  /** cloud-top temperature, K */
  cttK: number;
  /** cloud-top cooling, K per 15 min (positive = cooling) */
  cttCoolingK15: number;
  lightningJump: boolean;
  /** sigma level of the latest flash-rate change */
  jumpSigma: number;
  hail: boolean;
  downburst: boolean;
  env: EnvProfile;
  track: TrackPoint[];
  forecastTrack: TrackPoint[];
  history: CellHistorySample[];
  probs: MultiTaskProbs;
  xai: XaiExplanation;
  severity: Severity;
  /** true when the cell was spawned by the presenter */
  injected?: boolean;
}

export interface EnvProfile {
  capeJkg: number;
  cinJkg: number;
  /** 0-6 km bulk shear, m/s */
  shear06: number;
  /** precipitable water, mm */
  pwMm: number;
  /** 1-hour integrated water vapour change, mm */
  iwvRise: number;
  /** low-level convergence, 1e-5 s^-1 */
  convergence: number;
}

export interface LightningStrike {
  id: number;
  t: number;
  lng: number;
  lat: number;
  kind: 'CG' | 'IC';
  polarity: 1 | -1;
  peakKa: number;
  cellId: string | null;
}

/** A scalar raster over the domain bbox, row-major from north-west corner. */
export interface GridField {
  name: 'dbz' | 'ctt' | 'prob' | 'confidence' | 'density' | 'nwp';
  width: number;
  height: number;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** grid spacing, km (approx) */
  resKm: number;
  t: number;
  data: Float32Array;
}

export interface NowcastFrame {
  issuedAt: number;
  leadMin: number;
  band: LeadBand;
  /** probability of thunderstorm (0..1) per grid cell */
  prob: GridField;
  /** reflectivity forecast (dBZ) */
  dbz: GridField;
  /** true for 180-360 min: hatched, low confidence */
  extended: boolean;
}

export interface MultiTaskProbs {
  thunderstorm: number;
  lightning: number;
  hail: number;
  gust50: number;
  heavyRain: number;
}

export interface XaiContribution {
  feature: 'iwv_rise' | 'ctt_drop' | 'cape_cin' | 'convergence' | 'shear' | 'flash_trend' | 'bias';
  label: string;
  /** raw feature value in its own unit */
  value: number;
  unit: string;
  /** contribution to the displayed probability, percentage points. Sum over all == probability*100 */
  pp: number;
  /** contribution in logit space */
  logit: number;
}

export interface XaiExplanation {
  target: keyof MultiTaskProbs;
  probability: number;
  contributions: XaiContribution[];
  reason: string;
}

export interface AdminArea {
  id: string;
  name: string;
  level: 'state' | 'district' | 'block' | 'panchayat';
  parent?: string;
  lng: number;
  lat: number;
  population: number;
}

export interface ImpactEstimate {
  alertId: string;
  population: number;
  farmersInField: number;
  schoolsInSession: number;
  students: number;
  airports: string[];
  highwaysKm: number;
  substations: number;
  fishingBoats: number;
  hospitals: number;
}

export type Channel = 'sms' | 'whatsapp' | 'push' | 'siren' | 'cap';

export interface DeliveryCounter {
  channel: Channel;
  target: number;
  sent: number;
  delivered: number;
  failed: number;
}

export interface Alert {
  id: string;
  cellId: string;
  issuedAt: number;
  updatedAt: number;
  expiresAt: number;
  severity: Severity;
  hazard: 'thunderstorm' | 'lightning' | 'hail' | 'squall' | 'heavy_rain';
  headline: string;
  /** polygon ring, closed */
  polygon: LngLat[];
  areas: { level: AdminArea['level']; name: string }[];
  district: string;
  state: string;
  etaMin: number;
  probability: number;
  impact: ImpactEstimate;
  delivery: DeliveryCounter[];
  bulletin: string;
  status: 'active' | 'updated' | 'expired' | 'merged';
  /** repeats suppressed by the fatigue guard */
  suppressed: number;
  mergedFrom: string[];
  falseAlarm?: boolean;
}

export type SensorKind = 'dwr' | 'satellite' | 'lightning' | 'aws' | 'nwp';
export type AnomalyType = 'spike' | 'frozen' | 'drift' | 'dropout';

export interface SensorStatus {
  id: string;
  name: string;
  kind: SensorKind;
  lng: number;
  lat: number;
  /** DWR range, km */
  rangeKm?: number;
  latencySec: number;
  uptimePct: number;
  /** 0..1 */
  trust: number;
  state: 'ok' | 'degraded' | 'excluded' | 'recovering';
  anomaly: AnomalyType | null;
  anomalySince: number | null;
  /** last N readings used for the health sparkline */
  series: number[];
}

export interface CitizenReport {
  id: string;
  t: number;
  lng: number;
  lat: number;
  event: 'lightning' | 'hail' | 'damage' | 'waterlogging';
  text: string;
  place: string;
  status: 'verified' | 'unverified' | 'duplicate' | 'fake';
  /** 0..1 agreement with radar / lightning at that time & place */
  matchScore: number;
  matchReason: string;
  duplicateOf?: string;
  source: 'app' | 'whatsapp' | 'sms' | 'demo';
}

export interface ContingencyScore {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctNegatives: number;
}

export interface VerificationScore {
  method: 'vajra' | 'persistence' | 'optical_flow';
  leadMin: number;
  n: number;
  pod: number;
  far: number;
  csi: number;
  ets: number;
  fss: number;
  brier: number;
  table: ContingencyScore;
}

export interface ReliabilityBin {
  forecast: number;
  observed: number;
  count: number;
}

export interface VerificationSummary {
  scores: VerificationScore[];
  reliability: ReliabilityBin[];
  samples: number;
  updatedAt: number;
}

export interface RegimeState {
  regime: RegimeId;
  label: string;
  confidence: number;
  scores: Record<RegimeId, number>;
  drivers: string[];
}

export interface ScenarioCellSeed {
  lng: number;
  lat: number;
  type: StormType;
  strength: number;
  delayMin: number;
}

export interface Scenario {
  id: string;
  name: string;
  region: string;
  regime: RegimeId;
  center: LngLat;
  zoom: number;
  bbox: [number, number, number, number];
  /** steering wind, toward-direction deg and speed km/h */
  steeringDeg: number;
  steeringKmh: number;
  /** local start hour, IST */
  startHourIST: number;
  month: number;
  cape: number;
  shear: number;
  pw: number;
  cells: ScenarioCellSeed[];
  spawnRatePerHour: number;
  landUse: 'farmland' | 'urban' | 'coastal' | 'mixed';
  description: string;
}

export interface EngineStats {
  tick: number;
  tickMs: number;
  simTime: number;
  speed: number;
  seed: number;
  cells: number;
  strikesLastMin: number;
  strikesTotal: number;
  source: 'simulation' | 'api';
  latencyMs: number;
}

/** What the worker posts to the UI each tick (structured-cloned; grids transferred). */
export interface WorldSnapshot {
  stats: EngineStats;
  scenario: Scenario;
  cells: StormCell[];
  strikes: LightningStrike[];
  dbz: GridField;
  ctt: GridField;
  nowcast: NowcastFrame[];
  confidence: GridField;
  nwp: GridField;
  density: GridField;
  alerts: Alert[];
  sensors: SensorStatus[];
  reports: CitizenReport[];
  verification: VerificationSummary;
  regime: RegimeState;
  events: EngineEvent[];
}

export interface EngineEvent {
  id: number;
  t: number;
  kind: 'jump' | 'alert' | 'alert_update' | 'sensor' | 'cell_new' | 'cell_split' | 'cell_merge' | 'cell_dead' | 'report' | 'director';
  text: string;
  severity?: Severity;
  cellId?: string;
}

export interface PointNowcast {
  lat: number;
  lon: number;
  leadMin: number;
  probability: number;
  probs: MultiTaskProbs;
  nearestStrikeKm: number | null;
  nearestCellId: string | null;
  etaMin: number | null;
  severity: Severity;
}

/** Director Mode commands (UI -> engine). */
export type DirectorCommand =
  | { type: 'scenario'; id: string }
  | { type: 'spawn'; lng: number; lat: number; stormType: StormType; strength: number }
  | { type: 'jump'; cellId?: string }
  | { type: 'speed'; value: number }
  | { type: 'seed'; value: number; lock: boolean }
  | { type: 'reset' }
  | { type: 'sensorFail'; sensorId?: string; anomaly: AnomalyType }
  | { type: 'report'; report: Omit<CitizenReport, 'id' | 'status' | 'matchScore' | 'matchReason'> }
  | { type: 'pause'; value: boolean };

/** REST + WS contracts. Mirrored in apps/api. */
export interface ApiContracts {
  'GET /api/v1/nowcast': { query: { lat: number; lon: number; lead: number }; response: PointNowcast };
  'GET /api/v1/cells': { response: { issuedAt: number; cells: StormCell[] } };
  'GET /api/v1/alerts': { response: { issuedAt: number; alerts: Alert[] } };
  'GET /api/v1/alerts/{id}/cap.xml': { response: string };
  'POST /api/v1/reports': { body: Omit<CitizenReport, 'id' | 'status' | 'matchScore' | 'matchReason'>; response: CitizenReport };
  'WS /ws/live': { message: { type: 'snapshot'; data: Omit<WorldSnapshot, 'dbz' | 'ctt' | 'nowcast' | 'confidence' | 'nwp' | 'density'> } };
}

export const SEVERITY_META: Record<Severity, { label: string; hex: string; icon: string; action: string }> = {
  green: { label: 'Green', hex: '#22c55e', icon: 'check', action: 'No warning' },
  yellow: { label: 'Yellow', hex: '#facc15', icon: 'eye', action: 'Be updated' },
  orange: { label: 'Orange', hex: '#fb923c', icon: 'alert', action: 'Be prepared' },
  red: { label: 'Red', hex: '#ef4444', icon: 'siren', action: 'Take action' },
};
