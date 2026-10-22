import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { inr, dt, label, toPaise, toRupees, today } from '../format';
import { Alert, BudgetBars, Btn, DataTable, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt } from '../ui';
import { PageHead, useStaff } from './Shell';

export default function Expenses() {
  const { eventId, can } = useStaff();
  const [sp] = useSearchParams();
  const [tab, setTab] = useState<'list' | 'budgets' | 'vendors' | 'ageing' | 'cash' | 'sponsors'>('list');
  const [status, setStatus] = useState('');
  const list = useAsync<any[]>(() => api.get(`/api/finance/events/${eventId}/expenses`), [eventId]);
  const meta = useAsync<any>(() => api.get('/api/finance/expense-meta'), []);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<any>(null);
  useEffect(() => { const id = sp.get('open'); if (id && list.data) setOpen(list.data.find((e) => e.id === id) ?? null); }, [sp, list.data]);
  const rows = (list.data ?? []).filter((e) => !status || e.status === status || e.payment_status === status);
  const sum = (st: string) => (list.data ?? []).filter((e) => e.status === st).reduce((s, e) => s + e.amount_paise + e.gst_paise, 0);
  return (
    <div className="stack">
      <PageHead title="Expenses"><button className="btn primary" onClick={() => setAdding(true)}>+ Add expense</button></PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'list', label: 'Expenses' }, ...(can('expense.read') ? [{ key: 'budgets' as const, label: 'Budgets' }, { key: 'vendors' as const, label: 'Vendors' }, { key: 'ageing' as const, label: 'Who is owed' }, { key: 'cash' as const, label: 'Petty cash & advances' }, { key: 'sponsors' as const, label: 'Sponsorship' }] : [])]} />
      {tab === 'list' && <>
        <div className="row">
          {['', 'submitted', 'approved', 'rejected', 'unpaid', 'part_paid', 'paid'].map((s) => <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s ? label(s) : 'All'}</button>)}
          <span className="spacer" /><span className="small muted">Awaiting approval {inr(sum('submitted'))} · approved {inr(sum('approved'))}</span>
        </div>
        <div className="card flush"><DataTable rows={rows} onRowClick={setOpen} columns={[
          { key: 'bill_date', label: 'Bill date' }, { key: 'ref', label: 'Ref' }, { key: 'description', label: 'Description', render: (e: any) => <>{e.description}<div className="small faint">{e.vendor ?? (e.payment_mode === 'personal' ? 'Reimbursement' : '')}</div></> },
          { key: 'category', label: 'Category', render: (e: any) => label(e.category) }, { key: 'total', label: 'Amount', num: true, sortValue: (e: any) => e.amount_paise + e.gst_paise, render: (e: any) => inr(e.amount_paise + e.gst_paise) },
          { key: 'status', label: 'Approval' }, { key: 'payment_status', label: 'Payment' }, { key: 'submitted_by_name', label: 'By' },
        ]} /></div>
      </>}
      {tab === 'budgets' && <Budgets />}
      {tab === 'vendors' && <Vendors />}
      {tab === 'ageing' && <Ageing />}
      {tab === 'cash' && <Cash meta={meta.data} />}
      {tab === 'sponsors' && <Sponsors />}
      {adding && meta.data && <ExpenseForm meta={meta.data} onClose={() => setAdding(false)} onDone={() => { setAdding(false); list.reload(); }} />}
      {open && <ExpenseDetail e={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); list.reload(); }} />}
    </div>
  );
}

