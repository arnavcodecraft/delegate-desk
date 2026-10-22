import { all, one, run, insert, tx, update, nextCounter, scalar } from '../db.ts';
import { audit, diff } from '../audit.ts';
import { config } from '../config.ts';
import { EXPENSE_CATEGORIES, orgSettings } from '../settings.ts';
import { bad, bp, conflict, ctx, forbidden, fyOf, inr, istDate, isPan, isGstin, json, now, uid, notFound } from '../util.ts';
import { post, balanceOf as ledgerBalance } from './ledger.ts';
import { notifyStaff } from './notify.ts';

export const TDS_SECTIONS = [
  { section: '194C', label: 'Contractors – individual/HUF', rateBp: 100 },
  { section: '194C', label: 'Contractors – others', rateBp: 200 },
  { section: '194J', label: 'Professional / technical fees', rateBp: 1000 },
  { section: '194I', label: 'Rent – land/building', rateBp: 1000 },
  { section: '194I', label: 'Rent – plant/machinery', rateBp: 200 },
  { section: '194H', label: 'Commission / brokerage', rateBp: 200 },
];

export interface ExpenseInput {
  event_id: string; category: string; cost_behaviour?: string; description: string; vendor_id?: string | null;
  invoice_no?: string | null; bill_date: string; amount_paise: number; gst_rate_bp?: number; gst_paise?: number | null; itc_eligible?: boolean;
  tds_section?: string | null; tds_rate_bp?: number; payment_mode?: string; claimant_id?: string | null; splits?: { event_id: string; pct: number }[];
  status?: 'draft' | 'submitted'; bill_path?: string | null; budget_override?: boolean; force_duplicate?: boolean;
}

const total = (e: { amount_paise: number; gst_paise: number }) => e.amount_paise + e.gst_paise;
export const payable = (e: { amount_paise: number; gst_paise: number; tds_paise: number }) => total(e) - e.tds_paise;

export function budgetStatus(eventId: string, category: string, extra = 0) {
  const b = one('SELECT * FROM budget WHERE event_id = ? AND category = ?', eventId, category);
  const committed = scalar<number>("SELECT COALESCE(SUM(amount_paise),0) FROM expense WHERE event_id = ? AND category = ? AND status IN ('draft','submitted','approved')", eventId, category) ?? 0;
  if (!b) return { budget: null, committed, left: null, pct: null, hardLimit: false };
  const after = committed + extra;
  return { budget: b.amount_paise, committed, after, left: b.amount_paise - committed, pct: b.amount_paise ? Math.round((after / b.amount_paise) * 100) : null, hardLimit: !!b.hard_limit };
}

