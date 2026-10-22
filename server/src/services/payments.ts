import { all, one, run, insert, tx, update, nextCounter, scalar } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { currentWorkspace } from '../platform.ts';
import { onlyApprover } from '../auth.ts';
import { eventSettings, getEvent, getOrg, orgSettings } from '../settings.ts';
import { bad, conflict, ctx, forbidden, fyOf, inr, istDate, json, now, uid, notFound, addHours } from '../util.ts';
import { post, clearingAccount } from './ledger.ts';
import { enqueue, notifyStaff } from './notify.ts';
import { allocate, confirmSeat, releaseSeat, seatOf, promoteWaitlist } from './allocation.ts';
import { balanceOf, payableNow } from './fees.ts';
import { reconcile } from './commission.ts';
import { gateways, isHealthy, markUnhealthy, markHealthy, sandboxSecret, hmacHex, verifyRazorpayCheckout, type GatewayName, type GwPayment } from './gateways.ts';

export const portalLink = (reg: any) => `${config.baseUrl}/r/${reg.token}`;

/** Merge fields shared by every delegate email. */
export function regVars(reg: Record<string, any>, extra: Record<string, unknown> = {}) {
  const ev = getEvent(reg.event_id);
  const s = eventSettings(ev);
  const seat = seatOf(reg.id);
  return {
    name: reg.full_name, ref: reg.ref, institution: reg.institution, event_name: ev.name,
    event_dates: [ev.start_date, ev.end_date].filter(Boolean).join(' to '), venue: ev.venue ?? '',
    committee: seat?.committee ?? 'To be allotted', portfolio: seat?.portfolio ?? '—', guide_link: seat?.guide_url ?? portalLink(reg),
    amount: inr(payableNow(reg) || balanceOf(reg)), due_date: reg.hold_expires_at ? new Date(reg.hold_expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '—',
    payment_link: `${portalLink(reg)}#pay`, portal_link: portalLink(reg), upload_link: `${portalLink(reg)}#upload`,
    referral_name: reg.referral_name ?? '', waitlist_position: reg.waitlist_position ?? '',
    dress_code: s.dressCode, reporting_time: s.reportingTime, unsubscribe_link: `${config.baseUrl}/api/public/unsubscribe/${reg.token}`,
    ...extra,
  };
}

// ---------------- gateway selection ----------------
export function availableGateways(eventId: string, amountPaise = 0) {
  const s = eventSettings(eventId);
  const list = (Object.keys(gateways) as GatewayName[])
    .filter((g) => s.gateways[g]?.enabled && !s.gateways[g]?.down && gateways[g].configured() && isHealthy(g))
    .filter((g) => g !== 'mock' || config.allowSandbox)
    // The gateway keys belong to the platform's own account, so organisers on their own workspace never get them;
    // they collect through their own bank, QR, payment link or in person.
    .filter(() => !currentWorkspace().tag);
  const routed = s.routing.find((r) => amountPaise <= r.maxPaise && list.includes(r.gateway))?.gateway;
  const preferred = routed ?? (list.includes(s.defaultGateway) ? s.defaultGateway : list[0]);
  return {
    gateways: list.sort((a, b) => (a === preferred ? -1 : b === preferred ? 1 : 0)).map((g) => ({ name: g, label: gateways[g].label, default: g === preferred })),
    screenshot: s.screenshotEnabled,
  };
}

// ---------------- orders ----------------
export async function createOrder(o: { registrationIds: string[]; gateway: GatewayName; delegationId?: string | null }) {
  const regs = o.registrationIds.map((id) => one('SELECT * FROM registration WHERE id = ?', id)).filter(Boolean) as any[];
  if (!regs.length) throw notFound('Registration');
  const eventId = regs[0].event_id;
  // A delegate whose hold expired can still pay: re-allot first, and refuse if only the waitlist is left.
  for (const r of regs) {
    if (r.cancelled_at) throw conflict(`${r.ref} is cancelled`);
    if (r.allot_status === 'released' || r.allot_status === 'none') {
      update('registration', r.id, { allot_status: 'none', payment_status: 'pending' });
      const res = allocate(r.id);
      if (res.kind === 'waitlist') throw conflict('All seats are taken right now, so you have been placed on the waitlist. We will email you when a seat opens; do not pay until then.');
      Object.assign(r, one('SELECT * FROM registration WHERE id = ?', r.id));
    }
    if (r.allot_status === 'waitlisted') throw conflict('You are on the waitlist. Payment opens when a seat is offered to you.');
    if (r.payment_status === 'submitted') throw conflict('A payment proof is already under review for this registration');
  }
  // The server fixes the amount; the browser never sets the price.
  const covers = regs.map((r) => ({ registrationId: r.id, amount: payableNow(r) })).filter((c) => c.amount > 0);
  const amount = covers.reduce((s, c) => s + c.amount, 0);
  if (amount <= 0) throw conflict('Nothing is due on this registration');
  const avail = availableGateways(eventId, amount).gateways.map((g) => g.name);
  if (!avail.includes(o.gateway)) throw conflict('That payment method is unavailable right now. Please choose another option.');
  const gw = gateways[o.gateway];
  const orderId = uid();
  const lead = regs[0];
  let created;
  try {
    created = await gw.createOrder({
      orderId, amountPaise: amount, ref: lead.ref, name: lead.full_name, email: lead.email, mobile: lead.mobile,
      returnUrl: `${portalLink(lead)}?order=${orderId}`, notifyUrl: `${config.baseUrl}/api/webhooks/${o.gateway}`,
    });
    markHealthy(o.gateway);
  } catch (e: any) {
    markUnhealthy(o.gateway);
    throw conflict(`${o.gateway === 'mock' ? 'Sandbox' : o.gateway} is not responding. Please try another payment option.`, { cause: e.message });
  }
  insert('payment_order', {
    id: orderId, registration_id: regs.length === 1 ? lead.id : null, delegation_id: o.delegationId ?? null, covers: JSON.stringify(covers),
    gateway: o.gateway, amount_paise: amount, gateway_order_id: created.gatewayOrderId, session: created.session ?? null,
    status: 'created', created_at: now(), updated_at: now(),
  });
  audit('order.create', 'payment_order', orderId, undefined, { gateway: o.gateway, amount, covers });
  const ev = getEvent(eventId);
  return { orderId, amountPaise: amount, gateway: o.gateway, checkout: { ...created.checkout, name: ev.name, description: `${lead.ref} registration` } };
}

/** Browser success callback: only shows "processing"; confirmation needs the webhook or a server-side status fetch. */
export async function checkoutCallback(orderId: string, payload: Record<string, any>) {
  const order = one('SELECT * FROM payment_order WHERE id = ?', orderId);
  if (!order) throw notFound('Order');
  if (order.gateway === 'razorpay' && payload.razorpay_signature) {
    if (!verifyRazorpayCheckout(order.gateway_order_id, payload.razorpay_payment_id, payload.razorpay_signature)) throw bad('Payment signature did not verify');
  }
  if (order.status === 'created') {
    run("UPDATE payment_order SET status = 'processing', updated_at = ? WHERE id = ?", now(), orderId);
    for (const c of json<any[]>(order.covers, [])) run("UPDATE registration SET payment_status = 'processing', updated_at = ? WHERE id = ? AND payment_status IN ('pending','failed','expired')", now(), c.registrationId);
  }
  await resolveOrder(orderId);
  return orderStatus(orderId);
}

export function orderStatus(orderId: string) {
  const o = one('SELECT id, status, amount_paise, gateway, covers FROM payment_order WHERE id = ?', orderId);
  if (!o) throw notFound('Order');
  return { ...o, covers: json(o.covers, []) };
}

/** Ask the gateway's API directly (instant feedback after callback; also the fix for late webhooks). */
export async function resolveOrder(orderId: string) {
  const order = one('SELECT * FROM payment_order WHERE id = ?', orderId);
  if (!order || order.status === 'paid') return order?.status;
  let payments: GwPayment[] = [];
  try { payments = await gateways[order.gateway as GatewayName].fetchPayments(order.gateway_order_id, order.session); } catch { return order.status; }
  for (const p of payments) if (p.kind === 'captured') applyGatewayEvent(order.gateway, { ...p, gatewayOrderId: order.gateway_order_id }, 'api_fetch');
  return one('SELECT status FROM payment_order WHERE id = ?', orderId)?.status;
}

// ---------------- webhooks ----------------
export function handleWebhook(gateway: GatewayName, raw: string, headers: Record<string, any>) {
  const gw = gateways[gateway];
  if (!gw) throw notFound('Gateway');
  const { valid, eventId } = gw.verifyWebhook(raw, headers);
  let body: any = null; try { body = JSON.parse(raw); } catch { /* stored raw anyway */ }
  return tx(() => {
    const dup = one('SELECT id, result FROM webhook_event WHERE gateway = ? AND event_id = ?', gateway, eventId);
    if (dup) {
      audit('webhook.duplicate', 'webhook_event', dup.id, undefined, { gateway, eventId });
      return { status: 200, result: 'duplicate ignored' };
    }
    const id = uid();
    insert('webhook_event', { id, gateway, event_id: eventId, type: body?.event ?? body?.type ?? null, signature_valid: valid ? 1 : 0, raw_body: raw, received_at: now() });
    if (!valid) {
      run("UPDATE webhook_event SET result = 'rejected: bad signature', processed_at = ? WHERE id = ?", now(), id);
      return { status: 401, result: 'invalid signature' };
    }
    const results = gw.parseWebhook(body).map((p) => applyGatewayEvent(gateway, p, 'webhook'));
    run('UPDATE webhook_event SET result = ?, processed_at = ? WHERE id = ?', results.join('; '), now(), id);
    return { status: 200, result: results.join('; ') };
  });
}

/** Apply one normalised gateway event. Idempotent on (gateway, payment id). */
export function applyGatewayEvent(gateway: string, p: GwPayment, verifiedBy: 'webhook' | 'api_fetch'): string {
  return tx(() => {
    if (p.kind === 'refund_processed' || p.kind === 'refund_failed') {
      const r = p.refundId ? one('SELECT * FROM refund WHERE gateway_refund_id = ?', p.refundId) : null;
      if (!r) return 'refund event: no matching refund';
      if (p.kind === 'refund_processed' && r.status !== 'processed') { completeRefund(r.id, p.refundId!); return 'refund processed'; }
      if (p.kind === 'refund_failed') { update('refund', r.id, { status: 'failed', note: 'Gateway reported failure' }); notifyStaff(['cfo'], 'staff_alert', { title: 'Refund failed at gateway', message: `Refund ${r.id} for ${inr(r.amount_paise)} failed. Process it manually.` }); return 'refund failed'; }
      return 'refund noted';
    }
    const order = p.gatewayOrderId ? one('SELECT * FROM payment_order WHERE gateway = ? AND gateway_order_id = ?', gateway, p.gatewayOrderId) : null;
    if (!order) return `no order for ${p.gatewayOrderId}`;
    if (p.kind === 'authorized') return 'authorized (logged; waiting for capture)';
    if (p.kind === 'failed') {
      if (order.status !== 'paid') {
        run("UPDATE payment_order SET status = 'failed', updated_at = ? WHERE id = ?", now(), order.id);
        for (const c of json<any[]>(order.covers, [])) run("UPDATE registration SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status IN ('pending','processing')", now(), c.registrationId);
      }
      audit('payment.failed', 'payment_order', order.id, undefined, { reason: p.reason });
      return 'failure logged';
    }
    if (p.kind !== 'captured') return 'ignored';
    if (one('SELECT 1 FROM payment_transaction WHERE gateway = ? AND gateway_payment_id = ?', gateway, p.paymentId)) return 'already applied';
    // Trust only a verified event whose amount matches the server-side order.
    if (p.amountPaise !== order.amount_paise) {
      insert('payment_transaction', { id: uid(), order_id: order.id, registration_id: order.registration_id, gateway, gateway_payment_id: p.paymentId, amount_paise: p.amountPaise, status: 'excess', method: p.method, fee_paise: p.feePaise, fee_tax_paise: p.taxPaise, verified_by: verifiedBy, raw: JSON.stringify(p), created_at: now() });
      post({ narration: `Unmatched gateway amount on order ${order.id}`, sourceType: 'payment', sourceId: order.id, eventId: eventOfOrder(order),
        lines: [{ account: clearingAccount(gateway), debit: p.amountPaise }, { account: 'delegate_excess', credit: p.amountPaise }] });
      notifyStaff(['cfo'], 'staff_alert', { title: 'Gateway amount mismatch', message: `Order ${order.id}: expected ${inr(order.amount_paise)}, gateway captured ${inr(p.amountPaise)}. Held as excess for review.` });
      return 'amount mismatch: held as excess';
    }
    const txnId = uid();
    insert('payment_transaction', { id: txnId, order_id: order.id, registration_id: order.registration_id, gateway, gateway_payment_id: p.paymentId, amount_paise: p.amountPaise, status: 'captured', method: p.method, fee_paise: p.feePaise, fee_tax_paise: p.taxPaise, verified_by: verifiedBy, raw: JSON.stringify(p), created_at: now() });
    run("UPDATE payment_order SET status = 'paid', updated_at = ? WHERE id = ?", now(), order.id);
    for (const c of json<{ registrationId: string; amount: number }[]>(order.covers, [])) {
      receive(c.registrationId, c.amount, { debitAccount: clearingAccount(gateway), sourceType: 'payment', sourceId: txnId, label: `${gateway} ${p.paymentId}` });
    }
    return 'captured and applied';
  });
}

function eventOfOrder(order: any) {
  const c = json<any[]>(order.covers, [])[0];
  return c ? one('SELECT event_id FROM registration WHERE id = ?', c.registrationId)?.event_id : null;
}

function revenueRecognised(eventId: string) { return getEvent(eventId).status === 'held'; }

/**
 * Apply money received against a registration: books it (advance fees + GST output, any excess to a liability),
 * issues the GST invoice, and when the balance reaches zero starts the post-payment steps.
 */
export function receive(regId: string, amount: number, o: { debitAccount: string; sourceType: string; sourceId: string; label: string; date?: string }) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    const due = reg.cancelled_at ? 0 : Math.max(0, balanceOf(reg));
    const applied = Math.min(amount, due);
    const excess = amount - applied;
    const gstBooked = scalar<number>("SELECT COALESCE(SUM(CASE WHEN kind='credit_note' THEN -(cgst_paise+sgst_paise+igst_paise) ELSE cgst_paise+sgst_paise+igst_paise END),0) FROM invoice WHERE registration_id = ?", regId) ?? 0;
    const finalPayment = applied === due;
    const gstPart = applied === 0 ? 0 : finalPayment ? Math.max(0, reg.gst_paise - gstBooked) : Math.round((applied * reg.gst_paise) / reg.total_paise);
    const incomeAcc = revenueRecognised(reg.event_id) ? 'reg_income' : 'advance_fees';
    post({
      date: o.date, eventId: reg.event_id, narration: `Registration fee received ${reg.ref} (${o.label})`, sourceType: o.sourceType, sourceId: o.sourceId,
      lines: [
        { account: o.debitAccount, debit: amount, party_type: 'registration', party_id: regId },
        { account: incomeAcc, credit: applied - gstPart, party_type: 'registration', party_id: regId },
        { account: 'gst_output', credit: gstPart, party_type: 'registration', party_id: regId },
        { account: 'delegate_excess', credit: excess, party_type: 'registration', party_id: regId, memo: excess ? 'Excess payment held for refund or transfer' : undefined },
      ],
    });
    let invoiceId: string | null = null;
    if (applied > 0) invoiceId = issueInvoice(reg, 'invoice', applied - gstPart, gstPart, o.sourceId);
    const paid = reg.paid_paise + applied;
    update('registration', regId, { paid_paise: paid, updated_at: now() });
    if (excess > 0) {
      notifyStaff(['cfo'], 'staff_alert', { title: 'Excess payment received', message: `${reg.ref} ${reg.full_name} paid ${inr(excess)} more than due (${o.label}). Refund it or credit it to another registration from the Excess payments screen.` }, reg.event_id);
      audit('payment.excess', 'registration', regId, undefined, { excess, source: o.sourceId });
    }
    if (applied > 0) {
      const after = { ...reg, paid_paise: paid };
      if (balanceOf(after) <= 0) confirmRegistration(regId, invoiceId);
      else {
        update('registration', regId, { payment_status: 'pending' });
        enqueue('part_payment', { to: reg.email, registrationId: regId, vars: regVars(after, { paid: inr(applied) }) });
      }
    }
    audit('payment.apply', 'registration', regId, { paid_paise: reg.paid_paise }, { paid_paise: paid, applied, excess, source: o.sourceId });
    return { applied, excess, invoiceId };
  });
}

