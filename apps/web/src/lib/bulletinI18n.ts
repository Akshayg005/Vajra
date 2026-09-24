import type { Alert } from '@vajra/contracts';
import { fmtIST } from '../engine/geo';
import { fmtN } from '../engine/alerts';

export type BLang = 'en' | 'hi' | 'mr' | 'bn' | 'or' | 'ta' | 'te' | 'kn';

const SEV: Record<BLang, Record<Alert['severity'], string>> = {
  en: { green: 'GREEN', yellow: 'YELLOW (Be updated)', orange: 'ORANGE (Be prepared)', red: 'RED (Take action)' },
  hi: { green: 'हरा', yellow: 'पीला (सतर्क रहें)', orange: 'नारंगी (तैयार रहें)', red: 'लाल (तुरंत कार्रवाई करें)' },
  mr: { green: 'हिरवा', yellow: 'पिवळा (सतर्क रहा)', orange: 'नारिंगी (तयार रहा)', red: 'लाल (त्वरित कृती करा)' },
  bn: { green: 'সবুজ', yellow: 'হলুদ (সতর্ক থাকুন)', orange: 'কমলা (প্রস্তুত থাকুন)', red: 'লাল (এখনই ব্যবস্থা নিন)' },
  or: { green: 'ସବୁଜ', yellow: 'ହଳଦିଆ (ସତର୍କ ରୁହନ୍ତୁ)', orange: 'କମଳା (ପ୍ରସ୍ତୁତ ରୁହନ୍ତୁ)', red: 'ଲାଲ (ତୁରନ୍ତ ପଦକ୍ଷେପ ନିଅନ୍ତୁ)' },
  ta: { green: 'பச்சை', yellow: 'மஞ்சள் (கவனமாக இருங்கள்)', orange: 'ஆரஞ்சு (தயாராக இருங்கள்)', red: 'சிவப்பு (உடனே செயல்படுங்கள்)' },
  te: { green: 'ఆకుపచ్చ', yellow: 'పసుపు (అప్రమత్తంగా ఉండండి)', orange: 'నారింజ (సిద్ధంగా ఉండండి)', red: 'ఎరుపు (వెంటనే చర్య తీసుకోండి)' },
  kn: { green: 'ಹಸಿರು', yellow: 'ಹಳದಿ (ಎಚ್ಚರವಾಗಿರಿ)', orange: 'ಕಿತ್ತಳೆ (ಸಿದ್ಧರಾಗಿರಿ)', red: 'ಕೆಂಪು (ತಕ್ಷಣ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ)' },
};

type Slots = { sev: string; places: string; district: string; from: string; to: string; win: number; pop: string; farmers: string; prob: number };

