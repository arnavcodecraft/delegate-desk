import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ArrowLeft, Upload, Camera, CalendarDays, Search, Plus, Pencil, Trash2, Gift, Banknote, Check, Vote, CreditCard, Landmark, Mail, Globe2, Megaphone,
  AtSign, ThumbsUp, Music2, MessageCircle, Globe, Copy, ExternalLink, LayoutDashboard, PartyPopper, Info,
} from 'lucide-react';
import { api, ApiError } from '../api';
import { PLACES, countryName } from '../data/countries';
import { TYPE_INFO, type CommitteeType } from '../data/committees';
import { PlatformShell, useMe, usePerson, refreshMe } from './Shell';
import { InPersonArt, OnlineArt, SchoolArt, UniversityArt, People, Emblem, BANNER_PRESETS, bannerStyle, shrinkImage } from './art';
import { CommitteeEditor, TypePicker, blankCommittee, toApi, shortFrom, type CommitteeDraft } from './CommitteeEditor';

interface Draft {
  name: string; acronym: string; acronymTouched: boolean; logo: string | null; banner: string; startDate: string; endDate: string; datesTbd: boolean;
  format: '' | 'in_person' | 'online' | 'hybrid'; level: '' | 'high_school' | 'university' | 'both'; country: string; city: string; expected: number | null;
  committees: CommitteeDraft[]; description: string; socials: { instagram: string; facebook: string; tiktok: string; whatsapp: string; website: string };
  paid: boolean | null; feeRupees: string; uses: string[]; contactEmail: string;
}
const EMPTY: Draft = {
  name: '', acronym: '', acronymTouched: false, logo: null, banner: 'p1', startDate: '', endDate: '', datesTbd: false, format: '', level: '', country: '', city: '', expected: null,
  committees: [], description: '', socials: { instagram: '', facebook: '', tiktok: '', whatsapp: '', website: '' }, paid: null, feeRupees: '', uses: [], contactEmail: '',
};
const KEY = 'dd-list-draft';
const load = (): Draft => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return EMPTY; } };

const STEPS = ['conference', 'format', 'level', 'where', 'size', 'committees', 'about', 'pay', 'uses', 'review'] as const;
type Step = (typeof STEPS)[number];
const USES = [
  { key: 'applications', title: 'Applications & Allocations', text: 'Collect applications, score them, assign countries.', icon: Vote, color: '#1f4fe0' },
  { key: 'payments', title: 'Payments', text: 'Take delegate fees straight into your own account.', icon: CreditCard, color: '#2f6bff' },
  { key: 'committees', title: 'Running Committees', text: 'Live rooms, speakers lists, voting, the scoreboard.', icon: Landmark, color: '#3b5bdb' },
  { key: 'emails', title: 'Emails', text: 'One send to everyone, or to a committee, or to the unpaid.', icon: Mail, color: '#0b6bcb' },
  { key: 'chairs', title: 'Recruiting Chairs', text: 'Post the roles and let chairs apply from anywhere.', icon: Globe2, color: '#1c7ed6' },
  { key: 'marketing', title: 'Marketing', text: 'Listed on Explore with a page made to share.', icon: Megaphone, color: '#4263eb' },
];
const SIZES = [{ n: 50, label: 'Up to 50', sub: 'Intimate', art: 1 }, { n: 100, label: '~100', sub: 'Mid-size', art: 2 }, { n: 250, label: '~250', sub: 'Large', art: 3 }, { n: 500, label: '500+', sub: 'Flagship', art: 4 }] as const;
const FORMAT = { in_person: 'In person', online: 'Online', hybrid: 'Hybrid' } as const;
const LEVEL = { high_school: 'High school', university: 'University', both: 'Both' } as const;

function fmtDates(d: Draft) {
  if (d.datesTbd || !d.startDate) return null;
  const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return d.endDate && d.endDate !== d.startDate ? `${f(d.startDate)} – ${f(d.endDate)}` : f(d.startDate);
}

