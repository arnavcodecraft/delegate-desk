/**
 * Public platform API: Explore, conference pages, the Job Board, role applications,
 * "List your conference" (sign-up + onboarding launch) and live committee sessions.
 */
import express from 'express';
import { insert, all } from '../db.ts';
import { config } from '../config.ts';
import { createUser, rateLimit, startSession, can, type Role } from '../auth.ts';
import { bad, now, uid, isEmail, asSystem, ctxStore, notFound, json } from '../util.ts';
import { seedChart } from '../services/ledger.ts';
import { seedTemplates } from '../services/notify.ts';
import {
  listings, listingBySlug, positionListings, platformStats, workspaceForSlug, createWorkspace, inWorkspace, emailTaken, platformDb, currentWorkspace,
} from '../platform.ts';
import { launchConference, suggestCode, syncListing, trackView, normChannel, publicLink, registrationLink, acronymFrom, type Draft } from '../services/conference.ts';
import { applyForRole, roleApplicationView, withdrawRoleApplication } from '../services/applications.ts';
import { createSession, view, chairAction, endSession, claimSeat, releaseClaim, requestToSpeak, deviceBallot, exportMarks, MOTION_TYPES, P5 } from '../services/live.ts';
import { PRESETS } from '../services/marking.ts';
import { getEvent } from '../settings.ts';
import { h, upload, P } from './public.ts';

export const platformRouter = express.Router();

// ---------- Explore ----------
platformRouter.get('/stats', h(() => platformStats()));
platformRouter.get('/conferences', h((req) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const country = String(req.query.country ?? '').toLowerCase();
  const level = String(req.query.level ?? ''); const format = String(req.query.format ?? '');
  const fee = String(req.query.fee ?? ''); const when = String(req.query.when ?? 'upcoming');
  const today = new Date().toISOString().slice(0, 10);
  const rows = listings().filter((l) => {
    const d = l.data;
    if (q && ![l.name, l.acronym, l.city, d.organiser, ...(d.committees ?? []).map((c: any) => `${c.name} ${c.short}`)].join(' ').toLowerCase().includes(q)) return false;
    if (country && l.country !== country) return false;
    if (level && d.level !== level && d.level !== 'both') return false;
    if (format && d.format !== format && !(format !== 'online' && d.format === 'hybrid')) return false;
    if (fee === 'free' && !d.free) return false;
    if (fee === 'paid' && d.free) return false;
    if (when === 'upcoming' && l.end_date && l.end_date < today) return false;
    if (when === 'past' && !(l.end_date && l.end_date < today)) return false;
    if (when === 'tbd' && l.start_date) return false;
    return true;
  });
  const countries = [...new Set(listings().map((l) => l.country).filter(Boolean))];
  return { conferences: rows.map(card), countries };
}));
const card = (l: any) => ({
  slug: l.slug, code: l.code, name: l.name, acronym: l.acronym, country: l.country, city: l.city, start_date: l.start_date, end_date: l.end_date,
  logo: l.data.logo, banner: l.data.banner, format: l.data.format, level: l.data.level, free: l.data.free, feeFrom: l.data.feeFrom, organiser: l.data.organiser,
  committees: (l.data.committees ?? []).length, delegates: l.data.delegates, roles: l.data.roles, deadline: l.data.deadline, datesTbd: l.data.datesTbd,
});

platformRouter.get('/conferences/:slug', h((req) => {
  const found = workspaceForSlug(P(req).slug);
  if (!found) throw notFound('Conference');
  // Refresh from the organiser's workspace so seat counts and roles are current.
  inWorkspace(found.w, () => asSystem(() => syncListing(found.eventId)));
  const l = listingBySlug(P(req).slug)!;
  const preview = req.query.preview === '1';
  if (!l.published && !preview) throw notFound('Conference');
  if (!preview) inWorkspace(found.w, () => trackView(found.eventId, normChannel(req.query.src, String(req.headers.referer ?? ''))));
  const positions = inWorkspace(found.w, () => all(`SELECT p.id, p.kind, p.title, p.description, p.openings, p.deadline, c.name AS committee FROM position p LEFT JOIN committee c ON c.id = p.committee_id
    WHERE p.event_id = ? AND p.open = 1 AND (p.deadline IS NULL OR p.deadline >= ?) ORDER BY p.sort, p.created_at`, found.eventId, now()));
  return { ...card(l), ...l.data, published: !!l.published, positions, links: { page: publicLink(l.code), register: registrationLink(l.code) } };
}));

