/**
 * Executive Board marking for a live session, modelled on the marksheets EBs keep by hand
 * (marksheet, verbatim and recognition sheets).
 *
 * - Every speech is recorded under a segment: the GSL, or a moderated caucus (MOD-1, MOD-2…), which
 *   start on their own when the motion passes. The EB scores it and keeps verbatim notes.
 * - Points of information (verbal POIs), chits (substantive and POI) and manual criteria
 *   (lobbying, documentation…) are marked per delegation.
 * - A scheme turns these into a total: groups of sources, each with a weight
 *   (e.g. Verbatim = speeches + verbal POIs × 0.8; Chits = chits × 0.2; Lobbying and Documentation as marked).
 * - Attendance is kept per day (P / PV) from the roll call.
 *
 * Marks are private to the EB: the public session view never includes them.
 */
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { bad, conflict, notFound, now } from '../util.ts';

export type Source = 'speeches' | 'pois' | 'chits_substantive' | 'chits_poi' | 'manual';
export interface Group { key: string; label: string; weight: number; sources: Source[]; max?: number | null }
export interface Scheme {
  preset: string;
  speechMax: number;                    // a speech is marked out of this
  poiMax: number;                       // a verbal POI is marked out of this
  chitMax: number;
  segmentScore: 'average' | 'sum' | 'best';   // several speeches by one delegation in the same column
  groups: Group[];
  awards: { label: string; count: number }[];
}
export interface Segment { id: string; kind: 'gsl' | 'mod' | 'other'; column: string; label: string; topic: string | null; totalSeconds: number | null; speakingSeconds: number | null; proposer: string | null; day: number; startedAt: string }
export interface Speech { id: string; segmentId: string; delegateId: string; at: string; score: number | null; notes: string; offline: boolean; markedBy?: string }
export interface Poi { id: string; segmentId: string | null; by: string; to: string | null; at: string; score: number | null; notes: string; markedBy?: string }
export interface Chit { id: string; kind: 'substantive' | 'poi'; by: string; to: string | null; at: string; score: number | null; notes: string; markedBy?: string }
export interface Marking {
  enabled: boolean;
  day: number;
  scheme: Scheme;
  segments: Segment[];
  currentSegment: string | null;
  speeches: Speech[];
  pois: Poi[];
  chits: Chit[];
  manual: Record<string, Record<string, number>>;   // delegate id -> group key -> mark
  attendance: Record<string, Record<string, 'P' | 'PV' | 'A'>>; // day -> delegate id -> presence
}

export const PRESETS: Record<string, { label: string; scheme: Omit<Scheme, 'preset'> }> = {
  verbatim_chits: {
    label: 'Verbatim 80% · Chits 20% · Lobbying · Documentation',
    scheme: {
      speechMax: 10, poiMax: 1, chitMax: 10, segmentScore: 'average',
      groups: [
        { key: 'verbatim', label: 'Verbatim', weight: 0.8, sources: ['speeches', 'pois'] },
        { key: 'chits', label: 'Chits', weight: 0.2, sources: ['chits_substantive', 'chits_poi'] },
        { key: 'lobbying', label: 'Lobbying', weight: 1, sources: ['manual'], max: 5 },
        { key: 'documentation', label: 'Documentation', weight: 1, sources: ['manual'], max: 5 },
      ],
      awards: [{ label: 'Best Delegate', count: 1 }, { label: 'High Commendation', count: 1 }, { label: 'Special Mention', count: 1 }, { label: 'Verbal Mention', count: 2 }],
    },
  },
  hundred: {
    label: '100 points · Speeches 40 · POIs 10 · Chits 10 · Lobbying 20 · Documentation 20',
    scheme: {
      speechMax: 10, poiMax: 2, chitMax: 5, segmentScore: 'average',
      groups: [
        { key: 'speeches', label: 'Speeches', weight: 1, sources: ['speeches'], max: 40 },
        { key: 'pois', label: 'POIs', weight: 1, sources: ['pois'], max: 10 },
        { key: 'chits', label: 'Chits', weight: 1, sources: ['chits_substantive', 'chits_poi'], max: 10 },
        { key: 'lobbying', label: 'Lobbying', weight: 1, sources: ['manual'], max: 20 },
        { key: 'documentation', label: 'Documentation', weight: 1, sources: ['manual'], max: 20 },
      ],
      awards: [{ label: 'Best Delegate', count: 1 }, { label: 'High Commendation', count: 1 }, { label: 'Special Mention', count: 1 }, { label: 'Verbal Mention', count: 2 }],
    },
  },
};

