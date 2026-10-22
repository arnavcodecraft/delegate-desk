/**
 * Conferences as organisers set them up: the onboarding wizard, the public profile, publishing,
 * the Explore listing, free conferences, and the organiser dashboard numbers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { all, one, run, insert, update, tx, scalar } from '../db.ts';
import { audit } from '../audit.ts';
import { config, uploadDir } from '../config.ts';
import { eventSettings, getEvent, getOrg, saveEventSettings, type ConferenceProfile, type EventSettings } from '../settings.ts';
import { bad, conflict, json, now, uid, isEmail, istDate, notFound } from '../util.ts';
import { claimCode, codeTaken, upsertListing, slugTaken, listingForEvent, replacePositions, currentWorkspace } from '../platform.ts';
import { addPortfolio, confirmSeat, seatOf } from './allocation.ts';
import { sniff } from './evidence.ts';

export const COMMITTEE_TYPES = ['mun', 'crisis', 'custom', 'press'] as const;
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
export const USES = ['applications', 'payments', 'committees', 'emails', 'chairs', 'marketing'] as const;

// ---------- media (logos, banners, payment QR codes, study guides) ----------
const MEDIA_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };
/** Store a public file (logo, banner, QR, study guide). Names carry the workspace tag, so the link routes back here. */
export function saveMedia(buf: Buffer, allow: ('image' | 'pdf')[] = ['image']) {
  if (!buf?.length) throw bad('The file is empty');
  if (buf.length > 5 * 1024 * 1024) throw bad('Files must be 5 MB or smaller');
  const mime = sniff(buf);
  if (!mime || (mime === 'application/pdf' ? !allow.includes('pdf') : !allow.includes('image'))) throw bad(allow.includes('pdf') ? 'Upload a PDF, PNG or JPG' : 'Upload a PNG or JPG image');
  const name = `${uid()}.${MEDIA_TYPES[mime]}`;
  fs.mkdirSync(path.join(uploadDir(), 'public'), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), 'public', name), buf);
  return name;
}
export function mediaFile(name: string) {
  if (!/^[a-z0-9.-]+\.(png|jpg|pdf)$/i.test(name)) return null;
  const full = path.join(uploadDir(), 'public', name);
  return fs.existsSync(full) ? full : null;
}
export const mediaUrl = (name: string | null | undefined) => (name ? `/api/public/media/${name}` : null);
export function fromDataUrl(d: string | null | undefined) {
  const m = /^data:([a-z/+-]+);base64,(.+)$/i.exec(String(d ?? ''));
  return m ? Buffer.from(m[2], 'base64') : null;
}
const isPreset = (b: string | null | undefined) => !!b && /^p[1-6]$/.test(b);

