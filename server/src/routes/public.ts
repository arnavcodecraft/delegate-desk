import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run, update } from '../db.ts';
import { audit } from '../audit.ts';
import { config, uploadDir } from '../config.ts';
import { MAIN, allWorkspaces, inWorkspace, workspaceForTagged } from '../platform.ts';
import { submitPaper } from '../services/applications.ts';
import { mediaFile } from '../services/conference.ts';
import { eventSettings, getOrg } from '../settings.ts';
import { rateLimit } from '../auth.ts';
import { bad, conflict, notFound, now, parseMoney, uid, json } from '../util.ts';
import { quote, payableNow } from '../services/fees.ts';
import { suggestReferrers } from '../services/referrals.ts';
import { register, registerDelegation, portalView, delegateUpdate, giveGuardianConsent, withdrawConsent, requestSwap, delegationView, CLASS_OPTIONS, staffUpdate } from '../services/registrations.ts';
import { availableGateways, createOrder, checkoutCallback, orderStatus, resolveOrder, handleWebhook, requestRefund, sandboxComplete, cancelRegistration } from '../services/payments.ts';
import { submitEvidence, payInstructions, MAX_UPLOAD, sniff, verifyFileUrl } from '../services/evidence.ts';
import { invoicePdf, allotmentLetterPdf, toCsv } from '../services/documents.ts';
import { statement } from '../services/commission.ts';
import { runList } from '../services/lists.ts';
import { markBounced } from '../services/notify.ts';
import { hmacHex } from '../services/gateways.ts';
import { checkUpload } from '../services/scanner.ts';
import { sendOtp, verifyOtp } from '../services/otp.ts';
import { whatsapp } from '../services/channels.ts';
import { applyDeliveryStatuses } from '../services/notify.ts';
import type { GatewayName } from '../services/gateways.ts';

export const P = (req: Request) => req.params as Record<string, string>;
export const h = (fn: (req: Request, res: Response) => any) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve().then(() => fn(req, res)).then((out) => { if (out !== undefined && !res.headersSent) res.json(out); }).catch(next);
};
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1 } });

const MAJOR_CITIES = ['Ahmedabad', 'Bengaluru', 'Bhopal', 'Bhubaneswar', 'Chandigarh', 'Chennai', 'Coimbatore', 'Dehradun', 'Delhi', 'Faridabad', 'Ghaziabad', 'Goa', 'Gurugram', 'Guwahati', 'Hyderabad', 'Indore', 'Jaipur', 'Jammu', 'Kanpur', 'Kochi', 'Kolkata', 'Kozhikode', 'Lucknow', 'Ludhiana', 'Madurai', 'Mangaluru', 'Mumbai', 'Mysuru', 'Nagpur', 'Nashik', 'Noida', 'Patna', 'Puducherry', 'Pune', 'Raipur', 'Ranchi', 'Shillong', 'Surat', 'Thane', 'Thiruvananthapuram', 'Vadodara', 'Varanasi', 'Vijayawada', 'Visakhapatnam'];

function eventByCode(code: string) {
  const e = one('SELECT * FROM event WHERE upper(code) = upper(?)', code);
  if (!e) throw notFound('Event');
  return e;
}
function regByToken(t: string) {
  const r = one('SELECT * FROM registration WHERE token = ? AND erased_at IS NULL', t);
  if (!r) throw notFound('Registration');
  return r;
}

export const publicRouter = express.Router();

