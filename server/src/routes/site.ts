/** The site owner console (features, maintenance, tutor lectures) and the public site status and lectures. */
import express from 'express';
import multer from 'multer';
import os from 'node:os';
import { requirePerm, rateLimit } from '../auth.ts';
import { audit } from '../audit.ts';
import { bad, forbidden } from '../util.ts';
import { h, P } from './public.ts';
import { currentWorkspace, MAIN } from '../platform.ts';
import {
  FEATURES, features, setFeatures, maintenance, setMaintenance, siteStatus, siteNumbers,
  lectures, lecture, createLecture, updateLecture, deleteLecture, moveLecture, saveLectureFile, MAX_LECTURE_FILE,
} from '../services/site.ts';

export const siteRouter = express.Router();
siteRouter.get('/site', h((req) => siteStatus(req)));
siteRouter.get('/lectures', h(() => ({ lectures: lectures() })));

export const ownerRouter = express.Router();
// The DelegateDesk team only: an admin of the main workspace.
ownerRouter.use(requirePerm('platform.owner'), (_req, _res, next) => next(currentWorkspace().id === MAIN.id ? undefined : forbidden('Only the site owner can do that')));
const who = (req: express.Request) => `${req.auth!.user.name} <${req.auth!.user.email}>`;
ownerRouter.get('/site', h(() => ({ features: features(), labels: FEATURES, maintenance: maintenance(), numbers: siteNumbers() })));
ownerRouter.patch('/features', h((req) => { const f = setFeatures(req.body ?? {}, who(req)); audit('site.features', 'site', 'features', req.body); return { features: f }; }));
ownerRouter.patch('/maintenance', h((req) => { const m = setMaintenance(req.body ?? {}, who(req)); audit('site.maintenance', 'site', 'maintenance', { on: m.on }); return { maintenance: m }; }));
ownerRouter.get('/lectures', h(() => ({ lectures: lectures(true) })));
ownerRouter.post('/lectures', h((req) => { const l = createLecture(req.body ?? {}); audit('lecture.create', 'lecture', l.id); return l; }));
ownerRouter.get('/lectures/:id', h((req) => lecture(P(req).id)));
ownerRouter.patch('/lectures/:id', h((req) => { const l = updateLecture(P(req).id, req.body ?? {}); audit('lecture.update', 'lecture', l.id); return l; }));
ownerRouter.delete('/lectures/:id', h((req) => { deleteLecture(P(req).id); audit('lecture.delete', 'lecture', P(req).id); return { ok: true }; }));
ownerRouter.post('/lectures/:id/move', h((req) => ({ lectures: moveLecture(P(req).id, req.body?.dir === -1 ? -1 : 1) })));
// Files go to disk while they upload (videos can be large), then are checked and moved into place.
const big = multer({ dest: os.tmpdir(), limits: { fileSize: MAX_LECTURE_FILE, files: 1 } });
ownerRouter.post('/lectures/:id/file', (req, res, next) => { try { rateLimit(`lecfile:${req.ip}`, 60, 60 * 60_000); } catch (e) { return next(e); } big.single('file')(req, res, next); },
  h((req) => {
    if (!req.file) throw bad('Choose a file');
    const url = saveLectureFile(P(req).id, String(req.query.kind ?? ''), req.file.path, req.file.size);
    return { url };
  }));
