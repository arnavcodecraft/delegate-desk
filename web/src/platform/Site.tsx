import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Briefcase, CheckCircle2, ClipboardList, Download, Gavel, Globe, GraduationCap, Laptop, Mail, MessagesSquare, PlayCircle, Scale, ShieldCheck, Smartphone, Truck, UserRound, Users, Video } from 'lucide-react';
import { api } from '../api';
import { PlatformShell } from './Shell';
import { SERVICE_DETAILS, TEAM } from '../data/site';
import { useInstall } from '../install';

const SERVICE_ICON: Record<string, any> = { mentorship: UserRound, recorded: PlayCircle, batch: Video, logistics: Truck, eb: Gavel, consultancy: Scale };
const ORDER = ['mentorship', 'recorded', 'batch', 'logistics', 'eb', 'consultancy'];
const useSite = () => {
  const [site, setSite] = useState<any>(null);
  useEffect(() => { api.get('/api/platform/site').then(setSite).catch(() => setSite({ services: {}, topics: {} })); }, []);
  return site;
};

/** About DelegateDesk. */
export function AboutPage() {
  return (
    <PlatformShell>
      <section className="st-hero">
        <div className="pf-eyebrow">About DelegateDesk</div>
        <h1 className="pf-h1 left">Model UN, run properly, <span className="pf-grad-text">from the first form to the final award.</span></h1>
        <p className="pf-sub left">DelegateDesk is one place for everyone at a conference: organisers run applications, seats, payments and committees; chairs mark fairly; delegates prepare, connect and keep a record of everything they achieve.</p>
      </section>
      <section className="st-grid3">
        {[
          { i: ClipboardList, t: 'For organisers', d: 'A 10-step set-up, automatic seat allotment by experience, UPI and bank payments with proof checks, emails, chat, check-in, certificates and the books.' },
          { i: Gavel, t: 'For chairs', d: 'Roll call, speakers, motions and voting, with EB marking for every speech, POI and chit, shared by the whole dais.' },
          { i: GraduationCap, t: 'For delegates', d: 'A free MUN Masterclass, research and writing tools, practice with an AI partner, conference chat and a MUN CV that builds itself.' },
        ].map((x) => <div key={x.t} className="pf-card pad st-card"><x.i className="icon st-ic" /><b>{x.t}</b><p>{x.d}</p></div>)}
      </section>
      <section className="pf-card pad st-values">
        <h2 className="pf-h2">What we care about</h2>
        <div className="st-grid2">
          {[
            { i: ShieldCheck, t: 'Privacy and safety', d: 'Most delegates are students. We ask for parental consent for under-18s, keep private chats private, and give organisers clear controls.' },
            { i: Scale, t: 'Fairness', d: 'Seats are allotted first come, first served by clear experience rules, and marks show which EB member gave them.' },
            { i: BookOpen, t: 'Learning first', d: 'The Masterclass, tools and daily challenges are free, so every delegate can prepare well whatever their school.' },
            { i: MessagesSquare, t: 'People over paperwork', d: 'Automation handles forms, reminders and spreadsheets so organisers and chairs can focus on the committee.' },
          ].map((x) => <div key={x.t} className="st-value"><x.i className="icon st-ic sm" /><div><b>{x.t}</b><p>{x.d}</p></div></div>)}
        </div>
      </section>
      <section className="st-cta"><div><b>Running a conference or preparing for one?</b><span>Start free, or tell us what you need.</span></div><div className="mk-row"><Link className="pf-btn primary" to="/list">List your conference</Link><Link className="pf-btn ghost" to="/contact">Contact us</Link></div></section>
    </PlatformShell>
  );
}

