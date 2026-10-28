import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BookOpenCheck, Compass, FileText, FlaskConical, Flame, Globe2, MessagesSquare, Newspaper, Play, Plus, Search, Send, Trash2, Users, Wrench, X, CheckCircle2, AlertTriangle, Loader2,
} from 'lucide-react';
import { api } from '../api';
import { usePerson } from '../platform/Shell';
import { MEMBERS } from '../data/mun';
import { dailyChallenge } from '../data/learn';
import { AiBadge, Busy, ErrorNote, Markdown, NeedsAccount, PrepShell, Sources, refreshPrep, usePrepMeta } from './common';

export function PrepHome() {
  const meta = usePrepMeta();
  const me = usePerson();
  const ch = dailyChallenge();
  const cards = [
    { to: '/prep/research', icon: Search, t: 'Research', d: 'Ask questions and get answers with sources. Build a brief for your country, committee and topic, with background research running in parallel.' },
    { to: '/prep/write', icon: FileText, t: 'Write', d: 'Position papers, speeches, memos, amendments and points of information, with outlines and word budgets.' },
    { to: '/prep/coach', icon: BookOpenCheck, t: 'Coach', d: 'Check a paper or speech: word count, speaking time, missing sections, and chair-style feedback.' },
    { to: '/prep/practice', icon: MessagesSquare, t: 'Practice', d: 'Negotiate with an AI delegation, stress-test arguments, interview a historical figure, or run a crisis.' },
    { to: '/prep/learn', icon: Flame, t: 'Learn', d: '14 short courses on the UN, procedure, writing and negotiation, plus a daily challenge and your streak.' },
    { to: '/prep/discover', icon: Newspaper, t: 'Discover', d: 'A daily diplomatic briefing with sources, and briefings on the topics you follow.' },
    { to: '/prep/countries', icon: Globe2, t: 'Countries', d: 'All 193 UN members: regional groups, blocs, capitals, a comparator and a bloc builder.' },
    { to: '/prep/tools', icon: Wrench, t: 'MUN tools', d: 'Speech timer, speakers list, vote and quorum calculators, motions reference, resolution formatter, placards and more. No account needed.' },
  ];
  return (
    <PrepShell>
      <section className="pp-hero">
        <div>
          <div className="pf-eyebrow"><span className="pf-dot" />Prep</div>
          <h1 className="pf-h1 left" style={{ marginTop: 10 }}>Walk into committee <span className="pf-grad-text">ready.</span></h1>
          <p className="pf-sub left">Research your country’s position with sources you can check, write and polish your papers and speeches, rehearse with practice partners, and learn the procedure.</p>
          <div className="pf-land-cta">{me?.person ? <Link className="pf-btn primary" to="/prep/research"><Plus className="icon" />New research project</Link> : <Link className="pf-btn primary" to="/account?mode=signup&next=/prep">Create free account</Link>}<Link className="pf-btn ghost" to="/prep/tools">Open MUN tools</Link></div>
          <div style={{ marginTop: 14 }}><AiBadge meta={meta} /></div>
        </div>
        <div className="pp-hero-side">
          <div className="pf-card pad">
            <div className="pf-mini" style={{ marginTop: 0 }}>Daily challenge</div>
            <b style={{ display: 'block', marginBottom: 10 }}>{ch.q}</b>
            <Link className="pf-btn ghost sm" to="/prep/learn#daily">Answer it</Link>
            {meta?.progress && <div className="pp-streak"><Flame className="icon" />{meta.progress.streak} day streak</div>}
          </div>
        </div>
      </section>
      <section className="pp-grid">{cards.map((c) => <Link key={c.to} to={c.to} className="pp-card"><span className="pp-ic"><c.icon className="icon" /></span><b>{c.t}</b><p>{c.d}</p></Link>)}</section>
      <p className="pf-small pf-muted" style={{ marginTop: 20 }}>AI answers can be wrong or out of date. Open the cited source before you rely on a fact, especially for fast-moving situations. Practice partners are simulations, not predictions of what a country or person would do.</p>
    </PrepShell>
  );
}

