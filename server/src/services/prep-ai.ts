/**
 * AI for Prep: cited research (Claude with web search), background research tasks, drafting with word budgets,
 * a chair-style writing coach, practice partners (negotiation, counterarguments, historical figures, crisis),
 * and daily briefings. Every call is metered per person (prep.ts) and never sees anyone else's data.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, MODEL, FALLBACK, textOf } from './ai.ts';
import { config } from '../config.ts';
import { bad, conflict } from '../util.ts';
import { access, addItem, setItem, useAi, TASKS, cachedBriefing, saveBriefing } from './prep.ts';
import type { Person } from './people.ts';

const needAi = () => { if (!config.ai.enabled) throw conflict('AI is not switched on for this site yet. Every tool that does not need AI still works.'); };
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 6 } as const;
export interface Source { url: string; title: string; quote?: string }

const SYSTEM = `You are a research assistant for Model United Nations delegates, debaters and students of international affairs.
Write for a well-read high-school or university student. Be accurate and specific: name resolutions by symbol (e.g. S/RES/2231 (2015), A/RES/77/1), treaties by full name and year, and quote official positions where you can.
Prefer primary sources: UN documents (un.org, undocs.org, digitallibrary.un.org, press.un.org), government and foreign-ministry sites, treaty collections, and reputable research institutes.
Separate what a source says from your own analysis ("Analysis:"). If evidence is thin, contested or out of date, say so. Never invent quotations, votes or document numbers.
Use short headings and bullet points. No preamble.`;

function context(project?: any) {
  if (!project) return '';
  return [
    'Delegate context (keep answers specific to it):',
    project.country && `- Delegation: ${project.country}`, project.committee && `- Committee: ${project.committee}`, project.topic && `- Topic: ${project.topic}`,
    project.memory && `- Notes the delegate wants you to remember:\n${project.memory}`,
  ].filter(Boolean).join('\n');
}

/** Pull the text and the cited web pages out of a response (citations first, then search results). */
function harvest(msg: Anthropic.Beta.BetaMessage) {
  const text = textOf(msg);
  const seen = new Map<string, Source>();
  for (const b of msg.content as any[]) {
    if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url && !seen.has(c.url)) seen.set(c.url, { url: c.url, title: c.title || c.url, quote: c.cited_text?.slice(0, 280) });
  }
  for (const b of msg.content as any[]) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) for (const r of b.content) if (r.url && !seen.has(r.url) && seen.size < 12) seen.set(r.url, { url: r.url, title: r.title || r.url });
  }
  return { text, sources: [...seen.values()] };
}

/** One model call with web search, resuming if the server-side search loop pauses. */
async function searchCall(system: string, messages: Anthropic.Beta.BetaMessageParam[], o: { maxTokens?: number; effort?: 'low' | 'medium' | 'high'; search?: boolean } = {}) {
  if (!config.ai.enabled) throw conflict('AI research is not switched on for this site yet. Every tool that does not need AI still works.');
  const msgs = [...messages];
  let msg: Anthropic.Beta.BetaMessage | null = null;
  for (let i = 0; i < 4; i++) {
    msg = await anthropic().beta.messages.create({
      model: MODEL, max_tokens: o.maxTokens ?? 8000, ...FALLBACK, output_config: { effort: o.effort ?? 'medium' },
      system, messages: msgs, ...(o.search === false ? {} : { tools: [WEB_SEARCH as any] }),
    });
    if (msg.stop_reason !== 'pause_turn') break;
    msgs.push({ role: 'assistant', content: msg.content as any });
  }
  return harvest(msg!);
}

