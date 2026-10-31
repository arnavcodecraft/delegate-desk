import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, Award, BadgeCheck, BookOpen, Calculator, Check, ClipboardList, CreditCard, FileText, Gavel, Globe, GraduationCap, HeartHandshake, IdCard, LayoutDashboard, Laptop,
  ListOrdered, Lock, Mail, MessagesSquare, Minus, Monitor, PenLine, Play, Plus, QrCode, Search, Shuffle, Smartphone, Sparkles, Timer, Trophy, Users, WifiOff, Zap,
  AlignCenter, AlignLeft, AlignRight, ChevronsUpDown, Filter, Hand, Info, Link2, Loader, MousePointerClick, Ticket, TrendingUp, UploadCloud, X,
} from 'lucide-react';
import { api } from '../api';
import { PlatformShell } from './Shell';
import { Flag } from './art';
import { ConfCard } from './Explore';

/** The home page: what DelegateDesk is, who it is for, and how to start. */
export function Home() {
  const loc = useLocation();
  const [stats, setStats] = useState<any>(null);
  const [confs, setConfs] = useState<any[]>([]);
  useEffect(() => { api.get('/api/platform/stats').then(setStats).catch(() => {}); api.get<any>('/api/platform/conferences?when=upcoming').then((d) => setConfs(d.conferences.slice(0, 3))).catch(() => {}); }, []);
  // Links like /#pricing land on the section.
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }, [loc.hash]);
  return (
    <PlatformShell bare dark>
      <Hero stats={stats} />
      <Marquee />
      <Showcase />
      <Bento />
      <Features />
      <DeepDives />
      <ActivityWall />
      <Audiences />
      <HowItWorks />
      {confs.length > 0 && <section className="hm-sec" data-export="skip"><div className="hm-in">
        <div className="hm-head row"><div><div className="hm-eyebrow">On DelegateDesk now</div><h2>Upcoming conferences</h2></div><Link to="/explore" className="hm-link">Explore all <ArrowRight /></Link></div>
        <div className="pf-confs">{confs.map((c) => <ConfCard key={c.slug} c={c} />)}</div>
      </div></section>}
      <Pricing />
      <Apps />
      <Faq />
      <FinalCta />
    </PlatformShell>
  );
}

// ---------- hero ----------
function Hero({ stats }: { stats: any }) {
  const show = (stats?.delegates ?? 0) >= 100;
  return (
    <section className="hm-hero dark">
      <div className="hm-space" aria-hidden />
      <GlobeCanvas />
      <div className="hm-in hm-hero-in">
        <Link to="/session" className="hm-badge glass"><span>New</span>The live committee room<ArrowRight /></Link>
        <h1>The all-in-one platform<br />for <span className="hm-aurora">Model UN</span>.</h1>
        <p className="hm-lead">Organisers run applications, allotments, payments and emails from one dashboard. Chairs run committee from one screen. Delegates research, write and practise in one place.</p>
        <div className="hm-ctas">
          <Link to="/list" className="hm-btn aurora">List your conference free<ArrowRight /></Link>
          <Link to="/session" className="hm-btn glass"><Play />Run a live session</Link>
        </div>
        <div className="hm-trust"><span><Check />Free for organisers</span><span><Check />No card needed</span><span><Check />Phone, Windows, Mac and Linux</span>{show && <span><Users />{Number(stats.delegates).toLocaleString('en-IN')} delegates</span>}</div>
      </div>
      <div className="hm-hero-cards" aria-hidden>
        <div className="hm-float g1"><BadgeCheck /><div><b>Seat allotted</b><small>India · UNSC, first preference</small></div></div>
        <div className="hm-float g2"><CreditCard /><div><b>₹1,600 received</b><small>Payment proof approved</small></div></div>
        <div className="hm-float g3"><Gavel /><div><b>Moderated caucus passes</b><small>9 for · 3 against</small></div></div>
      </div>
      <div className="hm-hero-fade" aria-hidden />
    </section>
  );
}

/** The 3D globe, loaded after the page so it never slows the first paint. Falls back to a drawn sphere. */
function GlobeCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');
  useEffect(() => {
    let stop: (() => void) | undefined; let alive = true;
    const gl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
    if (!gl || !ref.current) { setState('none'); return; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    import('./globeScene').then(({ mountGlobe }) => { if (alive && ref.current) stop = mountGlobe(ref.current, { reducedMotion: reduced, onReady: () => setState('ready') }); }).catch(() => setState('none'));
    return () => { alive = false; stop?.(); };
  }, []);
  return <><canvas ref={ref} className={`hm-globe ${state}`} aria-hidden />{state !== 'ready' && <div className="hm-globe-fallback" aria-hidden />}</>;
}

