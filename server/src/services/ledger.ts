import { all, one, run, insert, tx, nextCounter, scalar } from '../db.ts';
import { audit } from '../audit.ts';
import { bad, conflict, ctx, istDate, now, uid, fyOf, fyRange } from '../util.ts';

// Chart of accounts. `sys` keys are what posting templates use; the CA can rename accounts freely.
export const CHART: { code: string; name: string; type: string; sys: string; schedule3: string }[] = [
  { code: '1000', name: 'Bank - current account', type: 'asset', sys: 'bank', schedule3: 'Cash and cash equivalents' },
  { code: '1010', name: 'Petty cash', type: 'asset', sys: 'cash', schedule3: 'Cash and cash equivalents' },
  { code: '1100', name: 'Gateway clearing - Razorpay', type: 'asset', sys: 'clearing_razorpay', schedule3: 'Other current assets' },
  { code: '1101', name: 'Gateway clearing - Cashfree', type: 'asset', sys: 'clearing_cashfree', schedule3: 'Other current assets' },
  { code: '1102', name: 'Gateway clearing - Sandbox', type: 'asset', sys: 'clearing_mock', schedule3: 'Other current assets' },
  { code: '1200', name: 'GST input credit', type: 'asset', sys: 'gst_input', schedule3: 'Other current assets' },
  { code: '1300', name: 'Advances to vendors and team', type: 'asset', sys: 'advances', schedule3: 'Short-term loans and advances' },
  { code: '2000', name: 'Advance registration fees', type: 'liability', sys: 'advance_fees', schedule3: 'Other current liabilities' },
  { code: '2100', name: 'GST output payable', type: 'liability', sys: 'gst_output', schedule3: 'Other current liabilities' },
  { code: '2200', name: 'TDS payable', type: 'liability', sys: 'tds_payable', schedule3: 'Other current liabilities' },
  { code: '2300', name: 'Commission payable', type: 'liability', sys: 'commission_payable', schedule3: 'Trade payables' },
  { code: '2400', name: 'Sundry creditors', type: 'liability', sys: 'creditors', schedule3: 'Trade payables' },
  { code: '2500', name: 'Reimbursements payable to team', type: 'liability', sys: 'reimbursements', schedule3: 'Other current liabilities' },
  { code: '2600', name: 'Delegate excess payments', type: 'liability', sys: 'delegate_excess', schedule3: 'Other current liabilities' },
  { code: '3000', name: 'Share capital / opening equity', type: 'equity', sys: 'equity', schedule3: 'Share capital' },
  { code: '3100', name: 'Reserves and surplus', type: 'equity', sys: 'reserves', schedule3: 'Reserves and surplus' },
  { code: '4000', name: 'Registration fee income', type: 'income', sys: 'reg_income', schedule3: 'Revenue from operations' },
  { code: '4100', name: 'Sponsorship income', type: 'income', sys: 'sponsorship_income', schedule3: 'Revenue from operations' },
  { code: '4200', name: 'Merchandise income', type: 'income', sys: 'merch_income', schedule3: 'Revenue from operations' },
  { code: '4900', name: 'Other income', type: 'income', sys: 'other_income', schedule3: 'Other income' },
  { code: '5000', name: 'Payment gateway charges', type: 'expense', sys: 'gateway_fee', schedule3: 'Other expenses' },
  { code: '5010', name: 'Referral commission', type: 'expense', sys: 'commission_expense', schedule3: 'Other expenses' },
  { code: '5100', name: 'Venue hire', type: 'expense', sys: 'exp_venue', schedule3: 'Other expenses' },
  { code: '5110', name: 'Catering', type: 'expense', sys: 'exp_catering', schedule3: 'Other expenses' },
  { code: '5120', name: 'Printing', type: 'expense', sys: 'exp_printing', schedule3: 'Other expenses' },
  { code: '5130', name: 'Stationery', type: 'expense', sys: 'exp_stationery', schedule3: 'Other expenses' },
  { code: '5140', name: 'Merchandise', type: 'expense', sys: 'exp_merchandise', schedule3: 'Other expenses' },
  { code: '5150', name: 'Awards and trophies', type: 'expense', sys: 'exp_awards', schedule3: 'Other expenses' },
  { code: '5160', name: 'Marketing', type: 'expense', sys: 'exp_marketing', schedule3: 'Other expenses' },
  { code: '5170', name: 'Technology', type: 'expense', sys: 'exp_technology', schedule3: 'Other expenses' },
  { code: '5180', name: 'Travel', type: 'expense', sys: 'exp_travel', schedule3: 'Other expenses' },
  { code: '5190', name: 'Accommodation', type: 'expense', sys: 'exp_accommodation', schedule3: 'Other expenses' },
  { code: '5200', name: 'Honorarium', type: 'expense', sys: 'exp_honorarium', schedule3: 'Other expenses' },
  { code: '5210', name: 'Security', type: 'expense', sys: 'exp_security', schedule3: 'Other expenses' },
  { code: '5220', name: 'Photography', type: 'expense', sys: 'exp_photography', schedule3: 'Other expenses' },
  { code: '5230', name: 'Decor', type: 'expense', sys: 'exp_decor', schedule3: 'Other expenses' },
  { code: '5990', name: 'Miscellaneous expenses', type: 'expense', sys: 'exp_miscellaneous', schedule3: 'Other expenses' },
];

