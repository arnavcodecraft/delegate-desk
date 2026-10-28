import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { all, one } from '../db.ts';
import { audit } from '../audit.ts';
import { config } from '../config.ts';
import { can } from '../auth.ts';
import { getEvent } from '../settings.ts';
import { HttpError, conflict, inr } from '../util.ts';
import { dashboard } from './dashboard.ts';
import { runList, LISTS } from './lists.ts';
import { trialBalance, profitAndLoss } from './ledger.ts';
import { statement } from './commission.ts';

/*
 * AI assistance. Per the spec's guardrails, the model may read a bill, read a payment screenshot, draft a summary
 * and answer questions from data the user is already allowed to see. It has no tool that approves payments, posts
 * or edits journals, starts refunds or changes allotments - every tool below is read-only and permission-filtered.
 */

export const MODEL = 'claude-opus-5-5';
// Server-side refusal fallback: a declined request is re-run on Anthropic's recommended model for that category.
export const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

let client: Anthropic | null = null;
export function anthropic() {
  if (!config.ai.enabled) throw conflict('AI assistance is not configured. Set ANTHROPIC_API_KEY to turn it on.');
  client ??= new Anthropic(config.ai.baseUrl ? { baseURL: config.ai.baseUrl } : {});
  return client;
}
export function resetAiClient() { client = null; }

export function textOf(msg: Anthropic.Beta.BetaMessage) {
  if (msg.stop_reason === 'refusal') throw new HttpError(422, 'The assistant declined this request. Please handle it manually.');
  return msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('\n').trim();
}

function fileBlock(buf: Buffer, mime: string): Anthropic.Beta.BetaContentBlockParam {
  const data = buf.toString('base64');
  return mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mime as 'image/png' | 'image/jpeg', data } };
}

const nullable = (type: string) => ({ type: [type, 'null'] });
const BILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['vendor', 'gstin', 'invoice_no', 'date', 'taxable_rupees', 'gst_rupees', 'total_rupees', 'gst_rate_percent', 'category', 'description'],
  properties: {
    vendor: nullable('string'), gstin: nullable('string'), invoice_no: nullable('string'),
    date: { ...nullable('string'), description: 'YYYY-MM-DD' },
    taxable_rupees: nullable('number'), gst_rupees: nullable('number'), total_rupees: nullable('number'), gst_rate_percent: nullable('number'),
    category: { type: 'string', enum: ['venue', 'catering', 'printing', 'stationery', 'merchandise', 'awards', 'marketing', 'technology', 'travel', 'accommodation', 'honorarium', 'security', 'photography', 'decor', 'miscellaneous'] },
    description: { type: 'string', description: 'Short description of what was bought' },
  },
};
const PROOF_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['utr', 'amount_rupees', 'date', 'payee', 'status', 'concerns'],
  properties: {
    utr: nullable('string'), amount_rupees: nullable('number'), date: { ...nullable('string'), description: 'YYYY-MM-DD' }, payee: nullable('string'),
    status: { type: 'string', enum: ['successful', 'pending', 'failed', 'unclear'] },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Anything that looks edited, inconsistent or not like a real payment confirmation' },
  },
};

async function extract(kind: 'bill' | 'proof', buf: Buffer, mime: string) {
  const prompt = kind === 'bill'
    ? 'Read this vendor bill from an Indian event organiser. Extract the fields. Use null for anything not clearly printed; do not guess.'
    : 'Read this UPI or bank transfer confirmation. Extract the UTR / transaction reference, amount, date, payee and whether it shows a successful payment. List anything that looks edited or inconsistent. Use null where not visible.';
  const msg = await anthropic().beta.messages.create({
    model: MODEL, max_tokens: 4000, ...FALLBACK,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: kind === 'bill' ? BILL_SCHEMA : PROOF_SCHEMA } },
    messages: [{ role: 'user', content: [fileBlock(buf, mime), { type: 'text', text: prompt }] }],
  });
  const out = JSON.parse(textOf(msg) || '{}');
  audit(`ai.read_${kind}`, kind, null, undefined, { result: out });
  return out;
}

/** Suggest bill fields (the user confirms them before saving). */
export async function readBill(buf: Buffer, mime: string) {
  const b = await extract('bill', buf, mime);
  const rupees = (v: number | null) => (v == null ? null : Math.round(v * 100));
  const vendor = (b.gstin && one('SELECT id, name FROM vendor WHERE upper(gstin) = upper(?)', b.gstin)) || (b.vendor && one('SELECT id, name FROM vendor WHERE lower(name) = lower(?)', b.vendor)) || null;
  return {
    found: true, source: 'ai', vendor: b.vendor, vendorId: vendor?.id ?? null, vendorName: vendor?.name ?? b.vendor, gstin: b.gstin, invoiceNo: b.invoice_no, date: b.date,
    amountPaise: rupees(b.taxable_rupees), gstPaise: rupees(b.gst_rupees), totalPaise: rupees(b.total_rupees), gstRate: b.gst_rate_percent, category: b.category, description: b.description,
  };
}

