import { useState } from 'react';
import { api, qs } from '../api';
import { inr, dt, label, toPaise, today } from '../format';
import { Alert, Btn, DataTable, ErrorBox, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt, downloadUrl } from '../ui';
import { PageHead, useStaff } from './Shell';

type Tab = 'tb' | 'journal' | 'ledger' | 'books' | 'pl' | 'bs' | 'gst' | 'requests' | 'locks' | 'accounts';

export default function Books() {
  const { eventId, can } = useStaff();
  const [tab, setTab] = useState<Tab>('tb');
  const [from, setFrom] = useState(''); const [to, setTo] = useState(today());
  const [scope, setScope] = useState<'all' | 'event'>('all');
  const f = { from, to, event: scope === 'event' ? eventId : undefined };
  const exp = (kind: string, format: string, extra: Record<string, string> = {}) => downloadUrl(`/api/finance/books/export${qs({ kind, format, ...f, ...extra })}`);
  return (
    <div className="stack">
      <PageHead title="Books" subtitle="Double-entry ledger, trial balance, profit and loss, balance sheet and GST, ready for the auditor.">
        {can('books.post') && <NewJournal />}
        {can('books.export') && <Btn onClick={() => exp('backup', 'json')}>Auditor backup (JSON)</Btn>}
      </PageHead>
      <div className="row">
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Cost centre"><select value={scope} onChange={(e) => setScope(e.target.value as any)}><option value="all">Whole company</option><option value="event">This event only</option></select></Field>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'tb', label: 'Trial balance' }, { key: 'journal', label: 'Journal register' }, { key: 'ledger', label: 'Ledgers' }, { key: 'books', label: 'Day / cash / bank book' }, { key: 'pl', label: 'Profit & loss' }, { key: 'bs', label: 'Balance sheet' }, { key: 'gst', label: 'GST working' }, { key: 'requests', label: 'Journal approvals' }, { key: 'locks', label: 'Period locks' }, { key: 'accounts', label: 'Chart of accounts' }]} />
      {tab === 'tb' && <TrialBalance f={f} exp={exp} />}
      {tab === 'journal' && <Journal f={f} exp={exp} />}
      {tab === 'ledger' && <Ledger f={f} exp={exp} />}
      {tab === 'books' && <DayBooks f={f} />}
      {tab === 'pl' && <PL f={f} exp={exp} />}
      {tab === 'bs' && <BS f={f} exp={exp} />}
      {tab === 'gst' && <Gst f={f} exp={exp} />}
      {tab === 'requests' && <Requests />}
      {tab === 'locks' && <Locks />}
      {tab === 'accounts' && <Accounts />}
    </div>
  );
}

function ExportBar({ kind, exp, formats = ['csv', 'xlsx', 'pdf'] }: any) {
  return <span className="row">{formats.map((x: string) => <button key={x} className="btn sm" onClick={() => exp(kind, x)}>{x === 'tally' ? 'Tally XML' : x.toUpperCase()}</button>)}</span>;
}

function TrialBalance({ f, exp }: any) {
  const tb = useAsync<any>(() => api.get(`/api/finance/books/trial-balance${qs(f)}`), [JSON.stringify(f)]);
  if (tb.error) return <ErrorBox error={tb.error} />;
  if (!tb.data) return <Loading />;
  const rows = tb.data.rows.filter((r: any) => r.balance_debit || r.balance_credit);
  const ok = tb.data.totals.debit === tb.data.totals.credit;
  return (
    <div className="card flush">
      <div className="card-head"><h3>Trial balance</h3>{ok ? <span className="badge good">✓ Balanced</span> : <span className="badge bad">Out of balance</span>}<span className="spacer" /><ExportBar kind="tb" exp={exp} /></div>
      <DataTable rows={rows} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'type', label: 'Type', render: (r: any) => label(r.type) }, { key: 'balance_debit', label: 'Debit', num: true, render: (r: any) => (r.balance_debit ? inr(r.balance_debit) : '') }, { key: 'balance_credit', label: 'Credit', num: true, render: (r: any) => (r.balance_credit ? inr(r.balance_credit) : '') }]}
        foot={<tr><td colSpan={3}>Total</td><td className="num">{inr(tb.data.totals.debit)}</td><td className="num">{inr(tb.data.totals.credit)}</td></tr>} />
    </div>
  );
}