export function seedChart() {
  for (const a of CHART) {
    run('INSERT OR IGNORE INTO account (id, code, name, type, sys, schedule3) VALUES (?,?,?,?,?,?)', uid(), a.code, a.name, a.type, a.sys, a.schedule3);
  }
}

const accCache = new Map<string, string>();
export function acc(sys: string): string {
  let id = accCache.get(sys);
  if (!id) {
    id = scalar<string>('SELECT id FROM account WHERE sys = ?', sys);
    if (!id) throw new Error(`Account not configured: ${sys}`);
    accCache.set(sys, id);
  }
  return id;
}
export function clearAccountCache() { accCache.clear(); }
export const clearingAccount = (gateway: string) => acc(`clearing_${gateway}`);

export interface Line { account: string; debit?: number; credit?: number; party_type?: string; party_id?: string; memo?: string }
export interface PostInput {
  date?: string; eventId?: string | null; narration: string; sourceType: string; sourceId?: string | null;
  lines: Line[]; reversesId?: string;
}

export function isLocked(date: string) {
  return !!one('SELECT 1 FROM period_lock WHERE period = ?', date.slice(0, 7));
}

/** Post a balanced double-entry journal. Account may be a sys key or an account id. */
export function post(input: PostInput) {
  const lines = input.lines
    .map((l) => {
      // A negative debit is a credit and vice versa; each line keeps only its net side.
      const net = Math.round(l.debit ?? 0) - Math.round(l.credit ?? 0);
      return { ...l, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    })
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  if (!lines.length) return null;
  const dr = lines.reduce((s, l) => s + l.debit, 0);
  const cr = lines.reduce((s, l) => s + l.credit, 0);
  if (dr !== cr) throw bad(`Journal does not balance: debit ${dr} vs credit ${cr}`);
  const date = input.date ?? istDate();
  if (isLocked(date)) throw conflict(`Period ${date.slice(0, 7)} is locked. Ask the CFO to reopen it or post in an open period.`);
  return tx(() => {
    const id = uid();
    const num = `JV/${fyOf(date)}/${String(nextCounter(`jv:${fyOf(date)}`)).padStart(6, '0')}`;
    insert('journal_entry', {
      id, number: num, entry_date: date, event_id: input.eventId ?? null, narration: input.narration,
      source_type: input.sourceType, source_id: input.sourceId ?? null, reverses_id: input.reversesId ?? null,
      posted_by: ctx().userId ?? null, posted_at: now(),
    });
    for (const l of lines) {
      const accountId = l.account.includes('-') && l.account.length > 30 ? l.account : acc(l.account);
      insert('journal_line', { id: uid(), entry_id: id, account_id: accountId, debit_paise: l.debit, credit_paise: l.credit, party_type: l.party_type ?? null, party_id: l.party_id ?? null, memo: l.memo ?? null });
    }
    audit('journal.post', 'journal_entry', id, undefined, { number: num, date, narration: input.narration, source: input.sourceType, total: dr, lines });
    return { id, number: num };
  });
}

/** Corrections are reversing entries: swap every debit and credit, link both ways. */
export function reverse(entryId: string, reason: string, date = istDate()) {
  return tx(() => {
    const e = one('SELECT * FROM journal_entry WHERE id = ?', entryId);
    if (!e) throw bad('Journal entry not found');
    if (e.reversed_by_id) throw conflict('This entry has already been reversed');
    if (e.reverses_id) throw conflict('A reversing entry cannot itself be reversed; post a fresh correcting entry');
    const lines = all('SELECT * FROM journal_line WHERE entry_id = ?', entryId);
    const r = post({
      date, eventId: e.event_id, narration: `Reversal of ${e.number}: ${reason}`, sourceType: 'reversal', sourceId: e.id, reversesId: e.id,
      lines: lines.map((l) => ({ account: l.account_id, debit: l.credit_paise, credit: l.debit_paise, party_type: l.party_type, party_id: l.party_id, memo: l.memo })),
    })!;
    run('UPDATE journal_entry SET reversed_by_id = ? WHERE id = ?', r.id, e.id);
    audit('journal.reverse', 'journal_entry', e.id, { number: e.number }, { reversal: r.number, reason });
    return r;
  });
}

export function lockPeriod(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw bad('Period must be YYYY-MM');
  run('INSERT OR IGNORE INTO period_lock (period, locked_by, locked_at) VALUES (?,?,?)', period, ctx().userId ?? 'system', now());
  audit('period.lock', 'period', period);
}
export function unlockPeriod(period: string, reason: string) {
  if (!reason) throw bad('A reason is required to reopen a period');
  run('DELETE FROM period_lock WHERE period = ?', period);
  audit('period.reopen', 'period', period, { locked: true }, { locked: false, reason });
}

// ---------------- reports ----------------
interface Filter { from?: string; to?: string; eventId?: string | null }
function where(f: Filter, alias = 'e') {
  const w: string[] = []; const p: any[] = [];
  if (f.from) { w.push(`${alias}.entry_date >= ?`); p.push(f.from); }
  if (f.to) { w.push(`${alias}.entry_date <= ?`); p.push(f.to); }
  if (f.eventId) { w.push(`${alias}.event_id = ?`); p.push(f.eventId); }
  return { sql: w.length ? ' AND ' + w.join(' AND ') : '', params: p };
}

export function trialBalance(f: Filter = {}) {
  const w = where(f);
  const rows = all(`SELECT a.id, a.code, a.name, a.type, a.schedule3,
      COALESCE(SUM(l.debit_paise),0) AS debit, COALESCE(SUM(l.credit_paise),0) AS credit
    FROM account a LEFT JOIN journal_line l ON l.account_id = a.id
      AND l.entry_id IN (SELECT e.id FROM journal_entry e WHERE 1=1 ${w.sql})
    GROUP BY a.id ORDER BY a.code`, ...w.params);
  const out = rows.map((r) => {
    const net = r.debit - r.credit;
    return { ...r, balance_debit: net > 0 ? net : 0, balance_credit: net < 0 ? -net : 0 };
  });
  return {
    rows: out,
    totals: { debit: out.reduce((s, r) => s + r.balance_debit, 0), credit: out.reduce((s, r) => s + r.balance_credit, 0) },
  };
}

export function balanceOf(sys: string, f: Filter = {}) {
  const w = where(f);
  const r = one(`SELECT COALESCE(SUM(l.debit_paise - l.credit_paise),0) AS bal FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id
    WHERE l.account_id = ? ${w.sql}`, acc(sys), ...w.params);
  return r?.bal ?? 0;
}

export function ledger(accountId: string, f: Filter = {}) {
  const w = where(f);
  const account = one('SELECT * FROM account WHERE id = ? OR sys = ? OR code = ?', accountId, accountId, accountId);
  if (!account) throw bad('Account not found');
  const opening = f.from
    ? (one(`SELECT COALESCE(SUM(l.debit_paise - l.credit_paise),0) AS b FROM journal_line l JOIN journal_entry e ON e.id=l.entry_id WHERE l.account_id = ? AND e.entry_date < ? ${f.eventId ? 'AND e.event_id = ?' : ''}`,
      account.id, f.from, ...(f.eventId ? [f.eventId] : []))?.b ?? 0) : 0;
  const rows = all(`SELECT e.id AS entry_id, e.number, e.entry_date, e.narration, e.source_type, e.source_id, e.reversed_by_id, e.reverses_id,
      l.debit_paise, l.credit_paise, l.memo, l.party_type, l.party_id
    FROM journal_line l JOIN journal_entry e ON e.id = l.entry_id WHERE l.account_id = ? ${w.sql}
    ORDER BY e.entry_date, e.number`, account.id, ...w.params);
  let bal = opening;
  return { account, opening, rows: rows.map((r) => ({ ...r, balance: (bal += r.debit_paise - r.credit_paise) })), closing: bal };
}

export function journalRegister(f: Filter & { source?: string; q?: string; limit?: number } = {}) {
  const w = where(f);
  let sql = `SELECT e.* FROM journal_entry e WHERE 1=1 ${w.sql}`;
  const p = [...w.params];
  if (f.source) { sql += ' AND e.source_type = ?'; p.push(f.source); }
  if (f.q) { sql += ' AND (e.narration LIKE ? OR e.number LIKE ?)'; p.push(`%${f.q}%`, `%${f.q}%`); }
  sql += ` ORDER BY e.entry_date DESC, e.number DESC LIMIT ${Math.min(f.limit ?? 500, 5000)}`;
  const entries = all(sql, ...p);
  const lines = entries.length
    ? all(`SELECT l.*, a.code, a.name FROM journal_line l JOIN account a ON a.id = l.account_id WHERE l.entry_id IN (${entries.map(() => '?').join(',')})`, ...entries.map((e) => e.id))
    : [];
  return entries.map((e) => ({ ...e, lines: lines.filter((l) => l.entry_id === e.id) }));
}

/** Day book / cash book / bank book are ledgers of the relevant accounts across a period. */
export function book(kind: 'day' | 'cash' | 'bank', f: Filter) {
  if (kind === 'day') return journalRegister({ ...f, limit: 5000 }).reverse();
  return ledger(kind === 'cash' ? acc('cash') : acc('bank'), f);
}

export function profitAndLoss(f: Filter = {}) {
  const tb = trialBalance(f).rows;
  const income = tb.filter((r) => r.type === 'income').map((r) => ({ code: r.code, name: r.name, schedule3: r.schedule3, amount: r.credit - r.debit }));
  const expenses = tb.filter((r) => r.type === 'expense').map((r) => ({ code: r.code, name: r.name, schedule3: r.schedule3, amount: r.debit - r.credit }));
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);
  const group = (rows: typeof income) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { m[r.schedule3] = (m[r.schedule3] ?? 0) + r.amount; return m; }, {})).map(([line, amount]) => ({ line, amount }));
  return { income, expenses, totalIncome, totalExpenses, surplus: totalIncome - totalExpenses, schedule3: { income: group(income), expenses: group(expenses) } };
}

