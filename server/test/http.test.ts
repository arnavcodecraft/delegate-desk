import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { one, run } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { totp } from '../src/auth.ts';

let base = ''; let server: any;
before(() => { freshDb(); server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => server.close());

async function login(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: JSON.stringify({ email, password: 'ChangeMe!2026' }) });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  return { cookie, body: await res.json() };
}
const call = (cookie: string, method: string, path: string, body?: unknown, csrf = true) =>
  fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', ...(csrf ? { 'x-dd': '1' } : {}) }, body: body ? JSON.stringify(body) : undefined });

test('public registration over HTTP returns the allotment and a delegate link', async () => {
  const ev = await (await fetch(`${base}/api/public/events/BGYS27`)).json();
  assert.ok(ev.committees.length >= 5);
  const res = await fetch(`${base}/api/public/events/BGYS27/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name: 'Http Delegate', email: 'http@example.com', mobile: '9876543210', institution: 'X', class_year: '12', city: 'Pune', dob: '2005-02-02', preferences: [ev.committees[0].id], consent: true }) });
  const out = await res.json();
  assert.equal(res.status, 200, JSON.stringify(out));
  assert.ok(out.allocation.portfolio);
  const portal = await (await fetch(`${base}/api/public/r/${out.token}`)).json();
  assert.equal(portal.registration.full_name, 'Http Delegate');
  assert.ok(portal.payment.gateways.some((g: any) => g.name === 'mock'));
  const bad = await fetch(`${base}/api/public/events/BGYS27/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name: 'X', email: 'bad', mobile: '1', consent: false }) });
  assert.equal(bad.status, 400);
  assert.ok((await bad.json()).details.fields.email);
});

test('two-factor is mandatory for finance roles before any finance API works', async () => {
  const { cookie, body } = await login('cfo@example.org');
  assert.equal(body.mfa, 'enroll');
  const ev = one('SELECT id FROM event')!;
  assert.equal((await call(cookie, 'GET', `/api/finance/events/${ev.id}/dashboard`)).status, 401);
  const enroll = await (await call(cookie, 'POST', '/api/auth/mfa/enroll', {})).json();
  assert.ok(enroll.qr.startsWith('data:image/png'));
  const ok = await call(cookie, 'POST', '/api/auth/mfa/confirm', { code: totp(enroll.secret) });
  assert.equal(ok.status, 200);
  assert.equal((await call(cookie, 'GET', `/api/finance/events/${ev.id}/dashboard`)).status, 200);
});

test('permissions are enforced on the server and state changes need the CSRF header', async () => {
  const { cookie } = await login('desk@example.org');
  const ev = one('SELECT id FROM event')!;
  assert.equal((await call(cookie, 'GET', `/api/finance/books/trial-balance`)).status, 403, 'desk cannot see books');
  assert.equal((await call(cookie, 'POST', `/api/finance/evidence/x/approve`, {})).status, 403, 'desk cannot approve payments');
  assert.equal((await call(cookie, 'GET', `/api/admin/events/${ev.id}/lists/master`)).status, 200);
  assert.equal((await call(cookie, 'POST', `/api/admin/events/${ev.id}/reminders`, {}, false)).status, 403, 'missing CSRF header');
  const chair = await login('chair.unsc@example.org');
  assert.equal((await call(chair.cookie, 'GET', `/api/admin/events/${ev.id}/lists/master`)).status, 403, 'chairs only see their committee');
  const unsc = one("SELECT id FROM committee WHERE short = 'UNSC'")!;
  assert.equal((await call(chair.cookie, 'GET', `/api/admin/events/${ev.id}/lists/committee?committee=${unsc.id}`)).status, 200);
  const other = one("SELECT id FROM committee WHERE short = 'LS'")!;
  assert.equal((await call(chair.cookie, 'GET', `/api/admin/events/${ev.id}/lists/committee?committee=${other.id}`)).status, 400);
  const auditor = await login('auditor@example.org');
  assert.equal((await call(auditor.cookie, 'GET', `/api/finance/books/trial-balance`)).status, 200, 'auditor reads books');
  assert.equal((await call(auditor.cookie, 'POST', `/api/finance/books/locks`, { period: '2026-01' })).status, 403, 'auditor cannot write');
});

test('sandbox checkout over HTTP and the webhook endpoint rejects bad signatures', async () => {
  const reg = one("SELECT token FROM registration WHERE email = 'http@example.com'")!;
  const order = await (await fetch(`${base}/api/public/r/${reg.token}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gateway: 'mock' }) })).json();
  const done = await (await fetch(`${base}/api/public/sandbox/${order.orderId}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome: 'success' }) })).json();
  assert.match(done.result, /captured/);
  const portal = await (await fetch(`${base}/api/public/r/${reg.token}`)).json();
  assert.equal(portal.registration.payment_status, 'paid');
  assert.equal(portal.invoices.length, 1);
  const pdf = await fetch(`${base}/api/public/r/${reg.token}/invoice/${portal.invoices[0].id}`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.ok((await pdf.arrayBuffer()).byteLength > 1000);
  const forged = await fetch(`${base}/api/webhooks/razorpay`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' }, body: '{"event":"payment.captured"}' });
  assert.equal(forged.status, 401);
});
