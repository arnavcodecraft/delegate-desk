import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  Search, MapPin, CalendarDays, Users, Landmark, GraduationCap, Laptop, Plus, ArrowRight, Copy, Check, X, ExternalLink, AtSign, ThumbsUp, Music2, MessageCircle, Globe,
  BookOpen, Briefcase, Mail, Info, Eye, FileText, Gavel,
} from 'lucide-react';
import { api, ApiError, qs } from '../api';
import { inr } from '../format';
import { countryName } from '../data/countries';
import { PlatformShell } from './Shell';
import { Emblem, Flag, bannerStyle } from './art';

const FORMAT: Record<string, string> = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid' };
const LEVEL: Record<string, string> = { high_school: 'High school', university: 'University', both: 'High school & university' };
const DIFF: Record<string, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert' };
export const ROLE_NAMES: Record<string, string> = { chair: 'Chair', secretariat: 'Secretariat', staff: 'Organising staff', press: 'Press', volunteer: 'Volunteer', advisor: 'Faculty advisor', observer: 'Observer' };

export function dateRange(a?: string | null, b?: string | null) {
  if (!a) return 'Dates to be decided';
  const f = (s: string, y = true) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) });
  if (!b || a === b) return f(a);
  return a.slice(0, 4) === b.slice(0, 4) ? `${f(a, false)} – ${f(b)}` : `${f(a)} – ${f(b)}`;
}

function ConfCard({ c }: { c: any }) {
  const bn = bannerStyle(c.banner);
  return (
    <Link className="pf-conf" to={`/c/${c.slug}`}>
      <div className={`bn ${bn.className}`} style={bn.style} />
      <div className="logo">{c.logo ? <img src={c.logo} alt="" /> : (c.acronym ?? c.name).slice(0, 4)}</div>
      <div className="in">
        <h3>{c.acronym && c.acronym !== c.name ? <>{c.acronym} <span className="pf-muted" style={{ fontWeight: 500, fontSize: 15 }}>· {c.name}</span></> : c.name}</h3>
        <div className="pf-meta">
          <span><CalendarDays className="icon" />{c.datesTbd ? 'Dates to be decided' : dateRange(c.start_date, c.end_date)}</span>
          <span>{c.country && <Flag code={c.country} />}{[c.city, countryName(c.country)].filter(Boolean).join(', ') || (c.format === 'online' ? 'Online' : '')}</span>
        </div>
        <div className="pf-tags">
          <span className="pf-tag">{FORMAT[c.format] ?? 'In person'}</span>
          {c.level && <span className="pf-tag">{LEVEL[c.level]}</span>}
          <span className="pf-tag">{c.committees} committee{c.committees === 1 ? '' : 's'}</span>
          {c.free ? <span className="pf-tag green">Free</span> : c.feeFrom ? <span className="pf-tag gold">from {inr(c.feeFrom)}</span> : null}
          {c.roles?.delegate ? <span className="pf-tag green">Applications open</span> : null}
        </div>
      </div>
    </Link>
  );
}

