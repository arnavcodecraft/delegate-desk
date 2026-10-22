import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, one, run, insert, tx, update } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { eventSettings } from '../settings.ts';
import { addHours, bad, conflict, ctx, forbidden, inr, istDate, now, sha256, uid, notFound } from '../util.ts';
import { enqueue, notifyStaff } from './notify.ts';
import { payableNow } from './fees.ts';
import { receive, regVars } from './payments.ts';

export const MAX_UPLOAD = 5 * 1024 * 1024;

/** Detect the real file type from its first bytes rather than trusting the name or browser header. */
export function sniff(buf: Buffer): 'image/jpeg' | 'image/png' | 'application/pdf' | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

/** Basic content scan. Rejects active PDF content; plug ClamAV here for full malware scanning. */
export function scan(buf: Buffer, mime: string) {
  if (mime === 'application/pdf') {
    const s = buf.toString('latin1');
    if (/\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction\s*<<[^>]*\/JS)/.test(s)) throw bad('This PDF contains active content and cannot be accepted. Please upload a screenshot instead.');
  }
}

/** Hints of editing software in metadata. Flagged to the CFO, never auto-decided. */
export function tamperHints(buf: Buffer) {
  const s = buf.toString('latin1');
  const flags: string[] = [];
  for (const tool of ['Photoshop', 'GIMP', 'Snapseed', 'PicsArt', 'Canva', 'Lightroom', 'Pixlr', 'Affinity', 'PhotoDirector', 'Inkscape']) {
    if (s.includes(tool)) flags.push(`Edited with ${tool} (metadata)`);
  }
  if (/<x:xmpmeta[\s\S]*?History/.test(s)) flags.push('Image has an edit history (XMP)');
  return flags;
}

/** Best-effort read of UTR and amount from text-based PDFs (bank e-receipts). Images need OCR, which is not bundled. */
export function extract(buf: Buffer, mime: string) {
  if (mime !== 'application/pdf') return null;
  const s = buf.toString('latin1').replace(/\\\)/g, ')');
  const text = [...s.matchAll(/\(([^()]{1,120})\)\s*Tj/g)].map((m) => m[1]).join(' ');
  const utr = text.match(/\b(\d{12}|[A-Z]{4}\d{8,18})\b/)?.[1] ?? null;
  const amt = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1] ?? null;
  return utr || amt ? { utr, amount: amt ? Math.round(Number(amt.replace(/,/g, '')) * 100) : null } : null;
}

