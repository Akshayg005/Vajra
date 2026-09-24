import type { PointNowcast, Severity, StormCell, WorldSnapshot } from '@vajra/contracts';
import { DISTRICTS, TOWNS } from '../engine/places';
import { distanceKm } from '../engine/geo';
import { compass } from '../engine/alerts';

export type Lang = 'en' | 'hi' | 'mr' | 'bn' | 'or' | 'ta' | 'te' | 'kn';
export type Sector = 'farmer' | 'aviation' | 'marine' | 'urban' | null;
export type Hazard = 'lightning' | 'hail' | 'rain' | 'gust' | 'thunderstorm';

/** Native-script aliases for places so questions in regional languages resolve. */
const ALIASES: Record<string, string> = {
  पटना: 'Patna', कोलकाता: 'Kolkata', कलकत्ता: 'Kolkata', मुंबई: 'Mumbai', मुंबईत: 'Mumbai', दिल्ली: 'New Delhi', 'नई दिल्ली': 'New Delhi', भुवनेश्वर: 'Bhubaneswar', नागपुर: 'Nagpur', नागपूर: 'Nagpur', रांची: 'Ranchi', गया: 'Gaya', पुणे: 'Pune', ठाणे: 'Thane', अकोला: 'Akola', अमरावती: 'Amravati', धनबाद: 'Dhanbad', जमशेदपुर: 'Jamshedpur', भागलपुर: 'Bhagalpur', मुजफ्फरपुर: 'Muzaffarpur', गुड़गांव: 'Gurugram', गुरुग्राम: 'Gurugram', नोएडा: 'Noida', कटक: 'Cuttack', पुरी: 'Puri',
  কলকাতা: 'Kolkata', হাওড়া: 'Howrah', দুর্গাপুর: 'Durgapur', আসানসোল: 'Asansol', বর্ধমান: 'Bardhaman', খড়্গপুর: 'Kharagpur', হলদিয়া: 'Haldia', বাঁকুড়া: 'Bankura', পুরুলিয়া: 'Purulia',
  ଭୁବନେଶ୍ୱର: 'Bhubaneswar', କଟକ: 'Cuttack', ପୁରୀ: 'Puri', ବାଲେଶ୍ୱର: 'Balasore', ପାରାଦୀପ: 'Paradip',
  மும்பை: 'Mumbai', கொல்கத்தா: 'Kolkata', டெல்லி: 'New Delhi', పాట్నా: 'Patna', ముంబై: 'Mumbai', కోల్‌కతా: 'Kolkata', ನಾಗಪುರ: 'Nagpur', ಮುಂಬೈ: 'Mumbai', ಕೋಲ್ಕತ್ತಾ: 'Kolkata',
};

export function detectLang(text: string, fallback: Lang): Lang {
  if (/[ঀ-৿]/.test(text)) return 'bn';
  if (/[଀-୿]/.test(text)) return 'or';
  if (/[஀-௿]/.test(text)) return 'ta';
  if (/[ఀ-౿]/.test(text)) return 'te';
  if (/[ಀ-೿]/.test(text)) return 'kn';
  if (/[ऀ-ॿ]/.test(text)) return fallback === 'mr' ? 'mr' : /(आहे|का\?|मध्ये|पुढील|होईल)/.test(text) ? 'mr' : 'hi';
  return /[a-z]/i.test(text) && fallback !== 'en' && !/(bijli|barish|aandhi|kya|mein|hai)/i.test(text) ? 'en' : fallback;
}

export interface Parsed {
  place: { name: string; lng: number; lat: number } | null;
  leadMin: number;
  hazard: Hazard;
  sector: Sector;
  intent: 'point' | 'summary' | 'worst' | 'advisory' | 'help';
}

