import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../api';
import { inr, dt, label, toPaise, today } from '../format';
import { Alert, Btn, DataTable, ErrorBox, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt, downloadUrl } from '../ui';
import { PageHead, useStaff } from './Shell';
import { IdCard, Award, Send, Search, UserPlus } from 'lucide-react';

const TEMPLATES = ['payment_reminder', 'portal_link', 'event_reminder', 'registration_saved', 'hold_expiring'];

/** Generic list screen: live data, typo-tolerant search, filters, column picker, saved views, exports, snapshots, sharing, bulk actions. */
export function ListView({ kind, committeeId, onRow, bulk }: { kind: string; committeeId?: string; onRow?: (r: any) => void; bulk?: boolean }) {
  const { eventId, can } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickCols, setPickCols] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const params = { q: debounced, committee: committeeId, filters: Object.keys(filters).length ? filters : undefined };
  const data = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/lists/${kind}${qs(params)}`), [eventId, kind, debounced, committeeId, JSON.stringify(filters)]);
  const views = useAsync<any[]>(() => api.get('/api/admin/views'), []);
  const committees = useAsync<any[]>(() => (bulk ? api.get(`/api/admin/events/${eventId}/inventory`) : Promise.resolve([])), [eventId, bulk]);
  useEffect(() => { setSelected(new Set()); }, [kind, committeeId]);
  const cols = useMemo(() => (data.data?.columns ?? []).filter((c: any) => !hidden.has(c.key)), [data.data, hidden]);
  const filterable = (data.data?.columns ?? []).filter((c: any) => /status|state|committee_short|class_year|kind|method/.test(c.key));
  const exportUrl = (format: string) => `/api/admin/events/${eventId}/lists/${kind}/export${qs({ ...params, format, columns: cols.map((c: any) => c.key).join(',') })}`;
  const rowKey = (r: any) => r.id ?? r.ref ?? r.seat_label ?? JSON.stringify(r);

  async function doBulk(action: string) {
    const ids = [...selected];
    let body: any = { action, ids };
    if (action === 'email') { const r = await ask({ title: `Email ${ids.length} delegates`, fields: [{ key: 'template', label: 'Template', options: TEMPLATES.map((t) => ({ value: t, label: label(t) })) }], confirm: 'Queue emails' }); if (!r) return; body = { ...body, ...r, quiet: true }; }
    if (action === 'move') { const r = await ask({ title: `Move ${ids.length} delegates`, fields: [{ key: 'committee_id', label: 'To committee', options: (committees.data ?? []).map((c: any) => ({ value: c.id, label: `${c.name} (${c.open} open)` })) }, { key: 'reason', label: 'Reason', required: true }], confirm: 'Move' }); if (!r) return; body = { ...body, ...r }; }
    const res = await api.post<any>(`/api/admin/events/${eventId}/bulk`, body);
    toast(`${res.ok} done${res.failed.length ? `, ${res.failed.length} failed: ${res.failed[0].error}` : ''}`, res.failed.length ? 'bad' : 'ok');
    setSelected(new Set()); data.reload();
  }

  return (
    <div className="card flush">
      <div className="card-head">
        <div className="search-wrap"><Search className="icon" /><input className="input-sm" type="search" placeholder="Search name, phone, school, UTR, portfolio…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
        {filterable.map((c: any) => {
          const vals = [...new Set((data.data?.rows ?? []).map((r: any) => r[c.key]).filter(Boolean))] as string[];
          return vals.length > 1 || filters[c.key] ? <select key={c.key} className="input-sm" style={{ width: 'auto' }} value={filters[c.key] ?? ''} onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })} aria-label={c.label}><option value="">{c.label}: all</option>{vals.sort().map((v) => <option key={v} value={v}>{label(v)}</option>)}</select> : null;
        })}
        {(views.data ?? []).filter((v) => v.list === kind).length > 0 && <select className="input-sm" style={{ width: 'auto' }} value="" onChange={(e) => { const v = views.data!.find((x) => x.id === e.target.value); if (v) { setQ(v.config.q ?? ''); setFilters(v.config.filters ?? {}); setHidden(new Set(v.config.hidden ?? [])); } }} aria-label="Saved views"><option value="">Saved views…</option>{views.data!.filter((v) => v.list === kind).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>}
        <span className="spacer" />
        <span className="small muted">{data.data ? `${data.data.rows.length} rows` : ''}</span>
        <button className="btn sm" onClick={() => setPickCols(true)}>Columns</button>
        <button className="btn sm" onClick={async () => { const r = await ask({ title: 'Save this view', fields: [{ key: 'name', label: 'Name', required: true }] }); if (r) { await api.post('/api/admin/views', { list: kind, name: r.name, config: { q, filters, hidden: [...hidden] } }); views.reload(); toast('View saved', 'ok'); } }}>Save view</button>
        <button className="btn sm" onClick={() => downloadUrl(exportUrl('xlsx'))}>Excel</button>
        <button className="btn sm" onClick={() => downloadUrl(exportUrl('csv'))}>CSV</button>
        <a className="btn sm" href={exportUrl('pdf')} target="_blank" rel="noreferrer">PDF</a>
        <button className="btn sm" title="Freeze this list as of now" onClick={async () => { const r = await ask({ title: 'Freeze a snapshot', message: 'Keeps an unchangeable copy, e.g. the final allotment at the lock date.', fields: [{ key: 'label', label: 'Label', value: `${data.data?.title} as of ${today()}` }] }); if (r) { await api.post(`/api/admin/events/${eventId}/lists/${kind}/snapshot${qs(params)}`, r); toast('Snapshot saved', 'ok'); } }}>Snapshot</button>
        {can('lists.share') && <button className="btn sm" onClick={async () => { const r = await ask({ title: 'Read-only share link', message: 'Anyone with the link can view this list until it expires. Contact details and delegates under 18 are left out.', fields: [{ key: 'hours', label: 'Expires after (hours)', value: '72', type: 'number' }], confirm: 'Create link' }); if (r) { const s = await api.post<any>(`/api/admin/events/${eventId}/share-links`, { kind, committee_id: committeeId, hours: Number(r.hours) }); await ask({ title: 'Share link created', message: `${s.url}\n\nCSV for Google Sheets: =IMPORTDATA("${s.csv}")`, confirm: 'Done', info: true }); } }}>Share</button>}
      </div>
      {bulk && selected.size > 0 && (
        <div className="card-head" style={{ background: 'var(--accent-soft)' }}>
          <strong>{selected.size} selected</strong>
          {can('messages.send') && <Btn size="sm" onClick={() => doBulk('email')}>Send email</Btn>}
          {can('alloc.move') && <Btn size="sm" onClick={() => doBulk('move')}>Change committee</Btn>}
          {can('attendance.mark') && <Btn size="sm" onClick={() => doBulk('attended')}>Mark attended</Btn>}
          <button className="btn sm" onClick={() => window.open(exportUrl('pdf'), '_blank')}>Generate badges (PDF)</button>
          <button className="btn sm ghost" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {data.error ? <div style={{ padding: '1rem' }}><ErrorBox error={data.error} /></div> : !data.data ? <Loading /> : (
        <DataTable rows={data.data.rows} rowKey={rowKey} onRowClick={onRow} selectable={bulk && data.data.rows.some((r: any) => r.id)} selected={selected} onSelect={setSelected} maxHeight={640}
          columns={cols.map((c: any) => ({ key: c.key, label: c.label, num: /paise|_due|amount|total|balance|position|members|paid$|referred|earned/.test(c.key) }))} />
      )}
      {pickCols && data.data && (
        <Modal title="Columns" onClose={() => setPickCols(false)} footer={<button className="btn primary" onClick={() => setPickCols(false)}>Done</button>}>
          <div className="stack">{data.data.columns.map((c: any) => <label key={c.key} className="check"><input type="checkbox" checked={!hidden.has(c.key)} onChange={() => { const h = new Set(hidden); h.has(c.key) ? h.delete(c.key) : h.add(c.key); setHidden(h); }} />{c.label}</label>)}</div>
        </Modal>
      )}
    </div>
  );
}

export function Registrations() {
  const nav = useNavigate();
  const { can, eventId } = useStaff();
  const [adding, setAdding] = useState(false);
  const dups = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/duplicates`), [eventId]);
  return (
    <div className="stack">
      <PageHead title="Delegates" subtitle="Everyone registered for this event. Click a row for the full record, payments, messages and history.">{can('reg.edit') && <Btn kind="primary" icon={UserPlus} onClick={() => setAdding(true)}>Desk registration</Btn>}</PageHead>
      {(dups.data?.length ?? 0) > 0 && <details className="card"><summary style={{ cursor: 'pointer' }}><strong>{dups.data!.length} possible duplicate group(s)</strong> <span className="muted small">same email, phone, or name and institution</span></summary>
        <div className="stack" style={{ marginTop: '.5rem' }}>{dups.data!.map((g, i) => <div key={i} className="small"><span className="badge">{g.match}</span> {g.value}: {g.registrations.map((r: any) => <Link key={r.id} to={`/app/registrations/${r.id}`} style={{ marginRight: 8 }}>{r.ref} {r.full_name} ({label(r.payment_status)})</Link>)}</div>)}</div></details>}
      <ListView kind="master" bulk onRow={(r) => nav(`/app/registrations/${r.id}`)} />
      {adding && <DeskRegister onClose={() => setAdding(false)} onDone={(id) => nav(`/app/registrations/${id}`)} />}
    </div>
  );
}