function ExpenseForm({ meta, onClose, onDone }: any) {
  const { eventId, me } = useStaff();
  const toast = useToast();
  const [f, setF] = useState<any>({ category: 'venue', cost_behaviour: 'fixed', description: '', vendor_id: '', invoice_no: '', bill_date: today(), amount: '', gst_rate: '18', itc_eligible: true, tds: '', payment_mode: 'bank' });
  const [bill, setBill] = useState<File | null>(null);
  const [budget, setBudget] = useState<any>(null);
  const amount = toPaise(f.amount || '0');
  const gst = Math.round((amount * Number(f.gst_rate || 0)) / 100);
  const tdsSec = meta.tdsSections[Number(f.tds)] ?? null;
  const tds = tdsSec ? Math.round((amount * tdsSec.rateBp) / 10000) : 0;
  useEffect(() => { const t = setTimeout(() => api.get(`/api/finance/events/${eventId}/budget-check${qs({ category: f.category, amount })}`).then(setBudget).catch(() => setBudget(null)), 200); return () => clearTimeout(t); }, [f.category, amount, eventId]);
  async function save(force = false) {
    const data = { event_id: eventId, category: f.category, cost_behaviour: f.cost_behaviour, description: f.description, vendor_id: f.vendor_id || null, invoice_no: f.invoice_no || null, bill_date: f.bill_date, amount_paise: amount, gst_rate_bp: Math.round(Number(f.gst_rate || 0) * 100), itc_eligible: f.itc_eligible, tds_section: tdsSec?.section ?? null, tds_rate_bp: tdsSec?.rateBp ?? 0, payment_mode: f.payment_mode, force_duplicate: force, budget_override: force };
    try {
      if (bill) { const fd = new FormData(); fd.append('bill', bill); fd.append('data', JSON.stringify(data)); await api.post('/api/finance/expenses', fd); }
      else await api.post('/api/finance/expenses', data);
      toast('Expense submitted for approval', 'ok'); onDone();
    } catch (e: any) {
      if (e.status === 409 && e.details?.duplicate && window.confirm(`${e.message}. Save anyway?`)) return save(true);
      toast(e.message, 'bad');
    }
  }
  return (
    <Modal title="Add expense" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><Btn kind="primary" onClick={() => save()}>Submit</Btn></>}>
      <div className="stack">
        <Field label="Bill photo or PDF" hint="optional now, needed before payment"><input type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setBill(e.target.files?.[0] ?? null)} /></Field>
        <div className="grid g2">
          <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{meta.categories.map((c: string) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
          <Field label="Cost behaviour" hint="feeds break-even"><select value={f.cost_behaviour} onChange={(e) => setF({ ...f, cost_behaviour: e.target.value })}><option value="fixed">Fixed</option><option value="variable">Variable per delegate</option><option value="semi">Semi-variable</option></select></Field>
        </div>
        <Field label="Description"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Hall hire, Day 1–3" /></Field>
        <div className="grid g3">
          <Field label="Amount excl. GST ₹"><input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="GST %"><select value={f.gst_rate} onChange={(e) => setF({ ...f, gst_rate: e.target.value })}>{['0', '5', '12', '18', '28'].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label="Bill date"><input type="date" value={f.bill_date} onChange={(e) => setF({ ...f, bill_date: e.target.value })} /></Field>
          <Field label="Vendor"><select value={f.vendor_id} onChange={(e) => setF({ ...f, vendor_id: e.target.value })}><option value="">—</option>{meta.vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
          <Field label="Invoice no."><input value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} /></Field>
          <Field label="Paid / to be paid by"><select value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}><option value="bank">Company bank</option><option value="upi">UPI</option><option value="card">Card</option><option value="cash">Petty cash</option><option value="personal">Me personally (reimburse {me.user!.name})</option></select></Field>
          <Field label="TDS"><select value={f.tds} onChange={(e) => setF({ ...f, tds: e.target.value })}><option value="">None</option>{meta.tdsSections.map((t: any, i: number) => <option key={i} value={i}>{t.section} · {t.label} · {t.rateBp / 100}%</option>)}</select></Field>
          <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.itc_eligible} onChange={(e) => setF({ ...f, itc_eligible: e.target.checked })} />GST input credit allowed</label>
        </div>
        <div className="fee-box">
          <div className="line"><span>Amount</span><span>{inr(amount)}</span></div>
          <div className="line"><span>GST</span><span>{inr(gst)}</span></div>
          {tds > 0 && <div className="line"><span>TDS deducted</span><span>−{inr(tds)}</span></div>}
          <div className="line total"><span>Payable to vendor</span><span>{inr(amount + gst - tds)}</span></div>
        </div>
        {budget?.budget != null && <Alert tone={(budget.left - amount) < 0 ? 'bad' : budget.pct >= 80 ? 'warn' : 'info'}>Budget for {label(f.category)}: {inr(budget.budget)} · left before this {inr(budget.left)} · after this {budget.pct}%{budget.hardLimit && budget.left - amount < 0 ? ' — hard limit: the CFO must override' : ''}</Alert>}
      </div>
    </Modal>
  );
}

