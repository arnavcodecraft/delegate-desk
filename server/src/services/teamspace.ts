/**
 * Teamspace: the Microsoft Teams-style tools around the conference chat.
 *   Team channels   organisers set up channels (Logistics, Press, IT...) and choose who is in them
 *   Tasks           a Planner-style board: To do / Doing / Done, assignee, due date, priority, checklist, committee
 *   Schedule        the conference calendar, for everyone, for delegates, for the team or for one committee's EB
 *   Ask the EB      delegates ask their committee's EB questions, upvote each other's, and the EB answers (Teams Q&A)
 *   EB notebook     shared pages per committee for the EB (OneNote-style): agenda notes, moderated caucus topics, scores to check
 *   Activity        mentions, replies, announcements, answers and tasks assigned to you
 * Chairs only see their own committee. Delegates see the schedule, their committee's Q&A and their activity.
 */
import { all, one, run, insert } from '../db.ts';
import { bad, conflict, forbidden, notFound, now, uid } from '../util.ts';
import { rateLimit } from '../auth.ts';
import { announcements, delegateChannels, mayOpen, mentionsAndReplies, staffChannelKeys, type Viewer } from './chat.ts';

type Staff = Extract<Viewer, { kind: 'staff' }>;
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const committeeOf = (eventId: string, id: unknown) => {
  if (!id) return null;
  const c = one('SELECT id FROM committee WHERE id = ? AND event_id = ?', String(id), eventId);
  if (!c) throw bad('Choose a committee of this conference');
  return c.id as string;
};
const inScope = (v: Staff, committee: string | null) => !v.scope || (!!committee && v.scope.includes(committee));
const isoOrNull = (v: unknown, label: string) => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (isNaN(d.getTime())) throw bad(`Give a valid ${label}`);
  return d.toISOString();
};
function seatOf(reg: Record<string, any>) {
  return one('SELECT c.id, c.name, c.short FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE s.registration_id = ?', reg.id);
}

/** The conference team: everyone with a staff role, for assigning tasks and choosing channel members. */
export function people(eventId: string) {
  return all(`SELECT u.id, u.name, u.email, GROUP_CONCAT(DISTINCT ur.role) AS roles, GROUP_CONCAT(DISTINCT c.short) AS committees FROM user u JOIN user_role ur ON ur.user_id = u.id
    LEFT JOIN committee c ON c.id = ur.committee_id AND c.event_id = ? WHERE u.active = 1 AND ur.role NOT IN ('referrer', 'head_delegate') GROUP BY u.id ORDER BY u.name`, eventId)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, roles: String(u.roles ?? '').split(','), committees: u.committees ? String(u.committees).split(',') : [] }));
}

// ---------- team channels ----------
export function teamChannels(eventId: string) {
  return all('SELECT * FROM team_channel WHERE event_id = ? AND archived_at IS NULL ORDER BY name', eventId).map((t) => ({
    id: t.id, name: t.name, description: t.description, created_at: t.created_at,
    members: all('SELECT u.id, u.name FROM team_channel_member m JOIN user u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY u.name', t.id),
  }));
}
function setMembers(channelId: string, ids: unknown) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  for (const id of list) if (!one('SELECT 1 FROM user WHERE id = ? AND active = 1', id)) throw bad('Choose people from the conference team');
  run('DELETE FROM team_channel_member WHERE channel_id = ?', channelId);
  for (const id of list) run('INSERT INTO team_channel_member (channel_id, user_id) VALUES (?, ?)', channelId, id);
}
export function createTeamChannel(eventId: string, by: string, p: { name?: string; description?: string; members?: unknown }) {
  const name = str(p.name, 60);
  if (!name) throw bad('Name the channel');
  if (one('SELECT 1 FROM team_channel WHERE event_id = ? AND lower(name) = lower(?) AND archived_at IS NULL', eventId, name)) throw bad('There is already a channel with that name');
  const id = uid();
  insert('team_channel', { id, event_id: eventId, name, description: str(p.description, 200), created_by: by, created_at: now() });
  setMembers(id, [...new Set([by, ...((Array.isArray(p.members) ? p.members : []) as string[])])]);
  return id;
}
export function updateTeamChannel(eventId: string, id: string, p: { name?: string; description?: string; members?: unknown; archived?: boolean }) {
  const t = one('SELECT * FROM team_channel WHERE id = ? AND event_id = ?', id, eventId);
  if (!t) throw notFound('Channel');
  if (p.name !== undefined) { const name = str(p.name, 60); if (!name) throw bad('Name the channel'); run('UPDATE team_channel SET name = ? WHERE id = ?', name, id); }
  if (p.description !== undefined) run('UPDATE team_channel SET description = ? WHERE id = ?', str(p.description, 200), id);
  if (p.members !== undefined) setMembers(id, p.members);
  if (p.archived) run('UPDATE team_channel SET archived_at = ? WHERE id = ?', now(), id);
}