publicRouter.get('/events/:code', h((req) => {
  const e = eventByCode(P(req).code);
  const s = eventSettings(e);
  const org = getOrg(e.org_id);
  const committees = all(`SELECT c.id, c.name, c.short, c.kind, c.description,
      (SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = c.id AND s.state = 'open') AS open_seats,
      (SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = c.id) AS seats
    FROM committee c WHERE c.event_id = ? ORDER BY c.sort, c.name`, e.id);
  const categories = [...new Set(all('SELECT category FROM fee_tier WHERE event_id = ? AND active = 1', e.id).map((t) => t.category))];
  const extra = all('SELECT id, type, topics, difficulty, emblem FROM committee WHERE event_id = ?', e.id);
  const p = s.profile;
  return {
    profile: { acronym: p.acronym, logo: p.logo ? `/api/public/media/${p.logo}` : null, banner: p.banner && /^p[1-6]$/.test(p.banner) ? p.banner : p.banner ? `/api/public/media/${p.banner}` : null,
      country: p.country, level: p.level, format: p.format, datesTbd: p.datesTbd, slug: e.code.toLowerCase() },
    open: { delegate: s.roles.delegate && e.status === 'open' && !(s.applicationDeadline && s.applicationDeadline < new Date().toISOString()), deadline: s.applicationDeadline, status: e.status },
    allocationMode: s.allocationMode, free: s.free,
    event: { code: e.code, name: e.name, venue: e.venue, city: e.city, start_date: e.start_date, end_date: e.end_date, status: e.status, kind: e.kind },
    org: { name: org.name, legal_name: org.legal_name, grievance: org.grievance_contact },
    committees: committees.map((c) => { const x = extra.find((y) => y.id === c.id) ?? {}; return { ...c, type: x.type, topics: JSON.parse(x.topics || '[]'), difficulty: x.difficulty, emblem: x.emblem, full: c.open_seats === 0 }; }),
    classOptions: CLASS_OPTIONS, categories, gstRateBp: s.gstEnabled ? s.gstRateBp : 0, holdHours: s.holdHours, feeModel: s.feeModel,
    refundWindowDays: s.refundWindowDays, requireMobileOtp: s.requireMobileOtp,
  };
}));

publicRouter.get('/events/:code/quote', h((req) => {
  const e = eventByCode(P(req).code);
  try {
    return quote(e.id, { category: String(req.query.category ?? 'school'), couponCode: (req.query.coupon as string) || null, groupSize: Number(req.query.groupSize ?? 1) });
  } catch (err: any) { return { error: err.message }; }
}));

publicRouter.get('/events/:code/suggest/:field', h((req) => {
  const e = eventByCode(P(req).code);
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return [];
  if (P(req).field === 'referrer') return suggestReferrers(e.org_id, q);
  if (P(req).field === 'institution') return all("SELECT institution, COUNT(*) n FROM registration WHERE institution LIKE ? AND erased_at IS NULL GROUP BY lower(institution) ORDER BY n DESC LIMIT 8", `%${q}%`).map((r) => r.institution);
  if (P(req).field === 'city') {
    const known = all("SELECT city, COUNT(*) n FROM registration WHERE city LIKE ? AND erased_at IS NULL GROUP BY lower(city) ORDER BY n DESC LIMIT 8", `${q}%`).map((r) => r.city);
    return [...new Set([...known, ...MAJOR_CITIES.filter((c) => c.toLowerCase().startsWith(q.toLowerCase()))])].slice(0, 8);
  }
  throw bad('Unknown field');
}));

publicRouter.post('/events/:code/register', h((req) => {
  rateLimit(`reg:${req.ip}`, 20, 10 * 60_000);
  const b = req.body ?? {};
  // Bot protection: a hidden honeypot field and a minimum time on the form.
  if (b.website || (b.startedAt && Date.now() - Number(b.startedAt) < 1500)) throw bad('That was quicker than we expected. Please check your details and press Register again.');
  const e = eventByCode(P(req).code);
  const { registration: r, allocation } = register(e.id, b);
  return {
    ref: r.ref, token: r.token, portal: `/r/${r.token}`,
    allocation: allocation.kind === 'seat' ? { committee: allocation.pick.committee, portfolio: allocation.pick.portfolio, fallback: allocation.pick.fallback } : { waitlist: allocation.position },
    totalPaise: r.total_paise, payNowPaise: payableNow(r), holdExpiresAt: r.hold_expires_at, guardianConsent: r.guardian_consent,
  };
}));

