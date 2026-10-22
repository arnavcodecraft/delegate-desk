/**
 * Applications beyond the delegate form: delegate review (score, assign, decline), the Job Board
 * (chair, secretariat, staff, press and volunteer positions), faculty advisor and observer applications,
 * and position papers with chair feedback.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, one, run, insert, update, tx } from '../db.ts';
import { audit } from '../audit.ts';
import { config, uploadDir } from '../config.ts';
import { eventSettings, getEvent } from '../settings.ts';
import { bad, conflict, forbidden, isEmail, normMobile, notFound, now, token, uid, json } from '../util.ts';
import { allocate, moveToSeat, seatOf } from './allocation.ts';
import { enqueue } from './notify.ts';
import { regVars, cancelRegistration } from './payments.ts';
import { confirmFree, syncListing, normChannel } from './conference.ts';
import { createUser, setRole, type Role } from '../auth.ts';
import { sniff, signedFileUrl } from './evidence.ts';

export const POSITION_KINDS = ['chair', 'secretariat', 'staff', 'press', 'volunteer'] as const;
export const ROLE_LABELS: Record<string, string> = {
  chair: 'Chair / Executive Board', secretariat: 'Secretariat', staff: 'Organising staff', press: 'Press', volunteer: 'Volunteer',
  advisor: 'Faculty advisor', observer: 'Observer', delegate: 'Delegate',
};

// ---------- delegate review ----------
export function scoreApplicant(regId: string, score: number | null, note?: string | null) {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg) throw notFound('Application');
  if (score != null && (!Number.isInteger(score) || score < 1 || score > 10)) throw bad('Scores run from 1 to 10');
  update('registration', regId, { review_score: score, review_note: note?.trim() || null, updated_at: now() });
  audit('application.score', 'registration', regId, { score: reg.review_score }, { score, note });
}

/** After a seat is set: free conferences confirm at once; paid ones start the payment hold. */
function afterAssign(regId: string) {
  update('registration', regId, { accepted: 1, updated_at: now() });
  const reg = one('SELECT * FROM registration WHERE id = ?', regId)!;
  if (confirmFree(regId)) enqueue('seat_confirmed_free', { to: reg.email, registrationId: regId, vars: regVars(one('SELECT * FROM registration WHERE id = ?', regId)!) });
  else enqueue('seat_assigned', { to: reg.email, registrationId: regId, vars: regVars(reg) });
}

export function assignApplicant(regId: string, seatId: string, roles: string[]) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Application');
    if (reg.cancelled_at) throw conflict('This application was declined or cancelled');
    const wasApplied = reg.allot_status === 'applied';
    moveToSeat(regId, seatId, wasApplied ? 'Accepted on review' : 'Reassigned on review', roles);
    if (wasApplied) afterAssign(regId);
    audit('application.assign', 'registration', regId, { allot_status: reg.allot_status }, { seat: seatId });
    return seatOf(regId);
  });
}

/** Assign every pending application by its committee preferences, highest score first. */
export function autoAssign(eventId: string, regIds?: string[]) {
  const pending = all(`SELECT id FROM registration WHERE event_id = ? AND allot_status = 'applied' AND cancelled_at IS NULL
    ORDER BY COALESCE(review_score, 0) DESC, created_at`, eventId).map((r) => r.id).filter((id) => !regIds?.length || regIds.includes(id));
  let assigned = 0, full = 0;
  for (const id of pending) {
    tx(() => {
      run("UPDATE registration SET allot_status = 'none' WHERE id = ?", id);
      const res = allocate(id, { reason: 'Accepted on review (auto-assign)' });
      if (res.kind === 'seat') { afterAssign(id); assigned++; }
      else { run("UPDATE registration SET allot_status = 'applied', waitlist_position = NULL WHERE id = ?", id); full++; }
    });
  }
  audit('application.auto_assign', 'event', eventId, undefined, { assigned, full });
  return { assigned, full };
}

