import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Award, Calculator, CheckSquare, ClipboardList, Dice5, FileSearch, FileText, Gavel, Hash, ListOrdered, Pause, Play, Plus, Printer, RotateCcw, ScrollText, Search, Timer, Trash2, Users, X, ArrowUp, ArrowDown, Check, BookA,
} from 'lucide-react';
import { Flag } from '../platform/art';
import { ACRONYMS, MEMBERS, MOTIONS, BLOCS, memberByCode } from '../data/mun';
import { decodeSymbol, formatResolution, parseResolution } from '../data/resolution';
import { Copy, PrepShell } from './common';

const TOOLS = [
  { key: 'timer', icon: Timer, t: 'Speech timer', d: 'GSL, opening and caucus presets, audio cues and a notes pad.' },
  { key: 'speakers', icon: ListOrdered, t: 'Speakers list', d: 'Queue delegates, time them, mark who has spoken, reorder.' },
  { key: 'voting', icon: Calculator, t: 'Voting tally', d: 'Yes, no and abstain with simple, two-thirds and Security Council rules.' },
  { key: 'quorum', icon: Users, t: 'Quorum calculator', d: 'Quorum to debate and to vote, majority and two-thirds thresholds.' },
  { key: 'motions', icon: Gavel, t: 'Motions reference', d: 'Every point and motion with wording, vote and US vs THIMUN notes.' },
  { key: 'formatter', icon: ScrollText, t: 'Resolution formatter', d: 'Orders, numbers, letters and punctuates clauses in UN style.' },
  { key: 'decoder', icon: FileSearch, t: 'Resolution decoder', d: 'Explains symbols like S/RES/2231 (2015) or A/RES/77/1.' },
  { key: 'acronyms', icon: BookA, t: 'Acronym decoder', d: `${ACRONYMS.length} UN, treaty and MUN acronyms with categories.` },
  { key: 'placards', icon: Printer, t: 'Placard generator', d: 'Printable country placards, landscape or portrait.' },
  { key: 'allocation', icon: Dice5, t: 'Delegation allocation', d: 'Randomly assign delegates to countries.' },
  { key: 'packing', icon: CheckSquare, t: 'Packing checklist', d: 'What to bring, saved on this device.' },
  { key: 'wordcount', icon: FileText, t: 'Position paper counter', d: 'Words, pages, speaking time, limit, missing sections.', to: '/prep/coach' },
  { key: 'amendments', icon: ClipboardList, t: 'Amendment tracker', d: 'Friendly and unfriendly amendments and their status, in a live session.', to: '/session' },
  { key: 'awards', icon: Award, t: 'Award tracker (EB marking)', d: 'Mark speeches, POIs and chits; marksheet, ranks and awards.', to: '/session' },
];

export function ToolsHome() {
  return (
    <PrepShell title="MUN tools" subtitle="Free committee-day utilities. No account needed; nothing you type leaves this device.">
      <section className="pp-grid">{TOOLS.map((x) => <Link key={x.key} to={x.to ?? `/prep/tools/${x.key}`} className="pp-card"><span className="pp-ic"><x.icon className="icon" /></span><b>{x.t}</b><p>{x.d}</p></Link>)}</section>
    </PrepShell>
  );
}

export function ToolPage() {
  const { tool = '' } = useParams();
  const meta = TOOLS.find((x) => x.key === tool);
  const C = ({ timer: SpeechTimer, speakers: Speakers, voting: Voting, quorum: Quorum, motions: Motions, formatter: Formatter, decoder: Decoder, acronyms: Acronyms, placards: Placards, allocation: Allocation, packing: Packing } as Record<string, () => any>)[tool];
  return (
    <PrepShell title={meta?.t ?? 'Tool'} subtitle={meta?.d} actions={<Link className="pf-btn ghost sm" to="/prep/tools">All tools</Link>}>
      {C ? <C /> : <div className="pf-empty">Tool not found.</div>}
    </PrepShell>
  );
}

const store = { get: <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const fmt = (s: number) => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
function beep(freq = 880, ms = 180) {
  try { const a = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = freq; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.15, a.currentTime); o.start(); o.stop(a.currentTime + ms / 1000); } catch { /* no audio */ }
}

