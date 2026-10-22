import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import {
  ExternalLink, Copy, Check, ChevronRight, Rocket, EyeOff, Landmark, Banknote, Vote, Mail, Briefcase, Image as ImageIcon, Share2, Upload, Plus, Trash2, Gavel, Radio,
  BookOpen, FileText, Link2, QrCode, Building2, HandCoins, Gift, Wand2, Users,
} from 'lucide-react';
import { api } from '../api';
import { inr, dt, date, toPaise, label } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Tabs, useAsync, useToast, usePrompt, EmptyState, LineChart, Switch, Segmented } from '../ui';
import { PageHead, useStaff } from './Shell';
import { FeeTiers, PaymentRules } from './Settings';
import { PLACES } from '../data/countries';
import { shrinkImage, dataUrlToFile, BANNER_PRESETS, bannerStyle } from '../platform/art';

const ICON: Record<string, any> = { committees: Landmark, financial: Banknote, applications: Vote, page: ImageIcon, positions: Briefcase, communications: Mail, share: Share2 };
const CHANNEL: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', email: 'Email', explore: 'DelegateDesk Explore', google: 'Google', school: 'School', friend: 'A friend', direct: 'Direct / unknown', other: 'Other' };

function CopyBox({ value }: { value: string }) {
  const [ok, setOk] = useState(false);
  return <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><code className="mono small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, background: 'var(--surface-2)', padding: '.4rem .6rem', borderRadius: 8 }}>{value}</code>
    <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1400); } catch { /* blocked */ } }}>{ok ? <Check className="icon" /> : <Copy className="icon" />}{ok ? 'Copied' : 'Copy'}</button></div>;
}

function Donut({ value, total, label: l }: { value: number; total: number; label: string }) {
  const pct = total ? Math.min(1, value / total) : 0;
  const r = 52, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 130 130" width="150" height="150" role="img" aria-label={`${value} of ${total} ${l}`}>
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
      <circle cx="65" cy="65" r={r} fill="none" stroke="var(--brand)" strokeWidth="14" strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round" transform="rotate(-90 65 65)" />
      <text x="65" y="62" textAnchor="middle" fontSize="28" fontWeight="800" fill="var(--text)">{value}</text>
      <text x="65" y="82" textAnchor="middle" fontSize="12" fill="var(--text-3)">{total ? `of ${total}` : l}</text>
    </svg>
  );
}

