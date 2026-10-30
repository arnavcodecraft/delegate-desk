import { all, one, run, insert, tx, update } from '../db.ts';
import { audit, diff } from '../audit.ts';
import { config } from '../config.ts';
import { eventSettings, getEvent } from '../settings.ts';
import { addHours, ageOn, bad, bp, conflict, ctx, inr, isEmail, isIndianMobile, isIntlMobile, istDate, json, normMobile, now, token, uid, notFound } from '../util.ts';
import { quote } from './fees.ts';
import { allocate, seatOf, moveToSeat, experiencePoints, experienceBucket } from './allocation.ts';
import { matchReferral, isSelfReferral, ensureReferralEditable } from './referrals.ts';
import { enqueue, notifyStaff } from './notify.ts';
import { portalLink, regVars, requestRefund } from './payments.ts';
import { statement, reconcile } from './commission.ts';
import { balanceOf } from './fees.ts';
import { consumeOtpToken } from './otp.ts';
import { checkinCode } from './badges.ts';
import { confirmFree, normChannel } from './conference.ts';
import { assignApplicant } from './applications.ts';

export const CLASS_OPTIONS = ['8', '9', '10', '11', '12', 'UG 1st year', 'UG 2nd year', 'UG 3rd year', 'UG 4th year', 'PG', 'Graduate', 'Faculty / Advisor'];

export interface RegInput {
  full_name: string; email: string; mobile: string; institution: string; class_year: string; city: string;
  preferences: string[]; referral_name?: string | null; dob?: string | null; consent: boolean;
  category?: string; coupon?: string | null; experience?: string; guardian_name?: string | null; guardian_email?: string | null;
  whatsapp_consent?: boolean;
  otp_token?: string;
  channel?: string | null;      // where they heard about it (instagram, whatsapp ...)
  motivation?: string | null;   // review mode: why they want to attend
  mun_count?: number | string;  // MUNs attended
  other_events?: number | string; // debates, youth parliaments, Model G20 …
  awards_count?: number | string; // awards won at MUNs
  portfolio_prefs?: Record<string, string>; // committee id → preferred portfolio id (optional per committee)
}
const count = (v: unknown) => { const n = Math.floor(Number(v ?? 0)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 300) : -1; };

export function validate(eventId: string, i: RegInput) {
  const errors: Record<string, string> = {};
  const name = (i.full_name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) errors.full_name = 'Enter your full name as it should print on your badge';
  if (!isEmail((i.email ?? '').trim())) errors.email = 'Enter a valid email address';
  // Conferences outside India take international numbers (with country code); Indian ones need a 10-digit mobile.
  const country = eventSettings(eventId).profile.country || 'in';
  if (country === 'in' ? !isIndianMobile(i.mobile) && !isIntlMobile(i.mobile) : !isIntlMobile(i.mobile) && !isIndianMobile(i.mobile)) errors.mobile = country === 'in' ? 'Enter a 10-digit Indian mobile number' : 'Enter your mobile number with country code, e.g. +44 7700 900123';
  if (!(i.institution ?? '').trim()) errors.institution = 'Enter your school or college';
  if (!(i.class_year ?? '').trim()) errors.class_year = 'Choose your class or year';
  if (!(i.city ?? '').trim()) errors.city = 'Enter your city';
  if (!i.consent) errors.consent = 'Please accept the privacy notice and refund policy';
  const prefs = Array.isArray(i.preferences) ? i.preferences.slice(0, 3) : [];
  const valid = new Set(all('SELECT id FROM committee WHERE event_id = ?', eventId).map((c) => c.id));
  if (prefs.some((p) => !valid.has(p))) errors.preferences = 'Pick committees from the list';
  if (new Set(prefs).size !== prefs.length) errors.preferences = 'Pick each committee only once';
  const exp = { mun_count: count(i.mun_count), other_events: count(i.other_events), awards_count: count(i.awards_count) };
  if (exp.mun_count < 0) errors.mun_count = 'Enter how many MUNs you have attended (0 if this is your first)';
  if (exp.other_events < 0) errors.other_events = 'Enter a number (0 if none)';
  if (exp.awards_count < 0) errors.awards_count = 'Enter a number (0 if none)';
  // A preferred portfolio is optional per committee, and must belong to a committee the delegate picked.
  const portfolioPrefs: Record<string, string> = {};
  for (const [committeeId, portfolioId] of Object.entries(i.portfolio_prefs && typeof i.portfolio_prefs === 'object' ? i.portfolio_prefs : {})) {
    if (!portfolioId) continue;
    if (!prefs.includes(committeeId) || !one('SELECT 1 FROM portfolio WHERE id = ? AND committee_id = ?', String(portfolioId), committeeId)) { errors.preferences = 'Pick portfolios from the committees you chose'; continue; }
    portfolioPrefs[committeeId] = String(portfolioId);
  }
  let minor = false;
  if (i.dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.dob) || i.dob > istDate()) errors.dob = 'Enter a valid date of birth';
    else {
      minor = ageOn(i.dob, istDate()) < 18;
      if (minor) {
        if (!(i.guardian_name ?? '').trim()) errors.guardian_name = 'A parent, guardian or school contact is needed for delegates under 18';
        if (!isEmail(i.guardian_email ?? '')) errors.guardian_email = 'Enter the parent’s or school’s email for consent';
        else if ((i.guardian_email ?? '').trim().toLowerCase() === (i.email ?? '').trim().toLowerCase()) errors.guardian_email = 'The consent email must belong to a parent or school, not the delegate';
      }
    }
  } else errors.dob = 'Enter your date of birth';
  if (Object.keys(errors).length) throw bad('Please fix the highlighted fields', { fields: errors });
  return { name, prefs, minor, exp, portfolioPrefs };
}

