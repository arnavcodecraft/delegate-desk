import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person, user } from './helpers.ts';
import { one } from '../src/db.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');
const chat = await import('../src/services/chat.ts');
type Viewer = import('../src/services/chat.ts').Viewer;
const ts = await import('../src/services/teamspace.ts');

let ctx: ReturnType<typeof freshDb>;
let a: any, b: any, c: any;
let org: any, chair: any, desk: any;
const reg = (id: string) => one('SELECT * FROM registration WHERE id = ?', id);
const D = (id: string): Viewer => ({ kind: 'delegate', reg: reg(id) });
const staff = (email: string, scope: string[] | null, admin: boolean) => { const u = one('SELECT id, name FROM user WHERE email = ?', email)!; return { kind: 'staff' as const, eventId: ctx.eventId, user: { id: u.id, name: u.name }, scope, admin }; };

before(() => {
  ctx = freshDb();
  const r = (over: any) => asSystem(() => register(ctx.eventId, person({ mun_count: 1, ...over }))).registration.id;
  a = r({ full_name: 'Aisha Khan', preferences: [ctx.committeeIds.UNSC] });
  b = r({ full_name: 'Bilal Rao', preferences: [ctx.committeeIds.UNSC] });
  c = r({ full_name: 'Chen Li', preferences: [ctx.committeeIds.DISEC] });
  org = staff('admin@example.org', null, true);
  desk = staff('desk@example.org', null, false);
  const chairUser = user('chair.unsc@example.org');
  assert.ok(chairUser.roles.includes('chair'));
  chair = staff('chair.unsc@example.org', [ctx.committeeIds.UNSC], false);
});

test('threads, reactions, @mentions, edits and search in a committee group', () => {
  const ch = `c:${ctx.committeeIds.UNSC}`;
  const bName = chat.members(D(a), ch).find((m) => m.id === `d:${b}`)!.name;
  const { id } = chat.post(D(a), { channel: ch, body: `Bloc meeting at lunch? @${bName}`, mentions: [{ id: `d:${b}`, name: bName }, { id: `d:${c}`, name: 'Not here' }] });
  const root = chat.read(D(b), ch).find((m: any) => m.id === id)!;
  assert.deepEqual(root.mentions.map((m: any) => m.id), [`d:${b}`], 'only people in the channel, named in the message, are mentioned');
  chat.post(D(b), { channel: ch, parent: id, body: 'Yes, near the café' });
  chat.react(D(b), id, '👍');
  chat.react(D(a), id, '👍');
  assert.throws(() => chat.react(D(a), id, '🦄'), /Choose one of the reactions/);
  const after = chat.read(D(a), ch).find((m: any) => m.id === id)!;
  assert.equal(after.replies, 1, 'replies are counted on the first message, not listed in the channel');
  assert.deepEqual(after.reactions, [{ emoji: '👍', count: 2, mine: true }]);
  assert.equal(chat.read(D(a), ch).some((m: any) => m.parent_id === id), false);
  assert.equal(chat.read(D(a), ch, { thread: id }).length, 2);
  // Only the sender edits or deletes.
  assert.throws(() => chat.edit(D(b), id, 'hacked'), /your own messages/);
  chat.edit(D(a), id, `Bloc meeting at 1 pm? @${bName}`);
  assert.ok(chat.read(D(a), ch).find((m: any) => m.id === id)!.edited_at);
  assert.equal(chat.read(D(b), ch, { q: '1 pm' }).length, 1);
  // Activity: Bilal sees the mention, Aisha sees the reply.
  assert.ok(ts.delegateActivity(reg(b)).items.some((i: any) => i.type === 'mention' && i.id === id));
  assert.ok(ts.delegateActivity(reg(a)).items.some((i: any) => i.type === 'reply'));
  assert.ok(chat.delegateInbox(reg(b)).channels.find((x) => x.key === ch)!.mention, 'the channel shows an @ badge');
});