export function declineApplicant(regId: string, note: string) {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg) throw notFound('Application');
  cancelRegistration(regId, `Application declined${note ? `: ${note}` : ''}`);
  enqueue('role_application_rejected', { to: reg.email, registrationId: regId, vars: { name: reg.full_name, role: 'Delegate', event_name: getEvent(reg.event_id).name, note: note || '' } });
}

// ---------- Job Board positions ----------
export interface PositionInput { kind: string; title: string; committee_id?: string | null; description?: string | null; openings?: number; deadline?: string | null; open?: boolean }
export function savePosition(eventId: string, p: PositionInput, id?: string) {
  if (!(POSITION_KINDS as readonly string[]).includes(p.kind)) throw bad('Choose the type of role');
  const title = String(p.title ?? '').trim();
  if (title.length < 2) throw bad('Give the role a title, e.g. "Director, UNSC"');
  if (p.committee_id && !one('SELECT 1 FROM committee WHERE id = ? AND event_id = ?', p.committee_id, eventId)) throw bad('Pick a committee from this conference');
  const row = { kind: p.kind, title, committee_id: p.committee_id || null, description: String(p.description ?? '').trim().slice(0, 2000) || null,
    openings: Math.max(1, Math.min(50, Math.round(Number(p.openings ?? 1)))), deadline: p.deadline || null, open: p.open === false ? 0 : 1 };
  if (id) {
    const before = one('SELECT * FROM position WHERE id = ? AND event_id = ?', id, eventId);
    if (!before) throw notFound('Position');
    update('position', id, row);
    audit('position.update', 'position', id, before, row);
  } else {
    id = uid();
    insert('position', { id, event_id: eventId, ...row, sort: 0, created_at: now() });
    audit('position.create', 'position', id, undefined, row);
  }
  syncListing(eventId);
  return id;
}
export function deletePosition(id: string) {
  const p = one('SELECT * FROM position WHERE id = ?', id);
  if (!p) throw notFound('Position');
  if (one("SELECT 1 FROM role_application WHERE position_id = ?", id)) { update('position', id, { open: 0 }); syncListing(p.event_id); return { closed: true }; }
  run('DELETE FROM position WHERE id = ?', id);
  audit('position.delete', 'position', id, p);
  syncListing(p.event_id);
  return { deleted: true };
}
export function positions(eventId: string) {
  return all(`SELECT p.*, c.name AS committee, (SELECT COUNT(*) FROM role_application a WHERE a.position_id = p.id AND a.status <> 'withdrawn') AS applicants,
    (SELECT COUNT(*) FROM role_application a WHERE a.position_id = p.id AND a.status = 'accepted') AS filled
    FROM position p LEFT JOIN committee c ON c.id = p.committee_id WHERE p.event_id = ? ORDER BY p.open DESC, p.sort, p.created_at`, eventId);
}