const rid = () => crypto.randomBytes(6).toString('base64url');
const r2 = (n: number) => Math.round(n * 100) / 100;

export function newMarking(preset = 'verbatim_chits'): Marking {
  const p = PRESETS[preset] ?? PRESETS.verbatim_chits;
  return { enabled: true, day: 1, scheme: { preset, ...structuredClone(p.scheme) }, segments: [], currentSegment: null, speeches: [], pois: [], chits: [], manual: {}, attendance: {} };
}

export type MarkAction =
  | { type: 'eb_enable'; preset?: string }
  | { type: 'eb_scheme'; scheme: Partial<Scheme> }
  | { type: 'eb_day'; day: number }
  | { type: 'eb_segment'; kind: Segment['kind']; label?: string; topic?: string | null }
  | { type: 'eb_segment_edit'; segmentId: string; label?: string; topic?: string | null }
  | { type: 'eb_segment_select'; segmentId: string }
  | { type: 'eb_recognise'; delegateId: string; startTimer?: boolean }
  | { type: 'eb_speech'; speechId: string; score?: number | null; notes?: string; offline?: boolean }
  | { type: 'eb_speech_remove'; speechId: string }
  | { type: 'eb_poi'; by: string; to?: string | null; score?: number | null; notes?: string }
  | { type: 'eb_poi_edit'; poiId: string; score?: number | null; notes?: string }
  | { type: 'eb_poi_remove'; poiId: string }
  | { type: 'eb_chit'; kind: Chit['kind']; by: string; to?: string | null; score?: number | null; notes?: string }
  | { type: 'eb_chit_edit'; chitId: string; score?: number | null; notes?: string }
  | { type: 'eb_chit_remove'; chitId: string }
  | { type: 'eb_manual'; delegateId: string; key: string; value: number | null }
  | { type: 'eb_attendance'; day: number; delegateId: string; value: 'P' | 'PV' | 'A' };

interface Host { delegates: { id: string; name: string; presence: string }[]; marking?: Marking; speakers: { current: string | null; speakingTime: number } }

const score = (v: unknown, max: number, what: string) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw bad(`${what} must be between 0 and ${max}`);
  return r2(n);
};
const need = (h: Host, id: string | null | undefined) => { if (!id || !h.delegates.some((d) => d.id === id)) throw notFound('Delegation'); return id; };

/** The column a new segment goes in: all GSL rounds share one; each moderated caucus gets its own. */
function nextColumn(m: Marking, kind: Segment['kind']) {
  if (kind === 'gsl') return 'GSL';
  const n = m.segments.filter((s) => s.kind === kind).length + 1;
  return kind === 'mod' ? `MOD-${n}` : `OTHER-${n}`;
}
export function openSegment(m: Marking, o: { kind: Segment['kind']; label?: string; topic?: string | null; totalSeconds?: number | null; speakingSeconds?: number | null; proposer?: string | null }) {
  const column = nextColumn(m, o.kind);
  const gslRounds = m.segments.filter((s) => s.kind === 'gsl').length;
  const seg: Segment = {
    id: rid(), kind: o.kind, column, label: o.label?.trim() || (o.kind === 'gsl' ? `GSL-${gslRounds + 1}` : column), topic: o.topic?.trim() || null,
    totalSeconds: o.totalSeconds ?? null, speakingSeconds: o.speakingSeconds ?? null, proposer: o.proposer ?? null, day: m.day, startedAt: now(),
  };
  m.segments.push(seg); m.currentSegment = seg.id;
  return seg;
}
function current(m: Marking) {
  return m.segments.find((s) => s.id === m.currentSegment) ?? null;
}
export function addSpeech(m: Marking, delegateId: string) {
  const seg = current(m) ?? openSegment(m, { kind: 'gsl' });
  const sp: Speech = { id: rid(), segmentId: seg.id, delegateId, at: now(), score: null, notes: '', offline: false };
  m.speeches.push(sp);
  return sp;
}

