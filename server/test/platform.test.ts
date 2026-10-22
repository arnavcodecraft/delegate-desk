import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { one } from '../src/db.ts';
import { createApp } from '../src/index.ts';
import { workspaceForEmail, inWorkspace, listingBySlug } from '../src/platform.ts';

let base = ''; let server: any;
before(() => { freshDb(); server = createApp().listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => server.close());

const json = (method: string, path: string, body?: unknown, cookie = '') =>
  fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json', 'x-dd': '1', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0];
// 1×1 PNG, enough to exercise the logo upload path.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const draft = (over: Record<string, any> = {}) => ({
  name: 'Harbour Model United Nations', acronym: 'HMUN', logo: PNG, banner: 'p3', startDate: '2027-03-12', endDate: '2027-03-14',
  format: 'in_person', level: 'high_school', country: 'gb', city: 'Bristol', expected: 120,
  committees: [
    { type: 'mun', name: 'UN Security Council', short: 'UNSC', topics: ['Sea-level rise'], difficulty: 'advanced', perCountry: 1,
      portfolios: [{ name: 'United States', code: 'us', importance: 'high' }, { name: 'China', code: 'cn', importance: 'high' }, { name: 'France', code: 'fr' }, { name: 'Brazil', code: 'br' }] },
    { type: 'press', name: 'International Press Corps', short: 'IPC', perCountry: 1, portfolios: [{ name: 'Reuters' }, { name: 'BBC' }] },
  ],
  description: 'A friendly conference by the harbour.', socials: { instagram: '@hmun' }, free: true, uses: ['committees', 'emails'], ...over,
});

let owner = ''; let eventId = ''; let code = '';

test('a new organiser signs up from the wizard and gets their own workspace', async () => {
  const res = await json('POST', '/api/platform/launch', { draft: draft(), account: { name: 'Asha Organiser', email: 'asha@harbour.example', password: 'harbour-pass-1', organisation: 'Harbour MUN Society' } });
  const out = await res.json();
  assert.equal(res.status, 200, JSON.stringify(out));
  owner = cookieOf(res); eventId = out.eventId; code = out.code;
  assert.match(code, /^HMUN27/);
  assert.match(out.links.register, new RegExp(`/register/${code}$`));
  assert.match(owner, /dd_sid=t[a-z0-9]{7}\./, 'session token carries the workspace tag');
  const w = workspaceForEmail('asha@harbour.example');
  assert.notEqual(w.id, 'main');
  // The new conference lives only in the new workspace's database.
  assert.equal(one('SELECT 1 FROM event WHERE id = ?', eventId), undefined, 'not in the main database');
  assert.ok(inWorkspace(w, () => one('SELECT 1 FROM event WHERE id = ?', eventId)));
  const ov = await (await json('GET', `/api/admin/events/${eventId}/overview`, undefined, owner)).json();
  assert.equal(ov.event.status, 'draft');
  assert.equal(ov.committees, 2);
  assert.equal(ov.seats, 6);
  assert.ok(ov.profile.logoUrl?.startsWith('/api/public/media/t'));
  // The owner is admin and CFO of their own workspace, and nobody else's.
  const main = await json('GET', '/api/admin/events', undefined, owner);
  assert.ok((await main.json()).every((e: any) => e.code !== 'BGYS27'));
});

test('the same email cannot open a second workspace, and conference links are unique', async () => {
  const again = await json('POST', '/api/platform/launch', { draft: draft({ acronym: 'OTHER' }), account: { name: 'X', email: 'asha@harbour.example', password: 'harbour-pass-1' } });
  assert.equal(again.status, 400);
  assert.match((await again.json()).details.fields.email, /already has an account/);
  const second = await json('POST', '/api/platform/launch', { draft: draft(), account: { name: 'Ben', email: 'ben@other.example', password: 'another-pass-1', organisation: 'Other MUN' } });
  const out = await second.json();
  assert.equal(second.status, 200, JSON.stringify(out));
  assert.notEqual(out.code, code, 'a clashing acronym gets a different link');
});

test('a draft is hidden until published; then it is on Explore and takes registrations', async () => {
  assert.equal((await json('GET', `/api/platform/conferences/${code.toLowerCase()}`)).status, 404);
  const closed = await json('POST', `/api/public/events/${code}/register`, { full_name: 'Too Early', email: 'early@example.com', mobile: '+44 7700 900111', institution: 'Bristol Grammar', class_year: '12', city: 'Bristol', dob: '2006-01-01', preferences: [], consent: true });
  assert.equal(closed.status, 409);
  assert.equal((await json('POST', `/api/admin/events/${eventId}/publish`, { on: true }, owner)).status, 200);
  const list = await (await json('GET', '/api/platform/conferences?country=gb')).json();
  assert.ok(list.conferences.some((c: any) => c.code === code));
  const page = await (await json('GET', `/api/platform/conferences/${code.toLowerCase()}?src=instagram`)).json();
  assert.equal(page.committees.length, 2);
  assert.equal(page.free, true);
  // A free conference confirms the seat at once; an international number is accepted outside India.
  const ev = await (await json('GET', `/api/public/events/${code}`)).json();
  const reg = await json('POST', `/api/public/events/${code}/register`, { full_name: 'Maya Delegate', email: 'maya@example.com', mobile: '+44 7700 900123', institution: 'Bristol Grammar', class_year: '12', city: 'Bristol', dob: '2006-01-01', preferences: [ev.committees[0].id], consent: true, channel: 'instagram' });
  const r = await reg.json();
  assert.equal(reg.status, 200, JSON.stringify(r));
  const portal = await (await json('GET', `/api/public/r/${r.token}`)).json();
  assert.equal(portal.registration.payment_status, 'paid');
  assert.equal(portal.registration.allot_status, 'confirmed');
  assert.equal(portal.payment, null, 'nothing to pay');
  const ov = await (await json('GET', `/api/admin/events/${eventId}/overview`, undefined, owner)).json();
  assert.equal(ov.applicants.delegates.applied, 1);
  assert.ok(ov.bySource.some((s: any) => s.channel === 'instagram' && s.views >= 1 && s.applied === 1));
});

