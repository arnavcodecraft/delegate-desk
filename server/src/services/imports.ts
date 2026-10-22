import ExcelJS from 'exceljs';
import { all, one, run, insert, update, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { EXPENSE_CATEGORIES } from '../settings.ts';
import { bad, conflict, ctx, isEmail, isIndianMobile, isPan, normalizeName, now, parseMoney, similarity, token, uid, notFound } from '../util.ts';
import { register } from './registrations.ts';
import { addPortfolio } from './allocation.ts';
import { addBankLines } from './evidence.ts';
import { draftSettlement } from './payments.ts';
import { createExpense, upsertVendor } from './expenses.ts';
import { requestJournal } from './journals.ts';
import { toCsv } from './documents.ts';
import { cancelRegistration } from './payments.ts';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== '') && !r[0]?.startsWith('# '));
}

export async function parseFile(buf: Buffer, filename: string) {
  if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    ws.eachRow((r) => rows.push((r.values as any[]).slice(1).map((v) => (v == null ? '' : typeof v === 'object' ? (v.text ?? v.result ?? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v))) : String(v)))));
    return rows;
  }
  return parseCsv(buf.toString('utf8'));
}

interface Field { key: string; label: string; required?: boolean; aliases?: string[] }
interface Kind { title: string; fields: Field[]; validate: (r: Record<string, string>, ctx: any) => string[]; commit?: (rows: Record<string, string>[], ctx: any) => { created: string[]; errors: { row: number; error: string }[] } }