/** "Further work begins": confirm seat, invoice + receipt email, books, commission, official lists. */
function confirmRegistration(regId: string, invoiceId: string | null) {
  update('registration', regId, { payment_status: 'paid', confirmed_at: now(), updated_at: now() });
  let seat = confirmSeat(regId);
  if (!seat) {
    const res = allocate(regId);
    seat = res.kind === 'seat' ? seatOf(regId) : null;
    if (!seat) notifyStaff(['admin', 'registration_exec'], 'staff_alert', { title: 'Paid delegate without a seat', message: `Registration ${regId} is paid but every committee is full. Allot a seat manually.` });
  }
  const reg = one('SELECT * FROM registration WHERE id = ?', regId)!;
  enqueue('payment_confirmed', { to: reg.email, registrationId: regId, vars: regVars(reg, { amount: inr(reg.paid_paise) }), attachments: invoiceId ? [{ kind: 'invoice', id: invoiceId }] : [] });
  if (reg.referrer_id) reconcile(reg.referrer_id);
  audit('registration.confirm', 'registration', regId, undefined, { seat: seat?.portfolio, committee: seat?.committee });
}

// ---------------- invoices ----------------
export function issueInvoice(reg: Record<string, any>, kind: 'invoice' | 'credit_note', taxable: number, gst: number, sourceId: string) {
  const org = getOrg();
  const ev = getEvent(reg.event_id);
  const fy = fyOf(istDate());
  const prefix = kind === 'invoice' ? orgSettings().invoicePrefix : 'CN';
  const number = `${prefix}/${fy}/${String(nextCounter(`${prefix}:${fy}`)).padStart(6, '0')}`;
  const intra = (ev.state_code ?? org.state_code) === org.state_code;
  const half = Math.floor(gst / 2);
  const id = uid();
  insert('invoice', {
    id, number, kind, registration_id: reg.id, source_id: sourceId, taxable_paise: taxable,
    cgst_paise: intra ? half : 0, sgst_paise: intra ? gst - half : 0, igst_paise: intra ? 0 : gst,
    total_paise: taxable + gst, issued_at: now(),
  });
  return id;
}