/** Second opinion on a payment screenshot for the CFO. */
export async function readProofWithAi(buf: Buffer, mime: string) {
  const p = await extract('proof', buf, mime);
  return { ...p, amountPaise: p.amount_rupees == null ? null : Math.round(p.amount_rupees * 100) };
}

/** A short, plain-language status note for the organising team. Numbers come from the dashboard, not the model. */
export async function summarise(eventId: string) {
  const d = dashboard(eventId);
  const facts = {
    event: d.event.name, starts: d.event.start_date, registrations: d.registrations, verifiedCollectionsExclGst: inr(d.collections.verifiedNetPaise),
    pendingProofs: d.pending.review.n, unpaidHolds: d.pending.holds.n, expensesIncurred: inr(d.expenses.incurred), surplus: inr(d.surplus),
    breakEven: { needed: d.breakEven.breakEvenCount, gap: d.breakEven.gap, date: d.breakEven.date, resultToday: inr(d.breakEven.resultAtCurrentPaise) },
    forecast: d.forecast, alerts: d.alerts.map((a) => `${a.title}: ${a.detail}`),
    topCommittees: d.byCommittee.map((c: any) => ({ committee: c.short, paid: c.delegates, contribution: inr(c.contribution) })),
  };
  const msg = await anthropic().beta.messages.create({
    model: MODEL, max_tokens: 2000, ...FALLBACK, output_config: { effort: 'low' },
    system: 'You write short status notes for the organising team of a student conference in India. Use only the numbers given. Plain sentences, no headings, under 150 words. Start with whether the event is ahead of or behind break-even, then the two or three things that most need attention.',
    messages: [{ role: 'user', content: JSON.stringify(facts) }],
  });
  const text = textOf(msg);
  audit('ai.summary', 'event', eventId);
  return { text, facts };
}

