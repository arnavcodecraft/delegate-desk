import { MASTERCLASS } from './masterclass';

/** Learn: short courses with lessons and quizzes, and the pool the daily challenge draws from. */
export interface Quiz { q: string; options: string[]; answer: number; why: string }
export interface Lesson {
  id: string; title: string; minutes: number; body: string[]; quiz: Quiz[];
  key?: string[];     // key takeaways
  say?: string[];     // exact words to use on the floor
  avoid?: string[];   // common mistakes
  drill?: string;     // a practice task
}
export interface Course { id: string; title: string; blurb: string; level: 'Beginner' | 'Intermediate' | 'Advanced'; lessons: Lesson[]; track?: 'masterclass' | 'topics'; module?: number }

const TOPIC_COURSES: Course[] = [
  {
    id: 'un', title: 'The UN, explained', level: 'Beginner', blurb: 'What the United Nations is, its six main organs and how decisions get made.',
    lessons: [
      { id: 'un-1', title: 'Why the UN exists', minutes: 4, body: [
        'The United Nations was founded in 1945, after the Second World War, by 51 states that signed the UN Charter in San Francisco. Today it has 193 member states, plus two observer states: the Holy See and the State of Palestine.',
        'The Charter sets out four purposes: to maintain international peace and security, to develop friendly relations among nations, to achieve cooperation on economic, social, cultural and humanitarian problems and human rights, and to be a centre for harmonising the actions of nations.',
        '- Article 2(1): sovereign equality of all members.\n- Article 2(4): members must refrain from the threat or use of force against another state.\n- Article 2(7): the UN may not intervene in matters essentially within a state’s domestic jurisdiction (except for Chapter VII enforcement).',
        'MUN tip: quoting the Charter’s article numbers correctly is one of the fastest ways to sound credible in a GSL speech.',
      ], quiz: [
        { q: 'How many member states does the UN have?', options: ['191', '193', '195', '197'], answer: 1, why: '193 members; the Holy See and Palestine are non-member observer states.' },
        { q: 'Which Charter article prohibits the threat or use of force?', options: ['Article 1(1)', 'Article 2(4)', 'Article 51', 'Article 27'], answer: 1, why: 'Article 2(4). Article 51 is the exception for self-defence.' },
      ] },
      { id: 'un-2', title: 'The six main organs', minutes: 5, body: [
        'The Charter created six principal organs:',
        '- General Assembly: all 193 members, one vote each. Debates everything, adopts recommendations and the budget.\n- Security Council: 15 members (5 permanent, 10 elected for two years). Primary responsibility for peace and security; its decisions can be binding.\n- Economic and Social Council (ECOSOC): 54 members; coordinates economic, social and environmental work.\n- International Court of Justice: 15 judges in The Hague; settles disputes between states and gives advisory opinions.\n- Secretariat: the staff, led by the Secretary-General.\n- Trusteeship Council: suspended since 1994, when Palau, the last trust territory, became independent.',
        'Around them sit programmes and funds (UNDP, UNICEF, UNHCR, WFP) and specialised agencies with their own membership (WHO, ILO, UNESCO, IMF, World Bank).',
      ], quiz: [
        { q: 'Which organ has not met regularly since 1994?', options: ['ECOSOC', 'The Trusteeship Council', 'The Secretariat', 'The ICJ'], answer: 1, why: 'Its work ended when Palau became independent.' },
        { q: 'How many judges sit on the ICJ?', options: ['9', '12', '15', '21'], answer: 2, why: 'Fifteen judges elected for nine-year terms by the GA and Security Council.' },
      ] },
      { id: 'un-3', title: 'Binding and non-binding', minutes: 4, body: [
        'A common MUN mistake is to write a General Assembly resolution that "demands" or "sanctions". GA resolutions are recommendations: politically weighty, but not legally binding (except on internal matters such as the budget and membership admissions on the Council’s recommendation).',
        'Security Council decisions under Chapter VII ("Action with respect to threats to the peace") are binding on all members under Article 25. Only the Council can authorise force (Article 42) or impose sanctions (Article 41).',
        'Language follows power: in a GA draft prefer "Calls upon", "Encourages", "Recommends". In a Council draft acting under Chapter VII you can write "Decides" and "Demands".',
      ], quiz: [
        { q: 'Which article makes Security Council decisions binding on members?', options: ['Article 10', 'Article 25', 'Article 39', 'Article 99'], answer: 1, why: 'Article 25: members agree to accept and carry out the Council’s decisions.' },
        { q: 'Which verb suits a General Assembly operative clause best?', options: ['Decides to impose sanctions', 'Demands', 'Recommends', 'Authorizes the use of force'], answer: 2, why: 'The GA recommends; sanctions and force are for the Council.' },
      ] },
    ],
  },
  {
    id: 'unsc', title: 'The Security Council and the veto', level: 'Intermediate', blurb: 'Membership, voting rules, the P5 veto and how the Council actually works.',
    lessons: [
      { id: 'unsc-1', title: 'Who sits on the Council', minutes: 4, body: [
        'Five permanent members (P5): China, France, the Russian Federation, the United Kingdom and the United States. Ten elected members (E10) serve two-year terms, five elected each year by the General Assembly with a two-thirds majority, split by region: three African, two Asia-Pacific, one Eastern European, two Latin American and Caribbean, two Western European and Others (an Arab seat alternates between Africa and Asia).',
        'For 2026 the elected members are Denmark, Greece, Pakistan, Panama and Somalia (2025–26) and Bahrain, Colombia, the Democratic Republic of the Congo, Latvia and Liberia (2026–27).',
        'The presidency rotates monthly in English alphabetical order.',
      ], quiz: [
        { q: 'How long is an elected member’s term?', options: ['One year', 'Two years', 'Three years', 'Five years'], answer: 1, why: 'Two years, with no immediate re-election.' },
        { q: 'Who elects the non-permanent members?', options: ['The P5', 'The Secretary-General', 'The General Assembly', 'ECOSOC'], answer: 2, why: 'The General Assembly, by a two-thirds majority.' },
      ] },
      { id: 'unsc-2', title: 'Voting and the veto', minutes: 5, body: [
        'Article 27: each member has one vote. Procedural matters pass with nine affirmative votes. Substantive matters need nine affirmative votes including the "concurring votes" of the permanent members, which is the veto.',
        'By long practice, a permanent member’s abstention is not a veto. Only a "no" vote from one of the P5 blocks a substantive draft.',
        'Since 2022 the General Assembly meets automatically within ten working days of a veto to debate it (A/RES/76/262), the "veto initiative".',
        'MUN tip: in a Security Council simulation, the most important lobbying is often with the one P5 member most likely to veto.',
      ], quiz: [
        { q: 'A substantive draft gets 13 votes in favour, one P5 member votes against, one abstains. Does it pass?', options: ['Yes', 'No'], answer: 1, why: 'A single P5 vote against is a veto, whatever the count.' },
        { q: 'Does a P5 abstention count as a veto?', options: ['Yes', 'No'], answer: 1, why: 'By established practice since the 1940s, abstention is not a veto.' },
      ] },
      { id: 'unsc-3', title: 'Chapters VI and VII', minutes: 4, body: [
        'Chapter VI (Articles 33–38) covers peaceful settlement: negotiation, mediation, arbitration and judicial settlement. Council recommendations here are not binding.',
        'Chapter VII (Articles 39–51) lets the Council determine a threat to the peace (Article 39), call for provisional measures (40), impose non-military measures such as sanctions and embargoes (41), and authorise military action (42). Article 51 preserves the right of self-defence until the Council acts.',
        'Peacekeeping is not named in the Charter; it is sometimes called "Chapter six and a half".',
      ], quiz: [
        { q: 'Which article covers sanctions?', options: ['Article 33', 'Article 41', 'Article 42', 'Article 51'], answer: 1, why: 'Article 41: measures not involving the use of armed force.' },
        { q: 'Where does the right of self-defence appear?', options: ['Article 2(4)', 'Article 39', 'Article 51', 'Article 99'], answer: 2, why: 'Article 51.' },
      ] },
    ],
  },
  {
    id: 'ga', title: 'The General Assembly and its committees', level: 'Beginner', blurb: 'The six Main Committees and what each one discusses.',
    lessons: [
      { id: 'ga-1', title: 'The six Main Committees', minutes: 4, body: [
        '- First Committee (DISEC): disarmament and international security.\n- Second (ECOFIN): economic and financial questions, development.\n- Third (SOCHUM): social, humanitarian and cultural issues, human rights.\n- Fourth (SPECPOL): special political questions and decolonisation, peacekeeping review.\n- Fifth: administrative and budgetary matters.\n- Sixth (Legal): international law.',
        'Every member state sits on every Main Committee. They adopt drafts that go to the plenary for final adoption.',
      ], quiz: [
        { q: 'Which committee handles human rights?', options: ['First', 'Third', 'Fourth', 'Sixth'], answer: 1, why: 'The Third Committee (SOCHUM).' },
        { q: 'What does the Fifth Committee handle?', options: ['Decolonisation', 'Budget and administration', 'Legal questions', 'Disarmament'], answer: 1, why: 'Administrative and budgetary matters.' },
      ] },
      { id: 'ga-2', title: 'How the GA votes', minutes: 3, body: [
        'Important questions (peace and security recommendations, elections to the Councils, admission of members, budget) need a two-thirds majority of members present and voting (Article 18). Other questions need a simple majority.',
        '"Present and voting" means voting yes or no; abstentions are not counted.',
        'Many GA resolutions are adopted by consensus, without a vote. A delegation can still "dissociate" from a paragraph in an explanation of position.',
      ], quiz: [
        { q: 'Are abstentions counted when calculating a two-thirds majority?', options: ['Yes', 'No'], answer: 1, why: 'Only members present and voting (yes or no) are counted.' },
      ] },
      { id: 'ga-3', title: 'Regional groups', minutes: 3, body: [
        'Seats and offices are shared out among five regional groups: the African Group (54), the Asia-Pacific Group (53), the Eastern European Group (23), the Latin American and Caribbean Group (33) and the Western European and Others Group (28 plus the United States for elections). Kiribati belongs to none.',
        'Groups are electoral, not political blocs. Political blocs such as the G77, the Non-Aligned Movement, the EU or the Arab Group often coordinate positions and speak for their members.',
      ], quiz: [
        { q: 'Which is the largest regional group?', options: ['Asia-Pacific', 'African Group', 'GRULAC', 'WEOG'], answer: 1, why: 'The African Group has 54 members.' },
      ] },
    ],
  },
  {
    id: 'rop', title: 'Rules of procedure', level: 'Beginner', blurb: 'Roll call, the speakers list, caucuses and voting procedure, start to finish.',
    lessons: [
      { id: 'rop-1', title: 'The flow of a session', minutes: 5, body: [
        '1. Roll call: each delegation answers "present" or "present and voting". Present-and-voting delegations cannot abstain on substantive votes.\n2. Setting the agenda (when there are two topics).\n3. Opening the General Speakers List (GSL).\n4. Moderated and unmoderated caucuses on sub-topics.\n5. Working papers, then draft resolutions with sponsors and signatories.\n6. Amendments.\n7. Closing debate and voting procedure.',
        'Quorum: usually a third of members to debate and a majority to vote on substance. Check your conference’s own rules.',
      ], quiz: [
        { q: 'A delegation that answered "present and voting" can…', options: ['Abstain on substantive votes', 'Not abstain on substantive votes', 'Not vote', 'Only vote on procedure'], answer: 1, why: 'They give up the option to abstain on substance.' },
      ] },
      { id: 'rop-2', title: 'Caucuses', minutes: 4, body: [
        'A moderated caucus focuses debate on one sub-topic. The motion gives the total time, the speaking time and the topic: "Motion for a 10-minute moderated caucus, 45 seconds per speaker, on financing peacekeeping." The chair recognises speakers one by one.',
        'An unmoderated caucus suspends formal debate so delegates can lobby and write: "Motion for a 15-minute unmoderated caucus."',
        'Chairs vote motions from most to least disruptive: usually the longest unmoderated caucus first, then the longest moderated caucus.',
      ], quiz: [
        { q: 'What three things does a moderated caucus motion state?', options: ['Sponsor, topic, vote', 'Total time, speaking time, topic', 'Speakers, yields, time', 'Topic, bloc, amendment'], answer: 1, why: 'Total time, speaking time per speaker and the topic.' },
      ] },
      { id: 'rop-3', title: 'Yields and points', minutes: 4, body: [
        'After a GSL speech with time left, a speaker may yield: to the chair (time is lost), to another delegate, or to points of information (questions).',
        'Points: personal privilege (comfort, audibility; can interrupt), order (procedure was broken), parliamentary inquiry (a question about procedure), information (a question to a speaker), right of reply (to an insult).',
        'Never raise a point of order about the content of a speech; that is what points of information and your own speech are for.',
      ], quiz: [
        { q: 'Which point can interrupt a speaker?', options: ['Point of order', 'Point of personal privilege (for audibility)', 'Point of information', 'Point of inquiry'], answer: 1, why: 'Personal privilege, when you cannot hear.' },
      ] },
    ],
  },
  {
    id: 'speech', title: 'Speeches that land', level: 'Beginner', blurb: 'GSL, moderated caucus and closing speeches with a clear structure.',
    lessons: [
      { id: 'speech-1', title: 'The 90-second GSL', minutes: 4, body: [
        'At about 130 words a minute, 90 seconds is roughly 195 words. A strong structure:',
        '- Hook (15%): a fact, a short story or a striking statistic.\n- Position (35%): what your country believes and why, with one piece of evidence.\n- Solution (35%): what you want the committee to do.\n- Close (15%): an invitation to work together, or a yield.',
        'Write for the ear: short sentences, one idea each. Mention your country by name at least twice so the room remembers who spoke.',
      ], quiz: [
        { q: 'Roughly how many words fit in a 60-second speech?', options: ['60', '130', '250', '400'], answer: 1, why: 'At about 130 words a minute.' },
      ] },
      { id: 'speech-2', title: 'Moderated caucus speeches', minutes: 3, body: [
        'Mod speeches are short (30 to 60 seconds) and must stay on the caucus topic. Make one point, back it with one piece of evidence, and end with a concrete ask.',
        'Respond to what the previous speakers said. Referring to another delegation by name ("Building on Denmark’s proposal…") shows the EB you are listening and builds blocs.',
      ], quiz: [
        { q: 'How many main points should a 45-second mod speech have?', options: ['One', 'Three', 'Five', 'As many as possible'], answer: 0, why: 'One clear point, well supported.' },
      ] },
      { id: 'speech-3', title: 'Delivery', minutes: 3, body: [
        'Look up from your notes at the start and end of every sentence. Pause before your key line. Speak slightly slower than feels natural.',
        'Practise with a timer. Cut, don’t rush: a speech that ends early is better than one cut off by the gavel.',
      ], quiz: [
        { q: 'Your speech runs 15 seconds over. Best fix?', options: ['Speak faster', 'Cut a sentence or two', 'Ask for more time', 'Skip the conclusion'], answer: 1, why: 'Cut content rather than rushing.' },
      ] },
    ],
  },
  {
    id: 'paper', title: 'Position papers', level: 'Beginner', blurb: 'What chairs look for, section by section.',
    lessons: [
      { id: 'paper-1', title: 'The four sections', minutes: 4, body: [
        '- Background: the issue in your own words, with the key facts.\n- Past international action: relevant resolutions (by symbol), treaties and UN bodies.\n- Country policy: your government’s actual position, with official statements and votes.\n- Solutions: realistic proposals your country would support, linked to precedent.',
        'Most conferences set one or two pages. Write in the third person or as the delegation ("The Republic of India believes…").',
      ], quiz: [
        { q: 'Which is NOT one of the usual four sections?', options: ['Background', 'Past international action', 'Personal opinion', 'Proposed solutions'], answer: 2, why: 'A position paper states your country’s position, not your own.' },
      ] },
      { id: 'paper-2', title: 'Evidence and citations', minutes: 4, body: [
        'Every claim a chair could question needs a source: a UN document, a government statement, a treaty, a reputable dataset.',
        'Be specific: "S/RES/2231 (2015) endorsed the JCPOA" is stronger than "the UN supported the deal". Avoid overstated claims such as "always", "never" or "the whole world".',
        'Footnotes or numbered references are both fine; be consistent.',
      ], quiz: [
        { q: 'Which is the strongest claim?', options: ['The UN always fails', 'Many countries support this', 'A/RES/ES-11/1 was adopted with 141 votes in favour', 'Everyone agrees'], answer: 2, why: 'Specific and verifiable.' },
      ] },
      { id: 'paper-3', title: 'Solutions chairs reward', minutes: 3, body: [
        'Good solutions are feasible (who pays? who implements?), consistent with your country’s policy, and build on existing mechanisms rather than inventing everything new.',
        'Name the body that would act, the funding source and a measurable outcome.',
      ], quiz: [
        { q: 'What makes a solution feasible?', options: ['It is ambitious', 'It names who acts, how it is funded and how success is measured', 'It is long', 'It condemns others'], answer: 1, why: 'Implementation details are what chairs look for.' },
      ] },
    ],
  },
  {
    id: 'research', title: 'Research like a diplomat', level: 'Intermediate', blurb: 'Finding primary sources, voting records and your country’s real position.',
    lessons: [
      { id: 'research-1', title: 'Primary sources first', minutes: 4, body: [
        'Start from what your government has actually said: the foreign ministry website, statements at the UN (press.un.org records every meeting), and the country’s permanent mission to the UN.',
        'The UN Digital Library (digitallibrary.un.org) holds resolutions and voting records. undocs.org opens any document symbol.',
        'Secondary sources (news, think tanks) are useful for context, but check them against the primary record.',
      ], quiz: [
        { q: 'Where can you find how countries voted on a GA resolution?', options: ['Social media', 'The UN Digital Library', 'A dictionary', 'Wikipedia only'], answer: 1, why: 'The Digital Library has voting records.' },
      ] },
      { id: 'research-2', title: 'Reading a voting record', minutes: 4, body: [
        'A country’s votes reveal more than its speeches. Look at how it voted on similar resolutions in the last five years, and whether it co-sponsored them.',
        'Patterns matter: a country that abstains consistently may be persuadable; one that votes against with a bloc is not.',
      ], quiz: [
        { q: 'A country abstained on the last three similar resolutions. It is probably…', options: ['A sure supporter', 'A sure opponent', 'Persuadable', 'Absent'], answer: 2, why: 'Abstention often signals room to negotiate.' },
      ] },
      { id: 'research-3', title: 'Checking AI answers', minutes: 3, body: [
        'AI research tools are fast, but open the cited source for anything you will say aloud. Check the date: positions change.',
        'If a document number or quotation cannot be found at its source, do not use it.',
      ], quiz: [
        { q: 'An AI answer quotes a resolution number you cannot find. You should…', options: ['Use it anyway', 'Leave it out', 'Change the number', 'Cite the AI'], answer: 1, why: 'Never use what you cannot verify.' },
      ] },
    ],
  },
  {
    id: 'reso', title: 'Writing resolutions', level: 'Intermediate', blurb: 'Preambulatory and operative clauses, sponsors and formatting.',
    lessons: [
      { id: 'reso-1', title: 'Structure', minutes: 4, body: [
        'A resolution has a heading (committee, topic, sponsors, signatories), preambulatory clauses and operative clauses.',
        'Preambulatory clauses give context. They begin with an italicised participle ("Recalling", "Deeply concerned") and end with a comma.',
        'Operative clauses say what the body will do. They are numbered, begin with an underlined verb in the present tense ("Calls upon", "Requests"), end with a semicolon, and the last ends with a full stop. Sub-clauses are lettered a), b), c).',
      ], quiz: [
        { q: 'How does a preambulatory clause end?', options: ['Semicolon', 'Comma', 'Full stop', 'Colon'], answer: 1, why: 'Preambulatory clauses end with a comma.' },
        { q: 'Which is an operative phrase?', options: ['Recalling', 'Deeply concerned', 'Calls upon', 'Bearing in mind'], answer: 2, why: '"Calls upon" is operative; the others are preambulatory.' },
      ] },
      { id: 'reso-2', title: 'Sponsors and signatories', minutes: 3, body: [
        'Sponsors wrote the draft and support it. Signatories want it debated but need not support it. Conferences set minimum numbers.',
        'A friendly amendment is one all sponsors accept; it goes in without a vote. An unfriendly amendment is voted on.',
      ], quiz: [
        { q: 'A friendly amendment is…', options: ['Voted on', 'Accepted by all sponsors and added without a vote', 'Always rejected', 'Proposed by the chair'], answer: 1, why: 'Friendly means the sponsors agree.' },
      ] },
      { id: 'reso-3', title: 'Clauses that work', minutes: 3, body: [
        'A strong operative clause says who acts, what they do, with what resources and by when: "Requests the Secretary-General to report to the Council within 90 days on…".',
        'Match verbs to the body’s powers (see "Binding and non-binding").',
      ], quiz: [
        { q: 'Which clause is strongest?', options: ['Urges peace', 'Requests the Secretary-General to report within 90 days on implementation', 'Hopes things improve', 'Condemns everything'], answer: 1, why: 'Specific actor, action and deadline.' },
      ] },
    ],
  },
  {
    id: 'lobby', title: 'Caucusing and lobbying', level: 'Intermediate', blurb: 'Building blocs, merging papers and leading without dominating.',
    lessons: [
      { id: 'lobby-1', title: 'Finding your bloc', minutes: 4, body: [
        'Before committee, list the five delegations most likely to agree with you and the five most likely to oppose. Use regional groups, existing blocs and voting records.',
        'In the first unmoderated caucus, approach your likely allies with a one-line pitch and a specific idea.',
      ], quiz: [
        { q: 'Best first move in the first unmod?', options: ['Write alone', 'Approach likely allies with a concrete idea', 'Attack opponents', 'Wait to be invited'], answer: 1, why: 'Concrete ideas attract co-authors.' },
      ] },
      { id: 'lobby-2', title: 'Leading a group', minutes: 3, body: [
        'Leadership is visible in what others say about you. Give quieter delegates clauses to write and credit them. Keep the shared document tidy.',
        'EBs reward delegates who bring others in, not those who hold the laptop.',
      ], quiz: [
        { q: 'What do EBs usually reward in lobbying?', options: ['Holding the laptop', 'Bringing others in and building consensus', 'Talking the most', 'Refusing to merge'], answer: 1, why: 'Diplomacy is about building agreement.' },
      ] },
      { id: 'lobby-3', title: 'Merging papers', minutes: 3, body: [
        'When two groups have similar papers, merge early: compare operative clauses, keep the stronger version of each, and agree on main submitters.',
        'Concede wording, not substance.',
      ], quiz: [
        { q: 'When merging, you should concede…', options: ['Your core policy', 'Wording', 'Everything', 'Nothing'], answer: 1, why: 'Flexible on words, firm on substance.' },
      ] },
    ],
  },
  {
    id: 'negotiation', title: 'Negotiation', level: 'Advanced', blurb: 'Interests, red lines and the language of compromise.',
    lessons: [
      { id: 'negotiation-1', title: 'Interests, not positions', minutes: 4, body: [
        'A position is what a delegation says it wants; an interest is why it wants it. Ask "what would you need to support this?"',
        'Before negotiating, write down your red lines (cannot accept), your goals (want) and your trade-offs (can give).',
      ], quiz: [
        { q: 'An interest is…', options: ['What a delegation says it wants', 'Why it wants it', 'Its vote', 'Its bloc'], answer: 1, why: 'Interests explain positions.' },
      ] },
      { id: 'negotiation-2', title: 'Constructive ambiguity', minutes: 3, body: [
        'Diplomats often agree on wording that each side can read its own way: "as appropriate", "in accordance with national legislation", "taking into account national circumstances".',
        'Use it to bridge gaps, but not on the core of your proposal.',
      ], quiz: [
        { q: '"In accordance with national legislation" is often added to…', options: ['Make a clause binding', 'Reassure sovereignty-minded states', 'Condemn a state', 'Close debate'], answer: 1, why: 'It respects domestic law and sovereignty.' },
      ] },
      { id: 'negotiation-3', title: 'Saying no', minutes: 3, body: [
        'Refuse the proposal, not the person: "We cannot support mandatory quotas, but we could support voluntary targets with reporting." Always pair a no with an alternative.',
      ], quiz: [
        { q: 'Best way to refuse a clause?', options: ['Ignore it', 'Say no and offer an alternative', 'Insult the author', 'Walk out'], answer: 1, why: 'Keeps the negotiation going.' },
      ] },
    ],
  },
  {
    id: 'law', title: 'International law basics', level: 'Intermediate', blurb: 'Treaties, custom, the ICJ and the principles delegates cite most.',
    lessons: [
      { id: 'law-1', title: 'Sources of international law', minutes: 4, body: [
        'Article 38 of the ICJ Statute lists them: treaties, customary international law (general practice accepted as law), general principles of law, and, as subsidiary means, judicial decisions and the teachings of scholars.',
        'Treaties bind only parties that have ratified them (Vienna Convention on the Law of Treaties, 1969). Custom binds all states, except persistent objectors.',
      ], quiz: [
        { q: 'Does a treaty bind a state that has signed but not ratified it?', options: ['Yes, fully', 'No, though it should not defeat the treaty’s object and purpose', 'Only in wartime', 'Only if the UN says so'], answer: 1, why: 'Article 18 VCLT: a signatory must not defeat the object and purpose.' },
      ] },
      { id: 'law-2', title: 'Principles delegates cite', minutes: 4, body: [
        '- Sovereignty and non-intervention (Charter art. 2(1), 2(7)).\n- Prohibition of the use of force (2(4)) and self-defence (51).\n- Pacific settlement of disputes (2(3), 33).\n- Self-determination of peoples (1(2)).\n- Responsibility to Protect (2005 World Summit Outcome, paras 138–139): a political commitment, not a treaty.',
      ], quiz: [
        { q: 'R2P was endorsed in…', options: ['The 1945 Charter', 'The 2005 World Summit Outcome', 'The Geneva Conventions', 'A 2015 treaty'], answer: 1, why: 'Paragraphs 138–139 of the 2005 Outcome document.' },
      ] },
      { id: 'law-3', title: 'Courts', minutes: 3, body: [
        'The ICJ settles disputes between states that accept its jurisdiction and gives advisory opinions to UN bodies. The International Criminal Court (Rome Statute, 1998) tries individuals for genocide, crimes against humanity, war crimes and aggression; it is not a UN organ.',
      ], quiz: [
        { q: 'Which court tries individuals?', options: ['ICJ', 'ICC', 'Both', 'Neither'], answer: 1, why: 'The ICC tries individuals; the ICJ hears states.' },
      ] },
    ],
  },
  {
    id: 'rights', title: 'The human rights system', level: 'Intermediate', blurb: 'The UDHR, the treaties and the Human Rights Council.',
    lessons: [
      { id: 'rights-1', title: 'The International Bill of Human Rights', minutes: 4, body: [
        'The Universal Declaration of Human Rights (1948) plus the two Covenants of 1966: civil and political rights (ICCPR) and economic, social and cultural rights (ICESCR).',
        'Further core treaties cover racial discrimination (CERD), women (CEDAW), torture (CAT), children (CRC), migrant workers, disability (CRPD) and enforced disappearance. Each has a committee of experts that reviews state reports.',
      ], quiz: [
        { q: 'The UDHR was adopted in…', options: ['1945', '1948', '1966', '1993'], answer: 1, why: '10 December 1948, now Human Rights Day.' },
      ] },
      { id: 'rights-2', title: 'The Human Rights Council', minutes: 3, body: [
        'Created in 2006 (A/RES/60/251), replacing the Commission on Human Rights. 47 members elected by the GA. It runs the Universal Periodic Review of every member state and appoints special rapporteurs.',
      ], quiz: [
        { q: 'How many members does the HRC have?', options: ['15', '47', '54', '193'], answer: 1, why: '47, elected for three-year terms.' },
      ] },
      { id: 'rights-3', title: 'Arguing rights in committee', minutes: 3, body: [
        'Name the right and the instrument ("the right to education under article 13 of the ICESCR"). Acknowledge cultural and sovereignty concerns while holding to universal standards; that is where most Third Committee and HRC compromises are found.',
      ], quiz: [
        { q: 'Which covenant covers the right to education?', options: ['ICCPR', 'ICESCR', 'CAT', 'VCLT'], answer: 1, why: 'Article 13 ICESCR.' },
      ] },
    ],
  },
  {
    id: 'crisis', title: 'Crisis committees', level: 'Advanced', blurb: 'Portfolio powers, directives and thinking three moves ahead.',
    lessons: [
      { id: 'crisis-1', title: 'How crisis works', minutes: 4, body: [
        'In a crisis committee each delegate holds a portfolio (a minister, general or official) with specific powers. The crisis staff send updates; delegates respond with directives (committee actions) and personal or crisis notes (private actions).',
        'Time can move faster than real time; updates react to what delegates do.',
      ], quiz: [
        { q: 'A private action using your own portfolio’s powers is usually a…', options: ['Joint directive', 'Crisis note', 'Resolution', 'Point of order'], answer: 1, why: 'Crisis or personal notes go to the crisis staff.' },
      ] },
      { id: 'crisis-2', title: 'Writing directives', minutes: 4, body: [
        'A good directive is specific (who, what, where, when, with what resources), within your powers, and anticipates consequences. "Deploy two naval patrol vessels from Mumbai to escort commercial shipping through the Strait for 14 days, under existing rules of engagement" beats "Protect shipping".',
      ], quiz: [
        { q: 'What makes a directive strong?', options: ['Ambition', 'Specific resources, scope and time within your powers', 'Length', 'Secrecy'], answer: 1, why: 'Crisis staff can act on specifics.' },
      ] },
      { id: 'crisis-3', title: 'Arcs', minutes: 3, body: [
        'Plan a personal arc: a goal for your character that you advance across sessions with small, believable notes. Build resources first (allies, money, information), then use them.',
      ], quiz: [
        { q: 'Early in a crisis arc you should…', options: ['Spend everything', 'Build resources and relationships', 'Do nothing', 'Reveal your plan'], answer: 1, why: 'Resources make later moves credible.' },
      ] },
    ],
  },
  {
    id: 'chair', title: 'Chairing and marking', level: 'Advanced', blurb: 'Running a fair room and marking speeches, POIs and chits like an EB.',
    lessons: [
      { id: 'chair-1', title: 'Running the room', minutes: 4, body: [
        'Be predictable: announce the rule before applying it, recognise fairly (track who has spoken; DelegateDesk’s recognition view lists the least-recognised first), and keep time strictly.',
        'Vote motions from most to least disruptive. Rule on points quickly and politely.',
      ], quiz: [
        { q: 'Which motion is usually voted first?', options: ['Shortest moderated caucus', 'Most disruptive (often the longest unmoderated caucus)', 'Any order', 'The first one raised'], answer: 1, why: 'Most disruptive first.' },
      ] },
      { id: 'chair-2', title: 'Marking schemes', minutes: 4, body: [
        'A common EB scheme: Verbatim (every GSL and mod speech plus verbal POIs) weighted 80%, chits (substantive and POI) 20%, plus marks for lobbying and documentation.',
        'Mark each speech on content, relevance to the caucus topic, evidence, diplomacy and delivery. Keep verbatim notes so you can justify marks.',
        'Award order typically: Best Delegate, High Commendation, Special Mention, Verbal Mentions.',
      ], quiz: [
        { q: 'In a Verbatim 80 / Chits 20 scheme, a delegate has 20 verbatim points and 10 chit points. Their weighted total is…', options: ['30', '18', '24', '16'], answer: 1, why: '20 × 0.8 + 10 × 0.2 = 16 + 2 = 18.' },
      ] },
      { id: 'chair-3', title: 'Fair feedback', minutes: 3, body: [
        'Give each delegate one strength and one thing to improve, tied to specific moments from your verbatim notes. Delegates learn more from "your second mod speech had no evidence" than from a number.',
      ], quiz: [
        { q: 'Good EB feedback is…', options: ['Just the rank', 'Specific, tied to moments, one strength and one improvement', 'Long and general', 'Given only to winners'], answer: 1, why: 'Specific and actionable.' },
      ] },
    ],
  },
];