export default function ListConference() {
  const me = useMe();
  const nav = useNavigate();
  const [d, setD] = useState<Draft>(load);
  const [step, setStep] = useState<Step>('conference');
  const [done, setDone] = useState<any>(null);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage full or blocked: the wizard still works */ } }, [d]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);
  const i = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, i + 1)]);
  const back = () => (i === 0 ? nav('/') : setStep(STEPS[i - 1]));
  const signedIn = !!me?.user && !me.mfaPending;
  const canCreate = signedIn ? (me?.perms ?? []).includes('event.config') : true;

  if (done) return <PlatformShell><Success out={done} onAnother={() => { setDone(null); setD(EMPTY); setStep('conference'); }} /></PlatformShell>;
  return (
    <PlatformShell>
      <div className="pf-narrow">
        <div className="pf-dots" aria-label={`Step ${i + 1} of ${STEPS.length}`}>{STEPS.map((s, j) => <i key={s} className={j < i ? 'done' : j === i ? 'now' : ''} />)}</div>
        {signedIn && !canCreate && <div className="pf-note" style={{ marginBottom: 16 }}><Info className="icon" /><span>You're signed in as {me!.user!.email}, which can't create conferences. Ask your admin, or sign out to list a conference as a new organiser.</span></div>}
        <div className="pf-step" key={step}>
          {step === 'conference' && <StepConference d={d} set={set} next={next} />}
          {step === 'format' && (
            <Frame title="In person or online?" sub="How will delegates attend your conference?" back={back}>
              <div className="pf-choices">
                <Choice on={d.format === 'in_person'} art={<InPersonArt />} title="In Person" text="A real venue, real gavels" onClick={() => { set({ format: 'in_person' }); next(); }} />
                <Choice on={d.format === 'online'} art={<OnlineArt />} title="Online" text="Fully remote committees" onClick={() => { set({ format: 'online' }); next(); }} />
              </div>
              <div className="pf-step-foot"><button className={`pf-pill ${d.format === 'hybrid' ? 'on' : ''}`} onClick={() => { set({ format: 'hybrid' }); next(); }}>A bit of both, it's hybrid</button></div>
            </Frame>
          )}
          {step === 'level' && (
            <Frame title="High school or university level?" sub="Who is your conference for?" back={back}>
              <div className="pf-choices">
                <Choice on={d.level === 'high_school'} art={<SchoolArt />} title="High School" text="Secondary-school delegates" onClick={() => set({ level: 'high_school' })} />
                <Choice on={d.level === 'university'} art={<UniversityArt />} title="University" text="University students and above" onClick={() => set({ level: 'university' })} />
              </div>
              <div className="pf-step-foot">
                <button className={`pf-pill ${d.level === 'both' ? 'on' : ''}`} onClick={() => set({ level: 'both' })}>Open to both</button>
                <button className="pf-btn primary" disabled={!d.level} onClick={next}>Continue</button>
              </div>
            </Frame>
          )}
          {step === 'where' && <StepWhere d={d} set={set} next={next} back={back} />}
          {step === 'size' && (
            <Frame title="How many delegates do you expect?" sub="A rough number is fine, you can change it any time in Settings." back={back}>
              <div className="pf-choices four pf-size">
                {SIZES.map((s) => <Choice key={s.n} small on={d.expected === s.n} art={null} glyph={<div className="glyph-people"><People n={s.art} /></div>} title={s.label} text={s.sub} onClick={() => set({ expected: s.n })} />)}
              </div>
              <div className="pf-field" style={{ marginTop: 22 }}>
                <label className="pf-label" htmlFor="exact">Or an exact number</label>
                <input id="exact" className="pf-input" inputMode="numeric" placeholder="e.g. 300" value={d.expected && !SIZES.some((s) => s.n === d.expected) ? d.expected : ''} onChange={(e) => set({ expected: e.target.value ? Math.max(0, Number(e.target.value.replace(/\D/g, ''))) : null })} />
              </div>
              <div className="pf-step-foot"><button className="pf-btn primary" disabled={!d.expected} onClick={next}>Continue</button></div>
            </Frame>
          )}
          {step === 'committees' && <StepCommittees d={d} set={set} next={next} back={back} />}
          {step === 'about' && <StepAbout d={d} set={set} next={next} back={back} />}
          {step === 'pay' && (
            <Frame title="How do delegates pay?" sub="You can change this later in Financials" back={back}>
              <div className="pf-choices">
                <Choice on={d.paid === false} art={null} glyph={<span className="glyph" style={{ background: 'var(--pf-gold-soft)', color: 'var(--pf-brand)' }}><Gift className="icon" /></span>} title="It's free" text="No delegate fee at all" onClick={() => set({ paid: false })} />
                <Choice on={d.paid === true} art={null} glyph={<span className="glyph" style={{ background: 'var(--pf-brand-soft)', color: 'var(--pf-brand)' }}><Banknote className="icon" /></span>} title="Delegates pay a fee" text="Set up how you get paid in Financials" onClick={() => set({ paid: true })} />
              </div>
              {d.paid && (
                <div className="pf-field" style={{ marginTop: 22 }}>
                  <label className="pf-label" htmlFor="fee">Delegate fee (₹) <span className="opt">you can add early-bird and late fees later</span></label>
                  <input id="fee" className="pf-input" inputMode="decimal" placeholder="e.g. 1800" value={d.feeRupees} onChange={(e) => set({ feeRupees: e.target.value.replace(/[^\d.]/g, '') })} />
                </div>
              )}
              <p className="pf-small pf-muted" style={{ marginTop: 16 }}>To set up payments for your conference, go to Financials once you finish setting up: bank transfer, UPI QR code, a payment link or in-person payment. Delegates upload their proof and you accept it.</p>
              <div className="pf-step-foot"><button className="pf-btn primary" disabled={d.paid == null || (d.paid && !(Number(d.feeRupees) > 0))} onClick={next}>Continue</button></div>
            </Frame>
          )}
          {step === 'uses' && (
            <Frame title="What will you use DelegateDesk for?" sub="Pick everything that applies. Your dashboard will put those first. Nothing is switched off by this." back={back}>
              <div className="pf-eyebrow" style={{ marginBottom: 10 }}>{d.uses.length} selected</div>
              <div className="pf-choices three">
                {USES.map((u) => {
                  const on = d.uses.includes(u.key);
                  return <Choice key={u.key} small on={on} art={null} glyph={<span className="glyph" style={{ background: `${u.color}1f`, color: u.color }}><u.icon className="icon" /></span>} title={u.title} text={u.text}
                    onClick={() => set({ uses: on ? d.uses.filter((x) => x !== u.key) : [...d.uses, u.key] })} />;
                })}
              </div>
              <div className="pf-step-foot">
                <label className="pf-check pf-small"><input type="checkbox" checked={d.uses.length === USES.length} onChange={(e) => set({ uses: e.target.checked ? USES.map((u) => u.key) : [] })} />Select all</label>
                <button className="pf-btn primary" onClick={next}>Continue to review</button>
              </div>
            </Frame>
          )}
          {step === 'review' && <StepReview d={d} set={set} go={setStep} back={back} signedIn={signedIn} canCreate={canCreate} me={me} onDone={(out) => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } refreshMe(); setDone(out); }} />}
        </div>
      </div>
    </PlatformShell>
  );
}

