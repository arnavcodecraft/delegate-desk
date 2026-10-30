import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.ts';
import { newState, apply, quorum, ranking, cfg, createSession, chairAction, view, claimSeat, selfPresence, submitDoc, chatSend, chatList, requestToSpeak, type LiveState, type Action } from '../src/services/live.ts';

const GA = [['India', 'in'], ['Japan', 'jp'], ['Brazil', 'br'], ['France', 'fr'], ['China', 'cn'], ['Kenya', 'ke']].map(([name, code]) => ({ name, code }));
const run = (s: LiveState, ...as: Action[]) => as.reduce(apply, s);
const id = (s: LiveState, name: string) => s.delegates.find((d) => d.name === name)!.id;

test('room settings: checked values, quorum rule, P5 veto follows the setting, bad values refused', () => {
  let s = newState({ name: 'GA', delegates: GA });
  assert.equal(cfg(s).quorum, 'third');
  s = run(s, { type: 'settings', patch: { quorum: 'two_thirds', threshold: 'consensus', chat: false } });
  assert.equal(quorum(s).need, 4);
  assert.equal(cfg(s).chat, false);
  assert.throws(() => apply(s, { type: 'settings', patch: { threshold: 'whatever' } }));
  assert.throws(() => apply(s, { type: 'settings', patch: { points: { gsl: { pts: 500 } } } }));
  s = run(s, { type: 'settings', patch: { veto: 'p5' } });
  assert.deepEqual(s.committee.veto, [id(s, 'France'), id(s, 'China')]);
  s = run(s, { type: 'settings', patch: { veto: 'none' } });
  assert.deepEqual(s.committee.veto, []);
});

test('consensus and P5 veto decide substantive votes; passing and voting with rights are recorded', () => {
  let s = run(newState({ name: 'GA', delegates: GA }), { type: 'mark_all', presence: 'present' }, { type: 'settings', patch: { threshold: 'consensus' } });
  s = apply(s, { type: 'vote_open', title: 'DR 1', kind: 'substantive' });
  assert.equal(s.vote!.rule, 'consensus');
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: d.name === 'Kenya' ? 'against' : 'for', rights: d.name === 'India' });
  assert.deepEqual(s.vote!.rights, [id(s, 'India')]);
  s = apply(s, { type: 'ballot', delegateId: id(s, 'Brazil'), ballot: 'pass' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.passed, false, 'one against breaks consensus');
  assert.equal(s.vote!.result!.for, 4, 'a pass is not counted');
  s = run(s, { type: 'vote_clear' }, { type: 'settings', patch: { threshold: 'simple', veto: 'p5', allowPass: false } });
  s = apply(s, { type: 'vote_open', title: 'DR 2', kind: 'substantive' });
  assert.throws(() => apply(s, { type: 'ballot', delegateId: id(s, 'Brazil'), ballot: 'pass' }), /not allowed/);
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: d.name === 'China' ? 'against' : 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.passed, false);
  assert.deepEqual(s.vote!.result!.vetoedBy, ['China']);
});

test('speeches, right of reply, yields and extra time; the floor waits for Start', () => {
  let s = run(newState({ name: 'GA', delegates: GA }), { type: 'mark_all', presence: 'present' });
  s = run(s, { type: 'speaker_add', delegateId: id(s, 'India') }, { type: 'speaker_add', delegateId: id(s, 'Japan') }, { type: 'speaker_add', delegateId: id(s, 'Brazil') });
  s = apply(s, { type: 'speaker_move', delegateId: id(s, 'Brazil'), to: 0 });
  assert.equal(s.speakers.queue[0], id(s, 'Brazil'));
  s = apply(s, { type: 'speaker_next', start: false });
  assert.equal(s.speakers.current, id(s, 'Brazil'));
  assert.equal(s.timer.startedAt, null, 'ready to speak, not started');
  s = run(s, { type: 'timer', op: 'add', seconds: 15 });
  assert.equal(s.timer.remaining, 75);
  s = apply(s, { type: 'yield', to: id(s, 'Kenya') });
  assert.equal(s.speakers.current, id(s, 'Kenya'));
  assert.equal(s.timer.remaining, 75, 'the remaining time goes to the delegation yielded to');
  s = apply(s, { type: 'rtr', delegateId: id(s, 'France'), seconds: 30 });
  assert.match(s.timer.label, /Right of reply/);
  s = apply(s, { type: 'yield', to: 'chair' });
  assert.equal(s.speakers.current, null);
  const r = ranking(s);
  assert.equal(r.find((x) => x.name === 'Brazil')!.counts.gsl, 1);
  assert.equal(r.find((x) => x.name === 'France')!.counts.rtr, 1);
  assert.equal(r[0].name, 'Brazil', 'GSL speech (10) beats right of reply (5)');
});

