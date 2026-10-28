/**
 * Participant accounts: delegates, advisors, chairs and anyone preparing for MUN.
 *
 * They live in the platform database (not in an organiser's workspace) because one person registers for many
 * conferences run by different organisers. "My conferences" is found by the account's verified email across every
 * workspace, so nobody can see registrations for an address they have not proved they own.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { platformDb, inWorkspace, MAIN, workspaceById, listings } from '../platform.ts';
import { hashPassword, verifyPassword } from '../auth.ts';
import { config } from '../config.ts';
import { bad, conflict, now, HttpError } from '../util.ts';
import { enqueue, deliverOne } from './notify.ts';
import { mailConfigured } from './mail.ts';
import { all } from '../db.ts';

const COOKIE = 'dd_pid';
const SESSION_DAYS = 30;
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

let ready = false;
export const peopleDb = () => {
  const d = platformDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS person (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL,
        email_verified_at TEXT, school TEXT, city TEXT, role TEXT NOT NULL DEFAULT 'delegate', data TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, last_login_at TEXT);
      CREATE TABLE IF NOT EXISTS person_session (token_hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS person_code (email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (email, purpose));`);
    ready = true;
  }
  return d;
};
export function resetPeopleCache() { ready = false; }
const D = () => peopleDb();
const get = (sql: string, ...a: any[]) => D().prepare(sql).get(...a) as any;
const exec = (sql: string, ...a: any[]) => D().prepare(sql).run(...a);

export type Person = { id: string; email: string; name: string; email_verified_at: string | null; school: string | null; city: string | null; role: string; data: string; created_at: string };
const pub = (p: Person) => ({ id: p.id, email: p.email, name: p.name, verified: !!p.email_verified_at, school: p.school, city: p.city, role: p.role, prefs: JSON.parse(p.data || '{}') });

// ---------- codes (email verification and password reset) ----------
function sendCode(email: string, name: string, purpose: 'verify' | 'reset') {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  exec(`INSERT INTO person_code (email, purpose, code_hash, expires_at, attempts) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(email, purpose) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`,
    email, purpose, hash(code), new Date(Date.now() + 15 * 60_000).toISOString());
  // Platform mail goes out through the main workspace's outbox and mail settings.
  inWorkspace(MAIN, () => {
    const id = enqueue('account_code', { to: email, recipientKind: 'person', vars: { name, code, purpose: purpose === 'verify' ? 'Enter it to confirm your email and see your conferences.' : 'Enter it to choose a new password.' } });
    // Codes go out straight away; if the provider refuses, the regular delivery run retries.
    if (mailConfigured()) deliverOne(id).catch((e) => console.error('[mail] code to', email, 'not sent yet:', e?.message ?? e));
  });
  return code;
}
function checkCode(email: string, purpose: 'verify' | 'reset', code: string) {
  const row = get('SELECT * FROM person_code WHERE email = ? AND purpose = ?', email, purpose);
  if (!row || row.expires_at < now()) throw bad('That code has expired. Ask for a new one.');
  if (row.attempts >= 5) throw bad('Too many tries. Ask for a new code.');
  if (row.code_hash !== hash(String(code ?? '').trim())) { exec('UPDATE person_code SET attempts = attempts + 1 WHERE email = ? AND purpose = ?', email, purpose); throw bad('That code is not right'); }
  exec('DELETE FROM person_code WHERE email = ? AND purpose = ?', email, purpose);
}

// ---------- sign-up, sign-in ----------
export function signUp(o: { name: string; email: string; password: string; role?: string; school?: string; city?: string }) {
  const email = String(o.email ?? '').trim().toLowerCase();
  const name = String(o.name ?? '').trim();
  if (!name) throw bad('Enter your name');
  if (!EMAIL_RE.test(email)) throw bad('Enter a valid email');
  if (get('SELECT 1 FROM person WHERE email = ?', email)) throw conflict('An account with this email already exists. Sign in instead.');
  const role = ['delegate', 'advisor', 'chair', 'other'].includes(String(o.role)) ? String(o.role) : 'delegate';
  const id = 'p_' + crypto.randomUUID();
  exec('INSERT INTO person (id, email, name, password_hash, school, city, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, email, name, hashPassword(o.password), o.school?.trim() || null, o.city?.trim() || null, role, now());
  const code = sendCode(email, name, 'verify');
  return Object.assign(get('SELECT * FROM person WHERE id = ?', id) as Person, { devCode: devCode(code) });
}
export function signIn(email: string, password: string) {
  const p = get('SELECT * FROM person WHERE email = ?', String(email ?? '').trim().toLowerCase());
  if (!p || !verifyPassword(password ?? '', p.password_hash)) throw bad('Email or password is incorrect');
  exec('UPDATE person SET last_login_at = ? WHERE id = ?', now(), p.id);
  return p as Person;
}
export function startPersonSession(res: Response, personId: string) {
  const t = crypto.randomBytes(32).toString('base64url');
  exec('INSERT INTO person_session (token_hash, person_id, created_at, expires_at) VALUES (?, ?, ?, ?)', hash(t), personId, now(), new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString());
  res.cookie(COOKIE, t, { httpOnly: true, sameSite: 'lax', secure: config.baseUrl.startsWith('https'), maxAge: SESSION_DAYS * 86400_000, path: '/' });
}
export function endPersonSession(req: Request, res: Response) {
  const t = req.cookies?.[COOKIE];
  if (t) exec('DELETE FROM person_session WHERE token_hash = ?', hash(t));
  res.clearCookie(COOKIE, { path: '/' });
}
export function currentPerson(req: Request): Person | null {
  const t = req.cookies?.[COOKIE];
  if (!t) return null;
  const s = get('SELECT * FROM person_session WHERE token_hash = ?', hash(t));
  if (!s || s.expires_at < now()) return null;
  return (get('SELECT * FROM person WHERE id = ?', s.person_id) as Person) ?? null;
}
export function requirePerson(req: Request): Person {
  const p = currentPerson(req);
  if (!p) throw new HttpError(401, 'Sign in to your account first');
  return p;
}

export function verifyEmail(p: Person, code: string) {
  checkCode(p.email, 'verify', code);
  exec('UPDATE person SET email_verified_at = ? WHERE id = ?', now(), p.id);
}
export function resendVerification(p: Person) {
  if (p.email_verified_at) throw conflict('Your email is already confirmed');
  return devCode(sendCode(p.email, p.name, 'verify'));
}
export function forgot(email: string) {
  const p = get('SELECT * FROM person WHERE email = ?', String(email ?? '').trim().toLowerCase());
  return p ? devCode(sendCode(p.email, p.name, 'reset')) : null;
}
/** With no mail server configured (a local install), the code is shown on screen instead, or nobody could ever confirm. */
/**
 * With no email service on a local install, the code is shown on screen so the app still works.
 * A live site (production) never shows it: anyone could otherwise claim someone else's email.
 */
