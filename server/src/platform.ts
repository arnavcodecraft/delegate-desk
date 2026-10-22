/**
 * The platform layer: many independent organisers ("workspaces") on one deployment.
 *
 * Each workspace has its own database file and upload folder, so its delegates, money and books never mix with
 * another organiser's. The platform database only holds what is needed to route a request to the right workspace
 * (staff emails, conference codes, workspace tags) and the public listing that powers Explore and the Job Board.
 * The original deployment is the "main" workspace: it keeps its database file and has an empty tag.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { workspaceStore, type Workspace, conflict, now } from './util.ts';

export const MAIN: Workspace = { id: 'main', tag: '', dir: null };
const TAG_RE = /^t[a-z0-9]{7}$/;

let pdb: DatabaseSync | null = null;
const opened = new Map<string, Workspace>();

const platformFile = () => process.env.PLATFORM_DB_PATH ?? path.join(path.dirname(config.dbPath), 'platform.db');
const workspacesRoot = () => path.join(path.dirname(config.dbPath), 'workspaces');

export function platformDb() {
  if (pdb) return pdb;
  const file = platformFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  pdb = new DatabaseSync(file);
  pdb.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS workspace (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS staff_email (email TEXT PRIMARY KEY, workspace_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_code (code TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, event_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS listing (
      event_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, code TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
      published INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0,
      name TEXT NOT NULL, acronym TEXT, country TEXT, city TEXT, start_date TEXT, end_date TEXT,
      data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS position_listing (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, workspace_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_pos_event ON position_listing(event_id);`);
  return pdb;
}
/** Close the platform database (tests point it at a fresh file between runs). */
export function closePlatform() { pdb?.close(); pdb = null; opened.clear(); }

const P = () => platformDb();

