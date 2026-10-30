/**
 * Live committee sessions: roll call, quorum, the speakers' list with a timer, motions, and voting
 * (simple majority, two-thirds, and Security Council rules with the P5 veto).
 *
 * A session lives in the platform database so anyone can run one, with or without a conference.
 * The chair holds a secret key; delegates join with a six-character code to follow along, ask to speak
 * and, when the chair allows it, vote from their own device after claiming their seat.
 */
import crypto from 'node:crypto';
import { platformDb } from '../platform.ts';
import { bad, conflict, forbidden, notFound, now } from '../util.ts';
import { applyMark, follow, marksheet, marksheetXlsx, recognition, type Marking, type MarkAction } from './marking.ts';

export type Presence = 'absent' | 'present' | 'present_voting';
export type Ballot = 'for' | 'against' | 'abstain' | 'pass';
export interface Delegate { id: string; name: string; code: string | null; person: string | null; presence: Presence }
export interface Motion { id: string; type: string; proposer: string | null; duration: number | null; speakingTime: number | null; topic: string | null; status: 'pending' | 'passed' | 'failed' | 'withdrawn' }
export interface Vote {
  id: string; title: string; kind: 'procedural' | 'substantive'; rule: 'simple' | 'two_thirds' | 'security_council' | 'consensus';
  motionId: string | null; ballots: Record<string, Ballot>; open: boolean; deviceVoting: boolean;
  docId?: string | null; rights?: string[];          // the draft resolution being voted on; delegations voting with rights
  result: null | { passed: boolean; for: number; against: number; abstain: number; needed: string; vetoedBy: string[] };
}
export interface LiveState {
  committee: { name: string; short: string; veto: string[] };
  delegates: Delegate[];
  mode: 'idle' | 'roll_call' | 'gsl' | 'moderated' | 'unmoderated' | 'tour' | 'consultation' | 'voting';
  speakers: { queue: string[]; current: string | null; speakingTime: number; requests: string[] };
  timer: { label: string; duration: number; startedAt: string | null; remaining: number };
  motions: Motion[];
  vote: Vote | null;
  topic: string | null;
  log: { at: string; text: string }[];
  claims: Record<string, string>;      // delegate id -> hashed device token
  marking?: Marking;                   // EB marks: never shown to delegates
  amendments?: Amendment[];
  ebNotes?: { at: string; by: string; text: string }[];   // private notes between EB members: never shown to delegates
  settings?: Partial<RoomSettings>;
  docs?: Doc[];
  stats?: Record<string, Stats>;       // what each delegation did, for the points ranking: chair only
  pending?: string[];                  // delegations in the waiting room (joined on a device, not let in yet)
}
export interface Doc { id: string; kind: 'wp' | 'dr'; title: string; sponsors: string[]; signatories: string[]; link: string | null; body: string | null; status: 'pending' | 'open' | 'rejected' | 'passed' | 'failed'; by: string; at: string }
export interface Stats { att: number; gsl: number; caucus: number; seconds: number; raised: number; passed: number; rtr: number; wp: number; dr: number; drPassed: number; ratings: number[] }

/** How the chair runs the room. Every session starts with these and the chair changes them in Settings. */
export interface RoomSettings {
  chat: boolean; selfStatus: boolean; openJoin: boolean;
  motions: { key: string; on: boolean; label?: string }[];     // ranked: most disruptive first
  customMotion: boolean;
  docs: { wp: { one: string; many: string; max: number | null }; dr: { one: string; many: string; max: number | null }; approve: boolean; sponsorsLabel: string };
  threshold: 'simple' | 'two_thirds' | 'consensus'; abstentions: boolean; withRights: boolean; allowPass: boolean;
  voteMethod: 'roll_call' | 'devices'; veto: 'none' | 'p5' | 'unanimous' | 'custom'; quorum: 'third' | 'half' | 'two_thirds' | 'none';
  points: Record<PointKey, { on: boolean; pts: number }>; blend: number; rateSpeeches: boolean;
  language: 'en' | 'es' | 'fr' | 'pt' | 'ar';
}
export type PointKey = 'attendance' | 'gsl' | 'caucus' | 'minute' | 'raised' | 'passed' | 'rtr' | 'wp' | 'dr' | 'drPassed';
export const POINT_LABELS: Record<PointKey, string> = {
  attendance: 'Attendance (P/PV)', gsl: 'GSL speech', caucus: 'Caucus speech', minute: 'Speaking time (per minute)', raised: 'Motion raised',
  passed: 'Motion passed', rtr: 'Right of reply', wp: 'Working paper', dr: 'Draft resolution', drPassed: 'Draft resolution passed',
};
const DEFAULT_POINTS: Record<PointKey, number> = { attendance: 5, gsl: 10, caucus: 8, minute: 1, raised: 10, passed: 10, rtr: 5, wp: 10, dr: 20, drPassed: 10 };
/** Motions the chair can rank, switch off and rename. The rest are always available. */
export const RANKED_MOTIONS = ['consultation', 'tour_de_table', 'unmoderated', 'moderated'];
const ALWAYS_FIRST = ['adjourn', 'suspend', 'table', 'close_debate'];
const ALWAYS_LAST = ['open_debate', 'set_agenda', 'speaking_time', 'custom'];
export function defaultSettings(): RoomSettings {
  return {
    chat: true, selfStatus: true, openJoin: true, motions: RANKED_MOTIONS.map((key) => ({ key, on: true })), customMotion: true,
    docs: { wp: { one: 'Working Paper', many: 'Working Papers', max: null }, dr: { one: 'Draft Resolution', many: 'Draft Resolutions', max: null }, approve: false, sponsorsLabel: 'Sponsors' },
    threshold: 'simple', abstentions: true, withRights: true, allowPass: true, voteMethod: 'roll_call', veto: 'none', quorum: 'third',
    points: Object.fromEntries(Object.entries(DEFAULT_POINTS).map(([k, pts]) => [k, { on: true, pts }])) as RoomSettings['points'], blend: 100, rateSpeeches: false, language: 'en',
  };
}
export function cfg(s: LiveState): RoomSettings {
  const d = defaultSettings(); const x = s.settings ?? {};
  return { ...d, ...x, docs: { ...d.docs, ...x.docs, wp: { ...d.docs.wp, ...x.docs?.wp }, dr: { ...d.docs.dr, ...x.docs?.dr } }, points: { ...d.points, ...x.points } } as RoomSettings;
}
/** Most disruptive first: the order the chair votes pending motions in. */
export function motionOrder(s: LiveState) { return [...ALWAYS_FIRST, ...cfg(s).motions.map((m) => m.key), ...ALWAYS_LAST]; }
export function motionLabel(s: LiveState, type: string) { return cfg(s).motions.find((m) => m.key === type)?.label || MOTION_TYPES[type]?.label || type; }
export interface Amendment { id: string; draft: string; clause: string; text: string; proposer: string | null; kind: 'friendly' | 'unfriendly'; status: 'pending' | 'passed' | 'failed' | 'incorporated' | 'withdrawn'; at: string }