export function createExpense(i: ExpenseInput) {
  if (!EXPENSE_CATEGORIES.includes(i.category as any)) throw bad('Choose a category');
  if (!i.description?.trim()) throw bad('Describe the expense');
  if (!(i.amount_paise > 0)) throw bad('Enter the amount');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.bill_date ?? '')) throw bad('Enter the bill date');
  if (i.splits?.length && i.splits.reduce((s, x) => s + x.pct, 0) !== 100) throw bad('Split percentages must add up to 100');
  const gst = i.gst_paise != null ? i.gst_paise : bp(i.amount_paise, i.gst_rate_bp ?? 0);
  const tds = i.tds_rate_bp ? bp(i.amount_paise, i.tds_rate_bp) : 0;
  return tx(() => {
    if (i.vendor_id && i.invoice_no && !i.force_duplicate) {
      const dup = one("SELECT ref FROM expense WHERE vendor_id = ? AND lower(invoice_no) = lower(?) AND amount_paise = ? AND status <> 'rejected'", i.vendor_id, i.invoice_no, i.amount_paise);
      if (dup) throw conflict(`Possible duplicate bill: same vendor, invoice number and amount as ${dup.ref}`, { duplicate: dup.ref });
    }
    const b = budgetStatus(i.event_id, i.category, i.amount_paise);
    const isCfo = ctx().roles?.includes('cfo');
    if (b.budget != null && b.hardLimit && (b.after ?? 0) > b.budget && !(i.budget_override && isCfo)) {
      throw conflict(`This takes ${i.category} to ${b.pct}% of budget, above the hard limit. The CFO must override.`);
    }
    const id = uid();
    const ref = `EXP/${fyOf(i.bill_date)}/${String(nextCounter(`exp:${fyOf(i.bill_date)}`)).padStart(5, '0')}`;
    insert('expense', {
      id, ref, event_id: i.event_id, splits: JSON.stringify(i.splits ?? []), category: i.category, cost_behaviour: i.cost_behaviour ?? 'fixed',
      description: i.description.trim(), vendor_id: i.vendor_id ?? null, invoice_no: i.invoice_no ?? null, bill_date: i.bill_date,
      amount_paise: i.amount_paise, gst_rate_bp: i.gst_rate_bp ?? 0, gst_paise: gst, itc_eligible: i.itc_eligible ? 1 : 0,
      tds_section: i.tds_section ?? null, tds_rate_bp: i.tds_rate_bp ?? 0, tds_paise: tds, payment_mode: i.payment_mode ?? 'bank', claimant_id: i.claimant_id ?? (i.payment_mode === 'personal' ? ctx().userId : null),
      status: i.status ?? 'submitted', bill_path: i.bill_path ?? null, submitted_by: ctx().userId ?? null, budget_override: i.budget_override ? 1 : 0, created_at: now(),
    });
    if (b.pct != null && b.pct >= 80) notifyStaff(['cfo'], 'staff_alert', { title: `Budget ${b.pct >= 100 ? 'exceeded' : 'at ' + b.pct + '%'}: ${i.category}`, message: `${ref} brings ${i.category} to ${inr(b.after!)} of ${inr(b.budget!)} (${b.pct}%).` }, i.event_id);
    const limit = orgSettings().approvalLimits.accountantExpensePaise;
    if ((i.status ?? 'submitted') === 'submitted' && total({ amount_paise: i.amount_paise, gst_paise: gst }) > limit) {
      notifyStaff(['cfo'], 'expense_above_limit', { expense_ref: ref, amount: inr(i.amount_paise + gst), description: i.description, category: i.category, requester: ctx().userLabel, approve_link: `${config.baseUrl}/app/expenses?open=${id}` }, i.event_id);
    }
    audit('expense.create', 'expense', id, undefined, { ref, amount: i.amount_paise, gst, tds, category: i.category });
    return { id, ref, budget: b };
  });
}

export function editExpense(id: string, patch: Partial<ExpenseInput>) {
  const e = one('SELECT * FROM expense WHERE id = ?', id);
  if (!e) throw notFound('Expense');
  if (!['draft', 'submitted', 'rejected'].includes(e.status)) throw conflict('Approved expenses are posted to the books and cannot be edited; reverse the journal instead');
  const next: Record<string, any> = {};
  for (const k of ['category', 'cost_behaviour', 'description', 'vendor_id', 'invoice_no', 'bill_date', 'amount_paise', 'gst_rate_bp', 'itc_eligible', 'tds_section', 'tds_rate_bp', 'payment_mode'] as const) if (patch[k] !== undefined) next[k] = patch[k];
  const amt = next.amount_paise ?? e.amount_paise;
  next.gst_paise = patch.gst_paise ?? bp(amt, next.gst_rate_bp ?? e.gst_rate_bp);
  next.tds_paise = bp(amt, next.tds_rate_bp ?? e.tds_rate_bp);
  if (e.status === 'rejected') next.status = 'submitted';
  const d = diff(e, next);
  update('expense', id, next);
  audit('expense.edit', 'expense', id, d.before, d.after);
}

/** Maker-checker approval. Under the limit the Accountant may approve; above it only the CFO. Posting happens here. */
export function approveExpense(id: string) {
  return tx(() => {
    const e = one('SELECT * FROM expense WHERE id = ?', id);
    if (!e) throw notFound('Expense');
    if (e.status !== 'submitted' && e.status !== 'draft') throw conflict(`Expense is ${e.status}`);
    const me = ctx().userId; const roles = ctx().roles ?? [];
    if (e.submitted_by && e.submitted_by === me) throw forbidden('You submitted this expense, so someone else must approve it');
    const limit = orgSettings().approvalLimits.accountantExpensePaise;
    if (!roles.includes('cfo') && total(e) > limit) throw forbidden(`Above ${inr(limit)} only the CFO can approve`);
    if (!roles.includes('cfo') && !roles.includes('accountant')) throw forbidden();
    update('expense', id, { status: 'approved', approved_by: me, approved_at: now() });
    postExpense(e);
    audit('expense.approve', 'expense', id, { status: e.status }, { status: 'approved' });
  });
}

