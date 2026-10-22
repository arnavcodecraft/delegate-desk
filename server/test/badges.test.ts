import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, person } from './helpers.ts';
import { all, one, run } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { badgesPdf, certificatesPdf, checkIn, checkinCode } from '../src/services/badges.ts';
const { register } = await import('../src/services/registrations.ts');
const { createOrder, sandboxComplete } = await import('../src/services/payments.ts');

let ev = ''; let unsc = ''; const regs: any[] = [];
before(async () => {
  const c = freshDb(); ev = c.eventId; unsc = c.committeeIds.UNSC;
  for (let i = 0; i < 9; i++) {
    const { registration: r } = asSystem(() => register(ev, person({ preferences: [unsc] })));
    const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
    asSystem(() => sandboxComplete(o.orderId, 'success'));
    regs.push(one('SELECT * FROM registration WHERE id = ?', r.id));
  }
});
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;

test('badges: eight per page, only confirmed delegates', async () => {
  const pdf = await badgesPdf(ev);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pages(pdf), 2);
});

test('certificates: one page each, award wording when set', async () => {
  run("UPDATE registration SET award = 'Best Delegate' WHERE id = ?", regs[0].id);
  const pdf = await certificatesPdf(ev, { ids: [regs[0].id, regs[1].id] });
  assert.equal(pages(pdf), 2);
  await assert.rejects(() => certificatesPdf(ev, { attendedOnly: true }), /No delegates/);
});

test('check-in with the signed badge QR; forged and out-of-scope codes are refused', () => {
  const r = regs[2];
  const first = asSystem(() => checkIn(ev, checkinCode(r.ref), null));
  assert.equal(first.name, r.full_name);
  assert.equal(first.alreadyCheckedIn, null);
  assert.ok(one('SELECT attended_at FROM registration WHERE id = ?', r.id)!.attended_at);
  assert.ok(asSystem(() => checkIn(ev, checkinCode(r.ref), null)).alreadyCheckedIn, 'second scan says already checked in');
  assert.throws(() => checkIn(ev, `DD1:${r.ref}:AAAAAAAAAAAA`, null), /not a valid badge/);
  const ls = one("SELECT id FROM committee WHERE short = 'LS'")!.id;
  assert.throws(() => asSystem(() => checkIn(ev, regs[3].ref, [ls])), /not yours/);
  assert.equal(asSystem(() => checkIn(ev, regs[3].ref.toLowerCase(), [unsc])).ref, regs[3].ref, 'typed ID works too');
});

test('unpaid delegates are held at the door, not marked present', () => {
  const r = regs[4];
  run("UPDATE seat SET state = 'held' WHERE registration_id = ?", r.id);
  const res = asSystem(() => checkIn(ev, r.ref, null));
  assert.equal(res.admitted, false);
  assert.match(res.reason!, /not confirmed/);
  assert.equal(one('SELECT attended_at FROM registration WHERE id = ?', r.id)!.attended_at, null);
});
