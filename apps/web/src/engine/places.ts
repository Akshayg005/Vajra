import districtsRaw from '../data/districts.json';
import { distanceKm } from './geo';

/** [name, state, lng, lat] from Survey-of-India-compliant district polygons (inner points). */
export const DISTRICTS = (districtsRaw as [string, string, number, number][]).map(([name, state, lng, lat]) => ({
  name,
  state,
  lng,
  lat,
}));

export interface Town {
  name: string;
  state: string;
  lng: number;
  lat: number;
  pop: number;
  /** share of workforce in agriculture (0..1) */
  agri: number;
}

/** Towns & cities (approx 2011 census populations). Used for ETA, impact and the assistant. */
export const TOWNS: Town[] = [
  // West Bengal / Jharkhand
  { name: 'Kolkata', state: 'West Bengal', lng: 88.36, lat: 22.57, pop: 4500000, agri: 0.02 },
  { name: 'Howrah', state: 'West Bengal', lng: 88.31, lat: 22.59, pop: 1080000, agri: 0.03 },
  { name: 'Bardhaman', state: 'West Bengal', lng: 87.86, lat: 23.23, pop: 315000, agri: 0.35 },
  { name: 'Durgapur', state: 'West Bengal', lng: 87.31, lat: 23.52, pop: 566000, agri: 0.1 },
  { name: 'Asansol', state: 'West Bengal', lng: 86.98, lat: 23.68, pop: 1240000, agri: 0.08 },
  { name: 'Bankura', state: 'West Bengal', lng: 87.07, lat: 23.23, pop: 138000, agri: 0.5 },
  { name: 'Kharagpur', state: 'West Bengal', lng: 87.32, lat: 22.34, pop: 293000, agri: 0.3 },
  { name: 'Haldia', state: 'West Bengal', lng: 88.06, lat: 22.03, pop: 200000, agri: 0.25 },
  { name: 'Krishnanagar', state: 'West Bengal', lng: 88.5, lat: 23.4, pop: 181000, agri: 0.45 },
  { name: 'Purulia', state: 'West Bengal', lng: 86.36, lat: 23.33, pop: 132000, agri: 0.55 },
  { name: 'Dhanbad', state: 'Jharkhand', lng: 86.43, lat: 23.8, pop: 1160000, agri: 0.1 },
  { name: 'Ranchi', state: 'Jharkhand', lng: 85.32, lat: 23.34, pop: 1120000, agri: 0.15 },
  { name: 'Jamshedpur', state: 'Jharkhand', lng: 86.2, lat: 22.8, pop: 1340000, agri: 0.05 },
  { name: 'Bokaro', state: 'Jharkhand', lng: 86.15, lat: 23.67, pop: 563000, agri: 0.2 },
  { name: 'Hazaribagh', state: 'Jharkhand', lng: 85.36, lat: 23.99, pop: 153000, agri: 0.5 },
  { name: 'Deoghar', state: 'Jharkhand', lng: 86.7, lat: 24.48, pop: 203000, agri: 0.45 },
  { name: 'Dumka', state: 'Jharkhand', lng: 87.25, lat: 24.27, pop: 47000, agri: 0.7 },
  // Bihar
  { name: 'Patna', state: 'Bihar', lng: 85.14, lat: 25.59, pop: 2050000, agri: 0.08 },
  { name: 'Gaya', state: 'Bihar', lng: 85.0, lat: 24.79, pop: 470000, agri: 0.4 },
  { name: 'Bhagalpur', state: 'Bihar', lng: 86.98, lat: 25.24, pop: 400000, agri: 0.35 },
  { name: 'Muzaffarpur', state: 'Bihar', lng: 85.39, lat: 26.12, pop: 393000, agri: 0.45 },
  { name: 'Aurangabad (BR)', state: 'Bihar', lng: 84.37, lat: 24.75, pop: 102000, agri: 0.7 },
  { name: 'Nalanda', state: 'Bihar', lng: 85.44, lat: 25.13, pop: 180000, agri: 0.65 },
  { name: 'Arrah', state: 'Bihar', lng: 84.66, lat: 25.56, pop: 261000, agri: 0.6 },
  { name: 'Sasaram', state: 'Bihar', lng: 84.03, lat: 24.95, pop: 147000, agri: 0.65 },
  { name: 'Begusarai', state: 'Bihar', lng: 86.13, lat: 25.42, pop: 252000, agri: 0.55 },
  { name: 'Jamui', state: 'Bihar', lng: 86.22, lat: 24.92, pop: 88000, agri: 0.75 },
  { name: 'Nawada', state: 'Bihar', lng: 85.54, lat: 24.89, pop: 98000, agri: 0.72 },
  // Mumbai / Konkan
  { name: 'Mumbai', state: 'Maharashtra', lng: 72.88, lat: 19.07, pop: 12400000, agri: 0.01 },
  { name: 'Thane', state: 'Maharashtra', lng: 72.98, lat: 19.2, pop: 1840000, agri: 0.02 },
  { name: 'Navi Mumbai', state: 'Maharashtra', lng: 73.02, lat: 19.03, pop: 1120000, agri: 0.02 },
  { name: 'Vasai-Virar', state: 'Maharashtra', lng: 72.83, lat: 19.47, pop: 1220000, agri: 0.05 },
  { name: 'Kalyan', state: 'Maharashtra', lng: 73.13, lat: 19.24, pop: 1250000, agri: 0.03 },
  { name: 'Alibag', state: 'Maharashtra', lng: 72.87, lat: 18.64, pop: 20000, agri: 0.4 },
  { name: 'Pune', state: 'Maharashtra', lng: 73.86, lat: 18.52, pop: 3120000, agri: 0.03 },
  { name: 'Palghar', state: 'Maharashtra', lng: 72.77, lat: 19.7, pop: 68000, agri: 0.5 },
  // Delhi NCR
  { name: 'New Delhi', state: 'Delhi', lng: 77.21, lat: 28.61, pop: 16700000, agri: 0.01 },
  { name: 'Gurugram', state: 'Haryana', lng: 77.03, lat: 28.46, pop: 876000, agri: 0.03 },
  { name: 'Noida', state: 'Uttar Pradesh', lng: 77.39, lat: 28.54, pop: 637000, agri: 0.02 },
  { name: 'Ghaziabad', state: 'Uttar Pradesh', lng: 77.44, lat: 28.67, pop: 1650000, agri: 0.03 },
  { name: 'Faridabad', state: 'Haryana', lng: 77.32, lat: 28.41, pop: 1400000, agri: 0.03 },
  { name: 'Rohtak', state: 'Haryana', lng: 76.61, lat: 28.9, pop: 374000, agri: 0.3 },
  { name: 'Hisar', state: 'Haryana', lng: 75.72, lat: 29.15, pop: 301000, agri: 0.4 },
  { name: 'Sonipat', state: 'Haryana', lng: 77.02, lat: 28.99, pop: 278000, agri: 0.35 },
  { name: 'Panipat', state: 'Haryana', lng: 76.97, lat: 29.39, pop: 294000, agri: 0.25 },
  { name: 'Meerut', state: 'Uttar Pradesh', lng: 77.71, lat: 28.98, pop: 1310000, agri: 0.15 },
  { name: 'Jhajjar', state: 'Haryana', lng: 76.66, lat: 28.61, pop: 48000, agri: 0.6 },
  // Odisha
  { name: 'Bhubaneswar', state: 'Odisha', lng: 85.82, lat: 20.3, pop: 837000, agri: 0.05 },
  { name: 'Cuttack', state: 'Odisha', lng: 85.88, lat: 20.46, pop: 606000, agri: 0.1 },
  { name: 'Puri', state: 'Odisha', lng: 85.83, lat: 19.81, pop: 200000, agri: 0.2 },
  { name: 'Balasore', state: 'Odisha', lng: 86.93, lat: 21.49, pop: 144000, agri: 0.4 },
  { name: 'Paradip', state: 'Odisha', lng: 86.61, lat: 20.26, pop: 68000, agri: 0.2 },
  { name: 'Khordha', state: 'Odisha', lng: 85.62, lat: 20.18, pop: 44000, agri: 0.55 },
  { name: 'Dhenkanal', state: 'Odisha', lng: 85.6, lat: 20.66, pop: 67000, agri: 0.6 },
  { name: 'Angul', state: 'Odisha', lng: 85.1, lat: 20.84, pop: 45000, agri: 0.5 },
  { name: 'Kendrapara', state: 'Odisha', lng: 86.42, lat: 20.5, pop: 47000, agri: 0.7 },
  { name: 'Jajpur', state: 'Odisha', lng: 86.33, lat: 20.85, pop: 37000, agri: 0.7 },
  // Vidarbha / Marathwada
  { name: 'Nagpur', state: 'Maharashtra', lng: 79.09, lat: 21.15, pop: 2410000, agri: 0.04 },
  { name: 'Amravati', state: 'Maharashtra', lng: 77.75, lat: 20.93, pop: 647000, agri: 0.2 },
  { name: 'Akola', state: 'Maharashtra', lng: 77.0, lat: 20.7, pop: 427000, agri: 0.3 },
  { name: 'Yavatmal', state: 'Maharashtra', lng: 78.12, lat: 20.39, pop: 116000, agri: 0.6 },
  { name: 'Wardha', state: 'Maharashtra', lng: 78.6, lat: 20.74, pop: 106000, agri: 0.55 },
  { name: 'Nanded', state: 'Maharashtra', lng: 77.32, lat: 19.14, pop: 550000, agri: 0.3 },
  { name: 'Parbhani', state: 'Maharashtra', lng: 76.77, lat: 19.27, pop: 307000, agri: 0.5 },
  { name: 'Hingoli', state: 'Maharashtra', lng: 77.15, lat: 19.72, pop: 85000, agri: 0.7 },
  { name: 'Washim', state: 'Maharashtra', lng: 77.13, lat: 20.11, pop: 78000, agri: 0.72 },
  { name: 'Aurangabad (MH)', state: 'Maharashtra', lng: 75.34, lat: 19.88, pop: 1170000, agri: 0.08 },
  { name: 'Jalna', state: 'Maharashtra', lng: 75.88, lat: 19.84, pop: 285000, agri: 0.45 },
  { name: 'Latur', state: 'Maharashtra', lng: 76.56, lat: 18.4, pop: 382000, agri: 0.4 },
  { name: 'Chandrapur', state: 'Maharashtra', lng: 79.3, lat: 19.96, pop: 321000, agri: 0.3 },
];