// ---------------- refunds ----------------
export function requestRefund(regId: string, amount: number, reason: string, opts: { byDelegate?: boolean; note?: string; transactionId?: string } = {}) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    if (!reason?.trim()) throw bad('A reason is required');
    const refundable = reg.paid_paise - reg.refunded_paise - (scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM refund WHERE registration_id = ? AND status IN ('requested','approved') AND note IS NOT 'excess'", regId) ?? 0);
    if (opts.note !== 'excess' && (amount <= 0 || amount > refundable)) throw bad(`Refundable amount is ${inr(Math.max(0, refundable))}`);
    if (opts.byDelegate) {
      const ev = getEvent(reg.event_id);
      const days = eventSettings(ev).refundWindowDays;
      if (ev.start_date && istDate() > istDate(addHours(ev.start_date + 'T00:00:00+05:30', -24 * days))) throw conflict(`Refund requests close ${days} days before the event. Please contact the secretariat.`);
    }
    // Gateway payments go back through the gateway API; screenshot payments are refunded manually.
    const txn = opts.transactionId ? one('SELECT * FROM payment_transaction WHERE id = ?', opts.transactionId)
      : one(`SELECT t.* FROM payment_transaction t JOIN payment_order o ON o.id = t.order_id WHERE t.status = 'captured' AND t.gateway <> 'screenshot'
          AND (t.registration_id = ? OR o.covers LIKE ?) AND t.amount_paise - t.refunded_paise >= ? ORDER BY t.created_at DESC LIMIT 1`, regId, `%${regId}%`, amount);
    const id = uid();
    insert('refund', {
      id, registration_id: regId, transaction_id: txn?.gateway && txn.gateway !== 'screenshot' ? txn.id : opts.transactionId ?? null, amount_paise: amount, reason,
      method: txn && txn.gateway !== 'screenshot' ? 'gateway' : 'manual', status: 'requested', requested_by: ctx().userId ?? (opts.byDelegate ? 'delegate' : null),
      note: opts.note ?? null, created_at: now(),
    });
    if (opts.note !== 'excess') update('registration', regId, { payment_status: 'refund_requested', updated_at: now() });
    notifyStaff(['cfo'], 'staff_alert', { title: 'Refund requested', message: `${reg.ref} ${reg.full_name}: ${inr(amount)}. Reason: ${reason}` }, reg.event_id);
    audit('refund.request', 'refund', id, undefined, { regId, amount, reason });
    return id;
  });
}