/** A countdown that keeps time from a start timestamp (not from interval ticks), so it never drifts. */
function useCountdown(initial: number) {
  const [total, setTotal] = useState(initial); const [left, setLeft] = useState(initial); const [runAt, setRunAt] = useState<number | null>(null); const base = useRef(initial);
  const [, tick] = useState(0);
  useEffect(() => { if (runAt === null) return; const t = setInterval(() => tick((x) => x + 1), 200); return () => clearInterval(t); }, [runAt]);
  const now = runAt === null ? left : base.current - Math.floor((Date.now() - runAt) / 1000);
  return {
    total, left: now, running: runAt !== null,
    start: () => { base.current = now; setRunAt(Date.now()); }, pause: () => { setLeft(now); setRunAt(null); },
    reset: (s = total) => { setTotal(s); setLeft(s); base.current = s; setRunAt(null); },
  };
}

function SpeechTimer() {
  const PRESETS: [string, number][] = [['GSL', 90], ['Opening', 60], ['Mod 30s', 30], ['Mod 45s', 45], ['Mod 60s', 60], ['Right of reply', 30], ['Closing', 60]];
  const c = useCountdown(90);
  const [notes, setNotes] = useState(() => store.get('dd-timer-notes', ''));
  const [custom, setCustom] = useState('');
  const warned = useRef({ w: false, e: false });
  useEffect(() => {
    if (!c.running) return;
    if (c.left === 10 && !warned.current.w) { warned.current.w = true; beep(660); }
    if (c.left <= 0 && !warned.current.e) { warned.current.e = true; beep(440, 500); }
  }, [c.left, c.running]);
  const pct = Math.max(0, Math.min(100, (c.left / c.total) * 100));
  return (
    <div className="pp-two">
      <section className="pf-card pad pf-center">
        <div className="pp-chips" style={{ justifyContent: 'center' }}>{PRESETS.map(([l, s]) => <button key={l} className={`pf-pill ${c.total === s && !c.running ? '' : ''}`} onClick={() => { warned.current = { w: false, e: false }; c.reset(s); }}>{l} · {s}s</button>)}</div>
        <div className={`lv-timer pp-bigtime ${c.left <= 10 ? 'low' : ''}`} aria-live="polite">{fmt(c.left)}</div>
        <div className="pf-bar" style={{ height: 8 }}><i style={{ width: `${pct}%` }} /></div>
        <div className="mk-row" style={{ justifyContent: 'center', marginTop: 16 }}>
          {c.running ? <button className="pf-btn primary" onClick={c.pause}><Pause className="icon" />Pause</button> : <button className="pf-btn primary" onClick={() => { if (c.left <= 0) c.reset(); c.start(); }}><Play className="icon" />Start</button>}
          <button className="pf-btn ghost" onClick={() => { warned.current = { w: false, e: false }; c.reset(); }}><RotateCcw className="icon" />Reset</button>
          <form onSubmit={(e) => { e.preventDefault(); const s = Math.round(Number(custom)); if (s > 0) { warned.current = { w: false, e: false }; c.reset(s); setCustom(''); } }}><input className="mk-score" style={{ width: 90 }} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="seconds" aria-label="Custom seconds" /></form>
        </div>
        <p className="pf-small pf-muted">A beep at 10 seconds and at time. Runs over in red.</p>
      </section>
      <section className="pf-card pad"><b>Notes</b><textarea className="mk-notes" rows={14} value={notes} onChange={(e) => { setNotes(e.target.value); store.set('dd-timer-notes', e.target.value); }} placeholder="Talking points for this speech" /><div className="pf-small pf-muted">{(notes.match(/\S+/g) ?? []).length} words · about {Math.round(((notes.match(/\S+/g) ?? []).length / 130) * 60)} seconds at 130 words a minute</div></section>
    </div>
  );
}

