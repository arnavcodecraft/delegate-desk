import React, { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { api } from '../api';

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

/** The public frame: a white top bar, then the page. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const person = usePerson();
  useEffect(() => { document.body.classList.add('pf-body'); return () => document.body.classList.remove('pf-body'); }, []);
  const signedIn = !!me?.user && !me.mfaPending;
  return (
    <div className="pf">
      <header className="pf-top">
        <nav className="pf-nav" aria-label="Main">
          <Link to="/" className="brand"><span className="mark">D</span><span>DelegateDesk</span></Link>
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/jobs">Job Board</NavLink>
          <NavLink to="/prep">Prep</NavLink>
          <NavLink to="/services" className="hide-sm">Services</NavLink>
          <NavLink to="/session" className="hide-sm">Live session</NavLink>
          <span className="spacer" />
          {person?.person ? <NavLink to="/account" className="ghost-cta"><span className="pf-avatar">{person.person.name.slice(0, 1).toUpperCase()}</span><span className="hide-sm">My account</span></NavLink>
            : !signedIn && <><NavLink to="/login" className="hide-sm">Sign in</NavLink><NavLink to="/login" className="show-sm" aria-label="Sign in"><UserRound className="icon" style={{ width: 18, height: 18 }} /></NavLink></>}
          {signedIn ? <Link to="/app" className="cta">Dashboard</Link> : <Link to="/list" className="cta">List your conference</Link>}
        </nav>
      </header>
      <main className="pf-wrap">{children}</main>
      <footer className="pf-foot">
        <div><b>DelegateDesk</b><span>Run your conference. Prepare for committee.</span></div>
        <nav><Link to="/explore">Explore</Link><Link to="/prep">Prep</Link><Link to="/services">Services</Link><Link to="/list">List your conference</Link><Link to="/about">About</Link><Link to="/team">Team</Link><Link to="/contact">Contact</Link><Link to="/privacy">Privacy</Link></nav>
      </footer>
    </div>
  );
}

/** Ask every mounted page to re-read who is signed in (after creating an account). */
export const refreshMe = () => window.dispatchEvent(new Event('dd:me'));