function nextRef(eventId: string) {
  run('UPDATE event SET ref_seq = ref_seq + 1 WHERE id = ?', eventId);
  const e = one('SELECT code, ref_seq FROM event WHERE id = ?', eventId)!;
  return `${e.code}-R-${String(e.ref_seq).padStart(6, '0')}`;
}

export function findDuplicate(eventId: string, email: string, mobile: string) {
  return one("SELECT * FROM registration WHERE event_id = ? AND cancelled_at IS NULL AND (lower(email) = lower(?) OR mobile = ?) LIMIT 1", eventId, email.trim(), normMobile(mobile));
}

/**
 * The 30-second registration: validate, quote, save, allot a provisional seat, queue the emails — one transaction.
 */
export function register(eventId: string, i: RegInput, o: { source?: string; delegationId?: string | null; groupSize?: number; batchId?: string } = {}) {
  const ev = getEvent(eventId);
  if (ev.status !== 'open') throw conflict('Registration for this event is closed');
  const s0 = eventSettings(ev);
  // Staff can still add delegates from the desk or an import after the public form closes.
  if ((o.source ?? 'form') === 'form' || o.source === 'delegation') {
    if (!s0.roles.delegate) throw conflict('Delegate applications are not open yet');
    if (s0.applicationDeadline && s0.applicationDeadline < now()) throw conflict('The application deadline has passed');
  }
  const { name, prefs, minor, exp, portfolioPrefs } = validate(eventId, i);
  const dup = findDuplicate(eventId, i.email, i.mobile);
  if (dup) {
    enqueue('portal_link', { to: dup.email, registrationId: dup.id, vars: regVars(dup) });
    throw conflict('You are already registered with this email or mobile. We have emailed your delegate link again.', { duplicate: true });
  }
  // Optional mobile OTP: only for the public form (desk, delegation and import registrations are staff-entered).
  if (eventSettings(ev).requireMobileOtp && (o.source ?? 'form') === 'form') consumeOtpToken(eventId, i.mobile, i.otp_token);
  const category = i.category ?? (/faculty|advisor/i.test(i.class_year) ? 'advisor' : /UG|PG|Graduate/i.test(i.class_year) ? 'college' : 'school');
  const q0 = quote(eventId, { category, couponCode: i.coupon, groupSize: o.groupSize });
  const match = matchReferral(ev.org_id, i.referral_name);
  const s = eventSettings(ev);
  return tx(() => {
    const id = uid();
    insert('registration', {
      id, ref: nextRef(eventId), event_id: eventId, token: token(18),
      full_name: name, email: i.email.trim().toLowerCase(), mobile: normMobile(i.mobile), institution: i.institution.trim(), class_year: i.class_year.trim(), city: i.city.trim(),
      dob: i.dob ?? null, is_minor: minor ? 1 : 0, guardian_name: minor ? i.guardian_name?.trim() : null, guardian_email: minor ? i.guardian_email?.trim().toLowerCase() : null,
      guardian_consent: minor ? 'pending' : 'not_required', guardian_token: minor ? token(18) : null,
      preferences: JSON.stringify(prefs), portfolio_prefs: JSON.stringify(portfolioPrefs), ...exp,
      experience: experienceBucket(experiencePoints({ ...exp, experience: ['first', 'some', 'experienced'].includes(i.experience ?? '') ? i.experience : 'first' })), category,
      referral_name: i.referral_name?.trim() || null, referrer_id: match.referrerId, referral_state: match.state,
      referral_suggestions: match.suggestions.length ? JSON.stringify(match.suggestions) : null,
      self_referral: isSelfReferral(match.referrerId, i.email, i.mobile) ? 1 : 0,
      delegation_id: o.delegationId ?? null, fee_tier_id: q0.tierId, coupon_id: q0.couponId,
      base_paise: q0.basePaise, premium_paise: 0, discount_paise: q0.discountPaise, net_paise: q0.netPaise, gst_paise: q0.gstPaise, total_paise: q0.totalPaise,
      accepted: s.feeModel === 'two_stage' ? 0 : 1, whatsapp_consent: i.whatsapp_consent ? 1 : 0,
      consent_at: now(), source: o.source ?? 'form', import_batch_id: o.batchId ?? null, created_at: now(), updated_at: now(),
      channel: i.channel ? normChannel(i.channel) : null, motivation: i.motivation?.trim().slice(0, 1500) || null,
    });
    // Review mode: the team scores applications and assigns portfolios later; nothing is payable until then.
    const alloc: ReturnType<typeof allocate> = s.allocationMode === 'review' && (o.source ?? 'form') !== 'import'
      ? (update('registration', id, { allot_status: 'applied' }), { kind: 'waitlist', position: 0 } as any)
      : allocate(id);
    // High-demand portfolios can carry a premium; re-quote with it so the fee shown is exact.
    if (alloc.kind === 'seat' && alloc.pick.premiumPaise && s.premiumPricing) {
      const q = quote(eventId, { category, couponCode: i.coupon, groupSize: o.groupSize, premiumPaise: alloc.pick.premiumPaise });
      update('registration', id, { premium_paise: q.premiumPaise, discount_paise: q.discountPaise, net_paise: q.netPaise, gst_paise: q.gstPaise, total_paise: q.totalPaise });
    }
    if (q0.tierId) run('UPDATE fee_tier SET used = used + 1 WHERE id = ?', q0.tierId);
    if (q0.couponId) run('UPDATE coupon SET used = used + 1 WHERE id = ?', q0.couponId);
    const reg = one('SELECT * FROM registration WHERE id = ?', id)!;
    const vars = regVars(reg);
    if (reg.allot_status === 'applied') enqueue('application_received', { to: reg.email, registrationId: id, vars });
    else if (alloc.kind === 'seat' && confirmFree(id)) enqueue('seat_confirmed_free', { to: reg.email, registrationId: id, vars: regVars(one('SELECT * FROM registration WHERE id = ?', id)!) });
    else if (alloc.kind === 'seat') enqueue('registration_saved', { to: reg.email, registrationId: id, vars });
    else enqueue('waitlisted', { to: reg.email, registrationId: id, vars });
    if (minor) enqueue('guardian_consent', { to: reg.guardian_email, registrationId: id, recipientKind: 'guardian', vars: { ...vars, guardian_name: reg.guardian_name, consent_link: `${config.baseUrl}/consent/${reg.guardian_token}`, privacy_link: `${config.baseUrl}/privacy` } });
    if (reg.referrer_id && !reg.self_referral) notifyReferrer(reg.referrer_id, reg.full_name);
    if (match.state === 'unmatched') audit('referral.unmatched', 'registration', id, undefined, { typed: reg.referral_name, suggestions: match.suggestions });
    audit('registration.create', 'registration', id, undefined, { ref: reg.ref, source: reg.source, committee: vars.committee, portfolio: vars.portfolio, total: reg.total_paise });
    return { registration: reg, allocation: alloc };
  });
}

