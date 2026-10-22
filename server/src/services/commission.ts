import { all, one, run, insert, tx, update, nextCounter, scalar } from '../db.ts';
import { audit } from '../audit.ts';
import { post } from './ledger.ts';
import { enqueue } from './notify.ts';
import { eventSettings, orgSettings } from '../settings.ts';
import { addDays, bad, bp, conflict, ctx, fyOf, fyRange, inr, istDate, json, now, uid, notFound } from '../util.ts';
import { config } from '../config.ts';

export interface Tier { from: number; to: number | null; rate_bp?: number | null; amount_paise?: number | null }
export interface Plan { method: 'flat_pct' | 'flat_amount' | 'slab' | 'progressive'; basis: 'count' | 'value'; tiers: Tier[]; cap_paise?: number | null }
export interface CalcLine { amount: number; rate_bp: number | null; bracket: string; position: number }

const label = (t: Tier, basis: string) => basis === 'count' ? `${t.from}${t.to == null ? '+' : '–' + t.to}` : `${inr(t.from)}${t.to == null ? '+' : '–' + inr(t.to)}`;
const tierPay = (t: Tier, base: number) => (t.amount_paise != null ? t.amount_paise : bp(base, t.rate_bp ?? 0));

/**
 * Pure commission calculation for an ordered list of eligible registrations (ordered by payment confirmation time).
 * Slab: the referrer's total decides one rate for every registration. Progressive: each registration earns the rate
 * of the bracket it falls in. Money is rounded once per registration.
 */
export function calculate(plan: Plan, bases: number[]): CalcLine[] {
  const tiers = [...plan.tiers].sort((a, b) => a.from - b.from);
  const inTier = (x: number) => tiers.find((t) => x >= t.from && (t.to == null || x <= t.to)) ?? null;
  let out: CalcLine[];
  if (plan.method === 'flat_pct' || plan.method === 'flat_amount') {
    const t = tiers[0] ?? { from: 0, to: null, rate_bp: 0 };
    out = bases.map((b, i) => ({ amount: plan.method === 'flat_amount' ? t.amount_paise ?? 0 : bp(b, t.rate_bp ?? 0), rate_bp: plan.method === 'flat_pct' ? t.rate_bp ?? 0 : null, bracket: 'flat', position: i + 1 }));
  } else if (plan.basis === 'count') {
    if (plan.method === 'slab') {
      const t = inTier(bases.length);
      out = bases.map((b, i) => ({ amount: t ? tierPay(t, b) : 0, rate_bp: t?.rate_bp ?? null, bracket: t ? label(t, 'count') : 'below first slab', position: i + 1 }));
    } else {
      out = bases.map((b, i) => { const t = inTier(i + 1); return { amount: t ? tierPay(t, b) : 0, rate_bp: t?.rate_bp ?? null, bracket: t ? label(t, 'count') : '—', position: i + 1 }; });
    }
  } else {
    // value basis: brackets are cumulative net fee value in paise; "to" is the upper bound of the bracket.
    const total = bases.reduce((s, b) => s + b, 0);
    if (plan.method === 'slab') {
      const t = inTier(total);
      out = bases.map((b, i) => ({ amount: t ? bp(b, t.rate_bp ?? 0) : 0, rate_bp: t?.rate_bp ?? null, bracket: t ? label(t, 'value') : 'below first slab', position: i + 1 }));
    } else {
      let cum = 0;
      out = bases.map((b, i) => {
        const lo = cum, hi = cum + b; cum = hi;
        let exact = 0; const used: string[] = [];
        for (const t of tiers) {
          const tLo = Math.max(t.from, 0), tHi = t.to == null ? Infinity : t.to;
          const overlap = Math.max(0, Math.min(hi, tHi) - Math.max(lo, tLo));
          if (overlap > 0) { exact += (overlap * (t.rate_bp ?? 0)) / 10000; used.push(label(t, 'value')); }
        }
        return { amount: Math.round(exact), rate_bp: b ? Math.round((exact / b) * 10000) : null, bracket: used.join(' + ') || '—', position: i + 1 };
      });
    }
  }
  if (plan.cap_paise != null) {
    let left = plan.cap_paise;
    out = out.map((l) => { const a = Math.max(0, Math.min(l.amount, left)); left -= a; return a === l.amount ? l : { ...l, amount: a, bracket: l.bracket + ' (capped)' }; });
  }
  return out;
}

