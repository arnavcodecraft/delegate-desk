import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { inr, dt, label, toPaise, toRupees, today } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt, downloadUrl } from '../ui';
import { PageHead, useStaff } from './Shell';

export default function Referrals() {
  const { can, eventId } = useStaff();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'referrers' | 'unmatched' | 'plans' | 'payouts' | 'tds'>((sp.get('tab') as any) ?? (can('commission.read') ? 'referrers' : 'unmatched'));
  const refs = useAsync<any[]>(() => api.get('/api/finance/referrers'), []);
  const [edit, setEdit] = useState<any>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack">
      <PageHead title="Referrals & commission">{can('referrer.manage') && <button className="btn primary" onClick={() => setEdit({ kind: 'individual' })}>+ Referrer</button>}</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'referrers', label: 'Referrers' }, { key: 'unmatched', label: 'Unmatched names' }, { key: 'plans', label: 'Plans' }, { key: 'payouts', label: 'Payouts' }, { key: 'tds', label: 'TDS register' }]} />
      {tab === 'referrers' && <div className="card flush"><DataTable rows={refs.data ?? []} onRowClick={(r) => setOpen(r.id)} columns={[
        { key: 'name', label: 'Referrer', render: (r: any) => <><strong>{r.name}</strong>{!r.active && <span className="badge">inactive</span>}<div className="small faint">{label(r.kind)}{r.aliases.length ? ` · also “${r.aliases.slice(0, 2).join('”, “')}”` : ''}</div></> },
        { key: 'plan_name', label: 'Plan', render: (r: any) => r.plan_name ?? <span className="faint">Default for {r.kind}</span> }, { key: 'referred', label: 'Referred', num: true }, { key: 'paid', label: 'Paid', num: true },
        { key: 'earned', label: 'Earned', num: true }, { key: 'approvable', label: 'Ready to approve', num: true }, { key: 'paid_out', label: 'Paid out', num: true },
        { key: 'pan', label: 'PAN', render: (r: any) => (r.pan ? '✓' : <span className="badge warn">missing</span>) },
      ]} /></div>}
      {tab === 'unmatched' && <Unmatched eventId={eventId} referrers={refs.data ?? []} />}
      {tab === 'plans' && <Plans />}
      {tab === 'payouts' && <Payouts />}
      {tab === 'tds' && <Tds />}
      {edit && <ReferrerEdit r={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); refs.reload(); }} />}
      {open && <StatementModal id={open} onClose={() => { setOpen(null); refs.reload(); }} onEdit={(r: any) => { setOpen(null); setEdit(r); }} referrer={(refs.data ?? []).find((r) => r.id === open)} />}
    </div>
  );
}

