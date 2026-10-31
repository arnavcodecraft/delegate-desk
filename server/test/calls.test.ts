import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');
const chat = await import('../src/services/chat.ts');
const calls = await import('../src/services/calls.ts');
const ts = await import('../src/services/teamspace.ts');
const { saveEventSettings, eventSettings } = await import('../src/settings.ts');

let ctx: ReturnType<typeof freshDb>;
let a: any, b: any, c: any, org: any, chair: any;
const reg = (id: string) => one('SELECT * FROM registration WHERE id = ?', id);
const D = (id: string) => ({ kind: 'delegate' as const, reg: reg(id) });
const staff = (email: string, scope: string[] | null, admin: boolean) => { const u = one('SELECT id, name FROM user WHERE email = ?', email)!; return { kind: 'staff' as const, eventId: ctx.eventId, user: { id: u.id, name: u.name }, scope, admin }; };

before(() => {
  ctx = freshDb();
  const r = (over: any) => asSystem(() => register(ctx.eventId, person({ mun_count: 1, ...over }))).registration.id;
  a = r({ full_name: 'Aisha Khan', preferences: [ctx.committeeIds.UNSC] });
  b = r({ full_name: 'Bilal Rao', preferences: [ctx.committeeIds.UNSC] });
  c = r({ full_name: 'Chen Li', preferences: [ctx.committeeIds.DISEC] });
  org = staff('admin@example.org', null, true);
  chair = staff('chair.unsc@example.org', [ctx.committeeIds.UNSC], false);
});

test('a call in a committee group: join, exchange connection messages, see each other, leave', () => {
  const key = `ch:c:${ctx.committeeIds.UNSC}`;
  const ja = calls.join(D(a), key, { mic: true, cam: true });
  assert.equal(ja.peers.length, 0);
  assert.ok(ja.iceServers[0].urls.length, 'STUN servers are given to the browser');
  const jb = calls.join(D(b), key, { mic: true, cam: false });
  assert.equal(jb.peers[0].pid, ja.pid);
  assert.ok(jb.seq > ja.seq, 'the later one calls the earlier one');
  calls.signal(D(b), key, jb.pid, ja.pid, 'offer', { type: 'offer', sdp: 'v=0' });
  const pa = calls.poll(D(a), key, ja.pid, { hand: true });
  assert.deepEqual(pa.messages.map((m: any) => m.type), ['offer']);
  assert.equal(pa.peers[0].cam, false);
  assert.equal(calls.poll(D(b), key, jb.pid).peers[0].hand, true, 'state (hand, mic, camera) is shared');
  assert.throws(() => calls.signal(D(b), key, jb.pid, ja.pid, 'evil', {}), /Unknown message/);
  assert.throws(() => calls.poll(D(b), key, ja.pid), /not in this call/, 'nobody can act as someone else');
  // Who can see the call: the committee and the team, not other committees.
  assert.equal(calls.activeCalls(D(c)).length, 0);
  assert.equal(calls.activeCalls(chair)[0].count, 2);
  assert.throws(() => calls.join(D(c), key), /not in this chat/);
  calls.leave(D(b), key, jb.pid);
  assert.deepEqual(calls.poll(D(a), key, ja.pid).messages.map((m: any) => m.type), ['bye']);
  calls.leave(D(a), key, ja.pid);
  assert.equal(calls.activeCalls(org).length, 0, 'an empty call ends');
});