export function planFor(referrer: Record<string, any>) {
  const p = (referrer.plan_id && one('SELECT * FROM commission_plan WHERE id = ?', referrer.plan_id))
    || one('SELECT * FROM commission_plan WHERE org_id = ? AND referrer_kind = ? AND is_override = 0 ORDER BY created_at LIMIT 1', referrer.org_id, referrer.kind)
    || one('SELECT * FROM commission_plan WHERE org_id = ? AND referrer_kind IS NULL AND is_override = 0 ORDER BY created_at LIMIT 1', referrer.org_id);
  if (!p) return null;
  if (p.is_override && !p.signed_off_by) return null; // named-referrer overrides earn nothing until the CFO signs off
  return { ...p, tiers: json<Tier[]>(p.tiers, []) };
}

function periodKey(plan: Record<string, any>, reg: Record<string, any>) {
  if (plan.period === 'month') return `month:${istDate(reg.confirmed_at).slice(0, 7)}`;
  if (plan.period === 'year') return `fy:${fyOf(istDate(reg.confirmed_at))}`;
  return `event:${reg.event_id}`;
}

function commissionBase(plan: Record<string, any>, reg: Record<string, any>) {
  if (plan.base === 'excl_gst') return reg.base_paise + reg.premium_paise; // list fee, excluding GST
  const afterDiscount = reg.net_paise;
  if (plan.base === 'after_gateway_fee') {
    const fee = scalar<number>("SELECT COALESCE(SUM(fee_paise),0) FROM payment_transaction WHERE registration_id = ? AND status IN ('captured','approved')", reg.id) ?? 0;
    return Math.max(0, afterDiscount - fee);
  }
  return afterDiscount;
}

/** Recalculate a referrer's commission and post only the differences (accruals, true-ups, reversals). */
export function reconcile(referrerId: string) {
  return tx(() => {
    const referrer = one('SELECT * FROM referrer WHERE id = ?', referrerId);
    if (!referrer) return [];
    const plan = planFor(referrer);
    const eligible = all(`SELECT * FROM registration WHERE referrer_id = ? AND referral_state = 'linked' AND self_referral = 0
        AND confirmed_at IS NOT NULL AND cancelled_at IS NULL AND payment_status IN ('paid','part_refunded','refund_requested')
        ORDER BY confirmed_at, id`, referrerId);
    const groups = new Map<string, any[]>();
    if (plan) for (const r of eligible) { const k = periodKey(plan, r); groups.set(k, [...(groups.get(k) ?? []), r]); }
    const desired = new Map<string, { reg: any; period: string; calc: CalcLine; base: number }>();
    for (const [period, regs] of groups) {
      const bases = regs.map((r) => commissionBase(plan!, r));
      calculate({ method: plan!.method, basis: plan!.basis, tiers: plan!.tiers, cap_paise: plan!.cap_paise }, bases)
        .forEach((c, i) => desired.set(regs[i].id, { reg: regs[i], period, calc: c, base: bases[i] }));
    }
    const existing = all(`SELECT registration_id, period_key, SUM(amount_paise) AS amt, MAX(event_id) AS event_id FROM commission_line
        WHERE referrer_id = ? AND registration_id IS NOT NULL GROUP BY registration_id, period_key`, referrerId);
    const existingBy = new Map<string, { amt: number; period: string; event_id: string }>();
    for (const e of existing) {
      const prev = existingBy.get(e.registration_id);
      existingBy.set(e.registration_id, { amt: (prev?.amt ?? 0) + e.amt, period: e.period_key, event_id: e.event_id });
    }
    const ids = new Set([...desired.keys(), ...existingBy.keys()]);
    const posted: any[] = [];
    for (const regId of ids) {
      const d = desired.get(regId);
      const ex = existingBy.get(regId);
      const want = d?.calc.amount ?? 0, have = ex?.amt ?? 0;
      const delta = want - have;
      if (delta === 0) continue;
      const reg = d?.reg ?? one('SELECT * FROM registration WHERE id = ?', regId);
      const holdDays = eventSettings(reg.event_id).commissionHoldDays;
      const holdUntil = addDays(reg.confirmed_at ?? now(), holdDays);
      const kind = !have ? 'accrual' : delta > 0 ? 'trueup' : 'reversal';
      const line = {
        id: uid(), referrer_id: referrerId, registration_id: regId, event_id: reg.event_id, period_key: d?.period ?? ex!.period, kind,
        position: d?.calc.position ?? null, bracket: d ? d.calc.bracket : 'removed from count', base_paise: d?.base ?? 0, rate_bp: d?.calc.rate_bp ?? null,
        amount_paise: delta, status: delta < 0 ? 'accrued' : holdUntil > now() ? 'held' : 'accrued', hold_until: holdUntil, created_at: now(),
      };
      insert('commission_line', line);
      posted.push(line);
    }
    // Book the net movement per event (cost centre).
    const byEvent = new Map<string, number>();
    for (const l of posted) byEvent.set(l.event_id, (byEvent.get(l.event_id) ?? 0) + l.amount_paise);
    for (const [eventId, amt] of byEvent) {
      if (!amt) continue;
      post({
        eventId, narration: `Referral commission ${amt > 0 ? 'accrued' : 'reversed'}: ${referrer.name} (${posted.filter((l) => l.event_id === eventId).length} line(s))`,
        sourceType: 'commission', sourceId: referrerId,
        lines: [
          { account: 'commission_expense', debit: amt, party_type: 'referrer', party_id: referrerId },
          { account: 'commission_payable', credit: amt, party_type: 'referrer', party_id: referrerId },
        ],
      });
    }
    if (posted.length) audit('commission.reconcile', 'referrer', referrerId, undefined, posted.map((l) => ({ reg: l.registration_id, kind: l.kind, amount: l.amount_paise, bracket: l.bracket })));
    return posted;
  });
}

