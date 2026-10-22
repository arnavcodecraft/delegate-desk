import { all, one, scalar } from '../db.ts';
import { eventSettings, getEvent } from '../settings.ts';
import { istDate, addDays } from '../util.ts';
import { balanceOf as ledgerBal } from './ledger.ts';
import { unsettledPayments } from './payments.ts';

export interface MixItem { category: string; share: number; pricePaise: number; variablePaise: number }

/**
 * Break-even: Q = (F − sponsorship) / c̄, where c̄ = Σ sᵢ(pᵢ − vᵢ) is the mix-weighted contribution per delegate.
 * v already includes gateway fee and referral commission per delegate, since both scale with registrations.
 */
export function breakEven(fixedPaise: number, sponsorshipPaise: number, mix: MixItem[], paidCount: number) {
  const contribution = mix.reduce((s, m) => s + m.share * (m.pricePaise - m.variablePaise), 0);
  const need = fixedPaise - sponsorshipPaise;
  const q = contribution > 0 ? Math.max(0, Math.ceil(need / contribution - 1e-9)) : null;
  return {
    contributionPaise: Math.round(contribution), breakEvenCount: q, exact: contribution > 0 ? need / contribution : null,
    gap: q == null ? null : Math.max(0, q - paidCount),
    resultAtCurrentPaise: Math.round(paidCount * contribution - need),
  };
}

function eventMix(eventId: string, fallbackVariable: number) {
  const paid = all(`SELECT r.category, r.net_paise, r.id,
      (SELECT COALESCE(SUM(t.fee_paise),0) FROM payment_transaction t WHERE t.registration_id = r.id AND t.status = 'captured') AS fee,
      (SELECT COALESCE(SUM(amount_paise),0) FROM commission_line l WHERE l.registration_id = r.id) AS commission
    FROM registration r WHERE r.event_id = ? AND r.payment_status IN ('paid','part_refunded','refund_requested') AND r.cancelled_at IS NULL`, eventId);
  const tiers = all('SELECT category, amount_paise FROM fee_tier WHERE event_id = ? AND active = 1 ORDER BY sort', eventId);
  if (!paid.length) {
    // Before the first payment, plan from the current fee tiers with an even mix.
    const cats = [...new Set(tiers.map((t) => t.category))];
    return cats.map((c) => ({ category: c, share: 1 / cats.length, pricePaise: tiers.find((t) => t.category === c)!.amount_paise, variablePaise: fallbackVariable }));
  }
  const groups = new Map<string, any[]>();
  for (const r of paid) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  return [...groups.entries()].map(([category, rs]) => ({
    category, share: rs.length / paid.length,
    pricePaise: Math.round(rs.reduce((s, r) => s + r.net_paise, 0) / rs.length),
    variablePaise: Math.round(fallbackVariable + rs.reduce((s, r) => s + r.fee + r.commission, 0) / rs.length),
  }));
}

