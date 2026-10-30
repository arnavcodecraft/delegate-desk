/**
 * Conference chat. Three kinds of channel, all inside one conference:
 *   all              every delegate of the conference (the "All committees" group)
 *   c:<committee id> the delegates of one committee
 *   dm:<a>|<b>       two delegates privately (registration ids, sorted)
 * Delegates are named by their portfolio, as in committee ("France · DISEC"). Staff post as the secretariat or EB.
 * The team can remove public messages and sees reported private messages; it cannot read private chats otherwise.
 */
import { all, one, run, insert } from '../db.ts';
import { eventSettings } from '../settings.ts';
import { bad, conflict, forbidden, notFound, now, uid } from '../util.ts';
import { rateLimit } from '../auth.ts';
import { notifyStaff } from './notify.ts';

const MAX = 1000;
const dmChannel = (a: string, b: string) => `dm:${[a, b].sort().join('|')}`;

/** A delegate's seat and display name. */
function identity(reg: Record<string, any>) {
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

/** May this delegate read and write this channel? */
function delegateMay(reg: Record<string, any>, channel: string) {
  if (channel === 'all') return true;
  const { seat } = identity(reg);
  if (channel.startsWith('c:')) return !!seat && channel === `c:${seat.committee_id}`;
  if (channel.startsWith('dm:')) return channel.slice(3).split('|').includes(reg.id);
  return false;
}

function messages(eventId: string, channel: string, since?: string | null) {
  return all(`SELECT id, channel, sender_kind, sender_id, sender_name, CASE WHEN deleted_at IS NULL THEN body ELSE '' END AS body, created_at, deleted_at IS NOT NULL AS deleted
    FROM chat_message WHERE event_id = ? AND channel = ? ${since ? 'AND created_at > ?' : ''} ORDER BY created_at DESC LIMIT 150`, ...[eventId, channel, ...(since ? [since] : [])]).reverse();
}

/** The channels a delegate can see, with the newest message time in each (the page works out unread counts). */
export function delegateInbox(reg: Record<string, any>) {
  const s = settingsFor(reg.event_id);
  const { seat, name } = identity(reg);
  const latest = (ch: string) => one('SELECT MAX(created_at) AS t FROM chat_message WHERE event_id = ? AND channel = ?', reg.event_id, ch)?.t ?? null;
  const channels: { key: string; label: string; kind: string; latest: string | null; with?: string }[] = [{ key: 'all', label: 'All committees', kind: 'group', latest: latest('all') }];
  if (seat) channels.push({ key: `c:${seat.committee_id}`, label: seat.committee, kind: 'group', latest: latest(`c:${seat.committee_id}`) });
  if (s.dms) {
    const dms = all(`SELECT channel, MAX(created_at) AS t FROM chat_message WHERE event_id = ? AND channel LIKE 'dm:%' AND instr(channel, ?) > 0 GROUP BY channel ORDER BY t DESC`, reg.event_id, reg.id);
    for (const d of dms) {
      const other = String(d.channel).slice(3).split('|').find((x) => x !== reg.id);
      const r = other ? one('SELECT * FROM registration WHERE id = ? AND cancelled_at IS NULL', other) : null;
      if (r) channels.push({ key: d.channel, label: identity(r).name, kind: 'dm', latest: d.t, with: r.id });
    }
  }
  return { me: { id: reg.id, name }, dms: s.dms, channels, blocked: all('SELECT blocked_id FROM chat_block WHERE registration_id = ?', reg.id).map((b) => b.blocked_id) };
}

/** Delegates someone can start a private chat with: everyone seated at the conference, listed by committee and portfolio. */
export function directory(reg: Record<string, any>) {
  if (!settingsFor(reg.event_id).dms) throw conflict('Private messages are turned off for this conference');
  return all(`SELECT r.id, r.full_name, p.name AS portfolio, c.short FROM registration r JOIN seat s ON s.registration_id = r.id JOIN portfolio p ON p.id = s.portfolio_id
    JOIN committee c ON c.id = p.committee_id WHERE r.event_id = ? AND r.id <> ? AND r.cancelled_at IS NULL AND r.erased_at IS NULL ORDER BY c.sort, p.sort, p.name`, reg.event_id, reg.id)
    .map((r) => ({ id: r.id, name: `${r.portfolio} · ${r.short} (${String(r.full_name).split(/\s+/)[0]})`, committee: r.short }));
}

export function delegateRead(reg: Record<string, any>, channel: string, since?: string | null) {
  settingsFor(reg.event_id);
  if (!delegateMay(reg, channel)) throw forbidden('You are not in this chat');
  return messages(reg.event_id, channel, since);
}

/** A delegate posts; a private chat with a delegate they have not chatted with yet is opened by passing `to`. */
export function delegatePost(reg: Record<string, any>, o: { channel?: string; to?: string; body: string }) {
  const s = settingsFor(reg.event_id);
  const body = String(o.body ?? '').trim();
  if (!body) throw bad('Write a message first');
  if (body.length > MAX) throw bad(`Messages can be up to ${MAX} characters`);
  rateLimit(`chat:${reg.id}`, 20, 60_000);
  let channel = String(o.channel ?? '');
  if (o.to) {
    if (!s.dms) throw conflict('Private messages are turned off for this conference');
    const other = one('SELECT * FROM registration WHERE id = ? AND event_id = ? AND cancelled_at IS NULL', String(o.to), reg.event_id);
    if (!other || other.id === reg.id) throw notFound('Delegate');
    channel = dmChannel(reg.id, other.id);
  }
  if (channel.startsWith('dm:')) {
    if (!s.dms) throw conflict('Private messages are turned off for this conference');
    const other = channel.slice(3).split('|').find((x) => x !== reg.id)!;
    if (blocked(reg.id, other)) throw forbidden('You cannot message this delegate');
  }
  if (!delegateMay(reg, channel)) throw forbidden('You are not in this chat');
  const id = uid();
  insert('chat_message', { id, event_id: reg.event_id, channel, sender_kind: 'delegate', sender_id: reg.id, sender_name: identity(reg).name, body, created_at: now() });
  return { id, channel };
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
/** Channels the team can moderate: all committees and each committee (a chair only sees their own committee). */
export function staffChannels(eventId: string, committeeScope: string[] | null) {
  const committees = all('SELECT id, name, short FROM committee WHERE event_id = ? ORDER BY sort, name', eventId).filter((c) => !committeeScope || committeeScope.includes(c.id));
  const latest = (ch: string) => one('SELECT MAX(created_at) AS t, COUNT(*) AS n FROM chat_message WHERE event_id = ? AND channel = ? AND deleted_at IS NULL', eventId, ch);
  const ch = [...(committeeScope ? [] : [{ key: 'all', label: 'All committees' }]), ...committees.map((c) => ({ key: `c:${c.id}`, label: c.name }))];
  const reports = committeeScope ? 0 : one('SELECT COUNT(*) AS n FROM chat_report WHERE event_id = ? AND resolved_at IS NULL', eventId)?.n ?? 0;
  return { settings: eventSettings(eventId).chat, reports, channels: ch.map((c) => { const l = latest(c.key); return { ...c, latest: l?.t ?? null, count: l?.n ?? 0 }; }) };
}
function staffMay(channel: string, committeeScope: string[] | null) {
  if (channel.startsWith('dm:')) return false;
  if (!committeeScope) return channel === 'all' || channel.startsWith('c:');
  return channel.startsWith('c:') && committeeScope.includes(channel.slice(2));
}
export function staffRead(eventId: string, channel: string, committeeScope: string[] | null, since?: string | null) {
  if (!staffMay(channel, committeeScope)) throw forbidden(channel.startsWith('dm:') ? 'Private chats are only visible when reported' : 'You can only see your own committee’s group');
  return messages(eventId, channel, since);
}
export function staffPost(eventId: string, channel: string, user: { id: string; name: string }, as: string, committeeScope: string[] | null, body: string) {
  if (!staffMay(channel, committeeScope)) throw forbidden('You cannot post here');
  const text = String(body ?? '').trim();
  if (!text) throw bad('Write a message first');
  if (text.length > MAX) throw bad(`Messages can be up to ${MAX} characters`);
  const id = uid();
  insert('chat_message', { id, event_id: eventId, channel, sender_kind: 'staff', sender_id: user.id, sender_name: `${as} (${user.name.split(/\s+/)[0]})`, body: text, created_at: now() });
  return { id };
}
export function removeMessage(eventId: string, messageId: string, userId: string, committeeScope: string[] | null) {
  const m = one('SELECT * FROM chat_message WHERE id = ? AND event_id = ?', messageId, eventId);
  if (!m) throw notFound('Message');
  // A reported private message can be removed by the team; otherwise only public channels.
  const reported = !!one('SELECT 1 FROM chat_report WHERE message_id = ?', messageId);
  if (!staffMay(m.channel, committeeScope) && !(reported && !committeeScope)) throw forbidden('You cannot remove this message');
  run('UPDATE chat_message SET deleted_at = ?, deleted_by = ? WHERE id = ?', now(), userId, messageId);
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