/** Home and Explore: find conferences. */
export function Explore({ home }: { home?: boolean }) {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const f = { country: sp.get('country') ?? '', level: sp.get('level') ?? '', format: sp.get('format') ?? '', fee: sp.get('fee') ?? '', when: sp.get('when') ?? 'upcoming' };
  const [data, setData] = useState<{ conferences: any[]; countries: string[] } | null>(null);
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api.get('/api/platform/stats').then(setStats).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => { api.get(`/api/platform/conferences${qs({ ...f, q })}`).then(setData).catch(() => setData({ conferences: [], countries: [] })); }, 180);
    return () => clearTimeout(t);
  }, [q, sp.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const setF = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  return (
    <PlatformShell>
      <div className="pf-hero">
        <div className="pf-eyebrow">Model UN conferences</div>
        <h1 className="pf-h1" style={{ marginTop: 10 }}>{home ? 'Find your next conference' : 'Explore conferences'}</h1>
        <p className="pf-sub">Search Model UN conferences, see committees, fees and dates, and apply in a minute. Running one? List it for free and manage applications, payments and committees in one place.</p>
        {stats && <div className="pf-stats"><div><b>{stats.conferences}</b><span>conferences</span></div><div><b>{stats.delegates.toLocaleString('en-IN')}</b><span>delegates registered</span></div><div><b>{stats.countries}</b><span>countries</span></div><div><b>{stats.organisers}</b><span>organisers</span></div></div>}
        {home && <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}><Link className="pf-btn primary" to="/list"><Plus className="icon" />List your conference</Link><Link className="pf-btn ghost" to="/jobs"><Briefcase className="icon" />Chair &amp; staff roles</Link></div>}
      </div>
      <div className="pf-filters">
        <div className="pf-search grow"><Search className="icon" /><input className="pf-input" style={{ width: '100%' }} value={q} onChange={(e) => { setQ(e.target.value); setF('q', e.target.value); }} placeholder="Search by name, city, committee…" aria-label="Search conferences" /></div>
        <select className="pf-input" value={f.country} onChange={(e) => setF('country', e.target.value)} aria-label="Country"><option value="">Any country</option>{(data?.countries ?? []).map((c) => <option key={c} value={c}>{countryName(c)}</option>)}</select>
        <select className="pf-input" value={f.level} onChange={(e) => setF('level', e.target.value)} aria-label="Level"><option value="">Any level</option><option value="high_school">High school</option><option value="university">University</option></select>
        <select className="pf-input" value={f.format} onChange={(e) => setF('format', e.target.value)} aria-label="Format"><option value="">In person or online</option><option value="in_person">In person</option><option value="online">Online</option></select>
        <select className="pf-input" value={f.fee} onChange={(e) => setF('fee', e.target.value)} aria-label="Fee"><option value="">Free or paid</option><option value="free">Free</option><option value="paid">Paid</option></select>
        <select className="pf-input" value={f.when} onChange={(e) => setF('when', e.target.value)} aria-label="When"><option value="upcoming">Upcoming</option><option value="tbd">Dates to be decided</option><option value="past">Past</option><option value="all">Any time</option></select>
      </div>
      {!data ? <div className="pf-empty">Loading conferences…</div>
        : !data.conferences.length ? (
          <div className="pf-empty pf-card"><Gavel className="icon" style={{ width: 34, height: 34, color: 'var(--pf-ink-3)' }} /><h2 className="pf-h2" style={{ marginTop: 10 }}>No conferences match</h2><p>Try fewer filters, or be the first: list yours in a few minutes.</p><Link className="pf-btn primary" to="/list">List your conference</Link></div>
        ) : <div className="pf-confs">{data.conferences.map((c) => <ConfCard key={c.slug} c={c} />)}</div>}
    </PlatformShell>
  );
}

