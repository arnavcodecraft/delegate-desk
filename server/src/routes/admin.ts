import express from 'express';
import QRCode from 'qrcode';
import { all, one, run, insert, update, tx, scalar } from '../db.ts';
import { audit, diff } from '../audit.ts';
import { config } from '../config.ts';
import { eventSettings, getEvent, getOrg, orgSettings, saveEventSettings, saveOrgSettings, EXPENSE_CATEGORIES } from '../settings.ts';
import {
  requirePerm, requireUser, can, committeeScope, createUser, setRole, rolesOf, verifyPassword, hashPassword, startSession, endSession,
  verifyTotp, newTotpSecret, MFA_ROLES, ROLES, ROLE_LABELS, permissionMatrix, rateLimit, type Role,
} from '../auth.ts';
import { bad, conflict, ctx, forbidden, json, notFound, now, token, uid, istDate, addHours, isEmail } from '../util.ts';
import { h, upload, P } from './public.ts';
import { inventory, addPortfolio, simulate, seatOf } from '../services/allocation.ts';
import { staffUpdate, resendEmail, eraseRegistration, register, duplicates, decideSwap, changeAllocation, acceptApplication, sendEventReminders, portalView } from '../services/registrations.ts';
import { cancelRegistration, regVars, cancelEvent, markEventHeld, portalLink } from '../services/payments.ts';
import { linkReferral } from '../services/referrals.ts';
import { reconcile } from '../services/commission.ts';
import { runList, LISTS, committeeName } from '../services/lists.ts';
import { toCsv, toXlsx, tablePdf, logExport, exportMeta } from '../services/documents.ts';
import { DEFAULT_TEMPLATES, enqueue, render } from '../services/notify.ts';
import { KINDS, parseFile, suggestMapping, preview, commit, errorFile, rollback } from '../services/imports.ts';
import { submitEvidence, signedFileUrl } from '../services/evidence.ts';
import { balanceOf } from '../services/fees.ts';
import { parseMoney } from '../util.ts';

export const authRouter = express.Router();

authRouter.post('/login', h((req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  rateLimit(`login:${req.ip}:${email}`, 10, 15 * 60_000);
  const user = one('SELECT * FROM user WHERE email = ? AND active = 1', email);
  const ok = !!user && verifyPassword(req.body?.password ?? '', user.password_hash);
  insert('login_log', { id: uid(), user_id: user?.id ?? null, email, ip: req.ip, ua: String(req.headers['user-agent'] ?? '').slice(0, 200), ok: ok ? 1 : 0, at: now() });
  if (!ok) throw bad('Email or password is incorrect');
  const roles = rolesOf(user.id).map((r) => r.role);
  const needsMfa = roles.some((r) => MFA_ROLES.includes(r as Role));
  startSession(res, req, user.id, !needsMfa);
  return { ok: true, mfa: needsMfa ? (user.totp_enabled ? 'verify' : 'enroll') : null };
}));
authRouter.post('/mfa/verify', h((req) => {
  if (!req.auth) throw bad('Sign in first');
  const u = req.auth.user;
  rateLimit(`mfa:${u.id}`, 8, 15 * 60_000);
  if (!u.totp_enabled || !verifyTotp(u.totp_secret, req.body?.code)) throw bad('That code is not valid');
  run('UPDATE session SET mfa_ok = 1 WHERE token = ?', req.auth.session.token);
  audit('auth.mfa', 'user', u.id);
  return { ok: true };
}));
authRouter.post('/mfa/enroll', h(async (req) => {
  if (!req.auth) throw bad('Sign in first');
  const u = req.auth.user;
  if (u.totp_enabled && !req.auth.session.mfa_ok) throw forbidden('Verify your current code first');
  const secret = newTotpSecret();
  run('UPDATE user SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', secret, u.id);
  const uri = `otpauth://totp/DelegateDesk:${encodeURIComponent(u.email)}?secret=${secret}&issuer=DelegateDesk`;
  return { secret, uri, qr: await QRCode.toDataURL(uri) };
}));
authRouter.post('/mfa/confirm', h((req) => {
  if (!req.auth) throw bad('Sign in first');
  const u = one('SELECT * FROM user WHERE id = ?', req.auth.user.id)!;
  if (!u.totp_secret || !verifyTotp(u.totp_secret, req.body?.code)) throw bad('That code is not valid. Check your phone’s clock and try again.');
  run('UPDATE user SET totp_enabled = 1 WHERE id = ?', u.id);
  run('UPDATE session SET mfa_ok = 1 WHERE token = ?', req.auth.session.token);
  audit('auth.mfa_enrolled', 'user', u.id);
  return { ok: true };
}));
authRouter.post('/logout', h((req, res) => { endSession(req, res); return { ok: true }; }));
authRouter.get('/me', h((req) => {
  if (!req.auth) return { user: null };
  const a = req.auth;
  const perms = Object.keys(permissionMatrix()).filter((p) => can(a.roleNames, p));
  return {
    user: { id: a.user.id, name: a.user.name, email: a.user.email, totp: !!a.user.totp_enabled },
    roles: a.roles.map((r) => ({ role: r.role, label: ROLE_LABELS[r.role as Role], committee_id: r.committee_id, event_id: r.event_id, referrer_id: r.referrer_id })),
    perms, mfaPending: a.mfaRequired && !a.session.mfa_ok, mfaEnrolled: !!a.user.totp_enabled,
    events: all('SELECT id, code, name, status, start_date FROM event ORDER BY created_at DESC'),
  };
}));
authRouter.post('/password', h((req) => {
  if (!req.auth) throw bad('Sign in first');
  if (!verifyPassword(req.body?.current ?? '', req.auth.user.password_hash)) throw bad('Current password is wrong');
  run('UPDATE user SET password_hash = ? WHERE id = ?', hashPassword(req.body?.next), req.auth.user.id);
  run('DELETE FROM session WHERE user_id = ? AND token <> ?', req.auth.user.id, req.auth.session.token);
  audit('auth.password', 'user', req.auth.user.id);
  return { ok: true };
}));

