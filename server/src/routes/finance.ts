import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run, insert, update, scalar } from '../db.ts';
import { audit, diff } from '../audit.ts';
import { config } from '../config.ts';
import { getEvent, getOrg, EXPENSE_CATEGORIES } from '../settings.ts';
import { requirePerm, requireUser, can } from '../auth.ts';
import { bad, conflict, forbidden, json, notFound, now, parseMoney, token, uid, istDate, isPan, normalizeName, fyOf, fyRange, inr } from '../util.ts';
import { h, upload, P } from './public.ts';
import { approveEvidence, rejectEvidence, bulkApprove, signedFileUrl, autoMatchEvidence, sniff } from '../services/evidence.ts';
import { approveRefund, rejectRefund, completeRefund, switchRefundToManual, requestRefund, excessPayments, refundExcess, transferExcess, recordSponsorship, postSettlementDraft, resolveOrder, unsettledPayments, availableGateways } from '../services/payments.ts';
import { gateways, isHealthy } from '../services/gateways.ts';
import { statement, approveLines, payout, reconcile, tdsRegister, form16a, planFor } from '../services/commission.ts';
import { createExpense, editExpense, approveExpense, rejectExpense, payExpense, vendorCreditNote, recordAdvance, advanceBalances, pettyCashTopUp, pettyCashCount, duplicateExpense, vendorAgeing, upsertVendor, setBudget, budgetVsActual, budgetStatus, TDS_SECTIONS } from '../services/expenses.ts';
import { trialBalance, ledger, journalRegister, book, profitAndLoss, balanceSheet, gstSummary, reverse, lockPeriod, unlockPeriod, currentFy } from '../services/ledger.ts';
import { requestJournal, approveJournal, rejectJournal } from '../services/journals.ts';
import { dashboard, scenario } from '../services/dashboard.ts';
import { toCsv, toXlsx, statementPdf, tallyXml, logExport, exportMeta, commissionStatementPdf, tablePdf, invoicePdf } from '../services/documents.ts';

export const financeRouter = express.Router();
financeRouter.use(requireUser);

// ---------- dashboard ----------
financeRouter.get('/events/:id/dashboard', requirePerm('dashboard.read'), h((req) => dashboard(P(req).id)));
financeRouter.post('/events/:id/scenario', requirePerm('dashboard.read'), h((req) => scenario(P(req).id, req.body ?? {})));

// ---------- screenshot review queue ----------
financeRouter.get('/events/:id/evidence', requirePerm('payments.read'), h((req) => {
  const status = String(req.query.status ?? 'submitted');
  return all(`SELECT e.*, r.ref, r.full_name, r.email, r.mobile, r.total_paise, r.paid_paise, r.refunded_paise, r.hold_expires_at, u.name AS reviewer,
      b.txn_date AS bank_date, b.description AS bank_description, b.amount_paise AS bank_amount
    FROM payment_evidence e JOIN registration r ON r.id = e.registration_id LEFT JOIN user u ON u.id = e.reviewer_id LEFT JOIN bank_line b ON b.id = e.bank_line_id
    WHERE r.event_id = ? ${status === 'all' ? '' : 'AND e.status = ?'} ORDER BY e.submitted_at`, P(req).id, ...(status === 'all' ? [] : [status]))
    .map((e) => ({ ...e, tamper_flags: json(e.tamper_flags, []), expected_paise: e.total_paise - e.paid_paise + e.refunded_paise, url: signedFileUrl(e.file_path), ageHours: Math.round((Date.now() - new Date(e.submitted_at).getTime()) / 3600_000) }));
}));
financeRouter.post('/evidence/:id/approve', requirePerm('payments.approve'), h((req) => approveEvidence(P(req).id, req.body?.amount_paise)));
financeRouter.post('/evidence/:id/reject', requirePerm('payments.approve'), h((req) => { rejectEvidence(P(req).id, req.body?.reason, req.body?.mode === 'resubmit' ? 'resubmit' : 'rejected'); return { ok: true }; }));
financeRouter.post('/evidence/bulk-approve', requirePerm('payments.approve'), h((req) => bulkApprove(req.body?.ids ?? [], req.body?.requireBankMatch !== false)));
financeRouter.post('/evidence/rematch', requirePerm('payments.read'), h(() => ({ matched: autoMatchEvidence() })));
financeRouter.get('/bank-lines', requirePerm('payments.read'), h(() => all(`SELECT b.*, r.ref FROM bank_line b LEFT JOIN payment_evidence e ON e.id = b.matched_evidence_id LEFT JOIN registration r ON r.id = e.registration_id ORDER BY b.txn_date DESC LIMIT 1000`)));

