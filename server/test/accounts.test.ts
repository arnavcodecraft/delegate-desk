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

test('many people signing up at once: every account is created, the server stays responsive, and a same-email race has one winner', async () => {
  const N = 40;
  process.env.SIGNUP_PER_IP_HOUR = '1000';   // every test request comes from 127.0.0.1
  const t0 = Date.now();
  const results = await Promise.all([...Array(N)].map((_, i) => jar()('POST', '/api/me/signup', { name: `Load ${i}`, email: `load${i}@example.com`, password: `load-pass-${i}-xyz` })));
  assert.deepEqual(results.map((r) => r.status), Array(N).fill(200), JSON.stringify(results.find((r) => r.status !== 200)?.body));
  // While hashing runs on the thread pool, other requests keep being answered quickly.
  const health = await Promise.all([fetch(`${base}/api/health`), ...[...Array(5)].map((_, i) => jar()('POST', '/api/me/signup', { name: 'Race', email: 'race@example.com', password: `race-pass-${i}-xyz` }))]);
  assert.equal((health[0] as Response).status, 200);
  const race = (health.slice(1) as { status: number }[]).map((r) => r.status).sort();
  assert.deepEqual(race, [200, 409, 409, 409, 409], 'exactly one account for a duplicated email');
  const { peopleDb } = await import('../src/services/people.ts');
  assert.equal((peopleDb().prepare("SELECT COUNT(*) AS n FROM person WHERE email LIKE 'load%@example.com'").get() as any).n, N);
  assert.ok(Date.now() - t0 < 30_000, `took ${Date.now() - t0} ms`);
  const login = await jar()('POST', '/api/me/login', { email: 'load7@example.com', password: 'load-pass-7-xyz' });
  assert.equal(login.status, 200);
  assert.equal((await jar()('POST', '/api/me/login', { email: 'load7@example.com', password: 'wrong-password' })).status, 400);
  assert.equal((await jar()('POST', '/api/me/login', { email: 'nobody-here@example.com', password: 'wrong-password' })).status, 400);
});

test('one sign-in for everyone: the same form signs in team accounts and participant accounts', async () => {
  const d = jar();
  assert.equal((await d('POST', '/api/me/signup', { name: 'Uma', email: 'uma@example.com', password: 'uma-pass-12345' })).status, 200);
  const p = jar();
  const r = await p('POST', '/api/auth/login', { email: 'uma@example.com', password: 'uma-pass-12345' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.kind, 'person');
  assert.equal((await p('GET', '/api/me')).body.person.email, 'uma@example.com');
  const s = jar();
  const staff = await s('POST', '/api/auth/login', { email: 'desk@example.org', password: 'brand-new-pass-1' });
  assert.equal(staff.body.kind, 'staff');
  assert.equal((await jar()('POST', '/api/auth/login', { email: 'uma@example.com', password: 'wrong-password' })).status, 400);
});

const tinyDraft = (acronym: string) => ({
  name: `${acronym} Model United Nations`, acronym, banner: 'p3', startDate: '2027-05-10', endDate: '2027-05-11', format: 'in_person', level: 'high_school', country: 'in', city: 'Pune', expected: 40,
  committees: [{ type: 'mun', name: 'General Assembly', short: 'GA', perCountry: 1, portfolios: [{ name: 'India' }, { name: 'Japan' }] }], free: true, uses: [],
});

test('one account, both roles: an organiser sign-in also opens their delegate profile, and signing out ends both', async () => {
  const s = jar();
  const r = await s('POST', '/api/auth/login', { email: 'desk@example.org', password: 'brand-new-pass-1' });
  assert.equal(r.body.kind, 'staff'); assert.equal(r.body.person, true);
  assert.equal((await s('GET', '/api/me')).body.person.email, 'desk@example.org');
  // The delegate profile shares the password: the same email and password signs straight in either way.
  assert.equal((await s('POST', '/api/me/logout')).status, 200);
  assert.equal((await s('GET', '/api/me')).body.person, null);
  assert.equal((await s('GET', '/api/auth/me')).body.user ?? null, null);
});

test('a delegate creates a conference with the account they already have, then one sign-in opens both', async () => {
  const d = jar();
  await d('POST', '/api/me/signup', { name: 'Ria Delegate', email: 'ria@example.com', password: 'ria-pass-12345' });
  const out = await d('POST', '/api/platform/launch', { draft: tinyDraft('RIAMUN'), account: { organisation: 'Ria Society' }, usePerson: true });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal((await d('GET', '/api/auth/me')).body.user.email, 'ria@example.com');
  assert.equal((await d('GET', '/api/me')).body.person.email, 'ria@example.com');
  const again = jar();
  const r = await again('POST', '/api/auth/login', { email: 'ria@example.com', password: 'ria-pass-12345' });
  assert.equal(r.body.kind, 'staff'); assert.equal(r.body.person, true);
  assert.equal((await jar()('POST', '/api/platform/launch', { draft: tinyDraft('NOPE'), account: {}, usePerson: true })).status, 400);
});

test('an organiser account made with someone else\'s email never opens that person\'s delegate profile', async () => {
  await jar()('POST', '/api/me/signup', { name: 'Vic', email: 'vic@example.com', password: 'vic-real-pass-1' });
  const x = jar();
  const out = await x('POST', '/api/platform/launch', { draft: tinyDraft('VICMUN'), account: { name: 'Not Vic', email: 'vic@example.com', password: 'attacker-pass-1', organisation: 'X' } });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal((await x('GET', '/api/me')).body.person, null);
  assert.equal((await x('POST', '/api/me/from-staff')).status, 409);
  assert.equal((await x('POST', '/api/me/from-staff', { password: 'attacker-pass-1' })).status, 409);
  assert.equal((await jar()('POST', '/api/auth/login', { email: 'vic@example.com', password: 'attacker-pass-1' })).body.person, false);
  // The real owner, signed in as the organiser, links them by typing the delegate password once.
  const ok = await x('POST', '/api/me/from-staff', { password: 'vic-real-pass-1' });
  assert.equal(ok.status, 200); assert.equal(ok.body.person.email, 'vic@example.com');
});
