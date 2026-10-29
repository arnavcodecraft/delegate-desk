import { bundle, P5 } from './countries';

export type CommitteeType = 'mun' | 'crisis' | 'custom' | 'press';
export interface PresetPortfolio { name: string; code?: string | null }
export interface CommitteePreset { name: string; short: string; type: CommitteeType; emblem: string; aliases: string[]; portfolios: PresetPortfolio[]; note?: string }

const countries = (codes: string[]) => codes.map((code) => ({ name: '', code }));
const named = (names: string[]) => names.map((name) => ({ name, code: null }));

// Elected members are for 2026 (terms 2025–26 and 2026–27).
const UNSC = [...P5, 'bh', 'co', 'cd', 'lv', 'lr', 'dk', 'gr', 'pk', 'pa', 'so'];
const UNHRC = ['dz', 'bj', 'bi', 'ci', 'et', 'gh', 'gm', 'ke', 'ma', 'mw', 'ng', 'za', 'sd', 'bd', 'cn', 'cy', 'in', 'id', 'jp', 'kz', 'kw', 'kg', 'my', 'mv', 'qa', 'vn',
  'ar', 'br', 'cl', 'cu', 'do', 'mx', 'py', 'co', 'fr', 'de', 'nl', 'es', 'gb', 'ch', 'is', 'al', 'bg', 'cz', 'ge', 'lt', 'ro'];
const ECOSOC = ['dz', 'ao', 'cm', 'cd', 'eg', 'gh', 'ke', 'ma', 'mu', 'ng', 'sn', 'za', 'tz', 'tn', 'bd', 'cn', 'in', 'id', 'ir', 'jp', 'kz', 'ae', 'kr', 'pk', 'th',
  'ar', 'br', 'cl', 'co', 'cr', 'cu', 'ec', 'gt', 'mx', 'pe', 'au', 'at', 'be', 'ca', 'dk', 'fi', 'fr', 'de', 'it', 'nl', 'no', 'gb', 'us', 'am', 'bg', 'cz', 'hr', 'ru', 'ua'];
const AU = ['dz', 'ao', 'bj', 'bw', 'bf', 'bi', 'cv', 'cm', 'cf', 'td', 'km', 'cg', 'cd', 'ci', 'dj', 'eg', 'gq', 'er', 'sz', 'et', 'ga', 'gm', 'gh', 'gn', 'gw', 'ke', 'ls', 'lr',
  'ly', 'mg', 'mw', 'ml', 'mr', 'mu', 'ma', 'mz', 'na', 'ne', 'ng', 'rw', 'st', 'sn', 'sc', 'sl', 'so', 'za', 'ss', 'sd', 'tz', 'tg', 'tn', 'ug', 'zm', 'zw', 'eh'];
const COMMON = bundle('common');