// ---------- gateway payments ----------
financeRouter.get('/payments/transactions', requirePerm('payments.read'), h((req) => all(`SELECT t.*, COALESCE(r.ref, (SELECT group_concat(r2.ref) FROM registration r2 WHERE o.covers LIKE '%' || r2.id || '%')) AS refs, o.gateway_order_id, o.status AS order_status
  FROM payment_transaction t LEFT JOIN registration r ON r.id = t.registration_id LEFT JOIN payment_order o ON o.id = t.order_id ORDER BY t.created_at DESC LIMIT ?`, Number(req.query.limit ?? 500))));
financeRouter.get('/payments/orders', requirePerm('payments.read'), h(() => all(`SELECT o.*, (SELECT group_concat(r.ref) FROM registration r WHERE o.covers LIKE '%' || r.id || '%') AS refs FROM payment_order o ORDER BY o.created_at DESC LIMIT 500`)));
financeRouter.post('/orders/:id/resolve', requirePerm('payments.read'), h(async (req) => ({ status: await resolveOrder(P(req).id) })));
financeRouter.get('/payments/webhooks', requirePerm('payments.read'), h(() => all('SELECT id, gateway, event_id, type, signature_valid, received_at, processed_at, result FROM webhook_event ORDER BY received_at DESC LIMIT 500')));
financeRouter.get('/payments/unsettled', requirePerm('payments.read'), h(() => unsettledPayments(Number(0))));
financeRouter.get('/events/:id/gateways', requirePerm('payments.read', 'event.config'), h((req) => ({
  available: availableGateways(P(req).id),
  all: Object.values(gateways).map((g) => ({ name: g.name, label: g.label, configured: g.configured(), healthy: isHealthy(g.name) })),
  webhookUrls: { razorpay: `${config.baseUrl}/api/webhooks/razorpay`, cashfree: `${config.baseUrl}/api/webhooks/cashfree` },
})));

// ---------- settlements ----------
financeRouter.get('/settlements', requirePerm('payments.read'), h(() => all('SELECT * FROM settlement ORDER BY settled_on DESC, created_at DESC LIMIT 500').map((s) => ({ ...s, payment_ids: json(s.payment_ids, []) }))));
financeRouter.post('/settlements/:id/post', requirePerm('books.post'), h((req) => postSettlementDraft(P(req).id)));
financeRouter.delete('/settlements/:id', requirePerm('books.post'), h((req) => {
  const s = one('SELECT * FROM settlement WHERE id = ?', P(req).id);
  if (!s || s.status !== 'draft') throw conflict('Only draft settlements can be discarded');
  run('DELETE FROM settlement WHERE id = ?', s.id); audit('settlement.discard', 'settlement', s.id, s, undefined);
  return { ok: true };
}));

// ---------- refunds & excess ----------
financeRouter.get('/refunds', requirePerm('refund.read'), h((req) => all(`SELECT f.*, r.ref, r.full_name, r.event_id, u.name AS requested_by_name, a.name AS approved_by_name, a2.name AS second_by_name FROM refund f
  JOIN registration r ON r.id = f.registration_id LEFT JOIN user u ON u.id = f.requested_by LEFT JOIN user a ON a.id = f.approved_by LEFT JOIN user a2 ON a2.id = f.second_approved_by
  ${req.query.event ? 'WHERE r.event_id = ?' : ''} ORDER BY f.created_at DESC`, ...(req.query.event ? [req.query.event] : []))));
financeRouter.post('/registrations/:id/refund', requirePerm('refund.request'), h((req) => ({ id: requestRefund(P(req).id, Number(req.body?.amount_paise), String(req.body?.reason ?? '')) })));
financeRouter.post('/refunds/:id/approve', requirePerm('refund.approve'), h((req) => approveRefund(P(req).id)));
financeRouter.post('/refunds/:id/reject', requirePerm('refund.approve'), h((req) => { rejectRefund(P(req).id, String(req.body?.reason ?? '')); return { ok: true }; }));
financeRouter.post('/refunds/:id/complete', requirePerm('refund.approve'), h((req) => { completeRefund(P(req).id, String(req.body?.reference ?? '')); return { ok: true }; }));
financeRouter.post('/refunds/:id/manual', requirePerm('refund.approve'), h((req) => { switchRefundToManual(P(req).id); return { ok: true }; }));
financeRouter.get('/excess', requirePerm('payments.read'), h((req) => excessPayments(req.query.event as string | undefined)));
financeRouter.post('/excess/:regId/refund', requirePerm('payments.excess'), h((req) => ({ id: refundExcess(P(req).regId, String(req.body?.reason ?? 'Excess payment')) })));
financeRouter.post('/excess/:regId/transfer', requirePerm('payments.excess'), h((req) => {
  const to = one('SELECT id FROM registration WHERE ref = ? OR id = ?', req.body?.to, req.body?.to);
  if (!to) throw notFound('Target registration');
  return { transferredPaise: transferExcess(P(req).regId, to.id) };
}));