const COMMITTEES = ['UNSC', 'UNHRC', 'DISEC', 'ECOSOC', 'WHO', 'UNEP', 'Lok Sabha', 'International Press', 'Crisis cabinet', 'UNGA', 'IAEA', 'UNICEF', 'Historic Security Council', 'G20'];
function Marquee() {
  const row = [...COMMITTEES, ...COMMITTEES];
  return (
    <section className="hm-marquee" aria-label="Committees run on DelegateDesk">
      <p>Every committee, every format</p>
      <div className="hm-marquee-track"><div>{row.map((c, i) => <span key={i}>{c}</span>)}</div></div>
    </section>
  );
}

/** The chair's committee room, drawn (not screenshotted), with a timer that really ticks. */
function RoomMock() {
  const [t, setT] = useState(54);
  useEffect(() => { const id = setInterval(() => setT((x) => (x <= 1 ? 60 : x - 1)), 1000); return () => clearInterval(id); }, []);
  const dels = [['India', 'in', 'cur'], ['Japan', 'jp', 'q1'], ['Brazil', 'br', 'q2'], ['Kenya', 'ke', ''], ['France', 'fr', ''], ['Mexico', 'mx', '']];
  return (
    <div className="hm-app">
      <div className="hm-app-side">
        <div className="hm-app-com"><span className="hm-emb">GA</span><div><b>UNGA</b><small>Education in emergencies</small></div></div>
        <div className="hm-app-g"><span><em>12</em>Present</span><span><em>8</em>2/3</span><span><em>7</em>1/2+1</span></div>
        {dels.map(([n, c, st]) => <div key={n} className={`hm-app-del ${st}`}><span className="hm-fl"><Flag code={c} round />{st && <em>{st === 'cur' ? '▶' : st.slice(1)}</em>}</span><span><b>{n}</b>{st && <small>{st === 'cur' ? 'Speaking' : 'On the list'}</small>}</span></div>)}
      </div>
      <div className="hm-app-main">
        <div className="hm-app-tabs"><b>Speakers</b><span>Roll call</span><span>Motions</span><span>Documents</span></div>
        <div className="hm-app-stage">
          <small className="hm-app-title">General Speakers' List</small>
          <div className="hm-app-q"><Flag code="jp" round /><Flag code="br" round /></div>
          <div className="hm-app-flag"><Flag code="in" round /></div>
          <b className="hm-app-name">India</b>
          <div className="hm-app-timer">0:{String(t).padStart(2, '0')}</div>
          <div className="hm-app-bar"><i style={{ width: `${(t / 60) * 100}%` }} /></div>
          <div className="hm-app-ctl"><span className="a">Pause</span><span className="b">Next</span><span className="c">RTR</span></div>
        </div>
      </div>
    </div>
  );
}