export function applyMark(h: Host, a: MarkAction) {
  if (a.type === 'eb_enable') { if (!h.marking) h.marking = newMarking(a.preset); else h.marking.enabled = true; return; }
  const m = h.marking;
  if (!m) throw conflict('Turn on marking first');
  switch (a.type) {
    case 'eb_scheme': {
      const s = a.scheme ?? {};
      if (s.preset && PRESETS[s.preset] && s.preset !== m.scheme.preset) { m.scheme = { preset: s.preset, ...structuredClone(PRESETS[s.preset].scheme) }; break; }
      for (const k of ['speechMax', 'poiMax', 'chitMax'] as const) if (s[k] !== undefined) { const n = Number(s[k]); if (!(n > 0 && n <= 1000)) throw bad('Maximum marks must be above 0'); m.scheme[k] = n; }
      if (s.segmentScore) { if (!['average', 'sum', 'best'].includes(s.segmentScore)) throw bad('Unknown rule'); m.scheme.segmentScore = s.segmentScore; }
      if (s.groups) {
        if (!Array.isArray(s.groups) || !s.groups.length) throw bad('Keep at least one criterion');
        const keys = new Set<string>();
        m.scheme.groups = s.groups.map((g) => {
          const label = String(g.label ?? '').trim(); if (!label) throw bad('Every criterion needs a name');
          const key = (g.key || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
          if (keys.has(key)) throw bad(`Two criteria are called ${label}`); keys.add(key);
          const sources = (g.sources ?? []).filter((x): x is Source => ['speeches', 'pois', 'chits_substantive', 'chits_poi', 'manual'].includes(x));
          if (!sources.length) throw bad(`Say what ${label} is made of`);
          const weight = Number(g.weight); if (!(weight > 0 && weight <= 100)) throw bad(`Weight for ${label} must be above 0`);
          const max = g.max === null || g.max === undefined || (g.max as any) === '' ? null : Number(g.max);
          if (max !== null && !(max > 0)) throw bad(`Maximum for ${label} must be above 0`);
          return { key, label, weight, sources: [...new Set(sources)], max };
        });
      }
      if (s.awards) m.scheme.awards = s.awards.map((x) => ({ label: String(x.label ?? '').trim(), count: Math.max(0, Math.min(20, Math.round(Number(x.count) || 0))) })).filter((x) => x.label);
      break;
    }
    case 'eb_day': { const d = Math.round(Number(a.day)); if (!(d >= 1 && d <= 10)) throw bad('Day must be 1–10'); m.day = d; break; }
    case 'eb_segment': openSegment(m, { kind: a.kind, label: a.label, topic: a.topic }); break;
    case 'eb_segment_edit': { const s = m.segments.find((x) => x.id === a.segmentId); if (!s) throw notFound('Segment'); if (a.label !== undefined) s.label = a.label.trim() || s.label; if (a.topic !== undefined) s.topic = a.topic?.trim() || null; break; }
    case 'eb_segment_select': { if (!m.segments.some((x) => x.id === a.segmentId)) throw notFound('Segment'); m.currentSegment = a.segmentId; break; }
    case 'eb_recognise': addSpeech(m, need(h, a.delegateId)); break;
    case 'eb_speech': {
      const sp = m.speeches.find((x) => x.id === a.speechId); if (!sp) throw notFound('Speech');
      if (a.score !== undefined) sp.score = score(a.score, m.scheme.speechMax, 'A speech mark');
      if (a.notes !== undefined) sp.notes = String(a.notes).slice(0, 4000);
      if (a.offline !== undefined) sp.offline = !!a.offline;
      break;
    }
    case 'eb_speech_remove': m.speeches = m.speeches.filter((x) => x.id !== a.speechId); break;
    case 'eb_poi': {
      const seg = current(m);
      m.pois.push({ id: rid(), segmentId: seg?.id ?? null, by: need(h, a.by), to: a.to ? need(h, a.to) : (h.speakers.current ?? null), at: now(), score: score(a.score, m.scheme.poiMax, 'A POI mark'), notes: String(a.notes ?? '').slice(0, 2000) });
      break;
    }
    case 'eb_poi_edit': { const p = m.pois.find((x) => x.id === a.poiId); if (!p) throw notFound('POI'); if (a.score !== undefined) p.score = score(a.score, m.scheme.poiMax, 'A POI mark'); if (a.notes !== undefined) p.notes = String(a.notes).slice(0, 2000); break; }
    case 'eb_poi_remove': m.pois = m.pois.filter((x) => x.id !== a.poiId); break;
    case 'eb_chit': {
      if (!['substantive', 'poi'].includes(a.kind)) throw bad('Choose the chit type');
      m.chits.push({ id: rid(), kind: a.kind, by: need(h, a.by), to: a.to ? need(h, a.to) : null, at: now(), score: score(a.score, m.scheme.chitMax, 'A chit mark'), notes: String(a.notes ?? '').slice(0, 2000) });
      break;
    }
    case 'eb_chit_edit': { const c = m.chits.find((x) => x.id === a.chitId); if (!c) throw notFound('Chit'); if (a.score !== undefined) c.score = score(a.score, m.scheme.chitMax, 'A chit mark'); if (a.notes !== undefined) c.notes = String(a.notes).slice(0, 2000); break; }
    case 'eb_chit_remove': m.chits = m.chits.filter((x) => x.id !== a.chitId); break;
    case 'eb_manual': {
      need(h, a.delegateId);
      const g = m.scheme.groups.find((x) => x.key === a.key && x.sources.includes('manual'));
      if (!g) throw notFound('Criterion');
      const row = (m.manual[a.delegateId] ??= {});
      const v = score(a.value, g.max ?? 1000, g.label);
      if (v === null) delete row[a.key]; else row[a.key] = v;
      break;
    }
    case 'eb_attendance': {
      need(h, a.delegateId);
      if (!['P', 'PV', 'A'].includes(a.value)) throw bad('Use P, PV or A');
      (m.attendance[String(a.day)] ??= {})[a.delegateId] = a.value;
      break;
    }
    default: throw bad('Unknown marking action');
  }
}

/** Called after every chair action: opens segments when caucuses start, records speakers, keeps attendance. */
export function follow(h: Host & { mode: string; motions: { id: string; type: string; status: string; topic: string | null; duration: number | null; speakingTime: number | null; proposer: string | null }[] }, prev: { mode: string; motions: { id: string; status: string }[]; speakers: { current: string | null } }, a: { type: string }) {
  const m = h.marking;
  if (!m?.enabled) return;
  // A moderated caucus or the speakers list starting opens a new segment.
  for (const mo of h.motions) {
    const was = prev.motions.find((x) => x.id === mo.id)?.status;
    if (mo.status === 'passed' && was !== 'passed') {
      if (mo.type === 'moderated') openSegment(m, { kind: 'mod', topic: mo.topic, totalSeconds: mo.duration, speakingSeconds: mo.speakingTime, proposer: mo.proposer });
      if (mo.type === 'open_debate') openSegment(m, { kind: 'gsl', speakingSeconds: mo.speakingTime, proposer: mo.proposer });
    }
  }
  if (h.mode === 'gsl' && prev.mode !== 'gsl' && current(m)?.kind !== 'gsl') openSegment(m, { kind: 'gsl' });
  // A new speaker on the floor is a speech to mark.
  if (a.type === 'speaker_next' && h.speakers.current && h.speakers.current !== prev.speakers.current) addSpeech(m, h.speakers.current);
  // Closing the roll call records the day's attendance.
  if (a.type === 'roll_call' && prev.mode === 'roll_call' && h.mode !== 'roll_call') {
    const day = (m.attendance[String(m.day)] ??= {});
    for (const d of h.delegates) day[d.id] = d.presence === 'present_voting' ? 'PV' : d.presence === 'present' ? 'P' : 'A';
  }
}

// ---------- results ----------
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
function combine(xs: number[], rule: Scheme['segmentScore']) {
  if (!xs.length) return null;
  return rule === 'sum' ? sum(xs) : rule === 'best' ? Math.max(...xs) : sum(xs) / xs.length;
}

/** The marksheet: one row per delegation with every column, group totals, the total and the rank. */
export function marksheet(h: Host) {
  const m = h.marking;
  if (!m) return null;
  const columns = [...new Set(m.segments.map((s) => s.column))];
  const segCol = new Map(m.segments.map((s) => [s.id, s.column]));
  const days = Object.keys(m.attendance).map(Number).sort((a, b) => a - b);
  const rows = h.delegates.map((d) => {
    const bySeg: Record<string, number | null> = {};
    for (const c of columns) {
      const xs = m.speeches.filter((s) => s.delegateId === d.id && segCol.get(s.segmentId) === c && s.score !== null).map((s) => s.score!);
      const v = combine(xs, m.scheme.segmentScore); bySeg[c] = v === null ? null : r2(v);
    }
    const poiMarks = m.pois.filter((p) => p.by === d.id && p.score !== null).map((p) => p.score!);
    const sources: Record<Source, number> = {
      speeches: sum(Object.values(bySeg).map((x) => x ?? 0)),
      pois: sum(poiMarks),
      chits_substantive: sum(m.chits.filter((c) => c.by === d.id && c.kind === 'substantive' && c.score !== null).map((c) => c.score!)),
      chits_poi: sum(m.chits.filter((c) => c.by === d.id && c.kind === 'poi' && c.score !== null).map((c) => c.score!)),
      manual: 0,
    };
    const groups: Record<string, { raw: number; weighted: number }> = {};
    for (const g of m.scheme.groups) {
      let raw = sum(g.sources.filter((s) => s !== 'manual').map((s) => sources[s]));
      if (g.sources.includes('manual')) raw += m.manual[d.id]?.[g.key] ?? 0;
      if (g.max) raw = Math.min(raw, g.max);
      groups[g.key] = { raw: r2(raw), weighted: r2(raw * g.weight) };
    }
    const total = r2(sum(Object.values(groups).map((g) => g.weighted)));
    return {
      delegateId: d.id, portfolio: d.name,
      attendance: Object.fromEntries(days.map((n) => [n, m.attendance[String(n)]?.[d.id] ?? ''])),
      segments: bySeg, poiMarks: poiMarks.map(r2), sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, r2(v)])),
      manual: m.manual[d.id] ?? {}, groups, total,
      speeches: m.speeches.filter((s) => s.delegateId === d.id).length,
      pois: m.pois.filter((p) => p.by === d.id).length,
      chits: m.chits.filter((c) => c.by === d.id).length,
      rank: 0, award: null as string | null,
    };
  });
  const ranked = [...rows].sort((a, b) => b.total - a.total || b.speeches - a.speeches || a.portfolio.localeCompare(b.portfolio));
  ranked.forEach((r, i) => { r.rank = i > 0 && ranked[i - 1].total === r.total ? ranked[i - 1].rank : i + 1; });
  let i = 0;
  for (const aw of m.scheme.awards) for (let k = 0; k < aw.count && i < ranked.length; k++, i++) if (ranked[i].total > 0) ranked[i].award = aw.label;
  return { columns, days, rows: ranked, scheme: m.scheme };
}