function Speakers() {
  const [list, setList] = useState<{ name: string; done: boolean; secs?: number }[]>(() => store.get('dd-speakers', []));
  const [name, setName] = useState('');
  const [secs, setSecs] = useState(60);
  const [cur, setCur] = useState<number | null>(null);
  const c = useCountdown(secs);
  const save = (l: typeof list) => { setList(l); store.set('dd-speakers', l); };
  const next = () => { const i = list.findIndex((x) => !x.done); if (cur !== null) save(list.map((x, j) => (j === cur ? { ...x, done: true, secs: secs - c.left } : x))); const n = list.findIndex((x, j) => !x.done && j !== cur); setCur(n >= 0 ? n : i >= 0 && i !== cur ? i : null); c.reset(secs); if (n >= 0) setTimeout(c.start, 0); };
  return (
    <div className="pp-two">
      <section className="pf-card pad">
        <form className="mk-row" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { save([...list, { name: name.trim(), done: false }]); setName(''); } }}><input className="pf-input mk-select" list="pp-members" value={name} onChange={(e) => setName(e.target.value)} placeholder="Delegation" /><button className="pf-btn primary sm"><Plus className="icon" />Add</button></form>
        <datalist id="pp-members">{MEMBERS.map((m) => <option key={m.code} value={m.name} />)}</datalist>
        {list.map((x, i) => <div key={i} className={`lv-del ${cur === i ? 'pp-now' : ''}`}><b style={{ width: 22 }}>{i + 1}</b><span className="name" style={{ textDecoration: x.done ? 'line-through' : 'none', opacity: x.done ? 0.6 : 1 }}>{x.name}{x.secs ? <span className="pf-faint"> · {x.secs}s</span> : null}</span>
          <button className="pf-btn link" aria-label="Up" onClick={() => i > 0 && save(list.map((y, j) => (j === i - 1 ? list[i] : j === i ? list[i - 1] : y)))}><ArrowUp className="icon" /></button>
          <button className="pf-btn link" aria-label="Down" onClick={() => i < list.length - 1 && save(list.map((y, j) => (j === i + 1 ? list[i] : j === i ? list[i + 1] : y)))}><ArrowDown className="icon" /></button>
          <button className="pf-btn link" aria-label="Mark spoken" onClick={() => save(list.map((y, j) => (j === i ? { ...y, done: !y.done } : y)))}><Check className="icon" /></button>
          <button className="pf-btn link" aria-label="Remove" onClick={() => save(list.filter((_, j) => j !== i))}><X className="icon" /></button></div>)}
        {list.length > 0 && <button className="pf-btn link" onClick={() => { save([]); setCur(null); }}><Trash2 className="icon" />Clear list</button>}
      </section>
      <section className="pf-card pad pf-center">
        <div className="pf-muted">{cur !== null ? <>Speaking: <b style={{ color: 'var(--pf-ink)' }}>{list[cur]?.name}</b></> : 'No one has the floor'}</div>
        <div className={`lv-timer ${c.left <= 10 ? 'low' : ''}`}>{fmt(c.left)}</div>
        <div className="mk-row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="pf-btn primary sm" onClick={next}>Next speaker</button>
          {c.running ? <button className="pf-btn ghost sm" onClick={c.pause}><Pause className="icon" />Pause</button> : <button className="pf-btn ghost sm" onClick={c.start} disabled={cur === null}><Play className="icon" />Resume</button>}
          <label className="pf-small">Speaking time <input className="mk-score" type="number" value={secs} onChange={(e) => { setSecs(Number(e.target.value) || 60); c.reset(Number(e.target.value) || 60); }} /> s</label>
        </div>
        <p className="pf-small pf-muted">Running a full committee? <Link to="/session">Start a live session</Link> with roll call, motions, voting and EB marking.</p>
      </section>
    </div>
  );
}