test('hosts mute and remove; private calls are off by default; organisers can switch calls off', () => {
  const key = `ch:c:${ctx.committeeIds.UNSC}`;
  const ja = calls.join(D(a), key); const jc = calls.join(chair, key);
  assert.throws(() => calls.moderate(D(b), key, ja.pid, 'mute'), /not in this call/);
  const jb = calls.join(D(b), key);
  assert.throws(() => calls.moderate(D(b), key, jb.pid, 'remove', jc.pid), /host|cannot remove/);
  calls.moderate(chair, key, jc.pid, 'mute');
  assert.ok(calls.poll(D(b), key, jb.pid).messages.some((m: any) => m.type === 'mute'));
  calls.moderate(chair, key, jc.pid, 'remove', jb.pid);
  assert.ok(calls.poll(D(b), key, jb.pid).messages.some((m: any) => m.type === 'removed'));
  for (const [v, j] of [[D(a), ja], [chair, jc], [D(b), jb]] as const) calls.leave(v as any, key, (j as any).pid);
  // Private messages between delegates: no calls unless the organiser allows them.
  const { channel } = chat.delegatePost(reg(a), { to: b, body: 'hi' });
  assert.throws(() => calls.join(D(a), `ch:${channel}`), /private messages are turned off/);
  saveEventSettings(ctx.eventId, { chat: { ...eventSettings(ctx.eventId).chat, dmCalls: true } });
  const dm = calls.join(D(a), `ch:${channel}`); calls.leave(D(a), `ch:${channel}`, dm.pid);
  saveEventSettings(ctx.eventId, { chat: { ...eventSettings(ctx.eventId).chat, calls: false } });
  assert.throws(() => calls.join(D(a), key), /Calls are turned off/);
  saveEventSettings(ctx.eventId, { chat: { ...eventSettings(ctx.eventId).chat, calls: true } });
});

test('scheduled online meetings: who can join, and delegates from 15 minutes before', () => {
  const soon = new Date(Date.now() + 5 * 60_000).toISOString();
  const later = new Date(Date.now() + 3 * 3600_000).toISOString();
  const brief = ts.addScheduleItem(ctx.eventId, { title: 'Delegate briefing', kind: 'meeting', starts_at: soon, call_channel: 'all' });
  const team = ts.addScheduleItem(ctx.eventId, { title: 'Team stand-up', kind: 'meeting', audience: 'staff', starts_at: soon, call_channel: 'staff' });
  const future = ts.addScheduleItem(ctx.eventId, { title: 'UNSC prep', kind: 'meeting', starts_at: later, call_channel: `c:${ctx.committeeIds.UNSC}` });
  assert.throws(() => ts.addScheduleItem(ctx.eventId, { title: 'x', starts_at: soon, call_channel: 'team:nope' }), /who can join/);
  assert.equal(ts.delegateSchedule(reg(c)).find((s: any) => s.id === brief)!.call_channel, 'all');
  const j = calls.join(D(c), `mt:${brief}`);
  assert.equal(j.title, 'Delegate briefing');
  calls.leave(D(c), `mt:${brief}`, j.pid);
  assert.throws(() => calls.join(D(a), `mt:${team}`), /other people|conference team/);
  const s = calls.join(chair, `mt:${team}`); calls.leave(chair, `mt:${team}`, s.pid);
  assert.throws(() => calls.join(D(a), `mt:${future}`), /15 minutes before/);
  const early = calls.join(chair, `mt:${future}`); calls.leave(chair, `mt:${future}`, early.pid);
});

test('a call holds up to 12 people, and joining again replaces your old place', () => {
  const key = 'ch:all';
  const first = calls.join(D(a), key);
  const again = calls.join(D(a), key);
  assert.notEqual(first.pid, again.pid);
  assert.equal(calls.activeCalls(org)[0].count, 1);
  const room = calls._rooms.get(`${ctx.eventId}|${key}`)!;
  for (let i = 0; i < calls.MAX_IN_CALL - 1; i++) room.people.set(`x${i}`, { pid: `x${i}`, who: `d:x${i}`, name: 'X', staff: false, joinedAt: 0, seq: 100 + i, lastSeen: Date.now(), mic: true, cam: false, screen: false, hand: false, inbox: [] });
  assert.throws(() => calls.join(D(b), key), /call is full/);
  room.people.clear(); calls._rooms.clear();
});