/** CFO approval. Maker-checker: the requester cannot approve; large refunds need a second approver. */
export async function approveRefund(refundId: string) {
  const r = one('SELECT * FROM refund WHERE id = ?', refundId);
  if (!r) throw notFound('Refund');
  if (r.status !== 'requested') throw conflict(`Refund is already ${r.status}`);
  const me = ctx().userId;
  const alone = onlyApprover('refund.approve', me);
  if (r.requested_by && r.requested_by === me && !alone) throw forbidden('You requested this refund, so someone else must approve it');
  if (alone && r.requested_by === me) audit('refund.self_approved', 'refund', refundId, undefined, { reason: 'only approver in this organisation' });
  const reg = one('SELECT * FROM registration WHERE id = ?', r.registration_id)!;
  const s = eventSettings(reg.event_id);
  if (r.amount_paise > s.largeRefundPaise && !alone) {
    if (!r.approved_by) {
      update('refund', refundId, { approved_by: me });
      audit('refund.first_approval', 'refund', refundId, undefined, { by: me });
      notifyStaff(['cfo'], 'staff_alert', { title: 'Second approval needed', message: `Refund of ${inr(r.amount_paise)} for ${reg.ref} needs a second approver.` });
      return { status: 'awaiting_second_approval' };
    }
    if (r.approved_by === me) throw forbidden('A different approver must give the second approval');
    update('refund', refundId, { second_approved_by: me });
  } else update('refund', refundId, { approved_by: me });
  update('refund', refundId, { status: 'approved' });
  audit('refund.approve', 'refund', refundId, { status: 'requested' }, { status: 'approved' });
  enqueue('refund_approved', { to: reg.email, registrationId: reg.id, vars: regVars(reg, { amount: inr(r.amount_paise), method: r.method === 'gateway' ? 'the original payment method' : 'bank transfer', expected: r.method === 'gateway' ? '5–7 working days' : '3 working days', reference: refundId.slice(0, 8) }) });
  if (r.method === 'gateway') {
    const txn = one('SELECT t.*, o.gateway_order_id FROM payment_transaction t LEFT JOIN payment_order o ON o.id = t.order_id WHERE t.id = ?', r.transaction_id);
    try {
      const res = await gateways[txn.gateway as GatewayName].refund({ gatewayOrderId: txn.gateway_order_id, paymentId: txn.gateway_payment_id, amountPaise: r.amount_paise, refundRef: refundId });
      update('refund', refundId, { gateway_refund_id: res.refundId });
      if (res.status === 'processed') completeRefund(refundId, res.refundId);
      else if (res.status === 'failed') update('refund', refundId, { status: 'failed', note: 'Gateway refused the refund; process manually' });
      return { status: res.status };
    } catch (e: any) {
      update('refund', refundId, { note: `Gateway refund call failed: ${e.message}. Retry or switch to manual.` });
      return { status: 'approved', error: e.message };
    }
  }
  return { status: 'approved', next: 'Enter the bank reference once the manual transfer is made' };
}

