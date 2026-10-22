import React, { useEffect, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
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

/** The public platform frame: pill navigation like a conference directory, warm palette. */
export function PlatformShell({ children }: { children: React.ReactNode }) {
  const me = useMe();
  useEffect(() => { document.body.classList.add('pf-body'); return () => document.body.classList.remove('pf-body'); }, []);
  const signedIn = !!me?.user && !me.mfaPending;
  return (
    <div className="pf">
      <div className="pf-top">
        <nav className="pf-nav" aria-label="Main">
          <Link to="/" className="brand"><span className="mark">D</span><span>DelegateDesk</span></Link>
          <NavLink to="/session"><small>Start</small><span>Session</span></NavLink>
          <NavLink to="/list"><small>List your</small><span>Conference</span></NavLink>
          <NavLink to="/explore"><span>Explore</span></NavLink>
          <NavLink to="/jobs"><span>Job Board</span></NavLink>
          {signedIn ? <Link to="/app" className="cta"><span>Dashboard</span></Link> : <Link to="/login" className="cta"><span>Sign in</span></Link>}
        </nav>
      </div>
      <div className="pf-wrap">{children}</div>
    </div>
  );
}

/** Ask every mounted page to re-read who is signed in (after creating an account). */
export const refreshMe = () => window.dispatchEvent(new Event('dd:me'));