test('review mode: applications wait, nothing is payable, then the team assigns seats', async () => {
  await json('PUT', `/api/admin/events/${eventId}/financials`, { fees: { free: false, delegatePaise: 250000 }, methods: { bank: { enabled: true, accountName: 'Harbour MUN', accountNumber: 'GB00HARB12345678', ifsc: 'HARBGB2L', bankName: 'Harbour Bank', reference: 'HMUN', instructions: '' } } }, owner);
  await json('PUT', `/api/admin/events/${eventId}/applications-settings`, { allocationMode: 'review', roles: { delegate: true, advisor: true } }, owner);
  const ev = await (await json('GET', `/api/public/events/${code}`)).json();
  const reg = await (await json('POST', `/api/public/events/${code}/register`, { full_name: 'Omar Applicant', email: 'omar@example.com', mobile: '+44 7700 900456', institution: 'Clifton College', class_year: '11', city: 'Bristol', dob: '2007-05-05', preferences: [ev.committees[0].id], consent: true, motivation: 'I love debate.' })).json();
  let portal = await (await json('GET', `/api/public/r/${reg.token}`)).json();
  assert.equal(portal.registration.allot_status, 'applied');
  assert.equal(portal.payment, null, 'nothing payable before acceptance');
  const apps = await (await json('GET', `/api/admin/events/${eventId}/applicants?status=applied`, undefined, owner)).json();
  assert.equal(apps.length, 1);
  await json('POST', `/api/admin/registrations/${apps[0].id}/score`, { score: 8 }, owner);
  const out = await (await json('POST', `/api/admin/events/${eventId}/auto-assign`, {}, owner)).json();
  assert.equal(out.assigned, 1);
  portal = await (await json('GET', `/api/public/r/${reg.token}`)).json();
  assert.equal(portal.registration.allot_status, 'held');
  assert.equal(portal.payment.duePaise, 250000);
  assert.equal(portal.payment.instructions.account, 'GB00HARB12345678');
  assert.deepEqual(portal.payment.gateways, [], "the platform's gateways (and the sandbox) are never offered to an organiser's delegates");
  assert.match(portal.payment.instructions.reference, /^HMUN /);
});

test('Job Board: a chair applies, is accepted with an account, and can sign in to their workspace', async () => {
  const committees = (await (await json('GET', `/api/platform/conferences/${code.toLowerCase()}`)).json()).committees;
  const pos = await (await json('POST', `/api/admin/events/${eventId}/positions`, { kind: 'chair', title: 'Director, UNSC', committee_id: committees[0].id, openings: 1 }, owner)).json();
  const jobs = await (await json('GET', '/api/platform/jobs?kind=chair')).json();
  assert.ok(jobs.some((j: any) => j.id === pos.id && j.conference === 'Harbour Model United Nations'));
  const fd = new FormData();
  for (const [k, v] of Object.entries({ position_id: pos.id, full_name: 'Chloe Chair', email: 'chloe@example.com', institution: 'University of Bristol', experience: 'Chaired six conferences including two Security Councils.' })) fd.append(k, v);
  const applied = await (await fetch(`${base}/api/platform/conferences/${code.toLowerCase()}/apply`, { method: 'POST', body: fd, headers: { 'x-dd': '1' } })).json();
  assert.ok(applied.token);
  const status = await (await json('GET', `/api/platform/application/${applied.token}`)).json();
  assert.equal(status.status, 'submitted');
  const list = await (await json('GET', `/api/admin/events/${eventId}/role-applications?role=chair`, undefined, owner)).json();
  const decided = await (await json('POST', `/api/admin/role-applications/${list[0].id}/decide`, { status: 'accepted', createAccount: true }, owner)).json();
  assert.ok(decided.account?.password);
  const login = await json('POST', '/api/auth/login', { email: 'chloe@example.com', password: decided.account.password });
  assert.equal(login.status, 200);
  const chair = cookieOf(login);
  const live = await (await json('GET', `/api/admin/events/${eventId}/live`, undefined, chair)).json();
  assert.deepEqual(live.committees.map((c: any) => c.short), ['UNSC'], 'a chair only sees their committee');
});

test('the listing reflects publishing and stays out of other workspaces', () => {
  const l = listingBySlug(code.toLowerCase());
  assert.equal(l.published, 1);
  assert.equal(l.data.committees.length, 2);
  assert.equal(l.country, 'gb');
});