export const normUtr = (u: string) => String(u ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Unique reference the delegate writes in the transfer remark, e.g. BGYS27-R-000124. */
export function payInstructions(reg: Record<string, any>) {
  const org = one('SELECT * FROM organization LIMIT 1')!;
  const amount = payableNow(reg);
  const upi = org.upi_id ? `upi://pay?pa=${encodeURIComponent(org.upi_id)}&pn=${encodeURIComponent(org.legal_name)}&am=${(amount / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(reg.ref)}` : null;
  return { upiId: org.upi_id, payee: org.legal_name, bankName: org.bank_name, account: org.bank_account, ifsc: org.bank_ifsc, amountPaise: amount, reference: reg.ref, upiUri: upi };
}

export function submitEvidence(reg: Record<string, any>, file: { buffer: Buffer; originalname?: string }, input: { utr: string; amountPaise: number; paidOn: string }, submittedByUser?: string | null) {
  const s = eventSettings(reg.event_id);
  if (!s.screenshotEnabled) throw conflict('Screenshot payments are not accepted for this event');
  if (reg.cancelled_at) throw conflict('This registration is cancelled');
  if (payableNow(reg) <= 0) throw conflict('Nothing is due on this registration');
  if (reg.allot_status === 'waitlisted') throw conflict('You are on the waitlist; please wait for a seat offer before paying');
  if (one("SELECT 1 FROM payment_evidence WHERE registration_id = ? AND status = 'submitted'", reg.id)) throw conflict('A proof is already under review');
  if (file.buffer.length > MAX_UPLOAD) throw bad('File is larger than 5 MB');
  const mime = sniff(file.buffer);
  if (!mime) throw bad('Upload a JPG, PNG or PDF file');
  scan(file.buffer, mime);
  const utr = normUtr(input.utr);
  if (utr.length < 6 || utr.length > 30) throw bad('Enter the UTR / transaction ID exactly as shown in your banking app');
  if (!input.amountPaise || input.amountPaise <= 0) throw bad('Enter the amount you paid');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > istDate()) throw bad('Enter the date of payment');
  const hash = sha256(file.buffer);
  // Duplicate checks: UTR, image hash, and amount+date (soft flag).
  const utrUsed = one("SELECT e.id, r.ref FROM payment_evidence e JOIN registration r ON r.id = e.registration_id WHERE e.utr = ? AND e.status IN ('submitted','approved')", utr);
  if (utrUsed) {
    notifyStaff(['cfo'], 'staff_alert', { title: 'Reused UTR blocked', message: `${reg.ref} tried UTR ${utr}, already used by ${utrUsed.ref}.` }, reg.event_id);
    throw conflict('This UTR has already been used for another registration. If you believe this is a mistake, contact the finance team.');
  }
  if (one("SELECT 1 FROM payment_evidence WHERE file_hash = ? AND status IN ('submitted','approved')", hash)) throw conflict('This exact file has already been uploaded for another registration');
  const flags = tamperHints(file.buffer);
  const sameAmtDate = one("SELECT r.ref FROM payment_evidence e JOIN registration r ON r.id = e.registration_id WHERE e.amount_paise = ? AND e.paid_on = ? AND e.registration_id <> ? AND e.status IN ('submitted','approved') LIMIT 1", input.amountPaise, input.paidOn, reg.id);
  if (sameAmtDate) flags.push(`Same amount and date as ${sameAmtDate.ref}`);
  const due = payableNow(reg);
  if (input.amountPaise !== due) flags.push(`Entered ${inr(input.amountPaise)} but ${inr(due)} is due`);
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  const id = uid();
  const rel = path.join('evidence', `${id}.${ext}`);
  fs.mkdirSync(path.join(config.uploadDir, 'evidence'), { recursive: true });
  fs.writeFileSync(path.join(config.uploadDir, rel), file.buffer, { mode: 0o600 });
  const extracted = extract(file.buffer, mime);
  if (extracted?.utr && normUtr(extracted.utr) !== utr) flags.push(`File shows UTR ${extracted.utr}, entered ${utr}`);
  if (extracted?.amount && extracted.amount !== input.amountPaise) flags.push(`File shows ${inr(extracted.amount)}, entered ${inr(input.amountPaise)}`);
  return tx(() => {
    insert('payment_evidence', {
      id, registration_id: reg.id, file_path: rel, file_hash: hash, mime, size: file.buffer.length, utr, amount_paise: input.amountPaise, paid_on: input.paidOn,
      ref_code: reg.ref, status: 'submitted', tamper_flags: JSON.stringify(flags), extracted: extracted ? JSON.stringify(extracted) : null, submitted_at: now(),
      reviewer_id: null, reason: submittedByUser ? `submitted by staff ${submittedByUser}` : null,
    });
    update('registration', reg.id, { payment_status: 'submitted', updated_at: now() });
    autoMatchEvidence(id);
    const vars = regVars(reg, { utr, paid: inr(input.amountPaise), review_link: `${config.baseUrl}/app/payments/review` });
    enqueue('screenshot_submitted', { to: reg.email, registrationId: reg.id, vars });
    notifyStaff(['cfo'], 'screenshot_review_cfo', vars, reg.event_id);
    audit('evidence.submit', 'payment_evidence', id, undefined, { reg: reg.ref, utr, amount: input.amountPaise, flags });
    return { id, flags };
  });
}

export function approveEvidence(evidenceId: string, approvedPaise?: number) {
  return tx(() => {
    const e = one('SELECT * FROM payment_evidence WHERE id = ?', evidenceId);
    if (!e) throw notFound('Payment proof');
    if (e.status !== 'submitted') throw conflict(`Already ${e.status}`);
    // Maker-checker: whoever submitted a proof on a delegate's behalf cannot approve it.
    if (e.reason?.startsWith('submitted by staff ') && e.reason.endsWith(ctx().userId ?? '—')) throw forbidden('You submitted this proof, so another approver must review it');
    const amount = approvedPaise ?? e.amount_paise;
    if (amount <= 0) throw bad('Approved amount must be positive');
    const reg = one('SELECT * FROM registration WHERE id = ?', e.registration_id)!;
    const txnId = uid();
    insert('payment_transaction', { id: txnId, order_id: null, registration_id: reg.id, gateway: 'screenshot', gateway_payment_id: e.utr, amount_paise: amount, status: 'approved', method: 'upi/bank', verified_by: 'cfo', raw: JSON.stringify({ evidence: e.id, bank_line: e.bank_line_id }), created_at: now() });
    update('payment_evidence', e.id, { status: 'approved', approved_paise: amount, reviewer_id: ctx().userId ?? null, reviewed_at: now() });
    receive(reg.id, amount, { debitAccount: 'bank', sourceType: 'payment', sourceId: txnId, label: `UTR ${e.utr}` });
    audit('evidence.approve', 'payment_evidence', e.id, { status: 'submitted' }, { status: 'approved', amount });
    return { txnId };
  });
}

