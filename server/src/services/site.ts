/**
 * Running the whole site, for the site owner (the DelegateDesk team's main workspace):
 * switching parts of the site on and off, maintenance mode, and the tutor video lectures.
 * Everything lives in the platform database, shared by every workspace.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { platformDb, currentWorkspace, MAIN } from '../platform.ts';
import { config, setAiSwitch } from '../config.ts';
import { bad, notFound, now } from '../util.ts';

// ---------- features ----------
export const FEATURES = {
  signup: { label: 'New organisers', help: 'Anyone can list a conference and get an organiser dashboard (/list).', area: 'Organisers' },
  explore: { label: 'Explore conferences', help: 'The public directory of conferences.', area: 'Conferences' },
  jobs: { label: 'Job Board', help: 'Chair, press and secretariat roles posted by organisers.', area: 'Conferences' },
  live: { label: 'Live committee sessions', help: 'The committee room for chairs and delegates (/session).', area: 'Committee' },
  chat: { label: 'Conference chat', help: 'All committees, committee groups and private messages for delegates.', area: 'Committee' },
  accounts: { label: 'Delegate sign-ups', help: 'New delegate accounts. People who already have one can still sign in.', area: 'Delegates' },
  prep: { label: 'Prep studio', help: 'Research, Write, Coach, Practice, Countries, Discover and MUN tools.', area: 'Delegates' },
  masterclass: { label: 'MUN Masterclass', help: 'The course, the exam and the certificate.', area: 'Delegates' },
  videos: { label: 'Video lectures', help: 'Tutor lectures in Prep (manage them under Videos).', area: 'Delegates' },
  ai: { label: 'AI features', help: 'Research briefs, drafts, coaching, practice partners and the dashboard assistant.', area: 'Delegates' },
  services: { label: 'Services', help: 'Mentorship, classes, logistics, EB, legal and financial requests.', area: 'Company' },
  downloads: { label: 'App downloads', help: 'The download page and the /download links.', area: 'Company' },
} as const;
export type Feature = keyof typeof FEATURES;
export interface Maintenance { on: boolean; message: string; until: string | null }

const DB = () => {
  const d = platformDb();
  d.exec(`CREATE TABLE IF NOT EXISTS site_setting (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);
    CREATE TABLE IF NOT EXISTS lecture (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'Beginner', summary TEXT NOT NULL DEFAULT '',
      tutor TEXT NOT NULL, video TEXT NOT NULL DEFAULT '', video_alt TEXT NOT NULL DEFAULT '', poster TEXT NOT NULL DEFAULT '',
      captions TEXT NOT NULL DEFAULT '', chapters TEXT NOT NULL DEFAULT '[]', transcript TEXT NOT NULL DEFAULT '',
      duration REAL, published INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
  return d;
};
const getSetting = <T>(key: string, fallback: T): T => {
  const r = DB().prepare('SELECT value FROM site_setting WHERE key = ?').get(key) as any;
  try { return r ? JSON.parse(r.value) : fallback; } catch { return fallback; }
};
const setSetting = (key: string, value: unknown, by?: string) =>
  DB().prepare('INSERT INTO site_setting (key, value, updated_at, updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by').run(key, JSON.stringify(value), now(), by ?? null);

export function features(): Record<Feature, boolean> {
  const saved = getSetting<Partial<Record<Feature, boolean>>>('features', {});
  return Object.fromEntries((Object.keys(FEATURES) as Feature[]).map((k) => [k, saved[k] !== false])) as Record<Feature, boolean>;
}
export const featureOn = (k: Feature) => features()[k];
setAiSwitch(() => { try { return featureOn('ai'); } catch { return true; } });
export function setFeatures(patch: Record<string, unknown>, by?: string) {
  const cur = features();
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in FEATURES)) throw bad(`Unknown feature: ${k}`);
    if (typeof v !== 'boolean') throw bad('Switch a feature with true or false');
    cur[k as Feature] = v;
  }
  setSetting('features', cur, by);
  return cur;
}
export const maintenance = (): Maintenance => ({ on: false, message: '', until: null, ...getSetting<Partial<Maintenance>>('maintenance', {}) });
export function setMaintenance(p: Partial<Maintenance>, by?: string) {
  const m = maintenance();
  if (typeof p.on === 'boolean') m.on = p.on;
  if (p.message !== undefined) m.message = String(p.message ?? '').trim().slice(0, 500);
  if (p.until !== undefined) {
    const u = p.until ? new Date(String(p.until)) : null;
    if (u && isNaN(u.getTime())) throw bad('Give a valid date and time');
    m.until = u ? u.toISOString() : null;
  }
  setSetting('maintenance', m, by);
  return m;
}

/** The site owner: an admin of the DelegateDesk team's own (main) workspace. */
export const isOwner = (req: Request) => !!req.auth && !(req.auth.mfaRequired && !req.auth.session.mfa_ok) && currentWorkspace().id === MAIN.id && req.auth.roleNames.some((r: string) => r === 'superadmin' || r === 'admin');