export const P5 = ['us', 'gb', 'fr', 'ru', 'cn'];
export const MOTION_TYPES: Record<string, { label: string; rule: 'simple' | 'two_thirds'; needsDuration: boolean; needsSpeakingTime: boolean }> = {
  open_debate: { label: 'Open debate (start the speakers list)', rule: 'simple', needsDuration: false, needsSpeakingTime: true },
  set_agenda: { label: 'Set the agenda', rule: 'simple', needsDuration: false, needsSpeakingTime: false },
  moderated: { label: 'Moderated caucus', rule: 'simple', needsDuration: true, needsSpeakingTime: true },
  unmoderated: { label: 'Unmoderated caucus', rule: 'simple', needsDuration: true, needsSpeakingTime: false },
  tour_de_table: { label: 'Tour de table', rule: 'simple', needsDuration: false, needsSpeakingTime: true },
  consultation: { label: 'Consultation of the whole', rule: 'simple', needsDuration: true, needsSpeakingTime: false },
  custom: { label: 'Custom motion', rule: 'simple', needsDuration: false, needsSpeakingTime: false },
  speaking_time: { label: 'Change speaking time', rule: 'simple', needsDuration: false, needsSpeakingTime: true },
  close_debate: { label: 'Close debate and move into voting', rule: 'two_thirds', needsDuration: false, needsSpeakingTime: false },
  suspend: { label: 'Suspend the meeting', rule: 'simple', needsDuration: false, needsSpeakingTime: false },
  adjourn: { label: 'Adjourn the meeting', rule: 'simple', needsDuration: false, needsSpeakingTime: false },
  table: { label: 'Table the topic', rule: 'two_thirds', needsDuration: false, needsSpeakingTime: false },
};

const rid = () => crypto.randomBytes(6).toString('base64url');
const nameOf = (s: LiveState, id: string | null) => s.delegates.find((d) => d.id === id)?.name ?? '—';
const log = (s: LiveState, text: string) => { s.log.unshift({ at: now(), text }); s.log = s.log.slice(0, 200); };

export function newState(o: { name: string; short?: string; delegates: { name: string; code?: string | null; person?: string | null }[]; veto?: string[] }): LiveState {
  const seen = new Set<string>();
  const delegates = o.delegates.map((d) => ({ name: String(d.name ?? '').trim(), code: d.code ? String(d.code).toLowerCase() : null, person: d.person ?? null }))
    .filter((d) => d.name && !seen.has(d.name.toLowerCase()) && seen.add(d.name.toLowerCase()))
    .map((d) => ({ id: rid(), ...d, presence: 'absent' as Presence }));
  if (!delegates.length) throw bad('Add at least one delegation');
  const veto = o.veto ?? delegates.filter((d) => d.code && P5.includes(d.code)).map((d) => d.id);
  return {
    committee: { name: o.name.trim() || 'Committee', short: (o.short ?? '').trim(), veto },
    delegates, mode: 'idle', speakers: { queue: [], current: null, speakingTime: 60, requests: [] },
    timer: { label: '', duration: 0, startedAt: null, remaining: 0 }, motions: [], vote: null, topic: null, log: [], claims: {},
  };
}

/** Quorum to debate (a third of members unless the chair sets another), a majority present for a substantive vote,
 *  and the two-thirds and simple-majority numbers of those present. */
export function quorum(s: LiveState) {
  const present = s.delegates.filter((d) => d.presence !== 'absent').length;
  const total = s.delegates.length;
  const rule = cfg(s).quorum;
  const need = { third: Math.ceil(total / 3), half: Math.floor(total / 2) + 1, two_thirds: Math.ceil((total * 2) / 3), none: 0 }[rule];
  return {
    present, total, need, debate: present >= need, substantive: rule === 'none' || present > total / 2,
    presentVoting: s.delegates.filter((d) => d.presence === 'present_voting').length,
    twoThirds: Math.ceil((present * 2) / 3), majority: Math.floor(present / 2) + 1,
  };
}

/** Count a vote. Abstentions do not count as votes cast; "present and voting" delegates may not abstain. */
export function tally(s: LiveState, v: Vote) {
  const counts = { for: 0, against: 0, abstain: 0 };
  for (const b of Object.values(v.ballots)) if (b !== 'pass') counts[b]++;
  const cast = counts.for + counts.against;
  let passed: boolean; let needed: string;
  const vetoMode = cfg(s).veto;
  const vetoes = v.kind === 'substantive' && (v.rule === 'security_council' || vetoMode === 'p5' || vetoMode === 'custom');
  const vetoedBy = vetoes ? s.committee.veto.filter((id) => v.ballots[id] === 'against').map((id) => nameOf(s, id)) : [];
  if (v.rule === 'consensus' || (v.kind === 'substantive' && vetoMode === 'unanimous')) { passed = counts.for > 0 && counts.against === 0; needed = 'every delegation voting to vote for'; }
  else if (v.rule === 'two_thirds') { passed = cast > 0 && counts.for * 3 >= cast * 2; needed = `two-thirds of votes cast (${Math.ceil((cast * 2) / 3)} of ${cast})`; }
  else if (v.rule === 'security_council') {
    // UN Charter art. 27: nine affirmative votes of fifteen (scaled to committee size), and no permanent-member veto on substance.
    const need = Math.ceil((s.delegates.length * 9) / 15);
    passed = counts.for >= need && vetoedBy.length === 0;
    needed = `${need} votes in favour${v.kind === 'substantive' ? ' and no veto' : ''}`;
  } else { passed = counts.for > counts.against; needed = `more votes for than against (${Math.floor(cast / 2) + 1} of ${cast})`; }
  if (vetoedBy.length && v.rule !== 'security_council') { passed = false; needed += ' and no veto'; }
  return { passed, ...counts, needed, vetoedBy };
}