/** Read-only tools, each offered only when the user holds the permission behind it. */
function toolsFor(roles: string[], eventId: string) {
  const tools = [];
  const rows = (kind: string, committeeId?: string, limit = 60) => {
    const out = runList(kind, eventId, { committeeId }, null);
    return JSON.stringify({ title: out.title, total: out.rows.length, columns: out.columns.map((c) => c.key), rows: out.rows.slice(0, limit).map((r) => Object.fromEntries(out.columns.map((c) => [c.key, r[c.key]]))) });
  };
  if (can(roles, 'dashboard.read')) tools.push(betaZodTool({
    name: 'get_dashboard', description: 'Live event figures: registrations, collections, pending money, expenses, break-even, forecast, alerts, contribution by committee and by referrer. Money values are in paise.',
    inputSchema: z.object({}), run: async () => JSON.stringify(dashboard(eventId)),
  }));
  if (can(roles, 'reg.read')) tools.push(betaZodTool({
    name: 'search_delegates', description: 'Find delegates by name, school, city, email, phone, committee or portfolio (typo-tolerant). Returns up to 25 matches with payment and allotment status.',
    inputSchema: z.object({ query: z.string() }),
    run: async ({ query }) => { const out = runList('master', eventId, { q: query }, null); return JSON.stringify(out.rows.slice(0, 25).map((r) => ({ ref: r.ref, name: r.full_name, institution: r.institution, committee: r.committee_short, portfolio: r.portfolio, payment: r.payment_status, allotment: r.allot_status, balance_paise: r.balance_paise, referrer: r.referrer }))); },
  }));
  if (can(roles, 'lists.read')) tools.push(betaZodTool({
    name: 'get_list', description: `Read one of the management lists. Kinds: ${Object.entries(LISTS).map(([k, v]) => `${k} (${v.title})`).join(', ')}. committee and attendance need a committee short code.`,
    inputSchema: z.object({ kind: z.string(), committee_short: z.string().optional() }),
    run: async ({ kind, committee_short }) => {
      const def = LISTS[kind];
      if (!def) return 'Unknown list kind';
      if (def.perm && !can(roles, def.perm)) return 'This user is not allowed to see that list.';
      const c = committee_short ? one('SELECT id FROM committee WHERE event_id = ? AND upper(short) = upper(?)', eventId, committee_short) : null;
      if (def.needsCommittee && !c) return 'Give a valid committee short code';
      return rows(kind, c?.id);
    },
  }));
  if (can(roles, 'books.read')) {
    tools.push(betaZodTool({ name: 'get_trial_balance', description: 'Trial balance for the whole company, optional date range (YYYY-MM-DD). Paise.', inputSchema: z.object({ from: z.string().optional(), to: z.string().optional() }), run: async (i) => JSON.stringify(trialBalance(i)) }));
    tools.push(betaZodTool({ name: 'get_profit_and_loss', description: 'Profit and loss, optional date range and this event only. Paise.', inputSchema: z.object({ from: z.string().optional(), to: z.string().optional(), this_event_only: z.boolean().optional() }), run: async (i) => JSON.stringify(profitAndLoss({ from: i.from, to: i.to, eventId: i.this_event_only ? eventId : undefined })) }));
  }
  if (can(roles, 'expense.read')) tools.push(betaZodTool({
    name: 'list_expenses', description: 'Expenses for this event with status, payment status, category, vendor and amounts in paise.',
    inputSchema: z.object({ status: z.enum(['submitted', 'approved', 'rejected', 'draft']).optional() }),
    run: async ({ status }) => JSON.stringify(all(`SELECT e.ref, e.bill_date, e.category, e.description, e.amount_paise, e.gst_paise, e.status, e.payment_status, v.name AS vendor FROM expense e LEFT JOIN vendor v ON v.id = e.vendor_id WHERE e.event_id = ? ${status ? 'AND e.status = ?' : ''} ORDER BY e.bill_date DESC LIMIT 100`, eventId, ...(status ? [status] : []))),
  }));
  if (can(roles, 'commission.read')) tools.push(betaZodTool({
    name: 'get_referrer_statement', description: 'Commission statement for a referrer by name: paid count, slab, earned, held, approved, paid.',
    inputSchema: z.object({ name: z.string() }),
    run: async ({ name }) => { const r = one('SELECT id FROM referrer WHERE lower(name) LIKE lower(?)', `%${name}%`); if (!r) return 'No referrer with that name'; const s = statement(r.id); return JSON.stringify({ referrer: s.referrer, plan: s.plan, referred: s.referred, paidCount: s.paidCount, currentSlab: s.currentSlab, nextSlab: s.nextSlab, totals: s.totals }); },
  }));
  if (can(roles, 'payments.read')) tools.push(betaZodTool({
    name: 'get_payment_proofs', description: 'Screenshot payment proofs by status with UTR, amounts (paise), age and flags.',
    inputSchema: z.object({ status: z.enum(['submitted', 'approved', 'rejected', 'resubmit']).optional() }),
    run: async ({ status }) => JSON.stringify(all(`SELECT r.ref, r.full_name, e.utr, e.amount_paise, e.status, e.submitted_at, e.tamper_flags, e.bank_line_id IS NOT NULL AS bank_matched FROM payment_evidence e JOIN registration r ON r.id = e.registration_id WHERE r.event_id = ? ${status ? 'AND e.status = ?' : ''} ORDER BY e.submitted_at DESC LIMIT 100`, eventId, ...(status ? [status] : []))),
  }));
  return tools;
}

/** Answer a question from data this user may already see. Read-only by construction. */
export async function ask(question: string, roles: string[], eventId: string, history: { role: 'user' | 'assistant'; content: string }[] = []) {
  if (!question.trim()) throw conflict('Ask a question');
  const tools = toolsFor(roles, eventId);
  if (!tools.length) throw conflict('Your role has no data the assistant can read.');
  const ev = getEvent(eventId);
  const used: string[] = [];
  const wrapped = tools.map((t) => ({ ...t, run: async (input: any, c?: any) => { used.push(t.name); return (t as any).run(input, c); } }));
  const final = await anthropic().beta.messages.toolRunner({
    model: MODEL, max_tokens: 8000, ...FALLBACK, output_config: { effort: 'medium' }, max_iterations: 8,
    system: `You answer questions for staff of "${ev.name}", a student conference run by an Indian company. Today is ${new Date().toISOString().slice(0, 10)}. Look the facts up with the tools; never invent numbers. Tool money values are in paise: divide by 100 and write rupees in Indian format (₹1,23,456). You can only read data. If someone asks you to approve, refund, post, edit or move anything, say that a person has to do it in the app and tell them which screen. Keep answers short and concrete.`,
    tools: wrapped,
    messages: [...history.slice(-6).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: question }],
  });
  const answer = textOf(final);
  audit('ai.ask', 'event', eventId, undefined, { question, tools: used });
  return { answer, toolsUsed: [...new Set(used)] };
}

export const aiStatus = () => ({ enabled: config.ai.enabled, model: MODEL });