function Voting() {
  const [v, setV] = useState({ yes: 0, no: 0, abstain: 0, members: 15, rule: 'simple', p5no: 0 });
  const n = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) });
  const cast = v.yes + v.no;
  let pass = false; let why = '';
  if (v.rule === 'simple') { const need = Math.floor(cast / 2) + 1; pass = v.yes > v.no; why = `More yes than no: ${v.yes} vs ${v.no}. Needed ${need} of ${cast} votes cast (abstentions don’t count).`; }
  if (v.rule === 'two') { const need = Math.ceil((cast * 2) / 3); pass = cast > 0 && v.yes * 3 >= cast * 2; why = `Two-thirds of votes cast: needed ${need} of ${cast}, got ${v.yes}.`; }
  if (v.rule === 'sc') { const need = Math.ceil((v.members * 9) / 15); pass = v.yes >= need && v.p5no === 0; why = `${need} affirmative votes of ${v.members}${v.p5no ? `; vetoed by ${v.p5no} permanent member${v.p5no > 1 ? 's' : ''}` : ' and no P5 vote against'}. A P5 abstention is not a veto.`; }
  if (v.rule === 'scp') { const need = Math.ceil((v.members * 9) / 15); pass = v.yes >= need; why = `Procedural: ${need} affirmative votes; no veto applies.`; }
  return (
    <section className="pf-card pad" style={{ maxWidth: 760 }}>
      <div className="pp-tabs" style={{ marginTop: 0 }}>{[['simple', 'Simple majority'], ['two', 'Two-thirds'], ['sc', 'Security Council (substantive)'], ['scp', 'Security Council (procedural)']].map(([k, l]) => <button key={k} className={v.rule === k ? 'on' : ''} onClick={() => setV({ ...v, rule: k })}>{l}</button>)}</div>
      <div className="pp-calc">
        <label>Yes<input className="pf-input" type="number" value={v.yes} onChange={n('yes')} /></label><label>No<input className="pf-input" type="number" value={v.no} onChange={n('no')} /></label><label>Abstain<input className="pf-input" type="number" value={v.abstain} onChange={n('abstain')} /></label>
        {(v.rule === 'sc' || v.rule === 'scp') && <label>Members<input className="pf-input" type="number" value={v.members} onChange={n('members')} /></label>}
        {v.rule === 'sc' && <label>P5 voting no<input className="pf-input" type="number" max={5} value={v.p5no} onChange={n('p5no')} /></label>}
      </div>
      <div className={`lv-result ${pass ? 'pass' : 'fail'}`} style={{ marginTop: 16 }}>{pass ? 'Passes' : 'Fails'}<div className="pf-small" style={{ fontWeight: 500 }}>{why}</div></div>
      <p className="pf-small pf-muted">Check your conference’s rules of procedure: some count abstentions or use present-and-voting rules differently.</p>
    </section>
  );
}

function Quorum() {
  const [size, setSize] = useState(30); const [present, setPresent] = useState(20); const [pv, setPv] = useState(0);
  const debate = Math.ceil(size / 3); const vote = Math.floor(size / 2) + 1;
  return (
    <section className="pf-card pad" style={{ maxWidth: 760 }}>
      <div className="pp-calc"><label>Committee size<input className="pf-input" type="number" value={size} onChange={(e) => setSize(Math.max(1, Number(e.target.value) || 1))} /></label><label>Present at roll call<input className="pf-input" type="number" value={present} onChange={(e) => setPresent(Math.max(0, Number(e.target.value) || 0))} /></label><label>Of whom present and voting<input className="pf-input" type="number" value={pv} onChange={(e) => setPv(Math.max(0, Number(e.target.value) || 0))} /></label></div>
      <div className="pp-stats" style={{ marginTop: 16 }}>
        <div className={present >= debate ? 'ok' : 'no'}><b>{debate}</b><span>to debate (one third) · {present >= debate ? 'met' : 'not met'}</span></div>
        <div className={present >= vote ? 'ok' : 'no'}><b>{vote}</b><span>to vote on substance (majority) · {present >= vote ? 'met' : 'not met'}</span></div>
        <div><b>{Math.floor(present / 2) + 1}</b><span>simple majority if all present vote</span></div>
        <div><b>{Math.ceil((present * 2) / 3)}</b><span>two-thirds if all present vote</span></div>
      </div>
      {pv > 0 && <p className="pf-small pf-muted">{pv} delegation{pv > 1 ? 's' : ''} cannot abstain on substantive votes.</p>}
      <p className="pf-small pf-muted">Arithmetic: debate = ⌈{size} ÷ 3⌉ = {debate}; vote = ⌊{size} ÷ 2⌋ + 1 = {vote}. Rules differ between conferences.</p>
    </section>
  );
}

