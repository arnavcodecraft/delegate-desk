/**
 * Organiser screens added for the conference platform: the dashboard, conference page, publishing,
 * Financials set-up, committee editor, application review, Job Board, position papers and live sessions.
 */
import express from 'express';
import { all, one, insert, update, tx } from '../db.ts';
import { experiencePoints } from '../services/allocation.ts';
import { audit } from '../audit.ts';
import { requirePerm, requireUser, committeeScope, can } from '../auth.ts';
import { bad, forbidden, notFound, now, uid } from '../util.ts';
import { eventSettings, getEvent, saveEventSettings } from '../settings.ts';
import { h, upload, P } from './public.ts';
import {
  overview, setPublished, saveProfile, saveApplications, setFees, savePaymentMethods, saveMedia, mediaUrl, addCommittee, updateCommittee,
  deleteCommittee, committeeDetail, syncListing, publicLink, registrationLink,
} from '../services/conference.ts';
import {
  scoreApplicant, assignApplicant, autoAssign, declineApplicant, savePosition, deletePosition, positions, roleApplications, decideRoleApplication,
  papers, reviewPaper,
} from '../services/applications.ts';
import { receive } from '../services/payments.ts';
import { createSession, sessionsFor, sessionRow, rotateChairKey, sessionMarks } from '../services/live.ts';
import { currentWorkspace } from '../platform.ts';
import { checkUpload } from '../services/scanner.ts';
import { removeMessage, reports as chatReports, resolveReport } from '../services/chat.ts';
import { socialOverview, addPost, updatePost, removePost, campaignTag } from '../services/social.ts';

export const organiserRouter = express.Router();
organiserRouter.use(requireUser);

// ---------- dashboard, publishing, conference page ----------
organiserRouter.get('/events/:id/overview', requirePerm('reg.read', 'event.config', 'dashboard.read'), h((req) => overview(P(req).id)));
organiserRouter.post('/events/:id/publish', requirePerm('event.config'), h((req) => ({ status: setPublished(P(req).id, !!req.body?.on) })));
organiserRouter.get('/events/:id/profile', requirePerm('event.config', 'reg.read'), h((req) => {
  const ev = getEvent(P(req).id); const s = eventSettings(ev);
  return { event: ev, profile: s.profile, logoUrl: mediaUrl(s.profile.logo), bannerUrl: s.profile.banner && !/^p[1-6]$/.test(s.profile.banner) ? mediaUrl(s.profile.banner) : null, links: { page: publicLink(ev.code), register: registrationLink(ev.code) } };
}));
organiserRouter.put('/events/:id/profile', requirePerm('event.config'), h((req) => saveProfile(P(req).id, req.body ?? {})));
organiserRouter.post('/events/:id/media', requirePerm('event.config', 'settings.finance'), upload.single('file'), h(async (req) => {
  if (!req.file) throw bad('Choose a file');
  await checkUpload(req.file.buffer);
  const name = saveMedia(req.file.buffer, req.body?.kind === 'guide' ? ['pdf', 'image'] : ['image']);
  audit('media.upload', 'event', P(req).id, undefined, { kind: req.body?.kind, name });
  return { name, url: mediaUrl(name) };
}));
organiserRouter.get('/events/:id/applications-settings', requirePerm('event.config', 'reg.read'), h((req) => {
  const s = eventSettings(P(req).id);
  return { roles: s.roles, applicationDeadline: s.applicationDeadline, allocationMode: s.allocationMode, positionPapers: s.positionPapers, status: getEvent(P(req).id).status };
}));
organiserRouter.put('/events/:id/applications-settings', requirePerm('event.config'), h((req) => saveApplications(P(req).id, req.body ?? {})));

