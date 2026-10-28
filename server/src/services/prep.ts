/**
 * Prep: the delegate's workspace. Research projects (a country, committee and topic) hold findings with their
 * sources, drafts and practice transcripts; teammates and advisors can be invited. Learning progress and the
 * daily-challenge streak live here too. AI work is metered per person per day.
 *
 * Everything is in the platform database, owned by participant accounts (services/people.ts).
 */
import crypto from 'node:crypto';
import { peopleDb, type Person } from './people.ts';
import { bad, conflict, forbidden, notFound, now, HttpError } from '../util.ts';

let ready = false;
const D = () => {
  const d = peopleDb();
  if (!ready) {
    d.exec(`CREATE TABLE IF NOT EXISTS prep_project (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, country TEXT, committee TEXT, topic TEXT,
        template TEXT NOT NULL DEFAULT 'country_brief', memory TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS prep_member (project_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL, added_at TEXT NOT NULL, PRIMARY KEY (project_id, person_id));
      CREATE TABLE IF NOT EXISTS prep_invite (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, invited_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (project_id, email));
      CREATE TABLE IF NOT EXISTS prep_item (id TEXT PRIMARY KEY, project_id TEXT, person_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        data TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'done', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ix_prep_item_project ON prep_item(project_id, created_at);
      CREATE TABLE IF NOT EXISTS learn_progress (person_id TEXT NOT NULL, item TEXT NOT NULL, score INTEGER, at TEXT NOT NULL, PRIMARY KEY (person_id, item));
      CREATE TABLE IF NOT EXISTS ai_usage (person_id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (person_id, day));
      CREATE TABLE IF NOT EXISTS briefing (key TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
    ready = true;
  }
  return d;
};
export function resetPrepCache() { ready = false; }
const get = (sql: string, ...a: any[]) => D().prepare(sql).get(...a) as any;
const list = (sql: string, ...a: any[]) => D().prepare(sql).all(...a) as any[];
const exec = (sql: string, ...a: any[]) => D().prepare(sql).run(...a);
const rid = (p: string) => `${p}_${crypto.randomBytes(9).toString('base64url')}`;

export const TEMPLATES: Record<string, { label: string; tasks: string[] }> = {
  country_brief: { label: 'Country brief', tasks: ['background', 'un_action', 'policy', 'voting', 'allies'] },
  position_paper: { label: 'Position paper preparation', tasks: ['background', 'un_action', 'policy', 'solutions'] },
  crisis: { label: 'Crisis preparation', tasks: ['background', 'actors', 'powers', 'scenarios'] },
  resolution: { label: 'Resolution and amendments', tasks: ['un_action', 'allies', 'solutions', 'amendments'] },
};
export const TASKS: Record<string, { label: string; prompt: string }> = {
  background: { label: 'Background', prompt: 'Explain the background of the topic: how it developed, the key facts and figures, and why it matters now.' },
  un_action: { label: 'Past UN action', prompt: 'List the most relevant past UN action on the topic: resolutions (with symbols such as S/RES/2231 (2015)), conventions, reports and bodies, and what each did.' },
  policy: { label: 'Country policy', prompt: "Set out the country's stated policy on the topic, quoting or closely paraphrasing official statements, and what it has done in practice." },
  voting: { label: 'Voting record', prompt: "Summarise the country's voting record on related UN resolutions (for, against, abstained), and anything notable about it." },
  allies: { label: 'Allies and blocs', prompt: 'Identify likely allies, opponents and blocs for the country on this topic, with the evidence for each, and where disagreements are likely.' },
  solutions: { label: 'Solutions', prompt: "Propose realistic solutions the country could champion, each grounded in precedent, with likely support and objections." },
  amendments: { label: 'Likely amendments', prompt: 'Anticipate the amendments other delegations are likely to propose to a draft on this topic, and how the country should respond to each.' },
  actors: { label: 'Key actors', prompt: 'Identify the key state and non-state actors in the crisis, their interests, resources and red lines.' },
  powers: { label: 'Portfolio powers', prompt: 'Describe what a person or delegation in this role could realistically do: powers, levers and constraints, with examples.' },
  scenarios: { label: 'Scenarios', prompt: 'Outline three plausible ways the crisis could develop, the warning signs for each, and directives that would help.' },
};

// ---------- membership ----------
export type Role = 'owner' | 'editor' | 'viewer';
export function access(p: Person, projectId: string) {
  const pr = get('SELECT * FROM prep_project WHERE id = ?', projectId);
  if (!pr) throw notFound('Project');
  const m = get('SELECT role FROM prep_member WHERE project_id = ? AND person_id = ?', projectId, p.id);
  if (!m) throw notFound('Project');
  return { project: pr, role: m.role as Role };
}
const mustEdit = (r: Role) => { if (r === 'viewer') throw forbidden('You can view this project but not change it'); };

/** Pending invitations become memberships once the person has confirmed the invited email. */
function claimInvites(p: Person) {
  if (!p.email_verified_at) return;
  for (const inv of list('SELECT * FROM prep_invite WHERE email = ?', p.email)) {
    exec('INSERT OR IGNORE INTO prep_member (project_id, person_id, role, added_at) VALUES (?, ?, ?, ?)', inv.project_id, p.id, inv.role, now());
    exec('DELETE FROM prep_invite WHERE id = ?', inv.id);
  }
}

export function projects(p: Person) {
  claimInvites(p);
  return list(`SELECT pr.*, m.role, (SELECT COUNT(*) FROM prep_item i WHERE i.project_id = pr.id) AS items, (SELECT COUNT(*) FROM prep_member x WHERE x.project_id = pr.id) AS members
    FROM prep_project pr JOIN prep_member m ON m.project_id = pr.id AND m.person_id = ? ORDER BY pr.updated_at DESC`, p.id);
}
export function createProject(p: Person, b: { title?: string; country?: string; committee?: string; topic?: string; template?: string }) {
  const template = TEMPLATES[b.template ?? ''] ? b.template! : 'country_brief';
  const country = String(b.country ?? '').trim(); const committee = String(b.committee ?? '').trim(); const topic = String(b.topic ?? '').trim();
  const title = String(b.title ?? '').trim() || [country, committee].filter(Boolean).join(' · ') || 'Untitled project';
  if (!topic && !country) throw bad('Give at least a country or a topic');
  const id = rid('pj');
  exec('INSERT INTO prep_project (id, owner_id, title, country, committee, topic, template, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', id, p.id, title.slice(0, 160), country || null, committee || null, topic || null, template, now(), now());
  exec('INSERT INTO prep_member (project_id, person_id, role, added_at) VALUES (?, ?, ?, ?)', id, p.id, 'owner', now());
  return projectView(p, id);
}
export function projectView(p: Person, id: string) {
  const { project, role } = access(p, id);
  const members = list(`SELECT m.person_id, m.role, pe.name, pe.email, pe.role AS kind,
      (SELECT COUNT(*) FROM prep_item i WHERE i.project_id = m.project_id AND i.person_id = m.person_id) AS items FROM prep_member m JOIN person pe ON pe.id = m.person_id WHERE m.project_id = ? ORDER BY m.added_at`, id);
  const items = list('SELECT i.*, pe.name AS author FROM prep_item i LEFT JOIN person pe ON pe.id = i.person_id WHERE i.project_id = ? ORDER BY i.created_at DESC', id)
    .map((i) => ({ ...i, data: JSON.parse(i.data || '{}') }));
  const invites = role === 'owner' ? list('SELECT id, email, role, created_at FROM prep_invite WHERE project_id = ?', id) : [];
  return { project: { ...project, template_label: TEMPLATES[project.template]?.label }, role, members, invites, items, tasks: TEMPLATES[project.template]?.tasks.map((k) => ({ key: k, label: TASKS[k].label })) ?? [] };
}
export function updateProject(p: Person, id: string, b: { title?: string; country?: string; committee?: string; topic?: string; memory?: string }) {
  const { project, role } = access(p, id); mustEdit(role);
  const v = (k: 'title' | 'country' | 'committee' | 'topic' | 'memory', max: number) => (b[k] !== undefined ? String(b[k]).trim().slice(0, max) || (k === 'title' ? project.title : null) : project[k]);
  exec('UPDATE prep_project SET title = ?, country = ?, committee = ?, topic = ?, memory = ?, updated_at = ? WHERE id = ?', v('title', 160), v('country', 80), v('committee', 120), v('topic', 400), v('memory', 6000) ?? '', now(), id);
  return projectView(p, id);
}
export function deleteProject(p: Person, id: string) {
  const { role } = access(p, id);
  if (role !== 'owner') throw forbidden('Only the owner can delete the project');
  for (const t of ['prep_item', 'prep_member', 'prep_invite']) exec(`DELETE FROM ${t} WHERE project_id = ?`, id);
  exec('DELETE FROM prep_project WHERE id = ?', id);
}
export function invite(p: Person, id: string, email: string, r: string) {
  const { role } = access(p, id);
  if (role !== 'owner') throw forbidden('Only the owner can invite people');
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw bad('Enter a valid email');
  const as: Role = r === 'viewer' ? 'viewer' : 'editor';
  const who = get('SELECT * FROM person WHERE email = ? AND email_verified_at IS NOT NULL', e);
  if (who) { exec('INSERT OR REPLACE INTO prep_member (project_id, person_id, role, added_at) VALUES (?, ?, ?, ?)', id, who.id, who.id === p.id ? 'owner' : as, now()); return { added: true }; }
  exec('INSERT OR REPLACE INTO prep_invite (id, project_id, email, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', rid('iv'), id, e, as, p.id, now());
  return { added: false };
}
export function removeMember(p: Person, id: string, personId: string) {
  const { role } = access(p, id);
  if (role !== 'owner' && personId !== p.id) throw forbidden('Only the owner can remove people');
  if (get('SELECT role FROM prep_member WHERE project_id = ? AND person_id = ?', id, personId)?.role === 'owner') throw conflict('The owner cannot be removed');
  exec('DELETE FROM prep_member WHERE project_id = ? AND person_id = ?', id, personId);
}

// ---------- items (findings, drafts, notes, transcripts) ----------
export const KINDS = ['task', 'research', 'paper', 'speech', 'resolution', 'note', 'source', 'practice', 'coach'] as const;
export function addItem(p: Person, b: { projectId?: string | null; kind: string; title: string; body?: string; data?: any; status?: string }) {
  if (!(KINDS as readonly string[]).includes(b.kind)) throw bad('Unknown item');
  if (b.projectId) { const { role } = access(p, b.projectId); mustEdit(role); }
  const id = rid('it');
  exec('INSERT INTO prep_item (id, project_id, person_id, kind, title, body, data, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, b.projectId ?? null, p.id, b.kind, String(b.title ?? '').trim().slice(0, 200) || 'Untitled', String(b.body ?? '').slice(0, 60000), JSON.stringify(b.data ?? {}), b.status ?? 'done', now(), now());
  if (b.projectId) exec('UPDATE prep_project SET updated_at = ? WHERE id = ?', now(), b.projectId);
  return id;
}
export function setItem(id: string, patch: { body?: string; data?: any; status?: string; title?: string }) {
  const it = get('SELECT * FROM prep_item WHERE id = ?', id);
  if (!it) return;
  exec('UPDATE prep_item SET title = ?, body = ?, data = ?, status = ?, updated_at = ? WHERE id = ?', patch.title ?? it.title, patch.body ?? it.body, patch.data !== undefined ? JSON.stringify(patch.data) : it.data, patch.status ?? it.status, now(), id);
}
export function editItem(p: Person, id: string, b: { title?: string; body?: string }) {
  const it = get('SELECT * FROM prep_item WHERE id = ?', id);
  if (!it) throw notFound('Item');
  if (it.project_id) { const { role } = access(p, it.project_id); mustEdit(role); } else if (it.person_id !== p.id) throw notFound('Item');
  setItem(id, { title: b.title !== undefined ? String(b.title).slice(0, 200) : undefined, body: b.body !== undefined ? String(b.body).slice(0, 60000) : undefined });
}
export function deleteItem(p: Person, id: string) {
  const it = get('SELECT * FROM prep_item WHERE id = ?', id);
  if (!it) throw notFound('Item');
  if (it.project_id) { const { role } = access(p, it.project_id); mustEdit(role); } else if (it.person_id !== p.id) throw notFound('Item');
  exec('DELETE FROM prep_item WHERE id = ?', id);
}
export function myItems(p: Person) {
  return list("SELECT id, kind, title, status, created_at, updated_at FROM prep_item WHERE person_id = ? AND project_id IS NULL ORDER BY updated_at DESC LIMIT 100", p.id);
}
export function itemView(p: Person, id: string) {
  const it = get('SELECT * FROM prep_item WHERE id = ?', id);
  if (!it) throw notFound('Item');
  if (it.project_id) access(p, it.project_id); else if (it.person_id !== p.id) throw notFound('Item');
  return { ...it, data: JSON.parse(it.data || '{}') };
}

// ---------- AI metering ----------
export const DAILY_LIMIT = () => Number(process.env.AI_DAILY_LIMIT ?? 50);
export function useAi(p: Person, n = 1) {
  const day = new Date().toISOString().slice(0, 10);
  const used = get('SELECT n FROM ai_usage WHERE person_id = ? AND day = ?', p.id, day)?.n ?? 0;
  if (used + n > DAILY_LIMIT()) throw new HttpError(429, `You have used today's ${DAILY_LIMIT()} AI requests. They refill tomorrow; every tool that doesn't need AI still works.`);
  exec('INSERT INTO ai_usage (person_id, day, n) VALUES (?, ?, ?) ON CONFLICT(person_id, day) DO UPDATE SET n = n + ?', p.id, day, n, n);
}
export function aiLeft(p: Person) {
  const day = new Date().toISOString().slice(0, 10);
  return Math.max(0, DAILY_LIMIT() - (get('SELECT n FROM ai_usage WHERE person_id = ? AND day = ?', p.id, day)?.n ?? 0));
}

// ---------- learning ----------
export function markLearned(p: Person, item: string, score: number | null) {
  if (!/^[a-z0-9:_-]{2,80}$/.test(item)) throw bad('Unknown lesson');
  exec('INSERT INTO learn_progress (person_id, item, score, at) VALUES (?, ?, ?, ?) ON CONFLICT(person_id, item) DO UPDATE SET score = MAX(COALESCE(score, 0), COALESCE(excluded.score, 0)), at = excluded.at', p.id, item, score, now());
  return progress(p);
}
/** Lessons done, and the streak: consecutive days (ending today or yesterday) with a lesson or the daily challenge. */
export function progress(p: Person) {
  const rows = list('SELECT item, score, at FROM learn_progress WHERE person_id = ?', p.id);
  const days = new Set(rows.map((r) => String(r.at).slice(0, 10)));
  let streak = 0; const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { streak++; d.setUTCDate(d.getUTCDate() - 1); }
  return { done: Object.fromEntries(rows.map((r) => [r.item, r.score])), streak, today: days.has(new Date().toISOString().slice(0, 10)) };
}

// ---------- cached briefings ----------
export function cachedBriefing(key: string) { const r = get('SELECT * FROM briefing WHERE key = ?', key); return r ? { ...JSON.parse(r.body), created_at: r.created_at } : null; }
export function saveBriefing(key: string, body: unknown) { exec('INSERT OR REPLACE INTO briefing (key, body, created_at) VALUES (?, ?, ?)', key, JSON.stringify(body), now()); }