const BODY: Record<BLang, (s: Slots) => string> = {
  en: (s) => `NOWCAST WARNING — ${s.sev}\nThunderstorm with lightning very likely over ${s.places} (${s.district}) in the next ${s.win} minutes, valid ${s.from}–${s.to} IST. Probability ${s.prob}%.\nAbout ${s.pop} people and ${s.farmers} farm workers are exposed.\nStay indoors. Keep away from open fields, trees and water bodies. Wait 30 minutes after the last thunder.`,
  hi: (s) => `नाउकास्ट चेतावनी — ${s.sev}\nअगले ${s.win} मिनट में ${s.places} (${s.district}) में बिजली के साथ आंधी-तूफ़ान की प्रबल संभावना, ${s.from}–${s.to} IST तक मान्य। संभावना ${s.prob}%।\nलगभग ${s.pop} लोग और ${s.farmers} खेतिहर मज़दूर प्रभावित हो सकते हैं।\nघर के अंदर रहें। खुले खेत, पेड़ और जलाशयों से दूर रहें। आख़िरी गरज के 30 मिनट बाद तक रुकें।`,
  mr: (s) => `नाउकास्ट इशारा — ${s.sev}\nपुढील ${s.win} मिनिटांत ${s.places} (${s.district}) येथे विजांसह वादळाची दाट शक्यता, ${s.from}–${s.to} IST पर्यंत वैध. शक्यता ${s.prob}%.\nसुमारे ${s.pop} लोक आणि ${s.farmers} शेतमजूर धोक्यात आहेत.\nघरात रहा. मोकळी शेते, झाडे आणि पाणवठ्यांपासून दूर रहा. शेवटच्या गडगडाटानंतर 30 मिनिटे थांबा.`,
  bn: (s) => `নাউকাস্ট সতর্কবার্তা — ${s.sev}\nআগামী ${s.win} মিনিটে ${s.places} (${s.district})-এ বজ্রপাত সহ ঝড়ের প্রবল সম্ভাবনা, ${s.from}–${s.to} IST পর্যন্ত বৈধ। সম্ভাবনা ${s.prob}%।\nপ্রায় ${s.pop} মানুষ ও ${s.farmers} জন কৃষিশ্রমিক ঝুঁকিতে।\nঘরে থাকুন। খোলা মাঠ, গাছ ও জলাশয় থেকে দূরে থাকুন। শেষ বাজের পর ৩০ মিনিট অপেক্ষা করুন।`,
  or: (s) => `ନାଉକାଷ୍ଟ ଚେତାବନୀ — ${s.sev}\nଆଗାମୀ ${s.win} ମିନିଟରେ ${s.places} (${s.district})ରେ ବଜ୍ରପାତ ସହ ଝଡ଼ର ପ୍ରବଳ ସମ୍ଭାବନା, ${s.from}–${s.to} IST ପର୍ଯ୍ୟନ୍ତ ବୈଧ। ସମ୍ଭାବନା ${s.prob}%।\nପ୍ରାୟ ${s.pop} ଲୋକ ଓ ${s.farmers} ଜଣ କୃଷି ଶ୍ରମିକ ବିପଦରେ।\nଘର ଭିତରେ ରୁହନ୍ତୁ। ଖୋଲା ବିଲ, ଗଛ ଓ ଜଳାଶୟରୁ ଦୂରେଇ ରୁହନ୍ତୁ। ଶେଷ ଘଡ଼ଘଡ଼ି ପରେ ୩୦ ମିନିଟ ଅପେକ୍ଷା କରନ୍ତୁ।`,
  ta: (s) => `நவ்காஸ்ட் எச்சரிக்கை — ${s.sev}\nஅடுத்த ${s.win} நிமிடங்களில் ${s.places} (${s.district}) பகுதியில் மின்னலுடன் கூடிய இடியுடன் மழைக்கு அதிக வாய்ப்பு, ${s.from}–${s.to} IST வரை. வாய்ப்பு ${s.prob}%.\nசுமார் ${s.pop} மக்கள் மற்றும் ${s.farmers} விவசாயத் தொழிலாளர்கள் பாதிக்கப்படலாம்.\nவீட்டிற்குள் இருங்கள். திறந்த வயல்கள், மரங்கள், நீர்நிலைகளைத் தவிர்க்கவும். கடைசி இடிக்குப் பின் 30 நிமிடம் காத்திருங்கள்.`,
  te: (s) => `నౌకాస్ట్ హెచ్చరిక — ${s.sev}\nరాబోయే ${s.win} నిమిషాల్లో ${s.places} (${s.district})లో పిడుగులతో కూడిన ఉరుముల తుఫానుకు బలమైన అవకాశం, ${s.from}–${s.to} IST వరకు. అవకాశం ${s.prob}%.\nసుమారు ${s.pop} మంది ప్రజలు, ${s.farmers} వ్యవసాయ కూలీలు ప్రమాదంలో ఉన్నారు.\nఇంట్లోనే ఉండండి. పొలాలు, చెట్లు, నీటి వనరులకు దూరంగా ఉండండి. చివరి ఉరుము తర్వాత 30 నిమిషాలు వేచి ఉండండి.`,
  kn: (s) => `ನೌಕಾಸ್ಟ್ ಎಚ್ಚರಿಕೆ — ${s.sev}\nಮುಂದಿನ ${s.win} ನಿಮಿಷಗಳಲ್ಲಿ ${s.places} (${s.district}) ಭಾಗದಲ್ಲಿ ಸಿಡಿಲು ಸಹಿತ ಗುಡುಗು ಮಳೆಯ ಹೆಚ್ಚಿನ ಸಾಧ್ಯತೆ, ${s.from}–${s.to} IST ವರೆಗೆ. ಸಾಧ್ಯತೆ ${s.prob}%.\nಸುಮಾರು ${s.pop} ಜನರು ಮತ್ತು ${s.farmers} ಕೃಷಿ ಕಾರ್ಮಿಕರು ಅಪಾಯದಲ್ಲಿದ್ದಾರೆ.\nಮನೆಯೊಳಗೆ ಇರಿ. ತೆರೆದ ಹೊಲ, ಮರ ಮತ್ತು ಜಲಮೂಲಗಳಿಂದ ದೂರವಿರಿ. ಕೊನೆಯ ಗುಡುಗಿನ ನಂತರ 30 ನಿಮಿಷ ಕಾಯಿರಿ.`,
};

/** Localised public bulletin with live slots (same numbers as the English bulletin). */
export function bulletinFor(a: Alert, lang: BLang): string {
  if (lang === 'en') return a.bulletin;
  const places = a.areas
    .filter((x) => x.level === 'block' || x.level === 'panchayat')
    .map((x) => x.name)
    .slice(0, 3)
    .join(', ');
  return BODY[lang]({
    sev: SEV[lang][a.severity],
    places,
    district: a.district,
    from: fmtIST(a.issuedAt),
    to: fmtIST(a.expiresAt),
    win: Math.max(10, a.etaMin + 30),
    pop: fmtN(a.impact.population),
    farmers: fmtN(a.impact.farmersInField),
    prob: Math.round(a.probability * 100),
  });
}

export const BLANGS: { code: BLang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'or', label: 'ଓଡ଼ିଆ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
];