// ---------- role applications ----------
export interface RoleApplicationInput {
  role?: string; position_id?: string | null; full_name: string; email: string; mobile?: string; institution?: string; city?: string;
  experience?: string; motivation?: string; committee_prefs?: string[]; answers?: Record<string, string>; channel?: string;
}
export function applyForRole(eventId: string, i: RoleApplicationInput, cv?: Buffer | null) {
  const ev = getEvent(eventId);
  const s = eventSettings(ev);
  if (ev.status !== 'open') throw conflict('This conference is not taking applications yet');
  let role = String(i.role ?? '');
  let position: any = null;
  if (i.position_id) {
    position = one('SELECT * FROM position WHERE id = ? AND event_id = ?', i.position_id, eventId);
    if (!position || !position.open) throw conflict('This position is no longer open');
    if (position.deadline && position.deadline < now()) throw conflict('The deadline for this position has passed');
    role = position.kind;
  } else if (role === 'advisor' || role === 'observer') {
    if (!s.roles[role]) throw conflict(`${ROLE_LABELS[role]} applications are not open`);
  } else if (role === 'chair') {
    if (!s.roles.chair) throw conflict('Chair applications are not open');
  } else throw bad('Choose a role to apply for');
  const errors: Record<string, string> = {};
  const name = String(i.full_name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) errors.full_name = 'Enter your full name';
  const email = String(i.email ?? '').trim().toLowerCase();
  if (!isEmail(email)) errors.email = 'Enter a valid email address';
  const mobile = i.mobile ? normMobile(i.mobile) : null;
  if (mobile && !/^(\+?\d{8,15})$/.test(mobile)) errors.mobile = 'Enter a valid mobile number';
  if (!String(i.institution ?? '').trim()) errors.institution = role === 'advisor' ? 'Enter your school or institution' : 'Enter your school, college or organisation';
  if (['chair', 'secretariat', 'press'].includes(role) && String(i.experience ?? '').trim().length < 20) errors.experience = 'Tell us about your MUN experience (a few lines)';
  if (Object.keys(errors).length) throw bad('Please fix the highlighted fields', { fields: errors });
  const dup = one("SELECT id FROM role_application WHERE event_id = ? AND email = ? AND role = ? AND COALESCE(position_id, '') = COALESCE(?, '') AND status IN ('submitted','shortlisted','accepted')", eventId, email, role, position?.id ?? null);
  if (dup) throw conflict('You have already applied for this role. We will email you when there is a decision.');
  const prefs = (i.committee_prefs ?? []).filter((c) => one('SELECT 1 FROM committee WHERE id = ? AND event_id = ?', c, eventId)).slice(0, 3);
  let cvPath: string | null = null;
  if (cv?.length) {
    if (sniff(cv) !== 'application/pdf') throw bad('Upload your CV as a PDF');
    if (cv.length > 5 * 1024 * 1024) throw bad('The CV must be 5 MB or smaller');
    cvPath = `cv/${uid()}.pdf`;
    fs.mkdirSync(path.join(uploadDir(), 'cv'), { recursive: true });
    fs.writeFileSync(path.join(uploadDir(), cvPath), cv, { mode: 0o600 });
  }
  const id = uid(); const tok = token(18);
  insert('role_application', {
    id, event_id: eventId, position_id: position?.id ?? null, role, full_name: name, email, mobile, institution: String(i.institution ?? '').trim(), city: String(i.city ?? '').trim() || null,
    experience: String(i.experience ?? '').trim().slice(0, 3000) || null, motivation: String(i.motivation ?? '').trim().slice(0, 3000) || null,
    answers: JSON.stringify(i.answers ?? {}), committee_prefs: JSON.stringify(prefs), cv_path: cvPath, status: 'submitted', token: tok,
    channel: i.channel ? normChannel(i.channel) : null, created_at: now(),
  });
  audit('role_application.create', 'role_application', id, undefined, { role, position: position?.title ?? null });
  enqueue('role_application_received', { to: email, vars: { name, role: position?.title ?? ROLE_LABELS[role], event_name: ev.name, status_link: `${config.baseUrl}/application/${tok}` } });
  return { id, token: tok };
}

export function roleApplicationView(tok: string) {
  const a = one(`SELECT a.*, p.title AS position_title, e.name AS event_name, e.code, c.name AS committee FROM role_application a JOIN event e ON e.id = a.event_id
    LEFT JOIN position p ON p.id = a.position_id LEFT JOIN committee c ON c.id = a.assigned_committee_id WHERE a.token = ?`, tok);
  if (!a) throw notFound('Application');
  return { role: a.position_title ?? ROLE_LABELS[a.role], status: a.status, full_name: a.full_name, event_name: a.event_name, code: a.code, created_at: a.created_at, decided_at: a.decided_at,
    assigned: a.status === 'accepted' ? { committee: a.committee, title: a.assigned_title } : null };
}
export function withdrawRoleApplication(tok: string) {
  const a = one('SELECT * FROM role_application WHERE token = ?', tok);
  if (!a) throw notFound('Application');
  if (!['submitted', 'shortlisted'].includes(a.status)) throw conflict('This application has already been decided');
  update('role_application', a.id, { status: 'withdrawn', decided_at: now() });
  audit('role_application.withdraw', 'role_application', a.id);
}