function Frame({ title, sub, back, children }: { title: string; sub?: string; back: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="pf-step-head">
        <button className="pf-back" onClick={back} aria-label="Back"><ArrowLeft className="icon" /></button>
        <div className="t"><h1 className="pf-h1" style={{ fontSize: 'clamp(26px, 4.2vw, 40px)' }}>{title}</h1>{sub && <p className="pf-sub" style={{ fontSize: 15 }}>{sub}</p>}</div>
        <span />
      </div>
      {children}
    </>
  );
}
function Choice({ on, art, glyph, title, text, onClick, small }: { on: boolean; art: React.ReactNode; glyph?: React.ReactNode; title: string; text: string; onClick: () => void; small?: boolean }) {
  return (
    <button type="button" className={`pf-choice ${on ? 'on' : ''} ${small ? 'small' : ''}`} onClick={onClick} aria-pressed={on}>
      <span className="tick"><Check className="icon" /></span>
      {art && <div className="art">{art}</div>}
      {glyph}
      <div className="txt"><strong>{title}</strong><span>{text}</span></div>
    </button>
  );
}

// ---------- step 1: name, look and dates ----------
function StepConference({ d, set, next }: { d: Draft; set: (p: Partial<Draft>) => void; next: () => void }) {
  const logoIn = useRef<HTMLInputElement>(null); const bannerIn = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const bn = bannerStyle(d.banner);
  const year = (d.startDate || new Date().toISOString()).slice(0, 4);
  const pick = async (f: File | undefined, kind: 'logo' | 'banner') => {
    if (!f) return; setErr(null);
    try { const url = await shrinkImage(f, kind); set(kind === 'logo' ? { logo: url } : { banner: url }); } catch (e: any) { setErr(e.message); }
  };
  const nameOk = d.name.trim().length >= 3;
  const datesOk = d.datesTbd || !d.startDate || !d.endDate || d.endDate >= d.startDate;
  return (
    <>
      <h1 className="pf-h1">Your Conference</h1>
      <p className="pf-sub">Its name, its look and its dates. You can change any of it later.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 30, marginTop: 30 }}>
        <div>
          <div className="pf-card pf-preview">
            <div className={`pf-banner ${bn.className}`} style={bn.style}>
              <button className="pf-btn sm add" style={{ background: 'rgb(255 255 255 / .16)', color: '#fff', backdropFilter: 'blur(6px)', border: '1px solid rgb(255 255 255 / .25)' }} onClick={() => bannerIn.current?.click()}><Upload className="icon" />Add a banner</button>
            </div>
            <div className="body">
              <div className="pf-logo" onClick={() => logoIn.current?.click()} role="button" tabIndex={0} aria-label="Upload logo" onKeyDown={(e) => e.key === 'Enter' && logoIn.current?.click()}>
                {d.logo ? <img src={d.logo} alt="" /> : <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13 }}><Upload className="icon" style={{ display: 'block', margin: '0 auto 4px' }} />Logo</div>}
                <span className="cam"><Camera style={{ width: 15, height: 15 }} /></span>
              </div>
              <h3>{d.acronym || 'Your acronym'}</h3>
              <div className="pf-muted">{d.name || 'Full conference name'}</div>
              <div className="pf-meta" style={{ marginTop: 12 }}><span><CalendarDays className="icon" />{fmtDates(d) ?? (d.datesTbd ? 'Dates to be decided' : 'Add your dates')}</span></div>
            </div>
          </div>
          <div className="pf-label" style={{ marginTop: 18, display: 'flex' }}>Banner <span className="opt" style={{ marginLeft: 'auto' }}>Optional</span></div>
          <div className="pf-swatches">
            {BANNER_PRESETS.map((p) => <button key={p} className={`pf-swatch bn-${p} ${d.banner === p ? 'on' : ''}`} onClick={() => set({ banner: p })} aria-label={`Banner ${p}`} />)}
            <button className={`pf-swatch upload ${!BANNER_PRESETS.includes(d.banner) ? 'on' : ''}`} onClick={() => bannerIn.current?.click()} aria-label="Upload banner"><Upload className="icon" /></button>
          </div>
          <input ref={logoIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0], 'logo')} />
          <input ref={bannerIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0], 'banner')} />
          {err && <div className="pf-err">{err}</div>}
        </div>
        <div>
          <div className="pf-field">
            <label className="pf-label" htmlFor="name">Full name</label>
            <input id="name" className="pf-input" value={d.name} autoFocus placeholder="e.g. Bengaluru Global Youth Summit" maxLength={120}
              onChange={(e) => set({ name: e.target.value, ...(d.acronymTouched ? {} : { acronym: shortFrom(e.target.value) }) })} />
          </div>
          <div className="pf-field">
            <label className="pf-label" htmlFor="acr">Acronym</label>
            <input id="acr" className="pf-input" value={d.acronym} maxLength={24} placeholder="e.g. BGYS" onChange={(e) => set({ acronym: e.target.value, acronymTouched: true })} />
            <div className="pf-hint">Suggested from the name. Use whatever your conference goes by. The edition year ({year.slice(2)}) is added to your link for you.</div>
          </div>
          <div className="pf-label" style={{ display: 'flex' }}>Dates <span className="opt" style={{ marginLeft: 'auto' }}>Optional</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
            <div><div className="pf-small pf-muted" style={{ marginBottom: 6 }}>First day</div><input type="date" className="pf-input" value={d.startDate} disabled={d.datesTbd} onChange={(e) => set({ startDate: e.target.value, endDate: d.endDate && d.endDate < e.target.value ? e.target.value : d.endDate })} aria-label="First day" /></div>
            <div><div className="pf-small pf-muted" style={{ marginBottom: 6 }}>Last day</div><input type="date" className="pf-input" value={d.endDate} min={d.startDate || undefined} disabled={d.datesTbd} onChange={(e) => set({ endDate: e.target.value })} aria-label="Last day" /></div>
          </div>
          {!datesOk && <div className="pf-err">The last day must be on or after the first day</div>}
          <label className="pf-check" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={d.datesTbd} onChange={(e) => set({ datesTbd: e.target.checked })} />
            <span><strong>Dates are to be decided</strong><span className="pf-small pf-muted">Explore lists it under "Dates to be decided" until you add them. You can still open applications.</span></span>
          </label>
        </div>
      </div>
      <div className="pf-step-foot"><button className="pf-btn primary" disabled={!nameOk || !datesOk} onClick={next}>Continue</button>{!nameOk && <span className="pf-small pf-faint">Enter the conference name to continue</span>}</div>
    </>
  );
}