const F = (key: string, label: string, required = false, aliases: string[] = []): Field => ({ key, label, required, aliases });
const money = (v: string) => { try { return parseMoney(v); } catch { return NaN; } };
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
/** Accept 2026-10-21, 21/10/2026, 21-10-2026. */
export const toIsoDate = (v: string) => {
  const s = (v ?? '').trim();
  if (isDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s.slice(0, 10);
};

function eachRow(rows: Record<string, string>[], fn: (r: Record<string, string>, i: number) => string | void) {
  const created: string[] = []; const errors: { row: number; error: string }[] = [];
  rows.forEach((r, i) => {
    try { const id = fn(r, i); if (id) created.push(id); }
    catch (e: any) { errors.push({ row: i + 2, error: e.details?.fields ? Object.values(e.details.fields).join('; ') : e.message }); }
  });
  return { created, errors };
}

export const KINDS: Record<string, Kind> = {
  registrations: {
    title: 'Delegate registrations (Google Forms / Sheets / Excel)',
    fields: [F('full_name', 'Full name', true, ['name', 'delegate name']), F('email', 'Email', true, ['email address']), F('mobile', 'Mobile', true, ['phone', 'whatsapp', 'contact']),
      F('institution', 'Institution', true, ['school', 'college']), F('class_year', 'Class or year', true, ['class', 'year', 'grade']), F('city', 'City', true),
      F('dob', 'Date of birth', true, ['birth date']), F('preferences', 'Committee preferences (short codes; separated by ;)', false, ['committee', 'committees']),
      F('referral_name', 'Referral name', false, ['referred by', 'referral']), F('experience', 'Experience (first/some/experienced)'), F('guardian_name', 'Parent/guardian name'), F('guardian_email', 'Parent/guardian email')],
    validate: (r, c) => {
      const e: string[] = [];
      if (!r.full_name?.trim()) e.push('Name missing');
      if (!isEmail(r.email ?? '')) e.push('Invalid email');
      if (!isIndianMobile(r.mobile ?? '')) e.push('Invalid mobile');
      if (!r.institution?.trim()) e.push('Institution missing');
      if (!r.dob || !isDate(toIsoDate(r.dob))) e.push('Date of birth missing or invalid');
      const unknown = (r.preferences ?? '').split(/[;|]/).map((x) => x.trim()).filter(Boolean).filter((p) => !c.committees.has(p.toUpperCase()));
      if (unknown.length) e.push(`Unknown committee: ${unknown.join(', ')}`);
      if (one("SELECT 1 FROM registration WHERE event_id = ? AND cancelled_at IS NULL AND (lower(email) = lower(?) OR mobile = ?)", c.eventId, r.email ?? '', (r.mobile ?? '').replace(/\D/g, '').slice(-10))) e.push('Already registered (duplicate email or mobile)');
      return e;
    },
    commit: (rows, c) => eachRow(rows, (r) => register(c.eventId, {
      full_name: r.full_name, email: r.email, mobile: r.mobile, institution: r.institution, class_year: r.class_year || '—', city: r.city || '—', dob: toIsoDate(r.dob),
      preferences: (r.preferences ?? '').split(/[;|]/).map((x) => x.trim().toUpperCase()).filter(Boolean).map((s) => c.committees.get(s)).filter(Boolean).slice(0, 3),
      referral_name: r.referral_name || null, experience: r.experience?.toLowerCase(), guardian_name: r.guardian_name, guardian_email: r.guardian_email, consent: true,
    }, { source: 'import', batchId: c.batchId }).registration.id),
  },
  portfolios: {
    title: 'Committee and portfolio inventory',
    fields: [F('committee_short', 'Committee short code', true, ['committee code', 'short']), F('committee_name', 'Committee name', false, ['committee']), F('committee_kind', 'single / double'),
      F('portfolio', 'Portfolio', true, ['country', 'character', 'position']), F('tier', 'Tier (high/standard/low)'), F('premium', 'Premium (₹)'), F('seats', 'Seats')],
    validate: (r) => {
      const e: string[] = [];
      if (!r.committee_short?.trim()) e.push('Committee code missing');
      if (!r.portfolio?.trim()) e.push('Portfolio missing');
      if (r.tier && !['high', 'standard', 'low'].includes(r.tier.toLowerCase())) e.push('Tier must be high, standard or low');
      if (r.premium && Number.isNaN(money(r.premium))) e.push('Premium is not a number');
      return e;
    },
    commit: (rows, c) => eachRow(rows, (r) => {
      const short = r.committee_short.trim().toUpperCase();
      let com = one('SELECT * FROM committee WHERE event_id = ? AND short = ?', c.eventId, short);
      if (!com) { const id = uid(); insert('committee', { id, event_id: c.eventId, short, name: r.committee_name?.trim() || short, kind: r.committee_kind?.toLowerCase() === 'double' ? 'double' : 'single', sort: 99 }); com = { id }; }
      const existed = one('SELECT 1 FROM portfolio WHERE committee_id = ? AND name = ?', com.id, r.portfolio.trim());
      const id = addPortfolio(com.id, { name: r.portfolio, tier: r.tier?.toLowerCase() || 'standard', premiumPaise: r.premium ? money(r.premium) : 0, seats: r.seats ? Number(r.seats) : undefined });
      return existed ? undefined : id; // only portfolios this file created can be rolled back
    }),
  },
  bank: {
    title: 'Bank statement (auto-matches UTRs for CFO review)',
    fields: [F('date', 'Date', true, ['txn date', 'value date', 'transaction date']), F('description', 'Description', true, ['narration', 'particulars', 'remarks']), F('utr', 'UTR / reference', false, ['ref no', 'reference', 'chq/ref no']),
      F('credit', 'Credit amount', false, ['deposit', 'cr', 'credit']), F('debit', 'Debit amount', false, ['withdrawal', 'dr', 'debit']), F('amount', 'Amount (if one column)')],
    validate: (r) => {
      const e: string[] = [];
      if (!isDate(toIsoDate(r.date ?? ''))) e.push('Date not recognised (use YYYY-MM-DD or DD/MM/YYYY)');
      if (!r.credit && !r.debit && !r.amount) e.push('No amount');
      for (const k of ['credit', 'debit', 'amount']) if (r[k] && Number.isNaN(money(r[k]))) e.push(`${k} is not a number`);
      return e;
    },
    commit: (rows, c) => {
      const lines = rows.map((r) => {
        const cr = r.credit ? money(r.credit) : 0, dr = r.debit ? money(r.debit) : 0, amt = r.amount ? money(r.amount) : 0;
        return { date: toIsoDate(r.date), description: r.description ?? '', utr: r.utr || null, amountPaise: Math.abs(cr || dr || amt), direction: (cr || amt > 0 ? 'cr' : 'dr') as 'cr' | 'dr' };
      });
      const matched = addBankLines(lines, c.batchId);
      c.note = `${matched} proof(s) bank-matched`;
      return { created: all('SELECT id FROM bank_line WHERE import_batch_id = ?', c.batchId).map((x) => x.id), errors: [] };
    },
  },
  settlement: {
    title: 'Razorpay / Cashfree settlement report (creates draft settlements)',
    fields: [F('gateway', 'Gateway (razorpay/cashfree)', true), F('settlement_id', 'Settlement ID', true, ['settlement id', 'settlement_utr', 'utr']), F('payment_id', 'Payment ID', true, ['entity_id', 'cf_payment_id', 'payment id']),
      F('amount', 'Gross amount', true, ['amount', 'gross']), F('fee', 'Fee (excluding GST)', true, ['fee', 'fees']), F('tax', 'GST on fee', true, ['tax', 'gst']), F('settled_on', 'Settled on', true, ['settled_at', 'settlement date'])],
    validate: (r) => {
      const e: string[] = [];
      if (!['razorpay', 'cashfree', 'mock'].includes((r.gateway ?? '').toLowerCase())) e.push('Gateway must be razorpay or cashfree');
      for (const k of ['amount', 'fee', 'tax']) if (Number.isNaN(money(r[k] ?? ''))) e.push(`${k} is not a number`);
      if (!isDate(toIsoDate(r.settled_on ?? ''))) e.push('Settled on date not recognised');
      return e;
    },
    commit: (rows, c) => {
      const groups = new Map<string, Record<string, string>[]>();
      for (const r of rows) { const k = `${r.gateway.toLowerCase()}|${r.settlement_id}`; groups.set(k, [...(groups.get(k) ?? []), r]); }
      const created: string[] = []; const errors: any[] = [];
      for (const [k, rs] of groups) {
        const [gateway, ref] = k.split('|');
        const gross = rs.reduce((s, r) => s + money(r.amount), 0), fee = rs.reduce((s, r) => s + money(r.fee), 0), tax = rs.reduce((s, r) => s + money(r.tax), 0);
        try { created.push(draftSettlement({ gateway, settlementRef: ref, settledOn: toIsoDate(rs[0].settled_on), paymentIds: rs.map((r) => r.payment_id), grossPaise: gross, feePaise: fee, taxPaise: tax, netPaise: gross - fee - tax, batchId: c.batchId }).id); }
        catch (e: any) { errors.push({ row: 0, error: `${ref}: ${e.message}` }); }
      }
      return { created, errors };
    },
  },
  vendors: {
    title: 'Vendor master',
    fields: [F('name', 'Vendor name', true), F('pan', 'PAN'), F('gstin', 'GSTIN'), F('bank_account', 'Bank account'), F('bank_ifsc', 'IFSC'), F('email', 'Email'), F('phone', 'Phone')],
    validate: (r) => [!r.name?.trim() && 'Name missing', r.pan && !isPan(r.pan) && 'PAN format wrong', one('SELECT 1 FROM vendor WHERE lower(name) = lower(?)', r.name ?? '') && 'Vendor already exists'].filter(Boolean) as string[],
    commit: (rows) => eachRow(rows, (r) => upsertVendor(r)),
  },
  expenses: {
    title: 'Expense list (imported as submitted; needs approval before posting)',
    fields: [F('category', 'Category', true), F('description', 'Description', true), F('amount', 'Amount excl. GST', true), F('gst_rate', 'GST rate %'), F('bill_date', 'Bill date', true, ['date']),
      F('vendor', 'Vendor name'), F('invoice_no', 'Invoice no.'), F('cost_behaviour', 'fixed / variable / semi'), F('itc', 'ITC eligible (yes/no)')],
    validate: (r) => {
      const e: string[] = [];
      if (!EXPENSE_CATEGORIES.includes((r.category ?? '').toLowerCase() as any)) e.push(`Category must be one of ${EXPENSE_CATEGORIES.join(', ')}`);
      if (!(money(r.amount ?? '') > 0)) e.push('Amount missing');
      if (!isDate(toIsoDate(r.bill_date ?? ''))) e.push('Bill date not recognised');
      return e;
    },
    commit: (rows, c) => eachRow(rows, (r) => {
      const vendor = r.vendor ? one('SELECT id FROM vendor WHERE lower(name) = lower(?)', r.vendor.trim())?.id ?? upsertVendor({ name: r.vendor }) : null;
      const id = createExpense({ event_id: c.eventId, category: r.category.toLowerCase(), description: r.description, amount_paise: money(r.amount), gst_rate_bp: r.gst_rate ? Math.round(Number(r.gst_rate) * 100) : 0, bill_date: toIsoDate(r.bill_date), vendor_id: vendor, invoice_no: r.invoice_no || null, cost_behaviour: r.cost_behaviour?.toLowerCase() || 'fixed', itc_eligible: /^y/i.test(r.itc ?? ''), status: 'submitted' }).id;
      run('UPDATE expense SET import_batch_id = ? WHERE id = ?', c.batchId, id);
      return id;
    }),
  },
  referrers: {
    title: 'Referrer master with PAN',
    fields: [F('name', 'Name', true), F('kind', 'Type (individual/ambassador/school/partner)'), F('email', 'Email'), F('mobile', 'Mobile'), F('pan', 'PAN'), F('bank_account', 'Bank account'), F('bank_ifsc', 'IFSC')],
    validate: (r, c) => {
      const e: string[] = [];
      if (!r.name?.trim()) e.push('Name missing');
      if (r.pan && !isPan(r.pan)) e.push('PAN format wrong (ABCDE1234F)');
      if (r.pan && one('SELECT 1 FROM referrer WHERE upper(pan) = upper(?)', r.pan)) e.push('PAN already on another referrer');
      if (one('SELECT 1 FROM referrer WHERE org_id = ? AND normalized = ?', c.orgId, normalizeName(r.name ?? ''))) e.push('Referrer with this name exists');
      return e;
    },
    commit: (rows, c) => eachRow(rows, (r) => {
      const id = uid();
      insert('referrer', { id, org_id: c.orgId, name: r.name.trim(), normalized: normalizeName(r.name), kind: ['individual', 'ambassador', 'school', 'partner'].includes(r.kind?.toLowerCase()) ? r.kind.toLowerCase() : 'individual', email: r.email || null, mobile: r.mobile || null, pan: r.pan?.toUpperCase() || null, bank_account: r.bank_account || null, bank_ifsc: r.bank_ifsc?.toUpperCase() || null, token: token(18), created_at: now() });
      return id;
    }),
  },
  opening: {
    title: 'Opening balances (needs CFO and Accountant sign-off)',
    fields: [F('account_code', 'Account code', true, ['code', 'account']), F('debit', 'Debit'), F('credit', 'Credit')],
    validate: (r) => [!one('SELECT 1 FROM account WHERE code = ?', r.account_code ?? '') && 'Unknown account code', !r.debit && !r.credit && 'Debit or credit needed'].filter(Boolean) as string[],
    commit: (rows, c) => {
      const lines = rows.map((r) => ({ account_id: one('SELECT id FROM account WHERE code = ?', r.account_code)!.id, debit_paise: r.debit ? money(r.debit) : 0, credit_paise: r.credit ? money(r.credit) : 0 }));
      const res = requestJournal({ kind: 'opening', date: c.date, narration: 'Opening balances (imported)', lines });
      c.note = 'Opening journal created; awaiting CFO and Accountant sign-off';
      return { created: [res.id], errors: [] };
    },
  },
};

/** Guess which file column feeds which field. */
export function suggestMapping(kind: string, headers: string[]) {
  const k = KINDS[kind];
  if (!k) throw bad('Unknown import type');
  const map: Record<string, string> = {};
  for (const f of k.fields) {
    const cands = [f.key, f.label, ...(f.aliases ?? [])];
    let best = ''; let score = 0;
    for (const h of headers) for (const c of cands) { const s = similarity(h, c.replace(/_/g, ' ')); if (s > score) { score = s; best = h; } }
    if (score >= 0.7) map[f.key] = best;
  }
  return map;
}

function mapRows(rows: string[][], mapping: Record<string, string>) {
  const [headers, ...body] = rows;
  const idx = Object.fromEntries(Object.entries(mapping).filter(([, h]) => h).map(([k, h]) => [k, headers.indexOf(h)]));
  return { headers, records: body.map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, (i >= 0 ? r[i] ?? '' : '').trim()]))), raw: body };
}

