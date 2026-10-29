import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { all, one, run, insert } from './db.ts';
import { audit } from './audit.ts';
import { HttpError, bad, ctxStore, forbidden, now, token, uid } from './util.ts';
import { config } from './config.ts';
import { claimEmail } from './platform.ts';

export const ROLES = ['superadmin', 'admin', 'secretariat', 'cfo', 'accountant', 'registration_exec', 'chair', 'auditor', 'referrer', 'head_delegate'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Super admin', admin: 'Secretary-General / admin', secretariat: 'Secretariat (USG / Deputy SG)', cfo: 'CFO', accountant: 'Accountant', registration_exec: 'Registration executive',
  chair: 'Committee director / chair', auditor: 'External auditor', referrer: 'Referrer / ambassador', head_delegate: 'Head delegate / advisor',
};
/** One line on what each role is for, shown when inviting people. */
export const ROLE_HELP: Record<Role, string> = {
  superadmin: 'Everything, across the whole organisation.',
  admin: 'Runs the conference: settings, committees, team, emails. Cannot approve money unless also CFO.',
  secretariat: 'Committees, portfolios, documents, applications, delegates, emails and check-in. No money or settings.',
  cfo: 'Approves payments, refunds and expenses; owns fees, books and payouts.',
  accountant: 'Records payments and expenses and keeps the books. Approves expenses.',
  registration_exec: 'The registration desk: applications, delegates, seat moves, check-in, payment proofs (view).',
  chair: 'Runs one committee: its delegates, position papers, live sessions and EB marking.',
  auditor: 'Read-only access to delegates, money, books and the audit trail.',
  referrer: 'An ambassador who sees their own referrals and commission.',
  head_delegate: 'A school advisor who sees their own delegation.',
};
export const MFA_ROLES: Role[] = ['superadmin', 'admin', 'cfo', 'accountant'];

// Money-moving rights are split: nobody can both approve a payment and edit configuration or post journals alone.
const PERMS: Record<string, Role[]> = {
  'reg.read': ['secretariat', 'superadmin', 'admin', 'registration_exec', 'cfo', 'accountant', 'auditor'],
  'reg.edit': ['secretariat', 'superadmin', 'admin', 'registration_exec'],
  'reg.cancel': ['superadmin', 'admin', 'registration_exec'],
  'reg.erase': ['superadmin', 'admin'],
  'alloc.move': ['secretariat', 'superadmin', 'admin', 'registration_exec'],
  'alloc.config': ['secretariat', 'superadmin', 'admin'],
  'event.config': ['superadmin', 'admin'],
  'event.held': ['cfo'],
  'event.cancel': ['superadmin', 'admin'],
  'payments.read': ['superadmin', 'admin', 'cfo', 'accountant', 'auditor', 'registration_exec'],
  'payments.approve': ['cfo'],
  'payments.excess': ['cfo'],
  'refund.request': ['superadmin', 'admin', 'registration_exec', 'cfo'],
  'refund.approve': ['cfo'],
  'refund.read': ['superadmin', 'admin', 'registration_exec', 'cfo', 'accountant', 'auditor'],
  'expense.create': ['superadmin', 'admin', 'registration_exec', 'cfo', 'accountant'],
  'expense.read': ['superadmin', 'admin', 'cfo', 'accountant', 'auditor'],
  'expense.approve': ['cfo', 'accountant'],
  'expense.pay': ['cfo', 'accountant'],
  'budget.set': ['cfo'],
  'vendor.manage': ['cfo', 'accountant'],
  'books.read': ['superadmin', 'cfo', 'accountant', 'auditor'],
  'books.post': ['accountant', 'cfo'],
  'books.reverse': ['accountant', 'cfo'],
  'books.approve': ['cfo'],
  'books.lock': ['cfo'],
  'books.export': ['cfo', 'accountant', 'auditor'],
  'finance.import': ['cfo', 'accountant'],
  'sponsorship.record': ['cfo', 'accountant'],
  'commission.read': ['superadmin', 'admin', 'cfo', 'accountant', 'auditor'],
  'commission.config': ['superadmin', 'admin'],
  'commission.signoff': ['cfo'],
  'commission.approve': ['cfo'],
  'commission.pay': ['cfo'],
  'referrer.manage': ['superadmin', 'admin', 'cfo'],
  'referral.link': ['superadmin', 'admin'],
  'dashboard.read': ['superadmin', 'admin', 'cfo', 'accountant', 'auditor'],
  'audit.read': ['superadmin', 'admin', 'cfo', 'auditor'],
  'users.manage': ['superadmin', 'admin'],
  'templates.manage': ['superadmin', 'admin'],
  'messages.send': ['secretariat', 'superadmin', 'admin', 'registration_exec'],
  'messages.read': ['secretariat', 'superadmin', 'admin', 'registration_exec', 'cfo'],
  'lists.read': ['secretariat', 'superadmin', 'admin', 'registration_exec', 'cfo', 'accountant', 'auditor', 'chair'],
  'lists.share': ['superadmin', 'admin'],
  'import.registrations': ['secretariat', 'superadmin', 'admin', 'registration_exec'],
  'attendance.mark': ['secretariat', 'superadmin', 'admin', 'registration_exec', 'chair'],
  'settings.org': ['superadmin', 'admin'],
  'settings.finance': ['cfo'],
};
export const permissionMatrix = () => PERMS;

