/**
 * Google Gemini (AI Studio key) as an alternative to Claude for every AI feature.
 *
 * - Models are tried in order (GEMINI_MODEL first, then fallbacks), moving on when one is unavailable,
 *   over quota or too slow, so a free key keeps working.
 * - Web search uses Google Search grounding; if the key's quota doesn't allow it, the answer is produced
 *   without search and marked as not grounded, rather than failing.
 * - Structured answers use a JSON schema; tool use runs a function-calling loop.
 */
import { HttpError } from '../util.ts';

const BASE = () => (process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
export const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
export const geminiModels = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.1-flash-lite'].filter(Boolean) as string[])];
const TIMEOUT_MS = () => Number(process.env.GEMINI_TIMEOUT_MS ?? 35_000);
// Newer Gemini models think before answering, and the thinking counts against maxOutputTokens: leave room so answers aren't cut short.
const budget = (maxTokens?: number) => Math.min(65_536, (maxTokens ?? 8192) + 4096);

export type Part = { text?: string; inline_data?: { mime_type: string; data: string }; functionCall?: any; functionResponse?: any; thoughtSignature?: string; thought?: boolean };
export type Content = { role: 'user' | 'model'; parts: Part[] };
export interface Source { url: string; title: string; quote?: string }

class GeminiError extends Error { constructor(public status: number, message: string) { super(message); } }
const retryable = (e: any) => e instanceof GeminiError ? [404, 408, 429, 500, 502, 503, 504].includes(e.status) : e?.name === 'TimeoutError' || e?.name === 'AbortError' || /fetch failed|ECONN|ETIMEDOUT/i.test(String(e?.message));
const isQuota = (e: any) => e instanceof GeminiError && e.status === 429;

async function call(model: string, body: any) {
  const r = await fetch(`${BASE()}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey() }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS()),
  });
  const text = await r.text();
  let d: any; try { d = JSON.parse(text); } catch { d = null; }
  if (!r.ok) throw new GeminiError(r.status, d?.error?.message ?? text.slice(0, 300));
  return d;
}

const coolUntil = new Map<string, number>();
export const resetGeminiModels = () => coolUntil.clear();
/** Try each model until one answers. Returns the response and the model used. */
async function generate(body: any) {
  let last: any = null;
  const models = geminiModels();
  // Models that just failed (over quota, removed, too slow) wait out a cool-down, unless every model is cooling.
  const ready = models.filter((m) => (coolUntil.get(m) ?? 0) < Date.now());
  for (const m of ready.length ? ready : models) {
    try { return { d: await call(m, body), model: m }; }
    catch (e) {
      last = e;
      if (!retryable(e)) break;
      coolUntil.set(m, Date.now() + (e instanceof GeminiError && e.status === 404 ? 6 * 3600_000 : 5 * 60_000));
    }
  }
  if (isQuota(last)) throw new HttpError(429, 'The Google AI key is over its quota right now. Try again in a minute, or turn on billing for the key in Google AI Studio.');
  if (last instanceof GeminiError && (last.status === 400 || last.status === 403)) throw new HttpError(502, `Google AI refused the request: ${last.message.slice(0, 200)}`);
  throw new HttpError(502, `Google AI did not answer: ${String(last?.message ?? last).slice(0, 200)}`);
}

function candidate(d: any) {
  const c = d?.candidates?.[0];
  if (!c) { if (d?.promptFeedback?.blockReason) throw new HttpError(422, 'The assistant declined this request. Please handle it manually.'); throw new HttpError(502, 'Google AI returned no answer'); }
  if (c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT') throw new HttpError(422, 'The assistant declined this request. Please handle it manually.');
  return c;
}
const textOfParts = (parts: Part[] = []) => parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();

/** Turn simple chat messages into Gemini contents. */
export const toContents = (messages: { role: 'user' | 'assistant'; content: string | Part[] }[]): Content[] =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content }));

/** Free text, optionally grounded with Google Search. */
export async function geminiText(o: { system?: string; contents: Content[]; search?: boolean; maxTokens?: number }) {
  const base = { contents: o.contents, ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}), generationConfig: { maxOutputTokens: budget(o.maxTokens) } };
  if (o.search && Date.now() > searchBlockedUntil) {
    try {
      const { d } = await generate({ ...base, tools: [{ google_search: {} }] });
      const c = candidate(d);
      const g = c.groundingMetadata ?? {};
      const sources: Source[] = (g.groundingChunks ?? []).map((x: any) => x.web).filter((w: any) => w?.uri).map((w: any) => ({ url: w.uri, title: w.title || w.uri }));
      return { text: textOfParts(c.content?.parts), sources: dedupe(sources), grounded: true };
    } catch (e: any) {
      if (!(e instanceof HttpError && (e.status === 429 || e.status === 502))) throw e;
      // Search quota not available on this key: answer from the model alone, clearly labelled, and skip search for a while.
      searchBlockedUntil = Date.now() + 10 * 60_000;
    }
  }
  const { d } = await generate(base);
  const c = candidate(d);
  const text = textOfParts(c.content?.parts);
  return { text: o.search ? `> **No live sources:** web search isn't available on this site's Google AI key right now, so this answer comes from the model alone. Check facts before you rely on them.\n\n${text}` : text, sources: [] as Source[], grounded: false };
}
let searchBlockedUntil = 0;
export const resetGeminiSearch = () => { searchBlockedUntil = 0; };
const dedupe = (xs: Source[]) => [...new Map(xs.map((x) => [x.url, x])).values()].slice(0, 12);

/** JSON matching a schema. Accepts JSON Schema (as used for Claude); unsupported keywords are stripped. */
export async function geminiJson<T = any>(o: { system?: string; contents: Content[]; schema: any; maxTokens?: number }): Promise<T> {
  const { d } = await generate({
    contents: o.contents, ...(o.system ? { systemInstruction: { parts: [{ text: o.system }] } } : {}),
    generationConfig: { maxOutputTokens: budget(o.maxTokens), responseMimeType: 'application/json', responseSchema: toOpenApi(o.schema) },
  });
  const text = textOfParts(candidate(d).content?.parts);
  try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new HttpError(502, 'Google AI returned an unreadable answer; try again.'); }
}

/** JSON Schema → the OpenAPI subset Gemini's responseSchema accepts (nullable instead of type arrays, no additionalProperties). */
export function toOpenApi(s: any): any {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s.map(toOpenApi);
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (['additionalProperties', '$schema', 'default', '$id', 'examples'].includes(k)) continue;
    if (k === 'type' && Array.isArray(v)) { const t = v.filter((x) => x !== 'null'); out.type = t[0] ?? 'string'; if (v.includes('null')) out.nullable = true; continue; }
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v as any).map(([pk, pv]) => [pk, toOpenApi(pv)])) : toOpenApi(v);
  }
  return out;
}

/** A function-calling loop with read-only tools. */
export async function geminiTools(o: { system: string; contents: Content[]; tools: { name: string; description: string; parameters: any; run: (input: any) => Promise<string> }[]; maxSteps?: number }) {
  const contents = [...o.contents];
  const decl = [{ functionDeclarations: o.tools.map((t) => ({ name: t.name, description: t.description, parameters: toOpenApi(t.parameters) })) }];
  for (let step = 0; step < (o.maxSteps ?? 8); step++) {
    const { d } = await generate({ contents, systemInstruction: { parts: [{ text: o.system }] }, tools: decl, generationConfig: { maxOutputTokens: budget(4096) } });
    const c = candidate(d);
    const parts: Part[] = c.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return textOfParts(parts);
    contents.push({ role: 'model', parts });   // keep thought signatures with the calls
    const responses: Part[] = [];
    for (const p of calls) {
      const t = o.tools.find((x) => x.name === p.functionCall.name);
      let result: string;
      try { result = t ? await t.run(p.functionCall.args ?? {}) : 'Unknown tool'; } catch (e: any) { result = `Error: ${e?.message ?? e}`; }
      responses.push({ functionResponse: { name: p.functionCall.name, response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  throw new HttpError(502, 'The assistant took too many steps; ask a narrower question.');
}

export const filePart = (buf: Buffer, mime: string): Part => ({ inline_data: { mime_type: mime, data: buf.toString('base64') } });

/** Which AI provider to use: AI_PROVIDER wins, then whichever key is present (Claude first). */
export function aiProvider(): 'anthropic' | 'gemini' {
  const want = String(process.env.AI_PROVIDER ?? '').toLowerCase();
  if (want === 'gemini' || want === 'google') return 'gemini';
  if (want === 'anthropic' || want === 'claude') return 'anthropic';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'anthropic';
  return geminiKey() ? 'gemini' : 'anthropic';
}
export const useGemini = () => aiProvider() === 'gemini';