function notifyReferrer(referrerId: string, delegate: string) {
  const r = one('SELECT * FROM referrer WHERE id = ?', referrerId);
  if (!r?.email) return;
  const st = statement(referrerId);
  enqueue('referral_registered', {
    to: r.email, recipientKind: 'referrer',
    vars: { name: r.name, delegate, count: st.paidCount, slab: st.currentSlab?.label ?? 'first', next_slab: st.nextSlab ? ` ${st.nextSlab.needed} more paid registration(s) move you to the ${st.nextSlab.label} slab.` : '', statement_link: `${config.baseUrl}/referrer/${r.token}` },
  });
}

/** What a delegate sees on their own page. Never exposes other delegates. */
export function portalView(reg: Record<string, any>) {
  const ev = getEvent(reg.event_id);
  const s = eventSettings(ev);
  const seat = seatOf(reg.id);
  const evidence = all('SELECT id, utr, amount_paise, paid_on, status, reason, submitted_at, reviewed_at FROM payment_evidence WHERE registration_id = ? ORDER BY submitted_at DESC', reg.id);
  const invoices = all('SELECT id, number, kind, total_paise, issued_at FROM invoice WHERE registration_id = ? ORDER BY issued_at', reg.id);
  const refunds = all('SELECT id, amount_paise, status, reason, created_at FROM refund WHERE registration_id = ? ORDER BY created_at', reg.id);
  const committees = all('SELECT id, name, short FROM committee WHERE event_id = ? ORDER BY sort', reg.event_id);
  const detailsLocked = !!(s.detailsLockAt && s.detailsLockAt <= now());
  const papers = all('SELECT id, file_name, status, score, feedback, submitted_at, reviewed_at FROM position_paper WHERE registration_id = ? ORDER BY submitted_at DESC', reg.id);
  return {
    conference: { free: s.free, allocationMode: s.allocationMode, positionPapers: s.positionPapers, chat: s.chat, papers, logo: s.profile.logo ? `/api/public/media/${s.profile.logo}` : null, acronym: s.profile.acronym, slug: ev.code.toLowerCase() },
    event: { name: ev.name, code: ev.code, venue: ev.venue, city: ev.city, start_date: ev.start_date, end_date: ev.end_date, status: ev.status, dressCode: s.dressCode, reportingTime: s.reportingTime },
    registration: {
      ref: reg.ref, full_name: reg.full_name, email: reg.email, mobile: reg.mobile, institution: reg.institution, class_year: reg.class_year, city: reg.city,
      payment_status: reg.payment_status, allot_status: reg.allot_status, waitlist_position: reg.waitlist_position, hold_expires_at: reg.hold_expires_at,
      base_paise: reg.base_paise, premium_paise: reg.premium_paise, discount_paise: reg.discount_paise, net_paise: reg.net_paise, gst_paise: reg.gst_paise, total_paise: reg.total_paise,
      paid_paise: reg.paid_paise, refunded_paise: reg.refunded_paise, balance_paise: balanceOf(reg), accepted: !!reg.accepted,
      referral_name: reg.referral_name, referral_editable: reg.payment_status !== 'paid', is_minor: !!reg.is_minor, guardian_consent: reg.guardian_consent,
      dietary: reg.dietary, tshirt: reg.tshirt, emergency_name: reg.emergency_name, emergency_phone: reg.emergency_phone, id_proof_status: reg.id_proof_status,
      experience: reg.experience, preferences: json(reg.preferences, []), cancelled: !!reg.cancelled_at, whatsapp_consent: !!reg.whatsapp_consent,
      consent_withdrawn: !!reg.consent_withdrawn_at, email_bounced: !!reg.email_bounced, details_locked: detailsLocked,
    },
    seat: seat ? { committee: seat.committee, short: seat.short, portfolio: seat.portfolio, state: seat.state, guide_url: seat.state === 'confirmed' ? seat.guide_url : null } : null,
    evidence, invoices, refunds, committees,
    swap: one("SELECT * FROM swap_request WHERE registration_id = ? AND status = 'pending'", reg.id) ?? null,
    lastSwap: one("SELECT status, created_at FROM swap_request WHERE registration_id = ? AND status <> 'pending' ORDER BY created_at DESC LIMIT 1", reg.id) ?? null,
    changeOptions: seat && !reg.cancelled_at ? changeOptions(reg) : [],
    swapReasons: SWAP_REASONS,
    feeModel: s.feeModel, refundWindowDays: s.refundWindowDays,
    checkinCode: seat?.state === 'confirmed' ? checkinCode(reg.ref) : null,
  };
}