function postExpense(e: Record<string, any>) {
  const splits = json<{ event_id: string; pct: number }[]>(e.splits, []);
  const parts = splits.length ? splits : [{ event_id: e.event_id, pct: 100 }];
  const credit = e.payment_mode === 'personal' ? 'reimbursements' : 'creditors';
  const party = e.payment_mode === 'personal' ? { party_type: 'user', party_id: e.claimant_id } : { party_type: 'vendor', party_id: e.vendor_id };
  let usedAmt = 0, usedGst = 0, usedTds = 0;
  parts.forEach((p, idx) => {
    const last = idx === parts.length - 1;
    const amt = last ? e.amount_paise - usedAmt : Math.round((e.amount_paise * p.pct) / 100);
    const gst = last ? e.gst_paise - usedGst : Math.round((e.gst_paise * p.pct) / 100);
    const tds = last ? e.tds_paise - usedTds : Math.round((e.tds_paise * p.pct) / 100);
    usedAmt += amt; usedGst += gst; usedTds += tds;
    post({
      date: e.bill_date, eventId: p.event_id, narration: `${e.ref} ${e.category}: ${e.description}${parts.length > 1 ? ` (${p.pct}% share)` : ''}`, sourceType: 'expense', sourceId: e.id,
      lines: [
        { account: `exp_${e.category}`, debit: amt + (e.itc_eligible ? 0 : gst) },
        { account: 'gst_input', debit: e.itc_eligible ? gst : 0, memo: 'Input tax credit' },
        { account: credit, credit: amt + gst - tds, ...party },
        { account: 'tds_payable', credit: tds, ...party, memo: e.tds_section ? `TDS u/s ${e.tds_section}` : undefined },
      ],
    });
  });
}

export function rejectExpense(id: string, reason: string) {
  const e = one('SELECT * FROM expense WHERE id = ?', id);
  if (!e) throw notFound('Expense');
  if (!['submitted', 'draft'].includes(e.status)) throw conflict(`Expense is ${e.status}`);
  if (!reason?.trim()) throw bad('Give a reason');
  update('expense', id, { status: 'rejected', reason });
  audit('expense.reject', 'expense', id, { status: e.status }, { status: 'rejected', reason });
}

/** Pay an approved bill or claim. Mode "advance" settles it against an earlier advance to that party. */
export function payExpense(id: string, o: { amountPaise: number; mode: 'bank' | 'cash' | 'upi' | 'card' | 'advance'; paidOn?: string; reference?: string }) {
  return tx(() => {
    const e = one('SELECT * FROM expense WHERE id = ?', id);
    if (!e) throw notFound('Expense');
    if (e.status !== 'approved') throw conflict('Only approved expenses can be paid');
    const due = payable(e) - e.paid_paise;
    if (o.amountPaise <= 0 || o.amountPaise > due) throw bad(`Up to ${inr(due)} is payable`);
    const roles = ctx().roles ?? [];
    if (!roles.includes('cfo') && o.amountPaise > orgSettings().approvalLimits.accountantExpensePaise) throw forbidden('Payments above the accountant limit need the CFO');
    const paidOn = o.paidOn ?? istDate();
    const debit = e.payment_mode === 'personal' ? 'reimbursements' : 'creditors';
    const party = e.payment_mode === 'personal' ? { party_type: 'user', party_id: e.claimant_id } : { party_type: 'vendor', party_id: e.vendor_id };
    const credit = o.mode === 'cash' ? 'cash' : o.mode === 'advance' ? 'advances' : 'bank';
    insert('expense_payment', { id: uid(), expense_id: id, amount_paise: o.amountPaise, mode: o.mode, paid_on: paidOn, reference: o.reference ?? null, paid_by: ctx().userId ?? null, created_at: now() });
    post({ date: paidOn, eventId: e.event_id, narration: `Payment for ${e.ref}${o.reference ? ' ref ' + o.reference : ''}`, sourceType: 'expense_payment', sourceId: id,
      lines: [{ account: debit, debit: o.amountPaise, ...party }, { account: credit, credit: o.amountPaise, ...(credit === 'advances' ? party : {}), memo: o.reference }] });
    const paid = e.paid_paise + o.amountPaise;
    update('expense', id, { paid_paise: paid, payment_status: paid >= payable(e) ? 'paid' : 'part_paid' });
    audit('expense.pay', 'expense', id, { paid_paise: e.paid_paise }, { paid_paise: paid, mode: o.mode });
  });
}

