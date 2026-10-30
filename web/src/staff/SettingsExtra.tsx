import { useState } from 'react';
import { Mail, MessageCircle, Smartphone, Sparkles, ScanText, ShieldCheck, Sheet, DatabaseBackup, CreditCard, Download, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { api, qs } from '../api';
import { dt, label } from '../format';
import { Alert, Btn, DataTable, Field, Loading, Modal, Status, useAsync, useToast, usePrompt, downloadUrl } from '../ui';
import { useStaff } from './Shell';

const ICONS: Record<string, any> = { email: Mail, whatsapp: MessageCircle, sms: Smartphone, ai: Sparkles, ocr: ScanText, clamav: ShieldCheck, sheets: Sheet, backups: DatabaseBackup, razorpay: CreditCard, cashfree: CreditCard };
const NAMES: Record<string, string> = { email: 'Email (SMTP)', whatsapp: 'WhatsApp Business', sms: 'SMS (MSG91)', ai: 'AI assistance', ocr: 'Screenshot & bill reading', clamav: 'Virus scanning (ClamAV)', sheets: 'Google Sheets', backups: 'Encrypted backups', razorpay: 'Razorpay', cashfree: 'Cashfree' };

/** What is connected. Credentials live in environment variables, never in the database. */
export function Integrations() {
  const i = useAsync<any>(() => api.get('/api/admin/integrations'), []);
  if (!i.data) return <Loading />;
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Keys and secrets are set as environment variables on the server (see <span className="mono">.env.example</span>), so they never sit in the database or the audit log.</p>
      <div className="grid g2">
        {Object.entries(i.data).map(([k, v]: any) => {
          const Icon = ICONS[k] ?? ShieldCheck;
          return (
            <div key={k} className="card row" style={{ alignItems: 'flex-start', gap: '.85rem' }}>
              <span className="avatar" style={{ borderRadius: 10, background: v.on ? 'var(--good-soft)' : 'var(--surface-2)', color: v.on ? 'var(--good)' : 'var(--text-3)' }}><Icon className="icon" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row between"><strong>{NAMES[k] ?? label(k)}</strong>{v.on ? <span className="badge good">Connected</span> : <span className="badge">Off</span>}</div>
                <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{v.detail}</div>
                {v.webhook && <div className="small faint mono" style={{ overflowWrap: 'anywhere' }}>Webhook: {v.webhook}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SheetsSync() {
  const { eventId } = useStaff();
  const d = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/sheet-syncs`), [eventId]);
  const lists = useAsync<any[]>(() => api.get('/api/admin/lists'), []);
  const inv = useAsync<any[]>(() => api.get(`/api/admin/events/${eventId}/inventory`), [eventId]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ list_kind: 'master', committee_id: '', spreadsheet_id: '', sheet_name: '', interval_minutes: '15', include_contacts: false, include_minors: false });
  const toast = useToast();
  if (!d.data) return <Loading />;
  const needsCommittee = (lists.data ?? []).find((l) => l.key === f.list_kind)?.needsCommittee;
  return (
    <div className="stack">
      {!d.data.serviceAccount ? <Alert tone="warn">Google Sheets is not connected. Create a Google Cloud service account with the Sheets API enabled and set <span className="mono">GOOGLE_SERVICE_ACCOUNT_JSON</span>.</Alert>
        : <Alert tone="info">Share each spreadsheet with <strong className="mono">{d.data.serviceAccount}</strong> as an editor. Lists refresh automatically; contact details and delegates under 18 are left out unless you tick them.</Alert>}
      <div className="row"><Btn kind="primary" icon={Plus} onClick={() => setAdding(true)} disabled={!d.data.serviceAccount}>Add a live sheet</Btn></div>
      <div className="card flush"><DataTable rows={d.data.syncs} empty="No sheets yet" columns={[
        { key: 'list_kind', label: 'List', render: (x: any) => <>{(lists.data ?? []).find((l) => l.key === x.list_kind)?.title ?? x.list_kind}{x.committee ? <div className="small faint">{x.committee}</div> : null}</> },
        { key: 'sheet_name', label: 'Tab', render: (x: any) => <a href={`https://docs.google.com/spreadsheets/d/${x.spreadsheet_id}`} target="_blank" rel="noreferrer">{x.sheet_name}</a> },
        { key: 'interval_minutes', label: 'Every', render: (x: any) => `${x.interval_minutes} min` },
        { key: 'last_synced_at', label: 'Last sync', render: (x: any) => x.last_error ? <span className="badge bad" title={x.last_error}>Failed</span> : x.last_synced_at ? <>{dt(x.last_synced_at)} · {x.last_rows} rows</> : 'Not yet' },
        { key: 'act', label: '', sort: false, render: (x: any) => <span className="row"><Btn size="sm" icon={RefreshCw} onClick={async () => { try { const r = await api.post<any>(`/api/admin/sheet-syncs/${x.id}/run`); toast(`${r.rows} rows written`, 'ok'); } catch (e: any) { toast(e.message, 'bad'); } d.reload(); }}>Sync now</Btn><Btn size="sm" kind="danger" icon={Trash2} onClick={async () => { await api.del(`/api/admin/sheet-syncs/${x.id}`); d.reload(); }} /></span> },
      ]} /></div>
      {d.data.syncs.filter((x: any) => x.last_error).map((x: any) => <Alert key={x.id} tone="bad"><strong>{x.sheet_name}:</strong> {x.last_error}</Alert>)}
      {adding && <Modal title="Add a live sheet" onClose={() => setAdding(false)} footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button><Btn kind="primary" onClick={async () => { try { const r = await api.post<any>(`/api/admin/events/${eventId}/sheet-syncs`, { ...f, interval_minutes: Number(f.interval_minutes) }); await api.post(`/api/admin/sheet-syncs/${r.id}/run`).catch((e) => toast(e.message, 'bad')); setAdding(false); d.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Add and sync</Btn></>}>
        <div className="stack">
          <Field label="Spreadsheet link or id"><input value={f.spreadsheet_id} onChange={(e) => setF({ ...f, spreadsheet_id: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" /></Field>
          <div className="grid g2">
            <Field label="List"><select value={f.list_kind} onChange={(e) => setF({ ...f, list_kind: e.target.value })}>{(lists.data ?? []).map((l) => <option key={l.key} value={l.key}>{l.title}</option>)}</select></Field>
            {needsCommittee && <Field label="Committee"><select value={f.committee_id} onChange={(e) => setF({ ...f, committee_id: e.target.value })}><option value="">Choose…</option>{(inv.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
            <Field label="Tab name" hint="created if missing"><input value={f.sheet_name} onChange={(e) => setF({ ...f, sheet_name: e.target.value })} placeholder="Delegates" /></Field>
            <Field label="Refresh every (minutes)"><input type="number" min={5} value={f.interval_minutes} onChange={(e) => setF({ ...f, interval_minutes: e.target.value })} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={f.include_contacts} onChange={(e) => setF({ ...f, include_contacts: e.target.checked })} />Include email and phone numbers</label>
          <label className="check"><input type="checkbox" checked={f.include_minors} onChange={(e) => setF({ ...f, include_minors: e.target.checked })} />Include delegates under 18</label>
        </div>
      </Modal>}
    </div>
  );
}

export function Backups() {
  const b = useAsync<any>(() => api.get('/api/admin/backups'), []);
  const { can, eventId } = useStaff();
  const toast = useToast();
  if (!b.data) return <Loading />;
  return (
    <div className="stack">
      {can('event.config', 'settings.org') && eventId && <div className="card row" style={{ gap: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240 }}><h3 style={{ margin: 0 }}>Offline copy</h3><p className="small muted" style={{ margin: '.25rem 0 0' }}>Download this conference's delegates, seats, committees, payments and applications as one Excel file. It opens without DelegateDesk, so keep a copy on a laptop for the conference days in case the internet or the site goes down. It contains personal data: keep it private.</p></div>
        <a className="btn primary" href={`/api/admin/events/${eventId}/offline-copy.xlsx`} download>Download offline copy</a>
      </div>}
      <Alert tone={b.data.keyConfigured ? 'info' : 'warn'}>A full encrypted backup (database and uploaded files, AES-256-GCM) runs daily and is restore-tested straight away: decrypted, opened, integrity-checked and its row counts compared. The newest {b.data.keep} are kept. {b.data.keyConfigured ? 'The key is set in BACKUP_KEY — store a copy offline; without it backups cannot be restored.' : 'Set BACKUP_KEY (32 random bytes) for production; until then a key derived from APP_SECRET is used.'} To restore: <span className="mono">npm run restore -- file.ddbak</span>.</Alert>
      {can('settings.org') && <div><Btn kind="primary" icon={DatabaseBackup} onClick={async () => { const r = await api.post<any>('/api/admin/backups'); toast(r.verify.startsWith('ok') ? 'Backup created and verified' : `Backup created but the restore test failed: ${r.verify}`, r.verify.startsWith('ok') ? 'ok' : 'bad'); b.reload(); }}>Back up now</Btn></div>}
      <div className="card flush"><DataTable rows={b.data.backups} empty="No backups yet" columns={[
        { key: 'created_at', label: 'Created', render: (x: any) => dt(x.created_at) },
        { key: 'size', label: 'Size', num: true, render: (x: any) => `${(x.size / 1024 / 1024).toFixed(2)} MB` },
        { key: 'counts', label: 'Contents', sort: false, render: (x: any) => <span className="small">{x.counts.registration} delegates · {x.counts.journal_entry} journals · {x.counts.audit_log} audit rows</span> },
        { key: 'verify_result', label: 'Restore test', render: (x: any) => !x.verify_result ? <span className="badge">Not run</span> : x.verify_result === 'pruned' ? <span className="badge">Removed</span> : x.verify_result.startsWith('ok') ? <span className="badge good" title={x.verify_result}>Passed {dt(x.verified_at)}</span> : <span className="badge bad" title={x.verify_result}>Failed</span> },
        { key: 'act', label: '', sort: false, render: (x: any) => x.verify_result !== 'pruned' && <span className="row"><Btn size="sm" onClick={async () => { const r = await api.post<any>(`/api/admin/backups/${x.id}/verify`); toast(r.result, r.result.startsWith('ok') ? 'ok' : 'bad'); b.reload(); }}>Test restore</Btn>{can('settings.org') && <button className="btn sm" onClick={() => downloadUrl(`/api/admin/backups/${x.id}/download`)}><Download className="icon" />Download</button>}</span> },
      ]} /></div>
    </div>
  );
}

export function DataProtection() {
  const { eventId } = useStaff();
  const er = useAsync<any[]>(() => api.get('/api/admin/erasure-requests'), []);
  const br = useAsync<any[]>(() => api.get('/api/admin/breaches'), []);
  const [edit, setEdit] = useState<any>(null);
  const toast = useToast();
  const ask = usePrompt();
  return (
    <div className="stack">
      <h3 style={{ margin: 0 }}>Erasure requests</h3>
      <p className="muted small" style={{ margin: 0 }}>Delegates request erasure from their page. Erasing wipes personal data but keeps what invoices and the books must hold for eight years.</p>
      <div className="card flush"><DataTable rows={er.data ?? []} empty="No erasure requests" columns={[
        { key: 'requested_at', label: 'Requested', render: (x: any) => dt(x.requested_at) }, { key: 'full_name', label: 'Delegate', render: (x: any) => <>{x.full_name}<div className="small faint">{x.ref}</div></> }, { key: 'note', label: 'Note' }, { key: 'status', label: 'Status', render: (x: any) => <Status value={x.status === 'done' ? 'processed' : x.status} /> },
        { key: 'act', label: '', sort: false, render: (x: any) => x.status === 'pending' && <span className="row">
          <Btn size="sm" kind="danger" onClick={async () => { if (await ask({ title: `Erase ${x.full_name}?`, message: 'Personal data is wiped now. A paid registration must be refunded and cancelled first.', danger: true, confirm: 'Erase' })) { try { await api.post(`/api/admin/registrations/${x.registration_id}/erase`); toast('Erased', 'ok'); er.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Erase</Btn>
          <Btn size="sm" onClick={async () => { const r = await ask({ title: 'Decline erasure', fields: [{ key: 'reason', label: 'Reason (sent to the delegate if they ask)', required: true }] }); if (r) { await api.post(`/api/admin/erasure-requests/${x.id}/decline`, r); er.reload(); } }}>Decline</Btn>
        </span> },
      ]} /></div>
      <div className="row between"><h3 style={{ margin: 0 }}>Breach register</h3><Btn icon={Plus} onClick={() => setEdit({ title: '', description: '', detected_at: new Date().toISOString().slice(0, 16), data_affected: '', affected_count: '', containment: '' })}>Log an incident</Btn></div>
      <p className="muted small" style={{ margin: 0 }}>Record any personal-data breach as soon as it is found: what happened, the data involved, containment, and when the Data Protection Board and affected people were told.</p>
      <div className="card flush"><DataTable rows={br.data ?? []} empty="No incidents recorded" onRowClick={(x) => setEdit({ ...x, detected_at: x.detected_at?.slice(0, 16) })} columns={[
        { key: 'detected_at', label: 'Detected', render: (x: any) => dt(x.detected_at) }, { key: 'title', label: 'Incident' }, { key: 'affected_count', label: 'Affected', num: true },
        { key: 'status', label: 'Status', render: (x: any) => <span className={`badge ${x.status === 'closed' ? 'good' : x.status === 'contained' ? 'info' : 'bad'}`}>{label(x.status)}</span> },
        { key: 'board_notified_at', label: 'Board told', render: (x: any) => x.board_notified_at ? dt(x.board_notified_at) : <span className="badge warn">Not yet</span> },
        { key: 'people_notified_at', label: 'People told', render: (x: any) => x.people_notified_at ? `${x.people_notified_count} · ${dt(x.people_notified_at)}` : '—' },
      ]} /></div>
      {edit && <Modal wide title={edit.id ? edit.title : 'Log an incident'} onClose={() => setEdit(null)} footer={<>
        {edit.id && <Btn onClick={async () => { const r = await ask({ title: 'Notify affected delegates', message: 'Plain language: what happened, what data, what you are doing, what they should do. The grievance contact is added.', fields: [{ key: 'message', label: 'Notice', type: 'textarea', required: true }, { key: 'refs', label: 'Delegate IDs (comma separated) — leave empty for everyone in this event' }], confirm: 'Send notice', danger: true }); if (r) { try { const x = await api.post<any>(`/api/admin/breaches/${edit.id}/notify`, { message: r.message, refs: r.refs ? r.refs.split(',').map((s) => s.trim()).filter(Boolean) : [], event_id: eventId }); toast(`${x.notified} notices queued`, 'ok'); br.reload(); } catch (e: any) { toast(e.message, 'bad'); } } }}>Notify affected people</Btn>}
        <span className="spacer" />
        <Btn kind="primary" onClick={async () => { try { await api.post('/api/admin/breaches', { ...edit, detected_at: edit.detected_at ? new Date(edit.detected_at).toISOString() : undefined }); setEdit(null); br.reload(); } catch (e: any) { toast(e.message, 'bad'); } }}>Save</Btn>
      </>}>
        <div className="stack">
          <div className="grid g2">
            <Field label="Title"><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Detected at"><input type="datetime-local" value={edit.detected_at ?? ''} onChange={(e) => setEdit({ ...edit, detected_at: e.target.value })} /></Field>
            <Field label="Data affected"><input value={edit.data_affected ?? ''} onChange={(e) => setEdit({ ...edit, data_affected: e.target.value })} placeholder="e.g. names, emails, phone numbers" /></Field>
            <Field label="People affected (approx.)"><input type="number" value={edit.affected_count ?? ''} onChange={(e) => setEdit({ ...edit, affected_count: e.target.value })} /></Field>
          </div>
          <Field label="What happened"><textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <Field label="Containment and next steps"><textarea value={edit.containment ?? ''} onChange={(e) => setEdit({ ...edit, containment: e.target.value })} /></Field>
          {edit.id && <div className="row">
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="open">Open</option><option value="contained">Contained</option><option value="closed">Closed</option></select></Field>
            {!edit.board_notified_at && <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!edit.board_notified} onChange={(e) => setEdit({ ...edit, board_notified: e.target.checked })} />Data Protection Board has been informed</label>}
          </div>}
        </div>
      </Modal>}
    </div>
  );
}

export { qs };
