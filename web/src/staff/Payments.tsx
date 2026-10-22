import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { inr, dt, label, toPaise } from '../format';
import { Alert, Btn, DataTable, ErrorBox, Loading, Status, Tabs, useAsync, useToast, usePrompt } from '../ui';
import { PageHead, useStaff } from './Shell';

export function ProofReview() {
  const { eventId, can } = useStaff();
  const [status, setStatus] = useState<'submitted' | 'approved' | 'rejected' | 'resubmit' | 'all'>('submitted');
  const q = useAsync<any[]>(() => api.get(`/api/finance/events/${eventId}/evidence?status=${status}`), [eventId, status]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toast = useToast();
  const ask = usePrompt();
  const approver = can('payments.approve');
  const ai = useAsync<{ enabled: boolean }>(() => api.get('/api/admin/ai/status'), []);
  const matched = (q.data ?? []).filter((e) => e.bank_line_id && e.status === 'submitted');
  return (
    <div className="stack">
      <PageHead title="Payment proofs" subtitle="UPI and bank transfer screenshots waiting for a decision. Text is read from each screenshot and compared with what the delegate typed.">
        <Btn onClick={async () => { const r = await api.post<any>('/api/finance/evidence/rematch'); toast(`${r.matched} newly bank-matched`, 'ok'); q.reload(); }}>Re-match with bank</Btn>
        {can('finance.import') && <Link className="btn" to="/app/imports?kind=bank">Import bank statement</Link>}
      </PageHead>
      <Alert tone="info">A screenshot is never proof on its own. Match the UTR and amount against the bank statement before approving. Importing the bank CSV marks matching rows <strong>bank-matched</strong> for one-click approval.</Alert>
      <Tabs value={status} onChange={(s) => { setStatus(s); setSel(new Set()); }} tabs={[{ key: 'submitted', label: `Awaiting review${status === 'submitted' && q.data ? ` (${q.data.length})` : ''}` }, { key: 'approved', label: 'Approved' }, { key: 'resubmit', label: 'Asked to resubmit' }, { key: 'rejected', label: 'Rejected' }, { key: 'all', label: 'All' }]} />
      {approver && status === 'submitted' && matched.length > 0 && (
        <div className="row"><span className="muted">{matched.length} bank-matched</span>
          <Btn kind="good" onClick={async () => { const ids = sel.size ? [...sel] : matched.map((m) => m.id); const r = await api.post<any>('/api/finance/evidence/bulk-approve', { ids }); toast(`${r.approved} approved${r.skipped.length ? `, ${r.skipped.length} skipped (${r.skipped[0].reason})` : ''}`, r.skipped.length ? 'bad' : 'ok'); setSel(new Set()); q.reload(); }}>Approve {sel.size ? `${sel.size} ticked` : 'all bank-matched'}</Btn>
        </div>
      )}
      {q.error ? <ErrorBox error={q.error} /> : !q.data ? <Loading /> : q.data.length === 0 ? <div className="card empty">Nothing to review.</div> : q.data.map((e) => {
        const gap = e.amount_paise - e.expected_paise;
        return (
          <div key={e.id} className="card">
            <div className="row" style={{ alignItems: 'flex-start', gap: '1.25rem' }}>
              <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
                {e.mime === 'application/pdf' ? <a className="btn" href={e.url} target="_blank" rel="noreferrer">Open PDF proof</a> : <a href={e.url} target="_blank" rel="noreferrer"><img className="proof-img" src={e.url} alt={`Payment screenshot from ${e.full_name}`} /></a>}
              </div>
              <div className="stack" style={{ flex: '2 1 320px', minWidth: 0 }}>
                <div className="row">{approver && e.status === 'submitted' && e.bank_line_id && <input type="checkbox" aria-label="Tick for bulk approval" checked={sel.has(e.id)} onChange={() => { const s = new Set(sel); s.has(e.id) ? s.delete(e.id) : s.add(e.id); setSel(s); }} />}
                  <h3 style={{ margin: 0 }}><Link to={`/app/registrations/${e.registration_id}`}>{e.full_name}</Link> <span className="muted small">{e.ref}</span></h3><span className="spacer" /><Status value={e.status} />{e.bank_line_id ? <span className="badge good">✓ Bank-matched</span> : <span className="badge">Not in bank file yet</span>}</div>
                <dl className="kv small" style={{ margin: 0 }}>
                  <dt>UTR</dt><dd className="mono">{e.utr}</dd>
                  <dt>Entered</dt><dd>{inr(e.amount_paise)} on {e.paid_on}</dd>
                  <dt>Expected</dt><dd>{inr(e.expected_paise)} {gap !== 0 && e.status === 'submitted' && <span className={`badge ${gap < 0 ? 'warn' : 'bad'}`}>{gap < 0 ? `${inr(-gap)} short` : `${inr(gap)} over`}</span>}</dd>
                  {e.bank_line_id && <><dt>Bank line</dt><dd>{e.bank_date} · {inr(e.bank_amount)} · <span className="small">{e.bank_description}</span></dd></>}
                  <dt>Submitted</dt><dd>{dt(e.submitted_at)} ({e.ageHours} h ago){e.escalated_at ? <span className="badge warn">Escalated</span> : null}</dd>
                  {e.hold_expires_at && <><dt>Hold</dt><dd>{dt(e.hold_expires_at)} (kept while under review)</dd></>}
                  {e.reviewer && <><dt>Reviewer</dt><dd>{e.reviewer} · {dt(e.reviewed_at)}{e.reason ? ` · ${e.reason}` : ''}</dd></>}
                </dl>
                <ProofReadout e={e} aiOn={!!ai.data?.enabled} />
                {e.tamper_flags.length > 0 && <Alert tone="warn"><strong>Check carefully:</strong> {e.tamper_flags.join(' · ')}</Alert>}
                {approver && e.status === 'submitted' && (
                  <div className="row">
                    <Btn kind="good" onClick={async () => { try { await api.post(`/api/finance/evidence/${e.id}/approve`, {}); toast('Approved; receipt, books and emails done', 'ok'); q.reload(); } catch (x: any) { toast(x.message, 'bad'); } }}>Approve {inr(e.amount_paise)}</Btn>
                    {gap !== 0 && <Btn onClick={async () => { const r = await ask({ title: 'Approve a different amount', message: 'Use the amount actually received in the bank. A shortfall stays as a balance due.', fields: [{ key: 'amount', label: 'Amount received ₹', value: String(e.amount_paise / 100) }] }); if (r) { await api.post(`/api/finance/evidence/${e.id}/approve`, { amount_paise: toPaise(r.amount) }); q.reload(); } }}>Approve as part payment…</Btn>}
                    <Btn onClick={async () => { const r = await ask({ title: 'Ask to resubmit', fields: [{ key: 'reason', label: 'What should the delegate fix?', type: 'textarea', required: true, value: 'The screenshot is unclear. Please upload one showing the UTR, amount and date.' }] }); if (r) { await api.post(`/api/finance/evidence/${e.id}/reject`, { ...r, mode: 'resubmit' }); q.reload(); } }}>Ask to resubmit</Btn>
                    <Btn kind="danger" onClick={async () => { const r = await ask({ title: 'Reject payment proof', fields: [{ key: 'reason', label: 'Reason (emailed to the delegate)', type: 'textarea', required: true }], danger: true, confirm: 'Reject' }); if (r) { await api.post(`/api/finance/evidence/${e.id}/reject`, { ...r, mode: 'rejected' }); q.reload(); } }}>Reject</Btn>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Payments() {
  const { eventId, can } = useStaff();
  const [tab, setTab] = useState<'refunds' | 'transactions' | 'orders' | 'settlements' | 'excess' | 'webhooks' | 'bank' | 'gateways'>('refunds');
  const nav = useNavigate();
  const toast = useToast();
  const ask = usePrompt();
  const refunds = useAsync<any[]>(() => (tab === 'refunds' ? api.get(`/api/finance/refunds?event=${eventId}`) : Promise.resolve([])), [tab, eventId]);
  const tx = useAsync<any[]>(() => (tab === 'transactions' ? api.get('/api/finance/payments/transactions') : tab === 'orders' ? api.get('/api/finance/payments/orders') : tab === 'webhooks' ? api.get('/api/finance/payments/webhooks') : tab === 'bank' ? api.get('/api/finance/bank-lines') : Promise.resolve([])), [tab]);
  const settlements = useAsync<any[]>(() => (tab === 'settlements' ? api.get('/api/finance/settlements') : Promise.resolve([])), [tab]);
  const excess = useAsync<any[]>(() => (tab === 'excess' ? api.get(`/api/finance/excess?event=${eventId}`) : Promise.resolve([])), [tab, eventId]);
  const gw = useAsync<any>(() => (tab === 'gateways' ? api.get(`/api/finance/events/${eventId}/gateways`) : Promise.resolve(null)), [tab, eventId]);
  const run = (fn: () => Promise<any>, ok: string, reload: () => void) => async () => { try { const r = await fn(); toast(r?.status === 'awaiting_second_approval' ? 'First approval recorded; a second approver is needed' : r?.error ? `Approved, but the gateway call failed: ${r.error}` : ok, r?.error ? 'bad' : 'ok'); reload(); } catch (e: any) { toast(e.message, 'bad'); } };
  return (
    <div className="stack">
      <PageHead title="Payments & refunds" subtitle="Every payment received and refund issued, with links to the delegate and the journal entry." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'refunds', label: 'Refunds' }, { key: 'transactions', label: 'Transactions' }, { key: 'orders', label: 'Orders' }, { key: 'settlements', label: 'Settlements' }, { key: 'excess', label: 'Excess payments' }, { key: 'bank', label: 'Bank lines' }, { key: 'webhooks', label: 'Webhook log' }, { key: 'gateways', label: 'Gateways' }]} />
      {tab === 'refunds' && <div className="card flush"><DataTable rows={refunds.data ?? []} empty="No refunds." onRowClick={(r) => nav(`/app/registrations/${r.registration_id}`)} columns={[
        { key: 'created_at', label: 'Requested' }, { key: 'ref', label: 'Delegate', render: (r: any) => <>{r.full_name}<div className="small faint">{r.ref}</div></> }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'reason', label: 'Reason' },
        { key: 'method', label: 'Method', render: (r: any) => label(r.method) }, { key: 'requested_by_name', label: 'Requested by', render: (r: any) => r.requested_by_name ?? (r.requested_by === 'delegate' ? 'Delegate' : '—') },
        { key: 'approved_by_name', label: 'Approved by', render: (r: any) => [r.approved_by_name, r.second_by_name].filter(Boolean).join(' + ') || '—' }, { key: 'status', label: 'Status' },
        { key: 'act', label: '', sort: false, render: (r: any) => can('refund.approve') && <span className="row" onClick={(e) => e.stopPropagation()}>
          {r.status === 'requested' && <><Btn size="sm" kind="good" onClick={run(() => api.post(`/api/finance/refunds/${r.id}/approve`), r.method === 'gateway' ? 'Approved and sent to the gateway' : 'Approved', refunds.reload)}>Approve</Btn>
            <Btn size="sm" kind="danger" onClick={async () => { const x = await ask({ title: 'Reject refund', fields: [{ key: 'reason', label: 'Reason', required: true }] }); if (x) await run(() => api.post(`/api/finance/refunds/${r.id}/reject`, x), 'Rejected', refunds.reload)(); }}>Reject</Btn></>}
          {(r.status === 'approved' && r.method === 'manual') && <Btn size="sm" onClick={async () => { const x = await ask({ title: 'Record the bank transfer', fields: [{ key: 'reference', label: 'Bank reference / UTR', required: true }] }); if (x) await run(() => api.post(`/api/finance/refunds/${r.id}/complete`, x), 'Refund booked', refunds.reload)(); }}>Mark paid</Btn>}
          {['approved', 'failed'].includes(r.status) && r.method === 'gateway' && <Btn size="sm" onClick={run(() => api.post(`/api/finance/refunds/${r.id}/manual`), 'Switched to manual', refunds.reload)}>Switch to manual</Btn>}
          {r.note && <span className="small faint" title={r.note}>ⓘ</span>}
        </span> },
      ]} /></div>}
      {(tab === 'transactions' || tab === 'orders' || tab === 'webhooks' || tab === 'bank') && (tx.error ? <ErrorBox error={tx.error} /> : <div className="card flush"><DataTable rows={tx.data ?? []} maxHeight={640} columns={
        tab === 'transactions' ? [{ key: 'created_at', label: 'When' }, { key: 'refs', label: 'Registration(s)' }, { key: 'gateway', label: 'Via', render: (r: any) => label(r.gateway === 'mock' ? 'sandbox' : r.gateway) }, { key: 'gateway_payment_id', label: 'Payment ID' }, { key: 'method', label: 'Method' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'fee_paise', label: 'Fee', num: true }, { key: 'status', label: 'Status' }, { key: 'verified_by', label: 'Verified by' }, { key: 'settlement_id', label: 'Settled', render: (r: any) => (r.settlement_id ? '✓' : '') }]
        : tab === 'orders' ? [{ key: 'created_at', label: 'Created' }, { key: 'refs', label: 'Registration(s)' }, { key: 'gateway', label: 'Gateway' }, { key: 'gateway_order_id', label: 'Gateway order' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'status', label: 'Status' }, { key: 'act', label: '', sort: false, render: (r: any) => r.status === 'processing' && <Btn size="sm" onClick={run(() => api.post(`/api/finance/orders/${r.id}/resolve`), 'Checked with gateway', tx.reload)}>Check now</Btn> }]
        : tab === 'bank' ? [{ key: 'txn_date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'utr', label: 'UTR' }, { key: 'amount_paise', label: 'Amount', num: true }, { key: 'direction', label: 'Cr/Dr' }, { key: 'ref', label: 'Matched to', render: (r: any) => r.ref ?? (r.matched_settlement_id ? 'Settlement' : '') }]
        : [{ key: 'received_at', label: 'Received' }, { key: 'gateway', label: 'Gateway' }, { key: 'type', label: 'Event' }, { key: 'event_id', label: 'Event ID', render: (r: any) => <span className="mono small">{r.event_id.slice(0, 24)}</span> }, { key: 'signature_valid', label: 'Signature', render: (r: any) => (r.signature_valid ? <span className="badge good">Valid</span> : <span className="badge bad">Invalid</span>) }, { key: 'result', label: 'Result' }]
      } /></div>)}
      {tab === 'settlements' && <>
        <div className="row"><span className="muted">Import the gateway's settlement report; each settlement lands as a draft with its checks, then you post it.</span><span className="spacer" />{can('finance.import') && <Link className="btn" to="/app/imports?kind=settlement">Import settlement report</Link>}</div>
        <div className="card flush"><DataTable rows={settlements.data ?? []} columns={[{ key: 'settled_on', label: 'Settled' }, { key: 'gateway', label: 'Gateway' }, { key: 'settlement_ref', label: 'Settlement' }, { key: 'gross_paise', label: 'Gross', num: true }, { key: 'fee_paise', label: 'Fee', num: true }, { key: 'tax_paise', label: 'GST on fee', num: true }, { key: 'net_paise', label: 'Net to bank', num: true }, { key: 'mismatch', label: 'Checks', render: (s: any) => s.mismatch ? <span className="badge bad" title={s.mismatch}>Mismatch</span> : <span className="badge good">OK</span> }, { key: 'status', label: 'Status' },
          { key: 'act', label: '', sort: false, render: (s: any) => s.status === 'draft' && can('books.post') && <span className="row"><Btn size="sm" kind="primary" onClick={run(() => api.post(`/api/finance/settlements/${s.id}/post`), 'Posted', settlements.reload)}>Post</Btn><Btn size="sm" kind="danger" onClick={run(() => api.del(`/api/finance/settlements/${s.id}`), 'Discarded', settlements.reload)}>Discard</Btn></span> }]} /></div>
        {(settlements.data ?? []).filter((s) => s.mismatch).map((s) => <Alert key={s.id} tone="bad"><strong>{s.settlement_ref}:</strong> {s.mismatch}</Alert>)}
      </>}
      {tab === 'excess' && <div className="card flush"><DataTable rows={excess.data ?? []} rowKey={(r: any) => r.registration_id} empty="No excess payments held." columns={[{ key: 'ref', label: 'Delegate', render: (r: any) => <Link to={`/app/registrations/${r.registration_id}`}>{r.full_name} ({r.ref})</Link> }, { key: 'excess_paise', label: 'Excess held', num: true },
        { key: 'act', label: '', sort: false, render: (r: any) => can('payments.excess') && <span className="row">
          <Btn size="sm" onClick={run(() => api.post(`/api/finance/excess/${r.registration_id}/refund`, { reason: 'Paid twice' }), 'Refund raised (needs approval)', excess.reload)}>Refund it</Btn>
          <Btn size="sm" onClick={async () => { const x = await ask({ title: 'Credit to another registration', fields: [{ key: 'to', label: 'Registration ID (e.g. BGYS27-R-000012)', required: true }] }); if (x) await run(() => api.post(`/api/finance/excess/${r.registration_id}/transfer`, x), 'Credited', excess.reload)(); }}>Credit to another delegate</Btn>
        </span> }]} /></div>}
      {tab === 'gateways' && gw.data && <div className="stack">
        <div className="card flush"><DataTable rows={gw.data.all} rowKey={(r: any) => r.name} columns={[{ key: 'label', label: 'Gateway' }, { key: 'configured', label: 'Keys configured', render: (r: any) => (r.configured ? 'Yes' : 'No — set environment variables') }, { key: 'healthy', label: 'Health', render: (r: any) => (r.healthy ? <span className="badge good">OK</span> : <span className="badge bad">Hidden (failing)</span>) }]} /></div>
        <div className="card small"><strong>Webhook URLs to register with the gateways:</strong><div className="mono">{gw.data.webhookUrls.razorpay}</div><div className="mono">{gw.data.webhookUrls.cashfree}</div><p className="muted" style={{ marginTop: '.5rem' }}>Enable/disable gateways, choose the default and routing in Settings → Event.</p></div>
      </div>}
    </div>
  );
}

/** What the screenshot says (on-device OCR, or Claude when asked), next to what the delegate typed. Suggestions only. */
function ProofReadout({ e, aiOn }: { e: any; aiOn: boolean }) {
  const ocr = (() => { try { return e.extracted ? JSON.parse(e.extracted) : null; } catch { return null; } })();
  const [aiRead, setAiRead] = useState<any>(null);
  const toast = useToast();
  const row = (label: string, read: React.ReactNode, ok: boolean | null) => (
    <tr><td className="faint">{label}</td><td>{read ?? <span className="faint">not readable</span>}</td><td>{ok == null ? null : ok ? <span className="badge good">matches</span> : <span className="badge warn">differs</span>}</td></tr>
  );
  if (!ocr && !aiOn) return null;
  const src = aiRead ?? ocr;
  return (
    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.6rem .8rem' }}>
      <div className="row between"><span className="small" style={{ fontWeight: 600 }}>{aiRead ? 'Read by Claude' : ocr ? 'Read from the screenshot (OCR)' : 'Not read yet'}</span>
        {aiOn && !aiRead && <Btn size="sm" kind="ghost" onClick={async () => { try { setAiRead(await api.post(`/api/finance/evidence/${e.id}/ai-read`)); } catch (x: any) { toast(x.message, 'bad'); } }}>Read with AI</Btn>}</div>
      {src && !aiRead && src.utr == null && src.amountPaise == null && src.date == null ? <div className="small faint" style={{ marginTop: '.25rem' }}>No payment details could be read from this image. Check it by eye against the bank statement.</div>
        : src && <table className="t" style={{ marginTop: '.25rem' }}><tbody>
        {row('UTR', src.utr, src.utr ? String(src.utr).replace(/[^A-Z0-9]/gi, '').toUpperCase() === e.utr : null)}
        {row('Amount', src.amountPaise != null ? inr(src.amountPaise) : null, src.amountPaise != null ? src.amountPaise === e.amount_paise : null)}
        {row('Date', src.date, src.date ? src.date === e.paid_on : null)}
        {aiRead && row('Status', aiRead.status, aiRead.status === 'successful')}
      </tbody></table>}
      {aiRead?.concerns?.length > 0 && <div className="small" style={{ color: 'var(--warn)', marginTop: '.35rem' }}>{aiRead.concerns.join(' · ')}</div>}
    </div>
  );
}