/** The organiser dashboard: set-up priorities, applicants against target, sources, growth, and publishing. */
export function Overview() {
  const { eventId, can, reloadMe } = useStaff();
  const o = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/overview`), [eventId]);
  const toast = useToast();
  const [qr, setQr] = useState('');
  useEffect(() => { if (o.data) QRCode.toDataURL(o.data.links.page, { width: 220, margin: 1 }).then(setQr).catch(() => {}); }, [o.data]);
  if (!eventId) return <EmptyState title="No conference yet"><Link className="btn primary" to="/list">List your first conference</Link></EmptyState>;
  if (!o.data) return <Loading />;
  const d = o.data;
  const live = d.event.status === 'open';
  const a = d.applicants;
  const publish = async (on: boolean) => { try { await api.post(`/api/admin/events/${eventId}/publish`, { on }); toast(on ? 'Published: your conference is live on Explore' : 'Back to draft: hidden from Explore', 'ok'); o.reload(); reloadMe(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <PageHead title={<span className="row" style={{ gap: '.6rem' }}>{d.profile.logoUrl && <img src={d.profile.logoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />}{d.event.name}<span className={`badge ${live ? 'good' : 'warn'}`}>{live ? 'Live' : d.event.status === 'draft' ? 'Draft' : label(d.event.status)}</span></span>}
        subtitle={<>{d.event.start_date ? `${date(d.event.start_date)}${d.event.end_date && d.event.end_date !== d.event.start_date ? ` – ${date(d.event.end_date)}` : ''}` : 'Dates to be decided'}{d.event.city ? ` · ${d.event.city}` : ''} · <a href={`/c/${d.event.code.toLowerCase()}${live ? '' : '?preview=1'}`} target="_blank" rel="noreferrer">View page <ExternalLink className="icon" style={{ width: 13, height: 13, verticalAlign: -2 }} /></a></>}>
        {can('event.config') && (live ? <Btn icon={EyeOff} onClick={() => publish(false)}>Unpublish</Btn> : <Btn kind="primary" icon={Rocket} onClick={() => publish(true)}>Publish</Btn>)}
      </PageHead>
      {!live && <Alert tone="warn">This conference is a draft: it isn't on Explore and the registration form is closed. Add committees and press <b>Publish</b> when you're ready.</Alert>}
      {!d.free && !d.priorities.find((p: any) => p.key === 'financial')?.done && <Alert tone="info">No way to pay is set up yet. <Link to="/app/financials">Set up Financials</Link> so accepted delegates can pay you.</Alert>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Set-up priorities</h3><span className="badge info">{d.done}/{d.priorities.length}</span></div>
          <p className="small muted" style={{ margin: '.25rem 0 .75rem' }}>Ordered around what you told us you need.</p>
          <div className="stack tight">
            {d.priorities.filter((p: any) => p.key !== 'share').map((p: any) => {
              const Icon = ICON[p.key] ?? Check;
              const body = <><span className="avatar" style={{ borderRadius: 10, background: p.done ? 'var(--good-soft)' : 'var(--surface-2)', color: p.done ? 'var(--good)' : 'var(--text-2)' }}>{p.done ? <Check className="icon" /> : <Icon className="icon" />}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, textDecoration: p.done ? 'line-through' : 'none', opacity: p.done ? 0.7 : 1 }}>{p.title}</div><div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.detail}</div></div>{p.to && <ChevronRight className="icon faint" />}</>;
              return p.to ? <Link key={p.key} to={p.to} className="row" style={{ gap: '.7rem', padding: '.55rem .5rem', borderRadius: 10, color: 'inherit', textDecoration: 'none', flexWrap: 'nowrap', border: '1px solid var(--border)' }}>{body}</Link>
                : <div key={p.key} className="row" style={{ gap: '.7rem', padding: '.55rem .5rem', borderRadius: 10, flexWrap: 'nowrap', border: '1px solid var(--border)' }}>{body}</div>;
            })}
          </div>
          <div style={{ marginTop: '.9rem' }}><div className="small row" style={{ fontWeight: 600, marginBottom: '.35rem', gap: '.35rem' }}>{d.priorities.find((p: any) => p.key === 'share')?.done && <Check className="icon" style={{ color: 'var(--good)' }} />}Share your conference link</div><CopyBox value={d.links.page} />
            <div className="small" style={{ fontWeight: 600, margin: '.6rem 0 .35rem' }}>Delegate registration form</div><CopyBox value={d.links.register} />
            {qr && <div className="row" style={{ marginTop: '.6rem' }}><img src={qr} alt="QR code for the conference page" style={{ width: 92, height: 92, borderRadius: 8, background: '#fff', padding: 4 }} /><div className="small muted">Print this on posters. Add <span className="mono">?src=instagram</span> (or whatsapp, school…) to links to see where applicants come from.<br /><a href={qr} download={`${d.event.code}-qr.png`}>Download QR</a></div></div>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>Applicants against target</h3>{can('reg.read') && <Link className="small" to="/app/applications">Review applications →</Link>}</div>
            <div className="row" style={{ gap: '1.25rem', marginTop: '.5rem', flexWrap: 'wrap' }}>
              <Donut value={a.delegates.applied} total={d.target} label="applied" />
              <div className="stack tight" style={{ flex: 1, minWidth: 200 }}>
                {[['Delegates', a.delegates.applied, `${a.delegates.accepted} with a seat · ${a.delegates.paid} confirmed`], ['Faculty advisors', a.advisors.applied, `${a.advisors.accepted ?? 0} accepted`], ['Observers', a.observers.applied, `${a.observers.accepted ?? 0} accepted`], ['Chairs', a.chairs.applied, `${a.chairs.accepted ?? 0} accepted`], ['Secretariat & staff', a.staff.applied, `${a.staff.accepted ?? 0} accepted`]].map(([k, v, s]) => (
                  <div key={k as string} className="row between" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '.3rem' }}><span>{k}</span><span><b>{v as number}</b> <span className="small muted">· {s}</span></span></div>
                ))}
                {d.allocationMode === 'review' && a.delegates.toReview > 0 && <Link className="btn sm primary" to="/app/applications" style={{ alignSelf: 'flex-start' }}>{a.delegates.toReview} waiting for review</Link>}
              </div>
            </div>
            <div className="small muted" style={{ marginTop: '.5rem' }}>{d.committees} committee{d.committees === 1 ? '' : 's'} · {d.seats} seats{d.target ? ` · target ${d.target}` : ''}</div>
          </div>
          <div className="card">
            <h3 style={{ margin: 0 }}>Where applicants come from</h3>
            {!d.bySource.length ? <p className="small muted">Visits to your conference page and applications will show here by source once you share the link.</p> : (
              <div className="stack tight" style={{ marginTop: '.6rem' }}>
                {d.bySource.map((s: any) => { const max = Math.max(...d.bySource.map((x: any) => x.views || x.applied), 1); return (
                  <div key={s.channel}><div className="row between small"><span>{CHANNEL[s.channel] ?? s.channel}</span><span className="muted">{s.views} visits · <b style={{ color: 'var(--text)' }}>{s.applied} applied</b></span></div>
                    <div className="bar-track" style={{ marginTop: 3 }}><div className="bar-fill" style={{ width: `${((s.views || s.applied) / max) * 100}%`, background: 'var(--series-1)' }} /></div></div>
                ); })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: 0 }}>Participants over time</h3>
        {d.overTime.length < 1 ? <p className="small muted">No applications yet. The chart appears once the first one arrives.</p> : <LineChart ariaLabel="Applications over time" series={[{ name: 'Applications', color: 'var(--series-1)', points: d.overTime }]} />}
      </div>
    </div>
  );
}

/** Conference page settings: everything the public page shows. */
export function ConferenceSettings() {
  const { eventId, reloadMe } = useStaff();
  const p = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/profile`), [eventId]);
  const [f, setF] = useState<any>(null);
  const toast = useToast();
  const logoIn = useRef<HTMLInputElement>(null); const bannerIn = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.data) setF({ ...p.data.profile, name: p.data.event.name, city: p.data.event.city ?? '', venue: p.data.event.venue ?? '', start_date: p.data.event.start_date ?? '', end_date: p.data.event.end_date ?? '', logoUrl: p.data.logoUrl, bannerUrl: p.data.bannerUrl }); }, [p.data]);
  if (!f) return <Loading />;
  const upload = async (file: File | undefined, kind: 'logo' | 'banner') => {
    if (!file) return;
    try {
      const small = await shrinkImage(file, kind);
      const fd = new FormData(); fd.append('file', dataUrlToFile(small, `${kind}.${kind === 'logo' ? 'png' : 'jpg'}`)); fd.append('kind', kind);
      const r = await api.post<{ name: string; url: string }>(`/api/admin/events/${eventId}/media`, fd);
      setF((x: any) => ({ ...x, [kind]: r.name, [`${kind}Url`]: r.url }));
    } catch (e: any) { toast(e.message, 'bad'); }
  };
  const save = async () => {
    try {
      const { logoUrl, bannerUrl, ...body } = f;
      await api.put(`/api/admin/events/${eventId}/profile`, { ...body, start_date: f.datesTbd ? null : f.start_date || null, end_date: f.datesTbd ? null : f.end_date || f.start_date || null, expected: Number(f.expected) || 0 });
      toast('Saved. Your public page is updated.', 'ok'); p.reload(); reloadMe();
    } catch (e: any) { toast(e.message, 'bad'); }
  };
  const bn = bannerStyle(BANNER_PRESETS.includes(f.banner) ? f.banner : f.bannerUrl);
  const s = f.socials ?? {};
  return (
    <div className="stack">
      <PageHead title="Conference page" subtitle="What delegates see on your public page and on Explore."><a className="btn" href={p.data.links.page + '?preview=1'} target="_blank" rel="noreferrer"><ExternalLink className="icon" />View page</a><Btn kind="primary" onClick={save}>Save</Btn></PageHead>
      <div className="pf pf-portal">
        <div className="pf-card pf-preview" style={{ maxWidth: 560 }}>
          <div className={`pf-banner ${bn.className}`} style={{ ...bn.style, height: 150 }}><button className="pf-btn sm add" style={{ background: 'rgb(255 255 255 / .18)', color: '#fff', border: '1px solid rgb(255 255 255 / .3)' }} onClick={() => bannerIn.current?.click()}><Upload className="icon" />Banner</button></div>
          <div className="body" style={{ marginTop: -56 }}>
            <div className="pf-logo" style={{ width: 104, height: 104 }} onClick={() => logoIn.current?.click()}>{f.logoUrl ? <img src={f.logoUrl} alt="" /> : <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}><Upload className="icon" style={{ display: 'block', margin: '0 auto' }} />Logo</div>}</div>
            <h3 style={{ fontSize: 26 }}>{f.acronym || f.name}</h3><div className="pf-muted">{f.name}</div>
          </div>
        </div>
        <div className="pf-swatches" style={{ marginTop: 10 }}>{BANNER_PRESETS.map((b) => <button key={b} className={`pf-swatch bn-${b} ${f.banner === b ? 'on' : ''}`} style={{ width: 70, height: 38 }} onClick={() => setF({ ...f, banner: b })} aria-label={`Banner ${b}`} />)}</div>
        <input ref={logoIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0], 'logo')} />
        <input ref={bannerIn} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0], 'banner')} />
      </div>
      <div className="card">
        <div className="grid g2">
          <Field label="Full name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Acronym"><input value={f.acronym} onChange={(e) => setF({ ...f, acronym: e.target.value })} /></Field>
          <Field label="First day"><input type="date" value={f.start_date ?? ''} disabled={f.datesTbd} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
          <Field label="Last day"><input type="date" value={f.end_date ?? ''} disabled={f.datesTbd} min={f.start_date || undefined} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={!!f.datesTbd} onChange={(e) => setF({ ...f, datesTbd: e.target.checked })} />Dates are to be decided</label>
        <div className="grid g2" style={{ marginTop: '.75rem' }}>
          <Field label="Venue"><input value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
          <Field label="City"><input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label="Country"><select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{PLACES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></Field>
          <Field label="Expected delegates"><input type="number" min={0} value={f.expected ?? 0} onChange={(e) => setF({ ...f, expected: e.target.value })} /></Field>
          <Field label="Format"><Segmented value={f.format} onChange={(v) => setF({ ...f, format: v })} options={[{ value: 'in_person', label: 'In person' }, { value: 'online', label: 'Online' }, { value: 'hybrid', label: 'Hybrid' }]} /></Field>
          <Field label="Level"><Segmented value={f.level} onChange={(v) => setF({ ...f, level: v })} options={[{ value: 'high_school', label: 'High school' }, { value: 'university', label: 'University' }, { value: 'both', label: 'Both' }]} /></Field>
        </div>
        <Field label="Description" hint={`${(f.description ?? '').length} / 1500`}><textarea maxLength={1500} rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid g2">
          <Field label="Contact email"><input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></Field>
          {(['instagram', 'facebook', 'tiktok', 'whatsapp', 'website'] as const).map((k) => <Field key={k} label={label(k)}><input value={s[k] ?? ''} onChange={(e) => setF({ ...f, socials: { ...s, [k]: e.target.value } })} /></Field>)}
        </div>
      </div>
    </div>
  );
}

