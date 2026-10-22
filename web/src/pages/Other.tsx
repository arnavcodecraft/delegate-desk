import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { inr, dt, label } from '../format';
import { Alert, Btn, DataTable, ErrorBox, Field, Loading, Status, useAsync, useToast, usePrompt } from '../ui';
import { PublicShell } from './Register';

const blankMember = () => ({ full_name: '', email: '', mobile: '', class_year: '11', dob: '', city: '', preferences: [] as string[], guardian_name: '', guardian_email: '' });

/** A head delegate or faculty advisor registers a whole delegation in one go. */
export function DelegationRegister() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const info = useAsync<any>(() => api.get(`/api/public/events/${code}`), [code]);
  const [head, setHead] = useState({ name: '', email: '', mobile: '', institution: '' });
  const [members, setMembers] = useState([blankMember(), blankMember()]);
  const [errors, setErrors] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  if (info.loading) return <PublicShell title="Delegation registration"><Loading /></PublicShell>;
  if (info.error) return <PublicShell title="Delegation registration"><ErrorBox error={info.error} /></PublicShell>;
  const ev = info.data;
  const setM = (i: number, k: string, v: any) => setMembers(members.map((m, j) => (j === i ? { ...m, [k]: v } : m)));
  async function submit() {
    setBusy(true);
    try {
      const out = await api.post<any>(`/api/public/events/${code}/delegation`, { head, members: members.map((m) => ({ ...m, institution: head.institution, consent: true, preferences: m.preferences })) });
      if (out.errors.length) { setErrors(out.errors); toast(`${out.registered.length} registered; ${out.errors.length} need fixing`, 'bad'); }
      if (out.registered.length) nav(`/delegation/${out.token}`);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  return (
    <PublicShell title={`Delegation registration – ${ev.event.name}`} subtitle="For head delegates and faculty advisors">
      <div className="card stack">
        <h3>Head delegate / faculty advisor</h3>
        <div className="grid g2">
          <Field label="Your name"><input value={head.name} onChange={(e) => setHead({ ...head, name: e.target.value })} /></Field>
          <Field label="Institution"><input value={head.institution} onChange={(e) => setHead({ ...head, institution: e.target.value })} /></Field>
          <Field label="Email"><input type="email" value={head.email} onChange={(e) => setHead({ ...head, email: e.target.value })} /></Field>
          <Field label="Mobile"><input type="tel" value={head.mobile} onChange={(e) => setHead({ ...head, mobile: e.target.value })} /></Field>
        </div>
        <h3>Members ({members.length})</h3>
        <p className="small muted" style={{ margin: 0 }}>Each member gets their own record and delegate link. Members under 18 need a parent or school contact for consent.</p>
        {members.map((m, i) => (
          <div key={i} className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: '.75rem' }}>
            <div className="row between"><strong>Member {i + 1}</strong>{members.length > 1 && <button className="btn sm ghost" onClick={() => setMembers(members.filter((_, j) => j !== i))}>Remove</button>}</div>
            {errors.find((e) => e.row === i + 1) && <Alert tone="bad">{errors.find((e) => e.row === i + 1).error}{errors.find((e) => e.row === i + 1).fields ? ': ' + Object.values(errors.find((e) => e.row === i + 1).fields).join('; ') : ''}</Alert>}
            <div className="grid g3">
              <Field label="Full name"><input value={m.full_name} onChange={(e) => setM(i, 'full_name', e.target.value)} /></Field>
              <Field label="Email"><input type="email" value={m.email} onChange={(e) => setM(i, 'email', e.target.value)} /></Field>
              <Field label="Mobile"><input type="tel" value={m.mobile} onChange={(e) => setM(i, 'mobile', e.target.value)} /></Field>
              <Field label="Class"><select value={m.class_year} onChange={(e) => setM(i, 'class_year', e.target.value)}>{ev.classOptions.map((c: string) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Date of birth"><input type="date" value={m.dob} onChange={(e) => setM(i, 'dob', e.target.value)} /></Field>
              <Field label="City"><input value={m.city} onChange={(e) => setM(i, 'city', e.target.value)} /></Field>
              <Field label="First choice committee"><select value={m.preferences[0] ?? ''} onChange={(e) => setM(i, 'preferences', e.target.value ? [e.target.value] : [])}><option value="">Surprise me</option>{ev.committees.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label="Parent / school contact" hint="if under 18"><input value={m.guardian_name} onChange={(e) => setM(i, 'guardian_name', e.target.value)} /></Field>
              <Field label="Their email" hint="if under 18"><input type="email" value={m.guardian_email} onChange={(e) => setM(i, 'guardian_email', e.target.value)} /></Field>
            </div>
          </div>
        ))}
        <div className="row"><button className="btn" onClick={() => setMembers([...members, blankMember()])}>+ Add member</button><span className="spacer" /><button className="btn primary lg" disabled={busy} onClick={submit}>{busy ? 'Registering…' : `Register ${members.length} delegates`}</button></div>
        <p className="small faint" style={{ margin: 0 }}>By registering you confirm the members agreed to the <a href="/privacy">privacy notice</a> and refund policy. Larger lists can be uploaded as a CSV by the secretariat.</p>
      </div>
    </PublicShell>
  );
}

export function DelegationPortal() {
  const { token = '' } = useParams();
  const v = useAsync<any>(() => api.get(`/api/public/delegation/${token}`), [token]);
  const toast = useToast();
  const ask = usePrompt();
  if (v.loading && !v.data) return <PublicShell title="Delegation"><Loading /></PublicShell>;
  if (v.error) return <PublicShell title="Delegation"><ErrorBox error={v.error} /></PublicShell>;
  const { delegation: d, event, members, totalDue, payment } = v.data;
  async function pay(g: string) {
    try {
      const o = await api.post<any>(`/api/public/delegation/${token}/orders`, { gateway: g });
      if (o.checkout.provider === 'mock') window.location.href = o.checkout.url;
      else toast('Opening the payment page…');
      if (o.checkout.provider === 'razorpay') {
        const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.onload = () => new (window as any).Razorpay({ key: o.checkout.key, order_id: o.checkout.order_id, amount: o.checkout.amount, name: o.checkout.name, prefill: o.checkout.prefill, handler: async (r: any) => { await api.post(`/api/public/orders/${o.orderId}/callback`, r); v.reload(); } }).open();
        document.body.appendChild(s);
      }
    } catch (e: any) { toast(e.message, 'bad'); }
  }
  return (
    <PublicShell title={d.institution} subtitle={`${event.name} · Head delegate ${d.head_name}`}>
      <div className="stack">
        <div className="card flush">
          <div className="card-head"><h3>Members</h3><span className="spacer" /><span className="muted small">Allocations are set by the secretariat</span></div>
          <DataTable rows={members} columns={[
            { key: 'full_name', label: 'Name', render: (m: any) => <><strong>{m.full_name}</strong><div className="small faint">{m.ref}</div></> },
            { key: 'committee', label: 'Allotment', render: (m: any) => m.portfolio ? <>{m.portfolio}<div className="small faint">{m.committee}</div></> : <Status value={m.allot_status} /> },
            { key: 'payment_status', label: 'Payment' },
            { key: 'balance_paise', label: 'Due', num: true },
            { key: 'act', label: '', sort: false, render: (m: any) => !m.cancelled && <span className="row">
              <button className="btn sm" onClick={async () => { const r = await ask({ title: `Edit ${m.full_name}`, fields: [{ key: 'full_name', label: 'Name', value: m.full_name }, { key: 'email', label: 'Email', value: m.email }, { key: 'mobile', label: 'Mobile', value: m.mobile }, { key: 'class_year', label: 'Class', value: m.class_year }], confirm: 'Save' }); if (r) { try { await api.patch(`/api/public/delegation/${token}/members/${m.id}`, r); v.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Edit</button>
              {m.payment_status !== 'paid' && <button className="btn sm danger" onClick={async () => { if (await ask({ title: `Remove ${m.full_name}?`, confirm: 'Remove', danger: true })) { try { await api.del(`/api/public/delegation/${token}/members/${m.id}`); v.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Remove</button>}
              {d.payment_mode === 'members_pay' && <a className="btn sm" href={m.portal}>Link</a>}
            </span> },
          ]} />
        </div>
        {payment && totalDue > 0 && (
          <div className="card stack"><h3>Pay for the delegation: {inr(totalDue)}</h3>
            {payment.gateways.map((g: any) => <Btn key={g.name} kind={g.default ? 'primary' : undefined} size="lg" onClick={() => pay(g.name)}>{g.label}</Btn>)}
            <p className="small muted" style={{ margin: 0 }}>For a bank transfer, each member can upload proof from their own link.</p>
          </div>
        )}
        {d.payment_mode === 'members_pay' && <Alert tone="info">Each member pays from their own delegate link (emailed to them).</Alert>}
        <AddMembers token={token} onDone={v.reload} />
      </div>
    </PublicShell>
  );
}

function AddMembers({ token, onDone }: { token: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState(blankMember());
  const toast = useToast();
  if (!open) return <div><button className="btn" onClick={() => setOpen(true)}>+ Add a member</button></div>;
  return (
    <div className="card stack"><h3>Add a member</h3>
      <div className="grid g3">
        {(['full_name', 'email', 'mobile', 'class_year', 'city'] as const).map((k) => <Field key={k} label={label(k)}><input value={(m as any)[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Field>)}
        <Field label="Date of birth"><input type="date" value={m.dob} onChange={(e) => setM({ ...m, dob: e.target.value })} /></Field>
        <Field label="Parent / school contact" hint="if under 18"><input value={m.guardian_name} onChange={(e) => setM({ ...m, guardian_name: e.target.value })} /></Field>
        <Field label="Their email"><input value={m.guardian_email} onChange={(e) => setM({ ...m, guardian_email: e.target.value })} /></Field>
      </div>
      <div className="row"><Btn kind="primary" onClick={async () => { const r = await api.post<any>(`/api/public/delegation/${token}/members`, { members: [m] }); if (r.errors.length) toast(r.errors[0].error + (r.errors[0].fields ? ': ' + Object.values(r.errors[0].fields).join('; ') : ''), 'bad'); else { setM(blankMember()); setOpen(false); onDone(); } }}>Add</Btn><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}

export function ReferrerStatement() {
  const { token = '' } = useParams();
  const s = useAsync<any>(() => api.get(`/api/public/referrer/${token}`), [token]);
  if (s.loading) return <PublicShell title="Referral statement"><Loading /></PublicShell>;
  if (s.error) return <PublicShell title="Referral statement"><ErrorBox error={s.error} /></PublicShell>;
  const d = s.data;
  return (
    <PublicShell title={d.referrer.name} subtitle="Your live referral statement">
      <div className="stack">
        <div className="grid g3">
          <div className="tile"><div className="label">Delegates referred</div><div className="value">{d.referred}</div><div className="sub">{d.paidCount} paid</div></div>
          <div className="tile"><div className="label">Current slab</div><div className="value">{d.currentSlab?.label ?? '—'}</div><div className="sub">{d.nextSlab ? `${d.nextSlab.needed} more to reach ${d.nextSlab.label}` : d.plan ? 'Top slab' : 'No plan yet'}</div></div>
          <div className="tile"><div className="label">Commission earned</div><div className="value">{inr(d.totals.earned)}</div><div className="sub">{inr(d.totals.paid)} paid · {inr(d.totals.tdsWithheld)} TDS</div></div>
        </div>
        {d.plan && <div className="card small"><strong>{d.plan.name}</strong> — {d.plan.method === 'slab' ? 'your total sets one rate for every registration' : d.plan.method === 'progressive' ? 'each registration earns its own bracket’s rate' : 'flat rate'}: {d.plan.tiers.map((t: any) => `${t.from}${t.to ? '–' + t.to : '+'} → ${t.rate_bp != null ? t.rate_bp / 100 + '%' : inr(t.amount_paise)}`).join(' · ')}. Only confirmed payments count; commission is held during the refund window, then approved and paid with TDS deducted.</div>}
        <div className="card flush"><div className="card-head"><h3>Delegates</h3></div>
          <DataTable rows={d.delegates} rowKey={(r: any) => r.name + r.event} columns={[{ key: 'name', label: 'Name' }, { key: 'event', label: 'Event' }, { key: 'status', label: 'Status', render: (r: any) => <Status value={r.status} /> }]} empty="No referrals yet. Share your name with delegates; they type it in the “Referred by” box." /></div>
        <div className="card flush"><div className="card-head"><h3>Commission lines</h3></div>
          <DataTable rows={d.lines} rowKey={(r: any) => r.created_at + r.name + r.amount_paise} columns={[{ key: 'created_at', label: 'Date', render: (r: any) => dt(r.created_at) }, { key: 'name', label: 'Delegate' }, { key: 'kind', label: 'Type', render: (r: any) => label(r.kind) }, { key: 'bracket', label: 'Bracket' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }]} /></div>
      </div>
    </PublicShell>
  );
}

export function SharedList() {
  const { token = '' } = useParams();
  const s = useAsync<any>(() => api.get(`/api/public/share/${token}`), [token]);
  if (s.loading) return <PublicShell title="Shared list"><Loading /></PublicShell>;
  if (s.error) return <PublicShell title="Shared list"><ErrorBox error={s.error} /></PublicShell>;
  return (
    <div style={{ padding: '1rem', maxWidth: 1100, margin: '0 auto' }}>
      <div className="row between no-print"><div><h1>{s.data.title}</h1><p className="muted">{s.data.event} · read-only link, expires {dt(s.data.expires_at)}</p></div><div className="row"><a className="btn" href={`/api/public/share/${token}/csv`}>Download CSV</a><button className="btn" onClick={() => window.print()}>Print</button></div></div>
      <div className="card flush"><DataTable rows={s.data.rows} rowKey={(r: any) => JSON.stringify(r)} columns={s.data.columns.map((c: any) => ({ key: c.key, label: c.label }))} /></div>
    </div>
  );
}
