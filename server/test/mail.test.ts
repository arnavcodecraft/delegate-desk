import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { one } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { resetMailer } from '../src/services/mail.ts';

const got: { path: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
let fake: http.Server; let fakeUrl = ''; let base = ''; let app: any;
before(async () => {
  fake = http.createServer((req, res) => { let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => { got.push({ path: req.url!, headers: req.headers, body: JSON.parse(raw) }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(req.url!.includes('/v3/') ? { messageId: '<brevo-1>' } : { id: 'resend-1' })); }); });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  freshDb(); app = createApp().listen(0); base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
});
after(() => { fake.close(); app.close(); delete process.env.RESEND_API_KEY; delete process.env.BREVO_API_KEY; });
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const waitFor = async (fn: () => boolean) => { for (let i = 0; i < 50 && !fn(); i++) await new Promise((r) => setTimeout(r, 20)); };

test('with Resend set up, the sign-up code is emailed at once and never shown on screen', async () => {
  process.env.RESEND_API_KEY = 're_test'; process.env.RESEND_BASE_URL = fakeUrl; resetMailer();
  const r = await post('/api/me/signup', { name: 'Mira', email: 'mira@example.com', password: 'mira-pass-123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.devCode, undefined);
  await waitFor(() => got.length > 0);
  const m = got.at(-1)!;
  assert.equal(m.path, '/emails');
  assert.equal(m.headers.authorization, 'Bearer re_test');
  assert.deepEqual(m.body.to, ['mira@example.com']);
  assert.match(m.body.text, /Your code is \d{6}/);
  const n = one("SELECT * FROM notification WHERE recipient = 'mira@example.com' AND template_key = 'account_code'");
  assert.equal(n.status, 'sent'); assert.equal(n.provider_message_id, 'resend-1');
});

test('Brevo works the same way', async () => {
  delete process.env.RESEND_API_KEY; process.env.BREVO_API_KEY = 'xkeysib-test'; process.env.BREVO_BASE_URL = fakeUrl; resetMailer();
  const before = got.length;
  await post('/api/me/forgot', { email: 'mira@example.com' });
  await waitFor(() => got.length > before);
  const m = got.at(-1)!;
  assert.equal(m.path, '/v3/smtp/email');
  assert.equal(m.headers['api-key'], 'xkeysib-test');
  assert.equal(m.body.to[0].email, 'mira@example.com');
  assert.match(m.body.textContent, /\d{6}/);
});

test('a live site with no email service never shows codes on screen and says email is missing', async () => {
  delete process.env.BREVO_API_KEY; resetMailer();
  const prev = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; delete process.env.ALLOW_DEV_CODES;
  const r = await post('/api/me/signup', { name: 'Noor', email: 'noor@example.com', password: 'noor-pass-123' });
  assert.equal(r.body.devCode, undefined);
  assert.equal(r.body.mail, false);
  const st = await (await fetch(`${base}/api/setup-status`)).json();
  assert.equal(st.mail.configured, false); assert.equal(st.codesOnScreen, false); assert.equal(st.app, 'delegatedesk');
  process.env.ALLOW_DEV_CODES = '1';
  const local = await post('/api/me/signup', { name: 'Ola', email: 'ola@example.com', password: 'ola-pass-1234' });
  assert.match(local.body.devCode, /^\d{6}$/, 'local installs can opt in to codes on screen');
  process.env.NODE_ENV = prev; delete process.env.ALLOW_DEV_CODES;
});