/** Vendor credit note: reduces what is owed and reverses the expense and input credit proportionally. */
export function vendorCreditNote(expenseId: string, amountPaise: number, gstPaise: number, note: string) {
  return tx(() => {
    const e = one('SELECT * FROM expense WHERE id = ?', expenseId);
    if (!e || e.status !== 'approved') throw conflict('Credit notes apply to approved expenses');
    const credit = e.payment_mode === 'personal' ? 'reimbursements' : 'creditors';
    post({ eventId: e.event_id, narration: `Vendor credit note on ${e.ref}: ${note}`, sourceType: 'vendor_credit_note', sourceId: e.id,
      lines: [{ account: credit, debit: amountPaise + gstPaise, party_type: 'vendor', party_id: e.vendor_id }, { account: `exp_${e.category}`, credit: amountPaise + (e.itc_eligible ? 0 : gstPaise) }, { account: 'gst_input', credit: e.itc_eligible ? gstPaise : 0 }] });
    update('expense', expenseId, { amount_paise: e.amount_paise - amountPaise, gst_paise: e.gst_paise - gstPaise });
    audit('expense.credit_note', 'expense', expenseId, undefined, { amountPaise, gstPaise, note });
  });
}

export function recordAdvance(o: { partyType: 'vendor' | 'user'; partyId: string; amountPaise: number; eventId: string; note: string; paidOn?: string; mode?: 'bank' | 'cash' }) {
  if (!(o.amountPaise > 0)) throw bad('Enter the amount');
  return post({ date: o.paidOn, eventId: o.eventId, narration: `Advance paid: ${o.note}`, sourceType: 'advance', sourceId: o.partyId,
    lines: [{ account: 'advances', debit: o.amountPaise, party_type: o.partyType, party_id: o.partyId }, { account: o.mode === 'cash' ? 'cash' : 'bank', credit: o.amountPaise }] });
}

export function advanceBalances() {
  return all(`SELECT l.party_type, l.party_id, SUM(l.debit_paise - l.credit_paise) AS balance,
      COALESCE(v.name, u.name) AS name FROM journal_line l JOIN account a ON a.id = l.account_id
      LEFT JOIN vendor v ON l.party_type = 'vendor' AND v.id = l.party_id LEFT JOIN user u ON l.party_type = 'user' AND u.id = l.party_id
      WHERE a.sys = 'advances' GROUP BY l.party_type, l.party_id HAVING balance <> 0`);
}

export function pettyCashTopUp(amountPaise: number, note: string) {
  return post({ narration: `Petty cash float top-up: ${note}`, sourceType: 'petty_cash', lines: [{ account: 'cash', debit: amountPaise }, { account: 'bank', credit: amountPaise }] });
}
export function pettyCashCount(countedPaise: number, note?: string) {
  const book = ledgerBalance('cash');
  const id = uid();
  insert('petty_cash_count', { id, count_date: istDate(), counted_paise: countedPaise, book_paise: book, counted_by: ctx().userId ?? 'system', note: note ?? null, created_at: now() });
  audit('petty_cash.count', 'petty_cash_count', id, undefined, { counted: countedPaise, book, difference: countedPaise - book });
  return { book, counted: countedPaise, difference: countedPaise - book };
}