function context(kind: string, eventId: string, extra: Record<string, any> = {}) {
  const ev = one('SELECT * FROM event WHERE id = ?', eventId);
  if (!ev) throw notFound('Event');
  const committees = new Map(all('SELECT id, short FROM committee WHERE event_id = ?', eventId).map((c) => [c.short.toUpperCase(), c.id]));
  return { kind, eventId, orgId: ev.org_id, committees, ...extra };
}

export function preview(kind: string, eventId: string, rows: string[][], mapping: Record<string, string>) {
  const k = KINDS[kind];
  if (!k) throw bad('Unknown import type');
  const missing = k.fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  if (missing.length) throw bad(`Map these required columns: ${missing.join(', ')}`);
  const { records } = mapRows(rows, mapping);
  const c = context(kind, eventId);
  const out = records.map((r, i) => ({ row: i + 2, data: r, errors: k.validate(r, c) }));
  return { total: out.length, ok: out.filter((r) => !r.errors.length).length, failed: out.filter((r) => r.errors.length).length, rows: out.slice(0, 500) };
}

/** Commit valid rows; failed rows never block the rest. */
export function commit(kind: string, eventId: string, filename: string, rows: string[][], mapping: Record<string, string>, extra: Record<string, any> = {}) {
  const k = KINDS[kind];
  if (!k?.commit) throw bad('Unknown import type');
  const { records, raw, headers } = mapRows(rows, mapping);
  const batchId = uid();
  const c: any = context(kind, eventId, { batchId, ...extra });
  const validRows: Record<string, string>[] = []; const validRaw: string[][] = []; const failed: { row: number; error: string; raw: string[] }[] = [];
  records.forEach((r, i) => { const e = k.validate(r, c); if (e.length) failed.push({ row: i + 2, error: e.join('; '), raw: raw[i] }); else { validRows.push(r); validRaw.push(raw[i]); } });
  insert('import_batch', { id: batchId, kind, event_id: eventId, filename, mapping: JSON.stringify({ mapping, created: [] }), total: records.length, ok: 0, failed: 0, errors: '[]', status: 'committed', created_by: ctx().userId ?? null, created_at: now() });
  const res = k.commit(validRows, c);
  const commitErrors = res.errors.map((e) => ({ ...e, raw: validRaw[e.row - 2] ?? [] }));
  const allErrors = [...failed, ...commitErrors].map((e) => ({ row: e.row, error: e.error, raw: e.raw }));
  update('import_batch', batchId, { mapping: JSON.stringify({ mapping, created: res.created, headers, note: c.note ?? null }), ok: res.created.length, failed: allErrors.length, errors: JSON.stringify(allErrors) });
  audit('import.commit', 'import_batch', batchId, undefined, { kind, filename, ok: res.created.length, failed: allErrors.length });
  return { batchId, ok: res.created.length, failed: allErrors.length, note: c.note ?? null, errors: allErrors.slice(0, 200) };
}

