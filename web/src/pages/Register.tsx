import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, ApiError, qs } from '../api';
import { inr, date } from '../format';
import { Alert, ErrorBox, Field, Loading, Suggest, useAsync } from '../ui';

interface EventInfo {
  event: { code: string; name: string; venue: string; city: string; start_date: string; end_date: string; status: string };
  org: { name: string; legal_name: string; grievance: string };
  committees: { id: string; name: string; short: string; kind: string; open_seats: number; seats: number; full: boolean }[];
  classOptions: string[]; categories: string[]; gstRateBp: number; holdHours: number; feeModel: string; refundWindowDays: number;
}
const EMPTY = { full_name: '', email: '', mobile: '', institution: '', class_year: '', city: '', dob: '', referral_name: '', coupon: '', guardian_name: '', guardian_email: '', whatsapp_consent: false, consent: false, preferences: [] as string[], surprise: false };
type Form = typeof EMPTY;

export function PublicShell({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="public">
      <div className="public-head"><div className="inner"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>
      <div className="public-body">{children}</div>
    </div>
  );
}

const age = (dob: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null; const d = new Date(dob); const n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; };

export default function Register() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const info = useAsync<EventInfo>(() => api.get(`/api/public/events/${code}`), [code]);
  const draftKey = `dd-draft-${code}`;
  const [f, setF] = useState<Form>(() => { try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(draftKey) ?? '{}'), consent: false }; } catch { return EMPTY; } });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [refHint, setRefHint] = useState<string[]>([]);
  const started = useRef(Date.now());
  const [honey, setHoney] = useState('');

  // Draft saved every few seconds so a dropped connection loses nothing.
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify({ ...f, consent: false })); } catch { /* storage unavailable */ } }, 600); return () => clearTimeout(t); }, [f, draftKey]);

  const category = /faculty|advisor/i.test(f.class_year) ? 'advisor' : /UG|PG|Graduate/i.test(f.class_year) ? 'college' : 'school';
  useEffect(() => {
    if (!info.data) return;
    const t = setTimeout(() => api.get(`/api/public/events/${code}/quote${qs({ category, coupon: f.coupon.trim() })}`).then(setQuote).catch(() => setQuote(null)), 250);
    return () => clearTimeout(t);
  }, [category, f.coupon, code, info.data]);

  useEffect(() => {
    if (f.referral_name.trim().length < 2) { setRefHint([]); return; }
    const t = setTimeout(() => api.get<string[]>(`/api/public/events/${code}/suggest/referrer${qs({ q: f.referral_name })}`).then(setRefHint).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [f.referral_name, code]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const minor = useMemo(() => { const a = age(f.dob); return a != null && a < 18; }, [f.dob]);
  const togglePref = (id: string) => {
    set('surprise', false);
    set('preferences', f.preferences.includes(id) ? f.preferences.filter((p) => p !== id) : f.preferences.length >= 3 ? f.preferences : [...f.preferences, id]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local: Record<string, string> = {};
    if (!f.surprise && !f.preferences.length) local.preferences = 'Pick up to three committees, or choose “Surprise me”';
    if (!f.consent) local.consent = 'Please accept to continue';
    if (Object.keys(local).length) { setErrors(local); return; }
    setBusy(true);
    try {
      const out = await api.post<any>(`/api/public/events/${code}/register`, { ...f, preferences: f.surprise ? [] : f.preferences, website: honey, startedAt: started.current });
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      nav(`/r/${out.token}?welcome=1`);
    } catch (err) {
      const e2 = err as ApiError;
      setErrors(e2.details?.fields ?? {});
      setFormError(e2.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally { setBusy(false); }
  }

  if (info.loading && !info.data) return <PublicShell title="Loading…"><Loading /></PublicShell>;
  if (info.error) return <PublicShell title="Registration"><ErrorBox error={info.error} /></PublicShell>;
  const ev = info.data!;
  const closed = ev.event.status !== 'open';
  const err = (k: string) => errors[k];

  return (
    <PublicShell title={ev.event.name} subtitle={<>{[ev.event.venue, ev.event.city].filter(Boolean).join(', ')}{ev.event.start_date ? ` · ${date(ev.event.start_date)} – ${date(ev.event.end_date)}` : ''}</>}>
      <div className="card stack">
        <div className="row between"><h2 style={{ margin: 0 }}>Register in 30 seconds</h2><Link to={`/register/${code}/delegation`} className="small">Registering a whole delegation?</Link></div>
        <p className="muted small" style={{ margin: 0 }}>No account or password. You get your committee and portfolio on the next screen.</p>
        {closed && <Alert tone="warn">Registration for this event is closed.</Alert>}
        {formError && <Alert tone="bad">{formError}</Alert>}
        <form className="stack" onSubmit={submit} noValidate>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} style={{ position: 'absolute', left: -9999 }} aria-hidden />
          <Field label="Full name" hint="as it should print on your badge and certificate" error={err('full_name')}>
            <input autoComplete="name" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} className={err('full_name') ? 'invalid' : ''} required />
          </Field>
          <div className="grid g2">
            <Field label="Email" error={err('email')}><input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={err('email') ? 'invalid' : ''} required /></Field>
            <Field label="Mobile (WhatsApp)" error={err('mobile')}><input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="10-digit number" maxLength={14} value={f.mobile} onChange={(e) => set('mobile', e.target.value)} className={err('mobile') ? 'invalid' : ''} required /></Field>
          </div>
          <Field label="School or college" error={err('institution')}>
            <Suggest value={f.institution} onChange={(v) => set('institution', v)} invalid={!!err('institution')} autoComplete="organization" fetcher={(q) => api.get(`/api/public/events/${code}/suggest/institution${qs({ q })}`)} />
          </Field>
          <div className="grid g3">
            <Field label="Class or year" error={err('class_year')}>
              <select value={f.class_year} onChange={(e) => set('class_year', e.target.value)} className={err('class_year') ? 'invalid' : ''} required>
                <option value="">Choose…</option>{ev.classOptions.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="City" error={err('city')}><Suggest value={f.city} onChange={(v) => set('city', v)} invalid={!!err('city')} autoComplete="address-level2" fetcher={(q) => api.get(`/api/public/events/${code}/suggest/city${qs({ q })}`)} /></Field>
            <Field label="Date of birth" error={err('dob')}><input type="date" autoComplete="bday" value={f.dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('dob', e.target.value)} className={err('dob') ? 'invalid' : ''} required /></Field>
          </div>
          {minor && (
            <div className="stack" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '.8rem' }}>
              <div className="small"><strong>You are under 18.</strong> We will ask a parent, guardian or your school to consent before we store anything beyond this basic registration.</div>
              <div className="grid g2">
                <Field label="Parent / guardian / school contact name" error={err('guardian_name')}><input value={f.guardian_name} onChange={(e) => set('guardian_name', e.target.value)} className={err('guardian_name') ? 'invalid' : ''} /></Field>
                <Field label="Their email" error={err('guardian_email')}><input type="email" inputMode="email" value={f.guardian_email} onChange={(e) => set('guardian_email', e.target.value)} className={err('guardian_email') ? 'invalid' : ''} /></Field>
              </div>
            </div>
          )}
          <Field label="Committee preference" hint="pick up to three, in order" error={err('preferences')}>
            <div className="chips" role="group" aria-label="Committees">
              {ev.committees.map((c) => {
                const i = f.preferences.indexOf(c.id);
                return <button type="button" key={c.id} className={`chip ${i >= 0 ? 'on' : ''}`} aria-pressed={i >= 0} onClick={() => togglePref(c.id)} title={c.name} aria-label={`${c.short}: ${c.name}${c.full ? " (full)" : ""}`}>
                  {i >= 0 && <span className="n">{i + 1}</span>}{c.short}{c.full && <span className="faint small">(full)</span>}
                </button>;
              })}
              <button type="button" className={`chip ${f.surprise ? 'on' : ''}`} aria-pressed={f.surprise} onClick={() => { set('preferences', []); set('surprise', !f.surprise); }}>✨ Surprise me</button>
            </div>
            {f.preferences.length > 0 && <span className="hint">{f.preferences.map((p, i) => `${i + 1}. ${ev.committees.find((c) => c.id === p)?.name}`).join('   ')}</span>}
          </Field>
          <Field label="Referred by" hint="optional" error={err('referral_name')}>
            <input value={f.referral_name} onChange={(e) => set('referral_name', e.target.value)} placeholder="Name of the ambassador, teacher or school" />
            {refHint.length > 0 && !refHint.includes(f.referral_name) && (
              <span className="row small" style={{ fontWeight: 400 }}>Did you mean {refHint.slice(0, 3).map((n) => <button type="button" key={n} className="chip" style={{ minHeight: 30, padding: '.15rem .6rem' }} onClick={() => set('referral_name', n)}>{n}</button>)}<span className="faint">or keep your spelling</span></span>
            )}
          </Field>
          <details>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Have a coupon code?</summary>
            <div style={{ marginTop: '.5rem' }}><input value={f.coupon} onChange={(e) => set('coupon', e.target.value.toUpperCase())} placeholder="e.g. EARLY10" /></div>
          </details>
          {quote && !quote.error && (
            <div className="fee-box" aria-live="polite">
              <div className="line"><span>{quote.tierName} fee ({category})</span><span>{inr(quote.basePaise)}</span></div>
              {quote.discountPaise > 0 && <div className="line" style={{ color: 'var(--good)' }}><span>{quote.discountLabel}</span><span>−{inr(quote.discountPaise)}</span></div>}
              {quote.gstPaise > 0 && <div className="line muted"><span>GST {quote.gstRateBp / 100}%</span><span>{inr(quote.gstPaise)}</span></div>}
              <div className="line total"><span>Total</span><span>{inr(quote.totalPaise)}</span></div>
              {quote.feeModel === 'two_stage' && <div className="small muted">Pay {inr(quote.payNowPaise)} now as the application fee; the balance after acceptance.</div>}
              <div className="small faint">High-demand portfolios may add a small premium; you’ll see the exact amount before paying.</div>
            </div>
          )}
          {quote?.error && f.coupon && <Alert tone="warn">{quote.error}</Alert>}
          <label className="check"><input type="checkbox" checked={f.whatsapp_consent} onChange={(e) => set('whatsapp_consent', e.target.checked)} /><span className="small">Also send confirmations and reminders on WhatsApp</span></label>
          <label className="check"><input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} /><span className="small">I agree to the <Link to="/privacy" target="_blank">privacy notice</Link> and the refund policy (refund requests close {ev.refundWindowDays} days before the event).</span></label>
          {err('consent') && <span className="small" style={{ color: 'var(--bad)' }}>{err('consent')}</span>}
          <button className="btn primary lg block" type="submit" disabled={busy || closed}>{busy ? 'Saving…' : 'Register and get my portfolio'}</button>
          <p className="small faint" style={{ margin: 0 }}>Your seat is held for {ev.holdHours} hours while you pay. Your progress is saved on this device.</p>
        </form>
      </div>
      <p className="small faint" style={{ textAlign: 'center', marginTop: '1rem' }}>{ev.org.legal_name}{ev.org.grievance ? ` · Grievances: ${ev.org.grievance}` : ''}</p>
    </PublicShell>
  );
}
