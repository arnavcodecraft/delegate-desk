import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, FileText, Sparkles, Timer, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { usePerson } from '../platform/Shell';
import { checkPaper } from '../data/resolution';
import { AiBadge, Busy, Copy, ErrorNote, Markdown, PrepShell, Sources, refreshPrep, usePrepMeta } from './common';

const KINDS: [string, string][] = [['paper', 'Position paper'], ['speech', 'Speech'], ['memo', 'Briefing memo'], ['amendment', 'Amendments'], ['poi', 'Points of information']];
const CHAIR_CHECKLIST = [
  'States the country’s real, current policy (not your own view)', 'Cites UN resolutions or treaties by symbol and year', 'Every statistic has a source and a year',
  'Solutions say who acts, how it is paid for and how success is measured', 'Matches the committee’s powers (recommend vs decide)', 'Within the word or page limit', 'Formal, diplomatic tone; no first-person singular',
];

function useProjects() {
  const me = usePerson();
  const [ps, setPs] = useState<any[]>([]);
  useEffect(() => { if (me?.person) api.get<any>('/api/prep/projects').then((d) => setPs(d.projects)).catch(() => {}); }, [me?.person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return ps;
}

export function WritePage() {
  const [sp] = useSearchParams();
  const meta = usePrepMeta();
  const me = usePerson();
  const projects = useProjects();
  const [kind, setKind] = useState(sp.get('kind') ?? 'paper');
  const [f, setF] = useState({ projectId: sp.get('project') ?? '', country: '', committee: '', topic: '', words: '900', type: 'gsl', seconds: '90', notes: '' });
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const proj = projects.find((p) => p.id === f.projectId);
  useEffect(() => { if (proj) setF((x) => ({ ...x, country: x.country || proj.country || '', committee: x.committee || proj.committee || '', topic: x.topic || proj.topic || '' })); }, [proj?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = meta?.speechTypes.find((t) => t.key === f.type);
  const wpm = meta?.wpm ?? 130;
  const words = kind === 'speech' ? Math.round((Number(f.seconds) / 60) * wpm) : Number(f.words) || 0;
  const plan: [string, number][] = kind === 'paper' ? (meta?.paperSections ?? []) : kind === 'speech' ? (st?.sections ?? []) : [];
  return (
    <PrepShell title="Write" subtitle="Start from an outline with word budgets, then ask for a sourced draft to adapt in your own words." actions={<AiBadge meta={meta} />}>
      <div className="pp-tabs">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { setKind(k); setOut(null); }}>{l}</button>)}</div>
      <div className="pp-two">
        <section className="pf-card pad">
          {me?.person && projects.length > 0 && <label className="pf-field"><span className="pf-label">Project <span className="opt">optional</span></span><select className="pf-input" value={f.projectId} onChange={(e) => setF({ ...f, projectId: e.target.value })}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><span className="pf-hint" style={{ display: 'block' }}>Drafts are saved to the project and use its research memory.</span></label>}
          <div className="pf-row2">
            <label className="pf-field"><span className="pf-label">Delegation</span><input className="pf-input" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="e.g. India" /></label>
            <label className="pf-field"><span className="pf-label">Committee</span><input className="pf-input" value={f.committee} onChange={(e) => setF({ ...f, committee: e.target.value })} placeholder="e.g. DISEC" /></label>
          </div>
          <label className="pf-field"><span className="pf-label">Topic</span><input className="pf-input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Maritime security in the Indian Ocean" /></label>
          {kind === 'paper' && <label className="pf-field"><span className="pf-label">Word limit</span><input className="pf-input" type="number" min={200} max={2500} value={f.words} onChange={(e) => setF({ ...f, words: e.target.value })} /></label>}
          {kind === 'speech' && <div className="pf-row2">
            <label className="pf-field"><span className="pf-label">Speech</span><select className="pf-input" value={f.type} onChange={(e) => { const t = meta?.speechTypes.find((x) => x.key === e.target.value); setF({ ...f, type: e.target.value, seconds: String(t?.seconds ?? 90) }); }}>{meta?.speechTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            <label className="pf-field"><span className="pf-label">Length (seconds)</span><input className="pf-input" type="number" min={20} max={300} value={f.seconds} onChange={(e) => setF({ ...f, seconds: e.target.value })} /></label>
          </div>}
          <label className="pf-field"><span className="pf-label">Your notes <span className="opt">optional</span></span><textarea className="pf-input" rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Points, facts or a stance you want included" /></label>
          <ErrorNote error={err} />
          {me?.person ? <button className="pf-btn primary ai" disabled={busy || !f.topic.trim()} onClick={async () => { setErr(null); setBusy(true); setOut(null); try { setOut(await api.post('/api/prep/draft', { kind, ...f, projectId: f.projectId || null })); refreshPrep(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}><Sparkles className="icon" />Write a sourced draft</button>
            : <p className="pf-small pf-muted"><Link to="/account?mode=signup&next=/prep/write">Create a free account</Link> to get AI drafts. The outline on the right works without one.</p>}
        </section>
        <section className="pf-card pad">
          {plan.length > 0 && <>
            <b>{kind === 'speech' ? `${st?.label ?? 'Speech'} · about ${words} words` : `Outline · ${words} words`}</b>
            <div className="pp-plan">{plan.map(([s, frac]) => <div key={s}><span>{s}</span><i style={{ width: `${frac * 100}%` }} /><em>~{Math.round(words * frac)} words{kind === 'speech' ? ` · ${Math.round(Number(f.seconds) * frac)}s` : ''}</em></div>)}</div>
          </>}
          {kind === 'paper' && <><b style={{ display: 'block', marginTop: 18 }}><ClipboardCheck className="icon pp-h-ic" /> The chair’s checklist</b><ul className="pf-ticks">{CHAIR_CHECKLIST.map((c) => <li key={c}><CheckCircle2 className="icon" />{c}</li>)}</ul></>}
          {kind === 'speech' && <p className="pf-small pf-muted" style={{ marginTop: 14 }}><Timer className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> Rehearse with the <Link to="/prep/tools/timer">speech timer</Link>. At {wpm} words a minute, cut rather than rush.</p>}
          {!plan.length && <p className="pf-muted">{kind === 'memo' ? 'A one-page memo: the situation, your interests and red lines, likely allies and opponents, and three recommended moves.' : kind === 'amendment' ? 'Amendments to a draft resolution: the clause, the exact add/strike/replace text, friendly or unfriendly, and why.' : 'Sharp questions to ask other delegations, grouped by target, each under 25 words.'}</p>}
        </section>
      </div>
      {busy && <Busy label="Researching and writing… this can take a minute." />}
      {out && <section className="pf-card pad" style={{ marginTop: 18 }}>
        <div className="mk-row"><b style={{ flex: 1 }}><FileText className="icon pp-h-ic" /> Draft</b><Copy text={out.text} />{out.id && <Link className="pf-btn ghost sm" to={`/prep/items/${out.id}`}>Open and edit</Link>}<Link className="pf-btn ghost sm" to="/prep/coach" state={{ text: out.text }}>Get feedback</Link></div>
        <div className="pf-note" style={{ margin: '8px 0 14px' }}><AlertTriangle className="icon" /><span>A starting point, not a submission: check each claim against its source and rewrite in your own words. Many conferences do not allow AI-written papers.</span></div>
        <Markdown text={out.text} /><Sources sources={out.sources} />
      </section>}
    </PrepShell>
  );
}

export function CoachPage() {
  const meta = usePrepMeta();
  const me = usePerson();
  const loc = useLocation();
  const [text, setText] = useState(() => ((loc.state as any)?.text as string) ?? '');
  const [limit, setLimit] = useState('');
  const [kind, setKind] = useState<'paper' | 'speech'>('paper');
  const [fb, setFb] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = useMemo(() => checkPaper(text, { limit: Number(limit) || undefined, wpm: meta?.wpm }), [text, limit, meta?.wpm]);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <PrepShell title="Coach" subtitle="Word count, pages, speaking time and missing sections as you type. Chair-style feedback when you are ready." actions={<AiBadge meta={meta} />}>
      <div className="pp-coach">
        <section className="pf-card pad">
          <div className="mk-row"><div className="pf-seg"><button className={kind === 'paper' ? 'on' : ''} onClick={() => setKind('paper')}>Position paper</button><button className={kind === 'speech' ? 'on' : ''} onClick={() => setKind('speech')}>Speech</button></div><span style={{ flex: 1 }} /><label className="pf-small">Word limit <input className="mk-score" style={{ width: 80 }} type="number" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="–" /></label></div>
          <textarea className="pf-input pp-editor" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or write your position paper or speech here. It stays on this page unless you ask for feedback." />
          <ErrorNote error={err} />
          {me?.person ? <button className="pf-btn primary ai" disabled={busy || c.words < 40} onClick={async () => { setErr(null); setBusy(true); try { setFb(await api.post('/api/prep/coach', { text, kind })); refreshPrep(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }}><Sparkles className="icon" />Get chair-style feedback</button>
            : <p className="pf-small pf-muted"><Link to="/account?mode=signup&next=/prep/coach">Create a free account</Link> for AI feedback. The checks on the right work without one.</p>}
          {busy && <Busy label="Reading it like a chair…" />}
        </section>
        <aside className="pp-side">
          <section className="pf-card pad pp-stats">
            <div><b>{c.words}</b><span>words{c.limit ? ` of ${c.limit}` : ''}</span></div>
            <div><b>{c.pages}</b><span>pages</span></div>
            <div><b>{mmss(c.seconds)}</b><span>to speak</span></div>
            <div><b>{c.citations}</b><span>citations</span></div>
          </section>
          {c.overLimit && <div className="pf-note" style={{ background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><AlertTriangle className="icon" /><span>{c.words - (c.limit ?? 0)} words over the limit.</span></div>}
          {kind === 'paper' && text.length > 80 && <section className="pf-card pad"><b>Sections</b>{['Background of the topic', 'Past international action', 'Country policy', 'Proposed solutions'].map((s) => <div key={s} className="mk-line">{c.missing.includes(s) ? <AlertTriangle className="icon" style={{ width: 16, color: 'var(--pf-amber)' }} /> : <CheckCircle2 className="icon" style={{ width: 16, color: 'var(--pf-green)' }} />}<span>{s}</span></div>)}{c.citations === 0 && <div className="pf-small pf-muted" style={{ marginTop: 8 }}>No citations found. Add [1]-style references, resolution symbols or links.</div>}</section>}
        </aside>
      </div>
      {fb && <section className="pf-card pad" style={{ marginTop: 18 }}>
        <div className="pp-score"><div className="pp-ring" style={{ ['--v' as any]: fb.overall }}><b>{fb.overall}</b><span>/100</span></div>
          <div className="pp-bars">{Object.entries(fb.scores ?? {}).map(([k, v]: any) => <div key={k}><span>{k}</span><i><b style={{ width: `${v * 10}%` }} /></i><em>{v}/10</em></div>)}</div></div>
        <div className="pp-two" style={{ marginTop: 16 }}>
          <div><b>What works</b><ul>{fb.strengths?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
          <div><b>Fix next</b><ul>{fb.fixes?.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>{fb.missing?.length > 0 && <><b>Missing</b><ul>{fb.missing.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></>}</div>
        </div>
        {fb.flagged?.length > 0 && <><b style={{ display: 'block', marginTop: 14 }}>Claims to check</b>{fb.flagged.map((x: any, i: number) => <div key={i} className="pp-flag"><blockquote>“{x.quote}”</blockquote><div className="pf-small"><b>{x.issue}</b></div><div className="pf-small pf-muted">Try: {x.suggestion}</div></div>)}</>}
      </section>}
    </PrepShell>
  );
}