function Unmatched({ eventId, referrers }: { eventId: string; referrers: any[] }) {
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/lists/unmatched_referrals`), [eventId]);
  const { can } = useStaff();
  const toast = useToast();
  const link = async (regId: string, referrerId: string | null) => { try { await api.post(`/api/admin/registrations/${regId}/link-referral`, { referrer_id: referrerId }); toast(referrerId ? 'Linked; commission recalculated' : 'Marked as no referrer', 'ok'); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <Alert tone="info">Typed referral names that didn’t exactly match. Commission isn’t calculated until you link them. Linking also teaches the system that spelling, so the next delegate who types it is linked at once.</Alert>
      <div className="card flush">{!d.data ? <Loading /> : <DataTable rows={d.data.rows} empty="No unmatched referral names." columns={[
        { key: 'full_name', label: 'Delegate', render: (r: any) => <Link to={`/app/registrations/${r.id}`}>{r.full_name}</Link> }, { key: 'referral_name', label: 'Typed', render: (r: any) => <strong>“{r.referral_name}”</strong> }, { key: 'payment_status', label: 'Payment' },
        { key: 'act', label: 'Link to', sort: false, render: (r: any) => can('referral.link') ? <span className="row">
          {r.suggestions.map((s: any) => <Btn key={s.id} size="sm" kind="good" onClick={() => link(r.id, s.id)}>{s.name} <span className="faint">{Math.round(s.score * 100)}%</span></Btn>)}
          <select className="input-sm" style={{ width: 'auto' }} value="" onChange={(e) => e.target.value && link(r.id, e.target.value)} aria-label="Other referrer"><option value="">Other…</option>{referrers.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
          <Btn size="sm" onClick={() => link(r.id, null)}>No referrer</Btn>
        </span> : null },
      ]} />}</div>
    </div>
  );
}

function ReferrerEdit({ r, onClose, onDone }: any) {
  const plans = useAsync<any[]>(() => api.get('/api/finance/plans'), []);
  const [f, setF] = useState({ ...r, aliases: (r.aliases ?? []).join(', ') });
  const toast = useToast();
  return (
    <Modal title={r.id ? `Edit ${r.name}` : 'New referrer'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={async () => { try { await api.post('/api/finance/referrers', { ...f, aliases: String(f.aliases ?? '').split(',').map((s: string) => s.trim()).filter(Boolean) }); onDone(); } catch (e: any) { toast(e.message, 'bad'); } }}>Save</Btn></>}>
      <div className="grid g2">
        <Field label="Name"><input value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type"><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['individual', 'ambassador', 'school', 'partner'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
        <Field label="Email"><input value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Mobile"><input value={f.mobile ?? ''} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="PAN" hint="needed for TDS at the normal rate"><input value={f.pan ?? ''} onChange={(e) => setF({ ...f, pan: e.target.value.toUpperCase() })} /></Field>
        <Field label="Plan"><select value={f.plan_id ?? ''} onChange={(e) => setF({ ...f, plan_id: e.target.value || null })}><option value="">Default for this type</option>{(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_override && !p.signed_off_by ? ' (awaiting CFO sign-off)' : ''}</option>)}</select></Field>
        <Field label="Bank account"><input value={f.bank_account ?? ''} onChange={(e) => setF({ ...f, bank_account: e.target.value })} /></Field>
        <Field label="IFSC"><input value={f.bank_ifsc ?? ''} onChange={(e) => setF({ ...f, bank_ifsc: e.target.value.toUpperCase() })} /></Field>
        <Field label="Other spellings" hint="comma separated"><input value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} /></Field>
        {r.id && <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.active !== 0 && f.active !== false} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>}
      </div>
    </Modal>
  );
}

function StatementModal({ id, onClose, onEdit, referrer }: any) {
  const s = useAsync<any>(() => api.get(`/api/finance/referrers/${id}/statement`), [id]);
  const { can } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  const d = s.data;
  return (
    <Modal wide title={d ? `${d.referrer.name} – commission statement` : 'Statement'} onClose={onClose} footer={<>
      {referrer && <a className="btn" href={referrer.statement_url} target="_blank" rel="noreferrer">Referrer’s live page</a>}
      <a className="btn" href={`/api/finance/referrers/${id}/statement.pdf`} target="_blank" rel="noreferrer">PDF</a>
      {can('referrer.manage') && referrer && <button className="btn" onClick={() => onEdit(referrer)}>Edit</button>}
      <Btn onClick={async () => { await api.post(`/api/finance/referrers/${id}/recalculate`); s.reload(); }}>Recalculate</Btn>
      {can('commission.approve') && d?.totals.accrued > 0 && <Btn kind="good" onClick={async () => { const r = await api.post<any>(`/api/finance/referrers/${id}/approve`, {}); toast(`${r.approved} line(s) approved`, 'ok'); s.reload(); }}>Approve {inr(d.totals.accrued)}</Btn>}
      {can('commission.pay') && d?.totals.approved > 0 && <Btn kind="primary" onClick={async () => { const r = await ask({ title: 'Pay commission', message: 'TDS is deducted per the settings and shown on the statement emailed to the referrer.', fields: [{ key: 'reference', label: 'Bank / UPI reference', required: true }, { key: 'paid_on', label: 'Paid on', type: 'date', value: today() }] }); if (r) { try { const p = await api.post<any>(`/api/finance/referrers/${id}/payout`, r); toast(`Paid ${inr(p.net)} (TDS ${inr(p.tds)})`, 'ok'); s.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Pay approved</Btn>}
    </>}>
      {!d ? <Loading /> : <div className="stack">
        <div className="grid g4">
          <div className="tile"><div className="label">Paid registrations</div><div className="value">{d.paidCount}</div><div className="sub">{d.referred} referred</div></div>
          <div className="tile"><div className="label">Slab</div><div className="value">{d.currentSlab?.label ?? '—'}</div><div className="sub">{d.nextSlab ? `${d.nextSlab.needed} more → ${d.nextSlab.label}` : ''}</div></div>
          <div className="tile"><div className="label">Earned</div><div className="value">{inr(d.totals.earned)}</div><div className="sub">{inr(d.totals.held)} held in refund window</div></div>
          <div className="tile"><div className="label">Paid</div><div className="value">{inr(d.totals.paid)}</div><div className="sub">TDS {inr(d.totals.tdsWithheld)}</div></div>
        </div>
        {!d.plan && <Alert tone="warn">No commission plan applies to this referrer.</Alert>}
        {!d.referrer.hasBank && <Alert tone="warn">Add bank details before paying.</Alert>}
        <h3>Audit view: every registration counted</h3>
        <DataTable rows={d.lines} maxHeight={360} columns={[{ key: 'created_at', label: 'When', render: (l: any) => dt(l.created_at) }, { key: 'ref', label: 'Registration', render: (l: any) => `${l.full_name ?? ''} ${l.ref ?? ''}` }, { key: 'kind', label: 'Type', render: (l: any) => label(l.kind) }, { key: 'position', label: '#', num: true }, { key: 'bracket', label: 'Bracket' }, { key: 'base_paise', label: 'Base', num: true }, { key: 'rate_bp', label: 'Rate', num: true, render: (l: any) => (l.rate_bp != null ? `${l.rate_bp / 100}%` : '') }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }]} />
        {d.payouts.length > 0 && <><h3>Payouts</h3><DataTable rows={d.payouts} columns={[{ key: 'paid_on', label: 'Date' }, { key: 'ref', label: 'Payout', render: (p: any) => <a href={`/api/finance/payouts/${p.id}/statement.pdf`} target="_blank" rel="noreferrer">{p.ref}</a> }, { key: 'gross_paise', label: 'Gross', num: true }, { key: 'tds_paise', label: 'TDS', num: true }, { key: 'net_paise', label: 'Net', num: true }, { key: 'reference', label: 'Reference' }]} /></>}
      </div>}
    </Modal>
  );
}

function Plans() {
  const p = useAsync<any[]>(() => api.get('/api/finance/plans'), []);
  const { can } = useStaff();
  const [edit, setEdit] = useState<any>(null);
  return (
    <div className="stack">
      <Alert tone="info"><strong>Slab:</strong> the referrer’s total decides one rate for every registration (crossing a threshold re-prices earlier ones as a true-up). <strong>Progressive:</strong> each registration earns its own bracket’s rate — smoother and easier to budget.</Alert>
      {can('commission.config') && <div><button className="btn primary" onClick={() => setEdit({ name: '', method: 'progressive', basis: 'count', base: 'after_discount', period: 'event', tiers: [{ from: 1, to: 10, rate_bp: 500 }, { from: 11, to: null, rate_bp: 700 }], min_payout_paise: 0 })}>+ Plan</button></div>}
      <div className="card flush"><DataTable rows={p.data ?? []} onRowClick={can('commission.config') ? setEdit : undefined} columns={[
        { key: 'name', label: 'Plan' }, { key: 'method', label: 'Method', render: (x: any) => label(x.method) }, { key: 'basis', label: 'Counts', render: (x: any) => (x.basis === 'count' ? 'Paid registrations' : 'Net fee value') }, { key: 'base', label: 'Base', render: (x: any) => label(x.base) }, { key: 'period', label: 'Period', render: (x: any) => label(x.period) },
        { key: 'tiers', label: 'Tiers', sort: false, render: (x: any) => x.tiers.map((t: any) => `${x.basis === 'value' ? inr(t.from) : t.from}${t.to != null ? '–' + (x.basis === 'value' ? inr(t.to) : t.to) : '+'}: ${t.rate_bp != null ? t.rate_bp / 100 + '%' : inr(t.amount_paise)}`).join(' · ') },
        { key: 'referrer_kind', label: 'Default for', render: (x: any) => (x.is_override ? <span className="badge warn">Named override{x.signed_off_by ? ' · signed off' : ' · needs CFO'}</span> : x.referrer_kind ? label(x.referrer_kind) : 'Everyone') },
        { key: 'act', label: '', sort: false, render: (x: any) => x.is_override && !x.signed_off_by && can('commission.signoff') && <Btn size="sm" onClick={async () => { await api.post(`/api/finance/plans/${x.id}/signoff`); p.reload(); }}>Sign off</Btn> },
      ]} /></div>
      {edit && <PlanEdit plan={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); p.reload(); }} />}
    </div>
  );
}

function PlanEdit({ plan, onClose, onDone }: any) {
  const [f, setF] = useState<any>({ ...plan, tiers: plan.tiers.map((t: any) => ({ ...t, rate: t.rate_bp != null ? String(t.rate_bp / 100) : '', amount: t.amount_paise != null ? toRupees(t.amount_paise) : '', fromR: plan.basis === 'value' ? toRupees(t.from) : String(t.from), toR: t.to == null ? '' : plan.basis === 'value' ? toRupees(t.to) : String(t.to) })) });
  const toast = useToast();
  const setT = (i: number, k: string, v: string) => setF({ ...f, tiers: f.tiers.map((t: any, j: number) => (j === i ? { ...t, [k]: v } : t)) });
  return (
    <Modal wide title={plan.id ? `Edit ${plan.name}` : 'New commission plan'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={async () => {
      const value = f.basis === 'value';
      const tiers = f.tiers.map((t: any) => ({ from: value ? toPaise(t.fromR) : Number(t.fromR), to: t.toR === '' ? null : value ? toPaise(t.toR) : Number(t.toR), rate_bp: t.rate !== '' ? Math.round(Number(t.rate) * 100) : null, amount_paise: t.amount !== '' ? toPaise(t.amount) : null }));
      try { await api.post('/api/finance/plans', { ...f, tiers, cap_paise: f.capR ? toPaise(f.capR) : f.cap_paise ?? null, min_payout_paise: f.minR != null ? toPaise(f.minR) : f.min_payout_paise }); toast('Saved; every referrer recalculated', 'ok'); onDone(); } catch (e: any) { toast(e.message, 'bad'); }
    }}>Save plan</Btn></>}>
      <div className="stack">
        <div className="grid g3">
          <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Method"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="progressive">Progressive (marginal)</option><option value="slab">Slab (whole bracket)</option><option value="flat_pct">Flat percentage</option><option value="flat_amount">Flat amount per delegate</option></select></Field>
          <Field label="Counting basis"><select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value })}><option value="count">Number of paid registrations</option><option value="value">Total net fee value</option></select></Field>
          <Field label="Commission base"><select value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })}><option value="excl_gst">Fee excluding GST</option><option value="after_discount">After discount</option><option value="after_gateway_fee">After discount and gateway fee</option></select></Field>
          <Field label="Period" hint="counters reset at period end"><select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}><option value="event">Whole event</option><option value="month">Calendar month</option><option value="year">All events in a financial year</option></select></Field>
          <Field label="Default for type"><select value={f.referrer_kind ?? ''} onChange={(e) => setF({ ...f, referrer_kind: e.target.value || null, is_override: false })}><option value="">Everyone (fallback)</option>{['individual', 'ambassador', 'school', 'partner'].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
          <Field label="Cap per referrer ₹" hint="optional"><input value={f.capR ?? toRupees(f.cap_paise)} onChange={(e) => setF({ ...f, capR: e.target.value })} /></Field>
          <Field label="Minimum payout ₹"><input value={f.minR ?? toRupees(f.min_payout_paise)} onChange={(e) => setF({ ...f, minR: e.target.value })} /></Field>
          <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!f.is_override} onChange={(e) => setF({ ...f, is_override: e.target.checked, referrer_kind: null })} />Fixed plan for a named referrer (needs CFO sign-off)</label>
        </div>
        <h3>Tiers</h3>
        <div className="table-wrap"><table className="t"><thead><tr><th>From {f.basis === 'value' ? '(₹)' : '(registration #)'}</th><th>To (blank = no limit)</th><th>Rate %</th><th>or ₹ per delegate</th><th /></tr></thead><tbody>
          {f.tiers.map((t: any, i: number) => <tr key={i}><td><input className="input-sm" value={t.fromR} onChange={(e) => setT(i, 'fromR', e.target.value)} /></td><td><input className="input-sm" value={t.toR} onChange={(e) => setT(i, 'toR', e.target.value)} /></td><td><input className="input-sm" value={t.rate} onChange={(e) => setT(i, 'rate', e.target.value)} /></td><td><input className="input-sm" value={t.amount} onChange={(e) => setT(i, 'amount', e.target.value)} /></td><td><button className="btn sm ghost" onClick={() => setF({ ...f, tiers: f.tiers.filter((_: any, j: number) => j !== i) })}>✕</button></td></tr>)}
        </tbody></table></div>
        <div><button className="btn sm" onClick={() => setF({ ...f, tiers: [...f.tiers, { fromR: '', toR: '', rate: '', amount: '' }] })}>+ Tier</button></div>
      </div>
    </Modal>
  );
}

function Payouts() {
  const p = useAsync<any[]>(() => api.get('/api/finance/payouts'), []);
  return <div className="card flush"><DataTable rows={p.data ?? []} empty="No payouts yet." columns={[{ key: 'paid_on', label: 'Date' }, { key: 'ref', label: 'Payout', render: (x: any) => <a href={`/api/finance/payouts/${x.id}/statement.pdf`} target="_blank" rel="noreferrer">{x.ref}</a> }, { key: 'name', label: 'Referrer' }, { key: 'gross_paise', label: 'Gross', num: true }, { key: 'tds_paise', label: 'TDS', num: true }, { key: 'net_paise', label: 'Net', num: true }, { key: 'reference', label: 'Reference' }]} /></div>;
}

function Tds() {
  const [fy, setFy] = useState(() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; });
  const r = useAsync<any[]>(() => api.get(`/api/finance/commission/tds-register${qs({ fy })}`), [fy]);
  return (
    <div className="stack">
      <div className="row"><input style={{ width: 140 }} value={fy} onChange={(e) => setFy(e.target.value)} aria-label="Financial year" /><span className="muted small">Quarterly working for Form 26Q; Form 16A data per referrer.</span><span className="spacer" /><button className="btn" onClick={() => downloadUrl(`/api/finance/commission/tds-register${qs({ fy, format: 'csv' })}`)}>Download CSV</button></div>
      <div className="card flush"><DataTable rows={r.data ?? []} rowKey={(x: any) => x.ref} columns={[{ key: 'paid_on', label: 'Date' }, { key: 'ref', label: 'Payout' }, { key: 'name', label: 'Deductee' }, { key: 'pan', label: 'PAN', render: (x: any) => x.pan ?? <span className="badge warn">No PAN – higher rate</span> }, { key: 'gross_paise', label: 'Paid/credited', num: true }, { key: 'tds_rate_bp', label: 'Rate', num: true, render: (x: any) => `${x.tds_rate_bp / 100}%` }, { key: 'tds_paise', label: 'TDS', num: true }]} /></div>
    </div>
  );
}

export { Status };