/** The public conference page: about, committees, fees, roles and links. */
export function ConferencePage() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const preview = sp.get('preview') === '1';
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [apply, setApply] = useState<{ role: string; position?: any } | null>(null);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState('');
  useEffect(() => {
    api.get(`/api/platform/conferences/${slug}${qs({ preview: preview ? '1' : '', src: sp.get('src') ?? sp.get('utm_source') ?? '' })}`).then(setC).catch((e) => setError(e.message));
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (c) QRCode.toDataURL(c.links.page, { width: 260, margin: 1 }).then(setQr).catch(() => {}); }, [c]);
  if (error) return <PlatformShell><div className="pf-empty pf-card" style={{ marginTop: 30 }}><h2 className="pf-h2">Conference not found</h2><p>It may not be published yet. <Link to="/explore">Browse conferences</Link></p></div></PlatformShell>;
  if (!c) return <PlatformShell><div className="pf-empty">Loading…</div></PlatformShell>;
  const bn = bannerStyle(c.banner);
  const regUrl = `/register/${c.code}${sp.get('src') ? `?src=${encodeURIComponent(sp.get('src')!)}` : ''}`;
  const totalSeats = c.committees.reduce((s: number, x: any) => s + x.seats, 0);
  const socials = Object.entries(c.socials ?? {}).filter(([, v]) => v) as [string, string][];
  const socialHref = (k: string, v: string) => (/^https?:\/\//.test(v) ? v : k === 'instagram' ? `https://instagram.com/${v.replace(/^@|instagram\.com\//g, '')}` : k === 'facebook' ? `https://${v.replace(/^https?:\/\//, '')}`
    : k === 'tiktok' ? `https://tiktok.com/@${v.replace(/^@/, '')}` : k === 'whatsapp' ? (v.includes('wa.me') ? `https://${v.replace(/^https?:\/\//, '')}` : `https://wa.me/${v.replace(/\D/g, '')}`) : `https://${v}`);
  const SOC: Record<string, any> = { instagram: AtSign, facebook: ThumbsUp, tiktok: Music2, whatsapp: MessageCircle, website: Globe };
  return (
    <PlatformShell>
      {preview && !c.published && <div className="pf-note" style={{ margin: '10px 0 16px' }}><Eye className="icon" /><span>Preview. This page is a draft and only people with this link can see it. Publish it from your dashboard to list it on Explore.</span></div>}
      <div className="pf-card pf-cover">
        <div className={`bn ${bn.className}`} style={bn.style} />
        <div className="pf-cover-body" style={{ paddingBottom: 22 }}>
          <div className="pf-logo" style={{ cursor: 'default' }}>{c.logo ? <img src={c.logo} alt="" /> : <b style={{ fontSize: 28, color: 'var(--pf-brand)' }}>{(c.acronym ?? '').slice(0, 4)}</b>}</div>
          <div className="pf-cover-text" style={{ flex: 1, minWidth: 240, paddingBottom: 6 }}>
            <div className="pf-eyebrow">{c.organiser}</div>
            <h1>{c.acronym && c.acronym !== c.name ? c.acronym : c.name}</h1>
            {c.acronym && c.acronym !== c.name && <div className="pf-muted" style={{ fontSize: 17, marginTop: 2 }}>{c.name}</div>}
            <div className="pf-meta" style={{ marginTop: 10, fontSize: 14.5 }}>
              <span><CalendarDays className="icon" />{c.datesTbd ? 'Dates to be decided' : dateRange(c.start_date, c.end_date)}</span>
              <span>{c.country && <Flag code={c.country} />}{[c.venue, c.city, countryName(c.country)].filter(Boolean).join(', ')}</span>
              <span>{c.format === 'online' ? <Laptop className="icon" /> : <Landmark className="icon" />}{FORMAT[c.format]}</span>
              <span><GraduationCap className="icon" />{LEVEL[c.level]}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pf-layout">
        <div>
          {c.description && <section className="pf-section" style={{ marginTop: 0 }}><h2>About</h2><div className="pf-card pad" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.description}</div></section>}
          <section className="pf-section" style={{ marginTop: c.description ? 30 : 0 }}>
            <h2>Committees <span className="pf-muted" style={{ fontWeight: 500, fontSize: 16 }}>· {c.committees.length} · {totalSeats} seats</span></h2>
            <div className="pf-card">
              {!c.committees.length && <div className="pf-empty" style={{ padding: 30 }}>Committees will be announced soon.</div>}
              {c.committees.map((m: any) => (
                <div className="pf-comm" key={m.id}>
                  <Emblem k={m.emblem} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 750, fontSize: 16.5 }}>{m.short} <span className="pf-muted" style={{ fontWeight: 500 }}>· {m.name}</span></div>
                    <div className="pf-meta" style={{ marginTop: 3 }}>
                      <span>{DIFF[m.difficulty] ?? 'Intermediate'}</span>{m.language && m.language !== 'English' && <span>{m.language}</span>}
                      <span>{m.open > 0 ? `${m.open} of ${m.seats} seats open` : 'Full'}</span>
                    </div>
                    {m.description && <div className="pf-small pf-muted" style={{ marginTop: 6 }}>{m.description}</div>}
                    {m.topics?.length > 0 && <div className="pf-small" style={{ marginTop: 6 }}>{m.topics.map((t: string, i: number) => <div key={i}><b style={{ color: 'var(--pf-gold)' }}>Topic {m.topics.length > 1 ? i + 1 : ''}</b> {t}</div>)}</div>}
                    <div className="pf-bar"><i style={{ width: `${m.seats ? Math.round(((m.seats - m.open) / m.seats) * 100) : 0}%` }} /></div>
                  </div>
                  {m.guide_url && <a className="pf-btn ghost sm" href={m.guide_url} target="_blank" rel="noreferrer"><BookOpen className="icon" />Study guide</a>}
                </div>
              ))}
            </div>
          </section>
          {c.positions?.length > 0 && (
            <section className="pf-section"><h2>Open positions</h2>
              <div className="pf-card">{c.positions.map((p: any) => (
                <div className="pf-job" key={p.id}>
                  <div className="lg"><Briefcase className="icon" /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 750 }}>{p.title}</div><div className="pf-meta"><span>{ROLE_NAMES[p.kind]}</span>{p.committee && <span>{p.committee}</span>}{p.deadline && <span>Apply by {dateRange(p.deadline.slice(0, 10))}</span>}</div>{p.description && <div className="pf-small pf-muted" style={{ marginTop: 4 }}>{p.description}</div>}</div>
                  <button className="pf-btn primary sm" onClick={() => setApply({ role: p.kind, position: p })}>Apply</button>
                </div>
              ))}</div>
            </section>
          )}
          {!c.free && c.fees?.length > 0 && (
            <section className="pf-section"><h2>Fees</h2>
              <div className="pf-card">{[...c.fees].filter((f: any) => f.category !== 'international' && !(f.category === 'advisor' && !f.total)).sort((a: any, b: any) => ['school', 'college', 'advisor'].indexOf(a.category) - ['school', 'college', 'advisor'].indexOf(b.category)).map((f: any, i: number) => (
                <div key={i} className="pf-comm" style={{ alignItems: 'center' }}><div style={{ flex: 1 }}><b>{f.name}</b> <span className="pf-muted">· {({ school: 'School delegates', college: 'University delegates', advisor: 'Faculty advisors' } as any)[f.category] ?? f.category}</span>{f.ends_at && <div className="pf-small pf-muted">until {dateRange(f.ends_at.slice(0, 10))}</div>}</div><b style={{ fontSize: 17 }}>{inr(f.total)}</b></div>
              ))}</div>
              {c.gstIncluded && <p className="pf-small pf-muted">Prices include GST.</p>}
            </section>
          )}
        </div>
        <aside className="pf-side">
          <div className="pf-card pad">
            <div className="pf-h2" style={{ fontSize: 19 }}>Apply</div>
            <div className="pf-small pf-muted" style={{ margin: '4px 0 14px' }}>{c.free ? 'Free to attend.' : c.feeFrom ? `Delegate fee from ${inr(c.feeFrom)}.` : ''}{c.deadline ? ` Applications close ${dateRange(c.deadline.slice(0, 10))}.` : ''}{c.allocationMode === 'review' ? ' Applications are reviewed before committees are assigned.' : ''}</div>
            <div className="pf-roles">
              {c.roles?.delegate ? <a className="pf-btn primary" href={regUrl}>Apply as a delegate<ArrowRight className="icon" /></a> : <button className="pf-btn primary" disabled>{c.published ? 'Delegate applications closed' : 'Applications open after publishing'}</button>}
              {c.roles?.advisor && <button className="pf-btn ghost" onClick={() => setApply({ role: 'advisor' })}>Apply as a faculty advisor</button>}
              {c.roles?.observer && <button className="pf-btn ghost" onClick={() => setApply({ role: 'observer' })}>Apply as an observer</button>}
              {c.roles?.chair && !c.positions?.some((p: any) => p.kind === 'chair') && <button className="pf-btn ghost" onClick={() => setApply({ role: 'chair' })}>Apply to chair</button>}
              {c.roles?.delegate && <a className="pf-small" style={{ textAlign: 'center' }} href={`/register/${c.code}/delegation`}>Registering a whole school delegation?</a>}
            </div>
          </div>
          <div className="pf-card pad">
            <div className="pf-label" style={{ fontSize: 14 }}>Share</div>
            <div className="pf-share"><code>{c.links.page.replace(/^https?:\/\//, '')}</code><button className="pf-btn ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(c.links.page); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* blocked */ } }}>{copied ? <Check className="icon" /> : <Copy className="icon" />}</button></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
              {qr && <img src={qr} alt="QR code for this page" style={{ width: 96, height: 96, borderRadius: 10, background: '#fff', padding: 4 }} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a className="pf-btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`${c.name} – apply here: ${c.links.page}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="icon" />WhatsApp</a>
                {qr && <a className="pf-small" href={qr} download={`${c.code}-qr.png`}>Download QR</a>}
              </div>
            </div>
          </div>
          {(socials.length > 0 || c.contactEmail) && (
            <div className="pf-card pad">
              <div className="pf-label" style={{ fontSize: 14 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.contactEmail && <a href={`mailto:${c.contactEmail}`} className="pf-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Mail className="icon" style={{ width: 16, height: 16 }} />{c.contactEmail}</a>}
                {socials.map(([k, v]) => { const I = SOC[k] ?? ExternalLink; return <a key={k} href={socialHref(k, v)} target="_blank" rel="noreferrer" className="pf-small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><I className="icon" style={{ width: 16, height: 16 }} />{v.replace(/^https?:\/\//, '')}</a>; })}
              </div>
            </div>
          )}
          <div className="pf-small pf-muted pf-center"><Users className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> {c.delegates} registered{c.expected ? ` · ${c.expected} expected` : ''}</div>
        </aside>
      </div>
      {apply && <ApplyModal slug={slug} conference={c} role={apply.role} position={apply.position} onClose={() => setApply(null)} />}
    </PlatformShell>
  );
}

/** Applying for a role (chair, secretariat, staff, press, volunteer, advisor, observer). */
export function ApplyModal({ slug, conference, role, position, onClose }: { slug: string; conference: any; role: string; position?: any; onClose: () => void }) {
  const [f, setF] = useState<Record<string, string>>({ full_name: '', email: '', mobile: '', institution: '', city: '', experience: '', motivation: '' });
  const [prefs, setPrefs] = useState<string[]>([]);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const cvIn = useRef<HTMLInputElement>(null);
  const needsExperience = ['chair', 'secretariat', 'press'].includes(role);
  async function submit() {
    setBusy(true); setError(null); setErrors({});
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(f)) fd.append(k, v);
      fd.append('role', role); if (position) fd.append('position_id', position.id);
      fd.append('committee_prefs', JSON.stringify(prefs));
      if (cv) fd.append('cv', cv);
      const out = await api.post<{ token: string }>(`/api/platform/conferences/${slug}/apply`, fd);
      setDone(out.token);
    } catch (e: any) { if (e instanceof ApiError && e.details?.fields) setErrors(e.details.fields); setError(e.message); }
    finally { setBusy(false); }
  }
  const field = (k: string, label: string, o: { type?: string; textarea?: boolean; optional?: boolean; ph?: string } = {}) => (
    <div className="pf-field" style={{ marginBottom: 14 }}>
      <label className="pf-label" htmlFor={`ap-${k}`} style={{ fontSize: 14 }}>{label}{o.optional && <span className="opt">Optional</span>}</label>
      {o.textarea ? <textarea id={`ap-${k}`} className={`pf-input ${errors[k] ? 'invalid' : ''}`} style={{ minHeight: 96, fontSize: 15 }} value={f[k]} placeholder={o.ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        : <input id={`ap-${k}`} className={`pf-input ${errors[k] ? 'invalid' : ''}`} style={{ minHeight: 48, fontSize: 15 }} type={o.type ?? 'text'} value={f[k]} placeholder={o.ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
      {errors[k] && <div className="pf-err">{errors[k]}</div>}
    </div>
  );
  return (
    <div className="pf-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-label="Apply">
        <header><h2>{position?.title ?? `Apply as ${ROLE_NAMES[role]?.toLowerCase() ?? role}`}</h2><button className="pf-x" onClick={onClose} aria-label="Close"><X className="icon" /></button></header>
        {done ? (
          <div className="body pf-center" style={{ padding: '20px 24px 30px' }}>
            <div className="pf-success" style={{ padding: 10 }}><div className="big" style={{ width: 64, height: 64 }}><Check className="icon" /></div></div>
            <h3 className="pf-h2">Application sent</h3>
            <p className="pf-muted">We've emailed you a confirmation. {conference.organiser} will review it and email you with a decision.</p>
            <a className="pf-btn ghost" href={`/application/${done}`}>Check its status</a>
          </div>
        ) : <>
          <div className="body">
            <p className="pf-small pf-muted" style={{ marginTop: 0 }}>{conference.acronym ?? conference.name}{position?.committee ? ` · ${position.committee}` : ''}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              {field('full_name', 'Full name')}{field('email', 'Email', { type: 'email' })}
              {field('mobile', 'Mobile', { type: 'tel', optional: true })}{field('institution', role === 'advisor' ? 'School or institution' : 'School, college or organisation')}
            </div>
            {field('city', 'City', { optional: true })}
            {role === 'chair' && conference.committees?.length > 0 && !position?.committee && (
              <div className="pf-field" style={{ marginBottom: 14 }}>
                <div className="pf-label" style={{ fontSize: 14 }}>Committees you'd like to chair <span className="opt">up to 3</span></div>
                <div className="pf-chips">{conference.committees.map((m: any) => { const on = prefs.includes(m.id); return <button key={m.id} type="button" className={`pf-chip ${on ? 'on' : ''}`} onClick={() => setPrefs(on ? prefs.filter((x) => x !== m.id) : prefs.length < 3 ? [...prefs, m.id] : prefs)}>{m.short}</button>; })}</div>
              </div>
            )}
            {field('experience', needsExperience ? 'Your MUN experience' : 'Experience', { textarea: true, optional: !needsExperience, ph: needsExperience ? 'Conferences you have attended or chaired, awards, roles…' : '' })}
            {field('motivation', 'Why do you want this role?', { textarea: true, optional: true })}
            {needsExperience && (
              <div className="pf-field">
                <div className="pf-label" style={{ fontSize: 14 }}>CV <span className="opt">Optional, PDF</span></div>
                <button type="button" className="pf-btn ghost sm" onClick={() => cvIn.current?.click()}><FileText className="icon" />{cv ? cv.name : 'Attach a PDF'}</button>
                <input ref={cvIn} type="file" accept="application/pdf" hidden onChange={(e) => setCv(e.target.files?.[0] ?? null)} />
              </div>
            )}
            {error && <div className="pf-note" style={{ background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><Info className="icon" /><span>{error}</span></div>}
          </div>
          <footer><button className="pf-btn ghost" onClick={onClose}>Cancel</button><button className="pf-btn primary" disabled={busy} onClick={submit}>{busy ? 'Sending…' : 'Send application'}</button></footer>
        </>}
      </div>
    </div>
  );
}

/** The Job Board: chair, secretariat, staff, press and volunteer roles across all conferences. */
export function Jobs() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const kind = sp.get('kind') ?? '';
  const [jobs, setJobs] = useState<any[] | null>(null);
  const [apply, setApply] = useState<{ job: any; conf: any } | null>(null);
  useEffect(() => { const t = setTimeout(() => api.get(`/api/platform/jobs${qs({ kind, q })}`).then(setJobs).catch(() => setJobs([])), 180); return () => clearTimeout(t); }, [kind, q]);
  const open = async (job: any) => { const conf = await api.get(`/api/platform/conferences/${job.slug}`); setApply({ job, conf }); };
  const kinds = ['', 'chair', 'secretariat', 'staff', 'press', 'volunteer'];
  return (
    <PlatformShell>
      <div className="pf-hero"><div className="pf-eyebrow">Job Board</div><h1 className="pf-h1" style={{ marginTop: 10 }}>Chair, secretariat and staff roles</h1><p className="pf-sub">Conferences post the roles they need. Apply in a couple of minutes; organisers review and reply by email.</p></div>
      <div className="pf-filters">
        <div className="pf-search grow"><Search className="icon" /><input className="pf-input" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles, conferences, cities…" aria-label="Search roles" /></div>
        <div className="pf-seg" style={{ flexWrap: 'wrap' }}>{kinds.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => { const n = new URLSearchParams(sp); if (k) n.set('kind', k); else n.delete('kind'); setSp(n, { replace: true }); }}>{k ? ROLE_NAMES[k] : 'All'}</button>)}</div>
      </div>
      {!jobs ? <div className="pf-empty">Loading…</div> : !jobs.length ? <div className="pf-empty pf-card"><Briefcase className="icon" style={{ width: 32, height: 32, color: 'var(--pf-ink-3)' }} /><h2 className="pf-h2" style={{ marginTop: 10 }}>No open roles right now</h2><p>Organisers: post roles from your dashboard under Job Board.</p></div> : (
        <div className="pf-card">{jobs.map((j) => (
          <div className="pf-job" key={j.id}>
            <div className="lg">{j.logo ? <img src={j.logo} alt="" /> : (j.acronym ?? j.conference).slice(0, 3)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 760, fontSize: 16.5 }}>{j.title}</div>
              <div className="pf-meta"><Link to={`/c/${j.slug}`}>{j.acronym ?? j.conference}</Link><span>{ROLE_NAMES[j.kind]}</span>{j.committee && <span>{j.committee}</span>}<span>{j.country && <Flag code={j.country} />}{[j.city, countryName(j.country)].filter(Boolean).join(', ')}</span><span><CalendarDays className="icon" />{dateRange(j.start_date, j.end_date)}</span>{j.deadline && <span>Apply by {dateRange(j.deadline.slice(0, 10))}</span>}</div>
              {j.description && <div className="pf-small pf-muted" style={{ marginTop: 4 }}>{j.description}</div>}
            </div>
            <button className="pf-btn primary sm" onClick={() => open(j)}>Apply</button>
          </div>
        ))}</div>
      )}
      {apply && <ApplyModal slug={apply.job.slug} conference={apply.conf} role={apply.job.kind} position={{ id: apply.job.id, title: apply.job.title, committee: apply.job.committee }} onClose={() => setApply(null)} />}
    </PlatformShell>
  );
}

/** Status page for a role application (link in the confirmation email). */
export function ApplicationStatus() {
  const { token = '' } = useParams();
  const [a, setA] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get(`/api/platform/application/${token}`).then(setA).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const STATUS: Record<string, [string, string]> = { submitted: ['Received', 'The secretariat has your application and will review it.'], shortlisted: ['Shortlisted', 'You are on the shortlist. Expect an email soon.'],
    accepted: ['Accepted', 'Congratulations! Check your email for the details.'], rejected: ['Not selected', 'Thank you for applying. This role went to another applicant.'], withdrawn: ['Withdrawn', 'You withdrew this application.'] };
  return (
    <PlatformShell>
      <div className="pf-narrow" style={{ marginTop: 30 }}>
        {error ? <div className="pf-empty pf-card"><h2 className="pf-h2">Application not found</h2><p>{error}</p></div> : !a ? <div className="pf-empty">Loading…</div> : (
          <div className="pf-card pad">
            <div className="pf-eyebrow">{a.event_name}</div>
            <h1 className="pf-h2" style={{ fontSize: 28, marginTop: 6 }}>{a.role}</h1>
            <p className="pf-muted">{a.full_name}</p>
            <div className={`pf-note ${a.status === 'accepted' ? 'green' : ''}`} style={{ marginTop: 14 }}><Info className="icon" /><span><b>{STATUS[a.status]?.[0]}</b> · {STATUS[a.status]?.[1]}{a.assigned?.committee ? ` Committee: ${a.assigned.committee}.` : ''}</span></div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <Link className="pf-btn ghost sm" to={`/c/${a.code.toLowerCase()}`}>Conference page</Link>
              {['submitted', 'shortlisted'].includes(a.status) && <button className="pf-btn danger sm" onClick={async () => { if (confirm('Withdraw this application?')) { await api.post(`/api/platform/application/${token}/withdraw`); load(); } }}>Withdraw</button>}
            </div>
          </div>
        )}
      </div>
    </PlatformShell>
  );
}
