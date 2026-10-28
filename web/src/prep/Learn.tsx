import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Flame, RefreshCw, Save, Send, Sparkles, XCircle } from 'lucide-react';
import { api } from '../api';
import { usePerson } from '../platform/Shell';
import { ALL_LESSONS, COURSES, dailyChallenge, type Quiz } from '../data/learn';
import { AiBadge, Busy, ErrorNote, Markdown, NeedsAccount, PrepShell, Sources, refreshPrep, usePrepMeta } from './common';

// ---------- practice ----------
const SETUP: Record<string, { key: string; label: string; ph: string }[]> = {
  negotiation: [{ key: 'country', label: 'Your delegation', ph: 'India' }, { key: 'counterpart', label: 'AI delegation', ph: 'China' }, { key: 'committee', label: 'Committee', ph: 'DISEC' }, { key: 'topic', label: 'Topic', ph: 'Regional maritime security framework' }],
  counter: [{ key: 'country', label: 'Your delegation', ph: 'Brazil' }, { key: 'topic', label: 'Topic', ph: 'Climate finance for SIDS' }],
  leader: [{ key: 'figure', label: 'Who to interview', ph: 'Dag Hammarskjöld' }, { key: 'topic', label: 'Focus (optional)', ph: 'The Suez crisis and the first peacekeeping force' }],
  crisis: [{ key: 'portfolio', label: 'Your portfolio', ph: 'Minister of Defence, Republic of X' }, { key: 'topic', label: 'Crisis', ph: 'Blockade of a key shipping strait' }],
  speech: [{ key: 'country', label: 'Your delegation', ph: 'France' }, { key: 'topic', label: 'Topic', ph: 'Humanitarian access in Sudan' }],
};
const OPENER: Record<string, string> = { negotiation: 'Open with your proposal.', counter: 'State your argument.', leader: 'Ask your first question.', crisis: 'Type "begin" for the first crisis update.', speech: 'Paste your speech.' };

export function PracticePage() {
  const meta = usePrepMeta();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState('negotiation');
  const [setup, setSetup] = useState<Record<string, string>>({});
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs, busy]);
  const send = async (save = false) => {
    const next = text.trim() ? [...msgs, { role: 'user' as const, content: text.trim() }] : msgs;
    if (!next.length || next.at(-1)!.role !== 'user') return;
    setErr(null); setBusy(true); setMsgs(next); setText('');
    try { const r = await api.post<any>('/api/prep/practice', { mode, setup, messages: next, projectId: sp.get('project') || null, save }); setMsgs([...next, { role: 'assistant', content: r.reply }]); refreshPrep(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <PrepShell title="Practice" subtitle="Rehearse with a practice partner. These are simulations to find weak spots in your arguments, not predictions of what anyone would really do." actions={<AiBadge meta={meta} />}>
      <NeedsAccount what="practise">
        <div className="pp-tabs">{(meta?.practice ?? []).map((m) => <button key={m.key} className={mode === m.key ? 'on' : ''} onClick={() => { setMode(m.key); setMsgs([]); }}>{m.label}</button>)}</div>
        <div className="pp-proj">
          <section className="pf-card pad pp-chat">
            <div className="pp-msgs">
              {!msgs.length && <div className="pf-muted pf-small">{OPENER[mode]}</div>}
              {msgs.map((m, i) => <div key={i} className={`pp-msg ${m.role}`}>{m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}</div>)}
              {busy && <div className="pp-msg assistant"><Busy label="Thinking…" /></div>}
              <div ref={end} />
            </div>
            <ErrorNote error={err} />
            <form className="mk-row" onSubmit={(e) => { e.preventDefault(); send(); }} style={{ marginTop: 10 }}>
              <textarea className="pf-input" rows={mode === 'speech' ? 5 : 2} style={{ flex: 1, minHeight: 0 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={OPENER[mode]} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && mode !== 'speech') { e.preventDefault(); send(); } }} />
              <button className="pf-btn primary sm" disabled={busy || !text.trim()}><Send className="icon" />Send</button>
            </form>
            {msgs.length > 1 && <div className="mk-row"><button className="pf-btn ghost sm" onClick={() => { setText(mode === 'negotiation' ? 'feedback' : 'Give me feedback on how I did.'); }}>Ask for feedback</button><button className="pf-btn ghost sm" disabled={busy} onClick={async () => { setText('Thank you. Please summarise this session in three lines.'); }}><Save className="icon" />Wrap up</button><button className="pf-btn link" onClick={() => setMsgs([])}><RefreshCw className="icon" />Start again</button></div>}
          </section>
          <aside className="pp-side"><section className="pf-card pad"><b>Set up</b>{SETUP[mode].map((x) => <label key={x.key} className="pf-field" style={{ marginTop: 10, marginBottom: 0 }}><span className="pf-label" style={{ fontSize: 13.5 }}>{x.label}</span><input className="pf-input mk-select" value={setup[x.key] ?? ''} onChange={(e) => setSetup({ ...setup, [x.key]: e.target.value })} placeholder={x.ph} /></label>)}
            <button className="pf-btn ghost sm" style={{ marginTop: 12 }} disabled={msgs.length < 2 || busy} onClick={() => send(true)}><Save className="icon" />Save transcript{sp.get('project') ? ' to project' : ''}</button></section></aside>
        </div>
      </NeedsAccount>
    </PrepShell>
  );
}

