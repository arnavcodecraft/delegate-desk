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
}

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
  | { type: 'mode'; mode: LiveState['mode'] };

function remaining(t: LiveState['timer']) {
  if (!t.startedAt) return t.remaining;
  return Math.max(0, t.remaining - Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 1000));
}
function startTimer(s: LiveState, seconds: number, label: string) { s.timer = { label, duration: seconds, remaining: seconds, startedAt: now() }; }
const mustHave = (s: LiveState, id: string) => { if (!s.delegates.some((d) => d.id === id)) throw notFound('Delegation'); };

/** The chair's actions. Pure apart from timestamps: takes a state and returns the next one. */
export function apply(prev: LiveState, a: Action): LiveState {
  const s: LiveState = structuredClone(prev);
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
      if (a.accept) return apply(s, { type: 'speaker_add', delegateId: a.delegateId });
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
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, ended_at TEXT)`);
  return d;
};
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export function createSession(o: { name: string; short?: string; delegates: { name: string; code?: string | null; person?: string | null }[]; workspaceId?: string; eventId?: string; committeeId?: string }) {
  const state = newState(o);
  const d = DB();
  let code = '';
  do code = Array.from(crypto.randomBytes(6), (b) => CODE_CHARS[b % CODE_CHARS.length]).join(''); while (d.prepare('SELECT 1 FROM live_session WHERE code = ?').get(code));
  const chairKey = crypto.randomBytes(24).toString('base64url');
  d.prepare('INSERT INTO live_session (id, code, chair_key_hash, name, workspace_id, event_id, committee_id, state, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?)')
    .run(crypto.randomUUID(), code, hash(chairKey), state.committee.name, o.workspaceId ?? null, o.eventId ?? null, o.committeeId ?? null, JSON.stringify(state), now(), now());
  return { code, chairKey };
}
function load(code: string) {
  const row = DB().prepare('SELECT * FROM live_session WHERE code = ?').get(String(code ?? '').toUpperCase()) as any;
  if (!row) throw notFound('Session');
  return { row, state: JSON.parse(row.state) as LiveState };
}
function save(code: string, state: LiveState) {
  DB().prepare('UPDATE live_session SET state = ?, version = version + 1, updated_at = ? WHERE code = ?').run(JSON.stringify(state), now(), code.toUpperCase());
}
export function sessionsFor(workspaceId: string, eventId: string) {
  return (DB().prepare('SELECT code, name, committee_id, created_at, updated_at, ended_at FROM live_session WHERE workspace_id = ? AND event_id = ? ORDER BY created_at DESC').all(workspaceId, eventId) as any[]);
}
/** Staff open their own committee's console without the chair key; this hands it over (new key each time). */
export function rotateChairKey(code: string) {
  load(code);
  const chairKey = crypto.randomBytes(24).toString('base64url');
  DB().prepare('UPDATE live_session SET chair_key_hash = ? WHERE code = ?').run(hash(chairKey), code.toUpperCase());
  return chairKey;
}
export const sessionRow = (code: string) => load(code).row;

/** What everyone sees. The chair also sees device claims; nobody sees other devices' tokens. */
export function view(code: string, o: { chairKey?: string; since?: number } = {}) {
  const { row, state } = load(code);
  const isChair = !!o.chairKey && hash(o.chairKey) === row.chair_key_hash;
  if (o.since && o.since === row.version) return { unchanged: true, version: row.version };
  const { claims, ...pub } = state;
  return {
    code: row.code, version: row.version, isChair, ended: !!row.ended_at, ...pub,
    timer: { ...state.timer, remaining: remaining(state.timer) }, serverTime: now(), quorum: quorum(state),
    claimed: isChair ? Object.keys(claims) : undefined,
    tally: state.vote ? tally(state, state.vote) : null,
  };
}
export function chairAction(code: string, chairKey: string, a: Action) {
  const { row, state } = load(code);
  if (!chairKey || hash(chairKey) !== row.chair_key_hash) throw forbidden('Only the chair can do that');
  if (row.ended_at) throw conflict('This session has ended');
  save(code, apply(state, a));
  return view(code, { chairKey });
}
export function endSession(code: string, chairKey: string) {
  const { row } = load(code);
  if (hash(chairKey) !== row.chair_key_hash) throw forbidden('Only the chair can do that');
  DB().prepare('UPDATE live_session SET ended_at = ?, version = version + 1 WHERE code = ?').run(now(), code.toUpperCase());
}

// Delegates: claim a seat on this device, ask to speak, vote when the chair allows device voting.
export function claimSeat(code: string, delegateId: string) {
  const { state } = load(code);
  mustHave(state, delegateId);
  if (state.claims[delegateId]) throw conflict('Someone has already joined as this delegation. Ask the chair to reset it.');
  const tok = crypto.randomBytes(18).toString('base64url');
  state.claims[delegateId] = hash(tok);
  save(code, state);
  return { seatToken: tok };
}
export function releaseClaim(code: string, chairKey: string, delegateId: string) {
  const { row, state } = load(code);
  if (hash(chairKey) !== row.chair_key_hash) throw forbidden('Only the chair can do that');
  delete state.claims[delegateId];
  save(code, state);
}
function seatOwner(state: LiveState, delegateId: string, seatToken: string) {
  if (!state.claims[delegateId] || state.claims[delegateId] !== hash(seatToken ?? '')) throw forbidden('Join as your delegation first');
}
export function requestToSpeak(code: string, delegateId: string, seatToken: string) {
  const { state } = load(code);
  seatOwner(state, delegateId, seatToken);
  if (!state.speakers.requests.includes(delegateId) && !state.speakers.queue.includes(delegateId)) state.speakers.requests.push(delegateId);
  save(code, state);
}
export function deviceBallot(code: string, delegateId: string, seatToken: string, ballot: Ballot) {
  const { state } = load(code);
  seatOwner(state, delegateId, seatToken);
  if (!state.vote?.open || !state.vote.deviceVoting) throw conflict('Voting on devices is not open');
  save(code, apply(state, { type: 'ballot', delegateId, ballot }));
}