export const PRESETS: CommitteePreset[] = [
  { name: 'United Nations Security Council', short: 'UNSC', type: 'mun', emblem: 'shield', aliases: ['security council', 'unsc'], portfolios: countries(UNSC), note: 'The 15 members for 2026' },
  { name: 'UN General Assembly', short: 'UNGA', type: 'mun', emblem: 'globe', aliases: ['general assembly plenary', 'unga plenary', 'unga'], portfolios: countries(COMMON) },
  { name: 'Disarmament and International Security Committee', short: 'DISEC', type: 'mun', emblem: 'shield', aliases: ['disec', 'first committee', 'disarmament'], portfolios: countries(COMMON) },
  { name: 'Economic and Financial Committee', short: 'ECOFIN', type: 'mun', emblem: 'coins', aliases: ['ecofin', 'second committee', 'economic and financial'], portfolios: countries(COMMON) },
  { name: 'Social, Humanitarian and Cultural Committee', short: 'SOCHUM', type: 'mun', emblem: 'users', aliases: ['sochum', 'third committee', 'social humanitarian'], portfolios: countries(COMMON) },
  { name: 'Special Political and Decolonization Committee', short: 'SPECPOL', type: 'mun', emblem: 'globe', aliases: ['specpol', 'fourth committee', 'decolonization', 'decolonisation'], portfolios: countries(COMMON) },
  { name: 'Legal Committee', short: 'LEGAL', type: 'mun', emblem: 'scale', aliases: ['sixth committee', 'legal committee'], portfolios: countries(COMMON) },
  { name: 'UN Human Rights Council', short: 'UNHRC', type: 'mun', emblem: 'heart-handshake', aliases: ['human rights council', 'unhrc', 'hrc'], portfolios: countries(UNHRC), note: 'A typical 47-member line-up; edit to match the current council' },
  { name: 'Economic and Social Council', short: 'ECOSOC', type: 'mun', emblem: 'coins', aliases: ['ecosoc', 'economic and social council'], portfolios: countries(ECOSOC), note: 'A typical 54-member line-up' },
  { name: 'World Health Organization', short: 'WHO', type: 'mun', emblem: 'heart-pulse', aliases: ['world health', 'who', 'wha'], portfolios: countries(COMMON) },
  { name: 'UN Environment Programme', short: 'UNEP', type: 'mun', emblem: 'leaf', aliases: ['unep', 'environment programme', 'environment assembly'], portfolios: countries(COMMON) },
  { name: 'UN Framework Convention on Climate Change', short: 'UNFCCC', type: 'mun', emblem: 'leaf', aliases: ['unfccc', 'climate change', 'cop'], portfolios: countries(COMMON) },
  { name: 'UNESCO', short: 'UNESCO', type: 'mun', emblem: 'book', aliases: ['unesco', 'educational, scientific'], portfolios: countries(COMMON) },
  { name: 'UNICEF', short: 'UNICEF', type: 'mun', emblem: 'baby', aliases: ['unicef', "children's fund", 'childrens fund'], portfolios: countries(COMMON) },
  { name: 'UN Development Programme', short: 'UNDP', type: 'mun', emblem: 'sprout', aliases: ['undp', 'development programme'], portfolios: countries(COMMON) },
  { name: 'UN Office on Drugs and Crime', short: 'UNODC', type: 'mun', emblem: 'scale', aliases: ['unodc', 'drugs and crime'], portfolios: countries(COMMON) },
  { name: 'Commission on the Status of Women', short: 'CSW', type: 'mun', emblem: 'users', aliases: ['status of women', 'uncsw', 'csw', 'un women'], portfolios: countries(COMMON.slice(0, 45)) },
  { name: 'UN High Commissioner for Refugees', short: 'UNHCR', type: 'mun', emblem: 'home', aliases: ['unhcr', 'refugees'], portfolios: countries(COMMON) },
  { name: 'International Atomic Energy Agency', short: 'IAEA', type: 'mun', emblem: 'atom', aliases: ['iaea', 'atomic energy'], portfolios: countries(COMMON.slice(0, 35)) },
  { name: 'World Trade Organization', short: 'WTO', type: 'mun', emblem: 'coins', aliases: ['world trade', 'wto'], portfolios: countries(COMMON) },
  { name: 'North Atlantic Treaty Organization', short: 'NATO', type: 'mun', emblem: 'shield', aliases: ['nato', 'north atlantic'], portfolios: countries(bundle('nato')) },
  { name: 'Council of the European Union', short: 'EU', type: 'mun', emblem: 'stars', aliases: ['european council', 'council of the eu', 'european union', 'eu council'], portfolios: countries(bundle('eu')) },
  { name: 'Association of Southeast Asian Nations', short: 'ASEAN', type: 'mun', emblem: 'globe', aliases: ['asean'], portfolios: countries(bundle('asean')) },
  { name: 'League of Arab States', short: 'ARAB LEAGUE', type: 'mun', emblem: 'globe', aliases: ['arab league', 'league of arab states'], portfolios: countries(bundle('arab')) },
  { name: 'African Union', short: 'AU', type: 'mun', emblem: 'globe', aliases: ['african union'], portfolios: countries(AU) },
  { name: 'G20', short: 'G20', type: 'mun', emblem: 'coins', aliases: ['g20', 'group of twenty'], portfolios: [...countries(bundle('g20')), { name: 'European Union', code: 'eu' }, { name: 'African Union', code: null }] },
  { name: 'G7', short: 'G7', type: 'mun', emblem: 'coins', aliases: ['g7', 'group of seven'], portfolios: [...countries(bundle('g7')), { name: 'European Union', code: 'eu' }] },
  { name: 'BRICS', short: 'BRICS', type: 'mun', emblem: 'globe', aliases: ['brics'], portfolios: countries(bundle('brics')) },
  { name: 'SAARC', short: 'SAARC', type: 'mun', emblem: 'globe', aliases: ['saarc', 'south asian association'], portfolios: countries(bundle('saarc')) },
  { name: 'Shanghai Cooperation Organisation', short: 'SCO', type: 'mun', emblem: 'globe', aliases: ['shanghai cooperation', 'sco'], portfolios: countries(['cn', 'ru', 'in', 'pk', 'kz', 'kg', 'tj', 'uz', 'ir', 'by']) },
  { name: 'OPEC', short: 'OPEC', type: 'mun', emblem: 'fuel', aliases: ['opec', 'petroleum exporting'], portfolios: countries(['dz', 'cg', 'gq', 'ga', 'ir', 'iq', 'kw', 'ly', 'ng', 'sa', 'ae', 've']) },
  { name: 'International Court of Justice', short: 'ICJ', type: 'custom', emblem: 'scale', aliases: ['international court of justice', 'icj', 'world court'],
    portfolios: named(['President of the Court', 'Vice-President of the Court', ...Array.from({ length: 13 }, (_, i) => `Judge ${i + 1}`), 'Advocate for the Applicant 1', 'Advocate for the Applicant 2', 'Advocate for the Respondent 1', 'Advocate for the Respondent 2']) },
  { name: 'Lok Sabha', short: 'LS', type: 'custom', emblem: 'landmark', aliases: ['lok sabha', 'house of the people'],
    portfolios: named(['Prime Minister', 'Leader of the Opposition', 'Minister of Home Affairs', 'Minister of Finance', 'Minister of Defence', 'Minister of External Affairs', 'Minister of Education',
      'Minister of Health and Family Welfare', 'Minister of Agriculture', 'Minister of Law and Justice', 'Minister of Railways', 'Minister of Information and Broadcasting',
      'MP, Varanasi', 'MP, Rae Bareli', 'MP, Wayanad', 'MP, Thiruvananthapuram', 'MP, Hyderabad', 'MP, Baramati', 'MP, Kannauj', 'MP, Diamond Harbour', 'MP, Mumbai North', 'MP, Chennai Central',
      'MP, Patna Sahib', 'MP, Amritsar', 'MP, Shillong', 'MP, Srinagar', 'MP, Bengaluru South', 'MP, New Delhi', 'MP, Jaipur', 'MP, Lucknow']) },
  { name: 'Rajya Sabha', short: 'RS', type: 'custom', emblem: 'landmark', aliases: ['rajya sabha', 'council of states'],
    portfolios: named(['Chairman (Vice-President of India)', 'Leader of the House', 'Leader of the Opposition', ...['Uttar Pradesh', 'Maharashtra', 'Tamil Nadu', 'West Bengal', 'Bihar', 'Karnataka', 'Gujarat', 'Rajasthan', 'Kerala', 'Punjab', 'Assam', 'Delhi', 'Telangana', 'Odisha', 'Nominated member'].map((s) => `Member, ${s}`)]) },
  { name: 'All India Political Parties Meet', short: 'AIPPM', type: 'custom', emblem: 'landmark', aliases: ['aippm', 'all india political parties'],
    portfolios: named(['Narendra Modi', 'Amit Shah', 'Rajnath Singh', 'Nirmala Sitharaman', 'S. Jaishankar', 'J. P. Nadda', 'Nitin Gadkari', 'Yogi Adityanath', 'Himanta Biswa Sarma', 'Devendra Fadnavis',
      'Rahul Gandhi', 'Mallikarjun Kharge', 'Priyanka Gandhi Vadra', 'Shashi Tharoor', 'Mamata Banerjee', 'Arvind Kejriwal', 'Akhilesh Yadav', 'M. K. Stalin', 'Nitish Kumar', 'Sharad Pawar',
      'Uddhav Thackeray', 'Asaduddin Owaisi', 'Mayawati', 'Omar Abdullah', 'Mehbooba Mufti', 'N. Chandrababu Naidu', 'Revanth Reddy', 'Siddaramaiah', 'Pinarayi Vijayan', 'Hemant Soren',
      'Bhagwant Mann', 'Tejashwi Yadav', 'Chirag Paswan', 'Supriya Sule', 'Eknath Shinde']) },
  { name: 'Union Cabinet of India', short: 'CABINET', type: 'crisis', emblem: 'zap', aliases: ['union cabinet', 'indian cabinet', 'cabinet of india'],
    portfolios: named(['Prime Minister', 'Minister of Home Affairs', 'Minister of Defence', 'Minister of External Affairs', 'Minister of Finance', 'National Security Advisor', 'Chief of Defence Staff',
      'Chief of the Army Staff', 'Chief of the Naval Staff', 'Chief of the Air Staff', 'Director, Intelligence Bureau', 'Secretary, R&AW', 'Governor, Reserve Bank of India', 'Minister of Health', 'Minister of Information and Broadcasting']) },
  { name: 'Joint Crisis Committee', short: 'JCC', type: 'crisis', emblem: 'zap', aliases: ['jcc', 'joint crisis', 'war cabinet', 'crisis cabinet'],
    portfolios: named(['Head of State', 'Head of Government', 'Minister of Defence', 'Foreign Minister', 'Interior Minister', 'Finance Minister', 'Director of Intelligence', 'Chief of the Army',
      'Chief of the Navy', 'Chief of the Air Force', 'Minister of Health', 'Minister of Energy', 'Central Bank Governor', 'Press Secretary', 'Leader of the Opposition']) },
  { name: 'International Press Corps', short: 'IPC', type: 'press', emblem: 'newspaper', aliases: ['international press', 'press corps', 'ipc', 'press'],
    portfolios: named(['Reuters', 'Associated Press', 'Agence France-Presse', 'BBC News', 'Al Jazeera', 'CNN', 'The New York Times', 'The Guardian', 'The Washington Post', 'Xinhua',
      'The Hindu', 'The Indian Express', 'Hindustan Times', 'NDTV', 'Deutsche Welle', 'France 24', 'Bloomberg', 'The Economist']) },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Find the preset a typed committee name refers to ("UN Human Rights Council", "unhrc", "Lok Sabha"…). */
export function findPreset(typed: string, type?: CommitteeType): CommitteePreset | null {
  const t = norm(typed);
  if (t.length < 2) return null;
  const pool = type ? PRESETS.filter((p) => p.type === type || (type === 'custom' && p.type === 'crisis')) : PRESETS;
  let best: CommitteePreset | null = null; let score = 0;
  for (const p of pool) {
    for (const a of [...p.aliases, p.name.toLowerCase(), p.short.toLowerCase()]) {
      const n = norm(a);
      const s = t === n ? 100 : t.includes(n) && n.length >= 3 ? 50 + n.length : n.startsWith(t) && t.length >= 4 ? 20 + t.length : 0;
      if (s > score) { score = s; best = p; }
    }
  }
  return best;
}

export const EMBLEMS: { key: string; label: string; color: string }[] = [
  { key: 'globe', label: 'Globe', color: '#2563eb' }, { key: 'shield', label: 'Shield', color: '#1e3a8a' }, { key: 'scale', label: 'Justice', color: '#7c3aed' },
  { key: 'heart-handshake', label: 'Rights', color: '#db2777' }, { key: 'heart-pulse', label: 'Health', color: '#dc2626' }, { key: 'leaf', label: 'Environment', color: '#16a34a' },
  { key: 'coins', label: 'Economy', color: '#ca8a04' }, { key: 'users', label: 'People', color: '#0891b2' }, { key: 'book', label: 'Culture', color: '#9333ea' },
  { key: 'landmark', label: 'Parliament', color: '#92400e' }, { key: 'newspaper', label: 'Press', color: '#475569' }, { key: 'zap', label: 'Crisis', color: '#ea580c' },
  { key: 'stars', label: 'Union', color: '#1d4ed8' }, { key: 'home', label: 'Refuge', color: '#0f766e' }, { key: 'atom', label: 'Science', color: '#0e7490' },
  { key: 'baby', label: 'Children', color: '#e11d48' }, { key: 'sprout', label: 'Development', color: '#15803d' }, { key: 'fuel', label: 'Energy', color: '#b45309' },
];
export const DIFFICULTIES = [
  { key: 'beginner', label: 'Beginner' }, { key: 'intermediate', label: 'Intermediate' }, { key: 'advanced', label: 'Advanced' }, { key: 'expert', label: 'Expert' },
] as const;
export const LANGUAGES = ['English', 'Hindi', 'French', 'Spanish', 'Arabic', 'Chinese', 'Russian', 'German', 'Portuguese'];
export const TYPE_INFO: Record<CommitteeType, { label: string; blurb: string; emblem: string; noun: string }> = {
  mun: { label: 'MUN', blurb: 'Country delegations: General Assembly, Security Council, ECOSOC and every UN body.', emblem: 'globe', noun: 'countries' },
  crisis: { label: 'Crisis', blurb: 'Character roles and live, fast-moving crises.', emblem: 'zap', noun: 'characters' },
  custom: { label: 'Custom', blurb: 'Parliaments, courts and any format of your own, with parties or seats you name.', emblem: 'landmark', noun: 'seats' },
  press: { label: 'Press', blurb: 'Outlets and journalists who report on every committee, with a Press Desk.', emblem: 'newspaper', noun: 'outlets' },
};