export const adminRouter = express.Router();
adminRouter.use(requireUser);

// ---------- organisation & events ----------
adminRouter.get('/org', h(() => { const o = getOrg(); return { ...o, settings: orgSettings(o.id), categories: EXPENSE_CATEGORIES }; }));
adminRouter.patch('/org', requirePerm('settings.org', 'settings.finance'), h((req) => {
  const o = getOrg();
  const b = req.body ?? {};
  const fields = ['name', 'legal_name', 'entity_type', 'pan', 'gstin', 'state_code', 'address', 'upi_id', 'bank_name', 'bank_account', 'bank_ifsc', 'grievance_contact'];
  const patch = Object.fromEntries(Object.entries(b).filter(([k]) => fields.includes(k)));
  const isFinanceField = (k: string) => ['upi_id', 'bank_name', 'bank_account', 'bank_ifsc', 'gstin', 'pan'].includes(k);
  if (Object.keys(patch).some(isFinanceField) && !can(req.auth!.roleNames, 'settings.finance') && !can(req.auth!.roleNames, 'settings.org')) throw forbidden();
  if (Object.keys(patch).length) { const d = diff(o, patch); update('organization', o.id, patch); audit('org.update', 'organization', o.id, d.before, d.after); }
  if (b.settings) {
    // Approval limits and TDS rates are finance settings: CFO only.
    if ((b.settings.approvalLimits || b.settings.tds) && !can(req.auth!.roleNames, 'settings.finance')) throw forbidden('Only the CFO can change approval limits and TDS settings');
    saveOrgSettings(b.settings);
  }
  return { ...getOrg(), settings: orgSettings() };
}));

adminRouter.get('/events', h(() => all('SELECT * FROM event ORDER BY created_at DESC').map((e) => ({ ...e, settings: eventSettings(e) }))));
adminRouter.post('/events', requirePerm('event.config'), h((req) => {
  const b = req.body ?? {};
  if (!/^[A-Z0-9]{3,12}$/.test(String(b.code ?? '').toUpperCase())) throw bad('Event code: 3–12 letters/numbers, e.g. BGYS27');
  if (!b.name?.trim()) throw bad('Name the event');
  const id = uid();
  insert('event', { id, org_id: getOrg().id, code: b.code.toUpperCase(), name: b.name.trim(), kind: b.kind ?? 'mun', venue: b.venue ?? null, city: b.city ?? null, state_code: b.state_code ?? getOrg().state_code, start_date: b.start_date ?? null, end_date: b.end_date ?? null, status: 'draft', settings: '{}', created_at: now() });
  audit('event.create', 'event', id, undefined, b);
  return getEvent(id);
}));
adminRouter.patch('/events/:id', requirePerm('event.config'), h((req) => {
  const e = getEvent(P(req).id);
  const b = req.body ?? {};
  const patch = Object.fromEntries(Object.entries(b).filter(([k]) => ['name', 'venue', 'city', 'state_code', 'start_date', 'end_date', 'kind'].includes(k)));
  if (b.status) {
    if (!['draft', 'open', 'closed'].includes(b.status)) throw bad('Use the dedicated actions to mark an event held or cancelled');
    patch.status = b.status;
  }
  if (Object.keys(patch).length) { const d = diff(e, patch); update('event', e.id, patch); audit('event.update', 'event', e.id, d.before, d.after); }
  if (b.settings) saveEventSettings(e.id, b.settings);
  const out = getEvent(e.id);
  return { ...out, settings: eventSettings(out) };
}));
adminRouter.post('/events/:id/held', requirePerm('event.held'), h((req) => ({ recognisedPaise: markEventHeld(P(req).id) })));
adminRouter.post('/events/:id/cancel', requirePerm('event.cancel'), h((req) => ({ refundsRaised: cancelEvent(P(req).id, String(req.body?.reason ?? '')) })));
adminRouter.post('/events/:id/reminders', requirePerm('messages.send'), h((req) => ({ queued: sendEventReminders(P(req).id) })));