function Motions() {
  const [q, setQ] = useState(''); const [style, setStyle] = useState<'us' | 'thimun'>('us');
  const list = MOTIONS.filter((m) => !q || `${m.name} ${m.wording}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.precedence - b.precedence);
  return (
    <section>
      <div className="mk-row"><div className="pf-search" style={{ flex: 1, maxWidth: 420 }}><Search className="icon" /><input className="pf-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search points and motions" aria-label="Search motions" /></div>
        <div className="pf-seg"><button className={style === 'us' ? 'on' : ''} onClick={() => setStyle('us')}>US style</button><button className={style === 'thimun' ? 'on' : ''} onClick={() => setStyle('thimun')}>THIMUN style</button></div></div>
      <div className="pp-motions">{list.map((m) => <div key={m.name} className="pf-card pad"><div className="mk-row"><b style={{ flex: 1 }}>{m.name}</b><span className="pf-tag">{m.kind}</span>{m.interrupt && <span className="pf-tag amber">can interrupt</span>}</div>
        <div className="pf-small" style={{ fontStyle: 'italic' }}>{m.wording}</div>
        <div className="pf-small" style={{ marginTop: 6 }}><b>Vote:</b> {m.vote}</div>
        <div className="pf-small pf-muted" style={{ marginTop: 4 }}>{style === 'us' ? m.us : m.thimun}</div></div>)}</div>
      <p className="pf-small pf-muted">Listed in a typical order of precedence. Your conference’s rules of procedure always win.</p>
    </section>
  );
}

function Formatter() {
  const [t, setT] = useState(() => store.get('dd-reso', 'Security Council,\n\nurges all parties to return to dialogue\nRecalling its resolution 2231 (2015)\nDeeply concerned by attacks on commercial shipping\nCalls upon member states to:\na. share maritime information\nb. support IAEA verification\nDecides to remain seized of the matter'));
  const r = useMemo(() => formatResolution(t), [t]);
  const parsed = useMemo(() => parseResolution(t), [t]);
  return (
    <div className="pp-two">
      <section className="pf-card pad"><b>Paste your clauses</b><textarea className="mk-notes" rows={18} value={t} onChange={(e) => { setT(e.target.value); store.set('dd-reso', e.target.value); }} /><div className="pf-small pf-muted">Any order, any numbering. Sub-clauses start with a), b) or a dash.</div></section>
      <section className="pf-card pad">
        <div className="mk-row"><b style={{ flex: 1 }}>Formatted</b><Copy text={r.text} label="Copy text" /><button className="pf-btn ghost sm" onClick={() => window.print()}><Printer className="icon" />Print</button></div>
        {r.warnings.map((w) => <div key={w} className="pf-note" style={{ marginBottom: 8 }}><span>{w}</span></div>)}
        <div className="pp-reso">
          {parsed.header.map((h, i) => <p key={i}><b>{h}</b></p>)}
          {parsed.pre.map((c, i) => <p key={`p${i}`}><em>{c.phrase}</em> {c.rest},</p>)}
          <ol>{parsed.op.map((c, i) => <li key={`o${i}`}><u>{c.phrase}</u> {c.rest}{c.subs.length ? ':' : i === parsed.op.length - 1 ? '.' : ';'}{c.subs.length > 0 && <ol type="a">{c.subs.map((s, j) => <li key={j}>{s}{j === c.subs.length - 1 ? (i === parsed.op.length - 1 ? '.' : ';') : ';'}</li>)}</ol>}</li>)}</ol>
        </div>
      </section>
    </div>
  );
}

function Decoder() {
  const [s, setS] = useState('S/RES/2231 (2015)');
  const d = decodeSymbol(s);
  return (
    <section className="pf-card pad" style={{ maxWidth: 760 }}>
      <input className="pf-input" value={s} onChange={(e) => setS(e.target.value)} placeholder="e.g. A/RES/77/1" aria-label="Document symbol" />
      <div className="pp-chips" style={{ marginTop: 8 }}>{['S/RES/2231 (2015)', 'A/RES/ES-11/1', 'A/RES/77/1', 'A/HRC/RES/52/1', 'E/RES/2020/12', 'S/PRST/2023/1', 'A/C.1/78/L.11'].map((x) => <button key={x} className="pf-pill" onClick={() => setS(x)}>{x}</button>)}</div>
      {d.ok ? <dl className="pp-dl" style={{ marginTop: 16 }}><dt>Body</dt><dd>{d.body}</dd><dt>Type</dt><dd>{d.kind}</dd><dt>Number</dt><dd>{d.number}</dd>{d.session && <><dt>Session</dt><dd>{d.session}</dd></>}{d.year && <><dt>Year</dt><dd>{d.year}</dd></>}<dt>What it means</dt><dd>{d.note}</dd>
        <dt>Read it</dt><dd><a href={d.link!} target="_blank" rel="noopener noreferrer">{d.link}</a></dd></dl> : <p className="pf-muted" style={{ marginTop: 16 }}>{d.note}</p>}
    </section>
  );
}

function Acronyms() {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const cats = [...new Set(ACRONYMS.map((a) => a[2]))];
  const list = ACRONYMS.filter(([a, m, c]) => (!cat || c === cat) && (!q || `${a} ${m}`.toLowerCase().includes(q.toLowerCase()))).sort((x, y) => x[0].localeCompare(y[0]));
  const letters = [...new Set(list.map((a) => a[0][0].toUpperCase()))];
  return (
    <section>
      <div className="mk-row"><div className="pf-search" style={{ flex: 1, maxWidth: 420 }}><Search className="icon" /><input className="pf-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search acronyms" aria-label="Search acronyms" /></div>
        <select className="pf-input mk-select" style={{ maxWidth: 220 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select><span className="pf-small pf-muted">{list.length} of {ACRONYMS.length}</span></div>
      <div className="pp-az">{letters.map((l) => <a key={l} href={`#az-${l}`}>{l}</a>)}</div>
      <div className="pf-card" style={{ overflow: 'hidden' }}>{letters.map((l) => <div key={l} id={`az-${l}`}><div className="pp-az-h">{l}</div>{list.filter((a) => a[0][0].toUpperCase() === l).map(([a, m, c]) => <div key={a} className="pp-acr"><b>{a}</b><span>{m}</span><span className="pf-tag">{c}</span></div>)}</div>)}</div>
    </section>
  );
}