export function releaseHolds() {
  return run("UPDATE commission_line SET status = 'accrued' WHERE status = 'held' AND hold_until <= ?", now()).changes;
}

export function approveLines(referrerId: string, lineIds?: string[]) {
  return tx(() => {
    const where = lineIds?.length ? `AND id IN (${lineIds.map(() => '?').join(',')})` : '';
    const r = run(`UPDATE commission_line SET status = 'approved', approved_by = ? WHERE referrer_id = ? AND status = 'accrued' ${where}`, ctx().userId ?? null, referrerId, ...(lineIds ?? []));
    audit('commission.approve', 'referrer', referrerId, undefined, { lines: Number(r.changes) });
    return Number(r.changes);
  });
}

/** TDS on commission: once the FY aggregate crosses the threshold, deduct on the aggregate less what was already deducted. */
export function tdsFor(referrer: Record<string, any>, gross: number, fy: string) {
  const s = orgSettings(referrer.org_id).tds;
  const prior = one('SELECT COALESCE(SUM(gross_paise),0) AS g, COALESCE(SUM(tds_paise),0) AS t FROM payout WHERE referrer_id = ? AND fy = ?', referrer.id, fy)!;
  const aggregate = prior.g + gross;
  const rate = referrer.pan ? s.commissionRateBp : s.noPanRateBp;
  if (aggregate <= s.thresholdPaise) return { tds: 0, rate, aggregate };
  return { tds: Math.max(0, bp(aggregate, rate) - prior.t), rate, aggregate };
}

export function payout(referrerId: string, o: { reference: string; paidOn?: string }) {
  return tx(() => {
    const referrer = one('SELECT * FROM referrer WHERE id = ?', referrerId);
    if (!referrer) throw notFound('Referrer');
    if (!referrer.bank_account || !referrer.bank_ifsc) throw bad('Add the referrer’s bank account and IFSC before paying');
    if (!o.reference?.trim()) throw bad('Enter the bank or UPI reference for this payout');
    const lines = all("SELECT * FROM commission_line WHERE referrer_id = ? AND payout_id IS NULL AND (status = 'approved' OR (status = 'accrued' AND amount_paise < 0))", referrerId);
    const gross = lines.reduce((s, l) => s + l.amount_paise, 0);
    if (gross <= 0) throw conflict(gross < 0 ? `Nothing to pay: ${inr(-gross)} is recoverable from this referrer` : 'No approved commission to pay');
    const plan = planFor(referrer);
    if (plan && gross < plan.min_payout_paise) throw conflict(`Below the minimum payout of ${inr(plan.min_payout_paise)}`);
    const paidOn = o.paidOn ?? istDate();
    const fy = fyOf(paidOn);
    const { tds, rate } = tdsFor(referrer, gross, fy);
    const id = uid();
    const ref = `PO/${fy}/${String(nextCounter(`payout:${fy}`)).padStart(5, '0')}`;
    insert('payout', { id, ref, referrer_id: referrerId, gross_paise: gross, tds_paise: tds, net_paise: gross - tds, tds_rate_bp: tds ? rate : 0, fy, status: 'paid', reference: o.reference, paid_on: paidOn, created_by: ctx().userId ?? null, created_at: now() });
    run(`UPDATE commission_line SET status = 'paid', payout_id = ? WHERE id IN (${lines.map(() => '?').join(',')})`, id, ...lines.map((l) => l.id));
    post({
      date: paidOn, narration: `Commission payout ${ref} to ${referrer.name}`, sourceType: 'payout', sourceId: id,
      eventId: lines[0]?.event_id ?? null,
      lines: [
        { account: 'commission_payable', debit: gross, party_type: 'referrer', party_id: referrerId },
        { account: 'bank', credit: gross - tds, memo: o.reference },
        { account: 'tds_payable', credit: tds, party_type: 'referrer', party_id: referrerId, memo: `TDS u/s ${orgSettings(referrer.org_id).tds.section}` },
      ],
    });
    if (referrer.email) enqueue('commission_statement', {
      to: referrer.email, recipientKind: 'referrer', attachments: [{ kind: 'commission_statement', id }],
      vars: { name: referrer.name, gross: inr(gross), tds: inr(tds), net: inr(gross - tds), reference: o.reference, payout_ref: ref },
    });
    audit('commission.payout', 'payout', id, undefined, { ref, gross, tds, net: gross - tds, lines: lines.length });
    return { id, ref, gross, tds, net: gross - tds };
  });
}

