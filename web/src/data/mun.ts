import raw from 'flag-icons/country.json';
import { COUNTRY_NAMES } from './countries';

/** Reference data for the Prep tools: UN members, groups, blocs, acronyms, motions and resolution phrases. */
type Raw = { code: string; name: string; capital?: string; continent?: string };
const BY = Object.fromEntries((raw as Raw[]).map((c) => [c.code, c]));

export const REGIONAL_GROUPS: Record<string, { label: string; codes: string[] }> = {
  AF: { label: 'African Group', codes: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu ma mz na ne ng rw st sn sc sl so za ss sd tz tg tn ug zm zw'.split(' ') },
  AP: { label: 'Asia-Pacific Group', codes: 'af bh bd bt bn kh cn cy fj in id ir iq jp jo kz kw kg la lb my mv mh fm mn mm nr np kp om pk pw pg ph qa ws sa sb sg kr lk sy tj th tl to tm tv ae uz vu vn ye'.split(' ') },
  EE: { label: 'Eastern European Group', codes: 'al am az by ba bg hr cz ee ge hu lv lt md me mk pl ro ru rs sk si ua'.split(' ') },
  GRULAC: { label: 'Latin American and Caribbean Group', codes: 'ag ar bs bb bz bo br cl co cr cu dm do ec sv gd gt gy ht hn jm mx ni pa py pe kn lc vc sr tt uy ve'.split(' ') },
  WEOG: { label: 'Western European and Others Group', codes: 'ad at be ca dk fi fr de gr is ie il it li lu mt mc nl nz no pt sm es se ch tr gb au us'.split(' ') },
  NONE: { label: 'No regional group', codes: ['ki'] },
};
export const OBSERVERS = [{ code: 'ps', name: 'State of Palestine' }, { code: 'va', name: 'Holy See' }];

/** Well-established memberships. (Not exhaustive: G77 and NAM are left out because they are too large to keep accurate here.) */
export const BLOCS: Record<string, { label: string; codes: string[]; note?: string }> = {
  P5: { label: 'Security Council permanent members (P5)', codes: ['cn', 'fr', 'ru', 'gb', 'us'] },
  UNSC26: { label: 'Security Council elected members (2026)', codes: ['dk', 'gr', 'pk', 'pa', 'so', 'bh', 'co', 'cd', 'lv', 'lr'] },
  G7: { label: 'G7', codes: ['ca', 'fr', 'de', 'it', 'jp', 'gb', 'us'], note: 'The EU also attends.' },
  G20: { label: 'G20', codes: ['ar', 'au', 'br', 'ca', 'cn', 'fr', 'de', 'in', 'id', 'it', 'jp', 'mx', 'ru', 'sa', 'za', 'kr', 'tr', 'gb', 'us'], note: 'Plus the European Union and the African Union.' },
  BRICS: { label: 'BRICS', codes: ['br', 'ru', 'in', 'cn', 'za', 'eg', 'et', 'ir', 'ae', 'id'] },
  EU: { label: 'European Union', codes: 'at be bg hr cy cz dk ee fi fr de gr hu ie it lv lt lu mt nl pl pt ro sk si es se'.split(' ') },
  NATO: { label: 'NATO', codes: 'al be bg ca hr cz dk ee fi fr de gr hu is it lv lt lu me nl mk no pl pt ro sk si es se tr gb us'.split(' ') },
  AU: { label: 'African Union', codes: 'dz ao bj bw bf bi cv cm cf td km cg cd ci dj eg gq er sz et ga gm gh gn gw ke ls lr ly mg mw ml mr mu ma mz na ne ng rw st sn sc sl so za ss sd tz tg tn ug zm zw'.split(' '), note: 'Also the Sahrawi Republic. Some members are suspended from time to time.' },
  ASEAN: { label: 'ASEAN', codes: ['bn', 'kh', 'id', 'la', 'my', 'mm', 'ph', 'sg', 'th', 'vn', 'tl'] },
  ARAB: { label: 'Arab League', codes: 'dz bh km dj eg iq jo kw lb ly mr ma om qa sa so sd sy tn ae ye'.split(' '), note: 'Plus Palestine.' },
  GCC: { label: 'Gulf Cooperation Council', codes: ['bh', 'kw', 'om', 'qa', 'sa', 'ae'] },
  OPEC: { label: 'OPEC', codes: ['dz', 'cg', 'gq', 'ga', 'ir', 'iq', 'kw', 'ly', 'ng', 'sa', 'ae', 've'] },
  SCO: { label: 'Shanghai Cooperation Organisation', codes: ['cn', 'in', 'ir', 'kz', 'kg', 'pk', 'ru', 'tj', 'uz', 'by'] },
  SAARC: { label: 'SAARC', codes: ['af', 'bd', 'bt', 'in', 'mv', 'np', 'pk', 'lk'] },
  QUAD: { label: 'Quad', codes: ['au', 'in', 'jp', 'us'] },
  MERCOSUR: { label: 'Mercosur (full members)', codes: ['ar', 'br', 'py', 'uy', 'bo'] },
  COMMONWEALTH: { label: 'Commonwealth', codes: 'ag au bs bd bb bz bw bn cm ca cy dm sz fj gm gh gd gy in jm ke ki ls mw my mv mt mu mz na nr nz ng pk pg rw kn lc vc ws sc sl sg sb za lk to tt tv ug gb tz vu zm ga tg'.split(' ') },
};

export interface Member { code: string; name: string; capital: string; continent: string; group: string; blocs: string[] }
export const MEMBERS: Member[] = Object.entries(REGIONAL_GROUPS).flatMap(([g, { codes }]) => codes.map((code) => ({
  code, name: COUNTRY_NAMES[code] ?? BY[code]?.name ?? code.toUpperCase(), capital: BY[code]?.capital ?? '', continent: BY[code]?.continent ?? '', group: g,
  blocs: Object.entries(BLOCS).filter(([, b]) => b.codes.includes(code)).map(([k]) => k),
}))).sort((a, b) => a.name.localeCompare(b.name));
export const memberByCode = (c: string) => MEMBERS.find((m) => m.code === c);

export const ACRONYMS: [string, string, string][] = [
  // [acronym, meaning, category]
  ['UN', 'United Nations', 'UN system'], ['UNGA', 'United Nations General Assembly', 'UN system'], ['UNSC', 'United Nations Security Council', 'UN system'], ['ECOSOC', 'Economic and Social Council', 'UN system'],
  ['ICJ', 'International Court of Justice', 'UN system'], ['SG', 'Secretary-General', 'UN system'], ['DSG', 'Deputy Secretary-General', 'UN system'], ['USG', 'Under-Secretary-General', 'UN system'],
  ['DISEC', 'Disarmament and International Security Committee (First Committee)', 'Committees'], ['ECOFIN', 'Economic and Financial Committee (Second Committee)', 'Committees'],
  ['SOCHUM', 'Social, Humanitarian and Cultural Committee (Third Committee)', 'Committees'], ['SPECPOL', 'Special Political and Decolonization Committee (Fourth Committee)', 'Committees'],
  ['HRC', 'Human Rights Council', 'UN system'], ['UNHRC', 'United Nations Human Rights Council', 'UN system'], ['CSW', 'Commission on the Status of Women', 'UN system'], ['CTC', 'Counter-Terrorism Committee', 'UN system'],
  ['UNHCR', 'Office of the UN High Commissioner for Refugees', 'Agencies'], ['OHCHR', 'Office of the High Commissioner for Human Rights', 'Agencies'], ['UNICEF', 'United Nations Children’s Fund', 'Agencies'],
  ['UNESCO', 'UN Educational, Scientific and Cultural Organization', 'Agencies'], ['UNEP', 'United Nations Environment Programme', 'Agencies'], ['UNDP', 'United Nations Development Programme', 'Agencies'],
  ['WHO', 'World Health Organization', 'Agencies'], ['WFP', 'World Food Programme', 'Agencies'], ['FAO', 'Food and Agriculture Organization', 'Agencies'], ['ILO', 'International Labour Organization', 'Agencies'],
  ['IMF', 'International Monetary Fund', 'Agencies'], ['WB', 'World Bank', 'Agencies'], ['WTO', 'World Trade Organization', 'Agencies'], ['WIPO', 'World Intellectual Property Organization', 'Agencies'],
  ['ITU', 'International Telecommunication Union', 'Agencies'], ['IAEA', 'International Atomic Energy Agency', 'Agencies'], ['OPCW', 'Organisation for the Prohibition of Chemical Weapons', 'Agencies'],
  ['UNODC', 'UN Office on Drugs and Crime', 'Agencies'], ['UNCTAD', 'UN Conference on Trade and Development', 'Agencies'], ['UNFPA', 'United Nations Population Fund', 'Agencies'],
  ['UN Women', 'UN Entity for Gender Equality and the Empowerment of Women', 'Agencies'], ['UN-Habitat', 'United Nations Human Settlements Programme', 'Agencies'], ['UNRWA', 'UN Relief and Works Agency for Palestine Refugees', 'Agencies'],
  ['OCHA', 'Office for the Coordination of Humanitarian Affairs', 'Agencies'], ['IOM', 'International Organization for Migration', 'Agencies'], ['ICAO', 'International Civil Aviation Organization', 'Agencies'], ['IMO', 'International Maritime Organization', 'Agencies'],
  ['UNFCCC', 'UN Framework Convention on Climate Change', 'Treaties'], ['COP', 'Conference of the Parties', 'Treaties'], ['IPCC', 'Intergovernmental Panel on Climate Change', 'Agencies'],
  ['DPO', 'Department of Peace Operations', 'UN system'], ['DPPA', 'Department of Political and Peacebuilding Affairs', 'UN system'], ['PBC', 'Peacebuilding Commission', 'UN system'],
  ['UNMISS', 'UN Mission in South Sudan', 'Missions'], ['MONUSCO', 'UN Stabilization Mission in the DR Congo', 'Missions'], ['UNIFIL', 'UN Interim Force in Lebanon', 'Missions'], ['MINUSCA', 'UN Mission in the Central African Republic', 'Missions'],
  ['UNFICYP', 'UN Peacekeeping Force in Cyprus', 'Missions'], ['UNMOGIP', 'UN Military Observer Group in India and Pakistan', 'Missions'], ['UNAMA', 'UN Assistance Mission in Afghanistan', 'Missions'], ['PKO', 'Peacekeeping operation', 'Missions'],
  ['P5', 'The five permanent members of the Security Council', 'Groups'], ['E10', 'The ten elected members of the Security Council', 'Groups'], ['G77', 'Group of 77 developing countries (now 130+)', 'Groups'],
  ['NAM', 'Non-Aligned Movement', 'Groups'], ['G7', 'Group of Seven', 'Groups'], ['G20', 'Group of Twenty', 'Groups'], ['BRICS', 'Brazil, Russia, India, China, South Africa and new members', 'Groups'],
  ['EU', 'European Union', 'Groups'], ['AU', 'African Union', 'Groups'], ['ASEAN', 'Association of Southeast Asian Nations', 'Groups'], ['OAS', 'Organization of American States', 'Groups'],
  ['NATO', 'North Atlantic Treaty Organization', 'Groups'], ['OIC', 'Organisation of Islamic Cooperation', 'Groups'], ['GCC', 'Gulf Cooperation Council', 'Groups'], ['SCO', 'Shanghai Cooperation Organisation', 'Groups'],
  ['SAARC', 'South Asian Association for Regional Cooperation', 'Groups'], ['BIMSTEC', 'Bay of Bengal Initiative for Multi-Sectoral Technical and Economic Cooperation', 'Groups'], ['CARICOM', 'Caribbean Community', 'Groups'],
  ['ECOWAS', 'Economic Community of West African States', 'Groups'], ['SADC', 'Southern African Development Community', 'Groups'], ['IGAD', 'Intergovernmental Authority on Development', 'Groups'],
  ['OSCE', 'Organization for Security and Co-operation in Europe', 'Groups'], ['CoE', 'Council of Europe', 'Groups'], ['OPEC', 'Organization of the Petroleum Exporting Countries', 'Groups'], ['LDC', 'Least developed country', 'Groups'],
  ['SIDS', 'Small island developing states', 'Groups'], ['LLDC', 'Landlocked developing countries', 'Groups'], ['AOSIS', 'Alliance of Small Island States', 'Groups'],
  ['NPT', 'Treaty on the Non-Proliferation of Nuclear Weapons (1968)', 'Treaties'], ['CTBT', 'Comprehensive Nuclear-Test-Ban Treaty (1996)', 'Treaties'], ['TPNW', 'Treaty on the Prohibition of Nuclear Weapons (2017)', 'Treaties'],
  ['CWC', 'Chemical Weapons Convention (1993)', 'Treaties'], ['BWC', 'Biological Weapons Convention (1972)', 'Treaties'], ['ATT', 'Arms Trade Treaty (2013)', 'Treaties'], ['JCPOA', 'Joint Comprehensive Plan of Action (Iran nuclear deal, 2015)', 'Treaties'],
  ['UNCLOS', 'UN Convention on the Law of the Sea (1982)', 'Treaties'], ['ICC', 'International Criminal Court (Rome Statute, 1998)', 'Treaties'], ['ICCPR', 'International Covenant on Civil and Political Rights (1966)', 'Treaties'],
  ['ICESCR', 'International Covenant on Economic, Social and Cultural Rights (1966)', 'Treaties'], ['CEDAW', 'Convention on the Elimination of All Forms of Discrimination against Women (1979)', 'Treaties'],
  ['CRC', 'Convention on the Rights of the Child (1989)', 'Treaties'], ['CAT', 'Convention against Torture (1984)', 'Treaties'], ['UDHR', 'Universal Declaration of Human Rights (1948)', 'Treaties'],
  ['VCLT', 'Vienna Convention on the Law of Treaties (1969)', 'Treaties'], ['VCDR', 'Vienna Convention on Diplomatic Relations (1961)', 'Treaties'], ['IHL', 'International humanitarian law', 'Law'],
  ['R2P', 'Responsibility to Protect', 'Law'], ['CIL', 'Customary international law', 'Law'], ['UPR', 'Universal Periodic Review', 'UN system'], ['SDGs', 'Sustainable Development Goals (2030 Agenda)', 'Development'],
  ['MDGs', 'Millennium Development Goals', 'Development'], ['ODA', 'Official development assistance', 'Development'], ['FfD', 'Financing for Development', 'Development'], ['NDC', 'Nationally determined contribution (Paris Agreement)', 'Development'],
  ['IDP', 'Internally displaced person', 'Humanitarian'], ['DDR', 'Disarmament, demobilisation and reintegration', 'Security'], ['SSR', 'Security sector reform', 'Security'], ['WMD', 'Weapons of mass destruction', 'Security'],
  ['SALW', 'Small arms and light weapons', 'Security'], ['CBMs', 'Confidence-building measures', 'Security'], ['NSA', 'Non-state actor', 'Security'], ['WPS', 'Women, Peace and Security agenda (S/RES/1325)', 'Security'],
  ['YPS', 'Youth, Peace and Security agenda (S/RES/2250)', 'Security'], ['NGO', 'Non-governmental organisation', 'General'], ['IGO', 'Intergovernmental organisation', 'General'],
  ['MUN', 'Model United Nations', 'MUN'], ['EB', 'Executive Board (the chairs who run and mark a committee)', 'MUN'], ['ROP', 'Rules of procedure', 'MUN'], ['GSL', 'General Speakers List', 'MUN'],
  ['Mod', 'Moderated caucus', 'MUN'], ['Unmod', 'Unmoderated caucus', 'MUN'], ['POI', 'Point of information (a question to a speaker)', 'MUN'], ['POO', 'Point of order', 'MUN'],
  ['POPP', 'Point of personal privilege', 'MUN'], ['PPP', 'Point of parliamentary procedure (inquiry)', 'MUN'], ['RoR', 'Right of reply', 'MUN'], ['DR', 'Draft resolution', 'MUN'], ['WP', 'Working paper', 'MUN'],
  ['PP', 'Position paper', 'MUN'], ['PV', 'Present and voting', 'MUN'], ['BD', 'Best Delegate (award)', 'MUN'], ['HC', 'High Commendation (award)', 'MUN'], ['SM', 'Special Mention (award)', 'MUN'],
  ['VM', 'Verbal Mention (award)', 'MUN'], ['IPC', 'International Press Corps', 'MUN'], ['AIPPM', 'All India Political Parties Meet', 'MUN'], ['LS', 'Lok Sabha', 'MUN'], ['JCC', 'Joint Crisis Committee', 'MUN'],
  ['THIMUN', 'The Hague International Model United Nations (and its procedure style)', 'MUN'], ['HMUN', 'Harvard Model United Nations', 'MUN'], ['NMUN', 'National Model United Nations (New York)', 'MUN'],
  ['A/RES', 'General Assembly resolution symbol', 'Documents'], ['S/RES', 'Security Council resolution symbol', 'Documents'], ['E/RES', 'ECOSOC resolution symbol', 'Documents'], ['A/HRC/RES', 'Human Rights Council resolution symbol', 'Documents'],
  ['S/PRST', 'Security Council presidential statement', 'Documents'], ['A/C.1', 'Document of the General Assembly First Committee', 'Documents'],
];

export interface MotionRef { name: string; kind: 'point' | 'motion'; wording: string; vote: string; interrupt: boolean; us: string; thimun: string; precedence: number }
export const MOTIONS: MotionRef[] = [
  { name: 'Point of personal privilege', kind: 'point', wording: '"Point of personal privilege: the delegate cannot hear the speaker."', vote: 'No vote', interrupt: true, us: 'May interrupt a speaker only for audibility.', thimun: 'Same; also used for comfort issues.', precedence: 1 },
  { name: 'Point of order', kind: 'point', wording: '"Point of order: the chair skipped the speakers list."', vote: 'No vote (chair rules)', interrupt: true, us: 'Raised when procedure is broken. Cannot be about substance.', thimun: 'Same; cannot interrupt a speaker.', precedence: 2 },
  { name: 'Point of parliamentary inquiry', kind: 'point', wording: '"Point of parliamentary inquiry: may we move into an unmoderated caucus now?"', vote: 'No vote', interrupt: false, us: 'A question to the chair about procedure.', thimun: 'Called a point of parliamentary procedure.', precedence: 3 },
  { name: 'Point of information', kind: 'point', wording: '"Will the delegate yield to points of information?" then "Is the delegate aware that…?"', vote: 'No vote', interrupt: false, us: 'Only when a speaker yields to questions.', thimun: 'Central: speakers are asked whether they open themselves to points of information.', precedence: 9 },
  { name: 'Right of reply', kind: 'point', wording: '"Right of reply: the delegate of X misrepresented our position."', vote: 'Chair decides', interrupt: false, us: 'For a personal or national insult; granted at the chair’s discretion.', thimun: 'Rare; chairs may allow a brief reply.', precedence: 8 },
  { name: 'Suspend the meeting', kind: 'motion', wording: '"Motion to suspend the meeting for lunch."', vote: 'Simple majority', interrupt: false, us: 'Ends the session until the next one.', thimun: 'Also used for breaks.', precedence: 4 },
  { name: 'Adjourn the meeting', kind: 'motion', wording: '"Motion to adjourn the meeting until next year’s conference."', vote: 'Simple majority', interrupt: false, us: 'Ends the conference for this committee.', thimun: 'Same.', precedence: 5 },
  { name: 'Set the agenda', kind: 'motion', wording: '"Motion to set the agenda to topic A."', vote: 'Simple majority', interrupt: false, us: 'Used when there are two topics; often with speakers for and against.', thimun: 'Agenda is usually fixed by the secretariat.', precedence: 10 },
  { name: 'Open the speakers list', kind: 'motion', wording: '"Motion to open the General Speakers List with a speaking time of 90 seconds."', vote: 'Simple majority', interrupt: false, us: 'Starts formal debate.', thimun: 'Debate is on a resolution rather than a GSL.', precedence: 11 },
  { name: 'Change speaking time', kind: 'motion', wording: '"Motion to set the speaking time to 60 seconds."', vote: 'Simple majority', interrupt: false, us: 'Applies to the GSL.', thimun: 'Chair usually sets time.', precedence: 12 },
  { name: 'Moderated caucus', kind: 'motion', wording: '"Motion for a 10-minute moderated caucus, 45 seconds per speaker, on maritime security."', vote: 'Simple majority', interrupt: false, us: 'The main way to debate a sub-topic. Give total time, speaking time and topic.', thimun: 'Not used; debate is time-in-favour / time-against on a resolution.', precedence: 14 },
  { name: 'Unmoderated caucus', kind: 'motion', wording: '"Motion for a 15-minute unmoderated caucus to write working papers."', vote: 'Simple majority', interrupt: false, us: 'Informal lobbying and drafting.', thimun: 'Lobbying happens before debate.', precedence: 13 },
  { name: 'Introduce a working paper or draft resolution', kind: 'motion', wording: '"Motion to introduce Draft Resolution 1.1."', vote: 'Chair approval or simple majority', interrupt: false, us: 'Needs the required number of sponsors and signatories.', thimun: 'Main submitter reads the operative clauses.', precedence: 15 },
  { name: 'Introduce an amendment', kind: 'motion', wording: '"Motion to introduce an unfriendly amendment to operative clause 3."', vote: 'Simple majority (to pass the amendment)', interrupt: false, us: 'Friendly amendments (all sponsors agree) are added without a vote.', thimun: 'Amendments to the second degree may be allowed.', precedence: 16 },
  { name: 'Table the topic', kind: 'motion', wording: '"Motion to table the topic."', vote: 'Two-thirds', interrupt: false, us: 'Postpones debate on the topic.', thimun: 'Rarely used.', precedence: 7 },
  { name: 'Close debate', kind: 'motion', wording: '"Motion to close debate and move into voting procedure."', vote: 'Two-thirds', interrupt: false, us: 'Ends debate on the topic or draft. Usually two speakers against.', thimun: 'Called "move to the previous question".', precedence: 6 },
  { name: 'Divide the question', kind: 'motion', wording: '"Motion to divide the question and vote on operative clause 4 separately."', vote: 'Simple majority (procedural), then each part substantively', interrupt: false, us: 'Votes on clauses separately.', thimun: 'Clause-by-clause voting may be requested.', precedence: 17 },
  { name: 'Roll call vote', kind: 'motion', wording: '"Motion for a roll call vote."', vote: 'Chair decides or simple majority', interrupt: false, us: 'Each delegation says Yes, No, Abstain (or Pass) when called.', thimun: 'Voting by placard is standard.', precedence: 18 },
  { name: 'Reconsider', kind: 'motion', wording: '"Motion to reconsider the vote on Draft Resolution 1.2."', vote: 'Two-thirds', interrupt: false, us: 'Only by a delegation that voted with the majority.', thimun: 'Rare.', precedence: 19 },
  { name: 'Appeal the chair’s decision', kind: 'motion', wording: '"Motion to appeal the decision of the chair."', vote: 'Two-thirds to overturn', interrupt: false, us: 'Only on discretionary decisions.', thimun: 'Chair’s decisions are generally final.', precedence: 20 },
];

export const PREAMBULATORY = ['Acknowledging', 'Affirming', 'Alarmed by', 'Approving', 'Aware of', 'Bearing in mind', 'Believing', 'Cognizant of', 'Concerned', 'Confident', 'Conscious of', 'Considering',
  'Contemplating', 'Convinced', 'Declaring', 'Deeply concerned', 'Deeply conscious', 'Deeply convinced', 'Deeply disturbed', 'Deeply regretting', 'Desiring', 'Determined', 'Emphasizing', 'Encouraged',
  'Expecting', 'Expressing its appreciation', 'Expressing its satisfaction', 'Fulfilling', 'Fully alarmed', 'Fully aware', 'Fully believing', 'Further deploring', 'Further recalling', 'Gravely concerned',
  'Guided by', 'Having adopted', 'Having considered', 'Having examined', 'Having heard', 'Having received', 'Having studied', 'Keeping in mind', 'Noting with approval', 'Noting with concern', 'Noting with regret',
  'Noting with satisfaction', 'Noting further', 'Noting', 'Observing', 'Reaffirming', 'Realizing', 'Recalling', 'Recognizing', 'Referring', 'Reiterating', 'Seeking', 'Taking into account', 'Taking into consideration',
  'Taking note', 'Underlining', 'Viewing with appreciation', 'Welcoming'];
export const OPERATIVE = ['Accepts', 'Adopts', 'Affirms', 'Approves', 'Authorizes', 'Calls for', 'Calls upon', 'Condemns', 'Confirms', 'Congratulates', 'Considers', 'Decides', 'Declares accordingly',
  'Demands', 'Deplores', 'Designates', 'Draws the attention', 'Emphasizes', 'Encourages', 'Endorses', 'Expresses its appreciation', 'Expresses its hope', 'Expresses its regret', 'Further invites',
  'Further proclaims', 'Further recommends', 'Further reminds', 'Further requests', 'Further resolves', 'Has resolved', 'Invites', 'Notes', 'Proclaims', 'Reaffirms', 'Recommends', 'Regrets', 'Reminds',
  'Requests', 'Resolves', 'Solemnly affirms', 'Strongly condemns', 'Strongly encourages', 'Strongly urges', 'Suggests', 'Supports', 'Takes note of', 'Transmits', 'Trusts', 'Underlines', 'Urges', 'Welcomes'];

export const COMMITTEE_SIZES: Record<string, number> = { 'Security Council': 15, 'General Assembly': 193, 'Human Rights Council': 47, ECOSOC: 54, 'Custom': 30 };
