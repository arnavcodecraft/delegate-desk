/**
 * The DelegateDesk MUN Masterclass: a complete, ordered programme from "what is MUN" to winning Best Delegate.
 * Follows the structure of a standard Indian-circuit MUN workshop (EB, roll call, motions, GSL, yields, points,
 * caucuses, POI chits, right to reply, chits, lobbying, documentation, Indian committees, tips) and goes deeper:
 * exact scripts, common mistakes, drills and a quiz on every lesson.
 */
import type { Course } from './learn';

export const MASTERCLASS: Course[] = [
  // ───────────────────────── Module 1 ─────────────────────────
  {
    id: 'm1', module: 1, track: 'masterclass', title: 'Foundations: MUN, the UN and the room', level: 'Beginner',
    blurb: 'What Model United Nations is, what the real UN does, who sits on the dais and how a conference day runs.',
    lessons: [
      { id: 'm1-1', title: 'What Model United Nations is', minutes: 6, body: [
        'Model United Nations (MUN) is a simulation of how the United Nations, and other decision-making bodies, debate and decide. You are given a **portfolio** (usually a country, sometimes a person such as a minister or an MP) and a **committee** with one or two **agendas**. For two or three days you speak, negotiate and write documents *as that portfolio*, not as yourself.',
        'Every delegate plays **two roles at once**:',
        '1. **Foreign policy objectives.** You defend your country’s real interests, red lines and past voting record. A delegate of Pakistan who argues India’s position on Kashmir has failed the first role, however eloquent the speech.\n2. **Common global agendas.** You still work with others towards shared outcomes, such as human rights, refugees and the environment. The UN exists because no country can solve these alone.',
        'The best delegates hold both roles in tension: firm on national interest, flexible on the route to a shared solution. That is exactly what real diplomats do.',
        'What MUN builds: research, public speaking, negotiation, writing, and the ability to think under time pressure. Universities and employers recognise it for that reason.',
      ], key: [
        'You represent your portfolio’s views, not your own.',
        'Dual role: national foreign-policy objectives plus common global agendas.',
        'A conference = committees × agendas × delegates, judged by an Executive Board.',
      ], avoid: [
        'Giving your personal opinion ("I feel that…"). Say "The delegation of Brazil believes…".',
        'Arguing against your country’s known position because it sounds more moral.',
      ], drill: 'Pick any country. In three lines write: one national interest it will never trade away, and one global goal it actively supports. That pairing is the heart of every speech you will give for it.', quiz: [
        { q: 'In MUN, whose views do you present?', options: ['Your own', 'Your portfolio’s', 'Your school’s', 'The Chair’s'], answer: 1, why: 'You speak as your portfolio (a country or a person), never as yourself.' },
        { q: 'What are the two roles every delegate plays?', options: ['Speaker and writer', 'Foreign policy objectives and common global agendas', 'Chair and delegate', 'Prosecutor and defence'], answer: 1, why: 'Defend national interests while working towards shared global goals.' },
        { q: 'Which phrase is correct in a speech?', options: ['"I personally think…"', '"The delegate of Japan believes…"', '"My opinion is…"', '"We the students feel…"'], answer: 1, why: 'Always speak in the third person for your delegation.' },
      ] },
      { id: 'm1-2', title: 'What the real UN is (the thing we replicate)', minutes: 7, body: [
        'The United Nations was created at the end of the Second World War. Delegates of 50 countries signed the **UN Charter** in San Francisco on **26 June 1945**; Poland signed shortly after, making 51 original members. The Charter came into force on **24 October 1945**, now celebrated as UN Day.',
        'Today there are **193 member states** and two non-member observer states (the Holy See and the State of Palestine). The headquarters is in New York, with major offices in Geneva, Vienna and Nairobi.',
        'The Charter’s purposes (Article 1): maintain international peace and security; develop friendly relations based on equal rights and self-determination; solve economic, social, cultural and humanitarian problems and promote human rights; and be a centre for harmonising the actions of nations.',
        'The six principal organs:\n- **General Assembly**: all 193 members, one vote each; recommendations, budget, elections.\n- **Security Council**: 15 members, 5 permanent with a veto; the only organ whose decisions bind all members (Article 25).\n- **ECOSOC**: 54 members; economic, social and environmental coordination.\n- **International Court of Justice**: 15 judges in The Hague.\n- **Secretariat**: led by the Secretary-General.\n- **Trusteeship Council**: suspended since 1994.',
        'Most MUN committees simulate a body inside this system: GA committees (DISEC, SOCHUM, SPECPOL, ECOFIN, Legal), the Security Council, the Human Rights Council, UNEP, WHO, UNHCR and so on. Knowing what your committee can *actually* do (recommend? bind? fund?) shapes every clause you write.',
      ], key: [
        'Charter signed 26 June 1945, in force 24 October 1945.',
        '193 members, 6 principal organs; only the Security Council can bind all members.',
        'Know your committee’s real mandate before you write solutions.',
      ], avoid: [
        'Writing "sanctions" or "deploys troops" in a GA committee; only the Security Council can do that.',
      ], quiz: [
        { q: 'When did the UN Charter come into force?', options: ['26 June 1945', '24 October 1945', '10 December 1948', '1 January 1946'], answer: 1, why: '24 October 1945, now UN Day. 26 June is the signing; 10 December 1948 is the UDHR.' },
        { q: 'Which organ’s decisions are binding on all members?', options: ['General Assembly', 'Security Council', 'ECOSOC', 'Human Rights Council'], answer: 1, why: 'Article 25 of the Charter.' },
        { q: 'How many member states does the UN have?', options: ['190', '193', '195', '200'], answer: 1, why: '193 members plus two observer states.' },
      ] },
      { id: 'm1-3', title: 'The Executive Board', minutes: 5, body: [
        'The **Executive Board (EB)**, also called the dais, presides over the committee. It usually has three roles:',
        '- **Chairperson / President**: runs the session, recognises speakers, rules on points and motions.\n- **Vice-Chairperson / Vice-President**: shares the chairing, keeps the speakers list, often marks chits.\n- **Rapporteur**: keeps the record (verbatim notes, attendance, votes) and checks documents.',
        'The EB does three jobs you must keep in mind:\n1. **Runs procedure.** Their ruling on procedure is final ("the Chair’s discretion").\n2. **Judges your debate.** Every speech, POI, chit, document and lobbying effort is marked.\n3. **Keeps order.** In case of disruptive behaviour by any participant, the Chair reserves the right to take any appropriate action, from a warning to removing a placard or a delegate.',
        'How to work with the EB: address them as "the Executive Board" or "the Honourable Chair", send clear chits, ask procedural questions through a Point of Parliamentary Inquiry, and never argue a ruling on the floor. If you think a ruling is wrong, send a polite chit or speak to them during a break.',
      ], key: ['Chair, Vice-Chair, Rapporteur.', 'The EB runs procedure, judges you and keeps order.', 'Discretion of the Chair is final on the floor.'],
      say: ['"Honourable Chair, fellow delegates…"', '"Thank you, Executive Board."'],
      avoid: ['Arguing with the Chair during session.', 'Ignoring the gavel or speaking beyond time.'], quiz: [
        { q: 'Who usually keeps the formal record of the session?', options: ['Chairperson', 'Rapporteur', 'Any delegate', 'Secretary-General'], answer: 1, why: 'The Rapporteur keeps verbatim, attendance and votes.' },
        { q: 'You disagree with a Chair’s ruling. Best action?', options: ['Argue loudly on the floor', 'Point of Order every minute', 'Send a polite chit or speak at the break', 'Walk out'], answer: 2, why: 'The ruling stands on the floor; raise it respectfully off the floor.' },
        { q: 'Which of these does the EB NOT do?', options: ['Mark chits', 'Rule on motions', 'Vote on resolutions', 'Maintain decorum'], answer: 2, why: 'Only delegates (member states) vote on substance.' },
      ] },
      { id: 'm1-4', title: 'A conference day, minute by minute', minutes: 5, body: [
        'A typical committee session runs in this order. Learn it once and nothing will surprise you.',
        '1. **Roll call**: attendance.\n2. **Setting the agenda** (if there are two agendas).\n3. **General Speakers’ List (GSL)**: opening speeches; formal debate.\n4. **Moderated caucuses** on subtopics, with **unmoderated caucuses** in between for lobbying.\n5. **Working papers** emerge from blocs, then become **draft resolutions** once they have sponsors and signatories.\n6. **Amendments**, then **closure of debate** and **voting procedure**.\n7. Awards at the closing ceremony.',
        'Between all of this, you will send **chits** (notes) to the EB and other delegates, and raise **points** when needed.',
        'What to bring: placard, a printed or offline copy of your research (the Charter, key resolutions, your country’s statements), a list of allies and opponents, pre-written GSL speeches, two or three draft clauses, pens and sticky notes.',
      ], key: ['Roll call → agenda → GSL → mods/unmods → papers → amendments → voting.'], drill: 'Write the seven stages of a session from memory, then check. Repeat until you can do it in 30 seconds.', quiz: [
        { q: 'What comes immediately after roll call when there are two agendas?', options: ['Voting', 'Setting the agenda', 'Unmoderated caucus', 'Awards'], answer: 1, why: 'The committee first decides which agenda to debate.' },
        { q: 'Where do working papers usually get written?', options: ['During roll call', 'In unmoderated caucuses', 'During voting', 'In the GSL'], answer: 1, why: 'Unmods are the time for blocs to draft together.' },
      ] },
    ],
  },
  // ───────────────────────── Module 2 ─────────────────────────
  {
    id: 'm2', module: 2, track: 'masterclass', title: 'Procedure I: roll call, voting and motions', level: 'Beginner',
    blurb: 'Present vs present and voting, procedural vs substantive votes, majorities, and how motions are classified.',
    lessons: [
      { id: 'm2-1', title: 'Roll call: present, or present and voting', minutes: 5, body: [
        'Every committee session starts with a **roll call**. The Chair reads the portfolios in alphabetical order and each delegate raises the placard and responds with one of two answers:',
        '- **"Present"**: you are here, and on substantive votes you keep the option to **abstain**.\n- **"Present and voting"**: you are here and you commit to vote **for or against** on every substantive vote. You give up the right to abstain.',
        'Why it matters: saying "present and voting" signals a confident, decided delegation, and some EBs appreciate it. But if your country would genuinely abstain on a likely draft (for example, a neutral state on a contested conflict resolution), say "present" so you are not forced into a vote your country would never cast.',
        'Roll call also sets the **quorum** and the **majority** thresholds for that session. If you arrive late, send a chit to the EB to be marked present.',
      ], say: ['"Present."', '"Present and voting."', 'Late: a chit to the EB, "The delegate of Kenya has arrived and is present and voting. Kindly update the roll call."'],
      avoid: ['Saying "present and voting" and then trying to abstain later. You can’t.', 'Missing roll call: you may lose attendance marks.'],
      quiz: [
        { q: 'You said "present and voting". On a draft resolution you may vote…', options: ['For, against or abstain', 'Only for or against', 'Only abstain', 'Not at all'], answer: 1, why: 'Present and voting gives up the right to abstain on substantive votes.' },
        { q: 'Your country usually abstains on this issue. At roll call you should say…', options: ['Present and voting', 'Present', 'Nothing', 'Absent'], answer: 1, why: 'Keep the abstention option with "present".' },
        { q: 'You arrive after roll call. What do you do?', options: ['Nothing', 'Interrupt the speaker', 'Send a chit to the EB', 'Raise a Point of Order'], answer: 2, why: 'A chit updates your attendance without disrupting the floor.' },
      ] },
      { id: 'm2-2', title: 'Procedural and substantive voting', minutes: 6, body: [
        'There are two kinds of vote, and the rules differ.',
        '**Procedural votes** decide *how* the committee works: opening the GSL, approving a caucus, setting the agenda, suspending the meeting, closing debate. **Everyone present must vote, for or against. No one can abstain on a procedural matter.** They usually pass by a **simple majority** (more than half of those present).',
        '**Substantive votes** decide *what* the committee says: draft resolutions, amendments, reports. You can vote **in favour, against, or abstain** (abstain only if you answered "present" at roll call). They usually need a **special majority**, most often two-thirds, in Indian-circuit rules; some conferences use a simple majority for GA committees. Check your conference’s rules of procedure.',
        'In the Security Council, substantive votes need **nine affirmative votes with no veto** from the P5. Procedural votes need nine votes and the veto does not apply.',
        'Worked example: 30 delegates present, a two-thirds majority needed. 30 × 2/3 = 20, so a draft needs **20** votes in favour.',
      ], key: ['Procedural: no abstentions, simple majority.', 'Substantive: abstentions allowed (if "present"), usually two-thirds.', 'UNSC: nine votes and no P5 veto for substance.'],
      quiz: [
        { q: 'Can you abstain on a motion for a moderated caucus?', options: ['Yes', 'No'], answer: 1, why: 'It is procedural: no abstentions.' },
        { q: 'Approving a draft resolution is a…', options: ['Procedural matter', 'Substantive matter'], answer: 1, why: 'Resolutions, amendments and reports are substantive.' },
        { q: '45 delegates present, two-thirds required. How many votes in favour are needed?', options: ['23', '30', '31', '45'], answer: 1, why: '45 × 2/3 = 30.' },
        { q: 'Which usually requires only a simple majority?', options: ['Adopting a resolution', 'Suspending the meeting', 'Passing an amendment', 'Adopting a report'], answer: 1, why: 'Suspending the meeting is procedural.' },
      ] },
      { id: 'm2-3', title: 'Motions: the map', minutes: 6, body: [
        'A **motion** is a formal proposal that the committee do something. Motions fall into two families:',
        '**Debate motions** decide the form of debate:\n- **Formal debate**: the General Speakers’ List (GSL).\n- **Informal debate**: the **moderated caucus** (mod) and the **unmoderated caucus** (unmod).\n- Formal debate never ends on its own: when a caucus finishes, the committee returns to the GSL.',
        '**Substantive motions** relate to documents: introducing (tabling) a working paper or draft resolution, moving into voting procedure, dividing the question, voting clause by clause.',
        'Other common motions: **to set the agenda**, **to suspend** the meeting (for breaks), **to adjourn** (end of the conference), **to extend** a caucus, **to close debate** (move to voting).',
        'How motions are taken: the Chair asks "Are there any points or motions on the floor?". Delegates raise placards, are recognised, and state their motion. If several motions are raised, the Chair votes them **from most disruptive to least disruptive**, usually unmods before mods, and the longest first. Once one passes, the rest fall.',
      ], key: ['Debate motions: GSL (formal), mod/unmod (informal).', 'Substantive motions: tabling and voting on documents.', 'Most disruptive motion is voted first; formal debate never ends.'],
      say: ['Every motion starts the same way: "With the prior permission of the Executive Board, the delegate of ___ would like to raise a motion to…"'],
      quiz: [
        { q: 'A moderated caucus is…', options: ['Formal debate', 'Informal debate', 'A substantive motion', 'A point'], answer: 1, why: 'Mods and unmods are informal debate.' },
        { q: 'When a caucus expires, the committee returns to…', options: ['Roll call', 'The GSL', 'Voting', 'Adjournment'], answer: 1, why: 'Formal debate (the GSL) never ends.' },
        { q: 'Two motions: a 10-minute mod and a 15-minute unmod. Which is voted first?', options: ['The mod', 'The unmod', 'Whichever was raised first', 'Both together'], answer: 1, why: 'The unmod is more disruptive.' },
        { q: 'A motion to introduce a draft resolution is a…', options: ['Debate motion', 'Substantive motion', 'Point of order', 'Yield'], answer: 1, why: 'Motions about documents are substantive.' },
      ] },
      { id: 'm2-4', title: 'Setting the agenda', minutes: 4, body: [
        'If the committee has two agendas, the first task is choosing one. A delegate moves "to set the agenda as Agenda A". Usually two delegates speak **for** and two **against** (often 60–90 seconds each), then the committee votes (procedural, simple majority).',
        'Strategy: prefer the agenda where your country has a strong record and many natural allies, and where you have done more research. If your country is an obvious target on one agenda (for example a major emitter on a climate agenda), you may still want it: it guarantees you speaking time and attention, but be prepared.',
      ], say: ['"With the prior permission of the Executive Board, the delegate of Indonesia would like to raise a motion to set the agenda as \'Maritime security in the Indo-Pacific\'."'],
      quiz: [
        { q: 'Setting the agenda is decided by…', options: ['The Chair alone', 'A procedural vote', 'A substantive two-thirds vote', 'The Secretary-General'], answer: 1, why: 'It is procedural: simple majority, no abstentions.' },
      ] },
    ],
  },
  // ───────────────────────── Module 3 ─────────────────────────
  {
    id: 'm3', module: 3, track: 'masterclass', title: 'The General Speakers’ List (formal debate)', level: 'Beginner',
    blurb: 'Opening the GSL, writing a 90-second speech that gets marked, and using leftover time well.',
    lessons: [
      { id: 'm3-1', title: 'Establishing the GSL', minutes: 4, body: [
        'The **General Speakers’ List** is the committee’s formal debate. It is opened by a motion, which also fixes the time per speaker (most often 90 seconds; sometimes 60 or 120).',
        'Once open, delegates who wish to speak raise placards and the Chair adds them to the list in order. You can usually add yourself again after you have spoken, by sending a chit to the EB.',
        'The GSL is where you deliver your **opening statement**: your country’s overall stance on the agenda. Speak early: the first speakers frame the debate and the EB remembers them.',
      ], say: ['"With the prior permission of the Executive Board, the delegate of ___ would like to raise a motion to establish the General Speakers’ List with per speaker time being 90 seconds."', 'Chit to be added again: "The delegate of Chile requests to be added to the GSL."'],
      quiz: [
        { q: 'What is the most common GSL speaker time?', options: ['30 seconds', '90 seconds', '5 minutes', '10 minutes'], answer: 1, why: '90 seconds is the usual default.' },
        { q: 'What is the GSL?', options: ['Informal debate', 'Formal debate', 'A voting method', 'A document'], answer: 1, why: 'The GSL is formal debate.' },
      ] },
      { id: 'm3-2', title: 'The 90-second speech, line by line', minutes: 8, body: [
        'A strong GSL speech has five parts. Time them:',
        '1. **Hook (10 s)**: a striking fact, a short quote or a question. "Every two seconds, someone is forcibly displaced."\n2. **Stance (20 s)**: your country’s position in one clear sentence, anchored in something real (a statement, a vote, a policy).\n3. **Evidence (25 s)**: one or two facts with a source: a UN report, a resolution number, official data.\n4. **Solution (25 s)**: one or two concrete, feasible proposals your country would support.\n5. **Call to action (10 s)**: invite allies. "We invite all delegations committed to X to join us in the next unmoderated caucus."',
        'Worked example (India, climate finance, 90 s):\n> "Honourable Chair, fellow delegates. India is home to 17% of humanity but has contributed less than 4% of historical emissions. The Republic of India firmly holds that climate action must follow common but differentiated responsibilities, as agreed in the UNFCCC and the Paris Agreement. The UNEP Adaptation Gap Report shows developing countries need many times more adaptation finance than they receive. India therefore proposes a transparent, grant-based adaptation window, with access simplified for small island and least developed states, and technology transfer without prohibitive licensing costs. India invites all delegations that believe climate justice is the path to climate action to work with us. Thank you."',
        'Delivery: stand straight, look at the room (not the paper), pause after your hook, and finish **before** the gavel. Speeches that end with 5 seconds to spare look controlled.',
      ], key: ['Hook, stance, evidence, solution, call to action.', 'One clear sentence of stance; one or two sourced facts.', 'Finish before the bell.'],
      avoid: ['Reading the whole speech from paper.', 'Listing ten facts and no solution.', 'Generic stances ("We believe peace is important").'],
      drill: 'Write a 90-second GSL speech for your portfolio using the five parts. Paste it into Prep → Practice → Speech feedback, or Write → Speech, and time it at about 130 words a minute (about 195 words).', quiz: [
        { q: 'Roughly how many words fit in a 90-second speech at a calm pace?', options: ['80', '195', '400', '600'], answer: 1, why: 'At about 130 words a minute, 90 seconds is about 195 words.' },
        { q: 'Which is the strongest stance sentence?', options: ['"We think the issue is complex."', '"France, as stated at the 2024 UNGA, supports an immediate humanitarian ceasefire and unimpeded access."', '"Peace is good."', '"Our country has many views."'], answer: 1, why: 'Specific and anchored in a real statement.' },
        { q: 'The last ten seconds of a GSL speech should…', options: ['Introduce new statistics', 'Invite allies to work with you', 'Thank the Chair five times', 'Insult opponents'], answer: 1, why: 'A call to action turns a speech into lobbying.' },
      ] },
      { id: 'm3-3', title: 'Yielding time', minutes: 5, body: [
        'If you finish before your time ends, you must **yield** the remaining time. There are three kinds of yield:',
        '- **Yield to another delegate**: give your remaining time to a named delegate (an ally) who then speaks. They cannot yield it further.\n- **Yield to points of information (POIs)**: other delegates may ask you questions for the remaining time. Only the answers use the time.\n- **Yield to the Executive Board (the dais)**: the remaining time is absorbed and the Chair moves on. This "wastes" the time but is the safest option.',
        'When to choose which: yield to POIs when you are confident and well prepared (a good answer earns marks); yield to an ally to amplify a joint position; yield to the EB if you are unsure or very little time is left.',
        'Many committees today allow yields only in the GSL; in mods, time is usually yielded back automatically.',
      ], say: ['"The delegate yields the remaining time to the delegate of Ghana."', '"The delegate yields the remaining time to points of information."', '"The delegate yields the remaining time to the Executive Board."'],
      quiz: [
        { q: 'Yielding to the EB means…', options: ['The Chair gives a speech', 'The remaining time is absorbed', 'You get extra time', 'POIs follow'], answer: 1, why: 'Time goes back to the dais and the next speaker is called.' },
        { q: 'You are unsure of your facts with 30 seconds left. Safest yield?', options: ['To POIs', 'To the Executive Board', 'To your strongest opponent', 'Keep speaking past the bell'], answer: 1, why: 'Avoid hostile questions you cannot answer.' },
        { q: 'Can a delegate who received your yielded time yield it again?', options: ['Yes', 'No'], answer: 1, why: 'Yielded time cannot be yielded again.' },
      ] },
    ],
  },
  // ───────────────────────── Module 4 ─────────────────────────
  {
    id: 'm4', module: 4, track: 'masterclass', title: 'Points: the four you must know', level: 'Beginner',
    blurb: 'Personal privilege, parliamentary inquiry, order and information: when each is allowed and exactly what to say.',
    lessons: [
      { id: 'm4-1', title: 'Point of Personal Privilege', minutes: 4, body: [
        'Raised when a **personal discomfort** stops you from participating: you cannot hear the speaker, the room is too hot or cold (the classic example: "could the fan be switched on?"), you need to leave the room.',
        'It is the **only point that may interrupt a speaker**, and only for audibility. Use it sparingly.',
      ], say: ['"Point of personal privilege: the delegate is unable to hear the speaker. Could the speaker please speak louder?"', '"Point of personal privilege: may the delegate be excused from the committee for a few minutes?"'],
      avoid: ['Using it to object to what someone said; that is not personal privilege.'], quiz: [
        { q: 'Which point can interrupt a speaker?', options: ['Point of Order', 'Point of Personal Privilege (audibility)', 'Point of Information', 'Point of Inquiry'], answer: 1, why: 'Only personal privilege for audibility may interrupt.' },
        { q: 'The room is too cold to concentrate. Which point?', options: ['Order', 'Inquiry', 'Personal Privilege', 'Information'], answer: 2, why: 'A personal discomfort.' },
      ] },
      { id: 'm4-2', title: 'Point of Parliamentary Inquiry', minutes: 4, body: [
        'A question **to the Executive Board about the rules of procedure**: "What happens if…", "Can I…", "How many speakers…". It is never a question about the content of the agenda.',
        'Raise it when the floor is open (when the Chair asks for points or motions), not during a speech.',
      ], say: ['"Point of parliamentary inquiry: could the Executive Board clarify whether yields are in order in this moderated caucus?"'],
      quiz: [
        { q: 'You want to know how many signatories a draft resolution needs. Which point?', options: ['Personal Privilege', 'Parliamentary Inquiry', 'Order', 'Information'], answer: 1, why: 'A question about procedure to the EB.' },
      ] },
      { id: 'm4-3', title: 'Point of Order', minutes: 5, body: [
        'Raised when you believe there has been a **procedural error**: the Chair skipped a speaker, a motion was voted in the wrong order, a speaker used a yield not allowed in a mod. It concerns procedure, not facts.',
        'In many Indian-circuit conferences a Point of Order may also be raised for a **factual inaccuracy** in a speech or a **logical fallacy**, but only after the speech ends, and the EB decides whether it is "well taken". Check your rules; abuse is penalised.',
      ], say: ['"Point of order: the delegate believes the motions were voted out of order; the unmoderated caucus is more disruptive and should have been voted first."', 'Factual (if allowed): "Point of order on factual inaccuracy: the delegate of X stated the Paris Agreement was signed in 2005; it was adopted in 2015."'],
      avoid: ['Raising a Point of Order because you disagree with an argument.'], quiz: [
        { q: 'The Chair forgets to vote a raised motion. Which point?', options: ['Order', 'Inquiry', 'Information', 'Privilege'], answer: 0, why: 'A procedural error: Point of Order.' },
        { q: 'A Point of Order is about…', options: ['Your comfort', 'Procedure being followed correctly', 'Asking a speaker a question', 'Requesting a break'], answer: 1, why: 'It corrects procedural mistakes.' },
      ] },
      { id: 'm4-4', title: 'Point of Information (POI)', minutes: 6, body: [
        'A **question to a speaker** about their speech, asked when the speaker has yielded to POIs, or in a mod "with POIs". It must be a question, not a statement, and short (one sentence; follow-ups only if the Chair allows).',
        'A good POI does one of three things: exposes a contradiction ("Does the delegate agree that their country voted against resolution X?"), demands specifics ("How exactly will this fund be financed?"), or tests feasibility ("How does the delegate propose to enforce this without a Security Council mandate?").',
        'Answering a POI: thank the delegate, answer in one or two sentences, and turn it to your stance. If you do not know, say you will respond by chit; never invent facts.',
      ], say: ['"Does the delegate of Russia not agree that Article 2(4) of the Charter prohibits the threat or use of force against territorial integrity?"', 'Answer: "The delegate thanks the delegate of Canada for the question. In short, yes, and that is precisely why…"'],
      avoid: ['Making a speech instead of asking a question.', '"Does the delegate know…" questions that are easy to deflect.'], quiz: [
        { q: 'A POI must be…', options: ['A statement', 'A question', 'A motion', 'A speech'], answer: 1, why: 'Points of information are questions to the speaker.' },
        { q: 'You do not know the answer to a POI. Best response?', options: ['Invent a figure', 'Say you will answer by chit', 'Ignore it', 'Ask the Chair to answer'], answer: 1, why: 'Never fabricate; follow up by chit.' },
        { q: 'Which is the strongest POI?', options: ['"Is the delegate aware of the topic?"', '"How will the proposed fund be financed, and by whom?"', '"Why is the delegate wrong?"', '"Can the delegate repeat that?"'], answer: 1, why: 'It demands specifics and tests feasibility.' },
      ] },
    ],
  },
  // ───────────────────────── Module 5 ─────────────────────────
  {
    id: 'm5', module: 5, track: 'masterclass', title: 'Moderated caucus: informal debate', level: 'Intermediate',
    blurb: 'Choosing subtopics, raising the motion, speaking in mods, POI chits and the right to reply.',
    lessons: [
      { id: 'm5-1', title: 'Subtopics and the motion', minutes: 6, body: [
        'A **moderated caucus** is a focused discussion of one **subtopic** of the agenda. The Chair calls on speakers one by one, there is no list, and each speaker has a short time (60 seconds by default).',
        'The motion fixes the topic, the per-speaker time, the total time, and whether POIs are allowed (mandatory or optional).',
        'Picking good subtopics is a skill EBs reward. A good subtopic is **narrow**, **debatable** and **moves the committee towards solutions**. Compare: "Climate change" (too broad) vs "Financing adaptation for small island states: grants or loans?" (specific and solution-focused).',
        'A natural sequence of mods: (1) causes and current situation → (2) the role of key actors → (3) specific solution areas → (4) implementation and funding → (5) reviewing working papers.',
      ], say: ['"With the prior permission of the Executive Board, the delegate of ___ would like to raise a motion to suspend formal debate and move into a moderated caucus on the topic \'Financing adaptation for small island states\', with per speaker time being 60 seconds and total time being 12 minutes, with optional POIs."'],
      avoid: ['Subtopics that just repeat the agenda title.', 'Raising a mod then not speaking in it; the proposer is usually called first or last.'],
      drill: 'For your agenda, list five subtopics in the natural order above. Each should fit in one line and contain a tension (X or Y?).', quiz: [
        { q: 'The default per-speaker time in a mod is usually…', options: ['30 seconds', '60 seconds', '90 seconds', '3 minutes'], answer: 1, why: '60 seconds is the common default.' },
        { q: 'Which is the best mod topic?', options: ['"Terrorism"', '"Cutting terrorist financing through crypto exchanges: regulation vs cooperation"', '"General discussion"', '"The agenda"'], answer: 1, why: 'Narrow, debatable and solution-oriented.' },
        { q: 'A mod motion must specify…', options: ['Only the topic', 'Topic, per-speaker time, total time (and POIs)', 'Only total time', 'The speakers'], answer: 1, why: 'All parameters are stated in the motion.' },
      ] },
      { id: 'm5-2', title: 'Speaking in a mod', minutes: 5, body: [
        'Mod speeches are shorter and more interactive than GSL speeches. Structure for 60 seconds:',
        '1. **Point (10 s)**: your claim on this subtopic.\n2. **Proof (25 s)**: one fact or example.\n3. **Proposal (15 s)**: one concrete idea.\n4. **Link (10 s)**: respond to a previous speaker or connect to your bloc.',
        '**Respond to others.** "Building on the delegate of Mexico’s point…", "The delegate of Egypt suggested X; however…". EBs mark engagement, not just content.',
        'Stay on the subtopic. Speeches that drift back to general stance lose marks for relevance.',
      ], key: ['Point, proof, proposal, link.', 'Refer to other delegates by country.', 'Stay on the subtopic.'], quiz: [
        { q: 'Why mention previous speakers in a mod?', options: ['It wastes time', 'It shows engagement, which EBs reward', 'It is required by the Charter', 'To insult them'], answer: 1, why: 'Engagement and responsiveness are marked.' },
        { q: 'A mod speech that repeats your general stance loses marks for…', options: ['Grammar', 'Relevance to the subtopic', 'Speed', 'Length'], answer: 1, why: 'Each mod has a specific subtopic.' },
      ] },
      { id: 'm5-3', title: 'No POIs? Use POI chits', minutes: 4, body: [
        'Many mods are raised without POIs to save time. The solution: **POI chits**. You write your question on a chit, address it to the speaker through the EB, and the EB may read it out, forward it, or mark it.',
        'Format: "To: Delegate of France. Via: EB. POI: How does France reconcile its support for X with its 2023 vote against resolution Y?" Sign with your portfolio.',
        'POI chits are often marked separately (for example in the Chits component of the marksheet), so a sharp one is valuable even if never read aloud.',
      ], say: ['"To the delegate of Brazil, via the Executive Board: Could the delegate explain how the proposed deforestation fund would be monitored? From: the delegate of Norway."'],
      quiz: [
        { q: 'A mod has no POIs. How can you still question a speaker?', options: ['Shout the question', 'Send a POI chit via the EB', 'Raise a Point of Order', 'You cannot'], answer: 1, why: 'POI chits go through the EB.' },
      ] },
      { id: 'm5-4', title: 'Right to reply', minutes: 5, body: [
        'If another delegate insults your country’s **national integrity** (not merely disagrees with you), you may request a **right to reply**, usually by chit to the EB. If the EB grants it, you get a short time to respond.',
        'The three-step reply:\n- **a. Repeat**: quote the inflammatory statement exactly.\n- **b. Respond**: show why it was offensive (factually false, an attack on sovereignty or the people, not on policy).\n- **c. Demand**: ask for a verbal or written apology.',
        'Example: "The delegate of X stated that \'the government of Y is a terrorist regime\'. This statement attacks the sovereignty and the people of Y, a member state in good standing, and is not supported by any UN finding. The delegate of Y demands a formal apology, verbal or in writing."',
        'Do not overuse it. Ordinary criticism of policy ("your emissions are high") is debate, not an insult.',
      ], key: ['Repeat, respond, demand.', 'Only for attacks on national integrity, not policy criticism.'], quiz: [
        { q: 'The three steps of a right to reply are…', options: ['Repeat, respond, demand', 'Thank, agree, yield', 'Motion, vote, adjourn', 'Hook, stance, solution'], answer: 0, why: 'Repeat the statement, explain the offence, demand an apology.' },
        { q: '"Your country’s emissions are among the highest" justifies a right to reply?', options: ['Yes', 'No'], answer: 1, why: 'It criticises policy; it does not attack national integrity.' },
      ] },
    ],
  },
  // ───────────────────────── Module 6 ─────────────────────────
  {
    id: 'm6', module: 6, track: 'masterclass', title: 'Unmoderated caucus and lobbying', level: 'Intermediate',
    blurb: 'Raising unmods, the art of forming blocs and alliances, and what to do in fifteen minutes.',
    lessons: [
      { id: 'm6-1', title: 'The unmoderated caucus', minutes: 4, body: [
        'An **unmoderated caucus** suspends formal rules: delegates leave their seats and talk freely for a set time. This is where blocs form, deals are made and working papers are written.',
        'The motion needs only the total time (and sometimes a purpose).',
        'EBs walk around during unmods and mark **lobbying**: who leads, who brings people together, who writes. Sitting alone is a missed opportunity.',
      ], say: ['"With the prior permission of the Executive Board, the delegate of ___ would like to raise a motion to suspend formal debate and move into an unmoderated caucus with the total time being 15 minutes, for the purpose of drafting working papers."'],
      quiz: [
        { q: 'An unmod motion needs to specify…', options: ['Per-speaker time', 'Total time', 'A speakers list', 'POIs'], answer: 1, why: 'There are no speakers, only a total time.' },
        { q: 'What is usually marked during an unmod?', options: ['Nothing', 'Lobbying and leadership', 'Attendance only', 'Dress code'], answer: 1, why: 'EBs observe lobbying.' },
      ] },
      { id: 'm6-2', title: 'Lobbying: the true essence of diplomacy', minutes: 7, body: [
        'Lobbying is the art of forming **blocs and alliances**. It begins before the conference.',
        '**Before:** map the room. For every portfolio note: their likely stance, their regional group and alliances (G77, EU, AU, ASEAN, Arab Group, NAM, BRICS, Quad, OIC), and one interest you share. DelegateDesk’s Countries tool helps here.',
        '**In the first unmod:** go to your natural allies first, with something to offer: a clause, a data point, a draft structure. Ask questions before pitching ("What does your delegation need from this resolution?").',
        '**Build the core, then widen.** Three or four committed delegations who agree on 80% of the paper, then invite swing states by including one clause each of them cares about.',
        '**Leading without dominating.** Hold the laptop, keep the document, assign sections ("Japan, could you draft the funding clause?"), and make sure quieter allies get credit. EBs notice who makes the group work.',
        '**Swing states and opponents.** Find the clause that would make an opponent abstain rather than vote against. An abstention is often as good as a yes.',
      ], key: ['Map the room before the conference.', 'Lead with questions and something to offer.', 'Core of 3–4, then widen with targeted clauses.', 'Turn opponents into abstentions.'],
      avoid: ['Grabbing the laptop and writing alone.', 'Promising your sponsorship to two competing papers.', 'Ignoring smaller delegations; votes are equal.'],
      drill: 'In Prep → Practice, choose Negotiation. Play your country; let the AI play a likely opponent. Your goal: get them to abstain rather than vote against your key clause.', quiz: [
        { q: 'The best opening line with a potential ally is…', options: ['"Sign my paper."', '"What does your delegation need from this resolution?"', '"Your paper is weak."', '"I lead this bloc."'], answer: 1, why: 'Interests first; then offer.' },
        { q: 'You cannot win an opponent’s vote. Next best outcome?', options: ['Ignore them', 'Their abstention', 'A right to reply', 'Walk out'], answer: 1, why: 'Abstentions do not count against you in "present and voting" counts.' },
        { q: 'Good bloc leadership looks like…', options: ['Writing everything yourself', 'Assigning sections and crediting allies', 'Speaking for everyone', 'Refusing changes'], answer: 1, why: 'EBs reward leadership that includes others.' },
      ] },
      { id: 'm6-3', title: 'From bloc to working paper', minutes: 4, body: [
        'A **working paper** is the bloc’s informal draft. It does not need a strict format, but writing it in resolution format from the start saves time.',
        'Typical flow: agree the problem statement (preambulatory clauses) → split solution areas among members → merge → review together → find sponsors and signatories → submit to the EB for approval as a draft resolution.',
        'If two blocs have similar papers, **merging** strengthens both: bigger majority, more sponsors, and the EB rewards cooperation.',
      ], quiz: [
        { q: 'Two blocs have overlapping papers. A strong move is to…', options: ['Attack the other paper', 'Propose a merger', 'Withdraw', 'Raise a Point of Order'], answer: 1, why: 'Merging builds a larger majority and shows diplomacy.' },
      ] },
    ],
  },
  // ───────────────────────── Module 7 ─────────────────────────
  {
    id: 'm7', module: 7, track: 'masterclass', title: 'Chits: the silent marks', level: 'Intermediate',
    blurb: 'POI chits, substantive chits and informal chits, how EBs mark them and how to write ones that score.',
    lessons: [
      { id: 'm7-1', title: 'The three kinds of chit', minutes: 5, body: [
        'A **chit** is a written note passed through the committee’s pages or the EB. There are three kinds:',
        '- **POI chits**: questions to a speaker, sent via the EB when POIs are not taken on the floor.\n- **Substantive chits**: sent to the EB with substantive content: a fact correcting the debate, a solution, a clause idea, an analysis of a speech. These are marked.\n- **Informal chits (delegate-to-delegate)**: lobbying notes ("Meet at the back during the unmod?"). Not marked, but the EB may read them, so stay professional.',
        'In a Verbatim + Chits marking scheme (for example 80/20), chits can decide close awards. Delegates who rarely speak can still score with excellent chits.',
      ], key: ['POI chits, substantive chits, informal chits.', 'Substantive and POI chits are marked; informal ones are not (but can be read).'],
      quiz: [
        { q: 'A note to another delegate inviting them to your bloc is a…', options: ['Substantive chit', 'Informal chit', 'POI chit', 'Point of Order'], answer: 1, why: 'Delegate-to-delegate notes are informal.' },
        { q: 'Which chits are usually marked by the EB?', options: ['Informal only', 'Substantive and POI chits', 'None', 'Only chits about breaks'], answer: 1, why: 'Content-bearing chits are marked.' },
      ] },
      { id: 'm7-2', title: 'Writing a substantive chit that scores', minutes: 5, body: [
        'Format: **To / From / Subject**, then two to five lines. Start with the point. Include one fact with a source. End with a proposal or a question.',
        'Example:\n> To: The Executive Board. From: Delegate of South Africa. Re: Mod on food security.\n> The FAO’s State of Food Security report shows Africa has the highest prevalence of undernourishment. South Africa proposes the committee consider strengthening regional grain reserves through the African Union, building on the 2014 Malabo commitments. Would the EB entertain this as a mod subtopic?',
        'Do not spam. Five excellent chits beat thirty one-liners.',
      ], avoid: ['"Please mark me" chits.', 'Chits with no source or proposal.', 'Copying text from the background guide.'], quiz: [
        { q: 'A substantive chit should include…', options: ['Only a greeting', 'A point, a sourced fact and a proposal or question', 'A request for marks', 'Jokes'], answer: 1, why: 'Content and specificity earn marks.' },
      ] },
    ],
  },
  // ───────────────────────── Module 8 ─────────────────────────
  {
    id: 'm8', module: 8, track: 'masterclass', title: 'Documentation: position paper to resolution', level: 'Intermediate',
    blurb: 'Position paper format, draft resolution format, sponsors vs signatories, amendments and voting procedure.',
    lessons: [
      { id: 'm8-1', title: 'The position paper', minutes: 8, body: [
        'A **position paper** states your country’s stance before the conference, usually one to two pages per agenda. Many EBs mark it under Documentation.',
        'A clear format (the one most Indian-circuit EBs expect):',
        '1. **Heading**: committee, agenda, country, delegate name and school.\n2. **Stance summary**: one short paragraph. Example: "South Africa has frequently urged a peaceful, diplomatic resolution to the Russia–Ukraine conflict, has maintained ties with both parties, and has urged negotiation as the means of resolving the situation."\n3. **Source** for the stance (official statement, voting record, news report from a reputable outlet).\n4. **How the issue affects your country**: numbered effects (1. Economic effects: food and electricity prices… 2. Political repercussions: domestic pressure… 3. Social effects…).\n5. **Past actions**: your country’s relevant votes, treaties and programmes, and relevant UN resolutions.\n6. **Proposed solutions**: three to five concrete, feasible proposals consistent with your stance.\n7. **Bibliography**.',
        'Write it in the third person. Every claim should be traceable to a source.',
      ], key: ['Heading → stance → source → effects → past actions → solutions → bibliography.', 'Third person, sourced, feasible.'],
      drill: 'Use Prep → Write → Position paper to generate a draft, then rewrite the stance and solutions in your own words with your own sources.', quiz: [
        { q: 'A position paper is written…', options: ['After the conference', 'Before the conference', 'During voting', 'By the EB'], answer: 1, why: 'It sets out your stance in advance.' },
        { q: 'Which section shows how the issue affects your country?', options: ['Bibliography', 'Effects (numbered)', 'Heading', 'Signatories'], answer: 1, why: 'The numbered effects section.' },
      ] },
      { id: 'm8-2', title: 'Draft resolution format', minutes: 8, body: [
        'A **draft resolution** is the formal document the committee votes on. Format:',
        '**Heading**: Committee; Agenda/Topic; Sponsors; Signatories.',
        '**Preambulatory clauses**: the reasons. They begin with an *italicised* participle and end with a **comma**: *Understanding*, *Recalling*, *Deeply concerned*, *Noting with regret*, *Acknowledging*, *Reaffirming*.',
        '**Operative clauses**: the actions. They are **numbered**, begin with an *underlined* verb in the present tense and end with a **semicolon**; the final clause ends with a **full stop**: 1. Recommends…; 2. Calls upon…; 3. Requests…; 4. Decides to remain actively seized of the matter.',
        'Sub-clauses use a., b., c. and then i., ii., iii. Example:\n> 1. *Recommends* a regional early-warning network, in accordance with the following parameters:\n>   a. data sharing among coastal states within 24 hours of an alert,\n>   b. technical support from the World Meteorological Organization, including:\n>     i. training for national agencies,\n>     ii. satellite data access;',
        'Remember mandate: a GA committee "recommends", "encourages", "calls upon". Only the Security Council "decides" binding measures or "demands".',
      ], key: ['Preambulatory: italic participle, ends in comma.', 'Operative: numbered, underlined verb, ends in semicolon; last ends in full stop.', 'Sub-clauses a, b, c → i, ii, iii.'],
      drill: 'Open Prep → Tools → Resolution formatter and check a clause. Then try Write → Amendment.', quiz: [
        { q: 'Preambulatory clauses end with…', options: ['A full stop', 'A comma', 'A semicolon', 'A colon'], answer: 1, why: 'Commas; operative clauses use semicolons.' },
        { q: 'The final operative clause ends with…', options: ['A comma', 'A semicolon', 'A full stop', 'Nothing'], answer: 2, why: 'The resolution ends with a full stop.' },
        { q: 'Which verb suits a General Assembly operative clause?', options: ['Demands', 'Decides to impose sanctions', 'Recommends', 'Authorises force'], answer: 2, why: 'The GA recommends.' },
      ] },
      { id: 'm8-3', title: 'Sponsors vs signatories', minutes: 4, body: [
        '**Sponsors** are the authors. They agree with the whole paper, wrote substantial parts, and will defend it in debate. They are usually limited (often 2–5).',
        '**Signatories** only want the paper **discussed**. Signing does not mean agreeing or voting for it. Delegates often sign several papers so that debate can happen.',
        'Conferences set a minimum number of signatories (for example 20% of the committee) for a working paper to become a draft resolution.',
        'Strategy: be a sponsor on the paper closest to your country’s stance; sign generously to show good faith.',
      ], quiz: [
        { q: 'Signing a draft resolution means…', options: ['You will vote for it', 'You wish it to be discussed', 'You wrote it', 'You oppose it'], answer: 1, why: 'Signatories only support debate on it.' },
        { q: 'Who defends the resolution during debate?', options: ['Signatories', 'Sponsors', 'The Chair', 'The Rapporteur'], answer: 1, why: 'Sponsors are the authors.' },
      ] },
      { id: 'm8-4', title: 'Amendments and voting procedure', minutes: 6, body: [
        'Once a draft resolution is introduced, delegates may propose **amendments**: add, delete or modify an operative clause (preambulatory clauses usually cannot be amended).',
        '- **Friendly amendment**: all sponsors agree, so it is added without a vote.\n- **Unfriendly amendment**: not all sponsors agree, so the committee debates and votes on it (substantive vote).',
        'Then a motion to **close debate** moves the committee into **voting procedure**: doors are closed, no one enters or leaves, no chits are passed, and the committee votes on the draft. Some rules allow a **roll-call vote** (each delegate votes aloud: yes, no, abstain, or pass) or **division of the question** (voting on clauses separately).',
        'After voting, a delegate may give an **explanation of vote** if the rules allow.',
      ], key: ['Friendly: all sponsors agree, no vote. Unfriendly: debated and voted.', 'Voting procedure: closed doors, no chits.'],
      quiz: [
        { q: 'An amendment all sponsors accept is…', options: ['Unfriendly', 'Friendly', 'Out of order', 'A signatory'], answer: 1, why: 'Friendly amendments pass without a vote.' },
        { q: 'During voting procedure, chits are…', options: ['Encouraged', 'Not passed', 'Marked double', 'Read aloud'], answer: 1, why: 'Voting procedure suspends chit passing.' },
      ] },
    ],
  },
  // ───────────────────────── Module 9 ─────────────────────────
  {
    id: 'm9', module: 9, track: 'masterclass', title: 'Indian committees in MUN', level: 'Intermediate',
    blurb: 'AIPPM, Lok Sabha, Rajya Sabha, Union Cabinet and historical/crisis committees: "you are not just debating, you are playing politics".',
    lessons: [
      { id: 'm9-1', title: 'What Indian committees are', minutes: 5, body: [
        'Indian committees simulate India’s **political, legislative and executive bodies**. Delegates represent real political leaders, ministers, MPs, bureaucrats or historical figures and debate issues affecting the nation.',
        'The common ones:\n- **AIPPM** (All India Political Parties Meet): leaders of national and regional parties discuss a national issue and try to reach consensus.\n- **Lok Sabha**: the lower house; MPs debate bills and motions, often with a Speaker presiding.\n- **Rajya Sabha**: the upper house (Council of States).\n- **Union Cabinet**: the Prime Minister and ministers take executive decisions, often in crisis format.\n- **Historical / crisis committees**: a past moment (for example the Constituent Assembly, or a historic cabinet) or a fast-moving crisis.',
        'The key difference from UN committees: **you are not just debating, you are playing politics.** Party lines, coalition arithmetic, upcoming elections, regional vote banks and personal rivalries all matter.',
      ], key: ['Portfolios are people, not countries.', 'Party line + personal record + constituency.', 'Politics, not only policy.'], quiz: [
        { q: 'In an AIPPM you usually represent…', options: ['A country', 'A political leader', 'A UN agency', 'A company'], answer: 1, why: 'Portfolios are party leaders and politicians.' },
        { q: 'What does AIPPM stand for?', options: ['All India Political Parties Meet', 'Asian Indian Parliamentary Meeting', 'All India Prime Ministers Meet', 'Assembly of Indian Political Members'], answer: 0, why: 'All India Political Parties Meet.' },
      ] },
      { id: 'm9-2', title: 'Parliament: Lok Sabha and Rajya Sabha', minutes: 7, body: [
        '**Lok Sabha**: up to 543 elected seats (Article 81 sets the limit), elected directly for five years. Presided over by the **Speaker**. The Council of Ministers is collectively responsible to the Lok Sabha (Article 75(3)), so a **no-confidence motion** can only be moved here.',
        '**Rajya Sabha**: up to 250 members (238 elected by state legislatures, 12 nominated by the President for expertise in literature, science, art and social service). It is a permanent house; one-third retire every two years. The **Vice-President** is its ex officio Chairman.',
        '**Money bills** (Article 110) can only be introduced in the Lok Sabha; the Rajya Sabha can only recommend changes within 14 days. Ordinary bills need both houses; a deadlock can go to a **joint sitting** (Article 108).',
        'Parliamentary tools you may simulate: **Question Hour**, **Zero Hour** (urgent issues raised without notice), **calling attention motions**, **adjournment motions**, and **points of order** under the house’s rules. In MUN, the EB adapts these; read your committee’s rules.',
      ], key: ['No-confidence motions: Lok Sabha only.', 'Money bills: Lok Sabha only (Art. 110).', 'Rajya Sabha: permanent, 12 nominated members.'],
      quiz: [
        { q: 'A no-confidence motion against the government can be moved in…', options: ['Rajya Sabha', 'Lok Sabha', 'Either house', 'The Supreme Court'], answer: 1, why: 'The Council of Ministers is responsible to the Lok Sabha.' },
        { q: 'How many Rajya Sabha members can the President nominate?', options: ['2', '12', '25', '50'], answer: 1, why: 'Twelve, for expertise in specific fields.' },
        { q: 'Who presides over the Rajya Sabha?', options: ['The Speaker', 'The Prime Minister', 'The Vice-President', 'The President'], answer: 2, why: 'The Vice-President is ex officio Chairman.' },
      ] },
      { id: 'm9-3', title: 'Researching and playing an Indian portfolio', minutes: 7, body: [
        'Research in three layers:\n1. **The person**: their record, public statements, constituency, past positions (and contradictions).\n2. **The party**: manifesto, official positions, alliance (for example NDA or INDIA bloc), and where the leader differs from the party line.\n3. **The issue**: the relevant constitutional articles, laws, Supreme Court judgments, committee reports and data.',
        'Good sources: PRS Legislative Research (bill summaries), Lok Sabha and Rajya Sabha debate records, party manifestos, the Election Commission, government ministries and the Press Information Bureau, and reputable newspapers.',
        'Playing it: stay in character but stay respectful; personal attacks are penalised even if "realistic". Use **coalition arithmetic** (who needs whom?), seek consensus on a joint communiqué or resolution, and use crisis updates to advance your leader’s interests.',
        'Sensitivity: Indian committees often touch caste, religion and regional identity. Argue policy, cite facts, and never demean communities. EBs mark diplomacy here heavily.',
      ], key: ['Person → party → issue.', 'PRS, debate records, manifestos, PIB.', 'In character, but never personal or communal.'], avoid: ['Mimicking a politician’s mannerisms or slogans instead of arguing.', 'Communal or casteist remarks, even "in character".'],
      quiz: [
        { q: 'Which is a good source for bill summaries?', options: ['Social media memes', 'PRS Legislative Research', 'Anonymous blogs', 'Rival party posters'], answer: 1, why: 'PRS publishes neutral bill summaries.' },
        { q: 'Your leader is known for fiery rhetoric. In committee you should…', options: ['Insult opponents personally', 'Argue forcefully on policy while staying respectful', 'Stay silent', 'Read party slogans'], answer: 1, why: 'Diplomacy is still marked.' },
      ] },
    ],
  },
  // ───────────────────────── Module 10 ─────────────────────────
  {
    id: 'm10', module: 10, track: 'masterclass', title: 'Winning: how EBs mark, and tips from the circuit', level: 'Advanced',
    blurb: 'The marksheet decoded, a three-day game plan, and the habits Best Delegates share.',
    lessons: [
      { id: 'm10-1', title: 'How you are marked', minutes: 6, body: [
        'A typical EB marksheet (and the one DelegateDesk uses for EB marking) has these components:',
        '- **Verbatim (often 80%)**: every GSL speech, mod speech and verbal POI, marked out of 10 each for content, relevance, evidence, diplomacy and delivery.\n- **Chits (often 20%)**: substantive and POI chits.\n- **Lobbying (often out of 5)**: leadership and bloc-building in unmods.\n- **Documentation (often out of 5)**: position paper, working paper and draft resolution contributions.\n- Sometimes **attendance** and **conduct**.',
        'Worked example: you have 60 verbatim points and 20 chit points with an 80/20 weighting: 60 × 0.8 + 20 × 0.2 = 48 + 4 = **52**, then add lobbying (4/5) and documentation (5/5) for **61**.',
        'Implications: **speak often and well** (verbatim dominates), but every chit and every unmod counts in a close race. Consistency across all sessions beats one brilliant speech.',
        'Typical awards: Best Delegate, High Commendation, Special Mention, Verbal Mentions; some conferences add Best Position Paper.',
      ], key: ['Verbatim dominates; chits, lobbying and documentation break ties.', 'Consistency across every session.'], quiz: [
        { q: 'With an 80/20 scheme, 50 verbatim + 30 chit points gives…', options: ['80', '46', '40', '56'], answer: 1, why: '50 × 0.8 + 30 × 0.2 = 40 + 6 = 46.' },
        { q: 'Which component usually carries the most weight?', options: ['Chits', 'Verbatim (speeches and POIs)', 'Attendance', 'Dress code'], answer: 1, why: 'Verbatim is usually around 80%.' },
      ] },
      { id: 'm10-2', title: 'Tips from the circuit', minutes: 7, body: [
        '**Before the conference**\n- Read the background guide twice; highlight every question it asks. Those become your mod subtopics.\n- Know your country’s voting record on the last two or three resolutions on the topic.\n- Prepare: three GSL speeches, five mod speeches (one per subtopic), ten POIs, five clauses.\n- Make a one-page cheat sheet: allies, opponents, key facts with sources, Charter articles.',
        '**Day 1**\n- Speak in the first GSL round. First impressions set the EB’s expectations.\n- Raise at least one good mod motion. Proposers are often called to speak.\n- Identify your bloc by the first unmod.',
        '**Day 2**\n- Lead or co-lead a working paper. Hold the document.\n- Ask sharp POIs; send three to five excellent substantive chits.\n- Merge papers if possible.',
        '**Day 3**\n- Defend your draft; negotiate amendments; count votes before voting procedure.\n- Stay diplomatic to the last minute. The final impression matters.',
        '**Always**: never fabricate facts; respect the EB; be kind to first-timers. The circuit is small and reputations travel.',
      ], key: ['Prepare speeches, POIs and clauses in advance.', 'Speak early, lead a paper, chit well.', 'Never fabricate; always diplomatic.'],
      drill: 'Build your conference kit in Prep → Research (choose the Full conference preparation template). It runs the research tasks in parallel and saves everything to one project.', quiz: [
        { q: 'When should you first speak on Day 1?', options: ['Only on Day 3', 'In the first GSL round', 'Never, just listen', 'After lunch'], answer: 1, why: 'Early speeches frame the debate and the EB’s impression.' },
        { q: 'You are unsure of a statistic mid-speech. You should…', options: ['Make one up', 'Skip it or say "around" with the source you trust', 'Ask the room', 'Raise a point'], answer: 1, why: 'Never fabricate.' },
        { q: 'Background guide questions are useful as…', options: ['Nothing', 'Moderated caucus subtopics', 'Points of order', 'Chit jokes'], answer: 1, why: 'They map directly to subtopics.' },
      ] },
      { id: 'm10-3', title: 'The final exam', minutes: 15, body: [
        'You have finished the Masterclass modules. Take the **final assessment**: 25 questions drawn from every module and topic course. Score 70% or more to earn your DelegateDesk Masterclass certificate.',
        'Open it from the Learn page (Final assessment), or go straight to it below.',
      ], quiz: [
        { q: 'Which order is correct for a session?', options: ['GSL → roll call → voting → mods', 'Roll call → agenda → GSL → caucuses → papers → voting', 'Voting → GSL → roll call', 'Unmod → roll call → GSL → agenda'], answer: 1, why: 'Roll call, agenda, GSL, caucuses, documents, then voting.' },
        { q: 'Which point may interrupt a speaker?', options: ['Order', 'Inquiry', 'Personal privilege (audibility)', 'Information'], answer: 2, why: 'Only personal privilege for audibility.' },
        { q: 'Signatories to a draft resolution…', options: ['Must vote for it', 'Want it discussed', 'Wrote it', 'Cannot speak on it'], answer: 1, why: 'Signing means supporting debate, not the content.' },
      ] },
    ],
  },
];