function Showcase() {
  return (
    <section className="hm-sec hm-show">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">One screen for the dais, one for every delegate</div><h2>Committee, beautifully run</h2><p>The chair runs roll call, the speakers list, motions and voting from a laptop. Delegates follow along, ask to speak and vote from their phones.</p></div>
        <div className="hm-devices-stage" aria-hidden>
          <div className="hm-laptop">
            <div className="hm-laptop-lid"><div className="hm-laptop-screen"><RoomMock /></div><i className="hm-notch" /></div>
            <div className="hm-laptop-base"><i /></div>
          </div>
          <div className="hm-phone">
            <div className="hm-phone-screen">
              <div className="hm-ph-top"><span className="hm-ph-dd">DD</span><b>UNGA</b><small>Speakers</small></div>
              <div className="hm-ph-stage"><Flag code="in" round /><b>India</b><small>Speaking</small><div className="hm-ph-timer">0:54</div><div className="hm-app-bar"><i style={{ width: '88%' }} /></div></div>
              <div className="hm-ph-me"><Flag code="jp" round /><span><b>Japan</b><small>On the list · #1</small></span></div>
              <div className="hm-ph-btn"><Hand />On the list</div>
              <div className="hm-ph-vote"><span>For</span><span>Against</span><span>Abstain</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Floating metric cards: what an organiser sees at a glance. */
function Bento() {
  const steps = [[Link2, 'Applied'], [MousePointerClick, 'Allotted'], [null, '2 days'], [CreditCard, 'Paid'], [Ticket, 'Checked in']] as const;
  return (
    <section className="hm-sec alt">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">At a glance</div><h2>Know where every delegate is</h2><p>From the first click on your link to the badge at the door, every step is tracked and every number is one tap away.</p></div>
        <div className="hm-bento" aria-hidden>
          <div className="hm-mcard wide">
            <div className="hm-tile-grad"><Mail /></div>
            <div className="hm-mcard-body"><span className="hm-k">Applications <Info /></span><div className="hm-big">48% <em><TrendingUp />30% vs last week</em></div></div>
            <span className="hm-pill">Details</span>
          </div>
          <div className="hm-mcard tall">
            <div className="hm-mcard-head"><div><span className="hm-k">Delegate journey <Info /></span><div className="hm-live"><b>3</b><em>checked in today</em></div></div><span className="hm-pill">Details</span></div>
            <div className="hm-journey">{steps.map(([I, l], i) => I ? <span key={i} className={`hm-step-dot ${i === steps.length - 1 ? 'done' : ''}`} title={l}><I /><small>{l}</small></span> : <span key={i} className="hm-step-gap"><small>{l}</small><i /></span>)}</div>
          </div>
          <div className="hm-mcard small">
            <div className="hm-tile-soft"><span className="hm-aurora-text">UN</span></div>
            <div className="hm-mcard-body"><span className="hm-k">Committee rooms <Info /></span><span className="hm-pill">Details</span></div>
          </div>
          <div className="hm-mcard small split">
            <div className="hm-tile-grad"><span className="hm-ring" /></div>
            <div className="hm-mcard-body center"><span className="hm-caret" /><small>Live now</small></div>
          </div>
        </div>
        <div className="hm-controls" aria-hidden>
          <span className="hm-c aurora"><Sparkles />Ask the coach</span>
          <span className="hm-c chip"><span className="hm-av sm">AM</span>Aarav M.<X /></span>
          <span className="hm-c dashed"><UploadCloud />Upload position paper</span>
          <span className="hm-c"><Filter />Committee <em>· 2</em><i className="sep" /><X /></span>
          <span className="hm-c seg"><span className="on"><AlignLeft /></span><span><AlignCenter /></span><span><AlignRight /></span></span>
          <span className="hm-c combo"><b>60</b> sec <ChevronsUpDown /><span className="hm-c aurora in">Start caucus</span></span>
          <span className="hm-c green"><i className="dot" />Online</span>
          <span className="hm-c blue"><Loader /> Allotting seats</span>
          <span className="hm-c search">Search delegates<span className="hm-c-ic"><Search /></span></span>
        </div>
      </div>
    </section>
  );
}

/** A moving wall of moments from a conference day. These are examples of what the platform does, not quotes. */
const MOMENTS: [string, string, string][] = [
  ['Secretariat', 'Registrations', '312 applications in the first week. Seats were allotted overnight by preference and experience.'],
  ['UNSC Chair', 'Committee room', 'Moderated caucus on maritime security passed 9 to 3. The speakers list filled in under a minute.'],
  ['Delegate of Japan', 'Prep', 'Position paper drafted from the research brief, with every source linked.'],
  ['Finance team', 'Payments', 'Forty payment proofs approved before lunch. Receipts went out automatically.'],
  ['Vice-Chair, DISEC', 'EB marking', 'Both chairs marked speeches live; the marksheet exported to Excel at the end of session.'],
  ['Delegate of Kenya', 'Chat', 'Bloc formed by private message during the unmoderated caucus.'],
  ['Registration desk', 'Check-in', 'QR badges scanned at the door: 420 delegates in 25 minutes.'],
  ['Secretary-General', 'Certificates', 'Awards and participation certificates emailed the evening the conference closed.'],
];
function ActivityWall() {
  const colA = MOMENTS.filter((_, i) => i % 2 === 0), colB = MOMENTS.filter((_, i) => i % 2 === 1);
  const Card = ({ m: [who, tag, text] }: { m: [string, string, string] }) => (
    <div className="hm-moment"><div className="hm-moment-h"><span className="hm-av">{who.split(/[ ,-]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('')}</span><span><b>{who}</b><small>{tag}</small></span></div><p>{text}</p></div>
  );
  return (
    <section className="hm-sec">
      <div className="hm-in">
        <div className="hm-wall">
          <div className="hm-wall-copy">
            <span className="hm-wall-ic"><Users /></span>
            <h2>A conference day on DelegateDesk</h2>
            <p>Every team, every committee and every delegate, working from the same place. These are examples of what happens on the platform during a conference.</p>
            <Link to="/list" className="hm-btn aurora">Run yours on DelegateDesk<ArrowRight /></Link>
          </div>
          <div className="hm-wall-cols" aria-hidden>
            <div className="hm-wall-col"><div>{[...colA, ...colA].map((m, i) => <Card key={i} m={m} />)}</div></div>
            <div className="hm-wall-col slow"><div>{[...colB, ...colB].map((m, i) => <Card key={i} m={m} />)}</div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- features ----------
const FEATURES = [
  { i: ClipboardList, t: 'Registration forms', d: 'Your link, your questions, committee and portfolio preferences.' },
  { i: Shuffle, t: 'Automatic allotment', d: 'Seats by preference and MUN experience, with the reason shown.' },
  { i: CreditCard, t: 'Payments', d: 'UPI, bank and card into your account, with proof review.' },
  { i: Mail, t: 'Emails and reminders', d: 'Confirmations, payment nudges and bulk mail, written for you.' },
  { i: MessagesSquare, t: 'Conference chat', d: 'All committees, each committee, and private messages.' },
  { i: QrCode, t: 'Check-in and badges', d: 'QR badges and a door check-in that works on any phone.' },
  { i: Award, t: 'Certificates', d: 'Participation and awards, generated and sent in one go.' },
  { i: Calculator, t: 'Accounts', d: 'Expenses, refunds and books that balance, with an audit trail.' },
  { i: Gavel, t: 'Live committee room', d: 'Roll call, speakers list, motions and voting on one screen.' },
  { i: ListOrdered, t: 'EB marking', d: 'Marks for every speech, POI and chit, exported to Excel.' },
  { i: FileText, t: 'Working papers and DRs', d: 'Submit, approve, amend and vote on papers in the room.' },
  { i: Trophy, t: 'Points ranking', d: 'Scores from what happens in committee, weighted your way.' },
  { i: Search, t: 'Research briefs', d: 'Country and topic research with sources you can check.' },
  { i: PenLine, t: 'Paper and speech builders', d: 'Position papers, opening speeches and resolutions.' },
  { i: GraduationCap, t: 'MUN Masterclass', d: 'A complete course from first conference to Best Delegate.' },
  { i: IdCard, t: 'MUN CV', d: 'A CV that fills itself in from your conferences.' },
];
function Features() {
  return (
    <section className="hm-sec" id="features">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">Everything in one place</div><h2>Sixteen tools you would otherwise stitch together</h2><p>Forms, spreadsheets, payment apps, group chats, timers and marksheets, replaced by one platform that talks to itself.</p></div>
        <div className="hm-grid">{FEATURES.map((f) => <div key={f.t} className="hm-tile"><span className="hm-tile-ic"><f.i /></span><b>{f.t}</b><p>{f.d}</p></div>)}</div>
      </div>
    </section>
  );
}

function DeepDives() {
  return (
    <section className="hm-sec alt">
      <div className="hm-in hm-dives">
        <Dive eyebrow="Applications" title="From application to allotment, without the spreadsheet" text="Delegates apply from your page with their committee and portfolio preferences and their MUN experience. DelegateDesk offers each seat to the best match and tells you why, so experienced delegates get the big portfolios and first-timers still get a fair seat." points={['Committee and portfolio preferences', 'Experience-based allotment with reasons', 'Waitlists, swaps and change requests']} to="/list" cta="Set up registrations" art={<ArtAllot />} />
        <Dive flip eyebrow="Payments" title="Get paid without chasing anyone" text="Choose when delegates pay: right after allotment, before it, or straight away. Fees go into your own account by UPI, bank transfer or card. Delegates upload proof, you approve it in a click, and reminders go out before a seat is released." points={['Payment windows you set', 'Proof review and receipts', 'Refunds and books that balance']} to="/list" cta="Take payments" art={<ArtPay />} />
        <Dive eyebrow="Committee" title="A committee room that runs itself" text="Roll call with quorum, a speakers list you can drag to reorder, rights of reply and yields, motions sorted by how disruptive they are, voting by roll call or on delegates' phones, and P5 vetoes. Your whole EB marks together from their own devices." points={['Motions, voting and vetoes', 'Working papers and draft resolutions', 'Points ranking and EB marksheets']} to="/session" cta="Open a live session" art={<ArtVote />} />
        <Dive flip eyebrow="Prep" title="Delegates arrive prepared" text="Every delegate gets research briefs with sources, position paper and speech builders, a resolution formatter, practice rounds and the complete MUN Masterclass. Their conferences, CV and saved events live in one account." points={['Research with sources you can check', 'Builders for papers, speeches and resolutions', 'The full Masterclass, free']} to="/prep" cta="Start preparing" art={<ArtPrep />} />
      </div>
    </section>
  );
}
function Dive({ eyebrow, title, text, points, to, cta, art, flip }: { eyebrow: string; title: string; text: string; points: string[]; to: string; cta: string; art: React.ReactNode; flip?: boolean }) {
  return (
    <div className={`hm-dive ${flip ? 'flip' : ''}`}>
      <div className="hm-dive-copy">
        <div className="hm-eyebrow">{eyebrow}</div><h3>{title}</h3><p>{text}</p>
        <ul>{points.map((p) => <li key={p}><Check />{p}</li>)}</ul>
        <Link to={to} className="hm-link">{cta}<ArrowRight /></Link>
      </div>
      <div className="hm-dive-art" aria-hidden>{art}</div>
    </div>
  );
}
function ArtAllot() {
  const rows = [['Aarav Mehta', 'UNSC · France', 'ok', '6 MUNs'], ['Sara Khan', 'UNHRC · Brazil', 'ok', '2 MUNs'], ['Kabir Rao', 'DISEC · Japan', 'ok', 'First MUN'], ['Meera Iyer', 'Waitlist · UNSC', 'wait', '4 MUNs']];
  return <div className="hm-art"><div className="hm-art-h"><b>Allotment</b><span className="hm-chip ok">42 of 48 seats</span></div>
    {rows.map(([n, s, st, x]) => <div key={n} className="hm-art-row"><span className="hm-av">{n.split(' ').map((w) => w[0]).join('')}</span><span className="grow"><b>{n}</b><small>{s}</small></span><small className="muted">{x}</small><span className={`hm-chip ${st}`}>{st === 'ok' ? 'Allotted' : 'Waitlist'}</span></div>)}
    <div className="hm-art-note"><Sparkles />France went to Aarav: first preference, and 6 MUNs meets the high-tier minimum.</div></div>;
}
function ArtPay() {
  return <div className="hm-art"><div className="hm-art-h"><b>Payments</b><span className="hm-chip">This week</span></div>
    <div className="hm-pay-big"><small>Collected</small><b>₹1,84,000</b><span className="hm-chip ok">+₹32,000</span></div>
    <div className="hm-pay-bars">{[40, 62, 35, 80, 55, 92, 70].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
    {[['UPI · Sara Khan', '₹1,600', 'ok', 'Approved'], ['Bank · Kabir Rao', '₹1,600', 'wait', 'Check proof']].map(([a, b, st, l]) => <div key={a} className="hm-art-row"><span className="grow"><b>{a}</b></span><b>{b}</b><span className={`hm-chip ${st}`}>{l}</span></div>)}</div>;
}
function ArtVote() {
  return <div className="hm-art"><div className="hm-art-h"><b>Draft Resolution 1.1</b><span className="hm-chip">Substantive · 2/3</span></div>
    <div className="hm-vote">{[['For', 14, 'f'], ['Against', 4, 'a'], ['Abstain', 2, 'n']].map(([l, n, c]) => <div key={l as string} className={c as string}><b>{n}</b><span>{l}</span><i style={{ width: `${((n as number) / 20) * 100}%` }} /></div>)}</div>
    <div className="hm-result">Passes<small>Needed two-thirds of votes cast (12 of 18)</small></div>
    <div className="hm-motions">{[['1', 'Unmoderated caucus · 10 min', 'Kenya'], ['2', 'Moderated caucus · 8 min · 45s', 'Japan']].map(([n, m, by]) => <div key={n}><em>{n}</em><span><b>{m}</b><small>{by}</small></span></div>)}</div></div>;
}
function ArtPrep() {
  return <div className="hm-art"><div className="hm-art-h"><b>Research: India in UNSC</b><span className="hm-chip ok">12 sources</span></div>
    {['Position on Security Council reform', 'Voting record on peacekeeping mandates', 'Allies and likely bloc'].map((x, i) => <div key={x} className="hm-art-row"><span className="hm-num">{i + 1}</span><span className="grow"><b>{x}</b><small>Cited · un.org, mea.gov.in</small></span></div>)}
    <div className="hm-progress"><span><BookOpen />MUN Masterclass</span><div><i style={{ width: '68%' }} /></div><b>68%</b></div></div>;
}

// ---------- audiences ----------
const AUD = {
  organisers: { label: 'Organisers', icon: LayoutDashboard, title: 'Run the whole conference from one dashboard', points: ['A public page and registration link in about ten minutes', 'Automatic allotment, payment windows and reminders', 'Team roles with two-factor sign-in for anyone handling money', 'Chat, check-in, certificates, books and an offline copy'], to: '/list', cta: 'List your conference' },
  delegates: { label: 'Delegates', icon: GraduationCap, title: 'Prepare better and keep every conference in one account', points: ['Research briefs, paper and speech builders, practice rounds', 'The complete MUN Masterclass with an exam and certificate', 'Every registration from every organiser in one place', 'A MUN CV and saved conferences'], to: '/prep', cta: 'Start preparing' },
  chairs: { label: 'Chairs and EB', icon: Gavel, title: 'Chair committee from one screen, together', points: ['Roll call, speakers list, yields and rights of reply', 'Motions, voting on phones, vetoes and quorum rules', 'Working papers, draft resolutions and amendments', 'Shared EB marking, a points ranking and Excel exports'], to: '/session', cta: 'Start a session' },
} as const;
function Audiences() {
  const [k, setK] = useState<keyof typeof AUD>('organisers');
  return (
    <section className="hm-sec">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">Made for everyone in the room</div><h2>One platform, three ways in</h2></div>
        <div className="hm-tabs" role="tablist">{(Object.keys(AUD) as (keyof typeof AUD)[]).map((x) => { const I = AUD[x].icon; return <button key={x} role="tab" id={`aud-tab-${x}`} aria-controls={`aud-${x}`} data-aud={x} aria-selected={k === x} className={k === x ? 'on' : ''} onClick={() => setK(x)}><I />{AUD[x].label}</button>; })}</div>
        <div className="hm-aud">
          {/* Every panel is in the page (the inactive ones hidden), so the page also works as a static file. */}
          {(Object.keys(AUD) as (keyof typeof AUD)[]).map((x) => { const a = AUD[x]; return (
            <div key={x} id={`aud-${x}`} role="tabpanel" aria-labelledby={`aud-tab-${x}`} hidden={k !== x}><h3>{a.title}</h3><ul>{a.points.map((p) => <li key={p}><Check />{p}</li>)}</ul><Link to={a.to} className="hm-btn primary">{a.cta}<ArrowRight /></Link></div>); })}
          <div className="hm-aud-cards">
            {[[Zap, 'Fast to start', 'No installs and no training. It works in the browser on any device.'], [Lock, 'Safe by default', 'Two-factor sign-in, roles, an audit log and encrypted backups.'], [WifiOff, 'Works when Wi-Fi does not', 'Installable apps and an offline copy of your conference.'], [Globe, 'Your languages', 'The committee room runs in English, Spanish, French, Portuguese and Arabic.']].map(([I, t, d]: any) => <div key={t} className="hm-mini"><I /><b>{t}</b><p>{d}</p></div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [['1', 'List your conference', 'Answer a few questions: dates, committees, fees. You get a page and a registration link.', Monitor], ['2', 'Share your link', 'Post it to schools and social media. Applications, allotment and payments run themselves.', Users], ['3', 'Run the conference', 'Check delegates in, open the committee rooms, mark together, send certificates.', Timer]] as const;
  return (
    <section className="hm-sec alt">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">How it works</div><h2>Live in an afternoon</h2></div>
        <div className="hm-steps">{steps.map(([n, t, d, I]) => <div key={n} className="hm-step"><span className="hm-step-n">{n}</span><I className="hm-step-ic" /><b>{t}</b><p>{d}</p></div>)}</div>
      </div>
    </section>
  );
}

// ---------- pricing ----------
function Pricing() {
  return (
    <section className="hm-sec" id="pricing">
      <div className="hm-in">
        <div className="hm-head center"><div className="hm-eyebrow">Pricing</div><h2>Free to run your conference</h2><p>Everything on this page is free today, for organisers and delegates. Paid extras for larger organisers are on the way.</p></div>
        <div className="hm-prices">
          <div className="hm-price featured">
            <div className="hm-price-top"><b>Free</b><span className="hm-chip ok">Available now</span></div>
            <div className="hm-price-amt">₹0<small>for every conference</small></div>
            <ul>{['Unlimited conferences and delegates', 'Registration, allotment and payments', 'Live committee rooms and EB marking', 'Chat, check-in, certificates and accounts', 'Prep studio and the MUN Masterclass'].map((x) => <li key={x}><Check />{x}</li>)}</ul>
            <Link to="/list" className="hm-btn primary block">List your conference</Link>
          </div>
          <div className="hm-price">
            <div className="hm-price-top"><b>Pro</b><span className="hm-chip">Coming soon</span></div>
            <div className="hm-price-amt">Soon<small>for large conferences and societies</small></div>
            <ul>{['Your own domain and branding', 'Several conferences under one society', 'Priority support on conference days', 'Advanced reports and exports'].map((x) => <li key={x}><Check />{x}</li>)}</ul>
            <Link to="/contact" className="hm-btn ghost block">Tell me when it's ready</Link>
          </div>
          <div className="hm-price">
            <div className="hm-price-top"><b>Services</b><span className="hm-chip">On request</span></div>
            <div className="hm-price-amt">Quote<small>people, not software</small></div>
            <ul>{['One-to-one mentorship and batch classes', 'Recorded courses', 'Logistics and EB support', 'Legal and financial help for organisers'].map((x) => <li key={x}><Check />{x}</li>)}</ul>
            <Link to="/services" className="hm-btn ghost block">See services</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Apps() {
  return (
    <section className="hm-sec">
      <div className="hm-in hm-apps">
        <div><div className="hm-eyebrow">Apps</div><h2>On every device in the room</h2><p>Install it on Android, Windows, Mac or Linux, or add it to your home screen from the browser. Chairs, delegates and organisers all use the same app.</p>
          <div className="hm-ctas left"><Link className="hm-btn primary" to="/download"><Smartphone />Download the apps</Link><Link to="/download" className="hm-btn ghost">Which one do I need?</Link></div></div>
        <div className="hm-devices" aria-hidden>{([['Android', Smartphone], ['Windows', Monitor], ['macOS', Laptop], ['Linux', Monitor], ['Web', Globe]] as const).map(([d, I]) => <span key={d}><I />{d}</span>)}</div>
      </div>
    </section>
  );
}

const FAQ = [
  ['Is DelegateDesk really free?', 'Yes. Organisers list and run conferences for free, and delegates use Prep and the Masterclass for free. Paid extras for big organisers are coming later; everything free today stays free.'],
  ['Do delegate fees come to us?', 'Yes. Payments go straight into your own account by UPI, bank transfer or your payment gateway. DelegateDesk records them and handles proofs, receipts and refunds.'],
  ['Do delegates need an account to register?', 'No. They can register from your link. With a free account they also see every conference they joined, their allotments, a MUN CV and Prep.'],
  ['Can the whole EB chair together?', 'Yes. Every member of the dais opens the committee room on their own device with their own link, and marks show who gave them.'],
  ['What if the venue Wi-Fi drops?', 'The apps open without internet, and you can download an offline copy of your conference with every delegate, seat and payment.'],
  ['I organise and I am also a delegate. Do I need two accounts?', 'No. One sign-in opens both your organiser dashboard and your delegate profile.'],
];
function Faq() {
  return (
    <section className="hm-sec alt" id="faq">
      <div className="hm-in hm-faq">
        <div><div className="hm-eyebrow">FAQ</div><h2>Questions, answered</h2><p>Something else? <Link to="/contact">Talk to us</Link>.</p></div>
        <div className="hm-qs">{FAQ.map(([q, a], i) => (
          <details key={q} className="hm-q" open={i === 0}><summary>{q}<Plus className="plus" /><Minus className="minus" /></summary><p>{a}</p></details>))}</div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="hm-final">
      <div className="hm-in">
        <HeartHandshake className="hm-final-ic" />
        <h2>Your next conference, without the chaos.</h2>
        <p>List it in about ten minutes. It's free.</p>
        <div className="hm-ctas"><Link to="/list" className="hm-btn white">List your conference<ArrowRight /></Link><Link to="/prep" className="hm-btn outline">I'm a delegate</Link></div>
      </div>
    </section>
  );
}