export function parse(q: string, snap: WorldSnapshot): Parsed {
  const s = q.toLowerCase();
  let place: Parsed['place'] = null;
  for (const [alias, name] of Object.entries(ALIASES)) {
    if (q.includes(alias)) {
      const t = TOWNS.find((x) => x.name === name);
      if (t) place = { name: t.name, lng: t.lng, lat: t.lat };
    }
  }
  if (!place) {
    const towns = [...TOWNS].sort((a, b) => b.name.length - a.name.length);
    const t = towns.find((x) => s.includes(x.name.toLowerCase().replace(/ \(.*\)/, '')));
    if (t) place = { name: t.name, lng: t.lng, lat: t.lat };
  }
  if (!place) {
    const d = [...DISTRICTS].sort((a, b) => b.name.length - a.name.length).find((x) => x.name.length > 3 && s.includes(x.name.toLowerCase()));
    if (d) place = { name: `${d.name} district`, lng: d.lng, lat: d.lat };
  }
  let leadMin = 60;
  const num = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|घंट|घण्ट|तास|ঘণ্টা|ଘଣ୍ଟା|மணி|గంట|ಗಂಟೆ|min|minute|मिनट|मिनिट|মিনিট)/);
  if (num) leadMin = /min|मिनट|मिनिट|মিনিট/.test(num[2]) ? Number(num[1]) : Number(num[1]) * 60;
  else if (/(half an hour|आधे घंटे|30)/.test(s)) leadMin = 30;
  else if (/(two hours|2 hours|दो घंटे|दोन तास)/.test(s)) leadMin = 120;
  else if (/(three|3 h|तीन घंटे)/.test(s)) leadMin = 180;
  leadMin = Math.max(15, Math.min(180, leadMin));
  const hazard: Hazard = /(hail|ola|ओले|ओला|गार|শিলা|ଶିଳା|ஆலங்கட்டி|వడగళ్ళ|ಆಲಿಕಲ್ಲು)/i.test(q)
    ? 'hail'
    : /(lightning|bijli|बिजली|वीज|বাজ|বিদ্যুৎ|ବଜ୍ର|மின்னல்|పిడుగు|ಸಿಡಿಲು|strike)/i.test(q)
      ? 'lightning'
      : /(rain|barish|बारिश|पाऊस|বৃষ্টি|ବର୍ଷା|மழை|వర్షం|ಮಳೆ)/i.test(q)
        ? 'rain'
        : /(wind|gust|squall|aandhi|आंधी|वारा|ঝড়|ଝଡ଼|காற்று|గాలి|ಗಾಳಿ)/i.test(q)
          ? 'gust'
          : 'thunderstorm';
  const sector: Sector = /(farm|kisan|किसान|शेतकरी|কৃষক|ଚାଷୀ|விவசாய|రైతు|ರೈತ|crop|फसल)/i.test(q)
    ? 'farmer'
    : /(pilot|aviation|airport|flight|विमान|उड़ान|বিমান|விமான|విమాన|ವಿಮಾನ)/i.test(q)
      ? 'aviation'
      : /(fisher|boat|marine|sea|मछु|मच्छी|নৌকা|মৎস্য|ମତ୍ସ୍ୟ|மீன|మత్స్య|ಮೀನು)/i.test(q)
        ? 'marine'
        : /(commut|traffic|city|urban|office|metro|यात्रा|शहर)/i.test(q)
          ? 'urban'
          : null;
  let intent: Parsed['intent'] = 'point';
  if (!place && /(worst|strongest|most dangerous|सबसे खतरनाक|सबसे तेज़|biggest)/i.test(q)) intent = 'worst';
  else if (!place && /(summary|overview|situation|status|how many|kitne|कितने|स्थिति|সারাংশ|অবস্থা)/i.test(q)) intent = 'summary';
  else if (!place && sector) intent = 'advisory';
  else if (!place) intent = /(help|what can you)/i.test(q) ? 'help' : 'summary';
  void snap;
  return { place, leadMin, hazard, sector, intent };
}

const HZ: Record<Lang, Record<Hazard, string>> = {
  en: { lightning: 'lightning', hail: 'hail', rain: 'heavy rain', gust: 'strong gusts', thunderstorm: 'a thunderstorm' },
  hi: { lightning: 'बिजली गिरने', hail: 'ओले पड़ने', rain: 'भारी बारिश', gust: 'तेज़ आंधी', thunderstorm: 'आंधी-तूफ़ान' },
  mr: { lightning: 'वीज पडण्याची', hail: 'गारपीट', rain: 'मुसळधार पाऊस', gust: 'जोरदार वारा', thunderstorm: 'वादळ' },
  bn: { lightning: 'বজ্রপাতের', hail: 'শিলাবৃষ্টির', rain: 'ভারী বৃষ্টির', gust: 'ঝোড়ো হাওয়ার', thunderstorm: 'ঝড়ের' },
  or: { lightning: 'ବଜ୍ରପାତର', hail: 'ଶିଳାବୃଷ୍ଟିର', rain: 'ପ୍ରବଳ ବର୍ଷାର', gust: 'ପ୍ରବଳ ପବନର', thunderstorm: 'ଝଡ଼ର' },
  ta: { lightning: 'மின்னல்', hail: 'ஆலங்கட்டி மழை', rain: 'கனமழை', gust: 'பலத்த காற்று', thunderstorm: 'இடியுடன் கூடிய மழை' },
  te: { lightning: 'పిడుగు', hail: 'వడగళ్ల వాన', rain: 'భారీ వర్షం', gust: 'బలమైన గాలులు', thunderstorm: 'ఉరుములతో కూడిన తుఫాను' },
  kn: { lightning: 'ಸಿಡಿಲು', hail: 'ಆಲಿಕಲ್ಲು ಮಳೆ', rain: 'ಭಾರಿ ಮಳೆ', gust: 'ಬಲವಾದ ಗಾಳಿ', thunderstorm: 'ಗುಡುಗು ಸಹಿತ ಮಳೆ' },
};