// ---------- names, codes and links ----------
export function acronymFrom(name: string) {
  const words = name.replace(/[^A-Za-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !/^(of|the|and|for|in|on|at|a|an)$/i.test(w));
  if (words.length === 1) return words[0].slice(0, 8).toUpperCase();
  return words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join('').slice(0, 10);
}
/** The conference code doubles as the link (…/c/bgys27). Built from the acronym plus the edition year. */
export function suggestCode(acronym: string, startDate?: string | null) {
  const base = acronym.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MUN';
  const yy = (startDate ?? istDate()).slice(2, 4);
  const first = /\d{2}$/.test(base) ? base : `${base}${yy}`;
  if (!codeTaken(first) && !slugTaken(first.toLowerCase())) return first;
  for (let i = 2; i < 100; i++) { const c = `${first}${i}`.slice(0, 20); if (!codeTaken(c) && !slugTaken(c.toLowerCase())) return c; }
  return `${base}${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
}
export const publicLink = (code: string) => `${config.baseUrl}/c/${code.toLowerCase()}`;
export const registrationLink = (code: string) => `${config.baseUrl}/register/${code}`;

// ---------- committees ----------
export interface CommitteeInput {
  type?: string; name: string; short?: string; topics?: string[]; difficulty?: string; language?: string; emblem?: string | null;
  description?: string | null; perCountry?: number;
  portfolios: { name: string; code?: string | null; importance?: 'high' | 'standard' | 'low'; premiumPaise?: number }[];
}
function cleanCommittee(c: CommitteeInput) {
  const name = String(c.name ?? '').trim();
  if (name.length < 2) throw bad('Every committee needs a name');
  const short = (String(c.short ?? '').trim() || acronymFrom(name)).slice(0, 16);
  const type = COMMITTEE_TYPES.includes(c.type as any) ? c.type! : 'mun';
  const topics = (c.topics ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 3);
  const difficulty = DIFFICULTIES.includes(c.difficulty as any) ? c.difficulty! : 'intermediate';
  const perCountry = Math.min(4, Math.max(1, Math.round(Number(c.perCountry ?? 1))));
  const seen = new Set<string>();
  const portfolios = (c.portfolios ?? []).map((p) => ({ ...p, name: String(p.name ?? '').trim() })).filter((p) => {
    const k = p.name.toLowerCase(); if (!p.name || seen.has(k)) return false; seen.add(k); return true;
  });
  return { name, short, type, topics, difficulty, perCountry, language: String(c.language ?? 'English').slice(0, 30), emblem: c.emblem ?? null, description: c.description?.trim() || null, portfolios };
}

export function addCommittee(eventId: string, input: CommitteeInput) {
  const c = cleanCommittee(input);
  return tx(() => {
    if (one('SELECT 1 FROM committee WHERE event_id = ? AND upper(short) = upper(?)', eventId, c.short)) throw conflict(`A committee with the short name ${c.short} already exists`);
    const id = uid();
    const sort = scalar<number>('SELECT COALESCE(MAX(sort), -1) + 1 FROM committee WHERE event_id = ?', eventId);
    insert('committee', { id, event_id: eventId, name: c.name, short: c.short, kind: c.perCountry > 1 ? 'double' : 'single', description: c.description, guide_url: null, sort,
      type: c.type, topics: JSON.stringify(c.topics), difficulty: c.difficulty, language: c.language, emblem: c.emblem });
    c.portfolios.forEach((p, j) => {
      const pid = addPortfolio(id, { name: p.name, tier: p.importance ?? 'standard', premiumPaise: Math.max(0, Math.round(p.premiumPaise ?? 0)), seats: c.perCountry, sort: j });
      if (p.code) run('UPDATE portfolio SET code = ? WHERE id = ?', String(p.code).toLowerCase().slice(0, 6), pid);
    });
    audit('committee.create', 'committee', id, undefined, { name: c.name, portfolios: c.portfolios.length });
    return id;
  });
}

/** Edit a committee's details and add/remove portfolios. Portfolios with a delegate on them cannot be removed. */
export function updateCommittee(committeeId: string, input: CommitteeInput) {
  const before = one('SELECT * FROM committee WHERE id = ?', committeeId);
  if (!before) throw notFound('Committee');
  const c = cleanCommittee(input);
  return tx(() => {
    if (one('SELECT 1 FROM committee WHERE event_id = ? AND upper(short) = upper(?) AND id <> ?', before.event_id, c.short, committeeId)) throw conflict(`A committee with the short name ${c.short} already exists`);
    update('committee', committeeId, { name: c.name, short: c.short, type: c.type, topics: JSON.stringify(c.topics), difficulty: c.difficulty, language: c.language, emblem: c.emblem, description: c.description, kind: c.perCountry > 1 ? 'double' : 'single' });
    const existing = all('SELECT p.*, (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id AND s.state <> \'open\') AS taken, (SELECT COUNT(*) FROM seat s WHERE s.portfolio_id = p.id) AS seats FROM portfolio p WHERE committee_id = ?', committeeId);
    const want = new Map(c.portfolios.map((p, i) => [p.name.toLowerCase(), { ...p, sort: i }]));
    for (const p of existing) {
      const w = want.get(p.name.toLowerCase());
      if (!w) {
        if (p.taken) throw conflict(`${p.name} has a delegate on it. Move them before removing it.`);
        run('DELETE FROM seat WHERE portfolio_id = ?', p.id); run('DELETE FROM portfolio WHERE id = ?', p.id);
        continue;
      }
      update('portfolio', p.id, { sort: w.sort, tier: w.importance ?? p.tier, code: w.code ? String(w.code).toLowerCase() : p.code, premium_paise: w.premiumPaise != null ? Math.max(0, Math.round(w.premiumPaise)) : p.premium_paise });
      // Delegates per country: add seats, or drop empty ones down to the new count.
      for (let n = p.seats + 1; n <= c.perCountry; n++) insert('seat', { id: uid(), portfolio_id: p.id, seat_no: n, state: 'open' });
      if (p.seats > c.perCountry) run("DELETE FROM seat WHERE portfolio_id = ? AND seat_no > ? AND state = 'open'", p.id, c.perCountry);
      want.delete(p.name.toLowerCase());
    }
    for (const p of want.values()) {
      const pid = addPortfolio(committeeId, { name: p.name, tier: p.importance ?? 'standard', premiumPaise: Math.max(0, Math.round(p.premiumPaise ?? 0)), seats: c.perCountry, sort: p.sort });
      if (p.code) run('UPDATE portfolio SET code = ? WHERE id = ?', String(p.code).toLowerCase(), pid);
    }
    audit('committee.update', 'committee', committeeId, { name: before.name }, { name: c.name, portfolios: c.portfolios.length });
  });
}
export function deleteCommittee(committeeId: string) {
  const c = one('SELECT * FROM committee WHERE id = ?', committeeId);
  if (!c) throw notFound('Committee');
  if (one("SELECT 1 FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = ? AND s.state <> 'open'", committeeId)) throw conflict('This committee has delegates. Move them before deleting it.');
  tx(() => {
    run('DELETE FROM seat WHERE portfolio_id IN (SELECT id FROM portfolio WHERE committee_id = ?)', committeeId);
    run('DELETE FROM portfolio WHERE committee_id = ?', committeeId);
    run('UPDATE position SET committee_id = NULL WHERE committee_id = ?', committeeId);
    run('DELETE FROM committee WHERE id = ?', committeeId);
  });
  audit('committee.delete', 'committee', committeeId, { name: c.name });
}
export function committeeDetail(committeeId: string) {
  const c = one('SELECT * FROM committee WHERE id = ?', committeeId);
  if (!c) throw notFound('Committee');
  const ports = all(`SELECT p.id, p.name, p.code, p.tier, p.premium_paise, COUNT(s.id) AS seats, SUM(s.state <> 'open') AS taken FROM portfolio p
    LEFT JOIN seat s ON s.portfolio_id = p.id WHERE p.committee_id = ? GROUP BY p.id ORDER BY p.sort, p.name`, committeeId);
  return { ...c, topics: json(c.topics, []), perCountry: c.kind === 'double' ? 2 : Math.max(1, ...ports.map((p) => p.seats)), portfolios: ports };
}

// ---------- the public profile and listing ----------
export function profileOf(eventId: string) {
  const ev = getEvent(eventId);
  return { event: ev, s: eventSettings(ev) };
}

/** Rebuild this conference's entry in Explore (called after any change the public page shows). */
export function syncListing(eventId: string) {
  const { event: ev, s } = profileOf(eventId);
  const p = s.profile;
  const org = getOrg(ev.org_id);
  const committees = all(`SELECT c.id, c.name, c.short, c.type, c.topics, c.difficulty, c.language, c.emblem, c.description, c.guide_url,
      (SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = c.id) AS seats,
      (SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id WHERE p.committee_id = c.id AND s.state = 'open') AS open
    FROM committee c WHERE c.event_id = ? ORDER BY c.sort, c.name`, eventId).map((c) => ({ ...c, topics: json(c.topics, []) }));
  const tiers = all("SELECT category, name, amount_paise, ends_at FROM fee_tier WHERE event_id = ? AND active = 1 AND (ends_at IS NULL OR ends_at >= ?) ORDER BY amount_paise", eventId, now());
  const gst = (paise: number) => (s.gstEnabled ? paise + Math.round((paise * s.gstRateBp) / 10000) : paise);
  const delegateTiers = tiers.filter((t) => t.category !== 'advisor');
  const delegates = scalar<number>("SELECT COUNT(*) FROM registration WHERE event_id = ? AND cancelled_at IS NULL AND erased_at IS NULL", eventId) ?? 0;
  const positions = all('SELECT * FROM position WHERE event_id = ? AND open = 1 ORDER BY sort, created_at', eventId);
  const published = ev.status === 'open' || ev.status === 'closed' || ev.status === 'held';
  const deadlinePassed = !!s.applicationDeadline && s.applicationDeadline < now();
  upsertListing({
    eventId, code: ev.code, slug: ev.code.toLowerCase(), published, name: ev.name, acronym: p.acronym || ev.code,
    country: p.country || null, city: ev.city, startDate: p.datesTbd ? null : ev.start_date, endDate: p.datesTbd ? null : ev.end_date,
    data: {
      logo: mediaUrl(p.logo), banner: isPreset(p.banner) ? p.banner : mediaUrl(p.banner), format: p.format, level: p.level, expected: p.expected,
      description: p.description, socials: p.socials, organiser: org.name, contactEmail: p.contactEmail, venue: ev.venue, status: ev.status,
      datesTbd: p.datesTbd || !ev.start_date, delegates,
      free: s.free, feeFrom: s.free || !delegateTiers.length ? 0 : gst(delegateTiers[0].amount_paise),
      fees: s.free ? [] : tiers.map((t) => ({ category: t.category, name: t.name, total: gst(t.amount_paise), ends_at: t.ends_at })),
      gstIncluded: s.gstEnabled,
      roles: { ...s.roles, delegate: s.roles.delegate && ev.status === 'open' && !deadlinePassed, chair: s.roles.chair && positions.some((x) => x.kind === 'chair') || s.roles.chair },
      deadline: s.applicationDeadline, allocationMode: s.allocationMode,
      committees: committees.map((c) => ({ ...c, guide_url: c.guide_url })),
      positions: positions.length,
    },
  });
  replacePositions(eventId, positions.map((x) => ({ id: x.id, data: {
    kind: x.kind, title: x.title, description: x.description, openings: x.openings, deadline: x.deadline,
    committee: x.committee_id ? committees.find((c) => c.id === x.committee_id)?.name ?? null : null,
  } })));
}

export function saveProfile(eventId: string, patch: Partial<ConferenceProfile> & { name?: string; city?: string; venue?: string; start_date?: string | null; end_date?: string | null }) {
  const { event: ev, s } = profileOf(eventId);
  const p = { ...s.profile };
  if (patch.acronym !== undefined) p.acronym = String(patch.acronym).trim().slice(0, 24);
  if (patch.format && ['in_person', 'online', 'hybrid'].includes(patch.format)) p.format = patch.format;
  if (patch.level && ['high_school', 'university', 'both'].includes(patch.level)) p.level = patch.level;
  if (patch.country !== undefined) p.country = String(patch.country).toLowerCase().slice(0, 6);
  if (patch.expected !== undefined) p.expected = Math.max(0, Math.round(Number(patch.expected) || 0));
  if (patch.description !== undefined) { if (String(patch.description).length > 1500) throw bad('Keep the description under 1,500 characters'); p.description = String(patch.description).trim(); }
  if (patch.socials) p.socials = { ...p.socials, ...Object.fromEntries(Object.entries(patch.socials).map(([k, v]) => [k, String(v ?? '').trim().slice(0, 200)])) } as any;
  if (patch.datesTbd !== undefined) p.datesTbd = !!patch.datesTbd;
  if (patch.contactEmail !== undefined) { const e = String(patch.contactEmail).trim(); if (e && !isEmail(e)) throw bad('Enter a valid contact email'); p.contactEmail = e; }
  if (patch.uses) p.uses = patch.uses.filter((u) => (USES as readonly string[]).includes(u));
  if (patch.logo !== undefined) p.logo = patch.logo;
  if (patch.banner !== undefined) p.banner = patch.banner;
  const evPatch: Record<string, any> = {};
  if (patch.name !== undefined) { if (String(patch.name).trim().length < 3) throw bad('Enter the conference name'); evPatch.name = String(patch.name).trim(); }
  if (patch.city !== undefined) evPatch.city = String(patch.city).trim() || null;
  if (patch.venue !== undefined) evPatch.venue = String(patch.venue).trim() || null;
  if (patch.start_date !== undefined) evPatch.start_date = patch.start_date || null;
  if (patch.end_date !== undefined) evPatch.end_date = patch.end_date || null;
  if (evPatch.start_date && evPatch.end_date && evPatch.end_date < evPatch.start_date) throw bad('The last day must be on or after the first day');
  if (Object.keys(evPatch).length) { update('event', eventId, evPatch); audit('event.update', 'event', eventId, { name: ev.name, city: ev.city, start_date: ev.start_date }, evPatch); }
  if (evPatch.start_date) p.datesTbd = false;
  saveEventSettings(eventId, { profile: p });
  syncListing(eventId);
  return p;
}

/** Publishing puts the conference on Explore and opens the roles that are switched on. */
export function setPublished(eventId: string, on: boolean) {
  const ev = getEvent(eventId);
  if (on) {
    if (!one('SELECT 1 FROM committee WHERE event_id = ?', eventId)) throw bad('Add at least one committee before publishing');
    if (!['draft', 'closed'].includes(ev.status) && ev.status !== 'open') throw conflict(`A ${ev.status} conference cannot be published`);
  }
  const status = on ? 'open' : 'draft';
  update('event', eventId, { status });
  audit(on ? 'event.publish' : 'event.unpublish', 'event', eventId, { status: ev.status }, { status });
  syncListing(eventId);
  return status;
}

export function saveApplications(eventId: string, patch: { roles?: Partial<EventSettings['roles']>; applicationDeadline?: string | null; allocationMode?: string; positionPapers?: Partial<EventSettings['positionPapers']> }) {
  const s = eventSettings(eventId);
  const next: Partial<EventSettings> = {};
  if (patch.roles) next.roles = { ...s.roles, ...Object.fromEntries(Object.entries(patch.roles).map(([k, v]) => [k, !!v])) } as any;
  if (patch.applicationDeadline !== undefined) next.applicationDeadline = patch.applicationDeadline || null;
  if (patch.allocationMode && ['instant', 'review'].includes(patch.allocationMode)) next.allocationMode = patch.allocationMode as any;
  if (patch.positionPapers) next.positionPapers = { ...s.positionPapers, ...patch.positionPapers, enabled: patch.positionPapers.enabled ?? s.positionPapers.enabled };
  saveEventSettings(eventId, next);
  syncListing(eventId);
  return eventSettings(eventId);
}

// ---------- fees and how delegates pay ----------
export function setFees(eventId: string, o: { free: boolean; delegatePaise?: number; collegePaise?: number; advisorPaise?: number; earlyPaise?: number; earlyEnds?: string | null; latePaise?: number; lateStarts?: string | null; gstEnabled?: boolean; gstRateBp?: number }) {
  return tx(() => {
    const free = !!o.free;
    const amt = (v: unknown, label: string) => { const n = Math.round(Number(v ?? 0)); if (!Number.isFinite(n) || n < 0) throw bad(`${label} must be zero or more`); return n; };
    const delegate = free ? 0 : amt(o.delegatePaise, 'The delegate fee');
    if (!free && delegate <= 0) throw bad('Enter the delegate fee, or choose "It\'s free"');
    const college = free ? 0 : o.collegePaise != null && o.collegePaise !== ('' as any) ? amt(o.collegePaise, 'The university fee') : delegate;
    const advisor = free ? 0 : amt(o.advisorPaise ?? 0, 'The advisor fee');
    // Existing tiers keep their history (registrations point at them), so they are switched off, not deleted.
    run('UPDATE fee_tier SET active = 0 WHERE event_id = ?', eventId);
    const add = (category: string, name: string, amount: number, starts: string | null, ends: string | null, sort: number) =>
      insert('fee_tier', { id: uid(), event_id: eventId, category, name, amount_paise: amount, starts_at: starts, ends_at: ends, quota: null, sort });
    for (const [category, base] of [['school', delegate], ['college', college], ['international', college]] as const) {
      if (!free && o.earlyPaise && o.earlyEnds) add(category, 'Early bird', category === 'school' ? amt(o.earlyPaise, 'The early-bird fee') : Math.round((base * amt(o.earlyPaise, 'The early-bird fee')) / Math.max(1, delegate)), null, o.earlyEnds, 1);
      add(category, free ? 'Free' : 'Regular', base, null, !free && o.latePaise && o.lateStarts ? new Date(new Date(o.lateStarts).getTime() - 1000).toISOString() : null, 2);
      if (!free && o.latePaise && o.lateStarts) add(category, 'Late', category === 'school' ? amt(o.latePaise, 'The late fee') : Math.round((base * amt(o.latePaise, 'The late fee')) / Math.max(1, delegate)), o.lateStarts, null, 3);
    }
    add('advisor', free ? 'Free' : 'Faculty advisor', advisor, null, null, 1);
    const gstEnabled = free ? false : o.gstEnabled ?? eventSettings(eventId).gstEnabled;
    saveEventSettings(eventId, { free, gstEnabled, ...(o.gstRateBp != null ? { gstRateBp: Math.round(o.gstRateBp) } : {}) });
    audit('fees.set', 'event', eventId, undefined, { free, delegate, college, advisor, gstEnabled });
    syncListing(eventId);
  });
}

export function savePaymentMethods(eventId: string, m: Partial<EventSettings['paymentMethods']>) {
  const cur = eventSettings(eventId).paymentMethods;
  const next = {
    link: { ...cur.link, ...(m.link ?? {}) }, qr: { ...cur.qr, ...(m.qr ?? {}) }, bank: { ...cur.bank, ...(m.bank ?? {}) }, in_person: { ...cur.in_person, ...(m.in_person ?? {}) },
  };
  if (next.link.enabled && !/^https?:\/\/\S+\.\S+/.test(next.link.url)) throw bad('Enter the full payment page link, starting with https://');
  if (next.qr.enabled && !next.qr.image && !next.qr.upiId) throw bad('Upload your payment QR code or enter a UPI ID');
  if (next.bank.enabled && (!next.bank.accountName.trim() || !next.bank.accountNumber.trim())) throw bad('Enter the account name and account number');
  for (const k of ['instructions'] as const) for (const x of [next.link, next.qr, next.bank, next.in_person]) if ((x as any)[k]?.length > 500) throw bad('Keep instructions under 500 characters');
  const anyProof = next.link.enabled || next.qr.enabled || next.bank.enabled;
  saveEventSettings(eventId, { paymentMethods: next, screenshotEnabled: anyProof || eventSettings(eventId).screenshotEnabled });
  return next;
}

/** A free conference confirms the seat as soon as it is allotted; nothing is posted to the books. */
export function confirmFree(regId: string) {
  const reg = one('SELECT * FROM registration WHERE id = ?', regId);
  if (!reg || reg.total_paise !== 0 || reg.payment_status === 'paid' || reg.cancelled_at) return false;
  if (!seatOf(regId)) return false;
  update('registration', regId, { payment_status: 'paid', confirmed_at: now(), updated_at: now() });
  confirmSeat(regId);
  audit('registration.confirm', 'registration', regId, undefined, { free: true });
  return true;
}

// ---------- traffic sources ----------
const CHANNELS = ['instagram', 'whatsapp', 'facebook', 'tiktok', 'linkedin', 'email', 'explore', 'google', 'school', 'friend', 'direct', 'other'];
export function normChannel(v: unknown, referrer?: string) {
  const c = String(v ?? '').toLowerCase().trim();
  if (CHANNELS.includes(c)) return c;
  const r = String(referrer ?? '').toLowerCase();
  if (/instagram/.test(r)) return 'instagram';
  if (/whatsapp|wa\.me/.test(r)) return 'whatsapp';
  if (/facebook|fb\./.test(r)) return 'facebook';
  if (/google\./.test(r)) return 'google';
  if (/linkedin/.test(r)) return 'linkedin';
  if (/\/explore|\/jobs|\/$/.test(r) && r.startsWith(config.baseUrl)) return 'explore';
  return c ? 'other' : 'direct';
}
export function trackView(eventId: string, channel: string) {
  run('INSERT INTO page_view (event_id, day, channel, n) VALUES (?, ?, ?, 1) ON CONFLICT(event_id, day, channel) DO UPDATE SET n = n + 1', eventId, istDate(), channel);
}

// ---------- the organiser dashboard ----------
export function overview(eventId: string) {
  const { event: ev, s } = profileOf(eventId);
  const p = s.profile;
  const seats = scalar<number>('SELECT COUNT(*) FROM seat s JOIN portfolio p ON p.id = s.portfolio_id JOIN committee c ON c.id = p.committee_id WHERE c.event_id = ?', eventId) ?? 0;
  const committees = scalar<number>('SELECT COUNT(*) FROM committee WHERE event_id = ?', eventId) ?? 0;
  const regs = one(`SELECT COUNT(*) AS applied, SUM(allot_status IN ('held','confirmed')) AS assigned, SUM(payment_status = 'paid') AS paid,
      SUM(allot_status = 'confirmed') AS confirmed, SUM(allot_status = 'none' OR allot_status = 'applied') AS to_review
    FROM registration WHERE event_id = ? AND cancelled_at IS NULL AND erased_at IS NULL`, eventId)!;
  const roleRows = all(`SELECT role, COUNT(*) AS applied, SUM(status = 'accepted') AS accepted FROM role_application WHERE event_id = ? AND status <> 'withdrawn' GROUP BY role`, eventId);
  const roleCount = (r: string) => roleRows.find((x) => x.role === r) ?? { applied: 0, accepted: 0 };
  const sources = all(`SELECT channel, SUM(n) AS views FROM page_view WHERE event_id = ? GROUP BY channel ORDER BY views DESC`, eventId);
  const regSources = all(`SELECT COALESCE(channel, 'direct') AS channel, COUNT(*) AS applied FROM registration WHERE event_id = ? AND cancelled_at IS NULL GROUP BY 1`, eventId);
  const bySource = [...new Set([...sources.map((x) => x.channel), ...regSources.map((x) => x.channel)])].map((c) => ({
    channel: c, views: sources.find((x) => x.channel === c)?.views ?? 0, applied: regSources.find((x) => x.channel === c)?.applied ?? 0,
  })).sort((a, b) => b.applied - a.applied || b.views - a.views);
  const daily = all(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM registration WHERE event_id = ? AND cancelled_at IS NULL GROUP BY 1 ORDER BY 1`, eventId);
  let cum = 0;
  const overTime = daily.map((d) => ({ x: d.day, y: (cum += d.n) }));
  const positions = scalar<number>('SELECT COUNT(*) FROM position WHERE event_id = ?', eventId) ?? 0;
  const anyMethod = s.free || Object.values(s.paymentMethods).some((m: any) => m.enabled) || (s.gateways.razorpay.enabled && !!config.razorpay.keyId && !currentWorkspace().tag);
  const target = p.expected || 0;
  const priorities = [
    { key: 'committees', done: committees > 0 && (!target || seats >= target * 0.9), title: 'Add committees', detail: committees ? `${seats} seats for ${target || 'your'} expected delegates.${target && seats < target ? ` ${target - seats} more covers them.` : ''}` : 'Add committees and portfolios so delegates have somewhere to sit.', to: '/app/allocation' },
    { key: 'financial', done: anyMethod, title: 'Add financial information', detail: s.free ? 'Free conference: nothing to set up.' : 'Choose how you get paid so delegates can actually pay you.', to: '/app/financials' },
    { key: 'applications', done: ev.status === 'open' && Object.values(s.roles).some(Boolean), title: 'Launch applications', detail: 'Publish, then open applications for at least one role.', to: '/app/applications?tab=settings' },
    { key: 'page', done: !!(p.logo && p.description && (ev.start_date || p.datesTbd)), title: 'Set up your conference page', detail: 'Add your logo, dates, a banner and a description.', to: '/app/conference' },
    { key: 'positions', done: positions > 0, title: 'List chair, secretariat or staff positions', detail: 'Post roles on the Job Board so people can apply.', to: '/app/jobs' },
    { key: 'communications', done: !!one("SELECT 1 FROM audit_log WHERE action IN ('template.update', 'bulk.message') LIMIT 1"), title: 'Check your emails', detail: 'See the emails applicants get and edit the wording.', to: '/app/messages' },
    { key: 'share', done: scalar<number>('SELECT COALESCE(SUM(n), 0) FROM page_view WHERE event_id = ?', eventId)! > 0, title: 'Share your conference link', detail: publicLink(ev.code), to: null },
  ];
  // Put what the organiser said they need first.
  const order: Record<string, string[]> = { applications: ['applications', 'committees'], payments: ['financial'], committees: ['committees'], emails: ['communications'], chairs: ['positions'], marketing: ['page', 'share'] };
  const wanted = new Set(p.uses.flatMap((u) => order[u] ?? []));
  priorities.sort((a, b) => Number(wanted.has(b.key)) - Number(wanted.has(a.key)));
  return {
    event: { id: ev.id, code: ev.code, name: ev.name, status: ev.status, start_date: ev.start_date, end_date: ev.end_date, city: ev.city },
    profile: { ...p, logoUrl: mediaUrl(p.logo), bannerUrl: isPreset(p.banner) ? null : mediaUrl(p.banner) },
    links: { page: publicLink(ev.code), register: registrationLink(ev.code) },
    target, seats, committees, free: s.free, roles: s.roles, allocationMode: s.allocationMode,
    applicants: {
      delegates: { applied: regs.applied ?? 0, accepted: regs.assigned ?? 0, paid: regs.paid ?? 0, toReview: regs.to_review ?? 0 },
      advisors: roleCount('advisor'), observers: roleCount('observer'), chairs: roleCount('chair'),
      staff: roleRows.filter((r) => !['advisor', 'observer', 'chair'].includes(r.role)).reduce((a, r) => ({ applied: a.applied + r.applied, accepted: a.accepted + (r.accepted ?? 0) }), { applied: 0, accepted: 0 }),
    },
    bySource, overTime, priorities, done: priorities.filter((x) => x.done).length,
  };
}