publicRouter.post('/events/:code/otp', h(async (req) => {
  rateLimit(`otp:${req.ip}`, 10, 60 * 60_000);
  return sendOtp(eventByCode(P(req).code), String(req.body?.mobile ?? ''));
}));
publicRouter.post('/events/:code/otp/verify', h((req) => {
  rateLimit(`otpv:${req.ip}`, 30, 60 * 60_000);
  return verifyOtp(eventByCode(P(req).code).id, String(req.body?.mobile ?? ''), String(req.body?.code ?? ''));
}));

publicRouter.post('/events/:code/delegation', h((req) => {
  rateLimit(`deleg:${req.ip}`, 5, 10 * 60_000);
  const e = eventByCode(P(req).code);
  const { head, members, payment_mode } = req.body ?? {};
  return registerDelegation(e.id, head ?? {}, Array.isArray(members) ? members : [], payment_mode);
}));

// ---------- delegate portal (magic link, no password) ----------
publicRouter.get('/r/:token', h((req) => {
  const r = regByToken(P(req).token);
  const v = portalView(r);
  const due = payableNow(r);
  return { ...v, payment: due > 0 && !r.cancelled_at ? { duePaise: due, ...availableGateways(r.event_id, due), instructions: payInstructions(r) } : null };
}));
publicRouter.patch('/r/:token', h((req) => portalView(delegateUpdate(regByToken(P(req).token), req.body ?? {}))));
publicRouter.post('/r/:token/orders', h(async (req) => {
  const r = regByToken(P(req).token);
  const d = r.delegation_id ? one('SELECT payment_mode FROM delegation WHERE id = ?', r.delegation_id) : null;
  if (d?.payment_mode === 'head_pays') throw conflict('Your head delegate pays for the whole delegation. Ask them to pay from the delegation page.');
  return createOrder({ registrationIds: [r.id], gateway: req.body?.gateway as GatewayName });
}));
publicRouter.post('/r/:token/evidence', upload.single('file'), h(async (req) => {
  const r = regByToken(P(req).token);
  if (!req.file) throw bad('Attach the payment screenshot or PDF');
  await checkUpload(req.file.buffer);
  rateLimit(`ev:${r.id}`, 10, 60 * 60_000);
  return submitEvidence(r, req.file, { utr: req.body.utr, amountPaise: parseMoney(req.body.amount), paidOn: req.body.paid_on });
}));
publicRouter.post('/r/:token/paper', upload.single('file'), h(async (req) => {
  const r = regByToken(P(req).token);
  if (!req.file) throw bad('Attach your position paper (PDF)');
  await checkUpload(req.file.buffer);
  rateLimit(`paper:${r.id}`, 10, 60 * 60_000);
  return submitPaper(r, req.file);
}));
// Public images and study guides (logos, banners, payment QR codes). Names carry the workspace tag.
publicRouter.get('/media/:name', (req, res) => {
  const f = mediaFile(P(req).name);
  if (!f) return res.status(404).send('Not found');
  res.setHeader('cache-control', 'public, max-age=86400');
  res.sendFile(f);
});
publicRouter.post('/r/:token/id-proof', upload.single('file'), h(async (req) => {
  const r = regByToken(P(req).token);
  if (!req.file) throw bad('Attach the ID proof');
  await checkUpload(req.file.buffer);
  if (r.is_minor && r.guardian_consent !== 'verified') throw conflict('We need parental or school consent before collecting ID proof');
  const mime = sniff(req.file.buffer);
  if (!mime) throw bad('Upload a JPG, PNG or PDF');
  const rel = path.join('idproof', `${r.id}-${uid().slice(0, 6)}.${mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg'}`);
  fs.mkdirSync(path.join(uploadDir(), 'idproof'), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), rel), req.file.buffer, { mode: 0o600 });
  update('registration', r.id, { id_proof_path: rel, id_proof_status: 'submitted' });
  audit('idproof.upload', 'registration', r.id);
  return { ok: true };
}));
publicRouter.post('/r/:token/refund-request', h((req) => {
  const r = regByToken(P(req).token);
  const amount = req.body?.amount ? parseMoney(req.body.amount) : r.paid_paise - r.refunded_paise;
  return { id: requestRefund(r.id, amount, String(req.body?.reason ?? ''), { byDelegate: true }) };
}));
publicRouter.post('/r/:token/swap', h((req) => ({ id: requestSwap(regByToken(P(req).token), req.body?.committee_id, req.body?.note) })));
publicRouter.post('/r/:token/withdraw-consent', h((req) => { withdrawConsent(regByToken(P(req).token)); return { ok: true }; }));
publicRouter.post('/r/:token/cancel', h((req) => { const r = regByToken(P(req).token); cancelRegistration(r.id, 'Cancelled by delegate'); return { ok: true }; }));
publicRouter.get('/r/:token/invoice/:id', h(async (req, res) => {
  const r = regByToken(P(req).token);
  if (!one('SELECT 1 FROM invoice WHERE id = ? AND registration_id = ?', P(req).id, r.id)) throw notFound('Invoice');
  const f = await invoicePdf(P(req).id);
  res.type('pdf').setHeader('content-disposition', `inline; filename="${f.filename}"`); res.send(f.content);
}));
publicRouter.get('/r/:token/allotment-letter', h(async (req, res) => {
  const f = await allotmentLetterPdf(regByToken(P(req).token).id);
  res.type('pdf').setHeader('content-disposition', `inline; filename="${f.filename}"`); res.send(f.content);
}));

