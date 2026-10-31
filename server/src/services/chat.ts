/**
 * Conference chat, with Teams-style collaboration (threads, reactions, @mentions, pins, announcements, polls, edits, search).
 *
 * Channels, all inside one conference:
 *   all              every delegate of the conference (the "All committees" group)
 *   c:<committee id> the delegates of one committee and its EB
 *   dm:<a>|<b>       two delegates privately (registration ids, sorted)
 *   staff            the whole conference team (organisers, secretariat, EB)
 *   eb:<committee>   the EB of one committee, privately, with the secretariat
 *   team:<id>        a team channel the organisers set up (Logistics, Press, IT...) for the people they add
 * Delegates are named by their portfolio, as in committee ("France · DISEC"). Staff post as the secretariat or EB.
 * The team can remove public messages and sees reported private messages; it cannot read private chats otherwise.
 */
import { all, one, run, insert } from '../db.ts';
import { eventSettings } from '../settings.ts';
import { bad, conflict, forbidden, notFound, now, uid } from '../util.ts';
import { rateLimit } from '../auth.ts';
import { notifyStaff } from './notify.ts';

const MAX = 2000;
export const REACTIONS = ['👍', '❤️', '😂', '😮', '👏', '🙏', '✅'];
const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join('|')}`;

/** Who is looking: a delegate (by their registration) or a member of the conference team. */
export type Viewer =
  | { kind: 'delegate'; reg: Record<string, any> }
  | { kind: 'staff'; eventId: string; user: { id: string; name: string }; scope: string[] | null; admin: boolean; as?: string };
export const whoOf = (v: Viewer) => (v.kind === 'delegate' ? `d:${v.reg.id}` : `u:${v.user.id}`);
const eventOf = (v: Viewer) => (v.kind === 'delegate' ? v.reg.event_id : v.eventId);
const staffViewer = (eventId: string, scope: string[] | null, user?: { id: string; name: string }, as?: string): Viewer =>
  ({ kind: 'staff', eventId, user: user ?? { id: 'system', name: 'Team' }, scope, admin: !scope, as });

/** A delegate's seat and display name. */
export function identity(reg: Record<string, any>) {
  const seat = one(`SELECT p.name AS portfolio, c.id AS committee_id, c.short, c.name AS committee FROM seat s JOIN portfolio p ON p.id = s.portfolio_id
    JOIN committee c ON c.id = p.committee_id WHERE s.registration_id = ?`, reg.id);
  const first = String(reg.full_name ?? '').split(/\s+/)[0];
  return { seat, name: seat ? `${seat.portfolio} · ${seat.short} (${first})` : first };
}
function settingsFor(eventId: string) {
  const s = eventSettings(eventId).chat;
  if (!s.enabled) throw conflict('Chat is turned off for this conference');
  return s;
}
const blocked = (a: string, b: string) => !!one('SELECT 1 FROM chat_block WHERE (registration_id = ? AND blocked_id = ?) OR (registration_id = ? AND blocked_id = ?)', a, b, b, a);
const isTeamChannel = (ch: string) => ch === 'staff' || ch.startsWith('eb:') || ch.startsWith('team:');
const isGroup = (ch: string) => ch === 'all' || ch.startsWith('c:');

/** May this delegate read and write this channel? */
function delegateMay(reg: Record<string, any>, channel: string) {
  if (channel === 'all') return true;
  const { seat } = identity(reg);
  if (channel.startsWith('c:')) return !!seat && channel === `c:${seat.committee_id}`;
  if (channel.startsWith('dm:')) return channel.slice(3).split('|').includes(reg.id);
  return false;
}
/** May this member of the team open this channel? A chair only sees their own committee; team channels are for their members. */
function staffMay(v: Extract<Viewer, { kind: 'staff' }>, channel: string) {
  if (channel.startsWith('dm:')) return false;
  if (channel === 'staff') return true;
  if (channel.startsWith('team:')) return v.admin || !!one('SELECT 1 FROM team_channel_member WHERE channel_id = ? AND user_id = ?', channel.slice(5), v.user.id);
  if (!v.scope) return channel === 'all' || channel.startsWith('c:') || channel.startsWith('eb:');
  return (channel.startsWith('c:') && v.scope.includes(channel.slice(2))) || (channel.startsWith('eb:') && v.scope.includes(channel.slice(3)));
}
export function mayOpen(v: Viewer, channel: string) {
  if (v.kind === 'delegate') { if (isTeamChannel(channel)) return false; return delegateMay(v.reg, channel); }
  return staffMay(v, channel);
}
export function assertOpen(v: Viewer, channel: string) {
  if (v.kind === 'delegate') settingsFor(v.reg.event_id);
  if (!mayOpen(v, channel)) {
    if (v.kind === 'staff') throw forbidden(channel.startsWith('dm:') ? 'Private chats are only visible when reported' : channel.startsWith('team:') ? 'Only members of this team channel can open it' : 'You can only see your own committee’s group');
    throw forbidden('You are not in this chat');
  }
}
/** Moderators of a channel: the team in groups and team channels; both people in a private chat (for pins). */
const moderates = (v: Viewer, channel: string) => (v.kind === 'staff' ? staffMay(v, channel) : channel.startsWith('dm:') && delegateMay(v.reg, channel));

const touch = (id: string) => run('UPDATE chat_message SET updated_at = ? WHERE id = ?', now(), id);
const COLS = `id, channel, parent_id, kind, title, poll, mentions, sender_kind, sender_id, sender_name, CASE WHEN deleted_at IS NULL THEN body ELSE '' END AS body,
  created_at, edited_at, pinned_at, COALESCE(updated_at, created_at) AS rev, deleted_at IS NOT NULL AS deleted`;

/** Reactions, poll results, reply counts and the viewer's own choices, added to a page of messages. */
function enrich(rows: any[], who: string) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const reacts = all(`SELECT message_id, emoji, COUNT(*) AS n, MAX(who = ?) AS mine FROM chat_reaction WHERE message_id IN (${marks}) GROUP BY message_id, emoji`, who, ...ids);
  const replies = all(`SELECT parent_id, COUNT(*) AS n, MAX(created_at) AS last FROM chat_message WHERE parent_id IN (${marks}) AND deleted_at IS NULL GROUP BY parent_id`, ...ids);
  const votes = all(`SELECT message_id, option, COUNT(*) AS n FROM chat_vote WHERE message_id IN (${marks}) GROUP BY message_id, option`, ...ids);
  const myVotes = all(`SELECT message_id, option FROM chat_vote WHERE who = ? AND message_id IN (${marks})`, who, ...ids);
  const roleCache = new Map<string, string>();
  return rows.map((r) => {
    const poll = r.poll ? JSON.parse(r.poll) : null;
    if (r.sender_kind === 'staff' && !roleCache.has(r.sender_id)) roleCache.set(r.sender_id, staffTag(r.sender_id));
    const rep = replies.find((x) => x.parent_id === r.id);
    return {
      ...r, deleted: !!r.deleted, mentions: JSON.parse(r.mentions || '[]'), tag: r.sender_kind === 'staff' ? roleCache.get(r.sender_id) : 'Delegate',
      reactions: reacts.filter((x) => x.message_id === r.id).map((x) => ({ emoji: x.emoji, count: x.n, mine: !!x.mine })),
      replies: rep?.n ?? 0, last_reply_at: rep?.last ?? null,
      poll: poll && !r.deleted ? { ...poll, counts: poll.options.map((_: string, i: number) => votes.find((x) => x.message_id === r.id && x.option === i)?.n ?? 0), mine: myVotes.find((x) => x.message_id === r.id)?.option ?? null } : null,
    };
  });
}

/** Read a channel: the newest messages (not thread replies), or only what changed since `since`, or one thread, or a search. */
export function read(v: Viewer, channel: string, o: { since?: string | null; thread?: string | null; q?: string | null } = {}) {
  assertOpen(v, channel);
  const ev = eventOf(v);
  let rows: any[];
  if (o.q) {
    const q = `%${String(o.q).trim().slice(0, 80).replace(/[%_]/g, '')}%`;
    rows = all(`SELECT ${COLS} FROM chat_message WHERE event_id = ? AND channel = ? AND deleted_at IS NULL AND (body LIKE ? OR title LIKE ? OR sender_name LIKE ?) ORDER BY created_at DESC LIMIT 50`, ev, channel, q, q, q).reverse();
  } else if (o.thread) {
    rows = all(`SELECT ${COLS} FROM chat_message WHERE event_id = ? AND channel = ? AND (id = ? OR parent_id = ?) ${o.since ? 'AND COALESCE(updated_at, created_at) > ?' : ''} ORDER BY created_at LIMIT 300`,
      ...[ev, channel, o.thread, o.thread, ...(o.since ? [o.since] : [])]);
  } else {
    rows = all(`SELECT ${COLS} FROM chat_message WHERE event_id = ? AND channel = ? AND parent_id IS NULL ${o.since ? 'AND COALESCE(updated_at, created_at) > ?' : ''} ORDER BY created_at DESC LIMIT 150`,
      ...[ev, channel, ...(o.since ? [o.since] : [])]).reverse();
  }
  return enrich(rows, whoOf(v));
}
export function pins(v: Viewer, channel: string) {
  assertOpen(v, channel);
  return enrich(all(`SELECT ${COLS} FROM chat_message WHERE event_id = ? AND channel = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL ORDER BY pinned_at DESC LIMIT 20`, eventOf(v), channel), whoOf(v));
}

/** People who can be @mentioned in a channel. */
export function members(v: Viewer, channel: string): { id: string; name: string; kind: 'delegate' | 'staff' }[] {
  assertOpen(v, channel);
  const ev = eventOf(v);
  const delegates = (committee?: string) => all(`SELECT r.id, r.full_name, p.name AS portfolio, c.short FROM registration r JOIN seat s ON s.registration_id = r.id JOIN portfolio p ON p.id = s.portfolio_id
    JOIN committee c ON c.id = p.committee_id WHERE r.event_id = ? AND r.cancelled_at IS NULL AND r.erased_at IS NULL ${committee ? 'AND c.id = ?' : ''} ORDER BY c.sort, p.sort, p.name`, ...[ev, ...(committee ? [committee] : [])])
    .map((r) => ({ id: `d:${r.id}`, name: `${r.portfolio} · ${r.short} (${String(r.full_name).split(/\s+/)[0]})`, kind: 'delegate' as const }));
  const users = (sql: string, ...args: unknown[]) => all(`SELECT DISTINCT u.id, u.name FROM user u JOIN user_role ur ON ur.user_id = u.id WHERE u.active = 1 AND ${sql} ORDER BY u.name`, ...args)
    .map((u) => ({ id: `u:${u.id}`, name: u.name, kind: 'staff' as const }));
  const chairs = (cid: string) => users("ur.role = 'chair' AND ur.committee_id = ?", cid);
  if (channel === 'all') return delegates();
  if (channel.startsWith('c:')) return [...chairs(channel.slice(2)), ...delegates(channel.slice(2))];
  if (channel.startsWith('dm:')) return channel.slice(3).split('|').map((id) => one('SELECT * FROM registration WHERE id = ?', id)).filter(Boolean).map((r) => ({ id: `d:${r!.id}`, name: identity(r!).name, kind: 'delegate' as const }));
  if (channel === 'staff') return users("ur.role NOT IN ('referrer', 'head_delegate')");
  if (channel.startsWith('eb:')) return [...chairs(channel.slice(3)), ...users("ur.role IN ('admin', 'superadmin', 'secretariat')")].filter((u, i, a) => a.findIndex((x) => x.id === u.id) === i);
  if (channel.startsWith('team:')) return all('SELECT u.id, u.name FROM team_channel_member m JOIN user u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY u.name', channel.slice(5)).map((u) => ({ id: `u:${u.id}`, name: u.name, kind: 'staff' as const }));
  return [];
}

export interface PostInput { channel?: string; to?: string; body?: string; parent?: string | null; kind?: string; title?: string; poll?: { options?: unknown[] } | null; mentions?: { id: string; name: string }[] }

/** Post a message, a reply in a thread, an announcement or a poll. */
export function post(v: Viewer, o: PostInput) {
  const ev = eventOf(v);
  const body = String(o.body ?? '').trim();
  const kind = o.kind === 'announcement' || o.kind === 'poll' ? o.kind : 'message';
  if (!body) throw bad(kind === 'poll' ? 'Write the question first' : 'Write a message first');
  if (body.length > MAX) throw bad(`Messages can be up to ${MAX} characters`);
  let channel = String(o.channel ?? '');
  if (v.kind === 'delegate') {
    const s = settingsFor(ev);
    rateLimit(`chat:${v.reg.id}`, 20, 60_000);
    if (o.to) {
      if (!s.dms) throw conflict('Private messages are turned off for this conference');
      const other = one('SELECT * FROM registration WHERE id = ? AND event_id = ? AND cancelled_at IS NULL', String(o.to), ev);
      if (!other || other.id === v.reg.id) throw notFound('Delegate');
      channel = dmChannel(v.reg.id, other.id);
    }
    if (channel.startsWith('dm:')) {
      if (!s.dms) throw conflict('Private messages are turned off for this conference');
      const other = channel.slice(3).split('|').find((x) => x !== v.reg.id)!;
      if (blocked(v.reg.id, other)) throw forbidden('You cannot message this delegate');
    }
    if (kind !== 'message') throw forbidden('Only the conference team and EB post announcements and polls');
  } else {
    rateLimit(`chat:u:${v.user.id}`, 40, 60_000);
  }
  if (!mayOpen(v, channel)) throw forbidden(v.kind === 'staff' ? 'You cannot post here' : 'You are not in this chat');
  if (v.kind === 'delegate') {
    const slow = slowSeconds(ev, channel);
    const last = slow ? one("SELECT MAX(created_at) AS t FROM chat_message WHERE event_id = ? AND channel = ? AND sender_kind = 'delegate' AND sender_id = ?", ev, channel, v.reg.id)?.t : null;
    if (last) { const wait = Math.ceil(slow - (Date.now() - new Date(last).getTime()) / 1000); if (wait > 0) throw conflict(`Slow mode is on: you can send another message in ${wait} s`); }
  }
  let parent: any = null;
  if (o.parent) {
    parent = one('SELECT * FROM chat_message WHERE id = ? AND event_id = ? AND channel = ?', String(o.parent), ev, channel);
    if (!parent || parent.deleted_at) throw notFound('Message');
    if (parent.parent_id) parent = one('SELECT * FROM chat_message WHERE id = ?', parent.parent_id);   // replies stay one level deep
  }
  if (kind !== 'message' && (channel.startsWith('dm:') || parent)) throw bad('Announcements and polls go in a group or team channel');
  let poll: string | null = null;
  if (kind === 'poll') {
    const opts = (Array.isArray(o.poll?.options) ? o.poll!.options : []).map((x) => String(x ?? '').trim().slice(0, 80)).filter(Boolean);
    if (opts.length < 2 || opts.length > 6) throw bad('Give between 2 and 6 options');
    if (new Set(opts.map((x) => x.toLowerCase())).size !== opts.length) throw bad('Each option must be different');
    poll = JSON.stringify({ options: opts, closed: false });
  }
  const title = kind === 'announcement' ? String(o.title ?? '').trim().slice(0, 120) || null : null;
  // Only people who can actually see the channel can be mentioned (and only if their name is in the message).
  const allowed = Array.isArray(o.mentions) && o.mentions.length ? new Map(members(v, channel).map((m) => [m.id, m.name])) : new Map();
  const mentions = (o.mentions ?? []).filter((m) => allowed.has(m?.id) && body.includes(`@${allowed.get(m.id)}`)).slice(0, 20).map((m) => ({ id: m.id, name: allowed.get(m.id) }));
  const id = uid();
  const t = now();
  const sender = v.kind === 'delegate' ? { sender_kind: 'delegate', sender_id: v.reg.id, sender_name: identity(v.reg).name }
    : { sender_kind: 'staff', sender_id: v.user.id, sender_name: isTeamChannel(channel) ? v.user.name : `${v.as ?? (v.scope ? 'EB' : 'Secretariat')} (${v.user.name.split(/\s+/)[0]})` };
  insert('chat_message', { id, event_id: ev, channel, ...sender, body, created_at: t, updated_at: t, parent_id: parent?.id ?? null, kind, title, poll, mentions: JSON.stringify(mentions) });
  if (parent) touch(parent.id);
  return { id, channel };
}

function ownMessage(v: Viewer, id: string) {
  const m = one('SELECT * FROM chat_message WHERE id = ? AND event_id = ?', id, eventOf(v));
  if (!m || !mayOpen(v, m.channel)) throw notFound('Message');
  return m;
}
export function react(v: Viewer, id: string, emoji: string) {
  const m = ownMessage(v, id);
  if (m.deleted_at) throw bad('That message was removed');
  if (!REACTIONS.includes(emoji)) throw bad('Choose one of the reactions');
  const who = whoOf(v);
  if (one('SELECT 1 FROM chat_reaction WHERE message_id = ? AND who = ? AND emoji = ?', id, who, emoji)) run('DELETE FROM chat_reaction WHERE message_id = ? AND who = ? AND emoji = ?', id, who, emoji);
  else run('INSERT INTO chat_reaction (message_id, who, emoji, created_at) VALUES (?, ?, ?, ?)', id, who, emoji, now());
  touch(id);
}
export function vote(v: Viewer, id: string, option: number) {
  const m = ownMessage(v, id);
  if (m.kind !== 'poll' || !m.poll || m.deleted_at) throw notFound('Poll');
  const poll = JSON.parse(m.poll);
  if (poll.closed) throw conflict('This poll is closed');
  if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) throw bad('Choose an option');
  run('INSERT INTO chat_vote (message_id, who, option, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(message_id, who) DO UPDATE SET option = excluded.option, created_at = excluded.created_at', id, whoOf(v), option, now());
  touch(id);
}
export function closePoll(v: Viewer, id: string) {
  const m = ownMessage(v, id);
  if (m.kind !== 'poll') throw notFound('Poll');
  if (!(v.kind === 'staff' && (m.sender_id === v.user.id || moderates(v, m.channel)))) throw forbidden('Only the team can close a poll');
  run('UPDATE chat_message SET poll = ? WHERE id = ?', JSON.stringify({ ...JSON.parse(m.poll), closed: true }), id);
  touch(id);
}
export function pin(v: Viewer, id: string, on: boolean) {
  const m = ownMessage(v, id);
  if (!moderates(v, m.channel)) throw forbidden('Only the conference team and EB pin messages here');
  if (m.parent_id) throw bad('Pin the first message of the thread');
  run('UPDATE chat_message SET pinned_at = ? WHERE id = ?', on ? now() : null, id);
  touch(id);
}
const mine = (v: Viewer, m: any) => (v.kind === 'delegate' ? m.sender_kind === 'delegate' && m.sender_id === v.reg.id : m.sender_kind === 'staff' && m.sender_id === v.user.id);
export function edit(v: Viewer, id: string, body: string) {
  const m = ownMessage(v, id);
  if (!mine(v, m) || m.deleted_at) throw forbidden('You can only edit your own messages');
  const text = String(body ?? '').trim();
  if (!text) throw bad('Write a message first');
  if (text.length > MAX) throw bad(`Messages can be up to ${MAX} characters`);
  run('UPDATE chat_message SET body = ?, edited_at = ? WHERE id = ?', text, now(), id);
  touch(id);
}
export function deleteOwn(v: Viewer, id: string) {
  const m = ownMessage(v, id);
  if (!mine(v, m)) throw forbidden('You can only delete your own messages');
  run('UPDATE chat_message SET deleted_at = ?, deleted_by = ?, pinned_at = NULL WHERE id = ?', now(), whoOf(v), id);
  touch(id);
  if (m.parent_id) touch(m.parent_id);
}

/** Mentions of the viewer and replies to their messages, newest first (for the Activity feed). */
export function mentionsAndReplies(v: Viewer, channels: string[]) {
  if (!channels.length) return [];
  const who = whoOf(v);
  const meId = v.kind === 'delegate' ? v.reg.id : v.user.id;
  const kind = v.kind === 'delegate' ? 'delegate' : 'staff';
  const marks = channels.map(() => '?').join(',');
  const mentioned = all(`SELECT id, channel, parent_id, sender_name, body, created_at FROM chat_message WHERE event_id = ? AND channel IN (${marks}) AND deleted_at IS NULL AND mentions LIKE ? AND NOT (sender_kind = ? AND sender_id = ?) ORDER BY created_at DESC LIMIT 30`,
    eventOf(v), ...channels, `%"${who}"%`, kind, meId).map((m) => ({ type: 'mention', ...m }));
  const replies = all(`SELECT r.id, r.channel, r.parent_id, r.sender_name, r.body, r.created_at FROM chat_message r JOIN chat_message p ON p.id = r.parent_id
    WHERE r.event_id = ? AND r.channel IN (${marks}) AND r.deleted_at IS NULL AND p.sender_kind = ? AND p.sender_id = ? AND NOT (r.sender_kind = ? AND r.sender_id = ?) ORDER BY r.created_at DESC LIMIT 30`,
    eventOf(v), ...channels, kind, meId, kind, meId).map((m) => ({ type: 'reply', ...m }));
  const seen = new Set<string>();
  return [...mentioned, ...replies].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
export const announcements = (eventId: string, channels: string[]) => !channels.length ? [] : all(`SELECT id, channel, title, sender_name, body, created_at FROM chat_message WHERE event_id = ? AND channel IN (${channels.map(() => '?').join(',')}) AND kind = 'announcement' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20`, eventId, ...channels);

// ---------- delegates (their delegate link is their sign-in) ----------
/** The channels a delegate can see, with the newest message time in each (the page works out unread counts). */
export function delegateInbox(reg: Record<string, any>) {
  const s = settingsFor(reg.event_id);
  const { seat, name } = identity(reg);
  const latest = (ch: string) => one('SELECT MAX(COALESCE(updated_at, created_at)) AS t FROM chat_message WHERE event_id = ? AND channel = ?', reg.event_id, ch)?.t ?? null;
  const channels: { key: string; label: string; kind: string; latest: string | null; with?: string; mention?: string | null }[] = [{ key: 'all', label: 'All committees', kind: 'group', latest: latest('all') }];
  if (seat) channels.push({ key: `c:${seat.committee_id}`, label: seat.committee, kind: 'group', latest: latest(`c:${seat.committee_id}`) });
  if (s.dms) {
    const dms = all(`SELECT channel, MAX(COALESCE(updated_at, created_at)) AS t FROM chat_message WHERE event_id = ? AND channel LIKE 'dm:%' AND instr(channel, ?) > 0 GROUP BY channel ORDER BY t DESC`, reg.event_id, reg.id);
    for (const d of dms) {
      const other = String(d.channel).slice(3).split('|').find((x) => x !== reg.id);
      const r = other ? one('SELECT * FROM registration WHERE id = ? AND cancelled_at IS NULL', other) : null;
      if (r) channels.push({ key: d.channel, label: identity(r).name, kind: 'dm', latest: d.t, with: r.id });
    }
  }
  for (const c of channels) c.mention = lastMention(reg.event_id, c.key, `d:${reg.id}`);
  return { me: { id: reg.id, who: `d:${reg.id}`, name, status: statusOf(reg.event_id, `d:${reg.id}`) }, committee: seat ? { id: seat.committee_id, name: seat.committee, short: seat.short } : null, dms: s.dms, calls: s.calls !== false, dmCalls: !!s.dmCalls, channels, reactions: REACTIONS, blocked: all('SELECT blocked_id FROM chat_block WHERE registration_id = ?', reg.id).map((b) => b.blocked_id) };
}

/** Delegates someone can start a private chat with: everyone seated at the conference, listed by committee and portfolio. */
export function directory(reg: Record<string, any>) {
  if (!settingsFor(reg.event_id).dms) throw conflict('Private messages are turned off for this conference');
  return all(`SELECT r.id, r.full_name, p.name AS portfolio, c.short FROM registration r JOIN seat s ON s.registration_id = r.id JOIN portfolio p ON p.id = s.portfolio_id
    JOIN committee c ON c.id = p.committee_id WHERE r.event_id = ? AND r.id <> ? AND r.cancelled_at IS NULL AND r.erased_at IS NULL ORDER BY c.sort, p.sort, p.name`, reg.event_id, reg.id)
    .map((r) => ({ id: r.id, name: `${r.portfolio} · ${r.short} (${String(r.full_name).split(/\s+/)[0]})`, committee: r.short }));
}
export const delegateRead = (reg: Record<string, any>, channel: string, since?: string | null) => read({ kind: 'delegate', reg }, channel, { since });
/** A delegate posts; a private chat with a delegate they have not chatted with yet is opened by passing `to`. */
export const delegatePost = (reg: Record<string, any>, o: PostInput) => post({ kind: 'delegate', reg }, o);
/** Channels a delegate is in (for the Activity feed). */
export function delegateChannels(reg: Record<string, any>) {
  const { seat } = identity(reg);
  const dms = all("SELECT DISTINCT channel FROM chat_message WHERE event_id = ? AND channel LIKE 'dm:%' AND instr(channel, ?) > 0", reg.event_id, reg.id).map((d) => d.channel as string);
  return ['all', ...(seat ? [`c:${seat.committee_id}`] : []), ...dms];
}

export function block(reg: Record<string, any>, otherId: string, on: boolean) {
  if (on) run('INSERT OR IGNORE INTO chat_block (registration_id, blocked_id, created_at) VALUES (?, ?, ?)', reg.id, otherId, now());
  else run('DELETE FROM chat_block WHERE registration_id = ? AND blocked_id = ?', reg.id, otherId);
}

/** Report a message to the conference team; private messages become visible to them only through a report. */
export function report(reg: Record<string, any>, messageId: string, reason: string) {
  const m = one('SELECT * FROM chat_message WHERE id = ? AND event_id = ?', messageId, reg.event_id);
  if (!m || !delegateMay(reg, m.channel)) throw notFound('Message');
  rateLimit(`chatreport:${reg.id}`, 10, 60 * 60_000);
  insert('chat_report', { id: uid(), event_id: reg.event_id, message_id: m.id, reporter_id: reg.id, reason: String(reason ?? '').trim().slice(0, 500) || null, created_at: now() });
  notifyStaff(['admin', 'secretariat'], 'staff_alert', { title: 'A chat message was reported', message: `A delegate reported a message from ${m.sender_name}. Open Chat → Reports to review it.` }, reg.event_id);
}

// ---------- the conference team ----------
/**
 * Channels the team can open: the delegate groups (all committees and each committee; a chair only sees their own),
 * and the team's own channels (whole team, each committee's private EB channel, and team channels they belong to).
 */
export function staffChannels(eventId: string, committeeScope: string[] | null, user?: { id: string; name: string }, admin = !committeeScope) {
  const v = { ...staffViewer(eventId, committeeScope, user), admin } as Extract<Viewer, { kind: 'staff' }>;
  const committees = all('SELECT id, name, short FROM committee WHERE event_id = ? ORDER BY sort, name', eventId).filter((c) => !committeeScope || committeeScope.includes(c.id));
  const latest = (ch: string) => one('SELECT MAX(COALESCE(updated_at, created_at)) AS t, COUNT(*) AS n FROM chat_message WHERE event_id = ? AND channel = ? AND deleted_at IS NULL', eventId, ch);
  const ch = [...(committeeScope ? [] : [{ key: 'all', label: 'All committees' }]), ...committees.map((c) => ({ key: `c:${c.id}`, label: c.name }))];
  const reports = committeeScope ? 0 : one('SELECT COUNT(*) AS n FROM chat_report WHERE event_id = ? AND resolved_at IS NULL', eventId)?.n ?? 0;
  const teamChannels = all('SELECT id, name, description FROM team_channel WHERE event_id = ? AND archived_at IS NULL ORDER BY name', eventId).filter((t) => staffMay(v, `team:${t.id}`));
  const team = [
    { key: 'staff', label: 'Whole team', description: 'Everyone running the conference' },
    ...committees.map((c) => ({ key: `eb:${c.id}`, label: `EB · ${c.short || c.name}`, description: `The ${c.name} EB, privately, with the secretariat` })),
    ...teamChannels.map((t) => ({ key: `team:${t.id}`, label: t.name, description: t.description })),
  ];
  const withLatest = (c: any) => { const l = latest(c.key); return { ...c, latest: l?.t ?? null, count: l?.n ?? 0, mention: user ? lastMention(eventId, c.key, `u:${user.id}`) : null, slow: slowSeconds(eventId, c.key) }; };
  return { settings: eventSettings(eventId).chat, reports, reactions: REACTIONS, channels: ch.map(withLatest), team: team.map(withLatest) };
}
/** Every channel this team member can open (for the Activity feed). */
export function staffChannelKeys(v: Extract<Viewer, { kind: 'staff' }>) {
  const s = staffChannels(v.eventId, v.scope, v.user, v.admin);
  return [...s.channels, ...s.team].map((c) => c.key);
}
export const staffRead = (eventId: string, channel: string, committeeScope: string[] | null, since?: string | null) => read(staffViewer(eventId, committeeScope), channel, { since });
export function staffPost(eventId: string, channel: string, user: { id: string; name: string }, as: string, committeeScope: string[] | null, body: string) {
  return post(staffViewer(eventId, committeeScope, user, as), { channel, body });
}
export function removeMessage(eventId: string, messageId: string, userId: string, committeeScope: string[] | null) {
  const m = one('SELECT * FROM chat_message WHERE id = ? AND event_id = ?', messageId, eventId);
  if (!m) throw notFound('Message');
  // A reported private message can be removed by the team; otherwise only public channels.
  const reported = !!one('SELECT 1 FROM chat_report WHERE message_id = ?', messageId);
  const v = staffViewer(eventId, committeeScope, { id: userId, name: '' }) as Extract<Viewer, { kind: 'staff' }>;
  if (!(isGroup(m.channel) && staffMay(v, m.channel)) && !(reported && !committeeScope)) throw forbidden('You cannot remove this message');
  run('UPDATE chat_message SET deleted_at = ?, deleted_by = ?, pinned_at = NULL WHERE id = ?', now(), userId, messageId);
  touch(messageId);
  if (m.parent_id) touch(m.parent_id);
}
export function reports(eventId: string) {
  return all(`SELECT r.id, r.reason, r.created_at, r.resolved_at, m.id AS message_id, m.channel, m.sender_name, m.body, m.created_at AS sent_at, m.deleted_at,
      (SELECT full_name FROM registration WHERE id = r.reporter_id) AS reporter
    FROM chat_report r JOIN chat_message m ON m.id = r.message_id WHERE r.event_id = ? ORDER BY r.resolved_at IS NOT NULL, r.created_at DESC LIMIT 200`, eventId)
    .map((r) => ({ ...r, private: String(r.channel).startsWith('dm:') }));
}
export function resolveReport(eventId: string, reportId: string, userId: string) {
  run('UPDATE chat_report SET resolved_at = ?, resolved_by = ? WHERE id = ? AND event_id = ?', now(), userId, reportId, eventId);
}

// ---------- Discord-style extras: presence, typing, custom status, role tags, slow mode ----------
const lastMention = (eventId: string, channel: string, who: string) =>
  one('SELECT MAX(created_at) AS t FROM chat_message WHERE event_id = ? AND channel = ? AND deleted_at IS NULL AND mentions LIKE ?', eventId, channel, `%"${who}"%`)?.t ?? null;
/** A team member's tag next to their name: EB for chairs, Organiser for admins, otherwise Secretariat. */
function staffTag(userId: string) {
  const roles = all('SELECT role FROM user_role WHERE user_id = ?', userId).map((r) => r.role as string);
  return roles.some((r) => r === 'admin' || r === 'superadmin') ? 'Organiser' : roles.includes('chair') && roles.length === 1 ? 'EB' : 'Secretariat';
}
export const slowSeconds = (eventId: string, channel: string): number => one('SELECT slow_seconds FROM chat_channel_setting WHERE event_id = ? AND channel = ?', eventId, channel)?.slow_seconds ?? 0;
export const SLOW_OPTIONS = [0, 5, 10, 30, 60, 120];
export function setSlow(v: Viewer, channel: string, seconds: number) {
  if (v.kind !== 'staff' || !staffMay(v, channel) || !isGroup(channel)) throw forbidden('Only the team can set slow mode in a delegate group');
  if (!SLOW_OPTIONS.includes(seconds)) throw bad('Choose one of the slow mode options');
  run('INSERT INTO chat_channel_setting (event_id, channel, slow_seconds) VALUES (?, ?, ?) ON CONFLICT(event_id, channel) DO UPDATE SET slow_seconds = excluded.slow_seconds', v.eventId, channel, seconds);
}

export const statusOf = (eventId: string, who: string) => { const s = one('SELECT emoji, text FROM chat_status WHERE event_id = ? AND who = ?', eventId, who); return s && (s.emoji || s.text) ? { emoji: s.emoji as string, text: s.text as string } : null; };
export const STATUS_PRESETS = [{ emoji: '✍️', text: 'Drafting the resolution' }, { emoji: '🤝', text: 'Lobbying' }, { emoji: '📚', text: 'Researching' }, { emoji: '🎤', text: 'Speaking next' }, { emoji: '☕', text: 'On a break' }, { emoji: '🔕', text: 'In session, replying later' }];
export function setStatus(v: Viewer, p: { emoji?: string; text?: string }) {
  const emoji = String(p.emoji ?? '').trim().slice(0, 8);
  const text = String(p.text ?? '').trim().slice(0, 60);
  run('INSERT INTO chat_status (event_id, who, emoji, text, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id, who) DO UPDATE SET emoji = excluded.emoji, text = excluded.text, updated_at = excluded.updated_at', eventOf(v), whoOf(v), emoji, text, now());
  return statusOf(eventOf(v), whoOf(v));
}

// Who is online and who is typing: kept in memory (it only matters for the next few seconds).
const presence = new Map<string, { at: number; channel: string | null; typingAt: number; name: string }>();
setInterval(() => { const t = Date.now() - 5 * 60_000; for (const [k, p] of presence) if (p.at < t) presence.delete(k); }, 60_000).unref();
const ONLINE_MS = 60_000, TYPING_MS = 6_000;
/** The page says "I'm here (and typing)" every few seconds; the answer is who else is typing here, who is online, and slow mode. */
export function ping(v: Viewer, channel: string, typing: boolean) {
  assertOpen(v, channel);
  const ev = eventOf(v);
  const who = whoOf(v);
  const name = v.kind === 'delegate' ? identity(v.reg).name : v.user.name;
  const t = Date.now();
  const prev = presence.get(`${ev}|${who}`);
  presence.set(`${ev}|${who}`, { at: t, channel, typingAt: typing ? t : prev?.channel === channel ? prev.typingAt : 0, name });
  const typingNow: string[] = []; const online: string[] = [];
  for (const [k, p] of presence) {
    const [e, w] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
    if (e !== ev) continue;
    if (t - p.at < ONLINE_MS) online.push(w);
    if (w !== who && p.channel === channel && t - p.typingAt < TYPING_MS) typingNow.push(p.name);
  }
  return { typing: typingNow.slice(0, 4), online, slow: slowSeconds(ev, channel) };
}
const onlineSet = (eventId: string) => { const t = Date.now(); const s = new Set<string>(); for (const [k, p] of presence) if (k.startsWith(`${eventId}|`) && t - p.at < ONLINE_MS) s.add(k.slice(eventId.length + 1)); return s; };
/** Members with their role tag, custom status and whether they are online (the member list beside a channel). */
export function roster(v: Viewer, channel: string) {
  const ev = eventOf(v);
  const on = onlineSet(ev);
  const statuses = new Map(all('SELECT who, emoji, text FROM chat_status WHERE event_id = ?', ev).map((s) => [s.who as string, { emoji: s.emoji as string, text: s.text as string }]));
  return members(v, channel).map((m) => ({ ...m, online: on.has(m.id), status: statuses.get(m.id) && (statuses.get(m.id)!.emoji || statuses.get(m.id)!.text) ? statuses.get(m.id) : null, tag: m.kind === 'staff' ? staffTag(m.id.slice(2)) : 'Delegate' }))
    .sort((a, b) => Number(b.online) - Number(a.online) || (a.kind === b.kind ? 0 : a.kind === 'staff' ? -1 : 1));
}
