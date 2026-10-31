/**
 * Audio and video calls and online meetings, peer to peer (WebRTC). The server only introduces people to each other:
 * it keeps who is in each call and passes the connection messages (offer, answer, network candidates) between them.
 * Audio and video go straight between the browsers, never through DelegateDesk.
 *
 *   ch:<channel>  a call in a chat channel ("Join call"): anyone who can open the channel can join
 *   mt:<item id>  a scheduled meeting: anyone who can open the meeting's channel can join, from 15 minutes before
 *
 * Every person sends their audio and video to every other person, so a call holds up to MAX_IN_CALL people.
 * Hosts (the conference team, and the person who started a channel call) can ask everyone to mute and can remove people.
 * Call state lives in memory: it only matters while people are in the call.
 */
import crypto from 'node:crypto';
import { one } from '../db.ts';
import { eventSettings } from '../settings.ts';
import { bad, conflict, forbidden, notFound } from '../util.ts';
import { rateLimit } from '../auth.ts';
import { assertOpen, identity, mayOpen, whoOf, type Viewer } from './chat.ts';

export const MAX_IN_CALL = 12;
const GONE_MS = 15_000;       // no poll for this long: they left (closed the tab, lost the connection)
const EARLY_MS = 15 * 60_000; // meetings open this long before they start

interface Participant {
  pid: string; who: string; name: string; staff: boolean; joinedAt: number; seq: number; lastSeen: number;
  mic: boolean; cam: boolean; screen: boolean; hand: boolean; inbox: { from: string; type: string; data: unknown }[];
}
interface Room { key: string; eventId: string; channel: string; title: string; startedBy: string; startedAt: number; seq: number; people: Map<string, Participant>; kind: 'audio' | 'video' }
const rooms = new Map<string, Room>();
const roomId = (eventId: string, key: string) => `${eventId}|${key}`;
const eventOf = (v: Viewer) => (v.kind === 'delegate' ? v.reg.event_id : v.eventId);
const nameOf = (v: Viewer) => (v.kind === 'delegate' ? identity(v.reg).name : v.user.name);

function sweep(room: Room) {
  const t = Date.now();
  for (const [pid, p] of room.people) if (t - p.lastSeen > GONE_MS) { room.people.delete(pid); for (const o of room.people.values()) o.inbox.push({ from: pid, type: 'bye', data: null }); }
  if (!room.people.size) rooms.delete(roomId(room.eventId, room.key));
}
setInterval(() => { for (const r of [...rooms.values()]) sweep(r); }, 5_000).unref();

/** STUN (and, if the organiser set one up, TURN) servers the browsers use to find a route to each other. */
export function iceServers() {
  const list: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: (process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean) }];
  if (process.env.TURN_URL) list.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USERNAME, credential: process.env.TURN_PASSWORD });
  return list;
}

/** What a call key means: which channel decides who may join, and its title. */
function resolve(v: Viewer, key: string) {
  const ev = eventOf(v);
  const s = eventSettings(ev).chat;
  if (s.calls === false) throw conflict('Calls are turned off for this conference');
  if (key.startsWith('ch:')) {
    const channel = key.slice(3);
    if (channel.startsWith('dm:') && !s.dmCalls) throw forbidden('Calls in private messages are turned off for this conference');
    if (channel.startsWith('pending:')) throw bad('Send a message first');
    assertOpen(v, channel);
    return { channel, title: '', meeting: null as any };
  }
  if (key.startsWith('mt:')) {
    const m = one('SELECT * FROM schedule_item WHERE id = ? AND event_id = ?', key.slice(3), ev);
    if (!m || !m.call_channel) throw notFound('Meeting');
    if (!mayOpen(v, m.call_channel)) throw forbidden('This meeting is for other people');
    if (v.kind === 'delegate' && !['all', 'delegates'].includes(m.audience)) throw forbidden('This meeting is for the conference team');
    const t = Date.now();
    const end = m.ends_at ? new Date(m.ends_at).getTime() : new Date(m.starts_at).getTime() + 3 * 3600_000;
    if (v.kind === 'delegate' && (t < new Date(m.starts_at).getTime() - EARLY_MS || t > end)) throw conflict('This meeting opens 15 minutes before it starts');
    return { channel: m.call_channel as string, title: m.title as string, meeting: m };
  }
  throw bad('Unknown call');
}

const peerView = (p: Participant) => ({ pid: p.pid, who: p.who, name: p.name, staff: p.staff, seq: p.seq, mic: p.mic, cam: p.cam, screen: p.screen, hand: p.hand });
const isHost = (v: Viewer, room: Room) => v.kind === 'staff' || room.startedBy === whoOf(v);