export const COURSES: Course[] = [...MASTERCLASS, ...TOPIC_COURSES.map((c) => ({ ...c, track: 'topics' as const }))];
export const MASTERCLASS_LESSONS = MASTERCLASS.flatMap((c) => c.lessons);

export const ALL_LESSONS = COURSES.flatMap((c) => c.lessons.map((l) => ({ ...l, course: c.id, courseTitle: c.title })));
export const QUIZ_POOL = ALL_LESSONS.flatMap((l) => l.quiz.map((q, i) => ({ ...q, id: `${l.id}-q${i}`, lesson: l.title })));
/** Today's challenge: the same question for everyone on a given day. */
export function dailyChallenge(day = new Date().toISOString().slice(0, 10)) {
  let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { day, ...QUIZ_POOL[h % QUIZ_POOL.length] };
}

/** The final assessment: 25 questions, at least one from every Masterclass module, the rest from everywhere. Seeded so a retake shuffles. */
export function finalExam(seed = Date.now(), size = 25) {
  let x = seed >>> 0 || 1;
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const pool = QUIZ_POOL.filter((q) => q.options.length > 1);
  const picked = new Map<string, (typeof pool)[number]>();
  for (const m of MASTERCLASS) { const qs = shuffle(pool.filter((q) => m.lessons.some((l) => q.id.startsWith(`${l.id}-q`)))); if (qs[0]) picked.set(qs[0].id, qs[0]); }
  for (const q of shuffle(pool)) { if (picked.size >= size) break; picked.set(q.id, q); }
  return shuffle([...picked.values()]);
}
export const PASS_MARK = 70;
