// Runs DelegateDesk live from this computer, behind your Cloudflare site, through a free Cloudflare Tunnel.
//  1. Asks once for your Cloudflare site address and keys, and saves them in .env
//  2. Downloads cloudflared (Cloudflare's tunnel program) the first time
//  3. Starts the server and the tunnel, then prints the two lines to paste into Cloudflare
// Start it with start-live.bat (Windows) or: node scripts/live.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn, execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
const PORT = 8080;
const win = process.platform === 'win32';
const say = (s = '') => console.log(s);
const box = (lines) => { const w = Math.max(...lines.map((l) => l.length)) + 2; say('┌' + '─'.repeat(w) + '┐'); for (const l of lines) say('│ ' + l.padEnd(w - 1) + '│'); say('└' + '─'.repeat(w) + '┘'); };

// ---------- 1. settings in .env ----------
function readEnv() {
  const out = {};
  if (!fs.existsSync(envFile)) return out;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}
function writeEnv(env) {
  const keep = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !/^\s*[A-Z0-9_]+\s*=/.test(l)) : [];
  const body = [...keep, ...Object.entries(env).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${/[\s#<>"]/.test(v) ? `"${v}"` : v}`)].join('\n') + '\n';
  fs.writeFileSync(envFile, body);
}

async function settings() {
  const env = readEnv();
  // A line queue (rather than rl.question) so typed-ahead or pasted answers are never lost.
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const lines = []; const waiting = []; let closed = false;
  rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
  rl.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
  const nextLine = () => (lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve('') : new Promise((r) => waiting.push(r)));
  const ask = async (q, current, { required = false, check } = {}) => {
    for (let tries = 0; ; tries++) {
      process.stdout.write(`${q}${current ? ` [${current.length > 40 ? current.slice(0, 12) + '…' : current}]` : ''}: `);
      const a = String(await nextLine()).trim() || current || '';
      if (closed && !a && required) throw new Error('No answer given.');
      if (required && !a) { say('  This one is needed.'); continue; }
      if (a && check) { const err = check(a); if (err) { say(`  ${err}`); continue; } }
      return a;
    }
  };
  const first = !env.BASE_URL;
  if (first) {
    say('First-time set-up. Press Enter to keep a value in [brackets], or to skip an optional one.\n');
  }
  env.BASE_URL = (await ask('Your Cloudflare site address (e.g. https://delegatedesk.pages.dev)', env.BASE_URL, {
    required: true, check: (v) => (/^https:\/\/[^/\s]+$/.test(v.replace(/\/+$/, '')) ? null : 'Type the full address starting with https:// (no path), e.g. https://delegatedesk.pages.dev'),
  })).replace(/\/+$/, '');
  if (first || !env.GEMINI_API_KEY) env.GEMINI_API_KEY = await ask('Google AI Studio key for AI features (optional)', env.GEMINI_API_KEY);
  if (env.GEMINI_API_KEY) env.AI_PROVIDER ??= 'gemini';
  if (first || !(env.BREVO_API_KEY || env.RESEND_API_KEY || env.SMTP_URL)) {
    say('\nEmail sends the 6-digit sign-up codes. Free: brevo.com → verify your email under Senders → SMTP & API → API keys.');
    env.BREVO_API_KEY = await ask('Brevo API key (optional but needed for sign-up codes)', env.BREVO_API_KEY);
  }
  if ((env.BREVO_API_KEY || env.RESEND_API_KEY || env.SMTP_URL) && !env.MAIL_FROM) {
    const from = await ask('The email address you verified in Brevo', '', { required: true, check: (v) => (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v) ? null : 'That does not look like an email address') });
    const name = await ask('Name shown on emails', 'DelegateDesk');
    env.MAIL_FROM = `${name} <${from}>`;
  }
  rl.close();
  env.PROXY_SECRET ||= crypto.randomBytes(24).toString('base64url');
  env.APP_SECRET ||= crypto.randomBytes(32).toString('base64url');
  env.TRUST_PROXY = 'true';
  env.PORT ||= String(PORT);
  writeEnv(env);
  say(`\nSaved in ${envFile}\n`);
  return env;
}

// ---------- 2. cloudflared ----------
async function cloudflared() {
  const onPath = (() => { try { execSync(win ? 'where cloudflared' : 'command -v cloudflared', { stdio: 'ignore' }); return 'cloudflared'; } catch { return null; } })();
  if (onPath) return onPath;
  const file = path.join(root, 'tools', win ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(file)) return file;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? '386' : 'amd64';
  const name = win ? `cloudflared-windows-${arch}.exe` : process.platform === 'linux' ? `cloudflared-linux-${arch}` : null;
  if (!name) throw new Error('Install cloudflared first (on a Mac: brew install cloudflared), then run this again.');
  say('Downloading cloudflared (first run only)…');
  const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${name}`);
  if (!r.ok) throw new Error(`Could not download cloudflared (${r.status}). Download it yourself from https://github.com/cloudflare/cloudflared/releases and put it in ${path.dirname(file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  if (!win) fs.chmodSync(file, 0o755);
  return file;
}

// ---------- 3. run ----------
const children = [];
function stopAll() { for (const c of children) { try { win ? execSync(`taskkill /pid ${c.pid} /T /F`, { stdio: 'ignore' }) : process.kill(-c.pid); } catch { /* already stopped */ } } }
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(sig, () => { stopAll(); process.exit(0); });   // SIGHUP: the Windows window was closed
process.on('exit', stopAll);

async function waitFor(url, headers, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(5000) }); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  say('DelegateDesk live\n');
  const env = await settings();
  const bin = await cloudflared();
  const port = Number(env.PORT || PORT);

  say('Starting the server…');
  const server = spawn(win ? 'npm.cmd' : 'npm', ['start'], { cwd: root, shell: win, detached: !win, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(server);
  const log = fs.createWriteStream(path.join(root, 'data-server.log'), { flags: 'a' });
  server.stdout.pipe(log); server.stderr.pipe(log);
  server.on('exit', (code) => { say(`\nThe server stopped (code ${code}). See data-server.log.`); process.exit(1); });
  if (!(await waitFor(`http://localhost:${port}/api/health`, {}, 120_000))) throw new Error('The server did not start within 2 minutes. See data-server.log.');
  say('Server running.');

  say('Opening the Cloudflare Tunnel…');
  const tunnel = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { cwd: root, detached: !win, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  const url = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The tunnel did not give an address within 60 seconds. Check your internet connection and run this again.')), 60_000);
    const onData = (d) => { const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d)); if (m) { clearTimeout(t); resolve(m[0]); } };
    tunnel.stdout.on('data', onData); tunnel.stderr.on('data', onData);
    tunnel.on('exit', (code) => reject(new Error(`cloudflared stopped (code ${code}).`)));
  });
  tunnel.on('exit', () => { say('\nThe tunnel closed. Run start-live again.'); process.exit(1); });
  const reachable = await waitFor(`${url}/api/health`, { 'x-proxy-secret': env.PROXY_SECRET }, 60_000);

  const paste = `BACKEND_URL=${url}\nPROXY_SECRET=${env.PROXY_SECRET}`;
  if (win) { try { execSync('clip', { input: paste }); } catch { /* no clipboard */ } }
  say('');
  box([
    'DelegateDesk is live through Cloudflare Tunnel' + (reachable ? '' : ' (still warming up)'),
    '',
    'In Cloudflare: your site → Settings → Variables and Secrets → Import .env,',
    'paste these two lines' + (win ? ' (already copied: just press Ctrl+V)' : '') + ':',
    '',
    ...paste.split('\n'),
    '',
    'Then deploy again (Pages: upload the delegatedesk-site folder once more).',
    `Check: ${env.BASE_URL}/setup`,
    '',
    'Keep this window open. Closing it takes the site offline.',
    'The tunnel address changes each time you start this: paste the new',
    'BACKEND_URL into Cloudflare and deploy again after every restart.',
  ]);
  if (!env.BREVO_API_KEY && !env.RESEND_API_KEY && !env.SMTP_URL) say('\nNote: no email service is set, so sign-up codes cannot be sent. Run this again and add a Brevo key.');
  await new Promise(() => {});   // keep running
}

main().catch((e) => { say(`\n${e.message}`); stopAll(); process.exit(1); });