function Journal({ f, exp }: any) {
  const [q, setQ] = useState(''); const [source, setSource] = useState('');
  const j = useAsync<any[]>(() => api.get(`/api/finance/books/journal${qs({ ...f, q, source })}`), [JSON.stringify(f), q, source]);
  const { can } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  return (
    <div className="card flush">
      <div className="card-head">
        <input className="search input-sm" placeholder="Search narration or voucher" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input-sm" style={{ width: 'auto' }} value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option>{['payment', 'refund', 'expense', 'expense_payment', 'commission', 'payout', 'settlement', 'manual', 'opening', 'reversal', 'sponsorship', 'revenue_recognition', 'advance', 'petty_cash'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
        <span className="spacer" /><ExportBar kind="journal" exp={exp} formats={['csv', 'xlsx', 'pdf', 'tally']} />
      </div>
      <Alert tone="info">Posted entries are locked. A correction is a reversing entry plus a corrected entry; both stay in the audit trail.</Alert>
      {!j.data ? <Loading /> : <div className="table-wrap" style={{ maxHeight: 640, overflowY: 'auto' }}><table className="t"><thead><tr><th>Date</th><th>Voucher</th><th>Narration / account</th><th className="num">Debit</th><th className="num">Credit</th><th /></tr></thead><tbody>
        {j.data.map((e) => [
          <tr key={e.id} style={{ background: 'var(--surface-2)' }}><td className="nowrap">{e.entry_date}</td><td className="mono small nowrap">{e.number}</td><td><strong>{e.narration}</strong> <span className="badge">{label(e.source_type)}</span>{e.reversed_by_id && <span className="badge bad">Reversed</span>}{e.reverses_id && <span className="badge warn">Reversal</span>}</td><td /><td /><td>{can('books.reverse') && !e.reversed_by_id && !e.reverses_id && <Btn size="sm" onClick={async () => { const r = await ask({ title: `Reverse ${e.number}`, message: 'Posts an equal and opposite entry dated today. Then post the correct entry.', fields: [{ key: 'reason', label: 'Reason', required: true }], confirm: 'Post reversal', danger: true }); if (r) { try { await api.post(`/api/finance/books/entries/${e.id}/reverse`, r); toast('Reversal posted', 'ok'); j.reload(); } catch (x: any) { toast(x.message, 'bad'); } } }}>Reverse</Btn>}</td></tr>,
          ...e.lines.map((l: any) => <tr key={l.id}><td /><td /><td style={{ paddingLeft: l.credit_paise ? '2.2rem' : '1rem' }}>{l.code} {l.name}{l.memo ? <span className="faint small"> · {l.memo}</span> : ''}</td><td className="num">{l.debit_paise ? inr(l.debit_paise) : ''}</td><td className="num">{l.credit_paise ? inr(l.credit_paise) : ''}</td><td /></tr>),
        ])}
        {!j.data.length && <tr><td colSpan={6}><div className="empty">No entries.</div></td></tr>}
      </tbody></table></div>}
    </div>
  );
}

function Ledger({ f, exp }: any) {
  const accounts = useAsync<any[]>(() => api.get('/api/finance/accounts'), []);
  const [acc, setAcc] = useState('bank');
  const l = useAsync<any>(() => api.get(`/api/finance/books/ledger/${acc}${qs(f)}`), [acc, JSON.stringify(f)]);
  return (
    <div className="card flush">
      <div className="card-head"><select style={{ width: 'auto' }} value={acc} onChange={(e) => setAcc(e.target.value)} aria-label="Account">{(accounts.data ?? []).map((a) => <option key={a.id} value={a.sys ?? a.id}>{a.code} {a.name}</option>)}</select><span className="spacer" />{l.data && <span className="small">Opening {inr(l.data.opening)} · Closing <strong>{inr(l.data.closing)}</strong> (Dr +)</span>}<ExportBar kind="ledger" exp={(k: string, x: string) => exp(k, x, { account: acc })} /></div>
      {!l.data ? <Loading /> : <DataTable rows={l.data.rows} rowKey={(r: any) => r.entry_id + r.debit_paise + r.credit_paise} maxHeight={600} columns={[{ key: 'entry_date', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'narration', label: 'Narration' }, { key: 'debit_paise', label: 'Debit', num: true, render: (r: any) => (r.debit_paise ? inr(r.debit_paise) : '') }, { key: 'credit_paise', label: 'Credit', num: true, render: (r: any) => (r.credit_paise ? inr(r.credit_paise) : '') }, { key: 'balance', label: 'Balance', num: true, render: (r: any) => inr(r.balance) }]} />}
    </div>
  );
}