// ---------- tasks (Planner) ----------
const STATUSES = ['todo', 'doing', 'done'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const taskRow = (t: any) => ({ ...t, checklist: JSON.parse(t.checklist || '[]') as { text: string; done: boolean }[], assignee: t.assignee_id ? one('SELECT id, name FROM user WHERE id = ?', t.assignee_id) : null });
export function tasks(v: Staff) {
  const rows = all(`SELECT t.*, c.short AS committee FROM team_task t LEFT JOIN committee c ON c.id = t.committee_id WHERE t.event_id = ? ORDER BY t.status = 'done', t.due_at IS NULL, t.due_at,
    CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.created_at`, v.eventId);
  // A chair sees their committee's tasks and anything assigned to them.
  return rows.filter((t) => inScope(v, t.committee_id) || t.assignee_id === v.user.id).map(taskRow);
}
function cleanTask(v: Staff, p: any, cur?: any) {
  const committee = p.committee_id !== undefined ? committeeOf(v.eventId, p.committee_id) : cur?.committee_id ?? null;
  if (!inScope(v, committee)) throw forbidden(v.scope ? 'Add tasks for your own committee' : 'Choose a committee');
  const title = p.title !== undefined ? str(p.title, 160) : cur?.title;
  if (!title) throw bad('Give the task a title');
  const status = p.status !== undefined ? String(p.status) : cur?.status ?? 'todo';
  if (!STATUSES.includes(status)) throw bad('Unknown status');
  const priority = p.priority !== undefined ? String(p.priority) : cur?.priority ?? 'normal';
  if (!PRIORITIES.includes(priority)) throw bad('Unknown priority');
  const assignee = p.assignee_id !== undefined ? (p.assignee_id ? String(p.assignee_id) : null) : cur?.assignee_id ?? null;
  if (assignee && !one('SELECT 1 FROM user WHERE id = ? AND active = 1', assignee)) throw bad('Assign the task to someone in the team');
  const checklist = p.checklist !== undefined ? (Array.isArray(p.checklist) ? p.checklist : []).slice(0, 30).map((c: any) => ({ text: str(c?.text, 160), done: !!c?.done })).filter((c: any) => c.text) : JSON.parse(cur?.checklist ?? '[]');
  return {
    title, status, priority, committee_id: committee, assignee_id: assignee, checklist: JSON.stringify(checklist),
    notes: p.notes !== undefined ? str(p.notes, 4000) : cur?.notes ?? '',
    bucket: p.bucket !== undefined ? str(p.bucket, 40) || 'General' : cur?.bucket ?? 'General',
    due_at: p.due_at !== undefined ? isoOrNull(p.due_at, 'due date') : cur?.due_at ?? null,
  };
}
export function createTask(v: Staff, p: any) {
  const c = cleanTask(v, p);
  const id = uid();
  insert('team_task', { id, event_id: v.eventId, ...c, created_by: v.user.id, created_at: now(), updated_at: now(), done_at: c.status === 'done' ? now() : null });
  return taskRow(one('SELECT t.*, c.short AS committee FROM team_task t LEFT JOIN committee c ON c.id = t.committee_id WHERE t.id = ?', id));
}
function taskFor(v: Staff, id: string) {
  const t = one('SELECT * FROM team_task WHERE id = ? AND event_id = ?', id, v.eventId);
  if (!t || !(inScope(v, t.committee_id) || t.assignee_id === v.user.id)) throw notFound('Task');
  return t;
}
export function updateTask(v: Staff, id: string, p: any) {
  const cur = taskFor(v, id);
  // Someone a task is assigned to can always move it along, even outside their committee.
  const c = inScope(v, cur.committee_id) ? cleanTask(v, p, cur) : cleanTask({ ...v, scope: null }, { status: p.status, checklist: p.checklist }, cur);
  run(`UPDATE team_task SET title = ?, status = ?, priority = ?, committee_id = ?, assignee_id = ?, checklist = ?, notes = ?, bucket = ?, due_at = ?, updated_at = ?, done_at = ? WHERE id = ?`,
    c.title, c.status, c.priority, c.committee_id, c.assignee_id, c.checklist, c.notes, c.bucket, c.due_at, now(), c.status === 'done' ? cur.done_at ?? now() : null, id);
  return taskRow(one('SELECT t.*, c.short AS committee FROM team_task t LEFT JOIN committee c ON c.id = t.committee_id WHERE t.id = ?', id));
}
export function deleteTask(v: Staff, id: string) {
  const t = taskFor(v, id);
  if (!inScope(v, t.committee_id)) throw forbidden('Only the people running this task’s committee can delete it');
  run('DELETE FROM team_task WHERE id = ?', id);
}

// ---------- schedule (calendar) ----------
const KINDS = ['session', 'ceremony', 'break', 'social', 'deadline', 'meeting'];
const AUDIENCES = ['all', 'delegates', 'staff', 'eb'];
const scheduleSql = `SELECT s.*, c.name AS committee, c.short FROM schedule_item s LEFT JOIN committee c ON c.id = s.committee_id WHERE s.event_id = ?`;
/** What the team sees: everything (a chair: everything except other committees' EB items). */
const going = (items: any[], who: string) => items.map((s) => ({ ...s, going: one('SELECT COUNT(*) AS n FROM schedule_rsvp WHERE item_id = ?', s.id)?.n ?? 0, interested: !!one('SELECT 1 FROM schedule_rsvp WHERE item_id = ? AND who = ?', s.id, who) }));
export function staffSchedule(v: Staff) {
  return going(all(`${scheduleSql} ORDER BY s.starts_at`, v.eventId).filter((s) => !(s.audience === 'eb' && s.committee_id && !inScope(v, s.committee_id))), `u:${v.user.id}`);
}
/** What a delegate sees: items for everyone or delegates, for all committees or theirs. */
export function delegateSchedule(reg: Record<string, any>) {
  const seat = seatOf(reg);
  return going(all(`${scheduleSql} AND s.audience IN ('all', 'delegates') AND (s.committee_id IS NULL OR s.committee_id = ?) ORDER BY s.starts_at`, reg.event_id, seat?.id ?? ''), `d:${reg.id}`)
    .map((s) => ({ ...s, call_channel: s.call_channel && mayOpen({ kind: 'delegate', reg }, s.call_channel) ? s.call_channel : null }));
}
/** "Interested" on a schedule item (socials, ceremonies, workshops): toggles, and the team sees the count. */
export function rsvp(reg: Record<string, any>, id: string) {
  if (!delegateSchedule(reg).some((s) => s.id === id)) throw notFound('Schedule item');
  const who = `d:${reg.id}`;
  if (one('SELECT 1 FROM schedule_rsvp WHERE item_id = ? AND who = ?', id, who)) run('DELETE FROM schedule_rsvp WHERE item_id = ? AND who = ?', id, who);
  else run('INSERT INTO schedule_rsvp (item_id, who, created_at) VALUES (?, ?, ?)', id, who, now());
}
/** An online meeting's room: who can join is who can open this channel (the whole team, a committee, its EB, everyone...). */
function callChannel(eventId: string, v: unknown) {
  if (!v) return null;
  const c = String(v);
  if (c === 'staff' || c === 'all') return c;
  if (/^(c|eb):/.test(c)) { committeeOf(eventId, c.slice(c.indexOf(':') + 1)); return c; }
  if (c.startsWith('team:') && one('SELECT 1 FROM team_channel WHERE id = ? AND event_id = ?', c.slice(5), eventId)) return c;
  throw bad('Choose who can join the meeting');
}
function cleanItem(eventId: string, p: any, cur?: any) {
  const title = p.title !== undefined ? str(p.title, 140) : cur?.title;
  if (!title) throw bad('Give the item a title');
  const kind = p.kind !== undefined ? String(p.kind) : cur?.kind ?? 'session';
  if (!KINDS.includes(kind)) throw bad('Unknown kind of item');
  const audience = p.audience !== undefined ? String(p.audience) : cur?.audience ?? 'all';
  if (!AUDIENCES.includes(audience)) throw bad('Choose who sees it');
  const starts = p.starts_at !== undefined ? isoOrNull(p.starts_at, 'start time') : cur?.starts_at;
  if (!starts) throw bad('Give a start time');
  const ends = p.ends_at !== undefined ? isoOrNull(p.ends_at, 'end time') : cur?.ends_at ?? null;
  if (ends && ends < starts) throw bad('It has to end after it starts');
  return {
    title, kind, audience, starts_at: starts, ends_at: ends,
    committee_id: p.committee_id !== undefined ? committeeOf(eventId, p.committee_id) : cur?.committee_id ?? null,
    location: p.location !== undefined ? str(p.location, 120) : cur?.location ?? '',
    call_channel: p.call_channel !== undefined ? callChannel(eventId, p.call_channel) : cur?.call_channel ?? null,
    notes: p.notes !== undefined ? str(p.notes, 1000) : cur?.notes ?? '',
  };
}
export function addScheduleItem(eventId: string, p: any) {
  const id = uid();
  insert('schedule_item', { id, event_id: eventId, ...cleanItem(eventId, p), created_at: now(), updated_at: now() });
  return id;
}
export function updateScheduleItem(eventId: string, id: string, p: any) {
  const cur = one('SELECT * FROM schedule_item WHERE id = ? AND event_id = ?', id, eventId);
  if (!cur) throw notFound('Schedule item');
  const c = cleanItem(eventId, p, cur);
  run('UPDATE schedule_item SET title = ?, kind = ?, audience = ?, starts_at = ?, ends_at = ?, committee_id = ?, location = ?, notes = ?, call_channel = ?, updated_at = ? WHERE id = ?',
    c.title, c.kind, c.audience, c.starts_at, c.ends_at, c.committee_id, c.location, c.notes, c.call_channel, now(), id);
}
export function deleteScheduleItem(eventId: string, id: string) { run('DELETE FROM schedule_rsvp WHERE item_id = (SELECT id FROM schedule_item WHERE id = ? AND event_id = ?)', id, eventId); run('DELETE FROM schedule_item WHERE id = ? AND event_id = ?', id, eventId); }

// ---------- Ask the EB (Q&A) ----------
function questions(eventId: string, committee: string | null, meReg: string | null, staff: boolean) {
  const rows = all(`SELECT q.*, c.short, (SELECT COUNT(*) FROM qa_vote v WHERE v.question_id = q.id) AS votes, r.full_name,
      (SELECT p.name FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE s.registration_id = q.registration_id) AS portfolio,
      (SELECT name FROM user WHERE id = q.answered_by) AS answerer
    FROM qa_question q JOIN committee c ON c.id = q.committee_id JOIN registration r ON r.id = q.registration_id
    WHERE q.event_id = ? ${committee ? 'AND q.committee_id = ?' : ''} ${staff ? '' : 'AND q.hidden_at IS NULL'} ORDER BY q.answered_at IS NOT NULL, votes DESC, q.created_at`, ...[eventId, ...(committee ? [committee] : [])]);
  const mine = meReg ? new Set(all('SELECT question_id FROM qa_vote WHERE registration_id = ?', meReg).map((x) => x.question_id)) : new Set();
  return rows.map((q) => ({
    id: q.id, committee_id: q.committee_id, committee: q.short, body: q.body, votes: q.votes, voted: mine.has(q.id), anonymous: !!q.anonymous,
    // Delegates see an anonymous question without a name; the EB always sees who asked (so nobody can hide behind it).
    asker: staff || !q.anonymous ? `${q.portfolio ?? 'Delegate'} (${String(q.full_name).split(/\s+/)[0]})` : 'Anonymous delegate',
    mine: q.registration_id === meReg, answer: q.answer, answerer: q.answerer, answered_at: q.answered_at, hidden: !!q.hidden_at, created_at: q.created_at,
  }));
}
export function delegateQuestions(reg: Record<string, any>) {
  const seat = seatOf(reg);
  if (!seat) return { committee: null, questions: [] };
  return { committee: seat, questions: questions(reg.event_id, seat.id, reg.id, false) };
}
export function ask(reg: Record<string, any>, p: { body?: string; anonymous?: boolean }) {
  const seat = seatOf(reg);
  if (!seat) throw bad('You can ask your EB once you have a committee');
  const body = str(p.body, 600);
  if (body.length < 5) throw bad('Write your question');
  rateLimit(`qa:${reg.id}`, 10, 60 * 60_000);
  const id = uid();
  insert('qa_question', { id, event_id: reg.event_id, committee_id: seat.id, registration_id: reg.id, body, anonymous: p.anonymous ? 1 : 0, created_at: now() });
  return id;
}
export function upvote(reg: Record<string, any>, id: string) {
  const seat = seatOf(reg);
  const q = one('SELECT * FROM qa_question WHERE id = ? AND event_id = ? AND hidden_at IS NULL', id, reg.event_id);
  if (!q || q.committee_id !== seat?.id) throw notFound('Question');
  if (q.registration_id === reg.id) throw bad('You cannot upvote your own question');
  if (one('SELECT 1 FROM qa_vote WHERE question_id = ? AND registration_id = ?', id, reg.id)) run('DELETE FROM qa_vote WHERE question_id = ? AND registration_id = ?', id, reg.id);
  else run('INSERT INTO qa_vote (question_id, registration_id) VALUES (?, ?)', id, reg.id);
}
export const staffQuestions = (v: Staff, committee?: string | null) =>
  questions(v.eventId, committee || null, null, true).filter((q) => inScope(v, q.committee_id));
export function answer(v: Staff, id: string, p: { answer?: string; hidden?: boolean }) {
  const q = one('SELECT * FROM qa_question WHERE id = ? AND event_id = ?', id, v.eventId);
  if (!q || !inScope(v, q.committee_id)) throw notFound('Question');
  if (p.answer !== undefined) {
    const a = str(p.answer, 2000);
    run('UPDATE qa_question SET answer = ?, answered_by = ?, answered_at = ? WHERE id = ?', a || null, a ? v.user.id : null, a ? now() : null, id);
  }
  if (p.hidden !== undefined) run('UPDATE qa_question SET hidden_at = ? WHERE id = ?', p.hidden ? now() : null, id);
}

// ---------- EB notebook ----------
export function notes(v: Staff, committee: string) {
  if (!inScope(v, committeeOf(v.eventId, committee))) throw forbidden('You can only open your own committee’s notebook');
  return all('SELECT n.id, n.title, n.body, n.updated_at, n.created_at, u.name AS updated_by FROM committee_note n LEFT JOIN user u ON u.id = n.updated_by WHERE n.event_id = ? AND n.committee_id = ? ORDER BY n.created_at', v.eventId, committee);
}
export function saveNote(v: Staff, committee: string, p: { id?: string; title?: string; body?: string; updated_at?: string }) {
  if (!inScope(v, committeeOf(v.eventId, committee))) throw forbidden('You can only edit your own committee’s notebook');
  const title = str(p.title, 120) || 'Untitled page';
  const body = String(p.body ?? '').slice(0, 50_000);
  if (p.id) {
    const n = one('SELECT * FROM committee_note WHERE id = ? AND committee_id = ? AND event_id = ?', p.id, committee, v.eventId);
    if (!n) throw notFound('Page');
    // Two chairs editing the same page: refuse to overwrite a newer version without seeing it.
    if (p.updated_at && n.updated_at !== p.updated_at) throw conflict('Someone else saved this page since you opened it. Copy your changes, reload the page and add them again.');
    run('UPDATE committee_note SET title = ?, body = ?, updated_by = ?, updated_at = ? WHERE id = ?', title, body, v.user.id, now(), p.id);
    return p.id;
  }
  const id = uid();
  insert('committee_note', { id, event_id: v.eventId, committee_id: committee, title, body, updated_by: v.user.id, updated_at: now(), created_at: now() });
  return id;
}
export function deleteNote(v: Staff, committee: string, id: string) {
  if (!inScope(v, committeeOf(v.eventId, committee))) throw forbidden();
  run('DELETE FROM committee_note WHERE id = ? AND committee_id = ? AND event_id = ?', id, committee, v.eventId);
}

// ---------- activity ----------
const upcoming = (items: any[]) => { const t = now(); return items.filter((s) => (s.ends_at ?? s.starts_at) >= t).slice(0, 5); };
export function delegateActivity(reg: Record<string, any>) {
  const v: Viewer = { kind: 'delegate', reg };
  const chans = delegateChannels(reg);
  const seat = seatOf(reg);
  const answered = all('SELECT id, body, answer, answered_at FROM qa_question WHERE registration_id = ? AND answered_at IS NOT NULL ORDER BY answered_at DESC LIMIT 10', reg.id)
    .map((q) => ({ type: 'answer', id: q.id, body: q.answer, question: q.body, created_at: q.answered_at, sender_name: 'Your EB' }));
  const items = [
    ...mentionsAndReplies(v, chans),
    ...announcements(reg.event_id, chans.filter((c) => !c.startsWith('dm:'))).map((a) => ({ type: 'announcement', ...a })),
    ...answered,
  ].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 40);
  return { items, upcoming: upcoming(delegateSchedule(reg)), committee: seat };
}
export function staffActivity(v: Staff) {
  const chans = staffChannelKeys(v);
  const assigned = all("SELECT id, title, due_at, priority, status, created_by, updated_at FROM team_task WHERE event_id = ? AND assignee_id = ? AND status <> 'done' ORDER BY due_at IS NULL, due_at LIMIT 20", v.eventId, v.user.id);
  const open = staffQuestions(v).filter((q) => !q.answer && !q.hidden);
  const items = [
    ...mentionsAndReplies(v, chans),
    ...announcements(v.eventId, chans.filter((c) => c === 'all' || c.startsWith('c:') || c === 'staff')).map((a) => ({ type: 'announcement', ...a })),
  ].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 40);
  return { items, tasks: assigned, questions: open.slice(0, 10), openQuestions: open.length, upcoming: upcoming(staffSchedule(v)) };
}