// ---------- research ----------
export async function research(p: Person, b: { question: string; projectId?: string | null; history?: { q: string; a: string }[] }) {
  const question = String(b.question ?? '').trim();
  if (question.length < 4) throw bad('Ask a research question');
  const project = b.projectId ? access(p, b.projectId).project : null;
  needAi(); useAi(p);
  const history = (b.history ?? []).slice(-4).flatMap((h) => [{ role: 'user' as const, content: h.q }, { role: 'assistant' as const, content: h.a }]);
  const out = await searchCall(`${SYSTEM}\n\n${context(project)}`, [...history, { role: 'user', content: question }]);
  const id = addItem(p, { projectId: b.projectId ?? null, kind: 'research', title: question.slice(0, 160), body: out.text, data: { sources: out.sources } });
  return { id, answer: out.text, sources: out.sources };
}

/** Run a template's research tasks in parallel in the background; the project page polls for results. */
export function runTasks(p: Person, projectId: string, keys: string[]) {
  const { project, role } = access(p, projectId);
  if (role === 'viewer') throw bad('You can view this project but not change it');
  const tasks = [...new Set(keys)].filter((k) => TASKS[k]);
  if (!tasks.length) throw bad('Pick at least one task');
  if (!config.ai.enabled) throw conflict('AI research is not switched on for this site yet.');
  useAi(p, tasks.length);
  const ids = tasks.map((k) => addItem(p, { projectId, kind: 'task', title: TASKS[k].label, data: { task: k }, status: 'running' }));
  tasks.forEach((k, i) => {
    searchCall(`${SYSTEM}\n\n${context(project)}`, [{ role: 'user', content: `${TASKS[k].prompt}\n\nTopic: ${project.topic ?? 'the committee agenda'}${project.country ? `\nDelegation: ${project.country}` : ''}${project.committee ? `\nCommittee: ${project.committee}` : ''}` }])
      .then((out) => setItem(ids[i], { body: out.text, data: { task: k, sources: out.sources }, status: 'done' }))
      .catch((e) => setItem(ids[i], { body: '', data: { task: k, error: String(e?.message ?? e) }, status: 'failed' }));
  });
  return { started: ids };
}

// ---------- writing ----------
export const SPEECH_TYPES: Record<string, { label: string; seconds: number; sections: [string, number][] }> = {
  opening: { label: 'Opening speech', seconds: 90, sections: [['Hook and greeting', 0.15], ['Your position', 0.35], ['What you will push for', 0.35], ['Call to action', 0.15]] },
  gsl: { label: 'General Speakers List', seconds: 90, sections: [['Hook', 0.15], ['Position and evidence', 0.4], ['Solution', 0.3], ['Yield or close', 0.15]] },
  mod: { label: 'Moderated caucus', seconds: 60, sections: [['One clear point', 0.5], ['Evidence', 0.3], ['Ask of the room', 0.2]] },
  ror: { label: 'Right of reply', seconds: 30, sections: [['What was said', 0.3], ['Correction with evidence', 0.5], ['Close', 0.2]] },
  closing: { label: 'Closing speech', seconds: 60, sections: [['What the committee achieved', 0.4], ['Your delegation’s contribution', 0.35], ['Final appeal', 0.25]] },
};
export const WPM = 130;
export const PAPER_SECTIONS: [string, number][] = [['Background of the topic', 0.25], ['Past international action', 0.2], ['Country policy', 0.25], ['Proposed solutions', 0.3]];