// ---------- onboarding: one call creates the whole conference ----------
export interface Draft {
  name: string; acronym?: string; logo?: string | null; banner?: string | null; startDate?: string | null; endDate?: string | null; datesTbd?: boolean;
  format?: string; level?: string; country?: string; city?: string; expected?: number;
  committees?: CommitteeInput[]; description?: string; socials?: Partial<ConferenceProfile['socials']>;
  free?: boolean; delegateFeePaise?: number; uses?: string[]; contactEmail?: string;
}

/** Creates the conference in the current workspace from the wizard's answers. Returns the new event id. */
export function launchConference(d: Draft) {
  const name = String(d.name ?? '').trim();
  if (name.length < 3) throw bad('Enter the conference name');
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw bad('The last day must be on or after the first day');
  if (d.contactEmail && !isEmail(d.contactEmail)) throw bad('Enter a valid contact email');
  const acronym = (String(d.acronym ?? '').trim() || acronymFrom(name)).slice(0, 24);
  const code = suggestCode(acronym, d.startDate);
  const org = getOrg();
  const eventId = uid();
  return tx(() => {
    const country = String(d.country ?? 'in').toLowerCase();
    insert('event', { id: eventId, org_id: org.id, code, name, kind: 'mun', venue: null, city: String(d.city ?? '').trim() || null, state_code: country === 'in' ? org.state_code : null,
      start_date: d.datesTbd ? null : d.startDate || null, end_date: d.datesTbd ? null : d.endDate || d.startDate || null, status: 'draft', settings: '{}', created_at: now() });
    claimCode(code, eventId);
    const logo = d.logo ? saveMedia(fromDataUrl(d.logo) ?? Buffer.alloc(0)) : null;
    const banner = isPreset(d.banner) ? d.banner! : d.banner ? saveMedia(fromDataUrl(d.banner) ?? Buffer.alloc(0)) : 'p1';
    const uses = (d.uses ?? []).filter((u) => (USES as readonly string[]).includes(u));
    // New organisers collect through their own accounts (proof upload, QR, link, in person), so the
    // platform's own gateway keys are never offered to them.
    const own = !currentWorkspace().tag;
    saveEventSettings(eventId, {
      gstEnabled: false,
      // The sandbox "test payment" button is a demo tool: never offered to a real organiser's delegates.
      gateways: { razorpay: { enabled: own, down: false }, cashfree: { enabled: own, down: false }, mock: { enabled: own && config.allowSandbox, down: false } },
      defaultGateway: 'mock',
      allocationMode: uses.includes('applications') ? 'review' : 'instant',
      roles: { delegate: true, advisor: false, observer: false, chair: uses.includes('chairs') },
      free: !!d.free,
      profile: {
        acronym, format: (['in_person', 'online', 'hybrid'].includes(d.format ?? '') ? d.format : 'in_person') as any,
        level: (['high_school', 'university', 'both'].includes(d.level ?? '') ? d.level : 'both') as any,
        country, expected: Math.max(0, Math.round(Number(d.expected) || 0)), description: String(d.description ?? '').trim().slice(0, 1500),
        socials: { instagram: '', facebook: '', tiktok: '', whatsapp: '', website: '', ...Object.fromEntries(Object.entries(d.socials ?? {}).map(([k, v]) => [k, String(v ?? '').trim().slice(0, 200)])) },
        logo, banner, datesTbd: !!d.datesTbd || !d.startDate, contactEmail: String(d.contactEmail ?? '').trim(), uses,
      },
    });
    for (const c of d.committees ?? []) addCommittee(eventId, c);
    setFees(eventId, { free: !!d.free, delegatePaise: d.free ? 0 : Math.max(0, Math.round(Number(d.delegateFeePaise) || 0)) || 100000 });
    audit('event.create', 'event', eventId, undefined, { code, name, via: 'onboarding' });
    syncListing(eventId);
    return eventId;
  });
}


/** Refresh every conference's Explore entry in this workspace (run by the background jobs). */
export function syncAllListings() {
  for (const e of all('SELECT id FROM event')) { try { syncListing(e.id); } catch (err) { console.warn('[listing]', (err as Error).message); } }
}
