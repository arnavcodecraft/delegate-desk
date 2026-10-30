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
export type Ballot = 'for' | 'against' | 'abstain';
export interface Delegate { id: string; name: string; code: string | null; person: string | null; presence: Presence }
export interface Motion { id: string; type: string; proposer: string | null; duration: number | null; speakingTime: number | null; topic: string | null; status: 'pending' | 'passed' | 'failed' | 'withdrawn' }
export interface Vote {
  id: string; title: string; kind: 'procedural' | 'substantive'; rule: 'simple' | 'two_thirds' | 'security_council';
  motionId: string | null; ballots: Record<string, Ballot>; open: boolean; deviceVoting: boolean;
  result: null | { passed: boolean; for: number; against: number; abstain: number; needed: string; vetoedBy: string[] };
}
export interface LiveState {
  committee: { name: string; short: string; veto: string[] };
  delegates: Delegate[];
  mode: 'idle' | 'roll_call' | 'gsl' | 'moderated' | 'unmoderated' | 'voting';
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
}
export interface Amendment { id: string; draft: string; clause: string; text: string; proposer: string | null; kind: 'friendly' | 'unfriendly'; status: 'pending' | 'passed' | 'failed' | 'incorporated' | 'withdrawn'; at: string }

export const P5 = ['us', 'gb', 'fr', 'ru', 'cn'];
export const MOTION_TYPES: Record<string, { label: string; rule: 'simple' | 'two_thirds'; needsDuration: boolean; needsSpeakingTime: boolean }> = {
  open_debate: { label: 'Open debate (start the speakers list)', rule: 'simple', needsDuration: false, needsSpeakingTime: true },
  set_agenda: { label: 'Set the agenda', rule: 'simple', needsDuration: false, needsSpeakingTime: false },
  moderated: { label: 'Moderated caucus', rule: 'simple', needsDuration: true, needsSpeakingTime: true },
  unmoderated: { label: 'Unmoderated caucus', rule: 'simple', needsDuration: true, needsSpeakingTime: false },
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

/** Quorum: a third of members present to debate; a majority present for a substantive vote. */
export function quorum(s: LiveState) {
  const present = s.delegates.filter((d) => d.presence !== 'absent').length;
  const total = s.delegates.length;
  return { present, total, debate: present >= Math.ceil(total / 3), substantive: present > total / 2, presentVoting: s.delegates.filter((d) => d.presence === 'present_voting').length };
}

/** Count a vote. Abstentions do not count as votes cast; "present and voting" delegates may not abstain. */
export function tally(s: LiveState, v: Vote) {
  const counts = { for: 0, against: 0, abstain: 0 };
  for (const b of Object.values(v.ballots)) counts[b]++;
  const cast = counts.for + counts.against;
  let passed: boolean; let needed: string;
  const vetoedBy = v.rule === 'security_council' && v.kind === 'substantive' ? s.committee.veto.filter((id) => v.ballots[id] === 'against').map((id) => nameOf(s, id)) : [];
  if (v.rule === 'two_thirds') { passed = cast > 0 && counts.for * 3 >= cast * 2; needed = `two-thirds of votes cast (${Math.ceil((cast * 2) / 3)} of ${cast})`; }
  else if (v.rule === 'security_council') {
    // UN Charter art. 27: nine affirmative votes of fifteen (scaled to committee size), and no permanent-member veto on substance.
    const need = Math.ceil((s.delegates.length * 9) / 15);
    passed = counts.for >= need && vetoedBy.length === 0;
    needed = `${need} votes in favour${v.kind === 'substantive' ? ' and no veto' : ''}`;
  } else { passed = counts.for > counts.against; needed = `more votes for than against (${Math.floor(cast / 2) + 1} of ${cast})`; }
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
  | { type: 'speaker_next' }
  | { type: 'speaker_clear' }
  | { type: 'speaking_time'; seconds: number }
  | { type: 'request_decide'; delegateId: string; accept: boolean }
  | { type: 'timer'; op: 'start' | 'pause' | 'reset'; seconds?: number; label?: string }
  | { type: 'motion_add'; motionType: string; proposer?: string | null; duration?: number | null; speakingTime?: number | null; topic?: string | null }
  | { type: 'motion_withdraw'; motionId: string }
  | { type: 'motion_vote'; motionId: string }
  | { type: 'vote_open'; title: string; kind: 'procedural' | 'substantive'; rule: Vote['rule']; deviceVoting?: boolean }
  | { type: 'ballot'; delegateId: string; ballot: Ballot | null }
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
    case 'roll_call': s.mode = a.on ? 'roll_call' : 'idle'; if (!a.on) { const q = quorum(s); log(s, `Roll call: ${q.present} of ${q.total} present${q.debate ? ', quorum met' : ', no quorum'}`); } break;
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
      s.speakers.current = next;
      if (next) { startTimer(s, s.speakers.speakingTime, nameOf(s, next)); log(s, `${nameOf(s, next)} has the floor`); }
      else s.timer = { label: '', duration: 0, remaining: 0, startedAt: null };
      break;
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
      else s.timer = { ...s.timer, remaining: s.timer.duration, startedAt: null };
      break;
    }
    case 'motion_add': {
      const m = MOTION_TYPES[a.motionType];
      if (!m) throw bad('Choose a motion');
      if (m.needsDuration && !(Number(a.duration) > 0)) throw bad('Give the caucus a total time');
      if (m.needsSpeakingTime && a.motionType !== 'open_debate' && !(Number(a.speakingTime) > 0)) throw bad('Give a speaking time');
      if (a.proposer) mustHave(s, a.proposer);
      s.motions.push({ id: rid(), type: a.motionType, proposer: a.proposer ?? null, duration: a.duration ? Math.round(a.duration) : null, speakingTime: a.speakingTime ? Math.round(a.speakingTime) : null, topic: a.topic?.trim() || null, status: 'pending' });
      break;
    }
    case 'motion_withdraw': { const m = s.motions.find((x) => x.id === a.motionId); if (!m) throw notFound('Motion'); m.status = 'withdrawn'; break; }
    case 'motion_vote': {
      const m = s.motions.find((x) => x.id === a.motionId);
      if (!m || m.status !== 'pending') throw conflict('That motion is not pending');
      if (s.vote?.open) throw conflict('Close the current vote first');
      s.vote = { id: rid(), title: `${MOTION_TYPES[m.type].label}${m.proposer ? ` (${nameOf(s, m.proposer)})` : ''}`, kind: 'procedural', rule: MOTION_TYPES[m.type].rule, motionId: m.id, ballots: {}, open: true, deviceVoting: false, result: null };
      s.mode = 'voting';
      break;
    }
    case 'vote_open': {
      if (s.vote?.open) throw conflict('Close the current vote first');
      if (!a.title?.trim()) throw bad('Say what is being voted on');
      if (a.kind === 'substantive' && !quorum(s).substantive) throw conflict('A substantive vote needs a majority of members present');
      s.vote = { id: rid(), title: a.title.trim(), kind: a.kind, rule: a.rule, motionId: null, ballots: {}, open: true, deviceVoting: !!a.deviceVoting, result: null };
      s.mode = 'voting';
      break;
    }
    case 'ballot': {
      if (!s.vote?.open) throw conflict('No vote is open');
      mustHave(s, a.delegateId);
      const d = s.delegates.find((x) => x.id === a.delegateId)!;
      if (d.presence === 'absent') throw conflict(`${d.name} is not present`);
      if (a.ballot === 'abstain' && (s.vote.kind === 'procedural' || d.presence === 'present_voting')) throw conflict(s.vote.kind === 'procedural' ? 'No abstentions on procedural votes' : `${d.name} is present and voting and cannot abstain`);
      if (a.ballot) s.vote.ballots[a.delegateId] = a.ballot; else delete s.vote.ballots[a.delegateId];
      break;
    }
    case 'vote_close': {
      const v = s.vote;
      if (!v?.open) throw conflict('No vote is open');
      v.open = false;
      v.result = tally(s, v);
      log(s, `${v.title}: ${v.result.passed ? 'passed' : v.result.vetoedBy.length ? `failed (veto: ${v.result.vetoedBy.join(', ')})` : 'failed'} (${v.result.for}–${v.result.against}–${v.result.abstain})`);
      if (v.motionId) {
        const m = s.motions.find((x) => x.id === v.motionId)!;
        m.status = v.result.passed ? 'passed' : 'failed';
        // The rest of the pending motions fall once one passes (most disruptive voted first by the chair).
        if (v.result.passed) {
          for (const o of s.motions) if (o.status === 'pending') o.status = 'withdrawn';
          if (m.type === 'moderated') { s.mode = 'moderated'; startTimer(s, m.duration!, `Moderated caucus${m.topic ? `: ${m.topic}` : ''}`); s.speakers.speakingTime = m.speakingTime ?? s.speakers.speakingTime; }
          else if (m.type === 'unmoderated') { s.mode = 'unmoderated'; startTimer(s, m.duration!, 'Unmoderated caucus'); }
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
    CREATE INDEX IF NOT EXISTS ix_live_chair_code ON live_chair(code);`);
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

/** What everyone sees. The EB also sees marks, notes, device claims and which EB members are online. */
export function view(code: string, o: { chairKey?: string; since?: number } = {}) {
  const { row, state } = load(code);
  const me = chairOf(row, o.chairKey);
  if (me) DB().prepare('UPDATE live_chair SET last_seen = ? WHERE key_hash = ?').run(now(), me.hash);
  if (o.since && o.since === row.version && !me) return { unchanged: true, version: row.version };
  const isChair = !!me;
  const { claims, marking, ebNotes, ...pub } = state;
  const eb = isChair ? (DB().prepare('SELECT name, last_seen FROM live_chair WHERE code = ? ORDER BY created_at').all(row.code) as any[])
    .map((c) => ({ name: c.name, online: !!c.last_seen && Date.now() - new Date(c.last_seen).getTime() < ONLINE_MS })) : undefined;
  if (o.since && o.since === row.version) return { unchanged: true, version: row.version, eb };
  return {
    marking: isChair ? marking ?? null : undefined,
    marksheet: isChair ? marksheet(state) : undefined,
    recognition: isChair ? recognition(state, (t) => MOTION_TYPES[t]?.label ?? t) : undefined,
    ebNotes: isChair ? ebNotes ?? [] : undefined,
    eb, me: me?.name,
    code: row.code, version: row.version, isChair, ended: !!row.ended_at, ...pub,
    timer: { ...state.timer, remaining: remaining(state.timer) }, serverTime: now(), quorum: quorum(state),
    claimed: isChair ? Object.keys(claims) : undefined,
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
    return { seatToken: tok };
  });
}
export function releaseClaim(code: string, chairKey: string, delegateId: string) {
  mutate(code, (state, row) => {
    if (!chairOf(row, chairKey)) throw forbidden('Only the chair can do that');
    delete state.claims[delegateId];
  });
}
function seatOwner(state: LiveState, delegateId: string, seatToken: string) {
  if (!state.claims[delegateId] || state.claims[delegateId] !== hash(seatToken ?? '')) throw forbidden('Join as your delegation first');
}
export function requestToSpeak(code: string, delegateId: string, seatToken: string) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    if (!state.speakers.requests.includes(delegateId) && !state.speakers.queue.includes(delegateId)) state.speakers.requests.push(delegateId);
  });
}
export function deviceBallot(code: string, delegateId: string, seatToken: string, ballot: Ballot) {
  mutate(code, (state) => {
    seatOwner(state, delegateId, seatToken);
    if (!state.vote?.open || !state.vote.deviceVoting) throw conflict('Voting on devices is not open');
    Object.assign(state, apply(state, { type: 'ballot', delegateId, ballot }));
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
