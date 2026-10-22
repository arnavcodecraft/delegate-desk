import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { freshDb, user } from './helpers.ts';
import { one } from '../src/db.ts';
import { ctxStore } from '../src/util.ts';
import { config } from '../src/config.ts';
import { ask, readBill, summarise, resetAiClient } from '../src/services/ai.ts';

const requests: { headers: http.IncomingHttpHeaders; body: any }[] = [];
let reply: (body: any) => any = () => ({});
let server: http.Server; let eventId = '';
const msg = (content: any[], stop_reason = 'end_turn') => ({ id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });

before(async () => {
  server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => {
      const body = JSON.parse(raw); requests.push({ headers: req.headers, body });
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(reply(body)));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  config.ai.enabled = true; config.ai.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  resetAiClient();
  eventId = freshDb().eventId;
});
after(() => server.close());
const as = <T,>(email: string, fn: () => T) => { const u = user(email); return ctxStore.run({ userId: u.id, userLabel: email, ip: 'test', roles: u.roles }, fn); };

test('bill reading sends the image with a JSON schema and the refusal fallback opt-in', async () => {
  reply = () => msg([{ type: 'text', text: JSON.stringify({ vendor: 'Sharp Print House', gstin: '29ABCDE1234F1Z5', invoice_no: 'SPH/1042', date: '2026-10-18', taxable_rupees: 4500, gst_rupees: 810, total_rupees: 5310, gst_rate_percent: 18, category: 'printing', description: 'Placards and badges' }) }]);
  const out = await as('accounts@example.org', () => readBill(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'bill.png')), 'image/png'));
  const req = requests.at(-1)!;
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(String(req.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.messages[0].content[0].type, 'image');
  assert.equal(req.body.thinking, undefined, 'thinking is not configured (cannot be disabled on this model)');
  assert.equal(out.amountPaise, 450000);
  assert.equal(out.totalPaise, 531000);
  assert.equal(out.category, 'printing');
});

test('questions run read-only tools allowed for the role, then answer', async () => {
  let turn = 0;
  reply = (body) => (turn++ === 0
    ? msg([{ type: 'tool_use', id: 'toolu_1', name: 'get_dashboard', input: {} }], 'tool_use')
    : (assert.equal(body.messages.at(-1).content[0].type, 'tool_result'), msg([{ type: 'text', text: 'You need 77 more paid registrations to break even.' }])));
  const r = await as('cfo@example.org', () => ask('How far from break-even are we?', user('cfo@example.org').roles, eventId));
  assert.equal(r.answer, 'You need 77 more paid registrations to break even.');
  assert.deepEqual(r.toolsUsed, ['get_dashboard']);
  const names = requests.at(-1)!.body.tools.map((t: any) => t.name);
  assert.ok(names.includes('get_trial_balance'));
  assert.ok(!names.some((n: string) => /approve|refund|post|update|move|create|delete/.test(n)), 'no write tools exist');
  assert.ok(one("SELECT 1 FROM audit_log WHERE action = 'ai.ask'"));
});

test('a registration executive is not offered finance tools; a chair-only user gets lists only', async () => {
  reply = () => msg([{ type: 'text', text: 'ok' }]);
  await as('desk@example.org', () => ask('Who has not paid?', user('desk@example.org').roles, eventId));
  const names = requests.at(-1)!.body.tools.map((t: any) => t.name);
  assert.ok(names.includes('search_delegates'));
  assert.ok(!names.includes('get_trial_balance') && !names.includes('get_dashboard') && !names.includes('list_expenses'));
  await as('chair.unsc@example.org', () => ask('Who is in my committee?', user('chair.unsc@example.org').roles, eventId));
  assert.deepEqual(requests.at(-1)!.body.tools.map((t: any) => t.name), ['get_list']);
});

test('summary uses dashboard numbers; a refusal is reported, not shown as an answer', async () => {
  reply = (body) => { assert.match(body.messages[0].content, /breakEven/); return msg([{ type: 'text', text: 'Behind break-even by 77 registrations.' }]); };
  assert.match((await as('cfo@example.org', () => summarise(eventId))).text, /Behind break-even/);
  reply = () => ({ ...msg([]), stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: null } });
  await assert.rejects(() => as('cfo@example.org', () => summarise(eventId)), /declined/);
});