function DayBooks({ f }: any) {
  const [kind, setKind] = useState<'day' | 'cash' | 'bank'>('day');
  const b = useAsync<any>(() => api.get(`/api/finance/books/book/${kind}${qs(f)}`), [kind, JSON.stringify(f)]);
  return (
    <div className="card flush">
      <div className="card-head"><Tabs value={kind} onChange={setKind} tabs={[{ key: 'day', label: 'Day book' }, { key: 'cash', label: 'Cash book' }, { key: 'bank', label: 'Bank book' }]} /></div>
      {!b.data ? <Loading /> : kind === 'day'
        ? <DataTable rows={b.data.flatMap((e: any) => e.lines.map((l: any) => ({ ...l, entry_date: e.entry_date, number: e.number, narration: e.narration })))} maxHeight={600} columns={[{ key: 'entry_date', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'narration', label: 'Narration' }, { key: 'name', label: 'Account' }, { key: 'debit_paise', label: 'Debit', num: true, render: (r: any) => (r.debit_paise ? inr(r.debit_paise) : '') }, { key: 'credit_paise', label: 'Credit', num: true, render: (r: any) => (r.credit_paise ? inr(r.credit_paise) : '') }]} />
        : <DataTable rows={b.data.rows} rowKey={(r: any) => r.entry_id + r.debit_paise + r.credit_paise} maxHeight={600} columns={[{ key: 'entry_date', label: 'Date' }, { key: 'number', label: 'Voucher' }, { key: 'narration', label: 'Narration' }, { key: 'debit_paise', label: 'Receipts', num: true, render: (r: any) => (r.debit_paise ? inr(r.debit_paise) : '') }, { key: 'credit_paise', label: 'Payments', num: true, render: (r: any) => (r.credit_paise ? inr(r.credit_paise) : '') }, { key: 'balance', label: 'Balance', num: true, render: (r: any) => inr(r.balance) }]} />}
    </div>
  );
}

function PL({ f, exp }: any) {
  const p = useAsync<any>(() => api.get(`/api/finance/books/pl${qs(f)}`), [JSON.stringify(f)]);
  if (!p.data) return <Loading />;
  const d = p.data;
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>Statement of profit and loss (Schedule III)</h3><ExportBar kind="pl" exp={exp} /></div>
      <p className="small muted">Fees received before an event sit in “Advance registration fees” (a liability) until the CFO marks the event held. GST collected is never income. The company’s CA chooses the Schedule III division.</p>
      <table className="t"><tbody>
        <tr><td colSpan={2}><strong>Income</strong></td></tr>
        {d.schedule3.income.map((r: any) => <tr key={r.line}><td>{r.line}</td><td className="num">{inr(r.amount)}</td></tr>)}
        <tr><td><strong>Total income</strong></td><td className="num"><strong>{inr(d.totalIncome)}</strong></td></tr>
        <tr><td colSpan={2}><strong>Expenses</strong></td></tr>
        {d.expenses.filter((r: any) => r.amount).map((r: any) => <tr key={r.code}><td>{r.name}</td><td className="num">{inr(r.amount)}</td></tr>)}
        <tr><td><strong>Total expenses</strong></td><td className="num"><strong>{inr(d.totalExpenses)}</strong></td></tr>
        <tr><td><strong>Surplus / (deficit)</strong></td><td className="num" style={{ color: d.surplus < 0 ? 'var(--bad)' : 'var(--good)' }}><strong>{inr(d.surplus)}</strong></td></tr>
      </tbody></table>
    </div>
  );
}

