import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bookmark, Calendar, CheckCircle2, FileText, KeyRound, LogOut, Mail, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api } from '../api';
import { PlatformShell, refreshMe, usePerson } from './Shell';

const ROLE_LABEL: Record<string, string> = { delegate: 'Delegate', advisor: 'Faculty advisor', chair: 'Chair / EB', other: 'Other' };
const STATUS: Record<string, [string, string]> = {
  confirmed: ['Confirmed', 'green'], held: ['Seat held', 'amber'], applied: ['Under review', 'blue'], waitlisted: ['Waitlisted', 'blue'], none: ['Registered', 'blue'],
  released: ['Seat released', ''], cancelled: ['Cancelled', ''], submitted: ['Submitted', 'blue'], shortlisted: ['Shortlisted', 'blue'], accepted: ['Accepted', 'green'], rejected: ['Not selected', ''], withdrawn: ['Withdrawn', ''],
};
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Dates to be decided');

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="pf-field"><label style={{ display: 'block' }}><span className="pf-label">{label}</span>{children}</label>{hint && <div className="pf-hint">{hint}</div>}</div>;
}

/** The one sign-in for everyone (delegates, advisors, chairs and organiser teams), sign-up, password reset and two-factor. */
function AuthCard({ start = 'signin', next }: { start?: 'signin' | 'signup'; next?: string | null }) {
  const nav = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'verify' | 'enroll'>(start);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'delegate', school: '', code: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const go = async (fn: () => Promise<void>) => { setErr(null); setBusy(true); try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toApp = () => nav(next && next.startsWith('/') && !next.startsWith('/account') ? next : '/app');
  const toAccount = () => { refreshMe(); if (next && next.startsWith('/') && !next.startsWith('/app')) nav(next); else nav('/account'); };
  // Someone who already signed in but still owes a two-factor code comes straight back to it.
  useEffect(() => { api.get<any>('/api/auth/me').then((m) => { if (m.user && m.mfaPending) setMode(m.mfaEnrolled ? 'verify' : 'enroll'); else if (m.user && start === 'signin') toApp(); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === 'enroll' && !enroll) api.post<any>('/api/auth/mfa/enroll').then(setEnroll).catch((e) => setErr(e.message)); }, [mode, enroll]);
  const title = { verify: 'Two-factor verification', enroll: 'Set up two-factor sign-in', forgot: 'Reset your password', reset: 'Enter the code' } as Record<string, string>;
  return (
    <div className="pf-card pad pf-auth">
      {(mode === 'signin' || mode === 'signup') && <div className="pf-tabs2" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'on' : ''} onClick={() => { setErr(null); setMode('signin'); }}>Sign in</button>
        <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'on' : ''} onClick={() => { setErr(null); setMode('signup'); }}>Create account</button>
      </div>}
      <form onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'signin') go(async () => {
          const r = await api.post<any>('/api/auth/login', { email: f.email, password: f.password });
          if (r.kind === 'person') return toAccount();
          if (r.mfa) { setF((x) => ({ ...x, code: '' })); setMode(r.mfa); } else toApp();
        });
        if (mode === 'signup') go(async () => { const r = await api.post<any>('/api/me/signup', { name: f.name, email: f.email, password: f.password, role: f.role, school: f.school }); if (r.devCode) { try { sessionStorage.setItem('dd-devcode', r.devCode); } catch { /* private mode */ } } toAccount(); });
        if (mode === 'forgot') go(async () => {
          // Team accounts get a reset link, participant accounts a 6-digit code: ask for both, only the matching one is sent.
          const [, r] = await Promise.all([api.post('/api/auth/forgot', { email: f.email }).catch(() => null), api.post<any>('/api/me/forgot', { email: f.email })]);
          setDev(r?.devCode ?? null); setMode('reset');
        });
        if (mode === 'reset') go(async () => { await api.post('/api/me/reset', { email: f.email, code: f.code, password: f.password }); toAccount(); });
        if (mode === 'verify') go(async () => { await api.post('/api/auth/mfa/verify', { code: f.code }); toApp(); });
        if (mode === 'enroll') go(async () => { await api.post('/api/auth/mfa/confirm', { code: f.code }); toApp(); });
      }}>
        {title[mode] && <h2 className="pf-h2">{title[mode]}</h2>}
        {mode === 'forgot' && <p className="pf-muted pf-small">We will email you a 6-digit code (or, for organiser team accounts, a reset link).</p>}
        {mode === 'reset' && <><p className="pf-muted pf-small">If {f.email} has an account, we sent a code. It expires in 15 minutes. Organiser team accounts get a link by email instead.</p>{dev && <div className="pf-note" style={{ marginBottom: 12 }}><span>Email isn’t set up on this server yet, so here is the code: <b>{dev}</b></span></div>}</>}
        {mode === 'verify' && <p className="pf-muted pf-small">Enter the 6-digit code from your authenticator app.</p>}
        {mode === 'enroll' && <><p className="pf-muted pf-small">Your role handles money and settings, so two-factor sign-in is required. Scan this with Google Authenticator, Microsoft Authenticator or similar, then enter the code it shows.</p>
          {enroll ? <div style={{ textAlign: 'center', margin: '8px 0 14px' }}><img src={enroll.qr} width={190} height={190} alt="Authenticator QR code" style={{ background: '#fff', padding: 6, borderRadius: 10 }} /><div className="pf-small mono" style={{ wordBreak: 'break-all' }}>{enroll.secret}</div></div> : <p className="pf-muted">Loading…</p>}</>}
        {mode === 'signup' && <Field label="Your name"><input className="pf-input" value={f.name} onChange={set('name')} autoComplete="name" required /></Field>}
        {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && <Field label="Email"><input className="pf-input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required autoFocus /></Field>}
        {(mode === 'reset' || mode === 'verify' || mode === 'enroll') && <Field label={mode === 'reset' ? 'Code' : '6-digit code'}><input className="pf-input" inputMode="numeric" maxLength={6} value={f.code} onChange={set('code')} autoComplete="one-time-code" required autoFocus /></Field>}
        {(mode === 'signin' || mode === 'signup' || mode === 'reset') && <Field label={mode === 'reset' ? 'New password' : 'Password'} hint={mode === 'signin' ? undefined : 'At least 10 characters'}>
          <input className="pf-input" type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required /></Field>}
        {mode === 'signup' && <div className="pf-row2">
          <Field label="I am a"><select className="pf-input" value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="School or college"><input className="pf-input" value={f.school} onChange={set('school')} /></Field>
        </div>}
        {err && <div className="pf-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
        <button className="pf-btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset', reset: 'Set password and sign in', verify: 'Verify', enroll: 'Turn on and continue' }[mode]}</button>
        <div className="pf-auth-foot">
          {mode === 'signin' && <button type="button" className="pf-btn link" onClick={() => setMode('forgot')}>Forgot password?</button>}
          {(mode === 'forgot' || mode === 'reset') && <button type="button" className="pf-btn link" onClick={() => setMode('signin')}>Back to sign in</button>}
        </div>
        {mode === 'signin' && <p className="pf-small pf-muted" style={{ textAlign: 'center', margin: '6px 0 0' }}>One sign-in for delegates, advisors, chairs and organiser teams. Running a conference? <Link to="/list">List it for free</Link></p>}
      </form>
    </div>
  );
}