const PROFILE_FIELDS = ['dietary', 'tshirt', 'emergency_name', 'emergency_phone', 'experience', 'whatsapp_consent'] as const;
const CORE_FIELDS = ['full_name', 'institution', 'class_year', 'city', 'mobile', 'email'] as const;

/** Delegate edits their own details until the lock date; profile extras only after payment / guardian consent. */
export function delegateUpdate(reg: Record<string, any>, patch: Record<string, any>) {
  const s = eventSettings(reg.event_id);
  if (s.detailsLockAt && s.detailsLockAt <= now()) throw conflict('Details are locked for printing. Contact the secretariat for corrections.');
  const next: Record<string, any> = {};
  for (const k of CORE_FIELDS) if (patch[k] !== undefined && k !== 'email' && k !== 'mobile') next[k] = String(patch[k]).trim();
  if (patch.mobile !== undefined) { if (!isIndianMobile(patch.mobile)) throw bad('Enter a 10-digit Indian mobile number'); next.mobile = normMobile(patch.mobile); }
  const extras = PROFILE_FIELDS.filter((k) => patch[k] !== undefined);
  if (extras.length) {
    if (reg.is_minor && reg.guardian_consent !== 'verified') throw conflict('We need your parent’s or school’s consent before collecting more details. Ask them to use the link we emailed.');
    for (const k of extras) next[k] = k === 'whatsapp_consent' ? (patch[k] ? 1 : 0) : String(patch[k]).slice(0, 200);
  }
  if (patch.referral_name !== undefined) {
    ensureReferralEditable(reg, false);
    const ev = getEvent(reg.event_id);
    const m = matchReferral(ev.org_id, patch.referral_name);
    Object.assign(next, { referral_name: patch.referral_name?.trim() || null, referrer_id: m.referrerId, referral_state: m.state, referral_suggestions: m.suggestions.length ? JSON.stringify(m.suggestions) : null, self_referral: isSelfReferral(m.referrerId, reg.email, reg.mobile) ? 1 : 0 });
  }
  if (patch.preferences !== undefined && reg.allot_status === 'waitlisted') next.preferences = JSON.stringify((patch.preferences as string[]).slice(0, 3));
  const d = diff(reg, next);
  if (!d.changed) return reg;
  update('registration', reg.id, { ...next, updated_at: now() });
  audit('registration.self_update', 'registration', reg.id, d.before, d.after);
  return one('SELECT * FROM registration WHERE id = ?', reg.id)!;
}