test('motions: tour de table queues everyone, switched-off motions are refused, custom needs a text, points for raising and passing', () => {
  let s = run(newState({ name: 'GA', delegates: GA }), { type: 'mark_all', presence: 'present' });
  s = apply(s, { type: 'motion_add', motionType: 'tour_de_table', proposer: id(s, 'Japan'), speakingTime: 45 });
  s = apply(s, { type: 'motion_vote', motionId: s.motions[0].id });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.mode, 'tour');
  assert.equal(s.speakers.queue.length, 6);
  assert.equal(s.speakers.speakingTime, 45);
  const japan = ranking(s).find((x) => x.name === 'Japan')!;
  assert.equal(japan.counts.raised, 1); assert.equal(japan.counts.passed, 1);
  s = apply(s, { type: 'settings', patch: { motions: [{ key: 'consultation', on: false }, { key: 'tour_de_table', on: true }, { key: 'unmoderated', on: true }, { key: 'moderated', on: true, label: 'Mod caucus' }] } });
  assert.throws(() => apply(s, { type: 'motion_add', motionType: 'consultation', duration: 300 }), /doesn't use/);
  assert.throws(() => apply(s, { type: 'motion_add', motionType: 'custom' }), /Say what/);
  assert.throws(() => apply(s, { type: 'settings', patch: { motions: [{ key: 'moderated', on: true }] } }), /Rank every motion/);
});

test('documents: approval, limits, voting on a draft resolution and credit for sponsors', () => {
  let s = run(newState({ name: 'GA', delegates: GA }), { type: 'mark_all', presence: 'present' }, { type: 'settings', patch: { docs: { approve: true, dr: { max: 1 } } } });
  s = apply(s, { type: 'doc_add', kind: 'dr', title: 'DR 1.1', sponsors: [id(s, 'India')], by: id(s, 'India') });
  assert.equal(s.docs![0].status, 'pending');
  assert.throws(() => apply(s, { type: 'doc_add', kind: 'dr', title: 'DR 1.2' }), /at most 1/);
  assert.throws(() => apply(s, { type: 'doc_vote', docId: s.docs![0].id }), /not open/);
  s = apply(s, { type: 'doc_status', docId: s.docs![0].id, status: 'open' });
  s = apply(s, { type: 'doc_vote', docId: s.docs![0].id });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.docs![0].status, 'passed');
  const india = ranking(s).find((x) => x.name === 'India')!;
  assert.equal(india.counts.dr, 1); assert.equal(india.counts.drPassed, 1);
  assert.throws(() => apply(s, { type: 'doc_add', kind: 'wp', title: 'WP', link: 'http://insecure.example' }), /https/);
});

test('waiting room, self roll call, chat privacy and what delegates can see', () => {
  const { code, chairKey } = createSession({ name: 'GA', delegates: GA });
  const s0 = view(code, { chairKey }) as any;
  const india = s0.delegates.find((d: any) => d.name === 'India').id, japan = s0.delegates.find((d: any) => d.name === 'Japan').id, kenya = s0.delegates.find((d: any) => d.name === 'Kenya').id;
  chairAction(code, chairKey, { type: 'settings', patch: { openJoin: false } });
  const seatI = claimSeat(code, india); assert.equal(seatI.waiting, true);
  assert.throws(() => requestToSpeak(code, india, seatI.seatToken), /not let you in/);
  assert.equal((view(code, { seat: `${india}.${seatI.seatToken}` }) as any).waiting, true);
  chairAction(code, chairKey, { type: 'seat_decide', delegateId: india, accept: true });
  requestToSpeak(code, india, seatI.seatToken);
  // Roll call from the delegate's own phone.
  assert.throws(() => selfPresence(code, india, seatI.seatToken, 'present'), /Roll call is not open/);
  chairAction(code, chairKey, { type: 'roll_call', on: true });
  selfPresence(code, india, seatI.seatToken, 'present_voting');
  assert.equal((view(code) as any).delegates.find((d: any) => d.id === india).presence, 'present_voting');
  // Chat: everyone, the chair, and private messages between two delegations.
  chairAction(code, chairKey, { type: 'settings', patch: { openJoin: true } });
  const seatJ = claimSeat(code, japan), seatK = claimSeat(code, kenya);
  const I = `${india}.${seatI.seatToken}`, J = `${japan}.${seatJ.seatToken}`, K = `${kenya}.${seatK.seatToken}`;
  chatSend(code, null, I, 'all', 'Hello room');
  chatSend(code, null, I, japan, 'Bloc after this?');
  chatSend(code, chairKey, null, kenya, 'Please mute');
  assert.deepEqual(chatList(code, null, J).messages.map((m: any) => m.text), ['Hello room', 'Bloc after this?']);
  assert.deepEqual(chatList(code, null, K).messages.map((m: any) => m.text), ['Hello room', 'Please mute'], 'Kenya never sees the India–Japan message');
  assert.throws(() => chatList(code, null, `${kenya}.wrong`), /Join/);
  chairAction(code, chairKey, { type: 'settings', patch: { chat: false } });
  assert.throws(() => chatSend(code, null, J, 'all', 'hi'), /turned chat off/);
  chatSend(code, chairKey, null, 'all', 'Chat is closed');
  // Delegates submit papers; the ranking and the waiting room are only for the chair.
  submitDoc(code, japan, seatJ.seatToken, { kind: 'wp', title: 'WP 1' });
  const pub = view(code) as any, chair = view(code, { chairKey }) as any;
  assert.equal(pub.docs.length, 1); assert.equal(pub.docs[0].sponsors[0], japan);
  assert.equal(pub.ranking, undefined); assert.equal(pub.stats, undefined); assert.equal(pub.pending, undefined);
  assert.ok(Array.isArray(chair.ranking)); assert.ok(chair.online.includes(india));
});
