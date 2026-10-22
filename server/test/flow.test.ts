import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { freshDb, as, person } from './helpers.ts';
import { all, one, run, scalar } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { config } from '../src/config.ts';

const { register } = await import('../src/services/registrations.ts');
const { createOrder, sandboxComplete, handleWebhook, approveRefund, requestRefund, completeRefund, postSettlement, markEventHeld, excessPayments, applyGatewayEvent } = await import('../src/services/payments.ts');
const { submitEvidence, approveEvidence, rejectEvidence, addBankLines } = await import('../src/services/evidence.ts');
const { trialBalance, reverse, balanceOf } = await import('../src/services/ledger.ts');
const { createExpense, approveExpense, payExpense } = await import('../src/services/expenses.ts');
const { reconcile, approveLines, payout, statement } = await import('../src/services/commission.ts');
const { linkReferral } = await import('../src/services/referrals.ts');
const { saveOrgSettings } = await import('../src/settings.ts');
const { razorpay } = await import('../src/services/gateways.ts');
const { expireHolds } = await import('../src/services/jobs.ts');

let ctx: ReturnType<typeof freshDb>;
before(() => { ctx = freshDb(); });

const balanced = () => { const t = trialBalance(); assert.equal(t.totals.debit, t.totals.credit, 'trial balance must balance'); };
const png = (s: string) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(s)]);
const reg = (id: string) => one('SELECT * FROM registration WHERE id = ?', id)!;

test('registration allots a provisional seat and quotes the fee with GST', () => {
  const { registration: r, allocation } = asSystem(() => register(ctx.eventId, person({ preferences: [ctx.committeeIds.UNSC] })));
  assert.equal(allocation.kind, 'seat');
  assert.equal(r.allot_status, 'held');
  assert.ok(r.hold_expires_at);
  assert.equal(r.gst_paise, Math.round(r.net_paise * 0.18));
  assert.equal(r.total_paise, r.net_paise + r.gst_paise);
  assert.match(r.ref, /^BGYS27-R-\d{6}$/);
});

test('duplicate email is refused and the link is re-sent', () => {
  const p = person();
  asSystem(() => register(ctx.eventId, p));
  assert.throws(() => asSystem(() => register(ctx.eventId, { ...p, mobile: '9988776655' })), /already registered/);
});

test('under-18 delegates need a parent or school consent contact', () => {
  assert.throws(() => asSystem(() => register(ctx.eventId, person({ dob: '2012-01-01' }))), /fix the highlighted/);
  const { registration: r } = asSystem(() => register(ctx.eventId, person({ dob: '2012-01-01', guardian_name: 'Parent', guardian_email: 'parent@example.com' })));
  assert.equal(r.guardian_consent, 'pending');
  assert.equal(r.is_minor, 1);
});

test('sandbox gateway: signed webhook confirms, books, invoices; replay is ignored; bad signature rejected', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person({ referral_name: 'Riya Kapoor' })));
  assert.equal(r.referral_state, 'linked');
  const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  assert.equal(o.amountPaise, r.total_paise);
  const res = asSystem(() => sandboxComplete(o.orderId, 'success'));
  assert.equal(res.status, 200);
  const after = reg(r.id);
  assert.equal(after.payment_status, 'paid');
  assert.equal(after.allot_status, 'confirmed');
  const inv = one('SELECT * FROM invoice WHERE registration_id = ?', r.id)!;
  assert.equal(inv.taxable_paise + inv.cgst_paise + inv.sgst_paise, r.total_paise);
  assert.ok(one("SELECT 1 FROM notification WHERE registration_id = ? AND template_key = 'payment_confirmed'", r.id));
  assert.ok(one('SELECT 1 FROM commission_line WHERE registration_id = ?', r.id), 'commission accrues');
  balanced();
  // Replay the same webhook: stored event id means it is ignored.
  const wh = one("SELECT * FROM webhook_event WHERE gateway = 'mock' ORDER BY received_at DESC LIMIT 1")!;
  const { hmacHex, sandboxSecret } = await import('../src/services/gateways.ts');
  const replay = asSystem(() => handleWebhook('mock', wh.raw_body, { 'x-sandbox-signature': hmacHex(sandboxSecret(), wh.raw_body), 'x-sandbox-event-id': wh.event_id }));
  assert.equal(replay.result, 'duplicate ignored');
  // Same payment under a new event id is still applied only once.
  const again = asSystem(() => handleWebhook('mock', wh.raw_body, { 'x-sandbox-signature': hmacHex(sandboxSecret(), wh.raw_body), 'x-sandbox-event-id': 'evt_other' }));
  assert.match(again.result, /already applied/);
  assert.equal(reg(r.id).paid_paise, r.total_paise);
  const forged = asSystem(() => handleWebhook('mock', wh.raw_body.replace('captured', 'captured '), { 'x-sandbox-signature': 'deadbeef', 'x-sandbox-event-id': 'evt_forged' }));
  assert.equal(forged.status, 401);
});