export function dashboard(eventId: string) {
  const ev = getEvent(eventId);
  const s = eventSettings(ev);
  const today = istDate();
  const count = (w: string, ...p: any[]) => scalar<number>(`SELECT COUNT(*) FROM registration WHERE event_id = ? AND erased_at IS NULL AND ${w}`, eventId, ...p) ?? 0;
  const registrations = {
    total: count('1=1'),
    confirmed: count("payment_status IN ('paid','part_refunded','refund_requested') AND cancelled_at IS NULL"),
    provisional: count("allot_status = 'held' AND cancelled_at IS NULL"),
    waitlisted: count("allot_status = 'waitlisted' AND cancelled_at IS NULL"),
    cancelled: count('cancelled_at IS NOT NULL'),
  };
  const inv = one(`SELECT COALESCE(SUM(CASE WHEN i.kind='credit_note' THEN -i.taxable_paise ELSE i.taxable_paise END),0) AS net,
      COALESCE(SUM(CASE WHEN i.kind='credit_note' THEN -i.total_paise ELSE i.total_paise END),0) AS gross
    FROM invoice i JOIN registration r ON r.id = i.registration_id WHERE r.event_id = ?`, eventId)!;
  const byMethod = all(`SELECT t.gateway, COUNT(*) AS n, SUM(t.amount_paise) AS amount FROM payment_transaction t
      LEFT JOIN payment_order o ON o.id = t.order_id
      LEFT JOIN registration r ON r.id = COALESCE(t.registration_id, json_extract(o.covers, '$[0].registrationId'))
    WHERE r.event_id = ? AND t.status IN ('captured','approved') GROUP BY t.gateway`, eventId);
  const holds = one(`SELECT COUNT(*) AS n, COALESCE(SUM(total_paise - paid_paise + refunded_paise),0) AS amount FROM registration
    WHERE event_id = ? AND allot_status = 'held' AND payment_status IN ('pending','processing','failed') AND cancelled_at IS NULL`, eventId)!;
  const review = one(`SELECT COUNT(*) AS n, COALESCE(SUM(e.amount_paise),0) AS amount, MIN(e.submitted_at) AS oldest FROM payment_evidence e
    JOIN registration r ON r.id = e.registration_id WHERE r.event_id = ? AND e.status = 'submitted'`, eventId)!;
  const exp = (st: string, col = 'amount_paise + CASE WHEN itc_eligible = 1 THEN 0 ELSE gst_paise END') => scalar<number>(`SELECT COALESCE(SUM(${col}),0) FROM expense WHERE event_id = ? AND status IN (${st})`, eventId) ?? 0;
  const expenses = {
    budgeted: scalar<number>('SELECT COALESCE(SUM(amount_paise),0) FROM budget WHERE event_id = ?', eventId) ?? 0,
    committed: exp("'draft','submitted'"), incurred: exp("'approved'"),
    paid: exp("'approved'", 'paid_paise'), unpaid: exp("'approved'", 'amount_paise + gst_paise - tds_paise - paid_paise'),
  };
  const ledgerExp = (sys: string) => ledgerBal(sys, { eventId });
  const gatewayFees = ledgerExp('gateway_fee') + (scalar<number>(`SELECT COALESCE(SUM(t.fee_paise - COALESCE(t.fee_tax_paise,0)),0) FROM payment_transaction t
      LEFT JOIN payment_order o ON o.id = t.order_id LEFT JOIN registration r ON r.id = COALESCE(t.registration_id, json_extract(o.covers, '$[0].registrationId'))
      WHERE r.event_id = ? AND t.settlement_id IS NULL AND t.status = 'captured'`, eventId) ?? 0);
  const commissionEarned = scalar<number>('SELECT COALESCE(SUM(amount_paise),0) FROM commission_line WHERE event_id = ?', eventId) ?? 0;
  const sponsorship = scalar<number>('SELECT COALESCE(SUM(amount_paise),0) FROM sponsorship WHERE event_id = ?', eventId) ?? 0;
  const revenue = inv.net;
  const surplus = revenue - expenses.incurred - gatewayFees - commissionEarned;

  // ---- break-even ----
  const fixed = scalar<number>("SELECT COALESCE(SUM(amount_paise + CASE WHEN itc_eligible = 1 THEN 0 ELSE gst_paise END),0) FROM expense WHERE event_id = ? AND status IN ('draft','submitted','approved') AND cost_behaviour IN ('fixed','semi')", eventId) ?? 0;
  const variableActual = scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM expense WHERE event_id = ? AND status IN ('draft','submitted','approved') AND cost_behaviour = 'variable'", eventId) ?? 0;
  const perDelegateVariable = registrations.confirmed && variableActual ? Math.round(variableActual / registrations.confirmed) : s.variableCostPerDelegatePaise;
  const mix = eventMix(eventId, perDelegateVariable);
  const be = breakEven(fixed, sponsorship, mix, registrations.confirmed);
  const budgetFixed = expenses.budgeted;
  const beBudget = budgetFixed > fixed ? breakEven(budgetFixed, sponsorship, mix, registrations.confirmed) : null;

  // ---- velocity and forecast ----
  const daily = all(`SELECT substr(datetime(created_at, '+330 minutes'), 1, 10) AS day, COUNT(*) AS registered,
      SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS paid FROM registration WHERE event_id = ? AND erased_at IS NULL GROUP BY day ORDER BY day`, eventId);
  const paidDaily = all(`SELECT substr(datetime(confirmed_at, '+330 minutes'), 1, 10) AS day, COUNT(*) AS paid FROM registration
      WHERE event_id = ? AND confirmed_at IS NOT NULL GROUP BY day ORDER BY day`, eventId);
  const collectionsDaily = all(`SELECT substr(datetime(t.created_at, '+330 minutes'), 1, 10) AS day, t.gateway, SUM(t.amount_paise) AS amount FROM payment_transaction t
      LEFT JOIN payment_order o ON o.id = t.order_id LEFT JOIN registration r ON r.id = COALESCE(t.registration_id, json_extract(o.covers, '$[0].registrationId'))
      WHERE r.event_id = ? AND t.status IN ('captured','approved') GROUP BY day, t.gateway ORDER BY day`, eventId);
  const last14 = scalar<number>("SELECT COUNT(*) FROM registration WHERE event_id = ? AND confirmed_at >= ?", eventId, addDays(new Date(), -14)) ?? 0;
  const velocity = last14 / 14;
  const daysLeft = ev.start_date ? Math.max(0, Math.round((new Date(ev.start_date).getTime() - new Date(today).getTime()) / 86400_000)) : 30;
  const forecast = {
    velocityPerDay: Math.round(velocity * 100) / 100, daysLeft,
    conservative: Math.round(registrations.confirmed + velocity * 0.7 * daysLeft),
    base: Math.round(registrations.confirmed + velocity * daysLeft),
    optimistic: Math.round(registrations.confirmed + velocity * 1.3 * daysLeft),
  };
  const breakEvenDate = be.gap === 0 ? 'reached' : be.gap != null && velocity > 0 ? istDate(addDays(new Date(), Math.ceil(be.gap / velocity))) : null;
  let cum = 0;
  const contributionSeries = paidDaily.map((d) => { cum += d.paid; return { day: d.day, paid: cum, contribution: Math.round(cum * be.contributionPaise), fixed: fixed - sponsorship }; });

  // ---- profit by committee and by referrer ----
  const byCommittee = all(`SELECT c.short, c.name, COUNT(r.id) AS delegates, COALESCE(SUM(r.net_paise),0) AS revenue,
      COALESCE(SUM((SELECT COALESCE(SUM(t.fee_paise),0) FROM payment_transaction t WHERE t.registration_id = r.id AND t.status='captured')),0) AS fees,
      COALESCE(SUM((SELECT COALESCE(SUM(l.amount_paise),0) FROM commission_line l WHERE l.registration_id = r.id)),0) AS commission
    FROM committee c JOIN portfolio p ON p.committee_id = c.id JOIN seat s ON s.portfolio_id = p.id
    LEFT JOIN registration r ON r.id = s.registration_id AND r.payment_status IN ('paid','part_refunded','refund_requested')
    WHERE c.event_id = ? GROUP BY c.id ORDER BY c.sort`, eventId)
    .map((c) => ({ ...c, variable: c.delegates * perDelegateVariable, contribution: c.revenue - c.fees - c.commission - c.delegates * perDelegateVariable }));
  const byReferrer = all(`SELECT COALESCE(f.name, 'Direct / no referrer') AS referrer, COUNT(r.id) AS delegates, SUM(r.net_paise) AS revenue,
      COALESCE(SUM((SELECT COALESCE(SUM(l.amount_paise),0) FROM commission_line l WHERE l.registration_id = r.id)),0) AS commission
    FROM registration r LEFT JOIN referrer f ON f.id = r.referrer_id
    WHERE r.event_id = ? AND r.payment_status IN ('paid','part_refunded','refund_requested') GROUP BY f.id ORDER BY revenue DESC`, eventId)
    .map((r) => ({ ...r, net: r.revenue - r.commission - r.delegates * perDelegateVariable }));

  // ---- cash: money collected is not revenue, and is not cash until settled ----
  const cash = {
    bank: ledgerBal('bank'), pettyCash: ledgerBal('cash'),
    gatewayUnsettled: ledgerBal('clearing_razorpay') + ledgerBal('clearing_cashfree') + ledgerBal('clearing_mock'),
    byGateway: { razorpay: ledgerBal('clearing_razorpay'), cashfree: ledgerBal('clearing_cashfree'), sandbox: ledgerBal('clearing_mock') },
    gstCollected: inv.gross - inv.net,
  };
  const commission = {
    earned: commissionEarned,
    held: scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM commission_line WHERE event_id = ? AND status = 'held'", eventId) ?? 0,
    approved: scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM commission_line WHERE event_id = ? AND status = 'approved'", eventId) ?? 0,
    paid: scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM commission_line WHERE event_id = ? AND status = 'paid'", eventId) ?? 0,
    tdsWithheld: scalar<number>("SELECT COALESCE(SUM(p.tds_paise),0) FROM payout p WHERE p.id IN (SELECT payout_id FROM commission_line WHERE event_id = ?)", eventId) ?? 0,
  };

  // ---- alerts ----
  const alerts: { level: 'warn' | 'danger'; title: string; detail: string; link?: string }[] = [];
  if (be.breakEvenCount != null && forecast.base < be.breakEvenCount) alerts.push({ level: 'danger', title: 'Break-even slipping', detail: `At the current pace you reach about ${forecast.base} paid registrations; break-even needs ${be.breakEvenCount}.`, link: '/app/dashboard#breakeven' });
  if (review.n && review.oldest && Date.now() - new Date(review.oldest).getTime() > s.unverifiedAlertHours * 3600_000) alerts.push({ level: 'warn', title: 'Unverified payments ageing', detail: `${review.n} payment proof(s) waiting; the oldest is over ${s.unverifiedAlertHours} hours old.`, link: '/app/payments/review' });
  const mism = all("SELECT settlement_ref, gateway, mismatch FROM settlement WHERE mismatch IS NOT NULL ORDER BY created_at DESC LIMIT 5");
  for (const m of mism) alerts.push({ level: 'danger', title: `Settlement mismatch ${m.gateway} ${m.settlement_ref}`, detail: m.mismatch, link: '/app/payments/settlements' });
  const unsettled = unsettledPayments(3);
  if (unsettled.length) alerts.push({ level: 'warn', title: 'Gateway payments not yet settled', detail: `${unsettled.length} captured payment(s) older than 3 days have no settlement. Import the settlement report.`, link: '/app/payments/settlements' });
  const processing = scalar<number>("SELECT COUNT(*) FROM payment_order WHERE status = 'processing' AND updated_at < ?", new Date(Date.now() - s.processingAlertMinutes * 60_000).toISOString()) ?? 0;
  if (processing) alerts.push({ level: 'warn', title: 'Payments stuck in processing', detail: `${processing} order(s) have waited over ${s.processingAlertMinutes} minutes for the gateway.`, link: '/app/payments/transactions' });
  for (const b of all(`SELECT b.category, b.amount_paise, COALESCE((SELECT SUM(amount_paise) FROM expense e WHERE e.event_id = b.event_id AND e.category = b.category AND e.status IN ('draft','submitted','approved')),0) AS used FROM budget b WHERE b.event_id = ?`, eventId)) {
    if (b.used > b.amount_paise) alerts.push({ level: 'danger', title: `Over budget: ${b.category}`, detail: `Committed and spent exceed the budget by ${((b.used - b.amount_paise) / 100).toLocaleString('en-IN')} rupees.`, link: '/app/expenses/budgets' });
  }
  const unmatched = scalar<number>("SELECT COUNT(*) FROM registration WHERE event_id = ? AND referral_state = 'unmatched'", eventId) ?? 0;
  if (unmatched) alerts.push({ level: 'warn', title: 'Unmatched referral names', detail: `${unmatched} registration(s) typed a referral name we could not match. No commission until linked.`, link: '/app/referrals?tab=unmatched' });

  return {
    event: { id: ev.id, name: ev.name, code: ev.code, status: ev.status, start_date: ev.start_date },
    registrations,
    collections: { verifiedNetPaise: inv.net, verifiedGrossPaise: inv.gross, byMethod },
    pending: { holds, review: { ...review, oldestHours: review.oldest ? Math.round((Date.now() - new Date(review.oldest).getTime()) / 3600_000) : null } },
    expenses, gatewayFees, sponsorship, revenue, surplus,
    breakEven: { ...be, fixedPaise: fixed, sponsorshipPaise: sponsorship, mix, variablePerDelegatePaise: perDelegateVariable, date: breakEvenDate, budgetBased: beBudget ? { fixedPaise: budgetFixed, ...beBudget } : null },
    forecast, cash, commission, alerts,
    charts: { daily, paidDaily, collectionsDaily, contributionSeries },
    byCommittee, byReferrer,
  };
}

