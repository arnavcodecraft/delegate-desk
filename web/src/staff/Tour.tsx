import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** A guided tour of the organiser dashboard: a spotlight on one part of the screen at a time. */
export interface TourStep { target: string; title: string; body: string; path?: string }
export const DASHBOARD_TOUR: TourStep[] = [
  { target: '[data-tour="switch"]', title: 'Your conferences', body: 'Switch between conferences here, or start a new one. Everything on every screen is for the conference picked here.', path: '/app/overview' },
  { target: '[data-tour="publish"]', title: 'Publish when ready', body: 'Drafts are private. Publishing lists the conference on Explore and opens the registration form.', path: '/app/overview' },
  { target: '[data-tour="priorities"]', title: 'Your next step', body: 'The dashboard always shows the one thing to do next. Press Do it now; the step ticks itself off and the next one appears. All steps are under More details.', path: '/app/overview' },
  { target: '[data-tour="target"]', title: 'Your four numbers', body: 'Applications, seats filled, paid delegates and money collected. Click any of them to see the people behind the number.', path: '/app/overview' },
  { target: '[data-tour="share"]', title: 'Share your link', body: 'Send this to schools and post it. Add ?src=instagram (or whatsapp, school…) to see where applicants come from.', path: '/app/overview' },
  { target: '[data-tour="nav-manage"]', title: 'Manage the conference', body: 'Applications, delegates, committees and portfolios, study guides and position papers, live sessions with EB marking, lists and check-in.' },
  { target: '[data-tour="nav-money"]', title: 'Money', body: 'Fees and payment methods (Financials), payment proofs to approve, refunds, expenses and the books. Two-person approval applies whenever someone else can approve.' },
  { target: '[data-tour="nav-settings"]', title: 'Settings and your team', body: 'Your public page, the Job Board, rules, and Settings → Users & roles to invite your team. Each person gets a link to set their own password.' },
  { target: '[data-tour="help"]', title: 'Take the tour again', body: 'You can replay this tour any time from here. Good luck with the conference!' },
];

const key = (who: string) => `dd-tour-${who}`;
export const tourSeen = (who: string) => { try { return localStorage.getItem(key(who)) === 'done' || localStorage.getItem('dd-tour-off') === '1'; } catch { return true; } };
export const markTour = (who: string) => { try { localStorage.setItem(key(who), 'done'); } catch { /* private mode */ } };

export function Tour({ steps, who, onClose }: { steps: TourStep[]; who: string; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<DOMRect | null>(null);
  const loc = useLocation(); const nav = useNavigate();
  const step = steps[i];
  const finish = useCallback(() => { markTour(who); onClose(); }, [who, onClose]);
  useEffect(() => { if (step?.path && loc.pathname !== step.path) nav(step.path); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    let n = 0; let stop = false;
    const find = () => {
      if (stop) return;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (el && el.getBoundingClientRect().height > 0) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => !stop && setBox(el.getBoundingClientRect()), 260); }
      else if (n++ < 20) setTimeout(find, 120);
      else if (i < steps.length - 1) setI(i + 1); else finish();   // a step whose part isn't on this screen (role without access) is skipped
    };
    setBox(null); find();
    const onResize = () => { const el = document.querySelector(step.target); if (el) setBox(el.getBoundingClientRect()); };
    window.addEventListener('resize', onResize); window.addEventListener('scroll', onResize, true);
    return () => { stop = true; window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  }, [i, loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); if (e.key === 'ArrowRight') setI((x) => Math.min(steps.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [finish, steps.length]);
  if (!step) return null;
  const pad = 6;
  const W = Math.min(360, window.innerWidth - 32);
  let top = 80, left = (window.innerWidth - W) / 2;
  if (box) {
    const below = box.bottom + 14 + 190 < window.innerHeight;
    top = below ? box.bottom + 14 : Math.max(16, box.top - 14 - 190);
    left = box.right + 16 + W < window.innerWidth && box.width < 300 ? box.right + 16 : Math.min(Math.max(16, box.left), window.innerWidth - W - 16);
    if (left === box.right + 16) top = Math.min(Math.max(16, box.top), window.innerHeight - 220);
  }
  return (
    <div className="tour-scrim" role="dialog" aria-modal="true" aria-label="Dashboard tour">
      {box && <div className="tour-hole" style={{ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} />}
      {!box && <div className="tour-hole" style={{ top: '50%', left: '50%', width: 0, height: 0 }} />}
      <div className="tour-card" style={{ top, left, pointerEvents: 'auto' }}>
        <div className="small faint" style={{ marginBottom: 4 }}>Step {i + 1} of {steps.length}</div>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-foot">
          <span className="tour-dots">{steps.map((_, j) => <i key={j} className={j === i ? 'on' : ''} />)}</span>
          <button className="btn ghost sm" onClick={finish}>Skip</button>
          {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Back</button>}
          {i < steps.length - 1 ? <button className="btn primary sm" onClick={() => setI(i + 1)}>Next</button> : <button className="btn primary sm" onClick={finish}>Done</button>}
        </div>
      </div>
    </div>
  );
}