test('announcements, polls and pins are for the team; delegates vote once and can change their vote', () => {
  const ch = `c:${ctx.committeeIds.UNSC}`;
  assert.throws(() => chat.post(D(a), { channel: ch, kind: 'poll', body: 'Q?', poll: { options: ['x', 'y'] } }), /Only the conference team/);
  const { id } = chat.post(chair, { channel: ch, kind: 'poll', body: 'Which topic first?', poll: { options: ['Cyber', 'Climate'] } });
  assert.throws(() => chat.post(chair, { channel: ch, kind: 'poll', body: 'Q', poll: { options: ['one'] } }), /between 2 and 6/);
  chat.vote(D(a), id, 0); chat.vote(D(b), id, 0); chat.vote(D(b), id, 1);
  const p = chat.read(D(a), ch).find((m: any) => m.id === id)!.poll;
  assert.deepEqual(p.counts, [1, 1]);
  assert.equal(p.mine, 0);
  chat.closePoll(chair, id);
  assert.throws(() => chat.vote(D(a), id, 1), /closed/);
  const ann = chat.post(chair, { channel: ch, kind: 'announcement', title: 'Session II', body: 'Starts at 2 pm in Hall B' });
  assert.ok(chat.read(D(a), ch).find((m: any) => m.id === ann.id)!.tag === 'EB', 'chairs are tagged EB');
  assert.throws(() => chat.pin(D(a), ann.id, true), /Only the conference team/);
  chat.pin(chair, ann.id, true);
  assert.equal(chat.pins(D(b), ch)[0].id, ann.id);
  assert.ok(ts.delegateActivity(reg(b)).items.some((i: any) => i.type === 'announcement' && i.title === 'Session II'));
  // A chair cannot post in another committee.
  assert.throws(() => chat.post(chair, { channel: `c:${ctx.committeeIds.DISEC}`, body: 'hi' }), /cannot post/);
});

test('team channels: whole team, private EB channels, and channels only their members open', () => {
  const s = chat.staffChannels(ctx.eventId, chair.scope, chair.user, false);
  assert.deepEqual(s.team.map((t: any) => t.key), ['staff', `eb:${ctx.committeeIds.UNSC}`], 'a chair sees the whole team and their own EB channel');
  chat.post(chair, { channel: `eb:${ctx.committeeIds.UNSC}`, body: 'Awards shortlist draft is in the notebook' });
  assert.equal(chat.read(org, `eb:${ctx.committeeIds.UNSC}`).length, 1, 'the secretariat can read EB channels');
  assert.throws(() => chat.read(chair, `eb:${ctx.committeeIds.DISEC}`), /own committee/);
  assert.throws(() => chat.read(D(a), 'staff'), /not in this chat/, 'delegates never see team channels');
  const id = ts.createTeamChannel(ctx.eventId, org.user.id, { name: 'Logistics', members: [desk.user.id] });
  assert.throws(() => ts.createTeamChannel(ctx.eventId, org.user.id, { name: 'logistics' }), /already a channel/);
  chat.post(desk, { channel: `team:${id}`, body: 'Buses at 8' });
  assert.throws(() => chat.read(chair, `team:${id}`), /Only members/);
  assert.equal(chat.read(org, `team:${id}`).length, 1, 'organisers can open every team channel');
  assert.deepEqual(chat.members(desk, `team:${id}`).map((m) => m.id).sort(), [`u:${desk.user.id}`, `u:${org.user.id}`].sort());
});

test('Discord-style extras: slow mode, presence, typing and custom status', () => {
  const ch = 'all';
  assert.throws(() => chat.setSlow(D(a), ch, 10), /Only the team/);
  assert.throws(() => chat.setSlow(org, ch, 7), /slow mode options/);
  chat.setSlow(org, ch, 30);
  chat.post(D(c), { channel: ch, body: 'First' });
  assert.throws(() => chat.post(D(c), { channel: ch, body: 'Second' }), /Slow mode is on/);
  chat.post(org, { channel: ch, body: 'The team is not slowed down' });
  chat.setSlow(org, ch, 0);
  chat.post(D(c), { channel: ch, body: 'Second' });
  chat.ping(D(a), ch, true);
  const seen = chat.ping(D(b), ch, false);
  assert.ok(seen.typing.some((n) => n.includes('Aisha')), 'others see who is typing');
  assert.ok(seen.online.includes(`d:${a}`));
  assert.equal(chat.ping(D(a), ch, false).typing.length, 0, 'you never see yourself typing');
  chat.setStatus(D(a), { emoji: '✍️', text: 'Drafting the resolution' });
  const me = chat.roster(D(b), `c:${ctx.committeeIds.UNSC}`).find((m) => m.id === `d:${a}`)!;
  assert.deepEqual(me.status, { emoji: '✍️', text: 'Drafting the resolution' });
  assert.equal(me.online, true);
  chat.setStatus(D(a), { emoji: '', text: '' });
  assert.equal(chat.delegateInbox(reg(a)).me.status, null);
});