/** Financials: free or paid, fees, GST, and how people pay (link, QR, bank transfer, in person). */
export function Financials() {
  const { eventId, can } = useStaff();
  const fin = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/financials`), [eventId]);
  const [wizard, setWizard] = useState(false);
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'pay') as 'pay' | 'tiers' | 'rules';
  useEffect(() => { if (sp.get('setup') === '1') setWizard(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fin.data) return <Loading />;
  const d = fin.data; const m = d.methods;
  const tier = (cat: string) => d.tiers.filter((t: any) => t.category === cat);
  const methods = [m.link.enabled && 'Payment link', m.qr.enabled && 'QR code / UPI', m.bank.enabled && 'Bank transfer', m.in_person.enabled && 'In person'].filter(Boolean);
  return (
    <div className="stack">
      <PageHead title="Financials" subtitle="Fees and how delegates pay you. Money goes straight to your own account; you confirm each payment.">{can('event.config', 'settings.finance') && tab === 'pay' && <Btn kind="primary" icon={Wand2} onClick={() => setWizard(true)}>{d.free || methods.length ? 'Change set-up' : 'Set up payments'}</Btn>}</PageHead>
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ key: 'pay', label: 'How delegates pay' }, ...(can('event.config') && !d.free ? [{ key: 'tiers' as const, label: 'Fee tiers & coupons' }, { key: 'rules' as const, label: 'Payment rules' }] : [])]} />
      {tab === 'tiers' && <FeeTiers />}
      {tab === 'rules' && <PaymentRules ownGateways={d.ownGateways} />}
      {tab === 'pay' && <div className="grid g2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fees</h3>
          {d.free ? <p><span className="badge good">Free</span> Delegates pay nothing; seats are confirmed as soon as they are allotted.</p> : (
            <DataTable rows={[...d.tiers].filter((t: any) => t.category !== 'international').sort((a: any, b: any) => ['school', 'college', 'advisor'].indexOf(a.category) - ['school', 'college', 'advisor'].indexOf(b.category) || a.sort - b.sort)} empty="No fees set" columns={[{ key: 'category', label: 'Who', render: (t: any) => ({ school: 'School delegates', college: 'University delegates', international: 'International', advisor: 'Faculty advisors' } as any)[t.category] ?? t.category },
              { key: 'name', label: 'Fee' }, { key: 'amount_paise', label: d.gstEnabled ? 'Amount (before GST)' : 'Amount', num: true, render: (t: any) => inr(t.amount_paise) }, { key: 'ends_at', label: 'Until', render: (t: any) => (t.ends_at ? dt(t.ends_at) : '—') }]} />
          )}
          {!d.free && <p className="small muted">GST: {d.gstEnabled ? `${d.gstRateBp / 100}% added on top` : 'not charged'}. Quotas, extra tiers and coupons: <Link to="/app/financials?tab=tiers">Fee tiers &amp; coupons</Link>.</p>}
          {!d.free && !tier('school').length && <Alert tone="warn">No delegate fee is active.</Alert>}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>How delegates pay</h3>
          {d.free ? <p className="muted">Nothing to collect.</p> : !methods.length ? <Alert tone="warn">No payment method yet. Delegates can't pay until you add one.</Alert> : (
            <div className="stack tight">
              {m.bank.enabled && <div><b>Bank transfer</b><div className="small muted">{m.bank.accountName} · {m.bank.accountNumber}{m.bank.ifsc ? ` · ${m.bank.ifsc}` : ''}{m.bank.bankName ? ` · ${m.bank.bankName}` : ''}</div></div>}
              {m.qr.enabled && <div className="row"><div style={{ flex: 1 }}><b>QR code / UPI</b><div className="small muted">{m.qr.upiId || 'QR image uploaded'}</div></div>{m.qr.imageUrl && <img src={m.qr.imageUrl} alt="Payment QR" style={{ width: 64, height: 64, borderRadius: 6 }} />}</div>}
              {m.link.enabled && <div><b>Payment link</b><div className="small muted mono" style={{ overflowWrap: 'anywhere' }}>{m.link.url}</div></div>}
              {m.in_person.enabled && <div><b>In person</b><div className="small muted">{m.in_person.instructions || 'Paid at the registration desk'}</div></div>}
              <p className="small muted" style={{ marginBottom: 0 }}>Delegates upload proof for transfers, QR and link payments; approve them under <Link to="/app/payments/review">Payment proofs</Link>. Record in-person payments below.</p>
            </div>
          )}
        </div>
      </div>}
      {tab === 'pay' && !d.free && m.in_person.enabled && can('payments.approve') && <CashPayment />}
      {wizard && <PaymentWizard data={d} onClose={() => setWizard(false)} onDone={() => { setWizard(false); fin.reload(); }} />}
    </div>
  );
}

function CashPayment() {
  const { eventId } = useStaff();
  const [ref, setRef] = useState(''); const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const toast = useToast();
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Record an in-person payment</h3>
      <div className="grid g3">
        <Field label="Delegate ID" hint="from their confirmation email, e.g. HMUN27-R-000012"><input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} /></Field>
        <Field label="Amount received (₹)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Note" hint="receipt number, who received it"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <Btn kind="primary" onClick={async () => {
        try {
          const regs = await api.get<any[]>(`/api/admin/events/${eventId}/applicants?status=all`);
          const r = regs.find((x) => x.ref === ref.trim());
          if (!r) throw new Error('No delegate with that ID in this conference');
          await api.post(`/api/admin/registrations/${r.id}/cash`, { amount_paise: toPaise(amount), note });
          toast(`Recorded ${inr(toPaise(amount))} for ${r.full_name}`, 'ok'); setRef(''); setAmount(''); setNote('');
        } catch (e: any) { toast(e.message, 'bad'); }
      }}>Record payment</Btn>
    </div>
  );
}

/** Seven short steps, like the onboarding: free or paid, fees, GST, methods, then each method's details. */
function PaymentWizard({ data, onClose, onDone }: { data: any; onClose: () => void; onDone: () => void }) {
  const { eventId } = useStaff();
  const school = data.tiers.find((t: any) => t.category === 'school' && t.name === 'Regular') ?? data.tiers.find((t: any) => t.category === 'school');
  const college = data.tiers.find((t: any) => t.category === 'college' && t.name === 'Regular');
  const advisor = data.tiers.find((t: any) => t.category === 'advisor');
  const early = data.tiers.find((t: any) => t.category === 'school' && t.name === 'Early bird');
  const late = data.tiers.find((t: any) => t.category === 'school' && t.name === 'Late');
  const [f, setF] = useState({
    free: data.free, delegate: school ? String(school.amount_paise / 100) : '', college: college ? String(college.amount_paise / 100) : '', advisor: advisor ? String(advisor.amount_paise / 100) : '0',
    early: early ? String(early.amount_paise / 100) : '', earlyEnds: early?.ends_at?.slice(0, 10) ?? '', late: late ? String(late.amount_paise / 100) : '', lateStarts: late?.starts_at?.slice(0, 10) ?? '',
    gstEnabled: data.gstEnabled, gstRate: String(data.gstRateBp / 100),
  });
  const [m, setM] = useState<any>(JSON.parse(JSON.stringify(data.methods)));
  const qrIn = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const chosen = (['link', 'qr', 'bank', 'in_person'] as const).filter((k) => m[k].enabled);
  const steps: string[] = f.free ? ['paid', 'review'] : ['paid', 'fees', 'gst', 'methods', ...chosen, 'review'];
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const setMethod = (k: string, patch: any) => setM({ ...m, [k]: { ...m[k], ...patch } });
  const nextOk = step === 'fees' ? Number(f.delegate) > 0 && (!f.early || !!f.earlyEnds) && (!f.late || !!f.lateStarts)
    : step === 'methods' ? chosen.length > 0 : step === 'bank' ? !!(m.bank.accountName.trim() && m.bank.accountNumber.trim()) : step === 'qr' ? !!(m.qr.image || m.qr.upiId.trim()) : step === 'link' ? /^https?:\/\/\S+\.\S+/.test(m.link.url) : true;
  async function save() {
    try {
      await api.put(`/api/admin/events/${eventId}/financials`, {
        fees: { free: f.free, delegatePaise: toPaise(f.delegate), collegePaise: f.college ? toPaise(f.college) : undefined, advisorPaise: toPaise(f.advisor || '0'),
          earlyPaise: f.early ? toPaise(f.early) : undefined, earlyEnds: f.early && f.earlyEnds ? new Date(f.earlyEnds + 'T23:59:59+05:30').toISOString() : null,
          latePaise: f.late ? toPaise(f.late) : undefined, lateStarts: f.late && f.lateStarts ? new Date(f.lateStarts + 'T00:00:00+05:30').toISOString() : null,
          gstEnabled: f.gstEnabled, gstRateBp: Math.round(Number(f.gstRate) * 100) },
        ...(f.free ? {} : { methods: { link: m.link, qr: { ...m.qr, imageUrl: undefined }, bank: m.bank, in_person: m.in_person } }),
      });
      toast('Financials saved', 'ok'); onDone();
    } catch (e: any) { toast(e.message, 'bad'); }
  }
  const METHOD_INFO = [
    { k: 'link', icon: Link2, t: 'Payment link', d: 'Send payers to your own payment page. You confirm payments by reviewing the proofs payers upload.' },
    { k: 'qr', icon: QrCode, t: 'Payment QR code', d: 'Show a QR code payers scan with their banking app (for example UPI). You confirm payments by reviewing the proofs payers upload.' },
    { k: 'bank', icon: Building2, t: 'Bank transfer', d: 'Show your bank details with copy buttons. You confirm payments by reviewing the proofs payers upload.' },
    { k: 'in_person', icon: HandCoins, t: 'In-person payment', d: 'Payers pay you in person, for example in cash at registration. You record each payment yourself.' },
  ];
  const title: Record<string, string> = { paid: 'Do delegates pay?', fees: 'Your fees', gst: 'GST', methods: 'How will people pay you?', link: 'Payment link', qr: 'Payment QR code', bank: 'Bank transfer', in_person: 'In-person payment', review: 'Check and save' };
  return (
    <Modal wide title={<span><span className="small faint" style={{ display: 'block', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase' }}>Step {i + 1} of {steps.length}</span>{title[step]}</span>} onClose={onClose}
      footer={<><button className="btn" onClick={() => (i ? setI(i - 1) : onClose())}>{i ? 'Back' : 'Cancel'}</button><span className="spacer" />{step === 'review' ? <Btn kind="primary" onClick={save}>Save</Btn> : <Btn kind="primary" disabled={!nextOk} onClick={() => setI(i + 1)}>Continue</Btn>}</>}>
      {step === 'paid' && <div className="grid g2">
        {[[true, Gift, "It's free", 'No delegate fee at all'], [false, Banknote, 'Delegates pay a fee', 'Choose fees and how you get paid']].map(([free, Icon, t, s]: any) => (
          <button key={t} className="card" style={{ textAlign: 'center', cursor: 'pointer', borderColor: f.free === free ? 'var(--brand)' : undefined, boxShadow: f.free === free ? '0 0 0 2px var(--brand)' : undefined }} onClick={() => setF({ ...f, free })}>
            <Icon className="icon" style={{ width: 30, height: 30, color: 'var(--brand)' }} /><div style={{ fontWeight: 700, fontSize: 18, marginTop: 8 }}>{t}</div><div className="small muted">{s}</div></button>
        ))}
      </div>}
      {step === 'fees' && <div className="stack">
        <div className="grid g3">
          <Field label="School delegates (₹)"><input inputMode="decimal" value={f.delegate} onChange={(e) => setF({ ...f, delegate: e.target.value })} /></Field>
          <Field label="University delegates (₹)" hint="blank = same as school"><input inputMode="decimal" value={f.college} onChange={(e) => setF({ ...f, college: e.target.value })} /></Field>
          <Field label="Faculty advisors (₹)"><input inputMode="decimal" value={f.advisor} onChange={(e) => setF({ ...f, advisor: e.target.value })} /></Field>
        </div>
        <div className="grid g2">
          <Field label="Early-bird fee (₹)" hint="optional"><input inputMode="decimal" value={f.early} onChange={(e) => setF({ ...f, early: e.target.value })} /></Field>
          <Field label="Early bird ends on"><input type="date" value={f.earlyEnds} onChange={(e) => setF({ ...f, earlyEnds: e.target.value })} /></Field>
          <Field label="Late fee (₹)" hint="optional"><input inputMode="decimal" value={f.late} onChange={(e) => setF({ ...f, late: e.target.value })} /></Field>
          <Field label="Late fee starts on"><input type="date" value={f.lateStarts} onChange={(e) => setF({ ...f, lateStarts: e.target.value })} /></Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Delegates registered before a change keep the fee they were quoted.</p>
      </div>}
      {step === 'gst' && <div className="stack">
        <Switch checked={f.gstEnabled} onChange={(v) => setF({ ...f, gstEnabled: v })} label="My organisation is GST-registered and charges GST" />
        {f.gstEnabled && <Field label="GST rate (%)"><input inputMode="decimal" value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })} style={{ maxWidth: 140 }} /></Field>}
        <p className="small muted" style={{ margin: 0 }}>{f.gstEnabled ? 'GST is added on top of the fees and shown on invoices. Add your GSTIN under Settings → Organisation.' : 'Most school and student societies are not GST-registered. Fees are charged as they are.'}</p>
      </div>}
      {step === 'methods' && <div className="grid g2">
        {METHOD_INFO.map((x) => { const on = m[x.k].enabled; return (
          <button key={x.k} className="card" style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--brand)' : undefined, boxShadow: on ? '0 0 0 2px var(--brand)' : undefined }} onClick={() => setMethod(x.k, { enabled: !on })}>
            <div className="row between"><span className="avatar" style={{ borderRadius: 10, background: 'var(--warn-soft)', color: 'var(--text)' }}><x.icon className="icon" /></span>{on && <Check className="icon" style={{ color: 'var(--brand)' }} />}</div>
            <div style={{ fontWeight: 700, marginTop: 8 }}>{x.t}</div><div className="small muted">{x.d}</div></button>
        ); })}
        {data.ownGateways && <p className="small muted" style={{ gridColumn: '1 / -1' }}>Card and UPI gateways (Razorpay, Cashfree) are configured separately under Settings.</p>}
      </div>}
      {step === 'bank' && <div className="stack">
        <div className="grid g2">
          <Field label="Name on the account"><input value={m.bank.accountName} onChange={(e) => setMethod('bank', { accountName: e.target.value })} /></Field>
          <Field label="Account number or IBAN"><input value={m.bank.accountNumber} onChange={(e) => setMethod('bank', { accountNumber: e.target.value })} /></Field>
          <Field label="IFSC, SWIFT or BIC" hint="optional"><input value={m.bank.ifsc} onChange={(e) => setMethod('bank', { ifsc: e.target.value.toUpperCase() })} /></Field>
          <Field label="Bank name" hint="optional"><input value={m.bank.bankName} onChange={(e) => setMethod('bank', { bankName: e.target.value })} /></Field>
        </div>
        <Field label="Payment reference" hint="optional; each delegate's ID is added after it"><input value={m.bank.reference} placeholder="e.g. HMUN" onChange={(e) => setMethod('bank', { reference: e.target.value })} /></Field>
        <Field label="Instructions for payers" hint={`optional · ${m.bank.instructions.length}/500`}><textarea maxLength={500} value={m.bank.instructions} onChange={(e) => setMethod('bank', { instructions: e.target.value })} /></Field>
        <p className="small muted" style={{ margin: 0 }}>No need to ask for screenshots on WhatsApp: payers upload their proof on their delegate page and you accept it in Payment proofs.</p>
      </div>}
      {step === 'qr' && <div className="stack">
        <Field label="UPI ID" hint="a QR is generated from it with the exact amount; or upload your own QR below"><input value={m.qr.upiId} placeholder="yourmun@okbank" onChange={(e) => setMethod('qr', { upiId: e.target.value.trim() })} /></Field>
        <div className="row">{m.qr.imageUrl && <img src={m.qr.imageUrl} alt="QR" style={{ width: 90, height: 90, borderRadius: 8 }} />}
          <button className="btn" onClick={() => qrIn.current?.click()}><Upload className="icon" />{m.qr.image ? 'Replace QR image' : 'Upload a QR image'}</button>
          {m.qr.image && <button className="btn ghost" onClick={() => setMethod('qr', { image: null, imageUrl: null })}>Remove</button>}</div>
        <input ref={qrIn} type="file" accept="image/png,image/jpeg" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const small = await shrinkImage(file, 'qr'); const fd = new FormData(); fd.append('file', dataUrlToFile(small, 'qr.png')); fd.append('kind', 'qr'); const r = await api.post<any>(`/api/admin/events/${eventId}/media`, fd); setMethod('qr', { image: r.name, imageUrl: r.url }); } catch (x: any) { toast(x.message, 'bad'); } }} />
        <Field label="Instructions" hint="optional"><textarea maxLength={500} value={m.qr.instructions} onChange={(e) => setMethod('qr', { instructions: e.target.value })} /></Field>
      </div>}
      {step === 'link' && <div className="stack">
        <Field label="Your payment page" hint="Razorpay payment page, Instamojo, PayPal.me, Stripe link…"><input value={m.link.url} placeholder="https://" onChange={(e) => setMethod('link', { url: e.target.value.trim() })} /></Field>
        <Field label="Instructions" hint="optional"><textarea maxLength={500} value={m.link.instructions} onChange={(e) => setMethod('link', { instructions: e.target.value })} /></Field>
      </div>}
      {step === 'in_person' && <Field label="Instructions for payers" hint="where and when to pay"><textarea maxLength={500} value={m.in_person.instructions} placeholder="Pay in cash at the registration desk on Day 1, 8:00–9:00." onChange={(e) => setMethod('in_person', { instructions: e.target.value })} /></Field>}
      {step === 'review' && <div className="stack tight">
        {f.free ? <p>Free conference. Delegates are confirmed as soon as they get a seat.</p> : <>
          <div className="row between"><span className="muted">School delegates</span><b>{inr(toPaise(f.delegate))}</b></div>
          {f.college && <div className="row between"><span className="muted">University delegates</span><b>{inr(toPaise(f.college))}</b></div>}
          <div className="row between"><span className="muted">Faculty advisors</span><b>{inr(toPaise(f.advisor || '0'))}</b></div>
          {f.early && <div className="row between"><span className="muted">Early bird until {f.earlyEnds}</span><b>{inr(toPaise(f.early))}</b></div>}
          {f.late && <div className="row between"><span className="muted">Late from {f.lateStarts}</span><b>{inr(toPaise(f.late))}</b></div>}
          <div className="row between"><span className="muted">GST</span><b>{f.gstEnabled ? `${f.gstRate}% on top` : 'Not charged'}</b></div>
          <div className="row between"><span className="muted">Payment methods</span><b>{chosen.map((k) => METHOD_INFO.find((x) => x.k === k)!.t).join(', ')}</b></div>
        </>}
      </div>}
    </Modal>
  );
}

/** Applications: delegates (review mode), chairs and staff, advisors, observers, and the settings that open them. */
export function Applications() {
  const { eventId, can } = useStaff();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'delegates') as 'delegates' | 'team' | 'advisor' | 'observer' | 'settings';
  const settings = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/applications-settings`), [eventId]);
  return (
    <div className="stack">
      <PageHead title="Applications" subtitle="Review who applied, score them, assign committees, and decide on chairs, staff, advisors and observers." />
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} tabs={[{ key: 'delegates', label: 'Delegates' }, { key: 'team', label: 'Chairs & staff' }, { key: 'advisor', label: 'Faculty advisors' }, { key: 'observer', label: 'Observers' }, ...(can('event.config') ? [{ key: 'settings' as const, label: 'Open roles & settings' }] : [])]} />
      {tab === 'delegates' && <DelegateReview mode={settings.data?.allocationMode} />}
      {tab === 'team' && <RoleApps roles={['chair', 'secretariat', 'staff', 'press', 'volunteer']} />}
      {tab === 'advisor' && <RoleApps roles={['advisor']} />}
      {tab === 'observer' && <RoleApps roles={['observer']} />}
      {tab === 'settings' && settings.data && <AppSettings s={settings.data} onSaved={settings.reload} />}
    </div>
  );
}

