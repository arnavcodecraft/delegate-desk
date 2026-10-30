import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../api';
import { inr, label, toPaise, toRupees } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Tabs, useAsync, useToast, usePrompt } from '../ui';
import { PageHead, useStaff } from './Shell';
import { Integrations, SheetsSync, Backups, DataProtection } from './SettingsExtra';

export default function Settings() {
  const { can } = useStaff();
  type T = 'event' | 'org' | 'users' | 'integrations' | 'sheets' | 'backups' | 'privacy';
  const asked = new URLSearchParams(window.location.search).get('tab') as T | null;
  const [tab, setTab] = useState<T>(asked === 'users' && can('users.manage') ? 'users' : can('event.config') ? 'event' : can('users.manage') ? 'users' : 'org');
  return (
    <div className="stack">
      <PageHead title="Settings" subtitle="How this conference runs, your organisation, your team, connected services, backups and data protection. Public details live on Conference page; fees and payments on Financials.">{can('event.config') && <Link className="btn" to="/list"><Plus className="icon" />New conference</Link>}</PageHead>
      <Tabs value={tab} onChange={setTab} tabs={[
        ...(can('event.config') ? [{ key: 'event' as const, label: 'Event rules' }] : []),
        ...(can('settings.org', 'settings.finance') ? [{ key: 'org' as const, label: 'Organisation' }] : []),
        ...(can('users.manage') ? [{ key: 'users' as const, label: 'Users & roles' }] : []),
        ...(can('settings.org', 'settings.finance', 'event.config') ? [{ key: 'integrations' as const, label: 'Integrations' }] : []),
        ...(can('lists.share') ? [{ key: 'sheets' as const, label: 'Google Sheets' }] : []),
        ...(can('settings.org', 'audit.read') ? [{ key: 'backups' as const, label: 'Backups' }] : []),
        ...(can('reg.erase') ? [{ key: 'privacy' as const, label: 'Data protection' }] : []),
      ]} />
      {tab === 'integrations' && <Integrations />}
      {tab === 'sheets' && <SheetsSync />}
      {tab === 'backups' && <Backups />}
      {tab === 'privacy' && <DataProtection />}
      {tab === 'event' && <EventRules />}
      {tab === 'org' && <Org />}
      {tab === 'users' && <Users />}
    </div>
  );
}

