import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { freshDb, user } from './helpers.ts';
import { one, run } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { onlyApprover, totp } from '../src/auth.ts';

let base = ''; let server: any;
before(() => { freshDb(); server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => server.close());

test('onlyApprover is true only when no other active user holds the permission', () => {
  const cfo = user('cfo@example.org').id;
  assert.equal(onlyApprover('payments.approve', cfo), false, 'demo has a second CFO');
  run(`UPDATE user SET active = 0 WHERE id IN (SELECT user_id FROM user_role WHERE role IN ('cfo','admin','superadmin','accountant')) AND id <> ?`, cfo);
  const others = one(`SELECT COUNT(*) AS n FROM user u JOIN user_role r ON r.user_id = u.id WHERE u.active = 1 AND u.id <> ? AND r.role IN ('cfo','superadmin')`, cfo)!.n;
  if (others === 0) assert.equal(onlyApprover('refund.approve', cfo), true);
  run('UPDATE user SET active = 1');
  assert.equal(onlyApprover('no.such.permission', cfo), false);
});

test('event PATCH only takes rules; profile, fees and payment settings are refused there', async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: JSON.stringify({ email: 'admin@example.org', password: 'ChangeMe!2026' }) });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const call = (method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', 'x-dd': '1' }, body: body ? JSON.stringify(body) : undefined });
  const enroll = await (await call('POST', '/api/auth/mfa/enroll', {})).json();
  assert.equal((await call('POST', '/api/auth/mfa/confirm', { code: totp(enroll.secret) })).status, 200);
  const ev = one('SELECT id FROM event')!;
  const ok = await call('PATCH', `/api/admin/events/${ev.id}`, { settings: { holdHours: 36 } });
  assert.equal(ok.status, 200, await ok.clone().text());
  const bad = await call('PATCH', `/api/admin/events/${ev.id}`, { settings: { paymentMethods: {}, profile: { venue: 'x' } } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /changed elsewhere/);
  const name = await call('PATCH', `/api/admin/events/${ev.id}`, { name: 'Renamed here' });
  assert.equal(name.status, 400);
});