publicRouter.post('/orders/:id/callback', h((req) => checkoutCallback(P(req).id, req.body ?? {})));
publicRouter.get('/orders/:id', h(async (req) => { const st = orderStatus(P(req).id); if (st.status === 'processing') await resolveOrder(P(req).id); return orderStatus(P(req).id); }));

// Sandbox gateway checkout (test money only).
publicRouter.get('/sandbox/:orderId', h((req) => {
  const o = one('SELECT id, amount_paise, status, gateway, covers FROM payment_order WHERE id = ?', P(req).orderId);
  if (!o || o.gateway !== 'mock') throw notFound('Sandbox order');
  const first = json<any[]>(o.covers, [])[0];
  const reg = first ? one('SELECT token, ref, full_name FROM registration WHERE id = ?', first.registrationId) : null;
  return { ...o, ref: reg?.ref, name: reg?.full_name, returnTo: reg ? `/r/${reg.token}?order=${o.id}` : '/' };
}));
publicRouter.post('/sandbox/:orderId/complete', h((req) => {
  if (!config.allowSandbox) throw conflict('The sandbox gateway is disabled in production');
  const out = req.body?.outcome;
  if (!['success', 'failure', 'success_no_webhook'].includes(out)) throw bad('Unknown outcome');
  checkoutCallbackSafe(P(req).orderId);
  return sandboxComplete(P(req).orderId, out);
}));
function checkoutCallbackSafe(orderId: string) {
  run("UPDATE payment_order SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'created'", now(), orderId);
}

