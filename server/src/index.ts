import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { seedChart } from './services/ledger.ts';
import { seedTemplates } from './services/notify.ts';
import { startJobs } from './services/jobs.ts';
import { sessionMiddleware } from './auth.ts';
import { HttpError, asSystem } from './util.ts';
import { publicRouter, webhookRouter, serveFile } from './routes/public.ts';
import { authRouter, adminRouter } from './routes/admin.ts';
import { financeRouter } from './routes/finance.ts';
import './services/documents.ts'; // registers email attachment builders
import './services/badges.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    if (config.baseUrl.startsWith('https')) res.setHeader('strict-transport-security', 'max-age=31536000');
    next();
  });
  // Webhooks need the raw body for signature checks, so they are mounted before the JSON parser.
  app.use('/api/webhooks', webhookRouter);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);
  // CSRF: state-changing staff calls must carry a custom header that cross-site forms cannot set.
  app.use(['/api/admin', '/api/finance', '/api/auth'], (req, _res, next) => {
    if (req.method !== 'GET' && req.headers['x-dd'] !== '1') return next(new HttpError(403, 'Missing request header'));
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/finance', financeRouter);
  app.get('/api/files', serveFile);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  const dist = path.join(config.root, 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File is larger than 5 MB' });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (/immutable|append-only/.test(err?.message ?? '')) return res.status(409).json({ error: err.message });
    if (/UNIQUE constraint failed: seat\.registration_id/.test(err?.message ?? '')) return res.status(409).json({ error: 'That seat was just taken. Please try again.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. The error has been logged.' });
  });
  return app;
}

export function boot(dbFile?: string) {
  openDb(dbFile);
  asSystem(() => { seedChart(); seedTemplates(); });
}

if (/[\\/]index\.ts$/.test(process.argv[1] ?? '')) {
  boot();
  if (config.jobsEnabled) startJobs();
  createApp().listen(config.port, () => console.log(`DelegateDesk running at ${config.baseUrl}`));
}