// ---------- Job Board ----------
platformRouter.get('/jobs', h((req) => {
  const kind = String(req.query.kind ?? ''); const q = String(req.query.q ?? '').toLowerCase();
  return positionListings().filter((p) => (!kind || p.kind === kind) && (!q || `${p.title} ${p.conference} ${p.committee ?? ''} ${p.city ?? ''}`.toLowerCase().includes(q)) && (!p.deadline || p.deadline >= now()));
}));

// ---------- role applications (chairs, secretariat, staff, press, volunteers, advisors, observers) ----------
platformRouter.post('/conferences/:slug/apply', upload.single('cv'), h((req) => {
  rateLimit(`roleapp:${req.ip}`, 10, 60 * 60_000);
  const found = workspaceForSlug(P(req).slug);
  if (!found) throw notFound('Conference');
  const b = req.body ?? {};
  const input = { ...b, committee_prefs: typeof b.committee_prefs === 'string' ? json(b.committee_prefs, []) : b.committee_prefs, answers: typeof b.answers === 'string' ? json(b.answers, {}) : b.answers };
  return inWorkspace(found.w, () => ctxStore.run({ userId: null, userLabel: `applicant <${b.email}>`, ip: req.ip }, () => applyForRole(found.eventId, input, req.file?.buffer ?? null)));
}));
platformRouter.get('/application/:token', h((req) => roleApplicationView(P(req).token)));
platformRouter.post('/application/:token/withdraw', h((req) => { withdrawRoleApplication(P(req).token); return { ok: true }; }));

// ---------- List your conference ----------
platformRouter.get('/check-code', h((req) => {
  const acronym = String(req.query.acronym ?? '') || acronymFrom(String(req.query.name ?? ''));
  return { code: suggestCode(acronym, String(req.query.start ?? '') || null) };
}));
platformRouter.get('/check-email', h((req) => ({ taken: emailTaken(String(req.query.email ?? '')) })));

/**
 * Creates the conference from the wizard. Signed-in organisers add it to their own workspace; new organisers
 * get a fresh workspace (own database, books and files) and are signed in as its admin.
 */