export function rejectRefund(refundId: string, reason: string) {
  const r = one('SELECT * FROM refund WHERE id = ?', refundId);
  if (!r || r.status !== 'requested') throw conflict('Only requested refunds can be rejected');
  update('refund', refundId, { status: 'rejected', note: reason });
  const reg = one('SELECT * FROM registration WHERE id = ?', r.registration_id)!;
  if (reg.payment_status === 'refund_requested') update('registration', reg.id, { payment_status: reg.refunded_paise ? 'part_refunded' : 'paid' });
  audit('refund.reject', 'refund', refundId, undefined, { reason });
}

export function switchRefundToManual(refundId: string) {
  const r = one('SELECT * FROM refund WHERE id = ?', refundId);
  if (!r || !['approved', 'failed'].includes(r.status)) throw conflict('Only approved or failed refunds can switch to manual');
  update('refund', refundId, { method: 'manual', status: 'approved' });
  audit('refund.manual', 'refund', refundId);
}

/** Books the refund once money has actually gone back (gateway confirmation or manual bank reference). */
export function completeRefund(refundId: string, reference: string) {
  return tx(() => {
    const r = one('SELECT * FROM refund WHERE id = ?', refundId);
    if (!r) throw notFound('Refund');
    if (r.status === 'processed') return;
    if (r.status !== 'approved') throw conflict('Refund must be approved first');
    if (r.method === 'manual' && !reference?.trim()) throw bad('Enter the bank reference of the transfer');
    const reg = one('SELECT * FROM registration WHERE id = ?', r.registration_id)!;
    const txn = r.transaction_id ? one('SELECT * FROM payment_transaction WHERE id = ?', r.transaction_id) : null;
    const credit = r.method === 'gateway' && txn ? clearingAccount(txn.gateway) : 'bank';
    if (r.note === 'excess') {
      post({ eventId: reg.event_id, narration: `Excess payment refunded ${reg.ref}`, sourceType: 'refund', sourceId: refundId,
        lines: [{ account: 'delegate_excess', debit: r.amount_paise, party_type: 'registration', party_id: reg.id }, { account: credit, credit: r.amount_paise, memo: reference }] });
      if (txn) run('UPDATE payment_transaction SET refunded_paise = refunded_paise + ? WHERE id = ?', r.amount_paise, txn.id);
      update('refund', refundId, { status: 'processed', bank_reference: r.method === 'manual' ? reference : null, gateway_refund_id: r.method === 'gateway' ? reference : r.gateway_refund_id, processed_at: now() });
      audit('refund.complete', 'refund', refundId, undefined, { reference, excess: true });
      return;
    }
    const gst = Math.round((r.amount_paise * reg.gst_paise) / Math.max(1, reg.total_paise));
    const incomeAcc = revenueRecognised(reg.event_id) ? 'reg_income' : 'advance_fees';
    post({
      eventId: reg.event_id, narration: `Refund to ${reg.ref} ${reg.full_name}: ${r.reason}`, sourceType: 'refund', sourceId: refundId,
      lines: [
        { account: incomeAcc, debit: r.amount_paise - gst, party_type: 'registration', party_id: reg.id },
        { account: 'gst_output', debit: gst, party_type: 'registration', party_id: reg.id },
        { account: credit, credit: r.amount_paise, memo: reference },
      ],
    });
    issueInvoice(reg, 'credit_note', r.amount_paise - gst, gst, refundId);
    if (txn) run('UPDATE payment_transaction SET refunded_paise = refunded_paise + ? WHERE id = ?', r.amount_paise, txn.id);
    const refunded = reg.refunded_paise + r.amount_paise;
    const full = refunded >= reg.paid_paise;
    update('refund', refundId, { status: 'processed', bank_reference: r.method === 'manual' ? reference : null, gateway_refund_id: r.method === 'gateway' ? reference : r.gateway_refund_id, processed_at: now() });
    update('registration', reg.id, { refunded_paise: refunded, payment_status: full ? 'refunded' : 'part_refunded', cancelled_at: full ? now() : reg.cancelled_at, updated_at: now() });
    if (full) { releaseSeat(reg.id, 'Refunded and cancelled'); promoteWaitlistAndNotify(reg.event_id); }
    if (reg.referrer_id) reconcile(reg.referrer_id);
    audit('refund.complete', 'refund', refundId, undefined, { reference, refunded, full });
  });
}