export function can(roles: string[], perm: string) {
  return (PERMS[perm] ?? []).some((r) => roles.includes(r));
}

/**
 * Maker-checker rules ("someone else must approve") need a someone else. An organiser running a conference
 * alone is the only approver, so they may approve their own items; callers record that in the audit trail.
 */
export function onlyApprover(perm: string, userId: string | null | undefined) {
  const roles = PERMS[perm] ?? [];
  if (!roles.length) return false;
  const others = one(`SELECT COUNT(DISTINCT u.id) AS n FROM user u JOIN user_role r ON r.user_id = u.id
    WHERE u.active = 1 AND u.id <> ? AND r.role IN (${roles.map(() => '?').join(',')})`, userId ?? '', ...roles);
  return (others?.n ?? 0) === 0;
}

// ---------- passwords ----------
export function hashPassword(pw: string) {
  if ((pw ?? '').length < 10) throw bad('Passwords must be at least 10 characters');
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
/** Async versions run on the libuv thread pool, so many sign-ups at once don't freeze the server for everyone else. */
const scryptAsync = (pw: string, salt: Buffer) => new Promise<Buffer>((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));
export async function hashPasswordAsync(pw: string) {
  if ((pw ?? '').length < 10) throw bad('Passwords must be at least 10 characters');
  if (pw.length > 256) throw bad('That password is too long');
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scryptAsync(pw, salt)).toString('base64')}`;
}
const DUMMY = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;
/** Checks a password; with no stored hash it still does the work, so response time doesn't reveal which emails have accounts. */
export async function verifyPasswordAsync(pw: string, stored: string | null | undefined) {
  const [, s, h] = (stored || DUMMY).split('$');
  if (!s || !h) return false;
  const hash = await scryptAsync(String(pw ?? '').slice(0, 256), Buffer.from(s, 'base64'));
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'base64')) && !!stored;
}
export function verifyPassword(pw: string, stored: string) {
  const [, s, h] = stored.split('$');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw ?? '', Buffer.from(s, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'base64'));
}

// ---------- TOTP (RFC 6238) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) { const i = B32.indexOf(c); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totp(secret: string, at = Date.now(), step = 30) {
  const counter = Math.floor(at / 1000 / step);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = mac[mac.length - 1] & 0xf;
  const code = ((mac.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
  return code;
}
export function verifyTotp(secret: string, code: string) {
  const c = String(code ?? '').replace(/\s/g, '');
  return [-1, 0, 1].some((w) => totp(secret, Date.now() + w * 30_000) === c);
}
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

// ---------- users ----------
export function rolesOf(userId: string) {
  return all('SELECT * FROM user_role WHERE user_id = ?', userId);
}
export function createUser(o: { name: string; email: string; password: string; roles: { role: Role; event_id?: string | null; committee_id?: string | null; referrer_id?: string | null; delegation_id?: string | null }[] }) {
  const email = o.email.trim().toLowerCase();
  if (one('SELECT 1 FROM user WHERE email = ?', email)) throw bad('A user with that email exists');
  claimEmail(email);
  const id = uid();
  insert('user', { id, name: o.name.trim(), email, password_hash: hashPassword(o.password), created_at: now() });
  for (const r of o.roles) setRole(id, r);
  audit('user.create', 'user', id, undefined, { email, roles: o.roles.map((r) => r.role) });
  return id;
}
export function setRole(userId: string, r: { role: Role; event_id?: string | null; committee_id?: string | null; referrer_id?: string | null; delegation_id?: string | null }) {
  if (!ROLES.includes(r.role)) throw bad('Unknown role');
  if (r.role === 'chair' && !r.committee_id) throw bad('Pick the committee this chair runs');
  insert('user_role', { id: uid(), user_id: userId, role: r.role, event_id: r.event_id ?? null, committee_id: r.committee_id ?? null, referrer_id: r.referrer_id ?? null, delegation_id: r.delegation_id ?? null });
}

// ---------- sessions ----------
const COOKIE = 'dd_sid';
const IDLE_PRIV_MIN = 30, IDLE_MIN = 12 * 60, ABSOLUTE_H = 24;

export function startSession(res: Response, req: Request, userId: string, mfaOk: boolean) {
  const t = token(32);
  insert('session', { token: t, user_id: userId, mfa_ok: mfaOk ? 1 : 0, ip: req.ip, ua: String(req.headers['user-agent'] ?? '').slice(0, 200), created_at: now(), last_seen: now() });
  res.cookie(COOKIE, t, { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https'), maxAge: ABSOLUTE_H * 3600_000, path: '/' });
  return t;
}
export function endSession(req: Request, res: Response) {
  const t = req.cookies?.[COOKIE];
  if (t) run('DELETE FROM session WHERE token = ?', t);
  res.clearCookie(COOKIE, { path: '/' });
}

export interface Authed { user: Record<string, any>; roles: Record<string, any>[]; roleNames: string[]; session: Record<string, any>; mfaRequired: boolean }
declare module 'express-serve-static-core' { interface Request { auth?: Authed } }

export function loadSession(req: Request): Authed | null {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  const s = one('SELECT * FROM session WHERE token = ?', t);
  if (!s) return null;
  const user = one('SELECT * FROM user WHERE id = ? AND active = 1', s.user_id);
  if (!user) return null;
  const roles = rolesOf(user.id);
  const roleNames = [...new Set(roles.map((r) => r.role))];
  const priv = roleNames.some((r) => MFA_ROLES.includes(r as Role));
  const idle = (Date.now() - new Date(s.last_seen).getTime()) / 60_000;
  const age = (Date.now() - new Date(s.created_at).getTime()) / 3600_000;
  if (idle > (priv ? IDLE_PRIV_MIN : IDLE_MIN) || age > ABSOLUTE_H) { run('DELETE FROM session WHERE token = ?', t); return null; }
  run('UPDATE session SET last_seen = ? WHERE token = ?', now(), t);
  return { user, roles, roleNames, session: s, mfaRequired: priv };
}

/** Attach the acting user to the async context so every audit row records who did it and from where. */
export function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const a = loadSession(req);
  if (a) req.auth = a;
  ctxStore.run({ userId: a?.user.id ?? null, userLabel: a ? `${a.user.name} <${a.user.email}>` : 'public', ip: req.ip, roles: a?.roleNames ?? [] }, next);
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new HttpError(401, 'Please sign in'));
  if (req.auth.mfaRequired && !req.auth.session.mfa_ok) return next(new HttpError(401, 'Two-factor verification required', { mfa: true }));
  next();
}
export const requirePerm = (...perms: string[]) => (req: Request, res: Response, next: NextFunction) => {
  requireUser(req, res, (err?: any) => {
    if (err) return next(err);
    if (!perms.some((p) => can(req.auth!.roleNames, p))) return next(forbidden());
    next();
  });
};
/** Committee chairs see only their own committee. */
export function committeeScope(req: Request): string[] | null {
  const a = req.auth!;
  if (a.roleNames.some((r) => r !== 'chair' && can([r], 'lists.read'))) return null;
  return a.roles.filter((r) => r.role === 'chair').map((r) => r.committee_id);
}

// Rate limiting for login and the public form.
const buckets = new Map<string, { n: number; reset: number }>();
// Expired buckets are swept every few minutes so the map can't grow without bound under heavy traffic.
setInterval(() => { const t = Date.now(); for (const [k, b] of buckets) if (b.reset < t) buckets.delete(k); }, 5 * 60_000).unref();
export function rateLimit(key: string, max: number, windowMs: number) {
  const b = buckets.get(key);
  const t = Date.now();
  if (!b || b.reset < t) { buckets.set(key, { n: 1, reset: t + windowMs }); return; }
  if (++b.n > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}
