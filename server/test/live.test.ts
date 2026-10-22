import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.ts';
import { newState, apply, quorum, createSession, chairAction, view, claimSeat, deviceBallot, requestToSpeak, type LiveState, type Action } from '../src/services/live.ts';

const SC = [
  ['United States', 'us'], ['China', 'cn'], ['Russian Federation', 'ru'], ['United Kingdom', 'gb'], ['France', 'fr'],
  ['Bahrain', 'bh'], ['Colombia', 'co'], ['DR Congo', 'cd'], ['Latvia', 'lv'], ['Liberia', 'lr'], ['Denmark', 'dk'], ['Greece', 'gr'], ['Pakistan', 'pk'], ['Panama', 'pa'], ['Somalia', 'so'],
].map(([name, code]) => ({ name, code }));
const run = (s: LiveState, ...as: Action[]) => as.reduce(apply, s);
const id = (s: LiveState, name: string) => s.delegates.find((d) => d.name === name)!.id;
const allPresent = (s: LiveState) => run(s, { type: 'mark_all', presence: 'present' });

test('the P5 are detected as veto holders and quorum is a third present', () => {
  let s = newState({ name: 'Security Council', delegates: SC });
  assert.equal(s.committee.veto.length, 5);
  assert.equal(quorum(s).debate, false);
  for (const d of s.delegates.slice(0, 5)) s = apply(s, { type: 'presence', delegateId: d.id, presence: 'present' });
  assert.equal(quorum(s).debate, true);
  assert.equal(quorum(s).substantive, false);
});

test('Security Council substance: nine votes and no P5 veto', () => {
  let s = allPresent(newState({ name: 'Security Council', delegates: SC }));
  s = apply(s, { type: 'vote_open', title: 'Draft resolution 1.1', kind: 'substantive', rule: 'security_council' });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: d.code === 'ru' ? 'against' : 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.for, 14);
  assert.equal(s.vote!.result!.passed, false, 'one permanent member against vetoes it');
  assert.deepEqual(s.vote!.result!.vetoedBy, ['Russian Federation']);
  // An abstaining permanent member is not a veto.
  s = apply(s, { type: 'vote_open', title: 'Draft resolution 1.2', kind: 'substantive', rule: 'security_council' });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: d.code === 'ru' ? 'abstain' : d.code === 'pa' || d.code === 'so' || d.code === 'gr' || d.code === 'dk' || d.code === 'pk' || d.code === 'lv' ? 'against' : 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.for, 8);
  assert.equal(s.vote!.result!.passed, false, 'eight is one short of nine');
});

test('two-thirds motions and no abstentions on procedural votes', () => {
  let s = allPresent(newState({ name: 'GA', delegates: SC.slice(0, 9) }));
  s = apply(s, { type: 'motion_add', motionType: 'close_debate', proposer: id(s, 'France') });
  s = apply(s, { type: 'motion_vote', motionId: s.motions[0].id });
  assert.throws(() => apply(s, { type: 'ballot', delegateId: s.delegates[0].id, ballot: 'abstain' }), /No abstentions/);
  s.delegates.forEach((d, i) => { s = apply(s, { type: 'ballot', delegateId: d.id, ballot: i < 6 ? 'for' : 'against' }); });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.passed, true, '6 of 9 is exactly two-thirds');
  assert.equal(s.motions[0].status, 'passed');
  assert.equal(s.mode, 'voting', 'closing debate moves into voting');
});

test('a moderated caucus that passes starts its timer and sets the speaking time', () => {
  let s = allPresent(newState({ name: 'UNHRC', delegates: SC.slice(5) }));
  s = run(s, { type: 'motion_add', motionType: 'moderated', proposer: id(s, 'Latvia'), duration: 600, speakingTime: 45, topic: 'Climate refugees' },
    { type: 'motion_add', motionType: 'unmoderated', duration: 300 });
  s = apply(s, { type: 'motion_vote', motionId: s.motions[0].id });
  for (const d of s.delegates) s = apply(s, { type: 'ballot', delegateId: d.id, ballot: 'for' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.mode, 'moderated');
  assert.equal(s.timer.duration, 600);
  assert.equal(s.speakers.speakingTime, 45);
  assert.equal(s.motions[1].status, 'withdrawn', 'other pending motions fall once one passes');
});

test('present-and-voting delegates cannot abstain; absent delegates cannot speak', () => {
  let s = newState({ name: 'DISEC', delegates: SC.slice(0, 4) });
  s = run(s, { type: 'presence', delegateId: id(s, 'China'), presence: 'present_voting' }, { type: 'presence', delegateId: id(s, 'United Kingdom'), presence: 'present' }, { type: 'presence', delegateId: id(s, 'United States'), presence: 'present' });
  assert.throws(() => apply(s, { type: 'speaker_add', delegateId: id(s, 'Russian Federation') }), /not marked present/);
  s = apply(s, { type: 'vote_open', title: 'Resolution', kind: 'substantive', rule: 'simple' });
  assert.throws(() => apply(s, { type: 'ballot', delegateId: id(s, 'China'), ballot: 'abstain' }), /cannot abstain/);
  s = run(s, { type: 'ballot', delegateId: id(s, 'China'), ballot: 'for' }, { type: 'ballot', delegateId: id(s, 'United Kingdom'), ballot: 'abstain' }, { type: 'ballot', delegateId: id(s, 'United States'), ballot: 'against' });
  s = apply(s, { type: 'vote_close' });
  assert.equal(s.vote!.result!.passed, false, '1–1 with an abstention is not a majority');
});

test('a stored session: chair key required, delegates claim seats, ask to speak and vote on devices', () => {
  const { code, chairKey } = createSession({ name: 'WHO', delegates: [{ name: 'India', code: 'in' }, { name: 'Kenya', code: 'ke' }, { name: 'Peru', code: 'pe' }] });
  assert.match(code, /^[A-Z0-9]{6}$/);
  const v0 = view(code) as any;
  assert.equal(v0.isChair, false);
  assert.throws(() => chairAction(code, 'wrong', { type: 'mark_all', presence: 'present' }), /Only the chair/);
  chairAction(code, chairKey, { type: 'mark_all', presence: 'present' });
  const india = v0.delegates[0].id;
  const { seatToken } = claimSeat(code, india);
  assert.throws(() => claimSeat(code, india), /already joined/);
  requestToSpeak(code, india, seatToken);
  assert.deepEqual((view(code) as any).speakers.requests, [india]);
  assert.throws(() => deviceBallot(code, india, seatToken, 'for'), /not open/);
  chairAction(code, chairKey, { type: 'vote_open', title: 'Resolution 1', kind: 'substantive', rule: 'simple', deviceVoting: true });
  deviceBallot(code, india, seatToken, 'for');
  assert.throws(() => deviceBallot(code, india, 'stolen', 'against'), /Join as your delegation/);
  const v = view(code, { chairKey }) as any;
  assert.equal(v.tally.for, 1);
  assert.deepEqual(v.claimed, [india]);
  assert.equal((view(code, { since: v.version }) as any).unchanged, true, 'polling returns nothing new when unchanged');
});
