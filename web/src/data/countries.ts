import raw from 'flag-icons/country.json';

/** Display names used in committees (MUN convention) where they differ from the flag library's. */
const RENAMES: Record<string, string> = {
  us: 'United States', ru: 'Russian Federation', eu: 'European Union', cz: 'Czechia', ps: 'State of Palestine', fm: 'Micronesia',
  bn: 'Brunei', cd: 'DR Congo', cg: 'Republic of the Congo', kp: 'North Korea', kr: 'South Korea', la: 'Laos', sy: 'Syria',
};

const all = (raw as { code: string; name: string; iso: boolean }[]);
export const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(all.map((c) => [c.code, RENAMES[c.code] ?? c.name]));
/** Every country and territory with a flag, for "Where is it happening?". */
export const PLACES = all.filter((c) => c.iso).map((c) => ({ code: c.code, name: RENAMES[c.code] ?? c.name })).sort((a, b) => a.name.localeCompare(b.name));
export const countryName = (code: string | null | undefined) => (code ? COUNTRY_NAMES[code.toLowerCase()] ?? code.toUpperCase() : '');

/** The 193 UN member states. */
export const UN_MEMBERS = (`af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td cl cn co km cg cd cr ci
  hr cu cy cz dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy ht hn hu is in id ir iq ie il it jm jp jo kz ke ki
  kp kr kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx fm md mc mn me ma mz mm na nr np nl nz ni ne ng mk no om pk pw pa pg py
  pe ph pl pt qa ro ru rw kn lc vc ws sm st sa sn rs sc sl sg sk si sb so za ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua
  ae gb us uy uz vu ve vn ye zm zw`).split(/\s+/).filter(Boolean);
/** Observer states and common non-member delegations. */
export const OBSERVERS = ['ps', 'va', 'eu', 'tw', 'xk'];
/** Every name a delegation can be picked from: members first, then observers. */
export const DELEGATIONS = [...UN_MEMBERS, ...OBSERVERS].map((code) => ({ code, name: COUNTRY_NAMES[code] ?? code.toUpperCase() }));

export const P5 = ['us', 'cn', 'ru', 'gb', 'fr'];
const G20 = ['ar', 'au', 'br', 'ca', 'cn', 'fr', 'de', 'in', 'id', 'it', 'jp', 'kr', 'mx', 'ru', 'sa', 'za', 'tr', 'gb', 'us'];
/** Rough "weight" of a delegation, used to sort by importance and to set allotment tiers. */
export function importance(code: string | null | undefined): 'high' | 'standard' | 'low' {
  if (!code) return 'standard';
  if (P5.includes(code)) return 'high';
  if (G20.includes(code) || ['il', 'ir', 'pk', 'ua', 'kp', 'eg', 'ng', 'ae', 'es'].includes(code)) return 'standard';
  return 'low';
}

export const BUNDLES: { key: string; label: string; codes: string[] }[] = [
  { key: 'p5', label: 'P5', codes: P5 },
  { key: 'g7', label: 'G7', codes: ['us', 'gb', 'fr', 'de', 'it', 'jp', 'ca'] },
  { key: 'brics', label: 'BRICS+', codes: ['br', 'ru', 'in', 'cn', 'za', 'eg', 'et', 'ir', 'ae', 'id'] },
  { key: 'g20', label: 'G20', codes: G20 },
  { key: 'eu', label: 'EU', codes: ['at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se'] },
  { key: 'nato', label: 'NATO', codes: ['al', 'be', 'bg', 'ca', 'hr', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'is', 'it', 'lv', 'lt', 'lu', 'me', 'nl', 'mk', 'no', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'tr', 'gb', 'us'] },
  { key: 'asean', label: 'ASEAN', codes: ['bn', 'kh', 'id', 'la', 'my', 'mm', 'ph', 'sg', 'th', 'vn', 'tl'] },
  { key: 'arab', label: 'Arab League', codes: ['dz', 'bh', 'km', 'dj', 'eg', 'iq', 'jo', 'kw', 'lb', 'ly', 'mr', 'ma', 'om', 'ps', 'qa', 'sa', 'so', 'sd', 'sy', 'tn', 'ae', 'ye'] },
  { key: 'saarc', label: 'SAARC', codes: ['af', 'bd', 'bt', 'in', 'mv', 'np', 'pk', 'lk'] },
  { key: 'gcc', label: 'GCC', codes: ['bh', 'kw', 'om', 'qa', 'sa', 'ae'] },
  { key: 'common', label: 'Common line-up', codes: ['us', 'cn', 'ru', 'gb', 'fr', 'in', 'jp', 'de', 'br', 'za', 'ca', 'au', 'it', 'es', 'mx', 'ar', 'id', 'sa', 'tr', 'kr', 'kp', 'ir', 'iq', 'il', 'ps', 'eg', 'ng', 'ke', 'et', 'pk', 'bd', 'af', 'ua', 'pl', 'se', 'no', 'nl', 'ch', 'be', 've', 'co', 'cl', 'pe', 'cu', 'sy', 'ae', 'qa', 'lb', 'jo', 'ma', 'dz', 'ly', 'sd', 'ss', 'cd', 'ml', 'so', 'ye', 'mm', 'th', 'vn', 'ph', 'my', 'sg', 'nz'] },
];
export const bundle = (k: string) => BUNDLES.find((b) => b.key === k)!.codes;

/** Match pasted text ("france, Republic of Korea, UK…") to delegation codes; unknown lines are kept as names. */
const ALIASES: Record<string, string> = {
  usa: 'us', 'united states of america': 'us', america: 'us', uk: 'gb', britain: 'gb', 'great britain': 'gb', russia: 'ru', 'south korea': 'kr', 'republic of korea': 'kr',
  'north korea': 'kp', dprk: 'kp', 'czech republic': 'cz', turkey: 'tr', 'ivory coast': 'ci', drc: 'cd', 'democratic republic of the congo': 'cd', congo: 'cg',
  palestine: 'ps', uae: 'ae', 'holy see': 'va', vatican: 'va', iran: 'ir', syria: 'sy', vietnam: 'vn', 'viet nam': 'vn', laos: 'la', swaziland: 'sz', burma: 'mm',
  'east timor': 'tl', 'cape verde': 'cv', macedonia: 'mk', eu: 'eu', 'european union': 'eu', 'prc': 'cn', "people's republic of china": 'cn', 'bolivia (plurinational state of)': 'bo',
  'venezuela (bolivarian republic of)': 've', 'tanzania': 'tz', 'united republic of tanzania': 'tz', 'moldova': 'md', 'republic of moldova': 'md',
};
const byName = new Map(Object.entries(COUNTRY_NAMES).map(([code, name]) => [name.toLowerCase(), code]));
export function matchCountry(text: string): { code: string | null; name: string } {
  const t = text.trim().replace(/^[\d.)\-•*\s]+/, '').trim();
  const k = t.toLowerCase();
  const code = ALIASES[k] ?? byName.get(k) ?? (k.length === 2 && COUNTRY_NAMES[k] ? k : null);
  return code ? { code, name: COUNTRY_NAMES[code] } : { code: null, name: t };
}
