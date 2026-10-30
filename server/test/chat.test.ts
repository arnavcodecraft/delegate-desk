import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');
const chat = await import('../src/services/chat.ts');
const { saveEventSettings } = await import('../src/settings.ts');

let ctx: ReturnType<typeof freshDb>;
let a: any, b: any, c: any;
const reg = (id: string) => one('SELECT * FROM registration WHERE id = ?', id);
before(() => {
  ctx = freshDb();
  const r = (over: any) => asSystem(() => register(ctx.eventId, person({ mun_count: 1, ...over }))).registration.id;
  a = r({ full_name: 'Aisha Khan', preferences: [ctx.committeeIds.DISEC] });
  b = r({ full_name: 'Bilal Rao', preferences: [ctx.committeeIds.DISEC] });
  c = r({ full_name: 'Chen Li', preferences: [ctx.committeeIds.UNSC] });
});

test('every delegate sees All committees and their own committee; names are portfolios', () => {
  const inbox = chat.delegateInbox(reg(a));
  assert.deepEqual(inbox.channels.map((x) => x.key), ['all', `c:${ctx.committeeIds.DISEC}`]);
  assert.match(inbox.me.name, /· DISEC \(Aisha\)$/);
  chat.delegatePost(reg(a), { channel: 'all', body: 'Hello everyone' });
  chat.delegatePost(reg(b), { channel: `c:${ctx.committeeIds.DISEC}`, body: 'DISEC bloc meeting at lunch?' });
  assert.equal(chat.delegateRead(reg(c), 'all').at(-1)!.body, 'Hello everyone');
  assert.throws(() => chat.delegateRead(reg(c), `c:${ctx.committeeIds.DISEC}`), /not in this chat/);
  assert.throws(() => chat.delegatePost(reg(c), { channel: `c:${ctx.committeeIds.DISEC}`, body: 'hi' }), /not in this chat/);
});

test('private messages: only the two delegates can read them; blocking stops messages', () => {
  const { channel } = chat.delegatePost(reg(a), { to: c, body: 'Want to co-sponsor?' });
  assert.equal(chat.delegateRead(reg(c), channel).at(-1)!.body, 'Want to co-sponsor?');
  assert.throws(() => chat.delegateRead(reg(b), channel), /not in this chat/);
  assert.ok(chat.delegateInbox(reg(c)).channels.some((x) => x.key === channel && x.kind === 'dm'));
  assert.ok(chat.directory(reg(a)).some((d) => d.id === c));
  chat.block(reg(c), a, true);
  assert.throws(() => chat.delegatePost(reg(a), { channel, body: 'hello?' }), /cannot message/);
  chat.block(reg(c), a, false);
  chat.delegatePost(reg(a), { channel, body: 'thanks' });
});

test('the team moderates groups, sees private messages only when reported, and can switch chat off', () => {
  // A chair only sees their own committee; the team cannot open private chats.
  const scope = [ctx.committeeIds.UNSC];
  assert.deepEqual(chat.staffChannels(ctx.eventId, scope).channels.map((x) => x.key), [`c:${ctx.committeeIds.UNSC}`]);
  assert.throws(() => chat.staffRead(ctx.eventId, `c:${ctx.committeeIds.DISEC}`, scope), /Private chats|forbidden|only visible/i);
  const dm = chat.delegateInbox(reg(c)).channels.find((x) => x.kind === 'dm')!.key;
  assert.throws(() => chat.staffRead(ctx.eventId, dm, null), /only visible when reported/);
  chat.staffPost(ctx.eventId, 'all', { id: 'u1', name: 'Sana Shah' }, 'Secretariat', null, 'Lunch is at 1 pm');
  assert.equal(chat.delegateRead(reg(b), 'all').at(-1)!.sender_name, 'Secretariat (Sana)');
  // Report a private message: the team sees it in reports and can remove it.
  const m = chat.delegateRead(reg(c), dm).at(-1)!;
  chat.report(reg(c), m.id, 'Spam');
  const rep = chat.reports(ctx.eventId)[0];
  assert.equal(rep.private, true);
  assert.equal(rep.body, 'thanks');
  chat.removeMessage(ctx.eventId, m.id, 'u1', null);
  assert.equal(chat.delegateRead(reg(c), dm).at(-1)!.body, '', 'removed messages keep their place but lose their text');
  // Switches.
  saveEventSettings(ctx.eventId, { chat: { enabled: true, dms: false } });
  assert.throws(() => chat.delegatePost(reg(a), { to: b, body: 'hi' }), /Private messages are turned off/);
  assert.equal(chat.delegateInbox(reg(a)).channels.some((x) => x.kind === 'dm'), false);
  saveEventSettings(ctx.eventId, { chat: { enabled: false, dms: false } });
  assert.throws(() => chat.delegateInbox(reg(a)), /Chat is turned off/);
});