test('Razorpay webhook signature: HMAC-SHA256 of the raw body with the webhook secret', () => {
  config.razorpay.webhookSecret = 'whsec_test';
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100, status: 'captured' } } } });
  const sig = crypto.createHmac('sha256', 'whsec_test').update(body).digest('hex');
  assert.equal(razorpay.verifyWebhook(body, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_1' }).valid, true);
  assert.equal(razorpay.verifyWebhook(body + ' ', { 'x-razorpay-signature': sig }).valid, false);
  assert.equal(razorpay.verifyWebhook(body, { 'x-razorpay-event-id': 'evt_1' }).valid, false);
  assert.equal(razorpay.parseWebhook(JSON.parse(body))[0].kind, 'captured');
});

test('late webhook: callback → processing, then the gateway status fetch confirms', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  asSystem(() => sandboxComplete(o.orderId, 'success_no_webhook'));
  assert.notEqual(reg(r.id).payment_status, 'paid');
  const { checkoutCallback } = await import('../src/services/payments.ts');
  const st = await asSystem(() => checkoutCallback(o.orderId, {}));
  assert.equal(st.status, 'paid');
  assert.equal(one("SELECT verified_by FROM payment_transaction WHERE order_id = ?", o.orderId)!.verified_by, 'api_fetch');
});

test('screenshot path: duplicate UTR blocked, CFO approves, part payments keep a balance', () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const { registration: r2 } = asSystem(() => register(ctx.eventId, person()));
  const ev = asSystem(() => submitEvidence(r, { buffer: png('a' + r.id) }, { utr: '123456789012', amountPaise: 100000, paidOn: '2026-10-20' }));
  assert.equal(reg(r.id).payment_status, 'submitted');
  assert.ok(ev.flags.some((f: string) => /due/.test(f)), 'amount gap flagged to CFO');
  assert.throws(() => asSystem(() => submitEvidence(r2, { buffer: png('b' + r2.id) }, { utr: '1234 5678 9012', amountPaise: r2.total_paise, paidOn: '2026-10-20' })), /already been used/);
  assert.throws(() => asSystem(() => submitEvidence(r2, { buffer: Buffer.from('not an image') }, { utr: '999999999999', amountPaise: 1, paidOn: '2026-10-20' })), /JPG, PNG or PDF/);
  as('cfo@example.org', () => approveEvidence(ev.id));
  const after = reg(r.id);
  assert.equal(after.paid_paise, 100000);
  assert.equal(after.payment_status, 'pending', 'still a balance due');
  assert.equal(after.allot_status, 'held');
  balanced();
});

test('screenshot rejection asks for resubmission; bank CSV auto-matches by UTR and amount', () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const e1 = asSystem(() => submitEvidence(r, { buffer: png('c' + r.id) }, { utr: 'HDFCR52026102199', amountPaise: r.total_paise, paidOn: '2026-10-21' }));
  as('cfo@example.org', () => rejectEvidence(e1.id, 'Screenshot is cropped', 'resubmit'));
  assert.equal(reg(r.id).payment_status, 'pending');
  const e2 = asSystem(() => submitEvidence(reg(r.id), { buffer: png('d' + r.id) }, { utr: 'HDFCR52026102199', amountPaise: r.total_paise, paidOn: '2026-10-21' }));
  const matched = asSystem(() => addBankLines([{ date: '2026-10-21', description: `UPI/HDFCR52026102199/${r.ref}`, amountPaise: r.total_paise, direction: 'cr' }], 'batch-x'));
  assert.equal(matched, 1);
  assert.ok(one('SELECT bank_line_id FROM payment_evidence WHERE id = ?', e2.id)!.bank_line_id);
  as('cfo@example.org', () => approveEvidence(e2.id));
  assert.equal(reg(r.id).payment_status, 'paid');
});

