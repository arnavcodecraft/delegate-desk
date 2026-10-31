import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BookOpen, Briefcase, ChevronDown, Compass, Gavel, GraduationCap, HeartHandshake, Info, LayoutDashboard, Mail, Menu, Plus, Settings, Smartphone, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { api } from '../api';
import { nativeApp, serverUrl } from '../native';

export interface PfMe { user: { name: string; email: string } | null; perms?: string[]; workspace?: { id: string; name: string }; mfaPending?: boolean }
let cached: PfMe | null = null;
/** Who is signed in (if anyone), shared by the public pages. */
export function useMe() {
  const [me, setMe] = useState<PfMe | null>(cached);
  useEffect(() => {
    const load = () => api.get<PfMe>('/api/auth/me').then((m) => { cached = m; setMe(m); }).catch(() => setMe({ user: null }));
    load();
    window.addEventListener('dd:me', load);
    return () => window.removeEventListener('dd:me', load);
  }, []);
  return me;
}

export interface Person { id: string; name: string; email: string; verified: boolean; school: string | null; city: string | null; role: string; prefs: Record<string, any> }
let personCache: { person: Person | null; conferences?: any[] } | null = null;
/** The signed-in participant (delegate, advisor, chair), if any. */
export function usePerson() {
  const [p, setP] = useState(personCache);
  useEffect(() => {
    const load = () => api.get<{ person: Person | null; conferences?: any[] }>('/api/me').then((m) => { personCache = m; setP(m); }).catch(() => setP({ person: null }));
    load();
    window.addEventListener('dd:me', load);
    return () => window.removeEventListener('dd:me', load);
  }, []);
  return p;
}

type MenuItem = { to: string; icon: LucideIcon; t: string; d: string };
const MENUS: { key: string; label: string; items: MenuItem[]; foot?: { to: string; t: string } }[] = [
  { key: 'product', label: 'Product', items: [
    { to: '/list', icon: LayoutDashboard, t: 'Organiser dashboard', d: 'Applications, allotment, payments and emails' },
    { to: '/session', icon: Gavel, t: 'Live committee room', d: 'Roll call, speakers, motions, voting and scores' },
    { to: '/prep', icon: GraduationCap, t: 'Prep studio', d: 'Research, papers, speeches and practice' },
    { to: '/prep/learn', icon: BookOpen, t: 'MUN Masterclass', d: 'The complete course, free for everyone' },
    { to: '/get-the-app', icon: Smartphone, t: 'Apps', d: 'Android, Windows, Mac, Linux and the web' },
  ], foot: { to: '/#features', t: 'See every feature' } },
  { key: 'conferences', label: 'Conferences', items: [
    { to: '/explore', icon: Compass, t: 'Explore conferences', d: 'Find and apply to conferences near you' },
    { to: '/jobs', icon: Briefcase, t: 'Job Board', d: 'Chair, press and secretariat roles' },
    { to: '/list', icon: Plus, t: 'List your conference', d: 'Free, live in about ten minutes' },
  ] },
  { key: 'company', label: 'Company', items: [
    { to: '/services', icon: HeartHandshake, t: 'Services', d: 'Mentorship, classes, logistics, EB, legal and finance' },
    { to: '/about', icon: Info, t: 'About', d: 'Why we are building DelegateDesk' },
    { to: '/team', icon: Users, t: 'Team', d: 'The people behind it' },
    { to: '/contact', icon: Mail, t: 'Contact', d: 'Questions, partnerships and support' },
  ] },
];