function level(p: number): 'low' | 'moderate' | 'high' {
  return p >= 0.55 ? 'high' : p >= 0.25 ? 'moderate' : 'low';
}

const LVL: Record<Lang, Record<'low' | 'moderate' | 'high', string>> = {
  en: { low: 'LOW', moderate: 'MODERATE', high: 'HIGH' },
  hi: { low: 'कम', moderate: 'मध्यम', high: 'अधिक' },
  mr: { low: 'कमी', moderate: 'मध्यम', high: 'जास्त' },
  bn: { low: 'কম', moderate: 'মাঝারি', high: 'বেশি' },
  or: { low: 'କମ୍', moderate: 'ମଧ୍ୟମ', high: 'ଅଧିକ' },
  ta: { low: 'குறைவு', moderate: 'மிதமான', high: 'அதிகம்' },
  te: { low: 'తక్కువ', moderate: 'మధ్యస్థ', high: 'ఎక్కువ' },
  kn: { low: 'ಕಡಿಮೆ', moderate: 'ಮಧ್ಯಮ', high: 'ಹೆಚ್ಚು' },
};

export function hazardProb(pn: PointNowcast, h: Hazard) {
  return h === 'lightning' ? Math.max(pn.probs.lightning * (pn.etaMin !== null ? 1 : 0.4), pn.probability * 0.9) : h === 'hail' ? pn.probs.hail * (pn.etaMin !== null ? 1 : 0.2) : h === 'rain' ? pn.probs.heavyRain * (pn.etaMin !== null ? 1 : 0.4) : h === 'gust' ? pn.probs.gust50 * (pn.etaMin !== null ? 1 : 0.3) : pn.probability;
}