export const showCodesOnScreen = () => !mailConfigured() && (process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEV_CODES === '1');
const devCode = (code: string) => (showCodesOnScreen() ? code : undefined);
export function resetWithCode(email: string, code: string, password: string) {
  const e = String(email ?? '').trim().toLowerCase();
  const p = get('SELECT * FROM person WHERE email = ?', e);
  if (!p) throw bad('That code is not right');
  checkCode(e, 'reset', code);
  // Proving you can read the inbox also confirms the email.
  exec('UPDATE person SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', hashPassword(password), now(), p.id);
  exec('DELETE FROM person_session WHERE person_id = ?', p.id);
  return p as Person;
}
export function changePassword(p: Person, current: string, next: string) {
  const row = get('SELECT password_hash FROM person WHERE id = ?', p.id);
  if (!verifyPassword(current ?? '', row.password_hash)) throw bad('Current password is wrong');
  exec('UPDATE person SET password_hash = ? WHERE id = ?', hashPassword(next), p.id);
}
export function updateProfile(p: Person, b: { name?: string; school?: string; city?: string; role?: string; prefs?: Record<string, unknown> }) {
  const name = b.name !== undefined ? String(b.name).trim() : p.name;
  if (!name) throw bad('Enter your name');
  const role = b.role && ['delegate', 'advisor', 'chair', 'other'].includes(b.role) ? b.role : p.role;
  const prefs = { ...JSON.parse(p.data || '{}'), ...(b.prefs ?? {}) };
  exec('UPDATE person SET name = ?, school = ?, city = ?, role = ?, data = ? WHERE id = ?', name, b.school !== undefined ? String(b.school).trim() || null : p.school, b.city !== undefined ? String(b.city).trim() || null : p.city, role, JSON.stringify(prefs), p.id);
}
export function deleteAccount(p: Person, password: string) {
  const row = get('SELECT password_hash FROM person WHERE id = ?', p.id);
  if (!verifyPassword(password ?? '', row.password_hash)) throw bad('Password is wrong');
  exec('DELETE FROM person_session WHERE person_id = ?', p.id);
  exec('DELETE FROM person WHERE id = ?', p.id);
  for (const t of ['prep_project', 'prep_item', 'prep_member', 'learn_progress']) {
    try { D().prepare(`DELETE FROM ${t} WHERE person_id = ?`).run(p.id); } catch { /* table not created yet */ }
  }
}

