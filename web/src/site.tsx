/**
 * What the site owner has switched on and off, and maintenance mode. Read once from /api/site and shared by every page;
 * the owner console fires `dd:site` after a change so the whole site updates straight away.
 */
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gavel, Power, Wrench } from 'lucide-react';
import { api } from './api';

export type Feature = 'signup' | 'explore' | 'jobs' | 'live' | 'chat' | 'accounts' | 'prep' | 'masterclass' | 'videos' | 'ai' | 'services' | 'downloads';
export interface SiteStatus { features: Record<Feature, boolean>; maintenance: { on: boolean; message: string; until: string | null }; owner: boolean }

let cached: SiteStatus | null = null;
let inflight: Promise<SiteStatus> | null = null;
const load = () => (inflight ??= api.get<SiteStatus>('/api/site').then((s) => { cached = s; return s; }).finally(() => { inflight = null; }));

/** Ask every page to read the site status again (after the owner changes something, or a 503 says maintenance began). */
export const refreshSite = () => window.dispatchEvent(new Event('dd:site'));

export function useSite() {
  const [s, setS] = useState<SiteStatus | null>(cached);
  useEffect(() => {
    let live = true;
    const go = () => load().then((x) => live && setS(x)).catch(() => { /* offline or no server: show everything */ });
    go();
    window.addEventListener('dd:site', go);
    window.addEventListener('dd:me', go);
    return () => { live = false; window.removeEventListener('dd:site', go); window.removeEventListener('dd:me', go); };
  }, []);
  const on = (f: Feature) => !s || s.owner || s.features[f] !== false;
  return { status: s, on, allows: (path: string) => { const f = featureFor(path); return !f || on(f); } };
}

/** Which switch a page of the website belongs to. */
export function featureFor(path: string): Feature | null {
  const p = path.split(/[?#]/)[0];
  if (p === '/list') return 'signup';
  if (p === '/explore' || p.startsWith('/c/')) return 'explore';
  if (p === '/jobs') return 'jobs';
  if (p === '/session' || p.startsWith('/session/')) return 'live';
  if (/^\/r\/[^/]+\/chat/.test(p)) return 'chat';
  if (p === '/prep/videos') return 'videos';
  if (p.startsWith('/prep/learn')) return 'masterclass';
  if (p === '/prep' || p.startsWith('/prep/')) return 'prep';
  if (p === '/services') return 'services';
  if (p === '/download' || p === '/get-the-app') return 'downloads';
  return null;
}

const LABEL: Record<Feature, string> = {
  signup: 'Listing new conferences', explore: 'Explore conferences', jobs: 'The Job Board', live: 'Live committee sessions', chat: 'Conference chat',
  accounts: 'Delegate sign-ups', prep: 'The Prep studio', masterclass: 'The MUN Masterclass', videos: 'Video lectures', ai: 'AI features', services: 'Services', downloads: 'App downloads',
};

// Pages that stay open during maintenance, so the owner (and staff) can still sign in.
const OPEN_IN_MAINTENANCE = /^\/(login|signin|reset\/|invite\/|privacy|app-settings|setup)/;

/** Wraps the whole website: maintenance page for visitors, and a notice on pages whose feature is switched off. */
export function SiteGate({ children }: { children: React.ReactNode }) {
  const { status, on } = useSite();
  const loc = useLocation();
  useEffect(() => {
    const h = () => refreshSite();
    window.addEventListener('dd:maintenance', h);
    return () => window.removeEventListener('dd:maintenance', h);
  }, []);
  if (status?.maintenance.on && !status.owner && !OPEN_IN_MAINTENANCE.test(loc.pathname)) return <MaintenancePage m={status.maintenance} />;
  const f = featureFor(loc.pathname);
  if (f && !on(f)) return <OffPage label={LABEL[f]} />;
  return <>{status?.owner && status.maintenance.on && <div className="dd-owner-banner" role="status"><Wrench className="icon" /> Maintenance mode is on. Visitors see the maintenance page; you can still use everything. <Link to="/app/owner">Turn it off</Link></div>}{children}</>;
}

function Frame({ icon: Icon, title, children }: { icon: typeof Gavel; title: string; children: React.ReactNode }) {
  return (
    <div className="dd-hold">
      <div className="dd-hold-card">
        <div className="dd-hold-ic"><Icon className="icon" /></div>
        <div className="dd-hold-brand"><span className="logo">D</span>DelegateDesk</div>
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function MaintenancePage({ m }: { m: SiteStatus['maintenance'] }) {
  const until = m.until ? new Date(m.until) : null;
  return (
    <Frame icon={Gavel} title="The committee is in recess">
      <p>{m.message || 'DelegateDesk is down for scheduled maintenance. We will be back shortly. Nothing you saved is lost.'}</p>
      {until && until.getTime() > Date.now() && <p className="dd-hold-until">Expected back by <b>{until.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</b></p>}
      <div className="dd-hold-row"><button className="btn primary" onClick={() => window.location.reload()}>Try again</button><Link className="btn" to="/login">Staff sign-in</Link></div>
    </Frame>
  );
}

function OffPage({ label }: { label: string }) {
  return (
    <Frame icon={Power} title={`${label} ${label.endsWith('s') && !label.startsWith('The') ? 'are' : 'is'} switched off`}>
      <p>The DelegateDesk team has turned this part of the site off for now. Please check back later.</p>
      <div className="dd-hold-row"><Link className="btn primary" to="/">Go to the home page</Link><Link className="btn" to="/contact">Contact us</Link></div>
    </Frame>
  );
}