// ---------- step 4: country and city ----------
function StepWhere({ d, set, next, back }: { d: Draft; set: (p: Partial<Draft>) => void; next: () => void; back: () => void }) {
  const [q, setQ] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return PLACES.filter((p) => !t || p.name.toLowerCase().includes(t)); }, [q]);
  useEffect(() => { if (d.country && !q) grid.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const online = d.format === 'online';
  return (
    <Frame title="Where is it happening?" sub={online ? 'Where your team is based. Online conferences still show a home country.' : 'Country first, then the city.'} back={back}>
      <div className="pf-search"><Search className="icon" /><input className="pf-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search countries" /></div>
      <div className="pf-country-grid" ref={grid}>
        {list.map((p) => <button key={p.code} className={`pf-country ${d.country === p.code ? 'on' : ''}`} onClick={() => set({ country: p.code })}><span className={`fi fi-${p.code}`} />{p.name}</button>)}
        {!list.length && <div className="pf-muted" style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center' }}>No country matches "{q}"</div>}
      </div>
      <div className="pf-field" style={{ marginTop: 20 }}>
        <label className="pf-label" htmlFor="city">City {online && <span className="opt">Optional</span>}</label>
        <input id="city" className="pf-input" value={d.city} onChange={(e) => set({ city: e.target.value })} placeholder={d.country === 'in' ? 'e.g. Bengaluru' : 'e.g. The Hague'} />
      </div>
      <div className="pf-step-foot"><button className="pf-btn primary" disabled={!d.country || (!online && !d.city.trim())} onClick={next}>Continue</button></div>
    </Frame>
  );
}

// ---------- step 6: committees ----------
function StepCommittees({ d, set, next, back }: { d: Draft; set: (p: Partial<Draft>) => void; next: () => void; back: () => void }) {
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ c: CommitteeDraft; index: number | null } | null>(null);
  const seats = d.committees.reduce((s, c) => s + c.portfolios.length * c.perCountry, 0);
  return (
    <Frame title="Set up your committees" sub="Delegates apply to a committee, so you need at least one. Add as many as you like, you can add more any time." back={back}>
      {d.committees.length > 0 && (
        <div className="pf-card" style={{ marginBottom: 16 }}>
          {d.committees.map((c, i) => (
            <div className="pf-committee-row" key={i}>
              <Emblem k={c.emblem} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 750 }}>{c.short} <span className="pf-muted" style={{ fontWeight: 500 }}>· {c.name}</span></div>
                <div className="pf-small pf-muted">{TYPE_INFO[c.type].label} · {c.portfolios.length} {TYPE_INFO[c.type].noun}{c.perCountry > 1 ? ` × ${c.perCountry}` : ''}{c.topics[0] ? ` · ${c.topics[0]}` : ''}</div>
              </div>
              <button className="pf-btn ghost sm" onClick={() => setEditing({ c, index: i })} aria-label={`Edit ${c.short}`}><Pencil className="icon" /></button>
              <button className="pf-btn ghost sm" onClick={() => set({ committees: d.committees.filter((_, j) => j !== i) })} aria-label={`Remove ${c.short}`}><Trash2 className="icon" /></button>
            </div>
          ))}
        </div>
      )}
      <button className="pf-dropzone" style={{ width: '100%', font: 'inherit', color: 'inherit' }} onClick={() => setPicking(true)}>
        <div><div className="plus"><Plus className="icon" /></div><b style={{ color: 'var(--pf-brand)' }}>{d.committees.length ? 'Add another committee' : 'Add your first committee'}</b>
          {d.committees.length > 0 && <div className="pf-small pf-muted" style={{ marginTop: 4 }}>{seats} seats so far{d.expected ? ` for ${d.expected} expected delegates` : ''}</div>}</div>
      </button>
      <p className="pf-small pf-muted pf-center" style={{ marginTop: 14 }}>Chairs come later from the Job Board and Applications. Everything else is right here.</p>
      <div className="pf-step-foot">
        <button className="pf-btn primary" onClick={next}>Continue</button>
        {!d.committees.length && <span className="pf-small pf-muted">No committees yet? Continue and add them later in Committees.</span>}
      </div>
      {picking && <TypePicker onClose={() => setPicking(false)} onPick={(t: CommitteeType) => { setPicking(false); setEditing({ c: blankCommittee(t), index: null }); }} />}
      {editing && <CommitteeEditor initial={editing.c} onCancel={() => setEditing(null)} onSave={(c) => {
        const others = d.committees.filter((_, j) => j !== editing.index);
        if (others.some((o) => o.short.toUpperCase() === c.short.toUpperCase())) throw new Error(`You already have a committee called ${c.short}. Give this one a different short name.`);
        const list = [...d.committees];
        if (editing.index == null) list.push(c); else list[editing.index] = c;
        set({ committees: list }); setEditing(null);
      }} />}
    </Frame>
  );
}