export type Action =
  | { type: 'eb_note'; text: string; by?: string }
  | { type: 'presence'; delegateId: string; presence: Presence }
  | { type: 'roll_call'; on: boolean }
  | { type: 'mark_all'; presence: Presence }
  | { type: 'add_delegate'; name: string; code?: string | null }
  | { type: 'remove_delegate'; delegateId: string }
  | { type: 'set_veto'; delegateId: string; on: boolean }
  | { type: 'topic'; topic: string | null }
  | { type: 'speaker_add'; delegateId: string }
  | { type: 'speaker_remove'; delegateId: string }
  | { type: 'speaker_next'; start?: boolean }
  | { type: 'speaker_move'; delegateId: string; to: number }
  | { type: 'speaker_end' }
  | { type: 'yield'; to: string }
  | { type: 'rtr'; delegateId: string; seconds?: number }
  | { type: 'rate'; delegateId: string; stars: number }
  | { type: 'settings'; patch: any }
  | { type: 'doc_add'; kind: Doc['kind']; title: string; sponsors?: string[]; signatories?: string[]; link?: string | null; body?: string | null; by?: string }
  | { type: 'doc_status'; docId: string; status: Doc['status'] }
  | { type: 'doc_vote'; docId: string }
  | { type: 'seat_decide'; delegateId: string; accept: boolean }
  | { type: 'speaker_clear' }
  | { type: 'speaking_time'; seconds: number }
  | { type: 'request_decide'; delegateId: string; accept: boolean }
  | { type: 'timer'; op: 'start' | 'pause' | 'reset' | 'add'; seconds?: number; label?: string }
  | { type: 'motion_add'; motionType: string; proposer?: string | null; duration?: number | null; speakingTime?: number | null; topic?: string | null }
  | { type: 'motion_withdraw'; motionId: string }
  | { type: 'motion_vote'; motionId: string }
  | { type: 'vote_open'; title: string; kind: 'procedural' | 'substantive'; rule?: Vote['rule']; deviceVoting?: boolean }
  | { type: 'ballot'; delegateId: string; ballot: Ballot | null; rights?: boolean }
  | { type: 'vote_close' }
  | { type: 'vote_clear' }
  | { type: 'mode'; mode: LiveState['mode'] }
  | { type: 'amend_add'; draft?: string; clause: string; text: string; proposer?: string | null; kind: Amendment['kind'] }
  | { type: 'amend_status'; amendmentId: string; status: Amendment['status'] }
  | MarkAction;

function remaining(t: LiveState['timer']) {
  if (!t.startedAt) return t.remaining;
  return Math.max(0, t.remaining - Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 1000));
}
function startTimer(s: LiveState, seconds: number, label: string) { s.timer = { label, duration: seconds, remaining: seconds, startedAt: now() }; }
const mustHave = (s: LiveState, id: string) => { if (!s.delegates.some((d) => d.id === id)) throw notFound('Delegation'); };
const stat = (s: LiveState, id: string) => ((s.stats ??= {})[id] ??= { att: 0, gsl: 0, caucus: 0, seconds: 0, raised: 0, passed: 0, rtr: 0, wp: 0, dr: 0, drPassed: 0, ratings: [] });
/** The speaker's time so far counts towards their speaking time when the floor moves on. */
function endSpeech(s: LiveState) {
  const cur = s.speakers.current;
  if (cur && s.timer.duration && s.delegates.some((d) => d.id === cur)) stat(s, cur).seconds += Math.max(0, s.timer.duration - remaining(s.timer));
}
/** Give a delegation the floor. The timer waits for the chair's Start unless `start` is set. */
function giveFloor(s: LiveState, id: string, seconds: number, kind: 'speech' | 'rtr' | 'yield', start: boolean, label?: string) {
  endSpeech(s);
  s.speakers.current = id;
  s.timer = { label: label ?? nameOf(s, id), duration: seconds, remaining: seconds, startedAt: start ? now() : null };
  if (kind === 'speech') stat(s, id)[['moderated', 'tour'].includes(s.mode) ? 'caucus' : 'gsl']++;
  if (kind === 'rtr') stat(s, id).rtr++;
}
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
/** Apply a settings change from the chair, checking every value. */
function applySettings(s: LiveState, p: any) {
  const n = cfg(s);
  for (const k of ['chat', 'selfStatus', 'openJoin', 'customMotion', 'abstentions', 'withRights', 'allowPass', 'rateSpeeches'] as const) if (typeof p?.[k] === 'boolean') n[k] = p[k];
  const pick = <K extends keyof RoomSettings>(k: K, opts: readonly string[]) => { if (p?.[k] !== undefined) { if (!opts.includes(p[k])) throw bad(`Unknown ${String(k)}`); (n as any)[k] = p[k]; } };
  pick('threshold', ['simple', 'two_thirds', 'consensus']); pick('voteMethod', ['roll_call', 'devices']); pick('veto', ['none', 'p5', 'unanimous', 'custom']);
  pick('quorum', ['third', 'half', 'two_thirds', 'none']); pick('language', ['en', 'es', 'fr', 'pt', 'ar']);
  if (p?.blend !== undefined) { const b = Math.round(Number(p.blend)); if (!(b >= 0 && b <= 100)) throw bad('The blend is between 0 and 100'); n.blend = b; }
  if (Array.isArray(p?.motions)) {
    const keys = p.motions.map((m: any) => m?.key);
    if (keys.length !== RANKED_MOTIONS.length || !RANKED_MOTIONS.every((k) => keys.includes(k))) throw bad('Rank every motion once');
    n.motions = p.motions.map((m: any) => ({ key: m.key, on: m.on !== false, ...(str(m.label, 40) ? { label: str(m.label, 40) } : {}) }));
  }
  if (p?.docs) {
    for (const k of ['wp', 'dr'] as const) {
      const d = p.docs[k]; if (!d) continue;
      if (d.one !== undefined) n.docs[k].one = str(d.one, 40) || n.docs[k].one;
      if (d.many !== undefined) n.docs[k].many = str(d.many, 40) || n.docs[k].many;
      if (d.max !== undefined) { const m = d.max == null ? null : Math.round(Number(d.max)); if (m != null && !(m >= 1 && m <= 99)) throw bad('The limit is between 1 and 99'); n.docs[k].max = m; }
    }
    if (typeof p.docs.approve === 'boolean') n.docs.approve = p.docs.approve;
    if (p.docs.sponsorsLabel !== undefined) n.docs.sponsorsLabel = str(p.docs.sponsorsLabel, 30) || 'Sponsors';
  }
  if (p?.points) for (const k of Object.keys(POINT_LABELS) as PointKey[]) {
    const x = p.points[k]; if (!x) continue;
    if (typeof x.on === 'boolean') n.points[k].on = x.on;
    if (x.pts !== undefined) { const v = Math.round(Number(x.pts)); if (!(v >= 0 && v <= 100)) throw bad('Points are between 0 and 100'); n.points[k].pts = v; }
  }
  // Veto holders follow the veto rule: the P5 (when they are in the room), nobody, or the chair's own list.
  if (p?.veto === 'p5') s.committee.veto = s.delegates.filter((d) => d.code && P5.includes(d.code)).map((d) => d.id);
  if (p?.veto === 'none' || p?.veto === 'unanimous') s.committee.veto = [];
  s.settings = n;
}
const docName = (s: LiveState, kind: Doc['kind']) => cfg(s).docs[kind].one;
function creditDoc(s: LiveState, d: Doc) { for (const id of d.sponsors) if (s.delegates.some((x) => x.id === id)) stat(s, id)[d.kind]++; }