// ---------------- excess payments ----------------
export function excessPayments(eventId?: string) {
  return all(`SELECT r.id AS registration_id, r.ref, r.full_name, r.email, r.event_id,
      SUM(l.credit_paise - l.debit_paise) AS excess_paise
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id JOIN account a ON a.id = l.account_id
    JOIN registration r ON r.id = l.party_id
    WHERE a.sys = 'delegate_excess' AND l.party_type = 'registration' ${eventId ? 'AND r.event_id = ?' : ''}
    GROUP BY r.id HAVING excess_paise > 0`, ...(eventId ? [eventId] : []));
}
function excessOf(regId: string) {
  return excessPayments().find((x) => x.registration_id === regId)?.excess_paise ?? 0;
}
export function refundExcess(regId: string, reason: string) {
  const amt = excessOf(regId);
  if (amt <= 0) throw conflict('No excess held for this registration');
  const txn = one("SELECT t.* FROM payment_transaction t LEFT JOIN payment_order o ON o.id = t.order_id WHERE (t.registration_id = ? OR o.covers LIKE ?) AND t.gateway <> 'screenshot' AND t.amount_paise - t.refunded_paise >= ? ORDER BY t.created_at DESC LIMIT 1", regId, `%${regId}%`, amt);
  return requestRefund(regId, amt, reason || 'Excess payment', { note: 'excess', transactionId: txn?.id });
}
/** Move excess money onto another registration's balance (e.g. a classmate's fee). */
export function transferExcess(fromRegId: string, toRegId: string) {
  return tx(() => {
    const amt = excessOf(fromRegId);
    if (amt <= 0) throw conflict('No excess held for this registration');
    const from = one('SELECT * FROM registration WHERE id = ?', fromRegId)!;
    const to = one('SELECT * FROM registration WHERE id = ?', toRegId);
    if (!to) throw notFound('Target registration');
    const take = Math.min(amt, Math.max(0, balanceOf(to)));
    if (!take) throw conflict('The target registration has nothing due');
    // Move the liability from one delegate to the other, then apply it as a receipt (which books GST and the invoice).
    post({ eventId: from.event_id, narration: `Excess of ${from.ref} transferred to ${to.ref}`, sourceType: 'excess_transfer', sourceId: fromRegId,
      lines: [{ account: 'delegate_excess', debit: take, party_type: 'registration', party_id: fromRegId }, { account: 'delegate_excess', credit: take, party_type: 'registration', party_id: toRegId }] });
    receive(toRegId, take, { debitAccount: 'delegate_excess', sourceType: 'excess_transfer', sourceId: fromRegId, label: `excess transferred from ${from.ref}` });
    audit('excess.transfer', 'registration', fromRegId, undefined, { to: to.ref, amount: take });
    return take;
  });
}