export interface Infra {
  name: string;
  kind: 'airport' | 'substation' | 'highway' | 'port' | 'hospital';
  lng: number;
  lat: number;
  /** highways: length of segment km */
  km?: number;
}

export const INFRA: Infra[] = [
  { name: 'Kolkata CCU', kind: 'airport', lng: 88.45, lat: 22.65 },
  { name: 'Durgapur RDP', kind: 'airport', lng: 87.24, lat: 23.62 },
  { name: 'Ranchi IXR', kind: 'airport', lng: 85.32, lat: 23.31 },
  { name: 'Patna PAT', kind: 'airport', lng: 85.09, lat: 25.59 },
  { name: 'Gaya GAY', kind: 'airport', lng: 84.95, lat: 24.74 },
  { name: 'Darbhanga DBR', kind: 'airport', lng: 85.92, lat: 26.19 },
  { name: 'Mumbai BOM', kind: 'airport', lng: 72.87, lat: 19.09 },
  { name: 'Navi Mumbai NMI', kind: 'airport', lng: 73.07, lat: 18.99 },
  { name: 'Delhi DEL', kind: 'airport', lng: 77.1, lat: 28.56 },
  { name: 'Hindon HDO', kind: 'airport', lng: 77.35, lat: 28.7 },
  { name: 'Bhubaneswar BBI', kind: 'airport', lng: 85.82, lat: 20.25 },
  { name: 'Nagpur NAG', kind: 'airport', lng: 79.05, lat: 21.09 },
  { name: 'Aurangabad IXU', kind: 'airport', lng: 75.4, lat: 19.86 },
  { name: 'NH-19 Durgapur Expwy', kind: 'highway', lng: 87.7, lat: 23.1, km: 140 },
  { name: 'NH-16 Kolkata-Kharagpur', kind: 'highway', lng: 87.8, lat: 22.45, km: 110 },
  { name: 'NH-19 Aurangabad-Dobhi', kind: 'highway', lng: 84.8, lat: 24.7, km: 90 },
  { name: 'NH-31 Patna-Bakhtiyarpur', kind: 'highway', lng: 85.4, lat: 25.45, km: 55 },
  { name: 'Mumbai-Pune Expwy', kind: 'highway', lng: 73.3, lat: 18.8, km: 94 },
  { name: 'Western Express Hwy', kind: 'highway', lng: 72.86, lat: 19.2, km: 26 },
  { name: 'NH-48 Delhi-Jaipur', kind: 'highway', lng: 76.8, lat: 28.25, km: 120 },
  { name: 'NH-44 Delhi-Panipat', kind: 'highway', lng: 77.05, lat: 29.05, km: 90 },
  { name: 'NH-16 Cuttack-Bhubaneswar', kind: 'highway', lng: 85.85, lat: 20.38, km: 30 },
  { name: 'Samruddhi Expwy', kind: 'highway', lng: 77.3, lat: 20.3, km: 200 },
  { name: 'NH-44 Nagpur-Hyderabad', kind: 'highway', lng: 78.8, lat: 20.1, km: 160 },
  { name: 'Jeerat 400kV', kind: 'substation', lng: 88.6, lat: 22.95 },
  { name: 'Arambagh 400kV', kind: 'substation', lng: 87.78, lat: 22.88 },
  { name: 'Maithon 400kV', kind: 'substation', lng: 86.81, lat: 23.78 },
  { name: 'Biharsharif 400kV', kind: 'substation', lng: 85.52, lat: 25.2 },
  { name: 'Gaya 765kV', kind: 'substation', lng: 85.05, lat: 24.7 },
  { name: 'Kalwa 400kV', kind: 'substation', lng: 73.0, lat: 19.2 },
  { name: 'Bawana 400kV', kind: 'substation', lng: 77.05, lat: 28.8 },
  { name: 'Ballabgarh 400kV', kind: 'substation', lng: 77.32, lat: 28.34 },
  { name: 'Mendhasal 400kV', kind: 'substation', lng: 85.7, lat: 20.25 },
  { name: 'Koradi 400kV', kind: 'substation', lng: 79.1, lat: 21.25 },
  { name: 'Akola 400kV', kind: 'substation', lng: 77.05, lat: 20.65 },
  { name: 'Haldia Port', kind: 'port', lng: 88.07, lat: 22.03 },
  { name: 'Digha fishing harbour', kind: 'port', lng: 87.52, lat: 21.63 },
  { name: 'Sassoon Dock', kind: 'port', lng: 72.82, lat: 18.91 },
  { name: 'Versova jetty', kind: 'port', lng: 72.81, lat: 19.14 },
  { name: 'Paradip Port', kind: 'port', lng: 86.67, lat: 20.26 },
  { name: 'Astaranga jetty', kind: 'port', lng: 86.4, lat: 19.97 },
  { name: 'Chandipur jetty', kind: 'port', lng: 87.02, lat: 21.44 },
];