/** The points ranking: objective points from what each delegation did, blended with the chair's speech ratings. */
export function ranking(s: LiveState) {
  const c = cfg(s);
  const rows = s.delegates.map((d) => {
    const x = s.stats?.[d.id] ?? { att: 0, gsl: 0, caucus: 0, seconds: 0, raised: 0, passed: 0, rtr: 0, wp: 0, dr: 0, drPassed: 0, ratings: [] };
    const counts: Record<PointKey, number> = { attendance: x.att, gsl: x.gsl, caucus: x.caucus, minute: Math.floor(x.seconds / 60), raised: x.raised, passed: x.passed, rtr: x.rtr, wp: x.wp, dr: x.dr, drPassed: x.drPassed };
    const points = (Object.keys(counts) as PointKey[]).reduce((t, k) => t + (c.points[k].on ? counts[k] * c.points[k].pts : 0), 0);
    const quality = x.ratings.length ? Math.round((x.ratings.reduce((a, b) => a + b, 0) / x.ratings.length) * 20) : null;
    return { id: d.id, name: d.name, code: d.code, counts, points, quality, speeches: x.gsl + x.caucus, seconds: x.seconds };
  });
  const top = Math.max(1, ...rows.map((r) => r.points));
  const blend = c.rateSpeeches ? c.blend : 100;
  return rows.map((r) => {
    const share = Math.round((r.points / top) * 100);
    return { ...r, share, score: Math.round((share * blend + (r.quality ?? 0) * (100 - blend)) / 100) };
  }).sort((a, b) => b.score - a.score || b.points - a.points || a.name.localeCompare(b.name));
}

/** The chair's actions. Pure apart from timestamps: takes a state and returns the next one. */
export function apply(prev: LiveState, a: Action): LiveState {
  const s: LiveState = structuredClone(prev);
  if (a.type === 'eb_note') {
    const text = String((a as any).text ?? '').trim().slice(0, 1000);
    if (!text) throw bad('Write a note first');
    s.ebNotes = [...(s.ebNotes ?? []), { at: now(), by: String((a as any).by ?? 'Chair').slice(0, 60), text }].slice(-200);
    return s;
  }
  if (a.type.startsWith('eb_')) {
    applyMark(s, a as MarkAction);
    // Recognising a delegation in a caucus gives them the floor too.
    if (a.type === 'eb_recognise') {
      const seg = s.marking!.segments.find((x) => x.id === s.marking!.currentSegment);
      s.speakers.current = a.delegateId; s.speakers.queue = s.speakers.queue.filter((x) => x !== a.delegateId);
      if (a.startTimer !== false) startTimer(s, seg?.speakingSeconds ?? s.speakers.speakingTime, nameOf(s, a.delegateId));
      log(s, `${nameOf(s, a.delegateId)} recognised${seg ? ` (${seg.label})` : ''}`);
    }
    return s;
  }
  const out = step(s, a);
  follow(out, prev, a);
  return out;
}