// ---------------- holds, cancellations ----------------
export function promoteWaitlistAndNotify(eventId: string) {
  for (const id of promoteWaitlist(eventId)) {
    const r = one('SELECT * FROM registration WHERE id = ?', id)!;
    enqueue('waitlist_promoted', { to: r.email, registrationId: id, vars: regVars(r) });
  }
}

export function cancelRegistration(regId: string, reason: string) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    if (reg.paid_paise - reg.refunded_paise > 0) throw conflict('This delegate has paid. Raise a refund instead; the seat is released when the refund completes.');
    releaseSeat(regId, reason || 'Cancelled');
    update('registration', regId, { cancelled_at: now(), payment_status: 'expired', allot_status: 'released', waitlist_position: null, updated_at: now() });
    audit('registration.cancel', 'registration', regId, undefined, { reason });
    promoteWaitlistAndNotify(reg.event_id);
  });
}

// ---------------- revenue recognition, event cancellation, sponsorship ----------------
/** Fees received before the event are a liability; when the event is held they move to income. */
export function markEventHeld(eventId: string) {
  return tx(() => {
    const ev = getEvent(eventId);
    if (ev.status === 'held') throw conflict('Revenue for this event is already recognised');
    const bal = -(scalar<number>(`SELECT COALESCE(SUM(l.debit_paise - l.credit_paise),0) FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
      JOIN account a ON a.id = l.account_id WHERE a.sys = 'advance_fees' AND e.event_id = ?`, eventId) ?? 0);
    if (bal > 0) post({ eventId, narration: `Revenue recognised: ${ev.name} held`, sourceType: 'revenue_recognition', sourceId: eventId,
      lines: [{ account: 'advance_fees', debit: bal }, { account: 'reg_income', credit: bal }] });
    update('event', eventId, { status: 'held' });
    audit('event.held', 'event', eventId, { status: ev.status }, { status: 'held', recognised: bal });
    return bal;
  });
}

/** Event cancelled: raise a refund request for every paid delegate. Each still needs CFO approval. */
export function cancelEvent(eventId: string, reason: string) {
  return tx(() => {
    const ev = getEvent(eventId);
    const regs = all("SELECT * FROM registration WHERE event_id = ? AND paid_paise - refunded_paise > 0 AND payment_status <> 'refund_requested'", eventId);
    const ids = regs.map((r) => requestRefund(r.id, r.paid_paise - r.refunded_paise, `Event cancelled: ${reason}`));
    update('event', eventId, { status: 'cancelled' });
    audit('event.cancel', 'event', eventId, { status: ev.status }, { status: 'cancelled', refunds: ids.length, reason });
    return ids.length;
  });
}

export function recordSponsorship(eventId: string, o: { sponsor: string; amountPaise: number; gstPaise: number; receivedOn: string }) {
  return tx(() => {
    const id = uid();
    insert('sponsorship', { id, event_id: eventId, sponsor: o.sponsor, amount_paise: o.amountPaise, gst_paise: o.gstPaise, received_on: o.receivedOn, created_by: ctx().userId ?? null, created_at: now() });
    post({ date: o.receivedOn, eventId, narration: `Sponsorship from ${o.sponsor}`, sourceType: 'sponsorship', sourceId: id,
      lines: [{ account: 'bank', debit: o.amountPaise + o.gstPaise }, { account: 'sponsorship_income', credit: o.amountPaise }, { account: 'gst_output', credit: o.gstPaise }] });
    return id;
  });
}

// ---------------- settlements & reconciliation ----------------
export interface SettlementInput { gateway: string; settlementRef: string; settledOn: string; paymentIds: string[]; grossPaise: number; feePaise: number; taxPaise: number; netPaise: number; batchId?: string }

/** Imported settlements land as drafts with their checks; nothing is booked until someone posts them. */
export function draftSettlement(s: SettlementInput) {
  return tx(() => {
    if (one('SELECT 1 FROM settlement WHERE gateway = ? AND settlement_ref = ?', s.gateway, s.settlementRef)) throw conflict(`Settlement ${s.settlementRef} already imported`);
    const issues: string[] = [];
    if (s.grossPaise - s.feePaise - s.taxPaise !== s.netPaise) issues.push(`gross − fee − tax (${inr(s.grossPaise - s.feePaise - s.taxPaise)}) ≠ net ${inr(s.netPaise)}`);
    const txns = s.paymentIds.length ? all(`SELECT * FROM payment_transaction WHERE gateway = ? AND gateway_payment_id IN (${s.paymentIds.map(() => '?').join(',')})`, s.gateway, ...s.paymentIds) : [];
    const missing = s.paymentIds.filter((p) => !txns.find((t) => t.gateway_payment_id === p));
    if (missing.length) issues.push(`unknown payments: ${missing.join(', ')}`);
    const internalGross = txns.reduce((x, t) => x + t.amount_paise - t.refunded_paise, 0);
    if (txns.length && internalGross !== s.grossPaise) issues.push(`internal captured ${inr(internalGross)} ≠ settlement gross ${inr(s.grossPaise)}`);
    const already = txns.filter((t) => t.settlement_id);
    if (already.length) issues.push(`${already.length} payment(s) already settled earlier`);
    const id = uid();
    insert('settlement', { id, gateway: s.gateway, settlement_ref: s.settlementRef, gross_paise: s.grossPaise, fee_paise: s.feePaise, tax_paise: s.taxPaise, net_paise: s.netPaise, settled_on: s.settledOn, payment_ids: JSON.stringify(s.paymentIds), status: 'draft', mismatch: issues.join('; ') || null, import_batch_id: s.batchId ?? null, created_at: now() });
    if (issues.length) notifyStaff(['cfo', 'accountant'], 'staff_alert', { title: 'Settlement mismatch', message: `${s.gateway} ${s.settlementRef}: ${issues.join('; ')}` });
    audit('settlement.draft', 'settlement', id, undefined, { ...s, issues });
    return { id, issues };
  });
}