// ---------- learn ----------
function QuizBlock({ quiz, onDone }: { quiz: Quiz[]; onDone: (score: number) => void }) {
  const [ans, setAns] = useState<(number | null)[]>(quiz.map(() => null));
  const done = ans.every((a) => a !== null);
  useEffect(() => { if (done) onDone(Math.round((ans.filter((a, i) => a === quiz[i].answer).length / quiz.length) * 100)); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="pp-quiz">{quiz.map((q, i) => (
    <div key={i} className="pp-q"><b>{q.q}</b>
      <div className="pp-opts">{q.options.map((o, j) => {
        const picked = ans[i] === j; const show = ans[i] !== null;
        return <button key={j} disabled={show} className={`${show && j === q.answer ? 'right' : ''} ${picked && j !== q.answer ? 'wrong' : ''}`} onClick={() => setAns(ans.map((a, k) => (k === i ? j : a)))}>{show && j === q.answer ? <CheckCircle2 className="icon" /> : picked ? <XCircle className="icon" /> : null}{o}</button>;
      })}</div>
      {ans[i] !== null && <div className="pf-small pf-muted">{q.why}</div>}
    </div>
  ))}</div>;
}

export function LearnHome() {
  const meta = usePrepMeta();
  const me = usePerson();
  const ch = dailyChallenge();
  const done = meta?.progress?.done ?? {};
  const dailyDone = `daily:${ch.day}` in done;
  return (
    <PrepShell title="Learn" subtitle="Short lessons with a quiz at the end of each. Do one a day to keep your streak." actions={meta?.progress ? <span className="pp-streak big"><Flame className="icon" />{meta.progress.streak} day streak</span> : undefined}>
      <section className="pf-card pad pp-daily" id="daily">
        <div className="pf-eyebrow">Daily challenge · {new Date(ch.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</div>
        {dailyDone ? <p className="pf-muted" style={{ marginBottom: 0 }}><CheckCircle2 className="icon" style={{ width: 16, verticalAlign: -3, color: 'var(--pf-green)' }} /> Done for today. Come back tomorrow.</p>
          : <QuizBlock quiz={[ch]} onDone={async (score) => { if (me?.person) { await api.post('/api/prep/learn', { item: `daily:${ch.day}`, score }); refreshPrep(); } }} />}
        {!me?.person && <p className="pf-small pf-muted">Sign in to keep your streak.</p>}
      </section>
      <section className="pp-courses">{COURSES.map((c) => {
        const n = c.lessons.filter((l) => l.id in done).length;
        return <div key={c.id} className="pf-card pad pp-course">
          <div className="mk-row"><span className="pp-ic sm"><BookOpen className="icon" /></span><span className="pf-tag">{c.level}</span><span style={{ flex: 1 }} />{n === c.lessons.length && <span className="pf-tag green">Complete</span>}</div>
          <b>{c.title}</b><p>{c.blurb}</p>
          <div className="pf-bar"><i style={{ width: `${(n / c.lessons.length) * 100}%` }} /></div>
          <div className="pp-lessons">{c.lessons.map((l) => <Link key={l.id} to={`/prep/learn/${l.id}`}>{l.id in done ? <CheckCircle2 className="icon" style={{ color: 'var(--pf-green)' }} /> : <span className="pp-dotn" />}{l.title}<span className="pf-faint">{l.minutes} min</span></Link>)}</div>
        </div>;
      })}</section>
    </PrepShell>
  );
}

export function LessonPage() {
  const { id = '' } = useParams();
  const me = usePerson();
  const l = ALL_LESSONS.find((x) => x.id === id);
  const [score, setScore] = useState<number | null>(null);
  if (!l) return <PrepShell><div className="pf-empty">Lesson not found. <Link to="/prep/learn">All courses</Link></div></PrepShell>;
  const course = COURSES.find((c) => c.id === l.course)!;
  const idx = course.lessons.findIndex((x) => x.id === id);
  const next = course.lessons[idx + 1] ?? COURSES[COURSES.indexOf(course) + 1]?.lessons[0];
  return (
    <PrepShell>
      <div className="pf-narrow" style={{ maxWidth: 760 }}>
        <Link to="/prep/learn" className="pf-btn link">← {course.title}</Link>
        <article className="pf-card pad pp-doc" style={{ marginTop: 8 }}>
          <div className="pf-eyebrow">Lesson {idx + 1} of {course.lessons.length} · {l.minutes} min</div>
          <h1 className="pf-h2" style={{ fontSize: 28, margin: '6px 0 14px' }}>{l.title}</h1>
          {l.body.map((b, i) => <Markdown key={i} text={b} />)}
          <h3 style={{ marginTop: 24 }}>Check yourself</h3>
          <QuizBlock key={id} quiz={l.quiz} onDone={async (s) => { setScore(s); if (me?.person) { await api.post('/api/prep/learn', { item: l.id, score: s }); refreshPrep(); } }} />
          {score !== null && <div className="pf-note green" style={{ marginTop: 14 }}><CheckCircle2 className="icon" /><span>{score}% correct.{me?.person ? ' Saved to your progress.' : ' Sign in to save your progress.'}</span></div>}
          {next && <div style={{ marginTop: 18 }}><Link className="pf-btn primary" to={`/prep/learn/${next.id}`}>Next: {next.title}</Link></div>}
        </article>
      </div>
    </PrepShell>
  );
}

// ---------- discover ----------
const TOPICS = ['Security Council', 'Climate', 'Human rights', 'Middle East', 'Africa', 'Indo-Pacific', 'Europe', 'Latin America', 'Trade and economy', 'Health', 'Disarmament', 'Migration'];
export function DiscoverPage() {
  const meta = usePrepMeta();
  const me = usePerson();
  const [topics, setTopics] = useState<string[]>(() => me?.person?.prefs?.topics ?? []);
  const [b, setB] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me?.person?.prefs?.topics) setTopics(me.person.prefs.topics); }, [me?.person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = async (refresh = false) => { setErr(null); setBusy(true); try { setB(await api.post('/api/prep/briefing', { topics, refresh })); refreshPrep(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <PrepShell title="Discover" subtitle="Today’s developments in international affairs, with the sources behind them and the committees they matter to." actions={<AiBadge meta={meta} />}>
      <section className="pf-card pad">
        <b>Topics you follow</b>
        <div className="pp-chips" style={{ marginTop: 10 }}>{TOPICS.map((t) => <button key={t} className={`pf-pill ${topics.includes(t) ? 'on' : ''}`} onClick={() => setTopics(topics.includes(t) ? topics.filter((x) => x !== t) : [...topics, t].slice(0, 5))}>{t}</button>)}</div>
        <div className="mk-row" style={{ marginTop: 12 }}>
          <button className="pf-btn primary sm" disabled={busy} onClick={async () => { if (me?.person) await api.patch('/api/me', { prefs: { topics } }).catch(() => {}); load(); }}><Sparkles className="icon" />{topics.length ? 'My briefing' : 'Today’s briefing'}</button>
          {b && <button className="pf-btn ghost sm" disabled={busy} onClick={() => load(true)}><RefreshCw className="icon" />Refresh</button>}
          <span className="pf-small pf-muted">Briefings are cached for the day, so opening one again is free.</span>
        </div>
      </section>
      <ErrorNote error={err} />
      {busy && <Busy label="Reading today’s news and the documents behind it…" />}
      {b && <section style={{ marginTop: 18 }}>
        <div className="pp-news">{b.stories.map((s: any, i: number) => <article key={i} className="pf-card pad"><div className="pf-eyebrow">{s.region}</div><h3 style={{ margin: '6px 0' }}>{s.headline}</h3><p style={{ margin: '0 0 8px' }}>{s.summary}</p><p className="pf-small pf-muted" style={{ margin: 0 }}><b>Why it matters:</b> {s.why_it_matters}</p><div className="pp-chips" style={{ marginTop: 10 }}>{s.committees.map((c: string) => <span key={c} className="pf-tag blue">{c}</span>)}</div></article>)}</div>
        <Sources sources={b.sources} />
        <p className="pf-small pf-faint">Briefing for {b.day}. Not a real-time alert service; check sources for the latest.</p>
      </section>}
    </PrepShell>
  );
}