/** What-if: fee change, discount, extra fixed cost (new committee, venue change, prize pool), variable cost change. */
export function scenario(eventId: string, p: { priceChangePct?: number; discountPct?: number; extraFixedPaise?: number; variableChangePaise?: number; registrations?: number }) {
  const d = dashboard(eventId);
  const mix = d.breakEven.mix.map((m) => ({
    ...m,
    pricePaise: Math.round(m.pricePaise * (1 + (p.priceChangePct ?? 0) / 100) * (1 - (p.discountPct ?? 0) / 100)),
    variablePaise: m.variablePaise + (p.variableChangePaise ?? 0),
  }));
  const fixed = d.breakEven.fixedPaise + (p.extraFixedPaise ?? 0);
  const at = (n: number) => breakEven(fixed, d.sponsorship, mix, n);
  const base = at(d.registrations.confirmed);
  return {
    inputs: p, fixedPaise: fixed, mix,
    breakEvenCount: base.breakEvenCount, contributionPaise: base.contributionPaise,
    outcomes: {
      current: { registrations: d.registrations.confirmed, resultPaise: base.resultAtCurrentPaise },
      conservative: { registrations: d.forecast.conservative, resultPaise: at(d.forecast.conservative).resultAtCurrentPaise },
      base: { registrations: d.forecast.base, resultPaise: at(d.forecast.base).resultAtCurrentPaise },
      optimistic: { registrations: d.forecast.optimistic, resultPaise: at(d.forecast.optimistic).resultAtCurrentPaise },
      ...(p.registrations != null ? { custom: { registrations: p.registrations, resultPaise: at(p.registrations).resultAtCurrentPaise } } : {}),
    },
  };
}