export async function draft(p: Person, b: { kind: string; projectId?: string | null; country?: string; committee?: string; topic?: string; type?: string; seconds?: number; words?: number; notes?: string }) {
  const project = b.projectId ? access(p, b.projectId).project : null;
  const country = b.country || project?.country; const committee = b.committee || project?.committee; const topic = b.topic || project?.topic;
  if (!topic) throw bad('Say what the topic is');
  let instruction = ''; let title = '';
  if (b.kind === 'paper') {
    const words = Math.max(200, Math.min(2500, Number(b.words) || 900));
    instruction = `Write a position paper of about ${words} words for ${country ?? 'my delegation'} in ${committee ?? 'the committee'} on "${topic}". Use these sections with these word budgets: ${PAPER_SECTIONS.map(([s, f]) => `${s} (~${Math.round(words * f)} words)`).join('; ')}. Formal diplomatic register, first person plural ("The Republic of ... believes"). Cite sources inline as [n] and end with a numbered "Sources" list with URLs.`;
    title = `Position paper: ${topic}`;
  } else if (b.kind === 'speech') {
    const t = SPEECH_TYPES[b.type ?? 'gsl'] ?? SPEECH_TYPES.gsl;
    const secs = Math.max(20, Math.min(300, Number(b.seconds) || t.seconds)); const words = Math.round((secs / 60) * WPM);
    instruction = `Write a ${t.label} of ${secs} seconds (about ${words} words at ${WPM} words a minute) for ${country ?? 'my delegation'} in ${committee ?? 'the committee'} on "${topic}". Structure it as: ${t.sections.map(([s, f]) => `${s} (~${Math.round(words * f)} words)`).join('; ')}. Mark each section with a short heading in brackets. Spoken English, short sentences, one memorable line. After the speech, list the sources you relied on.`;
    title = `${t.label}: ${topic}`;
  } else if (b.kind === 'memo') {
    instruction = `Write a one-page briefing memo for ${country ?? 'my delegation'} on "${topic}" in ${committee ?? 'the committee'}: the situation, our interests, red lines, likely allies and opponents, and three recommended moves. Cite sources.`;
    title = `Memo: ${topic}`;
  } else if (b.kind === 'amendment') {
    instruction = `Draft amendments that ${country ?? 'my delegation'} could table to a draft resolution on "${topic}" in ${committee ?? 'the committee'}. For each: the clause it changes, the exact amendment text (add / strike / replace), whether it is friendly or unfriendly, and a one-line justification.`;
    title = `Amendments: ${topic}`;
  } else if (b.kind === 'poi') {
    instruction = `Write eight sharp points of information (questions) that ${country ?? 'my delegation'} could ask other delegations on "${topic}", each under 25 words, grouped by target delegation or argument, with what each question is trying to expose.`;
    title = `Points of information: ${topic}`;
  } else throw bad('Unknown draft type');
  if (b.notes) instruction += `\n\nThe delegate's own notes to use:\n${String(b.notes).slice(0, 4000)}`;
  needAi(); useAi(p);
  const out = await searchCall(`${SYSTEM}\n\n${context(project ?? { country, committee, topic })}`, [{ role: 'user', content: instruction }], { maxTokens: 12000 });
  const id = addItem(p, { projectId: b.projectId ?? null, kind: b.kind === 'speech' ? 'speech' : 'paper', title, body: out.text, data: { sources: out.sources, draftKind: b.kind, type: b.type } });
  return { id, text: out.text, sources: out.sources };
}