function BS({ f, exp }: any) {
  const b = useAsync<any>(() => api.get(`/api/finance/books/bs${qs({ asOn: f.to || today(), event: f.event })}`), [JSON.stringify(f)]);
  if (!b.data) return <Loading />;
  const d = b.data;
  const sec = (title: string, rows: any[]) => [<tr key={title}><td colSpan={2}><strong>{title}</strong></td></tr>, ...rows.map((r: any) => <tr key={title + r.code + r.name}><td>{r.name} <span className="faint small">{r.schedule3}</span></td><td className="num">{inr(r.amount)}</td></tr>)];
  const balanced = d.totalAssets === d.totalEquityAndLiabilities;
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>Balance sheet as at {d.asOn}</h3>{balanced ? <span className="badge good">✓ Balances</span> : <span className="badge bad">Difference {inr(d.totalAssets - d.totalEquityAndLiabilities)}</span>}<ExportBar kind="bs" exp={exp} /></div>
      <div className="grid g2">
        <table className="t"><tbody>{sec('Equity', d.equity)}{sec('Liabilities', d.liabilities)}<tr><td><strong>Total</strong></td><td className="num"><strong>{inr(d.totalEquityAndLiabilities)}</strong></td></tr></tbody></table>
        <table className="t"><tbody>{sec('Assets', d.assets)}<tr><td><strong>Total</strong></td><td className="num"><strong>{inr(d.totalAssets)}</strong></td></tr></tbody></table>
      </div>
    </div>
  );
}