// ---------- sponsorship ----------
financeRouter.get('/events/:id/sponsorships', requirePerm('books.read', 'dashboard.read'), h((req) => all('SELECT * FROM sponsorship WHERE event_id = ? ORDER BY received_on DESC', P(req).id)));
financeRouter.post('/events/:id/sponsorships', requirePerm('sponsorship.record'), h((req) => {
  const b = req.body ?? {};
  if (!b.sponsor || !(b.amount_paise > 0)) throw bad('Sponsor and amount are required');
  return { id: recordSponsorship(P(req).id, { sponsor: b.sponsor, amountPaise: b.amount_paise, gstPaise: b.gst_paise ?? 0, receivedOn: b.received_on ?? istDate() }) };
}));

// ---------- referrers & commission ----------
financeRouter.get('/referrers', requirePerm('commission.read', 'referral.link'), h(() => all(`SELECT f.*, p.name AS plan_name,
    (SELECT COUNT(*) FROM registration r WHERE r.referrer_id = f.id) AS referred,
    (SELECT COUNT(*) FROM registration r WHERE r.referrer_id = f.id AND r.confirmed_at IS NOT NULL AND r.payment_status IN ('paid','part_refunded')) AS paid,
    (SELECT COALESCE(SUM(amount_paise),0) FROM commission_line l WHERE l.referrer_id = f.id) AS earned,
    (SELECT COALESCE(SUM(amount_paise),0) FROM commission_line l WHERE l.referrer_id = f.id AND l.status = 'paid') AS paid_out,
    (SELECT COALESCE(SUM(amount_paise),0) FROM commission_line l WHERE l.referrer_id = f.id AND l.status = 'accrued') AS approvable
  FROM referrer f LEFT JOIN commission_plan p ON p.id = f.plan_id ORDER BY f.name`).map((f) => ({ ...f, aliases: json(f.aliases, []), statement_url: `${config.baseUrl}/referrer/${f.token}`, token: undefined }))));