// ---------- step 7: description and social links ----------
function StepAbout({ d, set, next, back }: { d: Draft; set: (p: Partial<Draft>) => void; next: () => void; back: () => void }) {
  const s = d.socials;
  const row = (k: keyof Draft['socials'], Icon: any, ph: string, label: string) => (
    <div className="pf-icon-input" style={{ marginBottom: 12 }}><Icon className="icon" /><input className="pf-input" style={{ minHeight: 50 }} aria-label={label} placeholder={ph} value={s[k]} onChange={(e) => set({ socials: { ...s, [k]: e.target.value } })} /></div>
  );
  return (
    <Frame title="Tell delegates about it" sub="A short description and your social links for the public page. All optional, skip if you'd rather add them later." back={back}>
      <label className="pf-label" htmlFor="desc">Description</label>
      <textarea id="desc" className="pf-input" maxLength={1500} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="What makes your conference special? Themes, committees, the experience delegates can expect…" />
      <div className="pf-small pf-faint" style={{ textAlign: 'right', marginTop: 4 }}>{d.description.length} / 1500</div>
      <div className="pf-card pad" style={{ marginTop: 14 }}>
        <div className="pf-label">Social links</div>
        {row('instagram', AtSign, '@yourmun or instagram.com/yourmun', 'Instagram')}
        {row('facebook', ThumbsUp, 'facebook.com/yourmun', 'Facebook')}
        {row('tiktok', Music2, '@yourmun', 'TikTok')}
        {row('whatsapp', MessageCircle, 'wa.me/91… or your number', 'WhatsApp')}
        {row('website', Globe, 'yourmun.org', 'Website')}
      </div>
      <div className="pf-step-foot"><button className="pf-btn primary" onClick={next}>Continue</button><button className="pf-btn link" onClick={next}>Do this later</button></div>
    </Frame>
  );
}

