// Builds the Cloudflare Pages upload: the web app plus the worker that forwards /api to the server.
// Output: cloudflare-pages/ (upload the folder, or zip its contents). See CLOUDFLARE.md.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'cloudflare-pages');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'web', 'dist'), out, { recursive: true });
for (const f of ['_worker.js', '_headers']) fs.copyFileSync(path.join(root, 'cloudflare', f), path.join(out, f));
const count = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
const n = count(out);
console.log(`cloudflare-pages/ is ready: ${n} files${n > 1000 ? ' (over the 1,000-file drag-and-drop limit: use wrangler pages deploy)' : ''}.`);

// The same site as a Cloudflare Worker with static assets (for "wrangler deploy"): cloudflare-worker/
const wk = path.join(root, 'cloudflare-worker');
fs.rmSync(wk, { recursive: true, force: true });
fs.cpSync(path.join(root, 'web', 'dist'), path.join(wk, 'public'), { recursive: true });
fs.copyFileSync(path.join(root, 'cloudflare', '_headers'), path.join(wk, 'public', '_headers'));
fs.copyFileSync(path.join(root, 'cloudflare', '_worker.js'), path.join(wk, 'worker.js'));
for (const f of ['wrangler.jsonc', 'deploy.bat']) fs.copyFileSync(path.join(root, 'cloudflare', 'worker', f), path.join(wk, f));
console.log('cloudflare-worker/ is ready (deploy with deploy.bat or npx wrangler deploy).');