/** The single sign-in page, at /login and /account (when signed out). */
export function SignInPage() {
  const me = usePerson();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const next = sp.get('next');
  useEffect(() => { if (me?.person) nav(next && next.startsWith('/') && !next.startsWith('/app') && !next.startsWith('/login') ? next : '/account'); }, [me?.person]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <PlatformShell>
      <div className="pf-auth-wrap">
        <div className="pf-auth-copy">
          <div className="pf-eyebrow">Your DelegateDesk account</div>
          <h1 className="pf-h1 left" style={{ fontSize: 40, marginTop: 10 }}>Every conference and every brief, in one place.</h1>
          <ul className="pf-ticks">
            <li><CheckCircle2 className="icon" />Delegates, advisors and chairs: every registration, from every organiser</li>
            <li><CheckCircle2 className="icon" />Research projects, position papers, speeches and the MUN Masterclass</li>
            <li><CheckCircle2 className="icon" />Organisers and conference teams: your dashboard, with the same sign-in</li>
            <li><CheckCircle2 className="icon" />Two-factor protection for anyone who handles money or settings</li>
          </ul>
        </div>
        <AuthCard start={sp.get('mode') === 'signup' ? 'signup' : 'signin'} next={next} />
      </div>
    </PlatformShell>
  );
}