// ---------- workspaces ----------
export function newTag() {
  for (;;) {
    const tag = 't' + Array.from(crypto.randomBytes(7), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    if (!P().prepare('SELECT 1 FROM workspace WHERE id = ?').get(tag)) return tag;
  }
}

/** Load (and open the database of) a workspace by id. Returns null for unknown ids. */
export function workspaceById(id: string): Workspace | null {
  if (!id || id === 'main') return MAIN;
  const cached = opened.get(id);
  if (cached) return cached;
  if (!TAG_RE.test(id)) return null;
  const row = P().prepare("SELECT * FROM workspace WHERE id = ? AND status = 'active'").get(id) as any;
  if (!row) return null;
  const dir = path.join(workspacesRoot(), id);
  const w: Workspace = { id, tag: id, dir, db: openDatabase(path.join(dir, 'workspace.db')) };
  opened.set(id, w);
  return w;
}

/** Create an empty workspace (database and folders). The caller seeds it inside inWorkspace(). */
export function createWorkspace(name: string, ownerEmail: string): Workspace {
  const id = newTag();
  P().prepare('INSERT INTO workspace (id, name, owner_email, created_at) VALUES (?, ?, ?, ?)').run(id, name, ownerEmail.trim().toLowerCase(), now());
  return workspaceById(id)!;
}

export const inWorkspace = <T>(w: Workspace, fn: () => T): T => workspaceStore.run(w, fn);
export const currentWorkspace = (): Workspace => workspaceStore.getStore() ?? MAIN;

export function allWorkspaces(): Workspace[] {
  const ids = (P().prepare("SELECT id FROM workspace WHERE status = 'active' ORDER BY created_at").all() as any[]).map((r) => r.id);
  return [MAIN, ...ids.map((id) => workspaceById(id)).filter(Boolean) as Workspace[]];
}
export const workspaceRow = (id: string) => P().prepare('SELECT * FROM workspace WHERE id = ?').get(id) as any;

// ---------- routing registries ----------
/** Staff emails are unique across the platform so the sign-in form knows which workspace to open. */
export function claimEmail(email: string) {
  const e = email.trim().toLowerCase();
  const w = currentWorkspace().id;
  const row = P().prepare('SELECT workspace_id FROM staff_email WHERE email = ?').get(e) as any;
  if (row && row.workspace_id !== w) throw conflict('That email already belongs to another organiser on this platform. Use a different email.');
  if (!row) P().prepare('INSERT INTO staff_email (email, workspace_id) VALUES (?, ?)').run(e, w);
}
export const emailTaken = (email: string) => !!P().prepare('SELECT 1 FROM staff_email WHERE email = ?').get(email.trim().toLowerCase());
export function workspaceForEmail(email: string): Workspace {
  const row = P().prepare('SELECT workspace_id FROM staff_email WHERE email = ?').get(String(email ?? '').trim().toLowerCase()) as any;
  return (row && workspaceById(row.workspace_id)) || MAIN;
}

/** Conference codes are unique platform-wide because the public link is built from them. */
export function claimCode(code: string, eventId: string) {
  const c = code.trim().toUpperCase();
  const w = currentWorkspace().id;
  const row = P().prepare('SELECT * FROM event_code WHERE code = ?').get(c) as any;
  if (row && !(row.workspace_id === w && row.event_id === eventId)) throw conflict(`The link name ${c} is taken. Try another.`);
  if (!row) P().prepare('INSERT INTO event_code (code, workspace_id, event_id) VALUES (?, ?, ?)').run(c, w, eventId);
}
export const codeTaken = (code: string) => !!P().prepare('SELECT 1 FROM event_code WHERE code = ?').get(code.trim().toUpperCase());
export function workspaceForCode(code: string): Workspace | null {
  const row = P().prepare('SELECT workspace_id FROM event_code WHERE code = ?').get(String(code ?? '').trim().toUpperCase()) as any;
  return row ? workspaceById(row.workspace_id) : null;
}
export function workspaceForSlug(slug: string): { w: Workspace; eventId: string } | null {
  const row = P().prepare('SELECT workspace_id, event_id FROM listing WHERE slug = ?').get(String(slug ?? '').toLowerCase()) as any;
  if (!row) return null;
  const w = workspaceById(row.workspace_id);
  return w ? { w, eventId: row.event_id } : null;
}

/** Find the workspace an id, token or link belongs to from its tag ("tabc1234.…"). */
export function workspaceForTagged(value: string): Workspace | null {
  const m = /(?:^|[^a-z0-9])(t[a-z0-9]{7})\./.exec(String(value ?? ''));
  return m ? workspaceById(m[1]) : null;
}

/**
 * Pick the workspace for an HTTP request. Explicit identifiers in the URL win (tagged ids/tokens, conference
 * codes, listing slugs), then the sign-in email, then the staff session cookie; otherwise the main workspace.
 * A session token only exists inside its own workspace, so a mismatched pick can never grant access.
 */
export function resolveWorkspace(req: { path: string; query: any; body?: any; cookies?: any }): Workspace {
  if (typeof req.query?.w === 'string') { const w = workspaceById(req.query.w); if (w) return w; }
  const segments = req.path.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  const values = [...segments, ...Object.values(req.query ?? {}).flat().map(String)];
  for (const v of values) { const w = workspaceForTagged(v); if (w) return w; }
  for (const v of values) {
    if (/^[A-Za-z0-9-]{2,40}$/.test(v)) {
      const byCode = /^[A-Za-z0-9]{2,20}$/.test(v) ? workspaceForCode(v) : null;
      if (byCode) return byCode;
      const bySlug = workspaceForSlug(v);
      if (bySlug) return bySlug.w;
    }
  }
  if (req.body?.email && /\/auth\/(login|forgot)/.test(req.path)) return workspaceForEmail(req.body.email);
  const cookie = req.cookies?.dd_sid;
  if (cookie) { const w = workspaceForTagged(cookie); if (w) return w; }
  return MAIN;
}

// ---------- public listing (Explore, conference pages, Job Board) ----------
export interface ListingInput { eventId: string; code: string; slug: string; published: boolean; name: string; acronym?: string | null; country?: string | null; city?: string | null; startDate?: string | null; endDate?: string | null; data: Record<string, any> }
export function upsertListing(l: ListingInput) {
  const w = currentWorkspace().id;
  const clash = P().prepare('SELECT event_id FROM listing WHERE slug = ?').get(l.slug) as any;
  if (clash && clash.event_id !== l.eventId) throw conflict('That conference link is taken');
  P().prepare(`INSERT INTO listing (event_id, workspace_id, code, slug, published, name, acronym, country, city, start_date, end_date, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_id) DO UPDATE SET code = excluded.code, slug = excluded.slug, published = excluded.published, name = excluded.name, acronym = excluded.acronym,
      country = excluded.country, city = excluded.city, start_date = excluded.start_date, end_date = excluded.end_date, data = excluded.data, updated_at = excluded.updated_at`)
    .run(l.eventId, w, l.code, l.slug, l.published ? 1 : 0, l.name, l.acronym ?? null, l.country ?? null, l.city ?? null, l.startDate ?? null, l.endDate ?? null, JSON.stringify(l.data), now());
}
export const slugTaken = (slug: string, exceptEvent?: string) => {
  const r = P().prepare('SELECT event_id FROM listing WHERE slug = ?').get(slug) as any;
  return !!r && r.event_id !== exceptEvent;
};
export function listings(o: { includeUnpublished?: boolean } = {}) {
  const rows = P().prepare(`SELECT * FROM listing WHERE hidden = 0 ${o.includeUnpublished ? '' : 'AND published = 1'} ORDER BY COALESCE(start_date, '9999') ASC, name`).all() as any[];
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
}
export function listingBySlug(slug: string) {
  const r = P().prepare('SELECT * FROM listing WHERE slug = ?').get(String(slug).toLowerCase()) as any;
  return r ? { ...r, data: JSON.parse(r.data) } : null;
}
export function listingForEvent(eventId: string) {
  const r = P().prepare('SELECT * FROM listing WHERE event_id = ?').get(eventId) as any;
  return r ? { ...r, data: JSON.parse(r.data) } : null;
}
export function setHidden(eventId: string, hidden: boolean) { P().prepare('UPDATE listing SET hidden = ? WHERE event_id = ?').run(hidden ? 1 : 0, eventId); }

export function replacePositions(eventId: string, positions: { id: string; data: Record<string, any> }[]) {
  const w = currentWorkspace().id;
  P().prepare('DELETE FROM position_listing WHERE event_id = ?').run(eventId);
  const ins = P().prepare('INSERT INTO position_listing (id, event_id, workspace_id, data, updated_at) VALUES (?, ?, ?, ?, ?)');
  for (const p of positions) ins.run(p.id, eventId, w, JSON.stringify(p.data), now());
}
export function positionListings() {
  return (P().prepare(`SELECT p.*, l.slug, l.name AS conference, l.acronym, l.country, l.city, l.start_date, l.end_date, l.data AS ldata FROM position_listing p
    JOIN listing l ON l.event_id = p.event_id WHERE l.published = 1 AND l.hidden = 0 ORDER BY p.updated_at DESC`).all() as any[])
    .map((r) => ({ ...JSON.parse(r.data), id: r.id, slug: r.slug, conference: r.conference, acronym: r.acronym, country: r.country, city: r.city, start_date: r.start_date, end_date: r.end_date, logo: JSON.parse(r.ldata).logo ?? null }));
}

export function platformStats() {
  const l = P().prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT country) AS countries FROM listing WHERE published = 1 AND hidden = 0').get() as any;
  const d = (P().prepare('SELECT data FROM listing WHERE published = 1 AND hidden = 0').all() as any[]).reduce((s, r) => s + (JSON.parse(r.data).delegates ?? 0), 0);
  return { conferences: l.n, countries: l.countries, delegates: d, organisers: (P().prepare("SELECT COUNT(*) AS n FROM workspace WHERE status = 'active'").get() as any).n + 1 };
}