export function nearestDistrict(lng: number, lat: number) {
  let best = DISTRICTS[0];
  let bd = Infinity;
  for (const d of DISTRICTS) {
    const dd = (d.lng - lng) ** 2 + (d.lat - lat) ** 2;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

export function nearestTown(lng: number, lat: number) {
  let best = TOWNS[0];
  let bd = Infinity;
  for (const t of TOWNS) {
    const d = distanceKm(lng, lat, t.lng, t.lat);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return { town: best, km: bd };
}

const BLOCK_SUFFIX = ['Sadar', 'North', 'South', 'East', 'West', 'Rural', 'Uttar', 'Dakshin'];
const GP_ROOTS = ['Rampur', 'Kishanpur', 'Chandpur', 'Sonpur', 'Madhopur', 'Bishnupur', 'Lakshmipur', 'Govindpur', 'Shivpur', 'Narayanpur', 'Rasulpur', 'Belgachhi', 'Kalyanpur', 'Durgapur Khurd', 'Harinagar', 'Shyamnagar'];

/** Deterministic block + panchayat naming inside a district (placeholder until LGD codes are loaded). */
export function blockAndPanchayat(lng: number, lat: number) {
  const d = nearestDistrict(lng, lat);
  const h = Math.abs(Math.floor(lng * 37.1 + lat * 91.7));
  const block = `${d.name} ${BLOCK_SUFFIX[h % BLOCK_SUFFIX.length]}`;
  const gp = `${GP_ROOTS[(h >> 3) % GP_ROOTS.length]} GP`;
  return { district: d.name, state: d.state, block, panchayat: gp };
}

export const SHELTERS_PER_TOWN = ['Govt. school building', 'Panchayat bhavan', 'Primary health centre', 'Railway station', 'Bank branch (pucca)', 'Cyclone shelter'];
