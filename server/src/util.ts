import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The organiser workspace a request or job runs in. Each workspace has its own database and upload folder.
 * Ids and link tokens made inside a workspace start with its tag ("tabc1234."), so any link routes back to it.
 * The original workspace ("main") has an empty tag, which keeps its existing ids and links unchanged.
 */
export interface Workspace { id: string; tag: string; dir: string | null; db?: unknown }
export const workspaceStore = new AsyncLocalStorage<Workspace>();
const tagged = (s: string) => { const w = workspaceStore.getStore(); return w?.tag ? `${w.tag}.${s}` : s; };
export const uid = () => tagged(crypto.randomUUID());
export const token = (bytes = 24) => tagged(crypto.randomBytes(bytes).toString('base64url'));
export const now = () => new Date().toISOString();
export const sha256 = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}
export const bad = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, details);

// ---- request context (who is acting, from where) used by the audit log ----
export interface Ctx { userId?: string | null; userLabel?: string; ip?: string; roles?: string[] }
export const ctxStore = new AsyncLocalStorage<Ctx>();
export const ctx = (): Ctx => ctxStore.getStore() ?? { userLabel: 'system' };
export function asSystem<T>(fn: () => T): T { return ctxStore.run({ userId: null, userLabel: 'system', ip: 'local' }, fn); }

// ---- money: integer paise only ----
export const rupees = (r: number) => Math.round(r * 100);
/** Multiply paise by basis points, rounding half away from zero once. */
export const bp = (paise: number, basisPoints: number) => {
  const v = (paise * basisPoints) / 10000;
  return v >= 0 ? Math.round(v) : -Math.round(-v);
};
export function inr(paise: number | null | undefined) {
  const p = paise ?? 0;
  const neg = p < 0; const abs = Math.abs(p);
  const r = Math.floor(abs / 100); const ps = abs % 100;
  const s = r.toLocaleString('en-IN') + (ps ? '.' + String(ps).padStart(2, '0') : '');
  return (neg ? '-' : '') + '₹' + s;
}
export function parseMoney(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').replace(/[₹,\s]/g, '').replace(/^INR/i, '');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw bad(`Not an amount: ${v}`);
  return Math.round(n * 100);
}

// ---- dates (IST) ----
export function istDate(d: Date | string = new Date()) {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
}
export function istHour(d: Date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(d));
}
export const addHours = (iso: string | Date, h: number) => new Date(new Date(iso).getTime() + h * 3600_000).toISOString();
export const addDays = (iso: string | Date, d: number) => addHours(iso, d * 24);
/** Indian financial year label for a date, e.g. 2026-10-21 -> "2026-27". */
export function fyOf(date: string) {
  const [y, m] = date.slice(0, 10).split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
export function fyRange(fy: string) {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

// ---- text matching ----
const TITLES = /\b(mr|mrs|ms|miss|dr|prof|sir|madam|shri|smt|kumari|master)\b\.?/g;
export function normalizeName(s: string) {
  return (s ?? '').toLowerCase().replace(TITLES, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** 0..1 similarity, tolerant to typos and word order. */
export function similarity(a: string, b: string) {
  a = normalizeName(a); b = normalizeName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const direct = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  const sa = a.split(' ').sort().join(' '), sb = b.split(' ').sort().join(' ');
  const sorted = 1 - levenshtein(sa, sb) / Math.max(sa.length, sb.length);
  const prefix = b.startsWith(a) || a.startsWith(b) ? 0.85 : 0;
  return Math.max(direct, sorted, prefix);
}
/** Typo-tolerant "does the query appear in this text" test used by list search. */
export function fuzzyIncludes(haystack: string, query: string) {
  const h = haystack.toLowerCase(); const q = query.toLowerCase().trim();
  if (!q) return true;
  if (h.includes(q)) return true;
  if (q.length < 4) return false;
  const maxDist = q.length >= 8 ? 2 : 1;
  for (const word of h.split(/[\s,;|@.]+/)) {
    if (Math.abs(word.length - q.length) <= maxDist && levenshtein(word, q) <= maxDist) return true;
  }
  return false;
}

export const json = <T = any>(s: string | null | undefined, fallback: T): T => {
  if (s == null || s === '') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const normMobile = (s: string) => {
  const raw = String(s ?? '').trim();
  const d = raw.replace(/\D/g, '');
  // International numbers keep their "+country" prefix; Indian ones are stored as the bare 10 digits.
  if (raw.startsWith('+') && !(d.startsWith('91') && d.length === 12)) return `+${d}`;
  return d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
};
export const isIndianMobile = (s: string) => /^[6-9]\d{9}$/.test(normMobile(s));
export const isIntlMobile = (s: string) => /^\+[1-9]\d{7,14}$/.test(normMobile(s));
export const isPan = (s: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test((s ?? '').toUpperCase());
export const isGstin = (s: string) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test((s ?? '').toUpperCase());
export function ageOn(dob: string, on: string) {
  const [y, m, d] = dob.split('-').map(Number); const [Y, M, D] = on.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}