function step(s: LiveState, a: Action): LiveState {
  switch (a.type) {
    case 'presence': {
      mustHave(s, a.delegateId);
      const d = s.delegates.find((x) => x.id === a.delegateId)!; d.presence = a.presence;
      if (a.presence === 'absent') { s.speakers.queue = s.speakers.queue.filter((x) => x !== d.id); }
      break;
    }
    case 'roll_call': {
      if (!a.on && s.mode === 'roll_call') for (const d of s.delegates) if (d.presence !== 'absent') stat(s, d.id).att++;
      s.mode = a.on ? 'roll_call' : 'idle'; if (!a.on) { const q = quorum(s); log(s, `Roll call: ${q.present} of ${q.total} present${q.debate ? ', quorum met' : ', no quorum'}`); }
      break;
    }
    case 'mark_all': for (const d of s.delegates) d.presence = a.presence; break;
    case 'add_delegate': {
      const name = String(a.name ?? '').trim();
      if (!name) throw bad('Enter a name');
      if (s.delegates.some((d) => d.name.toLowerCase() === name.toLowerCase())) throw conflict(`${name} is already in the room`);
      s.delegates.push({ id: rid(), name, code: a.code ? a.code.toLowerCase() : null, person: null, presence: 'absent' });
      s.delegates.sort((x, y) => x.name.localeCompare(y.name));
      break;
    }
    case 'remove_delegate':
      s.delegates = s.delegates.filter((d) => d.id !== a.delegateId);
      s.pending = (s.pending ?? []).filter((x) => x !== a.delegateId);
      if (s.speakers.current === a.delegateId) s.speakers.current = null;
      s.speakers.queue = s.speakers.queue.filter((x) => x !== a.delegateId);
      s.committee.veto = s.committee.veto.filter((x) => x !== a.delegateId);
      delete s.claims[a.delegateId];
      break;
    case 'set_veto': mustHave(s, a.delegateId); s.committee.veto = a.on ? [...new Set([...s.committee.veto, a.delegateId])] : s.committee.veto.filter((x) => x !== a.delegateId); break;
    case 'topic': s.topic = a.topic?.trim() || null; if (s.topic) log(s, `Agenda: ${s.topic}`); break;
    case 'speaker_add': {
      mustHave(s, a.delegateId);
      if (s.delegates.find((d) => d.id === a.delegateId)!.presence === 'absent') throw conflict(`${nameOf(s, a.delegateId)} is not marked present`);
      if (s.speakers.queue.includes(a.delegateId) || s.speakers.current === a.delegateId) throw conflict(`${nameOf(s, a.delegateId)} is already on the list`);
      s.speakers.queue.push(a.delegateId);
      s.speakers.requests = s.speakers.requests.filter((x) => x !== a.delegateId);
      break;
    }
    case 'speaker_remove': s.speakers.queue = s.speakers.queue.filter((x) => x !== a.delegateId); break;
    case 'speaker_next': {
      const next = s.speakers.queue.shift() ?? null;
      if (next) { giveFloor(s, next, s.speakers.speakingTime, 'speech', a.start !== false); log(s, `${nameOf(s, next)} has the floor`); }
      else { endSpeech(s); s.speakers.current = null; s.timer = { label: '', duration: 0, remaining: 0, startedAt: null }; if (s.mode === 'tour') s.mode = 'idle'; }
      break;
    }
    case 'speaker_move': {
      const q = s.speakers.queue.filter((x) => x !== a.delegateId);
      if (q.length === s.speakers.queue.length) throw notFound('Speaker');
      q.splice(Math.max(0, Math.min(q.length, Math.round(Number(a.to) || 0))), 0, a.delegateId);
      s.speakers.queue = q;
      break;
    }
    case 'speaker_end': endSpeech(s); s.speakers.current = null; s.timer = { label: '', duration: 0, remaining: 0, startedAt: null }; break;
    case 'yield': {
      const cur = s.speakers.current;
      if (!cur) throw conflict('Nobody has the floor');
      const left = remaining(s.timer);
      if (a.to === 'chair') { log(s, `${nameOf(s, cur)} yields to the chair`); return step(s, { type: 'speaker_end' }); }
      if (a.to === 'questions') { s.timer.label = `Questions to ${nameOf(s, cur)}`; log(s, `${nameOf(s, cur)} yields to questions`); break; }
      mustHave(s, a.to);
      if (a.to === cur) throw bad('Choose another delegation');
      log(s, `${nameOf(s, cur)} yields ${left}s to ${nameOf(s, a.to)}`);
      giveFloor(s, a.to, Math.max(1, left), 'yield', !!s.timer.startedAt);
      break;
    }
    case 'rtr': {
      mustHave(s, a.delegateId);
      const secs = Math.max(10, Math.min(300, Math.round(Number(a.seconds) || 30)));
      giveFloor(s, a.delegateId, secs, 'rtr', false, `Right of reply: ${nameOf(s, a.delegateId)}`);
      log(s, `Right of reply granted to ${nameOf(s, a.delegateId)}`);
      break;
    }
    case 'rate': {
      mustHave(s, a.delegateId);
      const n = Math.round(Number(a.stars));
      if (!(n >= 1 && n <= 5)) throw bad('Rate from 1 to 5 stars');
      stat(s, a.delegateId).ratings.push(n);
      break;
    }
    case 'settings': applySettings(s, a.patch); break;
    case 'seat_decide': {
      s.pending = (s.pending ?? []).filter((x) => x !== a.delegateId);
      if (!a.accept) delete s.claims[a.delegateId];
      break;
    }
    case 'doc_add': {
      if (!['wp', 'dr'].includes(a.kind)) throw bad('Working paper or draft resolution?');
      const title = str(a.title, 120); if (!title) throw bad('Give it a title');
      const c = cfg(s);
      const docs = (s.docs ??= []);
      const max = c.docs[a.kind].max;
      if (max != null && docs.filter((d) => d.kind === a.kind && d.status !== 'rejected').length >= max) throw conflict(`This committee takes at most ${max} ${max === 1 ? c.docs[a.kind].one : c.docs[a.kind].many}`);
      const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).map(String))].filter((id) => s.delegates.some((d) => d.id === id)).slice(0, 60);
      const by = a.by ?? 'chair';
      const sponsors = ids(a.sponsors); if (by !== 'chair' && !sponsors.includes(by)) sponsors.unshift(by);
      const link = str(a.link, 500) || null;
      if (link && !/^https:\/\//i.test(link)) throw bad('Links must start with https://');
      const d: Doc = { id: rid(), kind: a.kind, title, sponsors, signatories: ids(a.signatories).filter((x) => !sponsors.includes(x)), link, body: str(a.body, 20000) || null, status: by !== 'chair' && c.docs.approve ? 'pending' : 'open', by, at: now() };
      docs.push(d);
      if (d.status === 'open') creditDoc(s, d);
      log(s, `${docName(s, d.kind)} submitted: ${title}`);
      break;
    }
    case 'doc_status': {
      const d = (s.docs ?? []).find((x) => x.id === a.docId); if (!d) throw notFound('Document');
      if (!['pending', 'open', 'rejected', 'passed', 'failed'].includes(a.status)) throw bad('Unknown status');
      if (d.status === 'pending' && a.status === 'open') creditDoc(s, d);
      d.status = a.status; log(s, `${docName(s, d.kind)} ${d.title}: ${a.status === 'open' ? 'approved' : a.status}`);
      break;
    }
    case 'doc_vote': {
      const d = (s.docs ?? []).find((x) => x.id === a.docId); if (!d) throw notFound('Document');
      if (d.kind !== 'dr') throw bad(`Only a ${cfg(s).docs.dr.one} is voted on`);
      if (d.status !== 'open') throw conflict('That document is not open for a vote');
      const r = step(s, { type: 'vote_open', title: `${docName(s, 'dr')}: ${d.title}`, kind: 'substantive' });
      r.vote!.docId = d.id;
      return r;
    }
    case 'speaker_clear': s.speakers.queue = []; s.speakers.current = null; break;
    case 'speaking_time': if (!(a.seconds >= 10 && a.seconds <= 600)) throw bad('Speaking time must be between 10 seconds and 10 minutes'); s.speakers.speakingTime = Math.round(a.seconds); break;
    case 'request_decide':
      s.speakers.requests = s.speakers.requests.filter((x) => x !== a.delegateId);
      if (a.accept) return step(s, { type: 'speaker_add', delegateId: a.delegateId });
      break;
    case 'timer': {
      if (a.op === 'start') {
        if (a.seconds) startTimer(s, Math.max(1, Math.min(7200, Math.round(a.seconds))), a.label ?? s.timer.label);
        else if (!s.timer.startedAt && s.timer.remaining > 0) s.timer.startedAt = now();
      } else if (a.op === 'pause') { s.timer.remaining = remaining(s.timer); s.timer.startedAt = null; }
      else if (a.op === 'add') {
        const add = Math.max(-600, Math.min(600, Math.round(Number(a.seconds) || 15)));
        const left = remaining(s.timer);
        s.timer = { ...s.timer, duration: Math.max(1, s.timer.duration + add), remaining: Math.max(0, left + add), startedAt: s.timer.startedAt ? now() : null };
      }
      else s.timer = { ...s.timer, remaining: s.timer.duration, startedAt: null };
      break;
    }
    case 'motion_add': {
      const m = MOTION_TYPES[a.motionType];
      if (!m) throw bad('Choose a motion');
      const c = cfg(s);
      if (c.motions.some((x) => x.key === a.motionType && !x.on) || (a.motionType === 'custom' && !c.customMotion)) throw conflict(`This committee doesn't use ${motionLabel(s, a.motionType)}`);
      if (a.motionType === 'custom' && !String(a.topic ?? '').trim()) throw bad('Say what the motion is');
      if (m.needsDuration && !(Number(a.duration) > 0)) throw bad('Give the caucus a total time');
      if (m.needsSpeakingTime && a.motionType !== 'open_debate' && !(Number(a.speakingTime) > 0)) throw bad('Give a speaking time');
      if (a.proposer) mustHave(s, a.proposer);
      s.motions.push({ id: rid(), type: a.motionType, proposer: a.proposer ?? null, duration: a.duration ? Math.round(a.duration) : null, speakingTime: a.speakingTime ? Math.round(a.speakingTime) : null, topic: a.topic?.trim() || null, status: 'pending' });
      if (a.proposer) stat(s, a.proposer).raised++;
      break;
    }
    case 'motion_withdraw': { const m = s.motions.find((x) => x.id === a.motionId); if (!m) throw notFound('Motion'); m.status = 'withdrawn'; break; }
    case 'motion_vote': {
      const m = s.motions.find((x) => x.id === a.motionId);
      if (!m || m.status !== 'pending') throw conflict('That motion is not pending');
      if (s.vote?.open) throw conflict('Close the current vote first');
      s.vote = { id: rid(), title: `${motionLabel(s, m.type)}${m.topic && m.type === 'custom' ? `: ${m.topic}` : ''}${m.proposer ? ` (${nameOf(s, m.proposer)})` : ''}`, kind: 'procedural', rule: MOTION_TYPES[m.type].rule, motionId: m.id, ballots: {}, open: true, deviceVoting: false, result: null };
      s.mode = 'voting';
      break;
    }
    case 'vote_open': {
      if (s.vote?.open) throw conflict('Close the current vote first');
      if (!a.title?.trim()) throw bad('Say what is being voted on');
      if (a.kind === 'substantive' && !quorum(s).substantive) throw conflict('A substantive vote needs a majority of members present');
      const c = cfg(s);
      const rule = a.rule ?? (a.kind === 'substantive' ? c.threshold : 'simple');
      if (!['simple', 'two_thirds', 'security_council', 'consensus'].includes(rule)) throw bad('Unknown majority');
      s.vote = { id: rid(), title: a.title.trim(), kind: a.kind, rule, motionId: null, ballots: {}, open: true, deviceVoting: a.deviceVoting ?? c.voteMethod === 'devices', result: null, rights: [] };
      s.mode = 'voting';
      break;
    }
    case 'ballot': {
      if (!s.vote?.open) throw conflict('No vote is open');
      mustHave(s, a.delegateId);
      const d = s.delegates.find((x) => x.id === a.delegateId)!;
      if (d.presence === 'absent') throw conflict(`${d.name} is not present`);
      const c = cfg(s);
      if (a.ballot && !['for', 'against', 'abstain', 'pass'].includes(a.ballot)) throw bad('Unknown vote');
      if (a.ballot === 'abstain' && (s.vote.kind === 'procedural' || d.presence === 'present_voting' || !c.abstentions)) throw conflict(s.vote.kind === 'procedural' ? 'No abstentions on procedural votes' : !c.abstentions ? 'This committee does not allow abstentions' : `${d.name} is present and voting and cannot abstain`);
      if (a.ballot === 'pass' && (!c.allowPass || s.vote.kind === 'procedural')) throw conflict('Passing is not allowed in this vote');
      if (a.ballot) s.vote.ballots[a.delegateId] = a.ballot; else delete s.vote.ballots[a.delegateId];
      const rights = new Set(s.vote.rights ?? []);
      if (a.rights && c.withRights && (a.ballot === 'for' || a.ballot === 'against')) rights.add(a.delegateId); else rights.delete(a.delegateId);
      s.vote.rights = [...rights];
      break;
    }
    case 'vote_close': {
      const v = s.vote;
      if (!v?.open) throw conflict('No vote is open');
      v.open = false;
      v.result = tally(s, v);
      log(s, `${v.title}: ${v.result.passed ? 'passed' : v.result.vetoedBy.length ? `failed (veto: ${v.result.vetoedBy.join(', ')})` : 'failed'} (${v.result.for}–${v.result.against}–${v.result.abstain})`);
      if (v.docId) {
        const d = (s.docs ?? []).find((x) => x.id === v.docId);
        if (d) { d.status = v.result.passed ? 'passed' : 'failed'; if (v.result.passed) for (const id of d.sponsors) if (s.delegates.some((x) => x.id === id)) stat(s, id).drPassed++; }
      }
      if (v.motionId) {
        const m = s.motions.find((x) => x.id === v.motionId)!;
        m.status = v.result.passed ? 'passed' : 'failed';
        if (v.result.passed && m.proposer && s.delegates.some((x) => x.id === m.proposer)) stat(s, m.proposer).passed++;
        // The rest of the pending motions fall once one passes (most disruptive voted first by the chair).
        if (v.result.passed) {
          for (const o of s.motions) if (o.status === 'pending') o.status = 'withdrawn';
          if (m.type === 'moderated') { s.mode = 'moderated'; startTimer(s, m.duration!, `Moderated caucus${m.topic ? `: ${m.topic}` : ''}`); s.speakers.speakingTime = m.speakingTime ?? s.speakers.speakingTime; }
          else if (m.type === 'unmoderated') { s.mode = 'unmoderated'; startTimer(s, m.duration!, 'Unmoderated caucus'); }
          else if (m.type === 'consultation') { s.mode = 'consultation'; startTimer(s, m.duration!, `${motionLabel(s, m.type)}${m.topic ? `: ${m.topic}` : ''}`); }
          else if (m.type === 'tour_de_table') {
            // Every delegation present speaks once, in order.
            s.mode = 'tour'; endSpeech(s); s.speakers.current = null; s.timer = { label: '', duration: 0, remaining: 0, startedAt: null };
            s.speakers.queue = s.delegates.filter((d) => d.presence !== 'absent').map((d) => d.id);
            if (m.speakingTime) s.speakers.speakingTime = m.speakingTime;
          }
          else if (m.type === 'custom' && m.duration) { s.mode = 'idle'; startTimer(s, m.duration, m.topic ?? 'Custom motion'); }
          else if (m.type === 'open_debate') { s.mode = 'gsl'; if (m.speakingTime) s.speakers.speakingTime = m.speakingTime; }
          else if (m.type === 'speaking_time' && m.speakingTime) s.speakers.speakingTime = m.speakingTime;
          else if (m.type === 'set_agenda' && m.topic) s.topic = m.topic;
          else if (m.type === 'close_debate') { s.mode = 'voting'; s.speakers.queue = []; s.speakers.current = null; }
          else s.mode = 'idle';
        } else s.mode = s.speakers.queue.length ? 'gsl' : 'idle';
      }
      break;
    }
    case 'vote_clear': s.vote = null; if (s.mode === 'voting') s.mode = 'idle'; break;
    case 'mode': s.mode = a.mode; break;
    case 'amend_add': {
      if (!String(a.clause ?? '').trim() || !String(a.text ?? '').trim()) throw bad('Give the clause and the amendment text');
      if (!['friendly', 'unfriendly'].includes(a.kind)) throw bad('Friendly or unfriendly?');
      if (a.proposer) mustHave(s, a.proposer);
      // Friendly amendments have every sponsor's agreement and go straight in; unfriendly ones are voted on.
      (s.amendments ??= []).push({ id: rid(), draft: String(a.draft ?? '').trim() || 'Draft resolution', clause: a.clause.trim(), text: a.text.trim(), proposer: a.proposer ?? null, kind: a.kind, status: a.kind === 'friendly' ? 'incorporated' : 'pending', at: now() });
      log(s, `${a.kind === 'friendly' ? 'Friendly' : 'Unfriendly'} amendment to ${a.clause.trim()}${a.proposer ? ` by ${nameOf(s, a.proposer)}` : ''}`);
      break;
    }
    case 'amend_status': {
      const x = (s.amendments ?? []).find((y) => y.id === a.amendmentId); if (!x) throw notFound('Amendment');
      if (!['pending', 'passed', 'failed', 'incorporated', 'withdrawn'].includes(a.status)) throw bad('Unknown status');
      x.status = a.status; log(s, `Amendment to ${x.clause}: ${a.status}`);
      break;
    }
    default: throw bad('Unknown action');
  }
  return s;
}