/** The public frame: the top bar with menus, the page, and the footer. `bare` lets a page run full width (the home page). */
export function PlatformShell({ children, bare, dark }: { children: React.ReactNode; bare?: boolean; dark?: boolean }) {
  const me = useMe();
  const person = usePerson();
  const loc = useLocation();
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  // Over a dark hero the header is see-through with light text, and turns solid once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { if (!dark) return; const f = () => setScrolled(window.scrollY > 40); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, [dark]);
  useEffect(() => { document.body.classList.add('pf-body'); return () => document.body.classList.remove('pf-body'); }, []);
  useEffect(() => { setOpen(null); setDrawer(false); }, [loc.pathname, loc.hash]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); setDrawer(false); } };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, []);
  const signedIn = !!me?.user && !me.mfaPending;
  const account = person?.person ? <Link to="/account" className="sx-account"><span className="pf-avatar">{person.person.name.slice(0, 1).toUpperCase()}</span><span className="hide-sm">My account</span></Link>
    : !signedIn && <Link to="/login" className="sx-signin">Sign in</Link>;
  const cta = signedIn ? <Link to="/app" className="sx-cta">Dashboard</Link> : <Link to="/list" className="sx-cta">List your conference</Link>;
  return (
    <div className={`pf ${bare ? 'pf-bare' : ''}`}>
      <header className={`pf-top sx-top ${dark ? 'sx-dark' : ''} ${scrolled || drawer || open ? 'scrolled' : ''}`}>
        <nav className="sx-nav" aria-label="Main" ref={navRef}>
          <Link to="/" className="brand"><span className="mark">D</span><span>DelegateDesk</span></Link>
          <div className="sx-menus">
            {MENUS.map((m) => (
              <div key={m.key} className={`sx-menu ${open === m.key ? 'open' : ''}`} onMouseEnter={() => setOpen(m.key)} onMouseLeave={() => setOpen(null)}>
                <button type="button" aria-expanded={open === m.key} onClick={() => setOpen(open === m.key ? null : m.key)}>{m.label}<ChevronDown className="icon" /></button>
                <div className="sx-drop" role="menu">
                  <div className={`sx-drop-grid ${m.items.length > 3 ? 'two' : ''}`}>
                    {m.items.map((it) => <Link key={it.t} to={it.to} className="sx-item" role="menuitem"><span className="sx-ic"><it.icon className="icon" /></span><span><b>{it.t}</b><small>{it.d}</small></span></Link>)}
                  </div>
                  {m.foot && <Link to={m.foot.to} className="sx-drop-foot">{m.foot.t}<ArrowRight className="icon" /></Link>}
                </div>
              </div>
            ))}
            <NavLink to="/prep" className="sx-link">Prep</NavLink>
            <Link to="/#pricing" className="sx-link">Pricing</Link>
          </div>
          <span className="spacer" />
          {account}
          {cta}
          <button className="sx-burger" aria-label={drawer ? 'Close menu' : 'Open menu'} aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>{drawer ? <X className="icon" /> : <Menu className="icon" />}</button>
        </nav>
        {drawer && <div className="sx-drawer">
          {MENUS.map((m) => <div key={m.key} className="sx-drawer-group"><div className="sx-drawer-k">{m.label}</div>{m.items.map((it) => <Link key={it.t} to={it.to} className="sx-item"><span className="sx-ic"><it.icon className="icon" /></span><span><b>{it.t}</b><small>{it.d}</small></span></Link>)}</div>)}
          <div className="sx-drawer-group"><Link to="/#pricing" className="sx-item"><span className="sx-ic"><Wallet className="icon" /></span><span><b>Pricing</b><small>Free for organisers and delegates</small></span></Link></div>
          {nativeApp && <div className="sx-drawer-group"><Link to="/app-settings" className="sx-item"><span className="sx-ic"><Settings className="icon" /></span><span><b>App settings</b><small>{serverUrl() ? serverUrl().replace(/^https:\/\//, '') : 'Connect your DelegateDesk server'}</small></span></Link></div>}
          <div className="sx-drawer-cta">{!signedIn && !person?.person && <Link to="/login" className="pf-btn ghost">Sign in</Link>}{signedIn ? <Link to="/app" className="pf-btn primary">Dashboard</Link> : <Link to="/list" className="pf-btn primary">List your conference</Link>}</div>
        </div>}
      </header>
      <main className={bare ? 'sx-bare' : 'pf-wrap'}>{children}</main>
      <footer className="sx-foot">
        <div className="sx-foot-in">
          <div className="sx-foot-brand">
            <Link to="/" className="brand"><span className="mark">D</span><span>DelegateDesk</span></Link>
            <p>Run your conference. Prepare for committee. One account for organisers, delegates and chairs.</p>
            <Link to="/get-the-app" className="sx-foot-app"><Smartphone className="icon" />Get the app</Link>
          </div>
          {[
            ['Product', [['/list', 'Organiser dashboard'], ['/session', 'Live committee room'], ['/prep', 'Prep studio'], ['/prep/learn', 'MUN Masterclass'], ['/get-the-app', 'Apps']]],
            ['Conferences', [['/explore', 'Explore'], ['/jobs', 'Job Board'], ['/list', 'List your conference'], ['/login', 'Sign in']]],
            ['Company', [['/about', 'About'], ['/team', 'Team'], ['/services', 'Services'], ['/contact', 'Contact']]],
            ['Legal', [['/privacy', 'Privacy']]],
          ].map(([h, links]) => <nav key={h as string} aria-label={h as string}><b>{h as string}</b>{(links as string[][]).map(([to, l]) => <Link key={l} to={to}>{l}</Link>)}</nav>)}
        </div>
        <div className="sx-foot-bottom"><span>© {new Date().getFullYear()} DelegateDesk</span>{nativeApp ? <Link to="/app-settings">App settings</Link> : <span>Made for Model UN</span>}</div>
      </footer>
    </div>
  );
}

/** Ask every mounted page to re-read who is signed in (after creating an account). */
export const refreshMe = () => window.dispatchEvent(new Event('dd:me'));