function Placards() {
  const [picked, setPicked] = useState<string[]>(() => store.get('dd-placards', ['in', 'fr', 'us']));
  const [orient, setOrient] = useState<'landscape' | 'portrait'>('landscape');
  const [committee, setCommittee] = useState('');
  const set = (p: string[]) => { setPicked(p); store.set('dd-placards', p); };
  return (
    <section>
      <div className="mk-row no-print"><select className="pf-input mk-select" style={{ maxWidth: 280 }} value="" onChange={(e) => e.target.value && set([...new Set([...picked, e.target.value])])} aria-label="Add country"><option value="">Add a country…</option>{MEMBERS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
        <select className="pf-input mk-select" style={{ maxWidth: 220 }} value="" onChange={(e) => e.target.value && set([...new Set([...picked, ...BLOCS[e.target.value].codes])])} aria-label="Add a bloc"><option value="">Add a whole bloc…</option>{Object.entries(BLOCS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select>
        <input className="pf-input mk-select" style={{ maxWidth: 220 }} value={committee} onChange={(e) => setCommittee(e.target.value)} placeholder="Committee (optional)" />
        <div className="pf-seg"><button className={orient === 'landscape' ? 'on' : ''} onClick={() => setOrient('landscape')}>Landscape</button><button className={orient === 'portrait' ? 'on' : ''} onClick={() => setOrient('portrait')}>Portrait</button></div>
        <button className="pf-btn primary sm" onClick={() => window.print()}><Printer className="icon" />Print {picked.length}</button><button className="pf-btn link" onClick={() => set([])}>Clear</button></div>
      <style>{`@media print { @page { size: A4 ${orient}; margin: 0; } }`}</style>
      <div className={`pp-placards ${orient}`}>{picked.map((c) => <div key={c} className="pp-placard"><button className="pf-btn link no-print" onClick={() => set(picked.filter((x) => x !== c))} aria-label="Remove"><X className="icon" /></button><span className={`fi fi-${c}`} /><b>{memberByCode(c)?.name ?? c}</b>{committee && <span>{committee}</span>}</div>)}</div>
    </section>
  );
}

function Allocation() {
  const [people, setPeople] = useState('');
  const [countries, setCountries] = useState<string[]>(['us', 'cn', 'ru', 'gb', 'fr', 'in', 'br', 'za', 'jp', 'de']);
  const [out, setOut] = useState<[string, string][]>([]);
  const names = people.split('\n').map((x) => x.trim()).filter(Boolean);
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  return (
    <div className="pp-two">
      <section className="pf-card pad"><b>Delegates (one per line)</b><textarea className="mk-notes" rows={12} value={people} onChange={(e) => setPeople(e.target.value)} placeholder={'Aisha\nBilal\nChen'} />
        <b>Countries ({countries.length})</b>
        <div className="mk-row" style={{ marginTop: 6 }}><select className="pf-input mk-select" value="" onChange={(e) => e.target.value && setCountries([...new Set([...countries, e.target.value])])} aria-label="Add country"><option value="">Add a country…</option>{MEMBERS.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
          <select className="pf-input mk-select" value="" onChange={(e) => e.target.value && setCountries([...new Set([...countries, ...BLOCS[e.target.value].codes])])} aria-label="Add bloc"><option value="">Add a bloc…</option>{Object.entries(BLOCS).map(([k, b]) => <option key={k} value={k}>{b.label}</option>)}</select></div>
        <div className="pp-chips">{countries.map((c) => <span key={c} className="pf-chip"><Flag code={c} />{memberByCode(c)?.name}<button className="pf-btn link" style={{ padding: 0, minHeight: 0 }} onClick={() => setCountries(countries.filter((x) => x !== c))} aria-label="Remove"><X className="icon" style={{ width: 12 }} /></button></span>)}</div>
        <button className="pf-btn primary sm" style={{ marginTop: 12 }} disabled={!names.length || !countries.length} onClick={() => { const cs = shuffle(countries); setOut(shuffle(names).map((n, i) => [n, cs[i] ?? ''])); }}><Dice5 className="icon" />Allocate at random</button>
        {names.length > countries.length && <div className="pf-small pf-muted">{names.length - countries.length} delegate(s) will have no country. Add more countries.</div>}
      </section>
      <section className="pf-card pad"><div className="mk-row"><b style={{ flex: 1 }}>Allocation</b>{out.length > 0 && <Copy text={out.map(([n, c]) => `${n}\t${memberByCode(c)?.name ?? '—'}`).join('\n')} />}</div>
        {!out.length ? <div className="pf-small pf-muted">Results appear here. Random and fair: every order is equally likely.</div> : out.map(([n, c]) => <div key={n} className="mk-line"><span style={{ flex: 1 }}>{n}</span>{c ? <><Flag code={c} /><b>{memberByCode(c)?.name}</b></> : <span className="pf-faint">no country</span>}</div>)}
        <p className="pf-small pf-muted" style={{ marginTop: 12 }}>Running a conference? DelegateDesk allots seats by preference and payment automatically. <Link to="/list">List your conference</Link>.</p>
      </section>
    </div>
  );
}

const PACK: Record<string, string[]> = {
  Documents: ['Delegate ID or registration email', 'Photo ID', 'Position paper (printed and on your phone)', 'Country research notes', 'Rules of procedure'],
  Stationery: ['Pens (blue and black)', 'Highlighters', 'Sticky notes for chits', 'Notepad', 'Placard holder (if allowed)'],
  Technology: ['Laptop and charger', 'Phone charger and power bank', 'Extension cord', 'Offline copy of your research'],
  'Dress and personal': ['Western business attire / formal Indian wear', 'Comfortable shoes', 'Water bottle', 'Snacks', 'Medicines'],
};
function Packing() {
  const [done, setDone] = useState<Record<string, boolean>>(() => store.get('dd-pack', {}));
  const [extra, setExtra] = useState<string[]>(() => store.get('dd-pack-extra', []));
  const [add, setAdd] = useState('');
  const all = [...Object.values(PACK).flat(), ...extra];
  const toggle = (k: string) => { const d = { ...done, [k]: !done[k] }; setDone(d); store.set('dd-pack', d); };
  return (
    <section style={{ maxWidth: 860 }}>
      <div className="mk-row"><b style={{ flex: 1 }}>{all.filter((x) => done[x]).length} of {all.length} packed</b><button className="pf-btn link" onClick={() => { setDone({}); store.set('dd-pack', {}); }}>Reset</button></div>
      <div className="pf-bar" style={{ height: 8, marginBottom: 16 }}><i style={{ width: `${(all.filter((x) => done[x]).length / all.length) * 100}%` }} /></div>
      <div className="pp-pack">{[...Object.entries(PACK), ['Your items', extra] as [string, string[]]].map(([g, items]) => <div key={g} className="pf-card pad"><b>{g}</b>{items.map((x) => <label key={x} className="pf-check pf-small" style={{ marginTop: 8 }}><input type="checkbox" checked={!!done[x]} onChange={() => toggle(x)} />{x}</label>)}
        {g === 'Your items' && <form className="mk-row" style={{ marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); if (add.trim()) { const n = [...extra, add.trim()]; setExtra(n); store.set('dd-pack-extra', n); setAdd(''); } }}><input className="pf-input mk-select" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add an item" /><button className="pf-btn ghost sm"><Plus className="icon" /></button></form>}</div>)}</div>
      <p className="pf-small pf-muted"><Hash className="icon" style={{ width: 12, verticalAlign: -1 }} /> Saved on this device only.</p>
    </section>
  );
}
