import { useState } from 'react';
import { Hash, Users, Flag, Settings2 } from 'lucide-react';
import { api } from '../api';
import { dt } from '../format';
import { Alert, Btn, Loading, Switch, Tabs, useAsync, useToast } from '../ui';
import { PageHead, useStaff } from './Shell';
import { ChatPane, type ChatMessage } from '../chat/ChatPane';

/** Conference chat for the team: read and post in the group channels, remove messages, handle reports, switch chat on or off. */
export function ChatAdmin() {
  const { eventId, can, me } = useStaff();
  const toast = useToast();
  const data = useAsync<any>(() => api.get(`/api/admin/events/${eventId}/chat`), [eventId]);
  const [tab, setTab] = useState<'chat' | 'reports' | 'settings'>('chat');
  const [active, setActive] = useState<string | null>(null);
  if (!data.data) return <Loading />;
  const d = data.data;
  const channel = active ?? d.channels[0]?.key ?? null;
  const ch = d.channels.find((c: any) => c.key === channel);
  const admin = can('event.config');
  const base = `/api/admin/events/${eventId}/chat`;
  return (
    <div className="stack">
      <PageHead title="Chat" subtitle="Delegates talk in an All committees group, a group for each committee, and private messages. You can post in the groups and remove messages; private messages are only visible to you when reported." />
      {!d.settings.enabled && <Alert tone="warn">Chat is turned off: delegates don't see it. {admin && <>Turn it on under <b>Settings</b> below.</>}</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'chat', label: 'Groups' }, ...(admin ? [{ key: 'reports' as const, label: `Reports${d.reports ? ` (${d.reports})` : ''}` }, { key: 'settings' as const, label: 'Settings' }] : [])]} />
      {tab === 'chat' && (!channel ? <Alert tone="info">Add committees first; each one gets its own group.</Alert> : <div className="ch-card ch-shell staff">
        <aside className="ch-side">
          <div className="ch-group-label">Groups</div>
          {d.channels.map((c: any) => <button key={c.key} className={`ch-item ${channel === c.key ? 'on' : ''}`} onClick={() => setActive(c.key)}>{c.key === 'all' ? <Users size={16} /> : <Hash size={16} />}<span>{c.label}</span><span className="ch-count">{c.count || ''}</span></button>)}
        </aside>
        <div className="ch-main">
          <ChatPane key={channel} channel={channel} title={ch?.label ?? ''} subtitle={channel === 'all' ? 'Every delegate at the conference' : 'Delegates in this committee'} meId={me.user!.id}
            load={(c, since) => api.get<ChatMessage[]>(`${base}/messages?channel=${encodeURIComponent(c)}${since ? `&since=${encodeURIComponent(since)}` : ''}`)}
            post={async (body) => { await api.post(base, { channel, body }); }}
            onRemove={async (m) => { if (!confirm(`Remove this message from ${m.sender_name}?`)) return; try { await api.post(`${base}/messages/${m.id}/remove`); toast('Removed', 'ok'); } catch (e: any) { toast(e.message, 'bad'); } }} />
        </div>
      </div>)}
      {tab === 'reports' && <Reports base={base} onChange={data.reload} />}
      {tab === 'settings' && <div className="card stack">
        <h3><Settings2 className="icon" /> Chat settings</h3>
        <Switch checked={d.settings.enabled} onChange={async (on) => { await api.post(`${base}/settings`, { enabled: on, dms: d.settings.dms }); toast(on ? 'Chat is on' : 'Chat is off', 'ok'); data.reload(); }} label="Conference chat (All committees and committee groups)" />
        <Switch checked={d.settings.dms} onChange={async (on) => { await api.post(`${base}/settings`, { enabled: d.settings.enabled, dms: on }); toast(on ? 'Private messages are on' : 'Private messages are off', 'ok'); data.reload(); }} label="Private messages between delegates" />
        <p className="small muted" style={{ margin: 0 }}>Many delegates are under 18. If your school partners prefer, keep private messages off: delegates can still talk in the groups, where your team can see everything.</p>
      </div>}
    </div>
  );
}

function Reports({ base, onChange }: { base: string; onChange: () => void }) {
  const list = useAsync<any[]>(() => api.get(`${base}/reports`), [base]);
  const toast = useToast();
  if (!list.data) return <Loading />;
  if (!list.data.length) return <div className="card"><p className="muted" style={{ margin: 0 }}><Flag className="icon" /> No reported messages.</p></div>;
  return <div className="stack">{list.data.map((r) => (
    <div key={r.id} className="card stack tight" style={{ opacity: r.resolved_at ? 0.6 : 1 }}>
      <div className="row between"><b>{r.sender_name}</b><span className="small muted">{r.private ? 'Private message' : 'Group'} · sent {dt(r.sent_at)}</span></div>
      <div className="ch-reported">{r.deleted_at ? <i>Removed</i> : r.body}</div>
      <div className="small muted">Reported by {r.reporter} {dt(r.created_at)}{r.reason ? `: “${r.reason}”` : ''}</div>
      {!r.resolved_at && <div className="row">
        {!r.deleted_at && <Btn size="sm" kind="danger" onClick={async () => { await api.post(`${base}/messages/${r.message_id}/remove`); toast('Message removed', 'ok'); list.reload(); }}>Remove message</Btn>}
        <Btn size="sm" onClick={async () => { await api.post(`${base}/reports/${r.id}/resolve`); list.reload(); onChange(); }}>Mark as handled</Btn>
      </div>}
    </div>))}</div>;
}