function DelegateReview({ mode }: { mode?: string }) {
  const { eventId, can } = useStaff();
  const [status, setStatus] = useState<'applied' | 'assigned' | 'declined' | 'all'>('applied');
  const list = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/applicants?status=${status}`), [eventId, status]);
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [assign, setAssign] = useState<any>(null);
  const toast = useToast(); const ask = usePrompt();
  const cname = (id: string) => inv.data?.find((c) => c.id === id)?.short ?? '?';
  return (
    <div className="stack">
      {mode !== 'review' && <Alert tone="info">Seats are allotted automatically the moment delegates register (instant mode). Switch to review mode under <b>Open roles &amp; settings</b> to score applications and assign committees yourself.</Alert>}
      <div className="row between">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'applied', label: 'Waiting' }, { value: 'assigned', label: 'Assigned' }, { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' }]} />
        {status === 'applied' && can('alloc.move') && (list.data?.length ?? 0) > 0 && <Btn kind="primary" icon={Wand2} onClick={async () => { if (await ask({ title: 'Auto-assign by score', message: 'Highest score first, each applicant gets the first open seat in their preferred committees. They are emailed their committee and how to pay.', confirm: 'Assign' })) { try { const r = await api.post<any>(`/api/admin/events/${eventId}/auto-assign`); toast(`${r.assigned} assigned${r.full ? `, ${r.full} could not be placed (committees full)` : ''}`, 'ok'); list.reload(); inv.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Auto-assign by score</Btn>}
      </div>
      <div className="card flush"><DataTable rows={list.data ?? []} empty={status === 'applied' ? 'No applications waiting' : 'Nothing here'} columns={[
        { key: 'full_name', label: 'Applicant', render: (r: any) => <><b>{r.full_name}</b><div className="small faint">{r.ref} · {r.institution}, {r.class_year}</div></> },
        { key: 'experience', label: 'Experience', render: (r: any) => label(r.experience) },
        { key: 'preferences', label: 'Prefers', sort: false, render: (r: any) => r.preferences.length ? r.preferences.map(cname).join(' › ') : <span className="faint">Any</span> },
        { key: 'motivation', label: 'Why', sort: false, render: (r: any) => r.motivation ? <span className="small" title={r.motivation}>{r.motivation.slice(0, 80)}{r.motivation.length > 80 ? '…' : ''}</span> : <span className="faint">—</span> },
        { key: 'review_score', label: 'Score', render: (r: any) => can('reg.edit') ? <select value={r.review_score ?? ''} onChange={async (e) => { await api.post(`/api/admin/registrations/${r.id}/score`, { score: e.target.value || null }); list.reload(); }} aria-label="Score" style={{ width: 70 }}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select> : r.review_score ?? '—' },
        { key: 'committee', label: 'Seat', render: (r: any) => r.portfolio ? <>{r.portfolio}<div className="small faint">{r.committee}</div></> : <span className="faint">—</span> },
        { key: 'act', label: '', sort: false, render: (r: any) => !r.cancelled_at && <span className="row">
          {can('alloc.move') && <Btn size="sm" kind={r.allot_status === 'applied' ? 'primary' : undefined} onClick={() => setAssign(r)}>{r.allot_status === 'applied' ? 'Accept & assign' : 'Change'}</Btn>}
          {can('reg.cancel') && r.allot_status === 'applied' && <Btn size="sm" kind="danger" onClick={async () => { const x = await ask({ title: `Decline ${r.full_name}?`, message: 'They are emailed that they were not selected.', fields: [{ key: 'note', label: 'Note to include (optional)', type: 'textarea' }], danger: true, confirm: 'Decline' }); if (x) { try { await api.post(`/api/admin/registrations/${r.id}/decline`, x); list.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Decline</Btn>}
        </span> },
      ]} /></div>
      {assign && <AssignSeat reg={assign} onClose={() => setAssign(null)} onDone={() => { setAssign(null); list.reload(); inv.reload(); }} />}
    </div>
  );
}

function AssignSeat({ reg, onClose, onDone }: { reg: any; onClose: () => void; onDone: () => void }) {
  const { eventId } = useStaff();
  const seats = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/open-seats`), [eventId]);
  const [q, setQ] = useState(''); const [pick, setPick] = useState('');
  const toast = useToast();
  const list = (seats.data ?? []).filter((s) => !q || `${s.committee} ${s.short} ${s.portfolio}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={`Assign ${reg.full_name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" disabled={!pick} onClick={async () => { try { await api.post(`/api/admin/registrations/${reg.id}/assign`, { seat_id: pick }); toast('Assigned and emailed', 'ok'); onDone(); } catch (e: any) { toast(e.message, 'bad'); } }}>Assign</Btn></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>{reg.institution} · prefers {reg.preferences.length ? 'their chosen committees' : 'any committee'}. They get an email with the seat{reg.payment_status !== 'paid' ? ' and how to pay' : ''}.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search committee or portfolio" aria-label="Search seats" />
        <div style={{ maxHeight: 340, overflowY: 'auto' }} className="stack tight">
          {!seats.data ? <Loading rows={3} /> : !list.length ? <p className="muted">No open seats match.</p> : list.map((s) => (
            <label key={s.id} className="check" style={{ padding: '.35rem .5rem', borderRadius: 8, background: pick === s.id ? 'var(--brand-soft)' : undefined }}><input type="radio" name="seat" checked={pick === s.id} onChange={() => setPick(s.id)} /><b>{s.short}</b> {s.portfolio}{s.seat_no > 1 ? ` (seat ${s.seat_no})` : ''}<span className="small faint"> · {s.tier}{s.premium_paise ? ` · +${inr(s.premium_paise)}` : ''}</span></label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function RoleApps({ roles }: { roles: string[] }) {
  const { eventId, can } = useStaff();
  const apps = useAsync<any[]>(async () => (await Promise.all(roles.map((r) => api.get<any[]>(`/api/admin/events/${eventId}/role-applications?role=${r}`)))).flat(), [eventId, roles.join()]);
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [open, setOpen] = useState<any>(null);
  return (
    <div className="stack">
      <div className="card flush"><DataTable rows={apps.data ?? []} empty="No applications yet" onRowClick={setOpen} columns={[
        { key: 'created_at', label: 'Applied', render: (a: any) => dt(a.created_at) },
        { key: 'full_name', label: 'Applicant', render: (a: any) => <><b>{a.full_name}</b><div className="small faint">{a.email}{a.institution ? ` · ${a.institution}` : ''}</div></> },
        { key: 'role', label: 'Role', render: (a: any) => a.position_title ?? label(a.role) },
        { key: 'score', label: 'Score', num: true, render: (a: any) => a.score ?? '—' },
        { key: 'status', label: 'Status', render: (a: any) => <span className={`badge ${a.status === 'accepted' ? 'good' : a.status === 'rejected' ? 'bad' : a.status === 'shortlisted' ? 'info' : ''}`}>{label(a.status)}</span> },
        { key: 'assigned_committee', label: 'Committee', render: (a: any) => a.assigned_committee ?? '—' },
      ]} /></div>
      {open && <DecideRole a={open} committees={inv.data ?? []} canAccount={can('users.manage')} onClose={() => setOpen(null)} onDone={() => { setOpen(null); apps.reload(); }} />}
    </div>
  );
}

function DecideRole({ a, committees, canAccount, onClose, onDone }: { a: any; committees: any[]; canAccount: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ score: a.score ? String(a.score) : '', note: a.note ?? '', committee_id: a.assigned_committee_id ?? a.committee_prefs?.[0] ?? '', title: a.assigned_title ?? a.position_title ?? '', createAccount: a.role === 'chair' });
  const toast = useToast();
  const decide = async (status: string) => {
    try {
      const r = await api.post<any>(`/api/admin/role-applications/${a.id}/decide`, { ...f, status, createAccount: status === 'accepted' && f.createAccount && canAccount });
      if (r.account?.password) toast(`Accepted. Their chair account was created and the sign-in details emailed to ${r.account.email}.`, 'ok');
      else toast(status === 'accepted' ? 'Accepted and emailed' : status === 'rejected' ? 'Declined and emailed' : 'Saved', 'ok');
      onDone();
    } catch (e: any) { toast(e.message, 'bad'); }
  };
  const done = ['accepted', 'rejected', 'withdrawn'].includes(a.status);
  return (
    <Modal wide title={`${a.full_name} · ${a.position_title ?? label(a.role)}`} onClose={onClose} footer={done ? <button className="btn" onClick={onClose}>Close</button> : <>
      <button className="btn" onClick={() => decide('shortlisted')}>Shortlist</button><Btn kind="danger" onClick={() => decide('rejected')}>Decline</Btn><span className="spacer" /><Btn kind="primary" onClick={() => decide('accepted')}>Accept</Btn></>}>
      <div className="grid g2">
        <div className="stack tight">
          <div><span className="muted small">Contact</span><div>{a.email}{a.mobile ? ` · ${a.mobile}` : ''}</div></div>
          <div><span className="muted small">From</span><div>{a.institution}{a.city ? `, ${a.city}` : ''}</div></div>
          {a.committee_prefs?.length > 0 && <div><span className="muted small">Committees wanted</span><div>{a.committee_prefs.map((c: string) => committees.find((x) => x.id === c)?.short ?? c).join(' › ')}</div></div>}
          {a.experience && <div><span className="muted small">Experience</span><div style={{ whiteSpace: 'pre-wrap' }}>{a.experience}</div></div>}
          {a.motivation && <div><span className="muted small">Why</span><div style={{ whiteSpace: 'pre-wrap' }}>{a.motivation}</div></div>}
          {a.cv_url && <a className="btn sm" href={a.cv_url} target="_blank" rel="noreferrer"><FileText className="icon" />Open CV</a>}
        </div>
        <div className="stack">
          <Field label="Score (1–10)"><select value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })} disabled={done}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></Field>
          {['chair', 'press', 'secretariat'].includes(a.role) && <Field label="Committee"><select value={f.committee_id} onChange={(e) => setF({ ...f, committee_id: e.target.value })} disabled={done}><option value="">—</option>{committees.map((c) => <option key={c.id} value={c.id}>{c.short} · {c.name}</option>)}</select></Field>}
          <Field label="Title" hint="e.g. Director, Vice-Chair, Rapporteur"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} disabled={done} /></Field>
          <Field label="Note (included in the email)"><textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} disabled={done} /></Field>
          {a.role === 'chair' && canAccount && !done && <label className="check"><input type="checkbox" checked={f.createAccount} onChange={(e) => setF({ ...f, createAccount: e.target.checked })} />Create their chair account (they see only their committee, run its live session and review its position papers)</label>}
          {done && <Alert tone={a.status === 'accepted' ? 'good' : 'info'}>{label(a.status)} {a.decided_at ? dt(a.decided_at) : ''}</Alert>}
        </div>
      </div>
    </Modal>
  );
}

