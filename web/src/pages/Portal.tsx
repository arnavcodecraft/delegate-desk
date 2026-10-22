import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api';
import { inr, dt, date, today, label, toPaise } from '../format';
import { Alert, Btn, ErrorBox, Field, Loading, Status, useAsync, useToast, usePrompt } from '../ui';
import { PublicShell } from './Register';

declare global { interface Window { Razorpay?: any; Cashfree?: any } }
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script'); s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load the payment page. Check your connection.'));
    document.body.appendChild(s);
  });
}

function Countdown({ until }: { until: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return <>expired</>;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return <>{h > 0 ? `${h} h ` : ''}{m} min</>;
}

export default function Portal() {
  const { token = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const toast = useToast();
  const ask = usePrompt();
  const v = useAsync<any>(() => api.get(`/api/public/r/${token}`), [token]);
  const [orderState, setOrderState] = useState<string | null>(null);
  const orderId = sp.get('order');

  // Returning from a gateway: show "processing" until the server confirms via webhook or a status fetch.
  useEffect(() => {
    if (!orderId) return;
    let stop = false; let tries = 0;
    const poll = async () => {
      try {
        const o = await api.get<any>(`/api/public/orders/${orderId}`);
        setOrderState(o.status);
        if (o.status === 'paid' || o.status === 'failed' || tries++ > 40) { v.reload(); sp.delete('order'); setSp(sp, { replace: true }); return; }
      } catch { /* keep polling */ }
      if (!stop) setTimeout(poll, 2500);
    };
    poll();
    return () => { stop = true; };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (v.loading && !v.data) return <PublicShell title="Your registration"><Loading /></PublicShell>;
  if (v.error) return <PublicShell title="Your registration"><ErrorBox error={v.error} /></PublicShell>;
  const { event, registration: r, seat, payment, evidence, invoices, refunds, committees, swap } = v.data;
  const conf = v.data.conference;
  const paid = r.payment_status === 'paid' || r.payment_status === 'part_refunded';
  const welcome = sp.get('welcome') === '1';

  async function pay(gateway: string) {
    try {
      const o = await api.post<any>(`/api/public/r/${token}/orders`, { gateway });
      if (o.checkout.provider === 'mock') { window.location.href = o.checkout.url; return; }
      if (o.checkout.provider === 'razorpay') {
        await loadScript('https://checkout.razorpay.com/v1/checkout.js');
        const rzp = new window.Razorpay({
          key: o.checkout.key, order_id: o.checkout.order_id, amount: o.checkout.amount, currency: 'INR', name: o.checkout.name, description: o.checkout.description, prefill: o.checkout.prefill,
          handler: async (resp: any) => { await api.post(`/api/public/orders/${o.orderId}/callback`, resp).catch(() => {}); setSp({ order: o.orderId }); },
          modal: { ondismiss: () => toast('Payment window closed. You can try again any time.') },
          theme: { color: '#1f3b63' },
        });
        rzp.on('payment.failed', (resp: any) => toast(resp?.error?.description ?? 'Payment failed', 'bad'));
        rzp.open();
        return;
      }
      if (o.checkout.provider === 'cashfree') {
        await loadScript('https://sdk.cashfree.com/js/v3/cashfree.js');
        const cf = window.Cashfree({ mode: o.checkout.mode === 'production' ? 'production' : 'sandbox' });
        await cf.checkout({ paymentSessionId: o.checkout.paymentSessionId, redirectTarget: '_self' });
      }
    } catch (e: any) { toast(e.message, 'bad'); v.reload(); }
  }

  return (
    <PublicShell eyebrow="Your delegate page" title={event.name} logo={conf?.logo} subtitle={<>{r.full_name} · Delegate ID <strong>{r.ref}</strong></>}>
      <div className="stack">
        {orderState && orderState !== 'paid' && orderState !== 'failed' && <Alert tone="info"><strong>Processing your payment…</strong> We confirm it directly with the payment gateway. This usually takes a few seconds; you can close this page safely.</Alert>}
        {orderState === 'failed' && <Alert tone="bad">The payment did not go through. No money was taken, or it will be returned by your bank. Please try again.</Alert>}
        {r.email_bounced && <Alert tone="warn">Emails to {r.email} are bouncing. Update your email below so you get your receipt.</Alert>}
        {r.cancelled && <Alert tone="bad">This registration is cancelled.</Alert>}

        <div className="card">
          {r.allot_status === 'applied' ? (
            <div className="seat-hero">{welcome && <div className="badge good" style={{ marginBottom: '.5rem' }}>Application sent</div>}<div className="committee">Application under review</div><p className="muted">The team reviews every application and assigns committees and portfolios. We’ll email you as soon as yours is decided. Nothing is payable until then.</p></div>
          ) : r.allot_status === 'waitlisted' ? (
            <div className="seat-hero"><div className="committee">You are on the waitlist</div><div className="portfolio">#{r.waitlist_position}</div><p className="muted">All seats in your preferred committees are taken. We’ll email you as soon as one opens. Please don’t pay until you are offered a seat.</p></div>
          ) : seat ? (
            <div className="seat-hero">
              {welcome && !paid && <div className="badge good" style={{ marginBottom: '.5rem' }}>Registered — here is your allotment</div>}
              <div className="committee">{seat.committee}</div>
              <div className="portfolio">{seat.portfolio}</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {seat.state === 'confirmed' ? <span className="badge good"><span className="dot" />Confirmed</span> : <span className="badge warn"><span className="dot" />Provisional</span>}
                {seat.state === 'held' && r.hold_expires_at && <span className="small muted">Pay within <strong><Countdown until={r.hold_expires_at} /></strong> to keep this seat</span>}
              </div>
              {seat.guide_url && <p style={{ marginTop: '.75rem' }}><a href={seat.guide_url} target="_blank" rel="noreferrer">Download the background guide →</a></p>}
            </div>
          ) : (
            <div className="seat-hero"><div className="committee">Seat released</div><p className="muted">Your hold expired. Pay below and we will allot the best available seat straight away.</p></div>
          )}
          <div className="steps" style={{ justifyContent: 'center' }}>
            <span className="done">{conf?.allocationMode === 'review' ? 'Applied' : 'Registered'}</span>
            <span className={r.allot_status === 'held' || r.allot_status === 'confirmed' ? 'done' : 'on'}>{conf?.allocationMode === 'review' ? 'Accepted' : 'Allotted'}</span>
            <span className={paid ? 'done' : r.allot_status === 'applied' ? '' : 'on'}>{conf?.free ? 'Confirmed' : r.payment_status === 'submitted' ? 'Proof under review' : 'Paid'}</span>
            <span className={paid && r.dietary ? 'done' : paid ? 'on' : ''}>Profile</span>
          </div>
        </div>

        {v.data.checkinCode && <CheckinPass code={v.data.checkinCode} name={r.full_name} />}
        {conf?.positionPapers?.enabled && seat && !r.cancelled && <PositionPaper token={token} conf={conf} onDone={v.reload} />}
        {payment && <PaymentCard token={token} payment={payment} reg={r} pay={pay} onDone={v.reload} />}

        {r.payment_status === 'submitted' && <Alert tone="info"><strong>Your payment proof is under review.</strong> The finance team checks it against the bank statement, usually within a day. Your seat stays held meanwhile.</Alert>}

        {r.allot_status !== 'applied' && !conf?.free && <div className="card">
          <h3>Payment summary</h3>
          <div className="fee-box">
            <div className="line"><span>Registration fee</span><span>{inr(r.base_paise)}</span></div>
            {r.premium_paise > 0 && <div className="line"><span>High-demand portfolio premium</span><span>{inr(r.premium_paise)}</span></div>}
            {r.discount_paise > 0 && <div className="line"><span>Discount</span><span>−{inr(r.discount_paise)}</span></div>}
            {r.gst_paise > 0 && <div className="line muted"><span>GST</span><span>{inr(r.gst_paise)}</span></div>}
            <div className="line total"><span>Total</span><span>{inr(r.total_paise)}</span></div>
            <div className="line"><span>Paid</span><span>{inr(r.paid_paise)}</span></div>
            {r.refunded_paise > 0 && <div className="line"><span>Refunded</span><span>{inr(r.refunded_paise)}</span></div>}
            {r.balance_paise > 0 && <div className="line" style={{ fontWeight: 700 }}><span>Balance due</span><span>{inr(r.balance_paise)}</span></div>}
          </div>
          <div className="row" style={{ marginTop: '.75rem' }}><Status value={r.payment_status} />
            {invoices.map((i: any) => <a key={i.id} className="btn sm" href={`/api/public/r/${token}/invoice/${i.id}`} target="_blank" rel="noreferrer">{i.kind === 'credit_note' ? 'Credit note' : 'Receipt & GST invoice'} {i.number}</a>)}
            {seat && <a className="btn sm" href={`/api/public/r/${token}/allotment-letter`} target="_blank" rel="noreferrer">Allotment letter</a>}
          </div>
          {evidence.length > 0 && <div style={{ marginTop: '.75rem' }}>{evidence.map((e: any) => <div key={e.id} className="small row"><Status value={e.status} /> UTR {e.utr} · {inr(e.amount_paise)} · {dt(e.submitted_at)}{e.reason && e.status !== 'submitted' ? <span className="muted"> — {e.reason}</span> : null}</div>)}</div>}
          {refunds.length > 0 && <div style={{ marginTop: '.5rem' }}>{refunds.map((x: any) => <div key={x.id} className="small row"><Status value={x.status} /> Refund {inr(x.amount_paise)} · {x.reason}</div>)}</div>}
        </div>}

        <ProfileCard token={token} r={r} paid={paid} onSaved={v.reload} />
        <DetailsCard token={token} r={r} onSaved={v.reload} />

        {!r.cancelled && seat && (
          <div className="card stack">
            <h3>Need a change?</h3>
            {swap ? <Alert tone="info">Your request to move to another committee is with the secretariat.</Alert> : (
              <Btn onClick={async () => {
                const res = await ask({ title: 'Request a committee change', fields: [{ key: 'committee_id', label: 'Move me to', options: committees.filter((c: any) => c.name !== seat.committee).map((c: any) => ({ value: c.id, label: c.name })) }, { key: 'note', label: 'Reason (optional)', type: 'textarea' }], confirm: 'Send request' });
                if (!res) return;
                await api.post(`/api/public/r/${token}/swap`, res); toast('Request sent to the secretariat', 'ok'); v.reload();
              }}>Request a committee change</Btn>
            )}
            {paid && <Btn kind="danger" onClick={async () => {
              const res = await ask({ title: 'Request a refund', message: `Refunds follow the event policy and need finance approval. Requests close ${v.data.refundWindowDays} days before the event.`, fields: [{ key: 'reason', label: 'Reason', type: 'textarea', required: true }], confirm: 'Request refund', danger: true });
              if (!res) return;
              await api.post(`/api/public/r/${token}/refund-request`, res); toast('Refund request sent', 'ok'); v.reload();
            }}>Request a refund</Btn>}
            {!paid && r.paid_paise === 0 && <Btn kind="danger" onClick={async () => {
              const res = await ask({ title: 'Cancel registration?', message: 'Your seat will go to the next person on the waitlist.', confirm: 'Cancel my registration', danger: true });
              if (!res) return;
              await api.post(`/api/public/r/${token}/cancel`, {}); toast('Registration cancelled'); v.reload();
            }}>Cancel my registration</Btn>}
          </div>
        )}
        <div className="card stack small">
          <h3>Your data</h3>
          <p className="muted" style={{ margin: 0 }}>We use your details only to run {event.name}. Payment and invoice records are kept for eight years as company law requires.</p>
          {r.consent_withdrawn ? <Alert tone="info">You withdrew consent. The secretariat will erase your data except what the law requires us to keep.</Alert> :
            <Btn size="sm" kind="ghost" onClick={async () => {
              const res = await ask({ title: 'Withdraw consent?', message: 'We will stop messaging you and erase your personal data, except records the law requires us to keep. If you have a seat, contact the secretariat about cancelling.', confirm: 'Withdraw consent', danger: true });
              if (res) { await api.post(`/api/public/r/${token}/withdraw-consent`, {}); v.reload(); }
            }}>Withdraw consent and request erasure</Btn>}
        </div>
      </div>
    </PublicShell>
  );
}

function PaymentCard({ token, payment, reg, pay, onDone }: any) {
  const [mode, setMode] = useState<'gateway' | 'upload'>(window.location.hash === '#upload' ? 'upload' : 'gateway');
  const noGateway = payment.gateways.length === 0;
  return (
    <div className="card stack" id="pay">
      <div className="row between"><h3 style={{ margin: 0 }}>Pay {inr(payment.duePaise)}</h3>{reg.payment_status === 'failed' && <span className="badge bad">Last attempt failed</span>}</div>
      {reg.payment_status === 'submitted' ? null : <>
        <div className="row">
          {!noGateway && <button className={`chip ${mode === 'gateway' ? 'on' : ''}`} onClick={() => setMode('gateway')}>Pay online</button>}
          {payment.screenshot && payment.instructions?.proofAccepted !== false && <button className={`chip ${mode === 'upload' || noGateway ? 'on' : ''}`} onClick={() => setMode('upload')}>{payment.instructions?.link ? 'Pay and upload proof' : 'Paid by UPI / bank transfer'}</button>}
        </div>
        {mode === 'gateway' && !noGateway ? (
          <div className="stack">
            {payment.gateways.map((g: any) => <Btn key={g.name} kind={g.default ? 'primary' : undefined} size="lg" className="block" onClick={() => pay(g.name)}>{g.label}</Btn>)}
            <p className="small faint" style={{ margin: 0 }}>You will see a secure payment page. Card details never reach us.</p>
          </div>
        ) : payment.screenshot && payment.instructions?.proofAccepted !== false ? <UploadProof token={token} ins={payment.instructions} onDone={onDone} /> : null}
        {payment.instructions?.inPerson && <div className="callout" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '.75rem 1rem' }}><strong>Paying in person?</strong><div className="small">{payment.instructions.inPerson.instructions}</div><div className="small faint">Quote your delegate ID {reg.ref}. The team marks it as received and you get a confirmation email.</div></div>}
      </>}
    </div>
  );
}

function UploadProof({ token, ins, onDone }: any) {
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [utr, setUtr] = useState(''); const [amount, setAmount] = useState(String(ins.amountPaise / 100)); const [paidOn, setPaidOn] = useState(today());
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ins.qrImage) setQr(ins.qrImage); else if (ins.upiUri) QRCode.toDataURL(ins.upiUri, { margin: 1, width: 220 }).then(setQr).catch(() => {}); }, [ins.upiUri, ins.qrImage]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast('Attach the screenshot or PDF', 'bad');
    if (file.size > 5 * 1024 * 1024) return toast('File is larger than 5 MB', 'bad');
    const fd = new FormData(); fd.append('file', file); fd.append('utr', utr); fd.append('amount', amount); fd.append('paid_on', paidOn);
    setBusy(true);
    try { await api.post(`/api/public/r/${token}/evidence`, fd); toast('Proof received. We will confirm after checking the bank statement.', 'ok'); onDone(); }
    catch (err: any) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  return (
    <form className="stack" id="upload" onSubmit={submit}>
      {ins.link && <div className="stack tight"><a className="btn primary lg" href={ins.link.url} target="_blank" rel="noreferrer">Open the payment page ↗</a>{ins.link.instructions && <p className="small muted" style={{ margin: 0 }}>{ins.link.instructions}</p>}<p className="small faint" style={{ margin: 0 }}>After paying, upload the receipt below.</p></div>}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <dl className="kv small" style={{ margin: 0 }}>
          <dt>Amount</dt><dd>{inr(ins.amountPaise)}</dd>
          {ins.upiId && <><dt>UPI ID</dt><dd className="mono">{ins.upiId}</dd></>}
          <dt>Payee</dt><dd>{ins.payee}</dd>
          {ins.account && <>{ins.accountName && <><dt>Account name</dt><dd>{ins.accountName}</dd></>}<dt>Account</dt><dd className="mono">{ins.account} <CopyBtn v={ins.account} /></dd>{ins.ifsc && <><dt>IFSC / SWIFT</dt><dd className="mono">{ins.ifsc} <CopyBtn v={ins.ifsc} /></dd></>}{ins.bankName && <><dt>Bank</dt><dd>{ins.bankName}</dd></>}</>}
          <dt>Remark</dt><dd><strong className="mono">{ins.reference}</strong> <span className="faint">(write this in the payment note)</span></dd>
          {(ins.bankInstructions || ins.qrInstructions) && <><dt>Note</dt><dd>{ins.bankInstructions || ins.qrInstructions}</dd></>}
        </dl>
        {qr && <div style={{ textAlign: 'center' }}><img src={qr} alt={`QR code to pay ${inr(ins.amountPaise)}`} width={180} height={180} style={{ borderRadius: 8, background: '#fff', padding: 6, objectFit: 'contain' }} /><div className="small faint">{ins.qrImage ? 'Scan with your banking app' : 'Scan with any UPI app'}</div></div>}
      </div>
      <Field label="Screenshot or PDF of the payment" hint="JPG, PNG or PDF, up to 5 MB"><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required /></Field>
      <div className="grid g3">
        <Field label="Transaction reference (UTR)"><input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="e.g. 12-digit UTR" required /></Field>
        <Field label="Amount paid (₹)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
        <Field label="Date paid"><input type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} required /></Field>
      </div>
      {Number.isFinite(toPaise(amount)) && toPaise(amount) !== ins.amountPaise && <Alert tone="warn">You entered a different amount from the {inr(ins.amountPaise)} due. Finance may accept it as a part payment.</Alert>}
      <button className="btn primary lg" disabled={busy}>{busy ? 'Uploading…' : 'Submit payment proof'}</button>
    </form>
  );
}