financeRouter.post('/referrers', requirePerm('referrer.manage'), h((req) => {
  const b = req.body ?? {};
  if (!b.name?.trim()) throw bad('Name is required');
  if (b.pan && !isPan(b.pan)) throw bad('PAN format looks wrong (ABCDE1234F)');
  const row = { name: b.name.trim(), normalized: normalizeName(b.name), kind: b.kind ?? 'individual', email: b.email || null, mobile: b.mobile || null, pan: b.pan?.toUpperCase() || null, bank_account: b.bank_account || null, bank_ifsc: b.bank_ifsc?.toUpperCase() || null, bank_name: b.bank_name || null, plan_id: b.plan_id || null, active: b.active === false ? 0 : 1, aliases: JSON.stringify((b.aliases ?? []).map(normalizeName)) };
  if (b.id) {
    const before = one('SELECT * FROM referrer WHERE id = ?', b.id);
    if (!before) throw notFound('Referrer');
    update('referrer', b.id, row);
    const d = diff(before, row); audit('referrer.update', 'referrer', b.id, d.before, d.after);
    if (before.plan_id !== row.plan_id) reconcile(b.id);
    return { id: b.id };
  }
  if (row.pan && one('SELECT 1 FROM referrer WHERE pan = ?', row.pan)) throw conflict('Another referrer has this PAN');
  const id = uid();
  insert('referrer', { id, org_id: getOrg().id, ...row, token: token(18), created_at: now() });
  audit('referrer.create', 'referrer', id, undefined, row);
  return { id };
}));
financeRouter.get('/referrers/:id/statement', requirePerm('commission.read'), h((req) => statement(P(req).id)));
financeRouter.get('/referrers/:id/statement.pdf', requirePerm('commission.read'), h(async (req, res) => { const f = await commissionStatementPdf(P(req).id); res.type('pdf').send(f.content); }));
financeRouter.post('/referrers/:id/recalculate', requirePerm('commission.read'), h((req) => ({ lines: reconcile(P(req).id).length })));
financeRouter.post('/referrers/:id/approve', requirePerm('commission.approve'), h((req) => ({ approved: approveLines(P(req).id, req.body?.line_ids) })));
financeRouter.post('/referrers/:id/payout', requirePerm('commission.pay'), h((req) => payout(P(req).id, { reference: req.body?.reference, paidOn: req.body?.paid_on })));
financeRouter.get('/referrers/:id/form16a', requirePerm('commission.read'), h((req) => form16a(P(req).id, String(req.query.fy ?? currentFy()))));
financeRouter.get('/payouts', requirePerm('commission.read'), h(() => all('SELECT p.*, f.name FROM payout p JOIN referrer f ON f.id = p.referrer_id ORDER BY p.paid_on DESC')));
financeRouter.get('/payouts/:id/statement.pdf', requirePerm('commission.read'), h(async (req, res) => { const f = await commissionStatementPdf(P(req).id); res.type('pdf').send(f.content); }));
financeRouter.get('/commission/tds-register', requirePerm('commission.read', 'books.read'), h((req, res) => {
  const fy = String(req.query.fy ?? currentFy());
  const { from, to } = req.query.from ? { from: String(req.query.from), to: String(req.query.to) } : fyRange(fy);
  const rows = tdsRegister(from, to);
  if (req.query.format === 'csv') {
    logExport('tds_register', 'csv', rows.length, undefined, `${from}..${to}`);
    res.type('text/csv').setHeader('content-disposition', `attachment; filename="tds-register-${from}-${to}.csv"`);
    return res.send(toCsv([{ key: 'paid_on', label: 'Date of payment' }, { key: 'ref', label: 'Payout' }, { key: 'name', label: 'Deductee' }, { key: 'pan', label: 'PAN' }, { key: 'gross_paise', label: 'Amount paid/credited' }, { key: 'tds_rate', label: 'Rate %' }, { key: 'tds_paise', label: 'TDS' }, { key: 'reference', label: 'Bank ref' }], rows.map((r) => ({ ...r, tds_rate: r.tds_rate_bp / 100 })), exportMeta({ list: 'TDS register (Form 26Q working)', period: `${from} to ${to}` })));
  }
  return rows;
}));
financeRouter.get('/plans', requirePerm('commission.read', 'commission.config'), h(() => all('SELECT * FROM commission_plan ORDER BY created_at').map((p) => ({ ...p, tiers: json(p.tiers, []) }))));
financeRouter.post('/plans', requirePerm('commission.config'), h((req) => {
  const b = req.body ?? {};
  if (!['flat_pct', 'flat_amount', 'slab', 'progressive'].includes(b.method)) throw bad('Pick a method');
  const tiers = (b.tiers ?? []).map((t: any) => ({ from: Number(t.from), to: t.to === '' || t.to == null ? null : Number(t.to), rate_bp: t.rate_bp != null && t.rate_bp !== '' ? Number(t.rate_bp) : null, amount_paise: t.amount_paise != null && t.amount_paise !== '' ? Number(t.amount_paise) : null }));
  if (!tiers.length) throw bad('Add at least one tier');
  const row = { name: b.name ?? 'Plan', method: b.method, basis: b.basis ?? 'count', base: b.base ?? 'excl_gst', tiers: JSON.stringify(tiers), period: b.period ?? 'event', cap_paise: b.cap_paise ?? null, min_payout_paise: b.min_payout_paise ?? 0, referrer_kind: b.referrer_kind || null, is_override: b.is_override ? 1 : 0, signed_off_by: null };
  const id = b.id ?? uid();
  if (b.id) { const before = one('SELECT * FROM commission_plan WHERE id = ?', b.id); update('commission_plan', b.id, row); audit('plan.update', 'commission_plan', b.id, before, row); }
  else { insert('commission_plan', { id, org_id: getOrg().id, ...row, created_at: now() }); audit('plan.create', 'commission_plan', id, undefined, row); }
  for (const r of all('SELECT id FROM referrer')) reconcile(r.id);
  return { id };
}));
financeRouter.post('/plans/:id/signoff', requirePerm('commission.signoff'), h((req) => {
  update('commission_plan', P(req).id, { signed_off_by: req.auth!.user.id });
  audit('plan.signoff', 'commission_plan', P(req).id);
  for (const r of all('SELECT id FROM referrer WHERE plan_id = ?', P(req).id)) reconcile(r.id);
  return { ok: true };
}));