export function rejectEvidence(evidenceId: string, reason: string, mode: 'rejected' | 'resubmit') {
  if (!reason?.trim()) throw bad('Give the delegate a reason');
  return tx(() => {
    const e = one('SELECT * FROM payment_evidence WHERE id = ?', evidenceId);
    if (!e) throw notFound('Payment proof');
    if (e.status !== 'submitted') throw conflict(`Already ${e.status}`);
    update('payment_evidence', e.id, { status: mode, reason, reviewer_id: ctx().userId ?? null, reviewed_at: now() });
    const reg = one('SELECT * FROM registration WHERE id = ?', e.registration_id)!;
    update('registration', reg.id, { payment_status: mode === 'rejected' ? 'failed' : 'pending', updated_at: now() });
    enqueue('screenshot_rejected', { to: reg.email, registrationId: reg.id, vars: regVars(reg, { reason }) });
    audit(`evidence.${mode}`, 'payment_evidence', e.id, { status: 'submitted' }, { status: mode, reason });
  });
}

/** Bulk approve rows the CFO ticked (typically the bank-matched ones). */
export function bulkApprove(ids: string[], requireBankMatch = true) {
  const done: string[] = [], skipped: { id: string; reason: string }[] = [];
  for (const id of ids) {
    const e = one('SELECT * FROM payment_evidence WHERE id = ?', id);
    if (!e) { skipped.push({ id, reason: 'not found' }); continue; }
    if (requireBankMatch && !e.bank_line_id) { skipped.push({ id, reason: 'not bank-matched' }); continue; }
    try { approveEvidence(id); done.push(id); } catch (err: any) { skipped.push({ id, reason: err.message }); }
  }
  return { approved: done.length, skipped };
}

/** Match a submission against imported bank lines: same UTR and same amount = "bank-matched". */
export function autoMatchEvidence(evidenceId?: string) {
  const ev = evidenceId ? all("SELECT * FROM payment_evidence WHERE id = ? AND status = 'submitted' AND bank_line_id IS NULL", evidenceId)
    : all("SELECT * FROM payment_evidence WHERE status = 'submitted' AND bank_line_id IS NULL");
  let matched = 0;
  for (const e of ev) {
    const line = one("SELECT * FROM bank_line WHERE direction = 'cr' AND matched_evidence_id IS NULL AND (utr = ? OR description LIKE ?) AND amount_paise = ?", e.utr, `%${e.utr}%`, e.amount_paise);
    if (!line) continue;
    run('UPDATE bank_line SET matched_evidence_id = ? WHERE id = ?', e.id, line.id);
    run('UPDATE payment_evidence SET bank_line_id = ? WHERE id = ?', line.id, e.id);
    matched++;
  }
  return matched;
}

export function addBankLines(lines: { date: string; description: string; utr?: string | null; amountPaise: number; direction: 'cr' | 'dr' }[], batchId: string) {
  for (const l of lines) {
    const utr = l.utr ? normUtr(l.utr) : (l.description.toUpperCase().match(/\b(\d{12}|[A-Z]{4}\d{8,18}|[A-Z]{4}[A-Z0-9]{12,18})\b/)?.[1] ?? null);
    insert('bank_line', { id: uid(), import_batch_id: batchId, txn_date: l.date, description: l.description, utr, amount_paise: l.amountPaise, direction: l.direction, created_at: now() });
  }
  return autoMatchEvidence();
}

/** Unreviewed proofs older than the escalation window go to a second approver. */
export function escalateStale() {
  const rows = all("SELECT e.*, r.event_id, r.ref, r.full_name FROM payment_evidence e JOIN registration r ON r.id = e.registration_id WHERE e.status = 'submitted' AND e.escalated_at IS NULL");
  let n = 0;
  for (const e of rows) {
    const hours = eventSettings(e.event_id).escalationHours;
    if (addHours(e.submitted_at, hours) > now()) continue;
    const second = one("SELECT u.email, u.name FROM user u WHERE u.id = (SELECT json_extract(settings, '$.secondApproverUserId') FROM organization LIMIT 1)");
    const msg = { title: 'Payment proof waiting too long', message: `${e.ref} ${e.full_name}: UTR ${e.utr} for ${inr(e.amount_paise)} has waited over ${hours} hours.` };
    if (second) enqueue('staff_alert', { to: second.email, recipientKind: 'staff', vars: msg });
    else notifyStaff(['cfo', 'admin'], 'staff_alert', msg, e.event_id);
    run('UPDATE payment_evidence SET escalated_at = ? WHERE id = ?', now(), e.id);
    n++;
  }
  return n;
}

/** Expiring, signed link for private files (payment proofs, bills, ID proofs). */
export function signedFileUrl(rel: string, minutes = 15) {
  const exp = Date.now() + minutes * 60_000;
  const sig = crypto.createHmac('sha256', config.appSecret).update(`${rel}:${exp}`).digest('base64url');
  return `/api/files?p=${encodeURIComponent(rel)}&e=${exp}&s=${sig}`;
}
export function verifyFileUrl(rel: string, exp: number, sig: string) {
  if (!rel || rel.includes('..') || exp < Date.now()) return false;
  const want = crypto.createHmac('sha256', config.appSecret).update(`${rel}:${exp}`).digest('base64url');
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