function Gst({ f, exp }: any) {
  const g = useAsync<any>(() => api.get(`/api/finance/books/gst${qs(f)}`), [JSON.stringify(f)]);
  if (!g.data) return <Loading />;
  const d = g.data;
  return (
    <div className="stack">
      <div className="grid g4">
        <div className="tile"><div className="label">Taxable value (net of credit notes)</div><div className="value">{inr(d.output.taxable)}</div></div>
        <div className="tile"><div className="label">Output tax</div><div className="value">{inr(d.outputTax)}</div><div className="sub">CGST {inr(d.output.cgst)} · SGST {inr(d.output.sgst)} · IGST {inr(d.output.igst)}</div></div>
        <div className="tile"><div className="label">Input credit</div><div className="value">{inr(d.inputCredit)}</div><div className="sub">{inr(d.gatewayItc)} on gateway fees</div></div>
        <div className="tile"><div className="label">Net payable (working)</div><div className="value">{inr(d.netPayable)}</div><div className="sub">for the CA to file</div></div>
      </div>
      <div className="card flush"><div className="card-head"><h3>Output tax by invoice</h3><span className="spacer" /><ExportBar kind="gst" exp={exp} formats={['csv', 'xlsx']} /></div>
        <DataTable rows={d.invoices} maxHeight={420} columns={[{ key: 'number', label: 'Invoice', render: (i: any) => <a href={`/api/finance/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">{i.number}</a> }, { key: 'kind', label: 'Type', render: (i: any) => label(i.kind) }, { key: 'issued_at', label: 'Date', render: (i: any) => dt(i.issued_at) }, { key: 'full_name', label: 'Customer' }, { key: 'taxable_paise', label: 'Taxable', num: true }, { key: 'cgst_paise', label: 'CGST', num: true }, { key: 'sgst_paise', label: 'SGST', num: true }, { key: 'igst_paise', label: 'IGST', num: true }, { key: 'total_paise', label: 'Total', num: true }]} /></div>
      <div className="card flush"><div className="card-head"><h3>Input credit by expense</h3></div>
        <DataTable rows={d.expenses} rowKey={(e: any) => e.ref} columns={[{ key: 'ref', label: 'Ref' }, { key: 'bill_date', label: 'Date' }, { key: 'vendor', label: 'Vendor' }, { key: 'gstin', label: 'GSTIN' }, { key: 'invoice_no', label: 'Invoice' }, { key: 'amount_paise', label: 'Taxable', num: true }, { key: 'gst_paise', label: 'GST', num: true }, { key: 'itc_eligible', label: 'Credit', render: (e: any) => (e.itc_eligible ? 'Yes' : 'Blocked') }]} /></div>
    </div>
  );
}

function NewJournal() {
  const [open, setOpen] = useState(false);
  const { eventId } = useStaff();
  const accounts = useAsync<any[]>(() => (open ? api.get('/api/finance/accounts') : Promise.resolve([])), [open]);
  const [lines, setLines] = useState([{ account_id: '', debit: '', credit: '' }, { account_id: '', debit: '', credit: '' }]);
  const [narration, setNarration] = useState(''); const [date, setDate] = useState(today()); const [kind, setKind] = useState('manual'); const [cc, setCc] = useState(true);
  const toast = useToast();
  const dr = lines.reduce((s, l) => s + (toPaise(l.debit || '0') || 0), 0); const cr = lines.reduce((s, l) => s + (toPaise(l.credit || '0') || 0), 0);
  return (<>
    <button className="btn" onClick={() => setOpen(true)}>+ Journal entry</button>
    {open && <Modal wide title="Journal entry" onClose={() => setOpen(false)} footer={<><span className={`small ${dr === cr && dr > 0 ? '' : 'muted'}`}>Debit {inr(dr)} · Credit {inr(cr)} {dr === cr && dr > 0 ? '✓' : '(must match)'}</span><span className="spacer" /><button className="btn" onClick={() => setOpen(false)}>Cancel</button><Btn kind="primary" disabled={dr !== cr || dr === 0} onClick={async () => {
      try { const r = await api.post<any>('/api/finance/books/journal', { kind, date, narration, eventId: cc ? eventId : null, lines: lines.filter((l) => l.account_id).map((l) => ({ account_id: l.account_id, debit_paise: toPaise(l.debit || '0'), credit_paise: toPaise(l.credit || '0') })) }); toast(r.status === 'posted' ? `Posted ${r.entry.number}` : `Sent for ${r.needs}`, 'ok'); setOpen(false); } catch (e: any) { toast(e.message, 'bad'); }
    }}>Submit</Btn></>}>
      <div className="stack">
        <Alert tone="info">Within your limit an Accountant’s entry posts immediately; above it the CFO approves. Opening balances need both CFO and Accountant sign-off and are then locked.</Alert>
        <div className="grid g4">
          <Field label="Type"><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="manual">Journal</option><option value="opening">Opening balances</option></select></Field>
          <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Narration"><input value={narration} onChange={(e) => setNarration(e.target.value)} /></Field>
          <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={cc} onChange={(e) => setCc(e.target.checked)} />Book to this event’s cost centre</label>
        </div>
        <table className="t"><thead><tr><th>Account</th><th>Debit ₹</th><th>Credit ₹</th><th /></tr></thead><tbody>
          {lines.map((l, i) => <tr key={i}><td><select className="input-sm" value={l.account_id} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, account_id: e.target.value } : x)))}><option value="">Choose…</option>{(accounts.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
            <td><input className="input-sm" inputMode="decimal" value={l.debit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, debit: e.target.value, credit: '' } : x)))} /></td>
            <td><input className="input-sm" inputMode="decimal" value={l.credit} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, credit: e.target.value, debit: '' } : x)))} /></td>
            <td><button className="btn sm ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td></tr>)}
        </tbody></table>
        <div><button className="btn sm" onClick={() => setLines([...lines, { account_id: '', debit: '', credit: '' }])}>+ Line</button></div>
      </div>
    </Modal>}
  </>);
}

function Requests() {
  const r = useAsync<any[]>(() => api.get('/api/finance/books/journal-requests'), []);
  const { can, me } = useStaff();
  const toast = useToast();
  const ask = usePrompt();
  return <div className="card flush"><DataTable rows={r.data ?? []} empty="No journal requests." columns={[
    { key: 'created_at', label: 'Raised' }, { key: 'kind', label: 'Type', render: (x: any) => label(x.kind) }, { key: 'narration', label: 'Narration' }, { key: 'total_paise', label: 'Amount', num: true }, { key: 'requested_by_name', label: 'By' },
    { key: 'approvals', label: 'Sign-offs', render: (x: any) => x.approvals.map((a: any) => label(a.role)).join(', ') || '—' }, { key: 'status', label: 'Status' },
    { key: 'act', label: '', sort: false, render: (x: any) => x.status === 'pending' && (can('books.approve') || (x.kind === 'opening' && can('books.post'))) && x.requested_by !== me.user!.id && <span className="row">
      <Btn size="sm" kind="good" onClick={async () => { try { const res = await api.post<any>(`/api/finance/books/journal-requests/${x.id}/approve`); toast(res.status === 'posted' ? `Posted ${res.entry.number}` : 'Signed off; waiting for the other approver', 'ok'); r.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Approve</Btn>
      {can('books.approve') && <Btn size="sm" kind="danger" onClick={async () => { const y = await ask({ title: 'Reject journal', fields: [{ key: 'reason', label: 'Reason', required: true }] }); if (y) { await api.post(`/api/finance/books/journal-requests/${x.id}/reject`, y); r.reload(); } }}>Reject</Btn>}
    </span> },
  ]} /></div>;
}

function Locks() {
  const l = useAsync<any[]>(() => api.get('/api/finance/books/locks'), []);
  const { can } = useStaff();
  const ask = usePrompt();
  const toast = useToast();
  return (
    <div className="stack">
      <Alert tone="info">Locked months refuse new postings. Reopening needs a reason and is written to the audit trail. The audit trail itself cannot be switched off by any role.</Alert>
      {can('books.lock') && <div className="row">
        <Btn onClick={async () => { const r = await ask({ title: 'Lock a month', fields: [{ key: 'period', label: 'Month (YYYY-MM)', value: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7), required: true }] }); if (r) { try { await api.post('/api/finance/books/locks', r); l.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Lock month</Btn>
        <Btn onClick={async () => { const r = await ask({ title: 'Year-end lock', fields: [{ key: 'fy', label: 'Financial year (e.g. 2025-26)', required: true }] }); if (r) { await api.post('/api/finance/books/locks', r); l.reload(); } }}>Lock financial year</Btn>
      </div>}
      <div className="card flush"><DataTable rows={l.data ?? []} rowKey={(r: any) => r.period} empty="No periods locked." columns={[{ key: 'period', label: 'Period' }, { key: 'name', label: 'Locked by' }, { key: 'locked_at', label: 'When' }, { key: 'act', label: '', sort: false, render: (r: any) => can('books.lock') && <Btn size="sm" onClick={async () => { const x = await ask({ title: `Reopen ${r.period}`, fields: [{ key: 'reason', label: 'Reason (logged)', required: true }], danger: true, confirm: 'Reopen' }); if (x) { await api.post(`/api/finance/books/locks/${r.period}/reopen`, x); l.reload(); } }}>Reopen</Btn> }]} /></div>
    </div>
  );
}

function Accounts() {
  const a = useAsync<any[]>(() => api.get('/api/finance/accounts'), []);
  const { can } = useStaff();
  const ask = usePrompt();
  return (
    <div className="stack">
      {can('books.approve') && <div><Btn onClick={async () => { const r = await ask({ title: 'Add account', fields: [{ key: 'code', label: 'Code (4 digits)', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'type', label: 'Type', options: ['asset', 'liability', 'equity', 'income', 'expense'].map((t) => ({ value: t, label: label(t) })) }, { key: 'schedule3', label: 'Schedule III line' }] }); if (r) { await api.post('/api/finance/accounts', r); a.reload(); } }}>+ Account</Btn></div>}
      <div className="card flush"><DataTable rows={a.data ?? []} columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type', render: (x: any) => label(x.type) }, { key: 'schedule3', label: 'Schedule III line' }, { key: 'sys', label: 'Used by', render: (x: any) => (x.sys ? <span className="badge">automatic postings</span> : '') }]} /></div>
    </div>
  );
}

export { Status };
