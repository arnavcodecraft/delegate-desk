/** Prep: research projects, drafts, coaching, practice, learning progress and briefings (participant accounts). */
import express from 'express';
import { rateLimit } from '../auth.ts';
import { config } from '../config.ts';
import { h, P } from './public.ts';
import { currentPerson, requirePerson } from '../services/people.ts';
import {
  projects, createProject, projectView, updateProject, deleteProject, invite, removeMember, addItem, editItem, deleteItem, myItems, itemView,
  markLearned, progress, aiLeft, DAILY_LIMIT, TEMPLATES, TASKS,
} from '../services/prep.ts';
import { research, runTasks, draft, coach, practice, briefing, compareCountries, PRACTICE, SPEECH_TYPES, PAPER_SECTIONS, WPM } from '../services/prep-ai.ts';

export const prepRouter = express.Router();

prepRouter.get('/meta', h((req) => {
  const p = currentPerson(req);
  return {
    ai: config.ai.enabled, aiLeft: p ? aiLeft(p) : null, aiLimit: DAILY_LIMIT(),
    templates: Object.entries(TEMPLATES).map(([k, v]) => ({ key: k, label: v.label, tasks: v.tasks })), tasks: Object.entries(TASKS).map(([k, v]) => ({ key: k, label: v.label })),
    practice: Object.entries(PRACTICE).map(([k, v]) => ({ key: k, label: v.label })), speechTypes: Object.entries(SPEECH_TYPES).map(([k, v]) => ({ key: k, ...v })), paperSections: PAPER_SECTIONS, wpm: WPM,
    progress: p ? progress(p) : null,
  };
}));
prepRouter.get('/projects', h((req) => ({ projects: projects(requirePerson(req)), items: myItems(requirePerson(req)) })));
prepRouter.post('/projects', h((req) => createProject(requirePerson(req), req.body ?? {})));
prepRouter.get('/projects/:id', h((req) => projectView(requirePerson(req), P(req).id)));
prepRouter.patch('/projects/:id', h((req) => updateProject(requirePerson(req), P(req).id, req.body ?? {})));
prepRouter.delete('/projects/:id', h((req) => { deleteProject(requirePerson(req), P(req).id); return { ok: true }; }));
prepRouter.post('/projects/:id/invite', h((req) => invite(requirePerson(req), P(req).id, req.body?.email, req.body?.role)));
prepRouter.delete('/projects/:id/members/:personId', h((req) => { removeMember(requirePerson(req), P(req).id, P(req).personId); return { ok: true }; }));
prepRouter.post('/projects/:id/tasks', h((req) => runTasks(requirePerson(req), P(req).id, req.body?.tasks ?? [])));
prepRouter.post('/items', h((req) => ({ id: addItem(requirePerson(req), req.body ?? {}) })));
prepRouter.get('/items/:id', h((req) => itemView(requirePerson(req), P(req).id)));
prepRouter.patch('/items/:id', h((req) => { editItem(requirePerson(req), P(req).id, req.body ?? {}); return { ok: true }; }));
prepRouter.delete('/items/:id', h((req) => { deleteItem(requirePerson(req), P(req).id); return { ok: true }; }));

const aiLimit = (req: express.Request) => rateLimit(`prep-ai:${req.ip}`, 60, 60 * 60_000);
prepRouter.post('/research', h(async (req) => { aiLimit(req); return research(requirePerson(req), req.body ?? {}); }));
prepRouter.post('/draft', h(async (req) => { aiLimit(req); return draft(requirePerson(req), req.body ?? {}); }));
prepRouter.post('/coach', h(async (req) => { aiLimit(req); return coach(requirePerson(req), req.body ?? {}); }));
prepRouter.post('/practice', h(async (req) => { aiLimit(req); return practice(requirePerson(req), req.body ?? {}); }));
prepRouter.post('/compare', h(async (req) => { aiLimit(req); return compareCountries(requirePerson(req), req.body?.countries ?? []); }));
prepRouter.post('/briefing', h(async (req) => briefing(currentPerson(req), { topics: req.body?.topics, refresh: !!req.body?.refresh })));

prepRouter.post('/learn', h((req) => markLearned(requirePerson(req), String(req.body?.item ?? ''), req.body?.score ?? null)));
