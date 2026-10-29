import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { DASHBOARD_TOUR, Tour, tourSeen } from './Tour';
import { Alert, Btn, Field, Loading, useAsync, applyTheme, savedTheme, type Theme } from '../ui';
import {
  LayoutDashboard, Users, ListChecks, Landmark, ScanLine, Mail, Upload, ReceiptText, CreditCard, Handshake, Wallet, BookOpen, Settings,
  ShieldCheck, UserRound, LogOut, Menu, Moon, Sun, Monitor, Sparkles, X, SendHorizontal, TrendingUp, Inbox, FileText, Radio, Banknote, Image, Briefcase, Plus, Globe2, CircleHelp, GraduationCap, type LucideIcon,
} from 'lucide-react';

export interface Me {
  user: { id: string; name: string; email: string; totp: boolean } | null;
  roles: { role: string; label: string; committee_id: string | null }[];
  perms: string[]; mfaPending: boolean; mfaEnrolled: boolean;
  events: { id: string; code: string; name: string; status: string }[];
}
interface Ctx { me: Me; can: (...p: string[]) => boolean; eventId: string; setEventId: (id: string) => void; reloadMe: () => void; event?: Me['events'][number] }
const StaffCtx = createContext<Ctx>(null as any);
export const useStaff = () => useContext(StaffCtx);

export function StaffGate({ children }: { children: React.ReactNode }) {
  const me = useAsync<Me>(() => api.get('/api/auth/me'), []);
  const loc = useLocation();
  const [eventId, setEventIdState] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('event');
    try { if (fromUrl) localStorage.setItem('dd-event', fromUrl); return fromUrl ?? localStorage.getItem('dd-event') ?? ''; } catch { return fromUrl ?? ''; }
  });
  useEffect(() => {
    const h = () => me.reload();
    window.addEventListener('dd:unauthorised', h);
    return () => window.removeEventListener('dd:unauthorised', h);
  }, [me]);
  if (me.loading && !me.data) return <Loading />;
  const m = me.data;
  if (!m?.user || m.mfaPending) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  const ev = m.events.find((e) => e.id === eventId) ?? m.events[0];
  const setEventId = (id: string) => { setEventIdState(id); try { localStorage.setItem('dd-event', id); } catch { /* ignore */ } };
  return (
    <StaffCtx.Provider value={{ me: m, can: (...p) => p.some((x) => m.perms.includes(x)), eventId: ev?.id ?? '', event: ev, setEventId, reloadMe: me.reload }}>
      <Shell>{children}</Shell>
    </StaffCtx.Provider>
  );
}