// ---------- storage ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DB = () => {
  const d = platformDb();
  d.exec(`CREATE TABLE IF NOT EXISTS live_session (
    id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, chair_key_hash TEXT NOT NULL, name TEXT NOT NULL,
    workspace_id TEXT, event_id TEXT, committee_id TEXT, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT);
    CREATE TABLE IF NOT EXISTS live_chair (
      key_hash TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, last_seen TEXT);
    CREATE INDEX IF NOT EXISTS ix_live_chair_code ON live_chair(code);
    CREATE TABLE IF NOT EXISTS live_chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, sender TEXT NOT NULL, recipient TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_live_chat_code ON live_chat(code, id);`);
  return d;
};
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const ONLINE_MS = 15_000;

/** A new chair key for one EB member. Every member keeps their own key, so several can run the session together. */
function addChair(code: string, name: string) {
  const chairKey = crypto.randomBytes(24).toString('base64url');
  DB().prepare('INSERT INTO live_chair (key_hash, code, name, created_at) VALUES (?,?,?,?)').run(hash(chairKey), code.toUpperCase(), String(name || 'Chair').trim().slice(0, 60) || 'Chair', now());
  return chairKey;
}
/** Which EB member a key belongs to (sessions made before co-chairs keep their original key as "Chair"). */
function chairOf(row: any, chairKey?: string | null) {
  if (!chairKey) return null;
  const h = hash(chairKey);
  const c = DB().prepare('SELECT name FROM live_chair WHERE key_hash = ? AND code = ?').get(h, row.code) as any;
  if (c) return { name: c.name as string, hash: h };
  return h === row.chair_key_hash ? { name: 'Chair', hash: h } : null;
}