export function roleApplications(eventId: string, role?: string) {
  return all(`SELECT a.*, p.title AS position_title, c.name AS assigned_committee FROM role_application a LEFT JOIN position p ON p.id = a.position_id
    LEFT JOIN committee c ON c.id = a.assigned_committee_id WHERE a.event_id = ? ${role ? 'AND a.role = ?' : ''} ORDER BY a.created_at DESC`, ...(role ? [eventId, role] : [eventId]))
    .map((a) => ({ ...a, answers: json(a.answers, {}), committee_prefs: json<string[]>(a.committee_prefs, []), cv_url: a.cv_path ? signedFileUrl(a.cv_path) : null }));
}

/** Decide an application. Accepting a chair can create their staff account, scoped to their committee. */
export function decideRoleApplication(id: string, d: { status: string; score?: number | null; note?: string | null; committee_id?: string | null; title?: string | null; createAccount?: boolean }) {
  const a = one('SELECT * FROM role_application WHERE id = ?', id);
  if (!a) throw notFound('Application');
  if (!['submitted', 'shortlisted', 'accepted', 'rejected'].includes(d.status)) throw bad('Unknown status');
  if (a.status === 'withdrawn') throw conflict('The applicant withdrew this application');
  if (d.score != null && (!Number.isInteger(d.score) || d.score < 1 || d.score > 10)) throw bad('Scores run from 1 to 10');
  d = { ...d, committee_id: d.committee_id || null };   // an empty picker means "not chosen"
  if (d.committee_id && !one('SELECT 1 FROM committee WHERE id = ? AND event_id = ?', d.committee_id, a.event_id)) throw bad('Pick a committee from this conference');
  const ev = getEvent(a.event_id);
  const position = a.position_id ? one('SELECT * FROM position WHERE id = ?', a.position_id) : null;
  const committeeId = d.committee_id ?? position?.committee_id ?? null;
  const title = d.title?.trim() || position?.title || ROLE_LABELS[a.role];
  let account: { email: string; password?: string; existing: boolean } | null = null;
  tx(() => {
    update('role_application', id, { status: d.status, score: d.score ?? a.score, note: d.note?.trim() || a.note, assigned_committee_id: d.status === 'accepted' ? committeeId : a.assigned_committee_id,
      assigned_title: d.status === 'accepted' ? title : a.assigned_title, decided_at: ['accepted', 'rejected'].includes(d.status) ? now() : a.decided_at, decided_by: null });
    if (d.status === 'accepted' && a.status !== 'accepted') {
      if (a.role === 'chair' && committeeId) insert('executive_board', { id: uid(), event_id: a.event_id, committee_id: committeeId, name: a.full_name, position: title, email: a.email, phone: a.mobile });
      if (d.createAccount && a.role === 'chair') {
        if (!committeeId) throw bad('Pick the committee this chair will run');
        const existing = one('SELECT * FROM user WHERE email = ?', a.email);
        if (existing) { setRole(existing.id, { role: 'chair' as Role, committee_id: committeeId, event_id: a.event_id }); account = { email: a.email, existing: true }; }
        else {
          const password = crypto.randomBytes(9).toString('base64url') + 'a1';
          createUser({ name: a.full_name, email: a.email, password, roles: [{ role: 'chair' as Role, committee_id: committeeId, event_id: a.event_id }] });
          account = { email: a.email, password, existing: false };
          enqueue('staff_invite', { to: a.email, vars: { name: a.full_name, event_name: ev.name, role: title, login_link: `${config.baseUrl}/login`, password } });
        }
      }
    }
  });
  if (d.status !== a.status && d.status === 'accepted') {
    const committee = committeeId ? one('SELECT name FROM committee WHERE id = ?', committeeId)?.name : null;
    enqueue('role_application_accepted', { to: a.email, vars: { name: a.full_name, role: title, event_name: ev.name, assignment: committee ? `\n\nCommittee: ${committee}` : '', note: d.note ?? '', status_link: `${config.baseUrl}/application/${a.token}` } });
  }
  if (d.status !== a.status && d.status === 'rejected') enqueue('role_application_rejected', { to: a.email, vars: { name: a.full_name, role: position?.title ?? ROLE_LABELS[a.role], event_name: ev.name, note: d.note ?? '' } });
  audit('role_application.decide', 'role_application', id, { status: a.status }, { status: d.status, score: d.score, committee: committeeId });
  return { ok: true, account };
}