test('maker-checker: a registration executive cannot approve; requester cannot approve own refund; large refunds need two CFOs', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  asSystem(() => sandboxComplete(o.orderId, 'success'));
  const id = as('cfo@example.org', () => requestRefund(r.id, 50000, 'Changed plans'));
  await assert.rejects(() => as('cfo@example.org', () => approveRefund(id)), /someone else must approve/);
  const res = await as('cfo2@example.org', () => approveRefund(id));
  assert.equal(res.status, 'processed');
  const after = reg(r.id);
  assert.equal(after.refunded_paise, 50000);
  assert.equal(after.payment_status, 'part_refunded');
  assert.ok(one("SELECT 1 FROM invoice WHERE registration_id = ? AND kind = 'credit_note'", r.id));
  balanced();
  // Full refund above the large-refund threshold needs a second, different approver.
  run("UPDATE event SET settings = json_set(settings, '$.largeRefundPaise', 10000) WHERE id = ?", ctx.eventId);
  const id2 = as('desk@example.org', () => requestRefund(r.id, after.paid_paise - 50000, 'Cancel'));
  const first = await as('cfo@example.org', () => approveRefund(id2));
  assert.equal(first.status, 'awaiting_second_approval');
  await assert.rejects(() => as('cfo@example.org', () => approveRefund(id2)), /different approver/);
  await as('cfo2@example.org', () => approveRefund(id2));
  const done = reg(r.id);
  assert.equal(done.payment_status, 'refunded');
  assert.ok(done.cancelled_at);
  assert.equal(scalar('SELECT COUNT(*) FROM seat WHERE registration_id = ?', r.id), 0, 'seat released');
  run("UPDATE event SET settings = json_set(settings, '$.largeRefundPaise', 1000000) WHERE id = ?", ctx.eventId);
});

test('pays twice: second payment held as excess and can be refunded', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const o1 = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  const ev = asSystem(() => submitEvidence(r, { buffer: png('e' + r.id) }, { utr: 'EXCESS0000001', amountPaise: r.total_paise, paidOn: '2026-10-21' }));
  asSystem(() => sandboxComplete(o1.orderId, 'success'));
  as('cfo@example.org', () => approveEvidence(ev.id));
  const ex = excessPayments().find((x) => x.registration_id === r.id);
  assert.equal(ex?.excess_paise, r.total_paise);
  balanced();
});

test('commission: slab true-up and refund reversal', async () => {
  const school = one("SELECT * FROM referrer WHERE kind = 'school'")!;
  const ids: string[] = [];
  for (let i = 0; i < 11; i++) {
    const { registration: r } = asSystem(() => register(ctx.eventId, person({ referral_name: school.name })));
    const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
    asSystem(() => sandboxComplete(o.orderId, 'success'));
    ids.push(r.id);
  }
  const lines = all('SELECT * FROM commission_line WHERE referrer_id = ?', school.id);
  assert.ok(lines.some((l) => l.kind === 'trueup'), 'crossing into the 7% slab re-prices earlier registrations');
  const st = statement(school.id);
  assert.equal(st.paidCount, 11);
  assert.equal(st.currentSlab?.label, '11–25');
  const expected = ids.map((id) => reg(id)).reduce((s, r) => s + Math.round(r.net_paise * 0.07), 0);
  assert.equal(st.totals.earned, expected);
  // A refund drops the count back to 10: everyone reverts to 5%.
  const last = reg(ids[10]);
  const rf = as('desk@example.org', () => requestRefund(last.id, last.paid_paise, 'Refund'));
  await as('cfo@example.org', () => approveRefund(rf));
  const st2 = statement(school.id);
  assert.equal(st2.paidCount, 10);
  assert.equal(st2.totals.earned, ids.slice(0, 10).map((id) => reg(id)).reduce((s, r) => s + Math.round(r.net_paise * 0.05), 0));
  assert.ok(all("SELECT 1 FROM commission_line WHERE referrer_id = ? AND kind = 'reversal'", school.id).length > 0);
  balanced();
});