export function answerPoint(lang: Lang, place: string, lead: number, h: Hazard, p: number, pn: PointNowcast, cell?: StormCell): string {
  const pct = Math.round(p * 100);
  const L = LVL[lang][level(p)];
  const hz = HZ[lang][h];
  const eta = pn.etaMin;
  const strike = pn.nearestStrikeKm;
  const mv = cell ? `${compass(cell.headingDeg)} ${Math.round(cell.speedKmh)} km/h` : '';
  switch (lang) {
    case 'hi':
      return `${place} में अगले ${lead} मिनट में ${hz} का ख़तरा ${L} है (${pct}%)।${eta !== null && cell ? ` तूफ़ान ${cell.id} लगभग ${eta} मिनट में पहुँच सकता है, दिशा ${mv}।` : ''}${strike !== null ? ` सबसे नज़दीकी बिजली ${strike.toFixed(1)} किमी दूर गिरी।` : ''}`;
    case 'mr':
      return `${place} येथे पुढील ${lead} मिनिटांत ${hz} धोका ${L} आहे (${pct}%).${eta !== null && cell ? ` वादळ ${cell.id} सुमारे ${eta} मिनिटांत पोहोचू शकते.` : ''}${strike !== null ? ` जवळची वीज ${strike.toFixed(1)} किमी अंतरावर.` : ''}`;
    case 'bn':
      return `${place}-এ আগামী ${lead} মিনিটে ${hz} ঝুঁকি ${L} (${pct}%)।${eta !== null && cell ? ` ঝড় ${cell.id} প্রায় ${eta} মিনিটে পৌঁছাতে পারে।` : ''}${strike !== null ? ` নিকটতম বজ্রপাত ${strike.toFixed(1)} কিমি দূরে।` : ''}`;
    case 'or':
      return `${place}ରେ ଆଗାମୀ ${lead} ମିନିଟରେ ${hz} ବିପଦ ${L} (${pct}%)।${eta !== null && cell ? ` ଝଡ଼ ${cell.id} ପ୍ରାୟ ${eta} ମିନିଟରେ ପହଞ୍ଚିପାରେ।` : ''}${strike !== null ? ` ନିକଟତମ ବଜ୍ରପାତ ${strike.toFixed(1)} କିମି ଦୂରରେ।` : ''}`;
    case 'ta':
      return `${place} பகுதியில் அடுத்த ${lead} நிமிடங்களில் ${hz} அபாயம் ${L} (${pct}%).${eta !== null && cell ? ` புயல் ${cell.id} சுமார் ${eta} நிமிடங்களில் வரக்கூடும்.` : ''}${strike !== null ? ` அருகிலுள்ள மின்னல் ${strike.toFixed(1)} கி.மீ தொலைவில்.` : ''}`;
    case 'te':
      return `${place}లో రాబోయే ${lead} నిమిషాల్లో ${hz} ప్రమాదం ${L} (${pct}%).${eta !== null && cell ? ` తుఫాను ${cell.id} సుమారు ${eta} నిమిషాల్లో చేరవచ్చు.` : ''}${strike !== null ? ` సమీప పిడుగు ${strike.toFixed(1)} కి.మీ దూరంలో.` : ''}`;
    case 'kn':
      return `${place}ನಲ್ಲಿ ಮುಂದಿನ ${lead} ನಿಮಿಷಗಳಲ್ಲಿ ${hz} ಅಪಾಯ ${L} (${pct}%).${eta !== null && cell ? ` ಚಂಡಮಾರುತ ${cell.id} ಸುಮಾರು ${eta} ನಿಮಿಷಗಳಲ್ಲಿ ತಲುಪಬಹುದು.` : ''}${strike !== null ? ` ಹತ್ತಿರದ ಸಿಡಿಲು ${strike.toFixed(1)} ಕಿ.ಮೀ ದೂರದಲ್ಲಿ.` : ''}`;
    default:
      return `${level(p) === 'high' ? 'Yes, likely.' : level(p) === 'moderate' ? 'Possibly.' : 'Unlikely.'} The chance of ${hz} at ${place} in the next ${lead} min is ${L} (${pct}%).${eta !== null && cell ? ` Storm ${cell.id} (${cell.maxDbz.toFixed(0)} dBZ, ${cell.flashRate.toFixed(0)} flashes/min) is moving ${mv} and should arrive in about ${eta} min.` : ' No tracked storm is on course for this place.'}${strike !== null ? ` Nearest lightning in the last 15 min: ${strike.toFixed(1)} km.` : ''}`;
  }
}

export const ADVISORY: Record<Exclude<Sector, null>, (s: WorldSnapshot, sev: Severity) => string> = {
  farmer: (s, sev) =>
    `Farm advisory (${s.scenario.region}): ${sev === 'red' || sev === 'orange' ? 'Stop field work now and move to a pucca building. Do not shelter under isolated trees or near pump sets. Keep cattle inside.' : 'Plan field work for early morning; finish by early afternoon when storms peak.'} Postpone pesticide spraying and irrigation for 6 h. Cover harvested produce; secure polyhouses. Hail risk is highest under cells marked with a hail flag.`,
  aviation: (s) => {
    const cells = s.cells.filter((c) => c.maxDbz > 45);
    return `Aviation advisory: ${cells.length} convective cells ≥45 dBZ in the region; highest echo top ${Math.max(0, ...cells.map((c) => c.echoTopKm)).toFixed(1)} km (FL${Math.round((Math.max(0, ...cells.map((c) => c.echoTopKm)) * 3281) / 100)}). Expect wind shear, gusts >50 km/h and hail within 20 km of these cells. Plan holding or diversion; avoid departures under cells with a lightning jump.`;
  },
  marine: (s, sev) => `Marine advisory: ${sev === 'red' || sev === 'orange' ? 'Fishers should return to the nearest harbour now.' : 'Stay alert and keep radios on.'} Squalls of 50-70 km/h are possible near coastal storms; seas rough near cells. Do not venture out until warnings for ${s.scenario.region} are lifted.`,
  urban: (s) => `Urban advisory: avoid underpasses and low roads as rain rates can exceed 50 mm/h under strong cores. Do not stand under hoardings or trees. ${s.alerts.filter((a) => a.status !== 'expired').length} warnings are live; check the commute planner in the citizen app.`,
};
