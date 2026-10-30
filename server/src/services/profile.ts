/**
 * A participant's own space: conferences they saved, social links and a short bio, and their MUN CV
 * (conferences on DelegateDesk filled in automatically, plus entries they add themselves).
 */
import crypto from 'node:crypto';
import { peopleDb, participations, type Person } from './people.ts';
import { listingBySlug } from '../platform.ts';
import { bad, notFound, now } from '../util.ts';

let ready = false;
const D = () => {
  const d = peopleDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS person_saved (person_id TEXT NOT NULL, slug TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (person_id, slug));
      CREATE TABLE IF NOT EXISTS person_cv (
        id TEXT PRIMARY KEY, person_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, organiser TEXT, role TEXT,
        start TEXT, end TEXT, details TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ix_person_cv ON person_cv(person_id);`);
    ready = true;
  }
  return d;
};

// ---------- saved conferences ----------
export function saved(p: Person) {
  const rows = D().prepare('SELECT slug, saved_at FROM person_saved WHERE person_id = ? ORDER BY saved_at DESC').all(p.id) as any[];
  return rows.map((r) => {
    const l = listingBySlug(r.slug);
    if (!l || l.hidden) return null;
    return { slug: l.slug, name: l.name, acronym: l.acronym, city: l.city, country: l.country, start_date: l.start_date, end_date: l.end_date, logo: l.data?.logo ?? null, published: !!l.published, saved_at: r.saved_at };
  }).filter(Boolean);
}
export function setSaved(p: Person, slug: string, on: boolean) {
  const l = listingBySlug(String(slug ?? ''));
  if (!l) throw notFound('Conference');
  if (on) D().prepare('INSERT OR IGNORE INTO person_saved (person_id, slug, saved_at) VALUES (?, ?, ?)').run(p.id, l.slug, now());
  else D().prepare('DELETE FROM person_saved WHERE person_id = ? AND slug = ?').run(p.id, l.slug);
  return { saved: on };
}
export const isSaved = (p: Person, slug: string) => !!D().prepare('SELECT 1 FROM person_saved WHERE person_id = ? AND slug = ?').get(p.id, String(slug).toLowerCase());

// ---------- social links and bio ----------
const SOCIAL: Record<string, { host: RegExp; base: string; label: string }> = {
  linkedin: { host: /(^|\.)linkedin\.com$/, base: 'https://www.linkedin.com/in/', label: 'LinkedIn' },
  instagram: { host: /(^|\.)instagram\.com$/, base: 'https://www.instagram.com/', label: 'Instagram' },
  x: { host: /(^|\.)(x|twitter)\.com$/, base: 'https://x.com/', label: 'X' },
  website: { host: /./, base: '', label: 'Website' },
};
/** Accepts a full link or a handle (@name) and returns a safe https link, or null to clear it. */
function socialLink(kind: string, v: unknown) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const spec = SOCIAL[kind];
  if (!spec) throw bad('Unknown link');
  if (kind !== 'website' && /^@?[A-Za-z0-9._-]{1,60}$/.test(s)) return spec.base + s.replace(/^@/, '');
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw bad(`That ${spec.label} link doesn't look right`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad(`That ${spec.label} link doesn't look right`);
  if (!spec.host.test(u.hostname.toLowerCase())) throw bad(`Use a ${spec.label} link`);
  u.protocol = 'https:';
  return u.toString().slice(0, 300);
}
export function profileExtras(p: Person) {
  const d = JSON.parse(p.data || '{}');
  return { socials: (d.socials ?? {}) as Record<string, string>, bio: (d.bio ?? '') as string, headline: (d.headline ?? '') as string };
}
export function saveProfileExtras(p: Person, b: { socials?: Record<string, unknown>; bio?: unknown; headline?: unknown }) {
  const d = JSON.parse(p.data || '{}');
  if (b.socials) {
    const next: Record<string, string> = {};
    for (const k of Object.keys(SOCIAL)) { const v = socialLink(k, b.socials[k]); if (v) next[k] = v; }
    d.socials = next;
  }
  if (b.bio !== undefined) d.bio = String(b.bio ?? '').trim().slice(0, 600);
  if (b.headline !== undefined) d.headline = String(b.headline ?? '').trim().slice(0, 120);
  D().prepare('UPDATE person SET data = ? WHERE id = ?').run(JSON.stringify(d), p.id);
  return { socials: d.socials ?? {}, bio: d.bio ?? '', headline: d.headline ?? '' };
}

// ---------- the MUN CV ----------
export const CV_KINDS: Record<string, string> = { mun: 'Model UN', award: 'Award', eb: 'Executive Board / chairing', secretariat: 'Secretariat / organising', debate: 'Debate or youth parliament', other: 'Other' };
const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n) || null;
const month = (v: unknown) => { const s = String(v ?? '').trim(); if (!s) return null; if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s)) throw bad('Dates look like 2026-08 or 2026-08-15'); return s.slice(0, 10); };

export function cv(p: Person) {
  const auto = participations(p).filter((x) => x.status !== 'cancelled' && x.status !== 'rejected' && x.status !== 'withdrawn' && (x.kind !== 'delegate' || x.portfolio))
    .map((x) => ({ source: 'delegatedesk' as const, kind: x.kind === 'delegate' ? 'mun' : x.kind === 'chair' ? 'eb' : 'secretariat', title: x.event, role: x.kind === 'delegate' ? [x.portfolio, x.committee].filter(Boolean).join(', ') : x.title ?? x.kind, start: x.start ?? null, end: x.end ?? null, award: x.award ?? null, link: x.slug ? `/c/${x.slug}` : null }));
  const manual = (D().prepare('SELECT * FROM person_cv WHERE person_id = ? ORDER BY COALESCE(start, created_at) DESC').all(p.id) as any[]).map((r) => ({ ...r, source: 'manual' as const }));
  return { auto, manual, kinds: CV_KINDS, ...profileExtras(p) };
}
function entry(b: Record<string, unknown>) {
  const kind = CV_KINDS[String(b.kind)] ? String(b.kind) : 'other';
  const title = clean(b.title, 140);
  if (!title) throw bad('Add a title, e.g. the conference name');
  const start = month(b.start), end = month(b.end);
  if (start && end && end < start) throw bad('The end is before the start');
  return { kind, title, organiser: clean(b.organiser, 140), role: clean(b.role, 140), start, end, details: clean(b.details, 800) };
}
export function addCv(p: Person, b: Record<string, unknown>) {
  const count = (D().prepare('SELECT COUNT(*) AS n FROM person_cv WHERE person_id = ?').get(p.id) as any).n;
  if (count >= 200) throw bad('That is a lot of entries; remove some first');
  const e = entry(b); const id = crypto.randomUUID();
  D().prepare('INSERT INTO person_cv (id, person_id, kind, title, organiser, role, start, end, details, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id, p.id, e.kind, e.title, e.organiser, e.role, e.start, e.end, e.details, now());
  return { id };
}
export function updateCv(p: Person, id: string, b: Record<string, unknown>) {
  const e = entry(b);
  const r = D().prepare('UPDATE person_cv SET kind = ?, title = ?, organiser = ?, role = ?, start = ?, end = ?, details = ? WHERE id = ? AND person_id = ?').run(e.kind, e.title, e.organiser, e.role, e.start, e.end, e.details, id, p.id);
  if (!Number(r.changes)) throw notFound('Entry');
}
export function removeCv(p: Person, id: string) {
  D().prepare('DELETE FROM person_cv WHERE id = ? AND person_id = ?').run(id, p.id);
}
export function deleteProfileData(personId: string) {
  D().prepare('DELETE FROM person_saved WHERE person_id = ?').run(personId);
  D().prepare('DELETE FROM person_cv WHERE person_id = ?').run(personId);
}