test('tasks: a Planner board where chairs see their committee and what is assigned to them', () => {
  const t1 = ts.createTask(org, { title: 'Print placards', bucket: 'Logistics', assignee_id: desk.user.id, due_at: '2027-01-10T09:00:00Z', checklist: [{ text: 'UNSC' }, { text: 'DISEC' }] });
  const t2 = ts.createTask(chair, { title: 'Write the UNSC crisis update', committee_id: ctx.committeeIds.UNSC, priority: 'high' });
  assert.throws(() => ts.createTask(chair, { title: 'DISEC thing', committee_id: ctx.committeeIds.DISEC }), /own committee/);
  assert.throws(() => ts.createTask(org, { title: '' }), /title/);
  assert.deepEqual(ts.tasks(chair).map((t: any) => t.id), [t2.id], 'a chair does not see conference-wide tasks');
  assert.equal(ts.tasks(org).length, 2);
  // The person a task is assigned to can move it along.
  const moved = ts.updateTask(desk, t1.id, { status: 'done', checklist: [{ text: 'UNSC', done: true }, { text: 'DISEC', done: true }] });
  assert.equal(moved.status, 'done');
  assert.ok(moved.done_at);
  assert.equal(ts.staffActivity(desk).tasks.length, 0, 'done tasks leave your list');
  assert.throws(() => ts.deleteTask(chair, t1.id), /Task/);
  ts.deleteTask(org, t1.id);
});

test('schedule with audiences and "Interested", Ask the EB, and the EB notebook', () => {
  const open = ts.addScheduleItem(ctx.eventId, { title: 'Opening ceremony', kind: 'ceremony', starts_at: '2027-01-15T04:00:00Z', location: 'Main hall' });
  ts.addScheduleItem(ctx.eventId, { title: 'UNSC Session I', kind: 'session', committee_id: ctx.committeeIds.UNSC, starts_at: '2027-01-15T05:00:00Z' });
  ts.addScheduleItem(ctx.eventId, { title: 'EB briefing', kind: 'meeting', audience: 'staff', starts_at: '2027-01-15T03:00:00Z' });
  assert.throws(() => ts.addScheduleItem(ctx.eventId, { title: 'Bad', starts_at: '2027-01-15T05:00:00Z', ends_at: '2027-01-15T04:00:00Z' }), /end after/);
  assert.deepEqual(ts.delegateSchedule(reg(a)).map((s: any) => s.title), ['Opening ceremony', 'UNSC Session I']);
  assert.deepEqual(ts.delegateSchedule(reg(c)).map((s: any) => s.title), ['Opening ceremony'], 'other committees’ sessions are hidden');
  ts.rsvp(reg(a), open); ts.rsvp(reg(c), open);
  assert.equal(ts.staffSchedule(org).find((s: any) => s.id === open)!.going, 2);
  ts.rsvp(reg(c), open);
  assert.equal(ts.delegateSchedule(reg(c))[0].interested, false);

  // Ask the EB.
  const q = ts.ask(reg(a), { body: 'Can we move for an unmoderated caucus in Session I?', anonymous: true });
  assert.throws(() => ts.upvote(reg(a), q), /own question/);
  ts.upvote(reg(b), q);
  assert.throws(() => ts.upvote(reg(c), q), /Question/, 'other committees cannot vote');
  const forB = ts.delegateQuestions(reg(b)).questions[0];
  assert.equal(forB.asker, 'Anonymous delegate');
  assert.equal(forB.votes, 1);
  assert.match(ts.staffQuestions(chair)[0].asker, /Aisha/, 'the EB always sees who asked');
  assert.equal(ts.staffQuestions(staff('chair.unsc@example.org', [ctx.committeeIds.DISEC], false)).length, 0);
  ts.answer(chair, q, { answer: 'Yes, after the GSL has had five speakers.' });
  assert.ok(ts.delegateActivity(reg(a)).items.some((i: any) => i.type === 'answer'));
  ts.answer(chair, q, { hidden: true });
  assert.equal(ts.delegateQuestions(reg(b)).questions.length, 0);

  // EB notebook: per committee, and two chairs can't silently overwrite each other.
  const id = ts.saveNote(chair, ctx.committeeIds.UNSC, { title: 'Awards shortlist', body: 'BD: ' });
  const page = ts.notes(chair, ctx.committeeIds.UNSC)[0];
  ts.saveNote(org, ctx.committeeIds.UNSC, { id, title: page.title, body: 'BD: France', updated_at: page.updated_at });
  assert.throws(() => ts.saveNote(chair, ctx.committeeIds.UNSC, { id, title: page.title, body: 'BD: UK', updated_at: page.updated_at }), /Someone else saved/);
  assert.throws(() => ts.notes(chair, ctx.committeeIds.DISEC), /own committee/);
});