/** Download failed rows with an error column, fix them, upload again. */
export function errorFile(batchId: string) {
  const b = one('SELECT * FROM import_batch WHERE id = ?', batchId);
  if (!b) throw notFound('Import');
  const headers: string[] = JSON.parse(b.mapping).headers ?? [];
  const errs = JSON.parse(b.errors) as { row: number; error: string; raw: string[] }[];
  const cols = [...headers.map((h, i) => ({ key: String(i), label: h })), { key: 'error', label: 'Error' }];
  return toCsv(cols, errs.map((e) => ({ ...Object.fromEntries((e.raw ?? []).map((v, i) => [String(i), v])), error: e.error })));
}

/** Roll back a whole batch, only if nothing downstream depends on it. */
export function rollback(batchId: string) {
  return tx(() => {
    const b = one('SELECT * FROM import_batch WHERE id = ?', batchId);
    if (!b) throw notFound('Import');
    if (b.status === 'rolled_back') throw conflict('Already rolled back');
    const created: string[] = JSON.parse(b.mapping).created ?? [];
    const inList = created.map(() => '?').join(',') || "''";
    const block = (msg: string) => { throw conflict(`Cannot roll back: ${msg}`); };
    switch (b.kind) {
      case 'registrations':
        if (one(`SELECT 1 FROM registration WHERE id IN (${inList}) AND paid_paise > 0`, ...created)) block('some imported delegates have already paid');
        for (const id of created) cancelRegistration(id, 'Import rolled back');
        break;
      case 'bank':
        if (one(`SELECT 1 FROM bank_line l JOIN payment_evidence e ON e.id = l.matched_evidence_id WHERE l.import_batch_id = ? AND e.status = 'approved'`, batchId)) block('a matched proof has been approved');
        run('UPDATE payment_evidence SET bank_line_id = NULL WHERE bank_line_id IN (SELECT id FROM bank_line WHERE import_batch_id = ?)', batchId);
        run('DELETE FROM bank_line WHERE import_batch_id = ?', batchId);
        break;
      case 'settlement':
        if (one(`SELECT 1 FROM settlement WHERE import_batch_id = ? AND status = 'posted'`, batchId)) block('a settlement from this file is already posted; reverse its journal instead');
        run('DELETE FROM settlement WHERE import_batch_id = ?', batchId);
        break;
      case 'vendors':
        if (one(`SELECT 1 FROM expense WHERE vendor_id IN (${inList})`, ...created)) block('expenses already use these vendors');
        run(`DELETE FROM vendor WHERE id IN (${inList})`, ...created);
        break;
      case 'expenses':
        if (one(`SELECT 1 FROM expense WHERE import_batch_id = ? AND status = 'approved'`, batchId)) block('some expenses are approved and posted');
        run(`UPDATE expense SET status = 'rejected', reason = 'Import rolled back' WHERE import_batch_id = ?`, batchId);
        break;
      case 'referrers':
        if (one(`SELECT 1 FROM registration WHERE referrer_id IN (${inList})`, ...created)) block('registrations are already linked to these referrers');
        run(`DELETE FROM referrer WHERE id IN (${inList})`, ...created);
        break;
      case 'opening':
        if (one(`SELECT 1 FROM journal_request WHERE id IN (${inList}) AND status = 'posted'`, ...created)) block('opening balances are signed off and locked');
        run(`UPDATE journal_request SET status = 'rejected', reason = 'Import rolled back' WHERE id IN (${inList})`, ...created);
        break;
      case 'portfolios':
        if (one(`SELECT 1 FROM seat WHERE portfolio_id IN (${inList}) AND state <> 'open'`, ...created)) block('seats from this file are already allotted');
        run(`DELETE FROM seat WHERE portfolio_id IN (${inList})`, ...created);
        run(`DELETE FROM portfolio WHERE id IN (${inList})`, ...created);
        break;
    }
    update('import_batch', batchId, { status: 'rolled_back' });
    audit('import.rollback', 'import_batch', batchId, undefined, { kind: b.kind, items: created.length });
  });
}