/** Who was recognised in each segment (speeches and POIs, in order), and motions by proposer. */
export function recognition(h: Host & { motions: { type: string; proposer: string | null; topic: string | null; duration: number | null; speakingTime: number | null; status: string }[] }, motionLabel: (t: string) => string) {
  const m = h.marking;
  if (!m) return null;
  const name = (id: string | null) => h.delegates.find((d) => d.id === id)?.name ?? '—';
  const segments = m.segments.map((s) => ({
    id: s.id, label: s.label, column: s.column, topic: s.topic, kind: s.kind, day: s.day,
    speakers: m.speeches.filter((x) => x.segmentId === s.id).map((x) => name(x.delegateId)),
    pois: m.pois.filter((x) => x.segmentId === s.id).map((x) => name(x.by)),
  }));
  const motions = h.motions.filter((x) => x.proposer).map((x) => ({
    proposer: name(x.proposer), status: x.status,
    text: [motionLabel(x.type), x.topic ? `"${x.topic}"` : null, x.duration ? Math.round(x.duration / 60) + ' min' : null, x.speakingTime ? x.speakingTime + 's' : null].filter(Boolean).join(', '),
  }));
  return { segments, motions };
}

// ---------- Excel export (marksheet, verbatim and recognition sheets) ----------

const colName = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export async function marksheetXlsx(h: Host & { committee: { name: string; short: string }; motions: any[] }, motionLabel: (t: string) => string) {
  const ms = marksheet(h); const rec = recognition(h, motionLabel); const m = h.marking;
  if (!ms || !rec || !m) throw conflict('Turn on marking first');
  const wb = new ExcelJS.Workbook(); wb.creator = 'DelegateDesk';
  const head = (ws: ExcelJS.Worksheet) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }; ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }]; };

  // MARKSHEET: attendance, one column per segment, verbal POI, then each group's subtotal as a live formula.
  const ws = wb.addWorksheet('MARKSHEET');
  const cols: string[] = ['PORTFOLIO', ...ms.days.map((d) => `DAY-${d}`)];
  const segStart = cols.length; cols.push(...ms.columns);
  const poiCol = cols.length; cols.push('VERBAL POI');
  const subCol = cols.length; cols.push('SUBSTANTIVE CHITS');
  const poiChitCol = cols.length; cols.push('POI CHITS');
  const groupCol: Record<string, number> = {}; const manualCol: Record<string, number> = {};
  for (const g of ms.scheme.groups) if (g.sources.includes('manual')) { manualCol[g.key] = cols.length; cols.push(`${g.label.toUpperCase()} (MARKED)`); }
  for (const g of ms.scheme.groups) { groupCol[g.key] = cols.length; cols.push(`${g.label.toUpperCase()}${g.weight !== 1 ? ` (${Math.round(g.weight * 100)}%)` : ''}`); }
  const totalCol = cols.length; cols.push('TOTAL'); const rankCol = cols.length; cols.push('RANK'); cols.push('AWARD');
  ws.addRow(cols); head(ws);
  ms.rows.forEach((r, i) => {
    const n = i + 2; const ref = (c: number) => `${colName(c)}${n}`;
    const vals: any[] = [r.portfolio, ...ms.days.map((d) => r.attendance[d] || '')];
    for (const c of ms.columns) vals.push(r.segments[c] ?? 0);
    vals.push(r.poiMarks.length > 1 ? { formula: r.poiMarks.join('+'), result: r.sources.pois } : (r.poiMarks[0] ?? 0));
    vals.push(r.sources.chits_substantive, r.sources.chits_poi);
    for (const g of ms.scheme.groups) if (g.sources.includes('manual')) vals.push(r.manual[g.key] ?? 0);
    for (const g of ms.scheme.groups) {
      const parts: string[] = [];
      if (g.sources.includes('speeches') && ms.columns.length) parts.push(`${ref(segStart)}:${ref(segStart + ms.columns.length - 1)}`);
      if (g.sources.includes('pois')) parts.push(ref(poiCol));
      if (g.sources.includes('chits_substantive')) parts.push(ref(subCol));
      if (g.sources.includes('chits_poi')) parts.push(ref(poiChitCol));
      if (g.sources.includes('manual')) parts.push(ref(manualCol[g.key]));
      let f = parts.length ? `SUM(${parts.join(',')})` : '0';
      if (g.max) f = `MIN(${f},${g.max})`;
      if (g.weight !== 1) f = `${f}*${g.weight}`;
      vals.push({ formula: f, result: r.groups[g.key].weighted });
    }
    vals.push({ formula: `SUM(${ms.scheme.groups.map((g) => ref(groupCol[g.key])).join(',')})`, result: r.total });
    vals.push({ formula: `RANK(${ref(totalCol)},$${colName(totalCol)}$2:$${colName(totalCol)}$${ms.rows.length + 1})`, result: r.rank });
    vals.push(r.award ?? '');
    ws.addRow(vals);
  });
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 22 : Math.max(10, String(cols[i]).length + 2); });

  // VERBATIM: a heading row per segment, then each speech's notes.
  const vb = wb.addWorksheet('VERBATIM');
  vb.addRow(['PORTFOLIO', 'VERBATIM', 'MARK']); head(vb);
  const name = (id: string | null) => h.delegates.find((d) => d.id === id)?.name ?? '—';
  for (const s of m.segments) {
    const row = vb.addRow([s.label.toUpperCase(), s.topic ?? '']); row.font = { bold: true }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3ECFF' } };
    for (const sp of m.speeches.filter((x) => x.segmentId === s.id)) vb.addRow([name(sp.delegateId).toUpperCase(), sp.offline ? 'NOTED OFFLINE' : sp.notes, sp.score ?? '']);
    for (const p of m.pois.filter((x) => x.segmentId === s.id && x.notes)) vb.addRow([`${name(p.by).toUpperCase()} (POI)`, p.notes, p.score ?? '']);
  }
  vb.getColumn(1).width = 24; vb.getColumn(2).width = 120; vb.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  // RECOGNITION SHEET: motions by proposer, then who was recognised in each segment and its POIs.
  const rs = wb.addWorksheet('RECOGNITION SHEET');
  const rcols = ['PORTFOLIO', 'MOTIONS']; const lists: string[][] = [rec.motions.map((x) => x.proposer.toUpperCase()), rec.motions.map((x) => `${x.text} (${x.status})`)];
  for (const s of rec.segments) { rcols.push(s.label.toUpperCase()); lists.push(s.speakers.map((x) => x.toUpperCase())); if (s.pois.length) { rcols.push(`${s.label.toUpperCase()} - POI`); lists.push(s.pois.map((x) => x.toUpperCase())); } }
  rs.addRow(rcols); head(rs);
  const depth = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < depth; i++) rs.addRow(lists.map((l) => l[i] ?? ''));
  rs.columns.forEach((c, i) => { c.width = i === 1 ? 60 : 18; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