// ---------- guardian consent, unsubscribe, privacy ----------
publicRouter.get('/consent/:token', h((req) => {
  const r = one('SELECT full_name, guardian_name, guardian_consent, event_id FROM registration WHERE guardian_token = ?', P(req).token);
  if (!r) throw notFound('Consent request');
  const e = one('SELECT name FROM event WHERE id = ?', r.event_id)!;
  return { delegate: r.full_name, guardian: r.guardian_name, status: r.guardian_consent, event: e.name };
}));
publicRouter.post('/consent/:token', h((req) => { giveGuardianConsent(P(req).token, req.body ?? {}); return { ok: true }; }));
publicRouter.get('/unsubscribe/:token', (req, res) => {
  const r = one('SELECT id FROM registration WHERE token = ? OR id = ?', P(req).token, P(req).token);
  if (r) { run('UPDATE registration SET unsubscribed = 1 WHERE id = ?', r.id); audit('unsubscribe', 'registration', r.id); }
  res.type('html').send('<!doctype html><meta name=viewport content="width=device-width"><body style="font:16px system-ui;padding:2rem;max-width:40rem;margin:auto"><h1>Unsubscribed</h1><p>You will no longer get payment reminders. Essential messages about your registration and payments will still be sent.</p></body>');
});
publicRouter.get('/privacy', h(() => {
  const o = getOrg();
  return { org: o.legal_name, grievance: o.grievance_contact, address: o.address };
}));

// ---------- head delegate ----------
function delegationByToken(t: string) { const d = one('SELECT * FROM delegation WHERE token = ?', t); if (!d) throw notFound('Delegation'); return d; }
publicRouter.get('/delegation/:token', h((req) => {
  const v = delegationView(P(req).token);
  const d = delegationByToken(P(req).token);
  return { ...v, payment: v.totalDue > 0 && d.payment_mode === 'head_pays' ? availableGateways(d.event_id, v.totalDue) : null };
}));
publicRouter.post('/delegation/:token/orders', h(async (req) => {
  const d = delegationByToken(P(req).token);
  if (d.payment_mode !== 'head_pays') throw conflict('Members pay individually for this delegation');
  const ids = all("SELECT id FROM registration WHERE delegation_id = ? AND cancelled_at IS NULL AND total_paise - paid_paise + refunded_paise > 0 AND allot_status <> 'waitlisted'", d.id).map((r) => r.id);
  if (!ids.length) throw conflict('Nothing is due');
  return createOrder({ registrationIds: ids, gateway: req.body?.gateway, delegationId: d.id });
}));
publicRouter.post('/delegation/:token/members', h((req) => {
  const d = delegationByToken(P(req).token);
  const out = []; const errors = [];
  for (const m of req.body?.members ?? []) {
    try { out.push(register(d.event_id, { ...m, institution: m.institution || d.institution, consent: true }, { source: 'delegation', delegationId: d.id }).registration.ref); }
    catch (e: any) { errors.push({ name: m.full_name, error: e.message, fields: e.details?.fields }); }
  }
  return { registered: out, errors };
}));
publicRouter.patch('/delegation/:token/members/:regId', h((req) => {
  const d = delegationByToken(P(req).token);
  const r = one('SELECT * FROM registration WHERE id = ? AND delegation_id = ?', P(req).regId, d.id);
  if (!r) throw notFound('Member');
  const allowed = Object.fromEntries(Object.entries(req.body ?? {}).filter(([k]) => ['full_name', 'class_year', 'mobile', 'email'].includes(k)));
  if (eventSettings(r.event_id).detailsLockAt && eventSettings(r.event_id).detailsLockAt! <= now()) throw conflict('Details are locked');
  staffUpdate(r.id, allowed, false);
  return delegationView(P(req).token);
}));
publicRouter.delete('/delegation/:token/members/:regId', h((req) => {
  const d = delegationByToken(P(req).token);
  const r = one('SELECT * FROM registration WHERE id = ? AND delegation_id = ?', P(req).regId, d.id);
  if (!r) throw notFound('Member');
  cancelRegistration(r.id, 'Removed by head delegate');
  return delegationView(P(req).token);
}));

// ---------- referrer statement & scoped share links ----------
publicRouter.get('/referrer/:token', h((req) => {
  const r = one('SELECT id FROM referrer WHERE token = ?', P(req).token);
  if (!r) throw notFound('Referrer');
  const st = statement(r.id);
  // Referrers see only names and status of the delegates they referred.
  return { ...st, delegates: st.delegates.map((d) => ({ name: d.name, status: d.status, event: d.event })), lines: st.lines.map((l: any) => ({ kind: l.kind, bracket: l.bracket, amount_paise: l.amount_paise, status: l.status, name: l.full_name, created_at: l.created_at })) };
}));

