import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { createApp } from '../src/index.ts';
import { config } from '../src/config.ts';
import { totp } from '../src/auth.ts';

let base = ''; let server: any;
before(() => { freshDb(); server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => server.close());

async function login(email: string) {
  const res = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dd': '1' }, body: JSON.stringify({ email, password: 'ChangeMe!2026' }) });
  const cookie = res.headers.get('set-cookie')!.split(';')[0];
  const body = await res.json();
  // Admins use two-factor: enrol the first time, then give a code.
  if (body.mfa === 'enroll') { const e = await (await call(cookie, 'POST', '/api/auth/mfa/enroll', {})).json(); secrets[email] = e.secret; await call(cookie, 'POST', '/api/auth/mfa/confirm', { code: totp(e.secret) }); }
  else if (body.mfa) assert.equal((await call(cookie, 'POST', '/api/auth/mfa/verify', { code: totp(secrets[email]) })).status, 200);
  return cookie;
}
const secrets: Record<string, string> = {};
const call = (cookie: string, method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { cookie, 'content-type': 'application/json', 'x-dd': '1' }, body: body ? JSON.stringify(body) : undefined });

test('only the site owner reaches the owner console', async () => {
  const owner = await login('admin@example.org');
  assert.equal((await call(owner, 'GET', '/api/owner/site')).status, 200);
  const desk = await login('desk@example.org');
  assert.equal((await call(desk, 'GET', '/api/owner/site')).status, 403);
  assert.equal((await fetch(`${base}/api/owner/site`)).status, 401);
  const site = await (await call(owner, 'GET', '/api/site')).json();
  assert.equal(site.owner, true);
  assert.equal((await (await fetch(`${base}/api/site`)).json()).owner, false);
});

test('a switched-off feature is refused for visitors but not for the owner, and switches AI off too', async () => {
  const owner = await login('admin@example.org');
  config.ai.enabled = true;
  assert.equal((await call(owner, 'PATCH', '/api/owner/features', { prep: false, ai: false })).status, 200);
  const off = await fetch(`${base}/api/prep/projects`);
  assert.equal(off.status, 403);
  assert.equal((await off.json()).feature, 'prep');
  assert.notEqual((await call(owner, 'GET', '/api/prep/projects')).status, 403, 'the owner can still check it');
  assert.equal(config.ai.enabled, false, 'the AI switch wins over the key');
  assert.equal((await call(owner, 'PATCH', '/api/owner/features', { nope: true })).status, 400);
  assert.equal((await call(owner, 'PATCH', '/api/owner/features', { prep: 'yes' })).status, 400);
  await call(owner, 'PATCH', '/api/owner/features', { prep: true, ai: true });
  assert.notEqual((await fetch(`${base}/api/prep/projects`)).status, 403);
  assert.equal(config.ai.enabled, true);
  config.ai.enabled = false;
});

test('maintenance mode answers 503 to visitors; health, sign-in and the owner still work', async () => {
  const owner = await login('admin@example.org');
  const until = new Date(Date.now() + 3600_000).toISOString();
  assert.equal((await call(owner, 'PATCH', '/api/owner/maintenance', { on: true, message: 'Upgrading the servers', until })).status, 200);
  const r = await fetch(`${base}/api/lectures`);
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.maintenance, true);
  assert.equal(body.error, 'Upgrading the servers');
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const site = await (await fetch(`${base}/api/site`)).json();
  assert.equal(site.maintenance.on, true);
  assert.equal(site.maintenance.until, until);
  assert.equal((await call(owner, 'GET', '/api/lectures')).status, 200, 'the owner is not blocked');
  const desk = await login('desk@example.org');
  assert.ok(desk, 'staff can still sign in');
  assert.equal((await call(desk, 'GET', '/api/auth/me')).status, 200);
  assert.equal((await call(owner, 'PATCH', '/api/owner/maintenance', { until: 'not a date' })).status, 400);
  await call(owner, 'PATCH', '/api/owner/maintenance', { on: false });
  assert.equal((await fetch(`${base}/api/lectures`)).status, 200);
});

test('the owner adds, edits, orders, uploads to and deletes tutor lectures', async () => {
  const owner = await login('admin@example.org');
  const start = (await (await fetch(`${base}/api/lectures`)).json()).lectures;
  assert.equal(start.length, 3, 'the three demo lectures are there from the start');
  assert.ok(start[0].chapters.length > 0 && start[0].video.endsWith('.mp4'));

  assert.equal((await call(owner, 'POST', '/api/owner/lectures', { title: '', tutor: { name: 'X' } })).status, 400);
  assert.equal((await call(owner, 'POST', '/api/owner/lectures', { title: 'T', tutor: { name: 'X' }, video: 'javascript:alert(1)' })).status, 400);
  const res = await call(owner, 'POST', '/api/owner/lectures', { title: 'Crisis committees', level: 'Advanced', tutor: { name: 'Kabir Singh', role: 'Crisis director', accent: '#c2650a' }, video: 'https://youtu.be/dQw4w9WgXcQ', chapters: [{ title: 'Second', at: 90 }, { title: 'First', at: 0 }] });
  assert.equal(res.status, 200);
  const lec = await res.json();
  assert.equal(lec.tutor.initials, 'KS');
  assert.deepEqual(lec.chapters.map((c: any) => c.title), ['First', 'Second'], 'chapters are kept in time order');
  assert.equal(lec.published, false, 'new lectures start as drafts');
  assert.equal((await (await fetch(`${base}/api/lectures`)).json()).lectures.length, 3, 'drafts are hidden from delegates');

  await call(owner, 'PATCH', `/api/owner/lectures/${lec.id}`, { published: true, summary: 'How crisis works' });
  let pub = (await (await fetch(`${base}/api/lectures`)).json()).lectures;
  assert.equal(pub.at(-1).id, lec.id);
  assert.equal(pub.at(-1).summary, 'How crisis works');
  await call(owner, 'POST', `/api/owner/lectures/${lec.id}/move`, { dir: -1 });
  pub = (await (await fetch(`${base}/api/lectures`)).json()).lectures;
  assert.equal(pub.at(-2).id, lec.id, 'moved up one place');

  // Files are checked by their contents: a text file named .mp4 is refused, a real WebVTT file is accepted.
  const up = (kind: string, name: string, data: string | Uint8Array) => { const fd = new FormData(); fd.append('file', new Blob([data as any]), name); return fetch(`${base}/api/owner/lectures/${lec.id}/file?kind=${kind}`, { method: 'POST', headers: { cookie: owner, 'x-dd': '1' }, body: fd }); };
  assert.equal((await up('video', 'fake.mp4', 'not a video at all')).status, 400);
  const vtt = await up('captions', 'c.vtt', 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n');
  assert.equal(vtt.status, 200);
  const { url } = await vtt.json();
  assert.match(url, /^\/media\/lectures\/.+\.vtt$/);
  assert.equal((await fetch(`${base}${url}`)).status, 200);
  const mp4 = new Uint8Array(32); mp4.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  assert.equal((await up('video', 'v.bin', mp4)).status, 200, 'an MP4 is recognised by its bytes, whatever its name');
  assert.equal((await up('nope', 'x', 'x')).status, 400);
  await call(owner, 'PATCH', `/api/owner/lectures/${lec.id}`, { captions: url });

  assert.equal((await call(owner, 'DELETE', `/api/owner/lectures/${lec.id}`)).status, 200);
  assert.equal((await fetch(`${base}${url}`)).status, 404, 'its uploaded files are deleted with it');
  assert.equal((await call(owner, 'GET', `/api/owner/lectures/${lec.id}`)).status, 404);
});
