import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { freshDb } from './helpers.ts';
import { config } from '../src/config.ts';
import { resetAiClient } from '../src/services/ai.ts';
import { signUp, verifyEmail, peopleDb } from '../src/services/people.ts';
import { createProject, projectView, invite, projects, markLearned, progress, useAi, addItem } from '../src/services/prep.ts';
import { research, runTasks, coach, draft } from '../src/services/prep-ai.ts';
import { one } from '../src/db.ts';

const requests: any[] = [];
let reply: (body: any) => any = () => ({});
let server: http.Server;
const msg = (content: any[], stop_reason = 'end_turn') => ({ id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content, stop_reason, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });

before(async () => {
  server = http.createServer((req, res) => { let raw = ''; req.on('data', (d) => (raw += d)); req.on('end', () => { const body = JSON.parse(raw); requests.push(body); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(reply(body))); }); });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  config.ai.enabled = true; config.ai.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  resetAiClient();
  freshDb();
});
after(() => server.close());

const person = (email: string, name = 'Test') => {
  const p = signUp({ name, email, password: 'a-long-password-1' });
  const code = /\b(\d{6})\b/.exec(one('SELECT body FROM notification WHERE recipient = ? ORDER BY created_at DESC LIMIT 1', email).body)![1];
  verifyEmail(p, code);
  return peopleDb().prepare('SELECT * FROM person WHERE id = ?').get(p.id) as any;
};

test('research uses web search, keeps the cited sources and resumes a paused search', async () => {
  const p = person('rhea@example.com', 'Rhea');
  const pr = createProject(p, { country: 'France', committee: 'UNSC', topic: 'Humanitarian access in Sudan' });
  let calls = 0;
  reply = () => (++calls === 1 ? msg([{ type: 'server_tool_use', id: 'srv_1', name: 'web_search', input: { query: 'France Sudan humanitarian access' } }], 'pause_turn')
    : msg([
      { type: 'web_search_tool_result', tool_use_id: 'srv_1', content: [{ type: 'web_search_result', url: 'https://press.un.org/en/2025/sc1.htm', title: 'Security Council meeting', encrypted_content: 'x' }] },
      { type: 'text', text: 'France has called for unhindered humanitarian access.', citations: [{ type: 'web_search_result_location', url: 'https://www.diplomatie.gouv.fr/sudan', title: 'France Diplomacy: Sudan', cited_text: 'France calls for unhindered access', encrypted_index: 'x' }] },
    ]));
  const out = await research(p, { question: "What is France's position on humanitarian access in Sudan?", projectId: pr.project.id });
  assert.equal(calls, 2, 'resumed after pause_turn');
  const first = requests.at(-2);
  assert.equal(first.model, 'claude-opus-5-5');
  assert.ok(first.tools.some((t: any) => t.type === 'web_search_20260209'));
  assert.match(first.system, /Delegation: France/);
  assert.equal(requests.at(-1).messages.at(-1).role, 'assistant', 'paused turn sent back to continue');
  assert.deepEqual(out.sources.map((s) => s.url), ['https://www.diplomatie.gouv.fr/sudan', 'https://press.un.org/en/2025/sc1.htm']);
  const view = projectView(p, pr.project.id);
  assert.equal(view.items[0].kind, 'research');
  assert.equal(view.items[0].data.sources.length, 2);
});

test('background tasks run in parallel and land in the brief', async () => {
  const p = person('tara@example.com', 'Tara');
  const pr = createProject(p, { country: 'India', topic: 'UNSC reform', template: 'country_brief' });
  reply = (b) => msg([{ type: 'text', text: `Findings for: ${b.messages[0].content.split('\n')[0].slice(0, 30)}` }]);
  const { started } = runTasks(p, pr.project.id, ['background', 'voting', 'allies']);
  assert.equal(started.length, 3);
  assert.ok(projectView(p, pr.project.id).items.every((i: any) => i.status === 'running'));
  for (let i = 0; i < 50 && projectView(p, pr.project.id).items.some((x: any) => x.status === 'running'); i++) await new Promise((r) => setTimeout(r, 20));
  const items = projectView(p, pr.project.id).items;
  assert.equal(items.filter((x: any) => x.status === 'done').length, 3);
  assert.ok(items.every((x: any) => x.body.startsWith('Findings for')));
});

test('drafts carry word budgets; the coach returns a rubric', async () => {
  const p = person('sam@example.com', 'Sam');
  reply = () => msg([{ type: 'text', text: '[Hook] ...' }]);
  await draft(p, { kind: 'speech', type: 'gsl', seconds: 60, country: 'Japan', topic: 'Nuclear disarmament' });
  assert.match(requests.at(-1).messages[0].content, /about 130 words/);
  reply = () => msg([{ type: 'text', text: JSON.stringify({ overall: 72, scores: { research: 7, policy: 8, solutions: 6, structure: 8, sources: 6, style: 8 }, strengths: ['Clear'], fixes: ['Cite more'], flagged: [{ quote: 'always', issue: 'Overstated', suggestion: 'often' }], missing: [] }) }]);
  const fb = await coach(p, { text: 'word '.repeat(60) });
  assert.equal(fb.overall, 72);
  assert.equal(requests.at(-1).output_config.format.type, 'json_schema');
  await assert.rejects(coach(p, { text: 'too short' }), /at least a paragraph/);
});

test('the daily AI allowance is enforced per person', () => {
  const p = person('lim@example.com');
  process.env.AI_DAILY_LIMIT = '3';
  useAi(p, 3);
  assert.throws(() => useAi(p), /used today's 3 AI requests/);
  delete process.env.AI_DAILY_LIMIT;
});

test('sharing: invites wait for the invitee to confirm their email; viewers cannot edit', () => {
  const owner = person('own@example.com', 'Owner');
  const pr = createProject(owner, { country: 'Brazil', topic: 'Amazon' });
  assert.equal(invite(owner, pr.project.id, 'later@example.com', 'viewer').added, false);
  const later = person('later@example.com', 'Later');
  assert.equal(projects(later).length, 1, 'joined after confirming the email');
  assert.throws(() => addItem(later, { projectId: pr.project.id, kind: 'note', title: 'x' }), /view this project but not change it/);
  const v = projectView(owner, pr.project.id);
  assert.equal(v.members.length, 2);
  const stranger = person('stranger@example.com');
  assert.throws(() => projectView(stranger, pr.project.id), /not found/i);
});

test('learning progress and the streak', () => {
  const p = person('learn@example.com');
  markLearned(p, 'un-1', 100);
  const pr = progress(p);
  assert.equal(pr.done['un-1'], 100);
  assert.equal(pr.streak, 1);
  assert.equal(pr.today, true);
  peopleDb().prepare("INSERT INTO learn_progress (person_id, item, score, at) VALUES (?, 'un-2', 50, ?)").run(p.id, new Date(Date.now() - 86400_000).toISOString());
  assert.equal(progress(p).streak, 2);
  assert.throws(() => markLearned(p, '../x', 1), /Unknown lesson/);
});

test('without an AI key, AI tools say so clearly', async () => {
  const p = person('noai@example.com');
  config.ai.enabled = false;
  await assert.rejects(research(p, { question: 'What is the NPT?' }), /not switched on/);
  config.ai.enabled = true;
});
