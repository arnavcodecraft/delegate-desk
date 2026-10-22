import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Alert, Btn, Field, Loading, useAsync } from '../ui';

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
  const [eventId, setEventIdState] = useState<string>(() => { try { return localStorage.getItem('dd-event') ?? ''; } catch { return ''; } });
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

const NAV: { group: string; items: { to: string; label: string; perms: string[] }[] }[] = [
  { group: 'Overview', items: [{ to: '/app/dashboard', label: 'Dashboard', perms: ['dashboard.read'] }] },
  { group: 'Registration', items: [
    { to: '/app/registrations', label: 'Delegates', perms: ['reg.read'] },
    { to: '/app/lists', label: 'Lists', perms: ['lists.read'] },
    { to: '/app/allocation', label: 'Committees & allotment', perms: ['reg.read', 'alloc.config'] },
    { to: '/app/messages', label: 'Messages', perms: ['messages.read', 'templates.manage'] },
    { to: '/app/imports', label: 'Import', perms: ['import.registrations', 'finance.import', 'alloc.config', 'referrer.manage'] },
  ] },
  { group: 'Money', items: [
    { to: '/app/payments/review', label: 'Payment proofs', perms: ['payments.read'] },
    { to: '/app/payments', label: 'Payments & refunds', perms: ['payments.read', 'refund.read'] },
    { to: '/app/referrals', label: 'Referrals & commission', perms: ['commission.read', 'referral.link'] },
    { to: '/app/expenses', label: 'Expenses', perms: ['expense.read', 'expense.create'] },
    { to: '/app/books', label: 'Books', perms: ['books.read'] },
  ] },
  { group: 'Admin', items: [
    { to: '/app/settings', label: 'Settings', perms: ['event.config', 'settings.org', 'settings.finance', 'users.manage'] },
    { to: '/app/audit', label: 'Audit trail', perms: ['audit.read'] },
  ] },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { me, can, eventId, setEventId } = useStaff();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="logo">D</span>DelegateDesk</div>
        {me.events.length > 0 && (
          <select aria-label="Event" value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ marginBottom: '.25rem' }}>
            {me.events.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
          </select>
        )}
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(...i.perms));
          if (!items.length) return null;
          return <React.Fragment key={g.group}><div className="group">{g.group}</div>{items.map((i) => <NavLink key={i.to} to={i.to} end={i.to === '/app/payments'} className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}>{i.label}</NavLink>)}</React.Fragment>;
        })}
        <span className="spacer" />
        <div className="small" style={{ padding: '.5rem .6rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600 }}>{me.user!.name}</div>
          <div className="faint">{me.roles.map((r) => r.label).join(', ')}</div>
          <div className="row" style={{ marginTop: '.4rem' }}>
            <NavLink to="/app/account" className="btn sm">Account</NavLink>
            <button className="btn sm" onClick={async () => { await api.post('/api/auth/logout'); nav('/login'); }}>Sign out</button>
          </div>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar"><button className="btn sm" onClick={() => setOpen(!open)} aria-label="Menu">☰</button><strong>DelegateDesk</strong></div>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}

export function PageHead({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return <div className="topbar"><h1>{title}</h1><span className="spacer" />{children}</div>;
}

export function Login() {
  const nav = useNavigate();
  const next = new URLSearchParams(window.location.search).get('next') || '/app';
  const [step, setStep] = useState<'password' | 'verify' | 'enroll'>('password');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState('');
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.get<Me>('/api/auth/me').then((m) => { if (m.user && m.mfaPending) setStep(m.mfaEnrolled ? 'verify' : 'enroll'); else if (m.user) nav(next); }).catch(() => {}); }, []); // eslint-disable-line
  useEffect(() => { if (step === 'enroll' && !enroll) api.post<any>('/api/auth/mfa/enroll').then(setEnroll).catch((e) => setError(e.message)); }, [step, enroll]);
  async function go(fn: () => Promise<void>) { setError(null); try { await fn(); } catch (e: any) { setError(e.message); } }
  return (
    <div className="public"><div className="public-head"><div className="inner"><h1>DelegateDesk</h1><p>Staff sign-in</p></div></div>
      <div className="public-body" style={{ maxWidth: 440 }}>
        <div className="card stack">
          {error && <Alert tone="bad">{error}</Alert>}
          {step === 'password' && <form className="stack" onSubmit={(e) => { e.preventDefault(); go(async () => { const r = await api.post<any>('/api/auth/login', { email, password }); if (r.mfa) setStep(r.mfa); else nav(next); }); }}>
            <Field label="Email"><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
            <button className="btn primary lg">Sign in</button>
            <p className="small faint" style={{ margin: 0 }}>Delegates don’t need an account — use the link in your registration email.</p>
          </form>}
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
      <PageHead title="My account" />
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
  if (can('dashboard.read')) return <Navigate to="/app/dashboard" replace />;
  if (can('reg.read')) return <Navigate to="/app/registrations" replace />;
  if (can('lists.read')) return <Navigate to="/app/lists" replace />;
  if (can('expense.create')) return <Navigate to="/app/expenses" replace />;
  return <div className="card">Welcome, {me.user!.name}. Your role has no screens here yet.</div>;
}