export function createSession(o: { name: string; short?: string; delegates: { name: string; code?: string | null; person?: string | null }[]; workspaceId?: string; eventId?: string; committeeId?: string; chairName?: string }) {
  const state = newState(o);
  const d = DB();
  let code = '';
  do code = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join(''); while (d.prepare('SELECT 1 FROM live_session WHERE code = ?').get(code));
  d.prepare('INSERT INTO live_session (id, code, chair_key_hash, name, workspace_id, event_id, committee_id, state, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)')
    .run(crypto.randomUUID(), code, hash(crypto.randomBytes(24).toString('base64url')), state.committee.name, o.workspaceId ?? null, o.eventId ?? null, o.committeeId ?? null, JSON.stringify(state), now(), now());
  return { code, chairKey: addChair(code, o.chairName ?? 'Chair') };
}
function load(code: string) {
  const row = DB().prepare('SELECT * FROM live_session WHERE code = ?').get(String(code ?? '').toUpperCase()) as any;
  if (!row) throw notFound('Session');
  return { row, state: JSON.parse(row.state) as LiveState };
}
/** Saves only if nobody else saved in between; returns false so the caller can re-apply on the fresh state. */
function save(code: string, state: LiveState, version?: number) {
  const r = version == null
    ? DB().prepare('UPDATE live_session SET state = ?, version = version + 1, updated_at = ? WHERE code = ?').run(JSON.stringify(state), now(), code.toUpperCase())
    : DB().prepare('UPDATE live_session SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?').run(JSON.stringify(state), now(), code.toUpperCase(), version);
  return Number(r.changes) === 1;
}
export function sessionsFor(workspaceId: string, eventId: string) {
  return (DB().prepare('SELECT code, name, committee_id, created_at, updated_at, ended_at FROM live_session WHERE workspace_id = ? AND event_id = ? ORDER BY created_at DESC').all(workspaceId, eventId) as any[]);
}
/** Staff open their committee's console without a key: each staff member gets their own key; nobody else is signed out. */
export function rotateChairKey(code: string, name = 'Chair') {
  load(code);
  return addChair(code, name);
}
/** A chair invites a co-chair (vice-chair, rapporteur): a key of their own, sent as a link. */
export function inviteCoChair(code: string, chairKey: string, name: string) {
  const { row } = load(code);
  if (!chairOf(row, chairKey)) throw forbidden('Only the chair can do that');
  if (row.ended_at) throw conflict('This session has ended');
  if (!String(name ?? '').trim()) throw bad('Enter the co-chair’s name or role');
  return { chairKey: addChair(code, name) };
}
export const sessionRow = (code: string) => load(code).row;

// Which delegations have the session open right now (their device polls with its seat), kept in memory.
const seen = new Map<string, Map<string, number>>();
function markSeen(code: string, state: LiveState, seat?: string | null) {
  const [id, tok] = String(seat ?? '').split('.');
  if (!id || !tok || !state.claims[id] || state.claims[id] !== hash(tok)) return null;
  const m = seen.get(code) ?? new Map(); m.set(id, Date.now()); seen.set(code, m);
  return id;
}
const onlineIds = (code: string) => [...(seen.get(code) ?? new Map()).entries()].filter(([, t]) => Date.now() - t < ONLINE_MS).map(([id]) => id);

/** What everyone sees. The EB also sees marks, notes, device claims, the ranking and who is online. */
export function view(code: string, o: { chairKey?: string; since?: number; seat?: string | null } = {}) {
  const { row, state } = load(code);
  const me = chairOf(row, o.chairKey);
  const seat = markSeen(row.code, state, o.seat);
  if (me) DB().prepare('UPDATE live_chair SET last_seen = ? WHERE key_hash = ?').run(now(), me.hash);
  if (o.since && o.since === row.version && !me) return { unchanged: true, version: row.version };
  const isChair = !!me;
  const { claims, marking, ebNotes, stats, pending, docs, settings: _s, ...pub } = state;
  const eb = isChair ? (DB().prepare('SELECT name, last_seen FROM live_chair WHERE code = ? ORDER BY created_at').all(row.code) as any[])
    .map((c) => ({ name: c.name, online: !!c.last_seen && Date.now() - new Date(c.last_seen).getTime() < ONLINE_MS })) : undefined;
  if (o.since && o.since === row.version) return { unchanged: true, version: row.version, eb, online: isChair ? onlineIds(row.code) : undefined };
  return {
    marking: isChair ? marking ?? null : undefined,
    marksheet: isChair ? marksheet(state) : undefined,
    recognition: isChair ? recognition(state, (t) => MOTION_TYPES[t]?.label ?? t) : undefined,
    ebNotes: isChair ? ebNotes ?? [] : undefined,
    eb, me: me?.name,
    code: row.code, version: row.version, isChair, ended: !!row.ended_at, ...pub,
    timer: { ...state.timer, remaining: remaining(state.timer) }, serverTime: now(), quorum: quorum(state),
    claimed: isChair ? Object.keys(claims) : undefined,
    pending: isChair ? pending ?? [] : undefined,
    online: isChair ? onlineIds(row.code) : undefined,
    ranking: isChair ? ranking(state) : undefined,
    waiting: seat ? (pending ?? []).includes(seat) : undefined,
    settings: cfg(state), motionOrder: motionOrder(state),
    motionLabels: Object.fromEntries(Object.keys(MOTION_TYPES).map((k) => [k, motionLabel(state, k)])),
    docs: (docs ?? []).filter((d) => isChair || ['open', 'passed', 'failed'].includes(d.status) || d.by === seat),
    linked: isChair ? !!row.event_id : undefined,
    tally: state.vote ? tally(state, state.vote) : null,
  };
}
/** Stamps which EB member made or changed each mark. */
function stampMarks(before: LiveState, after: LiveState, who: string) {
  const m0 = before.marking, m1 = after.marking;
  if (!m1) return;
  for (const k of ['speeches', 'pois', 'chits'] as const) {
    const old = new Map(((m0?.[k] ?? []) as any[]).map((x) => [x.id, JSON.stringify(x)]));
    for (const x of m1[k] as any[]) if (old.get(x.id) !== JSON.stringify(x)) x.markedBy = who;
  }
}
export function chairAction(code: string, chairKey: string, a: Action) {
  // Several EB members act at once: apply on the latest state and retry if someone saved in between.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { row, state } = load(code);
    const me = chairOf(row, chairKey);
    if (!me) throw forbidden('Only the chair can do that');
    if (row.ended_at) throw conflict('This session has ended');
    const next = apply(state, a.type === 'eb_note' ? { ...a, by: me.name } : a);
    if (a.type.startsWith('eb_')) stampMarks(state, next, me.name);
    if (save(code, next, row.version)) return view(code, { chairKey });
  }
  throw conflict('The session is busy; try again');
}
export function endSession(code: string, chairKey: string) {
  const { row } = load(code);
  if (!chairOf(row, chairKey)) throw forbidden('Only the chair can do that');
  DB().prepare('UPDATE live_session SET ended_at = ?, version = version + 1 WHERE code = ?').run(now(), code.toUpperCase());
}

