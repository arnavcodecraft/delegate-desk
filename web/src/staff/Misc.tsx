import { useState } from 'react';
import { Download } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api';
import { dt, label, today } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Status, Tabs, useAsync, useToast, usePrompt, downloadUrl } from '../ui';
import { PageHead, useStaff } from './Shell';

/** Every import runs in four steps: upload, map columns, preview with errors highlighted, confirm. */
export function Imports() {
  const { eventId, can } = useStaff();
  const [sp] = useSearchParams();
  const kinds = useAsync<any[]>(() => api.get('/api/admin/imports/kinds'), []);
  const batches = useAsync<any[]>(() => api.get('/api/admin/imports'), []);
  const [kind, setKind] = useState(sp.get('kind') ?? 'registrations');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsed, setParsed] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [date, setDate] = useState(today());
  const toast = useToast();
  const k = (kinds.data ?? []).find((x) => x.key === kind);
  const reset = () => { setStep(1); setParsed(null); setPv(null); setResult(null); };
  return (
    <div className="stack">
      <PageHead title="Import" subtitle="Bring in registrations, seats, bank statements, settlements, vendors, expenses, referrers or opening balances. Nothing financial is posted straight from a file." />
      <div className="card stack">
        <div className="steps">{['Upload', 'Map columns', 'Preview', 'Done'].map((s, i) => <span key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>{i + 1}. {s}</span>)}</div>
        {step === 1 && <div className="stack">
          <Field label="What are you importing?"><select value={kind} onChange={(e) => setKind(e.target.value)}>{(kinds.data ?? []).map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}</select></Field>
          {k && <p className="small muted" style={{ margin: 0 }}>Columns: {k.fields.map((f: any) => `${f.label}${f.required ? '*' : ''}`).join(', ')}</p>}
          <Alert tone="info">Nothing financial is posted straight from an import: bank lines are matched for CFO review, settlements and expenses arrive as drafts, opening balances wait for sign-off. A failed row never blocks the rest.</Alert>
          <Field label="CSV or Excel file (export Google Sheets / Forms as CSV)"><input type="file" accept=".csv,.xlsx,text/csv" onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            const fd = new FormData(); fd.append('file', file); fd.append('kind', kind); fd.append('event_id', eventId);
            try { const r = await api.post<any>('/api/admin/imports/parse', fd); setParsed(r); setMapping(r.mapping); setStep(2); } catch (x: any) { toast(x.message, 'bad'); }
          }} /></Field>
        </div>}
        {step === 2 && parsed && <div className="stack">
          <p className="muted">{parsed.rows} data rows found. Match each field to a column in your file (we guessed where we could).</p>
          <div className="grid g3">{parsed.fields.map((f: any) => <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`}><select value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })} className={f.required && !mapping[f.key] ? 'invalid' : ''}><option value="">— not in file —</option>{parsed.headers.map((h: string) => <option key={h} value={h}>{h}</option>)}</select></Field>)}</div>
          {kind === 'opening' && <Field label="Opening balance date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 200 }} /></Field>}
          <div className="row"><button className="btn" onClick={reset}>Back</button><Btn kind="primary" onClick={async () => { const r = await api.post<any>('/api/admin/imports/preview', { fileId: parsed.fileId, mapping }); setPv(r); setStep(3); }}>Preview</Btn></div>
        </div>}
        {step === 3 && pv && <div className="stack">
          <div className="row"><span className="badge good">{pv.ok} ready</span>{pv.failed > 0 && <span className="badge bad">{pv.failed} with errors (will be skipped)</span>}</div>
          <DataTable rows={pv.rows} rowKey={(r: any) => String(r.row)} maxHeight={420} columns={[{ key: 'row', label: 'Row', num: true }, ...Object.keys(mapping).filter((x) => mapping[x]).map((f) => ({ key: f, label: label(f), render: (r: any) => r.data[f] })), { key: 'errors', label: 'Problems', render: (r: any) => r.errors.length ? <span style={{ color: 'var(--bad)' }}>{r.errors.join('; ')}</span> : <span className="badge good">OK</span> }]} />
          <div className="row"><button className="btn" onClick={() => setStep(2)}>Back</button><Btn kind="primary" disabled={!pv.ok} onClick={async () => { const r = await api.post<any>('/api/admin/imports/commit', { fileId: parsed.fileId, mapping, date }); setResult(r); setStep(4); batches.reload(); }}>Import {pv.ok} rows</Btn></div>
        </div>}
        {step === 4 && result && <div className="stack">
          <Alert tone={result.failed ? 'warn' : 'good'}>{result.ok} imported{result.failed ? `, ${result.failed} failed` : ''}.{result.note ? ` ${result.note}.` : ''}</Alert>
          <div className="row">{result.failed > 0 && <button className="btn" onClick={() => downloadUrl(`/api/admin/imports/${result.batchId}/errors.csv`)}>Download error file</button>}<button className="btn" onClick={reset}>Import another file</button></div>
        </div>}
      </div>
      <div className="card flush"><div className="card-head"><h3>Import history</h3></div>
        <DataTable rows={batches.data ?? []} columns={[{ key: 'created_at', label: 'When', render: (b: any) => dt(b.created_at) }, { key: 'kind', label: 'Type', render: (b: any) => label(b.kind) }, { key: 'filename', label: 'File' }, { key: 'ok', label: 'Imported', num: true }, { key: 'failed', label: 'Failed', num: true }, { key: 'by_name', label: 'By' }, { key: 'status', label: 'Status' },
          { key: 'act', label: '', sort: false, render: (b: any) => <span className="row">{b.failed > 0 && <button className="btn sm" onClick={() => downloadUrl(`/api/admin/imports/${b.id}/errors.csv`)}>Errors</button>}{b.status === 'committed' && <Btn size="sm" kind="danger" onClick={async () => { try { await api.post(`/api/admin/imports/${b.id}/rollback`); toast('Rolled back', 'ok'); batches.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Roll back</Btn>}</span> }]} />
      </div>
      {!can('import.registrations') && !can('finance.import') && <p className="muted">Your role cannot import files.</p>}
    </div>
  );
}

export function Messages() {
  const { can, eventId } = useStaff();
  const [tab, setTab] = useState<'outbox' | 'templates' | 'bulk'>('outbox');
  const [status, setStatus] = useState(''); const [q, setQ] = useState('');
  const out = useAsync<any[]>(() => api.get(`/api/admin/notifications${qs({ status, q })}`), [status, q]);
  const t = useAsync<any>(() => api.get('/api/admin/templates'), []);
  const [edit, setEdit] = useState<any>(null);
  const toast = useToast();
  return (
    <div className="stack">
      <PageHead title="Messages" subtitle="Every state change sends a templated message within seconds. Edit wording, connect WhatsApp and SMS, and see what went out." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'outbox', label: 'Outbox & history' }, ...(can('templates.manage') ? [{ key: 'templates' as const, label: 'Templates' }] : []), ...(can('messages.send') ? [{ key: 'bulk' as const, label: 'Bulk send' }] : [])]} />
      {tab === 'outbox' && <>
        <div className="row"><input className="search" placeholder="Recipient or subject" value={q} onChange={(e) => setQ(e.target.value)} />{['', 'queued', 'sent', 'failed', 'bounced', 'suppressed'].map((s) => <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s ? label(s) : 'All'}</button>)}</div>
        <Alert tone="info">Messages go out within seconds, with retries, quiet hours (reminders only) and a per-minute rate limit. Without SMTP configured they are logged here instead of delivered.</Alert>
        <div className="card flush"><DataTable rows={out.data ?? []} maxHeight={640} columns={[{ key: 'created_at', label: 'Queued', render: (n: any) => dt(n.created_at) }, { key: 'channel', label: 'Channel' }, { key: 'recipient', label: 'To' }, { key: 'subject', label: 'Subject' }, { key: 'status', label: 'Status' }, { key: 'attempts', label: 'Tries', num: true }, { key: 'last_error', label: 'Note' }, { key: 'act', label: '', sort: false, render: (n: any) => <span className="row"><button className="btn sm" onClick={() => setEdit({ preview: n })}>View</button>{['failed', 'bounced', 'suppressed'].includes(n.status) && can('messages.send') && <Btn size="sm" onClick={async () => { await api.post(`/api/admin/notifications/${n.id}/retry`); out.reload(); }}>Retry</Btn>}</span> }]} /></div>
      </>}
      {tab === 'templates' && t.data && <div className="row">{(['email', 'whatsapp', 'sms'] as const).map((c) => <span key={c} className="badge"><span className={`status-dot ${t.data.channels?.[c] ? 'on' : ''}`} />{c === 'sms' ? 'SMS' : label(c)} {t.data.channels?.[c] ? 'connected' : 'not connected — messages are logged only'}</span>)}</div>}
      {tab === 'templates' && t.data && <div className="card flush"><DataTable rows={t.data.templates} rowKey={(x: any) => x.key + x.channel} onRowClick={(x) => setEdit(x)} columns={[{ key: 'key', label: 'Trigger', render: (x: any) => label(x.key) }, { key: 'channel', label: 'Channel', render: (x: any) => x.channel === 'sms' ? 'SMS' : label(x.channel) }, { key: 'subject', label: 'Subject / template', render: (x: any) => x.channel === 'email' ? x.subject : (x.provider_template ? <span className="mono small">{x.provider_template}</span> : <span className="badge warn">template name needed</span>) }, { key: 'active', label: 'Active', render: (x: any) => (x.active ? 'Yes' : 'No') }, { key: 'updated_at', label: 'Updated', render: (x: any) => dt(x.updated_at) }]} /></div>}
      {tab === 'bulk' && <BulkSend eventId={eventId} templates={t.data?.templates ?? []} />}
      {edit?.preview && <Modal title={edit.preview.subject} onClose={() => setEdit(null)}><p className="small muted">To {edit.preview.recipient} · {label(edit.preview.status)}</p><pre style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{edit.preview.body}</pre></Modal>}
      {edit && !edit.preview && <TemplateEdit tpl={edit} fields={t.data?.mergeFields ?? []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); t.reload(); toast('Template saved', 'ok'); }} />}
    </div>
  );
}

function TemplateEdit({ tpl, fields, onClose, onDone }: any) {
  const [f, setF] = useState({ subject: tpl.subject, body: tpl.body, active: !!tpl.active, provider_template: tpl.provider_template ?? '', language: tpl.language ?? 'en', params: (tpl.params ?? []).join(', ') });
  const channel = tpl.channel as string;
  const [pv, setPv] = useState<any>(null);
  const toast = useToast();
  const ask = usePrompt();
  return (
    <Modal wide title={`Template: ${label(tpl.key)} (${tpl.channel})`} onClose={onClose} footer={<>
      <Btn onClick={async () => setPv(await api.post(`/api/admin/templates/${tpl.key}/preview`, f))}>Preview</Btn>
      <Btn onClick={async () => { const r = await ask({ title: 'Send a test', fields: [{ key: 'to', label: 'Email', type: 'email', required: true }] }); if (r) { await api.post(`/api/admin/templates/${tpl.key}/test`, r); toast('Test queued', 'ok'); } }}>Send test</Btn>
      <span className="spacer" /><Btn kind="primary" onClick={async () => { await api.put(`/api/admin/templates/${tpl.key}/${tpl.channel}`, { ...f, params: f.params.split(',').map((x: string) => x.trim()).filter(Boolean) }); onDone(); }}>Save</Btn>
    </>}>
      <div className="stack">
        {channel !== 'email' && <>
          <Alert tone="info">{channel === 'whatsapp' ? 'WhatsApp business messages must use a template approved by Meta. Enter its exact name and language, and list the merge fields that fill {{1}}, {{2}}… in order.' : 'Indian SMS must use a DLT-registered template. Enter the MSG91 flow template id, and list the merge fields that fill its variables (named the same as in MSG91).'}</Alert>
          <div className="grid g3">
            <Field label={channel === 'whatsapp' ? 'Approved template name' : 'MSG91 template id'}><input value={f.provider_template} onChange={(e) => setF({ ...f, provider_template: e.target.value })} placeholder={channel === 'whatsapp' ? 'reg_allotted_v1' : '64f0…'} /></Field>
            {channel === 'whatsapp' && <Field label="Language code"><input value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} placeholder="en" /></Field>}
            <Field label="Parameters, in order" hint="comma separated merge fields"><input value={f.params} onChange={(e) => setF({ ...f, params: e.target.value })} placeholder="name, committee, portfolio" /></Field>
          </div>
        </>}
        {channel === 'email' && <Field label="Subject"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>}
        <Field label={channel === 'email' ? 'Body' : 'Preview text (shown in the outbox)'} hint={<>merge fields: {fields.map((x: string) => `{{${x}}}`).join(' ')}</>}><textarea rows={12} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>
        {pv && <div className="card" style={{ background: 'var(--surface-2)' }}><strong>{pv.subject}</strong><pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: '.5rem 0 0' }}>{pv.body}</pre></div>}
      </div>
    </Modal>
  );
}

function BulkSend({ eventId, templates }: { eventId: string; templates: any[] }) {
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [f, setF] = useState({ template: 'payment_reminder', list: 'unpaid', committee: '', payment: '' });
  const [count, setCount] = useState<number | null>(null);
  const toast = useToast();
  const body = () => ({ template: f.template, list: f.list, filters: { ...(f.committee ? { committee_short: f.committee } : {}), ...(f.payment ? { payment_status: f.payment } : {}) } });
  return (
    <div className="card stack">
      <p className="muted" style={{ margin: 0 }}>Send any template to a filtered list — for example “all unpaid delegates in UNSC”. Reminders respect quiet hours and unsubscribes.</p>
      <div className="grid g4">
        <Field label="Template"><select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })}>{[...new Set(templates.filter((t) => t.channel === 'email').map((t) => t.key))].map((k) => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
        <Field label="Audience"><select value={f.list} onChange={(e) => setF({ ...f, list: e.target.value })}><option value="unpaid">Unpaid and pending</option><option value="master">Everyone registered</option><option value="badges">Confirmed delegates</option><option value="waitlist">Waitlist</option></select></Field>
        <Field label="Committee"><select value={f.committee} onChange={(e) => setF({ ...f, committee: e.target.value })}><option value="">All</option>{(inv.data ?? []).map((c) => <option key={c.id} value={c.short}>{c.name}</option>)}</select></Field>
        <Field label="Payment status"><select value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })}><option value="">Any</option>{['pending', 'submitted', 'failed', 'paid', 'expired'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
      </div>
      <div className="row"><Btn onClick={async () => { const r = await api.post<any>(`/api/admin/events/${eventId}/bulk-message`, { ...body(), dryRun: true }); setCount(r.recipients); }}>Count recipients</Btn>{count != null && <span>{count} recipients</span>}<span className="spacer" /><Btn kind="primary" disabled={!count} onClick={async () => { const r = await api.post<any>(`/api/admin/events/${eventId}/bulk-message`, body()); toast(`${r.queued} messages queued`, 'ok'); setCount(null); }}>Send</Btn></div>
    </div>
  );
}

export function Audit() {
  const [q, setQ] = useState(''); const [entity, setEntity] = useState(''); const [action, setAction] = useState('');
  const a = useAsync<any>(() => api.get(`/api/admin/audit${qs({ q, entity, action, limit: 300 })}`), [q, entity, action]);
  const logins = useAsync<any[]>(() => api.get('/api/admin/login-log'), []);
  const [tab, setTab] = useState<'trail' | 'logins'>('trail');
  return (
    <div className="stack">
      <PageHead title="Audit trail" subtitle="Every change by every person, append-only. Rows cannot be edited or deleted."><button className="btn" onClick={() => downloadUrl('/api/admin/audit/export')}><Download className="icon" />Export CSV</button></PageHead>
      <Alert tone="info">Every action is logged with user, time, IP and before/after values. The log is append-only at the database level and cannot be switched off — Companies (Accounts) Rules, rule 3(1). Retained for at least eight financial years.</Alert>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'trail', label: `Changes${a.data ? ` (${a.data.total} total)` : ''}` }, { key: 'logins', label: 'Sign-ins' }]} />
      {tab === 'trail' && <>
        <div className="row"><input className="search" placeholder="Search values or user" value={q} onChange={(e) => setQ(e.target.value)} /><select style={{ width: 'auto' }} value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">All records</option>{['registration', 'journal_entry', 'payment_evidence', 'refund', 'expense', 'payout', 'settlement', 'event', 'organization', 'user', 'referrer', 'commission_plan', 'period', 'import_batch', 'template'].map((x) => <option key={x} value={x}>{label(x)}</option>)}</select><input placeholder="Action starts with… (e.g. journal.)" value={action} onChange={(e) => setAction(e.target.value)} style={{ maxWidth: 240 }} /></div>
        <div className="card flush">{!a.data ? <Loading /> : <DataTable rows={a.data.rows} maxHeight={700} columns={[{ key: 'at', label: 'When', render: (r: any) => dt(r.at) }, { key: 'user_label', label: 'Who' }, { key: 'ip', label: 'IP' }, { key: 'action', label: 'Action' }, { key: 'entity', label: 'Record', render: (r: any) => <>{label(r.entity)} <span className="mono small faint">{(r.entity_id ?? '').slice(0, 8)}</span></> }, { key: 'change', label: 'Before → after', sort: false, render: (r: any) => <code className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', display: 'block', maxWidth: 520 }}>{r.before ? `${r.before}\n→ ` : ''}{r.after}</code> }]} />}</div>
      </>}
      {tab === 'logins' && <div className="card flush"><DataTable rows={logins.data ?? []} columns={[{ key: 'at', label: 'When', render: (r: any) => dt(r.at) }, { key: 'email', label: 'Email' }, { key: 'ip', label: 'IP' }, { key: 'ua', label: 'Device' }, { key: 'ok', label: 'Result', render: (r: any) => (r.ok ? <span className="badge good">OK</span> : <span className="badge bad">Failed</span>) }]} /></div>}
    </div>
  );
}

export { Status };