// ---------- Financials set-up ----------
organiserRouter.get('/events/:id/financials', requirePerm('event.config', 'settings.finance', 'payments.read'), h((req) => {
  const s = eventSettings(P(req).id);
  const m = s.paymentMethods;
  return {
    free: s.free, gstEnabled: s.gstEnabled, gstRateBp: s.gstRateBp,
    tiers: all('SELECT * FROM fee_tier WHERE event_id = ? AND active = 1 ORDER BY category, sort', P(req).id),
    methods: { ...m, qr: { ...m.qr, imageUrl: mediaUrl(m.qr.image) } },
    ownGateways: !currentWorkspace().tag,
  };
}));
organiserRouter.put('/events/:id/financials', requirePerm('event.config', 'settings.finance'), h((req) => {
  const b = req.body ?? {};
  tx(() => {
    if (b.fees) setFees(P(req).id, b.fees);
    if (b.methods) savePaymentMethods(P(req).id, b.methods);
  });
  syncListing(P(req).id);
  return { ok: true };
}));
/** In-person (cash) payments: the organiser records them; they post to petty cash like any receipt. */
organiserRouter.post('/registrations/:id/cash', requirePerm('payments.approve'), h((req) => {
  const reg = one('SELECT * FROM registration WHERE id = ?', P(req).id);
  if (!reg) throw notFound('Registration');
  const amount = Math.round(Number(req.body?.amount_paise));
  if (!(amount > 0)) throw bad('Enter the amount received');
  const note = String(req.body?.note ?? '').trim();
  return tx(() => {
    const txnId = uid();
    insert('payment_transaction', { id: txnId, order_id: null, registration_id: reg.id, gateway: 'cash', gateway_payment_id: note || null, amount_paise: amount, status: 'approved', method: 'in person', verified_by: 'cfo', raw: JSON.stringify({ note }), created_at: now() });
    const r = receive(reg.id, amount, { debitAccount: 'cash', sourceType: 'payment', sourceId: txnId, label: `in person${note ? `: ${note}` : ''}` });
    audit('payment.cash', 'registration', reg.id, undefined, { amount, note });
    return r;
  });
}));

// ---------- committees (editor with presets) ----------
organiserRouter.post('/events/:id/committees/full', requirePerm('alloc.config'), h((req) => { const id = addCommittee(P(req).id, req.body ?? {}); syncListing(P(req).id); return committeeDetail(id); }));
organiserRouter.get('/committees/:id/detail', requirePerm('reg.read', 'alloc.config', 'lists.read'), h((req) => committeeDetail(P(req).id)));
organiserRouter.put('/committees/:id/full', requirePerm('alloc.config'), h((req) => { updateCommittee(P(req).id, req.body ?? {}); const c = committeeDetail(P(req).id); syncListing(c.event_id); return c; }));
organiserRouter.delete('/committees/:id', requirePerm('alloc.config'), h((req) => { const c = one('SELECT event_id FROM committee WHERE id = ?', P(req).id); deleteCommittee(P(req).id); if (c) syncListing(c.event_id); return { ok: true }; }));
organiserRouter.post('/committees/:id/guide', requirePerm('alloc.config'), upload.single('file'), h(async (req) => {
  const c = one('SELECT * FROM committee WHERE id = ?', P(req).id);
  if (!c) throw notFound('Committee');
  let url: string | null = null;
  if (req.file) { await checkUpload(req.file.buffer); url = mediaUrl(saveMedia(req.file.buffer, ['pdf'])); }
  else if (req.body?.url) { if (!/^https?:\/\/\S+$/.test(String(req.body.url))) throw bad('Enter a full link starting with https://'); url = String(req.body.url); }
  update('committee', c.id, { guide_url: url });
  audit('committee.guide', 'committee', c.id, { guide_url: c.guide_url }, { guide_url: url });
  syncListing(c.event_id);
  return { guide_url: url };
}));

// ---------- delegate applications (review mode) ----------
organiserRouter.get('/events/:id/applicants', requirePerm('reg.read'), h((req) => {
  const status = String(req.query.status ?? 'applied');
  const where = status === 'applied' ? "r.allot_status = 'applied'" : status === 'assigned' ? "r.allot_status IN ('held','confirmed')" : status === 'declined' ? 'r.cancelled_at IS NOT NULL' : '1=1';
  return all(`SELECT r.id, r.ref, r.full_name, r.email, r.mobile, r.institution, r.class_year, r.city, r.experience, r.mun_count, r.other_events, r.awards_count, r.preferences, r.portfolio_prefs, r.motivation, r.review_score, r.review_note,
      r.allot_status, r.payment_status, r.channel, r.created_at, r.cancelled_at, c.name AS committee, p.name AS portfolio
    FROM registration r LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio p ON p.id = s.portfolio_id LEFT JOIN committee c ON c.id = p.committee_id
    WHERE r.event_id = ? AND r.erased_at IS NULL AND ${status === 'declined' ? '1=1' : 'r.cancelled_at IS NULL'} AND ${where}
    ORDER BY COALESCE(r.review_score, 0) DESC, r.created_at`, P(req).id).map((r) => {
      const chosen = JSON.parse(r.portfolio_prefs || '{}') as Record<string, string>;
      const names = Object.fromEntries(Object.entries(chosen).map(([c, pid]) => [c, one('SELECT name FROM portfolio WHERE id = ?', pid)?.name ?? null]));
      return { ...r, preferences: JSON.parse(r.preferences || '[]'), portfolio_prefs: names, points: experiencePoints(r) };
    });
}));
organiserRouter.post('/registrations/:id/score', requirePerm('reg.edit'), h((req) => { scoreApplicant(P(req).id, req.body?.score == null || req.body.score === '' ? null : Number(req.body.score), req.body?.note); return { ok: true }; }));
organiserRouter.post('/registrations/:id/assign', requirePerm('alloc.move'), h((req) => assignApplicant(P(req).id, String(req.body?.seat_id ?? ''), req.auth!.roleNames)));
organiserRouter.post('/events/:id/auto-assign', requirePerm('alloc.move'), h((req) => autoAssign(P(req).id, Array.isArray(req.body?.ids) ? req.body.ids : undefined)));
organiserRouter.post('/registrations/:id/decline', requirePerm('reg.cancel'), h((req) => { declineApplicant(P(req).id, String(req.body?.note ?? '')); return { ok: true }; }));

