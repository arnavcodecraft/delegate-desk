import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Award, Briefcase, Globe, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../api';
import { PlatformShell, usePerson } from './Shell';

type Entry = { id?: string; source: 'delegatedesk' | 'manual'; kind: string; title: string; organiser?: string | null; role?: string | null; start?: string | null; end?: string | null; details?: string | null; award?: string | null; link?: string | null };
const EMPTY: Entry = { source: 'manual', kind: 'mun', title: '', organiser: '', role: '', start: '', end: '', details: '' };
const when = (a?: string | null, b?: string | null) => {
  const f = (s: string) => new Date(s.length === 7 ? `${s}-01` : s).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  if (!a && !b) return '';
  if (a && b && f(a) !== f(b)) return `${f(a)} – ${f(b)}`;
  return f((a ?? b)!);
};
const SOCIAL_ICON: Record<string, any> = { linkedin: Briefcase, instagram: AtSign, x: AtSign, website: Globe };

/** The MUN CV: conferences on DelegateDesk fill in by themselves; delegates add the rest, then print or save it as a PDF. */
export function CvPage() {
  const me = usePerson();
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<Entry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api.get('/api/me/cv').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { if (me?.person) load(); }, [me?.person?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <PlatformShell><div className="pf-empty">Loading…</div></PlatformShell>;
  if (!me.person) return <PlatformShell><div className="pf-empty pf-card pad">Sign in to build your MUN CV. <Link to="/login?next=/account/cv">Sign in</Link></div></PlatformShell>;
  if (!d) return <PlatformShell><div className="pf-empty">{err ?? 'Loading…'}</div></PlatformShell>;
  const p = me.person;
  const all: Entry[] = [...d.auto, ...d.manual].sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? '')));
  const groups = Object.entries(d.kinds as Record<string, string>).map(([k, label]) => ({ k, label, items: all.filter((e) => e.kind === k) })).filter((g) => g.items.length);
  const awards = all.filter((e) => e.award);
  return (
    <PlatformShell>
      <div className="cv-tools no-print">
        <div><div className="pf-eyebrow">My account</div><h1 className="pf-h2" style={{ fontSize: 28, marginTop: 6 }}>MUN CV</h1>
          <p className="pf-muted pf-small" style={{ margin: '4px 0 0' }}>Conferences you did on DelegateDesk are added automatically{p.verified ? '' : ' once you confirm your email'}. Add the rest, then print it or save it as a PDF.</p></div>
        <div className="mk-row"><Link className="pf-btn ghost sm" to="/account">← Account</Link><button className="pf-btn ghost sm" onClick={() => setEdit({ ...EMPTY })}><Plus className="icon" />Add an entry</button><button className="pf-btn primary sm" onClick={() => window.print()}><Printer className="icon" />Print or save PDF</button></div>
      </div>
      {err && <div className="pf-note no-print" style={{ background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><span>{err}</span></div>}
      <article className="cv-doc">
        <header className="cv-head">
          <h1>{p.name}</h1>
          {d.headline && <div className="cv-headline">{d.headline}</div>}
          <div className="cv-meta">{[p.school, p.city, p.email].filter(Boolean).join(' · ')}</div>
          {Object.keys(d.socials ?? {}).length > 0 && <div className="cv-socials">{Object.entries(d.socials as Record<string, string>).map(([k, url]) => { const I = SOCIAL_ICON[k] ?? Globe; return <a key={k} href={url} target="_blank" rel="noopener noreferrer"><I size={14} />{url.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>; })}</div>}
          {d.bio && <p className="cv-bio">{d.bio}</p>}
        </header>
        {!all.length && <p className="pf-muted no-print">Nothing here yet. Add your first MUN with “Add an entry”.</p>}
        {awards.length > 0 && <section className="cv-sec"><h2>Awards</h2>{awards.map((e, i) => <div key={i} className="cv-item"><Award size={14} className="cv-award-ic" /><b>{e.award}</b>, {e.title}{e.role ? ` (${e.role})` : ''}<span className="cv-when">{when(e.start, e.end)}</span></div>)}</section>}
        {groups.map((g) => <section key={g.k} className="cv-sec"><h2>{g.label}</h2>
          {g.items.map((e, i) => <div key={e.id ?? `${e.title}-${i}`} className="cv-item">
            <div className="cv-line"><b>{e.title}</b>{e.organiser && <span className="cv-org"> · {e.organiser}</span>}<span className="cv-when">{when(e.start, e.end)}</span></div>
            {e.role && <div className="cv-role">{e.role}{e.award ? ` · ${e.award}` : ''}</div>}
            {e.details && <div className="cv-details">{e.details}</div>}
            {e.source === 'manual' ? <span className="cv-actions no-print"><button className="pf-btn link" onClick={() => setEdit(e)}><Pencil className="icon" />Edit</button><button className="pf-btn link" onClick={async () => { if (confirm('Remove this entry?')) { await api.del(`/api/me/cv/${e.id}`); load(); } }}><Trash2 className="icon" />Remove</button></span>
              : <span className="cv-src no-print">From DelegateDesk</span>}
          </div>)}
        </section>)}
        <footer className="cv-foot">Verified conferences from DelegateDesk are marked in your account.</footer>
      </article>
      {edit && <EntryForm entry={edit} kinds={d.kinds} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </PlatformShell>
  );
}

function EntryForm({ entry, kinds, onClose, onSaved }: { entry: Entry; kinds: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Entry>({ ...entry, organiser: entry.organiser ?? '', role: entry.role ?? '', start: entry.start ?? '', end: entry.end ?? '', details: entry.details ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof Entry) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { if (entry.id) await api.patch(`/api/me/cv/${entry.id}`, f); else await api.post('/api/me/cv', f); onSaved(); } catch (x: any) { setErr(x.message); }
  };
  return (
    <div className="ch-modal" role="dialog" aria-modal="true" aria-label={entry.id ? 'Edit entry' : 'Add an entry'} onClick={onClose}>
      <form className="pf-card pad cv-form" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2 className="pf-h2" style={{ fontSize: 20, marginBottom: 12 }}>{entry.id ? 'Edit entry' : 'Add an entry'}</h2>
        <label className="pf-field"><span className="pf-label">Type</span><select className="pf-input" value={f.kind} onChange={set('kind')}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="pf-field"><span className="pf-label">Title</span><input className="pf-input" value={f.title} onChange={set('title')} placeholder="e.g. Delhi Public School MUN 2026" required /></label>
        <div className="pf-row2">
          <label className="pf-field"><span className="pf-label">Role</span><input className="pf-input" value={f.role ?? ''} onChange={set('role')} placeholder="e.g. France, UNSC · Best Delegate" /></label>
          <label className="pf-field"><span className="pf-label">Organiser</span><input className="pf-input" value={f.organiser ?? ''} onChange={set('organiser')} placeholder="optional" /></label>
        </div>
        <div className="pf-row2">
          <label className="pf-field"><span className="pf-label">From</span><input className="pf-input" type="month" value={(f.start ?? '').slice(0, 7)} onChange={set('start')} /></label>
          <label className="pf-field"><span className="pf-label">To</span><input className="pf-input" type="month" value={(f.end ?? '').slice(0, 7)} onChange={set('end')} /></label>
        </div>
        <label className="pf-field"><span className="pf-label">Details</span><textarea className="pf-input" rows={3} maxLength={800} value={f.details ?? ''} onChange={set('details')} placeholder="What you did, what you learned (optional)" /></label>
        {err && <div className="pf-err" role="alert">{err}</div>}
        <div className="mk-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button type="button" className="pf-btn ghost sm" onClick={onClose}>Cancel</button><button className="pf-btn primary sm">Save</button></div>
      </form>
    </div>
  );
}