const NAV: { group: string; items: { to: string; label: string; perms: string[]; icon: LucideIcon }[] }[] = [
  { group: 'Overview', items: [
    { to: '/app/overview', label: 'Dashboard', perms: ['event.config', 'reg.read', 'dashboard.read'], icon: LayoutDashboard },
  ] },
  { group: 'Manage', items: [
    { to: '/app/applications', label: 'Applications', perms: ['reg.read'], icon: Inbox },
    { to: '/app/registrations', label: 'Delegates', perms: ['reg.read'], icon: Users },
    { to: '/app/allocation', label: 'Committees', perms: ['reg.read', 'alloc.config'], icon: Landmark },
    { to: '/app/documents', label: 'Documents', perms: ['alloc.config', 'lists.read'], icon: FileText },
    { to: '/app/sessions', label: 'Live sessions', perms: ['lists.read', 'attendance.mark'], icon: Radio },
    { to: '/app/lists', label: 'Lists', perms: ['lists.read'], icon: ListChecks },
    { to: '/app/checkin', label: 'Check-in', perms: ['attendance.mark'], icon: ScanLine },
  ] },
  { group: 'Communicate', items: [
    { to: '/app/messages', label: 'Communications', perms: ['messages.read', 'templates.manage'], icon: Mail },
  ] },
  { group: 'Money', items: [
    { to: '/app/dashboard', label: 'Finance overview', perms: ['dashboard.read'], icon: TrendingUp },
    { to: '/app/financials', label: 'Financials', perms: ['event.config', 'settings.finance', 'payments.read'], icon: Banknote },
    { to: '/app/payments/review', label: 'Payment proofs', perms: ['payments.read'], icon: ReceiptText },
    { to: '/app/payments', label: 'Payments & refunds', perms: ['payments.read', 'refund.read'], icon: CreditCard },
    { to: '/app/referrals', label: 'Referrals', perms: ['commission.read', 'referral.link'], icon: Handshake },
    { to: '/app/expenses', label: 'Expenses', perms: ['expense.read', 'expense.create'], icon: Wallet },
    { to: '/app/books', label: 'Books', perms: ['books.read'], icon: BookOpen },
  ] },
  { group: 'Settings', items: [
    { to: '/app/conference', label: 'Conference page', perms: ['event.config'], icon: Image },
    { to: '/app/jobs', label: 'Job Board', perms: ['event.config'], icon: Briefcase },
    { to: '/app/settings', label: 'Settings', perms: ['event.config', 'settings.org', 'settings.finance', 'users.manage'], icon: Settings },
    { to: '/app/imports', label: 'Import', perms: ['import.registrations', 'finance.import', 'alloc.config', 'referrer.manage'], icon: Upload },
    { to: '/app/audit', label: 'Audit trail', perms: ['audit.read'], icon: ShieldCheck },
  ] },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

function Shell({ children }: { children: React.ReactNode }) {
  const { me, can, eventId, setEventId } = useStaff();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(savedTheme());
  const [assistant, setAssistant] = useState(false);
  const [tour, setTour] = useState(false);
  const ai = useAsync<{ enabled: boolean }>(() => api.get('/api/admin/ai/status'), []);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  // First visit to the dashboard: offer the tour once (organisers with set-up rights).
  useEffect(() => { if (loc.pathname === '/app/overview' && can('event.config') && me.events.length && !tourSeen(me.user!.id) && window.innerWidth > 900) { const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  const cycleTheme = () => { const t: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'; setTheme(t); applyTheme(t); };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="logo">D</span>DelegateDesk</div>
        {me.events.length > 0 && (
          <div className="event-switch" data-tour="switch">
            <select aria-label="Conference" value={eventId} onChange={(e) => (e.target.value === '__new' ? nav('/list') : setEventId(e.target.value))}>
              {me.events.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
              {can('event.config') && <option value="__new">+ New conference…</option>}
            </select>
          </div>
        )}
        {!me.events.length && can('event.config') && <NavLink to="/list" className="btn sm primary" style={{ margin: '0 .4rem .5rem' }}><Plus className="icon" />List a conference</NavLink>}
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(...i.perms));
          if (!items.length) return null;
          return <React.Fragment key={g.group}><div className="group" data-tour={`nav-${g.group.toLowerCase()}`}>{g.group}</div>{items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/app/payments'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><i.icon className="icon" aria-hidden />{i.label}</NavLink>)}</React.Fragment>;
        })}
        <span className="spacer" />
        <div className="side-promo"><b>Prep Studio for delegates</b><p>Free research, writing, practice and the full MUN Masterclass for everyone at your conference.</p><a href="/prep/learn" target="_blank" rel="noreferrer"><GraduationCap className="icon" />Open Prep</a></div>
        <div className="user-box">
          <span className="avatar" aria-hidden>{initials(me.user!.name)}</span>
          <div className="who"><div style={{ fontWeight: 600 }}>{me.user!.name}</div><div className="small faint">{me.roles.map((r) => r.label).join(', ')}</div></div>
        </div>
        <div className="row" style={{ padding: '.4rem .4rem 0', gap: '.3rem' }}>
          <NavLink to="/app/account" className="btn sm ghost"><UserRound className="icon" />Account</NavLink>
          <a href="/" className="btn sm ghost icon-only" title="Explore conferences" aria-label="Explore conferences"><Globe2 className="icon" /></a>
          <button className="btn sm ghost icon-only" onClick={cycleTheme} title={`Theme: ${theme}`} aria-label={`Theme: ${theme}`}><ThemeIcon className="icon" /></button>
          {can('event.config') && <button className="btn sm ghost icon-only" data-tour="help" onClick={() => { if (loc.pathname !== '/app/overview') nav('/app/overview'); setTour(true); }} title="Take the tour" aria-label="Take the tour"><CircleHelp className="icon" /></button>}
          <span className="spacer" />
          <button className="btn sm ghost" onClick={async () => { await api.post('/api/auth/logout'); nav('/login'); }}><LogOut className="icon" />Sign out</button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar"><button className="btn sm icon-only" onClick={() => setOpen(!open)} aria-label="Menu"><Menu className="icon" /></button><strong>DelegateDesk</strong></div>
        <main className="main">{children}</main>
      </div>
      {ai.data?.enabled && eventId && !assistant && <button className="btn primary fab no-print" onClick={() => setAssistant(true)}><Sparkles className="icon" />Ask</button>}
      {assistant && <Assistant eventId={eventId} onClose={() => setAssistant(false)} />}
      {tour && <Tour steps={DASHBOARD_TOUR} who={me.user!.id} onClose={() => setTour(false)} />}
    </div>
  );
}

/** Read-only assistant: answers from data this user is already allowed to see. */
function Assistant({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string; tools?: string[] }[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = React.useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: 'user', content: question }]); setQ(''); setBusy(true);
    try { const r = await api.post<any>(`/api/admin/events/${eventId}/ai/ask`, { question, history }); setMsgs((m) => [...m, { role: 'assistant', content: r.answer, tools: r.toolsUsed }]); }
    catch (e: any) { setMsgs((m) => [...m, { role: 'assistant', content: `Sorry — ${e.message}` }]); }
    finally { setBusy(false); }
  }
  const ideas = ['How far are we from break-even?', 'Which payment proofs have waited longest?', 'How many unpaid delegates are in UNSC?', 'Which referrer has brought the most paid delegates?'];
  return (
    <aside className="drawer" aria-label="Assistant">
      <header><Sparkles className="icon" style={{ color: 'var(--accent)' }} /><h2>Assistant</h2><span className="spacer" /><button className="btn ghost sm icon-only" onClick={onClose} aria-label="Close"><X className="icon" /></button></header>
      <div className="body">
        {!msgs.length && <>
          <p className="muted small" style={{ margin: 0 }}>Ask about registrations, payments, commission, expenses or the books. It reads only what your role can see, and it can't change anything.</p>
          <div className="stack tight">{ideas.map((i) => <button key={i} className="btn sm" style={{ justifyContent: 'flex-start', whiteSpace: 'normal', textAlign: 'left' }} onClick={() => send(i)}>{i}</button>)}</div>
        </>}
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'ai'}`}>{m.content}{m.tools?.length ? <div className="small faint" style={{ marginTop: '.35rem' }}>Looked at: {m.tools.map((t) => t.replace(/_/g, ' ')).join(', ')}</div> : null}</div>)}
        {busy && <div className="bubble ai"><span className="faint">Looking it up…</span></div>}
        <div ref={end} />
      </div>
      <footer><form className="row" onSubmit={(e) => { e.preventDefault(); send(q); }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question" style={{ flex: 1 }} aria-label="Question" autoFocus /><button className="btn primary icon-only" disabled={busy || !q.trim()} aria-label="Send"><SendHorizontal className="icon" /></button></form></footer>
    </aside>
  );
}

export function PageHead({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="topbar"><div style={{ minWidth: 0 }}><h1>{title}</h1>{subtitle && <p className="subtitle">{subtitle}</p>}</div>{children && <div className="actions">{children}</div>}</div>;
}

export function Login() {
  const nav = useNavigate();
  const next = new URLSearchParams(window.location.search).get('next') || '/app';
  const [step, setStep] = useState<'password' | 'verify' | 'enroll' | 'forgot' | 'sent'>('password');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<Me>('/api/auth/me').then((m) => { if (m.user && m.mfaPending) setStep(m.mfaEnrolled ? 'verify' : 'enroll'); else if (m.user) nav(next); }).catch(() => {}); }, []); // eslint-disable-line
  useEffect(() => { if (step === 'enroll' && !enroll) api.post<any>('/api/auth/mfa/enroll').then(setEnroll).catch((e) => setError(e.message)); }, [step, enroll]);
  async function go(fn: () => Promise<void>) { setError(null); try { await fn(); } catch (e: any) { setError(e.message); } }
  return (
    <div className="public"><div className="public-head"><div className="inner"><div className="eyebrow">Organisers &amp; conference teams</div><h1>Sign in to DelegateDesk</h1><p>Manage applications, payments, committees and sessions.</p></div></div>
      <div className="public-body" style={{ maxWidth: 440 }}>
        <div className="card stack">
          {error && <Alert tone="bad">{error}</Alert>}
          {step === 'password' && <form className="stack" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await api.post<any>('/api/auth/login', { email, password }); if (r.mfa) setStep(r.mfa); else nav(next); }); }}>
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn primary lg">Sign in</button>
            <div className="row between small"><button type="button" className="btn ghost sm" onClick={() => { setError(null); setStep('forgot'); }}>Forgot password?</button><a href="/account">Delegate, advisor or chair? Sign in here</a></div>
          </form>}
          {step === 'forgot' && <form className="stack" onSubmit={(e) => { e.preventDefault(); go(async () => { await api.post('/api/auth/forgot', { email }); setStep('sent'); }); }}>
            <h3>Reset your password</h3><p className="muted small">Enter your work email. If it has an account, we email a link to choose a new password.</p>
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <button className="btn primary lg">Email me a link</button>
            <button type="button" className="btn ghost" onClick={() => setStep('password')}>Back to sign in</button>
          </form>}
          {step === 'sent' && <div className="stack"><h3>Check your email</h3><p className="muted small">If {email} has an account, a reset link is on its way. It works once and expires in an hour.</p><button className="btn" onClick={() => setStep('password')}>Back to sign in</button></div>}
          {step === 'password' && <div className="row between small" style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}><span>Running a conference? <a href="/list">List it for free</a></span><a href="/">Explore conferences</a></div>}
          {step === 'verify' && <form className="stack" onSubmit={(e) => { e.preventDefault(); go(async () => { await api.post('/api/auth/mfa/verify', { code }); nav(next); }); }}>
            <h3>Two-factor verification</h3><p className="muted small">Enter the 6-digit code from your authenticator app.</p>
            <Field label="Code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></Field>
            <button className="btn primary lg">Verify</button>
          </form>}
          {step === 'enroll' && <form className="stack" onSubmit={(e) => { e.preventDefault(); go(async () => { await api.post('/api/auth/mfa/confirm', { code }); nav(next); }); }}>
            <h3>Set up two-factor sign-in</h3>
            <p className="muted small">Your role moves money, so two-factor sign-in is mandatory. Scan this with Google Authenticator, Microsoft Authenticator or similar, then enter the code.</p>
            {enroll ? <div style={{ textAlign: 'center' }}><img src={enroll.qr} width={200} height={200} alt="Authenticator QR code" style={{ background: '#fff', padding: 6, borderRadius: 8 }} /><div className="small mono" style={{ wordBreak: 'break-all' }}>{enroll.secret}</div></div> : <Loading />}
            <Field label="6-digit code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            <button className="btn primary lg">Turn on and continue</button>
          </form>}
        </div>
      </div>
    </div>
  );
}

export function Account() {
  const { me } = useStaff();
  const [cur, setCur] = useState(''); const [nxt, setNxt] = useState(''); const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <PageHead title="My account" subtitle="Your sign-in details and password." />
      <div className="card stack">
        <dl className="kv"><dt>Name</dt><dd>{me.user!.name}</dd><dt>Email</dt><dd>{me.user!.email}</dd><dt>Roles</dt><dd>{me.roles.map((r) => r.label).join(', ')}</dd><dt>Two-factor</dt><dd>{me.user!.totp ? 'On' : 'Off'}</dd></dl>
      </div>
      <div className="card stack"><h3>Change password</h3>
        {msg && <Alert tone="good">{msg}</Alert>}
        <Field label="Current password"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" hint="at least 10 characters"><input type="password" value={nxt} onChange={(e) => setNxt(e.target.value)} autoComplete="new-password" /></Field>
        <div><Btn kind="primary" onClick={async () => { await api.post('/api/auth/password', { current: cur, next: nxt }); setMsg('Password changed. Other sessions were signed out.'); setCur(''); setNxt(''); }}>Change password</Btn></div>
      </div>
    </div>
  );
}

export function Home() {
  const { can, me } = useStaff();
  if (can('event.config') || can('reg.read') || can('dashboard.read')) return <Navigate to="/app/overview" replace />;
  if (can('dashboard.read')) return <Navigate to="/app/dashboard" replace />;
  if (can('reg.read')) return <Navigate to="/app/registrations" replace />;
  if (can('lists.read')) return <Navigate to="/app/lists" replace />;
  if (can('expense.create')) return <Navigate to="/app/expenses" replace />;
  return <div className="card">Welcome, {me.user!.name}. Your role has no screens here yet.</div>;
}