const ISO = (v: string | null) => (v ? v.slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

function EventRules() {
  const { eventId, can, reloadMe } = useStaff();
  const ev = useAsync<any[]>(() => api.get('/api/admin/events'), [eventId]);
  const gw = useAsync<any>(() => api.get(`/api/finance/events/${eventId}/gateways`).catch(() => null), [eventId]);
  const e = (ev.data ?? []).find((x) => x.id === eventId);
  const [f, setF] = useState<any>(null);
  const toast = useToast();
  const ask = usePrompt();
  useEffect(() => { if (e) setF({ ...e, s: { ...e.settings } }); }, [e?.id, ev.data]); // eslint-disable-line
  if (!f) return <Loading />;
  const s = f.s; const setS = (k: string, v: any) => setF({ ...f, s: { ...s, [k]: v } });
  const save = async () => {
    try {
      const keys = ['holdHours', 'holdGraceHours', 'holdWarningHours', 'maxPerInstitutionPerCommittee', 'allocationLockAt', 'detailsLockAt', 'requireMobileOtp', 'reminderHours', 'escalationHours', 'processingAlertMinutes', 'unverifiedAlertHours', 'commissionHoldDays', 'variableCostPerDelegatePaise', 'dressCode', 'reportingTime', 'tierMinExperience'];
      await api.patch(`/api/admin/events/${eventId}`, { state_code: f.state_code, settings: Object.fromEntries(keys.map((k) => [k, s[k]])) });
      toast('Saved', 'ok'); ev.reload(); reloadMe();
    } catch (x: any) { toast(x.message, 'bad'); }
  };
  const num = (k: string, lbl: string, hint?: string) => <Field label={lbl} hint={hint}><input type="number" value={s[k]} onChange={(x) => setS(k, Number(x.target.value))} /></Field>;
  const money = (k: string, lbl: string, hint?: string) => <Field label={lbl} hint={hint}><input inputMode="decimal" value={toRupees(s[k])} onChange={(x) => setS(k, toPaise(x.target.value) || 0)} /></Field>;
  return (
    <div className="stack">
      <Alert tone="info">Name, dates, venue and the public page are under <Link to="/app/conference">Conference page</Link>; publishing is on the <Link to="/app/overview">Dashboard</Link>; who can apply is under <Link to="/app/applications?tab=settings">Applications</Link>; fees and payments are under <Link to="/app/financials">Financials</Link>.</Alert>
      <div className="card stack"><h3>Seats & allotment</h3>
        <p className="small muted" style={{ margin: 0 }}>Seats are allotted automatically, first come first served: the delegate's chosen portfolio if their experience qualifies, otherwise the best qualifying portfolio in the same committee, then their next committee, then any committee. Experience points = MUNs attended + awards + half of other events.</p>
        <div className="grid g3">
          {(['high', 'standard', 'low'] as const).map((t) => <Field key={t} label={`Experience needed: ${t} tier`} hint={t === 'high' ? 'e.g. P5 and major powers' : t === 'low' ? 'smaller delegations' : undefined}>
            <input type="number" min={0} max={100} value={s.tierMinExperience?.[t] ?? 0} onChange={(x) => setS('tierMinExperience', { ...s.tierMinExperience, [t]: Math.max(0, Math.floor(Number(x.target.value) || 0)) })} /></Field>)}
        </div>
        <div className="grid g3">
          {num('holdHours', 'Time to pay after allotment (hours)', 'unpaid seats are released after this; default 24')}{num('holdGraceHours', 'Extra hold while a proof is reviewed (hours)')}{num('holdWarningHours', '“Last chance” email before expiry (hours)')}
          {num('maxPerInstitutionPerCommittee', 'Max delegates per institution per committee', '0 = no limit')}
          <Field label="Lock allocations from"><input type="datetime-local" value={ISO(s.allocationLockAt)} onChange={(x) => setS('allocationLockAt', fromLocal(x.target.value))} /></Field>
          <Field label="Lock delegate details from" hint="for badge printing"><input type="datetime-local" value={ISO(s.detailsLockAt)} onChange={(x) => setS('detailsLockAt', fromLocal(x.target.value))} /></Field>
        </div>
      </div>
      <div className="card stack"><h3>Registration form</h3>
        <div className="grid g3">
          <Field label="State code" hint="place of supply for GST invoices"><input value={f.state_code ?? ''} onChange={(x) => setF({ ...f, state_code: x.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={!!s.requireMobileOtp} onChange={(x) => setS('requireMobileOtp', x.target.checked)} />Verify mobile numbers with a one-time code on the form</label>
        </div>
      </div>
      <div className="card stack"><h3>Reminders, alerts & planning</h3>
        <div className="grid g3">
          <Field label="Payment reminders after (hours)" hint="comma separated"><input value={s.reminderHours.join(', ')} onChange={(x) => setS('reminderHours', x.target.value.split(',').map((v: string) => Number(v.trim())).filter((n: number) => n > 0))} /></Field>
          {num('escalationHours', 'Escalate unreviewed proofs after (hours)')}{num('processingAlertMinutes', 'Alert if a payment is processing for (minutes)')}
          {num('unverifiedAlertHours', 'Dashboard alert for proofs older than (hours)')}{num('commissionHoldDays', 'Commission held during refund window (days)')}
          {money('variableCostPerDelegatePaise', 'Planned variable cost per delegate ₹', 'used until real variable expenses exist')}
          <Field label="Dress code"><input value={s.dressCode} onChange={(x) => setS('dressCode', x.target.value)} /></Field>
          <Field label="Reporting time"><input value={s.reportingTime} onChange={(x) => setS('reportingTime', x.target.value)} /></Field>
        </div>
      </div>
      <div className="row"><Btn kind="primary" onClick={save}>Save event settings</Btn><span className="spacer" />
        <Btn onClick={async () => { if (await ask({ title: 'Send event reminders?', message: 'Emails dates, venue, dress code and reporting time to every confirmed delegate and the chairs (respecting quiet hours).' })) { const r = await api.post<any>(`/api/admin/events/${eventId}/reminders`); toast(`${r.queued} reminders queued`, 'ok'); } }}>Send event reminders</Btn>
        {can('event.held') && f.status !== 'held' && <Btn onClick={async () => { if (await ask({ title: 'Mark event as held?', message: 'Moves all advance registration fees for this event to income in the books. This cannot be undone except by a reversing journal.', confirm: 'Recognise revenue' })) { const r = await api.post<any>(`/api/admin/events/${eventId}/held`); toast(`${inr(r.recognisedPaise)} recognised as income`, 'ok'); ev.reload(); } }}>Mark event held</Btn>}
        {can('event.cancel') && f.status !== 'cancelled' && <Btn kind="danger" onClick={async () => { const r = await ask({ title: 'Cancel the event?', message: 'Raises a refund request for every paid delegate. Each still needs CFO approval; gateway refunds then go out automatically.', fields: [{ key: 'reason', label: 'Reason', required: true }], danger: true, confirm: 'Cancel event' }); if (r) { const x = await api.post<any>(`/api/admin/events/${eventId}/cancel`, r); toast(`${x.refundsRaised} refund requests raised`, 'ok'); ev.reload(); } }}>Cancel event</Btn>}
      </div>
    </div>
  );
}

export function FeeTiers() {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/fees`), [eventId]);
  const [tier, setTier] = useState<any>(null);
  const ask = usePrompt();
  const toast = useToast();
  if (!d.data) return <Loading />;
  return (
    <div className="stack">
      <Alert tone="info">Fees exclude GST. The active tier is the first open one (by order) whose dates and quota allow it — e.g. Early bird until a date or until its seats run out, then Regular. Existing registrations keep the fee they were quoted.</Alert>
      <div className="card flush"><div className="card-head"><h3>Fee tiers</h3><span className="spacer" /><button className="btn sm" onClick={() => setTier({ category: 'school', name: '', amount: '', sort: 1, active: true })}>+ Tier</button></div>
        <DataTable rows={d.data.tiers} onRowClick={(t) => setTier({ ...t, amount: toRupees(t.amount_paise) })} columns={[{ key: 'category', label: 'Category', render: (t: any) => label(t.category) }, { key: 'name', label: 'Tier' }, { key: 'amount_paise', label: 'Fee', num: true }, { key: 'starts_at', label: 'From', render: (t: any) => t.starts_at?.slice(0, 10) ?? '—' }, { key: 'ends_at', label: 'Until', render: (t: any) => t.ends_at?.slice(0, 10) ?? '—' }, { key: 'quota', label: 'Quota', num: true, render: (t: any) => (t.quota != null ? `${t.used}/${t.quota}` : `${t.used} used`) }, { key: 'sort', label: 'Order', num: true }, { key: 'active', label: 'Active', render: (t: any) => (t.active ? 'Yes' : 'No') }]} /></div>
      <div className="card flush"><div className="card-head"><h3>Coupons & discounts</h3><span className="spacer" /><Btn size="sm" onClick={async () => { const r = await ask({ title: 'New coupon', fields: [{ key: 'code', label: 'Code', required: true }, { key: 'kind', label: 'Type', options: [{ value: 'percent', label: 'Percent off' }, { value: 'flat', label: 'Flat ₹ off' }] }, { key: 'value', label: 'Value (% or ₹)', required: true }, { key: 'purpose', label: 'Purpose', options: [{ value: 'coupon', label: 'Coupon' }, { value: 'referral', label: 'Referral discount' }, { value: 'group', label: 'Group discount' }] }, { key: 'max_uses', label: 'Usage cap' }, { key: 'expires_at', label: 'Expires', type: 'date' }] }); if (r) { try { await api.post(`/api/admin/events/${eventId}/coupons`, { ...r, value: r.kind === 'percent' ? Math.round(Number(r.value) * 100) : toPaise(r.value), max_uses: r.max_uses ? Number(r.max_uses) : null, expires_at: r.expires_at ? new Date(r.expires_at + 'T23:59:59+05:30').toISOString() : null }); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>+ Coupon</Btn></div>
        <DataTable rows={d.data.coupons} columns={[{ key: 'code', label: 'Code' }, { key: 'purpose', label: 'Purpose', render: (c: any) => label(c.purpose) }, { key: 'value', label: 'Discount', render: (c: any) => (c.kind === 'percent' ? `${c.value / 100}%` : inr(c.value)) }, { key: 'used', label: 'Used', num: true, render: (c: any) => `${c.used}${c.max_uses != null ? '/' + c.max_uses : ''}` }, { key: 'expires_at', label: 'Expires', render: (c: any) => c.expires_at?.slice(0, 10) ?? '—' }, { key: 'active', label: '', render: (c: any) => <button className="btn sm" onClick={async () => { await api.post(`/api/admin/events/${eventId}/coupons`, { ...c, active: !c.active }); d.reload(); }}>{c.active ? 'Disable' : 'Enable'}</button> }]} /></div>
      {tier && <Modal title={tier.id ? 'Edit fee tier' : 'New fee tier'} onClose={() => setTier(null)} footer={<Btn kind="primary" onClick={async () => { try { await api.post(`/api/admin/events/${eventId}/fees`, { ...tier, amount_paise: toPaise(tier.amount), starts_at: tier.starts_at || null, ends_at: tier.ends_at || null, quota: tier.quota === '' || tier.quota == null ? null : Number(tier.quota) }); setTier(null); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Save</Btn>}>
        <div className="grid g2">
          <Field label="Category"><select value={tier.category} onChange={(e) => setTier({ ...tier, category: e.target.value })}>{['school', 'college', 'international', 'advisor'].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select></Field>
          <Field label="Tier name"><input value={tier.name} onChange={(e) => setTier({ ...tier, name: e.target.value })} placeholder="Early bird" /></Field>
          <Field label="Fee excl. GST ₹"><input inputMode="decimal" value={tier.amount} onChange={(e) => setTier({ ...tier, amount: e.target.value })} /></Field>
          <Field label="Quota" hint="blank = unlimited"><input type="number" value={tier.quota ?? ''} onChange={(e) => setTier({ ...tier, quota: e.target.value })} /></Field>
          <Field label="Opens"><input type="datetime-local" value={ISO(tier.starts_at)} onChange={(e) => setTier({ ...tier, starts_at: fromLocal(e.target.value) })} /></Field>
          <Field label="Closes"><input type="datetime-local" value={ISO(tier.ends_at)} onChange={(e) => setTier({ ...tier, ends_at: fromLocal(e.target.value) })} /></Field>
          <Field label="Order"><input type="number" value={tier.sort} onChange={(e) => setTier({ ...tier, sort: Number(e.target.value) })} /></Field>
          <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!tier.active} onChange={(e) => setTier({ ...tier, active: e.target.checked })} />Active</label>
        </div>
      </Modal>}
    </div>
  );
}

/** Payment rules and online gateways, shown on Financials. */
export function PaymentRules({ ownGateways }: { ownGateways: boolean }) {
  const { eventId } = useStaff();
  const ev = useAsync<any[]>(() => api.get('/api/admin/events'), [eventId]);
  const gw = useAsync<any>(() => (ownGateways ? api.get(`/api/finance/events/${eventId}/gateways`).catch(() => null) : Promise.resolve(null)), [eventId]);
  const e = (ev.data ?? []).find((x) => x.id === eventId);
  const [s, setSt] = useState<any>(null);
  const toast = useToast();
  useEffect(() => { if (e) setSt({ ...e.settings }); }, [e?.id, ev.data]); // eslint-disable-line
  if (!s) return <Loading />;
  const setS = (k: string, v: any) => setSt({ ...s, [k]: v });
  const num = (k: string, lbl: string, hint?: string) => <Field label={lbl} hint={hint}><input type="number" value={s[k]} onChange={(x) => setS(k, Number(x.target.value))} /></Field>;
  const money = (k: string, lbl: string, hint?: string) => <Field label={lbl} hint={hint}><input inputMode="decimal" value={toRupees(s[k])} onChange={(x) => setS(k, toPaise(x.target.value) || 0)} /></Field>;
  const keys = ['paymentTiming', 'directHoldMinutes', 'sacCode', 'feeModel', 'applicationFeePaise', 'groupPayment', 'groupDiscount', 'refundWindowDays', 'largeRefundPaise', 'premiumPricing', 'gateways', 'defaultGateway', 'routing'];
  return (
    <div className="stack">
      <div className="card stack"><h3>When delegates pay</h3>
        <div className="timing-opts" role="radiogroup" aria-label="When delegates pay">
          {([
            ['direct', 'Directly, while registering', `Delegates pay straight after the form. Their portfolio is held for ${s.directHoldMinutes} minutes while they pay.`],
            ['before_allotment', 'Before allotment', 'Delegates pay first. Seats are given in the order payments are confirmed, using their preferences and experience.'],
            ['after_allotment', 'After allotment', `Delegates get their portfolio first, then have ${s.holdHours} hours to pay (change this in Settings → Seats & allotment).`],
          ] as const).map(([v, t, d]) => <label key={v} className={`timing-opt ${s.paymentTiming === v ? 'on' : ''}`}><input type="radio" name="paymentTiming" checked={s.paymentTiming === v} onChange={() => setS('paymentTiming', v)} /><b>{t}</b><span>{d}</span></label>)}
        </div>
        {s.paymentTiming === 'direct' && <div className="grid g3">{num('directHoldMinutes', 'Hold while paying (minutes)', 'at least 5')}</div>}
        {s.allocationMode === 'review' && <p className="small muted" style={{ margin: 0 }}>You review applications first, so delegates pay after you accept them, whatever is chosen here.</p>}
      </div>
      <div className="card stack"><h3>Payment rules</h3>
        <div className="grid g3">
          <Field label="Fee model"><select value={s.feeModel} onChange={(x) => setS('feeModel', x.target.value)}><option value="full">Pay in full once a seat is held</option><option value="two_stage">Application fee first, balance after acceptance</option></select></Field>
          {s.feeModel === 'two_stage' && money('applicationFeePaise', 'Application fee ₹')}
          <Field label="School delegations"><select value={s.groupPayment} onChange={(x) => setS('groupPayment', x.target.value)}><option value="members_pay">Each member pays</option><option value="head_pays">Head delegate pays once</option></select></Field>
          <Field label="Group discount from (members)"><input type="number" value={s.groupDiscount?.minSize ?? ''} onChange={(x) => setS('groupDiscount', { ...(s.groupDiscount ?? { rateBp: 1000 }), minSize: Number(x.target.value) })} /></Field>
          <Field label="Group discount %"><input type="number" value={(s.groupDiscount?.rateBp ?? 0) / 100} onChange={(x) => setS('groupDiscount', { ...(s.groupDiscount ?? { minSize: 8 }), rateBp: Math.round(Number(x.target.value) * 100) })} /></Field>
          {num('refundWindowDays', 'Refund requests close (days before event)')}
          {money('largeRefundPaise', 'Refunds above this need two approvers ₹')}
          {s.gstEnabled && <Field label="SAC code" hint="on GST invoices"><input value={s.sacCode} onChange={(x) => setS('sacCode', x.target.value)} /></Field>}
          <label className="check"><input type="checkbox" checked={s.premiumPricing} onChange={(x) => setS('premiumPricing', x.target.checked)} />Charge the premium set on high-demand portfolios</label>
        </div>
      </div>
      {ownGateways && <div className="card stack"><h3>Online payment gateways</h3>
        <p className="small muted" style={{ margin: 0 }}>Card and UPI checkout through the deployment's Razorpay and Cashfree accounts (keys are set on the server).</p>
        <div className="grid g3">
          {(['razorpay', 'cashfree', 'mock'] as const).map((g) => {
            const info = gw.data?.all.find((x: any) => x.name === g);
            return <div key={g} className="tile"><div className="label">{g === 'mock' ? 'Sandbox (test)' : label(g)}</div>
              <label className="check"><input type="checkbox" checked={s.gateways[g].enabled} onChange={(x) => setS('gateways', { ...s.gateways, [g]: { ...s.gateways[g], enabled: x.target.checked } })} />Offer to delegates</label>
              <label className="check"><input type="checkbox" checked={s.gateways[g].down} onChange={(x) => setS('gateways', { ...s.gateways, [g]: { ...s.gateways[g], down: x.target.checked } })} />Temporarily down (hide)</label>
              <div className="sub">{info ? (info.configured ? 'Keys configured' : 'No API keys set — hidden') : ''}</div></div>;
          })}
          <Field label="Default gateway"><select value={s.defaultGateway} onChange={(x) => setS('defaultGateway', x.target.value)}><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option><option value="mock">Sandbox</option></select></Field>
          <Field label="Route small payments" hint="amounts up to ₹ go to…"><input inputMode="decimal" value={s.routing?.[0] ? toRupees(s.routing[0].maxPaise) : ''} placeholder="e.g. 1000" onChange={(x) => setS('routing', x.target.value ? [{ maxPaise: toPaise(x.target.value), gateway: s.routing?.[0]?.gateway ?? 'cashfree' }] : [])} /></Field>
          {s.routing?.[0] && <Field label="…this gateway"><select value={s.routing[0].gateway} onChange={(x) => setS('routing', [{ ...s.routing[0], gateway: x.target.value }])}><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option></select></Field>}
        </div>
      </div>}
      <div><Btn kind="primary" onClick={async () => { try { await api.patch(`/api/admin/events/${eventId}`, { settings: Object.fromEntries(keys.map((k) => [k, s[k]])) }); toast('Saved', 'ok'); ev.reload(); } catch (x: any) { toast(x.message, 'bad'); } }}>Save payment rules</Btn></div>
    </div>
  );
}

function Org() {
  const { can } = useStaff();
  const o = useAsync<any>(() => api.get('/api/admin/org'), []);
  const users = useAsync<any>(() => (can('users.manage') ? api.get('/api/admin/users') : Promise.resolve({ users: [] })), []);
  const [f, setF] = useState<any>(null);
  const toast = useToast();
  useEffect(() => { if (o.data) setF(o.data); }, [o.data]);
  if (!f) return <Loading />;
  const s = f.settings; const setS = (patch: any) => setF({ ...f, settings: { ...s, ...patch } });
  const fin = can('settings.finance');
  return (
    <div className="stack">
      <div className="card stack"><h3>Legal entity</h3>
        <div className="grid g3">
          {[['name', 'Display name'], ['legal_name', 'Legal name'], ['pan', 'PAN'], ['gstin', 'GSTIN'], ['state_code', 'State code'], ['address', 'Registered address'], ['grievance_contact', 'Grievance officer contact']].map(([k, l]) => <Field key={k} label={l}><input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
          <Field label="Entity type" hint="books, GST and TDS treatment depend on it"><select value={f.entity_type} onChange={(e) => setF({ ...f, entity_type: e.target.value })}>{['private_limited', 'section_8', 'llp', 'society', 'trust'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select></Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Bank and UPI details for delegate payments are set per conference under <Link to="/app/financials">Financials</Link>.</p>
      </div>
      <div className="card stack"><h3>Finance controls {!fin && <span className="badge">CFO only</span>}</h3>
        <div className="grid g3">
          <Field label="Accountant can approve expenses up to ₹"><input disabled={!fin} value={toRupees(s.approvalLimits.accountantExpensePaise)} onChange={(e) => setS({ approvalLimits: { ...s.approvalLimits, accountantExpensePaise: toPaise(e.target.value) || 0 } })} /></Field>
          <Field label="Accountant can post journals up to ₹"><input disabled={!fin} value={toRupees(s.approvalLimits.accountantJournalPaise)} onChange={(e) => setS({ approvalLimits: { ...s.approvalLimits, accountantJournalPaise: toPaise(e.target.value) || 0 } })} /></Field>
          <Field label="Second approver for escalations"><select disabled={!can('settings.org')} value={s.secondApproverUserId ?? ''} onChange={(e) => setS({ secondApproverUserId: e.target.value || null })}><option value="">All CFOs and admins</option>{(users.data?.users ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="Commission TDS rate %"><input disabled={!fin} type="number" step="0.01" value={s.tds.commissionRateBp / 100} onChange={(e) => setS({ tds: { ...s.tds, commissionRateBp: Math.round(Number(e.target.value) * 100) } })} /></Field>
          <Field label="TDS yearly threshold per payee ₹"><input disabled={!fin} value={toRupees(s.tds.thresholdPaise)} onChange={(e) => setS({ tds: { ...s.tds, thresholdPaise: toPaise(e.target.value) || 0 } })} /></Field>
          <Field label="Rate when PAN is missing %"><input disabled={!fin} type="number" value={s.tds.noPanRateBp / 100} onChange={(e) => setS({ tds: { ...s.tds, noPanRateBp: Math.round(Number(e.target.value) * 100) } })} /></Field>
          <Field label="TDS section label"><input disabled={!fin} value={s.tds.section} onChange={(e) => setS({ tds: { ...s.tds, section: e.target.value } })} /></Field>
          <Field label="Invoice number prefix"><input value={s.invoicePrefix} onChange={(e) => setS({ invoicePrefix: e.target.value })} /></Field>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Rates move: commission TDS was 2% with a ₹20,000 threshold under s.194H, moved to s.393 of the Income-tax Act 2025 from April 2026. Confirm with your CA.</p>
      </div>
      <div className="card stack"><h3>Messaging</h3>
        <div className="grid g3">
          <Field label="Quiet hours start (IST)"><input type="number" min={0} max={23} value={s.quietHours.start} onChange={(e) => setS({ quietHours: { ...s.quietHours, start: Number(e.target.value) } })} /></Field>
          <Field label="Quiet hours end (IST)"><input type="number" min={0} max={23} value={s.quietHours.end} onChange={(e) => setS({ quietHours: { ...s.quietHours, end: Number(e.target.value) } })} /></Field>
          <Field label="Emails per minute"><input type="number" value={s.emailsPerMinute} onChange={(e) => setS({ emailsPerMinute: Number(e.target.value) })} /></Field>
        </div>
      </div>
      <div><Btn kind="primary" onClick={async () => {
        const { settings, ...rest } = f;
        const body: any = { ...rest };
        if (fin) body.settings = settings; else { const { approvalLimits, tds, ...other } = settings; body.settings = other; }
        try { await api.patch('/api/admin/org', body); toast('Saved', 'ok'); o.reload(); } catch (e: any) { toast(e.message, 'bad'); }
      }}>Save</Btn></div>
    </div>
  );
}

function Users() {
  const u = useAsync<any>(() => api.get('/api/admin/users'), []);
  const { eventId, me } = useStaff();
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`).catch(() => []), [eventId]);
  const ask = usePrompt();
  const toast = useToast();
  const [matrix, setMatrix] = useState(false);
  if (!u.data) return <Loading />;
  // Super admin is only grantable by a super admin; the most common hire (registration desk) comes first.
  const order = ['registration_exec', 'secretariat', 'chair', 'accountant', 'cfo', 'admin', 'auditor', 'referrer', 'head_delegate', 'superadmin'];
  const roleName = (r: string) => u.data.roles.find((x: any) => x.role === r)?.label ?? label(r);
  const roleOpts = u.data.roles.filter((r: any) => r.role !== 'superadmin' || me.roles.some((x) => x.role === 'superadmin'))
    .sort((a: any, b: any) => order.indexOf(a.role) - order.indexOf(b.role)).map((r: any) => ({ value: r.role, label: r.label }));
  const addRole = async (userId: string) => {
    const r = await ask({ title: 'Add role', fields: [{ key: 'role', label: 'Role', options: roleOpts }, { key: 'committee_id', label: 'Committee (chairs only)', options: [{ value: '', label: '—' }, ...(inv.data ?? []).map((c) => ({ value: c.id, label: c.name }))] }] });
    if (!r) return;
    try { await api.post(`/api/admin/users/${userId}/roles`, { role: r.role, committee_id: r.committee_id || null, event_id: r.committee_id ? eventId : null }); u.reload(); } catch (e: any) { toast(e.message, 'bad'); }
  };
  return (
    <div className="stack">
      <Alert tone="info">Money-moving rights are split: an admin cannot approve payments unless also given the CFO role, and whoever submits a payment, refund or expense cannot approve it. Two-factor sign-in is mandatory for CFO, Accountant and Admin.</Alert>
      <div className="row"><Btn kind="primary" onClick={async () => {
        const r = await ask({ title: 'Invite staff', fields: [{ key: 'name', label: 'Name', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'role', label: 'Role', options: roleOpts }, { key: 'committee_id', label: 'Committee (chairs only)', options: [{ value: '', label: '—' }, ...(inv.data ?? []).map((c) => ({ value: c.id, label: c.name }))] }] });
        if (!r) return;
        try { const x = await api.post<any>('/api/admin/users', { name: r.name, email: r.email, roles: [{ role: r.role, committee_id: r.committee_id || null, event_id: r.committee_id ? eventId : null }] }); u.reload(); void ask({ title: 'Invitation sent', message: `We emailed ${r.email} a link to set their password and sign in. If email isn't set up yet, send them this link yourself (it works once, for 7 days):\n\n${x.inviteLink}`, confirm: 'Done', info: true }); } catch (e: any) { toast(e.message, 'bad'); }
      }}>+ Invite staff</Btn><button className="btn" onClick={() => setMatrix(true)}>Permission matrix</button></div>
      <details className="card role-guide"><summary><strong>What each role can do</strong></summary>
        <div className="role-grid">{u.data.roles.filter((r: any) => roleOpts.some((o: any) => o.value === r.role)).sort((a: any, b: any) => order.indexOf(a.role) - order.indexOf(b.role)).map((r: any) => <div key={r.role}><strong>{r.label}</strong>{r.mfa && <span className="badge info" style={{ marginLeft: 6 }}>2FA</span>}<div className="small muted">{r.help}</div></div>)}</div>
      </details>
      <div className="card flush"><DataTable rows={u.data.users} columns={[
        { key: 'name', label: 'Name', render: (x: any) => <><strong>{x.name}</strong>{x.invite_pending && !x.last_login_at ? <span className="badge warn" style={{ marginLeft: 6 }}>Invited</span> : null}<div className="small faint">{x.email}</div></> },
        { key: 'roles', label: 'Roles', sort: false, render: (x: any) => <span className="row">{x.roles.map((r: any) => <span key={r.id} className="badge">{roleName(r.role)}{r.committee ? ` · ${r.committee}` : ''} <button className="btn ghost sm" style={{ minHeight: 0, padding: 0 }} aria-label="Remove role" onClick={async () => { await api.del(`/api/admin/users/${x.id}/roles/${r.id}`); u.reload(); }}>✕</button></span>)}<button className="btn sm" onClick={() => addRole(x.id)}>+</button></span> },
        { key: 'totp_enabled', label: '2FA', render: (x: any) => (x.totp_enabled ? 'On' : 'Off') }, { key: 'active', label: 'Active', render: (x: any) => (x.active ? 'Yes' : 'No') }, { key: 'last_login_at', label: 'Last sign-in', render: (x: any) => (x.last_login_at ? new Date(x.last_login_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—') },
        { key: 'act', label: '', sort: false, render: (x: any) => <span className="row">
          <Btn size="sm" onClick={async () => { await api.patch(`/api/admin/users/${x.id}`, { active: !x.active }); u.reload(); }}>{x.active ? 'Deactivate' : 'Activate'}</Btn>
          {!x.last_login_at ? <Btn size="sm" onClick={async () => { try { const r = await api.post<any>(`/api/admin/users/${x.id}/invite`); u.reload(); void ask({ title: 'Invitation sent again', message: `New link (the old one no longer works):\n\n${r.inviteLink}`, confirm: 'Done', info: true }); } catch (e: any) { toast(e.message, 'bad'); } }}>Resend invite</Btn>
            : <Btn size="sm" onClick={async () => { const r = await api.post<any>(`/api/admin/users/${x.id}/reset-password`); void ask({ title: 'Reset link sent', message: `We emailed ${x.email} a link to choose a new password (valid for an hour) and signed them out everywhere:\n\n${r.resetLink}`, confirm: 'Done', info: true }); }}>Reset password</Btn>}
          {x.totp_enabled ? <Btn size="sm" onClick={async () => { await api.post(`/api/admin/users/${x.id}/reset-mfa`); u.reload(); }}>Reset 2FA</Btn> : null}
        </span> },
      ]} /></div>
      {matrix && <Modal wide title="Who can do what" onClose={() => setMatrix(false)}><div className="table-wrap"><table className="t"><thead><tr><th>Permission</th>{u.data.roles.map((r: any) => <th key={r.role} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{r.label}</th>)}</tr></thead><tbody>{Object.entries(u.data.permissions).map(([p, rs]: any) => <tr key={p}><td className="mono small">{p}</td>{u.data.roles.map((r: any) => <td key={r.role} style={{ textAlign: 'center' }}>{rs.includes(r.role) ? '✓' : ''}</td>)}</tr>)}</tbody></table></div></Modal>}
    </div>
  );
}