function AppSettings({ s, onSaved }: { s: any; onSaved: () => void }) {
  const { eventId } = useStaff();
  const [f, setF] = useState({ ...s, applicationDeadline: s.applicationDeadline?.slice(0, 10) ?? '', ppDeadline: s.positionPapers.deadline?.slice(0, 10) ?? '' });
  const toast = useToast();
  return (
    <div className="card stack">
      {f.status !== 'open' && <Alert tone="warn">Roles open only once the conference is published (Overview → Publish).</Alert>}
      <div><h3 style={{ margin: '0 0 .5rem' }}>Who can apply</h3>
        <div className="stack tight">
          <Switch checked={f.roles.delegate} onChange={(v) => setF({ ...f, roles: { ...f.roles, delegate: v } })} label="Delegates (the registration form)" />
          <Switch checked={f.roles.advisor} onChange={(v) => setF({ ...f, roles: { ...f.roles, advisor: v } })} label="Faculty advisors" />
          <Switch checked={f.roles.observer} onChange={(v) => setF({ ...f, roles: { ...f.roles, observer: v } })} label="Observers" />
          <Switch checked={f.roles.chair} onChange={(v) => setF({ ...f, roles: { ...f.roles, chair: v } })} label="Chairs (general application; or post specific roles on the Job Board)" />
        </div>
      </div>
      <Field label="Applications close on" hint="optional; after this the form and role applications close"><input type="date" value={f.applicationDeadline} onChange={(e) => setF({ ...f, applicationDeadline: e.target.value })} style={{ maxWidth: 220 }} /></Field>
      <div><h3 style={{ margin: '0 0 .5rem' }}>How delegates get committees</h3>
        <Segmented value={f.allocationMode} onChange={(v) => setF({ ...f, allocationMode: v })} options={[{ value: 'instant', label: 'Instantly, by preference' }, { value: 'review', label: 'After we review applications' }]} />
        <p className="small muted">{f.allocationMode === 'instant' ? 'A seat is held the moment someone registers; they pay to confirm it.' : 'Applications wait for you. Score them, then assign seats by hand or auto-assign by score. Nothing is payable until a seat is assigned.'}</p>
      </div>
      <div><h3 style={{ margin: '0 0 .5rem' }}>Position papers</h3>
        <Switch checked={f.positionPapers.enabled} onChange={(v) => setF({ ...f, positionPapers: { ...f.positionPapers, enabled: v } })} label="Collect position papers from delegates (PDF upload on their page)" />
        {f.positionPapers.enabled && <Field label="Deadline"><input type="date" value={f.ppDeadline} onChange={(e) => setF({ ...f, ppDeadline: e.target.value })} style={{ maxWidth: 220 }} /></Field>}
      </div>
      <div><Btn kind="primary" onClick={async () => {
        try {
          await api.put(`/api/admin/events/${eventId}/applications-settings`, { roles: f.roles, allocationMode: f.allocationMode, applicationDeadline: f.applicationDeadline ? new Date(f.applicationDeadline + 'T23:59:59+05:30').toISOString() : null,
            positionPapers: { enabled: f.positionPapers.enabled, deadline: f.ppDeadline ? new Date(f.ppDeadline + 'T23:59:59+05:30').toISOString() : null } });
          toast('Saved', 'ok'); onSaved();
        } catch (e: any) { toast(e.message, 'bad'); }
      }}>Save</Btn></div>
    </div>
  );
}