function ExpenseDetail({ e, onClose, onDone }: any) {
  const { can, me } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  const payable = e.amount_paise + e.gst_paise - e.tds_paise;
  const act = (fn: () => Promise<any>, ok: string) => async () => { try { await fn(); toast(ok, 'ok'); onDone(); } catch (x: any) { toast(x.message, 'bad'); } };
  return (
    <Modal title={`${e.ref} · ${e.description}`} onClose={onClose} footer={<>
      {can('expense.approve') && ['submitted', 'draft'].includes(e.status) && e.submitted_by !== me.user!.id && <><Btn kind="good" onClick={act(() => api.post(`/api/finance/expenses/${e.id}/approve`), 'Approved and posted')}>Approve</Btn><Btn kind="danger" onClick={async () => { const r = await ask({ title: 'Reject', fields: [{ key: 'reason', label: 'Reason', required: true }] }); if (r) await act(() => api.post(`/api/finance/expenses/${e.id}/reject`, r), 'Rejected')(); }}>Reject</Btn></>}
      {can('expense.pay') && e.status === 'approved' && e.paid_paise < payable && <Btn kind="primary" onClick={async () => { const r = await ask({ title: 'Record payment', fields: [{ key: 'amount', label: 'Amount ₹', value: toRupees(payable - e.paid_paise) }, { key: 'mode', label: 'Paid from', options: [{ value: 'bank', label: 'Bank' }, { value: 'upi', label: 'UPI' }, { value: 'cash', label: 'Petty cash' }, { value: 'card', label: 'Card' }, { value: 'advance', label: 'Against an earlier advance' }] }, { key: 'reference', label: 'Reference' }, { key: 'paid_on', label: 'Date', type: 'date', value: today() }] }); if (r) await act(() => api.post(`/api/finance/expenses/${e.id}/pay`, { amount_paise: toPaise(r.amount), mode: r.mode, reference: r.reference, paid_on: r.paid_on }), 'Payment recorded')(); }}>Record payment</Btn>}
      {can('expense.approve') && e.status === 'approved' && <Btn onClick={async () => { const r = await ask({ title: 'Vendor credit note', fields: [{ key: 'amount', label: 'Amount excl. GST ₹', required: true }, { key: 'gst', label: 'GST ₹', value: '0' }, { key: 'note', label: 'Note', required: true }] }); if (r) await act(() => api.post(`/api/finance/expenses/${e.id}/credit-note`, { amount_paise: toPaise(r.amount), gst_paise: toPaise(r.gst), note: r.note }), 'Credit note posted')(); }}>Credit note</Btn>}
      <Btn onClick={act(() => api.post(`/api/finance/expenses/${e.id}/duplicate`, { bill_date: today() }), 'Recurring copy created')}>Repeat this expense</Btn>
    </>}>
      {e.submitted_by === me.user!.id && e.status === 'submitted' && <Alert tone="info">You submitted this, so someone else must approve it.</Alert>}
      <dl className="kv">
        <dt>Status</dt><dd><Status value={e.status} /> <Status value={e.payment_status} /></dd>
        <dt>Category</dt><dd>{label(e.category)} · {label(e.cost_behaviour)}</dd>
        <dt>Vendor</dt><dd>{e.vendor ?? '—'} {e.invoice_no ? `· invoice ${e.invoice_no}` : ''}</dd>
        <dt>Bill date</dt><dd>{e.bill_date}</dd>
        <dt>Amount</dt><dd>{inr(e.amount_paise)} + GST {inr(e.gst_paise)}{e.itc_eligible ? ' (input credit)' : ''}</dd>
        {e.tds_paise > 0 && <><dt>TDS</dt><dd>{inr(e.tds_paise)} u/s {e.tds_section}</dd></>}
        <dt>Payable</dt><dd>{inr(payable)} · paid {inr(e.paid_paise)}</dd>
        <dt>Submitted</dt><dd>{e.submitted_by_name} · {dt(e.created_at)}</dd>
        {e.approved_by_name && <><dt>Approved</dt><dd>{e.approved_by_name} · {dt(e.approved_at)}</dd></>}
        {e.reason && <><dt>Note</dt><dd>{e.reason}</dd></>}
        {e.bill_url && <><dt>Bill</dt><dd><a href={e.bill_url} target="_blank" rel="noreferrer">View bill</a></dd></>}
      </dl>
    </Modal>
  );
}

