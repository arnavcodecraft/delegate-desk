import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.ts';
import { openDb, all } from './db.ts';
import { seedChart } from './services/ledger.ts';
import http from 'node:http';
import { freePort } from './port.ts';
import { siteGate, lectureMediaDir } from './services/site.ts';
import { siteRouter, ownerRouter } from './routes/site.ts';
import { seedTemplates } from './services/notify.ts';
import { startJobs } from './services/jobs.ts';
import { sessionMiddleware } from './auth.ts';
import { HttpError, asSystem, workspaceStore } from './util.ts';
import { resolveWorkspace, allWorkspaces, inWorkspace, claimCode } from './platform.ts';
import { syncListing, migrateLegacyPaymentDetails } from './services/conference.ts';
import { publicRouter, webhookRouter, serveFile } from './routes/public.ts';
import { authRouter, adminRouter } from './routes/admin.ts';
import { financeRouter } from './routes/finance.ts';
import { organiserRouter } from './routes/organiser.ts';
import { teamspaceRouter } from './routes/teamspace.ts';
import { meRouter } from './routes/me.ts';
import { mailConfigured, mailProvider } from './services/mail.ts';
import { showCodesOnScreen } from './services/people.ts';
import { useGemini } from './services/gemini.ts';
import { createRequire } from 'node:module';
const VERSION: string = createRequire(import.meta.url)('../../package.json').version;
import { prepRouter } from './routes/prep.ts';
import { platformRouter, liveRouter } from './routes/platform.ts';
import './services/documents.ts'; // registers email attachment builders
import './services/badges.ts';

export function createApp() {
  const app = express();
  // Hops of trusted proxies in front of the app (1 = one load balancer; 2 = Cloudflare Pages in front of a hosting platform's proxy).
  // "true" trusts the left-most address (only safe with PROXY_SECRET, where the Cloudflare worker sets it).
  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    res.setHeader('permissions-policy', 'camera=(self), microphone=(self), display-capture=(self), geolocation=()');
    if (config.baseUrl.startsWith('https')) res.setHeader('strict-transport-security', 'max-age=31536000');
    next();
  });
  // Webhooks need the raw body for signature checks, so they are mounted before the JSON parser.
  app.use('/api/webhooks', webhookRouter);
  // The onboarding wizard sends the logo and banner inline, so its one call gets a larger body limit.
  app.use('/api/platform/launch', express.json({ limit: '14mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  // Every request runs inside one organiser's workspace (its own database and files).
  app.use((req, _res, next) => workspaceStore.run(resolveWorkspace(req), next));
  app.use(sessionMiddleware);
  // Maintenance mode and switched-off features (the site owner is never blocked).
  app.use(siteGate);
  // CSRF: state-changing staff calls must carry a custom header that cross-site forms cannot set.
  app.use(['/api/admin', '/api/finance', '/api/auth', '/api/platform', '/api/me', '/api/prep'], (req, _res, next) => {
    if (req.method !== 'GET' && req.headers['x-dd'] !== '1') return next(new HttpError(403, 'Missing request header'));
    next();
  });
  // App downloads from this site: each link sends the file straight from the latest release (no repository page).
  const DOWNLOADS: Record<string, string> = { android: 'DelegateDesk-android.apk', windows: 'DelegateDesk-win-x64.exe', mac: 'DelegateDesk-mac-universal.dmg', linux: 'DelegateDesk-linux-x86_64.AppImage', 'linux-deb': 'DelegateDesk-linux-amd64.deb' };
  const downloadBase = (process.env.DOWNLOAD_BASE || 'https://github.com/arnavcodecraft/delegate-desk/releases/latest/download').replace(/\/+$/, '');
  app.get('/download/:platform', (req, res, next) => { const f = DOWNLOADS[req.params.platform]; if (!f) return next(); res.redirect(302, `${downloadBase}/${f}`); });
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'delegatedesk', version: VERSION, time: new Date().toISOString() }));
  // Behind Cloudflare Pages: with PROXY_SECRET set, only requests forwarded by the Pages worker are served.
  if (process.env.PROXY_SECRET) app.use('/api', (req, _res, next) => (req.headers['x-proxy-secret'] === process.env.PROXY_SECRET ? next() : next(new HttpError(403, 'Use the site address, not the server address'))));
  // What the /setup page checks. Says whether things are configured, never what the secrets are.
  app.get('/api/setup-status', (req, res) => res.json({
    app: 'delegatedesk', version: VERSION, baseUrl: config.baseUrl,
    seenAs: `${req.protocol}://${req.get('x-forwarded-host') ?? req.get('host')}`,
    mail: { configured: mailConfigured(), provider: mailProvider(), from: config.mailFrom }, codesOnScreen: showCodesOnScreen(),
    ai: config.ai.enabled, aiProvider: config.ai.enabled ? (useGemini() ? 'gemini' : 'anthropic') : null, proxySecret: !!process.env.PROXY_SECRET, production: process.env.NODE_ENV === 'production',
  }));
  app.use('/api', siteRouter);
  app.use('/api/owner', ownerRouter);
  app.use('/media/lectures', express.static(lectureMediaDir(), { maxAge: '7d' }), (_req, res) => { res.status(404).json({ error: 'Not found' }); });
  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin', organiserRouter);
  app.use('/api/admin', teamspaceRouter);
  app.use('/api/platform', platformRouter);
  app.use('/api/live', liveRouter);
  app.use('/api/me', meRouter);
  app.use('/api/prep', prepRouter);
  app.use('/api/finance', financeRouter);
  app.get('/api/files', serveFile);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  const dist = path.join(config.root, 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, {
      index: false, maxAge: '1h',
      // The service worker and manifest must update promptly; built assets are hashed and can be cached for long.
      setHeaders: (res, file) => { if (/[\\/](sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader('cache-control', 'no-cache'); else if (/[\\/]assets[\\/]/.test(file)) res.setHeader('cache-control', 'public, max-age=31536000, immutable'); },
    }));
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
  // Register the main workspace's conference codes and listings so public links and Explore can find them.
  for (const w of allWorkspaces()) inWorkspace(w, () => asSystem(() => { migrateLegacyPaymentDetails(); for (const e of all('SELECT id, code FROM event')) { try { claimCode(e.code, e.id); syncListing(e.id); } catch (err) { console.warn('[listing]', (err as Error).message); } } }));
}

if (/[\\/]index\.ts$/.test(process.argv[1] ?? '')) {
  // A stray error in a background job or a dropped connection is logged; it never takes the whole site down.
  process.on('uncaughtException', (e) => console.error('[uncaught]', e));
  process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
  // The port first, before the databases open: an old server that is paused or stuck can hold them locked.
  freePort(config.port).then(() => {
    boot();
    if (config.jobsEnabled) startJobs();
    http.createServer(createApp())
      .on('listening', () => console.log(`DelegateDesk running at ${config.baseUrl}`))
      .on('error', (e: any) => { console.error(e?.code === 'EADDRINUSE' ? `\nPort ${config.port} became busy. Run "npm run stop", then "npm start" again.\n` : e); process.exit(1); })
      .listen(config.port);
  });
}
