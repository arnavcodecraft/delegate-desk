import { OPERATIVE, PREAMBULATORY } from './mun';

/**
 * Resolution formatter: takes pasted clauses in any order and layout and returns them in UN style:
 * preambulatory clauses first (italic opening phrase, ending with a comma), then numbered operative clauses
 * (underlined opening phrase, ending with a semicolon, the last with a full stop), with sub-clauses lettered a), b)…
 */
export interface Clause { kind: 'pre' | 'op'; phrase: string; rest: string; subs: string[]; unknown?: boolean }
const byLength = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length);
const PRE = byLength(PREAMBULATORY); const OP = byLength(OPERATIVE);
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const strip = (s: string) => clean(s).replace(/^(\(?\d+[.)]|\(?[a-z][.)]|\(?[ivx]+[.)]|[-–•*])\s*/i, '').replace(/[,;.:]+$/, '').trim();

function match(line: string, phrases: string[]) {
  const lower = line.toLowerCase();
  return phrases.find((p) => lower.startsWith(p.toLowerCase()) && (lower.length === p.length || /[\s,]/.test(lower[p.length])));
}

export function parseResolution(text: string) {
  const header: string[] = []; const clauses: Clause[] = [];
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/\t/g, ' ')).filter((l) => l.trim());
  for (const raw of lines) {
    const isSub = /^\s*(\(?[a-z][.)]|\(?[ivx]+[.)]|[-–•*])\s+/i.test(raw) && !/^\s*\(?\d/.test(raw);
    const line = strip(raw);
    if (!line) continue;
    const pre = match(line, PRE); const op = match(line, OP);
    if (isSub && clauses.length && !pre && !op) { clauses[clauses.length - 1].subs.push(line); continue; }
    if (op && !(pre && pre.length > op.length)) clauses.push({ kind: 'op', phrase: op, rest: clean(line.slice(op.length)), subs: [] });
    else if (pre) clauses.push({ kind: 'pre', phrase: pre, rest: clean(line.slice(pre.length)), subs: [] });
    else if (!clauses.length) header.push(clean(raw));
    else if (clauses[clauses.length - 1].kind === 'op' && isSub) clauses[clauses.length - 1].subs.push(line);
    else clauses.push({ kind: clauses[clauses.length - 1].kind, phrase: '', rest: line, subs: [], unknown: true });
  }
  const pre = clauses.filter((c) => c.kind === 'pre'); const op = clauses.filter((c) => c.kind === 'op');
  const warnings: string[] = [];
  if (!pre.length) warnings.push('No preambulatory clauses found. They begin with phrases such as "Recalling" or "Deeply concerned".');
  if (!op.length) warnings.push('No operative clauses found. They begin with verbs such as "Calls upon", "Urges" or "Requests".');
  const unknown = clauses.filter((c) => c.unknown).length;
  if (unknown) warnings.push(`${unknown} clause${unknown > 1 ? 's do' : ' does'} not start with a recognised phrase; check the opening words.`);
  if (clauses.findIndex((c) => c.kind === 'op') > -1 && clauses.some((c, i) => c.kind === 'pre' && i > clauses.findIndex((x) => x.kind === 'op'))) warnings.push('Some preambulatory clauses came after operative ones; they have been moved up.');
  return { header, pre, op, warnings };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Plain-text output (for pasting into a document). */
export function formatResolution(text: string) {
  const r = parseResolution(text);
  const out: string[] = [...r.header, ...(r.header.length ? [''] : [])];
  r.pre.forEach((c) => out.push(`${c.phrase ? cap(c.phrase) : ''}${c.rest ? (c.phrase ? ' ' : '') + c.rest : ''},`));
  if (r.pre.length) out.push('');
  r.op.forEach((c, i) => {
    const last = i === r.op.length - 1;
    const body = `${c.phrase ? cap(c.phrase) : ''}${c.rest ? (c.phrase ? ' ' : '') + c.rest : ''}`;
    if (!c.subs.length) out.push(`${i + 1}. ${body}${last ? '.' : ';'}`);
    else {
      out.push(`${i + 1}. ${body.replace(/[:]?$/, ':')}`);
      c.subs.forEach((s, j) => out.push(`    ${String.fromCharCode(97 + j)}) ${s}${j === c.subs.length - 1 ? (last ? '.' : ';') : ';'}`));
    }
  });
  return { text: out.join('\n').trim(), ...r };
}

/** Decode a UN document symbol such as A/RES/77/1, S/RES/2231 (2015), E/RES/2020/12 or A/HRC/RES/52/1. */
export function decodeSymbol(sym: string) {
  const s = sym.trim().toUpperCase().replace(/\s+/g, ' ');
  let m: RegExpMatchArray | null;
  const link = `https://undocs.org/${encodeURIComponent(sym.trim().replace(/\s*\(\d{4}\)$/, ''))}`;
  if ((m = s.match(/^S\/RES\/(\d+)\s*(?:\((\d{4})\))?$/))) return { ok: true, body: 'Security Council', kind: 'Resolution', number: m[1], year: m[2] ?? null, session: null, note: 'Security Council resolutions are numbered in one running series since 1946. Resolutions under Chapter VII can be binding on all member states.', link };
  if ((m = s.match(/^S\/PRST\/(\d{4})\/(\d+)$/))) return { ok: true, body: 'Security Council', kind: 'Presidential statement', number: m[2], year: m[1], session: null, note: 'A statement by the Council president on behalf of all members, adopted by consensus. Not a resolution.', link };
  if ((m = s.match(/^A\/RES\/(\d+)\/(\d+)(?:\s*([A-Z]))?$/))) return { ok: true, body: 'General Assembly', kind: 'Resolution', number: m[2] + (m[3] ? ` ${m[3]}` : ''), year: String(1945 + Number(m[1])) + '–' + String(1946 + Number(m[1])), session: `${m[1]}th session`, note: 'General Assembly resolutions are recommendations, not binding, except on internal UN matters such as the budget. Session N runs from September of 1945+N.', link };
  if ((m = s.match(/^A\/RES\/ES-(\d+)\/(\d+)$/))) return { ok: true, body: 'General Assembly', kind: 'Emergency special session resolution', number: m[2], year: null, session: `${m[1]}th emergency special session`, note: 'Emergency special sessions can be called under "Uniting for Peace" (A/RES/377 (V)) when the Security Council is deadlocked.', link };
  if ((m = s.match(/^A\/HRC\/RES\/(\d+)\/(\d+)$/))) return { ok: true, body: 'Human Rights Council', kind: 'Resolution', number: m[2], year: null, session: `${m[1]}th regular session`, note: 'The Council holds three regular sessions a year in Geneva; numbering follows the session.', link };
  if ((m = s.match(/^E\/RES\/(\d{4})\/(\d+)$/))) return { ok: true, body: 'Economic and Social Council', kind: 'Resolution', number: m[2], year: m[1], session: null, note: 'ECOSOC resolutions are numbered by year.', link };
  if ((m = s.match(/^A\/C\.(\d)\/(\d+)\/L\.(\d+)/))) return { ok: true, body: `General Assembly ${['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][Number(m[1])] ?? ''} Committee`, kind: 'Draft (L. document)', number: m[3], year: null, session: `${m[2]}th session`, note: '"L." documents are limited-distribution drafts, before adoption.', link };
  if ((m = s.match(/^A\/(\d+)\/(\d+)$/))) return { ok: true, body: 'General Assembly', kind: 'Document (report, letter or note)', number: m[2], year: null, session: `${m[1]}th session`, note: 'A plain A/ symbol is a General Assembly document, often a report of the Secretary-General.', link };
  if ((m = s.match(/^S\/(\d{4})\/(\d+)$/))) return { ok: true, body: 'Security Council', kind: 'Document (report or letter)', number: m[2], year: m[1], session: null, note: 'Security Council documents such as Secretary-General reports and letters from member states.', link };
  return { ok: false, body: '', kind: '', number: '', year: null, session: null, note: 'Not a recognised UN symbol. Try A/RES/77/1, S/RES/2231 (2015), A/HRC/RES/52/1 or E/RES/2020/12.', link: null };
}

/** Position paper checks: words, pages, speaking time, the limit, expected sections and citations. */
export function checkPaper(text: string, o: { limit?: number; wpm?: number } = {}) {
  const words = (text.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
  const chars = text.length;
  const wpm = o.wpm ?? 130;
  const sections: [string, RegExp][] = [
    ['Background of the topic', /\b(background|history|overview|introduction)\b/i],
    ['Past international action', /\b(resolution|un action|past action|international action|convention|treaty|S\/RES|A\/RES)\b/i],
    ['Country policy', /\b(policy|position|stance|our delegation|believes|the (republic|kingdom|state|federation) of)\b/i],
    ['Proposed solutions', /\b(solution|propose|proposes|recommend|calls for|urges|suggests)\b/i],
  ];
  const citations = (text.match(/\[\d+\]|\(\w[^()]*\d{4}\)|https?:\/\/\S+|\bS\/RES\/\d+|\bA\/RES\/\d+\/\d+/g) ?? []).length;
  return {
    words, chars, pages: Math.max(1, Math.round((words / 500) * 10) / 10), seconds: Math.round((words / wpm) * 60),
    overLimit: o.limit ? words > o.limit : false, limit: o.limit ?? null,
    missing: sections.filter(([, re]) => !re.test(text)).map(([n]) => n), citations,
    sentences: (text.match(/[.!?](\s|$)/g) ?? []).length,
  };
}