/** Registration desk edits (fix typos, change email etc.). Admin-only for referral after payment. */
export function staffUpdate(regId: string, patch: Record<string, any>, isAdmin: boolean) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    const allowed = [...CORE_FIELDS, ...PROFILE_FIELDS, 'dob', 'guardian_name', 'guardian_email', 'id_proof_status', 'award', 'category'];
    const next: Record<string, any> = {};
    for (const k of allowed) if (patch[k] !== undefined) next[k] = patch[k];
    if (next.email !== undefined) { if (!isEmail(next.email)) throw bad('Invalid email'); next.email = String(next.email).trim().toLowerCase(); if (next.email !== reg.email) next.email_bounced = 0; }
    if (next.mobile !== undefined) { if (!isIndianMobile(next.mobile)) throw bad('Invalid mobile'); next.mobile = normMobile(next.mobile); }
    if (patch.referral_name !== undefined) {
      ensureReferralEditable(reg, isAdmin);
      const m = matchReferral(getEvent(reg.event_id).org_id, patch.referral_name);
      Object.assign(next, { referral_name: patch.referral_name || null, referrer_id: m.referrerId, referral_state: m.state, referral_suggestions: m.suggestions.length ? JSON.stringify(m.suggestions) : null });
    }
    const d = diff(reg, next);
    if (!d.changed) return reg;
    update('registration', regId, { ...next, updated_at: now() });
    audit('registration.update', 'registration', regId, d.before, d.after);
    if (patch.referral_name !== undefined) {
      if (reg.referrer_id) reconcile(reg.referrer_id);
      const after = one('SELECT referrer_id FROM registration WHERE id = ?', regId)!;
      if (after.referrer_id && after.referrer_id !== reg.referrer_id) reconcile(after.referrer_id);
    }
    return one('SELECT * FROM registration WHERE id = ?', regId)!;
  });
}

export function resendEmail(regId: string, kind: 'portal_link' | 'registration_saved' | 'payment_confirmed' | 'payment_reminder') {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg) throw notFound('Registration');
  const inv = kind === 'payment_confirmed' ? one("SELECT id FROM invoice WHERE registration_id = ? AND kind = 'invoice' ORDER BY issued_at DESC LIMIT 1", regId) : null;
  enqueue(kind, { to: reg.email, registrationId: regId, vars: regVars(reg), attachments: inv ? [{ kind: 'invoice', id: inv.id }] : [] });
  audit('email.resend', 'registration', regId, undefined, { kind });
}

export function giveGuardianConsent(tok: string, by: { name: string; relation: string }) {
  const reg = one('SELECT * FROM registration WHERE guardian_token = ?', tok);
  if (!reg) throw notFound('Consent request');
  if (!by.name?.trim()) throw bad('Enter your name');
  update('registration', reg.id, { guardian_consent: 'verified', updated_at: now() });
  audit('guardian.consent', 'registration', reg.id, { guardian_consent: reg.guardian_consent }, { guardian_consent: 'verified', by: by.name, relation: by.relation, at: now(), ip: ctx().ip });
  return reg;
}

export function withdrawConsent(reg: Record<string, any>) {
  update('registration', reg.id, { consent_withdrawn_at: now(), whatsapp_consent: 0, unsubscribed: 1 });
  insert('erasure_request', { id: uid(), registration_id: reg.id, status: 'pending', requested_at: now(), note: 'Consent withdrawn by delegate' });
  audit('consent.withdraw', 'registration', reg.id);
  notifyStaff(['admin'], 'staff_alert', { title: 'Consent withdrawn', message: `${reg.ref} withdrew consent. Review the erasure request.` }, reg.event_id);
}