// ---------- expenses ----------
financeRouter.get('/expense-meta', h(() => ({ categories: EXPENSE_CATEGORIES, tdsSections: TDS_SECTIONS, vendors: all('SELECT id, name, gstin, pan FROM vendor ORDER BY name'), users: all('SELECT id, name FROM user WHERE active = 1 ORDER BY name') })));
financeRouter.get('/events/:id/expenses', requirePerm('expense.read', 'expense.create'), h((req) => {
  const mine = !can(req.auth!.roleNames, 'expense.read');
  return all(`SELECT e.*, v.name AS vendor, u.name AS submitted_by_name, a.name AS approved_by_name FROM expense e LEFT JOIN vendor v ON v.id = e.vendor_id
    LEFT JOIN user u ON u.id = e.submitted_by LEFT JOIN user a ON a.id = e.approved_by WHERE e.event_id = ? ${mine ? 'AND e.submitted_by = ?' : ''} ORDER BY e.created_at DESC`, P(req).id, ...(mine ? [req.auth!.user.id] : []))
    .map((e) => ({ ...e, splits: json(e.splits, []), bill_url: e.bill_path ? signedFileUrl(e.bill_path) : null }));
}));
financeRouter.get('/events/:id/budget-check', requirePerm('expense.create'), h((req) => budgetStatus(P(req).id, String(req.query.category), Number(req.query.amount ?? 0))));
financeRouter.post('/expenses', requirePerm('expense.create'), upload.single('bill'), h((req) => {
  const b = req.file ? JSON.parse(req.body.data ?? '{}') : req.body ?? {};
  let billPath: string | null = null;
  if (req.file) {
    const mime = sniff(req.file.buffer);
    if (!mime) throw bad('Bill must be a JPG, PNG or PDF');
    billPath = path.join('bills', `${uid()}.${mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg'}`);
    fs.mkdirSync(path.join(config.uploadDir, 'bills'), { recursive: true });
    fs.writeFileSync(path.join(config.uploadDir, billPath), req.file.buffer, { mode: 0o600 });
  }
  return createExpense({ ...b, bill_path: billPath });
}));
financeRouter.patch('/expenses/:id', requirePerm('expense.create'), h((req) => {
  const e = one('SELECT submitted_by FROM expense WHERE id = ?', P(req).id);
  if (!e) throw notFound('Expense');
  if (e.submitted_by !== req.auth!.user.id && !can(req.auth!.roleNames, 'expense.approve')) throw forbidden();
  editExpense(P(req).id, req.body ?? {}); return { ok: true };
}));
financeRouter.post('/expenses/:id/approve', requirePerm('expense.approve'), h((req) => { approveExpense(P(req).id); return { ok: true }; }));
financeRouter.post('/expenses/:id/reject', requirePerm('expense.approve'), h((req) => { rejectExpense(P(req).id, req.body?.reason); return { ok: true }; }));
financeRouter.post('/expenses/:id/pay', requirePerm('expense.pay'), h((req) => { payExpense(P(req).id, { amountPaise: req.body?.amount_paise, mode: req.body?.mode ?? 'bank', paidOn: req.body?.paid_on, reference: req.body?.reference }); return { ok: true }; }));
financeRouter.post('/expenses/:id/duplicate', requirePerm('expense.create'), h((req) => duplicateExpense(P(req).id, req.body?.bill_date ?? istDate())));
financeRouter.post('/expenses/:id/credit-note', requirePerm('expense.approve'), h((req) => { vendorCreditNote(P(req).id, req.body?.amount_paise ?? 0, req.body?.gst_paise ?? 0, req.body?.note ?? ''); return { ok: true }; }));
financeRouter.get('/vendors', requirePerm('expense.read', 'expense.create'), h(() => all('SELECT * FROM vendor ORDER BY name')));
financeRouter.post('/vendors', requirePerm('vendor.manage'), h((req) => ({ id: upsertVendor(req.body ?? {}) })));
financeRouter.get('/vendor-ageing', requirePerm('expense.read'), h(() => vendorAgeing()));
financeRouter.get('/vendors/:id/ledger', requirePerm('expense.read'), h((req) => all(`SELECT e.number, e.entry_date, e.narration, l.debit_paise, l.credit_paise, a.name AS account FROM journal_line l
  JOIN journal_entry e ON e.id = l.entry_id JOIN account a ON a.id = l.account_id WHERE l.party_type = 'vendor' AND l.party_id = ? AND a.sys IN ('creditors','advances','tds_payable') ORDER BY e.entry_date`, P(req).id)));