/** Job Board: post chair, secretariat, staff, press and volunteer roles. */
export function JobBoard() {
  const { eventId } = useStaff();
  const pos = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/positions`), [eventId]);
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [edit, setEdit] = useState<any>(null);
  const toast = useToast();
  const save = async () => {
    try {
      const body = { ...edit, openings: Number(edit.openings) || 1, deadline: edit.deadline ? new Date(edit.deadline + 'T23:59:59+05:30').toISOString() : null };
      if (edit.id) await api.put(`/api/admin/positions/${edit.id}`, body); else await api.post(`/api/admin/events/${eventId}/positions`, body);
      setEdit(null); pos.reload(); toast('Saved. It shows on the Job Board once the conference is published.', 'ok');
    } catch (e: any) { toast(e.message, 'bad'); }
  };
  const quick = async () => {
    try { for (const c of inv.data ?? []) await api.post(`/api/admin/events/${eventId}/positions`, { kind: 'chair', title: `Director, ${c.short}`, committee_id: c.id, openings: 1 }); pos.reload(); toast('Posted a director role for every committee', 'ok'); }
    catch (e: any) { toast(e.message, 'bad'); }
  };
  return (
    <div className="stack">
      <PageHead title="Job Board" subtitle="Post the roles you need. People apply from your conference page and the public Job Board; review them under Applications → Chairs & staff.">
        <a className="btn" href="/jobs" target="_blank" rel="noreferrer"><ExternalLink className="icon" />Public Job Board</a>
        <Btn kind="primary" icon={Plus} onClick={() => setEdit({ kind: 'chair', title: '', committee_id: '', description: '', openings: 1, deadline: '', open: true })}>Post a role</Btn>
      </PageHead>
      {!pos.data ? <Loading /> : !pos.data.length ? (
        <EmptyState icon={Briefcase} title="No roles posted yet">Post chair, secretariat, staff, press or volunteer roles.{(inv.data?.length ?? 0) > 0 && <div style={{ marginTop: '.75rem' }}><Btn onClick={quick}>Post a director role for each committee</Btn></div>}</EmptyState>
      ) : <div className="card flush"><DataTable rows={pos.data} onRowClick={(p) => setEdit({ ...p, deadline: p.deadline?.slice(0, 10) ?? '', open: !!p.open })} columns={[
        { key: 'title', label: 'Role', render: (p: any) => <><b>{p.title}</b><div className="small faint">{label(p.kind)}{p.committee ? ` · ${p.committee}` : ''}</div></> },
        { key: 'openings', label: 'Openings', num: true }, { key: 'applicants', label: 'Applicants', num: true }, { key: 'filled', label: 'Filled', num: true },
        { key: 'deadline', label: 'Deadline', render: (p: any) => (p.deadline ? date(p.deadline) : '—') },
        { key: 'open', label: 'Status', render: (p: any) => <span className={`badge ${p.open ? 'good' : ''}`}>{p.open ? 'Open' : 'Closed'}</span> },
      ]} /></div>}
      {edit && <Modal title={edit.id ? 'Edit role' : 'Post a role'} onClose={() => setEdit(null)} footer={<>{edit.id && <Btn kind="danger" icon={Trash2} onClick={async () => { const r = await api.del<any>(`/api/admin/positions/${edit.id}`); toast(r.closed ? 'It has applicants, so it was closed instead of deleted' : 'Deleted', 'ok'); setEdit(null); pos.reload(); }}>Delete</Btn>}<span className="spacer" /><button className="btn" onClick={() => setEdit(null)}>Cancel</button><Btn kind="primary" onClick={save}>Save</Btn></>}>
        <div className="stack">
          <div className="grid g2">
            <Field label="Type"><select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{['chair', 'secretariat', 'staff', 'press', 'volunteer'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
            <Field label="Committee" hint="optional"><select value={edit.committee_id ?? ''} onChange={(e) => setEdit({ ...edit, committee_id: e.target.value })}><option value="">—</option>{(inv.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.short} · {c.name}</option>)}</select></Field>
          </div>
          <Field label="Title"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Director, UNSC" /></Field>
          <Field label="Description" hint="what the role involves, who should apply"><textarea value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div className="grid g3">
            <Field label="Openings"><input type="number" min={1} value={edit.openings} onChange={(e) => setEdit({ ...edit, openings: e.target.value })} /></Field>
            <Field label="Apply by" hint="optional"><input type="date" value={edit.deadline} onChange={(e) => setEdit({ ...edit, deadline: e.target.value })} /></Field>
            <Field label="Status"><Switch checked={edit.open} onChange={(v) => setEdit({ ...edit, open: v })} label={edit.open ? 'Open' : 'Closed'} /></Field>
          </div>
        </div>
      </Modal>}
    </div>
  );
}

/** Documents: study guides per committee, and position papers with chair feedback. */
export function Documents() {
  const { eventId, can } = useStaff();
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const papers = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/papers`), [eventId]);
  const [review, setReview] = useState<any>(null);
  const toast = useToast();
  const fileIn = useRef<HTMLInputElement>(null); const [target, setTarget] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHead title="Documents" subtitle="Study guides for each committee, and the position papers delegates upload." />
      {can('alloc.config') && <div className="card flush">
        <div className="card-head"><h3>Study guides</h3></div>
        <DataTable rows={inv.data ?? []} empty="Add committees first" columns={[
          { key: 'short', label: 'Committee', render: (c: any) => <><b>{c.short}</b> <span className="muted">{c.name}</span></> },
          { key: 'guide_url', label: 'Guide', render: (c: any) => c.guide_url ? <a href={c.guide_url} target="_blank" rel="noreferrer"><BookOpen className="icon" style={{ width: 14, height: 14, verticalAlign: -2 }} /> Open</a> : <span className="faint">None</span> },
          { key: 'act', label: '', sort: false, render: (c: any) => <span className="row"><Btn size="sm" icon={Upload} onClick={() => { setTarget(c.id); fileIn.current?.click(); }}>Upload PDF</Btn>
            <Btn size="sm" icon={Link2} onClick={async () => { const url = prompt('Link to the study guide (https://…)', c.guide_url ?? ''); if (url != null) { try { const fd = new FormData(); fd.append('url', url); await api.post(`/api/admin/committees/${c.id}/guide`, fd); inv.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Link</Btn></span> },
        ]} />
        <input ref={fileIn} type="file" accept="application/pdf" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f || !target) return; try { const fd = new FormData(); fd.append('file', f); await api.post(`/api/admin/committees/${target}/guide`, fd); toast('Study guide uploaded; it shows on your page and delegates’ emails', 'ok'); inv.reload(); } catch (x: any) { toast(x.message, 'bad'); } }} />
      </div>}
      <div className="card flush">
        <div className="card-head"><h3>Position papers</h3><span className="spacer" />{can('event.config') && <Link className="small" to="/app/applications?tab=settings">Collection settings</Link>}</div>
        <DataTable rows={papers.data ?? []} empty="No position papers yet" onRowClick={setReview} columns={[
          { key: 'submitted_at', label: 'Received', render: (p: any) => dt(p.submitted_at) },
          { key: 'full_name', label: 'Delegate', render: (p: any) => <><b>{p.full_name}</b><div className="small faint">{p.ref}</div></> },
          { key: 'committee', label: 'Committee', render: (p: any) => <>{p.short} · {p.portfolio}</> },
          { key: 'status', label: 'Status', render: (p: any) => <span className={`badge ${p.status === 'reviewed' ? 'good' : p.status === 'revise' ? 'warn' : ''}`}>{p.status === 'revise' ? 'Revision asked' : label(p.status)}</span> },
          { key: 'score', label: 'Score', num: true, render: (p: any) => p.score ?? '—' },
        ]} />
      </div>
      {review && <PaperReview p={review} onClose={() => setReview(null)} onDone={() => { setReview(null); papers.reload(); }} />}
    </div>
  );
}
function PaperReview({ p, onClose, onDone }: { p: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ score: p.score != null ? String(p.score) : '', feedback: p.feedback ?? '' });
  const toast = useToast();
  const send = async (status: string) => { try { await api.post(`/api/admin/papers/${p.id}/review`, { ...f, status }); toast('Feedback sent to the delegate', 'ok'); onDone(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <Modal title={`${p.full_name} · ${p.short} ${p.portfolio}`} onClose={onClose} footer={<><a className="btn" href={p.url} target="_blank" rel="noreferrer"><FileText className="icon" />Open PDF</a><span className="spacer" /><Btn onClick={() => send('revise')}>Ask for a revision</Btn><Btn kind="primary" onClick={() => send('reviewed')}>Send feedback</Btn></>}>
      <div className="stack">
        <Field label="Score (0–10)"><select value={f.score} onChange={(e) => setF({ ...f, score: e.target.value })}><option value="">—</option>{Array.from({ length: 11 }, (_, i) => <option key={i}>{i}</option>)}</select></Field>
        <Field label="Feedback"><textarea rows={6} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

/** Live sessions for this conference's committees. */
export function Sessions() {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/live`), [eventId]);
  const toast = useToast();
  const openConsole = (code: string, chairKey: string) => window.open(`/session/${code}/chair#k=${chairKey}`, '_blank');
  return (
    <div className="stack">
      <PageHead title="Live sessions" subtitle="Run committees live: roll call, speakers list, motions and voting. Delegates follow on their phones with the session code." />
      {!d.data ? <Loading /> : !d.data.committees.length ? <EmptyState icon={Gavel} title="No committees">Add committees first.</EmptyState> : (
        <div className="grid g2">
          {d.data.committees.map((c: any) => {
            const ss = d.data.sessions.filter((s: any) => s.committee_id === c.id);
            const active = ss.find((s: any) => !s.ended_at);
            return (
              <div className="card" key={c.id}>
                <div className="row between"><h3 style={{ margin: 0 }}>{c.short} <span className="muted" style={{ fontWeight: 400 }}>{c.name}</span></h3>{active && <span className="badge good"><Radio className="icon" style={{ width: 12, height: 12 }} /> Live</span>}</div>
                {active ? <>
                  <p className="small muted">Delegates join at <b>{location.host}/session</b> with code <b className="mono" style={{ fontSize: 16, letterSpacing: '.12em' }}>{active.code}</b></p>
                  <div className="row"><Btn kind="primary" icon={Gavel} onClick={async () => { try { const r = await api.post<any>(`/api/admin/live/${active.code}/open`); openConsole(r.code, r.chairKey); } catch (e: any) { toast(e.message, 'bad'); } }}>Open chair console</Btn><a className="btn" href={`/session/${active.code}`} target="_blank" rel="noreferrer"><Users className="icon" />Delegate view</a></div>
                </> : <>
                  <p className="small muted">The room is filled in with this committee's portfolios and the delegates who hold them.</p>
                  <Btn kind="primary" icon={Radio} onClick={async () => { try { const r = await api.post<any>(`/api/admin/committees/${c.id}/live`); d.reload(); openConsole(r.code, r.chairKey); } catch (e: any) { toast(e.message, 'bad'); } }}>Start live session</Btn>
                </>}
                {ss.filter((s: any) => s.ended_at).length > 0 && <p className="small faint" style={{ marginBottom: 0 }}>{ss.filter((s: any) => s.ended_at).length} earlier session(s)</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