export function duplicateExpense(id: string, billDate: string) {
  const e = one('SELECT * FROM expense WHERE id = ?', id);
  if (!e) throw notFound('Expense');
  return createExpense({ ...e, splits: json(e.splits, []), itc_eligible: !!e.itc_eligible, bill_date: billDate, invoice_no: null, status: 'submitted', description: `${e.description} (recurring)` });
}

/** Who is owed what, and for how long. */
export function vendorAgeing(asOn = istDate()) {
  const rows = all(`SELECT e.*, v.name AS vendor FROM expense e LEFT JOIN vendor v ON v.id = e.vendor_id WHERE e.status = 'approved' AND e.payment_status <> 'paid'`);
  const out = new Map<string, any>();
  for (const e of rows) {
    const key = e.vendor_id ?? `claim:${e.claimant_id}`;
    const due = payable(e) - e.paid_paise;
    const days = Math.floor((new Date(asOn).getTime() - new Date(e.bill_date).getTime()) / 86400_000);
    const bucket = days <= 30 ? 'd0_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'd90_plus';
    const r = out.get(key) ?? { vendor: e.vendor ?? 'Team reimbursement', d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0, bills: 0 };
    r[bucket] += due; r.total += due; r.bills++;
    out.set(key, r);
  }
  return [...out.values()].sort((a, b) => b.total - a.total);
}

export function upsertVendor(v: Record<string, any>) {
  if (!v.name?.trim()) throw bad('Vendor name is required');
  if (v.pan && !isPan(v.pan)) throw bad('PAN format looks wrong (ABCDE1234F)');
  if (v.gstin && !isGstin(v.gstin)) throw bad('GSTIN format looks wrong');
  const row = { name: v.name.trim(), pan: v.pan?.toUpperCase() || null, gstin: v.gstin?.toUpperCase() || null, bank_account: v.bank_account || null, bank_ifsc: v.bank_ifsc?.toUpperCase() || null, email: v.email || null, phone: v.phone || null };
  if (v.id) {
    const before = one('SELECT * FROM vendor WHERE id = ?', v.id);
    if (!before) throw notFound('Vendor');
    update('vendor', v.id, row);
    const d = diff(before, row); audit('vendor.update', 'vendor', v.id, d.before, d.after);
    return v.id;
  }
  const id = uid();
  insert('vendor', { id, ...row, created_at: now() });
  audit('vendor.create', 'vendor', id, undefined, row);
  return id;
}

export function setBudget(eventId: string, category: string, amountPaise: number, hardLimit: boolean) {
  const before = one('SELECT * FROM budget WHERE event_id = ? AND category = ?', eventId, category);
  run('INSERT INTO budget (id, event_id, category, amount_paise, hard_limit) VALUES (?,?,?,?,?) ON CONFLICT(event_id, category) DO UPDATE SET amount_paise = excluded.amount_paise, hard_limit = excluded.hard_limit',
    uid(), eventId, category, amountPaise, hardLimit ? 1 : 0);
  audit('budget.set', 'budget', `${eventId}:${category}`, before ?? null, { amountPaise, hardLimit });
}

export function budgetVsActual(eventId: string) {
  return EXPENSE_CATEGORIES.map((c) => {
    const b = one('SELECT * FROM budget WHERE event_id = ? AND category = ?', eventId, c);
    const sum = (st: string) => scalar<number>(`SELECT COALESCE(SUM(amount_paise),0) FROM expense WHERE event_id = ? AND category = ? AND status IN (${st})`, eventId, c) ?? 0;
    const committed = sum("'draft','submitted'"), incurred = sum("'approved'");
    const paid = scalar<number>("SELECT COALESCE(SUM(paid_paise),0) FROM expense WHERE event_id = ? AND category = ? AND status = 'approved'", eventId, c) ?? 0;
    const budget = b?.amount_paise ?? 0;
    return { category: c, budget, hardLimit: !!b?.hard_limit, committed, incurred, paid, pct: budget ? Math.round(((committed + incurred) / budget) * 100) : null, over: budget > 0 && committed + incurred > budget };
  }).filter((r) => r.budget || r.committed || r.incurred);
}
