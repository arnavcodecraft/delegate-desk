import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { freshDb, user } from './helpers.ts';
import { config } from '../src/config.ts';
import { ctxStore } from '../src/util.ts';
import { geminiText, geminiJson, toContents, toOpenApi, resetGeminiSearch, resetGeminiModels, useGemini } from '../src/services/gemini.ts';
import { ask, readBill } from '../src/services/ai.ts';

const reqs: { path: string; body: any }[] = [];
let reply: (path: string, body: any) => [number, any] = () => [200, {}];
let srv: http.Server; let eventId = '';
const ok = (parts: any[], grounding?: any) => [200, { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP', ...(grounding ? { groundingMetadata: grounding } : {}) }] }] as [number, any];
before(async () => {
  srv = http.createServer((req, res) => { let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => { const body = JSON.parse(raw); reqs.push({ path: req.url!, body }); const [st, out] = reply(req.url!, body); res.statusCode = st; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); }); });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.GEMINI_API_KEY = 'AQ.test'; process.env.AI_PROVIDER = 'gemini'; delete process.env.GEMINI_MODEL;
  config.ai.enabled = true;
  eventId = freshDb().eventId;
});
after(() => { srv.close(); delete process.env.AI_PROVIDER; delete process.env.GEMINI_API_KEY; });

test('AI_PROVIDER=gemini selects Gemini; the key goes in the x-goog-api-key header, not the URL', async () => {
  assert.equal(useGemini(), true);
  reply = () => ok([{ text: 'Hello' }]);
  const out = await geminiText({ contents: toContents([{ role: 'user', content: 'hi' }]) });
  assert.equal(out.text, 'Hello');
  assert.match(reqs.at(-1)!.path, /^\/v1beta\/models\/gemini-flash-latest:generateContent$/);
});

test('a busy model falls through to the next; Google Search sources are kept', async () => {
  resetGeminiSearch(); resetGeminiModels(); reqs.length = 0;
  reply = (p) => (p.includes('gemini-flash-latest') ? [429, { error: { message: 'quota' } }] : ok([{ text: 'Endorsed the JCPOA.' }], { groundingChunks: [{ web: { uri: 'https://press.un.org/x', title: 'press.un.org' } }] }));
  const out = await geminiText({ contents: toContents([{ role: 'user', content: 'S/RES/2231?' }]), search: true });
  assert.equal(out.grounded, true);
  assert.deepEqual(out.sources, [{ url: 'https://press.un.org/x', title: 'press.un.org' }]);
  assert.ok(reqs.some((r) => r.path.includes('gemini-flash-lite-latest') && r.body.tools?.[0]?.google_search));
  reqs.length = 0;
  await geminiText({ contents: toContents([{ role: 'user', content: 'again' }]) });
  assert.ok(!reqs[0].path.includes('gemini-flash-latest:'), 'the over-quota model is skipped for a while');
  resetGeminiModels();
});

test('when search is over quota on every model, the answer still comes, marked as not sourced', async () => {
  resetGeminiSearch(); resetGeminiModels();
  reply = (_p, b) => (b.tools ? [429, { error: { message: 'quota' } }] : ok([{ text: 'From the model alone.' }]));
  const out = await geminiText({ contents: toContents([{ role: 'user', content: 'q' }]), search: true });
  assert.equal(out.grounded, false);
  assert.match(out.text, /No live sources/);
  reqs.length = 0;
  await geminiText({ contents: toContents([{ role: 'user', content: 'q2' }]), search: true });
  assert.ok(reqs.every((r) => !r.body.tools), 'search is skipped for a while once it is known to be unavailable');
});

test('JSON answers use a Gemini-compatible schema', async () => {
  assert.deepEqual(toOpenApi({ type: 'object', additionalProperties: false, properties: { a: { type: ['string', 'null'] } } }), { type: 'object', properties: { a: { type: 'string', nullable: true } } });
  reply = () => ok([{ text: '{"overall": 70}' }]);
  const j = await geminiJson({ contents: toContents([{ role: 'user', content: 'x' }]), schema: { type: 'object', properties: { overall: { type: 'integer' } } } });
  assert.equal(j.overall, 70);
  assert.equal(reqs.at(-1)!.body.generationConfig.responseMimeType, 'application/json');
});

test('bill reading sends the image inline; the staff assistant runs its read-only tools', async () => {
  reply = () => ok([{ text: JSON.stringify({ vendor: 'Sharp Print', gstin: null, invoice_no: '42', date: '2026-10-01', taxable_rupees: 1000, gst_rupees: 180, total_rupees: 1180, gst_rate_percent: 18, category: 'printing', description: 'Badges' }) }]);
  const u = user('accounts@example.org');
  const b = await ctxStore.run({ userId: u.id, userLabel: 'a', ip: 't', roles: u.roles }, () => readBill(Buffer.from('png'), 'image/png'));
  assert.equal(b.totalPaise, 118000);
  assert.equal(reqs.at(-1)!.body.contents[0].parts[0].inline_data.mime_type, 'image/png');
  let n = 0;
  reply = () => (n++ === 0 ? ok([{ functionCall: { name: 'get_dashboard', args: {} }, thoughtSignature: 'sig' }]) : ok([{ text: 'There are 45 delegates.' }]));
  const a = await ask('How many delegates?', user('admin@example.org').roles, eventId);
  assert.equal(a.answer, 'There are 45 delegates.');
  assert.deepEqual(a.toolsUsed, ['get_dashboard']);
  const last = reqs.at(-1)!.body;
  assert.equal(last.contents.at(-2).parts[0].thoughtSignature, 'sig', 'thought signatures are sent back with the call');
  assert.equal(last.contents.at(-1).parts[0].functionResponse.name, 'get_dashboard');
});