/**
 * Erase personal data while respecting the 8-year retention of books: if money moved, keep the name, ref and
 * amounts needed for invoices and the ledger; wipe everything else.
 */
export function eraseRegistration(regId: string) {
  return tx(() => {
    const reg = one('SELECT * FROM registration WHERE id = ?', regId);
    if (!reg) throw notFound('Registration');
    if (reg.paid_paise - reg.refunded_paise > 0 && !reg.cancelled_at) throw conflict('Cancel and refund the registration before erasing it');
    const hasBooks = !!one("SELECT 1 FROM invoice WHERE registration_id = ? LIMIT 1", regId);
    run("UPDATE seat SET state = 'open', registration_id = NULL WHERE registration_id = ?", regId);
    update('registration', regId, {
      full_name: hasBooks ? reg.full_name : 'Erased delegate', email: `erased+${reg.id.slice(0, 8)}@invalid`, mobile: '0000000000',
      institution: hasBooks ? reg.institution : '—', city: '—', dob: null, guardian_name: null, guardian_email: null, guardian_token: null,
      dietary: null, tshirt: null, emergency_name: null, emergency_phone: null, id_proof_path: null, referral_name: null,
      erased_at: now(), cancelled_at: reg.cancelled_at ?? now(), allot_status: 'released',
    });
    run("UPDATE erasure_request SET status = 'done', completed_at = ?, completed_by = ? WHERE registration_id = ? AND status = 'pending'", now(), ctx().userId ?? null, regId);
    run("UPDATE notification SET body = '[erased]', recipient = 'erased' WHERE registration_id = ?", regId);
    audit('registration.erase', 'registration', regId, undefined, { keptForBooks: hasBooks });
  });
}

// ---------- delegations (head delegate / faculty advisor) ----------
export function registerDelegation(eventId: string, head: { name: string; email: string; mobile: string; institution: string }, members: RegInput[], mode?: 'head_pays' | 'members_pay') {
  if (!head.name?.trim() || !isEmail(head.email) || !head.institution?.trim()) throw bad('Enter the head delegate’s name, email and institution');
  if (!members.length) throw bad('Add at least one member');
  const s = eventSettings(eventId);
  const results: any[] = []; const errors: any[] = [];
  const id = uid(); const tok = token(18);
  insert('delegation', { id, event_id: eventId, institution: head.institution.trim(), head_name: head.name.trim(), head_email: head.email.trim().toLowerCase(), head_mobile: normMobile(head.mobile ?? ''), payment_mode: mode ?? s.groupPayment, token: tok, created_at: now() });
  for (const [idx, m] of members.entries()) {
    try {
      results.push(register(eventId, { ...m, institution: m.institution || head.institution, consent: true }, { source: 'delegation', delegationId: id, groupSize: members.length }).registration.ref);
    } catch (e: any) { errors.push({ row: idx + 1, name: m.full_name, error: e.message, fields: e.details?.fields }); }
  }
  enqueue('delegation_created', { to: head.email, recipientKind: 'head_delegate', vars: { name: head.name, institution: head.institution, count: results.length, delegation_link: `${config.baseUrl}/delegation/${tok}`, payment_note: (mode ?? s.groupPayment) === 'head_pays' ? 'You can pay for the whole delegation in one payment from the link above.' : 'Each member pays from their own link.' } });
  audit('delegation.create', 'delegation', id, undefined, { institution: head.institution, members: results.length, errors: errors.length });
  return { id, token: tok, registered: results, errors };
}

export function delegationView(tok: string) {
  const d = one('SELECT * FROM delegation WHERE token = ?', tok);
  if (!d) throw notFound('Delegation');
  const members = all("SELECT * FROM registration WHERE delegation_id = ? AND erased_at IS NULL ORDER BY created_at", d.id).map((r) => {
    const seat = seatOf(r.id);
    return { id: r.id, ref: r.ref, full_name: r.full_name, email: r.email, mobile: r.mobile, class_year: r.class_year, payment_status: r.payment_status, allot_status: r.allot_status, committee: seat?.committee ?? null, portfolio: seat?.portfolio ?? null, total_paise: r.total_paise, balance_paise: balanceOf(r), cancelled: !!r.cancelled_at, portal: portalLink(r) };
  });
  const ev = getEvent(d.event_id);
  return { delegation: { id: d.id, institution: d.institution, head_name: d.head_name, head_email: d.head_email, payment_mode: d.payment_mode }, event: { name: ev.name, code: ev.code }, members, totalDue: members.filter((m) => !m.cancelled).reduce((s, m) => s + Math.max(0, m.balance_paise), 0) };
}