// ---------- Job Board and role applications ----------
organiserRouter.get('/events/:id/positions', requirePerm('reg.read', 'event.config'), h((req) => positions(P(req).id)));
organiserRouter.post('/events/:id/positions', requirePerm('event.config'), h((req) => ({ id: savePosition(P(req).id, req.body ?? {}) })));
organiserRouter.put('/positions/:id', requirePerm('event.config'), h((req) => {
  const p = one('SELECT event_id FROM position WHERE id = ?', P(req).id);
  if (!p) throw notFound('Position');
  return { id: savePosition(p.event_id, req.body ?? {}, P(req).id) };
}));
organiserRouter.delete('/positions/:id', requirePerm('event.config'), h((req) => deletePosition(P(req).id)));
organiserRouter.get('/events/:id/role-applications', requirePerm('reg.read'), h((req) => roleApplications(P(req).id, req.query.role ? String(req.query.role) : undefined)));
organiserRouter.post('/role-applications/:id/decide', requirePerm('reg.edit'), h((req) => {
  if (req.body?.createAccount && !can(req.auth!.roleNames, 'users.manage')) throw forbidden('Only admins can create staff accounts');
  return decideRoleApplication(P(req).id, { ...req.body, score: req.body?.score == null || req.body.score === '' ? null : Number(req.body.score) });
}));

// ---------- position papers ----------
organiserRouter.get('/events/:id/papers', requirePerm('lists.read', 'reg.read'), h((req) => papers(P(req).id, committeeScope(req))));
organiserRouter.post('/papers/:id/review', requirePerm('lists.read', 'reg.read'), h((req) => { reviewPaper(P(req).id, { ...req.body, score: req.body?.score == null || req.body.score === '' ? null : Number(req.body.score) }, committeeScope(req)); return { ok: true }; }));

// ---------- live sessions for this conference's committees ----------
function mayRunCommittee(req: express.Request, committeeId: string) {
  const scope = committeeScope(req);
  if (scope && !scope.includes(committeeId)) throw forbidden('You can only run your own committee');
  if (!scope && !can(req.auth!.roleNames, 'alloc.config') && !can(req.auth!.roleNames, 'attendance.mark')) throw forbidden();
}
organiserRouter.get('/events/:id/live', requirePerm('lists.read', 'attendance.mark'), h((req) => {
  const scope = committeeScope(req);
  const committees = all('SELECT id, name, short FROM committee WHERE event_id = ? ORDER BY sort, name', P(req).id).filter((c) => !scope || scope.includes(c.id));
  const sessions = sessionsFor(currentWorkspace().id, P(req).id).filter((s) => !scope || scope.includes(s.committee_id));
  return { committees, sessions };
}));
organiserRouter.post('/committees/:id/live', requirePerm('lists.read', 'attendance.mark'), h((req) => {
  const c = one('SELECT * FROM committee WHERE id = ?', P(req).id);
  if (!c) throw notFound('Committee');
  mayRunCommittee(req, c.id);
  // One delegation per portfolio, with the delegate's name when someone holds it.
  const delegates = all(`SELECT p.name, p.code, GROUP_CONCAT(r.full_name, ' & ') AS person FROM portfolio p LEFT JOIN seat s ON s.portfolio_id = p.id AND s.state <> 'open'
    LEFT JOIN registration r ON r.id = s.registration_id WHERE p.committee_id = ? GROUP BY p.id ORDER BY p.name`, c.id);
  if (!delegates.length) throw bad('Add portfolios to this committee first');
  const out = createSession({ name: c.name, short: c.short, delegates, workspaceId: currentWorkspace().id, eventId: c.event_id, committeeId: c.id, chairName: req.auth!.user.name });
  audit('live.create', 'committee', c.id, undefined, { code: out.code });
  return out;
}));
organiserRouter.post('/live/:code/open', requirePerm('lists.read', 'attendance.mark'), h((req) => {
  const row = sessionRow(P(req).code);
  if (row.workspace_id !== currentWorkspace().id) throw notFound('Session');
  mayRunCommittee(req, row.committee_id);
  return { code: row.code, chairKey: rotateChairKey(row.code, req.auth!.user.name) };
}));