test('commission payout deducts TDS and posts the journal', async () => {
  saveOrgSettings({ tds: { commissionRateBp: 200, thresholdPaise: 0, noPanRateBp: 2000, section: '393' } });
  const ref = one("SELECT * FROM referrer WHERE name = 'Riya Kapoor'")!;
  run("UPDATE commission_line SET status = 'accrued' WHERE referrer_id = ? AND status = 'held'", ref.id);
  as('cfo@example.org', () => approveLines(ref.id));
  const owed = scalar<number>("SELECT SUM(amount_paise) FROM commission_line WHERE referrer_id = ? AND status = 'approved'", ref.id);
  run('UPDATE commission_plan SET min_payout_paise = 0');
  const p = as('cfo@example.org', () => payout(ref.id, { reference: 'NEFT123' }));
  assert.equal(p.gross, owed);
  assert.equal(p.tds, Math.round(owed * 0.02));
  assert.equal(p.net, p.gross - p.tds);
  balanced();
});

test('unmatched referral waits in the queue and earns nothing until linked', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person({ referral_name: 'Riya Kapur' })));
  assert.equal(r.referral_state, 'unmatched');
  assert.ok(JSON.parse(r.referral_suggestions)[0].name === 'Riya Kapoor');
  const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  asSystem(() => sandboxComplete(o.orderId, 'success'));
  assert.equal(scalar('SELECT COUNT(*) FROM commission_line WHERE registration_id = ?', r.id), 0);
  const riya = one("SELECT id FROM referrer WHERE name = 'Riya Kapoor'")!;
  as('admin@example.org', () => { linkReferral(r.id, riya.id); reconcile(riya.id); });
  assert.equal(scalar('SELECT COUNT(*) FROM commission_line WHERE registration_id = ?', r.id), 1);
  // The spelling is learnt, so the next delegate who types it is linked at once.
  const { registration: r2 } = asSystem(() => register(ctx.eventId, person({ referral_name: 'riya kapur' })));
  assert.equal(r2.referral_state, 'linked');
});

test('posted journals are immutable; corrections are reversals; the audit log is append-only', () => {
  const e = one('SELECT * FROM journal_entry WHERE reverses_id IS NULL AND reversed_by_id IS NULL LIMIT 1')!;
  assert.throws(() => run('UPDATE journal_line SET debit_paise = 1 WHERE entry_id = ?', e.id), /immutable/);
  assert.throws(() => run('DELETE FROM journal_entry WHERE id = ?', e.id), /immutable/);
  assert.throws(() => run("UPDATE journal_entry SET narration = 'x' WHERE id = ?", e.id), /immutable/);
  const r = as('accounts@example.org', () => reverse(e.id, 'Mis-posted'));
  assert.ok(r.id);
  assert.throws(() => as('accounts@example.org', () => reverse(e.id, 'again')), /already been reversed/);
  assert.throws(() => run('DELETE FROM audit_log'), /append-only/);
  assert.throws(() => run("UPDATE audit_log SET action = 'x'"), /append-only/);
  balanced();
});

test('locked periods refuse postings', async () => {
  const { lockPeriod, unlockPeriod, post } = await import('../src/services/ledger.ts');
  as('cfo@example.org', () => lockPeriod('2026-09'));
  assert.throws(() => asSystem(() => post({ date: '2026-09-15', narration: 'x', sourceType: 'manual', lines: [{ account: 'bank', debit: 100 }, { account: 'equity', credit: 100 }] })), /locked/);
  as('cfo@example.org', () => unlockPeriod('2026-09', 'Late bill'));
});

