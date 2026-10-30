import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person } from './helpers.ts';
import { one, all } from '../src/db.ts';
import { asSystem } from '../src/util.ts';

const { register } = await import('../src/services/registrations.ts');

let ctx: ReturnType<typeof freshDb>;
before(() => { ctx = freshDb(); });
const portfolio = (committee: string, name: string) => one('SELECT p.id FROM portfolio p WHERE p.committee_id = ? AND p.name = ?', committee, name)!.id as string;
const seatOf = (regId: string) => one(`SELECT p.name, p.tier, c.short FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE s.registration_id = ?`, regId);
const lastReason = (regId: string) => one('SELECT reason FROM allotment_history WHERE registration_id = ? ORDER BY at DESC LIMIT 1', regId)?.reason ?? '';
const reg = (over: Record<string, any>) => asSystem(() => register(ctx.eventId, person(over)));

test('an experienced delegate gets the portfolio they asked for', () => {
  const unsc = ctx.committeeIds.UNSC;
  const { registration: r } = reg({ preferences: [unsc], portfolio_prefs: { [unsc]: portfolio(unsc, 'Russian Federation') }, mun_count: 4, awards_count: 1 });
  assert.deepEqual({ ...seatOf(r.id) }, { name: 'Russian Federation', tier: 'high', short: 'UNSC' });
  assert.equal(r.experience, 'experienced');
});

test('a first-timer asking for a high-tier portfolio gets a portfolio they qualify for in the same committee', () => {
  const unsc = ctx.committeeIds.UNSC;
  const { registration: r } = reg({ preferences: [unsc], portfolio_prefs: { [unsc]: portfolio(unsc, 'China') }, mun_count: 0 });
  const s = seatOf(r.id);
  assert.equal(s.short, 'UNSC');
  assert.notEqual(s.tier, 'high');
  assert.match(lastReason(r.id), /China needs 3\+ experience points \(has 0\)/);
});

test('a taken portfolio falls back to another qualifying one in the same committee', () => {
  const unsc = ctx.committeeIds.UNSC;
  const { registration: r } = reg({ preferences: [unsc], portfolio_prefs: { [unsc]: portfolio(unsc, 'Russian Federation') }, mun_count: 5 });
  const s = seatOf(r.id);
  assert.equal(s.short, 'UNSC');
  assert.equal(s.tier, 'high', 'an experienced delegate gets the strongest portfolio left');
  assert.notEqual(s.name, 'Russian Federation');
  assert.match(lastReason(r.id), /Russian Federation was already taken/);
});

test('half of other events count: 2 debates + 2 MUNs = 3 points', () => {
  const unsc = ctx.committeeIds.UNSC;
  const { registration: r } = reg({ preferences: [unsc], portfolio_prefs: { [unsc]: portfolio(unsc, 'France') }, mun_count: 2, other_events: 2 });
  assert.equal(seatOf(r.id).name, 'France');
});

test('when the preferred committee has nothing they qualify for, they are placed in another committee', () => {
  const unsc = ctx.committeeIds.UNSC;
  // Fill every UNSC seat a first-timer can hold.
  let placedElsewhere: any = null;
  for (let i = 0; i < 40 && !placedElsewhere; i++) {
    const { registration: r, allocation } = reg({ preferences: [unsc], mun_count: 0 });
    if (allocation.kind === 'seat' && allocation.pick.fallback) placedElsewhere = { r, allocation };
  }
  assert.ok(placedElsewhere, 'a first-timer was eventually placed outside UNSC');
  assert.notEqual(placedElsewhere.allocation.pick.committeeShort, 'UNSC');
  assert.notEqual(placedElsewhere.allocation.pick.tier, 'high');
  assert.match(lastReason(placedElsewhere.r.id), /placed in/);
  // High-tier UNSC seats were never given to first-timers.
  const highHeldByFirstTimers = all(`SELECT 1 FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN registration r ON r.id = s.registration_id
    WHERE p.committee_id = ? AND p.tier = 'high' AND r.mun_count = 0 AND r.awards_count = 0 AND r.other_events < 2`, unsc);
  assert.equal(highHeldByFirstTimers.length, 0);
});

test('the payment window is 24 hours by default', () => {
  const { registration: r } = reg({ preferences: [ctx.committeeIds.DISEC], mun_count: 1 });
  const hours = (new Date(r.hold_expires_at).getTime() - new Date(r.created_at).getTime()) / 3600_000;
  assert.ok(Math.abs(hours - 24) < 0.1, `hold is ${hours} hours`);
});

test('the form refuses a portfolio from another committee and a negative MUN count', () => {
  const unsc = ctx.committeeIds.UNSC, disec = ctx.committeeIds.DISEC;
  assert.throws(() => reg({ preferences: [disec], portfolio_prefs: { [disec]: portfolio(unsc, 'India') } }), /highlighted fields/);
  assert.throws(() => reg({ preferences: [disec], mun_count: -2 }), /highlighted fields/);
});

test('a delegate with the wrong portfolio asks for another one in their committee; approval moves them there', async () => {
  const { requestSwap, decideSwap, changeOptions } = await import('../src/services/registrations.ts');
  const disec = ctx.committeeIds.DISEC;
  const { registration: r } = reg({ preferences: [disec], mun_count: 1 });
  const before = seatOf(r.id);
  const options = changeOptions(one('SELECT * FROM registration WHERE id = ?', r.id)!);
  const target = options.find((c: any) => c.id === disec)!.portfolios.find((p: any) => p.qualifies && p.name !== before.name)!;
  assert.throws(() => requestSwap(one('SELECT * FROM registration WHERE id = ?', r.id)!, { committee_id: disec }), /Pick the portfolio you want/);
  const id = requestSwap(one('SELECT * FROM registration WHERE id = ?', r.id)!, { committee_id: disec, portfolio_id: target.id, reason: 'wrong_portfolio', note: 'I asked for this in my form' });
  assert.throws(() => requestSwap(one('SELECT * FROM registration WHERE id = ?', r.id)!, { committee_id: disec, portfolio_id: target.id }), /already have a pending/);
  asSystem(() => decideSwap(id, true, ['admin']));
  assert.equal(seatOf(r.id).name, target.name);
  assert.equal(one('SELECT reason FROM swap_request WHERE id = ?', id).reason, 'wrong_portfolio');
});