/** Hand the EB's awards to the delegates holding those portfolios, so certificates print them. */
organiserRouter.post('/live/:code/awards', requirePerm('attendance.mark'), h((req) => {
  const { row, marksheet } = sessionMarks(P(req).code);
  if (row.workspace_id !== currentWorkspace().id || !row.committee_id) throw notFound('Session');
  mayRunCommittee(req, row.committee_id);
  if (!marksheet) throw bad('Turn on EB marking first');
  const holders = all(`SELECT r.id, r.award, p.name AS portfolio FROM portfolio p JOIN seat s ON s.portfolio_id = p.id JOIN registration r ON r.id = s.registration_id
    WHERE p.committee_id = ? AND r.cancelled_at IS NULL`, row.committee_id);
  const given: { portfolio: string; award: string; delegates: number }[] = [];
  tx(() => {
    for (const h of holders) {
      const r = marksheet.rows.find((x) => x.portfolio.toLowerCase() === String(h.portfolio).toLowerCase());
      const award = r?.award ?? null;
      if ((h.award ?? null) === award) continue;
      update('registration', h.id, { award });
      audit('award.set', 'registration', h.id, { award: h.award }, { award, from: 'eb_marking' });
    }
    for (const r of marksheet.rows.filter((x) => x.award)) given.push({ portfolio: r.portfolio, award: r.award!, delegates: holders.filter((h) => String(h.portfolio).toLowerCase() === r.portfolio.toLowerCase()).length });
  });
  return { given };
}));

// ---------- conference chat (moderation) ----------
// Reading and posting (with threads, reactions, polls and team channels) live in routes/teamspace.ts.
organiserRouter.post('/events/:id/chat/messages/:mid/remove', requirePerm('lists.read', 'messages.read'), h((req) => { removeMessage(P(req).id, P(req).mid, req.auth!.user.id, committeeScope(req)); audit('chat.remove', 'chat_message', P(req).mid); return { ok: true }; }));
organiserRouter.get('/events/:id/chat/reports', requirePerm('messages.read', 'event.config'), h((req) => { if (committeeScope(req)) throw forbidden(); return chatReports(P(req).id); }));
organiserRouter.post('/events/:id/chat/reports/:rid/resolve', requirePerm('messages.read', 'event.config'), h((req) => { if (committeeScope(req)) throw forbidden(); resolveReport(P(req).id, P(req).rid, req.auth!.user.id); return { ok: true }; }));
organiserRouter.post('/events/:id/chat/settings', requirePerm('event.config'), h((req) => {
  const cur = eventSettings(P(req).id).chat;
  const b = req.body ?? {};
  const next = { enabled: b.enabled !== undefined ? b.enabled !== false : cur.enabled, dms: b.dms !== undefined ? b.dms !== false : cur.dms, calls: b.calls !== undefined ? b.calls !== false : cur.calls !== false, dmCalls: b.dmCalls !== undefined ? !!b.dmCalls : !!cur.dmCalls };
  saveEventSettings(P(req).id, { chat: next });
  audit('chat.settings', 'event', P(req).id, undefined, next);
  return { ok: true };
}));

// ---------- social media dashboard ----------
organiserRouter.get('/events/:id/social', requirePerm('event.config', 'messages.read'), h((req) => socialOverview(P(req).id)));
organiserRouter.post('/events/:id/social/campaign', requirePerm('event.config', 'messages.read'), h((req) => ({ tag: campaignTag(String(req.body?.name ?? '')) })));
organiserRouter.post('/events/:id/social/posts', requirePerm('event.config', 'messages.read'), h((req) => addPost(P(req).id, req.body ?? {})));
organiserRouter.patch('/events/:id/social/posts/:pid', requirePerm('event.config', 'messages.read'), h((req) => { updatePost(P(req).id, P(req).pid, req.body ?? {}); return { ok: true }; }));
organiserRouter.delete('/events/:id/social/posts/:pid', requirePerm('event.config', 'messages.read'), h((req) => { removePost(P(req).id, P(req).pid); return { ok: true }; }));