function DeskRegister({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { eventId } = useStaff();
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [f, setF] = useState<any>({ full_name: '', email: '', mobile: '', institution: '', class_year: '12', city: '', dob: '', referral_name: '', pref: '' });
  const [err, setErr] = useState<any>({});
  const toast = useToast();
  return (
    <Modal title="Desk registration" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={async () => {
      try { const r = await api.post<any>(`/api/admin/events/${eventId}/registrations`, { ...f, preferences: f.pref ? [f.pref] : [] }); toast(`Registered ${r.ref}`, 'ok'); onDone(r.id); }
      catch (e: any) { setErr(e.details?.fields ?? {}); toast(e.message, 'bad'); }
    }}>Register</Btn></>}>
      <div className="grid g2">
        {(['full_name', 'email', 'mobile', 'institution', 'class_year', 'city', 'referral_name'] as const).map((k) => <Field key={k} label={label(k)} error={err[k]}><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label="Date of birth" error={err.dob}><input type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} /></Field>
        <Field label="First choice"><select value={f.pref} onChange={(e) => setF({ ...f, pref: e.target.value })}><option value="">Most open seats</option>{(inv.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.open} open)</option>)}</select></Field>
        {err.guardian_name && <><Field label="Guardian name" error={err.guardian_name}><input value={f.guardian_name ?? ''} onChange={(e) => setF({ ...f, guardian_name: e.target.value })} /></Field><Field label="Guardian email" error={err.guardian_email}><input value={f.guardian_email ?? ''} onChange={(e) => setF({ ...f, guardian_email: e.target.value })} /></Field></>}
      </div>
    </Modal>
  );
}