/** Join a call (starting it if nobody is in it yet). */
export function join(v: Viewer, key: string, o: { mic?: boolean; cam?: boolean; kind?: string } = {}) {
  const r = resolve(v, key);
  const ev = eventOf(v);
  rateLimit(`call:${whoOf(v)}`, 30, 60_000);
  let room = rooms.get(roomId(ev, key));
  if (room) sweep(room);
  room = rooms.get(roomId(ev, key));
  if (!room) {
    room = { key, eventId: ev, channel: r.channel, title: r.title, startedBy: whoOf(v), startedAt: Date.now(), seq: 0, people: new Map(), kind: o.kind === 'audio' ? 'audio' : 'video' };
    rooms.set(roomId(ev, key), room);
  }
  // The same person joining again (a second tab, or after a reload) replaces their old place.
  for (const [pid, p] of room.people) if (p.who === whoOf(v)) { room.people.delete(pid); for (const x of room.people.values()) x.inbox.push({ from: pid, type: 'bye', data: null }); }
  if (room.people.size >= MAX_IN_CALL) throw conflict(`This call is full (${MAX_IN_CALL} people). Try again when someone leaves.`);
  const pid = crypto.randomBytes(9).toString('base64url');
  const me: Participant = { pid, who: whoOf(v), name: nameOf(v), staff: v.kind === 'staff', joinedAt: Date.now(), seq: ++room.seq, lastSeen: Date.now(), mic: o.mic !== false, cam: !!o.cam, screen: false, hand: false, inbox: [] };
  room.people.set(pid, me);
  return { pid, seq: me.seq, host: isHost(v, room), title: room.title, channel: room.channel, kind: room.kind, iceServers: iceServers(), max: MAX_IN_CALL, peers: [...room.people.values()].filter((p) => p.pid !== pid).map(peerView) };
}

function mine(v: Viewer, key: string, pid: string) {
  const room = rooms.get(roomId(eventOf(v), key));
  const me = room?.people.get(String(pid));
  if (!room || !me || me.who !== whoOf(v)) throw notFound('You are not in this call');
  return { room, me };
}

/** Every second: report my state, collect messages for me, and see who is in the call. */
export function poll(v: Viewer, key: string, pid: string, state: { mic?: boolean; cam?: boolean; screen?: boolean; hand?: boolean } = {}) {
  const { room, me } = mine(v, key, pid);
  me.lastSeen = Date.now();
  for (const k of ['mic', 'cam', 'screen', 'hand'] as const) if (typeof state[k] === 'boolean') me[k] = state[k]!;
  sweep(room);
  const messages = me.inbox.splice(0);
  return { peers: [...room.people.values()].filter((p) => p.pid !== pid).map(peerView), messages, host: isHost(v, room) };
}

/** Pass a connection message to one person in the call. */
export function signal(v: Viewer, key: string, pid: string, to: string, type: string, data: unknown) {
  const { room } = mine(v, key, pid);
  if (!['offer', 'answer', 'ice'].includes(type)) throw bad('Unknown message');
  const target = room.people.get(String(to));
  if (!target) return { ok: false };
  if (JSON.stringify(data ?? null).length > 20_000) throw bad('Message too large');
  target.inbox.push({ from: pid, type, data });
  if (target.inbox.length > 500) target.inbox.splice(0, target.inbox.length - 500);
  return { ok: true };
}

export function leave(v: Viewer, key: string, pid: string) {
  const room = rooms.get(roomId(eventOf(v), key));
  const me = room?.people.get(String(pid));
  if (!room || !me || me.who !== whoOf(v)) return;
  room.people.delete(me.pid);
  for (const p of room.people.values()) p.inbox.push({ from: me.pid, type: 'bye', data: null });
  sweep(room);
}

/** Hosts: ask everyone (or one person) to mute, or remove someone from the call. */
export function moderate(v: Viewer, key: string, pid: string, action: string, target?: string) {
  const { room } = mine(v, key, pid);
  if (!isHost(v, room)) throw forbidden('Only the host can do that');
  const targets = target ? [room.people.get(String(target))].filter(Boolean) as Participant[] : [...room.people.values()].filter((p) => p.pid !== pid);
  if (action === 'mute') for (const p of targets) p.inbox.push({ from: pid, type: 'mute', data: null });
  else if (action === 'remove' && target) {
    const p = room.people.get(String(target));
    if (!p) return;
    if (p.staff && v.kind !== 'staff') throw forbidden('You cannot remove the conference team');
    p.inbox.push({ from: pid, type: 'removed', data: null });
    // They get the message on their next poll; then their place goes.
    setTimeout(() => { if (room.people.get(p.pid)) { room.people.delete(p.pid); for (const o of room.people.values()) o.inbox.push({ from: p.pid, type: 'bye', data: null }); } }, 2500).unref();
  } else if (action === 'lower') for (const p of targets) p.hand = false;
  else throw bad('Unknown action');
}

/** Calls going on in the channels this person can open (for the "Join call" banners and the green dot in the list). */
export function activeCalls(v: Viewer) {
  const ev = eventOf(v);
  const out: { key: string; channel: string; title: string; count: number; names: string[]; startedAt: number; kind: string }[] = [];
  for (const r of rooms.values()) {
    if (r.eventId !== ev) continue;
    sweep(r);
    if (!r.people.size || !mayOpen(v, r.channel)) continue;
    out.push({ key: r.key, channel: r.channel, title: r.title, count: r.people.size, names: [...r.people.values()].slice(0, 4).map((p) => p.name), startedAt: r.startedAt, kind: r.kind });
  }
  return out;
}
/** For tests. */
export const _rooms = rooms;