test('expenses: approval limit, maker-checker, posting with GST input credit and TDS, payment', () => {
  const big = as('accounts@example.org', () => createExpense({ event_id: ctx.eventId, category: 'venue', description: 'Hall', bill_date: '2026-10-20', amount_paise: 5000000, gst_rate_bp: 1800, itc_eligible: true, tds_section: '194I', tds_rate_bp: 1000 }));
  assert.throws(() => as('accounts@example.org', () => approveExpense(big.id)), /someone else/);
  const small = as('desk@example.org', () => createExpense({ event_id: ctx.eventId, category: 'stationery', description: 'Pens', bill_date: '2026-10-20', amount_paise: 100000, gst_rate_bp: 1200, itc_eligible: false }));
  as('accounts@example.org', () => approveExpense(small.id));
  const big2 = as('desk@example.org', () => createExpense({ event_id: ctx.eventId, category: 'venue', description: 'Hall 2', bill_date: '2026-10-20', amount_paise: 5000000, gst_rate_bp: 1800, itc_eligible: true, tds_section: '194I', tds_rate_bp: 1000 }));
  assert.throws(() => as('accounts@example.org', () => approveExpense(big2.id)), /only the CFO/);
  as('cfo@example.org', () => approveExpense(big2.id));
  const e = one('SELECT * FROM expense WHERE id = ?', big2.id)!;
  assert.equal(e.tds_paise, 500000);
  as('cfo@example.org', () => payExpense(big2.id, { amountPaise: e.amount_paise + e.gst_paise - e.tds_paise, mode: 'bank' }));
  assert.equal(one('SELECT payment_status FROM expense WHERE id = ?', big2.id)!.payment_status, 'paid');
  assert.throws(() => as('accounts@example.org', () => createExpense({ event_id: ctx.eventId, category: 'venue', description: 'Hall 2', vendor_id: null, bill_date: '2026-10-20', amount_paise: 0 })), /amount/);
  balanced();
});

test('settlement import: net to bank, fee to expense, GST on fee to input credit, clearing cleared', async () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  const o = await asSystem(() => createOrder({ registrationIds: [r.id], gateway: 'mock' }));
  asSystem(() => sandboxComplete(o.orderId, 'success'));
  const t = one('SELECT * FROM payment_transaction WHERE order_id = ?', o.orderId)!;
  const before = balanceOf('clearing_mock');
  const fee = 4000, tax = 720;
  const s = as('accounts@example.org', () => postSettlement({ gateway: 'mock', settlementRef: 'setl_1', settledOn: '2026-10-21', paymentIds: [t.gateway_payment_id], grossPaise: t.amount_paise, feePaise: fee, taxPaise: tax, netPaise: t.amount_paise - fee - tax }));
  assert.deepEqual(s.issues, []);
  assert.equal(balanceOf('clearing_mock'), before - t.amount_paise);
  const bad = as('accounts@example.org', () => postSettlement({ gateway: 'mock', settlementRef: 'setl_2', settledOn: '2026-10-21', paymentIds: ['pay_unknown'], grossPaise: 1000, feePaise: 10, taxPaise: 2, netPaise: 900 }));
  assert.ok(bad.issues.length >= 2, 'mismatch flagged');
  balanced();
});

test('revenue recognition moves advance fees to income when the event is held', () => {
  const adv = -balanceOf('advance_fees', { eventId: ctx.eventId });
  assert.ok(adv > 0);
  as('cfo@example.org', () => markEventHeld(ctx.eventId));
  assert.equal(balanceOf('advance_fees', { eventId: ctx.eventId }), 0);
  assert.equal(-balanceOf('reg_income', { eventId: ctx.eventId }), adv);
  balanced();
  run("UPDATE event SET status = 'open' WHERE id = ?", ctx.eventId);
});

test('unpaid holds expire, the seat returns to the pool and the waitlist is promoted', () => {
  const { registration: r } = asSystem(() => register(ctx.eventId, person()));
  run("UPDATE registration SET hold_expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", r.id);
  asSystem(() => expireHolds());
  const after = reg(r.id);
  assert.equal(after.allot_status, 'released');
  assert.equal(after.payment_status, 'expired');
  assert.ok(one("SELECT 1 FROM notification WHERE registration_id = ? AND template_key = 'seat_released'", r.id));
});