export function RegistrationDetail() {
  const { id = '' } = useParams();
  const { can, eventId } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  const d = useAsync<any>(() => api.get(`/api/admin/registrations/${id}`), [id]);
  const [tab, setTab] = useState<'overview' | 'payments' | 'messages' | 'history'>('overview');
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  if (d.loading && !d.data) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} />;
  const { registration: r, seat, referrer } = d.data;
  const act = (fn: () => Promise<any>, ok: string) => async () => { try { await fn(); toast(ok, 'ok'); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <PageHead title={<>{r.full_name} <span className="muted" style={{ fontWeight: 400, fontSize: '1rem' }}>{r.ref}</span></>}>
        <Link to="/app/registrations" className="btn">← All delegates</Link>
      </PageHead>
      {r.email_bounced ? <Alert tone="warn">Emails to {r.email} are bouncing. Fix the address and resend.</Alert> : null}
      {r.referral_state === 'unmatched' && <Alert tone="warn">Referral name “{r.referral_name}” is not matched to a referrer; no commission until linked. <Link to="/app/referrals?tab=unmatched">Link it</Link></Alert>}
      {r.is_minor && r.guardian_consent !== 'verified' ? <Alert tone="info">Under 18 — waiting for parent/school consent ({r.guardian_name}, {r.guardian_email}).</Alert> : null}
      <div className="grid g3">
        <div className="card"><div className="muted small">Allotment</div>{seat ? <><div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{seat.portfolio}</div><div>{seat.committee}</div><Status value={seat.state} /></> : <><Status value={r.allot_status} />{r.waitlist_position && <span className="small"> position {r.waitlist_position}</span>}</>}
          <div className="row" style={{ marginTop: '.6rem' }}>{can('alloc.move') && !r.cancelled_at && <button className="btn sm" onClick={() => setMoving(true)}>{seat ? 'Move / swap' : r.allot_status === 'applied' ? 'Accept & assign a seat' : 'Allot a seat'}</button>}</div></div>
        <div className="card"><div className="muted small">Payment</div><div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{inr(r.paid_paise - r.refunded_paise)} <span className="muted" style={{ fontSize: '.9rem', fontWeight: 400 }}>of {inr(r.total_paise)}</span></div><Status value={r.payment_status} />{r.balance_paise > 0 && <div className="small">Balance {inr(r.balance_paise)}{r.hold_expires_at ? ` · hold until ${dt(r.hold_expires_at)}` : ''}</div>}</div>
        <div className="card"><div className="muted small">Referral</div><div style={{ fontWeight: 600 }}>{referrer ? referrer.name : r.referral_name || 'None'}</div><Status value={r.referral_state} />{r.self_referral ? <span className="badge bad">Self-referral</span> : null}</div>
      </div>
      <div className="row">
        {can('reg.edit') && <button className="btn" onClick={() => setEditing(true)}>Edit details</button>}
        {can('reg.edit', 'messages.send') && <Btn onClick={async () => { const x = await ask({ title: 'Resend an email', fields: [{ key: 'kind', label: 'Email', options: [{ value: 'portal_link', label: 'Delegate link' }, { value: 'registration_saved', label: 'Allotment & payment link' }, { value: 'payment_confirmed', label: 'Receipt & invoice' }, { value: 'payment_reminder', label: 'Payment reminder' }] }] }); if (x) await act(() => api.post(`/api/admin/registrations/${id}/resend`, x), 'Queued')(); }}>Resend email</Btn>}
        {r.portal && <a className="btn" href={r.portal} target="_blank" rel="noreferrer">Open delegate page</a>}
        {can('reg.edit') && !r.accepted && r.allot_status !== 'applied' && <Btn onClick={act(() => api.post(`/api/admin/registrations/${id}/accept`), 'Accepted; balance requested')}>Accept (balance due)</Btn>}
        {r.allot_status === 'applied' && <Link className="btn primary" to="/app/applications">Review in Applications</Link>}
        {can('payments.read') && r.balance_paise > 0 && can('reg.edit') && <Btn onClick={async () => {
          const x = await ask({ title: 'Record a payment proof for this delegate', message: 'For proofs received by email or WhatsApp. Another person must approve it.', fields: [{ key: 'utr', label: 'UTR', required: true }, { key: 'amount', label: 'Amount ₹', value: String(r.balance_paise / 100) }, { key: 'paid_on', label: 'Date', type: 'date', value: today() }] });
          if (!x) return;
          const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf';
          input.onchange = async () => { const fd = new FormData(); fd.append('file', input.files![0]); Object.entries(x).forEach(([k, v]) => fd.append(k, v)); await act(() => api.post(`/api/admin/registrations/${id}/evidence`, fd), 'Proof submitted for review')(); };
          input.click();
        }}>Upload proof</Btn>}
        {can('refund.request') && r.paid_paise - r.refunded_paise > 0 && <Btn onClick={async () => { const x = await ask({ title: 'Raise a refund', message: 'Needs CFO approval.', fields: [{ key: 'amount', label: 'Amount ₹', value: String((r.paid_paise - r.refunded_paise) / 100) }, { key: 'reason', label: 'Reason', required: true }] }); if (x) await act(() => api.post(`/api/finance/registrations/${id}/refund`, { amount_paise: toPaise(x.amount), reason: x.reason }), 'Refund requested')(); }}>Refund…</Btn>}
        {can('reg.cancel') && !r.cancelled_at && r.paid_paise - r.refunded_paise === 0 && <Btn kind="danger" onClick={async () => { const x = await ask({ title: 'Cancel registration', fields: [{ key: 'reason', label: 'Reason', required: true }], danger: true }); if (x) await act(() => api.post(`/api/admin/registrations/${id}/cancel`, x), 'Cancelled')(); }}>Cancel</Btn>}
        {can('reg.erase') && <Btn kind="danger" onClick={async () => { if (await ask({ title: 'Erase personal data?', message: 'Wipes personal data. Records needed for invoices and the books are kept for the statutory 8 years.', danger: true, confirm: 'Erase' })) await act(() => api.post(`/api/admin/registrations/${id}/erase`), 'Erased')(); }}>Erase data</Btn>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'overview', label: 'Profile' }, ...(can('payments.read') ? [{ key: 'payments' as const, label: 'Money' }] : []), { key: 'messages', label: `Messages (${d.data.messages.length})` }, { key: 'history', label: 'History & audit' }]} />
      {tab === 'overview' && (
        <div className="card"><dl className="kv">
          {[['Email', r.email], ['Mobile', r.mobile], ['Institution', r.institution], ['Class', r.class_year], ['City', r.city], ['Date of birth', r.dob], ['Category', r.category], ['Experience', label(r.experience)], ['Preferences', (r.preferences ?? []).length ? r.preferences.map((p: string) => d.data.view.committees.find((c: any) => c.id === p)?.short).join(', ') : 'Surprise me'], ['Dietary', r.dietary], ['T-shirt', r.tshirt], ['Emergency contact', r.emergency_name ? `${r.emergency_name} ${r.emergency_phone}` : null], ['ID proof', label(r.id_proof_status)], ['WhatsApp', r.whatsapp_consent ? 'Opted in' : 'No'], ['Registered', dt(r.created_at)], ['Source', r.source], ['Attended', r.attended_at ? dt(r.attended_at) : null], ['Award', r.award]]
            .flatMap(([k, v]) => [<dt key={k + 'k'}>{k}</dt>, <dd key={k + 'v'}>{v || <span className="faint">—</span>}</dd>])}
        </dl>{d.data.idProofUrl && <p><a href={d.data.idProofUrl} target="_blank" rel="noreferrer">View ID proof</a></p>}</div>
      )}
      {tab === 'payments' && (
        <div className="stack">
          <div className="card flush"><div className="card-head"><h3>Transactions</h3></div><DataTable rows={d.data.transactions} columns={[{ key: 'created_at', label: 'When' }, { key: 'gateway', label: 'Via' }, { key: 'gateway_payment_id', label: 'Reference' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }, { key: 'verified_by', label: 'Verified by' }, { key: 'settlement_id', label: 'Settled', render: (t: any) => (t.settlement_id ? 'Yes' : t.gateway === 'screenshot' ? 'Bank' : 'Not yet') }]} /></div>
          <div className="card flush"><div className="card-head"><h3>Payment proofs</h3></div><DataTable rows={d.data.evidence} columns={[{ key: 'submitted_at', label: 'Submitted' }, { key: 'utr', label: 'UTR' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Note' }, { key: 'url', label: '', sort: false, render: (e: any) => <a href={e.url} target="_blank" rel="noreferrer">View</a> }]} /></div>
          <div className="card flush"><div className="card-head"><h3>Invoices</h3></div><DataTable rows={d.data.invoices} columns={[{ key: 'number', label: 'Number', render: (i: any) => <a href={`/api/finance/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">{i.number}</a> }, { key: 'kind', label: 'Type', render: (i: any) => label(i.kind) }, { key: 'taxable_paise', label: 'Taxable', num: true }, { key: 'total_paise', label: 'Total', num: true }, { key: 'issued_at', label: 'Issued' }]} /></div>
          <div className="card flush"><div className="card-head"><h3>Refunds</h3></div><DataTable rows={d.data.refunds} columns={[{ key: 'created_at', label: 'Requested' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'reason', label: 'Reason' }, { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' }]} /></div>
          <div className="card flush"><div className="card-head"><h3>Commission on this delegate</h3></div><DataTable rows={d.data.commission} columns={[{ key: 'created_at', label: 'When' }, { key: 'kind', label: 'Type' }, { key: 'bracket', label: 'Bracket' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }]} /></div>
        </div>
      )}
      {tab === 'messages' && <div className="card flush"><DataTable rows={d.data.messages} columns={[{ key: 'created_at', label: 'Queued' }, { key: 'channel', label: 'Channel' }, { key: 'subject', label: 'Subject' }, { key: 'recipient', label: 'To' }, { key: 'status', label: 'Status' }, { key: 'last_error', label: 'Note' }]} /></div>}
      {tab === 'history' && (
        <div className="stack">
          <div className="card flush"><div className="card-head"><h3>Allotment history</h3></div><DataTable rows={d.data.history} columns={[{ key: 'at', label: 'When' }, { key: 'action', label: 'Action', render: (h: any) => label(h.action) }, { key: 'by_name', label: 'By', render: (h: any) => h.by_name ?? 'System' }, { key: 'reason', label: 'Reason' }]} /></div>
          <div className="card flush"><div className="card-head"><h3>Audit trail</h3></div><DataTable rows={d.data.audit} columns={[{ key: 'at', label: 'When' }, { key: 'user_label', label: 'Who' }, { key: 'action', label: 'Action' }, { key: 'after', label: 'Change', render: (a: any) => <code className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{(a.before ? a.before + ' → ' : '') + (a.after ?? '')}</code> }]} /></div>
        </div>
      )}
      {moving && <MoveSeat regId={id} eventId={eventId} onClose={() => setMoving(false)} onDone={() => { setMoving(false); d.reload(); }} />}
      {editing && <EditReg r={r} onClose={() => setEditing(false)} onDone={() => { setEditing(false); d.reload(); }} />}
    </div>
  );
}

function MoveSeat({ regId, eventId, onClose, onDone }: any) {
  const seats = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/open-seats`), [eventId]);
  const [seat, setSeat] = useState(''); const [reason, setReason] = useState('');
  const toast = useToast();
  return (
    <Modal title="Allot or move to a seat" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" disabled={!seat || !reason.trim()} onClick={async () => { try { const r = await api.post<any>(`/api/admin/registrations/${regId}/move`, { seat_id: seat, reason }); toast(`Now ${r.portfolio}, ${r.committee}${r.balance > 0 ? ` · ${inr(r.balance)} now due` : r.balance < 0 ? ' · refund raised for the difference' : ''}`, 'ok'); onDone(); } catch (e: any) { toast(e.message, 'bad'); } }}>Move</Btn></>}>
      <div className="stack">
        <Field label="Open seat"><select value={seat} onChange={(e) => setSeat(e.target.value)}><option value="">Choose…</option>{(seats.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.short} · {s.portfolio}{s.seat_no > 1 ? ` #${s.seat_no}` : ''} ({s.tier}{s.premium_paise ? `, +${inr(s.premium_paise)}` : ''})</option>)}</select></Field>
        <Field label="Reason" hint="recorded in the audit trail and emailed to the delegate and chair"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <p className="small muted" style={{ margin: 0 }}>If the new portfolio has a different premium, the fee difference is charged or refunded automatically.</p>
      </div>
    </Modal>
  );
}

function EditReg({ r, onClose, onDone }: any) {
  const { can } = useStaff();
  const fields = ['full_name', 'email', 'mobile', 'institution', 'class_year', 'city', 'dob', 'category', 'dietary', 'tshirt', 'emergency_name', 'emergency_phone', 'id_proof_status', 'award', 'referral_name'];
  const [f, setF] = useState<any>(Object.fromEntries(fields.map((k) => [k, r[k] ?? ''])));
  const toast = useToast();
  return (
    <Modal title="Edit delegate" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={async () => {
      const patch = Object.fromEntries(Object.entries(f).filter(([k, v]) => (r[k] ?? '') !== v));
      try { await api.patch(`/api/admin/registrations/${r.id}`, patch); toast('Saved', 'ok'); onDone(); } catch (e: any) { toast(e.message, 'bad'); }
    }}>Save</Btn></>}>
      <div className="grid g2">{fields.map((k) => (
        <Field key={k} label={label(k)} hint={k === 'referral_name' && r.payment_status === 'paid' && !can('referral.link') ? 'admin only after payment' : undefined}>
          {k === 'id_proof_status' ? <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{['missing', 'submitted', 'verified', 'rejected'].map((x) => <option key={x}>{x}</option>)}</select>
            : k === 'category' ? <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{['school', 'college', 'international', 'advisor'].map((x) => <option key={x}>{x}</option>)}</select>
            : <input type={k === 'dob' ? 'date' : 'text'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
        </Field>))}</div>
    </Modal>
  );
}

export function Lists() {
  const { eventId, me, can } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  const lists = useAsync<any[]>(() => api.get('/api/admin/lists'), []);
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`).catch(() => []), [eventId]);
  const chairCommittees = me.roles.filter((r) => r.role === 'chair').map((r) => r.committee_id);
  const isChairOnly = me.roles.every((r) => r.role === 'chair');
  const available = (lists.data ?? []).filter((l) => !isChairOnly || ['committee', 'attendance', 'badges', 'allotment', 'executive_board'].includes(l.key));
  const [kind, setKind] = useState(isChairOnly ? 'committee' : 'master');
  const committees = (inv.data ?? []).filter((c) => !isChairOnly || chairCommittees.includes(c.id));
  const [committee, setCommittee] = useState('');
  const def = available.find((l) => l.key === kind);
  const cId = committee || committees[0]?.id;
  const nav = useNavigate();
  return (
    <div className="stack">
      <PageHead title="Lists" subtitle="Every list is generated live from registrations. Search, filter, export, freeze a snapshot or share a read-only link." />
      <div className="row">
        <select style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="List">{available.map((l) => <option key={l.key} value={l.key}>{l.title}</option>)}</select>
        {def?.needsCommittee && <select style={{ width: 'auto' }} value={cId ?? ''} onChange={(e) => setCommittee(e.target.value)} aria-label="Committee">{committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <Snapshots />
        <span className="spacer" />
        <a className="btn" href={`/api/admin/events/${eventId}/badges.pdf${qs({ committee: def?.needsCommittee || isChairOnly ? cId : undefined })}`} target="_blank" rel="noreferrer"><IdCard className="icon" />Print badges</a>
        <a className="btn" href={`/api/admin/events/${eventId}/certificates.pdf${qs({ committee: def?.needsCommittee || isChairOnly ? cId : undefined })}`} target="_blank" rel="noreferrer"><Award className="icon" />Certificates</a>
        {can('messages.send') && !isChairOnly && <Btn icon={Send} onClick={async () => { const r = await ask({ title: 'Email certificates', message: 'Each confirmed delegate gets their certificate as a PDF attachment.', fields: [{ key: 'who', label: 'Send to', options: [{ value: 'attended', label: 'Delegates marked present' }, { value: 'all', label: 'All confirmed delegates' }] }], confirm: 'Send' }); if (r) { const x = await api.post<any>(`/api/admin/events/${eventId}/certificates/send`, { attended_only: r.who === 'attended' }); toast(`${x.queued} certificates queued`, 'ok'); } }}>Email certificates</Btn>}
      </div>
      {def && (!def.needsCommittee || cId) && (kind === 'attendance' ? <Attendance committeeId={cId} /> : <ListView key={kind + cId} kind={kind} committeeId={def.needsCommittee ? cId : undefined} bulk={['master', 'unpaid', 'badges'].includes(kind)} onRow={(r) => r.id && !isChairOnly && ['master', 'details', 'unpaid', 'badges', 'waitlist', 'unmatched_referrals'].includes(kind) ? nav(`/app/registrations/${r.id}`) : undefined} />)}
    </div>
  );
}

function Attendance({ committeeId }: { committeeId?: string }) {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/lists/attendance${qs({ committee: committeeId })}`), [eventId, committeeId]);
  const toast = useToast();
  const ask = usePrompt();
  if (!committeeId) return null;
  if (!d.data) return <Loading />;
  return (
    <div className="card flush">
      <div className="card-head"><h3>Attendance</h3><span className="spacer" /><a className="btn sm" href={`/api/admin/events/${eventId}/lists/attendance/export${qs({ committee: committeeId, format: 'pdf' })}`} target="_blank" rel="noreferrer">Print sign-in sheet</a></div>
      <DataTable rows={d.data.rows} columns={[{ key: 'portfolio', label: 'Portfolio' }, { key: 'full_name', label: 'Name' }, { key: 'institution', label: 'Institution' }, { key: 'attended_at', label: 'Checked in', render: (r: any) => r.attended_at ? dt(r.attended_at) : '—' },
        { key: 'act', label: '', sort: false, render: (r: any) => <span className="row">
          <button className={`btn sm ${r.attended_at ? '' : 'good'}`} onClick={async () => { try { await api.post(`/api/admin/registrations/${r.id}/attendance`, { present: !r.attended_at }); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>{r.attended_at ? 'Undo' : 'Mark present'}</button>
          <button className="btn sm" onClick={async () => { const x = await ask({ title: `Award for ${r.full_name}`, fields: [{ key: 'award', label: 'Award', options: ['', 'Best Delegate', 'High Commendation', 'Special Mention', 'Verbal Mention', 'Best Position Paper'].map((v) => ({ value: v, label: v || 'None' })) }] }); if (x) { await api.post(`/api/admin/registrations/${r.id}/award`, x); toast('Saved', 'ok'); } }}>Award</button>
        </span> }]} />
    </div>
  );
}

function Snapshots() {
  const { eventId } = useStaff();
  const s = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/snapshots`).catch(() => []), [eventId]);
  const [open, setOpen] = useState<any>(null);
  if (!s.data?.length) return null;
  return (<>
    <select style={{ width: 'auto' }} value="" onChange={async (e) => { if (e.target.value) setOpen(await api.get(`/api/admin/snapshots/${e.target.value}`)); }} aria-label="Snapshots"><option value="">Frozen snapshots…</option>{s.data.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
    {open && <Modal wide title={open.label} onClose={() => setOpen(null)}><p className="small muted">Frozen {dt(open.created_at)} — does not change.</p><DataTable rows={open.data.rows} rowKey={(r: any) => JSON.stringify(r)} columns={open.data.columns} /></Modal>}
  </>);
}