const COACH_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['overall', 'scores', 'strengths', 'fixes', 'flagged', 'missing'],
  properties: {
    overall: { type: 'integer', description: '0-100' },
    scores: { type: 'object', additionalProperties: false, required: ['research', 'policy', 'solutions', 'structure', 'sources', 'style'],
      properties: Object.fromEntries(['research', 'policy', 'solutions', 'structure', 'sources', 'style'].map((k) => [k, { type: 'integer', description: '0-10' }])) },
    strengths: { type: 'array', items: { type: 'string' } },
    fixes: { type: 'array', items: { type: 'string' } },
    flagged: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'issue', 'suggestion'], properties: { quote: { type: 'string' }, issue: { type: 'string' }, suggestion: { type: 'string' } } } },
    missing: { type: 'array', items: { type: 'string' } },
  },
};
/** Score a paper or speech the way a chair would, and flag unsupported or overstated claims. */
export async function coach(p: Person, b: { text: string; kind?: string; projectId?: string | null }) {
  const text = String(b.text ?? '').trim();
  if (text.split(/\s+/).length < 40) throw bad('Paste at least a paragraph (40 words or more)');
  const project = b.projectId ? access(p, b.projectId).project : null;
  if (!config.ai.enabled) throw conflict('The writing coach needs AI, which is not switched on for this site yet. The word counter and checks still work.');
  useAi(p);
  const msg = await anthropic().beta.messages.create({
    model: MODEL, max_tokens: 6000, ...FALLBACK, output_config: { effort: 'medium', format: { type: 'json_schema', schema: COACH_SCHEMA } },
    system: `You are an experienced Model UN chair marking a delegate's ${b.kind === 'speech' ? 'speech' : 'position paper'}. Mark against this rubric (0-10 each): research depth, accuracy to the country's real policy, quality and feasibility of solutions, structure, use of sources, diplomatic style. Quote any claim that is unsupported, overstated, outdated or likely false in "flagged", with a narrower, defensible rewrite. "missing" lists sections or evidence a chair would expect but cannot find. Be specific and kind; no generic advice.\n\n${context(project)}`,
    messages: [{ role: 'user', content: text.slice(0, 60000) }],
  });
  const out = JSON.parse(textOf(msg) || '{}');
  addItem(p, { projectId: b.projectId ?? null, kind: 'coach', title: `Feedback (${out.overall ?? '?'} / 100)`, body: text.slice(0, 20000), data: out });
  return out;
}

// ---------- practice (simulations) ----------
export const PRACTICE: Record<string, { label: string; system: (o: any) => string }> = {
  negotiation: { label: 'Negotiate with an AI delegation', system: (o) => `You are the delegate of ${o.counterpart || 'another country'} in ${o.committee || 'a UN committee'} negotiating on "${o.topic}". Stay in character and argue from ${o.counterpart || 'that country'}'s real interests and record. The user represents ${o.country || 'their delegation'}. Push back on weak points, raise sovereignty, funding and implementation concerns where realistic, propose counter-clauses, and only agree when the offer genuinely serves your country. Keep replies under 150 words. Never break character unless asked for feedback; when the user types "feedback", step out and give three specific notes on their negotiating.` },
  counter: { label: 'Stress-test an argument', system: (o) => `The user will state an argument on "${o.topic}"${o.country ? ` as ${o.country}` : ''}. Reply with the two or three strongest counterarguments a well-prepared opposing delegate would use, each with evidence, then ask a pointed question. When they answer, judge whether the answer holds and say why, briefly.` },
  leader: { label: 'Interview a historical figure', system: (o) => `You are ${o.figure || 'a historical statesperson'}, speaking as yourself, reflecting on decisions and context from your lifetime. Answer the user's interview questions in the first person, grounded in the historical record; when the record is uncertain, say so in character ("I have never spoken publicly about…"). Do not claim knowledge of events after your death. Keep answers under 180 words. This is an educational simulation, not a real quotation.` },
  crisis: { label: 'Crisis practice', system: (o) => `Run a short crisis committee simulation on "${o.topic}". The user holds the portfolio "${o.portfolio || o.country || 'a cabinet minister'}". Start with a crisis update (under 120 words). The user replies with directives; judge each for feasibility against their portfolio powers, then advance the crisis with consequences and a new update. Every third turn, give brief feedback on their directive writing (specific, actionable, within powers).` },
  speech: { label: 'Speech feedback', system: (o) => `The user will paste a speech for ${o.country || 'their delegation'} on "${o.topic}". Estimate its speaking time at ${WPM} words a minute, then give feedback: the opening hook, clarity of position, evidence, the ask of the room, and delivery notes (where to pause, what to cut). Offer a tightened version of the weakest paragraph.` },
};
export async function practice(p: Person, b: { mode: string; setup: any; messages: { role: 'user' | 'assistant'; content: string }[]; projectId?: string | null; save?: boolean }) {
  const m = PRACTICE[b.mode];
  if (!m) throw bad('Choose a practice mode');
  const setup = b.setup ?? {};
  if (!setup.topic && b.mode !== 'leader') throw bad('Say what the topic is');
  if (b.mode === 'leader' && !setup.figure) throw bad('Say who you want to interview');
  const msgs = (b.messages ?? []).slice(-20).map((x) => ({ role: x.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(x.content).slice(0, 6000) }));
  if (!msgs.length || msgs.at(-1)!.role !== 'user') throw bad('Say something first');
  const project = b.projectId ? access(p, b.projectId).project : null;
  if (!config.ai.enabled) throw conflict('Practice needs AI, which is not switched on for this site yet.');
  useAi(p);
  const msg = await anthropic().beta.messages.create({
    model: MODEL, max_tokens: 3000, ...FALLBACK, output_config: { effort: 'low' },
    system: `${m.system({ ...project, ...setup })}\n\nThis is an educational exercise for a student. ${context(project)}`, messages: msgs,
  });
  const reply = textOf(msg);
  if (b.save) addItem(p, { projectId: b.projectId ?? null, kind: 'practice', title: `${m.label}: ${setup.topic || setup.figure}`, body: [...msgs, { role: 'assistant', content: reply }].map((x) => `**${x.role === 'user' ? 'You' : 'Partner'}:** ${x.content}`).join('\n\n'), data: { mode: b.mode, setup } });
  return { reply };
}

