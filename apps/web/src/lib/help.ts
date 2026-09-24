/** Plain-word explanations for every metric (shown as tooltips). */
export const HELP: Record<string, string> = {
  dbz: 'Radar reflectivity in dBZ: how much rain/hail the radar sees. 35+ = heavy rain, 50+ = very intense core, 60+ = likely hail.',
  echoTop: 'Echo top: the highest height (km) where the radar still sees 18 dBZ. Taller storms make more lightning.',
  vil: 'Vertically Integrated Liquid (kg/m²): total water and ice in the column. Above ~35 kg/m² suggests hail.',
  flashRate: 'Total lightning flashes per minute (cloud-to-ground + in-cloud) from this storm.',
  ctt: 'Cloud-top temperature from INSAT infrared. Colder tops (below −50 °C) mean a deep, strong storm.',
  cooling: 'How fast the cloud top is getting colder (K per 15 min). Rapid cooling (> 8 K/15 min) means the storm is growing.',
  jump: 'Lightning jump (2σ rule): the flash rate rose faster than 2 standard deviations of its recent trend. Often precedes severe weather by 10–30 min.',
  cape: 'CAPE: energy available to lift air (J/kg). Above 2,000 J/kg supports strong thunderstorms.',
  cin: 'CIN: the "lid" that stops storms from starting (J/kg, negative). Closer to 0 = easier for storms to form.',
  shear: '0–6 km wind shear (m/s): change of wind with height. Above ~15 m/s helps storms organise and last longer.',
  pw: 'Precipitable water (mm): moisture in the whole column. Above ~50 mm means very heavy rain is possible.',
  stage: 'Life-cycle stage of the storm cell: initiation → growth → mature → decay.',
  probability: 'Chance of the event at this place within the time window. Contributions from each factor add up exactly to this number.',
  csi: 'Critical Success Index: hits / (hits + misses + false alarms). 1 = perfect. Falls as lead time grows.',
  pod: 'Probability of Detection: share of observed storms that were forecast.',
  far: 'False Alarm Ratio: share of forecast storms that did not happen. Lower is better.',
  ets: 'Equitable Threat Score: CSI corrected for lucky random hits.',
  fss: 'Fractions Skill Score: compares storm coverage in 24 km neighbourhoods, forgiving small position errors.',
  brier: 'Brier score: mean squared error of the probabilities. 0 = perfect, lower is better.',
  trust: 'Trust score: how much the data-fusion step believes this feed right now (latency × anomaly checks).',
  latency: 'Time between observation and arrival at VAJRA.',
  confidence: 'Nowcast confidence: lower where radar coverage is weak, new storms may form, or the NWP model disagrees with observations.',
  regime: 'Weather regime classified from season, location, moisture, shear and instability. Confidence is never 100%.',
  eta: 'Estimated time until the storm core reaches the place, from its current motion.',
  impact: 'Exposure inside the live warning polygons: people, farm workers outdoors (depends on time of day), schools in session and key assets.',
};

/** 2,347 style with Indian digit grouping off (international grouping keeps projector readability) */
export const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
export const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');
/** Kelvin -> "−67.8 °C" (true minus sign) */
export const degC = (k: number) => {
  const c = k - 273.15;
  return `${c < 0 ? '−' : ''}${Math.abs(c).toFixed(1)} °C`;
};
export const signed = (v: number, d = 1) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(d)}`;