function shareList(tok: string) {
  const s = one('SELECT * FROM share_link WHERE token = ?', tok);
  if (!s || s.expires_at < now()) throw notFound('Link (it may have expired)');
  const out = runList(s.kind, s.event_id, { committeeId: s.committee_id ?? undefined }, s.committee_id ? [s.committee_id] : null);
  // Delegate data of minors is excluded from external links by default.
  const rows = s.include_minors ? out.rows : out.rows.filter((r) => !r.is_minor);
  const safeCols = out.columns.filter((c) => !['email', 'mobile', 'dob', 'emergency_phone', 'emergency_name'].includes(c.key));
  return { ...out, columns: safeCols, rows: rows.map((r) => Object.fromEntries(safeCols.map((c) => [c.key, r[c.key]]))), expires_at: s.expires_at, event: one('SELECT name FROM event WHERE id = ?', s.event_id)?.name };
}
publicRouter.get('/share/:token', h((req) => shareList(P(req).token)));
publicRouter.get('/share/:token/csv', h((req, res) => {
  const l = shareList(P(req).token);
  res.type('text/csv').send(toCsv(l.columns, l.rows));
}));

// ---------- private files via expiring signed links ----------
export function serveFile(req: Request, res: Response) {
  const rel = String(req.query.p ?? ''); const exp = Number(req.query.e ?? 0); const sig = String(req.query.s ?? '');
  if (!verifyFileUrl(rel, exp, sig)) return res.status(403).send('Link expired');
  const full = path.join(uploadDir(), rel);
  if (!full.startsWith(uploadDir()) || !fs.existsSync(full)) return res.status(404).send('Not found');
  res.setHeader('cache-control', 'private, no-store');
  res.sendFile(full);
}

// ---------- webhooks (raw body: signatures are over the exact bytes) ----------
export const webhookRouter = express.Router();
webhookRouter.use(express.raw({ type: '*/*', limit: '1mb' }));
for (const g of ['razorpay', 'cashfree', 'mock'] as GatewayName[]) {
  webhookRouter.post(`/${g}`, (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      // Order ids carry their workspace tag, so the payload says which organiser's books to post to.
      const out = inWorkspace(workspaceForTagged(raw) ?? MAIN, () => handleWebhook(g, raw, req.headers as any));
      res.status(out.status).json({ result: out.result });
    } catch (e) { next(e); }
  });
}
// WhatsApp Cloud API: GET is Meta's one-time subscription check; POSTs carry signed delivery receipts.
webhookRouter.get('/whatsapp', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && req.query['hub.verify_token'] === config.whatsapp.verifyToken) return res.type('text').send(String(req.query['hub.challenge'] ?? ''));
  res.status(403).send('forbidden');
});
webhookRouter.post('/whatsapp', (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!whatsapp.verifySignature(raw, req.headers['x-hub-signature-256'] as string | undefined)) return res.status(401).json({ error: 'bad signature' });
  const statuses = whatsapp.parseStatuses(JSON.parse(raw || '{}'));
  res.json({ updated: allWorkspaces().reduce((n, w) => n + inWorkspace(w, () => applyDeliveryStatuses(statuses)), 0) });
});
webhookRouter.post('/email-bounce', (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (req.headers['x-signature'] !== hmacHex(config.appSecret, raw)) return res.status(401).json({ error: 'bad signature' });
  const b = JSON.parse(raw || '{}');
  for (const email of [].concat(b.email ?? b.emails ?? [])) for (const w of allWorkspaces()) inWorkspace(w, () => markBounced(email, b.reason ?? 'bounced'));
  res.json({ ok: true });
});