// ---------- step 10: review and create ----------
function StepReview({ d, set, go, back, signedIn, canCreate, me, onDone }: { d: Draft; set: (p: Partial<Draft>) => void; go: (s: Step) => void; back: () => void; signedIn: boolean; canCreate: boolean; me: any; onDone: (out: any) => void }) {
  const [acct, setAcct] = useState({ name: '', email: '', password: '', organisation: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string>('');
  // Signed in as a delegate but not as an organiser: create it with that same account.
  const person = usePerson()?.person;
  const [asPerson, setAsPerson] = useState(true);
  const usePersonAcct = !signedIn && !!person && asPerson;
  useEffect(() => { api.get<{ code: string }>(`/api/platform/check-code?acronym=${encodeURIComponent(d.acronym || shortFrom(d.name))}&start=${d.startDate}`).then((r) => setCode(r.code)).catch(() => {}); }, [d.acronym, d.name, d.startDate]);
  useEffect(() => { if (!d.contactEmail && signedIn) set({ contactEmail: me?.user?.email ?? '' }); }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: [string, React.ReactNode, Step][] = [
    ['Conference', `${d.name || '—'}${d.acronym ? ` (${d.acronym})` : ''}`, 'conference'],
    ['Link', code ? `${location.host}/c/${code.toLowerCase()}` : '…', 'conference'],
    ['Logo', d.logo ? 'Added' : null, 'conference'],
    ['Banner', BANNER_PRESETS.includes(d.banner) ? `Colour ${d.banner.slice(1)}` : 'Uploaded', 'conference'],
    ['Dates', fmtDates(d) ?? (d.datesTbd ? 'To be decided' : null), 'conference'],
    ['Format', d.format ? FORMAT[d.format] : null, 'format'],
    ['Level', d.level ? LEVEL[d.level] : null, 'level'],
    ['Location', d.country ? [d.city, countryName(d.country)].filter(Boolean).join(', ') : null, 'where'],
    ['Expected delegates', d.expected ? String(d.expected) : null, 'size'],
    [`Committees (${d.committees.length})`, d.committees.length ? d.committees.map((c) => c.short).join(', ') : null, 'committees'],
    ['Description', d.description ? `${d.description.slice(0, 60)}${d.description.length > 60 ? '…' : ''}` : null, 'about'],
    ['Social links', Object.values(d.socials).filter(Boolean).length ? `${Object.values(d.socials).filter(Boolean).length} added` : null, 'about'],
    ['Delegate payments', d.paid == null ? null : d.paid ? `₹${Number(d.feeRupees).toLocaleString('en-IN')} per delegate, set up in Financials` : 'Free', 'pay'],
    ['Using DelegateDesk for', d.uses.length ? USES.filter((u) => d.uses.includes(u.key)).map((u) => u.title).join(', ') : null, 'uses'],
  ];
  const missing = !d.name.trim() || !d.format || !d.level || !d.country || d.paid == null;
  async function create() {
    setBusy(true); setError(null); setErrors({});
    try {
      const draft = {
        name: d.name.trim(), acronym: d.acronym.trim(), logo: d.logo, banner: d.banner, startDate: d.datesTbd ? null : d.startDate || null, endDate: d.datesTbd ? null : d.endDate || d.startDate || null,
        datesTbd: d.datesTbd || !d.startDate, format: d.format, level: d.level, country: d.country, city: d.city.trim(), expected: d.expected ?? 0,
        committees: d.committees.map(toApi), description: d.description, socials: d.socials, free: d.paid === false, delegateFeePaise: d.paid ? Math.round(Number(d.feeRupees) * 100) : 0,
        uses: d.uses, contactEmail: d.contactEmail.trim() || (usePersonAcct ? person.email : acct.email.trim()),
      };
      const out = await api.post('/api/platform/launch', signedIn ? { draft } : usePersonAcct ? { draft, account: { organisation: acct.organisation }, usePerson: true } : { draft, account: acct });
      onDone(out);
    } catch (e: any) {
      if (e instanceof ApiError && e.details?.fields) setErrors(e.details.fields);
      setError(e.message);
    } finally { setBusy(false); }
  }
  return (
    <Frame title="Ready to create it?" sub="Check everything over, tap any row to change it." back={back}>
      <div className="pf-review">
        {rows.map(([k, v, s]) => <button key={k} onClick={() => go(s)}><span className="k">{k}</span><span className={`v ${v ? '' : 'skip'}`}>{v ?? 'Skipped'}</span><Pencil className="icon" /></button>)}
      </div>
      <div className="pf-field" style={{ marginTop: 22 }}>
        <label className="pf-label" htmlFor="contact">Organiser contact email</label>
        <div className="pf-icon-input"><Mail className="icon" /><input id="contact" className="pf-input" type="email" value={d.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="Shown on your public page" /></div>
      </div>
      {usePersonAcct && (
        <div className="pf-card pad" style={{ marginTop: 6 }}>
          <div className="pf-h2" style={{ fontSize: 19 }}>Use my DelegateDesk account</div>
          <p className="pf-small pf-muted" style={{ margin: '4px 0 16px' }}>You'll run this conference as <b>{person.email}</b>, with the same password. One sign-in opens both your delegate profile and your organiser dashboard. <button type="button" className="pf-btn link" onClick={() => setAsPerson(false)}>Use a different email</button></p>
          <div className="pf-field">
            <label className="pf-label" htmlFor="a-organisation">Organisation or society</label>
            <input id="a-organisation" className="pf-input" autoComplete="organization" value={acct.organisation} onChange={(e) => setAcct({ ...acct, organisation: e.target.value })} placeholder={d.name || 'e.g. Harbour MUN Society'} />
          </div>
          {errors.email && <div className="pf-err">{errors.email}</div>}
        </div>
      )}
      {!signedIn && !usePersonAcct && (
        <div className="pf-card pad" style={{ marginTop: 6 }}>
          <div className="pf-h2" style={{ fontSize: 19 }}>Create your organiser account</div>
          <p className="pf-small pf-muted" style={{ margin: '4px 0 16px' }}>You'll manage the conference from here. Already have one? <a href="/login?next=/list">Sign in</a> and come back; your answers are saved.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 14px' }}>
            {([['name', 'Your name', 'text', 'name'], ['organisation', 'Organisation or society', 'text', 'organization'], ['email', 'Email', 'email', 'email'], ['password', 'Password (10+ characters)', 'password', 'new-password']] as const).map(([k, l, t, ac]) => (
              <div className="pf-field" key={k}>
                <label className="pf-label" htmlFor={`a-${k}`}>{l}</label>
                <input id={`a-${k}`} className={`pf-input ${errors[k] ? 'invalid' : ''}`} type={t} autoComplete={ac} value={acct[k]} onChange={(e) => setAcct({ ...acct, [k]: e.target.value })} placeholder={k === 'organisation' ? d.name || 'e.g. Harbour MUN Society' : ''} />
                {errors[k] && <div className="pf-err">{errors[k]}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {signedIn && <div className="pf-note green" style={{ marginTop: 6 }}><Check className="icon" /><span>Signed in as <b>{me.user.email}</b>{me.workspace ? <> · it will be added to <b>{me.workspace.name}</b></> : null}.</span></div>}
      {error && <div className="pf-note" style={{ marginTop: 14, background: 'var(--pf-red-soft)', color: 'var(--pf-red)' }}><Info className="icon" /><span>{error}</span></div>}
      <p className="pf-small pf-muted pf-center" style={{ marginTop: 18 }}>Your conference starts as a draft. Publish it from your dashboard to list it on Explore and open applications{d.datesTbd || !d.startDate ? '; it shows under "Dates to be decided" until you add them' : ''}.</p>
      <div className="pf-step-foot">
        <button className="pf-btn primary" disabled={busy || missing || !canCreate} onClick={create}>{busy ? 'Creating…' : 'Create conference'}</button>
        {missing && <span className="pf-small pf-faint">Fill in the skipped format, level, location and payment steps first</span>}
      </div>
    </Frame>
  );
}

function Success({ out, onAnother }: { out: any; onAnother: () => void }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(out.links.page, { width: 320, margin: 1 }).then(setQr).catch(() => {}); }, [out]);
  const copy = async (k: string, v: string) => { try { await navigator.clipboard.writeText(v); setCopied(k); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } };
  const Share = ({ k, label, url }: { k: string; label: string; url: string }) => (
    <div style={{ textAlign: 'left' }}>
      <div className="pf-label" style={{ fontSize: 14 }}>{label}</div>
      <div className="pf-share"><code>{url}</code><button className="pf-btn ghost sm" onClick={() => copy(k, url)}>{copied === k ? <><Check className="icon" />Copied</> : <><Copy className="icon" />Copy</>}</button></div>
    </div>
  );
  return (
    <div className="pf-success pf-narrow pf-step">
      <div className="big"><PartyPopper className="icon" /></div>
      <h1 className="pf-h1">{out.name} is created</h1>
      <p className="pf-sub">It's saved as a draft. Finish the set-up from your dashboard, then press <b>Publish</b> to go live on Explore and open applications.</p>
      <div className="pf-card pad" style={{ marginTop: 26, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Share k="page" label="Your conference page" url={out.links.page} />
          <Share k="reg" label="Delegate registration form" url={out.links.register} />
          <a className="pf-btn ghost sm" style={{ alignSelf: 'flex-start' }} href={`https://wa.me/?text=${encodeURIComponent(`${out.name}: apply here ${out.links.page}`)}`} target="_blank" rel="noreferrer"><MessageCircle className="icon" />Share on WhatsApp</a>
        </div>
        <div style={{ display: 'grid', placeItems: 'center', gap: 8 }}>{qr && <img className="pf-qr" src={qr} alt={`QR code for ${out.links.page}`} />}<a className="pf-small" href={qr} download={`${out.code}-qr.png`}>Download QR code</a></div>
      </div>
      <div className="pf-step-foot" style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="pf-btn primary" href={`/app/overview?event=${out.eventId}`}><LayoutDashboard className="icon" />Go to your dashboard</a>
        <a className="pf-btn ghost" href={`/c/${out.slug}?preview=1`} target="_blank" rel="noreferrer"><ExternalLink className="icon" />Preview the page</a>
        <button className="pf-btn link" onClick={onAnother}>List another conference</button>
      </div>
    </div>
  );
}