/** The team, from web/src/data/site.ts. */
export function TeamPage() {
  return (
    <PlatformShell>
      <section className="st-hero">
        <div className="pf-eyebrow">Team</div>
        <h1 className="pf-h1 left">The people behind DelegateDesk</h1>
        <p className="pf-sub left">MUN organisers, chairs and delegates who wanted conferences to run smoother and be fairer for everyone.</p>
      </section>
      {TEAM.length ? <section className="st-team">{TEAM.map((m) => (
        <div key={m.name} className="pf-card pad st-person">
          <div className="st-photo"><span>{m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>{m.photo && <img src={m.photo} alt={m.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div>
          <b>{m.name}</b><span className="pf-small pf-muted">{m.role}</span>
          {m.bio && <p className="pf-small">{m.bio}</p>}
          {m.linkedin && <a className="pf-small" href={m.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
        </div>))}</section>
        : <div className="pf-card pad st-empty"><Users className="icon st-ic" /><b>Team profiles are coming soon</b><p className="pf-muted">In the meantime, we read every message: <Link to="/contact">get in touch</Link>.</p></div>}
      <section className="st-cta"><div><b>Want to work with us?</b><span>We are always glad to hear from chairs, trainers and organisers.</span></div><Link className="pf-btn primary" to="/contact?topic=partnership">Get in touch</Link></section>
    </PlatformShell>
  );
}

/** Contact form; messages go to the platform team's inbox. */
export function ContactPage() {
  const site = useSite();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ name: '', email: '', phone: '', organisation: '', topic: sp.get('topic') ?? 'organiser', message: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <PlatformShell>
      <div className="st-contact">
        <section>
          <div className="pf-eyebrow">Contact us</div>
          <h1 className="pf-h1 left" style={{ fontSize: 40 }}>Talk to a person</h1>
          <p className="pf-sub left">Questions about running a conference, your registration, our services or partnerships. We reply by email, usually within two working days.</p>
          <ul className="pf-ticks" style={{ marginTop: 20 }}>
            <li><CheckCircle2 className="icon" />Organisers: set-up help, payments, migration from spreadsheets</li>
            <li><CheckCircle2 className="icon" />Delegates: for a registration problem, write to the conference first, then to us</li>
            <li><CheckCircle2 className="icon" />Schools and partners: batch classes, EB support and sponsorships</li>
          </ul>
          {site?.contactEmail && <p className="pf-small" style={{ marginTop: 16 }}><Mail className="icon" style={{ width: 16, verticalAlign: -3 }} /> Or email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></p>}
        </section>
        <section className="pf-card pad">
          {sent ? <div className="st-sent"><CheckCircle2 className="icon st-ic" /><h2 className="pf-h2">Message sent</h2><p className="pf-muted">Thanks, {f.name.split(' ')[0]}. We’ve emailed you a copy, and someone from the team will reply to {f.email}.</p><Link className="pf-btn ghost sm" to="/">Back to DelegateDesk</Link></div> : (
            <form onSubmit={async (e) => {
              e.preventDefault(); setBusy(true); setErr(null); setErrors({});
              try { await api.post('/api/platform/contact', f); setSent(true); } catch (x: any) { setErrors(x.details?.fields ?? {}); setErr(x.message); } finally { setBusy(false); }
            }}>
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: -9999 }} aria-hidden />
              <div className="pf-row2">
                <label className="pf-field"><span className="pf-label">Your name</span><input className="pf-input" value={f.name} onChange={set('name')} autoComplete="name" required />{errors.name && <span className="pf-err">{errors.name}</span>}</label>
                <label className="pf-field"><span className="pf-label">Email</span><input className="pf-input" type="email" value={f.email} onChange={set('email')} autoComplete="email" required />{errors.email && <span className="pf-err">{errors.email}</span>}</label>
              </div>
              <div className="pf-row2">
                <label className="pf-field"><span className="pf-label">Phone (optional)</span><input className="pf-input" type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
                <label className="pf-field"><span className="pf-label">School, college or conference (optional)</span><input className="pf-input" value={f.organisation} onChange={set('organisation')} /></label>
              </div>
              <label className="pf-field"><span className="pf-label">What is it about?</span><select className="pf-input" value={f.topic} onChange={set('topic')}>{Object.entries(site?.topics ?? { organiser: 'Running a conference' }).map(([k, l]) => <option key={k} value={k}>{l as string}</option>)}</select></label>
              <label className="pf-field"><span className="pf-label">Message</span><textarea className="pf-input" rows={6} maxLength={3000} value={f.message} onChange={set('message')} required />{errors.message && <span className="pf-err">{errors.message}</span>}</label>
              {err && !Object.keys(errors).length && <div className="pf-err" role="alert">{err}</div>}
              <button className="pf-btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
            </form>
          )}
        </section>
      </div>
    </PlatformShell>
  );
}

/** Services: mentorship, recorded courses, batch classes, logistics, EB support and consultancy, each with a request form. */
export function ServicesPage() {
  const site = useSite();
  const [sp] = useSearchParams();
  const [pick, setPick] = useState<string | null>(sp.get('service'));
  const services = site?.services ?? {};
  return (
    <PlatformShell>
      <section className="st-hero">
        <div className="pf-eyebrow">Services</div>
        <h1 className="pf-h1 left">Help from people who have <span className="pf-grad-text">run and won MUNs.</span></h1>
        <p className="pf-sub left">For delegates who want to improve fast, and organisers who want a smooth, well-run conference. Tell us what you need and we’ll come back with a plan and a price.</p>
      </section>
      <section className="st-services">
        {ORDER.filter((k) => services[k]).map((k) => {
          const I = SERVICE_ICON[k] ?? Briefcase; const d = SERVICE_DETAILS[k];
          return <article key={k} className="pf-card pad st-service" id={k}>
            <div className="st-service-head"><span className="st-ic-wrap"><I className="icon" /></span><div><b>{services[k].title}</b><span className="pf-small pf-muted">For {services[k].for}</span></div></div>
            <p>{d?.tagline}</p>
            <ul>{d?.points.map((p) => <li key={p}><CheckCircle2 className="icon" />{p}</li>)}</ul>
            <div className="mk-row" style={{ marginTop: 'auto' }}>
              <button className="pf-btn primary sm" onClick={() => setPick(k)}>{k === 'recorded' ? 'Get early access' : 'Request this'}<ArrowRight className="icon" /></button>
              {(k === 'recorded' || k === 'batch') && <Link className="pf-btn link" to="/prep/learn">Try the free Masterclass</Link>}
            </div>
          </article>;
        })}
      </section>
      {pick && services[pick] && <ServiceForm service={pick} title={services[pick].title} onClose={() => setPick(null)} />}
    </PlatformShell>
  );
}

const ASK_LABEL: Record<string, string> = { role: 'You are a…', when: 'When do you need it?', size: 'How many people?', conference: 'Conference name', city: 'City', level: 'Level' };
function ServiceForm({ service, title, onClose }: { service: string; title: string; onClose: () => void }) {
  const ask = SERVICE_DETAILS[service]?.ask ?? [];
  const [f, setF] = useState<Record<string, string>>({ name: '', email: '', phone: '', organisation: '', message: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="ch-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="pf-card pad cv-form" onClick={(e) => e.stopPropagation()}>
        {sent ? <div className="st-sent"><CheckCircle2 className="icon st-ic" /><h2 className="pf-h2">Request sent</h2><p className="pf-muted">We’ve emailed you a copy. Someone from the team will reply to {f.email} with a plan and a price.</p><button className="pf-btn ghost sm" onClick={onClose}>Close</button></div> : (
          <form onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setErr(null); setErrors({});
            try { await api.post('/api/platform/services/request', { ...f, service }); setSent(true); } catch (x: any) { setErrors(x.details?.fields ?? {}); setErr(x.message); } finally { setBusy(false); }
          }}>
            <h2 className="pf-h2" style={{ fontSize: 20, marginBottom: 4 }}>{title}</h2>
            <p className="pf-small pf-muted" style={{ marginTop: 0 }}>Tell us a little; we reply by email.</p>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: -9999 }} aria-hidden />
            <div className="pf-row2">
              <label className="pf-field"><span className="pf-label">Your name</span><input className="pf-input" value={f.name} onChange={set('name')} required />{errors.name && <span className="pf-err">{errors.name}</span>}</label>
              <label className="pf-field"><span className="pf-label">Email</span><input className="pf-input" type="email" value={f.email} onChange={set('email')} required />{errors.email && <span className="pf-err">{errors.email}</span>}</label>
            </div>
            <div className="pf-row2">
              <label className="pf-field"><span className="pf-label">Phone (optional)</span><input className="pf-input" type="tel" value={f.phone} onChange={set('phone')} /></label>
              <label className="pf-field"><span className="pf-label">School, college or organisation</span><input className="pf-input" value={f.organisation} onChange={set('organisation')} /></label>
            </div>
            <div className="pf-row2">{ask.map((k) => <label key={k} className="pf-field"><span className="pf-label">{ASK_LABEL[k]}</span>
              {k === 'level' ? <select className="pf-input" value={f.level ?? ''} onChange={set('level')}><option value="">Choose…</option><option>First MUN</option><option>Some experience</option><option>Experienced</option><option>School group</option><option>University</option></select>
                : <input className="pf-input" type={k === 'size' ? 'number' : 'text'} min={k === 'size' ? 1 : undefined} value={f[k] ?? ''} onChange={set(k)} placeholder={k === 'when' ? 'e.g. before 15 Jan 2027' : ''} />}</label>)}</div>
            <label className="pf-field"><span className="pf-label">Anything else? (optional)</span><textarea className="pf-input" rows={3} maxLength={3000} value={f.message} onChange={set('message')} /></label>
            {err && !Object.keys(errors).length && <div className="pf-err" role="alert">{err}</div>}
            <div className="mk-row" style={{ justifyContent: 'flex-end' }}><button type="button" className="pf-btn ghost sm" onClick={onClose}>Cancel</button><button className="pf-btn primary sm" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Get the app: install from the browser, or download the Android and desktop apps. */
type Plat = 'android' | 'windows' | 'mac' | 'linux' | 'ios' | 'other';
const detect = (): Plat => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/windows/i.test(ua)) return 'windows';
  if (/mac os x|macintosh/i.test(ua)) return 'mac';
  if (/linux/i.test(ua)) return 'linux';
  return 'other';
};
const PLATFORMS: { key: Exclude<Plat, 'ios' | 'other'>; name: string; file: string; note: string; icon: any; extra?: { href: string; label: string } }[] = [
  { key: 'android', name: 'Android', file: 'APK · phones and tablets', note: 'Open the file when it finishes. If Android asks, allow installing apps from your browser.', icon: Smartphone },
  { key: 'windows', name: 'Windows', file: 'Installer (.exe) · Windows 10 and 11', note: 'If Windows shows “Windows protected your PC”, choose More info, then Run anyway.', icon: Laptop },
  { key: 'mac', name: 'macOS', file: 'Disk image (.dmg) · Apple silicon and Intel', note: 'Drag DelegateDesk to Applications. The first time, right-click the app and choose Open.', icon: Laptop },
  { key: 'linux', name: 'Linux', file: 'AppImage · most distributions', note: 'Make the file executable (chmod +x), then open it.', icon: Laptop, extra: { href: '/download/linux-deb', label: 'or the .deb for Ubuntu and Debian' } },
];

/** Download the apps from this site. Each button sends the file straight to the device. */
export function AppDownloadPage() {
  const inst = useInstall();
  const plat = useMemo(detect, []);
  const mine = PLATFORMS.find((p) => p.key === plat);
  return (
    <PlatformShell>
      <section className="dl-hero">
        <div className="pf-eyebrow">Download</div>
        <h1 className="pf-h1">DelegateDesk for every device</h1>
        <p className="pf-sub">The same app for organisers, chairs and delegates. It opens straight onto DelegateDesk: no setup, no store account.</p>
        <div className="dl-main">
          {mine ? <a className="pf-btn primary dl-big" href={`/download/${mine.key}`}><Download className="icon" />Download for {mine.name}</a>
            : plat === 'ios' ? <div className="pf-note"><span>On iPhone and iPad, add DelegateDesk to your home screen: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span></div>
              : null}
          {mine && <p className="pf-small pf-muted" style={{ margin: '10px 0 0' }}>{mine.file}</p>}
        </div>
      </section>
      <section className="dl-grid">
        {PLATFORMS.map((p) => (
          <div key={p.key} className={`pf-card pad dl-card ${p.key === plat ? 'mine' : ''}`}>
            <div className="dl-card-h"><span className="dl-ic"><p.icon className="icon" /></span><span><b>{p.name}</b><small>{p.file}</small></span>{p.key === plat && <span className="pf-tag green">This device</span>}</div>
            <p>{p.note}</p>
            <div className="dl-card-f"><a className={`pf-btn ${p.key === plat ? 'primary' : 'ghost'} sm`} href={`/download/${p.key}`}><Download className="icon" />Download</a>{p.extra && <a className="pf-btn link" href={p.extra.href}>{p.extra.label}</a>}</div>
          </div>
        ))}
        <div className="pf-card pad dl-card">
          <div className="dl-card-h"><span className="dl-ic"><Globe className="icon" /></span><span><b>Any browser</b><small>Install from the web · iPhone, iPad, Chromebook</small></span></div>
          <p>Add DelegateDesk to your home screen or desktop straight from the browser. It updates by itself.</p>
          <div className="dl-card-f">{inst.installed ? <span className="pf-small" style={{ color: 'var(--pf-green)' }}><CheckCircle2 className="icon" style={{ width: 16, verticalAlign: -3 }} /> Installed on this device</span>
            : inst.canPrompt ? <button className="pf-btn ghost sm" onClick={() => inst.prompt()}><Download className="icon" />Install</button>
              : <span className="pf-small pf-muted">{inst.ios ? 'Tap Share, then Add to Home Screen.' : 'Browser menu → Install DelegateDesk.'}</span>}</div>
        </div>
      </section>
      <section className="dl-faq pf-card pad">
        <b>Good to know</b>
        <ul>
          <li>The apps open on the DelegateDesk home page. Sign in once and your conferences, Prep work and live sessions are there.</li>
          <li>Prep and the MUN Masterclass work even with a weak connection; conference features need the internet.</li>
          <li>The apps are not code-signed yet, so Windows and macOS show a one-time warning. The steps above get you past it.</li>
        </ul>
      </section>
    </PlatformShell>
  );
}