// fee tiers & coupons
adminRouter.get('/events/:id/fees', requirePerm('event.config', 'reg.read'), h((req) => ({
  tiers: all('SELECT * FROM fee_tier WHERE event_id = ? ORDER BY category, sort', P(req).id),
  coupons: all('SELECT * FROM coupon WHERE event_id = ? ORDER BY code', P(req).id),
})));
adminRouter.post('/events/:id/fees', requirePerm('event.config'), h((req) => {
  const b = req.body ?? {};
  if (!b.category || !b.name || !(b.amount_paise >= 0)) throw bad('Category, name and amount are required');
  const id = b.id ?? uid();
  const row = { category: b.category, name: b.name, amount_paise: b.amount_paise, starts_at: b.starts_at || null, ends_at: b.ends_at || null, quota: b.quota ?? null, active: b.active === false ? 0 : 1, sort: b.sort ?? 0 };
  if (b.id) { const before = one('SELECT * FROM fee_tier WHERE id = ?', b.id); update('fee_tier', b.id, row); audit('fee_tier.update', 'fee_tier', b.id, before, row); }
  else { insert('fee_tier', { id, event_id: P(req).id, ...row }); audit('fee_tier.create', 'fee_tier', id, undefined, row); }
  return one('SELECT * FROM fee_tier WHERE id = ?', id);
}));
adminRouter.post('/events/:id/coupons', requirePerm('event.config'), h((req) => {
  const b = req.body ?? {};
  if (!b.code || !['percent', 'flat'].includes(b.kind) || !(b.value > 0)) throw bad('Code, kind and value are required');
  const id = b.id ?? uid();
  const row = { code: String(b.code).toUpperCase(), kind: b.kind, value: b.value, purpose: b.purpose ?? 'coupon', expires_at: b.expires_at || null, max_uses: b.max_uses ?? null, active: b.active === false ? 0 : 1 };
  if (b.id) { update('coupon', b.id, row); audit('coupon.update', 'coupon', b.id, undefined, row); }
  else { insert('coupon', { id, event_id: P(req).id, ...row }); audit('coupon.create', 'coupon', id, undefined, row); }
  return one('SELECT * FROM coupon WHERE id = ?', id);
}));

// ---------- committees, portfolios, allocation ----------
adminRouter.get('/events/:id/inventory', requirePerm('reg.read', 'lists.read'), h((req) => inventory(P(req).id)));
adminRouter.post('/events/:id/committees', requirePerm('alloc.config'), h((req) => {
  const b = req.body ?? {};
  if (!b.name?.trim() || !b.short?.trim()) throw bad('Name and short code are required');
  const id = b.id ?? uid();
  const row = { name: b.name.trim(), short: b.short.trim().toUpperCase(), kind: b.kind === 'double' ? 'double' : 'single', description: b.description ?? null, guide_url: b.guide_url ?? null, sort: b.sort ?? 0 };
  if (b.id) update('committee', b.id, row); else insert('committee', { id, event_id: P(req).id, ...row });
  audit(b.id ? 'committee.update' : 'committee.create', 'committee', id, undefined, row);
  return one('SELECT * FROM committee WHERE id = ?', id);
}));
adminRouter.post('/committees/:id/portfolios', requirePerm('alloc.config'), h((req) => {
  const items = Array.isArray(req.body?.portfolios) ? req.body.portfolios : [req.body];
  const ids = items.map((p: any) => addPortfolio(P(req).id, { name: p.name, tier: p.tier, premiumPaise: p.premium_paise, seats: p.seats, sort: p.sort }));
  audit('portfolio.upsert', 'committee', P(req).id, undefined, items);
  return { ids };
}));
adminRouter.delete('/portfolios/:id', requirePerm('alloc.config'), h((req) => {
  if (one("SELECT 1 FROM seat WHERE portfolio_id = ? AND state <> 'open'", P(req).id)) throw conflict('Portfolio has allotted seats');
  tx(() => { run('DELETE FROM seat WHERE portfolio_id = ?', P(req).id); run('DELETE FROM portfolio WHERE id = ?', P(req).id); });
  audit('portfolio.delete', 'portfolio', P(req).id);
  return { ok: true };
}));
adminRouter.get('/events/:id/open-seats', requirePerm('alloc.move'), h((req) => all(`SELECT s.id, s.seat_no, p.name AS portfolio, p.tier, p.premium_paise, c.name AS committee, c.short FROM seat s
  JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE c.event_id = ? AND s.state = 'open' ORDER BY c.sort, p.sort, p.name`, P(req).id)));
adminRouter.post('/events/:id/simulate', requirePerm('alloc.config'), h((req) => {
  const b = req.body ?? {};
  let people = Array.isArray(b.people) ? b.people : [];
  if (!people.length) {
    const comms = all('SELECT id FROM committee WHERE event_id = ?', P(req).id).map((c) => c.id);
    const exp = ['first', 'first', 'some', 'experienced'];
    people = Array.from({ length: Math.min(2000, Number(b.count ?? 100)) }, (_, i) => ({
      institution: `School ${i % Math.max(1, Number(b.schools ?? 15))}`, experience: exp[i % 4],
      preferences: Math.random() < 0.1 ? [] : [...comms].sort(() => Math.random() - 0.5).slice(0, 3),
    }));
  }
  return simulate(P(req).id, people);
}));
adminRouter.get('/events/:id/swaps', requirePerm('alloc.move'), h((req) => all(`SELECT w.*, r.ref, r.full_name, c.name AS to_committee FROM swap_request w JOIN registration r ON r.id = w.registration_id
  JOIN committee c ON c.id = w.to_committee_id WHERE r.event_id = ? ORDER BY w.created_at DESC`, P(req).id)));
adminRouter.post('/swaps/:id', requirePerm('alloc.move'), h((req) => decideSwap(P(req).id, !!req.body?.approve, req.auth!.roleNames, req.body?.seat_id)));