platformRouter.post('/launch', h((req, res) => {
  rateLimit(`launch:${req.ip}`, 10, 60 * 60_000);
  const draft = (req.body?.draft ?? {}) as Draft;
  if (req.auth) {
    if (!can(req.auth.roleNames, 'event.config')) throw bad('Your account cannot create conferences. Ask your admin.');
    const eventId = launchConference(draft);
    return result(eventId);
  }
  const a = req.body?.account ?? {};
  const name = String(a.name ?? '').trim(); const email = String(a.email ?? '').trim().toLowerCase();
  const organisation = String(a.organisation ?? '').trim() || String(draft.name ?? '').trim();
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = 'Enter your name';
  if (!isEmail(email)) errors.email = 'Enter a valid email';
  else if (emailTaken(email)) errors.email = 'This email already has an account. Sign in first, then create the conference.';
  if (String(a.password ?? '').length < 10) errors.password = 'Use at least 10 characters';
  if (Object.keys(errors).length) throw bad('Please fix the highlighted fields', { fields: errors });
  if (String(draft.name ?? '').trim().length < 3) throw bad('Enter the conference name');
  const w = createWorkspace(organisation, email);
  try {
    return inWorkspace(w, () => asSystem(() => {
      seedChart(); seedTemplates();
      const orgId = uid();
      insert('organization', { id: orgId, name: organisation, legal_name: organisation, entity_type: 'other', state_code: '29', grievance_contact: email, settings: '{}', created_at: now() });
      // A new organiser is usually one person, so the owner gets both the admin and CFO rights; they can add
      // team members with narrower roles later (Settings → Users & roles).
      const userId = createUser({ name, email, password: String(a.password), roles: [{ role: 'admin' as Role }, { role: 'cfo' as Role }] });
      const eventId = ctxStore.run({ userId, userLabel: `${name} <${email}>`, ip: req.ip, roles: ['admin', 'cfo'] }, () => launchConference({ ...draft, contactEmail: draft.contactEmail || email }));
      // The account was created moments ago in this same request, so this first session counts as verified;
      // two-factor set-up is asked for at the next sign-in.
      startSession(res, req, userId, true);
      return result(eventId);
    }));
  } catch (e) {
    // Undo the half-made workspace so the organiser can simply try again with the same email.
    const d = platformDb();
    for (const t of ['staff_email', 'event_code', 'listing', 'position_listing']) d.prepare(`DELETE FROM ${t} WHERE workspace_id = ?`).run(w.id);
    d.prepare("UPDATE workspace SET status = 'failed' WHERE id = ?").run(w.id);
    throw e;
  }
}));
function result(eventId: string) {
  const ev = getEvent(eventId);
  return { eventId, code: ev.code, slug: ev.code.toLowerCase(), name: ev.name, links: { page: publicLink(ev.code), register: registrationLink(ev.code), dashboard: `${config.baseUrl}/app/overview?event=${eventId}` }, workspace: currentWorkspace().id };
}

// ---------- live committee sessions ----------
export const liveRouter = express.Router();
const key = (req: express.Request) => String(req.headers['x-chair-key'] ?? '');
liveRouter.get('/meta', h(() => ({ motions: Object.entries(MOTION_TYPES).map(([k, v]) => ({ key: k, ...v })), p5: P5, presets: Object.entries(PRESETS).map(([k, v]) => ({ key: k, label: v.label })) })));
liveRouter.get('/:code/marksheet.xlsx', async (req, res, next) => {
  try {
    const { name, file } = await exportMarks(P(req).code, key(req));
    res.setHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('content-disposition', `attachment; filename="${name.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'committee'} marksheet.xlsx"`);
    res.setHeader('cache-control', 'no-store');
    res.end(file);
  } catch (e) { next(e); }
});
liveRouter.post('/', h((req) => {
  rateLimit(`live:${req.ip}`, 20, 60 * 60_000);
  const b = req.body ?? {};
  const delegates = (Array.isArray(b.delegates) ? b.delegates : []).slice(0, 400);
  return createSession({ name: String(b.name ?? ''), short: b.short, delegates });
}));
liveRouter.get('/:code', h((req) => view(P(req).code, { chairKey: key(req), since: Number(req.query.v ?? 0) || undefined })));
liveRouter.post('/:code/action', h((req) => chairAction(P(req).code, key(req), req.body ?? {})));
liveRouter.post('/:code/end', h((req) => { endSession(P(req).code, key(req)); return { ok: true }; }));
liveRouter.post('/:code/release', h((req) => { releaseClaim(P(req).code, key(req), String(req.body?.delegateId ?? '')); return { ok: true }; }));
liveRouter.post('/:code/claim', h((req) => { rateLimit(`claim:${req.ip}`, 30, 10 * 60_000); return claimSeat(P(req).code, String(req.body?.delegateId ?? '')); }));
liveRouter.post('/:code/request', h((req) => { requestToSpeak(P(req).code, String(req.body?.delegateId ?? ''), String(req.body?.seatToken ?? '')); return { ok: true }; }));
liveRouter.post('/:code/ballot', h((req) => { deviceBallot(P(req).code, String(req.body?.delegateId ?? ''), String(req.body?.seatToken ?? ''), req.body?.ballot); return { ok: true }; }));