export function AccountPage() {
  const me = usePerson();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const next = sp.get('next');
  useEffect(() => { if (me?.person && next) nav(next); }, [me?.person, next]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me) return <PlatformShell><div className="pf-empty">Loading…</div></PlatformShell>;
  if (!me.person) return <SignInPage />;
  return <AccountHome me={me} />;
}

function AccountHome({ me }: { me: { person: any; conferences?: any[] } }) {
  const p = me.person;
  const [code, setCode] = useState('');
  const [dev, setDev] = useState<string | null>(() => { try { return sessionStorage.getItem('dd-devcode'); } catch { return null; } });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prof, setProf] = useState({ name: p.name, school: p.school ?? '', city: p.city ?? '', role: p.role });
  const [pw, setPw] = useState({ current: '', next: '' });
  const go = async (fn: () => Promise<void>, ok?: string) => { setErr(null); setMsg(null); try { await fn(); if (ok) setMsg(ok); } catch (e: any) { setErr(e.message); } };
  const confs = me.conferences ?? [];
  return (
    <PlatformShell>
      <div className="pf-pagehead">
        <div><div className="pf-eyebrow">My account</div><h1 className="pf-h1 left" style={{ fontSize: 36, marginTop: 8 }}>Hello, {p.name.split(' ')[0]}</h1>
          <p className="pf-sub left">{p.email} · {ROLE_LABEL[p.role] ?? 'Delegate'}{p.school ? ` · ${p.school}` : ''}</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link className="pf-btn primary" to="/prep"><ArrowRight className="icon" />Open Prep</Link>
          <button className="pf-btn ghost" onClick={async () => { await api.post('/api/me/logout'); refreshMe(); }}><LogOut className="icon" />Sign out</button>
        </div>
      </div>
      {msg && <div className="pf-note green" style={{ marginTop: 14 }}><CheckCircle2 className="icon" /><span>{msg}</span></div>}
      {err && <div className="pf-note" style={{ marginTop: 14, background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><span>{err}</span></div>}
      {!p.verified && (
        <div className="pf-card pad pf-verify" style={{ marginTop: 18 }}>
          <Mail className="icon" />
          <div style={{ flex: 1, minWidth: 220 }}><b>Confirm your email to see your conferences</b><div className="pf-small pf-muted">We sent a 6-digit code to {p.email}. Your registrations show up once we know the address is yours.</div></div>
          <input className="pf-input" style={{ maxWidth: 150, minHeight: 44 }} inputMode="numeric" maxLength={6} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Verification code" />
          <button className="pf-btn primary sm" onClick={() => go(async () => { await api.post('/api/me/verify', { code }); try { sessionStorage.removeItem('dd-devcode'); } catch { /* ignore */ } refreshMe(); }, 'Email confirmed.')}>Confirm</button>
          <button className="pf-btn link" onClick={() => go(async () => { const r = await api.post<any>('/api/me/verify/resend'); setDev(r.devCode ?? null); }, 'A new code is on its way.')}>Send again</button>
          {dev && <div className="pf-small" style={{ flexBasis: '100%' }}>Email isn’t set up on this server yet, so here is your code: <b>{dev}</b></div>}
          {!dev && (me as any).mail === false && <div className="pf-small" style={{ flexBasis: '100%', color: 'var(--pf-red)' }}>This site can’t send emails yet, so the code can’t reach you. The site owner needs to set up email (see <a href="/setup">/setup</a>).</div>}
        </div>
      )}
      <section className="pf-section">
        <h2>My conferences</h2>
        {!confs.length ? <div className="pf-card pad pf-muted">{p.verified ? <>Nothing yet. Registrations and applications you make with {p.email} appear here. <Link to="/explore">Find a conference</Link></> : 'Confirm your email above first.'}</div>
          : <div className="pf-mine">{confs.map((c, i) => {
            const [l, tone] = STATUS[c.status] ?? [c.status, ''];
            return <Link key={i} to={c.link} className="pf-mine-row">
              <span className="pf-mine-ic"><Calendar className="icon" /></span>
              <span style={{ flex: 1, minWidth: 0 }}><b>{c.event}</b><span className="pf-small pf-muted">{c.kind === 'delegate' ? `${c.portfolio ? `${c.portfolio} · ${c.committee}` : 'Delegate'}${c.ref ? ` · ${c.ref}` : ''}` : `${ROLE_LABEL[c.kind] ?? c.kind[0].toUpperCase() + c.kind.slice(1)}${c.title ? ` · ${c.title}` : ''}`} · {fmtDate(c.start)}</span></span>
              <span className={`pf-tag ${tone}`}>{l}</span><ArrowRight className="icon" style={{ color: 'var(--pf-ink-3)' }} />
            </Link>;
          })}</div>}
      </section>
      <SavedAndCv />
      <div className="pf-two">
        <section className="pf-card pad">
          <h2 className="pf-h2" style={{ fontSize: 18, marginBottom: 14 }}><UserRound className="icon" style={{ width: 18, height: 18, verticalAlign: -3 }} /> Profile</h2>
          <Field label="Name"><input className="pf-input" value={prof.name} onChange={(e) => setProf({ ...prof, name: e.target.value })} /></Field>
          <div className="pf-row2"><Field label="School or college"><input className="pf-input" value={prof.school} onChange={(e) => setProf({ ...prof, school: e.target.value })} /></Field>
            <Field label="City"><input className="pf-input" value={prof.city} onChange={(e) => setProf({ ...prof, city: e.target.value })} /></Field></div>
          <Field label="I am a"><select className="pf-input" value={prof.role} onChange={(e) => setProf({ ...prof, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <button className="pf-btn primary sm" onClick={() => go(async () => { await api.patch('/api/me', prof); refreshMe(); }, 'Profile saved.')}>Save profile</button>
          <hr className="pf-hr" />
          <SocialLinks onDone={(m) => setMsg(m)} onError={(m) => setErr(m)} />
        </section>
        <section className="pf-card pad">
          <h2 className="pf-h2" style={{ fontSize: 18, marginBottom: 14 }}><KeyRound className="icon" style={{ width: 18, height: 18, verticalAlign: -3 }} /> Password</h2>
          <Field label="Current password"><input className="pf-input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 10 characters"><input className="pf-input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <button className="pf-btn primary sm" onClick={() => go(async () => { await api.post('/api/me/password', pw); setPw({ current: '', next: '' }); }, 'Password changed.')}>Change password</button>
          <hr className="pf-hr" />
          <button className="pf-btn danger sm" onClick={() => { const pass = prompt('Delete your account and all your Prep work? Your conference registrations stay with the organisers. Enter your password to confirm.'); if (pass) go(async () => { await api.post('/api/me/delete', { password: pass }); refreshMe(); }); }}><Trash2 className="icon" />Delete my account</button>
        </section>
      </div>
    </PlatformShell>
  );
}

/** Staff: set a password from an invitation or reset link. */
export function SetPasswordPage({ kind }: { kind: 'invite' | 'reset' }) {
  const { token = '' } = useParams();
  const nav = useNavigate();
  const [info, setInfo] = useState<{ name: string; email: string; org: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  useEffect(() => { api.get<any>(`/api/auth/link/${token}`).then((i) => { setInfo(i); setName(i.name); }).catch((e) => setErr(e.message)); }, [token]);
  return (
    <PlatformShell>
      <div className="pf-narrow" style={{ maxWidth: 460 }}>
        <div className="pf-card pad">
          <div className="pf-eyebrow">{kind === 'invite' ? 'Join the team' : 'Reset password'}</div>
          <h1 className="pf-h2" style={{ fontSize: 26, margin: '8px 0 6px' }}>{kind === 'invite' ? (info ? `Join ${info.org}` : 'Your invitation') : 'Choose a new password'}</h1>
          {info && <p className="pf-muted pf-small" style={{ marginTop: 0 }}>For {info.email}</p>}
          {!info && err ? <><div className="pf-err">{err}</div><p className="pf-small"><Link to="/login">Go to sign-in</Link></p></> : (
            <form onSubmit={async (e) => {
              e.preventDefault(); setErr(null);
              if (pw !== pw2) { setErr('The two passwords are different'); return; }
              try { const r = await api.post<any>(`/api/auth/link/${token}`, { password: pw, name }); nav(r.mfa ? '/login' : '/app'); } catch (x: any) { setErr(x.message); }
            }}>
              {kind === 'invite' && <Field label="Your name"><input className="pf-input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>}
              <Field label="Password" hint="At least 10 characters"><input className="pf-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
              <Field label="Type it again"><input className="pf-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></Field>
              {err && <div className="pf-err" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="pf-btn primary" style={{ width: '100%' }}>{kind === 'invite' ? 'Set password and open the dashboard' : 'Save and sign in'}</button>
            </form>
          )}
        </div>
      </div>
    </PlatformShell>
  );
}

/** Conferences the person saved, and the way into their MUN CV. */
function SavedAndCv() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { api.get<any[]>('/api/me/saved').then(setList).catch(() => setList([])); }, []);
  return (
    <div className="pf-two" style={{ marginBottom: 18 }}>
      <section className="pf-card pad">
        <h2 className="pf-h2" style={{ fontSize: 18, marginBottom: 10 }}><Bookmark className="icon" style={{ width: 18, height: 18, verticalAlign: -3 }} /> Saved conferences</h2>
        {!list ? <p className="pf-muted pf-small">Loading…</p> : !list.length ? <p className="pf-muted pf-small" style={{ margin: 0 }}>Press <b>Save</b> on any conference page to keep it here. <Link to="/explore">Explore conferences</Link></p>
          : <div className="pf-saved">{list.map((c) => <Link key={c.slug} to={`/c/${c.slug}`} className="pf-saved-row">
            <span className="pf-mine-ic">{c.logo ? <img src={c.logo} alt="" /> : <Calendar className="icon" />}</span>
            <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b><span className="pf-small pf-muted">{[c.city, fmtDate(c.start_date)].filter(Boolean).join(' · ')}</span></span>
            <button className="pf-btn link" aria-label={`Remove ${c.name} from saved`} onClick={async (e) => { e.preventDefault(); await api.post('/api/me/saved', { slug: c.slug, on: false }); setList(list.filter((x) => x.slug !== c.slug)); }}><Trash2 className="icon" /></button>
          </Link>)}</div>}
      </section>
      <section className="pf-card pad pf-cv-card">
        <h2 className="pf-h2" style={{ fontSize: 18, marginBottom: 6 }}><FileText className="icon" style={{ width: 18, height: 18, verticalAlign: -3 }} /> Your MUN CV</h2>
        <p className="pf-muted pf-small" style={{ margin: '0 0 12px' }}>Your conferences on DelegateDesk, awards and portfolios fill in by themselves. Add your other MUNs, chairing and debates, then print it or save it as a PDF for school, college or EB applications.</p>
        <Link className="pf-btn primary sm" to="/account/cv">Open my MUN CV</Link>
      </section>
    </div>
  );
}

/** Social links and a short bio, shown on the MUN CV. */
function SocialLinks({ onDone, onError }: { onDone: (m: string) => void; onError: (m: string) => void }) {
  const [f, setF] = useState<any>(null);
  useEffect(() => { api.get<any>('/api/me/cv').then((d) => setF({ socials: { linkedin: '', instagram: '', x: '', website: '', ...d.socials }, bio: d.bio ?? '', headline: d.headline ?? '' })).catch(() => setF({ socials: {}, bio: '', headline: '' })); }, []);
  if (!f) return null;
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, socials: { ...f.socials, [k]: e.target.value } });
  return <>
    <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Social links and bio</h3>
    <Field label="Headline" hint="one line, e.g. 'Delegate · 6 MUNs · Best Delegate at DPSMUN'"><input className="pf-input" maxLength={120} value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} /></Field>
    <div className="pf-row2">
      <Field label="LinkedIn"><input className="pf-input" placeholder="linkedin.com/in/you" value={f.socials.linkedin ?? ''} onChange={s('linkedin')} /></Field>
      <Field label="Instagram"><input className="pf-input" placeholder="@you" value={f.socials.instagram ?? ''} onChange={s('instagram')} /></Field>
    </div>
    <div className="pf-row2">
      <Field label="X (Twitter)"><input className="pf-input" placeholder="@you" value={f.socials.x ?? ''} onChange={s('x')} /></Field>
      <Field label="Website"><input className="pf-input" placeholder="yoursite.com" value={f.socials.website ?? ''} onChange={s('website')} /></Field>
    </div>
    <Field label="Short bio" hint="up to 600 characters"><textarea className="pf-input" rows={3} maxLength={600} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></Field>
    <button className="pf-btn ghost sm" onClick={async () => { try { const r = await api.post<any>('/api/me/profile-extras', f); setF({ ...f, socials: { linkedin: '', instagram: '', x: '', website: '', ...r.socials } }); onDone('Links saved.'); } catch (e: any) { onError(e.message); } }}>Save links</button>
  </>;
}
