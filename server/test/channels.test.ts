import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { freshDb, person } from './helpers.ts';
import { one, run, all } from '../src/db.ts';
import { asSystem } from '../src/util.ts';
import { config } from '../src/config.ts';
import { deliverPending, applyDeliveryStatuses } from '../src/services/notify.ts';
import { whatsapp } from '../src/services/channels.ts';
const { register } = await import('../src/services/registrations.ts');
const { sendOtp, verifyOtp } = await import('../src/services/otp.ts');

// Fake Meta Graph API + MSG91 that record what they receive.
const calls: { path: string; headers: http.IncomingHttpHeaders; body: any }[] = [];
let server: http.Server; let base = '';
before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => {
      calls.push({ path: req.url!, headers: req.headers, body: JSON.parse(raw || '{}') });
      res.setHeader('content-type', 'application/json');
      res.end(req.url!.includes('/flow') ? JSON.stringify({ type: 'success', message: 'msg91-req-1' }) : JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  Object.assign(config.whatsapp, { token: 'wa-token', phoneNumberId: '1234', appSecret: 'wa-secret', apiBase: base });
  Object.assign(config.msg91, { authKey: 'msg91-key', apiBase: base });
  freshDb();
  run("UPDATE template SET provider_template = 'reg_allotted_v1', language = 'en' WHERE key = 'registration_saved' AND channel = 'whatsapp'");
  run("UPDATE template SET provider_template = '64f0dlt1234' WHERE key = 'mobile_otp' AND channel = 'sms'");
});
after(() => server.close());

test('opted-in delegates get a WhatsApp template message with ordered parameters', async () => {
  const ev = one('SELECT id FROM event')!;
  const { registration: r } = asSystem(() => register(ev.id, person({ whatsapp_consent: true })));
  await asSystem(() => deliverPending(500));
  const wa = calls.find((c) => c.path === '/v21.0/1234/messages')!;
  assert.equal(wa.headers.authorization, 'Bearer wa-token');
  assert.equal(wa.body.to, `91${r.mobile}`);
  assert.equal(wa.body.template.name, 'reg_allotted_v1');
  const params = wa.body.template.components[0].parameters.map((p: any) => p.text);
  assert.equal(params[0], r.full_name);
  assert.equal(params.length, 6);
  const n = one("SELECT * FROM notification WHERE registration_id = ? AND channel = 'whatsapp'", r.id)!;
  assert.equal(n.status, 'sent');
  assert.match(n.provider_message_id, /^wamid\./);
  // Delivery receipt flows back by provider message id.
  assert.equal(applyDeliveryStatuses([{ id: n.provider_message_id, status: 'read' }]), 1);
  assert.equal(one('SELECT delivery_status FROM notification WHERE id = ?', n.id)!.delivery_status, 'read');
});

test('a missing template name fails the message with a clear reason instead of sending free text', async () => {
  const ev = one('SELECT id FROM event')!;
  run("UPDATE template SET provider_template = NULL WHERE key = 'registration_saved' AND channel = 'whatsapp'");
  const { registration: r } = asSystem(() => register(ev.id, person({ whatsapp_consent: true })));
  await asSystem(() => deliverPending(500));
  const n = one("SELECT * FROM notification WHERE registration_id = ? AND channel = 'whatsapp'", r.id)!;
  assert.equal(n.status, 'queued');
  assert.match(n.last_error, /No approved WhatsApp template/);
});

test('webhook signature check and status parsing', () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.X', status: 'failed', errors: [{ title: 'Number not on WhatsApp' }] }] } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', 'wa-secret').update(body).digest('hex');
  assert.equal(whatsapp.verifySignature(body, sig), true);
  assert.equal(whatsapp.verifySignature(body + ' ', sig), false);
  assert.deepEqual(whatsapp.parseStatuses(JSON.parse(body)), [{ id: 'wamid.X', status: 'failed', error: 'Number not on WhatsApp' }]);
});

test('mobile OTP by SMS: wrong code refused, right code gives a single-use token for registration', async () => {
  const ev = one('SELECT * FROM event')!;
  run("UPDATE event SET settings = json_set(settings, '$.requireMobileOtp', json('true')) WHERE id = ?", ev.id);
  const p = person();
  assert.throws(() => asSystem(() => register(ev.id, p)), /verify your mobile/i);
  const sent = await asSystem(() => sendOtp(ev, p.mobile));
  assert.equal(sent.channel, 'sms');
  const flow = calls.filter((c) => c.path === '/api/v5/flow').at(-1)!;
  assert.equal(flow.headers.authkey, 'msg91-key');
  assert.equal(flow.body.template_id, '64f0dlt1234');
  const code = flow.body.recipients[0].code;
  assert.match(code, /^\d{6}$/);
  assert.throws(() => verifyOtp(ev.id, p.mobile, code === '000000' ? '111111' : '000000'), /not right/);
  const { token } = verifyOtp(ev.id, p.mobile, code);
  const { registration } = asSystem(() => register(ev.id, { ...p, otp_token: token }));
  assert.ok(registration.id);
  assert.throws(() => asSystem(() => register(ev.id, { ...person({ mobile: p.mobile }), otp_token: token })), /verify|already registered/i);
  run("UPDATE event SET settings = json_set(settings, '$.requireMobileOtp', json('false')) WHERE id = ?", ev.id);
});

test('without a provider in development the code is returned so the flow can be tried', async () => {
  const ev = one('SELECT * FROM event')!;
  config.msg91.authKey = ''; config.whatsapp.token = '';
  const r = await asSystem(() => sendOtp(ev, '9811112222'));
  assert.equal(r.sent, false);
  assert.match(r.devCode!, /^\d{6}$/);
});