// ---------- registrations ----------
adminRouter.post('/events/:id/registrations', requirePerm('reg.edit'), h((req) => {
  const r = register(P(req).id, { ...req.body, consent: true }, { source: 'desk' });
  return { ref: r.registration.ref, id: r.registration.id };
}));
adminRouter.get('/registrations/:id', requirePerm('reg.read', 'lists.read'), h((req) => {
  const r = one('SELECT * FROM registration WHERE id = ?', P(req).id);
  if (!r) throw notFound('Registration');
  const scope = committeeScope(req);
  const seat = seatOf(r.id);
  if (scope && (!seat || !scope.includes(seat.committee_id))) throw forbidden();
  const finance = can(req.auth!.roleNames, 'payments.read');
  return {
    registration: { ...r, preferences: json(r.preferences, []), referral_suggestions: json(r.referral_suggestions, []), balance_paise: balanceOf(r), portal: finance || can(req.auth!.roleNames, 'reg.edit') ? portalLink(r) : null, token: undefined, guardian_token: undefined },
    seat, view: portalView(r),
    history: all('SELECT h.*, u.name AS by_name FROM allotment_history h LEFT JOIN user u ON u.id = h.by_user WHERE h.registration_id = ? ORDER BY h.at DESC', r.id),
    referrer: r.referrer_id ? one('SELECT id, name, kind FROM referrer WHERE id = ?', r.referrer_id) : null,
    orders: finance ? all('SELECT * FROM payment_order WHERE registration_id = ? OR covers LIKE ? ORDER BY created_at DESC', r.id, `%${r.id}%`) : [],
    transactions: finance ? all("SELECT t.* FROM payment_transaction t LEFT JOIN payment_order o ON o.id = t.order_id WHERE t.registration_id = ? OR o.covers LIKE ? ORDER BY t.created_at DESC", r.id, `%${r.id}%`) : [],
    evidence: finance ? all('SELECT * FROM payment_evidence WHERE registration_id = ? ORDER BY submitted_at DESC', r.id).map((e) => ({ ...e, url: signedFileUrl(e.file_path) })) : [],
    refunds: all('SELECT * FROM refund WHERE registration_id = ? ORDER BY created_at DESC', r.id),
    invoices: finance ? all('SELECT * FROM invoice WHERE registration_id = ? ORDER BY issued_at', r.id) : [],
    commission: finance ? all('SELECT * FROM commission_line WHERE registration_id = ? ORDER BY created_at', r.id) : [],
    messages: all('SELECT id, template_key, channel, recipient, subject, status, last_error, created_at, sent_at FROM notification WHERE registration_id = ? ORDER BY created_at DESC', r.id),
    audit: all("SELECT * FROM audit_log WHERE entity_id = ? ORDER BY id DESC LIMIT 100", r.id),
    idProofUrl: r.id_proof_path ? signedFileUrl(r.id_proof_path) : null,
  };
}));
adminRouter.patch('/registrations/:id', requirePerm('reg.edit'), h((req) => staffUpdate(P(req).id, req.body ?? {}, req.auth!.roleNames.some((r) => ['admin', 'superadmin'].includes(r)))));
adminRouter.post('/registrations/:id/resend', requirePerm('reg.edit', 'messages.send'), h((req) => { resendEmail(P(req).id, req.body?.kind ?? 'portal_link'); return { ok: true }; }));
adminRouter.post('/registrations/:id/cancel', requirePerm('reg.cancel'), h((req) => { cancelRegistration(P(req).id, String(req.body?.reason ?? 'Cancelled by registration desk')); return { ok: true }; }));
adminRouter.post('/registrations/:id/accept', requirePerm('reg.edit'), h((req) => { acceptApplication(P(req).id); return { ok: true }; }));
adminRouter.post('/registrations/:id/move', requirePerm('alloc.move'), h((req) => changeAllocation(P(req).id, req.body?.seat_id, String(req.body?.reason ?? ''), req.auth!.roleNames)));
adminRouter.post('/registrations/:id/link-referral', requirePerm('referral.link'), h((req) => {
  const before = linkReferral(P(req).id, req.body?.referrer_id ?? null, req.body?.learn !== false);
  if (before.previousReferrerId) reconcile(before.previousReferrerId);
  if (req.body?.referrer_id) reconcile(req.body.referrer_id);
  return { ok: true };
}));
adminRouter.post('/registrations/:id/erase', requirePerm('reg.erase'), h((req) => { eraseRegistration(P(req).id); return { ok: true }; }));
adminRouter.post('/registrations/:id/attendance', requirePerm('attendance.mark'), h((req) => {
  const r = one('SELECT * FROM registration WHERE id = ?', P(req).id);
  if (!r) throw notFound('Registration');
  const scope = committeeScope(req);
  if (scope && !scope.includes(seatOf(r.id)?.committee_id)) throw forbidden();
  const at = req.body?.present === false ? null : now();
  update('registration', r.id, { attended_at: at });
  audit('attendance.mark', 'registration', r.id, { attended_at: r.attended_at }, { attended_at: at });
  return { attended_at: at };
}));
adminRouter.post('/registrations/:id/award', requirePerm('attendance.mark'), h((req) => {
  const r = one('SELECT * FROM registration WHERE id = ?', P(req).id);
  if (!r) throw notFound('Registration');
  const scope = committeeScope(req);
  if (scope && !scope.includes(seatOf(r.id)?.committee_id)) throw forbidden();
  update('registration', r.id, { award: req.body?.award || null });
  audit('award.set', 'registration', r.id, { award: r.award }, { award: req.body?.award });
  return { ok: true };
}));
adminRouter.post('/registrations/:id/evidence', requirePerm('reg.edit'), upload.single('file'), h((req) => {
  const r = one('SELECT * FROM registration WHERE id = ?', P(req).id);
  if (!r || !req.file) throw bad('Registration and file required');
  return submitEvidence(r, req.file, { utr: req.body.utr, amountPaise: parseMoney(req.body.amount), paidOn: req.body.paid_on }, req.auth!.user.id);
}));
adminRouter.get('/events/:id/duplicates', requirePerm('reg.read'), h((req) => duplicates(P(req).id)));
adminRouter.get('/erasure-requests', requirePerm('reg.erase'), h(() => all('SELECT e.*, r.ref, r.full_name, r.email FROM erasure_request e JOIN registration r ON r.id = e.registration_id ORDER BY e.requested_at DESC')));