financeRouter.get('/events/:id/budgets', requirePerm('expense.read'), h((req) => budgetVsActual(P(req).id)));
financeRouter.put('/events/:id/budgets/:category', requirePerm('budget.set'), h((req) => { setBudget(P(req).id, P(req).category, Number(req.body?.amount_paise ?? 0), !!req.body?.hard_limit); return { ok: true }; }));
financeRouter.get('/advances', requirePerm('expense.read'), h(() => advanceBalances()));
financeRouter.post('/advances', requirePerm('expense.pay'), h((req) => recordAdvance({ partyType: req.body?.party_type, partyId: req.body?.party_id, amountPaise: req.body?.amount_paise, eventId: req.body?.event_id, note: req.body?.note ?? '', mode: req.body?.mode })));
financeRouter.get('/petty-cash', requirePerm('expense.read'), h(() => ({ ledger: ledger('cash', {}), counts: all('SELECT p.*, u.name FROM petty_cash_count p LEFT JOIN user u ON u.id = p.counted_by ORDER BY p.created_at DESC LIMIT 60') })));
financeRouter.post('/petty-cash/top-up', requirePerm('expense.pay'), h((req) => pettyCashTopUp(req.body?.amount_paise, req.body?.note ?? '')));
financeRouter.post('/petty-cash/count', requirePerm('expense.pay'), h((req) => pettyCashCount(req.body?.counted_paise, req.body?.note)));

// ---------- books ----------
const filt = (req: express.Request) => ({ from: (req.query.from as string) || undefined, to: (req.query.to as string) || undefined, eventId: (req.query.event as string) || undefined });
financeRouter.get('/accounts', requirePerm('books.read', 'books.post'), h(() => all('SELECT * FROM account ORDER BY code')));
financeRouter.post('/accounts', requirePerm('books.approve'), h((req) => {
  const b = req.body ?? {};
  if (!/^\d{4}$/.test(b.code ?? '') || !b.name || !['asset', 'liability', 'equity', 'income', 'expense'].includes(b.type)) throw bad('Code (4 digits), name and type are required');
  if (b.id) { const before = one('SELECT * FROM account WHERE id = ?', b.id); update('account', b.id, { name: b.name, schedule3: b.schedule3 ?? before?.schedule3 }); audit('account.update', 'account', b.id, before, b); return { id: b.id }; }
  const id = uid();
  insert('account', { id, code: b.code, name: b.name, type: b.type, schedule3: b.schedule3 ?? null });
  audit('account.create', 'account', id, undefined, b);
  return { id };
}));
financeRouter.get('/books/trial-balance', requirePerm('books.read'), h((req) => trialBalance(filt(req))));
financeRouter.get('/books/ledger/:account', requirePerm('books.read'), h((req) => ledger(P(req).account, filt(req))));
financeRouter.get('/books/journal', requirePerm('books.read'), h((req) => journalRegister({ ...filt(req), source: req.query.source as string, q: req.query.q as string, limit: Number(req.query.limit ?? 300) })));
financeRouter.get('/books/book/:kind', requirePerm('books.read'), h((req) => book(P(req).kind as any, filt(req))));
financeRouter.get('/books/pl', requirePerm('books.read'), h((req) => profitAndLoss(filt(req))));
financeRouter.get('/books/bs', requirePerm('books.read'), h((req) => balanceSheet(String(req.query.asOn ?? istDate()), (req.query.event as string) || null)));
financeRouter.get('/books/gst', requirePerm('books.read'), h((req) => gstSummary(filt(req))));
financeRouter.post('/books/journal', requirePerm('books.post'), h((req) => requestJournal(req.body ?? {})));
financeRouter.get('/books/journal-requests', requirePerm('books.read', 'books.post'), h(() => all('SELECT j.*, u.name AS requested_by_name FROM journal_request j LEFT JOIN user u ON u.id = j.requested_by ORDER BY j.created_at DESC LIMIT 300').map((j) => ({ ...j, lines: json(j.lines, []), approvals: json(j.approvals, []) }))));
financeRouter.post('/books/journal-requests/:id/approve', requirePerm('books.approve', 'books.post'), h((req) => approveJournal(P(req).id)));
financeRouter.post('/books/journal-requests/:id/reject', requirePerm('books.approve'), h((req) => { rejectJournal(P(req).id, req.body?.reason ?? ''); return { ok: true }; }));
financeRouter.post('/books/entries/:id/reverse', requirePerm('books.reverse'), h((req) => {
  if (!req.body?.reason) throw bad('Give a reason for the reversal');
  return reverse(P(req).id, req.body.reason, req.body.date);
}));
financeRouter.get('/books/locks', requirePerm('books.read'), h(() => all('SELECT p.*, u.name FROM period_lock p LEFT JOIN user u ON u.id = p.locked_by ORDER BY period DESC')));
financeRouter.post('/books/locks', requirePerm('books.lock'), h((req) => {
  const b = req.body ?? {};
  if (b.fy) { const { from } = fyRange(b.fy); const y = Number(from.slice(0, 4)); for (let i = 0; i < 12; i++) { const m = ((3 + i) % 12) + 1; lockPeriod(`${m >= 4 ? y : y + 1}-${String(m).padStart(2, '0')}`); } }
  else lockPeriod(b.period);
  return { ok: true };
}));
financeRouter.post('/books/locks/:period/reopen', requirePerm('books.lock'), h((req) => { unlockPeriod(P(req).period, String(req.body?.reason ?? '')); return { ok: true }; }));