// ---------- Discover: daily briefings ----------
const BRIEF_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['stories'],
  properties: { stories: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['headline', 'region', 'summary', 'why_it_matters', 'committees'],
    properties: { headline: { type: 'string' }, region: { type: 'string' }, summary: { type: 'string' }, why_it_matters: { type: 'string' }, committees: { type: 'array', items: { type: 'string' } } } } } },
};
export async function briefing(p: Person | null, b: { topics?: string[]; refresh?: boolean }) {
  const day = new Date().toISOString().slice(0, 10);
  const topics = (b.topics ?? []).map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 5).sort();
  const key = `${day}:${topics.join('|') || 'world'}`;
  const hit = cachedBriefing(key);
  if (hit && !b.refresh) return hit;
  if (!config.ai.enabled) throw conflict('Daily briefings need AI, which is not switched on for this site yet.');
  if (p) useAi(p); else throw bad('Sign in to load a fresh briefing');
  const found = await searchCall(`${SYSTEM}\nYou write the daily diplomatic briefing for MUN delegates.`, [{ role: 'user', content: `Search today's news (${day}) and pick the 6 most important developments in international affairs${topics.length ? ` with a focus on: ${topics.join(', ')}` : ''}. For each: what happened, the primary documents or official statements behind it, and which UN committees it matters to.` }], { maxTokens: 8000 });
  const msg = await anthropic().beta.messages.create({
    model: MODEL, max_tokens: 4000, ...FALLBACK, output_config: { effort: 'low', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
    messages: [{ role: 'user', content: `Turn these research notes into briefing stories (6 at most).\n\n${found.text}` }],
  });
  const out = { day, topics, stories: JSON.parse(textOf(msg) || '{"stories":[]}').stories, sources: found.sources };
  saveBriefing(key, out);
  return { ...out, created_at: new Date().toISOString() };
}

/** Comparing countries: sourced figures (population, GDP, HDI…) on demand. */
export async function compareCountries(p: Person, countries: string[]) {
  const list = (countries ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 4);
  if (list.length < 2) throw bad('Pick two to four countries');
  needAi(); useAi(p);
  return searchCall(SYSTEM, [{ role: 'user', content: `Compare ${list.join(', ')} in one Markdown table: capital, population, GDP (nominal, USD) and GDP per capita, Human Development Index (value and year), main UN groupings and blocs, and their positions on two current UN priorities. Give the year for every figure and cite the source (World Bank, UNDP, IMF, UN). Then three bullet points on what the comparison means for negotiations.` }], { maxTokens: 6000 });
}