// ---------- swaps & acceptance ----------
export const SWAP_REASONS: Record<string, string> = { wrong_portfolio: 'I was given the wrong portfolio', prefer_other: 'I would prefer another portfolio', experience: 'My experience fits a different portfolio', other: 'Something else' };
/** A delegate asks for a different portfolio (in their own committee or another one), with a reason. */
export function requestSwap(reg: Record<string, any>, o: { committee_id: string; portfolio_id?: string | null; reason?: string; note?: string }) {
  if (!one('SELECT 1 FROM committee WHERE id = ? AND event_id = ?', o.committee_id, reg.event_id)) throw notFound('Committee');
  if (o.portfolio_id && !one('SELECT 1 FROM portfolio WHERE id = ? AND committee_id = ?', o.portfolio_id, o.committee_id)) throw bad('Pick a portfolio from that committee');
  const seat = seatOf(reg.id);
  if (seat && !o.portfolio_id && seat.committee_id === o.committee_id) throw bad('Pick the portfolio you want in your committee, or another committee');
  if (seat && o.portfolio_id === seat.portfolio_id) throw bad('That is already your portfolio');
  if (one("SELECT 1 FROM swap_request WHERE registration_id = ? AND status = 'pending'", reg.id)) throw conflict('You already have a pending change request');
  const reason = SWAP_REASONS[o.reason ?? ''] ? o.reason! : 'other';
  const note = String(o.note ?? '').trim().slice(0, 1000) || null;
  const id = uid();
  insert('swap_request', { id, registration_id: reg.id, to_committee_id: o.committee_id, to_portfolio_id: o.portfolio_id || null, reason, note, status: 'pending', created_at: now() });
  audit('swap.request', 'registration', reg.id, undefined, { toCommitteeId: o.committee_id, toPortfolioId: o.portfolio_id ?? null, reason, note });
  notifyStaff(['admin', 'secretariat', 'registration_exec'], 'staff_alert', { title: 'Portfolio change requested', message: `${reg.full_name} (${reg.ref}) asked for a change: ${SWAP_REASONS[reason]}. Review it in Committees → Change requests.` }, reg.event_id);
  return id;
}
/** Portfolios a delegate could move to: open ones, marked if their experience is short. */
export function changeOptions(reg: Record<string, any>) {
  const s = eventSettings(reg.event_id);
  const points = experiencePoints(reg);
  const mine = seatOf(reg.id)?.portfolio_id ?? null;
  const committees = all('SELECT id, name, short FROM committee WHERE event_id = ? ORDER BY sort, name', reg.event_id);
  const portfolios = all(`SELECT p.id, p.committee_id, p.name, p.tier, (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id AND s.state = 'open') AS open
    FROM portfolio p JOIN committee c ON c.id = p.committee_id WHERE c.event_id = ? ORDER BY p.sort, p.name`, reg.event_id);
  return committees.map((c) => ({ ...c, portfolios: portfolios.filter((p) => p.committee_id === c.id && p.id !== mine && p.open > 0)
    .map((p) => ({ id: p.id, name: p.name, qualifies: points >= (s.tierMinExperience[p.tier as 'high'] ?? 0), needs: s.tierMinExperience[p.tier as 'high'] ?? 0 })) }));
}

/** Approve a committee change: move to the best open seat in the target; charge or refund any fee difference. */
export function decideSwap(swapId: string, approve: boolean, roles: string[], seatId?: string) {
  return tx(() => {
    const sw = one('SELECT * FROM swap_request WHERE id = ?', swapId);
    if (!sw || sw.status !== 'pending') throw conflict('Request is not pending');
    update('swap_request', swapId, { status: approve ? 'approved' : 'rejected', decided_by: ctx().userId ?? null });
    if (!approve) return null;
    // The exact portfolio asked for if it is still open; otherwise the best open seat in that committee.
    const target = seatId
      ?? (sw.to_portfolio_id ? one(`SELECT id FROM seat WHERE portfolio_id = ? AND state = 'open' ORDER BY seat_no LIMIT 1`, sw.to_portfolio_id)?.id : null)
      ?? one(`SELECT s.id FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = ? AND s.state = 'open' ORDER BY p.tier = 'standard' DESC, p.sort LIMIT 1`, sw.to_committee_id)?.id;
    if (!target) throw conflict(sw.to_portfolio_id ? 'That portfolio and the rest of the committee are full now' : 'No open seat in that committee');
    return changeAllocation(sw.registration_id, target, `Swap request approved${sw.note ? ': ' + sw.note : ''}`, roles);
  });
}