/** Every registration and application made with this (verified) email, across all organisers. */
export function participations(p: Person) {
  if (!p.email_verified_at) return [];
  const spaces = [MAIN, ...(platformDb().prepare("SELECT id FROM workspace WHERE status = 'active'").all() as any[]).map((r) => workspaceById(r.id)).filter(Boolean)];
  const slugs = new Map(listings({ includeUnpublished: true }).map((l: any) => [l.event_id, l.slug]));
  const out: any[] = [];
  for (const w of spaces) {
    inWorkspace(w!, () => {
      const q = (sql: string, ...a: any[]) => all(sql, ...a);
      for (const r of q(`SELECT r.token, r.ref, r.full_name, r.allot_status, r.payment_status, r.created_at, r.cancelled_at, e.id AS event_id, e.name AS event, e.code, e.start_date, e.end_date, c.name AS committee, po.name AS portfolio
          FROM registration r JOIN event e ON e.id = r.event_id LEFT JOIN seat s ON s.registration_id = r.id LEFT JOIN portfolio po ON po.id = s.portfolio_id LEFT JOIN committee c ON c.id = po.committee_id
          WHERE lower(r.email) = ? AND r.erased_at IS NULL ORDER BY r.created_at DESC`, p.email))
        out.push({ kind: 'delegate', link: `/r/${r.token}`, ref: r.ref, event: r.event, code: r.code, slug: slugs.get(r.event_id) ?? null, start: r.start_date, end: r.end_date, committee: r.committee, portfolio: r.portfolio, status: r.cancelled_at ? 'cancelled' : r.allot_status, payment: r.payment_status, at: r.created_at });
      for (const a of q(`SELECT a.token, a.role, a.status, a.created_at, a.assigned_title, e.id AS event_id, e.name AS event, e.code, e.start_date, e.end_date FROM role_application a JOIN event e ON e.id = a.event_id WHERE lower(a.email) = ? ORDER BY a.created_at DESC`, p.email))
        out.push({ kind: a.role, link: `/application/${a.token}`, event: a.event, code: a.code, slug: slugs.get(a.event_id) ?? null, start: a.start_date, end: a.end_date, title: a.assigned_title, status: a.status, at: a.created_at });
    });
  }
  return out.sort((a, b) => String(b.start ?? b.at).localeCompare(String(a.start ?? a.at)));
}

export const personView = pub;