export function balanceSheet(asOn: string, eventId?: string | null) {
  const tb = trialBalance({ to: asOn, eventId }).rows;
  const pl = profitAndLoss({ to: asOn, eventId });
  const section = (type: string, sign: 1 | -1) => tb.filter((r) => r.type === type).map((r) => ({ code: r.code, name: r.name, schedule3: r.schedule3, amount: sign * (r.debit - r.credit) })).filter((r) => r.amount !== 0);
  const assets = section('asset', 1);
  const liabilities = section('liability', -1);
  const equity = section('equity', -1);
  equity.push({ code: '—', name: 'Surplus / (deficit) for the period', schedule3: 'Reserves and surplus', amount: pl.surplus });
  const sum = (r: { amount: number }[]) => r.reduce((s, x) => s + x.amount, 0);
  return { asOn, assets, liabilities, equity, totalAssets: sum(assets), totalEquityAndLiabilities: sum(liabilities) + sum(equity) };
}

export function gstSummary(f: Filter = {}) {
  const w: string[] = []; const p: any[] = [];
  if (f.from) { w.push('i.issued_at >= ?'); p.push(f.from); }
  if (f.to) { w.push('i.issued_at <= ?'); p.push(f.to + 'T23:59:59'); }
  if (f.eventId) { w.push('r.event_id = ?'); p.push(f.eventId); }
  const inv = all(`SELECT i.*, r.full_name, r.ref AS reg_ref FROM invoice i LEFT JOIN registration r ON r.id = i.registration_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY i.issued_at`, ...p);
  const sign = (i: any) => (i.kind === 'credit_note' ? -1 : 1);
  const output = inv.reduce((s, i) => ({
    taxable: s.taxable + sign(i) * i.taxable_paise, cgst: s.cgst + sign(i) * i.cgst_paise, sgst: s.sgst + sign(i) * i.sgst_paise, igst: s.igst + sign(i) * i.igst_paise,
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  const ew: string[] = ["e.status = 'approved'"]; const ep: any[] = [];
  if (f.from) { ew.push('e.bill_date >= ?'); ep.push(f.from); }
  if (f.to) { ew.push('e.bill_date <= ?'); ep.push(f.to); }
  if (f.eventId) { ew.push('e.event_id = ?'); ep.push(f.eventId); }
  const expenses = all(`SELECT e.ref, e.bill_date, e.invoice_no, e.amount_paise, e.gst_paise, e.itc_eligible, v.name AS vendor, v.gstin FROM expense e LEFT JOIN vendor v ON v.id = e.vendor_id WHERE ${ew.join(' AND ')} ORDER BY e.bill_date`, ...ep);
  const sw: string[] = ["1=1"]; const sp: any[] = [];
  if (f.from) { sw.push('settled_on >= ?'); sp.push(f.from); }
  if (f.to) { sw.push('settled_on <= ?'); sp.push(f.to); }
  const gatewayItc = scalar<number>(`SELECT COALESCE(SUM(tax_paise),0) FROM settlement WHERE status='posted' AND ${sw.join(' AND ')}`, ...sp) ?? 0;
  const inputCredit = expenses.filter((e) => e.itc_eligible).reduce((s, e) => s + e.gst_paise, 0) + gatewayItc;
  const outputTax = output.cgst + output.sgst + output.igst;
  return { invoices: inv, output, outputTax, expenses, gatewayItc, inputCredit, netPayable: outputTax - inputCredit };
}

export function currentFy() { return fyOf(istDate()); }
export { fyRange };