export function ResearchHome() {
  const meta = usePrepMeta();
  const nav = useNavigate();
  const [data, setData] = useState<{ projects: any[]; items: any[] } | null>(null);
  const [sp] = useSearchParams();
  const [f, setF] = useState({ country: sp.get('country') ?? '', committee: '', topic: '', template: 'country_brief' });
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.get<any>('/api/prep/projects').then(setData).catch(() => setData({ projects: [], items: [] }));
  useEffect(() => { load(); }, []);
  return (
    <PrepShell title="Research" subtitle="Ask a quick question, or start a project for a committee: it keeps your findings, sources, drafts and notes together." actions={<AiBadge meta={meta} />}>
      <NeedsAccount what="research with sources">
        <div className="pp-two">
          <section className="pf-card pad">
            <h2 className="pf-h2" style={{ fontSize: 18 }}><FlaskConical className="icon pp-h-ic" /> New research project</h2>
            <div className="pf-row2" style={{ marginTop: 14 }}>
              <label className="pf-field"><span className="pf-label">Delegation</span><input className="pf-input" list="pp-countries" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder="e.g. France" /></label>
              <label className="pf-field"><span className="pf-label">Committee</span><input className="pf-input" value={f.committee} onChange={(e) => setF({ ...f, committee: e.target.value })} placeholder="e.g. UNSC" /></label>
            </div>
            <label className="pf-field"><span className="pf-label">Topic</span><input className="pf-input" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="e.g. Humanitarian access in Sudan" /></label>
            <div className="pf-field"><label className="pf-label">Template</label>
              <div className="pp-chips">{(meta?.templates ?? []).map((t) => <button key={t.key} type="button" className={`pf-pill ${f.template === t.key ? 'on' : ''}`} onClick={() => setF({ ...f, template: t.key })}>{t.label}</button>)}</div>
              <div className="pf-hint">{meta?.templates.find((t) => t.key === f.template)?.tasks.map((k) => meta.tasks.find((x) => x.key === k)?.label).join(' · ')}</div>
            </div>
            <ErrorNote error={err} />
            <button className="pf-btn primary" onClick={async () => { setErr(null); try { const r = await api.post<any>('/api/prep/projects', f); nav(`/prep/projects/${r.project.id}`); } catch (e: any) { setErr(e.message); } }}><Plus className="icon" />Create project</button>
            <datalist id="pp-countries">{MEMBERS.map((m) => <option key={m.code} value={m.name} />)}</datalist>
          </section>
          <section className="pf-card pad">
            <h2 className="pf-h2" style={{ fontSize: 18 }}><Search className="icon pp-h-ic" /> Quick question</h2>
            <form onSubmit={async (e) => { e.preventDefault(); if (!q.trim()) return; setErr(null); setBusy(true); setAnswer(null); try { setAnswer(await api.post('/api/prep/research', { question: q })); refreshPrep(); load(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } }}>
              <textarea className="pf-input" rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What is France's position on humanitarian access in Sudan, and what has it supported at the UN?" style={{ marginTop: 14 }} />
              <button className="pf-btn primary sm" style={{ marginTop: 10 }} disabled={busy || !q.trim()}><Send className="icon" />Research</button>
            </form>
            {busy && <Busy label="Searching primary sources…" />}
            {answer && <div className="pp-answer"><Markdown text={answer.answer} /><Sources sources={answer.sources} /></div>}
          </section>
        </div>
        <section className="pf-section">
          <h2>Your projects</h2>
          {!data ? <div className="pf-empty">Loading…</div> : !data.projects.length ? <div className="pf-card pad pf-muted">No projects yet. Create one above, or ask to be added to a teammate’s.</div> : (
            <div className="pp-list">{data.projects.map((p) => (
              <Link key={p.id} to={`/prep/projects/${p.id}`} className="pp-row">
                <span className="pp-ic sm"><Compass className="icon" /></span>
                <span style={{ flex: 1, minWidth: 0 }}><b>{p.title}</b><span className="pf-small pf-muted">{[p.committee, p.topic].filter(Boolean).join(' · ')}</span></span>
                <span className="pf-small pf-muted">{p.items} items · {p.members > 1 ? `${p.members} people` : 'just you'}</span>{p.role !== 'owner' && <span className="pf-tag blue">{p.role}</span>}
              </Link>
            ))}</div>
          )}
        </section>
        {!!data?.items?.length && <section className="pf-section"><h2>Outside projects</h2><div className="pp-list">{data.items.slice(0, 20).map((i) => <Link key={i.id} to={`/prep/items/${i.id}`} className="pp-row"><span className="pf-tag">{i.kind}</span><span style={{ flex: 1 }}>{i.title}</span><span className="pf-small pf-faint">{new Date(i.updated_at).toLocaleDateString('en-IN')}</span></Link>)}</div></section>}
      </NeedsAccount>
    </PrepShell>
  );
}

const KIND_LABEL: Record<string, string> = { task: 'Research task', research: 'Question', paper: 'Draft', speech: 'Speech', resolution: 'Resolution', note: 'Note', source: 'Source', practice: 'Practice', coach: 'Feedback' };
export function ProjectPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const meta = usePrepMeta();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [inv, setInv] = useState({ email: '', role: 'editor' });
  const load = () => api.get<any>(`/api/prep/projects/${id}`).then((x) => { setD(x); setPick((p) => (p.length ? p : x.tasks.map((t: any) => t.key))); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = d?.items.some((i: any) => i.status === 'running');
  useEffect(() => { if (!running) return; const t = setInterval(load, 2500); return () => clearInterval(t); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (fn: () => Promise<any>) => { setErr(null); try { await fn(); await load(); refreshPrep(); } catch (e: any) { setErr(e.message); } };
  if (!d) return <PrepShell><NeedsAccount what="open this project">{err ? <ErrorNote error={err} /> : <div className="pf-empty">Loading…</div>}</NeedsAccount></PrepShell>;
  const p = d.project; const canEdit = d.role !== 'viewer';
  const history = d.items.filter((i: any) => i.kind === 'research').slice(0, 3).reverse().map((i: any) => ({ q: i.title, a: i.body }));
  return (
    <PrepShell>
      <div className="pf-pagehead pp-head">
        <div><div className="pf-eyebrow">{p.template_label}</div><h1 className="pf-h1 left" style={{ fontSize: 34 }}>{p.title}</h1>
          <p className="pf-sub left">{[p.country && `Delegation: ${p.country}`, p.committee && `Committee: ${p.committee}`, p.topic && `Topic: ${p.topic}`].filter(Boolean).join(' · ')}</p></div>
        <div className="pp-actions"><AiBadge meta={meta} />{d.role === 'owner' && <button className="pf-btn ghost sm" onClick={() => confirm('Delete this project and everything in it?') && run(async () => { await api.del(`/api/prep/projects/${id}`); nav('/prep/research'); })}><Trash2 className="icon" />Delete</button>}</div>
      </div>
      <ErrorNote error={err} />
      <div className="pp-proj">
        <div className="pp-main">
          {canEdit && <section className="pf-card pad">
            <b>Background research</b>
            <p className="pf-small pf-muted" style={{ margin: '4px 0 10px' }}>Runs each part in parallel and adds the findings, with sources, to this project. You can keep working while it runs.</p>
            <div className="pp-chips">{d.tasks.map((t: any) => <label key={t.key} className={`mk-chip ${pick.includes(t.key) ? 'on' : ''}`}><input type="checkbox" checked={pick.includes(t.key)} onChange={(e) => setPick(e.target.checked ? [...pick, t.key] : pick.filter((x) => x !== t.key))} />{t.label}</label>)}</div>
            <button className="pf-btn primary sm" style={{ marginTop: 12 }} disabled={!pick.length || running} onClick={() => run(() => api.post(`/api/prep/projects/${id}/tasks`, { tasks: pick }))}><Play className="icon" />{running ? 'Researching…' : `Run ${pick.length} task${pick.length === 1 ? '' : 's'}`}</button>
          </section>}
          {canEdit && <section className="pf-card pad">
            <b>Ask a follow-up</b>
            <form onSubmit={async (e) => { e.preventDefault(); if (!q.trim()) return; setBusy(true); await run(() => api.post('/api/prep/research', { question: q, projectId: id, history })); setBusy(false); setQ(''); }}>
              <div className="mk-row" style={{ marginTop: 8 }}><input className="pf-input" style={{ flex: 1, minHeight: 44 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`e.g. How has ${p.country || 'my delegation'} voted on related resolutions since 2020?`} /><button className="pf-btn primary sm" disabled={busy || !q.trim()}><Send className="icon" />Ask</button></div>
            </form>
            {busy && <Busy label="Researching…" />}
          </section>}
          <section>
            <div className="pf-sec-head" style={{ margin: '18px 0 10px' }}><h2 className="pf-h2" style={{ fontSize: 18 }}>Brief</h2><span className="pf-small pf-muted">{d.items.length} items</span></div>
            {!d.items.length && <div className="pf-card pad pf-muted">Nothing here yet. Run the background research or ask a question.</div>}
            {d.items.map((i: any) => (
              <article key={i.id} className={`pf-card pp-item ${open === i.id ? 'open' : ''}`}>
                <button className="pp-item-h" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  {i.status === 'running' ? <Loader2 className="icon pp-rot" /> : i.status === 'failed' ? <AlertTriangle className="icon" style={{ color: 'var(--pf-red)' }} /> : <CheckCircle2 className="icon" style={{ color: 'var(--pf-green)' }} />}
                  <span style={{ flex: 1, minWidth: 0 }}><b>{i.title}</b><span className="pf-small pf-muted">{KIND_LABEL[i.kind] ?? i.kind} · {i.author ?? 'someone'} · {new Date(i.updated_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{i.data?.sources?.length ? ` · ${i.data.sources.length} sources` : ''}</span></span>
                </button>
                {open === i.id && <div className="pp-item-b">
                  {i.status === 'running' ? <Busy label="Still researching…" /> : i.status === 'failed' ? <div className="pf-err">{i.data?.error ?? 'This task failed.'}</div> : i.kind === 'coach' ? <pre className="pp-pre">{JSON.stringify(i.data, null, 2)}</pre> : <Markdown text={i.body} />}
                  <Sources sources={i.data?.sources} />
                  <div className="mk-row" style={{ marginTop: 10 }}><Link className="pf-btn ghost sm" to={`/prep/items/${i.id}`}>Open</Link>{canEdit && <button className="pf-btn link" onClick={() => confirm('Delete this item?') && run(() => api.del(`/api/prep/items/${i.id}`))}>Delete</button>}</div>
                </div>}
              </article>
            ))}
          </section>
        </div>
        <aside className="pp-side">
          <section className="pf-card pad">
            <b>Write from this brief</b>
            <div className="pp-links"><Link to={`/prep/write?project=${id}&kind=paper`}>Position paper</Link><Link to={`/prep/write?project=${id}&kind=speech`}>Speech</Link><Link to={`/prep/write?project=${id}&kind=amendment`}>Amendments</Link><Link to={`/prep/write?project=${id}&kind=poi`}>Points of information</Link><Link to={`/prep/practice?project=${id}`}>Practice negotiation</Link></div>
          </section>
          <section className="pf-card pad">
            <b>Research memory</b>
            <p className="pf-small pf-muted" style={{ margin: '4px 0 8px' }}>Notes every AI answer in this project takes into account (your stance, red lines, allies…).</p>
            <textarea className="mk-notes" rows={5} defaultValue={p.memory} disabled={!canEdit} onBlur={(e) => e.target.value !== p.memory && run(() => api.patch(`/api/prep/projects/${id}`, { memory: e.target.value }))} placeholder="e.g. We back an EU-led maritime mission; red line: no new sanctions." />
          </section>
          <section className="pf-card pad">
            <b><Users className="icon pp-h-ic" /> Team</b>
            {d.members.map((m: any) => <div key={m.person_id} className="mk-line"><span style={{ flex: 1 }}>{m.name}<div className="pf-small pf-faint">{m.role} · {m.items} item{m.items === 1 ? '' : 's'}</div></span>{d.role === 'owner' && m.role !== 'owner' && <button className="pf-btn link" aria-label={`Remove ${m.name}`} onClick={() => run(() => api.del(`/api/prep/projects/${id}/members/${m.person_id}`))}><X className="icon" /></button>}</div>)}
            {d.invites.map((v: any) => <div key={v.id} className="mk-line pf-muted"><span style={{ flex: 1 }}>{v.email}<div className="pf-small pf-faint">invited · {v.role}</div></span></div>)}
            {d.role === 'owner' && <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post(`/api/prep/projects/${id}/invite`, inv); setInv({ ...inv, email: '' }); }); }} style={{ marginTop: 10 }}>
              <input className="pf-input mk-select" type="email" placeholder="Teammate or advisor email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} style={{ width: '100%', marginBottom: 8 }} />
              <div className="mk-row"><select className="pf-input mk-select" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })} aria-label="Role"><option value="editor">Can edit</option><option value="viewer">Can view (advisor)</option></select><button className="pf-btn ghost sm" disabled={!inv.email}><Plus className="icon" />Invite</button></div>
              <div className="pf-hint">They join when they sign in with that email. Advisors see who prepared what.</div>
            </form>}
          </section>
          {canEdit && <section className="pf-card pad">
            <b>Add a note or source</b>
            <textarea className="mk-notes" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paste a quote, a link or your own notes" />
            <button className="pf-btn ghost sm" disabled={!note.trim()} onClick={() => run(async () => { await api.post('/api/prep/items', { projectId: id, kind: /^https?:\/\//.test(note.trim()) ? 'source' : 'note', title: note.trim().split('\n')[0].slice(0, 80), body: note }); setNote(''); })}><Plus className="icon" />Add</button>
          </section>}
        </aside>
      </div>
    </PrepShell>
  );
}

export function ItemPage() {
  const { id = '' } = useParams();
  const [it, setIt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [body, setBody] = useState('');
  useEffect(() => { api.get<any>(`/api/prep/items/${id}`).then((x) => { setIt(x); setBody(x.body); }).catch((e) => setErr(e.message)); }, [id]);
  return (
    <PrepShell>
      <NeedsAccount what="open this">
        <ErrorNote error={err} />
        {it && <div className="pf-narrow" style={{ maxWidth: 860 }}>
          <div className="mk-row"><Link to={it.project_id ? `/prep/projects/${it.project_id}` : '/prep/research'} className="pf-btn link">← Back</Link><span style={{ flex: 1 }} /><button className="pf-btn ghost sm" onClick={() => window.print()}>Print or save PDF</button><button className="pf-btn ghost sm" onClick={() => { navigator.clipboard?.writeText(it.body); }}>Copy text</button>{!edit ? <button className="pf-btn primary sm" onClick={() => setEdit(true)}>Edit</button> : <button className="pf-btn primary sm" onClick={async () => { try { await api.patch(`/api/prep/items/${id}`, { body }); setIt({ ...it, body }); setEdit(false); } catch (e: any) { setErr(e.message); } }}>Save</button>}</div>
          <article className="pf-card pad pp-doc">
            <h1 className="pf-h2" style={{ fontSize: 26 }}>{it.title}</h1>
            {edit ? <textarea className="mk-notes" rows={28} value={body} onChange={(e) => setBody(e.target.value)} /> : <Markdown text={it.body} />}
            <Sources sources={it.data?.sources} />
          </article>
        </div>}
      </NeedsAccount>
    </PrepShell>
  );
}
