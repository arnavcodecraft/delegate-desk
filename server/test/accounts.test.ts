import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { one, all } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { totp } from '../src/auth.ts';
import { asSystem } from '../src/util.ts';
import { register } from '../src/services/registrations.ts';

let base = ''; let server: any;
before(() => { freshDb(); server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => server.close());

const jar = () => {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', 'x-dd': '1' }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) { const [kv] = c.split(';'); const [k] = kv.split('='); cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')), kv].join('; '); }
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return call;
};
const lastMail = (to: string, key: string) => one('SELECT * FROM notification WHERE recipient = ? AND template_key = ? ORDER BY created_at DESC LIMIT 1', to, key);

test('an admin invites a team member, who sets a password from the emailed link and signs in', async () => {
  const admin = jar();
  await admin('POST', '/api/auth/login', { email: 'admin@example.org', password: 'ChangeMe!2026' });
  const en = await admin('POST', '/api/auth/mfa/enroll', {});
  await admin('POST', '/api/auth/mfa/confirm', { code: totp(en.body.secret) });
  const inv = await admin('POST', '/api/admin/users', { name: 'Sana Secretariat', email: 'sana@example.org', roles: [{ role: 'secretariat' }] });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  assert.match(inv.body.inviteLink, /\/invite\//);
  const mail = lastMail('sana@example.org', 'staff_invite');
  assert.ok(mail.body.includes(inv.body.inviteLink));
  const tok = inv.body.inviteLink.split('/invite/')[1];
  const sana = jar();
  assert.equal((await sana('GET', `/api/auth/link/${tok}`)).body.email, 'sana@example.org');
  assert.equal((await sana('POST', `/api/auth/link/${tok}`, { password: 'short' })).status, 400);
  assert.equal((await sana('POST', `/api/auth/link/${tok}`, { password: 'my-own-pass-123' })).status, 200);
  const me = await sana('GET', '/api/auth/me');
  assert.ok(me.body.perms.includes('alloc.config'));
  assert.ok(!me.body.perms.includes('payments.approve'), 'secretariat cannot move money');
  assert.equal((await sana('POST', `/api/auth/link/${tok}`, { password: 'another-pass-123' })).status, 400, 'links work once');
  const users = (await admin('GET', '/api/admin/users')).body.users;
  assert.ok(users.find((u: any) => u.email === 'sana@example.org').last_login_at);
});

test('forgotten staff password: reset link, old sessions signed out', async () => {
  const anon = jar();
  assert.equal((await anon('POST', '/api/auth/forgot', { email: 'desk@example.org' })).status, 200);
  assert.equal((await anon('POST', '/api/auth/forgot', { email: 'nobody@example.org' })).status, 200, 'same answer for unknown emails');
  const link = /\/reset\/(\S+)/.exec(lastMail('desk@example.org', 'staff_password_reset').body)![1];
  assert.equal((await anon('POST', `/api/auth/link/${link}`, { password: 'brand-new-pass-1' })).status, 200);
  const again = jar();
  assert.equal((await again('POST', '/api/auth/login', { email: 'desk@example.org', password: 'brand-new-pass-1' })).status, 200);
});

test('participant accounts: sign up, confirm email with a code, see every registration made with that email', async () => {
  const ev = one('SELECT * FROM event')!;
  asSystem(() => register(ev.id, { full_name: 'Riya Account', email: 'riya@example.com', mobile: '9876500011', institution: 'X', class_year: '11', city: 'Pune', dob: '2007-01-01', preferences: [], consent: true } as any));
  const riya = jar();
  const up = await riya('POST', '/api/me/signup', { name: 'Riya', email: 'riya@example.com', password: 'riya-pass-123' });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  let me = await riya('GET', '/api/me');
  assert.equal(me.body.person.verified, false);
  assert.equal(me.body.conferences.length, 0, 'nothing shown before the email is confirmed');
  assert.equal((await riya('POST', '/api/me/verify', { code: '000000' })).status, 400);
  const code = /\b(\d{6})\b/.exec(lastMail('riya@example.com', 'account_code').body)![1];
  assert.equal((await riya('POST', '/api/me/verify', { code })).status, 200);
  me = await riya('GET', '/api/me');
  assert.equal(me.body.conferences.length, 1);
  assert.match(me.body.conferences[0].link, /^\/r\//);
  assert.equal((await jar()('POST', '/api/me/signup', { name: 'X', email: 'riya@example.com', password: 'whatever-123' })).status, 409);
  await riya('POST', '/api/me/logout');
  assert.equal((await riya('GET', '/api/me')).body.person, null);
  // Forgotten password by code.
  await riya('POST', '/api/me/forgot', { email: 'riya@example.com' });
  const rc = /\b(\d{6})\b/.exec(lastMail('riya@example.com', 'account_code').body)![1];
  assert.equal((await riya('POST', '/api/me/reset', { email: 'riya@example.com', code: rc, password: 'riya-new-pass-1' })).status, 200);
  assert.equal((await riya('GET', '/api/me')).body.person.email, 'riya@example.com');
  assert.ok(all('SELECT * FROM notification WHERE template_key = ?', 'account_code').length >= 2);
});