// ---------- position papers ----------
export function submitPaper(reg: Record<string, any>, file: { buffer: Buffer; originalname?: string }) {
  const s = eventSettings(reg.event_id);
  if (!s.positionPapers.enabled) throw conflict('This conference is not collecting position papers');
  if (s.positionPapers.deadline && s.positionPapers.deadline < now()) throw conflict('The position paper deadline has passed. Email the secretariat if you need an extension.');
  const seat = seatOf(reg.id);
  if (!seat) throw conflict('You can upload your position paper once you have a committee');
  if (sniff(file.buffer) !== 'application/pdf') throw bad('Upload your position paper as a PDF');
  if (file.buffer.length > 5 * 1024 * 1024) throw bad('The file must be 5 MB or smaller');
  const rel = `papers/${uid()}.pdf`;
  fs.mkdirSync(path.join(uploadDir(), 'papers'), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), rel), file.buffer, { mode: 0o600 });
  const id = uid();
  insert('position_paper', { id, registration_id: reg.id, committee_id: seat.committee_id, file_path: rel, file_name: String(file.originalname ?? 'position-paper.pdf').slice(0, 120), size: file.buffer.length, status: 'submitted', submitted_at: now() });
  audit('paper.submit', 'position_paper', id, undefined, { registration: reg.ref });
  return { id };
}
export function papersOf(regId: string) {
  return all('SELECT id, file_name, status, score, feedback, submitted_at, reviewed_at FROM position_paper WHERE registration_id = ? ORDER BY submitted_at DESC', regId);
}
export function papers(eventId: string, committeeIds: string[] | null) {
  return all(`SELECT pp.*, r.ref, r.full_name, r.institution, c.name AS committee, c.short, p.name AS portfolio FROM position_paper pp
      JOIN registration r ON r.id = pp.registration_id LEFT JOIN committee c ON c.id = pp.committee_id
      LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio p ON p.id = s.portfolio_id
    WHERE r.event_id = ? ${committeeIds ? `AND pp.committee_id IN (${committeeIds.map(() => '?').join(',') || "''"})` : ''}
      AND pp.id = (SELECT id FROM position_paper x WHERE x.registration_id = pp.registration_id ORDER BY submitted_at DESC LIMIT 1)
    ORDER BY c.sort, p.name`, eventId, ...(committeeIds ?? [])).map((x) => ({ ...x, url: signedFileUrl(x.file_path) }));
}
export function reviewPaper(id: string, d: { score?: number | null; feedback?: string; status: string }, committeeIds: string[] | null) {
  const pp = one('SELECT * FROM position_paper WHERE id = ?', id);
  if (!pp) throw notFound('Position paper');
  if (committeeIds && !committeeIds.includes(pp.committee_id)) throw forbidden('This paper is for another committee');
  if (!['reviewed', 'revise'].includes(d.status)) throw bad('Choose "Reviewed" or "Ask for a revision"');
  if (d.score != null && (!Number.isInteger(d.score) || d.score < 0 || d.score > 10)) throw bad('Scores run from 0 to 10');
  update('position_paper', id, { status: d.status, score: d.score ?? null, feedback: String(d.feedback ?? '').trim().slice(0, 3000) || null, reviewed_at: now() });
  audit('paper.review', 'position_paper', id, { status: pp.status }, { status: d.status, score: d.score });
  const reg = one('SELECT * FROM registration WHERE id = ?', pp.registration_id)!;
  const committee = one('SELECT name FROM committee WHERE id = ?', pp.committee_id)?.name ?? '';
  enqueue('position_paper_reviewed', { to: reg.email, registrationId: reg.id, vars: { ...regVars(reg), committee, score: d.score != null ? `${d.score}/10` : '—', feedback: d.feedback || '—',
    next_step: d.status === 'revise' ? 'Please upload a revised paper from your delegate page.' : 'No further action is needed.' } });
}