/** Exports for the CA: journal / trial balance / P&L / balance sheet / GST / ledger, as CSV, Excel, PDF, Tally XML or JSON. */
financeRouter.get('/books/export', requirePerm('books.export'), h(async (req, res) => {
  const kind = String(req.query.kind ?? 'journal'); const fmt = String(req.query.format ?? 'csv');
  const f = filt(req);
  const ev = f.eventId ? getEvent(f.eventId).name : 'All events';
  const period = `${f.from ?? 'start'} to ${f.to ?? istDate()}`;
  const meta = exportMeta({ list: kind, event: ev, period, filters: f });
  const send = async (title: string, cols: { key: string; label: string }[], rows: any[]) => {
    logExport(`books:${kind}`, fmt, rows.length, f, period);
    const base = `${kind}-${istDate()}`;
    if (fmt === 'xlsx') { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').setHeader('content-disposition', `attachment; filename="${base}.xlsx"`); return res.send(await toXlsx(title, cols, rows, meta)); }
    if (fmt === 'pdf') { res.type('pdf').send(await tablePdf(title, cols, rows, { event: ev, filters: period })); return; }
    if (fmt === 'json') { res.setHeader('content-disposition', `attachment; filename="${base}.json"`); return res.json({ meta, rows }); }
    res.type('text/csv').setHeader('content-disposition', `attachment; filename="${base}.csv"`); res.send(toCsv(cols, rows, meta));
  };
  if (kind === 'journal') {
    const entries = journalRegister({ ...f, limit: 5000 }).reverse();
    if (fmt === 'tally') { logExport('books:journal', 'tally', entries.length, f, period); res.type('application/xml').setHeader('content-disposition', `attachment; filename="tally-vouchers-${istDate()}.xml"`); return res.send(tallyXml(entries)); }
    const rows = entries.flatMap((e) => e.lines.map((l: any) => ({ number: e.number, entry_date: e.entry_date, narration: e.narration, source: e.source_type, code: l.code, account: l.name, debit_paise: l.debit_paise, credit_paise: l.credit_paise, reversed: e.reversed_by_id ? 'reversed' : e.reverses_id ? 'reversal' : '' })));
    return send('Journal register', [{ key: 'number', label: 'Voucher' }, { key: 'entry_date', label: 'Date' }, { key: 'narration', label: 'Narration' }, { key: 'source', label: 'Source' }, { key: 'code', label: 'Code' }, { key: 'account', label: 'Account' }, { key: 'debit_paise', label: 'Debit' }, { key: 'credit_paise', label: 'Credit' }, { key: 'reversed', label: 'Reversal' }], rows);
  }
  if (kind === 'tb') {
    const tb = trialBalance(f);
    return send('Trial balance', [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'type', label: 'Type' }, { key: 'balance_debit', label: 'Debit' }, { key: 'balance_credit', label: 'Credit' }].map((c) => ({ ...c, key: c.key === 'balance_debit' ? 'debit_paise' : c.key === 'balance_credit' ? 'credit_paise' : c.key })),
      [...tb.rows.filter((r) => r.balance_debit || r.balance_credit).map((r) => ({ ...r, debit_paise: r.balance_debit, credit_paise: r.balance_credit })), { code: '', name: 'Total', type: '', debit_paise: tb.totals.debit, credit_paise: tb.totals.credit }]);
  }
  if (kind === 'pl') {
    const pl = profitAndLoss(f);
    if (fmt === 'pdf') { res.type('pdf').send(await statementPdf('Statement of profit and loss (Schedule III)', [{ heading: 'Income', rows: pl.schedule3.income.map((x) => [x.line, x.amount]), total: ['Total income', pl.totalIncome] }, { heading: 'Expenses', rows: pl.expenses.filter((x) => x.amount).map((x) => [x.name, x.amount]), total: ['Total expenses', pl.totalExpenses] }, { heading: 'Result', rows: [['Surplus / (deficit)', pl.surplus]] }], { event: ev, period })); logExport('books:pl', 'pdf', 1, f, period); return; }
    return send('Profit and loss', [{ key: 'section', label: 'Section' }, { key: 'name', label: 'Account' }, { key: 'amount_paise', label: 'Amount' }], [...pl.income.map((x) => ({ section: 'Income', name: x.name, amount_paise: x.amount })), ...pl.expenses.map((x) => ({ section: 'Expenses', name: x.name, amount_paise: x.amount })), { section: 'Result', name: 'Surplus / (deficit)', amount_paise: pl.surplus }]);
  }
  if (kind === 'bs') {
    const bs = balanceSheet(f.to ?? istDate(), f.eventId);
    if (fmt === 'pdf') { res.type('pdf').send(await statementPdf(`Balance sheet as at ${bs.asOn} (Schedule III)`, [{ heading: 'Equity and liabilities', rows: [...bs.equity, ...bs.liabilities].map((x) => [x.name, x.amount]), total: ['Total', bs.totalEquityAndLiabilities] }, { heading: 'Assets', rows: bs.assets.map((x) => [x.name, x.amount]), total: ['Total', bs.totalAssets] }], { event: ev, period: `as at ${bs.asOn}` })); logExport('books:bs', 'pdf', 1, f, period); return; }
    return send('Balance sheet', [{ key: 'section', label: 'Section' }, { key: 'schedule3', label: 'Schedule III line' }, { key: 'name', label: 'Account' }, { key: 'amount_paise', label: 'Amount' }], [...bs.equity.map((x) => ({ section: 'Equity', ...x, amount_paise: x.amount })), ...bs.liabilities.map((x) => ({ section: 'Liabilities', ...x, amount_paise: x.amount })), ...bs.assets.map((x) => ({ section: 'Assets', ...x, amount_paise: x.amount }))]);
  }
  if (kind === 'gst') {
    const g = gstSummary(f);
    return send('GST output by invoice', [{ key: 'number', label: 'Invoice' }, { key: 'kind', label: 'Type' }, { key: 'issued_at', label: 'Date' }, { key: 'reg_ref', label: 'Registration' }, { key: 'full_name', label: 'Customer' }, { key: 'taxable_paise', label: 'Taxable' }, { key: 'cgst_paise', label: 'CGST' }, { key: 'sgst_paise', label: 'SGST' }, { key: 'igst_paise', label: 'IGST' }, { key: 'total_paise', label: 'Total' }], g.invoices);
  }
  if (kind === 'ledger') {
    const l = ledger(String(req.query.account), f);
    return send(`Ledger: ${l.account.name}`, [{ key: 'entry_date', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'narration', label: 'Narration' }, { key: 'debit_paise', label: 'Debit' }, { key: 'credit_paise', label: 'Credit' }, { key: 'balance', label: 'Balance' }], l.rows.map((r) => ({ ...r, balance: (r.balance / 100).toFixed(2) })));
  }
  if (kind === 'backup') {
    if (!can(req.auth!.roleNames, 'audit.read') && !can(req.auth!.roleNames, 'books.export')) throw forbidden();
    logExport('backup', 'json', 0);
    res.setHeader('content-disposition', `attachment; filename="books-and-audit-${istDate()}.json"`);
    return res.json({ meta, accounts: all('SELECT * FROM account'), journal_entries: all('SELECT * FROM journal_entry'), journal_lines: all('SELECT * FROM journal_line'), invoices: all('SELECT * FROM invoice'), audit_log: all('SELECT * FROM audit_log'), payouts: all('SELECT * FROM payout'), expenses: all('SELECT * FROM expense'), settlements: all('SELECT * FROM settlement') });
  }
  throw bad('Unknown export');
}));
financeRouter.get('/invoices/:id/pdf', requirePerm('books.read', 'payments.read'), h(async (req, res) => { const f = await invoicePdf(P(req).id); res.type('pdf').setHeader('content-disposition', `inline; filename="${f.filename}"`); res.send(f.content); }));