// Which requests belong to which feature (server side; the website also hides what is off).
const ROUTES: [Feature, RegExp, string?][] = [
  ['signup', /^\/api\/platform\/launch/, 'POST'],
  ['explore', /^\/api\/platform\/conferences\/?$/],
  ['jobs', /^\/api\/platform\/jobs/],
  ['live', /^\/api\/live(\/|$)/],
  ['chat', /^\/api\/(public\/r\/[^/]+\/chat|admin\/events\/[^/]+\/chat)/],
  ['accounts', /^\/api\/me\/signup/, 'POST'],
  ['prep', /^\/api\/prep(\/|$)/],
  ['services', /^\/api\/platform\/services/, 'POST'],
  ['videos', /^\/api\/lectures/],
  ['downloads', /^\/download\//],
];
// Always reachable in maintenance: health, the site status, signing in (so the owner can get in) and the owner's own tools.
const MAINTENANCE_OPEN = /^\/api\/(health|site|auth\/|owner\/)/;

/** Middleware: maintenance mode and switched-off features. The owner is never blocked. */
export function siteGate(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/download/')) return next();
  if (isOwner(req)) return next();
  const m = maintenance();
  if (m.on && req.path.startsWith('/api/') && !MAINTENANCE_OPEN.test(req.path)) {
    res.status(503).json({ error: m.message || 'DelegateDesk is down for maintenance. Please try again soon.', maintenance: true, until: m.until });
    return;
  }
  const f = features();
  for (const [k, re, method] of ROUTES) {
    if (!f[k] && re.test(req.path) && (!method || req.method === method)) {
      res.status(403).json({ error: `${FEATURES[k].label} is turned off on this site right now.`, feature: k });
      return;
    }
  }
  next();
}

/** What the website needs to know: what is on, maintenance, and whether this visitor runs the site. */
export const siteStatus = (req: Request) => ({ features: features(), maintenance: maintenance(), owner: isOwner(req) });

// ---------- tutor video lectures ----------
export interface Chapter { title: string; at: number }
export interface Tutor { name: string; role: string; initials: string; accent: string }
const MEDIA_DIR = () => path.join(config.uploadDir, 'lectures');
const ACCENTS = ['#1f4fe0', '#0f8a5f', '#a77bff', '#c2650a', '#c0262d', '#0e7490'];

const row2lecture = (r: any) => ({
  id: r.id, title: r.title, level: r.level, summary: r.summary, tutor: JSON.parse(r.tutor) as Tutor,
  video: r.video, videoAlt: r.video_alt, poster: r.poster, captions: r.captions, chapters: JSON.parse(r.chapters) as Chapter[],
  transcript: r.transcript, duration: r.duration, published: !!r.published, sort: r.sort, demo: !!r.demo, updatedAt: r.updated_at,
});

/** The first time: the three demo lectures that ship with DelegateDesk. */
function seedDemo() {
  const d = DB();
  if ((d.prepare('SELECT COUNT(*) n FROM lecture').get() as any).n > 0 || getSetting('lectures_seeded', false)) return;
  const root = path.resolve(import.meta.dirname, '..', '..', '..');
  try {
    const data = JSON.parse(fs.readFileSync(path.join(root, 'web/src/data/lectures.json'), 'utf8'));
    let chapters: any = {};
    try { chapters = JSON.parse(fs.readFileSync(path.join(root, 'web/public/lectures/chapters.json'), 'utf8')); } catch { /* none */ }
    data.lectures.forEach((l: any, i: number) => {
      const ch = chapters[l.id];
      d.prepare(`INSERT INTO lecture (id, title, level, summary, tutor, video, video_alt, poster, captions, chapters, transcript, duration, published, sort, demo, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,1,?,?)`).run(
        l.id, l.title, l.level, l.summary, JSON.stringify({ name: l.tutor.name, role: l.tutor.role, initials: l.tutor.initials, accent: l.tutor.accent }),
        `/lectures/${l.id}.mp4`, `/lectures/${l.id}.webm`, `/lectures/${l.id}.jpg`, `/lectures/${l.id}.vtt`,
        JSON.stringify(l.slides.map((s: any, k: number) => ({ title: s.title, at: ch?.starts?.[k] ?? 0 }))),
        l.slides.map((s: any) => `${s.title}\n${s.say.join(' ')}`).join('\n\n'), ch?.duration ?? null, i, now(), now());
    });
  } catch (e) { console.warn('[lectures] demo lectures not loaded:', (e as Error).message); }
  setSetting('lectures_seeded', true);
}

export function lectures(all = false) {
  seedDemo();
  return (DB().prepare(`SELECT * FROM lecture ${all ? '' : 'WHERE published = 1'} ORDER BY sort, created_at`).all() as any[]).map(row2lecture);
}
export function lecture(id: string) {
  seedDemo();
  const r = DB().prepare('SELECT * FROM lecture WHERE id = ?').get(String(id)) as any;
  if (!r) throw notFound('Lecture');
  return row2lecture(r);
}

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const url = (v: unknown, label: string) => {
  const s = str(v, 600);
  if (!s) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (/^https:\/\//i.test(s)) return s;
  throw bad(`${label} must be a file you uploaded or an https:// link`);
};
function clean(p: any, cur?: ReturnType<typeof row2lecture>) {
  const title = p.title !== undefined ? str(p.title, 140) : cur?.title ?? '';
  if (!title) throw bad('Give the lecture a title');
  const t = { ...(cur?.tutor ?? { name: '', role: '', initials: '', accent: ACCENTS[0] }), ...(p.tutor ?? {}) };
  const tutor: Tutor = { name: str(t.name, 80), role: str(t.role, 120), initials: '', accent: /^#[0-9a-f]{6}$/i.test(t.accent) ? t.accent : ACCENTS[0] };
  if (!tutor.name) throw bad("Give the tutor's name");
  tutor.initials = str(t.initials, 3).toUpperCase() || tutor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const chapters = p.chapters !== undefined
    ? (Array.isArray(p.chapters) ? p.chapters : []).slice(0, 60).map((c: any) => ({ title: str(c?.title, 120), at: Math.max(0, Math.round(Number(c?.at) || 0)) })).filter((c: Chapter) => c.title).sort((a: Chapter, b: Chapter) => a.at - b.at)
    : cur?.chapters ?? [];
  const level = p.level !== undefined ? str(p.level, 30) || 'Beginner' : cur?.level ?? 'Beginner';
  return {
    title, level, tutor, chapters,
    summary: p.summary !== undefined ? str(p.summary, 600) : cur?.summary ?? '',
    video: p.video !== undefined ? url(p.video, 'The video') : cur?.video ?? '',
    videoAlt: p.videoAlt !== undefined ? url(p.videoAlt, 'The second video file') : cur?.videoAlt ?? '',
    poster: p.poster !== undefined ? url(p.poster, 'The poster') : cur?.poster ?? '',
    captions: p.captions !== undefined ? url(p.captions, 'The captions') : cur?.captions ?? '',
    transcript: p.transcript !== undefined ? str(p.transcript, 40000) : cur?.transcript ?? '',
    duration: p.duration !== undefined ? (Number(p.duration) > 0 ? Math.round(Number(p.duration)) : null) : cur?.duration ?? null,
    published: p.published !== undefined ? !!p.published : cur?.published ?? false,
  };
}
export function createLecture(p: any) {
  seedDemo();
  const c = clean(p);
  const id = crypto.randomBytes(6).toString('base64url');
  const sort = ((DB().prepare('SELECT MAX(sort) m FROM lecture').get() as any).m ?? -1) + 1;
  DB().prepare(`INSERT INTO lecture (id, title, level, summary, tutor, video, video_alt, poster, captions, chapters, transcript, duration, published, sort, demo, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`).run(id, c.title, c.level, c.summary, JSON.stringify(c.tutor), c.video, c.videoAlt, c.poster, c.captions, JSON.stringify(c.chapters), c.transcript, c.duration, c.published ? 1 : 0, sort, now(), now());
  return lecture(id);
}
export function updateLecture(id: string, p: any) {
  const cur = lecture(id);
  const c = clean(p, cur);
  DB().prepare(`UPDATE lecture SET title=?, level=?, summary=?, tutor=?, video=?, video_alt=?, poster=?, captions=?, chapters=?, transcript=?, duration=?, published=?, updated_at=? WHERE id=?`)
    .run(c.title, c.level, c.summary, JSON.stringify(c.tutor), c.video, c.videoAlt, c.poster, c.captions, JSON.stringify(c.chapters), c.transcript, c.duration, c.published ? 1 : 0, now(), id);
  return lecture(id);
}
export function deleteLecture(id: string) {
  const cur = lecture(id);
  DB().prepare('DELETE FROM lecture WHERE id = ?').run(id);
  // Remove files that were uploaded for it (the demo files that ship with the site stay).
  for (const f of [cur.video, cur.videoAlt, cur.poster, cur.captions]) if (f.startsWith('/media/lectures/')) fs.rmSync(path.join(MEDIA_DIR(), path.basename(f)), { force: true });
}
export function moveLecture(id: string, dir: -1 | 1) {
  const list = lectures(true);
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) throw notFound('Lecture');
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  const st = DB().prepare('UPDATE lecture SET sort = ? WHERE id = ?');
  list.forEach((l, k) => st.run(k, l.id));
  return lectures(true);
}

// Uploaded lecture files (video, poster, captions), checked by their first bytes, not their names.
const KINDS: Record<string, { exts: Record<string, (b: Buffer) => boolean>; max: number }> = {
  video: { exts: { mp4: (b) => b.subarray(4, 8).toString() === 'ftyp', webm: (b) => b.readUInt32BE(0) === 0x1a45dfa3 }, max: 500 * 1024 * 1024 },
  poster: { exts: { jpg: (b) => b[0] === 0xff && b[1] === 0xd8, png: (b) => b.subarray(1, 4).toString() === 'PNG', webp: (b) => b.subarray(8, 12).toString() === 'WEBP' }, max: 8 * 1024 * 1024 },
  captions: { exts: { vtt: (b) => b.subarray(0, 6).toString().replace(/^﻿/, '').startsWith('WEBVTT') || b.subarray(0, 9).toString().includes('WEBVTT') }, max: 2 * 1024 * 1024 },
};
export const MAX_LECTURE_FILE = KINDS.video.max;
export function saveLectureFile(id: string, kind: string, tmpPath: string, size: number) {
  lecture(id);
  const k = KINDS[kind];
  try {
    if (!k) throw bad('Upload a video, a poster or captions');
    if (size > k.max) throw bad(`That file is too large (up to ${Math.round(k.max / 1024 / 1024)} MB)`);
    const fd = fs.openSync(tmpPath, 'r'); const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    const ext = Object.entries(k.exts).find(([, test]) => test(head))?.[0];
    if (!ext) throw bad(kind === 'video' ? 'Upload an MP4 or WebM video' : kind === 'poster' ? 'Upload a JPG, PNG or WebP image' : 'Upload a WebVTT (.vtt) captions file');
    fs.mkdirSync(MEDIA_DIR(), { recursive: true });
    const name = `${id}-${kind}-${Date.now().toString(36)}.${ext}`;
    try { fs.renameSync(tmpPath, path.join(MEDIA_DIR(), name)); } catch { fs.copyFileSync(tmpPath, path.join(MEDIA_DIR(), name)); } // another disk: copy
    return `/media/lectures/${name}`;
  } finally { fs.rmSync(tmpPath, { force: true }); }
}
export const lectureMediaDir = MEDIA_DIR;

/** Numbers for the owner's overview. */
export function siteNumbers() {
  const d = platformDb();
  const n = (sql: string) => { try { return (d.prepare(sql).get() as any).n as number; } catch { return 0; } };
  return {
    organisers: n("SELECT COUNT(*) n FROM workspace WHERE status = 'active'"),
    listed: n('SELECT COUNT(*) n FROM listing'),
    people: n('SELECT COUNT(*) n FROM person'),
    sessions: n('SELECT COUNT(*) n FROM live_session WHERE ended_at IS NULL'),
    lectures: lectures(true).length,
    inbox: n("SELECT COUNT(*) n FROM inbox_message WHERE status = 'new'"),
  };
}