/** Book a draft settlement: net to bank, fee to expense, GST on the fee to input credit, gross out of clearing. */
export function postSettlementDraft(id: string) {
  return tx(() => {
    const st = one('SELECT * FROM settlement WHERE id = ?', id);
    if (!st) throw notFound('Settlement');
    if (st.status === 'posted') throw conflict('Already posted');
    const ids = json<string[]>(st.payment_ids, []);
    const txns = ids.length ? all(`SELECT * FROM payment_transaction WHERE gateway = ? AND gateway_payment_id IN (${ids.map(() => '?').join(',')})`, st.gateway, ...ids) : [];
    for (const t of txns) run('UPDATE payment_transaction SET settlement_id = ? WHERE id = ? AND settlement_id IS NULL', id, t.id);
    const firstReg = txns[0] ? (txns[0].registration_id ?? json<any[]>(one('SELECT covers FROM payment_order WHERE id = ?', txns[0].order_id)?.covers, [])[0]?.registrationId) : null;
    post({ date: st.settled_on, narration: `${st.gateway} settlement ${st.settlement_ref}`, sourceType: 'settlement', sourceId: id,
      eventId: firstReg ? one('SELECT event_id FROM registration WHERE id = ?', firstReg)?.event_id : null,
      lines: [
        { account: 'bank', debit: st.net_paise, memo: st.settlement_ref },
        { account: 'gateway_fee', debit: st.fee_paise },
        { account: 'gst_input', debit: st.tax_paise, memo: 'GST on gateway fee' },
        { account: clearingAccount(st.gateway), credit: st.net_paise + st.fee_paise + st.tax_paise },
      ] });
    run("UPDATE settlement SET status = 'posted' WHERE id = ?", id);
    run("UPDATE bank_line SET matched_settlement_id = ? WHERE id = (SELECT id FROM bank_line WHERE matched_settlement_id IS NULL AND direction = 'cr' AND amount_paise = ? AND (description LIKE ? OR utr = ?) LIMIT 1)", id, st.net_paise, `%${st.settlement_ref}%`, st.settlement_ref);
    audit('settlement.post', 'settlement', id, { status: 'draft' }, { status: 'posted' });
    return { id };
  });
}

export function postSettlement(s: SettlementInput) {
  const d = draftSettlement(s);
  postSettlementDraft(d.id);
  return d;
}

/** Daily job: captured gateway payments that no settlement has covered after N days. */
export function unsettledPayments(olderThanDays = 3) {
  return all(`SELECT t.*, r.ref FROM payment_transaction t LEFT JOIN registration r ON r.id = t.registration_id
    WHERE t.gateway IN ('razorpay','cashfree','mock') AND t.status = 'captured' AND t.settlement_id IS NULL AND t.created_at < ? ORDER BY t.created_at`,
    new Date(Date.now() - olderThanDays * 86400_000).toISOString());
}

/** Sandbox gateway: build a signed webhook exactly like a provider would, and run it through handleWebhook. */
export function sandboxComplete(orderId: string, outcome: 'success' | 'failure' | 'success_no_webhook') {
  const order = one('SELECT * FROM payment_order WHERE id = ?', orderId);
  if (!order || order.gateway !== 'mock') throw notFound('Sandbox order');
  const paymentId = `sbx_pay_${uid().slice(0, 12)}`;
  const fee = Math.round(order.amount_paise * 0.02); const tax = Math.round(fee * 0.18);
  const entity = { id: paymentId, order_id: order.gateway_order_id, amount: order.amount_paise, status: outcome === 'failure' ? 'failed' : 'captured', method: 'upi', fee: fee + tax, tax, error_description: outcome === 'failure' ? 'Payment declined by bank (sandbox)' : null };
  const session = json<any>(order.session, { payments: [] });
  session.payments.push(entity);
  run('UPDATE payment_order SET session = ? WHERE id = ?', JSON.stringify(session), orderId);
  if (outcome === 'success_no_webhook') return { status: 200, result: 'payment captured; webhook delayed' };
  const raw = JSON.stringify({ event: outcome === 'failure' ? 'payment.failed' : 'payment.captured', payload: { payment: { entity } }, created_at: Math.floor(Date.now() / 1000) });
  return handleWebhook('mock', raw, { 'x-sandbox-signature': hmacHex(sandboxSecret(), raw), 'x-sandbox-event-id': `evt_${uid()}` });
}