/** Change the state safely while others change it too: re-read and retry if someone saved in between. */
function mutate<T>(code: string, fn: (state: LiveState, row: any) => T): T {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { row, state } = load(code);
    const out = fn(state, row);
    if (save(code, state, row.version)) return out;
  }
  throw conflict('The session is busy; try again');
}

// Delegates: claim a seat on this device, ask to speak, vote when the chair allows device voting.
export function claimSeat(code: string, delegateId: string) {
  return mutate(code, (state) => {
    mustHave(state, delegateId);
    if (state.claims[delegateId]) throw conflict('Someone has already joined as this delegation. Ask the chair to reset it.');
    const tok = crypto.randomBytes(18).toString('base64url');
    state.claims[delegateId] = hash(tok);
    // With "join without approval" off, the delegation waits until the chair lets them in.
    const waiting = !cfg(state).openJoin;
    if (waiting) state.pending = [...new Set([...(state.pending ?? []), delegateId])];
    return { seatToken: tok, waiting };
  });
}
export function releaseClaim(code: string, chairKey: string, delegateId: string) {
  mutate(code, (state, row) => {
    if (!chairOf(row, chairKey)) throw forbidden('Only the chair can do that');
    delete state.claims[delegateId];
    state.pending = (state.pending ?? []).filter((x) => x !== delegateId);
  });
}
function seatOwner(state: LiveState, delegateId: string, seatToken: string) {
  if (!state.claims[delegateId] || state.claims[delegateId] !== hash(seatToken ?? '')) throw forbidden('Join as your delegation first');
  if ((state.pending ?? []).includes(delegateId)) throw forbidden('The chair has not let you in yet');
}
/** During roll call, a delegation marks itself present (or present and voting) when the chair allows it. */
export function selfPresence(code: string, delegateId: string, seatToken: string, presence: Presence) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    if (!cfg(state).selfStatus) throw forbidden('The chair marks the roll call in this committee');
    if (state.mode !== 'roll_call') throw conflict('Roll call is not open');
    if (!['present', 'present_voting'].includes(presence)) throw bad('Present, or present and voting?');
    Object.assign(state, apply(state, { type: 'presence', delegateId, presence }));
  });
}
/** A delegation submits a working paper or draft resolution (the chair approves it first when set to). */
export function submitDoc(code: string, delegateId: string, seatToken: string, d: { kind: Doc['kind']; title: string; sponsors?: string[]; signatories?: string[]; link?: string | null; body?: string | null }) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    Object.assign(state, apply(state, { type: 'doc_add', kind: d.kind, title: d.title, sponsors: d.sponsors, signatories: d.signatories, link: d.link, body: d.body, by: delegateId }));
  });
}

// ---------- chat in the room: everyone, the chair, and delegation to delegation ----------
/** Who is talking: the chair (any EB key) or a delegation with its seat. */
export function chatter(code: string, chairKey?: string | null, seat?: string | null) {
  const { row, state } = load(code);
  if (chairOf(row, chairKey)) return { who: 'chair', state, row };
  const [id, tok] = String(seat ?? '').split('.');
  if (!id) throw forbidden('Join the session first');
  seatOwner(state, id, tok);
  return { who: id, state, row };
}
export function chatList(code: string, chairKey?: string | null, seat?: string | null, after = 0) {
  const { who, row } = chatter(code, chairKey, seat);
  const rows = DB().prepare(`SELECT id, sender, recipient, text, at FROM live_chat WHERE code = ? AND id > ? AND (recipient = 'all' OR sender = ? OR recipient = ?) ORDER BY id DESC LIMIT 300`).all(row.code, Number(after) || 0, who, who) as any[];
  return { me: who, messages: rows.reverse() };
}
export function chatSend(code: string, chairKey: string | null | undefined, seat: string | null | undefined, to: string, text: string) {
  const { who, state, row } = chatter(code, chairKey, seat);
  if (row.ended_at) throw conflict('This session has ended');
  if (who !== 'chair' && !cfg(state).chat) throw forbidden('The chair has turned chat off');
  const body = String(text ?? '').trim().slice(0, 1000);
  if (!body) throw bad('Write a message');
  const target = String(to ?? '');
  if (target !== 'all' && target !== 'chair' && !state.delegates.some((d) => d.id === target)) throw bad('Choose who to message');
  if (target === who) throw bad('Choose someone else');
  const r = DB().prepare('INSERT INTO live_chat (code, sender, recipient, text, at) VALUES (?,?,?,?,?)').run(row.code, who, target, body, now());
  return { id: Number(r.lastInsertRowid) };
}
export function requestToSpeak(code: string, delegateId: string, seatToken: string) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    if (!state.speakers.requests.includes(delegateId) && !state.speakers.queue.includes(delegateId)) state.speakers.requests.push(delegateId);
  });
}
export function deviceBallot(code: string, delegateId: string, seatToken: string, ballot: Ballot, rights = false) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    if (!state.vote?.open || !state.vote.deviceVoting) throw conflict('Voting on devices is not open');
    Object.assign(state, apply(state, { type: 'ballot', delegateId, ballot, rights }));
  });
}

/** The EB's marksheet as an Excel workbook (chair only). */
export async function exportMarks(code: string, chairKey: string) {
  const { row, state } = load(code);
  if (!chairOf(row, chairKey)) throw forbidden('Only the chair can do that');
  return { name: row.name as string, file: await marksheetXlsx(state, (t) => MOTION_TYPES[t]?.label ?? t) };
}

/** The marksheet for a session (chair only), for handing awards to the conference. */
export function sessionMarks(code: string) {
  const { row, state } = load(code);
  return { row, marksheet: marksheet(state), delegates: state.delegates };
}
