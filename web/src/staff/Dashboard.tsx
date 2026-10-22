import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { inr, date, label } from '../format';
import { Alert, BarChart, BudgetBars, Btn, DataTable, ErrorBox, Field, LineChart, Loading, Tile, useAsync } from '../ui';
import { PageHead, useStaff } from './Shell';
import { Sparkles, RefreshCw, Users, BadgeIndianRupee, Hourglass, TrendingUp, Wallet, Landmark, Handshake, Gift } from 'lucide-react';

export default function Dashboard() {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/finance/events/${eventId}/dashboard`), [eventId]);
  const budgets = useAsync<any[]>(() => api.get(`/api/finance/events/${eventId}/budgets`).catch(() => []), [eventId]);
  const [showTable, setShowTable] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: string } | null>(null);
  const ai = useAsync<{ enabled: boolean }>(() => api.get('/api/admin/ai/status'), []);
  if (!eventId) return <div className="card">Create an event in Settings first.</div>;
  if (d.loading && !d.data) return <Loading what="dashboard" />;
  if (d.error) return <ErrorBox error={d.error} retry={d.reload} />;
  const x = d.data;
  const be = x.breakEven;
  const ahead = be.resultAtCurrentPaise >= 0;
  return (
    <div className="stack">
      <PageHead title={x.event.name} subtitle="Are we ahead of break-even today, and what would change that? Money collected, money earned and cash in the bank are shown separately.">
        {ai.data?.enabled && <Btn icon={Sparkles} onClick={async () => { setNote({ text: '' }); try { setNote(await api.post(`/api/finance/events/${eventId}/ai/summary`)); } catch (e: any) { setNote({ text: '', error: e.message }); } }}>Write a status note</Btn>}
        <Btn icon={RefreshCw} onClick={d.reload}>Refresh</Btn>
      </PageHead>
      {note && <div className="card stack tight"><div className="row between"><h3 style={{ margin: 0 }}><Sparkles className="icon" style={{ color: 'var(--accent)', verticalAlign: -2 }} /> Status note</h3><div className="row">{note.text && <button className="btn sm" onClick={() => navigator.clipboard?.writeText(note.text)}>Copy</button>}<button className="btn sm ghost" onClick={() => setNote(null)}>Close</button></div></div>
        {note.error ? <Alert tone="bad">{note.error}</Alert> : note.text ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{note.text}</p> : <Loading rows={3} />}
        {note.text && <span className="small faint">Drafted by Claude from the figures on this page. Check before sharing.</span>}</div>}

      <div className="card" id="breakeven" style={{ borderLeft: `4px solid ${ahead ? 'var(--status-good)' : 'var(--status-critical)'}` }}>
        <div className="row" style={{ alignItems: 'flex-start', gap: '1.5rem' }}>
          <div style={{ minWidth: 220 }}>
            <div className="muted small" style={{ fontWeight: 600 }}>{ahead ? '✓ Ahead of break-even' : '! Behind break-even'}</div>
            <div style={{ fontSize: '2.2rem', fontWeight: 750, letterSpacing: '-0.02em', color: ahead ? 'var(--good)' : 'var(--bad)' }}>{inr(be.resultAtCurrentPaise)}</div>
            <div className="muted small">result today on {x.registrations.confirmed} paid registrations (contribution less fixed costs, after sponsorship)</div>
          </div>
          <dl className="kv small" style={{ margin: 0 }}>
            <dt>Break-even</dt><dd>{be.breakEvenCount ?? '—'} paid registrations{be.exact ? <span className="faint"> ({be.exact.toFixed(1)} rounded up)</span> : null}</dd>
            <dt>Still needed</dt><dd>{be.gap ?? '—'}{be.date ? <> · {be.date === 'reached' ? 'reached' : `about ${date(be.date)} at the current pace`}</> : be.gap ? ' · no recent sales to project from' : ''}</dd>
            <dt>Contribution</dt><dd>{inr(be.contributionPaise)} per delegate (net fee − {inr(be.variablePerDelegatePaise)} variable cost − gateway fee − commission)</dd>
            <dt>Fixed costs</dt><dd>{inr(be.fixedPaise)}{be.sponsorshipPaise ? ` − ${inr(be.sponsorshipPaise)} sponsorship` : ''}</dd>
            {be.budgetBased && <><dt>On full budget</dt><dd>{be.budgetBased.breakEvenCount} registrations if every budgeted cost ({inr(be.budgetBased.fixedPaise)}) is spent</dd></>}
          </dl>
        </div>
      </div>

      {x.alerts.length > 0 && <div className="stack">{x.alerts.map((a: any, i: number) => <Alert key={i} tone={a.level === 'danger' ? 'bad' : 'warn'}><strong>{a.title}.</strong> {a.detail} {a.link && <Link to={a.link}>Open →</Link>}</Alert>)}</div>}

      <div className="grid g4">
        <Tile icon={Users} label="Registrations" value={x.registrations.total} sub={`${x.registrations.confirmed} confirmed · ${x.registrations.provisional} provisional · ${x.registrations.waitlisted} waitlisted · ${x.registrations.cancelled} cancelled`} />
        <Tile icon={BadgeIndianRupee} label="Verified collections (excl. GST)" value={inr(x.collections.verifiedNetPaise)} sub={`${inr(x.collections.verifiedGrossPaise)} incl. GST · GST is never income`} />
        <Tile icon={Hourglass} label="Pending money" value={inr(x.pending.holds.amount + x.pending.review.amount)} sub={<>{x.pending.holds.n} unpaid holds · <Link to="/app/payments/review">{x.pending.review.n} proofs</Link>{x.pending.review.oldestHours != null ? `, oldest ${x.pending.review.oldestHours} h` : ''}</>} />
        <Tile icon={TrendingUp} label="Operating surplus / deficit" value={inr(x.surplus)} tone={x.surplus >= 0 ? 'pos' : 'neg'} sub="fees earned − expenses − gateway fees − commission" />
        <Tile icon={Wallet} label="Expenses incurred" value={inr(x.expenses.incurred)} sub={`${inr(x.expenses.budgeted)} budgeted · ${inr(x.expenses.committed)} awaiting approval · ${inr(x.expenses.paid)} paid · ${inr(x.expenses.unpaid)} unpaid`} />
        <Tile icon={Landmark} label="Cash at bank" value={inr(x.cash.bank + x.cash.pettyCash)} sub={`${inr(x.cash.gatewayUnsettled)} still with gateways (not yet settled)`} />
        <Tile icon={Handshake} label="Commission" value={inr(x.commission.earned)} sub={`${inr(x.commission.held)} in refund window · ${inr(x.commission.approved)} approved · ${inr(x.commission.paid)} paid · ${inr(x.commission.tdsWithheld)} TDS`} />
        <Tile icon={Gift} label="Sponsorship (shown separately)" value={inr(x.sponsorship)} sub="registrations stand on their own above" />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Cumulative contribution vs fixed costs</h3><button className="btn sm ghost" onClick={() => setShowTable(!showTable)}>{showTable ? 'Chart' : 'Table'}</button></div>
          <p className="small muted">Break-even is where the solid line crosses the dashed one.</p>
          {showTable ? <DataTable rows={x.charts.contributionSeries} rowKey={(r: any) => r.day} columns={[{ key: 'day', label: 'Day' }, { key: 'paid', label: 'Paid (cumulative)', num: true }, { key: 'contribution', label: 'Contribution', num: true, render: (r: any) => inr(r.contribution) }, { key: 'fixed', label: 'Fixed costs', num: true, render: (r: any) => inr(r.fixed) }]} />
            : <LineChart ariaLabel="Cumulative contribution against fixed costs by day" series={[
              { name: 'Cumulative contribution', color: 'var(--series-1)', points: x.charts.contributionSeries.map((p: any) => ({ x: p.day, y: p.contribution })) },
              { name: 'Fixed costs less sponsorship', color: 'var(--series-2)', dashed: true, points: x.charts.contributionSeries.map((p: any) => ({ x: p.day, y: p.fixed })) },
            ]} />}
        </div>
        <div className="card">
          <h3>Registrations per day</h3>
          <p className="small muted">Velocity {x.forecast.velocityPerDay}/day over the last 14 days · forecast {x.forecast.conservative} / <strong>{x.forecast.base}</strong> / {x.forecast.optimistic} paid by the event ({x.forecast.daysLeft} days left)</p>
          <BarChart ariaLabel="Registrations per day" data={x.charts.daily.map((r: any) => ({ x: r.day, y: r.registered, note: `${r.paid} paid` }))} />
        </div>
      </div>

      <Scenario eventId={eventId} base={x} />

      <div className="grid g2">
        <div className="card flush"><div className="card-head"><h3>Contribution by committee</h3></div>
          <DataTable rows={x.byCommittee} rowKey={(r: any) => r.short} columns={[{ key: 'short', label: 'Committee' }, { key: 'delegates', label: 'Paid', num: true }, { key: 'revenue', label: 'Net fees', num: true }, { key: 'commission', label: 'Commission', num: true }, { key: 'contribution', label: 'Contribution', num: true, render: (r: any) => <span style={{ color: r.contribution < 0 ? 'var(--bad)' : undefined }}>{inr(r.contribution)}</span> }]} /></div>
        <div className="card flush"><div className="card-head"><h3>Which source pays after commission</h3></div>
          <DataTable rows={x.byReferrer} rowKey={(r: any) => r.referrer} columns={[{ key: 'referrer', label: 'Source' }, { key: 'delegates', label: 'Paid', num: true }, { key: 'revenue', label: 'Net fees', num: true }, { key: 'commission', label: 'Commission', num: true }, { key: 'net', label: 'Contribution', num: true, render: (r: any) => inr(r.net) }]} /></div>
      </div>

      <div className="grid g2">
        <div className="card"><h3>Budget against actual</h3><BudgetBars rows={(budgets.data ?? []).map((b: any) => ({ category: b.category, budget: b.budget, used: b.committed + b.incurred }))} /><p className="small faint" style={{ marginTop: '.5rem' }}>Bars turn amber at 80% and red when over budget.</p></div>
        <div className="card flush"><div className="card-head"><h3>Collections by payment method</h3></div>
          <DataTable rows={x.collections.byMethod} rowKey={(r: any) => r.gateway} columns={[{ key: 'gateway', label: 'Method', render: (r: any) => label(r.gateway === 'mock' ? 'sandbox' : r.gateway) }, { key: 'n', label: 'Payments', num: true }, { key: 'amount', label: 'Amount (incl. GST)', num: true }]} /></div>
      </div>
    </div>
  );
}

function Scenario({ eventId, base }: { eventId: string; base: any }) {
  const [p, setP] = useState({ priceChangePct: '0', discountPct: '0', extraFixed: '0', variableChange: '0', registrations: '' });
  const [out, setOut] = useState<any>(null);
  const run = async () => setOut(await api.post(`/api/finance/events/${eventId}/scenario`, {
    priceChangePct: Number(p.priceChangePct) || 0, discountPct: Number(p.discountPct) || 0, extraFixedPaise: Math.round((Number(p.extraFixed) || 0) * 100),
    variableChangePaise: Math.round((Number(p.variableChange) || 0) * 100), registrations: p.registrations ? Number(p.registrations) : undefined,
  }));
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>What if…</h3>
      <p className="small muted" style={{ margin: 0 }}>Try a fee change, a discount, an added committee or venue change (extra fixed cost), or a prize pool increase.</p>
      <div className="grid g4">
        <Field label="Fee change %"><input inputMode="decimal" value={p.priceChangePct} onChange={(e) => setP({ ...p, priceChangePct: e.target.value })} /></Field>
        <Field label="Extra discount %"><input inputMode="decimal" value={p.discountPct} onChange={(e) => setP({ ...p, discountPct: e.target.value })} /></Field>
        <Field label="Extra fixed cost ₹"><input inputMode="decimal" value={p.extraFixed} onChange={(e) => setP({ ...p, extraFixed: e.target.value })} /></Field>
        <Field label="Variable cost change ₹/delegate"><input inputMode="decimal" value={p.variableChange} onChange={(e) => setP({ ...p, variableChange: e.target.value })} /></Field>
      </div>
      <div className="row"><Field label="…at registrations"><input inputMode="numeric" placeholder={String(base.forecast.base)} value={p.registrations} onChange={(e) => setP({ ...p, registrations: e.target.value })} style={{ maxWidth: 160 }} /></Field><span className="spacer" /><Btn kind="primary" onClick={run}>Run scenario</Btn></div>
      {out && (
        <div className="table-wrap"><table className="t"><thead><tr><th>Case</th><th className="num">Paid registrations</th><th className="num">Result</th></tr></thead><tbody>
          {Object.entries(out.outcomes).map(([k, o]: any) => <tr key={k}><td>{label(k)}</td><td className="num">{o.registrations}</td><td className="num" style={{ color: o.resultPaise < 0 ? 'var(--bad)' : 'var(--good)' }}>{inr(o.resultPaise)}</td></tr>)}
          <tr><td>Break-even</td><td className="num">{out.breakEvenCount ?? '—'}</td><td className="num faint">{inr(out.contributionPaise)} contribution each</td></tr>
        </tbody></table></div>
      )}
    </div>
  );
}