function Budgets() {
  const { eventId, can } = useStaff();
  const b = useAsync<any[]>(() => api.get(`/api/finance/events/${eventId}/budgets`), [eventId]);
  const meta = useAsync<any>(() => api.get('/api/finance/expense-meta'), []);
  const ask = usePrompt();
  return (
    <div className="grid g2">
      <div className="card"><h3>Budget against actual</h3><BudgetBars rows={(b.data ?? []).map((x) => ({ category: x.category, budget: x.budget, used: x.committed + x.incurred }))} /></div>
      <div className="card flush"><div className="card-head"><h3>Budget lines</h3><span className="spacer" />{can('budget.set') && <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Set budget', fields: [{ key: 'category', label: 'Category', options: (meta.data?.categories ?? []).map((c: string) => ({ value: c, label: label(c) })) }, { key: 'amount', label: 'Budget ₹', required: true }, { key: 'hard', label: 'Hard limit (block above, CFO can override)', options: [{ value: '', label: 'No — alert only' }, { value: '1', label: 'Yes' }] }] }); if (r) { await api.put(`/api/finance/events/${eventId}/budgets/${r.category}`, { amount_paise: toPaise(r.amount), hard_limit: !!r.hard }); b.reload(); } }}>Set budget</Btn>}</div>
        <DataTable rows={b.data ?? []} rowKey={(x: any) => x.category} columns={[{ key: 'category', label: 'Category', render: (x: any) => <>{label(x.category)}{x.hardLimit && <span className="badge">hard limit</span>}</> }, { key: 'budget', label: 'Budget', num: true, render: (x: any) => inr(x.budget) }, { key: 'committed', label: 'Committed', num: true, render: (x: any) => inr(x.committed) }, { key: 'incurred', label: 'Incurred', num: true, render: (x: any) => inr(x.incurred) }, { key: 'paid', label: 'Paid', num: true, render: (x: any) => inr(x.paid) }, { key: 'pct', label: 'Used', num: true, render: (x: any) => (x.pct != null ? <span style={{ color: x.over ? 'var(--bad)' : undefined }}>{x.pct}%</span> : '—') }]} /></div>
    </div>
  );
}

function Vendors() {
  const v = useAsync<any[]>(() => api.get('/api/finance/vendors'), []);
  const { can } = useStaff();
  const [edit, setEdit] = useState<any>(null);
  const [ledger, setLedger] = useState<any>(null);
  const toast = useToast();
  return (
    <div className="stack">
      {can('vendor.manage') && <div><button className="btn" onClick={() => setEdit({})}>+ Vendor</button></div>}
      <div className="card flush"><DataTable rows={v.data ?? []} onRowClick={async (r) => setLedger({ vendor: r, rows: await api.get(`/api/finance/vendors/${r.id}/ledger`) })} columns={[{ key: 'name', label: 'Vendor' }, { key: 'gstin', label: 'GSTIN' }, { key: 'pan', label: 'PAN' }, { key: 'bank_account', label: 'Bank' }, { key: 'email', label: 'Email' }, ...(can('vendor.manage') ? [{ key: 'x', label: '', sort: false, render: (r: any) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEdit(r); }}>Edit</button> }] : [])]} /></div>
      {edit && <Modal title={edit.id ? 'Edit vendor' : 'New vendor'} onClose={() => setEdit(null)} footer={<Btn kind="primary" onClick={async () => { try { await api.post('/api/finance/vendors', edit); setEdit(null); v.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Save</Btn>}>
        <div className="grid g2">{['name', 'gstin', 'pan', 'bank_account', 'bank_ifsc', 'email', 'phone'].map((k) => <Field key={k} label={label(k)}><input value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>)}</div>
      </Modal>}
      {ledger && <Modal wide title={`Ledger: ${ledger.vendor.name}`} onClose={() => setLedger(null)}><DataTable rows={ledger.rows} rowKey={(r: any) => r.number + r.account} columns={[{ key: 'entry_date', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'narration', label: 'Narration' }, { key: 'account', label: 'Account' }, { key: 'debit_paise', label: 'Debit', num: true }, { key: 'credit_paise', label: 'Credit', num: true }]} /></Modal>}
    </div>
  );
}

function Ageing() {
  const a = useAsync<any[]>(() => api.get('/api/finance/vendor-ageing'), []);
  return <div className="card flush"><DataTable rows={a.data ?? []} rowKey={(r: any) => r.vendor} empty="Nobody is owed anything." columns={[{ key: 'vendor', label: 'Owed to' }, { key: 'bills', label: 'Bills', num: true }, { key: 'd0_30', label: '0–30 days', num: true, render: (r: any) => inr(r.d0_30) }, { key: 'd31_60', label: '31–60', num: true, render: (r: any) => inr(r.d31_60) }, { key: 'd61_90', label: '61–90', num: true, render: (r: any) => inr(r.d61_90) }, { key: 'd90_plus', label: '90+', num: true, render: (r: any) => inr(r.d90_plus) }, { key: 'total', label: 'Total', num: true }]} /></div>;
}

function Cash({ meta }: any) {
  const { eventId, can } = useStaff();
  const pc = useAsync<any>(() => api.get('/api/finance/petty-cash'), []);
  const adv = useAsync<any[]>(() => api.get('/api/finance/advances'), []);
  const ask = usePrompt();
  const toast = useToast();
  if (!pc.data) return <Loading />;
  return (
    <div className="grid g2">
      <div className="card stack">
        <div className="row between"><h3 style={{ margin: 0 }}>Petty cash: {inr(pc.data.ledger.closing)}</h3>{can('expense.pay') && <span className="row">
          <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Top up float from bank', fields: [{ key: 'amount', label: 'Amount ₹', required: true }, { key: 'note', label: 'Note' }] }); if (r) { await api.post('/api/finance/petty-cash/top-up', { amount_paise: toPaise(r.amount), note: r.note }); pc.reload(); } }}>Top up</Btn>
          <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Daily cash count', fields: [{ key: 'counted', label: 'Cash counted ₹', required: true }, { key: 'note', label: 'Note' }] }); if (r) { const x = await api.post<any>('/api/finance/petty-cash/count', { counted_paise: toPaise(r.counted), note: r.note }); toast(x.difference === 0 ? 'Count matches the cash book' : `Difference of ${inr(x.difference)}`, x.difference === 0 ? 'ok' : 'bad'); pc.reload(); } }}>Count</Btn></span>}</div>
        <DataTable rows={pc.data.counts} columns={[{ key: 'count_date', label: 'Date' }, { key: 'counted_paise', label: 'Counted', num: true }, { key: 'book_paise', label: 'Book', num: true }, { key: 'diff', label: 'Difference', num: true, render: (r: any) => <span style={{ color: r.counted_paise !== r.book_paise ? 'var(--bad)' : undefined }}>{inr(r.counted_paise - r.book_paise)}</span> }, { key: 'name', label: 'By' }]} />
      </div>
      <div className="card stack">
        <div className="row between"><h3 style={{ margin: 0 }}>Advances outstanding</h3>{can('expense.pay') && meta && <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Pay an advance', message: 'Settle it later by paying a bill with “Against an earlier advance”.', fields: [{ key: 'party', label: 'To', options: [...meta.vendors.map((v: any) => ({ value: `vendor:${v.id}`, label: v.name })), ...meta.users.map((u: any) => ({ value: `user:${u.id}`, label: `${u.name} (team)` }))] }, { key: 'amount', label: 'Amount ₹', required: true }, { key: 'note', label: 'Purpose', required: true }, { key: 'mode', label: 'From', options: [{ value: 'bank', label: 'Bank' }, { value: 'cash', label: 'Petty cash' }] }] }); if (r) { const [t, id] = r.party.split(':'); await api.post('/api/finance/advances', { party_type: t, party_id: id, amount_paise: toPaise(r.amount), note: r.note, mode: r.mode, event_id: eventId }); adv.reload(); pc.reload(); } }}>Pay advance</Btn>}</div>
        <DataTable rows={adv.data ?? []} rowKey={(r: any) => r.party_id} empty="No advances outstanding." columns={[{ key: 'name', label: 'Party' }, { key: 'party_type', label: 'Type' }, { key: 'balance', label: 'Outstanding', num: true, render: (r: any) => inr(r.balance) }]} />
      </div>
    </div>
  );
}

function Sponsors() {
  const { eventId, can } = useStaff();
  const s = useAsync<any[]>(() => api.get(`/api/finance/events/${eventId}/sponsorships`), [eventId]);
  const ask = usePrompt();
  return (
    <div className="stack">
      {can('sponsorship.record') && <div><Btn onClick={async () => { const r = await ask({ title: 'Record sponsorship received', fields: [{ key: 'sponsor', label: 'Sponsor', required: true }, { key: 'amount', label: 'Amount excl. GST ₹', required: true }, { key: 'gst', label: 'GST charged ₹', value: '0' }, { key: 'received_on', label: 'Received on', type: 'date', value: today() }] }); if (r) { await api.post(`/api/finance/events/${eventId}/sponsorships`, { sponsor: r.sponsor, amount_paise: toPaise(r.amount), gst_paise: toPaise(r.gst), received_on: r.received_on }); s.reload(); } }}>+ Record sponsorship</Btn></div>}
      <div className="card flush"><DataTable rows={s.data ?? []} columns={[{ key: 'received_on', label: 'Received' }, { key: 'sponsor', label: 'Sponsor' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'gst_paise', label: 'GST', num: true }]} /></div>
    </div>
  );
}
