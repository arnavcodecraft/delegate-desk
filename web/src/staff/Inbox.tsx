import { useState } from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import { api } from '../api';
import { dt } from '../format';
import { Btn, Loading, Segmented, useAsync, useToast } from '../ui';
import { PageHead } from './Shell';

/** The DelegateDesk team's inbox: Contact page messages and service requests. */
export function PlatformInbox() {
  const [status, setStatus] = useState<'new' | 'handled' | ''>('new');
  const d = useAsync<any>(() => api.get(`/api/admin/platform-inbox${status ? `?status=${status}` : ''}`), [status]);
  const toast = useToast();
  return (
    <div className="stack">
      <PageHead title="Inbox" subtitle="Messages from the Contact page and requests for services (mentorship, courses, classes, logistics, EB support, consultancy). Reply by email; the sender already got an acknowledgement." />
      <Segmented value={status} onChange={setStatus} options={[{ value: 'new', label: `New${d.data?.unread ? ` (${d.data.unread})` : ''}` }, { value: 'handled', label: 'Handled' }, { value: '', label: 'All' }]} />
      {!d.data ? <Loading /> : !d.data.messages.length ? <div className="card"><p className="muted" style={{ margin: 0 }}><InboxIcon className="icon" /> Nothing here.</p></div>
        : d.data.messages.map((m: any) => (
          <div key={m.id} className="card stack tight" style={{ opacity: m.status === 'handled' ? 0.65 : 1 }}>
            <div className="row between"><span><span className={`badge ${m.kind === 'service' ? 'info' : ''}`}>{m.kind === 'service' ? 'Service' : 'Contact'}</span> <b>{m.topic_label}</b></span><span className="small muted">{dt(m.created_at)}</span></div>
            <div><b>{m.name}</b> · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic_label}`)}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ''}{m.organisation ? ` · ${m.organisation}` : ''}</div>
            {Object.keys(m.details).length > 0 && <div className="small muted">{Object.entries(m.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>}
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.message}</div>
            <div className="row">
              <a className="btn sm primary" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.topic_label}`)}`}>Reply by email</a>
              <Btn size="sm" onClick={async () => { await api.post(`/api/admin/platform-inbox/${m.id}`, { handled: m.status !== 'handled' }); toast(m.status === 'handled' ? 'Moved back to new' : 'Marked as handled', 'ok'); d.reload(); }}>{m.status === 'handled' ? 'Mark as new' : 'Mark as handled'}</Btn>
            </div>
          </div>))}
    </div>
  );
}