/** Live statement: delegates referred, paid count, slab now, next slab and how many more it needs. */
export function statement(referrerId: string) {
  const referrer = one('SELECT * FROM referrer WHERE id = ?', referrerId);
  if (!referrer) throw notFound('Referrer');
  const plan = planFor(referrer);
  const regs = all(`SELECT r.id, r.ref, r.full_name, r.institution, r.payment_status, r.confirmed_at, r.event_id, r.self_referral, e.name AS event
      FROM registration r JOIN event e ON e.id = r.event_id WHERE r.referrer_id = ? ORDER BY r.created_at`, referrerId);
  const lines = all(`SELECT l.*, r.full_name, r.ref FROM commission_line l LEFT JOIN registration r ON r.id = l.registration_id WHERE l.referrer_id = ? ORDER BY l.created_at`, referrerId);
  const paidRegs = regs.filter((r) => r.confirmed_at && ['paid', 'part_refunded', 'refund_requested'].includes(r.payment_status) && !r.self_referral);
  let current: Tier | null = null, next: Tier | null = null;
  const count = paidRegs.length;
  if (plan && plan.basis === 'count' && ['slab', 'progressive'].includes(plan.method)) {
    const tiers = [...plan.tiers].sort((a, b) => a.from - b.from);
    current = tiers.find((t) => count >= t.from && (t.to == null || count <= t.to)) ?? null;
    next = tiers.find((t) => t.from > count) ?? null;
  }
  const sum = (st: string[]) => lines.filter((l) => st.includes(l.status)).reduce((s, l) => s + l.amount_paise, 0);
  const payouts = all('SELECT * FROM payout WHERE referrer_id = ? ORDER BY paid_on', referrerId);
  return {
    referrer: { id: referrer.id, name: referrer.name, kind: referrer.kind, pan: referrer.pan ? referrer.pan.slice(0, 2) + '•••••' + referrer.pan.slice(-3) : null, hasBank: !!referrer.bank_account },
    plan: plan ? { name: plan.name, method: plan.method, basis: plan.basis, tiers: plan.tiers, period: plan.period } : null,
    referred: regs.length, paidCount: count,
    currentSlab: current ? { ...current, label: label(current, 'count') } : null,
    nextSlab: next ? { ...next, label: label(next, 'count'), needed: next.from - count } : null,
    totals: { held: sum(['held']), accrued: sum(['accrued']), approved: sum(['approved']), paid: sum(['paid']), earned: sum(['held', 'accrued', 'approved', 'paid']), tdsWithheld: payouts.reduce((s, p) => s + p.tds_paise, 0) },
    delegates: regs.map((r) => ({ ref: r.ref, name: r.full_name, institution: r.institution, status: r.payment_status, event: r.event, selfReferral: !!r.self_referral })),
    lines, payouts,
  };
}

export function tdsRegister(from: string, to: string) {
  return all(`SELECT p.ref, p.paid_on, p.gross_paise, p.tds_paise, p.net_paise, p.tds_rate_bp, p.reference, r.name, r.pan, r.kind
      FROM payout p JOIN referrer r ON r.id = p.referrer_id WHERE p.paid_on BETWEEN ? AND ? ORDER BY p.paid_on`, from, to);
}

export function form16a(referrerId: string, fy: string) {
  const { from, to } = fyRange(fy);
  const r = one('SELECT name, pan FROM referrer WHERE id = ?', referrerId);
  const rows = all('SELECT * FROM payout WHERE referrer_id = ? AND paid_on BETWEEN ? AND ? ORDER BY paid_on', referrerId, from, to);
  const quarter = (d: string) => { const m = Number(d.slice(5, 7)); return m >= 4 && m <= 6 ? 'Q1' : m <= 9 && m >= 7 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4'; };
  return { referrer: r, fy, rows: rows.map((p) => ({ ...p, quarter: quarter(p.paid_on) })), gross: rows.reduce((s, p) => s + p.gross_paise, 0), tds: rows.reduce((s, p) => s + p.tds_paise, 0) };
}

export function statementLink(token: string) { return `${config.baseUrl}/referrer/${token}`; }
export { update };