function ProfileCard({ token, r, paid, onSaved }: any) {
  const toast = useToast();
  const [p, setP] = useState({ dietary: r.dietary ?? '', tshirt: r.tshirt ?? '', emergency_name: r.emergency_name ?? '', emergency_phone: r.emergency_phone ?? '', experience: r.experience ?? 'first' });
  const [file, setFile] = useState<File | null>(null);
  if (!paid) return null;
  const blocked = r.is_minor && r.guardian_consent !== 'verified';
  return (
    <div className="card stack">
      <h3>Complete your profile</h3>
      {blocked ? <Alert tone="warn">We’ve emailed your parent, guardian or school for consent. Once they agree, you can add your profile details here.</Alert> : <>
        <div className="grid g2">
          <Field label="MUN experience"><select value={p.experience} onChange={(e) => setP({ ...p, experience: e.target.value })}><option value="first">First conference</option><option value="some">1–3 conferences</option><option value="experienced">4 or more</option></select></Field>
          <Field label="Dietary needs"><select value={p.dietary} onChange={(e) => setP({ ...p, dietary: e.target.value })}><option value="">Choose…</option>{['Vegetarian', 'Non-vegetarian', 'Vegan', 'Jain', 'Eggetarian', 'Allergy (tell us)'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="T-shirt size"><select value={p.tshirt} onChange={(e) => setP({ ...p, tshirt: e.target.value })}><option value="">Choose…</option>{['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Emergency contact name"><input value={p.emergency_name} onChange={(e) => setP({ ...p, emergency_name: e.target.value })} /></Field>
          <Field label="Emergency contact phone"><input type="tel" value={p.emergency_phone} onChange={(e) => setP({ ...p, emergency_phone: e.target.value })} /></Field>
          <Field label={<>ID proof <span className="hint">({label(r.id_proof_status)})</span></>}><input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        </div>
        <div><Btn kind="primary" disabled={r.details_locked} onClick={async () => {
          await api.patch(`/api/public/r/${token}`, p);
          if (file) { const fd = new FormData(); fd.append('file', file); await api.post(`/api/public/r/${token}/id-proof`, fd); }
          toast('Profile saved', 'ok'); onSaved();
        }}>Save profile</Btn></div>
      </>}
    </div>
  );
}

function DetailsCard({ token, r, onSaved }: any) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ full_name: r.full_name, institution: r.institution, class_year: r.class_year, city: r.city, mobile: r.mobile, referral_name: r.referral_name ?? '' });
  return (
    <div className="card stack">
      <div className="row between"><h3 style={{ margin: 0 }}>Your details</h3>{!r.details_locked && <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>}</div>
      {r.details_locked && <p className="small muted" style={{ margin: 0 }}>Details are locked for badge printing. Contact the secretariat for corrections.</p>}
      {!open ? (
        <dl className="kv small" style={{ margin: 0 }}><dt>Name on badge</dt><dd>{r.full_name}</dd><dt>Institution</dt><dd>{r.institution}</dd><dt>Class</dt><dd>{r.class_year}</dd><dt>City</dt><dd>{r.city}</dd><dt>Email</dt><dd>{r.email}</dd><dt>Mobile</dt><dd>{r.mobile}</dd><dt>Referred by</dt><dd>{r.referral_name || '—'}</dd></dl>
      ) : (
        <div className="stack">
          <div className="grid g2">
            {(['full_name', 'institution', 'class_year', 'city', 'mobile'] as const).map((k) => <Field key={k} label={label(k)}><input value={(d as any)[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Field>)}
            <Field label="Referred by" hint={r.referral_editable ? '' : '(locked after payment)'}><input value={d.referral_name} disabled={!r.referral_editable} onChange={(e) => setD({ ...d, referral_name: e.target.value })} /></Field>
          </div>
          <div><Btn kind="primary" onClick={async () => {
            const patch: any = { ...d }; if (!r.referral_editable || d.referral_name === (r.referral_name ?? '')) delete patch.referral_name;
            await api.patch(`/api/public/r/${token}`, patch); toast('Saved', 'ok'); setOpen(false); onSaved();
          }}>Save</Btn></div>
        </div>
      )}
    </div>
  );
}

export function SandboxPay() {
  const { orderId = '' } = useParams();
  const nav = useNavigate();
  const o = useAsync<any>(() => api.get(`/api/public/sandbox/${orderId}`), [orderId]);
  const toast = useToast();
  if (o.loading) return <PublicShell title="Sandbox payment"><Loading /></PublicShell>;
  if (o.error) return <PublicShell title="Sandbox payment"><ErrorBox error={o.error} /></PublicShell>;
  const go = async (outcome: string) => {
    try { await api.post(`/api/public/sandbox/${orderId}/complete`, { outcome }); } catch (e: any) { toast(e.message, 'bad'); return; }
    nav(o.data.returnTo);
  };
  return (
    <PublicShell title="Sandbox payment gateway" subtitle="Test mode — no real money moves">
      <div className="card stack">
        <Alert tone="warn">This built-in test gateway sends a <strong>signed webhook</strong> through the same verification and booking path as Razorpay and Cashfree. Configure live keys to take real payments.</Alert>
        <dl className="kv"><dt>Order</dt><dd className="mono small">{o.data.id}</dd><dt>Delegate</dt><dd>{o.data.name} ({o.data.ref})</dd><dt>Amount</dt><dd><strong>{inr(o.data.amount_paise)}</strong></dd><dt>Status</dt><dd><Status value={o.data.status} /></dd></dl>
        <Btn kind="primary" size="lg" onClick={() => go('success')}>Pay {inr(o.data.amount_paise)} (success)</Btn>
        <Btn size="lg" onClick={() => go('success_no_webhook')}>Success, but webhook arrives late</Btn>
        <Btn kind="danger" size="lg" onClick={() => go('failure')}>Simulate a failed payment</Btn>
      </div>
    </PublicShell>
  );
}

export function Consent() {
  const { token = '' } = useParams();
  const c = useAsync<any>(() => api.get(`/api/public/consent/${token}`), [token]);
  const [name, setName] = useState(''); const [relation, setRelation] = useState('Parent');
  const toast = useToast();
  if (c.loading) return <PublicShell title="Consent"><Loading /></PublicShell>;
  if (c.error) return <PublicShell title="Consent"><ErrorBox error={c.error} /></PublicShell>;
  return (
    <PublicShell title={`Consent for ${c.data.delegate}`} subtitle={c.data.event}>
      <div className="card stack">
        {c.data.status === 'verified' ? <Alert tone="good">Thank you. Consent has been recorded.</Alert> : <>
          <p>{c.data.delegate} has registered for <strong>{c.data.event}</strong>. Because they are under 18, we need consent from a parent, guardian or their school before we collect more than their basic registration (name, contact, school and allotment).</p>
          <p className="muted small">We will then ask for dietary needs, T-shirt size, an emergency contact and ID proof, used only to run the event. See the <a href="/privacy">privacy notice</a>.</p>
          <div className="grid g2">
            <Field label="Your full name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Relationship"><select value={relation} onChange={(e) => setRelation(e.target.value)}>{['Parent', 'Guardian', 'School / teacher'].map((x) => <option key={x}>{x}</option>)}</select></Field>
          </div>
          <Btn kind="primary" disabled={!name.trim()} onClick={async () => { await api.post(`/api/public/consent/${token}`, { name, relation }); toast('Consent recorded', 'ok'); c.reload(); }}>I give consent</Btn>
        </>}
      </div>
    </PublicShell>
  );
}

export function Privacy() {
  const p = useAsync<any>(() => api.get('/api/public/privacy'), []);
  return (
    <PublicShell title="Privacy notice" subtitle={p.data?.org}>
      <div className="card stack">
        <p><strong>What we collect.</strong> At registration: your name, email, mobile, school or college, class, city, date of birth, committee preferences and who referred you. After payment: dietary needs, T-shirt size, emergency contact and, where the event needs it, ID proof.</p>
        <p><strong>Why.</strong> To allot your committee and portfolio, take your payment, issue GST invoices, print badges and certificates, keep you safe at the venue, and pay referral commission.</p>
        <p><strong>Children.</strong> For delegates under 18 we ask a parent, guardian or school for verifiable consent before collecting anything beyond the basic registration. Data of minors is excluded from externally shared lists by default.</p>
        <p><strong>Payments.</strong> Card and UPI payments are handled by Razorpay or Cashfree; we never see or store card details. Payment proofs you upload are stored privately and shown only to the finance team.</p>
        <p><strong>How long.</strong> Registration data is kept until the event ends and then erased on request. Invoices and accounting records are kept for at least eight financial years, as the Companies Act requires.</p>
        <p><strong>Your rights.</strong> You can see and correct your details from your delegate link, withdraw consent and request erasure at any time from the same page.</p>
        <p><strong>Grievances.</strong> {p.data?.grievance ?? 'Contact the organiser.'}</p>
        <p className="small faint">Refund policy: refund requests close as set for each event (shown on the registration form). Gateway payments are refunded to the original method; bank transfers are refunded by bank transfer.</p>
      </div>
    </PublicShell>
  );
}

export { date };

/** The same signed code as the printed badge, so delegates can check in from their phone. */
function CheckinPass({ code, name }: { code: string; name: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(code, { margin: 1, width: 360 }).then(setQr).catch(() => {}); }, [code]);
  return (
    <div className="card row" style={{ gap: '1.25rem', alignItems: 'center' }}>
      {qr && <img src={qr} alt={`Check-in QR code for ${name}`} width={128} height={128} style={{ borderRadius: 10, background: '#fff', padding: 6, border: '1px solid var(--border)' }} />}
      <div style={{ flex: '1 1 200px' }}>
        <h3 style={{ marginBottom: '.25rem' }}>Your check-in pass</h3>
        <p className="muted small" style={{ margin: 0 }}>Show this at the registration desk and committee door. It's the same code as on your printed badge.</p>
      </div>
    </div>
  );
}

function CopyBtn({ v }: { v: string }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="btn sm ghost" style={{ padding: '0 .4rem', minHeight: 0 }} onClick={async () => { try { await navigator.clipboard.writeText(v); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* blocked */ } }} aria-label="Copy">{ok ? '✓' : 'Copy'}</button>;
}

/** Position paper upload, with the chair's score and feedback once reviewed. */
function PositionPaper({ token, conf, onDone }: { token: string; conf: any; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const latest = conf.papers?.[0];
  const deadline = conf.positionPapers.deadline;
  const late = deadline && deadline < new Date().toISOString();
  return (
    <div className="card stack">
      <div className="row between"><h3 style={{ margin: 0 }}>Position paper</h3>{deadline && <span className={`badge ${late ? 'bad' : ''}`}>Due {new Date(deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}</div>
      {latest ? <div className="stack tight">
        <div className="row"><span className={`badge ${latest.status === 'reviewed' ? 'good' : latest.status === 'revise' ? 'warn' : ''}`}>{latest.status === 'reviewed' ? 'Reviewed' : latest.status === 'revise' ? 'Revision asked' : 'Submitted'}</span><span className="small muted">{latest.file_name}</span>{latest.score != null && <b>{latest.score}/10</b>}</div>
        {latest.feedback && <div className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: '.6rem .8rem', borderRadius: 8 }}>{latest.feedback}</div>}
      </div> : <p className="small muted" style={{ margin: 0 }}>Upload your position paper as a PDF. Your chair reads it and may send feedback.</p>}
      {!late && (!latest || latest.status === 'revise' || latest.status === 'submitted') && (
        <label className="btn" style={{ alignSelf: 'flex-start' }}>{busy ? 'Uploading…' : latest ? 'Upload a new version' : 'Upload PDF'}
          <input type="file" accept="application/pdf" hidden disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setBusy(true); try { const fd = new FormData(); fd.append('file', f); await api.post(`/api/public/r/${token}/paper`, fd); toast('Position paper received', 'ok'); onDone(); } catch (x: any) { toast(x.message, 'bad'); } finally { setBusy(false); } }} />
        </label>
      )}
    </div>
  );
}