export function changeAllocation(regId: string, seatId: string, reason: string, roles: string[]) {
  // An application waiting for review is accepted by giving it a seat: one path for every screen.
  if (one('SELECT allot_status FROM registration WHERE id = ?', regId)?.allot_status === 'applied') {
    const seat = assignApplicant(regId, seatId, roles)!;
    return { committee: seat.committee, portfolio: seat.portfolio, balance: balanceOf(one('SELECT * FROM registration WHERE id = ?', regId)!) };
  }
  return tx(() => {
    const before = one('SELECT * FROM registration WHERE id = ?', regId)!;
    const r = moveToSeat(regId, seatId, reason, roles);
    const s = eventSettings(before.event_id);
    if (r.premiumDelta && s.premiumPricing) {
      // Keep the quoted base fee and discount; only the portfolio premium changes.
      const premium = before.premium_paise + r.premiumDelta;
      const net = before.base_paise + premium - before.discount_paise;
      const gst = s.gstEnabled ? bp(net, s.gstRateBp) : 0;
      update('registration', regId, { premium_paise: premium, net_paise: net, gst_paise: gst, total_paise: net + gst });
      const after = one('SELECT * FROM registration WHERE id = ?', regId)!;
      const bal = balanceOf(after);
      if (bal < 0) requestRefund(regId, -bal, `Fee difference after allocation change to ${r.target.portfolio}`);
    }
    const reg = one('SELECT * FROM registration WHERE id = ?', regId)!;
    const vars = regVars(reg, { reason });
    enqueue('allocation_changed', { to: reg.email, registrationId: regId, vars });
    for (const ch of all("SELECT DISTINCT u.email FROM user u JOIN user_role ur ON ur.user_id = u.id WHERE ur.role = 'chair' AND ur.committee_id IN (?, ?)", r.target.committee_id, r.old?.committee_id ?? ''))
      enqueue('allocation_changed_chair', { to: ch.email, recipientKind: 'staff', vars });
    if (balanceOf(reg) > 0 && reg.payment_status === 'paid') enqueue('part_payment', { to: reg.email, registrationId: regId, vars: regVars(reg, { paid: inr(reg.paid_paise) }) });
    return { committee: r.target.committee, portfolio: r.target.portfolio, balance: balanceOf(reg) };
  });
}

export function acceptApplication(regId: string) {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg) throw notFound('Registration');
  if (reg.accepted) throw conflict('Already accepted');
  if (reg.allot_status === 'applied') throw conflict('Accept this application by assigning a seat (Applications)');
  update('registration', regId, { accepted: 1, hold_expires_at: addHours(now(), eventSettings(reg.event_id).holdHours), updated_at: now() });
  audit('registration.accept', 'registration', regId);
  enqueue('payment_reminder', { to: reg.email, registrationId: regId, vars: regVars({ ...reg, accepted: 1 }) });
}

/** Flags the same email, phone, or name+institution across registrations in an event. */
export function duplicates(eventId: string) {
  const regs = all('SELECT id, ref, full_name, email, mobile, institution, payment_status, created_at FROM registration WHERE event_id = ? AND erased_at IS NULL', eventId);
  const groups = new Map<string, any[]>();
  for (const r of regs) {
    for (const key of [`email:${r.email}`, `mobile:${r.mobile}`, `name:${r.full_name.toLowerCase().replace(/\s+/g, ' ')}|${r.institution.toLowerCase().trim()}`]) {
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }
  return [...groups.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ match: k.split(':')[0], value: k.slice(k.indexOf(':') + 1), registrations: v }));
}

export function sendEventReminders(eventId: string) {
  const regs = all("SELECT * FROM registration WHERE event_id = ? AND payment_status = 'paid' AND cancelled_at IS NULL", eventId);
  for (const r of regs) enqueue('event_reminder', { to: r.email, registrationId: r.id, vars: regVars(r), quiet: true });
  const ev = getEvent(eventId); const s = eventSettings(ev);
  for (const ch of all("SELECT u.email, u.name FROM user u JOIN user_role ur ON ur.user_id = u.id WHERE ur.role = 'chair' AND (ur.event_id = ? OR ur.event_id IS NULL)", eventId))
    enqueue('event_reminder', { to: ch.email, recipientKind: 'staff', vars: { name: ch.name, event_name: ev.name, event_dates: [ev.start_date, ev.end_date].filter(Boolean).join(' to '), venue: ev.venue ?? '', reporting_time: s.reportingTime, dress_code: s.dressCode, committee: 'your committee', portfolio: 'Executive board' } });
  audit('event.reminders', 'event', eventId, undefined, { delegates: regs.length });
  return regs.length;
}