// ---------- lists ----------
function listQuery(req: express.Request) {
  const filters = typeof req.query.filters === 'string' ? json<Record<string, string>>(req.query.filters, {}) : {};
  return { q: req.query.q as string | undefined, committeeId: req.query.committee as string | undefined, filters, sort: req.query.sort as string | undefined, dir: req.query.dir as any };
}
function checkListPerm(req: express.Request, kind: string) {
  const def = LISTS[kind];
  if (!def) throw notFound('List');
  if (def.perm && !can(req.auth!.roleNames, def.perm)) throw forbidden();
  if (!can(req.auth!.roleNames, 'lists.read')) throw forbidden();
  const scope = committeeScope(req);
  if (scope && !['committee', 'attendance', 'badges', 'allotment', 'executive_board'].includes(kind)) throw forbidden('Committee chairs can see their committee’s lists only');
  return scope;
}
adminRouter.get('/lists', h(() => Object.entries(LISTS).map(([k, v]) => ({ key: k, title: v.title, needsCommittee: !!v.needsCommittee, perm: v.perm ?? null }))));
adminRouter.get('/events/:id/lists/:kind', h((req) => {
  const scope = checkListPerm(req, P(req).kind);
  const out = runList(P(req).kind, P(req).id, listQuery(req), scope);
  return { ...out, rows: out.rows.map((r) => ({ ...r, token: undefined, guardian_token: undefined })) };
}));
adminRouter.get('/events/:id/lists/:kind/export', h(async (req, res) => {
  const scope = checkListPerm(req, P(req).kind);
  const q = listQuery(req);
  const out = runList(P(req).kind, P(req).id, q, scope);
  const ev = getEvent(P(req).id);
  const cols = typeof req.query.columns === 'string' && req.query.columns ? out.columns.filter((c) => (req.query.columns as string).split(',').includes(c.key)) : out.columns;
  const title = `${out.title}${q.committeeId ? ' – ' + committeeName(q.committeeId) : ''}`;
  const fmt = String(req.query.format ?? 'csv');
  const meta = exportMeta({ event: ev.name, filters: { q: q.q, ...q.filters }, list: title });
  logExport(`list:${P(req).kind}`, fmt, out.rows.length, { q: q.q, committee: q.committeeId, ...q.filters });
  const base = `${ev.code}-${P(req).kind}-${istDate()}`;
  if (fmt === 'xlsx') { res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').setHeader('content-disposition', `attachment; filename="${base}.xlsx"`); return res.send(await toXlsx(out.title, cols, out.rows, meta)); }
  if (fmt === 'pdf') { res.type('pdf').setHeader('content-disposition', `inline; filename="${base}.pdf"`); return res.send(await tablePdf(title, cols, out.rows, { event: ev.name, filters: q.q })); }
  res.type('text/csv').setHeader('content-disposition', `attachment; filename="${base}.csv"`); res.send(toCsv(cols, out.rows, meta));
}));
adminRouter.post('/events/:id/lists/:kind/snapshot', h((req) => {
  const scope = checkListPerm(req, P(req).kind);
  const out = runList(P(req).kind, P(req).id, listQuery(req), scope);
  const id = uid();
  insert('snapshot', { id, event_id: P(req).id, list: P(req).kind, label: req.body?.label || `${out.title} as of ${istDate()}`, data: JSON.stringify(out), created_by: req.auth!.user.id, created_at: now() });
  audit('snapshot.create', 'snapshot', id, undefined, { list: P(req).kind, rows: out.rows.length });
  return { id };
}));
adminRouter.get('/events/:id/snapshots', requirePerm('lists.read'), h((req) => all('SELECT id, list, label, created_at FROM snapshot WHERE event_id = ? ORDER BY created_at DESC', P(req).id)));
adminRouter.get('/snapshots/:id', requirePerm('lists.read'), h((req) => { const s = one('SELECT * FROM snapshot WHERE id = ?', P(req).id); if (!s) throw notFound('Snapshot'); return { ...s, data: JSON.parse(s.data) }; }));
adminRouter.post('/events/:id/share-links', requirePerm('lists.share'), h((req) => {
  const b = req.body ?? {};
  if (!LISTS[b.kind]) throw bad('Unknown list');
  const t = token(24);
  insert('share_link', { token: t, kind: b.kind, event_id: P(req).id, committee_id: b.committee_id ?? null, include_minors: b.include_minors ? 1 : 0, expires_at: addHours(now(), Math.min(24 * 30, Number(b.hours ?? 72))), created_by: req.auth!.user.id, created_at: now() });
  audit('share.create', 'share_link', t.slice(0, 8), undefined, b);
  return { url: `${config.baseUrl}/share/${t}`, csv: `${config.baseUrl}/api/public/share/${t}/csv` };
}));
adminRouter.get('/views', h((req) => all('SELECT * FROM saved_view WHERE user_id = ? ORDER BY name', req.auth!.user.id).map((v) => ({ ...v, config: json(v.config, {}) }))));
adminRouter.post('/views', h((req) => { const id = uid(); insert('saved_view', { id, user_id: req.auth!.user.id, list: req.body.list, name: req.body.name, config: JSON.stringify(req.body.config ?? {}), created_at: now() }); return { id }; }));
adminRouter.delete('/views/:id', h((req) => { run('DELETE FROM saved_view WHERE id = ? AND user_id = ?', P(req).id, req.auth!.user.id); return { ok: true }; }));

/** Bulk actions on selected rows: email, change committee, mark attended. */
adminRouter.post('/events/:id/bulk', h((req) => {
  const b = req.body ?? {};
  const ids: string[] = Array.isArray(b.ids) ? b.ids : [];
  if (!ids.length) throw bad('Select at least one row');
  const roles = req.auth!.roleNames;
  const results = { ok: 0, failed: [] as { id: string; error: string }[] };
  for (const id of ids) {
    try {
      const r = one('SELECT * FROM registration WHERE id = ? AND event_id = ?', id, P(req).id);
      if (!r) throw notFound('Registration');
      if (b.action === 'email') {
        if (!can(roles, 'messages.send')) throw forbidden();
        if (!DEFAULT_TEMPLATES[b.template] && !one('SELECT 1 FROM template WHERE key = ?', b.template)) throw bad('Unknown template');
        enqueue(b.template, { to: r.email, registrationId: r.id, vars: regVars(r), quiet: !!b.quiet });
      } else if (b.action === 'attended') {
        if (!can(roles, 'attendance.mark')) throw forbidden();
        update('registration', r.id, { attended_at: now() });
      } else if (b.action === 'move') {
        if (!can(roles, 'alloc.move')) throw forbidden();
        const seat = one(`SELECT s.id FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = ? AND s.state = 'open' ORDER BY p.sort LIMIT 1`, b.committee_id);
        if (!seat) throw conflict('No open seat left in that committee');
        changeAllocation(r.id, seat.id, b.reason || 'Bulk committee change', roles);
      } else throw bad('Unknown bulk action');
      results.ok++;
    } catch (e: any) { results.failed.push({ id, error: e.message }); }
  }
  audit('bulk.' + b.action, 'event', P(req).id, undefined, { ids: ids.length, ok: results.ok, failed: results.failed.length });
  return results;
}));

adminRouter.get('/events/:id/executive-board', requirePerm('lists.read'), h((req) => all('SELECT b.*, c.name AS committee FROM executive_board b LEFT JOIN committee c ON c.id = b.committee_id WHERE b.event_id = ? ORDER BY c.sort', P(req).id)));
adminRouter.post('/events/:id/executive-board', requirePerm('alloc.config'), h((req) => {
  const b = req.body ?? {};
  if (!b.name || !b.position) throw bad('Name and position are required');
  const id = uid();
  insert('executive_board', { id, event_id: P(req).id, committee_id: b.committee_id || null, name: b.name, position: b.position, email: b.email || null, phone: b.phone || null });
  audit('eb.add', 'executive_board', id, undefined, b);
  return { id };
}));
adminRouter.delete('/executive-board/:id', requirePerm('alloc.config'), h((req) => { run('DELETE FROM executive_board WHERE id = ?', P(req).id); audit('eb.remove', 'executive_board', P(req).id); return { ok: true }; }));

// ---------- messaging ----------
adminRouter.get('/templates', requirePerm('templates.manage', 'messages.read'), h(() => ({
  templates: all('SELECT * FROM template ORDER BY key, channel'),
  mergeFields: ['name', 'ref', 'committee', 'portfolio', 'amount', 'due_date', 'payment_link', 'portal_link', 'upload_link', 'referral_name', 'event_name', 'event_dates', 'venue', 'dress_code', 'reporting_time', 'guide_link', 'reason', 'waitlist_position', 'institution'],
})));
adminRouter.put('/templates/:key/:channel', requirePerm('templates.manage'), h((req) => {
  const before = one('SELECT * FROM template WHERE key = ? AND channel = ?', P(req).key, P(req).channel);
  const { subject, body, active } = req.body ?? {};
  if (!subject || !body) throw bad('Subject and body are required');
  run('INSERT INTO template (key, channel, subject, body, active, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(key, channel) DO UPDATE SET subject = excluded.subject, body = excluded.body, active = excluded.active, updated_at = excluded.updated_at',
    P(req).key, P(req).channel, subject, body, active === false ? 0 : 1, now());
  audit('template.update', 'template', `${P(req).key}:${P(req).channel}`, before, { subject, body, active });
  return { ok: true };
}));
adminRouter.post('/templates/:key/preview', requirePerm('templates.manage', 'messages.send'), h((req) => {
  const reg = req.body?.registration_id ? one('SELECT * FROM registration WHERE id = ?', req.body.registration_id) : one('SELECT * FROM registration WHERE erased_at IS NULL ORDER BY created_at DESC LIMIT 1');
  const vars = reg ? regVars(reg) : { name: 'Aarav Sharma', committee: 'UNSC', portfolio: 'France', amount: '₹2,360', event_name: 'Sample MUN' };
  const subject = req.body?.subject ?? one('SELECT subject FROM template WHERE key = ?', P(req).key)?.subject ?? '';
  const body = req.body?.body ?? one('SELECT body FROM template WHERE key = ?', P(req).key)?.body ?? '';
  return { subject: render(subject, vars), body: render(body, vars) };
}));
adminRouter.post('/templates/:key/test', requirePerm('templates.manage'), h((req) => {
  const to = req.body?.to ?? req.auth!.user.email;
  if (!isEmail(to)) throw bad('Enter an email address');
  const reg = one('SELECT * FROM registration WHERE erased_at IS NULL ORDER BY created_at DESC LIMIT 1');
  enqueue(P(req).key, { to, recipientKind: 'staff', vars: reg ? regVars(reg) : { name: 'Test' } });
  return { ok: true };
}));
adminRouter.get('/notifications', requirePerm('messages.read'), h((req) => {
  const w: string[] = []; const p: any[] = [];
  if (req.query.status) { w.push('status = ?'); p.push(req.query.status); }
  if (req.query.q) { w.push('(recipient LIKE ? OR subject LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  return all(`SELECT * FROM notification ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 500`, ...p);
}));
adminRouter.post('/notifications/:id/retry', requirePerm('messages.send'), h((req) => { run("UPDATE notification SET status = 'queued', scheduled_at = ?, attempts = 0 WHERE id = ?", now(), P(req).id); return { ok: true }; }));
/** Bulk send to a filtered list, e.g. "all unpaid delegates in committee X". */
adminRouter.post('/events/:id/bulk-message', requirePerm('messages.send'), h((req) => {
  const b = req.body ?? {};
  const out = runList(b.list ?? 'master', P(req).id, { q: b.q, filters: b.filters ?? {}, committeeId: b.committee }, null);
  const regs = out.rows.filter((r) => r.id && r.email);
  if (regs.length > orgSettings().bulkMessageCap) throw conflict(`That would send ${regs.length} messages; the cap is ${orgSettings().bulkMessageCap}`);
  if (b.dryRun) return { recipients: regs.length };
  for (const r of regs) { const full = one('SELECT * FROM registration WHERE id = ?', r.id); if (full) enqueue(b.template, { to: full.email, registrationId: full.id, vars: regVars(full), quiet: true }); }
  audit('bulk.message', 'event', P(req).id, undefined, { template: b.template, recipients: regs.length, filters: b.filters });
  return { queued: regs.length };
}));

// ---------- users & roles ----------
adminRouter.get('/users', requirePerm('users.manage'), h(() => ({
  users: all('SELECT id, name, email, active, totp_enabled, created_at FROM user ORDER BY name').map((u) => ({ ...u, roles: all('SELECT ur.*, c.name AS committee FROM user_role ur LEFT JOIN committee c ON c.id = ur.committee_id WHERE ur.user_id = ?', u.id) })),
  roles: ROLES.map((r) => ({ role: r, label: ROLE_LABELS[r], mfa: MFA_ROLES.includes(r) })),
  permissions: permissionMatrix(),
})));
adminRouter.post('/users', requirePerm('users.manage'), h((req) => {
  const b = req.body ?? {};
  if ((b.roles ?? []).some((r: any) => r.role === 'superadmin') && !req.auth!.roleNames.includes('superadmin')) throw forbidden('Only a super admin can create super admins');
  const temp = b.password || token(9);
  const id = createUser({ name: b.name, email: b.email, password: temp, roles: b.roles ?? [] });
  return { id, temporaryPassword: b.password ? undefined : temp };
}));
adminRouter.patch('/users/:id', requirePerm('users.manage'), h((req) => {
  const u = one('SELECT * FROM user WHERE id = ?', P(req).id);
  if (!u) throw notFound('User');
  const patch: any = {};
  if (req.body?.name) patch.name = req.body.name;
  if (req.body?.active !== undefined) patch.active = req.body.active ? 1 : 0;
  update('user', u.id, patch);
  if (patch.active === 0) run('DELETE FROM session WHERE user_id = ?', u.id);
  audit('user.update', 'user', u.id, { name: u.name, active: u.active }, patch);
  return { ok: true };
}));
adminRouter.post('/users/:id/roles', requirePerm('users.manage'), h((req) => {
  if (req.body?.role === 'superadmin' && !req.auth!.roleNames.includes('superadmin')) throw forbidden();
  setRole(P(req).id, req.body);
  audit('user.role_add', 'user', P(req).id, undefined, req.body);
  return { ok: true };
}));
adminRouter.delete('/users/:id/roles/:roleId', requirePerm('users.manage'), h((req) => {
  const r = one('SELECT * FROM user_role WHERE id = ? AND user_id = ?', P(req).roleId, P(req).id);
  if (!r) throw notFound('Role');
  run('DELETE FROM user_role WHERE id = ?', r.id);
  audit('user.role_remove', 'user', P(req).id, r, undefined);
  return { ok: true };
}));
adminRouter.post('/users/:id/reset-mfa', requirePerm('users.manage'), h((req) => {
  run('UPDATE user SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', P(req).id);
  run('DELETE FROM session WHERE user_id = ?', P(req).id);
  audit('user.mfa_reset', 'user', P(req).id);
  return { ok: true };
}));
adminRouter.post('/users/:id/reset-password', requirePerm('users.manage'), h((req) => {
  const temp = token(9);
  run('UPDATE user SET password_hash = ? WHERE id = ?', hashPassword(temp), P(req).id);
  run('DELETE FROM session WHERE user_id = ?', P(req).id);
  audit('user.password_reset', 'user', P(req).id);
  return { temporaryPassword: temp };
}));
adminRouter.get('/login-log', requirePerm('audit.read'), h(() => all('SELECT * FROM login_log ORDER BY at DESC LIMIT 300')));

// ---------- audit trail ----------
adminRouter.get('/audit', requirePerm('audit.read'), h((req) => {
  const w: string[] = []; const p: any[] = [];
  for (const k of ['entity', 'entity_id', 'user_id', 'action']) if (req.query[k]) { w.push(`${k} ${k === 'action' ? 'LIKE' : '='} ?`); p.push(k === 'action' ? `${req.query[k]}%` : req.query[k]); }
  if (req.query.from) { w.push('at >= ?'); p.push(req.query.from); }
  if (req.query.to) { w.push('at <= ?'); p.push(`${req.query.to}T23:59:59Z`); }
  if (req.query.q) { w.push('(before LIKE ? OR after LIKE ? OR user_label LIKE ?)'); p.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const limit = Math.min(1000, Number(req.query.limit ?? 200));
  const before = req.query.before ? Number(req.query.before) : null;
  if (before) { w.push('id < ?'); p.push(before); }
  const rows = all(`SELECT * FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limit}`, ...p);
  return { rows, total: scalar('SELECT COUNT(*) FROM audit_log') };
}));
adminRouter.get('/audit/export', requirePerm('audit.read'), h((req, res) => {
  const rows = all('SELECT * FROM audit_log ORDER BY id');
  logExport('audit_log', 'csv', rows.length);
  res.type('text/csv').setHeader('content-disposition', `attachment; filename="audit-trail-${istDate()}.csv"`);
  res.send(toCsv(['id', 'at', 'user_label', 'ip', 'action', 'entity', 'entity_id', 'before', 'after'].map((k) => ({ key: k, label: k })), rows, exportMeta({ list: 'Audit trail' })));
}));

// ---------- imports ----------
const pending = new Map<string, { kind: string; eventId: string; filename: string; rows: string[][]; at: number }>();
adminRouter.get('/imports/kinds', h(() => Object.entries(KINDS).map(([k, v]) => ({ key: k, title: v.title, fields: v.fields }))));
function importPerm(req: express.Request, kind: string) {
  const fin = ['bank', 'settlement', 'expenses', 'vendors', 'opening'].includes(kind);
  const perm = fin ? 'finance.import' : kind === 'referrers' ? 'referrer.manage' : kind === 'portfolios' ? 'alloc.config' : 'import.registrations';
  if (!can(req.auth!.roleNames, perm)) throw forbidden();
}
adminRouter.post('/imports/parse', upload.single('file'), h(async (req) => {
  const kind = String(req.body?.kind ?? '');
  importPerm(req, kind);
  if (!req.file) throw bad('Choose a file');
  const rows = await parseFile(req.file.buffer, req.file.originalname);
  if (rows.length < 2) throw bad('The file has no data rows');
  const id = uid();
  pending.set(id, { kind, eventId: req.body.event_id, filename: req.file.originalname, rows, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 3600_000) pending.delete(k);
  return { fileId: id, headers: rows[0], sample: rows.slice(1, 6), rows: rows.length - 1, mapping: suggestMapping(kind, rows[0]), fields: KINDS[kind].fields };
}));
adminRouter.post('/imports/preview', h((req) => {
  const f = pending.get(req.body?.fileId);
  if (!f) throw bad('Upload the file again (it expired)');
  importPerm(req, f.kind);
  return preview(f.kind, f.eventId, f.rows, req.body.mapping ?? {});
}));
adminRouter.post('/imports/commit', h((req) => {
  const f = pending.get(req.body?.fileId);
  if (!f) throw bad('Upload the file again (it expired)');
  importPerm(req, f.kind);
  const out = commit(f.kind, f.eventId, f.filename, f.rows, req.body.mapping ?? {}, { date: req.body.date });
  pending.delete(req.body.fileId);
  return out;
}));
adminRouter.get('/imports', h(() => all('SELECT b.*, u.name AS by_name FROM import_batch b LEFT JOIN user u ON u.id = b.created_by ORDER BY b.created_at DESC LIMIT 200').map((b) => ({ ...b, errors: undefined, note: json<any>(b.mapping, {}).note }))));
adminRouter.get('/imports/:id/errors.csv', h((req, res) => { res.type('text/csv').setHeader('content-disposition', `attachment; filename="import-errors-${P(req).id.slice(0, 8)}.csv"`); res.send(errorFile(P(req).id)); }));
adminRouter.post('/imports/:id/rollback', h((req) => {
  const b = one('SELECT kind FROM import_batch WHERE id = ?', P(req).id);
  if (!b) throw notFound('Import');
  importPerm(req, b.kind);
  rollback(P(req).id);
  return { ok: true };
}));
